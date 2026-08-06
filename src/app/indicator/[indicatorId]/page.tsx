import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getIndicatorAcrossStates } from "@/lib/db/queries/development";
import { TrendChart } from "@/components/ui/TrendChart";
import { formatDate, formatNumber } from "@/lib/format";

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

  return (
    <div className="mx-auto max-w-5xl px-6 pb-12">
      <header className="border-b border-rule py-9">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/browse" className="hover:text-ink">
            Browse
          </Link>
          <span className="mx-1.5">/</span>
          <span>Indicators</span>
        </nav>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink">
          {indicator.name}
        </h1>
        <p className="mt-2 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-ink-muted">
          {indicator.category} · {indicator.unit}
        </p>
        <p className="mt-3 max-w-2xl text-[0.9rem] text-ink-muted">{indicator.methodology}</p>
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
                      points={s.values.map((v) => ({ year: v.year, value: Number(v.value) }))}
                      width={340}
                      height={80}
                      ariaLabel={`${indicator.name} in ${s.stateName}, ${s.values[0].year} to ${latest.year}`}
                    />
                  ) : (
                    <p className="text-[0.8rem] text-ink-faint">Single data point so far.</p>
                  )}
                </div>
                <table className="mt-3 w-full text-left text-[0.8rem]">
                  <tbody>
                    {s.values
                      .slice()
                      .reverse()
                      .slice(0, 6)
                      .map((v) => (
                        <tr key={v.year} className="border-b border-rule align-baseline">
                          <td className="py-1 pr-3 font-mono text-[0.7rem] text-ink-muted">
                            {v.year}
                          </td>
                          <td className="py-1 pr-3 tabular-nums text-ink">{formatNumber(v.value)}</td>
                          <td className="py-1 text-right text-[0.72rem]">
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
