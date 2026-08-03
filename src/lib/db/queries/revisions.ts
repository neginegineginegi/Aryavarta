import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { revisions, users } from "@/lib/db/schema";

/** Pending queue for moderators, optionally filtered by state. */
export async function getPendingQueue(stateId?: string) {
  return db.query.revisions.findMany({
    where: stateId
      ? and(eq(revisions.status, "pending"), eq(revisions.stateId, stateId))
      : eq(revisions.status, "pending"),
    orderBy: [desc(revisions.createdAt)],
    limit: 100,
    with: {
      state: { columns: { id: true, name: true } },
      proposer: { columns: { id: true, name: true } },
    },
  });
}

/** One revision with everything the diff view needs. */
export async function getRevisionDetail(revisionId: string) {
  return db.query.revisions.findFirst({
    where: eq(revisions.id, revisionId),
    with: {
      state: { columns: { id: true, name: true } },
      proposer: { columns: { id: true, name: true } },
      reviewer: { columns: { id: true, name: true } },
    },
  });
}

/** Full history for one entity (all statuses — the public record). */
export async function getEntityHistory(entityType: "term" | "election" | "event", entityId: string) {
  return db.query.revisions.findMany({
    where: and(eq(revisions.entityType, entityType), eq(revisions.entityId, entityId)),
    orderBy: [desc(revisions.createdAt)],
    limit: 200,
    with: {
      proposer: { columns: { id: true, name: true } },
      reviewer: { columns: { id: true, name: true } },
    },
  });
}

/** Every revision touching a state (the state's changelog). */
export async function getStateHistory(stateId: string) {
  return db.query.revisions.findMany({
    where: eq(revisions.stateId, stateId),
    orderBy: [desc(revisions.createdAt)],
    limit: 200,
    with: {
      proposer: { columns: { id: true, name: true } },
      reviewer: { columns: { id: true, name: true } },
    },
  });
}

/** A user's public profile plus their revision history. Dynamic, not cached. */
export async function getUserProfile(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, name: true, role: true, createdAt: true },
  });
  if (!user) return null;
  const rows = await db.query.revisions.findMany({
    where: eq(revisions.proposedBy, userId),
    orderBy: [desc(revisions.createdAt)],
    limit: 200,
    with: { state: { columns: { id: true, name: true } } },
  });
  return { user, revisions: rows };
}

/** The signed-in user's own submissions for the contribute hub. */
export async function getOwnRevisions(userId: string) {
  return db.query.revisions.findMany({
    where: eq(revisions.proposedBy, userId),
    orderBy: [desc(revisions.createdAt)],
    limit: 50,
    with: { state: { columns: { id: true, name: true } } },
  });
}

export function revisionEntityHref(rev: {
  entityType: string;
  entityId: string;
  stateId: string;
}): string {
  switch (rev.entityType) {
    case "event":
      return `/event/${rev.entityId}`;
    default:
      // Terms and elections render inside their state page.
      return `/state/${rev.stateId}`;
  }
}
