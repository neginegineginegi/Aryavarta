import { describe, expect, it } from "vitest";

import {
  DEFERRED_UNTIL_SERIES_BREAKS,
  SERIES_BREAKS,
} from "@/lib/ingest/provenance";
import { breaksWithin, splitAtBreaks } from "@/lib/series";

const pts = (...years: number[]) => years.map((year) => ({ year }));

describe("splitAtBreaks", () => {
  it("returns one segment when there is no break", () => {
    expect(splitAtBreaks(pts(2000, 2001, 2002), [])).toHaveLength(1);
  });

  it("starts a new segment AT the break year, which is the first year of the new definition", () => {
    const segs = splitAtBreaks(pts(2000, 2001, 2002, 2003), [2002]);
    expect(segs.map((s) => s.map((p) => p.year))).toEqual([
      [2000, 2001],
      [2002, 2003],
    ]);
  });

  it("never joins across the break: no segment spans it", () => {
    // The honesty property itself. If this fails, a chart somewhere can draw
    // a line across a definition change.
    for (const b of [1999, 2001, 2003]) {
      for (const seg of splitAtBreaks(pts(1998, 2000, 2002, 2004), [b])) {
        const crosses = seg.some((p) => p.year < b) && seg.some((p) => p.year >= b);
        expect(crosses).toBe(false);
      }
    }
  });

  it("handles multiple breaks, out of order", () => {
    const segs = splitAtBreaks(pts(2000, 2001, 2002, 2003, 2004), [2004, 2002]);
    expect(segs.map((s) => s.map((p) => p.year))).toEqual([[2000, 2001], [2002, 2003], [2004]]);
  });

  it("drops empty segments rather than drawing ghosts", () => {
    // Breaks in consecutive years, and a break before the data starts.
    expect(splitAtBreaks(pts(2005, 2006), [1990, 2005, 2006])).toEqual([[{ year: 2005 }], [{ year: 2006 }]]);
  });

  it("returns nothing for an empty series", () => {
    expect(splitAtBreaks([], [2000])).toEqual([]);
  });
});

describe("breaksWithin", () => {
  it("keeps only breaks that fall inside the drawn span", () => {
    expect(breaksWithin(pts(2000, 2010), [1995, 2005, 2010, 2015])).toEqual([2005, 2010]);
  });

  it("excludes a break at the very first year, which splits nothing", () => {
    expect(breaksWithin(pts(2000, 2010), [2000])).toEqual([]);
  });
});

describe("the deferral protocol", () => {
  it("an indicator with recorded breaks is no longer deferred", () => {
    // Deferral means "breaks not yet established". Once breaks are recorded
    // the deferral must lift, or the record contradicts itself; and lifting
    // without recording is the failure the gate exists to stop, which this
    // cannot detect but the recorded-side check makes one-directional.
    for (const id of Object.keys(SERIES_BREAKS)) {
      expect(
        DEFERRED_UNTIL_SERIES_BREAKS.has(id),
        `${id} has recorded breaks but is still in DEFERRED_UNTIL_SERIES_BREAKS`,
      ).toBe(false);
    }
  });

  it("recorded break lists are non-empty and are years", () => {
    for (const [id, breaks] of Object.entries(SERIES_BREAKS)) {
      expect(breaks.length, `${id} maps to an empty break list`).toBeGreaterThan(0);
      for (const b of breaks) expect(Number.isInteger(b) && b > 1800 && b < 2200).toBe(true);
    }
  });
});
