import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  EvidenceBadge,
  NotHeldSection,
  RecordSection,
  SourceLines,
  TxRow,
} from "@/components/network/RecordParts";
import { personRecord } from "@/lib/db/queries/entity";
import { provenanceOf } from "@/lib/db/queries/provenance";
import { ProvenanceNote } from "@/components/ui/Citations";
import { SequenceView } from "@/components/network/SequenceView";
import { boardEntries, fundingEntries } from "@/lib/funding/sequence-entries";
import { formatPeriod } from "@/lib/funding/labels";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const rec = await personRecord(slug);
  // Thrown here as well as in the page: metadata resolves first, and a page
  // that only 404s during streaming has already sent a 200 status line.
  if (!rec) notFound();
  return {
    title: rec ? rec.person.name : "Person",
    description: rec?.person.publicRoleBasis ?? "A person in the funding and influence record.",
  };
}

/**
 * One person, as the archive holds them.
 *
 * The page opens with the sentence that justifies its existence: why this
 * person is in a public archive at all. A person with no institutional role
 * has no page here, and the required field is what guarantees it.
 */
export default async function PersonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const rec = await personRecord(slug);
  if (!rec) notFound();
  const provenance = await provenanceOf("person_record", rec.person.id);

  const { person, labels } = rec;
  const href = (type: string, id: string) => {
    const hit = labels.get(`${type}:${id}`);
    return hit?.slug ? `/network/${type === "org" ? "org" : "person"}/${hit.slug}` : null;
  };
  const label = (type: string, id: string) => labels.get(`${type}:${id}`)?.label ?? id;
  const other = (type: string, id: string) => ({ label: label(type, id), href: href(type, id) });

  /* Positions and funding in one list, so the order between them is visible.
     A board seat and a grant are separate sections above, and separate
     sections cannot show that one is recorded before the other. */
  const inOrder = [
    ...boardEntries(rec.positions, "person", (b) => other("org", b.orgId)),
    ...fundingEntries(rec.received, "received", (t) => other(t.donorType, t.donorId)),
    ...fundingEntries(rec.given, "given", (t) => other(t.recipientType, t.recipientId)),
  ];

  const notHeld: string[] = [];
  if (rec.positions.length === 0)
    notHeld.push("No institutional positions are recorded for this person.");
  if (rec.positions.some((p) => !p.startOn))
    notHeld.push(
      "At least one recorded position carries no start date, because its source stated none.",
    );
  if (rec.given.length === 0 && rec.received.length === 0)
    notHeld.push("No funding transactions are recorded involving this person directly.");

  return (
    <div className="mx-auto max-w-[1000px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/network" className="hover:text-ink">
            Network
          </Link>
        </nav>
        <h1 className="mt-1 font-display text-[clamp(28px,3.4vw,40px)] font-light leading-[1.08]">
          {person.name}
        </h1>
        {/* Why this person is in a public archive, before anything else. */}
        <p className="mt-3 max-w-[70ch] text-ink-muted">{person.publicRoleBasis}</p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href={`/network?root=person:${person.id}`} className="btn btn-primary">
            Explore their network
          </Link>
          <Link href={`/network/connect?a=person:${person.id}`} className="btn btn-secondary">
            What connects them to…
          </Link>
        </div>
      </header>

      <RecordSection title="The record">
        {person.summary && <p className="max-w-[70ch] text-[0.95rem]">{person.summary}</p>}
        <SourceLines citations={person.citations} />
        <ProvenanceNote provenance={provenance} />
      </RecordSection>

      {rec.positions.length > 0 && (
        <RecordSection
          title="Positions"
          intro="Roles are recorded in the source's own words."
        >
          <ul className="space-y-4">
            {rec.positions.map((p) => (
              <li key={p.id} className="rec-item">
                <p className="rec-item-head">
                  <span className="text-ink-muted">{p.role} at </span>
                  <Link href={`/network/org/${p.orgSlug}`} className="rec-link">
                    {p.orgName}
                  </Link>
                  {formatPeriod(
                    p.startOn ? Number(p.startOn.slice(0, 4)) : null,
                    p.endOn ? Number(p.endOn.slice(0, 4)) : null,
                  ) && (
                    <span className="text-ink-muted">
                      {" "}
                      ·{" "}
                      {formatPeriod(
                        p.startOn ? Number(p.startOn.slice(0, 4)) : null,
                        p.endOn ? Number(p.endOn.slice(0, 4)) : null,
                      )}
                    </span>
                  )}{" "}
                  <EvidenceBadge status={p.evidenceStatus} />
                </p>
                <SourceLines citations={p.citations} />
              </li>
            ))}
          </ul>
        </RecordSection>
      )}

      {(rec.received.length > 0 || rec.given.length > 0) && (
        <RecordSection title="Funding">
          <ul className="space-y-5">
            {rec.received.map((t) => (
              <TxRow
                key={t.id}
                direction="from"
                counterpartyLabel={label(t.donorType, t.donorId)}
                counterpartyHref={href(t.donorType, t.donorId)}
                amount={t.amount}
                currency={t.currency}
                financialYear={t.financialYear}
                occurredOn={t.occurredOn}
                fundingType={t.fundingType}
                statedPurpose={t.statedPurpose}
                notes={t.notes}
                evidenceStatus={t.evidenceStatus}
                citations={t.citations}
              />
            ))}
            {rec.given.map((t) => (
              <TxRow
                key={t.id}
                direction="to"
                counterpartyLabel={label(t.recipientType, t.recipientId)}
                counterpartyHref={href(t.recipientType, t.recipientId)}
                amount={t.amount}
                currency={t.currency}
                financialYear={t.financialYear}
                occurredOn={t.occurredOn}
                fundingType={t.fundingType}
                statedPurpose={t.statedPurpose}
                notes={t.notes}
                evidenceStatus={t.evidenceStatus}
                citations={t.citations}
              />
            ))}
          </ul>
        </RecordSection>
      )}

      <SequenceView entries={inOrder} subject={person.name} />

      <NotHeldSection lines={notHeld} questions={rec.questions} />
    </div>
  );
}
