import { asc, eq, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { parties, states, terms } from "@/lib/db/schema";
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
  dissolvedOn: string | null;
};

export type MapData = {
  states: MapState[];
  terms: MapTerm[];
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
  async (): Promise<Omit<MapData, "maxYear">> => {
    const [stateRows, termRows] = await Promise.all([
      db
        .select({
          id: states.id,
          name: states.name,
          hasGeometry: states.hasGeometry,
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
        .where(isNull(terms.deletedAt))
        .orderBy(asc(terms.startDate)),
    ]);

    const minYear = termRows.length
      ? Math.min(...termRows.map((t) => yearOf(t.startDate)))
      : 1950;

    return {
      states: stateRows,
      terms: termRows,
      minYear: Math.max(1947, minYear),
    };
  },
  ["map-data"],
  { tags: [tags.mapData] },
);

export async function getMapData(): Promise<MapData> {
  const cached = await getCachedMapData();
  return { ...cached, maxYear: new Date().getFullYear() };
}
