import { describe, expect, it } from "vitest";

import { mergedDays } from "./tenure";

const ASOF = "2026-01-01";

describe("mergedDays", () => {
  it("counts a single closed interval", () => {
    expect(mergedDays([{ start: "2020-01-01", end: "2021-01-01" }], ASOF)).toBe(366); // 2020 is a leap year
  });

  it("runs an open interval to the as-of date", () => {
    expect(mergedDays([{ start: "2025-01-01", end: null }], ASOF)).toBe(365);
  });

  it("never counts a day twice when offices overlap", () => {
    // A party holding a chief ministership and the prime ministership at once.
    const days = mergedDays(
      [
        { start: "2020-01-01", end: "2021-01-01" },
        { start: "2020-06-01", end: "2020-09-01" },
      ],
      ASOF,
    );
    expect(days).toBe(366);
  });

  it("merges terms that touch at a boundary date", () => {
    const split = mergedDays(
      [
        { start: "2020-01-01", end: "2020-07-01" },
        { start: "2020-07-01", end: "2021-01-01" },
      ],
      ASOF,
    );
    expect(split).toBe(366);
  });

  it("keeps genuine gaps out of the total", () => {
    // Two terms with a President's Rule gap between them.
    const days = mergedDays(
      [
        { start: "2020-01-01", end: "2020-03-01" },
        { start: "2020-05-01", end: "2020-07-01" },
      ],
      ASOF,
    );
    expect(days).toBe(60 + 61);
  });

  it("clips to the measuring window", () => {
    const days = mergedDays([{ start: "2010-01-01", end: "2020-01-01" }], ASOF, {
      start: "2014-06-02",
      end: null,
    });
    expect(days).toBe(mergedDays([{ start: "2014-06-02", end: "2020-01-01" }], ASOF));
  });

  it("ignores unparseable and zero-length intervals", () => {
    expect(mergedDays([{ start: "not-a-date", end: "2020-01-01" }], ASOF)).toBe(0);
    expect(mergedDays([{ start: "2020-01-01", end: "2020-01-01" }], ASOF)).toBe(0);
    expect(mergedDays([], ASOF)).toBe(0);
  });
});
