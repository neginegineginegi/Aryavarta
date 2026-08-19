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
import { orgRecord } from "@/lib/db/queries/entity";
import { provenanceOf } from "@/lib/db/queries/provenance";
import { ProvenanceNote } from "@/components/ui/Citations";
import { edgeLabel, formatPeriod, ORG_KIND_LABELS } from "@/lib/funding/labels";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const rec = await orgRecord(slug);
  // Thrown here as well as in the page: metadata resolves first, and a page
  // that only 404s during streaming has already sent a 200 status line.
  if (!rec) notFound();
  return {
    title: rec ? rec.org.name : "Organisation",
    description: rec?.org.summary ?? "An organisation in the funding and influence record.",
  };
}

/**
 * One organisation, as the archive holds it.
 *
 * This page is the first surface for FCRA registrations and actions, which
 * appear in no graph edge, and it closes with what the archive does NOT hold,
 * because a record page that only lists what exists reads as completeness.
 */
export default async function OrgPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const rec = await orgRecord(slug);
  if (!rec) notFound();
  const provenance = await provenanceOf("org", rec.org.id);

  const { org, labels } = rec;
  const href = (type: string, id: string) => {
    const hit = labels.get(`${type}:${id}`);
    return hit?.slug ? `/network/${type === "org" ? "org" : "person"}/${hit.slug}` : null;
  };
  const label = (type: string, id: string) => labels.get(`${type}:${id}`)?.label ?? id;

  const facts: Array<[string, string]> = [];
  if (org.legalName && org.legalName !== org.name) facts.push(["Legal name", org.legalName]);
  facts.push(["Kind", ORG_KIND_LABELS[org.kind] ?? org.kind]);
  if (org.registrationNumber) facts.push(["Registration number", org.registrationNumber]);
  if (org.registrationType) facts.push(["Registered as", org.registrationType]);
  if (org.incorporatedOn) facts.push(["Formed", org.incorporatedOn.slice(0, 10)]);
  if (org.dissolvedOn) facts.push(["Dissolved", org.dissolvedOn.slice(0, 10)]);
  if (org.city || org.stateId)
    facts.push(["Location", [org.city, org.stateId?.toUpperCase()].filter(Boolean).join(", ")]);

  // What the archive does not hold, said in words. Every line is a statement
  // about these tables; none is permitted to be a statement about the world.
  const notHeld: string[] = [];
  if (rec.received.length === 0 && rec.given.length === 0)
    notHeld.push(
      "No funding transactions are recorded for this organisation, in either direction.",
    );
  else {
    if (rec.received.length === 0)
      notHeld.push("No funding received by this organisation is recorded.");
    if (rec.given.length === 0)
      notHeld.push("No funding given by this organisation is recorded.");
  }
  if (rec.board.length === 0)
    notHeld.push("No board or officer positions are recorded for this organisation.");
  if (rec.fcra.length === 0)
    notHeld.push(
      "No FCRA registration or action is recorded. The archive has not established whether one exists.",
    );
  if (!org.incorporatedOn) notHeld.push("No formation date is recorded.");
  if (rec.received.some((t) => !t.financialYear && !t.occurredOn))
    notHeld.push(
      "At least one recorded transaction carries no year, because its source stated none.",
    );

  return (
    <div className="mx-auto max-w-[1000px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/network" className="hover:text-ink">
            Network
          </Link>
        </nav>
        <h1 className="mt-1 font-display text-[clamp(28px,3.4vw,40px)] font-light leading-[1.08]">
          {org.name}
        </h1>
        {org.summary && <p className="mt-3 max-w-[70ch] text-ink-muted">{org.summary}</p>}
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href={`/network?root=org:${org.id}`} className="btn btn-primary">
            Explore its network
          </Link>
          <Link href={`/network/connect?a=org:${org.id}`} className="btn btn-secondary">
            What connects it to…
          </Link>
        </div>
      </header>

      <RecordSection title="The record">
        <dl className="rec-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          {org.website && (
            <div>
              <dt>Website</dt>
              <dd>
                <a href={org.website} target="_blank" rel="noreferrer noopener" className="rec-link">
                  {org.website.replace(/^https?:\/\//, "")}
                </a>
              </dd>
            </div>
          )}
          {rec.parent && (
            <div>
              <dt>Parent organisation</dt>
              <dd>
                <Link href={`/network/org/${rec.parent.slug}`} className="rec-link">
                  {rec.parent.name}
                </Link>
              </dd>
            </div>
          )}
          {rec.children.length > 0 && (
            <div>
              <dt>Recorded as parent of</dt>
              <dd>
                {rec.children.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && ", "}
                    <Link href={`/network/org/${c.slug}`} className="rec-link">
                      {c.name}
                    </Link>
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
        {org.revisionNote && (
          <p className="rec-revision">
            This record was revised on {org.revisedOn?.slice(0, 10)}: {org.revisionNote}
          </p>
        )}
        <SourceLines citations={org.citations} />
        {/* Funding is the most contestable data the archive holds, so how a
            record got here is stated on the record itself rather than left to
            be inferred from the citations. A citation says where a fact came
            from; it does not say whether anybody checked it. */}
        <ProvenanceNote provenance={provenance} />
      </RecordSection>

      {(rec.received.length > 0 || rec.given.length > 0) && (
        <RecordSection
          title="Funding"
          intro="Each entry is one recorded transaction, in the currency its source states. What any of it was for is quoted from the source, never paraphrased."
        >
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

      {rec.board.length > 0 && (
        <RecordSection
          title="People"
          intro="Roles are recorded in the source's own words."
        >
          <ul className="space-y-4">
            {rec.board.map((b) => (
              <li key={b.id} className="rec-item">
                <p className="rec-item-head">
                  <Link href={`/network/person/${b.personSlug}`} className="rec-link">
                    {b.personName}
                  </Link>
                  <span className="text-ink-muted"> · {b.role}</span>
                  {formatPeriod(
                    b.startOn ? Number(b.startOn.slice(0, 4)) : null,
                    b.endOn ? Number(b.endOn.slice(0, 4)) : null,
                  ) && (
                    <span className="text-ink-muted">
                      {" "}
                      ·{" "}
                      {formatPeriod(
                        b.startOn ? Number(b.startOn.slice(0, 4)) : null,
                        b.endOn ? Number(b.endOn.slice(0, 4)) : null,
                      )}
                    </span>
                  )}{" "}
                  <EvidenceBadge status={b.evidenceStatus} />
                </p>
                <SourceLines citations={b.citations} />
              </li>
            ))}
          </ul>
        </RecordSection>
      )}

      {rec.fcra.length > 0 && (
        <RecordSection
          title="FCRA record"
          intro="Registrations and actions under the Foreign Contribution (Regulation) Act, as the cited records state them. Holding or losing FCRA registration is a regulatory status, not a finding about conduct."
        >
          <ul className="space-y-5">
            {rec.fcra.map((f) => (
              <li key={f.id} className="rec-item">
                <p className="rec-item-head">
                  {f.actionKind ? (
                    <strong>{f.actionKind.replace(/_/g, " ")}</strong>
                  ) : (
                    <strong>Registration</strong>
                  )}
                  {f.actionOn && <span className="text-ink-muted"> · {f.actionOn.slice(0, 7)}</span>}
                  {f.registrationNumber && (
                    <span className="text-ink-muted"> · reg. {f.registrationNumber}</span>
                  )}
                  <span className="text-ink-muted"> · status: {f.status}</span>{" "}
                  <EvidenceBadge status={f.evidenceStatus} />
                </p>
                {f.actionNote && <p className="rec-item-note">{f.actionNote}</p>}
                <SourceLines citations={f.citations} />
              </li>
            ))}
          </ul>
        </RecordSection>
      )}

      {rec.outcomes.length > 0 && (
        <RecordSection
          title="Recorded outcomes"
          intro="What happened to this organisation, per the cited records. Outcomes attach to what they happened to; who or what caused them is not asserted here."
        >
          <ul className="space-y-5">
            {rec.outcomes.map((o) => (
              <li key={o.id} className="rec-item">
                <p className="rec-item-head">
                  <strong>{o.kind.replace(/_/g, " ")}</strong>
                  {o.occurredOn && (
                    <span className="text-ink-muted"> · {o.occurredOn.slice(0, 10)}</span>
                  )}{" "}
                  <EvidenceBadge status={o.evidenceStatus} />
                </p>
                <p className="rec-item-note">{o.summary}</p>
                <SourceLines citations={o.citations} />
              </li>
            ))}
          </ul>
        </RecordSection>
      )}

      {rec.relationships.length > 0 && (
        <RecordSection title="Other recorded relationships">
          <ul className="space-y-4">
            {rec.relationships.map((r) => {
              const outbound = r.fromType === "org" && r.fromId === org.id;
              const otherType = outbound ? r.toType : r.fromType;
              const otherId = outbound ? r.toId : r.fromId;
              const otherHref = href(otherType, otherId);
              return (
                <li key={r.id} className="rec-item">
                  <p className="rec-item-head">
                    {outbound ? org.name : label(otherType, otherId)}{" "}
                    {edgeLabel(r.kind, false)}{" "}
                    {outbound ? (
                      otherHref ? (
                        <Link href={otherHref} className="rec-link">
                          {label(otherType, otherId)}
                        </Link>
                      ) : (
                        label(otherType, otherId)
                      )
                    ) : (
                      org.name
                    )}{" "}
                    <EvidenceBadge status={r.evidenceStatus} />
                  </p>
                  {r.detail && <p className="rec-item-note">{r.detail}</p>}
                  <SourceLines citations={r.citations} />
                </li>
              );
            })}
          </ul>
        </RecordSection>
      )}

      {rec.matches.length > 0 && (
        <RecordSection
          title="Unresolved identity"
          intro="The archive records these as open questions, not as findings. There is no merge: two records that turn out to be one body stay two records, joined by a reviewed match."
        >
          <ul className="space-y-4">
            {rec.matches.map((m) => (
              <li key={m.id} className="rec-item">
                <p className="rec-item-head">
                  May be the same body as{" "}
                  {m.otherSlug ? (
                    <Link href={`/network/org/${m.otherSlug}`} className="rec-link">
                      {m.otherName}
                    </Link>
                  ) : (
                    <strong>{m.otherName}</strong>
                  )}
                  <span className="text-ink-muted"> · status: {m.status}</span>
                </p>
                <p className="rec-item-note">{m.rationale}</p>
              </li>
            ))}
          </ul>
        </RecordSection>
      )}

      <NotHeldSection lines={notHeld} questions={rec.questions} />
    </div>
  );
}
