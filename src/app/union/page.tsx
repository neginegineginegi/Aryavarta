import type { Metadata } from "next";
import Link from "next/link";

import { TimelineBand } from "@/components/state/TimelineBand";
import { personSlug } from "@/lib/db/queries/person";
import { Badge } from "@/components/ui/Badge";
import { buildCitationIndex, CiteMarks, ReferenceList } from "@/components/ui/Citations";
import { PartyTag } from "@/components/ui/PartyTag";
import { getUnionOverview } from "@/lib/db/queries/union";
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_ORDER,
  formatDate,
  formatNumber,
  formatTermRange,
  yearOf,
  type EventType,
} from "@/lib/format";
import type { TermWithSources } from "@/lib/db/queries/state";

export const metadata: Metadata = {
  title: "Union Government",
  description:
    "Prime Ministers, Presidents, Lok Sabha elections, and national governance events of the Republic of India. Sourced, reviewed, and versioned.",
};

export const revalidate = 86400;

function TermTable({
  terms,
  office,
  numberOf,
  showParty = true,
}: {
  terms: TermWithSources[];
  office: string;
  numberOf: (sourceId: string) => number;
  showParty?: boolean;
}) {
  return (
    <table className="mt-4 w-full text-left text-[0.88rem]">
      <thead>
        <tr className="border-b border-rule-dark text-[0.72rem] uppercase tracking-wider text-ink-faint">
          <th className="py-2 pr-4 font-medium">Period</th>
          <th className="py-2 pr-4 font-medium">{office}</th>
          {showParty && <th className="py-2 pr-4 font-medium">Party</th>}
          <th className="py-2 font-medium sr-only">Sources</th>
        </tr>
      </thead>
      <tbody>
        {terms.map((t) => (
          <tr key={t.id} className="border-b border-rule align-baseline">
            <td className="py-2.5 pr-4 whitespace-nowrap tabular-nums text-ink-muted">
              <Link
                href={`/union/${yearOf(t.startDate)}`}
                className="hover:text-accent"
                title={formatTermRange(t.startDate, t.endDate)}
              >
                {yearOf(t.startDate)} – {t.endDate ? yearOf(t.endDate) : "present"}
              </Link>
            </td>
            <td className="py-2.5 pr-4">
              <Link
                href={`/person/${personSlug(t.cmName ?? "")}`}
                className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
              >
                {t.cmName}
              </Link>
              {t.notes ? <span className="block text-[0.8rem] text-ink-faint">{t.notes}</span> : null}
            </td>
            {showParty && (
              <td className="py-2.5 pr-4">
                {t.partyName && t.partyId ? (
                  <Link href={`/party/${t.partyId}`} className="hover:underline">
                    <PartyTag name={t.partyName} abbreviation={t.partyAbbreviation} color={t.partyColor} />
                  </Link>
                ) : t.partyName ? (
                  <PartyTag name={t.partyName} abbreviation={t.partyAbbreviation} color={t.partyColor} />
                ) : (
                  <span className="text-ink-faint">—</span>
                )}
              </td>
            )}
            <td className="py-2.5 text-right whitespace-nowrap">
              <CiteMarks sources={t.sources} numberOf={numberOf} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function UnionPage() {
  const { pmTerms, presidentTerms, elections, events } = await getUnionOverview();
  const maxYear = new Date().getFullYear();

  const citations = buildCitationIndex([
    ...pmTerms.map((t) => t.sources),
    ...presidentTerms.map((t) => t.sources),
    ...elections.map((e) => e.sources),
    ...events.map((e) => e.sources),
  ]);

  const eventsByType = new Map<EventType, typeof events>();
  for (const ev of events) {
    const key = ev.type as EventType;
    const arr = eventsByType.get(key);
    if (arr) arr.push(ev);
    else eventsByType.set(key, [ev]);
  }

  return (
    <article className="mx-auto max-w-4xl px-6 pb-12">
      <header className="border-b border-rule py-10">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/" className="hover:text-ink">Map</Link>
          <span className="mx-1.5">/</span>
          <span>Union Government</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-[2.75rem] font-semibold leading-tight tracking-tight text-ink">
            Union Government of India
          </h1>
          <Link
            href={`/contribute?state=in`}
            className="rounded-sm border border-rule-dark px-3 py-1 text-[0.82rem] text-ink transition-colors hover:border-ink"
          >
            Suggest an edit
          </Link>
        </div>
        <p className="mt-2 max-w-2xl text-[0.85rem] text-ink-muted">
          Prime Ministers, Presidents, Lok Sabha elections, and national governance events:
          the same sourced, reviewed, versioned record as every state, kept at the Union level.
        </p>
        {pmTerms.length > 0 && <TimelineBand terms={pmTerms} maxYear={maxYear} />}
      </header>

      <section className="border-b border-rule py-8">
        <h2 className="section-label">Prime Ministers</h2>
        {pmTerms.length === 0 ? (
          <EmptyNote what="Prime Minister terms" />
        ) : (
          <TermTable terms={pmTerms} office="Prime Minister" numberOf={citations.numberOf} />
        )}
      </section>

      <section className="border-b border-rule py-8">
        <h2 className="section-label">Presidents</h2>
        {presidentTerms.length === 0 ? (
          <EmptyNote what="President terms" />
        ) : (
          <TermTable
            terms={presidentTerms}
            office="President"
            numberOf={citations.numberOf}
            showParty={false}
          />
        )}
      </section>

      <section className="border-b border-rule py-8">
        <h2 className="section-label">Lok Sabha Elections</h2>
        {elections.length === 0 ? (
          <EmptyNote what="Lok Sabha elections" />
        ) : (
          <ul className="mt-4 space-y-3">
            {elections.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 text-[0.9rem]">
                <Link
                  href={`/election/${e.id}`}
                  className="font-display text-lg font-semibold text-ink underline-offset-4 hover:text-accent hover:underline"
                >
                  {formatDate(e.electionDate)}
                </Link>
                <span className="text-[0.8rem] text-ink-faint">
                  {e.totalSeats ? `${formatNumber(e.totalSeats)} seats` : null}
                  {e.turnoutPercent ? ` · ${e.turnoutPercent}% turnout` : null}
                </span>
                <CiteMarks sources={e.sources} numberOf={citations.numberOf} />
                <Link
                  href={`/election/${e.id}`}
                  className="text-[0.78rem] text-accent underline-offset-2 hover:underline"
                >
                  dashboard →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-b border-rule py-8">
        <h2 className="section-label">National Governance Record</h2>
        {events.length === 0 ? (
          <EmptyNote what="national events" />
        ) : (
          <div className="mt-4 space-y-6">
            {EVENT_TYPE_ORDER.filter((type) => eventsByType.has(type)).map((type) => (
              <div key={type}>
                <h3 className="flex items-baseline gap-2">
                  <Badge variant="type">{EVENT_TYPE_LABELS[type]}</Badge>
                  <span className="text-[0.75rem] text-ink-faint">
                    {eventsByType.get(type)!.length}
                  </span>
                </h3>
                <ul className="mt-2 space-y-2.5">
                  {eventsByType.get(type)!.map((ev) => (
                    <li key={ev.id} className="flex gap-3 text-[0.88rem]">
                      <Link
                        href={`/union/${ev.year}`}
                        className="w-12 shrink-0 tabular-nums text-ink-faint hover:text-accent"
                      >
                        {ev.year}
                      </Link>
                      <div>
                        <Link
                          href={`/event/${ev.id}`}
                          className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
                        >
                          {ev.title}
                        </Link>{" "}
                        <CiteMarks sources={ev.sources} numberOf={citations.numberOf} />
                        <p className="mt-0.5 line-clamp-2 max-w-2xl text-[0.83rem] text-ink-muted">
                          {ev.description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="py-7">
        <h2 className="section-label">References</h2>
        {citations.ordered.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-faint">
            No sources yet: this page has no published claims.
          </p>
        ) : (
          <ReferenceList sources={citations.ordered} />
        )}
      </section>
    </article>
  );
}

function EmptyNote({ what }: { what: string }) {
  return (
    <p className="mt-3 text-[0.85rem] text-ink-muted">
      No {what} recorded yet.{" "}
      <Link href="/contribute?state=in" className="text-accent underline-offset-2 hover:underline">
        Contribute →
      </Link>{" "}
      <span className="text-ink-faint">
        (administrators can pre-fill these via the import pipeline)
      </span>
    </p>
  );
}
