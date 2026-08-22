# Elections ingest specification — LokDhaba / TCPD on the bulk-provenance path

Part 1 of Direction C (docs/FRONTIER_ASSESSMENT.md), produced under the
user's decision and its two binding conditions:

1. **Identity inherits the match-candidate discipline.** No person record is
   auto-created, no merge ever happens in a loader; linkage is exclusively a
   reviewed `entity_match_candidates` row.
2. **Dataset versions are the epistemic clock for these rows.** Everything a
   future as-of layer needs — which bytes, which version, retrieved when,
   ingested when, which upstream row — is recorded now (§1.5, §5.6).

This document is the whole of part 1. Nothing else changes in the repo this
turn. Part 2 executes this spec exactly as written, after the user drops the
files at the paths below and the stage-1 dry-run report comes back for a go.

**Epistemic status of this spec itself:** the container cannot reach
lokdhaba.ashoka.edu.in or GitHub content pages (network egress policy), so
every statement about TCPD's export columns is labelled *expected* — drawn
from TCPD-IED documentation as of my knowledge cutoff (January 2026) — and
stage 0 of part 2 verifies the real headers and **refuses on any drift**
rather than adapting silently. The repo counts cited for reconciliation
(178 elections, 320 result rows, hand-curated) are the user's production
figures; this container's database is seed fixtures, so the dry run reports
actuals rather than trusting either number.

---

## 1. Acquisition

### 1.1 Files wanted

Three drops, from two places:

| # | What | Where from | Expected form |
|---|------|-----------|---------------|
| D1 | **Vidhan Sabha (assembly) results, all states, all years** | lokdhaba.ashoka.edu.in → Browse Data → Assembly Elections → all states, all years → download CSV | One CSV, candidate-level, one row per candidate per constituency per election. Tens of MB. |
| D2 | **Lok Sabha (general) results, all years** | lokdhaba.ashoka.edu.in → Browse Data → General Elections → all states, all years → download CSV | One CSV, same shape. |
| D3 | **The 1951–1962 TCPD early-elections set** | The TCPD GitHub repository that LokDhaba's data/About page links for the pre-1962 assembly and 1951/1957 general elections | One or more CSVs. The fetcher records the exact repository URL **and commit hash** in the manifest, since I cannot resolve them from here. |

While fetching, also capture **the data-use / citation terms page as
displayed** (copy the text and its URL) — needed for §1.4.

If LokDhaba's export offers a choice of columns, take **all columns**. The
raw artifact is the archive's earliest preserved form of this data; narrowing
it at download time is a silent transformation made before we ever see it.

### 1.2 Where they land in the repo

```
data/raw/tcpd/
  MANIFEST.csv          ← COMMITTED. One row per file (see §1.5).
  TERMS.md              ← COMMITTED. Verbatim copy of the terms/citation page,
                          its URL, and the capture date.
  ae/<file as downloaded>.csv        ← git-ignored blob (D1)
  ge/<file as downloaded>.csv        ← git-ignored blob (D2)
  early/<files as downloaded>.csv    ← git-ignored blobs (D3)
```

Keep the downloaded filenames exactly as the site produced them (they often
carry the export date, which is evidence). The manifest, not the filename,
is what the loader trusts.

`.gitignore` gains `data/raw/**/*.csv` (part 2, stage 0). The two committed
files are small text.

### 1.3 Raw-artifact storage decision: git-ignored drop + committed checksums

**Decision: git-ignored blobs, with a committed manifest carrying SHA-256
checksums, byte sizes, URLs and dates. Not LFS. Not plain commits.**

Reasoning, option by option:

- **Plain git commits — rejected.** A standing instruction of this project
  ("Do NOT ask me to upload the entire CSV into the repository") forbids it;
  GitHub's 100MB file limit likely does too; and raw blobs in history are
  forever, bloating every future clone.
