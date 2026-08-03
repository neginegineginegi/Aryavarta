CREATE TYPE "public"."event_status" AS ENUM('draft', 'pending_review', 'published', 'rejected', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('paper_leak', 'governance_failure', 'corruption', 'policy_failure', 'communal_incident', 'infrastructure_failure', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_kind" AS ENUM('issue', 'dispute');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."revision_action" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."revision_entity" AS ENUM('term', 'election', 'event');--> statement-breakpoint
CREATE TYPE "public"."revision_status" AS ENUM('pending', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."state_kind" AS ENUM('state', 'union_territory');--> statement-breakpoint
CREATE TYPE "public"."term_kind" AS ENUM('cm', 'presidents_rule');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('contributor', 'moderator', 'admin');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "election_results" (
	"election_id" uuid NOT NULL,
	"party_id" text NOT NULL,
	"seats_won" integer NOT NULL,
	"vote_share_percent" numeric(5, 2),
	CONSTRAINT "election_results_election_id_party_id_pk" PRIMARY KEY("election_id","party_id")
);
--> statement-breakpoint
CREATE TABLE "election_sources" (
	"election_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "election_sources_election_id_source_id_pk" PRIMARY KEY("election_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "elections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"state_id" text NOT NULL,
	"election_date" date NOT NULL,
	"result_summary" text,
	"total_seats" integer,
	"turnout_percent" numeric(5, 2),
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_sources" (
	"event_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "event_sources_event_id_source_id_pk" PRIMARY KEY("event_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"state_id" text NOT NULL,
	"year" integer NOT NULL,
	"event_date" date,
	"type" "event_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "event_status" DEFAULT 'pending_review' NOT NULL,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B')) STORED,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text,
	"color" text DEFAULT '#8a8a8a' NOT NULL,
	"is_pseudo" boolean DEFAULT false NOT NULL,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(abbreviation, ''))) STORED,
	CONSTRAINT "parties_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "report_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_type" "revision_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" "report_kind" DEFAULT 'issue' NOT NULL,
	"opened_by" text,
	"reporter_contact" text,
	"reason" text NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolution_note" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_type" "revision_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"state_id" text NOT NULL,
	"action" "revision_action" NOT NULL,
	"schema_version" smallint DEFAULT 1 NOT NULL,
	"before_data" jsonb,
	"after_data" jsonb,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"status" "revision_status" DEFAULT 'pending' NOT NULL,
	"proposed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	CONSTRAINT "revisions_payload_shape" CHECK ((action <> 'create' OR before_data IS NULL) AND (action <> 'delete' OR after_data IS NULL) AND (action = 'create' OR before_data IS NOT NULL) AND (action = 'delete' OR after_data IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"publisher" text,
	"published_on" date,
	"accessed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "states" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "state_kind" NOT NULL,
	"formed_on" date,
	"dissolved_on" date,
	"has_geometry" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "term_sources" (
	"term_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "term_sources_term_id_source_id_pk" PRIMARY KEY("term_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"state_id" text NOT NULL,
	"kind" "term_kind" DEFAULT 'cm' NOT NULL,
	"cm_name" text,
	"party_id" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"notes" text,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(cm_name, ''))) STORED,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_pr_nulls" CHECK (kind <> 'presidents_rule' OR (cm_name IS NULL AND party_id IS NULL)),
	CONSTRAINT "terms_cm_fields" CHECK (kind <> 'cm' OR (cm_name IS NOT NULL AND party_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"role" "user_role" DEFAULT 'contributor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_results" ADD CONSTRAINT "election_results_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_results" ADD CONSTRAINT "election_results_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_sources" ADD CONSTRAINT "election_sources_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_sources" ADD CONSTRAINT "election_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_sources" ADD CONSTRAINT "term_sources_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_sources" ADD CONSTRAINT "term_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "elections_state_date_idx" ON "elections" USING btree ("state_id","election_date");--> statement-breakpoint
CREATE INDEX "events_state_year_idx" ON "events" USING btree ("state_id","year");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_search_idx" ON "events" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "parties_search_idx" ON "parties" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "reports_entity_idx" ON "reports" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "revisions_queue_idx" ON "revisions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "revisions_entity_idx" ON "revisions" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "revisions_user_idx" ON "revisions" USING btree ("proposed_by","created_at");--> statement-breakpoint
CREATE INDEX "revisions_state_idx" ON "revisions" USING btree ("state_id","status");--> statement-breakpoint
CREATE INDEX "terms_state_start_idx" ON "terms" USING btree ("state_id","start_date");--> statement-breakpoint
CREATE INDEX "terms_search_idx" ON "terms" USING gin ("search_tsv");