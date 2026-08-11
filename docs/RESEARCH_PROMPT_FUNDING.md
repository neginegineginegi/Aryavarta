# Research prompt: funding and influence records

A copy-paste prompt for Perplexity (or any sourced-answer engine) that returns
rows `scripts/load-funding-inbox.ts` accepts as-is. Sheet formats:
`docs/DATA_FORMAT.md`, "Funding and Influence sheets".

**Work one organisation per query.** Ask for an organisation's whole file —
identity, FCRA registration, donors, board — in one batch, so every sheet's
rows share slugs and sources. A query for "NGOs funded by X" returns thin rows
across many organisations; a query for one organisation returns rows you can
actually check.

Where the public record is richest, in order: FCRA annual returns (FC-4) and
the FCRA registration list on fcraonline.nic.in; MCA filings for companies and
Section 8 entities; audited statements and annual reports the organisation
itself publishes; grant databases (Foundation Directory, 990-PF filings for US
donors). Journalism is for `documented` rows only.

---

## The prompt

Replace the bracketed line, then paste everything between the rules.

---

You are compiling rows for a sourced public archive of institutional funding
in India. Accuracy and provenance matter more than coverage: a short answer
where every row is verifiable beats a long one where some rows are not.

**Organisation for this query: [Example Foundation, FCRA reg. no. if known]**

Return up to five fenced CSV code blocks, using exactly these headers, and no
other commentary. Omit any block you have no rows for.

### Block 1 — funding_sources.csv

```csv
id,title,url,publisher,published_date,kind,is_official,is_primary
FS1,FCRA Annual Return FC-4 2021-22,https://...,Ministry of Home Affairs,2022-12-01,fcra_filing,true,true
```

- `kind` is exactly one of: fcra_filing, regulatory_filing, corporate_filing,
  audited_statement, annual_report, court_judgment, grant_database,
  org_document, org_statement, parliamentary_record, rti_response, news,
  research.
- Wrap any title containing a comma in double quotes.
- URLs must begin with http and must resolve. Never invent a
  plausible-looking government URL. If a filing exists but has no stable URL
  (fcraonline.nic.in query pages often do not), cite the organisation's own
  posted copy or the registry landing page and say in the title what to search
  for. If you cannot produce a working link, drop the source and every row
  that depended on it.

### Block 2 — funding_orgs.csv

```csv
slug,name,kind,legal_name,registration_number,registration_type,incorporated_on,dissolved_on,state,city,website,summary,parent,sources
```

- `slug`: lowercase letters, digits and hyphens; the same slug everywhere the
  organisation appears in this answer. Include a row for the subject AND for
  every donor or recipient organisation named in block 4.
- `kind`: ngo, trust, society, foundation, think_tank, advocacy, media,
  research, company, government_body, political, international, religious,
  professional_body, other.
- `state` is the full state name or its two-letter code; leave blank if the
  source does not say. `summary` is one neutral sentence, no adjectives of
  scale or importance.

### Block 3 — funding_people.csv

```csv
slug,name,public_role_basis,birth_year,state,summary,sources
```

- Only people in institutional roles: trustees, directors, editors, officers.
- `public_role_basis` is required: one sentence saying which role, per which
  document ("Trustee of X per the 2021-22 FC-4 return"). No basis, no row.

### Block 4 — funding_transactions.csv

```csv
donor,recipient,amount,currency,financial_year,date,funding_type,stated_purpose,programme,donor_country,reported_under_fcra,evidence_status,notes,sources
```

- `donor` and `recipient` are slugs from block 2 (prefix people `person:`).
- `amount` is a plain number, no commas, no lakh/crore words, in the currency
  the source states; an amount requires its `currency` (ISO code).
- `financial_year` is the Indian form `2021-22`. Leave `date` blank unless the
  source gives a day.
- `stated_purpose` is VERBATIM from the filing, never your paraphrase.
- `funding_type`: grant, donation, csr, government_grant, contract,
  membership, subscription, advertising, investment, loan, in_kind, other.
- `reported_under_fcra` is true only if this receipt appears in an FCRA
  return; never infer it from the donor's country.
- `evidence_status` is `verified` only when the cited source is the filing
  itself (fcra_filing, audited_statement, regulatory_filing, corporate
  filing, court_judgment); otherwise `documented`.
- One row per donor per financial year as the source itemises it. Do not sum
  years together and do not split a filed total into guesses.

### Block 5 — funding_board.csv and funding_fcra.csv

```csv
person,org,role,role_kind,start_date,end_date,evidence_status,sources
```

```csv
org,registration_number,status,granted_on,valid_until,action_on,action_kind,action_note,sources
```

- `role` is the source's own wording. `role_kind`: founder, trustee,
  director, board_member, chairperson, editor, chief_executive, secretary,
  treasurer, advisor, employee, spokesperson, other.
- FCRA `status`: active, suspended, cancelled, expired, renewed, unknown. Any
  government action is recorded exactly as the record states it, with its
  date and the document that says so.

### Rules that reject rows

1. Every row cites at least one source id from block 1; a row with no source
   is dropped by the loader.
2. Do not record coordination, control, influence, or acting on anyone's
   behalf anywhere in these sheets. Those are claims; the loader refuses
   them. Record only what a document states: a payment, a position, a
   registration, a partnership.
3. Figures come from the source, not memory. If a return gives a total and a
   breakdown, record the breakdown; if only a total, record the total and say
   so in `notes`.
4. Never assert an absence ("received no foreign funding") — leave it
   unrecorded.
5. If two sources disagree on a figure, record the filing's figure and put
   the discrepancy in `notes` with the second source cited.
6. An empty block is a valid answer and better than a padded one.

### Check before answering

1. Every slug in blocks 3-5 has a row in block 2 or 3.
2. Every `sources` id exists in block 1 and its URL was actually seen.
3. Every amount is a plain number with an ISO currency.
4. Every financial year looks like 2021-22.
5. Every `verified` row cites a filing, not reporting.
6. Every field containing a comma is wrapped in double quotes.

---

## What to do with the answer

1. Save each block into `data/inbox/` under its sheet name, renumbering
   source ids so they do not collide with ones already in the file (append in
   the file's existing line endings).
2. Run `pnpm tsx scripts/load-funding-inbox.ts` locally and read the skip
   list: every skip is a row that did not load, with the reason. Fix and
   re-run; the loader is idempotent.
3. **Open every cited URL yourself before committing.** The loader validates
   shape, not truth; the prompt is a research aid, not a verification step. A
   dead or wrong citation is worse than no row.
4. Commit the sheets; the next build loads them and the network lights up.
