import type { Metadata } from "next";
import Link from "next/link";

import { requireRole } from "@/lib/authz";
import { getPendingQueue } from "@/lib/db/queries/revisions";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Review queue" };

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; done?: string }>;
}) {
  await requireRole("moderator");
  const { state: stateFilter, done } = await searchParams;

  const [queue, states] = await Promise.all([
    getPendingQueue(stateFilter),
    db.query.states.findMany({
      columns: { id: true, name: true },
      orderBy: (s, { asc }) => [asc(s.name)],
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-6 pb-12">
      <header className="border-b border-rule py-9">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          Review queue
        </h1>
        <p className="mt-2 text-[0.88rem] text-ink-muted">
          {queue.length} pending submission{queue.length === 1 ? "" : "s"}
          {stateFilter ? " for this state" : ""}. Verify each claim against its cited sources
          before approving; approval publishes immediately. Also see{" "}
          <Link href="/review/reports" className="text-accent underline-offset-2 hover:underline">
            reports &amp; disputes
          </Link>
          .
        </p>
        {done && (
          <p className="mt-3 rounded-sm border border-green-200 bg-green-50 px-3 py-2 text-[0.85rem] text-approved">
            Revision {done}.
          </p>
        )}
      </header>

      <div className="flex flex-wrap gap-1.5 border-b border-rule py-4 text-[0.8rem]">
        <Link
          href="/review"
          className={`rounded-sm border px-2 py-0.5 ${!stateFilter ? "border-ink bg-ink text-paper" : "border-rule-dark text-ink-muted hover:border-ink"}`}
        >
          All states
        </Link>
        {states.map((s) => (
          <Link
            key={s.id}
            href={`/review?state=${s.id}`}
            className={`rounded-sm border px-2 py-0.5 ${stateFilter === s.id ? "border-ink bg-ink text-paper" : "border-rule-dark text-ink-muted hover:border-ink"}`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      {queue.length === 0 ? (
        <p className="py-10 text-center text-[0.9rem] text-ink-muted">
          The queue is empty. Nothing awaits review.
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {queue.map((rev) => (
            <li key={rev.id} className="py-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="rounded-sm border border-rule-dark bg-paper-sunken px-1.5 text-[0.7rem] font-medium uppercase tracking-wide text-ink-muted">
                  {rev.entityType} · {rev.action}
                </span>
                {rev.origin === "import" && (
                  <span className="rounded-sm border border-blue-200 bg-blue-50 px-1.5 text-[0.7rem] font-medium uppercase tracking-wide text-accent">
                    imported
                  </span>
                )}
                <Link
                  href={`/review/${rev.id}`}
                  className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
                >
                  {rev.title}
                </Link>
              </div>
              <p className="mt-1 text-[0.8rem] text-ink-faint">
                {rev.state.name} · by{" "}
                {rev.proposer ? (
                  <Link href={`/user/${rev.proposer.id}`} className="text-accent hover:underline">
                    {rev.proposer.name ?? "unnamed"}
                  </Link>
                ) : (
                  "unknown"
                )}{" "}
                · {rev.createdAt.toISOString().slice(0, 10)} ·{" "}
                <span className="text-ink-muted">“{rev.summary}”</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
