# PRD — Vietnamese Banking Jobs Aggregator (working title: **BankJobs VN**)

| Field | Value |
|---|---|
| **Version** | 0.3 |
| **Status** | Draft — awaiting decisions on Open Questions OQ-1 and OQ-2 |
| **Author** | Ngo Hoang Dat |
| **Date** | 2026-08-13 |
| **Product type** | Greenfield web product, solo-built, free-tier hosted |
| **Repository / working dir** | `C:\Users\LENOVO\CV_reviewer` (directory name is a leftover from an unrelated earlier idea and has no bearing on this product) |

### Changelog

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-08-13 | Ngo Hoang Dat | Initial draft. Captures settled v1 scope from discovery, the rejected live-scrape alternative, level taxonomy, hosting constraint, risks. Success metrics, job schema, expiry policy, and post-v1 phasing left as Open Questions. |
| 0.2 | 2026-08-13 | Ngo Hoang Dat | Correction pass following reconnaissance of the real bank career sites and the technical/design documents. **Coverage reduced 15 → 13 banks** (VIB and Agribank deliberately excluded, §8.1 FR-2). **A-12 falsified** by VIB's WAF and rewritten as a finding with a standing no-evasion position. **New FR-28** requires the coverage boundary to be published. **OQ-2's coverage metric restated** to "13 of 13 covered banks", and G-1 reworded to claim a published subset rather than the whole sector. **NFR-9 320px** (was 360px) — internal consistency fix against NFR-10/WCAG 1.4.10. **OQ-3, OQ-4, OQ-5, OQ-6 resolved** by the technical design and marked with their ADRs; OQ-5's guard strengthened with a volume-drop check. **OQ-8 withdrawn** by owner decision. **New OQ-9** raises the AC-11.2 freshness conflict for the owner's ruling. No other v1 decision changed. |
| 0.3 | 2026-08-13 | Ngo Hoang Dat | **OQ-9 decided by the product owner: Option B** — the freshness indicator counts partially-successful (`degraded`) runs, not only fully-successful ones. **AC-11.2 amended** to match the decision, so the requirement of record and the technical design now agree; the technical design's deviation is **approved**, no longer flagged. **OQ-7 accepted and promoted to a numbered requirement, FR-29** (per-bank staleness notice) rather than remaining a resolved Open Question — because Option B's honesty depends on it, and an OQ can be quietly dropped during a build in a way a requirement cannot. The coupling between AC-11.2 and FR-29 is stated in both places. No other change. |

> **Naming note:** "BankJobs VN" is a placeholder used for readability in this document. The product name is not decided — see **OQ-1**.

---

## 1. Overview

Banking jobs in Vietnam are not aggregated anywhere. Each commercial bank posts openings only on its own career site, so a candidate must already know which banks to check and then check dozens of separate sites, repeatedly, because postings appear and expire without notice.

This product is a single Vietnamese-language website that collects job postings from Vietnamese commercial banks into one searchable, filterable list. A scheduled background crawler refreshes the listings every 12 hours into the product's own database; visitors search instantly against that database and click through to the bank's own site to apply. **v1 covers 13 named banks, with ~50 as the eventual target.** Two further large banks — VIB and Agribank — are deliberately excluded from v1 for reasons stated in FR-2 and published on the site (FR-28).

The product is a directory, not an application platform. It never receives, stores, or forwards a CV or an application.

---

## 2. Problem Statement

### The problem

| Aspect | Detail |
|---|---|
| **Who has it** | Anyone job-hunting in the Vietnamese banking sector |
| **What they must do today** | Know which banks to look at, then visit ~50 individual bank career sites one by one |
| **Why it repeats** | Postings appear and expire without notice, so a single sweep goes stale within days. The manual check must be repeated indefinitely. |
| **Why the obvious workaround fails** | Banks post almost exclusively on their own career sites, not on LinkedIn or the large Vietnamese job boards. Searching the aggregators that already exist does not surface these jobs. |
| **Net effect** | There is no single place to see what is open in the sector. Candidates miss openings that expired between their checks, and cannot see the sector's opportunities side by side. |

### Cost of inaction

Candidates continue to rely on incomplete, manually assembled views of the market and miss postings purely through timing. No competitor is solving this; the gap persists.

### Why this is solvable now by one person

The data is public, structured enough to parse, and changes slowly (daily-ish, not by the minute). A scheduled crawl into a small database is well within a solo builder's reach on free hosting tiers.

---

## 3. Goals and Non-Goals

### Goals

| ID | Goal |
|---|---|
| G-1 | A candidate can see every currently-open posting from the **13 covered banks** in one place, without visiting any bank site to browse — and can see plainly which banks are covered and which are not (FR-28). *The claim is an explicit, published subset of the sector, not the whole sector.* |
| G-2 | Listings are fresh enough that a candidate trusts the site instead of re-checking bank sites, and can see how fresh the data is |
| G-3 | A candidate can narrow the list to relevant jobs by city, level, and posted date, and by Vietnamese free-text search |
| G-4 | A candidate can keep track of banks and jobs they care about across sessions |
| G-5 | The product is genuinely launched and publicly usable — not a portfolio artifact — and is operable by one person on free tiers |

### Non-Goals (v1)

Explicitly out of scope. Listing them here prevents scope creep; some are candidates for later releases (§13).

| ID | Non-goal | Rationale |
|---|---|---|
| NG-1 | Non-bank financial employers — securities firms, insurance, consumer finance companies, fintechs, Big 4 | Scope of "banking" is deliberately narrow: Vietnamese commercial banks only |
| NG-2 | Email or push alerts of any kind | Consciously deferred; leading v2 candidate (see R-3) |
| NG-3 | Accepting, storing, parsing, or forwarding CVs or applications | Product links out; it never handles applications |
| NG-4 | Any English or multi-language interface | Vietnamese-only for v1 |
| NG-5 | Salary data, company reviews, interview questions, or editorial content | Not part of the core aggregation value |
| NG-6 | Employer-facing features — job posting, employer accounts, sponsored listings | No employer relationship exists in v1 |
| NG-7 | Mobile apps (iOS/Android) | Responsive web only |
| NG-8 | Recommendations, matching, or personalised ranking | Requires data and signal the product will not have at launch |
| NG-9 | Real-time / on-demand scraping at page load | Considered and rejected — see §4 |
| NG-10 | Login requirement for browsing | Search, filter, and view are always open |
| NG-11 | Monetisation of any kind | No budget, no revenue target in v1 |

---

## 4. Considered and Rejected: Live On-Demand Scraping

**Recorded so the reasoning is not lost and the idea does not resurface.**

The original concept was to scrape bank career sites live, at the moment a visitor opens the website. This was evaluated and **rejected** in favour of a scheduled background crawl into the product's own database.

| Reason | Detail |
|---|---|
| **Unacceptable latency** | 15 sites, several JavaScript-rendered and requiring a headless browser, means roughly 15–30 seconds of blank screen per page load. Users abandon after ~3 seconds. |
| **Existential blocking risk** | Every visitor triggers a fresh crawl. At 100 visitors/day that is ~1,500 requests/day against bank career sites — indistinguishable from an attack. The server IP gets blocked, which kills the product outright. |
| **No user-visible benefit** | Banks do not post by the minute. Daily-ish freshness is indistinguishable to users from real-time freshness. |
| **Simpler to build** | The scheduled crawl is both better for users and less work, and it isolates the fragile scraping layer from the user-facing site. |

**Decision: scheduled background crawl every 12 hours. Settled — not to be re-opened.**

> *v0.2 note:* the reasoning above is preserved as it was argued, when the coverage list was 15 banks. Coverage is now 13 (FR-2). The arithmetic changes slightly; none of the four reasons does.

