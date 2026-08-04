import { formatDate, yearOf } from "@/lib/format";

/**
 * Pure election analysis for the dashboards: majority math, seat swings
 * against the previous election, and the auto-generated factual overview.
 *
 * Design rule (vision #8): the overview is assembled ONLY from structured,
 * moderator-verified fields via fixed templates — it computes, it never
 * opines, and it omits any sentence whose inputs are missing.
 */

export type AnalysisResult = {
  partyId: string;
  partyName: string;
  partyAbbreviation: string | null;
  partyColor: string;
  seatsWon: number;
  voteSharePercent: string | null;
  allianceName: string | null;
};

export type AnalysisElection = {
  id: string;
  stateName: string;
  stateKind: "state" | "union_territory" | "union";
  scope: "state_assembly" | "lok_sabha";
  electionDate: string;
  assemblyNumber: number | null;
  totalSeats: number | null;
  turnoutPercent: string | null;
  results: AnalysisResult[];
};

export type FormedTerm = {
  cmName: string | null;
  partyId: string | null;
  partyName: string | null;
  startDate: string;
  endDate: string | null;
};

/** Smallest number of seats that constitutes a majority, if computable. */
export function majorityMark(totalSeats: number | null): number | null {
  if (!totalSeats || totalSeats < 1) return null;
  return Math.floor(totalSeats / 2) + 1;
}

export type SeatDelta = {
  partyId: string;
  partyName: string;
  partyColor: string;
  before: number | null; // null = did not appear in previous results
  after: number | null; // null = does not appear in current results
  delta: number | null; // null when either side is missing
};

/** Per-party seat changes vs the previous election (null-safe on both sides). */
export function seatDeltas(
  current: AnalysisResult[],
  previous: AnalysisResult[] | null,
): SeatDelta[] {
  if (!previous) return [];
  const prev = new Map(previous.map((r) => [r.partyId, r]));
  const cur = new Map(current.map((r) => [r.partyId, r]));
  const ids = [...new Set([...cur.keys(), ...prev.keys()])];
  const rows: SeatDelta[] = ids.map((partyId) => {
    const c = cur.get(partyId);
    const p = prev.get(partyId);
    const meta = c ?? p!;
    return {
      partyId,
      partyName: meta.partyName,
      partyColor: meta.partyColor,
      before: p?.seatsWon ?? null,
      after: c?.seatsWon ?? null,
      delta: c && p ? c.seatsWon - p.seatsWon : null,
    };
  });
  rows.sort((a, b) => (b.after ?? -1) - (a.after ?? -1) || (b.before ?? -1) - (a.before ?? -1));
  return rows;
}

/** Group results by alliance label; un-labelled parties form no group. */
export function allianceGroups(results: AnalysisResult[]): Array<{
  name: string;
  seats: number;
  parties: AnalysisResult[];
}> {
  const groups = new Map<string, AnalysisResult[]>();
  for (const r of results) {
    if (!r.allianceName) continue;
    const arr = groups.get(r.allianceName);
    if (arr) arr.push(r);
    else groups.set(r.allianceName, [r]);
  }
  return [...groups.entries()]
    .map(([name, parties]) => ({
      name,
      seats: parties.reduce((a, p) => a + p.seatsWon, 0),
      parties,
    }))
    .sort((a, b) => b.seats - a.seats);
}

const SCOPE_LABEL = {
  state_assembly: "Legislative Assembly election",
  lok_sabha: "Lok Sabha election",
} as const;

/**
 * The auto-generated factual overview. Every sentence is a fixed template
 * over computed values; sentences with missing inputs are omitted entirely.
 */
export function buildOverview(
  election: AnalysisElection,
  formedTerm: FormedTerm | null,
): string[] {
  const sentences: string[] = [];
  const results = election.results;
  const winner = results.length > 0 ? results[0] : null;
  const runnerUp = results.length > 1 ? results[1] : null;
  const mark = majorityMark(election.totalSeats);

  if (winner) {
    let s = `The ${formatDate(election.electionDate)} ${election.stateName} ${SCOPE_LABEL[election.scope]} resulted in ${winner.partyName} winning ${winner.seatsWon}`;
    s += election.totalSeats ? ` of ${election.totalSeats} seats` : ` seats`;
    if (mark != null) {
      const diff = winner.seatsWon - mark;
      if (diff >= 0) {
        s += `, ${diff === 0 ? "exactly reaching" : `${diff} above`} the majority mark of ${mark}`;
      } else {
        s += `, ${-diff} short of the majority mark of ${mark}`;
      }
    }
    sentences.push(s + ".");
  }

  if (formedTerm?.cmName) {
    const office = election.scope === "lok_sabha" ? "Prime Minister" : "Chief Minister";
    let s = `${formedTerm.cmName}`;
    if (formedTerm.partyName) s += ` of ${formedTerm.partyName}`;
    s += ` became ${office} on ${formatDate(formedTerm.startDate)}`;
    if (formedTerm.endDate) {
      s += `, serving until ${formatDate(formedTerm.endDate)}`;
    }
    sentences.push(s + ".");
  }

  if (runnerUp && winner && runnerUp.partyId !== formedTerm?.partyId) {
    sentences.push(
      `${runnerUp.partyName} finished second with ${runnerUp.seatsWon} seat${runnerUp.seatsWon === 1 ? "" : "s"}.`,
    );
  }

  if (election.turnoutPercent != null) {
    sentences.push(`Reported turnout was ${election.turnoutPercent}%.`);
  }

  return sentences;
}

export function electionTitle(election: AnalysisElection): string {
  return `${election.stateName} ${SCOPE_LABEL[election.scope]}, ${yearOf(election.electionDate)}`;
}
