import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  DEFAULT_NODE_BUDGET,
  MAX_DEPTH,
  clampDepth,
  toEdge,
  type EntityRef,
  type GraphEdge,
  type GraphNode,
  type TraversalOptions,
} from "@/lib/funding/graph-types";

export * from "@/lib/funding/graph-types";

/**
 * Graph read primitives.
 *
 * Everything here reads the `graph_edges` / `graph_nodes` views, which project
 * the nine edge-bearing tables into one shape. Three rules hold throughout:
 *
 *   1. Nothing is written. These are queries; the graph has no storage of its
 *      own, so it cannot accumulate a derived relationship over time.
 *   2. Every edge carries its own evidence status and its citation subject, so
 *      a caller always has the means to show where an edge came from. An edge
 *      that cannot say that has no business being drawn.
 *   3. `interpretive` travels with every edge. A claim is never returned as
 *      though it were a documented relation, and callers can exclude claims
 *      entirely.
 *
 * Traversal is deliberately bounded. Depth is capped, fan-out per hop is
 * capped, and the total node budget is capped; a result says whether it was
 * truncated rather than quietly returning part of the picture.
 */

/**
 * The edge filter, shared by every traversal so a temporal view of the graph is
 * the same graph everywhere.
 *
 * An edge with no dates survives every window. That is the honest default: the
 * archive not knowing when a relation ran is not evidence that it had ended.
 */
function edgeFilter(o: TraversalOptions) {
  const parts = [sql`true`];
  if (!o.includeInterpretive) parts.push(sql`e.interpretive = false`);
  if (o.yearFrom != null) {
    parts.push(sql`(e.year_to IS NULL OR e.year_to >= ${o.yearFrom})`);
  }
  if (o.yearTo != null) {
    parts.push(sql`(e.year_from IS NULL OR e.year_from <= ${o.yearTo})`);
  }
  return sql.join(parts, sql` AND `);
}

/**
 * Every node within `depth` hops of the root, with the edges between them.
 *
 * Edges are undirected for traversal (money flows one way, but a researcher
 * following it needs to walk back up), and each edge keeps its own direction so
 * the renderer can draw the arrow correctly.
 */
export async function neighbourhood(
  root: EntityRef,
  options: TraversalOptions = {},
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean }> {
  const depth = clampDepth(options.depth);
  const budget = options.maxNodes ?? DEFAULT_NODE_BUDGET;
  const filter = edgeFilter(options);

  const reached = await db.execute(sql`
    WITH RECURSIVE reach(node_type, node_id, depth) AS (
      SELECT ${root.type}::text, ${root.id}::text, 0
      UNION
      SELECT nb.t, nb.i, r.depth + 1
        FROM reach r
        JOIN LATERAL (
          SELECT e.to_type AS t, e.to_id AS i
            FROM graph_edges e
           WHERE e.from_type = r.node_type AND e.from_id = r.node_id AND ${filter}
          UNION
          SELECT e.from_type, e.from_id
            FROM graph_edges e
           WHERE e.to_type = r.node_type AND e.to_id = r.node_id AND ${filter}
        ) nb ON true
       WHERE r.depth < ${depth}
    )
    SELECT node_type, node_id, MIN(depth) AS depth
      FROM reach
     GROUP BY node_type, node_id
     ORDER BY MIN(depth), node_type, node_id
     LIMIT ${budget + 1}
  `);

  const rows = reached.rows as Array<{ node_type: string; node_id: string; depth: number }>;
  const truncated = rows.length > budget;
  const kept = truncated ? rows.slice(0, budget) : rows;
  if (kept.length === 0) return { nodes: [], edges: [], truncated: false };

  const depthOf = new Map(kept.map((r) => [`${r.node_type}:${r.node_id}`, Number(r.depth)]));
  // The key set travels as one delimited string and is split back out in SQL.
  // A JS array bound straight into `= ANY(...)` does not survive the driver as
  // an array, and building the literal by hand would mean interpolating ids
  // into SQL text. U+0001 cannot occur in a slug or a uuid.
  const keys = kept.map((r) => `${r.node_type}:${r.node_id}`).join("\u0001");

  const [nodeRes, edgeRes] = await Promise.all([
    db.execute(sql`
      SELECT node_type, node_id, label, sub_kind, state_id, started_on, ended_on
        FROM graph_nodes
       WHERE node_type || ':' || node_id = ANY(string_to_array(${keys}, chr(1)))
    `),
    db.execute(sql`
      SELECT e.* FROM graph_edges e
       WHERE e.from_type || ':' || e.from_id = ANY(string_to_array(${keys}, chr(1)))
         AND e.to_type || ':' || e.to_id = ANY(string_to_array(${keys}, chr(1)))
         AND ${filter}
    `),
  ]);

  const nodes: GraphNode[] = (nodeRes.rows as Array<Record<string, unknown>>).map((r) => ({
    type: String(r.node_type),
    id: String(r.node_id),
    label: String(r.label ?? ""),
    subKind: (r.sub_kind as string) ?? null,
    stateId: (r.state_id as string) ?? null,
    startedOn: (r.started_on as string) ?? null,
    endedOn: (r.ended_on as string) ?? null,
    depth: depthOf.get(`${r.node_type}:${r.node_id}`) ?? 0,
  }));

  return { nodes, edges: (edgeRes.rows as Array<Record<string, unknown>>).map(toEdge), truncated };
}

