# Design: Political Accountability Layer

Status: **design only, nothing implemented.** This document is the architecture,
data model, workflow and phasing plan for connecting promises to evidence.

---

## 1. Audit of the current architecture

What exists today, and what it means for this feature.

**Three revisable entities.** `revisionEntityEnum` is `["term", "election",
"event"]`. Everything public flows through `revisions`: a proposal carries a
JSON `afterData` payload, a moderator compares it against a snapshot of the
live row, and approval applies it inside one transaction. The extension points
are already there and are registries, not conditionals:

- `payloadSchemaFor` and `canonicalizeFor` in `src/lib/revisions/payloads.ts`
- a `switch (entityType)` in `src/lib/revisions/snapshot.ts`
- `applyRevision` in the approval transaction

Adding an entity type means: extend the enum (migration), add a Zod payload
schema, add a canonicalizer, add a snapshot case, add an apply case. That is
the designed seam and it holds. **No rewrite is required.**

**Sources are first-class but joined per entity.** `sources` is one table
(title, url unique, publisher, publishedOn, accessedOn), joined by
`term_sources`, `election_sources`, `event_sources`. This is the pattern that
does *not* scale: this feature adds at least five citable entities
(manifesto, promise, promise status, timeline step, document), so the current
shape implies five more near-identical join tables.

**Curated vs revisioned.** `indicators` and `indicator_values` are admin
curated and load directly with inline sources, deliberately bypassing review.
`parties` is likewise curated. This precedent matters: not everything in the
accountability layer needs the full revision flow, and pretending otherwise
would make the moderation queue unusable.

**Search.** Postgres FTS via generated `tsvector` columns on `parties` and
`events`, with GIN indexes. Extending it to promises is the same pattern.

**Structured answers.** `src/lib/ask.ts` pattern-matches questions and returns
an answer with a `method` line. Every computed statement on the site already
states how it was computed. The accountability layer must not break that rule.

---

## 2. The neutrality problem, and how the model solves it

This is the most important design decision in the feature, and getting it
wrong would destroy the archive's premise.

The request asks for a promise `status` with values like **Completed**,
**Partially Completed**, **Not Started**. Those are *verdicts*. The moment
Abhilekh writes "Not Started" in its own voice, it has judged a government —
which the core principle forbids. Worse, a status column invites the
aggregation that follows automatically: *"BJP completed 47% of its 2019
promises."* That single number is the scorecard the archive exists to refuse,
and once the field exists, someone will compute it.

**The resolution: status is never Abhilekh's claim. It is always somebody
else's, quoted.**

Concretely:

1. A status is not a column on `promises`. It is a row in
   `promise_status_claims` — a dated, sourced, attributed assertion.
2. Every claim names its **claimant** (`CAG`, `state government`,
   `ministry`, `news outlet`, `petitioner in court`) and carries at least one
   citation. A claim without a source cannot be saved.
3. Multiple contradictory claims are a **feature**. The CAG says partially
   completed; the state says completed. Abhilekh shows both, side by side,
   dated and sourced, and picks neither.
4. The UI never renders a bare status badge. It renders *"Completed, per the
   Department of Health, 12 March 2024"* with the citation attached.
5. **No aggregation across promises, ever.** No completion percentages, no
   party league tables, no "promises kept" counters. This is a hard rule in
   the same class as "no fabricated facts", and it belongs in AGENTS.md.

Where nobody has made a claim, the honest state is *no claim recorded* — not
"Not Started", which is itself an assertion about the world.

The same discipline applies to the requested `confidence` field on evidence.
Abhilekh cannot score a source's reliability without editorialising. What it
*can* do is record verifiable facts about a document: whether it is
**official** (issued by a government body) or **independent**, and whether it
is **primary** (the order itself) or **secondary** (reporting about it). Those
are classifications, not judgments. Drop `confidence`.

---

## 3. Data model

### 3.1 The change that unblocks everything: polymorphic citations

Replace the three join tables with one:

```
citations
  id            uuid pk
  subject_type  citation_subject   -- 'term' | 'election' | 'event' | 'manifesto'
                                   -- | 'promise' | 'promise_status_claim'
                                   -- | 'timeline_step' | 'document' | 'indicator_value'
  subject_id    uuid
  source_id     uuid -> sources.id
  note          text               -- optional: page number, clause, table reference
  primary key (subject_type, subject_id, source_id)
```

Existing rows migrate in with a backfill; the three old tables are kept as
views for one release, then dropped. Every future citable entity is free.

`sources` gains three columns, all factual:

```
  kind           source_kind   -- 'gazette' | 'cag_report' | 'court_judgment'
                               -- | 'assembly_record' | 'budget_document'
                               -- | 'ministry_report' | 'press_release'
                               -- | 'news' | 'research' | 'rti_response' | 'other'
  is_official    boolean       -- issued by a government body
  is_primary     boolean       -- the artefact itself, not reporting about it
```

