import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { events, parties, states, terms } from "@/lib/db/schema";
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
  async (): Promise<Omit<MapData, "maxYear" | "markers">> => {
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
    // DISTINCT ON picks one event per year: the earliest dated, then the
    // earliest created, so the choice is stable between requests instead of
    // shuffling as rows are added.
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

export async function getMapData(): Promise<MapData> {
  const [cached, markers] = await Promise.all([getCachedMapData(), getCachedMapMarkers()]);
  return { ...cached, markers, maxYear: new Date().getFullYear() };
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
  minYear: number;
  maxYear: number;
};

/**
 * The /union map payload: PM and President terms only. In Union mode the
 * whole map takes one color (the PM's party), so no per-state data is needed.
 * Same maxYear-outside-the-cache rule as getMapData.
 */
const getCachedUnionMapData = unstable_cache(
  async (): Promise<Omit<UnionMapData, "maxYear">> => {
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
  const cached = await getCachedUnionMapData();
  return { ...cached, maxYear: new Date().getFullYear() };
}
