import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { HistoryList } from "@/components/diff/HistoryList";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { getEntityHistory } from "@/lib/db/queries/revisions";

export const metadata: Metadata = { title: "Event history" };

export default async function EventHistoryPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(eventId)) notFound();
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { id: true, title: true, stateId: true },
    with: { state: { columns: { name: true } } },
  });
  if (!event) notFound();
  const rows = await getEntityHistory("event", eventId);

  return (
    <div className="mx-auto max-w-4xl px-5 pb-10">
      <header className="border-b border-rule py-7">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href={`/state/${event.stateId}`} className="hover:text-ink">
            {event.state.name}
          </Link>
          <span className="mx-1.5">/</span>
          <Link href={`/event/${event.id}`} className="hover:text-ink">Event</Link>
          <span className="mx-1.5">/</span>
          <span>History</span>
        </nav>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">
          Revision history — {event.title}
        </h1>
      </header>
      <section className="py-6">
        <HistoryList rows={rows} />
      </section>
    </div>
  );
}