- **Git LFS — rejected for now.** It would solve durability, but it commits
  the CSVs in substance (against the same standing instruction), the free
  quota (~1GB storage/bandwidth) is a new operational dependency that fails
  builds when exhausted, and Vercel clones would pay the bandwidth on every
  deploy for files the build does not read.
- **Git-ignored drop + committed manifest — chosen.** The blobs live outside
  git; the *identity* of the blobs lives inside it. The loader reads a file
  only after its SHA-256 matches the manifest, and **refuses on mismatch** —
  so any container, any session, any future machine either has byte-exact
  the artifact this spec was executed against, or nothing runs.

Two consequences, stated rather than discovered later:

- **This container is ephemeral**: the blobs vanish when it does, and must be
  re-dropped in a future session. The manifest makes re-verification a
  one-second operation. The durable original is (a) the user's own retained
  copy — keep one outside this container — and (b) the upstream itself,
  re-fetchable to the recorded version.
- "Raw source is never destroyed" is honored as: the loader never modifies,
  moves, or re-writes anything under `data/raw/`; it opens read-only. The
  curated layer (`data/inbox/`) is never generated from these files by hand
  edits — this ingest bypasses the inbox entirely (§2).

When the archive later grows real object storage (an S3-class bucket for
document copies is already implied by `documents.archive_url`), these
artifacts move there with their checksums; the manifest format already
carries everything that migration needs.

### 1.4 Licence and citation, in the dataset registry design

TCPD/LokDhaba data is published for use **with required citation and no
implied endorsement**. The registry treats that as data, not as a footnote:

- The `datasets` rows (§5.3) carry `licence` = the terms' own name as
  captured in TERMS.md, `licence_url` = the terms page URL, and a `notes`
  line stating: *"Citation required; use implies no endorsement by TCPD or
  Ashoka University. Citation text in the linked source record."*
- **The citation renders wherever these rows surface**, using the existing
  citation vocabulary rather than a new one: one `sources` row is created
  per dataset (D1/D2/D3), and every ingested election is cited to it. Its
  `title` is the full required citation in TCPD's stated form — expected
  (verify against TERMS.md at fetch):

  > Agarwal, A., Agrawal, N., Bhogale, S., Hangal, S., Jensenius, F. R.,
  > Kumar, M., Narayan, C., Nissa, B. U., Trivedi, P., and Verniers, G.
  > "TCPD Indian Elections Data v2.0", Trivedi Centre for Political Data,
  > Ashoka University. (plus the LokDhaba URL and the dataset version)

  If TERMS.md's captured text specifies different wording, **TERMS.md wins**
  and the sources row is written from it.
- The methodology page gains a line naming TCPD as a source with the same
  citation (part 2, stage 2 — it ships with the first insert, not before).
- `ProvenanceNote` already renders dataset name, publisher, version and
  licence on records that carry `record_provenance`; no new rendering is
  invented.

### 1.5 MANIFEST.csv — the epistemic clock's first tick

One row per dropped file. Committed. Filled by the fetcher (the user), not
by the loader:

```csv
file,sha256,bytes,downloaded_on,source_url,source_version,notes
ae/<name>.csv,<hex>,<n>,2026-08-2X,https://lokdhaba.ashoka.edu.in/...,<version shown on site or "unversioned">,all states all years assembly export
ge/<name>.csv,...
early/<name>.csv,...,https://github.com/<org>/<repo>/commit/<hash>,<tag or commit>,1951-1962 set
```

`sha256sum <file>` produces the hash. Under binding condition 2, this is the
root of the epistemic clock: **version → bytes (sha256) → rows
(upstream_id) → ingest date**. A future as-of layer can say "this row, as of
dataset version V retrieved on D, ingested on I" with no reconstruction.

---

## 2. Schema mapping

