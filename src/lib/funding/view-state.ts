/**
 * The part of the network view that belongs in the URL.
 *
 * `investigation.ts` keeps notes, pins and flags in the browser, and the reason
 * it gives is right: a note is a researcher's own reasoning, unreviewed and
 * uncited, and putting it in a shareable link is the first step toward it being
 * read as part of the record.
 *
 * View state is a different object. Where you started, which years you are
 * looking at, which organisations you have opened, whether claims are on: none
 * of it asserts anything, none of it is a conclusion, and all of it is
 * reconstructible from the archive by anyone who opens the same link. Putting it
 * in the URL is what makes a finding something a researcher can point at rather
 * than describe.
 *
 * The whitelist below is closed on purpose. Every field is a control the reader
 * operated, never a thing the reader concluded. If a future field would carry
 * reasoning, that is the line, and it belongs in `investigation.ts` instead.
 *
 * Pure, so the encoding can be tested without a browser.
 */

export type NetworkView = {
  /** A single year to hold the view at, or null for every year. Null is the
   *  default because opening on a window would hide relationships silently. */
  year: number | null;
  /** Whether asserted claims are drawn alongside documented relations. */
  claims: boolean;
  /** Whether the structure panel is open. */
  structure: boolean;
  /** Whether people are unfolded, in the view that starts folded. */
  everyone: boolean;
  /** Entity keys the reader has opened, "type:id", sorted so the same view
   *  always produces the same link. */
  open: string[];
};

export const DEFAULT_VIEW: NetworkView = {
  year: null,
  claims: false,
  structure: false,
  everyone: false,
  open: [],
};

/** Wide enough for anything the archive can hold, narrow enough that a typo or
 *  a hostile link cannot put the slider somewhere meaningless. */
const YEAR_MIN = 1600;
const YEAR_MAX = 2200;

/** Keys are "type:id" and ids are UUIDs, so neither can contain a comma. */
const OPEN_SEP = ",";

/**
 * Only what differs from the default is written.
 *
 * A reader who has touched nothing gets the address bar they arrived with, and
 * a reader who set one control gets a link with one parameter in it rather than
 * five. It also means the defaults can change later without every old link
 * pinning the old ones.
 */
export function encodeView(view: NetworkView, base?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base);
  const set = (k: string, on: boolean, v: string) => {
    if (on) params.set(k, v);
    else params.delete(k);
  };

  set("year", view.year !== null, String(view.year));
  set("claims", view.claims, "1");
  set("structure", view.structure, "1");
  set("everyone", view.everyone, "1");
  set("open", view.open.length > 0, [...view.open].sort().join(OPEN_SEP));

  return params;
}

/**
 * A URL is user input, so nothing here throws and nothing here half-applies.
 *
 * A field that does not parse falls back to its default rather than to a
 * neighbouring value. That matters most for the year: a bad year resolves to
 * "every year", never to a window, because a window the reader did not choose
 * hides relationships without saying so.
 */
export function decodeView(params: URLSearchParams): NetworkView {
  const flag = (k: string) => params.get(k) === "1";

  const rawYear = params.get("year");
  const year = rawYear === null ? null : Number(rawYear);
  const validYear =
    year !== null && Number.isInteger(year) && year >= YEAR_MIN && year <= YEAR_MAX ? year : null;

  const rawOpen = params.get("open");
  const open = rawOpen
    ? [
        ...new Set(
          rawOpen
            .split(OPEN_SEP)
            .map((k) => k.trim())
            // "type:id" and nothing else. A key that is not shaped like an
            // archive reference cannot name anything, so it is dropped rather
            // than passed through to a lookup.
            .filter((k) => /^[a-z_]+:[^:]+$/.test(k)),
        ),
      ].sort()
    : [];

  return {
    year: validYear,
    claims: flag("claims"),
    structure: flag("structure"),
    everyone: flag("everyone"),
    open,
  };
}

/** True when the view is exactly what a reader arriving cold would see. */
export function isDefaultView(view: NetworkView): boolean {
  return (
    view.year === null &&
    !view.claims &&
    !view.structure &&
    !view.everyone &&
    view.open.length === 0
  );
}
