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
    { tags: [tags.state(stateId)] },
  )(stateId);
}
