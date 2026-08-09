import Link from "next/link";

import { getInsights } from "@/lib/db/queries/insights";

/**
 * Discovery on the record page: a line or two the insights engine computed
 * that happens to concern this state, each linking into the records behind
 * it. The connection chain is links, not new pages.
 *
 * Rotation is by day, not by request: the pick is a deterministic offset from
 * the day of the year, so a statically cached page shows one stable set and
 * tomorrow shows the next. Nothing here is written by hand; every line is an
 * output of computeInsights over approved records, and the strip names the
 * computation and links to /insights, where its method is stated in full.
 */
export async function DiscoveryStrip({ stateId }: { stateId: string }) {
  const { groups } = await getInsights();
  const mine = groups.flatMap((g) =>
    g.items
      .filter((it) => it.stateId === stateId)
      .map((it) => ({ group: g.title, ...it })),
  );
  if (mine.length === 0) return null;

  // Impure on purpose: the daily rotation IS the feature, and this is a
  // server component cached by the page's revalidate window, so the value is
  // stable per render and advances by day, exactly as intended.
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000,
  );
  const picked = [0, 1]
    .map((k) => mine[(dayOfYear + k) % mine.length])
    // A short list can wrap onto itself; never show the same line twice.
    .filter((it, i, arr) => arr.findIndex((o) => o.headline === it.headline) === i);

  return (
    <aside
      aria-label="From the archive's computed insights"
      className="mt-4 rounded-sm border border-rule bg-paper-sunken/60 px-4 py-3"
    >
      <p className="font-mono text-[9px] tracking-[0.06em] text-ink-meta">
        Did you know · computed from the record
      </p>
      <ul className="mt-1.5 space-y-1">
        {picked.map((it) => (
          <li key={`${it.group}-${it.headline}`} className="text-[0.85rem] leading-relaxed">
            <span className="text-ink">{it.headline}</span>
            {it.detail ? <span className="text-ink-muted"> · {it.detail}</span> : null}
            <span className="text-ink-faint"> ({it.group.toLowerCase()})</span>
            {it.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="ml-2 text-[0.78rem] text-accent underline-offset-2 hover:underline"
              >
                {l.label}
              </Link>
            ))}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[0.7rem] text-ink-faint">
        Computed from approved records, never written by hand.{" "}
        <Link href="/insights" className="text-verify underline-offset-2 hover:underline">
          How each figure is derived
        </Link>
      </p>
    </aside>
  );
}
