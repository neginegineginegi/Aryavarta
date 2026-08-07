import Link from "next/link";
import { Fragment } from "react";

import { PartyTag } from "@/components/ui/PartyTag";
import { TrendChart } from "@/components/ui/TrendChart";
import { getDevelopment, type IndicatorSeries } from "@/lib/db/queries/development";
import { getPartyProfile } from "@/lib/db/queries/party";
import { getPersonBySlug, personSlug } from "@/lib/db/queries/person";
import { getStateArticle } from "@/lib/db/queries/state";
import { db } from "@/lib/db";
import { formatTenure } from "@/lib/insights";
import {
  buildPartyStateRows,
  type PartyStateCell as PartyStateCellData,
  type PartyStateRow,
} from "@/lib/party-compare";
import { mergedDays } from "@/lib/tenure";
import { formatNumber, yearOf } from "@/lib/format";

export function ModeTabs({ active }: { active: string }) {
  const modes = [
    { key: "elections", label: "Elections" },
    { key: "leaders", label: "Leaders" },
    { key: "parties", label: "Parties" },
    { key: "states", label: "States" },
  ];
  return (
    <div className="mt-4 flex flex-wrap gap-1.5 text-[0.85rem]">
      {modes.map((mo) => (
        <Link
          key={mo.key}
          href={mo.key === "elections" ? "/compare" : `/compare?m=${mo.key}`}
          className={`rounded-sm border px-3 py-1 ${
            active === mo.key
              ? "border-ink bg-ink text-paper"
              : "border-rule-dark text-ink-muted hover:border-ink hover:text-ink"
          }`}
        >
          {mo.label}
        </Link>
      ))}
    </div>
  );
}

const OFFICE_LABEL = {
  cm: "Chief Minister",
  pm: "Prime Minister",
  president: "President",
  governor: "Governor",
  presidents_rule: "President's Rule",
} as const;

const DAY = 86_400_000;
function days(start: string, end: string | null): number {
  const to = end ? new Date(`${end}T00:00:00Z`).getTime() : Date.now();
  return Math.max(0, Math.round((to - new Date(`${start}T00:00:00Z`).getTime()) / DAY));
}

// ---------------------------------------------------------------------------
// Leaders
// ---------------------------------------------------------------------------

