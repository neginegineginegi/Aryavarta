# Rajya Sabha dataset: findings

Measured 3 September 2026 against the file in MANIFEST.csv. Nothing modified.

## What it fills

Inventory gap #2: "The Rajya Sabha is absent entirely. The Union record covers
PMs, Presidents, Lok Sabha, Governors, nothing on the upper house." This dataset
is every member of the upper house from March 1952 to 20 July 2022.

| | |
| --- | --- |
| Term-rows | 3,538 |
| Distinct members | 2,412, by a stable TCPD `ID` (RS00001 …) |
| Members with more than one term | 801 (maximum 7 terms, one person) |
| Coverage | 1952 to 2022 |
| Parties as labelled | 96 distinct labels |
| States as labelled | 49 distinct labels |
| `Reason_of_Vacation` | 8 values; Retirement, Resignation, Death lead; 267 empty |
| `Positions_Held` populated | 1,469 of 3,538 (committee memberships, offices, in free text) |

## The identity gift

TCPD assigns a **stable person ID across terms**. Dr. Manmohan Singh is one
`RS00002` across six rows. This is the first dataset to arrive with the identity
problem already solved upstream by the publisher, and it should be used as such:
ingest the TCPD ID as an external identifier on the person, never re-derive
identity from `Member_Name`, which carries inconsistent honorifics and orderings
("Singh, Dr. Manmohan").

This also gives a bridge. Many Rajya Sabha members were earlier CMs or later PMs,
and Abhilekh's exact-name person pages can now be matched against a
publisher-assigned identity through `entity_match_candidates`. Do not auto-link;
propose.

## Ten columns must not be ingested

The file carries personal data that the Rajya Sabha Who's Who publishes for
sitting members and that has no place in a governance archive:

    Father_Name (3,238 populated) · Mother_Name (1,404) · Date_of_Birth (3,236)
    Place_of_Birth (1,373) · Marital_Status (1,477) · Spouse_Name (3,190)
    Children (1,278) · Permanent_Address (3,509) · Present_Address (3,507)
    E-mail (1,337)

Home addresses and e-mail addresses of 3,500 people, living and dead, are not
what Abhilekh records, and holding them creates the exact exposure the still
undrafted privacy policy will have to answer for. **Exclude them at the loader,
not at render.** The raw artifact keeps them, checksummed and unedited, as the
provenance rules require; the database never receives them.

`Year_of_Birth` is a judgement call: it is biographical rather than
governance-related and I would exclude it in the same pass. `Gender_TCPD` is
TCPD's own derived field, present on every row; if kept, attribute it as theirs.

## Party labels need the dispositions machinery, not string matching

96 labels for far fewer parties. `Congress`, `INC` and `CONG(I)` are three labels
in the top four alone, and `CONG(I)` is era-specific in the same way `SP` was for
D1/D2. The windowed `PARTY_RESOLUTIONS.csv` format built for the elections
ingest applies here directly. No auto-merge.

## Two era-sensitive facts

**`Type` is a snapshot as of 20 July 2022.** "Current" means current on that
date. It must be recorded with that date, never displayed as present-tense.

**`End_Date_Term` versus `End_Date_Actual`.** The first is the scheduled end,
the second is when the seat was actually vacated, empty on 237 rows. The gap
between them is where resignations and deaths live, and `Reason_of_Vacation`
explains it. All three columns are recorded facts and all three should load; the
scheduled end is not a lesser fact than the actual one.

## Coverage boundary

Ends 20 July 2022. Members elected after that date are absent. State it wherever
these rows surface.

## Licence

Identical in shape to D3: non-commercial, citation required, no endorsement. The
CC BY-SA conflict already recorded applies, and option (a), a separate TCPD-terms
artifact, resolves it the same way.
