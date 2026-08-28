import { desc, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { revisions, sources } from "@/lib/db/schema";
import { SOURCE_KIND_LABELS } from "@/lib/format";

/**
 * Real data for the landing bands from design handoff 21. The handoff shipped
 * placeholder figures with the explicit instruction that they must not ship
 * as facts; these queries are what the placeholders become. Everything here
 * is read-only and refreshes with the page's revalidate window.
 */

export type LedgerRow = {
  title: string;
  summary: string;
  pending: boolean;
  when: string;
};

/** "2H AGO" / "YESTERDAY" / "6D AGO" / "12 MAR 2026", in the ledger's voice. */
function relTime(d: Date, now = new Date()): string {
  const ms = now.getTime() - d.getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "JUST NOW";
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "YESTERDAY";
  if (days < 7) return `${days}D AGO`;
  return d
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    .toUpperCase();
}

/** The five most recent public edits, plus the all-time count. */
export async function getLedgerFeed(): Promise<{ rows: LedgerRow[]; total: number }> {
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        title: revisions.title,
        summary: revisions.summary,
        status: revisions.status,
        createdAt: revisions.createdAt,
      })
      .from(revisions)
      .where(inArray(revisions.status, ["approved", "pending"]))
      .orderBy(desc(revisions.createdAt))
      .limit(5),
    db.select({ n: sql<number>`count(*)` }).from(revisions),
  ]);
  return {
    rows: rows.map((r) => ({
      title: r.title,
      summary: r.summary,
      pending: r.status === "pending",
      when: relTime(r.createdAt),
    })),
    total: Number(totalRows[0]?.n ?? 0),
  };
}

export type EraRange = { from: number; to: number };

/**
 * How many records the archive holds that touch an era: elections held in it,
 * published events during it, and terms overlapping it. A count of what IS
 * recorded, never a claim about what the era contained.
 */
export async function getCollectionCounts(ranges: EraRange[]): Promise<number[]> {
  return Promise.all(
    ranges.map(async ({ from, to }) => {
      const res = await db.execute(sql`
        SELECT
          (SELECT count(*) FROM elections e
            WHERE e.deleted_at IS NULL
              AND extract(year from e.election_date) BETWEEN ${from} AND ${to})
        + (SELECT count(*) FROM events ev
            WHERE ev.deleted_at IS NULL AND ev.status = 'published'
              AND ev.year BETWEEN ${from} AND ${to})
        + (SELECT count(*) FROM terms t
            WHERE t.deleted_at IS NULL
              AND extract(year from t.start_date) <= ${to}
              AND (t.end_date IS NULL OR extract(year from t.end_date) >= ${from}))
        AS n
      `);
      return Number((res.rows[0] as { n: string | number }).n);
    }),
  );
}

/** The kinds of source the archive actually cites, as display labels. */
export async function getSourceKinds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ kind: sql<string>`${sources.kind}::text` })
    .from(sources)
    .where(isNotNull(sources.kind));
  const present = new Set(rows.map((r) => r.kind));
  // SOURCE_KIND_LABELS' own order is the display preference; "other" says
  // nothing on a provenance strip.
  return Object.entries(SOURCE_KIND_LABELS)
    .filter(([k]) => k !== "other" && present.has(k))
    .map(([, label]) => label)
    .slice(0, 6);
}
