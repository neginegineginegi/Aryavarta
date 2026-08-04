import type { Metadata } from "next";
import Link from "next/link";
import { and, isNotNull, isNull } from "drizzle-orm";

import { LeaderPanel, ModeTabs, PartyPanel, StatePanel } from "@/app/compare/extras";
import { ComparePicker } from "@/components/compare/ComparePicker";
import { db } from "@/lib/db";
import { terms } from "@/lib/db/schema";
import { getAllParties } from "@/lib/db/queries/party";
import { personSlug } from "@/lib/db/queries/person";
import { SeatBar } from "@/components/election/SeatBar";
import { SeatDeltaTable } from "@/components/election/SeatDeltaTable";
import { getElectionDetail, type ElectionDetail } from "@/lib/db/queries/election";
import { getElectionIndex } from "@/lib/db/queries/compare";
import { getStateArticle, type EventSummary } from "@/lib/db/queries/state";
import { getUnionOverview } from "@/lib/db/queries/union";
import {
  buildOverview,
  electionTitle,
  seatDeltas,
} from "@/lib/election-analysis";
import { EVENT_TYPE_LABELS, formatDate, yearOf, type EventType } from "@/lib/format";

export const metadata: Metadata = {
  title: "Compare",
  description:
    "Side-by-side comparison of any two elections: seats, swings, leadership changes, and governance events during each term.",
};

const UUID = /^[0-9a-f-]{36}$/i;

async function eventsFor(stateId: string): Promise<EventSummary[]> {
  if (stateId === "in") return (await getUnionOverview()).events;
  return (await getStateArticle(stateId))?.events ?? [];
}

/** Events recorded during the government formed by this election. */
function eventsDuring(detail: ElectionDetail, events: EventSummary[]): EventSummary[] {
  const from = yearOf(detail.formedTerm?.startDate ?? detail.election.electionDate);
  const to = detail.formedTerm?.endDate
    ? yearOf(detail.formedTerm.endDate)
    : new Date().getFullYear();
  return events.filter((e) => e.year >= from && e.year <= to).slice(0, 12);
}

