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

/** What each path lets the archive say, in the reader's words. */
export const PATH_STATEMENT: Record<RecordPath, string> = {
  bulk: "Loaded from a published dataset, named below. No person has reviewed this row individually.",
  reviewed: "Proposed and reviewed by people, with its full edit history.",
  both: "Loaded from a published dataset, then corrected through review. Both records are below.",
  unrecorded: "How this row entered the archive is not recorded.",
};
