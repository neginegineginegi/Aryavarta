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
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  checkMainCodeMarkers,
  checkSchemaProbe,
  MAIN_CODE_MARKERS,
  REQUIRED_SCHEMA_CAPABILITY,
  type SchemaProbe,
} from "../src/lib/ingest/deploy-gate";

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

// ---------------------------------------------------------------------------
// Step 0 (binding, 2026-09-03): the code that renders these rows must already
// be on the deploy branch, and this database must already carry the migration
// they need. An insert may not outrun either.
// ---------------------------------------------------------------------------

const DEPLOY_REF = "origin/main";

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Refuse unless the deploy branch (origin/main) carries every capability the
 * rows about to be inserted depend on for rendering.
 *
 * What this proves and what it does not: it proves main CONTAINS the code.
 * It cannot prove Vercel finished deploying that commit — the runbook tells
 * the operator to confirm the deployment is green, and this message repeats
 * it, because a check should never imply more than it checked.
 */
export function requireDeployedCode(fail: (msg: string) => never): void {
  let lastErr = "";
  let fetched = false;
  for (const wait of [0, 2000, 4000, 8000, 16000]) {
    if (wait > 0) sleepSync(wait);
    try {
      git(["fetch", "--quiet", "origin", "main"]);
      fetched = true;
      break;
    } catch (e) {
      lastErr = String((e as { stderr?: string })?.stderr ?? e);
    }
  }
  if (!fetched)
    fail(
      `could not fetch ${DEPLOY_REF} to check what is deployed (last error: ${lastErr.trim()}). This gate is not optional: run it from a checkout that can reach the remote.`,
    );

  const read = (path: string): string | null => {
    try {
      return git(["show", `${DEPLOY_REF}:${path}`]);
    } catch {
      return null;
    }
  };
  const { ok, missing } = checkMainCodeMarkers(read);
  if (!ok)
    fail(
      `${DEPLOY_REF} does not yet carry the code these rows need:\n  - ${missing.join("\n  - ")}\n` +
        `Merge the branch that adds them and let its deployment go green FIRST. Rows inserted ahead of their renderer are not a cosmetic problem: a year-anchored election renders as an invented "1 January", and the Rajya Sabha rows have no page at all until one ships.`,
    );
  let sha = "(unknown)";
  try {
    sha = git(["rev-parse", "--short", DEPLOY_REF]).trim();
  } catch {
    /* the marker check above is the gate; the sha is only for the log line */
  }
  console.log(
    `[stage2] deploy gate passed: ${DEPLOY_REF} (${sha}) carries all ${MAIN_CODE_MARKERS.length} required capabilities. This proves main CONTAINS the code — confirm its deployment is green before continuing.`,
  );
}

/**
 * Refuse unless this database already carries the schema the insert writes
 * into — checked as facts in the catalogue, then as the ensure-upgrades
 * marker that records who migrated it and when. Objects without a marker
 * means someone hand-applied SQL; a marker without objects means the
 * marker is lying. Both stop the insert.
 */
export async function requireSchemaCapability(fail: (msg: string) => never): Promise<void> {
  const { db } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const enumValue = (type: string, values: string[]) =>
    sql`(SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = ${type} AND e.enumlabel = ANY(string_to_array(${values.join(",")}, ',')))::int`;
  const column = (table: string, col: string) =>
    sql`(SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${col})::int`;
  const table = (name: string) => sql`(to_regclass(${`public.${name}`}) IS NOT NULL)::int`;

  const probeRow = (
    await db.execute(sql`SELECT
      ${enumValue("org_kind", ["unclassified"])} AS a,
      ${enumValue("citation_subject", ["party", "state", "rs_member", "rs_term", "open_question"])} AS b,
      ${enumValue("entity_ref", ["dataset"])} AS c,
      ${table("rs_members")} AS d,
      ${table("rs_terms")} AS e,
      ${column("funding_transactions", "recipient_label")} AS f,
      ${column("elections", "election_date_precision")} AS g,
      ${table("schema_capabilities")} AS h`)
  ).rows[0] as Record<string, number>;

  const probe: SchemaProbe = {
    orgKindUnclassified: Number(probeRow.a),
    citationSubjects: Number(probeRow.b),
    entityRefDataset: Number(probeRow.c),
    rsMembersTable: Number(probeRow.d),
    rsTermsTable: Number(probeRow.e),
    recipientLabelColumn: Number(probeRow.f),
    electionDatePrecisionColumn: Number(probeRow.g),
    capabilityTable: Number(probeRow.h),
  };
  const { ok, missing } = checkSchemaProbe(probe);
  if (!ok)
    fail(
      `this database has not been migrated for these rows:\n  - ${missing.join("\n  - ")}\n` +
        `Run \`node scripts/ensure-upgrades.mjs\` against it (runbook step 0), then re-run. An insert must never outrun its migration.`,
    );

  const marker = await db.execute(
    sql`SELECT ensured_at::text AS at, git_commit AS commit, statements FROM schema_capabilities WHERE capability = ${REQUIRED_SCHEMA_CAPABILITY}`,
  );
  if (marker.rows.length === 0)
    fail(
      `the schema objects exist but nothing recorded the capability "${REQUIRED_SCHEMA_CAPABILITY}" in schema_capabilities. Run \`node scripts/ensure-upgrades.mjs\` against this database so the record says which code migrated it and when — an undated hand-applied schema is exactly what this gate exists to catch.`,
    );
  const m = marker.rows[0] as { at: string; commit: string | null; statements: number | null };
  console.log(
    `[stage2] schema gate passed: capability ${REQUIRED_SCHEMA_CAPABILITY} ensured ${m.at} from commit ${m.commit ?? "(unrecorded)"} (${m.statements ?? "?"} statements).`,
  );
}