export async function LeaderPanel({ slug }: { slug: string }) {
  const person = await getPersonBySlug(slug);
  if (!person) {
    return <PanelShell title="Not found">No offices recorded for this person.</PanelShell>;
  }
  const total = person.stints.reduce((a, s) => a + days(s.startDate, s.endDate), 0);
  return (
    <PanelShell
      title={person.name}
      titleHref={`/person/${person.slug}`}
      subtitle={`${person.stints.length} term${person.stints.length === 1 ? "" : "s"} · ${formatTenure(total)} total in office`}
    >
      <ul className="space-y-1.5">
        {person.stints.map((s) => (
          <li key={s.termId} className="text-[0.85rem]">
            <span className="tabular-nums text-ink-faint">
              {yearOf(s.startDate)}–{s.endDate ? yearOf(s.endDate) : "now"}
            </span>{" "}
            <span className="text-ink">{OFFICE_LABEL[s.kind]}</span>,{" "}
            <Link
              href={s.stateId === "in" ? "/union" : `/state/${s.stateId}`}
              className="text-accent underline-offset-2 hover:underline"
            >
              {s.stateName}
            </Link>
            {s.partyName && (
              <>
                {" "}
                · <PartyTag name={s.partyName} color={s.partyColor} short />
              </>
            )}
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

export async function PartyPanel({ partyId }: { partyId: string }) {
  const profile = await getPartyProfile(partyId);
  if (!profile) return <PanelShell title="Not found">Unknown party.</PanelShell>;
  const { party, governments, electionHistory } = profile;
  // Union, not sum: a party can hold several offices at once (a chief
  // ministership while holding the prime ministership, or two states
  // simultaneously), and summing terms would report more time in office than
  // has actually elapsed.
  const governedDays = mergedDays(
    governments
      .filter((g) => g.kind === "cm" || g.kind === "pm")
      .map((g) => ({ start: g.startDate, end: g.endDate })),
    new Date().toISOString().slice(0, 10),
  );
  const statesGoverned = [...new Set(governments.filter((g) => g.kind === "cm").map((g) => g.stateName))];
  const bestResult = electionHistory.slice().sort((a, b) => b.seatsWon - a.seatsWon)[0];
  return (
    <PanelShell
      title={party.name}
      titleHref={`/party/${party.id}`}
      subtitle={`${governments.length} term${governments.length === 1 ? "" : "s"} in office · ${formatTenure(governedDays)} governing`}
      swatch={party.color}
    >
      <dl className="space-y-1.5 text-[0.85rem]">
        <div>
          <dt className="inline text-ink-muted">States governed: </dt>
          <dd className="inline text-ink">
            {statesGoverned.length > 0 ? statesGoverned.join(", ") : "—"}
          </dd>
        </div>
        <div>
          <dt className="inline text-ink-muted">Elections with recorded results: </dt>
          <dd className="inline text-ink">{electionHistory.length}</dd>
        </div>
        <div>
          <dt className="inline text-ink-muted">Best recorded result: </dt>
          <dd className="inline text-ink">
            {bestResult ? (
              <Link
                href={`/election/${bestResult.electionId}`}
                className="text-accent underline-offset-2 hover:underline"
              >
                {bestResult.seatsWon} seats ({bestResult.stateName}, {yearOf(bestResult.electionDate)})
              </Link>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
    </PanelShell>
  );
}

/**
 * Two parties, state by state: where each held the government, for how long,
 * and how it polled there. Rows both parties governed come first, because
 * those are the only genuinely like-for-like comparisons.
 *
 * Development indicators are deliberately absent. Putting a state's infant
 * mortality or literacy beside whoever governed it would read as a scorecard
 * attributing those outcomes to a party; the archive does not do that. The
 * state name links out to that state's Development Lens instead, where the
 * indicators keep their own timeline and sources.
 */
export async function PartyStateCompare({ a, b }: { a: string; b: string }) {
  const [left, right, stateRows] = await Promise.all([
    getPartyProfile(a),
    getPartyProfile(b),
    db.query.states.findMany({
      columns: { id: true, name: true, formedOn: true, dissolvedOn: true },
    }),
  ]);
  if (!left || !right) return null;

  const asOf = new Date().toISOString().slice(0, 10);
  const rows = buildPartyStateRows(left, right, stateRows, asOf);
  if (rows.length === 0) return null;

  const shared = rows.filter((r) => r.shared);
  const separate = rows.filter((r) => !r.shared);

  return (
    <section className="pb-8">
      <h2 className="section-label">State by state</h2>
      <p className="mt-1 max-w-3xl text-[0.8rem] text-ink-faint">
        Every state where either party formed the government, with each party&apos;s recorded
        record in that state. States both parties have governed are listed first.
      </p>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-fit">
          <table className="rec-table min-w-[760px] text-[0.85rem]">
            <thead>
              <tr>
                <th className="w-[22%] px-3 py-2">State</th>
                <th className="w-[39%] px-3 py-2">{left.party.name}</th>
                <th className="w-[39%] px-3 py-2">{right.party.name}</th>
              </tr>
            </thead>
            <tbody>
              {shared.length > 0 && (
                <Fragment>
                  <tr>
                    <th colSpan={3} scope="colgroup" className="rec-band">
                      Both parties have governed
                    </th>
                  </tr>
                  {shared.map((r) => (
                    <StateRecordRow key={r.stateId} row={r} />
                  ))}
                </Fragment>
              )}
              {separate.length > 0 && (
                <Fragment>
                  <tr>
                    <th colSpan={3} scope="colgroup" className="rec-band">
                      {shared.length > 0 ? "Governed by one of the two" : "No state in common"}
                    </th>
                  </tr>
                  {separate.map((r) => (
                    <StateRecordRow key={r.stateId} row={r} />
                  ))}
                </Fragment>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 max-w-3xl space-y-1 text-[0.72rem] text-ink-faint">
        <p>
          <span className="font-mono uppercase tracking-[0.08em]">Method.</span> A party counts
          as governing a state only where it held the chief ministership (the prime ministership
          for the Union). Coalition partners without the top office are not counted here. Time in
          office is the union of that party&apos;s terms, so simultaneous offices are never
          counted twice and President&apos;s Rule gaps are excluded. The share is measured
          against the state&apos;s own existence since its formation, so a state created later is
          not made to look worse than an older one.
        </p>
        <p>
          Predecessor parties that governed under an earlier name are separate records in the
          archive and are not merged into their successors. All figures reflect what has been
          recorded and approved here, not necessarily the full historical record.
        </p>
        <p>
          Development indicators are not shown against parties anywhere on this page. Open a
          state to read its indicators on their own timeline, with their sources.
        </p>
      </div>
    </section>
  );
}

function StateRecordRow({ row }: { row: PartyStateRow }) {
  return (
    <tr>
      <td className="px-3 py-2.5">
        <Link
          href={row.isUnion ? "/union" : `/state/${row.stateId}`}
          className="text-ink underline-offset-2 hover:text-accent hover:underline"
        >
          {row.stateName}
        </Link>
        <span className="block text-[0.72rem] text-ink-faint">
          {row.formedOn
            ? row.dissolvedOn
              ? `${yearOf(row.formedOn)} to ${yearOf(row.dissolvedOn)}`
              : `since ${yearOf(row.formedOn)}`
            : "formation date not recorded"}
        </span>
      </td>
      <PartyStateCell cell={row.left} row={row} />
      <PartyStateCell cell={row.right} row={row} />
    </tr>
  );
}

function PartyStateCell({ cell, row }: { cell: PartyStateCellData | null; row: PartyStateRow }) {
  if (!cell) {
    return <td className="px-3 py-2.5 text-ink-faint">No recorded government</td>;
  }
  const officeLabel = row.isUnion ? "Prime Ministers" : "Chief Ministers";
  return (
    <td className="px-3 py-2.5">
      <p className="text-ink">
        <span className="tabular-nums font-medium">{cell.terms}</span> term
        {cell.terms === 1 ? "" : "s"}
        <span className="text-ink-faint"> · </span>
        <span className="tabular-nums">{formatTenure(cell.days)}</span>
        {cell.ongoing && <span className="text-ink-faint"> to date</span>}
      </p>
      {cell.sharePercent !== null && (
        <p className="tabular-nums text-[0.72rem] text-ink-faint">
          {cell.sharePercent}% of the state&apos;s recorded existence
        </p>
      )}
      {cell.headsOfGovernment.length > 0 && (
        <p className="mt-1 text-[0.75rem] text-ink-muted">
          {officeLabel}:{" "}
          {cell.headsOfGovernment.map((name, i) => (
            <Fragment key={name}>
              {i > 0 && ", "}
              <Link
                href={`/person/${personSlug(name)}`}
                className="underline-offset-2 hover:text-accent hover:underline"
              >
                {name}
              </Link>
            </Fragment>
          ))}
        </p>
      )}
      <p className="mt-1 text-[0.72rem] text-ink-faint">
        {cell.elections} election{cell.elections === 1 ? "" : "s"} recorded
        {cell.best && (
          <>
            {" · best "}
            <Link
              href={`/election/${cell.best.electionId}`}
              className="text-accent underline-offset-2 hover:underline"
            >
              {cell.best.seats} seats ({cell.best.year})
            </Link>
          </>
        )}
      </p>
    </td>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export async function StatePanel({ stateId }: { stateId: string }) {
  const article = await getStateArticle(stateId);
  if (!article) return <PanelShell title="Not found">Unknown state.</PanelShell>;
  const { state, terms, elections, events } = article;
  const cmTerms = terms.filter((t) => t.kind === "cm");
  const pr = terms.filter((t) => t.kind === "presidents_rule");
  const prDays = pr.reduce((a, t) => a + days(t.startDate, t.endDate), 0);
  const distinctCms = new Set(cmTerms.map((t) => t.cmName)).size;
  const turnouts = elections.filter((e) => e.turnoutPercent != null).map((e) => Number(e.turnoutPercent));
  const avgTurnout = turnouts.length
    ? (turnouts.reduce((a, b) => a + b, 0) / turnouts.length).toFixed(1)
    : null;
  return (
    <PanelShell title={state.name} titleHref={`/state/${state.id}`}>
      <dl className="space-y-1.5 text-[0.85rem]">
        <Row k="Chief Ministers (distinct)" v={String(distinctCms)} />
        <Row k="CM terms recorded" v={String(cmTerms.length)} />
        <Row
          k="President's Rule"
          v={pr.length > 0 ? `${pr.length} period${pr.length === 1 ? "" : "s"}, ${formatTenure(prDays)}` : "none recorded"}
        />
        <Row k="Elections recorded" v={String(elections.length)} />
        <Row k="Average recorded turnout" v={avgTurnout ? `${avgTurnout}%` : "—"} />
        <Row k="Governance events" v={String(events.length)} />
      </dl>
    </PanelShell>
  );
}

/**
 * Development indicators for two states, aligned row by row so the same
 * indicator sits side by side. Strictly factual: values as published, every
 * cell keeps its source. No scores, no rankings, no verdicts.
 */
export async function StateIndicatorCompare({ a, b }: { a: string; b: string }) {
  const [devA, devB, stateRows] = await Promise.all([
    getDevelopment(a),
    getDevelopment(b),
    db.query.states.findMany({ columns: { id: true, name: true } }),
  ]);
  if (devA.length === 0 && devB.length === 0) return null;

  const names = new Map(stateRows.map((s) => [s.id, s.name]));

  // Union of both states' indicators, grouped by category, in display order.
  const byCategory = new Map<string, Map<string, { left?: IndicatorSeries; right?: IndicatorSeries }>>();
  const put = (grouped: Array<[string, IndicatorSeries[]]>, side: "left" | "right") => {
    for (const [category, list] of grouped) {
      const cat = byCategory.get(category) ?? new Map();
      for (const s of list) {
        const pair = cat.get(s.id) ?? {};
        pair[side] = s;
        cat.set(s.id, pair);
      }
      byCategory.set(category, cat);
    }
  };
  put(devA, "left");
  put(devB, "right");

  return (
    <section className="pb-8">
      <h2 className="section-label">Development indicators, side by side</h2>
      <p className="mt-1 max-w-2xl text-[0.8rem] text-ink-faint">
        Values from named statistical sources, shown as published. Abhilekh does not score,
        rank, or grade governments; the numbers and their sources speak for themselves.
      </p>
      <div className="mt-5 overflow-x-auto">
        <div className="min-w-fit">
          <table className="rec-table min-w-[560px] text-[0.85rem]">
            <thead>
              <tr>
                <th className="w-[28%] px-3 py-2">Indicator</th>
                <th className="w-[36%] px-3 py-2">{names.get(a) ?? a}</th>
                <th className="w-[36%] px-3 py-2">{names.get(b) ?? b}</th>
              </tr>
            </thead>
            <tbody>
              {[...byCategory.entries()].map(([category, pairs]) => (
                <Fragment key={category}>
                  <tr>
                    <th colSpan={3} scope="colgroup" className="rec-band">
                      {category}
                    </th>
                  </tr>
                  {[...pairs.entries()].map(([id, pair]) => {
                    const def = pair.left ?? pair.right!;
                    return (
                      <tr key={id}>
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/indicator/${id}`}
                            title={def.methodology}
                            className="text-ink underline-offset-2 hover:text-accent hover:underline"
                          >
                            {def.name}
                          </Link>
                          <span className="block text-[0.72rem] text-ink-faint">{def.unit}</span>
                        </td>
                        <IndicatorCell series={pair.left} />
                        <IndicatorCell series={pair.right} />
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function IndicatorCell({ series }: { series?: IndicatorSeries }) {
  if (!series || series.values.length === 0) {
    return <td className="px-3 py-2.5 text-ink-faint">—</td>;
  }
  const latest = series.values[series.values.length - 1];
  return (
    <td className="px-3 py-2.5">
      <p className="whitespace-nowrap">
        <span className="tabular-nums font-medium text-ink">{formatNumber(latest.value)}</span>{" "}
        <span className="tabular-nums text-[0.75rem] text-ink-faint">
          ({latest.reportingPeriod ?? latest.year})
        </span>
      </p>
      {series.values.length >= 2 && (
        <div className="mt-1.5">
          <TrendChart
            points={series.values.map((v) => ({ year: v.year, value: Number(v.value) }))}
            width={170}
            height={44}
            ariaLabel={`${series.name}, ${series.values[0].year} to ${latest.year}`}
          />
        </div>
      )}
      <a
        href={latest.sourceUrl}
        target="_blank"
        rel="nofollow noopener noreferrer"
        className="mt-1 inline-block text-[0.72rem] text-accent underline-offset-2 hover:underline"
      >
        {latest.sourceTitle}
      </a>
    </td>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="inline text-ink-muted">{k}: </dt>
      <dd className="inline text-ink">{v}</dd>
    </div>
  );
}

function PanelShell({
  title,
  titleHref,
  subtitle,
  swatch,
  children,
}: {
  title: string;
  titleHref?: string;
  subtitle?: string;
  swatch?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 rounded-sm border border-rule bg-paper-raised p-5">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold leading-tight text-ink">
        {swatch && (
          <span
            aria-hidden
            className="h-4 w-4 rounded-sm border border-black/10"
            style={{ backgroundColor: swatch }}
          />
        )}
        {titleHref ? (
          <Link href={titleHref} className="underline-offset-4 hover:text-accent hover:underline">
            {title}
          </Link>
        ) : (
          title
        )}
      </h2>
      {subtitle && <p className="mt-1 text-[0.8rem] text-ink-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}
