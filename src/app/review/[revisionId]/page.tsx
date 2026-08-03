import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { approveRevisionAction, rejectRevisionAction } from "@/actions/review";
import { RevisionDiff } from "@/components/diff/RevisionDiff";
import { RevisionMeta } from "@/components/diff/RevisionMeta";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { getRevisionDetail } from "@/lib/db/queries/revisions";
import type { AnyPayload } from "@/lib/revisions/payloads";
import { snapshotEntity, snapshotsEqual } from "@/lib/revisions/snapshot";

export const metadata: Metadata = { title: "Review revision" };

const ERROR_MESSAGES: Record<string, string> = {
  conflict:
    "The live entry changed since this proposal was made. Review the differences below and, if the proposal is still correct, approve again with the conflict acknowledged.",
  not_pending: "This revision has already been decided.",
  gone: "The live entry this revision targets no longer exists.",
  invalid: "The stored payload failed validation — it cannot be applied as-is.",
  not_found: "Revision not found.",
};

export default async function ReviewRevisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ revisionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("moderator");
  const { revisionId } = await params;
  const { error } = await searchParams;

  const rev = await getRevisionDetail(revisionId);
  if (!rev) notFound();

  const [stateRows, partyRows] = await Promise.all([
    db.query.states.findMany({ columns: { id: true, name: true } }),
    db.query.parties.findMany({ columns: { id: true, name: true } }),
  ]);
  const labels = {
    stateNames: Object.fromEntries(stateRows.map((s) => [s.id, s.name])),
    partyNames: Object.fromEntries(partyRows.map((p) => [p.id, p.name])),
  };

  // Live conflict check, surfaced before the moderator acts.
  let conflict = false;
  if (rev.status === "pending" && rev.action !== "create") {
    const live = await snapshotEntity(db, rev.entityType, rev.entityId);
    conflict = !live || !snapshotsEqual(live, rev.beforeData);
  }

  return (
    <div className="mx-auto max-w-4xl px-5 pb-10">
      <header className="border-b border-rule py-7">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/review" className="hover:text-ink">Review queue</Link>
          <span className="mx-1.5">/</span>
          <span>{rev.id.slice(0, 8)}</span>
        </nav>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">
          {rev.title}
        </h1>
      </header>

      <div className="space-y-6 py-7">
        {error && (
          <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[0.85rem] text-danger">
            {ERROR_MESSAGES[error] ?? "Something went wrong."}
          </p>
        )}

        <RevisionMeta rev={rev} />

        {conflict && (
          <div className="rounded-sm border border-amber-300 bg-amber-50 p-4 text-[0.85rem]">
            <p className="font-semibold text-disputed">⚠ Conflict with the live entry</p>
            <p className="mt-1 text-ink-muted">
              The live entry has been modified (or removed) since this proposal was created, so
              the “Current” column below may not match what the contributor saw. Approving will
              overwrite the live entry with the proposed version.
            </p>
          </div>
        )}

        <RevisionDiff
          entityType={rev.entityType}
          action={rev.action}
          beforeData={rev.beforeData as AnyPayload | null}
          afterData={rev.afterData as AnyPayload | null}
          labels={labels}
        />

        {rev.entityType === "event" && (
          <p className="text-[0.82rem] text-ink-faint">
            Staged entry:{" "}
            <Link href={`/event/${rev.entityId}`} className="text-accent hover:underline">
              /event/{rev.entityId.slice(0, 8)}…
            </Link>{" "}
            (hidden from the public until approved) ·{" "}
            <Link href={`/event/${rev.entityId}/history`} className="text-accent hover:underline">
              entity history
            </Link>
          </p>
        )}

        {rev.status === "pending" ? (
          <div className="grid gap-6 border-t border-rule pt-6 sm:grid-cols-2">
            <form action={approveRevisionAction} className="space-y-3">
              <input type="hidden" name="revisionId" value={rev.id} />
              <h2 className="section-label">Approve &amp; publish</h2>
              <textarea
                name="reviewNote"
                placeholder="Optional note (visible publicly in the revision log)"
                className="min-h-20 w-full rounded-sm border border-rule-dark bg-paper-raised px-3 py-2 text-[0.85rem] outline-none focus:border-accent"
                maxLength={1000}
              />
              {conflict && (
                <label className="flex items-start gap-2 text-[0.82rem] text-disputed">
                  <input type="checkbox" name="acknowledgeConflict" required className="mt-0.5" />
                  I have reviewed the conflict and confirm the proposed version should replace
                  the current live entry.
                </label>
              )}
              <button
                type="submit"
                className="rounded-sm bg-approved px-5 py-2 text-[0.88rem] font-medium text-white transition-opacity hover:opacity-85"
              >
                Approve — publish to live site
              </button>
            </form>

            <form action={rejectRevisionAction} className="space-y-3">
              <input type="hidden" name="revisionId" value={rev.id} />
              <h2 className="section-label">Reject</h2>
              <textarea
                name="reviewNote"
                required
                minLength={5}
                placeholder="Reason (required — shown to the contributor and kept in the public log)"
                className="min-h-20 w-full rounded-sm border border-rule-dark bg-paper-raised px-3 py-2 text-[0.85rem] outline-none focus:border-accent"
                maxLength={1000}
              />
              <button
                type="submit"
                className="rounded-sm bg-danger px-5 py-2 text-[0.88rem] font-medium text-white transition-opacity hover:opacity-85"
              >
                Reject
              </button>
            </form>
          </div>
        ) : (
          <p className="border-t border-rule pt-6 text-[0.85rem] text-ink-muted">
            This revision has been decided — see the log above. Public view:{" "}
            <Link href={`/revision/${rev.id}`} className="text-accent hover:underline">
              /revision/{rev.id.slice(0, 8)}…
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
