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
  datePrecision: "month" | "year";
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
