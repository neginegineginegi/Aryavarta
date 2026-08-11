# India Funding and Influence Map — architecture

A layer for mapping financial, organisational, institutional, media, political,
legal and campaign relationships in India, built so that the evidence trail is
stronger than any narrative that can be read off it.

This document is the design. It is written before the interface deliberately:
the safeguards this layer needs are structural, and a schema that permits an
accusation will eventually carry one.

---

## 1. The one idea

**Nothing in this layer is a fact because it is in a table. It is a fact
because a source says so, and the table records which source.**

Two consequences shape everything below.

**Facts and interpretations live in different tables.** A payment is a fact: it
happened, on a date, for an amount, and a filing records it. That "the donor
directed the recipient's campaign" is an interpretation, and interpretations
are stored as claims that carry who is making them. There is no column anywhere
in this schema that lets a payment quietly become a motive.

**The system never writes an edge it worked out for itself.** Every
relationship is authored and cited. Overlap between two organisations is
computed at read time and labelled as overlap; it is never stored, because a
stored overlap becomes a fact-shaped object that outlives the caveat printed
next to it.

## 2. What already exists and is reused

This is an extension, not a parallel application. The layer takes these as-is:

| Existing | Used for |
| --- | --- |
| `sources` | Every citation. Already records publisher, date, `kind`, `is_official`, `is_primary`, and deliberately does not score reliability. |
| `citations` | Polymorphic, with a `note` for page or clause. New subject types are added; no new join tables. |
| `revisions` | Section 18's version control. Every change is proposed, diffed and approved; the before state is preserved. Nothing is overwritten. |
| `reports` | Section 25's disputes. A `dispute` report already drives a visible banner. |
| `states` | Geography, including the union pseudo-state `in` for national bodies. |
| `users` and roles | Who entered, who verified. |
| Search (Postgres FTS) | Section 15, extended to the new tables. |
| The design system | Cards, plates, the motion system, the cursor field. Section 19 is met by using what is there, not by inventing a second visual language. |

Nothing in the existing schema changes shape. The additions are new tables, new
enum values, and new members of two existing enums.

## 3. The source hierarchy

Section 7's ordering is expressed as a rank function in code
(`src/lib/funding/source-rank.ts`), not a stored column, so it can be revised
without a migration and can be read by anyone.

```
1  government record        6  annual report            11  RTI response
2  court judgment           7  corporate filing (MCA)   12  journalism
3  regulatory filing        8  organisational document  13  academic research
4  FCRA record              9  grant database           14  organisational statement
5  audited statement       10  parliamentary record     15  social media
```

Rank orders evidence in the interface. It does not gate what may be recorded: a
newspaper report is a legitimate source for an `alleged` claim, and saying so is
the honest outcome.

## 4. Evidence status

Six values, on every relationship, funding row and claim.

| Status | Means | Rule |
| --- | --- | --- |
| `verified` | Directly supported by a primary source someone has read | Requires a citation of rank 1–8 |
| `documented` | Credible secondary sourcing, not independently checked | Requires a citation |
| `alleged` | A named party asserts it | Requires a citation **and** an asserter |
| `disputed` | Contested by another party or source | Requires the dispute to be recorded too |
| `inferred` | Suggested by several pieces of evidence, never explicitly documented | Requires a written rationale, and can only be authored by a human |
| `unknown` | Insufficient evidence | Cannot be attached to an assertion, only to a question |

`inferred` is the dangerous one, so it carries the heaviest requirement: a
`rationale` field that is not optional, and a rendering that never resembles
the rendering of `verified`.

## 5. Entities

Two identity tables, deliberately few.

**`orgs`** — everything institutional, distinguished by `kind`: `ngo`, `trust`,
`society`, `foundation`, `think_tank`, `advocacy`, `media`, `research`,
`company`, `government_body`, `political`, `international`, `religious`,
`professional_body`, `other`. One table because an organisation changes kind
over its life and a table-per-type makes that a migration.

**`people`** — individuals in institutional or public roles. Carries
`public_role_basis`: a required sentence stating why this person is in a public
archive at all ("trustee of X, per the 2021 MCA filing"). A person with no
institutional role does not belong here, and the field makes that a visible
decision rather than a silent one.

**Targets** are not a third identity table. A company is an `org`; a policy or
an infrastructure project is a `projects` row; a regulator or ministry is an
`org` of kind `government_body`; a political party is the existing `parties`
table. Reusing the existing identities keeps the funding layer joined to the
political record rather than beside it.

## 6. Identity resolution

Section 24, made structural.

- **`entity_aliases`** — every name a body has been known by, tagged
  `legal_name`, `former_name`, `abbreviation`, `transliteration`, `alias` or
  `misspelling`, each optionally cited. The original name is preserved on the
  source record; the alias table is additive.
