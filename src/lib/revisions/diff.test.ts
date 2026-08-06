import { describe, expect, it } from "vitest";

import { diffProse, diffResults, diffScalars, diffSources } from "./diff";
import type { EventPayload } from "./payloads";

const src = (url: string, title = "T") => ({
  title,
  url,
  publisher: null,
  publishedOn: null,
  accessedOn: null,
});

const event = (over: Partial<EventPayload>): EventPayload => ({
  stateId: "tg",
  year: 2020,
  eventDate: null,
  type: "corruption",
  title: "Original title here",
  description: "The original description of the event.",
  sources: [src("https://example.org/a")],
  ...over,
});

describe("diffScalars", () => {
  it("marks changed fields and leaves others unchanged", () => {
    const before = event({});
    const after = event({ title: "A corrected title here", year: 2021 });
    const rows = diffScalars("event", before, after);
    const byField = Object.fromEntries(rows.map((r) => [r.field, r]));
    expect(byField.title.changed).toBe(true);
    expect(byField.year.changed).toBe(true);
    expect(byField.description.changed).toBe(false);
    expect(byField.stateId.changed).toBe(false);
  });

  it("handles create (null before)", () => {
    const rows = diffScalars("event", null, event({}));
    expect(rows.every((r) => r.before === null)).toBe(true);
  });
});

describe("diffSources", () => {
  it("classifies added, removed, kept by URL", () => {
    const d = diffSources(
      [src("https://example.org/a"), src("https://example.org/b")],
      [src("https://example.org/b"), src("https://example.org/c")],
    );
    expect(d.added.map((s) => s.url)).toEqual(["https://example.org/c"]);
    expect(d.removed.map((s) => s.url)).toEqual(["https://example.org/a"]);
    expect(d.kept.map((s) => s.url)).toEqual(["https://example.org/b"]);
  });
});

describe("diffResults", () => {
  it("reports seat deltas including added/removed parties", () => {
    const r = (partyId: string, seats: number) => ({
      partyId,
      seats,
      voteSharePercent: null,
      seatsContested: null,
      allianceName: null,
    });
    const rows = diffResults([r("a", 60), r("b", 40)], [r("a", 62), r("c", 38)]);
    const byParty = Object.fromEntries(rows.map((r) => [r.partyId, r]));
    expect(byParty.a).toMatchObject({ beforeSeats: 60, afterSeats: 62, changed: true });
    expect(byParty.b).toMatchObject({ beforeSeats: 40, afterSeats: null, changed: true });
    expect(byParty.c).toMatchObject({ beforeSeats: null, afterSeats: 38, changed: true });
  });
});

describe("diffProse", () => {
  it("returns a single same-segment for identical text", () => {
    expect(diffProse("same text", "same text")).toEqual([{ text: "same text", kind: "same" }]);
  });

  it("marks word-level additions and removals", () => {
    const segs = diffProse("the quick fox", "the slow fox");
    expect(segs.some((s) => s.kind === "removed" && s.text.includes("quick"))).toBe(true);
    expect(segs.some((s) => s.kind === "added" && s.text.includes("slow"))).toBe(true);
  });
});
