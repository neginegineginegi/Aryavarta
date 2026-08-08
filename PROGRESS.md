# PROGRESS — session handoff

Last updated: 2026-08-08, commit `e7074c1`.

## 1. Current state

**Live and healthy** at https://abhilekh-orpin.vercel.app; `main` auto-deploys on push. Every
deploy this session reported success via the GitHub commit-status API. 71 unit tests green,
`pnpm build` clean (59 pages), repo-wide lint at **0 errors** (3 warnings, all unused-directive).

Built and deployed across the whole project: map + year scrubber, state/union/election/event/
party/person/promise/document pages, contribution flow, moderation queue with diff and conflict
detection, revision history, search and question answering, insights, compare, Wikidata import,
admin, reports/disputes, media archive, manifesto promises, Development Lens.

## 2. What this session shipped (newest first)

| Commit | What |
| --- | --- |
| `e7074c1` | Development Lens: real column gutters, deliberate category order, "Snapshot" label |
| `1c7b514` | Industry by state: steel/cement/raw materials from 5 GEM files |
| `97f57ff` | Steel snapshots: first Development Data dataset; Development Lens added to /union |
| `53667ff` | Ten-point inspection of the GEM steel tracker |
| `a08c2cc` | The 241 MB ingestion pipeline, designed before built |
| `1f3a8fc` | Insights: header and first group were glued together |
| `dcb6ccf` | Development Data layer: audit and plan |
| `cbe8972` | Compare morphing (roadmap P5): seat bars glide between selections |
| `18022b3` | Discovery (P3): did-you-know lines from the insights engine on record pages |
| `fd9f6bb` | Living Graphs (P2): TrendChart answers questions on hover/tap/keyboard |
| `e504424` | Twelve national moments as pending drafts for review |
| `d6bc97f` | "From the record" fact line under the scrubber, computed not written |
| `78e59f2` | Arrows only where direction is real |
| `eb0449c` | States/Union toggles the map in place instead of navigating |
| `67a5a7b` | Loading, empty and error states (root loading.tsx + error.tsx) |
| `f8c996b` | Source Explorer drawer: what else rests on this document |
| `9bd0de8` | Time Machine on the map: replay, markers, tooltip trail |
| `a15d4ea` | Motion system: one tempo for the whole archive |
| `7702f48` | Accountability layer phase 3: manifesto promises |

