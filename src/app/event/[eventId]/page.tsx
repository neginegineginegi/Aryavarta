import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { ReferenceList } from "@/components/ui/Citations";
import { getEvent } from "@/lib/db/queries/events";
import { EVENT_TYPE_LABELS, formatDate, type EventType } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  if (!event || event.status !== "published" || event.deletedAt) return {};
  return {
    title: `${event.title} (${event.stateName}, ${event.year})`,
    description: event.description.slice(0, 200),
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await getEvent(eventId);
  if (!event) notFound();

  // Tombstone for removed entries: the record of the removal stays public.
  if (event.deletedAt) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <p className="section-label">Removed entry</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-muted line-through decoration-ink-faint">
          {event.title}
        </h1>
        <p className="mt-4 max-w-xl text-[0.9rem] text-ink-muted">
          This entry was removed from the live record through the moderation process on{" "}
          {formatDate(event.deletedAt.slice(0, 10))}. Its full revision history — including the
          removal and who approved it — remains public.
        </p>
        <p className="mt-6 flex gap-4 text-[0.88rem]">
          <Link href={`/event/${event.id}/history`} className="text-accent underline-offset-2 hover:underline">
            View revision history →
          </Link>
          <Link href={`/state/${event.stateId}`} className="text-accent underline-offset-2 hover:underline">
            {event.stateName} page →
          </Link>
        </p>
      </div>
    );
  }

  // Unpublished (pending/draft/rejected) entries stay invisible to the
  // public; their content is inspectable via the public revision record.
  if (!["published", "disputed"].includes(event.status)) {
    notFound();
  }

  return (
    <article className="mx-auto max-w-3xl px-5 pb-10">
      <header className="border-b border-rule py-7">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/" className="hover:text-ink">Map</Link>
          <span className="mx-1.5">/</span>
          <Link href={`/state/${event.stateId}`} className="hover:text-ink">
            {event.stateName}
          </Link>
          <span className="mx-1.5">/</span>
          <Link href={`/state/${event.stateId}/${event.year}`} className="tabular-nums hover:text-ink">
            {event.year}
          </Link>
        </nav>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="type">{EVENT_TYPE_LABELS[event.type as EventType]}</Badge>
          {event.status === "disputed" && <Badge variant="disputed">Disputed</Badge>}
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight text-ink">
          {event.title}
        </h1>
        <p className="mt-2 text-[0.85rem] text-ink-muted">
          {event.stateName} ·{" "}
          <span className="tabular-nums">
            {event.eventDate ? formatDate(event.eventDate) : event.year}
          </span>
        </p>
      </header>

      <section className="prose-article border-b border-rule py-7 text-[0.95rem] text-ink">
        {event.description.split(/\n\n+/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </section>

      <section className="border-b border-rule py-7">
        <h2 className="section-label">Sources</h2>
        <ReferenceList sources={event.sources} />
      </section>

      <section className="flex flex-wrap gap-3 py-7 text-[0.85rem]">
        <Link
          href={`/contribute?edit=event:${event.id}`}
          className="rounded-sm border border-rule-dark px-3 py-1 text-ink transition-colors hover:border-ink"
        >
          Suggest an edit
        </Link>
        <Link
          href={`/event/${event.id}/history`}
          className="rounded-sm border border-rule-dark px-3 py-1 text-ink transition-colors hover:border-ink"
        >
          Edit history
        </Link>
        <Link
          href={`/event/${event.id}/report`}
          className="rounded-sm border border-rule-dark px-3 py-1 text-ink-muted transition-colors hover:border-disputed hover:text-disputed"
        >
          Report an issue
        </Link>
      </section>
    </article>
  );
}
