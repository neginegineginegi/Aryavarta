/**
 * TCPD / LokDhaba elections loader — stages 0 and 1 of
 * docs/ELECTIONS_INGEST_SPEC.md §5.
 *
 *   pnpm tsx scripts/load-tcpd.ts --stage=verify    # spec stage 0
 *   pnpm tsx scripts/load-tcpd.ts --stage=dry-run   # spec stage 1 (read-only)
 *
 * The insert stages are NOT implemented yet, on purpose: the dry-run gate's
 * decisions (historical states, conflict dispositions, the PATH_STATEMENT
 * wording check) shape them, so building them first would be building against
 * a report that does not exist. Asking for them exits with the gate message.
 *
 * Everything that interprets a row lives in src/lib/ingest/tcpd.ts, tested.
 * This file only reads files, talks to the database read-only, and prints.
 */
import "dotenv/config";

import { createHash } from "node:crypto";
import { closeSync, createReadStream, existsSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  aggregate,
  checkHeader,
  matchKnownParty,
  parseRow,
  reconcileAll,
  type AggregateOutcome,
  type ElectionAggregate,
  type HandElection,
  type KnownParty,
  type Reconciliation,
  type Scope,
} from "../src/lib/ingest/tcpd";

const ROOT = join(process.cwd(), "data", "raw", "tcpd");

type ManifestRow = {
  file: string;
  sha256: string;
  bytes: number;
  downloaded_on: string;
  source_url: string;
  source_version: string;
  kind: Scope | null;
  notes: string;
};

function fail(msg: string): never {
  console.error(`[load-tcpd] REFUSED: ${msg}`);
  process.exit(1);
}

/** First 8 KB of a file as UTF-8, without reading the rest (exports run to hundreds of MB). */
function readHead(path: string): string {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(8192);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    createReadStream(path)
      .on("data", (c) => hash.update(c))
      .on("end", resolve)
      .on("error", reject);
  });
  return hash.digest("hex");
}

async function readManifest(): Promise<ManifestRow[]> {
  const manifestPath = join(ROOT, "MANIFEST.csv");
  if (!existsSync(manifestPath))
    fail(`data/raw/tcpd/MANIFEST.csv is missing. The drop has not happened; see docs/ELECTIONS_INGEST_SPEC.md §1.2 and MANIFEST.csv.example.`);
  if (!existsSync(join(ROOT, "TERMS.md")))
    fail(`data/raw/tcpd/TERMS.md is missing. Capture the licence/citation page verbatim before anything runs (§1.4).`);

  const { parseCsv } = await import("../src/lib/csv");
  const rows = parseCsv(readFileSync(manifestPath, "utf8"));
  if (rows.length === 0) fail("MANIFEST.csv has no data rows.");

  return rows.map((r) => {
    const file = (r.file ?? "").trim();
    if (!file) fail("MANIFEST.csv row with empty `file`.");
    const dir = file.split("/")[0];
    const kindRaw = (r.kind ?? "").trim().toLowerCase();
    const kind: Scope | null =
      kindRaw === "ae" ? "state_assembly"
      : kindRaw === "ge" ? "lok_sabha"
      : dir === "ae" ? "state_assembly"
      : dir === "ge" ? "lok_sabha"
      : null;
    if (kind === null)
      fail(`cannot tell whether "${file}" is assembly or general data: files under early/ need kind=ae or kind=ge in the manifest.`);
    const bytes = Number((r.bytes ?? "").trim());
    if (!Number.isInteger(bytes) || bytes <= 0) fail(`"${file}": bytes must be a positive integer.`);
    if (!/^[0-9a-f]{64}$/i.test((r.sha256 ?? "").trim())) fail(`"${file}": sha256 must be 64 hex characters.`);
    return {
      file,
      sha256: r.sha256.trim().toLowerCase(),
      bytes,
      downloaded_on: (r.downloaded_on ?? "").trim(),
      source_url: (r.source_url ?? "").trim(),
      source_version: (r.source_version ?? "").trim() || "unversioned",
      kind,
      notes: (r.notes ?? "").trim(),
    };
  });
}

/** Spec stage 0: the drop either matches the manifest byte-for-byte and
 *  column-for-column, or nothing runs. */
