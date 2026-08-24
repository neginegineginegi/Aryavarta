import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { documents, events, manifestoPromises, parties, states } from "@/lib/db/schema";

/**
 * The accountability hub's two indexes: what was promised, and what is
 * recorded to have happened. Counts are stated on the page, and nothing here
 * grades fulfilment: the archive holds the promise and the event as records,
 * and the reader draws the line between them.
 */

export type ManifestoWithPromises = {
  documentId: string;
  title: string;
  publishedOn: string | null;
  partyName: string | null;
  partyAbbreviation: string | null;
  partyColor: string | null;
  promiseCount: number;
};

export type PromiseCategoryCount = { category: string; n: number };
export type EventTypeCount = { type: string; n: number };

export type EventListEntry = {
  id: string;
  title: string;
  stateId: string;
  stateName: string;
  year: number;
  eventDate: string | null;
  type: string;
};

export type AccountabilityIndex = {
  promiseTotal: number;
  manifestos: ManifestoWithPromises[];
  promisesByCategory: PromiseCategoryCount[];
  eventTotal: number;
  eventStateCount: number;
  eventsByType: EventTypeCount[];
  recentEvents: EventListEntry[];
};

export async function getAccountabilityIndex(): Promise<AccountabilityIndex> {
  const [manifestoRows, categoryRows, typeRows, recentRows, eventStates] = await Promise.all([
    // One row per manifesto that has extracted promises. The party is the
    // DOCUMENT's party: a manifesto is one party's document even when a
    // promise inside it is scoped to a state.
    db
      .select({
        documentId: manifestoPromises.documentId,
        title: documents.title,
        publishedOn: documents.publishedOn,
        partyName: parties.name,
        partyAbbreviation: parties.abbreviation,
        partyColor: parties.color,
        promiseCount: count(),
      })
      .from(manifestoPromises)
      .innerJoin(documents, eq(documents.id, manifestoPromises.documentId))
      .leftJoin(parties, eq(parties.id, documents.partyId))
      .where(isNull(manifestoPromises.deletedAt))
      .groupBy(
        manifestoPromises.documentId,
        documents.title,
        documents.publishedOn,
        parties.name,
        parties.abbreviation,
        parties.color,
      )
      .orderBy(desc(documents.publishedOn)),
    db
      .select({ category: sql<string>`${manifestoPromises.category}::text`, n: count() })
      .from(manifestoPromises)
      .where(isNull(manifestoPromises.deletedAt))
      .groupBy(manifestoPromises.category)
      .orderBy(desc(count())),
    db
      .select({ type: sql<string>`${events.type}::text`, n: count() })
      .from(events)
      .where(and(eq(events.status, "published"), isNull(events.deletedAt)))
      .groupBy(events.type)
      .orderBy(desc(count())),
    db
      .select({
        id: events.id,
        title: events.title,
        stateId: events.stateId,
        stateName: states.name,
        year: events.year,
        eventDate: events.eventDate,
        type: sql<string>`${events.type}::text`,
      })
      .from(events)
      .innerJoin(states, eq(states.id, events.stateId))
      .where(and(eq(events.status, "published"), isNull(events.deletedAt)))
      .orderBy(desc(events.year), sql`${events.eventDate} DESC NULLS LAST`)
      .limit(12),
    db
      .select({ n: sql<number>`count(DISTINCT ${events.stateId})` })
      .from(events)
      .where(and(eq(events.status, "published"), isNull(events.deletedAt))),
  ]);

  return {
    promiseTotal: manifestoRows.reduce((sum, m) => sum + Number(m.promiseCount), 0),
    manifestos: manifestoRows.map((m) => ({ ...m, promiseCount: Number(m.promiseCount) })),
    promisesByCategory: categoryRows.map((c) => ({ category: c.category, n: Number(c.n) })),
    eventTotal: typeRows.reduce((sum, t) => sum + Number(t.n), 0),
    eventStateCount: Number(eventStates[0]?.n ?? 0),
    eventsByType: typeRows.map((t) => ({ type: t.type, n: Number(t.n) })),
    recentEvents: recentRows,
  };
}
