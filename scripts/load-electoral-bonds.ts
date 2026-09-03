/**
 * Electoral bonds loader — stages 0 and 1 of docs/ELECTORAL_BONDS_SPEC.md.
 *
 *   pnpm tsx scripts/load-electoral-bonds.ts --stage=verify    # stage 0
 *   pnpm tsx scripts/load-electoral-bonds.ts --stage=dry-run   # stage 1 (read-only)
 *
 * The insert stage is NOT implemented: the stage-1 gate (party links, the
 * empty-purchaser ruling, individuals-as-orgs) shapes it. Asking for it
 * exits with the gate message.
 *
 * Everything that interprets a row lives in src/lib/ingest/electoral-bonds.ts,
 * tested. This file reads files, talks to the database read-only, and prints.
 */
import "dotenv/config";

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  aggregateBonds,
  checkBondsHeader,
  CRORE,
  parseBondRow,
  purchaserSlug,
  type BondRow,
  type BondsOutcome,
} from "../src/lib/ingest/electoral-bonds";

const ROOT = process.env.EB_ROOT ?? join(process.cwd(), "data", "raw", "electoral-bonds");

type ManifestRow = {
  file: string;
  kind: "eb_matched" | "eb_purchaser" | "eb_encashment";
  sha256: string;
  bytes: number;
};

function fail(msg: string): never {
  console.error(`[load-electoral-bonds] REFUSED: ${msg}`);
  process.exit(1);
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    createReadStream(path).on("data", (c) => hash.update(c)).on("end", resolve).on("error", reject);
  });
  return hash.digest("hex");
}

async function readManifest(): Promise<ManifestRow[]> {
  for (const doc of ["MANIFEST.csv", "SOURCE.md", "FINDINGS.md"]) {
    if (!existsSync(join(ROOT, doc)))
      fail(`${doc} is missing from ${ROOT}. The delivered record travels with the data (spec §1.2).`);
  }
  const { parseCsv } = await import("../src/lib/csv");
  const rows = parseCsv(readFileSync(join(ROOT, "MANIFEST.csv"), "utf8"));
  if (rows.length === 0) fail("MANIFEST.csv has no data rows.");
  return rows.map((r) => {
    const file = (r.file ?? "").trim();
    const kind = (r.kind ?? "").trim();
    if (kind !== "eb_matched" && kind !== "eb_purchaser" && kind !== "eb_encashment")
      fail(`"${file}": kind "${kind}" is not one this loader knows.`);
    const bytes = Number((r.bytes ?? "").trim());
    if (!Number.isInteger(bytes) || bytes <= 0) fail(`"${file}": bytes must be a positive integer.`);
    if (!/^[0-9a-f]{64}$/i.test((r.sha256 ?? "").trim())) fail(`"${file}": sha256 must be 64 hex characters.`);
    return { file, kind, sha256: r.sha256.trim().toLowerCase(), bytes };
  });
}

/** Stage 0: the drop matches the manifest byte-for-byte, and the payload's
 *  header matches the contract (verbatim, journam_date and all). */
async function verify(): Promise<ManifestRow[]> {
  const manifest = await readManifest();
  console.log(`[load-electoral-bonds] stage 0 — verifying ${manifest.length} file(s)`);
  for (const m of manifest) {
    const path = join(ROOT, m.file);
    if (!existsSync(path)) fail(`"${m.file}" is listed but not on disk.`);
    const actualBytes = statSync(path).size;
    if (actualBytes !== m.bytes) fail(`"${m.file}": ${actualBytes} bytes on disk, manifest says ${m.bytes}.`);
    const digest = await sha256(path);
    if (digest !== m.sha256) fail(`"${m.file}": sha256 mismatch.\n  disk:     ${digest}\n  manifest: ${m.sha256}`);
    if (m.kind === "eb_matched") {
      const firstLine = readFileSync(path, "utf8").split(/\r?\n/)[0];
      const header = firstLine.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
      const check = checkBondsHeader(header);
      if (!check.ok) fail(`"${m.file}": header missing ${check.missing.join(", ")} — the transcription has drifted; a person must look.`);
      if (check.unknown.length > 0)
        console.log(`  note: "${m.file}" carries unknown column(s): ${check.unknown.join(", ")}`);
    }
    console.log(`  ok: ${m.file} (${(m.bytes / 1e6).toFixed(1)} MB, sha256 verified${m.kind === "eb_matched" ? ", header verified" : "; held for cross-check, never parsed"})`);
  }
  console.log("[load-electoral-bonds] stage 0 passed.");
  return manifest;
}

