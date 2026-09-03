/**
 * Rajya Sabha ingest: the pure half (docs/RAJYA_SABHA_SPEC.md).
 *
 * The binding design rule lives in parseRsRow: rows are built by iterating
 * the INGESTED-column ALLOWLIST, so the loader is mechanically incapable of
 * reading the file's PII columns (spec §2.1–§2.2). The raw artifact keeps
 * them, checksummed; the database never receives them.
 */

/** The 13 columns the loader reads. EXACTLY these; nothing else is ever
 *  accessed. A new column in a future release can only appear in the drift
 *  report — it cannot be ingested by accident. */
export const RS_INGESTED_COLUMNS = [
  "ID",
  "Member_Name",
  "Gender_TCPD",
  "Start_Date",
  "End_Date_Term",
  "End_Date_Actual",
  "Reason_of_Vacation",
  "Party",
  "State",
  "Nominated",
  "Term_No",
  "Type",
  "Source",
] as const;

/** Documented and NEVER read. The first eleven are the binding PII
 *  exclusion; the rest are out of the governance spine's scope. */
export const RS_EXCLUDED_COLUMNS = [
  // PII (binding)
  "Father_Name", "Mother_Name", "Date_of_Birth", "Year_of_Birth",
  "Place_of_Birth", "Marital_Status", "Spouse_Name", "Children",
  "Permanent_Address", "Present_Address", "E-mail",
  // biographical / derived / free text
  "Gender", "Educational_Qualification", "Educational_Qualification_Buckets",
  "Profession", "Positions_Held", "Freedom_Fighter", "Books_Published",
  "Other_Information", "General", "Start_Date_Year", "End_Date_Actual_Year",
  "Total_Terms",
] as const;

/** `Type` is a snapshot as of this date, never present tense (spec §4.2). */
export const RS_SNAPSHOT_DATE = "2022-07-20";

export type RsHeaderCheck =
  | { ok: true; unknown: string[] }
  | { ok: false; missing: string[]; unknown: string[] };

/** BOM-tolerant header contract: the release's first header cell is
 *  "﻿ID". Every allowlist column must be present; columns outside the
 *  known 36 are drift, reported for a person to look at. */
export function checkRsHeader(actual: string[]): RsHeaderCheck {
  const have = new Set(actual.map((c) => c.replace(/^﻿/, "").trim()));
  const missing = RS_INGESTED_COLUMNS.filter((c) => !have.has(c));
  const known = new Set<string>([...RS_INGESTED_COLUMNS, ...RS_EXCLUDED_COLUMNS]);
  const unknown = [...have].filter((c) => !known.has(c));
  if (missing.length > 0) return { ok: false, missing, unknown };
  return { ok: true, unknown };
}

/** DD-MM-YYYY (the file's only format, measured on all 10,377 date values).
 *  Empty is absent. The chamber exists from 1952; the release ends 2022. */
