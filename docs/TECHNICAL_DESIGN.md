# Technical Design — Vietnamese Banking Jobs Aggregator

| Field | Value |
|---|---|
| **Version** | 1.0 |
| **Status** | Proposed — ready to build |
| **Date** | 2026-08-13 |
| **Author** | tech-architect |
| **Source of truth for requirements** | [`PRD.md`](../PRD.md) v0.1 |
| **Working package name** | `vieclam-nganhang` (lowercase placeholder — PRD OQ-1 is undecided; `create-next-app` rejects `CV_reviewer` because npm package names cannot contain capitals) |

**Companion ADRs** — read these for the reasoning behind the choices below; this document states
the design, the ADRs state why the alternatives lost.

| ADR | Decision |
|---|---|
| [0001](adr/0001-platform-adapters-over-per-bank-scrapers.md) | Platform adapters + per-bank config, not 15 bespoke scrapers |
| [0002](adr/0002-supabase-for-database-and-auth.md) | Supabase Postgres + Supabase Auth |
| [0003](adr/0003-crawler-on-github-actions.md) | Crawler on GitHub Actions, public repository |
| [0004](adr/0004-diacritic-insensitive-vietnamese-search.md) | Diacritic-insensitive search via an app-normalised column |
| [0005](adr/0005-no-anti-bot-evasion.md) | No evasion; VIB and Agribank deliberately uncovered |
| [0006](adr/0006-job-identity-and-soft-expiry.md) | Job identity, soft expiry, never-expire-on-doubt guard |

---

## 1. Context

### 1.1 What is being built

A Vietnamese-language website that aggregates job postings from Vietnamese commercial banks into a
single searchable list. A background crawler refreshes the data every 12 hours; the website reads
that data and links out to each bank's own application page. It is a directory: it never receives,
stores, or forwards an application (PRD NG-3).

### 1.2 The requirements that shape the architecture

Most of the PRD is product surface. Six requirements actually determine the shape of the system:

| Requirement | Architectural consequence |
|---|---|
| **§4 / NG-9 / AC-1.3** — no crawl on page load | A hard split: the crawler and the website are separate programs, on separate hosts, communicating only through the database. Nothing in the web request path may reach a bank site. |
| **NFR-4** — site serves last-known-good data when a crawl fails | The website is read-only against the database and has no runtime dependency on the crawler. A dead crawler makes data old, not the site down. |
| **FR-3 / C-4** — JavaScript-rendered sources | The crawler needs an environment with a headless browser and minutes of wall-clock, which no free serverless web host provides. This is what forces the crawler off the web host. |
| **NFR-7 / C-1** — 0 VND | Every component must sit inside a free tier that exists today, with headroom. Rules out hosted search, managed scraping, proxies, and most cron-as-a-service. |
| **OQ-5 (decided)** — never expire a bank's jobs on a failed crawl | The write path needs per-bank outcome computation and a transactional guard around expiry. §5.1 and ADR-0006. |
| **FR-14 / AC-14.3** — diacritic-insensitive without becoming fuzzy | Rules out trigram similarity; drives a normalised-column + AND-ed full-text design. ADR-0004. |

### 1.3 Scope corrections applied since PRD v0.1

Recorded here because the PRD is v0.1 and has not yet absorbed them:

1. **Covered banks are 13, not 15.** VIB (WAF-protected) and Agribank (announcements, not
   postings) are deliberately excluded — ADR-0005. PRD FR-2 and AC-2.1 need updating.
2. **PRD assumption A-12 is falsified**, by VIB. Recorded, with the position that no evasion is
   built.
3. **The OQ-2 coverage metric restates to "13 of 13 covered banks returning jobs"**, with "covered"
   an explicit published subset.
4. **Headless browsing is a first-class mode, not an edge case** — 5–6 of 13 banks are JavaScript
   shells. PRD C-4 understates this.
5. **Vietnamese banks cluster onto shared HR platforms** (SuccessFactors ×4, Talent.vn, Taleo,
   a shared `tuyendung.<bank>.com.vn` platform). This is the single most useful fact discovered and
   it materially reduces R-1. ADR-0001.

### 1.4 Assumptions made in this document

| ID | Assumption | If wrong |
|---|---|---|
| TA-1 | Live posting volume across 13 banks stays under ~5,000 active rows | Index strategy in §4.4 needs revisiting; nothing else changes |
| TA-2 | JS-shell banks call a JSON endpoint the crawler can call directly | Those banks fall back to the `browser` adapter — slower and more fragile, but designed for |
| TA-3 | Vercel Hobby's non-commercial terms are satisfied (PRD NG-11: no monetisation) | If monetisation is ever added, Vercel requires a paid plan — a business decision, not a technical one |
| TA-4 | Job descriptions average well under 20 KB of sanitised HTML | The 500 MB database budget needs a truncation policy sooner; see §8.6 |
| TA-5 | Fewer than ~50 distinct city strings appear across all banks after normalisation | The city alias table in §5.3 stays hand-maintainable |

---

## 2. Architecture overview

Three components. Two of them are programs; one is a managed service. They share nothing but the
database.

```
   ┌──────────────────────────────────────────────────────────────────────┐
   │  13 BANK CAREER SITES  (public web pages — no API, no contract)      │
   │  SuccessFactors ×4 · Talent.vn · Taleo · shared VN platform · custom │
   └────────────────────────────┬─────────────────────────────────────────┘
                                │  HTTPS GET only. Identified UA.
                                │  ≥2s between requests to one domain.
                                │  robots.txt honoured.
                                ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  CRAWLER            Node.js program · GitHub Actions · cron 12h      │
   │                                                                      │
   │   for each enabled bank (bounded concurrency 3, serialised per host):│
   │     ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
   │     │ discover │→ │ hydrate  │→ │ validate │→ │normalise │→ persist  │
   │     │ (adapter)│  │(adapter, │  │  (zod)   │  │ (shared) │  (txn)    │
   │     └──────────┘  │ delta    │  └──────────┘  └──────────┘          │
   │                   │  only)   │                                       │
   │                   └──────────┘                                       │
   │   → compute per-bank outcome → upsert + (expire only if `success`)   │
   │   → write crawl_run / crawl_result → step summary → exit code        │
   └────────────────────────────┬─────────────────────────────────────────┘
                                │  WRITE  (direct conn, port 5432, txns)
                                ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  SUPABASE  (managed Postgres 500 MB free · Auth 50k MAU)             │
   │                                                                      │
   │  job · bank · crawl_run · crawl_result   ← crawler owns these writes │
   │  saved_job · followed_bank               ← website owns these writes │
   │  auth.users                              ← Supabase Auth owns this   │
   └────────────────────────────┬─────────────────────────────────────────┘
                                │  READ  (pooler, port 6543, prepare:false)
                                │  + 2 small user-scoped writes
                                ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  WEBSITE            Next.js App Router · TypeScript · Vercel Hobby   │
   │                                                                      │
   │   Server Components render every page. Client islands only for:      │
   │   search input · filter controls · save/follow buttons               │
   │                                                                      │
   │   Auth: @supabase/ssr cookie sessions ─────► Supabase Auth           │
   └────────────────────────────┬─────────────────────────────────────────┘
                                │  HTML
                                ▼
                          Job seeker's browser
                                │
                                └──► click "Ứng tuyển" ──► bank's own site
```

