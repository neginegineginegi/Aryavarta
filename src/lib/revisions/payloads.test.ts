import { describe, expect, it } from "vitest";

import {
  canonicalizeFor,
  electionPayloadSchema,
  eventPayloadSchema,
  normalizeSourceUrl,
  payloadSchemaFor,
  promisePayloadSchema,
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

describe("promisePayloadSchema", () => {
  const base = {
    documentId: "0195c1d0-0000-7000-8000-000000000001",
    partyId: "demo-a",
    electionId: null,
    stateId: null,
    officialText: "We will build one thousand kilometres of rural road.",
    officialLang: "en",
    plainText: null,
    category: "infrastructure" as const,
    scope: "state" as const,
    statedTimeline: "within five years",
    statedBudgetInr: null,
    pageRef: "p. 14",
    sortOrder: 3,
    sources: [validSource],
  };

  it("accepts a valid payload", () => {
    expect(promisePayloadSchema.safeParse(base).success).toBe(true);
  });

  it("enforces the >=1 source hard rule", () => {
    expect(promisePayloadSchema.safeParse({ ...base, sources: [] }).success).toBe(false);
  });

  it("requires the quoted wording", () => {
    expect(promisePayloadSchema.safeParse({ ...base, officialText: "too short" }).success).toBe(
      false,
    );
  });

  it("allows a national promise with no state", () => {
    const r = promisePayloadSchema.safeParse({ ...base, stateId: null, scope: "national" });
    expect(r.success).toBe(true);
  });

  it("defaults category and scope rather than inventing a verdict field", () => {
    const r = promisePayloadSchema.parse({
      documentId: base.documentId,
      officialText: base.officialText,
      sources: [validSource],
    });
    expect(r.category).toBe("other");
    expect(r.scope).toBe("unspecified");
    // A promise carries no status: whether it was kept is never the archive's
    // own claim. Guard the absence so it cannot be added back by accident.
    expect(r).not.toHaveProperty("status");
    expect(r).not.toHaveProperty("confidence");
  });

  it("normalizes source URLs during parsing", () => {
    const r = promisePayloadSchema.parse({
      ...base,
      sources: [{ ...validSource, url: "https://Example.org/x/" }],
    });
    expect(r.sources[0].url).toBe("https://example.org/x");
  });
});

/**
 * Every entity type the revision pipeline routes on must have both a schema
 * and a canonicalizer. A type added to one registry but not the other passes
 * typecheck through the index signature and fails at approval time.
 */
describe("entity registries", () => {
  it("cover the same entity types", () => {
    expect(Object.keys(payloadSchemaFor).sort()).toEqual(Object.keys(canonicalizeFor).sort());
  });

  it("include manifesto_promise", () => {
    expect(Object.keys(payloadSchemaFor)).toContain("manifesto_promise");
  });
});
