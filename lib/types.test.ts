import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CRAWL_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
  CRAWL_TRIGGERS,
  EXPIRY_PERMITTING_STATUS,
  JOB_STATUSES,
  LEVELS,
  PLATFORMS,
  type CrawlResultRow,
  type CrawlRunRow,
  type JobRow,
  type NormalisedJob,
} from "./types";

/**
 * Shared type definitions — docs/TECHNICAL_DESIGN.md §3.3, §4, §5.1 · ADR-0006.
 *
 * Two kinds of assertion here, because a types module fails in two ways.
 *
 * 1. **Runtime drift.** The `const` enumerations must match the CHECK
 *    constraints in the schema. If they diverge, the crawler writes a value the
 *    database rejects — at 01:00, inside a transaction, on one bank.
 * 2. **Type-level regressions.** Asserted with `expectTypeOf`, and — for the
 *    cases that must be *rejected* — with `@ts-expect-error`. That direction
 *    matters: if the discriminated union stopped working, a plain positive
 *    assertion would still pass, whereas an unused `@ts-expect-error` is itself
 *    a compile error. The negative tests cannot silently stop testing.
 *
 * The type-level half runs under `tsc --noEmit`, which the tsconfig points at
 * every TypeScript file in the project. `npm test` alone does not check it, so
 * CI must run both (T-033).
 */

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const technicalDesign = readFileSync(join(repoRoot, "docs", "TECHNICAL_DESIGN.md"), "utf8");

/**
 * Pulls the quoted values out of a named CHECK constraint in the design's DDL,
 * e.g. `CONSTRAINT job_level_ck CHECK (level IN ('intern','staff', …))`.
 *
 * The design is the source of truth until T-008 writes the migration; at that
 * point this should read `db/migrations/001_init.sql` instead, which is
 * recorded in T-008's checklist.
 */