export type DocumentedPath = {
  /** 'org:uuid' keys, root first. */
  nodeKeys: string[];
  edgeIds: string[];
  hops: number;
};

/**
 * Documented paths between two entities, shortest first.
 *
 * "Documented" is the whole point of the name. A path is a chain of recorded
 * relationships and nothing more: it does not mean the two ends are connected
 * in any sense beyond the links it lists, and every step carries its own
 * evidence. Interpretation of what a path means belongs to the reader.
 */
export async function findPaths(
  a: EntityRef,
  b: EntityRef,
  options: TraversalOptions & { limit?: number } = {},
): Promise<DocumentedPath[]> {
  const depth = clampDepth(options.depth ?? MAX_DEPTH);
  const limit = Math.min(25, Math.max(1, options.limit ?? 10));
  const filter = edgeFilter(options);

  const res = await db.execute(sql`
    WITH RECURSIVE walk(node_type, node_id, path, edge_ids, depth) AS (
      SELECT ${a.type}::text, ${a.id}::text,
             ARRAY[${a.type} || ':' || ${a.id}], ARRAY[]::text[], 0
      UNION ALL
      SELECT nb.t, nb.i, w.path || (nb.t || ':' || nb.i), w.edge_ids || nb.edge_id, w.depth + 1
        FROM walk w
        JOIN LATERAL (
          SELECT e.to_type AS t, e.to_id AS i, e.edge_id
            FROM graph_edges e
           WHERE e.from_type = w.node_type AND e.from_id = w.node_id AND ${filter}
          UNION
          SELECT e.from_type, e.from_id, e.edge_id
            FROM graph_edges e
           WHERE e.to_type = w.node_type AND e.to_id = w.node_id AND ${filter}
        ) nb ON true
       WHERE w.depth < ${depth}
         -- No revisiting: a path that loops back is the same path with a
         -- detour, and it would let the walk run forever.
         AND NOT (nb.t || ':' || nb.i) = ANY(w.path)
    )
    SELECT path, edge_ids, depth
      FROM walk
     WHERE node_type = ${b.type} AND node_id = ${b.id}
     ORDER BY depth, path
     LIMIT ${limit}
  `);

  return (res.rows as Array<{ path: string[]; edge_ids: string[]; depth: number }>).map((r) => ({
    nodeKeys: r.path,
    edgeIds: r.edge_ids,
    hops: Number(r.depth),
  }));
}

export type SharedConnection = {
  node: { type: string; id: string; label: string };
  /** How each side reaches it, so the reader sees the two halves separately. */
  viaA: GraphEdge[];
  viaB: GraphEdge[];
};

/**
 * What two entities have in common: shared donors, board members, campaigns,
 * cases, publications, projects.
 *
 * The result is **documented overlap** and is labelled that way wherever it is
 * shown. It is not coordination, and there is no table it could be stored in
 * that would let it become one: this is computed on read, every time.
 */
export async function sharedConnections(
  a: EntityRef,
  b: EntityRef,
  options: TraversalOptions = {},
): Promise<SharedConnection[]> {
  const [na, nb] = await Promise.all([
    neighbourhood(a, { ...options, depth: 1 }),
    neighbourhood(b, { ...options, depth: 1 }),
  ]);

  const keyOf = (r: EntityRef) => `${r.type}:${r.id}`;
  const aKey = keyOf(a);
  const bKey = keyOf(b);
  const inA = new Set(na.nodes.map((n) => `${n.type}:${n.id}`));
  const shared = nb.nodes.filter(
    (n) => inA.has(`${n.type}:${n.id}`) && `${n.type}:${n.id}` !== aKey && `${n.type}:${n.id}` !== bKey,
  );

  const touches = (e: GraphEdge, x: string, y: string) => {
    const f = keyOf(e.from);
    const t = keyOf(e.to);
    return (f === x && t === y) || (f === y && t === x);
  };

  return shared.map((n) => {
    const k = `${n.type}:${n.id}`;
    return {
      node: { type: n.type, id: n.id, label: n.label },
      viaA: na.edges.filter((e) => touches(e, aKey, k)),
      viaB: nb.edges.filter((e) => touches(e, bKey, k)),
    };
  });
}
