/**
 * TCPD / LokDhaba elections ingest: the pure half.
 *
 * Everything that decides what a TCPD row MEANS lives here, testable without
 * a database or the 40MB files: the header contract, the state map, grouping,
 * aggregation, and every ambiguity ruling from docs/ELECTIONS_INGEST_SPEC.md
 * §2.7 (cited as A1–A9 below). scripts/load-tcpd.ts is a thin shell over
 * these, same arrangement as the funding loader.
 *
 * House rule, same as ingest/provenance.ts: refuse rather than repair. A row
 * this module does not understand is counted and named, never guessed at.
 */

// ---------------------------------------------------------------------------
// Header contract (spec §2.1)
// ---------------------------------------------------------------------------

/**
 * The columns this pipeline READS. Verified against the real file in stage 0;
 * any of these missing stops everything.
 */
export const REQUIRED_COLUMNS = [
  "State_Name",
  "Assembly_No",
  "Constituency_No",
  "Year",
  "Poll_No",
  "Position",
  "Candidate",
  "Party",
  "Votes",
  "Valid_Votes",
  "Electors",
] as const;

/**
 * Columns this pass reads when present but does not require: `month` anchors
 * the election date (A2, A8); when it is absent every election simply gets
 * year precision. Absence is never an error.
 */
export const OPTIONAL_COLUMNS = ["month"] as const;

/**
 * Columns TCPD-IED v2 documents that this pass deliberately ignores (spec
 * §2.4). Their presence is expected; their absence is only a note, because
 * nothing here reads them.
 */
export const KNOWN_IGNORED_COLUMNS = [
  "DelimID", "Constituency_Name", "Constituency_Type", "Sex",
  "Candidate_Type", "N_Cand", "Turnout_Percentage", "Vote_Share_Percentage",
  "Deposit_Lost", "Margin", "Margin_Percentage", "ENOP", "pid",
  "Party_Type_TCPD", "Party_ID", "last_poll", "Contested", "Last_Party",
  "Last_Party_ID", "Last_Constituency_Name", "Same_Constituency",
  "Same_Party", "No_Terms", "Turncoat", "Incumbent", "Recontest",
] as const;

export type HeaderCheck =
  | { ok: true; unknown: string[] }
  | { ok: false; missing: string[]; unknown: string[] };

/**
 * The stage-0 gate. Missing required columns fail; columns we have never
 * heard of are reported (they are new information about the export, and the
 * spec says stop on drift so a person can look).
 */
export function checkHeader(actual: string[]): HeaderCheck {
  const have = new Set(actual.map((c) => c.trim()));
  const missing = REQUIRED_COLUMNS.filter((c) => !have.has(c));
  const known = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS, ...KNOWN_IGNORED_COLUMNS]);
  const unknown = [...have].filter((c) => !known.has(c));
  if (missing.length > 0) return { ok: false, missing, unknown };
  return { ok: true, unknown };
}

// ---------------------------------------------------------------------------
// State map (spec §2.2, ambiguity A1)
// ---------------------------------------------------------------------------

/**
 * TCPD State_Name → archive state id. Explicit and closed: a name not in
 * this map is REFUSED and counted, never guessed (A1). Historical states
 * (Madras, Bombay, Mysore, Hyderabad, PEPSU, …) are deliberately absent —
 * whether they become state rows is a curatorial decision parked at the
 * dry-run gate, and this map is where lifting that decision will be visible.
 *
 * Variants cover the spellings TCPD has used across releases; all resolve to
 * the same ids the rest of the archive uses.
 */
export const STATE_MAP: Readonly<Record<string, string>> = {
  Andaman_and_Nicobar_Islands: "an",
  "Andaman_&_Nicobar_Islands": "an",
  Andhra_Pradesh: "ap",
  Arunachal_Pradesh: "ar",
  Assam: "as",
  Bihar: "br",
  Chandigarh: "ch",
  Chhattisgarh: "ct",
  Dadra_and_Nagar_Haveli: "dn",
  "Dadra_&_Nagar_Haveli": "dn",
  Daman_and_Diu: "dd",
  "Daman_&_Diu": "dd",
  Delhi: "dl",
  NCT_of_Delhi: "dl",
  Goa: "ga",
  "Goa,_Daman_&_Diu": "ga", // pre-1987 union territory ran one assembly
  Gujarat: "gj",
  Haryana: "hr",
  Himachal_Pradesh: "hp",
  Jammu_and_Kashmir: "jk",
  "Jammu_&_Kashmir": "jk",
  Jharkhand: "jh",
  Karnataka: "ka",
  Kerala: "kl",
  Ladakh: "la",
  Lakshadweep: "ld",
  Madhya_Pradesh: "mp",
  Maharashtra: "mh",
  Manipur: "mn",
  Meghalaya: "ml",
  Mizoram: "mz",
  Nagaland: "nl",
  Odisha: "or",
  Orissa: "or",
  Puducherry: "py",
  Pondicherry: "py",
  Punjab: "pb",
  Rajasthan: "rj",
  Sikkim: "sk",
  Tamil_Nadu: "tn",
  Telangana: "tg",
  Tripura: "tr",
  Uttar_Pradesh: "up",
  Uttarakhand: "ut",
  Uttaranchal: "ut",
  West_Bengal: "wb",
};

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

export type TcpdRow = Record<string, string>;

export type ParsedRow = {
  stateName: string;
  stateId: string | null; // null = unmapped (A1)
  assemblyNo: number | null;
  constituencyNo: string;
  year: number;
  month: number | null; // 1–12 or null (A8)
  pollNo: number;
  position: number | null;
  candidate: string;
  party: string;
  votes: number | null;
  validVotes: number | null;
  electors: number | null;
};

