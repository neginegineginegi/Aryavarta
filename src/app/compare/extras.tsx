import Link from "next/link";

import { PartyTag } from "@/components/ui/PartyTag";
import { TrendChart } from "@/components/ui/TrendChart";
import { getDevelopment, type IndicatorSeries } from "@/lib/db/queries/development";
import { getPartyProfile } from "@/lib/db/queries/party";
import { getPersonBySlug } from "@/lib/db/queries/person";
import { getStateArticle } from "@/lib/db/queries/state";
import { db } from "@/lib/db";
import { formatTenure } from "@/lib/insights";
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
  const governedDays = governments
    .filter((g) => g.kind === "cm" || g.kind === "pm")
    .reduce((a, g) => a + days(g.startDate, g.endDate), 0);
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
      <div className="mt-4 space-y-6">
        {[...byCategory.entries()].map(([category, pairs]) => (
          <div key={category} className="overflow-x-auto">
            <h3 className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-ink-muted">
              {category}
            </h3>
            <table className="mt-2 w-full min-w-[560px] text-left text-[0.85rem]">
              <thead>
                <tr className="border-b border-rule-dark text-[0.7rem] uppercase tracking-wider text-ink-faint">
                  <th className="w-[28%] py-1.5 pr-4 font-medium">Indicator</th>
                  <th className="w-[36%] py-1.5 pr-4 font-medium">{names.get(a) ?? a}</th>
                  <th className="w-[36%] py-1.5 font-medium">{names.get(b) ?? b}</th>
                </tr>
              </thead>
              <tbody>
                {[...pairs.entries()].map(([id, pair]) => {
                  const def = pair.left ?? pair.right!;
                  return (
                    <tr key={id} className="border-b border-rule align-top">
                      <td className="py-2.5 pr-4">
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
                      <IndicatorCell series={pair.right} last />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}

function IndicatorCell({ series, last }: { series?: IndicatorSeries; last?: boolean }) {
  const pad = last ? "" : " pr-4";
  if (!series || series.values.length === 0) {
    return <td className={`py-2.5 text-ink-faint${pad}`}>—</td>;
  }
  const latest = series.values[series.values.length - 1];
  return (
    <td className={`py-2.5${pad}`}>
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