/**
 * The whole of step 0 plus the backup gate, in the order the runbook states:
 * the deployed code, then this database's migration, then the verified
 * restore that makes the insert reversible in the worst case.
 */
export async function requireInsertPreconditions(databaseUrl: string, fail: (msg: string) => never): Promise<void> {
  requireDeployedCode(fail);
  await requireSchemaCapability(fail);
  requireFreshVerifiedBackup(dbLabelOf(databaseUrl), fail);
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

  // The dataset's own source row (every loader gives the dataset and its
  // source the same URL): used below so a revert never strips citations
  // another source put on a row it is leaving in place.
  const dsSources = await db.execute(
    sql`SELECT s.id::text AS id FROM sources s JOIN datasets d ON d.upstream_url = s.url WHERE d.id = ${datasetId}`,
  );
  const datasetSourceIds = (dsSources.rows as Array<{ id: string }>).map((r) => r.id);

  await db.transaction(async (tx) => {
    const del = async (q: ReturnType<typeof sql>) => Number((await tx.execute(q)).rowCount ?? 0);
    const list = (v: string[]) => sql`ANY(string_to_array(${v.join("\u0001")}, chr(1)))`;

    /**
     * Everything that still points at each shared reference row, read from
     * the catalogue instead of hand-listed. The hand list this replaces
     * named four tables for states and missed nine of them, so a revert
     * would either abort on a foreign key or orphan a polymorphic reference
     * (found in the adversarial review, 2026-09-03).
     *
     * Batched deliberately: one query per referencing table for the whole
     * id set, not one per row. A bonds revert touches 1,294 orgs, and
     * per-row probing would be ten thousand round trips against a network
     * database.
     */
    const referencesFor = async (kind: "party" | "state" | "org", idList: string[]): Promise<Map<string, string[]>> => {
      const found = new Map<string, string[]>();
      if (idList.length === 0) return found;
      const note = (id: string, what: string) => found.set(id, [...(found.get(id) ?? []), what]);
      const wanted = list(idList);
      const parent = kind === "party" ? "parties" : kind === "state" ? "states" : "orgs";

      const children = await tx.execute(sql`
        SELECT c.conrelid::regclass::text AS tbl, a.attname::text AS col
        FROM pg_constraint c
        JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        WHERE c.contype = 'f' AND c.confrelid = ${`public.${parent}`}::regclass
        ORDER BY 1, 2`);
      for (const child of children.rows as Array<{ tbl: string; col: string }>) {
        // Identifiers come from the catalogue and are still checked before
        // being interpolated: nothing shapes SQL text unvalidated.
        if (!/^[a-z_]+$/.test(child.tbl) || !/^[a-z_]+$/.test(child.col))
          fail(`refusing to check a reference from unexpected identifier "${child.tbl}.${child.col}".`);
        const hits = await tx.execute(
          sql`${sql.raw(`SELECT ${child.col}::text AS id, count(*)::int AS n FROM ${child.tbl} WHERE ${child.col}::text = `)}${wanted}${sql.raw(` GROUP BY 1`)}`,
        );
        for (const h of hits.rows as Array<{ id: string; n: number }>) note(h.id, `${child.tbl}.${child.col} (${h.n})`);
      }

      // Polymorphic references carry no foreign key, so they are named here.
      // This dataset's own candidates and open questions are already deleted
      // by this point, so whatever answers belongs to someone else.
      if (kind !== "state") {
        const hits = await tx.execute(sql`
          SELECT id, count(*)::int AS n FROM (
            SELECT donor_id::text AS id FROM funding_transactions WHERE donor_type = ${kind}::entity_ref AND donor_id::text = ${wanted}
            UNION ALL
            SELECT recipient_id::text FROM funding_transactions WHERE recipient_type = ${kind}::entity_ref AND recipient_id::text = ${wanted}
          ) t GROUP BY id`);
        for (const h of hits.rows as Array<{ id: string; n: number }>) note(h.id, `funding_transactions (${h.n})`);
      }
      if (kind === "org") {
        const hits = await tx.execute(
          sql`SELECT parent_org_id::text AS id, count(*)::int AS n FROM orgs WHERE parent_org_id::text = ${wanted} GROUP BY 1`,
        );
        for (const h of hits.rows as Array<{ id: string; n: number }>) note(h.id, `orgs.parent_org_id (${h.n})`);
      }
      const oq = await tx.execute(
        sql`SELECT subject_id::text AS id, count(*)::int AS n FROM open_questions
            WHERE subject_type = ${kind}::entity_ref AND subject_id::text = ${wanted} GROUP BY 1`,
      );
      for (const h of oq.rows as Array<{ id: string; n: number }>) note(h.id, `open_questions (${h.n})`);
      const mc = await tx.execute(sql`
        SELECT id, count(*)::int AS n FROM (
          SELECT a_id::text AS id FROM entity_match_candidates WHERE entity_type = ${kind}::entity_ref AND a_id::text = ${wanted}
          UNION ALL
          SELECT b_id::text FROM entity_match_candidates WHERE entity_type = ${kind}::entity_ref AND b_id::text = ${wanted}
        ) t GROUP BY id`);
      for (const h of mc.rows as Array<{ id: string; n: number }>) note(h.id, `entity_match_candidates (${h.n})`);
      return found;
    };

    /**
     * Citations on a row this revert is KEEPING may only be the ones this
     * dataset wrote, i.e. those naming its own source. Deleting every
     * citation on a surviving shared row would strip another dataset's
     * evidence from a record that remains published (found in review).
     */
    const citationsForKeptRow = async (subjectType: string, id: string): Promise<number> => {
      if (datasetSourceIds.length === 0) return 0;
      return del(sql`DELETE FROM citations
        WHERE subject_type = ${subjectType}::citation_subject AND subject_id = ${id}
          AND source_id::text = ${list(datasetSourceIds)}`);
    };

    // 1. Dependent rows first, in FK order.
    if (ids("funding_transaction").length)
      out.push(`funding_transactions deleted: ${await del(sql`DELETE FROM funding_transactions WHERE id::text = ${list(ids("funding_transaction"))}`)}`);
    if (ids("rs_term").length)
      out.push(`rs_terms deleted: ${await del(sql`DELETE FROM rs_terms WHERE id::text = ${list(ids("rs_term"))}`)}`);
    if (ids("rs_member").length)
      out.push(`rs_members deleted (terms cascade): ${await del(sql`DELETE FROM rs_members WHERE id::text = ${list(ids("rs_member"))}`)}`);
    if (ids("election").length)
      out.push(`elections deleted (results cascade): ${await del(sql`DELETE FROM elections WHERE id::text = ${list(ids("election"))}`)}`);

    // 2. This dataset's match candidates and open questions, BEFORE the
    //    reference checks below, so its own markers never look like someone
    //    else's claim on a shared row.
    out.push(`match candidates deleted: ${await del(sql`DELETE FROM entity_match_candidates WHERE rationale LIKE ${"%[dataset:" + slug + "]%"}`)}`);
    if (ids("open_question").length)
      out.push(`open questions deleted (by provenance): ${await del(sql`DELETE FROM open_questions WHERE id::text = ${list(ids("open_question"))}`)}`);
    out.push(`open questions deleted (dataset-scoped): ${await del(sql`DELETE FROM open_questions WHERE subject_type = 'dataset' AND subject_id = ${datasetId}`)}`);

    // 3. Citations on the dependent rows just deleted: those subjects no
    //    longer exist, so every citation on them goes.
    for (const t of ["funding_transaction", "rs_term", "rs_member", "election"]) {
      if (ids(t).length === 0) continue;
      const n = await del(sql`DELETE FROM citations WHERE subject_type = ${t}::citation_subject AND subject_id = ${list(ids(t))}`);
      if (n > 0) out.push(`citations (${t}) deleted: ${n}`);
    }

    // 4. Shared reference rows: deleted only where nothing else points at
    //    them, and otherwise LEFT IN PLACE and named — a revert must never
    //    silently break another dataset.
    for (const kind of ["party", "state", "org"] as const) {
      const table = kind === "party" ? "parties" : kind === "state" ? "states" : "orgs";
      const subjectIds = ids(kind);
      if (subjectIds.length === 0) continue;
      const refs = await referencesFor(kind, subjectIds);
      const deletable = subjectIds.filter((id) => !refs.has(id));
      for (const id of subjectIds.filter((x) => refs.has(x))) {
        const kept = await citationsForKeptRow(kind, id);
        out.push(
          `${kind} ${id}: LEFT IN PLACE (still referenced by ${refs.get(id)!.join(", ")})${kept > 0 ? `; ${kept} citation(s) from this dataset's source removed, others untouched` : ""}`,
        );
      }
      if (deletable.length > 0) {
        const wanted = list(deletable);
        const c = await del(sql`DELETE FROM citations WHERE subject_type = ${kind}::citation_subject AND subject_id = ${wanted}`);
        const d = await del(sql`${sql.raw(`DELETE FROM ${table} WHERE id::text = `)}${wanted}`);
        out.push(`${kind}: ${d} deleted with ${c} citation(s) — ${deletable.slice(0, 12).join(", ")}${deletable.length > 12 ? `, … (${deletable.length} total)` : ""}`);
      }
    }

    // 5. The dataset's own markers last.
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
