import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { WithdrawButton } from "@/components/contribute/WithdrawButton";
import { Badge } from "@/components/ui/Badge";
import { requireUserPage } from "@/lib/authz";
import { getOwnRevisions, revisionEntityHref } from "@/lib/db/queries/revisions";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Contribute" };

const REVISION_BADGE = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  withdrawn: "neutral",
} as const;

export default async function ContributePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; edit?: string }>;
}) {
  const { state, edit } = await searchParams;

  // Inline "suggest an edit" buttons link here with edit=<type>:<id>.
  if (edit) {
    const m = /^(event|term|election):([0-9a-f-]{36})$/.exec(edit);
    if (m) redirect(`/contribute/${m[1]}?edit=${m[2]}`);
  }

  const user = await requireUserPage("/contribute");
  const mine = await getOwnRevisions(user.id);
  const stateQS = state ? `?state=${encodeURIComponent(state)}` : "";

  return (
    <div className="mx-auto max-w-4xl px-5 pb-10">
      <header className="border-b border-rule py-7">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          Contribute to the archive
        </h1>
        <p className="mt-2 max-w-2xl text-[0.9rem] text-ink-muted">
          Propose an addition or correction. Everything you submit needs at least one source and
          is reviewed by a moderator before publication; your submission and its review are
          permanently part of the public record.
        </p>
      </header>

      <section className="grid gap-4 border-b border-rule py-7 sm:grid-cols-3">
        <Link
          href={`/contribute/event${stateQS}`}
          className="rounded-sm border border-rule-dark bg-paper-raised p-4 transition-colors hover:border-ink"
        >
          <h2 className="font-display text-lg font-semibold text-ink">Governance event</h2>
          <p className="mt-1 text-[0.82rem] text-ink-muted">
            Paper leaks, corruption cases, policy failures, communal incidents, infrastructure
            failures…
          </p>
        </Link>
        <Link
          href={`/contribute/term${stateQS}`}
          className="rounded-sm border border-rule-dark bg-paper-raised p-4 transition-colors hover:border-ink"
        >
          <h2 className="font-display text-lg font-semibold text-ink">CM term</h2>
          <p className="mt-1 text-[0.82rem] text-ink-muted">
            A Chief Minister&rsquo;s period in office, or a President&rsquo;s Rule interval.
          </p>
        </Link>
        <Link
          href={`/contribute/election${stateQS}`}
          className="rounded-sm border border-rule-dark bg-paper-raised p-4 transition-colors hover:border-ink"
        >
          <h2 className="font-display text-lg font-semibold text-ink">Election</h2>
          <p className="mt-1 text-[0.82rem] text-ink-muted">
            An assembly election with seat counts, turnout, and outcome.
          </p>
        </Link>
      </section>

      <section className="py-7">
        <h2 className="section-label">Your submissions</h2>
        {mine.length === 0 ? (
          <p className="mt-3 text-[0.85rem] text-ink-muted">Nothing submitted yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-rule">
            {mine.map((rev) => (
              <li key={rev.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                <Badge variant={REVISION_BADGE[rev.status]}>{rev.status}</Badge>
                <Link
                  href={revisionEntityHref(rev)}
                  className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
                >
                  {rev.title}
                </Link>
                <span className="text-[0.78rem] text-ink-faint">
                  {rev.state.name} · {rev.action} · {formatDate(rev.createdAt.toISOString().slice(0, 10))}
                </span>
                {rev.status === "pending" && <WithdrawButton revisionId={rev.id} />}
                {rev.status === "rejected" && rev.reviewNote ? (
                  <p className="w-full text-[0.8rem] text-danger">
                    Moderator: {rev.reviewNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
