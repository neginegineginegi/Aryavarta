/**
 * The one command: docs/PRODUCTION_RUNBOOK.md steps 0a → 2 → 3 → 4 in order,
 * for the two fronts that need no further review — Rajya Sabha, then
 * electoral bonds. TCPD is NOT run here: it still needs the reconciliation
 * review and the LokDhaba terms capture (runbook steps 1 and 5).
 *
 *   pnpm tsx scripts/go.ts             # the guided run
 *   pnpm tsx scripts/go.ts --dry-run   # walks every step, writes nothing to the database
 *
 * What it decides for you: reading the credential from .env, running the
 * preflight, verifying the payload files, taking AND verifying the backup,
 * running each front's dry run and then its insert, measuring before and
 * after, and naming the pages to open. What it will not decide: whether the
 * database it is pointed at is the one the site serves. Nothing in a database
 * can tell; it prints the fingerprint and asks you to type the host back.
 *
 * Every existing gate is untouched. The inserts are the same scripts the
 * runbook names, spawned with the same arguments, and each re-runs the
 * deploy, schema and backup gates inside itself and refuses on its own terms.
 * This file ADDS checks (database identity, already-ingested slugs, tool
 * prerequisites); it removes none. The only thing that changed is how many
 * commands you type.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

import { parse as parseEnvFile } from "dotenv";

import {
  alreadyIngested,
  COUNT_KEYS,
  countsTable,
  snapshotTable,
  hostOf,
  missingDatabaseUrlMessage,
  pagesToOpen,
  siteUrlFrom,
  type Counts,
  type PageFacts,
} from "../src/lib/ingest/go-plan";
import {
  dbLabelOf,
  fingerprintLines,
  graphCounts,
  requireDeployedCode,
  requireFreshVerifiedBackup,
  requireSchemaCapability,
} from "./stage2-common";

const DRY = process.argv.includes("--dry-run");
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("usage: pnpm tsx scripts/go.ts [--dry-run]\n  --dry-run  walk every step and write nothing to the database");
  process.exit(0);
}
for (const a of process.argv.slice(2)) {
  if (a !== "--dry-run") {
    console.error(`[go] unknown argument ${a}. This command takes only --dry-run; there is no --yes and no --confirm here by design.`);
    process.exit(2);
  }
}

/** The two fronts, in the runbook's order (smallest first). */
const FRONTS = [
  { name: "Rajya Sabha", script: "scripts/load-rajya-sabha.ts", slug: "tcpd-rsd-1-30", reports: "data/raw/tcpd-rs" },
  { name: "Electoral bonds", script: "scripts/load-electoral-bonds.ts", slug: "eci-electoral-bonds-2019-24", reports: "data/raw/electoral-bonds" },
] as const;

const TAG = DRY ? "[go --dry-run]" : "[go]";

function fail(msg: string): never {
  console.error(`\n${TAG} STOP: ${msg}\n${TAG} Nothing after this point ran.${DRY ? "" : " Anything a completed step wrote is named above."}`);
  process.exit(1);
}
const throwFail = (msg: string): never => {
  throw new Error(msg);
};
function step(n: number, title: string): void {
  console.log(`\n${"─".repeat(72)}\n${TAG} step ${n} — ${title}\n${"─".repeat(72)}`);
}
function note(msg: string): void {
  console.log(`${TAG} ${msg}`);
}

/** Run one of the runbook's own commands, output streamed, stopping on any
 *  non-zero exit. The credential travels in the child's environment, never
 *  in an argument. */
function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, what: string): void {
  note(`running: ${[cmd, ...args].join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", env });
  if (r.error) fail(`${what}: could not start ${cmd} (${r.error.message}).`);
  if (r.status !== 0) fail(`${what}: ${cmd} exited with ${r.status ?? `signal ${r.signal}`}. Read its output above; it says what refused and why.`);
}

function toolOnPath(tool: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${tool}`], { stdio: "ignore" }).status === 0;
}

