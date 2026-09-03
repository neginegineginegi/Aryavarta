import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

// 'union' is the single pseudo-entity row ('in' = India) that lets union-level
// offices and Lok Sabha elections ride the exact same tables, revision flow,
// and moderation machinery as states.
export const stateKindEnum = pgEnum("state_kind", ["state", "union_territory", "union"]);

// 'pm' and 'president' are only valid on the 'in' union row (enforced in
// payload validation); cm/presidents_rule/governor only on states.
export const termKindEnum = pgEnum("term_kind", [
  "cm",
  "presidents_rule",
  "pm",
  "president",
  "governor",
]);

export const eventTypeEnum = pgEnum("event_type", [
  "paper_leak",
  "governance_failure",
  "corruption",
  "policy_failure",
  "communal_incident",
  "infrastructure_failure",
  // Political-context taxonomy (additive; values below were appended after
  // launch, so keep them AFTER the original seven and never reorder).
  "cabinet_change",
  "legislation",
  "constitutional_amendment",
  "court_judgment",
  "coalition_change",
  "welfare_scheme",
  "infrastructure_project",
  "natural_disaster",
  "administrative_reform",
  "international_agreement",
  "other",
]);

export const eventStatusEnum = pgEnum("event_status", [
  "draft",
  "pending_review",
  "published",
  "rejected",
  "disputed",
]);

export const userRoleEnum = pgEnum("user_role", ["contributor", "moderator", "admin"]);

export const revisionEntityEnum = pgEnum("revision_entity", [
  "term",
  "election",
  "event",
  "manifesto_promise",
  // Funding and Influence layer. Everything in that layer goes through the
  // same propose/diff/approve path as the political record: nothing reaches
  // the public archive without a moderator, least of all a funding figure.
  "org",
  "person_record",
  "funding_transaction",
  "fcra_registration",
  "board_position",
  "relationship",
  "claim",
  "campaign",
  "project_record",
  "publication",
  "legal_case",
  "outcome",
  "open_question",
]);

export const revisionActionEnum = pgEnum("revision_action", ["create", "update", "delete"]);

export const revisionStatusEnum = pgEnum("revision_status", [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
]);

export const reportKindEnum = pgEnum("report_kind", ["issue", "dispute"]);

export const reportStatusEnum = pgEnum("report_status", ["open", "resolved", "dismissed"]);

// Where a revision came from: community contribution, or the reference-data
// import pipeline (Wikidata/ECI pre-filled drafts, always moderator-verified
// before publication — imported data is never the source of truth).
export const revisionOriginEnum = pgEnum("revision_origin", ["community", "import"]);

export const electionScopeEnum = pgEnum("election_scope", ["state_assembly", "lok_sabha"]);

// --- Accountability layer, phase 2: the media archive ----------------------

// Every artefact class the archive stores. A manifesto is a document with a
// type, not a table of its own, so the whole corpus shares one search index,
// one browse surface and one citation path.
export const documentTypeEnum = pgEnum("document_type", [
  "manifesto",
  "press_conference",
  "party_advertisement",
  "campaign_speech",
  "debate_transcript",
  "election_symbol",
  "candidate_affidavit",
  "press_release",
  "government_notification",
  "gazette",
  "cag_report",
  "assembly_debate",
  "parliamentary_debate",
  "court_judgment",
  "eci_order",
  "delimitation_report",
  "coalition_agreement",
  "white_paper",
  "budget_speech",
  "economic_survey",
  "five_year_plan",
  "committee_report",
  "other",
]);

// Whether the archive may serve its own copy. Official URLs rot, so a copy is
// how a document survives; but not everything is ours to redistribute, so the
// default is to link out until someone has checked.
export const redistributionEnum = pgEnum("redistribution", [
  "permitted",
  "link_only",
  "unknown",
]);

export const ocrStatusEnum = pgEnum("ocr_status", ["none", "pending", "done", "failed"]);

// --- Accountability layer, phase 3: manifesto promises ---------------------

// The policy areas a promise falls under. Fixed list so promises stay
// comparable across parties and years; 'other' absorbs the rest rather than
// letting the list grow per manifesto.
export const promiseCategoryEnum = pgEnum("promise_category", [
  "education",
  "healthcare",
  "employment",
  "agriculture",
  "infrastructure",
  "women",
  "youth",
  "economy",
  "law_and_order",
  "environment",
  "digital",
  "social_welfare",
  "other",
]);

// How far a promise reaches. Recorded as the manifesto states it, never
// inferred from the party's size or the election's scope.
export const promiseScopeEnum = pgEnum("promise_scope", [
  "national",
  "state",
  "district",
  "constituency",
  "unspecified",
]);

// --- Accountability layer, phase 1 -----------------------------------------

// What a citation can point at. Every citable entity is listed here, so a new
// one costs an enum value rather than a new join table.
export const citationSubjectEnum = pgEnum("citation_subject", [
  "term",
  "election",
  "event",
  "indicator_value",
  // The definition, not just the measurement. A definition has sources like
  // anything else here, and an unsourced one is the same unsupported assertion
  // the archive refuses everywhere else.
  "indicator",
  "document",
  "manifesto_promise",
  "promise_status_claim",
  "promise_timeline_step",
  "entity_link",
  // Funding and Influence layer.
  "org",
  "person_record",
  "funding_transaction",
  "fcra_registration",
  "board_position",
  "relationship",
  "claim",
  "claim_response",
  "campaign",
  "campaign_participant",
  "campaign_target",
  "legal_case_party",
  "project_record",
  "publication",
  "legal_case",
  "outcome",
  "entity_alias",
  // 2026-09-03: bulk ingests create party and state reference rows and the
  // Rajya Sabha spine; provenance must reach them or reversal-by-dataset
  // cannot (docs/PRODUCTION_RUNBOOK.md).
  "party",
  "state",
  "rs_member",
  "rs_term",
  // An open question a bulk ingest records is that dataset's row like any
  // other: provenance must reach it or reversal-by-dataset leaves orphaned
  // questions behind (found by the stage-2 revert smoke test, 2026-09-03).
  "open_question",
]);

// What kind of artefact a source is. Factual classification, not a quality
// rating: the archive does not score its sources.
export const sourceKindEnum = pgEnum("source_kind", [
  "gazette",
  "eci_report",
  "cag_report",
  "court_judgment",
  "assembly_record",
  "budget_document",
  "ministry_report",
  "press_release",
  "manifesto",
  "news",
  "research",
  "rti_response",
  // Funding and Influence layer. Ordering lives in
  // src/lib/funding/source-rank.ts, not here: this enum classifies, it does
  // not rank, and the rank has to be revisable without a migration.
  "fcra_filing",
  "regulatory_filing",
  "corporate_filing",
  "audited_statement",
  "annual_report",
  "grant_database",
  "org_document",
  "org_statement",
  "parliamentary_record",
  "social_media",
  "other",
]);

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

