<!--
=====================================================================
PROVENANCE NOTE, added at packaging on 21 August 2026.
The body below is the maintainer's frontier charter, reproduced
verbatim as authored, with ONE clearly marked scope note inserted at
section 26. Read this as a charter to be mapped against the
repository, not as a description of what is already built. Where this
document and the repository disagree, the repository wins. Assessment
turns produce docs/FRONTIER_ASSESSMENT.md and change nothing else.
=====================================================================
-->

ABHILEKH — FRONTIER MODE

You are working directly inside the existing Abhilekh codebase.

Do NOT treat this as a normal website redesign, feature backlog, dashboard project, or CRUD application.

You are being asked to help evolve Abhilekh from an already substantial political-history archive into something that pushes the frontier of what a computational historical archive can be.

The current repository has already gone through approximately 147 commits, from an empty repository to a deployed production system.

You must inspect the actual codebase, schema, routes, components, data model, migrations, existing documentation, and recent commits before proposing or implementing anything.

Do not assume that the summary below is more authoritative than the repository itself. Verify it.

## 1. WHAT ALREADY EXISTS

Abhilekh is an evidence-backed archive of Indian political and institutional history.

The existing system includes:

* Next.js 16 App Router
* Drizzle + PostgreSQL / Neon
* Auth.js v5
* Google authentication
* admin bootstrap
* citation-backed facts
* revisions table
* proposed edits
* reviewer approval/rejection
* full diff views
* moderation queue
* contribution flow
* reports/disputes
* full-text search
* methodology and editorial pages

The Atlas layer includes:

* interactive India map
* historical year slider from 1947 onward
* state/UT governments
* election dashboards
* Union mode
* Prime Ministers
* Presidents
* Lok Sabha
* Compare mode
* leader/party/state pages
* Governors
* browse-by-everything
* insights engine

There is a data import architecture designed for large external datasets, including LokDhaba-scale CSVs, with explicit rules:

* never load huge source files in the browser
* never blindly assume schemas
* never silently transform ambiguous fields
* never destroy raw source data

Development data has already been introduced through Global Energy Monitor datasets, including:

* solar
* wind
* hydro
* nuclear
* gas
* coal
* geothermal
* bioenergy
* integrated power
* oil/NGL pipelines
* iron
* LNG

The funding/influence layer includes:

* organisations
* people
* funding transactions
* board positions
* FCRA registrations
* claims
* outcomes
* open questions
* evidence hierarchy
* network graph
* evidence panel
* path finder
* year window
* structural analysis
* entity records
* identity matching

The network canvas supports:

* organisations as nodes
* people appearing once even when connected to multiple organisations
* temporal filtering
* entity status indicators
* grouped network views
* sparse graph analysis

The provenance architecture includes:

* bulk ingestion
* revision ingestion
* dataset provenance
* bulk/reviewed/both/unrecorded states

Recent work has also covered:

* AUTH_DEV_LOGIN security hardening
* production build guards
* mobile accessibility
* safe-area handling
* svh/dvh
* reduced-motion support
* URL-persisted network state
* copyable network links
* sparse graph interpretation
* "In order" temporal views
* per-currency aggregation
* resting ribbon motion
* performance optimisation

The current deployed main commit is:

3617fa2

There is currently a dev branch with a newer ribbon-swell commit:

c10a24f

Do not blindly merge it. Inspect the state of the repository first.

## 2. THE FIRST PRINCIPLE

The obvious temptation is to make Abhilekh:

> Wikipedia + dashboards + graph database + AI chatbot.

Do NOT do that.

Those are relatively straightforward.

AI systems are already becoming good at:

* summarisation
* retrieval
* question answering
* entity extraction
* classification
* semantic search
* graph traversal
* comparison
* chart generation
* narrative generation

Abhilekh should not compete merely by doing those things better.

Instead:

BUILD A SYSTEM FOR THINGS THAT ARE DIFFICULT TO KNOW.

The fundamental question is not:

> "How can Abhilekh answer more questions?"

It is:

> "How can Abhilekh represent the structure of knowledge, uncertainty, disagreement, absence, identity, continuity, evidence and historical change more faithfully than ordinary databases, websites, Wikipedia-like systems, dashboards or LLMs?"

That is the frontier.

## 3. THINK BEYOND FEATURES

Before writing implementation code, investigate the existing system and reason about the conceptual model.

You should specifically investigate whether Abhilekh can represent the following:

A. Epistemic state

Not merely:

> Fact = X

but:

> What does the archive believe X to be, why, based on which evidence, and how strongly?

Distinguish things such as:

* directly documented
* derived from documented records
* inferred
* conflicting
* disputed
* unresolved
* partially documented
* not yet researched
* no qualifying record found

Do NOT collapse these into a fake numeric "confidence score".

The goal is not to manufacture certainty.

The goal is to represent uncertainty faithfully.

## 4. ABSENCE SHOULD BECOME DATA

One of the hardest problems in historical research is distinguishing:

> "It did not happen"

from

> "We have not found evidence that it happened."

Abhilekh should eventually understand this distinction structurally.

Investigate how to represent:

* missing records
* incomplete periods
* source gaps
* dataset coverage gaps
* periods where one source disappears
* entities with incomplete biographies
* years with sparse evidence
* geographic asymmetry
* historical blind spots

A blank space in the archive should not automatically mean zero.

It may mean: unknown. Or: not researched. Or: source unavailable. Or: evidence destroyed/unavailable. Or: genuinely no qualifying record.

These states should be distinguishable.

## 5. DISAGREEMENT SHOULD BE FIRST-CLASS

Do not force Abhilekh to choose a single historical truth when evidence genuinely conflicts.

Imagine:

Source A: Person X became Chief Minister on date A.

Source B: Person X became Chief Minister on date B.

The system should be capable of representing:

Claim A ↓ Evidence A

Claim B ↓ Evidence B

↓ Conflict

↓ Editorial status: Unresolved

The disagreement itself is historically meaningful.

Build toward an architecture where:

claims are objects

rather than merely text attached to records.

A claim should eventually be traceable to:

* source
* source version
* publication date
* event date
* extraction method
* transformation
* reviewer
* revision history
* competing claims
* current editorial status

## 6. TEMPORAL IDENTITY IS A FRONTIER PROBLEM

Do not assume an entity is static.

Organisations:

* change names
* merge
* split
* reincorporate
* change legal status
* create subsidiaries
* become successors
* cease operations

Political institutions:

* change boundaries
* change constitutional status
* change jurisdiction
* change names

People:

* hold different offices
* change political affiliations
* occupy overlapping institutional roles

Investigate how Abhilekh can represent:

> identity through time

rather than:

> entity + current name.

A person page should eventually be able to answer:

> Who was this entity at this point in history?

and:

> What institutional identity did it have before and after this transition?

Do not simply solve this with aliases.

Think in terms of temporal identity, succession and continuity.

## 7. INSTITUTIONAL MEMORY

Push the temporal model further.

A government is not merely:

> Chief Minister X, 2019–2024.

It is an institutional state.

What persists when leadership changes? What disappears? What gets renamed? What survives through administrative restructuring?

Can Abhilekh eventually reconstruct:

> the institutional lineage of an entity?

For example:

Institution A ↓ reorganised into B ↓ B renamed C ↓ C absorbed into D

while preserving the historical record.

This is more interesting than a conventional entity graph.

## 8. EVENT AS A FIRST-CLASS OBJECT

Investigate introducing a first-class temporal event model.

An event could connect:

Entity → Event → Date / period → Claim → Evidence → Consequence / related event

Examples:

* election
* appointment
* resignation
* government formation
* legislation
* court ruling
* policy announcement
* project announcement
* project commissioning
* organisational founding
* merger
* funding transaction
* infrastructure milestone

Do NOT assume that events are causally connected simply because they are sequential.

The system should be able to represent:

> A happened before B.

without claiming:

> A caused B.

This distinction is fundamental.

## 9. TEMPORAL RECONSTRUCTION

The existing year slider should evolve conceptually.

Investigate a historical replay system in which the archive can reconstruct the state of its recorded knowledge at a given point in time.

