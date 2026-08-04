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
    <article className="mx-auto max-w-4xl px-6 pb-12">
      <header className="border-b border-rule py-10">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/" className="hover:text-ink">Map</Link>
          <span className="mx-1.5">/</span>
          <Link href={`/state/${election.stateId}`} className="hover:text-ink">
            {election.stateName}
          </Link>
          <span className="mx-1.5">/</span>
          <span>Election {yearOf(election.electionDate)}</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {electionTitle(election)}
          </h1>
          <span className="flex gap-2">
            <Link
              href={`/election/${election.id}/history`}
              className="rounded-sm border border-rule-dark px-3 py-1 text-[0.82rem] text-ink-muted transition-colors hover:border-ink hover:text-ink"
            >
              History
            </Link>
            <Link
              href={`/contribute/election?edit=${election.id}`}
              className="rounded-sm border border-rule-dark px-3 py-1 text-[0.82rem] text-ink transition-colors hover:border-ink"
            >
              Suggest an edit
            </Link>
            <span className="self-center">
              <AdminRemoveButton
                entityType="election"
                entityId={election.id}
                label={electionTitle(election)}
              />
            </span>
          </span>
        </div>
        <p className="mt-2 text-[0.85rem] text-ink-muted">
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
      </header>

      {/* Auto-generated factual overview */}
      {overview.length > 0 && (
        <section className="border-b border-rule py-6">
          <h2 className="section-label">Overview</h2>
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
      <section className="border-b border-rule py-6">
        <h2 className="section-label">Seats won</h2>
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
        <section className="border-b border-rule py-6">
          <h2 className="section-label">Alliances</h2>
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
        <section className="border-b border-rule py-6">
          <h2 className="section-label">Vote share</h2>
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
        <section className="border-b border-rule py-6">
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
      <section className="border-b border-rule py-6">
        <h2 className="section-label">Government formed</h2>
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
      <section className="py-6">
        <h2 className="section-label">References</h2>
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