**Interaction roadmap (from the design handoff's 14-evolution-roadmap): P0–P5 all shipped
except P4 Story Mode**, which is blocked on event approvals (see §4).

## 3. Architecture notes added this session

- **Motion system** lives in `globals.css`: two curves (`--ease-spring`, `--ease-glide`) and
  five durations (`--dur-press` 150ms → `--dur-fill` 600ms). The
  `@media (prefers-reduced-motion: reduce)` block is **pinned to the END of the file on
  purpose** — its selectors are the same specificity as the rules they override, so mid-file it
  silently did nothing for `.map-state`. Any new animated class must be added to it.
- **`.rec-table tbody td { padding: 10px 0 }` outranks Tailwind padding utilities** on those
  cells (element+class beats a single class). Column gutters therefore live in `globals.css`
  (`td + td { padding-left: 16px }`), not in component classNames. Every `pr-4` written on a
  rec-table cell was dead CSS until `e7074c1`.
- **`useYearPlayback`** (`src/lib/use-year-playback.ts`) drives both maps: rAF-based, not
  setInterval. Playback is deliberately NOT disabled by reduced-motion (it is information);
  the easing around it is. URL sync happens in an effect on `year`, never inside a setState
  updater (an updater runs in the render phase and would mutate the router mid-render).
- **`MapPanel`** holds both map payloads so States/Union swaps in place (`?mode=union`);
  `/union` remains the full record page, reached by clicking the map. Explorers take
  `showModeSwitch` so neither component is forked.
- **`SeatBar` morphing** is a FLIP across remounts using module-scope state keyed by `morphKey`;
  bars without a `morphKey` render exactly as the old server-only version.
- **`SegmentedControl`** (`src/components/ui/SegmentedControl.tsx`) is a **PLACEHOLDER**. The
  user referred to a handoff `SegmentedControl.tsx`; it is not in any of the uploaded bundles.
  It implements the three rules they stated (one persistent indicator element, measured in
  `useLayoutEffect` + `document.fonts.ready`, never remounted on toggle) and is written to be
  replaced wholesale.
- **Development Data**: `indicators` + `indicator_values` already ARE the generic model
  (Indicator/Geography/Time/Value/Unit/Source/Methodology). National values ride union
  pseudo-state `'in'`. Adding a dataset needs **no schema change** — a category and rows in the
  two inbox CSVs. Category reading order is in `CATEGORY_ORDER` in `queries/development.ts`.
- Raw third-party data stays OUT of the repo: `data/raw/` is gitignored except
  `data/raw/gem/MANIFEST.md`, which carries filename, size, SHA-256, release, license and
  verdict for every file received.

## 4. Open items — ALL need the user

1. **Steel production series decision.** The GEM plant-level workbook has crude steel production
   2019–2024, but reporting plants cover only ~63% of India's actual output. Publish clearly
   labelled as partial, or leave out? Unanswered. Everything else from that batch is shipped.
2. **India power dataset still missing.** The energy timeline (solar/wind/hydro/coal, year
   scrubbing) has no data. The 241 MB CSV was never supplied; `Portal_Energetico_tracker` turned
   out to be GEM's **Latin America** portal with **zero India rows**. The pipeline is fully
   designed in `docs/DEVELOPMENT_DATA.md` §3 and waits only on a header + 50–100 rows.
3. **`/review` queue.** Twelve national-moment drafts (Independence, Emergency, liberalisation,
   COVID …) are pending, plus ~79 older drafts. Approving the twelve lights up the map's
   historical marker line and unblocks P4 Story Mode. **Source URLs are unverified** — this
   sandbox cannot reach external hosts, so verification is a review-time job.

Also parked, lower value: `useReveal` is built and used by nothing (applying it site-wide means
wrapping ~30 server pages in client components or a DOM-scanning shim — deliberately not done);
batch review for bulk promise extraction; three placeholder documents in `data/inbox/documents.csv`
with unverified URLs.

## 5. Sandbox traps that cost real time this session

- **`pkill -f next-server` inside a compound command kills the compound's own shell** (the
  pattern matches its command line). Several "clean rebuild" steps therefore never ran while a
  zombie server kept answering on :3000 — that produced an hour chasing a rendering bug that did
  not exist. Use `fuser -k 3000/tcp`, and verify the server actually restarted.
- **Playwright `page.mouse.move()` teleports** and does not produce the pointermove stream a
  real hand does; hover handlers appear broken. Use `{ steps: N }`.
- **Measure computed styles, not inline styles**, when checking a transition: the inline value
  flips instantly by design and reads back as the target.
- **Delaying a response at the network layer stalls the headers**, so no Suspense shell can
  arrive — that measures nothing. To test `loading.tsx`, make the *server* slow.
- Read `node_modules/next/dist/docs/` before assuming Next behaviour (AGENTS.md rule). It pays:
  the loading.js doc's own note explains the `unstable_instant` caveat, which does not apply here
  because `cacheComponents` is off.
- After a DB reseed or new inbox rows: `rm -rf .next` before rebuilding, or the data cache serves
  stale pages. `getDevelopment` also caches 1h.

## 6. Ship flow (unchanged)

Commit on `claude/india-politics-archive-go5kio` → push it → `git checkout main && git merge
--ff-only <branch> && git push origin main` → watch
`https://api.github.com/repos/neginegineginegi/Aryavarta/commits/<sha>/status`. Schema changes go
in `scripts/ensure-upgrades.mjs` (append-only, idempotent, runs during the Vercel build).
`scripts/load-inbox.ts` loads the CSVs on every build; `indicator_values` inserts are
conflict-do-nothing on (indicator, state, year), so **corrections to an existing value need a
manual update**, not a reload.

## 7. Standing project rules

No fabricated real facts, ever — demo data must be obviously fake. No em dashes in user-facing
prose. Wikipedia/Wikidata is never source of truth; imports become pending revisions. Font
variables stay on `<html>` in layout.tsx. The archive never scores, ranks or grades: no promise
verdicts, no scorecards, and superlatives are always scoped "in the published record". Party
colours are data colours from `data/inbox/party_colors.csv` — the user cares a great deal that
every party is visually distinct.
