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
  aggregateEarly,
  checkEarlyHeader,
  checkHeader,
  matchKnownParty,
  parseEarlyRow,
  parseRow,
  reconcileAll,
  type AggregateOutcome,
  type EarlyAggregateOutcome,
  type ElectionAggregate,
  type HandElection,
  type KnownParty,
  type Reconciliation,
  type Scope,
} from "../src/lib/ingest/tcpd";

/** The drop directory. Run from the repo root; TCPD_ROOT overrides the
 *  location when the drop lives elsewhere (another disk, a smoke fixture). */
const ROOT = process.env.TCPD_ROOT ?? join(process.cwd(), "data", "raw", "tcpd");

/** "both" = the early 1951–62 file (one file, AE and GE rows separated by
 *  Election_Type, early schema per spec §2.8); "doc" = a checksummed
 *  document (codebook), verified but never parsed. */
type ManifestKind = Scope | "both" | "doc";

type ManifestRow = {
  file: string;
  sha256: string;
  bytes: number;
  downloaded_on: string;
  source_url: string;
  source_version: string;
  kind: ManifestKind | null;
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
    const kind: ManifestKind | null =
      kindRaw === "ae" ? "state_assembly"
      : kindRaw === "ge" ? "lok_sabha"
      : kindRaw === "both" ? "both"
      : kindRaw === "doc" ? "doc"
      : dir === "ae" ? "state_assembly"
      : dir === "ge" ? "lok_sabha"
      : null;
    if (kind === null)
      fail(`cannot tell whether "${file}" is assembly or general data: files under early/ need kind=ae, kind=ge, kind=both, or kind=doc in the manifest.`);
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

    if (m.kind === "doc") {
      console.log(`  ok: ${m.file} (${(m.bytes / 1e6).toFixed(1)} MB, sha256 verified; document, never parsed)`);
      continue;
    }
    const firstLine = readHead(path).split(/\r?\n/)[0];
    const header = firstLine.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    const check = m.kind === "both" ? checkEarlyHeader(header) : checkHeader(header);
    if (!check.ok)
      fail(`"${m.file}": header is missing required column(s): ${check.missing.join(", ")}. The export schema has drifted from the spec's expectation (§2.1/§2.8); a person must look before anything proceeds.`);
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

type CommittedAlias = { variant: string; canonical: string; rows: number; note: string };

/** The committed state-spelling alias map (spec §2.8): a typo corrected
 *  invisibly is still a silent transformation, so the corrections live in
 *  data/raw/tcpd/STATE_ALIASES.csv, are applied visibly, and the dry-run
 *  report checks the measured row counts against the committed ones. */
function readAliases(parseCsv: (t: string) => Record<string, string>[]): { map: Record<string, string>; committed: CommittedAlias[] } {
  const path = join(ROOT, "STATE_ALIASES.csv");
  if (!existsSync(path))
    fail("data/raw/tcpd/STATE_ALIASES.csv is missing: the early file's spelling conflicts must resolve through the committed alias map, never in code (§2.8).");
  const committed: CommittedAlias[] = parseCsv(readFileSync(path, "utf8")).map((r) => {
    const variant = (r.variant ?? "").trim();
    const canonical = (r.canonical ?? "").trim();
    const rows = Number((r.rows ?? "").trim());
    if (!variant || !canonical) fail("STATE_ALIASES.csv row with empty variant or canonical.");
    if (!Number.isInteger(rows) || rows <= 0) fail(`STATE_ALIASES.csv "${variant}": rows must be a positive integer.`);
    return { variant, canonical, rows, note: (r.note ?? "").trim() };
  });
  return { map: Object.fromEntries(committed.map((a) => [a.variant, a.canonical])), committed };
}

function aggregateFiles(manifest: ManifestRow[], parseCsv: (t: string) => Record<string, string>[]) {
  const rowsByScope: Record<Scope, ReturnType<typeof parseRow>[]> = { state_assembly: [], lok_sabha: [] };
  const parseRefused: Record<string, number> = {};
  const earlyFiles = manifest.filter((m) => m.kind === "both");
  const aliases = earlyFiles.length > 0 ? readAliases(parseCsv) : { map: {}, committed: [] as CommittedAlias[] };
  const earlyRows: ReturnType<typeof parseEarlyRow>[] = [];
  const earlyRefused: Record<string, number> = {};

  for (const m of manifest) {
    if (m.kind === "doc") continue;
    const raw = parseCsv(readFileSync(join(ROOT, m.file), "utf8"));
    if (m.kind === "both") {
      for (const r of raw) {
        const p = parseEarlyRow(r, aliases.map);
        if ("refused" in p) {
          earlyRefused[p.refused] = (earlyRefused[p.refused] ?? 0) + 1;
          continue;
        }
        earlyRows.push(p);
      }
    } else {
      for (const r of raw) {
        const p = parseRow(r);
        if ("refused" in p) {
          parseRefused[p.refused] = (parseRefused[p.refused] ?? 0) + 1;
          continue;
        }
        rowsByScope[m.kind!].push(p);
      }
    }
    console.log(`  read ${m.file}: ${raw.length} rows`);
  }

  const ae = aggregate(rowsByScope.state_assembly.filter((r) => !("refused" in r)) as never, "state_assembly");
  const ge = aggregate(rowsByScope.lok_sabha.filter((r) => !("refused" in r)) as never, "lok_sabha");
  const early = earlyRows.length > 0 ? aggregateEarly(earlyRows.filter((r) => !("refused" in r)) as never) : null;
  return { ae, ge, parseRefused, early, earlyRefused, committedAliases: aliases.committed };
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

function reportReconciliation(recs: Reconciliation[], lines: string[], coverage: { min: number; max: number } | null) {
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
  // Hand rows INSIDE the drop's year window are individually interesting:
  // TCPD reaches those years yet lacks the election. Rows OUTSIDE it are just
  // the drop's edges, and listing hundreds of them would bury the gate, so
  // they compress to per-state counts. Neither kind is evidence against a row.
  const inside = handOnly.filter((h) => {
    const y = Number(h.hand.electionDate.slice(0, 4));
    return coverage !== null && y >= coverage.min && y <= coverage.max;
  });
  const outside = handOnly.filter((h) => !inside.includes(h));
  for (const h of inside) {
    lines.push(`- ${h.hand.stateId} ${h.hand.scope} ${h.hand.electionDate} (citations: ${h.hand.citationCount}) — within the drop's ${coverage!.min}–${coverage!.max} window yet not in the export; explicitly NOT evidence against the row, but worth a look`);
  }
  if (inside.length === 0) lines.push(`- no hand-only elections inside the drop's year window${coverage ? ` (${coverage.min}–${coverage.max})` : ""}`);
  if (outside.length > 0) {
    const byState = new Map<string, number[]>();
    for (const h of outside) {
      const k = `${h.hand.stateId} ${h.hand.scope}`;
      byState.set(k, [...(byState.get(k) ?? []), Number(h.hand.electionDate.slice(0, 4))]);
    }
    lines.push(`- outside the drop's window entirely, so not checkable and not listed one by one: ${outside.length} hand elections — ${[...byState.entries()]
      .sort()
      .map(([k, ys]) => `${k}: ${ys.length} (${Math.min(...ys)}–${Math.max(...ys)})`)
      .join("; ")}`);
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

/** The early-file (D3) sections of the dry-run report: the expected-numbers
 *  gate check, the alias audit, the insertable A9 view, the multi-member and
 *  turnout-semantics findings, the historical-states decision block, and the
 *  licence flag. Everything here is measured; nothing is repaired. */
function reportEarly(
  early: EarlyAggregateOutcome,
  committedAliases: CommittedAlias[],
  earlyRefused: Record<string, number>,
  lines: string[],
) {
  lines.push(`\n## Early file: TCPD-IED 1951–62 (D3, spec §2.8)`);

  // The gate's expected numbers, from the delivery instruction and
  // D3_FINDINGS.md, measured on the file's own grouping (Election_Type,
  // canonical State_Name, Assembly_No) BEFORE the A9 national GE rollup.
  const exp = { elections: 82, withSeats: 371, all: 669 };
  const f = early.fileGroups;
  const mark = (got: number, want: number) => (got === want ? "matches" : `EXPECTED ${want} — MISMATCH, stop and look`);
  lines.push(`\n### Expected-numbers check (file grouping: Election_Type × state × Assembly_No)`);
  lines.push(`- election groups: ${f.elections} (${mark(f.elections, exp.elections)})`);
  lines.push(`- party result rows, parties with ≥1 seat: ${f.partyRowsWithSeats} (${mark(f.partyRowsWithSeats, exp.withSeats)})`);
  lines.push(`- party result rows, zero-seat contesting parties included: ${f.partyRowsAll} (${mark(f.partyRowsAll, exp.all)})`);
  lines.push(
    `- RECOMMENDATION — insert ${exp.all} (zero-seat parties included): the modern aggregate already keeps every contesting party, a recorded vote total is a fact whether or not it converted to a seat, and vote-share denominators stay honest only when every counted vote has a row. Dropping zero-seat parties would also silently erase parties that mattered (runners-up, regional formations before their first win).`,
  );
  for (const [reason, n] of Object.entries(earlyRefused)) lines.push(`- unparseable rows — ${reason}: ${n}`);
  lines.push(`- exact duplicate candidate rows refused: ${early.duplicateRowCount}`);
  for (const [reason, n] of Object.entries(early.refused)) lines.push(`- refused rows — ${reason}: ${n}`);

  lines.push(`\n### State-spelling aliases applied (committed in STATE_ALIASES.csv, §2.8)`);
  lines.push(`| variant in file | canonical | rows measured | rows committed | agree |`);
  lines.push(`|---|---|---|---|---|`);
  const seen = new Set<string>();
  for (const a of committedAliases) {
    const m = early.aliasApplications[a.variant];
    seen.add(a.variant);
    lines.push(`| ${a.variant} | ${a.canonical} | ${m?.rows ?? 0} | ${a.rows} | ${m?.rows === a.rows ? "yes" : "NO — drift, stop"} |`);
  }
  for (const [variant, m] of Object.entries(early.aliasApplications)) {
    if (!seen.has(variant)) lines.push(`| ${variant} | ${m.canonical} | ${m.rows} | (NOT COMMITTED — refuse) | NO |`);
  }

  const insertAe = early.elections.filter((e) => e.scope === "state_assembly");
  const insertGe = early.elections.filter((e) => e.scope === "lok_sabha");
  lines.push(`\n### Insertable view (A9: GE rows roll up nationally on Assembly_No, per the codebook's own rule)`);
  lines.push(
    `The ${f.elections} file groups become ${early.elections.length} insertable elections: ${insertAe.length} state assembly + ${insertGe.length} national Lok Sabha. The per-state GE slices fold into the national rows; nothing is discarded, the identity just follows the archive's (and TCPD's) definition of a distinct GE.`,
  );
  lines.push(`- insertable party result rows: ${early.elections.reduce((n, e) => n + e.parties.length, 0)} (zero-seat included), ${early.elections.reduce((n, e) => n + e.parties.filter((p) => p.seatsWon > 0).length, 0)} with seats`);
  const dayPrec = early.elections.filter((e) => e.datePrecision === "day");
  lines.push(`- election dates: ${dayPrec.length} at day precision (PollingDate is a recorded fact, correction 1); ${early.elections.length - dayPrec.length} undated → year precision`);
  const histAe = insertAe.filter((e) => e.stateId === null);
  lines.push(`- ${histAe.length} of the ${insertAe.length} assembly elections belong to historical states with no state row yet; they are EXCLUDED from the reconciliation section below and wait on the decision block further down`);

  lines.push(`\n| upstream_id | state | year | date | precision | seats | constituencies (by magnitude) | turnout | basis | parties (≥1 seat / all) |`);
  lines.push(`|---|---|---|---|---|---|---|---|---|---|`);
  for (const e of early.elections) {
    const mag = Object.entries(e.seatsByMagnitude).map(([k, v]) => `${v}×${k}-seat`).join(", ");
    lines.push(
      `| ${e.upstreamId} | ${e.stateName}${e.stateId === null ? " (no state row)" : ""} | ${e.year} | ${e.electionDate ?? "—"} | ${e.datePrecision} | ${e.totalSeats} | ${e.constituencies} (${mag}) | ${e.turnoutPercent ?? "—"} | ${e.turnoutBasis} | ${e.parties.filter((p) => p.seatsWon > 0).length} / ${e.parties.length} |`,
    );
  }

  const multi = early.elections.filter((e) => Object.keys(e.seatsByMagnitude).some((k) => Number(k) > 1));
  lines.push(`\n### Multi-member constituencies (correction 3)`);
  const totalMag: Record<string, number> = {};
  for (const e of early.elections)
    for (const [k, v] of Object.entries(e.seatsByMagnitude)) totalMag[k] = (totalMag[k] ?? 0) + v;
  lines.push(`- constituency magnitude across the file: ${Object.entries(totalMag).map(([k, v]) => `${v} ${k}-seat`).join(", ")}`);
  lines.push(`- elections containing at least one multi-member constituency: ${multi.length} of ${early.elections.length}`);
  lines.push(`- total_seats is Σ NumberOfSeats once per constituency, NEVER a constituency count; the seat arithmetic (Σ seats = Winner=True rows) is checked per election and any break appears under anomalies below.`);

  lines.push(`\n### Turnout semantics — a finding the gate must rule on (beyond correction 2)`);
  lines.push(
    `Correction 2 is right that raw counts exist, but the measured file shows ElectorsWhoVoted ≡ VotesValid everywhere except Kerala AE-2 (the codebook's own note 5), and Σ candidate Votes equals VotesValid in 6,292 of 6,293 constituencies. In a multi-member constituency each elector cast one vote PER SEAT, so the column counts BALLOTS, not persons — 372 constituencies record more "electors who voted" than registered electors, 367 of them two-seaters. The quotient Σvoted/Σelectors is therefore votes-per-elector, not person-turnout, wherever a multi-member constituency is in the sum.`,
  );
  const persons = early.elections.filter((e) => e.turnoutBasis === "persons");
  lines.push(`- elections where the quotient is honest person-turnout (every constituency single-member): ${persons.length}`);
  lines.push(`- elections where it is ballots-per-elector: ${early.elections.length - persons.length}`);
  lines.push(
    persons.length > 0
      ? `- RECOMMENDATION: store turnout_percent only for the ${persons.length} persons-basis elections (noting it is valid-vote turnout, slightly under ECI's ballots-cast figure); store NULL for the ballots-basis elections rather than a number that reads as person-turnout and is not. If the gate wants the ballots figure kept, it needs its own labelled column, not this one.`
      : `- RECOMMENDATION: every insertable election in this drop contains at least one multi-member constituency, so NO election here gets an honest person-turnout — correction 2's "honestly computable for all 82" does not survive the measurement. Store NULL turnout_percent for all ${early.elections.length}; if the gate wants the ballots-per-elector figure kept, it needs its own labelled column, never turnout_percent. The figures in the table above are shown WITH their basis so the gate can see what it would be approving.`,
  );

  lines.push(`\n### Historical states — the gate's A1 decision, decision-ready (correction 5)`);
  const histRows = Object.entries(early.statesWithoutId).sort((a, b) => b[1] - a[1]);
  const histTotal = histRows.reduce((n, [, v]) => n + v, 0);
  lines.push(`${histRows.length} canonical state names have no archive state row; together they carry ${histTotal} candidate rows.`);
  lines.push(`| state (canonical) | candidate rows | AE elections here | note |`);
  lines.push(`|---|---|---|---|`);
  for (const [name, n] of histRows) {
    const aeHere = insertAe.filter((e) => e.stateName === name).length;
    lines.push(`| ${name} | ${n} | ${aeHere} | ${aeHere === 0 ? "GE rows only — folds into the national GE under A9, needs NO state row" : "needs a state row before its AE elections can insert"} |`);
  }
  lines.push(
    `\nPROPOSAL (standing counsel, D3_FINDINGS.md): create the states that need rows as FIRST-CLASS historical state rows with no successor links — mapping Madras onto Tamil Nadu would destroy the fact that those elections were held by an entity that no longer exists. The map package has no geometry for them: the atlas must hold a state it cannot draw, and say so. Nothing is created by this stage; the gate approves the list or the AE elections of the unapproved states stay out.`,
  );

  lines.push(`\n### Licence flag — decision needed BEFORE the bulk download ships`);
  lines.push(
    `TCPD's terms (data/raw/tcpd/TERMS.md, codebook §2) are non-commercial use only, citation required, no endorsement. That does not compose with the archive's CC BY-SA publication licence: TCPD-derived rows cannot ship inside a CC BY-SA bulk export. Either the export excludes them or it carries TCPD's terms separately and says so. This decision belongs in docs/API_DESIGN.md before /data goes live — not after.`,
  );

  const anomalous = early.elections.filter((e) => e.anomalies.length > 0);
  lines.push(`\n### Early-file anomalies (stated, never repaired)`);
  lines.push(`- elections with anomalies: ${anomalous.length}`);
  for (const e of anomalous) lines.push(`    - ${e.upstreamId}: ${e.anomalies.join("; ")}`);
  lines.push(
    `- known single data error: Travancore_Cochin AE-1 constituency 95 (WADAKANCHERRY), Σ candidate Votes 49,758 vs VotesValid 49,740 — the source's own discrepancy, kept as recorded.`,
  );
}

/** The §5 stage-2 success measure has a BEFORE side, and this report is the
 *  last moment before anything changes, so it is recorded here: how starved
 *  each denominator-bearing insight panel is today, plus the picker and
 *  browse counts. Stage 2's post-insert report repeats these for the AFTER. */
async function reportStarvedBaseline(lines: string[]) {
  const { fetchInsightRows } = await import("../src/lib/db/queries/insights");
  const { computeInsights } = await import("../src/lib/insights");
  const { termRows, electionRows } = await fetchInsightRows();
  const groups = computeInsights(termRows, electionRows, new Date().toISOString().slice(0, 10));
  const of = (key: string) => {
    const g = groups.find((x) => x.key === key);
    return g ? String(g.of ?? "stated without a denominator") : "panel absent (too starved to render)";
  };

  lines.push(`\n## Starved-panels baseline (§5 stage 2 success measure — the BEFORE side)`);
  lines.push(`| panel | denominator today |`);
  lines.push(`|---|---|`);
  lines.push(`| Turnout extremes (n with recorded turnout) | ${of("turnout")} |`);
  lines.push(`| Largest majorities (of) | ${of("largest-majority")} |`);
  lines.push(`| Closest elections (of) | ${of("closest-election")} |`);
  lines.push(`| Party dominance (of) | ${of("party-dominance")} |`);
  lines.push(`| Compare picker options (elections) | ${electionRows.length} |`);
  lines.push(`| Browse: elections | ${electionRows.length} |`);
  lines.push(`| Browse: terms | ${termRows.length} |`);
}

async function dryRun() {
  const manifest = await verify();
  console.log(`[load-tcpd] stage 1 — dry run (read-only)`);
  const { parseCsv } = await import("../src/lib/csv");
  const { ae, ge, parseRefused, early, earlyRefused, committedAliases } = aggregateFiles(manifest, parseCsv);
  const { hand, allParties, dbLabel } = await loadHandElections();

  // Early aggregates join reconciliation and party identity like any others;
  // reconcileAll already leaves stateId-null rows (the historical states) to
  // the decision block rather than pairing them.
  const allAggs = [...ae.elections, ...ge.elections, ...(early?.elections ?? [])];
  const recs = reconcileAll(hand, allAggs);

  const lines: string[] = [];
  lines.push(`# TCPD ingest — stage 1 dry-run report`);
  lines.push(`\nGenerated ${new Date().toISOString().slice(0, 10)} against database ${dbLabel}.`);
  lines.push(`No writes were performed. This report is the §5 stage-1 gate deliverable.`);
  for (const [reason, n] of Object.entries(parseRefused)) lines.push(`- unparseable rows — ${reason}: ${n}`);
  if (ae.elections.length > 0 || ge.elections.length > 0) {
    reportAggregate("Vidhan Sabha (assembly)", ae, lines);
    reportAggregate("Lok Sabha (general)", ge, lines);
  } else {
    lines.push(`\nNo modern-schema (ae/ge) files in this drop: D1 and D2 remain unfetched, and the spec's §2.1 column expectations for them stay explicitly unverified.`);
  }
  if (early) reportEarly(early, committedAliases, earlyRefused, lines);
  const coverage =
    allAggs.length > 0
      ? { min: Math.min(...allAggs.map((e) => e.year)), max: Math.max(...allAggs.map((e) => e.year)) }
      : null;
  reportReconciliation(recs, lines, coverage);
  reportPartyIdentity(allAggs, allParties, lines);
  await reportStarvedBaseline(lines);
  lines.push(`\n## Gate`);
  lines.push(`Decisions needed before stage 2: (1) disposition of every disagreement above; (2) the A1 ruling — for D3 that is the historical-states block; (3) the would-create party list confirmed and every AMBIGUOUS party identity paired by a human; (4) for D3: turnout storage rule (persons-basis only, recommended) and zero-seat party inclusion (include, recommended); (5) the TCPD-licence/CC BY-SA export composition, before /data ships. See docs/ELECTIONS_INGEST_SPEC.md §5 and §2.8. The verified backup restore precedes any stage-2 insert.`);

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
