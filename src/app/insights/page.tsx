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
    <div className="mx-auto max-w-6xl px-6 pb-12">
      <header className="border-b border-rule py-10">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
          Insights
        </h1>
        <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-ink-muted">
          Nothing on this page is written by hand. Every insight is computed from the
          archive, names its method, links to the entries behind it, and refreshes as
          moderators approve new data ({termCount} terms, {electionCount} elections today).
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="py-12 text-center text-[0.95rem] text-ink-muted">
          Not enough approved data to compute insights yet. They appear on their own as the
          archive grows.{" "}
          <Link href="/contribute" className="text-accent underline-offset-2 hover:underline">
            Contribute →
          </Link>
        </p>
      ) : (
        <div className="grid gap-5 py-8 md:grid-cols-2">
          {groups.map((g) => (
            <section key={g.key} id={g.key} className="card p-6">
              <h2 className="font-display text-[1.35rem] font-semibold text-ink">{g.title}</h2>
              <ul className="mt-3.5 space-y-3">
                {g.items.map((item, i) => (
                  <li key={i} className="text-[0.92rem]">
                    <p className="font-medium text-ink">{item.headline}</p>
                    {item.detail && <p className="text-[0.84rem] text-ink-muted">{item.detail}</p>}
                    {item.links.length > 0 && (
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-[0.82rem]">
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
              <p className="mt-5 border-t border-rule pt-3 text-[0.74rem] leading-relaxed text-ink-faint">
                How this is computed: {g.method}
              </p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
