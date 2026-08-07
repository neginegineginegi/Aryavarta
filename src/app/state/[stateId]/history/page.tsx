import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { HistoryList } from "@/components/diff/HistoryList";
import { db } from "@/lib/db";
import { states } from "@/lib/db/schema";
import { getStateHistory } from "@/lib/db/queries/revisions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stateId: string }>;
}): Promise<Metadata> {
  const { stateId } = await params;
  const state = await db.query.states.findFirst({ where: eq(states.id, stateId) });
  return { title: state ? `Revision history · ${state.name}` : "History" };
}

export default async function StateHistoryPage({
  params,
}: {
  params: Promise<{ stateId: string }>;
}) {
  const { stateId } = await params;
  const state = await db.query.states.findFirst({ where: eq(states.id, stateId) });
  if (!state) notFound();
  const rows = await getStateHistory(stateId);

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/" className="hover:text-ink">Map</Link>
          <span className="mx-1.5">/</span>
          <Link href={`/state/${state.id}`} className="hover:text-ink">{state.name}</Link>
          <span className="mx-1.5">/</span>
          <span>History</span>
        </nav>
        <h1 className="font-display text-[clamp(34px,4.5vw,48px)] font-light leading-[1.05] text-ink">
          Revision history: {state.name}
        </h1>
        <p className="mt-2 max-w-2xl text-[0.85rem] text-ink-muted">
          Every change ever proposed for this state&rsquo;s record: who proposed it, what it
          said, and how it was decided.
        </p>
      </header>
      <section className="section-card px-6 py-9 sm:px-10">
        <HistoryList rows={rows} />
      </section>
    </div>
  );
}
