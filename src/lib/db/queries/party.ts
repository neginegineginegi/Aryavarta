import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { electionResults, parties, terms } from "@/lib/db/schema";

export type PartyProfile = {
  party: {
    id: string;
    name: string;
    abbreviation: string | null;
    color: string;
    isPseudo: boolean;
  };
  governments: Array<{
    termId: string;
    stateId: string;
    stateName: string;
    kind: "cm" | "presidents_rule" | "pm" | "president";
    cmName: string | null;
    startDate: string;
    endDate: string | null;
  }>;
  electionHistory: Array<{
    electionId: string;
    stateId: string;
    stateName: string;
    electionDate: string;
    scope: "state_assembly" | "lok_sabha";
    seatsWon: number;
    totalSeats: number | null;
  }>;
};

async function fetchPartyProfile(partyId: string): Promise<PartyProfile | null> {
  const party = await db.query.parties.findFirst({ where: eq(parties.id, partyId) });
  if (!party) return null;

  const [termRows, resultRows] = await Promise.all([
    db.query.terms.findMany({
      where: and(eq(terms.partyId, partyId), isNull(terms.deletedAt)),
      orderBy: [desc(terms.startDate)],
      with: { state: { columns: { id: true, name: true } } },
    }),
    db
      .select({
        electionId: electionResults.electionId,
        seatsWon: electionResults.seatsWon,
      })
      .from(electionResults)
      .where(eq(electionResults.partyId, partyId)),
  ]);

  // Resolve elections for the result rows (small set; single pass).
  const electionIds = resultRows.map((r) => r.electionId);
  const electionRows = electionIds.length
    ? await db.query.elections.findMany({
        where: (e, { inArray: inArr }) => and(inArr(e.id, electionIds), isNull(e.deletedAt)),
        with: { state: { columns: { id: true, name: true } } },
      })
    : [];
  const byId = new Map(electionRows.map((e) => [e.id, e]));

  return {
    party: {
      id: party.id,
      name: party.name,
      abbreviation: party.abbreviation,
      color: party.color,
      isPseudo: party.isPseudo,
    },
    governments: termRows.map((t) => ({
      termId: t.id,
      stateId: t.stateId,
      stateName: t.state.name,
      kind: t.kind,
      cmName: t.cmName,
      startDate: t.startDate,
      endDate: t.endDate,
    })),
    electionHistory: resultRows
      .map((r) => {
        const e = byId.get(r.electionId);
        if (!e) return null;
        return {
          electionId: e.id,
          stateId: e.stateId,
          stateName: e.state.name,
          electionDate: e.electionDate,
          scope: e.scope,
          seatsWon: r.seatsWon,
          totalSeats: e.totalSeats,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.electionDate.localeCompare(a.electionDate)),
  };
}

export function getPartyProfile(partyId: string) {
  return unstable_cache(fetchPartyProfile, ["party-profile", partyId], {
    revalidate: 300,
  })(partyId);
}

export const getAllParties = unstable_cache(
  async () =>
    db.query.parties.findMany({
      orderBy: [asc(parties.name)],
      columns: { id: true, name: true, abbreviation: true, color: true, isPseudo: true },
    }),
  ["all-parties"],
  { revalidate: 300 },
);
