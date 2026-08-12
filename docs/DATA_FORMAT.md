# Bulk data format

Fill these sheets (one Google Sheet with tabs named as below, or separate
CSV files) and hand them to the loader. Every data row must reference at
least one source; rows without one are rejected. Example rows are format
illustrations only; replace them and verify every fact against the cited
source before submitting.

## sources.csv

```csv
id,title,url,publisher,published_date
S1,Kerala Legislative Assembly: Chief Ministers since 1957,https://niyamasabha.nic.in/example,Kerala Legislature,
S2,"Statistical Report, Kerala Assembly Election 2021",https://eci.gov.in/example,Election Commission of India,2021-06-01
```

Other sheets reference these ids in their `sources` column, semicolon-
separated (`S1;S2`). One authoritative source may cover many rows.

## terms.csv

```csv
state,office,person,party,start_date,end_date,notes,sources
Kerala,cm,E. K. Nayanar,Communist Party of India (Marxist),1996-05-20,2001-05-13,,S1
Kerala,presidents_rule,,,1964-09-10,1967-03-06,,S1
India,pm,Atal Bihari Vajpayee,Bharatiya Janata Party,1998-03-19,2004-05-22,,S1
```

- `office`: `cm`, `governor`, `presidents_rule` (person/party empty), or for
  state = India: `pm`, `president`. Party optional for governors/presidents.
- Dates `YYYY-MM-DD`; empty `end_date` = still in office; write `1987` or
  `1987-03` if only the year/month is known.

## elections.csv

```csv
state,scope,election_date,total_seats,turnout_percent,assembly_number,sources
Kerala,assembly,2021-04-06,140,74.06,15,S2
India,lok_sabha,2019-04-11,543,67.4,17,S2
```

`scope` is `assembly` or `lok_sabha`.

## results.csv

```csv
state,election_date,party,seats_won,seats_contested,vote_share_percent,alliance
Kerala,2021-04-06,Communist Party of India (Marxist),62,77,25.38,LDF
```

Links to its election by `state` + `election_date`. Only `party` and
`seats_won` are mandatory.

## events.csv

```csv
state,year,event_date,type,title,description,sources
Kerala,2011,,corruption,Palmolein case verdict,"Neutral, sourced paragraph. Use ""alleged"" for anything not decided by a court.",S1
```

`type` is one of: `paper_leak`, `governance_failure`, `corruption`,
`policy_failure`, `communal_incident`, `infrastructure_failure`,
`cabinet_change`, `legislation`, `constitutional_amendment`,
`court_judgment`, `coalition_change`, `welfare_scheme`,
`infrastructure_project`, `natural_disaster`, `administrative_reform`,
`international_agreement`, `other`.

## indicators.csv (Development Lens definitions)

```csv
id,name,unit,category,methodology
literacy-rate,Literacy rate,%,Education,"Share of persons aged 7+ able to read and write, per Census / NSO surveys."
state-gdp,Gross State Domestic Product,₹ crore,Economy,"GSDP at current prices as published by MoSPI / state economic surveys."
```

## indicator_values.csv (Development Lens data)

```csv
indicator,state,year,value,source_title,source_url,reporting_period,reporting_org,notes,verified_on
literacy-rate,Kerala,2011,94.0,Census of India 2011,https://censusindia.gov.in/example,Census 2011,Office of the Registrar General,,2026-08-06
```

`reporting_org` (the organisation that published the number) and `notes`
(caveats: series breaks, definition changes) are optional.

- `indicator` references indicators.csv by id; `state` accepts names or codes.
- One row per indicator + state + year. Every row carries its own source and
  the date you verified it. These are presented as published, never scored.

## What happens next

The loader validates everything (dates, offices, enum values, source links,
duplicate series points), reports anything suspicious back, and files
political content as pending Import Bot drafts for review. Development Lens
rows are admin-curated and load directly with their inline sources.

## term_updates.csv (end an incumbency, or correct an end date)

```csv
state,office,start_date,new_end_date,notes,sources
West Bengal,cm,2011-05-20,2026-05-04,,S9
```

Matches the existing term by state + office + start_date. If the term is
live, a pending update revision is filed for review; if it is still an
unpublished imported draft, the draft itself is amended. Optional `sources`
ids are added to the term's citations; `notes` is appended.

