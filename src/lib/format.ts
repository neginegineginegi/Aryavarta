import type { schema } from "@/lib/db";

export type EventType = (typeof schema.eventTypeEnum.enumValues)[number];
export type EventStatus = (typeof schema.eventStatusEnum.enumValues)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  paper_leak: "Paper leak",
  governance_failure: "Governance failure",
  corruption: "Corruption",
  policy_failure: "Policy failure",
  communal_incident: "Communal incident",
  infrastructure_failure: "Infrastructure failure",
  cabinet_change: "Cabinet formation / reshuffle",
  legislation: "Major legislation",
  constitutional_amendment: "Constitutional amendment",
  court_judgment: "Court judgment",
  coalition_change: "Coalition change",
  welfare_scheme: "Welfare scheme",
  infrastructure_project: "Infrastructure project",
  natural_disaster: "Natural disaster",
  administrative_reform: "Administrative reform",
  international_agreement: "International agreement",
  other: "Other",
};

/** Display order for grouped event listings: governance record first, then
    institutional milestones, then failures and incidents. */
export const EVENT_TYPE_ORDER: EventType[] = [
  "cabinet_change",
  "coalition_change",
  "legislation",
  "constitutional_amendment",
  "court_judgment",
  "welfare_scheme",
  "infrastructure_project",
  "administrative_reform",
  "international_agreement",
  "corruption",
  "paper_leak",
  "governance_failure",
  "policy_failure",
  "communal_incident",
  "infrastructure_failure",
  "natural_disaster",
  "other",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** '2014-06-02' → '2 June 2014' (Indian-style day-first). */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function yearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}

/** Range like '1996 – 2001' or '2021 – present'. */
export function formatTermRange(startDate: string, endDate: string | null): string {
  return `${formatDate(startDate)} – ${endDate ? formatDate(endDate) : "present"}`;
}

export function formatNumber(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-IN");
}


/**
 * Human labels for the media archive's document types. Keys mirror the
 * document_type enum; a missing key falls back to the raw value so a new enum
 * member never renders blank.
 */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  manifesto: "Manifesto",
  press_conference: "Press conference",
  party_advertisement: "Advertisement",
  campaign_speech: "Campaign speech",
  debate_transcript: "Debate transcript",
  election_symbol: "Election symbol",
  candidate_affidavit: "Candidate affidavit",
  press_release: "Press release",
  government_notification: "Notification",
  gazette: "Gazette",
  cag_report: "CAG report",
  assembly_debate: "Assembly debate",
  parliamentary_debate: "Parliamentary debate",
  court_judgment: "Court judgment",
  eci_order: "ECI order",
  delimitation_report: "Delimitation report",
  coalition_agreement: "Coalition agreement",
  white_paper: "White paper",
  budget_speech: "Budget speech",
  economic_survey: "Economic Survey",
  five_year_plan: "Five-Year Plan",
  committee_report: "Committee report",
  other: "Document",
};

/**
 * What kind of artefact a source is. A factual classification of the
 * document, not a rating of it: the archive never scores its sources.
 */
export const SOURCE_KIND_LABELS: Record<string, string> = {
  gazette: "Gazette",
  eci_report: "ECI report",
  cag_report: "CAG report",
  court_judgment: "Court judgment",
  assembly_record: "Assembly record",
  budget_document: "Budget document",
  ministry_report: "Ministry report",
  press_release: "Press release",
  manifesto: "Manifesto",
  news: "News report",
  research: "Research",
  rti_response: "RTI response",
  other: "Other",
};

/**
 * Subject headings for manifesto promises. These describe what a promise is
 * about, nothing more: they are filing labels, not a scoring rubric.
 */
export const PROMISE_CATEGORY_LABELS: Record<string, string> = {
  education: "Education",
  healthcare: "Healthcare",
  employment: "Employment",
  agriculture: "Agriculture",
  infrastructure: "Infrastructure",
  women: "Women",
  youth: "Youth",
  economy: "Economy",
  law_and_order: "Law and order",
  environment: "Environment",
  digital: "Digital",
  social_welfare: "Social welfare",
  other: "Other",
};

/** How wide a promise reaches, as the manifesto itself states it. */
export const PROMISE_SCOPE_LABELS: Record<string, string> = {
  national: "National",
  state: "State",
  district: "District",
  constituency: "Constituency",
  unspecified: "Scope unstated",
};
