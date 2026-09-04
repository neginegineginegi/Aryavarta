# Post-insert checks

What to look at after each stage-2 insert, and what it should say. Every
check here is read-only: opening pages and running the preflight. **Nothing
in this document touches the database.**

Run the fingerprint before and after each insert and diff the two by eye:

```sh
pnpm tsx scripts/stage2-preflight.ts
```

The gate numbers below are the ones the approved stage-1 runs measured. A
count that lands anywhere else means something is different from what the
gate approved — stop and read the insert report rather than explaining the
gap away.

## How fresh each page is (measured from the build, not assumed)

| Page | Updates |
| --- | --- |
| `/person/rs/[id]`, `/rajya-sabha/[seat]` | per request — always current |
| `/election/[id]`, `/party/[id]`, `/network`, `/network/org/[slug]` | per request — always current |
| `/`, `/browse`, `/insights`, `/state/[id]` | 5-minute cache |
| `/rajya-sabha` | 1-hour cache |
| `/state/in` (the Union page) | 1-day cache |

**The cache does not refresh on a timer.** Per Next's own ISR docs for this
version: once the window has passed, the *next* request still returns the
stale page and only starts regeneration in the background; the request
*after that* returns the fresh one. So the practical instruction is: wait
out the window, then **load the page twice**. One reload showing old numbers
is not a fault.

### Forcing it without waiting

1. **Redeploy** from the Vercel dashboard. Reliable, and rebuilds every
   prerendered page against the current database.
2. **On-demand revalidation is not wired up in this repo.** Next's
   `revalidatePath` exists, but it has to be called from a Route Handler or
   Server Action, and the archive has neither — adding one means adding an
   authenticated endpoint that can invalidate cache, which is a deliberate
   decision nobody has taken yet. Until then, redeploy is the lever.
3. Note that `revalidatePath` would not be instant either: it invalidates
   the entry, and regeneration still happens on the next request.

---

## 1. Rajya Sabha — `tcpd-rsd-1-30`

**Fingerprint should move by exactly:**

| Row | Before | After |
| --- | --- | --- |
| `rs_members` | 0 | **2,407** |
| `rs_terms` | 0 | **3,531** |
| `parties` | n | n + 57 |
| `states` | n | n + 14, **or** n + 4 if the TCPD early file was already inserted |
| `datasets ingested` | — | adds `tcpd-rsd-1-30` |

2,407 of 2,412 members: five members hold only terms whose seat the source
labels "Others", which the ruling holds back. 3,531 of 3,538 terms for the
same reason. The states figure has two right answers because the RS insert
creates ten of the D3 historical rows if D3 has not run yet, plus the four
the 2026-09-03 ruling adds (`ajmer-and-coorg`,
`bilaspur-and-himachal-pradesh`, `manipur-and-tripura`, `kutch`); the report
names every row it created either way.

**Pages to open:**

- `/rajya-sabha` — 2,407 members, 3,531 terms, 171 nominated terms, 212
  terms with no party recorded. (1-hour cache: this is the one page that
  makes you wait.)
- `/rajya-sabha/uttar-pradesh` — 347 members, 508 terms. Per request.
- `/person/rs/RS00109` — **the single most informative page.** Ram Gopal
  Yadav's 1992 term must show `"SP"` with *"the archive has not resolved
  this label to a party row, and will not guess"*, while his 1998 and later
  terms show **Samajwadi Party** with *recorded as "SP"* beside them. That
  is the windowed-disposition ruling visible on screen.
- `/person/rs/RS02320` — a nominated member: seat "Nominated" under no
  state, party label `"Nominated"` shown as an absence, not a blank.
- Status must read "as of 20 July 2022" **once, in the header** — never
  beside an individual term.

**Insight panels: expect no movement at all.** The panels count elections
and `terms` (Chief Ministers, Prime Ministers, Governors); `rs_terms` is a
separate spine. If a panel count changes after this insert, something wrote
rows nobody expected.

## 2. Electoral bonds — `eci-electoral-bonds-2019-24`

**Fingerprint should move by exactly:**

