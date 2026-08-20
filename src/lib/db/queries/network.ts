import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { citations, sources } from "@/lib/db/schema";
import type { FlowInput } from "@/lib/funding/flow";
import { toEdge, type EntityRef, type GraphEdge } from "@/lib/funding/graph-types";
import type { SourceKind } from "@/lib/funding/source-rank";

export type EdgeEvidence = {
  sourceId: string;
  title: string;
  url: string;
  publisher: string | null;
  publishedOn: string | null;
  accessedOn: string | null;
  kind: SourceKind | null;
  isOfficial: boolean | null;
  isPrimary: boolean | null;
  /** Page, clause or table number. Without it a 400-page report is not a
   *  citation, only a gesture at one. */
  note: string | null;
};

/**
 * The sources behind one edge.
 *
 * Every edge in `graph_edges` carries the citation subject and id of the row it
 * was projected from, so this is the same lookup the rest of the archive does,
 * not a graph-specific shortcut.
 */
export async function edgeEvidence(
  citationSubject: string,
  citationSubjectId: string,
): Promise<EdgeEvidence[]> {
  const rows = await db
    .select({
      sourceId: sources.id,
      title: sources.title,
      url: sources.url,
      publisher: sources.publisher,
      publishedOn: sources.publishedOn,
      accessedOn: sources.accessedOn,
      kind: sources.kind,
      isOfficial: sources.isOfficial,
      isPrimary: sources.isPrimary,
      note: citations.note,
    })
    .from(citations)
    .innerJoin(sources, eq(sources.id, citations.sourceId))
    .where(
      and(
        // Subject ids are text and shared across kinds, so both halves of the
        // key are needed: an unscoped match could pull another kind of subject
        // that happened to share the id.
        eq(citations.subjectType, citationSubject as "relationship"),
        eq(citations.subjectId, citationSubjectId),
      ),
    );
  return rows as EdgeEvidence[];
}

/** One edge by its projected id, for a panel opened from a link. */
export async function edgeById(edgeId: string): Promise<GraphEdge | null> {
  const res = await db.execute(sql`SELECT * FROM graph_edges WHERE edge_id = ${edgeId} LIMIT 1`);
  const row = (res.rows as Array<Record<string, unknown>>)[0];
  return row ? toEdge(row) : null;
}

export type NodeSummary = {
  type: string;
  id: string;
  label: string;
  subKind: string | null;
  stateId: string | null;
  startedOn: string | null;
  endedOn: string | null;
  /** How many edges touch this node in total, whatever the current view shows.
   *  The expand affordance needs to say what is still hidden. */
  degree: number;
};

export async function nodeSummary(ref: EntityRef): Promise<NodeSummary | null> {
  const res = await db.execute(sql`
    SELECT n.*, (
      SELECT count(*) FROM graph_edges e
       WHERE (e.from_type = n.node_type AND e.from_id = n.node_id)
          OR (e.to_type = n.node_type AND e.to_id = n.node_id)
    ) AS degree
      FROM graph_nodes n
     WHERE n.node_type = ${ref.type} AND n.node_id = ${ref.id}
     LIMIT 1
  `);
  const r = (res.rows as Array<Record<string, unknown>>)[0];
  if (!r) return null;
  return {
    type: String(r.node_type),
    id: String(r.node_id),
    label: String(r.label ?? ""),
    subKind: (r.sub_kind as string) ?? null,
    stateId: (r.state_id as string) ?? null,
    startedOn: (r.started_on as string) ?? null,
    endedOn: (r.ended_on as string) ?? null,
    degree: Number(r.degree ?? 0),
  };
}

/** Degrees for many nodes at once, so the renderer can mark what expands. */
export async function degrees(refs: EntityRef[]): Promise<Map<string, number>> {
  if (refs.length === 0) return new Map();
  const keys = refs.map((r) => `${r.type}:${r.id}`).join("\u0001");
  const res = await db.execute(sql`
    WITH wanted AS (
      SELECT unnest(string_to_array(${keys}, chr(1))) AS k
    ),
    touching AS (
      SELECT from_type || ':' || from_id AS k FROM graph_edges
      UNION ALL
      SELECT to_type || ':' || to_id FROM graph_edges
    )
    SELECT w.k, count(t.k) AS degree
      FROM wanted w LEFT JOIN touching t ON t.k = w.k
     GROUP BY w.k
  `);
  return new Map(
    (res.rows as Array<{ k: string; degree: string }>).map((r) => [r.k, Number(r.degree)]),
  );
}