### 2.1 The seam that matters

The database is the only interface between the crawler and the website. That single fact delivers
NFR-4, AC-1.3, and the R-1/R-4 isolation the PRD asks for, and it is why the split is worth the
cost of two deployment targets. Everything else is negotiable; this is not.

Corollary rules, which must survive future changes:

- The website never imports a module from `crawler/`.
- The website never issues an outbound HTTP request to a bank domain, in any code path, server or
  client.
- The crawler never imports from `app/` and never needs the website to be up.
- Both import from `lib/` — the shared normalisation, taxonomy and type code (§3.3).

---

## 3. Component responsibilities

### 3.1 Crawler — `crawler/`

**Owns**

- Fetching bank career pages, politely and identifiably (FR-4).
- Extracting raw strings from HTML/JSON/rendered DOM (adapters).
- Normalisation: NFC, city mapping, level inference, date parsing, dedupe key (FR-7, FR-8).
- Deciding each bank's per-run outcome, including the `suspect` volume guard (FR-5, ADR-0006).
- All writes to `job`, `bank`, `crawl_run`, `crawl_result`.
- Emitting the maintainer alert (FR-6).

**Does not own**

- Any presentation concern. It stores Vietnamese labels for nothing; the website maps `level`
  slugs to Vietnamese strings.
- Deciding what users see. It never sets a "featured" or "quality" flag.
- Retrying across runs. A failed bank is retried by the next scheduled run, not by an internal
  queue. There is no queue.
- Deleting anything. Ever. (ADR-0006.)

### 3.2 Website — `app/`, `components/`

**Owns**

- Server-rendering every list and detail page (NFR-15).
- Translating URL query parameters into one SQL query (§5.2).
- All Vietnamese interface strings (FR-27) and all date formatting.
- Authentication session handling and the two user-scoped tables.
- Publishing the C-6 posture page and the coverage-gap statement (ADR-0005).

**Does not own**

- Any knowledge of banks' HTML, selectors, or adapters.
- Job data mutation. The only rows the website may write are `saved_job` and `followed_bank`.
  (The single exception under consideration is outbound-click logging — OQ-T4.)
- Inference. The level shown is the level the crawler stored; the website adds the "inferred"
  labelling (FR-9) but never re-computes.

### 3.3 Shared library — `lib/`

Small and deliberately boring. Imported by both sides, which is the whole point: if the crawler and
the website disagree about what "chuyen vien" normalises to, search silently breaks.

| Module | Contents |
|---|---|
| `lib/normalize.ts` | `toStorage()` (NFC), `toSearch()` (diacritic-free) — ADR-0004 |
| `lib/levels.ts` | Ordered level inference rules + Vietnamese labels |
| `lib/cities.ts` | Canonical city/province slugs + alias table |
| `lib/coverage.ts` | Static list of covered and deliberately-uncovered banks with reasons |
| `lib/db.ts` | Two connection factories (crawler: direct; web: pooled) |
| `lib/types.ts` | `RawListing`, `RawDetail`, `NormalisedJob`, row types |

### 3.4 Repository layout

A **single npm package**, not a workspace monorepo. One `package.json`, one `node_modules`, one
`tsconfig.json` with path aliases. Vercel's default root directory works with no configuration, and
there is no workspace resolution to debug. The crawler is simply a directory that Vercel never
bundles, because nothing under `app/` imports it.

```
vieclam-nganhang/
├── app/                        Next.js App Router (§6)
├── components/
├── lib/                        shared — §3.3
├── crawler/
│   ├── index.ts                orchestrator: run loop, outcomes, alerting
│   ├── http.ts                 fetch wrapper: UA, timeout, retry, rate limit, robots
│   ├── adapters/
│   │   ├── successfactors.ts   Vietcombank, Techcombank, Sacombank, VPBank
│   │   ├── talent-vn.ts        ACB (+ SHB, pending §10 OQ-T1)
│   │   ├── taleo.ts            MSB
│   │   ├── vn-careers.ts       MB (+ SHB)
│   │   ├── json-api.ts         generic: endpoint + field mapping
│   │   ├── html-list.ts        generic: CSS selectors
│   │   └── browser.ts          Playwright — last resort, ADR-0003
│   ├── banks/*.ts              13 config files, one per bank
│   ├── pipeline/               validate.ts · normalise.ts · persist.ts
│   └── fixtures/*.html|json    recorded snapshots for parser tests
├── db/migrations/*.sql         numbered, applied by scripts/migrate.ts
├── scripts/
│   ├── migrate.ts
│   ├── seed-banks.ts           syncs bank rows from crawler/banks/*.ts
│   └── check-forbidden-files.ts  fails CI if a CV/PDF/.env is tracked (§8.5)
├── .github/workflows/
│   ├── crawl.yml               cron 12h + workflow_dispatch
│   ├── ci.yml                  typecheck, tests, forbidden-file check
│   └── keepalive.yml           monthly commit — ADR-0003 §5
└── .gitignore                  CV_folder/ · *.pdf · .env*
```

**Trigger to split into workspaces:** if Vercel build time becomes a problem because of crawler
dependencies, or if the crawler's dependency set starts conflicting with Next.js's. Not before.

---

## 4. Data model

PostgreSQL. Plain `.sql` migration files applied by a ~40-line `scripts/migrate.ts` that records
applied filenames in `schema_migrations`. No ORM, no migration framework — see §7.

### 4.1 `bank`

Display and identity only. **Adapter configuration lives in `crawler/banks/*.ts`, not here**
(ADR-0001): it is code, it changes with the parser, and it must be diffable. `scripts/seed-banks.ts`
syncs the display fields from those configs so the two cannot drift.

```sql
CREATE TABLE bank (
  id            smallint     PRIMARY KEY,          -- hand-assigned, stable forever
  slug          text         NOT NULL UNIQUE,      -- 'vietcombank'
  name          text         NOT NULL,             -- 'Vietcombank'  (display)
  full_name     text         NOT NULL,             -- 'Ngân hàng TMCP Ngoại thương Việt Nam'
  careers_url   text         NOT NULL,             -- public landing page, for attribution
  platform      text         NOT NULL,             -- 'successfactors' | 'talent-vn' | ...
  is_enabled    boolean      NOT NULL DEFAULT true,-- false = do not crawl this cycle
  created_at    timestamptz  NOT NULL DEFAULT now()
);
```

`id` is hand-assigned rather than generated so that a bank's identity is stable across a database
rebuild and readable in logs.

Deliberately-uncovered banks (VIB, Agribank) are **not rows in this table**. They live in
`lib/coverage.ts` as a static list with a Vietnamese reason string, per ADR-0005 — keeping them out
of the database means they cannot accidentally be crawled, counted, or alerted on.

### 4.2 `job`

