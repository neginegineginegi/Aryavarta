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

import {
  dbLabelOf,
  fingerprintLines,
  requireDeployedCode,
  requireFreshVerifiedBackup,
  requireSchemaCapability,
} from "./stage2-common";

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

/** The fingerprint lives in stage2-common so scripts/go.ts prints the very
 *  same lines (and refuses on the same slugs) rather than a copy of them. */
async function fingerprint(): Promise<string[]> {
  return (await fingerprintLines()).lines;
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