function SidePanel({ detail, events }: { detail: ElectionDetail; events: EventSummary[] }) {
  const { election, formedTerm } = detail;
  const overview = buildOverview(election, formedTerm);
  return (
    <div className="flex-1 space-y-5 rounded-sm border border-rule bg-paper-raised p-5">
      <div>
        <h2 className="font-display text-xl font-semibold leading-tight text-ink">
          <Link
            href={`/election/${election.id}`}
            className="underline-offset-4 hover:text-accent hover:underline"
          >
            {electionTitle(election)}
          </Link>
        </h2>
        <p className="mt-1 text-[0.8rem] text-ink-muted">
          {formatDate(election.electionDate)}
          {election.turnoutPercent ? ` · ${election.turnoutPercent}% turnout` : ""}
        </p>
      </div>

      {election.results.length > 0 && (
        <SeatBar results={election.results} totalSeats={election.totalSeats} />
      )}

      {overview.length > 0 && (
        <p className="text-[0.85rem] leading-relaxed text-ink-muted">{overview.join(" ")}</p>
      )}

      <div>
        <h3 className="section-label">Government</h3>
        {formedTerm ? (
          <p className="mt-1 text-[0.88rem] text-ink">
            <strong>{formedTerm.cmName}</strong>
            {formedTerm.partyName ? ` (${formedTerm.partyName})` : ""}
            <span className="text-ink-muted">
              {" "}
              · {yearOf(formedTerm.startDate)} –{" "}
              {formedTerm.endDate ? yearOf(formedTerm.endDate) : "present"}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-[0.82rem] text-ink-faint">No linked term recorded.</p>
        )}
      </div>

      <div>
        <h3 className="section-label">Events during this government</h3>
        {events.length === 0 ? (
          <p className="mt-1 text-[0.82rem] text-ink-faint">None recorded.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {events.map((ev) => (
              <li key={ev.id} className="text-[0.83rem]">
                <span className="tabular-nums text-ink-faint">{ev.year}</span>{" "}
                <Link
                  href={`/event/${ev.id}`}
                  className="text-ink underline-offset-2 hover:text-accent hover:underline"
                >
                  {ev.title}
                </Link>{" "}
                <span className="text-[0.72rem] text-ink-faint">
                  {EVENT_TYPE_LABELS[ev.type as EventType]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type CompareMode = "elections" | "leaders" | "parties" | "states";

async function ComparisonExtras({
  mode,
  a,
  b,
}: {
  mode: Exclude<CompareMode, "elections">;
  a?: string;
  b?: string;
}) {
  let options: Array<{ value: string; label: string }> = [];
  if (mode === "leaders") {
    const rows = await db.query.terms.findMany({
      where: and(isNull(terms.deletedAt), isNotNull(terms.cmName)),
      columns: { cmName: true },
    });
    const seen = new Map<string, string>();
    for (const r of rows) if (r.cmName) seen.set(personSlug(r.cmName), r.cmName);
    options = [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((x, y) => x.label.localeCompare(y.label));
  } else if (mode === "parties") {
    options = (await getAllParties())
      .filter((p) => !p.isPseudo)
      .map((p) => ({ value: p.id, label: p.name }));
  } else {
    const rows = await db.query.states.findMany({
      columns: { id: true, name: true, kind: true },
      orderBy: (s, { asc }) => [asc(s.name)],
    });
    options = rows
      .filter((s) => s.kind !== "union")
      .map((s) => ({ value: s.id, label: s.name }));
  }

  const valid = (v?: string) => !!v && options.some((o) => o.value === v);
  const ready = valid(a) && valid(b) && a !== b;
  const NOUN = { leaders: "leader", parties: "party", states: "state" }[mode];

  return (
    <div className="mx-auto max-w-6xl px-6 pb-12">
      <header className="border-b border-rule py-10">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
          Compare
        </h1>
        <p className="mt-2 max-w-2xl text-[0.9rem] text-ink-muted">
          Side-by-side, from approved sourced records. Every comparison URL is shareable and
          citable.
        </p>
        <ModeTabs active={mode} />
      </header>

      <form method="get" action="/compare" className="mt-6 rounded-sm border border-rule bg-paper-raised p-4">
        <input type="hidden" name="m" value={mode} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="section-label mb-1 block">Compare</span>
            <select
              name="a"
              defaultValue={valid(a) ? a : ""}
              className="w-full rounded-sm border border-rule-dark bg-paper-raised px-3 py-2 text-[0.88rem]"
            >
              <option value="">Select {NOUN}…</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <span className="hidden pb-2 font-display text-xl text-ink-faint sm:block">vs</span>
          <label className="flex-1">
            <span className="section-label mb-1 block">With</span>
            <select
              name="b"
              defaultValue={valid(b) ? b : ""}
              className="w-full rounded-sm border border-rule-dark bg-paper-raised px-3 py-2 text-[0.88rem]"
            >
              <option value="">Select {NOUN}…</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-sm bg-ink px-5 py-2 text-[0.88rem] font-medium text-paper hover:opacity-85"
          >
            Compare
          </button>
        </div>
        {options.length === 0 && (
          <p className="mt-3 text-[0.82rem] text-ink-muted">
            Nothing to compare in this category yet. Entries appear as data is approved.
          </p>
        )}
      </form>

      {ready && (
        <div className="flex flex-col gap-5 py-8 lg:flex-row">
          {mode === "leaders" && (
            <>
              <LeaderPanel slug={a!} />
              <LeaderPanel slug={b!} />
            </>
          )}
          {mode === "parties" && (
            <>
              <PartyPanel partyId={a!} />
              <PartyPanel partyId={b!} />
            </>
          )}
          {mode === "states" && (
            <>
              <StatePanel stateId={a!} />
              <StatePanel stateId={b!} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
const MODES: Array<{ key: CompareMode; label: string }> = [
  { key: "elections", label: "Elections" },
  { key: "leaders", label: "Leaders" },
  { key: "parties", label: "Parties" },
  { key: "states", label: "States" },
];

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string; m?: string }>;
}) {
  const { a, b, m } = await searchParams;
  const mode: CompareMode = (MODES.find((x) => x.key === m)?.key ?? "elections") as CompareMode;
  if (mode !== "elections") {
    return <ComparisonExtras mode={mode} a={a} b={b} />;
  }
  const index = await getElectionIndex();

  let left: ElectionDetail | null = null;
  let right: ElectionDetail | null = null;
  if (a && b && a !== b && UUID.test(a) && UUID.test(b)) {
    [left, right] = await Promise.all([getElectionDetail(a), getElectionDetail(b)]);
  }

  const [leftEvents, rightEvents] =
    left && right
      ? await Promise.all([
          eventsFor(left.election.stateId).then((evs) => eventsDuring(left!, evs)),
          eventsFor(right.election.stateId).then((evs) => eventsDuring(right!, evs)),
        ])
      : [[], []];

  const crossDeltas =
    left && right ? seatDeltas(right.election.results, left.election.results) : [];
  const sameEntity = left && right && left.election.stateId === right.election.stateId;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-12">
      <header className="border-b border-rule py-10">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
          Compare
        </h1>
        <p className="mt-3 max-w-2xl text-[0.95rem] text-ink-muted">
          Put any two elections side by side: seats, swings, leadership, and what happened
          during each government. Try Karnataka 2013 against 2018, or the Union in 2004
          against 2014.
        </p>
        <ModeTabs active="elections" />
      </header>

      <div className="py-6">
        <ComparePicker index={index} initialA={a} initialB={b} />
      </div>

      {left && right && (
        <div className="space-y-8 pb-6">
          <div className="flex flex-col gap-5 lg:flex-row">
            <SidePanel detail={left} events={leftEvents} />
            <SidePanel detail={right} events={rightEvents} />
          </div>

          <section>
            <h2 className="section-label">
              Seat changes: {electionTitle(left.election)} to {electionTitle(right.election)}
            </h2>
            {!sameEntity && (
              <p className="mt-1 text-[0.8rem] text-disputed">
                ⚠ These elections are from different bodies, so seat “changes” across them are
                arithmetic, not political swing.
              </p>
            )}
            <div className="mt-3">
              {crossDeltas.length === 0 ? (
                <p className="text-[0.85rem] text-ink-faint">
                  Per-party results are missing on one side.
                </p>
              ) : (
                <SeatDeltaTable deltas={crossDeltas} />
              )}
            </div>
          </section>
        </div>
      )}

      {(!a || !b) && (
        <p className="pb-8 text-[0.85rem] text-ink-faint">
          Pick two elections above to generate a comparison. Every comparison has a shareable,
          citable URL.
        </p>
      )}
    </div>
  );
}
