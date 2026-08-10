import { describe, expect, it } from "vitest";

import { clampDepth, MAX_DEPTH, toEdge } from "@/lib/funding/graph-types";
import { bySourceStrength, canBeVerified, sourceRank } from "@/lib/funding/source-rank";

describe("clampDepth", () => {
  it("defaults to one hop, so an unasked-for expansion is never enormous", () => {
    expect(clampDepth(undefined)).toBe(1);
    expect(clampDepth(0)).toBe(1);
    expect(clampDepth(Number.NaN)).toBe(1);
  });

  it("never exceeds the traversal cap however it is asked", () => {
    expect(clampDepth(MAX_DEPTH + 9)).toBe(MAX_DEPTH);
    expect(clampDepth(Number.POSITIVE_INFINITY)).toBe(1); // not finite, so the default
    expect(clampDepth(-3)).toBe(1);
    expect(clampDepth(2.9)).toBe(2);
  });
});

describe("toEdge", () => {
  const row = {
    edge_id: "funding:abc",
    edge_table: "funding_transactions",
    row_id: "abc",
    kind: "funded",
    interpretive: false,
    from_type: "org",
    from_id: "f1",
    to_type: "org",
    to_id: "r1",
    start_on: null,
    end_on: null,
    year_from: 2016,
    year_to: 2017,
    amount: "5000000.00",
    currency: "INR",
    evidence_status: "verified",
    citation_subject: "funding_transaction",
    citation_subject_id: "abc",
    detail: "Coastal ecology research",
  };

  it("carries the citation handle, so no edge can be drawn without its source", () => {
    const e = toEdge(row);
    expect(e.citationSubject).toBe("funding_transaction");
    expect(e.citationSubjectId).toBe("abc");
  });

  it("keeps the amount as a string, since a float would round rupees", () => {
    expect(toEdge(row).amount).toBe("5000000.00");
  });

  it("keeps direction even though traversal is undirected", () => {
    const e = toEdge(row);
    expect(e.from).toEqual({ type: "org", id: "f1" });
    expect(e.to).toEqual({ type: "org", id: "r1" });
  });

  it("marks a claim as interpretive so it can never render as documented", () => {
    const claim = toEdge({ ...row, edge_table: "claims", interpretive: true, kind: "control" });
    expect(claim.interpretive).toBe(true);
  });
});

describe("source rank", () => {
  it("puts government and court records above journalism", () => {
    expect(sourceRank("gazette")).toBeLessThan(sourceRank("news"));
    expect(sourceRank("court_judgment")).toBeLessThan(sourceRank("news"));
    expect(sourceRank("fcra_filing")).toBeLessThan(sourceRank("org_statement"));
  });

  it("sorts an unclassified source last rather than first", () => {
    expect(sourceRank(null)).toBeGreaterThan(sourceRank("social_media"));
    expect(sourceRank(undefined)).toBeGreaterThan(sourceRank("other"));
  });

  it("refuses 'verified' to a claim resting only on reporting or self-description", () => {
    expect(canBeVerified(["news"])).toBe(false);
    expect(canBeVerified(["org_statement", "social_media"])).toBe(false);
    expect(canBeVerified(["news", "fcra_filing"])).toBe(true);
    expect(canBeVerified([])).toBe(false);
  });

  it("orders a citation list strongest first", () => {
    const list = [{ kind: "news" as const }, { kind: "gazette" as const }, { kind: null }];
    expect([...list].sort(bySourceStrength).map((s) => s.kind)).toEqual(["gazette", "news", null]);
  });
});