// Seeded from @svg-maps/india location ids, plus 'la' (Ladakh) which has no
// geometry in the map package (its paths predate the 2019 reorganisation).
export const states = pgTable("states", {
  id: text("id").primaryKey(), // 'tg', 'ap', 'up', ... — matches svg map ids
  name: text("name").notNull(),
  kind: stateKindEnum("kind").notNull(),
  formedOn: date("formed_on"),
  dissolvedOn: date("dissolved_on"), // e.g. 'dd'/'dn' after the 2020 merger
  hasGeometry: boolean("has_geometry").notNull().default(true),
});

// Curated lookup table managed by moderators/admins directly, not
// revision-managed in v1: routing party edits through revisions would deadlock
// election submissions on missing parties.
export const parties = pgTable(
  "parties",
  {
    id: text("id").primaryKey(), // slug, e.g. 'ind'; demo seed uses 'demo-a' etc.
    name: text("name").notNull().unique(),
    abbreviation: text("abbreviation"),
    color: text("color").notNull().default("#8a8a8a"), // hex; drives map fill + legend
    isPseudo: boolean("is_pseudo").notNull().default(false), // 'ind' Independent, 'oth' Others
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(abbreviation, ''))`,
    ),
  },
  (t) => [index("parties_search_idx").using("gin", t.searchTsv)],
);

// ---------------------------------------------------------------------------
// Development Lens: sourced factual indicators, never scores.
//
// Curated like `parties` (admin-managed, not revision-managed): values arrive
// in bulk from statistical publications, and each row carries its own source,
// reporting period, and verification date, which is the trust surface. The
// UI presents series neutrally and never ranks or grades governments.
// ---------------------------------------------------------------------------

export const indicators = pgTable("indicators", {
  id: text("id").primaryKey(), // slug, e.g. 'literacy-rate'
  name: text("name").notNull().unique(), // 'Literacy rate'
  unit: text("unit").notNull(), // '%', '₹ crore', 'per 1,000 people'
  category: text("category").notNull(), // 'Economy', 'Education', 'Health', ...
  methodology: text("methodology").notNull(), // how the number is defined/collected
  displayOrder: smallint("display_order").notNull().default(100),
});

export const indicatorValues = pgTable(
  "indicator_values",
  {
    id: uuid("id").primaryKey(), // UUIDv7, generated app-side
    indicatorId: text("indicator_id")
      .notNull()
      .references(() => indicators.id),
    stateId: text("state_id")
      .notNull()
      .references(() => states.id),
    year: smallint("year").notNull(), // reporting year the value describes
    value: numeric("value").notNull(),
    // Trust surface: every value names where it came from.
    sourceTitle: text("source_title").notNull(),
    sourceUrl: text("source_url").notNull(),
    reportingPeriod: text("reporting_period"), // e.g. 'FY 2021-22', 'Census 2011'
    reportingOrg: text("reporting_org"), // e.g. 'NSO', 'RBI', 'NCRB'
    notes: text("notes"), // caveats: series breaks, definition changes
    verifiedOn: date("verified_on").notNull(), // when an admin last checked it
  },
  (t) => [
    uniqueIndex("indicator_values_series_idx").on(t.indicatorId, t.stateId, t.year),
    index("indicator_values_state_idx").on(t.stateId),
  ],
);

// ---------------------------------------------------------------------------
// Live content
// ---------------------------------------------------------------------------

export const terms = pgTable(
  "terms",
  {
    id: uuid("id").primaryKey(), // UUIDv7, generated app-side
    stateId: text("state_id")
      .notNull()
      .references(() => states.id),
    kind: termKindEnum("kind").notNull().default("cm"),
    cmName: text("cm_name"), // NULL iff presidents_rule
    partyId: text("party_id").references(() => parties.id), // NULL iff presidents_rule
    startDate: date("start_date").notNull(),
    endDate: date("end_date"), // NULL = incumbent
    notes: text("notes"), // coalition details etc.
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(cm_name, ''))`,
    ),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete → tombstones
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("terms_state_start_idx").on(t.stateId, t.startDate),
    index("terms_search_idx").using("gin", t.searchTsv),
    check(
      "terms_pr_nulls",
      sql`kind <> 'presidents_rule' OR (cm_name IS NULL AND party_id IS NULL)`,
    ),
    check("terms_cm_fields", sql`kind <> 'cm' OR (cm_name IS NOT NULL AND party_id IS NOT NULL)`),
  ],
);

export const elections = pgTable(
  "elections",
  {
    id: uuid("id").primaryKey(),
    stateId: text("state_id")
      .notNull()
      .references(() => states.id),
    scope: electionScopeEnum("scope").notNull().default("state_assembly"),
    // Ordinal of the assembly this election constituted (e.g. 15 for the
    // 15th Rajasthan Legislative Assembly). Display metadata; nullable.
    assemblyNumber: integer("assembly_number"),
    electionDate: date("election_date").notNull(),
    // How much of election_date is real (ELECTIONS_INGEST_SPEC §2.5): TCPD
    // rows anchor a month or only a year; hand rows are actual dates ('day').
    // The formatter renders exactly the known part, never an invented 1st.
    electionDatePrecision: text("election_date_precision", { enum: ["day", "month", "year"] })
      .notNull()
      .default("day"),
    resultSummary: text("result_summary"),
    totalSeats: integer("total_seats"),
    turnoutPercent: numeric("turnout_percent", { precision: 5, scale: 2 }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("elections_state_date_idx").on(t.stateId, t.electionDate)],
);

// Normalized per-party seat counts.
export const electionResults = pgTable(
  "election_results",
  {
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id),
    seatsWon: integer("seats_won").notNull(),
    seatsContested: integer("seats_contested"),
    voteSharePercent: numeric("vote_share_percent", { precision: 5, scale: 2 }),
    // Pre-poll alliance label, e.g. 'NDA', 'UPA', 'Mahagathbandhan'. Display
    // metadata for coalition grouping in dashboards; nullable.
    allianceName: text("alliance_name"),
  },
  (t) => [primaryKey({ columns: [t.electionId, t.partyId] })],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey(),
    stateId: text("state_id")
      .notNull()
      .references(() => states.id),
    year: integer("year").notNull(),
    eventDate: date("event_date"), // when precisely known
    type: eventTypeEnum("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    // Rows are inserted at proposal time with 'pending_review'; public queries
    // filter to status = 'published' AND deleted_at IS NULL, so live/public
    // data is untouched until a moderator approves the paired revision.
    status: eventStatusEnum("status").notNull().default("pending_review"),
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B')`,
    ),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_state_year_idx").on(t.stateId, t.year),
    index("events_status_idx").on(t.status),
    index("events_search_idx").using("gin", t.searchTsv),
  ],
);

// ---------------------------------------------------------------------------
// Sources — deduped by normalized URL; join tables keep real FKs.
// Source rows are never deleted: revision history references them.
// ---------------------------------------------------------------------------

