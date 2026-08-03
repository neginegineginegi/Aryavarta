import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type SearchHit = {
  kind: "event" | "term" | "party";
  id: string;
  stateId: string | null;
  stateName: string | null;
  label: string;
  snippet: string | null;
  extra: string | null;
  rank: number;
};

export type SearchResults = {
  states: Array<{ id: string; name: string }>;
  hits: SearchHit[];
};

/**
 * Full-text search across events (title+description), CM names, and parties,
 * plus a simple name match on states. The 'simple' text-search config is used
 * for proper nouns (English stemming mangles Indian names); event prose is
 * indexed with 'english' weights inside the same tsvector.
 */
export async function searchArchive(rawQuery: string): Promise<SearchResults> {
  const query = rawQuery.trim().slice(0, 200);
  if (query.length < 2) return { states: [], hits: [] };

  const [stateRows, hitRows] = await Promise.all([
    db.execute(sql`
      SELECT id, name FROM states
      WHERE name ILIKE ${"%" + query + "%"}
      ORDER BY name ASC
      LIMIT 8
    `),
    db.execute(sql`
      WITH q AS (
        SELECT websearch_to_tsquery('simple', ${query}) AS tsq
      )
      SELECT 'event' AS kind,
             e.id::text AS id,
             e.state_id AS state_id,
             s.name AS state_name,
             e.title AS label,
             ts_headline('english', e.description, q.tsq,
                         'MaxWords=30, MinWords=12, StartSel=<<, StopSel=>>') AS snippet,
             e.year::text AS extra,
             ts_rank(e.search_tsv, q.tsq)::float8 AS rank
      FROM events e
      JOIN states s ON s.id = e.state_id, q
      WHERE e.search_tsv @@ q.tsq
        AND e.deleted_at IS NULL
        AND e.status = 'published'

      UNION ALL

      SELECT 'term',
             t.id::text,
             t.state_id,
             s.name,
             coalesce(t.cm_name, 'President''s Rule'),
             NULL,
             (SELECT p.name FROM parties p WHERE p.id = t.party_id),
             ts_rank(t.search_tsv, q.tsq)::float8
      FROM terms t
      JOIN states s ON s.id = t.state_id, q
      WHERE t.search_tsv @@ q.tsq
        AND t.deleted_at IS NULL

      UNION ALL

      SELECT 'party',
             p.id,
             NULL,
             NULL,
             p.name,
             NULL,
             p.abbreviation,
             ts_rank(p.search_tsv, q.tsq)::float8
      FROM parties p, q
      WHERE p.search_tsv @@ q.tsq

      ORDER BY rank DESC
      LIMIT 40
    `),
  ]);

  return {
    states: (stateRows.rows as Array<{ id: string; name: string }>).map((r) => ({
      id: r.id,
      name: r.name,
    })),
    hits: (hitRows.rows as Array<Record<string, unknown>>).map((r) => ({
      kind: r.kind as SearchHit["kind"],
      id: String(r.id),
      stateId: (r.state_id as string | null) ?? null,
      stateName: (r.state_name as string | null) ?? null,
      label: String(r.label ?? ""),
      snippet: (r.snippet as string | null) ?? null,
      extra: (r.extra as string | null) ?? null,
      rank: Number(r.rank ?? 0),
    })),
  };
}