```sql
CREATE TABLE job (
  id                bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bank_id           smallint     NOT NULL REFERENCES bank(id),
  dedupe_key        text         NOT NULL,           -- 'ext:12345' | 'url:https://…'  ADR-0006
  source_url        text         NOT NULL,           -- FR-20: always on the bank's domain
  external_id       text,                            -- platform id where one exists

  title             text         NOT NULL,           -- ORIGINAL, unmodified, NFC (AC-9.2, NFR-5)
  title_search      text         NOT NULL,           -- toSearch(title)               ADR-0004
  search_tsv        tsvector     GENERATED ALWAYS AS (to_tsvector('simple', title_search)) STORED,

  cities            text[],                          -- canonical slugs; NULL = undetermined (AC-15.3)
  cities_raw        text[],                          -- as published, for growing the alias table
  level             text         NOT NULL DEFAULT 'uncategorized',
  posted_date       date,                            -- NULL = unknown (AC-12.2, AC-17.2)

  description_html  text,                            -- sanitised at ingest (§8.7); NULL if absent
  description_text  text,                            -- plain-text fallback

  status            text         NOT NULL DEFAULT 'active',
  first_seen_at     timestamptz  NOT NULL DEFAULT now(),
  last_seen_at      timestamptz  NOT NULL DEFAULT now(),
  last_seen_run_id  bigint       NOT NULL REFERENCES crawl_run(id),
  expired_at        timestamptz,

  CONSTRAINT job_dedupe_uq   UNIQUE (bank_id, dedupe_key),
  CONSTRAINT job_level_ck    CHECK (level IN ('intern','staff','officer','senior',
                                              'manager','director','uncategorized')),
  CONSTRAINT job_status_ck   CHECK (status IN ('active','expired')),
  CONSTRAINT job_expired_ck  CHECK ((status = 'expired') = (expired_at IS NOT NULL))
);
```

Notes that carry design weight:

- **`title` is never rewritten.** AC-9.2 and NFR-5 require the original. Everything derived
  (`title_search`, `level`) lives in its own column.
- **`level` is `NOT NULL DEFAULT 'uncategorized'`**, never nullable. FR-8 is a hard rule and a
  `NOT NULL` column with a default is how you make it impossible to violate by omission.
- **`cities` is nullable, and NULL means "undetermined", not "none".** AC-15.3 requires those jobs
  to remain reachable. `cities = '{}'` is forbidden by convention — use NULL.
- **`level` is a CHECK constraint, not a Postgres `enum`.** Enums are painful to extend and
  reorder; a CHECK is a one-line migration.
- `job_expired_ck` makes the invalid state — expired with no timestamp, or active with one —
  unrepresentable.

### 4.3 Crawl observability

```sql
CREATE TABLE crawl_run (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text        NOT NULL DEFAULT 'running',  -- running|ok|degraded|failed
  trigger      text        NOT NULL,                    -- schedule|manual
  git_sha      text,                                    -- which code produced this run
  CONSTRAINT crawl_run_status_ck CHECK (status IN ('running','ok','degraded','failed'))
);

CREATE TABLE crawl_result (
  run_id        bigint    NOT NULL REFERENCES crawl_run(id) ON DELETE CASCADE,
  bank_id       smallint  NOT NULL REFERENCES bank(id),
  status        text      NOT NULL,      -- success|zero_jobs|failure|suspect|blocked
  jobs_found    integer   NOT NULL DEFAULT 0,
  jobs_new      integer   NOT NULL DEFAULT 0,
  jobs_expired  integer   NOT NULL DEFAULT 0,
  duration_ms   integer,
  error         text,                    -- message + first stack frame, truncated to 2000 chars
  PRIMARY KEY (run_id, bank_id),
  CONSTRAINT crawl_result_status_ck
    CHECK (status IN ('success','zero_jobs','failure','suspect','blocked'))
);
```

`git_sha` is worth its one column: when a bank starts failing, the first question is always "did I
change something, or did they?", and this answers it from the run log alone (NFR-8).

Retention (NFR-14 asks ≥30 days): keep everything for v1. At 60 runs/month × 13 rows the table
grows by ~9,400 rows/year — irrelevant against 500 MB. Add pruning only if it ever matters.

### 4.4 Indexes — only the ones that earn their place

```sql
-- Upsert target. Also the dedupe enforcement. (created by the UNIQUE constraint)
-- job_dedupe_uq  ON job (bank_id, dedupe_key)

-- Default ordering, FR-12. Partial: only active rows are ever listed.
CREATE INDEX job_active_order_idx ON job (posted_date DESC NULLS LAST, id DESC)
  WHERE status = 'active';

-- Free-text search, FR-13/FR-14.
CREATE INDEX job_search_idx ON job USING GIN (search_tsv);

-- City filter, FR-15.
CREATE INDEX job_cities_idx ON job USING GIN (cities);

-- Expiry sweep + per-bank pages + bank staleness.
CREATE INDEX job_bank_status_idx ON job (bank_id, status);

-- User tables.
CREATE INDEX saved_job_user_idx     ON saved_job (user_id, saved_at DESC);
CREATE INDEX followed_bank_user_idx ON followed_bank (user_id);
```

**No index on `level`, and that is deliberate.** With a few thousand active rows, Postgres will
bitmap-scan or seq-scan a level filter in well under a millisecond, and every extra index is a
write cost on every crawl. Add one when `EXPLAIN ANALYZE` on real data says to — not before.
**Trigger to revisit the whole index set: >50,000 active rows.**

### 4.5 User data

There is no application `user` table. Supabase Auth owns `auth.users`; adding a mirror profile
table for zero profile fields is a table to keep in sync for no benefit.

```sql
CREATE TABLE saved_job (
  user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id    bigint      NOT NULL REFERENCES job(id),
  saved_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);

CREATE TABLE followed_bank (
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_id      smallint    NOT NULL REFERENCES bank(id),
  followed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, bank_id)
);
```

`job_id` has **no** `ON DELETE CASCADE` — jobs are never deleted (ADR-0006), and the plain foreign
key means a future accidental `DELETE FROM job` fails loudly instead of quietly removing people's
saved jobs. That is the intended behaviour.

**Every table gets `ENABLE ROW LEVEL SECURITY` with no policies, and `anon`/`authenticated` are
revoked** — see ADR-0002 §Decision. This closes Supabase's public PostgREST surface, which this
design does not use.

### 4.6 Where the requirements land

| Requirement | Enforced by |
|---|---|
| FR-8 uncategorized never hides a job | `level NOT NULL DEFAULT 'uncategorized'` + no level predicate when no filter is selected |
| AC-15.3 undetermined city reachable | `cities IS NULL`, explicit filter option, no predicate when unfiltered |
| AC-12.2 unknown posted date ordered last, not dropped | `posted_date DESC NULLS LAST` |
| FR-26 saved jobs survive | soft delete; no cascade from `job` |
| AC-9.2 original title always shown | `title` never rewritten |
| FR-20 link is on the bank's domain | `source_url` stored verbatim from the source; host asserted in the validation step |

---

## 5. Key flows

### 5.1 Crawl cycle — the flow that must be correct