This ingest runs on the **bulk path** (datasets + record_provenance +
PATH_STATEMENT), not through the inbox sheets and not through the review
queue. That is the declared design of Direction C: what replaces review is
provenance, and every row says so to the reader in the four-state marker's
own words. The loader is a new script (`scripts/load-tcpd.ts`, part 2)
following `load-funding-inbox.ts`'s conventions: dynamic db import, pure
validators, refuse-don't-repair, counters that only claim what `RETURNING`
proves.

### 2.1 Expected TCPD-IED columns (to be verified in stage 0)

Candidate-level, per TCPD-IED v2 documentation as of January 2026:

`State_Name, Assembly_No, Constituency_No, Constituency_Name,
Constituency_Type, Year, month, Poll_No, DelimID, Position, Candidate,
Sex, Party, Votes, Candidate_Type, Valid_Votes, Electors, N_Cand,
Turnout_Percentage, Vote_Share_Percentage, Deposit_Lost, Margin,
Margin_Percentage, ENOP, pid, Party_Type_TCPD, Party_ID, last_poll,
Contested, Last_Party, Last_Party_ID, Last_Constituency_Name,
Same_Constituency, Same_Party, No_Terms, Turncoat, Incumbent, Recontest`

Stage 0 prints the actual header, diffs it against this list, and **stops on
any missing expected column or any unexpected column**, reporting both. No
mapping proceeds on a drifted schema.

### 2.2 Target: `elections` (schema.ts:371)

One election row per **(State_Name, scope, Year, Assembly_No)** group of
candidate rows, `Poll_No = 1` only (see §2.6).

