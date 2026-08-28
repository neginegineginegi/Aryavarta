import { describe, expect, it } from "vitest";

import {
  aggregate,
  anchoredDate,
  checkHeader,
  electionUpstreamId,
  INDEPENDENTS_PARTY_NAME,
  parseRow,
  REQUIRED_COLUMNS,
  STATE_MAP,
  type ParsedRow,
} from "@/lib/ingest/tcpd";

const row = (over: Partial<Record<string, string>> = {}): Record<string, string> => ({
  State_Name: "Kerala",
  Assembly_No: "15",
  Constituency_No: "42",
  Year: "2021",
  Poll_No: "1",
  Position: "2",
  Candidate: "A Candidate",
  Party: "INC",
  Votes: "40000",
  Valid_Votes: "100000",
  Electors: "150000",
  ...over,
});

const parsed = (over: Partial<Record<string, string>> = {}): ParsedRow => {
  const p = parseRow(row(over));
  if ("refused" in p) throw new Error(`fixture refused: ${p.refused}`);
  return p;
};

describe("checkHeader", () => {
  it("passes the full expected header", () => {
    expect(checkHeader([...REQUIRED_COLUMNS, "month", "Margin"])).toEqual({ ok: true, unknown: [] });
  });

  it("fails on any missing required column, naming it", () => {
    const res = checkHeader(REQUIRED_COLUMNS.filter((c) => c !== "Valid_Votes"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.missing).toEqual(["Valid_Votes"]);
  });

  it("reports columns it has never heard of, so drift stops a person", () => {
    const res = checkHeader([...REQUIRED_COLUMNS, "Completely_New_Field"]);
    expect(res.ok && res.unknown).toEqual(["Completely_New_Field"]);
  });
});

describe("STATE_MAP (A1)", () => {
  it("maps current states and spelling variants to archive ids", () => {
    expect(STATE_MAP.Kerala).toBe("kl");
    expect(STATE_MAP.Orissa).toBe("or");
    expect(STATE_MAP.Odisha).toBe("or");
    expect(STATE_MAP.Uttaranchal).toBe("ut");
    expect(STATE_MAP.Pondicherry).toBe("py");
    expect(STATE_MAP["Jammu_&_Kashmir"]).toBe("jk");
  });

  it("deliberately does not map historical states", () => {
    for (const gone of ["Madras", "Bombay", "Mysore", "Hyderabad", "PEPSU", "Travancore-Cochin"]) {
      expect(STATE_MAP[gone], `${gone} must stay unmapped until the curatorial decision`).toBeUndefined();
    }
  });
});

describe("parseRow", () => {
  it("refuses rows without an identity", () => {
    expect(parseRow(row({ State_Name: "" }))).toHaveProperty("refused");
    expect(parseRow(row({ Year: "abc" }))).toHaveProperty("refused");
    expect(parseRow(row({ Year: "1832" }))).toHaveProperty("refused");
    expect(parseRow(row({ Constituency_No: "" }))).toHaveProperty("refused");
  });

  it("treats month 0 as absent rather than January (A8)", () => {
    expect(parsed({ month: "0" }).month).toBeNull();
    expect(parsed({ month: "13" }).month).toBeNull();
    expect(parsed({ month: "4" }).month).toBe(4);
  });

  it("reads NA and blanks as null, never zero", () => {
    expect(parsed({ Votes: "NA" }).votes).toBeNull();
    expect(parsed({ Electors: "" }).electors).toBeNull();
  });

  it("reads rows keyed the way parseCsv actually keys them (lowercased)", () => {
    // Regression: the shared CSV parser lowercases header keys; parseRow once
    // read only TCPD-case keys and refused every real row as "empty State_Name".
    const p = parseRow({
      state_name: "Kerala", assembly_no: "15", constituency_no: "7",
      year: "2021", month: "4", poll_no: "1", position: "1",
      candidate: "Someone", party: "INC", votes: "60000",
      valid_votes: "100000", electors: "150000",
    });
    expect(p).not.toHaveProperty("refused");
    if (!("refused" in p)) {
      expect(p.stateId).toBe("kl");
      expect(p.validVotes).toBe(100000);
      expect(p.month).toBe(4);
    }
  });
});

describe("aggregate", () => {
  it("computes seats, contested and vote share per party", () => {
    const rows = [
      parsed({ Constituency_No: "1", Party: "INC", Position: "1", Votes: "60000", Valid_Votes: "100000" }),
      parsed({ Constituency_No: "1", Party: "BJP", Position: "2", Votes: "40000", Valid_Votes: "100000" }),
      parsed({ Constituency_No: "2", Party: "INC", Position: "2", Votes: "30000", Valid_Votes: "100000" }),
      parsed({ Constituency_No: "2", Party: "BJP", Position: "1", Votes: "70000", Valid_Votes: "100000" }),
    ];
    const [e] = aggregate(rows, "state_assembly").elections;
    expect(e.totalSeats).toBe(2);
    expect(e.validVotesTotal).toBe(200000);
    const inc = e.parties.find((p) => p.recordedLabel === "INC")!;
    expect(inc).toMatchObject({ seatsWon: 1, seatsContested: 2, voteSharePercent: 45 });
  });

  it("counts the Valid_Votes denominator once per constituency, not per candidate", () => {
    const rows = [
      parsed({ Constituency_No: "1", Party: "A", Position: "1", Votes: "600", Valid_Votes: "1000" }),
      parsed({ Constituency_No: "1", Party: "B", Position: "2", Votes: "400", Valid_Votes: "1000" }),
    ];
    const [e] = aggregate(rows, "state_assembly").elections;
    expect(e.validVotesTotal).toBe(1000);
    expect(e.parties.find((p) => p.recordedLabel === "A")!.voteSharePercent).toBe(60);
  });

  it("withholds every share when any constituency's denominator is missing (A7)", () => {
    const rows = [
      parsed({ Constituency_No: "1", Party: "A", Position: "1", Votes: "600", Valid_Votes: "1000" }),
      parsed({ Constituency_No: "2", Party: "A", Position: "1", Votes: "999", Valid_Votes: "NA" }),
    ];
    const [e] = aggregate(rows, "state_assembly").elections;
    expect(e.validVotesTotal).toBeNull();
    expect(e.parties[0].voteSharePercent).toBeNull();
    expect(e.anomalies.join(" ")).toMatch(/withheld/);
  });

  it("excludes NOTA from parties but keeps its votes out of nothing — the denominator is Valid_Votes", () => {
    const rows = [
      parsed({ Constituency_No: "1", Party: "A", Position: "1", Votes: "600", Valid_Votes: "1000" }),
      parsed({ Constituency_No: "1", Party: "NOTA", Position: "3", Votes: "50", Valid_Votes: "1000" }),
    ];
    const [e] = aggregate(rows, "state_assembly").elections;
    expect(e.parties.map((p) => p.recordedLabel)).toEqual(["A"]);
    expect(e.notaVotes).toBe(50);
    // A's share is 60% of valid votes, NOT 600/(1000-50).
    expect(e.parties[0].voteSharePercent).toBe(60);
  });

  it("aggregates independents under one named group (A5), verbatim label kept", () => {
    const rows = [
      parsed({ Constituency_No: "1", Party: "IND", Candidate: "X", Position: "1", Votes: "500" }),
      parsed({ Constituency_No: "2", Party: "IND", Candidate: "Y", Position: "1", Votes: "500" }),
    ];
    const [e] = aggregate(rows, "state_assembly").elections;
    const ind = e.parties[0];
    expect(ind.recordedLabel).toBe("IND");
    expect(ind.partyName).toBe(INDEPENDENTS_PARTY_NAME);
    expect(ind.seatsWon).toBe(2);
  });

  it("never unifies party label variants (A4)", () => {
    const rows = [
      parsed({ Constituency_No: "1", Party: "INC", Position: "1" }),
      parsed({ Constituency_No: "2", Party: "INC(I)", Position: "1" }),
    ];
    const [e] = aggregate(rows, "state_assembly").elections;
    expect(e.parties.map((p) => p.recordedLabel).sort()).toEqual(["INC", "INC(I)"]);
  });

  it("drops bye-election rows and counts them (A6)", () => {
    const out = aggregate([parsed(), parsed({ Poll_No: "2", Constituency_No: "9" })], "state_assembly");
    expect(out.byeRowCount).toBe(1);
    expect(out.elections[0].totalSeats).toBe(1);
  });

  it("refuses unmapped states and counts rows per name (A1)", () => {
    const out = aggregate([parsed({ State_Name: "Madras" })], "state_assembly");
    expect(out.elections).toHaveLength(0);
    expect(out.unmappedStates).toEqual({ Madras: 1 });
  });

  it("refuses exact duplicate candidate rows and counts them", () => {
    const out = aggregate([parsed(), parsed()], "state_assembly");
    expect(out.duplicateRowCount).toBe(1);
  });

  it("aggregates Lok Sabha rows nationally (A9)", () => {
    const rows = [
      parsed({ State_Name: "Kerala", Constituency_No: "1", Party: "A", Position: "1" }),
      parsed({ State_Name: "Bihar", Constituency_No: "2", Party: "A", Position: "1" }),
    ];
    const out = aggregate(rows, "lok_sabha");
    expect(out.elections).toHaveLength(1);
    expect(out.elections[0].stateId).toBe("in");
    expect(out.elections[0].totalSeats).toBe(2);
    expect(out.elections[0].parties[0].seatsWon).toBe(2);
  });

  it("states a month spread instead of narrowing it, and anchors to the earliest", () => {
    const rows = [
      parsed({ Constituency_No: "1", month: "4", Position: "1" }),
      parsed({ Constituency_No: "2", month: "5", Position: "1" }),
    ];
    const [e] = aggregate(rows, "state_assembly").elections;
    expect(e.month).toBe(4);
    expect(e.anomalies.join(" ")).toMatch(/spans months 4, 5/);
  });
});

describe("anchoredDate (A2)", () => {
  it("anchors year-precision to 01-01 and month-precision to the month", () => {
    expect(anchoredDate({ year: 1962, month: null })).toBe("1962-01-01");
    expect(anchoredDate({ year: 2021, month: 4 })).toBe("2021-04-01");
  });
});

describe("upstream ids (§2.6)", () => {
  it("builds natural keys the publisher's own fields determine", () => {
    expect(electionUpstreamId("state_assembly", "Kerala", 2021, 15)).toBe("AE-Kerala-2021-A15");
    expect(electionUpstreamId("lok_sabha", "IN", 2019, 17)).toBe("GE-2019-L17");
    expect(electionUpstreamId("state_assembly", "Kerala", 1957, null)).toBe("AE-Kerala-1957");
  });
});

// ---------------------------------------------------------------------------
// Reconciliation (§4)
// ---------------------------------------------------------------------------

import { reconcileAll, reconcileElection, type HandElection } from "@/lib/ingest/tcpd";
import { aggregate as agg } from "@/lib/ingest/tcpd";

const handKerala2021 = (over: Partial<HandElection> = {}): HandElection => ({
  id: "h1",
  stateId: "kl",
  scope: "state_assembly",
  electionDate: "2021-04-06",
  assemblyNumber: 15,
  totalSeats: 2,
  turnoutPercent: 74.06,
  citationCount: 2,
  parties: [
    { partyId: "p-inc", name: "Indian National Congress", abbreviation: "INC", seatsWon: 1, seatsContested: 2, voteSharePercent: 45 },
  ],
  ...over,
});

const tcpdKerala2021 = () =>
  agg(
    [
      parsed({ Constituency_No: "1", Party: "INC", Position: "1", Votes: "60000", Valid_Votes: "100000" }),
      parsed({ Constituency_No: "1", Party: "BJP", Position: "2", Votes: "40000", Valid_Votes: "100000" }),
      parsed({ Constituency_No: "2", Party: "INC", Position: "2", Votes: "30000", Valid_Votes: "100000" }),
      parsed({ Constituency_No: "2", Party: "BJP", Position: "1", Votes: "70000", Valid_Votes: "100000" }),
    ],
    "state_assembly",
  ).elections[0];

describe("reconcileElection (§4.2)", () => {
  it("agrees when values match, within ±0.1pp for percents", () => {
    const r = reconcileElection(handKerala2021(), tcpdKerala2021());
    const bad = r.fields.filter((f) => !f.agree);
    expect(bad).toEqual([]);
    expect(r.unmatchedTcpdParties).toEqual(["BJP"]); // hand row simply has no BJP line
  });

  it("reports a seat disagreement without resolving it", () => {
    const hand = handKerala2021({
      parties: [{ partyId: "p-inc", name: "Indian National Congress", abbreviation: "INC", seatsWon: 2, seatsContested: 2, voteSharePercent: 45 }],
    });
    const r = reconcileElection(hand, tcpdKerala2021());
    const seat = r.fields.find((f) => f.field === "INC seats_won")!;
    expect(seat.agree).toBe(false);
    expect(seat.hand).toBe("2");
    expect(seat.tcpd).toBe("1");
  });

  it("never scores a null side as a disagreement: absence is not a value", () => {
    const hand = handKerala2021({ totalSeats: null, turnoutPercent: null });
    const r = reconcileElection(hand, tcpdKerala2021());
    expect(r.fields.find((f) => f.field === "total_seats")!.agree).toBe(true);
    expect(r.fields.find((f) => f.field === "total_seats")!.hand).toBe("—");
  });
});

describe("reconcileAll (§4.1)", () => {
  it("classifies hand-only and tcpd-only elections", () => {
    const out = reconcileAll([handKerala2021({ electionDate: "2026-04-01", assemblyNumber: 16 })], [tcpdKerala2021()]);
    expect(out.map((o) => o.outcome).sort()).toEqual(["hand_only", "tcpd_only"]);
  });

  it("pairs on state+scope+year and compares", () => {
    const out = reconcileAll([handKerala2021()], [tcpdKerala2021()]);
    expect(out).toHaveLength(1);
    expect(out[0].outcome).toBe("match");
  });

  it("reports cardinality problems as ambiguous rather than picking", () => {
    const h1 = handKerala2021();
    const h2 = handKerala2021({ id: "h2", assemblyNumber: null });
    const out = reconcileAll([h1, h2], [tcpdKerala2021()]);
    // h1 pairs via assembly tiebreak (15 vs aggregate's 15); h2 is left over.
    const kinds = out.map((o) => o.outcome).sort();
    expect(kinds).toEqual(["ambiguous", "match"]);
  });
});

// ---------------------------------------------------------------------------
// Party identity against the existing parties table (A4, §3)
// ---------------------------------------------------------------------------

import { matchKnownParty, IND_LABEL, type KnownParty } from "@/lib/ingest/tcpd";

describe("matchKnownParty", () => {
  const known: KnownParty[] = [
    { id: "inc", name: "Indian National Congress", abbreviation: "INC", isPseudo: false },
    { id: "inc-i", name: "Indian National Congress (Indira)", abbreviation: "INC(I)", isPseudo: false },
    { id: "ind", name: "Independent", abbreviation: "IND", isPseudo: true },
    { id: "jd-a", name: "Janata Dal (A)", abbreviation: "JD", isPseudo: false },
    { id: "jd-b", name: "Janata Dal (B)", abbreviation: "JD", isPseudo: false },
  ];

  it("matches by exact normalized abbreviation, case-insensitively", () => {
    expect(matchKnownParty(known, "inc", "whatever")).toEqual({ kind: "one", party: known[0] });
  });

  it("never fuzzes: INC(I) stays distinct from INC", () => {
    expect(matchKnownParty(known, "INC(I)", "x")).toEqual({ kind: "one", party: known[1] });
    expect(matchKnownParty(known, "INC (I)", "x").kind).toBe("none");
  });

  it("falls back to exact name when no abbreviation matches", () => {
    expect(matchKnownParty(known, "Indian National Congress", "x")).toEqual({ kind: "one", party: known[0] });
  });

  it("routes the IND aggregate to the existing pseudo party, creating nothing", () => {
    const m = matchKnownParty(known, IND_LABEL, INDEPENDENTS_PARTY_NAME);
    expect(m).toEqual({ kind: "one", party: known[2] });
  });

  it("returns multiple hits whole rather than picking one", () => {
    const m = matchKnownParty(known, "JD", "x");
    expect(m.kind).toBe("many");
    if (m.kind === "many") expect(m.parties.map((p) => p.id).sort()).toEqual(["jd-a", "jd-b"]);
  });

  it("returns none for a label the archive has never seen", () => {
    expect(matchKnownParty(known, "XYZ", "Party Of Xyz").kind).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// Early schema: TCPD-IED 1951–62 (§2.8, the D3 drop)
// ---------------------------------------------------------------------------

import {
  aggregateEarly,
  checkEarlyHeader,
  EARLY_REQUIRED_COLUMNS,
  parseEarlyDate,
  parseEarlyRow,
  type ParsedEarlyRow,
} from "@/lib/ingest/tcpd";

const ALIASES = {
  Orissa: "Odisha",
  Orrisa: "Odisha",
  Sourastra: "Saurashtra",
  Patiala_And_East_Punjab_States_Union: "Patiala_&_East_Punjab_States_Union_(PEPSU)",
} as const;

const earlyRaw = (over: Partial<Record<string, string>> = {}): Record<string, string> => ({
  Election_Type: "AE",
  State_Name: "Assam",
  Assembly_No: "1",
  Constituency_No: "1",
  Candidate: "A CANDIDATE",
  Party: "INC",
  Votes: "600.0",
  Winner: "True",
  NumberOfSeats: "1",
  ElectorsTotal: "1500",
  ElectorsWhoVoted: "1000",
  VotesValid: "1000",
  PollingDate: "27/03/52",
  Year: "1952",
  ...over,
});

const earlyParsed = (over: Partial<Record<string, string>> = {}): ParsedEarlyRow => {
  const p = parseEarlyRow(earlyRaw(over), ALIASES);
  if ("refused" in p) throw new Error(`fixture refused: ${p.refused}`);
  return p;
};

describe("checkEarlyHeader (§2.8)", () => {
  const realHeader = [
    ...EARLY_REQUIRED_COLUMNS,
    "Gender", "Constituency_Name", "Idx", "Party_Type", "Party_Expanded",
    "Runner up.PARTY", "Runner up.CANDIDATE", "Runner up.VOTES",
    "Winner 1.PARTY", "Winner 1.CANDIDATE", "Winner 1.VOTES",
    "Winner 2.PARTY", "Winner 2.CANDIDATE", "Winner 2.VOTES",
    "Winner 3.PARTY", "Winner 3.CANDIDATE", "Winner 3.VOTES",
  ];

  it("passes the delivered file's full header", () => {
    expect(checkEarlyHeader(realHeader)).toEqual({ ok: true, unknown: [] });
  });

  it("fails on a missing required column, naming it", () => {
    const res = checkEarlyHeader(realHeader.filter((c) => c !== "NumberOfSeats"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.missing).toEqual(["NumberOfSeats"]);
  });

  it("reports drift columns for a person to look at", () => {
    const res = checkEarlyHeader([...realHeader, "Brand_New"]);
    expect(res.ok && res.unknown).toEqual(["Brand_New"]);
  });
});

describe("parseEarlyDate (§2.8: two formats, explicit century rule)", () => {
  it("reads DD/MM/YY with the 19YY century rule", () => {
    expect(parseEarlyDate("27/03/52")).toEqual({ iso: "1952-03-27", year: 1952 });
  });

  it("reads DD-MM-YYYY verbatim", () => {
    expect(parseEarlyDate("01-03-1960")).toEqual({ iso: "1960-03-01", year: 1960 });
  });

  it("treats empty as absent, not as an error", () => {
    expect(parseEarlyDate("")).toBeNull();
    expect(parseEarlyDate("  ")).toBeNull();
  });

  it("refuses a two-digit year the century rule cannot honestly cover", () => {
    // 19YY would put "85" at 1985, outside the file's 1950–1970 band: the
    // rule no longer applies, so the row is refused, never guessed at.
    expect(parseEarlyDate("01/01/85")).toHaveProperty("refused");
    expect(parseEarlyDate("01-01-1949")).toHaveProperty("refused");
  });

  it("refuses impossible calendar dates and unknown formats", () => {
    expect(parseEarlyDate("31/02/57")).toHaveProperty("refused");
    expect(parseEarlyDate("1952-03-27")).toHaveProperty("refused");
    expect(parseEarlyDate("27/3/52")).toHaveProperty("refused");
  });
});

describe("parseEarlyRow (§2.8)", () => {
  it("reads Winner as the strings True/False and refuses anything else", () => {
    expect(earlyParsed({ Winner: "True" }).winner).toBe(true);
    expect(earlyParsed({ Winner: "False" }).winner).toBe(false);
    expect(parseEarlyRow(earlyRaw({ Winner: "1" }), ALIASES)).toHaveProperty("refused");
    expect(parseEarlyRow(earlyRaw({ Winner: "TRUE" }), ALIASES)).toHaveProperty("refused");
  });

  it("reads the file's float-formatted vote counts as integers", () => {
    expect(earlyParsed({ Votes: "5549.0" }).votes).toBe(5549);
  });

  it("applies the committed alias map visibly, keeping the raw spelling", () => {
    const p = earlyParsed({ State_Name: "Orrisa" });
    expect(p.stateNameRaw).toBe("Orrisa");
    expect(p.stateName).toBe("Odisha");
    expect(p.stateId).toBe("or");
  });

  it("leaves historical states unmapped but parseable (the gate decides)", () => {
    const p = earlyParsed({ State_Name: "Madras" });
    expect(p.stateId).toBeNull();
    expect(p.stateName).toBe("Madras");
  });

  it("refuses rows outside the contract", () => {
    expect(parseEarlyRow(earlyRaw({ Election_Type: "BE" }), ALIASES)).toHaveProperty("refused");
    expect(parseEarlyRow(earlyRaw({ Year: "1972" }), ALIASES)).toHaveProperty("refused");
    expect(parseEarlyRow(earlyRaw({ NumberOfSeats: "0" }), ALIASES)).toHaveProperty("refused");
    // Year is documented as derived from PollingDate; a clash is drift.
    expect(parseEarlyRow(earlyRaw({ Year: "1953" }), ALIASES)).toHaveProperty("refused");
  });
});

describe("aggregateEarly (§2.8)", () => {
  it("sums NumberOfSeats per constituency, never counts constituencies (correction 3)", () => {
    const rows = [
      earlyParsed({ Constituency_No: "1", NumberOfSeats: "2", Candidate: "A", Party: "INC", Winner: "True" }),
      earlyParsed({ Constituency_No: "1", NumberOfSeats: "2", Candidate: "B", Party: "SCF", Winner: "True" }),
      earlyParsed({ Constituency_No: "1", NumberOfSeats: "2", Candidate: "C", Party: "IND", Winner: "False" }),
      earlyParsed({ Constituency_No: "2", NumberOfSeats: "1", Candidate: "D", Party: "INC", Winner: "True" }),
    ];
    const [e] = aggregateEarly(rows).elections;
    expect(e.totalSeats).toBe(3); // 2 constituencies would say 2 and be wrong
    expect(e.constituencies).toBe(2);
    expect(e.seatsByMagnitude).toEqual({ 1: 1, 2: 1 });
    expect(e.anomalies.filter((a) => a.includes("seat arithmetic"))).toEqual([]);
  });

  it("computes turnout from raw counts once per constituency, and labels its basis", () => {
    const rows = [
      earlyParsed({ Constituency_No: "1", Candidate: "A", Party: "X", ElectorsTotal: "1000", ElectorsWhoVoted: "600", VotesValid: "600" }),
      earlyParsed({ Constituency_No: "1", Candidate: "B", Party: "Y", Winner: "False", ElectorsTotal: "1000", ElectorsWhoVoted: "600", VotesValid: "600" }),
      earlyParsed({ Constituency_No: "2", Candidate: "C", Party: "X", ElectorsTotal: "1000", ElectorsWhoVoted: "800", VotesValid: "800" }),
    ];
    const [e] = aggregateEarly(rows).elections;
    expect(e.electorsTotal).toBe(2000);
    expect(e.electorsWhoVoted).toBe(1400);
    expect(e.turnoutPercent).toBe(70);
    expect(e.turnoutBasis).toBe("persons");
  });

  it("marks the basis 'ballots' when any constituency is multi-member (§2.8 finding)", () => {
    const rows = [
      earlyParsed({ Constituency_No: "1", NumberOfSeats: "2", Candidate: "A", Party: "X", ElectorsTotal: "1000", ElectorsWhoVoted: "1400", VotesValid: "1400" }),
      earlyParsed({ Constituency_No: "1", NumberOfSeats: "2", Candidate: "B", Party: "Y", Winner: "True", ElectorsTotal: "1000", ElectorsWhoVoted: "1400", VotesValid: "1400" }),
    ];
    const [e] = aggregateEarly(rows).elections;
    expect(e.turnoutBasis).toBe("ballots");
    expect(e.turnoutPercent).toBe(140); // stated with its basis, never passed off as person-turnout
  });

  it("withholds impossible persons-basis turnout as a data error", () => {
    const rows = [
      earlyParsed({ Constituency_No: "1", NumberOfSeats: "1", Candidate: "A", Party: "X", ElectorsTotal: "1000", ElectorsWhoVoted: "1100", VotesValid: "1100" }),
    ];
    const [e] = aggregateEarly(rows).elections;
    expect(e.turnoutPercent).toBeNull();
    expect(e.anomalies.join(" ")).toMatch(/single-member/);
  });

  it("keeps zero-seat contesting parties, with their recorded vote share", () => {
    const rows = [
      earlyParsed({ Constituency_No: "1", Candidate: "A", Party: "INC", Winner: "True", Votes: "600.0", VotesValid: "1000", ElectorsWhoVoted: "1000" }),
      earlyParsed({ Constituency_No: "1", Candidate: "B", Party: "KMPP", Winner: "False", Votes: "400.0", VotesValid: "1000", ElectorsWhoVoted: "1000" }),
    ];
    const [e] = aggregateEarly(rows).elections;
    const kmpp = e.parties.find((p) => p.recordedLabel === "KMPP")!;
    expect(kmpp.seatsWon).toBe(0);
    expect(kmpp.voteSharePercent).toBe(40);
  });

  it("counts a party's seatsContested as candidacies, not constituencies, in this era", () => {
    const rows = [
      earlyParsed({ Constituency_No: "1", NumberOfSeats: "2", Candidate: "A", Party: "INC", Winner: "True" }),
      earlyParsed({ Constituency_No: "1", NumberOfSeats: "2", Candidate: "B", Party: "INC", Winner: "True" }),
    ];
    const [e] = aggregateEarly(rows).elections;
    const inc = e.parties[0];
    expect(inc.seatsContested).toBe(2);
    expect(inc.constituenciesContested).toBe(1);
    expect(inc.seatsWon).toBe(2);
  });

  it("rolls GE rows up nationally on Assembly_No alone (A9, codebook rule)", () => {
    const rows = [
      earlyParsed({ Election_Type: "GE", State_Name: "Assam", Constituency_No: "1", Candidate: "A", Party: "INC" }),
      earlyParsed({ Election_Type: "GE", State_Name: "Bihar", Constituency_No: "1", Candidate: "B", Party: "INC" }),
    ];
    const out = aggregateEarly(rows);
    expect(out.elections).toHaveLength(1);
    const [e] = out.elections;
    expect(e.stateId).toBe("in");
    // Constituency_No repeats across states: identity must include the state.
    expect(e.constituencies).toBe(2);
    expect(e.totalSeats).toBe(2);
    expect(e.upstreamId).toBe("GE-1952-L1");
    // The file-level view still counts the two state slices separately,
    // which is what the 82/371/669 expectation is measured against.
    expect(out.fileGroups).toEqual({ elections: 2, partyRowsWithSeats: 2, partyRowsAll: 2 });
  });

  it("uses the recorded PollingDate as a day-precision fact, year precision only when undated", () => {
    const dated = aggregateEarly([earlyParsed()]).elections[0];
    expect(dated.electionDate).toBe("1952-03-27");
    expect(dated.datePrecision).toBe("day");

    const undated = aggregateEarly([earlyParsed({ PollingDate: "" })]).elections[0];
    expect(undated.electionDate).toBeNull();
    expect(undated.datePrecision).toBe("year");
  });

  it("anchors a polling-date spread to the earliest and states it (mirrors the month rule)", () => {
    const rows = [
      earlyParsed({ Constituency_No: "1", Candidate: "A", PollingDate: "27/03/52" }),
      earlyParsed({ Constituency_No: "2", Candidate: "B", PollingDate: "29/03/52" }),
    ];
    const [e] = aggregateEarly(rows).elections;
    expect(e.electionDate).toBe("1952-03-27");
    expect(e.datePrecision).toBe("day");
    expect(e.anomalies.join(" ")).toMatch(/polling spans 2 recorded dates/);
  });

  it("tallies alias applications and aggregates historical states instead of dropping them", () => {
    const rows = [
      earlyParsed({ State_Name: "Orrisa", Candidate: "A" }),
      earlyParsed({ State_Name: "Orrisa", Candidate: "B", Constituency_No: "2" }),
      earlyParsed({ State_Name: "Madras", Candidate: "C" }),
    ];
    const out = aggregateEarly(rows);
    expect(out.aliasApplications).toEqual({ Orrisa: { canonical: "Odisha", rows: 2 } });
    expect(out.statesWithoutId).toEqual({ Madras: 1 });
    // Madras aggregates (the gate needs it in front of it), with no state id.
    const madras = out.elections.find((e) => e.stateName === "Madras")!;
    expect(madras.stateId).toBeNull();
    expect(madras.totalSeats).toBe(1);
  });

  it("aggregates the era's independents under the pseudo-party (A5)", () => {
    const rows = [
      earlyParsed({ Party: "IND", Candidate: "X" }),
      earlyParsed({ Party: "IND", Candidate: "Y", Constituency_No: "2" }),
    ];
    const [e] = aggregateEarly(rows).elections;
    expect(e.parties[0].recordedLabel).toBe("IND");
    expect(e.parties[0].partyName).toBe(INDEPENDENTS_PARTY_NAME);
    expect(e.parties[0].seatsWon).toBe(2);
  });

  it("refuses exact duplicate rows and counts them", () => {
    const out = aggregateEarly([earlyParsed(), earlyParsed()]);
    expect(out.duplicateRowCount).toBe(1);
    expect(out.elections[0].parties[0].seatsWon).toBe(1);
  });

  it("flags the ElectorsWhoVoted≠VotesValid exception without repairing either", () => {
    const rows = [
      earlyParsed({ ElectorsWhoVoted: "900", VotesValid: "1000" }),
    ];
    const [e] = aggregateEarly(rows).elections;
    expect(e.anomalies.join(" ")).toMatch(/ElectorsWhoVoted differs from VotesValid/);
    expect(e.electorsWhoVoted).toBe(900);
    expect(e.validVotesTotal).toBe(1000);
  });
});
