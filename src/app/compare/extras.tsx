import Link from "next/link";

import { PartyTag } from "@/components/ui/PartyTag";
import { getPartyProfile } from "@/lib/db/queries/party";
import { getPersonBySlug } from "@/lib/db/queries/person";
import { getStateArticle } from "@/lib/db/queries/state";
import { formatTenure } from "@/lib/insights";
import { yearOf } from "@/lib/format";

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