## documents.csv (media archive, curated metadata)

```csv
type,title,publisher,published_on,language,official_url,archive_url,redistribution,page_count,state,party,notes
manifesto,Sankalp Patra 2024 (Lok Sabha),Bharatiya Janata Party,2024-04-14,en,https://example.org/manifesto.pdf,,permitted,,,Bharatiya Janata Party,
```

Loads directly rather than through the review queue: a title, publisher and
link carry little editorial judgment, and the methodology page states this
publicly. Deduplicated on `official_url`, so a sheet is safe to re-run.

- `type` is one of: `manifesto`, `press_conference`, `party_advertisement`,
  `campaign_speech`, `debate_transcript`, `election_symbol`,
  `candidate_affidavit`, `press_release`, `government_notification`,
  `gazette`, `cag_report`, `assembly_debate`, `parliamentary_debate`,
  `court_judgment`, `eci_order`, `delimitation_report`,
  `coalition_agreement`, `white_paper`, `budget_speech`, `economic_survey`,
  `five_year_plan`, `committee_report`, `other`.
- One of `official_url` or `archive_url` is required.
- `redistribution` is `permitted`, `link_only`, or blank for `unknown`. The
  archive serves its own copy only where redistribution is `permitted` AND an
  `archive_url` exists; otherwise it links to the issuer.
- `state` and `party` are optional anchors and accept the same names the other
  sheets do. A national gazette needs neither.
- `language` is an ISO 639-1 code, defaulting to `en`. Many documents are not
  in English and recording that matters for search.

## party_colors.csv (curated display metadata)

```csv
party_name,abbreviation,primary_hex,secondary_hex,primary_region,notes
Bharatiya Janata Party,BJP,#FF9933,,National,Standard Saffron
```

Standing configuration: applied on every deploy to parties matched by name
(or slug). Sets the map/legend color and the abbreviation. Rows for parties
not yet in the archive wait harmlessly and apply once data creates them.
Only `party_name` and `primary_hex` are used by the pipeline today;
`secondary_hex`, `primary_region`, and `notes` are documentation columns.

## Funding and Influence sheets

Seven optional sheets, loaded by `scripts/load-funding-inbox.ts` on every
build. Unlike terms and events these insert directly (there is no public
contribution form for this layer yet, so the sheet's curator and a queue's
reviewer would be the same person); every row still requires at least one
source, and the loader skips any row that fails a check, printing the reason.
Rows are never updated in place, with one additive exception: an org row whose
slug already exists fills only fields that are currently EMPTY (formation
date, website, location, registration) and attaches its citations. Name, kind
and summary never change this way; correcting those is a deliberate act, not a
side effect of loading a sheet.

Entity references: a bare value is an org slug (`ford-foundation`); people
must be prefixed (`person:jane-doe`); parties and states use their public ids
(`party:indian-national-congress`, `state:up`). Source refs may carry a page
note after a pipe: `FS1|Schedule 2 row 14;FS2`.

Evidence status may be `verified` or `documented` only. `verified` requires at
least one primary-tier source (an FCRA filing, judgment, audited statement,
regulatory or government record). `alleged`, `inferred` and `disputed` are
claims and cannot be bulk-loaded, because a CSV column cannot carry the
asserter or rationale a claim requires.

### funding_sources.csv

```csv
id,title,url,publisher,published_date,kind,is_official,is_primary
FS1,FCRA Annual Return FC-4 2021-22,https://fcraonline.nic.in/...,Ministry of Home Affairs,2022-12-01,fcra_filing,true,true
```

`kind` is one of the source kinds (`fcra_filing`, `regulatory_filing`,
`corporate_filing`, `audited_statement`, `annual_report`, `court_judgment`,
`grant_database`, `org_document`, `org_statement`, `parliamentary_record`,
`rti_response`, `news`, `research`, `social_media`, ...).

### funding_orgs.csv

```csv
slug,name,kind,legal_name,registration_number,registration_type,incorporated_on,dissolved_on,state,city,website,summary,parent,sources
example-foundation,Example Foundation,foundation,Example Foundation Trust,,trust deed,1995-04-12,,Maharashtra,Mumbai,,Neutral one-line description.,,FS1
```

