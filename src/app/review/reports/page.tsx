import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";

import { resolveReportAction } from "@/actions/reports";
import { Badge } from "@/components/ui/Badge";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { reports } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Reports & disputes" };

export default async function ReportsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireRole("moderator");
  const { done, error } = await searchParams;

  const open = await db.query.reports.findMany({
    where: eq(reports.status, "open"),
    orderBy: [desc(reports.createdAt)],
    limit: 100,
    with: { opener: { columns: { id: true, name: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl px-5 pb-10">
      <header className="border-b border-rule py-7">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/review" className="hover:text-ink">Review queue</Link>
          <span className="mx-1.5">/</span>
          <span>Reports</span>
        </nav>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">
          Reports &amp; disputes
        </h1>
        <p className="mt-2 text-[0.88rem] text-ink-muted">
          {open.length} open report{open.length === 1 ? "" : "s"}. Resolutions are permanent
          public records.
        </p>
        {done && (
          <p className="mt-3 rounded-sm border border-green-200 bg-green-50 px-3 py-2 text-[0.85rem] text-approved">
            Report resolved.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[0.85rem] text-danger">
            {error === "note_required" ? "A resolution note is required." : "Invalid decision."}
          </p>
        )}
      </header>

      {open.length === 0 ? (
        <p className="py-10 text-center text-[0.9rem] text-ink-muted">No open reports.</p>
      ) : (
        <ul className="divide-y divide-rule">
          {open.map((r) => (
            <li key={r.id} className="py-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Badge variant={r.kind === "dispute" ? "disputed" : "neutral"}>{r.kind}</Badge>
                <span className="text-[0.85rem] text-ink">
                  {r.entityType === "event" ? (
                    <Link href={`/event/${r.entityId}`} className="text-accent hover:underline">
                      event {r.entityId.slice(0, 8)}…
                    </Link>
                  ) : (
                    <>
                      {r.entityType} {r.entityId.slice(0, 8)}…
                    </>
                  )}
                </span>
                <span className="text-[0.78rem] text-ink-faint">
                  by{" "}
                  {r.opener ? (
                    <Link href={`/user/${r.opener.id}`} className="text-accent hover:underline">
                      {r.opener.name ?? "unnamed"}
                    </Link>
                  ) : (
                    <>anonymous{r.reporterContact ? ` (${r.reporterContact})` : ""}</>
                  )}{" "}
                  · {r.createdAt.toISOString().slice(0, 10)}
                </span>
              </div>
              <p className="mt-2 max-w-2xl whitespace-pre-wrap text-[0.88rem] text-ink-muted">
                {r.reason}
              </p>
              <form
                action={resolveReportAction}
                className="mt-3 flex flex-wrap items-end gap-2 text-[0.85rem]"
              >
                <input type="hidden" name="reportId" value={r.id} />
                <input
                  name="resolutionNote"
                  required
                  minLength={3}
                  maxLength={1000}
                  placeholder="Resolution note (public)"
                  className="w-72 rounded-sm border border-rule-dark bg-paper-raised px-3 py-1.5 outline-none focus:border-accent"
                />
                {r.entityType === "event" && r.kind === "dispute" && (
                  <select
                    name="eventStatus"
                    className="rounded-sm border border-rule-dark bg-paper-raised px-2 py-1.5"
                    defaultValue=""
                  >
                    <option value="">Entry status: unchanged</option>
                    <option value="disputed">Mark entry as disputed</option>
                    <option value="published">Clear disputed flag</option>
                  </select>
                )}
                <button
                  type="submit"
                  name="decision"
                  value="resolved"
                  className="rounded-sm bg-approved px-3 py-1.5 font-medium text-white hover:opacity-85"
                >
                  Resolve
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="dismissed"
                  className="rounded-sm border border-rule-dark px-3 py-1.5 text-ink-muted hover:border-ink"
                >
                  Dismiss
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