export function parseRsDate(raw: string): string | null | { refused: string } {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
  if (!m) return { refused: `date "${v}" does not match DD-MM-YYYY` };
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  if (y < 1950 || y > 2030) return { refused: `date "${v}" is outside the 1950–2030 band` };
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
    return { refused: `date "${v}" is not a real calendar date` };
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type RsRow = {
  tcpdId: string;
  memberName: string;
  genderTcpd: "M" | "F" | null; // TCPD's own derived field, attributed as theirs
  startDate: string;
  endDateTerm: string;
  endDateActual: string | null; // empty on 237 rows: seat not yet vacated at snapshot, or gap
  reasonOfVacation: string; // "" preserved as recorded
  partyLabel: string; // verbatim; resolution is the dispositions file's job
  stateLabel: string; // verbatim; resolution is STATE_LINKS.csv's job
  nominated: boolean;
  termNo: number;
  typeSnapshot: "Current" | "Former"; // as of RS_SNAPSHOT_DATE only
  source: string;
};

/** Read one row THROUGH THE ALLOWLIST. The input row's other keys are never
 *  touched: the loop below iterates RS_INGESTED_COLUMNS and nothing else. */
export function parseRsRow(input: Record<string, string>): RsRow | { refused: string } {
  const lower: Record<string, string> = {};
  for (const k of Object.keys(input)) lower[k.replace(/^﻿/, "").toLowerCase()] = input[k];
  const pick: Record<string, string> = {};
  for (const c of RS_INGESTED_COLUMNS) pick[c] = (lower[c.toLowerCase()] ?? "").trim();

  if (!/^RS\d{5}$/.test(pick.ID)) return { refused: `ID "${pick.ID}" is not the RSnnnnn form` };
  if (!pick.Member_Name) return { refused: "empty Member_Name" };

  const startDate = parseRsDate(pick.Start_Date);
  if (startDate === null) return { refused: "empty Start_Date" };
  if (typeof startDate === "object") return startDate;
  const endDateTerm = parseRsDate(pick.End_Date_Term);
  if (endDateTerm === null) return { refused: "empty End_Date_Term" };
  if (typeof endDateTerm === "object") return endDateTerm;
  const endDateActual = parseRsDate(pick.End_Date_Actual);
  if (endDateActual !== null && typeof endDateActual === "object") return endDateActual;

  const nominated = pick.Nominated === "TRUE" ? true : pick.Nominated === "FALSE" ? false : null;
  if (nominated === null) return { refused: `Nominated "${pick.Nominated}" is neither TRUE nor FALSE` };
  const termNo = Number(pick.Term_No);
  if (!Number.isInteger(termNo) || termNo < 1) return { refused: `Term_No "${pick.Term_No}" is not a positive integer` };
  if (pick.Type !== "Current" && pick.Type !== "Former")
    return { refused: `Type "${pick.Type}" is neither Current nor Former` };
  const genderTcpd = pick.Gender_TCPD === "M" || pick.Gender_TCPD === "F" ? pick.Gender_TCPD : null;

  return {
    tcpdId: pick.ID,
    memberName: pick.Member_Name,
    genderTcpd,
    startDate,
    endDateTerm,
    endDateActual,
    reasonOfVacation: pick.Reason_of_Vacation,
    partyLabel: pick.Party,
    stateLabel: pick.State,
    nominated,
    termNo,
    typeSnapshot: pick.Type,
    source: pick.Source,
  };
}

export type RsMember = { tcpdId: string; name: string; terms: RsRow[] };

/** Party labels that state an ABSENCE, not a party (§4.2 + the 2026-09-03
 *  ruling): "NOM." marks a nominated member, "O" marks party-not-recorded.
 *  Both are kept verbatim on rs_terms with party_id null; neither reaches
 *  the dispositions file, which must never be made to pretend an absence is
 *  a party. */
export const RS_NO_PARTY_LABELS = ["NOM.", "O"] as const;

export type RsOutcome = {
  termRows: number;
  members: RsMember[];
  multiTermMembers: number;
  maxTerms: number;
  /** Party label -> start-date years, for the windowed dispositions check.
   *  RS_NO_PARTY_LABELS are excluded here (not parties). */
  partyLabelYears: Array<{ label: string; years: number[] }>;
  /** How many rows each no-party label covers, so the report states what
   *  the exclusion held out. */
  noPartyRows: Array<{ label: string; rows: number }>;
  stateTallies: Array<{ label: string; rows: number }>;
  reasons: Array<{ value: string; rows: number }>;
  anomalies: string[];
};

/**
 * Group term rows into members by the publisher's stable ID and run the
 * internal coherence checks (spec §5): one name per ID, Term_No unique per
 * member, the NOM./Nominated cross-check, and Current-with-actual-end.
 */
export function aggregateRs(rows: RsRow[]): RsOutcome {
  const anomalies: string[] = [];
  const byId = new Map<string, RsMember>();
  for (const r of rows) {
    const m = byId.get(r.tcpdId) ?? { tcpdId: r.tcpdId, name: r.memberName, terms: [] };
    if (m.name !== r.memberName)
      anomalies.push(`${r.tcpdId}: Member_Name differs between rows ("${m.name}" vs "${r.memberName}")`);
    m.terms.push(r);
    byId.set(r.tcpdId, m);
  }
  for (const m of byId.values()) {
    m.terms.sort((a, b) => a.startDate.localeCompare(b.startDate));
    const nos = m.terms.map((t) => t.termNo);
    if (new Set(nos).size !== nos.length) anomalies.push(`${m.tcpdId}: duplicate Term_No values (${nos.join(",")})`);
  }

  const partyYears = new Map<string, Set<number>>();
  const noPartyBy = new Map<string, number>();
  const stateBy = new Map<string, number>();
  const reasonBy = new Map<string, number>();
  const noParty = new Set<string>(RS_NO_PARTY_LABELS);
  for (const r of rows) {
    if (r.partyLabel === "NOM." && !r.nominated)
      anomalies.push(`${r.tcpdId}: Party "NOM." on a row with Nominated=FALSE`);
    if (noParty.has(r.partyLabel)) {
      noPartyBy.set(r.partyLabel, (noPartyBy.get(r.partyLabel) ?? 0) + 1);
    } else if (r.partyLabel !== "") {
      const s = partyYears.get(r.partyLabel) ?? new Set<number>();
      s.add(Number(r.startDate.slice(0, 4)));
      partyYears.set(r.partyLabel, s);
    }
    stateBy.set(r.stateLabel, (stateBy.get(r.stateLabel) ?? 0) + 1);
    reasonBy.set(r.reasonOfVacation, (reasonBy.get(r.reasonOfVacation) ?? 0) + 1);
    if (r.typeSnapshot === "Current" && r.endDateActual !== null)
      anomalies.push(`${r.tcpdId}: Current (as of ${RS_SNAPSHOT_DATE}) yet End_Date_Actual is recorded`);
  }

  const members = [...byId.values()].sort((a, b) => a.tcpdId.localeCompare(b.tcpdId));
  return {
    termRows: rows.length,
    members,
    multiTermMembers: members.filter((m) => m.terms.length > 1).length,
    maxTerms: members.length === 0 ? 0 : Math.max(...members.map((m) => m.terms.length)),
    partyLabelYears: [...partyYears.entries()].map(([label, ys]) => ({ label, years: [...ys].sort((a, b) => a - b) })),
    noPartyRows: [...noPartyBy.entries()].map(([label, rows2]) => ({ label, rows: rows2 })).sort((a, b) => b.rows - a.rows),
    stateTallies: [...stateBy.entries()].map(([label, rows2]) => ({ label, rows: rows2 })).sort((a, b) => b.rows - a.rows),
    reasons: [...reasonBy.entries()].map(([value, rows2]) => ({ value, rows: rows2 })).sort((a, b) => b.rows - a.rows),
    anomalies,
  };
}

// ---------------------------------------------------------------------------
// Person-match candidates (spec §3): PROPOSED, never linked.
// ---------------------------------------------------------------------------

const HONORIFICS =
  /\b(shri|smt|dr|prof|kumari|km|sardar|pandit|pt|justice|maulana|begum|general|gen|maj|col|capt|lt|sir|rev|swami|acharya|thiru|janab|chaudhary|ch)\b\.?/gi;

/** Normalise ONLY for candidate proposal: strip honorifics, undo the
 *  "Last, First" ordering, collapse punctuation and case. Identity itself
 *  comes from the TCPD ID and is never derived from a name. */
export function normalizePersonName(raw: string): string {
  let s = raw.trim();
  const comma = s.split(",");
  if (comma.length === 2) s = `${comma[1]} ${comma[0]}`; // "Singh, Dr. Manmohan" -> "Dr. Manmohan Singh"
  s = s.replace(HONORIFICS, " ");
  return s.toLowerCase().replace(/[^a-z]+/g, " ").trim().replace(/\s+/g, " ");
}

export type PersonMatchCandidate = {
  tcpdId: string;
  rsName: string;
  archiveName: string;
  archiveKind: string; // where the colliding name lives (people row, cm term, …)
};

/** Compare normalised RS member names against normalised archive names.
 *  Sorted-token equality catches "First Last" vs "Last First" remnants. */
export function proposePersonMatches(
  members: Array<{ tcpdId: string; name: string }>,
  archive: Array<{ name: string; kind: string }>,
): PersonMatchCandidate[] {
  const key = (s: string) => normalizePersonName(s).split(" ").sort().join(" ");
  const byKey = new Map<string, Array<{ name: string; kind: string }>>();
  for (const a of archive) {
    const k = key(a.name);
    if (!k) continue;
    byKey.set(k, [...(byKey.get(k) ?? []), a]);
  }
  const out: PersonMatchCandidate[] = [];
  for (const m of members) {
    for (const a of byKey.get(key(m.name)) ?? []) {
      out.push({ tcpdId: m.tcpdId, rsName: m.name, archiveName: a.name, archiveKind: a.kind });
    }
  }
  return out.sort((a, b) => a.tcpdId.localeCompare(b.tcpdId));
}