/**
 * The media archive: manifestos, gazettes, judgments, audit reports, budget
 * speeches, affidavits, debate transcripts, everything.
 *
 * Metadata is moderator-curated rather than revision-reviewed, like parties
 * and indicators: a title, publisher and date carry little editorial judgment,
 * and routing them through the queue would bury the contested claims that
 * genuinely need it. The archive states this publicly in its methodology.
 *
 * `fullText` holds extracted text where the file has a text layer; scans stay
 * at ocrStatus 'none' and are searchable by metadata only, which the UI says
 * plainly rather than implying full coverage.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey(),
    type: documentTypeEnum("type").notNull(),
    title: text("title").notNull(),
    publisher: text("publisher"), // party, ministry, ECI, court
    publishedOn: date("published_on"),
    datePrecision: text("date_precision"), // 'day' | 'month' | 'year'
    language: text("language").notNull().default("en"), // ISO 639-1
    officialUrl: text("official_url"), // the issuer's own copy
    archiveUrl: text("archive_url"), // our stored copy, when redistribution allows
    redistribution: redistributionEnum("redistribution").notNull().default("unknown"),
    checksum: text("checksum"), // integrity of the archived copy
    pageCount: integer("page_count"),
    ocrStatus: ocrStatusEnum("ocr_status").notNull().default("none"),
    fullText: text("full_text"),
    notes: text("notes"),
    // Optional anchors: a document may belong to a state, an election, a party,
    // any combination, or none (a national gazette belongs to nothing here).
    stateId: text("state_id").references(() => states.id),
    electionId: uuid("election_id").references(() => elections.id),
    partyId: text("party_id").references(() => parties.id),
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(title, '') || ' ' || coalesce(publisher, '') || ' ' || coalesce(full_text, ''))`,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("documents_search_idx").using("gin", t.searchTsv),
    index("documents_type_idx").on(t.type),
    index("documents_state_idx").on(t.stateId),
    index("documents_party_idx").on(t.partyId),
    index("documents_election_idx").on(t.electionId),
    index("documents_published_idx").on(t.publishedOn),
  ],
);

/**
 * A single promise extracted from a manifesto.
 *
 * Two text fields, deliberately. `officialText` is quoted verbatim in the
 * source language and is never edited; `plainText` is an editorial
 * restatement, labelled as such wherever it is shown. Conflating them would
 * let paraphrase drift into the record with nothing marking where it happened.
 *
 * `pageRef` is what makes a promise checkable: a reader can open the manifesto
 * at that page and see the original wording for themselves.
 *
 * There is deliberately NO status column here. Whether a promise was kept is
 * never Abhilekh's claim; it is a dated, attributed, sourced assertion by
 * somebody else, and it lives in its own table (phase 4). See
 * docs/ACCOUNTABILITY_LAYER.md section 2.
 */
export const manifestoPromises = pgTable(
  "manifesto_promises",
  {
    id: uuid("id").primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    partyId: text("party_id").references(() => parties.id),
    electionId: uuid("election_id").references(() => elections.id),
    stateId: text("state_id").references(() => states.id), // null for national promises
    officialText: text("official_text").notNull(), // verbatim, never edited
    officialLang: text("official_lang").notNull().default("en"),
    plainText: text("plain_text"), // editorial restatement, always labelled
    category: promiseCategoryEnum("category").notNull().default("other"),
    scope: promiseScopeEnum("scope").notNull().default("unspecified"),
    statedTimeline: text("stated_timeline"), // as written: "within five years"
    statedBudgetInr: numeric("stated_budget_inr"), // only when the manifesto states one
    pageRef: text("page_ref"), // where in the document, so a reader can check
    sortOrder: integer("sort_order").notNull().default(0),
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(official_text, '') || ' ' || coalesce(plain_text, ''))`,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("promises_search_idx").using("gin", t.searchTsv),
    index("promises_document_idx").on(t.documentId),
    index("promises_party_idx").on(t.partyId),
    index("promises_election_idx").on(t.electionId),
    index("promises_category_idx").on(t.category),
  ],
);

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull().unique(), // normalized: trimmed, lowercased host, no trailing slash
  publisher: text("publisher"),
  publishedOn: date("published_on"),
  accessedOn: date("accessed_on"),
  // Classification, not scoring. The archive records verifiable facts about a
  // source (who issued it, and whether it is the artefact or reporting about
  // the artefact) and never rates its reliability, which would be an editorial
  // judgment the reader should make.
  kind: sourceKindEnum("kind"),
  isOfficial: boolean("is_official"), // issued by a government body
  isPrimary: boolean("is_primary"), // the document itself, not coverage of it
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A published dataset the archive has ingested in bulk.
 *
 * The generalisation of section 14a. Review earns its keep when the proposer
 * and the reviewer are different people; a loader importing two hundred
 * thousand constituency results is neither, and a queue that size is one
 * nobody empties. So bulk rows insert directly, and what replaces review is
 * this: the reader is told exactly which published dataset a fact came from,
 * at which version, under which licence, retrieved when, by whom.
 *
 * That is a different claim from "a person checked this", and the interface
 * has to be able to say which one it is making. It is not a weaker claim.
 * A named edition of a CAG report is more checkable than a volunteer's tick,
 * because anyone can fetch the same edition and look.
 *
 * `version` is NOT NULL and "unversioned" is its correct value when the
 * publisher issues none: a null could not distinguish a publisher who does not
 * version from a curator who did not look.
 */
export const datasets = pgTable("datasets", {
  id: uuid("id").primaryKey(),
  /** Stable key the inbox sheets reference. */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  publisher: text("publisher").notNull(),
  version: text("version").notNull(),
  licence: text("licence").notNull(),
  licenceUrl: text("licence_url"),
  retrievedOn: date("retrieved_on").notNull(),
  upstreamUrl: text("upstream_url").notNull(),
  /** Who ran the ingest. Not a user reference: a curator need not have an
   *  account, and the name in the record should outlive the account anyway. */
  curator: text("curator").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Which dataset a bulk-ingested row came from, and where inside it.
 *
 * Shaped deliberately like `citations`: same polymorphic key, same composite
 * primary key, same indexes. Provenance is a sibling of citation, not a
 * parallel system, and the tables say so before any component does.
 *
 * `upstreamId` is the whole traceability claim, so it is required. It carries
 * the row's own identifier in the source file, which lets a reader take one
 * fact from this archive back to one line of the publisher's data.
 *
 * There is no `ingest_path` column on the records themselves. A row here IS
 * the bulk marker, an approved revision is the review marker, and a record can
 * carry both: bulk-ingested, then corrected by a person. A column with a
 * default would have made every pre-existing row claim a path nobody verified.
 */
export const recordProvenance = pgTable(
  "record_provenance",
  {
    subjectType: citationSubjectEnum("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id),
    /** The row's identifier in the source file: a natural key where the
     *  publisher gives one, a line reference where it does not. */
    upstreamId: text("upstream_id").notNull(),
    ingestedOn: date("ingested_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.subjectType, t.subjectId, t.datasetId] }),
    index("record_provenance_subject_idx").on(t.subjectType, t.subjectId),
    index("record_provenance_dataset_idx").on(t.datasetId),
  ],
);

/**
 * Polymorphic citations.
 *
 * Replaces the per-entity join tables (term_sources, election_sources,
 * event_sources), which required a new table for every citable entity. Those
 * three remain for one release so old code keeps working; new code reads and
 * writes here.
 *
 * `note` records where in the source the claim sits: a page, a clause, a table
 * number. Without it a 400-page CAG report is not really a citation.
 */
export const citations = pgTable(
  "citations",
  {
    subjectType: citationSubjectEnum("subject_type").notNull(),
    subjectId: text("subject_id").notNull(), // text: most ids are uuid, party/state ids are slugs
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.subjectType, t.subjectId, t.sourceId] }),
    index("citations_subject_idx").on(t.subjectType, t.subjectId),
    index("citations_source_idx").on(t.sourceId),
  ],
);

export const termSources = pgTable(
  "term_sources",
  {
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
  },
  (t) => [primaryKey({ columns: [t.termId, t.sourceId] })],
);

export const electionSources = pgTable(
  "election_sources",
  {
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
  },
  (t) => [primaryKey({ columns: [t.electionId, t.sourceId] })],
);

export const eventSources = pgTable(
  "event_sources",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.sourceId] })],
);

// ---------------------------------------------------------------------------
// Users — Auth.js adapter shape + role/join date.
// JWT session strategy: no sessions table needed.
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("contributor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), // join date
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------------------------------------------------------------------------
// Revisions — THE core feature. Every change to terms/elections/events flows
// through here; live tables are only written by the approval transaction
// (plus the paired hidden-row insert for brand-new events).
// ---------------------------------------------------------------------------

export const revisions = pgTable(
  "revisions",
  {
    id: uuid("id").primaryKey(),
    entityType: revisionEntityEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(), // pre-allocated UUIDv7 for creates — never NULL
    stateId: text("state_id")
      .notNull()
      .references(() => states.id), // denormalized for queue filtering
    action: revisionActionEnum("action").notNull(),
    schemaVersion: smallint("schema_version").notNull().default(1), // payload shape versioning
    beforeData: jsonb("before_data"), // canonical live snapshot; NULL iff action = 'create'
    afterData: jsonb("after_data"), // proposed full state incl. sources; NULL iff action = 'delete'
    title: text("title").notNull(), // human label for lists (e.g. event title)
    summary: text("summary").notNull(), // contributor's edit summary (required)
    origin: revisionOriginEnum("origin").notNull().default("community"),
    status: revisionStatusEnum("status").notNull().default("pending"),
    proposedBy: text("proposed_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"), // rejection reason, visible to submitter
  },
  (t) => [
    index("revisions_queue_idx").on(t.status, t.createdAt),
    index("revisions_entity_idx").on(t.entityType, t.entityId, t.createdAt),
    index("revisions_user_idx").on(t.proposedBy, t.createdAt),
    index("revisions_state_idx").on(t.stateId, t.status),
    check(
      "revisions_payload_shape",
      sql`(action <> 'create' OR before_data IS NULL) AND (action <> 'delete' OR after_data IS NULL) AND (action = 'create' OR before_data IS NOT NULL) AND (action = 'delete' OR after_data IS NOT NULL)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Reports / disputes — the "talk page" equivalent.
// ---------------------------------------------------------------------------

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey(),
    entityType: revisionEntityEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    kind: reportKindEnum("kind").notNull().default("issue"), // 'dispute' drives disputed banners
    openedBy: text("opened_by").references(() => users.id), // NULL = anonymous
    reporterContact: text("reporter_contact"), // optional email for anonymous reporters
    reason: text("reason").notNull(),
    status: reportStatusEnum("status").notNull().default("open"),
    resolutionNote: text("resolution_note"),
    resolvedBy: text("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reports_entity_idx").on(t.entityType, t.entityId),
    index("reports_status_idx").on(t.status),
  ],
);

