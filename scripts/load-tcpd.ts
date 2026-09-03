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

import { dbLabelOf, hasConfirm, panelDiffLines, requireFreshVerifiedBackup, starvedCounts } from "./stage2-common";
import {
  aggregate,
  aggregateEarly,
  anchoredDate,
  checkEarlyHeader,
  checkHeader,
  checkPartyResolutions,
  matchKnownParty,
  parseEarlyRow,
  parseRow,
  reconcileAll,
  scanPartyCollisions,
  type AggregateOutcome,
  type EarlyAggregateOutcome,
  type ElectionAggregate,
  type GeStateSlice,
  type HandElection,
  type KnownParty,
  type PartyDisposition,
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

/** Committed dispositions with validity windows (gate rulings 2026-08-28
 *  and 2026-08-30): a row covers from_year..to_year inclusive, blank = open;
 *  a label-year no window covers is HELD, never guessed. Missing file stops
 *  the early insert. */
function readPartyResolutions(parseCsv: (t: string) => Record<string, string>[]): PartyDisposition[] {
  const path = join(ROOT, "PARTY_RESOLUTIONS.csv");
  if (!existsSync(path))
    fail("data/raw/tcpd/PARTY_RESOLUTIONS.csv is missing: every early-file party label needs a committed disposition before anything resolves or creates.");
  const yr = (raw: string | undefined, label: string): number | null => {
    const v = (raw ?? "").trim();
    if (!v) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1900 || n > 2100) fail(`PARTY_RESOLUTIONS.csv "${label}": year "${v}" is not plausible.`);
    return n;
  };
  return parseCsv(readFileSync(path, "utf8")).map((r) => {
    const label = (r.label ?? "").trim();
    const disposition = (r.disposition ?? "").trim();
    if (!label || (disposition !== "create" && disposition !== "resolve"))
      fail(`PARTY_RESOLUTIONS.csv: row "${label}" needs disposition create or resolve.`);
    return {
      label,
      fromYear: yr(r.from_year, label),
      toYear: yr(r.to_year, label),
      disposition: disposition as "create" | "resolve",
      partyId: (r.party_id ?? "").trim() || null,
      reason: (r.reason ?? "").trim(),
    };
  });
}

/** The GE state-slices, written as committed CSVs (gate ruling 3): the A9
 *  rollup must stay reversible from what the repository stores, so the
 *  per-state facts the national rows absorb are recorded here, regenerated
 *  deterministically by stage 1 and diffed like any committed data. */
