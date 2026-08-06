/**
 * Tenure arithmetic over date intervals.
 *
 * Time in office must be computed as the UNION of a party's terms, never the
 * sum: a party can hold several offices at once (a chief ministership in one
 * state while holding the prime ministership, or two states at the same time),
 * and summing term lengths would count the same calendar day repeatedly and
 * report more time in office than has actually elapsed.
 */

const MS_PER_DAY = 86_400_000;

export type Interval = { start: string; end: string | null };

/** ISO date (YYYY-MM-DD) to a whole day number; NaN if unparseable. */
function dayNum(iso: string): number {
  return Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / MS_PER_DAY);
}

/**
 * Days covered by the union of `intervals`. Open-ended intervals (end === null,
 * i.e. still in office) run to `asOf`. An optional window clips every interval,
 * so a term cannot contribute time outside the period being measured.
 */
export function mergedDays(
  intervals: Interval[],
  asOf: string,
  window?: { start?: string | null; end?: string | null },
): number {
  const asOfDay = dayNum(asOf);
  if (!Number.isFinite(asOfDay)) return 0;
  const lo = window?.start ? dayNum(window.start) : Number.NEGATIVE_INFINITY;
  const hi = window?.end ? dayNum(window.end) : asOfDay;

  const spans: Array<[number, number]> = [];
  for (const iv of intervals) {
    const rawStart = dayNum(iv.start);
    const rawEnd = iv.end ? dayNum(iv.end) : asOfDay;
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue;
    const start = Math.max(rawStart, lo);
    const end = Math.min(rawEnd, hi);
    if (end <= start) continue;
    spans.push([start, end]);
  }
  if (spans.length === 0) return 0;

  spans.sort((x, y) => x[0] - y[0]);
  let total = 0;
  let [curStart, curEnd] = spans[0];
  for (let i = 1; i < spans.length; i++) {
    const [s, e] = spans[i];
    // Touching intervals (one term ending the day the next begins) merge too,
    // so consecutive governments read as one continuous stretch.
    if (s <= curEnd) curEnd = Math.max(curEnd, e);
    else {
      total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    }
  }
  return total + (curEnd - curStart);
}
