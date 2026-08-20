/**
 * One entity's recorded relationships, in the order they were recorded to have
 * happened.
 *
 * A sparse graph is a poor picture of structure and a perfectly good record of
 * events in order. That is the whole reason this exists: the force layout can
 * say nothing about a forest, but "the grant is recorded before the board seat"
 * is a fact the archive holds either way.
 *
 * ORDER IS RECORDED. CONSEQUENCE IS NOT. Temporal adjacency reads as causation
 * more readily than almost anything else an interface can show, so the rules
 * below are about refusing to imply more than the dates support:
 *
 *  - Nothing is dated that the archive did not date. An entry with no date at
 *    all goes in its own group. It is NOT sorted to the end as though it were
 *    oldest, and no date is guessed for it from its neighbours. This is the
 *    same rule TraversalOptions already applies when it keeps undated edges
 *    inside every year window.
 *  - An entry known only to the year is not treated as 1 January. It sits in
 *    its year, after the entries in that year that have a real date, and says
 *    which it is. Sorting it against a dated entry would be inventing precision.
 *  - Ties are broken by a stable key rather than left to sort order, so the
 *    same record always produces the same page.
 *
 * Pure and generic, so the ordering can be tested exhaustively without a
 * database, and so an org page and a person page can share one implementation.
 */

/** What the caller must be able to say about when something happened. */
export type Occurrence = {
  /** ISO date, "YYYY-MM-DD" or "YYYY-MM". Null when the archive holds none. */
  on: string | null;
  /** A year on its own, when that is all that was recorded. */
  year: number | null;
};

export type Precision = "day" | "month" | "year";

export type Placed<T> = {
  item: T;
  /** The value that ordered it, for display. Never invented. */
  on: string | null;
  year: number;
  precision: Precision;
};

export type Sequence<T> = {
  /** Ascending. Each year holds day- and month-precision entries in order,
   *  then the entries known only to that year. */
  years: Array<{ year: number; entries: Array<Placed<T>> }>;
  /** Entries the archive holds no date for at all, in the order given. */
  undated: T[];
  /** Counts, so a view can state n without recomputing it. */
  datedCount: number;
  undatedCount: number;
};

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

/** How exactly a date was recorded, and the year it falls in. Null when the
 *  string is not a date the archive could have written. */
function read(occ: Occurrence): { year: number; on: string | null; precision: Precision } | null {
  const on = occ.on?.trim() || null;
  if (on) {
    const day = ISO_DAY.exec(on);
    if (day) return { year: Number(day[1]), on, precision: "day" };
    const month = ISO_MONTH.exec(on);
    if (month) return { year: Number(month[1]), on, precision: "month" };
    // A four-digit string in the date column is a year, not a malformed date.
    if (/^\d{4}$/.test(on)) return { year: Number(on), on: null, precision: "year" };
    return null;
  }
  if (occ.year != null && Number.isInteger(occ.year)) {
    return { year: occ.year, on: null, precision: "year" };
  }
  return null;
}

/**
 * Group and order. `key` breaks ties and must be stable across renders; the row
 * id is the obvious choice.
 */
export function sequence<T>(
  items: T[],
  occurrenceOf: (item: T) => Occurrence,
  key: (item: T) => string,
): Sequence<T> {
  const byYear = new Map<number, Placed<T>[]>();
  const undated: T[] = [];

  for (const item of items) {
    const placed = read(occurrenceOf(item));
    if (!placed) {
      undated.push(item);
      continue;
    }
    const bucket = byYear.get(placed.year) ?? [];
    bucket.push({ item, on: placed.on, year: placed.year, precision: placed.precision });
    byYear.set(placed.year, bucket);
  }

  // Within a year: dated entries in order, then the year-only ones. A
  // year-only entry cannot be placed against a dated one without pretending
  // the archive knows a month it does not.
  const rank: Record<Precision, number> = { day: 0, month: 0, year: 1 };
  const years = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, entries]) => ({
      year,
      entries: entries.sort((a, b) => {
        const r = rank[a.precision] - rank[b.precision];
        if (r !== 0) return r;
        if (a.on && b.on && a.on !== b.on) return a.on < b.on ? -1 : 1;
        return key(a.item).localeCompare(key(b.item));
      }),
    }));

  return {
    years,
    undated,
    datedCount: years.reduce((n, y) => n + y.entries.length, 0),
    undatedCount: undated.length,
  };
}

/**
 * Entries sharing an exact recorded date, which is the one co-occurrence the
 * archive can state without interpreting anything.
 *
 * Used only to render a date once above the entries that share it. It is NOT a
 * finding: two grants recorded on the same day are two grants recorded on the
 * same day.
 */
export function runsOfSameDate<T>(entries: Array<Placed<T>>): Array<Array<Placed<T>>> {
  const out: Array<Array<Placed<T>>> = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    // Year-precision entries never merge, even with each other: "sometime in
    // 1998" twice is not two things on one date.
    if (last && e.on !== null && last[0].on === e.on && e.precision === last[0].precision) {
      last.push(e);
    } else {
      out.push([e]);
    }
  }
  return out;
}

/** "12 March 1998", "March 1998", "sometime in 1998". Never a date the archive
 *  did not record. */
export function whenLabel<T>(placed: Placed<T>): string {
  if (placed.precision === "year" || !placed.on) return `sometime in ${placed.year}`;
  const [y, m, d] = placed.on.split("-");
  const month = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][Number(m) - 1];
  if (placed.precision === "month" || !d) return `${month} ${y}`;
  return `${Number(d)} ${month} ${y}`;
}
