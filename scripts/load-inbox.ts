/* eslint-disable no-console */
/**
 * The inbox loader, and its two paths.
 *
 * Runs before every build, like ensure-upgrades, and is idempotent: rows whose
 * entity already exists live, or already has a pending imported draft, are
 * skipped, so committed inbox files can stay in the repo. Formats are in
 * docs/DATA_FORMAT.md.
 *
 * Every sheet takes one of two paths, and which one is declared in SHEETS
 * below rather than left to be inferred from what the code happens to do.
 *
 * CONTRIBUTION PATH. Political content never publishes directly. A term, an
 * election, an event: each row becomes a PENDING revision reviewed in /review,
 * exactly as a stranger's proposal would be. Review is the point, and an
 * import is not exempt from it.
 *
 * BULK PATH. A published dataset loaded wholesale is a different act. Section
 * 14a of docs/FUNDING_INFLUENCE_ARCHITECTURE.md made this call once for the
 * funding layer; the reasoning generalises. Review earns its keep when the
 * proposer and the reviewer are different people, and a loader importing two
 * hundred thousand constituency results is neither: staging them would build a
 * queue nobody empties, and a queue nobody empties is not review, it is a
 * backlog wearing review's clothes.
 *
 * What replaces review on that path is provenance. A bulk row may name the
 * dataset it came from and its own line within that dataset, and the archive
 * then tells the reader which published dataset, at which version, under which
 * licence, retrieved when and by whom. That is a different claim from "a
 * person checked this" and the interface says so in those words. It is not a
 * weaker claim: a named edition of a public report is more checkable than a
 * volunteer's tick, because anyone can fetch the same edition and look.
 *
 * When a public contribution form reaches one of the bulk tables, its
 * submissions go through revisions like everything else. This widens the bulk
 * path; it does not replace review.
 */
import "dotenv/config";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { v7 as uuidv7 } from "uuid";
import { and, eq, sql } from "drizzle-orm";

import type { SourceSnapshot } from "../src/lib/revisions/payloads";
import { parseCsv } from "../src/lib/csv";

/** INBOX_DIR overrides the directory, for testing against sheets that are not
 *  committed. Same override the funding loader carries. */
const INBOX = process.env.INBOX_DIR || join(process.cwd(), "data", "inbox");

/**
 * Which path each sheet takes. The end-of-run report prints from this, so a
 * sheet cannot change path without the log announcing it, and a reader of this
 * file learns the split in one place instead of by tracing ten loops.
 *
 * Moving a sheet between these lists changes whether its rows are reviewed by
 * a person. It is a decision about the archive, not a refactor.
 */
const SHEETS = {
  /** Staged as pending revisions, reviewed in /review before publishing. */
  contribution: ["terms.csv", "term_updates.csv", "elections.csv", "results.csv", "events.csv"],
  /** Inserted directly. Rows may carry dataset provenance; see PROVENANCE. */
  bulk: ["sources.csv", "party_colors.csv", "documents.csv", "indicators.csv", "indicator_values.csv"],
  /** Declares the datasets the bulk sheets reference. */
  declaration: ["datasets.csv"],
} as const;

/**
 * Bulk sheets whose rows may carry `dataset` and `upstream_id`.
 *
 * The three absentees are absent for one reason. A source IS the citation
 * vocabulary rather than a claim expressed in it; a party colour is
 * presentation config nobody cites; an indicator is a definition, and what it
 * defines is the thing that gets measured. None of the three is a fact about
 * the world, and putting them through dataset provenance would be ceremony
 * that teaches readers to skim it.
 *
 * The `citation_subject` enum agrees: it carries `indicator_value` and not
 * `indicator`, because the value is what a reader cites.
 */
const PROVENANCE = new Set(["documents.csv", "indicator_values.csv"]);

function readSheet(name: string): Array<Record<string, string>> {
  const p = join(INBOX, name);
  if (!existsSync(p)) return [];
  return parseCsv(readFileSync(p, "utf8"));
}

