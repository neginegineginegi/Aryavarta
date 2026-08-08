import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import {
  electionResults,
  elections,
  eventSources,
  events,
  parties,
  states,
  terms,
} from "@/lib/db/schema";
import { tags } from "@/lib/cache";
import { yearOf } from "@/lib/format";

export type MapTerm = {
  stateId: string;
  kind: "cm" | "presidents_rule";
  cmName: string | null;
  partyId: string | null;
  partyName: string | null;
  partyColor: string | null;
  startDate: string;
  endDate: string | null;
};

export type MapState = {
  id: string;
  name: string;
  hasGeometry: boolean;
  formedOn: string | null;
  dissolvedOn: string | null;
};

/**
 * A year the reader can jump to on the scrubber, and the record that makes it
 * worth jumping to.
 *
 * The design prototype hardcoded these ("1975 EMERGENCY DECLARED", "1991
 * ECONOMIC LIBERALISATION"). Real historical assertions with no source behind
 * them have no business being compiled into the bundle, so these come from
 * published union-scope events instead. If the archive holds none, the
 * scrubber simply has no markers rather than borrowed ones.
 */
export type MapMarker = {
  year: number;
  title: string;
  eventId: string;
};

export type MapData = {
  states: MapState[];
  terms: MapTerm[];
  markers: MapMarker[];
  facts: MapFact[];
  minYear: number;
  maxYear: number;
};

/**
 * Everything the home-page map needs, in one cached payload. The whole
 * dataset (≤ ~40 states x a few dozen terms) is small enough to ship once;
 * the year slider then recolors entirely client-side.
 *
 * maxYear is deliberately computed OUTSIDE the cached function: the cache is
 * tag-invalidated (not time-invalidated), so a baked-in "current year" would
 * go stale after December 31.
 */
const getCachedMapData = unstable_cache(
  async (): Promise<Omit<MapData, "maxYear" | "markers" | "facts">> => {
    const [stateRows, termRows] = await Promise.all([
      db
        .select({
          id: states.id,
          name: states.name,
          hasGeometry: states.hasGeometry,
          formedOn: states.formedOn,
          dissolvedOn: states.dissolvedOn,
        })
        .from(states)
        .orderBy(asc(states.name)),
      db
        .select({
          stateId: terms.stateId,
          kind: terms.kind,
          cmName: terms.cmName,
          partyId: terms.partyId,
          partyName: parties.name,
          partyColor: parties.color,
          startDate: terms.startDate,
          endDate: terms.endDate,
        })
        .from(terms)
        .leftJoin(parties, eq(terms.partyId, parties.id))
        // The map shows state governments only; union (pm/president) terms
        // live on /union and would bloat the payload for no pixel.
        .where(and(isNull(terms.deletedAt), inArray(terms.kind, ["cm", "presidents_rule"])))
        .orderBy(asc(terms.startDate)),
    ]);

    const minYear = termRows.length
      ? Math.min(...termRows.map((t) => yearOf(t.startDate)))
      : 1950;

    return {
      states: stateRows,
      // Safe cast: the inArray filter above restricts kinds to cm/presidents_rule.
      terms: termRows as MapTerm[],
      minYear: Math.max(1947, minYear),
    };
  },
  ["map-data"],
  { tags: [tags.mapData] },
);

/**
 * One marker per year, drawn from published union-scope events.
 *
 * Cached separately from the map payload rather than folded into it: the map
 * cache is tag-invalidated on term changes, and an approved event would not
 * bust that tag, so a marker added today would not appear until something
 * unrelated changed. A short time-based cache keeps the staleness bounded and
 * the invalidation honest.
 */
