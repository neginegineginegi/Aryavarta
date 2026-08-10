import { describe, expect, it } from "vitest";

import {
  countEntries,
  emptyInvestigation,
  isEmpty,
  parseInvestigation,
  storageKey,
} from "@/lib/funding/investigation";

const ROOT = "org:abc";

describe("parseInvestigation", () => {
  it("returns nothing for absent or unreadable data", () => {
    expect(parseInvestigation(null, ROOT)).toBeNull();
    expect(parseInvestigation("", ROOT)).toBeNull();
    expect(parseInvestigation("{ not json", ROOT)).toBeNull();
    expect(parseInvestigation("[]", ROOT)).toBeNull();
  });

  it("refuses an investigation belonging to a different root", () => {
    const raw = JSON.stringify({ ...emptyInvestigation("org:other", ""), notes: { x: "y" } });
    expect(parseInvestigation(raw, ROOT)).toBeNull();
  });

  it("refuses a version it does not know", () => {
    const raw = JSON.stringify({ version: 99, rootKey: ROOT, notes: {}, pins: {}, flags: {} });
    expect(parseInvestigation(raw, ROOT)).toBeNull();
  });

  it("keeps the good parts and drops the rest, rather than trusting or failing", () => {
    const raw = JSON.stringify({
      version: 1,
      rootKey: ROOT,
      notes: { good: "a note", bad: 42, alsoBad: null },
      pins: { good: { x: 1, y: 2 }, bad: { x: "nope", y: 2 }, worse: null },
      flags: { good: "needs_source", bad: "delete_everything" },
      updatedAt: 12345,
    });
    const parsed = parseInvestigation(raw, ROOT)!;
    expect(parsed.notes).toEqual({ good: "a note" });
    expect(parsed.pins).toEqual({ good: { x: 1, y: 2 } });
    expect(parsed.flags).toEqual({ good: "needs_source" });
    expect(parsed.updatedAt).toBe("");
  });

  it("round-trips an ordinary investigation", () => {
    const inv = {
      ...emptyInvestigation(ROOT, "2026-08-10T00:00:00.000Z"),
      notes: { "org:x": "check the 2017 filing" },
      pins: { "org:x": { x: 10.5, y: -3 } },
      flags: { "funding:1": "follow_up" as const },
    };
    expect(parseInvestigation(JSON.stringify(inv), ROOT)).toEqual(inv);
  });
});

describe("isEmpty", () => {
  it("is true for a fresh investigation, so looking around leaves no trace", () => {
    expect(isEmpty(emptyInvestigation(ROOT, ""))).toBe(true);
  });

  it("is false once anything at all is recorded", () => {
    const base = emptyInvestigation(ROOT, "");
    expect(isEmpty({ ...base, notes: { a: "x" } })).toBe(false);
    expect(isEmpty({ ...base, pins: { a: { x: 0, y: 0 } } })).toBe(false);
    expect(isEmpty({ ...base, flags: { a: "follow_up" } })).toBe(false);
  });
});

describe("countEntries", () => {
  it("counts notes, pins and flags together", () => {
    expect(
      countEntries({
        ...emptyInvestigation(ROOT, ""),
        notes: { a: "1", b: "2" },
        pins: { c: { x: 0, y: 0 } },
        flags: { d: "needs_source" },
      }),
    ).toBe(4);
  });
});

describe("storageKey", () => {
  it("namespaces by root, so two investigations never overwrite each other", () => {
    expect(storageKey("org:a")).not.toBe(storageKey("org:b"));
    expect(storageKey("org:a")).toContain("org:a");
  });
});