| Abhilekh column | From | Rule |
|---|---|---|
| `state_id` | `State_Name` | Via an explicit, committed `STATE_MAP` in the loader (TCPD's `Andhra_Pradesh` → `ap`, …, including `Jammu_&_Kashmir` → `jk`, `Delhi` → `dl`, `Puducherry` → `py`, `Telangana` → `tg`). **Unmapped names are refused and counted, never guessed** — see ambiguity A1. |
| `scope` | file of origin | D1/`early` assembly files → `state_assembly`; D2/`early` general files → `lok_sabha`. For `lok_sabha`, rows across states aggregate to **one** election (`state_id = 'in'`) — matching how the archive already models Lok Sabha elections. |
| `assembly_number` | `Assembly_No` | As given; integer. For Lok Sabha files this is the Lok Sabha number. |
| `election_date` | `Year` (+ `month` if present and non-empty) | **Ambiguity A2, the big one** — see §2.7. Anchored date + a new `election_date_precision` column; never rendered at more precision than recorded. |
| `total_seats` | count | `COUNT(DISTINCT Constituency_No)` within the group — a verifiable count of what the file contains, not an external claim. Where reconciliation (§4) finds this differs from a hand row's `total_seats`, that is a reported conflict, not an overwrite. |
| `turnout_percent` | — | **NULL on new rows this pass** (ambiguity A3). Never overwritten on existing rows. |
| `result_summary` | — | NULL. Prose is editorial; a bulk loader writes none. |

### 2.3 Target: `election_results` (schema.ts:394)

One row per **(election, Party)**, aggregated from candidate rows:

| Abhilekh column | From | Rule |
|---|---|---|
| `party_id` | `Party` | Matched against existing `parties` by exact normalized abbreviation, then exact normalized name. Unmatched parties are **created** on the bulk path with `name` = TCPD's label verbatim and a `record_provenance` row (parties are the one entity kind this loader may create — precedent: the funding loader creates orgs; and a result row cannot exist without its party). **Party labels are never unified**: `INC`, `INC(I)`, `INC(U)` stay three parties. Ambiguity A4. |
| `seats_won` | `Position` | `COUNT(*)` of rows with `Position = 1` in the group. |
| `seats_contested` | — | `COUNT(DISTINCT Constituency_No)` where the party fielded any candidate. |
| `vote_share_percent` | `Votes`, `Valid_Votes` | `100 × Σ(party Votes) / Σ(constituency Valid_Votes)`, where the denominator sums `Valid_Votes` **once per constituency** (it repeats on every candidate row). Rounded to 2dp, matching the column's scale. The per-candidate `Vote_Share_Percentage` column is deliberately not used: it is constituency-scoped and cannot aggregate honestly. The formula is stated in the dataset's `notes` and on the methodology line. |
| `alliance_name` | — | NULL. TCPD does not carry pre-poll alliances; inventing them is out. |

### 2.4 Deliberately NOT ingested this pass

Named so their absence is a decision, not an oversight:

- **Candidate-level rows** — names, sex, margins, deposit, incumbency,
  turncoat, ENOP, `pid`, dynasty/recontest fields. They stay in the raw
  artifacts, byte-preserved and checksummed, queryable the day a candidate
  layer exists (§3).
- **Constituencies** as entities; `Constituency_Type` (GEN/SC/ST);
  delimitation (`DelimID`).
- **Bye-elections** (`Poll_No > 1`) — counted and reported, not inserted;
  the elections table models general elections and a bye-poll is neither a
  new assembly nor a correction to one.
- **NOTA** — not a party; excluded from `election_results`, retained in the
  vote-share denominator (it is part of `Valid_Votes`), counted in the dry
  run.
- **Turnout** on new rows (A3), and every derived-analytics column TCPD
  computes (`Margin`, `ENOP`, …): the archive computes its own derivations
  or shows none.

### 2.5 New column required: `election_date_precision`

Additive migration (part 2, stage 2, via `ensure-upgrades`):

```sql
ALTER TABLE "elections" ADD COLUMN IF NOT EXISTS
  "election_date_precision" text NOT NULL DEFAULT 'day'
  CHECK (election_date_precision IN ('day','month','year'));
```

Existing rows keep `'day'` (their dates were hand-entered as real dates).
See A2 for why, and part 2 stage 2 for the render-side guarantee.

### 2.6 Grouping and dedup keys

- Candidate-row identity within a file: `(State_Name, Year, Poll_No,
  Constituency_No, Position, Candidate, Party)`. Exact duplicates are
  refused and counted (a file quirk to report, not repair).
- Election identity: `(state_id, scope, Year, Assembly_No)`. Two groups
  mapping to one identity is a stop-and-report anomaly.
- Upstream ids for `record_provenance` (natural keys, per the DATA_FORMAT
  rule that a natural key beats a line number):
  - election: `AE-<STATE>-<YEAR>[-A<Assembly_No>]` / `GE-<YEAR>[-L<No>]`
  - result row: `<election upstream id>-<Party verbatim>`

### 2.7 Every ambiguous field, with proposed handling

| # | Field | Ambiguity | Proposed handling (never silent) |
|---|---|---|---|
| A1 | `State_Name` | The 1951–1977 files name states that no longer exist and are **not in the states table** (Madras, Bombay, Mysore, Hyderabad, Madhya Bharat, PEPSU, Travancore–Cochin, Saurashtra, Vindhya Pradesh, Coorg, Ajmer, Bhopal, …). The map's geometry is pre-2019 but not pre-1956. | The loader refuses unmapped names and the dry run reports each with its row count. Whether to create historical state rows (they'd need `formed_on`/`dissolved_on` and would not appear on the map) is a **curatorial decision deferred to the dry-run gate** — the spec does not decide it, because it changes what "a state" means in the archive. |
| A2 | `Year`/`month` → `election_date NOT NULL` | TCPD records year (sometimes month); the column demands a date; the house rule forbids invented dates. Multi-phase elections have no single day anyway. | Anchor + precision: store `YYYY-01-01` with precision `'year'` (or `YYYY-MM-01` with `'month'` where month exists), and **route every render through a precision-aware formatter** so `'year'` rows display "1962", never "1 January 1962". Same construction as the series-break gate: the false precision becomes unrenderable, because the code path that would render it does not exist. Reconciliation never touches an existing row's real date. |
| A3 | Turnout | TCPD carries per-constituency `Turnout_Percentage` and `Electors`, not total votes polled; any election-level turnout is a derivation of a derivation (elector-weighted mean of percentages). | Not stored this pass. The dry-run/reconciliation report MAY show the elector-weighted figure **as a labelled derived comparison value with its formula**, for the human check (§4, WB 2026); the database stores nothing derived-of-derived. |
| A4 | `Party` labels | Party identity over time (splits, merges, renames: INC/INC(I)/INC(U), JD/JD(U)/JD(S)…) | Verbatim, distinct, never unified by the loader. Unification is identity resolution and belongs to review — the same discipline as persons, applied to parties. New-party creations are listed in the dry run before any insert. |
| A5 | `Party = 'IND'` | Independents are candidates, not a party; but their seats are real. | Aggregate under one loader-created party record named "Independents (IND)", flagged in its record that it is an aggregate of unaffiliated candidates, not an organisation. Alternative (exclude independents entirely) is rejected because it silently deletes seats from `seats_won` totals; the dry run reports IND seat counts so the choice is visible. |
| A6 | `Poll_No > 1` | Bye-elections share year+state with their general election. | Excluded, counted (§2.4). |
| A7 | `Valid_Votes`/`Electors` missing or zero in early files | Division by zero / meaningless shares. | Vote share NULL for that election's rows (never 0 — zero is a claim); anomaly counted per election in the dry run. |
| A8 | `month` present but 0/empty/garbled | — | Treat as absent → year precision. Counted. |
| A9 | Lok Sabha rows per state | The archive models one national LS election; TCPD rows are per state seat. | Aggregate nationally (`state_id='in'`). Per-state LS breakdowns are a later view over a later candidate layer, not a second election row — matching how `/union` models it today. |

