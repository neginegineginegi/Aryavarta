import { describe, expect, it } from "vitest";

import { promiseCategoryEnum, promiseScopeEnum } from "@/lib/db/schema";
import { PROMISE_CATEGORY_LABELS, PROMISE_SCOPE_LABELS } from "@/lib/format";

/**
 * The manifesto viewer renders a human label for every category and scope. A
 * new enum member added without a label would render its raw snake_case value
 * in the promise list, so the lists are pinned together here.
 */
describe("promise category labels", () => {
  it("covers every value in the promise_category enum", () => {
    const missing = promiseCategoryEnum.enumValues.filter(
      (v) => !(v in PROMISE_CATEGORY_LABELS),
    );
    expect(missing).toEqual([]);
  });

  it("has no labels for categories the enum does not define", () => {
    const known = new Set<string>(promiseCategoryEnum.enumValues);
    const orphans = Object.keys(PROMISE_CATEGORY_LABELS).filter((k) => !known.has(k));
    expect(orphans).toEqual([]);
  });
});

describe("promise scope labels", () => {
  it("covers every value in the promise_scope enum", () => {
    const missing = promiseScopeEnum.enumValues.filter((v) => !(v in PROMISE_SCOPE_LABELS));
    expect(missing).toEqual([]);
  });

  it("has no labels for scopes the enum does not define", () => {
    const known = new Set<string>(promiseScopeEnum.enumValues);
    const orphans = Object.keys(PROMISE_SCOPE_LABELS).filter((k) => !known.has(k));
    expect(orphans).toEqual([]);
  });
});

describe("promise labels never render a raw enum value", () => {
  it("has no underscores in any label", () => {
    for (const [key, label] of Object.entries({
      ...PROMISE_CATEGORY_LABELS,
      ...PROMISE_SCOPE_LABELS,
    })) {
      expect(label, `label for ${key}`).not.toMatch(/_/);
    }
  });
});

/**
 * The archive refuses to score promises. Nothing in the label vocabulary may
 * imply a verdict, because a label is what a reader sees before the quotation
 * and it would frame the quotation as judged.
 */
describe("promise labels stay neutral", () => {
  const VERDICT_WORDS =
    /\b(kept|broken|fulfilled|unfulfilled|failed|success|delivered|complete|pending|stalled)\b/i;

  it("names no outcome", () => {
    for (const [key, label] of Object.entries({
      ...PROMISE_CATEGORY_LABELS,
      ...PROMISE_SCOPE_LABELS,
    })) {
      expect(label, `label for ${key}`).not.toMatch(VERDICT_WORDS);
    }
  });
});
