import { and, count, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { events, reports } from "@/lib/db/schema";
import { tags } from "@/lib/cache";
import type { SourceRef } from "@/lib/db/queries/state";

export type EventDetail = {
  id: string;
  stateId: string;
  stateName: string;
  year: number;
  eventDate: string | null;
  type: string;
  title: string;
  description: string;
  status: string;
  deletedAt: string | null;
  createdAt: string;
  sources: SourceRef[];
  openDisputes: number;
};

async function fetchEvent(eventId: string): Promise<EventDetail | null> {
  const row = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    with: {
      state: true,
      sources: { with: { source: true } },
    },
  });
  if (!row) return null;
  const [{ n: openDisputes }] = await db
    .select({ n: count() })
    .from(reports)
    .where(
      and(
        eq(reports.entityType, "event"),
        eq(reports.entityId, eventId),
        eq(reports.kind, "dispute"),
        eq(reports.status, "open"),
      ),
    );
  return {
    id: row.id,
    stateId: row.stateId,
    stateName: row.state.name,
    year: row.year,
    eventDate: row.eventDate,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    sources: row.sources.map((s) => ({
      id: s.source.id,
      title: s.source.title,
      url: s.source.url,
      publisher: s.source.publisher,
      publishedOn: s.source.publishedOn,
      accessedOn: s.source.accessedOn,
    })),
    openDisputes,
  };
}

export function getEvent(eventId: string) {
  return unstable_cache(fetchEvent, ["event-detail", eventId], {
    tags: [tags.event(eventId)],
  })(eventId);
}
