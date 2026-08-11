/**
 * The words the graph uses.
 *
 * Kept in one file because the phrasing is the safeguard. An edge label is the
 * shortest thing a reader sees, and it is where an accusation would slip in
 * first: "funded to oppose" instead of "funded", "controls" instead of "holds a
 * stake in". Every phrase below states the recorded relation and stops.
 *
 * Interpretive edges (claims) never get a bare verb. They read as assertions,
 * because that is what they are.
 */

export const NODE_TYPE_LABELS: Record<string, string> = {
  org: "Organisation",
  person: "Person",
  project: "Project",
  campaign: "Campaign",
  legal_case: "Legal case",
  publication: "Publication",
  outcome: "Outcome",
  party: "Political party",
  state: "State",
};

export const ORG_KIND_LABELS: Record<string, string> = {
  ngo: "NGO",
  trust: "Trust",
  society: "Society",
  foundation: "Foundation",
  think_tank: "Think tank",
  advocacy: "Advocacy group",
  media: "Media organisation",
  research: "Research organisation",
  company: "Company",
  government_body: "Government body",
  political: "Political organisation",
  international: "International organisation",
  religious: "Religious organisation",
  professional_body: "Professional body",
  other: "Organisation",
};

/** Reads as "A <label> B". Present tense only where the relation is ongoing. */
export const EDGE_KIND_LABELS: Record<string, string> = {
  // generic factual relations
  funded: "funded",
  founded: "founded",
  owns: "owns",
  sits_on_board: "sits on the board of",
  employed_by: "was employed by",
  partnered_with: "partnered with",
  member_of: "is a member of",
  advised: "advised",
  published: "published",
  filed_case_against: "filed a case against",
  targeted: "named as a subject by",
  successor_of: "is the successor of",
  campaigned_for: "campaigned in support of",
  campaigned_against: "campaigned against",
  campaigned_regarding: "campaigned regarding",
  operates: "operates",
  participated_in: "took part in",
  party_to_case: "is a party to",
  outcome_recorded_for: "has a recorded outcome",
  parent_of: "is the parent organisation of",
  // board roles, projected from board_positions
  founder: "founded",
  trustee: "is a trustee of",
  director: "is a director of",
  board_member: "sits on the board of",
  chairperson: "chairs",
  editor: "is an editor at",
  chief_executive: "is chief executive of",
  secretary: "is secretary of",
  treasurer: "is treasurer of",
  advisor: "advises",
  employee: "is employed by",
  spokesperson: "speaks for",
};

/**
 * Claim types, phrased as assertions.
 *
 * Never "controls" or "coordinated with". A claim is something somebody says,
 * and the label has to carry that or the graph turns an assertion into a fact
 * at the exact moment a reader glances at it.
 */
export const CLAIM_KIND_LABELS: Record<string, string> = {
  funding: "is said to have funded",
  control: "is said to control",
  coordination: "is said to have coordinated with",
  influence: "is said to have influenced",
  affiliation: "is said to be affiliated with",
  conflict_of_interest: "is said to have a conflict of interest with",
  outcome_attribution: "is said to have produced",
  misconduct: "is the subject of an allegation concerning",
  other: "is the subject of a claim concerning",
};

export function edgeLabel(kind: string, interpretive: boolean): string {
  if (interpretive) return CLAIM_KIND_LABELS[kind] ?? CLAIM_KIND_LABELS.other;
  return EDGE_KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}

export const EVIDENCE_LABELS: Record<string, string> = {
  verified: "Verified",
  documented: "Documented",
  alleged: "Alleged",
  disputed: "Disputed",
  inferred: "Inferred",
  unknown: "Unknown",
};

/**
 * What each status means, in one sentence, shown wherever a status is.
 *
 * A coloured dot on its own teaches a reader nothing and lets them assume the
 * worst reading. These sentences are the difference between a legend and an
 * explanation.
 */
export const EVIDENCE_MEANING: Record<string, string> = {
  verified: "Directly supported by a primary source that someone has read.",
  documented: "Supported by credible sourcing, not independently checked.",
  alleged: "Someone has asserted this. The panel names who.",
  disputed: "Contested by another party or another source.",
  inferred: "Suggested by several pieces of evidence, documented by none of them.",
  unknown: "Not enough evidence either way.",
};

/**
 * Display order, weakest last, so a list of edges puts what can be checked
 * above what cannot.
 */
const EVIDENCE_ORDER = ["verified", "documented", "disputed", "alleged", "inferred", "unknown"];

export function evidenceRank(status: string): number {
  const i = EVIDENCE_ORDER.indexOf(status);
  return i === -1 ? EVIDENCE_ORDER.length : i;
}

/** Rupees and other currencies, at the scale filings actually use. */
export function formatAmount(amount: string | null, currency: string | null): string | null {
  if (!amount) return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  const cur = currency ?? "";
  if (cur === "INR") {
    // Two decimals, then drop the zeros that carry no information: 2.50 crore
    // is 2.5 crore, and 50.00 lakh is 50 lakh.
    const trim = (v: number) =>
      v.toFixed(2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    if (n >= 1e7) return `₹${trim(n / 1e7)} crore`;
    if (n >= 1e5) return `₹${trim(n / 1e5)} lakh`;
    return `₹${n.toLocaleString("en-IN")}`;
  }
  const formatted = n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return cur ? `${cur} ${formatted}` : formatted;
}

/** "2016 to 2019", "since 2014", "2018". Null when the archive holds no dates. */
export function formatPeriod(yearFrom: number | null, yearTo: number | null): string | null {
  if (yearFrom == null && yearTo == null) return null;
  if (yearFrom != null && yearTo == null) return `since ${yearFrom}`;
  if (yearFrom == null && yearTo != null) return `until ${yearTo}`;
  if (yearFrom === yearTo) return String(yearFrom);
  return `${yearFrom} to ${yearTo}`;
}
