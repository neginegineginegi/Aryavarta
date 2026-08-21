import Link from "next/link";
import { Fragment } from "react";

import type { IndicatorSeries } from "@/lib/db/queries/development";
import type { Provenance } from "@/lib/db/queries/provenance";
import { ProvenanceNote } from "@/components/ui/Citations";
import { TrendChart } from "@/components/ui/TrendChart";
import { seriesBreaksFor } from "@/lib/ingest/provenance";
import { formatDate, formatNumber, sourcesDiffer } from "@/lib/format";

/**
 * The Development Lens: sourced factual indicators for a state, grouped by
 * category. Presentation is strictly neutral. No scores, no rankings, no
 * verdicts; every value names its source and reporting period, and readers
 * draw their own conclusions.
 *
 * Layout is ONE ruled table for all categories, statistical-annex style: a
 * heavier outer frame, hairline inner grid, category bands as spanning rows.
 * A single table means a single column grid, so Latest/Trend/Source align
 * from the first category to the last.
 */
export function DevelopmentSection({
  grouped,
  provenance,
}: {
  grouped: Array<[string, IndicatorSeries[]]>;
  /** One statement for the whole table. `mixed` means these rows did not all
   *  arrive the same way, which the section says rather than averaging. */
  provenance?: Provenance | { mixed: true; paths: string[] };
}) {
  if (grouped.length === 0) return null;

  // Column gutters come from .rec-table in globals.css; padding utilities on
  // these cells are outranked by the table's own rule and do nothing.
  const cell = "align-top";

  return (
    <section className="section-card px-6 py-9 sm:px-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[30px] font-light leading-tight text-ink">
          Development lens
        </h2>
        <span className="font-mono text-[9px] tracking-[0.06em] text-ink-meta">
          Presented as published · never scored
        </span>
      </div>
      <p className="mt-2 max-w-2xl text-[0.82rem] text-ink-faint">
        Factual indicators from named statistical sources, shown as published. Abhilekh does
        not score, rank, or grade governments; the numbers and their sources speak for
        themselves.
      </p>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-fit">
          <table className="rec-table text-[0.85rem]">
            <thead>
              <tr>
                <th className={`${cell} py-2`}>Indicator</th>
                <th className={`${cell} py-2`}>Latest</th>
                <th className={`${cell} hidden py-2 md:table-cell`}>Trend</th>
                <th className={`${cell} py-2`}>Source</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([category, series]) => (
                <Fragment key={category}>
                  <tr>
                    <th colSpan={4} scope="colgroup" className="rec-band">
                      {category}
                    </th>
                  </tr>
                  {series.map((s) => {
                    const latest = s.values[s.values.length - 1];
                    return (
                      <tr key={s.id}>
                        <td className={`${cell} py-2.5`}>
                          <Link
                            href={`/indicator/${s.id}`}
                            title={s.methodology}
                            className="text-ink underline-offset-2 hover:text-accent hover:underline"
                          >
                            {s.name}
                          </Link>
                          <span className="block text-[0.72rem] text-ink-faint">{s.unit}</span>
                        </td>
                        {/* The value never breaks; the reporting period may.
                            A source that names a full release ("December 2025
                            (V1) release") would otherwise push the cell into
                            the trend column. */}
                        <td className={`${cell} py-2.5`}>
                          <span className="whitespace-nowrap tabular-nums font-medium text-ink">
                            {formatNumber(latest.value)}
                          </span>{" "}
                          <span className="tabular-nums text-[0.75rem] text-ink-faint">
                            ({latest.reportingPeriod ?? latest.year})
                          </span>
                        </td>
                        <td className={`${cell} hidden py-2.5 md:table-cell`}>
                          {s.values.length >= 2 ? (
                            <TrendChart
                              points={s.values.map((v) => ({
                                year: v.year,
                                value: Number(v.value),
                                // Falling back to the source title named a
                                // single-source series on every point, which
                                // the Source column already carries.
                                note:
                                  v.reportingPeriod ??
                                  (sourcesDiffer(s.values) ? v.sourceTitle : undefined),
                              }))}
                              width={180}
                              breaks={seriesBreaksFor(s.id)}
                              height={44}
                              unit={s.unit}
                              href={`/indicator/${s.id}`}
                              ariaLabel={`${s.name}, ${s.values[0].year} to ${latest.year}`}
                            />
                          ) : (
                            // Not missing data: a point-in-time measure. Say so,
                            // rather than leaving a dash the reader has to guess at.
                            <span className="font-mono text-[9px] tracking-[0.06em] text-ink-meta">
                              Snapshot
                            </span>
                          )}
                        </td>
                        <td className={`${cell} py-2.5 text-[0.78rem]`}>
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
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* How every value above got here, said once for the table. Each row
          already names its own source; this answers the different question of
          whether a person checked it. */}
      {provenance &&
        ("mixed" in provenance ? (
          <p className="mt-3 text-[0.82rem] leading-relaxed text-ink-muted">
            These rows did not all enter the archive the same way: {provenance.paths.join(", ")}.
            Each indicator&apos;s own page states which path its values took.
          </p>
        ) : (
          <ProvenanceNote provenance={provenance} />
        ))}
    </section>
  );
}
