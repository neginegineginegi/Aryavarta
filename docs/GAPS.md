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

- **D1/D2 TCPD files** (post-1962 AE and GE exports) — delivery channel
  verified (GitHub release assets work); the spec's §2.1 column expectations
  stay explicitly unverified until they land.
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
