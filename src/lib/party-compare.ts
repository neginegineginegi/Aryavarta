import type { PartyProfile } from "@/lib/db/queries/party";
import { mergedDays } from "@/lib/tenure";

/**
 * State-by-state record for two parties.
 *
 * Deliberately limited to the POLITICAL record: who held the government, for
 * how long, and what the recorded election results were. Development
 * indicators are never folded in here. Placing a state's infant mortality or
 * literacy beside whoever governed it would read as a scorecard attributing
 * those outcomes to a party, which the archive does not do; indicators live on
 * the state page, on their own timeline, with their own sources.
 *
 * Every figure is bounded by the state's own existence, so parties governing
 * states of very different ages are never compared on raw years alone.
 */

export type StateWindow = {
  id: string;
  name: string;
  formedOn: string | null;
  dissolvedOn: string | null;
};

export type PartyStateCell = {
  terms: number;
  days: number;
  /** Share of the state's recorded existence, or null if formation is unknown. */
  sharePercent: number | null;
  headsOfGovernment: string[];
  ongoing: boolean;
  elections: number;
  best: { electionId: string; seats: number; year: number } | null;
};

export type PartyStateRow = {
  stateId: string;
  stateName: string;
  /** Union office (pseudo-state 'in') is a prime ministership, not a state government. */
  isUnion: boolean;
  formedOn: string | null;
  dissolvedOn: string | null;
  windowDays: number | null;
  shared: boolean;
  left: PartyStateCell | null;
  right: PartyStateCell | null;
};

/** Terms that mean "this party held the government", by office. */
function governingTerms(profile: PartyProfile) {
  return profile.governments.filter((g) => g.kind === "cm" || g.kind === "pm");
}

function cellFor(
  profile: PartyProfile,
  stateId: string,
  win: StateWindow | undefined,
  asOf: string,
): PartyStateCell | null {
  const terms = governingTerms(profile).filter((g) => g.stateId === stateId);
  if (terms.length === 0) return null;

  const window = { start: win?.formedOn ?? null, end: win?.dissolvedOn ?? null };
  const days = mergedDays(
    terms.map((t) => ({ start: t.startDate, end: t.endDate })),
    asOf,
    window,
  );
  const windowDays = win?.formedOn
    ? mergedDays([{ start: win.formedOn, end: win.dissolvedOn }], asOf)
    : null;

  const elections = profile.electionHistory.filter((e) => e.stateId === stateId);
  const best = elections.reduce<PartyStateCell["best"]>((acc, e) => {
    if (acc && acc.seats >= e.seatsWon) return acc;
    return {
      electionId: e.electionId,
      seats: e.seatsWon,
      year: Number(e.electionDate.slice(0, 4)),
    };
  }, null);

  return {
    terms: terms.length,
    days,
    sharePercent:
      windowDays && windowDays > 0 ? Math.round((days / windowDays) * 100) : null,
    headsOfGovernment: [...new Set(terms.map((t) => t.cmName).filter((n): n is string => !!n))],
    ongoing: terms.some((t) => t.endDate === null),
    elections: elections.length,
    best,
  };
}

/**
 * One row per state where EITHER party held the government. States both
 * parties governed sort first (the only genuinely like-for-like rows), then
 * the rest alphabetically. Ordering is never by tenure length: that would turn
 * a record into a league table.
 */
export function buildPartyStateRows(
  left: PartyProfile,
  right: PartyProfile,
  windows: StateWindow[],
  asOf: string,
): PartyStateRow[] {
  const byId = new Map(windows.map((w) => [w.id, w]));
  const stateIds = new Set<string>();
  for (const p of [left, right]) for (const g of governingTerms(p)) stateIds.add(g.stateId);

  const rows: PartyStateRow[] = [];
  for (const stateId of stateIds) {
    const win = byId.get(stateId);
    const l = cellFor(left, stateId, win, asOf);
    const r = cellFor(right, stateId, win, asOf);
    if (!l && !r) continue;

    const name =
      win?.name ??
      governingTerms(left).concat(governingTerms(right)).find((g) => g.stateId === stateId)
        ?.stateName ??
      stateId;

    rows.push({
      stateId,
      stateName: stateId === "in" ? "India (Union)" : name,
      isUnion: stateId === "in",
      formedOn: win?.formedOn ?? null,
      dissolvedOn: win?.dissolvedOn ?? null,
      windowDays: win?.formedOn
        ? mergedDays([{ start: win.formedOn, end: win.dissolvedOn }], asOf)
        : null,
      shared: Boolean(l && r),
      left: l,
      right: r,
    });
  }

  return rows.sort((a, b) => {
    if (a.shared !== b.shared) return a.shared ? -1 : 1;
    if (a.isUnion !== b.isUnion) return a.isUnion ? -1 : 1;
    return a.stateName.localeCompare(b.stateName);
  });
}
