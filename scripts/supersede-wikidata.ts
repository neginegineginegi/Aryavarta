/* eslint-disable no-console */
/**
 * CSV data supersedes Wikidata imports, by standing instruction of the admin.
 *
 * For every state that appears in the CSV inbox (data/inbox/*.csv), this
 * script:
 *   1. REJECTS still-pending Wikidata drafts (review note records why), and
 *   2. TOMBSTONES live entries that were created from Wikidata drafts, by
 *      recording an approved delete revision (full audit trail) and
 *      soft-deleting the row, exactly like the admin remove button.
 *
 * Runs in the build chain BEFORE load-inbox, so CSV rows previously blocked
 * by Wikidata duplicates load in the same deploy. Idempotent: once no
 * Wikidata-origin content remains in covered states, it does nothing.
 * States never covered by CSV keep their Wikidata drafts untouched.
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

const INBOX = join(process.cwd(), "data", "inbox");
const WIKIDATA_SUMMARY = "Imported from Wikidata%";

function coveredStateKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of ["terms.csv", "elections.csv", "events.csv"]) {
    const p = join(INBOX, file);
    if (!existsSync(p)) continue;
    const [header, ...rows] = readFileSync(p, "utf8").split("\n");
    const stateIdx = header.split(",").findIndex((h) => h.trim().toLowerCase() === "state");
    if (stateIdx !== 0) continue; // state is always the first column in our sheets
    for (const row of rows) {
      const state = row.split(",")[0]?.trim().toLowerCase();
      if (state) keys.add(state);
    }
  }
  return keys;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("[supersede-wikidata] DATABASE_URL not set — skipping.");
    return;
  }
  const keys = coveredStateKeys();
  if (keys.size === 0) {
    console.log("[supersede-wikidata] no CSV inbox states — nothing to supersede.");
    return;
  }

  const { db } = await import("../src/lib/db");
  const { states, revisions, terms, elections, events, users } = await import(
    "../src/lib/db/schema"
  );
  const { snapshotEntity } = await import("../src/lib/revisions/snapshot");

  const stateRows = await db.select().from(states);
  const covered = stateRows
    .filter((s) => keys.has(s.id.toLowerCase()) || keys.has(s.name.toLowerCase()))
    .map((s) => s.id);
  if (covered.length === 0) {
    console.log("[supersede-wikidata] no matching states — nothing to do.");
    return;
  }

  // Reviewer identity: the bootstrapped admin (this is their standing order),
  // falling back to any admin, then the Import Bot.
  const adminEmail = process.env.ADMIN_EMAIL;
  const admin =
    (adminEmail
      ? await db.query.users.findFirst({ where: eq(users.email, adminEmail) })
      : undefined) ??
    (await db.query.users.findFirst({ where: eq(users.role, "admin") })) ??
    (await db.query.users.findFirst({ where: eq(users.email, "import-bot@abhilekh.invalid") }));
  if (!admin) {
    console.log("[supersede-wikidata] no admin/bot user found — skipping (fresh database).");
    return;
  }

  const NOTE = "Superseded by verified bulk data sheets (CSV inbox).";

  // --- 1. reject pending Wikidata drafts in covered states ------------------
  const rejected = await db
    .update(revisions)
    .set({
      status: "rejected",
      reviewedBy: admin.id,
      reviewedAt: new Date(),
      reviewNote: NOTE,
    })
    .where(
      and(
        eq(revisions.status, "pending"),
        eq(revisions.origin, "import"),
        like(revisions.summary, WIKIDATA_SUMMARY),
        inArray(revisions.stateId, covered),
      ),
    )
    .returning({ id: revisions.id });

  // --- 2. tombstone live entries created from Wikidata drafts ---------------
  const liveCreates = await db
    .select({
      entityType: revisions.entityType,
      entityId: revisions.entityId,
      stateId: revisions.stateId,
      title: revisions.title,
    })
    .from(revisions)
    .where(
      and(
        eq(revisions.status, "approved"),
        eq(revisions.origin, "import"),
        eq(revisions.action, "create"),
        like(revisions.summary, WIKIDATA_SUMMARY),
        inArray(revisions.stateId, covered),
      ),
    );

  let removed = 0;
  for (const rev of liveCreates) {
    const before = await snapshotEntity(db, rev.entityType, rev.entityId);
    if (!before) continue; // already gone or tombstoned
    await db.transaction(async (tx) => {
      await tx.insert(revisions).values({
        id: uuidv7(),
        entityType: rev.entityType,
        entityId: rev.entityId,
        stateId: rev.stateId,
        action: "delete",
        schemaVersion: 1,
        beforeData: before,
        afterData: null,
        title: rev.title,
        summary: `[admin removal] ${NOTE}`,
        status: "approved",
        proposedBy: admin.id,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        reviewNote: NOTE,
      });
      if (rev.entityType === "term") {
        await tx.update(terms).set({ deletedAt: sql`now()` }).where(eq(terms.id, rev.entityId));
      } else if (rev.entityType === "election") {
        await tx
          .update(elections)
          .set({ deletedAt: sql`now()` })
          .where(eq(elections.id, rev.entityId));
      } else {
        await tx.update(events).set({ deletedAt: sql`now()` }).where(eq(events.id, rev.entityId));
      }
    });
    removed++;
  }

  console.log(
    `[supersede-wikidata] states covered: ${covered.length}; pending Wikidata drafts rejected: ${rejected.length}; live Wikidata entries tombstoned: ${removed}.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("[supersede-wikidata] failed:", e);
  process.exit(1);
});
