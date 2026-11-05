# Research prompt: funding and influence records (the network layer)

The data-retrieval format for `/network`. A copy-paste prompt for Perplexity
(or any sourced-answer engine, or a research assistant working by hand) that
returns rows `scripts/load-funding-inbox.ts` accepts as-is, plus the rules the
loader applies so a row is not written twice. Field-level reference:
`docs/DATA_FORMAT.md`, "Funding and Influence sheets". Architecture and the
reasons behind the rules: `docs/FUNDING_INFLUENCE_ARCHITECTURE.md`.

The loader reads **nine sheets** from `data/inbox/`. Every one is optional;
every row on every sheet needs at least one source; nothing is updated in
place except the additive org enrichment described under block 2.

| Sheet | Holds | One row is |
| --- | --- | --- |
| `funding_sources.csv` | the citation vocabulary | one document with a working URL |
| `funding_orgs.csv` | organisations | one legal or de-facto body |
| `funding_people.csv` | individuals in institutional roles | one person, with the role that puts them in a public archive |
| `funding_transactions.csv` | money moving | one donor → recipient amount in one financial year |
| `funding_board.csv` | positions | one person holding one role at one org |
| `funding_relationships.csv` | non-monetary factual links | one documented relation between two entities |
| `funding_fcra.csv` | FCRA registrations and actions on them | one registration, or one recorded government action |
| `funding_outcomes.csv` | what happened to a project, policy or body | one dated event attached to the thing it happened to |
| `funding_matches.csv` | two records that might be one body | one suspicion, for a reviewer, never a merge |

**Work one organisation per query.** Ask for an organisation's whole file —
identity, FCRA registration, donors, board, partnerships, actions against it —
in one batch, so every sheet's rows share slugs and sources. "NGOs funded by X"
returns thin rows across many organisations; "everything on record about X"
returns rows you can actually check.

Where the public record is richest, in order: FCRA annual returns (FC-4) and
the registration list on fcraonline.nic.in; MCA filings for companies and
Section 8 entities; audited statements and annual reports the organisation
itself publishes; court orders; grant databases (Foundation Directory, 990-PF
filings for US donors). Journalism supports `documented` rows only.

---

## The prompt

Replace the bracketed line, then paste everything between the rules.

---

You are compiling rows for a sourced public archive of institutional funding
and influence in India. Accuracy and provenance matter more than coverage: a
short answer where every row is verifiable beats a long one where some rows
are not. Record only what a document states. Never record coordination,
control, influence, intent, or acting on anyone's behalf: those are claims,
and this format cannot carry them.

**Organisation for this query: [Example Foundation, FCRA reg. no. if known]**

Return up to nine fenced CSV code blocks, using exactly these headers, and no
other commentary. Omit any block you have no rows for. An empty block is a
valid answer and better than a padded one.

### Block 1 — funding_sources.csv

```csv
id,title,url,publisher,published_date,kind,is_official,is_primary
FS1,FCRA Annual Return FC-4 2021-22,https://...,Ministry of Home Affairs,2022-12-01,fcra_filing,true,true
```

- `id` is `FS` + a number, unique within your answer.
- `kind` is exactly one of: gazette, eci_report, cag_report, court_judgment,
  assembly_record, budget_document, ministry_report, press_release, manifesto,
  news, research, rti_response, fcra_filing, regulatory_filing,
  corporate_filing, audited_statement, annual_report, grant_database,
  org_document, org_statement, parliamentary_record, social_media, other.
- `is_official`: true when a government body published it. `is_primary`: true
  when it is the record itself (a filing, an order, a return), false when it
  reports on one.
- `published_date` is `YYYY-MM-DD`; leave blank if the document carries none.
- Wrap any title containing a comma in double quotes.
- URLs must begin with `http` and must resolve. Never invent a plausible
  government URL. If a filing exists but has no stable URL (fcraonline.nic.in
  query pages often do not), cite the organisation's own posted copy or the
  registry landing page and say in the title what to search for. If you cannot
  produce a working link, drop the source and every row that depended on it.

### Block 2 — funding_orgs.csv

```csv
slug,name,kind,legal_name,registration_number,registration_type,incorporated_on,dissolved_on,state,city,website,summary,parent,sources,revise
example-foundation,Example Foundation,foundation,Example Foundation Trust,E-12345,trust deed,1995-04-12,,Maharashtra,Mumbai,https://...,Neutral one-line description.,,FS1,
```

- `slug`: lowercase letters, digits and hyphens, 2–80 characters, starting with
  a letter or digit; the same slug everywhere the organisation appears in this
  answer. Include a row for the subject AND for every organisation named
  anywhere in blocks 4–9.
- `kind`: ngo, trust, society, foundation, think_tank, advocacy, media,
  research, company, government_body, political, international, religious,
  professional_body, other, unclassified. Use `unclassified` when the sources
  give no legal form and you have not classified it; use `other` only when you
  looked and it fits no kind. Never guess a kind from the name alone.
