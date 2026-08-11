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
  // --- upgrade 9: India Funding and Influence Map ---------------------------
  // Design: docs/FUNDING_INFLUENCE_ARCHITECTURE.md. Schema only; the ingest
  // pipeline and the interface follow in later phases. Additive throughout:
  // no existing table changes shape.
  `DO $$ BEGIN
     CREATE TYPE "public"."alias_kind" AS ENUM('legal_name', 'former_name', 'abbreviation', 'transliteration', 'alias', 'misspelling');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."board_role_kind" AS ENUM('founder', 'trustee', 'director', 'board_member', 'chairperson', 'editor', 'chief_executive', 'secretary', 'treasurer', 'advisor', 'employee', 'spokesperson', 'other');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."campaign_stance" AS ENUM('against', 'for', 'neutral', 'unstated');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."case_party_side" AS ENUM('petitioner', 'respondent', 'intervenor', 'amicus');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."claim_type" AS ENUM('funding', 'control', 'coordination', 'influence', 'affiliation', 'conflict_of_interest', 'outcome_attribution', 'misconduct', 'other');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."entity_ref" AS ENUM('org', 'person', 'party', 'state', 'project', 'campaign', 'legal_case', 'publication');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."evidence_status" AS ENUM('verified', 'documented', 'alleged', 'disputed', 'inferred', 'unknown');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."fcra_status" AS ENUM('active', 'suspended', 'cancelled', 'expired', 'renewed', 'unknown');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."funding_type" AS ENUM('grant', 'donation', 'csr', 'government_grant', 'contract', 'membership', 'subscription', 'advertising', 'investment', 'loan', 'in_kind', 'other');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."legal_case_kind" AS ENUM('pil', 'writ', 'civil', 'criminal', 'regulatory', 'tribunal', 'appeal', 'other');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."match_status" AS ENUM('possible', 'confirmed', 'rejected');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."org_kind" AS ENUM('ngo', 'trust', 'society', 'foundation', 'think_tank', 'advocacy', 'media', 'research', 'company', 'government_body', 'political', 'international', 'religious', 'professional_body', 'other');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."outcome_kind" AS ENUM('project_delayed', 'project_cancelled', 'project_completed', 'policy_changed', 'policy_withdrawn', 'investigation_initiated', 'court_ruling', 'regulatory_action', 'government_response', 'no_documented_outcome', 'disputed');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."project_kind" AS ENUM('infrastructure', 'policy', 'regulation', 'programme', 'industry', 'other');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."publication_kind" AS ENUM('report', 'article', 'investigation', 'statement', 'paper', 'dataset', 'other');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."relation_kind" AS ENUM('funded', 'founded', 'owns', 'sits_on_board', 'employed_by', 'partnered_with', 'member_of', 'advised', 'published', 'filed_case_against', 'targeted', 'successor_of', 'campaigned_for', 'campaigned_against', 'campaigned_regarding');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."verification_result" AS ENUM('confirmed', 'could_not_confirm', 'contradicted');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TYPE "public"."revision_entity" ADD VALUE IF NOT EXISTS 'org'`,
  `ALTER TYPE "public"."revision_entity" ADD VALUE IF NOT EXISTS 'person_record'`,
  `ALTER TYPE "public"."revision_entity" ADD VALUE IF NOT EXISTS 'funding_transaction'`,
  `ALTER TYPE "public"."revision_entity" ADD VALUE IF NOT EXISTS 'fcra_registration'`,
  `ALTER TYPE "public"."revision_entity" ADD VALUE IF NOT EXISTS 'board_position'`,
  `ALTER TYPE "public"."revision_entity" ADD VALUE IF NOT EXISTS 'relationship'`,
  `ALTER TYPE "public"."revision_entity" ADD VALUE IF NOT EXISTS 'claim'`,
  `ALTER TYPE "public"."revision_entity" ADD VALUE IF NOT EXISTS 'campaign'`,
  `ALTER TYPE "public"."revision_entity" ADD VALUE IF NOT EXISTS 'project_record'`,
  `ALTER TYPE "public"."revision_entity" ADD VALUE IF NOT EXISTS 'publication'`,
  `ALTER TYPE "public"."revision_entity" ADD VALUE IF NOT EXISTS 'legal_case'`,
  `ALTER TYPE "public"."revision_entity" ADD VALUE IF NOT EXISTS 'outcome'`,
  `ALTER TYPE "public"."revision_entity" ADD VALUE IF NOT EXISTS 'open_question'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'org'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'person_record'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'funding_transaction'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'fcra_registration'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'board_position'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'relationship'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'claim'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'claim_response'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'campaign'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'campaign_target'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'project_record'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'publication'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'legal_case'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'outcome'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'entity_alias'`,
  `ALTER TYPE "public"."source_kind" ADD VALUE IF NOT EXISTS 'fcra_filing'`,
  `ALTER TYPE "public"."source_kind" ADD VALUE IF NOT EXISTS 'regulatory_filing'`,
  `ALTER TYPE "public"."source_kind" ADD VALUE IF NOT EXISTS 'corporate_filing'`,
  `ALTER TYPE "public"."source_kind" ADD VALUE IF NOT EXISTS 'audited_statement'`,
  `ALTER TYPE "public"."source_kind" ADD VALUE IF NOT EXISTS 'annual_report'`,
  `ALTER TYPE "public"."source_kind" ADD VALUE IF NOT EXISTS 'grant_database'`,
  `ALTER TYPE "public"."source_kind" ADD VALUE IF NOT EXISTS 'org_document'`,
  `ALTER TYPE "public"."source_kind" ADD VALUE IF NOT EXISTS 'org_statement'`,
  `ALTER TYPE "public"."source_kind" ADD VALUE IF NOT EXISTS 'parliamentary_record'`,
  `ALTER TYPE "public"."source_kind" ADD VALUE IF NOT EXISTS 'social_media'`,
  `CREATE TABLE IF NOT EXISTS "board_positions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"role" text NOT NULL,
	"role_kind" "board_role_kind" DEFAULT 'board_member' NOT NULL,
	"start_on" date,
	"end_on" date,
	"evidence_status" "evidence_status" DEFAULT 'documented' NOT NULL,
	"retrieved_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_dates_ordered" CHECK (end_on IS NULL OR start_on IS NULL OR end_on >= start_on)
)`,
  `CREATE TABLE IF NOT EXISTS "campaign_participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"participant_type" "entity_ref" NOT NULL,
	"participant_id" uuid NOT NULL,
	"role" text,
	"evidence_status" "evidence_status" DEFAULT 'documented' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "campaign_targets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"target_type" "entity_ref" NOT NULL,
	"target_id" uuid NOT NULL,
	"stance" "campaign_stance" DEFAULT 'unstated' NOT NULL,
	"evidence_status" "evidence_status" DEFAULT 'documented' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"issue" text,
	"state_id" text,
	"start_on" date,
	"end_on" date,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_slug_unique" UNIQUE("slug")
)`,
  `CREATE TABLE IF NOT EXISTS "claim_responses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"claim_id" uuid NOT NULL,
	"respondent_type" "entity_ref",
	"respondent_id" uuid,
	"respondent_name" text,
	"response" text NOT NULL,
	"responded_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"statement" text NOT NULL,
	"claim_type" "claim_type" NOT NULL,
	"subject_type" "entity_ref",
	"subject_id" uuid,
	"object_type" "entity_ref",
	"object_id" uuid,
	"status" "evidence_status" NOT NULL,
	"asserted_by_type" "entity_ref",
	"asserted_by_id" uuid,
	"asserted_by_name" text,
	"asserted_on" date,
	"rationale" text,
	"period_start" date,
	"period_end" date,
	"entered_by" text,
	"entered_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claims_alleged_needs_asserter" CHECK (status <> 'alleged' OR asserted_by_id IS NOT NULL OR asserted_by_name IS NOT NULL),
	CONSTRAINT "claims_inferred_needs_rationale" CHECK (status <> 'inferred' OR (rationale IS NOT NULL AND length(btrim(rationale)) > 0))
)`,
  `CREATE TABLE IF NOT EXISTS "entity_aliases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_type" "entity_ref" NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "alias_kind" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "entity_match_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_type" "entity_ref" NOT NULL,
	"a_id" uuid NOT NULL,
	"b_id" uuid NOT NULL,
	"status" "match_status" DEFAULT 'possible' NOT NULL,
	"rationale" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_match_distinct" CHECK (a_id <> b_id)
)`,
  `CREATE TABLE IF NOT EXISTS "fcra_registrations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"registration_number" text,
	"status" "fcra_status" DEFAULT 'unknown' NOT NULL,
	"granted_on" date,
	"valid_until" date,
	"action_on" date,
	"action_kind" text,
	"action_note" text,
	"evidence_status" "evidence_status" DEFAULT 'verified' NOT NULL,
	"retrieved_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "funding_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"donor_type" "entity_ref" NOT NULL,
	"donor_id" uuid NOT NULL,
	"recipient_type" "entity_ref" NOT NULL,
	"recipient_id" uuid NOT NULL,
	"amount" numeric(20, 2),
	"currency" text,
	"financial_year" text,
	"occurred_on" date,
	"funding_type" "funding_type" DEFAULT 'grant' NOT NULL,
	"stated_purpose" text,
	"programme" text,
	"donor_country" text,
	"reported_under_fcra" boolean,
	"evidence_status" "evidence_status" DEFAULT 'documented' NOT NULL,
	"notes" text,
	"retrieved_on" date,
	"entered_by" text,
	"entered_on" date,
	"verified_by" text,
	"verified_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funding_amount_nonneg" CHECK (amount IS NULL OR amount >= 0)
)`,
  `CREATE TABLE IF NOT EXISTS "legal_case_parties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"party_type" "entity_ref" NOT NULL,
	"party_id" uuid NOT NULL,
	"side" "case_party_side" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "legal_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"court" text,
	"case_number" text,
	"kind" "legal_case_kind" DEFAULT 'writ' NOT NULL,
	"filed_on" date,
	"decided_on" date,
	"state_id" text,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_cases_slug_unique" UNIQUE("slug")
)`,
  `CREATE TABLE IF NOT EXISTS "open_questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_type" "entity_ref" NOT NULL,
	"subject_id" uuid NOT NULL,
	"question" text NOT NULL,
	"why_it_matters" text,
	"what_would_answer_it" text,
	"resolved_on" date,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "orgs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "org_kind" NOT NULL,
	"legal_name" text,
	"registration_number" text,
	"registration_type" text,
	"incorporated_on" date,
	"dissolved_on" date,
	"state_id" text,
	"city" text,
	"website" text,
	"summary" text,
	"parent_org_id" uuid,
	"entered_by" text,
	"entered_on" date,
	"verified_by" text,
	"verified_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orgs_slug_unique" UNIQUE("slug")
)`,
  `CREATE TABLE IF NOT EXISTS "outcomes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_type" "entity_ref" NOT NULL,
	"subject_id" uuid NOT NULL,
	"kind" "outcome_kind" NOT NULL,
	"occurred_on" date,
	"summary" text NOT NULL,
	"evidence_status" "evidence_status" DEFAULT 'documented' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "people" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"public_role_basis" text NOT NULL,
	"birth_year" integer,
	"summary" text,
	"state_id" text,
	"entered_by" text,
	"entered_on" date,
	"verified_by" text,
	"verified_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_slug_unique" UNIQUE("slug")
)`,
  `CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "project_kind" NOT NULL,
	"state_id" text,
	"operator_org_id" uuid,
	"announced_on" date,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
)`,
  `CREATE TABLE IF NOT EXISTS "publications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"kind" "publication_kind" DEFAULT 'report' NOT NULL,
	"published_on" date,
	"url" text,
	"publisher_org_id" uuid,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publications_slug_unique" UNIQUE("slug")
)`,
  `CREATE TABLE IF NOT EXISTS "relationships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "relation_kind" NOT NULL,
	"from_type" "entity_ref" NOT NULL,
	"from_id" uuid NOT NULL,
	"to_type" "entity_ref" NOT NULL,
	"to_id" uuid NOT NULL,
	"start_on" date,
	"end_on" date,
	"detail" text,
	"evidence_status" "evidence_status" DEFAULT 'documented' NOT NULL,
	"retrieved_on" date,
	"entered_by" text,
	"entered_on" date,
	"verified_by" text,
	"verified_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relationships_dates_ordered" CHECK (end_on IS NULL OR start_on IS NULL OR end_on >= start_on)
)`,
  `CREATE TABLE IF NOT EXISTS "verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_type" "citation_subject" NOT NULL,
	"subject_id" text NOT NULL,
	"result" "verification_result" NOT NULL,
	"method" text NOT NULL,
	"note" text,
	"verified_by" text,
	"verified_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `DO $$ BEGIN
     ALTER TABLE "board_positions" ADD CONSTRAINT "board_positions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "board_positions" ADD CONSTRAINT "board_positions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "campaign_participants" ADD CONSTRAINT "campaign_participants_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "campaign_targets" ADD CONSTRAINT "campaign_targets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "claim_responses" ADD CONSTRAINT "claim_responses_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "claims" ADD CONSTRAINT "claims_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "entity_match_candidates" ADD CONSTRAINT "entity_match_candidates_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "fcra_registrations" ADD CONSTRAINT "fcra_registrations_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "funding_transactions" ADD CONSTRAINT "funding_transactions_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "funding_transactions" ADD CONSTRAINT "funding_transactions_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "legal_case_parties" ADD CONSTRAINT "legal_case_parties_case_id_legal_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."legal_cases"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "legal_cases" ADD CONSTRAINT "legal_cases_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "orgs" ADD CONSTRAINT "orgs_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "orgs" ADD CONSTRAINT "orgs_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "orgs" ADD CONSTRAINT "orgs_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "people" ADD CONSTRAINT "people_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "people" ADD CONSTRAINT "people_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "people" ADD CONSTRAINT "people_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "projects" ADD CONSTRAINT "projects_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "projects" ADD CONSTRAINT "projects_operator_org_id_orgs_id_fk" FOREIGN KEY ("operator_org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "publications" ADD CONSTRAINT "publications_publisher_org_id_orgs_id_fk" FOREIGN KEY ("publisher_org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "relationships" ADD CONSTRAINT "relationships_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "relationships" ADD CONSTRAINT "relationships_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "verifications" ADD CONSTRAINT "verifications_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "board_person_idx" ON "board_positions" USING btree ("person_id")`,
  `CREATE INDEX IF NOT EXISTS "board_org_idx" ON "board_positions" USING btree ("org_id")`,
  `CREATE INDEX IF NOT EXISTS "campaign_participants_campaign_idx" ON "campaign_participants" USING btree ("campaign_id")`,
  `CREATE INDEX IF NOT EXISTS "campaign_participants_entity_idx" ON "campaign_participants" USING btree ("participant_type","participant_id")`,
  `CREATE INDEX IF NOT EXISTS "campaign_targets_campaign_idx" ON "campaign_targets" USING btree ("campaign_id")`,
  `CREATE INDEX IF NOT EXISTS "campaign_targets_target_idx" ON "campaign_targets" USING btree ("target_type","target_id")`,
  `CREATE INDEX IF NOT EXISTS "campaigns_state_idx" ON "campaigns" USING btree ("state_id")`,
  `CREATE INDEX IF NOT EXISTS "claim_responses_claim_idx" ON "claim_responses" USING btree ("claim_id")`,
  `CREATE INDEX IF NOT EXISTS "claims_subject_idx" ON "claims" USING btree ("subject_type","subject_id")`,
  `CREATE INDEX IF NOT EXISTS "claims_object_idx" ON "claims" USING btree ("object_type","object_id")`,
  `CREATE INDEX IF NOT EXISTS "claims_type_idx" ON "claims" USING btree ("claim_type")`,
  `CREATE INDEX IF NOT EXISTS "entity_aliases_entity_idx" ON "entity_aliases" USING btree ("entity_type","entity_id")`,
  `CREATE INDEX IF NOT EXISTS "entity_aliases_name_idx" ON "entity_aliases" USING btree ("name")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "entity_match_pair_idx" ON "entity_match_candidates" USING btree ("entity_type","a_id","b_id")`,
  `CREATE INDEX IF NOT EXISTS "fcra_org_idx" ON "fcra_registrations" USING btree ("org_id")`,
  `CREATE INDEX IF NOT EXISTS "funding_donor_idx" ON "funding_transactions" USING btree ("donor_type","donor_id")`,
  `CREATE INDEX IF NOT EXISTS "funding_recipient_idx" ON "funding_transactions" USING btree ("recipient_type","recipient_id")`,
  `CREATE INDEX IF NOT EXISTS "funding_year_idx" ON "funding_transactions" USING btree ("financial_year")`,
  `CREATE INDEX IF NOT EXISTS "funding_country_idx" ON "funding_transactions" USING btree ("donor_country")`,
  `CREATE INDEX IF NOT EXISTS "legal_case_parties_case_idx" ON "legal_case_parties" USING btree ("case_id")`,
  `CREATE INDEX IF NOT EXISTS "legal_case_parties_entity_idx" ON "legal_case_parties" USING btree ("party_type","party_id")`,
  `CREATE INDEX IF NOT EXISTS "legal_cases_state_idx" ON "legal_cases" USING btree ("state_id")`,
  `CREATE INDEX IF NOT EXISTS "open_questions_subject_idx" ON "open_questions" USING btree ("subject_type","subject_id")`,
  `CREATE INDEX IF NOT EXISTS "orgs_kind_idx" ON "orgs" USING btree ("kind")`,
  `CREATE INDEX IF NOT EXISTS "orgs_state_idx" ON "orgs" USING btree ("state_id")`,
  `CREATE INDEX IF NOT EXISTS "outcomes_subject_idx" ON "outcomes" USING btree ("subject_type","subject_id")`,
  `CREATE INDEX IF NOT EXISTS "people_name_idx" ON "people" USING btree ("name")`,
  `CREATE INDEX IF NOT EXISTS "projects_state_idx" ON "projects" USING btree ("state_id")`,
  `CREATE INDEX IF NOT EXISTS "publications_org_idx" ON "publications" USING btree ("publisher_org_id")`,
  `CREATE INDEX IF NOT EXISTS "relationships_from_idx" ON "relationships" USING btree ("from_type","from_id")`,
  `CREATE INDEX IF NOT EXISTS "relationships_to_idx" ON "relationships" USING btree ("to_type","to_id")`,
  `CREATE INDEX IF NOT EXISTS "relationships_kind_idx" ON "relationships" USING btree ("kind")`,
  `CREATE INDEX IF NOT EXISTS "verifications_subject_idx" ON "verifications" USING btree ("subject_type","subject_id")`,

  // --- upgrade 10: graph phase A -------------------------------------------
  // The views must go first and be rebuilt at the end. A view that selects a
  // column pins that column's type, so on the SECOND run of this file (it runs
  // before every build) the ALTER COLUMNs below would fail with "cannot alter
  // type of a column used by a view". Views hold no data, so dropping and
  // recreating them costs nothing.
  `DROP VIEW IF EXISTS graph_edges`,
  `DROP VIEW IF EXISTS graph_nodes`,
  // Polymorphic entity ids become text. Orgs and people carry UUIDs but party
  // ids are slugs and state ids are two-letter codes, so uuid columns put both
  // out of the graph's reach: exactly the nodes that join this layer to the
  // political record. `citations.subject_id` already made this choice.
  `ALTER TABLE "entity_aliases" ALTER COLUMN "entity_id" TYPE text USING "entity_id"::text`,
  // The a_id <> b_id check compares the two columns, so it has to come off
  // before the first one changes type and go back on after the second.
  `ALTER TABLE "entity_match_candidates" DROP CONSTRAINT IF EXISTS "entity_match_distinct"`,
  `ALTER TABLE "entity_match_candidates" ALTER COLUMN "a_id" TYPE text USING "a_id"::text`,
  `ALTER TABLE "entity_match_candidates" ALTER COLUMN "b_id" TYPE text USING "b_id"::text`,
  `DO $$ BEGIN
     ALTER TABLE "entity_match_candidates" ADD CONSTRAINT "entity_match_distinct" CHECK (a_id <> b_id);
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE "funding_transactions" ALTER COLUMN "donor_id" TYPE text USING "donor_id"::text`,
  `ALTER TABLE "funding_transactions" ALTER COLUMN "recipient_id" TYPE text USING "recipient_id"::text`,
  `ALTER TABLE "campaign_participants" ALTER COLUMN "participant_id" TYPE text USING "participant_id"::text`,
  `ALTER TABLE "campaign_targets" ALTER COLUMN "target_id" TYPE text USING "target_id"::text`,
  `ALTER TABLE "legal_case_parties" ALTER COLUMN "party_id" TYPE text USING "party_id"::text`,
  `ALTER TABLE "outcomes" ALTER COLUMN "subject_id" TYPE text USING "subject_id"::text`,
  `ALTER TABLE "relationships" ALTER COLUMN "from_id" TYPE text USING "from_id"::text`,
  `ALTER TABLE "relationships" ALTER COLUMN "to_id" TYPE text USING "to_id"::text`,
  `ALTER TABLE "claims" ALTER COLUMN "subject_id" TYPE text USING "subject_id"::text`,
  `ALTER TABLE "claims" ALTER COLUMN "object_id" TYPE text USING "object_id"::text`,
  `ALTER TABLE "claims" ALTER COLUMN "asserted_by_id" TYPE text USING "asserted_by_id"::text`,
  `ALTER TABLE "claim_responses" ALTER COLUMN "respondent_id" TYPE text USING "respondent_id"::text`,
  `ALTER TABLE "open_questions" ALTER COLUMN "subject_id" TYPE text USING "subject_id"::text`,
  // Outcomes become nodes, so a documented result can sit at the end of a path.
  `ALTER TYPE "public"."entity_ref" ADD VALUE IF NOT EXISTS 'outcome'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'campaign_participant'`,
  `ALTER TYPE "public"."citation_subject" ADD VALUE IF NOT EXISTS 'legal_case_party'`,
  // A relation may carry its own figure (a shareholding, a contract value)
  // without being a funding transaction.
  `ALTER TABLE "relationships" ADD COLUMN IF NOT EXISTS "amount" numeric(20, 2)`,
  `ALTER TABLE "relationships" ADD COLUMN IF NOT EXISTS "currency" text`,
  `ALTER TABLE "relationships" ADD COLUMN IF NOT EXISTS "confidence" smallint`,
  `ALTER TABLE "relationships" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL`,
  `DO $$ BEGIN
     ALTER TABLE "relationships" ADD CONSTRAINT "relationships_confidence_range"
       CHECK (confidence IS NULL OR (confidence BETWEEN 0 AND 100));
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  // --- upgrade 10b: the unified edge and node projection --------------------
  // Edges live in nine specific tables, each with fields of its own. The graph
  // needs one shape. These views PROJECT stored columns; they never join two
  // facts to invent a third, so nothing here is a derived relationship.
  //
  // `interpretive` separates the two halves of the layer. False for the
  // factual tables, true for claims, so the renderer can never draw an
  // asserted relationship the way it draws a documented one.
  `CREATE VIEW graph_nodes AS
     SELECT 'org'::text AS node_type, o.id::text AS node_id, o.name AS label,
            o.kind::text AS sub_kind, o.state_id, o.incorporated_on AS started_on,
            o.dissolved_on AS ended_on
       FROM orgs o
     UNION ALL
     SELECT 'person', p.id::text, p.name, NULL, p.state_id, NULL, NULL FROM people p
     UNION ALL
     SELECT 'project', pr.id::text, pr.name, pr.kind::text, pr.state_id, pr.announced_on, NULL
       FROM projects pr
     UNION ALL
     SELECT 'campaign', c.id::text, c.name, NULL, c.state_id, c.start_on, c.end_on
       FROM campaigns c
     UNION ALL
     SELECT 'legal_case', lc.id::text, lc.title, lc.kind::text, lc.state_id, lc.filed_on,
            lc.decided_on
       FROM legal_cases lc
     UNION ALL
     SELECT 'publication', pb.id::text, pb.title, pb.kind::text, NULL, pb.published_on, NULL
       FROM publications pb
     UNION ALL
     SELECT 'outcome', oc.id::text, oc.summary, oc.kind::text, NULL, oc.occurred_on, NULL
       FROM outcomes oc
     UNION ALL
     SELECT 'party', pa.id, pa.name, NULL, NULL, NULL, NULL FROM parties pa
     UNION ALL
     SELECT 'state', st.id, st.name, st.kind::text, st.id, st.formed_on, st.dissolved_on
       FROM states st`,
  `CREATE VIEW graph_edges AS
     SELECT 'relationship:' || r.id::text AS edge_id, 'relationships'::text AS edge_table,
            r.id::text AS row_id, r.kind::text AS kind, false AS interpretive,
            r.from_type::text AS from_type, r.from_id, r.to_type::text AS to_type, r.to_id,
            r.start_on, r.end_on,
            EXTRACT(YEAR FROM r.start_on)::int AS year_from,
            EXTRACT(YEAR FROM r.end_on)::int AS year_to,
            r.amount, r.currency, r.evidence_status::text AS evidence_status,
            'relationship'::text AS citation_subject, r.id::text AS citation_subject_id,
            r.detail
       FROM relationships r
     UNION ALL
     -- '2022-23' is the source's own label. An Indian financial year runs April
     -- to March, so that label spans two calendar years and the window has to
     -- be 2022..2023: collapsing it to 2022 makes a grant vanish from half the
     -- period it actually covers. Reading the label is mechanical; the span is
     -- what the label means, not a guess about the payment date.
     SELECT 'funding:' || f.id::text, 'funding_transactions', f.id::text, 'funded', false,
            f.donor_type::text, f.donor_id, f.recipient_type::text, f.recipient_id,
            f.occurred_on, f.occurred_on,
            COALESCE(EXTRACT(YEAR FROM f.occurred_on)::int,
                     NULLIF(substring(f.financial_year from 1 for 4), '')::int),
            COALESCE(EXTRACT(YEAR FROM f.occurred_on)::int,
                     CASE WHEN f.financial_year ~ '^[0-9]{4}-[0-9]{2}$'
                          THEN substring(f.financial_year from 1 for 4)::int + 1
                          ELSE NULLIF(substring(f.financial_year from 1 for 4), '')::int END),
            f.amount, f.currency, f.evidence_status::text,
            'funding_transaction', f.id::text, f.stated_purpose
       FROM funding_transactions f
     UNION ALL
     SELECT 'board:' || b.id::text, 'board_positions', b.id::text, b.role_kind::text, false,
            'person', b.person_id::text, 'org', b.org_id::text,
            b.start_on, b.end_on,
            EXTRACT(YEAR FROM b.start_on)::int, EXTRACT(YEAR FROM b.end_on)::int,
            NULL, NULL, b.evidence_status::text,
            'board_position', b.id::text, b.role
       FROM board_positions b
     UNION ALL
     SELECT 'cparticipant:' || cp.id::text, 'campaign_participants', cp.id::text,
            'participated_in', false,
            cp.participant_type::text, cp.participant_id, 'campaign', cp.campaign_id::text,
            ca.start_on, ca.end_on,
            EXTRACT(YEAR FROM ca.start_on)::int, EXTRACT(YEAR FROM ca.end_on)::int,
            NULL, NULL, cp.evidence_status::text,
            'campaign_participant', cp.id::text, cp.role
       FROM campaign_participants cp JOIN campaigns ca ON ca.id = cp.campaign_id
     UNION ALL
     -- The kind restates the campaign's own recorded stance. A campaign that
     -- has stated no position reads 'campaigned_regarding', never 'against'.
     SELECT 'ctarget:' || ct.id::text, 'campaign_targets', ct.id::text,
            CASE ct.stance WHEN 'against' THEN 'campaigned_against'
                           WHEN 'for' THEN 'campaigned_for'
                           ELSE 'campaigned_regarding' END,
            false,
            'campaign', ct.campaign_id::text, ct.target_type::text, ct.target_id,
            ca.start_on, ca.end_on,
            EXTRACT(YEAR FROM ca.start_on)::int, EXTRACT(YEAR FROM ca.end_on)::int,
            NULL, NULL, ct.evidence_status::text,
            'campaign_target', ct.id::text, ct.stance::text
       FROM campaign_targets ct JOIN campaigns ca ON ca.id = ct.campaign_id
     UNION ALL
     SELECT 'caseparty:' || lp.id::text, 'legal_case_parties', lp.id::text,
            'party_to_case', false,
            lp.party_type::text, lp.party_id, 'legal_case', lp.case_id::text,
            lc.filed_on, lc.decided_on,
            EXTRACT(YEAR FROM lc.filed_on)::int, EXTRACT(YEAR FROM lc.decided_on)::int,
            NULL, NULL, 'documented',
            'legal_case_party', lp.id::text, lp.side::text
       FROM legal_case_parties lp JOIN legal_cases lc ON lc.id = lp.case_id
     UNION ALL
     SELECT 'published:' || pb.id::text, 'publications', pb.id::text, 'published', false,
            'org', pb.publisher_org_id::text, 'publication', pb.id::text,
            pb.published_on, pb.published_on,
            EXTRACT(YEAR FROM pb.published_on)::int, EXTRACT(YEAR FROM pb.published_on)::int,
            NULL, NULL, 'documented',
            'publication', pb.id::text, pb.kind::text
       FROM publications pb WHERE pb.publisher_org_id IS NOT NULL
     UNION ALL
     SELECT 'operates:' || pr.id::text, 'projects', pr.id::text, 'operates', false,
            'org', pr.operator_org_id::text, 'project', pr.id::text,
            pr.announced_on, NULL,
            EXTRACT(YEAR FROM pr.announced_on)::int, NULL,
            NULL, NULL, 'documented',
            'project_record', pr.id::text, pr.kind::text
       FROM projects pr WHERE pr.operator_org_id IS NOT NULL
     UNION ALL
     SELECT 'outcome:' || oc.id::text, 'outcomes', oc.id::text, 'outcome_recorded_for', false,
            oc.subject_type::text, oc.subject_id, 'outcome', oc.id::text,
            oc.occurred_on, oc.occurred_on,
            EXTRACT(YEAR FROM oc.occurred_on)::int, EXTRACT(YEAR FROM oc.occurred_on)::int,
            NULL, NULL, oc.evidence_status::text,
            'outcome', oc.id::text, oc.kind::text
       FROM outcomes oc
     UNION ALL
     -- Org parentage is a stored, cited column on the child row; projecting it
     -- is not deriving it. The citation handle points at the child org, where
     -- the sources for the parentage live.
     SELECT 'parent:' || c.id::text, 'orgs', c.id::text, 'parent_of', false,
            'org', c.parent_org_id::text, 'org', c.id::text,
            NULL, NULL, NULL, NULL,
            NULL, NULL, 'documented',
            'org', c.id::text, NULL
       FROM orgs c WHERE c.parent_org_id IS NOT NULL
     UNION ALL
     -- Interpretation. Always flagged, so the renderer cannot draw an asserted
     -- relationship the way it draws a documented one.
     SELECT 'claim:' || cl.id::text, 'claims', cl.id::text, cl.claim_type::text, true,
            cl.subject_type::text, cl.subject_id, cl.object_type::text, cl.object_id,
            cl.period_start, cl.period_end,
            EXTRACT(YEAR FROM cl.period_start)::int, EXTRACT(YEAR FROM cl.period_end)::int,
            NULL, NULL, cl.status::text,
            'claim', cl.id::text, cl.statement
       FROM claims cl
      WHERE cl.subject_id IS NOT NULL AND cl.object_id IS NOT NULL`,
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
