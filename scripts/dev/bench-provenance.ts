/**
 * How expensive is deriving recordPath() at LokDhaba scale?
 *
 * The path marker is derived rather than stored, which was the right call for
 * honesty: a column with a default would have made every pre-existing row
 * claim a path nobody verified. The cost of that choice is a lookup per
 * rendered record, and LokDhaba is hundreds of thousands of constituency rows.
 * This measures the cost BEFORE the ingest, so a decision to store or keep
 * deriving is made on numbers rather than on nerves.
 *
 * It measures and nothing else. Synthetic rows go into record_provenance only,
 * which needs no parent rows because the table is polymorphic, and every one
 * of them is deleted again at the end.
 *
 * Run: BENCH_SCALE=300000 npx tsx scripts/dev/bench-provenance.ts
 */
import "dotenv/config";
import { v7 as uuidv7 } from "uuid";

const SCALE = Number(process.env.BENCH_SCALE ?? 300_000);
const PAGE_SIZES = [50, 200, 500];
const RUNS = 12;
const MARKER = "bench-provenance-synthetic";

const ms = (start: bigint) => Number(process.hrtime.bigint() - start) / 1e6;
const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length * p) / 100))];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("[bench] DATABASE_URL not set — skipping.");
    return;
  }
  const { db } = await import("../../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const { provenanceFor } = await import("../../src/lib/db/queries/provenance");

  const datasetId = uuidv7();
  await db.execute(sql`
    INSERT INTO datasets (id, slug, name, publisher, version, licence, retrieved_on, upstream_url, curator, notes)
    VALUES (${datasetId}, ${MARKER}, 'Synthetic benchmark', 'Abhilekh', 'unversioned',
            'n/a', CURRENT_DATE, 'https://example.invalid/bench', 'bench', ${MARKER})
  `);

  console.log(`[bench] inserting ${SCALE.toLocaleString()} synthetic provenance rows...`);
  const t0 = process.hrtime.bigint();
  await db.execute(sql`
    INSERT INTO record_provenance (subject_type, subject_id, dataset_id, upstream_id, ingested_on)
    SELECT 'indicator_value', ('bench-' || g)::text, ${datasetId}, ('row ' || g)::text, CURRENT_DATE
      FROM generate_series(1, ${SCALE}) g
  `);
  console.log(`[bench] inserted in ${(ms(t0) / 1000).toFixed(1)}s`);
  // Fresh stats, as production would have them: without this the planner runs
  // on pre-insert statistics and the measurement is of a state autovacuum
  // would have already repaired.
  await db.execute(sql`ANALYZE record_provenance`);

  const counts = await db.execute(sql`
    SELECT (SELECT count(*) FROM record_provenance) AS prov,
           (SELECT count(*) FROM revisions) AS revs
  `);
  console.log("[bench] table sizes:", JSON.stringify(counts.rows[0]));

  for (const size of PAGE_SIZES) {
    const times: number[] = [];
    for (let run = 0; run < RUNS; run++) {
      // A different window each run, so this measures the query rather than
      // one lucky set of cached pages.
      const offset = 1 + run * size;
      const ids = Array.from({ length: size }, (_, i) => `bench-${offset + i}`);
      const t = process.hrtime.bigint();
      const got = await provenanceFor("indicator_value", ids);
      const took = ms(t);
      if (got.size !== size) throw new Error(`expected ${size} rows, got ${got.size}`);
      if (run > 1) times.push(took); // first two warm the pool
    }
    console.log(
      `[bench] page of ${String(size).padStart(3)} records: ` +
        `p50 ${pct(times, 50).toFixed(1)}ms  p95 ${pct(times, 95).toFixed(1)}ms  ` +
        `max ${Math.max(...times).toFixed(1)}ms`,
    );
  }

  // Which half costs what: the provenance join, or the revisions lookup whose
  // entity_id::text cast cannot use an index on entity_id.
  const ids = Array.from({ length: 200 }, (_, i) => `bench-${i + 1}`);
  const joined = ids.join("\u0001");
  const parts: Array<[string, ReturnType<typeof sql>]> = [
    [
      "provenance join",
      sql`SELECT p.subject_id FROM record_provenance p JOIN datasets d ON d.id = p.dataset_id
           WHERE p.subject_type = 'indicator_value'
             AND p.subject_id = ANY(string_to_array(${joined}, chr(1)))`,
    ],
    [
      "revisions lookup (entity_id::text cast)",
      sql`SELECT DISTINCT entity_id::text AS id FROM revisions
           WHERE status = 'approved' AND entity_id::text = ANY(string_to_array(${joined}, chr(1)))`,
    ],
  ];
  for (const [label, q] of parts) {
    const times: number[] = [];
    for (let run = 0; run < RUNS; run++) {
      const t = process.hrtime.bigint();
      await db.execute(q);
      if (run > 1) times.push(ms(t));
    }
    console.log(
      `[bench] ${label}: p50 ${pct(times, 50).toFixed(1)}ms  p95 ${pct(times, 95).toFixed(1)}ms`,
    );
  }

  const provPlan = await db.execute(sql`
    EXPLAIN ANALYZE
    SELECT p.subject_id FROM record_provenance p JOIN datasets d ON d.id = p.dataset_id
     WHERE p.subject_type = 'indicator_value'
       AND p.subject_id = ANY(string_to_array(${joined}, chr(1)))
  `);
  console.log("[bench] provenance query plan:");
  for (const r of provPlan.rows as Array<Record<string, string>>) {
    console.log("   " + Object.values(r)[0]);
  }

  const plan = await db.execute(sql`
    EXPLAIN ANALYZE SELECT DISTINCT entity_id::text AS id FROM revisions
     WHERE status = 'approved' AND entity_id::text = ANY(string_to_array(${joined}, chr(1)))
  `);
  console.log("[bench] revisions query plan:");
  for (const r of plan.rows as Array<Record<string, string>>) {
    console.log("   " + Object.values(r)[0]);
  }

  console.log("[bench] cleaning up...");
  await db.execute(sql`DELETE FROM record_provenance WHERE dataset_id = ${datasetId}`);
  await db.execute(sql`DELETE FROM datasets WHERE slug = ${MARKER}`);
  const left = await db.execute(sql`SELECT count(*) AS n FROM record_provenance`);
  console.log("[bench] provenance rows remaining:", JSON.stringify(left.rows[0]));
  process.exit(0);
}

main().catch((e) => {
  console.error("[bench] FAILED:", e);
  process.exit(1);
});
