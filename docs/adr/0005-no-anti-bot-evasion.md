# ADR-0005 — No anti-bot evasion; blocked and unstructured sources are declared uncovered

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-08-13 |
| **Decides** | PRD FR-2 (revised to 13 banks), FR-4, C-6, A-12, R-9; affects OQ-2 |

## Context

PRD assumption A-12 states that "bank sites do not employ anti-bot measures that defeat a politely
rate-limited, identified crawler." Reconnaissance falsified it: `careers.vib.com.vn` returns a
"Challenge Validation" interstitial characteristic of an Imperva-style WAF. VIB is not merely hard
to parse — it is actively refusing automated clients.

Separately, `agribank.com.vn/vn/tuyen-dung` publishes news-style recruitment *announcements* (exam
schedules, results, notices) rather than structured per-role postings. There is no Job entity to
extract without inventing one.

These are different problems with the same shape: a source that the product's data model and
crawling posture cannot honestly serve.

Evading the WAF is technically feasible. Residential proxies, headful browser fingerprint spoofing,
CAPTCHA-solving services and stealth plugins all exist. The question is whether to.

## Decision

**Do not build, and do not later add, any anti-bot evasion. A bank that actively blocks automated
access is recorded as deliberately uncovered.**

Consequent product decisions (made by the product owner, recorded here so the reasoning survives):

- **VIB is excluded from v1** — deliberately, not through inability.
- **Agribank is excluded from v1** — no structured job entity exists to extract.
- **The covered bank list for v1 is 13 banks**: Vietcombank, BIDV, VietinBank, Techcombank, MB,
  VPBank, ACB, Sacombank, SHB, HDBank, TPBank, MSB, LPBank.

Consequent engineering rules:

1. The crawler sends one honest, identifying User-Agent naming the project and a contact URL
   (FR-4 AC-4.1). It is never randomised, never spoofed to imitate a consumer browser, and never
   rotated. This is not negotiable — an identifying UA is what makes the C-6 posture true rather
   than merely stated.
2. No proxies, no IP rotation, no CAPTCHA solving, no `playwright-stealth` or equivalent
   fingerprint masking. Where the `browser` adapter is used (for JavaScript-rendered sites), it is
   used to *render a page the site serves willingly*, not to look like something it is not.
3. `robots.txt` is fetched once per domain per run and honoured for every path (AC-4.3). A
   disallowed path is not fetched, and the bank's outcome for that run is `blocked`, not `failure`.
4. **Deliberately uncovered banks are held in a static list in the repository**
   (`lib/coverage.ts`), not in the database, with a Vietnamese-language reason string. They are
   surfaced honestly in the UI. They are never crawled, never counted as covered, and — critically
   — **never raise a crawl alert**, because a permanent, expected condition that pages the
   maintainer every 12 hours trains the maintainer to ignore alerts, which is the exact failure R-7
   describes.
5. If a currently-covered bank starts returning WAF challenges, the correct response is to move it
   to the uncovered list and say so publicly — not to escalate.

## Alternatives considered

| Alternative | Why it lost |
|---|---|
| **Build evasion (stealth browser, residential proxies, CAPTCHA solving)** | Three independent reasons, each sufficient. (a) *Ethical/consistency*: the product publicly states in C-6 that it crawls politely with an identifying UA and honours removal requests. Evading a WAF while publishing that statement makes the statement a lie, and the statement is the product's entire legal posture (R-5). (b) *Maintenance*: WAF evasion is an arms race with a vendor that employs a team to win it, against a solo maintainer who has 13 other scrapers to keep alive. Every WAF rule update is an unscheduled outage. (c) *Cost*: residential proxies and CAPTCHA services are paid. Violates C-1 outright. |
| **Cover VIB manually** — a human pastes listings periodically | Violates C-5 ("anything that requires ongoing manual daily effort is out of scope by construction") and produces data whose freshness cannot be honestly reported. |
| **Model announcement-style sources (Agribank) as a coarser record type** | Considered and dropped by the product owner. It introduces a second record type into every query, filter, list view and detail view in order to serve one bank with data that answers none of the user's questions ("what role, where, what level?"). YAGNI applies with force. |
| **Silently omit VIB and Agribank** | Rejected on honesty grounds and because it damages trust: a user who knows VIB is hiring and does not find it on the site concludes the site is broken, not that VIB is excluded. Stating the gap converts a perceived defect into evidence of care. |

## Consequences

**Good**

- The C-6 posture stays true, which is the cheapest legal risk mitigation available (R-5).
- No arms race, no paid dependency, no fragile stealth machinery.
- Zero permanent alert noise, which keeps FR-6 alerts meaningful.
- Excluding sources the data model cannot serve keeps the job record honest (NFR-5): every row is a
  real, structured posting.

**Bad**

- **A visible coverage gap.** Agribank is state-owned and among the largest banks in Vietnam; VIB is
  a significant private bank. A user hunting the whole sector will notice. This is a real product
  cost, accepted in exchange for the above, and it is mitigated only by stating it plainly.
- **The OQ-2 headline metric must be restated.** "15 of 15 banks returning jobs" becomes
  **"13 of 13 covered banks returning jobs on the latest crawl"**, with "covered" defined as an
  explicit, published subset — not as "every commercial bank in Vietnam". The product owner should
  fold this into OQ-2 when confirming §5.
- If a second or third bank adopts a WAF, coverage erodes with no engineering answer available.
  That is a genuine strategic risk to R-2 ("coverage is the product") with no mitigation inside
  this ADR's constraints. The only honest response is to expand coverage among *crawlable* banks
  faster than blocked ones accumulate.

## Revisit if

- A bank offers a feed, an API, or written permission — that is a different decision entirely and a
  welcome one. The C-6 removal-contact route should be paired with an "if you would rather we used
  a feed, tell us" invitation.
- Never revisit for the purpose of evasion. That is the point of this record.