async function verify(): Promise<ManifestRow[]> {
  const manifest = await readManifest();
  console.log(`[load-tcpd] stage 0 — verifying ${manifest.length} file(s) against MANIFEST.csv`);

  for (const m of manifest) {
    const path = join(ROOT, m.file);
    if (!existsSync(path)) fail(`"${m.file}" is listed but not on disk.`);
    const actualBytes = statSync(path).size;
    if (actualBytes !== m.bytes) fail(`"${m.file}": ${actualBytes} bytes on disk, manifest says ${m.bytes}.`);
    const digest = await sha256(path);
    if (digest !== m.sha256) fail(`"${m.file}": sha256 mismatch.\n  disk:     ${digest}\n  manifest: ${m.sha256}`);

    const firstLine = readHead(path).split(/\r?\n/)[0];
    const header = firstLine.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    const check = checkHeader(header);
    if (!check.ok)
      fail(`"${m.file}": header is missing required column(s): ${check.missing.join(", ")}. The export schema has drifted from the spec's expectation (§2.1); a person must look before anything proceeds.`);
    if (check.unknown.length > 0)
      console.log(`  note: "${m.file}" carries column(s) the spec has never heard of: ${check.unknown.join(", ")} (ignored by this pass, flagged for the report)`);
    console.log(`  ok: ${m.file} (${(m.bytes / 1e6).toFixed(1)} MB, sha256 verified, header verified)`);
  }
  console.log("[load-tcpd] stage 0 passed.");
  return manifest;
}

async function loadHandElections(): Promise<{ hand: HandElection[]; allParties: KnownParty[]; dbLabel: string }> {
  if (!process.env.DATABASE_URL) fail("DATABASE_URL not set: the dry run must reconcile against a database (run where production credentials exist).");
  const dbLabel = process.env.DATABASE_URL.replace(/\/\/[^@]*@/, "//…@");
  const { db } = await import("../src/lib/db");
  const { elections, electionResults, parties, citations } = await import("../src/lib/db/schema");
  const { isNull, eq, sql } = await import("drizzle-orm");

  const els = await db.select().from(elections).where(isNull(elections.deletedAt));
  const results = await db
    .select({
      electionId: electionResults.electionId,
      partyId: electionResults.partyId,
      seatsWon: electionResults.seatsWon,
      seatsContested: electionResults.seatsContested,
      voteSharePercent: electionResults.voteSharePercent,
      name: parties.name,
      abbreviation: parties.abbreviation,
    })
    .from(electionResults)
    .innerJoin(parties, eq(parties.id, electionResults.partyId));
  const cites = await db
    .select({ subjectId: citations.subjectId, n: sql<number>`count(*)` })
    .from(citations)
    .where(eq(citations.subjectType, "election"))
    .groupBy(citations.subjectId);
  const citeBy = new Map(cites.map((c) => [c.subjectId, Number(c.n)]));
  const allParties: KnownParty[] = await db
    .select({ id: parties.id, name: parties.name, abbreviation: parties.abbreviation, isPseudo: parties.isPseudo })
    .from(parties);

  const byElection = new Map<string, HandElection>();
  for (const e of els) {
    byElection.set(e.id, {
      id: e.id,
      stateId: e.stateId,
      scope: e.scope as Scope,
      electionDate: String(e.electionDate),
      assemblyNumber: e.assemblyNumber,
      totalSeats: e.totalSeats,
      turnoutPercent: e.turnoutPercent === null ? null : Number(e.turnoutPercent),
      citationCount: citeBy.get(e.id) ?? 0,
      parties: [],
    });
  }
  for (const r of results) {
    byElection.get(r.electionId)?.parties.push({
      partyId: r.partyId,
      name: r.name,
      abbreviation: r.abbreviation,
      seatsWon: r.seatsWon,
      seatsContested: r.seatsContested,
      voteSharePercent: r.voteSharePercent === null ? null : Number(r.voteSharePercent),
    });
  }
  return { hand: [...byElection.values()], allParties, dbLabel };
}

