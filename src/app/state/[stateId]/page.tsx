import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { TimelineBand } from "@/components/state/TimelineBand";
import { DiscoveryStrip } from "@/components/state/DiscoveryStrip";
import { YearFocus } from "@/components/state/YearFocus";
import { AdminRemoveButton } from "@/components/admin/AdminRemoveButton";
import { DevelopmentSection } from "@/components/state/DevelopmentSection";
import { getDevelopment } from "@/lib/db/queries/development";
import { Badge } from "@/components/ui/Badge";
import { buildCitationIndex, CiteMarks } from "@/components/ui/Citations";
import { EmptyState } from "@/components/ui/States";
import { SourceList } from "@/components/ui/SourceList";
import { getSourceClassifications, getSourceUsage } from "@/lib/db/queries/sources";
import { PartyTag } from "@/components/ui/PartyTag";
import { personSlug } from "@/lib/db/queries/person";
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

// Daily re-render so "present"/current-year rendering can never go stale
// across a year boundary; content changes revalidate immediately via tags.
export const revalidate = 86400;

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
  if (stateId === "in") redirect("/union"); // the union pseudo-entity has its own home
  const [article, development] = await Promise.all([
    getStateArticle(stateId),
    getDevelopment(stateId),
  ]);
  if (!article) notFound();

  const { state, terms: allTerms, elections, events } = article;
  const maxYear = new Date().getFullYear();
  // Governors render in their own section; the CM table and control-timeline
  // band show heads of government only.
  const terms = allTerms.filter((t) => t.kind === "cm" || t.kind === "presidents_rule");
  const governorTerms = allTerms.filter((t) => t.kind === "governor");

  // Footnote numbering follows document order: terms, then elections, then events.
  const citations = buildCitationIndex([
    ...allTerms.map((t) => t.sources),
    ...elections.map((e) => e.sources),
    ...events.map((e) => e.sources),
  ]);

  // The Source Explorer's reverse index. Two small queries against the ids
  // already on the page, so a reader can see how much of the archive rests on
  // any one document without leaving the record.
  const sourceIds = citations.ordered.map((s) => s.id);
  const [usageMap, classMap] = await Promise.all([
    getSourceUsage(sourceIds),
    getSourceClassifications(sourceIds),
  ]);

  const eventsByType = new Map<EventType, typeof events>();
  for (const ev of events) {
    const key = ev.type as EventType;
    const arr = eventsByType.get(key);
    if (arr) arr.push(ev);
    else eventsByType.set(key, [ev]);
  }

  return (
    <article className="mx-auto max-w-[1200px] px-4 pb-4">
      {/* Page title block: breadcrumb, title, mono meta line, then the
          government timeline strip, all inside the first section card. */}
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <nav className="font-mono text-[10px] tracking-[0.06em] text-ink-meta">
          <Link href="/browse" className="hover:text-ink">Browse</Link>
          <span className="mx-1.5">/</span>
          <Link href="/" className="hover:text-ink">States</Link>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">{state.name}</span>
        </nav>
        <span lang="hi" className="deva-eyebrow mt-4">
          राज्य का अभिलेख
        </span>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-[clamp(38px,5vw,52px)] font-light leading-[1.05] text-ink">
            {state.name}
          </h1>
          <span className="flex gap-2">
            <Link href={`/state/${state.id}/history`} className="btn btn-secondary btn-sm">
              History
            </Link>
            <Link href={`/contribute?state=${state.id}`} className="btn btn-primary btn-sm">
              Suggest an edit
            </Link>
          </span>
        </div>
        <p className="mt-3 font-mono text-[10px] tracking-[0.06em] text-ink-soft">
          {state.kind === "state" ? "State" : "Union Territory"}
          {state.formedOn ? <> · since {yearOf(state.formedOn)}</> : null}
          {" · "}
          {terms.filter((t) => t.kind === "cm").length} governments
          {" · "}
          {elections.length} elections
          {state.dissolvedOn ? (
            <>
              {" · "}
              <span className="text-accent">dissolved {formatDate(state.dissolvedOn)}</span>
            </>
          ) : null}
        </p>
        <TimelineBand terms={terms} maxYear={maxYear} />
      </header>

      {/* Year-in-focus strip: appears when the reader arrives with ?y= from
          the map, keeping the selected year's context on the full page. */}
      <YearFocus
        stateId={state.id}
        terms={terms.map((t) => ({
          startDate: t.startDate,
          endDate: t.endDate,
          kind: t.kind,
          cmName: t.cmName,
          partyName: t.partyName,
          partyAbbreviation: t.partyAbbreviation,
          partyColor: t.partyColor,
        }))}
        elections={elections.map((e) => ({ id: e.id, electionDate: e.electionDate }))}
        eventYears={events.map((ev) => ev.year)}
        formedYear={state.formedOn ? yearOf(state.formedOn) : null}
        dissolvedYear={state.dissolvedOn ? yearOf(state.dissolvedOn) : null}
      />

      <DiscoveryStrip stateId={state.id} />

      {/* Chief Ministers */}
      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[30px] font-light leading-tight text-ink">Chief Ministers &amp; Governments</h2>
        {terms.length === 0 ? (
          <EmptyNote entity="chief-minister terms" stateId={state.id} />
        ) : (
          <table className="mt-4 w-full text-left text-[0.88rem]">
            <thead>
              <tr className="border-b border-rule-dark text-[0.72rem] tracking-[0.04em] text-ink-faint">
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
                      <Link
                        href={`/person/${personSlug(t.cmName ?? "")}`}
                        className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
                      >
                        {t.cmName}
                      </Link>
                    )}
                    {t.notes ? (
                      <span className="block text-[0.8rem] text-ink-faint">{t.notes}</span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-4">
                    {t.kind === "presidents_rule" ? (
                      <span className="text-ink-faint">—</span>
                    ) : t.partyId ? (
                      <Link href={`/party/${t.partyId}`} className="hover:underline">
                        <PartyTag name={t.partyName} abbreviation={t.partyAbbreviation} color={t.partyColor} />
                      </Link>
                    ) : (
                      <PartyTag name={t.partyName} abbreviation={t.partyAbbreviation} color={t.partyColor} />
                    )}
                  </td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    <CiteMarks sources={t.sources} numberOf={citations.numberOf} />
                    <Link
                      href={`/contribute/term?edit=${t.id}`}
                      className="ml-2 text-[0.75rem] text-ink-faint hover:text-accent"
                      title="Suggest a correction to this term"
                    >
                      edit
                    </Link>
                    <span className="ml-2">
                      <AdminRemoveButton
                        entityType="term"
                        entityId={t.id}
                        label={`${t.kind === "presidents_rule" ? "President's Rule" : t.cmName}, ${state.name}`}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Governors */}
      {governorTerms.length > 0 && (
        <section className="section-card px-6 py-9 sm:px-10">
          <h2 className="font-display text-[30px] font-light leading-tight text-ink">Governors</h2>
          <table className="mt-4 w-full max-w-2xl text-left text-[0.88rem]">
            <thead>
              <tr className="border-b border-rule-dark text-[0.72rem] tracking-[0.04em] text-ink-faint">
                <th className="py-2 pr-4 font-medium">Period</th>
                <th className="py-2 pr-4 font-medium">Governor</th>
                <th className="py-2 font-medium sr-only">Sources</th>
              </tr>
            </thead>
            <tbody>
              {governorTerms.map((t) => (
                <tr key={t.id} className="border-b border-rule align-baseline">
                  <td className="py-2.5 pr-4 whitespace-nowrap tabular-nums text-ink-muted">
                    {yearOf(t.startDate)} – {t.endDate ? yearOf(t.endDate) : "present"}
                  </td>
                  <td className="py-2.5 pr-4">
                    <Link
                      href={`/person/${personSlug(t.cmName ?? "")}`}
                      className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
                    >
                      {t.cmName}
                    </Link>
                  </td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    <CiteMarks sources={t.sources} numberOf={citations.numberOf} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Elections */}
      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[30px] font-light leading-tight text-ink">Assembly Elections</h2>
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
                      <Link
                        href={`/election/${e.id}`}
                        className="underline-offset-4 hover:text-accent hover:underline"
                      >
                        {formatDate(e.electionDate)}
                      </Link>
                    </h3>
                    <Link
                      href={`/election/${e.id}`}
                      className="text-[0.78rem] text-accent underline-offset-2 hover:underline"
                    >
                      dashboard
                    </Link>
                    <span className="text-[0.8rem] text-ink-faint">
                      {e.totalSeats ? `${formatNumber(e.totalSeats)} seats` : null}
                      {e.turnoutPercent ? ` · ${e.turnoutPercent}% turnout` : null}
                    </span>
                    <CiteMarks sources={e.sources} numberOf={citations.numberOf} />
                    <Link
                      href={`/contribute/election?edit=${e.id}`}
                      className="text-[0.75rem] text-ink-faint hover:text-accent"
                      title="Suggest a correction to this election"
                    >
                      edit
                    </Link>
                    <AdminRemoveButton
                      entityType="election"
                      entityId={e.id}
                      label={`Election of ${e.electionDate.slice(0, 4)}, ${state.name}`}
                    />
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
      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[30px] font-light leading-tight text-ink">Governance Record</h2>
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
      <DevelopmentSection grouped={development} />

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[30px] font-light leading-tight text-ink">References</h2>
        {citations.ordered.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              message="No sources yet: this page has no published claims."
              helper="Every claim the archive publishes carries a citation, so an empty reference list means an empty record."
            />
          </div>
        ) : (
          <SourceList
            sources={citations.ordered}
            usage={Object.fromEntries(usageMap)}
            classifications={Object.fromEntries(classMap)}
          />
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
        Be the first to contribute
      </Link>
    </p>
  );
}
