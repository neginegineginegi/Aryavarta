import { describe, expect, it } from "vitest";

import {
  DEFERRED_UNTIL_SERIES_BREAKS,
  isDeferredIndicator,
  PATH_STATEMENT,
  parseDatasetRow,
  parseRowProvenance,
  recordPath,
  validIsoDate,
  validSlug,
  validHttpUrl,
} from "@/lib/ingest/provenance";

const full = {
  slug: "eci-assembly-results-2024",
  name: "Assembly election results 2024",
  publisher: "Election Commission of India",
  version: "2024-25 edition",
  licence: "Government Open Data Licence India",
  licence_url: "https://data.gov.in/government-open-data-license-india",
  retrieved_on: "2026-08-18",
  upstream_url: "https://eci.gov.in/statistical-reports",
  curator: "A. Curator",
  notes: "",
};

describe("validators", () => {
  it("accepts hyphenated lowercase slugs and rejects the rest", () => {
    expect(validSlug("cag-state-finances-2024-25")).toBe(true);
    expect(validSlug("CAG-State-Finances")).toBe(false);
    expect(validSlug("cag_state_finances")).toBe(false);
    expect(validSlug("-leading")).toBe(false);
    expect(validSlug("trailing-")).toBe(false);
    expect(validSlug("double--hyphen")).toBe(false);
  });

  it("requires a real ISO date, not a month or an impossible day", () => {
    expect(validIsoDate("2026-08-18")).toBe(true);
    expect(validIsoDate("2026-08")).toBe(false);
    expect(validIsoDate("18-08-2026")).toBe(false);
    // Rolls over to 1 March, so it is not the date it claims to be.
    expect(validIsoDate("2026-02-30")).toBe(false);
    expect(validIsoDate("2026-13-01")).toBe(false);
  });

  it("accepts only http and https URLs", () => {
    expect(validHttpUrl("https://eci.gov.in/x")).toBe(true);
    expect(validHttpUrl("http://eci.gov.in/x")).toBe(true);
    expect(validHttpUrl("ftp://eci.gov.in/x")).toBe(false);
    expect(validHttpUrl("eci.gov.in")).toBe(false);
  });
});