---

## 3. Identity design

Binding condition 1, applied concretely:

**This pass, no human name enters any table.** Elections and party
aggregates contain no candidate names; the names live in the checksummed raw
artifacts only. Therefore no person can be auto-created, merged, or
mis-slugged by this ingest — the condition is satisfied by construction, not
by care.

**For the later candidate pass (out of scope here, bound now):**

- Candidate names enter **verbatim** into a `recorded_name` field on
  whatever table carries candidacies. The archive renders the string as
  recorded; spelling normalisation is forbidden at load time.
- Linkage to `people` happens **only** through `entity_match_candidates`
  (schema.ts:1277) with a written rationale, reviewed by a person —
  identical to the funding layer's rule ("two records that turn out to be
  one body stay two records, joined by a reviewed match"). No auto-create,
  no auto-merge, no threshold-based fuzzy joining. Ever.

**The exact-name person-page caveat at 100×.** Today, person pages are
derived by slugifying `terms.cm_name` (a text column, schema.ts:348;
`personSlug(t.cmName)`, insights.ts:86) — identity conflated with spelling.
At ~340 hand-entered CM names this is a documented, tolerable flaw: the
corpus is small and curated, so collisions are unlikely and spot-checkable.
Against a LokDhaba-scale name corpus it fails in both directions at once —
two politicians sharing "K. Reddy" would fuse into one page, and one
politician spelled two ways ("Karpoori Thakur"/"Karpuri Thakur") would split
into two. So, binding on part 2 and after:

- **LokDhaba-derived names must never feed the `personSlug` routes.** This
  pass guarantees it by ingesting no names; the candidate pass must
  introduce a real person entity (with the match-candidate discipline)
  before any TCPD name renders as a page.
- The dry run includes a **collision preview**: distinct candidate-name
  count, and the count of TCPD names whose slug collides with an existing
  `cm_name` slug — a measured statement of how much the caveat would cost,
  attached to the report rather than left as a warning in prose.

---

## 4. Reconciliation policy

