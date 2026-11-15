# HANDOFF — read this first

Written 2026-11-15 so that a new Claude Code session, with no memory of
earlier conversations, can pick up the work. Anything that was only in a
conversation is recorded here. Everything else is in the docs it links to.

## 1. Start here

Paste this as the first message of a new session:

```
Read HANDOFF.md, then AGENTS.md, then docs/GAPS.md, in that order.
The standing rules in HANDOFF.md section 3 are binding: obey them.
Before you change anything, report the current state in short points:
the branch and commit, whether main and the dev branch agree, what
HANDOFF.md says is waiting on me, and anything in the repository that
contradicts HANDOFF.md. Then wait for my go-ahead.
```

## 2. What this is

- **Abhilekh** (package name `abhilekh`) is a sourced public archive of Indian politics: chief-minister and governor terms, elections and results, events, manifesto promises, development indicators, and a funding/influence network.
- The repository is public at github.com/neginegineginegi/Aryavarta. Development happens on the branch `claude/india-politics-archive-go5kio`.
- The stack is Next.js 16.3.8 (App Router; `src/proxy.ts` is the renamed middleware), Drizzle on Postgres (Neon in production), Auth.js v5 with Google OAuth, and Vercel (team/project `sankram/abhilekh`).
- Content reaches the site two ways. Political rows from `data/inbox/*.csv` become pending revisions that a moderator approves in `/review`. Bulk, funding and stage-2 datasets are inserted directly, with provenance.
- Three large "stage-2" datasets are built but not yet in production: Rajya Sabha (TCPD), electoral bonds, and TCPD election results.

## 3. Standing rules (binding)

The person's own rules, verbatim where quoted:

