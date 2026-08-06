import { describe, expect, it } from "vitest";

import { canonicalParty } from "./canonical-party-colors";

// Reads the real committed sheet: these assertions pin the invariant that a
// curated party can never enter the archive wearing an auto-assigned color.
describe("canonicalParty", () => {
  it("resolves curated parties by exact name, case-insensitively", () => {
    expect(canonicalParty("Samajwadi Party")).toEqual({
      color: "#FF4500",
      abbreviation: "SP",
    });
    expect(canonicalParty("  bharatiya janata party ")).toEqual({
      color: "#FF9933",
      abbreviation: "BJP",
    });
  });

  it("returns null for parties the sheet does not curate", () => {
    expect(canonicalParty("Demo Party Alpha")).toBeNull();
    expect(canonicalParty("")).toBeNull();
  });
});
