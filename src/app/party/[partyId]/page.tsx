import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { getPartyProfile } from "@/lib/db/queries/party";
import { personSlug } from "@/lib/db/queries/person";
import { formatElectionDate, yearOf } from "@/lib/format";

const OFFICE_LABEL = {
  cm: "Chief Minister",
  pm: "Prime Minister",
  president: "President",
  governor: "Governor",
  presidents_rule: "President's Rule",
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ partyId: string }>;
}): Promise<Metadata> {
  const { partyId } = await params;
  const profile = await getPartyProfile(partyId);
  if (!profile) return {};
  return {
    title: profile.party.name,
    description: `${profile.party.name}: governments held and election performance across Indian states and the Union, with sources.`,
  };
}

export default async function PartyPage({
  params,
}: {
  params: Promise<{ partyId: string }>;
}) {
  const { partyId } = await params;
  const profile = await getPartyProfile(partyId);
  if (!profile) notFound();
  const { party, governments, electionHistory } = profile;

  return (
    <article className="mx-auto max-w-[1100px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <p className="section-label">Political party</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span
            aria-hidden
            className="h-6 w-6 rounded-sm border border-black/10"
            style={{ backgroundColor: party.color }}
          />
          <h1 className="font-display text-[clamp(34px,4.5vw,48px)] font-light leading-[1.05] text-ink">
            {party.name}
          </h1>
          {party.abbreviation && (
            <span className="text-lg text-ink-muted">({party.abbreviation})</span>
          )}
          {party.isPseudo && <Badge variant="neutral">ECI category, not a party</Badge>}
        </div>
      </header>

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">Governments held</h2>
        {governments.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-muted">
            No recorded terms in office under this party yet.
          </p>
        ) : (
          <table className="mt-4 w-full text-left text-[0.88rem]">
            <thead>
              <tr className="border-b border-rule-dark text-[0.72rem] tracking-[0.04em] text-ink-faint">
                <th className="py-2 pr-4 font-medium">Period</th>
                <th className="py-2 pr-4 font-medium">Office</th>
                <th className="py-2 pr-4 font-medium">Holder</th>
                <th className="py-2 font-medium">Where</th>
              </tr>
            </thead>
            <tbody>
              {governments.map((g) => (
                <tr key={g.termId} className="border-b border-rule align-baseline">
                  <td className="py-2.5 pr-4 whitespace-nowrap tabular-nums text-ink-muted">
                    {yearOf(g.startDate)} – {g.endDate ? yearOf(g.endDate) : "present"}
                  </td>
                  <td className="py-2.5 pr-4 text-ink-muted">{OFFICE_LABEL[g.kind]}</td>
                  <td className="py-2.5 pr-4">
                    {g.cmName ? (
                      <Link
                        href={`/person/${personSlug(g.cmName)}`}
                        className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
                      >
                        {g.cmName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2.5">
                    <Link
                      href={g.stateId === "in" ? "/union" : `/state/${g.stateId}`}
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      {g.stateName}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">Election performance</h2>
        {electionHistory.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-muted">
            No recorded election results for this party yet.
          </p>
        ) : (
          <table className="mt-4 w-full max-w-2xl text-left text-[0.88rem]">
            <thead>
              <tr className="border-b border-rule-dark text-[0.72rem] tracking-[0.04em] text-ink-faint">
                <th className="py-2 pr-4 font-medium">Election</th>
                <th className="py-2 pr-4 font-medium">Where</th>
                <th className="py-2 text-right font-medium">Seats won</th>
              </tr>
            </thead>
            <tbody>
              {electionHistory.map((e) => (
                <tr key={e.electionId} className="border-b border-rule align-baseline">
                  <td className="py-2.5 pr-4">
                    <Link
                      href={`/election/${e.electionId}`}
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      {formatElectionDate(e)}
                      {e.scope === "lok_sabha" ? " (Lok Sabha)" : ""}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4 text-ink-muted">{e.stateName}</td>
                  <td className="py-2.5 text-right tabular-nums text-ink">
                    {e.seatsWon}
                    {e.totalSeats ? (
                      <span className="text-ink-faint"> / {e.totalSeats}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </article>
  );
}
