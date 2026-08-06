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
