import { describe, expect, it } from "vitest";

import {
  rsCoverageSentence,
  rsEndSentence,
  rsPartyDisplay,
  rsTypeSentence,
} from "@/lib/rajya-sabha-labels";

describe("rsPartyDisplay", () => {
  it("shows the resolved party, and the verbatim label beside it when they differ", () => {
    expect(rsPartyDisplay("INC", "Indian National Congress")).toEqual({
      kind: "resolved",
      verbatim: "INC",
      showVerbatim: true,
    });
    expect(rsPartyDisplay("Bharatiya Jana Sangh", "Bharatiya Jana Sangh")).toEqual({
      kind: "resolved",
      verbatim: "Bharatiya Jana Sangh",
      showVerbatim: false,
    });
  });

  it("explains each absence marker instead of showing a blank", () => {
    for (const label of ["NOM.", "Nominated", "O"]) {
      const d = rsPartyDisplay(label, null);
      expect(d.kind).toBe("absence");
      expect(d.verbatim).toBe(label);
      if (d.kind === "absence") expect(d.note.length).toBeGreaterThan(10);
    }
    expect(rsPartyDisplay("O", null)).toMatchObject({ note: "Party not recorded by the publisher." });
  });

  it("says plainly when a real label resolved to nothing, and does not guess", () => {
    // The 1992 SP term: the label is a party's, but the window that would
    // resolve it starts in 1993, so the archive holds the label alone.
    const d = rsPartyDisplay("SP", null);
    expect(d.kind).toBe("unresolved");
    expect(d.verbatim).toBe("SP");
    if (d.kind === "unresolved") expect(d.note).toMatch(/will not guess/);
  });
});

describe("rsTypeSentence (Type is a snapshot, never the present tense)", () => {
  it("carries the snapshot date inside the same sentence", () => {
    const current = rsTypeSentence("Current", "2022-07-20");
    expect(current).toMatch(/20 July 2022/);
    expect(current).toMatch(/as of/);
    // Never a bare present-tense claim about today.
    expect(current).not.toMatch(/^Currently|is a sitting member\.$/);
    expect(current).toMatch(/outside what the archive holds/);

    expect(rsTypeSentence("Former", "2022-07-20")).toMatch(/former member as of 20 July 2022/);
  });
});

describe("rsEndSentence (scheduled and actual are separate facts)", () => {
  it("names both dates and the recorded reason when the seat was vacated early", () => {
    const s = rsEndSentence("2003-09-30", "2001-05-14", "Resignation");
    expect(s).toMatch(/Scheduled to end 30 September 2003/);
    expect(s).toMatch(/actually vacated 14 May 2001/);
    expect(s).toMatch(/Resignation/);
  });

  it("states the absence when no actual date is recorded", () => {
    expect(rsEndSentence("2003-09-30", null, "")).toMatch(/No actual vacation date is recorded/);
  });

  it("does not imply an early exit when the dates agree", () => {
    const s = rsEndSentence("2003-09-30", "2003-09-30", "Retirement");
    expect(s).toMatch(/vacated on that date/);
    expect(s).not.toMatch(/actually vacated 30 September 2003/);
  });
});

describe("rsCoverageSentence", () => {
  it("states the boundary in both directions", () => {
    const s = rsCoverageSentence("2022-07-20");
    expect(s).toMatch(/March 1952/);
    expect(s).toMatch(/20 July 2022/);
    expect(s).toMatch(/not in the archive at all/);
  });
});
