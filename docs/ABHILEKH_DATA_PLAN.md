# Abhilekh data plan

> **This file is a stub.** The data plan it is named for was referenced twice
> in briefs but has never existed in this repository: not on disk, not tracked
> or untracked, and not in git history on any branch. It was created here so
> the tier 3 gate below has somewhere to live and cannot be lost.
>
> When the real plan lands, fold this section into it and delete the rest of
> this file. Do not delete the gate.

## Tier 3 gate: no series with a changed definition, until breaks can be recorded

**Do not ingest NCRB, or any indicator whose publisher has revised the
definition between years, until the series-break table exists.**

### Why the gate exists

An indicator whose definition changed produces a series the archive cannot yet
describe honestly. The values line up in one column and one chart, and nothing
on screen says that 2015 and 2020 counted different things. NCRB revises what
counts as a cognizable crime and which offences fall under crimes against
women between report years; RBI has changed how GSDP at current prices is
computed.

Loading first and explaining later is not a neutral ordering. The reader draws
the line with their eye before the explanation arrives.

Making the definition citable, which the archive now does, records where a
definition came from. It does not record that a definition *changed*: an
indicator holds one methodology, so there is exactly one definition per series
and no way to say it was different in 2016.

### Where the gate is enforced

In code, not only here, because a note in a document rots:

- `DEFERRED_UNTIL_SERIES_BREAKS` in `src/lib/ingest/provenance.ts` names the
  held indicator ids.
- `scripts/load-inbox.ts` refuses a new indicator definition on that list and
  prints why, naming this gate.
- `src/lib/ingest/provenance.test.ts` asserts the set's contents, so lifting
  the gate is a visible edit to a test rather than a silent deletion.

The gate refuses **new** definitions. Indicators already in the archive
(`ipc-crime-rate`, `crimes-against-women-rate`) are deliberately not on the
list: this changes nothing already recorded.

### Lifting it

Build the series-break table, then remove the ids from
`DEFERRED_UNTIL_SERIES_BREAKS` and its test.

Design prior for whoever does it, recorded so the deferral does not lose its
reasoning:

- **A break annotates, it never blocks.** The archive records; it does not
  withhold. A series with a break is still published.
- **It must be impossible to render a line across a break without the break
  being visible.** That is the actual requirement, and it constrains the chart
  as much as the schema.
- Open design questions, deliberately not settled here: whether a break
  attaches to an indicator or to an indicator and state together, and how
  `/compare` behaves when a comparison spans one.