---

## 5. Success Metrics

> **Not yet decided by the product owner.** See **OQ-2** for the recommended default set. The table below is the *recommended* starting point and must be confirmed before it becomes authoritative.

| Goal | Proposed metric | Proposed target | How tracked |
|---|---|---|---|
| G-1 | Bank coverage: covered banks returning ≥1 job on the most recent successful crawl | **13 of 13 covered banks** — where "covered" is the explicit, published subset in FR-2, not every commercial bank in Vietnam | Crawl run log |
| G-1 | Total live postings in the database | ≥ 200 (order-of-magnitude sanity check, not a growth target) | Database count |
| G-2 | Crawl success rate: scheduled runs completing with zero bank-level failures | ≥ 95% of runs over a rolling 30 days | Crawl run log |
| G-2 | Maximum data staleness at any point | ≤ 24 hours (i.e. never more than one missed 12-hour cycle) | Crawl run log |
| G-3 | Outbound click-through rate: sessions with ≥1 click to a bank apply page | ≥ 25% of sessions | Web analytics event |
| G-4 | Returning visitors within 30 days | ≥ 15% of visitors | Web analytics |
| G-5 | Product is publicly reachable at a stable URL and has served real, non-owner traffic | Yes / No | Manual |

**Metric hygiene:** every goal G-1…G-5 has at least one metric above. If OQ-2 removes a metric, its goal must retain a replacement or the goal itself should be cut.

---

## 6. Target Users and Personas

**Target user (settled):** anyone job-hunting in the Vietnamese banking sector. Deliberately *not* narrowed to fresh graduates versus experienced movers.

The personas below are illustrative segments within that single audience, used to sanity-check requirements. They do not narrow the target user.

| Persona | Context | Needs | Pain today |
|---|---|---|---|
| **P1 — The entry-level seeker** | Final-year student or recent graduate looking for intern / Nhân viên roles | See all entry-level openings across the sector at once; filter by level and city | Does not know which of ~50 banks are hiring juniors; discovers postings after they close |
| **P2 — The sector mover** | Currently employed in banking, watching for a better role at Chuyên viên / Trưởng phòng level | Passive, periodic scanning; wants to watch specific banks | Cannot justify checking dozens of sites weekly while employed; misses windows |
| **P3 — The relocating candidate** | Wants roles in a specific city (e.g. Đà Nẵng, Cần Thơ) | Filter the whole sector by city in one query | Bank sites vary in how they expose location; no cross-bank city view exists |

All three share the same core job-to-be-done: **see what is open across the sector, in one place, without repeated manual sweeps.**

---

## 7. User Stories

Prioritised with MoSCoW. Must-have stories map to v1 functional requirements.

| ID | Story | Priority | Related FRs |
|---|---|---|---|
| US-1 | As a job seeker, I want to see all currently-open banking jobs in one list, so that I do not have to visit each bank's site | **Must** | FR-1, FR-10 |
| US-2 | As a job seeker, I want to search job titles in Vietnamese (with or without diacritics), so that I can find relevant roles quickly | **Must** | FR-13, FR-14 |
| US-3 | As a job seeker, I want to filter by city, so that I only see jobs where I can work | **Must** | FR-15 |
| US-4 | As a job seeker, I want to filter by level, so that I see roles matching my seniority | **Must** | FR-16, FR-7 |
| US-5 | As a job seeker, I want to filter by how recently a job was posted, so that I can focus on new openings | **Must** | FR-17 |
| US-6 | As a job seeker, I want to see how recently the listings were updated, so that I know whether to trust them | **Must** | FR-11 |
| US-7 | As a job seeker, I want to open a job and go straight to the bank's own application page, so that I can apply through the official channel | **Must** | FR-19, FR-20 |
| US-8 | As a job seeker, I want to browse and search without creating an account, so that there is no barrier to trying the site | **Must** | FR-21 |
| US-9 | As a registered user, I want to save jobs, so that I can review them later | **Must** | FR-24 |
| US-10 | As a registered user, I want to follow banks, so that I can quickly see openings from the banks I care about | **Must** | FR-25 |
| US-11 | As a job seeker, I want jobs whose level could not be determined to still appear in results, so that a bad guess never hides a job from me | **Must** | FR-8, FR-16 |
| US-12 | As the maintainer, I want to be told when a bank returns zero jobs, so that a silently broken scraper does not go unnoticed | **Must** | FR-5, FR-6 |
| US-13 | As a job seeker, I want to see which bank each job belongs to at a glance | **Must** | FR-10 |
| US-14 | As a registered user, I want a saved job to remain in my list even after the posting disappears from the bank's site, so that saving is reliable | **Should** | FR-26, OQ-5 |
| US-15 | As a job seeker, I want to use the site comfortably on my phone | **Should** | NFR-9 |
| US-19 | As a job seeker, I want to know which banks this site does and does not cover, so that I can tell a gap in coverage from a bank with no openings | **Must** | FR-28 |
| US-16 | As a job seeker, I want to share a link to a specific job or a filtered search | **Could** | FR-18, FR-19 |
| US-17 | As a job seeker, I want email alerts when a followed bank posts a new job | **Won't (v1)** | Deferred — see NG-2, R-3 |
| US-18 | As a job seeker, I want to see salary ranges | **Won't (v1)** | NG-5 |

---

## 8. Functional Requirements

Each requirement is atomic and testable. **AC** = acceptance criteria.

### 8.1 Collection (Crawler)

**FR-1 — Scheduled crawl of covered banks**
The system shall run a background crawl of every covered bank's career site on a fixed schedule of every 12 hours, writing results into the product's own database.
- **AC-1.1:** Given the schedule is active, when 12 hours elapse since the last scheduled run, then a new crawl run starts automatically without human action.
- **AC-1.2:** Given a crawl run completes, when the run log is inspected, then it records a start time, end time, and per-bank outcome for all 13 covered banks.
- **AC-1.3:** No crawl of a bank site is ever triggered by a visitor's page load or search. (Regression guard for §4.)

**FR-2 — Covered bank list (v1)**
The system shall crawl exactly these **13** banks in v1: Vietcombank, BIDV, VietinBank, Techcombank, MB, VPBank, ACB, Sacombank, SHB, HDBank, TPBank, MSB, LPBank.
- **AC-2.1:** Given a completed crawl run, when the run log is inspected, then all 13 banks named above appear, each with an outcome.
- **AC-2.2:** No employer outside this list appears in the job database in v1.
- **AC-2.3:** Neither VIB nor Agribank is crawled, counted as covered, or able to raise a crawl alert.

> **Deliberately uncovered banks — decided by the product owner, recorded so neither is re-proposed.**
>
> These are **exclusions, not failures.** Both banks are large and their absence is a real, accepted product cost (R-11). The reasoning below is why coverage is 13 rather than 15, and it is preserved to prevent the work being re-attempted.
>
> | Bank | Why excluded | Why not solved |
> |---|---|---|
> | **VIB** | Its careers site sits behind a WAF bot-protection challenge — it actively refuses automated clients | Evasion (stealth browsers, residential proxies, CAPTCHA solving) was considered and **rejected on ethical and maintenance grounds** — see ADR-0005. It would also contradict the public crawling posture in C-6, which is the product's entire legal position: crawling politely with an identifying User-Agent while evading a WAF makes that statement untrue. Paid proxy/CAPTCHA services would also violate C-1. |
> | **Agribank** | It publishes news-style recruitment announcements — exam schedules, results, notices — not structured per-role postings | **There is no Job entity to extract without inventing one.** Modelling announcements as a second, coarser record type would add a record type to every query, filter, list and detail view, to serve one bank with data that answers none of a candidate's questions (what role, where, what level). |
>
> **Standing position:** a bank that actively blocks automated access is moved to the uncovered list and stated publicly — never evaded, and never re-attempted with escalating techniques. This applies to currently-covered banks that start blocking, too. See finding **F-A12** (§14.1) and ADR-0005.

