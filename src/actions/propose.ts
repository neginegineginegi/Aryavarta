"use server";

import { and, count, eq, inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import { db } from "@/lib/db";
import { documents, events, parties, revisions, states } from "@/lib/db/schema";
import { AuthzError, requireRole } from "@/lib/authz";
import { RATE_LIMIT_MESSAGE, rateLimit } from "@/lib/rate-limit";
import {
  canonicalizeFor,
  payloadSchemaFor,
  type AnyPayload,
  type ElectionPayload,
  type EntityType,
  type EventPayload,
  type PromisePayload,
  type TermPayload,
} from "@/lib/revisions/payloads";
import { snapshotEntity, snapshotsEqual } from "@/lib/revisions/snapshot";
import { yearOf } from "@/lib/format";

/** The union pseudo-state; national records hang off it. */
const UNION_STATE_ID = "in";

const MAX_PENDING_PER_USER = 25;

export type ProposeInput = {
  entityType: EntityType;
  action: "create" | "update";
  entityId?: string; // required for update
  payload: unknown;
  summary: string;
};

export type ProposeResult =
  | { ok: true; revisionId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function deriveTitle(entityType: EntityType, payload: AnyPayload, stateName: string): string {
  switch (entityType) {
    case "event": {
      const p = payload as EventPayload;
      return p.title;
    }
    case "term": {
      const p = payload as TermPayload;
      const who = p.kind === "presidents_rule" ? "President's Rule" : p.cmName;
      return `${who}, ${stateName} (${yearOf(p.startDate)} – ${p.endDate ? yearOf(p.endDate) : "present"})`;
    }
    case "election": {
      const p = payload as ElectionPayload;
      return `Assembly election, ${stateName}, ${yearOf(p.electionDate)}`;
    }
    case "manifesto_promise": {
      const p = payload as PromisePayload;
      const quoted = p.officialText.length > 80 ? `${p.officialText.slice(0, 77)}…` : p.officialText;
      return `Promise: ${quoted}`;
    }
  }
}

export async function proposeRevision(input: ProposeInput): Promise<ProposeResult> {
  let user;
  try {
    user = await requireRole("contributor");
  } catch (e) {
    return { ok: false, error: e instanceof AuthzError ? e.message : "Not signed in." };
  }

  // After auth on purpose, so the counter keys on the account: flooding the
  // review queue is an attack on the moderators, and rotating IPs is cheaper
  // than rotating Google accounts.
  const limit = await rateLimit("propose");
  if (!limit.ok) return { ok: false, error: RATE_LIMIT_MESSAGE };

  // --- basic shape ---------------------------------------------------------
  if (!["term", "election", "event", "manifesto_promise"].includes(input.entityType))
    return { ok: false, error: "Unknown entity type." };
  if (!["create", "update"].includes(input.action))
    return { ok: false, error: "Unsupported action." };
  const summary = String(input.summary ?? "").trim();
  if (summary.length < 5 || summary.length > 500)
    return { ok: false, error: "Please provide an edit summary (5–500 characters)." };

  // --- payload validation --------------------------------------------------
  const parsed = payloadSchemaFor[input.entityType].safeParse(input.payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = canonicalizeFor[input.entityType](parsed.data as any) as AnyPayload;

  // --- referential checks --------------------------------------------------
  // A national promise has no state; revisions require one, so it rides the
  // union pseudo-state 'in', the same convention Lok Sabha elections and PM
  // terms already use.
  const stateId = payload.stateId ?? UNION_STATE_ID;
  const state = await db.query.states.findFirst({ where: eq(states.id, stateId) });
  if (!state) return { ok: false, error: "Unknown state." };

  const partyIds = new Set<string>();
  if (input.entityType === "term") {
    const p = payload as TermPayload;
    if (p.partyId) partyIds.add(p.partyId);
  } else if (input.entityType === "election") {
    for (const r of (payload as ElectionPayload).results) partyIds.add(r.partyId);
  } else if (input.entityType === "manifesto_promise") {
    const p = payload as PromisePayload;
    if (p.partyId) partyIds.add(p.partyId);
    // A promise is a quotation, so the document it was quoted from has to be
    // in the archive first. Without that, there is no page to check it against.
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, p.documentId),
      columns: { id: true },
    });
    if (!doc)
      return {
        ok: false,
        error:
          "That document is not in the archive yet. Add the document first, then quote promises out of it.",
      };
  }
  if (partyIds.size > 0) {
    const found = await db
      .select({ id: parties.id })
      .from(parties)
      .where(inArray(parties.id, [...partyIds]));
    if (found.length !== partyIds.size) {
      return {
        ok: false,
        error:
          "One or more parties are not in the archive yet. Mention the missing party in your edit summary and a moderator will add it.",
      };
    }
  }

  // --- anti-spam cap -------------------------------------------------------
  const [{ n: pendingCount }] = await db
    .select({ n: count() })
    .from(revisions)
    .where(and(eq(revisions.proposedBy, user.id), eq(revisions.status, "pending")));
  if (pendingCount >= MAX_PENDING_PER_USER) {
    return {
      ok: false,
      error: `You have ${pendingCount} submissions awaiting review. Please wait for those before adding more.`,
    };
  }

  // --- build before/after --------------------------------------------------
  let beforeData: AnyPayload | null = null;
  let entityId: string;

  if (input.action === "update") {
    if (!input.entityId) return { ok: false, error: "Missing entity id for update." };
    entityId = input.entityId;
    beforeData = (await snapshotEntity(db, input.entityType, entityId)) as AnyPayload | null;
    if (!beforeData)
      return { ok: false, error: "The entry you are editing no longer exists." };
    if (beforeData.stateId !== payload.stateId)
      return { ok: false, error: "An entry cannot be moved between states." };
    if (snapshotsEqual(beforeData, payload))
      return { ok: false, error: "No changes detected. The proposal is identical to the live entry." };
  } else {
    entityId = uuidv7();
  }

  const title = deriveTitle(input.entityType, payload, state.name);
  const revisionId = uuidv7();

  // --- write ---------------------------------------------------------------
  await db.transaction(async (tx) => {
    if (input.action === "create" && input.entityType === "event") {
      // Events get a live-table row immediately (status pending_review, which
      // every public query filters out) so the entry has a stable URL and the
      // spec's event-status lifecycle is honored.
      const p = payload as EventPayload;
      await tx.insert(events).values({
        id: entityId,
        stateId: p.stateId,
        year: p.year,
        eventDate: p.eventDate,
        type: p.type,
        title: p.title,
        description: p.description,
        status: "pending_review",
      });
    }
    await tx.insert(revisions).values({
      id: revisionId,
      entityType: input.entityType,
      entityId,
      stateId,
      action: input.action,
      schemaVersion: 1,
      beforeData,
      afterData: payload,
      title,
      summary,
      status: "pending",
      proposedBy: user.id,
    });
  });

  return { ok: true, revisionId };
}

