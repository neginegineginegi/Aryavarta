import { describe, expect, it } from "vitest";

import {
  aggregateBonds,
  BOND_REQUIRED_COLUMNS,
  checkBondsHeader,
  classifyOrgKind,
  parseBondAmount,
  parseBondDate,
  parseBondRow,
  purchaserSlug,
  type BondRow,
} from "@/lib/ingest/electoral-bonds";

const raw = (over: Partial<Record<string, string>> = {}): Record<string, string> => ({
  date_of_encashment: "01/Dec/2023",
  political_party_name: "BHARATIYA JANATA PARTY",
  prefix: "OB",
  bond_number: "1234567",
  amount: "10,00,000",
  pay_branch_code: "300",
  reference_number_URN: "X1",
  journam_date: "30/Nov/2023",
  date_of_purchase: "28/Nov/2023",
  date_of_expiry: "12/Dec/2023",
  purchaser_name: "EXAMPLE INDUSTRIES LTD",
  issue_branch_code: "1",
  status: "Paid",
  ...over,
});

const parsed = (over: Partial<Record<string, string>> = {}): BondRow => {
  const p = parseBondRow(raw(over));
  if ("refused" in p) throw new Error(`fixture refused: ${p.refused}`);
  return p;
};

describe("checkBondsHeader (spec §2.1)", () => {
  it("passes the delivered header verbatim, including the source's journam_date typo", () => {
    expect(checkBondsHeader([...BOND_REQUIRED_COLUMNS])).toEqual({ ok: true, unknown: [] });
  });

  it("fails on a missing column, naming it, and reports drift columns", () => {
    const res = checkBondsHeader(BOND_REQUIRED_COLUMNS.filter((c) => c !== "amount"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.missing).toEqual(["amount"]);
    const drift = checkBondsHeader([...BOND_REQUIRED_COLUMNS, "Brand_New"]);
    expect(drift.ok && drift.unknown).toEqual(["Brand_New"]);
  });
});

describe("parseBondAmount (spec §2.2: Indian grouping)", () => {
  it("parses Indian digit grouping and never assumes Western", () => {
    expect(parseBondAmount("10,00,000")).toBe(1000000);
    expect(parseBondAmount("1,00,00,000")).toBe(10000000);
    expect(parseBondAmount("1000")).toBe(1000);
  });

  it("treats empty as absent and refuses anything non-numeric", () => {
    expect(parseBondAmount("")).toBeNull();
    expect(parseBondAmount("Rs 10")).toHaveProperty("refused");
    expect(parseBondAmount("10.5")).toHaveProperty("refused");
  });
});

describe("parseBondDate (spec §2.2)", () => {
  it("parses DD/Mon/YYYY", () => {
    expect(parseBondDate("01/Dec/2023")).toBe("2023-12-01");
    expect(parseBondDate("12/Apr/2019")).toBe("2019-04-12");
  });

  it("treats empty as absent; refuses unknown formats, fake dates, out-of-band years", () => {
    expect(parseBondDate("")).toBeNull();
    expect(parseBondDate("2023-12-01")).toHaveProperty("refused");
    expect(parseBondDate("31/Feb/2023")).toHaveProperty("refused");
    expect(parseBondDate("01/Dec/2031")).toHaveProperty("refused");
  });
});

describe("aggregateBonds (spec §2.3–§2.4)", () => {
  it("splits matched from expired on the recorded fields, asserting the known shape", () => {
    const rows = [
      parsed(),
      parsed({ political_party_name: "", date_of_encashment: "", amount: "", status: "Expired", bond_number: "7654321" }),
    ];
    const out = aggregateBonds(rows);
    expect(out.matchedRows).toBe(1);
    expect(out.expiredRows).toBe(1);
    expect(out.anomalies).toEqual([]);
  });

  it("flags a partyless row that is not the known Expired shape", () => {
    const rows = [parsed({ political_party_name: "", status: "Paid" })];
    const out = aggregateBonds(rows);
    expect(out.anomalies.join(" ")).toMatch(/not the known Expired shape/);
  });

  it("breaks the empty-purchaser money out PER PARTY, never into one node (defect 1)", () => {
    const rows = [
      parsed({ purchaser_name: "", amount: "1,00,000" }),
      parsed({ purchaser_name: "", amount: "2,00,000", political_party_name: "BIJU JANATA DAL" }),
      parsed({ amount: "5,00,000" }),
    ];
    const out = aggregateBonds(rows);
    expect(out.emptyPurchaser.rows).toBe(2);
    expect(out.emptyPurchaser.value).toBe(300000);
    expect(out.emptyPurchaser.byParty.map((p) => [p.name, p.value])).toEqual([
      ["BIJU JANATA DAL", 200000],
      ["BHARATIYA JANATA PARTY", 100000],
    ]);
    // The unnamed rows never join the purchasers list.
    expect(out.purchasers.map((p) => p.name)).toEqual(["EXAMPLE INDUSTRIES LTD"]);
    // Party totals carry both the full and the loadable (named) figures.
    const bjp = out.parties.find((p) => p.name === "BHARATIYA JANATA PARTY")!;
    expect(bjp.value).toBe(600000);
    expect(bjp.namedValue).toBe(500000);
  });

  it("detects collapsed-form collision groups without merging anything (defect 4)", () => {
    const rows = [
      parsed({ purchaser_name: "AVEES TRADING & FINANCE PVT LTD" }),
      parsed({ purchaser_name: "AVEES TRADING FINANCE PVT LTD" }),
      parsed({ purchaser_name: "SOMEONE ELSE LTD" }),
    ];
    const out = aggregateBonds(rows);
    expect(out.collisionGroups).toEqual([
      { form: "aveestradingfinancepvtltd", names: ["AVEES TRADING & FINANCE PVT LTD", "AVEES TRADING FINANCE PVT LTD"] },
    ]);
    expect(out.purchasers).toHaveLength(3); // still three distinct verbatim entities
  });

  it("lists space-stripped and mid-word-split names verbatim (defects 2–3)", () => {
    const rows = [
      parsed({ purchaser_name: "QWIKSUPPLYCHAINPRIVATELIMITED" }),
      parsed({ purchaser_name: "MEGHA ENGINEERING AND INFRASTRUCTURES LI MITED" }),
    ];
    const out = aggregateBonds(rows);
    expect(out.spaceStripped).toEqual(["QWIKSUPPLYCHAINPRIVATELIMITED"]);
    expect(out.midWordSplits).toEqual(["MEGHA ENGINEERING AND INFRASTRUCTURES LI MITED"]);
  });

  it("counts likely individuals for the gate question without classifying anyone", () => {
    const rows = [
      parsed({ purchaser_name: "AGARWAL M BISHAN" }),
      parsed({ purchaser_name: "EXAMPLE INDUSTRIES LTD" }),
    ];
    const out = aggregateBonds(rows);
    expect(out.likelyIndividuals.count).toBe(1);
    expect(out.likelyIndividuals.samples).toEqual(["AGARWAL M BISHAN"]);
  });

  it("flags duplicate bond identities", () => {
    const rows = [parsed(), parsed({ political_party_name: "BIJU JANATA DAL" })];
    const out = aggregateBonds(rows);
    expect(out.duplicateBondIds).toBe(1);
    expect(out.anomalies.join(" ")).toMatch(/appear more than once/);
  });
});

describe("purchaserSlug", () => {
  it("derives a deterministic slug from the verbatim name", () => {
    expect(purchaserSlug("MEGHA ENGINEERING AND INFRASTRUCTURES LI MITED")).toBe(
      "megha-engineering-and-infrastructures-li-mited",
    );
    expect(purchaserSlug("J.K.CEMENT LTD.")).toBe("j-k-cement-ltd");
  });
});

describe("classifyOrgKind (2026-09-03 ruling: only what the name states)", () => {
  const SUFFIXES = ["LIMITED", "LTD", "PVT", "PRIVATE LIMITED", "LLP", "LLC"];

  it("classifies a name ending in a committed legal-form suffix as company", () => {
    expect(classifyOrgKind("EXAMPLE INDUSTRIES LIMITED", SUFFIXES)).toBe("company");
    expect(classifyOrgKind("J.K.CEMENT LTD.", SUFFIXES)).toBe("company");
    expect(classifyOrgKind("Something Private Limited", SUFFIXES)).toBe("company");
    expect(classifyOrgKind("ACME ADVISORS LLP", SUFFIXES)).toBe("company");
    expect(classifyOrgKind("WESTERN CARRIERS PVT", SUFFIXES)).toBe("company");
  });

  it("leaves everything else unclassified — no pattern inference", () => {
    expect(classifyOrgKind("AGARWAL M BISHAN", SUFFIXES)).toBe("unclassified");
    // Corporate-sounding words that are NOT a committed suffix stay
    // unclassified: the CORPORATE_MARKER heuristic never reaches a kind.
    expect(classifyOrgKind("EXAMPLE TRADING CO", SUFFIXES)).toBe("unclassified");
    expect(classifyOrgKind("SUNRISE ENTERPRISES", SUFFIXES)).toBe("unclassified");
    // A space-stripped name does not STATE the suffix as its own word; it is
    // a transcription defect the collision candidates handle, not this rule.
    expect(classifyOrgKind("QWIKSUPPLYCHAINPRIVATELIMITED", SUFFIXES)).toBe("unclassified");
    // Mid-word split: the suffix the source wrote is "LI MITED", not LIMITED.
    expect(classifyOrgKind("MEGHA ENGINEERING AND INFRASTRUCTURES LI MITED", SUFFIXES)).toBe("unclassified");
  });

  it("matches mechanically: case-insensitive, dots and commas ignored, whitespace collapsed", () => {
    expect(classifyOrgKind("example pvt. ltd.", SUFFIXES)).toBe("company");
    expect(classifyOrgKind("EXAMPLE   PRIVATE   LIMITED", SUFFIXES)).toBe("company");
    expect(classifyOrgKind("EXAMPLE, LLC", SUFFIXES)).toBe("company");
  });
});
