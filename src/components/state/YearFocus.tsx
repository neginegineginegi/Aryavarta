"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PartyTag } from "@/components/ui/PartyTag";
import { formatDate, formatTermRange, yearOf } from "@/lib/format";

type FocusTerm = {
  startDate: string;
  endDate: string | null;
  kind: string;
  cmName: string | null;
  partyName: string | null;
  partyAbbreviation: string | null;
  partyColor: string | null;
};

type FocusElection = { id: string; electionDate: string };

const MIN_YEAR = 1947;

/**
 * Year-in-focus strip for the state page. When the reader arrives from the
 * map with ?y= in the URL (or shares such a link), this shows that year's
 * government, election, and event count right under the masthead, so the
 * year context survives the jump to the full article. Reads the query param
 * client-side after mount, so the page itself stays statically cacheable.
 */
export function YearFocus({
  stateId,
  terms,
  elections,
  eventYears,
  formedYear,
  dissolvedYear,
}: {
  stateId: string;
  terms: FocusTerm[];
  elections: FocusElection[];
  eventYears: number[];
  formedYear: number | null;
  dissolvedYear: number | null;
}) {
  const [year, setYear] = useState<number | null>(null);

  // The cascading render this causes is the point, and the alternatives are
  // worse: a lazy initial state would read window during SSR and mismatch on
  // hydration, and useSearchParams would opt the whole state page out of
  // static rendering to save one render of a component that starts empty.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("y");
    if (raw && /^\d{4}$/.test(raw)) {
      const y = Number(raw);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (y >= MIN_YEAR && y <= new Date().getFullYear()) setYear(y);
    }
  }, []);

  if (year === null) return null;

  function clear() {
    const url = new URL(window.location.href);
    url.searchParams.delete("y");
    window.history.replaceState(null, "", url.toString());
    setYear(null);
  }

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const notYetFormed = formedYear !== null && year < formedYear;
  const gone = dissolvedYear !== null && year >= dissolvedYear;
  const termsInYear = notYetFormed
    ? []
    : terms
        .filter((t) => t.startDate <= yearEnd && (t.endDate === null || t.endDate >= yearStart))
        .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const electionsInYear = elections.filter((e) => yearOf(e.electionDate) === year);
  const eventCount = eventYears.filter((y) => y === year).length;

  return (
    <aside
      aria-label={`Year in focus: ${year}`}
      className="mt-6 rounded-sm border border-rule-dark bg-paper-raised p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-[0.62rem] tracking-[0.06em] text-accent">
          Year in focus · <span className="tabular-nums">{year}</span>
        </h2>
        <button
          type="button"
          onClick={clear}
          className="text-[0.72rem] text-ink-faint hover:text-ink"
          aria-label="Clear the year filter"
        >
          clear ✕
        </button>
      </div>

      {notYetFormed ? (
        <p className="mt-2 text-[0.88rem] text-ink-muted">
          Not yet a separate state or union territory in {year}; established {formedYear}.
        </p>
      ) : gone ? (
        <p className="mt-2 text-[0.88rem] text-ink-muted">
          Merged or reorganised in {dissolvedYear}; no separate record for {year}.
        </p>
      ) : (
        <div className="mt-2 space-y-1.5 text-[0.88rem]">
          {termsInYear.length === 0 ? (
            <p className="text-ink-muted">No government term recorded for this year.</p>
          ) : (
            termsInYear.map((t) => (
              <p key={`${t.startDate}-${t.cmName}`} className="flex flex-wrap items-baseline gap-x-2">
                {t.kind === "presidents_rule" ? (
                  <span className="italic text-ink-muted">President&rsquo;s Rule</span>
                ) : (
                  <>
                    <span className="font-medium text-ink">{t.cmName}</span>
                    <PartyTag
                      name={t.partyName}
                      abbreviation={t.partyAbbreviation}
                      color={t.partyColor}
                      short
                    />
                  </>
                )}
                <span className="text-[0.78rem] text-ink-faint">
                  {formatTermRange(t.startDate, t.endDate)}
                </span>
              </p>
            ))
          )}
          {electionsInYear.map((e) => (
            <p key={e.id}>
              <span className="text-ink-muted">Assembly election held {formatDate(e.electionDate)}.</span>{" "}
              <Link
                href={`/election/${e.id}`}
                className="text-accent underline-offset-2 hover:underline"
              >
                Dashboard
              </Link>
            </p>
          ))}
          {eventCount > 0 && (
            <p className="text-ink-muted">
              {eventCount} recorded governance {eventCount === 1 ? "event" : "events"} in {year}.
            </p>
          )}
        </div>
      )}

      <p className="mt-2.5 text-[0.78rem]">
        <Link
          href={`/state/${stateId}/${year}`}
          className="text-accent underline-offset-2 hover:underline"
        >
          Full {year} snapshot with citations
        </Link>
      </p>
    </aside>
  );
}
