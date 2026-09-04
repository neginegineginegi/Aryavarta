/**
 * Electoral bonds loader — docs/ELECTORAL_BONDS_SPEC.md.
 *
 *   pnpm tsx scripts/load-electoral-bonds.ts --stage=verify     # stage 0
 *   pnpm tsx scripts/load-electoral-bonds.ts --stage=dry-run    # stage 1 (read-only)
 *   pnpm tsx scripts/load-electoral-bonds.ts --stage=insert --confirm
 *   pnpm tsx scripts/load-electoral-bonds.ts --stage=revert --dataset=eci-electoral-bonds-2019-24 --confirm
 *
 * The insert stage was authorised by the 2026-09-03 gate rulings and is run
 * BY THE USER from a checkout with production credentials in .env — never in
 * a sandbox pipeline or at build time. It refuses without a fresh verified
 * backup (the restore-drill marker) and without --confirm.
 *
 * Everything that interprets a row lives in src/lib/ingest/electoral-bonds.ts,
 * tested. This file reads files, talks to the database, and prints.
 */
import "dotenv/config";

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  aggregateBonds,
  checkBondsHeader,
  classifyOrgKind,
  CRORE,
  parseBondRow,
  purchaserSlug,
  type BondRow,
  type BondsOutcome,
} from "../src/lib/ingest/electoral-bonds";
import { dbLabelOf, graphCounts, hasConfirm, panelDiffLines, requireInsertPreconditions, revertDataset, starvedCounts } from "./stage2-common";

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

/** The committed legal-form suffix list (2026-09-03 ruling: the list is
 *  data, not code). classifyOrgKind consumes it verbatim. */
function readSuffixes(parseCsv: (t: string) => Record<string, string>[]): string[] {
  const path = join(ROOT, "LEGAL_FORM_SUFFIXES.csv");
  if (!existsSync(path))
    fail("LEGAL_FORM_SUFFIXES.csv is missing: org kinds come only from the committed suffix list (2026-09-03 ruling), never from a pattern in code.");
  const suffixes = parseCsv(readFileSync(path, "utf8")).map((r) => (r.suffix ?? "").trim()).filter((s) => s !== "");
  if (suffixes.length === 0) fail("LEGAL_FORM_SUFFIXES.csv carries no suffixes.");
  return suffixes;
}

function readPayload(
  manifest: ManifestRow[],
  parseCsv: (t: string) => Record<string, string>[],
): { rawCount: number; rows: BondRow[]; refused: Record<string, number>; out: BondsOutcome } {
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
  return { rawCount: raw.length, rows, refused, out: aggregateBonds(rows) };
}

const cr = (v: number) => `₹${(v / CRORE).toLocaleString("en-IN", { maximumFractionDigits: 2 })} cr`;

