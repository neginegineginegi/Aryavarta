import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ElectionForm } from "@/components/forms/ElectionForm";
import { EventForm } from "@/components/forms/EventForm";
import { PromiseForm } from "@/components/forms/PromiseForm";
import { TermForm } from "@/components/forms/TermForm";
import { requireUserPage } from "@/lib/authz";
import { db } from "@/lib/db";
import type {
  ElectionPayload,
  EntityType,
  EventPayload,
  PromisePayload,
  TermPayload,
} from "@/lib/revisions/payloads";
import { snapshotEntity } from "@/lib/revisions/snapshot";

const ENTITY_TYPES: EntityType[] = ["event", "term", "election", "manifesto_promise"];

const TITLES: Record<string, string> = {
  event: "Add a governance event",
  term: "Add a CM term / President's Rule period",
  election: "Add an assembly election",
  manifesto_promise: "Quote a promise from a document",
};

const EDIT_TITLES: Record<string, string> = {
  event: "Propose a correction to this event",
  term: "Propose a correction to this term",
  election: "Propose a correction to this election",
  manifesto_promise: "Propose a correction to this extraction",
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
  searchParams: Promise<{ state?: string; edit?: string; document?: string }>;
}) {
  const { entityType } = await params;
  const {
    state: defaultStateId,
    edit: editId,
    document: defaultDocumentId,
  } = await searchParams;
  if (!ENTITY_TYPES.includes(entityType as EntityType)) notFound();
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

  // Only the promise form needs the document list, and it can be long, so it
  // is not loaded for the other three.
  const documentRows =
    entityType === "manifesto_promise"
      ? await db.query.documents.findMany({
          columns: {
            id: true,
            title: true,
            type: true,
            publishedOn: true,
            partyId: true,
            electionId: true,
            stateId: true,
          },
          with: {
            party: { columns: { name: true } },
            state: { columns: { name: true } },
          },
          orderBy: (d, { desc }) => [desc(d.publishedOn), desc(d.createdAt)],
          limit: 500,
        })
      : [];

  let edit: { entityId: string; payload: unknown } | undefined;
  if (editId && /^[0-9a-f-]{36}$/.test(editId)) {
    const payload = await snapshotEntity(db, entityType as EntityType, editId);
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
        {entityType === "manifesto_promise" && (
          <PromiseForm
            documents={documentRows.map((d) => ({
              id: d.id,
              title: d.title,
              type: d.type,
              publishedOn: d.publishedOn,
              partyId: d.partyId,
              partyName: d.party?.name ?? null,
              electionId: d.electionId,
              stateId: d.stateId,
              stateName: d.state?.name ?? null,
            }))}
            defaultDocumentId={defaultDocumentId}
            edit={edit as { entityId: string; payload: PromisePayload } | undefined}
          />
        )}
      </div>
    </div>
  );
}
