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

## 0. Prerequisites (once)

```sh
git fetch origin && git checkout claude/india-politics-archive-go5kio && git pull
pnpm install
```

- `.env` in the checkout holds `DATABASE_URL` (production) and
  `DATABASE_DRIVER=neon`. The scripts read it themselves (dotenv); no
  exporting needed.
- `psql`, `pg_dump`, `pg_restore` on PATH (step 2 uses them).
- Raw files on disk, exactly as their manifests expect:
  - `data/raw/tcpd-rs/data/TCPD_RSD_1.30_1952_20-07-2022_release.csv` (+ codebook PDF)
  - `data/raw/electoral-bonds/` payload + held transcription files per its MANIFEST.csv
  - `data/raw/tcpd/` D1/D2/D3 CSVs per its MANIFEST.csv, and
    `data/raw/tcpd/TERMS_LOKDHABA.md` (the verbatim LokDhaba terms
    capture — the modern insert refuses without it)
- Schema upgrades applied to production (append-only, idempotent):

```sh
node scripts/ensure-upgrades.mjs
```

Expected: `OK — 243/243 statements ensured.` (the count may be higher if
the file has grown; what matters is `OK` and no error).

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

```sh
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

Expected from the insert, in order:
```
[stage2] backup gate passed: restore verified <timestamp> against <label>; recovery point <dump>
[load-rajya-sabha] stage 2 — inserting into <label>
# Rajya Sabha — stage 2 insert report
[load-rajya-sabha] report written to data/raw/tcpd-rs/insert-report.md
```

The report must show: rs_terms inserted 3,531 of 3,538 (7 "Others" rows
held and printed in full), the four state rows created (or "none (all
existed)" on a re-ordered run), no-party labels NOM. 134 and O 76 with
party_id null, and the starved panels UNCHANGED. Person-match candidates
against production people rows appear in entity_match_candidates — they
are proposals for a human, nothing is linked.

## 4. Insert 2 — electoral bonds

```sh
pnpm tsx scripts/load-electoral-bonds.ts --stage=dry-run
pnpm tsx scripts/load-electoral-bonds.ts --stage=insert --confirm
```

Expected from the insert, in order:
```
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

Expected: each begins `[stage2] backup gate passed:` and ends
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

- Re-run step 1's dry run if a fresh reconciliation table is wanted; it
  should now report the inserted elections as agreeing rows.
- The starved-panel before/after tables in the three insert reports are
  the §5 success measure — paste them back into the chat along with each
  report's held/skipped lists.
- Nothing here changes `main` or the deployed site; deploys remain a
  separate, explicitly authorised push.
