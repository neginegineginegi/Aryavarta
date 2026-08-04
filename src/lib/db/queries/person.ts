import { and, isNotNull, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { terms } from "@/lib/db/schema";

/**
 * Person pages are keyed by a slug of the office-holder's name as recorded in
 * terms. v1 aggregates by exact name match — two politicians sharing an
 * identical recorded name would share a page (documented limitation; a real
 * people table arrives with the constituency phase).
 */
export function personSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "unknown"
  );
}

export type PersonProfile = {
  name: string;
  slug: string;
  stints: Array<{
    termId: string;
    stateId: string;
    stateName: string;
    kind: "cm" | "presidents_rule" | "pm" | "president" | "governor";
    partyId: string | null;
    partyName: string | null;
    partyColor: string | null;
    startDate: string;
    endDate: string | null;
    notes: string | null;
  }>;
};

async function fetchPersonBySlug(slug: string): Promise<PersonProfile | null> {
  const rows = await db.query.terms.findMany({
    where: and(isNull(terms.deletedAt), isNotNull(terms.cmName)),
    with: {
      state: { columns: { id: true, name: true } },
      party: { columns: { id: true, name: true, color: true } },
    },
  });
  const matching = rows.filter((t) => t.cmName && personSlug(t.cmName) === slug);
  if (matching.length === 0) return null;
  matching.sort((a, b) => b.startDate.localeCompare(a.startDate));
  return {
    name: matching[0].cmName!,
    slug,
    stints: matching.map((t) => ({
      termId: t.id,
      stateId: t.stateId,
      stateName: t.state.name,
      kind: t.kind,
      partyId: t.party?.id ?? null,
      partyName: t.party?.name ?? null,
      partyColor: t.party?.color ?? null,
      startDate: t.startDate,
      endDate: t.endDate,
      notes: t.notes,
    })),
  };
}

export function getPersonBySlug(slug: string) {
  return unstable_cache(fetchPersonBySlug, ["person", slug], { revalidate: 300 })(slug);
}
