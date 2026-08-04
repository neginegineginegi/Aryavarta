import { asc, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { elections } from "@/lib/db/schema";

export type ElectionIndexEntry = {
  id: string;
  stateId: string;
  stateName: string;
  electionDate: string;
  scope: "state_assembly" | "lok_sabha";
};

/** Light index of every election, for the compare pickers. */
export const getElectionIndex = unstable_cache(
  async (): Promise<ElectionIndexEntry[]> => {
    const rows = await db.query.elections.findMany({
      where: isNull(elections.deletedAt),
      orderBy: [asc(elections.electionDate)],
      columns: { id: true, stateId: true, electionDate: true, scope: true },
      with: { state: { columns: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      stateId: r.stateId,
      stateName: r.state.name,
      electionDate: r.electionDate,
      scope: r.scope,
    }));
  },
  ["election-index"],
  { revalidate: 300 },
);