function checkConstraintValues(constraintName: string): string[] {
  const block = technicalDesign.match(new RegExp(`${constraintName}[\\s\\S]*?\\)\\)`));
  if (!block) throw new Error(`CHECK constraint ${constraintName} not found in TECHNICAL_DESIGN.md`);
  return [...block[0].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe("enumerations match the schema's CHECK constraints", () => {
  it.each([
    ["job_level_ck", LEVELS],
    ["job_status_ck", JOB_STATUSES],
    ["crawl_run_status_ck", CRAWL_RUN_STATUSES],
    ["crawl_result_status_ck", CRAWL_RESULT_STATUSES],
  ])("%s", (constraint, values) => {
    expect([...values].sort()).toEqual(checkConstraintValues(constraint).sort());
  });

  it("the constraint parser actually finds values", () => {
    // Guards the case where a doc reformat makes every comparison above
    // vacuously compare [] to [].
    expect(checkConstraintValues("job_level_ck").length).toBeGreaterThan(1);
  });

  it.each([
    ["LEVELS", LEVELS],
    ["JOB_STATUSES", JOB_STATUSES],
    ["CRAWL_RUN_STATUSES", CRAWL_RUN_STATUSES],
    ["CRAWL_RESULT_STATUSES", CRAWL_RESULT_STATUSES],
    ["CRAWL_TRIGGERS", CRAWL_TRIGGERS],
    ["PLATFORMS", PLATFORMS],
  ])("%s contains no duplicates", (_name, values) => {
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("the rules that must not be edited away", () => {
  it("keeps uncategorized in the level taxonomy — FR-8", () => {
    // A wrong guess must never hide a job. Removing this value would make the
    // NOT NULL DEFAULT unsatisfiable and force inference to return null.
    expect(LEVELS).toContain("uncategorized");
  });

  it("only `success` may expire a bank's jobs — ADR-0006", () => {
    expect(EXPIRY_PERMITTING_STATUS).toBe("success");
  });

  it("keeps `blocked` distinct from `failure` — §8.4", () => {
    // robots.txt disallow is not a breakage and must never raise an alert.
    expect(CRAWL_RESULT_STATUSES).toContain("blocked");
    expect(CRAWL_RESULT_STATUSES).toContain("failure");
  });

  it("keeps `degraded` distinct from `ok` — AC-11.2", () => {
    // The freshness indicator advances on both, but FR-29's per-bank notice
    // depends on being able to tell them apart.
    expect(CRAWL_RUN_STATUSES).toContain("degraded");
    expect(CRAWL_RUN_STATUSES).toContain("ok");
  });
});

/* -------------------------------------------------------------------------- */
/* Type-level assertions                                                       */
/* -------------------------------------------------------------------------- */

const activeJob: JobRow = {
  id: 1,
  bank_id: 1,
  dedupe_key: "ext:12345",
  source_url: "https://tuyendung.vietcombank.com.vn/jobs/12345",
  external_id: "12345",
  title: "Chuyên viên Khách hàng Doanh nghiệp",
  title_search: "chuyen vien khach hang doanh nghiep",
  cities: ["ha-noi"],
  cities_raw: ["Hà Nội"],
  level: "officer",
  posted_date: "2026-08-13",
  description_html: null,
  description_text: null,
  status: "active",
  expired_at: null,
  first_seen_at: new Date(),
  last_seen_at: new Date(),
  last_seen_run_id: 7,
};

describe("JobRow models job_expired_ck as a discriminated union", () => {
  it("narrows expired_at to null when the job is active", () => {
    if (activeJob.status === "active") {
      expectTypeOf(activeJob.expired_at).toEqualTypeOf<null>();
    }
    expect(activeJob.expired_at).toBeNull();
  });

  it("narrows expired_at to Date when the job is expired", () => {
    const expired: JobRow = { ...activeJob, status: "expired", expired_at: new Date() };
    if (expired.status === "expired") {
      expectTypeOf(expired.expired_at).toEqualTypeOf<Date>();
    }
    expect(expired.expired_at).toBeInstanceOf(Date);
  });

  it("rejects the two states the CHECK constraint forbids", () => {
    // @ts-expect-error — active with a timestamp is unrepresentable in the DB
    const activeButExpired: JobRow = { ...activeJob, status: "active", expired_at: new Date() };

    // @ts-expect-error — expired without a timestamp is likewise forbidden
    const expiredButNot: JobRow = { ...activeJob, status: "expired", expired_at: null };

    // Referenced so the bindings are used; the assertions above are the point.
    expect(activeButExpired.status).toBe("active");
    expect(expiredButNot.status).toBe("expired");
  });
});

describe("nullability matches the schema", () => {
  it("treats cities as nullable — null means undetermined, not none (AC-15.3)", () => {
    expectTypeOf<JobRow["cities"]>().toEqualTypeOf<string[] | null>();
  });

  it("treats posted_date as a nullable calendar-date string, not a Date (§8.9)", () => {
    expectTypeOf<JobRow["posted_date"]>().toEqualTypeOf<string | null>();
  });

  it("treats description fields as nullable — AC-19.2 requires absent, not placeholder", () => {
    expectTypeOf<JobRow["description_html"]>().toEqualTypeOf<string | null>();
    expectTypeOf<JobRow["description_text"]>().toEqualTypeOf<string | null>();
  });

  it("keeps level non-nullable — FR-8 is enforced by the column, not by callers", () => {
    expectTypeOf<JobRow["level"]>().not.toEqualTypeOf<string | null>();
    // @ts-expect-error — level may not be null
    const nullLevel: JobRow = { ...activeJob, level: null };
    expect(nullLevel).toBeTruthy();
  });

  it("keeps title non-nullable — every job has the bank's own words", () => {
    expectTypeOf<JobRow["title"]>().toEqualTypeOf<string>();
  });

  it("allows a run in flight to have no finished_at (F-9)", () => {
    expectTypeOf<CrawlRunRow["finished_at"]>().toEqualTypeOf<Date | null>();
  });

  it("allows crawl_result.error to be absent on success", () => {
    expectTypeOf<CrawlResultRow["error"]>().toEqualTypeOf<string | null>();
  });
});

describe("NormalisedJob is the write path, not a row", () => {
  it("forbids an empty cities array where a row permits one", () => {
    const ok: NormalisedJob["cities"] = ["ha-noi"];
    expect(ok).toHaveLength(1);

    // @ts-expect-error — [] is forbidden by §4.2; use null for undetermined
    const empty: NormalisedJob["cities"] = [];
    expect(empty).toBeDefined();
  });

  it("still allows null for undetermined", () => {
    const undetermined: NormalisedJob["cities"] = null;
    expect(undetermined).toBeNull();
  });

  it("carries no id, status or run id — those belong to the database and the orchestrator", () => {
    expectTypeOf<NormalisedJob>().not.toHaveProperty("id");
    expectTypeOf<NormalisedJob>().not.toHaveProperty("status");
    expectTypeOf<NormalisedJob>().not.toHaveProperty("expired_at");
    expectTypeOf<NormalisedJob>().not.toHaveProperty("first_seen_at");
    expectTypeOf<NormalisedJob>().not.toHaveProperty("last_seen_run_id");
  });
});

describe("row types use snake_case, matching the SQL columns", () => {
  it("does not camelCase column names", () => {
    // T-009 must not enable a `transform` on the postgres client: it would make
    // every row type here wrong while still compiling.
    expectTypeOf<JobRow>().toHaveProperty("bank_id");
    expectTypeOf<JobRow>().toHaveProperty("posted_date");
    expectTypeOf<JobRow>().not.toHaveProperty("bankId");
    expectTypeOf<JobRow>().not.toHaveProperty("postedDate");
  });
});
