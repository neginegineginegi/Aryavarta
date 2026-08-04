import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { states, terms } from "@/lib/db/schema";
import { getElectionIndex } from "@/lib/db/queries/compare";
import { fetchInsightRows } from "@/lib/db/queries/insights";
import { computeInsights } from "@/lib/insights";
import { personSlug } from "@/lib/db/queries/person";
import { yearOf } from "@/lib/format";

/**
 * Deterministic question answering over the archive. No language model at
 * runtime: a fixed set of question patterns is parsed and answered directly
 * from approved, sourced data — so every answer is reproducible and every
 * line links to the records behind it.
 */

export type AskLine = { text: string; href?: string };
export type AskAnswer = {
  restated: string;
  lines: AskLine[];
  method: string;
  followUp?: { label: string; href: string };
};

async function resolveStateByName(raw: string): Promise<{ id: string; name: string } | null> {
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;
  const all = await db.query.states.findMany({ columns: { id: true, name: true } });
  if (["india", "union", "centre", "center", "national"].includes(needle)) {
    return all.find((s) => s.id === "in") ?? null;
  }
  return (
    all.find((s) => s.name.toLowerCase() === needle) ??
    all.find((s) => s.name.toLowerCase().startsWith(needle)) ??
    all.find((s) => s.name.toLowerCase().includes(needle)) ??
    null
  );
}

async function governingIn(stateId: string, year: number) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const rows = await db.query.terms.findMany({
    where: and(eq(terms.stateId, stateId), isNull(terms.deletedAt)),
    orderBy: [asc(terms.startDate)],
    with: { party: { columns: { id: true, name: true } } },
  });
  return rows.filter(
    (t) => t.startDate <= yearEnd && (t.endDate === null || t.endDate >= yearStart),
  );
}

const OFFICE = { cm: "Chief Minister", pm: "Prime Minister", president: "President", governor: "Governor" } as const;

export async function tryAnswer(query: string): Promise<AskAnswer | null> {
  const q = query.trim();

  // -- "who governed <state> in <year>" / "who was CM of <state> in <year>" --
  {
    const m =
      /^who\s+(?:governed|ruled|led|was(?:\s+the)?\s+(?:cm|chief\s+minister|pm|prime\s+minister|president|governor)(?:\s+of)?)\s+(.+?)\s+in\s+((?:19|20)\d{2})\??$/i.exec(
        q,
      ) ?? /^who\s+governed\s+(.+?)\s+in\s+((?:19|20)\d{2})\??$/i.exec(q);
    if (m) {
      const state = await resolveStateByName(m[1]);
      const year = Number(m[2]);
      if (state) {
        const rows = await governingIn(state.id, year);
        const isUnion = state.id === "in";
        const lines: AskLine[] = rows
          .filter((t) => (isUnion ? t.kind === "pm" || t.kind === "president" : true))
          .map((t) => ({
            text:
              t.kind === "presidents_rule"
                ? `President's Rule (${yearOf(t.startDate)} – ${t.endDate ? yearOf(t.endDate) : "present"})`
                : `${t.cmName}, ${OFFICE[t.kind as keyof typeof OFFICE]}${t.party ? ` (${t.party.name})` : ""}, ${yearOf(t.startDate)} – ${t.endDate ? yearOf(t.endDate) : "present"}`,
            href: t.cmName ? `/person/${personSlug(t.cmName)}` : undefined,
          }));
        return {
          restated: `Who governed ${state.name} in ${year}?`,
          lines: lines.length
            ? lines
            : [{ text: `No approved term covers ${state.name} in ${year} yet.` }],
          method:
            "Approved terms whose dates overlap the asked year; every name links to its sourced record.",
          followUp: {
            label: `Open ${state.name}, ${year} →`,
            href: state.id === "in" ? `/union/${year}` : `/state/${state.id}/${year}`,
          },
        };
      }
    }
  }

  // -- "compare <state> 2013 and 2018" ---------------------------------------
  {
    const m = /^compare\s+(.+?)\s+(?:in\s+)?((?:19|20)\d{2})\s+(?:and|vs\.?|versus|with)\s+((?:19|20)\d{2})\??$/i.exec(
      q,
    );
    if (m) {
      const state = await resolveStateByName(m[1]);
      const y1 = Number(m[2]);
      const y2 = Number(m[3]);
      if (state) {
        const index = (await getElectionIndex()).filter((e) => e.stateId === state.id);
        const nearest = (y: number) =>
          index
            .map((e) => ({ e, d: Math.abs(yearOf(e.electionDate) - y) }))
            .sort((a, b) => a.d - b.d)
            .find((x) => x.d <= 3)?.e ?? null;
        const a = nearest(y1);
        const b = nearest(y2);
        if (a && b && a.id !== b.id) {
          return {
            restated: `Compare ${state.name}: ${y1} vs ${y2}`,
            lines: [
              { text: `${state.name} election, ${yearOf(a.electionDate)}`, href: `/election/${a.id}` },
              { text: `${state.name} election, ${yearOf(b.electionDate)}`, href: `/election/${b.id}` },
            ],
            method: "Elections closest to each asked year (within 3 years), from approved records.",
            followUp: { label: "Open the full side-by-side comparison →", href: `/compare?a=${a.id}&b=${b.id}` },
          };
        }
        return {
          restated: `Compare ${state.name}: ${y1} vs ${y2}`,
          lines: [
            {
              text: `The archive doesn't yet have two distinct approved elections for ${state.name} near those years.`,
            },
          ],
          method: "Elections matched within 3 years of each asked year.",
          followUp: { label: `Browse ${state.name} →`, href: `/state/${state.id}` },
        };
      }
    }
  }

  // -- "which CMs became PM" --------------------------------------------------
  if (/^(?:which|what)\s+(?:cms?|chief\s+ministers?)\s+(?:later\s+)?became\s+(?:pm|prime\s+minister)s?\??$/i.test(q)) {
    const { termRows, electionRows } = await fetchInsightRows();
    const groups = computeInsights(termRows, electionRows, new Date().toISOString().slice(0, 10));
    const group = groups.find((g) => g.key === "cm-to-pm");
    return {
      restated: "Which Chief Ministers became Prime Minister?",
      lines: group
        ? group.items.map((i) => ({ text: `${i.headline}: ${i.detail}`, href: i.links[0]?.href }))
        : [{ text: "No recorded name currently holds both a CM term and a PM term in the archive." }],
      method: "Recorded names holding both an approved CM term and an approved PM term (exact-name match).",
      followUp: { label: "More insights →", href: "/insights" },
    };
  }

  // -- "longest serving chief minister" --------------------------------------
  if (/longest[\s-]serving\s+(?:cm|chief\s+minister)/i.test(q)) {
    const { termRows, electionRows } = await fetchInsightRows();
    const groups = computeInsights(termRows, electionRows, new Date().toISOString().slice(0, 10));
    const group = groups.find((g) => g.key === "longest-cm");
    return {
      restated: "Longest-serving Chief Ministers",
      lines: group
        ? group.items.slice(0, 3).map((i) => ({ text: `${i.headline} (${i.detail})`, href: i.links[0]?.href }))
        : [{ text: "Not enough approved terms yet to compute tenures." }],
      method: group?.method ?? "Cumulative approved CM tenure.",
      followUp: { label: "More insights →", href: "/insights" },
    };
  }

  return null;
}

export const SUPPORTED_QUESTIONS = [
  "Who governed Karnataka in 2008?",
  "Compare Karnataka 2013 and 2018",
  "Which Chief Ministers became Prime Minister?",
  "Longest serving Chief Minister",
];
