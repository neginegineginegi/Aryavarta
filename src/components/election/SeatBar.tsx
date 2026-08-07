import type { AnalysisResult } from "@/lib/election-analysis";
import { majorityMark } from "@/lib/election-analysis";

/**
 * The at-a-glance result: one stacked bar of all seats won, party-colored,
 * with the majority threshold marked. Server-rendered, no JS.
 */
export function SeatBar({
  results,
  totalSeats,
}: {
  results: AnalysisResult[];
  totalSeats: number | null;
}) {
  const won = results.reduce((a, r) => a + r.seatsWon, 0);
  const denominator = Math.max(totalSeats ?? 0, won, 1);
  const mark = majorityMark(totalSeats);

  return (
    <figure>
      <div className="relative">
        <div className="flex h-[34px] w-full overflow-hidden rounded-lg bg-paper-badge">
          {results.map((r) =>
            r.seatsWon > 0 ? (
              <div
                key={r.partyId}
                style={{
                  width: `${(r.seatsWon / denominator) * 100}%`,
                  backgroundColor: r.partyColor,
                }}
                className="transition-opacity hover:opacity-75"
                title={`${r.partyName}: ${r.seatsWon} seats`}
              />
            ) : null,
          )}
        </div>
        {mark != null && (
          <div
            aria-hidden
            className="absolute inset-y-0 w-px bg-ink"
            style={{ left: `${(mark / denominator) * 100}%` }}
            title={`Majority: ${mark} seats`}
          />
        )}
      </div>
      {mark != null && (
        <p
          aria-hidden
          className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta"
          style={{ marginLeft: `${Math.min(88, (mark / denominator) * 100)}%` }}
        >
          Majority {mark}
        </p>
      )}
      <figcaption className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.8rem] text-ink-muted">
        {results.slice(0, 6).map((r) => (
          <span key={r.partyId} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="swatch"
              style={{ backgroundColor: r.partyColor }}
            />
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