### 3.2 Documents (the media archive)

One table serves manifestos, gazettes, CAG reports, budget speeches, court
judgments, affidavits, debate transcripts and the rest. A manifesto is a
document with `type = 'manifesto'`; it is not a special table.

```
documents
  id             uuid pk
  type           document_type       -- the enum from the request, ~24 values
  title          text
  publisher      text                -- party, ministry, ECI, court
  published_on   date
  language       text                -- ISO 639, documents are often not English
  official_url   text                -- the issuer's own copy
  archive_url    text                -- our snapshot, because official URLs rot
  checksum       text                -- integrity of the archived copy
  page_count     int
  ocr_status     ocr_status          -- 'none' | 'pending' | 'done' | 'failed'
  full_text      text                -- extracted, for FTS
  search_tsv     tsvector generated
  state_id       text -> states.id   -- nullable: national documents have none
  election_id    uuid -> elections.id -- nullable
  party_id       text -> parties.id  -- nullable
  created_at     timestamptz
```

Storage: the PDFs themselves go to object storage (Vercel Blob or S3), not
Postgres. `archive_url` points there. **Copyright is a real constraint** —
party manifestos are usually redistributable, but CAG reports, judgments and
news articles vary. Archive copies need a per-type policy decision before
launch, and `documents` should carry a `redistribution` flag governing whether
we serve our copy or only link out.

### 3.3 Promises

```
promises
  id                 uuid pk
  document_id        uuid -> documents.id    -- the manifesto it came from
  party_id           text -> parties.id
  election_id        uuid -> elections.id
  state_id           text -> states.id       -- null for national promises
  official_text      text                    -- verbatim, in the source language
  official_lang      text
  plain_text         text                    -- editor's plain-English restatement
  category           promise_category        -- the 12 from the request
  geographic_scope   promise_scope           -- 'national'|'state'|'district'|'constituency'
  stated_timeline    text                    -- as written: "within five years"
  stated_budget_inr  numeric                 -- only if the manifesto states one
  page_ref           text                    -- where in the PDF, for verification
  sort_order         int
  search_tsv         tsvector generated
```

Two text fields, deliberately. `official_text` is quoted and never edited.
`plain_text` is an editorial restatement, is clearly labelled as such in the
UI, and is itself reviewable. Conflating them would let paraphrase drift into
the record.

`priority` from the request is **dropped** unless the manifesto states one:
inferring that a promise was "high priority" is editorialising.

Departments and schemes are many-to-many via `promise_departments` and
`promise_schemes`, since one promise routinely spans several.

### 3.4 Status claims

```
promise_status_claims
  id            uuid pk
  promise_id    uuid -> promises.id
  status        promise_status      -- the 9 from the request
  claimant      text                -- "Comptroller and Auditor General"
  claimant_type claimant_type       -- 'government'|'audit'|'court'|'legislature'
                                    -- |'press'|'research'|'civil_society'
  claimed_on    date                -- when the claimant said it
  rationale     text                -- why, in the claimant's terms
  created_at    timestamptz
```

Citations attach via `citations`. A claim with zero citations fails validation
at the payload schema, exactly as sourceless events do today.

### 3.5 Timeline

The request's lifecycle (manifesto → election → budget → cabinet → tender →
construction → completion → audit) is not a fixed pipeline; real promises
skip stages, repeat them, and reverse. Model it as an ordered set of dated,
sourced steps:

```
promise_timeline_steps
  id            uuid pk
  promise_id    uuid -> promises.id
  step_type     timeline_step_type   -- 'manifesto_released'|'election_result'
                                     -- |'budget_allocation'|'cabinet_decision'
                                     -- |'government_order'|'tender'|'work_began'
                                     -- |'progress_report'|'completion'|'audit'
                                     -- |'litigation'|'discontinued'
  occurred_on   date
  precision     date_precision       -- 'day'|'month'|'year', reuse the terms pattern
  title         text
  detail        text                 -- neutral, sourced
  amount_inr    numeric              -- for budget steps
  document_id   uuid -> documents.id -- the order/report itself, when we have it
```

### 3.6 Smart linking

A generic edge table rather than a column per relationship:

```
entity_links
  from_type   entity_type
  from_id     text
  to_type     entity_type
  to_id       text
  relation    link_relation   -- 'implements'|'supersedes'|'funds'|'audits'
                              -- |'litigates'|'reports_on'|'derived_from'
  primary key (from_type, from_id, to_type, to_id, relation)
```

Links are **asserted and sourced, never inferred**. "This government order
implements that promise" is a claim; automatic keyword matching would
manufacture connections the record does not support. The importer may
*suggest* links into the review queue; a moderator confirms them.

---

## 4. What is revisioned, and what is curated

Sending every promise through the moderation queue would drown it: one
manifesto is 200+ promises.

