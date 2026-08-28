// Provenance-query benchmark, re-run on REAL data after the D3 insert and
// ANALYZE — the recordPath amendment said the original query shape plus
// fresh statistics beats the VALUES-join rewrite; this measures that claim
// against the archive as it actually stands, not a synthetic table.
import "dotenv/config";

async function main() {
  const { db } = await import("../../src/lib/db");
  const { sql } = await import("drizzle-orm");

  const idsRes = await db.execute(sql`SELECT id FROM elections WHERE deleted_at IS NULL`);
  const ids = (idsRes.rows as Array<{ id: string }>).map((r) => r.id);
  const joined = ids.join("\u0001");
  const provCount = (await db.execute(sql`SELECT count(*)::int AS n FROM record_provenance`)).rows[0] as { n: number };
  console.log(`elections: ${ids.length}; record_provenance rows: ${provCount.n}`);

  const shapes: Record<string, () => Promise<unknown>> = {
    // The shape provenanceFor ships today (chr(1)-joined ANY).
    original: () =>
      db.execute(sql`
        SELECT p.subject_id, p.upstream_id, d.slug
          FROM record_provenance p
          JOIN datasets d ON d.id = p.dataset_id
         WHERE p.subject_type = 'election'
           AND p.subject_id = ANY(string_to_array(${joined}, chr(1)))
      `),
    // The rejected rewrite: an unnest/VALUES-style join.
    "values-join": () =>
      db.execute(sql`
        SELECT p.subject_id, p.upstream_id, d.slug
          FROM (SELECT unnest(string_to_array(${joined}, chr(1))) AS id) v
          JOIN record_provenance p ON p.subject_id = v.id AND p.subject_type = 'election'
          JOIN datasets d ON d.id = p.dataset_id
      `),
  };

  const REPS = 300;
  for (const [name, run] of Object.entries(shapes)) {
    await run(); // warm
    const times: number[] = [];
    for (let i = 0; i < REPS; i++) {
      const t0 = performance.now();
      await run();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p = (q: number) => times[Math.floor(times.length * q)].toFixed(2);
    console.log(`${name}: p50 ${p(0.5)}ms  p95 ${p(0.95)}ms  (${REPS} reps, ${ids.length} ids)`);
  }
  process.exit(0);
}
main();