describe("parseDatasetRow", () => {
  it("reads a complete declaration", () => {
    const r = parseDatasetRow(full);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.slug).toBe("eci-assembly-results-2024");
    expect(r.value.version).toBe("2024-25 edition");
    expect(r.value.licenceUrl).toBe("https://data.gov.in/government-open-data-license-india");
    expect(r.value.notes).toBeNull();
  });

  for (const field of ["name", "publisher", "licence", "curator"] as const) {
    it(`refuses a declaration with no ${field}`, () => {
      const r = parseDatasetRow({ ...full, [field]: "" });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error).toContain(field);
    });
  }

  it("refuses an empty version, and says what to write instead", () => {
    const r = parseDatasetRow({ ...full, version: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // An empty version cannot be told apart from a curator who did not look,
    // so the message names the value that records the difference.
    expect(r.error).toContain("unversioned");
  });

  it('accepts "unversioned" as a stated fact about the publisher', () => {
    const r = parseDatasetRow({ ...full, version: "unversioned" });
    expect(r.ok).toBe(true);
  });

  it("refuses a retrieval date that is not a full ISO date", () => {
    const r = parseDatasetRow({ ...full, retrieved_on: "March 2026" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("retrieved_on");
  });

  it("refuses a malformed upstream or licence URL", () => {
    expect(parseDatasetRow({ ...full, upstream_url: "eci.gov.in" }).ok).toBe(false);
    expect(parseDatasetRow({ ...full, licence_url: "not a url" }).ok).toBe(false);
  });

  it("allows the licence URL to be absent, since not every licence is published at one", () => {
    const r = parseDatasetRow({ ...full, licence_url: "" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.licenceUrl).toBeNull();
  });

  it("refuses a slug that is not in the archive's slug form", () => {
    const r = parseDatasetRow({ ...full, slug: "ECI Results 2024" });
    expect(r.ok).toBe(false);
  });
});

describe("parseRowProvenance", () => {
  const known = new Set(["eci-assembly-results-2024"]);

  it("treats a row with neither column as a row with no provenance", () => {
    const r = parseRowProvenance({}, known);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeNull();
  });

  it("reads both columns together", () => {
    const r = parseRowProvenance(
      { dataset: "eci-assembly-results-2024", upstream_id: "AC_2024_MH_042" },
      known,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      dataset: "eci-assembly-results-2024",
      upstreamId: "AC_2024_MH_042",
    });
  });

  it("refuses a dataset without an upstream id: the pair is the unit", () => {
    const r = parseRowProvenance({ dataset: "eci-assembly-results-2024" }, known);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("upstream_id");
  });

  it("refuses an upstream id with nothing to trace it against", () => {
    const r = parseRowProvenance({ upstream_id: "AC_2024_MH_042" }, known);
    expect(r.ok).toBe(false);
  });

  it("refuses a dataset that was never declared", () => {
    const r = parseRowProvenance(
      { dataset: "some-other-set", upstream_id: "row 12" },
      known,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("datasets.csv");
  });
});

describe("recordPath", () => {
  it("names each of the four states", () => {
    expect(recordPath({ provenance: true, approvedRevision: false })).toBe("bulk");
    expect(recordPath({ provenance: false, approvedRevision: true })).toBe("reviewed");
    expect(recordPath({ provenance: true, approvedRevision: true })).toBe("both");
    expect(recordPath({ provenance: false, approvedRevision: false })).toBe("unrecorded");
  });

  it("states the unknown case rather than leaving it blank", () => {
    expect(PATH_STATEMENT[recordPath({ provenance: false, approvedRevision: false })]).toMatch(
      /does not record/i,
    );
  });

  it("keeps a bulk row from reading as reviewed", () => {
    expect(PATH_STATEMENT.bulk).toMatch(/not reviewed by a person/i);
  });
});

describe("indicator definitions on the bulk path", () => {
  const known = new Set(["ncrb-2022"]);

  it("accepts provenance columns on an indicator row, like any other bulk row", () => {
    const r = parseRowProvenance({ dataset: "ncrb-2022", upstream_id: "Table 3A" }, known);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ dataset: "ncrb-2022", upstreamId: "Table 3A" });
  });

  it("holds back an indicator whose publisher revises the definition between years", () => {
    expect(isDeferredIndicator("ncrb-crime-rate")).toBe(true);
    expect(isDeferredIndicator("  ncrb-crimes-against-women  ")).toBe(true);
  });

  it("lets every other indicator through", () => {
    expect(isDeferredIndicator("literacy-rate")).toBe(false);
    expect(isDeferredIndicator("forest-cover")).toBe(false);
    // Already in the archive, and deliberately not on the list: the gate
    // refuses NEW definitions and changes nothing already recorded.
    expect(isDeferredIndicator("ipc-crime-rate")).toBe(false);
    expect(isDeferredIndicator("crimes-against-women-rate")).toBe(false);
  });

  it("names the deferred set explicitly, so lifting the gate is a visible edit", () => {
    expect([...DEFERRED_UNTIL_SERIES_BREAKS].sort()).toEqual([
      "ncrb-cognizable-crime-rate",
      "ncrb-crime-rate",
      "ncrb-crimes-against-women",
    ]);
  });
});

describe("every path is stated", () => {
  it("has a sentence for all four states, none of them empty", () => {
    for (const path of ["bulk", "reviewed", "both", "unrecorded"] as const) {
      expect(PATH_STATEMENT[path].length).toBeGreaterThan(20);
    }
  });

  it("states unrecorded rather than staying silent about it", () => {
    // Silence on a legacy row reads as reassurance, and the reader ends up
    // crediting a review that never happened.
    expect(PATH_STATEMENT.unrecorded).toMatch(/does not record/i);
  });

  it("keeps reviewed a statement about process, not a quality mark", () => {
    const s = PATH_STATEMENT.reviewed.toLowerCase();
    for (const word of ["verified", "accurate", "trusted", "confirmed", "reliable"]) {
      expect(s).not.toContain(word);
    }
  });

  it("does not claim a bulk row came from a PUBLISHED dataset", () => {
    // The same path carries curated inbox sheets. What it came from is named
    // on the line below; the sentence only reports that nobody checked it.
    expect(PATH_STATEMENT.bulk).not.toMatch(/published/i);
    expect(PATH_STATEMENT.bulk).toMatch(/not reviewed by a person/i);
  });
});
