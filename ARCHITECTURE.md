# Abhilekh architecture

A map for extending the platform without rewriting it. Read alongside
PROGRESS.md (session state) and docs/DATA_FORMAT.md (bulk data spec).

## Stack

Next.js App Router (React server components; client components only where
interactivity demands it), Drizzle ORM on Postgres (Neon in production,
`DATABASE_DRIVER=neon` selects the WebSocket driver), Auth.js v5 with Google
OAuth and JWT sessions, Tailwind v4 tokens in `globals.css`. Vercel functions
are pinned to `sin1` beside the database (`vercel.json`).

## Invariants that must survive every future feature

1. **Every published fact cites a source.** Enforced in payload validation
   and again in the approval transaction. Never add a write path that skips it.
2. **Every change to live content flows through the revision system**
   (`revisions` table: before/after snapshots, pending → approved/rejected,
   tombstoned deletes). Even the admin one-click removal records and approves
   a delete revision rather than bypassing it. Two deliberate exceptions,
   both curated reference data, not published claims: `parties` and the
   Development Lens tables (`indicators`, `indicator_values`), which are
   admin-managed and carry their sources inline per row.
3. **Imports are never the source of truth.** Wikidata/bulk-CSV data becomes
   *pending* revisions from the Import Bot (`origin='import'`); a moderator
   verifies against an authoritative source before anything publishes.
4. **No fabricated facts, ever.** Demo/seed data must be obviously fake.
   Real content enters only through the import/verify flow.
5. **Party colors are data colors** (map, legend, seat bars), never interface
   chrome. Interface stays politically neutral.
6. **Schema changes are additive** and ship via `scripts/ensure-upgrades.mjs`
   (append-only, idempotent statements run before every build).

## Extension points (how to add things)

- **New entity fields / tables**: extend `src/lib/db/schema.ts`, append
  idempotent DDL to `ensure-upgrades.mjs`, extend the Zod payload schema and
  canonical snapshot if the entity is revision-managed.
- **New event categories**: append to `eventTypeEnum` + `EVENT_TYPE_LABELS` +
  `EVENT_TYPE_ORDER`; forms and pages render from the label map automatically.
- **New computed insights**: add a group inside `computeInsights()`
  (`src/lib/insights.ts`). Every group must carry a `method` line stating
  exactly how it was computed; nothing on /insights is hand-written.
- **New structured search answers**: add a pattern to `tryAnswer()`
  (`src/lib/ask.ts`); answers must cite their method and link to entities.
- **New comparison modes**: follow `src/app/compare/extras.tsx` panels; they
  are thin composition over existing queries.
- **Caching**: cached reads declare tags from `src/lib/cache.ts`; server
  actions revalidate with `updateTag`. New cached queries must join that
  scheme or they will serve stale data after approvals.

## Development Lens (Phase: data)

`indicators` (definition: unit, category, methodology) and `indicator_values`
(state, year, numeric value, source title/URL, reporting period, verified-on
date; unique per indicator+state+year). Read path:
`src/lib/db/queries/development.ts` → `DevelopmentSection` on state pages,
which renders only when data exists.

Principles: the platform NEVER scores, ranks, or grades governments. It
presents sourced series neutrally. Indicator data is deliberately independent
of political entities: no foreign keys into terms/elections, so a data
revision on either side never cascades into the other. Future features
(charts, compare-mode panels, per-government slices by date range) are reads
over the same two tables.

## Phase 3: Live Mode (designed, not built)

The plan that avoids a rewrite later:

- **Data**: live counting data is just election data with lower confidence.
  When needed, add (additively) `is_provisional boolean default false` and
  `as_of timestamp` to `election_results`, plus `leading`/`trailing` counts
  if round-level data is wanted. Historical tables gain nothing else.
- **Ingestion**: a feed poller (ECI results service) writes provisional rows
  under a dedicated bot identity, exactly parallel to the Import Bot. When
  official final results publish, the same verify-and-approve flow converts
  provisional rows into the permanent sourced record, and the flag flips.
- **Presentation**: a `live` variant of the election dashboard that renders
  provisional numbers with an unmistakable "provisional, as of HH:MM" badge.
  The "so what" layer (held-since, largest-ever margin, versus historical
  average) is computed by the queries and insight helpers that already exist
  over historical data; live mode consumes them read-only.
- **Mode switch**: a header-level Historical/Live toggle, like States/Union.
  Nothing in historical mode changes; live mode is additive routes.

## Constituency layer (blocked on data licensing)

Schema-ready design: `constituencies` (id, state, name, reserved status,
delimitation era) and `constituency_results` per election. The blocker is
the data source decision (TCPD Lok Dhaba license vs parsing ECI PDFs), not
architecture. When resolved, insights like "never changed party" become new
`computeInsights` groups over the new tables.