/**
 * Entities a researcher can start from, most connected first.
 *
 * Orgs and people appear even with no relationships drawn yet: an entity can
 * carry FCRA rows or outcomes that project no edge, and its record page is
 * where they live. Anything else (campaigns, cases) earns a listing by
 * touching the graph.
 */
export async function graphEntryPoints(limit = 24, type?: "org" | "person") {
  const typeFilter = type ? sql`AND n.node_type = ${type}` : sql``;
  const res = await db.execute(sql`
    SELECT n.node_type, n.node_id, n.label, n.sub_kind, n.slug, d.degree
      FROM graph_nodes n
      JOIN LATERAL (
        SELECT count(*) AS degree FROM graph_edges e
         WHERE (e.from_type = n.node_type AND e.from_id = n.node_id)
            OR (e.to_type = n.node_type AND e.to_id = n.node_id)
      ) d ON true
     WHERE (d.degree > 0 OR n.node_type IN ('org', 'person')) ${typeFilter}
     ORDER BY d.degree DESC, n.label
     LIMIT ${limit}
  `);
  return (res.rows as Array<Record<string, unknown>>).map((r) => ({
    type: String(r.node_type),
    id: String(r.node_id),
    label: String(r.label ?? ""),
    subKind: (r.sub_kind as string) ?? null,
    slug: (r.slug as string) ?? null,
    degree: Number(r.degree ?? 0),
  }));
}

/** Sources cited by a set of edges, for the panel's "all evidence" list. */
export async function evidenceForEdges(edges: GraphEdge[]): Promise<Map<string, EdgeEvidence[]>> {
  if (edges.length === 0) return new Map();
  const ids = [...new Set(edges.map((e) => e.citationSubjectId))];
  const rows = await db
    .select({
      subjectType: citations.subjectType,
      subjectId: citations.subjectId,
      sourceId: sources.id,
      title: sources.title,
      url: sources.url,
      publisher: sources.publisher,
      publishedOn: sources.publishedOn,
      accessedOn: sources.accessedOn,
      kind: sources.kind,
      isOfficial: sources.isOfficial,
      isPrimary: sources.isPrimary,
      note: citations.note,
    })
    .from(citations)
    .innerJoin(sources, eq(sources.id, citations.sourceId))
    .where(inArray(citations.subjectId, ids));

  const out = new Map<string, EdgeEvidence[]>();
  for (const e of edges) {
    const matches = rows.filter(
      (r) => r.subjectId === e.citationSubjectId && r.subjectType === e.citationSubject,
    );
    if (matches.length) out.set(e.edgeId, matches as EdgeEvidence[]);
  }
  return out;
}


export type NodeHit = {
  type: string;
  id: string;
  label: string;
  subKind: string | null;
  degree: number;
};

/**
 * Typeahead over graph entities, including the names a body has been known by.
 *
 * Aliases are searched alongside the current name, because a researcher
 * arriving from a 2011 filing will type the name that filing used. The hit
 * still reports the canonical label, so two spellings never look like two
 * organisations.
 */
export async function searchGraphNodes(query: string, limit = 12): Promise<NodeHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const res = await db.execute(sql`
    SELECT n.node_type, n.node_id, n.label, n.sub_kind,
           (SELECT count(*) FROM graph_edges e
             WHERE (e.from_type = n.node_type AND e.from_id = n.node_id)
                OR (e.to_type = n.node_type AND e.to_id = n.node_id)) AS degree
      FROM graph_nodes n
     WHERE n.label ILIKE ${like}
        OR EXISTS (
          SELECT 1 FROM entity_aliases a
           WHERE a.entity_type::text = n.node_type
             AND a.entity_id = n.node_id
             AND a.name ILIKE ${like}
        )
     ORDER BY (lower(n.label) = lower(${q})) DESC,
              position(lower(${q}) in lower(n.label)),
              n.label
     LIMIT ${limit}
  `);
  return (res.rows as Array<Record<string, unknown>>).map((r) => ({
    type: String(r.node_type),
    id: String(r.node_id),
    label: String(r.label ?? ""),
    subKind: (r.sub_kind as string) ?? null,
    degree: Number(r.degree ?? 0),
  }));
}

/** Labels for node keys, so a path renders without a second round trip. */
export async function labelsFor(
  keys: string[],
): Promise<Map<string, { label: string; type: string }>> {
  if (keys.length === 0) return new Map();
  const joined = keys.join("\u0001");
  const res = await db.execute(sql`
    SELECT node_type, node_id, label FROM graph_nodes
     WHERE node_type || ':' || node_id = ANY(string_to_array(${joined}, chr(1)))
  `);
  return new Map(
    (res.rows as Array<Record<string, unknown>>).map((r) => [
      `${r.node_type}:${r.node_id}`,
      { label: String(r.label ?? ""), type: String(r.node_type) },
    ]),
  );
}

