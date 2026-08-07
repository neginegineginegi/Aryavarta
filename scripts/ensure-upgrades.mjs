/* eslint-disable no-console */
/**
 * Idempotent schema upgrades, applied automatically before every build.
 *
 * Why this exists: the production database was bootstrapped via the Neon SQL
 * editor (not drizzle-kit's journal), so instead of a migration journal we
 * keep one append-only list of statements that are all safe to re-run.
 * Vercel's build environment has DATABASE_URL and network access, so schema
 * changes ship themselves with the code that needs them — no manual SQL.
 *
 * Rules for adding statements:
 *  - additive only, and idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING /
 *    duplicate_object guards)
 *  - a statement that USES a new enum value must come after the ADD VALUE
 *    statement, and each statement runs in its own transaction (required by
 *    Postgres for new enum values)
 */

const STATEMENTS = [
  // --- upgrade 1: atlas data engine ---------------------------------------
  `DO $$ BEGIN
     CREATE TYPE "public"."election_scope" AS ENUM('state_assembly', 'lok_sabha');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."revision_origin" AS ENUM('community', 'import');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE "election_results" ADD COLUMN IF NOT EXISTS "seats_contested" integer`,
  `ALTER TABLE "election_results" ADD COLUMN IF NOT EXISTS "alliance_name" text`,
  `ALTER TABLE "elections" ADD COLUMN IF NOT EXISTS "scope" "election_scope" DEFAULT 'state_assembly' NOT NULL`,
  `ALTER TABLE "elections" ADD COLUMN IF NOT EXISTS "assembly_number" integer`,
  `ALTER TABLE "revisions" ADD COLUMN IF NOT EXISTS "origin" "revision_origin" DEFAULT 'community' NOT NULL`,
  // --- upgrade 2: union mode ----------------------------------------------
  `ALTER TYPE "public"."state_kind" ADD VALUE IF NOT EXISTS 'union'`,
  `ALTER TYPE "public"."term_kind" ADD VALUE IF NOT EXISTS 'pm'`,
  `ALTER TYPE "public"."term_kind" ADD VALUE IF NOT EXISTS 'president'`,
  `INSERT INTO states (id, name, kind, formed_on, dissolved_on, has_geometry)
   VALUES ('in', 'India (Union)', 'union', '1950-01-26', NULL, false)
   ON CONFLICT (id) DO NOTHING`,
  // --- upgrade 3: governors -------------------------------------------------
  `ALTER TYPE "public"."term_kind" ADD VALUE IF NOT EXISTS 'governor'`,
  // --- upgrade 4: political-context event taxonomy --------------------------
  `ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'cabinet_change'`,
  `ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'legislation'`,
  `ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'constitutional_amendment'`,
  `ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'court_judgment'`,
  `ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'coalition_change'`,
  `ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'welfare_scheme'`,
  `ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'infrastructure_project'`,
  `ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'natural_disaster'`,
  `ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'administrative_reform'`,
  `ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'international_agreement'`,
  // --- upgrade 5: development lens ------------------------------------------
  `CREATE TABLE IF NOT EXISTS "indicators" (
     "id" text PRIMARY KEY,
     "name" text NOT NULL UNIQUE,
     "unit" text NOT NULL,
     "category" text NOT NULL,
     "methodology" text NOT NULL,
     "display_order" smallint NOT NULL DEFAULT 100
   )`,
  `CREATE TABLE IF NOT EXISTS "indicator_values" (
     "id" uuid PRIMARY KEY,
     "indicator_id" text NOT NULL REFERENCES "indicators"("id"),
     "state_id" text NOT NULL REFERENCES "states"("id"),
     "year" smallint NOT NULL,
     "value" numeric NOT NULL,
     "source_title" text NOT NULL,
     "source_url" text NOT NULL,
     "reporting_period" text,
     "verified_on" date NOT NULL
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "indicator_values_series_idx"
     ON "indicator_values" ("indicator_id", "state_id", "year")`,
  `CREATE INDEX IF NOT EXISTS "indicator_values_state_idx"
     ON "indicator_values" ("state_id")`,
  // --- upgrade 6: merged UT of Dadra and Nagar Haveli and Daman and Diu -----
  // The map's geometry predates the 2020 merger ('dn' and 'dd' are dissolved
  // rows); the merged UT gets a geometry-less row like Ladakh so terms and
  // events since 2020-01-26 have a home.
  `INSERT INTO states (id, name, kind, formed_on, dissolved_on, has_geometry)
   VALUES ('dndd', 'Dadra and Nagar Haveli and Daman and Diu', 'union_territory', '2020-01-26', NULL, false)
   ON CONFLICT (id) DO NOTHING`,
  // --- upgrade 7: indicator values gain reporting org + notes ---------------
  `ALTER TABLE "indicator_values" ADD COLUMN IF NOT EXISTS "reporting_org" text`,
  `ALTER TABLE "indicator_values" ADD COLUMN IF NOT EXISTS "notes" text`,
  // --- upgrade 8: accountability layer phase 1, polymorphic citations -------
  // Sources were joined per entity (term_sources, election_sources,
  // event_sources), so every new citable entity meant another near-identical
  // table. One citations table replaces them. The three originals are left in
  // place for a release so nothing breaks mid-deploy.
  `DO $$ BEGIN
     CREATE TYPE "public"."citation_subject" AS ENUM(
       'term', 'election', 'event', 'indicator_value', 'document',
       'manifesto_promise', 'promise_status_claim', 'promise_timeline_step',
       'entity_link'
     );
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."source_kind" AS ENUM(
       'gazette', 'eci_report', 'cag_report', 'court_judgment',
       'assembly_record', 'budget_document', 'ministry_report',
       'press_release', 'manifesto', 'news', 'research', 'rti_response', 'other'
     );
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "kind" "source_kind"`,
  `ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "is_official" boolean`,
  `ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "is_primary" boolean`,
  `CREATE TABLE IF NOT EXISTS "citations" (
     "subject_type" "citation_subject" NOT NULL,
     "subject_id" text NOT NULL,
     "source_id" uuid NOT NULL REFERENCES "sources"("id"),
     "note" text,
     "created_at" timestamp with time zone DEFAULT now() NOT NULL,
     CONSTRAINT "citations_pkey" PRIMARY KEY ("subject_type", "subject_id", "source_id")
   )`,
  `CREATE INDEX IF NOT EXISTS "citations_subject_idx" ON "citations" ("subject_type", "subject_id")`,
  `CREATE INDEX IF NOT EXISTS "citations_source_idx" ON "citations" ("source_id")`,
  // Backfill: idempotent, so it is safe on every build.
  `INSERT INTO citations (subject_type, subject_id, source_id)
   SELECT 'term', term_id::text, source_id FROM term_sources
   ON CONFLICT DO NOTHING`,
  `INSERT INTO citations (subject_type, subject_id, source_id)
   SELECT 'election', election_id::text, source_id FROM election_sources
   ON CONFLICT DO NOTHING`,
  `INSERT INTO citations (subject_type, subject_id, source_id)
   SELECT 'event', event_id::text, source_id FROM event_sources
   ON CONFLICT DO NOTHING`,
  // --- upgrade 9: accountability layer phase 2, the media archive ----------
  `DO $$ BEGIN
     CREATE TYPE "public"."document_type" AS ENUM(
       'manifesto', 'press_conference', 'party_advertisement', 'campaign_speech',
       'debate_transcript', 'election_symbol', 'candidate_affidavit',
       'press_release', 'government_notification', 'gazette', 'cag_report',
       'assembly_debate', 'parliamentary_debate', 'court_judgment', 'eci_order',
       'delimitation_report', 'coalition_agreement', 'white_paper',
       'budget_speech', 'economic_survey', 'five_year_plan', 'committee_report',
       'other'
     );
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."redistribution" AS ENUM('permitted', 'link_only', 'unknown');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."ocr_status" AS ENUM('none', 'pending', 'done', 'failed');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "documents" (
     "id" uuid PRIMARY KEY,
     "type" "document_type" NOT NULL,
     "title" text NOT NULL,
     "publisher" text,
     "published_on" date,
     "date_precision" text,
     "language" text DEFAULT 'en' NOT NULL,
     "official_url" text,
     "archive_url" text,
     "redistribution" "redistribution" DEFAULT 'unknown' NOT NULL,
     "checksum" text,
     "page_count" integer,
     "ocr_status" "ocr_status" DEFAULT 'none' NOT NULL,
     "full_text" text,
     "notes" text,
     "state_id" text REFERENCES "states"("id"),
     "election_id" uuid REFERENCES "elections"("id"),
     "party_id" text REFERENCES "parties"("id"),
     "search_tsv" tsvector GENERATED ALWAYS AS (
       to_tsvector('english', coalesce(title, '') || ' ' || coalesce(publisher, '') || ' ' || coalesce(full_text, ''))
     ) STORED,
     "created_at" timestamp with time zone DEFAULT now() NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS "documents_search_idx" ON "documents" USING gin ("search_tsv")`,
  `CREATE INDEX IF NOT EXISTS "documents_type_idx" ON "documents" ("type")`,
  `CREATE INDEX IF NOT EXISTS "documents_state_idx" ON "documents" ("state_id")`,
  `CREATE INDEX IF NOT EXISTS "documents_party_idx" ON "documents" ("party_id")`,
  `CREATE INDEX IF NOT EXISTS "documents_election_idx" ON "documents" ("election_id")`,
  `CREATE INDEX IF NOT EXISTS "documents_published_idx" ON "documents" ("published_on")`,
  // --- upgrade 10: accountability layer phase 3, manifesto promises --------
  // A promise is a quotation with a page reference, not a verdict. There is
  // deliberately no status column: whether a promise was kept is a dated,
  // attributed claim by a named party, recorded separately, never the
  // archive's own assertion.
  `DO $$ BEGIN
     CREATE TYPE "public"."promise_category" AS ENUM(
       'education', 'healthcare', 'employment', 'agriculture', 'infrastructure',
       'women', 'youth', 'economy', 'law_and_order', 'environment', 'digital',
       'social_welfare', 'other'
     );
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."promise_scope" AS ENUM(
       'national', 'state', 'district', 'constituency', 'unspecified'
     );
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // The revision pipeline routes on this enum, so the value must exist before
  // any promise revision can be proposed. Its own statement, own transaction.
  `ALTER TYPE "public"."revision_entity" ADD VALUE IF NOT EXISTS 'manifesto_promise'`,
  `CREATE TABLE IF NOT EXISTS "manifesto_promises" (
     "id" uuid PRIMARY KEY,
     "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
     "party_id" text REFERENCES "parties"("id"),
     "election_id" uuid REFERENCES "elections"("id"),
     "state_id" text REFERENCES "states"("id"),
     "official_text" text NOT NULL,
     "official_lang" text DEFAULT 'en' NOT NULL,
     "plain_text" text,
     "category" "promise_category" DEFAULT 'other' NOT NULL,
     "scope" "promise_scope" DEFAULT 'unspecified' NOT NULL,
     "stated_timeline" text,
     "stated_budget_inr" numeric,
     "page_ref" text,
     "sort_order" integer DEFAULT 0 NOT NULL,
     "search_tsv" tsvector GENERATED ALWAYS AS (
       to_tsvector('english', coalesce(official_text, '') || ' ' || coalesce(plain_text, ''))
     ) STORED,
     "created_at" timestamp with time zone DEFAULT now() NOT NULL,
     "deleted_at" timestamp with time zone
   )`,
  `CREATE INDEX IF NOT EXISTS "promises_search_idx" ON "manifesto_promises" USING gin ("search_tsv")`,
  `CREATE INDEX IF NOT EXISTS "promises_document_idx" ON "manifesto_promises" ("document_id")`,
  `CREATE INDEX IF NOT EXISTS "promises_party_idx" ON "manifesto_promises" ("party_id")`,
  `CREATE INDEX IF NOT EXISTS "promises_election_idx" ON "manifesto_promises" ("election_id")`,
  `CREATE INDEX IF NOT EXISTS "promises_category_idx" ON "manifesto_promises" ("category")`,
];

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.log("[ensure-upgrades] DATABASE_URL not set — skipping (nothing to upgrade).");
  process.exit(0);
}

async function run() {
  let query;
  let done = async () => {};

  if (process.env.DATABASE_DRIVER === "neon") {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    // Each .query() is its own HTTP request = its own transaction, which is
    // exactly what new-enum-value-then-use sequencing requires.
    query = (s) => sql.query(s);
  } else {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    query = (s) => client.query(s);
    done = () => client.end();
  }

  let applied = 0;
  for (const [i, statement] of STATEMENTS.entries()) {
    try {
      await query(statement);
      applied++;
    } catch (e) {
      console.error(`[ensure-upgrades] statement ${i + 1}/${STATEMENTS.length} failed:`);
      console.error(statement.split("\n")[0]);
      console.error(String(e?.message ?? e));
      await done();
      process.exit(1); // fail the build loudly rather than deploy skewed code
    }
  }
  await done();
  console.log(`[ensure-upgrades] OK — ${applied}/${STATEMENTS.length} statements ensured.`);
}

run();
