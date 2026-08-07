"use client";

import { useState } from "react";

import { SourceEntry } from "@/components/ui/Citations";
import { SourceDrawer } from "@/components/ui/SourceDrawer";
import type { SourceRef } from "@/lib/db/queries/state";
import type { SourceClassification, SourceUse } from "@/lib/db/queries/sources";

/**
 * The references section, with the Source Explorer attached.
 *
 * Renders the same numbered list as ReferenceList, so a page that adopts this
 * looks identical until you interact with it. The row's title link still goes
 * straight to the issuer, which is the behaviour readers already have; the
 * Explorer sits behind a separate control on the row, so nothing that worked
 * before now opens a panel instead.
 *
 * Serialisable props only: the maps built server-side are handed over as plain
 * records.
 */
export function SourceList({
  sources,
  usage,
  classifications,
}: {
  sources: SourceRef[];
  usage: Record<string, SourceUse[]>;
  classifications: Record<string, SourceClassification>;
}) {
  const [open, setOpen] = useState<number | null>(null);

  if (sources.length === 0) return null;
  const selected = open !== null ? sources[open] : null;

  return (
    <>
      <ol className="mt-3 space-y-1.5 text-[0.82rem] leading-relaxed text-ink-muted">
        {sources.map((s, i) => (
          <li key={s.id} id={`source-${i + 1}`} className="row-hover flex gap-2 rounded-sm">
            <SourceEntry source={s} n={i + 1} />
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta hover:text-verify"
              aria-label={`What else cites ${s.title}`}
            >
              {usage[s.id]?.length
                ? `${usage[s.id].length} record${usage[s.id].length === 1 ? "" : "s"}`
                : "Details"}
            </button>
          </li>
        ))}
      </ol>

      {selected && open !== null && (
        <SourceDrawer
          source={selected}
          number={open + 1}
          classification={classifications[selected.id]}
          usage={usage[selected.id] ?? []}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