async function measure(): Promise<Counts> {
  const { db } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const count = async (table: string): Promise<number | null> => {
    try {
      const r = await db.execute(sql`SELECT count(*)::int AS n FROM ${sql.raw(`"${table}"`)}`);
      return Number((r.rows[0] as { n: number }).n);
    } catch {
      return null;
    }
  };
  let nodes: number | null = null;
  let edges: number | null = null;
  try {
    const g = await graphCounts();
    nodes = Number(g["orgs + people (nodes)"]);
    edges = Number(g["transactions + board + relationships (edges)"]);
  } catch {
    /* the schema gate names the missing table; the counts just say absent */
  }
  const c: Counts = {};
  c[COUNT_KEYS[0]] = await count("orgs");
  c[COUNT_KEYS[1]] = await count("funding_transactions");
  c[COUNT_KEYS[2]] = nodes;
  c[COUNT_KEYS[3]] = edges;
  c[COUNT_KEYS[4]] = await count("rs_members");
  c[COUNT_KEYS[5]] = await count("rs_terms");
  return c;
}

/** Rows the inserts created, so the page list can point at real ones. */
async function pageFacts(): Promise<PageFacts> {
  const { db } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const { rsSeatSlug } = await import("../src/lib/rajya-sabha-labels");
  const one = async <T,>(q: ReturnType<typeof sql>): Promise<T | null> => {
    try {
      const r = await db.execute(q);
      return (r.rows[0] as T | undefined) ?? null;
    } catch {
      return null;
    }
  };
  const seat = await one<{ label: string }>(sql`SELECT state_label AS label FROM rs_terms ORDER BY state_label LIMIT 1`);
  const member = await one<{ id: string }>(sql`SELECT tcpd_rs_id AS id FROM rs_members ORDER BY tcpd_rs_id LIMIT 1`);
  const purchaser = await one<{ slug: string }>(sql`
    SELECT o.slug FROM funding_transactions t JOIN orgs o ON o.id::text = t.donor_id::text
    WHERE t.donor_type = 'org' GROUP BY o.slug ORDER BY count(*) DESC LIMIT 1`);
  return {
    seatSlug: seat ? rsSeatSlug(seat.label) : null,
    memberId: member?.id ?? null,
    purchaserSlug: purchaser?.slug ?? null,
  };
}

