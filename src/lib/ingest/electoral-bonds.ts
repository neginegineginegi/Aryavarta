/**
 * Electoral bonds ingest: the pure half (docs/ELECTORAL_BONDS_SPEC.md).
 *
 * Everything that decides what a bond row MEANS lives here, testable without
 * a database: the header contract, the Indian-grouping amount rule, the
 * DD/Mon/YYYY date rule, the matched/expired split, the defect tallies, and
 * the collision scan. scripts/load-electoral-bonds.ts is a thin shell.
 *
 * House rule, unchanged: refuse rather than repair. The payload is a
 * community transcription of ECI PDFs; its defects are counted and named,
 * never fixed in flight.
 */

// ---------------------------------------------------------------------------
// Header contract (spec §2.1) — verbatim, including the source's own typo
// `journam_date`. Correcting it would be editing the record.
// ---------------------------------------------------------------------------

export const BOND_REQUIRED_COLUMNS = [
  "date_of_encashment",
  "political_party_name",
  "prefix",
  "bond_number",
  "amount",
  "pay_branch_code",
  "reference_number_URN",
  "journam_date",
  "date_of_purchase",
  "date_of_expiry",
  "purchaser_name",
  "issue_branch_code",
  "status",
] as const;

export type BondsHeaderCheck =
  | { ok: true; unknown: string[] }
  | { ok: false; missing: string[]; unknown: string[] };

export function checkBondsHeader(actual: string[]): BondsHeaderCheck {
  const have = new Set(actual.map((c) => c.trim()));
  const missing = BOND_REQUIRED_COLUMNS.filter((c) => !have.has(c));
  const known = new Set<string>(BOND_REQUIRED_COLUMNS);
  const unknown = [...have].filter((c) => !known.has(c));
  if (missing.length > 0) return { ok: false, missing, unknown };
  return { ok: true, unknown };
}

// ---------------------------------------------------------------------------
// Field rules (spec §2.2)
// ---------------------------------------------------------------------------

/** Indian digit grouping ("10,00,000") → integer rupees. Empty is null.
 *  Anything that is not digits-and-commas is refused, never coerced. */
