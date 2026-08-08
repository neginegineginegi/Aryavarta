# Design: the Development Data layer

Energy is the first dataset of a broader layer where readers explore political
change, elections, governments, policies and development indicators together
across time. This document is the audit and plan the brief requires before any
implementation. Implementation of the energy dataset itself is blocked on one
input: the Global Energy Monitor file has not been supplied yet, and the
brief's own first rule is that its schema must be inspected, never assumed.

## 1. Audit: what already exists

The generic model the brief asks for (Indicator, Geography, Time, Value, Unit,
Source, Methodology, Metadata) is already the production data model:

- `indicators` (id, name, unit, category, methodology, display_order) and
  `indicator_values` (indicator, state, year, value, source_title, source_url,
  reporting_period, reporting_org, notes, verified_on). National values ride
  the union pseudo-state `in`, the same convention as PM terms and Lok Sabha
  elections.
- Ingestion is the existing inbox pipeline: `data/inbox/indicators.csv` and
  `data/inbox/indicator_values.csv`, loaded idempotently on every build by
  `scripts/load-inbox.ts`. The RBI Handbook tables came in exactly this way,
  via a one-off extraction script (`scripts/one-off/extract-rbi-handbook-2025.py`)
  whose output was reviewed before loading.
- Presentation already exists and is category-driven: the Development Lens on
  every state page groups by `indicators.category`, `/indicator/[id]` shows
  the full series per state plus the national series and the methodology, and
  TrendChart is interactive with per-point source readouts.

Conclusion: energy needs NO parallel system and, for v1, NO schema change.
"Development, then Energy" is a new `category = 'Energy'` plus indicators
whose exact set is derived from the supplied file.

## 2. Provenance chain

Raw, validated, normalized, visualized, with the original always recoverable.
The raw file is 241 MB and stays OUTSIDE the repository and outside any
browser or model context; the repository holds only the transform script, a
manifest describing the raw file, and the small aggregated outputs.

### Stage 0: raw (operator's machine, never committed)

The GEM CSV lives wherever the operator keeps it. `data/raw/` is gitignored
except for `data/raw/gem/MANIFEST.md`, which records: exact filename, byte
size, SHA-256, GEM dataset name and release date, download URL, license, and
the date obtained. Recoverability means anyone can fetch the same release
from GEM and verify the checksum, not that the archive redistributes 241 MB.

### Stage 1: validation (streaming, no full load)

`scripts/one-off/gem-transform.mjs <path-to-raw.csv>` streams the file row by
row (plain Node, stdlib only, so it runs anywhere) and first PROVES the
schema: the header must match the sample-derived column list exactly, else it
stops. Then, per row, it checks and counts rather than fixes:

