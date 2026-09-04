# Rajya Sabha ingest: specification

Written 2026-09-03 on the elections-spec model. TCPD-RSD v1.30: every
member of the Rajya Sabha from March 1952 to 20 July 2022 — 3,538
term-rows, 2,412 members under a stable publisher-assigned ID. Fills
inventory gap #2 (the upper house was absent entirely).

**Sequencing, binding:** this front queues behind the electoral-bonds gate
and the TCPD production reconciliation, and no fourth front opens before
those two close. Stages 0–1 run read-only. The insert stage was authorised
and built 2026-09-03 (rulings recorded in docs/GAPS.md); it runs only by
the user, per docs/PRODUCTION_RUNBOOK.md, behind the verified-restore
marker and --confirm.

## 1. Acquisition and provenance

`data/raw/tcpd-rs/` holds MANIFEST.csv (sha256 + bytes), TERMS.md (the
codebook's terms captured verbatim), FINDINGS.md (the delivered record),
and `data/`: the release CSV (kind `rs_members`) and the codebook PDF
(kind `doc`, verified, never parsed). Source: TCPD's public repository,
v1.30, commit 5a11ff1e (2022-09-14), cloned 2026-09-03.

Licence is identical in shape to D3: **non-commercial, citation required,
no endorsement** (TERMS.md carries the two required citation strings
verbatim). The recorded CC BY-SA conflict applies, and gate ruling
option (a) — a separate TCPD-terms artifact, never a mixed-licence file —
resolves it the same way. Nothing RS-derived ships in any export until
that artifact exists.

## 2. The contract, measured

36 columns; the header's first cell carries a UTF-8 BOM (`﻿ID`),
which the reader strips before the contract check. All dates are
`DD-MM-YYYY` (10,377 date values, zero other formats). Every figure in
FINDINGS.md re-verified: 3,538 rows; 2,412 IDs; 801 multi-term (max 7);
96 party labels; 49 state labels; `End_Date_Actual` empty on 237;
`Reason_of_Vacation` 8 values, 267 empty.

### 2.1 The ingested-column ALLOWLIST (binding)

The loader reads EXACTLY these 13 columns and is mechanically incapable
of reading any other — rows are constructed by iterating the allowlist,
so a new column in a future release cannot slip in; it can only appear in
the drift report:

    ID, Member_Name, Gender_TCPD, Start_Date, End_Date_Term,
    End_Date_Actual, Reason_of_Vacation, Party, State, Nominated,
    Term_No, Type, Source

### 2.2 Excluded columns (documented, never read)

**PII, excluded bindingly** — the raw artifact keeps them, checksummed
and unedited, as provenance requires; the database never receives them:

    Father_Name, Mother_Name, Date_of_Birth, Year_of_Birth,
    Place_of_Birth, Marital_Status, Spouse_Name, Children,
    Permanent_Address, Present_Address, E-mail

Also excluded, out of scope for the governance spine: `Gender` (the
Who's-Who biographical field; only TCPD's derived `Gender_TCPD` is
considered, and if kept it is attributed as TCPD-derived),
`Educational_Qualification`(+`_Buckets`), `Profession`, `Positions_Held`
(free text; a possible future pass), `Freedom_Fighter`,
`Books_Published`, `Other_Information`, `General` (a free-text
biographical blob that itself contains address fragments — PII-adjacent),
`Start_Date_Year`, `End_Date_Actual_Year` (derived year columns),
`Total_Terms` (derivable from the rows and snapshot-bound).

## 3. Identity

**The TCPD `ID` is the person's identity.** It is ingested as an external
identifier; identity is NEVER derived from `Member_Name`, which carries
inconsistent honorifics and orderings ("Singh, Dr. Manmohan"). A
multi-term member is one person with several term rows, exactly as the
terms table models multi-term CMs.

**Match candidates, never links.** RS members overlap with the archive's
person surface (former CMs, later PMs, funding-layer people rows).
Normalised-name collisions (honorifics stripped, "Last, First" reordered)
are PROPOSED as candidates — through `entity_match_candidates` at insert
time, and as a list at the stage-1 gate — and a human links them or
leaves them, which is an honest state.

## 4. Mapping

### 4.1 Proposed shape (stage-2 design, additive only — gate approves)

Two new tables (migration written only when the insert stage is built):
`rs_members` (id, `tcpd_rs_id` UNIQUE, `member_name` verbatim,
`gender_tcpd` nullable + a column-level attribution note) and `rs_terms`
(member FK, state_id nullable FK, `party_label` VERBATIM always +
`party_id` nullable resolved FK — an unresolved label loses nothing,
`start_date`, `end_date_term`, `end_date_actual`, `reason_of_vacation`,
`nominated`, `term_no`, `type_snapshot` + `snapshot_on = 2022-07-20`,
`source_note`). The label `O` (76 rows, 1952–2000, many states) is a
party-not-recorded marker, not an organisation: it stays UNRESOLVED
(party_id null, label kept) unless the gate rules otherwise.
Dataset row, provenance per member and term, citations against the
TCPD-RSD citation strings. Bulk-provenance path; the revision queue is
never used.

### 4.2 Term semantics (binding rulings)

- `End_Date_Term` (scheduled) AND `End_Date_Actual` (vacated) AND
  `Reason_of_Vacation` all load; the scheduled end is not a lesser fact.
  The gap between the two dates is where resignations and deaths live.
- `Type` is a snapshot **as of 2022-07-20** and carries that date;
  nothing renders it in the present tense.
- Coverage ends 2022-07-20; every surface these rows reach states it.
- **Three party labels state an ABSENCE, not a party** (ruled 2026-09-03;
  `RS_NO_PARTY_LABELS`). Each keeps its verbatim label on the term row
  with `party_id` null, and none appears in the dispositions file:
  - `"NOM."` — a nominated member with no recorded affiliation (all 134
    such rows carry `Nominated = TRUE`, verified).
  - `"O"` — party not recorded (76 rows, 1952–2000, many states).
  - `"Nominated"` — the same fact as NOM. spelled out (2 rows, both
    `Nominated = TRUE`, `State = Nominated`). Creating a party row named
    "Nominated" would have invented an organisation out of a marker.
  `State = "Nominated"` likewise → state null, the `nominated` flag
  carries the fact.

### 4.3 Parties (96 labels)

The windowed dispositions machinery applies unchanged:
`data/raw/tcpd-rs/PARTY_RESOLUTIONS.csv` (own file — label windows are
validated against RS term-years, separate from the elections file), no
auto-merge, every row human-approved at the gate. Measured warnings the
file must respect: the Congress-family labels OVERLAP in time (Congress
1952–96, INC 1952–2022, CONG(I) 1956–2000) — these are not clean eras,
and windows must not pretend otherwise; and some labels are anachronistic
(CONG(I) rows from 1956, BJP rows from 1962 — before either existed),
which is reported as a transcription-labelling fact, never repaired: the
insert records each as an open question against the party row.

**SP carries the elections boundary here too** (correction of 2026-09-03):
the label resolves to `samajwadi-party` only from 1993, the window
APPROVED 2026-08-30 for the elections files. One RS term starts
1992-07-05, three months before the party was founded, and is therefore
HELD. A held RS label-year does NOT drop its term row — the seat was
really held, only the attribution is unknown — so the term inserts with
`party_id` null, its verbatim label intact, and is named in the insert
report.

### 4.4 States (49 labels)

`data/raw/tcpd-rs/STATE_LINKS.csv` (label → state id, evidence), human-
approved at the gate. Modern labels map to existing ids; the historical
labels map to the first-class rows the D3 ruling created (madras, mysore,
bombay, hyderabad, pepsu, saurashtra, travancore-cochin, madhya-bharat,
vindhya-pradesh, bhopal). Reported as UNMATCHED for the gate: the RS
composite seats of 1952–56 ("Ajmer and Coorg", "Bilaspur and Himachal
Pradesh", "Manipur and Tripura") which are their own entities; "Kutch"
(the D3 ruling deliberately gave it no row — the gate may now revisit);
and "Others". "Nominated" is not a state (§4.2).

## 5. Reconciliation

No existing archive surface holds RS terms, so the first ingest has no
disagreement table; the reconciliation surfaces are internal: Term_No
must be consistent per member (strictly increasing), the NOM./Nominated
cross-check (§4.2), Type-vs-End_Date_Actual coherence (a "Current" row
should carry no actual end), and the coverage boundary. Future
cross-checks (Rajya Sabha's own member lists) are recorded as stage-3
work, not invented now.

## 6. Staged plan and gates

| Stage | What | Gate |
| --- | --- | --- |
| 0 | Verify drop (sha256, bytes, BOM-tolerant header contract, allowlist present) | Mismatch stops |
| 1 | Dry run: party mappings, state links, person-match candidates, the exact allowlist, era anomalies, internal coherence | **STOP: user approves all four lists** |
| 2 | Insert (built 2026-09-03; user-run per docs/PRODUCTION_RUNBOOK.md, ordered before bonds and TCPD) | Fresh verified restore drill (marker file) + --confirm; option (a) artifact for any export |
| 3 | Cross-check against Rajya Sabha official lists; extend coverage past 2022-07-20 only with a new dated drop | — |
