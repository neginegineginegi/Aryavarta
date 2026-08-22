import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { buildCitationIndex, CiteMarks, ReferenceList } from "@/components/ui/Citations";
import { PartyTag } from "@/components/ui/PartyTag";
import { getUnionOverview } from "@/lib/db/queries/union";
import { EVENT_TYPE_LABELS, formatElectionDate, formatTermRange, type EventType, yearOf } from "@/lib/format";

const MIN_YEAR = 1947;

export const revalidate = 86400;

function parseYear(raw: string): number | null {
  if (!/^\d{4}$/.test(raw)) return null;
  const y = Number(raw);
  if (y < MIN_YEAR || y > new Date().getFullYear()) return null;
  return y;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string }>;
}): Promise<Metadata> {
  const { year } = await params;
  return { title: `Union Government, ${year}` };
}

export default async function UnionYearPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year: rawYear } = await params;
  const year = parseYear(rawYear);
  if (!year) notFound();
  const { pmTerms, presidentTerms, elections, events } = await getUnionOverview();

  const maxYear = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const inYear = (t: { startDate: string; endDate: string | null }) =>
    t.startDate <= yearEnd && (t.endDate === null || t.endDate >= yearStart);

  const pmsInYear = pmTerms.filter(inYear).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const presidentsInYear = presidentTerms
    .filter(inYear)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const electionsInYear = elections.filter((e) => yearOf(e.electionDate) === year);
  const eventsInYear = events.filter((ev) => ev.year === year);

  const citations = buildCitationIndex([
    ...pmsInYear.map((t) => t.sources),
    ...presidentsInYear.map((t) => t.sources),
    ...electionsInYear.map((e) => e.sources),
    ...eventsInYear.map((e) => e.sources),
  ]);

  return (
    <article className="mx-auto max-w-[1100px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/union" className="hover:text-ink">Union Government</Link>
          <span className="mx-1.5">/</span>
          <span className="tabular-nums">{year}</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-[clamp(34px,4.5vw,48px)] font-light leading-[1.05] text-ink">
            Union Government, <span className="tabular-nums">{year}</span>
          </h1>
          <div className="flex items-center gap-2 text-[0.85rem] tabular-nums">
            {year > MIN_YEAR ? (
              <Link href={`/union/${year - 1}`} className="text-accent hover:underline">
                ← {year - 1}
              </Link>
            ) : null}
            <span className="text-ink-faint">·</span>
            {year < maxYear ? (
              <Link href={`/union/${year + 1}`} className="text-accent hover:underline">
                {year + 1} →
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">Prime Minister in {year}</h2>
        {pmsInYear.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-muted">No Prime Minister term recorded.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {pmsInYear.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline gap-x-3 text-[0.95rem]">
                <span className="font-display text-lg font-semibold text-ink">{t.cmName}</span>
                <PartyTag name={t.partyName} abbreviation={t.partyAbbreviation} color={t.partyColor} />
                <span className="text-[0.82rem] text-ink-faint">
                  {formatTermRange(t.startDate, t.endDate)}
                </span>
                <CiteMarks sources={t.sources} numberOf={citations.numberOf} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">President in {year}</h2>
        {presidentsInYear.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-muted">No President term recorded.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {presidentsInYear.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline gap-x-3 text-[0.95rem]">
                <span className="font-display text-lg font-semibold text-ink">{t.cmName}</span>
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
        <section className="section-card px-6 py-9 sm:px-10">
          <h2 className="font-display text-[28px] font-light leading-tight text-ink">Lok Sabha elections in {year}</h2>
          <ul className="mt-4 space-y-3">
            {electionsInYear.map((e) => (
              <li key={e.id} className="text-[0.9rem]">
                <span className="font-medium text-ink">{formatElectionDate(e)}</span>{" "}
                <CiteMarks sources={e.sources} numberOf={citations.numberOf} />
                <Link
                  href={`/election/${e.id}`}
                  className="ml-2 text-[0.82rem] text-accent underline-offset-2 hover:underline"
                >
                  Full election dashboard
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">National events, {year}</h2>
        {eventsInYear.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-muted">
            No national governance events recorded for {year}.{" "}
            <Link href="/contribute?state=in" className="text-accent underline-offset-2 hover:underline">
              Add one
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

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">References</h2>
        {citations.ordered.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-faint">No sources cited for this year yet.</p>
        ) : (
          <ReferenceList sources={citations.ordered} />
        )}
      </section>
    </article>
  );
}
