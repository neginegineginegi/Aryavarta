import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReportForm } from "@/components/reports/ReportForm";
import { getSessionUser } from "@/lib/authz";
import { getEvent } from "@/lib/db/queries/events";

export const metadata: Metadata = { title: "Report an issue" };

export default async function EventReportPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(eventId)) notFound();
  const event = await getEvent(eventId);
  if (!event || event.deletedAt || !["published", "disputed"].includes(event.status)) {
    notFound();
  }
  const user = await getSessionUser();

  return (
    <div className="mx-auto max-w-2xl px-5 pb-10">
      <header className="border-b border-rule py-7">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href={`/event/${event.id}`} className="hover:text-ink">Event</Link>
          <span className="mx-1.5">/</span>
          <span>Report</span>
        </nav>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">
          Report an issue or dispute
        </h1>
        <p className="mt-2 text-[0.85rem] text-ink-muted">
          This is the archive&rsquo;s correction mechanism — reports are reviewed by moderators
          and their resolutions are public. No account required.
        </p>
      </header>
      <div className="py-7">
        <ReportForm
          entityType="event"
          entityId={event.id}
          entityLabel={`${event.title} (${event.stateName}, ${event.year})`}
          isSignedIn={!!user}
          backHref={`/event/${event.id}`}
        />
      </div>
    </div>
  );
}
