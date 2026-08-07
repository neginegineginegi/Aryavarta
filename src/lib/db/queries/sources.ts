import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  citations,
  electionSources,
  elections,
  eventSources,
  events,
  manifestoPromises,
  sources,
  states,
  termSources,
  terms,
} from "@/lib/db/schema";
import { formatTermRange, yearOf } from "@/lib/format";

/**
 * The Source Explorer's reverse index: given a source, which records rest on
 * it.
 *
 * This is the point of the drawer. A citation marker normally reads as one
 * footnote under one claim, when in practice a single ECI report or gazette
 * carries dozens of entries across the archive. Showing that turns a footnote
 * into a statement about how much of the record depends on one document, and
 * it is the reason correcting a source matters more than correcting a page.
 *
 * The three per-entity join tables are queried directly rather than the
 * polymorphic citations table, because they are what applyRevision writes on
 * approval; citations is backfilled from them at build time and would lag a
 * fresh approval by a deploy. Promises, which have no join table, come from
 * citations.
 */

export type SourceUse = {
  label: string;
  href: string;
  kind: "term" | "election" | "event" | "promise";
};

export type SourceUsage = Map<string, SourceUse[]>;

function push(map: SourceUsage, sourceId: string, use: SourceUse) {
  const list = map.get(sourceId);
  if (list) list.push(use);
  else map.set(sourceId, [use]);
}

export async function getSourceUsage(sourceIds: string[]): Promise<SourceUsage> {
  const usage: SourceUsage = new Map();
  if (sourceIds.length === 0) return usage;

  const [termRows, electionRows, eventRows, promiseRows] = await Promise.all([
    db
      .select({
        sourceId: termSources.sourceId,
        stateId: terms.stateId,
        stateName: states.name,
        kind: terms.kind,
        cmName: terms.cmName,
        startDate: terms.startDate,
        endDate: terms.endDate,
      })
      .from(termSources)
      .innerJoin(terms, eq(termSources.termId, terms.id))
      .innerJoin(states, eq(terms.stateId, states.id))
      .where(and(inArray(termSources.sourceId, sourceIds), isNull(terms.deletedAt))),
    db
      .select({
        sourceId: electionSources.sourceId,
        id: elections.id,
        stateName: states.name,
        electionDate: elections.electionDate,
        scope: elections.scope,
      })
      .from(electionSources)
      .innerJoin(elections, eq(electionSources.electionId, elections.id))
      .innerJoin(states, eq(elections.stateId, states.id))
      .where(and(inArray(electionSources.sourceId, sourceIds), isNull(elections.deletedAt))),
    db
      .select({
        sourceId: eventSources.sourceId,
        id: events.id,
        title: events.title,
        year: events.year,
      })
      .from(eventSources)
      .innerJoin(events, eq(eventSources.eventId, events.id))
      .where(
        and(
          inArray(eventSources.sourceId, sourceIds),
          eq(events.status, "published"),
          isNull(events.deletedAt),
        ),
      ),
    db
      .select({
        sourceId: citations.sourceId,
        id: manifestoPromises.id,
        officialText: manifestoPromises.officialText,
      })
      .from(citations)
      // subjectId is text, because the polymorphic table has to hold slug ids
      // as well as uuids. The cast is explicit rather than left to Postgres,
      // which has no text-to-uuid equality operator.
      .innerJoin(
        manifestoPromises,
        sql`${citations.subjectId} = ${manifestoPromises.id}::text`,
      )
      .where(
        and(
          eq(citations.subjectType, "manifesto_promise"),
          inArray(citations.sourceId, sourceIds),
          isNull(manifestoPromises.deletedAt),
        ),
      ),
  ]);

  for (const r of termRows) {
    const who = r.kind === "presidents_rule" ? "President's Rule" : (r.cmName ?? "Unnamed");
    push(usage, r.sourceId, {
      label: `${who} · ${r.stateName} · ${formatTermRange(r.startDate, r.endDate)}`,
      href: `/state/${r.stateId}`,
      kind: "term",
    });
  }
  for (const r of electionRows) {
    const what = r.scope === "lok_sabha" ? "general election" : "assembly election";
    push(usage, r.sourceId, {
      label: `${r.stateName} ${what}, ${yearOf(r.electionDate)}`,
      href: `/election/${r.id}`,
      kind: "election",
    });
  }
  for (const r of eventRows) {
    push(usage, r.sourceId, {
      label: `${r.title} · ${r.year}`,
      href: `/event/${r.id}`,
      kind: "event",
    });
  }
  for (const r of promiseRows) {
    const quote =
      r.officialText.length > 70 ? `${r.officialText.slice(0, 70)}…` : r.officialText;
    push(usage, r.sourceId, {
      label: `Promise: ${quote}`,
      href: `/promise/${r.id}`,
      kind: "promise",
    });
  }

  return usage;
}

export type SourceClassification = {
  isOfficial: boolean | null;
  isPrimary: boolean | null;
  kind: string | null;
};

/** Classification fields for a set of sources, keyed by id. */
export async function getSourceClassifications(
  sourceIds: string[],
): Promise<Map<string, SourceClassification>> {
  const out = new Map<string, SourceClassification>();
  if (sourceIds.length === 0) return out;
  const rows = await db
    .select({
      id: sources.id,
      isOfficial: sources.isOfficial,
      isPrimary: sources.isPrimary,
      kind: sources.kind,
    })
    .from(sources)
    .where(inArray(sources.id, sourceIds));
  for (const r of rows) {
    out.set(r.id, { isOfficial: r.isOfficial, isPrimary: r.isPrimary, kind: r.kind });
  }
  return out;
}
