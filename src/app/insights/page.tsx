import type { Metadata } from "next";
import Link from "next/link";

import { getInsights } from "@/lib/db/queries/insights";

export const metadata: Metadata = {
  title: "Insights",
  description:
    "Records and patterns computed automatically from the archive: longest tenures, closest elections, President's Rule tallies, and more — every number traceable to sourced entries.",
};

export const revalidate = 300;

export default async function InsightsPage() {
  const { groups, termCount, electionCount } = await getInsights();

  return (
    <div className="mx-auto max-w-5xl px-5 pb-10">
      <header className="border-b border-rule py-7">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Insights
        </h1>
        <p className="mt-2 max-w-2xl text-[0.9rem] text-ink-muted">
          Records and patterns computed automatically from the archive — nothing here is
          written by hand. Every insight names its method, links to its underlying entries, and
          recomputes as moderators approve new data ({termCount} terms, {electionCount}{" "}
          elections today).
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="py-10 text-center text-[0.9rem] text-ink-muted">
          Not enough approved data yet to compute insights — they appear automatically as the
          archive grows.{" "}
          <Link href="/contribute" className="text-accent underline-offset-2 hover:underline">
            Contribute →
          </Link>
        </p>
      ) : (
        <div className="grid gap-5 py-7 md:grid-cols-2">
          {groups.map((g) => (
            <section
              key={g.key}
              id={g.key}
              className="rounded-sm border border-rule bg-paper-raised p-5"
            >
              <h2 className="font-display text-xl font-semibold text-ink">{g.title}</h2>
              <ul className="mt-3 space-y-2.5">
                {g.items.map((item, i) => (
                  <li key={i} className="text-[0.9rem]">
                    <p className="font-medium text-ink">{item.headline}</p>
                    {item.detail && <p className="text-[0.82rem] text-ink-muted">{item.detail}</p>}
                    {item.links.length > 0 && (
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-[0.8rem]">
                        {item.links.map((l) => (
                          <Link
                            key={l.href + l.label}
                            href={l.href}
                            className="text-accent underline-offset-2 hover:underline"
                          >
                            {l.label} →
                          </Link>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-rule pt-2.5 text-[0.72rem] leading-relaxed text-ink-faint">
                How this is computed: {g.method}
              </p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
