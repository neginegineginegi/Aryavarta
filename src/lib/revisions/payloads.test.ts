import { describe, expect, it } from "vitest";

import {
  electionPayloadSchema,
  eventPayloadSchema,
  normalizeSourceUrl,
  termPayloadSchema,
} from "./payloads";

const validSource = {
  title: "A perfectly good source",
  url: "https://example.org/articles/1",
  publisher: "Example",
  publishedOn: "2020-01-01",
  accessedOn: "2026-08-01",
};

describe("normalizeSourceUrl", () => {
  it("lowercases the host and strips trailing slash + fragment", () => {
    expect(normalizeSourceUrl("https://Example.ORG/Path/To/")).toBe(
      "https://example.org/Path/To",
    );
    expect(normalizeSourceUrl("https://example.org/a#section")).toBe("https://example.org/a");
  });

  it("keeps query strings", () => {
    expect(normalizeSourceUrl("https://example.org/a?id=5")).toBe("https://example.org/a?id=5");
  });

  it("rejects unsafe or non-absolute URLs", () => {
    // eslint-disable-next-line no-script-url
    expect(() => normalizeSourceUrl("javascript:alert(1)")).toThrow();
    expect(() => normalizeSourceUrl("data:text/html,hi")).toThrow();
    expect(() => normalizeSourceUrl("ftp://example.org/x")).toThrow();
    expect(() => normalizeSourceUrl("/relative/path")).toThrow();
    expect(() => normalizeSourceUrl("not a url")).toThrow();
  });
});

describe("eventPayloadSchema", () => {
  const base = {
    stateId: "tg",
    year: 2020,
    eventDate: null,
    type: "paper_leak" as const,
    title: "A sufficiently long event title",
    description:
      "A description that is comfortably longer than the forty character minimum required.",
    sources: [validSource],
  };

  it("accepts a valid payload", () => {
    expect(eventPayloadSchema.safeParse(base).success).toBe(true);
  });

  it("enforces the >=1 source hard rule", () => {
    expect(eventPayloadSchema.safeParse({ ...base, sources: [] }).success).toBe(false);
  });

  it("rejects future years", () => {
    const r = eventPayloadSchema.safeParse({ ...base, year: new Date().getFullYear() + 1 });
    expect(r.success).toBe(false);
  });

  it("rejects an eventDate outside the stated year", () => {
    const r = eventPayloadSchema.safeParse({ ...base, eventDate: "2019-05-01" });
    expect(r.success).toBe(false);
  });

  it("normalizes source URLs during parsing", () => {
    const r = eventPayloadSchema.parse({
      ...base,
      sources: [{ ...validSource, url: "https://Example.org/x/" }],
    });
    expect(r.sources[0].url).toBe("https://example.org/x");
  });
});

describe("termPayloadSchema", () => {
  const cmTerm = {
    stateId: "kl",
    kind: "cm" as const,
    cmName: "A. Sample Kumar",
    partyId: "demo-a",
    startDate: "2016-05-25",
    endDate: "2021-05-03",
    notes: null,
    sources: [validSource],
  };

  it("accepts a valid CM term", () => {
    expect(termPayloadSchema.safeParse(cmTerm).success).toBe(true);
  });

  it("requires cmName and party for CM terms", () => {
    expect(termPayloadSchema.safeParse({ ...cmTerm, cmName: null }).success).toBe(false);
    expect(termPayloadSchema.safeParse({ ...cmTerm, partyId: null }).success).toBe(false);
  });

  it("forbids cmName/party on President's Rule", () => {
    expect(
      termPayloadSchema.safeParse({ ...cmTerm, kind: "presidents_rule" }).success,
    ).toBe(false);
    expect(
      termPayloadSchema.safeParse({
        ...cmTerm,
        kind: "presidents_rule",
        cmName: null,
        partyId: null,
      }).success,
    ).toBe(true);
  });

  it("requires endDate after startDate", () => {
    expect(
      termPayloadSchema.safeParse({ ...cmTerm, endDate: "2016-05-25" }).success,
    ).toBe(false);
  });
});

describe("electionPayloadSchema", () => {
  const base = {
    stateId: "tg",
    electionDate: "2023-11-30",
    resultSummary: null,
    totalSeats: 119,
    turnoutPercent: 71.34,
    results: [
      { partyId: "demo-a", seats: 64, voteSharePercent: null },
      { partyId: "demo-b", seats: 39, voteSharePercent: null },
    ],
    sources: [validSource],
  };

  it("accepts a valid election", () => {
    expect(electionPayloadSchema.safeParse(base).success).toBe(true);
  });

  it("rejects duplicate parties", () => {
    const r = electionPayloadSchema.safeParse({
      ...base,
      results: [
        { partyId: "demo-a", seats: 10, voteSharePercent: null },
        { partyId: "demo-a", seats: 5, voteSharePercent: null },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects seat sums exceeding total seats", () => {
    const r = electionPayloadSchema.safeParse({
      ...base,
      results: [{ partyId: "demo-a", seats: 200, voteSharePercent: null }],
    });
    expect(r.success).toBe(false);
  });

  it("allows seat sums below total (vacancies etc.)", () => {
    const r = electionPayloadSchema.safeParse({
      ...base,
      results: [{ partyId: "demo-a", seats: 100, voteSharePercent: null }],
    });
    expect(r.success).toBe(true);
  });
});
