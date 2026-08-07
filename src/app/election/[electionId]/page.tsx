import type { Metadata } from "next";
import Link from "next/link";

import { AdminRemoveButton } from "@/components/admin/AdminRemoveButton";
import { notFound } from "next/navigation";

import { SeatBar } from "@/components/election/SeatBar";
import { SeatDeltaTable } from "@/components/election/SeatDeltaTable";
import { ReferenceList } from "@/components/ui/Citations";
import { getElectionDetail } from "@/lib/db/queries/election";
import {
  allianceGroups,
  buildOverview,
  electionTitle,
  seatDeltas,
} from "@/lib/election-analysis";
import { formatDate, formatNumber, yearOf } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ electionId: string }>;
}): Promise<Metadata> {
  const { electionId } = await params;
  const detail = await getElectionDetail(electionId);
  if (!detail) return {};
  return {
    title: electionTitle(detail.election),
    description: buildOverview(detail.election, detail.formedTerm).join(" ").slice(0, 250),
  };
}

export default async function ElectionPage({
  params,
}: {
  params: Promise<{ electionId: string }>;
}) {
  const { electionId } = await params;
  const detail = await getElectionDetail(electionId);
  if (!detail) notFound();
  const { election, previous, formedTerm, sources } = detail;

  const overview = buildOverview(election, formedTerm);
  const deltas = seatDeltas(election.results, previous?.results ?? null);
  const alliances = allianceGroups(election.results);
  const voteShareRows = election.results.filter((r) => r.voteSharePercent != null);

  return (
    <article className="mx-auto max-w-[1200px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <nav className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-meta">
          <Link href="/browse" className="hover:text-ink">Browse</Link>
          <span className="mx-1.5">/</span>
          <Link href={`/state/${election.stateId}`} className="hover:text-ink">
            {election.stateName}
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">Elections</span>
        </nav>
        {/* Breadcrumb, title and meta line run uninterrupted; the actions sit
            below them so nothing breaks that sequence when the title wraps. */}
        <span lang="hi" className="deva-eyebrow mt-4">
          चुनाव परिणाम
        </span>
        <h1 className="mt-1 font-display text-[clamp(32px,4.2vw,48px)] font-light leading-[1.05] text-ink">
          {electionTitle(election)}
        </h1>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
          Polled {formatDate(election.electionDate)}
          {election.assemblyNumber ? (
            <>
              {" "}· constituted the{" "}
              <span className="tabular-nums">{ordinal(election.assemblyNumber)}</span> Assembly
            </>
          ) : null}
          {election.totalSeats ? <> · {formatNumber(election.totalSeats)} seats</> : null}
          {election.turnoutPercent ? <> · {election.turnoutPercent}% turnout</> : null}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link href={`/election/${election.id}/history`} className="btn btn-secondary btn-sm">
            History
          </Link>
          <Link
            href={`/contribute/election?edit=${election.id}`}
            className="btn btn-primary btn-sm"
          >
            Suggest an edit
          </Link>
          <AdminRemoveButton
            entityType="election"
            entityId={election.id}
            label={electionTitle(election)}
          />
        </div>
      </header>

      {/* Auto-generated factual overview */}
      {overview.length > 0 && (
        <section className="section-card px-6 py-9 sm:px-10">
          <h2 className="font-display text-[30px] font-light leading-tight text-ink">Overview</h2>
          <p className="prose-article mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-ink">
            {overview.join(" ")}
          </p>
          <p className="mt-1.5 text-[0.72rem] text-ink-faint">
            Generated automatically from the structured, sourced fields below. No editorial
            judgment is added.
          </p>
        </section>
      )}

      {/* Seat distribution */}
      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[30px] font-light leading-tight text-ink">Seats won</h2>
        <div className="mt-4">
          {election.results.length === 0 ? (
            <p className="text-[0.85rem] text-ink-muted">
              No per-party results recorded yet.{" "}
              <Link
                href={`/contribute/election?edit=${election.id}`}
                className="text-accent underline-offset-2 hover:underline"
              >
                Add them →
              </Link>
            </p>
          ) : (
            <SeatBar results={election.results} totalSeats={election.totalSeats} />
          )}
        </div>
      </section>

      {/* Alliances */}
      {alliances.length > 0 && (
        <section className="section-card px-6 py-9 sm:px-10">
          <h2 className="font-display text-[30px] font-light leading-tight text-ink">Alliances</h2>
          <ul className="mt-3 space-y-2">
            {alliances.map((a) => (
              <li key={a.name} className="text-[0.88rem]">
                <span className="font-medium text-ink">{a.name}</span>{" "}
                <span className="tabular-nums text-ink">{a.seats} seats</span>{" "}
                <span className="text-[0.8rem] text-ink-muted">
                  ({a.parties.map((p) => `${p.partyAbbreviation ?? p.partyName} ${p.seatsWon}`).join(", ")})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Vote share */}
      {voteShareRows.length > 0 && (
        <section className="section-card px-6 py-9 sm:px-10">
          <h2 className="font-display text-[30px] font-light leading-tight text-ink">Vote share</h2>
          <div className="mt-3 max-w-xl space-y-1.5">
            {voteShareRows.map((r) => (
              <div key={r.partyId} className="flex items-center gap-2 text-[0.82rem]">
                <span className="w-36 shrink-0 truncate text-ink-muted" title={r.partyName}>
                  {r.partyAbbreviation ?? r.partyName}
                </span>
                <span className="h-3 flex-1 overflow-hidden rounded-sm bg-paper-sunken">
                  <span
                    className="block h-full rounded-sm"
                    style={{
                      width: `${Math.min(Number(r.voteSharePercent), 100)}%`,
                      backgroundColor: r.partyColor,
                    }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right tabular-nums text-ink">
                  {r.voteSharePercent}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Gains & losses */}
      {previous && deltas.length > 0 && (
        <section className="section-card px-6 py-9 sm:px-10">
          <h2 className="section-label">
            Change vs{" "}
            <Link
              href={`/election/${previous.id}`}
              className="normal-case text-accent underline-offset-2 hover:underline"
            >
              the {yearOf(previous.electionDate)} election
            </Link>
          </h2>
          <div className="mt-3">
            <SeatDeltaTable deltas={deltas} />
          </div>
        </section>
      )}

      {/* Government formed */}
      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[30px] font-light leading-tight text-ink">Government formed</h2>
        {formedTerm ? (
          <p className="mt-3 text-[0.95rem] text-ink">
            <span className="font-display text-lg font-semibold">{formedTerm.cmName}</span>
            {formedTerm.partyName ? <> ({formedTerm.partyName})</> : null}
            <span className="text-[0.85rem] text-ink-muted">
              {", sworn in "}{formatDate(formedTerm.startDate)}
              {formedTerm.endDate ? <>, served until {formatDate(formedTerm.endDate)}</> : ", currently in office"}
            </span>
            {" · "}
            <Link
              href={`/state/${election.stateId}/${yearOf(formedTerm.startDate)}`}
              className="text-[0.85rem] text-accent underline-offset-2 hover:underline"
            >
              view that year →
            </Link>
          </p>
        ) : (
          <p className="mt-3 text-[0.85rem] text-ink-muted">
            No CM term starting within 90 days of this election is recorded yet. The link
            appears automatically once the term is added and approved.
          </p>
        )}
      </section>

      {/* References */}
      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[30px] font-light leading-tight text-ink">References</h2>
        {sources.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-faint">No sources recorded.</p>
        ) : (
          <ReferenceList sources={sources} />
        )}
      </section>
    </article>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
