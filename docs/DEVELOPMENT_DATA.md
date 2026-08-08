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

Raw, validated, normalized, visualized, with the original always recoverable:

1. **Raw**: the supplied GEM file lands untouched in `data/raw/gem/`,
   committed as received, checksummed in the transform script's header.
2. **Validated**: `scripts/one-off/extract-gem-energy.(py|ts)` reads the raw
   file, checks units, geography names, duplicate project rows, missing
   values, and status semantics (operating vs announced vs retired), and
   REFUSES ambiguous rows rather than guessing. Its findings are printed, not
   silently fixed.
3. **Normalized**: the script emits rows for the two inbox CSVs. Every
   transformation it performs (aggregation level, status filters, unit
   conversions) is stated in the emitted indicator's methodology text.
4. **Visualization**: the existing tables and charts, which already expose
   source, period, org and verification date per value.

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
