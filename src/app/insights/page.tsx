import type { Metadata } from "next";
import Link from "next/link";

import { getInsights } from "@/lib/db/queries/insights";

export const metadata: Metadata = {
  title: "Insights",
  description:
    "Records and patterns computed automatically from the archive: longest tenures, closest elections, President's Rule tallies, and more. Every number traces back to sourced entries.",
};

export const revalidate = 300;

export default async function InsightsPage() {
  const { groups, termCount, electionCount } = await getInsights();

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <span lang="hi" className="deva-eyebrow">
          आँकड़ों से
        </span>
        <h1 className="mt-1 font-display text-[clamp(34px,4.5vw,48px)] font-light leading-[1.05] text-ink">
          Insights
        </h1>
        <p className="mt-4 font-mono text-[10px] tracking-[0.06em] text-ink-soft">
          Computed from the published record · nothing hand-written · nothing scored
        </p>
        <p className="mt-4 max-w-2xl text-[0.95rem] leading-relaxed text-ink-muted">
          Every insight is computed from the archive, names its method, links to the entries
          behind it, and refreshes as moderators approve new data. Today: {termCount} terms and{" "}
          {electionCount} elections.
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="section-card px-6 py-12 text-center text-[0.95rem] text-ink-muted sm:px-10">
          Not enough approved data to compute insights yet. They appear on their own as the
          archive grows.{" "}
          <Link href="/contribute" className="text-accent underline-offset-2 hover:underline">
            Contribute
          </Link>
        </p>
      ) : (
        // No wrapper div: card spacing site-wide comes from the
        // `.section-card + .section-card` sibling rule, and an intermediate
        // element breaks the chain at the header, gluing it to the first
        // group. Rendered as direct siblings, every junction gets its 16px.
        groups.map((g) => (
          <section key={g.key} id={g.key} className="section-card px-6 py-8 sm:px-10">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-display text-[28px] font-light leading-tight text-ink">
                  {g.title}
                </h2>
                <span className="font-mono text-[9px] tracking-[0.06em] text-ink-meta">
                  {/* A top-N that does not say "of M" reads as the whole
                      field, so the cut is stated where the list is. */}
                  {g.of && g.of > g.items.length
                    ? `top ${g.items.length} of ${g.of} recorded`
                    : `${g.items.length} ${g.items.length === 1 ? "entry" : "entries"}`}
                </span>
              </div>
              <ul className="mt-3.5 space-y-3">
                {g.items.map((item, i) => (
                  <li key={i} className="text-[0.92rem]">
                    <p className="font-medium text-ink">{item.headline}</p>
                    {/* The magnitude, drawn. Scaled to the group's own maximum
                        (or a true denominator like 100%), never across groups:
                        days and percentages do not share an axis. Same track
                        vocabulary as the funding flow view. */}
                    {item.bar && item.bar.max > 0 && (
                      <div className="flow-bar-track mt-1 max-w-md">
                        <div
                          className="flow-bar"
                          style={{ width: `${Math.min(100, (item.bar.value / item.bar.max) * 100)}%` }}
                        />
                      </div>
                    )}
                    {item.detail && <p className="text-[0.84rem] text-ink-muted">{item.detail}</p>}
                    {item.links.length > 0 && (
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-[0.82rem]">
                        {item.links.map((l) => (
                          <Link
                            key={l.href + l.label}
                            href={l.href}
                            className="text-accent underline-offset-2 hover:underline"
                          >
                            {l.label}
                          </Link>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-rule pt-3 text-[0.74rem] leading-relaxed text-ink-faint">
                <span className="font-mono text-[9px] tracking-[0.06em] text-ink-meta">
                  Method
                </span>{" "}
                {g.method}
              </p>
          </section>
        ))
      )}
    </div>
  );
}
