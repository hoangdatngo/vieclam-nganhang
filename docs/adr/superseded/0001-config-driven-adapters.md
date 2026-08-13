# ADR-0001 — Config-driven adapters, not 15 bespoke scrapers

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-13 |
| Drives | PRD FR-1, FR-2, FR-3, NFR-8, R-1 |
| Reversal cost | High — it decides the shape of every scraper written in P0–P1 |

## Context

The PRD assumes each of the 15 banks needs its own scraper (R-1: "Each bank site needs its own
scraper"). Reconnaissance of the actual career sites contradicts that assumption:

| Bank | Platform | Evidence |
|---|---|---|
| Sacombank | SAP SuccessFactors | `sacombankcareer.com/search/?locale=vi_VN`, `rmkcdn.successfactors.com` assets, `/job/<slug>/<id>/` |
| Techcombank | SAP SuccessFactors | `techcombankjobs.com/search/?locale=vi_VN`, same job URL pattern |
| Vietcombank | SAP SuccessFactors | `tuyendung.vietcombank.com.vn/search/?locale=vi_VN` |
| VPBank | SAP SuccessFactors | `tuyendung.vpbank.com.vn/search/?locale=vi_VN`, redirected from `tuyendungvpbank.jobs.hr.cloud.sap` |
| ACB | Talent.vn (`data-talent-v2.basecdn.net`) | `acbjobs.com.vn/job/<slug-id>` |
| VietinBank | Custom SPA, jobs loaded from an API | `tuyendung.vietinbank.vn/tuyendung/` renders an empty shell |
| MB | Career domain moved; `careers.mbbank.com.vn` 404s | `tuyendung.mbbank.com.vn/tim-viec-lam/...` seen in search results |

At least four of the largest banks — including three of the "big four" by listing volume — run
byte-for-byte identical SuccessFactors career sites. The listing pages are **server-rendered
HTML**; no browser is needed. The remaining 8 banks are not yet investigated, but VN banks
overwhelmingly buy HR platforms rather than build them, so more platform clustering is likely.

## Decision

**Scrapers are organised as a small set of *platform adapters* driven by per-bank configuration,
not as one scraper per bank.**

- An adapter implements one *platform* (`successfactors`, `talent_vn`, `json_api`, `html_list`,
  `browser`). It contains all fetch/pagination/parse logic for that platform.
- A bank is a **config object** in `crawler/banks/<bank-id>.ts` naming an adapter and its
  parameters (base URL, locale, selectors, field mappings).
- Bank configs live in the **repository as TypeScript**, not in the database. Changing a selector
  is a reviewable, testable, revertible commit — not an untracked `UPDATE` against production.
- `html_list` is the generic escape hatch: a config of CSS selectors and attribute mappings for
  one-off static sites. `browser` (Playwright) is the last resort and must be justified per bank.

Adding a bank on a known platform is therefore a **config file plus a fixture test**, not a new
module of imperative code.

## Alternatives considered

| Option | Why it lost |
|---|---|
| **15 bespoke scrapers** (PRD's implicit assumption) | 4+ copies of identical SuccessFactors logic. A SuccessFactors markup change would require the same fix in 4 files, and the maintainer would find out 4 separate times. Directly amplifies R-1. |
| **One fully generic config-driven scraper** (selectors for everything, no code per platform) | Pagination, locale handling, and detail-page fetching differ enough per platform that the config language becomes a programming language — the classic inner-platform effect. A solo maintainer debugging a YAML DSL at 2am is worse off than one reading TypeScript. |
| **A scraping framework/SaaS** (Apify, Scrapy-style) | Scrapy is Python; no Python is installed. Hosted scrapers cost money (violates C-1) and add a vendor between the maintainer and the failure. |
| **Browser-based scraping for everything** (uniform Playwright) | Uniform but ~50× slower and heavier than HTTP+parse for the SuccessFactors cluster, and adds a large fragile dependency to sites that never needed it. |

## Consequences

**Good**

- One SuccessFactors fix covers Vietcombank, Techcombank, VPBank and Sacombank at once.
- Adapters are pure functions over fetched HTML, so they can be tested against **saved HTML
  fixtures in CI**. Parser breakage is caught by a failing test, not by a silent zero-jobs run.
  This is the single strongest mitigation available for R-1.
- Meets NFR-8 ("add a new bank scraper without changing the website") by construction.
- Reduces P1 (13 remaining scrapers) from 13 units of work to roughly 3–5 adapters plus 13 configs.

**Bad / accepted**

- One shared adapter is a shared failure domain: a bad edit to the SuccessFactors adapter can
  break four banks at once. Mitigated by fixture tests per bank and by the ADR-0006 expiry guards,
  which prevent a bad run from destroying data.
- Config objects will accrete per-bank exceptions ("this bank's date is in column 3"). Rule: when a
  bank needs a third exception flag, it graduates to its own adapter rather than growing the config
  schema for everyone.
- The abstraction is speculative for the 8 uninvestigated banks. If they turn out to be 8 distinct
  bespoke platforms, this decision costs nothing — they simply use `html_list` or their own adapter.
