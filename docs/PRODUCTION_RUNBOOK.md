# Production runbook — stage-2 inserts (2026-09-03 rulings)

The exact command sequence for loading the three bulk fronts into the
production archive, in the order the gate set: **reconciliation first,
backup second, then inserts smallest first** (Rajya Sabha → electoral
bonds → TCPD). Every step prints what success looks like; stop at the
first step that prints anything else.

**Who runs this: you, from a checkout where production credentials
already live.** Nothing here runs in a sandbox pipeline or at Vercel
build time, and no credential is ever pasted into a chat — the standing
rule: never share a production `DATABASE_URL`, even read-only; a
connection string in scrollback is a disclosed credential.

## 0a. Which database (do this first, every time)

**More than one Vercel project builds this repository, and each carries its
own `DATABASE_URL`.** That is the failure this step exists to prevent: an
insert that succeeds completely, into a database no reader ever reaches.
Nothing downstream detects it — the gates pass, the reports are green, the
rows are real, and the site does not change.

1. In Vercel, open **both** projects. Find the one whose domain is the
   production alias people actually visit. Copy **that** project's
   `DATABASE_URL` from Settings → Environment Variables into the `.env` of
   your checkout. It is the only database this runbook may point at.
   The value goes into the file and nowhere else — never into a chat, a
   commit, a terminal echo, or a screenshot.
2. Confirm it from your checkout:

```sh
pnpm tsx scripts/stage2-preflight.ts
```

It reports the three gates and then prints a **fingerprint** of the
database it is pointed at: row counts and the dataset slugs already
ingested. Compare that against the live site — parties and states on
`/browse`, elections on the landing map, members on `/rajya-sabha`. If the
numbers disagree with what readers see, you are pointed at the other
project's database and must stop here.

Green gates plus a matching fingerprint is what "the data will land where
readers look" actually means. Neither half proves it alone.

## 0b. Prerequisites (once), and the merge gate

**Binding (2026-09-03): steps 1 and 2 may run before the branch is merged.
Steps 3, 4 and 5 may not.** The inserts refuse until `origin/main` carries
the code these rows need to render — the precision-aware date formatter,
the `unclassified` org kind, the Rajya Sabha tables, the verbatim
`recipient_label` — and until this database carries the matching
migration. Rows that outrun their renderer are not a cosmetic problem: a
TCPD election anchored to a year is stored as `YYYY-01-01`, and deployed
code that does not know its precision renders "1 January", the archive
asserting a date nobody recorded. The Rajya Sabha rows have no page at
all until one ships.

The scripts check what they can prove — that main CONTAINS the code — and
say so in those words. **Confirming the Vercel deployment of that commit
is green is yours**, and it belongs between the merge and step 3.

```sh
git fetch origin && git checkout claude/india-politics-archive-go5kio && git pull
pnpm install
```

- `.env` in the checkout holds `DATABASE_URL` (production) and
  `DATABASE_DRIVER=neon`. The **Node** scripts read it themselves (dotenv);
  no exporting needed for them. `scripts/restore-drill.sh` is bash and does
  **not** read `.env`, so step 2 loads it into the shell first — the exact
  command is given there. Either way the credential stays in the file and
  the shell; it is never typed, echoed, or pasted anywhere.
- `psql`, `pg_dump`, `pg_restore` on PATH (step 2 uses them).
- Raw files on disk, exactly as their manifests expect:
  - `data/raw/tcpd-rs/data/TCPD_RSD_1.30_1952_20-07-2022_release.csv` (+ codebook PDF)
  - `data/raw/electoral-bonds/` payload + held transcription files per its MANIFEST.csv
  - `data/raw/tcpd/` D1/D2/D3 CSVs per its MANIFEST.csv, and
    `data/raw/tcpd/TERMS_LOKDHABA.md` (the verbatim LokDhaba terms
    capture — the modern insert refuses without it)
- Schema upgrades applied to production (append-only, idempotent). This is
  also what records the capability row the inserts check, so it must run
  against production even if Vercel's build already ran it:

```sh
node scripts/ensure-upgrades.mjs
```

Expected: `OK — 245/245 statements ensured; capabilities recorded:
stage2-2026-09-03 (commit <sha>).` (the statement count rises as the file
grows; what matters is `OK`, the capability line, and no error).

To see where you stand at any moment — which gates would let an insert
run, and what is blocking the rest — without writing anything:

