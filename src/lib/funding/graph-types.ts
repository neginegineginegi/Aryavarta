/**
 * The graph's shared vocabulary: node and edge shapes, the traversal options,
 * and the row mapper.
 *
 * Separate from `graph.ts` because that module opens a database connection at
 * import time. These types travel into client components (the renderer needs
 * them), and a client bundle must never pull `db` in behind them. It also
 * makes the pure mapping testable without a database.
 */

export type EntityRef = { type: string; id: string };

export type GraphNode = {
  type: string;
  id: string;
  label: string;
  subKind: string | null;
  stateId: string | null;
  startedOn: string | null;
  endedOn: string | null;
  /** Hops from the root. 0 is the root itself. */
  depth: number;
};

export type GraphEdge = {
  edgeId: string;
  edgeTable: string;
  rowId: string;
  kind: string;
  /** True for claims. Never render one like a documented relation. */
  interpretive: boolean;
  from: EntityRef;
  to: EntityRef;
  startOn: string | null;
  endOn: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  amount: string | null;
  currency: string | null;
  evidenceStatus: string;
  /** Look up citations with these two, exactly as any other entity does. */
  citationSubject: string;
  citationSubjectId: string;
  detail: string | null;
};

export const MAX_DEPTH = 4;
export const DEFAULT_NODE_BUDGET = 400;

export type TraversalOptions = {
  /** 1 to MAX_DEPTH. Progressive expansion asks for 1 and expands from there. */
  depth?: number;
  /** Keep only edges live during this window. An edge with no dates is always
   *  kept: an undated relation is not evidence of a relation that ended. */
  yearFrom?: number;
  yearTo?: number;
  /** Claims are excluded by default. A caller that wants them must say so, and
   *  must then render them as assertions. */
  includeInterpretive?: boolean;
  maxNodes?: number;
};

export function clampDepth(d: number | undefined): number {
  if (!d || !Number.isFinite(d)) return 1;
  return Math.min(MAX_DEPTH, Math.max(1, Math.trunc(d)));
}

export function toEdge(r: Record<string, unknown>): GraphEdge {
  return {
    edgeId: String(r.edge_id),
    edgeTable: String(r.edge_table),
    rowId: String(r.row_id),
    kind: String(r.kind),
    interpretive: Boolean(r.interpretive),
    from: { type: String(r.from_type), id: String(r.from_id) },
    to: { type: String(r.to_type), id: String(r.to_id) },
    startOn: (r.start_on as string) ?? null,
    endOn: (r.end_on as string) ?? null,
    yearFrom: r.year_from == null ? null : Number(r.year_from),
    yearTo: r.year_to == null ? null : Number(r.year_to),
    amount: (r.amount as string) ?? null,
    currency: (r.currency as string) ?? null,
    evidenceStatus: String(r.evidence_status),
    citationSubject: String(r.citation_subject),
    citationSubjectId: String(r.citation_subject_id),
    detail: (r.detail as string) ?? null,
  };
}

