# Electoral bonds: findings

Measured 3 September 2026 against `data/final.csv`, checksum in MANIFEST.csv.
Defects are stated, not repaired. Nothing in the delivered files was modified.

## What this does to the network

Current funding graph: 31 nodes, 29 edges, 3 components, **one independent
cycle**. A forest, which is why `bridges()` was flagging a third of entities as
structurally load-bearing and `convergences()` could find almost nothing.

This dataset holds:

| | |
| --- | --- |
| Matched purchaser-to-party rows | **20,551** |
| Distinct purchasers (become orgs) | **1,317** |
| Distinct recipient parties | **24** |
| Total recorded value | ₹12,769 crore |
| Encashment date range | 2019-04-12 to 2024-01-24 |

Two things follow, and the second matters more than the first.

**The sparsity problem ends.** Twenty thousand edges across thirteen hundred
entities is not a forest. The structure panel's threshold from
`NETWORK_DESIGN_DIRECTIONS.md` §4a should start passing on its own, which was the
condition set for revisiting that document.

**The funding layer connects to the political layer.** Every one of the 24
recipients is a political party, and parties are already first-class entities in
Abhilekh with their own pages, colours and election results. This is the first
dataset that puts an edge between the two halves of the archive. Until now the
funding graph and the political record have been separate worlds.

Top recipients by value: BJP ₹6,061 cr, AITC ₹1,610 cr, INC ₹1,422 cr, BRS
₹1,215 cr, BJD ₹776 cr, DMK ₹639 cr.

## Transcription defects, catalogued

**1. 1,680 rows carry no purchaser name at all**, worth about ₹623 crore. This is
the largest single defect and it is not a rounding error: it would present as the
third-largest "purchaser" in the archive if loaded naively. These rows must load
with an explicitly absent purchaser and an `open_questions` entry, or not load at
all. They must never aggregate into an unnamed node.

**2. Twenty-two names have all spaces stripped.** `QWIKSUPPLYCHAINPRIVATELIMITED`,
`ABHINANDANSTOCKBROKINGPVTLTD`, `PRIMUSGLOBALTECHNOLOGIESPVTLTD` and nineteen
others. A PDF text-extraction artifact.

**3. Two names are split mid-word:** `MEGHA ENGINEERING AND INFRASTRUCTURES LI
MITED` and `WESTERN UP POWER TRANSMISSION COMPANY LI MITED`. Note that Megha is
the second-largest purchaser at ₹821 crore, so this defect sits on a
high-visibility row.

**4. Fourteen groups of names collapse to one normalised form**, for example
`AVEES TRADING & FINANCE PVT LTD` against `AVEES TRADING FINANCE PVT LTD`, and
`RANISATI MERCANTILES PVT LTD` against `RANISATI MERCANTILES PVT. LTD.`

**5. 130 of 20,551 encashment dates do not parse** under any of three attempted
formats.

**6. Amounts are formatted with Indian digit grouping** inside quoted fields
(`"10,00,000"`). Parse deliberately; do not assume Western grouping.

## The identity problem this creates, and the rule that already covers it

Defects 2, 3 and 4 are all the same problem: the same company appears under
several strings. The temptation is a normalisation pass that strips punctuation
and whitespace and unifies.

**That is the merge the archive has refused four times already**, most recently on
the 283 TCPD party labels. The rule holds here and the stakes are higher, because
merging two companies that are not the same company creates a false funding
relationship, which is the exact harm the funding layer's safeguards exist to
prevent.

Load verbatim. Emit the collision groups as `entity_match_candidates`. Let a human
resolve them, or let them stay unresolved, which is an honest state.

## Cross-transcription check

Both repositories transcribe the same ECI purchaser table and both yield exactly
18,871 rows. Distinct names: 1,317 against 1,320. Every sampled difference is
whitespace only.

Row-level extraction is therefore sound. The divergence is entirely in entity-name
handling, which confirms that normalisation is the open question and that no
transcriber has answered it authoritatively.

## What is deliberately not here

Denominations analysis, bond-number chains, branch codes, and anything derived.
The purchaser-party-amount-date edge is the payload; everything else stays in the
raw artifact.

## Verification that has not happened

No row here has been compared against an ECI original by anyone. Before this data
appears anywhere public, a sample of perhaps fifty rows should be checked against
the ECI PDFs, weighted toward the largest transactions, since those are the rows
most likely to be quoted and most damaging to get wrong.
