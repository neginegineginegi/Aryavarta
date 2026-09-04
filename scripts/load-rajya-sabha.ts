/**
 * Rajya Sabha loader — docs/RAJYA_SABHA_SPEC.md.
 *
 *   pnpm tsx scripts/load-rajya-sabha.ts --stage=verify
 *   pnpm tsx scripts/load-rajya-sabha.ts --stage=dry-run   # read-only
 *   pnpm tsx scripts/load-rajya-sabha.ts --stage=insert --confirm
 *   pnpm tsx scripts/load-rajya-sabha.ts --stage=revert --dataset=tcpd-rsd-1-30 --confirm
 *
 * The insert stage was authorised by the 2026-09-03 gate rulings and is run
 * BY THE USER from a checkout with production credentials in .env — never in
 * a sandbox pipeline or at build time. It refuses without a fresh verified
 * backup (the restore-drill marker) and without --confirm. Everything that
 * interprets a row lives in src/lib/ingest/rajya-sabha.ts, behind the
 * binding column allowlist.
 */
import "dotenv/config";

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  aggregateRs,
  checkRsHeader,
  classifyRsAnomalies,
  parseRsRow,
  proposePersonMatches,
  RS_EXCLUDED_COLUMNS,
  RS_INGESTED_COLUMNS,
  RS_KNOWN_QUIRK_WHY,
  RS_NO_PARTY_LABELS,
  RS_SNAPSHOT_DATE,
  type RsRow,
} from "../src/lib/ingest/rajya-sabha";
import { checkPartyResolutions, type KnownParty, type PartyDisposition } from "../src/lib/ingest/tcpd";
import { dbLabelOf, hasConfirm, panelDiffLines, requireInsertPreconditions, revertDataset, starvedCounts } from "./stage2-common";

const ROOT = process.env.RS_ROOT ?? join(process.cwd(), "data", "raw", "tcpd-rs");

function fail(msg: string): never {
  console.error(`[load-rajya-sabha] REFUSED: ${msg}`);
  process.exit(1);
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    createReadStream(path).on("data", (c) => hash.update(c)).on("end", resolve).on("error", reject);
  });
  return hash.digest("hex");
}

type ManifestRow = { file: string; kind: "rs_members" | "doc"; sha256: string; bytes: number; sourceVersion: string };

async function readManifest(): Promise<ManifestRow[]> {
  for (const doc of ["MANIFEST.csv", "TERMS.md", "FINDINGS.md"]) {
    if (!existsSync(join(ROOT, doc))) fail(`${doc} is missing from ${ROOT} (spec §1).`);
  }
  const { parseCsv } = await import("../src/lib/csv");
  const rows = parseCsv(readFileSync(join(ROOT, "MANIFEST.csv"), "utf8"));
  return rows.map((r) => {
    const kind = (r.kind ?? "").trim();
    if (kind !== "rs_members" && kind !== "doc") fail(`kind "${kind}" is not one this loader knows.`);
    const bytes = Number((r.bytes ?? "").trim());
    if (!Number.isInteger(bytes) || bytes <= 0) fail(`"${r.file}": bytes must be a positive integer.`);
    if (!/^[0-9a-f]{64}$/i.test((r.sha256 ?? "").trim())) fail(`"${r.file}": bad sha256.`);
    return { file: (r.file ?? "").trim(), kind, sha256: r.sha256.trim().toLowerCase(), bytes, sourceVersion: (r.source_version ?? "").trim() };
  });
}

async function verify(): Promise<ManifestRow[]> {
  const manifest = await readManifest();
  console.log(`[load-rajya-sabha] stage 0 — verifying ${manifest.length} file(s)`);
  for (const m of manifest) {
    const path = join(ROOT, m.file);
    if (!existsSync(path)) fail(`"${m.file}" is listed but not on disk.`);
    if (statSync(path).size !== m.bytes) fail(`"${m.file}": byte count differs from the manifest.`);
    const digest = await sha256(path);
    if (digest !== m.sha256) fail(`"${m.file}": sha256 mismatch.\n  disk:     ${digest}\n  manifest: ${m.sha256}`);
    if (m.kind === "rs_members") {
      const firstLine = readFileSync(path, "utf8").split(/\r?\n/)[0];
      const header = firstLine.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
      const check = checkRsHeader(header);
      if (!check.ok) fail(`"${m.file}": header missing allowlist column(s): ${check.missing.join(", ")}.`);
      if (check.unknown.length > 0)
        console.log(`  note: unknown column(s) beyond the 36 known: ${check.unknown.join(", ")} (cannot be ingested; the allowlist is closed)`);
    }
    console.log(`  ok: ${m.file} (${(m.bytes / 1e6).toFixed(1)} MB, sha256 verified${m.kind === "doc" ? "; document, never parsed" : ", header verified"})`);
  }
  console.log("[load-rajya-sabha] stage 0 passed.");
  return manifest;
}

type StateLink = { label: string; stateId: string | null; evidence: string };

function readStateLinks(parseCsv: (t: string) => Record<string, string>[]): StateLink[] {
  const path = join(ROOT, "STATE_LINKS.csv");
  if (!existsSync(path)) fail("STATE_LINKS.csv is missing (spec §4.4).");
  return parseCsv(readFileSync(path, "utf8")).map((r) => ({
    label: (r.label ?? "").trim(),
    stateId: (r.state_id ?? "").trim() || null,
    evidence: (r.evidence ?? "").trim(),
  }));
}