**FR-3 — JavaScript-rendered source support**
The crawler shall be able to extract postings from bank career sites that render their job list client-side via JavaScript.
- **AC-3.1:** For each covered bank identified as JavaScript-rendered, the crawler returns a non-zero job count on a manual verification run.

**FR-4 — Polite crawling**
The crawler shall identify itself and limit its request rate.
- **AC-4.1:** Every outbound request sends a descriptive, identifying User-Agent string that includes a contact or project URL.
- **AC-4.2:** The crawler issues requests to a single bank domain no faster than a configured rate limit (default: ≥ 2 seconds between requests to the same domain).
- **AC-4.3:** The crawler reads and respects the target site's `robots.txt` directives for the paths it fetches.
- **AC-4.4:** The crawler requests only publicly accessible job listing pages; it does not attempt authentication, does not submit forms, and does not access any non-public area.

**FR-5 — Per-bank outcome recording**
Each crawl run shall record, per bank, one of: `success` (with job count), `failure` (with error), or `zero-jobs`.
- **AC-5.1:** Given a bank's scraper throws an error, when the run finishes, then that bank is recorded as `failure` with the error captured, and the run continues for the remaining banks.
- **AC-5.2:** Given a bank's scraper completes but yields no postings, when the run finishes, then that bank is recorded as `zero-jobs` — distinct from both `success` and `failure`.

**FR-6 — Failure and zero-result alerting**
The system shall notify the maintainer when any bank records `failure` or `zero-jobs` on a crawl run.
- **AC-6.1:** Given bank X records `zero-jobs` on a run, when the run finishes, then a notification identifying bank X and the outcome reaches the maintainer within one crawl cycle.
- **AC-6.2:** The notification distinguishes `failure` from `zero-jobs`.
- **AC-6.3:** A bank that returns zero jobs is never silently treated as "this bank has no openings" without a notification being raised. *(Rationale: a broken scraper and a bank with genuinely no openings are indistinguishable from the data alone.)*

**FR-7 — Level inference from job title**
The system shall assign each posting a level by matching keywords in its job title against this taxonomy:

| Level | Vietnamese label |
|---|---|
| Intern | Thực tập sinh |
| Staff | Nhân viên |
| Officer / Specialist | Chuyên viên |
| Senior | Chuyên viên cao cấp |
| Manager | Trưởng phòng / Trưởng bộ phận |
| Director | Giám đốc |
| *(fallback)* | Uncategorized — see FR-8 |

- **AC-7.1:** Given a title containing "Thực tập sinh", when inference runs, then the posting's level is Intern.
- **AC-7.2:** Given a title containing "Chuyên viên cao cấp", when inference runs, then the posting's level is Senior, not Officer/Specialist. *(More specific match wins over a less specific one.)*
- **AC-7.3:** Level inference uses the job title only.

**FR-8 — Uncategorized fallback (hard design rule)**
A posting whose title matches no level keyword shall be assigned the **Uncategorized** level, and shall still appear in results whenever no level filter is applied.
- **AC-8.1:** Given a posting with an unmatchable title, when a user browses with no level filter selected, then that posting appears in the results.
- **AC-8.2:** Given a posting is Uncategorized, when any specific level filter is applied, then it is excluded from that filtered result — and only then.
- **AC-8.3:** No posting is ever excluded from the unfiltered list because level inference failed or guessed wrongly.

**FR-9 — Level is presented as non-authoritative**
The UI shall not present an inferred level as a fact stated by the employer.
- **AC-9.1:** Wherever a level is displayed or offered as a filter, the interface indicates the level is inferred from the job title (e.g. a short note or tooltip in Vietnamese).
- **AC-9.2:** The job detail view always shows the original, unmodified job title from the source posting.

### 8.2 Browsing, Search and Filtering

**FR-10 — Aggregated job list**
The system shall display postings from all covered banks in a single list, each row showing at minimum: job title, bank name, city, inferred level, and posted date.
- **AC-10.1:** Given postings exist from more than one bank, when the list loads, then postings from multiple banks appear in the same list.
- **AC-10.2:** Every row identifies its bank without the user opening the job.

**FR-11 — Freshness indicator**
The system shall display how long ago the listings were last updated, expressed in Vietnamese as elapsed time (e.g. "Cập nhật 3 giờ trước").
- **AC-11.1:** Given the last crawl that refreshed data finished 3 hours ago, when the list loads, then the indicator reads 3 hours ago.
- **AC-11.2:** The indicator is derived from the last crawl run that **actually refreshed data** — one that completed either fully successfully or partially successfully (`degraded`) — and not from the last *attempted* run. A run in which no bank succeeded does not advance the indicator. *(Amended in v0.3 by owner decision on OQ-9, Option B. Superseded wording: "derived from the last successful crawl completion". §16.2 holds the reasoning.)*
- **AC-11.3:** The indicator is visible on the main list view without scrolling on a standard mobile viewport.
- **AC-11.4:** Given one covered bank has not refreshed for longer than the FR-29 threshold while others have, when the list loads, then the global indicator still reflects the recent partial refresh **and** the stale bank is surfaced per FR-29.

> **Coupling — AC-11.2 depends on FR-29. Do not implement one without the other.**
> Counting `degraded` runs is only honest because per-bank staleness is surfaced separately (FR-29). Shipping AC-11.2's amended behaviour *without* FR-29 would announce "updated 1 hour ago" while a bank sits silently broken for days — strictly worse than the wording this amendment replaced, and directly corrosive to G-2. **If FR-29 is cut, AC-11.2 must revert to the last fully-successful run.** These two ship together or not at all.

**FR-12 — Default result ordering**
The system shall order the unfiltered list by posted date, most recent first.
- **AC-12.1:** Given postings with differing posted dates, when the list loads with no sort chosen, then the newest appears first.
- **AC-12.2:** Postings with an unknown posted date are ordered last and are not dropped from the list.

**FR-13 — Vietnamese free-text search**
The system shall provide a free-text search over job titles that correctly handles Vietnamese text.
- **AC-13.1:** Given a posting titled "Chuyên viên Quan hệ Khách hàng", when a user searches "quan hệ khách hàng", then the posting is returned.
- **AC-13.2:** Search is case-insensitive.

**FR-14 — Diacritic-insensitive search**
Search shall match regardless of whether the query includes Vietnamese diacritics.
- **AC-14.1:** Given a posting titled "Chuyên viên Tín dụng", when a user searches "chuyen vien tin dung" (no diacritics), then the posting is returned.
- **AC-14.2:** Given the same posting, when a user searches "Chuyên viên Tín dụng" (with diacritics), then the posting is returned.
- **AC-14.3:** Diacritic-insensitive matching does not cause a query to return postings sharing no meaningful term with it.

**FR-15 — City filter**
The system shall let a user restrict results to one or more cities.
- **AC-15.1:** Given the filter is set to a city, when results render, then every result is for that city.
- **AC-15.2:** The filter offers only cities present in the current job data — no empty options.
- **AC-15.3:** Postings whose city could not be determined are reachable via an explicit "không xác định" (undetermined) option and appear in the unfiltered list. *(Same principle as FR-8: a parsing gap must not hide a job.)*

**FR-16 — Level filter**
The system shall let a user restrict results to one or more levels from the FR-7 taxonomy.
- **AC-16.1:** Given a level filter is applied, when results render, then every result has that inferred level.
- **AC-16.2:** Given no level filter is applied, when results render, then Uncategorized postings are included. (Ties to AC-8.1.)
- **AC-16.3:** Uncategorized is selectable as an explicit filter option.

