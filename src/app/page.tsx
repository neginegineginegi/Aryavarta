import Link from "next/link";

import { MapExplorer } from "@/components/map/MapExplorer";
import { getMapData } from "@/lib/db/queries/map";
import { getArchiveStats } from "@/lib/db/queries/stats";
import { formatNumber } from "@/lib/format";

export default async function HomePage() {
  const [data, stats] = await Promise.all([getMapData(), getArchiveStats()]);

  return (
    <div className="mx-auto max-w-6xl px-5">
      <section className="border-b border-rule py-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Who governed every Indian state, every year — with sources.
        </h1>
        <p className="mt-3 max-w-2xl text-ink-muted">
          Abhilekh is a public, crowdsourced reference of state politics in India: chief
          ministers, elections, and notable governance events, year by year. Every published
          fact carries a citation, passes moderator review, and keeps its full edit history.
        </p>
      </section>

      <section className="py-8">
        <MapExplorer data={data} />
      </section>

      <section className="grid gap-6 border-t border-rule py-8 sm:grid-cols-3">
        <div>
          <h2 className="section-label">Sourced</h2>
          <p className="mt-2 text-[0.9rem] text-ink-muted">
            Nothing is published without at least one citation — title, link, and date. Claims
            without sources are rejected at submission, not after.
          </p>
        </div>
        <div>
          <h2 className="section-label">Reviewed</h2>
          <p className="mt-2 text-[0.9rem] text-ink-muted">
            Anyone can propose an addition or correction. Moderators compare the proposed
            change against the live record, side by side, before it goes public.
          </p>
        </div>
        <div>
          <h2 className="section-label">Versioned</h2>
          <p className="mt-2 text-[0.9rem] text-ink-muted">
            Every change is recorded — who proposed it, when, what changed, and who approved
            it. The full history of every entry is public, like an encyclopedia&rsquo;s.
          </p>
        </div>
      </section>

      <section className="flex flex-wrap items-baseline gap-x-10 gap-y-3 border-t border-rule py-6 text-[0.85rem] text-ink-muted">
        <span>
          <strong className="font-display text-xl text-ink">{formatNumber(stats.states)}</strong>{" "}
          states &amp; union territories
        </span>
        <span>
          <strong className="font-display text-xl text-ink">{formatNumber(stats.terms)}</strong>{" "}
          government terms
        </span>
        <span>
          <strong className="font-display text-xl text-ink">{formatNumber(stats.events)}</strong>{" "}
          recorded events
        </span>
        <span>
          <strong className="font-display text-xl text-ink">{formatNumber(stats.sources)}</strong>{" "}
          sources cited
        </span>
        <Link href="/methodology" className="text-accent underline-offset-2 hover:underline">
          How entries are verified →
        </Link>
      </section>
    </div>
  );
}