```
GitHub Actions cron fires (may be 5–60 min late — ADR-0003)
│
├─ INSERT crawl_run (status='running', trigger, git_sha) → runId
│
├─ banks = enabled configs from crawler/banks/*.ts
│  bounded concurrency 3 across banks; ≥2s spacing per host (FR-4 AC-4.2)
│
├─ FOR EACH bank:
│   │
│   ├─ 1. robots.txt — fetched once per host per run, cached
│   │       disallowed → outcome 'blocked', next bank, NO ALERT
│   │
│   ├─ 2. discover(config)  →  RawListing[]
│   │       adapter paginates until an empty page or a page cap (config, default 50)
│   │       any throw → outcome 'failure', NOTHING WRITTEN, next bank
│   │
│   ├─ 3. hydrate — DELTA ONLY
│   │       fetch the detail page only for listings whose dedupe_key is unknown
│   │       or whose title changed. First run: all. Steady state: a handful.
│   │       (This is both a politeness measure and what keeps run time sane —
│   │        261 static jobs × 2s of detail fetches is 9 minutes if done blindly.)
│   │       an individual hydrate failure degrades that one job to listing-only
│   │       data; it does NOT fail the bank.
│   │
│   ├─ 4. validate (zod)  — title non-empty, source_url absolute https and on an
│   │       expected host, dedupe_key present. Invalid rows are dropped and counted;
│   │       >20% dropped promotes the bank to 'failure'.
│   │
│   ├─ 5. normalise (shared) — NFC · toSearch · city map · level infer · date parse
│   │
│   ├─ 6. OUTCOME  (ADR-0006)
│   │       found == 0                                 → 'zero_jobs'
│   │       prev >= 10 AND found < 0.5 × prev          → 'suspect'
│   │       otherwise                                  → 'success'
│   │
│   └─ 7. PERSIST — one transaction per bank:
│           BEGIN
│             upsert every job     ON CONFLICT (bank_id, dedupe_key) DO UPDATE
│                                  SET …, last_seen_at=now(), last_seen_run_id=runId,
│                                      status='active', expired_at=NULL
│             IF outcome = 'success':
│               UPDATE job SET status='expired', expired_at=now()
│                 WHERE bank_id=$b AND status='active' AND last_seen_run_id <> runId
│             ELSE: expire nothing            ◄── THE GUARD (OQ-5)
│             INSERT crawl_result
│           COMMIT
│
├─ UPDATE crawl_run SET finished_at=now(),
│     status = 'ok'       if every bank is 'success'
│              'degraded' if some succeeded and some did not
│              'failed'   if none succeeded
│
├─ write a per-bank Markdown table to $GITHUB_STEP_SUMMARY, grouped by platform
│     (a whole platform failing at once must be legible as ONE incident — ADR-0001)
│
└─ process.exit(anyBankIn(['failure','zero_jobs','suspect']) ? 1 : 0)
      ◄── AFTER all commits. The exit code is a signal about a finished run,
          never an abort. GitHub's failed-workflow email is the FR-6 channel.
```

Three properties this flow guarantees, which are worth stating because they are the ones a future
refactor will break:

1. **A bank's failure cannot affect another bank** (AC-5.1) — separate transactions, errors caught
   per bank.
2. **No crawl outcome except `success` can expire anything** (OQ-5, AC-6.3).
3. **The alert fires after the data is safe**, so an alert never implies data loss.

Re-entrancy: two overlapping runs are safe (upserts are idempotent, expiry is scoped by
`last_seen_run_id <> runId`), but the workflow sets `concurrency: { group: crawl,
cancel-in-progress: false }` so it does not happen.

### 5.2 Search request — the flow that must be fast

```
GET /?q=chuyen+vien+tin+dung&city=ha-noi&level=officer&posted=7&page=1
│
├─ Server Component reads searchParams (the URL is the entire filter state —
│     shareable per US-16, indexable per NFR-15, and no client state to sync)
│
├─ parse + clamp: page ≤ 200, q ≤ 100 chars, city/level validated against the
│     known slug sets — an unknown slug is ignored, never passed to SQL
│
├─ ONE query, built conditionally. Predicates are added only when the filter is
│     present, which is how FR-8/AC-15.3 are honoured — an absent filter adds no
│     predicate, so uncategorized and undetermined rows are included by default:
│
│     SELECT j.id, j.title, j.cities, j.level, j.posted_date, j.source_url,
│            b.slug AS bank_slug, b.name AS bank_name
│       FROM job j JOIN bank b ON b.id = j.bank_id
│      WHERE j.status = 'active'
│        [ AND j.search_tsv @@ to_tsquery('simple', $tsquery) ]   -- ADR-0004
│        [ AND j.cities && $cities::text[] ]                      -- or IS NULL for 'không xác định'
│        [ AND j.level = ANY($levels) ]
│        [ AND j.posted_date >= current_date - $days ]            -- AC-17.2: excludes NULL, correctly
│        [ AND j.bank_id = ANY($banks) ]
│      ORDER BY j.posted_date DESC NULLS LAST, j.id DESC
│      LIMIT 20 OFFSET $offset
│
├─ + one cheap COUNT(*) with the same predicates, for pagination
├─ + one query for the freshness indicator (§5.4)
│
└─ render server-side → HTML
```

No caching layer in v1. Three indexed queries against a few thousand rows from a Vercel region near
the database will land far inside NFR-1's 2 seconds. **Add caching when a measurement says to**;
premature `unstable_cache` keys on filter permutations is a cache-invalidation problem bought for
nothing.

**Filter option lists** (AC-15.2 — "no empty options") come from a separate query:
`SELECT DISTINCT unnest(cities) FROM job WHERE status='active'`, likewise for levels and banks.
This is the one query worth caching (`revalidate: 900`) since it changes only when a crawl lands.

### 5.3 Normalisation detail

**City** — `lib/cities.ts` holds canonical entries with alias lists:

```ts
{ slug: 'ha-noi', name: 'Hà Nội',
  aliases: ['ha noi', 'hanoi', 'hn', 'tp ha noi', 'thanh pho ha noi'] }
```

Matching runs on `toSearch(raw)`. SuccessFactors emits `"Hà Nội, VN"` — the pipeline splits on `,`
and `/`, drops a trailing country token, and matches each part. No match → `cities = NULL`,
`cities_raw` keeps the original so the alias table can be grown from real data.

> **Verify at build time:** Vietnam has recently reorganised its provincial administrative
> divisions. Seed the canonical list from the *current* official province list, and keep the
> superseded names as aliases so historical postings still match.

**Level** (FR-7) — an ordered rule list in `lib/levels.ts`, evaluated most-specific first, matched
against `toSearch(title)` with word boundaries:

| Order | Match on normalised title | Level |
|---|---|---|
| 1 | `chuyen vien cao cap`, `senior` | `senior` |
| 2 | `thuc tap sinh`, `intern`, `thuc tap` | `intern` |
| 3 | `giam doc`, `pho giam doc`, `director` | `director` |
| 4 | `truong phong`, `truong bo phan`, `pho phong`, `manager`, `truong nhom` | `manager` |
| 5 | `chuyen vien`, `specialist`, `officer` | `officer` |
| 6 | `nhan vien`, `staff` | `staff` |
| — | no match | `uncategorized` |

Two traps, both of which will bite if ignored:

- Rule 1 **must** precede rule 5 (AC-7.2). The ordering is the specification, so the unit test
  asserts the order-sensitive cases explicitly.
- Match on **whole phrases with word boundaries**, never on substrings. `"Cộng tác viên"`
  (collaborator) contains `viên` and must not match `nhan vien`; a naive `includes()` will get this
  wrong and it will not be obvious.

The rule table is data with a test table beside it. Adding a rule touches one file and no crawler
code (NFR-8).

**Posted date** — parse Vietnamese formats explicitly: `"12 thg 8, 2026"` (SuccessFactors),
`dd/mm/yyyy`, `yyyy-mm-dd`, ISO 8601. Unparseable → `NULL`, which the schema and the ordering
already handle correctly. **Do not guess.** A wrong date is worse than a missing one because
FR-17's filter silently hides the job.