**FR-17 — Posted-date filter**
The system shall let a user restrict results by how recently a job was posted.
- **AC-17.1:** Given the filter is set to a recency window, when results render, then every result has a posted date within that window.
- **AC-17.2:** Postings with an unknown posted date are excluded from a recency-window filter but remain in the unfiltered list.

**FR-18 — Filters combine**
Multiple filters and a search query applied together shall narrow results conjunctively (AND across filter types).
- **AC-18.1:** Given city = Hà Nội and level = Chuyên viên, when results render, then every result satisfies both.
- **AC-18.2:** Given a combination yields no results, when results render, then an explicit empty-state message in Vietnamese is shown — not a blank page.

### 8.3 Job Detail and Application Hand-off

**FR-19 — Job detail view**
Each posting shall have a detail view showing the original job title, bank, city, inferred level, posted date, and available description content from the source.
- **AC-19.1:** The detail view is reachable at a stable, shareable URL.
- **AC-19.2:** Fields absent from the source render as absent rather than as fabricated or placeholder values.

**FR-20 — Outbound application link**
Each posting shall link to its original posting or application page on the bank's own site.
- **AC-20.1:** Given a user activates the apply action, when the link opens, then the destination is a URL on the bank's own domain.
- **AC-20.2:** The product presents no CV upload, application form, or file input anywhere. (Guard for NG-3.)
- **AC-20.3:** The link's behaviour makes clear the user is leaving for the bank's site.

### 8.4 Accounts

**FR-21 — Anonymous browsing**
Search, filtering, the job list, and job detail views shall be fully usable without an account.
- **AC-21.1:** Given a signed-out visitor, when they search, filter, open a job, and click apply, then no login prompt blocks any step.
- **AC-21.2:** No content is hidden, truncated, or gated behind registration.

**FR-22 — Account creation and sign-in**
The system shall allow a user to create an account and sign in.
- **AC-22.1:** A user can create an account and subsequently sign in to reach their saved jobs and followed banks.
- **AC-22.2:** Sign-in is required only to access saved jobs and followed banks.

**FR-23 — Account features are additive only**
Accounts shall grant no additional job data or search capability.
- **AC-23.1:** A signed-in and a signed-out user issuing the same query receive the same set of postings.

**FR-24 — Save a job**
A signed-in user shall be able to save a posting and later view their saved jobs.
- **AC-24.1:** Given a signed-in user saves a job, when they return in a later session, then the job is in their saved list.
- **AC-24.2:** A user can remove a job from their saved list.

**FR-25 — Follow a bank**
A signed-in user shall be able to follow one or more banks and view a list filtered to their followed banks.
- **AC-25.1:** Given a user follows a bank, when they return in a later session, then the bank is still followed.
- **AC-25.2:** A user can unfollow a bank.
- **AC-25.3:** Following a bank produces no email or notification in v1. (Guard for NG-2.)

**FR-26 — Saved jobs survive source removal**
A saved job shall remain visible in the user's saved list after the posting is no longer present on the bank's career site.
- **AC-26.1:** Given a user saved job J, when J disappears from the source site and the next crawl no longer returns it, then J still appears in the user's saved list.
- **AC-26.2:** When such a job is shown, its state (e.g. no longer available) is indicated to the user rather than silently presenting it as open.
- **AC-26.3:** Opening a no-longer-available saved job does not produce an application link presented as live.

> **Dependency — resolved.** The retention mechanism is settled: soft delete, rows never deleted, expiry only on a genuinely successful crawl (**OQ-5**, §16.2, ADR-0006). FR-26 states the non-negotiable outcome (saves must not break); OQ-5 settles the mechanism that delivers it.

### 8.5 Language

**FR-27 — Vietnamese interface**
All interface text — labels, filters, empty states, errors, dates, and the freshness indicator — shall be in Vietnamese.
- **AC-27.1:** No English-language interface string is visible in any state, including error and empty states.
- **AC-27.2:** Job content is displayed in the source language as published by the bank, unmodified.

### 8.6 Coverage Transparency

**FR-28 — Published coverage boundary**
The site shall state plainly which banks are covered and which are deliberately not covered, with a reason for each exclusion, on a page reachable from the site's navigation.
- **AC-28.1:** Given a visitor opens the coverage page, when it renders, then all 13 covered banks (FR-2) are listed by name.
- **AC-28.2:** Given the same page, when it renders, then every deliberately uncovered bank is listed by name with a short reason in Vietnamese.
- **AC-28.3:** The page is reachable without an account and without a search.
- **AC-28.4:** The coverage list is a static list held in the codebase, not a database-backed or admin-editable feature. *(Cost control: this is a paragraph and a list, not a system.)*
- **AC-28.5:** A deliberately uncovered bank never appears in job results, in the bank filter, or in any crawl alert.

*Rationale: a candidate who knows VIB is hiring and finds nothing concludes the site is broken, not that VIB is excluded. Stating the gap converts a perceived defect into evidence of care — and it is what makes the G-1 claim ("a published subset") honest rather than overstated. Both the technical design and the design guidelines assume this page exists.*

**FR-29 — Per-bank staleness notice**
The system shall show, for each covered bank, when that bank's listings were last refreshed, and shall display a visible notice when a bank has not refreshed for more than two crawl cycles.
- **AC-29.1:** Given a covered bank whose last successful refresh was more than two crawl cycles ago (24 hours at the FR-3 cadence), when any view listing that bank's jobs loads, then a notice identifies that bank as not currently refreshing.
- **AC-29.2:** The notice states *which* bank and *how long* — not merely that "some data may be out of date".
- **AC-29.3:** The notice is visible without an account and without applying any filter.
- **AC-29.4:** A stale bank's existing postings **remain listed and searchable**. Staleness is disclosed, never hidden — the same principle as FR-8's Uncategorized rule: the system's own uncertainty must not make a real job invisible.
- **AC-29.5:** Given a bank's refresh succeeds again, when the next view loads, then the notice for that bank is gone without manual intervention.
- **AC-29.6:** The threshold is a single configurable value, not a per-bank setting.

*Rationale: this is the requirement that makes AC-11.2 honest. Because the global freshness indicator now advances on partially-successful runs (OQ-9, Option B), a single permanently-broken bank would otherwise sit invisibly behind a cheerful "updated 1 hour ago". FR-29 is where that failure surfaces to the user. It is a numbered requirement rather than a resolved Open Question precisely because it can be quietly dropped under build pressure, and dropping it silently converts Option B from honest into misleading — see the coupling note at FR-11 and risk R-7.*

---

## 9. Non-Functional Requirements

