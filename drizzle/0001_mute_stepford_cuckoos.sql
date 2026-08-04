CREATE TYPE "public"."election_scope" AS ENUM('state_assembly', 'lok_sabha');--> statement-breakpoint
CREATE TYPE "public"."revision_origin" AS ENUM('community', 'import');--> statement-breakpoint
ALTER TABLE "election_results" ADD COLUMN "seats_contested" integer;--> statement-breakpoint
ALTER TABLE "election_results" ADD COLUMN "alliance_name" text;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "scope" "election_scope" DEFAULT 'state_assembly' NOT NULL;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "assembly_number" integer;--> statement-breakpoint
ALTER TABLE "revisions" ADD COLUMN "origin" "revision_origin" DEFAULT 'community' NOT NULL;