function writeGeSliceArtifacts(slices: GeStateSlice[]) {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const totals = ["ge_upstream_id,state_name,constituencies,seats,electors_total,ballots_cast,votes_valid"];
  const parties = ["ge_upstream_id,state_name,party,candidates,seats_won,votes"];
  for (const s of slices) {
    const up = `GE-${s.year}-L${s.assemblyNo}`;
    totals.push([up, q(s.stateName), s.constituencies, s.seats, s.electorsTotal ?? "", s.ballotsCast ?? "", s.votesValid ?? ""].join(","));
    for (const p of s.parties) {
      parties.push([up, q(s.stateName), q(p.label), p.candidates, p.seatsWon, p.votes].join(","));
    }
  }
  writeFileSync(join(ROOT, "D3_GE_STATE_TOTALS.csv"), totals.join("\n") + "\n");
  writeFileSync(join(ROOT, "D3_GE_STATE_SLICES.csv"), parties.join("\n") + "\n");
  return { totalRows: totals.length - 1, partyRows: parties.length - 1 };
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
 *  the list gate decision (3) confirms — nothing is created here. Labels the
 *  committed dispositions file governs are evaluated by their windows; the
 *  rest go through the matcher and the collision scan (rulings 2 and 3,
 *  2026-08-30). */
function reportPartyIdentity(
  aggs: ElectionAggregate[],
  known: KnownParty[],
  committed: PartyDisposition[],
  lines: string[],
) {
  type Tally = { name: string; elections: number; sample: string; years: Set<number> };
  const labels = new Map<string, Tally>();
  for (const e of aggs) {
    for (const p of e.parties) {
      const t = labels.get(p.recordedLabel);
      if (t) {
        t.elections += 1;
        t.years.add(e.year);
      } else {
        labels.set(p.recordedLabel, { name: p.partyName, elections: 1, sample: e.upstreamId, years: new Set([e.year]) });
      }
    }
  }
  const fileLabels = new Set(committed.map((c) => c.label));

  const resolved: string[] = [];
  const creates: { label: string; t: Tally }[] = [];
  const many: { label: string; t: Tally; ids: string[] }[] = [];
  for (const [label, t] of labels) {
    if (fileLabels.has(label)) continue; // windowed dispositions section below
    const m = matchKnownParty(known, label, t.name);
    if (m.kind === "one") resolved.push(`${label} → ${m.party.id}${m.party.isPseudo ? " (pseudo)" : ""}`);
    else if (m.kind === "many") many.push({ label, t, ids: m.parties.map((p) => p.id) });
    else creates.push({ label, t });
  }

  lines.push(`\n## Party identity (spec §3, A4)`);
  lines.push(`- distinct TCPD labels: ${labels.size} (${fileLabels.size} governed by PARTY_RESOLUTIONS.csv, evaluated below)`);
  lines.push(`- resolve to an existing party: ${resolved.length}`);
  lines.push(`- would be CREATED by the insert stages: ${creates.length} (bulk-accept verbatim after the collision scan; gate ruling 2)`);
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

  // Windowed dispositions (gate ruling 3, 2026-08-30): label + validity
  // window; any label-year outside every window is HELD, never guessed.
  lines.push(`\n### Windowed dispositions (PARTY_RESOLUTIONS.csv)`);
  const labelYears = [...labels.entries()].map(([label, t]) => ({ label, years: [...t.years] }));
  const chk = checkPartyResolutions(labelYears, known, committed, false);
  if (!chk.ok) {
    lines.push(`- PROBLEMS — insert stages refuse until these are fixed:`);
    for (const p of chk.problems) lines.push(`    - ${p}`);
  } else {
    const byLabel = new Map<string, PartyDisposition[]>();
    for (const d of committed) byLabel.set(d.label, [...(byLabel.get(d.label) ?? []), d]);
    lines.push(`- ${byLabel.size} labels governed; windows and dispositions:`);
    for (const [label, ds] of [...byLabel.entries()].sort()) {
      for (const d of ds) {
        const w = `${d.fromYear ?? "…"}–${d.toYear ?? "…"}`;
        lines.push(`    - ${label} [${w}]: ${d.disposition}${d.partyId ? ` → ${d.partyId}` : ""}${d.reason ? ` (${d.reason})` : ""}`);
      }
    }
    if (chk.held.length > 0) {
      lines.push(`- HELD label-years (no window covers them; never inserted, a human rules):`);
      for (const h of chk.held) lines.push(`    - ${h.label}: ${h.years.join(", ")}`);
    } else {
      lines.push(`- held label-years: none`);
    }
  }

  // Collision scan over the bulk-accept creates (gate ruling 2, 2026-08-30,
  // and its addendum). Existing-party collisions are HELD until a human
  // records a disposition; shared-form incoming groups CREATE VERBATIM and
  // each group is emitted as a merge candidate (entity_match_candidates) at
  // insert time — a deferred merge costs nothing, a wrong silent merge
  // applied hundreds of times is unrecoverable.
  lines.push(`\n### Collision scan on the would-create labels (gate ruling 2 + addendum)`);
  const scan = scanPartyCollisions(creates.map((c) => c.label), known);
  const groupedLabels = scan.heldIncoming.reduce((n, g) => n + g.labels.length, 0);
  lines.push(`- clear to create verbatim: ${scan.clear.length}`);
  lines.push(`- HELD, collides with an existing party after stripping case/punctuation (a human records a disposition in PARTY_RESOLUTIONS.csv): ${scan.heldExisting.length}`);
  for (const h of scan.heldExisting) lines.push(`    - "${h.label}" ~ ${h.matches.join(", ")}`);
  lines.push(
    `- shared-form incoming groups: ${scan.heldIncoming.length} group(s), ${groupedLabels} labels — create verbatim, NO silent unification; each group becomes a merge candidate at insert time (addendum 2026-08-30):`,
  );
  for (const g of scan.heldIncoming) lines.push(`    - [${g.form}]: ${g.labels.map((l) => `"${l}"`).join(" vs ")}`);
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
 *  last moment before anything changes, so it is recorded here. Stage 2's
 *  post-insert report repeats these for the AFTER. */
async function reportStarvedBaseline(lines: string[]) {
  const counts = await starvedCounts();
  lines.push(`\n## Starved-panels baseline (§5 stage 2 success measure — the BEFORE side)`);
  lines.push(`| panel | denominator today |`);
  lines.push(`|---|---|`);
  for (const [k, v] of Object.entries(counts)) lines.push(`| ${k} | ${v} |`);
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
  if (early) {
    reportEarly(early, committedAliases, earlyRefused, lines);

    // Gate ruling 3: the GE slices are preserved as committed artifacts,
    // regenerated here so a drifted file shows up as a diff.
    const art = writeGeSliceArtifacts(early.geSlices);
    lines.push(`\n### GE state-slices preserved (gate ruling 3)`);
    lines.push(
      `- ${early.geSlices.length} slices written: D3_GE_STATE_TOTALS.csv (${art.totalRows} rows) and D3_GE_STATE_SLICES.csv (${art.partyRows} party rows). The national GE rows are their sums; the rollup is reversible from the repository.`,
    );

    // Early-file coverage rule: EVERY early label must have a committed
    // disposition (the windowed evaluation itself lives in the party
    // identity section, which sees all three datasets).
    lines.push(`\n### Early-label disposition coverage (PARTY_RESOLUTIONS.csv)`);
    if (existsSync(join(ROOT, "PARTY_RESOLUTIONS.csv"))) {
      const committedLabels = new Set(readPartyResolutions(parseCsv).map((c) => c.label));
      const missing = [...new Set(early.elections.flatMap((e) => e.parties.map((p) => p.recordedLabel)))].filter(
        (l) => !committedLabels.has(l),
      );
      lines.push(
        missing.length === 0
          ? `- every early-file label has a committed disposition`
          : `- MISSING dispositions (insert-early refuses): ${missing.join(", ")}`,
      );
    } else {
      lines.push(`- file not present; the insert stage refuses without it`);
    }
  }
  const coverage =
    allAggs.length > 0
      ? { min: Math.min(...allAggs.map((e) => e.year)), max: Math.max(...allAggs.map((e) => e.year)) }
      : null;
  reportReconciliation(recs, lines, coverage);
  const committedDispositions = existsSync(join(ROOT, "PARTY_RESOLUTIONS.csv")) ? readPartyResolutions(parseCsv) : [];
  reportPartyIdentity(allAggs, allParties, committedDispositions, lines);
  await reportStarvedBaseline(lines);
  lines.push(`\n## Gate`);
  lines.push(`Decisions needed before stage 2: (1) disposition of every disagreement above; (2) the A1 ruling — for D3 that is the historical-states block; (3) the would-create party list confirmed and every AMBIGUOUS party identity paired by a human; (4) for D3: turnout storage rule (persons-basis only, recommended) and zero-seat party inclusion (include, recommended); (5) the TCPD-licence/CC BY-SA export composition, before /data ships. See docs/ELECTIONS_INGEST_SPEC.md §5 and §2.8. The verified backup restore precedes any stage-2 insert.`);

  const report = lines.join("\n");
  console.log("\n" + report + "\n");
  const outPath = join(ROOT, "dry-run-report.md");
  writeFileSync(outPath, report);
  console.log(`[load-tcpd] report written to ${outPath}`);
}

// ---------------------------------------------------------------------------
// Stage 2 for the early file — authorised by the gate rulings of 2026-08-28.
// ---------------------------------------------------------------------------

/** Canonical file name -> archive state row for the 12 approved historical
 *  states (gate ruling 4). First-class rows, NO successor links, no dates
 *  (dates are curatorial facts that arrive through review with sources, not
 *  through a loader), hasGeometry=false: the atlas holds a state it cannot
 *  draw and says so. Bilaspur and Kutch are deliberately absent: their rows
 *  are GE-only and fold into the national GE under A9. */
const HISTORICAL_STATES: Readonly<Record<string, { id: string; name: string }>> = {
  Ajmer: { id: "ajmer", name: "Ajmer" },
  Bhopal: { id: "bhopal", name: "Bhopal" },
  Bombay: { id: "bombay", name: "Bombay" },
  Coorg: { id: "coorg", name: "Coorg" },
  Hyderabad: { id: "hyderabad", name: "Hyderabad" },
  Madhya_Bharat: { id: "madhya-bharat", name: "Madhya Bharat" },
  Madras: { id: "madras", name: "Madras" },
  Mysore: { id: "mysore", name: "Mysore" },
  "Patiala_&_East_Punjab_States_Union_(PEPSU)": { id: "pepsu", name: "Patiala & East Punjab States Union (PEPSU)" },
  Saurashtra: { id: "saurashtra", name: "Saurashtra" },
  Travancore_Cochin: { id: "travancore-cochin", name: "Travancore-Cochin" },
  Vindhya_Pradesh: { id: "vindhya-pradesh", name: "Vindhya Pradesh" },
};

const D3_DATASET_SLUG = "tcpd-ied-1951-62";

const partySlug = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Stage 2 insert for the early file, on the gate's exact terms:
 * NULL turnout with the reason in the dataset notes (ruling 1); 669
 * file-view rows = 431 insertable rows, zero-seat parties included
 * (ruling 2); the A9 rollup with the GE slices preserved as committed
 * artifacts (ruling 3); 12 first-class historical states, no successor
 * links (ruling 4); party dispositions from the committed file (ruling 5).
 * Refuses to run without a recorded restore drill, refuses a drop whose
 * numbers differ from the approved run, refuses to run twice.
 */
async function insertEarly() {
  const manifest = await verify();

  if (!process.env.DATABASE_URL) fail("DATABASE_URL not set.");
  // 2026-09-03 ruling: the backup gate reads the marker restore-drill.sh
  // writes — fresh (24h), verified, same database — never an env var.
  requireFreshVerifiedBackup(dbLabelOf(process.env.DATABASE_URL), fail);
  if (!hasConfirm())
    fail("stage 2 inserts only with an explicit --confirm. Run --stage=dry-run first, read the report, then re-run this stage with --confirm.");

  const { parseCsv } = await import("../src/lib/csv");
  const { early, earlyRefused, committedAliases } = aggregateFiles(manifest, parseCsv);
  if (!early) fail("no early-schema (kind=both) file in the manifest; nothing for insert-early to do.");

  // The drop must measure exactly as the approved stage-1 run did. Any
  // difference means a different file is on disk, and the approval does not
  // transfer to a file nobody looked at.
  const f = early.fileGroups;
  if (f.elections !== 82 || f.partyRowsWithSeats !== 371 || f.partyRowsAll !== 669)
    fail(`file grouping measures ${f.elections}/${f.partyRowsWithSeats}/${f.partyRowsAll}, not the approved 82/371/669.`);
  if (early.elections.length !== 41) fail(`insertable view has ${early.elections.length} elections, not the approved 41.`);
  if (Object.keys(earlyRefused).length > 0 || Object.keys(early.refused).length > 0 || early.duplicateRowCount > 0)
    fail("the approved run had zero refusals and zero duplicates; this run does not.");
  for (const a of committedAliases) {
    if ((early.aliasApplications[a.variant]?.rows ?? 0) !== a.rows)
      fail(`alias "${a.variant}" measures ${early.aliasApplications[a.variant]?.rows ?? 0} rows, committed says ${a.rows}.`);
  }

  const dbLabel = dbLabelOf(process.env.DATABASE_URL);
  const { db } = await import("../src/lib/db");
  const schema = await import("../src/lib/db/schema");
  const { eq, sql, inArray } = await import("drizzle-orm");
  const { v7: uuidv7 } = await import("uuid");

  // Idempotency FIRST, so a re-run is told the true reason it stops (after
  // an insert the created parties exist, and the disposition check below
  // would otherwise refuse with a misleading complaint about reasons).
  const already = await db
    .select({ id: schema.datasets.id })
    .from(schema.datasets)
    .where(eq(schema.datasets.slug, D3_DATASET_SLUG));
  if (already.length > 0) {
    const prov = await db.execute(
      sql`SELECT count(*)::int AS n FROM record_provenance WHERE dataset_id = ${already[0].id}`,
    );
    if (Number((prov.rows[0] as { n: number }).n) > 0)
      fail(`dataset ${D3_DATASET_SLUG} already has provenance rows: this drop is already ingested. Supersession is a designed flow, not a re-run.`);
  }

  // Party dispositions: the committed windowed file, checked against data
  // and matcher. The early file requires FULL coverage: every label, every
  // year, a disposition — a held label-year stops the insert.
  const committed = readPartyResolutions(parseCsv);
  const known: KnownParty[] = await db
    .select({ id: schema.parties.id, name: schema.parties.name, abbreviation: schema.parties.abbreviation, isPseudo: schema.parties.isPseudo })
    .from(schema.parties);
  const labelYearsMap = new Map<string, Set<number>>();
  for (const e of early.elections) {
    for (const p of e.parties) {
      const s = labelYearsMap.get(p.recordedLabel) ?? new Set<number>();
      s.add(e.year);
      labelYearsMap.set(p.recordedLabel, s);
    }
  }
  const labelYears = [...labelYearsMap.entries()].map(([label, years]) => ({ label, years: [...years] }));
  const check = checkPartyResolutions(labelYears, known, committed, true);
  if (!check.ok) fail(`PARTY_RESOLUTIONS.csv problems:\n  - ${check.problems.join("\n  - ")}`);
  const heldHere = check.held.filter((h) => labelYearsMap.has(h.label));
  if (heldHere.length > 0)
    fail(`held label-years in the early data (no window covers them): ${heldHere.map((h) => `${h.label} ${h.years.join(",")}`).join("; ")} — a human rules before anything inserts.`);

  // Created-party ids: deterministic slugs, refused on any collision.
  const existingPartyIds = new Set(known.map((p) => p.id));
  const createdIds = new Map<string, string>();
  for (const label of check.createLabels) {
    const slug = partySlug(label);
    if (!slug) fail(`party label "${label}" slugs to nothing.`);
    if (existingPartyIds.has(slug)) fail(`party id "${slug}" (for label "${label}") already exists; a human must pick the id.`);
    if ([...createdIds.values()].includes(slug)) fail(`two labels slug to "${slug}"; a human must disambiguate.`);
    createdIds.set(label, slug);
  }
  const partyIdFor = (label: string, year: number): string => {
    const d = check.dispositionFor(label, year);
    if (d.kind === "resolve") return d.partyId;
    if (d.kind === "create") return createdIds.get(label)!;
    // Unreachable: the held check above already stopped the run.
    fail(`"${label}" in ${year} is held; nothing may insert it.`);
  };

  const existingDataset = already;

  // Historical states are SHARED reference rows (the RS ingest cites them
  // too): create the missing ones, verify the rest match, never overwrite.
  const histIds = Object.values(HISTORICAL_STATES).map((s) => s.id);
  const existingStates = await db
    .select({ id: schema.states.id, name: schema.states.name })
    .from(schema.states)
    .where(inArray(schema.states.id, histIds));
  for (const ex of existingStates) {
    const want = Object.values(HISTORICAL_STATES).find((h) => h.id === ex.id)!;
    if (ex.name !== want.name)
      fail(`state "${ex.id}" exists with name "${ex.name}" (expected "${want.name}") — a person must look.`);
  }
  const missingStates = Object.values(HISTORICAL_STATES).filter((h) => !existingStates.some((ex) => ex.id === h.id));

  const before = await starvedCounts();
  const today = new Date().toISOString().slice(0, 10);
  const csvRow = manifest.find((m) => m.kind === "both")!;

  console.log(`[load-tcpd] stage 2 — inserting into ${dbLabel}`);

  let electionCount = 0;
  let resultCount = 0;

  const datasetId = existingDataset[0]?.id ?? uuidv7();
  await db.transaction(async (tx) => {
    if (!existingDataset[0]) {
      await tx.insert(schema.datasets).values({
        id: datasetId,
        slug: D3_DATASET_SLUG,
        name: "TCPD Indian Elections dataset (TCPD-IED), 1951-1962",
        publisher: "Trivedi Centre for Political Data, Ashoka University",
        version: csvRow.source_version,
        licence: "TCPD terms: non-commercial use only, citation required, no endorsement (captured in data/raw/tcpd/TERMS.md)",
        licenceUrl: csvRow.source_url,
        retrievedOn: csvRow.downloaded_on || today,
        upstreamUrl: csvRow.source_url,
        curator: "ai@cdswindia.org",
        notes:
          "turnout_percent is NULL on every row of this dataset by gate ruling (2026-08-28): " +
          "the file's ElectorsWhoVoted column counts BALLOTS, not persons — in multi-member " +
          "constituencies each elector cast one vote per seat, and the column equals VotesValid " +
          "everywhere except one Kerala election — so a stored quotient would read as person-turnout " +
          "and be wrong. The null is a refusal, not missing data: do NOT recompute turnout from the " +
          "raw counts on any re-ingest (docs/ELECTIONS_INGEST_SPEC.md §2.8). " +
          "The two national GE rows aggregate 43 per-state slices (TCPD's own GE identity ignores " +
          "State_Name); the slices are preserved verbatim-derived in data/raw/tcpd/D3_GE_STATE_SLICES.csv " +
          "and D3_GE_STATE_TOTALS.csv so the rollup stays reversible from the repository. " +
          "Zero-seat contesting parties are included by ruling. Party dispositions, including the SP " +
          "era-collision override, are committed in data/raw/tcpd/PARTY_RESOLUTIONS.csv. " +
          "Errata against D3_FINDINGS.md are recorded in the spec §2.8; the findings file is unedited.",
      });
    }

    if (missingStates.length > 0) {
      await tx.insert(schema.states).values(
        missingStates.map((s) => ({
          id: s.id,
          name: s.name,
          kind: "state" as const,
          formedOn: null,
          dissolvedOn: null,
          hasGeometry: false,
        })),
      );
      // Provenance on the rows THIS dataset created, so reversal-by-dataset
      // can find them (and leave alone the ones another ingest made first).
      await tx.insert(schema.recordProvenance).values(
        missingStates.map((s) => ({
          subjectType: "state" as const,
          subjectId: s.id,
          datasetId,
          upstreamId: `state:${s.name}`,
          ingestedOn: today,
        })),
      );
    }

    if (check.createLabels.length > 0) {
      await tx.insert(schema.parties).values(
        check.createLabels.map((label) => ({
          id: createdIds.get(label)!,
          name: label, // verbatim TCPD label; renaming is review's job, with sources
          abbreviation: label,
          isPseudo: false,
        })),
      );
      await tx.insert(schema.recordProvenance).values(
        check.createLabels.map((label) => ({
          subjectType: "party" as const,
          subjectId: createdIds.get(label)!,
          datasetId,
          upstreamId: `party:${label}`,
          ingestedOn: today,
        })),
      );
    }

    // One source row for the dataset; every election cites it with its own
    // upstream reference, per the TERMS.md citation requirement.
    const srcExisting = await tx
      .select({ id: schema.sources.id })
      .from(schema.sources)
      .where(eq(schema.sources.url, csvRow.source_url));
    const sourceId = srcExisting[0]?.id ?? uuidv7();
    if (!srcExisting[0]) {
      await tx.insert(schema.sources).values({
        id: sourceId,
        title: "TCPD Indian Elections dataset (TCPD-IED), 1951-1962",
        url: csvRow.source_url,
        publisher: "Trivedi Centre for Political Data, Ashoka University",
        publishedOn: "2023-05-08", // codebook 1.0, last updated
        accessedOn: csvRow.downloaded_on || today,
        kind: "research",
        isOfficial: false, // derived from ECI statistical reports, issued by TCPD
        isPrimary: true, // the dataset itself, not coverage of it
      });
    }

    for (const e of early.elections) {
      const stateId =
        e.scope === "lok_sabha" ? "in" : (e.stateId ?? HISTORICAL_STATES[e.stateName]?.id);
      if (!stateId) fail(`no state id for "${e.stateName}" — not mapped and not in the approved historical list.`);
      const electionId = uuidv7();
      await tx.insert(schema.elections).values({
        id: electionId,
        stateId,
        scope: e.scope,
        assemblyNumber: e.assemblyNo,
        electionDate: e.electionDate ?? `${e.year}-01-01`,
        electionDatePrecision: e.datePrecision,
        totalSeats: e.totalSeats,
        turnoutPercent: null, // gate ruling 1; the WHY is in the dataset notes
        resultSummary: null,
      });
      electionCount++;
      await tx.insert(schema.electionResults).values(
        e.parties.map((p) => ({
          electionId,
          partyId: partyIdFor(p.recordedLabel, e.year),
          seatsWon: p.seatsWon,
          // Candidacies, not constituencies: the honest measure in the
          // multi-member era (§2.8).
          seatsContested: p.seatsContested,
          voteSharePercent: p.voteSharePercent === null ? null : String(p.voteSharePercent),
        })),
      );
      resultCount += e.parties.length;
      await tx.insert(schema.recordProvenance).values({
        subjectType: "election",
        subjectId: electionId,
        datasetId,
        upstreamId: e.upstreamId,
        ingestedOn: today,
      });
      await tx.insert(schema.citations).values({
        subjectType: "election",
        subjectId: electionId,
        sourceId,
        note: `${e.upstreamId} rows of TCPD-IED 1951-1962; cite as: "TCPD Indian Elections dataset (TCPD-IED), 1951-1962", Trivedi Centre for Political Data, Ashoka University.`,
      });
    }
  });

  // The recordPath amendment: fresh statistics after a bulk insert, query
  // shapes unchanged. This is the fix the benchmark chose.
  for (const t of ["elections", "election_results", "record_provenance", "citations", "parties", "states", "datasets", "sources"]) {
    await db.execute(sql.raw(`ANALYZE ${t}`));
  }

  const after = await starvedCounts();

  const lines: string[] = [];
  lines.push(`# TCPD ingest — stage 2 insert report (early file, D3)`);
  lines.push(`\nGenerated ${today} against database ${dbLabel}.`);
  lines.push(`\n- elections inserted: ${electionCount} (39 AE + 2 GE)`);
  lines.push(`- election_results inserted: ${resultCount} (zero-seat parties included)`);
  lines.push(`- historical states created: ${histIds.length} (first-class, no successor links, has_geometry=false)`);
  lines.push(`- parties created: ${check.createLabels.length}; labels resolving to existing parties by window: ${new Set(committed.filter((c) => c.disposition === "resolve").map((c) => c.label)).size}`);
  lines.push(`- provenance rows: ${electionCount}; citations: ${electionCount}; turnout_percent: NULL on all rows (ruling 1)`);
  lines.push(`- ANALYZE run on all touched tables (recordPath amendment)`);
  lines.push(`\n## Starved panels — before/after (§5 success measure)`);
  lines.push(...panelDiffLines(before, after));
  const report = lines.join("\n");
  console.log("\n" + report + "\n");
  writeFileSync(join(ROOT, "insert-report.md"), report);
  console.log(`[load-tcpd] report written to ${join(ROOT, "insert-report.md")}`);
}

const AE_DATASET_SLUG = "tcpd-lokdhaba-ae-2026-08-30";
const GE_DATASET_SLUG = "tcpd-lokdhaba-ge-2026-08-30";
const LOKDHABA_URL = "https://lokdhaba.ashoka.edu.in/browse-data";

/**
 * Stage 2 for D1/D2 (gate rulings of 2026-08-30, build ordered 2026-09-03,
 * RUN-gated behind the production reconciliation per the runbook). Inserts
 * the 364 assembly + 15 national Lok Sabha elections with their results,
 * bulk-accepting party creates after the collision scan, resolving
 * file-governed labels by their validity windows, and SKIPPING (never
 * guessing) the held label-years. Turnout stays NULL throughout (A3: the
 * modern export carries no honestly aggregable turnout). Refuses without a
 * fresh verified backup, without --confirm, and without the LokDhaba terms
 * capture (§1.4).
 */
async function insertModern() {
  const manifest = await verify();
  if (!process.env.DATABASE_URL) fail("DATABASE_URL not set.");
  requireFreshVerifiedBackup(dbLabelOf(process.env.DATABASE_URL), fail);
  const termsPath = join(ROOT, "TERMS_LOKDHABA.md");
  if (!existsSync(termsPath) || readFileSync(termsPath, "utf8").trim().length < 200)
    fail(
      "data/raw/tcpd/TERMS_LOKDHABA.md is missing or trivially short. Capture LokDhaba's terms page VERBATIM there first (§1.4, gate ruling 5 of 2026-08-30) — the terms travel with the data.",
    );
  if (!hasConfirm())
    fail("stage 2 inserts only with an explicit --confirm. Run --stage=dry-run first, read the report, then re-run with --confirm.");

  const { parseCsv } = await import("../src/lib/csv");
  const { ae, ge, parseRefused } = aggregateFiles(manifest, parseCsv);

  // The drop must measure exactly as the gate-approved stage-1 run did.
  if (ae.elections.length !== 364) fail(`AE aggregates to ${ae.elections.length} elections, not the approved 364.`);
  if (ge.elections.length !== 15) fail(`GE aggregates to ${ge.elections.length} elections, not the approved 15.`);
  if (ae.byeRowCount !== 13809 || ge.byeRowCount !== 2818) fail("bye-row counts differ from the approved run.");
  if (ae.duplicateRowCount !== 199 || ge.duplicateRowCount !== 0) fail("duplicate-row counts differ from the approved run.");
  if (Object.keys(ae.unmappedStates).length > 0 || Object.keys(ge.unmappedStates).length > 0)
    fail(`unmapped states present: ${Object.keys({ ...ae.unmappedStates, ...ge.unmappedStates }).join(", ")}.`);
  if (Object.keys(parseRefused).length > 0) fail("the approved run had zero unparseable rows; this run does not.");

  const dbLabel = dbLabelOf(process.env.DATABASE_URL);
  const { db } = await import("../src/lib/db");
  const schema = await import("../src/lib/db/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { v7: uuidv7 } = await import("uuid");
  const today = new Date().toISOString().slice(0, 10);

  // Idempotency per dataset.
  for (const slug of [AE_DATASET_SLUG, GE_DATASET_SLUG]) {
    const existing = await db.select({ id: schema.datasets.id }).from(schema.datasets).where(eq(schema.datasets.slug, slug));
    if (existing.length > 0) fail(`dataset ${slug} already exists: this drop is already ingested (revert first if that is intended).`);
  }

  // ---- Party plan (rulings 2 + 3 of 2026-08-30, addendum included) -------
  const committed = readPartyResolutions(parseCsv);
  const known: KnownParty[] = await db
    .select({ id: schema.parties.id, name: schema.parties.name, abbreviation: schema.parties.abbreviation, isPseudo: schema.parties.isPseudo })
    .from(schema.parties);
  const allAggs = [...ae.elections, ...ge.elections];
  const labelYearsMap = new Map<string, Set<number>>();
  for (const e of allAggs)
    for (const p of e.parties) {
      const s = labelYearsMap.get(p.recordedLabel) ?? new Set<number>();
      s.add(e.year);
      labelYearsMap.set(p.recordedLabel, s);
    }
  const chk = checkPartyResolutions(
    [...labelYearsMap.entries()].map(([label, years]) => ({ label, years: [...years] })),
    known,
    committed,
    false,
  );
  if (!chk.ok) fail(`PARTY_RESOLUTIONS.csv problems:\n  - ${chk.problems.join("\n  - ")}`);
  const fileLabels = new Set(committed.map((c) => c.label));

  const resolves = new Map<string, string>(); // non-file labels resolving to one existing party
  const createLabels: string[] = [];
  for (const [label] of labelYearsMap) {
    if (fileLabels.has(label)) continue;
    const m = matchKnownParty(known, label, label);
    if (m.kind === "one") resolves.set(label, m.party.id);
    else if (m.kind === "many") fail(`label "${label}" matches several existing parties (${m.parties.map((p) => p.id).join(", ")}): it needs a committed disposition row before anything inserts.`);
    else createLabels.push(label);
  }
  const scan = scanPartyCollisions(createLabels, known);
  if (scan.heldExisting.length > 0)
    fail(
      `create labels collide with existing parties and need committed dispositions first: ${scan.heldExisting.map((h) => `"${h.label}"~${h.matches.join("/")}`).join("; ")}`,
    );

  // Deterministic ids for creates; shared-form labels get -2/-3 suffixes in
  // sorted order (they are DISTINCT rows by the no-merge ruling, so their
  // ids must differ; the merge candidates carry the pairing).
  const existingIds = new Set(known.map((p) => p.id));
  const createdIds = new Map<string, string>();
  for (const label of [...createLabels].sort()) {
    let slug = partySlug(label);
    if (!slug) fail(`label "${label}" slugs to nothing.`);
    let n = 1;
    while (existingIds.has(slug) || [...createdIds.values()].includes(slug)) {
      n++;
      slug = `${partySlug(label)}-${n}`;
    }
    createdIds.set(label, slug);
  }

  const heldSkipped: string[] = [];
  const partyIdFor = (label: string, year: number): string | null => {
    if (fileLabels.has(label)) {
      const d = chk.dispositionFor(label, year);
      if (d.kind === "resolve") return d.partyId;
      if (d.kind === "held") {
        heldSkipped.push(`${label} @ ${year}`);
        return null; // the row is SKIPPED, counted, reported — never guessed
      }
      fail(`disposition "create" for file-governed label "${label}" is not expected in the modern path; a person must look.`);
    }
    return resolves.get(label) ?? createdIds.get(label) ?? null;
  };

  const before = await starvedCounts();
  console.log(`[load-tcpd] stage 2 (modern) — inserting into ${dbLabel}`);

  let electionCount = 0;
  let resultCount = 0;
  const aeDatasetId = uuidv7();
  const geDatasetId = uuidv7();

  await db.transaction(async (tx) => {
    const aeRow = manifest.find((m) => m.kind === "state_assembly")!;
    const geRow = manifest.find((m) => m.kind === "lok_sabha")!;
    const mkDataset = (id: string, slug: string, m: ManifestRow, what: string) =>
      tx.insert(schema.datasets).values({
        id,
        slug,
        name: `TCPD-IED LokDhaba ${what} export (2026-08-30)`,
        publisher: "Trivedi Centre for Political Data, Ashoka University",
        version: m.source_version,
        licence: "TCPD terms: non-commercial use only, citation required, no endorsement (captured in data/raw/tcpd/TERMS_LOKDHABA.md)",
        licenceUrl: m.source_url,
        retrievedOn: m.downloaded_on || today,
        upstreamUrl: LOKDHABA_URL,
        curator: "ai@cdswindia.org",
        notes:
          "turnout_percent is NULL on every row (A3: the export's per-constituency percentages cannot honestly aggregate, and no ruling changed that). " +
          "Poll_No is zero-based; bye/re-poll rows (Poll_No > 0) are excluded from these aggregates (spec §2.9). " +
          "Held label-years from the windowed dispositions (the SP gap) are SKIPPED, never guessed; the skip list is in the insert report. " +
          "Madras and Mysore attach to their first-class historical state rows, never across the rename (ruling 1, 2026-08-30). " +
          "Shared-form party labels are created verbatim with merge candidates, never unified (ruling 2 addendum).",
      });
    await mkDataset(aeDatasetId, AE_DATASET_SLUG, aeRow, "state assembly");
    await mkDataset(geDatasetId, GE_DATASET_SLUG, geRow, "Lok Sabha");

    // Madras/Mysore rows exist after the D3 insert; create-if-missing keeps
    // the runbook order-independent, with provenance on whoever created them.
    for (const h of [HISTORICAL_STATES.Madras, HISTORICAL_STATES.Mysore]) {
      const ex = await tx.select({ id: schema.states.id, name: schema.states.name }).from(schema.states).where(eq(schema.states.id, h.id));
      if (ex.length > 0) {
        if (ex[0].name !== h.name) fail(`state "${h.id}" exists with unexpected name "${ex[0].name}".`);
        continue;
      }
      await tx.insert(schema.states).values({ id: h.id, name: h.name, kind: "state", formedOn: null, dissolvedOn: null, hasGeometry: false });
      await tx.insert(schema.recordProvenance).values({ subjectType: "state", subjectId: h.id, datasetId: aeDatasetId, upstreamId: `state:${h.name}`, ingestedOn: today });
    }

    if (createLabels.length > 0) {
      const rows = [...createdIds.entries()].map(([label, id]) => ({ id, name: label, abbreviation: label, isPseudo: false }));
      for (let i = 0; i < rows.length; i += 500) await tx.insert(schema.parties).values(rows.slice(i, i + 500));
      const prov = [...createdIds.entries()].map(([label, id]) => ({
        subjectType: "party" as const,
        subjectId: id,
        datasetId: aeDatasetId,
        upstreamId: `party:${label}`,
        ingestedOn: today,
      }));
      for (let i = 0; i < prov.length; i += 500) await tx.insert(schema.recordProvenance).values(prov.slice(i, i + 500));
    }

    // Shared-form merge candidates (ruling 2 addendum), tagged for reversal.
    const candidateRows: Array<typeof schema.entityMatchCandidates.$inferInsert> = [];
    for (const g of scan.heldIncoming) {
      for (let i = 0; i < g.labels.length; i++)
        for (let j = i + 1; j < g.labels.length; j++)
          candidateRows.push({
            id: uuidv7(),
            entityType: "party",
            aId: createdIds.get(g.labels[i])!,
            bId: createdIds.get(g.labels[j])!,
            status: "possible",
            rationale: `same collapsed form "${g.form}" in the LokDhaba export; created verbatim per the no-merge ruling, paired only by a human [dataset:${AE_DATASET_SLUG}]`,
          });
    }
    for (let i = 0; i < candidateRows.length; i += 500) await tx.insert(schema.entityMatchCandidates).values(candidateRows.slice(i, i + 500));

    const srcExisting = await tx.select({ id: schema.sources.id }).from(schema.sources).where(eq(schema.sources.url, LOKDHABA_URL));
    const sourceId = srcExisting[0]?.id ?? uuidv7();
    if (!srcExisting[0]) {
      await tx.insert(schema.sources).values({
        id: sourceId,
        title: "TCPD Individual Incumbency Dataset (LokDhaba)",
        url: LOKDHABA_URL,
        publisher: "Trivedi Centre for Political Data, Ashoka University",
        publishedOn: null,
        accessedOn: "2026-08-30",
        kind: "research",
        isOfficial: false,
        isPrimary: true,
      });
    }

    for (const e of allAggs) {
      const datasetId = e.scope === "lok_sabha" ? geDatasetId : aeDatasetId;
      const electionId = uuidv7();
      await tx.insert(schema.elections).values({
        id: electionId,
        stateId: e.scope === "lok_sabha" ? "in" : e.stateId!,
        scope: e.scope,
        assemblyNumber: e.assemblyNo,
        electionDate: anchoredDate(e),
        electionDatePrecision: e.datePrecision === "day" ? "day" : e.datePrecision,
        totalSeats: e.totalSeats,
        turnoutPercent: null, // A3, unchanged by any ruling
        resultSummary: null,
      });
      electionCount++;
      const resultRows = e.parties
        .map((p) => ({ p, partyId: partyIdFor(p.recordedLabel, e.year) }))
        .filter((x): x is { p: (typeof e.parties)[number]; partyId: string } => x.partyId !== null)
        .map(({ p, partyId }) => ({
          electionId,
          partyId,
          seatsWon: p.seatsWon,
          seatsContested: p.seatsContested,
          voteSharePercent: p.voteSharePercent === null ? null : String(p.voteSharePercent),
        }));
      for (let i = 0; i < resultRows.length; i += 500) await tx.insert(schema.electionResults).values(resultRows.slice(i, i + 500));
      resultCount += resultRows.length;
      await tx.insert(schema.recordProvenance).values({ subjectType: "election", subjectId: electionId, datasetId, upstreamId: e.upstreamId, ingestedOn: today });
      await tx.insert(schema.citations).values({
        subjectType: "election",
        subjectId: electionId,
        sourceId,
        note: `${e.upstreamId} rows of the LokDhaba 2026-08-30 export; cite per data/raw/tcpd/TERMS_LOKDHABA.md.`,
      });
    }
  });

  for (const t of ["elections", "election_results", "record_provenance", "citations", "parties", "states", "datasets", "sources", "entity_match_candidates"]) {
    await db.execute(sql.raw(`ANALYZE ${t}`));
  }
  const after = await starvedCounts();

  const lines: string[] = [];
  lines.push(`# TCPD ingest — stage 2 insert report (modern files, D1+D2)`);
  lines.push(`\nGenerated ${today} against database ${dbLabel}.`);
  lines.push(`\n- elections inserted: ${electionCount} (364 AE + 15 GE)`);
  lines.push(`- election_results inserted: ${resultCount}`);
  lines.push(`- parties created verbatim: ${createLabels.length}; resolving to existing: ${resolves.size}; file-governed labels: ${fileLabels.size}`);
  lines.push(`- shared-form merge candidates written: ${scan.heldIncoming.reduce((n, g) => n + (g.labels.length * (g.labels.length - 1)) / 2, 0)} pairs from ${scan.heldIncoming.length} groups`);
  lines.push(`- HELD label-years skipped (never guessed): ${heldSkipped.length === 0 ? "none" : [...new Set(heldSkipped)].join("; ")}`);
  lines.push(`- turnout_percent: NULL on all rows (A3)`);
  lines.push(`\n## Starved panels — before/after (§5 success measure)`);
  lines.push(...panelDiffLines(before, after));
  const report = lines.join("\n");
  console.log("\n" + report + "\n");
  writeFileSync(join(ROOT, "insert-modern-report.md"), report);
  console.log(`[load-tcpd] report written to ${join(ROOT, "insert-modern-report.md")}`);
}

async function main() {
  const stage = process.argv.find((a) => a.startsWith("--stage="))?.slice(8);
  if (stage === "verify") return void (await verify());
  if (stage === "dry-run") return void (await dryRun());
  if (stage === "insert-early") return void (await insertEarly());
  if (stage === "insert-modern") return void (await insertModern());
  if (stage === "revert") {
    const slug = process.argv.find((a) => a.startsWith("--dataset="))?.slice(10);
    if (!slug) fail("revert needs --dataset=<slug>.");
    if (!hasConfirm()) fail("revert deletes rows; it runs only with an explicit --confirm.");
    const { revertDataset } = await import("./stage2-common");
    for (const line of await revertDataset(slug, fail)) console.log(`  ${line}`);
    return;
  }
  console.error("usage: pnpm tsx scripts/load-tcpd.ts --stage=verify|dry-run|insert-early|insert-modern|revert --dataset=<slug> [--confirm]");
  process.exit(2);
}

main().catch((e) => {
  console.error("[load-tcpd] FATAL:", e);
  process.exit(1);
});
