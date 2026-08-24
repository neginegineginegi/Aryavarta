import type { Metadata } from "next";
import Link from "next/link";

import { getAccountabilityIndex } from "@/lib/db/queries/accountability";
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_ORDER,
  PROMISE_CATEGORY_LABELS,
  formatDate,
  formatNumber,
  type EventType,
} from "@/lib/format";

export const metadata: Metadata = {
  title: "Accountability",
  description:
    "What was promised in manifestos and what is recorded to have happened, each with its sources. The archive does not grade fulfilment.",
};

export const revalidate = 3600;

export default async function AccountabilityPage() {
  const index = await getAccountabilityIndex();

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <h1 className="font-display text-[clamp(34px,4.5vw,48px)] font-light leading-[1.05] text-ink">
          Accountability
        </h1>
        <p className="mt-3 max-w-2xl text-[0.95rem] text-ink-muted">
          Two records, side by side: what was promised, verbatim from the manifesto, and
          what is recorded to have happened, with sources. Abhilekh holds both and grades
          neither; the line between a promise and an outcome is the reader&apos;s to draw.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/archive" className="btn btn-secondary btn-sm">
            The media archive
          </Link>
        </div>
      </header>

      <section id="promises" className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">
          Manifesto promises
        </h2>
        <p className="mt-1 max-w-2xl text-[0.8rem] text-ink-faint">
          {index.promiseTotal > 0
            ? `${formatNumber(index.promiseTotal)} promises recorded from ${formatNumber(index.manifestos.length)} ${index.manifestos.length === 1 ? "manifesto" : "manifestos"}, each quoted verbatim with a page reference.`
            : "Promises are extracted verbatim from manifestos in the media archive, each with a page reference."}
        </p>
        {index.manifestos.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-muted">
            No promises recorded yet. They appear here as manifestos in the archive are
            catalogued.
          </p>
        ) : (
          <>
            <ul className="mt-4 space-y-2 text-[0.9rem]">
              {index.manifestos.map((m) => (
                <li key={m.documentId} className="flex flex-wrap items-baseline gap-x-2">
                  <Link
                    href={`/archive/${m.documentId}`}
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    {m.title}
                  </Link>
                  <span className="text-[0.78rem] text-ink-faint">
                    {m.partyAbbreviation ?? m.partyName ?? "party unrecorded"}
                    {m.publishedOn ? ` · ${formatDate(m.publishedOn)}` : ""} ·{" "}
                    {formatNumber(m.promiseCount)}{" "}
                    {m.promiseCount === 1 ? "promise" : "promises"}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <h3 className="font-mono text-[0.62rem] tracking-[0.06em] text-ink-muted">
                BY SUBJECT
              </h3>
              <ul className="mt-1.5 flex flex-wrap gap-2 text-[0.82rem]">
                {index.promisesByCategory.map((c) => (
                  <li
                    key={c.category}
                    className="rounded-sm border border-rule-dark px-2.5 py-1 text-ink"
                  >
                    {PROMISE_CATEGORY_LABELS[c.category] ?? c.category}{" "}
                    <span className="text-ink-faint">{formatNumber(c.n)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>

      <section id="events" className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">
          Recorded events
        </h2>
        <p className="mt-1 max-w-2xl text-[0.8rem] text-ink-faint">
          {index.eventTotal > 0
            ? `${formatNumber(index.eventTotal)} published events across ${formatNumber(index.eventStateCount)} ${index.eventStateCount === 1 ? "state" : "states"}. Every event cites its sources; disputed ones say so on their page.`
            : "Events are cited records of what happened: legislation, judgments, failures, schemes. Every one names its sources."}
        </p>
        {index.eventTotal === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-muted">
            No events published yet. Proposed events appear here once a moderator approves
            them.
          </p>
        ) : (
          <>
            <div className="mt-4">
              <h3 className="font-mono text-[0.62rem] tracking-[0.06em] text-ink-muted">
                BY KIND
              </h3>
              <ul className="mt-1.5 flex flex-wrap gap-2 text-[0.82rem]">
                {[...index.eventsByType]
                  .sort(
                    (a, b) =>
                      EVENT_TYPE_ORDER.indexOf(a.type as EventType) -
                      EVENT_TYPE_ORDER.indexOf(b.type as EventType),
                  )
                  .map((t) => (
                    <li
                      key={t.type}
                      className="rounded-sm border border-rule-dark px-2.5 py-1 text-ink"
                    >
                      {EVENT_TYPE_LABELS[t.type as EventType] ?? t.type}{" "}
                      <span className="text-ink-faint">{formatNumber(t.n)}</span>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="mt-5">
              <h3 className="font-mono text-[0.62rem] tracking-[0.06em] text-ink-muted">
                MOST RECENT
              </h3>
              <ul className="mt-1.5 space-y-1.5 text-[0.9rem]">
                {index.recentEvents.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                    <Link
                      href={`/event/${e.id}`}
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      {e.title}
                    </Link>
                    <span className="text-[0.78rem] text-ink-faint">
                      {e.stateName} · {e.eventDate ? formatDate(e.eventDate) : e.year} ·{" "}
                      {EVENT_TYPE_LABELS[e.type as EventType] ?? e.type}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[0.8rem] text-ink-faint">
                Every event also appears on its state&apos;s page and lights its year on the
                map.
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