| ID | Category | Requirement | Verification |
|---|---|---|---|
| NFR-1 | Performance | Search and filter results render within 2 seconds on a 4G connection, measured from user action to results painted | Timed on a throttled 4G profile with a representative dataset |
| NFR-2 | Performance | Initial load of the main list view completes within 3 seconds on 4G | Same |
| NFR-3 | Performance | No user-facing request triggers a crawl of any bank site (see AC-1.3) | Code review + network inspection |
| NFR-4 | Availability | The website remains available and serves the last successfully crawled data even when a crawl run fails entirely | Simulated crawl failure; site still serves data with a correct FR-11 indicator |
| NFR-5 | Data integrity | Displayed job data is never fabricated or inferred beyond the explicitly inferred level (FR-7) and normalised city | Spot-check against source postings |
| NFR-6 | Correctness | Vietnamese text is stored and rendered without character corruption end to end (UTF-8 throughout) | Diacritic round-trip test from scrape to render |
| NFR-7 | Cost | Total running cost is 0 VND — free hosting tiers only | Billing review |
| NFR-8 | Operability | A single maintainer can add a new bank scraper without changing the website, and diagnose a failure from the run log alone | Add-a-bank dry run |
| NFR-9 | Responsiveness | Usable on mobile viewports from **320px** wide upward, with no two-dimensional (horizontal) scrolling on the list and detail views. *Changed from 360px in v0.2 to remove an internal contradiction: NFR-10 commits to WCAG 2.1 AA, whose success criterion 1.4.10 (Reflow) mandates no two-dimensional scrolling at 320 CSS px. The accessibility bar was already stricter than the stated number. 360px remains a sensible design baseline; 320px is the floor that must not break.* | Manual test at 320px and 360px |
| NFR-10 | Accessibility | Semantic HTML, keyboard-operable search/filter/links, and text contrast meeting WCAG 2.1 AA | Automated audit + keyboard pass |
| NFR-11 | Security | User credentials are never stored in plaintext; account data is accessible only to its owner | Review of auth handling |
| NFR-12 | Privacy | The product collects no CVs and no documents; personal data is limited to what accounts require | Review against NG-3 |
| NFR-13 | Legal / ToS | Crawling is limited to publicly posted listings, attributes each posting to its source bank, and links back to the original posting rather than replacing it (see §12) | Review of §12 posture |
| NFR-14 | Observability | Every crawl run is logged with per-bank outcomes and retained long enough to spot a scraper degrading over time (recommended: ≥ 30 days) | Log inspection |
| NFR-15 | SEO | Job detail pages are individually addressable and server-rendered so they can be indexed | Crawlability check |

---

## 10. User Flows and UX Considerations

### Flow A — Anonymous search (primary flow)

```
1. Visitor lands on home / list view
   → sees aggregated list (newest first) + "Cập nhật X giờ trước"
2. Enters Vietnamese search term (with or without diacritics)  [FR-13, FR-14]
3. Applies filters: city / level / posted date                 [FR-15..FR-18]
   → results narrow; empty combination shows an explicit empty state
4. Opens a job                                                 [FR-19]
   → detail view: original title, bank, city, inferred level, posted date, description
5. Clicks apply                                                [FR-20]
   → leaves for the bank's own application page
```

**Key states to design:** loading, populated, empty-filter-combination, search-no-results, stale-data (last successful crawl > 24h ago), crawl-partially-failed (some banks missing), per-bank stale notice (OQ-7), and the coverage page's presentation of deliberately uncovered banks (FR-28) — which should read as a plain, non-apologetic statement of scope, not an apology or an error.

### Flow B — Save and follow

```
1. Signed-out user opens a job, taps save
   → prompted to sign in / create account  [FR-22]
2. After auth, the save completes and the user returns to where they were
3. Later session: user opens saved jobs    [FR-24]
   → sees saved jobs, including any that are no longer available, clearly marked  [FR-26]
4. User follows banks from a bank page or filter  [FR-25]
   → can view a list scoped to followed banks
```

### Flow C — Crawl cycle (system flow, no user)

```
Every 12 hours:
  for each of 13 covered banks:
      fetch listings (headless browser where required)  [FR-3]
      rate-limited, identified UA, robots.txt respected [FR-4]
      parse → normalise city → infer level             [FR-7, FR-8]
      write to database
      record outcome: success(n) | zero-jobs | failure  [FR-5]
  if any bank is zero-jobs or failure → notify maintainer [FR-6]
  update the "last updated" timestamp behind the freshness indicator [FR-11]
      ◄── advanced by any run in which at least one bank succeeded,
          fully or partially (AC-11.2, OQ-9 Option B)
  flag any bank not refreshed for more than 2 cycles              [FR-29]
```

### UX principles

| Principle | Implication |
|---|---|
| **Never hide a job through a system guess** | Uncategorized level and undetermined city must remain visible in unfiltered views (FR-8, FR-15) |
| **Freshness is a trust feature, not decoration** | The updated-X-ago indicator is prominent, not a footnote (FR-11) |
| **Be honest about inference** | Inferred level is visibly labelled as inferred (FR-9) |
| **State the boundary rather than hide it** | A user who cannot find a bank must be able to learn whether it is uncovered or simply not hiring (FR-28). A stated limit reads as care; a silent hole reads as a broken site |
| **The bank is the destination** | The product is a directory; the hand-off to the bank's site is explicit and unambiguous (FR-20) |
| **Vietnamese-first** | Interface language, search behaviour, and date formatting all assume a Vietnamese user (FR-27) |

---

## 11. Data and Integration Requirements

### Core entities (conceptual)

> The concrete field list (**OQ-3**) and de-duplication strategy (**OQ-4**) are **now resolved** — see §16.2 and ADR-0006. What follows is the conceptual minimum implied by the functional requirements; the technical design holds the authoritative schema.

| Entity | Purpose | Fields implied by FRs |
|---|---|---|
| **Bank** | The 13 covered employers | Name, career-site URL, scraper identifier, rendering type (static / JS) |
| **Coverage list** | The published boundary (FR-28) | Covered bank names; deliberately uncovered bank names + reason. **Static, in the codebase — not a database table** (AC-28.4), so an uncovered bank cannot accidentally be crawled, counted, or alerted on |
| **Job** | A posting | Source URL (FR-20), original title (FR-19), bank reference (FR-10), city (FR-15), inferred level (FR-7/FR-8), posted date (FR-12/FR-17), description content (FR-19), first-seen and last-seen timestamps (FR-26, OQ-5) |
| **CrawlRun** | One scheduled execution | Start time, end time, overall status, last-successful-completion timestamp (FR-11) |
| **CrawlResult** | Per-bank outcome within a run | Bank reference, status (`success` / `zero-jobs` / `failure`), job count, error detail (FR-5, FR-6) |
| **User** | Account holder | Credentials/identity, created date (FR-22) |
| **SavedJob** | User ↔ Job | User reference, job reference, saved timestamp (FR-24, FR-26) |
| **FollowedBank** | User ↔ Bank | User reference, bank reference (FR-25) |

### External dependencies

| Dependency | Role | Risk if it changes |
|---|---|---|
| 13 bank career websites | The only data source; no API, no feed | Any redesign breaks that bank's scraper (R-1) |
| Scheduled job runner | Executes the 12-hourly crawl outside the web host | Crawl stops; site serves increasingly stale data (NFR-4 keeps the site up) |
| Managed database (free tier) | Shared store between crawler and website | Free-tier limits (row count, connections, idle suspension) must be checked |
| Web host (free tier) | Serves the website | Function duration and cron limits — see §12 |
| Notification channel for FR-6 | Maintainer alerting | Silent scraper failure (the exact failure mode R-1 warns about) |

**No integration with any bank is contractual or API-based.** There is no partnership, no feed, and no employer relationship. Every source is a public web page.

---

## 12. Technical Constraints

Recorded as constraints, not as prescribed implementation. Where a choice is named it is a *recommendation* carried from discovery, not a requirement.

### C-1 — Free tiers only, no budget

Total spend must be 0 VND (NFR-7). Any design that requires a paid tier is out of scope.

### C-2 — The website fits the free web host; the crawler does not

The intent is to host the website on Vercel's free (Hobby) tier. **The crawler cannot run there:** Hobby-plan cron frequency limits and serverless function duration limits are both too tight for scraping 13 sites with a headless browser.

> **These platform limits change over time. Verify the then-current Vercel Hobby cron frequency and function-duration limits at build time rather than relying on any number quoted in this document — no specific numbers are asserted here on purpose.**

### C-3 — Recommended split (isolates the fragile part)