function readRsPartyResolutions(parseCsv: (t: string) => Record<string, string>[]): PartyDisposition[] {
  const path = join(ROOT, "PARTY_RESOLUTIONS.csv");
  if (!existsSync(path)) fail("PARTY_RESOLUTIONS.csv is missing (spec §4.3).");
  const yr = (v?: string) => {
    const t = (v ?? "").trim();
    return t ? Number(t) : null;
  };
  return parseCsv(readFileSync(path, "utf8")).map((r) => ({
    label: (r.label ?? "").trim(),
    fromYear: yr(r.from_year),
    toYear: yr(r.to_year),
    disposition: (r.disposition ?? "").trim() as "create" | "resolve",
    partyId: (r.party_id ?? "").trim() || null,
    reason: (r.reason ?? "").trim(),
  }));
}

async function dryRun() {
  const manifest = await verify();
  console.log(`[load-rajya-sabha] stage 1 — dry run (read-only)`);
  const { parseCsv } = await import("../src/lib/csv");
  const payload = manifest.find((m) => m.kind === "rs_members")!;
  const raw = parseCsv(readFileSync(join(ROOT, payload.file), "utf8"));
  const refused: Record<string, number> = {};
  const rows: RsRow[] = [];
  for (const r of raw) {
    const p = parseRsRow(r);
    if ("refused" in p) {
      refused[p.refused] = (refused[p.refused] ?? 0) + 1;
      continue;
    }
    rows.push(p);
  }
  const out = aggregateRs(rows);

  if (!process.env.DATABASE_URL) fail("DATABASE_URL not set.");
  const dbLabel = process.env.DATABASE_URL.replace(/\/\/[^@]*@/, "//…@");
  const { db } = await import("../src/lib/db");
  const schema = await import("../src/lib/db/schema");
  const { isNotNull } = await import("drizzle-orm");

  const known: KnownParty[] = await db
    .select({ id: schema.parties.id, name: schema.parties.name, abbreviation: schema.parties.abbreviation, isPseudo: schema.parties.isPseudo })
    .from(schema.parties);
  const stateRows = await db.select({ id: schema.states.id }).from(schema.states);
  const stateIds = new Set(stateRows.map((s) => s.id));
  const peopleRows = await db.select({ name: schema.people.name }).from(schema.people);
  const termNames = await db
    .selectDistinct({ name: schema.terms.cmName, kind: schema.terms.kind })
    .from(schema.terms)
    .where(isNotNull(schema.terms.cmName));

  // Party dispositions: the windowed machinery, full coverage required.
  const committed = readRsPartyResolutions(parseCsv);
  const chk = checkPartyResolutions(out.partyLabelYears, known, committed, true);

  // State links: validated; ids the rebuilt sandbox lacks (the D3-created
  // historical rows) are reported as pending, not failed — the insert stage
  // will hard-require them.
  const links = readStateLinks(parseCsv);
  const linkBy = new Map(links.map((l) => [l.label, l]));
  const D3_IDS = new Set(["ajmer", "bhopal", "bombay", "coorg", "hyderabad", "madhya-bharat", "madras", "mysore", "pepsu", "saurashtra", "travancore-cochin", "vindhya-pradesh"]);
  const stateProblems: string[] = [];
  const statePending: string[] = [];
  for (const l of links) {
    if (!l.stateId) continue;
    if (stateIds.has(l.stateId)) continue;
    if (D3_IDS.has(l.stateId)) statePending.push(`${l.label} → ${l.stateId} (exists after the D3 re-insert; container-reset consequence)`);
    else stateProblems.push(`"${l.label}" links to "${l.stateId}", which does not exist`);
  }
  const unlinkedStates = out.stateTallies.filter((s) => !linkBy.has(s.label));

  // Person-match candidates: RS members vs the archive's person surface.
  const archive = [
    ...peopleRows.map((p) => ({ name: p.name, kind: "people row (funding layer)" })),
    ...termNames.map((t) => ({ name: t.name!, kind: `${t.kind} term` })),
  ];
  const candidates = proposePersonMatches(out.members.map((m) => ({ tcpdId: m.tcpdId, name: m.name })), archive);

  const lines: string[] = [];
  lines.push(`# Rajya Sabha — stage 1 dry-run report`);
  lines.push(`\nGenerated ${new Date().toISOString().slice(0, 10)} against database ${dbLabel}.`);
  lines.push(`No writes were performed. Coverage ends ${RS_SNAPSHOT_DATE}; Type is a snapshot as of that date — both facts travel with every surface these rows ever reach.`);

  lines.push(`\n## Shape`);
  lines.push(`- term-rows parsed: ${out.termRows} of ${raw.length}`);
  for (const [reason, n] of Object.entries(refused)) lines.push(`- unparseable — ${reason}: ${n}`);
  lines.push(`- distinct members (stable TCPD ID): ${out.members.length}; multi-term: ${out.multiTermMembers}; max terms: ${out.maxTerms}`);
  // A summary that says "zero" while the body lists rows is the wrong shape:
  // say how many are the publisher's known quirk and how many nobody has
  // explained, and never fold the first into a bare zero.
  const anomalyKinds = classifyRsAnomalies(out.anomalies);
  lines.push(
    `- internal coherence: ${anomalyKinds.knownQuirk.length} known-quirk rows (${RS_KNOWN_QUIRK_WHY}), ${anomalyKinds.unexplained.length} unexplained`,
  );
  for (const a of anomalyKinds.unexplained) lines.push(`    - UNEXPLAINED: ${a}`);
  for (const a of anomalyKinds.knownQuirk.slice(0, 5)) lines.push(`    - known quirk: ${a}`);
  if (anomalyKinds.knownQuirk.length > 5)
    lines.push(`    - … and ${anomalyKinds.knownQuirk.length - 5} more of the same known kind (count above is exact)`);
  lines.push(`- Reason_of_Vacation values: ${out.reasons.map((r2) => `${r2.value || "(empty)"} ${r2.rows}`).join("; ")}`);

  lines.push(`\n## The ingested-column allowlist (spec §2.1, binding — the exact list)`);
  lines.push(`    ${RS_INGESTED_COLUMNS.join(", ")}`);
  lines.push(`Excluded and never read (${RS_EXCLUDED_COLUMNS.length} columns): the eleven PII columns bindingly, plus biographical/derived/free-text (spec §2.2). Gender_TCPD, if kept, is attributed as TCPD-derived.`);

  lines.push(`\n## Party dispositions (windowed, spec §4.3 — every row is a proposal at this gate)`);
  if (!chk.ok) {
    lines.push(`- PROBLEMS:`);
    for (const p of chk.problems) lines.push(`    - ${p}`);
  } else {
    lines.push(`- ${committed.length} committed rows over ${out.partyLabelYears.length} labels; no-party labels excluded by rule (${out.noPartyRows.map((n2) => `${n2.label} ${n2.rows} rows`).join("; ")} — kept verbatim with party_id null, per §4.2 and the 2026-09-03 ruling)`);
    lines.push(`- resolve: ${committed.filter((c) => c.disposition === "resolve").length}; create verbatim: ${committed.filter((c) => c.disposition === "create").length}; held label-years: ${chk.held.length === 0 ? "none" : ""}`);
    for (const h of chk.held) lines.push(`    - ${h.label}: ${h.years.join(", ")}`);
    lines.push(`- rows carrying evidence (era/variant pairings and flags for the gate):`);
    for (const d of committed.filter((c) => c.reason)) lines.push(`    - ${d.label}: ${d.disposition}${d.partyId ? ` → ${d.partyId}` : ""} (${d.reason})`);
  }
  lines.push(`- measured era facts the file must not pretend away: Congress 1952–96, INC 1952–2022, CONG(I) 1956–2000 OVERLAP (not clean eras); CONG(I)-from-1956 and BJP-from-1962 rows are anachronistic labels, reported, never repaired.`);

  lines.push(`\n## State links (spec §4.4)`);
  lines.push(`| label | → state | rows | evidence |`);
  lines.push(`|---|---|---|---|`);
  for (const s2 of out.stateTallies) {
    const l = linkBy.get(s2.label);
    lines.push(`| ${s2.label} | ${l ? (l.stateId ?? "**UNMATCHED**") : "**NOT IN FILE**"} | ${s2.rows} | ${l?.evidence ?? ""} |`);
  }
  for (const p of stateProblems) lines.push(`- PROBLEM: ${p}`);
  for (const p of statePending) lines.push(`- pending: ${p}`);
  for (const u of unlinkedStates) lines.push(`- NOT IN STATE_LINKS.csv (insert refuses): ${u.label}`);

  lines.push(`\n## Person-match candidates (spec §3 — proposed, never linked)`);
  lines.push(
    `- compared against ${peopleRows.length} people rows and ${termNames.length} distinct officeholder names IN THIS DATABASE. If that database was not production (a fixture sandbox has placeholder CM/PM names), this list is structurally empty and the real one comes from re-running the dry run against production — same rule as the elections reconciliation.`,
  );
  lines.push(`- ${candidates.length} normalised-name collisions:`);
  lines.push(`| TCPD ID | RS name (verbatim) | archive name | where |`);
  lines.push(`|---|---|---|---|`);
  for (const c of candidates) lines.push(`| ${c.tcpdId} | ${c.rsName} | ${c.archiveName} | ${c.archiveKind} |`);
  lines.push(`\nIdentity is the TCPD ID; these are entity_match_candidates at insert time, and a human links them or leaves them.`);

  lines.push(`\n## Gate`);
  lines.push(`Decisions needed before the insert stage is BUILT: (1) the party dispositions above, era rows especially (CONG(I) create-vs-windowed-resolve; the O label's unresolved handling); (2) the state links, including the four UNMATCHED (three composite seats, Kutch) and Others; (3) the person-match candidate list; (4) the allowlist as printed (Gender_TCPD kept-with-attribution, or dropped). Sequencing: the insert queues behind the electoral-bonds gate and the TCPD production reconciliation — no fourth front. A fresh verified restore drill precedes any insert; option (a) covers every export.`);

  const report = lines.join("\n");
  console.log("\n" + report + "\n");
  writeFileSync(join(ROOT, "dry-run-report.md"), report);
  console.log(`[load-rajya-sabha] report written to ${join(ROOT, "dry-run-report.md")}`);
}

