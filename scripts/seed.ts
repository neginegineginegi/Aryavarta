/* eslint-disable no-console */
/**
 * Seed script.
 *
 *   pnpm db:seed          → reference data only: states/UTs + pseudo-parties.
 *   pnpm db:seed --demo   → additionally loads CLEARLY FAKE placeholder
 *                           content (Demo Party Alpha, "A. Sample Kumar", ...)
 *                           for local development and previews. Never run
 *                           against a production database.
 *
 * Per project policy, no real political facts (parties, CMs, elections,
 * events, or source URLs) are ever seeded. Real content is entered and
 * verified by editors through the contribution flow.
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { v7 as uuidv7 } from "uuid";

import * as schema from "../src/lib/db/schema";

const {
  states,
  parties,
  terms,
  elections,
  electionResults,
  events,
  sources,
  eventSources,
  termSources,
  electionSources,
  users,
  revisions,
} = schema;

// ---------------------------------------------------------------------------
// Reference data: states & union territories.
// ids match @svg-maps/india v2.0.0 locations; 'la' (Ladakh) has no geometry
// because the map package predates the 2019 reorganisation.
// Formation dates are seeded from standard reference values — VERIFY before
// relying on them editorially; they are display metadata, not sourced claims.
// ---------------------------------------------------------------------------

type StateSeed = {
  id: string;
  name: string;
  kind: "state" | "union_territory";
  formedOn: string | null;
  dissolvedOn?: string;
  hasGeometry?: boolean;
};

const STATE_SEED: StateSeed[] = [
  { id: "an", name: "Andaman and Nicobar Islands", kind: "union_territory", formedOn: "1956-11-01" },
  { id: "ap", name: "Andhra Pradesh", kind: "state", formedOn: "1956-11-01" },
  { id: "ar", name: "Arunachal Pradesh", kind: "state", formedOn: "1987-02-20" },
  { id: "as", name: "Assam", kind: "state", formedOn: "1950-01-26" },
  { id: "br", name: "Bihar", kind: "state", formedOn: "1950-01-26" },
  { id: "ch", name: "Chandigarh", kind: "union_territory", formedOn: "1966-11-01" },
  { id: "ct", name: "Chhattisgarh", kind: "state", formedOn: "2000-11-01" },
  { id: "dn", name: "Dadra and Nagar Haveli", kind: "union_territory", formedOn: "1961-08-11", dissolvedOn: "2020-01-26" },
  { id: "dd", name: "Daman and Diu", kind: "union_territory", formedOn: "1987-05-30", dissolvedOn: "2020-01-26" },
  { id: "dl", name: "Delhi", kind: "union_territory", formedOn: null },
  { id: "ga", name: "Goa", kind: "state", formedOn: "1987-05-30" },
  { id: "gj", name: "Gujarat", kind: "state", formedOn: "1960-05-01" },
  { id: "hr", name: "Haryana", kind: "state", formedOn: "1966-11-01" },
  { id: "hp", name: "Himachal Pradesh", kind: "state", formedOn: "1971-01-25" },
  { id: "jk", name: "Jammu and Kashmir", kind: "union_territory", formedOn: null },
  { id: "jh", name: "Jharkhand", kind: "state", formedOn: "2000-11-15" },
  { id: "ka", name: "Karnataka", kind: "state", formedOn: "1956-11-01" },
  { id: "kl", name: "Kerala", kind: "state", formedOn: "1956-11-01" },
  { id: "la", name: "Ladakh", kind: "union_territory", formedOn: "2019-10-31", hasGeometry: false },
  { id: "ld", name: "Lakshadweep", kind: "union_territory", formedOn: "1956-11-01" },
  { id: "mp", name: "Madhya Pradesh", kind: "state", formedOn: "1956-11-01" },
  { id: "mh", name: "Maharashtra", kind: "state", formedOn: "1960-05-01" },
  { id: "mn", name: "Manipur", kind: "state", formedOn: "1972-01-21" },
  { id: "ml", name: "Meghalaya", kind: "state", formedOn: "1972-01-21" },
  { id: "mz", name: "Mizoram", kind: "state", formedOn: "1987-02-20" },
  { id: "nl", name: "Nagaland", kind: "state", formedOn: "1963-12-01" },
  { id: "or", name: "Odisha", kind: "state", formedOn: "1950-01-26" },
  { id: "py", name: "Puducherry", kind: "union_territory", formedOn: "1963-07-01" },
  { id: "pb", name: "Punjab", kind: "state", formedOn: "1966-11-01" },
  { id: "rj", name: "Rajasthan", kind: "state", formedOn: "1956-11-01" },
  { id: "sk", name: "Sikkim", kind: "state", formedOn: "1975-05-16" },
  { id: "tn", name: "Tamil Nadu", kind: "state", formedOn: "1950-01-26" },
  { id: "tg", name: "Telangana", kind: "state", formedOn: "2014-06-02" },
  { id: "tr", name: "Tripura", kind: "state", formedOn: "1972-01-21" },
  { id: "up", name: "Uttar Pradesh", kind: "state", formedOn: "1950-01-26" },
  { id: "ut", name: "Uttarakhand", kind: "state", formedOn: "2000-11-09" },
  { id: "wb", name: "West Bengal", kind: "state", formedOn: "1950-01-26" },
];

// Pseudo-parties: real ECI categories, not political claims. 'ind' can hold a
// CM term (independents have); 'oth' aggregates residual seat counts.
const PSEUDO_PARTIES = [
  { id: "ind", name: "Independent", abbreviation: "IND", color: "#6b7280", isPseudo: true },
  { id: "oth", name: "Others", abbreviation: "OTH", color: "#9ca3af", isPseudo: true },
];

// ---------------------------------------------------------------------------
// Demo data (clearly fake; --demo only)
// ---------------------------------------------------------------------------

const DEMO_PARTIES = [
  { id: "demo-a", name: "Demo Party Alpha", abbreviation: "DPA", color: "#2563eb", isPseudo: false },
  { id: "demo-b", name: "Demo Party Beta", abbreviation: "DPB", color: "#d97706", isPseudo: false },
  { id: "demo-c", name: "Demo Party Gamma", abbreviation: "DPG", color: "#059669", isPseudo: false },
  { id: "demo-d", name: "Demo Party Delta", abbreviation: "DPD", color: "#7c3aed", isPseudo: false },
];

const DEMO_CM_NAMES = [
  "A. Sample Kumar",
  "B. Placeholder Devi",
  "C. Example Rao",
  "D. Specimen Singh",
  "E. Mockup Sharma",
  "F. Dummy Nair",
  "G. Fixture Reddy",
  "H. Template Das",
];

const DEMO_EVENTS: Array<{
  type: (typeof schema.eventTypeEnum.enumValues)[number];
  title: string;
  description: string;
}> = [
  {
    type: "paper_leak",
    title: "Sample examination paper leak (placeholder)",
    description:
      "Placeholder description of a fictional examination paper leak used for interface development. All names, dates and outcomes described here are invented and carry no relation to real incidents.",
  },
  {
    type: "corruption",
    title: "Fictional procurement irregularity case (placeholder)",
    description:
      "Placeholder description of a fictional corruption case involving the invented 'Sample Infrastructure Board'. This entry exists only so developers can style event pages.",
  },
  {
    type: "policy_failure",
    title: "Invented subsidy scheme shortfall (placeholder)",
    description:
      "Placeholder description of a fictional policy failure. Statistics shown anywhere in this entry are fabricated for layout testing.",
  },
  {
    type: "governance_failure",
    title: "Mock administrative lapse report (placeholder)",
    description:
      "Placeholder description of a fictional governance failure for testing list layouts, filters and typography.",
  },
  {
    type: "communal_incident",
    title: "Fictional public order incident (placeholder)",
    description:
      "Placeholder description of a fictional law-and-order incident. Deliberately generic: demo data must never resemble a real event.",
  },
  {
    type: "infrastructure_failure",
    title: "Sample bridge closure event (placeholder)",
    description:
      "Placeholder description of a fictional infrastructure failure affecting the invented 'Demo River Bridge'.",
  },
  {
    type: "other",
    title: "Miscellaneous placeholder event",
    description: "A placeholder event of type 'other' for interface development.",
  },
];

// Deterministic tiny PRNG so demo data (and screenshots) are reproducible.
function makeRng(seedText: string) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

async function main() {
  const demo = process.argv.includes("--demo");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log("Seeding reference data (states + pseudo-parties)...");
  for (const s of STATE_SEED) {
    await db
      .insert(states)
      .values({
        id: s.id,
        name: s.name,
        kind: s.kind,
        formedOn: s.formedOn,
        dissolvedOn: s.dissolvedOn ?? null,
        hasGeometry: s.hasGeometry ?? true,
      })
      .onConflictDoUpdate({
        target: states.id,
        set: {
          name: s.name,
          kind: s.kind,
          formedOn: s.formedOn,
          dissolvedOn: s.dissolvedOn ?? null,
          hasGeometry: s.hasGeometry ?? true,
        },
      });
  }
  for (const p of PSEUDO_PARTIES) {
    await db.insert(parties).values(p).onConflictDoNothing();
  }
  console.log(`  ${STATE_SEED.length} states/UTs, ${PSEUDO_PARTIES.length} pseudo-parties.`);

  if (!demo) {
    console.log("Done. (Run with --demo for fake development content.)");
    await pool.end();
    return;
  }

  console.log("Seeding CLEARLY FAKE demo content (--demo)...");

  for (const p of DEMO_PARTIES) {
    await db.insert(parties).values(p).onConflictDoNothing();
  }

  // Demo users.
  const [demoContributor] = await db
    .insert(users)
    .values({
      name: "Demo Contributor",
      email: "contributor@example.org",
      role: "contributor",
    })
    .onConflictDoUpdate({ target: users.email, set: { name: "Demo Contributor" } })
    .returning();
  const [demoModerator] = await db
    .insert(users)
    .values({ name: "Demo Moderator", email: "moderator@example.org", role: "moderator" })
    .onConflictDoUpdate({ target: users.email, set: { name: "Demo Moderator" } })
    .returning();

  // Wipe previously seeded demo content so the script is re-runnable.
  await db.delete(revisions);
  await db.delete(eventSources);
  await db.delete(termSources);
  await db.delete(electionSources);
  await db.delete(events);
  await db.delete(electionResults);
  await db.delete(elections);
  await db.delete(terms);
  await db.delete(sources);

  const geoStates = STATE_SEED.filter((s) => s.hasGeometry !== false && !s.dissolvedOn);

  let termCount = 0;
  let electionCount = 0;
  let eventCount = 0;

  const makeSource = async (label: string, slug: string) => {
    const url = `https://example.org/archive/${slug}`;
    const [row] = await db
      .insert(sources)
      .values({
        id: uuidv7(),
        title: `${label} (placeholder source)`,
        url,
        publisher: "Example Demo Gazette",
        publishedOn: "2020-01-01",
        accessedOn: "2026-08-01",
      })
      .onConflictDoUpdate({ target: sources.url, set: { title: `${label} (placeholder source)` } })
      .returning();
    return row;
  };

  for (const s of geoStates) {
    const rng = makeRng(s.id);
    // Alternating fake terms from 1978 to the present, ~5y apiece, with an
    // occasional President's Rule gap so the UI has real variety to render.
    let year = 1978 + Math.floor(rng() * 4);
    let cmIdx = Math.floor(rng() * DEMO_CM_NAMES.length);
    while (year < 2026) {
      const span = 4 + Math.floor(rng() * 3); // 4-6 years
      const end = Math.min(year + span, 2026);
      const isPR = rng() < 0.08;
      const termId = uuidv7();
      if (isPR) {
        await db.insert(terms).values({
          id: termId,
          stateId: s.id,
          kind: "presidents_rule",
          cmName: null,
          partyId: null,
          startDate: `${year}-03-15`,
          endDate: `${Math.min(year + 1, 2026)}-02-28`,
          notes: "Placeholder President's Rule period (demo data).",
        });
        year = Math.min(year + 1, 2026);
      } else {
        const party = DEMO_PARTIES[Math.floor(rng() * DEMO_PARTIES.length)];
        const cm = DEMO_CM_NAMES[cmIdx % DEMO_CM_NAMES.length];
        cmIdx += 1 + Math.floor(rng() * 2);
        const ongoing = end >= 2026;
        await db.insert(terms).values({
          id: termId,
          stateId: s.id,
          kind: "cm",
          cmName: cm,
          partyId: party.id,
          startDate: `${year}-03-15`,
          endDate: ongoing ? null : `${end}-03-14`,
          notes: null,
        });
        const src = await makeSource(`Term record: ${cm}, ${s.name}`, `term-${s.id}-${year}`);
        await db.insert(termSources).values({ termId, sourceId: src.id });

        // A fake election at the start of most terms.
        if (rng() < 0.85) {
          const electionId = uuidv7();
          const totalSeats = 60 + Math.floor(rng() * 200);
          await db.insert(elections).values({
            id: electionId,
            stateId: s.id,
            electionDate: `${year}-02-20`,
            resultSummary: `Placeholder result summary: ${party.name} formed the government (demo data, entirely fictional).`,
            totalSeats,
            turnoutPercent: (55 + rng() * 30).toFixed(2),
          });
          let remaining = totalSeats;
          const shares = DEMO_PARTIES.map((p) => ({ p, w: p.id === party.id ? 2 + rng() : rng() }));
          const wSum = shares.reduce((a, b) => a + b.w, 0);
          for (const { p, w } of shares) {
            const seatsWon = Math.max(0, Math.floor((totalSeats * w) / wSum));
            remaining -= seatsWon;
            await db.insert(electionResults).values({
              electionId,
              partyId: p.id,
              seatsWon,
              voteSharePercent: ((w / wSum) * 100).toFixed(2),
            });
          }
          if (remaining > 0) {
            await db.insert(electionResults).values({
              electionId,
              partyId: "oth",
              seatsWon: remaining,
              voteSharePercent: null,
            });
          }
          const esrc = await makeSource(
            `Election record: ${s.name} ${year}`,
            `election-${s.id}-${year}`,
          );
          await db.insert(electionSources).values({ electionId, sourceId: esrc.id });
          electionCount++;
        }
      }
      termCount++;
      year = end;
    }
  }

  // Published demo events for a handful of states.
  const eventStates = ["tg", "ap", "up", "kl", "mh", "wb", "br", "tn"];
  for (const stateId of eventStates) {
    const rng = makeRng(`events-${stateId}`);
    const n = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const tmpl = DEMO_EVENTS[(i + Math.floor(rng() * DEMO_EVENTS.length)) % DEMO_EVENTS.length];
      const year = 1990 + Math.floor(rng() * 36);
      const eventId = uuidv7();
      await db.insert(events).values({
        id: eventId,
        stateId,
        year,
        eventDate: rng() < 0.5 ? `${year}-0${1 + Math.floor(rng() * 9)}-15` : null,
        type: tmpl.type,
        title: tmpl.title,
        description: tmpl.description,
        status: "published",
      });
      const src = await makeSource(
        `Report: ${tmpl.title} — ${stateId} ${year}`,
        `event-${stateId}-${year}-${i}`,
      );
      await db.insert(eventSources).values({ eventId, sourceId: src.id });
      eventCount++;
    }
  }

  // A couple of pending revisions so /review has content:
  // 1. a brand-new event proposal (paired hidden event row, per workflow), and
  const pendingEventId = uuidv7();
  const pendingEventPayload = {
    stateId: "tg",
    year: 2025,
    eventDate: null,
    type: "paper_leak" as const,
    title: "Pending demo event: sample recruitment exam leak (placeholder)",
    description:
      "A fictional pending submission used to develop the moderation queue. Entirely invented.",
    sources: [
      {
        title: "Pending demo source (placeholder)",
        url: "https://example.org/archive/pending-event-tg-2025",
        publisher: "Example Demo Gazette",
        publishedOn: "2025-12-01",
        accessedOn: "2026-08-01",
      },
    ],
  };
  await db.insert(events).values({
    id: pendingEventId,
    stateId: "tg",
    year: 2025,
    eventDate: null,
    type: "paper_leak",
    title: pendingEventPayload.title,
    description: pendingEventPayload.description,
    status: "pending_review",
  });
  await db.insert(revisions).values({
    id: uuidv7(),
    entityType: "event",
    entityId: pendingEventId,
    stateId: "tg",
    action: "create",
    beforeData: null,
    afterData: pendingEventPayload,
    title: pendingEventPayload.title,
    summary: "Demo pending submission (placeholder).",
    status: "pending",
    proposedBy: demoContributor.id,
  });

  // 2. an update proposal against an existing published term.
  const [someTerm] = await db
    .select()
    .from(terms)
    .where(sql`${terms.stateId} = 'kl' AND ${terms.kind} = 'cm'`)
    .limit(1);
  if (someTerm) {
    const [linkedSource] = await db
      .select({ id: sources.id, title: sources.title, url: sources.url })
      .from(termSources)
      .innerJoin(sources, eq(termSources.sourceId, sources.id))
      .where(eq(termSources.termId, someTerm.id))
      .limit(1);
    const beforePayload = {
      stateId: someTerm.stateId,
      kind: someTerm.kind,
      cmName: someTerm.cmName,
      partyId: someTerm.partyId,
      startDate: someTerm.startDate,
      endDate: someTerm.endDate,
      notes: someTerm.notes,
      sources: linkedSource
        ? [
            {
              id: linkedSource.id,
              title: linkedSource.title,
              url: linkedSource.url,
              publisher: "Example Demo Gazette",
              publishedOn: "2020-01-01",
              accessedOn: "2026-08-01",
            },
          ]
        : [],
    };
    await db.insert(revisions).values({
      id: uuidv7(),
      entityType: "term",
      entityId: someTerm.id,
      stateId: someTerm.stateId,
      action: "update",
      beforeData: beforePayload,
      afterData: {
        ...beforePayload,
        notes: "Proposed demo correction to this placeholder term (for diff-view development).",
        sources: [
          ...beforePayload.sources,
          {
            title: "Additional pending demo source (placeholder)",
            url: "https://example.org/archive/pending-term-correction",
            publisher: "Example Demo Gazette",
            publishedOn: "2026-01-15",
            accessedOn: "2026-08-01",
          },
        ],
      },
      title: `CM term: ${someTerm.cmName ?? "?"} (${someTerm.startDate} – ${someTerm.endDate ?? "incumbent"})`,
      summary: "Demo pending correction (placeholder).",
      status: "pending",
      proposedBy: demoContributor.id,
    });
  }

  console.log(
    `  ${termCount} terms, ${electionCount} elections, ${eventCount} events, 2 pending revisions.`,
  );
  console.log(`  Demo users: ${demoContributor.email}, ${demoModerator.email}`);
  console.log("Done.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
