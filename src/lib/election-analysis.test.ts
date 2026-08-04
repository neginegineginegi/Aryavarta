import { describe, expect, it } from "vitest";

import {
  allianceGroups,
  buildOverview,
  majorityMark,
  seatDeltas,
  type AnalysisElection,
  type AnalysisResult,
} from "./election-analysis";

const r = (
  partyId: string,
  seatsWon: number,
  over: Partial<AnalysisResult> = {},
): AnalysisResult => ({
  partyId,
  partyName: partyId.toUpperCase(),
  partyAbbreviation: null,
  partyColor: "#123456",
  seatsWon,
  voteSharePercent: null,
  allianceName: null,
  ...over,
});

const election = (over: Partial<AnalysisElection> = {}): AnalysisElection => ({
  id: "e1",
  stateName: "Fixture State",
  stateKind: "state",
  scope: "state_assembly",
  electionDate: "2018-12-07",
  assemblyNumber: 15,
  totalSeats: 200,
  turnoutPercent: "74.06",
  results: [r("alpha", 108), r("beta", 73)],
  ...over,
});

describe("majorityMark", () => {
  it("is floor(n/2)+1", () => {
    expect(majorityMark(200)).toBe(101);
    expect(majorityMark(199)).toBe(100);
    expect(majorityMark(1)).toBe(1);
  });
  it("is null without a total", () => {
    expect(majorityMark(null)).toBeNull();
    expect(majorityMark(0)).toBeNull();
  });
});

describe("seatDeltas", () => {
  it("computes gains, losses, new entries and dropouts", () => {
    const deltas = seatDeltas(
      [r("alpha", 108), r("gamma", 12)],
      [r("alpha", 60), r("beta", 90)],
    );
    const by = Object.fromEntries(deltas.map((d) => [d.partyId, d]));
    expect(by.alpha).toMatchObject({ before: 60, after: 108, delta: 48 });
    expect(by.beta).toMatchObject({ before: 90, after: null, delta: null });
    expect(by.gamma).toMatchObject({ before: null, after: 12, delta: null });
  });

  it("is empty with no previous election", () => {
    expect(seatDeltas([r("alpha", 10)], null)).toEqual([]);
  });
});

describe("allianceGroups", () => {
  it("groups labelled parties and sums seats", () => {
    const groups = allianceGroups([
      r("a", 50, { allianceName: "Front X" }),
      r("b", 30, { allianceName: "Front X" }),
      r("c", 60, { allianceName: "Front Y" }),
      r("d", 5),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ name: "Front X", seats: 80 });
    expect(groups[1]).toMatchObject({ name: "Front Y", seats: 60 });
  });
});

describe("buildOverview", () => {
  it("describes winner, majority margin, CM, runner-up and turnout", () => {
    const text = buildOverview(election(), {
      cmName: "Fixture Person Alpha",
      partyId: "alpha",
      partyName: "ALPHA",
      startDate: "2018-12-17",
      endDate: null,
    }).join(" ");
    expect(text).toContain("ALPHA winning 108 of 200 seats");
    expect(text).toContain("7 above the majority mark of 101");
    expect(text).toContain("Fixture Person Alpha of ALPHA became Chief Minister");
    expect(text).toContain("BETA finished second with 73 seats");
    expect(text).toContain("74.06%");
  });

  it("says 'short of the majority mark' for hung results", () => {
    const text = buildOverview(
      election({ results: [r("alpha", 95), r("beta", 90)] }),
      null,
    ).join(" ");
    expect(text).toContain("6 short of the majority mark of 101");
  });

  it("omits sentences whose inputs are missing", () => {
    const text = buildOverview(
      election({ results: [], turnoutPercent: null }),
      null,
    );
    expect(text).toEqual([]);
  });
});
