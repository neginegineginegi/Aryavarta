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
  other: "Other",
};

export const EVENT_TYPE_ORDER: EventType[] = [
  "corruption",
  "paper_leak",
  "governance_failure",
  "policy_failure",
  "communal_incident",
  "infrastructure_failure",
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
