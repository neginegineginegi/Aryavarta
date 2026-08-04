import { diffWords } from "diff";

import type {
  AnyPayload,
  ElectionPayload,
  EntityType,
  SourceSnapshot,
} from "@/lib/revisions/payloads";

/**
 * Pure diff functions for the review UI. Both inputs are canonical payloads
 * (see snapshot.ts); party/state ids are resolved to display names at render
 * time, not here.
 */

export type ScalarDiffRow = {
  field: string;
  label: string;
  before: string | number | null;
  after: string | number | null;
  changed: boolean;
  /** Render with word-level diff highlighting (long prose fields). */
  prose: boolean;
};

const FIELD_DEFS: Record<EntityType, Array<{ field: string; label: string; prose?: boolean }>> = {
  event: [
    { field: "stateId", label: "State" },
    { field: "year", label: "Year" },
    { field: "eventDate", label: "Exact date" },
    { field: "type", label: "Type" },
    { field: "title", label: "Title", prose: true },
    { field: "description", label: "Description", prose: true },
  ],
  term: [
    { field: "stateId", label: "State" },
    { field: "kind", label: "Kind" },
    { field: "cmName", label: "Chief Minister" },
    { field: "partyId", label: "Party" },
    { field: "startDate", label: "Start date" },
    { field: "endDate", label: "End date" },
    { field: "notes", label: "Notes", prose: true },
  ],
  election: [
    { field: "stateId", label: "State" },
    { field: "scope", label: "Scope" },
    { field: "assemblyNumber", label: "Assembly number" },
    { field: "electionDate", label: "Election date" },
    { field: "totalSeats", label: "Total seats" },
    { field: "turnoutPercent", label: "Turnout %" },
    { field: "resultSummary", label: "Result summary", prose: true },
  ],
};

export function diffScalars(
  entityType: EntityType,
  before: AnyPayload | null,
  after: AnyPayload | null,
): ScalarDiffRow[] {
  const defs = FIELD_DEFS[entityType];
  return defs.map(({ field, label, prose }) => {
    const b = (before as Record<string, unknown> | null)?.[field] ?? null;
    const a = (after as Record<string, unknown> | null)?.[field] ?? null;
    return {
      field,
      label,
      before: b as string | number | null,
      after: a as string | number | null,
      changed: b !== a,
      prose: !!prose,
    };
  });
}

export type SourceDiff = {
  added: SourceSnapshot[];
  removed: SourceSnapshot[];
  kept: SourceSnapshot[];
};

export function diffSources(
  before: SourceSnapshot[] | undefined,
  after: SourceSnapshot[] | undefined,
): SourceDiff {
  const b = before ?? [];
  const a = after ?? [];
  const bUrls = new Set(b.map((s) => s.url));
  const aUrls = new Set(a.map((s) => s.url));
  return {
    added: a.filter((s) => !bUrls.has(s.url)),
    removed: b.filter((s) => !aUrls.has(s.url)),
    kept: a.filter((s) => bUrls.has(s.url)),
  };
}

export type ResultDiffRow = {
  partyId: string;
  beforeSeats: number | null;
  afterSeats: number | null;
  changed: boolean;
};

export function diffResults(
  before: ElectionPayload["results"] | undefined,
  after: ElectionPayload["results"] | undefined,
): ResultDiffRow[] {
  const b = new Map((before ?? []).map((r) => [r.partyId, r.seats]));
  const a = new Map((after ?? []).map((r) => [r.partyId, r.seats]));
  const partyIds = [...new Set([...b.keys(), ...a.keys()])].sort();
  return partyIds.map((partyId) => {
    const beforeSeats = b.has(partyId) ? b.get(partyId)! : null;
    const afterSeats = a.has(partyId) ? a.get(partyId)! : null;
    return { partyId, beforeSeats, afterSeats, changed: beforeSeats !== afterSeats };
  });
}

export type TextSegment = { text: string; kind: "same" | "added" | "removed" };

/** Word-level diff for prose fields, ready to render as ins/del spans. */
export function diffProse(before: string | null, after: string | null): TextSegment[] {
  const b = before ?? "";
  const a = after ?? "";
  if (b === a) return [{ text: a, kind: "same" }];
  return diffWords(b, a).map((part) => ({
    text: part.value,
    kind: part.added ? "added" : part.removed ? "removed" : "same",
  }));
}
