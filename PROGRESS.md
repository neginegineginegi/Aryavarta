# PROGRESS — session handoff

Last updated: 2026-08-10, commit `40cdec5`.

## 1. Current state

**Live and healthy** at https://abhilekh-orpin.vercel.app; `main` auto-deploys on push. Every
deploy this session reported success via the GitHub commit-status API. 71 unit tests green,
`pnpm build` clean (59 pages), repo-wide lint at **0 errors** (3 warnings, all unused-directive).

Built and deployed across the whole project: map + year scrubber, state/union/election/event/
party/person/promise/document pages, contribution flow, moderation queue with diff and conflict
detection, revision history, search and question answering, insights, compare, Wikidata import,
admin, reports/disputes, media archive, manifesto promises, Development Lens.

51 indicators carry 5,034 values. The **Energy** band holds six generating technologies as
multi-year series, each with its own commissioning history: coal from 1965 (254,318 MW, larger
than all the rest together), hydropower from 1922 (51,082 MW), gas and oil fired from 1989
(27,363 MW), wind from 1990 (27,055 MW), solar from 2011 (92,754 MW), nuclear from 1981
(8,240 MW), plus bioenergy as a snapshot. Everything outside Energy is still a snapshot.

## 2. What this session shipped (newest first)

| Commit | What |
| --- | --- |
| `40cdec5` | The network graph: nodes, expansion, and the evidence behind every line |
| `4f5b363` | Graph phase A: one edge shape, and ids the graph can actually reach |
| `61d996b` | Funding and Influence Map: the evidence spine |
| `1fe0757` | Type stops moving when you stop scrolling |
| `313884b` | The wordmark answers the cursor instead of standing still |
| `e13e8c8` | Hero eyebrow goes back to capitals |
| `41d849a` | Nothing on the site shouts any more |
| `c506198` | Controls speak in one voice, and the buttons were never mono |
| `6500ba3` | Hero runs unbroken from the top of the page, as the design shows |
| `0297924` | Give the first card on a page the gap every other card already has |
| `ef02e24` | Energy: coal completes the band, and it dwarfs the rest |
| `eda5c9a` | Event ticks sit on the thumb, not a flat percentage of the track |
| `b742259` | Living background: the real handoff files replace my spec-built version |
| `9b303d8` | Living background: tricolor bands become reactive canvases |
| `1794cc1` | Cursor field and nav dropdowns, built from the spec (files absent) |
| `7603cd1` | Trend captions carry what varies, not the same source 1,425 times |
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
except P4 Story Mode**, which is now UNBLOCKED. It waited on event approvals; the queue is
clear, the twelve national moments are published, and the scrubber's marker line is live.

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
- **Cursor field** (`src/lib/cursor-field.ts`): module singleton, one rAF loop, geometry cached
  in DOCUMENT coordinates so scroll is free. Anything that changes layout without a resize must
  call `refresh()`. It parks when everything reaches rest. **Like `SegmentedControl`, this was
  built from a written spec because the handoff's four source files were in no uploaded bundle**;
  it is meant to be replaced wholesale. Two rules the spec itself dictates: `chars` mode changes
  advance widths, so it is banned anywhere a width change reflows neighbours (a centred wrapping
  nav row counts, not just wrapping prose), and mono text always takes `ink` because Plex Mono is
  pinned to 400/500 with no variable axis to interpolate.
- **Living field** (`src/lib/living-field.ts`): one `energy` number takes scroll, pointer travel
  and taps, decays exponentially, and scales both wave height and drift. `phase` is pushed by
  scroll, not time, so a crest travels through a band as the page moves. Also spec-built (files
  absent; the `Abhilekh Landing.dc.html` in the bundles is the earlier version with no canvas).
  **A `.ribbon-*` box is taller than the `.prism-*` it shadows and sits higher to compensate** so
  the wave has headroom; change one number and you must change its pair. Each canvas keeps the
  prism's gradient as a CSS background so bands survive with JavaScript off.
- **Range ticks must sit on the THUMB's travel, not the track's width.** A thumb runs from half
  its own width in to half from the end, so a flat percentage misses it by up to half a thumb,
  worst at both extremes: measured -9.8px and +10.5px before the fix. `--year-thumb` is read by
  the thumb rule and by `.year-tick` alike. Any future slider decoration has the same trap.
