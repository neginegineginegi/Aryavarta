import { describe, expect, it } from "vitest";

import {
  aggregateFlow,
  byCurrency,
  kindLabel,
  UNKNOWN_CURRENCY,
  UNKNOWN_KIND,
  type FlowInput,
} from "@/lib/funding/flow";

const tx = (
  donorKind: string | null,
  recipientKind: string | null,
  amount: string | number | null,
  currency: string | null = "INR",
): FlowInput => ({ donorKind, recipientKind, amount, currency });

describe("aggregateFlow", () => {
  it("sums transactions between the same pair of kinds", () => {
    const out = aggregateFlow([tx("company", "foundation", 100), tx("company", "foundation", 50)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ total: 150, transactions: 2, unpriced: 0 });
  });

  it("never adds two currencies together", () => {
    // The whole point of the module. ₹100 and $100 are two rows, always.
    const out = aggregateFlow([
      tx("company", "foundation", 100, "INR"),
      tx("company", "foundation", 100, "USD"),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.currency).sort()).toEqual(["INR", "USD"]);
    expect(out.every((r) => r.total === 100)).toBe(true);
  });

  it("keeps direction: A to B is not B to A", () => {
    const out = aggregateFlow([tx("company", "ngo", 10), tx("ngo", "company", 10)]);
    expect(out).toHaveLength(2);
  });

  it("counts a transaction with no amount without treating it as zero", () => {
    const out = aggregateFlow([tx("company", "ngo", 500), tx("company", "ngo", null)]);
    expect(out[0]).toMatchObject({ total: 500, transactions: 2, unpriced: 1 });
  });

  it("counts an unparseable amount as unpriced rather than dropping the row", () => {
    // Dropping it would understate how much the archive holds.
    const out = aggregateFlow([tx("company", "ngo", "not a number")]);
    expect(out[0]).toMatchObject({ total: 0, transactions: 1, unpriced: 1 });
  });

  it("does not fold a missing kind into the real 'other' kind", () => {
    const out = aggregateFlow([tx(null, "ngo", 10), tx("other", "ngo", 10)]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.donorKind).sort()).toEqual([UNKNOWN_KIND, "other"].sort());
  });

  it("keeps a transaction with no currency out of every currency total", () => {
    const out = aggregateFlow([tx("company", "ngo", 10, null), tx("company", "ngo", 10, "INR")]);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.currency === UNKNOWN_CURRENCY)).toMatchObject({ total: 10 });
    expect(out.find((r) => r.currency === "INR")).toMatchObject({ total: 10 });
  });

  it("is stable and does not rank one currency against another", () => {
    const rows = [
      tx("company", "ngo", 1, "USD"),
      tx("trust", "ngo", 1_000_000, "INR"),
      tx("company", "trust", 5, "USD"),
    ];
    const once = aggregateFlow(rows);
    const again = aggregateFlow([...rows].reverse());
    expect(once).toEqual(again);
    // Grouped by currency first, so the huge rupee figure never sorts above a
    // dollar figure as though they were on one scale.
    expect(once.map((r) => r.currency)).toEqual(["INR", "USD", "USD"]);
  });

  it("handles nothing recorded", () => {
    expect(aggregateFlow([])).toEqual([]);
  });
});

describe("byCurrency", () => {
  it("gives each currency its own maximum, so no bar is drawn against another currency", () => {
    const groups = byCurrency(
      aggregateFlow([
        tx("company", "ngo", 1_000, "INR"),
        tx("trust", "ngo", 250, "INR"),
        tx("company", "ngo", 9, "USD"),
      ]),
    );
    const inr = groups.find((g) => g.currency === "INR")!;
    const usd = groups.find((g) => g.currency === "USD")!;
    expect(inr.max).toBe(1_000);
    expect(usd.max).toBe(9);
  });

  it("carries n and the unpriced count per currency for the view to state", () => {
    const groups = byCurrency(
      aggregateFlow([tx("company", "ngo", 10), tx("company", "ngo", null), tx("trust", "ngo", 5)]),
    );
    expect(groups[0]).toMatchObject({ transactions: 3, unpriced: 1 });
  });

  it("orders currencies by how many transactions are recorded, not by amount", () => {
    // A count is comparable across currencies; a total is not.
    const groups = byCurrency(
      aggregateFlow([
        tx("company", "ngo", 1, "USD"),
        tx("trust", "ngo", 2, "USD"),
        tx("company", "trust", 99_999_999, "INR"),
      ]),
    );
    expect(groups.map((g) => g.currency)).toEqual(["USD", "INR"]);
  });
});

describe("kindLabel", () => {
  it("uses the shared vocabulary", () => {
    expect(kindLabel("think_tank")).toBe("Think tank");
    expect(kindLabel("ngo")).toBe("NGO");
  });

  it("says a missing kind is missing rather than calling it something", () => {
    expect(kindLabel(UNKNOWN_KIND)).toBe("Kind not recorded");
    expect(kindLabel("other")).toBe("Organisation");
  });

  it("does not print a bare enum value for a kind labels.ts has not got", () => {
    expect(kindLabel("brand_new_kind")).toBe("brand new kind");
  });
});
