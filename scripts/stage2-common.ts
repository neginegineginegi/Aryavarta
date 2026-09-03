/**
 * Machinery every stage-2 insert script shares (gate rulings 2026-09-03):
 *
 * - The backup gate: an insert refuses to run unless scripts/restore-drill.sh
 *   has VERIFIED a restore within the last 24 hours, against the same
 *   database, recorded in a marker file that script writes. Never an env var.
 * - The confirm gate: without --confirm a stage-2 run stops after printing
 *   its plan; only the explicit flag inserts.
 * - The starved-panels measure, printed before and after every insert.
 *
 * These scripts are run BY THE USER from a checkout with production
 * credentials in .env. Nothing here runs in a sandbox pipeline or at build
 * time on anyone's behalf.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function dbLabelOf(url: string): string {
  return url.replace(/\/\/[^@]*@/, "//…@");
}

export function hasConfirm(): boolean {
  return process.argv.includes("--confirm");
}

const MARKER_PATH = join(process.cwd(), "data", "backups", "LAST_VERIFIED_RESTORE.json");
const MARKER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Read and enforce the drill marker. Throws (via the caller's fail) with a
 * precise reason: missing marker, stale marker, wrong database, or a dump
 * that no longer exists on disk.
 */
export function requireFreshVerifiedBackup(currentDbLabel: string, fail: (msg: string) => never): void {
  if (!existsSync(MARKER_PATH))
    fail(
      `no verified-restore marker at ${MARKER_PATH}. Run scripts/restore-drill.sh against this database first — a backup nobody has restored is a hope, not a backup.`,
    );
  let marker: { verified_at?: string; database_label?: string; dump_path?: string };
  try {
    marker = JSON.parse(readFileSync(MARKER_PATH, "utf8"));
  } catch {
    fail(`the marker at ${MARKER_PATH} is not valid JSON; re-run scripts/restore-drill.sh.`);
  }
  const at = Date.parse(marker.verified_at ?? "");
  if (!Number.isFinite(at)) fail("the marker carries no parseable verified_at; re-run scripts/restore-drill.sh.");
  const age = Date.now() - at;
  if (age > MARKER_MAX_AGE_MS)
    fail(
      `the last verified restore is ${(age / 3600000).toFixed(1)} hours old (limit 24). Run scripts/restore-drill.sh again — the backup must be fresh enough to actually protect this insert.`,
    );
  if (age < -60_000) fail("the marker's verified_at is in the future; fix the clock or re-run the drill.");
  if ((marker.database_label ?? "") !== currentDbLabel)
    fail(
      `the marker's database (${marker.database_label}) is not the database this insert targets (${currentDbLabel}). The drill must run against the database the insert will touch.`,
    );
  if (!marker.dump_path || !existsSync(marker.dump_path))
    fail(`the marker's recovery point (${marker.dump_path}) is not on disk; re-run scripts/restore-drill.sh.`);
  console.log(
    `[stage2] backup gate passed: restore verified ${marker.verified_at} against ${marker.database_label}; recovery point ${marker.dump_path}`,
  );
}

/** The §5 success measure, identical before and after (moved here from the
 *  TCPD loader so all three fronts print the same table). */
export async function starvedCounts(): Promise<Record<string, string>> {
  const { fetchInsightRows } = await import("../src/lib/db/queries/insights");
  const { computeInsights } = await import("../src/lib/insights");
  const { termRows, electionRows } = await fetchInsightRows();
  const groups = computeInsights(termRows, electionRows, new Date().toISOString().slice(0, 10));
  const of = (key: string) => {
    const g = groups.find((x) => x.key === key);
    return g ? String(g.of ?? "stated without a denominator") : "panel absent (too starved to render)";
  };
  return {
    "Turnout extremes (n with recorded turnout)": of("turnout"),
    "Largest majorities (of)": of("largest-majority"),
    "Closest elections (of)": of("closest-election"),
    "Party dominance (of)": of("party-dominance"),
    "Compare picker options (elections)": String(electionRows.length),
    "Browse: elections": String(electionRows.length),
    "Browse: terms": String(termRows.length),
  };
}

/**
 * Reversal by dataset id (gate ruling 2026-09-03) — ONE code path for every
 * front, driven entirely by record_provenance: whatever a dataset marked, it
 * can unmake. Shared reference rows (parties, states, orgs) are deleted only
 * when nothing else references them; otherwise they are left in place and
 * NAMED in the output — a revert must never silently break another dataset.
 * Match candidates carry a `[dataset:<slug>]` tag in their rationale for
 * exactly this purpose.
 */
