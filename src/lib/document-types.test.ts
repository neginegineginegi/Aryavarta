import { describe, expect, it } from "vitest";

import { documentTypeEnum } from "@/lib/db/schema";
import { DOCUMENT_TYPE_LABELS } from "@/lib/format";

/**
 * The media archive renders a human label for every document type. A new enum
 * member added without a label would silently render its raw snake_case value
 * in the browse table, so the two lists are pinned together here.
 */
describe("document type labels", () => {
  it("covers every value in the document_type enum", () => {
    const missing = documentTypeEnum.enumValues.filter((v) => !(v in DOCUMENT_TYPE_LABELS));
    expect(missing).toEqual([]);
  });

  it("has no labels for types the enum does not define", () => {
    const known = new Set<string>(documentTypeEnum.enumValues);
    const orphans = Object.keys(DOCUMENT_TYPE_LABELS).filter((k) => !known.has(k));
    expect(orphans).toEqual([]);
  });

  it("never renders a raw snake_case value as a label", () => {
    for (const [key, label] of Object.entries(DOCUMENT_TYPE_LABELS)) {
      expect(label, `label for ${key}`).not.toMatch(/_/);
    }
  });
});
