import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fetchElections, fetchHeadTerms, resolveState, timeOf } from "./wikidata";

beforeAll(() => {
  process.env.IMPORT_FIXTURES = "1";
});
afterAll(() => {
  delete process.env.IMPORT_FIXTURES;
});

describe("timeOf", () => {
  const snak = (time: string, precision: number) => ({
    datavalue: { value: { time, precision }, type: "time" },
  });

  it("parses day-precision dates", () => {
    expect(timeOf(snak("+2018-12-11T00:00:00Z", 11))).toEqual({
      date: "2018-12-11",
      precision: "day",
    });
  });

  it("degrades month and year precision to the first day", () => {
    expect(timeOf(snak("+2018-12-00T00:00:00Z", 10))).toEqual({
      date: "2018-12-01",
      precision: "month",
    });
    expect(timeOf(snak("+2018-00-00T00:00:00Z", 9))).toEqual({
      date: "2018-01-01",
      precision: "year",
    });
  });

  it("returns null for missing values", () => {
    expect(timeOf(undefined)).toBeNull();
    expect(timeOf({ datavalue: { value: "x", type: "string" } })).toBeNull();
  });
});

describe("resolveState (fixtures)", () => {
  it("ranks Indian-state matches first", async () => {
    const results = await resolveState("Fixture State");
    expect(results[0].qid).toBe("Q900001");
  });
});

describe("fetchHeadTerms (fixtures)", () => {
  it("returns terms with person, party, and dates, sorted chronologically", async () => {
    const terms = await fetchHeadTerms("Q900001", "P6");
    expect(terms).toHaveLength(2);
    expect(terms[0]).toMatchObject({
      personLabel: "Fixture Person Alpha",
      partyLabel: "Fixture National Party",
      startDate: "2018-12-17",
      endDate: "2023-12-03",
    });
    expect(terms[1]).toMatchObject({
      personLabel: "Fixture Person Beta",
      partyLabel: "Fixture Regional Party",
      startDate: "2023-12-15",
      endDate: null,
    });
  });
});

describe("fetchElections (fixtures)", () => {
  it("returns elections with dates, seats, and per-party results", async () => {
    const elections = await fetchElections("Fixture State");
    expect(elections).toHaveLength(2);
    const [e2018, e2023] = elections;
    expect(e2018.electionDate).toBe("2018-12-07");
    expect(e2018.totalSeats).toBe(200);
    expect(e2018.results[0]).toMatchObject({ partyLabel: "Fixture National Party", seatsWon: 108 });
    expect(e2023.results[0]).toMatchObject({ partyLabel: "Fixture Regional Party", seatsWon: 115 });
    expect(e2023.wikipediaUrl).toContain("en.wikipedia.org/wiki/2023_Fixture_State");
  });
});