| Component | Recommended home | Why |
|---|---|---|
| Crawler | GitHub Actions | Free, arbitrary schedule, long-running jobs permitted, headless browsers work |
| Database | Supabase or Neon free tier | Managed, free tier, shared between crawler and site |
| Website | Vercel, reading from that database | Fits the free tier once it only reads a database |

The architectural point that matters more than the specific vendors: **the fragile scraping layer must be isolated from the part users touch**, so a broken scraper degrades data freshness rather than taking the website down (NFR-4).

### C-4 — JavaScript-rendered sources

Some bank career sites render listings client-side and require a headless browser (FR-3). This drives the crawler's runtime requirements and is a primary reason it cannot live on the web host's serverless functions.

### C-5 — Solo maintainer, Claude Code as the build tool

The product is built and operated by one person using Claude Code. Every requirement here is scoped to be buildable and maintainable by one person. Anything that requires ongoing manual daily effort is out of scope by construction.

### C-6 — Legal / Terms-of-Service posture on scraping

The product's position, to be stated publicly on the site:

| Element | Position |
|---|---|
| What is collected | Only publicly posted job listings from public career pages. No authentication is bypassed, no non-public area is accessed, no personal data is scraped. |
| Attribution | Every posting is attributed to its source bank and links back to the original posting (FR-20). |
| Substitution | The product directs traffic *to* the banks' own sites; it does not replace them or intercept applications (NG-3). |
| Crawling practice | Low request rate, identifying User-Agent with contact details, `robots.txt` respected (FR-4). |
| Removal | A stated contact route by which a bank can request exclusion, honoured on request. |

> This is a stated posture, not legal advice, and has not been reviewed by a lawyer — see **A-9** and **R-5**.

---

## 13. Scope: In / Out / Future

### In scope — v1

| Area | Included |
|---|---|
| Coverage | **13 named Vietnamese commercial banks** (FR-2). VIB and Agribank deliberately excluded |
| Coverage transparency | Published page stating which banks are covered and which are not, with reasons (FR-28) |
| Collection | Scheduled crawl every 12 hours into own database (FR-1) |
| Freshness | "Updated X hours ago" (FR-11) |
| Browse | Aggregated list, newest first (FR-10, FR-12) |
| Search | Vietnamese free text, diacritic-insensitive (FR-13, FR-14) |
| Filters | City, level, posted date (FR-15 – FR-18) |
| Level | Inferred from title, with Uncategorized fallback (FR-7 – FR-9) |
| Apply | Link out to the bank's own page (FR-19, FR-20) |
| Accounts | Optional; follow banks + save jobs only (FR-21 – FR-26) |
| Language | Vietnamese interface (FR-27) |
| Ops | Per-bank crawl outcomes + maintainer alerting (FR-5, FR-6) |

### Out of scope — v1

All non-goals NG-1 … NG-11 (§3).

### Future candidates (not committed, **not sequenced**)

> **v1 ships before v2 is planned** — owner decision, v0.2. OQ-8 (post-v1 phasing) is withdrawn; see §16.3. The list below is unordered and nothing in it is committed. Do not build for any of it.

| Candidate | Note |
|---|---|
| Email alerts on followed banks | The only identified answer to R-3 (retention). Consciously deferred from v1. |
| Expand coverage toward ~50 banks | The stated eventual coverage target. Depth of coverage is the product (R-2). |
| Re-attempt VIB or Agribank *if the underlying obstacle changes* — e.g. a feed, an API, or written permission | **Not** a re-attempt by evasion or by inventing a record type. Those routes are closed (FR-2, ADR-0005). |
| Additional filters (function/department, employment type) | Depends on field availability — tied to OQ-3 |
| English interface | Currently NG-4 |
| Saved-search / keyword alerts | Extension of email alerts |

---

## 14. Assumptions

Every item here is an unconfirmed judgement made to keep this document complete. Each should be validated; none is a decision the product owner has made.

| ID | Assumption | Impact if wrong |
|---|---|---|
| A-1 | All 13 covered banks publish job listings on a publicly accessible page reachable without login | A bank requiring auth cannot be covered; coverage claim (G-1) weakens |
| A-2 | Bank career pages expose enough structure to reliably extract title, city, and posted date | Missing fields degrade filters FR-15 and FR-17; more postings fall into "undetermined" buckets |
| A-3 | A meaningful share of postings carry a posted/publish date | Default sort (FR-12) and the posted-date filter (FR-17) lose value |
| A-4 | Job titles are consistent enough that keyword-based level inference is right for a clear majority | Level filter becomes noise; Uncategorized bucket dominates. FR-8 keeps this from hiding jobs, but the filter's value drops |
| A-5 | City is expressed in a normalisable form across banks (a manageable set of names/variants) | City filter fragments into near-duplicate options |
| A-6 | Total live posting volume across 13 banks fits comfortably inside a free-tier database | Forces pruning or a paid tier, violating C-1 |
| A-7 | A 12-hour cycle for 13 banks fits inside free scheduled-runner quotas | Crawl frequency must drop; freshness (G-2) degrades |
| A-8 | No bank objects to being aggregated, given the posture in C-6 | An exclusion request removes a bank from coverage |
| A-9 | The C-6 posture is legally adequate in Vietnam for publicly posted listings | Unassessed legal exposure — no lawyer has reviewed this (R-5) |
| A-10 | Users accept a link-out application flow rather than expecting to apply in-product | Perceived as incomplete; but NG-3 is settled and would not change |
| A-11 | Vietnamese-only is acceptable to the whole target audience | Excludes some candidates; NG-4 is settled for v1 |
| ~~A-12~~ | **FALSIFIED — no longer an assumption.** See the finding below the table. | — |
| A-13 | Accounts can be built on a free-tier managed auth service within C-1 | Account features (FR-22 – FR-26) need rescoping |
| A-14 | Personas P1–P3 are representative; they are illustrative only and were not user-researched | Filter priorities may be wrong |
| A-15 | "Covered" is defined by the named list in FR-2, not recomputed from any ranking of bank size | None — the list in FR-2 is authoritative and settled |

### 14.1 Findings — no longer assumptions

**F-A12 — Some bank sites do employ anti-bot measures that defeat a politely rate-limited, identified crawler.** *(Was assumption A-12; falsified during reconnaissance, 2026-08-13.)*

VIB's careers site returns a WAF bot-protection challenge. It is not merely hard to parse — it actively refuses automated clients. The assumption that polite crawling is always sufficient is therefore false, and this is now a recorded fact about the environment rather than an open risk.

**Standing position, settled:**

> **Banks that actively block crawlers are excluded, not evaded.**

- No anti-bot evasion is built, and none is added later — no proxies or IP rotation, no CAPTCHA solving, no fingerprint masking or stealth plugins, no User-Agent spoofing or randomisation.
- The identifying User-Agent required by AC-4.1 is what makes the C-6 posture true rather than merely stated. Evasion would make the product's own published statement a lie, and that statement is its entire legal position (R-5).
- A currently-covered bank that starts blocking is moved to the uncovered list and stated publicly (FR-28) — not escalated against.
- A bank offering a feed, an API, or written permission is a different and welcome decision. That is the only route by which an excluded bank returns.

**What this costs, stated honestly:** if further banks adopt WAFs, coverage erodes with no engineering answer available inside these constraints. That is a live strategic risk to R-2 — see R-12. The only response available is to expand among crawlable banks faster than blocked ones accumulate.

---