const RS_DATASET_SLUG = "tcpd-rsd-1-30";
const RS_URL = "https://github.com/tcpd/rs-data-release";

/** The four state rows the 2026-09-03 ruling creates first-class (three
 *  composite 1950s RS seats + Kutch), no successor links, and the ten
 *  D3-created historical rows this insert may need to create itself if it
 *  runs before the D3 insert (create-if-missing keeps the runbook
 *  order-independent). Names for the D3 ids match the D3 loader EXACTLY. */
const RS_NEW_STATES: ReadonlyArray<{ id: string; name: string }> = [
  { id: "ajmer-and-coorg", name: "Ajmer and Coorg" },
  { id: "bilaspur-and-himachal-pradesh", name: "Bilaspur and Himachal Pradesh" },
  { id: "manipur-and-tripura", name: "Manipur and Tripura" },
  { id: "kutch", name: "Kutch" },
];
const D3_STATE_NAMES: Readonly<Record<string, string>> = {
  bhopal: "Bhopal",
  bombay: "Bombay",
  hyderabad: "Hyderabad",
  "madhya-bharat": "Madhya Bharat",
  madras: "Madras",
  mysore: "Mysore",
  pepsu: "Patiala & East Punjab States Union (PEPSU)",
  saurashtra: "Saurashtra",
  "travancore-cochin": "Travancore-Cochin",
  "vindhya-pradesh": "Vindhya Pradesh",
};

