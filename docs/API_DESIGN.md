# Abhilekh public API and Open Data design

Status: **DESIGN ONLY — stopped at the go gate.** Decision 1 of 2026-08-28
(recorded in `docs/GAPS.md`) approved designing first and building nothing
until an explicit go. No endpoint in this document exists yet. Two gates
bind the rollout regardless of the go: **no URL appears in docs, the
landing, or the README until the canonical domain decision lands**, and
**the two held landing bands (API, Open Data) mount only when the endpoints
and /data are real and the domain is set.**

## 1. What this is for, honestly

Abhilekh's records are citations-first; the API exists so that anyone —
journalists, researchers, students — can take the archive's rows away with
their evidence attached, not so the site can call itself a platform. It
launches thin: four read-only resource families over data the archive
actually holds today, and it says which parts are thin rather than padding
them. There are no write endpoints; contribution happens through the site's
review flow, which is the whole point of the review flow.

## 2. Principles carried over from the archive

- **Every row travels with its evidence.** Each API row carries its
  citations (source, page/clause note, URL), its four-state path marker
  (`bulk` / `reviewed` / `both` / `unrecorded` — derived exactly as the site
  derives it: a `record_provenance` row is the bulk marker, an approved
  revision is the review marker, both is both, neither is `unrecorded`),
  its dataset attribution when bulk-ingested (publisher, version, licence,
  upstream URL, the row's own `upstream_id`), and — for funding-layer rows —
  the recorded `evidence_status`. A consumer who drops the evidence block
  drops it knowingly; the API never pre-drops it.
- **`election_date_precision` always beside the date.** Anywhere a date can
  be an anchor rather than a fact (`day` / `month` / `year`), the precision
  field is in the same object, non-optional. Rendering `1957-01-01` as
  January 1st is the consumer's error only if we shipped the precision; so
  we always ship the precision.
- **A refusal is worded, never an empty result.** Rate limits, invalid
  parameters, unknown ids, and out-of-coverage queries return a JSON body
  with `error.message` in plain words and, where applicable, what to do
  (`retry_after_seconds`, the list of valid values, the coverage statement).
  A valid query with genuinely zero rows returns `data: []` **plus** a
  `coverage` note saying what the archive holds for that slice, so an empty
  array is distinguishable from a hole.
- **Attribution travels with data.** Every response envelope carries
  `licence` and `attribution` blocks (see §7). TCPD-derived rows carry the
  TCPD citation strings from `data/raw/tcpd/TERMS.md` row-level, not
  footer-level.

## 3. Resources (v1, read-only)

All under `/api/v1/`. JSON only. IDs are the archive's own stable ids.

### `/api/v1/offices`
Officeholder terms (`terms` table): CM, Governor, PM, President, spells of
President's rule. Filters: `state`, `kind`, `party`, `active_on=<date>`,
cursor pagination. Row: state, kind, holder name (null for President's
rule, stated why), party, start/end dates, notes, evidence block.

### `/api/v1/elections`
Elections with per-party results (`elections` + `election_results`).
Filters: `state`, `scope` (`state_assembly` / `lok_sabha`), `from`/`to`
year, cursor pagination. Row: state, scope, assembly number,
`election_date` **with** `election_date_precision`, total seats, turnout
(null where the archive refuses to fake it — see the D3 turnout ruling),
and the party results array (party id/name/abbreviation, seats won,
seats contested, vote share, alliance label), evidence block.

### `/api/v1/events`
Published political events (`events`, `status = published`,
`deleted_at IS NULL` — exactly the site's own visibility rule). Filters:
`state`, `type`, `year`, `from`/`to`, cursor pagination. Row: state, year,
event date (nullable; when null the year is the precision statement),
type, title, description, evidence block.

### `/api/v1/timeline`
The composed view a reader sees on a state page: terms, elections, and
events for one state interleaved in date order. Parameters: `state`
(required), `from`/`to`. This is a convenience projection of the other
three — same query modules, no fourth data path.

### Discovery
`/api/v1/` returns the resource list, the version, the licence block, and
the coverage summary (states, year ranges per resource, row counts) so a
consumer can see the thinness before writing a single query.

## 4. Versioning

Path-versioned (`/api/v1/`). v1 promises: fields are added, never renamed
or removed; enum values are added, never repurposed; a breaking change is a
`/api/v2/`. The version and a `generated_at` timestamp ride in every
envelope. Deprecations, if ever, are announced in the envelope months ahead
via a `notices` array — the API can speak to its consumers because every
response already has a place for words.

## 5. Rate limiting

The existing `rate_limits` machinery (`src/lib/rate-limit.ts`) gains one
surface: `api` — Postgres fixed-window counters, keyed by IP (no accounts
on the API), fail-open with a logged error, same UNLOGGED-table economics.
Proposed windows: 60 calls/min and 3,000/day per IP; the bulk artifact
exists precisely so nobody needs to crawl the API. A 429 is a worded
refusal with `retry_after_seconds` and a pointer to `/data`.

## 6. Caching

Route handlers are static-friendly: `revalidate = 3600` (the landing's ISR
interval; archive data changes on approval or ingest, not per second), plus
`Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` and an
`ETag` per response. The envelope's `generated_at` says how stale a cached
body is. Nothing here needs per-request freshness, and saying so in headers
is what keeps the API cheap enough to keep public.

## 7. Licensing and attribution — with one OPEN decision

The archive's own prose and curated rows publish under **CC BY-SA 4.0**.
Every envelope carries:

```json
"licence": { "name": "CC BY-SA 4.0", "url": "…", "exceptions": ["see per-row dataset blocks"] },
"attribution": { "archive": "Abhilekh (अभिलेखः)", "datasets": [ …publishers whose rows appear in this response… ] }
```

**OPEN — must be decided before /data or any TCPD-backed endpoint ships:**
TCPD's terms are **non-commercial use only, citation required**. That does
not compose with CC BY-SA (which permits commercial reuse). The options,
stated once so the decision is a choice and not a discovery:

- **(a) Exclude TCPD-derived rows from the CC BY-SA bulk export**, shipping
  them as a separate artifact under TCPD's own terms with the required
  citations, clearly labelled; the API serves them with a row-level
  `licence_exception` field.
- **(b) Carry TCPD's terms beside the data everywhere** (bulk and API), and
  demote the export's headline licence to "CC BY-SA except where a row
  states otherwise".

Recommendation: **(a)** — a bulk file whose licence needs a footnote per
row is a trap for downstream reusers; two honestly-labelled artifacts are
simpler than one ambiguous one. Until decided, nothing TCPD-derived ships
in any export. (Today nothing TCPD-derived is inserted at all, so the
decision has a clear deadline: before stage 2's rows ever reach /data.)

## 8. /data and the bulk artifact — one export pipeline, not two

A `/data` page lists downloadable artifacts: one zip per release containing
CSVs (offices, elections, election_results, events, citations,
record_provenance, datasets), a `LICENCE.md`, a `CITATIONS.md` (every
dataset's required citation, TCPD's verbatim when applicable per §7), and a
`MANIFEST.json` (row counts, generation date, archive version, sha256 per
file). It is generated by `scripts/export.ts`, which imports **the same
query modules the API route handlers use** — one export pipeline, not two;
a divergence between the API's answer and the bulk file's would be a bug by
construction, not a reconciliation project. The artifact regenerates on
release, not on a schedule, and each release's manifest makes the file
citable ("Abhilekh export 2026-09, sha256 …").

## 9. What launches, thinly

v1 launches with exactly what the archive holds: ~258 elections (more when
the TCPD gates clear), ~341 terms, the published events, and their
citations. The discovery endpoint's coverage summary states this. No
synthetic completeness, no placeholder rows, no "coming soon" fields —
consumers get the same honesty readers do.

## 10. Build order (after the go)

1. Envelope/evidence-block builders as pure functions over the existing
   query modules, tested.
2. `offices` + `elections` routes; rate-limit surface; caching headers.
3. `events` + `timeline`; discovery endpoint with coverage summary.
4. `scripts/export.ts` + `/data` page (blocked additionally by §7's
   decision for any TCPD content).
5. Landing bands mount last, behind both gates (endpoints real, domain
   set).