const getCachedMapMarkers = unstable_cache(
  async (): Promise<MapMarker[]> => {
    // DISTINCT ON picks one event per year. A record that cites a source wins
    // over one that cites none, then the earliest dated, then the earliest
    // created, so the choice is stable between requests instead of shuffling
    // as rows are added. Sourced-first is not a tie-break detail: the seeded
    // placeholder for 1984 carries a date and no source, so ordering by date
    // alone put "DEMO: Placeholder national record" on the public timeline in
    // front of Operation Blue Star, whose draft records only a year.
    const rows = await db
      .selectDistinctOn([events.year], {
        year: events.year,
        title: events.title,
        eventId: events.id,
      })
      .from(events)
      .where(
        and(
          eq(events.stateId, UNION_STATE_ID),
          eq(events.status, "published"),
          isNull(events.deletedAt),
        ),
      )
      .orderBy(
        asc(events.year),
        sql`exists (select 1 from ${eventSources} where ${eventSources.eventId} = ${events.id}) DESC`,
        sql`${events.eventDate} ASC NULLS LAST`,
        asc(events.createdAt),
      );
    return rows;
  },
  ["map-markers"],
  { revalidate: 300 },
);

/** The union pseudo-state; national records hang off it. */
const UNION_STATE_ID = "in";

/**
 * A line under the scrubber stating something the archive's own published
 * data shows for a year, linking to the election it came from.
 */
export type MapFact = {
  year: number;
  text: string;
  electionId: string;
};

/**
 * "From the record" facts, computed from published election results.
 *
 * The living-map prototype hardcoded these ("Sikkim, 2024: SKM won 31 of 32
 * seats"); here the same lines are derived from the elections actually in the
 * archive, so every one links to a cited record and every superlative is
 * scoped to the published record rather than asserted about history at large.
 * Nothing here is written by hand: if the data is not in the archive, the
 * fact does not exist.
 */
const getCachedMapFacts = unstable_cache(
  async (): Promise<MapFact[]> => {
    const rows = await db
      .select({
        id: elections.id,
        stateId: elections.stateId,
        stateName: states.name,
        scope: elections.scope,
        electionDate: elections.electionDate,
        totalSeats: elections.totalSeats,
        turnoutPercent: elections.turnoutPercent,
        seats: electionResults.seatsWon,
        partyName: parties.name,
        partyAbbreviation: parties.abbreviation,
      })
      .from(elections)
      .innerJoin(electionResults, eq(electionResults.electionId, elections.id))
      .innerJoin(parties, eq(electionResults.partyId, parties.id))
      .innerJoin(states, eq(elections.stateId, states.id))
      .where(isNull(elections.deletedAt));

    // Winner per election = largest party by seats, the same convention the
    // rest of the atlas uses.
    type Win = {
      id: string;
      stateName: string;
      scope: string;
      year: number;
      totalSeats: number | null;
      turnout: number | null;
      seats: number;
      party: string;
    };
    const byElection = new Map<string, Win>();
    for (const r of rows) {
      const cur = byElection.get(r.id);
      if (cur && cur.seats >= r.seats) continue;
      byElection.set(r.id, {
        id: r.id,
        stateName: r.stateName,
        scope: r.scope,
        year: yearOf(r.electionDate),
        totalSeats: r.totalSeats,
        turnout: r.turnoutPercent == null ? null : Number(r.turnoutPercent),
        seats: r.seats,
        party: r.partyAbbreviation ?? r.partyName,
      });
    }
    const wins = [...byElection.values()];
    if (wins.length === 0) return [];

    const facts: MapFact[] = [];
    const label = (w: Win) =>
      w.scope === "lok_sabha" ? "general election" : `${w.stateName} assembly election`;

    // Earliest election held in the archive.
    const first = wins.reduce((a, b) => (b.year < a.year ? b : a));
    facts.push({
      year: first.year,
      electionId: first.id,
      text: `The earliest election in the published record: the ${label(first)}, ${first.year}.`,
    });

    // Highest published turnout.
    const withTurnout = wins.filter((w) => w.turnout != null);
    if (withTurnout.length > 0) {
      const t = withTurnout.reduce((a, b) => (b.turnout! > a.turnout! ? b : a));
      facts.push({
        year: t.year,
        electionId: t.id,
        text: `${t.stateName}, ${t.year}: ${t.turnout}% turnout, the highest in the published record.`,
      });
    }

    // Largest seat share where the total is known.
    const withShare = wins.filter((w) => w.totalSeats != null && w.totalSeats > 0);
    if (withShare.length > 0) {
      const s = withShare.reduce((a, b) =>
        b.seats / b.totalSeats! > a.seats / a.totalSeats! ? b : a,
      );
      facts.push({
        year: s.year,
        electionId: s.id,
        text: `${s.stateName}, ${s.year}: ${s.party} won ${s.seats} of ${s.totalSeats} seats, the largest share in the published record.`,
      });
    }

    // Largest Lok Sabha winner by seats.
    const ls = wins.filter((w) => w.scope === "lok_sabha");
    if (ls.length > 0) {
      const big = ls.reduce((a, b) => (b.seats > a.seats ? b : a));
      facts.push({
        year: big.year,
        electionId: big.id,
        text: `${big.year}: ${big.party} won ${big.seats}${big.totalSeats ? ` of ${big.totalSeats}` : ""} Lok Sabha seats, the most in the published record.`,
      });
      const firstLs = ls.reduce((a, b) => (b.year < a.year ? b : a));
      facts.push({
        year: firstLs.year,
        electionId: firstLs.id,
        text: `${firstLs.year}: the earliest general election in the published record. ${firstLs.party} won ${firstLs.seats}${firstLs.totalSeats ? ` of ${firstLs.totalSeats}` : ""} seats.`,
      });
    }

    // Most recent election, so the right-hand end of the timeline has a line.
    const last = wins.reduce((a, b) => (b.year > a.year ? b : a));
    facts.push({
      year: last.year,
      electionId: last.id,
      text: `The most recent election in the record: the ${label(last)}, ${last.year}. ${last.party} won ${last.seats}${last.totalSeats ? ` of ${last.totalSeats}` : ""} seats.`,
    });

    // One fact per year, earliest-added wins, sorted for the scrubber.
    const byYear = new Map<number, MapFact>();
    for (const f of facts) if (!byYear.has(f.year)) byYear.set(f.year, f);
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  },
  ["map-facts"],
  { revalidate: 300 },
);

