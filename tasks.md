# Tasks — Vietnamese Banking Jobs Aggregator

The plan of record. Owned by the `cto` agent; no other agent edits this file.

| Field | Value |
|---|---|
| **Version** | 1.1 |
| **Baselined** | 2026-08-13 · re-baselined after T-002 |
| **Sources** | [`PRD.md`](PRD.md) v0.3 · [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md) v1.0 · `docs/adr/0001`–`0006` · [`docs/DESIGN_GUIDELINES.md`](docs/DESIGN_GUIDELINES.md) · [`Testcases.md`](Testcases.md) |
| **Total tasks** | 70 across 6 phases |

---

## Overall progress

```
█░░░░░░░░░░░░░░░░░░░  3%
```

| Phase | Content | Tasks | Progress |
|---|---|---|---|
| **P0** — Spike | Shared libraries, database, crawler skeleton, 2 banks | 20 | `██░░░░░░░░░░░░░░░░░░` 10% |
| **P1** — Data foundation | Remaining 11 banks, alerting, CI | 14 | `░░░░░░░░░░░░░░░░░░░░` 0% |
| **P2** — Public site | List, search, filters, detail, coverage pages | 16 | `░░░░░░░░░░░░░░░░░░░░` 0% |
| **P3** — Accounts | Auth, save jobs, follow banks | 8 | `░░░░░░░░░░░░░░░░░░░░` 0% |
| **P4** — Launch | Domain, deploy, analytics, health monitoring | 8 | `░░░░░░░░░░░░░░░░░░░░` 0% |
| **P5** — Observe | 30 days of real data; tune the guesses | 4 | `░░░░░░░░░░░░░░░░░░░░` 0% |

**Where the project actually is:** a git repository on `main` with one commit, holding the full
specification set and one finished module — `lib/normalize.ts`, verified by 24 passing tests.
`app/layout.tsx` has been localised. The database, the crawler, and every page do not exist yet.

