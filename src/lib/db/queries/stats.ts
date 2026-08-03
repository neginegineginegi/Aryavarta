import { and, count, eq, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { events, sources, states, terms } from "@/lib/db/schema";
import { tags } from "@/lib/cache";

export type ArchiveStats = {
  states: number;
  terms: number;
  events: number;
  sources: number;
};

export const getArchiveStats = unstable_cache(
  async (): Promise<ArchiveStats> => {
    const [[s], [t], [e], [src]] = await Promise.all([
      db.select({ n: count() }).from(states),
      db.select({ n: count() }).from(terms).where(isNull(terms.deletedAt)),
      db
        .select({ n: count() })
        .from(events)
        .where(and(eq(events.status, "published"), isNull(events.deletedAt))),
      db.select({ n: count() }).from(sources),
    ]);
    return { states: s.n, terms: t.n, events: e.n, sources: src.n };
  },
  ["archive-stats"],
  { tags: [tags.mapData], revalidate: 3600 },
);
