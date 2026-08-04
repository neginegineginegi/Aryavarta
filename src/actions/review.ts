"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { AuthzError, requireRole } from "@/lib/authz";
import { tags } from "@/lib/cache";
import {
  ApplyError,
  approveRevision as applyApprove,
  rejectRevision as applyReject,
  type ApprovedRevision,
} from "@/lib/revisions/apply";

function revalidateFor(rev: ApprovedRevision) {
  // updateTag = server-action revalidation with read-your-own-writes: the
  // moderator sees the published change immediately after the redirect.
  updateTag(tags.state(rev.stateId));
  if (rev.entityType === "term") updateTag(tags.mapData);
  if (rev.entityType === "event") updateTag(tags.event(rev.entityId));
  if (rev.entityType === "election") updateTag(tags.election(rev.entityId));
}

/**
 * Form-action entrypoints for the review UI. Outcomes are communicated by
 * redirecting back with a status query — the review pages are fully
 * server-rendered, so no client state is involved.
 */

export async function approveRevisionAction(formData: FormData): Promise<void> {
  const revisionId = String(formData.get("revisionId") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "");
  const acknowledgeConflict = formData.get("acknowledgeConflict") === "on";

  let reviewer;
  try {
    reviewer = await requireRole("moderator");
  } catch (e) {
    if (e instanceof AuthzError) redirect("/login?next=/review");
    throw e;
  }

  let outcome: string;
  try {
    const rev = await applyApprove({
      revisionId,
      reviewerId: reviewer.id,
      reviewNote,
      acknowledgeConflict,
    });
    revalidateFor(rev);
    outcome = "approved";
  } catch (e) {
    if (e instanceof ApplyError) {
      redirect(`/review/${revisionId}?error=${e.code.toLowerCase()}`);
    }
    throw e;
  }
  redirect(`/review?done=${outcome}`);
}

/**
 * Moderator strengthens a pending draft's citations before approving —
 * e.g. replacing/augmenting an import's Wikidata reference with the ECI
 * statistical report or gazette notification. The amendment is recorded in
 * the revision's edit summary, so provenance stays honest.
 */
export async function amendRevisionSourcesAction(formData: FormData): Promise<void> {
  const revisionId = String(formData.get("revisionId") ?? "");
  let reviewer;
  try {
    reviewer = await requireRole("moderator");
  } catch (e) {
    if (e instanceof AuthzError) redirect("/login?next=/review");
    throw e;
  }

  const { db } = await import("@/lib/db");
  const { revisions } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { sourceSnapshotSchema, canonicalizeSources } = await import("@/lib/revisions/payloads");

  const parsed = sourceSnapshotSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    url: String(formData.get("url") ?? ""),
    publisher: String(formData.get("publisher") ?? "") || null,
    publishedOn: String(formData.get("publishedOn") ?? "") || null,
    accessedOn: new Date().toISOString().slice(0, 10),
  });
  if (!parsed.success) {
    redirect(`/review/${revisionId}?error=bad_source`);
  }

  const rev = await db.query.revisions.findFirst({ where: eq(revisions.id, revisionId) });
  if (!rev || rev.status !== "pending" || !rev.afterData) {
    redirect(`/review/${revisionId}?error=not_pending`);
  }

  const after = rev.afterData as { sources?: Array<{ url: string }> } & Record<string, unknown>;
  const existing = Array.isArray(after.sources) ? after.sources : [];
  if (existing.some((s) => s.url === parsed.data.url)) {
    redirect(`/review/${revisionId}?error=duplicate_source`);
  }

  await db
    .update(revisions)
    .set({
      afterData: {
        ...after,
        sources: canonicalizeSources([...existing, parsed.data] as typeof existing),
      },
      summary: rev.summary.includes("[sources strengthened at review")
        ? rev.summary
        : `${rev.summary} [sources strengthened at review by ${reviewer.name ?? "a moderator"}]`,
    })
    .where(eq(revisions.id, revisionId));

  redirect(`/review/${revisionId}?added=1`);
}

export async function rejectRevisionAction(formData: FormData): Promise<void> {
  const revisionId = String(formData.get("revisionId") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "");

  let reviewer;
  try {
    reviewer = await requireRole("moderator");
  } catch (e) {
    if (e instanceof AuthzError) redirect("/login?next=/review");
    throw e;
  }

  try {
    await applyReject({ revisionId, reviewerId: reviewer.id, reviewNote });
  } catch (e) {
    if (e instanceof ApplyError) {
      redirect(`/review/${revisionId}?error=${e.code.toLowerCase()}`);
    }
    throw e;
  }
  redirect(`/review?done=rejected`);
}