**Waiting on you: [T-002](#t-002--repository-initialised-public-with-no-personal-data-in-it) needs a GitHub repository.** Everything
local is done and the tree is verified clean. Create a **public** repo (suggested name
`vieclam-nganhang`), then `git remote add origin <url> && git push -u origin main`.

**Next buildable tasks, in order:** [T-003](#t-003--application-shell-replaces-the-create-next-app-scaffold) (strip the starter
page, apply design tokens) and [T-004](#t-004--shared-type-definitions) (shared types). Both list T-002 as a dependency,
which is satisfied by the local repository existing — neither needs the push.

---

## How to read and update this document

**Progress bars are computed, never estimated.**

- Task progress = checked definition-of-done items ÷ total items.
- Phase progress = the mean of its tasks' fractions, each task weighted equally.
- Overall progress = the mean across all 70 non-dropped tasks — not the mean of the phase
  percentages, so a 4-task phase cannot outweigh a 20-task one.
- Bars are 20 cells; filled cells = `round(percentage ÷ 5)`. At 2% that rounds to zero filled
  cells, which is the honest picture.

**Rules that keep the number meaningful**

1. Tick an item only when it is verified — the test passes, the page responds, the file exists.
   A checkbox is a claim; the code is the truth.
2. Ticking anything means recomputing that task's bar, its phase's bar, and the overall bar.
3. Status is one of `todo` · `wip` · `done` · `blocked` · `dropped`. `blocked` is not a
   progress state — a blocked task keeps whatever it has genuinely earned.
4. Task IDs are append-only. Never renumber, never reuse. A cancelled task stays here marked
   `dropped` with its reason.
5. Every task that touches code ends with a `Testcases.md` entry written by the `test-task`
   skill. That is this project's standing rule: no test entry, not done.

---

## Owner decisions this plan is waiting on

Nothing below blocks the next three months of work, but each has a deadline implied by the task
that needs it.

| ID | Decision needed | Blocks | Recommended default | Cost of deferring |
|---|---|---|---|---|
| **OQ-1** | Product name and domain | T-059, T-060 | Pick any short Vietnamese-legible name before P4 | None until launch. `vieclam-nganhang` is the working package name and is not a commitment |
| **OQ-2** | Which success metrics are authoritative | T-070 | The three named in PRD §16: 13/13 coverage, ≥95% crawl success, ≥25% outbound click | None until P5, but T-061 must instrument whatever is chosen — decide before P4 |
| **OQ-T2** | External uptime-monitor vendor | T-062 | Any free cron monitor pointed at `/api/health` | The "crawler stopped entirely" failure has no alert until this exists (F-6) |
| **OQ-T4** | How the outbound-click metric is captured | T-061 | Vercel Web Analytics custom events; fall back to `POST /api/click` only if the tier refuses | The fallback breaks the read-only-website property — a real trade-off, not a detail |

**Decided and closed** — do not reopen: OQ-3, OQ-4, OQ-5, OQ-6 (technical design + ADR-0006),
OQ-7 → promoted to FR-29, OQ-8 (withdrawn), OQ-9 → Option B, AC-11.2 amended.

---

## Assumptions this plan makes

| ID | Assumption | If wrong |
|---|---|---|
| **PA-1** | P0 crawls listing pages only; job descriptions arrive with hydration in T-029 | Nothing breaks — `description_html` is nullable and the detail view is P2. It only means P0 data is thin |
| **PA-2** | `docs/DESIGN_GUIDELINES.md` is detailed enough to build against; T-035 produces screen specs that refine it rather than replace it | If the guidelines turn out insufficient, T-035 grows and P2 starts a session or two later |
| **PA-3** | The four SuccessFactors banks really do share one parser (ADR-0001) | T-021 grows from three config files into three adapters, and P1 costs roughly a week more |
| **PA-4** | Each phase's exit gate is adjudicated on evidence — crawl logs, test output, a live page — not on this document's checkboxes | A phase declared done early defers its failure to the next phase, where it costs more |

---

# P0 — Spike

**Exit gate (PRD §17):** two banks — one static, one JavaScript-rendered — return real jobs on
two consecutive scheduled runs with no manual intervention.

**Progress:** `██░░░░░░░░░░░░░░░░░░` 8% · 20 tasks

This phase builds almost the entire skeleton and only two banks. That is deliberate: everything
here is paid for once and reused thirteen times.

---

### T-001 · Vietnamese text normaliser
`done` · `████████████████████` 100%

**Spec:** FR-13 · FR-14 (AC-14.1–14.3) · AC-9.2 · NFR-5 · ADR-0004
**Depends on:** —

The correctness core of search. `đ` has no Unicode canonical decomposition, so a naive
NFD-and-strip fold silently fails on it — which is why this was the first commit.

- [x] `lib/normalize.ts` exports `toStorage`, `toSearch`, `toSearchTokens`
- [x] Fold is idempotent and NFC/NFD-agnostic
- [x] Output restricted to `[a-z0-9 ]`, so user input cannot carry `tsquery` syntax
- [x] `lib/normalize.test.ts` — 24 assertions
- [x] `Testcases.md` entry written

---

### T-002 · Repository initialised, public, with no personal data in it
`blocked` · `█████████████████░░░` 83%

**Spec:** TECHNICAL_DESIGN §8.5 · ADR-0003 · F-14
**Depends on:** —
**Blocked on:** the GitHub repository does not exist. `gh` is not installed on this machine and no
remote is configured. Every local step is done and verified; only the push remains.

**The only irreversible task in P0.** The repository must be public for the Actions free-tier
minutes policy, and a file committed once and later removed stays in history permanently. Do
this before anything else is committed.

- [x] `CV_folder/` no longer exists inside the repository directory
- [x] `.gitignore` covers `CV_folder/` and `.env*`
- [x] `.gitignore` also covers `*.pdf`
- [x] `git init` on `main`; initial commit `b43ae82`, 42 files, working tree clean
- [ ] Pushed to a **public** GitHub repository
- [x] `git ls-files` inspected: zero matches for `*.pdf`, `CV_folder`, `.env`, `agent-memory`,
      `node_modules`, `*.tsbuildinfo` across all 42 tracked files

**Finding — personal data that is not a PDF.** `.claude/agent-memory/` holds agent working memory,
including `user-profile.md` files describing the maintainer's job-search status and circumstances.
Harmless locally; must not enter a public repository. Now excluded by `.gitignore`, and T-033's CI
check extended to cover it. The agent definitions and skills under `.claude/` **are** committed —
they are project assets. Only the memory directory is excluded.

**Repository name.** The directory is `CV_reviewer`, a leftover from an unrelated earlier idea
(PRD §1). It is a poor public name and actively misleading — it suggests the repository contains
CVs. Recommended: **`vieclam-nganhang`**, matching `package.json`. This is a working name, not a
resolution of OQ-1; renaming a GitHub repository later is cheap.

---

### T-003 · Application shell replaces the create-next-app scaffold
`todo` · `█████░░░░░░░░░░░░░░░` 25%

**Spec:** FR-27 · NFR-9 · NFR-10 · DESIGN_GUIDELINES §5, §6, §8
**Depends on:** T-002

`app/page.tsx` still renders the Next.js starter page.

- [x] `app/layout.tsx` uses `lang="vi"` and Vietnamese metadata
- [ ] `app/page.tsx` no longer contains starter content
- [ ] `app/globals.css` carries the design tokens and Tailwind theme from DESIGN_GUIDELINES §8
- [ ] `npm run build` and `npm run lint` both clean

---

### T-004 · Shared type definitions
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** TECHNICAL_DESIGN §3.3
**Depends on:** T-002

The contract between crawler and website. Small, but everything downstream imports it.

- [ ] `lib/types.ts` defines `RawListing`, `RawDetail`, `NormalisedJob`
- [ ] Row types for `bank`, `job`, `crawl_run`, `crawl_result` mirror the migration exactly
- [ ] Nullability matches the schema — `cities` and `posted_date` are genuinely optional
- [ ] `npm run typecheck` clean

---

### T-005 · Level inference
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-7 (AC-7.1–7.3) · FR-8 (AC-8.1–8.3) · TECHNICAL_DESIGN §5.3
**Depends on:** T-001

Two traps that will bite if ignored: rule order is the specification (`chuyên viên cao cấp`
must beat `chuyên viên`), and matching must use whole phrases with word boundaries —
`"Cộng tác viên"` contains `viên` and must not match `nhân viên`.

- [ ] `lib/levels.ts` holds an ordered rule table plus Vietnamese labels
- [ ] Matching runs on `toSearch(title)` with word boundaries, never `includes()`
- [ ] Unmatched titles return `uncategorized` — never null, never a guess
- [ ] Test table asserts the order-sensitive cases explicitly, including the `viên` trap
- [ ] `Testcases.md` entry written

---

### T-006 · City normalisation
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-15 (AC-15.1–15.3) · TECHNICAL_DESIGN §5.3 · TA-5
**Depends on:** T-001

**Verify at build time:** Vietnam has recently reorganised its provincial divisions. Seed from
the current official list and keep superseded names as aliases, or historical postings stop
matching.

- [ ] `lib/cities.ts` holds canonical slugs with alias lists, matched via `toSearch`
- [ ] Splits on `,` and `/`, drops a trailing country token (`"Hà Nội, VN"`)
- [ ] No match returns `null` — never `[]`, which the schema forbids by convention
- [ ] Canonical list sourced from the current official province list, with the date recorded
- [ ] `Testcases.md` entry written

---

### T-007 · Coverage list
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-28 (AC-28.4, AC-28.5) · FR-2 (AC-2.3) · ADR-0005
**Depends on:** T-002

Static code, deliberately not a database table — an uncovered bank that cannot be a row cannot
accidentally be crawled, counted, or alerted on.

- [ ] `lib/coverage.ts` lists all 13 covered banks
- [ ] VIB and Agribank listed as uncovered, each with a Vietnamese reason string
- [ ] Uncovered banks are structurally incapable of entering the crawl list
- [ ] `Testcases.md` entry written

---

### T-008 · Database: Supabase project, migration runner, initial schema
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** TECHNICAL_DESIGN §4, §8.1 · ADR-0002 · ADR-0006
**Depends on:** T-004

The restricted crawler role is one migration that makes a whole class of catastrophic mistake
impossible in the component most likely to contain a bug. Do not skip it.

- [ ] Supabase project created; both connection strings recorded as secrets, never committed
- [ ] `scripts/migrate.ts` applies numbered `.sql` files, tracked in `schema_migrations`
- [ ] `db/migrations/001_init.sql` creates `bank`, `job`, `crawl_run`, `crawl_result` with every
      CHECK constraint from §4.2 — including `job_expired_ck`
- [ ] All six indexes from §4.4 created; no index on `level` (deliberate)
- [ ] RLS enabled with no policies on every table; `anon` and `authenticated` revoked
- [ ] Crawler role granted `SELECT/INSERT/UPDATE` only — no `DELETE`, no `DROP`
- [ ] `Testcases.md` entry written

---

### T-009 · Database clients
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** TECHNICAL_DESIGN §3.3, §7 · ADR-0002
**Depends on:** T-008

- [ ] `lib/db.ts` exports two factories: crawler (direct, :5432) and web (pooler, :6543)
- [ ] Pooled client sets `prepare: false` — required by transaction-mode pooling
- [ ] Crawler client supports real transactions (`postgres` tagged templates)
- [ ] A round-trip query succeeds against the live database
- [ ] `Testcases.md` entry written

---

### T-010 · Polite HTTP wrapper
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-4 (AC-4.1–4.4) · TECHNICAL_DESIGN §8.8 · ADR-0005
**Depends on:** T-002

Centralised so no adapter can bypass it. This wrapper *is* the C-6 legal posture in code — an
adapter that fetches directly makes the site's published statement untrue.

- [ ] `crawler/http.ts` sends an identifying User-Agent with a project URL and contact
- [ ] Per-host token queue enforces ≥ 2,000 ms between requests to the same host
- [ ] `robots.txt` fetched once per host per run, cached, honoured via `robots-parser`
- [ ] GET only — the module exposes no POST
- [ ] Retry max 2 with backoff on 5xx and network errors only; never on 403 or 429
- [ ] `Testcases.md` entry written

---

### T-011 · Validation stage
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-20 (AC-20.1) · TECHNICAL_DESIGN §5.1 step 4
**Depends on:** T-004

Makes garbage loud at the boundary rather than silent in the database.

- [ ] `crawler/pipeline/validate.ts` uses zod: non-empty title, absolute https `source_url` on an
      expected host, `dedupe_key` present
- [ ] Invalid rows are dropped and counted, never written
- [ ] More than 20% dropped promotes the bank's outcome to `failure`
- [ ] `Testcases.md` entry written

---

### T-012 · Normalisation stage
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-7 · FR-8 · TECHNICAL_DESIGN §5.1 step 5, §5.3
**Depends on:** T-005, T-006, T-011

**Do not guess dates.** A wrong `posted_date` is worse than a missing one, because FR-17's
filter then silently hides the job.

- [ ] `crawler/pipeline/normalise.ts` applies NFC, `toSearch`, city map, level inference
- [ ] Parses `"12 thg 8, 2026"`, `dd/mm/yyyy`, `yyyy-mm-dd`, ISO 8601 explicitly
- [ ] Unparseable date → `NULL`; unmatched city → `NULL` with `cities_raw` preserved
- [ ] `Testcases.md` entry written

---

### T-013 · Persistence, outcomes, and the expiry guard
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-5 · FR-26 · OQ-5 · ADR-0006 · TECHNICAL_DESIGN §5.1 steps 6–7
**Depends on:** T-009, T-012

**The task where a bug destroys user data.** A scraper returning 8 of 130 postings passes any
zero-check, records `success`, and expires 122 live jobs with no alert. The `suspect` guard is
the only thing standing between that failure and silent data loss.

- [ ] `crawler/pipeline/persist.ts` runs one transaction per bank
- [ ] Outcome computed: `zero_jobs` if none found; `suspect` if previous ≥ 10 and found < 50% of
      previous; otherwise `success`
- [ ] Upsert on `(bank_id, dedupe_key)` sets `last_seen_run_id`, restores `status='active'`
- [ ] Expiry runs **only** when the outcome is `success`, scoped by `last_seen_run_id <> runId`
- [ ] Nothing is ever deleted, in any code path
- [ ] Test proves a bank returning zero expires nothing — this test is the point of the task
- [ ] `Testcases.md` entry written

---

### T-014 · SuccessFactors adapter + Vietcombank
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-1 · FR-2 · ADR-0001 · TECHNICAL_DESIGN §12 P0.6
**Depends on:** T-010, T-011

The highest-leverage adapter in the project: four of thirteen banks run on this platform, so
this parser is written once and reused three more times in T-021.

**Watch the line endings.** Git on this machine converts LF to CRLF on checkout. Recorded HTML
fixtures are committed here and parsed by tests that also run on Linux CI runners, so add
`*.html binary` (or `-text`) to a `.gitattributes` before recording the first fixture — otherwise
a fixture test can pass locally and fail in CI for reasons that look like a parser bug.

- [ ] `crawler/adapters/successfactors.ts` discovers and paginates a listing
- [ ] `crawler/banks/vietcombank.ts` config; static source, ~60 jobs across 3 pages
- [ ] Recorded HTML fixture in `crawler/fixtures/`; parser test runs offline against it
- [ ] Pagination terminates on an empty page or the configured page cap
- [ ] `Testcases.md` entry written

---

### T-015 · Resolve which platforms actually serve SHB and LPBank
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** OQ-T1 · TECHNICAL_DESIGN §10
**Depends on:** —

Research, no shippable output. Scheduled here because writing either adapter before knowing the
answer risks throwing the work away. SHB may be served by both `shb.talent.vn` and
`tuyendung.shb.com.vn`; prefer the static Talent.vn source if so — it needs no browser and
reuses the ACB adapter.

- [ ] SHB's serving platform confirmed by direct inspection and recorded
- [ ] LPBank's platform after the `jobs.` → `tuyendung.` redirect confirmed and recorded
- [ ] Finding written into `crawler/banks/` config comments, and T-024 / T-028 updated

---

### T-016 · VietinBank — the headless-browser decision
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-3 (AC-3.1) · C-4 · ADR-0003 · TECHNICAL_DESIGN §12 P0.8
**Depends on:** T-010, T-011

**Timeboxed spike.** This single investigation determines whether Playwright enters the project
at all — which affects crawl wall-clock, Actions minutes, and fragility for every JS bank after
it. Always try the site's own JSON endpoint before reaching for a browser.

- [ ] Network tab inspected for an XHR/JSON endpoint behind the job list
- [ ] Endpoint found → `crawler/adapters/json-api.ts` written (generic: endpoint + field map)
- [ ] No endpoint → `crawler/adapters/browser.ts` with Playwright chromium, installed conditionally
- [ ] `crawler/banks/vietinbank.ts` returns ≥ 1 job with a non-null title
- [ ] Decision and reasoning recorded for the remaining JS banks
- [ ] `Testcases.md` entry written

---

### T-017 · Bank seeding
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** TECHNICAL_DESIGN §4.1 · ADR-0001
**Depends on:** T-008, T-014

Adapter configuration lives in code; the database holds display fields only. This script is what
stops the two drifting.

- [ ] `scripts/seed-banks.ts` syncs `bank` rows from `crawler/banks/*.ts`
- [ ] `id` values are hand-assigned and stable across a database rebuild
- [ ] Re-running is idempotent
- [ ] `Testcases.md` entry written

---

### T-018 · Crawl orchestrator
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-1 · FR-5 · FR-6 (AC-6.1–6.3) · TECHNICAL_DESIGN §5.1
**Depends on:** T-013, T-014, T-016, T-017

The exit code is a signal about a finished run, never an abort — it fires **after** every commit,
so an alert can never imply data loss.

- [ ] `crawler/index.ts` inserts `crawl_run`, loops banks at concurrency 3, catches per bank
- [ ] One bank's failure cannot affect another (AC-5.1) — separate transactions, isolated errors
- [ ] `crawl_run.status` resolves to `ok` / `degraded` / `failed`; `git_sha` recorded
- [ ] Per-bank Markdown table written to `$GITHUB_STEP_SUMMARY`, **grouped by platform** so a
      whole platform failing reads as one incident
- [ ] Exits non-zero if any bank is `failure`, `zero_jobs`, or `suspect`, after all commits
- [ ] `blocked` (robots) and disabled banks never alert
- [ ] `Testcases.md` entry written

---

### T-019 · Scheduled crawl workflow
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-1 (AC-1.1) · ADR-0003 · TECHNICAL_DESIGN §8.1
**Depends on:** T-018

- [ ] `.github/workflows/crawl.yml` on cron `0 1,13 * * *` plus `workflow_dispatch`
- [ ] `DATABASE_URL` as an Actions secret; the pooled URL never appears here
- [ ] `concurrency: { group: crawl, cancel-in-progress: false }`
- [ ] Startup step marks `crawl_run` rows stuck in `running` for over 6 hours as `failed`
- [ ] A manual dispatch completes and writes rows

---

### T-020 · P0 exit gate
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** PRD §17 P0
**Depends on:** T-019

Adjudicated on the crawl log, not on the checkboxes above.

- [ ] Vietcombank (static) returned real jobs on two consecutive **scheduled** runs
- [ ] VietinBank (JS-rendered) did the same
- [ ] Neither run required manual intervention
- [ ] `crawl_result` shows a per-bank outcome for both

---

# P1 — Data foundation

**Exit gate (PRD §17):** 13 of 13 covered banks return jobs on the same run; a deliberately
broken scraper produces an alert within one cycle **and expires nothing**.

**Progress:** `░░░░░░░░░░░░░░░░░░░░` 0% · 14 tasks

---

### T-021 · Three more SuccessFactors banks
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-2 · ADR-0001
**Depends on:** T-014

Techcombank, Sacombank, VPBank. Three config files, no new parser — this is ADR-0001 paying for
itself and the fastest coverage win available. If it turns into three adapters, PA-3 was wrong
and the phase estimate moves.

- [ ] Three configs in `crawler/banks/`, no changes to the adapter
- [ ] Each returns ≥ 1 job on a manual run
- [ ] Fixture test per bank
- [ ] `Testcases.md` entry written

---

### T-022 · Talent.vn adapter — ACB
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-2 · FR-3
**Depends on:** T-010, T-015

~32 pages. Check pagination termination carefully: a paginator that stops early is exactly the
partial-return failure the `suspect` guard exists to catch, and it is better not to trigger it.

- [ ] `crawler/adapters/talent-vn.ts` with fixture test
- [ ] `crawler/banks/acb.ts` returns the full result set, not the first page
- [ ] Page count asserted against the live site at least once
- [ ] `Testcases.md` entry written

---

### T-023 · Taleo adapter — MSB
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-2 · FR-3
**Depends on:** T-010

- [ ] `crawler/adapters/taleo.ts` with fixture test
- [ ] `crawler/banks/msb.ts` returns ≥ 1 job
- [ ] `Testcases.md` entry written

---

### T-024 · Shared VN careers platform — MB and SHB
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-2 · FR-3 · OQ-T1
**Depends on:** T-015, T-022

SHB's home depends on T-015's finding — it may belong to T-022 instead.

- [ ] `crawler/adapters/vn-careers.ts` with fixture test
- [ ] `crawler/banks/mb.ts` returns ≥ 1 job
- [ ] SHB routed to whichever adapter T-015 established, returning ≥ 1 job
- [ ] `Testcases.md` entry written

---

### T-025 · BIDV
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-2 · FR-3 (AC-3.1)
**Depends on:** T-016

JSON endpoint first, browser second. Same order for T-026 through T-028.

- [ ] Endpoint investigated before any browser work
- [ ] `crawler/banks/bidv.ts` returns ≥ 1 job with a non-null title
- [ ] Fixture test
- [ ] `Testcases.md` entry written

---

### T-026 · TPBank
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-2 · FR-3 (AC-3.1)
**Depends on:** T-016

- [ ] Endpoint investigated before any browser work
- [ ] `crawler/banks/tpbank.ts` returns ≥ 1 job
- [ ] Fixture test
- [ ] `Testcases.md` entry written

---

### T-027 · HDBank
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-2 · FR-3 (AC-3.1)
**Depends on:** T-016

- [ ] Endpoint investigated before any browser work
- [ ] `crawler/banks/hdbank.ts` returns ≥ 1 job
- [ ] Fixture test
- [ ] `Testcases.md` entry written

---

### T-028 · LPBank
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-2 · FR-3 (AC-3.1) · OQ-T1
**Depends on:** T-015, T-016

- [ ] Platform confirmed per T-015 (the `jobs.` → `tuyendung.` redirect)
- [ ] `crawler/banks/lpbank.ts` returns ≥ 1 job
- [ ] Fixture test
- [ ] `Testcases.md` entry written

---

### T-029 · Delta hydration, HTML sanitising, truncation
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-19 (AC-19.2) · TECHNICAL_DESIGN §5.1 step 3, §8.6, §8.7 · OQ-T5
**Depends on:** T-013

Two separate concerns that must land together. Hydrating blindly is 9 minutes of detail fetches
for the static banks alone; and `description_html` is untrusted third-party HTML headed for
`dangerouslySetInnerHTML`, so it is sanitised **at ingest** — one code path, one place to get right.

- [ ] Detail pages fetched only for unknown `dedupe_key`s or changed titles
- [ ] An individual hydrate failure degrades that one job to listing-only, never fails the bank
- [ ] `sanitize-html` with a tight allowlist; `a` forced to `rel="nofollow noopener"`
- [ ] Truncated at 50 KB, with the truncation recorded
- [ ] First full hydration run manually per bank via `workflow_dispatch`, outside the schedule
- [ ] `Testcases.md` entry written

---

### T-030 · Arm the `suspect` guard against real volume data
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** OQ-5 · OQ-T3 · ADR-0006 · R-1
**Depends on:** T-013, T-021, T-024

- [ ] `previous_success_count` read per bank from `crawl_result` history
- [ ] Ratio 0.5, armed only when the previous count ≥ 10
- [ ] A bank marked `suspect` still upserts its jobs and expires nothing
- [ ] `Testcases.md` entry written

---

### T-031 · Prove the alerting path end to end
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-6 (AC-6.1–6.3) · OQ-6 · R-1 · R-7
**Depends on:** T-019, T-030

Half the P1 exit gate, and the only way to know the alert works is to break something on purpose.

- [ ] A selector deliberately broken on one bank
- [ ] The failed-workflow email arrives within one cycle and names the bank
- [ ] The step summary distinguishes `failure` from `zero_jobs` from `suspect`
- [ ] **Nothing was expired** — verified in SQL, not assumed
- [ ] Selector restored; the next run reconciles cleanly

---

### T-032 · Keepalive workflow
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** ADR-0003 §5 · F-6 · R-7
**Depends on:** T-019

GitHub disables scheduled workflows in a repository with 60 days of inactivity, and a workflow
that never starts cannot send a failure email. This is prevention for a failure mode with no
detection until T-062.

- [ ] `.github/workflows/keepalive.yml` commits monthly
- [ ] Verified not to trigger a Vercel rebuild loop

---

### T-033 · Continuous integration
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** TECHNICAL_DESIGN §8.5 · `Testcases.md` finding 1
**Depends on:** T-002

**Known trap, already diagnosed:** `npm run typecheck` fails on a clean checkout until
`next build` has run once, because `app/layout.tsx` uses `LayoutProps<"/">`, a type Next.js 16
generates into `.next/types/`. CI must build before it typechecks or its first run fails for a
reason that looks like a type error and is not.

- [ ] `.github/workflows/ci.yml` runs `next build` **before** `typecheck`, then `vitest`
- [ ] `scripts/check-forbidden-files.ts` fails the build when `git ls-files` matches `*.pdf`,
      `CV_folder/`, `.env*`, or `.claude/agent-memory/` (the last added by T-002's finding —
      agent memory holds the maintainer's personal profile notes)
- [ ] The forbidden-file check verified by committing a dummy PDF on a branch and watching CI fail
- [ ] `Testcases.md` entry written

---

### T-034 · P1 exit gate
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** PRD §17 P1
**Depends on:** T-021…T-033

- [ ] All 13 covered banks returned jobs on the **same** run
- [ ] Total live postings ≥ 200 (PRD §5 sanity check)
- [ ] T-031's deliberate break alerted within one cycle and expired nothing
- [ ] Database size checked against the 500 MB budget and recorded

---

# P2 — Public site

**Exit gate (PRD §17):** Flow A completes end to end at **320px** within the NFR-1/NFR-2 budgets;
the coverage page names all 13 covered and both uncovered banks.

**Progress:** `░░░░░░░░░░░░░░░░░░░░` 0% · 16 tasks

Every page is a Server Component. Client islands only for the search input, filter controls, and
save/follow buttons. Filter state lives **entirely** in the URL — that is what makes US-16 free
and NFR-15 satisfiable, and no task here may introduce filter state that exists only in client
memory.

---

### T-035 · Screen specifications from `ux-designer`
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** TECHNICAL_DESIGN §6 · DESIGN_GUIDELINES §9
**Depends on:** —

Hand off §6's architectural constraints **before** P2 starts, not during it. Every optional field
needs a designed absent state: `posted_date` and `cities` being NULL are common, not edge cases.

- [ ] §6 constraints handed to `ux-designer` (URL structure, available fields, rendering model)
- [ ] Spec for the list screen, including all states from PRD §10
- [ ] Spec for the detail screen, including absent description
- [ ] Vietnamese microcopy specified for every state, not left to build time

---

### T-036 · Search and filter query builder
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-13 · FR-14 (AC-14.3) · FR-15–FR-18 · TECHNICAL_DESIGN §5.2 · ADR-0004
**Depends on:** T-009, T-001

The design rule that delivers FR-8 and AC-15.3: **an absent filter adds no predicate**, so
uncategorized levels and undetermined cities are included by default. Getting this backwards
silently hides jobs, which is the one thing this product must never do.

- [ ] One conditional query; predicates added only when a filter is present
- [ ] `q` folded through `toSearch` into an AND-ed prefix `tsquery` against `search_tsv`
- [ ] Inputs clamped: page ≤ 200, `q` ≤ 100 chars, unknown city/level slugs ignored not passed
- [ ] `ORDER BY posted_date DESC NULLS LAST, id DESC` (AC-12.2)
- [ ] Recency filter compares in the database (`posted_date >= current_date - $days`), avoiding
      the UTC-versus-Vietnam off-by-one-day
- [ ] Test proves AC-14.3: a diacritic-insensitive query returns nothing sharing no meaningful term
- [ ] `Testcases.md` entry written

---

### T-037 · Filter option lists
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-15 (AC-15.2, AC-15.3) · FR-16 (AC-16.3) · TECHNICAL_DESIGN §5.2
**Depends on:** T-036

- [ ] Cities, levels and banks queried from live data — no empty options
- [ ] "Không xác định" offered explicitly for undetermined city
- [ ] "Chưa phân loại" offered explicitly as a level option
- [ ] `revalidate: 900` — the only query in the product worth caching
- [ ] `Testcases.md` entry written

---

### T-038 · Home list page
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-10 · FR-12 · FR-18 · NFR-15 · US-16
**Depends on:** T-036, T-037, T-039

- [ ] `/` is a Server Component reading `searchParams`
- [ ] All filters round-trip through the URL; a pasted URL reproduces the exact result set
- [ ] Search input is a debounced client island that pushes to the URL
- [ ] Every row identifies its bank without opening the job (AC-10.2)
- [ ] `Testcases.md` entry written

---

### T-039 · Job card component
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-9 (AC-9.1) · FR-10 · DESIGN_GUIDELINES §9.2, §3
**Depends on:** T-035

The most important component in the product, and the place the confidence ladder is enforced: an
inferred level must never be presented as a fact stated by the employer.

- [ ] Renders title, bank ticker, cities, level, posted date
- [ ] Inferred level visibly labelled as inferred
- [ ] Absent `cities` and absent `posted_date` have designed states, not blanks
- [ ] No bank logos — text ticker badges per §9.1
- [ ] `Testcases.md` entry written

---

### T-040 · Pagination
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** TECHNICAL_DESIGN §6.3 · DESIGN_GUIDELINES §9.15
**Depends on:** T-038

Pagination, not infinite scroll — infinite scroll needs client state, breaks the shareable URL,
and indexes badly.

- [ ] 20 rows per page, page number in the URL
- [ ] Count query shares the list query's predicates
- [ ] Keyboard-operable, with accessible current-page indication
- [ ] `Testcases.md` entry written

---

### T-041 · Job detail page
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-19 (AC-19.1, AC-19.2) · AC-9.2 · NFR-15
**Depends on:** T-036

- [ ] `/viec-lam/<id>-<slug>`; `id` authoritative, slug decorative and diacritic-free
- [ ] A wrong slug 301s to the correct URL
- [ ] The **original, unmodified** title is displayed
- [ ] Absent fields render as absent — never a placeholder or a fabricated value
- [ ] `Testcases.md` entry written

---

### T-042 · Description rendering and the apply hand-off
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-20 (AC-20.1–20.3) · NG-3 · TECHNICAL_DESIGN §8.7 · DESIGN_GUIDELINES §9.10
**Depends on:** T-029, T-041

`description_html` is the only XSS vector in the product. It is already sanitised at ingest; the
containment is that exactly one component renders it.

- [ ] A single dedicated component owns `dangerouslySetInnerHTML`; no other field ever uses it
- [ ] Apply CTA links to the bank's own domain and makes leaving explicit
- [ ] No CV upload, application form, or file input exists anywhere in the product (AC-20.2)
- [ ] `Testcases.md` entry written

---

### T-043 · Freshness indicator **and** per-bank staleness notice
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-11 (AC-11.1–11.4) · **FR-29 (AC-29.1–29.6)** · G-2 · R-7
**Depends on:** T-038

**These ship together or not at all** — the PRD states the coupling twice. The global indicator
advances on `degraded` runs (OQ-9 Option B), which is only honest because per-bank staleness is
surfaced separately. Shipping FR-11 without FR-29 announces "updated 1 hour ago" while a bank
sits broken for days — strictly worse than the wording the amendment replaced.

- [ ] Global indicator from `MAX(finished_at) WHERE status IN ('ok','degraded')`, in Vietnamese
      elapsed form, visible without scrolling at 320px
- [ ] Per-bank last-success query drives a notice past two crawl cycles
- [ ] The notice names **which** bank and **how long** — never "some data may be out of date"
- [ ] A stale bank's postings remain listed and searchable (AC-29.4)
- [ ] The notice clears automatically on the next success (AC-29.5)
- [ ] Threshold is one configurable value, not per bank (AC-29.6)
- [ ] `Testcases.md` entry written

---

### T-044 · Per-bank page
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-29 · TECHNICAL_DESIGN §6.1
**Depends on:** T-043

- [ ] `/ngan-hang/<slug>` lists that bank's active jobs
- [ ] Shows that bank's own last-refreshed time
- [ ] Natural home for the follow button added in T-054
- [ ] `Testcases.md` entry written

---

### T-045 · Coverage page
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-28 (AC-28.1–28.5) · ADR-0005 · DESIGN_GUIDELINES §9.13
**Depends on:** T-007

The rationale matters for the tone: a candidate who knows VIB is hiring and finds nothing
concludes the site is broken. This page must read as a plain statement of scope — not an apology,
not an error.

- [ ] `/pham-vi-du-lieu` names all 13 covered banks
- [ ] Names VIB and Agribank with a short Vietnamese reason each
- [ ] Reachable from navigation, without an account and without a search
- [ ] Rendered from `lib/coverage.ts`, not from the database
- [ ] `Testcases.md` entry written

---

### T-046 · Data posture page
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** C-6 · NFR-13 · R-5
**Depends on:** T-003

This page is the product's entire legal position, and the crawler's User-Agent points at it, so
the URL must be live before T-060.

- [ ] `/ve-du-lieu` states what is collected, attribution, non-substitution, crawling practice
- [ ] States the removal contact route
- [ ] The URL matches the one in the crawler's User-Agent string
- [ ] `Testcases.md` entry written

---

### T-047 · Empty, error and stale states
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-18 (AC-18.2) · FR-27 (AC-27.1) · PRD §10 · DESIGN_GUIDELINES §9.12
**Depends on:** T-035, T-038

- [ ] Every state from PRD §10 designed and built: loading, populated, empty combination,
      search-no-results, stale data, partial crawl failure
- [ ] Not one English string is visible in any state, including errors
- [ ] Dates formatted in Vietnamese, rendered in `Asia/Ho_Chi_Minh`
- [ ] `Testcases.md` entry written

---

### T-048 · Accessibility pass
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** NFR-9 · NFR-10 · DESIGN_GUIDELINES §10
**Depends on:** T-038, T-041, T-047

320px is the floor that must not break — WCAG 1.4.10 requires no two-dimensional scrolling there.

- [ ] No horizontal scrolling on list or detail at 320px
- [ ] Full keyboard pass: search, filters, pagination, apply link
- [ ] Contrast meets WCAG 2.1 AA; focus is visibly indicated everywhere
- [ ] Filter results announced as a status message (4.1.3) — the criterion this product most
      depends on
- [ ] Automated audit clean
- [ ] `Testcases.md` entry written

---

### T-049 · Performance measurement
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** NFR-1 · NFR-2 · OQ-T7
**Depends on:** T-038, T-041

Ship without a cache and measure. Premature `unstable_cache` keyed on filter permutations buys a
cache-invalidation problem for nothing.

- [ ] Search and filter render within 2s on a throttled 4G profile with real data
- [ ] Initial list load within 3s on the same profile
- [ ] `EXPLAIN ANALYZE` run on the list query; index usage confirmed
- [ ] OQ-T7 answered with a measurement, and the answer recorded

---

### T-050 · P2 exit gate
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** PRD §17 P2
**Depends on:** T-035…T-049

- [ ] Flow A completes end to end at 320px: land, search, filter, open, apply
- [ ] NFR-1 and NFR-2 budgets met with a representative dataset
- [ ] Coverage page names all 13 covered and both uncovered banks
- [ ] A diacritic-free search returns the posting from AC-14.1

---

# P3 — Accounts

**Exit gate (PRD §17):** Flow B completes across two separate sessions; a saved job survives its
source posting disappearing.

**Progress:** `░░░░░░░░░░░░░░░░░░░░` 0% · 8 tasks

The site is fully useful without any of this (FR-21), so this phase can ship after P4 if P2 is
launch-ready sooner.

---

### T-051 · Session handling
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-22 · NFR-11 · ADR-0002
**Depends on:** T-003

- [ ] `@supabase/ssr` cookie sessions wired through middleware
- [ ] `NEXT_PUBLIC_*` keys are the only Supabase keys in the client bundle
- [ ] `SUPABASE_SERVICE_ROLE_KEY` exists nowhere in the project
- [ ] `Testcases.md` entry written

---

### T-052 · Sign-in and registration
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-22 (AC-22.1, AC-22.2) · FR-21 · FR-27 · DESIGN_GUIDELINES §9.16
**Depends on:** T-051

- [ ] `/dang-nhap` and `/dang-ky`, entirely in Vietnamese
- [ ] `?next=` returns the user to where they were
- [ ] No content anywhere becomes gated by adding these (AC-21.2)
- [ ] `Testcases.md` entry written

---

### T-053 · User tables
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-24 · FR-25 · FR-26 · TECHNICAL_DESIGN §4.5
**Depends on:** T-008

`saved_job.job_id` deliberately has **no** `ON DELETE CASCADE`: jobs are never deleted, and the
plain foreign key means a future accidental `DELETE FROM job` fails loudly instead of quietly
erasing people's saved jobs.

- [ ] `db/migrations/002_user_tables.sql` creates `saved_job` and `followed_bank`
- [ ] `user_id` cascades from `auth.users`; `job_id` does **not** cascade
- [ ] Both user indexes created; RLS enabled with no policies
- [ ] Migration rehearsed on the second free Supabase project first
- [ ] `Testcases.md` entry written

---

### T-054 · Save and follow actions
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-24 · FR-25 (AC-25.3) · NFR-11 · F-15
**Depends on:** T-052, T-053

One line carries the entire authorisation model: `user_id` comes from the verified session and
**never** from a form field or query parameter.

- [ ] Server Actions for save, unsave, follow, unfollow
- [ ] `user_id` read only from `supabase.auth.getUser()`
- [ ] Signed-out save redirects to sign-in and completes afterwards
- [ ] Following a bank produces no email or notification (AC-25.3)
- [ ] `Testcases.md` entry written

---

### T-055 · Saved jobs list
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-26 (AC-26.1–26.3) · DESIGN_GUIDELINES §9.4
**Depends on:** T-054

The query deliberately has no status filter — expired jobs are returned and labelled. §9.4 calls
the alternative an anti-pattern that must not happen.

- [ ] `/da-luu` returns saved jobs including expired ones
- [ ] Expired jobs are visibly marked as no longer available
- [ ] No apply link is presented as live for an expired job
- [ ] Verified by expiring a saved job directly in SQL
- [ ] `Testcases.md` entry written

---

### T-056 · Followed banks
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** FR-25 (AC-25.1, AC-25.2)
**Depends on:** T-054

- [ ] `/theo-doi` lists followed banks and their jobs
- [ ] Unfollow works and persists across sessions
- [ ] `Testcases.md` entry written

---

### T-057 · Authorisation review checkpoint
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** NFR-11 · F-15 · TECHNICAL_DESIGN §12 P3.24
**Depends on:** T-055, T-056

An explicit checkpoint, not a task that produces code. F-15 — user A seeing user B's saved jobs —
has no automatic detection, so a deliberate review is the only control.

- [ ] Every query touching a user table audited for a session-derived `user_id` filter
- [ ] No user identifier is accepted from a form field, query parameter, or client payload
- [ ] Tested with two accounts in two browsers simultaneously
- [ ] Finding recorded in `Testcases.md` whether or not anything was wrong

---

### T-058 · P3 exit gate
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** PRD §17 P3
**Depends on:** T-051…T-057

- [ ] Flow B completes across two genuinely separate sessions
- [ ] A saved job survived its source posting disappearing from the bank site
- [ ] A signed-in and a signed-out user get identical results for the same query (AC-23.1)

---

# P4 — Launch

**Exit gate (PRD §17):** the site is publicly reachable and serving non-owner traffic (G-5).

**Progress:** `░░░░░░░░░░░░░░░░░░░░` 0% · 8 tasks

---

### T-059 · Product name and domain
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** OQ-1 · G-5
**Depends on:** —

**Owner decision.** "BankJobs VN" is a placeholder for readability; `vieclam-nganhang` is an npm
package name, not a product name.

- [ ] Name chosen
- [ ] Domain registered or a free subdomain accepted
- [ ] Name applied to metadata, the coverage page, and the crawler User-Agent

---

### T-060 · Production deployment
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** NFR-7 · C-1 · TECHNICAL_DESIGN §8.1, §8.5
**Depends on:** T-050, T-059

- [ ] Vercel project connected; deploys on push to `main`
- [ ] `DATABASE_URL_POOLED` and the two `NEXT_PUBLIC_SUPABASE_*` values set
- [ ] The direct-connection URL is **not** present in Vercel's environment
- [ ] Migrations confirmed to run manually only, never on deploy
- [ ] Deployed site serves real data

---

### T-061 · Analytics and the outbound-click metric
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** OQ-2 · OQ-T4 · G-3
**Depends on:** T-060

The fallback breaks the "website is read-only against the database" property. Accept it only if
Vercel's tier genuinely does not work, and record the decision if you do.

- [ ] Vercel Web Analytics enabled; Hobby event cap and custom-event support verified
- [ ] Outbound apply clicks captured
- [ ] Returning-visitor measurement available
- [ ] If the fallback was needed, the trade-off recorded as an ADR

---

### T-062 · Health endpoint and external monitor
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** OQ-T2 · F-6 · R-7 · TECHNICAL_DESIGN §8.3
**Depends on:** T-060

Closes the one monitoring gap in the whole system: a workflow that never starts cannot send a
failure email, so nothing else detects a crawler that has stopped entirely.

- [ ] `/api/health` returns 503 when the last successful crawl is older than 26 hours
- [ ] A free external cron monitor points at it and alerts the maintainer
- [ ] Verified by pointing the check at a deliberately stale threshold
- [ ] `Testcases.md` entry written

---

### T-063 · Verify every platform limit
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** TECHNICAL_DESIGN §8.2 · R-8 · TA-3
**Depends on:** T-060

Eight rows in §8.2, five of which have never been checked. Vendor limits change; the design
asserts none of them.

- [ ] Vercel Hobby limits **and non-commercial terms** verified (TA-3)
- [ ] GitHub Actions public-repo minute policy verified
- [ ] Supabase pooler transaction-mode behaviour verified
- [ ] Each bank's `robots.txt` re-checked — one may exclude a covered bank
- [ ] Every row in §8.2 dated with the check

---

### T-064 · Removal contact is live and monitored
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** C-6 · NFR-13 · R-5 · A-8
**Depends on:** T-046, T-060

- [ ] The contact route on `/ve-du-lieu` is real and reaches the maintainer
- [ ] A test message sent and received
- [ ] The crawler's User-Agent URL resolves to the live page

---

### T-065 · Confirm the success metrics
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** OQ-2 · PRD §5
**Depends on:** T-061

**Owner decision.** Until this is confirmed, PRD §5 is a recommendation, not authoritative.

- [ ] The authoritative metric set chosen and PRD §5 updated to match
- [ ] Every goal G-1…G-5 still has at least one metric (metric hygiene)
- [ ] Each chosen metric is actually instrumented by T-061

---

### T-066 · P4 exit gate
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** PRD §17 P4 · G-5
**Depends on:** T-059…T-065

- [ ] Site publicly reachable at a stable URL
- [ ] It has served real, non-owner traffic
- [ ] The C-6 posture is published and the removal contact is monitored
- [ ] Total spend is 0 VND, verified in each vendor's billing view

---

# P5 — Observe

**Exit gate (PRD §17):** OQ-2's metrics are measurable and either met or explicitly revised.

**Progress:** `░░░░░░░░░░░░░░░░░░░░` 0% · 4 tasks

Four tasks, all of which replace a guess with a measurement. None can start until 30 days of real
`crawl_result` history exists.

---

### T-067 · Tune the `suspect` ratio against real variance
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** OQ-T3 · ADR-0006
**Depends on:** T-066

0.5 is a guess with no data behind it. The asymmetry stays: prefer a false alert to silent data loss.

- [ ] 30 days of `crawl_result` reviewed for per-bank volume variance
- [ ] Ratio confirmed or changed, with the data recorded
- [ ] Per-bank overrides added for any genuinely spiky bank
- [ ] `Testcases.md` entry written if code changed

---

### T-068 · Decide the caching question with a measurement
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** OQ-T7 · NFR-1 · NFR-2
**Depends on:** T-066

- [ ] Real query timings collected from production
- [ ] Caching added only if a measurement demands it, filter-option lists first
- [ ] Decision recorded either way

---

### T-069 · Database size review
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** OQ-T6 · TECHNICAL_DESIGN §8.6
**Depends on:** T-066

At 400 MB the first move is dropping `description_html` for long-expired jobs — **not** deleting
rows, because saved jobs must still resolve (FR-26).

- [ ] Actual size measured against the 500 MB budget
- [ ] `description_html` average size checked against assumption TA-4
- [ ] Trigger point and first action recorded

---

### T-070 · Measure the launch metrics
`todo` · `░░░░░░░░░░░░░░░░░░░░` 0%

**Spec:** OQ-2 · PRD §5 · G-1…G-5
**Depends on:** T-065, T-066

- [ ] 13/13 coverage measured over 30 days
- [ ] Crawl success rate measured against the ≥ 95% target
- [ ] Outbound click-through measured against the ≥ 25% target
- [ ] Each target met, or explicitly revised with the reasoning recorded

---

## The four tasks most likely to hurt

Not a phase — a standing list of where this plan expects trouble. Reviewed at each phase gate.

| Task | Why | What makes it survivable |
|---|---|---|
| **T-013** Persistence and the expiry guard | A bug here destroys user data silently. The 8-of-130 partial return passes every naive check | The test that proves a zero-return expires nothing is written *before* the code that could violate it |
| **T-016** VietinBank spike | Decides whether Playwright enters the project, which changes crawl time, Actions minutes and fragility for five more banks | Timeboxed, and the JSON-endpoint route is tried first every time |
| **T-029** Hydration and sanitising | The only XSS vector in the product, plus the only unbounded storage field | Sanitised at ingest, rendered through exactly one component, truncated at 50 KB |
| **T-043** Freshness plus FR-29 | Under build pressure the per-bank notice is the easy thing to drop, and dropping it converts an honest indicator into a misleading one | The PRD states the coupling twice, and this plan refuses to split the task |
