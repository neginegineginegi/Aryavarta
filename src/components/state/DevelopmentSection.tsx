import Link from "next/link";

import type { IndicatorSeries } from "@/lib/db/queries/development";
import { TrendChart } from "@/components/ui/TrendChart";
import { formatDate, formatNumber } from "@/lib/format";

/**
 * The Development Lens: sourced factual indicators for a state, grouped by
 * category. Presentation is strictly neutral. No scores, no rankings, no
 * verdicts; every value names its source and reporting period, and readers
 * draw their own conclusions.
 */
export function DevelopmentSection({ grouped }: { grouped: Array<[string, IndicatorSeries[]]> }) {
  if (grouped.length === 0) return null;

  return (
    <section className="border-b border-rule py-8">
      <h2 className="section-label">Development indicators</h2>
      <p className="mt-2 max-w-2xl text-[0.82rem] text-ink-faint">
        Factual indicators from named statistical sources, shown as published. Abhilekh does
        not score, rank, or grade governments; the numbers and their sources speak for
        themselves.
      </p>

      <div className="mt-4 space-y-6">
        {grouped.map(([category, series]) => (
          <div key={category}>
            <h3 className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-ink-muted">
              {category}
            </h3>
            <table className="mt-2 w-full text-left text-[0.85rem]">
              <thead>
                <tr className="border-b border-rule-dark text-[0.7rem] uppercase tracking-wider text-ink-faint">
                  <th className="py-1.5 pr-4 font-medium">Indicator</th>
                  <th className="py-1.5 pr-4 font-medium">Latest</th>
                  <th className="hidden py-1.5 pr-4 font-medium md:table-cell">Trend</th>
                  <th className="py-1.5 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {series.map((s) => {
                  const latest = s.values[s.values.length - 1];
                  return (
                    <tr key={s.id} className="border-b border-rule align-baseline">
                      <td className="py-2 pr-4">
                        <Link
                          href={`/indicator/${s.id}`}
                          title={s.methodology}
                          className="text-ink underline-offset-2 hover:text-accent hover:underline"
                        >
                          {s.name}
                        </Link>
                        <span className="block text-[0.72rem] text-ink-faint">{s.unit}</span>
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <span className="tabular-nums font-medium text-ink">
                          {formatNumber(latest.value)}
                        </span>{" "}
                        <span className="tabular-nums text-[0.75rem] text-ink-faint">
                          ({latest.reportingPeriod ?? latest.year})
                        </span>
                      </td>
                      <td className="hidden py-2 pr-4 md:table-cell">
                        {s.values.length >= 2 ? (
                          <TrendChart
                            points={s.values.map((v) => ({ year: v.year, value: Number(v.value) }))}
                            width={180}
                            height={44}
                            ariaLabel={`${s.name}, ${s.values[0].year} to ${latest.year}`}
                          />
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td className="py-2 text-[0.78rem]">
                        <a
                          href={latest.sourceUrl}
                          target="_blank"
                          rel="nofollow noopener noreferrer"
                          className="text-accent underline-offset-2 hover:underline"
                        >
                          {latest.sourceTitle}
                        </a>
                        <span className="block text-[0.7rem] text-ink-faint">
                          {latest.reportingOrg ? `${latest.reportingOrg} · ` : ""}verified{" "}
                          {formatDate(latest.verifiedOn)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
