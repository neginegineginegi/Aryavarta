import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { buildCitationIndex, CiteMarks, ReferenceList } from "@/components/ui/Citations";
import { PartyTag } from "@/components/ui/PartyTag";
import { getStateArticle } from "@/lib/db/queries/state";
import {
  EVENT_TYPE_LABELS,
  formatDate,
  formatTermRange,
  yearOf,
  type EventType,
} from "@/lib/format";

// Daily re-render keeps the current-year upper bound fresh (see state page).
export const revalidate = 86400;

const MIN_YEAR = 1947;

function parseYear(raw: string): number | null {
  if (!/^\d{4}$/.test(raw)) return null;
  const y = Number(raw);
  const maxYear = new Date().getFullYear();
  if (y < MIN_YEAR || y > maxYear) return null;
  return y;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stateId: string; year: string }>;
}): Promise<Metadata> {
  const { stateId, year: rawYear } = await params;
  const year = parseYear(rawYear);
  const article = await getStateArticle(stateId);
  if (!article || !year) return {};
  return {
    title: `${article.state.name}, ${year}`,
    description: `Government, elections, and recorded governance events in ${article.state.name} during ${year}, with sources.`,
  };
}

export default async function StateYearPage({
  params,
}: {
  params: Promise<{ stateId: string; year: string }>;
}) {
  const { stateId, year: rawYear } = await params;
  const year = parseYear(rawYear);
  if (!year) notFound();
  if (stateId === "in") redirect(`/union/${year}`);
  const article = await getStateArticle(stateId);
  if (!article) notFound();

  const { state } = article;
  const maxYear = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // Terms overlapping any part of the year, chronological.
  const termsInYear = article.terms
    .filter((t) => t.startDate <= yearEnd && (t.endDate === null || t.endDate >= yearStart))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const electionsInYear = article.elections.filter(
    (e) => yearOf(e.electionDate) === year,
  );

  const eventsInYear = article.events.filter((ev) => ev.year === year);

  const citations = buildCitationIndex([
    ...termsInYear.map((t) => t.sources),
    ...electionsInYear.map((e) => e.sources),
    ...eventsInYear.map((e) => e.sources),
  ]);

  return (
    <article className="mx-auto max-w-4xl px-6 pb-12">
      <header className="border-b border-rule py-8">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/" className="hover:text-ink">Map</Link>
          <span className="mx-1.5">/</span>
          <Link href={`/state/${state.id}`} className="hover:text-ink">{state.name}</Link>
          <span className="mx-1.5">/</span>
          <span className="tabular-nums">{year}</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
            {state.name}, <span className="tabular-nums">{year}</span>
          </h1>
          <div className="flex items-center gap-2 text-[0.85rem] tabular-nums">
            {year > MIN_YEAR ? (
              <Link href={`/state/${state.id}/${year - 1}`} className="text-accent hover:underline">
                ← {year - 1}
              </Link>
            ) : null}
            <span className="text-ink-faint">·</span>
            {year < maxYear ? (
              <Link href={`/state/${state.id}/${year + 1}`} className="text-accent hover:underline">
                {year + 1} →
              </Link>
            ) : null}
          </div>
        </div>
        <p className="mt-2 max-w-2xl text-[0.85rem] text-ink-muted">
          A citable, single-year view. For the full timeline, see the{" "}
          <Link href={`/state/${state.id}`} className="text-accent underline-offset-2 hover:underline">
            complete {state.name} page
          </Link>
          .
        </p>
      </header>

      <section className="border-b border-rule py-8">
        <h2 className="section-label">Government in {year}</h2>
        {state.formedOn && year < yearOf(state.formedOn) ? (
          <p className="mt-3 text-[0.85rem] text-ink-muted">
            {state.name} was not a separate {state.kind === "state" ? "state" : "union territory"} in{" "}
            {year}. It was established on {formatDate(state.formedOn)}.
          </p>
        ) : termsInYear.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-muted">
            No government term recorded for this year.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {termsInYear.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline gap-x-3 text-[0.95rem]">
                {t.kind === "presidents_rule" ? (
                  <span className="italic text-ink-muted">President&rsquo;s Rule</span>
                ) : (
                  <>
                    <span className="font-display text-lg font-semibold text-ink">{t.cmName}</span>
                    <PartyTag name={t.partyName} abbreviation={t.partyAbbreviation} color={t.partyColor} />
                  </>
                )}
                <span className="text-[0.82rem] text-ink-faint">
                  {formatTermRange(t.startDate, t.endDate)}
                </span>
                <CiteMarks sources={t.sources} numberOf={citations.numberOf} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {electionsInYear.length > 0 && (
        <section className="border-b border-rule py-8">
          <h2 className="section-label">Elections in {year}</h2>
          <ul className="mt-4 space-y-3">
            {electionsInYear.map((e) => (
              <li key={e.id} className="text-[0.9rem]">
                <span className="font-medium text-ink">{formatDate(e.electionDate)}</span>{" "}
                <CiteMarks sources={e.sources} numberOf={citations.numberOf} />
                {e.resultSummary ? (
                  <p className="mt-0.5 max-w-2xl text-ink-muted">{e.resultSummary}</p>
                ) : null}
                <Link
                  href={`/election/${e.id}`}
                  className="text-[0.82rem] text-accent underline-offset-2 hover:underline"
                >
                  Full election dashboard →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-b border-rule py-8">
        <h2 className="section-label">Recorded events, {year}</h2>
        {eventsInYear.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-muted">
            No governance events recorded for {state.name} in {year}.{" "}
            <Link
              href={`/contribute?state=${state.id}`}
              className="text-accent underline-offset-2 hover:underline"
            >
              Add one →
            </Link>
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {eventsInYear.map((ev) => (
              <li key={ev.id} className="text-[0.9rem]">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Badge variant="type">{EVENT_TYPE_LABELS[ev.type as EventType]}</Badge>
                  <Link
                    href={`/event/${ev.id}`}
                    className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
                  >
                    {ev.title}
                  </Link>
                  <CiteMarks sources={ev.sources} numberOf={citations.numberOf} />
                </div>
                <p className="mt-1 line-clamp-3 max-w-2xl text-[0.85rem] text-ink-muted">
                  {ev.description}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="py-7">
        <h2 className="section-label">References</h2>
        {citations.ordered.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-faint">No sources cited for this year yet.</p>
        ) : (
          <ReferenceList sources={citations.ordered} />
        )}
      </section>
    </article>
  );
}
