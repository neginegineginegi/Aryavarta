import type { Metadata } from "next";
import Link from "next/link";

import { refreshCachedPagesAction } from "@/actions/admin";
import { ImportPanel } from "@/components/admin/ImportPanel";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Import reference data" };

export default async function AdminImportPage({
  searchParams,
}: {
  searchParams: Promise<{ refreshed?: string }>;
}) {
  await requireRole("admin");
  const { refreshed } = await searchParams;
  const stateRows = await db.query.states.findMany({
    columns: { id: true, name: true },
    orderBy: (s, { asc }) => [asc(s.name)],
  });

  return (
    <div className="mx-auto max-w-4xl px-6 pb-12">
      <header className="border-b border-rule py-9">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/admin/users" className="hover:text-ink">Admin</Link>
          <span className="mx-1.5">/</span>
          <span>Import</span>
        </nav>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">
          Import reference data
        </h1>
        <p className="mt-2 max-w-2xl text-[0.85rem] text-ink-muted">
          Pre-fills structured drafts from Wikidata (CC0). Imported data is{" "}
          <strong>never published directly</strong>: each item becomes a pending revision from
          the Import Bot, carrying its origin, and must be verified by a moderator against an
          authoritative source (ideally the ECI statistical report), exactly like any
          community contribution.
        </p>
      </header>
      <div className="py-7">
        <ImportPanel states={stateRows} />
      </div>
      <section className="border-t border-rule py-7">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
          After a bulk insert
        </h2>
        <p className="mt-2 max-w-2xl text-[0.85rem] text-ink-muted">
          The landing map, every state page and the Union page read through a tag cache that an
          approval refreshes and a terminal-run insert does not; a redeploy does not clear it
          either. After an insert, press this once. It writes nothing: it marks those cached reads
          stale, and the next request to each page waits for fresh data, so one load shows the change.
        </p>
        <form action={refreshCachedPagesAction} className="mt-3">
          <button
            type="submit"
            className="rounded-sm bg-ink px-4 py-2 text-[0.85rem] font-medium text-paper hover:opacity-85"
          >
            Refresh cached pages
          </button>
        </form>
        {refreshed ? (
          <p className="mt-3 text-[0.8rem] text-ink-faint" role="status">
            Marked stale: the map data and {refreshed} state page{refreshed === "1" ? "" : "s"}.
            Each regenerates on its next request.
          </p>
        ) : null}
      </section>
    </div>
  );
}
