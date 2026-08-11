import { asc, desc, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  boardPositions,
  citations,
  fcraRegistrations,
  fundingTransactions,
  openQuestions,
  orgs,
  outcomes,
  people,
  relationships,
  sources,
} from "@/lib/db/schema";
import type { EdgeEvidence } from "@/lib/db/queries/network";

/**
 * Everything the archive holds about one organisation or one person, for the
 * entity pages.
 *
 * The page's whole reason to exist is that some of this data has no other
 * surface: FCRA registrations and actions appear in no graph edge, and the
 * "what the archive does not hold" section can only be written by something
 * that has looked at every table.
 */

export type CitedRow<T> = T & { citations: EdgeEvidence[] };

async function citationsFor(
  subjectType: string,
  ids: string[],
): Promise<Map<string, EdgeEvidence[]>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      subjectId: citations.subjectId,
      sourceId: sources.id,
      title: sources.title,
      url: sources.url,
      publisher: sources.publisher,
      publishedOn: sources.publishedOn,
      accessedOn: sources.accessedOn,
      kind: sources.kind,
      isOfficial: sources.isOfficial,
      isPrimary: sources.isPrimary,
      note: citations.note,
    })
    .from(citations)
    .innerJoin(sources, eq(sources.id, citations.sourceId))
    .where(
      sql`${citations.subjectType} = ${subjectType} AND ${inArray(citations.subjectId, ids)}`,
    );
  const out = new Map<string, EdgeEvidence[]>();
  for (const r of rows) {
    const list = out.get(r.subjectId) ?? [];
    list.push(r as unknown as EdgeEvidence);
    out.set(r.subjectId, list);
  }
  return out;
}

const attach = <T extends { id: string }>(
  rows: T[],
  cites: Map<string, EdgeEvidence[]>,
): Array<CitedRow<T>> => rows.map((r) => ({ ...r, citations: cites.get(r.id) ?? [] }));

/** Resolve org/person labels for a set of polymorphic (type, id) endpoints. */
async function labelEndpoints(
  refs: Array<{ type: string; id: string }>,
): Promise<Map<string, { label: string; slug: string | null }>> {
  const orgIds = [...new Set(refs.filter((r) => r.type === "org").map((r) => r.id))];
  const personIds = [...new Set(refs.filter((r) => r.type === "person").map((r) => r.id))];
  const out = new Map<string, { label: string; slug: string | null }>();
  if (orgIds.length) {
    for (const o of await db
      .select({ id: orgs.id, name: orgs.name, slug: orgs.slug })
      .from(orgs)
      .where(inArray(orgs.id, orgIds))) {
      out.set(`org:${o.id}`, { label: o.name, slug: o.slug });
    }
  }
  if (personIds.length) {
    for (const p of await db
      .select({ id: people.id, name: people.name, slug: people.slug })
      .from(people)
      .where(inArray(people.id, personIds))) {
      out.set(`person:${p.id}`, { label: p.name, slug: p.slug });
    }
  }
  return out;
}

