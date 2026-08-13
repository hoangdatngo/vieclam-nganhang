/**
 * Shared types — the contract between the crawler and the website.
 *
 * Spec: docs/TECHNICAL_DESIGN.md §3.3 (shared library), §4 (data model),
 * §5.1 (crawl pipeline) · ADR-0006 (job identity and soft expiry).
 *
 * The database is the *only* interface between the two programs (§2.1), so this
 * file is where they agree on its shape. If the crawler and the website disagree
 * about what a job row contains, nothing catches it at runtime — the site simply
 * renders wrong.
 *
 * Two naming conventions, deliberately:
 *
 *  - **Row types use `snake_case`**, mirroring the SQL columns exactly, because
 *    `postgres` (porsager) returns column names untransformed. T-009 must NOT
 *    enable a camelCase `transform` on the client, or every row type here
 *    silently becomes wrong while still compiling.
 *  - **Pipeline types use `camelCase`**, because they never touch SQL — they are
 *    values passed between adapter, validator and normaliser.
 *
 * The migration in T-008 must mirror this file, not the other way round: these
 * declarations were derived from §4's DDL, which is the design of record.
 */

/* -------------------------------------------------------------------------- */
/* Enumerations — kept as `const` arrays so they are usable at runtime          */
/* -------------------------------------------------------------------------- */

/**
 * FR-7's taxonomy plus FR-8's fallback. Order is display order, not the
 * inference precedence order — that lives in `lib/levels.ts` (T-005), where
 * "chuyên viên cao cấp" must be tested before "chuyên viên" (AC-7.2).
 *
 * `uncategorized` is never absent and never null: FR-8 is a hard rule, and the
 * column is `NOT NULL DEFAULT 'uncategorized'` so it cannot be violated by
 * omission.
 */
export const LEVELS = [
  "intern",
  "staff",
  "officer",
  "senior",
  "manager",
  "director",
  "uncategorized",
] as const;
export type Level = (typeof LEVELS)[number];

