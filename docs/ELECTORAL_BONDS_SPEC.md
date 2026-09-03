# Electoral bonds ingest: specification

Written 2026-09-03, on the model of `ELECTIONS_INGEST_SPEC.md`: acquisition,
contract, mapping, identity, reconciliation, and a staged plan whose inserts
sit behind gates. The payload is the first dataset that puts edges between
the funding layer and the political record: 20,551 matched purchaser→party
electoral bond rows, ₹12,769 crore, 2019-04-12 to 2024-01-24.

## 1. Acquisition and provenance

### 1.1 The chain, stated plainly

    Election Commission of India (primary source: PDFs published 2024-03-21
    under Supreme Court direction, from SBI records)
        → community transcription, github.com/saisantoshv3/electoral_bonds,
          commit aa8b9e02 (2024-05-14), cloned 2026-09-03   ← what we hold
        → Abhilekh

**We hold a transcription, not the primary source.** Every ingested row
records the ECI as its source and the transcription as an intermediary
(repo URL + commit + clone date in the dataset row). `evidence_status` is
`documented`, **never** `verified`: no person at Abhilekh has compared any
row to an ECI original.

### 1.2 The drop

`data/raw/electoral-bonds/` holds `MANIFEST.csv` (sha256 + bytes per file),
`SOURCE.md`, `FINDINGS.md` (both committed as the delivered record), and
`data/`: `final.csv` (the payload, kind `eb_matched`), plus `purchased.csv`
and `encashed.csv` (kinds `eb_purchaser`, `eb_encashment`) which are held
for cross-checking and are **never parsed for insert**. Stage 0 verifies
all three byte-for-byte; the data blobs stay out of git per the raw-data
rule; manifest and documents are the committed record.

### 1.3 Corroboration and its limit (frontier charter §24)

A second, independent transcription (`apoorv74/electoral-bonds-sbi`,
`ed8b39be`) yields exactly the same 18,871 purchaser rows; distinct-name
counts differ only by whitespace. That corroborates row-level extraction —
and it is still ONE evidence lineage: both descend from the same ECI PDFs.
It never counts as independent support, and it is held, not ingested.

### 1.4 Licence

ECI disclosure data is a public record published under Supreme Court
direction; no non-commercial restriction is known (unlike TCPD). The
transcription repositories' licence files must be read before anything
derived from them ships in the bulk export — recorded as an open item in
`docs/API_DESIGN.md`'s licence section. Neither repository has been
contacted.

## 2. The contract, measured

### 2.1 Payload header (final.csv, verbatim — including the source's typo)

    date_of_encashment, political_party_name, prefix, bond_number, amount,
    pay_branch_code, reference_number_URN, journam_date, date_of_purchase,
    date_of_expiry, purchaser_name, issue_branch_code, status

`journam_date` is the source's own spelling and stays in the contract
verbatim; correcting it would be editing the record. Any header drift stops
stage 0 for a person to look.

### 2.2 Parsing rules

- **Amounts** use Indian digit grouping inside quotes (`"10,00,000"`).
  Parse by stripping commas from an all-digits-and-commas string; anything
  else is refused, never coerced. Empty is null, not zero.
- **Dates** are `DD/Mon/YYYY` (`01/Dec/2023`). Empty is absent; a non-empty
  string that does not match is refused and counted.
- Rows are read with the shared CSV parser; keys are matched
  case-insensitively (the parser lowercases headers).

### 2.3 The 130-row finding (beyond the delivered catalogue)

FINDINGS.md counts 130 unparseable encashment dates. Measured: all 130 are
EMPTY, and they are exactly the 130 rows with an empty party name, all with
`status = Expired`, all with a purchaser, none with an amount — and
20,551 − 130 = 20,421 = the encashment table's row count. These are bonds
purchased but never encashed. They are **not funding transactions** (no
recipient exists) and never load as such; they are counted, reported, and
covered by the dataset notes.

### 2.4 Defect ledger (loaded around, never repaired)

| # | Defect | Measured | Handling |
| --- | --- | --- | --- |
| 1 | Empty purchaser | 1,680 rows, ₹623 crore | **Not loaded** (§3.3), open_questions entry; never one unnamed node |
| 2 | Space-stripped names | ~22 (`QWIKSUPPLYCHAIN…`) | Load verbatim |
| 3 | Mid-word splits | 2 (`…LI MITED`), one is Megha Engineering at ₹821 cr | Load verbatim |
| 4 | Same collapsed form | 14 groups | Load verbatim + `entity_match_candidates` (§4.2) |
| 5 | Unparseable dates | 130, all empty, all on Expired rows | §2.3; report, never guess |
| 6 | Indian digit grouping | all amounts | §2.2 |

## 3. Mapping to the schema

### 3.1 Dataset row

One `datasets` row, slug `eci-electoral-bonds-2019-24`: publisher
"Election Commission of India (via community transcription)", upstream URL
the ECI disclosure page, version the transcription commit, retrieved-on
the clone date, licence "public record (ECI disclosure under Supreme Court
direction); transcription licence unverified". The notes carry: the
provenance chain; the §2.3 and §2.4 rulings; that `documented` is the
ceiling until sample verification (§6) happens.

