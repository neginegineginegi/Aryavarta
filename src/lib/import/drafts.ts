import { and, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import { db } from "@/lib/db";
import { elections, parties, revisions, terms, users } from "@/lib/db/schema";
import type {
  ImportedElection,
  ImportedTerm,
} from "@/lib/import/wikidata";
import { wikidataItemUrl } from "@/lib/import/wikidata";
import {
  canonicalizeElection,
  canonicalizeTerm,
  electionPayloadSchema,
  termPayloadSchema,
  type SourceSnapshot,
} from "@/lib/revisions/payloads";
import { yearOf } from "@/lib/format";

/**
 * Turns previewed reference data into PENDING DRAFT REVISIONS proposed by the
 * Import Bot system user. Nothing here touches live tables (except creating
 * party stubs, which are curated reference metadata, not published claims) —
 * every draft goes through the same moderator review as community edits, with
 * origin='import' so the provenance is visible everywhere.
 */

const IMPORT_BOT_EMAIL = "import-bot@abhilekh.invalid";

export async function ensureImportBot(): Promise<string> {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, IMPORT_BOT_EMAIL),
  });
  if (existing) return existing.id;
  const [created] = await db
    .insert(users)
    .values({
      email: IMPORT_BOT_EMAIL,
      name: "Import Bot",
      role: "contributor",
      emailVerified: new Date(),
    })
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (created) return created.id;
  const raced = await db.query.users.findFirst({ where: eq(users.email, IMPORT_BOT_EMAIL) });
  if (!raced) throw new Error("Failed to create Import Bot user");
  return raced.id;
}

export function slugifyPartyId(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "unknown-party"
  );
}

/** Get-or-create a party stub for an imported party label (admin recolors later). */
export async function ensureParty(label: string): Promise<string> {
  const clean = label.trim();
  const byName = await db.query.parties.findFirst({ where: eq(parties.name, clean) });
  if (byName) return byName.id;
  const id = slugifyPartyId(clean);
  const byId = await db.query.parties.findFirst({ where: eq(parties.id, id) });
  if (byId) return byId.id; // same slug, different label — reuse rather than duplicate
  await db
    .insert(parties)
    .values({ id, name: clean, abbreviation: null, color: "#8a8a8a", isPseudo: false })
    .onConflictDoNothing();
  return id;
}

function importSources(qid: string, wikipediaUrl: string | null, accessedOn: string): SourceSnapshot[] {
  const sources: SourceSnapshot[] = [
    {
      title: `Wikidata item ${qid} (imported structured data — verify against ECI statistical report)`,
      url: wikidataItemUrl(qid),
      publisher: "Wikidata",
      publishedOn: null,
      accessedOn,
    },
  ];
  if (wikipediaUrl) {
    sources.push({
      title: "Wikipedia article (imported reference — verify against ECI statistical report)",
      url: wikipediaUrl,
      publisher: "Wikipedia",
      publishedOn: null,
      accessedOn,
    });
  }
  return sources;
}

export type DraftOutcome = { created: number; skipped: Array<{ label: string; reason: string }> };