```sh
pnpm tsx scripts/stage2-preflight.ts
```

It calls the same gate functions the inserts call (never a copy) and
prints PASS / BLOCKED / NOT CHECKED per gate, exiting 0 only when every
applicable gate passes. Run it before and between steps as often as you
like; it is read-only.

Stage 0 for each front proves the drops are byte-identical to their
manifests before anything else runs:

```sh
pnpm tsx scripts/load-rajya-sabha.ts --stage=verify
pnpm tsx scripts/load-electoral-bonds.ts --stage=verify
NODE_OPTIONS=--max-old-space-size=4096 pnpm tsx scripts/load-tcpd.ts --stage=verify
```

Expected, each: `stage 0 passed.` after a line per file ending
`sha256 verified`.

## 1. Reconciliation (the binding condition on TCPD stage 2)

```sh
NODE_OPTIONS=--max-old-space-size=4096 pnpm tsx scripts/load-tcpd.ts --stage=dry-run
```

Expected: the run ends with
`[load-tcpd] report written to data/raw/tcpd/dry-run-report.md` and
performs zero writes. Paste back INTO THE CHAT only the reconciliation
section and the header line that names the database label (the label is
credential-free):

```sh
grep '^Generated' data/raw/tcpd/dry-run-report.md
sed -n '/^## Reconciliation/,/^## Party identity/p' data/raw/tcpd/dry-run-report.md
```

STOP HERE until the disagreement table has been reviewed and the gate
says the TCPD inserts may proceed. The Rajya Sabha and electoral-bonds
inserts do not depend on this table, but the order below still applies.

## 2. Verified backup restore (gates every insert)

The drill is bash and reads the environment, not `.env`, so load it first:

```sh
set -a && . ./.env && set +a
./scripts/restore-drill.sh
```

Expected, in order:
```
[drill] VERIFIED: every table's row count matches between source and restored copy.
[drill] recovery point kept at data/backups/abhilekh-<stamp>.dump
[drill] marker written: data/backups/LAST_VERIFIED_RESTORE.json
```

The marker is what the insert scripts trust — a file the drill writes on
a VERIFIED restore, never an env var. It expires after **24 hours** and
is bound to this database's label; if a day passes or the target
changes, run the drill again. If the drill prints `FAILED`, nothing else
in this runbook runs.

