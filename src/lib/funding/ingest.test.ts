import { describe, expect, it } from "vitest";

import {
  ambiguousFyDate,
  datesOrdered,
  parseRef,
  validAmount,
  validBulkEvidenceStatus,
  validCurrency,
  validFinancialYear,
  verifiedStatusAllowed,
} from "@/lib/funding/ingest";

describe("parseRef", () => {
  it("treats a bare slug as an organisation", () => {
    expect(parseRef("ford-foundation")).toEqual({ type: "org", slug: "ford-foundation" });
  });

  it("requires people to say they are people", () => {
    expect(parseRef("person:jane-doe")).toEqual({ type: "person", slug: "jane-doe" });
  });

  it("accepts party and state ids, which are not slugs", () => {
    expect(parseRef("party:indian-national-congress")).toEqual({
      type: "party",
      id: "indian-national-congress",
    });
    expect(parseRef("state:up")).toEqual({ type: "state", id: "up" });
  });

  it("rejects what it cannot name", () => {
    expect(parseRef("")).toHaveProperty("error");
    expect(parseRef("company:acme")).toHaveProperty("error"); // a company is an org
    expect(parseRef("org:UPPER CASE")).toHaveProperty("error");
    expect(parseRef("org:")).toHaveProperty("error");
  });

  it("normalises case and whitespace rather than storing two spellings", () => {
    expect(parseRef("  Ford-Foundation ")).toEqual({ type: "org", slug: "ford-foundation" });
  });
});

describe("validFinancialYear", () => {
  it("accepts the Indian filing form", () => {
    expect(validFinancialYear("2022-23")).toBe(true);
    expect(validFinancialYear("1999-00")).toBe(true); // 1999-2000 rolls over
  });

  it("rejects a label whose halves do not follow each other", () => {
    expect(validFinancialYear("2022-24")).toBe(false);
    expect(validFinancialYear("2022-2023")).toBe(false);
    expect(validFinancialYear("2022")).toBe(false);
    expect(validFinancialYear("FY23")).toBe(false);
  });
});

describe("validCurrency and validAmount", () => {
  it("catches the ways rupees are actually written in hand-built sheets", () => {
    expect(validCurrency("INR")).toBe(true);
    expect(validCurrency("USD")).toBe(true);
    expect(validCurrency("Rs")).toBe(false);
    expect(validCurrency("₹")).toBe(false);
    expect(validCurrency("rupees")).toBe(false);
  });

  it("allows a recorded transaction with an unknown amount", () => {
    expect(validAmount("")).toBe(true);
  });

  it("rejects negatives and non-numbers", () => {
    expect(validAmount("-5")).toBe(false);
    expect(validAmount("5,00,000")).toBe(false); // grouping is formatting, not data
    expect(validAmount("50 lakh")).toBe(false);
    expect(validAmount("5000000")).toBe(true);
  });
});

describe("bulk evidence status", () => {
  it("permits only what a spreadsheet can honestly assert", () => {
    expect(validBulkEvidenceStatus("verified")).toBe(true);
    expect(validBulkEvidenceStatus("documented")).toBe(true);
    // The other three are claims, and claims carry an asserter or a rationale
    // that a CSV column cannot.
    expect(validBulkEvidenceStatus("alleged")).toBe(false);
    expect(validBulkEvidenceStatus("inferred")).toBe(false);
    expect(validBulkEvidenceStatus("disputed")).toBe(false);
    expect(validBulkEvidenceStatus("")).toBe(false);
  });

  it("refuses 'verified' resting only on journalism, and does not repair it", () => {
    const refused = verifiedStatusAllowed("verified", ["news", "org_statement"]);
    expect(refused.ok).toBe(false);
    const allowed = verifiedStatusAllowed("verified", ["news", "fcra_filing"]);
    expect(allowed.ok).toBe(true);
    const documented = verifiedStatusAllowed("documented", ["news"]);
    expect(documented.ok).toBe(true);
  });
});

describe("ambiguousFyDate", () => {
  it("catches the December that is also a financial year", () => {
    expect(ambiguousFyDate("2011-12")).toBe(true); // Dec 2011, or FY 2011-12?
  });

  it("lets every unambiguous month through", () => {
    expect(ambiguousFyDate("2022-04")).toBe(false); // April 2022; FY would be 2022-23
    expect(ambiguousFyDate("2011-11")).toBe(false);
    expect(ambiguousFyDate("2011-12-01")).toBe(false); // a full date is explicit
    expect(ambiguousFyDate("2011")).toBe(false);
  });
});

describe("datesOrdered", () => {
  it("lets open-ended ranges through and rejects reversed ones", () => {
    expect(datesOrdered("2014-01-01", null)).toBe(true);
    expect(datesOrdered(null, "2019-01-01")).toBe(true);
    expect(datesOrdered("2014-01-01", "2019-01-01")).toBe(true);
    expect(datesOrdered("2019-01-01", "2014-01-01")).toBe(false);
  });
});