async function main(): Promise<void> {
  console.log(
    `${TAG} Abhilekh stage-2 inserts, Rajya Sabha then electoral bonds. TCPD is not part of this command.` +
      (DRY ? `\n${TAG} Dry run: every step is walked; nothing is written to the database. The two loaders' own dry runs write their reports under data/raw/*/dry-run-report.md, which is a file, not a row.` : ""),
  );

  // ---------------------------------------------------------------- step 1
  step(1, "the credential, from .env and nowhere else");
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) fail(missingDatabaseUrlMessage(`there is no .env in ${process.cwd()}`));
  const fileEnv = parseEnvFile(readFileSync(envPath, "utf8"));
  const url = (fileEnv.DATABASE_URL ?? "").trim();
  if (!url) fail(missingDatabaseUrlMessage(".env exists but carries no DATABASE_URL"));
  const host = hostOf(url);
  if (!host) fail("DATABASE_URL in .env does not parse as a connection URL; it should look like postgres://user:password@host/database.");
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== url) {
    note("WARNING: the shell also carries a DATABASE_URL, and it differs from .env's. This run uses .env's and hands it explicitly to every script it starts, so none of them can drift to the shell's.");
  }
  // Apply .env the way dotenv would (file never overrides the shell), then
  // make the one value that matters unambiguous for this process and every
  // child: the credential the runbook says to put in the file.
  for (const [k, v] of Object.entries(fileEnv)) if (process.env[k] === undefined) process.env[k] = v;
  process.env.DATABASE_URL = url;
  const childEnv: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url };
  const label = dbLabelOf(url);
  note(`target database: ${label}`);
  if ((fileEnv.DATABASE_DRIVER ?? process.env.DATABASE_DRIVER) !== "neon")
    note(`DATABASE_DRIVER is "${fileEnv.DATABASE_DRIVER ?? process.env.DATABASE_DRIVER ?? "(unset)"}", not "neon". Fine for a local database; production runs on Neon.`);

  // ---------------------------------------------------------------- step 2
  step(2, "preflight: the gates an insert will apply, and the fingerprint of this database");
  type Gate = { gate: string; state: "PASS" | "BLOCKED"; detail: string };
  const gate = async (name: string, fn: () => void | Promise<void>): Promise<Gate> => {
    try {
      await fn();
      return { gate: name, state: "PASS", detail: "" };
    } catch (e) {
      return { gate: name, state: "BLOCKED", detail: e instanceof Error ? e.message : String(e) };
    }
  };
  const deploy = await gate("deployed code (origin/main carries the renderer)", () => requireDeployedCode(throwFail));
  const schema = await gate("schema (this database carries the migration)", () => requireSchemaCapability(throwFail));
  const backupNow = await gate("backup (a verified restore within 24h)", () => requireFreshVerifiedBackup(label, throwFail));
  for (const g of [deploy, schema]) {
    console.log(`\n  ${g.state.padEnd(8)} ${g.gate}`);
    if (g.detail) for (const line of g.detail.split("\n")) console.log(`           ${line}`);
  }
  console.log(
    `\n  ${backupNow.state === "PASS" ? "PASS    " : "PENDING "} backup (a verified restore within 24h)` +
      (backupNow.state === "PASS" ? "" : ` — step 3 takes and verifies one; until then an insert would refuse (${backupNow.detail.split("\n")[0]})`),
  );
  const blocked = [deploy, schema].filter((g) => g.state === "BLOCKED");
  if (blocked.length > 0)
    fail(
      `${blocked.length} gate(s) would refuse an insert: ${blocked.map((g) => g.gate).join("; ")}. Fix what the message names (merge and deploy, or run node scripts/ensure-upgrades.mjs against this database) and run this command again.`,
    );
  note("the deploy gate proves main CONTAINS the code; that its Vercel deployment is green is still yours to confirm, and step 2 asks you to.");

  note("verifying the payload files against their manifests (sha256, read-only):");
  for (const f of FRONTS) run("pnpm", ["tsx", f.script, "--stage=verify"], childEnv, `${f.name} stage 0 (verify)`);

  console.log(`\n${TAG} fingerprint of ${label} — compare it with the live site before anything is written:`);
  const fp = await fingerprintLines();
  for (const line of fp.lines) console.log(line);
  console.log(
    `\n  Parties and states appear on /browse, elections on the landing map, members on /rajya-sabha.\n` +
      `  If these numbers disagree with what readers see, this is the other project's database: stop.`,
  );
  const present = alreadyIngested(fp.slugs);
  if (present.length > 0)
    fail(
      `this database already holds a stage-2 dataset: ${present.join(", ")}. This command is for the first run of both fronts; it will not insert beside an earlier run. To redo a front, revert it first (runbook, "Reverting"), then run this again.`,
    );

  const before = await measure();
  console.log(`\n${TAG} counts before:`);
  for (const line of snapshotTable(before)) console.log(`  ${line}`);

  // The one decision this command does not make.
  if (DRY) {
    note(`a real run stops here and asks you to type the database host — ${host} — after you have compared the fingerprint with the live site and confirmed the main deployment is green in Vercel. Anything else typed stops the run with nothing written.`);
  } else {
    if (!process.stdin.isTTY)
      fail("this command confirms the database identity interactively and needs a terminal. It has no --yes flag by design; run it from a shell, not a pipeline.");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `\n${TAG} Two things only you can check: (a) the fingerprint above matches the live site; (b) the latest main deployment is green in Vercel.\n` +
        `${TAG} If both hold, type the database host exactly as shown to continue — ${host} — or anything else to stop: `,
    );
    rl.close();
    if (answer.trim() !== host) fail("not confirmed. Nothing was written.");
  }

  // ---------------------------------------------------------------- step 3
  step(3, "backup, and the restore that proves it (scripts/restore-drill.sh)");
  const missingTools = ["pg_dump", "pg_restore", "psql"].filter((t) => !toolOnPath(t));
  if (missingTools.length > 0)
    fail(`${missingTools.join(", ")} not on PATH. The drill dumps with pg_dump and restores with pg_restore into a sibling database; install the PostgreSQL client tools (the same major version as the server) and run this again.`);
  note(
    `the drill dumps ${label} to data/backups/abhilekh-<stamp>.dump, restores it into a fresh database named abhilekh_restore_drill on the same server, compares exact per-table row counts, and only then writes data/backups/LAST_VERIFIED_RESTORE.json — the marker every insert reads. It needs CREATE/DROP DATABASE; set ADMIN_URL in .env if the app role lacks it.`,
  );
  if (DRY) {
    note("dry run: the drill is not run (it creates a database on the server and a dump on disk).");
    note(backupNow.state === "PASS" ? `a verified restore is already on record: ${backupNow.detail || "fresh marker"}` : `today's marker state: ${backupNow.detail.split("\n")[0]}`);
  } else {
    run("bash", ["scripts/restore-drill.sh"], childEnv, "restore drill");
    // The same gate the inserts apply, applied here so a drill that printed
    // VERIFIED but left a marker the inserts would reject stops now, not two
    // minutes into the Rajya Sabha insert.
    requireFreshVerifiedBackup(label, fail);
  }

  // ---------------------------------------------------------------- step 4
  for (const [i, f] of FRONTS.entries()) {
    step(4 + i, `insert ${i + 1} — ${f.name} (${f.slug})`);
    note(`${f.name}: dry run first (read-only; its report lands in ${f.reports}/dry-run-report.md)`);
    run("pnpm", ["tsx", f.script, "--stage=dry-run"], childEnv, `${f.name} stage 1 (dry run)`);
    // The bonds dry run compares encashed.csv's data rows with the matched
    // rows and writes "DRIFT, stop" into its report on a mismatch, but exits
    // 0: by hand, the operator reading the report is the gate. This command
    // reads no report for you unless it checks it, so it checks it.
    const reportPath = join(process.cwd(), f.reports, "dry-run-report.md");
    if (existsSync(reportPath) && /DRIFT, stop/.test(readFileSync(reportPath, "utf8")))
      fail(`${f.name}: the dry-run report (${f.reports}/dry-run-report.md) flags DRIFT. Its cross-check line says what differs; the spec says drift stops the gate, so the insert does not run.`);
    const insertCmd = ["tsx", f.script, "--stage=insert", "--confirm"];
    if (DRY) {
      note(`would run next: pnpm ${insertCmd.join(" ")}`);
      note("it would apply, inside itself: the deploy gate (origin/main markers), the schema gate (catalogue + schema_capabilities marker), the backup gate (fresh marker bound to this database), then assert the payload measures exactly as the approved stage-1 run did, then insert and write " + `${f.reports}/insert-report.md`);
      continue;
    }
    run("pnpm", insertCmd, childEnv, `${f.name} stage 2 (insert)`);
  }

  // ---------------------------------------------------------------- step 6
  step(4 + FRONTS.length, "what changed, and where to look");
  const after = DRY ? null : await measure();
  for (const line of countsTable(before, after)) console.log(`  ${line}`);
  if (!DRY) {
    const moved = COUNT_KEYS.filter((k) => typeof before[k] === "number" && typeof after![k] === "number" && before[k] !== after![k]);
    if (moved.length === 0) note("WARNING: no count moved. Both inserts exited 0, so read the two insert reports before concluding anything; an insert that creates nothing says why in its held/skipped lists.");
  }

  const site = siteUrlFrom(fileEnv);
  const facts = DRY ? {} : await pageFacts();
  console.log(`\n${TAG} pages to open${site ? "" : " (NEXT_PUBLIC_SITE_URL is not a production URL in .env, so these are paths on the live domain)"}:`);
  for (const p of pagesToOpen(site, facts)) console.log(`  ${p.url}\n      ${p.why}`);

  console.log(
    `\n${TAG} ${DRY ? "dry run complete: nothing was written to the database." : "done. Both inserts ran; their reports are the record:"}` +
      (DRY ? "" : `\n  ${FRONTS.map((f) => `${f.reports}/insert-report.md`).join("\n  ")}\n${TAG} Paste each report's starved-panel table and held/skipped lists back (runbook, "After the inserts"). Each front is reversible by dataset id (runbook, "Reverting").`),
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(`${TAG} FATAL:`, e instanceof Error ? e.message : e);
  process.exit(1);
});