- **`entity_match_candidates`** — two ids that might be the same body, with a
  status of `possible`, `confirmed` or `rejected`, a rationale, and who decided.

**There is no merge operation.** Confirming a match records a confirmation; it
does not delete a row. Two records that turn out to be one body stay two rows
joined by a confirmed candidate, because a merge destroys the evidence that
they were ever recorded separately.

## 7. Money

**`funding_transactions`** is the core financial record.

```
donor      (org | person)      recipient  (org | person)
amount     numeric             currency   ISO 4217
financial_year  '2022-23'      occurred_on  date, nullable
funding_type    grant | donation | csr | government_grant | contract |
                membership | subscription | advertising | investment |
                loan | in_kind | other
stated_purpose  verbatim from the source, never paraphrased
programme       the donor's or recipient's own programme name
donor_country   ISO 3166, nullable
reported_under_fcra  boolean, nullable
evidence_status
retrieved_on / entered_on / verified_on / verified_by
```

Three decisions worth stating.

**Amounts are stored in the currency the source used.** No conversion at write
time. A grant reported in USD is a USD row. Converting silently would be a
transformation of an ambiguous field, and the rate and date of any conversion
are themselves claims.

**`stated_purpose` is verbatim.** It is the donor's or recipient's description,
not a category the archive assigns. A separate optional `purpose_tag` may be
added later for filtering; it will never replace the quoted text.

**"Foreign" is recorded, not derived.** There is no `is_foreign` column
computed from the country. Under FCRA a company registered in India can be a
foreign source, and a donor in another country may not be. The schema records
`donor_country` and `reported_under_fcra` as separate facts, each cited, and
the interface states which one it is showing.

**`fcra_registrations`** holds registration number, status (`active`,
`suspended`, `cancelled`, `expired`, `renewed`), grant and validity dates, and
any recorded government action with its date and citation.

Every funding row and FCRA row requires at least one citation. This is enforced
in the revision payload, exactly as events already are.

## 8. Relationships

**`relationships`** is the typed factual edge: a from-entity, a to-entity, a
kind, a date range, an evidence status, and citations.

Permitted kinds are factual and checkable:

```
funded              founded            owns              sits_on_board
employed_by         partnered_with     member_of         advised
published           filed_case_against  targeted         successor_of
campaigned_for      campaigned_against  campaigned_regarding
```

**Four kinds are deliberately absent**: `coordinated_with`, `influenced`,
`controlled_by`, `acted_on_behalf_of`. These are the accusations. They cannot
be stored as relationships because there is no enum value for them.

That is not a refusal to record control. Section 4 asks that documented control
be shown *separately*, and a separate table is what that means. Where a source
does establish direction, coordination or a contractual condition, it is
recorded as a claim — which forces it to carry who established it, at what
status, from which document.

Specific relations get their own tables where they have their own fields:
`board_positions` (role, role kind, start, end), `campaign_participants`,
`campaign_targets` (with an explicit `stance`), `legal_case_parties` (side).

## 8a. The graph

Edges live in nine specific tables, each with fields of its own. The graph
needs one shape, so two Postgres views supply it: `graph_nodes` and
`graph_edges`.

**The views project stored columns. They never join two facts to invent a
third**, which is what keeps rule 1 (no derived relationship is ever written)
true even though the graph reads across the whole layer. Every projected edge
carries the citation handle of the row it came from, so an edge can always say
where it came from; an edge that cannot has no business being drawn.

Eleven edge sources: `relationships`, `funding_transactions`, `board_positions`, org parentage,
`campaign_participants`, `campaign_targets`, `legal_case_parties`,
`publications`, `projects` (operator), `outcomes`, and `claims`.

**`interpretive` is the column that keeps the two halves apart.** False for the
nine factual sources, true for claims. The renderer reads it and can never draw
an asserted relationship the way it draws a documented one, and traversal
excludes claims unless a caller asks for them by name.

**Entity ids are text, not uuid.** Orgs, people, projects and campaigns carry
UUIDs, but party ids are slugs and state ids are two-letter codes. With uuid
columns the graph could not reach a party or a state at all, and those are
exactly the nodes that join this layer to the political record beside it.
`citations.subject_id` had already made this choice for the same reason.

### Traversal

`src/lib/funding/graph.ts` holds the read primitives. `graph-types.ts` holds
the shapes and the row mapper, separately, because the query module opens a
database connection at import time and these types travel into client
components.

- `neighbourhood(root, { depth, yearFrom, yearTo, includeInterpretive, maxNodes })`
  returns everything within N hops, each node tagged with its distance from the
  root. Depth is clamped to 4 and the node budget is enforced; a result says
  whether it was **truncated** rather than quietly returning part of the
  picture.
