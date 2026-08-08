import { personSlug } from "@/lib/db/queries/person";
import { majorityMark } from "@/lib/election-analysis";
import { yearOf } from "@/lib/format";

/**
 * The discovery engine: records and patterns computed purely from approved,
 * sourced archive data. Every insight links to the entities it names and
 * recomputes automatically as the archive grows — nothing here is authored.
 */

export type InsightTermRow = {
  id: string;
  stateId: string;
  stateName: string;
  kind: "cm" | "presidents_rule" | "pm" | "president" | "governor";
  cmName: string | null;
  partyId: string | null;
  partyName: string | null;
  startDate: string;
  endDate: string | null;
};

export type InsightElectionRow = {
  id: string;
  stateId: string;
  stateName: string;
  scope: "state_assembly" | "lok_sabha";
  electionDate: string;
  totalSeats: number | null;
  turnoutPercent: string | null;
  results: Array<{ partyId: string; partyName: string; seatsWon: number }>;
};

const DAY = 86_400_000;

function daysBetween(start: string, end: string | null, today: string): number {
  const from = new Date(`${start}T00:00:00Z`).getTime();
  const to = new Date(`${end ?? today}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((to - from) / DAY));
}

export function formatTenure(days: number): string {
  const years = Math.floor(days / 365.25);
  const rem = Math.round(days - years * 365.25);
  if (years === 0) return `${days} days`;
  const months = Math.floor(rem / 30.44);
  return months > 0 ? `${years}y ${months}m` : `${years} years`;
}

export type InsightLink = { label: string; href: string };
export type InsightItem = {
  headline: string;
  detail: string;
  links: InsightLink[];
  /** Set when the item concerns one state, so record pages can pick their own. */
  stateId?: string;
};
export type InsightGroup = {
  key: string;
  title: string;
  method: string; // the trust line: exactly how this was computed
  items: InsightItem[];
};

export function computeInsights(
  terms: InsightTermRow[],
  elections: InsightElectionRow[],
  today: string,
): InsightGroup[] {
  const groups: InsightGroup[] = [];
  const cmTerms = terms.filter((t) => t.kind === "cm" && t.cmName);

  // --- Longest-serving Chief Ministers (cumulative across terms) -----------
  {
    const byPerson = new Map<string, { name: string; stateId: string; stateName: string; days: number }>();
    for (const t of cmTerms) {
      const key = `${personSlug(t.cmName!)}|${t.stateId}`;
      const cur = byPerson.get(key) ?? {
        name: t.cmName!,
        stateId: t.stateId,
        stateName: t.stateName,
        days: 0,
      };
      cur.days += daysBetween(t.startDate, t.endDate, today);
      byPerson.set(key, cur);
    }
    const top = [...byPerson.values()].sort((a, b) => b.days - a.days).slice(0, 5);
    if (top.length > 0) {
      groups.push({
        key: "longest-cm",
        title: "Longest-serving Chief Ministers",
        method:
          "Cumulative days in office summed across all approved CM terms for the same recorded name within a state; ongoing terms counted to today.",
        items: top.map((p) => ({
          headline: `${p.name} · ${formatTenure(p.days)}`,
          detail: p.stateName,
          stateId: p.stateId,
          links: [
            { label: p.name, href: `/person/${personSlug(p.name)}` },
            { label: p.stateName, href: `/state/${p.stateId}` },
          ],
        })),
      });
    }
  }

  // --- Shortest completed governments --------------------------------------
  {
    const completed = cmTerms
      .filter((t) => t.endDate)
      .map((t) => ({ ...t, days: daysBetween(t.startDate, t.endDate, today) }))
      .sort((a, b) => a.days - b.days)
      .slice(0, 5);
    if (completed.length > 0) {
      groups.push({
        key: "shortest-gov",
        title: "Shortest governments",
        method: "Completed CM terms (with an end date), ranked by days between swearing-in and exit.",
        items: completed.map((t) => ({
          headline: `${t.cmName} · ${t.days} days`,
          stateId: t.stateId,
          detail: `${t.stateName}, ${yearOf(t.startDate)}`,
          links: [
            { label: t.cmName!, href: `/person/${personSlug(t.cmName!)}` },
            { label: `${t.stateName} ${yearOf(t.startDate)}`, href: `/state/${t.stateId}/${yearOf(t.startDate)}` },
          ],
        })),
      });
    }
  }

  // --- Largest majorities & closest elections -------------------------------
  {
    const scored = elections
      .filter((e) => e.results.length >= 1 && e.totalSeats)
      .map((e) => {
        const sorted = [...e.results].sort((a, b) => b.seatsWon - a.seatsWon);
        const winner = sorted[0];
        const runnerUp = sorted[1] ?? null;
        const mark = majorityMark(e.totalSeats)!;
        return { e, winner, runnerUp, overMark: winner.seatsWon - mark };
      });
    const largest = [...scored].sort((a, b) => b.overMark - a.overMark).slice(0, 3);
    const closest = scored
      .filter((s) => s.runnerUp)
      .sort((a, b) => (a.winner.seatsWon - a.runnerUp!.seatsWon) - (b.winner.seatsWon - b.runnerUp!.seatsWon))
      .slice(0, 3);
    if (largest.length > 0) {
      groups.push({
        key: "largest-majority",
        title: "Largest majorities",
        method: "Winner's seats minus the majority mark (⌊seats/2⌋+1), across elections with recorded totals.",
        items: largest.map(({ e, winner, overMark }) => ({
          headline: `${winner.partyName} · ${overMark >= 0 ? "+" : ""}${overMark} over the mark`,
          stateId: e.stateId,
          detail: `${e.stateName}, ${yearOf(e.electionDate)} (${winner.seatsWon}/${e.totalSeats})`,
          links: [{ label: "Election dashboard", href: `/election/${e.id}` }],
        })),
      });
    }
    if (closest.length > 0) {
      groups.push({
        key: "closest-election",
        title: "Closest elections",
        method: "Smallest seat gap between winner and runner-up, across elections with at least two recorded parties.",
        items: closest.map(({ e, winner, runnerUp }) => ({
          headline: `${winner.partyName} by ${winner.seatsWon - runnerUp!.seatsWon} seat${winner.seatsWon - runnerUp!.seatsWon === 1 ? "" : "s"} over ${runnerUp!.partyName}`,
          stateId: e.stateId,
          detail: `${e.stateName}, ${yearOf(e.electionDate)}`,
          links: [{ label: "Election dashboard", href: `/election/${e.id}` }],
        })),
      });
    }
  }

  // --- Turnout extremes ------------------------------------------------------
  {
    const withTurnout = elections
      .filter((e) => e.turnoutPercent != null)
      .sort((a, b) => Number(b.turnoutPercent) - Number(a.turnoutPercent));
    if (withTurnout.length >= 2) {
      const hi = withTurnout[0];
      const lo = withTurnout[withTurnout.length - 1];
      groups.push({
        key: "turnout",
        title: "Turnout extremes",
        method: "Highest and lowest reported turnout among elections with a recorded figure.",
        items: [
          {
            headline: `Highest: ${hi.turnoutPercent}%`,
            stateId: hi.stateId,
            detail: `${hi.stateName}, ${yearOf(hi.electionDate)}`,
            links: [{ label: "Election dashboard", href: `/election/${hi.id}` }],
          },
          {
            headline: `Lowest: ${lo.turnoutPercent}%`,
            stateId: lo.stateId,
            detail: `${lo.stateName}, ${yearOf(lo.electionDate)}`,
            links: [{ label: "Election dashboard", href: `/election/${lo.id}` }],
          },
        ],
      });
    }
  }

  // --- President's Rule tallies ---------------------------------------------
  {
    const pr = terms.filter((t) => t.kind === "presidents_rule");
    const byState = new Map<string, { stateId: string; stateName: string; count: number; days: number }>();
    for (const t of pr) {
      const cur = byState.get(t.stateId) ?? {
        stateId: t.stateId,
        stateName: t.stateName,
        count: 0,
        days: 0,
      };
      cur.count += 1;
      cur.days += daysBetween(t.startDate, t.endDate, today);
      byState.set(t.stateId, cur);
    }
    const top = [...byState.values()].sort((a, b) => b.count - a.count || b.days - a.days).slice(0, 5);
    if (top.length > 0) {
      groups.push({
        key: "presidents-rule",
        title: "Most President's Rule",
        method: "Count and cumulative duration of recorded President's Rule periods per state.",
        items: top.map((s) => ({
          headline: `${s.stateName} · ${s.count} period${s.count === 1 ? "" : "s"}, ${formatTenure(s.days)}`,
          stateId: s.stateId,
          detail: "",
          links: [{ label: s.stateName, href: `/state/${s.stateId}` }],
        })),
      });
    }
  }

  // --- Full terms vs early collapses ----------------------------------------
  {
    const completed = cmTerms.filter((t) => t.endDate);
    const full = completed.filter((t) => daysBetween(t.startDate, t.endDate, today) >= 1750);
    const collapsed = completed.filter((t) => daysBetween(t.startDate, t.endDate, today) < 913);
    if (completed.length > 0) {
      groups.push({
        key: "term-completion",
        title: "Full terms vs early exits",
        method:
          "Completed CM terms: 'full term' ≥ ~4.8 years (1750 days); 'early exit' < 2.5 years (913 days). Thresholds are stated, not editorial.",
        items: [
          {
            headline: `${full.length} of ${completed.length} completed terms ran ~full length`,
            detail: "",
            links: [],
          },
          {
            headline: `${collapsed.length} ended within 2.5 years`,
            detail: "",
            links: [],
          },
        ],
      });
    }
  }

  // --- Chief Ministers who became Prime Minister ----------------------------
  {
    const cmSlugs = new Map(cmTerms.map((t) => [personSlug(t.cmName!), t]));
    const pmTerms = terms.filter((t) => t.kind === "pm" && t.cmName);
    const crossovers: InsightItem[] = [];
    for (const pm of pmTerms) {
      const slug = personSlug(pm.cmName!);
      const asCm = cmSlugs.get(slug);
      if (asCm) {
        crossovers.push({
          headline: pm.cmName!,
          detail: `CM of ${asCm.stateName} (${yearOf(asCm.startDate)}) → PM (${yearOf(pm.startDate)})`,
          links: [{ label: pm.cmName!, href: `/person/${slug}` }],
        });
      }
    }
    if (crossovers.length > 0) {
      groups.push({
        key: "cm-to-pm",
        title: "Chief Ministers who became Prime Minister",
        method: "Recorded names holding both a CM term and a PM term (exact-name match).",
        items: crossovers,
      });
    }
  }

  // --- Party dominance -------------------------------------------------------
  {
    const byStateParty = new Map<string, { stateId: string; stateName: string; partyId: string; partyName: string; days: number }>();
    for (const t of cmTerms) {
      if (!t.partyId) continue;
      const key = `${t.stateId}|${t.partyId}`;
      const cur = byStateParty.get(key) ?? {
        stateId: t.stateId,
        stateName: t.stateName,
        partyId: t.partyId,
        partyName: t.partyName ?? t.partyId,
        days: 0,
      };
      cur.days += daysBetween(t.startDate, t.endDate, today);
      byStateParty.set(key, cur);
    }
    const top = [...byStateParty.values()].sort((a, b) => b.days - a.days).slice(0, 5);
    if (top.length > 0) {
      groups.push({
        key: "party-dominance",
        title: "Longest party dominance of a state",
        method: "Cumulative days a party's CMs governed a state, summed over all approved terms.",
        items: top.map((p) => ({
          headline: `${p.partyName} · ${formatTenure(p.days)} governing ${p.stateName}`,
          detail: "",
          links: [
            { label: p.partyName, href: `/party/${p.partyId}` },
            { label: p.stateName, href: `/state/${p.stateId}` },
          ],
        })),
      });
    }
  }

  // --- Average recorded turnout by state ------------------------------------
  {
    const byState = new Map<string, { stateId: string; stateName: string; sum: number; n: number }>();
    for (const e of elections) {
      if (e.turnoutPercent == null) continue;
      const t = Number(e.turnoutPercent);
      if (!Number.isFinite(t)) continue;
      const cur = byState.get(e.stateId) ?? { stateId: e.stateId, stateName: e.stateName, sum: 0, n: 0 };
      cur.sum += t;
      cur.n += 1;
      byState.set(e.stateId, cur);
    }
    const ranked = [...byState.values()]
      .filter((s) => s.n >= 2)
      .map((s) => ({ ...s, avg: s.sum / s.n }))
      .sort((a, b) => b.avg - a.avg);
    if (ranked.length >= 2) {
      const top = ranked.slice(0, 3);
      const bottom = ranked.slice(-2).reverse();
      groups.push({
        key: "avg-turnout",
        title: "Average turnout by state",
        method:
          "Mean of recorded turnout percentages across all approved elections for the state; states with fewer than two recorded turnouts are excluded.",
        items: [...top, ...bottom.filter((b) => !top.some((t) => t.stateId === b.stateId))].map(
          (s) => ({
            headline: `${s.stateName} · ${s.avg.toFixed(1)}% average`,
            detail: `${s.n} election${s.n === 1 ? "" : "s"} with recorded turnout`,
            links: [{ label: s.stateName, href: `/state/${s.stateId}` }],
          }),
        ),
      });
    }
  }

  // --- Government stability (average completed term length) -----------------
  {
    const byState = new Map<string, { stateId: string; stateName: string; sum: number; n: number }>();
    for (const t of cmTerms) {
      if (!t.endDate) continue; // ongoing terms would bias the average downward
      const cur = byState.get(t.stateId) ?? { stateId: t.stateId, stateName: t.stateName, sum: 0, n: 0 };
      cur.sum += daysBetween(t.startDate, t.endDate, today);
      cur.n += 1;
      byState.set(t.stateId, cur);
    }
    const ranked = [...byState.values()]
      .filter((s) => s.n >= 3)
      .map((s) => ({ ...s, avg: s.sum / s.n }))
      .sort((a, b) => b.avg - a.avg);
    if (ranked.length >= 2) {
      const mostStable = ranked.slice(0, 3);
      const leastStable = ranked.slice(-2).reverse();
      groups.push({
        key: "gov-stability",
        title: "Government stability",
        method:
          "Average length of completed CM terms per state (ongoing terms excluded); states with fewer than three completed terms are excluded. Longer averages mean governments more often ran their course.",
        items: [
          ...mostStable,
          ...leastStable.filter((b) => !mostStable.some((t) => t.stateId === b.stateId)),
        ].map((s) => ({
          headline: `${s.stateName} · ${formatTenure(Math.round(s.avg))} per government`,
          detail: `Across ${s.n} completed CM terms`,
          links: [{ label: s.stateName, href: `/state/${s.stateId}` }],
        })),
      });
    }
  }

  return groups;
}
