# Frontier assessment

An audit of the Abhilekh repository against `docs/FRONTIER.md`, produced as
directed by that charter's section 28. Assessment only: no code, no
migrations, no schema changes accompany this document. Section 26 of the
charter is out of scope per its packaging note and appears nowhere below.

**How this was audited.** Against the working tree at the current dev-branch
head (descends from the deployed `3617fa2`): the full schema
(`src/lib/db/schema.ts`, 1,777 lines), the Drizzle migrations plus the
`ensure-upgrades` statement list, every server action, the `src/lib` tree,
and all thirteen documents in `docs/`. File and line citations are given for
every BUILT claim. Line numbers refer to this tree.

**What could not be verified from this container, stated rather than
assumed.** (1) Production data: this sandbox database is seed fixtures
("A. Sample Kumar", 334 terms starting 15 March); the maintainer attests
production holds real reviewed terms, events and elections. Every judgment
below about *data* therefore describes the schema's capability, not verified
production contents. (2) Vercel configuration (env vars, which
`ensure-upgrades` statements have run in production). (3) The live domain's
behavior. Where a conclusion depends on one of these, it says so.

---

## 1. Concept map

Verdicts: **BUILT** (the concept is expressible and expressed today),
**PARTIAL** (real machinery exists; a named part is missing), **ABSENT**
(nothing in the repo expresses it). The charter was written partly without
sight of the repo; several things it treats as aspirations are built, and
they are called out as such.