const int = (raw: string | undefined): number | null => {
  const v = (raw ?? "").trim();
  if (!v || v === "NA") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

/** Read one CSV row into types. A row without the identity fields it needs
 *  (state, year, constituency) is unusable and refused by the caller.
 *
 *  Key lookup is case-insensitive because the shared `parseCsv` lowercases
 *  header keys. That loosens nothing: the header CONTRACT is enforced by
 *  `checkHeader` on the raw header line, in TCPD's exact casing. */
export function parseRow(input: TcpdRow): ParsedRow | { refused: string } {
  const row: TcpdRow = {};
  for (const k of Object.keys(input)) row[k.toLowerCase()] = input[k];

  const stateName = (row.state_name ?? "").trim();
  const year = int(row.year);
  const constituencyNo = (row.constituency_no ?? "").trim();
  const pollNo = int(row.poll_no) ?? 1;
  if (!stateName) return { refused: "empty State_Name" };
  if (year === null || year < 1950 || year > 2100)
    return { refused: `Year "${row.year}" is not a plausible election year` };
  if (!constituencyNo) return { refused: "empty Constituency_No" };

  const month = int(row.month);
  return {
    stateName,
    stateId: STATE_MAP[stateName] ?? null,
    assemblyNo: int(row.assembly_no),
    constituencyNo,
    year,
    // A8: a month outside 1–12 (0 is a known TCPD placeholder) is absent.
    month: month !== null && month >= 1 && month <= 12 ? month : null,
    pollNo,
    position: int(row.position),
    candidate: (row.candidate ?? "").trim(),
    party: (row.party ?? "").trim(),
    votes: int(row.votes),
    validVotes: int(row.valid_votes),
    electors: int(row.electors),
  };
}

// ---------------------------------------------------------------------------
// Special party labels (A5, and NOTA in §2.4)
// ---------------------------------------------------------------------------

export const NOTA_LABEL = "NOTA";
export const IND_LABEL = "IND";
/** The one loader-created aggregate: unaffiliated candidates as a group,
 *  never presented as an organisation (A5). */
export const INDEPENDENTS_PARTY_NAME = "Independents (IND)";

// ---------------------------------------------------------------------------
// Grouping and aggregation (spec §2.2, §2.3, §2.6)
// ---------------------------------------------------------------------------

export type Scope = "state_assembly" | "lok_sabha";

/** Election identity within a file (spec §2.6). Lok Sabha rows aggregate
 *  nationally (A9), so their key ignores the state. */
export function electionKey(r: ParsedRow, scope: Scope): string {
  return scope === "lok_sabha"
    ? `GE|${r.year}|${r.assemblyNo ?? "?"}`
    : `AE|${r.stateId}|${r.year}|${r.assemblyNo ?? "?"}`;
}

export function electionUpstreamId(
  scope: Scope,
  stateName: string,
  year: number,
  assemblyNo: number | null,
): string {
  return scope === "lok_sabha"
    ? `GE-${year}${assemblyNo != null ? `-L${assemblyNo}` : ""}`
    : `AE-${stateName}-${year}${assemblyNo != null ? `-A${assemblyNo}` : ""}`;
}

export type PartyAggregate = {
  /** The label as TCPD wrote it — verbatim, never unified (A4). For
   *  independents this is "IND" and `partyName` is the aggregate's name. */
  recordedLabel: string;
  partyName: string;
  seatsWon: number;
  seatsContested: number;
  votes: number;
  /** 2dp, or null when the denominator is unusable (A7). */
  voteSharePercent: number | null;
};

export type ElectionAggregate = {
  scope: Scope;
  stateId: string | null;
  stateName: string;
  year: number;
  /** Month only when every constituency that stated one agrees is too strong
   *  a rule for a multi-phase election; the FIRST recorded month is used and
   *  the spread is reported as an anomaly instead of silently narrowed. */
  month: number | null;
  /** "day" is produced only by the early-schema path (§2.8), where
   *  PollingDate is a recorded fact; the modern path never claims it. */
  datePrecision: "day" | "month" | "year";
  assemblyNo: number | null;
  totalSeats: number;
  upstreamId: string;
  parties: PartyAggregate[];
  /** Valid votes summed once per constituency; null when any needed
   *  denominator was missing (A7) — shares are then withheld for the whole
   *  election rather than computed over a partial denominator. */
  validVotesTotal: number | null;
  notaVotes: number;
  anomalies: string[];
};

export type AggregateOutcome = {
  elections: ElectionAggregate[];
  /** Counted refusals, by reason — the dry run prints these verbatim. */
  refused: Record<string, number>;
  byeRowCount: number; // A6
  unmappedStates: Record<string, number>; // A1: name -> row count
  duplicateRowCount: number; // §2.6
};

/**
 * Group parsed rows into election aggregates.
 *
 * Everything the spec rules on happens here, in one visible place:
 * bye-elections drop out (A6), NOTA leaves the party list but stays in the
 * denominator (§2.4), independents aggregate under one named group (A5),
 * unmapped states are refused and counted (A1), exact duplicate candidate
 * rows are refused (§2.6), and a missing denominator withholds vote share
 * rather than shrinking it (A7).
 */
export function aggregate(rows: ParsedRow[], scope: Scope): AggregateOutcome {
  const refused: Record<string, number> = {};
  const unmappedStates: Record<string, number> = {};
  const seenRow = new Set<string>();
  let byeRowCount = 0;
  let duplicateRowCount = 0;

  const groups = new Map<string, ParsedRow[]>();

  for (const r of rows) {
    if (r.pollNo > 1) {
      byeRowCount++;
      continue;
    }
    if (scope === "state_assembly" && r.stateId === null) {
      unmappedStates[r.stateName] = (unmappedStates[r.stateName] ?? 0) + 1;
      continue;
    }
    const rowKey = [r.stateName, r.year, r.pollNo, r.constituencyNo, r.position, r.candidate, r.party].join("|");
    if (seenRow.has(rowKey)) {
      duplicateRowCount++;
      continue;
    }
    seenRow.add(rowKey);

    const key = electionKey(r, scope);
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }

  const elections: ElectionAggregate[] = [];

  for (const g of groups.values()) {
    const first = g[0];
    const anomalies: string[] = [];

    // Valid votes: the column repeats per candidate row; count each
    // constituency once. A constituency whose value is missing poisons the
    // whole election's denominator (A7): a share over "most of the votes"
    // would be a silent transformation.
    const validByConstituency = new Map<string, number | null>();
    for (const r of g) {
      if (!validByConstituency.has(r.constituencyNo)) {
        validByConstituency.set(r.constituencyNo, r.validVotes);
      } else if (validByConstituency.get(r.constituencyNo) !== r.validVotes) {
        anomalies.push(`constituency ${r.constituencyNo}: Valid_Votes disagrees between rows`);
        validByConstituency.set(r.constituencyNo, null);
      }
    }
    let validVotesTotal: number | null = 0;
    for (const v of validByConstituency.values()) {
      if (v === null) {
        validVotesTotal = null;
        break;
      }
      validVotesTotal += v;
    }
    if (validVotesTotal === null) anomalies.push("vote shares withheld: incomplete Valid_Votes (A7)");

    // Month: multi-phase elections legitimately span months. First one wins
    // for the anchor; the spread is stated, not narrowed.
    const months = [...new Set(g.map((r) => r.month).filter((m): m is number => m !== null))];
    if (months.length > 1) anomalies.push(`election spans months ${months.sort((a, b) => a - b).join(", ")}; anchored to the earliest`);
    const month = months.length > 0 ? Math.min(...months) : null;

    // Party aggregation.
    const byParty = new Map<string, { label: string; name: string; seats: number; cons: Set<string>; votes: number }>();
    let notaVotes = 0;
    for (const r of g) {
      if (r.party === NOTA_LABEL) {
        notaVotes += r.votes ?? 0;
        continue; // not a party; stays in the denominator via Valid_Votes
      }
      const isInd = r.party === IND_LABEL;
      const label = isInd ? IND_LABEL : r.party;
      const name = isInd ? INDEPENDENTS_PARTY_NAME : r.party;
      if (!label) {
        refused["empty Party label"] = (refused["empty Party label"] ?? 0) + 1;
        continue;
      }
      const p = byParty.get(label) ?? { label, name, seats: 0, cons: new Set<string>(), votes: 0 };
      if (r.position === 1) p.seats++;
      p.cons.add(r.constituencyNo);
      p.votes += r.votes ?? 0;
      byParty.set(label, p);
    }

    const parties: PartyAggregate[] = [...byParty.values()]
      .map((p) => ({
        recordedLabel: p.label,
        partyName: p.name,
        seatsWon: p.seats,
        seatsContested: p.cons.size,
        votes: p.votes,
        voteSharePercent:
          validVotesTotal && validVotesTotal > 0
            ? Math.round((p.votes / validVotesTotal) * 10000) / 100
            : null,
      }))
      .sort((a, b) => b.seatsWon - a.seatsWon || b.votes - a.votes || a.partyName.localeCompare(b.partyName));

    elections.push({
      scope,
      stateId: scope === "lok_sabha" ? "in" : first.stateId,
      stateName: scope === "lok_sabha" ? "India" : first.stateName,
      year: first.year,
      month,
      datePrecision: month !== null ? "month" : "year",
      assemblyNo: first.assemblyNo,
      totalSeats: new Set(g.map((r) => r.constituencyNo)).size,
      upstreamId: electionUpstreamId(scope, scope === "lok_sabha" ? "IN" : first.stateName, first.year, first.assemblyNo),
      parties,
      validVotesTotal,
      notaVotes,
      anomalies,
    });
  }

  elections.sort((a, b) => a.year - b.year || (a.stateId ?? "").localeCompare(b.stateId ?? ""));
  return { elections, refused, byeRowCount, unmappedStates, duplicateRowCount };
}

/**
 * The anchored date for an aggregate (A2). Never rendered at more precision
 * than `datePrecision` — the render side of that promise lands with the
 * stage-2 migration; this function only builds the anchor.
 */
export function anchoredDate(e: Pick<ElectionAggregate, "year" | "month">): string {
  const mm = e.month !== null ? String(e.month).padStart(2, "0") : "01";
  return `${e.year}-${mm}-01`;
}

// ---------------------------------------------------------------------------
// Reconciliation (spec §4)
// ---------------------------------------------------------------------------

export type HandParty = {
  partyId: string;
  name: string;
  abbreviation: string | null;
  seatsWon: number;
  seatsContested: number | null;
  voteSharePercent: number | null;
};

export type HandElection = {
  id: string;
  stateId: string;
  scope: Scope;
  /** ISO date as stored. Only its year component is ever compared (§4.2). */
  electionDate: string;
  assemblyNumber: number | null;
  totalSeats: number | null;
  turnoutPercent: number | null;
  citationCount: number;
  parties: HandParty[];
};

export type FieldComparison = {
  field: string;
  hand: string;
  tcpd: string;
  agree: boolean;
};

export type Reconciliation =
  | { outcome: "match"; hand: HandElection; tcpd: ElectionAggregate; fields: FieldComparison[]; unmatchedHandParties: string[]; unmatchedTcpdParties: string[] }
  | { outcome: "hand_only"; hand: HandElection }
  | { outcome: "tcpd_only"; tcpd: ElectionAggregate }
  | { outcome: "ambiguous"; hands: HandElection[]; tcpds: ElectionAggregate[]; key: string };

const show = (v: number | string | null | undefined): string => (v == null ? "—" : String(v));

/** ±0.1pp for percents, exact for integers (§4.2). Null on either side is a
 *  non-comparison shown as such, never scored as disagreement: absence is not
 *  a value. */
function compareField(field: string, hand: number | null, tcpd: number | null, pp = false): FieldComparison {
  const agree =
    hand == null || tcpd == null
      ? true // nothing to dispute; the dash in the table says which side is silent
      : pp
        ? Math.abs(hand - tcpd) <= 0.1
        : hand === tcpd;
  return { field, hand: show(hand), tcpd: show(tcpd), agree };
}

/** Case-insensitive exact match on abbreviation, then name — the same rule
 *  the loader will use (A4). Deliberately no fuzziness: a fuzzy party match
 *  is an identity decision, and those belong to review. */
function matchParty(hand: HandParty[], label: string, name: string): HandParty | undefined {
  const norm = (s: string) => s.trim().toUpperCase();
  return (
    hand.find((p) => p.abbreviation && norm(p.abbreviation) === norm(label)) ??
    hand.find((p) => norm(p.name) === norm(name)) ??
    hand.find((p) => norm(p.name) === norm(label))
  );
}

/**
 * Reconcile one matched pair. The caller has already grouped by the §4.1 key
 * (stateId, scope, year, then assembly number as tiebreaker); this function
 * only compares, and never mutates either side.
 */
export function reconcileElection(hand: HandElection, tcpd: ElectionAggregate): Extract<Reconciliation, { outcome: "match" }> {
  const fields: FieldComparison[] = [
    compareField("election year", Number(hand.electionDate.slice(0, 4)), tcpd.year),
    compareField("assembly_number", hand.assemblyNumber, tcpd.assemblyNo),
    compareField("total_seats", hand.totalSeats, tcpd.totalSeats),
    // Turnout: TCPD side is always null here (A3: not derivable into the
    // database); the derived comparison figure, where wanted, is computed by
    // the report layer and marked as derived there.
    compareField("turnout_percent", hand.turnoutPercent, null, true),
  ];

  const unmatchedHandParties: string[] = [];
  const unmatchedTcpdParties: string[] = [];
  const seen = new Set<string>();

  for (const tp of tcpd.parties) {
    const hp = matchParty(hand.parties, tp.recordedLabel, tp.partyName);
    if (!hp) {
      unmatchedTcpdParties.push(tp.recordedLabel);
      continue;
    }
    seen.add(hp.partyId);
    fields.push(compareField(`${tp.recordedLabel} seats_won`, hp.seatsWon, tp.seatsWon));
    if (hp.seatsContested != null && tp.seatsContested > 0)
      fields.push(compareField(`${tp.recordedLabel} seats_contested`, hp.seatsContested, tp.seatsContested));
    if (hp.voteSharePercent != null)
      fields.push(compareField(`${tp.recordedLabel} vote_share`, hp.voteSharePercent, tp.voteSharePercent, true));
  }
  for (const hp of hand.parties) {
    if (!seen.has(hp.partyId)) unmatchedHandParties.push(hp.abbreviation ?? hp.name);
  }

  return { outcome: "match", hand, tcpd, fields, unmatchedHandParties, unmatchedTcpdParties };
}

/**
 * Pair hand elections with TCPD aggregates on the §4.1 key. Cardinality
 * problems come back as `ambiguous` — a conflict to report, never a pick.
 */
export function reconcileAll(hand: HandElection[], tcpd: ElectionAggregate[]): Reconciliation[] {
  const key = (stateId: string, scope: Scope, year: number) => `${scope}|${stateId}|${year}`;
  const handBy = new Map<string, HandElection[]>();
  for (const h of hand) {
    const k = key(h.stateId, h.scope, Number(h.electionDate.slice(0, 4)));
    handBy.set(k, [...(handBy.get(k) ?? []), h]);
  }
  const tcpdBy = new Map<string, ElectionAggregate[]>();
  for (const t of tcpd) {
    if (t.stateId === null) continue;
    const k = key(t.stateId, t.scope, t.year);
    tcpdBy.set(k, [...(tcpdBy.get(k) ?? []), t]);
  }

  const out: Reconciliation[] = [];
  const done = new Set<string>();

  for (const [k, hs] of handBy) {
    const ts = tcpdBy.get(k) ?? [];
    done.add(k);
    if (ts.length === 0) {
      for (const h of hs) out.push({ outcome: "hand_only", hand: h });
      continue;
    }
    if (hs.length === 1 && ts.length === 1) {
      out.push(reconcileElection(hs[0], ts[0]));
      continue;
    }
    // Assembly number as tiebreaker (§4.1); anything still unpaired is
    // ambiguous and reported whole.
    const byAsm = (n: number | null, list: { assemblyNumber?: number | null; assemblyNo?: number | null }[]) =>
      list.filter((x) => ("assemblyNumber" in x ? x.assemblyNumber : x.assemblyNo) === n);
    const pairedT = new Set<ElectionAggregate>();
    const pairedH = new Set<HandElection>();
    for (const h of hs) {
      const cand = byAsm(h.assemblyNumber, ts) as ElectionAggregate[];
      if (cand.length === 1 && !pairedT.has(cand[0])) {
        out.push(reconcileElection(h, cand[0]));
        pairedT.add(cand[0]);
        pairedH.add(h);
      }
    }
    const restH = hs.filter((h) => !pairedH.has(h));
    const restT = ts.filter((t) => !pairedT.has(t));
    if (restH.length || restT.length) out.push({ outcome: "ambiguous", hands: restH, tcpds: restT, key: k });
  }

  for (const [k, ts] of tcpdBy) {
    if (done.has(k)) continue;
    for (const t of ts) out.push({ outcome: "tcpd_only", tcpd: t });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Party identity against the existing `parties` table (spec §2.2 A4, §3)
// ---------------------------------------------------------------------------

export type KnownParty = {
  id: string;
  name: string;
  abbreviation: string | null;
  isPseudo: boolean;
};

export type PartyMatch =
  | { kind: "one"; party: KnownParty }
  | { kind: "none" }
  | { kind: "many"; parties: KnownParty[] };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * A4: a TCPD party label resolves to an existing party by exact normalized
 * abbreviation, then exact normalized name (the aggregate's display name is
 * tried against names last, which is how the IND aggregate finds the existing
 * pseudo-party). No fuzz, ever: INC(I) never becomes INC. More than one hit
 * is returned whole as "many" — inherited match-candidate discipline, a human
 * pairs them, the loader never picks.
 */
export function matchKnownParty(known: KnownParty[], label: string, name: string): PartyMatch {
  const l = norm(label);
  const byAbbrev = known.filter((p) => norm(p.abbreviation) === l && l !== "");
  if (byAbbrev.length === 1) return { kind: "one", party: byAbbrev[0] };
  if (byAbbrev.length > 1) return { kind: "many", parties: byAbbrev };
  const byName = known.filter((p) => norm(p.name) === l || norm(p.name) === norm(name));
  if (byName.length === 1) return { kind: "one", party: byName[0] };
  if (byName.length > 1) return { kind: "many", parties: byName };
  return { kind: "none" };
}

// ---------------------------------------------------------------------------
// Committed party dispositions (gate ruling 5, corrected)
// ---------------------------------------------------------------------------
//
// The dry run resolved 6 labels by exact abbreviation, and one of them was an
// era collision: the 1950s "SP" is the Socialist Party, not the 1992
// Samajwadi Party the abbreviation matches today. Exact matching is still an
// identity DECISION, so for the early file every label's disposition lives in
// a committed file (data/raw/tcpd/PARTY_RESOLUTIONS.csv), reviewed at the
// gate. This checker verifies the file against the data and the matcher:
// coverage both ways, resolve targets that exist, and a stated reason
// wherever a human overrode what the matcher would have done.

export type PartyDisposition = {
  label: string;
  disposition: "create" | "resolve";
  partyId: string | null; // required for resolve
  reason: string;
};

export type ResolutionCheck =
  | { ok: true; resolve: Map<string, string>; create: string[] }
  | { ok: false; problems: string[] };

export function checkPartyResolutions(
  labels: string[],
  known: KnownParty[],
  committed: PartyDisposition[],
): ResolutionCheck {
  const problems: string[] = [];
  const byLabel = new Map<string, PartyDisposition>();
  for (const d of committed) {
    if (byLabel.has(d.label)) problems.push(`"${d.label}" appears twice in PARTY_RESOLUTIONS.csv`);
    byLabel.set(d.label, d);
  }
  const dataLabels = new Set(labels);
  for (const l of dataLabels) {
    if (!byLabel.has(l)) problems.push(`label "${l}" is in the data but has no committed disposition`);
  }
  for (const d of committed) {
    if (!dataLabels.has(d.label)) problems.push(`"${d.label}" is committed but not in the data — the file has drifted`);
    const auto = matchKnownParty(known, d.label, d.label);
    if (d.disposition === "resolve") {
      if (!d.partyId) {
        problems.push(`"${d.label}" says resolve but names no party_id`);
        continue;
      }
      const target = known.find((p) => p.id === d.partyId);
      if (!target) {
        problems.push(`"${d.label}" resolves to "${d.partyId}", which does not exist`);
        continue;
      }
      const agreesWithAuto = auto.kind === "one" && auto.party.id === d.partyId;
      if (!agreesWithAuto && !d.reason)
        problems.push(`"${d.label}" -> ${d.partyId} is a human pairing the matcher would not make; it needs a stated reason`);
    } else {
      if (auto.kind === "one" && !d.reason)
        problems.push(`"${d.label}" is set to create although it matches ${auto.party.id}; overriding the matcher needs a stated reason`);
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  const resolve = new Map<string, string>();
  const create: string[] = [];
  for (const l of dataLabels) {
    const d = byLabel.get(l)!;
    if (d.disposition === "resolve") resolve.set(l, d.partyId!);
    else create.push(l);
  }
  return { ok: true, resolve, create: create.sort() };
}

// ---------------------------------------------------------------------------
// Early schema: TCPD-IED 1951–62 (spec §2.8, the D3 drop)
// ---------------------------------------------------------------------------
//
// The pre-1962 file is a different export with a different contract: one file
// holds BOTH assembly and general rows (Election_Type separates them), Winner
// is the string True/False with no Position column (multi-member seats make
// ranking impossible, per the codebook), NumberOfSeats/ElectorsTotal/
// ElectorsWhoVoted/VotesValid are per-constituency columns repeated on every
// candidate row, and PollingDate arrives in two formats. Everything below is
// measured against the delivered file, not assumed — see the spec amendment
// and data/raw/tcpd/D3_FINDINGS.md.

/** Columns the early pass READS; any missing stops stage 0. */
export const EARLY_REQUIRED_COLUMNS = [
  "Election_Type",
  "State_Name",
  "Assembly_No",
  "Constituency_No",
  "Candidate",
  "Party",
  "Votes",
  "Winner",
  "NumberOfSeats",
  "ElectorsTotal",
  "ElectorsWhoVoted",
  "VotesValid",
  "PollingDate",
  "Year",
] as const;

/** Columns the early file carries that this pass deliberately ignores
 *  (candidate spine lands later; derived Runner-up/Winner-N columns are
 *  recomputable from the rows they were derived from). */
export const EARLY_KNOWN_IGNORED_COLUMNS = [
  "Gender", "Constituency_Name", "Idx", "Party_Type", "Party_Expanded",
  "Runner up.PARTY", "Runner up.CANDIDATE", "Runner up.VOTES",
  "Winner 1.PARTY", "Winner 1.CANDIDATE", "Winner 1.VOTES",
  "Winner 2.PARTY", "Winner 2.CANDIDATE", "Winner 2.VOTES",
  "Winner 3.PARTY", "Winner 3.CANDIDATE", "Winner 3.VOTES",
] as const;

/** Stage-0 gate for the early header, same contract shape as checkHeader. */
export function checkEarlyHeader(actual: string[]): HeaderCheck {
  const have = new Set(actual.map((c) => c.trim()));
  const missing = EARLY_REQUIRED_COLUMNS.filter((c) => !have.has(c));
  const known = new Set<string>([...EARLY_REQUIRED_COLUMNS, ...EARLY_KNOWN_IGNORED_COLUMNS]);
  const unknown = [...have].filter((c) => !known.has(c));
  if (missing.length > 0) return { ok: false, missing, unknown };
  return { ok: true, unknown };
}

export type EarlyDate = { iso: string; year: number };

/**
 * PollingDate arrives in TWO formats (measured: 16,363 DD/MM/YY rows,
 * 12,982 DD-MM-YYYY rows, 1,094 empty). The century rule for the two-digit
 * form is explicit, never implied: this file covers 1951–62, so YY maps to
 * 19YY, and any resulting year outside 1950–1970 is REFUSED — a two-digit
 * year that lands outside the sanity band means the rule no longer applies
 * and a person must look. Impossible calendar dates are refused, not clamped.
 */
export function parseEarlyDate(raw: string): EarlyDate | null | { refused: string } {
  const v = raw.trim();
  if (!v) return null;
  let d: number, mo: number, y: number;
  let m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(v);
  if (m) {
    d = Number(m[1]); mo = Number(m[2]); y = 1900 + Number(m[3]);
  } else if ((m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v))) {
    d = Number(m[1]); mo = Number(m[2]); y = Number(m[3]);
  } else {
    return { refused: `PollingDate "${v}" matches neither DD/MM/YY nor DD-MM-YYYY` };
  }
  if (y < 1950 || y > 1970)
    return { refused: `PollingDate "${v}" resolves to ${y}, outside the 1950–1970 sanity band` };
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
    return { refused: `PollingDate "${v}" is not a real calendar date` };
  return { iso: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, year: y };
}

export type ParsedEarlyRow = {
  electionType: "AE" | "GE";
  /** Exactly as the file wrote it. */
  stateNameRaw: string;
  /** After the committed alias map (data/raw/tcpd/STATE_ALIASES.csv); equals
   *  stateNameRaw when no alias applied. Aliases are committed data, applied
   *  visibly and tallied — never a silent in-code normalisation. */
  stateName: string;
  stateId: string | null; // STATE_MAP on the canonical name; null = historical state (§2.8)
  assemblyNo: number;
  constituencyNo: string;
  candidate: string;
  party: string;
  votes: number | null;
  winner: boolean;
  numberOfSeats: number;
  electorsTotal: number | null;
  electorsWhoVoted: number | null;
  votesValid: number | null;
  date: EarlyDate | null;
  year: number;
};

/** Read one early-schema CSV row. Same case-insensitive key rule as parseRow
 *  (the shared parseCsv lowercases header keys; the contract itself is
 *  enforced on the raw header line by checkEarlyHeader). */
export function parseEarlyRow(
  input: TcpdRow,
  aliases: Readonly<Record<string, string>>,
): ParsedEarlyRow | { refused: string } {
  const row: TcpdRow = {};
  for (const k of Object.keys(input)) row[k.toLowerCase()] = input[k];

  const electionType = (row.election_type ?? "").trim();
  if (electionType !== "AE" && electionType !== "GE")
    return { refused: `Election_Type "${electionType}" is neither AE nor GE` };

  const stateNameRaw = (row.state_name ?? "").trim();
  if (!stateNameRaw) return { refused: "empty State_Name" };
  const stateName = aliases[stateNameRaw] ?? stateNameRaw;

  const assemblyNo = int(row.assembly_no);
  if (assemblyNo === null) return { refused: `Assembly_No "${row.assembly_no}" is not an integer` };
  const constituencyNo = (row.constituency_no ?? "").trim();
  if (!constituencyNo) return { refused: "empty Constituency_No" };

  const winnerRaw = (row.winner ?? "").trim();
  if (winnerRaw !== "True" && winnerRaw !== "False")
    return { refused: `Winner "${winnerRaw}" is neither True nor False` };

  const numberOfSeats = int(row.numberofseats);
  if (numberOfSeats === null || numberOfSeats < 1)
    return { refused: `NumberOfSeats "${row.numberofseats}" is not a positive integer` };

  const year = int(row.year);
  if (year === null || year < 1950 || year > 1970)
    return { refused: `Year "${row.year}" is outside the file's 1950–1970 band` };

  const date = parseEarlyDate(row.pollingdate ?? "");
  if (date !== null && "refused" in date) return date;
  // Year is documented as derived from PollingDate (codebook §19); a clash
  // between them is drift, and drift stops a person rather than being picked.
  if (date !== null && date.year !== year)
    return { refused: `PollingDate year ${date.year} disagrees with Year "${row.year}"` };

  return {
    electionType,
    stateNameRaw,
    stateName,
    stateId: STATE_MAP[stateName] ?? null,
    assemblyNo,
    constituencyNo,
    candidate: (row.candidate ?? "").trim(),
    party: (row.party ?? "").trim(),
    votes: int(row.votes),
    winner: winnerRaw === "True",
    numberOfSeats,
    electorsTotal: int(row.electorstotal),
    electorsWhoVoted: int(row.electorswhovoted),
    votesValid: int(row.votesvalid),
    date,
    year,
  };
}

export type EarlyPartyAggregate = PartyAggregate & {
  /** Distinct constituencies the party stood in. seatsContested itself is the
   *  CANDIDACY count for this era: in a two-seat constituency a party could
   *  field two candidates, so distinct constituencies undercounts what it
   *  contested. Both figures are kept; neither is estimated. */
  constituenciesContested: number;
};

export type EarlyElectionAggregate = Omit<ElectionAggregate, "parties"> & {
  parties: EarlyPartyAggregate[];
  /** ISO date when datePrecision is "day" (anchored to the earliest polling
   *  date, with any spread reported as an anomaly, mirroring the modern
   *  month rule); null when the election carries no dated rows at all. */
  electionDate: string | null;
  constituencies: number;
  /** NumberOfSeats value -> how many constituencies carry it. */
  seatsByMagnitude: Record<number, number>;
  electorsTotal: number | null;
  electorsWhoVoted: number | null;
  /** electorsWhoVoted / electorsTotal, 2dp; null when either sum is poisoned
   *  or when a persons-basis figure would exceed 100 (a data error, refused). */
  turnoutPercent: number | null;
  /** "persons" only when every constituency is single-member. Measured fact
   *  (§2.8): ElectorsWhoVoted ≡ VotesValid on all but one election, so in a
   *  multi-member constituency the column counts BALLOTS, not people, and the
   *  quotient is votes-per-elector, not turnout. The basis travels with the
   *  number so the gate can rule on what is storable. */
  turnoutBasis: "persons" | "ballots";
};

/** One per-state slice of a national GE — the recorded facts the A9 rollup
 *  would otherwise discard at insert time. Gate ruling 3 (2026-08-28):
 *  aggregation must be reversible from what we store, so these are written
 *  to committed CSVs beside the manifest and referenced from the dataset
 *  notes. Party rows and constituency-level sums are both kept because the
 *  sums are not derivable from the party rows. */
export type GeStateSlice = {
  assemblyNo: number;
  year: number;
  stateName: string;
  constituencies: number;
  seats: number;
  electorsTotal: number | null;
  /** ElectorsWhoVoted summed once per constituency — BALLOTS, not persons,
   *  wherever a multi-member constituency is in the sum (§2.8). */
  ballotsCast: number | null;
  votesValid: number | null;
  parties: Array<{ label: string; candidates: number; seatsWon: number; votes: number }>;
};

export type EarlyAggregateOutcome = {
  elections: EarlyElectionAggregate[];
  refused: Record<string, number>;
  duplicateRowCount: number;
  /** variant spelling -> canonical + how many rows it covered. The dry-run
   *  report checks these against the committed STATE_ALIASES.csv counts. */
  aliasApplications: Record<string, { canonical: string; rows: number }>;
  /** Canonical state names with no archive id (the historical states) ->
   *  candidate-row count. These AGGREGATE (unlike the modern A1 refusal):
   *  whether they become first-class state rows is the gate's decision, and
   *  the gate needs the aggregates in front of it to decide. */
  statesWithoutId: Record<string, number>;
  /** The file's own grouping — (Election_Type, canonical state, Assembly_No)
   *  — before the A9 national GE rollup. This is the view D3_FINDINGS.md
   *  measured (82 / 371 / 669) and what the gate's expected-numbers check
   *  runs against. */
  fileGroups: { elections: number; partyRowsWithSeats: number; partyRowsAll: number };
  /** The per-state GE slices, preserved (gate ruling 3). */
  geSlices: GeStateSlice[];
};

/**
 * Group parsed early rows into election aggregates.
 *
 * Rulings, in one visible place: AE elections keyed per state; GE rows roll
 * up NATIONALLY on Assembly_No alone (A9, and the codebook's own instruction:
 * "For GE, we ignore the State_Name"). Constituency identity always includes
 * the state, because Constituency_No repeats across states. total_seats is
 * the sum of NumberOfSeats once per constituency, never a constituency count
 * (multi-member seats, §2.8). Turnout is summed from raw counts once per
 * constituency and carries its basis. Zero-seat contesting parties are kept:
 * a recorded vote total is a fact whether or not it won a seat, and the
 * modern path keeps them too. Independents aggregate under the existing
 * pseudo-party (A5). Exact duplicate rows are refused and counted.
 */
export function aggregateEarly(rows: ParsedEarlyRow[]): EarlyAggregateOutcome {
  const refused: Record<string, number> = {};
  const aliasApplications: Record<string, { canonical: string; rows: number }> = {};
  const statesWithoutId: Record<string, number> = {};
  const seenRow = new Set<string>();
  let duplicateRowCount = 0;

  const groups = new Map<string, ParsedEarlyRow[]>();
  const fileGroupParties = new Map<string, Map<string, number>>(); // file-view group -> party -> seats
  const geRows: ParsedEarlyRow[] = []; // deduped GE rows, for the preserved slices

  for (const r of rows) {
    if (r.stateNameRaw !== r.stateName) {
      const a = aliasApplications[r.stateNameRaw] ?? { canonical: r.stateName, rows: 0 };
      a.rows++;
      aliasApplications[r.stateNameRaw] = a;
    }
    if (r.stateId === null) statesWithoutId[r.stateName] = (statesWithoutId[r.stateName] ?? 0) + 1;

    const rowKey = [r.electionType, r.stateNameRaw, r.assemblyNo, r.constituencyNo, r.candidate, r.party, r.votes].join("|");
    if (seenRow.has(rowKey)) {
      duplicateRowCount++;
      continue;
    }
    seenRow.add(rowKey);

    const fileKey = `${r.electionType}|${r.stateName}|${r.assemblyNo}`;
    const fp = fileGroupParties.get(fileKey) ?? new Map<string, number>();
    fp.set(r.party, (fp.get(r.party) ?? 0) + (r.winner ? 1 : 0));
    fileGroupParties.set(fileKey, fp);

    const key = r.electionType === "GE" ? `GE|${r.assemblyNo}` : `AE|${r.stateName}|${r.assemblyNo}`;
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
    if (r.electionType === "GE") geRows.push(r);
  }

  // The per-state GE slices (gate ruling 3). Same first-seen-per-constituency
  // discipline as the main path; a disagreement would already be an anomaly on
  // the national aggregate, so here the sums simply follow the same rows.
  const sliceMap = new Map<string, GeStateSlice>();
  for (const r of geRows) {
    const k = `${r.assemblyNo}|${r.stateName}`;
    const s =
      sliceMap.get(k) ??
      ({ assemblyNo: r.assemblyNo, year: r.year, stateName: r.stateName, constituencies: 0, seats: 0, electorsTotal: 0, ballotsCast: 0, votesValid: 0, parties: [] } as GeStateSlice);
    s.year = Math.min(s.year, r.year);
    sliceMap.set(k, s);
  }
  for (const [k, s] of sliceMap) {
    const rowsHere = geRows.filter((r) => `${r.assemblyNo}|${r.stateName}` === k);
    const byConst = new Map<string, ParsedEarlyRow>();
    for (const r of rowsHere) if (!byConst.has(r.constituencyNo)) byConst.set(r.constituencyNo, r);
    s.constituencies = byConst.size;
    for (const c of byConst.values()) {
      s.seats += c.numberOfSeats;
      s.electorsTotal = s.electorsTotal === null || c.electorsTotal === null ? null : s.electorsTotal + c.electorsTotal;
      s.ballotsCast = s.ballotsCast === null || c.electorsWhoVoted === null ? null : s.ballotsCast + c.electorsWhoVoted;
      s.votesValid = s.votesValid === null || c.votesValid === null ? null : s.votesValid + c.votesValid;
    }
    const byParty = new Map<string, { label: string; candidates: number; seatsWon: number; votes: number }>();
    for (const r of rowsHere) {
      const p = byParty.get(r.party) ?? { label: r.party, candidates: 0, seatsWon: 0, votes: 0 };
      p.candidates++;
      if (r.winner) p.seatsWon++;
      p.votes += r.votes ?? 0;
      byParty.set(r.party, p);
    }
    s.parties = [...byParty.values()].sort((a, b) => b.seatsWon - a.seatsWon || b.votes - a.votes || a.label.localeCompare(b.label));
  }
  const geSlices = [...sliceMap.values()].sort(
    (a, b) => a.assemblyNo - b.assemblyNo || a.stateName.localeCompare(b.stateName),
  );

  let partyRowsWithSeats = 0;
  let partyRowsAll = 0;
  for (const fp of fileGroupParties.values()) {
    partyRowsAll += fp.size;
    for (const wins of fp.values()) if (wins > 0) partyRowsWithSeats++;
  }

  const elections: EarlyElectionAggregate[] = [];

  for (const g of groups.values()) {
    const first = g[0];
    const isGE = first.electionType === "GE";
    const anomalies: string[] = [];

    // Year: no group in the delivered file spans years, but the rule for one
    // that did mirrors the modern month rule — earliest wins, spread stated.
    const years = [...new Set(g.map((r) => r.year))].sort((a, b) => a - b);
    if (years.length > 1) anomalies.push(`election spans Year values ${years.join(", ")}; anchored to the earliest`);
    const year = years[0];

    // Election date: a national GE legitimately polls on many days across
    // states; anchored to the earliest, spread stated, precision stays "day"
    // because every date in the spread is a recorded day.
    const dates = [...new Set(g.map((r) => r.date?.iso).filter((d): d is string => d != null))].sort();
    if (dates.length > 1)
      anomalies.push(`polling spans ${dates.length} recorded dates (${dates[0]} to ${dates[dates.length - 1]}); anchored to the earliest`);
    const electionDate = dates.length > 0 ? dates[0] : null;

    // Per-constituency facts, keyed WITH the state (Constituency_No repeats
    // across states, which matters for the national GE groups). Disagreement
    // between rows of one constituency poisons that fact for the election
    // (A7 discipline): a total over "most of the rows" is a silent repair.
    type ConstFacts = { seats: number | null; electors: number | null; voted: number | null; valid: number | null };
    const byConst = new Map<string, ConstFacts>();
    for (const r of g) {
      const ck = `${r.stateName}|${r.constituencyNo}`;
      const c = byConst.get(ck);
      if (!c) {
        byConst.set(ck, { seats: r.numberOfSeats, electors: r.electorsTotal, voted: r.electorsWhoVoted, valid: r.votesValid });
        continue;
      }
      if (c.seats !== r.numberOfSeats) {
        anomalies.push(`constituency ${ck}: NumberOfSeats disagrees between rows; seat total unreliable`);
        c.seats = null;
      }
      if (c.electors !== r.electorsTotal) { anomalies.push(`constituency ${ck}: ElectorsTotal disagrees between rows`); c.electors = null; }
      if (c.voted !== r.electorsWhoVoted) { anomalies.push(`constituency ${ck}: ElectorsWhoVoted disagrees between rows`); c.voted = null; }
      if (c.valid !== r.votesValid) { anomalies.push(`constituency ${ck}: VotesValid disagrees between rows`); c.valid = null; }
    }

    let totalSeats = 0;
    const seatsByMagnitude: Record<number, number> = {};
    let electorsTotal: number | null = 0;
    let electorsWhoVoted: number | null = 0;
    let validVotesTotal: number | null = 0;
    let votedNeValid = 0;
    for (const [ck, c] of byConst) {
      if (c.seats !== null) {
        totalSeats += c.seats;
        seatsByMagnitude[c.seats] = (seatsByMagnitude[c.seats] ?? 0) + 1;
      }
      electorsTotal = c.electors === null || electorsTotal === null ? null : electorsTotal + c.electors;
      electorsWhoVoted = c.voted === null || electorsWhoVoted === null ? null : electorsWhoVoted + c.voted;
      validVotesTotal = c.valid === null || validVotesTotal === null ? null : validVotesTotal + c.valid;
      if (c.voted !== null && c.valid !== null && c.voted !== c.valid) votedNeValid++;
      if (c.seats === 1 && c.voted !== null && c.electors !== null && c.voted > c.electors)
        anomalies.push(`constituency ${ck}: more votes than electors in a single-member seat`);
    }
    if (votedNeValid > 0)
      anomalies.push(`${votedNeValid} constituencies where ElectorsWhoVoted differs from VotesValid (the codebook's own Kerala exception)`);
    if (validVotesTotal === null) anomalies.push("vote shares withheld: incomplete VotesValid (A7)");

    // Seat arithmetic must close: Σ NumberOfSeats over constituencies equals
    // the Winner=True row count, or something is corrupt and the report says.
    const winnerRows = g.filter((r) => r.winner).length;
    if (totalSeats !== winnerRows)
      anomalies.push(`seat arithmetic broken: total_seats ${totalSeats} vs ${winnerRows} Winner=True rows`);

    const turnoutBasis: "persons" | "ballots" = Object.keys(seatsByMagnitude).some((k) => Number(k) > 1)
      ? "ballots"
      : "persons";
    let turnoutPercent: number | null = null;
    if (electorsTotal !== null && electorsWhoVoted !== null && electorsTotal > 0) {
      const t = Math.round((electorsWhoVoted / electorsTotal) * 10000) / 100;
      if (turnoutBasis === "persons" && t > 100) {
        anomalies.push(`turnout withheld: ${t}% of electors is impossible on a persons basis`);
      } else {
        turnoutPercent = t;
      }
    }

    // Party aggregation. NOTA does not exist in this era; the era's
    // independents aggregate exactly as the modern path's (A5).
    const byParty = new Map<string, { label: string; name: string; seats: number; cands: number; cons: Set<string>; votes: number }>();
    for (const r of g) {
      const isInd = r.party === IND_LABEL;
      const label = isInd ? IND_LABEL : r.party;
      const name = isInd ? INDEPENDENTS_PARTY_NAME : r.party;
      if (!label) {
        refused["empty Party label"] = (refused["empty Party label"] ?? 0) + 1;
        continue;
      }
      const p = byParty.get(label) ?? { label, name, seats: 0, cands: 0, cons: new Set<string>(), votes: 0 };
      if (r.winner) p.seats++;
      p.cands++;
      p.cons.add(`${r.stateName}|${r.constituencyNo}`);
      p.votes += r.votes ?? 0;
      byParty.set(label, p);
    }

    const parties: EarlyPartyAggregate[] = [...byParty.values()]
      .map((p) => ({
        recordedLabel: p.label,
        partyName: p.name,
        seatsWon: p.seats,
        seatsContested: p.cands,
        constituenciesContested: p.cons.size,
        votes: p.votes,
        voteSharePercent:
          validVotesTotal && validVotesTotal > 0
            ? Math.round((p.votes / validVotesTotal) * 10000) / 100
            : null,
      }))
      .sort((a, b) => b.seatsWon - a.seatsWon || b.votes - a.votes || a.partyName.localeCompare(b.partyName));

    elections.push({
      scope: isGE ? "lok_sabha" : "state_assembly",
      stateId: isGE ? "in" : first.stateId,
      stateName: isGE ? "India" : first.stateName,
      year,
      month: electionDate !== null ? Number(electionDate.slice(5, 7)) : null,
      datePrecision: electionDate !== null ? "day" : "year",
      electionDate,
      assemblyNo: first.assemblyNo,
      totalSeats,
      constituencies: byConst.size,
      seatsByMagnitude,
      upstreamId: electionUpstreamId(isGE ? "lok_sabha" : "state_assembly", isGE ? "IN" : first.stateName, year, first.assemblyNo),
      parties,
      validVotesTotal,
      electorsTotal,
      electorsWhoVoted,
      turnoutPercent,
      turnoutBasis,
      notaVotes: 0,
      anomalies,
    });
  }

  elections.sort((a, b) => a.year - b.year || a.stateName.localeCompare(b.stateName) || (a.assemblyNo ?? 0) - ((b.assemblyNo ?? 0)));
  return {
    elections,
    refused,
    duplicateRowCount,
    aliasApplications,
    statesWithoutId,
    fileGroups: { elections: fileGroupParties.size, partyRowsWithSeats, partyRowsAll },
    geSlices,
  };
}
