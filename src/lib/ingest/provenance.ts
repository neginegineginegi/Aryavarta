/**
 * Validation for the bulk ingest path, kept pure so it can be tested without a
 * database or a browser.
 *
 * Same arrangement as src/lib/funding/ingest.ts: the loader is a thin shell
 * that reads sheets and calls these, so the rules that decide whether a row
 * enters the archive are testable on their own and cannot drift from the
 * script quietly.
 *
 * Everything here refuses rather than repairs. A dataset declaration missing
 * its licence is not completed with a guess, and a bulk row without an
 * upstream identifier is not given a synthetic one: both are skipped loudly,
 * because a provenance record the curator did not actually supply is worse
 * than no provenance at all. It would look like traceability and lead nowhere.
 */

export type DatasetDeclaration = {
  slug: string;
  name: string;
  publisher: string;
  version: string;
  licence: string;
  licenceUrl: string | null;
  retrievedOn: string;
  upstreamUrl: string;
  curator: string;
  notes: string | null;
};

/** Lowercase, hyphenated, no leading or trailing hyphen. Same shape as org and
 *  person slugs elsewhere in the archive, so one convention covers all of it. */
export function validSlug(raw: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw);
}

/** ISO calendar date. Deliberately strict: a dataset retrieved "March 2026"
 *  cannot be re-fetched to the state it was in. */
export function validIsoDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const d = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw;
}

export function validHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Read one row of datasets.csv.
 *
 * `version` is required, and "unversioned" is its correct value when the
 * publisher issues none. An empty version would be indistinguishable from a
 * curator who did not check, and those are different facts about the dataset.
 */
export function parseDatasetRow(
  row: Record<string, string>,
): { ok: true; value: DatasetDeclaration } | { ok: false; error: string } {
  const get = (k: string) => (row[k] ?? "").trim();

  const slug = get("slug");
  if (!slug) return { ok: false, error: "slug is required" };
  if (!validSlug(slug))
    return { ok: false, error: `slug "${slug}" must be lowercase words joined by hyphens` };

  for (const field of ["name", "publisher", "version", "licence", "curator"]) {
    if (!get(field)) {
      return {
        ok: false,
        error:
          field === "version"
            ? 'version is required; write "unversioned" when the publisher issues none, so the record says which it is'
            : `${field} is required`,
      };
    }
  }

  const retrievedOn = get("retrieved_on");
  if (!retrievedOn) return { ok: false, error: "retrieved_on is required" };
  if (!validIsoDate(retrievedOn))
    return { ok: false, error: `retrieved_on "${retrievedOn}" must be an ISO date, YYYY-MM-DD` };

  const upstreamUrl = get("upstream_url");
  if (!upstreamUrl) return { ok: false, error: "upstream_url is required" };
  if (!validHttpUrl(upstreamUrl))
    return { ok: false, error: `upstream_url "${upstreamUrl}" is not an http(s) URL` };

  const licenceUrl = get("licence_url");
  if (licenceUrl && !validHttpUrl(licenceUrl))
    return { ok: false, error: `licence_url "${licenceUrl}" is not an http(s) URL` };

  return {
    ok: true,
    value: {
      slug,
      name: get("name"),
      publisher: get("publisher"),
      version: get("version"),
      licence: get("licence"),
      licenceUrl: licenceUrl || null,
      retrievedOn,
      upstreamUrl,
      curator: get("curator"),
      notes: get("notes") || null,
    },
  };
}

/**
 * Read the two provenance columns a bulk row may carry.
 *
 * Both or neither. A row naming a dataset without saying which line of it the
 * row came from claims a traceability it cannot deliver, and a row carrying an
 * upstream id with no dataset has nothing to trace it against. The pair is the
 * unit.
 */
