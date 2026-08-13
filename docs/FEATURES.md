# What Abhilekh does today

Everything built and deployed, grouped by what it is for. 113 commits, 59 pages,
34 routes, 71 unit tests. Live at https://abhilekh-orpin.vercel.app.

This is the inventory, not the roadmap. Open questions live in `PROGRESS.md`
section 4; the funding layer's design lives in
`docs/FUNDING_INFLUENCE_ARCHITECTURE.md`.

---

## 1. The record itself

**What is in the database.** States and union territories with formation and
dissolution dates, so the map knows a state did not exist before it was formed.
Chief Ministers, Governors, Prime Ministers and Presidents as dated terms.
Assembly and Lok Sabha elections with per-party results, seats contested,
vote share and alliance names. Events, taxonomised into seventeen types.
Manifesto promises with status claims. Documents. 51 development indicators
carrying 5,034 values.

**Sources are first-class.** Every term, election, event, indicator value,
document and promise carries citations. A source records its publisher, its
publication date, whether it is official, whether it is the primary artefact or
reporting about one, and what kind of document it is. The archive classifies
sources; it never scores their reliability. Citations carry a page or clause
note, because a bare link to a 400-page CAG report is not a citation.

## 2. The map

- India by state, coloured by the party in office, with a year scrubber.
- **Time Machine**: press play and the map replays the years, with markers on
  the scrubber for years that carry events, a tooltip trail, and inertia.
- States mode and Union mode toggle in place rather than navigating away.
- Clicking a state lands on that state's page with the scrubbed year in focus.
- Marker dots sit on the slider thumb's real travel, not a flat percentage.
- Lakshadweep gets a marker, since its geometry is too small to click.

## 3. Pages you can browse

| Route | What it holds |
| --- | --- |
| `/` | Map, year scrubber, a computed fact line, recent audit log, FAQ |
| `/state/[id]` | A state's leaders, elections, events, Development Lens, timeline band |
| `/state/[id]/[year]` | That state in one year |
| `/state/[id]/history` | Every revision to that state's record |
| `/union` and `/union/[year]` | The Union record: PMs, Presidents, Lok Sabha |
| `/election/[id]` | Seat bars, party table, turnout, auto-written overview |
| `/event/[id]` | One event with its sources, history and report link |
| `/party/[id]` | A party's record across states, with its canonical colour |
| `/person/[slug]` | Every office a person has held |
| `/promise/[id]` | A manifesto promise and its status claims |
| `/indicator/[id]` | One indicator as a trend chart across states |
| `/archive` | The media/document archive |
| `/browse` | Browse by state, party, person, election, indicator |
| `/compare` | Any two elections, leaders, parties or states side by side |
| `/search` | Full-text search and question answering |
| `/insights` | Computed observations from the record |
| `/about`, `/methodology` | What this is, and how it is built |

## 4. Contribution and moderation

- **Anyone can propose**, signed in with Google. Forms for terms, elections,
  events and promises, each requiring at least one source.
- **Every change is a revision**, never a direct write. A revision carries the
  full before and after state, an edit summary, and who proposed it.
- **Moderation queue** with a field-by-field diff, conflict detection that does
  not fire on mere key reordering, quick-approve, and bulk approval for imports.
- Moderators can **strengthen a draft's sources** before approving it.
- **Revision history** on every entity, and a permalink for each revision.
- **Reports and disputes**: anyone can flag a record; a dispute drives a visible
  banner on the entity. Threaded comments, resolution notes.
- Roles: contributor, moderator, admin. Admin bootstrap by email.

## 5. Data pipeline

- **CSV inbox** (`data/inbox/`) with sheets for sources, terms, elections,
  results, events, indicators, indicator values, documents, party colours and
  term updates. `scripts/load-inbox.ts` runs on every build, files each row as a
  pending draft, and prints a skip list with a reason per rejected row.
- **Idempotent schema upgrades** apply themselves before every build, so schema
  changes ship with the code that needs them.
- **Wikidata import**, superseded by CSV data in covered states.
- **Party colours** as a standing sheet, applied at import time, spectrum
  separated so no two parties on one map read alike.
- **Development Lens**: 51 indicators across eight layers. The Energy band holds
  six generating technologies as multi-year commissioning series (coal 254,318 MW
  from 1965, solar 92,754 MW from 2011, hydro 51,082 MW from 1922, gas and oil
  27,363 MW from 1989, wind 27,055 MW from 1990, nuclear 8,240 MW from 1981),
  built from Global Energy Monitor trackers with per-file coverage stated in the
  generated methodology.

## 6. Analysis

- **Insights engine**: computed observations from the record, surfaced on the
  insights page and as did-you-know lines on record pages.
- **Question answering** in search: typed questions resolved against the data.
- **Compare mode**: elections, leaders, parties, states, with morphing seat bars
  that glide between selections.
- **Trend charts** that answer on hover, tap and keyboard.
- **Development Lens** rendered as one ruled statistical table, the same plate
  style used by every chart surface.

## 7. How it looks and moves

- Editorial palette, card system, three-voice type system, Devanagari wordmark.
- **Motion system**: one tempo for the whole archive, defined in tokens.
- **Cursor field**: a magnetic drift on the wordmark and a glow on panels. It
  does not touch running text. It used to: every line was split into
  per-character spans that lifted, thickened and rode a scroll wave. Words you
  are reading have to hold still, so the character half was removed outright
  rather than tuned down.
- **Living background**: the tricolour bands are canvases that answer scroll,
  pointer and taps.
- Nav dropdowns, segmented controls, loading, empty and error states.
- Reduced motion is honoured throughout: no drift, no glow, no ribbon
  animation.

## 8. Operations

- Auto-deploy from `main` to Vercel, functions pinned to Singapore.
- 71 unit tests, repo lint at zero errors.
- `PROGRESS.md` as a durable session handoff, `docs/` for architecture,
  data format, development data provenance and research prompts.
- Raw third-party data stays out of the repository; `data/raw/gem/MANIFEST.md`
  records filename, size, SHA-256, release, licence and a verdict for every file
  received.

---

## In progress

**India Funding and Influence Map.** Design complete, schema landed, interface
not yet built. See `docs/FUNDING_INFLUENCE_ARCHITECTURE.md`.
