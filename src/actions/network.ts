"use server";

import { edgeEvidence, degrees, type EdgeEvidence } from "@/lib/db/queries/network";
import { neighbourhood } from "@/lib/funding/graph";
import type { GraphEdge, GraphNode } from "@/lib/funding/graph-types";
import { guardLimit, type RateLimited } from "@/lib/rate-limit";

/**
 * The two things the graph asks the server for after first paint: more of the
 * network, and the evidence behind one edge.
 *
 * Both are reads. The graph has no write path at all, so nothing a researcher
 * does while exploring can change the record.
 */

export type ExpansionResult = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  degrees: Record<string, number>;
  truncated: boolean;
};

/**
 * One hop out from a node the researcher clicked.
 *
 * Depth is fixed at 1 rather than taken from the caller: expansion is meant to
 * be a step the reader takes deliberately, and a click that quietly pulled four
 * hops would put a network on screen that nobody chose to look at.
 */
export async function expandNodeAction(
  type: string,
  id: string,
  window?: { yearFrom?: number; yearTo?: number },
  includeInterpretive = false,
): Promise<ExpansionResult | RateLimited> {
  const refused = await guardLimit("graph");
  if (refused) return refused;
  const result = await neighbourhood(
    { type, id },
    {
      depth: 1,
      yearFrom: window?.yearFrom,
      yearTo: window?.yearTo,
      includeInterpretive,
      maxNodes: 60,
    },
  );
  const deg = await degrees(result.nodes.map((n) => ({ type: n.type, id: n.id })));
  return {
    nodes: result.nodes,
    edges: result.edges,
    degrees: Object.fromEntries(deg),
    truncated: result.truncated,
  };
}

export async function edgeEvidenceAction(
  citationSubject: string,
  citationSubjectId: string,
): Promise<EdgeEvidence[] | RateLimited> {
  const refused = await guardLimit("graph");
  if (refused) return refused;
  return edgeEvidence(citationSubject, citationSubjectId);
}