| Entity | Flow | Why |
|---|---|---|
| `documents` | Curated (admin/moderator) | Metadata about a file; low ambiguity |
| `promises` | **Revisioned** | Editorial judgment in extraction and restatement |
| `promise_status_claims` | **Revisioned** | The contested surface; needs review |
| `promise_timeline_steps` | **Revisioned** | Factual claims about what happened |
| `entity_links` | **Revisioned** | Assertions of causation |
| `citations` | Follows its subject | Never standalone |

`revisionEntityEnum` grows from 3 to 7. Each addition needs a payload schema,
canonicalizer, snapshot case and apply case — the existing seam.

**Bulk extraction needs its own path.** Extracting 200 promises from a PDF
must not create 200 queue items. Add a `revision_batches` table so a batch
reviews as a unit with per-row accept/reject, reusing the existing diff view
per row. This is the one genuinely new moderation surface.

---

## 5. UI and workflows

**Manifesto viewer** (`/manifesto/[id]`): promises as the primary content,
grouped by category, with filters, the original PDF beside each promise via
`page_ref`, and per-promise permalinks for citation.

**Promise page** (`/promise/[id]`): official text quoted; plain restatement
labelled; the timeline as a vertical sequence of dated sourced steps; status
claims as a *list*, each reading "Completed, per X, on date", with
contradictions shown adjacently and never resolved; evidence panel listing
every citation with kind, official/independent, primary/secondary.

**Party page** extends the existing record archetype with manifestos and
promises sections; the layout already exists.

**Manifesto comparison** (`/compare?m=manifestos`): reuses the compare
architecture and the `rec-table` category-band pattern shipped for the
state-by-state comparison. Same shape: shared categories first, then
one-sided.

**Media archive** (`/archive`): faceted browse over `documents` by type,
publisher, year, state, party, language, with full-text search.

**Search** extends `ask.ts` with promise patterns. The four example questions
map to: filter by party + year + category; promise timeline lookup; earliest
promise matching a phrase; promises matching a phrase across parties. All are
expressible against this model, and each answer keeps its `method` line.

---

## 6. Phasing

Each phase ships something usable and none blocks the site.

1. **Foundations.** Polymorphic `citations` + `sources` classification, with
   backfill. No user-visible change; unblocks everything.
2. **Documents + media archive.** `documents`, object storage, `/archive`,
   FTS. Immediately valuable on its own, before a single promise exists.
3. **Manifestos + promises.** Extraction tooling, revision types, viewer.
4. **Evidence + status claims.** The accountability surface.
5. **Timeline + links.** Lifecycle and smart linking.
6. **Comparison + search.** Manifesto comparison, promise questions.

Phases 1 and 2 are worth doing regardless of whether the rest is ever built.

**Shipped so far:** phases 1, 2 and 3.

Phase 3 as built: `promise_category` and `promise_scope` enums, the
`manifesto_promises` table, `manifesto_promise` on `revisionEntityEnum`, the
payload schema and canonicalizer, snapshot and diff support, create/update/
delete branches in `applyRevision` writing citations through the polymorphic
table, an extraction form at `/contribute/manifesto_promise`, a document page
at `/archive/[documentId]` that doubles as the manifesto viewer, and a promise
record page at `/promise/[promiseId]`.

Two deliberate omissions carried forward from the design. A promise still has
no status column, so the archive issues no verdict; that arrives in phase 4 as
dated attributed claims. And `documentId` is not editable on a promise: moving
a quotation to a different document is a delete plus a create, so the citation
trail cannot be quietly rewritten.

Batch review for bulk extraction (`revision_batches`) is not part of phase 3.
It changes how moderators approve, not what a promise is, and it should be its
own increment.

---

## 7. Backward compatibility

- Every table is additive. No existing column changes type or meaning.
- `citations` is backfilled from the three join tables, which remain as views
  for one release before being dropped.
- `revisionEntityEnum` is appended to; existing values keep their meaning, and
  old revisions replay unchanged.
- All new routes are new paths. No existing URL changes.
- `data/inbox` gains `documents.csv`, `promises.csv`, `promise_status.csv`,
  `promise_timeline.csv` alongside the current sheets, using the same loader
  conventions and the same pending-draft semantics.

---

## 8. Risks

**The neutrality risk is the feature's central risk**, addressed in §2. It is
not a UI problem; it has to be prevented in the data model, or someone will
compute a scorecard from it.

**Extraction quality.** Turning a 200-page manifesto into structured promises
is the hardest labour in the project. It cannot be fully automated, and an LLM
extraction pass must land in the review queue with the source page attached,
never published directly.

**Copyright.** Resolve redistribution per document type before archiving
copies.

**Moderation load.** Promises will outnumber every existing entity combined.
Batch review is required, not optional.

**Selection bias.** Which promises get evidence attached is itself an
editorial act. If contributors only research contentious promises, the archive
skews without a single false statement in it. Mitigation: track coverage per
manifesto and show it plainly ("evidence recorded for 34 of 210 promises"), so
the gaps are visible rather than implied.
