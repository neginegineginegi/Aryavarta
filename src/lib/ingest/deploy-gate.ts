/**
 * Step 0 of docs/PRODUCTION_RUNBOOK.md, binding (ruling of 2026-09-03):
 * an insert may not outrun the code that renders it, nor the migration that
 * shapes it.
 *
 * Two failures this prevents, both of which produce a public site that lies:
 *
 *  - A TCPD election anchored to a year is stored as YYYY-01-01. Without the
 *    precision-aware date formatter live, every such row renders as
 *    "1 January" — the archive asserting a date nobody recorded.
 *  - A bonds purchaser is written with kind 'unclassified' and an RS term
 *    lands in rs_terms. Deployed code that knows neither breaks on the
 *    first, and has no page at all for the second.
 *
 * The check is by CAPABILITY, not by commit sha: a sha goes stale the next
 * time these files move, while a marker states the thing that must be true.
 * The pure halves live here so they are testable without a database, a
 * network, or a git remote.
 */

// ---------------------------------------------------------------------------
// What the deploy branch must carry, in code
// ---------------------------------------------------------------------------

export type CodeMarker = { path: string; needle: string; why: string };

export const MAIN_CODE_MARKERS: ReadonlyArray<CodeMarker> = [
  {
    path: "src/lib/format.ts",
    needle: 'electionDatePrecision ?? "day"',
    why: "precision-aware election-date rendering (without it a year-anchored TCPD row renders as an invented 1 January)",
  },
  {
    path: "src/lib/db/schema.ts",
    needle: '"unclassified"',
    why: "the unclassified org kind every bonds purchaser without a stated legal form is written with",
  },
  {
    path: "src/lib/db/schema.ts",
    needle: "rs_members",
    why: "the Rajya Sabha tables (rs_members, rs_terms) the RS insert writes",
  },
  {
    path: "src/lib/db/schema.ts",
    needle: "recipient_label",
    why: "the verbatim ECI recipient label carried beside every resolved party id",
  },
];

/**
 * `read` returns the file's content on the deploy branch, or null when the
 * branch does not carry that file at all.
 */
export function checkMainCodeMarkers(
  read: (path: string) => string | null,
  markers: ReadonlyArray<CodeMarker> = MAIN_CODE_MARKERS,
): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  const cache = new Map<string, string | null>();
  for (const m of markers) {
    if (!cache.has(m.path)) cache.set(m.path, read(m.path));
    const body = cache.get(m.path) ?? null;
    if (body === null) {
      missing.push(`${m.path} is not on the deploy branch at all — needed for ${m.why}`);
      continue;
    }
    if (!body.includes(m.needle)) missing.push(`${m.path} lacks ${m.why}`);
  }
  return { ok: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// What the target database must already carry, in schema
// ---------------------------------------------------------------------------

/** The capability key scripts/ensure-upgrades.mjs records once its
 *  2026-09-03 statements have been applied to a database. */
export const REQUIRED_SCHEMA_CAPABILITY = "stage2-2026-09-03";

/** Enum values the three inserts write. A missing one is not a subtle bug:
 *  the insert aborts mid-transaction on a type error. */
export const REQUIRED_CITATION_SUBJECTS = ["party", "state", "rs_member", "rs_term", "open_question"] as const;

/** Counts of the schema objects the inserts require, as probed from
 *  the catalogue. Booleans-as-counts keep the probe one flat SQL row. */
export type SchemaProbe = {
  orgKindUnclassified: number;
  citationSubjects: number;
  entityRefDataset: number;
  rsMembersTable: number;
  rsTermsTable: number;
  recipientLabelColumn: number;
  electionDatePrecisionColumn: number;
  capabilityTable: number;
};

export function checkSchemaProbe(p: SchemaProbe): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (p.orgKindUnclassified < 1) missing.push("org_kind is missing the value 'unclassified'");
  if (p.citationSubjects < REQUIRED_CITATION_SUBJECTS.length)
    missing.push(
      `citation_subject carries ${p.citationSubjects} of the ${REQUIRED_CITATION_SUBJECTS.length} required values (${REQUIRED_CITATION_SUBJECTS.join(", ")})`,
    );
  if (p.entityRefDataset < 1) missing.push("entity_ref is missing the value 'dataset'");
  if (p.rsMembersTable < 1) missing.push("table rs_members does not exist");
  if (p.rsTermsTable < 1) missing.push("table rs_terms does not exist");
  if (p.recipientLabelColumn < 1) missing.push("funding_transactions.recipient_label does not exist");
  if (p.electionDatePrecisionColumn < 1) missing.push("elections.election_date_precision does not exist");
  if (p.capabilityTable < 1) missing.push("table schema_capabilities does not exist (nothing has recorded a migration here)");
  return { ok: missing.length === 0, missing };
}
