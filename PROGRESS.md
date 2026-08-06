# PROGRESS — session handoff

Last updated: 2026-08-04 (post-redesign ship, commit `8588c85`)

## 1. Current state

**Working and deployed.** Live at https://abhilekh-orpin.vercel.app; main auto-deploys on push.
Everything in the original spec plus the atlas phases is built: map + year slider, state/union/
election/event/party/person pages, contribution flow, moderation queue with diff + conflict
detection, revision history, search + question answering, insights, compare (elections/leaders/
parties/states), Wikidata import pipeline, admin (users, party colors, import), reports/disputes.
36 unit tests green; `pnpm build` clean (57 pages).

Just shipped (this session): EB Garamond typography, a full redesign on user green-light (card
system, sticky masthead header, rebuilt homepage/footer, spacing pass, site-wide copy rewrite
removing every em dash from user-facing prose), then a second palette pass to the "Making
Software" scheme: cool near-white paper, electric-blue accent, Space Mono technical labels.
Also: the /union page now opens with an interactive map (whole country takes the PM's party
color per selected year, click → /union/[year]); Lakshadweep renders as a clickable circle
marker in both maps (its real geometry is sub-pixel specks; see the comment in MapExplorer);
and the header was refined per user sketch: States/Union toggle lives INSIDE the map cards
(top-left, above the scrubber), account cluster (Review / name / Sign out, subtle icons) sits
far right behind a hairline divider. The user has begun importing real data on production.

**All content is placeholder demo data** (Demo Party Alpha, H. Template Das, etc.). Real facts
enter only via /admin/import → moderator verify → approve. Nothing known broken.

