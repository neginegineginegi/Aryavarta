/* eslint-disable no-console */
/**
 * Funding and Influence bulk loader. Runs on every build, after load-inbox.
 *
 * Sheets (all optional, all in data/inbox): funding_sources.csv,
 * funding_orgs.csv, funding_people.csv, funding_transactions.csv,
 * funding_board.csv, funding_relationships.csv, funding_fcra.csv.
 * Format: docs/DATA_FORMAT.md.
 *
 * Unlike terms and events, these rows are inserted DIRECTLY, the way indicator
 * values are, not staged as revisions. The reasoning, stated once so it can be
 * argued with: there is no public contribution form for this layer, so the
 * only way a row arrives is this loader, run by whoever curates the sheets —
 * the same person who would be approving their own rows in a queue. The
 * review flow earns its keep when proposer and reviewer are different people;
 * until funding contributions open to the public, a queue here would be
 * ceremony. Every row still requires a citation, and every insert is additive
 * and idempotent. When public forms for this layer exist, they must go
 * through revisions like everything else.
 *
 * The loader's job is to refuse, loudly. A row that fails any check is skipped
 * with a reason and printed; nothing is repaired, because the person who wrote
 * the sheet is the only one who knows what they meant.
 *
 * FUNDING_INBOX overrides the directory, for testing against sheets that are
 * not committed.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { v7 as uuidv7 } from "uuid";

const INBOX = process.env.FUNDING_INBOX || join(process.cwd(), "data", "inbox");

type Row = Record<string, string>;

function normalizeDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^\d{4}$/.test(v)) return `${v}-01-01`;
  if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return null;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("[load-funding] DATABASE_URL not set — skipping.");
    return;
  }

  const { parseCsv } = await import("../src/lib/csv");
  const readSheet = (name: string): Row[] => {
    const p = join(INBOX, name);
    if (!existsSync(p)) return [];
    return parseCsv(readFileSync(p, "utf8"));
  };

  const sheets = [
    "funding_sources.csv",
    "funding_orgs.csv",
    "funding_people.csv",
    "funding_transactions.csv",
    "funding_board.csv",
    "funding_relationships.csv",
    "funding_fcra.csv",
    "funding_outcomes.csv",
    "funding_matches.csv",
  ];
  if (!sheets.some((s) => existsSync(join(INBOX, s)))) {
    console.log("[load-funding] no funding sheets in the inbox — nothing to load.");
    return;
  }

  const { db } = await import("../src/lib/db");
  const schema = await import("../src/lib/db/schema");
  const { and, eq, sql } = await import("drizzle-orm");
  const { normalizeSourceUrl } = await import("../src/lib/revisions/payloads");
  const {
    ambiguousFyDate,
    datesOrdered,
    parseRef,
    validAmount,
    validBulkEvidenceStatus,
    validCurrency,
    validFinancialYear,
    verifiedStatusAllowed,
  } = await import("../src/lib/funding/ingest");
  const today = new Date().toISOString().slice(0, 10);

  const report = { created: {} as Record<string, number>, skipped: [] as string[] };
  const bump = (k: string) => (report.created[k] = (report.created[k] ?? 0) + 1);
  const skip = (s: string) => report.skipped.push(s);

  /** null = blank or fine; the sentinel string means refuse the row. */
  const AMBIGUOUS = "__ambiguous__";
  const readDate = (raw: string | undefined, label: string, field: string): string | null => {
    const v = (raw ?? "").trim();
    if (!v) return null;
    if (ambiguousFyDate(v)) {
      skip(
        `${label}: ${field} "${v}" reads as both a calendar month and a financial year; ` +
          "write a full date, or leave it blank and put the FY in the note",
      );
      return AMBIGUOUS;
    }
    return normalizeDate(v);
  };

  // --- states, for org/people geography -------------------------------------
  const stateRows = await db.select().from(schema.states);
  const stateByKey = new Map<string, string>();
  for (const s of stateRows) {
    stateByKey.set(s.id.toLowerCase(), s.id);
    stateByKey.set(s.name.toLowerCase(), s.id);
  }
  const resolveState = (raw: string): string | null | undefined => {
    const v = raw.trim().toLowerCase();
    if (!v) return null; // absent is fine; wrong is not
    return stateByKey.get(v);
  };

  // --- sources ---------------------------------------------------------------
  // funding_sources.csv: id,title,url,publisher,published_date,kind,is_official,is_primary
  type Src = {
    title: string;
    url: string;
    publisher: string | null;
    publishedOn: string | null;
    kind: string | null;
    isOfficial: boolean | null;
    isPrimary: boolean | null;
  };
  const KINDS = new Set(schema.sourceKindEnum.enumValues as readonly string[]);
  const srcById = new Map<string, Src>();
  for (const r of readSheet("funding_sources.csv")) {
    const label = `source ${r.id}`;
    if (!r.id || !r.title || !r.url) {
      skip(`${label}: missing id/title/url`);
      continue;
    }
    let url: string;
    try {
      url = normalizeSourceUrl(r.url);
    } catch (e) {
      skip(`${label}: ${(e as Error).message}`);
      continue;
    }
    const kind = (r.kind ?? "").trim();
    if (kind && !KINDS.has(kind)) {
      skip(`${label}: unknown source kind "${kind}"`);
      continue;
    }
    const bool = (v: string | undefined) => (v === "true" ? true : v === "false" ? false : null);
    srcById.set(r.id.trim(), {
      title: r.title,
      url,
      publisher: r.publisher || null,
      publishedOn: normalizeDate(r.published_date ?? ""),
      kind: kind || null,
      isOfficial: bool(r.is_official),
      isPrimary: bool(r.is_primary),
    });
  }

  /** 'S1|Schedule of grants p.42;S2' → refs with optional per-citation notes. */
  const parseSourceRefs = (
    raw: string,
    label: string,
  ): Array<{ src: Src; note: string | null }> | null => {
    const parts = (raw ?? "").split(";").map((x) => x.trim()).filter(Boolean);
    if (parts.length === 0) {
      skip(`${label}: at least one source is required`);
      return null;
    }
    const out: Array<{ src: Src; note: string | null }> = [];
    for (const part of parts) {
      const pipe = part.indexOf("|");
      const id = (pipe === -1 ? part : part.slice(0, pipe)).trim();
      const note = pipe === -1 ? null : part.slice(pipe + 1).trim() || null;
      const src = srcById.get(id);
      if (!src) {
        skip(`${label}: unknown source ref "${id}"`);
        return null;
      }
      out.push({ src, note });
    }
    return out;
  };

  const sourceIdByUrl = new Map<string, string>();
  const upsertSource = async (s: Src): Promise<string> => {
    const hit = sourceIdByUrl.get(s.url);
    if (hit) return hit;
    const inserted = await db
      .insert(schema.sources)
      .values({
        id: uuidv7(),
        title: s.title,
        url: s.url,
        publisher: s.publisher,
        publishedOn: s.publishedOn,
        accessedOn: today,
        kind: (s.kind as (typeof schema.sourceKindEnum.enumValues)[number]) ?? null,
        isOfficial: s.isOfficial,
        isPrimary: s.isPrimary,
      })
      .onConflictDoNothing({ target: schema.sources.url })
      .returning({ id: schema.sources.id });
    let id = inserted[0]?.id;
    if (!id) {
      const [existing] = await db
        .select({ id: schema.sources.id })
        .from(schema.sources)
        .where(eq(schema.sources.url, s.url));
      id = existing.id;
    }
    sourceIdByUrl.set(s.url, id);
    return id;
  };

  const cite = async (
    subjectType: (typeof schema.citationSubjectEnum.enumValues)[number],
    subjectId: string,
    refs: Array<{ src: Src; note: string | null }>,
  ) => {
    for (const ref of refs) {
      const sourceId = await upsertSource(ref.src);
      await db
        .insert(schema.citations)
        .values({ subjectType, subjectId, sourceId, note: ref.note })
        .onConflictDoNothing();
    }
  };

  /** The one evidence gate: bulk statuses only, and 'verified' needs a filing. */
  const evidenceStatus = (
    raw: string,
    refs: Array<{ src: Src; note: string | null }>,
    label: string,
  ): "verified" | "documented" | null => {
    const status = (raw ?? "").trim() || "documented";
    if (!validBulkEvidenceStatus(status)) {
      skip(
        `${label}: evidence status "${status}" cannot be bulk-loaded; ` +
          `alleged/inferred/disputed are claims and carry an asserter or rationale`,
      );
      return null;
    }
    const gate = verifiedStatusAllowed(status, refs.map((r) => r.src.kind as never));
    if (!gate.ok) {
      skip(`${label}: ${gate.reason}`);
      return null;
    }
    return status;
  };

  // --- orgs ------------------------------------------------------------------
  // slug,name,kind,legal_name,registration_number,registration_type,
  // incorporated_on,dissolved_on,state,city,website,summary,parent,sources
  const ORG_KINDS = new Set(schema.orgKindEnum.enumValues as readonly string[]);
  const orgIdBySlug = new Map<string, string>();
  for (const row of await db.select({ id: schema.orgs.id, slug: schema.orgs.slug }).from(schema.orgs)) {
    orgIdBySlug.set(row.slug, row.id);
  }
  const parentLinks: Array<{ slug: string; parent: string }> = [];

  for (const r of readSheet("funding_orgs.csv")) {
    const label = `org ${r.slug}`;
    const ref = parseRef(r.slug ?? "");
    if ("error" in ref || ref.type !== "org") {
      skip(`${label}: ${"error" in ref ? ref.error : "not an org slug"}`);
      continue;
    }
    const existingId = orgIdBySlug.get(ref.slug);
    if (existingId) {
      // Null-only enrichment. A later batch often knows more about a body an
      // earlier one only named in passing; fields that are EMPTY take the new
      // value and its citations, and nothing recorded is ever overwritten.
      // Name, kind and summary never change here: correcting those is a
      // deliberate act, not a side effect of loading a sheet.
      const refs = parseSourceRefs(r.sources, label);
      if (!refs) continue;
      const [cur] = await db.select().from(schema.orgs).where(eq(schema.orgs.id, existingId));
      const inc = readDate(r.incorporated_on, label, "incorporated_on");
      const dis = readDate(r.dissolved_on, label, "dissolved_on");
      if (inc === AMBIGUOUS || dis === AMBIGUOUS) continue;
      const stateId = resolveState(r.state ?? "");
      if (stateId === undefined) {
        skip(`${label}: unknown state "${r.state}"`);
        continue;
      }
      // A sheet row may also REVISE what is recorded, but only by saying why.
      // The reason is stored with the record and shown on its page, so an
      // improvement to a thin first description is possible and a silent
      // rewrite is not. Without a reason the block below runs unchanged and
      // fills empty fields only.
      const reason = r.revise?.trim();
      const revision: Partial<typeof cur> = {};
      if (reason) {
        if (r.name?.trim() && r.name.trim() !== cur.name) revision.name = r.name.trim();
        if (r.kind?.trim() && r.kind.trim() !== cur.kind) {
          if (!ORG_KINDS.has(r.kind.trim())) {
            skip(`${label}: unknown org kind "${r.kind}"`);
            continue;
          }
          revision.kind = r.kind.trim() as typeof cur.kind;
        }
        if (r.summary?.trim() && r.summary.trim() !== cur.summary)
          revision.summary = r.summary.trim();
        if (Object.keys(revision).length === 0) {
          skip(`${label}: marked as a revision but changes nothing`);
        } else {
          revision.revisedOn = today;
          revision.revisionNote = reason;
        }
      }

      const fill: Partial<typeof cur> = {};
      if (!cur.legalName && r.legal_name?.trim()) fill.legalName = r.legal_name.trim();
      if (!cur.registrationNumber && r.registration_number?.trim())
        fill.registrationNumber = r.registration_number.trim();
      if (!cur.registrationType && r.registration_type?.trim())
        fill.registrationType = r.registration_type.trim();
      if (!cur.incorporatedOn && inc) fill.incorporatedOn = inc;
      if (!cur.dissolvedOn && dis) fill.dissolvedOn = dis;
      if (!cur.stateId && stateId) fill.stateId = stateId;
      if (!cur.city && r.city?.trim()) fill.city = r.city.trim();
      if (!cur.website && r.website?.trim()) fill.website = r.website.trim();
      const change = { ...fill, ...revision };
      if (Object.keys(change).length > 0) {
        await db.update(schema.orgs).set(change).where(eq(schema.orgs.id, existingId));
        if (Object.keys(revision).length > 0) bump("orgs_revised");
        if (Object.keys(fill).length > 0) bump("orgs_enriched");
      } else if (!reason) {
        skip(`${label}: already exists and nothing new to fill`);
      }
      await cite("org", existingId, refs);
      if (!cur.parentOrgId && r.parent?.trim())
        parentLinks.push({ slug: ref.slug, parent: r.parent.trim().toLowerCase() });
      continue;
    }
    if (!r.name?.trim()) {
      skip(`${label}: name is required`);
      continue;
    }
    if (!ORG_KINDS.has(r.kind ?? "")) {
      skip(`${label}: unknown org kind "${r.kind}"`);
      continue;
    }
    const stateId = resolveState(r.state ?? "");
    if (stateId === undefined) {
      skip(`${label}: unknown state "${r.state}"`);
      continue;
    }
    const refs = parseSourceRefs(r.sources, label);
    if (!refs) continue;
    const inc = normalizeDate(r.incorporated_on ?? "");
    const dis = normalizeDate(r.dissolved_on ?? "");
    if (!datesOrdered(inc, dis)) {
      skip(`${label}: dissolved before incorporated`);
      continue;
    }

    const id = uuidv7();
    await db.insert(schema.orgs).values({
      id,
      slug: ref.slug,
      name: r.name.trim(),
      kind: r.kind as (typeof schema.orgKindEnum.enumValues)[number],
      legalName: r.legal_name?.trim() || null,
      registrationNumber: r.registration_number?.trim() || null,
      registrationType: r.registration_type?.trim() || null,
      incorporatedOn: inc,
      dissolvedOn: dis,
      stateId,
      city: r.city?.trim() || null,
      website: r.website?.trim() || null,
      summary: r.summary?.trim() || null,
      enteredOn: today,
    });
    await cite("org", id, refs);
    orgIdBySlug.set(ref.slug, id);
    if (r.parent?.trim()) parentLinks.push({ slug: ref.slug, parent: r.parent.trim().toLowerCase() });
    bump("orgs");
  }

  // Parent links resolve after every org in the batch exists, so a parent may
  // appear later in the sheet than its subsidiary.
  for (const link of parentLinks) {
    const child = orgIdBySlug.get(link.slug);
    const parent = orgIdBySlug.get(link.parent);
    if (!child) continue;
    if (!parent) {
      skip(`org ${link.slug}: parent "${link.parent}" not found; link not recorded`);
      continue;
    }
    await db.update(schema.orgs).set({ parentOrgId: parent }).where(eq(schema.orgs.id, child));
  }

  // --- people ----------------------------------------------------------------
  // slug,name,public_role_basis,birth_year,state,summary,sources
  const personIdBySlug = new Map<string, string>();
  for (const row of await db
    .select({ id: schema.people.id, slug: schema.people.slug })
    .from(schema.people)) {
    personIdBySlug.set(row.slug, row.id);
  }

  for (const r of readSheet("funding_people.csv")) {
    const label = `person ${r.slug}`;
    const ref = parseRef(`person:${r.slug ?? ""}`);
    if ("error" in ref || ref.type !== "person") {
      skip(`${label}: ${"error" in ref ? ref.error : "bad slug"}`);
      continue;
    }
    if (personIdBySlug.has(ref.slug)) {
      skip(`${label}: already exists (rows are never updated in place)`);
      continue;
    }
    if (!r.name?.trim()) {
      skip(`${label}: name is required`);
      continue;
    }
    // The one field that keeps this table honest: why is this person in a
    // public archive at all?
    if ((r.public_role_basis?.trim().length ?? 0) < 15) {
      skip(`${label}: public_role_basis is required (why is this person in a public archive?)`);
      continue;
    }
    const stateId = resolveState(r.state ?? "");
    if (stateId === undefined) {
      skip(`${label}: unknown state "${r.state}"`);
      continue;
    }
    const refs = parseSourceRefs(r.sources, label);
    if (!refs) continue;

    const id = uuidv7();
    await db.insert(schema.people).values({
      id,
      slug: ref.slug,
      name: r.name.trim(),
      publicRoleBasis: r.public_role_basis.trim(),
      birthYear: r.birth_year?.trim() ? Number(r.birth_year) : null,
      stateId,
      summary: r.summary?.trim() || null,
      enteredOn: today,
    });
    await cite("person_record", id, refs);
    personIdBySlug.set(ref.slug, id);
    bump("people");
  }

  /** Resolve a sheet reference to a stored entity, in batch or database. */
  const resolveEntity = (
    raw: string,
    label: string,
  ): { type: string; id: string } | null => {
    const ref = parseRef(raw ?? "");
    if ("error" in ref) {
      skip(`${label}: ${ref.error}`);
      return null;
    }
    if (ref.type === "org") {
      const id = orgIdBySlug.get(ref.slug);
      if (!id) {
        skip(`${label}: org "${ref.slug}" not found (load it via funding_orgs.csv first)`);
        return null;
      }
      return { type: "org", id };
    }
    if (ref.type === "person") {
      const id = personIdBySlug.get(ref.slug);
      if (!id) {
        skip(`${label}: person "${ref.slug}" not found (load via funding_people.csv first)`);
        return null;
      }
      return { type: "person", id };
    }
    // Parties and states use their public ids directly.
    return { type: ref.type, id: ref.id };
  };

  // --- funding transactions --------------------------------------------------
  // donor,recipient,amount,currency,financial_year,date,funding_type,
  // stated_purpose,programme,donor_country,reported_under_fcra,evidence_status,notes,sources
  const FUNDING_TYPES = new Set(schema.fundingTypeEnum.enumValues as readonly string[]);
  // The key carries every distinguishing field the sheet can hold. The first
  // real batch was four grants from one donor to one recipient, all the same
  // amount, distinguished only by their stated purposes and award years: a
  // key of donor|recipient|fy|amount refused three real grants as duplicates.
  const existingTx = new Set(
    (
      await db.execute(
        sql`SELECT donor_id || '|' || recipient_id || '|' || COALESCE(financial_year,'') || '|' || COALESCE(occurred_on::text,'') || '|' || COALESCE(amount::text,'') || '|' || COALESCE(stated_purpose,'') AS k FROM funding_transactions`,
      )
    ).rows.map((r) => String((r as { k: string }).k)),
  );

  for (const r of readSheet("funding_transactions.csv")) {
    const label = `funding ${r.donor} -> ${r.recipient} (${r.financial_year || r.date || "undated"})`;
    const donor = resolveEntity(r.donor, label);
    if (!donor) continue;
    const recipient = resolveEntity(r.recipient, label);
    if (!recipient) continue;
    if (r.amount?.trim() && !validAmount(r.amount)) {
      skip(`${label}: amount "${r.amount}" is not a plain non-negative number`);
      continue;
    }
    if (r.amount?.trim() && !r.currency?.trim()) {
      skip(`${label}: an amount needs its currency`);
      continue;
    }
    if (r.currency?.trim() && !validCurrency(r.currency)) {
      skip(`${label}: currency "${r.currency}" is not an ISO code like INR`);
      continue;
    }
    if (r.financial_year?.trim() && !validFinancialYear(r.financial_year)) {
      skip(`${label}: financial year must look like 2022-23`);
      continue;
    }
    const fundingType = (r.funding_type ?? "").trim() || "grant";
    if (!FUNDING_TYPES.has(fundingType)) {
      skip(`${label}: unknown funding type "${fundingType}"`);
      continue;
    }
    if (r.donor_country?.trim() && !/^[A-Z]{2}$/.test(r.donor_country.trim())) {
      skip(`${label}: donor country must be a two-letter ISO code`);
      continue;
    }
    const refs = parseSourceRefs(r.sources, label);
    if (!refs) continue;
    const status = evidenceStatus(r.evidence_status, refs, label);
    if (!status) continue;

    const amount = r.amount?.trim() ? Number(r.amount).toFixed(2) : null;
    const occurred = readDate(r.date, label, "date");
    if (occurred === "__ambiguous__") continue;
    const key = `${donor.id}|${recipient.id}|${r.financial_year?.trim() ?? ""}|${occurred ?? ""}|${amount ?? ""}|${r.stated_purpose?.trim() ?? ""}`;
    if (existingTx.has(key)) {
      skip(`${label}: an identical transaction already exists`);
      continue;
    }

    const id = uuidv7();
    await db.insert(schema.fundingTransactions).values({
      id,
      donorType: donor.type as "org",
      donorId: donor.id,
      recipientType: recipient.type as "org",
      recipientId: recipient.id,
      amount,
      currency: r.currency?.trim() || null,
      financialYear: r.financial_year?.trim() || null,
      occurredOn: occurred,
      fundingType: fundingType as "grant",
      statedPurpose: r.stated_purpose?.trim() || null,
      programme: r.programme?.trim() || null,
      donorCountry: r.donor_country?.trim() || null,
      reportedUnderFcra:
        r.reported_under_fcra === "true" ? true : r.reported_under_fcra === "false" ? false : null,
      evidenceStatus: status,
      notes: r.notes?.trim() || null,
      retrievedOn: today,
      enteredOn: today,
    });
    await cite("funding_transaction", id, refs);
    existingTx.add(key);
    bump("funding_transactions");
  }

  // --- board positions -------------------------------------------------------
  // person,org,role,role_kind,start_date,end_date,evidence_status,sources
  const ROLE_KINDS = new Set(schema.boardRoleKindEnum.enumValues as readonly string[]);
  const existingBoard = new Set(
    (
      await db.execute(
        sql`SELECT person_id::text || '|' || org_id::text || '|' || role || '|' || COALESCE(start_on::text,'') AS k FROM board_positions`,
      )
    ).rows.map((r) => String((r as { k: string }).k)),
  );

  for (const r of readSheet("funding_board.csv")) {
    const label = `board ${r.person} at ${r.org}`;
    const personId = personIdBySlug.get(r.person?.trim().toLowerCase() ?? "");
    if (!personId) {
      skip(`${label}: person "${r.person}" not found`);
      continue;
    }
    const orgId = orgIdBySlug.get(r.org?.trim().toLowerCase() ?? "");
    if (!orgId) {
      skip(`${label}: org "${r.org}" not found`);
      continue;
    }
    if (!r.role?.trim()) {
      skip(`${label}: role (as the source words it) is required`);
      continue;
    }
    const roleKind = (r.role_kind ?? "").trim() || "board_member";
    if (!ROLE_KINDS.has(roleKind)) {
      skip(`${label}: unknown role kind "${roleKind}"`);
      continue;
    }
    const start = readDate(r.start_date, label, "start_date");
    const end = readDate(r.end_date, label, "end_date");
    if (start === "__ambiguous__" || end === "__ambiguous__") continue;
    if (!datesOrdered(start, end)) {
      skip(`${label}: end date before start date`);
      continue;
    }
    const refs = parseSourceRefs(r.sources, label);
    if (!refs) continue;
    const status = evidenceStatus(r.evidence_status, refs, label);
    if (!status) continue;

    const key = `${personId}|${orgId}|${r.role.trim()}|${start ?? ""}`;
    if (existingBoard.has(key)) {
      skip(`${label}: this position is already recorded`);
      continue;
    }

    const id = uuidv7();
    await db.insert(schema.boardPositions).values({
      id,
      personId,
      orgId,
      role: r.role.trim(),
      roleKind: roleKind as "board_member",
      startOn: start,
      endOn: end,
      evidenceStatus: status,
      retrievedOn: today,
    });
    await cite("board_position", id, refs);
    existingBoard.add(key);
    bump("board_positions");
  }

  // --- relationships ---------------------------------------------------------
  // kind,from,to,start_date,end_date,detail,amount,currency,evidence_status,sources
  const REL_KINDS = new Set(schema.relationKindEnum.enumValues as readonly string[]);
  const existingRel = new Set(
    (
      await db.execute(
        sql`SELECT kind::text || '|' || from_type::text || ':' || from_id || '|' || to_type::text || ':' || to_id || '|' || COALESCE(start_on::text,'') AS k FROM relationships`,
      )
    ).rows.map((r) => String((r as { k: string }).k)),
  );

  for (const r of readSheet("funding_relationships.csv")) {
    const label = `relationship ${r.from} ${r.kind} ${r.to}`;
    if (!REL_KINDS.has(r.kind ?? "")) {
      // The refusal that matters most in this file. coordinated_with,
      // controlled_by and their kin have no enum value, so they land here.
      skip(
        `${label}: "${r.kind}" is not a recordable relationship` +
          (/(coordinat|control|influence|behalf)/i.test(r.kind ?? "")
            ? " (that is a claim; it needs an asserter, and bulk sheets cannot carry one)"
            : ""),
      );
      continue;
    }
    const from = resolveEntity(r.from, label);
    if (!from) continue;
    const to = resolveEntity(r.to, label);
    if (!to) continue;
    const start = readDate(r.start_date, label, "start_date");
    const end = readDate(r.end_date, label, "end_date");
    if (start === "__ambiguous__" || end === "__ambiguous__") continue;
    if (!datesOrdered(start, end)) {
      skip(`${label}: end date before start date`);
      continue;
    }
    if (r.amount?.trim() && (!validAmount(r.amount) || !validCurrency(r.currency ?? ""))) {
      skip(`${label}: an amount needs to be a plain number with an ISO currency`);
      continue;
    }
    const refs = parseSourceRefs(r.sources, label);
    if (!refs) continue;
    const status = evidenceStatus(r.evidence_status, refs, label);
    if (!status) continue;

    const key = `${r.kind}|${from.type}:${from.id}|${to.type}:${to.id}|${start ?? ""}`;
    if (existingRel.has(key)) {
      skip(`${label}: already recorded`);
      continue;
    }

    const id = uuidv7();
    await db.insert(schema.relationships).values({
      id,
      kind: r.kind as "funded",
      fromType: from.type as "org",
      fromId: from.id,
      toType: to.type as "org",
      toId: to.id,
      startOn: start,
      endOn: end,
      detail: r.detail?.trim() || null,
      amount: r.amount?.trim() ? Number(r.amount).toFixed(2) : null,
      currency: r.currency?.trim() || null,
      evidenceStatus: status,
      retrievedOn: today,
      enteredOn: today,
    });
    await cite("relationship", id, refs);
    existingRel.add(key);
    bump("relationships");
  }

  // --- outcomes --------------------------------------------------------------
  // subject,kind,date,summary,evidence_status,sources
  // What happened, attached to the thing it happened to: a registration
  // cancelled under a state Act, a court ruling, a regulatory action. Never
  // attached to whoever is said to have caused it; that is a claim.
  const OUTCOME_KINDS = new Set(schema.outcomeKindEnum.enumValues as readonly string[]);
  const existingOutcomes = new Set(
    (
      await db.execute(
        sql`SELECT subject_type::text || ':' || subject_id || '|' || kind::text || '|' || COALESCE(occurred_on::text,'') AS k FROM outcomes`,
      )
    ).rows.map((r) => String((r as { k: string }).k)),
  );

  for (const r of readSheet("funding_outcomes.csv")) {
    const label = `outcome ${r.kind} for ${r.subject}`;
    const subject = resolveEntity(r.subject, label);
    if (!subject) continue;
    if (!OUTCOME_KINDS.has(r.kind ?? "")) {
      skip(`${label}: unknown outcome kind "${r.kind}"`);
      continue;
    }
    if ((r.summary?.trim().length ?? 0) < 20) {
      skip(`${label}: a summary stating what happened is required`);
      continue;
    }
    const occurred = readDate(r.date, label, "date");
    if (occurred === "__ambiguous__") continue;
    const refs = parseSourceRefs(r.sources, label);
    if (!refs) continue;
    const status = evidenceStatus(r.evidence_status, refs, label);
    if (!status) continue;

    const key = `${subject.type}:${subject.id}|${r.kind}|${occurred ?? ""}`;
    if (existingOutcomes.has(key)) {
      skip(`${label}: already recorded`);
      continue;
    }

    const id = uuidv7();
    await db.insert(schema.outcomes).values({
      id,
      subjectType: subject.type as "org",
      subjectId: subject.id,
      kind: r.kind as "regulatory_action",
      occurredOn: occurred,
      summary: r.summary.trim(),
      evidenceStatus: status,
    });
    await cite("outcome", id, refs);
    existingOutcomes.add(key);
    bump("outcomes");
  }

  // --- FCRA ------------------------------------------------------------------
  // org,registration_number,status,granted_on,valid_until,action_on,action_kind,action_note,sources
  const FCRA_STATUS = new Set(schema.fcraStatusEnum.enumValues as readonly string[]);
  for (const r of readSheet("funding_fcra.csv")) {
    const label = `fcra ${r.org}`;
    const orgId = orgIdBySlug.get(r.org?.trim().toLowerCase() ?? "");
    if (!orgId) {
      skip(`${label}: org "${r.org}" not found`);
      continue;
    }
    const status = (r.status ?? "").trim() || "unknown";
    if (!FCRA_STATUS.has(status)) {
      skip(`${label}: unknown FCRA status "${status}"`);
      continue;
    }
    const refs = parseSourceRefs(r.sources, label);
    if (!refs) continue;
    // The schema column defaults to 'verified', which is exactly the wrong
    // default for a bulk row: gate it like every other sheet.
    const evStatus = evidenceStatus(r.evidence_status, refs, label);
    if (!evStatus) continue;

    // A registration row is keyed by its number; an action row recorded
    // without one (a watch-list placement known only from reporting) is keyed
    // by the action itself, or a re-run would insert it again.
    const regNo = r.registration_number?.trim() || null;
    const grantedOn = readDate(r.granted_on, label, "granted_on");
    const validUntil = readDate(r.valid_until, label, "valid_until");
    const actionOn = readDate(r.action_on, label, "action_on");
    if (grantedOn === "__ambiguous__" || validUntil === "__ambiguous__" || actionOn === "__ambiguous__") continue;
    const dupRows = await db
      .select({
        id: schema.fcraRegistrations.id,
        registrationNumber: schema.fcraRegistrations.registrationNumber,
        actionOn: schema.fcraRegistrations.actionOn,
        actionKind: schema.fcraRegistrations.actionKind,
      })
      .from(schema.fcraRegistrations)
      .where(eq(schema.fcraRegistrations.orgId, orgId));
    const dup = dupRows.some((d) =>
      regNo
        ? d.registrationNumber === regNo
        : d.actionOn === actionOn && d.actionKind === (r.action_kind?.trim() || null),
    );
    if (dup) {
      skip(`${label}: already recorded`);
      continue;
    }

    const id = uuidv7();
    await db.insert(schema.fcraRegistrations).values({
      id,
      orgId,
      registrationNumber: regNo,
      status: status as "active",
      evidenceStatus: evStatus,
      grantedOn,
      validUntil,
      actionOn,
      actionKind: r.action_kind?.trim() || null,
      actionNote: r.action_note?.trim() || null,
      retrievedOn: today,
    });
    await cite("fcra_registration", id, refs);
    bump("fcra_registrations");
  }

  // --- possible matches -------------------------------------------------------
  // a,b,rationale
  // Two recorded entities that might be one body. Recording the question is
  // the whole point: there is no merge, and confirming or rejecting is a
  // reviewer's act, never a sheet's. Both sides must already be recorded;
  // a match against a body the archive does not hold is a summary's job.
  const existingMatches = new Set(
    (
      await db.execute(
        sql`SELECT entity_type::text || '|' || least(a_id, b_id) || '|' || greatest(a_id, b_id) AS k FROM entity_match_candidates`,
      )
    ).rows.map((r) => String((r as { k: string }).k)),
  );

  for (const r of readSheet("funding_matches.csv")) {
    const label = `match ${r.a} ~ ${r.b}`;
    const a = resolveEntity(r.a, label);
    if (!a) continue;
    const b = resolveEntity(r.b, label);
    if (!b) continue;
    if (a.type !== b.type || (a.type !== "org" && a.type !== "person")) {
      skip(`${label}: a match candidate pairs two orgs or two people`);
      continue;
    }
    if (a.id === b.id) {
      skip(`${label}: the two sides are the same record`);
      continue;
    }
    if ((r.rationale?.trim().length ?? 0) < 20) {
      skip(`${label}: a rationale saying why these might be one body is required`);
      continue;
    }
    const key = `${a.type}|${[a.id, b.id].sort()[0]}|${[a.id, b.id].sort()[1]}`;
    if (existingMatches.has(key)) {
      skip(`${label}: already recorded`);
      continue;
    }
    await db.insert(schema.entityMatchCandidates).values({
      id: uuidv7(),
      entityType: a.type as "org",
      aId: a.id,
      bId: b.id,
      status: "possible",
      rationale: r.rationale.trim(),
    });
    existingMatches.add(key);
    bump("match_candidates");
  }

  // --- report ----------------------------------------------------------------
  const citedUrls = new Set(sourceIdByUrl.keys());
  const unused = [...srcById.entries()].filter(([, s]) => !citedUrls.has(s.url)).map(([id]) => id);
  if (unused.length) {
    console.log(`[load-funding] note: source ids cited by no row (not inserted): ${unused.join(", ")}`);
  }
  console.log("[load-funding] created:", JSON.stringify(report.created));
  if (report.skipped.length) {
    console.log(`[load-funding] skipped ${report.skipped.length}:`);
    for (const s of report.skipped) console.log("  - " + s);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[load-funding] FATAL:", e);
  process.exit(1);
});
