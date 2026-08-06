/* eslint-disable no-console */
/**
 * Bulk CSV loader: turns files in data/inbox/ into PENDING Import Bot drafts,
 * exactly like the Wikidata pipeline. Runs before every build (like
 * ensure-upgrades) and is idempotent: rows whose entity already exists live,
 * or already has a pending imported draft, are skipped, so committed inbox
 * files can stay in the repo.
 *
 * Sheets (all optional): sources.csv, terms.csv, elections.csv, results.csv,
 * events.csv, indicators.csv, indicator_values.csv. Format: docs/DATA_FORMAT.md.
 *
 * Political content NEVER publishes directly: every row becomes a pending
 * revision reviewed in /review. Development Lens rows are curated reference
 * data and upsert directly, carrying their inline sources.
 */
import "dotenv/config";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { v7 as uuidv7 } from "uuid";
import { and, eq, sql } from "drizzle-orm";

import type { SourceSnapshot } from "../src/lib/revisions/payloads";

const INBOX = join(process.cwd(), "data", "inbox");

// ---------------------------------------------------------------------------
// Tiny CSV parser (quoted fields, embedded commas/quotes/newlines).
// ---------------------------------------------------------------------------
function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);

  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => {
    const rec: Record<string, string> = {};
    keys.forEach((k, i) => (rec[k] = (r[i] ?? "").trim()));
    return rec;
  });
}

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
  const { states, revisions, terms, elections, events, indicators, indicatorValues } =
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

  // --- sources --------------------------------------------------------------
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

  // --- terms ----------------------------------------------------------------
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

    const dup = await db.query.terms.findFirst({
      where: and(
        eq(terms.stateId, st.id),
        eq(terms.kind, office as "cm"),
        eq(terms.startDate, start.date),
        sql`${terms.deletedAt} IS NULL`,
      ),
    });
    if (dup) { skip(`${label}: a live ${office} term already starts on this date`); continue; }
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
    if (pend) { skip(`${label}: an imported ${office} draft already pending for this start date`); continue; }

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

  // --- term updates: end an incumbency (or correct an end date) -------------
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

  // --- elections (+ results merged) ----------------------------------------
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

  // --- events ---------------------------------------------------------------
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

  // --- party colors (curated display metadata, like /admin/parties) --------
  // Standing config: applies to matching parties on every run; unknown
  // parties are reported and picked up automatically once data creates them.
  const { parties } = await import("../src/lib/db/schema");
  const { slugifyPartyId } = await import("../src/lib/import/drafts");
  for (const r of readSheet("party_colors.csv")) {
    const name = r.party_name?.trim();
    const hex = r.primary_hex?.trim();
    if (!name || !hex) continue;
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
      skip(`party color ${name}: invalid hex "${hex}"`);
      continue;
    }
    const party =
      (await db.query.parties.findFirst({ where: eq(parties.name, name) })) ??
      (await db.query.parties.findFirst({ where: eq(parties.id, slugifyPartyId(name)) }));
    if (!party) {
      skip(`party color ${name}: party not in the archive yet (row will apply once it exists)`);
      continue;
    }
    const abbr = r.abbreviation?.trim() || party.abbreviation;
    if (party.color === hex && party.abbreviation === abbr) continue; // already applied
    await db
      .update(parties)
      .set({ color: hex, abbreviation: abbr })
      .where(eq(parties.id, party.id));
    bump("party colors");
  }

  // --- development lens (curated; upserts directly with inline sources) -----
  for (const r of readSheet("indicators.csv")) {
    if (!r.id || !r.name || !r.unit || !r.category || !r.methodology) {
      skip(`indicator "${r.id || r.name}": all of id/name/unit/category/methodology are required`);
      continue;
    }
    await db
      .insert(indicators)
      .values({ id: r.id, name: r.name, unit: r.unit, category: r.category, methodology: r.methodology })
      .onConflictDoNothing();
    bump("indicators");
  }
  for (const r of readSheet("indicator_values.csv")) {
    const label = `indicator value: ${r.indicator} ${r.state} ${r.year}`;
    const st = resolveState(r.state ?? "");
    if (!st) { skip(`${label}: unknown state "${r.state}"`); continue; }
    if (!r.indicator || r.value === "" || !r.source_title || !r.source_url || !r.verified_on) {
      skip(`${label}: indicator, value, source_title, source_url and verified_on are required`);
      continue;
    }
    await db
      .insert(indicatorValues)
      .values({
        id: uuidv7(),
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
      })
      .onConflictDoNothing();
    bump("indicator values");
  }

  // --- report ---------------------------------------------------------------
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
