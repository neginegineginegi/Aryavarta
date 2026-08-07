import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { getUserProfile, revisionEntityHref } from "@/lib/db/queries/revisions";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Contributor" };

const REVISION_BADGE = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  withdrawn: "neutral",
} as const;

const ROLE_LABEL = {
  contributor: "Contributor",
  moderator: "Moderator",
  admin: "Administrator",
} as const;

export default async function UserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getUserProfile(id);
  if (!profile) notFound();
  const { user, revisions } = profile;

  const counts = { approved: 0, pending: 0, rejected: 0, withdrawn: 0 };
  for (const r of revisions) counts[r.status] += 1;

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <p className="section-label">Contributor</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">
          {user.name ?? "Unnamed contributor"}
        </h1>
        <p className="mt-2 text-[0.85rem] text-ink-muted">
          {ROLE_LABEL[user.role]} · joined {formatDate(user.createdAt.toISOString().slice(0, 10))}
        </p>
        <p className="mt-3 flex gap-4 text-[0.82rem] text-ink-muted">
          <span><strong className="text-ink">{counts.approved}</strong> approved</span>
          <span><strong className="text-ink">{counts.pending}</strong> pending</span>
          <span><strong className="text-ink">{counts.rejected}</strong> rejected</span>
        </p>
      </header>

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">Contribution history</h2>
        <p className="mt-1 text-[0.78rem] text-ink-faint">
          Every proposal this user has made, public by design. The archive&rsquo;s
          accountability works in both directions.
        </p>
        {revisions.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-muted">No contributions yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-rule">
            {revisions.map((rev) => (
              <li key={rev.id} className="py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Badge variant={REVISION_BADGE[rev.status]}>{rev.status}</Badge>
                  <Link
                    href={revisionEntityHref(rev)}
                    className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
                  >
                    {rev.title}
                  </Link>
                  <span className="text-[0.78rem] text-ink-faint">
                    {rev.state.name} · {rev.entityType} {rev.action} ·{" "}
                    {formatDate(rev.createdAt.toISOString().slice(0, 10))}
                  </span>
                </div>
                <p className="mt-0.5 text-[0.82rem] text-ink-muted">“{rev.summary}”</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