| Row | Before | After |
| --- | --- | --- |
| `orgs` | n | n + **1,294** |
| `funding_transactions` | n | n + **18,724** |
| `datasets ingested` | — | adds `eci-electoral-bonds-2019-24` |

The org kinds split **company 676 / unclassified 618** — from the committed
suffix list alone. Total value loaded ₹12,145.53 crore. Held out, and
deliberately absent from these counts: 1,680 unattributed rows (₹623.21
crore), 17 Goa Forward Party rows, 130 expired purchases.

**Pages to open:**

- `/network` — the funding graph. Nodes rise by 1,294 orgs; edges by
  18,724. Per request, so it is correct immediately.
- `/network/org/<slug>` for a large purchaser — its transactions should
  name the recipient party.
- `/party/bharatiya-janata-party` — a linked recipient. Per request.
- `/accountability` (1-hour cache) if it surfaces funding totals.

**Insight panels: expect no movement.** Bonds feed the funding graph, not
the election panels. The insert report prints a graph-density table
(nodes/edges before and after) which is where this front's success shows.

## 3. TCPD — `tcpd-ied-1951-62`, then the LokDhaba pair

This is the front that lights the starving panels.

**Early file (D3), fingerprint:**

| Row | Before | After |
| --- | --- | --- |
| `elections` | n | n + **41** (39 assembly + 2 national) |
| `election_results` | n | n + 669 (zero-seat contesting parties included) |
| `parties` | n | n + 85 created, 5 resolved into existing rows |
| `states` | n | n + 2 (`ajmer`, `coorg`) if the RS insert ran first, else n + 12 |
| `datasets ingested` | — | adds `tcpd-ied-1951-62` |

**Modern files, fingerprint:** elections rise by **379 minus whatever the
reconciliation matched** — 364 assembly plus 15 national, less every
election a hand-curated row already covers. That subtraction is why the
reconciliation must be reviewed first: the insert skips matched elections
rather than writing a duplicate beside a cited row, and the report lists
every one it skipped.

**Pages to open:**

- `/insights` (5-minute cache) — the panels below.
- `/state/madras/1952` and the map at 1952 — states that could not be drawn
  before D3 existed.
- `/election/<id>` for a newly inserted election — per request, correct
  immediately.
- `/compare` — the picker gains every inserted election.

### The panels, and which actually fill

The insert reports print this table before and after. Five panels move; two
do not, by design:

| Panel | Moves on a TCPD insert? |
| --- | --- |
| Largest majorities | **yes** — every inserted election with recorded seat totals |
| Closest elections | **yes** — every one with at least two recorded parties |
| Party dominance | **yes** — new state–party spans |
| Compare picker options | **yes** — one per inserted election |
| Browse: elections | **yes** — one per inserted election |
| **Turnout extremes** | **no — and this is correct** |
| **Browse: terms** | **no** — these inserts create no Chief Minister or Prime Minister terms |

**The turnout panel staying flat is the expected result, not a failure.**
Every TCPD row carries `turnout_percent = NULL` by ruling A3: the export's
`ElectorsWhoVoted` counts ballots rather than persons, so aggregating it
would publish a turnout figure nobody recorded. The panel counts elections
*with a recorded figure*, and TCPD adds none. If that number ever rises
after a TCPD insert, the ruling has been violated somewhere.

For the shape of the change: in the sandbox, the D3 insert moved the four
election panels from 258 to 299 — exactly +41, the number of elections
inserted, with turnout unchanged. Production's baseline differs, but the
arithmetic should be identical: **each moving panel rises by the number of
elections inserted, and no more.**

---

## If a number disagrees

Read the insert report first — `data/raw/<front>/insert-report.md` names
every row it created, skipped and held. The reports are the record of what
happened; the counts here are what should have happened. Where they differ,
the reversal is one command and is proven to return every table to its
exact prior counts:

```sh
pnpm tsx scripts/load-rajya-sabha.ts     --stage=revert --dataset=tcpd-rsd-1-30 --confirm
pnpm tsx scripts/load-electoral-bonds.ts --stage=revert --dataset=eci-electoral-bonds-2019-24 --confirm
pnpm tsx scripts/load-tcpd.ts            --stage=revert --dataset=tcpd-ied-1951-62 --confirm
```
