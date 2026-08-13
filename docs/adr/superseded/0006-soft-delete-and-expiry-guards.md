# ADR-0006 — Soft delete on absence, with two guards against mass false expiry

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-13 |
| Drives | PRD OQ-5 (accepted), FR-5, FR-6, FR-26, R-1, R-7, §17 rollback posture |
| Reversal cost | **Highest in the project** — this rule is the only thing standing between a parser bug and irreversible data loss |

## Context

OQ-5 is accepted as decided: soft-delete on absence, saved jobs survive and are labelled
unavailable, and **a bank returning zero jobs or failing expires nothing for that bank that cycle.**

This ADR exists because the rule as stated protects against the *loud* failure — the scraper
throwing, or returning nothing at all — and not against the *quiet* one, which is more likely.
A SuccessFactors markup change that breaks the pagination selector does not throw and does not
return zero. It returns page 1 only: 25 of 130 jobs, all well-formed. Under the rule as literally
stated, the crawl succeeds and 105 real, open postings are marked inactive and vanish from the
site. The maintainer is never notified, because nothing failed.

That is the failure this project must not have. It destroys G-1 (coverage), it is invisible, and
under a hard delete it would be unrecoverable.

## Decision

**Jobs are never deleted. Expiry is a state transition that runs only when the crawl result for
that bank passes two guards.**

### 1. No hard deletes, ever

`jobs` rows are only ever inserted or updated. Expiry sets `is_active = false, expired_at = now()`.
There is no `DELETE FROM jobs` anywhere in the codebase, including cleanup jobs. A reappearing
posting is reactivated in place (`is_active = true, expired_at = NULL`), preserving `first_seen_at`.

### 2. Guard A — outcome guard (PRD OQ-5, verbatim)

Expiry runs for a bank **only if** that bank's outcome for the run is `success`. A bank recorded
`failure` or `zero_jobs` expires nothing that cycle. Its existing jobs keep `is_active = true` and
keep their previous `last_seen_at`, and the site continues to show them.

### 3. Guard B — volume-drop guard (extension; see "Relationship to the PRD")

Even on `success`, expiry runs **only if**:

```
jobs_found >= ceil(0.5 * banks.last_success_job_count)
```

If the count drops by more than half against the last successful run for that bank, the run
records outcome `suspect`, **skips expiry entirely for that bank**, still upserts everything it
did find, and alerts. Thresholds are constants in one place, not scattered magic numbers:

| Constant | Default | Meaning |
|---|---|---|
| `EXPIRY_DROP_FLOOR` | `0.5` | Fraction of the previous successful count below which expiry is skipped |
| `DROP_GUARD_MIN_BASELINE` | `10` | Below this previous count, the guard is not applied — noise, not signal |

A bank with no `last_success_job_count` (first ever run) skips Guard B by definition.

### 4. Expiry statement

Scoped by bank and by run, so one bank's crawl can never touch another's:

```sql
UPDATE jobs
   SET is_active = false, expired_at = now()
 WHERE bank_id = $1
   AND is_active
   AND last_seen_run_id IS DISTINCT FROM $2;   -- $2 = current run id
```

### 5. Saved jobs are unaffected by all of the above

`saved_jobs` references `jobs.id`. Because rows are never deleted, a saved job always resolves
(FR-26/AC-26.1). The saved list renders inactive jobs with a Vietnamese "không còn tuyển" label and
**suppresses the apply link** rather than presenting a dead link as live (AC-26.2, AC-26.3).

### 6. Every skipped expiry is visible

`crawl_bank_results` records `expiry_skipped boolean` and `expiry_skip_reason text`. A skipped
expiry is an alerting condition, not a silent safety net. If a bank skips expiry on consecutive
runs, its listings are frozen and getting staler — which OQ-7's per-bank staleness notice surfaces
to users after 2 cycles.

## Relationship to the PRD

Guards A, the soft delete, and the saved-job behaviour are OQ-5 as accepted. **Guard B and the
`suspect` outcome are an addition made at design time.** They do not contradict any PRD
requirement, but they do introduce a fifth per-bank outcome beyond FR-5's three
(`success` / `zero-jobs` / `failure`) and a sixth (`skipped`, for a disabled bank).

The product owner should confirm the extension. My recommendation is to adopt it: OQ-5's stated
rationale — "a broken scraper must never wipe a bank's listings" — is exactly the intent, and the
literal rule does not achieve it against partial failure, which is the most common way a scraper
breaks. **Recommended default: adopt, with `EXPIRY_DROP_FLOOR = 0.5`.** If rejected, the outcome
enum reverts to three values and the project accepts silent partial-coverage loss.

## Alternatives considered

| Option | Why it lost |
|---|---|
| **Hard delete on absence** | Simplest, and fatal. Breaks FR-26 outright and makes any expiry bug unrecoverable. Never a candidate. |
| **Guard A only (PRD as literally written)** | Protects against total failure but not partial failure — the dominant real-world case for a paginated scraper. |
| **Expire only after N consecutive absences (e.g. 2 runs)** | Genuinely good, and orthogonal to the guards. Rejected for v1 on simplicity grounds: it adds an `absent_run_count` column and a second state machine to reason about, in exchange for tolerating a class of failure the two guards already catch. Revisit if false expiries are observed in P5. |
| **Never expire; show everything forever** | Zero data loss, but the site fills with dead postings and G-2 (trustworthy freshness) dies. Users clicking through to 404s is the worst outcome for a directory. |
| **Compare against a snapshot and require manual approval to expire** | Safe and unacceptable: it is ongoing manual daily work, out of scope by construction (C-5). |

## Consequences

**Good**

- A parser regression costs one stale cycle and one alert email; it cannot cost the dataset.
- Recovery from any bad run is "fix the parser, run the workflow again" — the §17 rollback posture
  becomes literally true rather than aspirational.
- `first_seen_at` survives reactivation, so posted-date ordering (FR-12) stays stable for postings
  that flicker in and out of a bank's listing.

**Bad / accepted**

- Genuinely-closed postings linger for one extra cycle whenever a guard trips. Correct trade:
  showing a closed job for 12 hours is a minor annoyance; hiding 105 open jobs is product failure.
- The `jobs` table grows monotonically. At ~2,000 live postings and normal churn this is
  negligible for years; if it ever matters, the answer is archiving inactive rows **that no user
  has saved**, never deletion of saved ones.
- Guard B will produce false alarms — a bank genuinely closing a hiring wave will trip it. The
  maintainer clears it by re-running or by accepting the count. False alarms in this direction are
  cheap; the inverse is not.
