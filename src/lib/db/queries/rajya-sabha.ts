import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { parties, rsMembers, rsTerms, states } from "@/lib/db/schema";
import { RS_SNAPSHOT_DATE } from "@/lib/ingest/rajya-sabha";

/**
 * Read-only queries for the Rajya Sabha spine (docs/RAJYA_SABHA_SPEC.md).
 *
 * Two rules shape every one of them:
 *
 *  - **Identity is the publisher's ID, never the name.** Members are keyed by
 *    `tcpd_rs_id`; nothing here groups or matches on `member_name`, which is
 *    what the /person/[slug] surface does for office-holders and what the
 *    ingest ruling forbids for these rows.
 *  - **The label the source wrote always survives.** Party and state come back
 *    as the verbatim label AND the resolved row where one exists; a null
 *    party_id is an absence to display ("NOM.", "O", "Nominated", or a held
 *    era label), never a gap to fill.
 */

export const RS_COVERAGE_START = "1952-04-03";
export { RS_SNAPSHOT_DATE };

export type RsTermRow = {
  id: string;
  stateId: string | null;
  stateName: string | null;
  stateLabel: string;
  partyId: string | null;
  partyName: string | null;
  partyColor: string | null;
  partyLabel: string;
  startDate: string;
  endDateTerm: string;
  endDateActual: string | null;
  reasonOfVacation: string | null;
  nominated: boolean;
  termNo: number;
  typeSnapshot: "Current" | "Former";
  snapshotOn: string;
};

export type RsMemberProfile = {
  id: string;
  tcpdRsId: string;
  memberName: string;
  genderTcpd: "M" | "F" | null;
  terms: RsTermRow[];
};

/** One member, by the publisher's stable id. */
export async function getRsMember(tcpdRsId: string): Promise<RsMemberProfile | null> {
  const found = await db.select().from(rsMembers).where(eq(rsMembers.tcpdRsId, tcpdRsId)).limit(1);
  const member = found[0];
  if (!member) return null;

  const rows = await db
    .select({
      id: rsTerms.id,
      stateId: rsTerms.stateId,
      stateName: states.name,
      stateLabel: rsTerms.stateLabel,
      partyId: rsTerms.partyId,
      partyName: parties.name,
      partyColor: parties.color,
      partyLabel: rsTerms.partyLabel,
      startDate: rsTerms.startDate,
      endDateTerm: rsTerms.endDateTerm,
      endDateActual: rsTerms.endDateActual,
      reasonOfVacation: rsTerms.reasonOfVacation,
      nominated: rsTerms.nominated,
      termNo: rsTerms.termNo,
      typeSnapshot: rsTerms.typeSnapshot,
      snapshotOn: rsTerms.snapshotOn,
    })
    .from(rsTerms)
    .leftJoin(states, eq(states.id, rsTerms.stateId))
    .leftJoin(parties, eq(parties.id, rsTerms.partyId))
    .where(eq(rsTerms.memberId, member.id))
    .orderBy(asc(rsTerms.startDate));

  return {
    id: member.id,
    tcpdRsId: member.tcpdRsId,
    memberName: member.memberName,
    genderTcpd: member.genderTcpd,
    terms: rows.map((r) => ({ ...r, snapshotOn: String(r.snapshotOn), startDate: String(r.startDate), endDateTerm: String(r.endDateTerm), endDateActual: r.endDateActual === null ? null : String(r.endDateActual) })),
  };
}

export type RsStateGroup = {
  stateLabel: string;
  stateId: string | null;
  stateName: string | null;
  members: number;
  terms: number;
  firstYear: number;
  lastYear: number;
};

export type RsIndex = {
  members: number;
  terms: number;
  /** Terms whose party label resolved to no party row: the absence markers
   *  and any held era label. Displayed as a count, never hidden. */
  termsWithoutParty: number;
  nominatedTerms: number;
  groups: RsStateGroup[];
  earliestStart: string | null;
  latestStart: string | null;
};

/**
 * The index: counts and per-seat grouping, in one round trip each. Grouping is
 * by the VERBATIM state label, with the resolved row's name alongside — the
 * composite 1950s seats ("Ajmer and Coorg") are their own entity, not a
 * heading to be folded into a modern state.
 */
export async function getRsIndex(): Promise<RsIndex> {
  const [totals] = await db
    .select({
      members: sql<number>`(SELECT count(*)::int FROM ${rsMembers})`,
      terms: sql<number>`count(*)::int`,
      termsWithoutParty: sql<number>`count(*) FILTER (WHERE ${rsTerms.partyId} IS NULL)::int`,
      nominatedTerms: sql<number>`count(*) FILTER (WHERE ${rsTerms.nominated})::int`,
      earliestStart: sql<string | null>`min(${rsTerms.startDate})::text`,
      latestStart: sql<string | null>`max(${rsTerms.startDate})::text`,
    })
    .from(rsTerms);

  const groups = await db
    .select({
      stateLabel: rsTerms.stateLabel,
      stateId: rsTerms.stateId,
      stateName: states.name,
      members: sql<number>`count(DISTINCT ${rsTerms.memberId})::int`,
      terms: sql<number>`count(*)::int`,
      firstYear: sql<number>`min(EXTRACT(YEAR FROM ${rsTerms.startDate}))::int`,
      lastYear: sql<number>`max(EXTRACT(YEAR FROM ${rsTerms.startDate}))::int`,
    })
    .from(rsTerms)
    .leftJoin(states, eq(states.id, rsTerms.stateId))
    .groupBy(rsTerms.stateLabel, rsTerms.stateId, states.name)
    .orderBy(asc(rsTerms.stateLabel));

  return {
    members: Number(totals?.members ?? 0),
    terms: Number(totals?.terms ?? 0),
    termsWithoutParty: Number(totals?.termsWithoutParty ?? 0),
    nominatedTerms: Number(totals?.nominatedTerms ?? 0),
    groups,
    earliestStart: totals?.earliestStart ?? null,
    latestStart: totals?.latestStart ?? null,
  };
}

export type RsSeatMember = {
  tcpdRsId: string;
  memberName: string;
  terms: number;
  firstStart: string;
  lastEnd: string;
};

/** The members holding one seat label, for the index's expandable groups. */
export async function getRsMembersForSeat(stateLabel: string): Promise<RsSeatMember[]> {
  const rows = await db
    .select({
      tcpdRsId: rsMembers.tcpdRsId,
      memberName: rsMembers.memberName,
      terms: sql<number>`count(*)::int`,
      firstStart: sql<string>`min(${rsTerms.startDate})::text`,
      lastEnd: sql<string>`max(COALESCE(${rsTerms.endDateActual}, ${rsTerms.endDateTerm}))::text`,
    })
    .from(rsTerms)
    .innerJoin(rsMembers, eq(rsMembers.id, rsTerms.memberId))
    .where(eq(rsTerms.stateLabel, stateLabel))
    .groupBy(rsMembers.tcpdRsId, rsMembers.memberName)
    .orderBy(asc(rsMembers.memberName));
  return rows;
}