/** Edges by their projected ids, so every step of a path can show its evidence. */
export async function edgesByIds(ids: string[]): Promise<Map<string, GraphEdge>> {
  if (ids.length === 0) return new Map();
  const joined = ids.join("\u0001");
  const res = await db.execute(sql`
    SELECT * FROM graph_edges
     WHERE edge_id = ANY(string_to_array(${joined}, chr(1)))
  `);
  return new Map(
    (res.rows as Array<Record<string, unknown>>).map((r) => [String(r.edge_id), toEdge(r)]),
  );
}

/**
 * Which entities the archive holds an accountability record about.
 *
 * This exists because "colour the questionable ones red" is a reasonable thing
 * to want and an impossible thing for an archive to answer. Questionable is a
 * judgement, and this project holds records. So the mark is keyed to three
 * specific, checkable facts and nothing else:
 *
 *   - the entity is named as a party in a recorded legal case
 *   - a recorded outcome of an accountability kind attaches to it (a court
 *     ruling, a regulatory action, an investigation opened)
 *   - somebody has asserted something about it that is recorded as a claim
 *
 * The first two are documented: a court record, a gazette, a regulator's
 * order. The third is an allegation, and it is returned as a separate tier,
 * because a person somebody accused and a person a court ruled against must
 * never be drawn the same way. Where both exist, documented wins: the stronger
 * record is the one the reader should see first.
 *
 * A mark says the archive holds a record naming this entity. It does not say
 * the entity did anything, and the renderer's legend has to keep saying so.
 */
export type RecordMark = "documented" | "alleged";

export async function recordMarks(): Promise<Record<string, RecordMark>> {
  const res = await db.execute(sql`
    SELECT 'person' AS t, p.party_type AS ty, p.party_id AS id, 'documented' AS tier
      FROM legal_case_parties p
    UNION ALL
    SELECT 'outcome', o.subject_type, o.subject_id, 'documented'
      FROM outcomes o
     WHERE o.kind IN ('court_ruling', 'regulatory_action', 'investigation_initiated')
    UNION ALL
    SELECT 'claim', c.subject_type, c.subject_id, 'alleged'
      FROM claims c
  `);
  const out: Record<string, RecordMark> = {};
  for (const r of res.rows as Array<{ ty: string; id: string; tier: RecordMark }>) {
    if (!r.ty || !r.id) continue;
    const key = `${r.ty}:${r.id}`;
    // Documented outranks alleged wherever both are recorded.
    if (out[key] === "documented") continue;
    out[key] = r.tier;
  }
  return out;
}

/**
 * Every recorded funding transaction, reduced to the two organisation kinds it
 * ran between and its currency.
 *
 * Only org-to-org transactions. A grant from a person, or to a project, has no
 * organisation kind on one end, and inventing one for it would put a row on
 * this view that the record does not support. The view states how many were
 * left out.
 *
 * The arithmetic is deliberately NOT here: this returns rows, and
 * `aggregateFlow` in lib/funding/flow.ts sums them, so the rule that currencies
 * never add together is written in one testable place instead of in SQL.
 */
export async function fundingByOrgKind(): Promise<{
  rows: FlowInput[];
  /** Transactions with an organisation on both ends. */
  covered: number;
  /** Transactions with something other than an organisation on either end, so
   *  they have no kind and are not on this view. */
  excluded: number;
}> {
  const res = await db.execute(sql`
    SELECT d.kind::text AS donor_kind,
           r.kind::text AS recipient_kind,
           t.amount::text AS amount,
           t.currency AS currency,
           (t.donor_type = 'org' AND t.recipient_type = 'org') AS both_orgs
      FROM funding_transactions t
      LEFT JOIN orgs d ON t.donor_type = 'org' AND d.id::text = t.donor_id
      LEFT JOIN orgs r ON t.recipient_type = 'org' AND r.id::text = t.recipient_id
  `);

  const all = res.rows as Array<{
    donor_kind: string | null;
    recipient_kind: string | null;
    amount: string | null;
    currency: string | null;
    both_orgs: boolean;
  }>;

  const kept = all.filter((r) => r.both_orgs);
  return {
    rows: kept.map((r) => ({
      donorKind: r.donor_kind,
      recipientKind: r.recipient_kind,
      amount: r.amount,
      currency: r.currency,
    })),
    covered: kept.length,
    excluded: all.length - kept.length,
  };
}
