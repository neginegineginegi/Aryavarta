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

export const revisionEntityEnum = pgEnum("revision_entity", ["term", "election", "event"]);

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

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull().unique(), // normalized: trimmed, lowercased host, no trailing slash
  publisher: text("publisher"),
  publishedOn: date("published_on"),
  accessedOn: date("accessed_on"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
