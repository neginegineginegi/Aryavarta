# Research prompt: events since Independence

A copy-paste prompt for Perplexity (or any sourced-answer engine) that returns
rows the loader can take as-is. The output drops into `data/inbox/events.csv`
and `data/inbox/sources.csv`; `scripts/load-inbox.ts` runs on every build and
files each row as a `pending_review` draft, so nothing reaches the public site
until a moderator approves it.

Two things make this worth being fussy about. The loader rejects a row on any
schema violation and reports it in the skip list, so a malformed batch is
silent work lost. And a row that loads but is subtly wrong is worse than one
that fails, because it arrives wearing a citation.

**Work one batch at a time.** One state, or one decade of union-level events,
per query. A single request for "all important events since 1947" returns
thin, unsourced summaries. Twenty focused requests return usable rows.

---

## The prompt

Everything between the rules is what you paste. Replace the bracketed line at
the top with your batch, and paste the "already recorded" list for that state
from the section below it.

---

You are compiling rows for a sourced public archive of Indian political
history. Accuracy and provenance matter more than coverage: a short answer
where every row is verifiable beats a long one where some rows are not.

**Batch for this query: [Uttar Pradesh, 1947 to 2026]**

Return exactly two fenced CSV code blocks and no other commentary.

### Block 1 — sources.csv

```csv
id,title,url,publisher,published_date
S1,The Gazette of India: Uttar Pradesh Reorganisation Act 2000,https://example.gov.in/...,Ministry of Law and Justice,2000-08-25
```

- `id` — S1, S2, S3 … unique within this batch.
- `title` — the document's own title, not a description of it. **Wrap it in
  double quotes if it contains a comma**, which most Act titles do (`"The Uttar
  Pradesh Reorganisation Act, 2000"`). An unquoted comma shifts every later
  field one place left, the year lands in the url column, the source is
  rejected, and every row citing it is dropped.
- `url` — must begin with `http://` or `https://`, and must resolve. Do not
  invent plausible-looking government URLs; if you cannot produce a working
  link, drop the source and every row that depended on it.
- `publisher` — the issuing body (Ministry of Law and Justice, Election
  Commission of India, Supreme Court of India, PIB, CAG, the newspaper).
- `published_date` — `YYYY-MM-DD`, or `YYYY-MM`, or `YYYY`, or blank. Never
  guess a day to fill the field.

Source preference, strongest first: the Gazette of India or a state gazette;
Election Commission statistical reports; judgments from the Supreme Court or a
High Court; CAG audit reports; Lok Sabha, Rajya Sabha or assembly records;
ministry and PIB releases; budget documents. Use news reporting only where no
official record exists, and then prefer contemporaneous reporting from an
established outlet over a later retrospective. Do not cite Wikipedia, blogs,
content farms, or aggregator pages; cite what they cite.

### Block 2 — events.csv

```csv
state,year,event_date,type,title,description,sources
Uttar Pradesh,2000,2000-11-09,administrative_reform,Bifurcation of Uttar Pradesh,"The Uttar Pradesh Reorganisation Act 2000 carved thirteen hill districts out of the state to form Uttaranchal, which took effect on 9 November 2000. Uttar Pradesh retained the remaining districts and the capital at Lucknow.",S1
```

| Column | Rule |
| --- | --- |
| `state` | **Exactly** one of the names listed under "Valid state names" below. Nothing else loads. Use `India` for anything union-level. |
| `year` | Integer, 1947 or later, not in the future. |
| `event_date` | `YYYY-MM-DD`, or `YYYY-MM` if only the month is known, or `YYYY`, or blank. **Its year must equal the `year` column.** Leave it blank rather than guessing. |
| `type` | Exactly one value from the list below. |
| `title` | 10 to 200 characters. A noun phrase naming the event, not a sentence and not a headline. |
| `description` | 40 to 8000 characters; aim for 40 to 90 words. Always wrap in double quotes; double any internal quote mark. |
| `sources` | One or more ids from block 1, semicolon-separated (`S1;S4`). A row with no source is rejected. |

`type` is one of, and nothing else:

```
paper_leak  governance_failure  corruption  policy_failure
communal_incident  infrastructure_failure  cabinet_change  legislation
constitutional_amendment  court_judgment  coalition_change  welfare_scheme
infrastructure_project  natural_disaster  administrative_reform
international_agreement  other
```

### How to write the description

- **State what happened, not what it meant.** Give the record: what was passed,
  ordered, signed, formed, dissolved, or found, on what date, by whom, with
  what stated scope. Context is welcome; a verdict on the event's significance
  is not.
- **Contextualisation, not causal attribution.** You may say a scheme launched
  in the same year an indicator moved. You may not say the scheme moved it.
- **No unattributed characterisation.** "Widely criticised", "landmark",
  "controversial", "historic" and "unprecedented" do not belong in a row
  unless you are quoting a named body and say so.
