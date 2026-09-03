/**
 * Rajya Sabha loader — stages 0 and 1 of docs/RAJYA_SABHA_SPEC.md.
 *
 *   pnpm tsx scripts/load-rajya-sabha.ts --stage=verify
 *   pnpm tsx scripts/load-rajya-sabha.ts --stage=dry-run   # read-only
 *
 * The insert stage is NOT implemented, and by the sequencing ruling it
 * queues behind the electoral-bonds gate and the TCPD production
 * reconciliation. Everything that interprets a row lives in
 * src/lib/ingest/rajya-sabha.ts, behind the binding column allowlist.
 */
import "dotenv/config";

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  aggregateRs,
  checkRsHeader,
  parseRsRow,
  proposePersonMatches,
  RS_EXCLUDED_COLUMNS,
  RS_INGESTED_COLUMNS,
  RS_SNAPSHOT_DATE,
  type RsRow,
} from "../src/lib/ingest/rajya-sabha";
import { checkPartyResolutions, type KnownParty, type PartyDisposition } from "../src/lib/ingest/tcpd";

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

type ManifestRow = { file: string; kind: "rs_members" | "doc"; sha256: string; bytes: number };

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
    return { file: (r.file ?? "").trim(), kind, sha256: r.sha256.trim().toLowerCase(), bytes };
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
  lines.push(`- internal coherence anomalies: ${out.anomalies.length === 0 ? "none" : ""}`);
  for (const a of out.anomalies.slice(0, 25)) lines.push(`    - ${a}`);
  lines.push(`- Reason_of_Vacation values: ${out.reasons.map((r2) => `${r2.value || "(empty)"} ${r2.rows}`).join("; ")}`);

  lines.push(`\n## The ingested-column allowlist (spec §2.1, binding — the exact list)`);
  lines.push(`    ${RS_INGESTED_COLUMNS.join(", ")}`);
  lines.push(`Excluded and never read (${RS_EXCLUDED_COLUMNS.length} columns): the eleven PII columns bindingly, plus biographical/derived/free-text (spec §2.2). Gender_TCPD, if kept, is attributed as TCPD-derived.`);

  lines.push(`\n## Party dispositions (windowed, spec §4.3 — every row is a proposal at this gate)`);
  if (!chk.ok) {
    lines.push(`- PROBLEMS:`);
    for (const p of chk.problems) lines.push(`    - ${p}`);
  } else {
    lines.push(`- ${committed.length} committed rows over ${out.partyLabelYears.length} labels; NOM. is excluded by rule (not a party; all 134 rows verified Nominated=TRUE)`);
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

async function main() {
  const stage = process.argv.find((a) => a.startsWith("--stage="))?.slice(8);
  if (stage === "verify") return void (await verify());
  if (stage === "dry-run") return void (await dryRun());
  if (stage === "insert") {
    console.error(
      `[load-rajya-sabha] GATED: the insert queues behind the electoral-bonds gate and the TCPD production reconciliation, and is built only after the stage-1 report returns approved. See docs/RAJYA_SABHA_SPEC.md §6.`,
    );
    process.exit(2);
  }
  console.error("usage: pnpm tsx scripts/load-rajya-sabha.ts --stage=verify|dry-run");
  process.exit(2);
}

main().catch((e) => {
  console.error("[load-rajya-sabha] FATAL:", e);
  process.exit(1);
});