- `registration_type` is the register, in words ("trust deed", "Societies
  Registration Act 1860", "Section 8 company", "FCRA").
- `state` is the full state name or its two-letter code; blank if the source
  does not say. `summary` is one neutral sentence, no adjectives of scale or
  importance. `parent` is another org slug from this block.
- **Leave `revise` empty.** An organisation already in the archive is enriched,
  not overwritten: empty fields take your values; name, kind and summary stay
  as recorded. `revise` is the curator's tool for deliberately changing those,
  with a stated reason, and is never filled by a research answer.

### Block 3 — funding_people.csv

```csv
slug,name,public_role_basis,birth_year,state,summary,sources
jane-doe,Jane Doe,"Trustee of Example Foundation per the 2021-22 FC-4 return.",,Kerala,,FS1
```

- Only people in institutional roles: trustees, directors, editors, officers,
  founders. Never private individuals, donors' family members, or anyone whose
  only connection is being named in a news story.
- `public_role_basis` is required: one sentence saying which role, per which
  document. No basis, no row.
- `birth_year` only if a cited document states it; otherwise blank.

### Block 4 — funding_transactions.csv

```csv
donor,recipient,amount,currency,financial_year,date,funding_type,stated_purpose,programme,donor_country,reported_under_fcra,evidence_status,notes,sources
example-foundation,example-ngo,5000000,INR,2021-22,,grant,Coastal ecology research,Environment,US,true,verified,,FS1|Schedule 2 row 14
```

- `donor` and `recipient` are entity references (see "Entity references"
  below): a bare slug is an organisation from block 2; a person is
  `person:slug`; a political party is `party:<archive id>`; a state government
  is `state:<two-letter code>`.
- `amount` is a plain non-negative number, no commas, no lakh/crore words, in
  the currency the source states; an amount requires its `currency` (ISO 4217,
  three upper-case letters). A known receipt with an unknown amount is
  recordable with `amount` blank.
- `financial_year` is the Indian form `2021-22` (the second part must be the
  following year). `date` is `YYYY-MM-DD` and is left blank unless the source
  gives a day. **Never write a date as `YYYY-MM` when it could be read as a
  financial year** (`2011-12`): the loader refuses it rather than guess.
- `funding_type`: grant, donation, csr, government_grant, contract, membership,
  subscription, advertising, investment, loan, in_kind, other.
- `stated_purpose` is VERBATIM from the filing, never your paraphrase.
  `programme` is the source's own programme or scheme name, if any.
- `donor_country` is a two-letter ISO code. `reported_under_fcra` is true only
  if this receipt appears in an FCRA return, false if a source shows it did
  not, blank otherwise; never infer it from the donor's country.
- One row per donor per financial year as the source itemises it. Do not sum
  years together and do not split a filed total into guesses.

### Block 5 — funding_board.csv

```csv
person,org,role,role_kind,start_date,end_date,evidence_status,sources
jane-doe,example-foundation,Trustee,trustee,2014-01-01,,documented,FS1
```

- `person` is a slug from block 3 (no prefix here); `org` is a slug from block 2.
- `role` is the source's own wording. `role_kind`: founder, trustee, director,
  board_member, chairperson, editor, chief_executive, secretary, treasurer,
  advisor, employee, spokesperson, other.
- Dates `YYYY-MM-DD`; `end_date` must not precede `start_date`; blank where
  the source gives none.

### Block 6 — funding_relationships.csv

```csv
kind,from,to,start_date,end_date,detail,amount,currency,evidence_status,sources
partnered_with,example-ngo,example-foundation,2016-01-01,,Joint coastal programme per the 2016 MoU,,,documented,FS2
```

- `kind` is one of the factual relations only: funded, founded, owns,
  sits_on_board, employed_by, partnered_with, member_of, advised, published,
  filed_case_against, targeted, successor_of, campaigned_for,
  campaigned_against, campaigned_regarding. There is no `coordinated_with`,
  `controlled_by` or `influenced`; those are claims and the loader refuses them.
- `from` and `to` are entity references (bare org slug, `person:`, `party:`,
  `state:`). `detail` is one sentence in the source's terms.
- Use block 4 for money with an amount and a financial year; use `funded` here
  only when a source states a funding relationship without itemising it.

### Block 7 — funding_fcra.csv

```csv
org,registration_number,status,granted_on,valid_until,action_on,action_kind,action_note,evidence_status,sources
example-ngo,083780001,active,2010-06-01,2026-06-01,,,,verified,FS1
example-ngo,083780001,suspended,,,2020-09-10,suspension,"Registration suspended for 180 days under s.13 FCRA; order not retrieved, known from the Ministry's press note.",documented,FS4
```

- `status`: active, suspended, cancelled, expired, renewed, unknown. Use
  `unknown` when a registration number is documented but its current status
  is not; never infer `active` from silence.
- One row for the registration itself; one further row per recorded
  government action, exactly as the record states it (`action_kind` in the
  record's own words: suspension, cancellation, renewal refused, show-cause,
  …), with its date. An action known only from reporting is `documented`, and
  `action_note` must say the underlying order was not retrieved.
- Actions under laws other than the FCRA (Societies Acts, the Income Tax Act,
  the PMLA) go in block 8, not here.

### Block 8 — funding_outcomes.csv

```csv
subject,kind,date,summary,evidence_status,sources
example-ngo,regulatory_action,2015-11-04,"Registration under the state Societies Act cancelled by the District Registrar, citing unfiled annual returns.",documented,FS3
```

- `subject` is the entity the outcome happened to (an org slug, `person:`,
  `party:` or `state:`), never whoever is said to have caused it: attribution
  is a claim.
- `kind`: project_delayed, project_cancelled, project_completed,
  policy_changed, policy_withdrawn, investigation_initiated, court_ruling,
  regulatory_action, government_response, no_documented_outcome, disputed.
- `summary` is one or two sentences stating what the document records, with
  the acting authority named as the document names it.

### Block 9 — funding_matches.csv

```csv
a,b,rationale
example-uk-entity,example-limited,"The 2019 agency statement names 'Example UK' without identifying a legal entity; whether it is Example Limited (CIN U12345MH2001PLC000000) has not been established from the retrieved sources."
```

- Two entities from block 2 (or `person:` slugs from block 3) that might be one
  body. The archive stores this as a possible match for a reviewer; it never
  merges. If you are certain they are the same body, there is no match row:
  use one slug throughout.

### Entity references

- A bare value is an organisation slug from block 2.
- `person:jane-doe` is a person from block 3.
- `party:indian-national-congress` is a political party by its archive id (the
  slug in the party's `/party/...` address). Use it for a party as donor,
  recipient or subject; do not create an org row for a party.
- `state:up` is a state government by two-letter code (`in` for the Union).
- Everything else, including a body you cannot place, gets an org row with
  `kind` `unclassified` rather than a reference the loader cannot resolve.

### Evidence status

- Only `verified` and `documented` can be bulk-loaded. `alleged`, `inferred`
  and `disputed` are claims that need an asserter or a rationale, which a CSV
  column cannot carry; if that is what the sources support, say so in a
  one-line note after the blocks and record nothing.
- `verified` requires at least one cited source of a primary-tier kind:
  gazette, ministry_report, eci_report, court_judgment, cag_report,
  regulatory_filing, budget_document, fcra_filing, audited_statement,
  annual_report, corporate_filing or org_document. Prefer to reserve
  `verified` for the filing or order itself; an annual report's own claim
  about itself is better left `documented`.
- `documented` is the default and what a blank cell means. Journalism, RTI
  responses, parliamentary records, research and organisational statements
  support `documented` rows only.

### Rules that reject rows

1. Every row cites at least one source id from block 1, `;`-separated, with
   an optional page note after a pipe (`FS1|Schedule 2 row 14;FS2`). A row
   with no source, or citing an id not in block 1, is dropped by the loader.
2. No coordination, control, influence, intent or acting-on-behalf anywhere
   in these sheets. Record a payment, a position, a registration, a
   partnership, a filed case, an order: documents, not conclusions.
3. Figures come from the source, not memory. If a return gives a total and a
   breakdown, record the breakdown; if only a total, record the total and say
   so in `notes`.
4. Never assert an absence ("received no foreign funding"): leave it
   unrecorded.
5. If two sources disagree on a figure, record the filing's figure and put the
   discrepancy in `notes` with the second source cited.
6. Every entity reference must resolve: every slug used in blocks 4–9 has a
   row in block 2 or 3, or is a `party:` / `state:` id that exists in the
   archive.

### Check before answering

1. Every slug in blocks 4–9 has a row in block 2 or 3.
2. Every `sources` id exists in block 1 and its URL was actually opened.
3. Every amount is a plain number with a three-letter upper-case currency.
4. Every financial year looks like `2021-22`; no date is written `YYYY-MM`.
5. Every `verified` row cites a primary-tier source.
6. Every field containing a comma is wrapped in double quotes.
7. `revise` is empty on every org row.

---

## What to do with the answer

1. Save each block into `data/inbox/` under its sheet name, **renumbering
   source ids so they do not collide with ones already in
   `funding_sources.csv`** (the highest id in use is the one to count on
   from), and updating every `sources` cell to match. The loader resolves ids
   by exact string, so a reused id would point your rows at someone else's
   document; the inbox loader for the political sheets now refuses a duplicate
   id outright, and this one reports an id that no row cites at the end of
   its run.
2. Run `pnpm tsx scripts/load-funding-inbox.ts` locally (Postgres up,
   `DATABASE_URL` in `.env`) and read the skip list: every skip is a row that
   did not load, with the reason. Fix the sheet and re-run; the loader is
   idempotent and will not insert a row twice.
3. Read the end-of-run note `source ids cited by no sheet row`. A source
   nothing cites is either a row you forgot or a document you should drop.
4. **Open every cited URL yourself before committing.** The loader validates
   shape, not truth; the prompt is a research aid, not a verification step. A
   dead or wrong citation is worse than no row.
5. Commit the sheets. The next build loads them and the network draws the new
   nodes and edges; `/network` renders per request, so it is current as soon
   as the deployment is live. `docs/NETWORK_AT_LOW_DENSITY.md` says how the
   page states its own density while the layer is still thin.
