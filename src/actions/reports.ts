"use server";

import { and, count, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { v7 as uuidv7 } from "uuid";

import { db } from "@/lib/db";
import { events, reports } from "@/lib/db/schema";
import { getSessionUser, requireRole, AuthzError } from "@/lib/authz";
import { RATE_LIMIT_MESSAGE, rateLimit } from "@/lib/rate-limit";
import { tags } from "@/lib/cache";

export type OpenReportResult = { ok: true } | { ok: false; error: string };

const MAX_OPEN_PER_ENTITY = 20;

/**
 * Open a report/dispute against an entity. Anonymous reporting is allowed by
 * design (the "talk page" must not require an account); anonymous reporters
 * may leave an optional contact address.
 */
export async function openReport(input: {
  entityType: "term" | "election" | "event";
  entityId: string;
  kind: "issue" | "dispute";
  reason: string;
  reporterContact?: string;
}): Promise<OpenReportResult> {
  if (!["term", "election", "event"].includes(input.entityType))
    return { ok: false, error: "Unknown entity type." };
  if (!["issue", "dispute"].includes(input.kind))
    return { ok: false, error: "Unknown report kind." };
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 20 || reason.length > 4000)
    return { ok: false, error: "Please describe the problem (20–4000 characters)." };
  if (!/^[0-9a-f-]{36}$/.test(input.entityId))
    return { ok: false, error: "Bad entity reference." };

  const contact = String(input.reporterContact ?? "").trim().slice(0, 200) || null;
  const user = await getSessionUser();

  // Reports are open to anyone by design; the limiter is what keeps
  // "anyone" from being a loop. Anonymous callers key by IP.
  const limit = await rateLimit("report");
  if (!limit.ok) return { ok: false, error: RATE_LIMIT_MESSAGE };

  // The entity must exist (only events are individually addressable for now,
  // but terms/elections are accepted for future UI).
  if (input.entityType === "event") {
    const ev = await db.query.events.findFirst({
      where: eq(events.id, input.entityId),
      columns: { id: true },
    });
    if (!ev) return { ok: false, error: "No such entry." };
  }

  const [{ n }] = await db
    .select({ n: count() })
    .from(reports)
    .where(
      and(
        eq(reports.entityType, input.entityType),
        eq(reports.entityId, input.entityId),
        eq(reports.status, "open"),
      ),
    );
  if (n >= MAX_OPEN_PER_ENTITY)
    return { ok: false, error: "This entry already has many open reports; a moderator will review them." };

  await db.insert(reports).values({
    id: uuidv7(),
    entityType: input.entityType,
    entityId: input.entityId,
    kind: input.kind,
    openedBy: user?.id ?? null,
    reporterContact: user ? null : contact,
    reason,
    status: "open",
  });

  if (input.entityType === "event") updateTag(tags.event(input.entityId));
  return { ok: true };
}

/** Moderator resolution of a report; optionally flips an event's disputed flag. */
export async function resolveReportAction(formData: FormData): Promise<void> {
  let reviewer;
  try {
    reviewer = await requireRole("moderator");
  } catch (e) {
    if (e instanceof AuthzError) redirect("/login?next=/review/reports");
    throw e;
  }

  const reportId = String(formData.get("reportId") ?? "");
  const decision = String(formData.get("decision") ?? ""); // 'resolved' | 'dismissed'
  const resolutionNote = String(formData.get("resolutionNote") ?? "").trim();
  const eventStatus = String(formData.get("eventStatus") ?? ""); // '' | 'disputed' | 'published'

  if (!["resolved", "dismissed"].includes(decision)) redirect("/review/reports?error=bad_decision");
  if (resolutionNote.length < 3) redirect("/review/reports?error=note_required");

  await db.transaction(async (tx) => {
    const [report] = await tx
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .for("update");
    if (!report || report.status !== "open") return;

    await tx
      .update(reports)
      .set({
        status: decision as "resolved" | "dismissed",
        resolutionNote,
        resolvedBy: reviewer.id,
        resolvedAt: new Date(),
      })
      .where(eq(reports.id, reportId));

    // Optionally mark/clear the disputed flag on published events.
    if (
      report.entityType === "event" &&
      (eventStatus === "disputed" || eventStatus === "published")
    ) {
      await tx
        .update(events)
        .set({ status: eventStatus as "disputed" | "published" })
        .where(
          and(
            eq(events.id, report.entityId),
            eventStatus === "disputed"
              ? eq(events.status, "published")
              : eq(events.status, "disputed"),
          ),
        );
    }
  });

  const report = await db.query.reports.findFirst({ where: eq(reports.id, reportId) });
  if (report?.entityType === "event") {
    updateTag(tags.event(report.entityId));
    const ev = await db.query.events.findFirst({
      where: eq(events.id, report.entityId),
      columns: { stateId: true },
    });
    if (ev) updateTag(tags.state(ev.stateId));
  }
  redirect("/review/reports?done=1");
}