- `findPaths(a, b, { depth, limit })` returns documented paths, shortest first,
  with no node repeated. A path is a chain of recorded relationships and
  nothing more: it does not mean the two ends are connected in any sense beyond
  the links it lists.
- `sharedConnections(a, b)` returns **documented overlap**, computed on read
  every time, with each side's edges kept separate so the reader sees the two
  halves rather than a merged conclusion.

Traversal is undirected: money flows one way, but a researcher following it
needs to walk back up. Each edge keeps its own direction for rendering.

**A path reports its weakest step.** A five-step chain is only as good as its
worst-evidenced link, and a path whose four solid steps hang off one `alleged`
one must not read as a finding. The weakest status is shown beside the hop
count, before any of the steps.

### Time

Every edge carries `year_from` and `year_to`, which is what makes "what did
this network look like in 2014?" a filter rather than a separate dataset.

The slider filters on the client rather than refetching per year. Edges already
carry their years, the whole neighbourhood is in memory, and a round trip per
step of a slider is both slower and jerkier than the thing it replaces.

Two decisions. **An edge with no dates survives every window**, because the
archive not knowing when a relation ran is not evidence that it had ended. And
an Indian financial year spans two calendar years, so `2016-17` yields the
window 2016 to 2017; collapsing it to 2016 would make a grant vanish from half
the period it actually covers.

## 9. Claims

**`claims`** is where interpretation lives.

```
statement        neutral prose, the assertion in one sentence
claim_type       funding | control | coordination | influence | affiliation |
                 conflict_of_interest | outcome_attribution | misconduct | other
subject / object optional entity references, so a claim can be drawn as an edge
status           evidence status
asserted_by      the party making the claim (entity ref, or a name)
asserted_on      when they made it
rationale        required for `inferred`
```

A claim of status `alleged` without an asserter is rejected by a check
constraint. You cannot record "it is alleged that…" without recording who
alleges it.

**`claim_responses`** carries rebuttals: the respondent, their response, the
date, and a source. Section 25 requires responses where available; a table for
them is how they stop being optional in practice.

When the graph draws a claim as an edge it renders it differently from a
`relationships` edge, always labelled with its status and its asserter. An
interpretive edge that cannot say who asserts it cannot be drawn.

## 10. Activities and outcomes

`campaigns`, `publications`, `legal_cases`, `projects` — each dated, each
citable, each joinable to organisations and people.

**`outcomes`** records what happened, attached to the thing it happened to: a
project delayed, a policy changed, a court ruling, a regulatory action, a
government response, `no_documented_outcome`, or `disputed`.

**An outcome is never attached to a campaign.** "Campaign X caused outcome Y"
is `outcome_attribution`, a claim type, with an asserter and a status. The
timeline will happily show a campaign in 2016 and a cancellation in 2018 and
let the reader see the sequence. The database will not say one produced the
other unless a source does, and then it will say which source.

## 10a. Structure, and why it is only ever a description

`src/lib/funding/analysis.ts` answers three questions about the drawn network,
and only about the drawn network.

- **Bridges** are articulation points: entities whose removal would leave named
  groups with no recorded relationship path to each other. The result carries
  those groups, so the finding is checkable against the diagram by eye.
- **Convergences** are entities that more than one shortest chain from the root
  reaches, reported with the last entity on each route.
- **Separate groups** is the count of connected components, which stops a
  reader taking one canvas for one network.

Every result is recomputed from the current view and nothing is stored. A shape
that outlived the view it described would become an assertion.

The vocabulary is deliberately flat. "Holds two groups together", not "network
bridge": the second sounds like a role somebody plays, the first describes a
picture. Each section carries the caveat that a bridge in a diagram of forty
relationships is a bridge in what has been recorded so far, and can stop being
one the moment somebody files a source.

Bridges are drawn with a second ring rather than a colour, because a colour
would read as a status, and this is not one.

## 10b. The investigation workspace

Notes, flags and pinned positions, stored in the browser and nowhere else
(`src/lib/funding/investigation.ts`).

**The graph has no write path into the archive, and an investigation must not
become one.** A note is a researcher's own reasoning: unreviewed, uncited, and
frequently wrong on the way to being right. Stored beside the record it would
eventually be read as part of it. Keeping it local also means no account is
needed to start work, and a half-formed investigation about named organisations
never leaves the machine it was typed on.

The cost is stated in the interface: it does not follow you to another browser,
and clearing site data clears it. Carrying an investigation between devices
needs a table, an owner, and a decision about who may read it. That is a
different piece of work and should be taken deliberately.

Read through `useSyncExternalStore`, not mirrored into component state: the
browser store is exactly what that hook is for, writes never leave a stale
copy, and two tabs on one investigation stay in step for free.

## 11. Overlap is a query

