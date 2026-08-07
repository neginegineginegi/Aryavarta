import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ElectionForm } from "@/components/forms/ElectionForm";
import { EventForm } from "@/components/forms/EventForm";
import { TermForm } from "@/components/forms/TermForm";
import { requireUserPage } from "@/lib/authz";
import { db } from "@/lib/db";
import type {
  ElectionPayload,
  EventPayload,
  TermPayload,
} from "@/lib/revisions/payloads";
import { snapshotEntity } from "@/lib/revisions/snapshot";

const TITLES: Record<string, string> = {
  event: "Add a governance event",
  term: "Add a CM term / President's Rule period",
  election: "Add an assembly election",
};

const EDIT_TITLES: Record<string, string> = {
  event: "Propose a correction to this event",
  term: "Propose a correction to this term",
  election: "Propose a correction to this election",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ entityType: string }>;
}): Promise<Metadata> {
  const { entityType } = await params;
  return { title: TITLES[entityType] ?? "Contribute" };
}

export default async function ContributeEntityPage({
  params,
  searchParams,
}: {
  params: Promise<{ entityType: string }>;
  searchParams: Promise<{ state?: string; edit?: string }>;
}) {
  const { entityType } = await params;
  const { state: defaultStateId, edit: editId } = await searchParams;
  if (!["event", "term", "election"].includes(entityType)) notFound();
  await requireUserPage(`/contribute/${entityType}`);

  const [stateRows, partyRows] = await Promise.all([
    db.query.states.findMany({
      columns: { id: true, name: true },
      orderBy: (s, { asc }) => [asc(s.name)],
    }),
    db.query.parties.findMany({
      columns: { id: true, name: true, isPseudo: true },
      orderBy: (p, { asc }) => [asc(p.name)],
    }),
  ]);

  let edit: { entityId: string; payload: unknown } | undefined;
  if (editId && /^[0-9a-f-]{36}$/.test(editId)) {
    const payload = await snapshotEntity(db, entityType as "event" | "term" | "election", editId);
    if (!payload) notFound();
    edit = { entityId: editId, payload };
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/contribute" className="hover:text-ink">Contribute</Link>
          <span className="mx-1.5">/</span>
          <span>{entityType}</span>
        </nav>
        <h1 className="font-display text-[clamp(34px,4.5vw,48px)] font-light leading-[1.05] text-ink">
          {edit ? EDIT_TITLES[entityType] : TITLES[entityType]}
        </h1>
        <p className="mt-2 max-w-2xl text-[0.85rem] text-ink-muted">
          Write neutrally, attribute claims to your sources, and prefer established publications
          or primary documents. See{" "}
          <Link href="/methodology" className="text-accent underline-offset-2 hover:underline">
            what counts as a reliable source
          </Link>
          .
        </p>
      </header>

      <div className="py-7">
        {entityType === "event" && (
          <EventForm
            states={stateRows}
            defaultStateId={defaultStateId}
            edit={edit as { entityId: string; payload: EventPayload } | undefined}
          />
        )}
        {entityType === "term" && (
          <TermForm
            states={stateRows}
            parties={partyRows}
            defaultStateId={defaultStateId}
            edit={edit as { entityId: string; payload: TermPayload } | undefined}
          />
        )}
        {entityType === "election" && (
          <ElectionForm
            states={stateRows}
            parties={partyRows}
            defaultStateId={defaultStateId}
            edit={edit as { entityId: string; payload: ElectionPayload } | undefined}
          />
        )}
      </div>
    </div>
  );
}