export async function createTermDrafts(
  stateId: string,
  stateName: string,
  stateQid: string,
  items: ImportedTerm[],
): Promise<DraftOutcome> {
  const botId = await ensureImportBot();
  const accessedOn = new Date().toISOString().slice(0, 10);
  const outcome: DraftOutcome = { created: 0, skipped: [] };

  for (const item of items) {
    const label = `${item.personLabel} (${item.startDate ?? "?"} – ${item.endDate ?? "present"})`;
    if (!item.startDate) {
      outcome.skipped.push({ label, reason: "no start date on Wikidata" });
      continue;
    }
    if (!item.partyLabel) {
      outcome.skipped.push({ label, reason: "no party on Wikidata — add manually" });
      continue;
    }

    // Dedup: identical live term, or an existing pending import draft.
    const live = await db.query.terms.findFirst({
      where: and(
        eq(terms.stateId, stateId),
        eq(terms.startDate, item.startDate),
        sql`${terms.deletedAt} IS NULL`,
      ),
    });
    if (live) {
      outcome.skipped.push({ label, reason: "a live term already starts on this date" });
      continue;
    }
    const pendingDup = await db.query.revisions.findFirst({
      where: and(
        eq(revisions.stateId, stateId),
        eq(revisions.entityType, "term"),
        eq(revisions.status, "pending"),
        eq(revisions.origin, "import"),
        sql`${revisions.afterData} ->> 'startDate' = ${item.startDate}`,
      ),
    });
    if (pendingDup) {
      outcome.skipped.push({ label, reason: "an imported draft for this term is already pending" });
      continue;
    }

    const partyId = await ensureParty(item.partyLabel);
    const precisionNotes: string[] = [];
    if (item.startPrecision && item.startPrecision !== "day")
      precisionNotes.push(`start date has ${item.startPrecision} precision on Wikidata`);
    if (item.endDate && item.endPrecision && item.endPrecision !== "day")
      precisionNotes.push(`end date has ${item.endPrecision} precision on Wikidata`);

    const payload = canonicalizeTerm({
      stateId,
      kind: "cm",
      cmName: item.personLabel,
      partyId,
      startDate: item.startDate,
      endDate: item.endDate,
      notes: precisionNotes.length ? `Imported: ${precisionNotes.join("; ")}.` : null,
      sources: importSources(item.personQid ?? stateQid, null, accessedOn),
    });
    const parsed = termPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      outcome.skipped.push({ label, reason: `failed validation: ${parsed.error.issues[0]?.message}` });
      continue;
    }

    await db.insert(revisions).values({
      id: uuidv7(),
      entityType: "term",
      entityId: uuidv7(),
      stateId,
      action: "create",
      beforeData: null,
      afterData: parsed.data,
      title: `${item.personLabel}, ${stateName} (${yearOf(item.startDate)} – ${item.endDate ? yearOf(item.endDate) : "present"})`,
      summary: `Imported from Wikidata (${item.personQid ?? stateQid}). Verify names, dates and party against an authoritative source (ECI / state gazette) before approving.`,
      origin: "import",
      status: "pending",
      proposedBy: botId,
    });
    outcome.created++;
  }
  return outcome;
}

export async function createElectionDrafts(
  stateId: string,
  stateName: string,
  items: ImportedElection[],
): Promise<DraftOutcome> {
  const botId = await ensureImportBot();
  const accessedOn = new Date().toISOString().slice(0, 10);
  const outcome: DraftOutcome = { created: 0, skipped: [] };

  for (const item of items) {
    const label = item.label;
    if (!item.electionDate) {
      outcome.skipped.push({ label, reason: "no election date on Wikidata" });
      continue;
    }

    const liveNearby = await db.query.elections.findFirst({
      where: and(
        eq(elections.stateId, stateId),
        sql`${elections.deletedAt} IS NULL`,
        sql`abs(${elections.electionDate} - ${item.electionDate}::date) < 90`,
      ),
    });
    if (liveNearby) {
      outcome.skipped.push({ label, reason: "a live election already exists near this date" });
      continue;
    }
    const pendingDup = await db.query.revisions.findFirst({
      where: and(
        eq(revisions.stateId, stateId),
        eq(revisions.entityType, "election"),
        eq(revisions.status, "pending"),
        eq(revisions.origin, "import"),
        sql`${revisions.afterData} ->> 'electionDate' = ${item.electionDate}`,
      ),
    });
    if (pendingDup) {
      outcome.skipped.push({ label, reason: "an imported draft for this election is already pending" });
      continue;
    }

    const results = [];
    for (const r of item.results) {
      if (r.seatsWon == null) continue; // participants without seat counts add noise
      results.push({
        partyId: await ensureParty(r.partyLabel),
        seats: r.seatsWon,
        voteSharePercent: null,
      });
    }

    const payload = canonicalizeElection({
      stateId,
      electionDate: item.electionDate,
      resultSummary: null,
      totalSeats: item.totalSeats,
      turnoutPercent: null,
      results,
      sources: importSources(item.qid, item.wikipediaUrl, accessedOn),
    });
    const parsed = electionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      outcome.skipped.push({ label, reason: `failed validation: ${parsed.error.issues[0]?.message}` });
      continue;
    }

    await db.insert(revisions).values({
      id: uuidv7(),
      entityType: "election",
      entityId: uuidv7(),
      stateId,
      action: "create",
      beforeData: null,
      afterData: parsed.data,
      title: `Assembly election, ${stateName}, ${yearOf(item.electionDate)} (imported)`,
      summary: `Imported from Wikidata (${item.qid}). Verify seat counts, date and turnout against the ECI statistical report before approving.`,
      origin: "import",
      status: "pending",
      proposedBy: botId,
    });
    outcome.created++;
  }
  return outcome;
}
