"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { v7 as uuidv7 } from "uuid";

import { AuthzError, requireRole } from "@/lib/authz";
import { tags } from "@/lib/cache";
import { db } from "@/lib/db";
import { revisions, states } from "@/lib/db/schema";
import { ApplyError, approveRevision } from "@/lib/revisions/apply";
import { snapshotEntity } from "@/lib/revisions/snapshot";
import type {
  AnyPayload,
  ElectionPayload,
  EntityType,
  EventPayload,
  PromisePayload,
  TermPayload,
} from "@/lib/revisions/payloads";
import { yearOf } from "@/lib/format";

/** The union pseudo-state; national records hang off it. */
const UNION_STATE_ID = "in";

function deriveTitle(entityType: EntityType, payload: AnyPayload, stateName: string): string {
  switch (entityType) {
    case "event":
      return (payload as EventPayload).title;
    case "term": {
      const p = payload as TermPayload;
      const who = p.kind === "presidents_rule" ? "President's Rule" : p.cmName;
      return `${who}, ${stateName} (${yearOf(p.startDate)} – ${p.endDate ? yearOf(p.endDate) : "present"})`;
    }
    case "election": {
      const p = payload as ElectionPayload;
      const what = p.scope === "lok_sabha" ? "Lok Sabha election" : `Assembly election, ${stateName}`;
      return `${what}, ${yearOf(p.electionDate)}`;
    }
    case "manifesto_promise": {
      const p = payload as PromisePayload;
      const quoted = p.officialText.length > 80 ? `${p.officialText.slice(0, 77)}…` : p.officialText;
      return `Promise: ${quoted}`;
    }
  }
}

/**
 * Admin-only one-click removal of a live entry, from the public site itself.
 *
 * This does NOT bypass the revision system: it records a delete revision
 * (before-snapshot and all) and approves it in the same request, with the
 * admin as both proposer and reviewer. The entry becomes a tombstone; its
 * page, history, and this removal all stay on the public record.
 */
export async function adminRemoveEntryAction(formData: FormData): Promise<void> {
  const entityType = String(formData.get("entityType") ?? "") as EntityType;
  const entityId = String(formData.get("entityId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const rawNext = String(formData.get("next") ?? "/");
  // Same-site relative paths only; anything else falls back to home.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const back = (q: string) => `${next}${next.includes("?") ? "&" : "?"}${q}`;

  let admin;
  try {
    admin = await requireRole("admin");
  } catch (e) {
    if (e instanceof AuthzError) redirect(`/login?next=${encodeURIComponent(next)}`);
    throw e;
  }

  if (!["term", "election", "event", "manifesto_promise"].includes(entityType) || !entityId) {
    redirect(back("removed=invalid"));
  }

  const before = (await snapshotEntity(db, entityType, entityId)) as AnyPayload | null;
  if (!before) redirect(back("removed=gone"));

  // A promise may be national, where the three original entity types always
  // had a state. Revisions require one, so national records ride the union
  // pseudo-state 'in' — the same convention Lok Sabha elections and PM terms
  // already use, rather than making an existing column nullable.
  const stateId = ("stateId" in before ? before.stateId : null) ?? UNION_STATE_ID;
  const state = await db.query.states.findFirst({ where: eq(states.id, stateId) });
  const revisionId = uuidv7();

  await db.insert(revisions).values({
    id: revisionId,
    entityType,
    entityId,
    stateId,
    action: "delete",
    schemaVersion: 1,
    beforeData: before,
    afterData: null,
    title: deriveTitle(entityType, before, state?.name ?? stateId),
    summary: `[admin removal] ${reason || "Removed from the live record by an administrator."}`,
    status: "pending",
    proposedBy: admin.id,
  });

  try {
    const rev = await approveRevision({
      revisionId,
      reviewerId: admin.id,
      reviewNote: reason || "Admin removal from the live site.",
      acknowledgeConflict: false,
    });
    updateTag(tags.state(rev.stateId));
    if (rev.entityType === "term") updateTag(tags.mapData);
    if (rev.entityType === "event") updateTag(tags.event(rev.entityId));
    if (rev.entityType === "election") updateTag(tags.election(rev.entityId));
  } catch (e) {
    if (e instanceof ApplyError) {
      // Nothing was published; take the never-approved delete revision back
      // out so a failed one-click removal leaves no litter in the queue.
      await db.delete(revisions).where(eq(revisions.id, revisionId));
      redirect(back(`removed=${e.code.toLowerCase()}`));
    }
    throw e;
  }

  redirect(back("removed=1"));
}