export function parseBondAmount(raw: string): number | null | { refused: string } {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (!/^[0-9][0-9,]*$/.test(v)) return { refused: `amount "${v}" is not digits with grouping commas` };
  const n = Number(v.replace(/,/g, ""));
  if (!Number.isSafeInteger(n)) return { refused: `amount "${v}" does not parse to a safe integer` };
  return n;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** DD/Mon/YYYY ("01/Dec/2023") → ISO date. Empty is absent (null). The
 *  scheme ran 2018–2024; a year outside 2017–2025 is drift and refused. */
export function parseBondDate(raw: string): string | null | { refused: string } {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const m = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/.exec(v);
  if (!m) return { refused: `date "${v}" does not match DD/Mon/YYYY` };
  const d = Number(m[1]);
  const mo = MONTHS[m[2].toLowerCase()];
  const y = Number(m[3]);
  if (!mo) return { refused: `date "${v}" names no known month` };
  if (y < 2017 || y > 2025) return { refused: `date "${v}" is outside the scheme's 2017–2025 band` };
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
    return { refused: `date "${v}" is not a real calendar date` };
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

export type BondRow = {
  partyName: string; // "" = no recipient recorded (the expired rows, §2.3)
  purchaserName: string; // "" = defect 1
  amount: number | null;
  encashedOn: string | null;
  purchasedOn: string | null;
  status: string;
  prefix: string;
  bondNumber: string;
  urn: string;
};

/** Read one payload row. Key lookup is case-insensitive because the shared
 *  parseCsv lowercases header keys; the contract itself is enforced on the
 *  raw header line by checkBondsHeader. */
export function parseBondRow(input: Record<string, string>): BondRow | { refused: string } {
  const row: Record<string, string> = {};
  for (const k of Object.keys(input)) row[k.toLowerCase()] = input[k];

  const amount = parseBondAmount(row.amount ?? "");
  if (amount !== null && typeof amount === "object") return amount;
  const encashedOn = parseBondDate(row.date_of_encashment ?? "");
  if (encashedOn !== null && typeof encashedOn === "object") return encashedOn;
  const purchasedOn = parseBondDate(row.date_of_purchase ?? "");
  if (purchasedOn !== null && typeof purchasedOn === "object") return purchasedOn;

  return {
    partyName: (row.political_party_name ?? "").trim(),
    purchaserName: (row.purchaser_name ?? "").trim(),
    amount,
    encashedOn,
    purchasedOn,
    status: (row.status ?? "").trim(),
    prefix: (row.prefix ?? "").trim(),
    bondNumber: (row.bond_number ?? "").trim(),
    urn: (row.reference_number_urn ?? "").trim(),
  };
}

// ---------------------------------------------------------------------------
// Aggregation and defect tallies (spec §2.3–§2.4, §4)
// ---------------------------------------------------------------------------

const collapse = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Corporate markers for the individuals-as-orgs gate question (§3.2). A
 *  HEURISTIC for reporting a count, never a classification the loader acts
 *  on: the gate decides, a name pattern does not. */
const CORPORATE_MARKER =
  /\b(LTD|LIMITED|LLP|PVT|PRIVATE|CO|COMPANY|CORP|CORPORATION|INDUSTRIES|ENTERPRISES|TRADING|FINANCE|FOUNDATION|TRUST|ASSOCIATES|INFRA|INFRASTRUCTURE|TECHNOLOGIES|PROJECTS|MILLS|STEEL|POWER|ENERGY|PHARMA|PHARMACEUTICALS|LABORATORIES|GROUP|HOLDINGS|EXPORTS|IMPEX|AGENCIES|DEVELOPERS|CONSTRUCTIONS?|BUILDERS|MOTORS|TEXTILES|CHEMICALS|CEMENTS?|DISTILLER(Y|IES)|BREWERIES|SPINNING|PROCESSORS|LOGISTICS|AVIATION|HOSPITALS?|HEALTHCARE|UNIVERSITY|INSTITUTE)\b/i;

export type BondTally = { name: string; rows: number; value: number };

export type BondsOutcome = {
  matchedRows: number; // party present
  expiredRows: number; // §2.3: no party, status Expired
  purchasers: BondTally[]; // non-empty names, matched rows only
  emptyPurchaser: { rows: number; value: number; byParty: BondTally[] };
  parties: Array<BondTally & { namedRows: number; namedValue: number }>;
  collisionGroups: Array<{ form: string; names: string[] }>;
  spaceStripped: string[]; // no spaces, length >= 15 (reporting heuristic)
  midWordSplits: string[];
  likelyIndividuals: { count: number; samples: string[] };
  duplicateBondIds: number; // (prefix, bond_number) seen twice
  encashedRange: { min: string; max: string } | null;
  anomalies: string[];
  refused: Record<string, number>;
};

/**
 * Tally the payload. Nothing here transforms a name, merges an entity, or
 * fills a gap: matched and expired rows split exactly on the recorded
 * fields, the empty-purchaser money is broken out PER PARTY (so the
 * undercount the non-load causes is stated precisely), and the collision
 * groups are detected for entity_match_candidates, never applied.
 */
export function aggregateBonds(rows: BondRow[]): BondsOutcome {
  const anomalies: string[] = [];
  const refused: Record<string, number> = {};

  const matched = rows.filter((r) => r.partyName !== "");
  const expired = rows.filter((r) => r.partyName === "");
  for (const r of expired) {
    if (r.status !== "Expired" || r.encashedOn !== null)
      anomalies.push(`row without a party is not the known Expired shape (status "${r.status}", encashed ${r.encashedOn ?? "—"})`);
  }
  for (const r of matched) {
    if (r.encashedOn === null) anomalies.push(`matched row for ${r.partyName} carries no encashment date`);
    if (r.amount === null) anomalies.push(`matched row for ${r.partyName} carries no amount`);
  }

  const bondIds = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.prefix}|${r.bondNumber}`;
    bondIds.set(k, (bondIds.get(k) ?? 0) + 1);
  }
  const duplicateBondIds = [...bondIds.values()].filter((n) => n > 1).length;
  if (duplicateBondIds > 0) anomalies.push(`${duplicateBondIds} bond identities (prefix+number) appear more than once`);

  const purchaserBy = new Map<string, BondTally>();
  const partyBy = new Map<string, BondTally & { namedRows: number; namedValue: number }>();
  const emptyByParty = new Map<string, BondTally>();
  let emptyRows = 0;
  let emptyValue = 0;

  for (const r of matched) {
    const p = partyBy.get(r.partyName) ?? { name: r.partyName, rows: 0, value: 0, namedRows: 0, namedValue: 0 };
    p.rows++;
    p.value += r.amount ?? 0;
    if (r.purchaserName === "") {
      emptyRows++;
      emptyValue += r.amount ?? 0;
      const e = emptyByParty.get(r.partyName) ?? { name: r.partyName, rows: 0, value: 0 };
      e.rows++;
      e.value += r.amount ?? 0;
      emptyByParty.set(r.partyName, e);
    } else {
      p.namedRows++;
      p.namedValue += r.amount ?? 0;
      const t = purchaserBy.get(r.purchaserName) ?? { name: r.purchaserName, rows: 0, value: 0 };
      t.rows++;
      t.value += r.amount ?? 0;
      purchaserBy.set(r.purchaserName, t);
    }
    partyBy.set(r.partyName, p);
  }

  const names = [...purchaserBy.keys()];
  const byForm = new Map<string, string[]>();
  for (const n of names) byForm.set(collapse(n), [...(byForm.get(collapse(n)) ?? []), n]);
  const collisionGroups = [...byForm.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([form, v]) => ({ form, names: [...v].sort() }))
    .sort((a, b) => a.form.localeCompare(b.form));

  const spaceStripped = names.filter((n) => !n.includes(" ") && n.length >= 15).sort();
  const midWordSplits = names.filter((n) => /\bLI MITED\b|\bLIMIT ED\b|\bPRIVA TE\b|\bCOMPAN Y\b/.test(n)).sort();
  const individuals = names.filter((n) => !CORPORATE_MARKER.test(n));

  const dates = matched.map((r) => r.encashedOn).filter((d): d is string => d !== null).sort();

  return {
    matchedRows: matched.length,
    expiredRows: expired.length,
    purchasers: [...purchaserBy.values()].sort((a, b) => b.value - a.value),
    emptyPurchaser: {
      rows: emptyRows,
      value: emptyValue,
      byParty: [...emptyByParty.values()].sort((a, b) => b.value - a.value),
    },
    parties: [...partyBy.values()].sort((a, b) => b.value - a.value),
    collisionGroups,
    spaceStripped,
    midWordSplits,
    likelyIndividuals: { count: individuals.length, samples: individuals.slice(0, 8).sort() },
    duplicateBondIds,
    encashedRange: dates.length > 0 ? { min: dates[0], max: dates[dates.length - 1] } : null,
    anomalies,
    refused,
  };
}

/** Deterministic org slug for a verbatim purchaser name. */
export const purchaserSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);

/**
 * The org-kind ruling (2026-09-03): kind records only what the NAME states.
 * A purchaser name ending in a legal-form suffix from the committed list
 * (data/raw/electoral-bonds/LEGAL_FORM_SUFFIXES.csv) is `company` — the
 * suffix is the record's own statement of legal form. Every other name is
 * `unclassified`: a stated absence of classification, not a guess. The list
 * is data, not code, so widening it is a reviewed commit. Matching is
 * mechanical — uppercase, dots and commas to spaces, whitespace collapsed,
 * whole-word ends-with — and nothing else: no CORPORATE_MARKER-style
 * pattern inference reaches a stored kind.
 */
export function classifyOrgKind(name: string, suffixes: string[]): "company" | "unclassified" {
  const norm = (s: string) => s.toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const n = norm(name);
  for (const raw of suffixes) {
    const suf = norm(raw);
    if (suf === "") continue;
    if (n === suf || n.endsWith(" " + suf)) return "company";
  }
  return "unclassified";
}

export const CRORE = 1e7;
