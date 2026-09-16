import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { WithdrawButton } from "@/components/contribute/WithdrawButton";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/States";
import { getSessionUser } from "@/lib/authz";
import { getOwnRevisions, revisionEntityHref } from "@/lib/db/queries/revisions";
import { formatDate } from "@/lib/format";

/**
 * Public by design.
 *
 * Contributing is the one thing the archive asks of a stranger, and this page
 * used to answer that ask with a login wall: the homepage, the header button,
 * About and Methodology all pointed here, and every one of those paths
 * dead-ended at a sign-in form that explained nothing. A person who did not
 * already have an account could not find out what they would be signing up
 * for.
 *
 * The sign-in requirement itself is right — contributions are attributed, and
 * attribution needs an account — so the gate moved rather than disappeared:
 * it now sits on the submission forms, and this page explains the model to
 * anyone who asks.
 */

export const metadata: Metadata = {
  title: "Contribute",
  description:
    "How to propose an addition or correction to Abhilekh: what a submission needs, how review works, and what becomes part of the public record.",
};

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

  const user = await getSessionUser();
  const mine = user ? await getOwnRevisions(user.id) : [];
  const stateQS = state ? `?state=${encodeURIComponent(state)}` : "";

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <h1 className="font-display text-[clamp(34px,4.5vw,48px)] font-light leading-[1.05] text-ink">
          Contribute to the archive
        </h1>
        <p className="mt-2 max-w-2xl text-[0.9rem] text-ink-muted">
          Propose an addition or correction. Everything you submit needs at least one source and
          is reviewed by a moderator before publication; your submission and its review are
          permanently part of the public record.
        </p>
      </header>

      {!user && (
        <section className="section-card px-6 py-9 sm:px-10">
          <h2 className="font-display text-[28px] font-light leading-tight text-ink">
            What contributing involves
          </h2>
          <dl className="mt-5 space-y-4 text-[0.92rem] leading-relaxed">
            <div>
              <dt className="font-medium text-ink">Every claim needs a published source</dt>
              <dd className="mt-1 text-ink-muted">
                A link or citation that someone else can check — a gazette notification, an
                Election Commission report, a court judgment, a news report of record. The archive
                does not accept a fact on the strength of who is asserting it, including its own
                maintainers.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">A moderator reviews it before it publishes</dt>
              <dd className="mt-1 text-ink-muted">
                Nothing you submit appears on the site straight away. A reviewer either approves
                it, or rejects it with a stated reason you will see on this page.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Your name stays with the edit, permanently</dt>
              <dd className="mt-1 text-ink-muted">
                Approved or rejected, the submission and its review become part of the public edit
                history, attributed to your account. That is why an account is needed at all — an
                unattributable correction is not a correction anyone can weigh. It is also why
                there is no anonymous route: the archive would rather be small than be unaccountable.
              </dd>
            </div>
          </dl>
          <p className="mt-6 text-[0.9rem] text-ink-muted">
            You can read the forms below before deciding.{" "}
            <Link
              href="/login?next=%2Fcontribute"
              className="text-accent underline-offset-2 hover:underline"
            >
              Sign in
            </Link>{" "}
            when you are ready to submit one, or read the{" "}
            <Link href="/methodology" className="text-accent underline-offset-2 hover:underline">
              methodology
            </Link>{" "}
            first.
          </p>
        </section>
      )}

      <section className="grid gap-4 border-b border-rule py-8 sm:grid-cols-3">
        <Link
          href={`/contribute/event${stateQS}`}
          className="rounded-sm border border-rule-dark bg-paper-raised p-4 transition-colors hover:border-ink"
        >
          <h2 className="font-display text-lg font-semibold text-ink">Governance event</h2>
          <p className="mt-1 text-[0.82rem] text-ink-muted">
            Legislation, constitutional amendments, court judgments, corruption cases, communal
            incidents, and other turning points.
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
        <Link
          href="/contribute/manifesto_promise"
          className="rounded-sm border border-rule-dark bg-paper-raised p-4 transition-colors hover:border-ink"
        >
          <h2 className="font-display text-lg font-semibold text-ink">Manifesto promise</h2>
          <p className="mt-1 text-[0.82rem] text-ink-muted">
            A pledge quoted word for word out of a document already in the archive, with the page
            it came from.
          </p>
        </Link>
      </section>

      {user && (
      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">Your submissions</h2>
        {mine.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              message="Nothing submitted yet."
              helper="Anything you propose appears here with its review status until a moderator decides it."
            />
          </div>
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
      )}
    </div>
  );
}
