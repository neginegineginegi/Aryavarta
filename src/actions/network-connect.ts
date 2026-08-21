"use server";

import { edgesByIds, labelsFor, searchGraphNodes, type NodeHit } from "@/lib/db/queries/network";
import { findPaths, sharedConnections } from "@/lib/funding/graph";
import type { GraphEdge } from "@/lib/funding/graph-types";
import { evidenceRank } from "@/lib/funding/labels";
import { guardLimit, type RateLimited } from "@/lib/rate-limit";

export type PathStep = {
  from: { key: string; label: string; type: string };
  to: { key: string; label: string; type: string };
  edge: GraphEdge | null;
};

export type ResolvedPath = {
  hops: number;
  steps: PathStep[];
  /** The weakest link. A path is only as good as its worst-evidenced step, and
   *  showing that up front stops a five-step chain of hearsay reading as a
   *  finding because four of its steps were solid. */
  weakest: string;
};

export type OverlapItem = {
  node: { type: string; id: string; label: string };
  viaA: GraphEdge[];
  viaB: GraphEdge[];
  /** Best (lowest) evidence rank across both sides, for ordering. */
  rank: number;
};

export async function searchEntitiesAction(query: string): Promise<NodeHit[] | RateLimited> {
  const refused = await guardLimit("graph");
  if (refused) return refused;
  return searchGraphNodes(query, 12);
}

/**
 * Documented paths from A to B, resolved into readable steps.
 *
 * Claims are excluded unless asked for. A path that runs through an assertion
 * is not a documented path, and quietly mixing the two would be the single
 * most misleading thing this feature could do.
 */
export async function findPathsAction(
  a: { type: string; id: string },
  b: { type: string; id: string },
  depth = 4,
  includeInterpretive = false,
): Promise<ResolvedPath[] | RateLimited> {
  const refused = await guardLimit("graph");
  if (refused) return refused;
  const paths = await findPaths(a, b, { depth, includeInterpretive, limit: 12 });
  if (paths.length === 0) return [];

  const keys = [...new Set(paths.flatMap((p) => p.nodeKeys))];
  const edgeIds = [...new Set(paths.flatMap((p) => p.edgeIds))];
  const [labels, edges] = await Promise.all([labelsFor(keys), edgesByIds(edgeIds)]);

  const named = (key: string) => {
    const hit = labels.get(key);
    return { key, label: hit?.label ?? key, type: hit?.type ?? key.split(":")[0] };
  };

  return paths.map((p) => {
    const steps: PathStep[] = [];
    for (let i = 0; i < p.nodeKeys.length - 1; i++) {
      steps.push({
        from: named(p.nodeKeys[i]),
        to: named(p.nodeKeys[i + 1]),
        edge: edges.get(p.edgeIds[i]) ?? null,
      });
    }
    const statuses = steps.map((s) => s.edge?.evidenceStatus ?? "unknown");
    const weakest = statuses.reduce((w, s) => (evidenceRank(s) > evidenceRank(w) ? s : w), "verified");
    return { hops: p.hops, steps, weakest };
  });
}

/**
 * What two entities have in common.
 *
 * Ordered by the strongest evidence on either side, never by count: three
 * uncited overlaps are not a better answer than one that rests on a filing.
 */
export async function sharedConnectionsAction(
  a: { type: string; id: string },
  b: { type: string; id: string },
  includeInterpretive = false,
): Promise<OverlapItem[] | RateLimited> {
  const refused = await guardLimit("graph");
  if (refused) return refused;
  const shared = await sharedConnections(a, b, { includeInterpretive });
  return shared
    .map((s) => ({
      ...s,
      rank: Math.min(
        ...[...s.viaA, ...s.viaB].map((e) => evidenceRank(e.evidenceStatus)),
        evidenceRank("unknown"),
      ),
    }))
    .sort((x, y) => x.rank - y.rank || x.node.label.localeCompare(y.node.label));
}