Section 11 asks for network overlap; section 25 forbids inferring coordination
from it. The resolution: **overlap is computed on read and never stored.**

`sharedConnections(a, b)` returns shared donors, board members, lawyers,
addresses, parent bodies, programmes and campaign partners, each with the
evidence behind both sides. The result is labelled "documented overlap" in the
one component that renders it, and there is no table, column or edge type in
which the word "coordination" can be written.

## 12. Provenance and verification

Every row in this layer carries `entered_on`, `entered_by`, `retrieved_on`
(when the source was fetched), `verified_on` and `verified_by`.

**`verifications`** is an append-only log: who checked what, when, by what
method, and with what result — `confirmed`, `could_not_confirm`, or
`contradicted`. A `contradicted` verification does not delete the row; it
lowers its status and stays on the record.

Combined with `revisions`, this answers section 18's question directly: what did
the archive hold in 2018, in 2024, and today, and who changed it when.

## 13. What we know and what we do not

**`open_questions`** is a first-class table, not a rendering of missing joins:
a question, the entity it concerns, why it matters, and what would answer it.

Every entity page carries both sections. The absence of evidence is displayed
as the absence of evidence, never as an implication. This follows the rule the
rest of the archive already runs on: never assert an absence in generated
prose, read the counts out instead.

## 14. Analytics, and the score that will not be built

Dashboards for totals, funding by year, by donor country, by sector, by
organisation type, concentration, shared donors, board overlap, campaign
frequency and geographic activity.

**No composite influence score.** Section 21 rules it out and the reasoning is
worth keeping: a single number stating "87% foreign influence" would be an
inference presented as a measurement, and every safeguard above exists to stop
exactly that. Any index added later must publish its inputs, its weights and
its failure modes on the same page as its output.

## 14a. Ingest, and why it inserts directly

`scripts/load-funding-inbox.ts` loads seven optional sheets from `data/inbox`
on every build (formats in `docs/DATA_FORMAT.md`, a gathering prompt in
`docs/RESEARCH_PROMPT_FUNDING.md`).

Rows insert directly, the way indicator values do, rather than staging as
revisions. The reasoning, stated so it can be argued with: there is no public
contribution form for this layer, so the only way a row arrives is this
loader, run by whoever curates the sheets — the same person who would be
approving their own rows in a queue. Review earns its keep when proposer and
reviewer are different people. **When public contribution forms for this layer
exist, they must go through revisions like everything else**; the revision
enum already carries the entity types, and approval currently refuses them by
name so nothing can arrive half-built.

What the loader enforces, per row, skipping loudly and repairing nothing:

- at least one citation, with optional page notes (`FS1|Schedule 2 row 14`);
- evidence status `verified` or `documented` only — the other three are
  claims, and a CSV column cannot carry an asserter or a rationale;
- `verified` requires a primary-tier source kind;
- amounts are plain numbers carrying their ISO currency, financial years are
  the Indian filing form and must be internally consistent;
- people require `public_role_basis`;
- relationship kinds outside the factual enum are refused, and the message
  says why when the kind smells like an accusation;
- inserts are idempotent and rows are never updated in place.

## 15. Build order

| Phase | Deliverable | Status |
| --- | --- | --- |
| 1 | Architecture, schema, migrations, evidence vocabulary | **done** |
| A | Graph data model: text entity ids, edge/node views, traversal primitives | **done** |
| B | The interactive graph itself | **done** |
| C | Click to expand | **done** |
| D | Edge evidence panels | **done** |
| E | Path finder | **done** |
| F | Common connections, as documented overlap | **done** |
| G | Timeline-aware graph | **done** |
| H | Structure: bridges, convergence, separate groups | **done** |
| I | Investigation workspace, in the browser | **done** |
| J | Natural-language graph search | next |
| K | Pattern detection, as research leads and never as findings | |
| L | Large-dataset optimisation | |
| — | Ingest: CSV sheets, loader, validation | **done** — see the note on review below |
| — | Entity pages: /network/org/[slug] and /network/person/[slug], with the not-held section | **done** |
| — | Map and analytics | |

Each phase ships behind the existing review flow, so nothing reaches the public
record unapproved.

## 16. Standing rules for this layer

1. No derived relationship is ever written to the database.
2. No claim of status `alleged` exists without a named asserter.
3. No entity is merged; matches are recorded, not resolved by deletion.
4. Amounts and stated purposes are recorded verbatim from the source.
5. "Foreign" is a recorded determination, never computed from a country code.
6. Outcomes attach to what they happened to, not to who is said to have caused them.
7. Overlap is computed, labelled and never stored.
8. Every material claim renders its source next to it, with a page reference.
9. Responses and rebuttals are recorded wherever they exist.
10. No composite score without published inputs, weights and failure modes.
