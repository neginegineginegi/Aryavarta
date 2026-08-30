# Gaps and standing decisions

What the archive is missing, what has been decided about it, and which gates
hold. This file exists so no future session relitigates a settled decision:
if an item below says decided, the work is to execute it, not to reopen it.

## Decisions record — 2026-08-28

Five decisions, received together, recorded verbatim in effect:

1. **Public API + Open Data: GO, design first.** `docs/API_DESIGN.md` is the
   design; it was written and STOPPED for an explicit go before any endpoint
   is implemented. Two gates travel with this decision: **no URL appears in
   docs, the landing, or the README until the canonical domain decision
   lands**, and **the two held landing bands (API, Open Data) mount only when
   the endpoints and /data are real and the domain is set**. One export
   pipeline, not two: the bulk artifact and the API read the same queries.

2. **Newsletter: DORMANT.** `NewsletterSection` stays unmounted from the
   landing page. Parked pending the privacy policy and a provider decision;
   revisit after the takedown and privacy work. Nothing collects an email
   address until then.

3. **Seal: About page primary, footer mark, masthead untouched.** The banyan
   seal (`public/abhilekh-logo.svg`, canvas 260×272) mounts as the About
   page's primary mark and as a small footer mark. The masthead does not
   change. OG cards were verified unchanged when the mounts landed.

4. **Dependabot PRs #1–3: merge.** Merge them if repository permissions
   allow; report plainly if they do not. (The typescript and eslint
   semver-majors stay ignored per `.github/dependabot.yml` — those are
   evidence-backed holds, not neglect.)

5. **Error tracking: yes, after the privacy paragraph; blocked on the DSN.**
   The privacy paragraph below is the text that ships on the privacy page
   the day Sentry mounts. Implementation STOPS until the user pastes a
   Sentry DSN; nothing is wired speculatively.

   > **Error reporting.** When a page or action fails, Abhilekh sends a
   > technical error report to Sentry, an error-tracking service, so the
   > failure can be found and fixed. The report carries the error message
   > and stack trace, the route that failed, the browser and OS family, and
   > a release tag naming the deployed commit — and nothing else that we
   > can avoid: contributor email addresses, account identifiers, and the
   > content of records or drafts are scrubbed from error objects and
   > breadcrumbs before the report leaves our infrastructure, IP addresses
   > are not stored with events, and no session-replay or tracing of page
   > content is enabled. Error reports are kept by Sentry for its standard
   > retention window and are visible only to the archive's maintainers.

## TCPD D3 gate rulings — 2026-08-28 (decided; do not relitigate)

Stage 2 was authorised on these terms and executed against the sandbox
archive the same day (production requires its own restore drill first):

1. **Turnout: NULL throughout D3.** ElectorsWhoVoted counts ballots, not
   persons. The WHY is recorded in the dataset row's notes so a re-ingest
   cannot mistake the null for missing data and recompute it.
2. **Row basis: 669** — zero-seat contesting parties included.
3. **GE rollup: 41 insertable elections** (39 AE + 2 GE), with the 43
   per-state GE slices preserved as committed artifacts
   (`data/raw/tcpd/D3_GE_STATE_SLICES.csv`, `D3_GE_STATE_TOTALS.csv`) so
   the aggregation stays reversible from the repository.
