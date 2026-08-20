import { describe, expect, it } from "vitest";

import { runsOfSameDate, sequence, whenLabel, type Occurrence } from "@/lib/funding/sequence";

type Row = { id: string; on: string | null; year: number | null };

const occ = (r: Row): Occurrence => ({ on: r.on, year: r.year });
const key = (r: Row) => r.id;
const seq = (rows: Row[]) => sequence(rows, occ, key);
const row = (id: string, on: string | null = null, year: number | null = null): Row => ({ id, on, year });

describe("sequence", () => {
  it("orders dated entries oldest first", () => {
    const s = seq([row("c", "2011-06-01"), row("a", "1998-01-04"), row("b", "2003-12-31")]);
    expect(s.years.map((y) => y.year)).toEqual([1998, 2003, 2011]);
    expect(s.years.flatMap((y) => y.entries.map((e) => e.item.id))).toEqual(["a", "b", "c"]);
  });

  it("keeps undated entries out of the timeline entirely", () => {
    // Not at the end, not at the start, not given a date from a neighbour.
    const s = seq([row("dated", "2010-02-02"), row("nothing")]);
    expect(s.years).toHaveLength(1);
    expect(s.years[0].entries.map((e) => e.item.id)).toEqual(["dated"]);
    expect(s.undated.map((r) => r.id)).toEqual(["nothing"]);
    expect(s.datedCount).toBe(1);
    expect(s.undatedCount).toBe(1);
  });

  it("does not treat a year-only entry as 1 January", () => {
    // If "1998" were read as 1998-01-01 it would sort before the March entry,
    // which would be the interface inventing a month.
    const s = seq([row("march", "1998-03-15"), row("someyear", null, 1998)]);
    expect(s.years[0].entries.map((e) => e.item.id)).toEqual(["march", "someyear"]);
    expect(s.years[0].entries[1].precision).toBe("year");
    expect(s.years[0].entries[1].on).toBeNull();
  });

  it("reads a bare four-digit string in the date column as a year", () => {
    const s = seq([row("y", "1998")]);
    expect(s.years[0]).toMatchObject({ year: 1998 });
    expect(s.years[0].entries[0]).toMatchObject({ precision: "year", on: null });
  });

  it("keeps month precision as a month", () => {
    const s = seq([row("m", "2004-07")]);
    expect(s.years[0].entries[0]).toMatchObject({ precision: "month", on: "2004-07" });
  });

  it("orders a month against a day inside the same year", () => {
    const s = seq([row("day", "2004-09-02"), row("month", "2004-07")]);
    expect(s.years[0].entries.map((e) => e.item.id)).toEqual(["month", "day"]);
  });

  it("sends an unparseable date to the undated group rather than guessing", () => {
    for (const bad of ["not a date", "12/03/1998", "1998-13-01x", " ", "0000000"]) {
      const s = seq([row("x", bad)]);
      expect(s.undated.map((r) => r.id)).toEqual(["x"]);
      expect(s.years).toEqual([]);
    }
  });

  it("prefers an explicit date over a year when both are present", () => {
    const s = seq([row("both", "2001-05-09", 1975)]);
    expect(s.years[0].year).toBe(2001);
  });

  it("is stable: equal dates always come out in the same order", () => {
    const rows = [row("b", "2000-01-01"), row("a", "2000-01-01"), row("c", "2000-01-01")];
    const once = seq(rows).years[0].entries.map((e) => e.item.id);
    const again = seq([...rows].reverse()).years[0].entries.map((e) => e.item.id);
    expect(once).toEqual(["a", "b", "c"]);
    expect(again).toEqual(once);
  });

  it("handles an entity with nothing recorded at all", () => {
    expect(seq([])).toEqual({ years: [], undated: [], datedCount: 0, undatedCount: 0 });
  });
});

describe("runsOfSameDate", () => {
  it("groups entries recorded on the same exact date", () => {
    const s = seq([row("a", "2005-04-01"), row("b", "2005-04-01"), row("c", "2005-09-09")]);
    const runs = runsOfSameDate(s.years[0].entries);
    expect(runs.map((r) => r.map((e) => e.item.id))).toEqual([["a", "b"], ["c"]]);
  });

  it("never merges year-precision entries, even with each other", () => {
    // "Sometime in 1998" twice is not two things on one date.
    const s = seq([row("a", null, 1998), row("b", null, 1998)]);
    const runs = runsOfSameDate(s.years[0].entries);
    expect(runs).toHaveLength(2);
  });

  it("does not merge a month with a day inside it", () => {
    const s = seq([row("m", "2004-07"), row("d", "2004-07-15")]);
    expect(runsOfSameDate(s.years[0].entries)).toHaveLength(2);
  });
});

describe("whenLabel", () => {
  const label = (on: string | null, year: number | null = null) =>
    whenLabel(seq([row("x", on, year)]).years[0].entries[0]);

  it("says only as much as was recorded", () => {
    expect(label("1998-03-12")).toBe("12 March 1998");
    expect(label("1998-03")).toBe("March 1998");
    expect(label(null, 1998)).toBe("sometime in 1998");
    expect(label("1998")).toBe("sometime in 1998");
  });

  it("does not zero-pad a day into something that looks like a code", () => {
    expect(label("2001-01-05")).toBe("5 January 2001");
  });
});