type PartyLink = { recipientName: string; partyId: string | null; evidence: string };

function readPartyLinks(parseCsv: (t: string) => Record<string, string>[]): PartyLink[] {
  const path = join(ROOT, "PARTY_LINKS.csv");
  if (!existsSync(path))
    fail("PARTY_LINKS.csv is missing: the 24 recipient names resolve only through the committed, human-approved file (spec §3.4).");
  return parseCsv(readFileSync(path, "utf8")).map((r) => ({
    recipientName: (r.recipient_name ?? "").trim(),
    partyId: (r.party_id ?? "").trim() || null,
    evidence: (r.evidence ?? "").trim(),
  }));
}

const cr = (v: number) => `₹${(v / CRORE).toLocaleString("en-IN", { maximumFractionDigits: 2 })} cr`;

async function dryRun() {
  const manifest = await verify();
  console.log(`[load-electoral-bonds] stage 1 — dry run (read-only)`);
  const { parseCsv } = await import("../src/lib/csv");

  const payload = manifest.find((m) => m.kind === "eb_matched")!;
  const raw = parseCsv(readFileSync(join(ROOT, payload.file), "utf8"));
  const refused: Record<string, number> = {};
  const rows: BondRow[] = [];
  for (const r of raw) {
    const p = parseBondRow(r);
    if ("refused" in p) {
      refused[p.refused] = (refused[p.refused] ?? 0) + 1;
      continue;
    }
    rows.push(p);
  }
  const out = aggregateBonds(rows);

  // Cross-check row counts against the held files (spec §5) without parsing
  // them as data: a straight line count is a shape check, not an ingest.
  const lineCount = (file: string) =>
    readFileSync(join(ROOT, file), "utf8").split(/\r?\n/).filter((l) => l.trim() !== "").length - 1;
  const purchasedRows = lineCount(manifest.find((m) => m.kind === "eb_purchaser")!.file);
  const encashedRows = lineCount(manifest.find((m) => m.kind === "eb_encashment")!.file);

  if (!process.env.DATABASE_URL) fail("DATABASE_URL not set: the dry run resolves party links against a database.");
  const dbLabel = process.env.DATABASE_URL.replace(/\/\/[^@]*@/, "//…@");
  const { db } = await import("../src/lib/db");
  const schema = await import("../src/lib/db/schema");
  const { sql } = await import("drizzle-orm");

  const partyRows = await db.select({ id: schema.parties.id, name: schema.parties.name }).from(schema.parties);
  const partyIds = new Set(partyRows.map((p) => p.id));
  const links = readPartyLinks(parseCsv);
  const linkBy = new Map(links.map((l) => [l.recipientName, l]));

  const linkProblems: string[] = [];
  for (const l of links) {
    if (l.partyId && !partyIds.has(l.partyId)) linkProblems.push(`"${l.recipientName}" links to "${l.partyId}", which does not exist`);
    if (!out.parties.some((p) => p.name === l.recipientName)) linkProblems.push(`"${l.recipientName}" is committed but not in the data — drift`);
  }
  const unmappedNames = out.parties.filter((p) => !linkBy.has(p.name));

  // Current graph, counted by the stated rule: nodes = orgs + people;
  // edges = funding transactions + board positions + relationships.
  const n = async (q: string) => Number((await db.execute(sql.raw(q))).rows[0]!.n);
  const orgsNow = await n("SELECT count(*)::int AS n FROM orgs");
  const peopleNow = await n("SELECT count(*)::int AS n FROM people");
  const txNow = await n("SELECT count(*)::int AS n FROM funding_transactions");
  const boardNow = await n("SELECT count(*)::int AS n FROM board_positions");
  const relNow = await n("SELECT count(*)::int AS n FROM relationships");

  // What stage 2 would insert.
  const linkedParties = out.parties.filter((p) => linkBy.get(p.name)?.partyId);
  const unlinkedParties = out.parties.filter((p) => linkBy.has(p.name) && !linkBy.get(p.name)!.partyId);
  const insertableTx = linkedParties.reduce((s, p) => s + p.namedRows, 0);
  const insertableValue = linkedParties.reduce((s, p) => s + p.namedValue, 0);
  const heldUnlinkedTx = unlinkedParties.reduce((s, p) => s + p.namedRows, 0);
  const distinctPairs = new Set<string>();
  for (const r of rows) {
    if (r.partyName === "" || r.purchaserName === "") continue;
    const link = linkBy.get(r.partyName)?.partyId;
    if (link) distinctPairs.add(`${purchaserSlug(r.purchaserName)}|${link}`);
  }

  const lines: string[] = [];
  lines.push(`# Electoral bonds — stage 1 dry-run report`);
  lines.push(`\nGenerated ${new Date().toISOString().slice(0, 10)} against database ${dbLabel}.`);
  lines.push(`No writes were performed. This is the spec §7 stage-1 gate deliverable.`);
  lines.push(`\nPROVENANCE: community transcription of ECI PDFs (repo commit aa8b9e02, cloned 2026-09-03).`);
  lines.push(`Every row would carry evidence_status=documented — never verified: nobody has compared a row to an ECI original (stage 3 is that check). The second transcription corroborates row counts but shares the same lineage (§24: one evidence line, not two).`);

  lines.push(`\n## Shape`);
  lines.push(`- payload rows: ${raw.length}; parsed: ${rows.length}`);
  for (const [reason, cnt] of Object.entries(refused)) lines.push(`- unparseable rows — ${reason}: ${cnt}`);
  lines.push(`- matched purchaser→party rows: ${out.matchedRows}`);
  lines.push(`- expired, never-encashed purchases (no recipient exists; NOT transactions; §2.3): ${out.expiredRows}`);
  lines.push(`- cross-check: purchased.csv ${purchasedRows} rows (both transcriptions agree on 18,871); encashed.csv ${encashedRows} rows ${encashedRows === out.matchedRows ? "= matched rows exactly" : "≠ matched rows — DRIFT, stop"}`);
  const allNames = new Set(rows.filter((r) => r.purchaserName !== "").map((r) => r.purchaserName));
  const expiredOnly = [...allNames].filter((nm) => !out.purchasers.some((p) => p.name === nm));
  lines.push(
    `- distinct purchasers on matched rows: ${out.purchasers.length} (the delivered 1,317 counts all rows; ${expiredOnly.length} names appear ONLY on expired purchases, hold no transaction, and would create no org)`,
  );
  lines.push(`- recipient names: ${out.parties.length}`);
  lines.push(`- total recorded value: ${cr(out.parties.reduce((s, p) => s + p.value, 0))}`);
  lines.push(`- encashment range: ${out.encashedRange?.min} to ${out.encashedRange?.max}`);
  lines.push(`- duplicate bond identities: ${out.duplicateBondIds}`);
  lines.push(`- anomalies: ${out.anomalies.length === 0 ? "none" : ""}`);
  for (const a of out.anomalies.slice(0, 20)) lines.push(`    - ${a}`);

  lines.push(`\n## Party links (spec §3.4 — every row human-approved at this gate)`);
  if (linkProblems.length > 0) {
    lines.push(`- PROBLEMS — the insert stage refuses until fixed:`);
    for (const p of linkProblems) lines.push(`    - ${p}`);
  }
  lines.push(`| recipient name (verbatim) | → party row | rows | value | evidence |`);
  lines.push(`|---|---|---|---|---|`);
  for (const p of out.parties) {
    const l = linkBy.get(p.name);
    lines.push(`| ${p.name} | ${l?.partyId ?? "**UNLINKED**"} | ${p.rows} | ${cr(p.value)} | ${l?.evidence ?? "no committed row"} |`);
  }
  for (const u of unmappedNames) lines.push(`- NOT IN PARTY_LINKS.csv (insert refuses): ${u.name}`);
  lines.push(`- linked: ${linkedParties.length}; unlinked (rows held out): ${unlinkedParties.length} (${heldUnlinkedTx} named-purchaser rows)`);

  lines.push(`\n## Defect 1 — the 1,680 unattributed rows (NOT loaded; spec §3.3)`);
  lines.push(
    `${out.emptyPurchaser.rows} matched rows carry no purchaser name, worth ${cr(out.emptyPurchaser.value)}. The schema requires a donor, and both fabrications (one unnamed node = the archive's third-largest funder; 1,680 singleton nodes) are refused. These rows are NOT loaded; an open_questions entry records them, and party receipt totals in Abhilekh therefore UNDERCOUNT the ECI record by exactly:`,
  );
  lines.push(`| party (verbatim) | unattributed rows | value not loaded |`);
  lines.push(`|---|---|---|`);
  for (const p of out.emptyPurchaser.byParty) lines.push(`| ${p.name} | ${p.rows} | ${cr(p.value)} |`);

  lines.push(`\n## Defects 2–4 — identity, verbatim, no merges (spec §4)`);
  lines.push(`- collapsed-form collision groups (→ entity_match_candidates at insert, one pair per group member pair): ${out.collisionGroups.length}`);
  for (const g of out.collisionGroups) lines.push(`    - [${g.form}]: ${g.names.map((x) => `"${x}"`).join(" vs ")}`);
  lines.push(`- space-stripped names (no space, ≥15 chars; loaded verbatim): ${out.spaceStripped.length}`);
  for (const s2 of out.spaceStripped) lines.push(`    - ${s2}`);
  lines.push(`- mid-word splits (loaded verbatim; candidates only where the full form exists in the data): ${out.midWordSplits.length}`);
  for (const s2 of out.midWordSplits) lines.push(`    - ${s2}`);

  lines.push(`\n## Gate question — individuals as orgs (spec §3.2)`);
  lines.push(
    `${out.likelyIndividuals.count} of ${out.purchasers.length} purchaser names carry no corporate marker (heuristic for COUNTING only, e.g. ${out.likelyIndividuals.samples.slice(0, 4).join("; ")}). The proposal is ONE orgs row per verbatim name with kind='other' for all purchasers, because splitting people from companies by name pattern is a guess. The gate may instead rule that a human classifies the ${out.likelyIndividuals.count} into people rows; the loader will not.`,
  );

  lines.push(`\n## Insert preview (stage 2, unbuilt until this gate returns approved)`);
  lines.push(`- datasets: 1 (slug eci-electoral-bonds-2019-24; ECI as source, transcription as intermediary)`);
  lines.push(`- orgs created (verbatim purchasers): ${out.purchasers.length}`);
  lines.push(`- funding_transactions: ${insertableTx} (${cr(insertableValue)}), funding_type=donation, evidence_status=documented, occurred_on=encashment date`);
  lines.push(`- held out: ${out.emptyPurchaser.rows} unattributed rows (${cr(out.emptyPurchaser.value)}), ${heldUnlinkedTx} unlinked-party rows, ${out.expiredRows} expired purchases`);
  lines.push(`- record_provenance: ${insertableTx}; citations: per org and per transaction against the ECI disclosure source`);
  lines.push(`- entity_match_candidates: ${out.collisionGroups.reduce((s2, g) => s2 + (g.names.length * (g.names.length - 1)) / 2, 0)} pairs from ${out.collisionGroups.length} groups`);
  lines.push(`- open_questions: 2 (the unattributed ₹${Math.round(out.emptyPurchaser.value / CRORE)} crore; the not-yet-done ECI sample verification)`);

  lines.push(`\n## Graph density (nodes = orgs+people; edges = transactions+board+relationships)`);
  lines.push(`| | before | after insert |`);
  lines.push(`|---|---|---|`);
  lines.push(`| nodes | ${orgsNow + peopleNow} | ${orgsNow + peopleNow + out.purchasers.length + linkedParties.length} (+${out.purchasers.length} purchaser orgs, +${linkedParties.length} party rows entering the funding graph for the first time) |`);
  lines.push(`| edges | ${txNow + boardNow + relNow} | ${txNow + boardNow + relNow + insertableTx} |`);
  lines.push(`| distinct purchaser→party pairs | — | ${distinctPairs.size} |`);
  lines.push(`\nThe funding layer and the political record connect for the first time: every linked recipient is an existing party with its own page, colours and election results.`);

  lines.push(`\n## Gate`);
  lines.push(`Decisions needed before stage 2 is BUILT: (1) the ${links.length} party links above, each row human-approved; (2) the defect-1 non-load with its per-party undercount table; (3) individuals-as-orgs; (4) the transcription-licence check before anything ships in an export. Standing gates: verified backup restore precedes any insert; the TCPD production reconciliation retains priority; main moves on the user's say-so. Stage 3 (ECI sample verification) is open from day one.`);

  const report = lines.join("\n");
  console.log("\n" + report + "\n");
  const outPath = join(ROOT, "dry-run-report.md");
  writeFileSync(outPath, report);
  console.log(`[load-electoral-bonds] report written to ${outPath}`);
}

async function main() {
  const stage = process.argv.find((a) => a.startsWith("--stage="))?.slice(8);
  if (stage === "verify") return void (await verify());
  if (stage === "dry-run") return void (await dryRun());
  if (stage === "insert") {
    console.error(
      `[load-electoral-bonds] GATED: the insert stage is built only after the stage-1 report returns approved (party links, defect-1 ruling, individuals-as-orgs). See docs/ELECTORAL_BONDS_SPEC.md §7.`,
    );
    process.exit(2);
  }
  console.error("usage: pnpm tsx scripts/load-electoral-bonds.ts --stage=verify|dry-run");
  process.exit(2);
}

main().catch((e) => {
  console.error("[load-electoral-bonds] FATAL:", e);
  process.exit(1);
});
