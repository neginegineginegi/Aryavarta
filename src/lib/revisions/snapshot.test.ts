import { describe, expect, it } from "vitest";

import { snapshotsEqual } from "./snapshot";

const term = {
  stateId: "kl",
  kind: "cm",
  cmName: "A. Sample Kumar",
  partyId: "demo-party-alpha",
  startDate: "1992-06-01",
  endDate: "1998-03-01",
  notes: null,
  sources: [
    {
      id: "s-1",
      title: "Kerala Legislative Assembly records",
      url: "https://example.org/records",
      publisher: null,
      publishedOn: null,
      accessedOn: "2026-01-01",
    },
  ],
};

/** Recursively rebuild an object with reversed key order, like a jsonb round trip does. */
function reorderKeys(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(reorderKeys);
  const rec = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(rec).sort().reverse()) out[k] = reorderKeys(rec[k]);
  return out;
}

describe("snapshotsEqual", () => {
  it("is insensitive to object key order (jsonb round trips rewrite it)", () => {
    expect(snapshotsEqual(term, reorderKeys(term))).toBe(true);
  });

  it("ignores source ids but not source content", () => {
    const otherId = {
      ...term,
      sources: [{ ...term.sources[0], id: "s-999" }],
    };
    expect(snapshotsEqual(term, otherId)).toBe(true);

    const otherUrl = {
      ...term,
      sources: [{ ...term.sources[0], url: "https://example.org/else" }],
    };
    expect(snapshotsEqual(term, otherUrl)).toBe(false);
  });

  it("still detects real changes after reordering", () => {
    const edited = reorderKeys({ ...term, endDate: "1999-01-01" });
    expect(snapshotsEqual(term, edited)).toBe(false);
  });
});
