# D3 findings: the real data vs the spec's assumptions

Measured 28 August 2026 against `early/TCPD_IED_1951-62.csv`, checksum in
MANIFEST.csv. `ELECTIONS_INGEST_SPEC.md` §2 labelled its column expectations as
knowledge-cutoff guesses because the container could not reach the source. Three
of them are wrong, and all three are wrong in Abhilekh's favour.

## Shape

| | |
| --- | --- |
| Candidate rows | 30,439 |
| Distinct elections | 82 (AE 26,971 rows, GE 3,468 rows) |
| Distinct `State_Name` | 32 |
| Elections yielding a party with ≥1 seat | 371 result rows |
| Result rows if zero-seat contesting parties included | 669 |
| Parties winning ≥1 seat per election | min 1, median 5, max 12 |

Header, verbatim:

    Election_Type, State_Name, Assembly_No, Constituency_No, Candidate, Gender,
    Party, Votes, Winner, Constituency_Name, Idx, Party_Type, Party_Expanded,
    NumberOfSeats, ElectorsTotal, ElectorsWhoVoted, VotesValid, PollingDate,
    Year, Runner up.PARTY, Runner up.CANDIDATE, Runner up.VOTES,
    Winner 1.PARTY/CANDIDATE/VOTES, Winner 2.*, Winner 3.*

`Winner` is the string `True` / `False`, not 1/0. One file holds both AE and GE;
`Election_Type` separates them.

## Correction 1 — A2 (dates) is largely dissolved

The spec assumed TCPD records years only, and designed `election_date_precision`
around that. **`PollingDate` exists and is populated on 96.4% of rows** (29,345
of 30,439), formatted `DD/MM/YY`. No election in this file has more than one
polling date.

So for D3, `election_date` is a recorded fact, not a fabrication. The precision
column is still needed, for the 3.6% without a date and possibly for D1/D2, but
it becomes the exception rather than the rule. **Do not discard the precision
work** — verify D1/D2 separately before assuming they match.

`DD/MM/YY` needs a century rule. All data is 1951–62, so `52` → 1952
unambiguously, but the rule must be explicit in the loader, not implied.

## Correction 2 — A3 (turnout) is dissolved entirely

The spec assumed only per-constituency percentages, which cannot honestly
aggregate, and therefore planned to store NULL turnout. **The file carries raw
counts: `ElectorsTotal`, `ElectorsWhoVoted`, `VotesValid`, populated on 100% of
rows.**

Summing electors and votes across a state's constituencies and dividing is
arithmetic on recorded values, not estimation. Turnout is honestly computable
for all 82 elections. Sample: Ajmer 1952 71.26%, Andhra Pradesh 1955 76.08%,
Assam 1952 60.69%, Assam 1957 56.15%.

Two rules for the loader. Aggregate from raw counts, never average the
percentages. Sum per unique `Constituency_No`, not per candidate row, or every
constituency is counted once per candidate.

## Correction 3 — multi-member constituencies exist, and break seat counts

Not anticipated by the spec. Until 1961 India used multi-member constituencies:

- 4,919 single-member
- **1,372 two-member**
- **2 three-member**

`NumberOfSeats` is a column: 1 on 19,923 rows, 2 on 10,491, 3 on 25.

Consequence: **`total_seats` must never be derived from a count of distinct
constituencies.** Ajmer 1952 has 24 constituencies and 27 seats won. Assam 1952
has 91 constituencies and 94. Any loader computing seats from constituency count
produces wrong totals for 22 of 82 elections, and the error is invisible because
the number looks plausible.

Derive `total_seats` by summing distinct `NumberOfSeats` per constituency, and
record the multi-member fact rather than flattening it.

## Correction 4 — the source contains its own spelling conflicts

`State_Name` holds three distinct entities under six spellings:

- `Odisha` (1,030) / `Orissa` (58) / `Orrisa` (57) — the third is a typo
- `Saurashtra` (20) / `Sourastra` (225)
- `Patiala_&_East_Punjab_States_Union_(PEPSU)` (653) /
  `Patiala_And_East_Punjab_States_Union` (31)

These must not be silently normalised in loader code. Handle them as an explicit
alias map committed as data, listed in the dry-run report, and approved at the
gate. A typo corrected invisibly is still a silent transformation.

## Correction 5 — the dead-states question is bigger than the spec assumed

14 of 32 state names are pre-1956 entities absent from the `states` table:

    Ajmer · Bhopal · Bilaspur · Bombay · Coorg · Hyderabad · Kutch ·
    Madhya_Bharat · Madras · Mysore · PEPSU · Saurashtra ·
    Travancore_Cochin · Vindhya_Pradesh

Together they carry 9,999 candidate rows, roughly a third of the file. This is
not an edge case to defer; it is a third of D3. The standing counsel holds:
create them as first-class historical state rows with no successor links
recorded, since mapping Madras onto Tamil Nadu would destroy the fact that those
elections were held by an entity that no longer exists.

Practical consequence for the atlas: these states have no geometry in the map
package. The map must be able to hold a state it cannot draw, and say so.

## What is deliberately still out of scope

Candidate rows, `Gender`, `Constituency_Name`, the `Runner up.*` and
`Winner N.*` derived columns, and `Party_Type`. The aggregate spine lands first.
Note that candidate names are present in this file, so the binding no-auto-merge
identity condition applies from the moment it is staged.

## Licence consequence, needs a decision

TCPD terms are **non-commercial use only**, with citation required and no
endorsement implied. Abhilekh publishes under CC BY-SA. TCPD-derived rows
therefore cannot ship under CC BY-SA in the planned bulk export. Either the
export excludes them, or it carries their terms separately and says so. This
must be resolved before the bulk download ships, not after.