## 15. Risks and Mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R-1** | **Scraper fragility — the core engineering risk.** Any site redesign silently breaks a scraper, and a scraper returning nothing is indistinguishable from a bank with no openings. **A scraper returning a *fraction* of reality is worse still:** 8 of 130 postings after a paginator breaks passes any zero-check, records as `success`, and expires 122 live jobs with no alert | **High** | **High** | Per-bank outcome recording and maintainer alerting on `zero-jobs` as well as `failure` (FR-5, FR-6). Never treat zero as normal without a notification (AC-6.3). Isolate scrapers so one failure does not abort the run (AC-5.1). **Plus the volume-drop guard added in technical design (OQ-5, ADR-0006): a bank returning under 50% of its last successful count is marked `suspect` — its jobs are still refreshed, but nothing is expired and the maintainer is alerted.** This converts the partial-return failure mode from silent data loss into a named, diagnosable event |
| **R-2** | **Coverage is the product.** Incomplete or stale listings mean users check once and never return | **Medium** | **High** | Depth of coverage beats breadth of features — prioritise all 13 covered banks working reliably over any new feature. Track coverage as a headline metric (§5). Publish the boundary so a gap reads as a stated limit rather than a defect (FR-28) |
| **R-3** | **Retention unaddressed in v1.** With no alerting, nothing pulls users back to the site | **High** | **Medium** | Consciously accepted for v1. Follow-bank and save-job (FR-24, FR-25) build the data that makes alerts possible. Email alerts on followed banks are the leading v2 candidate (§13) |
| **R-4** | JavaScript-rendered bank sites require a headless browser, raising crawler cost and fragility | **High** | **Medium** | Crawler hosted where long runs and headless browsers are permitted (C-2, C-3); crawler isolated from the website (NFR-4) |
| **R-5** | Legal / ToS exposure from scraping, or a bank objecting | Low | **High** | Explicit public posture (C-6): public listings only, attributed, linking back, polite crawling, and an honoured removal route. Not lawyer-reviewed (A-9) |
| **R-6** | Level inference mislabels jobs, eroding trust in the filter | **High** | Low–Medium | Uncategorized fallback guarantees no job is hidden (FR-8). UI presents level as inferred, not authoritative (FR-9) |
| **R-7** | **Single-maintainer decay.** If the maintainer stops updating scrapers, the product degrades quietly rather than failing loudly — a half-broken aggregator is worse than an obviously dead one | **Medium** | **High** | FR-6 alerting makes decay visible to the maintainer. A user-visible signal when a bank's data has not refreshed in N cycles is recommended under **OQ-7** — and is what makes OQ-9's Option B honest. Keep per-bank scrapers small and independent (NFR-8) |
| **R-8** | Free-tier limits (database rows, function duration, cron frequency, idle suspension) change or are exceeded | Medium | Medium | Verify current limits at build time rather than trusting documented numbers (C-2). Architecture keeps the site read-only against the database, the cheapest possible shape |
| **R-9** | Bank IP-blocks the crawler despite polite practice | Low | **High** | Rate limiting, identified UA, robots.txt (FR-4). This risk is the primary reason live on-demand scraping was rejected (§4) |
| **R-10** | Duplicate postings (one role listed per branch, or re-posted repeatedly) clutter results | **Medium** | Low–Medium | **Mitigated.** Identity is a platform-native id where one exists, else the canonicalised source URL; multi-branch roles collapse into one entry with several cities (OQ-4, ADR-0006). Residual: a role re-posted under a new URL still counts twice — accepted, visible but not harmful |
| **R-11** | **Visible coverage gap from the deliberate exclusions.** Agribank is state-owned and among the largest banks in Vietnam; VIB is a significant private bank. A candidate hunting the whole sector will notice their absence | **High** | **Medium** | Accepted as the price of the positions in FR-2 and F-A12. Mitigated *only* by stating it plainly (FR-28) and by wording the G-1 claim as a published subset rather than the whole sector. A stated limit is survivable; a silent hole is not |
| **R-12** | **Coverage erosion by WAF adoption.** If further banks deploy bot protection, they must be excluded, and there is no engineering answer available inside the no-evasion position and C-1 | Low–Medium | **High** | None available inside current constraints — this is an accepted, unmitigated strategic risk to R-2. The only response is to expand among crawlable banks faster than blocked ones accumulate, and to pair the C-6 removal contact with an invitation to supply a feed instead (F-A12) |

---

## 16. Open Questions

**These are the decisions the product owner has not yet made.** Each has a recommended default so work is not blocked, but none is settled — a default becomes a decision only when confirmed.

| ID | Question | Recommended default | Owner | Blocks |
|---|---|---|---|---|
| **OQ-1** | What is the product's name and domain? | Decide before launch; not blocking build. Any short, Vietnamese-legible name; "BankJobs VN" is a placeholder only | Ngo Hoang Dat | Launch (G-5) |
| **OQ-2** | **What does "working" look like for v1 — which success metrics and targets?** | Adopt §5 as written, but treat only three as the real bar: (1) **13 of 13 covered banks** returning jobs on the latest crawl, (2) crawl success rate ≥ 95% over 30 days, (3) ≥ 25% of sessions produce an outbound click to a bank. Everything else is diagnostic. Rationale: for a solo launch, *does it have the jobs* and *do people click through* are the only signals that matter. **Note the restatement:** the coverage metric is now scoped to the published subset (FR-2, FR-28) rather than implying every commercial bank in Vietnam | Ngo Hoang Dat | §5 becoming authoritative |

*OQ-7 and OQ-9 were open in v0.2 and were **decided by the owner in v0.3**. They now sit in §16.2 with their reasoning; §16.1 below retains the full trade-off that OQ-9 was decided on.*

### 16.1 OQ-9 in full — the freshness conflict

**AC-11.2 as currently written** derives the indicator from the last **fully successful** crawl. Read literally, one permanently-broken bank out of 13 makes the site announce *"updated 3 days ago"* while twelve banks are an hour fresh.

