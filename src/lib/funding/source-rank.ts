import type { sourceKindEnum } from "@/lib/db/schema";

export type SourceKind = (typeof sourceKindEnum.enumValues)[number];

/**
 * The source hierarchy, as a function rather than a stored column.
 *
 * Two reasons it lives here. It has to be revisable without a migration, and
 * it has to be readable: a reader who wants to know why one citation is shown
 * above another can be pointed at this file rather than at a number in a row.
 *
 * Rank orders evidence in the interface. It does NOT gate what may be
 * recorded. A newspaper report is a legitimate source for an `alleged` claim,
 * and the honest outcome is to show the claim, its status and its source
 * together, not to suppress it for ranking low.
 */
const RANK: Record<SourceKind, number> = {
  // 1. Government records
  gazette: 1,
  ministry_report: 1,
  eci_report: 1,
  // 2. Courts
  court_judgment: 2,
  // 3. Regulatory filings
  regulatory_filing: 3,
  // 4. FCRA
  fcra_filing: 4,
  // 5. Audited financial statements
  audited_statement: 5,
  // 6. Annual reports
  annual_report: 6,
  // 7. Corporate filings
  corporate_filing: 7,
  // 8. Official organisational documents
  org_document: 8,
  cag_report: 2, // an audit finding of a constitutional auditor, not a company's own report
  budget_document: 3,
  // 9. Grant databases
  grant_database: 9,
  // 10. Parliamentary records
  parliamentary_record: 10,
  assembly_record: 10,
  // 11. RTI
  rti_response: 11,
  // 12. Journalism
  news: 12,
  // 13. Academic research
  research: 13,
  // 14. Organisational statements
  org_statement: 14,
  press_release: 14,
  manifesto: 14,
  // 15. Social media
  social_media: 15,
  other: 16,
};

/** Lower is stronger. An unclassified source sorts last, never first. */
export function sourceRank(kind: SourceKind | null | undefined): number {
  return kind ? RANK[kind] : 99;
}

/**
 * `verified` is reserved for evidence someone can check directly, so it
 * requires a source from the primary tiers. A claim carrying only journalism
 * or an organisation's own statement is at best `documented`, whatever the
 * person entering it believes.
 */
export const VERIFIED_MAX_RANK = 8;

export function canBeVerified(kinds: Array<SourceKind | null | undefined>): boolean {
  return kinds.some((k) => sourceRank(k) <= VERIFIED_MAX_RANK);
}

/** Strongest first, for rendering a citation list. */
export function bySourceStrength<T extends { kind?: SourceKind | null }>(a: T, b: T): number {
  return sourceRank(a.kind) - sourceRank(b.kind);
}
