import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import {
  elections,
  events,
  states,
} from "@/lib/db/schema";
import { tags } from "@/lib/cache";

export type SourceRef = {
  id: string;
  title: string;
  url: string;
  publisher: string | null;
  publishedOn: string | null;
  accessedOn: string | null;
};

export type TermWithSources = {
  id: string;
  kind: "cm" | "presidents_rule" | "pm" | "president" | "governor";
  cmName: string | null;
  partyId: string | null;
  partyName: string | null;
  partyAbbreviation: string | null;
  partyColor: string | null;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  sources: SourceRef[];
};

export type ElectionWithResults = {
  id: string;
  electionDate: string;
  resultSummary: string | null;
  totalSeats: number | null;
  turnoutPercent: string | null;
  results: Array<{
    partyId: string;
    partyName: string;
    partyAbbreviation: string | null;
    partyColor: string;
    seatsWon: number;
    voteSharePercent: string | null;
  }>;
  sources: SourceRef[];
};

export type EventSummary = {
  id: string;
  year: number;
  eventDate: string | null;
  type: string;
  title: string;
  description: string;
  status: string;
  sources: SourceRef[];
};

export type StateArticle = {
  state: {
    id: string;
    name: string;
    kind: "state" | "union_territory" | "union";
    formedOn: string | null;
    dissolvedOn: string | null;
    hasGeometry: boolean;
  };
  terms: TermWithSources[];
  elections: ElectionWithResults[];
  events: EventSummary[];
};

async function fetchStateArticle(stateId: string): Promise<StateArticle | null> {
  const state = await db.query.states.findFirst({ where: eq(states.id, stateId) });
  if (!state) return null;

  const [termRows, electionRows, eventRows] = await Promise.all([
    db.query.terms.findMany({
      where: (t) => and(eq(t.stateId, stateId), isNull(t.deletedAt)),
      orderBy: (t) => [desc(t.startDate)],
      with: {
        party: true,
        sources: { with: { source: true } },
      },
    }),
    db.query.elections.findMany({
      where: and(eq(elections.stateId, stateId), isNull(elections.deletedAt)),
      orderBy: [desc(elections.electionDate)],
      with: {
        results: { with: { party: true } },
        sources: { with: { source: true } },
      },
    }),
    db.query.events.findMany({
      // Disputed entries remain part of the public record (flagged in the
      // UI), so they appear here alongside published ones.
      where: and(
        eq(events.stateId, stateId),
        isNull(events.deletedAt),
        inArray(events.status, ["published", "disputed"]),
      ),
      orderBy: [desc(events.year), asc(events.title)],
      with: {
        sources: { with: { source: true } },
      },
    }),
  ]);

  return {
    state: {
      id: state.id,
      name: state.name,
      kind: state.kind,
      formedOn: state.formedOn,
      dissolvedOn: state.dissolvedOn,
      hasGeometry: state.hasGeometry,
    },
    terms: termRows.map((t) => ({
      id: t.id,
      kind: t.kind,
      cmName: t.cmName,
      partyId: t.partyId,
      partyName: t.party?.name ?? null,
      partyAbbreviation: t.party?.abbreviation ?? null,
      partyColor: t.party?.color ?? null,
      startDate: t.startDate,
      endDate: t.endDate,
      notes: t.notes,
      sources: t.sources.map((s) => toSourceRef(s.source)),
    })),
    elections: electionRows.map((e) => ({
      id: e.id,
      electionDate: e.electionDate,
      resultSummary: e.resultSummary,
      totalSeats: e.totalSeats,
      turnoutPercent: e.turnoutPercent,
      results: e.results
        .slice()
        .sort((a, b) => b.seatsWon - a.seatsWon)
        .map((r) => ({
          partyId: r.partyId,
          partyName: r.party.name,
          partyAbbreviation: r.party.abbreviation,
          partyColor: r.party.color,
          seatsWon: r.seatsWon,
          voteSharePercent: r.voteSharePercent,
        })),
      sources: e.sources.map((s) => toSourceRef(s.source)),
    })),
    events: eventRows.map((ev) => ({
      id: ev.id,
      year: ev.year,
      eventDate: ev.eventDate,
      type: ev.type,
      title: ev.title,
      description: ev.description,
      status: ev.status,
      sources: ev.sources.map((s) => toSourceRef(s.source)),
    })),
  };
}

function toSourceRef(s: {
  id: string;
  title: string;
  url: string;
  publisher: string | null;
  publishedOn: string | null;
  accessedOn: string | null;
}): SourceRef {
  return {
    id: s.id,
    title: s.title,
    url: s.url,
    publisher: s.publisher,
    publishedOn: s.publishedOn,
    accessedOn: s.accessedOn,
  };
}

export function getStateArticle(stateId: string) {
  return unstable_cache(fetchStateArticle, ["state-article", stateId], {
    tags: [tags.state(stateId)],
  })(stateId);
}

export async function getAllStateIds(): Promise<string[]> {
  const rows = await db.select({ id: states.id }).from(states);
  return rows.map((r) => r.id);
}
