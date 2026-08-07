import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  citations,
  documents,
  manifestoPromises,
  parties,
  sources,
  states,
} from "@/lib/db/schema";
import type { SourceRef } from "@/lib/db/queries/state";

/**
 * The manifesto viewer's read layer.
 *
 * A promise is a quotation with a page reference, not a verdict. Nothing here
 * counts promises by party, ranks them, or aggregates across manifestos: the
 * archive records what was pledged and where it was written, and leaves the
 * judgment to the reader. See docs/ACCOUNTABILITY_LAYER.md.
 */

export type PromiseRow = {
  id: string;
  documentId: string;
  officialText: string;
  officialLang: string;
  plainText: string | null;
  category: string;
  scope: string;
  statedTimeline: string | null;
  statedBudgetInr: string | null;
  pageRef: string | null;
  sortOrder: number;
  partyId: string | null;
  partyName: string | null;
  partyAbbreviation: string | null;
  partyColor: string | null;
  stateId: string | null;
  stateName: string | null;
  sources: SourceRef[];
};

const PROMISE_SELECT = {
  id: manifestoPromises.id,
  documentId: manifestoPromises.documentId,
  officialText: manifestoPromises.officialText,
  officialLang: manifestoPromises.officialLang,
  plainText: manifestoPromises.plainText,
  category: sql<string>`${manifestoPromises.category}::text`,
  scope: sql<string>`${manifestoPromises.scope}::text`,
  statedTimeline: manifestoPromises.statedTimeline,
  statedBudgetInr: manifestoPromises.statedBudgetInr,
  pageRef: manifestoPromises.pageRef,
  sortOrder: manifestoPromises.sortOrder,
  partyId: manifestoPromises.partyId,
  partyName: parties.name,
  partyAbbreviation: parties.abbreviation,
  partyColor: parties.color,
  stateId: manifestoPromises.stateId,
  stateName: states.name,
};

/**
 * Citations for a set of promises, in one round trip. Promises cite through
 * the polymorphic citations table, so the join is scoped by subject type as
 * well as id.
 */
async function citationsFor(promiseIds: string[]): Promise<Map<string, SourceRef[]>> {
  const byPromise = new Map<string, SourceRef[]>();
  if (promiseIds.length === 0) return byPromise;
  const rows = await db
    .select({
      subjectId: citations.subjectId,
      id: sources.id,
      title: sources.title,
      url: sources.url,
      publisher: sources.publisher,
      publishedOn: sources.publishedOn,
      accessedOn: sources.accessedOn,
    })
    .from(citations)
    .innerJoin(sources, eq(citations.sourceId, sources.id))
    .where(
      and(
        eq(citations.subjectType, "manifesto_promise"),
        sql`${citations.subjectId} = ANY(${promiseIds})`,
      ),
    )
    .orderBy(asc(sources.title));
  for (const r of rows) {
    const list = byPromise.get(r.subjectId) ?? [];
    list.push({
      id: r.id,
      title: r.title,
      url: r.url,
      publisher: r.publisher,
      publishedOn: r.publishedOn,
      accessedOn: r.accessedOn,
    });
    byPromise.set(r.subjectId, list);
  }
  return byPromise;
}

async function withCitations(
  rows: Array<Omit<PromiseRow, "sources">>,
): Promise<PromiseRow[]> {
  const byPromise = await citationsFor(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, sources: byPromise.get(r.id) ?? [] }));
}

/** Every live promise extracted from one document, in manifesto order. */
export async function getPromisesForDocument(documentId: string): Promise<PromiseRow[]> {
  const rows = await db
    .select(PROMISE_SELECT)
    .from(manifestoPromises)
    .leftJoin(parties, eq(manifestoPromises.partyId, parties.id))
    .leftJoin(states, eq(manifestoPromises.stateId, states.id))
    .where(
      and(eq(manifestoPromises.documentId, documentId), isNull(manifestoPromises.deletedAt)),
    )
    .orderBy(asc(manifestoPromises.sortOrder), asc(manifestoPromises.createdAt));
  return withCitations(rows);
}

export type PromiseDetail = PromiseRow & {
  deletedAt: string | null;
  documentTitle: string;
  documentType: string;
  documentPublisher: string | null;
  documentPublishedOn: string | null;
  documentOfficialUrl: string | null;
  documentArchiveUrl: string | null;
};

/** One promise with the document it was quoted from. */
export async function getPromise(promiseId: string): Promise<PromiseDetail | null> {
  const [row] = await db
    .select({
      ...PROMISE_SELECT,
      deletedAt: sql<string | null>`${manifestoPromises.deletedAt}::text`,
      documentTitle: documents.title,
      documentType: sql<string>`${documents.type}::text`,
      documentPublisher: documents.publisher,
      documentPublishedOn: documents.publishedOn,
      documentOfficialUrl: documents.officialUrl,
      documentArchiveUrl: documents.archiveUrl,
    })
    .from(manifestoPromises)
    .innerJoin(documents, eq(manifestoPromises.documentId, documents.id))
    .leftJoin(parties, eq(manifestoPromises.partyId, parties.id))
    .leftJoin(states, eq(manifestoPromises.stateId, states.id))
    .where(eq(manifestoPromises.id, promiseId));
  if (!row) return null;
  const [withSources] = await withCitations([row]);
  return { ...row, sources: withSources.sources };
}