function aggregateFiles(manifest: ManifestRow[], parseCsv: (t: string) => Record<string, string>[]) {
  const rowsByScope: Record<Scope, ReturnType<typeof parseRow>[]> = { state_assembly: [], lok_sabha: [] };
  const parseRefused: Record<string, number> = {};

  for (const m of manifest) {
    const raw = parseCsv(readFileSync(join(ROOT, m.file), "utf8"));
    for (const r of raw) {
      const p = parseRow(r);
      if ("refused" in p) {
        parseRefused[p.refused] = (parseRefused[p.refused] ?? 0) + 1;
        continue;
      }
      rowsByScope[m.kind!].push(p);
    }
    console.log(`  read ${m.file}: ${raw.length} rows`);
  }

  const ae = aggregate(rowsByScope.state_assembly.filter((r) => !("refused" in r)) as never, "state_assembly");
  const ge = aggregate(rowsByScope.lok_sabha.filter((r) => !("refused" in r)) as never, "lok_sabha");
  return { ae, ge, parseRefused };
}

function reportAggregate(label: string, out: AggregateOutcome, lines: string[]) {
  lines.push(`\n## ${label}`);
  lines.push(`- elections: ${out.elections.length}`);
  lines.push(`- bye-election rows excluded (A6): ${out.byeRowCount}`);
  lines.push(`- exact duplicate candidate rows refused: ${out.duplicateRowCount}`);
  const unmapped = Object.entries(out.unmappedStates);
  if (unmapped.length > 0) {
    lines.push(`- UNMAPPED STATE NAMES (A1) — curatorial decision needed at this gate:`);
    for (const [name, n] of unmapped.sort((a, b) => b[1] - a[1])) lines.push(`    - ${name}: ${n} rows refused`);
  } else {
    lines.push(`- unmapped state names (A1): none`);
  }
  for (const [reason, n] of Object.entries(out.refused)) lines.push(`- refused rows — ${reason}: ${n}`);

  lines.push(`\n### Elections per state × year`);
  const byState = new Map<string, number[]>();
  for (const e of out.elections) {
    const k = e.stateId ?? e.stateName;
    byState.set(k, [...(byState.get(k) ?? []), e.year]);
  }
  for (const [state, years] of [...byState.entries()].sort()) {
    lines.push(`- ${state}: ${years.length} elections (${Math.min(...years)}–${Math.max(...years)})`);
  }

  const withheld = out.elections.filter((e) => e.validVotesTotal === null).length;
  const monthless = out.elections.filter((e) => e.datePrecision === "year").length;
  lines.push(`\n- elections with vote shares withheld (A7): ${withheld}`);
  lines.push(`- elections at year precision (A2): ${monthless}; at month precision: ${out.elections.length - monthless}`);
  const anomalous = out.elections.filter((e) => e.anomalies.length > 0);
  lines.push(`- elections with anomalies: ${anomalous.length}`);
  for (const e of anomalous.slice(0, 40)) lines.push(`    - ${e.upstreamId}: ${e.anomalies.join("; ")}`);
  if (anomalous.length > 40) lines.push(`    - … and ${anomalous.length - 40} more (full list in the data, not truncated silently: count above is exact)`);
}

