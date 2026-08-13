# ADR-0003 — The crawler runs on GitHub Actions, in a public repository

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-08-13 |
| **Decides** | PRD FR-1, FR-3, FR-6, NFR-4, NFR-7; C-2, C-3, C-4; mitigates R-4 |

## Context

PRD C-2 rules the crawler out of the web host: Vercel Hobby's cron frequency and function duration
limits are both too tight. C-3 recommends GitHub Actions but explicitly asks that the
recommendation be validated rather than accepted.

The recon materially raises the stakes. Roughly a third of covered banks (VietinBank, BIDV, TPBank,
HDBank, MB, possibly SHB) are JavaScript shells serving no job data in static HTML. Headless
browsing is a first-class execution mode, not an edge case — which means the crawler needs an
environment with hundreds of megabytes of Chromium, several minutes of wall-clock, and no
per-invocation duration ceiling.

## Decision

**Run the crawler as a plain Node.js program on GitHub Actions, on a `schedule` cron every 12
hours, in a public repository.**

```yaml
on:
  schedule:
    - cron: '0 1,13 * * *'   # 08:00 and 20:00 Asia/Ho_Chi_Minh (UTC+7)
  workflow_dispatch:          # manual re-run is the primary operational tool
```

Supporting decisions:

1. **Try the JSON API before the browser.** For every JS-shell bank, the first implementation
   attempt is to call the XHR endpoint the page itself calls (`json-api` adapter). A JSON endpoint
   is faster, more stable, cheaper, and far less likely to break than DOM scraping. Playwright is
   the fallback, not the default, and every bank on the `browser` adapter is recorded as technical
   debt with a note of what was tried.
2. **Playwright Chromium only, installed conditionally.** `npx playwright install --with-deps
   chromium` runs only when at least one enabled bank uses the `browser` adapter. Cache the browser
   download with `actions/cache` keyed on the Playwright version.
3. **Public repository.** Estimated monthly cost on a private repo is 60 runs × ~20–30 min ≈
   1,200–1,800 minutes, against a Free-plan private allowance of 2,000 minutes/month — too close to
   the ceiling once retries and manual re-runs are counted. Public repositories do not consume that
   allowance. Public also supports the C-6 transparency posture: the crawling code, its rate
   limits and its User-Agent are auditable by any bank that asks.
4. **Failure signalling is the exit code.** The crawl completes fully and commits all data, *then*
   the process exits non-zero if any bank recorded `failure`, `zero_jobs` or `suspect`. GitHub's
   default "notify on failed workflow" email is the alert channel (OQ-6 — no new service). A
   Markdown per-bank table is written to `$GITHUB_STEP_SUMMARY` so the email links to something
   readable. **The non-zero exit must never short-circuit the database write** — it is a signal
   about a completed run, not an abort.
5. **The 60-day inactivity hazard is designed for.** GitHub disables scheduled workflows in public
   repositories after 60 days with no repository activity (verified 2026-08-13). For a launched,
   feature-frozen product maintained by one person, 60 days of no commits is entirely plausible —
   and the failure is *silent*, which is precisely R-7. Mitigation: a second scheduled workflow
   runs monthly and pushes a trivial commit touching `.github/last-keepalive`, plus a
   `Site last refreshed` check described in the technical design.

## Alternatives considered

| Alternative | Why it lost |
|---|---|
| **Vercel Cron + serverless/edge functions** | Ruled out by C-2 and reconfirmed: no practical headless Chromium, and Hobby function duration cannot cover 13 banks with rate limiting. Also couples the fragile crawler to the user-facing host, defeating NFR-4. |
| **Supabase `pg_cron` + Edge Functions** | Deno runtime, short execution ceiling, no browser. Would also put the scraper inside the database's blast radius. |
| **Cloudflare Workers Cron** | No headless browser on the free tier (Browser Rendering is a paid product). Rules out a third of covered banks. |
| **Render / Railway / Fly cron jobs** | All have offered and withdrawn free tiers. Betting the product's only data-collection path on a free tier that vendors keep removing is not a plan. GitHub Actions' free tier for public repositories is the most durable of the options. |
| **The maintainer's own Windows machine (Task Scheduler)** | Zero cost and full control, but requires the machine to be on and online every 12 hours, has no run history a third party can inspect, and makes freshness a function of one laptop's lid. Retained as the *debugging* environment: the crawler is a plain Node program and runs identically locally. |
| **Self-hosted runner on a free VPS (Oracle Cloud Always Free)** | Real capability, genuinely free, but it is a server to patch, monitor and lose. Adds an ops surface a solo maintainer does not need for a job that runs twice a day. |

## Consequences

**Good**

- Free, unmetered for public repositories, with long job durations and full Linux — Playwright
  works without contortion.
- Complete, retained run logs and one-click re-run are already built, which covers a meaningful
  part of NFR-14 and the entire "manual re-run" operational need at zero build cost.
- The crawler is a plain Node program with no platform SDK. It runs identically on a laptop, which
  makes debugging a bank failure a local activity rather than a push-and-pray loop.
- Total isolation from the website (NFR-4): the crawler cannot take the site down, only make its
  data older.

**Bad**

- **Cron is best-effort.** Scheduled runs are commonly delayed 5–30 minutes and occasionally more
  than an hour under load (verified 2026-08-13). Consequence for the design: the FR-11 freshness
  indicator must be computed from the recorded crawl *completion* timestamp, never from the
  schedule. "Every 12 hours" is a target, not a guarantee — the PRD's ≤24h staleness metric has
  ample margin for this.
- Silent disabling after 60 days of inactivity, mitigated above but never fully eliminated.
- A public repository publishes the bank configs and selectors. Judged acceptable: nothing secret
  is in them, and the transparency is consistent with C-6.
- Secrets live in GitHub Actions secrets, so a compromised workflow file is a compromised database.
  Mitigation: branch protection on `main`, and the crawler's database credential is a role that
  cannot drop tables (see technical design §8).

## Revisit if

- Playwright-dependent banks push run time past ~45 minutes, at which point split the workflow into
  a static-banks job and a browser-banks job running in parallel (both write to the same run row).
- GitHub changes public-repository Actions billing.
