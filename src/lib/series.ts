/**
 * Series breaks: where a definition changed under a running indicator.
 *
 * The standing rule (docs/ABHILEKH_DATA_PLAN.md, tier 3 gate): a break
 * ANNOTATES, it never blocks — the archive records, it does not withhold —
 * but it must be IMPOSSIBLE to render a line across a break without the break
 * being visible. splitAtBreaks is how that impossibility is built: the chart
 * draws one line per segment and physically cannot join them, because the
 * joining path never exists.
 *
 * Pure, so the honesty property is testable without a browser.
 */

export type YearPoint = { year: number };

/**
 * Split a sorted series at break years. A break year is the FIRST year
 * measured under the new definition, so it starts a new segment; the old
 * definition's last point ends the previous one. Break years outside the
 * series span anything; they simply produce no split. Empty segments are
 * dropped rather than rendered as ghost lines.
 */
export function splitAtBreaks<T extends YearPoint>(points: T[], breaks: readonly number[]): T[][] {
  if (breaks.length === 0) return points.length ? [points] : [];
  const sortedBreaks = [...breaks].sort((a, b) => a - b);
  const segments: T[][] = [];
  let current: T[] = [];
  let bi = 0;
  for (const p of points) {
    while (bi < sortedBreaks.length && p.year >= sortedBreaks[bi]) {
      if (current.length) segments.push(current);
      current = [];
      bi++;
    }
    current.push(p);
  }
  if (current.length) segments.push(current);
  return segments;
}

/** The break years that actually fall inside a series' span, for drawing the
 *  marks: a break outside the data would draw a line about nothing. */
export function breaksWithin(
  points: YearPoint[],
  breaks: readonly number[],
): number[] {
  if (points.length === 0) return [];
  const min = points[0].year;
  const max = points[points.length - 1].year;
  return [...breaks].sort((a, b) => a - b).filter((b) => b > min && b <= max);
}
