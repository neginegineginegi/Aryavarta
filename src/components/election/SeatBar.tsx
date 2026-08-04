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
        <div className="flex h-7 w-full overflow-hidden rounded-sm border border-rule-dark bg-paper-sunken">
          {results.map((r) =>
            r.seatsWon > 0 ? (
              <div
                key={r.partyId}
                style={{
                  width: `${(r.seatsWon / denominator) * 100}%`,
                  backgroundColor: r.partyColor,
                }}
                title={`${r.partyName}: ${r.seatsWon} seats`}
              />
            ) : null,
          )}
        </div>
        {mark != null && (
          <div
            aria-hidden
            className="absolute -top-1.5 bottom-[-6px] w-0 border-l-2 border-dashed border-ink"
            style={{ left: `${(mark / denominator) * 100}%` }}
            title={`Majority: ${mark} seats`}
          />
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.8rem] text-ink-muted">
        {results.slice(0, 6).map((r) => (
          <span key={r.partyId} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-[2px] border border-black/10"
              style={{ backgroundColor: r.partyColor }}
            />
            {r.partyAbbreviation ?? r.partyName}{" "}
            <strong className="tabular-nums text-ink">{r.seatsWon}</strong>
          </span>
        ))}
        {mark != null && (
          <span className="text-ink-faint">
            ┊ majority <strong className="tabular-nums">{mark}</strong>
            {totalSeats ? ` of ${totalSeats}` : ""}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
