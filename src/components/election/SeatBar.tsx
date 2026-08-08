"use client";

import { useEffect, useState } from "react";

import type { AnalysisResult } from "@/lib/election-analysis";
import { majorityMark } from "@/lib/election-analysis";

/**
 * Previous bar geometry per morph slot, held at module scope so it survives
 * the remount that a compare-selection change causes (the picker navigates,
 * the server re-renders, the panel is a fresh tree). Module state lives as
 * long as the loaded page does, which is exactly the "between selections"
 * window the morph needs; a full reload starts clean and the bar simply
 * renders in place.
 */
const prevBySlot = new Map<string, { widths: Map<string, number>; mark: number | null }>();

/**
 * The at-a-glance result: one stacked bar of all seats won, party-colored,
 * with the majority threshold marked.
 *
 * With a morphKey, the bar interpolates from whatever the same slot showed
 * for the previous selection: first paint uses the old widths, then each
 * segment glides to its new share and the majority mark slides to its new
 * position. The layout around it stays fixed, so only the data appears to
 * move, and the comparison becomes visible motion: pick a different election
 * and watch the majority shrink. Without a morphKey the bar renders exactly
 * as the old server-only version did.
 */
export function SeatBar({
  results,
  totalSeats,
  morphKey,
}: {
  results: AnalysisResult[];
  totalSeats: number | null;
  /** Stable slot id (e.g. "compare-a"); enables morphing between selections. */
  morphKey?: string;
}) {
  const won = results.reduce((a, r) => a + r.seatsWon, 0);
  const denominator = Math.max(totalSeats ?? 0, won, 1);
  const mark = majorityMark(totalSeats);

  const targetWidths = new Map(
    results.map((r) => [r.partyId, (r.seatsWon / denominator) * 100]),
  );
  const targetMark = mark != null ? (mark / denominator) * 100 : null;
  const targetKey = JSON.stringify([...targetWidths.entries(), targetMark]);

  // First paint: the previous selection's geometry where the slot has one.
  const [drawn, setDrawn] = useState(() => {
    const prev = morphKey ? prevBySlot.get(morphKey) : undefined;
    if (!prev) return { widths: targetWidths, mark: targetMark };
    return {
      // Parties absent from the previous bar grow in from zero.
      widths: new Map(results.map((r) => [r.partyId, prev.widths.get(r.partyId) ?? 0])),
      mark: prev.mark ?? targetMark,
    };
  });

  useEffect(() => {
    if (morphKey) prevBySlot.set(morphKey, { widths: targetWidths, mark: targetMark });
    // Flip to the real geometry on the frame after first paint; CSS does the
    // interpolation. Where there was no previous state this is a no-op.
    const raf = requestAnimationFrame(() =>
      setDrawn({ widths: targetWidths, mark: targetMark }),
    );
    return () => cancelAnimationFrame(raf);
    // targetKey serialises the geometry; results itself is a fresh array
    // reference on every server render and would loop the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morphKey, targetKey]);

  return (
    <figure>
      <div className="relative">
        <div className="flex h-[34px] w-full overflow-hidden rounded-lg bg-paper-badge">
          {results.map((r) =>
            r.seatsWon > 0 ? (
              <div
                key={r.partyId}
                style={{
                  width: `${drawn.widths.get(r.partyId) ?? 0}%`,
                  backgroundColor: r.partyColor,
                }}
                className="seat-seg hover:opacity-75"
                title={`${r.partyName}: ${r.seatsWon} seats`}
              />
            ) : null,
          )}
        </div>
        {drawn.mark != null && (
          <div
            aria-hidden
            className="seat-mark absolute inset-y-0 w-px bg-ink"
            style={{ left: `${drawn.mark}%` }}
            title={mark != null ? `Majority: ${mark} seats` : undefined}
          />
        )}
      </div>
      {mark != null && targetMark != null && (
        <p
          aria-hidden
          className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta"
          style={{ marginLeft: `${Math.min(88, targetMark)}%` }}
        >
          Majority {mark}
        </p>
      )}
      <figcaption className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.8rem] text-ink-muted">
        {results.slice(0, 6).map((r) => (
          <span key={r.partyId} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="swatch" style={{ backgroundColor: r.partyColor }} />
            {r.partyAbbreviation ?? r.partyName}{" "}
            <strong className="tabular-nums text-ink">{r.seatsWon}</strong>
          </span>
        ))}
        {totalSeats ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-meta">
            {totalSeats} seats
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