export const reportComments = pgTable("report_comments", {
  id: uuid("id").primaryKey(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations (for db.query relational reads)
// ---------------------------------------------------------------------------

export const statesRelations = relations(states, ({ many }) => ({
  terms: many(terms),
  elections: many(elections),
  events: many(events),
}));

export const manifestoPromisesRelations = relations(manifestoPromises, ({ one }) => ({
  document: one(documents, {
    fields: [manifestoPromises.documentId],
    references: [documents.id],
  }),
  party: one(parties, { fields: [manifestoPromises.partyId], references: [parties.id] }),
  election: one(elections, {
    fields: [manifestoPromises.electionId],
    references: [elections.id],
  }),
  state: one(states, { fields: [manifestoPromises.stateId], references: [states.id] }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  promises: many(manifestoPromises),
  state: one(states, { fields: [documents.stateId], references: [states.id] }),
  party: one(parties, { fields: [documents.partyId], references: [parties.id] }),
  election: one(elections, { fields: [documents.electionId], references: [elections.id] }),
}));

export const citationsRelations = relations(citations, ({ one }) => ({
  source: one(sources, { fields: [citations.sourceId], references: [sources.id] }),
}));

export const recordProvenanceRelations = relations(recordProvenance, ({ one }) => ({
  dataset: one(datasets, { fields: [recordProvenance.datasetId], references: [datasets.id] }),
}));

export const partiesRelations = relations(parties, ({ many }) => ({
  terms: many(terms),
  electionResults: many(electionResults),
}));

export const termsRelations = relations(terms, ({ one, many }) => ({
  state: one(states, { fields: [terms.stateId], references: [states.id] }),
  party: one(parties, { fields: [terms.partyId], references: [parties.id] }),
  sources: many(termSources),
}));

export const electionsRelations = relations(elections, ({ one, many }) => ({
  state: one(states, { fields: [elections.stateId], references: [states.id] }),
  results: many(electionResults),
  sources: many(electionSources),
}));

export const electionResultsRelations = relations(electionResults, ({ one }) => ({
  election: one(elections, {
    fields: [electionResults.electionId],
    references: [elections.id],
  }),
  party: one(parties, { fields: [electionResults.partyId], references: [parties.id] }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  state: one(states, { fields: [events.stateId], references: [states.id] }),
  sources: many(eventSources),
}));

export const sourcesRelations = relations(sources, ({ many }) => ({
  termLinks: many(termSources),
  electionLinks: many(electionSources),
  eventLinks: many(eventSources),
}));

export const termSourcesRelations = relations(termSources, ({ one }) => ({
  term: one(terms, { fields: [termSources.termId], references: [terms.id] }),
  source: one(sources, { fields: [termSources.sourceId], references: [sources.id] }),
}));

export const electionSourcesRelations = relations(electionSources, ({ one }) => ({
  election: one(elections, {
    fields: [electionSources.electionId],
    references: [elections.id],
  }),
  source: one(sources, { fields: [electionSources.sourceId], references: [sources.id] }),
}));

export const eventSourcesRelations = relations(eventSources, ({ one }) => ({
  event: one(events, { fields: [eventSources.eventId], references: [events.id] }),
  source: one(sources, { fields: [eventSources.sourceId], references: [sources.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  revisionsProposed: many(revisions, { relationName: "proposer" }),
  revisionsReviewed: many(revisions, { relationName: "reviewer" }),
}));

export const revisionsRelations = relations(revisions, ({ one }) => ({
  state: one(states, { fields: [revisions.stateId], references: [states.id] }),
  proposer: one(users, {
    fields: [revisions.proposedBy],
    references: [users.id],
    relationName: "proposer",
  }),
  reviewer: one(users, {
    fields: [revisions.reviewedBy],
    references: [users.id],
    relationName: "reviewer",
  }),
}));

export const reportsRelations = relations(reports, ({ one, many }) => ({
  opener: one(users, { fields: [reports.openedBy], references: [users.id] }),
  resolver: one(users, { fields: [reports.resolvedBy], references: [users.id] }),
  comments: many(reportComments),
}));

export const reportCommentsRelations = relations(reportComments, ({ one }) => ({
  report: one(reports, { fields: [reportComments.reportId], references: [reports.id] }),
  author: one(users, { fields: [reportComments.authorId], references: [users.id] }),
}));

// ===========================================================================
// India Funding and Influence Map
//
// Design: docs/FUNDING_INFLUENCE_ARCHITECTURE.md. Two rules govern every table
// below and are worth repeating where they are enforced rather than only where
// they are described:
//
//   1. Facts and interpretations live in different tables. `relationships`
//      holds checkable relations; `claims` holds everything interpretive and
//      cannot exist without recording who asserts it.
//   2. Nothing here is ever derived and stored. Overlap between two bodies is
//      computed on read, because a stored overlap becomes a fact-shaped object
//      that outlives the caveat printed beside it.
// ===========================================================================

/**
 * A polymorphic entity-reference id.
 *
 * `text`, not `uuid`, and deliberately so: orgs, people, projects and campaigns
 * carry UUIDs, but party ids are slugs ('indian-national-congress') and state
 * ids are two-letter codes. `citations.subject_id` already made this choice for
 * exactly this reason. With uuid columns the graph could not reach a party or a
 * state at all, and those are the nodes that join this layer to the political
 * record it sits beside.
 */
const entityRefId = (name: string) => text(name);

/** What an entity reference points at. Used by the polymorphic columns below. */
export const entityRefEnum = pgEnum("entity_ref", [
  "org",
  "person",
  "party",
  "state",
  "project",
  "campaign",
  "legal_case",
  "publication",
  "outcome",
  // 2026-09-03: an open question can be about a dataset as a whole (e.g.
  // the electoral-bonds sample verification that has not happened).
  "dataset",
]);

// One table for every institutional body. Kind is an attribute, not a table,
// because bodies change kind over their lives and a table-per-type turns that
// into a migration.
export const orgKindEnum = pgEnum("org_kind", [
  "ngo",
  "trust",
  "society",
  "foundation",
  "think_tank",
  "advocacy",
  "media",
  "research",
  "company",
  "government_body",
  "political",
  "international",
  "religious",
  "professional_body",
  "other",
  // 2026-09-03 gate ruling (electoral bonds): kind records only what the
  // name states. A committed legal-form suffix makes it a company;
  // everything else is unclassified — no pattern inference.
  "unclassified",
]);

/**
 * How well established an assertion is. Carried by every relationship, funding
 * row and claim in this layer, and rendered next to each of them.
 *
 * `inferred` is the dangerous one: it is the only value that describes a
 * conclusion nobody documented. It therefore requires a written rationale (see
 * the check on `claims`) and must never be rendered like `verified`.
 */
export const evidenceStatusEnum = pgEnum("evidence_status", [
  "verified",
  "documented",
  "alleged",
  "disputed",
  "inferred",
  "unknown",
]);

export const fundingTypeEnum = pgEnum("funding_type", [
  "grant",
  "donation",
  "csr",
  "government_grant",
  "contract",
  "membership",
  "subscription",
  "advertising",
  "investment",
  "loan",
  "in_kind",
  "other",
]);

/**
 * Factual, checkable relations only.
 *
 * Deliberately absent: coordinated_with, influenced, controlled_by,
 * acted_on_behalf_of. Those are the accusations, and they have no enum value
 * here so they cannot be stored as relationships. Where a source does
 * establish control or coordination it is recorded in `claims`, which forces
 * it to carry an asserter, a status and a citation.
 */
export const relationKindEnum = pgEnum("relation_kind", [
  "funded",
  "founded",
  "owns",
  "sits_on_board",
  "employed_by",
  "partnered_with",
  "member_of",
  "advised",
  "published",
  "filed_case_against",
  "targeted",
  "successor_of",
  "campaigned_for",
  "campaigned_against",
  "campaigned_regarding",
]);

export const claimTypeEnum = pgEnum("claim_type", [
  "funding",
  "control",
  "coordination",
  "influence",
  "affiliation",
  "conflict_of_interest",
  "outcome_attribution",
  "misconduct",
  "other",
]);

export const fcraStatusEnum = pgEnum("fcra_status", [
  "active",
  "suspended",
  "cancelled",
  "expired",
  "renewed",
  "unknown",
]);

export const boardRoleKindEnum = pgEnum("board_role_kind", [
  "founder",
  "trustee",
  "director",
  "board_member",
  "chairperson",
  "editor",
  "chief_executive",
  "secretary",
  "treasurer",
  "advisor",
  "employee",
  "spokesperson",
  "other",
]);

export const aliasKindEnum = pgEnum("alias_kind", [
  "legal_name",
  "former_name",
  "abbreviation",
  "transliteration",
  "alias",
  "misspelling",
]);

// Two records that might be one body. There is no merge: confirming a match
// records a confirmation, it never deletes a row, because a merge destroys the
// evidence that the two were ever recorded separately.
export const matchStatusEnum = pgEnum("match_status", ["possible", "confirmed", "rejected"]);

export const verificationResultEnum = pgEnum("verification_result", [
  "confirmed",
  "could_not_confirm",
  "contradicted",
]);

export const campaignStanceEnum = pgEnum("campaign_stance", [
  "against",
  "for",
  "neutral",
  "unstated",
]);

export const projectKindEnum = pgEnum("project_kind", [
  "infrastructure",
  "policy",
  "regulation",
  "programme",
  "industry",
  "other",
]);

export const legalCaseKindEnum = pgEnum("legal_case_kind", [
  "pil",
  "writ",
  "civil",
  "criminal",
  "regulatory",
  "tribunal",
  "appeal",
  "other",
]);

export const casePartySideEnum = pgEnum("case_party_side", [
  "petitioner",
  "respondent",
  "intervenor",
  "amicus",
]);

export const publicationKindEnum = pgEnum("publication_kind", [
  "report",
  "article",
  "investigation",
  "statement",
  "paper",
  "dataset",
  "other",
]);

// What happened, attached to the thing it happened to. Never attached to a
// campaign: "campaign X caused outcome Y" is an outcome_attribution claim,
// with an asserter and a status.
export const outcomeKindEnum = pgEnum("outcome_kind", [
  "project_delayed",
  "project_cancelled",
  "project_completed",
  "policy_changed",
  "policy_withdrawn",
  "investigation_initiated",
  "court_ruling",
  "regulatory_action",
  "government_response",
  "no_documented_outcome",
  "disputed",
]);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const orgs = pgTable(
  "orgs",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(), // the name as the primary source gives it
    kind: orgKindEnum("kind").notNull(),
    legalName: text("legal_name"),
    registrationNumber: text("registration_number"),
    registrationType: text("registration_type"), // trust deed, society act, sec 8, CIN
    incorporatedOn: date("incorporated_on"),
    dissolvedOn: date("dissolved_on"),
    stateId: text("state_id").references(() => states.id), // registered or head office
    city: text("city"),
    website: text("website"),
    summary: text("summary"), // neutral description, sourced
    // What a later batch changed about this record, and why, in the curator's
    // words. A record that can only ever gain empty fields is a record whose
    // first thin description is permanent; a record that can be quietly
    // rewritten is not an archive. This is the third way: an improvement is
    // allowed, and it has to say out loud that it happened.
    revisedOn: date("revised_on"),
    revisionNote: text("revision_note"),
    parentOrgId: uuid("parent_org_id"), // self-reference, set in relations below
    enteredBy: text("entered_by").references(() => users.id),
    enteredOn: date("entered_on"),
    verifiedBy: text("verified_by").references(() => users.id),
    verifiedOn: date("verified_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orgs_kind_idx").on(t.kind), index("orgs_state_idx").on(t.stateId)],
);

/**
 * Individuals in institutional or public roles.
 *
 * `publicRoleBasis` is required and says why this person is in a public
 * archive at all ("trustee of X, per the 2021 MCA filing"). Someone with no
 * institutional role does not belong here, and a required field makes that a
 * visible decision rather than a silent one.
 */
export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    publicRoleBasis: text("public_role_basis").notNull(),
    birthYear: integer("birth_year"),
    summary: text("summary"),
    stateId: text("state_id").references(() => states.id),
    enteredBy: text("entered_by").references(() => users.id),
    enteredOn: date("entered_on"),
    verifiedBy: text("verified_by").references(() => users.id),
    verifiedOn: date("verified_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("people_name_idx").on(t.name)],
);

export const entityAliases = pgTable(
  "entity_aliases",
  {
    id: uuid("id").primaryKey(),
    entityType: entityRefEnum("entity_type").notNull(),
    entityId: entityRefId("entity_id").notNull(),
    name: text("name").notNull(),
    kind: aliasKindEnum("kind").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("entity_aliases_entity_idx").on(t.entityType, t.entityId),
    index("entity_aliases_name_idx").on(t.name),
  ],
);

export const entityMatchCandidates = pgTable(
  "entity_match_candidates",
  {
    id: uuid("id").primaryKey(),
    entityType: entityRefEnum("entity_type").notNull(),
    aId: entityRefId("a_id").notNull(),
    bId: entityRefId("b_id").notNull(),
    status: matchStatusEnum("status").notNull().default("possible"),
    rationale: text("rationale").notNull(),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("entity_match_pair_idx").on(t.entityType, t.aId, t.bId),
    check("entity_match_distinct", sql`a_id <> b_id`),
  ],
);

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * One recorded payment or grant.
 *
 * Amounts stay in the currency the source used: converting at write time would
 * transform an ambiguous field, and both the rate and its date are themselves
 * claims. `statedPurpose` is verbatim from the source, never a category the
 * archive assigns.
 *
 * There is no `is_foreign` column. Under FCRA a company registered in India
 * can be a foreign source and a donor abroad may not be, so "foreign" is a
 * determination to be recorded (`reportedUnderFcra`, `donorCountry`), never
 * computed from a country code.
 */
export const fundingTransactions = pgTable(
  "funding_transactions",
  {
    id: uuid("id").primaryKey(),
    donorType: entityRefEnum("donor_type").notNull(),
    donorId: entityRefId("donor_id").notNull(),
    recipientType: entityRefEnum("recipient_type").notNull(),
    recipientId: entityRefId("recipient_id").notNull(),
    /** The recipient exactly as the source wrote it (e.g. the ECI
     *  account-holder form), kept verbatim beside the resolved id
     *  (2026-09-03 gate ruling). */
    recipientLabel: text("recipient_label"),
    amount: numeric("amount", { precision: 20, scale: 2 }),
    currency: text("currency"), // ISO 4217, as the source states it
    financialYear: text("financial_year"), // '2022-23'
    occurredOn: date("occurred_on"),
    fundingType: fundingTypeEnum("funding_type").notNull().default("grant"),
    statedPurpose: text("stated_purpose"), // verbatim
    programme: text("programme"),
    donorCountry: text("donor_country"), // ISO 3166-1 alpha-2
    reportedUnderFcra: boolean("reported_under_fcra"),
    evidenceStatus: evidenceStatusEnum("evidence_status").notNull().default("documented"),
    notes: text("notes"),
    retrievedOn: date("retrieved_on"), // when the source was fetched
    enteredBy: text("entered_by").references(() => users.id),
    enteredOn: date("entered_on"),
    verifiedBy: text("verified_by").references(() => users.id),
    verifiedOn: date("verified_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("funding_donor_idx").on(t.donorType, t.donorId),
    index("funding_recipient_idx").on(t.recipientType, t.recipientId),
    index("funding_year_idx").on(t.financialYear),
    index("funding_country_idx").on(t.donorCountry),
    check("funding_amount_nonneg", sql`amount IS NULL OR amount >= 0`),
  ],
);

export const fcraRegistrations = pgTable(
  "fcra_registrations",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    registrationNumber: text("registration_number"),
    status: fcraStatusEnum("status").notNull().default("unknown"),
    grantedOn: date("granted_on"),
    validUntil: date("valid_until"),
    // Any recorded government action, stated as the record states it.
    actionOn: date("action_on"),
    actionKind: text("action_kind"),
    actionNote: text("action_note"),
    evidenceStatus: evidenceStatusEnum("evidence_status").notNull().default("verified"),
    retrievedOn: date("retrieved_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fcra_org_idx").on(t.orgId)],
);

// ---------------------------------------------------------------------------
// People in organisations
// ---------------------------------------------------------------------------

export const boardPositions = pgTable(
  "board_positions",
  {
    id: uuid("id").primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // as the source words it
    roleKind: boardRoleKindEnum("role_kind").notNull().default("board_member"),
    startOn: date("start_on"),
    endOn: date("end_on"),
    evidenceStatus: evidenceStatusEnum("evidence_status").notNull().default("documented"),
    retrievedOn: date("retrieved_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("board_person_idx").on(t.personId),
    index("board_org_idx").on(t.orgId),
    check("board_dates_ordered", sql`end_on IS NULL OR start_on IS NULL OR end_on >= start_on`),
  ],
);

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    kind: projectKindEnum("kind").notNull(),
    stateId: text("state_id").references(() => states.id),
    operatorOrgId: uuid("operator_org_id").references(() => orgs.id),
    announcedOn: date("announced_on"),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_state_idx").on(t.stateId)],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    issue: text("issue"),
    stateId: text("state_id").references(() => states.id),
    startOn: date("start_on"),
    endOn: date("end_on"),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("campaigns_state_idx").on(t.stateId)],
);

export const campaignParticipants = pgTable(
  "campaign_participants",
  {
    id: uuid("id").primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    participantType: entityRefEnum("participant_type").notNull(),
    participantId: entityRefId("participant_id").notNull(),
    role: text("role"),
    evidenceStatus: evidenceStatusEnum("evidence_status").notNull().default("documented"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaign_participants_campaign_idx").on(t.campaignId),
    index("campaign_participants_entity_idx").on(t.participantType, t.participantId),
  ],
);

// A campaign's subject and its stated position on it. `stance` defaults to
// 'unstated' because a campaign that has not stated a position must not be
// recorded as opposing anything.
export const campaignTargets = pgTable(
  "campaign_targets",
  {
    id: uuid("id").primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    targetType: entityRefEnum("target_type").notNull(),
    targetId: entityRefId("target_id").notNull(),
    stance: campaignStanceEnum("stance").notNull().default("unstated"),
    evidenceStatus: evidenceStatusEnum("evidence_status").notNull().default("documented"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaign_targets_campaign_idx").on(t.campaignId),
    index("campaign_targets_target_idx").on(t.targetType, t.targetId),
  ],
);

export const publications = pgTable(
  "publications",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    kind: publicationKindEnum("kind").notNull().default("report"),
    publishedOn: date("published_on"),
    url: text("url"),
    publisherOrgId: uuid("publisher_org_id").references(() => orgs.id),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("publications_org_idx").on(t.publisherOrgId)],
);

export const legalCases = pgTable(
  "legal_cases",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    court: text("court"),
    caseNumber: text("case_number"),
    kind: legalCaseKindEnum("kind").notNull().default("writ"),
    filedOn: date("filed_on"),
    decidedOn: date("decided_on"),
    stateId: text("state_id").references(() => states.id),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("legal_cases_state_idx").on(t.stateId)],
);

export const legalCaseParties = pgTable(
  "legal_case_parties",
  {
    id: uuid("id").primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => legalCases.id, { onDelete: "cascade" }),
    partyType: entityRefEnum("party_type").notNull(),
    partyId: entityRefId("party_id").notNull(),
    side: casePartySideEnum("side").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("legal_case_parties_case_idx").on(t.caseId),
    index("legal_case_parties_entity_idx").on(t.partyType, t.partyId),
  ],
);

/**
 * What happened, attached to the thing it happened to.
 *
 * Never attached to a campaign. The timeline will show a campaign in 2016 and a
 * cancellation in 2018 and let the reader see the sequence; saying one produced
 * the other is an `outcome_attribution` claim, with an asserter and a status.
 */
export const outcomes = pgTable(
  "outcomes",
  {
    id: uuid("id").primaryKey(),
    subjectType: entityRefEnum("subject_type").notNull(),
    subjectId: entityRefId("subject_id").notNull(),
    kind: outcomeKindEnum("kind").notNull(),
    occurredOn: date("occurred_on"),
    summary: text("summary").notNull(),
    evidenceStatus: evidenceStatusEnum("evidence_status").notNull().default("documented"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outcomes_subject_idx").on(t.subjectType, t.subjectId)],
);

// ---------------------------------------------------------------------------
// The graph: factual edges, and interpretive claims
// ---------------------------------------------------------------------------

export const relationships = pgTable(
  "relationships",
  {
    id: uuid("id").primaryKey(),
    kind: relationKindEnum("kind").notNull(),
    fromType: entityRefEnum("from_type").notNull(),
    fromId: entityRefId("from_id").notNull(),
    toType: entityRefEnum("to_type").notNull(),
    toId: entityRefId("to_id").notNull(),
    startOn: date("start_on"),
    endOn: date("end_on"),
    detail: text("detail"),
    // Some relations carry a figure of their own (a shareholding, a contract
    // value) without being a funding transaction. Same rule as funding: the
    // currency the source used, no conversion at write time.
    amount: numeric("amount", { precision: 20, scale: 2 }),
    currency: text("currency"),
    evidenceStatus: evidenceStatusEnum("evidence_status").notNull().default("documented"),
    /**
     * The recorder's stated confidence, 0 to 100, and nothing more.
     *
     * It is never computed, never averaged across relationships, and never
     * shown as a score for a path, a cluster or an entity. Evidence status is
     * what the interface reads; this exists so a recorder can say "the filing
     * is clear but the name match is not" without weakening the status of the
     * whole row. A number that gets aggregated becomes an influence score, and
     * that is the one output this layer must not produce.
     */
    confidence: smallint("confidence"),
    retrievedOn: date("retrieved_on"),
    enteredBy: text("entered_by").references(() => users.id),
    enteredOn: date("entered_on"),
    verifiedBy: text("verified_by").references(() => users.id),
    verifiedOn: date("verified_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("relationships_from_idx").on(t.fromType, t.fromId),
    index("relationships_to_idx").on(t.toType, t.toId),
    index("relationships_kind_idx").on(t.kind),
    check(
      "relationships_dates_ordered",
      sql`end_on IS NULL OR start_on IS NULL OR end_on >= start_on`,
    ),
    check("relationships_confidence_range", sql`confidence IS NULL OR (confidence BETWEEN 0 AND 100)`),
  ],
);

/**
 * Interpretation, with its author attached.
 *
 * Everything the relationship enum refuses to hold lives here: control,
 * coordination, influence, attribution of an outcome. The check constraints
 * are the point of the table. An `alleged` claim without an asserter is
 * rejected, so "it is alleged that..." can never be recorded without recording
 * who alleges it; an `inferred` claim without a rationale is rejected, so a
 * conclusion nobody documented must at least explain itself.
 */
export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey(),
    statement: text("statement").notNull(),
    claimType: claimTypeEnum("claim_type").notNull(),
    subjectType: entityRefEnum("subject_type"),
    subjectId: entityRefId("subject_id"),
    objectType: entityRefEnum("object_type"),
    objectId: entityRefId("object_id"),
    status: evidenceStatusEnum("status").notNull(),
    // Who makes the claim. An entity reference where the asserter is in the
    // archive, a plain name where they are not (a named official, a court).
    assertedByType: entityRefEnum("asserted_by_type"),
    assertedById: entityRefId("asserted_by_id"),
    assertedByName: text("asserted_by_name"),
    assertedOn: date("asserted_on"),
    rationale: text("rationale"), // required when status = 'inferred'
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    enteredBy: text("entered_by").references(() => users.id),
    enteredOn: date("entered_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("claims_subject_idx").on(t.subjectType, t.subjectId),
    index("claims_object_idx").on(t.objectType, t.objectId),
    index("claims_type_idx").on(t.claimType),
    check(
      "claims_alleged_needs_asserter",
      sql`status <> 'alleged' OR asserted_by_id IS NOT NULL OR asserted_by_name IS NOT NULL`,
    ),
    check(
      "claims_inferred_needs_rationale",
      sql`status <> 'inferred' OR (rationale IS NOT NULL AND length(btrim(rationale)) > 0)`,
    ),
  ],
);

// Rebuttals. Section 25 requires responses where they exist; a table is how
// they stop being optional in practice.
export const claimResponses = pgTable(
  "claim_responses",
  {
    id: uuid("id").primaryKey(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    respondentType: entityRefEnum("respondent_type"),
    respondentId: entityRefId("respondent_id"),
    respondentName: text("respondent_name"),
    response: text("response").notNull(),
    respondedOn: date("responded_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("claim_responses_claim_idx").on(t.claimId)],
);

// ---------------------------------------------------------------------------
// Provenance and honesty about gaps
// ---------------------------------------------------------------------------

// Append-only. A 'contradicted' verification does not delete the row it
// concerns: it lowers that row's status and stays on the record.
export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey(),
    subjectType: citationSubjectEnum("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    result: verificationResultEnum("result").notNull(),
    method: text("method").notNull(),
    note: text("note"),
    verifiedBy: text("verified_by").references(() => users.id),
    verifiedOn: date("verified_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verifications_subject_idx").on(t.subjectType, t.subjectId)],
);

// "What we don't know", as data rather than as a rendering of missing joins.
// ---------------------------------------------------------------------------
// Rajya Sabha (docs/RAJYA_SABHA_SPEC.md §4.1, gate-approved 2026-09-03).
//
// Identity is the publisher's stable TCPD ID, never the member name. The
// ingest reads a binding 13-column allowlist; none of the file's PII columns
// can reach these tables (they are mechanically unreachable in the parser).
// ---------------------------------------------------------------------------

export const rsMembers = pgTable(
  "rs_members",
  {
    id: uuid("id").primaryKey(),
    /** TCPD's stable person id (RS00001 …): the external identifier that IS
     *  this member's identity across terms. */
    tcpdRsId: text("tcpd_rs_id").notNull().unique(),
    /** Verbatim, honorifics and ordering as published ("Singh, Dr. Manmohan"). */
    memberName: text("member_name").notNull(),
    /** TCPD's own derived field, attributed as theirs — not a Who's-Who fact. */
    genderTcpd: text("gender_tcpd", { enum: ["M", "F"] }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const rsTerms = pgTable(
  "rs_terms",
  {
    id: uuid("id").primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => rsMembers.id, { onDelete: "cascade" }),
    /** Null for nominated members and for seats not resolvable to a state
     *  row; the verbatim label below always survives. */
    stateId: text("state_id").references(() => states.id),
    stateLabel: text("state_label").notNull(),
    /** The party exactly as the file labels it; party_id resolves through
     *  the committed dispositions and stays null where nothing resolves
     *  (NOM., O) — an unresolved label loses nothing. */
    partyLabel: text("party_label").notNull(),
    partyId: text("party_id").references(() => parties.id),
    startDate: date("start_date").notNull(),
    /** Scheduled end — a fact in its own right, not a lesser one. */
    endDateTerm: date("end_date_term").notNull(),
    /** When the seat was actually vacated; null where the file records none. */
    endDateActual: date("end_date_actual"),
    reasonOfVacation: text("reason_of_vacation"),
    nominated: boolean("nominated").notNull(),
    termNo: integer("term_no").notNull(),
    /** "Current"/"Former" as of snapshot_on ONLY — never present tense. */
    typeSnapshot: text("type_snapshot", { enum: ["Current", "Former"] }).notNull(),
    snapshotOn: date("snapshot_on").notNull(),
    sourceNote: text("source_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rs_terms_member_idx").on(t.memberId),
    index("rs_terms_state_idx").on(t.stateId, t.startDate),
    index("rs_terms_party_idx").on(t.partyId),
  ],
);

export const openQuestions = pgTable(
  "open_questions",
  {
    id: uuid("id").primaryKey(),
    subjectType: entityRefEnum("subject_type").notNull(),
    subjectId: entityRefId("subject_id").notNull(),
    question: text("question").notNull(),
    whyItMatters: text("why_it_matters"),
    whatWouldAnswerIt: text("what_would_answer_it"),
    resolvedOn: date("resolved_on"),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("open_questions_subject_idx").on(t.subjectType, t.subjectId)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const orgsRelations = relations(orgs, ({ one, many }) => ({
  state: one(states, { fields: [orgs.stateId], references: [states.id] }),
  parent: one(orgs, { fields: [orgs.parentOrgId], references: [orgs.id], relationName: "parent" }),
  subsidiaries: many(orgs, { relationName: "parent" }),
  fcra: many(fcraRegistrations),
  boardPositions: many(boardPositions),
}));

export const peopleRelations = relations(people, ({ one, many }) => ({
  state: one(states, { fields: [people.stateId], references: [states.id] }),
  boardPositions: many(boardPositions),
}));

export const boardPositionsRelations = relations(boardPositions, ({ one }) => ({
  person: one(people, { fields: [boardPositions.personId], references: [people.id] }),
  org: one(orgs, { fields: [boardPositions.orgId], references: [orgs.id] }),
}));

export const fcraRegistrationsRelations = relations(fcraRegistrations, ({ one }) => ({
  org: one(orgs, { fields: [fcraRegistrations.orgId], references: [orgs.id] }),
}));

export const claimsRelations = relations(claims, ({ many }) => ({
  responses: many(claimResponses),
}));

export const claimResponsesRelations = relations(claimResponses, ({ one }) => ({
  claim: one(claims, { fields: [claimResponses.claimId], references: [claims.id] }),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  state: one(states, { fields: [campaigns.stateId], references: [states.id] }),
  participants: many(campaignParticipants),
  targets: many(campaignTargets),
}));

export const campaignParticipantsRelations = relations(campaignParticipants, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignParticipants.campaignId],
    references: [campaigns.id],
  }),
}));

export const campaignTargetsRelations = relations(campaignTargets, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignTargets.campaignId], references: [campaigns.id] }),
}));

export const legalCasesRelations = relations(legalCases, ({ one, many }) => ({
  state: one(states, { fields: [legalCases.stateId], references: [states.id] }),
  parties: many(legalCaseParties),
}));

export const legalCasePartiesRelations = relations(legalCaseParties, ({ one }) => ({
  legalCase: one(legalCases, { fields: [legalCaseParties.caseId], references: [legalCases.id] }),
}));

export const projectsRelations = relations(projects, ({ one }) => ({
  state: one(states, { fields: [projects.stateId], references: [states.id] }),
  operator: one(orgs, { fields: [projects.operatorOrgId], references: [orgs.id] }),
}));

export const publicationsRelations = relations(publications, ({ one }) => ({
  publisher: one(orgs, { fields: [publications.publisherOrgId], references: [orgs.id] }),
}));