async function dryRun() {
  const manifest = await verify();
  console.log(`[load-electoral-bonds] stage 1 — dry run (read-only)`);
  const { parseCsv } = await import("../src/lib/csv");

  const { rawCount, rows, refused, out } = readPayload(manifest, parseCsv);

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
  lines.push(`- payload rows: ${rawCount}; parsed: ${rows.length}`);
  if (Object.keys(refused).length === 0) lines.push(`- unparseable rows: none`);
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
  // No known-quirk class exists for this payload: its defects are counted by
  // name above (empty purchasers, expired rows), so anything landing here is
  // unexplained by construction and stops the insert.
  lines.push(`- coherence anomalies: ${out.anomalies.length} unexplained (this payload has no known-quirk class; the counted defects above are not anomalies)`);
  for (const a of out.anomalies.slice(0, 20)) lines.push(`    - ${a}`);
  if (out.anomalies.length > 20) lines.push(`    - … and ${out.anomalies.length - 20} more (count above is exact)`);

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

  lines.push(`\n## Org kind — DECIDED 2026-09-03 (was the individuals-as-orgs gate question)`);
  const suffixes = readSuffixes(parseCsv);
  const kinds = { company: 0, unclassified: 0 };
  for (const p of out.purchasers) kinds[classifyOrgKind(p.name, suffixes)]++;
  lines.push(
    `Kind records ONLY what the name states: a legal-form suffix from the committed list (${suffixes.join(", ")} — data/raw/electoral-bonds/LEGAL_FORM_SUFFIXES.csv) makes it 'company'; every other name is 'unclassified', a stated absence of classification rather than a guess. On this drop: company ${kinds.company}, unclassified ${kinds.unclassified}.`,
  );
  lines.push(
    `For contrast only, never for a stored value: ${out.likelyIndividuals.count} of ${out.purchasers.length} names carry no corporate-sounding marker at all (e.g. ${out.likelyIndividuals.samples.slice(0, 4).join("; ")}). That heuristic reaches no database column — splitting people from companies by name pattern stays a human's call.`,
  );

  lines.push(`\n## Insert preview (stage 2 — built 2026-09-03; runs only via docs/PRODUCTION_RUNBOOK.md with the restore-drill marker and --confirm)`);
  lines.push(`- datasets: 1 (slug eci-electoral-bonds-2019-24; ECI as source, transcription as intermediary)`);
  lines.push(`- orgs created (verbatim purchasers): ${out.purchasers.length} — kind company ${kinds.company}, unclassified ${kinds.unclassified}`);
  lines.push(`- funding_transactions: ${insertableTx} (${cr(insertableValue)}), funding_type=donation, evidence_status=documented, occurred_on=encashment date, recipient_label verbatim on every row`);
  lines.push(`- held out: ${out.emptyPurchaser.rows} unattributed rows (${cr(out.emptyPurchaser.value)}), ${heldUnlinkedTx} unlinked-party rows, ${out.expiredRows} expired purchases`);
  lines.push(`- record_provenance: ${insertableTx}; citations: per org and per transaction against the ECI disclosure source`);
  lines.push(`- entity_match_candidates: ${out.collisionGroups.reduce((s2, g) => s2 + (g.names.length * (g.names.length - 1)) / 2, 0)} pairs from ${out.collisionGroups.length} groups`);
  const linkedUndercounts = out.emptyPurchaser.byParty.filter((e) => linkBy.get(e.name)?.partyId).length;
  lines.push(
    `- open_questions: ${linkedUndercounts + 1} (${linkedUndercounts} per-party undercounts covering the unattributed ₹${Math.round(out.emptyPurchaser.value / CRORE)} crore, one per LINKED recipient; plus the not-yet-done ECI sample verification)`,
  );

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

const DATASET_SLUG = "eci-electoral-bonds-2019-24";
const ECI_URL = "https://www.eci.gov.in/disclosure-of-electoral-bonds";
const TRANSCRIPTION_REPO = "https://github.com/saisantoshv3/electoral_bonds";
const CORROBORATING_REPO = "https://github.com/apoorv74/electoral-bonds-sbi";
const TRANSCRIPTION = `community transcription ${TRANSCRIPTION_REPO} @ aa8b9e02, cloned 2026-09-03`;

/**
 * Stage 2 — the insert, authorised by the 2026-09-03 gate rulings:
 * 23 approved party links (Goa Forward stays unlinked, its rows held out);
 * the 1,680 unattributed rows NOT loaded, with the per-party undercount as
 * open questions; org kind from the committed suffix list only, else
 * `unclassified`; the ECI account-holder label kept verbatim on every
 * transaction beside the resolved party_id; expired-only purchasers create
 * no org; collision groups become entity_match_candidates, never merges.
 */
async function insert() {
  const manifest = await verify();
  if (!process.env.DATABASE_URL) fail("DATABASE_URL not set.");
  if (!hasConfirm())
    fail("stage 2 inserts only with an explicit --confirm. Run --stage=dry-run first, read the report, then re-run with --confirm.");
  await requireInsertPreconditions(process.env.DATABASE_URL, fail);

  const { parseCsv } = await import("../src/lib/csv");
  const { rows, refused, out } = readPayload(manifest, parseCsv);
  const suffixes = readSuffixes(parseCsv);

  // The drop must measure exactly as the gate-approved stage-1 run did.
  if (Object.keys(refused).length > 0) fail("the approved run had zero unparseable rows; this run does not.");
  if (out.matchedRows !== 20421) fail(`matched rows ${out.matchedRows}, approved run measured 20421.`);
  if (out.expiredRows !== 130) fail(`expired rows ${out.expiredRows}, approved run measured 130.`);
  if (out.purchasers.length !== 1294) fail(`purchasers ${out.purchasers.length}, approved run measured 1294.`);
  if (out.parties.length !== 24) fail(`recipient names ${out.parties.length}, approved run measured 24.`);
  if (out.emptyPurchaser.rows !== 1680) fail(`unattributed rows ${out.emptyPurchaser.rows}, approved run measured 1680.`);
  if (out.duplicateBondIds !== 0) fail(`duplicate bond identities ${out.duplicateBondIds}, approved run measured 0.`);
  if (out.anomalies.length > 0) fail(`the approved run had zero anomalies; this run has ${out.anomalies.length}:\n  - ${out.anomalies.slice(0, 10).join("\n  - ")}`);

  const dbLabel = dbLabelOf(process.env.DATABASE_URL);
  const { db } = await import("../src/lib/db");
  const schema = await import("../src/lib/db/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { v7: uuidv7 } = await import("uuid");
  const today = new Date().toISOString().slice(0, 10);

  const existing = await db.select({ id: schema.datasets.id }).from(schema.datasets).where(eq(schema.datasets.slug, DATASET_SLUG));
  if (existing.length > 0) fail(`dataset ${DATASET_SLUG} already exists: this drop is already ingested (revert first if that is intended).`);

  // Party links: every recipient name committed and human-approved (§3.4).
  const partyRows = await db.select({ id: schema.parties.id }).from(schema.parties);
  const partyIds = new Set(partyRows.map((p) => p.id));
  const links = readPartyLinks(parseCsv);
  const linkBy = new Map(links.map((l) => [l.recipientName, l]));
  for (const l of links) {
    if (l.partyId && !partyIds.has(l.partyId)) fail(`"${l.recipientName}" links to "${l.partyId}", which does not exist in this database.`);
    if (!out.parties.some((p) => p.name === l.recipientName)) fail(`"${l.recipientName}" is committed but not in the data — drift.`);
  }
  for (const p of out.parties) if (!linkBy.has(p.name)) fail(`recipient "${p.name}" has no committed PARTY_LINKS.csv row.`);
  const linked = out.parties.filter((p) => linkBy.get(p.name)!.partyId);
  if (linked.length !== 23) fail(`linked recipients ${linked.length}, the gate approved exactly 23.`);

  const insertable = rows.filter((r) => r.partyName !== "" && r.purchaserName !== "" && linkBy.get(r.partyName)?.partyId);
  if (insertable.length !== 18724) fail(`insertable transactions ${insertable.length}, approved run measured 18724.`);
  const heldUnlinked = rows.filter((r) => r.partyName !== "" && r.purchaserName !== "" && linkBy.get(r.partyName)?.partyId == null).length;

  const before = { graph: await graphCounts(), panels: await starvedCounts() };
  console.log(`[load-electoral-bonds] stage 2 — inserting into ${dbLabel}`);

  const datasetId = uuidv7();
  const kindCount = { company: 0, unclassified: 0 };
  let candidatePairs = 0;
  let openQuestions = 0;

  await db.transaction(async (tx) => {
    await tx.insert(schema.datasets).values({
      id: datasetId,
      slug: DATASET_SLUG,
      name: "ECI electoral bonds disclosure, 2019–2024 (community transcription)",
      // The committed strings of spec §3.1, verbatim. The licence line says
      // "unverified" because nobody has read the transcription repositories'
      // licence files yet (§1.4, still pending at the gate) — writing a
      // cleared-sounding sentence here would settle by assertion the exact
      // question the export gate must actually answer.
      publisher: "Election Commission of India (via community transcription)",
      version: "transcription commit aa8b9e02 (2024-05-14)",
      licence: "public record (ECI disclosure under Supreme Court direction); transcription licence unverified",
      licenceUrl: null,
      retrievedOn: "2026-09-03",
      upstreamUrl: ECI_URL,
      curator: "ai@cdswindia.org",
      notes:
        `We hold a COMMUNITY TRANSCRIPTION of the ECI PDFs, not the primary source: ${TRANSCRIPTION_REPO} at commit aa8b9e02 (2024-05-14), cloned 2026-09-03; the second transcription (${CORROBORATING_REPO} @ ed8b39be) is held for cross-check only and shares the same lineage. ` +
        "Every row is evidence_status=documented, never verified, until the stage-3 sample check against ECI originals (docs/ELECTORAL_BONDS_SPEC.md). " +
        "The transcription repositories' own licence files have NOT been read; nothing derived from this dataset ships in an export until they are. " +
        "The 1,680 rows with an empty purchaser field (₹623 crore) are NOT loaded — the schema requires a donor, and fabricating one was refused; per-party undercounts are recorded as open questions (2026-09-03 ruling). " +
        "The 130 expired never-encashed purchases are not transactions and are not loaded; purchasers appearing only on expired rows create no org. " +
        "recipient_label keeps the ECI account-holder form verbatim beside the resolved party_id on every transaction. " +
        "org kind comes only from the committed legal-form suffix list (data/raw/electoral-bonds/LEGAL_FORM_SUFFIXES.csv) — company where the name states it, else unclassified; no pattern inference. " +
        "Same-collapsed-form purchaser names are created verbatim with entity_match_candidates, never merged.",
    });

    const srcExisting = await tx.select({ id: schema.sources.id }).from(schema.sources).where(eq(schema.sources.url, ECI_URL));
    const sourceId = srcExisting[0]?.id ?? uuidv7();
    if (!srcExisting[0]) {
      await tx.insert(schema.sources).values({
        id: sourceId,
        title: "Disclosure of Electoral Bonds (Supreme Court–ordered), Election Commission of India",
        url: ECI_URL,
        publisher: "Election Commission of India",
        publishedOn: "2024-03-21",
        accessedOn: null, // we hold the transcription, not a fetch of this page; the citation notes say so
        kind: "eci_report",
        isOfficial: true,
        isPrimary: true,
      });
    }

    // Orgs: one per verbatim purchaser name on MATCHED rows (expired-only
    // names create nothing). Slug collisions get -2/-3 in sorted order.
    const usedSlugs = new Set((await tx.select({ slug: schema.orgs.slug }).from(schema.orgs)).map((r) => r.slug));
    const orgIdByName = new Map<string, string>();
    const orgRows: Array<typeof schema.orgs.$inferInsert> = [];
    for (const p of [...out.purchasers].sort((a, b) => a.name.localeCompare(b.name))) {
      const base = purchaserSlug(p.name);
      if (!base) fail(`purchaser "${p.name}" slugs to nothing.`);
      let slug = base;
      let n = 1;
      while (usedSlugs.has(slug)) {
        n++;
        slug = `${base}-${n}`;
      }
      usedSlugs.add(slug);
      const id = uuidv7();
      orgIdByName.set(p.name, id);
      const kind = classifyOrgKind(p.name, suffixes);
      kindCount[kind]++;
      orgRows.push({ id, slug, name: p.name, kind });
    }
    for (let i = 0; i < orgRows.length; i += 500) await tx.insert(schema.orgs).values(orgRows.slice(i, i + 500));

    const orgProv = [...orgIdByName.entries()].map(([name, id]) => ({
      subjectType: "org" as const,
      subjectId: id,
      datasetId,
      upstreamId: `purchaser:${name}`,
      ingestedOn: today,
    }));
    for (let i = 0; i < orgProv.length; i += 500) await tx.insert(schema.recordProvenance).values(orgProv.slice(i, i + 500));
    const orgCites = [...orgIdByName.values()].map((id) => ({
      subjectType: "org" as const,
      subjectId: id,
      sourceId,
      note: `Purchaser name verbatim from the matched disclosure file; via ${TRANSCRIPTION}; not yet compared to an ECI original (stage 3).`,
    }));
    for (let i = 0; i < orgCites.length; i += 500) await tx.insert(schema.citations).values(orgCites.slice(i, i + 500));

    // Collision groups → match candidates, tagged for reversal (§4).
    const candidateRows: Array<typeof schema.entityMatchCandidates.$inferInsert> = [];
    for (const g of out.collisionGroups) {
      for (let i = 0; i < g.names.length; i++)
        for (let j = i + 1; j < g.names.length; j++)
          candidateRows.push({
            id: uuidv7(),
            entityType: "org",
            aId: orgIdByName.get(g.names[i])!,
            bId: orgIdByName.get(g.names[j])!,
            status: "possible",
            rationale: `same collapsed form "${g.form}" among bond purchasers; created verbatim per the no-merge rule, paired only by a human [dataset:${DATASET_SLUG}]`,
          });
    }
    candidatePairs = candidateRows.length;
    if (candidateRows.length > 0) await tx.insert(schema.entityMatchCandidates).values(candidateRows);

    // Transactions: donation, INR, occurred_on = encashment date, the ECI
    // account-holder label verbatim beside the resolved party (the ruling).
    const txRows: Array<typeof schema.fundingTransactions.$inferInsert> = [];
    const txProv: Array<typeof schema.recordProvenance.$inferInsert> = [];
    const txCites: Array<typeof schema.citations.$inferInsert> = [];
    for (const r of insertable) {
      const id = uuidv7();
      const bond = `${r.prefix}${r.bondNumber}`;
      txRows.push({
        id,
        donorType: "org",
        donorId: orgIdByName.get(r.purchaserName)!,
        recipientType: "party",
        recipientId: linkBy.get(r.partyName)!.partyId!,
        recipientLabel: r.partyName,
        amount: r.amount === null ? null : String(r.amount),
        currency: "INR",
        occurredOn: r.encashedOn,
        fundingType: "donation",
        evidenceStatus: "documented",
        notes: `Electoral bond ${bond}, purchased ${r.purchasedOn ?? "(date not recorded)"}, encashed ${r.encashedOn ?? "(date not recorded)"}.`,
        retrievedOn: "2026-09-03",
      });
      txProv.push({ subjectType: "funding_transaction", subjectId: id, datasetId, upstreamId: `bond:${bond}|urn:${r.urn}`, ingestedOn: today });
      txCites.push({
        subjectType: "funding_transaction",
        subjectId: id,
        sourceId,
        note: `Bond ${bond}; via ${TRANSCRIPTION}; documented, not verified — no row yet compared to the ECI original (stage 3).`,
      });
    }
    for (let i = 0; i < txRows.length; i += 500) await tx.insert(schema.fundingTransactions).values(txRows.slice(i, i + 500));
    for (let i = 0; i < txProv.length; i += 500) await tx.insert(schema.recordProvenance).values(txProv.slice(i, i + 500));
    for (let i = 0; i < txCites.length; i += 500) await tx.insert(schema.citations).values(txCites.slice(i, i + 500));

    // Open questions: the per-party undercount the defect-1 non-load causes
    // (2026-09-03 ruling), and the not-yet-done stage-3 verification.
    const oqProvenance = async (id: string, upstreamId: string) =>
      tx.insert(schema.recordProvenance).values({ subjectType: "open_question", subjectId: id, datasetId, upstreamId, ingestedOn: today });
    for (const e of out.emptyPurchaser.byParty) {
      const pid = linkBy.get(e.name)?.partyId;
      if (!pid) continue; // unlinked recipients hold ALL their rows out; the dataset notes cover them
      const oqId = uuidv7();
      await tx.insert(schema.openQuestions).values({
        id: oqId,
        subjectType: "party",
        subjectId: pid,
        question: `The ECI electoral-bond disclosure records ${e.rows} encashment(s) worth ${cr(e.value)} for "${e.name}" whose purchaser field is empty in the transcription; they are not loaded (every transaction needs a donor, and fabricating one was refused), so this party's bond receipts here UNDERCOUNT the ECI record by exactly that amount.`,
        whyItMatters: "A reader summing this party's bond receipts gets less than the public record shows; stating the exact gap is what keeps the undercount a documented fact instead of a silent error.",
        whatWouldAnswerIt: "A corrected transcription, or the primary ECI/SBI record, naming the purchasers on these rows — they would then load with real donors.",
      });
      await oqProvenance(oqId, `open-question:undercount:${e.name}`);
      openQuestions++;
    }
    const stage3OqId = uuidv7();
    await tx.insert(schema.openQuestions).values({
      id: stage3OqId,
      subjectType: "dataset",
      subjectId: datasetId,
      question: `No row of this dataset has been compared to an ECI original: the payload is a ${TRANSCRIPTION}. The stage-3 value-weighted sample check (~50 rows against the ECI PDFs, docs/ELECTORAL_BONDS_SPEC.md) has not happened.`,
      whyItMatters: "Until it does, every row's evidence_status stays 'documented', never 'verified', and anything displaying these figures must be able to say so.",
      whatWouldAnswerIt: "Performing the stage-3 sample verification and recording its result on the dataset.",
    });
    await oqProvenance(stage3OqId, "open-question:stage3-verification");
    openQuestions++;
  });

  for (const t of ["orgs", "funding_transactions", "datasets", "sources", "citations", "record_provenance", "entity_match_candidates", "open_questions"]) {
    await db.execute(sql.raw(`ANALYZE ${t}`));
  }
  const after = { graph: await graphCounts(), panels: await starvedCounts() };

  const lines: string[] = [];
  lines.push(`# Electoral bonds — stage 2 insert report`);
  lines.push(`\nGenerated ${today} against database ${dbLabel}. Dataset slug: ${DATASET_SLUG}.`);
  lines.push(`Reversible in one command: pnpm tsx scripts/load-electoral-bonds.ts --stage=revert --dataset=${DATASET_SLUG} --confirm`);
  lines.push(`\n- orgs created (verbatim purchaser names, matched rows only): ${out.purchasers.length}`);
  lines.push(`- org kind (committed suffix list only): company ${kindCount.company}, unclassified ${kindCount.unclassified}`);
  lines.push(`- funding_transactions inserted: ${insertable.length} (${cr(insertable.reduce((s, r) => s + (r.amount ?? 0), 0))}); recipient_label verbatim on every row`);
  lines.push(`- held out, exactly as ruled: ${out.emptyPurchaser.rows} unattributed rows (${cr(out.emptyPurchaser.value)}), ${heldUnlinked} rows of the unlinked Goa Forward Party, ${out.expiredRows} expired purchases`);
  lines.push(`- entity_match_candidates: ${candidatePairs} pairs from ${out.collisionGroups.length} collision groups`);
  lines.push(`- open_questions: ${openQuestions} (per-party undercounts + the stage-3 verification)`);
  lines.push(`\n## Funding graph — before/after`);
  lines.push(...panelDiffLines(before.graph, after.graph));
  lines.push(`\n## Starved panels — before/after (unchanged is expected: bonds feed the funding graph, not the election panels)`);
  lines.push(...panelDiffLines(before.panels, after.panels));
  const report = lines.join("\n");
  console.log("\n" + report + "\n");
  writeFileSync(join(ROOT, "insert-report.md"), report);
  console.log(`[load-electoral-bonds] report written to ${join(ROOT, "insert-report.md")}`);
}

async function main() {
  const stage = process.argv.find((a) => a.startsWith("--stage="))?.slice(8);
  if (stage === "verify") return void (await verify());
  if (stage === "dry-run") return void (await dryRun());
  if (stage === "insert") return void (await insert());
  if (stage === "revert") {
    const slug = process.argv.find((a) => a.startsWith("--dataset="))?.slice(10);
    if (!slug) fail("revert needs --dataset=<slug>.");
    if (!hasConfirm()) fail("revert deletes rows; it runs only with an explicit --confirm.");
    for (const line of await revertDataset(slug, fail)) console.log(`  ${line}`);
    return;
  }
  console.error("usage: pnpm tsx scripts/load-electoral-bonds.ts --stage=verify|dry-run|insert|revert --dataset=<slug> [--confirm]");
  process.exit(2);
}

main().catch((e) => {
  console.error("[load-electoral-bonds] FATAL:", e);
  process.exit(1);
});
