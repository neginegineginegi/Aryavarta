import { and, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import { db, type Tx } from "@/lib/db";
import {
  elections,
  electionResults,
  electionSources,
  events,
  eventSources,
  revisions,
  sources,
  terms,
  termSources,
} from "@/lib/db/schema";
import {
  payloadSchemaFor,
  type AnyPayload,
  type ElectionPayload,
  type EventPayload,
  type SourceSnapshot,
  type TermPayload,
} from "@/lib/revisions/payloads";
import { snapshotEntity, snapshotsEqual } from "@/lib/revisions/snapshot";

/**
 * The approval transaction — the only code path that writes contributor
 * content into the live tables. See the build plan: FOR UPDATE lock,
 * re-validation, conflict re-check with explicit moderator acknowledgment,
 * source upsert by normalized URL, child-row replacement.
 */

export class ApplyError extends Error {
  constructor(
    public code: "NOT_FOUND" | "NOT_PENDING" | "CONFLICT" | "GONE" | "INVALID",
    message: string,
  ) {
    super(message);
    this.name = "ApplyError";
  }
}

export type ApprovedRevision = {
  revisionId: string;
  entityType: "term" | "election" | "event";
  entityId: string;
  stateId: string;
};

/** Upsert sources by normalized URL; returns ids aligned with the input order. */
async function upsertSources(tx: Tx, snapshots: SourceSnapshot[]): Promise<string[]> {
  const ids: string[] = [];
  for (const s of snapshots) {
    const inserted = await tx
      .insert(sources)
      .values({
        id: uuidv7(),
        title: s.title,
        url: s.url,
        publisher: s.publisher,
        publishedOn: s.publishedOn,
        accessedOn: s.accessedOn,
      })
      .onConflictDoNothing({ target: sources.url })
      .returning({ id: sources.id });
    if (inserted.length > 0) {
      ids.push(inserted[0].id);
    } else {
      const [existing] = await tx
        .select({ id: sources.id })
        .from(sources)
        .where(eq(sources.url, s.url));
      if (!existing) throw new ApplyError("INVALID", `Source upsert failed for ${s.url}`);
      ids.push(existing.id);
    }
  }
  return ids;
}

async function replaceTermSources(tx: Tx, termId: string, snaps: SourceSnapshot[]) {
  const ids = await upsertSources(tx, snaps);
  await tx.delete(termSources).where(eq(termSources.termId, termId));
  if (ids.length)
    await tx
      .insert(termSources)
      .values(ids.map((sourceId) => ({ termId, sourceId })))
      .onConflictDoNothing();
}

async function replaceElectionSources(tx: Tx, electionId: string, snaps: SourceSnapshot[]) {
  const ids = await upsertSources(tx, snaps);
  await tx.delete(electionSources).where(eq(electionSources.electionId, electionId));
  if (ids.length)
    await tx
      .insert(electionSources)
      .values(ids.map((sourceId) => ({ electionId, sourceId })))
      .onConflictDoNothing();
}

async function replaceEventSources(tx: Tx, eventId: string, snaps: SourceSnapshot[]) {
  const ids = await upsertSources(tx, snaps);
  await tx.delete(eventSources).where(eq(eventSources.eventId, eventId));
  if (ids.length)
    await tx
      .insert(eventSources)
      .values(ids.map((sourceId) => ({ eventId, sourceId })))
      .onConflictDoNothing();
}

function numericOrNull(v: number | null): string | null {
  return v == null ? null : v.toFixed(2);
}

export async function approveRevision(input: {
  revisionId: string;
  reviewerId: string;
  reviewNote?: string;
  acknowledgeConflict?: boolean;
}): Promise<ApprovedRevision> {
  return db.transaction(async (tx) => {
    // Lock the revision row: concurrent approve/reject of the same revision
    // serializes here, and the second transaction sees the final status.
    const [rev] = await tx
      .select()
      .from(revisions)
      .where(eq(revisions.id, input.revisionId))
      .for("update");
    if (!rev) throw new ApplyError("NOT_FOUND", "Revision not found.");
    if (rev.status !== "pending")
      throw new ApplyError("NOT_PENDING", `This revision is already ${rev.status}.`);

    // Re-validate the payload against the current schema — defense in depth
    // (the sources>=1 rule is enforced here as well as at proposal time).
    let payload: AnyPayload | null = null;
    if (rev.action !== "delete") {
      const parsed = payloadSchemaFor[rev.entityType].safeParse(rev.afterData);
      if (!parsed.success)
        throw new ApplyError("INVALID", "Stored payload no longer passes validation.");
      payload = parsed.data as AnyPayload;
    }

    // Conflict detection against the live row.
    if (rev.action === "create") {
      if (rev.entityType === "event") {
        const [row] = await tx
          .select({ status: events.status, deletedAt: events.deletedAt })
          .from(events)
          .where(eq(events.id, rev.entityId));
        if (!row || row.deletedAt)
          throw new ApplyError("GONE", "The staged event row is missing.");
        if (row.status !== "pending_review" && row.status !== "draft")
          throw new ApplyError("NOT_PENDING", "The staged event is not awaiting review.");
      } else {
        const live = await snapshotEntity(tx, rev.entityType, rev.entityId);
        if (live) throw new ApplyError("CONFLICT", "An entry with this id already exists.");
      }
    } else {
      const live = await snapshotEntity(tx, rev.entityType, rev.entityId);
      if (!live)
        throw new ApplyError("GONE", "The live entry no longer exists (deleted since proposal).");
      if (!snapshotsEqual(live, rev.beforeData) && !input.acknowledgeConflict) {
        throw new ApplyError(
          "CONFLICT",
          "The live entry has changed since this was proposed. Review the current version and approve again with the conflict acknowledged.",
        );
      }
    }

    // Apply.
    switch (rev.action) {
      case "create": {
        if (rev.entityType === "term") {
          const p = payload as TermPayload;
          await tx.insert(terms).values({
            id: rev.entityId,
            stateId: p.stateId,
            kind: p.kind,
            cmName: p.cmName,
            partyId: p.partyId,
            startDate: p.startDate,
            endDate: p.endDate,
            notes: p.notes,
          });
          await replaceTermSources(tx, rev.entityId, p.sources);
        } else if (rev.entityType === "election") {
          const p = payload as ElectionPayload;
          await tx.insert(elections).values({
            id: rev.entityId,
            stateId: p.stateId,
            scope: p.scope,
            assemblyNumber: p.assemblyNumber,
            electionDate: p.electionDate,
            resultSummary: p.resultSummary,
            totalSeats: p.totalSeats,
            turnoutPercent: numericOrNull(p.turnoutPercent),
          });
          if (p.results.length)
            await tx.insert(electionResults).values(
              p.results.map((r) => ({
                electionId: rev.entityId,
                partyId: r.partyId,
                seatsWon: r.seats,
                voteSharePercent: numericOrNull(r.voteSharePercent),
                seatsContested: r.seatsContested ?? null,
                allianceName: r.allianceName ?? null,
              })),
            );
          await replaceElectionSources(tx, rev.entityId, p.sources);
        } else {
          const p = payload as EventPayload;
          await tx
            .update(events)
            .set({
              stateId: p.stateId,
              year: p.year,
              eventDate: p.eventDate,
              type: p.type,
              title: p.title,
              description: p.description,
              status: "published",
              updatedAt: sql`now()`,
            })
            .where(eq(events.id, rev.entityId));
          await replaceEventSources(tx, rev.entityId, p.sources);
        }
        break;
      }
      case "update": {
        if (rev.entityType === "term") {
          const p = payload as TermPayload;
          await tx
            .update(terms)
            .set({
              kind: p.kind,
              cmName: p.cmName,
              partyId: p.partyId,
              startDate: p.startDate,
              endDate: p.endDate,
              notes: p.notes,
              updatedAt: sql`now()`,
            })
            .where(eq(terms.id, rev.entityId));
          await replaceTermSources(tx, rev.entityId, p.sources);
        } else if (rev.entityType === "election") {
          const p = payload as ElectionPayload;
          await tx
            .update(elections)
            .set({
              scope: p.scope,
              assemblyNumber: p.assemblyNumber,
              electionDate: p.electionDate,
              resultSummary: p.resultSummary,
              totalSeats: p.totalSeats,
              turnoutPercent: numericOrNull(p.turnoutPercent),
              updatedAt: sql`now()`,
            })
            .where(eq(elections.id, rev.entityId));
          await tx.delete(electionResults).where(eq(electionResults.electionId, rev.entityId));
          if (p.results.length)
            await tx.insert(electionResults).values(
              p.results.map((r) => ({
                electionId: rev.entityId,
                partyId: r.partyId,
                seatsWon: r.seats,
                voteSharePercent: numericOrNull(r.voteSharePercent),
                seatsContested: r.seatsContested ?? null,
                allianceName: r.allianceName ?? null,
              })),
            );
          await replaceElectionSources(tx, rev.entityId, p.sources);
        } else {
          const p = payload as EventPayload;
          await tx
            .update(events)
            .set({
              year: p.year,
              eventDate: p.eventDate,
              type: p.type,
              title: p.title,
              description: p.description,
              updatedAt: sql`now()`,
            })
            .where(eq(events.id, rev.entityId));
          await replaceEventSources(tx, rev.entityId, p.sources);
        }
        break;
      }
      case "delete": {
        // Soft delete: tombstone pages and history stay intact.
        if (rev.entityType === "term") {
          await tx
            .update(terms)
            .set({ deletedAt: sql`now()` })
            .where(eq(terms.id, rev.entityId));
        } else if (rev.entityType === "election") {
          await tx
            .update(elections)
            .set({ deletedAt: sql`now()` })
            .where(eq(elections.id, rev.entityId));
        } else {
          await tx
            .update(events)
            .set({ deletedAt: sql`now()` })
            .where(eq(events.id, rev.entityId));
        }
        break;
      }
    }

    await tx
      .update(revisions)
      .set({
        status: "approved",
        reviewedBy: input.reviewerId,
        reviewedAt: new Date(),
        reviewNote: input.reviewNote?.trim() || null,
      })
      .where(eq(revisions.id, rev.id));

    return {
      revisionId: rev.id,
      entityType: rev.entityType,
      entityId: rev.entityId,
      stateId: rev.stateId,
    };
  });
}

export async function rejectRevision(input: {
  revisionId: string;
  reviewerId: string;
  reviewNote: string;
}): Promise<ApprovedRevision> {
  const note = input.reviewNote.trim();
  if (note.length < 5)
    throw new ApplyError("INVALID", "A rejection reason (min 5 characters) is required.");

  return db.transaction(async (tx) => {
    const [rev] = await tx
      .select()
      .from(revisions)
      .where(eq(revisions.id, input.revisionId))
      .for("update");
    if (!rev) throw new ApplyError("NOT_FOUND", "Revision not found.");
    if (rev.status !== "pending")
      throw new ApplyError("NOT_PENDING", `This revision is already ${rev.status}.`);

    await tx
      .update(revisions)
      .set({
        status: "rejected",
        reviewedBy: input.reviewerId,
        reviewedAt: new Date(),
        reviewNote: note,
      })
      .where(eq(revisions.id, rev.id));

    // A rejected event-create marks its staged hidden row rejected too.
    if (rev.entityType === "event" && rev.action === "create") {
      await tx
        .update(events)
        .set({ status: "rejected" })
        .where(and(eq(events.id, rev.entityId), eq(events.status, "pending_review")));
    }

    return {
      revisionId: rev.id,
      entityType: rev.entityType,
      entityId: rev.entityId,
      stateId: rev.stateId,
    };
  });
}
