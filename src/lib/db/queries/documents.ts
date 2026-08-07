import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { documents, manifestoPromises } from "@/lib/db/schema";

/**
 * The media archive: one corpus covering manifestos, gazettes, judgments,
 * audit reports, budget speeches and the rest.
 *
 * Search runs over title, publisher and extracted text. Documents without a
 * text layer (ocrStatus 'none' with no fullText) are searchable by metadata
 * only, and the UI says so rather than implying the whole corpus is
 * full-text searchable.
 */

export type DocumentRow = {
  id: string;
  type: string;
  title: string;
  publisher: string | null;
  publishedOn: string | null;
  language: string;
  officialUrl: string | null;
  archiveUrl: string | null;
  redistribution: "permitted" | "link_only" | "unknown";
  pageCount: number | null;
  hasText: boolean;
  promises: number;
  stateId: string | null;
  partyId: string | null;
  electionId: string | null;
};

export type DocumentFacets = {
  types: Array<{ value: string; n: number }>;
  publishers: Array<{ value: string; n: number }>;
  years: Array<{ value: number; n: number }>;
  total: number;
  withText: number;
};

export type DocumentQuery = {
  q?: string;
  type?: string;
  publisher?: string;
  year?: number;
  stateId?: string;
  partyId?: string;
};

const SELECT = {
  id: documents.id,
  type: documents.type,
  title: documents.title,
  publisher: documents.publisher,
  publishedOn: documents.publishedOn,
  language: documents.language,
  officialUrl: documents.officialUrl,
  archiveUrl: documents.archiveUrl,
  redistribution: documents.redistribution,
  pageCount: documents.pageCount,
  hasText: sql<boolean>`(${documents.fullText} IS NOT NULL AND length(${documents.fullText}) > 0)`,
  // How many promises have been quoted out of this document. Extraction is
  // manual and partial, so the browse row says the number rather than letting
  // a reader assume a manifesto has been covered end to end.
  promises: sql<number>`(
    SELECT count(*)::int FROM ${manifestoPromises}
    WHERE ${manifestoPromises.documentId} = ${documents.id}
      AND ${manifestoPromises.deletedAt} IS NULL
  )`,
  stateId: documents.stateId,
  partyId: documents.partyId,
  electionId: documents.electionId,
};

function filters(qy: DocumentQuery): SQL[] {
  const where: SQL[] = [];
  if (qy.q) {
    where.push(sql`${documents.searchTsv} @@ plainto_tsquery('english', ${qy.q})`);
  }
  if (qy.type) where.push(sql`${documents.type}::text = ${qy.type}`);
  if (qy.publisher) where.push(eq(documents.publisher, qy.publisher));
  if (qy.year) where.push(sql`extract(year from ${documents.publishedOn}) = ${qy.year}`);
  if (qy.stateId) where.push(eq(documents.stateId, qy.stateId));
  if (qy.partyId) where.push(eq(documents.partyId, qy.partyId));
  return where;
}

/** Documents matching the query, newest first; relevance-ranked when searching. */
export async function searchDocuments(qy: DocumentQuery, limit = 60): Promise<DocumentRow[]> {
  const where = filters(qy);
  const base = db.select(SELECT).from(documents);
  const scoped = where.length > 0 ? base.where(and(...where)) : base;
  const ordered = qy.q
    ? scoped.orderBy(
        desc(sql`ts_rank(${documents.searchTsv}, plainto_tsquery('english', ${qy.q}))`),
        desc(documents.publishedOn),
      )
    : scoped.orderBy(desc(documents.publishedOn), desc(documents.createdAt));
  return (await ordered.limit(limit)) as DocumentRow[];
}

/** Facet counts for the current filter set, so the browse rails stay honest. */
export async function documentFacets(qy: DocumentQuery): Promise<DocumentFacets> {
  const where = filters(qy);
  // Always a real WHERE clause: the later facets append their own AND, and an
  // empty filter set would otherwise emit `FROM documents AND publisher ...`.
  const scope = sql` WHERE ${and(sql`TRUE`, ...where)}`;
  const [types, publishers, years, totals] = await Promise.all([
    db.execute<{ value: string; n: number }>(
      sql`SELECT type::text AS value, count(*)::int AS n FROM documents${scope} GROUP BY 1 ORDER BY n DESC`,
    ),
    db.execute<{ value: string; n: number }>(
      sql`SELECT publisher AS value, count(*)::int AS n FROM documents${scope} AND publisher IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 20`,
    ),
    db.execute<{ value: number; n: number }>(
      sql`SELECT extract(year from published_on)::int AS value, count(*)::int AS n FROM documents${scope} AND published_on IS NOT NULL GROUP BY 1 ORDER BY value DESC LIMIT 40`,
    ),
    db.execute<{ total: number; with_text: number }>(
      sql`SELECT count(*)::int AS total,
                 count(*) FILTER (WHERE full_text IS NOT NULL AND length(full_text) > 0)::int AS with_text
          FROM documents${scope}`,
    ),
  ]);
  const t = (totals.rows[0] as { total: number; with_text: number } | undefined) ?? {
    total: 0,
    with_text: 0,
  };
  return {
    types: types.rows as Array<{ value: string; n: number }>,
    publishers: publishers.rows as Array<{ value: string; n: number }>,
    years: years.rows as Array<{ value: number; n: number }>,
    total: t.total,
    withText: t.with_text,
  };
}

/** Corpus-wide counts for the archive's title block. */
export const getArchiveCorpusStats = unstable_cache(
  async () => {
    const res = await db.execute<{ total: number; with_text: number; kinds: number }>(
      sql`SELECT count(*)::int AS total,
                 count(*) FILTER (WHERE full_text IS NOT NULL AND length(full_text) > 0)::int AS with_text,
                 count(DISTINCT type)::int AS kinds
          FROM documents`,
    );
    const r = (res.rows[0] as { total: number; with_text: number; kinds: number } | undefined) ?? {
      total: 0,
      with_text: 0,
      kinds: 0,
    };
    return { total: r.total, withText: r.with_text, kinds: r.kinds };
  },
  ["archive-corpus-stats"],
  { revalidate: 300 },
);

export async function getDocument(id: string) {
  return db.query.documents.findFirst({
    where: eq(documents.id, id),
    with: { state: true, party: true },
  });
}
