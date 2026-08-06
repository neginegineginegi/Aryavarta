import { and, asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { indicatorValues, indicators } from "@/lib/db/schema";
import { tags } from "@/lib/cache";

export type IndicatorValuePoint = {
  year: number;
  value: string;
  sourceTitle: string;
  sourceUrl: string;
  reportingPeriod: string | null;
  reportingOrg: string | null;
  notes: string | null;
  verifiedOn: string;
};

export type IndicatorSeries = {
  id: string;
  name: string;
  unit: string;
  category: string;
  methodology: string;
  values: IndicatorValuePoint[]; // ascending by year
};

/**
 * All development-indicator series for one state, grouped by category.
 * Strictly factual presentation data: the Development Lens never scores,
 * ranks, or grades governments, and every value names its source.
 */
async function fetchDevelopment(stateId: string): Promise<Map<string, IndicatorSeries[]>> {
  const rows = await db
    .select({
      id: indicators.id,
      name: indicators.name,
      unit: indicators.unit,
      category: indicators.category,
      methodology: indicators.methodology,
      displayOrder: indicators.displayOrder,
      year: indicatorValues.year,
      value: indicatorValues.value,
      sourceTitle: indicatorValues.sourceTitle,
      sourceUrl: indicatorValues.sourceUrl,
      reportingPeriod: indicatorValues.reportingPeriod,
      reportingOrg: indicatorValues.reportingOrg,
      notes: indicatorValues.notes,
      verifiedOn: indicatorValues.verifiedOn,
    })
    .from(indicatorValues)
    .innerJoin(indicators, eq(indicatorValues.indicatorId, indicators.id))
    .where(and(eq(indicatorValues.stateId, stateId)))
    .orderBy(asc(indicators.displayOrder), asc(indicators.name), asc(indicatorValues.year));

  const seriesById = new Map<string, IndicatorSeries>();
  for (const r of rows) {
    const s = seriesById.get(r.id) ?? {
      id: r.id,
      name: r.name,
      unit: r.unit,
      category: r.category,
      methodology: r.methodology,
      values: [],
    };
    s.values.push({
      year: r.year,
      value: r.value,
      sourceTitle: r.sourceTitle,
      sourceUrl: r.sourceUrl,
      reportingPeriod: r.reportingPeriod,
      reportingOrg: r.reportingOrg,
      notes: r.notes,
      verifiedOn: r.verifiedOn,
    });
    seriesById.set(r.id, s);
  }

  const byCategory = new Map<string, IndicatorSeries[]>();
  for (const s of seriesById.values()) {
    const arr = byCategory.get(s.category);
    if (arr) arr.push(s);
    else byCategory.set(s.category, [s]);
  }
  return byCategory;
}

export function getDevelopment(stateId: string) {
  return unstable_cache(
    async (id: string) => {
      // Map is not JSON-serializable through the cache; ship entries.
      const grouped = await fetchDevelopment(id);
      return [...grouped.entries()];
    },
    ["development", stateId],
    // Curated data loads at build time (no updateTag possible), so this
    // cache must also expire on a clock, not only on approval events.
    { tags: [tags.state(stateId)], revalidate: 3600 },
  )(stateId);
}

export type IndicatorDefinition = {
  id: string;
  name: string;
  unit: string;
  category: string;
  methodology: string;
};

export type IndicatorStateSeries = {
  stateId: string;
  stateName: string;
  isUnion: boolean;
  values: IndicatorValuePoint[]; // ascending by year
};

/** One indicator across every state that has data: the /indicator/[id] page. */
export async function getIndicatorAcrossStates(indicatorId: string): Promise<{
  indicator: IndicatorDefinition;
  series: IndicatorStateSeries[];
} | null> {
  const { states } = await import("@/lib/db/schema");
  const def = await db.query.indicators.findFirst({
    where: eq(indicators.id, indicatorId),
  });
  if (!def) return null;

  const rows = await db
    .select({
      stateId: indicatorValues.stateId,
      stateName: states.name,
      stateKind: states.kind,
      year: indicatorValues.year,
      value: indicatorValues.value,
      sourceTitle: indicatorValues.sourceTitle,
      sourceUrl: indicatorValues.sourceUrl,
      reportingPeriod: indicatorValues.reportingPeriod,
      reportingOrg: indicatorValues.reportingOrg,
      notes: indicatorValues.notes,
      verifiedOn: indicatorValues.verifiedOn,
    })
    .from(indicatorValues)
    .innerJoin(states, eq(indicatorValues.stateId, states.id))
    .where(eq(indicatorValues.indicatorId, indicatorId))
    .orderBy(asc(states.name), asc(indicatorValues.year));

  const byState = new Map<string, IndicatorStateSeries>();
  for (const r of rows) {
    const s = byState.get(r.stateId) ?? {
      stateId: r.stateId,
      stateName: r.stateName,
      isUnion: r.stateKind === "union",
      values: [],
    };
    s.values.push({
      year: r.year,
      value: r.value,
      sourceTitle: r.sourceTitle,
      sourceUrl: r.sourceUrl,
      reportingPeriod: r.reportingPeriod,
      reportingOrg: r.reportingOrg,
      notes: r.notes,
      verifiedOn: r.verifiedOn,
    });
    byState.set(r.stateId, s);
  }
  // National series first, then states alphabetically.
  const series = [...byState.values()].sort(
    (a, b) => Number(b.isUnion) - Number(a.isUnion) || a.stateName.localeCompare(b.stateName),
  );
  return {
    indicator: {
      id: def.id,
      name: def.name,
      unit: def.unit,
      category: def.category,
      methodology: def.methodology,
    },
    series,
  };
}

export async function getAllIndicators(): Promise<IndicatorDefinition[]> {
  const rows = await db.select().from(indicators).orderBy(asc(indicators.category), asc(indicators.name));
  return rows.map((r) => ({ id: r.id, name: r.name, unit: r.unit, category: r.category, methodology: r.methodology }));
}