### 3.2 Purchasers → orgs

Each distinct non-empty purchaser name becomes ONE `orgs` row, name
verbatim, slug deterministic, `kind = 'other'` — because the purchaser
table mixes companies with individual persons, and classifying by name
pattern is a guess. Whether the human-recognisable individuals should be
`people` rows instead is a **gate question** (§7), presented with a
measured count, not decided by the loader. Sources on each org: the ECI
disclosure citation.

### 3.3 Transactions → funding_transactions

One row per matched bond with a named purchaser and a linked party:
donor `org:<slug>`, recipient `party:<id>`, amount (INR), `occurred_on` =
encashment date, `funding_type = 'donation'`, `stated_purpose` null,
notes "electoral bond", `evidence_status = 'documented'`, `retrieved_on`
clone date. Provenance row per transaction (upstream id = URN + bond
prefix/number).

The schema requires a donor (`donor_id NOT NULL`) — which decides defect 1
the way the delivery allowed: **the 1,680 empty-purchaser rows are not
loaded.** A single pseudo-donor would fabricate the archive's
third-largest funder; 1,680 anonymous singleton nodes would fabricate
1,680 entities. Instead: an `open_questions` row records the count, the
value, and the per-party breakdown, and the dataset notes state that party
receipt totals computed from Abhilekh therefore UNDERCOUNT the ECI record
by exactly those amounts, per party, listed.

### 3.4 Party links

The 24 recipient names are ECI account/legal forms. They resolve to
EXISTING party rows only — never created, never string-matched — through
the committed file `data/raw/electoral-bonds/PARTY_LINKS.csv`
(`recipient_name,party_id,evidence`), every row human-approved at the
gate. **All 24 rows were approved as proposed at the gate, 2026-09-03**
(23 links; Goa Forward Party confirmed UNLINKED, its 17 rows held out). A name with no confident resolution keeps an empty `party_id` and
its rows are NOT loaded, reported with counts and value. Split-era caveats
(Shiv Sena 2022, NCP 2023, TRS→BRS 2022) are recorded in the evidence
column, not resolved by the loader.

## 4. Identity rules

### 4.1 No merges, again

Defects 2–4 are one problem: the same company under several strings. The
archive has refused the normalise-and-unify merge four times (most
recently the 283 TCPD labels), and the stakes are higher here: a wrong
merge fabricates a funding relationship. **Load verbatim.**

### 4.2 Merge candidates

At insert time, each of the 14 collapsed-form groups is written to
`entity_match_candidates` (status `possible`, rationale naming the
collapse rule and the delivered FINDINGS), one row per pair within a
group. A human resolves them, or they stay unresolved, which is an honest
state. The two mid-word splits are also emitted as candidates against
their plausible full forms **only where the full form exists in the data**;
otherwise they stay verbatim with no candidate, because inventing the
"correct" name is repair.

## 5. Reconciliation

- Cross-transcription: row counts against `purchased.csv` (18,871) and the
  independent repo (18,871) — corroboration within one lineage (§1.3).
- Internal: matched rows (20,421) must equal `encashed.csv`'s row count;
  Σ amounts per party recomputed and compared with FINDINGS.md's figures;
  any drift stops the gate.
- Against the archive: recipient parties must already exist; nothing else
  in the archive overlaps this dataset (first funding→political edges), so
  there is no disagreement surface yet. When party receipts are later
  published elsewhere (e.g. party audit reports), those become the
  reconciliation targets — recorded as future work, not invented now.

## 6. Verification that has not happened (stage 3)

No row has been compared to an ECI original. Before this data appears on
any public surface, a ~50-row sample weighted toward the largest
transactions must be checked against the ECI PDFs. This is stage 3, it has
its own open_questions entry from day one, and until it closes the dataset
notes and every rendering surface say "unverified transcription".

## 7. Staged plan and gates

| Stage | What | Gate |
| --- | --- | --- |
| 0 | Verify drop against MANIFEST (sha256, bytes, header contract) | Any mismatch stops |
| 1 | Dry run: full report — party-link proposals, collision groups, empty-purchaser breakdown, expired-130, insert preview, graph density before/after | **STOP: user approves the 24 links, the empty-purchaser handling, and the individuals-as-orgs ruling** |
| 2 | Insert: dataset row, orgs, transactions, provenance, citations, match candidates, open_questions (each with provenance); ANALYZE after | Verified backup restore (marker file) + --confirm; user-run per docs/PRODUCTION_RUNBOOK.md; TCPD production reconciliation retains priority; main moves on user say-so |
| 3 | Sample verification vs ECI PDFs (~50 rows, value-weighted) | Closes the "unverified" caveat; until then it stays displayed |

Stage 2 was authorised and built 2026-09-03 (rulings recorded in
docs/GAPS.md: the committed legal-form suffix list decides org kind,
recipient_label stays verbatim, Goa Forward logged as a missing party).
The revision queue is never used for this dataset: 20,551 rows is not a
review queue (bulk-provenance path, like every bulk dataset).
