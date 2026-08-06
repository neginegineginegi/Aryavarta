import { describe, expect, it } from "vitest";

import type { PartyProfile } from "@/lib/db/queries/party";
import { buildPartyStateRows, type StateWindow } from "./party-compare";

const ASOF = "2026-01-01";

const WINDOWS: StateWindow[] = [
  { id: "wb", name: "West Bengal", formedOn: "1950-01-26", dissolvedOn: null },
  { id: "tg", name: "Telangana", formedOn: "2014-06-02", dissolvedOn: null },
  { id: "gj", name: "Gujarat", formedOn: "1960-05-01", dissolvedOn: null },
];

function profile(id: string, over: Partial<PartyProfile> = {}): PartyProfile {
  return {
    party: { id, name: id, abbreviation: null, color: "#000000", isPseudo: false },
    governments: [],
    electionHistory: [],
    ...over,
  };
}

const gov = (stateId: string, stateName: string, startDate: string, endDate: string | null) => ({
  termId: `${stateId}-${startDate}`,
  stateId,
  stateName,
  kind: "cm" as const,
  cmName: "A Leader",
  startDate,
  endDate,
});

describe("buildPartyStateRows", () => {
  it("puts states both parties governed first, then the rest alphabetically", () => {
    const a = profile("a", {
      governments: [gov("wb", "West Bengal", "2011-05-20", null), gov("gj", "Gujarat", "1990-01-01", "1995-01-01")],
    });
    const b = profile("b", {
      governments: [gov("tg", "Telangana", "2014-06-02", "2023-12-07"), gov("gj", "Gujarat", "2001-10-07", "2014-05-22")],
    });

    const rows = buildPartyStateRows(a, b, WINDOWS, ASOF);
    expect(rows.map((r) => r.stateId)).toEqual(["gj", "tg", "wb"]);
    expect(rows[0].shared).toBe(true);
    expect(rows[1].shared).toBe(false);
  });

  it("reports a share of the state's own existence, not of raw calendar time", () => {
    // Telangana only exists from 2014, so ~9 years is a large share of it;
    // the same 9 years in West Bengal is a small share. Raw years would lie.
    const tg = profile("brs", {
      governments: [gov("tg", "Telangana", "2014-06-02", "2023-12-07")],
    });
    const wb = profile("tmc", {
      governments: [gov("wb", "West Bengal", "2011-05-20", "2020-05-20")],
    });

    const rows = buildPartyStateRows(tg, wb, WINDOWS, ASOF);
    const tgRow = rows.find((r) => r.stateId === "tg")!;
    const wbRow = rows.find((r) => r.stateId === "wb")!;
    expect(tgRow.left!.sharePercent).toBeGreaterThan(70);
    expect(wbRow.right!.sharePercent).toBeLessThan(15);
  });

  it("never lets a term predating the state inflate the share past 100%", () => {
    const early = profile("x", {
      governments: [gov("tg", "Telangana", "1990-01-01", null)],
    });
    const rows = buildPartyStateRows(early, profile("y"), WINDOWS, ASOF);
    expect(rows[0].left!.sharePercent).toBe(100);
  });

  it("leaves the other party's cell null rather than implying a zero", () => {
    const a = profile("a", { governments: [gov("wb", "West Bengal", "2011-05-20", null)] });
    const rows = buildPartyStateRows(a, profile("b"), WINDOWS, ASOF);
    expect(rows[0].left).not.toBeNull();
    expect(rows[0].right).toBeNull();
  });

  it("counts overlapping offices in one state only once", () => {
    const a = profile("a", {
      governments: [
        gov("gj", "Gujarat", "2000-01-01", "2010-01-01"),
        gov("gj", "Gujarat", "2005-01-01", "2007-01-01"),
      ],
    });
    const rows = buildPartyStateRows(a, profile("b"), WINDOWS, ASOF);
    expect(rows[0].left!.terms).toBe(2);
    expect(rows[0].left!.days).toBe(3653); // the 10-year span, not 10 + 2 years
  });

  it("omits states with no recorded government from either party", () => {
    const rows = buildPartyStateRows(profile("a"), profile("b"), WINDOWS, ASOF);
    expect(rows).toEqual([]);
  });
});