- **When two GEM files hold the same asset, prefer the one whose geography is complete, and say
  which was used.** Coal and bioenergy come from the Global Integrated Power tracker; the other
  five technologies keep citing their dedicated trackers. The split was verified, not assumed:
  the integrated file reproduces the dedicated ones exactly (679 wind units at 38,937 MW, 21
  nuclear at 8,240 MW). The dedicated bioenergy tracker was set aside for naming a state for 19
  of 158 Indian units where the integrated file names one for 149.
- **`AutoLetters` mutates DOM React owns.** The MutationObserver heal is what makes that
  survivable and it must ignore its own writes (`busy`). **It must also start AFTER hydration**:
  on mount it split text React had not yet claimed and every route threw "server rendered HTML
  didn't match the client", de-opting that tree to client rendering. It now waits for the DOM to
  go quiet (250ms without childList work) with a 4s cap; attribute mutations are excluded or the
  cursor field's inline styles hold it busy forever. `CursorText` carries `data-auto="skip"` so
  the blanket does not re-split letters that are already letters.
- **`AutoLetters` freezes any text React later PATCHES rather than replaces.** It swaps a
  text node for per-character spans; React still holds the reference to the node it created,
  writes the new text there, and the write lands on a node no longer in the document. The
  network's evidence panel showed every relationship as "funded" because that was the first edge
  selected, while the same `edgeLabel()` call rendered correctly in the list beside it (a keyed
  list mounts a fresh element per row, so there is nothing to patch). `data-auto="skip"` on an
  ancestor protects a whole subtree. Any surface whose text changes under the reader needs it.
  Checked the rest of the site for the same freeze: on the home page all 71 split elements do
  update when the year moves, so this was not a pre-existing defect, only a trap for anything
  built the way that panel was.
- **The cursor field caches centres in DOCUMENT space, which is wrong for anything sticky or
  fixed.** The masthead holds its place in the VIEWPORT while the document slides past it, so a
  magnet registered there drifts toward wherever the header happened to be at page load and is
  dead by the second screen. `registerMagnet(el, { sticky: true })` re-measures each frame and
  compares in viewport coordinates instead. Only the masthead wordmark needs it today; any future
  magnet inside a sticky or fixed container needs it too.
- **अभिलेखः never becomes letters, so it gets its own affordance.** Devanagari conjuncts break
  when each character is wrapped, which is why `AutoLetters` skips any string containing the
  script. `Wordmark` (`src/components/ui/Wordmark.tsx`) is the answer the handoff prescribes: a
  CSS `:hover` scale for the growth plus the magnet for the drift. They compose only because the
  engine writes the standalone `translate` property; if it ever wrote `transform` the two would
  clobber each other and the hover would look broken at random.
- **A closed dropdown must be `display:none`, not merely hidden.** `visibility:hidden` leaves the
  box in the scroll extent, so an off-viewport panel hands every visitor a horizontal scrollbar
  with all menus shut. Below md the panel spans the nav row by making `.nav-entry` position:static
  so `.nav-root` becomes its containing block; growing the wrapper instead reflows the centred row
  and flickers the menu open and shut at 320px.
- **`TrendChart` is a client component, so every point's caption ships in the payload.** Naming
  the source per point on a single-source series put one 44-character string 1,425 times on the
  hydropower indicator page. `sourcesDiffer()` in `format.ts` gates it; the reporting period
  always stays, because "2023-24" says something the year does not. Any new per-point prop is
  paid for once per point, so ask whether it varies before adding it.
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
3. **Six approved moments show in Union mode but not in States.** `minYear` is the earliest
   term in the record: 1947 for the Union (all 14 markers appear) but 1978 for the states, so
   Independence, the Constitution, both earlier wars and the Emergency are missing only from the
   States scrubber. Data completeness, not a defect: importing pre-1978 CM terms extends the
   range on its own, and widening the slider past the term data would only show a blank map.
   (An earlier version of this file said they appear nowhere. That was wrong.)

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
