import type { Metadata } from "next";
import Link from "next/link";

import { ImportPanel } from "@/components/admin/ImportPanel";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Import reference data" };

export default async function AdminImportPage() {
  await requireRole("admin");
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
    </div>
  );
}