4. **Historical states: 12 first-class rows, no successor links,**
   `has_geometry = false`; Bilaspur and Kutch get no row (GE-only, fold
   into the national GE). The map states what it cannot draw ("Held in
   {year}, not drawable" in the plate legend).
5. **Parties: created verbatim, no auto-merge** — via the committed
   `data/raw/tcpd/PARTY_RESOLUTIONS.csv` (85 create + 5 resolve after the
   SP era-collision correction: the 1950s SP is the Socialist Party, not
   the 1992 Samajwadi Party its abbreviation matches).
6. **Licence: option (a)** — TCPD-derived rows ship as a separate artifact
   under TCPD's own terms, never inside a mixed-licence CC BY-SA file;
   nothing TCPD-derived ships in any export until that artifact exists.
7. **Errata folded into the spec** (§2.8); D3_FINDINGS.md stays unedited.

Process rule, standing: **main moves only on the user's say-so** — develop
on the branch, ask before any push to main, even for trivial changes.

## TCPD D1/D2 gate rulings — 2026-08-30 (decided; do not relitigate)

Stage 2 for D1/D2 remains UNBUILT pending the binding condition below.

1. **Madras and Mysore attach to the first-class `madras`/`mysore` rows**,
   no successor links, never routed to tamil_nadu/karnataka in either
   direction (verified: STATE_MAP and STATE_ALIASES.csv carry no such
   routing; tests assert it).
2. **Party creates: bulk-accept verbatim after a collision scan.** Labels
   colliding with an existing party (case/punctuation stripped) or with
   another incoming label are HELD and reported in full; everything else
   creates verbatim, no auto-merge.
3. **Dispositions carry validity windows** (label + from_year/to_year in
   PARTY_RESOLUTIONS.csv); a label-year no window covers is HELD, never
   guessed. SP's windows APPROVED 2026-08-30: through 1952 → the Socialist
   Party row; from 1993 → samajwadi-party; the 1953–1992 gap HELD (six
   stray rows, incl. the pre-founding 1991/Feb-1992 GE rows).

   **Ruling 2 addendum (2026-08-30):** the 5 existing-collision variants
   (two CPI(M) forms, Janata Dal(Secular), Janata Dal(United), JPS)
   resolve into their existing rows via PARTY_RESOLUTIONS.csv — a human
   read all five. The 137 shared-form incoming groups (283 labels) get NO
   case-insensitive unify rule: create verbatim, then emit each group as a
   merge candidate through entity_match_candidates at insert time. A
   deferred merge costs nothing; a wrong silent merge applied 283 times is
   unrecoverable.
4. **BINDING CONDITION on stage 2 (route set 2026-08-30):** the
   reconciliation must be regenerated against the PRODUCTION database and
   its disagreement table reviewed before stage 2 is built. Route: the
   USER runs the dry run where production credentials already live and
   pastes back the reconciliation section. Never ask for, never accept, a
   pasted production DATABASE_URL — a connection string in scrollback is a
   disclosed credential to the only copy of every contribution, and
   read-only limits misuse, not disclosure. Confirmed: the loader takes
   its connection cleanly from the environment (DATABASE_URL +
   DATABASE_DRIVER=neon in .env of a branch checkout; the dry run
   performs zero database writes), so no code change is needed.
5. **LokDhaba terms capture** (verbatim, §1.4) still blocks D1/D2 stage 2.

## Standing gates (restated, still in force)

- The **verified backup restore precedes TCPD stage 2** (no insert stage
  runs before a restore drill has actually been performed and verified).
- **Stages 0 and 1 take precedence the moment ingest data lands.**
- **No second ingest front opens before stage 3 closes.** (This is why the
  verified RBI Handbook GER/IMR state tables sit parked.)
- **TCPD licence composition** (non-commercial + citation, vs CC BY-SA) must
  be decided **before the bulk download ships** — recorded as the open
  decision in `docs/API_DESIGN.md` and flagged in the D3 dry-run report.

## Blocked on the user

- **D1/D2**: DELIVERED 2026-08-30 (user uploads; stage 0–1 run same day,
  spec §2.9 records the measured amendments). Still pending from the user
  for their stage 2: the LokDhaba terms-page capture (verbatim, §1.4) and
  the exact export URL/version labels; plus the stage-1 gate rulings from
  `data/raw/tcpd/dry-run-report.md`, which for real decisions must be
  regenerated against production, not the fixture sandbox.
- **Canonical domain decision** and the Vercel Settings → Domains answer;
  `NEXT_PUBLIC_SITE_URL` follows it.
- **Google sign-in round trip on the live domain** — the user's check, not
  this repo's.
- **Sentry DSN** (decision 5).
- **Stage-1 gate rulings** for D3, listed at the end of
  `data/raw/tcpd/dry-run-report.md`: historical-states creation, turnout
  storage rule, zero-seat inclusion, the would-create party list, licence
  composition.

## Known gaps in the archive itself

- Elections before 1962 exist only as the D3 dry-run aggregate; nothing is
  inserted (gate).
- The federal ledger's funding layer is thin by design until its next
  ingest window; the graph states its own density honestly
  (`docs/NETWORK_AT_LOW_DENSITY.md`).
- Development indicators cover the GEM industrial series; RBI social
  indicators are parked behind the ingest gate.
- The API and /data page do not exist yet (decision 1: design first).
