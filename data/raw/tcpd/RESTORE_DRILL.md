# Backup restore drill — verified

Outcome: **verified**, 2026-08-28, before the D3 stage-2 insert (the
standing gate: the verified backup restore precedes TCPD stage 2).

- Procedure: `scripts/restore-drill.sh` — `pg_dump -Fc` of the target
  database, `pg_restore` into a fresh sibling database
  (`abhilekh_restore_drill`), then exact `count(*)` per table on both
  sides, compared with `diff`.
- Database: `postgres://…@127.0.0.1:5432/abhilekh` (the sandbox archive
  this stage-2 run inserts into). A production insert requires its own
  drill against the production database first; this record does not
  transfer.
- Result: **row-count diff empty across all 44 public tables** (44
  tables, 11,486 data rows at drill time; largest: indicator_values
  5,034, election_results 1,290, revisions 1,009). Nothing differed.
- Recovery point kept: `data/backups/abhilekh-20260828-203610.dump`
  (448 KB, custom format), taken immediately before the insert.
- The drill database was dropped after verification.

`scripts/load-tcpd.ts --stage=insert-early` checks for this file and its
"verified" statement before touching anything.

---

**Addendum, 2026-09-03.** The container reset of this date destroyed the
recovery point named above (`data/backups/` is deliberately uncommitted).
This record therefore attests the 2026-08-28 drill only and does NOT
green-light any new insert: run `scripts/restore-drill.sh` afresh, against
the database the insert will touch, immediately before that insert. The
sandbox database itself was rebuilt on 2026-09-03 from the committed
bootstrap (migrations, ensure-upgrades, seed, inbox loaders).