### 5.4 Freshness (FR-11) and per-bank staleness (OQ-7)

```sql
-- Global indicator: the last run that actually refreshed data.
SELECT MAX(finished_at) FROM crawl_run WHERE status IN ('ok','degraded');

-- Per-bank, for the honest-degradation notice (OQ-7).
SELECT r.bank_id, MAX(cr.finished_at) AS last_success
  FROM crawl_result r JOIN crawl_run cr ON cr.id = r.run_id
 WHERE r.status = 'success'
 GROUP BY r.bank_id;
```

**Interpretation note on AC-11.2.** The AC says the indicator derives from the last *successful*
crawl. Read literally with `status='ok'`, one broken bank out of 13 would make the site announce
"updated 3 days ago" while 12 banks are an hour fresh — less honest, not more. This design therefore
includes `degraded` in the global indicator and pairs it with the per-bank notice from OQ-7, which
is where the honesty actually belongs. **Flagged for the product owner**; if the literal reading is
preferred, it is a one-line change.

### 5.5 Save a job, and the expired case

```
Signed-out user taps "Lưu"
  → Server Action detects no session; redirect to /dang-nhap?next=<current URL>
  → after auth, redirect back and complete the save (Flow B step 2)

Signed-in:
  → Server Action: userId = (await supabase.auth.getUser()).data.user.id   ← server-verified
  → INSERT INTO saved_job (user_id, job_id) VALUES ($userId, $jobId)
        ON CONFLICT DO NOTHING
  → revalidatePath('/da-luu')

Saved list, /da-luu:
  SELECT j.*, b.name, s.saved_at
    FROM saved_job s JOIN job j ON j.id = s.job_id JOIN bank b ON b.id = j.bank_id
   WHERE s.user_id = $userId
   ORDER BY s.saved_at DESC;
  -- No status filter: expired jobs are RETURNED (FR-26 AC-26.1) and rendered with
  -- their status so the UI can label them (AC-26.2) and suppress the apply link
  -- as live (AC-26.3).
```

`userId` comes from the verified session and **never** from a form field or query parameter. That
single line is the whole of NFR-11's authorisation model in this design (ADR-0002).

---

## 6. Constraints handed to the `ux-designer` agent

Stated so the two designs meet. These are *architectural* constraints only — colours, typography
and layout are not this document's business.

### 6.1 URL structure

| Path | Purpose | Notes |
|---|---|---|
| `/` | Aggregated list + all filters | Filter state is **entirely** in query params: `?q=&city=&level=&posted=&bank=&page=`. Repeatable params for multi-select. |
| `/viec-lam/<id>-<slug>` | Job detail (FR-19 AC-19.1) | `id` is authoritative, `slug` is decorative and diacritic-free; a wrong slug 301s to the right one |
| `/ngan-hang/<slug>` | Per-bank page — jobs + per-bank freshness (OQ-7) | Also the natural home for the follow button |
| `/da-luu`, `/theo-doi` | Saved jobs, followed banks | Auth-gated; redirect to sign-in with `?next=` |
| `/dang-nhap`, `/dang-ky` | Auth | |
| `/pham-vi-du-lieu` | Coverage statement: which banks are covered, which are not, and why | ADR-0005; the honest-gap surface |
| `/ve-du-lieu` | C-6 posture: what is collected, attribution, removal contact | Required before launch (P4) |

Because filter state is in the URL, US-16 (share a filtered search) is free and NFR-15 is
satisfiable. **The design must not introduce filter state that only exists in client memory.**

### 6.2 What data is available to render

Guaranteed on every list row: `title` (original), `bank_name`, `bank_slug`, `level` (always
present, possibly `uncategorized`), `posted_date` (**may be NULL**), `cities` (**may be NULL**),
`source_url`.

Additionally on detail: `description_html` (**may be NULL** — AC-19.2 requires absent, not
placeholder), `first_seen_at`, `status`.

Every optional field above needs a designed absent-state. `posted_date` and `cities` being NULL are
common, not edge cases.

### 6.3 Rendering model

- Every page is a **Server Component**, server-rendered. Required by NFR-15.
- **Client islands only**: the search input (debounced, pushes to the URL), filter controls, and
  the save/follow buttons. Everything else is server-rendered HTML.
- **Pagination, not infinite scroll.** Infinite scroll needs client state, breaks the shareable-URL
  property, and is worse for indexing. 20 rows per page.
- No loading skeleton is needed for the initial list — it arrives rendered. Filter changes are a
  navigation, so Next.js's `loading.tsx` covers the transition.

### 6.4 States that exist because of this architecture

Beyond the PRD §10 list: **per-bank stale notice** (a bank whose last success is >2 cycles old —
OQ-7), and **deliberately-uncovered banks** (VIB, Agribank) which need a plain, non-apologetic
presentation on `/pham-vi-du-lieu`.

---

## 7. Technology choices

Each row states what it replaces and why the alternative lost. The bias throughout is boring and
few.

| Choice | Version/notes | Why this, over what |
|---|---|---|
| **TypeScript, strict** | Node 24.12 (installed) | Already decided. `strict: true` from commit one — retrofitting is misery. |
| **Next.js App Router** | Already decided | Server Components give server rendering (NFR-15) without a separate API layer. The alternative — a separate API + client SPA — is two deployables and a serialisation boundary for no benefit here. |
| **Tailwind** | Already decided | — |
| **`postgres` (porsager)** | data access, both sides | ~15 kB, tagged-template SQL, real transactions, no codegen step, no runtime metadata. **Over Prisma:** Prisma adds a generate step, a query engine binary, and a migration engine — heavy for 6 tables, and awkward in a Actions job. **Over Drizzle:** genuinely good, but adds a schema DSL that duplicates the `.sql` migrations; revisit if type drift between SQL and TS becomes a real bug source rather than a theoretical one. **Over `pg`:** same capability, more ceremony. |
| **`cheerio`** | HTML parsing | The boring standard; jQuery-shaped API over `parse5`. **Over regex:** no. **Over `linkedom`/`jsdom`:** heavier, and no DOM API is needed for parsing. |
| **`playwright` (chromium only)** | JS-shell banks, fallback | Best-maintained headless API, works on Actions runners without contortion. Installed conditionally (ADR-0003). **Over Puppeteer:** better auto-waiting, better CI story. **Over browser at all:** try the site's own JSON endpoint first — always. |
| **`zod`** | validating parsed rows | Makes garbage loud at the boundary instead of silent in the database. This is the "make failure loud" principle applied to the least trustworthy input in the system. |
| **`robots-parser`** | FR-4 AC-4.3 | Small, single-purpose, correct. Writing this by hand is a correctness risk for no gain. |
| **`sanitize-html`** | ingest-time description sanitising | Bank HTML is untrusted input that ends up in `dangerouslySetInnerHTML`. Allowlist-based, boring, well-understood. See §8.7. |
| **Built-in `fetch` + `AbortSignal.timeout`** | HTTP | Node 24 has it. **Over `axios`/`got`:** a dependency to replace ~20 lines of wrapper. The wrapper (`crawler/http.ts`) owns UA, timeout, retry with backoff, and per-host rate limiting — all things that must be centralised anyway. |
| **`date-fns` + `locale/vi`** | Vietnamese dates, "3 giờ trước" | FR-11 and FR-27. Tree-shakeable. **Over `dayjs`:** equivalent; either is fine, pick one. **Over `Intl.RelativeTimeFormat`:** built-in and adequate for relative time, but `date-fns` also handles the parsing side; using one library for both is simpler. |
| **`@supabase/ssr` + `@supabase/supabase-js`** | auth only | ADR-0002. Not used for data access. |
| **`vitest`** | tests | Fast, ESM-native, zero config with TS. The tests that matter are fixture-based parser tests and the normaliser round-trip. |
| **Plain `.sql` migrations + `scripts/migrate.ts`** | schema | ~40 lines, tracked in `schema_migrations`. **Over a migration framework:** for 6 tables and one maintainer, the framework is more to learn than the problem is to solve. |
| **npm workspaces** | *rejected* | Single package instead — §3.4. |
| **Redis / queue / cache layer** | *rejected* | Nothing in this system is slow enough or concurrent enough to need one. Every one of them is a service that can be down at 2am. |