/** ADR-0006: rows are never deleted, only moved `active` → `expired`. */
export const JOB_STATUSES = ["active", "expired"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * Per-run rollup (§5.1): `ok` when every bank succeeded, `degraded` when some
 * did, `failed` when none did. AC-11.2 counts `ok` **and** `degraded` as runs
 * that refreshed data — see FR-29 for why that is honest rather than flattering.
 */
export const CRAWL_RUN_STATUSES = ["running", "ok", "degraded", "failed"] as const;
export type CrawlRunStatus = (typeof CRAWL_RUN_STATUSES)[number];

export const CRAWL_TRIGGERS = ["schedule", "manual"] as const;
export type CrawlTrigger = (typeof CRAWL_TRIGGERS)[number];

/**
 * Per-bank outcome (FR-5, ADR-0006). Only `success` may expire anything — the
 * guard that stops a broken paginator from deleting 122 live jobs.
 *
 * `blocked` (robots.txt disallowed) is deliberately distinct from `failure`
 * because it must never raise an alert (§8.4).
 */
export const CRAWL_RESULT_STATUSES = [
  "success",
  "zero_jobs",
  "failure",
  "suspect",
  "blocked",
] as const;
export type CrawlResultStatus = (typeof CRAWL_RESULT_STATUSES)[number];

/** The only outcome permitted to expire a bank's jobs (ADR-0006, §5.1 step 7). */
export const EXPIRY_PERMITTING_STATUS = "success" satisfies CrawlResultStatus;

/**
 * Adapter families from §3.4. The `bank.platform` column is unconstrained
 * `text` in the schema; this union is the set the crawler actually writes, kept
 * true by `scripts/seed-banks.ts` (T-017). Widen it when a new adapter lands.
 */
export const PLATFORMS = [
  "successfactors",
  "talent-vn",
  "taleo",
  "vn-careers",
  "json-api",
  "html-list",
  "browser",
] as const;
export type Platform = (typeof PLATFORMS)[number];

/* -------------------------------------------------------------------------- */
/* Scalar representations                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A calendar date with no time and no zone, as `YYYY-MM-DD`.
 *
 * Deliberately a string rather than a `Date`. `posted_date` is a Postgres `date`:
 * it has no instant attached, and wrapping it in a `Date` forces an implicit
 * timezone. §8.9 flags exactly this as a real off-by-one source — a job posted
 * `2026-08-13` becomes the 12th for an evening visitor once it round-trips
 * through UTC, and FR-17's recency filter would then silently hide it.
 *
 * **T-009 must verify** that the `postgres` client returns `date` columns as
 * strings and not as `Date` objects, and configure a parser if it does not.
 * This is recorded in that task's checklist.
 */
export type IsoDate = string;

/* -------------------------------------------------------------------------- */
/* Database rows — mirror docs/TECHNICAL_DESIGN.md §4 exactly                   */
/* -------------------------------------------------------------------------- */

/** §4.1. Display and identity only — adapter config lives in code (ADR-0001). */
export interface BankRow {
  /** Hand-assigned, stable across a database rebuild and readable in logs. */
  id: number;
  slug: string;
  name: string;
  full_name: string;
  careers_url: string;
  platform: Platform;
  /** `false` = do not crawl this cycle. A disabled bank never alerts (§8.4). */
  is_enabled: boolean;
  created_at: Date;
}

/**
 * §4.2, minus the generated `search_tsv` column, which is never read or written
 * by application code — it exists for the GIN index behind FR-13/FR-14.
 */
interface JobColumns {
  id: number;
  bank_id: number;
  /** `ext:<id>` where the platform exposes one, else `url:<canonical>`. ADR-0006. */
  dedupe_key: string;
  /** FR-20: always on the bank's own domain; asserted during validation (T-011). */
  source_url: string;
  external_id: string | null;

  /**
   * The bank's own words, NFC-normalised and otherwise unmodified.
   * AC-9.2 and NFR-5 — never rewritten, never title-cased, never truncated.
   * Everything derived from it lives in its own column.
   */
  title: string;
  /** `toSearch(title)` — diacritic-free fold. ADR-0004. */
  title_search: string;

  /**
   * Canonical city slugs. **`null` means undetermined, not "none"** — AC-15.3
   * requires those jobs to stay reachable.
   *
   * An empty array is forbidden by convention (§4.2) but **not** by the schema,
   * so this is typed as a plain array rather than a non-empty one: claiming
   * non-emptiness on the read path would be a lie about what the database
   * guarantees. `NormalisedJob` below enforces it on the write path, where we
   * are the ones producing the value. Making it true on both sides needs a
   * `CHECK (cities IS NULL OR cardinality(cities) > 0)` in T-008.
   */
  cities: string[] | null;
  /** As published, kept so the alias table can be grown from real data. */
  cities_raw: string[] | null;

  /** Never null — FR-8. Falls back to `uncategorized`, never to a guess. */
  level: Level;
  /** `null` = unknown. Ordered last, never dropped (AC-12.2). */
  posted_date: IsoDate | null;

  /** Sanitised at ingest (§8.7). `null` when the source had none — AC-19.2. */
  description_html: string | null;
  description_text: string | null;

  first_seen_at: Date;
  last_seen_at: Date;
  last_seen_run_id: number;
}

/**
 * A job row.
 *
 * `status` and `expired_at` are a discriminated union because the schema's
 * `job_expired_ck` makes the mismatched combinations unrepresentable in the
 * database — expired with no timestamp, or active with one. Modelling it the
 * same way in TypeScript means code that renders an expired job (T-055) cannot
 * forget to handle the timestamp, and code that reads `expired_at` must first
 * establish that the job is actually expired.
 */
export type JobRow = JobColumns &
  ({ status: "active"; expired_at: null } | { status: "expired"; expired_at: Date });

/** §4.3. `git_sha` answers "did I change something, or did they?" from the log alone. */
export interface CrawlRunRow {
  id: number;
  started_at: Date;
  /** `null` while the run is in flight, or if the crawler died mid-run (F-9). */
  finished_at: Date | null;
  status: CrawlRunStatus;
  trigger: CrawlTrigger;
  git_sha: string | null;
}

/** §4.3. One row per bank per run — the FR-5 outcome record. */
export interface CrawlResultRow {
  run_id: number;
  bank_id: number;
  status: CrawlResultStatus;
  jobs_found: number;
  jobs_new: number;
  /** Always 0 unless `status` is `success` — the ADR-0006 guard. */
  jobs_expired: number;
  duration_ms: number | null;
  /** Message plus first stack frame, truncated to 2000 chars. */
  error: string | null;
}

/* -------------------------------------------------------------------------- */
/* Crawler pipeline — §5.1                                                     */
/* -------------------------------------------------------------------------- */

/** At least one element. Used where we produce the value and can guarantee it. */
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * What `discover()` extracts from a listing page (§5.1 step 2).
 *
 * Every field is a raw string exactly as published. No normalisation happens
 * here: adapters know HTML, not taxonomy. Anything unparseable is `null` rather
 * than a guess — `postedDateRaw` in particular, since a wrong date is worse than
 * a missing one (§5.3).
 */
export interface RawListing {
  /** Platform-native id where one exists; drives `dedupe_key`. ADR-0006. */
  externalId: string | null;
  sourceUrl: string;
  title: string;
  /** May carry several cities, e.g. `"Hà Nội, VN"` or `"Hà Nội / Đà Nẵng"`. */
  cityRaw: string | null;
  postedDateRaw: string | null;
}

/**
 * What `hydrate()` adds from a detail page (§5.1 step 3).
 *
 * Hydration is delta-only and best-effort: a failure here degrades one job to
 * listing-only data and must never fail the bank. Every field is therefore
 * optional in practice, and the detail page may also carry a better city or
 * date than the listing did.
 */
export interface RawDetail {
  /** Raw source HTML. Sanitising happens at ingest, before storage (§8.7). */
  descriptionHtml: string | null;
  descriptionText: string | null;
  cityRaw: string | null;
  postedDateRaw: string | null;
}

/**
 * The output of the normalise stage and the input to persist (§5.1 steps 5–7).
 *
 * This is what the crawler is ready to upsert. It carries no `id`, no
 * `first_seen_at` and no `last_seen_run_id`: the first two are the database's,
 * and the run id is supplied by the orchestrator at persist time so a single
 * normalised job cannot be attributed to the wrong run.
 */
export interface NormalisedJob {
  bank_id: number;
  dedupe_key: string;
  source_url: string;
  external_id: string | null;

  /** NFC, otherwise the bank's own words. */
  title: string;
  title_search: string;

  /**
   * Non-empty or `null` — never `[]`. This is the write path, so the convention
   * from §4.2 is enforced by the type rather than merely documented.
   */
  cities: NonEmptyArray<string> | null;
  cities_raw: NonEmptyArray<string> | null;

  level: Level;
  posted_date: IsoDate | null;

  description_html: string | null;
  description_text: string | null;
}

/**
 * Per-bank result of one crawl, before it becomes a `crawl_result` row.
 *
 * Computing `status` needs the bank's previous successful job count, which is
 * read from `crawl_result` history rather than carried here — the `suspect`
 * guard only arms when that previous count was at least 10 (ADR-0006, OQ-T3).
 */
export interface BankOutcome {
  bankId: number;
  status: CrawlResultStatus;
  jobsFound: number;
  jobsNew: number;
  jobsExpired: number;
  durationMs: number | null;
  error: string | null;
}
