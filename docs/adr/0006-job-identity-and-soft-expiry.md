# ADR-0006 — Job identity, soft expiry, and the never-expire-on-doubt guard

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-08-13 |
| **Decides** | PRD OQ-4, OQ-5 (both confirmed as decided), FR-26, R-1, R-10 |

## Context

Two questions decide whether the dataset is trustworthy, and both are expensive to reverse because
they are enforced by a unique index on the main table and by irreversible `UPDATE` statements.

1. **Identity** — when the crawler sees a posting, is it a job already in the database, or a new
   one? Get this wrong and either the list fills with duplicates (R-10) or real postings overwrite
   each other.
2. **Expiry** — when a posting stops appearing, what happens to the row? Saved jobs must survive it
   (FR-26), and a broken scraper must never be able to wipe a bank's listings (OQ-5).

The second is the highest-consequence correctness rule in the system. A scraper that silently
returns 8 of 130 jobs and is treated as successful destroys 122 real postings, sends no alert
(count is non-zero), and the damage is only visible to a user who notices the site got thin.

## Decision

### Identity

The natural key is `(bank_id, dedupe_key)`, enforced by a unique index.

`dedupe_key` is computed by the shared normalisation pipeline, in this order of preference:

1. **A platform-native identifier where one exists.** SuccessFactors job URLs carry a numeric id
   (`/job/<slug>/<id>/`); Taleo and Talent.vn carry equivalents. Use `ext:<id>` — it is stable
   across title edits and slug changes, which URL-based keys are not.
2. **Otherwise, the canonicalised source URL** — lowercase host, `https`, tracking parameters
   stripped, fragment stripped, trailing slash stripped. Use `url:<canonical>`.

Consequences accepted, per OQ-4: the same role re-posted under a new URL/id counts as a new job.
No fuzzy title matching in v1.

Multi-branch postings (one role, many cities) collapse into one row with a `cities text[]` column
rather than one row per city. An array column, not a join table: it is one fewer table, filters
with a single `&&` operator against a GIN index, and there is no per-city data to hang off a join
row.

### Expiry — soft delete, with a hard guard

Rows are never deleted. `job.status` moves `active → expired` with `expired_at` set. Expired jobs
are excluded from search and list views, remain resolvable at their detail URL, and remain
attached to `saved_job` rows (FR-26).

**Expiry runs for a bank only when that bank's crawl outcome for the run is `success`.** Outcomes
are computed per bank, per run:

| Outcome | Condition | Upsert? | Expire? | Alert? |
|---|---|---|---|---|
| `success` | adapter completed, `found > 0`, and volume check passed | Yes | **Yes** | No |
| `zero_jobs` | adapter completed, `found == 0` | n/a | **No** | Yes |
| `failure` | adapter threw, or HTTP/parse error | No | **No** | Yes |
| `suspect` | `found > 0` but `found < ratio × previous_success_count` | Yes | **No** | Yes |
| `blocked` | `robots.txt` disallows, or bank is on the uncovered list | No | **No** | No |

`suspect` is an addition beyond PRD OQ-5, and it is the guard that matters most in practice. OQ-5
protects against a scraper returning *zero*; `suspect` protects against a scraper returning
*some* — a broken paginator, a changed page-size parameter, a listing that now lazy-loads after
page one. Zero-checks miss all of these, and they are more likely than total failure.

- `previous_success_count` = `jobs_found` from the most recent `crawl_result` for that bank with
  status `success`.
- Guard is armed only when `previous_success_count >= 10`, so a genuinely small bank does not trip
  it on normal fluctuation.
- Default `ratio` = **0.5**. Tunable per bank in config; recorded as an open question (OQ-T3).
- On `suspect`, jobs found are still upserted (their `last_seen` advances, data stays fresh) but
  nothing is expired and the maintainer is alerted. The next `success` run expires whatever is
  genuinely gone.

The expiry statement, run inside the same transaction as the bank's upserts:

```sql
UPDATE job SET status = 'expired', expired_at = now()
WHERE bank_id = $1 AND status = 'active' AND last_seen_run_id <> $2;
```

Per bank, one transaction covering upserts + expiry. A crash between banks leaves earlier banks
correct and later banks untouched; it can never leave one bank half-expired.

## Alternatives considered

| Alternative | Why it lost |
|---|---|
| **Hard delete on absence** | Breaks FR-26 outright and makes every crawl bug permanently destructive. Non-starter. |
| **URL as the sole identity key** | Simpler, and it is the PRD OQ-4 default. Loses to platform ids on one specific failure: SuccessFactors slugs contain the job title, so an employer editing a typo in a title changes the URL, and the same job is re-created as new while the original expires. Using the numeric id where available costs one regex and eliminates that class of churn. |
| **Content hash of title+bank+city as identity** | Merges genuinely distinct postings that happen to share a title (common — "Chuyên viên Khách hàng Cá nhân" appears many times per bank) and changes identity whenever a bank edits a title. Worse on both directions. |
| **A `job_city` join table instead of `cities text[]`** | Correct in the textbook sense. Rejected as an extra table, an extra join in every list query, and an extra thing to keep consistent, for data that is a flat list of ≤5 slugs with no attributes. |
| **Expire on a time-to-live** (e.g. not seen for 7 days → expired) instead of on absence | Immune to single-run scraper failures, which is attractive. Rejected because it makes the site's core claim — "these jobs are open" — lag reality by a week, and because it silently *hides* scraper breakage rather than surfacing it: a dead scraper produces a slowly emptying bank with no alert. The `suspect` guard gets the same safety while keeping breakage loud. |
| **Never expire; rely on the bank's own deadline field** | Most banks do not publish one reliably (A-2, A-3). Would leave dead postings on the site indefinitely, which destroys trust faster than a missing job. |

## Consequences

**Good**

- No crawl failure, of any shape observed so far, can destroy a bank's data. The worst case is
  stale-but-present listings plus an alert — which is exactly the degradation NFR-4 asks for.
- FR-26 falls out of the model for free: the row simply never goes away.
- Per-bank transactions mean partial runs are always in a valid state.
- `suspect` turns a class of silent data loss into a loud, named, diagnosable event.

**Bad**

- The `job` table grows monotonically. Estimated at a few thousand rows per year against a 500 MB
  budget (ADR-0002), so no action is needed in v1; a description-length cap and an eventual
  archival policy are noted in the technical design.
- Re-posted jobs with new URLs are counted twice. Accepted per OQ-4. It inflates "total live
  postings" and will occasionally show a user two near-identical rows. Visible, not harmful.
- The `suspect` ratio is a magic number. A bank with genuinely spiky posting volume will trip it and
  produce a false alert; the cost is an email, and the response is to raise that bank's ratio in
  config. Preferring false alerts to silent data loss is the deliberate asymmetry here.
- A bank that legitimately closes all its postings will sit in `zero_jobs` and alert on every cycle
  until the maintainer marks it. Accepted; add a config flag if it ever actually happens.