For example:

India — 1947 → 2026

As the user moves through time:

* governments change
* boundaries change
* leaders change
* elections occur
* organisations appear
* organisations disappear
* relationships form
* relationships dissolve
* development indicators change
* documented events appear

This should not be a video.

It should be a queryable temporal reconstruction of the archive.

The user should be able to pause at a point in time and inspect:

> What was known / recorded for this entity at this point?

## 10. THE TWO CORE VERBS

Explore whether the entire Abhilekh experience can eventually be organised around two fundamental questions:

WHAT CHANGED?

and

HOW IS IT CONNECTED?

"What changed?" is the temporal archive.

"How is it connected?" is the evidence/relationship graph.

Everything else should reinforce these two capabilities.

Do not force this into the UI if the codebase suggests a better abstraction. But investigate it seriously.

## 11. "WHAT CHANGED?" ENGINE

A user should eventually be able to select:

* a state
* a country
* an institution
* an organisation
* a person
* a party
* a government
* a sector

and two periods.

Example:

Telangana 2014 → 2024

The system could identify documented changes across:

Political

* governments
* leadership
* elections

Institutional

* organisations
* appointments
* restructurings

Development

* energy
* infrastructure
* other available datasets

Network

* new relationships
* dissolved relationships

Events

* major documented events

But critically:

DO NOT fabricate causal explanations.

The engine should distinguish:

* change
* sequence
* association
* correlation
* documented causal claim

These are not interchangeable.

## 12. "HOW IS IT CONNECTED?" ENGINE

The current graph/pathfinder should evolve into an evidence-aware investigative graph.

For two entities:

Entity A Entity B

Abhilekh should eventually be capable of showing:

Path 1 A → Person X → Organisation B

Path 2 A → Funding transaction → Organisation C → Person X → B

For every edge:

* evidence
* date
* source
* provenance
* relationship type
* validity period

The system must never convert:

> graph proximity

into:

> proof of influence.

Do not introduce a composite "influence score".

The architecture should explicitly resist this.

## 13. SOURCE INTELLIGENCE

Investigate treating sources themselves as entities.

A source should eventually have:

* publisher
* source type
* coverage period
* datasets
* methodology
* limitations
* versions
* archived references
* claims derived from it
* entities affected by it

This allows:

Source → Claims → Events → Entities → Datasets

The archive should eventually let researchers understand not only:

> "What does Abhilekh say?"

but:

> "Where does Abhilekh's knowledge come from?"

## 14. DATASET REGISTRY

Investigate a formal dataset registry.

Each dataset should be able to describe:

* source
* coverage
* version
* import date
* raw artifact
* checksum/hash where appropriate
* schema
* transformations
* validation
* provenance
* review status
* known limitations
* records affected

Example:

Global Energy Monitor — Solar / Coverage: 2000–2025 / Import: date / Source version: X / Raw artifact: X / Transformation: documented / Review: bulk imported / Status: active

This should become the foundation for scaling Abhilekh's data layer.

## 15. DATA INGESTION SHOULD BECOME A SYSTEM

The desired conceptual pipeline is:

SOURCE ↓ RAW ARTIFACT ↓ SCHEMA INSPECTION ↓ TRANSFORMATION ↓ VALIDATION ↓ IMPORT ↓ PROVENANCE ↓ REVIEW ↓ PUBLICATION

Do not silently mutate source data.

Do not throw away raw inputs.

Do not hide transformations.

Do not assume ambiguous fields.

Make ingestion reproducible.

If this architecture already exists partially, strengthen it rather than replacing it.

## 16. RESEARCH MODE

Investigate a second mode of Abhilekh:

EXPLORE — for ordinary users.

RESEARCH — for journalists, academics, students, policy researchers and investigators.

Research mode could eventually allow users to:

* select entities
* select years
* select datasets
* filter records
* compare periods
* trace relationships
* inspect evidence
* save an investigation
* create a reproducible query
* export structured results
* export citations
* preserve the exact filters used

The output should be reproducible.

Someone else should be able to open the same research link and reconstruct the same result.

## 17. TRACE

Investigate a unified "Trace" capability.