/** '1987' → '1987-01-01', '1987-03' → '1987-03-01', full dates unchanged. */
function normalizeDate(raw: string): { date: string | null; note: string | null } {
  if (!raw) return { date: null, note: null };
  if (/^\d{4}$/.test(raw)) return { date: `${raw}-01-01`, note: `only the year (${raw}) is recorded` };
  if (/^\d{4}-\d{2}$/.test(raw)) return { date: `${raw}-01`, note: `only the month (${raw}) is recorded` };
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { date: raw, note: null };
  return { date: null, note: `unparseable date "${raw}"` };
}

const num = (s: string): number | null => (s === "" ? null : Number(s));

/** Split rows into batches so one statement covers many rows. */
function chunked<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("[load-inbox] DATABASE_URL not set — skipping.");
    return;
  }
  if (!existsSync(INBOX) || readdirSync(INBOX).length === 0) {
    console.log("[load-inbox] data/inbox is empty — nothing to load.");
    return;
  }

  // App modules (transitively need tsconfig path resolution, which tsx provides).
  const { db } = await import("../src/lib/db");
  const { states, revisions, terms, elections, events, indicators, indicatorValues, documents } =
    await import("../src/lib/db/schema");
  const {
    termPayloadSchema,
    electionPayloadSchema,
    eventPayloadSchema,
    canonicalizeTerm,
    canonicalizeElection,
    canonicalizeEvent,
  } = await import("../src/lib/revisions/payloads");
  const { ensureImportBot, ensureParty } = await import("../src/lib/import/drafts");
  const { snapshotEntity } = await import("../src/lib/revisions/snapshot");
  const { yearOf } = await import("../src/lib/format");

  const today = new Date().toISOString().slice(0, 10);
  const botId = await ensureImportBot();
  const report = { created: {} as Record<string, number>, skipped: [] as string[], warnings: [] as string[] };
  const bump = (k: string) => (report.created[k] = (report.created[k] ?? 0) + 1);
  const skip = (s: string) => report.skipped.push(s);

  // --- states lookup --------------------------------------------------------
  const stateRows = await db.select().from(states);
  const stateByKey = new Map<string, { id: string; name: string }>();
  for (const s of stateRows) {
    stateByKey.set(s.id.toLowerCase(), s);
    stateByKey.set(s.name.toLowerCase(), s);
  }
  stateByKey.set("india", stateByKey.get("in")!);
  const resolveState = (raw: string) => stateByKey.get(raw.trim().toLowerCase()) ?? null;

  // ===========================================================================
  // BULK PATH: dataset declarations
  //
  // Read before anything else, because a bulk row naming a dataset that was
  // never declared is refused rather than invented. Datasets are keyed by slug
  // and re-declaring one updates its fields: a publisher reissuing an edition
  // is the normal case, and the version column is what records the difference.
  // ===========================================================================
  const { parseDatasetRow, parseRowProvenance } = await import("../src/lib/ingest/provenance");
  const { datasets, recordProvenance } = await import("../src/lib/db/schema");

  const datasetIdBySlug = new Map<string, string>();
  for (const row of await db.select({ id: datasets.id, slug: datasets.slug }).from(datasets)) {
    datasetIdBySlug.set(row.slug, row.id);
  }

  for (const r of readSheet("datasets.csv")) {
    const parsed = parseDatasetRow(r);
    if (!parsed.ok) {
      skip(`dataset "${r.slug ?? "(no slug)"}": ${parsed.error}`);
      continue;
    }
    const d = parsed.value;
    const existing = datasetIdBySlug.get(d.slug);
    const values = {
      name: d.name,
      publisher: d.publisher,
      version: d.version,
      licence: d.licence,
      licenceUrl: d.licenceUrl,
      retrievedOn: d.retrievedOn,
      upstreamUrl: d.upstreamUrl,
      curator: d.curator,
      notes: d.notes,
    };
    if (existing) {
      await db.update(datasets).set(values).where(eq(datasets.id, existing));
    } else {
      const id = uuidv7();
      await db.insert(datasets).values({ id, slug: d.slug, ...values });
      datasetIdBySlug.set(d.slug, id);
      bump("datasets");
    }
  }

  const knownDatasets = new Set(datasetIdBySlug.keys());

  type RowProvenance = { dataset: string; upstreamId: string } | null;

  /**
   * Check a bulk row's provenance columns before the row is inserted.
   *
   * Returns `false` when the row names its dataset badly, so the caller skips
   * the row rather than storing a fact whose stated provenance is wrong. A
   * wrong trail is worse than no trail: it looks like traceability and leads
   * nowhere. `null` means the row carried no provenance columns, which is
   * fine — plenty of curated reference data has no upstream dataset, and the
   * interface reports that as "not recorded" rather than guessing.
   */
  const checkProvenance = (
    sheet: string,
    row: Record<string, string>,
    label: string,
  ): RowProvenance | false => {
    if (!PROVENANCE.has(sheet)) return null;
    const parsed = parseRowProvenance(row, knownDatasets);
    if (!parsed.ok) {
      skip(`${label}: ${parsed.error}`);
      return false;
    }
    return parsed.value;
  };

  /** Write provenance for a row that actually landed in the archive. */
  const writeProvenance = async (
    subjectType: string,
    subjectId: string,
    prov: RowProvenance,
  ): Promise<void> => {
    if (!prov) return;
    await db
      .insert(recordProvenance)
      .values({
        subjectType: subjectType as "document",
        subjectId,
        datasetId: datasetIdBySlug.get(prov.dataset)!,
        upstreamId: prov.upstreamId,
        ingestedOn: today,
      })
      .onConflictDoNothing();
    bump("provenance records");
  };

  // ===========================================================================
  // BULK PATH: sources
  // ===========================================================================
  const sourceById = new Map<string, SourceSnapshot>();
  for (const r of readSheet("sources.csv")) {
    if (!r.id || !r.url || !r.title) {
      skip(`sources: row with id "${r.id}" missing id/title/url`);
      continue;
    }
    if (!/^https?:\/\//.test(r.url)) {
      skip(`sources ${r.id}: url must start with http(s)://`);
      continue;
    }
    sourceById.set(r.id, {
      title: r.title,
      url: r.url,
      publisher: r.publisher || null,
      publishedOn: normalizeDate(r.published_date ?? "").date,
      accessedOn: today,
    });
  }
  const resolveSources = (refs: string, label: string): SourceSnapshot[] | null => {
    const ids = refs.split(";").map((x) => x.trim()).filter(Boolean);
    const out: SourceSnapshot[] = [];
    for (const id of ids) {
      const s = sourceById.get(id);
      if (!s) {
        skip(`${label}: unknown source ref "${id}"`);
        return null;
      }
      out.push(s);
    }
    return out.length ? out : null;
  };

  const SUMMARY =
    "Imported from a bulk data sheet. Verify names, dates and figures against the cited sources before approving.";

  // ===========================================================================
  // CONTRIBUTION PATH: terms, staged as pending revisions
  // ===========================================================================
  // Dedup keys are fetched once and checked in memory. Two queries per row
  // against a remote database was the other half of this script's build cost.
  const termKey = (stateId: string, kind: string, start: string) => `${stateId}|${kind}|${start}`;
  const liveTermKeys = new Set(
    (
      await db
        .select({ stateId: terms.stateId, kind: terms.kind, startDate: terms.startDate })
        .from(terms)
        .where(sql`${terms.deletedAt} IS NULL`)
    ).map((t) => termKey(t.stateId, t.kind, t.startDate)),
  );
  const pendingTermKeys = new Set(
    (
      await db
        .select({ stateId: revisions.stateId, afterData: revisions.afterData })
        .from(revisions)
        .where(
          and(
            eq(revisions.entityType, "term"),
            eq(revisions.status, "pending"),
            eq(revisions.origin, "import"),
          ),
        )
    )
      .map((r) => {
        const a = r.afterData as { kind?: string; startDate?: string } | null;
        return a?.kind && a?.startDate && r.stateId
          ? termKey(r.stateId, a.kind, a.startDate)
          : null;
      })
      .filter((k): k is string => k !== null),
  );
  for (const r of readSheet("terms.csv")) {
    const label = `term: ${r.person || "President's Rule"} (${r.state} ${r.start_date})`;
    const st = resolveState(r.state ?? "");
    if (!st) { skip(`${label}: unknown state "${r.state}"`); continue; }
    const start = normalizeDate(r.start_date ?? "");
    const end = normalizeDate(r.end_date ?? "");
    if (!start.date) { skip(`${label}: ${start.note ?? "missing start date"}`); continue; }
    const srcs = resolveSources(r.sources ?? "", label);
    if (!srcs) continue;

    const office = (r.office ?? "").toLowerCase();
    if (!["cm", "governor", "presidents_rule", "pm", "president"].includes(office)) {
      skip(`${label}: unknown office "${r.office}"`);
      continue;
    }

    const key = termKey(st.id, office, start.date);
    if (liveTermKeys.has(key)) {
      skip(`${label}: a live ${office} term already starts on this date`);
      continue;
    }
    if (pendingTermKeys.has(key)) {
      skip(`${label}: an imported ${office} draft already pending for this start date`);
      continue;
    }
    // Claim the key so a repeated row in the same sheet cannot double-file.
    pendingTermKeys.add(key);

    const precision = [start.note, end.note].filter(Boolean).join("; ");
    const notes = [r.notes || null, precision ? `Imported: ${precision}.` : null]
      .filter(Boolean)
      .join(" ") || null;
    const payload = canonicalizeTerm({
      stateId: st.id,
      kind: office as "cm",
      cmName: r.person || null,
      partyId: r.party ? await ensureParty(r.party) : null,
      startDate: start.date,
      endDate: end.date,
      notes,
      sources: srcs,
    });
    const parsed = termPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      skip(`${label}: ${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}`);
      continue;
    }
    const who = office === "presidents_rule" ? "President's Rule" : r.person;
    await db.insert(revisions).values({
      id: uuidv7(),
      entityType: "term",
      entityId: uuidv7(),
      stateId: st.id,
      action: "create",
      beforeData: null,
      afterData: parsed.data,
      title: `${who}, ${st.name} (${yearOf(start.date)} – ${end.date ? yearOf(end.date) : "present"})`,
      summary: SUMMARY,
      origin: "import",
      status: "pending",
      proposedBy: botId,
    });
    bump("terms");
  }

  // ===========================================================================
  // CONTRIBUTION PATH: term updates, staged as pending UPDATE revisions
  // ===========================================================================
  // Columns: state,office,start_date,new_end_date,notes,sources
  // Matches the term by state + office + start date. A live term gets a
  // pending UPDATE revision (reviewed like everything else); a still-pending
  // imported draft is amended in place before it ever publishes.
  for (const r of readSheet("term_updates.csv")) {
    const label = `term update: ${r.state} ${r.office} ${r.start_date}`;
    const st = resolveState(r.state ?? "");
    if (!st) { skip(`${label}: unknown state "${r.state}"`); continue; }
    const office = (r.office ?? "").toLowerCase();
    const start = normalizeDate(r.start_date ?? "");
    const end = normalizeDate(r.new_end_date ?? "");
    if (!start.date || !end.date) { skip(`${label}: start and new_end_date are required`); continue; }
    const srcs = r.sources ? resolveSources(r.sources, label) : [];
    if (srcs === null) continue;

    const live = await db.query.terms.findFirst({
      where: and(
        eq(terms.stateId, st.id),
        eq(terms.kind, office as "cm"),
        eq(terms.startDate, start.date),
        sql`${terms.deletedAt} IS NULL`,
      ),
    });
    if (live) {
      const before = await snapshotEntity(db, "term", live.id);
      if (!before) { skip(`${label}: live term vanished mid-run`); continue; }
      const beforeTerm = before as { endDate: string | null; notes: string | null; sources: unknown[] } & Record<string, unknown>;
      if (beforeTerm.endDate === end.date) { skip(`${label}: end date already set`); continue; }
      const pendingUpdate = await db.query.revisions.findFirst({
        where: and(
          eq(revisions.entityType, "term"),
          eq(revisions.entityId, live.id),
          eq(revisions.status, "pending"),
        ),
      });
      if (pendingUpdate) { skip(`${label}: an update for this term is already pending`); continue; }
      const after = canonicalizeTerm({
        ...(before as Parameters<typeof canonicalizeTerm>[0]),
        endDate: end.date,
        notes: r.notes ? [beforeTerm.notes, r.notes].filter(Boolean).join(" ") : beforeTerm.notes,
        sources: [
          ...(before as Parameters<typeof canonicalizeTerm>[0]).sources,
          ...(srcs ?? []).filter((s) => !(before as Parameters<typeof canonicalizeTerm>[0]).sources.some((x) => x.url === s.url)),
        ],
      });
      const parsed = termPayloadSchema.safeParse(after);
      if (!parsed.success) {
        skip(`${label}: ${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}`);
        continue;
      }
      await db.insert(revisions).values({
        id: uuidv7(),
        entityType: "term",
        entityId: live.id,
        stateId: st.id,
        action: "update",
        beforeData: before,
        afterData: parsed.data,
        title: `End of term: ${(before as { cmName?: string | null }).cmName ?? "President's Rule"}, ${st.name} (${yearOf(start.date)} – ${yearOf(end.date)})`,
        summary: SUMMARY,
        origin: "import",
        status: "pending",
        proposedBy: botId,
      });
      bump("term updates");
      continue;
    }

    const pend = await db.query.revisions.findFirst({
      where: and(
        eq(revisions.stateId, st.id),
        eq(revisions.entityType, "term"),
        eq(revisions.status, "pending"),
        eq(revisions.origin, "import"),
        sql`${revisions.afterData} ->> 'startDate' = ${start.date}`,
        sql`${revisions.afterData} ->> 'kind' = ${office}`,
      ),
    });
    if (!pend) { skip(`${label}: no live term or pending draft matches`); continue; }
    const draft = pend.afterData as { endDate: string | null; sources: Array<{ url: string }> } & Record<string, unknown>;
    if (draft.endDate === end.date) { skip(`${label}: draft already has this end date`); continue; }
    await db
      .update(revisions)
      .set({
        afterData: {
          ...draft,
          endDate: end.date,
          sources: [
            ...draft.sources,
            ...(srcs ?? []).filter((s) => !draft.sources.some((x) => x.url === s.url)),
          ],
        },
        title: pend.title.replace(/ – present\)$/, ` – ${yearOf(end.date)})`),
        summary: `${pend.summary} [end date set by a later data sheet]`,
      })
      .where(eq(revisions.id, pend.id));
    bump("term updates (amended drafts)");
  }

  // ===========================================================================
  // CONTRIBUTION PATH: elections and their results, staged as revisions
  // ===========================================================================
  const resultRows = readSheet("results.csv");
  for (const r of readSheet("elections.csv")) {
    const label = `election: ${r.state} ${r.election_date}`;
    const st = resolveState(r.state ?? "");
    if (!st) { skip(`${label}: unknown state "${r.state}"`); continue; }
    const when = normalizeDate(r.election_date ?? "");
    if (!when.date) { skip(`${label}: bad election date`); continue; }
    const srcs = resolveSources(r.sources ?? "", label);
    if (!srcs) continue;

    const liveNearby = await db.query.elections.findFirst({
      where: and(
        eq(elections.stateId, st.id),
        sql`${elections.deletedAt} IS NULL`,
        sql`abs(${elections.electionDate} - ${when.date}::date) < 90`,
      ),
    });
    if (liveNearby) { skip(`${label}: a live election already exists near this date`); continue; }
    const pend = await db.query.revisions.findFirst({
      where: and(
        eq(revisions.stateId, st.id),
        eq(revisions.entityType, "election"),
        eq(revisions.status, "pending"),
        eq(revisions.origin, "import"),
        sql`${revisions.afterData} ->> 'electionDate' = ${when.date}`,
      ),
    });
    if (pend) { skip(`${label}: an imported draft already pending for this date`); continue; }

    const results = [];
    for (const rr of resultRows) {
      const rst = resolveState(rr.state ?? "");
      if (!rst || rst.id !== st.id) continue;
      if (normalizeDate(rr.election_date ?? "").date !== when.date) continue;
      if (!rr.party || rr.seats_won === "") continue;
      results.push({
        partyId: await ensureParty(rr.party),
        seats: Number(rr.seats_won),
        voteSharePercent: num(rr.vote_share_percent ?? ""),
        seatsContested: num(rr.seats_contested ?? ""),
        allianceName: rr.alliance || null,
      });
    }

    const scope =
      st.id === "in" ? "lok_sabha" : (r.scope ?? "").toLowerCase() === "lok_sabha" ? "lok_sabha" : "state_assembly";
    const payload = canonicalizeElection({
      stateId: st.id,
      scope,
      assemblyNumber: num(r.assembly_number ?? ""),
      electionDate: when.date,
      resultSummary: null,
      totalSeats: num(r.total_seats ?? ""),
      turnoutPercent: num(r.turnout_percent ?? ""),
      results,
      sources: srcs,
    });
    const parsed = electionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      skip(`${label}: ${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}`);
      continue;
    }
    await db.insert(revisions).values({
      id: uuidv7(),
      entityType: "election",
      entityId: uuidv7(),
      stateId: st.id,
      action: "create",
      beforeData: null,
      afterData: parsed.data,
      title: `${scope === "lok_sabha" ? "Lok Sabha election" : `Assembly election, ${st.name}`}, ${yearOf(when.date)} (imported)`,
      summary: SUMMARY,
      origin: "import",
      status: "pending",
      proposedBy: botId,
    });
    bump("elections");
  }

  // ===========================================================================
  // CONTRIBUTION PATH: events, staged as pending revisions
  // ===========================================================================
  for (const r of readSheet("events.csv")) {
    const label = `event: ${r.title} (${r.state} ${r.year})`;
    const st = resolveState(r.state ?? "");
    if (!st) { skip(`${label}: unknown state "${r.state}"`); continue; }
    const year = Number(r.year);
    const srcs = resolveSources(r.sources ?? "", label);
    if (!srcs) continue;

    const dup = await db.query.events.findFirst({
      where: and(eq(events.stateId, st.id), eq(events.year, year), eq(events.title, r.title)),
    });
    if (dup) { skip(`${label}: an event with this title/year already exists`); continue; }
    const pend = await db.query.revisions.findFirst({
      where: and(
        eq(revisions.stateId, st.id),
        eq(revisions.entityType, "event"),
        eq(revisions.status, "pending"),
        eq(revisions.origin, "import"),
        eq(revisions.title, r.title),
      ),
    });
    if (pend) { skip(`${label}: an imported draft with this title already pending`); continue; }

    const payload = canonicalizeEvent({
      stateId: st.id,
      year,
      eventDate: normalizeDate(r.event_date ?? "").date,
      type: (r.type ?? "other") as "other",
      title: r.title,
      description: r.description,
      sources: srcs,
    });
    const parsed = eventPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      skip(`${label}: ${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}`);
      continue;
    }
    const entityId = uuidv7();
    await db.transaction(async (tx) => {
      await tx.insert(events).values({
        id: entityId,
        stateId: st.id,
        year,
        eventDate: parsed.data.eventDate,
        type: parsed.data.type,
        title: parsed.data.title,
        description: parsed.data.description,
        status: "pending_review",
      });
      await tx.insert(revisions).values({
        id: uuidv7(),
        entityType: "event",
        entityId,
        stateId: st.id,
        action: "create",
        beforeData: null,
        afterData: parsed.data,
        title: parsed.data.title,
        summary: SUMMARY,
        origin: "import",
        status: "pending",
        proposedBy: botId,
      });
    });
    bump("events");
  }

  // ===========================================================================
  // BULK PATH: party colours. Presentation config, so no provenance.
  // ===========================================================================
  // Standing config: applies to matching parties on every run; unknown
  // parties are reported and picked up automatically once data creates them.
  const { parties } = await import("../src/lib/db/schema");
  const { slugifyPartyId } = await import("../src/lib/import/drafts");

  // Match on a normalized name, not an exact string. Archive names arrive from
  // imports and routinely differ from the sheet in case, punctuation, or "&"
  // versus "and" ("Jammu & Kashmir National Conference" vs "Jammu and
  // Kashmir..."). An exact match silently left those parties on an
  // auto-assigned color, which is exactly how two parties end up looking alike.
  const normalizeParty = (s: string) =>
    s
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9()]+/g, " ")
      .trim();

  const partyRows = await db.select().from(parties);
  const partyByKey = new Map<string, (typeof partyRows)[number]>();
  for (const p of partyRows) {
    partyByKey.set(normalizeParty(p.name), p);
    partyByKey.set(p.id.toLowerCase(), p);
  }
  const colored = new Set<string>();

  for (const r of readSheet("party_colors.csv")) {
    const name = r.party_name?.trim();
    const hex = r.primary_hex?.trim();
    if (!name || !hex) continue;
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
      skip(`party color ${name}: invalid hex "${hex}"`);
      continue;
    }
    const party =
      partyByKey.get(normalizeParty(name)) ?? partyByKey.get(slugifyPartyId(name).toLowerCase());
    if (!party) {
      skip(`party color ${name}: party not in the archive yet (row will apply once it exists)`);
      continue;
    }
    colored.add(party.id);
    const abbr = r.abbreviation?.trim() || party.abbreviation;
    if (party.color === hex && party.abbreviation === abbr) continue; // already applied
    await db
      .update(parties)
      .set({ color: hex, abbreviation: abbr })
      .where(eq(parties.id, party.id));
    bump("party colors");
  }

  // ===========================================================================
  // BULK PATH: media archive documents, provenance-bearing
  // ===========================================================================
  // Metadata about a file carries little editorial judgment, so documents load
  // directly rather than through the review queue. The methodology page states
  // this publicly. Redistribution defaults to link-only until someone checks.
  const docRows: Array<typeof documents.$inferInsert> = [];
  const DOC_TYPES = new Set([
    "manifesto", "press_conference", "party_advertisement", "campaign_speech",
    "debate_transcript", "election_symbol", "candidate_affidavit", "press_release",
    "government_notification", "gazette", "cag_report", "assembly_debate",
    "parliamentary_debate", "court_judgment", "eci_order", "delimitation_report",
    "coalition_agreement", "white_paper", "budget_speech", "economic_survey",
    "five_year_plan", "committee_report", "other",
  ]);
  const docProv = new Map<string, RowProvenance>();
  for (const r of readSheet("documents.csv")) {
    const label = `document: ${r.title || "(untitled)"}`;
    const type = (r.type ?? "").trim().toLowerCase();
    if (!r.title || !type) { skip(`${label}: title and type are required`); continue; }
    if (!DOC_TYPES.has(type)) { skip(`${label}: unknown type "${r.type}"`); continue; }
    if (!r.official_url && !r.archive_url) {
      skip(`${label}: needs an official_url or an archive_url`);
      continue;
    }
    const st = r.state ? resolveState(r.state) : null;
    if (r.state && !st) { skip(`${label}: unknown state "${r.state}"`); continue; }
    const published = normalizeDate(r.published_on ?? "");
    const redistribution = (r.redistribution ?? "").trim().toLowerCase();
    const prov = checkProvenance("documents.csv", r, label);
    if (prov === false) continue;
    const docId = uuidv7();
    docProv.set(docId, prov);
    docRows.push({
      id: docId,
      type: type as "manifesto",
      title: r.title,
      publisher: r.publisher || null,
      publishedOn: published.date,
      datePrecision: published.note ? (published.note.includes("year") ? "year" : "month") : "day",
      language: r.language || "en",
      officialUrl: r.official_url || null,
      archiveUrl: r.archive_url || null,
      redistribution:
        redistribution === "permitted" || redistribution === "link_only"
          ? (redistribution as "permitted")
          : "unknown",
      pageCount: r.page_count ? Number(r.page_count) : null,
      notes: r.notes || null,
      stateId: st?.id ?? null,
      partyId: r.party ? await ensureParty(r.party) : null,
    });
  }
  if (docRows.length > 0) {
    // Dedup on the issuer's URL: re-running a sheet must not double-file.
    const existing = new Set(
      (await db.select({ u: documents.officialUrl }).from(documents))
        .map((d) => d.u)
        .filter((u): u is string => !!u),
    );
    const fresh = docRows.filter((d) => !d.officialUrl || !existing.has(d.officialUrl));
    for (const chunk of chunked(fresh, 200)) {
      await db.insert(documents).values(chunk);
      report.created["documents"] = (report.created["documents"] ?? 0) + chunk.length;
      // Provenance is written only for rows that actually landed, so a
      // deduplicated row never leaves a trail pointing at nothing.
      for (const d of chunk) await writeProvenance("document", d.id!, docProv.get(d.id!) ?? null);
    }
    const dupes = docRows.length - fresh.length;
    if (dupes > 0) skip(`documents: ${dupes} row(s) already in the archive by official_url`);
  }

  // Name every archive party the sheet does not cover. These keep a
  // hash-assigned color that nobody chose, so they are the ones that show up
  // wearing a rival's shade. Add a row to party_colors.csv to fix one.
  for (const p of partyRows) {
    if (p.isPseudo || colored.has(p.id)) continue;
    report.warnings.push(
      `party color: no row for "${p.name}", still on auto-assigned ${p.color}`,
    );
  }

  // ===========================================================================
  // BULK PATH: indicator definitions, then their values (values bear provenance)
  // ===========================================================================
  const indicatorRows: Array<{
    id: string;
    name: string;
    unit: string;
    category: string;
    methodology: string;
  }> = [];
  const valueRows: Array<typeof indicatorValues.$inferInsert> = [];
  for (const r of readSheet("indicators.csv")) {
    if (!r.id || !r.name || !r.unit || !r.category || !r.methodology) {
      skip(`indicator "${r.id || r.name}": all of id/name/unit/category/methodology are required`);
      continue;
    }
    indicatorRows.push({
      id: r.id,
      name: r.name,
      unit: r.unit,
      category: r.category,
      methodology: r.methodology,
    });
  }
  // One statement per chunk instead of one per row: this script runs on every
  // deploy against a remote database, and a round trip per row was costing
  // minutes of build time to rewrite data that had not changed.
  for (const chunk of chunked(indicatorRows, 200)) {
    await db
      .insert(indicators)
      .values(chunk)
      .onConflictDoUpdate({
        target: indicators.id,
        set: {
          name: sql`excluded.name`,
          unit: sql`excluded.unit`,
          category: sql`excluded.category`,
          methodology: sql`excluded.methodology`,
        },
      });
    report.created["indicators"] = (report.created["indicators"] ?? 0) + chunk.length;
  }
  const valueProv = new Map<string, RowProvenance>();
  for (const r of readSheet("indicator_values.csv")) {
    const label = `indicator value: ${r.indicator} ${r.state} ${r.year}`;
    const st = resolveState(r.state ?? "");
    if (!st) { skip(`${label}: unknown state "${r.state}"`); continue; }
    if (!r.indicator || r.value === "" || !r.source_title || !r.source_url || !r.verified_on) {
      skip(`${label}: indicator, value, source_title, source_url and verified_on are required`);
      continue;
    }
    const prov = checkProvenance("indicator_values.csv", r, label);
    if (prov === false) continue;
    const valueId = uuidv7();
    valueProv.set(valueId, prov);
    valueRows.push({
      id: valueId,
      indicatorId: r.indicator,
      stateId: st.id,
      year: Number(r.year),
      value: r.value,
      sourceTitle: r.source_title,
      sourceUrl: r.source_url,
      reportingPeriod: r.reporting_period || null,
      reportingOrg: r.reporting_org || null,
      notes: r.notes || null,
      verifiedOn: r.verified_on,
    });
  }
  for (const chunk of chunked(valueRows, 500)) {
    // `returning` rather than the chunk itself: onConflictDoNothing drops rows
    // whose series already exists, and provenance must describe what landed,
    // not what was offered.
    const landed = await db
      .insert(indicatorValues)
      .values(chunk)
      .onConflictDoNothing()
      .returning({ id: indicatorValues.id });
    report.created["indicator values"] =
      (report.created["indicator values"] ?? 0) + landed.length;
    for (const row of landed) await writeProvenance("indicator_value", row.id, valueProv.get(row.id) ?? null);
  }

  // --- report ---------------------------------------------------------------
  // The path split is printed every run, from the SHEETS manifest rather than
  // from prose, so a sheet that changes path cannot do it quietly.
  const present = (list: readonly string[]) => list.filter((f) => existsSync(join(INBOX, f)));
  const staged = present(SHEETS.contribution);
  const direct = present(SHEETS.bulk);
  console.log(
    `[load-inbox] path: ${staged.length} sheet(s) staged for review${staged.length ? ` (${staged.join(", ")})` : ""}; ` +
      `${direct.length} inserted directly${direct.length ? ` (${direct.join(", ")})` : ""}`,
  );
  const madeAny = Object.keys(report.created).length > 0;
  console.log(
    `[load-inbox] created drafts: ${madeAny ? Object.entries(report.created).map(([k, v]) => `${k}=${v}`).join(", ") : "none (all rows already loaded)"}`,
  );
  for (const w of report.warnings) console.log(`[load-inbox] warning: ${w}`);
  for (const s of report.skipped) console.log(`[load-inbox] skipped: ${s}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[load-inbox] failed:", e);
  process.exit(1);
});
