import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProvenanceNote, ReferenceList } from "@/components/ui/Citations";
import { PartyTag } from "@/components/ui/PartyTag";
import { citationsForRecord, provenanceOf } from "@/lib/db/queries/provenance";
import { getRsMember, RS_SNAPSHOT_DATE } from "@/lib/db/queries/rajya-sabha";
import { formatDate } from "@/lib/format";
import { rsCoverageSentence, rsEndSentence, rsPartyDisplay, rsTypeSentence } from "@/lib/rajya-sabha-labels";

/**
 * One Rajya Sabha member, keyed by the publisher's stable id.
 *
 * Why this route rather than /person/[slug]: that surface keys on a slug of
 * the recorded NAME and deliberately aggregates every office holder sharing
 * one, a documented limitation there. These rows carry a real external
 * identifier, and the ingest ruling is that identity comes from it and never
 * from Member_Name — so the member sits under the person surface, with its
 * own key. Where a name coincides with an office holder elsewhere in the
 * archive, a match candidate is recorded for a person to confirm; this page
 * never asserts the link on its own.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const member = await getRsMember(id);
  if (!member) return {};
  return {
    title: `${member.memberName} — Rajya Sabha`,
    description: `Rajya Sabha terms recorded for ${member.memberName}: seats, party labels as recorded, and how each term ended. Coverage ends ${RS_SNAPSHOT_DATE}.`,
  };
}

export default async function RsMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await getRsMember(id);
  if (!member) notFound();

  const [provenance, sources] = await Promise.all([
    provenanceOf("rs_member", member.id),
    citationsForRecord("rs_member", member.id),
  ]);

  // One status per member: the source records `Type` about the person, then
  // copies it onto each of their terms. Should a future release ever disagree
  // with itself across a member's rows, say so rather than picking one.
  const types = [...new Set(member.terms.map((t) => t.typeSnapshot))];
  const snapshots = [...new Set(member.terms.map((t) => t.snapshotOn))];
  const statusSentence =
    types.length === 1 && snapshots.length === 1
      ? rsTypeSentence(types[0], snapshots[0])
      : types.length > 1
        ? `The source records this member's status inconsistently across their terms (${types.join(" and ")}), so the archive states none of them as the member's status.`
        : null;

  return (
    <article className="mx-auto max-w-[1100px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <p className="section-label">
          <Link href="/rajya-sabha" className="text-accent underline-offset-2 hover:underline">
            Rajya Sabha
          </Link>{" "}
          · member
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink">
          {member.memberName}
        </h1>
        <p className="mt-2 text-[0.8rem] text-ink-faint">
          Name and ordering exactly as the source records them. Identified by the publisher&rsquo;s
          own reference {member.tcpdRsId}, not by the name — two members sharing a recorded name
          remain two records here.
          {member.genderTcpd ? (
            <> Gender recorded by the publisher as {member.genderTcpd}; that is their classification, not the archive&rsquo;s.</>
          ) : null}
        </p>
        {/* `Type` describes the MEMBER at the snapshot and the source repeats
            it on every one of their term rows — which is why it is stated
            once, here, rather than beside a term that ended decades before
            the snapshot was taken. */}
        {statusSentence ? (
          <p className="mt-3 max-w-2xl text-[0.85rem] leading-relaxed text-ink-muted">{statusSentence}</p>
        ) : null}
      </header>

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">
          Terms {member.terms.length > 1 ? `(${member.terms.length})` : ""}
        </h2>
        <ol className="mt-5 space-y-6">
          {member.terms.map((t) => {
            const party = rsPartyDisplay(t.partyLabel, t.partyName);
            return (
              <li key={t.id} className="border-l-2 border-rule pl-4">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="tabular-nums text-[0.95rem] font-medium text-ink">
                    {formatDate(t.startDate)}
                  </span>
                  <span className="text-[0.8rem] text-ink-faint">term {t.termNo}</span>
                  {t.nominated ? (
                    <span className="rounded-sm border border-rule px-1.5 py-0.5 text-[0.72rem] uppercase tracking-wide text-ink-muted">
                      Nominated
                    </span>
                  ) : null}
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[8rem_1fr]">
                  <dt className="text-[0.8rem] uppercase tracking-wide text-ink-faint">Seat</dt>
                  <dd className="text-[0.92rem] text-ink">
                    {t.stateId ? (
                      <Link
                        href={`/state/${t.stateId}`}
                        className="text-accent underline-offset-2 hover:underline"
                      >
                        {t.stateLabel}
                      </Link>
                    ) : (
                      <>
                        <span>{t.stateLabel}</span>
                        <span className="ml-2 text-[0.8rem] italic text-ink-faint">
                          {t.nominated
                            ? "a nominated seat sits under no state"
                            : "no state row in the archive corresponds to this label"}
                        </span>
                      </>
                    )}
                  </dd>

                  <dt className="text-[0.8rem] uppercase tracking-wide text-ink-faint">Party</dt>
                  <dd className="text-[0.92rem] text-ink">
                    {party.kind === "resolved" ? (
                      <span className="inline-flex flex-wrap items-baseline gap-x-2">
                        <Link href={`/party/${t.partyId}`} className="hover:underline">
                          <PartyTag name={t.partyName} color={t.partyColor} />
                        </Link>
                        {party.showVerbatim ? (
                          <span className="text-[0.8rem] text-ink-faint">
                            recorded as &ldquo;{party.verbatim}&rdquo;
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span>
                        <span className="font-medium">&ldquo;{party.verbatim}&rdquo;</span>
                        <span className="ml-2 text-[0.8rem] italic text-ink-faint">{party.note}</span>
                      </span>
                    )}
                  </dd>

                  <dt className="text-[0.8rem] uppercase tracking-wide text-ink-faint">End</dt>
                  <dd className="text-[0.92rem] text-ink-muted">
                    {rsEndSentence(t.endDateTerm, t.endDateActual, t.reasonOfVacation)}
                  </dd>

                </dl>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">
          Where this came from
        </h2>
        <ProvenanceNote provenance={provenance} />
        <ReferenceList sources={sources} />
        <p className="mt-4 max-w-2xl text-[0.82rem] leading-relaxed text-ink-faint">
          {rsCoverageSentence(RS_SNAPSHOT_DATE)}
        </p>
      </section>
    </article>
  );
}