function reportReconciliation(recs: Reconciliation[], lines: string[]) {
  lines.push(`\n## Reconciliation (spec §4)`);
  const matches = recs.filter((r) => r.outcome === "match");
  const disagreements = matches.flatMap((m) =>
    m.fields.filter((f) => !f.agree).map((f) => ({ m, f })),
  );
  const handOnly = recs.filter((r) => r.outcome === "hand_only");
  const tcpdOnly = recs.filter((r) => r.outcome === "tcpd_only");
  const ambiguous = recs.filter((r) => r.outcome === "ambiguous");

  lines.push(`- matched elections: ${matches.length}`);
  lines.push(`- field disagreements: ${disagreements.length} (table below; NEVER auto-resolved)`);
  lines.push(`- hand-only (coverage boundary or missing from TCPD): ${handOnly.length}`);
  lines.push(`- tcpd-only (would be inserted in stages 2–3): ${tcpdOnly.length}`);
  lines.push(`- ambiguous pairings (cardinality conflicts): ${ambiguous.length}`);

  lines.push(`\n### Disagreements first`);
  lines.push(`| state | scope | year | field | hand | hand citations | TCPD | upstream_id |`);
  lines.push(`|---|---|---|---|---|---|---|---|`);
  for (const { m, f } of disagreements) {
    lines.push(
      `| ${m.hand.stateId} | ${m.hand.scope} | ${m.tcpd.year} | ${f.field} | ${f.hand} | ${m.hand.citationCount} | ${f.tcpd} | ${m.tcpd.upstreamId} |`,
    );
  }
  if (disagreements.length === 0) lines.push(`| — | — | — | (none) | | | | |`);

  lines.push(`\n### Coverage boundary (hand rows not checkable against this dataset version)`);
  for (const h of handOnly) {
    lines.push(`- ${h.hand.stateId} ${h.hand.scope} ${h.hand.electionDate} (citations: ${h.hand.citationCount}) — not in the TCPD export; explicitly NOT evidence against the row`);
  }

  const partial = matches.filter((m) => m.unmatchedHandParties.length || m.unmatchedTcpdParties.length);
  lines.push(`\n### Party boundary within matched elections (non-comparisons, per §4.2 — shown, never disagreements)`);
  if (partial.length === 0) lines.push(`- every party in every matched election paired both ways`);
  for (const m of partial) {
    const bits: string[] = [];
    if (m.unmatchedHandParties.length) bits.push(`hand-only parties: ${m.unmatchedHandParties.join(", ")}`);
    if (m.unmatchedTcpdParties.length) bits.push(`TCPD-only labels: ${m.unmatchedTcpdParties.join(", ")}`);
    lines.push(`- ${m.hand.stateId} ${m.hand.scope} ${m.tcpd.year} (${m.tcpd.upstreamId}): ${bits.join("; ")}`);
  }

  for (const a of ambiguous) {
    lines.push(`\n### AMBIGUOUS: ${a.key} — ${a.hands.length} hand row(s) vs ${a.tcpds.length} TCPD group(s); human pairing required`);
  }

  // The named check: WB 2026 turnout appears whatever its outcome (§4.3).
  lines.push(`\n### Named check — West Bengal 2026 turnout`);
  const wb = recs.find(
    (r) =>
      (r.outcome === "match" && r.hand.stateId === "wb" && r.tcpd.year === 2026) ||
      (r.outcome === "hand_only" && r.hand.stateId === "wb" && r.hand.electionDate.startsWith("2026")),
  );
  if (!wb) {
    lines.push(`- No West Bengal 2026 hand row found in the database this dry run reconciled against. If that database was not production, re-run there before treating this section as answered.`);
  } else if (wb.outcome === "hand_only") {
    lines.push(`- Hand row exists (turnout ${wb.hand.turnoutPercent ?? "—"}, citations ${wb.hand.citationCount}); TCPD export does not reach WB 2026 → coverage boundary. The figure remains checked only by its own citations.`);
  } else if (wb.outcome === "match") {
    const t = wb.fields.find((f) => f.field === "turnout_percent");
    lines.push(`- Hand turnout ${t?.hand} vs TCPD (stored) ${t?.tcpd}. TCPD-side turnout is never stored (A3); where the export carries per-constituency electors and turnout, the derived elector-weighted figure belongs here and is computed at report time in stage 1 execution against the real file.`);
  }
}

/** Spec §3 / A4 against the real `parties` table: every distinct TCPD label
 *  across every aggregated election, resolved or listed for creation. This is
 *  the list gate decision (3) confirms — nothing is created here. */
