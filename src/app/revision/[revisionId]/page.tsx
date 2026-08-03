import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RevisionDiff } from "@/components/diff/RevisionDiff";
import { RevisionMeta } from "@/components/diff/RevisionMeta";
import { db } from "@/lib/db";
import { getRevisionDetail } from "@/lib/db/queries/revisions";
import type { AnyPayload } from "@/lib/revisions/payloads";

export const metadata: Metadata = { title: "Revision" };

/**
 * Public, read-only view of a single revision — every proposal ever made is
 * inspectable by anyone, decided or not. This is the transparency layer the
 * whole archive stands on.
 */
export default async function PublicRevisionPage({
  params,
}: {
  params: Promise<{ revisionId: string }>;
}) {
  const { revisionId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(revisionId)) notFound();
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

  return (
    <div className="mx-auto max-w-4xl px-5 pb-10">
      <header className="border-b border-rule py-7">
        <p className="section-label">Revision record</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
          {rev.title}
        </h1>
      </header>

      <div className="space-y-6 py-7">
        {rev.status === "pending" && (
          <p className="rounded-sm border border-rule-dark border-dashed bg-paper-sunken px-3 py-2 text-[0.85rem] text-ink-muted">
            This is a proposed change awaiting moderator review. It is not part of the live
            record.
          </p>
        )}
        <RevisionMeta rev={rev} />
        <RevisionDiff
          entityType={rev.entityType}
          action={rev.action}
          beforeData={rev.beforeData as AnyPayload | null}
          afterData={rev.afterData as AnyPayload | null}
          labels={labels}
        />
        <p className="border-t border-rule pt-5 text-[0.82rem] text-ink-faint">
          {rev.entityType === "event" ? (
            <>
              Entity:{" "}
              <Link href={`/event/${rev.entityId}`} className="text-accent hover:underline">
                event page
              </Link>{" "}
              ·{" "}
              <Link href={`/event/${rev.entityId}/history`} className="text-accent hover:underline">
                full history
              </Link>
            </>
          ) : (
            <>
              Entity: listed on the{" "}
              <Link href={`/state/${rev.stateId}`} className="text-accent hover:underline">
                {rev.state.name} page
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
