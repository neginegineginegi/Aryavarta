import { and, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { elections, terms } from "@/lib/db/schema";
import {
  computeInsights,
  type InsightElectionRow,
  type InsightGroup,
  type InsightTermRow,
} from "@/lib/insights";

export async function fetchInsightRows(): Promise<{
  termRows: InsightTermRow[];
  electionRows: InsightElectionRow[];
}> {
  const [termRowsRaw, electionRowsRaw] = await Promise.all([
    db.query.terms.findMany({
      where: isNull(terms.deletedAt),
      with: {
        state: { columns: { id: true, name: true } },
        party: { columns: { id: true, name: true } },
      },
    }),
    db.query.elections.findMany({
      where: and(isNull(elections.deletedAt)),
      with: {
        state: { columns: { id: true, name: true } },
        results: { with: { party: { columns: { name: true } } } },
      },
    }),
  ]);

  return {
    termRows: termRowsRaw.map((t) => ({
      id: t.id,
      stateId: t.stateId,
      stateName: t.state.name,
      kind: t.kind,
      cmName: t.cmName,
      partyId: t.partyId,
      partyName: t.party?.name ?? null,
      startDate: t.startDate,
      endDate: t.endDate,
    })),
    electionRows: electionRowsRaw.map((e) => ({
      id: e.id,
      stateId: e.stateId,
      stateName: e.state.name,
      scope: e.scope,
      electionDate: e.electionDate,
      totalSeats: e.totalSeats,
      turnoutPercent: e.turnoutPercent,
      results: e.results.map((r) => ({
        partyId: r.partyId,
        partyName: r.party.name,
        seatsWon: r.seatsWon,
      })),
    })),
  };
}

export const getInsights = unstable_cache(
  async (): Promise<{ groups: InsightGroup[]; termCount: number; electionCount: number }> => {
    const { termRows, electionRows } = await fetchInsightRows();
    const today = new Date().toISOString().slice(0, 10);
    return {
      groups: computeInsights(termRows, electionRows, today),
      termCount: termRows.length,
      electionCount: electionRows.length,
    };
  },
  ["insights"],
  { revalidate: 300 },
);
