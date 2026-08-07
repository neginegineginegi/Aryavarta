"use client";

import { useEffect, useRef } from "react";

import type { SourceRef } from "@/lib/db/queries/state";
import type { SourceClassification, SourceUse } from "@/lib/db/queries/sources";
import { SOURCE_KIND_LABELS, formatDate } from "@/lib/format";

/**
 * The Source Explorer, ported from the record archetype.
 *
 * A citation marker reads as one footnote under one claim. In practice a
 * single gazette or ECI report carries dozens of entries, and this drawer is
 * where that becomes visible: what the source is, who issued it, and every
 * other record in the archive resting on it.
 *
 * Two things the prototype shows are deliberately absent. It renders a
 * "relevant excerpt" for every source; the archive stores no excerpt, so one
 * appears only where a moderator actually wrote a citation note, and the block
 * is omitted otherwise rather than filled with something plausible. And its
 * "Download" button is dropped: nothing here is hosted, so the only honest
 * action is to send the reader to the issuer.
 */

/** Factual classification, never a rating. Absent fields simply do not show. */
function classify(c: SourceClassification | undefined): string | null {
  if (!c) return null;
  const parts: string[] = [];
  if (c.isPrimary === true) parts.push("Primary");
  else if (c.isPrimary === false) parts.push("Secondary");
  if (c.isOfficial === true) parts.push("official record");
  else if (c.isOfficial === false) parts.push("independent");
  const kind = c.kind ? (SOURCE_KIND_LABELS[c.kind] ?? c.kind) : null;
  if (kind) parts.push(kind.toLowerCase());
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function SourceDrawer({
  source,
  number,
  classification,
  usage,
  note,
  onClose,
}: {
  source: SourceRef;
  number: number;
  classification?: SourceClassification;
  usage: SourceUse[];
  note?: string | null;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes, and focus moves into the panel so a keyboard reader is not
  // left behind on the marker they came from.
  useEffect(() => {
    panelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cls = classify(classification);

  return (
    <>
      <div
        className="anim-scrim-in fixed inset-0 z-40 bg-ink/25"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Source ${number}: ${source.title}`}
        tabIndex={-1}
        className="anim-drawer-in fixed inset-y-4 right-4 z-50 w-[390px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[24px] bg-paper-raised px-7 py-7 shadow-[0_12px_48px_rgba(0,0,0,0.18)] outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-verify">
            Source {number}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press rounded-full px-2 py-1 text-[18px] leading-none text-ink-meta hover:text-ink"
          >
            ×
          </button>
        </div>

        <h2 className="font-display text-[22px] font-normal leading-[1.3] text-ink">
          {source.title}
        </h2>

        <dl className="mt-5 grid grid-cols-[96px_1fr] gap-x-3.5 gap-y-1.5 text-[13px]">
          <dt className="pt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">
            Publisher
          </dt>
          <dd className="text-ink-body">{source.publisher ?? "Not recorded"}</dd>
          <dt className="pt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">
            Published
          </dt>
          <dd className="text-ink-body">
            {source.publishedOn ? formatDate(source.publishedOn) : "Not recorded"}
          </dd>
          {cls && (
            <>
              <dt className="pt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">
                Class
              </dt>
              <dd className="text-ink-body">{cls}</dd>
            </>
          )}
          {source.accessedOn && (
            <>
              <dt className="pt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">
                Accessed
              </dt>
              <dd className="text-ink-body">{formatDate(source.accessedOn)}</dd>
            </>
          )}
        </dl>

        {note && (
          <div className="mt-5 rounded-panel bg-paper-sunken px-4.5 py-4">
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">
              Note on this citation
            </p>
            <p className="font-display text-[14.5px] italic leading-relaxed text-ink-muted">
              {note}
            </p>
          </div>
        )}

        <div className="mt-5">
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">
            {/* Not "also cited by": the index includes records on the page
                you are reading, and claiming otherwise would misdescribe it. */}
            {usage.length > 0
              ? `Records citing this source (${usage.length})`
              : "Records citing this source"}
          </p>
          {usage.length === 0 ? (
            <p className="py-2 text-[13px] text-ink-faint">
              No published record cites this source yet.
            </p>
          ) : (
            <ul>
              {usage.slice(0, 12).map((u) => (
                <li key={`${u.kind}-${u.href}-${u.label}`}>
                  <a
                    href={u.href}
                    className="block border-b border-rule-light py-2 text-[13.5px] text-ink-body hover:text-accent"
                  >
                    {u.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {usage.length > 12 && (
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">
              and {usage.length - 12} more
            </p>
          )}
        </div>

        <div className="mt-6">
          <a
            href={source.url}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="btn btn-primary btn-sm"
          >
            Open the source
          </a>
        </div>

        <p className="mt-5 text-[12px] leading-relaxed text-ink-faint">
          One authoritative source can carry many records. Correcting a source corrects every
          record that rests on it, which is why the archive cites documents rather than
          restating them.
        </p>
      </div>
    </>
  );
}
