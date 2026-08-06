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