- **Anything not settled by a court is alleged.** Write "alleged", "accused",
  "the CAG report found", "the commission concluded" and name who concluded it.
  A conviction is a fact; a charge is a charge; a resignation is a resignation
  and not an admission.
- **Never assert an absence.** Do not write "no other state did this" or "the
  first of its kind" unless the cited source says exactly that.
- **Figures carry their unit and their year**, and come from the source, not
  from memory. If the source gives a range or a revised figure, say so.
- **Contested numbers stay contested.** Where official and independent counts
  differ (death tolls above all), give both with attribution rather than
  picking one.
- **British-era spellings follow the source; place names follow the date.**
  Bombay before 1995, Mumbai after; Madras before 1996, Chennai after.
- No em dashes. Plain prose, past tense, no rhetorical questions.

### What counts as important

Prefer events that changed the record of who governed, under what law, or with
what public money:

- statehood, reorganisation, bifurcation, merger, renaming
- President's Rule imposed or revoked, and Governor's Rule where it applies
- constitutional amendments and their state-level consequences
- Acts, ordinances and rules that changed how the state is administered
- Supreme Court and High Court judgments that bound a government
- CAG findings, commissions of inquiry, and their reported conclusions
- coalition collapses, defections, floor tests, mid-term changes of leader
- major welfare schemes and infrastructure projects at commissioning
- disasters, and the administrative response the record documents
- communal violence and its judicially or officially established findings

Skip anything you cannot source to a document. An empty batch is a valid
answer, and better than a padded one.

Do NOT return elections. Assembly and Lok Sabha polls, turnout, seat counts and
party performance live in a separate table fed directly from Election Commission
statistical reports, so an election row here duplicates data the archive already
holds. A specific incident during an election (a countermand, a re-poll ordered,
a result set aside by a court) is an event; the election itself is not.

### Do not duplicate

The archive already holds these rows for this state. Do not return them again,
and do not return a near-restatement under a different title. If you have a
materially better sourced version of one, return it and prefix the title with
`REVISED: ` so a human decides.

```
[paste the rows for this state from "Already recorded" below]
```

### Before you answer, check

1. Every `state` value appears verbatim in the valid list.
2. Every `type` value appears verbatim in the type list.
3. Every `event_date` year matches its `year`.
4. Every `sources` id exists in block 1.
5. Every URL starts with `http`, and you have actually seen the page.
6. Every description is at least 40 characters and wrapped in quotes.
7. Every field containing a comma is wrapped in quotes, in BOTH blocks. Count
   the commas in each source title before you write the line.
8. No row duplicates the already-recorded list, including under a reworded
   title for the same underlying event.
9. No row is an election.

---

## Valid state names

Use the name exactly. `India` is the union-level row; the loader accepts both
`India` and `India (Union)`.

```
India
Andaman and Nicobar Islands   Andhra Pradesh        Arunachal Pradesh
Assam                         Bihar                 Chandigarh
Chhattisgarh                  Dadra and Nagar Haveli
Dadra and Nagar Haveli and Daman and Diu            Daman and Diu
Delhi                         Goa                   Gujarat
Haryana                       Himachal Pradesh      Jammu and Kashmir
Jharkhand                     Karnataka             Kerala
Ladakh                        Lakshadweep           Madhya Pradesh
Maharashtra                   Manipur               Meghalaya
Mizoram                       Nagaland              Odisha
Puducherry                    Punjab                Rajasthan
Sikkim                        Tamil Nadu            Telangana
Tripura                       Uttar Pradesh         Uttarakhand
West Bengal
```

Two traps. `Dadra and Nagar Haveli and Daman and Diu` is the merged UT and
exists only from 26 January 2020; before that date use the two separate names.
`Telangana` exists only from 2 June 2014; before that the events belong to
`Andhra Pradesh`. Similarly `Ladakh` from 31 October 2019, and `Jammu and
Kashmir` as a UT from the same date.

## Already recorded

76 rows, as `state | year | title`. Paste the relevant slice into the prompt.

