import Link from "next/link";

import type { EdgeEvidence } from "@/lib/db/queries/network";
import { bySourceStrength } from "@/lib/funding/source-rank";
import { EVIDENCE_LABELS, formatAmount, formatPeriod } from "@/lib/funding/labels";

/**
 * Shared pieces of the org and person record pages.
 *
 * Server components with no state: a record page is a document, and everything
 * interactive about the layer lives in the graph. The one rule carried
 * throughout is that nothing renders without its sources beside it, and a row
 * that has none says so in words rather than looking like the rest.
 */

export function EvidenceBadge({ status }: { status: string }) {
  return <span className={`ev ev-${status}`}>{EVIDENCE_LABELS[status] ?? status}</span>;
}

export function SourceLines({ citations }: { citations: EdgeEvidence[] }) {
  if (citations.length === 0) {
    return <p className="net-nosource">No source is recorded against this entry.</p>;
  }
  const sorted = [...citations].sort(bySourceStrength);
  return (
    <ul className="rec-sources">
      {sorted.map((s) => (
        <li key={s.sourceId}>
          <a href={s.url} target="_blank" rel="noreferrer noopener">
            {s.title}
          </a>
          <span className="net-source-meta">
            {[s.publisher, s.publishedOn?.slice(0, 4), s.isOfficial ? "official" : null]
              .filter(Boolean)
              .join(" · ")}
            {s.note ? ` · ${s.note}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RecordSection({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section-card mt-4 px-6 py-8 sm:px-10">
      <h2 className="font-display text-[1.35rem] font-light">{title}</h2>
      {intro && <p className="mt-1 max-w-[70ch] text-[0.88rem] text-ink-muted">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function TxRow({
  counterpartyLabel,
  counterpartyHref,
  direction,
  amount,
  currency,
  financialYear,
  occurredOn,
  fundingType,
  statedPurpose,
  notes,
  evidenceStatus,
  citations,
}: {
  counterpartyLabel: string;
  counterpartyHref: string | null;
  direction: "from" | "to";
  amount: string | null;
  currency: string | null;
  financialYear: string | null;
  occurredOn: string | null;
  fundingType: string;
  statedPurpose: string | null;
  notes: string | null;
  evidenceStatus: string;
  citations: EdgeEvidence[];
}) {
  const shown = formatAmount(amount, currency);
  const year =
    financialYear ??
    (occurredOn ? formatPeriod(Number(occurredOn.slice(0, 4)), null)?.replace("since ", "") : null);
  return (
    <li className="rec-item">
      <p className="rec-item-head">
        <span className="text-ink-faint">{direction === "from" ? "From" : "To"}</span>{" "}
        {counterpartyHref ? (
          <Link href={counterpartyHref} className="rec-link">
            {counterpartyLabel}
          </Link>
        ) : (
          <strong>{counterpartyLabel}</strong>
        )}
        {shown && <strong> · {shown}</strong>}
        {year && <span className="text-ink-muted"> · {year}</span>}
        <span className="text-ink-muted"> · {fundingType.replace(/_/g, " ")}</span>{" "}
        <EvidenceBadge status={evidenceStatus} />
      </p>
      {statedPurpose && (
        <p className="rec-item-quote">
          Stated purpose: <q>{statedPurpose}</q>
        </p>
      )}
      {notes && <p className="rec-item-note">{notes}</p>}
      <SourceLines citations={citations} />
    </li>
  );
}

/**
 * The section the layer exists for. Everything above it is what the archive
 * holds; this says, in words, what it does not, so absence is never left to be
 * read as implication. Every sentence is about the ARCHIVE, not the world:
 * "no funding is recorded" is a checkable statement about these tables, and
 * that is the only kind this section is allowed to make.
 */
export function NotHeldSection({
  lines,
  questions,
}: {
  lines: string[];
  questions: Array<{ id: string; question: string; whyItMatters: string | null }>;
}) {
  if (lines.length === 0 && questions.length === 0) return null;
  return (
    <section className="section-card mt-4 px-6 py-8 sm:px-10">
      <h2 className="font-display text-[1.35rem] font-light">What the archive does not hold</h2>
      <p className="mt-1 max-w-[70ch] text-[0.88rem] text-ink-muted">
        Statements about these tables, not about the world. A gap in the record is a gap in the
        record; it is not evidence of anything.
      </p>
      <ul className="mt-4 space-y-2 text-[0.92rem] text-ink-body">
        {lines.map((l, i) => (
          <li key={i} className="rec-nothing">
            {l}
          </li>
        ))}
      </ul>
      {questions.length > 0 && (
        <>
          <h3 className="mt-6 text-[0.95rem] text-ink">Open questions</h3>
          <ul className="mt-2 space-y-2 text-[0.92rem]">
            {questions.map((q) => (
              <li key={q.id}>
                {q.question}
                {q.whyItMatters && (
                  <span className="block text-[0.85rem] text-ink-soft">{q.whyItMatters}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