export async function revertDataset(slug: string, fail: (msg: string) => never): Promise<string[]> {
  const { db } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const out: string[] = [];

  const ds = await db.execute(sql`SELECT id FROM datasets WHERE slug = ${slug}`);
  if (ds.rows.length === 0) fail(`no dataset with slug "${slug}".`);
  const datasetId = (ds.rows[0] as { id: string }).id;

  const prov = await db.execute(
    sql`SELECT subject_type::text AS t, subject_id AS i FROM record_provenance WHERE dataset_id = ${datasetId}`,
  );
  const by = new Map<string, string[]>();
  for (const r of prov.rows as Array<{ t: string; i: string }>) by.set(r.t, [...(by.get(r.t) ?? []), r.i]);
  const ids = (t: string) => by.get(t) ?? [];
  out.push(`dataset ${slug}: provenance rows by subject: ${[...by.entries()].map(([t, v]) => `${t}=${v.length}`).join(", ") || "none"}`);

  await db.transaction(async (tx) => {
    const del = async (q: ReturnType<typeof sql>) => Number((await tx.execute(q)).rowCount ?? 0);
    const list = (v: string[]) => sql`ANY(string_to_array(${v.join("\u0001")}, chr(1)))`;

    // Dependent rows first, in FK order.
    if (ids("funding_transaction").length)
      out.push(`funding_transactions deleted: ${await del(sql`DELETE FROM funding_transactions WHERE id::text = ${list(ids("funding_transaction"))}`)}`);
    if (ids("rs_term").length)
      out.push(`rs_terms deleted: ${await del(sql`DELETE FROM rs_terms WHERE id::text = ${list(ids("rs_term"))}`)}`);
    if (ids("rs_member").length)
      out.push(`rs_members deleted (terms cascade): ${await del(sql`DELETE FROM rs_members WHERE id::text = ${list(ids("rs_member"))}`)}`);
    if (ids("election").length)
      out.push(`elections deleted (results cascade): ${await del(sql`DELETE FROM elections WHERE id::text = ${list(ids("election"))}`)}`);

    // Shared reference rows: only where nothing else points at them.
    for (const pid of ids("party")) {
      const used = await tx.execute(sql`
        SELECT (SELECT count(*) FROM election_results WHERE party_id = ${pid})
             + (SELECT count(*) FROM terms WHERE party_id = ${pid})
             + (SELECT count(*) FROM rs_terms WHERE party_id = ${pid})
             + (SELECT count(*) FROM funding_transactions WHERE recipient_type = 'party' AND recipient_id = ${pid}) AS n`);
      if (Number((used.rows[0] as { n: number }).n) > 0) out.push(`party ${pid}: LEFT IN PLACE (still referenced)`);
      else out.push(`party ${pid}: deleted (${await del(sql`DELETE FROM parties WHERE id = ${pid}`)})`);
    }
    for (const sid of ids("state")) {
      const used = await tx.execute(sql`
        SELECT (SELECT count(*) FROM elections WHERE state_id = ${sid})
             + (SELECT count(*) FROM terms WHERE state_id = ${sid})
             + (SELECT count(*) FROM rs_terms WHERE state_id = ${sid})
             + (SELECT count(*) FROM events WHERE state_id = ${sid}) AS n`);
      if (Number((used.rows[0] as { n: number }).n) > 0) out.push(`state ${sid}: LEFT IN PLACE (still referenced)`);
      else out.push(`state ${sid}: deleted (${await del(sql`DELETE FROM states WHERE id = ${sid}`)})`);
    }
    for (const oid of ids("org")) {
      const used = await tx.execute(sql`
        SELECT (SELECT count(*) FROM funding_transactions WHERE (donor_type = 'org' AND donor_id = ${oid}) OR (recipient_type = 'org' AND recipient_id = ${oid}))
             + (SELECT count(*) FROM board_positions WHERE org_id::text = ${oid}) AS n`);
      if (Number((used.rows[0] as { n: number }).n) > 0) out.push(`org ${oid}: LEFT IN PLACE (still referenced)`);
      else out.push(`org ${oid}: deleted (${await del(sql`DELETE FROM orgs WHERE id::text = ${oid}`)})`);
    }

    // Citations and provenance for every subject this dataset marked, the
    // tagged match candidates, dataset-scoped open questions, then the
    // dataset row itself.
    const allSubjects = [...by.entries()];
    for (const [t, v] of allSubjects) {
      const n = await del(sql`DELETE FROM citations WHERE subject_type = ${t}::citation_subject AND subject_id = ${list(v)}`);
      if (n > 0) out.push(`citations (${t}) deleted: ${n}`);
    }
    out.push(`match candidates deleted: ${await del(sql`DELETE FROM entity_match_candidates WHERE rationale LIKE ${"%[dataset:" + slug + "]%"}`)}`);
    // Open questions the dataset recorded (they carry provenance like every
    // other row it created), plus any older dataset-scoped question from
    // before open questions carried provenance.
    if (ids("open_question").length)
      out.push(`open questions deleted (by provenance): ${await del(sql`DELETE FROM open_questions WHERE id::text = ${list(ids("open_question"))}`)}`);
    out.push(`open questions deleted (dataset-scoped): ${await del(sql`DELETE FROM open_questions WHERE subject_type = 'dataset' AND subject_id = ${datasetId}`)}`);
    out.push(`provenance rows deleted: ${await del(sql`DELETE FROM record_provenance WHERE dataset_id = ${datasetId}`)}`);
    out.push(`dataset row deleted: ${await del(sql`DELETE FROM datasets WHERE id = ${datasetId}`)}`);
  });

  for (const t of ["elections", "election_results", "parties", "states", "orgs", "funding_transactions", "rs_members", "rs_terms", "record_provenance", "citations", "datasets"]) {
    await db.execute(sql.raw(`ANALYZE ${t}`));
  }
  return out;
}

export function panelDiffLines(before: Record<string, string>, after: Record<string, string>): string[] {
  const lines = [`| panel | before | after |`, `|---|---|---|`];
  for (const k of Object.keys(before)) lines.push(`| ${k} | ${before[k]} | ${after[k]} |`);
  return lines;
}

/** Funding-graph counts, the density measure the bonds insert moves. */
export async function graphCounts(): Promise<Record<string, string>> {
  const { db } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const n = async (q: string) => Number((await db.execute(sql.raw(q))).rows[0]!.n);
  return {
    "orgs + people (nodes)": String((await n("SELECT count(*)::int AS n FROM orgs")) + (await n("SELECT count(*)::int AS n FROM people"))),
    "transactions + board + relationships (edges)": String(
      (await n("SELECT count(*)::int AS n FROM funding_transactions")) +
        (await n("SELECT count(*)::int AS n FROM board_positions")) +
        (await n("SELECT count(*)::int AS n FROM relationships")),
    ),
  };
}