export function parseRowProvenance(
  row: Record<string, string>,
  knownDatasets: ReadonlySet<string>,
): { ok: true; value: { dataset: string; upstreamId: string } | null } | { ok: false; error: string } {
  const dataset = (row.dataset ?? "").trim();
  const upstreamId = (row.upstream_id ?? "").trim();

  if (!dataset && !upstreamId) return { ok: true, value: null };
  if (dataset && !upstreamId)
    return {
      ok: false,
      error: `dataset "${dataset}" given without upstream_id: a row that names its dataset must say which line of it it came from`,
    };
  if (!dataset && upstreamId)
    return { ok: false, error: `upstream_id "${upstreamId}" given without a dataset to trace it to` };
  if (!knownDatasets.has(dataset))
    return {
      ok: false,
      error: `unknown dataset "${dataset}": declare it in datasets.csv before referencing it`,
    };

  return { ok: true, value: { dataset, upstreamId } };
}

/**
 * How a record entered the archive, from what the two marker tables hold.
 *
 * Four honest states, and "unrecorded" is one of them. Rows that predate this
 * mechanism, and rows the seed script wrote, carry no marker of either kind,
 * and the interface says nothing about them rather than assuming a path.
 *
 * `both` is not an edge case to collapse. A bulk-ingested row later corrected
 * through review is exactly the case a reader most needs described, because
 * the correction is the interesting part.
 */
export type RecordPath = "bulk" | "reviewed" | "both" | "unrecorded";

export function recordPath(has: { provenance: boolean; approvedRevision: boolean }): RecordPath {
  if (has.provenance && has.approvedRevision) return "both";
  if (has.provenance) return "bulk";
  if (has.approvedRevision) return "reviewed";
  return "unrecorded";
}

/**
 * What each path lets the archive say, in the reader's words.
 *
 * All four are stated. Silence is not an option for any of them, and least of
 * all for `unrecorded`: if a record that says nothing reads as reviewed, then
 * legacy rows collect credit they never earned, and the bulk statement's
 * meaning leaks outward into everything that is merely quiet. Absence is
 * displayed as absence, the same rule the archive follows for a missing date
 * or a missing source.
 *
 * `reviewed` is deliberately flat. It records that a process happened, not
 * that the result is good: a reviewed record can still be wrong, and a
 * sentence that reads as a quality mark would be the archive scoring its own
 * contents, which it does nowhere else.
 *
 * `bulk` says "directly" rather than "from a published dataset", because the
 * same path carries curated inbox sheets as well as published datasets. What
 * it came from is named on the line below it; what this sentence reports is
 * that no person checked this row on its own.
 */
export const PATH_STATEMENT: Record<RecordPath, string> = {
  bulk: "Loaded directly, and not reviewed by a person row by row. Where it came from is named below.",
  reviewed: "A person reviewed and approved this record before it published.",
  both: "Loaded directly, then corrected by a person through review. Both records are below.",
  unrecorded: "The archive does not record which path this row took into it.",
};

/**
 * Indicators held back until the archive can record a series break.
 *
 * A definition that changed between years produces a series the archive cannot
 * yet describe honestly: the values line up in one column and one chart, and
 * nothing on screen says 2015 and 2020 counted different things. Loading them
 * first and explaining later means publishing a chart that misleads, and the
 * explanation arrives after the reader has drawn the line with their eye.
 *
 * This is code rather than a note in a document because a note rots. It lifts
 * when the series-break table exists: the design is deferred, not the decision.
 * See the tier 3 gate in docs/ABHILEKH_DATA_PLAN.md.
 *
 * A break must annotate rather than block, when it exists. The archive records
 * and does not withhold; what it must never do is draw a line across a break
 * without the break being visible. Until it can draw that, it does not draw.
 */
export const DEFERRED_UNTIL_SERIES_BREAKS: ReadonlySet<string> = new Set([
  // NCRB revises what counts as a cognizable crime, and which offences fall
  // under crimes against women, between report years.
  "ncrb-crime-rate",
  "ncrb-crimes-against-women",
  "ncrb-cognizable-crime-rate",
]);

export function isDeferredIndicator(id: string): boolean {
  return DEFERRED_UNTIL_SERIES_BREAKS.has(id.trim());
}