Instead of merely searching for an entity, allow the user to ask:

> How did this record get here?

For a number:

Dataset → raw record → transformation → database record → claim → displayed statistic

For a historical fact:

Source → extracted claim → reviewed revision → published record

For a relationship:

Source → relationship evidence → entity match → graph edge

This could become one of Abhilekh's most distinctive capabilities.

## 18. CONFLICT VIEW

Eventually a researcher should be able to see:

> Where does the archive disagree with itself?

Not because the system is broken.

Because reality and historical records are messy.

Investigate:

* conflicting dates
* conflicting names
* conflicting office tenures
* conflicting organisation identities
* conflicting statistics
* competing classifications

The system should surface unresolved conflicts rather than silently flatten them.

## 19. NEGATIVE KNOWLEDGE

Make the following distinction fundamental:

> No evidence found

is not equivalent to:

> Evidence that something did not happen.

Investigate an explicit archive-state model for this.

This is not merely UX.

It should influence:

* database semantics
* search
* analytics
* insights
* graph interpretation
* AI features
* methodology

## 20. DO NOT BUILD A GENERIC AI CHATBOT

Eventually an "Ask Abhilekh" interface may be useful.

But if built, it must be fundamentally different from a generic LLM chatbot.

A response should ideally contain:

ANSWER ↓ CALCULATION / DERIVATION ↓ UNDERLYING RECORDS ↓ EVIDENCE ↓ SOURCE ↓ METHODOLOGY ↓ CAVEATS

The user should be able to inspect how the answer was produced.

If the archive cannot support the answer:

say so.

Do not fill the gap with generated prose.

## 21. THE REAL FRONTIER

Now step back from everything above.

I want you to identify concepts that are even more ambitious.

Think beyond normal product thinking.

Ask:

What does a historical archive look like if uncertainty is native to the data model?

What does a political knowledge graph look like when identity changes through time?

What does an archive look like when disagreement between sources is preserved rather than resolved?

What happens when absence itself becomes measurable and explainable?

Can we model the difference between:

* chronology
* association
* correlation
* influence
* causation
* institutional continuity
* coincidence

without collapsing them?

Can we reconstruct multiple competing historical narratives from the same evidence graph without declaring one "the story"?

Can the system show where the historical record is structurally strong and where it is structurally weak?

Can we detect when apparent historical patterns are artifacts of data availability?

Can we model how the archive itself changes as new evidence arrives?

Can we answer:

> "What did Abhilekh believe about this event six months ago, and what evidence changed that?"

That last question is particularly important.

The archive should eventually have memory of its own epistemic evolution.

The system should not only preserve history.

It should preserve:

> the history of what the archive knew, when it knew it, and why its representation changed.

That is a substantially more difficult problem.

## 22. HISTORIOGRAPHIC VERSION CONTROL

Investigate whether revisions can eventually represent not merely:

> old value → new value

but:

> old interpretation → new interpretation

For example:

Version 1: "Organisation A funded Organisation B."

Version 2: "Organisation A provided a grant to Organisation B."

Version 3: "Source X documents a grant transaction between A and B in year Y."

The wording becomes more precise as evidence improves.

The system should preserve this evolution.

## 23. EPISTEMIC TIME VS HISTORICAL TIME

This is another frontier worth investigating.

There are actually two timelines:

Historical time — When something happened.

Epistemic time — When Abhilekh learned / recorded / revised something.

These are not the same.

An event may have happened in 1987.

A source documenting it may have been published in 2001.

Abhilekh may have ingested it in 2026.

A reviewer may have corrected the record in 2027.

Those are four different dates.

Do not collapse them.

Investigate whether the underlying data model can support both.

## 24. SOURCE DEPENDENCY

Another difficult problem:

Ten websites may repeat the same claim.

That does not necessarily mean there are ten independent sources.

They may all derive from one original report.

Investigate whether Abhilekh can eventually distinguish:

10 citations

from

1 underlying evidence lineage reproduced 10 times.

This could become a powerful source-intelligence feature.

The archive should eventually be able to answer:

> How independently supported is this claim?

WITHOUT reducing it to a simplistic confidence score.