**Sandbox quirks (this repo's dev env, not the app):** outbound to Neon/Wikidata/vercel.app is
proxy-blocked — use local PG16 + `IMPORT_FIXTURES=1`; local Postgres dies sometimes
(`su postgres -c '/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/16/abhilekh -l .../log.txt -o "-p 5432 -k /var/run/postgresql" start'`);
kill dev server with `pkill -f 'next-serve[r]'` (bracket avoids self-kill); Playwright needs
`executablePath: '/opt/pw-browsers/chromium'` + `--no-proxy-server` + createRequire of the
project package.json. After any DB reseed: `rm -rf .next` (stale data cache serves 404s).

**Ship flow:** commit on `claude/india-politics-archive-go5kio` → `git checkout main && git
merge --ff-only <branch> && git push` → push feature branch too. Schema changes go in
`scripts/ensure-upgrades.mjs` (append-only, idempotent; runs during Vercel build).

Product-evolution increment (from the user's PRODUCT EVOLUTION doc): event taxonomy widened
to 17 types (upgrade 4), Development Lens tables + state-page section (upgrade 5; admin-curated
like parties, every value carries source + verified date, NEVER scores governments), two new
insight groups (average turnout by state, government stability), ARCHITECTURE.md (records the
Phase 3 live-mode plug-in design: provisional-results flag, feed bot, historical context from
existing queries), docs/DATA_FORMAT.md (durable CSV spec incl. indicators sheets).

Bulk data pipeline: data/inbox/*.csv is loaded by scripts/load-inbox.ts on EVERY build (after
ensure-upgrades), creating pending Import Bot drafts with the user's cited sources; idempotent
via kind-aware dedup, report printed in the build log. First real batch (Gujarat: 29 terms, 14
elections with results incl. new seatsContested/allianceName payload fields, 7 events) is
committed in the inbox. Election result payloads now round-trip seats_contested and
alliance_name (payloads/snapshot/apply all updated); snapshotsEqual treats null == absent so
additive payload fields never false-conflict old snapshots.

## 2. Open TODOs (priority order)

1. **Redesign sign-off** — user hasn't reacted to the shipped redesign yet; fix whatever page
   they name.
2. **Constituency Explorer** (biggest manifesto item) — BLOCKED on user decision: accept TCPD
   Lok Dhaba license (lokdhaba.ashoka.edu.in) or approve heavier ECI PDF parsing. Do not start
   without that answer.
3. **Real data population** — run /admin/import per state, verify drafts against ECI statistical
   reports (source-amend at review), approve. User-driven; assist when asked.
4. User-side ops (remind, don't nag): rotate Neon DB password (was pasted in chat); publish
   Google OAuth app (still Testing mode → only test users can sign in); legal review before wide
   launch (defamation/BNS §356, IT Act §79 posture, IT Rules 2021 grievance officer, DPDP).
5. If user licenses real Sabon: drop woff2 in `src/fonts/`, swap next/font/google →
   next/font/local in `src/app/layout.tsx` (comment there documents it).
6. Long-tail manifesto entities (deferred): cabinets, policies, Rajya Sabha composition, court
   judgments, districts, swing maps (needs #2's data).

## 3. Tricky decisions — do not re-litigate

- **No fabricated real facts, ever** (user hard rule). Seed/demo data must be obviously fake.
- **Wikipedia/Wikidata never source of truth**: imports become *pending* revisions from Import
  Bot (`origin='import'`), verified by a moderator; `amendRevisionSourcesAction` lets the
  reviewer attach the authoritative (ECI) source before approving.
- **Em dashes are banned in user-facing prose** (user feels strongly). Empty table cells keep
  the "—" marker deliberately — that's a data convention, not writing.
- **Electric-blue accent** (`#2743ee`) + cool near-white paper + Space Mono labels: user
  explicitly asked for the look of Dan Hollick's "Making Software" site (screenshots supplied),
  replacing the earlier teal. Party colors are still data colors only (map/legend/seat bars),
  never interface chrome.
- **Font variables MUST stay on the `<html>` element** in layout.tsx. They once sat on
  `<body>`, and because `html { font-family: var(--font-body) }` could not resolve them the
  whole site silently fell back to Times New Roman. Don't move them back.
- **EB Garamond, not Sabon**: Sabon is commercial (Linotype), can't be bundled; EB Garamond is
  the closest open face. User asked for "a font like Sabon" and accepted this.
- **User's "DO NOT REDESIGN THE UI" manifesto rule was explicitly superseded** — they later said
  "the UI/UX sucks" and picked *all four* overhaul areas in a follow-up question. Redesign was
  authorized; don't treat the old instruction as binding.
- **neon-serverless (WebSocket) driver, not neon-http**: approval flow needs interactive
  transactions (SELECT FOR UPDATE). `DATABASE_DRIVER=neon` switches it on in prod.
- **JWT role is a hint only**; `requireRole()` re-fetches the role from DB on every gated action.
  ADMIN_EMAIL bootstrap runs in both the signIn event and the jwt callback.
- **Next 16**: use `updateTag(tag)` in server actions (`revalidateTag` now needs 2 args).
- **Map year semantics**: color = government in office on 31 Dec; a state formed any time in
  year Y exists for year Y. Pre-formation states render the n.a. hatch, not a party color.
- **One `terms` table for all offices** (cm/presidents_rule/pm/president/governor) with check
  constraints; union is pseudo-state `'in'`, Ladakh `'la'` has no map geometry.
- Imported parties named in `data/inbox/party_colors.csv` get their conventional color +
  abbreviation AT CREATION (`canonicalParty()` in src/lib/import/canonical-party-colors.ts;
  the sheet is traced into server bundles via `outputFileTracingIncludes`). Only uncurated
  parties fall back to the deterministic FNV-hash color (`pickPartyColor`); fix those at
  /admin/parties (auto-assign button also prefers the sheet now). Root cause this closes:
  the user saw Samajwadi Party render BLUE because runtime imports predated the next build,
  and only builds ran the color sheet. Distinct per-party colors matter a lot to the user.

## 4. Next step

Ask the user two questions, then act on the answers:
1. Any page in the deployed redesign that still looks wrong (fix it), and
2. The Constituency Explorer data-source decision: TCPD Lok Dhaba license vs ECI PDF parsing
   (then start that build — it's the last big manifesto item).

If resuming with no user present, there is nothing safely actionable beyond small polish; both
big threads are blocked on their input.
