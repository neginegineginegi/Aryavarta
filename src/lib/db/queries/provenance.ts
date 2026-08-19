import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { recordPath, type RecordPath } from "@/lib/ingest/provenance";

/**
 * Where a record came from, read from the two marker tables.
 *
 * There is no column on the records themselves to read this off, by design:
 * see the note on `recordProvenance` in the schema. A row in that table is the
 * bulk marker, an approved revision is the review marker, and this resolves
 * the pair into the four states a reader can be told about.
 *
 * Batched by subject type, because the surfaces that need it render lists. A
 * page showing three hundred constituency results does one query for all of
 * them and finds, almost always, that they share a single dataset.
 */

export type DatasetRef = {
  slug: string;
  name: string;
  publisher: string;
  version: string;
  licence: string;
  licenceUrl: string | null;
  retrievedOn: string;
  upstreamUrl: string;
  curator: string;
  /** Where this particular row sits inside the dataset. */
  upstreamId: string;
  ingestedOn: string;
};

export type Provenance = { path: RecordPath; datasets: DatasetRef[] };

const EMPTY: Provenance = { path: "unrecorded", datasets: [] };

/** Provenance for many records of one kind, keyed by record id. */
export async function provenanceFor(
  subjectType: string,
  ids: string[],
): Promise<Map<string, Provenance>> {
  const out = new Map<string, Provenance>();
  if (ids.length === 0) return out;

  // U+0001-joined rather than a driver array: a JS array does not survive as a
  // Postgres array through this driver. Same approach as queries/network.ts.
  const joined = ids.join("\u0001");

  const [provRows, revRows] = await Promise.all([
    db.execute(sql`
      SELECT p.subject_id, p.upstream_id, p.ingested_on,
             d.slug, d.name, d.publisher, d.version, d.licence, d.licence_url,
             d.retrieved_on, d.upstream_url, d.curator
        FROM record_provenance p
        JOIN datasets d ON d.id = p.dataset_id
       WHERE p.subject_type = ${subjectType}
         AND p.subject_id = ANY(string_to_array(${joined}, chr(1)))
       ORDER BY d.name
    `),
    // Only approved revisions count as review. A pending draft is a proposal,
    // and describing a record as reviewed because somebody proposed an edit to
    // it would be the plainest kind of lie this interface could tell.
    db.execute(sql`
      SELECT DISTINCT entity_id::text AS id
        FROM revisions
       WHERE status = 'approved'
         AND entity_id::text = ANY(string_to_array(${joined}, chr(1)))
    `),
  ]);

  const reviewed = new Set(
    (revRows.rows as Array<{ id: string }>).map((r) => r.id),
  );

  const byId = new Map<string, DatasetRef[]>();
  for (const r of provRows.rows as Array<Record<string, string>>) {
    const list = byId.get(r.subject_id) ?? [];
    list.push({
      slug: r.slug,
      name: r.name,
      publisher: r.publisher,
      version: r.version,
      licence: r.licence,
      licenceUrl: r.licence_url ?? null,
      retrievedOn: r.retrieved_on,
      upstreamUrl: r.upstream_url,
      curator: r.curator,
      upstreamId: r.upstream_id,
      ingestedOn: r.ingested_on,
    });
    byId.set(r.subject_id, list);
  }

  for (const id of ids) {
    const datasets = byId.get(id) ?? [];
    out.set(id, {
      path: recordPath({ provenance: datasets.length > 0, approvedRevision: reviewed.has(id) }),
      datasets,
    });
  }
  return out;
}

/** Provenance for one record. */
export async function provenanceOf(subjectType: string, id: string): Promise<Provenance> {
  const map = await provenanceFor(subjectType, [id]);
  return map.get(id) ?? EMPTY;
}