- geography fields present and mappable (country filter, state names against
  the archive's own normalizer);
- capacity numeric and in the expected unit;
- status within the sample's vocabulary;
- year fields parseable, in [1900, current year + 20];
- duplicate detection on the tracker's own unit or phase id;
- missing values tallied per column.

Output: `gem-validation-report.txt` with every count and every rejected row's
reason. Ambiguity is refused, never guessed.

### Stage 2: filtering (India only)

Rows are kept only where the sample's country field says India. Everything
else is dropped before any aggregation, which turns 241 MB of global data
into the small Indian subset the archive actually uses. The report states how
many rows survived.

### Stage 3: aggregation (project rows to indicator series)

Unit-level project rows become state-year-technology series. The exact
derivations wait for the sample's status and year semantics, but the two
target series and their candidate formulas, each to be printed verbatim into
the indicator's methodology text:

- **Installed capacity (MW), by technology, by state, by year Y**: sum of
  capacity over units whose commissioning year <= Y and whose retirement
  year (if any) > Y, restricted to statuses the sample defines as having
  operated. Cumulative, so one number per state-technology-year.
- **Capacity additions (MW)**: sum of capacity over units commissioned in
  exactly year Y. First difference only if the sample lacks a direct
  commissioning year; then labeled "derived".

National series = the same formulas over all Indian rows, stored on the
union pseudo-state `in` like every other national record. Announced,
construction and cancelled statuses are EXCLUDED from both historical series;
whether to publish them as a separate present-day pipeline indicator is an
owner decision, off by default.

### Stage 4: optimized dataset (the existing model, no schema change)

The script emits rows for the two existing inbox sheets:

- `indicators.csv`: one row per technology per measure plus totals, category
  `Energy`, unit `MW`, methodology embedding the formula, the GEM citation,
  the release date and the license line.
- `indicator_values.csv`: one row per state-year-indicator with the GEM
  dataset as source_title/source_url and the release as reporting_period.

Size arithmetic, worst case: ~37 geographies x ~9 technologies x ~2 measures
x ~80 years is under 55,000 rows, and real coverage will be far sparser. The
existing `indicator_values` table already holds series of this shape; the
loader's existing dedupe makes reruns idempotent.

### Stage 5: browser payload (minimum for the view)

The browser never sees the dataset, only the slice a page needs, through the
existing per-page server queries:

- state page Development Lens: that state's Energy series only;
- `/indicator/[id]`: one indicator across states, as today;
- `/development/energy`: national series by default (~9 technologies x ~80
  years, a few kilobytes) plus a latest-year state table; per-state series
  load only on that state's own pages;
- period comparison: computed server-side from the same rows; the browser
  receives the computed figures, not the series twice.

### Two ways to run it

1. Operator runs the script locally against the 241 MB file and reviews the
   emitted CSVs plus the validation report before committing them.
2. Or the script's `--extract-india` mode writes just the raw Indian rows
   (expected a few MB), which can be shared into a sandbox for the
   aggregation to run there. Either path produces identical outputs.

## 3. What is genuinely new (and reusable beyond energy)

- **`/development/[category]` page**: one page template, not an energy page.
  Header, the category's indicators for India and by state, TrendCharts,
  and the political-context band. Energy is its first instance; Health or
  Education would be a URL, not a build.
- **Period comparison, as a library plus one component**: pure functions
  (start value, end value, absolute change, percent change, CAGR, average
  annual addition, mix shares) with the formula named next to every figure.
  Arbitrary ranges, URL-encoded (`?p1=1999-2004&p2=2004-2009`) so every
  comparison is shareable. No default anchored to any political year: presets
  are derived from the archive itself (decade boundaries, general-election
  years as a set), and 2014 is reachable exactly as easily as 1991 or 1977.
- **Political context band**: for the selected range, the governments in
  office (existing map/union queries), elections held (existing records) and
  published events, as links. Copy rule enforced throughout: "installed
  capacity increased by X during this period", never "government Y raised
  capacity by X". Context, not attribution.
- **Timeline sync**: the category page reads the site-wide `?y=` convention;
  scrubbing updates the numbers in view and the government shown beside them.

## 3a. The ten-point inspection, pending the sample

The full file must not enter the repository or a model context, and the
schema must not be assumed, so the inspection runs on a sample the owner
supplies: the header row plus the first 50 to 100 data rows (a few KB), or
GEM's own data dictionary for the release. Per point, what the inspection
will pin down and the validator will then enforce:

1. Columns: the exact header list, asserted verbatim at stage 1.
2. Types: numeric vs text vs year per column, from the sample rows.
3. Geography: country column for the India filter; state or subnational
   column for attribution; whether coordinates exist as a fallback check.
4. Dates: commissioning year, retirement year, and their precision.
5. Technology: the fuel or type vocabulary, mapped one-to-one onto indicator
   slugs with no invented categories.
6. Capacity: which column, which unit, and whether unit rows or plant rows
   carry it (double-counting risk).
7. Status: the exact vocabulary and which statuses count as ever-operated.
8. Duplicates: the tracker's own id column for dedupe.
9. Missing values: how absence is written (empty, NA, dashes).
10. Provenance: per-row source or wiki URL columns, and whether to carry
    them into value notes.

## 4. Decisions that wait for the file

- The indicator set (total capacity, additions, per-technology series) and
  whether "additions by year" is present in the data or must be derived as a
  first difference, which would then be labeled as derived.
- Whether values are capacity, generation, or project counts, and at what
  status. Nothing is published until this is answered from the file itself.
- State attribution (plant location) and whether sub-state geography exists.
- Licensing: GEM publishes under CC BY 4.0; the citation line and any
  redistribution note follow what the supplied file's own terms say.

## 5. Schema note

v1 requires no schema change. One addition is worth considering later: a
first-class `datasets` table for dataset-level provenance (publisher, update
cadence, coverage, original file reference) instead of carrying it in each
indicator's methodology text. That is an explicit schema decision for the
owner, not something this work smuggles in.

## 6. Risks

- **Semantics**: trackers are project-level; a naive sum double-counts units
  within plants or mixes announced with operating capacity. The validator
  must resolve this from the file's own columns before anything is emitted.
- **Geography**: plant-to-state mapping must use the file's state field, with
  the loader's existing name normalization; unmatched names are reported and
  skipped, never guessed.
- **Verification**: this sandbox cannot reach external URLs, so source links
  in the emitted CSVs are verified by the moderator at review, as with every
  other import.