| | **Option A — keep AC-11.2 literally** | **Option B — count partially-successful runs** *(technical design's approach)* |
|---|---|---|
| Indicator derives from | The last run where **every** bank succeeded | The last run that **actually refreshed data** — fully or partially successful |
| One bank broken for days | "Updated 3 days ago" | "Updated 1 hour ago" + a per-bank stale notice on the affected bank (OQ-7) |
| Honest? | Technically true, **materially misleading** — it understates the freshness of 12 banks and trains users to distrust a number that is usually wrong | True at the level it is stated, with the per-bank exception surfaced where it belongs |
| Risk | **Corrosive to G-2** (trustworthy freshness). A number that cries wolf gets ignored, and the indicator is the product's main trust signal | The global number can mask a single stale bank **if OQ-7's per-bank notice is not built.** Option B is only honest as a pair |
| Cost to change later | One-line change either way | One-line change either way |

**Recommendation: Option B, conditional on OQ-7 being built.** The honesty belongs at the level where the staleness actually is — per bank — rather than being smeared across a global number that is then wrong for everyone. But Option B without OQ-7's per-bank notice is worse than Option A, because it hides the problem entirely.

> **Awaiting the owner's decision. Not settled.** AC-11.2 is unchanged in this version and remains the requirement of record until it is ruled on. The technical design's deviation is a flagged deviation, not an approved one.

### 16.2 Resolved since v0.1

Recorded rather than deleted, so the reasoning survives. Each was an Open Question in v0.1 and has since been decided in technical design; the ADR holds the alternatives that lost.

| ID | Question | Resolution | Reference |
|---|---|---|---|
| **OQ-3** | What exactly does a job record contain? | **Resolved.** Source URL, original (never rewritten) title, bank, cities, inferred level, posted date, description, first-seen, last-seen, status. Optional fields are captured only where a bank exposes them and are not used as filters until most banks provide them | ADR-0006; TECHNICAL_DESIGN §4.2 |
| **OQ-4** | How are duplicates handled? | **Resolved.** Identity is `(bank, dedupe_key)`, where the key is a platform-native job id where one exists and otherwise the canonicalised source URL. Multi-branch roles collapse into one entry carrying several cities. A role re-posted under a new id/URL counts as new — accepted, no fuzzy matching in v1 | ADR-0006 |
| **OQ-5** | How are expired or removed postings handled? | **Resolved, and strengthened.** Soft delete: rows are never deleted; `active → expired` with a timestamp. Expired jobs leave search but stay resolvable and stay attached to saved jobs (FR-26). **Expiry runs for a bank only when that bank's outcome is `success`.** See the strengthened guard below | ADR-0006 |
| **OQ-6** | What is the maintainer alerting channel? | **Resolved.** The scheduled runner's own failure notification, fired by a non-zero exit **after** all data is committed, plus a per-bank run summary grouped by platform. No new service | TECHNICAL_DESIGN §8.3 |
| **OQ-7** | Should users see when a specific bank's data is stale or its scraper is broken? | **Resolved by owner decision (v0.3): yes — and promoted out of the open table into a numbered requirement, FR-29.** A per-bank "last updated" plus a visible notice past two crawl cycles. Honest degradation beats a silently incomplete list (mitigates R-7). Promoted rather than left resolved-here because OQ-9's Option B depends on it, and an Open Question can be quietly dropped during a build in a way a requirement cannot | **FR-29**; R-7; OQ-9 |
| **OQ-9** | **What exactly should the freshness indicator count as "updated"?** *(Raised in v0.2 by the technical design, which deliberately deviated from AC-11.2 and asked for a ruling.)* | **Resolved by owner decision (v0.3): Option B** — the indicator advances on any run that actually refreshed data, fully or partially successful (`degraded`); a run in which no bank succeeded does not advance it. **AC-11.2 was amended to match**, so the requirement of record and the technical design now agree and the deviation is approved. Conditional on FR-29 shipping — see the coupling note at FR-11. §16.1 holds the full trade-off | **AC-11.2**, FR-11, FR-29, G-2 |

#### The OQ-5 guard, as strengthened during technical design

The rule agreed in v0.1 blocked expiry when a bank returned **zero jobs or failed**. Technical design found that insufficient, and the gap matters:

> A scraper returning a *small fraction* of reality — 8 of 130 postings after pagination breaks — **passes the zero-check, records as `success`, and expires 122 live postings with no alert.** The count is non-zero, so nothing fires. The damage is visible only to a user who notices the site got thin.

The strengthened rule adds a volume check: a bank returning **under 50% of its last successful count** is marked `suspect` — its jobs are still upserted so data stays fresh, **nothing is expired**, and the maintainer is alerted. The next genuinely successful run reconciles whatever is really gone.

| Outcome | Expire? | Alert? |
|---|---|---|
| `success` — completed, jobs found, volume check passed | **Yes** | No |
| `zero-jobs` — completed, nothing found | **No** | Yes |
| `failure` — threw, or HTTP/parse error | **No** | Yes |
| `suspect` — found jobs, but under 50% of last successful count | **No** | Yes |

The 50% ratio is a starting value, armed only when the previous count was large enough to be meaningful; it is tunable per bank once real variance data exists. The deliberate asymmetry: **prefer a false alert to silent data loss.**

### 16.3 Withdrawn

| ID | Question | Status |
|---|---|---|
| **OQ-8** | What is the release phasing beyond v1? | **Withdrawn by owner decision (v0.2) — v1 ships before v2 is planned.** The reasoning is preserved rather than deleted: email alerts on followed banks remain the only identified answer to R-3 (retention), and expanding coverage remains the answer to R-2. Neither is committed, neither is sequenced, and nothing in v1 should be built in anticipation of either. Revisit after P5, with real data |

---

## 17. Rollout and Release Plan

Scoped for one person on free tiers. Each phase has an exit gate; do not start the next phase until the gate is met.

| Phase | Content | Exit gate |
|---|---|---|
| **P0 — Spike** | Build scrapers for 2 banks: one static, one JavaScript-rendered. Write to a free-tier database on a schedule | Both return real jobs on two consecutive scheduled runs without manual intervention |
| **P1 — Data foundation** | Remaining 11 scrapers. Per-bank outcome recording and maintainer alerting (FR-5, FR-6). Level inference with Uncategorized fallback (FR-7, FR-8) | **13/13** covered banks return jobs on the same run; a deliberately broken scraper produces an alert within one cycle **and expires nothing** |
| **P2 — Public site** | List, Vietnamese diacritic-insensitive search, three filters, job detail, outbound apply link, freshness indicator, coverage page (FR-10 – FR-20, FR-27, FR-28) | Flow A completes end to end at **320px** (NFR-9) within the NFR-1/NFR-2 budgets; the coverage page names all 13 covered and both uncovered banks |
| **P3 — Accounts** | Sign-in, save jobs, follow banks, saved-jobs survival behaviour (FR-21 – FR-26) | Flow B completes across two separate sessions; a saved job survives its source posting disappearing |
| **P4 — Launch** | Public URL, public statement of the C-6 posture including the removal contact, basic analytics for the §5 metrics | Site publicly reachable and serving non-owner traffic (G-5) |
| **P5 — Observe** | 30 days of operation; watch crawl success rate and outbound click-through | OQ-2 metrics measurable and met, or explicitly revised. Tune the OQ-5 volume-drop ratio against real per-bank variance. *(Post-v1 phasing is deliberately not planned here — OQ-8 is withdrawn, §16.3.)* |

**Release mechanics**

- No feature flags in v1 — the surface is small and there is one maintainer.
- No data migration — greenfield.
- Account features (P3) can ship after P4 if P2 is launch-ready sooner; the site is fully useful without accounts (FR-21).
- **Rollback posture:** the website is read-only against the database. A bad crawl is corrected by the next cycle, and OQ-5's guards — never expire a bank's jobs on a failed, empty, **or suspiciously thin** crawl — are what prevent a bad run from destroying data. There is no rollback for expired data other than not expiring it wrongly in the first place.

---

## 18. Requirements Traceability

| Goal | Requirements | Metric (proposed, pending OQ-2) |
|---|---|---|
| G-1 — everything in one place, with a stated boundary | FR-1, FR-2, FR-3, FR-10, FR-28 | Covered banks returning jobs: 13/13 |
| G-2 — trustworthy freshness | FR-1, FR-5, FR-6, FR-11, NFR-4 | Crawl success rate ≥ 95%; staleness ≤ 24h |
| G-3 — find relevant jobs | FR-12 – FR-18, FR-7 – FR-9, NFR-1 | Outbound click-through ≥ 25% of sessions |
| G-4 — keep track across sessions | FR-21 – FR-26 | Returning visitors ≥ 15% |
| G-5 — genuinely launched and operable solo | NFR-7, NFR-8, C-1 – C-5, §17 | Publicly reachable, serving real traffic |

---

## 19. Document Conventions

- **FR-n** functional requirement · **NFR-n** non-functional · **AC-n.m** acceptance criterion · **A-n** assumption · **F-An** a former assumption now established as fact · **R-n** risk · **OQ-n** open question · **C-n** constraint · **G-n** goal · **NG-n** non-goal · **US-n** user story.
- **Identifiers are append-only and never reused.** A new requirement takes the next free number rather than renumbering existing ones, so that references from the technical design, ADRs, and design guidelines stay valid. This is why FR-28 sits at the end rather than beside the coverage requirements it belongs with.
- **Resolved and withdrawn Open Questions are retained, not deleted** (§16.2, §16.3). A decision without its reasoning is re-litigated within months.
- Requirements state *what* and *why*. Implementation choices appear only in §12, and only where a constraint forces them — and there they are labelled recommendations, not requirements.
- Anything in **Assumptions** or **Open Questions** is **not** an agreed decision. If it is not stated as a requirement here, it is not agreed.
