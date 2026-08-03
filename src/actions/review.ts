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
