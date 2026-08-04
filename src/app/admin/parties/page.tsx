import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";

import { autoColorPartiesAction, updatePartyAction } from "@/actions/admin";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { parties } from "@/lib/db/schema";
import { PLACEHOLDER_GRAY } from "@/lib/party-colors";

export const metadata: Metadata = { title: "Party administration" };

export default async function AdminPartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireRole("admin");
  const { done, error } = await searchParams;
  const rows = await db.query.parties.findMany({ orderBy: [asc(parties.name)] });
  const grayCount = rows.filter((p) => p.color === PLACEHOLDER_GRAY && !p.isPseudo).length;

  return (
    <div className="mx-auto max-w-4xl px-6 pb-12">
      <header className="border-b border-rule py-9">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/admin/users" className="hover:text-ink">Admin</Link>
          <span className="mx-1.5">/</span>
          <span>Parties</span>
        </nav>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">
          Party administration
        </h1>
        <p className="mt-2 max-w-2xl text-[0.88rem] text-ink-muted">
          Party colors drive the map, seat bars, and legends. Imported parties get an
          auto-assigned distinct color. Set conventional colors here and the change propagates
          across the whole site within moments.
        </p>
        {done && (
          <p className="mt-3 rounded-sm border border-green-200 bg-green-50 px-3 py-2 text-[0.85rem] text-approved">
            {done === "1" ? "Saved." : `Updated ${done} parties.`} Colors refresh across the site now.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[0.85rem] text-danger">
            Color must be a hex value like #1d4ed8.
          </p>
        )}
        {grayCount > 0 && (
          <form action={autoColorPartiesAction} className="mt-3">
            <button
              type="submit"
              className="rounded-sm bg-ink px-4 py-2 text-[0.85rem] font-medium text-paper hover:opacity-85"
            >
              Auto-assign distinct colors to {grayCount} gray part{grayCount === 1 ? "y" : "ies"}
            </button>
          </form>
        )}
      </header>

      <table className="mt-6 w-full text-left text-[0.88rem]">
        <thead>
          <tr className="border-b border-rule-dark text-[0.72rem] uppercase tracking-wider text-ink-faint">
            <th className="py-2 pr-4 font-medium">Party</th>
            <th className="py-2 pr-4 font-medium">Abbreviation</th>
            <th className="py-2 font-medium">Color</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-rule align-middle">
              <td className="py-2.5 pr-4">
                <Link href={`/party/${p.id}`} className="text-accent underline-offset-2 hover:underline">
                  {p.name}
                </Link>
                {p.isPseudo && (
                  <span className="ml-2 text-[0.72rem] uppercase tracking-wide text-ink-faint">
                    ECI category
                  </span>
                )}
              </td>
              <td className="py-2.5 pr-4" colSpan={2}>
                <form action={updatePartyAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="partyId" value={p.id} />
                  <input
                    name="abbreviation"
                    defaultValue={p.abbreviation ?? ""}
                    placeholder="e.g. INC"
                    maxLength={20}
                    className="w-24 rounded-sm border border-rule-dark bg-paper-raised px-2 py-1 text-[0.82rem]"
                  />
                  <input
                    type="color"
                    name="color"
                    defaultValue={p.color}
                    className="h-8 w-12 cursor-pointer rounded-sm border border-rule-dark bg-paper-raised p-0.5"
                    aria-label={`Color for ${p.name}`}
                  />
                  <code className="text-[0.75rem] text-ink-faint">{p.color}</code>
                  <button
                    type="submit"
                    className="rounded-sm border border-rule-dark px-2.5 py-1 text-[0.8rem] text-ink-muted hover:border-ink hover:text-ink"
                  >
                    Save
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