export async function orgRecord(slug: string) {
  const [org] = await db.select().from(orgs).where(eq(orgs.slug, slug));
  if (!org) return null;

  const [fcra, outs, board, given, received, rels, parent, children, questions] =
    await Promise.all([
      db
        .select()
        .from(fcraRegistrations)
        .where(eq(fcraRegistrations.orgId, org.id))
        .orderBy(asc(fcraRegistrations.actionOn)),
      db
        .select()
        .from(outcomes)
        .where(sql`${outcomes.subjectType} = 'org' AND ${outcomes.subjectId} = ${org.id}`)
        .orderBy(asc(outcomes.occurredOn)),
      db
        .select({
          id: boardPositions.id,
          personId: boardPositions.personId,
          role: boardPositions.role,
          roleKind: boardPositions.roleKind,
          startOn: boardPositions.startOn,
          endOn: boardPositions.endOn,
          evidenceStatus: boardPositions.evidenceStatus,
          personName: people.name,
          personSlug: people.slug,
        })
        .from(boardPositions)
        .innerJoin(people, eq(people.id, boardPositions.personId))
        .where(eq(boardPositions.orgId, org.id))
        .orderBy(asc(people.name)),
      db
        .select()
        .from(fundingTransactions)
        .where(
          sql`${fundingTransactions.donorType} = 'org' AND ${fundingTransactions.donorId} = ${org.id}`,
        )
        .orderBy(desc(fundingTransactions.financialYear)),
      db
        .select()
        .from(fundingTransactions)
        .where(
          sql`${fundingTransactions.recipientType} = 'org' AND ${fundingTransactions.recipientId} = ${org.id}`,
        )
        .orderBy(desc(fundingTransactions.financialYear)),
      db
        .select()
        .from(relationships)
        .where(
          or(
            sql`${relationships.fromType} = 'org' AND ${relationships.fromId} = ${org.id}`,
            sql`${relationships.toType} = 'org' AND ${relationships.toId} = ${org.id}`,
          ),
        ),
      org.parentOrgId
        ? db
            .select({ id: orgs.id, name: orgs.name, slug: orgs.slug })
            .from(orgs)
            .where(eq(orgs.id, org.parentOrgId))
        : Promise.resolve([]),
      db
        .select({ id: orgs.id, name: orgs.name, slug: orgs.slug })
        .from(orgs)
        .where(eq(orgs.parentOrgId, org.id)),
      db
        .select()
        .from(openQuestions)
        .where(
          sql`${openQuestions.subjectType} = 'org' AND ${openQuestions.subjectId} = ${org.id}`,
        ),
    ]);

  const [orgCites, fcraCites, outCites, boardCites, txCites, relCites] = await Promise.all([
    citationsFor("org", [org.id]),
    citationsFor("fcra_registration", fcra.map((r) => r.id)),
    citationsFor("outcome", outs.map((r) => r.id)),
    citationsFor("board_position", board.map((r) => r.id)),
    citationsFor("funding_transaction", [...given, ...received].map((r) => r.id)),
    citationsFor("relationship", rels.map((r) => r.id)),
  ]);

  const endpoints = [
    ...given.map((t) => ({ type: t.recipientType, id: t.recipientId })),
    ...received.map((t) => ({ type: t.donorType, id: t.donorId })),
    ...rels.flatMap((r) => [
      { type: r.fromType, id: r.fromId },
      { type: r.toType, id: r.toId },
    ]),
  ];
  const labels = await labelEndpoints(endpoints);

  return {
    org: { ...org, citations: orgCites.get(org.id) ?? [] },
    fcra: attach(fcra, fcraCites),
    outcomes: attach(outs, outCites),
    board: attach(board, boardCites),
    given: attach(given, txCites),
    received: attach(received, txCites),
    relationships: attach(rels, relCites),
    parent: parent[0] ?? null,
    children,
    questions,
    labels,
  };
}

export async function personRecord(slug: string) {
  const [person] = await db.select().from(people).where(eq(people.slug, slug));
  if (!person) return null;

  const [positions, given, received, questions] = await Promise.all([
    db
      .select({
        id: boardPositions.id,
        orgId: boardPositions.orgId,
        role: boardPositions.role,
        roleKind: boardPositions.roleKind,
        startOn: boardPositions.startOn,
        endOn: boardPositions.endOn,
        evidenceStatus: boardPositions.evidenceStatus,
        orgName: orgs.name,
        orgSlug: orgs.slug,
      })
      .from(boardPositions)
      .innerJoin(orgs, eq(orgs.id, boardPositions.orgId))
      .where(eq(boardPositions.personId, person.id))
      .orderBy(asc(orgs.name)),
    db
      .select()
      .from(fundingTransactions)
      .where(
        sql`${fundingTransactions.donorType} = 'person' AND ${fundingTransactions.donorId} = ${person.id}`,
      ),
    db
      .select()
      .from(fundingTransactions)
      .where(
        sql`${fundingTransactions.recipientType} = 'person' AND ${fundingTransactions.recipientId} = ${person.id}`,
      ),
    db
      .select()
      .from(openQuestions)
      .where(
        sql`${openQuestions.subjectType} = 'person' AND ${openQuestions.subjectId} = ${person.id}`,
      ),
  ]);

  const [personCites, posCites, txCites] = await Promise.all([
    citationsFor("person_record", [person.id]),
    citationsFor("board_position", positions.map((r) => r.id)),
    citationsFor("funding_transaction", [...given, ...received].map((r) => r.id)),
  ]);

  const labels = await labelEndpoints([
    ...given.map((t) => ({ type: t.recipientType, id: t.recipientId })),
    ...received.map((t) => ({ type: t.donorType, id: t.donorId })),
  ]);

  return {
    person: { ...person, citations: personCites.get(person.id) ?? [] },
    positions: attach(positions, posCites),
    given: attach(given, txCites),
    received: attach(received, txCites),
    questions,
    labels,
  };
}