const partySlug = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Stage 2 — the insert, authorised by the 2026-09-03 gate rulings:
 * composite seats + Kutch become first-class state rows, no successor
 * links; "Others" is HELD — its term rows are not inserted and the report
 * prints every one; Nominated terms carry state_id null with the flag;
 * the Congress-family dispositions stand exactly as committed, no
 * windows; anachronistic labels (BJP from 1962, CONG(I) from 1956) become
 * open questions, never repairs; "O" is party-not-recorded — verbatim
 * label, party_id null; JAN creates verbatim with a bjs merge candidate;
 * the 13-column allowlist is binding, so nothing beyond it can ever reach
 * this function.
 */
async function insert() {
  const manifest = await verify();
  if (!process.env.DATABASE_URL) fail("DATABASE_URL not set.");
  if (!hasConfirm())
    fail("stage 2 inserts only with an explicit --confirm. Run --stage=dry-run first, read the report, then re-run with --confirm.");
  await requireInsertPreconditions(process.env.DATABASE_URL, fail);

  const { parseCsv } = await import("../src/lib/csv");
  const payload = manifest.find((m) => m.kind === "rs_members")!;
  const raw = parseCsv(readFileSync(join(ROOT, payload.file), "utf8"));
  const refused: Record<string, number> = {};
  const rows: RsRow[] = [];
  for (const r of raw) {
    const p = parseRsRow(r);
    if ("refused" in p) {
      refused[p.refused] = (refused[p.refused] ?? 0) + 1;
      continue;
    }
    rows.push(p);
  }
  const out = aggregateRs(rows);

  // The drop must measure exactly as the gate-approved stage-1 run did.
  if (Object.keys(refused).length > 0) fail("the approved run had zero unparseable rows; this run does not.");
  if (out.termRows !== 3538) fail(`term rows ${out.termRows}, approved run measured 3538.`);
  if (out.members.length !== 2412) fail(`members ${out.members.length}, approved run measured 2412.`);
  // The approved stage-1 run measured 109 anomalies, ALL of one known kind
  // (the publisher's snapshot semantics). Anything else — name drift,
  // duplicate Term_No, a nomination label on a non-nominated row — is new
  // and stops the insert.
  const { knownQuirk, unexplained } = classifyRsAnomalies(out.anomalies);
  if (unexplained.length > 0)
    fail(`the approved run had zero unexplained anomalies; this run has ${unexplained.length}:\n  - ${unexplained.slice(0, 10).join("\n  - ")}`);
  if (knownQuirk.length !== 109)
    fail(`known-quirk rows ${knownQuirk.length} (${RS_KNOWN_QUIRK_WHY}), approved run measured 109.`);
  const noPartyBy = new Map(out.noPartyRows.map((n) => [n.label, n.rows]));
  if (noPartyBy.get("NOM.") !== 134) fail(`NOM. rows ${noPartyBy.get("NOM.") ?? 0}, approved run measured 134.`);
  if (noPartyBy.get("O") !== 76) fail(`O rows ${noPartyBy.get("O") ?? 0}, approved run measured 76.`);
  if (noPartyBy.get("Nominated") !== 2) fail(`"Nominated" rows ${noPartyBy.get("Nominated") ?? 0}, the file carries 2.`);
  const othersRows = rows.filter((r) => r.stateLabel === "Others");
  if (othersRows.length !== 7) fail(`"Others" rows ${othersRows.length}, the ruling held exactly 7.`);

  const dbLabel = dbLabelOf(process.env.DATABASE_URL);
  const { db } = await import("../src/lib/db");
  const schema = await import("../src/lib/db/schema");
  const { eq, isNotNull, sql } = await import("drizzle-orm");
  const { v7: uuidv7 } = await import("uuid");
  const today = new Date().toISOString().slice(0, 10);

  const existing = await db.select({ id: schema.datasets.id }).from(schema.datasets).where(eq(schema.datasets.slug, RS_DATASET_SLUG));
  if (existing.length > 0) fail(`dataset ${RS_DATASET_SLUG} already exists: this drop is already ingested (revert first if that is intended).`);

  // ---- Party plan: full coverage, committed dispositions only ------------
  const known: KnownParty[] = await db
    .select({ id: schema.parties.id, name: schema.parties.name, abbreviation: schema.parties.abbreviation, isPseudo: schema.parties.isPseudo })
    .from(schema.parties);
  const committed = readRsPartyResolutions(parseCsv);
  const chk = checkPartyResolutions(out.partyLabelYears, known, committed, true);
  if (!chk.ok) fail(`PARTY_RESOLUTIONS.csv problems:\n  - ${chk.problems.join("\n  - ")}`);
  // The held set is pinned like every other approved measurement: exactly
  // one label-year has no window (SP in 1992, the term that predates the
  // Samajwadi Party). A mis-edited window would otherwise silently null
  // more attributions than the gate approved.
  const heldSummary = chk.held.map((h) => `${h.label}:${h.years.join("/")}`).sort().join("; ");
  if (heldSummary !== "SP:1992")
    fail(`held label-years are "${heldSummary || "none"}", the gate approved exactly "SP:1992". A window changed; a person must look.`);

  // Creates: verbatim rows. A label whose verbatim name already exists is
  // that disposition's own prior execution (isOwnCreation) — resolve to it.
  const existingPartyIds = new Set(known.map((p) => p.id));
  const createdPartyIds = new Map<string, string>();
  const ownCreations = new Map<string, string>();
  for (const label of chk.createLabels) {
    const prior = known.find((p) => p.name === label);
    if (prior) {
      ownCreations.set(label, prior.id);
      continue;
    }
    const base = partySlug(label);
    if (!base) fail(`party label "${label}" slugs to nothing.`);
    let slug = base;
    let n = 1;
    while (existingPartyIds.has(slug) || [...createdPartyIds.values()].includes(slug)) {
      n++;
      slug = `${base}-${n}`;
    }
    createdPartyIds.set(label, slug);
  }
  const noParty = new Set<string>(RS_NO_PARTY_LABELS);
  // A held label-year (no window covers it — the pre-founding 1992 SP row)
  // keeps its term: the seat was really held, only the party attribution is
  // unknown. So party_id stays null, the verbatim label survives, and the
  // row is named in the report. Dropping a real term would lose more than
  // the unresolved label does.
  const heldTerms: string[] = [];
  const partyIdFor = (label: string, year: number, termRef: string): string | null => {
    if (label === "" || noParty.has(label)) return null; // verbatim label survives on the term row
    const d = chk.dispositionFor(label, year);
    if (d.kind === "resolve") return d.partyId;
    if (d.kind === "create") return createdPartyIds.get(label) ?? ownCreations.get(label) ?? null;
    heldTerms.push(`${termRef}: "${label}" @ ${year}`);
    return null;
  };

  // ---- State plan: committed links + the ruling's four new rows ----------
  const links = readStateLinks(parseCsv);
  const linkBy = new Map(links.map((l) => [l.label, l]));
  const stateRows = await db.select({ id: schema.states.id, name: schema.states.name }).from(schema.states);
  const stateById = new Map(stateRows.map((s) => [s.id, s.name]));
  const toCreate: Array<{ id: string; name: string }> = [];
  for (const s of out.stateTallies) {
    const l = linkBy.get(s.label);
    if (!l) fail(`state label "${s.label}" has no STATE_LINKS.csv row.`);
    if (!l.stateId) {
      if (s.label !== "Nominated" && s.label !== "Others")
        fail(`state label "${s.label}" is unlinked and is neither Nominated nor the held Others.`);
      continue;
    }
    if (stateById.has(l.stateId)) continue;
    const fresh = RS_NEW_STATES.find((n) => n.id === l.stateId);
    const d3Name = D3_STATE_NAMES[l.stateId];
    if (fresh) toCreate.push(fresh);
    else if (d3Name) toCreate.push({ id: l.stateId, name: d3Name });
    else fail(`"${s.label}" links to "${l.stateId}", which neither exists nor is a row this insert may create.`);
  }
  for (const [id, name] of Object.entries(D3_STATE_NAMES)) {
    const have = stateById.get(id);
    if (have !== undefined && have !== name) fail(`state "${id}" exists with unexpected name "${have}".`);
  }
  const dedupedCreates = [...new Map(toCreate.map((s) => [s.id, s])).values()].sort((a, b) => a.id.localeCompare(b.id));

  // ---- Person-match candidates: people rows write, term names report -----
  const peopleRows = await db.select({ id: schema.people.id, name: schema.people.name }).from(schema.people);
  const termNames = await db
    .selectDistinct({ name: schema.terms.cmName, kind: schema.terms.kind })
    .from(schema.terms)
    .where(isNotNull(schema.terms.cmName));
  const peopleByName = new Map(peopleRows.map((p) => [p.name, p.id]));
  const personMatches = proposePersonMatches(
    out.members.map((m) => ({ tcpdId: m.tcpdId, name: m.name })),
    peopleRows.map((p) => ({ name: p.name, kind: "people" })),
  );
  const termNameMatches = proposePersonMatches(
    out.members.map((m) => ({ tcpdId: m.tcpdId, name: m.name })),
    termNames.map((t) => ({ name: t.name!, kind: `${t.kind} term` })),
  );

  const before = await starvedCounts();
  console.log(`[load-rajya-sabha] stage 2 — inserting into ${dbLabel}`);

  const datasetId = uuidv7();
  let termCount = 0;
  let memberCount = 0;
  let openQuestions = 0;
  let janCandidate = 0;
  let personCandidates = 0;

  await db.transaction(async (tx) => {
    await tx.insert(schema.datasets).values({
      id: datasetId,
      slug: RS_DATASET_SLUG,
      name: "TCPD Rajya Sabha Dataset (TCPD-RSD), 1952–2022, v1.30",
      publisher: "Trivedi Centre for Political Data, Ashoka University",
      version: payload.sourceVersion || "v1.30",
      licence: "TCPD terms: non-commercial use only, citation required, no endorsement (captured verbatim in data/raw/tcpd-rs/TERMS.md)",
      licenceUrl: RS_URL,
      retrievedOn: "2026-09-03",
      upstreamUrl: RS_URL,
      curator: "ai@cdswindia.org",
      notes:
        "Coverage ends 2022-07-20 and Type is a snapshot AS OF that date, never present tense; snapshot_on carries it on every term. " +
        "Type describes the MEMBER at the snapshot, repeated on every term row: a sitting member's earlier terms say 'Current' while carrying their own recorded end — the 109 such rows are the publisher's semantics, reported at stage 1, not an error. " +
        "Ingested through the binding 13-column allowlist (spec §2.1); the file's PII columns are mechanically unreachable and never enter any database. " +
        "Party labels NOM. and O are absences, not parties: kept verbatim with party_id null (2026-09-03 ruling). " +
        "The seven term rows with state 'Others' are HELD — not inserted; the insert report prints them in full for a human. " +
        "Composite 1950s RS seats (Ajmer and Coorg; Bilaspur and Himachal Pradesh; Manipur and Tripura) and Kutch are first-class state rows, no successor links. " +
        "Anachronistic labels (BJP from 1962, CONG(I) from 1956) are recorded as open questions, never repaired. " +
        "Gender_TCPD is TCPD's own derived field, attributed as theirs. Member identity is the TCPD ID; names are verbatim as published.",
    });

    for (const s of dedupedCreates) {
      await tx.insert(schema.states).values({ id: s.id, name: s.name, kind: "state", formedOn: null, dissolvedOn: null, hasGeometry: false });
      await tx.insert(schema.recordProvenance).values({ subjectType: "state", subjectId: s.id, datasetId, upstreamId: `state:${s.name}`, ingestedOn: today });
    }

    if (createdPartyIds.size > 0) {
      const rows2 = [...createdPartyIds.entries()].map(([label, id]) => ({ id, name: label, abbreviation: label, isPseudo: false }));
      for (let i = 0; i < rows2.length; i += 500) await tx.insert(schema.parties).values(rows2.slice(i, i + 500));
      const prov = [...createdPartyIds.entries()].map(([label, id]) => ({
        subjectType: "party" as const,
        subjectId: id,
        datasetId,
        upstreamId: `party:${label}`,
        ingestedOn: today,
      }));
      await tx.insert(schema.recordProvenance).values(prov);
    }

    const srcExisting = await tx.select({ id: schema.sources.id }).from(schema.sources).where(eq(schema.sources.url, RS_URL));
    const sourceId = srcExisting[0]?.id ?? uuidv7();
    if (!srcExisting[0]) {
      await tx.insert(schema.sources).values({
        id: sourceId,
        // The citation string the licence requires, verbatim from TERMS.md.
        title: '"TCPD Rajya Sabha Dataset (TCPD-RSD), 1952 - 2022". Trivedi Centre for Political Data, Ashoka University',
        url: RS_URL,
        publisher: "Trivedi Centre for Political Data, Ashoka University",
        publishedOn: null,
        accessedOn: "2026-09-03",
        kind: "research",
        isOfficial: false,
        isPrimary: true,
      });
    }

    // Members and terms. A member whose only term is held (Others) creates
    // no row; the report says so.
    const memberIdFor = new Map<string, string>();
    const memberRows: Array<typeof schema.rsMembers.$inferInsert> = [];
    const memberProv: Array<typeof schema.recordProvenance.$inferInsert> = [];
    const memberCites: Array<typeof schema.citations.$inferInsert> = [];
    const termRows2: Array<typeof schema.rsTerms.$inferInsert> = [];
    const termProv: Array<typeof schema.recordProvenance.$inferInsert> = [];
    for (const m of out.members) {
      const insertableTerms = m.terms.filter((t) => t.stateLabel !== "Others");
      if (insertableTerms.length === 0) continue;
      const memberId = uuidv7();
      memberIdFor.set(m.tcpdId, memberId);
      memberRows.push({ id: memberId, tcpdRsId: m.tcpdId, memberName: m.name, genderTcpd: m.terms[0].genderTcpd });
      memberProv.push({ subjectType: "rs_member", subjectId: memberId, datasetId, upstreamId: m.tcpdId, ingestedOn: today });
      memberCites.push({
        subjectType: "rs_member",
        subjectId: memberId,
        sourceId,
        note: `Row ${m.tcpdId} of TCPD-RSD v1.30; cite per data/raw/tcpd-rs/TERMS.md ("TCPD Rajya Sabha Dataset (TCPD-RSD), 1952 - 2022").`,
      });
      for (const t of insertableTerms) {
        const link = linkBy.get(t.stateLabel)!;
        termRows2.push({
          id: uuidv7(),
          memberId,
          stateId: link.stateId, // null for Nominated (the flag carries the fact)
          stateLabel: t.stateLabel,
          partyLabel: t.partyLabel,
          partyId: partyIdFor(t.partyLabel, Number(t.startDate.slice(0, 4)), `${m.tcpdId}-T${t.termNo} (${m.name})`),
          startDate: t.startDate,
          endDateTerm: t.endDateTerm,
          endDateActual: t.endDateActual,
          reasonOfVacation: t.reasonOfVacation || null,
          nominated: t.nominated,
          termNo: t.termNo,
          typeSnapshot: t.typeSnapshot,
          snapshotOn: RS_SNAPSHOT_DATE,
          sourceNote: t.source || null,
        });
        termProv.push({
          subjectType: "rs_term",
          subjectId: termRows2[termRows2.length - 1].id!,
          datasetId,
          upstreamId: `${m.tcpdId}-T${t.termNo}`,
          ingestedOn: today,
        });
      }
    }
    for (let i = 0; i < memberRows.length; i += 500) await tx.insert(schema.rsMembers).values(memberRows.slice(i, i + 500));
    for (let i = 0; i < memberProv.length; i += 500) await tx.insert(schema.recordProvenance).values(memberProv.slice(i, i + 500));
    for (let i = 0; i < memberCites.length; i += 500) await tx.insert(schema.citations).values(memberCites.slice(i, i + 500));
    for (let i = 0; i < termRows2.length; i += 500) await tx.insert(schema.rsTerms).values(termRows2.slice(i, i + 500));
    for (let i = 0; i < termProv.length; i += 500) await tx.insert(schema.recordProvenance).values(termProv.slice(i, i + 500));
    memberCount = memberRows.length;
    termCount = termRows2.length;

    // JAN ↔ bjs merge candidate (2026-09-03 ruling): unconditional. The
    // bjs row is D3's creation and may not exist yet in this database —
    // the candidate states the timing dependency instead of resolving blind.
    const janId = createdPartyIds.get("JAN") ?? ownCreations.get("JAN");
    if (janId) {
      await tx.insert(schema.entityMatchCandidates).values({
        id: uuidv7(),
        entityType: "party",
        aId: janId,
        bId: "bjs",
        status: "possible",
        rationale: `RS label "JAN" is the Bharatiya Jana Sangh; bjs is the D3 insert's row for the same party and may not exist until that insert runs — a human merges them when both are present, never the loader [dataset:${RS_DATASET_SLUG}]`,
      });
      janCandidate++;
    }

    // Person-match candidates against people rows (proposed, never linked).
    for (const c of personMatches) {
      const personId = peopleByName.get(c.archiveName);
      const memberId = memberIdFor.get(c.tcpdId);
      if (!personId || !memberId) continue;
      await tx.insert(schema.entityMatchCandidates).values({
        id: uuidv7(),
        entityType: "person",
        aId: personId,
        bId: memberId,
        status: "possible",
        rationale: `RS member ${c.tcpdId} ("${c.rsName}") and people row "${c.archiveName}" share a normalised name; identity stays the TCPD ID until a human links them [dataset:${RS_DATASET_SLUG}]`,
      });
      personCandidates++;
    }

    // Anachronistic labels → open questions, never repairs (the ruling).
    // Each question carries provenance so the revert can unmake it.
    const oqProvenance = async (id: string, upstreamId: string) =>
      tx.insert(schema.recordProvenance).values({ subjectType: "open_question", subjectId: id, datasetId, upstreamId, ingestedOn: today });
    const bjpYears = out.partyLabelYears.find((l) => l.label === "BJP")?.years ?? [];
    const bjpDisp = committed.find((c) => c.label === "BJP" && c.disposition === "resolve");
    if (bjpDisp?.partyId && bjpYears.length > 0 && bjpYears[0] < 1980) {
      const oqId = uuidv7();
      await tx.insert(schema.openQuestions).values({
        id: oqId,
        subjectType: "party",
        subjectId: bjpDisp.partyId,
        question: `TCPD-RSD labels Rajya Sabha terms from ${bjpYears[0]} with "BJP", a party founded in 1980 — the publisher back-labels earlier affiliations. The rows are loaded with the verbatim label and this resolved id, not repaired.`,
        whyItMatters: "A reader tracing this party's chamber presence back past 1980 is reading the publisher's back-labelling, not the historical party name; the archive must be able to say so.",
        whatWouldAnswerIt: "A per-era re-labelling from primary sources (which party each pre-1980 member actually sat for), reviewed by a person.",
      });
      await oqProvenance(oqId, "open-question:anachronism:BJP");
      openQuestions++;
    }
    const congIYears = out.partyLabelYears.find((l) => l.label === "CONG(I)")?.years ?? [];
    const congIId = createdPartyIds.get("CONG(I)") ?? ownCreations.get("CONG(I)");
    if (congIId && congIYears.length > 0 && congIYears[0] < 1978) {
      const oqId = uuidv7();
      await tx.insert(schema.openQuestions).values({
        id: oqId,
        subjectType: "party",
        subjectId: congIId,
        question: `TCPD-RSD labels Rajya Sabha terms from ${congIYears[0]} with "CONG(I)", a designation that exists only from the 1978 split — the publisher back-labels. The rows are loaded with the verbatim label against this created row, not repaired.`,
        whyItMatters: "The CONG(I) row would otherwise silently claim members from decades before the split existed.",
        whatWouldAnswerIt: "A per-era re-labelling from primary sources, reviewed by a person.",
      });
      await oqProvenance(oqId, "open-question:anachronism:CONG(I)");
      openQuestions++;
    }
    // The held Others rows, recorded in-database as an open question so the
    // hold cannot silently outlive everyone's memory of it.
    const othersOqId = uuidv7();
    await tx.insert(schema.openQuestions).values({
      id: othersOqId,
      subjectType: "dataset",
      subjectId: datasetId,
      question: `Seven TCPD-RSD term rows carry the opaque state label "Others" and are HELD (not inserted) by the 2026-09-03 ruling: ${othersRows.map((r) => `${r.tcpdId}-T${r.termNo}`).join(", ")}. The insert report prints them in full.`,
      whyItMatters: "Seven real terms are absent from the chamber spine until a human reads what 'Others' meant for each.",
      whatWouldAnswerIt: "A human reading of the seven rows against the Rajya Sabha's own records, then a follow-up ingest with committed state links.",
    });
    await oqProvenance(othersOqId, "open-question:others-hold");
    openQuestions++;
  });

  for (const t of ["states", "parties", "rs_members", "rs_terms", "datasets", "sources", "citations", "record_provenance", "entity_match_candidates", "open_questions"]) {
    await db.execute(sql.raw(`ANALYZE ${t}`));
  }
  const after = await starvedCounts();

  const lines: string[] = [];
  lines.push(`# Rajya Sabha — stage 2 insert report`);
  lines.push(`\nGenerated ${today} against database ${dbLabel}. Dataset slug: ${RS_DATASET_SLUG}.`);
  lines.push(`Reversible in one command: pnpm tsx scripts/load-rajya-sabha.ts --stage=revert --dataset=${RS_DATASET_SLUG} --confirm`);
  lines.push(`\n- rs_members inserted: ${memberCount} of ${out.members.length}${memberCount < out.members.length ? " (the difference had only held terms)" : ""}`);
  lines.push(`- rs_terms inserted: ${termCount} of ${out.termRows} (${othersRows.length} "Others" rows held)`);
  lines.push(`- state rows created by this insert: ${dedupedCreates.length === 0 ? "none (all existed)" : dedupedCreates.map((s) => s.id).join(", ")}`);
  lines.push(`- party rows created verbatim: ${createdPartyIds.size}; resolved to prior own-creations: ${ownCreations.size}`);
  lines.push(`- no-party labels kept verbatim with party_id null: ${out.noPartyRows.map((n) => `${n.label} ${n.rows}`).join("; ")} (absence markers, never party rows)`);
  lines.push(`- HELD label-years (no window covers them; party_id null, label verbatim, never guessed): ${heldTerms.length === 0 ? "none" : ""}`);
  for (const h of heldTerms) lines.push(`    - ${h}`);
  lines.push(`- internal coherence: ${knownQuirk.length} known-quirk rows (${RS_KNOWN_QUIRK_WHY}), ${unexplained.length} unexplained`);
  lines.push(`- entity_match_candidates written: ${janCandidate + personCandidates} (JAN↔bjs: ${janCandidate}; person matches against people rows: ${personCandidates}; term-name collisions stay report-only below)`);
  lines.push(`- open_questions: ${openQuestions} (anachronistic labels; the held Others rows)`);
  lines.push(`- Type snapshot: every term carries snapshot_on ${RS_SNAPSHOT_DATE}; coverage ends there`);
  lines.push(`\n## The seven held "Others" rows (the ruling: held, reported in full)`);
  lines.push(`| TCPD ID | member (verbatim) | party label | start | end (term) | reason |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const r of othersRows)
    lines.push(`| ${r.tcpdId} | ${r.memberName} | ${r.partyLabel} | ${r.startDate} | ${r.endDateTerm} | ${r.reasonOfVacation || "—"} |`);
  lines.push(`\n## Term-name collisions (report-only; officeholder terms are not people rows)`);
  if (termNameMatches.length === 0) lines.push(`- none in this database`);
  for (const c of termNameMatches) lines.push(`- ${c.tcpdId} "${c.rsName}" ~ "${c.archiveName}" (${c.archiveKind})`);
  lines.push(`\n## Starved panels — before/after (unchanged is expected: the RS spine feeds no election panel)`);
  lines.push(...panelDiffLines(before, after));
  const report = lines.join("\n");
  console.log("\n" + report + "\n");
  writeFileSync(join(ROOT, "insert-report.md"), report);
  console.log(`[load-rajya-sabha] report written to ${join(ROOT, "insert-report.md")}`);
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
  console.error("usage: pnpm tsx scripts/load-rajya-sabha.ts --stage=verify|dry-run|insert|revert --dataset=<slug> [--confirm]");
  process.exit(2);
}

main().catch((e) => {
  console.error("[load-rajya-sabha] FATAL:", e);
  process.exit(1);
});