export async function getMapData(): Promise<MapData> {
  const [cached, markers, facts] = await Promise.all([
    getCachedMapData(),
    getCachedMapMarkers(),
    getCachedMapFacts(),
  ]);
  return { ...cached, markers, facts, maxYear: new Date().getFullYear() };
}

export type UnionTerm = {
  kind: "pm" | "president";
  cmName: string | null;
  partyId: string | null;
  partyName: string | null;
  partyColor: string | null;
  startDate: string;
  endDate: string | null;
};

export type UnionMapData = {
  terms: UnionTerm[];
  markers: MapMarker[];
  facts: MapFact[];
  minYear: number;
  maxYear: number;
};

/**
 * The /union map payload: PM and President terms only. In Union mode the
 * whole map takes one color (the PM's party), so no per-state data is needed.
 * Same maxYear-outside-the-cache rule as getMapData.
 */
const getCachedUnionMapData = unstable_cache(
  async (): Promise<Omit<UnionMapData, "maxYear" | "markers" | "facts">> => {
    const termRows = await db
      .select({
        kind: terms.kind,
        cmName: terms.cmName,
        partyId: terms.partyId,
        partyName: parties.name,
        partyColor: parties.color,
        startDate: terms.startDate,
        endDate: terms.endDate,
      })
      .from(terms)
      .leftJoin(parties, eq(terms.partyId, parties.id))
      .where(
        and(
          eq(terms.stateId, "in"),
          isNull(terms.deletedAt),
          inArray(terms.kind, ["pm", "president"]),
        ),
      )
      .orderBy(asc(terms.startDate));

    const minYear = termRows.length
      ? Math.min(...termRows.map((t) => yearOf(t.startDate)))
      : 1947;

    return {
      // Safe cast: the inArray filter above restricts kinds to pm/president.
      terms: termRows as UnionTerm[],
      minYear: Math.max(1947, minYear),
    };
  },
  ["union-map-data"],
  { tags: [tags.mapData, tags.state("in")] },
);

export async function getUnionMapData(): Promise<UnionMapData> {
  // The same marker and fact sets the state map uses: national records
  // belong on both scrubbers.
  const [cached, markers, facts] = await Promise.all([
    getCachedUnionMapData(),
    getCachedMapMarkers(),
    getCachedMapFacts(),
  ]);
  return { ...cached, markers, facts, maxYear: new Date().getFullYear() };
}
