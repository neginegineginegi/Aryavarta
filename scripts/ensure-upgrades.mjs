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