| State | Year | Title |
| --- | --- | --- |
| Andaman and Nicobar Islands | 1956 | Union Territory Status |
| Andhra Pradesh | 1953 | Formation of Andhra State |
| Andhra Pradesh | 1956 | Formation of United Andhra Pradesh |
| Andhra Pradesh | 1972 | Jai Andhra Movement |
| Andhra Pradesh | 2014 | Bifurcation of Andhra Pradesh |
| Arunachal Pradesh | 1987 | Statehood granted |
| Assam | 1972 | North Eastern Areas Reorganisation |
| Assam | 1985 | Assam Accord Signed |
| Bihar | 1974 | JP Movement |
| Bihar | 2000 | Bifurcation of Bihar |
| Chhattisgarh | 2000 | Formation of Chhattisgarh State |
| Dadra and Nagar Haveli and Daman and Diu | 2020 | Merger of UTs |
| Delhi | 1991 | National Capital Territory Act |
| Goa | 1961 | Annexation of Goa |
| Goa | 1987 | Goa Statehood |
| Gujarat | 1960 | Formation of Gujarat |
| Gujarat | 1965 | Death of Chief Minister Balwantrai Mehta |
| Gujarat | 1974 | Nav Nirman Movement and Resignation |
| Gujarat | 1979 | Machchhu Dam Failure |
| Gujarat | 2001 | Bhuj Earthquake |
| Gujarat | 2002 | Godhra Train Incident and Violence |
| Gujarat | 2022 | Record Assembly Mandate |
| Haryana | 1966 | Formation of Haryana |
| Himachal Pradesh | 1971 | Himachal Pradesh Statehood |
| India | 1947 | Independence of India |
| India | 1950 | Constitution of India comes into force |
| India | 1962 | Sino-Indian War |
| India | 1965 | India-Pakistan War of 1965 |
| India | 1971 | India-Pakistan War of 1971 |
| India | 1975 | Proclamation of Emergency |
| India | 1977 | Emergency revoked |
| India | 1984 | Operation Blue Star |
| India | 1991 | Economic liberalisation begins |
| India | 2000 | Three new states created |
| India | 2017 | Goods and Services Tax introduced |
| India | 2020 | COVID-19 pandemic and nationwide lockdown |
| Jammu and Kashmir | 1947 | Instrument of Accession |
| Jammu and Kashmir | 1954 | Article 35A Promulgated |
| Jammu and Kashmir | 1965 | Change of Designations |
| Jammu and Kashmir | 1987 | Disputed Assembly Elections |
| Jammu and Kashmir | 1990 | Imposition of Governor Rule |
| Jammu and Kashmir | 2019 | Reorganisation Act 2019 |
| Jharkhand | 2000 | Formation of Jharkhand State |
| Karnataka | 1956 | Reorganisation of Mysore State |
| Karnataka | 1973 | Renaming to Karnataka |
| Kerala | 1956 | Formation of Kerala State |
| Kerala | 1959 | Dismissal of Communist Government |
| Ladakh | 2019 | Formation of Ladakh UT |
| Lakshadweep | 1956 | Union Territory Status |
| Lakshadweep | 1973 | Renaming to Lakshadweep |
| Madhya Pradesh | 1956 | State Reorganisation |
| Madhya Pradesh | 2000 | Bifurcation of Madhya Pradesh |
| Maharashtra | 1960 | Formation of Maharashtra |
| Maharashtra | 1992 | Bombay Riots |
| Manipur | 1972 | Statehood Granted |
| Meghalaya | 1972 | Meghalaya Statehood |
| Mizoram | 1987 | Mizoram Statehood |
| Nagaland | 1963 | Formation of Nagaland State |
| Odisha | 1999 | Super Cyclone Odisha |
| Puducherry | 1954 | De Facto Transfer of Puducherry |
| Puducherry | 1962 | Formal Transfer of Power |
| Puducherry | 2006 | Renaming to Puducherry |
| Punjab | 1966 | Trifurcation of Punjab |
| Rajasthan | 1956 | Final Integration |
| Sikkim | 1975 | Sikkim Joined India |
| Tamil Nadu | 1956 | States Reorganisation Act |
| Tamil Nadu | 1965 | Anti-Hindi Agitations |
| Tamil Nadu | 1969 | Renaming to Tamil Nadu |
| Telangana | 2014 | Formation of Telangana State |
| Tripura | 1972 | Statehood Granted |
| Uttar Pradesh | 1950 | Renaming of United Provinces |
| Uttar Pradesh | 1992 | Demolition of Babri Masjid |
| Uttar Pradesh | 2000 | Bifurcation of Uttar Pradesh |
| Uttarakhand | 2000 | Formation of Uttaranchal |
| West Bengal | 1977 | Left Front Takes Power |
| West Bengal | 2011 | Historic Political Transition |

## What to do with the answer

1. Append block 1 to `data/inbox/sources.csv`, renumbering the ids so they do
   not collide with ids already in the file.
2. Append block 2 to `data/inbox/events.csv`, with the same renumbering applied
   to its `sources` column.
3. **Match the file's existing line endings when you append.** These files do
   not all use the same ones, and appending the wrong kind rewrites every line
   in the diff.
4. Run the loader and read the skip list. Every skip is a row that did not
   load, with the reason. Fix and re-run; the loader is idempotent and will not
   double-insert.
5. Rows land as `pending_review`. Open the moderation queue and check each one
   against its cited source before approving. The prompt above is a research
   aid, not a verification step.

## Suggested batching

Roughly 40 queries covers the archive:

- One per state and UT, 1947 to date (37 queries).
- Union-level split by decade: 1947–59, 1960s, 1970s, 1980s, 1990s, 2000s,
  2010s, 2020s (8 queries), because a single union query returns only the
  famous dozen.
- Then targeted sweeps for what the first pass will have missed: President's
  Rule impositions by state, CAG reports laid before an assembly, commissions
  of inquiry and their reports, and High Court judgments that bound a state
  government.
