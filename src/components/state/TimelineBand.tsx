import type { TermWithSources } from "@/lib/db/queries/state";
import { yearOf } from "@/lib/format";

const PR_COLOR = "var(--color-pr)";

/** Fractional year for proportional placement, e.g. 2014-07-01 ≈ 2014.5. */
function fractionalYear(isoDate: string): number {
  const y = yearOf(isoDate);
  const m = Number(isoDate.slice(5, 7)) || 1;
  const d = Number(isoDate.slice(8, 10)) || 1;
  return y + (m - 1) / 12 + (d - 1) / 365;
}

/**
 * A compact horizontal band showing party control across time. Segments are
 * absolutely positioned by real dates, so gaps (no recorded government)
 * show as background and overlapping terms are not silently rescaled.
 * Server-rendered.
 */
export function TimelineBand({
  terms,
  maxYear,
}: {
  terms: TermWithSources[]; // any order; rendered chronologically
  maxYear: number;
}) {
  if (terms.length === 0) return null;
  const chrono = terms.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
  const startYear = yearOf(chrono[0].startDate);
  const endBound = maxYear + 1;
  const span = Math.max(1, endBound - startYear);

  return (
    <figure aria-hidden className="mt-4">
      <div className="relative h-3 w-full overflow-hidden rounded-sm border border-rule-dark bg-paper-sunken">
        {chrono.map((t) => {
          const from = Math.max(startYear, fractionalYear(t.startDate));
          const to = t.endDate ? Math.min(endBound, fractionalYear(t.endDate)) : endBound;
          if (to <= from) return null;
          const left = ((from - startYear) / span) * 100;
          const width = Math.max(0.3, ((to - from) / span) * 100);
          const label =
            t.kind === "presidents_rule"
              ? `President's Rule, ${yearOf(t.startDate)}–${t.endDate ? yearOf(t.endDate) : "present"}`
              : `${t.cmName} (${t.partyName}), ${yearOf(t.startDate)}–${t.endDate ? yearOf(t.endDate) : "present"}`;
          return (
            <div
              key={t.id}
              className="absolute inset-y-0"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor:
                  t.kind === "presidents_rule" ? PR_COLOR : (t.partyColor ?? PR_COLOR),
              }}
              title={label}
            />
          );
        })}
      </div>
      <figcaption className="mt-1 flex justify-between text-[0.72rem] tabular-nums text-ink-faint">
        <span>{startYear}</span>
        <span>{maxYear}</span>
      </figcaption>
    </figure>
  );
}
