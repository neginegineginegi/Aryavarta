import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { elections, events, states, terms } from "@/lib/db/schema";
import { tags } from "@/lib/cache";

export type ArchiveStats = {
  states: number;
  terms: number;
  events: number;
  sources: number;
  elections: number;
};

export const getArchiveStats = unstable_cache(
  async (): Promise<ArchiveStats> => {
    const [[s], [t], [e], cited, [el]] = await Promise.all([
      db.select({ n: count() }).from(states),
      db.select({ n: count() }).from(terms).where(isNull(terms.deletedAt)),
      db
        .select({ n: count() })
        .from(events)
        .where(and(inArray(events.status, ["published", "disputed"]), isNull(events.deletedAt))),
      // Only sources actually cited by live content count toward the tally.
      db.execute(sql`
        SELECT count(DISTINCT source_id)::int AS n FROM (
          SELECT source_id FROM term_sources
          UNION ALL SELECT source_id FROM election_sources
          UNION ALL SELECT source_id FROM event_sources
        ) cited
      `),
      db.select({ n: count() }).from(elections).where(isNull(elections.deletedAt)),
    ]);
    return {
      states: s.n,
      terms: t.n,
      events: e.n,
      sources: Number((cited.rows[0] as { n: number }).n),
      elections: el.n,
    };
  },
  ["archive-stats"],
  // Short time-based revalidation: event publications don't touch the
  // map-data tag, so freshness here comes from time, not tags.
  { tags: [tags.mapData], revalidate: 300 },
);