---

## 8. Operational concerns

### 8.1 Deployment

| Component | Host | Trigger |
|---|---|---|
| Website | Vercel Hobby, GitHub integration | push to `main` |
| Crawler | GitHub Actions | cron `0 1,13 * * *` (08:00 / 20:00 Asia/Ho_Chi_Minh) + `workflow_dispatch` |
| Database | Supabase free | — |
| Migrations | `scripts/migrate.ts`, run manually or via `workflow_dispatch` | **never automatically on deploy** |

Migrations are deliberately manual. With one maintainer and a read-mostly schema, an automatic
migration on every deploy is a way to break production while thinking about CSS. Two Supabase free
projects are available (verified 2026-08-13): use the second as a scratch project to rehearse any
migration that is not a pure addition.

### 8.2 Verify at build time

None of these are asserted by this document. Each was true on the date shown, and each can change.

| Thing to check | Why it matters | Last checked |
|---|---|---|
| Vercel Hobby: function duration, bandwidth, build minutes; **non-commercial terms** | Website viability (TA-3) | not checked |
| Vercel Web Analytics: Hobby event cap, custom-event support | The OQ-2 click-through metric depends on it (OQ-T4) | not checked |
| GitHub Actions: public-repo minute policy | Whole crawler cost model (ADR-0003) | not checked |
| GitHub Actions: 60-day inactivity disable; cron delay behaviour | Silent crawl death (R-7) | 2026-08-13 — confirmed |
| Supabase free: 500 MB DB, 50k MAU, 5 GB egress, 2 projects, 7-day pause | ADR-0002 rests on these | 2026-08-13 — confirmed |
| Supabase pooler: port 6543 transaction mode, `prepare:false` requirement | Serverless connections | not checked |
| Current Vietnamese provincial division list | City normalisation (§5.3) | not checked |
| Each bank's `robots.txt` | FR-4 AC-4.3; may exclude a covered bank | not checked |

### 8.3 Monitoring — what tells you the system is broken

There is no monitoring service. There are three signals, in decreasing order of speed:

1. **Failed-workflow email** from GitHub, fired by the crawler's non-zero exit (FR-6, OQ-6). Covers
   `failure`, `zero_jobs`, `suspect`. Links to the step summary with a per-bank, per-platform table.
2. **`/pham-vi-du-lieu` and the per-bank stale notice** on the site itself (OQ-7) — visible to users
   and to the maintainer, and the mitigation for R-7's silent decay.
3. **`crawl_result` history**, queried directly in SQL. The `git_sha` column answers "was it me?".

The gap this leaves, honestly: **if the crawler stops running entirely, no email is sent** — a
workflow that never starts cannot fail. The 60-day disable (ADR-0003) is exactly this failure. Two
cheap mitigations, both recommended for P4:

- The site's own freshness indicator is the real dead-man's switch — if it says "3 days ago", the
  crawler is dead. Making it prominent (FR-11 already requires this) is monitoring.
- A free external uptime/cron monitor pinging a `/api/health` route that returns non-200 when the
  last successful crawl is older than 26 hours. This is the only genuinely useful addition and it is
  ~15 lines. **Recommended** — see OQ-T2 for the vendor question.

### 8.4 Alert fatigue — the thing that kills alerting

Rules, all of which follow from R-7:

- Deliberately-uncovered banks never alert (ADR-0005).
- `blocked` (robots.txt) never alerts.
- A bank disabled via `is_enabled = false` never alerts.
- If the same bank alerts on more than ~4 consecutive runs, the correct action is to fix it or
  disable it — not to keep receiving the email. Chronic alerts are how alerting dies.

### 8.5 Secrets and the CV problem

| Secret | Where | Notes |
|---|---|---|
| `DATABASE_URL` (direct, :5432) | GitHub Actions secret | Crawler only |
| `DATABASE_URL_POOLED` (:6543) | Vercel env (all environments) | Website only |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel env | Public by design; safe **only because** RLS is default-deny and grants are revoked (§4.5) |
| `SUPABASE_SERVICE_ROLE_KEY` | **nowhere** | Neither component needs it. Do not add it "just in case". |

Give the crawler a dedicated Postgres role with `INSERT/UPDATE/SELECT` on the crawl-owned tables and
**no `DELETE`, no `DROP`**. It costs one migration and makes a whole class of catastrophic mistake
impossible, in the component most likely to contain a bug.

**`CV_folder/` contains a personal CV PDF and the repository is public (ADR-0003).** Three layers,
because `.gitignore` alone is one `git add -f` away from a permanent public record:

1. **Move `CV_folder/` out of the repository directory entirely** — e.g. to
   `C:\Users\LENOVO\Documents\CV\`. This is the actual fix; the rest is belt and braces. Do this
   **before `git init`**, not after: a file committed once and later removed remains in history.
2. `.gitignore`: `CV_folder/`, `*.pdf`, `.env*`, `.env.local`.
3. `scripts/check-forbidden-files.ts` in `ci.yml`, failing the build if `git ls-files` matches
   `*.pdf`, `CV_folder/`, or `.env*`. Loud, automatic, and it also catches the mistake in a PR
   rather than after a push.

### 8.6 Data volume

Budget is 500 MB. Estimate: ~2,000 active jobs × ~10 KB (dominated by `description_html`) ≈ 20 MB,
plus expired rows accumulating at a similar rate per year. Comfortable.

The one unbounded field is `description_html`. **Truncate at 50 KB at ingest** and record that it
was truncated. Check actual size at P1 exit; if the database passes ~400 MB, the answer is to stop
storing descriptions for expired jobs, not to buy a bigger tier.

### 8.7 Sanitising bank HTML

`description_html` is untrusted third-party HTML that will be rendered with
`dangerouslySetInnerHTML`. It is sanitised **at ingest**, with `sanitize-html` and a tight allowlist
(`p, br, ul, ol, li, strong, em, b, i, h3, h4, a[href]` — `a` forced to `rel="nofollow noopener"`),
so that what is in the database is already safe. One code path, one place to get right.

The website must render `description_html` through a single dedicated component and must never
apply `dangerouslySetInnerHTML` to any other field. This is the only XSS vector in the product.

### 8.8 Politeness — implementation of FR-4

Centralised in `crawler/http.ts` so it cannot be bypassed by an adapter:

- **User-Agent** (AC-4.1): `<product>/1.0 (+https://<domain>/ve-du-lieu; <contact email>)` — names
  the project and links to the posture page. Never randomised (ADR-0005).
- **Rate limit** (AC-4.2): a per-host token queue, ≥2,000 ms between requests to the same host.
  Concurrency of 3 *across banks* is fine because they are different hosts.
- **robots.txt** (AC-4.3): fetched once per host per run, cached, honoured. Disallowed → `blocked`.
- **GET only** (AC-4.4): the HTTP wrapper does not expose POST. `json-api` adapters needing POST
  are a config-level exception requiring an explicit flag and a note.
- Retry: max 2, exponential backoff, only on 5xx and network errors. Never retry a 403 or 429 —
  back off and record `failure`.

### 8.9 Time zones

Store `timestamptz` (UTC) everywhere; `posted_date` is a plain `date`. Render in
`Asia/Ho_Chi_Minh`. The crawler runs on UTC runners, so any date arithmetic that must be
"today in Vietnam" needs the timezone applied explicitly — this is a real off-by-one-day source in
the FR-17 recency filter, which is why that filter compares `posted_date >= current_date - $days`
in the database rather than in application code.

---

## 9. What this design does NOT do

Explicit boundaries. Anything here that later seems necessary should be a new ADR, not a quiet
addition.

- **No email of any kind.** No alerting emails from the app, no transactional email beyond what
  Supabase Auth sends for sign-up and password reset. NG-2 and OQ-8 discipline.
- **No queue, no worker pool, no Redis, no cache server.** The crawl is a for-loop.
- **No retry-across-runs, no dead-letter handling.** The next scheduled run is the retry.
- **No admin UI.** The administration surface is: edit a config file, push, re-run the workflow, and
  query the database with SQL. For one maintainer this is faster than any UI that could be built.
- **No search service, no vector search, no relevance ranking.** ADR-0004.
- **No ORM, no generated client, no schema DSL.**
- **No staging environment or preview database.** Vercel preview deployments read the production
  database (read-only, so this is safe); schema changes are rehearsed on the second free Supabase
  project.
- **No anti-bot evasion, ever.** ADR-0005.
- **No announcement-style or non-job record type.** ADR-0005.
- **No rate limiting or bot protection on the public site.** Vercel's platform layer is what there
  is. Revisit only if abuse actually occurs.
- **No i18n framework.** Vietnamese strings are literals in components. NG-4 means there is no
  second locale; a framework for one locale is pure overhead.
- **No feature flags** (PRD §17).
- **Nothing built for v2.** Where the email-alerts feature would require restructuring, it is noted
  below — and nothing more.

### 9.1 Where a future need would require restructuring

Noted, not built (OQ-8 discipline):

| Future need | What would have to change |
|---|---|
| **Email alerts on followed banks** (leading v2) | Needs (a) a way to know which jobs are *new since a user's last notification* — `first_seen_at` already supports this, so no schema change; (b) a per-user send-state table; (c) an email vendor and its free-tier limits; (d) most significantly, **a second scheduled job that runs after the crawl** — the crawl workflow would gain a downstream step or a second workflow triggered on completion. The data model does not block this; the operational shape does. |
| **Expansion toward 50 banks** | The adapter design already absorbs this (ADR-0001). The real constraints that would bind first are crawl wall-clock (split the workflow into parallel jobs) and the 500 MB database. Neither needs pre-building. |
| **Relevance-ranked search** | `ts_rank` over the existing `search_tsv`, plus an ordering choice in the UI. Additive. |
| **Employment type / department filters** | New nullable columns + the same conditional-predicate pattern. Additive, and blocked on data availability (PRD OQ-3), not on architecture. |

---

## 10. Open technical questions

Genuine decisions, each with a recommended default so nothing is blocked. **A default is a
recommendation, not an agreed decision.**

| ID | Question | Recommended default |
|---|---|---|
| **OQ-T1** | **Which platform actually serves SHB's jobs** — `shb.talent.vn` (Talent.vn, likely static) or `tuyendung.shb.com.vn` (shared JS platform)? And what is LPBank's platform after the `jobs.lpbank.com.vn` → `tuyendung.lpbank.com.vn` redirect? | Resolve both in P0 by direct inspection, before writing either adapter. If SHB is served by both, prefer the static Talent.vn source — it needs no browser and reuses the ACB adapter. |
| **OQ-T2** | **How is "the crawler stopped running entirely" detected?** GitHub cannot email about a workflow that never starts (§8.3). | Add a `/api/health` route returning 503 when the last successful crawl is >26 h old, and point a free external cron/uptime monitor at it. Choose the monitor at P4; if none is acceptable, accept the site's own freshness indicator as the only signal and say so. |
| **OQ-T3** | **What is the `suspect` volume-drop ratio?** (ADR-0006) 0.5 is a guess with no data behind it. | Ship 0.5, armed only when the previous success count ≥10. Review after 30 days of `crawl_result` history in P5 and set per-bank overrides for any bank with genuinely spiky volume. |
| **OQ-T4** | **How is the outbound click-through metric (OQ-2, ≥25% of sessions) captured?** Vercel Web Analytics custom events may be capped or unavailable on Hobby. | Try Vercel Web Analytics first (verify the cap). Fallback: a `POST /api/click` route inserting into an `outbound_click` table. Note the fallback **breaks the "website is read-only against the database" property** (PRD §17 rollback posture) — a real trade-off, worth accepting only if Vercel's tier does not work. |
| **OQ-T5** | **Does hydrating job descriptions fit the politeness budget on first run?** ~261 static jobs × 2 s ≈ 9 minutes for detail pages alone, before JS banks. | Delta-only hydration (§5.1 step 3) makes steady state trivial; the first run is the only expensive one. Run the first full hydration manually via `workflow_dispatch`, per bank, outside the scheduled cycle. If a bank's listing page already carries enough for the detail view, skip hydration for it entirely via config. |
| **OQ-T6** | **Should `job` rows ever be archived?** Currently the table grows forever. | Do nothing in v1 (§8.6). Revisit at 400 MB; the first move is dropping `description_html` for jobs expired more than 6 months ago, not deleting rows — saved jobs must still resolve (FR-26). |
| **OQ-T7** | **Does `/` need caching?** No cache layer is in the design. | Ship without it and measure against NFR-1/NFR-2. If needed, cache the filter-option lists first (§5.2) — they are the only queries that do not vary per request. |

### 10.1 One product question this design surfaces

**AC-11.2's literal reading conflicts with honest freshness reporting** — see §5.4. This design
deviates deliberately and the deviation should be confirmed or overruled by the product owner. It
is not an engineering decision.

---

## 11. Failure modes

| # | Failure | Detection | Blast radius | Recovery |
|---|---|---|---|---|
| F-1 | One bank's markup changes | `failure` or `suspect` → alert email | That bank stale; **nothing expired** (ADR-0006) | Re-record the fixture, fix the parser, `workflow_dispatch` |
| F-2 | **SuccessFactors changes markup → 4 banks fail at once** | 4 alerts; the step summary groups by platform so it reads as one incident | 4 banks stale, nothing expired | One adapter fix, four recoveries (ADR-0001) |
| F-3 | Scraper silently returns a subset (broken pagination) | **`suspect` guard** — this is the failure it exists for | Data thins but is not expired; alert fires | Fix pagination; next `success` reconciles |
| F-4 | A bank starts returning zero legitimately | `zero_jobs` alert (indistinguishable from breakage by design — AC-6.3) | Nothing expired | Human judgement. If genuine, it persists and stops alerting only when the bank posts again |
| F-5 | A bank IP-blocks the crawler | `failure` with 403 | That bank | Do not retry, do not evade (ADR-0005). Reduce rate; if permanent, move to the uncovered list and say so publicly |
| F-6 | **Crawl workflow silently disabled after 60 days** | *No alert exists* — this is the gap | Data ages indefinitely | `keepalive.yml` prevents it; `/api/health` + external monitor detects it (OQ-T2); the site's own freshness indicator is the last line |
| F-7 | Actions cron delayed >1 h | None needed | Freshness indicator reads slightly older | Nothing. The ≤24 h staleness target has ample margin |
| F-8 | Supabase project paused / quota exceeded | Site 500s; crawler `failure` on every bank | **Total outage** — the one single point of failure | Manual unpause. Watch size and egress (§8.2). This risk is the price of a free managed database and is accepted |
| F-9 | Crawler crashes mid-run | Workflow failure email; `crawl_run` left `running` | Banks already committed are correct; the rest untouched | Re-run. A stale `running` row is cosmetic; a startup step marks runs older than 6 h as `failed` |
| F-10 | Vercel build fails | Deploy email; last good deployment stays live | None — the site keeps serving | Fix and push |
| F-11 | Migration applied to production breaks a query | Site errors | Site down until fixed | Rehearse on the second Supabase project; migrations are manual and never on deploy (§8.1) |
| F-12 | Diacritic corruption (NFC/NFD mismatch) | Round-trip unit test; visually, duplicate-looking rows | Search misses, dedupe splits | `toStorage()` NFC on ingest (ADR-0004). Recovery is a backfill |
| F-13 | Malicious HTML in a bank description | None automatic | XSS in a user's browser | Prevented at ingest by `sanitize-html` (§8.7). Single render path is the containment |
| F-14 | CV PDF committed to a public repository | `check-forbidden-files.ts` in CI | Permanent public exposure of personal data | Prevention only — move the folder out of the repo before `git init` (§8.5). There is no clean recovery from a pushed commit |
| F-15 | User A sees user B's saved jobs | None automatic | Data breach (NFR-11) | Prevented by taking `user_id` only from the verified session (§5.5). Deserves an explicit review checkpoint at P3 exit |

---

## 12. Build order

Aligned to PRD §17 phases, with each step concrete enough to start. Exit gates are the PRD's.

### P0 — Spike (exit: two banks return real jobs on two consecutive scheduled runs)

1. `npx create-next-app@latest` into the working directory; **set the package name to
   `vieclam-nganhang`** explicitly — `CV_reviewer` is rejected by npm's naming rules. TypeScript,
   Tailwind, App Router, no `src/`.
2. **Before `git init`: move `CV_folder/` out of the directory** (§8.5). Then `.gitignore`,
   `git init`, and push to a **public** GitHub repo.
3. Supabase project. Migration `001_init.sql`: `bank`, `job`, `crawl_run`, `crawl_result`, indexes,
   RLS default-deny, grant revocation, the restricted crawler role.
4. `lib/normalize.ts` + `lib/levels.ts` + `lib/cities.ts` with vitest tables. **Write these tests
   first** — they are pure functions, they are the correctness core of search and filtering, and
   they need no network.
5. `crawler/http.ts`: UA, timeout, retry, per-host rate limit, robots.
6. **`successfactors` adapter + Vietcombank config** (static, confirmed 60 jobs, 3 pages). Fixture
   test from a saved `/search/?locale=vi_VN` page.
7. Resolve **OQ-T1** (SHB, LPBank) by inspection while here.
8. Pick one JS-shell bank — **VietinBank** — and spend a timeboxed session finding its XHR
   endpoint in the browser's network tab. If found, write the `json-api` adapter. Only if not
   found, write the `browser` adapter. This single investigation determines whether Playwright is
   needed at all.
9. `crawler/pipeline/persist.ts` with the per-bank transaction, outcomes and the expiry guard
   (§5.1 step 7). Test the guard explicitly: a bank returning zero must expire nothing.
10. `.github/workflows/crawl.yml` with cron + `workflow_dispatch`, `DATABASE_URL` secret, step
    summary, exit code.

### P1 — Data foundation (exit: 13/13 on one run; a deliberately broken scraper alerts within a cycle)

11. Remaining SuccessFactors configs — Techcombank, Sacombank, VPBank. Three config files, no new
    parser. This is ADR-0001 paying for itself and is the fastest coverage win available.
12. `talent-vn` adapter (ACB, ~32 pages — check pagination carefully), `taleo` adapter (MSB).
    **Static-HTML banks are now complete: 6 banks, 261+ jobs, no browser.** This is already a
    useful product and is the natural point to consider whether P2 should start in parallel.
13. `vn-careers` adapter (MB, SHB) and the remaining bespoke JS banks (BIDV, TPBank, HDBank,
    LPBank) — JSON endpoint first, browser second, for each.
14. `suspect` guard with real `previous_success_count` data; alerting end to end; verify by
    breaking a selector on purpose and confirming the email arrives and **nothing expired**.
15. `keepalive.yml`; `ci.yml` with typecheck, vitest, forbidden-file check.

### P2 — Public site (exit: Flow A end to end at 360px inside NFR-1/NFR-2)

16. `lib/db.ts` pooled client; the §5.2 query builder; `/` list with all filters in the URL.
17. `/viec-lam/<id>-<slug>` detail; sanitised description render; outbound apply link.
18. Freshness indicator (§5.4); per-bank staleness on `/ngan-hang/<slug>` (OQ-7).
19. `/pham-vi-du-lieu` coverage page from `lib/coverage.ts`; `/ve-du-lieu` C-6 posture page.
20. Vietnamese empty states, error states, and the stale-data state. Hand off §6 to `ux-designer`
    **before** this step, not during it.

### P3 — Accounts (exit: Flow B across two sessions; a saved job survives its source disappearing)

21. `@supabase/ssr` session wiring; `/dang-nhap`, `/dang-ky`.
22. `saved_job` / `followed_bank` migrations; Server Actions with the session-derived `user_id`.
23. `/da-luu` including expired jobs, labelled (FR-26). Test by expiring a saved job in SQL.
24. **Explicit review checkpoint on F-15** — every query touching user tables filters by the
    verified session id.

### P4 — Launch

25. Domain (resolves OQ-1); analytics (OQ-T4); `/api/health` + external monitor (OQ-T2).
26. Verify every row in §8.2 against current vendor documentation and record the date.
27. Confirm the C-6 removal contact is live and monitored.

### P5 — Observe

28. 30 days of `crawl_result`. Tune OQ-T3's ratio from real variance. Measure query timings and
    decide OQ-T7. Re-check database size against §8.6.

### 12.1 Suggested first commit

`lib/normalize.ts` and its test file. It is the smallest piece of the system that is both certainly
needed and certainly correct-or-not, it has no dependencies, and getting `đ` wrong there would be
discovered months later in the form of "search sometimes doesn't work".