function reportPartyIdentity(aggs: ElectionAggregate[], known: KnownParty[], lines: string[]) {
  type Tally = { name: string; elections: number; sample: string };
  const labels = new Map<string, Tally>();
  for (const e of aggs) {
    for (const p of e.parties) {
      const t = labels.get(p.recordedLabel);
      if (t) t.elections += 1;
      else labels.set(p.recordedLabel, { name: p.partyName, elections: 1, sample: e.upstreamId });
    }
  }

  const resolved: string[] = [];
  const creates: { label: string; t: Tally }[] = [];
  const many: { label: string; t: Tally; ids: string[] }[] = [];
  for (const [label, t] of labels) {
    const m = matchKnownParty(known, label, t.name);
    if (m.kind === "one") resolved.push(`${label} → ${m.party.id}${m.party.isPseudo ? " (pseudo)" : ""}`);
    else if (m.kind === "many") many.push({ label, t, ids: m.parties.map((p) => p.id) });
    else creates.push({ label, t });
  }

  lines.push(`\n## Party identity (spec §3, A4)`);
  lines.push(`- distinct TCPD labels: ${labels.size}`);
  lines.push(`- resolve to an existing party: ${resolved.length}`);
  lines.push(`- would be CREATED by the insert stages: ${creates.length} (list below; gate decision 3)`);
  lines.push(`- AMBIGUOUS (more than one existing party matches): ${many.length}`);
  const indResolved = resolved.find((r) => r.split(" ")[0] === "IND");
  lines.push(
    !labels.has("IND")
      ? `- IND disposition: no independent candidates in this drop`
      : indResolved
        ? `- IND disposition: ${indResolved} — the independents aggregate reuses the existing pseudo-party, nothing is created for it`
        : `- IND disposition: no existing party matched the independents aggregate, so it appears in the would-create list — check the pseudo party's abbreviation before accepting a creation`,
  );

  if (creates.length > 0) {
    lines.push(`\n### Would-create parties (verbatim TCPD labels, never unified)`);
    lines.push(`| label | name as stored | elections | sample upstream_id |`);
    lines.push(`|---|---|---|---|`);
    for (const c of creates.sort((a, b) => b.t.elections - a.t.elections || a.label.localeCompare(b.label))) {
      lines.push(`| ${c.label} | ${c.t.name} | ${c.t.elections} | ${c.t.sample} |`);
    }
  }
  for (const m of many) {
    lines.push(`- AMBIGUOUS party identity: TCPD "${m.label}" matches existing parties ${m.ids.join(", ")} — a human pairs this; the loader will not pick.`);
  }
}

async function dryRun() {
  const manifest = await verify();
  console.log(`[load-tcpd] stage 1 — dry run (read-only)`);
  const { parseCsv } = await import("../src/lib/csv");
  const { ae, ge, parseRefused } = aggregateFiles(manifest, parseCsv);
  const { hand, allParties, dbLabel } = await loadHandElections();

  const allAggs = [...ae.elections, ...ge.elections];
  const recs = reconcileAll(hand, allAggs);

  const lines: string[] = [];
  lines.push(`# TCPD ingest — stage 1 dry-run report`);
  lines.push(`\nGenerated ${new Date().toISOString().slice(0, 10)} against database ${dbLabel}.`);
  lines.push(`No writes were performed. This report is the §5 stage-1 gate deliverable.`);
  for (const [reason, n] of Object.entries(parseRefused)) lines.push(`- unparseable rows — ${reason}: ${n}`);
  reportAggregate("Vidhan Sabha (assembly)", ae, lines);
  reportAggregate("Lok Sabha (general)", ge, lines);
  reportReconciliation(recs, lines);
  reportPartyIdentity(allAggs, allParties, lines);
  lines.push(`\n## Gate`);
  lines.push(`Decisions needed before stage 2: (1) disposition of every disagreement above; (2) the A1 unmapped-states ruling; (3) the would-create party list confirmed and every AMBIGUOUS party identity paired by a human. See docs/ELECTIONS_INGEST_SPEC.md §5.`);

  const report = lines.join("\n");
  console.log("\n" + report + "\n");
  const outPath = join(ROOT, "dry-run-report.md");
  writeFileSync(outPath, report);
  console.log(`[load-tcpd] report written to ${outPath}`);
}

async function main() {
  const stage = process.argv.find((a) => a.startsWith("--stage="))?.slice(8);
  if (stage === "verify") return void (await verify());
  if (stage === "dry-run") return void (await dryRun());
  if (stage === "insert-ae" || stage === "insert-ge") {
    console.error(
      `[load-tcpd] GATED: the insert stages are built only after the stage-1 dry-run report returns with a go, because the gate's decisions (historical states, conflicts, new parties) shape them. See docs/ELECTIONS_INGEST_SPEC.md §5.`,
    );
    process.exit(2);
  }
  console.error("usage: pnpm tsx scripts/load-tcpd.ts --stage=verify|dry-run");
  process.exit(2);
}

main().catch((e) => {
  console.error("[load-tcpd] FATAL:", e);
  process.exit(1);
});
