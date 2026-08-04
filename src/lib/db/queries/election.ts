import { and, desc, eq, gte, isNull, lt, lte } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { elections, terms } from "@/lib/db/schema";
import { tags } from "@/lib/cache";
import type { SourceRef } from "@/lib/db/queries/state";
import type {
  AnalysisElection,
  AnalysisResult,
  FormedTerm,
} from "@/lib/election-analysis";

export type ElectionDetail = {
  election: AnalysisElection & { stateId: string };
  previous: (AnalysisElection & { stateId: string }) | null;
  formedTerm: FormedTerm | null;
  sources: SourceRef[];
};

function toAnalysisResults(
  rows: Array<{
    partyId: string;
    seatsWon: number;
    voteSharePercent: string | null;
    allianceName: string | null;
    party: { name: string; abbreviation: string | null; color: string };
  }>,
): AnalysisResult[] {
  return rows
    .map((r) => ({
      partyId: r.partyId,
      partyName: r.party.name,
      partyAbbreviation: r.party.abbreviation,
      partyColor: r.party.color,
      seatsWon: r.seatsWon,
      voteSharePercent: r.voteSharePercent,
      allianceName: r.allianceName,
    }))
    .sort((a, b) => b.seatsWon - a.seatsWon);
}

async function fetchElectionDetail(electionId: string): Promise<ElectionDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(electionId)) return null;

  const row = await db.query.elections.findFirst({
    where: and(eq(elections.id, electionId), isNull(elections.deletedAt)),
    with: {
      state: true,
      results: { with: { party: true } },
      sources: { with: { source: true } },
    },
  });
  if (!row) return null;

  const toElection = (r: typeof row): AnalysisElection & { stateId: string } => ({
    id: r.id,
    stateId: r.stateId,
    stateName: r.state.name,
    stateKind: r.state.kind,
    scope: r.scope,
    electionDate: r.electionDate,
    assemblyNumber: r.assemblyNumber,
    totalSeats: r.totalSeats,
    turnoutPercent: r.turnoutPercent,
    results: toAnalysisResults(r.results),
  });

  // Previous election: same state and scope, latest before this one.
  const prevRow = await db.query.elections.findFirst({
    where: and(
      eq(elections.stateId, row.stateId),
      eq(elections.scope, row.scope),
      isNull(elections.deletedAt),
      lt(elections.electionDate, row.electionDate),
    ),
    orderBy: [desc(elections.electionDate)],
    with: {
      state: true,
      results: { with: { party: true } },
    },
  });

  // Government formed: the first CM (or PM, for Lok Sabha elections) term
  // starting within 90 days after polling.
  const plus90 = new Date(`${row.electionDate}T00:00:00Z`);
  plus90.setUTCDate(plus90.getUTCDate() + 90);
  const termRow = await db.query.terms.findFirst({
    where: and(
      eq(terms.stateId, row.stateId),
      eq(terms.kind, row.scope === "lok_sabha" ? "pm" : "cm"),
      isNull(terms.deletedAt),
      gte(terms.startDate, row.electionDate),
      lte(terms.startDate, plus90.toISOString().slice(0, 10)),
    ),
    orderBy: [terms.startDate],
    with: { party: true },
  });

  return {
    election: toElection(row),
    previous: prevRow ? toElection(prevRow as typeof row) : null,
    formedTerm: termRow
      ? {
          cmName: termRow.cmName,
          partyId: termRow.partyId,
          partyName: termRow.party?.name ?? null,
          startDate: termRow.startDate,
          endDate: termRow.endDate,
        }
      : null,
    sources: row.sources.map((s) => ({
      id: s.source.id,
      title: s.source.title,
      url: s.source.url,
      publisher: s.source.publisher,
      publishedOn: s.source.publishedOn,
      accessedOn: s.source.accessedOn,
    })),
  };
}

export function getElectionDetail(electionId: string) {
  return unstable_cache(fetchElectionDetail, ["election-detail", electionId], {
    // Election approvals bust the tag; the short TTL picks up indirect
    // changes (e.g. a newly approved CM term that becomes 'government formed').
    tags: [tags.election(electionId)],
    revalidate: 300,
  })(electionId);
}