(If the app role cannot CREATE/DROP DATABASE on the server, set
`ADMIN_URL` to a connection URL that can — it defaults to the same
server's `postgres` database.)

## 3. Insert 1 — Rajya Sabha (smallest)

Dry-run first, read the report, then insert:

```sh
pnpm tsx scripts/load-rajya-sabha.ts --stage=dry-run
pnpm tsx scripts/load-rajya-sabha.ts --stage=insert --confirm
```

Expected from the insert, in order (the three gates, then the work):
```
[stage2] deploy gate passed: origin/main (<sha>) carries all 4 required capabilities…
[stage2] schema gate passed: capability stage2-2026-09-03 ensured <timestamp> from commit <sha>…
[stage2] backup gate passed: restore verified <timestamp> against <label>; recovery point <dump>
[load-rajya-sabha] stage 2 — inserting into <label>
# Rajya Sabha — stage 2 insert report
[load-rajya-sabha] report written to data/raw/tcpd-rs/insert-report.md
```

The report must show: rs_terms inserted 3,531 of 3,538 (7 "Others" rows
held and printed in full); no-party labels NOM. 134, O 76 and Nominated 2,
all with party_id null; one HELD label-year (the 1992 SP term, party_id
null, named in full); internal coherence "109 known-quirk rows …, 0
unexplained"; and the starved panels UNCHANGED.

**State rows created here depend on what production already holds.** In
this runbook's order the RS insert runs before any TCPD insert, so on a
production database that has never received the D3 early file it creates
**14**: the four the 2026-09-03 ruling adds (`ajmer-and-coorg`,
`bilaspur-and-himachal-pradesh`, `manipur-and-tripura`, `kutch`) plus the
ten D3 historical rows the RS terms reference (`bhopal`, `bombay`,
`hyderabad`, `madhya-bharat`, `madras`, `mysore`, `pepsu`, `saurashtra`,
`travancore-cochin`, `vindhya-pradesh`). If D3 ran first it creates only
the four; both are correct, and the report names every row either way.

Person-match candidates against production people rows appear in
entity_match_candidates — they are proposals for a human, nothing is
linked.

After this insert the rows are readable at `/rajya-sabha`, its per-seat
pages, and `/person/rs/<TCPD id>`. Both `/rajya-sabha` and `/browse`
revalidate hourly, so for up to an hour they keep showing the
no-rows-yet state; redeploy if you want them to update immediately.

## 4. Insert 2 — electoral bonds

```sh
pnpm tsx scripts/load-electoral-bonds.ts --stage=dry-run
pnpm tsx scripts/load-electoral-bonds.ts --stage=insert --confirm
```

Expected from the insert, in order:
```
[stage2] deploy gate passed: …
[stage2] schema gate passed: …
[stage2] backup gate passed: …
[load-electoral-bonds] stage 2 — inserting into <label>
# Electoral bonds — stage 2 insert report
[load-electoral-bonds] report written to data/raw/electoral-bonds/insert-report.md
```

The report must show: 1,294 orgs (kind split stated: company vs
unclassified, from the committed suffix list only), 18,724 transactions
with `recipient_label` verbatim on every row, held out exactly 1,680
unattributed rows + 17 Goa Forward rows + 130 expired purchases, 14
collision pairs as match candidates, and the funding-graph counts moved
while the starved panels stayed put.

## 5. Insert 3 — TCPD (only after the step-1 review returns approved)

D3 (early file) first, then the modern files:

```sh
NODE_OPTIONS=--max-old-space-size=4096 pnpm tsx scripts/load-tcpd.ts --stage=insert-early --confirm
NODE_OPTIONS=--max-old-space-size=4096 pnpm tsx scripts/load-tcpd.ts --stage=insert-modern --confirm
```

Expected: each begins with the three gate lines (deploy, schema, backup) and ends
`[load-tcpd] report written to data/raw/tcpd/insert-report.md` /
`…insert-modern-report.md`. insert-early's report must show 41 elections
(39 AE + 2 GE), 12 historical states, turnout NULL throughout;
insert-modern's must show 364 AE + 15 GE elections, the held SP-gap
label-years listed as skipped, and the starved panels' denominators
grown. insert-modern additionally refuses if
`data/raw/tcpd/TERMS_LOKDHABA.md` is missing (§1.4) — that capture is
part of the record, not paperwork.

If more than 24 hours passed since step 2, the gate refuses with the
marker's age; run `./scripts/restore-drill.sh` again and re-run the
insert.

## Reverting (any front, any time)

Every insert is reversible by dataset id through one shared path, driven
entirely by `record_provenance`:

```sh
pnpm tsx scripts/load-rajya-sabha.ts     --stage=revert --dataset=tcpd-rsd-1-30 --confirm
pnpm tsx scripts/load-electoral-bonds.ts --stage=revert --dataset=eci-electoral-bonds-2019-24 --confirm
pnpm tsx scripts/load-tcpd.ts            --stage=revert --dataset=tcpd-ied-1951-62 --confirm
pnpm tsx scripts/load-tcpd.ts            --stage=revert --dataset=tcpd-lokdhaba-ge-2026-08-30 --confirm
pnpm tsx scripts/load-tcpd.ts            --stage=revert --dataset=tcpd-lokdhaba-ae-2026-08-30 --confirm
```

Shared reference rows (parties, states, orgs) are deleted only when
nothing else references them; otherwise they are LEFT IN PLACE and named
in the output — a revert never silently breaks another dataset. `sources`
rows (deduped by URL) are never deleted by a revert: a source is a shared
record of where a claim can be checked, not a dataset's property. For the
TCPD modern pair, revert GE before AE (the AE dataset carries the shared
creates). The last-resort recovery is the step-2 dump:
`pg_restore --no-owner --no-privileges -d <target> data/backups/abhilekh-<stamp>.dump`
into a fresh database, verified the same way the drill verifies.

## After the inserts

**`docs/POST_INSERT_CHECKS.md` is the companion to this file**: which routes
to open after each insert, what the fingerprint counts should read against
the approved gate numbers, which pages are current immediately versus
cached, and which insight panels are supposed to move (and which are
supposed to stay flat). Read it beside each insert's report.

- Re-run step 1's dry run if a fresh reconciliation table is wanted; it
  should now report the inserted elections as agreeing rows.
- The starved-panel before/after tables in the three insert reports are
  the §5 success measure — paste them back into the chat along with each
  report's held/skipped lists.
- Nothing here changes `main` or the deployed site; deploys remain a
  separate, explicitly authorised push.