## 25. HISTORICAL BLIND SPOTS

Investigate whether the system can identify:

* years with unusually low evidence
* regions with poor source coverage
* entities with incomplete records
* datasets that systematically omit categories
* periods where source availability changes
* sudden increases in records caused by digitisation rather than real-world activity

This is crucial.

Otherwise the archive may accidentally mistake:

> better documentation

for:

> more historical activity.

## 26. COUNTERFACTUALS — VERY CAREFULLY

[SCOPE NOTE, added at packaging on 21 August 2026: This section is OUT OF
SCOPE for all assessment and build work. Constrained counterfactuals ask the
archive to reason about what would have differed, which is interpretation,
the thing every other rule in this charter refuses. The boundary between
known and unknowable is worth mapping; hypotheticals are not the instrument
for mapping it. This section is preserved for the record and must not appear
in candidate directions.]

Do not build a fantasy prediction engine.

But investigate whether Abhilekh can eventually support constrained counterfactual research.

For example:

> "If Government X had remained in office, what documented institutional conditions would differ?"

The system should NOT answer with speculation.

Instead it might say:

* these variables would have remained different under the hypothetical assumption
* these relationships are directly documented
* these consequences are not known
* no evidence exists to determine X

The purpose is to expose the boundary between:

known

and

unknowable from the archive.

That boundary itself is valuable.

## 27. THE ARCHIVE SHOULD KNOW ITS OWN LIMITATIONS

Eventually Abhilekh should be able to describe:

> What can I answer reliably?

and:

> What can I not answer?

For example:

"Political office history: high coverage."

"Funding relationships: partial coverage."

"Historical NGO funding before 2005: poor coverage."

"Local-government records: incomplete."

This is much more useful than pretending the database is comprehensive.

## 28. WHAT I WANT FROM YOU

Do NOT immediately start coding.

First perform a deep audit of the repository.

Inspect:

* database schema
* migrations
* data model
* routes
* components
* existing APIs
* import pipelines
* provenance implementation
* revision model
* graph model
* temporal model
* search
* entity identity
* current insights engine
* existing documentation
* recent commits
* current production assumptions

Then produce a short internal architecture assessment.

Specifically answer:

1. What conceptual primitives already exist?
2. Which of the frontier concepts above can already be expressed?
3. Which require schema changes?
4. Which require new infrastructure?
5. Which can be implemented purely at the UI/product layer?
6. Where is the current architecture likely to break at scale?
7. What concepts are currently being conflated?
8. What should become first-class objects?
9. What should explicitly NOT become first-class objects?
10. What is the smallest architectural change that unlocks the largest future capability?

## 29. DO NOT DESTROY WHAT ALREADY WORKS

This is extremely important.

The existing editorial principles are features, not obstacles.

Preserve:

* citations
* provenance
* raw source preservation
* revision history
* reviewer workflow
* evidence hierarchy
* identity separation
* uncertainty
* no composite influence score
* no silent transformations
* no invented dates
* no invented relationships
* no fabricated causal claims
* explicit "not held" information

Do not sacrifice epistemic integrity for a flashy interface.

## 30. IMPLEMENTATION PHILOSOPHY

After the audit, identify the highest-leverage frontier capabilities.

Do not create a giant theoretical rewrite.

Instead:

Phase 1 — Epistemic foundation

Strengthen the underlying representation of:

* claims
* evidence
* conflicts
* uncertainty
* source lineage
* temporal identity
* event relationships

Phase 2 — Temporal intelligence

Build:

* event model
* "What changed?"
* historical replay
* temporal network
* historical vs epistemic time

Phase 3 — Investigative graph

Build:

* Trace
* evidence-aware paths
* temporal relationships
* source dependency
* institutional lineage

Phase 4 — Research environment

Build:

* Research Mode
* reproducible queries
* saved investigations
* citation exports
* dataset registry

Phase 5 — Frontier interface

Only after the foundations are sound, create the interfaces that make these concepts understandable.

Do not build UI metaphors that the data model cannot support.

## 31. DESIGN DIRECTION

Abhilekh should not look like:

* a government portal
* a Wikipedia clone
* a SaaS dashboard
* an AI chatbot
* a generic data visualisation platform

It should feel like:

> an instrument for interrogating history.

The interface should communicate:

* depth
* evidence
* time
* uncertainty
* relationships
* discovery

The existing "living field" motion language can continue, but motion should remain subordinate to information.

Avoid unnecessary animation.

Avoid dashboard clutter.

Avoid decorative complexity.

## 32. PERFORMANCE AND ACCESSIBILITY REMAIN NON-NEGOTIABLE

Any new feature must preserve:

* mobile usability
* keyboard accessibility
* reduced-motion behaviour
* safe-area handling
* reasonable performance on weak hardware
* URL-addressable state where appropriate
* graceful failure
* production build safety

Large datasets must never be dumped into the browser unnecessarily.

## 33. THE STANDARD FOR NEW FEATURES

Before implementing any feature, ask:

Does this help the user:

1. discover what changed?
2. understand how something is connected?
3. inspect why a claim exists?
4. understand uncertainty?
5. identify disagreement?
6. understand historical continuity?
7. understand the limits of the archive?
8. reproduce the result?

If the answer is no to all of these, it is probably not an Abhilekh feature.

## 34. THE ULTIMATE TEST

Imagine a researcher asks:

> "What happened here?"

A normal website gives them a paragraph.

A dashboard gives them charts.

An LLM gives them a plausible explanation.

Abhilekh should eventually give them:

Timeline / Entities / Events / Relationships / Claims / Evidence / Conflicts / Sources / Data lineage / Changes over time / Unknowns / What the archive cannot establish

And then let the researcher explore the underlying structure themselves.

That is the product.

## 35. IMPORTANT: BE CREATIVE

I am explicitly asking you to go beyond conventional product reasoning.

Do not stop at:

* dashboards
* filters
* search
* AI summaries
* chat
* recommendation systems
* generic graph visualisations
* CRUD features
* analytics

Those are relatively easy.

Think like:

* a historian
* an epistemologist
* a data architect
* an investigative journalist
* a graph theorist
* a digital archivist
* a systems designer

Ask what becomes possible when history, evidence, time, identity, uncertainty and relationships are represented computationally together.

I want at least 10 genuinely unconventional ideas that emerge from this thinking.

For each:

* explain the underlying problem
* explain why conventional databases/websites/LLMs struggle with it
* explain what Abhilekh could uniquely do
* explain what data model would be required
* explain whether it is technically feasible now
* explain what the smallest useful implementation would be

Do not force every idea into the product.

Some should be deliberately experimental.

## 36. THEN BUILD

After the conceptual audit and frontier exploration, identify the 3 highest-leverage capabilities that can realistically begin now without destabilising the existing system.

Then implement the first one.

Do not spend the entire turn writing a strategy document.

The goal is:

understand → identify frontier → architect → build

not:

understand → produce a giant backlog → stop.

For anything that requires substantial schema changes, make the changes carefully through proper migrations.

For anything that can be built without schema changes, prefer incremental implementation.

Use the existing design language.

Do not introduce unnecessary dependencies.

Do not rewrite working systems simply because a different architecture looks cleaner.

## 37. FINAL OUTPUT

When finished, report:

A. What you discovered — What the existing architecture already makes possible.

B. The frontier — The 10+ unconventional directions you identified.

C. The 3 highest-leverage directions — Why these three matter most.

D. What you actually implemented — Files changed, schema changes, routes, components, etc.

E. How it works — Explain the new capability from a user's perspective and from the data-model perspective.

F. What remains — Explicitly identify what is still impossible because the underlying data does not yet exist.

G. Verification — Run:

* tests
* type checks
* lint
* build
* relevant database checks
* relevant performance checks

Do not claim something works without verifying it.

FINAL PRINCIPLE

Do not make Abhilekh an AI that tells people what happened.

Build an archive that allows people to interrogate:

> what happened, what is documented, what is disputed, what is connected, what changed, what is missing, when the archive learned it, and how we know.

The frontier is not more information.

The frontier is computable epistemology for history.

Build toward that.
