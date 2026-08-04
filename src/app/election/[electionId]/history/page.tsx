import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HistoryList } from "@/components/diff/HistoryList";
import { getElectionDetail } from "@/lib/db/queries/election";
import { getEntityHistory } from "@/lib/db/queries/revisions";
import { electionTitle } from "@/lib/election-analysis";
import { yearOf } from "@/lib/format";

export const metadata: Metadata = { title: "Election history" };

export default async function ElectionHistoryPage({
  params,
}: {
  params: Promise<{ electionId: string }>;
}) {
  const { electionId } = await params;
  const detail = await getElectionDetail(electionId);
  if (!detail) notFound();
  const rows = await getEntityHistory("election", electionId);

  return (
    <div className="mx-auto max-w-4xl px-5 pb-10">
      <header className="border-b border-rule py-7">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href={`/state/${detail.election.stateId}`} className="hover:text-ink">
            {detail.election.stateName}
          </Link>
          <span className="mx-1.5">/</span>
          <Link href={`/election/${electionId}`} className="hover:text-ink">
            Election {yearOf(detail.election.electionDate)}
          </Link>
          <span className="mx-1.5">/</span>
          <span>History</span>
        </nav>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">
          Revision history — {electionTitle(detail.election)}
        </h1>
      </header>
      <section className="py-6">
        <HistoryList rows={rows} />
      </section>
    </div>
  );
}
