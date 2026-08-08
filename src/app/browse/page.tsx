import type { Metadata } from "next";
import Link from "next/link";

import { getAllParties } from "@/lib/db/queries/party";
import { getElectionIndex } from "@/lib/db/queries/compare";
import { getIndicatorIndex, type IndicatorIndexEntry } from "@/lib/db/queries/development";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Browse",
  description:
    "Browse the archive by state, union territory, party, year, or election.",
};

export const revalidate = 3600;

export default async function BrowsePage() {
  const [states, parties, electionIndex, indicatorIndex] = await Promise.all([
    db.query.states.findMany({ orderBy: (s, { asc }) => [asc(s.name)] }),
    getAllParties(),
    getElectionIndex(),
    getIndicatorIndex(),
  ]);

  const indicatorsByCategory = new Map<string, IndicatorIndexEntry[]>();
  for (const ind of indicatorIndex) {
    const arr = indicatorsByCategory.get(ind.category);
    if (arr) arr.push(ind);
    else indicatorsByCategory.set(ind.category, [ind]);
  }

  const realStates = states.filter((s) => s.kind !== "union");
  const currentYear = new Date().getFullYear();
  const decades: number[] = [];
  for (let y = 1950; y <= currentYear; y += 10) decades.push(y);
  const recentElections = electionIndex.slice(-12).reverse();

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <h1 className="font-display text-[clamp(34px,4.5vw,48px)] font-light leading-[1.05] text-ink">
          Browse the archive
        </h1>
        <p className="mt-3 max-w-2xl text-[0.95rem] text-ink-muted">
          Everything here interlinks: states to years, years to elections, elections to
          parties and people. Pick any thread and follow it.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/archive" className="btn btn-secondary btn-sm">
            The media archive
          </Link>
        </div>
      </header>

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">Union</h2>
        <p className="mt-2">
          <Link href="/union" className="text-accent underline-offset-2 hover:underline">
            Union Government of India
          </Link>{" "}
          <span className="text-[0.82rem] text-ink-faint">
            Prime Ministers, Presidents, Lok Sabha elections
          </span>
        </p>
      </section>

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">States &amp; Union Territories</h2>
        <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[0.9rem] sm:grid-cols-3 md:grid-cols-4">
          {realStates.map((s) => (
            <li key={s.id}>
              <Link
                href={`/state/${s.id}`}
                className={`underline-offset-2 hover:text-accent hover:underline ${s.dissolvedOn ? "text-ink-faint line-through decoration-ink-faint/40" : "text-ink"}`}
              >
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">Parties</h2>
        {parties.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-muted">No parties recorded yet.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {parties.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/party/${p.id}`}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-rule-dark px-2.5 py-1 text-[0.85rem] text-ink hover:border-ink"
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-[2px] border border-black/10"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.abbreviation ?? p.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="indicators" className="border-b border-rule py-8">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">Development indicators</h2>
        <p className="mt-1 max-w-2xl text-[0.8rem] text-ink-faint">
          Statistical series from named official sources, shown as published, year by year,
          for every state and the nation. Abhilekh does not score, rank, or grade governments.
        </p>
        {indicatorIndex.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-muted">
            No indicator data loaded yet. Series appear here as they are added.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {[...indicatorsByCategory.entries()].map(([category, defs]) => (
              <div key={category}>
                <h3 className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-ink-muted">
                  {category}
                </h3>
                <ul className="mt-1.5 grid gap-x-8 gap-y-1.5 text-[0.9rem] sm:grid-cols-2">
                  {defs.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/indicator/${d.id}`}
                        title={d.methodology}
                        className="text-ink underline-offset-2 hover:text-accent hover:underline"
                      >
                        {d.name}
                      </Link>{" "}
                      <span className="whitespace-nowrap text-[0.78rem] text-ink-faint">
                        {d.unit} · {d.minYear}–{d.maxYear} · {d.seriesCount} series
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">By year</h2>
        <p className="mt-1 text-[0.8rem] text-ink-faint">
          Opens the map at that year. Scrub onward from there.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2 tabular-nums">
          {decades.map((y) => (
            <li key={y}>
              <Link
                href={`/?y=${Math.min(y, currentYear)}`}
                className="inline-block rounded-sm border border-rule-dark px-2.5 py-1 text-[0.85rem] text-ink hover:border-ink"
              >
                {y}s
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">Recent elections in the archive</h2>
        {recentElections.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-muted">
            No elections recorded yet. They appear here as they are approved.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-[0.9rem]">
            {recentElections.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/election/${e.id}`}
                  className="text-accent underline-offset-2 hover:underline"
                >
                  {e.stateName}, {formatDate(e.electionDate)}
                  {e.scope === "lok_sabha" ? " (Lok Sabha)" : ""}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
