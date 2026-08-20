# Network layer: design directions at low density

Companion to `FUNDING_INFLUENCE_ARCHITECTURE.md`. That document sets out what
the layer records and refuses to record. This one addresses a narrower
question: what the interface should show while the graph is still small.

Written August 2026, against 30 orgs, 14 people, 24 funding transactions, 20
board positions and 9 FCRA registrations. Section 6 states when to revisit it.

---

## 1. The measurement

Built from `data/inbox/funding_transactions.csv` and `funding_board.csv`,
treating every recorded relation as undirected:

| | |
| --- | --- |
| Nodes | 31 |
| Edges | 29 |
| Components | 3 |
| Mean degree | 1.87 |
| Nodes at degree 1 | 21, or 68% |
| Independent cycles | **1** |
| Articulation points | 9, or 29% |

Independent cycles is edges minus nodes plus components. One. The graph is
three trees and a single extra edge.

Reproduce it before trusting it. If the number has moved, the conclusions below
move with it.

> Reproduced 20 August 2026 by `scripts/dev/measure-network-density.ts`, which
> exists so this table never has to be taken on trust again. Every graph figure
> above matched. The source-row counts in the header did not: the CSVs hold 29
> organisations, 13 people, 19 board positions and 8 FCRA registrations, one
> fewer than stated in each case, which is the shape of a header row counted as
> data. Transactions are 24 as stated. None of it changes the measurement, since
> the graph is built from the parsed rows.

## 2. What follows from a forest

Three consequences, and none of them is a defect in the code.

**A force layout has nothing to resolve.** Force-directed simulation earns its
cost by settling tension between edges that pull against each other, which is
how clusters emerge from a dense graph. A forest has no such tension. The
simulation spreads the nodes apart and stops, and the arrangement carries no
information the node list did not already carry.

**`convergences()` is nearly always empty.** It reports entities reached by more
than one shortest chain from the root. That requires alternative routes, which
requires cycles. With one cycle in the entire graph there are at most a couple
of nodes it can ever name.

**`bridges()` is true and vacuous.** In a tree, every internal node is an
articulation point by definition. Flagging 29% of entities as structurally
load-bearing says nothing about those entities; it restates that the data is
sparse. `analysis.ts` already warns that a bridge in a diagram of forty
relationships is not a bridge in the world. At this density it is not even a
bridge in the diagram.

None of this argues for changing `analysis.ts`. The functions are correct. They
are answering questions the data cannot yet support.

## 3. The principle

**Where topology carries no information, sequence and absence still do.**

A sparse graph is a poor picture of structure and a perfectly good record of
events in order, and of holes. Both are recorded facts. Neither needs density
to be legible. The four directions below follow from that and nothing else.

## 4. Directions

### 4a. The structure panel declines when too sparse

Smallest change here, largest gain in honesty.

`StructurePanel` should refuse to report bridges or convergences when the
loaded neighbourhood cannot support them, and say why, in the voice the rest of
the layer already uses for absence.

The threshold should be argued from independent cycle count rather than from
node count, because cycles are the property both findings actually depend on. A
hundred-node forest is exactly as unable to produce a meaningful bridge as a
ten-node one. Whoever implements this should propose a number and defend it.

This is the same rule the analytics design applies to charts: a panel that
cannot say anything true should say that, rather than say something trivially
true in a confident typeface.

> **Implemented.** `MIN_CYCLES_FOR_STRUCTURE = 3`, in `src/lib/funding/analysis.ts`,
> where the argument for the number is written out beside it. In short: at zero
> cycles the finding is provably identical to "has more than one relationship";
> at one or two, the cycle structure is small enough that a reader derives the
> answer by looking rather than being told it. Three is a floor, and the
> boundary between two and three is a judgement rather than a theorem. It errs
> toward silence on purpose.
>
> Below the threshold the panel prints the count of entities, relationships and
> loops, says why neither finding can mean anything at that shape, and says the
> findings return as sources are added. The bridge highlight ring is cleared
> from the canvas at the same time, so the drawing and the panel agree.
> "Separate groups" is unaffected: it is true at any density.

### 4b. Sequence view

Every edge already carries `startOn`, `endOn`, `yearFrom` and `yearTo`. A
chronological ordering of one entity's recorded relationships shows what a
forest layout structurally cannot: that a grant preceded a board seat, that a
publication preceded a legal case, that two relations began in the same quarter.

The safeguard is the same one the layer applies everywhere, and it needs to be
explicit here because temporal adjacency reads as causation more readily than
almost anything else an interface can show. **Order is recorded. Consequence is
not.** The view states sequence and stops, exactly as an edge label states the
relation and stops.

Undated edges get their own group. They are not sorted to the end as though
they were oldest, and no date is inferred for them. An undated relation is not
evidence of a relation that had no date, which is the same rule
`TraversalOptions` already applies when it keeps undated edges inside every year
window.

A peer of the graph, not a replacement for it.

### 4c. Shareable view state

`investigation.ts` keeps notes, pins and flags in the browser and argues the
case well: a note is a researcher's own reasoning, unreviewed and uncited, and
storing it beside the record would eventually see it read as part of the record.
That reasoning holds and nothing here disturbs it.

View state is a different object. Root, depth, year window, which nodes are
expanded, whether claims are shown: none of it carries reasoning, none of it is
a claim about anything, and all of it is reconstructible from the archive. Put
it in the URL.

The gap this closes is larger than it sounds. An investigative tool whose
findings cannot be sent to anyone is a tool for one person. A researcher who
writes something up needs to point at the view that supports it, and currently
there is nothing to point at.

If an implementation finds a case where view state starts carrying researcher
reasoning, that is the line, and it should be raised rather than crossed.

### 4d. Aggregate flow view

Twenty-four transactions between named organisations is below the density where
an entity-level picture reads. The same twenty-four aggregated between
organisation kinds is legible immediately, because aggregation is what buys
legibility when n is small.

Use `ORG_KIND_LABELS`. Keep every constraint from the analytics design:
per-currency only and never summed across currencies, counts alongside amounts,
n stated on the view rather than in a footnote.

## 5. What not to build

- **Not a canvas rebuild.** The layout is not the problem and reworking it will
  not produce information the data does not contain.
- **No inferred dates**, including "circa" or a range derived from neighbouring
  edges.
- **No proximity-in-time treated as relatedness.** Two grants in the same month
  are two grants in the same month.
- **No clustering or community detection.** Those need density even more than
  bridges do, and their output invites a reading about groups that the data
  cannot support.
- **No sparsity-hiding layouts.** Making a forest look like a network is worse
  than showing a forest.

## 6. When to revisit

At roughly ten times the current edge count the canvas starts doing real work,
and 4a's threshold begins passing on its own rather than declining. FCRA
ingest at any scale reaches that on its own, since there are roughly 16,000
registered associations against the 9 held here.

Re-run the section 1 measurement after each bulk ingest. The moment independent
cycles reach double figures, this document needs revisiting, and the structure
panel's threshold is the first thing to check.

> `pnpm tsx scripts/dev/measure-network-density.ts` prints the section 1 table
> and says which of those two readings currently applies.
