import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { revisions, users } from "@/lib/db/schema";

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
