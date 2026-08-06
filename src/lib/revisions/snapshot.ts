import { eq } from "drizzle-orm";

import type { Db, Tx } from "@/lib/db";
import {
  canonicalizeElection,
  canonicalizeEvent,
  canonicalizeTerm,
  type ElectionPayload,
  type EntityType,
  type EventPayload,
  type SourceSnapshot,
  type TermPayload,
} from "@/lib/revisions/payloads";

/**
 * Canonical snapshot builders. THE single way a live entity is rendered into
 * payload form — used to produce before_data at proposal time, to re-check
 * for conflicts at approval time, and to render diffs. Volatile columns
 * (created_at, updated_at, deleted_at, search_tsv) are deliberately absent;
 * lists are canonically sorted so deepEqual(a, b) is meaningful.
 *
 * Returns null when the entity does not exist or is soft-deleted.
 */

type DbLike = Db | Tx;

function toSourceSnapshot(s: {
  id: string;
  title: string;
  url: string;
  publisher: string | null;
  publishedOn: string | null;
  accessedOn: string | null;
}): SourceSnapshot {
  return {
    id: s.id,
    title: s.title,
    url: s.url,
    publisher: s.publisher,
    publishedOn: s.publishedOn,
    accessedOn: s.accessedOn,
  };
}

export async function snapshotTerm(db: DbLike, termId: string): Promise<TermPayload | null> {
  const row = await db.query.terms.findFirst({
    where: (t) => eq(t.id, termId),
    with: { sources: { with: { source: true } } },
  });
  if (!row || row.deletedAt) return null;
  return canonicalizeTerm({
    stateId: row.stateId,
    kind: row.kind,
    cmName: row.cmName,
    partyId: row.partyId,
    startDate: row.startDate,
    endDate: row.endDate,
    notes: row.notes,
    sources: row.sources.map((s) => toSourceSnapshot(s.source)),
  });
}

export async function snapshotElection(
  db: DbLike,
  electionId: string,
): Promise<ElectionPayload | null> {
  const row = await db.query.elections.findFirst({
    where: (e) => eq(e.id, electionId),
    with: {
      results: true,
      sources: { with: { source: true } },
    },
  });
  if (!row || row.deletedAt) return null;
  return canonicalizeElection({
    stateId: row.stateId,
    scope: row.scope,
    assemblyNumber: row.assemblyNumber,
    electionDate: row.electionDate,
    resultSummary: row.resultSummary,
    totalSeats: row.totalSeats,
    turnoutPercent: row.turnoutPercent == null ? null : Number(row.turnoutPercent),
    results: row.results.map((r) => ({
      partyId: r.partyId,
      seats: r.seatsWon,
      voteSharePercent: r.voteSharePercent == null ? null : Number(r.voteSharePercent),
      seatsContested: r.seatsContested ?? null,
      allianceName: r.allianceName ?? null,
    })),
    sources: row.sources.map((s) => toSourceSnapshot(s.source)),
  });
}

export async function snapshotEvent(db: DbLike, eventId: string): Promise<EventPayload | null> {
  const row = await db.query.events.findFirst({
    where: (e) => eq(e.id, eventId),
    with: { sources: { with: { source: true } } },
  });
  if (!row || row.deletedAt) return null;
  return canonicalizeEvent({
    stateId: row.stateId,
    year: row.year,
    eventDate: row.eventDate,
    type: row.type,
    title: row.title,
    description: row.description,
    sources: row.sources.map((s) => toSourceSnapshot(s.source)),
  });
}

export function snapshotEntity(
  db: DbLike,
  entityType: EntityType,
  entityId: string,
): Promise<TermPayload | ElectionPayload | EventPayload | null> {
  switch (entityType) {
    case "term":
      return snapshotTerm(db, entityId);
    case "election":
      return snapshotElection(db, entityId);
    case "event":
      return snapshotEvent(db, entityId);
  }
}

/**
 * Deep equality over canonical payloads. Source `id` fields are ignored:
 * a proposal that re-cites the same normalized URL matches the live source
 * row regardless of whether the submitter knew its id.
 *
 * Keys are sorted recursively before comparison: stored snapshots round-trip
 * through Postgres jsonb, which rewrites object key order, so a raw
 * JSON.stringify comparison would false-flag a conflict on every approval.
 */
export function snapshotsEqual(a: unknown, b: unknown): boolean {
  return (
    JSON.stringify(sortKeysDeep(stripSourceIds(a))) ===
    JSON.stringify(sortKeysDeep(stripSourceIds(b)))
  );
}

function sortKeysDeep(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  const rec = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(rec).sort()) {
    // Null and absent are the same statement in canonical payloads. Dropping
    // nulls here keeps payloads comparable across additive schema growth:
    // an old snapshot without a field must equal a new one carrying null.
    if (rec[k] === null || rec[k] === undefined) continue;
    out[k] = sortKeysDeep(rec[k]);
  }
  return out;
}

function stripSourceIds(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(stripSourceIds);
  const o = { ...(v as Record<string, unknown>) };
  if ("sources" in o && Array.isArray(o.sources)) {
    o.sources = o.sources.map((s) =>
      s && typeof s === "object" ? { ...(s as Record<string, unknown>), id: undefined } : s,
    );
  }
  return o;
}
