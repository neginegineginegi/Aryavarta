import Link from "next/link";

import { MapExplorer } from "@/components/map/MapExplorer";
import { getMapData } from "@/lib/db/queries/map";
import { getArchiveStats } from "@/lib/db/queries/stats";
import { formatNumber } from "@/lib/format";

export default async function HomePage() {
  // Note: the ?y= year param is read client-side inside MapExplorer so this
  // page stays fully static/cached.
  const [data, stats] = await Promise.all([getMapData(), getArchiveStats()]);

  const statItems = [
    { value: stats.states, label: "states & union territories" },
    { value: stats.terms, label: "government terms" },
    { value: stats.events, label: "recorded events" },
    { value: stats.sources, label: "sources cited" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6">
      <section className="py-12">
        <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-[3.25rem]">
          Who governed every Indian state, every year, with sources to prove it.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-muted">
          Abhilekh is a living atlas of Indian political history. Scrub the timeline and
          watch governments change across the map. Open any state for its chief ministers,
          elections, and turning points. Follow any fact back to its citation.
        </p>
      </section>

      <section className="card p-5 sm:p-8">
        <MapExplorer data={data} />
      </section>

      <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statItems.map((s) => (
          <div key={s.label} className="card px-5 py-4">
            <p className="font-mono text-2xl font-bold text-ink">{formatNumber(s.value)}</p>
            <p className="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted">
              {s.label}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-10 py-14 sm:grid-cols-3">
        <div>
          <h2 className="section-label">Sourced</h2>
          <p className="mt-2.5 text-[0.95rem] leading-relaxed text-ink-muted">
            Nothing gets published without a citation: a title, a link, and a date. Claims
            that arrive without sources are turned away at the door.
          </p>
        </div>
        <div>
          <h2 className="section-label">Reviewed</h2>
          <p className="mt-2.5 text-[0.95rem] leading-relaxed text-ink-muted">
            Anyone can propose an addition or a correction. A moderator compares the
            proposal against the live record, side by side, before it goes public.
          </p>
        </div>
        <div>
          <h2 className="section-label">Versioned</h2>
          <p className="mt-2.5 text-[0.95rem] leading-relaxed text-ink-muted">
            Every change stays on the record: who proposed it, what changed, who approved
            it, and when. The full history of every entry is open to all.
          </p>
        </div>
      </section>

      <section className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg bg-paper-sunken px-6 py-5">
        <p className="text-[0.95rem] text-ink">
          Spotted a gap in your state&rsquo;s record? Help close it.
        </p>
        <span className="flex items-center gap-5 text-[0.9rem]">
          <Link
            href="/contribute"
            className="rounded-sm bg-accent px-4 py-1.5 font-medium text-white transition-colors hover:bg-accent-dark"
          >
            Contribute
          </Link>
          <Link href="/methodology" className="text-accent underline-offset-2 hover:underline">
            How entries are verified →
          </Link>
        </span>
      </section>
    </div>
  );
}
