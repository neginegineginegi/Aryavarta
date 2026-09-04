/**
 * Step 0 of docs/PRODUCTION_RUNBOOK.md, in check-only mode.
 *
 *   pnpm tsx scripts/stage2-preflight.ts
 *
 * Answers one question — "would an insert be allowed to run right now, and
 * if not, what is blocking it?" — and answers it by calling the SAME gate
 * functions the inserts call, never a re-implementation: a preflight that
 * checks something subtly different from the real gate is worse than none.
 *
 * It writes nothing, anywhere. The deploy-code gate needs only git, so it
 * answers even with no database configured; the schema and backup gates
 * report as "not checked" without DATABASE_URL rather than pretending to
 * pass. Exit 0 when every applicable gate passes, 1 when any blocks.
 */
import "dotenv/config";

import { dbLabelOf, requireDeployedCode, requireFreshVerifiedBackup, requireSchemaCapability } from "./stage2-common";

type Result = { gate: string; state: "PASS" | "BLOCKED" | "NOT CHECKED"; detail: string };

/** The gates take a `fail` that never returns; here it throws so the
 *  preflight can report every gate instead of stopping at the first. */
const throwFail = (msg: string): never => {
  throw new Error(msg);
};

async function check(gate: string, fn: () => void | Promise<void>): Promise<Result> {
  try {
    await fn();
    return { gate, state: "PASS", detail: "" };
  } catch (e) {
    return { gate, state: "BLOCKED", detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * What is already in the database this run is pointed at.
 *
 * More than one Vercel project builds this repository, each with its own
 * DATABASE_URL, so "the gates pass" does not answer the question that
 * actually matters: is this the database the site serves? Nothing in an
 * insert can tell — it would succeed completely into the wrong one. So the
 * preflight prints counts the reader can check against the live site
 * (parties and states on /browse, elections on the landing map, members on
 * /rajya-sabha) and the dataset slugs already ingested, which are the
 * sharpest signal of all: two databases rarely hold the same ingest history.
 */
async function fingerprint(): Promise<string[]> {
  const { db } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const lines: string[] = [];

  const count = async (table: string): Promise<string> => {
    try {
      const r = await db.execute(sql`SELECT count(*)::int AS n FROM ${sql.raw(`"${table}"`)}`);
      return String((r.rows[0] as { n: number }).n);
    } catch {
      return "table absent";
    }
  };

  for (const table of ["states", "parties", "elections", "terms", "orgs", "funding_transactions", "rs_members", "rs_terms"]) {
    lines.push(`  ${table.padEnd(22)} ${await count(table)}`);
  }
  try {
    const ds = await db.execute(sql`SELECT slug, retrieved_on::text AS on FROM datasets ORDER BY slug`);
    const rows = ds.rows as Array<{ slug: string; on: string }>;
    lines.push(`  datasets ingested      ${rows.length === 0 ? "none" : rows.length}`);
    for (const r of rows) lines.push(`      ${r.slug} (retrieved ${r.on})`);
  } catch {
    lines.push("  datasets ingested      table absent");
  }
  return lines;
}

async function main() {
  const url = process.env.DATABASE_URL;
  const results: Result[] = [];

  console.log("[preflight] step 0, check-only — nothing is written by this run.\n");

  results.push(await check("deployed code (origin/main carries the renderer)", () => requireDeployedCode(throwFail)));

  if (!url) {
    const why = "DATABASE_URL is not set, so this run cannot say anything about a database. Run it from the checkout whose .env holds the target credentials.";
    results.push({ gate: "schema (this database carries the migration)", state: "NOT CHECKED", detail: why });
    results.push({ gate: "backup (a verified restore within 24h)", state: "NOT CHECKED", detail: why });
  } else {
    results.push(await check("schema (this database carries the migration)", () => requireSchemaCapability(throwFail)));
    results.push(await check("backup (a verified restore within 24h)", () => requireFreshVerifiedBackup(dbLabelOf(url), throwFail)));
  }

  console.log(`\n[preflight] ${url ? `target database: ${dbLabelOf(url)}` : "no database configured"}`);
  for (const r of results) {
    console.log(`\n  ${r.state.padEnd(11)} ${r.gate}`);
    if (r.detail) for (const line of r.detail.split("\n")) console.log(`              ${line}`);
  }

  if (url) {
    console.log(`\n[preflight] fingerprint of this database — compare against the live site before inserting:`);
    for (const line of await fingerprint()) console.log(line);
    console.log(
      `\n  Parties and states appear on /browse, elections on the landing map, members on /rajya-sabha.\n` +
        `  If those numbers disagree with what readers see, this is not the database the site serves:\n` +
        `  stop, and take the DATABASE_URL from the Vercel project that owns the production domain.`,
    );
  }

  const blocked = results.filter((r) => r.state === "BLOCKED");
  const skipped = results.filter((r) => r.state === "NOT CHECKED");
  console.log(
    blocked.length === 0
      ? `\n[preflight] ${skipped.length === 0 ? "every gate passes: an insert would be allowed to run." : `the gates this run could check pass; ${skipped.length} were not checked (see above).`}` +
          ` The deploy gate proves main CONTAINS the code — confirming its deployment is green is still yours.`
      : `\n[preflight] ${blocked.length} gate(s) would refuse an insert right now. Nothing was written.`,
  );
  process.exit(blocked.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("[preflight] FATAL:", e);
  process.exit(1);
});