export type WithdrawResult = { ok: true } | { ok: false; error: string };

export async function withdrawRevision(revisionId: string): Promise<WithdrawResult> {
  let user;
  try {
    user = await requireRole("contributor");
  } catch (e) {
    return { ok: false, error: e instanceof AuthzError ? e.message : "Not signed in." };
  }

  const limit = await rateLimit("propose");
  if (!limit.ok) return { ok: false, error: RATE_LIMIT_MESSAGE };

  const result = await db.transaction(async (tx) => {
    const [rev] = await tx
      .select()
      .from(revisions)
      .where(eq(revisions.id, revisionId))
      .for("update");
    if (!rev) return { ok: false as const, error: "Revision not found." };
    if (rev.proposedBy !== user.id)
      return { ok: false as const, error: "You can only withdraw your own submissions." };
    if (rev.status !== "pending")
      return { ok: false as const, error: "Only pending submissions can be withdrawn." };

    await tx
      .update(revisions)
      .set({ status: "withdrawn", reviewedAt: new Date() })
      .where(eq(revisions.id, revisionId));

    // A withdrawn event-create leaves its hidden row as a draft, not pending.
    if (rev.entityType === "event" && rev.action === "create") {
      await tx
        .update(events)
        .set({ status: "draft" })
        .where(and(eq(events.id, rev.entityId), eq(events.status, "pending_review")));
    }
    return { ok: true as const };
  });

  return result;
}