`kind`: `ngo`, `trust`, `society`, `foundation`, `think_tank`, `advocacy`,
`media`, `research`, `company`, `government_body`, `political`,
`international`, `religious`, `professional_body`, `other`. `parent` is
another org slug, resolvable anywhere in the same sheet.

### funding_people.csv

```csv
slug,name,public_role_basis,birth_year,state,summary,sources
jane-doe,Jane Doe,"Trustee of Example NGO per the 2021-22 FCRA return.",,Kerala,,FS1
```

`public_role_basis` is required and must say why this person belongs in a
public archive. A person with no institutional role does not.

### funding_transactions.csv

```csv
donor,recipient,amount,currency,financial_year,date,funding_type,stated_purpose,programme,donor_country,reported_under_fcra,evidence_status,notes,sources
example-foundation,example-ngo,5000000,INR,2021-22,,grant,Coastal ecology research,Environment,US,true,verified,,FS1|Schedule 2 row 14
```

Amounts are plain numbers in the currency the source used (never converted,
never grouped); an amount requires its currency; `financial_year` is the
Indian filing form `2021-22`; `stated_purpose` is verbatim from the source;
`donor_country` is a two-letter ISO code; `reported_under_fcra` is
`true`/`false`/blank and is a recorded fact, never derived from the country.

### funding_board.csv

```csv
person,org,role,role_kind,start_date,end_date,evidence_status,sources
jane-doe,example-ngo,Trustee,trustee,2014-01-01,,documented,FS1
```

`role` is the source's own wording. `role_kind`: `founder`, `trustee`,
`director`, `board_member`, `chairperson`, `editor`, `chief_executive`,
`secretary`, `treasurer`, `advisor`, `employee`, `spokesperson`, `other`.

### funding_relationships.csv

```csv
kind,from,to,start_date,end_date,detail,amount,currency,evidence_status,sources
partnered_with,example-ngo,example-foundation,2016-01-01,,Joint coastal programme,,,documented,FS2
```

`kind` is one of the factual relations (`funded`, `founded`, `owns`,
`sits_on_board`, `employed_by`, `partnered_with`, `member_of`, `advised`,
`published`, `filed_case_against`, `targeted`, `successor_of`,
`campaigned_for`, `campaigned_against`, `campaigned_regarding`). There is no
`coordinated_with` or `controlled_by`; those are claims, and the loader will
tell you so.

### funding_fcra.csv

```csv
org,registration_number,status,granted_on,valid_until,action_on,action_kind,action_note,evidence_status,sources
example-ngo,083780001,active,2010-06-01,2026-06-01,,,,verified,FS1
```

`status`: `active`, `suspended`, `cancelled`, `expired`, `renewed`, `unknown`.
Any government action is recorded as the record states it, with its date.
`evidence_status` follows the same rule as every sheet: `verified` only with a
primary-tier source; blank means `documented`. An action known only from
reporting (the underlying order not retrieved) is `documented`, and the
`action_note` should say the order was not retrieved.

### funding_outcomes.csv

```csv
subject,kind,date,summary,evidence_status,sources
example-ngo,regulatory_action,2015-11-04,"Registration under the state Societies Act cancelled by the District Registrar, citing unfiled annual returns.",documented,FS3
```

`kind`: `project_delayed`, `project_cancelled`, `project_completed`,
`policy_changed`, `policy_withdrawn`, `investigation_initiated`,
`court_ruling`, `regulatory_action`, `government_response`,
`no_documented_outcome`, `disputed`. An outcome attaches to the thing it
happened to, never to whoever is said to have caused it: attribution is a
claim. Actions under laws other than the FCRA belong here, not in
`funding_fcra.csv`.

### funding_matches.csv

```csv
a,b,rationale
example-uk-entity,example-limited,"Agency statements name the first without identifying a legal entity; whether it is the second has not been established from the retrieved sources."
```

Two recorded entities that might be one body, stored as a `possible` match.
There is no merge: confirming or rejecting a match is a reviewer's decision,
recorded on the candidate, never a deletion. Both sides must already exist in
the archive; a suspicion about a body the archive does not hold belongs in an
org summary instead.