- "Never ask for, never accept, a pasted production DATABASE_URL — a connection string in scrollback is a disclosed credential." The credential "goes into the file and nowhere else — never into a chat, a commit, a terminal echo, or a screenshot."
- "main moves on my say-so. Branch, then ask, even for trivial changes." Work on the dev branch. Fast-forward main only when the person says so.
- The person runs production inserts. An AI session never runs them against production.
- Refuse rather than repair. A bad data row is skipped or refused with a reason, never guessed at or silently fixed. Entities are never merged automatically; a match is a proposal for a human.
- Rajya Sabha PII: only the 13 allowlisted columns are ever read (`src/lib/ingest/rajya-sabha.ts`). Exclusion works by allowlist, not denylist.
- A verified backup restore (the drill's marker file, never an env var) comes before any insert. Transcribed data gets `evidence_status` 'documented', never 'verified'.
- A summary line never reports zero over a non-empty body. Write, for example, "N known-quirk rows (...), zero unexplained".
- Do not weaken any stage-2 gate: the deploy markers on origin/main, the schema capability marker, the database identity check, the verified-restore marker, or `--confirm`.
- The person is short on time. Answer in short points, outcome first.
- Decisions marked as decided in `docs/GAPS.md` are carried out, not reopened. Files in `docs/archive/` lose to the repository wherever the two disagree.

The repository's invariants (`ARCHITECTURE.md`, "Invariants"):

1. Every published fact cites a source.
2. Every change to live content goes through the `revisions` table. The only exceptions are the bulk path (`SHEETS.bulk` in `scripts/load-inbox.ts`), the funding loader and the stage-2 loaders. Moving a sheet from one path to the other is an editorial decision, not a refactor.
3. Imports are never the source of truth. They become pending Import Bot revisions (`origin='import'`).
4. No facts are ever fabricated. Demo and seed data must be obviously fake.
5. Party colours are data colours only, never interface chrome.
6. Schema changes are additive and ship through `scripts/ensure-upgrades.mjs`.

The platform never scores, ranks or grades governments.

Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` (see `AGENTS.md`).

## 4. Where things stand (2026-11-15)

**Live**
- `origin/main` and the dev branch are both at commit `9426741`, and its Vercel deployments are green. (A local `main` ref may be stale; compare against `origin/main` after `git fetch`.)
- Production has had **zero** stage-2 bulk inserts. The live site shows about 258 elections, 24 funding transactions and no Rajya Sabha members.

**Built but not yet run in production**
- `scripts/go.ts` is a single guided command that runs the Rajya Sabha insert and then the electoral-bonds insert. It has been reviewed twice.
- On 2026-11-12 it was rehearsed end to end against a sandbox database. The drill was VERIFIED and both inserts ran. The counts moved by orgs +1294, funding_transactions +18724, rs_terms 3531 and rs_members 2407 of 2412. The other 5 members were held because their only terms are 'Others' terms.
- The rehearsal caught a refusal in TRS/YSRCP party resolution, which commit `9426741` fixed.
- TCPD elections are deliberately **not** in go.ts. They still need the inputs listed under 5.3 and a run by hand (`docs/PRODUCTION_RUNBOOK.md` steps 1 and 5).

**Next action (the person's)**
- The person is setting up WSL on Windows. From a checkout whose `.env` holds the production credential, they will run, in order:
  1. `pnpm tsx scripts/go.ts --dry-run`
  2. `pnpm tsx scripts/go.ts`
  3. Press "Refresh cached pages" at `/admin/import`. A bulk insert bumps no cache tag, so this step is needed. `/rajya-sabha` is not covered: it is on a 1-hour timer, so it may show no members for up to an hour (or until a redeploy). That is not a failed insert.
- For an AI session: help with setup errors and read pasted reports back. Do not start new process or documentation work.

## 5. What is waiting on the person

1. **Run go.ts in production.** This needs WSL, Node 22, pnpm, the PostgreSQL 17 client tools (`psql`, `pg_dump` and `pg_restore`, the same major version as the server), and `.env` containing the production `DATABASE_URL` with `DATABASE_DRIVER=neon` (plus `ADMIN_URL`, a URL allowed to CREATE/DROP DATABASE, if the app role cannot). Run it from a `git clone` of the repository on the dev branch, after `pnpm install`. The deploy gate fetches origin/main. It also needs the raw payload files (see section 6).
   - Take `DATABASE_URL` from the Vercel project that owns the production domain. More than one project builds this repository, each with its own database (runbook step 0a).
   - Afterwards, paste back the starved-panel tables and the held/skipped lists from the `insert-report.md` files.
2. **Clean up the `/review` queue.** Reject these drafts; the next build re-stages them correctly:
   - the pending Gujarat drafts that cite 2026 election news (sources.csv once reused the ids S1-S5). Any Gujarat row already approved live needs an amendment revision, not a rejection;
   - nine CM/governor drafts that cite only the Raj Bhavan portal;
   - the duplicate West Bengal 2026 election draft.
   - Do not bulk-approve any of these. Details are in `docs/GAPS.md`.
3. **TCPD elections (about 420 elections).**
   - Re-upload the D1/D2 LokDhaba exports and the D3 early file.
   - Capture the LokDhaba terms page verbatim into `data/raw/tcpd/TERMS_LOKDHABA.md`. That path is currently gitignored. Add `!data/raw/tcpd/TERMS_LOKDHABA.md` to `.gitignore` beside the other `data/raw/tcpd` whitelist lines, on the dev branch and only after asking. Force-adding is not enough: `committed-record.test.ts` checks the ignore rules, so `pnpm test` would still fail. `insert-modern` refuses without the file.
   - Confirm the exact LokDhaba export URL and version labels for D1/D2 (both pending in `data/raw/tcpd/MANIFEST.csv`).
   - Then the person regenerates the reconciliation dry run against production, not the sandbox, and reviews it (runbook step 1).
4. **Curator calls.**
   - West Bengal 2026 figures: the sheet rows disagree (BJP 207 vs 208).
   - Colours for the roughly 40 parties that have no `party_colors.csv` row.
   - Four funding sources that nothing cites (FS5, FS21, FS30, FS35): attach each one to a row or drop it.
5. **Decisions.**
   - The canonical domain. `NEXT_PUBLIC_SITE_URL` follows it, and no site URL goes into the docs, landing page or README until it is decided.
   - The Sentry DSN.
   - A check that Google sign-in works on the live domain.
6. **More network data.** Use `docs/RESEARCH_PROMPT_FUNDING.md`, one organisation per query.

## 6. What is NOT in git and how to recover it

`.gitignore` ignores `data/raw/*`, keeping only the manifests and the mapping and record files, and it ignores all of `data/backups/`.

| Input | Where it lives now | How to get it back |
|---|---|---|
| `.env` (all credentials) | Only on the person's machine. The cloud checkout has a local one, which must never be printed. | Copy the values from Vercel → Settings → Environment Variables of the project that owns the production domain. Template: `.env.example`. |
| `data/raw/tcpd-rs/data/TCPD_RSD_1.30_1952_20-07-2022_release.csv` and `TCPD_RSD_v1.30_14-09-2022.pdf` | Present in this cloud checkout; not on the person's machine unless they copy it there. | github.com/tcpd/rs-data-release at v1.30 (repo commit `5a11ff1e`, 2022-09-14). sha256 and byte counts are in `data/raw/tcpd-rs/MANIFEST.csv`. |
| `data/raw/electoral-bonds/data/final.csv`, `purchased.csv`, `encashed.csv` | Present in this cloud checkout. | github.com/saisantoshv3/electoral_bonds at commit `aa8b9e022d29f762fd174fa9371ad2e02a85e777` (2024-05-14). This is a community transcription of the ECI PDFs, not the primary source. Checked against `data/raw/electoral-bonds/MANIFEST.csv`. |
| `data/raw/tcpd/ae/TCPD_AE_All_States_2026830.csv` (D1), `ge/TCPD_GE_All_States_2026830.csv` (D2) | **Lost** in a container reset. Absent here. | User upload; keep your own copy. They were LokDhaba exports dated 2026-08-30 and cannot be re-fetched to the same bytes. Must match the sha256 in `data/raw/tcpd/MANIFEST.csv`. |
| `data/raw/tcpd/early/TCPD_IED_1951-62.csv` and its Codebook PDF (D3) | Absent here. | User upload; keep your own copy. The upstream is github.com/tcpd/IndianElectionsDataset_1951-to-1962, but it is recorded only as "repo HEAD 2026-08-28" with no commit hash, so check any re-fetch against the manifest sha256 (`9891c366...`). |
| `data/raw/tcpd/TERMS_LOKDHABA.md` | Does not exist yet. | The person captures it from the LokDhaba site (5.3). |
| `data/backups/*.dump` and `data/backups/LAST_VERIFIED_RESTORE.json` | Written by `scripts/restore-drill.sh` on whichever machine runs it. The files in this cloud checkout come from the 2026-11-12 **sandbox** rehearsal: they are not production and are stale (the marker allows 24 hours). | Re-run the drill; go.ts runs it for you. The dump taken on the person's machine becomes the production recovery point after the insert, so **keep it**. |
| `data/raw/*/dry-run-report.md`, `insert-report.md` (TCPD modern writes `insert-modern-report.md`) | Written by the loaders. The copies here come from the sandbox rehearsal. They record the database label and must never be committed. | Re-run the loader. After a real run, paste back the starved-panel tables and the held/skipped lists. |

The loaders' `--stage=verify` step, and go.ts, check every payload file's byte count and sha256 against its MANIFEST.csv before any insert.

## 7. Map of the repository

| Area | Read | Reference doc |
|---|---|---|
| Decisions, blockers, known gaps | `docs/GAPS.md` | `docs/GAPS.md` (binding) |
| Architecture and invariants | `ARCHITECTURE.md` | `ARCHITECTURE.md` |
| Setup and deploy | `SETUP.md`, `README.md`, `.env.example`, `vercel.json` | `SETUP.md` |
| Inbox CSV formats | `data/inbox/*.csv`, `scripts/load-inbox.ts` (the `SHEETS` constant) | `docs/DATA_FORMAT.md` |
| Funding/influence layer | `scripts/load-funding-inbox.ts`, `src/lib/funding/`, `src/app/network/` | `docs/FUNDING_INFLUENCE_ARCHITECTURE.md`, `docs/NETWORK_AT_LOW_DENSITY.md` |
| Research prompts | — | `docs/RESEARCH_PROMPT_EVENTS.md`, `docs/RESEARCH_PROMPT_FUNDING.md` |
| Stage-2 inserts | `scripts/go.ts`, `scripts/stage2-common.ts`, `scripts/stage2-preflight.ts`, `scripts/restore-drill.sh`, `src/lib/ingest/` | `docs/PRODUCTION_RUNBOOK.md` |
| Rajya Sabha | `scripts/load-rajya-sabha.ts`, `data/raw/tcpd-rs/`, `src/app/rajya-sabha/`, `src/app/person/rs/[id]/` | `docs/RAJYA_SABHA_SPEC.md` |
| Electoral bonds | `scripts/load-electoral-bonds.ts`, `data/raw/electoral-bonds/` | `docs/ELECTORAL_BONDS_SPEC.md` |
| TCPD elections | `scripts/load-tcpd.ts`, `data/raw/tcpd/` | `docs/ELECTIONS_INGEST_SPEC.md` |
| Schema | `src/lib/db/schema.ts`, `scripts/ensure-upgrades.mjs` (append-only `STATEMENTS`, `CAPABILITIES`) | `ARCHITECTURE.md` invariant 6 |
| Auth and roles | `src/proxy.ts` (a UX-only gate), `src/lib/authz.ts` (`requireRole` is the real boundary), `src/lib/auth.ts`, `src/lib/auth.config.ts` (keep it free of DB imports) | `SETUP.md` §2-4 |
| Server actions | `src/actions/` | `src/actions/public-read-actions.ts` and its guard test |
| Review and revisions | `src/app/review/`, `src/actions/review.ts`, `src/lib/revisions/apply.ts` (the only writer into live tables) | `ARCHITECTURE.md` invariant 2 |
| Caching | `src/lib/cache.ts` (tags), `src/lib/db/queries/*.ts` | `docs/PRODUCTION_RUNBOOK.md` "How fresh each page is" |
| Security headers / CSP | `next.config.ts` (enforced CSP, no remote assets) | `next.config.ts` |
| Development indicators | `src/lib/db/queries/development.ts`, `src/components/ui/TrendChart.tsx` | `docs/DEVELOPMENT_DATA.md` |
| Accountability / API design | `src/app/accountability/` | `docs/ACCOUNTABILITY_LAYER.md`, `docs/API_DESIGN.md` (design only; nothing is built yet) |
| Known bugs | — | `docs/KNOWN_ISSUES.md` (nothing open) |

Three known inaccuracies, recorded here rather than fixed while docs work is frozen:
- The home page FAQ says the archive has "no accounts", but contributors do sign in with Google.
- The header of `scripts/restore-drill.sh` is out of date: it describes the drill as a TCPD-only gate and says inserts need a record in `data/raw/tcpd/RESTORE_DRILL.md`. No code reads that file; the real gate, for every stage-2 insert, is `data/backups/LAST_VERIFIED_RESTORE.json`.
- The RS MANIFEST note says "10 PII columns"; the code excludes 11 (`src/lib/ingest/rajya-sabha.ts`).

## 8. How to run it

**Local setup** (`SETUP.md` §4):

```sh
pnpm install
cp .env.example .env        # set DATABASE_URL (a local postgres) and AUTH_SECRET
pnpm db:migrate             # drizzle/ 0000-0003
pnpm db:upgrade             # scripts/ensure-upgrades.mjs
pnpm db:seed                # reference data only
pnpm db:seed:demo           # optional; obviously fake content; never against production
pnpm dev
```

- Without Google OAuth credentials, set `AUTH_DEV_LOGIN="insecure-dev-mode"` (dev only) and sign in as the `ADMIN_EMAIL` address to get an admin session.

**Checks**
- Run `pnpm test` (vitest), `pnpm lint` and `pnpm typecheck`.
- CI (`.github/workflows/ci.yml`, Node 22) runs those three and `pnpm audit --prod --audit-level high`. It does not build.
- `pnpm build` writes to whatever database `DATABASE_URL` points at. It runs the site-URL check, the dev-login check, `ensure-upgrades`, `supersede-wikidata`, `load-inbox` and `load-funding-inbox`, then `next build`. With no `DATABASE_URL`, the database steps skip.

**Deploy**
- A push to `main` (only on the person's say-so) triggers a Vercel build of `pnpm build`.
- That build applies schema upgrades and loads `data/inbox`. Committing a CSV there is how inbox rows reach production.
- Production builds fail if `NEXT_PUBLIC_SITE_URL` is missing or not https, or if `AUTH_DEV_LOGIN` is set.
- Stage-2 inserts never run at build time. The person runs them by hand with `scripts/go.ts`, or with the runbook for TCPD.

**Stage-2 tools**
- Preflight, read-only: `pnpm tsx scripts/stage2-preflight.ts`.
- Revert a front: `<loader> --stage=revert --dataset=<slug> --confirm` (runbook "Reverting").
- The TCPD commands need `NODE_OPTIONS=--max-old-space-size=4096`.
- go.ts refuses to run if any `tcpd-*` or `eci-electoral-bonds-*` dataset slug is already present, so it cannot be re-run after a partial run. If Rajya Sabha landed and electoral bonds did not, do not revert Rajya Sabha. The person runs the bonds front by hand: `pnpm tsx scripts/load-electoral-bonds.ts --stage=dry-run`, then `--stage=insert --confirm` (runbook step 4), re-running the drill first if its marker is more than 24 hours old. Redoing a front that did land needs a revert first.

## 9. Lessons

- The aim was data and visuals on the site. About two months went mostly into gates, runbooks, review rounds and documentation fixes, and not one bulk insert landed.
- Some of that work caught real errors (wrong citations, a duplicate party), but the effort was out of proportion, partly because the AI kept adding checks.
- Order from here: run go.ts, get TCPD in, then spend the effort on visuals for the data that lands.
- Docs and process work is frozen unless something breaks. Do not add gates, review rounds or new docs without being asked.
- Prefer one command over a runbook of steps. Fix the real blocker rather than writing about it.
