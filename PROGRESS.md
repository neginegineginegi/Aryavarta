# PROGRESS — session handoff

Last updated: 2026-08-08, commit `a07bb3d`.

## 1. Current state

**Live and healthy** at https://abhilekh-orpin.vercel.app; `main` auto-deploys on push. Every
deploy this session reported success via the GitHub commit-status API. 71 unit tests green,
`pnpm build` clean (59 pages), repo-wide lint at **0 errors** (3 warnings, all unused-directive).

Built and deployed across the whole project: map + year scrubber, state/union/election/event/
party/person/promise/document pages, contribution flow, moderation queue with diff and conflict
detection, revision history, search and question answering, insights, compare, Wikidata import,
admin, reports/disputes, media archive, manifesto promises, Development Lens.

48 indicators carry 4,243 values. The Development Lens holds an **Energy** band with five
generating technologies as multi-year series, each with its own commissioning history:
hydropower from 1922 (51,082 MW), nuclear from 1981 (8,240 MW), gas and oil fired from 1989
(27,363 MW), wind from 1990 (27,055 MW), solar from 2011 (92,754 MW). Everything outside Energy
is still a snapshot.

## 2. What this session shipped (newest first)

| Commit | What |
| --- | --- |
| `a07bb3d` | Energy: hydro, nuclear and gas fired power complete the band |
| `509f9b3` | Energy: solar and wind become the first multi-year indicator series |
| `4bb01be` | PROGRESS.md rewritten as a durable handoff |
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
  Indicator rows are inserted **directly, not as revisions**, so a dataset goes live on the
  build that loads it; only editorial content (terms, elections, events, promises) queues for
  review.
- **Cumulative capacity series** (`extract-gem-power-2026.py`): for each geography and year,
  the summed capacity of assets whose recorded commissioning year is that year or earlier. A
  geography's series starts at ITS OWN first recorded year, never at the dataset minimum:
  emitting zeros earlier would assert "this state had none", which a tracker with a size
  threshold cannot support. **The test for whether a source may become a series at all is
  whether its capacity figure belongs to the year it is filed under.** GEM tracks project
  phases, so a solar expansion is a new dated row and the series is sound. A blast furnace is
  one row whose "current capacity" is a present-day rating (oldest operating Indian unit 1919,
  all 80 dated units relined), so iron is published as snapshots. That series was built and
  withdrawn; do not rebuild it. Coverage percentages are computed at extract time and written
  into the methodology text so prose cannot drift from data. **The test is decided in the
  About sheet's column definition, not by looking at the numbers**: "nameplate capacity" is the
  design rating fixed at commissioning and may become a series; "Current capacity" is a
  present-day rating and may not.
- **Watch for per-file sentinels; there are at least three.** Solar and wind leave a date cell
  empty, the iron workbooks write `unknown`, the gas and oil tracker writes `not found`. Nine
  undated units hid behind the third spelling. `blank()` in the extractor holds the shared set;
  check any new file for its own before trusting a coverage number.
- **Never assert an absence in generated prose.** Solar and wind first claimed "the source
  records no retired Indian projects" and the extractor exited if that stopped being true,
  which would have refused the gas and oil tracker for being accurate about one retired unit.
  `reconstruction_note()` and `coverage_sentence()` read the counts out instead, and produce
  byte-identical text when the count is zero so nothing already published moves.
- **Map markers prefer a record that cites a source**, then the earliest date, then earliest
  created. Not a cosmetic tie-break: the seeded 1984 placeholder carries a date while Operation
  Blue Star's record carries only a year, so date-first ordering put a row titled "DEMO:" on the
  public timeline ahead of it.
- Raw third-party data stays OUT of the repo: `data/raw/` is gitignored except
  `data/raw/gem/MANIFEST.md`, which carries filename, size, SHA-256, release, license and
  verdict for every file received.

## 4. Open items

1. **Steel production series decision** (needs the user). The GEM plant-level workbook has crude
   steel production 2019–2024, but reporting plants cover only ~63% of India's actual output.
   Publish clearly labelled as partial, or leave out? Still unanswered.
2. **Solar licence constraint** (needs the user's awareness, not a code change). 2,575 of 4,467
   India solar rows derive from the TransitionZero Solar Asset Mapper under **CC BY-NC 4.0** and
   621 from wiki-solar.org's proprietary set; only 1,191 are GEM-only CC BY 4.0. What ships is a
   derived aggregate and all three upstreams are cited in the methodology, but the
   non-commercial term constrains reuse of `solar-capacity-operating`.
3. **Six approved moments sit before the map's earliest year.** `minYear` is the earliest
   chief-minister term in the record, floored at 1947, and term data currently starts at 1978,
   so Independence, the Constitution, both earlier wars and the Emergency cannot appear as
   scrubber ticks. This is data completeness, not a defect: the range extends on its own as
   historical terms are imported, and widening the slider past the term data would only show a
   blank map. Importing pre-1978 CM terms is the fix.
4. **Coal fired power is the one generating technology still missing.** GEM's Global Coal Plant
   Tracker would complete the band; the extractor takes it with one more `do_*` function.

Resolved this session: the `/review` queue (the user cleared it, so the twelve national moments
are published and the marker line is live), the long-missing India power dataset, and four of
the five generating technologies that followed it.

Also parked, lower value: `useReveal` is built and used by nothing; batch review for bulk
promise extraction; three placeholder documents in `data/inbox/documents.csv` with unverified
URLs. The three seeded `DEMO:` national placeholders (1961, 1984, 2009) still show as markers in
years where no real record exists; deleting seed data is the owner's call.

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
- **`data/inbox/indicator_values.csv` is CRLF; `indicators.csv` is LF.** Appending with Python
  `read_text`/`write_text` silently rewrote 2,112 lines to LF and buried a 518-row addition in a
  4,742-line diff. Append in **binary**, matching whatever endings the file already has, and
  check `git diff --numstat` shows zero deletions before committing a data file.
- **Playwright needs an explicit `executablePath`** here: the installed version looks for
  `chromium_headless_shell-1234` but `/opt/pw-browsers` holds `chromium` and `-1194` builds.
  Launch with `{ executablePath: "/opt/pw-browsers/chromium" }`. Scripts must also live under the
  repo root to resolve the package, and `range.fill(y)` throws "Malformed value" for a year
  outside the slider's own min/max, which is a useful signal about the record's coverage.
- **`pnpm tsx` compiles one-off scripts as CJS**, so top-level `await` fails. Wrap in
  `async function main() { … } main()`.

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