| § | Concept | Verdict | Evidence |
|---|---------|---------|----------|
| 3 | Epistemic state | **PARTIAL (strong)** | Six-state evidence vocabulary with reader-facing meanings: `evidence_status` enum (schema.ts:1027) rendered through `EVIDENCE_MEANING` (funding/labels.ts:121). Claims carry their own status with database-enforced honesty: `alleged` requires a named asserter, `inferred` requires a rationale — CHECK constraints, schema.ts:1642–1650. Append-only `verifications` (schema.ts:1677; "a 'contradicted' verification does not delete the row it concerns"). The four-state path marker `bulk/reviewed/both/unrecorded` with all four states *stated* to the reader (`recordPath` ingest/provenance.ts:158, `PATH_STATEMENT` :185). Missing: the Atlas tables (`terms`, `elections`, `events`) carry **no epistemic state at all** — a term is flatly true; and "not yet researched" vs "no qualifying record found" is prose discipline, not data (see §4, §19). |
| 4 | Absence as data | **PARTIAL** | `open_questions` is a first-class table (schema.ts:1694) — "a question, the entity it concerns, why it matters, and what would answer it" (FUNDING_INFLUENCE_ARCHITECTURE.md §13). Every entity page renders a NotHeldSection built by reading counts out, never by asserting absence in prose (network/RecordParts.tsx). The declining structure panel refuses findings the data cannot support (`MIN_CYCLES_FOR_STRUCTURE`, funding/analysis.ts:229; StructurePanel.tsx). Undated entries render as their own group, never sorted as oldest (funding/sequence.ts:10–21). Missing: absence is **computed at render, never recorded** — there is no way to store "ECI archive searched on date D for X; nothing qualifying found", so a gap cannot be distinguished from a not-yet-looked. |
| 5 | Disagreement first-class | **PARTIAL (strong)** | Claims are objects, not text: `claims` (schema.ts:1613) with subject/object entity refs, asserter (entity ref or free name), assertion date, period, status; `claim_responses` for rebuttals (schema.ts:1654, "a table is how they stop being optional in practice"). `disputed` is a first-class status; public `reports`/disputes exist (schema.ts:802); identity disagreement is a record, not a merge (`entity_match_candidates`, schema.ts:1277). The interpretive/factual split is enforced in rendering: claims are drawn dashed and phrased "is said to have…" (funding/labels.ts CLAIM_KIND_LABELS). Missing: two claims disagreeing about **the same fact-slot** (a term's start date, an org's founding year) have no way to say so — nothing links a claim to the field it contests, and there is no conflict status or conflict view (§18). |
| 6 | Temporal identity | **PARTIAL (weak)** | `entity_aliases` (schema.ts:1260); `successor_of` and `parent_of` relation kinds (schema.ts:1072) on `relationships` rows that carry validity dates (`start_on`/`end_on`, schema.ts:1554 block); orgs have `incorporated_on`/`dissolved_on`/`parent_org_id` (schema.ts:1211–1224); states have `formed_on`/`dissolved_on` (schema.ts:265). Identity-vs-spelling discipline exists (`entity_match_candidates`: "two records that turn out to be one body stay two records, joined by a reviewed match"). Missing: no name-validity periods (an alias has no *when*), no lineage traversal, and — the sharpest gap — **the Atlas has no person entity**: `terms.cm_name` is a text column (schema.ts:348) and person pages are derived by slugifying the string (`personSlug(t.cmName)`, insights.ts:86). A person who is CM of two states, or whose name is spelled two ways, is one identity conflated with its spellings. |
| 7 | Institutional memory | **ABSENT** (beyond the raw edge kinds) | `successor_of`/`parent_of` edges can *record* one hop; nothing reconstructs a lineage (A → reorganised → B → renamed → C), nothing renders one, and offices/institutions (as opposed to orgs) have no succession model at all. |
| 8 | Event as first-class object | **PARTIAL** | `events` exists with `event_date`, type enum, published/disputed statuses, citations (schema.ts:413; citations: eventSources schema.ts:695). But an event is a **state-year annotation** (title + description + state_id), not a connective object: no entity↔event participation links, no event↔claim links, no related-event structure. The funding layer's dated edges and the sequence view ("ORDER IS RECORDED. CONSEQUENCE IS NOT", funding/sequence.ts:10) already honor the sequence-without-causation rule the charter demands. |
| 9 | Temporal reconstruction | **PARTIAL** | Historical-time replay is real: the map year scrubber with replay (map/YearScrubber.tsx), per-year state pages, the network year window whose rule "an edge with no dates survives every year" is enforced in SQL (funding/graph.ts:47–48), sequence views. **Epistemic-time replay is absent** — but its raw material exists: `revisions` stores complete before/after snapshots with actor and timestamps (schema.ts:761: `before_data` "canonical live snapshot", `after_data`, `created_at`, `reviewed_at`). No as-of read path exists over it. |
| 10 | The two core verbs | **PARTIAL** (as organisation, not yet as abstraction) | "How is it connected" has a real home (/network, /network/connect). "What changed" is scattered across Compare (elections/leaders/states), history pages, and insights — no unified two-period question. |
| 11 | "What changed?" engine | **PARTIAL (weak)** | Compare mode diffs two elections/leaders/states (compare/ComparePicker.tsx, SeatDeltaTable); insights computes deltas with method lines. Nothing takes an entity + two periods and reports documented change across political/institutional/development/network layers together. The vocabulary the charter demands (change ≠ sequence ≠ association ≠ correlation ≠ documented causal claim) is *already the archive's house discipline* (sequence.ts:10; insights method lines; "contextualisation, not causal attribution"). |
| 12 | "How connected?" engine | **BUILT** (to its current data's depth) | Evidence-aware pathfinder: paths resolve per-edge evidence and surface **the weakest link first** ("a path is only as good as its worst-evidenced step", actions/network-connect.ts:18–21); edge panels show citations, dates, provenance; edges carry validity periods and the year window respects them (graph.ts:46–48); interpretive edges excluded unless asked ("a path that runs through an assertion is not a documented path"); no influence score, by written architecture (FUNDING §14) and by the graph refusing structural findings below density (analysis.ts:229). Missing only: per-edge record-path (bulk/reviewed) in the evidence panel. |
| 13 | Source intelligence | **PARTIAL** | `sources` is a table with publisher, published/accessed dates, an archived copy where redistribution allows (`archive_url`, schema.ts:472? — see documents; sources: schema.ts:549 block), and a `kind` enum ranked by `sourceRank` with `VERIFIED_MAX_RANK` gating what may ever be marked verified (funding/source-rank.ts:59–71). Citations are polymorphic across 10+ record kinds (schema.ts:651). Missing: sources have no coverage period, no versions, no derivation links, and no page of their own — you cannot yet ask "what does the archive know *because of* this source". |
| 14 | Dataset registry | **BUILT** (core), PARTIAL (edges) | `datasets` (schema.ts:585): slug, name, publisher, **version (required; "unversioned" is an honest value)**, licence + URL, retrieved-on, upstream URL, curator, notes. Per-row lineage: `record_provenance` (schema.ts:619) with `upstream_id`, under the validated both-or-neither rule (`parseRowProvenance`, ingest/provenance.ts:121: "a row that names its dataset must say which line of it it came from"). Rendered on records via ProvenanceNote. Missing fields the charter lists: checksum, raw-artifact reference, schema/transformation description, coverage period, records-affected rollup (derivable by count). |
| 15 | Ingestion as a system | **PARTIAL (strong)** | The bulk path is the charter's pipeline in miniature: curated inbox sheets (committed, diffable) → pure validators that **refuse rather than repair** (ingest/provenance.ts:10–14) → idempotent loaders that run on every build → `record_provenance` → PATH_STATEMENT at render. Counters only claim what `RETURNING` proves. But: upstream raw artifacts (the GEM xlsx files) are not stored — the curated extract is the earliest preserved form; and **two older routes predate the bulk path entirely**: the Wikidata admin import writes pending revisions `origin='import'` (lib/import/drafts.ts:147–153), and `load-inbox.ts` routes contribution sheets through revisions. Three ingestion regimes, one of them provenance-bearing. |
| 16 | Research mode | **PARTIAL (weak)** | Reproducibility-by-URL exists where it matters most: network view state lives in the URL under a **closed whitelist** with a test asserting the field list, so researcher reasoning cannot leak into shareable state (funding/view-state.ts:16–23); investigation notes/pins/flags stay browser-local *by argued design* (funding/investigation.ts). `ask.ts` answers are deterministic and link to records. Missing: saved investigations, citation/structured export, dataset-scoped filtering, a reproducible query object. |
| 17 | Trace | **PARTIAL** | Per record, the chain is walkable today: citations with source ranks → ProvenanceNote naming the dataset and upstream row → PATH_STATEMENT saying whether a person reviewed it → full revision diffs (/revision/[id], history pages). What's missing is the unified surface: for a *number* on a chart, nothing walks dataset → upstream row → database record → displayed statistic in one view (the pieces all exist; indicator values even carry per-point `source_title`, `reporting_period`, `verified_on`, schema.ts:310). |
| 18 | Conflict view | **ABSENT** (as a view; ingredients BUILT) | The archive can *hold* disagreement (§5) but cannot *list* it: no query or page answers "where does the archive disagree with itself". Match candidates, disputed statuses, claims and reports are four unjoined pools of conflict. |
| 19 | Negative knowledge | **PARTIAL (strong as discipline, absent as data)** | The distinction is enforced in prose and structure everywhere: NotHeldSection ("A gap in the record is a gap in the record; it is not evidence of anything"), FUNDING §13's rule (display absence as absence, never as implication), sequence's undated group, the entity picker where a rate-limit refusal **outranks** the "nothing recorded" line so a refusal can never read as an absence (EntityPicker.tsx; rate-limit-shared.ts:18 typed refusals exist precisely because "an empty result in this app is a STATEMENT"). But there is no *record* of a search that found nothing — negative knowledge cannot yet be cited, dated, or superseded. |
| 20 | Not a generic chatbot | **BUILT** (within scope) | `ask.ts` is deterministic pattern-QA with **no language model at runtime**: "every answer is reproducible and every line links to the records behind it" (ask.ts:12–15); unanswerable questions say so. Narrow by design; the charter's ANSWER→DERIVATION→RECORDS→EVIDENCE→CAVEATS pipeline is honored for the patterns it covers. |
| 21 | Epistemic self-memory | **PARTIAL (raw material only)** | For every revision-path record, the archive already remembers what it believed and when: full JSONB before/after snapshots, proposer, reviewer, both timestamps (schema.ts:761–786). Bulk-path records remember when they arrived (`ingested_on`). What's absent: any way to *ask* — no as-of query, no belief-diff, and approved revisions mutate the live row in place so current tables are current-state-only. "What did Abhilekh believe six months ago" is answerable in principle from data already kept, and unanswerable in practice by any code that exists. |
| 22 | Historiographic version control | **PARTIAL** | The revisions ledger preserves full wording states, so interpretation evolution ("funded" → "provided a grant" → "Source X documents a grant in year Y") is *captured* whenever it happens through review. Nothing distinguishes interpretation-refinement from value-correction, and nothing surfaces the evolution as a reading. |
| 23 | Epistemic vs historical time | **PARTIAL** | All four of the charter's dates exist somewhere, uncollapsed: happened (`event_date`, `start_date`, edge validity), published (`sources.published_on`), ingested (`record_provenance.ingested_on`, `citations.created_at`), reviewed (`revisions.reviewed_at`). Indicator values additionally separate `year` from `reporting_period` from `verified_on` (schema.ts:310). What's missing is the *axis*: no read path treats epistemic time as queryable, and live tables have no transaction-time versioning of their own (the ledger next door does). |
| 24 | Source dependency | **ABSENT** | Nothing links source to source. Ten citations of one wire story are ten citations; `sourceRank` ranks *kinds*, not lineages. The charter's "how independently supported is this claim" cannot be asked. |
| 25 | Historical blind spots | **ABSENT** (one hand tool exists) | No coverage measurement exists beyond `scripts/dev/measure-network-density.ts` (one graph, run by hand, honest about what it implies). Nothing detects sparse years, regional asymmetry, or digitisation artifacts (though ingest dates in `record_provenance`/`created_at` are exactly the raw material for the digitisation-artifact test). |
| 26 | Counterfactuals | **OUT OF SCOPE** | Per the packaging scope note. Not assessed; appears in no candidate direction below. |
| 27 | The archive knows its limits | **PARTIAL (weak)** | Per-view honesty is strong: counts and denominators stated inline ("Recorded for n of m parties", "top 5 of 34 recorded", the flow view's excluded-transaction count), method lines on every insight, the methodology page. Archive-*wide* self-description ("political office history: high coverage; NGO funding before 2005: poor") exists nowhere and has nothing to compute it from until §25 exists. |

Two cross-cutting primitives the charter doesn't name but the map rests on,
included here because later judgments cite them: **typed refusals** (a
rate-limited action returns a `RateLimited` object, never `[]`, because an
empty result is an assertion — rate-limit-shared.ts:8–18) and **the
never-constructed line** (a chart cannot draw across a declared series break
because the joining path is never built — lib/series.ts:23 `splitAtBreaks`;
TrendChart draws one path per segment). Both are the same idea the frontier
needs everywhere: make the dishonest rendering *inexpressible*, not merely
discouraged.

---

## 2. The ten questions (charter §28)

**1. What conceptual primitives already exist?** Eleven, by this audit: the
citation (polymorphic, source-ranked); the source (typed, ranked, with a
verified ceiling); the revision (full bitemporal snapshot pair with actors);
the claim (a statused, attributed, periodised assertion object with
rebuttals); the verification (append-only, downgrade-preserving); the open
question (first-class recorded absence-of-answer); the dataset + row
provenance pair; the derived record path with its four honest states; the
evidence-statused, validity-dated edge; the typed refusal; and the stated
denominator (n on the view). That is a genuinely unusual base: most systems
have at most three of these.

**2. Which frontier concepts can already be expressed?** Fully: the
evidence-aware connection engine (§12), the dataset registry core (§14), the
non-chatbot answerer (§20). Substantially: epistemic state for the funding
layer (§3), disagreement-as-objects (§5), historical-time reconstruction
(§9), per-record trace (§17), negative knowledge as discipline (§19).
Latently — the data is kept but no code asks it: epistemic replay and
self-memory (§21–23) for every record that went through review.

**3. Which require schema changes?** Slot-targeted conflict (claims need a
target-field address and an `unresolved` linkage); absence records (a table
for searched-and-not-found, or an extension of `open_questions` with search
metadata); source derivation edges (§24); name/alias validity periods and a
person entity for the Atlas (§6); event participation links (§8); dataset
coverage fields and checksums (§14). All are additive; none touches an
existing row's shape — consistent with the standing rule that no approved
record changes status or shape.

**4. Which require new infrastructure?** Almost none, and this is the
audit's most consequential finding. Epistemic replay needs no new store —
the revisions ledger is the store; it needs a read layer. Blind-spot
detection needs rollup queries, not pipelines. The one true infrastructure
gap is raw-artifact retention (the GEM xlsx files are not archived), which
is an object-store decision, not a database one.

**5. Which are purely UI/product layer?** The conflict *view* over existing
disputed statuses, match candidates and reports (a union query and a page);
the unified Trace surface (all links exist; they need one spine); the
two-clocks strip (all four dates exist per record); archive-limits
statements *per layer* computed from counts; "what changed" v1 as a
two-period diff over data already queryable (terms, indicator values, edge
validity).

**6. Where does the architecture break at scale?** Measured, not guessed,
where possible. (a) `recordPath`'s batch lookup: the benchmarked failure is
on record (`scripts/dev/bench-provenance.ts`) — the composite-index probe
degenerates to a filter scanning every row of a subject_type at LokDhaba
scale ("Rows Removed by Filter: 299800"); fine at 10³, wrong plan at 10⁵.
(b) The whole-web network view is capped and steps back to search-first past
the cap — by design, and the design holds. (c) Polymorphic
`citations.subject_id` is `text` with no FK; integrity is loader discipline,
which scales socially, not mechanically. (d) `ensure-upgrades` is an
append-only list at 230 statements re-run every build; it grows linearly
forever and one non-idempotent statement fails every future build. (e)
Insights compute over full tables per render behind ISR — fine until terms ×
100 (LokDhaba), then needs materialisation. (f) The revisions ledger has no
index shaped for as-of queries (`entity, reviewed_at`) — trivial to add when
needed, worth knowing now.

**7. What is currently conflated?** Four conflations, one serious. (i)
**Person identity with name spelling** in the Atlas: `terms.cm_name` is text
(schema.ts:348) and person pages slugify it — two spellings are two people,
one name across two states is disambiguated only by state. The funding layer
solved this correctly (`people` + aliases + match candidates); the Atlas
never got the solution. (ii) Evidence *status* conflates two axes: how well
sourced (verified/documented) and what kind of speech-act (alleged/
inferred) — workable now, strained the moment one claim is both
well-documented *and* an allegation. (iii) `events` conflates
"state-year annotation" with "event as connective object". (iv) `documents`
vs `sources` overlap (a manifesto is both) with no link between the tables.

**8. What should become first-class?** In order of leverage: the
**slot-targeted conflict** (two claims about one field, linked and
statused); the **absence record** (searched-and-not-found, citable and
supersedable); the **person** as an Atlas entity; the **source edition**
(so derivation and versions can hang off it); the **coverage statement**
(computed per dataset/layer, then reviewable like anything else).

**9. What should explicitly NOT become first-class?** A confidence number,
on any axis — the charter forbids it and the codebase already refuses it
twice (no influence score, no coverage score). Causation — sequence stays
sequence. Narrative — the archive renders records, and even the Vantage idea
below renders *filtered evidence*, never story. "Current truth" as a
privileged object — the current row must remain just the latest state of a
ledger, or epistemic replay dies. And the investigation notebook stays out
of the shared database (investigation.ts's argument is correct and

should be treated as settled).

**10. The smallest change with the largest unlock — the hypothesis, tested.**
The hypothesis: make the claim the atomic fact-carrier, with historical
validity time, epistemic transaction time, source lineage, and multiple
claims targeting one slot under an unresolved-conflict status; temporal
identity, the conflict view, epistemic replay and historiographic versioning
then all become derivable. **Half right, and the half that is wrong is the
word "smallest."** Right: the claim is the correct *atom of disagreement*,
and it already exists with validity time (`period_start/end`), attribution,
status and rebuttals; adding a slot address (subject + field) and an
`unresolved` conflict linkage is a small additive migration that makes §5
complete and §18 a query — that part of the hypothesis survives contact with
the repo intact. Wrong: making the claim the carrier of *all* facts. The
facts of this archive live in typed relational rows (terms, elections,
indicator values, transactions) that every query, page, diff view, review
screen and chart reads directly; re-basing them onto claim-shaped storage
rewrites the entire read path and the moderation UI — the *largest* possible
change — and buys nothing that the existing ledger does not already hold,
because **the bitemporal substrate the hypothesis wants already exists as
`revisions`**: full before/after states in historical time, stamped in
epistemic time, with actors. Temporal identity, likewise, does not fall out
of claims; it falls out of aliases-with-validity and succession edges, which
are entity-layer facts. So the real answer, preserving the hypothesis's
intent: **(a)** give claims a slot target and conflict status — disagreement
becomes addressable data; **(b)** build an as-of read function over the
existing revisions ledger — epistemic replay, belief diffs and
historiographic versioning become queries over data already kept, with the
honest boundary that bulk-path records replay only to their `ingested_on`
and say so in PATH_STATEMENT's own voice. Two additive moves, no rewrite,
and §§18, 21, 22, 23 all light up.

---

## 3. Ten unconventional ideas (charter §35)

Each idea: the problem / why conventional systems fail at it / what Abhilekh
uniquely can do / data model required / feasibility now / smallest useful
implementation — tagged with the §33 questions it serves (numbers 1–8).

**I1 · The Dissent Ledger** — serves §33: 3, 4, 5.
*Problem:* real records disagree (two gazettes, two dates) and every
database picks one. *Why others fail:* a column holds one value; Wikipedia
resolves by edit-war; an LLM harmonises silently. *Uniquely Abhilekh:*
claims already exist as attributed, statused objects with rebuttals — pin
competing claims to the same fact-slot and render them as parallel
testimony under an editorial status of `unresolved`, with the live row
showing its value *and its contest*. *Data model:* slot address on claims
(subject_type, subject_id, field) + conflict status + partial index.
*Feasible now:* yes; additive migration. *Smallest useful:* one contested
term date rendered as two sourced claims with "Unresolved" where the single
date used to stand alone.

**I2 · As-Of Mode (epistemic time travel)** — serves §33: 1, 3, 7, 8.
*Problem:* "what did the archive say last February" is unanswerable
everywhere, though it is the question that makes an archive trustworthy.
*Why others fail:* databases overwrite; wikis have page history but no
cross-record reconstruction; LLMs have no epistemic time at all. *Uniquely
Abhilekh:* `revisions` already stores every before/after state with
timestamps — an as-of reducer can rebuild any reviewed record's belief at
time T, and PATH_STATEMENT's fourth state already provides the honest
vocabulary for records whose history is not held. *Data model:* none; one
index (`entity_type, entity_id, reviewed_at`) and a pure reducer. *Feasible
now:* yes — the highest capability-to-schema-change ratio in this document.
*Smallest useful:* `?as_of=` on one record page, rendering the reconstructed
state with "as recorded on {date}; {n} revisions since."

**I3 · The Evidence Horizon Map** — serves §33: 1, 4, 7.
*Problem:* readers mistake documentation density for historical activity.
*Why others fail:* dashboards plot the data, never the data *about* the
data; nothing renders its own blind spots. *Uniquely Abhilekh:* the map
already draws states by year — drive the same map with the archive's own
coverage (records, citations, path mix per state × decade × layer) so the
archive's shape becomes as browsable as India's. *Data model:* none; rollup
queries. *Feasible now:* yes. *Smallest useful:* the existing map with a
"coverage" lens toggle and counts stated on the view.

**I4 · The Independence Audit** — serves §33: 3, 4, 5, 7.
*Problem:* ten citations may be one wire story wearing ten mastheads. *Why
others fail:* citation counts are treated as corroboration everywhere, and
no consumer system models derivation. *Uniquely Abhilekh:* sources are
already typed and ranked; add derives-from edges between sources and deflate
every record's support to *independent lineages*, displayed as "3 citations
· 1 lineage" — explicitly without a score. *Data model:* one
source-to-source edge table. *Feasible now:* yes; the labour is editorial.
*Smallest useful:* lineage count beside citation count on one record class.

**I5 · The Two Clocks** — serves §33: 3, 6, 7.
*Problem:* happened / published / ingested / reviewed are four dates that
every interface collapses into one. *Why others fail:* single-timestamp data
models. *Uniquely Abhilekh:* all four dates already exist per record across
tables (§23 above) — render them as a twin-track strip (historical time
above, epistemic time below) using the sequence view's vocabulary.
*Data model:* none. *Feasible now:* yes. *Smallest useful:* the strip on one
funding transaction: occurred 2015 · filed 2016 · ingested 2026 · reviewed —.

**I6 · Vantage** — serves §33: 2, 4, 5, 7, 8.
*Problem:* "competing narratives" without writing narratives. *Why others
fail:* multi-perspective history becomes authored prose, which is exactly
what an archive must not generate. *Uniquely Abhilekh:* every fact knows its
sources and every source its kind — let the reader restrict the evidence
base (government records only; press only; court records only) and re-render
the *same* pages from the restricted base, with everything unsupported
falling back to the absence voice. The differences between vantages are the
finding, and the system never says which vantage is true. *Data model:*
none; a filter threaded through queries (heavy engineering, zero schema).
*Feasible now:* v1 on one page family. *Smallest useful:* a state-year page
under a "government records only" vantage, diffed against the full view.

**I7 · The Lineage Braid** — serves §33: 2, 6.
*Problem:* institutional continuity (renamed, merged, absorbed) is invisible
in entity-per-page designs. *Why others fail:* graphs draw current entities;
time-series draw values; neither draws identity flowing through
reorganisations. *Uniquely Abhilekh:* `successor_of`/`parent_of` edges with
validity dates already exist — walk them into chains and draw a braid over
time in the timeline band vocabulary, office-holders riding the strands.
*Data model:* none for orgs (needs data entry); a succession edge for
states/institutions later. *Feasible now:* renderer yes; data thin.
*Smallest useful:* one recorded three-hop org succession drawn as a braid
with every hop citing its source.

**I8 · Absence Records** — serves §33: 4, 5, 7.
*Problem:* "we looked and found nothing" is real research output and no
system can store it, so every gap reads as never-looked. *Why others fail:*
negative results have no home in fact tables; NULL means five different
things. *Uniquely Abhilekh:* the absence-as-absence discipline already
exists in prose; make it a record — who searched, which archive, on what
date, for what, finding nothing — citable, reviewable through the ordinary
queue, and *supersedable the day the document turns up*. NotHeldSection then
distinguishes "not researched" from "searched, nothing qualifying found,
as of date D". *Data model:* one table (or `open_questions` extended with
search metadata). *Feasible now:* yes. *Smallest useful:* one entity page
whose not-held line cites a dated search.

**I9 · The Belief Diff** — serves §33: 1, 3, 7, 8.
*Problem:* "what changed in the archive's understanding, and why" —
§21's six-month question. *Why others fail:* changelogs list edits, not
belief transitions with their evidence. *Uniquely Abhilekh:* with I2's
reducer, diff two epistemic dates and attach to each changed fact the
revision, reviewer and cited source that moved it. The archive's own history
becomes a first-class reading. *Data model:* none beyond I2. *Feasible now:*
after I2. *Smallest useful:* "this record, this year: 2 facts changed, each
with its reason" on one history page.

**I10 · Answer Receipts** — serves §33: 3, 8.
*Problem:* a correct answer today is unverifiable tomorrow once data moves.
*Why others fail:* chatbots cannot re-derive; query links break against
changed data. *Uniquely Abhilekh:* `ask.ts` is already deterministic — make
every answer emit a receipt (question, record ids, revision ids, as-of
date) that re-runs the derivation later against the as-of layer, so an
answer cited in an article remains checkable forever. *Data model:* none
(receipts are self-contained URLs/JSON). *Feasible now:* receipt yes;
re-derivation needs I2. *Smallest useful:* a "cite this answer" link on one
ask pattern carrying the receipt.

**I11 (spare) · The Contribution Frontier** — serves §33: 4, 7.
Rank `open_questions` by structural value: which single missing document
would resolve the most unresolved slots or absence records. Points the
contributor community at the archive's highest-value gap. Feasible after I1
+ I8 exist; smallest useful is a sorted list.

All eleven serve at least one §33 question; none needed the disqualification
clause.

---

## 4. Three candidate directions — decision memo

The selection is yours, made in a later turn; nothing proceeds on this
document alone.

### Direction A — The Epistemic Ledger (as-of + slot conflicts + two clocks)

The charter's Phase 1, built on the finding that the substrate exists.
Delivers I1, I2, I5, and the foundations of I9/I10.

**Unlocks:** §18 conflict view (a query once slots exist), §21 self-memory,
§22 historiographic versioning, §23 the two-times axis — the four concepts
that most distinguish "computable epistemology" from a good database.
**Costs:** one additive migration (slot columns + conflict status on claims;
one index on revisions); a pure as-of reducer with tests; render work on
record pages. Two to three weeks of careful work. **Risks:** as-of honesty
at the bulk boundary — a bulk row's history begins at `ingested_on`, and the
reducer must render that in PATH_STATEMENT's voice or replay quietly
overclaims; slot addressing must not become a parallel fact store. **What it
forecloses:** little; it is additive. It *defers* data mass (Direction C),
and an archive of fixtures with perfect epistemics is a demo. **First two
weeks:** week 1 — as-of reducer over `revisions` (pure, tested), the index,
`?as_of=` on one record family with the honest boundary; week 2 — claims
slot migration, one real contested fact recorded end-to-end, conflict query
+ the first unresolved rendering, two-clocks strip on funding transactions.

### Direction B — The Coverage Instrument (horizon map + absence records + limits)

Makes §4, §25 and §27 real. Delivers I3, I8, and the denominator for I4.

**Unlocks:** the archive knowing — and showing — its own shape; the
digitisation-artifact defence; "not researched" vs "searched and absent" as
recorded, citable states; the archive-limits statements of §27 computed
rather than asserted. **Costs:** one small table (absence records), rollup
queries, one map lens; the ongoing cost is editorial (absence records are
authored). **Risks:** coverage numbers will be read as quality scores unless
rendered under the counts-not-scores discipline; and from this container the
interesting rollups run against production data I cannot see — the first
real render is the test. **Forecloses:** nothing. **First two weeks:** week
1 — coverage rollups per state × decade × layer, the map's coverage lens
with n stated on the view; week 2 — absence-record table through the normal
review queue, NotHeldSection upgraded to cite dated searches, a first
archive-limits panel on the methodology page.

### Direction C — The Elections Spine at Scale (LokDhaba on the bulk path)

Data mass for the layer every frontier view stands on. The true current
status, stated plainly: **no LokDhaba pipeline exists in the repository** —
the only occurrence of the word is a benchmark script's filename; both
existing import routes (the Wikidata admin import and the inbox loader)
predate bulk provenance and write through `revisions`; the remaining work is
**one schema-mapping loader on the proven bulk path** (datasets +
record_provenance + PATH_STATEMENT), whose plumbing is built and already
carries funding and indicators.

**Unlocks:** real elections and terms at the scale where Compare, insights,
"what changed", the horizon map and person pages stop being demonstrations;
the forcing function for the Atlas person entity (Q7's worst conflation
cannot survive a real ingest, and fixing it during ingest is cheaper than
after). **Costs:** the loader and its refusal rules; the cm_name → person
decision; the benchmarked `recordPath` query needs its scale fix before,
not after (the failure mode is measured and on record). **Risks:** identity
resolution at scale is the red-line-adjacent zone (below); the review queue
must not be flooded — which is exactly what the bulk path exists to avoid,
with its honesty preserved by PATH_STATEMENT. **Forecloses:** nothing
architecturally; it spends the next month on data rather than epistemics.
**First two weeks:** week 1 — schema mapping against the real CSV headers,
loader with refusal tests, dataset declaration, dry-run counts; week 2 —
staged ingest of one state's history end-to-end, `recordPath` scale fix,
person-entity decision memo with the match-candidate discipline applied to
cm_name.

**My recommendation, marked as mine:** A, then C immediately after — the
ledger first, so that when the elections mass arrives it lands *inside* a
bitemporal frame and every ingested row is replayable from day one; C first
is the right call instead if the next month's priority is launch credibility
over epistemic depth. B composes with either and is the natural third. This
is a recommendation, not a selection.

---

## 5. Red lines check (charter §29)

Every §29 item, against each candidate. Section 26 appears in no candidate.

**Direction A.** Citations, provenance, revision history, reviewer workflow:
untouched and *load-bearing* — A reads the ledger; it never rewrites it
(the reducer is read-only by construction, and the revisions table stays
append-only from the reducer's side). Evidence hierarchy: claims keep their
status checks; slot targeting adds addressing, not new statuses. Identity
separation: slot conflicts reference existing entities; no merging.
Uncertainty: `unresolved` is a named state, not a probability. No influence
score / no confidence number: the conflict view counts and lists; it never
weighs. No invented dates: as-of reconstruction renders only stored
snapshots at stored timestamps — **near-the-line point, named:** the
temptation will be to interpolate belief between revisions or before
`ingested_on`; the reducer must return the `unrecorded` voice there, and
that behavior must be tested, because replay that guesses is fabrication
with a timestamp. Not-held information: extended, not weakened (the as-of
boundary is itself a not-held statement).

**Direction B.** Citations/provenance/review: absence records go *through
the ordinary review queue* — a recorded absence is a claim about a search
and earns the same scrutiny. Raw source preservation: unaffected. No silent
transformations: rollups publish their queries as method lines, the
insights precedent. Uncertainty and not-held: this direction is those two
principles becoming data. **Near-the-line point, named:** a coverage map is
one step from a coverage *score*, and a score is one step from ranking
states by how well-documented they are, which readers will read as how
well-governed. The discipline that holds the line is already in the house
style: counts beside every shade, no composite, and the digitisation caveat
stated on the view — but this direction should not ship without that
sentence rendered on the map itself. Second near-line: an absence record
must never render as evidence of non-occurrence — its voice is "searched,
not found, as of", and the wording belongs in the shared vocabulary file,
not per-page.

**Direction C.** Raw source preservation: the loader stores the dataset
declaration and per-row upstream ids; the upstream CSV should additionally
be retained as an artifact (closing the one §15 gap) rather than only the
curated extract. No silent transformations: the bulk path's validators
refuse-don't-repair, and the LokDhaba mapping inherits that or does not
merge. Reviewer workflow: bypassed *by declared design* on this path, and
honestly labelled per row by PATH_STATEMENT — the four-state marker is the
red line's keeper here. No invented dates: LokDhaba's partial dates enter as
partial (the sequence/`Occurrence` precision model already refuses to
invent months). **Near-the-line point, named:** identity. Mapping cm_name
strings and LokDhaba candidate names onto person entities is where an eager
join invents an identity two records never claimed. The line is held by the
funding layer's own precedent — two records stay two records, joined only by
a reviewed match candidate — and C must adopt it wholesale for persons, at
the cost of slower unification. No influence score, no fabricated causal
claims: not implicated. Explicit not-held: unaffected.

---

## The decision now yours

The map says the substrate for computable epistemology largely exists; the
memo offers three ways to spend the next month on it. **Which direction do
you select — A (the Epistemic Ledger), B (the Coverage Instrument), or C
(the Elections Spine) — and if A or C, do you accept its named
near-the-line term (the unrecorded-voice test for replay; the
match-candidate discipline for person identity) as a binding condition of
the build?**
