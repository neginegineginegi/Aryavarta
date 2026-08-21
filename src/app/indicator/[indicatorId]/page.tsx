import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getIndicatorAcrossStates } from "@/lib/db/queries/development";
import { citationsForRecord, provenanceOf } from "@/lib/db/queries/provenance";

import { ProvenanceNote, ReferenceList } from "@/components/ui/Citations";
import { TrendChart } from "@/components/ui/TrendChart";
import { seriesBreaksFor } from "@/lib/ingest/provenance";
import { formatDate, formatNumber, sourcesDiffer } from "@/lib/format";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ indicatorId: string }>;
}): Promise<Metadata> {
  const { indicatorId } = await params;
  const data = await getIndicatorAcrossStates(indicatorId);
  if (!data) return {};
  return {
    title: data.indicator.name,
    description: `${data.indicator.name} (${data.indicator.unit}) across Indian states, year by year, with sources and methodology.`,
  };
}

export default async function IndicatorPage({
  params,
}: {
  params: Promise<{ indicatorId: string }>;
}) {
  const { indicatorId } = await params;
  const data = await getIndicatorAcrossStates(indicatorId);
  if (!data) notFound();
  const { indicator, series } = data;
  const [definitionSources, definitionProvenance] = await Promise.all([
    citationsForRecord("indicator", indicator.id),
    provenanceOf("indicator", indicator.id),
  ]);

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/browse" className="hover:text-ink">
            Browse
          </Link>
          <span className="mx-1.5">/</span>
          <Link href="/browse#indicators" className="hover:text-ink">
            Indicators
          </Link>
        </nav>
        <h1 className="font-display text-[clamp(34px,4.5vw,48px)] font-light leading-[1.05] text-ink">
          {indicator.name}
        </h1>
        <p className="mt-2 font-mono text-[0.72rem] tracking-[0.1em] text-ink-muted">
          {indicator.category} · {indicator.unit}
        </p>
        <p className="mt-3 max-w-2xl text-[0.9rem] text-ink-muted">{indicator.methodology}</p>
        {/* The definition is a sourced claim in its own right. What a series
            counts can change between publishers' report years, and a
            methodology paragraph nobody can check is the same unsupported
            assertion the archive refuses everywhere else. */}
        <div className="max-w-2xl">
          <ReferenceList sources={definitionSources} />
          <ProvenanceNote provenance={definitionProvenance} />
        </div>
        <p className="mt-2 max-w-2xl text-[0.78rem] text-ink-faint">
          Values are shown as published by their named sources. Abhilekh does not score, rank,
          or grade governments.
        </p>
      </header>

      {series.length === 0 ? (
        <p className="py-10 text-center text-[0.9rem] text-ink-muted">
          No values recorded yet for this indicator.
        </p>
      ) : (
        <div className="grid gap-5 py-8 md:grid-cols-2">
          {series.map((s) => {
            const latest = s.values[s.values.length - 1];
            return (
              <section key={s.stateId} className="card p-5">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-display text-xl font-semibold text-ink">
                    {s.isUnion ? (
                      <Link href="/union" className="underline-offset-2 hover:text-accent hover:underline">
                        India (national)
                      </Link>
                    ) : (
                      <Link
                        href={`/state/${s.stateId}`}
                        className="underline-offset-2 hover:text-accent hover:underline"
                      >
                        {s.stateName}
                      </Link>
                    )}
                  </h2>
                  <p className="whitespace-nowrap">
                    <span className="font-mono text-lg font-bold text-ink">
                      {formatNumber(latest.value)}
                    </span>{" "}
                    <span className="font-mono text-[0.65rem] text-ink-faint">
                      ({latest.reportingPeriod ?? latest.year})
                    </span>
                  </p>
                </div>
                <div className="mt-3">
                  {s.values.length >= 2 ? (
                    <TrendChart
                      // Name the source per point only where a series draws on
                      // more than one; otherwise the caption repeats what the
                      // card states once. The reporting period always stays,
                      // because a fiscal or survey label ("2023-24") says
                      // something the year on the axis does not.
                      points={s.values.map((v) => ({
                        year: v.year,
                        value: Number(v.value),
                        note: sourcesDiffer(s.values)
                          ? `${v.sourceTitle}${v.reportingPeriod ? ` · ${v.reportingPeriod}` : ""}`
                          : (v.reportingPeriod ?? undefined),
                      }))}
                      width={340}
                      height={80}
                      breaks={seriesBreaksFor(indicator.id)}
                      unit={indicator.unit}
                      ariaLabel={`${indicator.name} in ${s.stateName}, ${s.values[0].year} to ${latest.year}`}
                      exportSource={{
                        title: `${indicator.name} (${indicator.unit}) · ${s.stateName}`,
                        // Distinct source titles joined, so a series drawn from
                        // two publishers credits both inside the image.
                        source: `Source: ${[...new Set(s.values.map((v) => v.sourceTitle))].join("; ")} · via abhilekh`,
                        filename: `${indicator.id}-${s.stateId}`,
                      }}
                    />
                  ) : (
                    <p className="text-[0.8rem] text-ink-faint">Single data point so far.</p>
                  )}
                </div>
                <div className="mt-3 overflow-x-auto">
                  <div className="min-w-fit">
                    <table className="rec-table text-[0.8rem]">
                      <thead>
                        <tr>
                          <th className="px-2.5 py-1.5">Year</th>
                          <th className="px-2.5 py-1.5">Value</th>
                          <th className="px-2.5 py-1.5">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.values
                          .slice()
                          .reverse()
                          .slice(0, 6)
                          .map((v) => (
                            <tr key={v.year}>
                              <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-[0.7rem] text-ink-muted">
                                {v.year}
                              </td>
                              <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-ink">
                                {formatNumber(v.value)}
                              </td>
                              <td className="px-2.5 py-1.5 text-[0.72rem]">
                                <a
                                  href={v.sourceUrl}
                                  target="_blank"
                                  rel="nofollow noopener noreferrer"
                                  className="text-accent underline-offset-2 hover:underline"
                                >
                                  {v.sourceTitle}
                                </a>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {(latest.reportingOrg || latest.notes) && (
                  <p className="mt-2 text-[0.72rem] text-ink-faint">
                    {latest.reportingOrg ? `Reported by ${latest.reportingOrg}. ` : ""}
                    {latest.notes ?? ""}
                  </p>
                )}
                <p className="mt-1 text-[0.68rem] text-ink-faint">
                  Last verified {formatDate(latest.verifiedOn)}
                </p>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
