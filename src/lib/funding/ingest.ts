import { canBeVerified, type SourceKind } from "@/lib/funding/source-rank";

/**
 * Pure validation for the funding layer's bulk sheets.
 *
 * These rules live here rather than inside the loader script so they can be
 * tested exhaustively, and so the loader stays what the other loaders are: a
 * thin walk over rows that calls out every rejection by name.
 *
 * The posture is the same as everywhere else in this layer: a row that fails
 * is skipped with a reason, never repaired. Repairing would be a silent
 * transformation of an ambiguous field, and the person who wrote the sheet is
 * the only one who knows what they meant.
 */

/** 'org:slug', 'person:slug', bare 'slug' (an org), or party/state ids. */
export type ParsedRef =
  | { type: "org"; slug: string }
  | { type: "person"; slug: string }
  | { type: "party" | "state"; id: string };

const SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;

/**
 * Parse an entity reference from a sheet.
 *
 * A bare value is an org slug, because orgs are what most cells hold and a
 * prefix on every one of them would make the sheets miserable to write. Every
 * other kind must say what it is: an unprefixed person would otherwise be
 * recorded as an organisation without anyone noticing.
 */
export function parseRef(raw: string): ParsedRef | { error: string } {
  const v = raw.trim().toLowerCase();
  if (!v) return { error: "empty reference" };
  const colon = v.indexOf(":");
  if (colon === -1) {
    if (!SLUG.test(v)) return { error: `"${raw}" is not a valid slug` };
    return { type: "org", slug: v };
  }
  const kind = v.slice(0, colon);
  const rest = v.slice(colon + 1);
  if (kind === "org" || kind === "person") {
    if (!SLUG.test(rest)) return { error: `"${raw}" is not a valid slug` };
    return { type: kind, slug: rest };
  }
  if (kind === "party" || kind === "state") {
    if (!rest) return { error: `"${raw}" has no id` };
    return { type: kind, id: rest };
  }
  return { error: `unknown reference kind "${kind}" in "${raw}"` };
}

/** '2022-23' and nothing else; the two digits must be the year that follows. */
export function validFinancialYear(raw: string): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (!m) return false;
  const start = Number(m[1]);
  return (start + 1) % 100 === Number(m[2]);
}

/** ISO 4217 shape. The loader does not keep a currency list to police; the
 *  shape check catches '₹' and 'Rs' and 'rupees', which is what actually
 *  appears in hand-built sheets. */
export function validCurrency(raw: string): boolean {
  return /^[A-Z]{3}$/.test(raw.trim());
}

export function validAmount(raw: string): boolean {
  if (raw.trim() === "") return true; // an unknown amount is recordable
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0;
}

/**
 * Bulk sheets may only assert what a curated sheet can honestly assert.
 *
 * `alleged` needs an asserter, `inferred` needs a rationale, `disputed` needs
 * the dispute recorded: all three are claims, and the claims table is where
 * they carry those obligations. A spreadsheet column cannot, so the loader
 * refuses them rather than storing an assertion stripped of its author.
 */
export function validBulkEvidenceStatus(raw: string): raw is "verified" | "documented" {
  return raw === "verified" || raw === "documented";
}

/**
 * `verified` means someone read a primary document, so a verified row must
 * cite at least one source of a primary-tier kind. A row that cannot meet
 * that is not repaired to `documented`: the sheet's author either mislabelled
 * the status or forgot the filing, and only they know which.
 */
export function verifiedStatusAllowed(
  status: string,
  sourceKinds: Array<SourceKind | null | undefined>,
): { ok: true } | { ok: false; reason: string } {
  if (status !== "verified") return { ok: true };
  if (canBeVerified(sourceKinds)) return { ok: true };
  return {
    ok: false,
    reason:
      "status 'verified' requires a primary-tier source (a filing, judgment, audited statement " +
      "or official record); cite one or record the row as 'documented'",
  };
}

/**
 * The one string that is both a month and a financial year.
 *
 * "2011-12" is December 2011 to a date parser and FY 2011-12 to anyone who
 * reads Indian filings, and only the sheet's author knows which they meant.
 * The second Amnesty batch wrote exactly this, meaning the FY, and the loader
 * would have silently recorded a December. Any YYYY-MM whose second half is
 * the following year is refused rather than guessed at.
 */
export function ambiguousFyDate(raw: string): boolean {
  return /^\d{4}-\d{2}$/.test(raw.trim()) && validFinancialYear(raw);
}

/** Reject reversed ranges before the database check does, with a better message. */
export function datesOrdered(start: string | null, end: string | null): boolean {
  if (!start || !end) return true;
  return end >= start;
}