The hand-curated rows (user's figures: **178 elections, 320 result rows**,
reviewed, cited) are the archive's spine. LokDhaba is a second, independent
recording of the same facts. The policy:

**Where they agree, provenance records both. Where they disagree, the
conflict is reported for human review — never auto-resolved. The conflict
list is a deliverable, not a decision.** This doubles as the independent
check on the hand rows themselves, explicitly including the West Bengal 2026
turnout figure.

### 4.1 Matching

An existing election matches a TCPD group on `(state_id, scope,
year(election_date))`, then `assembly_number` as a tiebreaker where both
sides carry it. Match cardinality problems (two hand rows, one TCPD group;
or the reverse) are conflicts, not choices.

### 4.2 Field comparison and outcomes

Compared per matched election: `election_date` (year component only — TCPD
cannot dispute a day), `assembly_number`, `total_seats`; per party:
`seats_won`, `seats_contested`, `vote_share_percent`. Party rows are matched
by party after applying the same matching used at load (A4), with unmatched
party names listed rather than force-matched.

| Outcome | Definition | Action |
|---|---|---|
| **AGREE** | Integers exact; percents within ±0.1pp (both values shown in the report regardless) | `record_provenance` row written for the existing election/result row → its path marker becomes **`both`** ("Loaded directly, then corrected by a person through review" reads correctly in reverse too — the wording for reviewed-then-corroborated is confirmed in part 2 against `PATH_STATEMENT`; if it reads wrongly for this direction, the statement is amended *once, in provenance.ts*, not per row). The hand row's values and citations are untouched. |
| **DISAGREE** | Any compared field outside tolerance | **No write of any kind to that row.** One conflict line in the report (format below). Resolution happens later through the ordinary review queue as a human decision; if the hand row is corrected, that correction is a revision like any other. |
| **HAND-ONLY** | Election exists by hand, absent from TCPD at this version (e.g. an election newer than the export — likely WB 2026) | Reported under "coverage boundary: not checkable against this dataset version". Explicitly not evidence against the hand row. |
| **TCPD-ONLY** | Election in TCPD with no hand row | Queued for insert in stage 2/3. Counted per state in the dry run. |

### 4.3 The report table (deliverable format)

Agreements and disagreements are presented together, one table, in the
dry-run report:

```
| state | scope | year | field            | hand value | hand citations | TCPD value | upstream_id | outcome  |
|-------|-------|------|------------------|------------|----------------|------------|-------------|----------|
| wb    | AE    | 2026 | turnout_percent  | <hand>     | S<n>,…         | <derived*> | AE-WB-2026  | <one of> |
```

- The **WB 2026 turnout row appears in the report whatever its outcome** —
  agree, disagree, or coverage-boundary — because it was named as a check.
  If compared, the TCPD side is the elector-weighted derived figure from A3,
  marked `*derived: Σ(Turnout×Electors)/Σ(Electors)` in the cell, and it is
  a comparison value only, stored nowhere.
- Sorted disagreements first, then coverage boundaries, then a per-state
  agreement summary (n fields agreed) so the table stays readable at 178
  elections.

---

## 5. Staged execution plan (part 2 — runs only after the drop and a go)

Every stage ends in a report; every next stage is gated on the user's go for
the previous report. No stage is combined with another.

### Stage 0 — verification (read-only)

1. `MANIFEST.csv` and `TERMS.md` exist; every listed file present; SHA-256
   matches for every file (refuse on any mismatch, name the file).
2. Header contract: actual columns vs §2.1, diff printed, **stop on drift**.
3. `.gitignore` entry for the blobs added; datasets + sources rows drafted
   (not inserted) from TERMS.md for the report.

### Stage 1 — dry run (read-only against the files, read-only against the DB)

One report, no writes:

- Row counts per state × year, AE and GE separately; distinct elections.
- Anomaly counts: unmapped states (A1, each with row count), new parties to
  be created (full list), NOTA totals, `Poll_No>1` counts, duplicate keys,
  missing/zero `Valid_Votes`/`Electors` (A7), month-precision distribution
  (A2/A8), IND seats per state (A5).
- The reconciliation table (§4.3), WB 2026 row included.
- The identity collision preview (§3).
- Proposed inserts: elections and result rows per state, parties to create.

**GATE: user reviews, rules on A1 (historical states) and the conflict
list's disposition, and gives the go.**

### Stage 2 — Vidhan Sabha insert

1. Additive migrations first: `election_date_precision` (§2.5); the
   **`recordPath` scale fix before the volume arrives** — the benchmarked
   failure (bench-provenance: `subject_id = ANY(string_to_array(…))`
   degrading to a filter that scanned 299,800 rows) is replaced with a
   `VALUES`-join form that uses the composite index; re-benchmarked before
   any insert.

   > **Amended 2026-08-21, on measurement.** The planned `VALUES`-join
   > rewrite was built, benchmarked head-to-head, and rejected: the
   > original degradation was a **stale-statistics artifact** — the
   > benchmark queried 300k freshly inserted rows before any `ANALYZE`,
   > a state autovacuum repairs on its own. With fresh statistics the
   > existing `= ANY(string_to_array(…))` form index-scans and is the
   > FASTER shape (p50 4.4ms vs 6.9ms for 500 ids at 600k rows); in the
   > stale window it also degrades less (55ms vs 155ms). The scale fix
   > stage 2 actually needs is: **the insert stages run
   > `ANALYZE record_provenance` after bulk insert**, and the benchmark
   > now does the same after seeding (so it measures steady state). Both
   > shapes sit far under the agreed 200ms-per-render trigger; the query
   > is unchanged.
2. Insert per state, in batches: elections → results → `record_provenance`
   for every row (upstream ids per §2.6) → citations to the dataset's
   source row. Idempotent: re-running skips existing `(dataset,
   upstream_id)` pairs.
3. Reconciliation provenance writes for AGREE rows (§4.2). Nothing else
   touches an existing row.
4. Post-insert report: inserted counts vs dry-run proposal (must match;
   discrepancies stop stage 3), spot-check renders of three state pages and
   one election page, **provenance-path benchmark re-run** — against the
   agreed trigger: *revisit only if it exceeds 200ms per render or an
   affected route stops being ISR* — and the **starved-panels before/after**
   as the success measure: turnout extremes' n, largest majorities' "of",
   closest elections' "of", party dominance's "of", compare-picker option
   count, browse counts.

**GATE.**

### Stage 3 — Lok Sabha insert

Same shape as stage 2 (no new migrations), national aggregation per A9,
same report including the same benchmark and panel counts.

**GATE: done, or rollback.**

### 5.5 Rollback

Every inserted row carries `record_provenance` naming these dataset slugs.
Revert = delete rows whose provenance references the dataset (children
first), plus the dataset/source rows — a clean, provable operation that
cannot touch any hand-curated row, because hand rows gained only
*provenance* entries (deletable the same way), never value changes.

### 5.6 What the epistemic clock holds when this is done

Per binding condition 2, for every ingested row: dataset **version** and
**retrieved_on** (datasets row) ← **sha256/bytes/URL/date** (manifest) ←
**upstream_id** (record_provenance) ← **ingested_on** (record_provenance).
Provenance rows are **append-only**: a future re-ingest at a newer TCPD
version appends new provenance under the new dataset version, never updates
the old — so when Direction A builds the as-of layer, "what did the archive
hold, from which TCPD version, as of date D" is a query, not an
archaeology.

---

## Stop

This document is the end of part 1. Next: the user fetches D1–D3 to the
paths in §1.2, fills `MANIFEST.csv` and `TERMS.md`, confirms — and part 2
begins at stage 0, with the stage-1 dry-run report coming back for a go
before any insert.
