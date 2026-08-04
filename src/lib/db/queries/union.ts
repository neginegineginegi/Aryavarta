import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { elections, events, terms } from "@/lib/db/schema";
import { tags } from "@/lib/cache";
import type {
  ElectionWithResults,
  EventSummary,
  TermWithSources,
} from "@/lib/db/queries/state";

export const UNION_ID = "in";

export type UnionOverview = {
  pmTerms: TermWithSources[];
  presidentTerms: TermWithSources[];
  elections: ElectionWithResults[];
  events: EventSummary[];
};

const toSourceRef = (s: {
  id: string;
  title: string;
  url: string;
  publisher: string | null;
  publishedOn: string | null;
  accessedOn: string | null;
}) => ({
  id: s.id,
  title: s.title,
  url: s.url,
  publisher: s.publisher,
  publishedOn: s.publishedOn,
  accessedOn: s.accessedOn,
});

async function fetchUnionOverview(): Promise<UnionOverview> {
  const [termRows, electionRows, eventRows] = await Promise.all([
    db.query.terms.findMany({
      where: (t) =>
        and(eq(t.stateId, UNION_ID), isNull(t.deletedAt), inArray(t.kind, ["pm", "president"])),
      orderBy: (t) => [desc(t.startDate)],
      with: { party: true, sources: { with: { source: true } } },
    }),
    db.query.elections.findMany({
      where: and(eq(elections.stateId, UNION_ID), isNull(elections.deletedAt)),
      orderBy: [desc(elections.electionDate)],
      with: {
        results: { with: { party: true } },
        sources: { with: { source: true } },
      },
    }),
    db.query.events.findMany({
      where: and(
        eq(events.stateId, UNION_ID),
        isNull(events.deletedAt),
        inArray(events.status, ["published", "disputed"]),
      ),
      orderBy: [desc(events.year), asc(events.title)],
      with: { sources: { with: { source: true } } },
    }),
  ]);

  const mapTerm = (t: (typeof termRows)[number]): TermWithSources => ({
    id: t.id,
    kind: t.kind as TermWithSources["kind"],
    cmName: t.cmName,
    partyId: t.partyId,
    partyName: t.party?.name ?? null,
    partyAbbreviation: t.party?.abbreviation ?? null,
    partyColor: t.party?.color ?? null,
    startDate: t.startDate,
    endDate: t.endDate,
    notes: t.notes,
    sources: t.sources.map((s) => toSourceRef(s.source)),
  });

  return {
    pmTerms: termRows.filter((t) => t.kind === "pm").map(mapTerm),
    presidentTerms: termRows.filter((t) => t.kind === "president").map(mapTerm),
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

export const getUnionOverview = unstable_cache(fetchUnionOverview, ["union-overview"], {
  // Union content lives on stateId 'in', so approvals revalidate this tag.
  tags: [tags.state(UNION_ID)],
});
