import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TimelineBand } from "@/components/state/TimelineBand";
import { Badge } from "@/components/ui/Badge";
import { buildCitationIndex, CiteMarks, ReferenceList } from "@/components/ui/Citations";
import { PartyTag } from "@/components/ui/PartyTag";
import { getAllStateIds, getStateArticle } from "@/lib/db/queries/state";
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_ORDER,
  formatDate,
  formatNumber,
  formatTermRange,
  yearOf,
  type EventType,
} from "@/lib/format";

export async function generateStaticParams() {
  const ids = await getAllStateIds();
  return ids.map((stateId) => ({ stateId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stateId: string }>;
}): Promise<Metadata> {
  const { stateId } = await params;
  const article = await getStateArticle(stateId);
  if (!article) return {};
  return {
    title: article.state.name,
    description: `Political history of ${article.state.name}: chief ministers, elections, and sourced governance events, year by year.`,
  };
}

export default async function StatePage({
  params,
}: {
  params: Promise<{ stateId: string }>;
}) {
  const { stateId } = await params;
  const article = await getStateArticle(stateId);
  if (!article) notFound();

  const { state, terms, elections, events } = article;
  const maxYear = new Date().getFullYear();

  // Footnote numbering follows document order: terms, then elections, then events.
  const citations = buildCitationIndex([
    ...terms.map((t) => t.sources),
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
    <article className="mx-auto max-w-4xl px-5 pb-10">
      {/* Masthead */}
      <header className="border-b border-rule py-7">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/" className="hover:text-ink">Map</Link>
          <span className="mx-1.5">/</span>
          <span>{state.name}</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
            {state.name}
          </h1>
          <Link
            href={`/contribute?state=${state.id}`}
            className="rounded-sm border border-rule-dark px-3 py-1 text-[0.82rem] text-ink transition-colors hover:border-ink"
          >
            Suggest an edit
          </Link>
        </div>
        <p className="mt-2 text-[0.85rem] text-ink-muted">
          {state.kind === "state" ? "State" : "Union Territory"}
          {state.formedOn ? <> · formed {formatDate(state.formedOn)}</> : null}
          {state.dissolvedOn ? (
            <>
              {" "}· <span className="text-danger">dissolved {formatDate(state.dissolvedOn)}</span>
            </>
          ) : null}
        </p>
        <TimelineBand terms={terms} maxYear={maxYear} />
      </header>

      {/* Chief Ministers */}
      <section className="border-b border-rule py-7">
        <h2 className="section-label">Chief Ministers &amp; Governments</h2>
        {terms.length === 0 ? (
          <EmptyNote entity="chief-minister terms" stateId={state.id} />
        ) : (
          <table className="mt-4 w-full text-left text-[0.88rem]">
            <thead>
              <tr className="border-b border-rule-dark text-[0.72rem] uppercase tracking-wider text-ink-faint">
                <th className="py-2 pr-4 font-medium">Period</th>
                <th className="py-2 pr-4 font-medium">Chief Minister</th>
                <th className="py-2 pr-4 font-medium">Party</th>
                <th className="py-2 font-medium sr-only">Sources</th>
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => (
                <tr key={t.id} className="border-b border-rule align-baseline">
                  <td className="py-2.5 pr-4 whitespace-nowrap tabular-nums text-ink-muted">
                    <Link
                      href={`/state/${state.id}/${yearOf(t.startDate)}`}
                      className="hover:text-accent"
                      title={formatTermRange(t.startDate, t.endDate)}
                    >
                      {yearOf(t.startDate)} – {t.endDate ? yearOf(t.endDate) : "present"}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4">
                    {t.kind === "presidents_rule" ? (
                      <span className="italic text-ink-muted">President&rsquo;s Rule</span>
                    ) : (
                      <span className="font-medium text-ink">{t.cmName}</span>
                    )}
                    {t.notes ? (
                      <span className="block text-[0.8rem] text-ink-faint">{t.notes}</span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-4">
                    {t.kind === "presidents_rule" ? (
                      <span className="text-ink-faint">—</span>
                    ) : (
                      <PartyTag name={t.partyName} abbreviation={t.partyAbbreviation} color={t.partyColor} />
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <CiteMarks sources={t.sources} numberOf={citations.numberOf} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Elections */}
      <section className="border-b border-rule py-7">
        <h2 className="section-label">Assembly Elections</h2>
        {elections.length === 0 ? (
          <EmptyNote entity="elections" stateId={state.id} />
        ) : (
          <div className="mt-4 space-y-7">
            {elections.map((e) => {
              const denominator = Math.max(
                e.totalSeats ?? 0,
                e.results.reduce((a, r) => a + r.seatsWon, 0),
                1,
              );
              return (
                <div key={e.id}>
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <h3 className="font-display text-lg font-semibold text-ink">
                      {formatDate(e.electionDate)}
                    </h3>
                    <span className="text-[0.8rem] text-ink-faint">
                      {e.totalSeats ? `${formatNumber(e.totalSeats)} seats` : null}
                      {e.turnoutPercent ? ` · ${e.turnoutPercent}% turnout` : null}
                    </span>
                    <CiteMarks sources={e.sources} numberOf={citations.numberOf} />
                  </div>
                  {e.resultSummary ? (
                    <p className="mt-1 max-w-2xl text-[0.85rem] text-ink-muted">{e.resultSummary}</p>
                  ) : null}
                  <div className="mt-2.5 max-w-2xl space-y-1">
                    {e.results.map((r) => (
                      <div key={r.partyId} className="flex items-center gap-2 text-[0.82rem]">
                        <span className="w-40 shrink-0 truncate text-ink-muted" title={r.partyName}>
                          {r.partyAbbreviation ?? r.partyName}
                        </span>
                        <span className="h-3 flex-1 overflow-hidden rounded-sm bg-paper-sunken">
                          <span
                            className="block h-full rounded-sm"
                            style={{
                              width: `${(r.seatsWon / denominator) * 100}%`,
                              backgroundColor: r.partyColor,
                            }}
                          />
                        </span>
                        <span className="w-10 shrink-0 text-right tabular-nums text-ink">
                          {r.seatsWon}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Governance record */}
      <section className="border-b border-rule py-7">
        <h2 className="section-label">Governance Record</h2>
        {events.length === 0 ? (
          <EmptyNote entity="events" stateId={state.id} />
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
                        href={`/state/${state.id}/${ev.year}`}
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

      {/* References */}
      <section className="py-7">
        <h2 className="section-label">References</h2>
        {citations.ordered.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-faint">
            No sources yet — this page has no published claims.
          </p>
        ) : (
          <ReferenceList sources={citations.ordered} />
        )}
      </section>
    </article>
  );
}

function EmptyNote({ entity, stateId }: { entity: string; stateId: string }) {
  return (
    <p className="mt-3 text-[0.85rem] text-ink-muted">
      No {entity} recorded yet.{" "}
      <Link
        href={`/contribute?state=${stateId}`}
        className="text-accent underline-offset-2 hover:underline"
      >
        Be the first to contribute →
      </Link>
    </p>
  );
}
