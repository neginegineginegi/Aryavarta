import type { TermWithSources } from "@/lib/db/queries/state";
import { yearOf } from "@/lib/format";

const PR_COLOR = "var(--color-pr)";

/**
 * A compact horizontal band showing party control across time: one colored
 * segment per term, width proportional to duration. Server-rendered.
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
  const span = Math.max(1, maxYear + 1 - startYear);

  return (
    <figure aria-hidden className="mt-4">
      <div className="flex h-3 w-full overflow-hidden rounded-sm border border-rule-dark bg-paper-sunken">
        {chrono.map((t) => {
          const from = yearOf(t.startDate);
          const to = t.endDate ? yearOf(t.endDate) + (t.endDate.slice(5, 7) > "06" ? 1 : 0) : maxYear + 1;
          const width = (Math.max(0.4, to - from) / span) * 100;
          return (
            <div
              key={t.id}
              style={{
                width: `${width}%`,
                backgroundColor:
                  t.kind === "presidents_rule" ? PR_COLOR : (t.partyColor ?? PR_COLOR),
              }}
              title={
                t.kind === "presidents_rule"
                  ? `President's Rule, ${from}–${t.endDate ? yearOf(t.endDate) : "present"}`
                  : `${t.cmName} (${t.partyName}), ${from}–${t.endDate ? yearOf(t.endDate) : "present"}`
              }
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
