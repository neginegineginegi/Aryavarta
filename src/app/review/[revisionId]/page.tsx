import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  amendRevisionSourcesAction,
  approveRevisionAction,
  rejectRevisionAction,
} from "@/actions/review";
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
  invalid: "The stored payload failed validation and cannot be applied as-is.",
  not_found: "Revision not found.",
  bad_source: "That source didn't validate. Check that the URL is a full http(s) link and the title is at least 3 characters.",
  duplicate_source: "That URL is already cited on this draft.",
};

/** Authoritative places to find the citation of record while verifying. */
const SOURCE_SHELF = [
  {
    label: "ECI Statistical Reports (elections)",
    href: "https://old.eci.gov.in/statistical-report/statistical-reports/",
  },
  { label: "Election Commission of India", href: "https://www.eci.gov.in/" },
  { label: "eGazette of India", href: "https://egazette.gov.in/" },
  { label: "Legislative Assembly websites (via NIC)", href: "https://legislativebodiesofindia.nic.in/" },
];

export default async function ReviewRevisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ revisionId: string }>;
  searchParams: Promise<{ error?: string; added?: string }>;
}) {
  await requireRole("moderator");
  const { revisionId } = await params;
  const { error, added } = await searchParams;

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
    <div className="mx-auto max-w-4xl px-6 pb-12">
      <header className="border-b border-rule py-9">
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
        {added && (
          <p className="rounded-sm border border-green-200 bg-green-50 px-3 py-2 text-[0.85rem] text-approved">
            Source added to the draft. It now appears in the diff below and will publish with
            the entry on approval.
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

        {rev.status === "pending" && rev.afterData ? (
          <div className="rounded-sm border border-rule bg-paper-sunken/50 p-4">
            <h2 className="section-label">Strengthen sources before approving</h2>
            <p className="mt-1 text-[0.8rem] text-ink-muted">
              Imported drafts cite their machine origin (Wikidata/Wikipedia). Verify the facts
              against an authoritative source and add it here; the published record should cite
              the record of authority, not the scaffolding. Look it up:
              {SOURCE_SHELF.map((s, i) => (
                <span key={s.href}>
                  {i === 0 ? " " : " · "}
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    {s.label}
                  </a>
                </span>
              ))}
            </p>
            <form action={amendRevisionSourcesAction} className="mt-3 grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
              <input type="hidden" name="revisionId" value={rev.id} />
              <input
                name="title"
                required
                minLength={3}
                maxLength={300}
                placeholder="Source title (e.g. ECI Statistical Report, General Election to Legislative Assembly …)"
                className="rounded-sm border border-rule-dark bg-paper-raised px-3 py-1.5 text-[0.85rem] outline-none focus:border-accent"
              />
              <input
                name="url"
                type="url"
                required
                placeholder="https://…"
                className="rounded-sm border border-rule-dark bg-paper-raised px-3 py-1.5 text-[0.85rem] outline-none focus:border-accent"
              />
              <input
                name="publisher"
                placeholder="Publisher"
                maxLength={200}
                className="rounded-sm border border-rule-dark bg-paper-raised px-3 py-1.5 text-[0.85rem] outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="rounded-sm border border-rule-dark px-3 py-1.5 text-[0.85rem] text-ink hover:border-ink"
              >
                Add source
              </button>
            </form>
          </div>
        ) : null}

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
                Approve and publish
              </button>
            </form>

            <form action={rejectRevisionAction} className="space-y-3">
              <input type="hidden" name="revisionId" value={rev.id} />
              <h2 className="section-label">Reject</h2>
              <textarea
                name="reviewNote"
                required
                minLength={5}
                placeholder="Reason (required; shown to the contributor and kept in the public log)"
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
            This revision has been decided; see the log above. Public view:{" "}
            <Link href={`/revision/${rev.id}`} className="text-accent hover:underline">
              /revision/{rev.id.slice(0, 8)}…
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
