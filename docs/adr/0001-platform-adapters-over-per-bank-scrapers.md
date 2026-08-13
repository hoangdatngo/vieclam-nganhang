# ADR-0001 — Platform adapters with per-bank config, not 15 bespoke scrapers

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-08-13 |
| **Decides** | PRD FR-2, FR-3, NFR-8; mitigates R-1 |
| **Supersedes** | — |

## Context

The PRD (R-1) frames scraper fragility as *the* core engineering risk and implicitly assumes
one scraper per bank: "Each bank site needs its own scraper."

Reconnaissance of all 15 originally listed banks falsifies that assumption. Vietnamese banks do
not each hand-roll a career site. They cluster onto a small number of shared HR platforms. Two
banks were subsequently excluded from v1 by product decision (VIB — WAF, see ADR-0005; Agribank —
announcements, not postings), leaving **13 covered banks**:

| Platform | Banks | Static HTML? |
|---|---|---|
| SAP SuccessFactors | Vietcombank, Techcombank, Sacombank, VPBank | Yes |
| Talent.vn | ACB (`acbjobs.com.vn`), SHB? (`shb.talent.vn`) | ACB yes |
| Shared VN careers platform (`tuyendung.<bank>.com.vn/tim-viec-lam/...`) | MB, SHB? | No — JS shell |
| Oracle Taleo | MSB (`jobs.msb.com.vn`, `msb.taleo.net`) | Yes |
| Bespoke JS shells | VietinBank, BIDV, TPBank, HDBank | No |
| Unresolved | LPBank (`jobs.lpbank.com.vn` → 301 → `tuyendung.lpbank.com.vn`) | Unknown |

Six banks are confirmed extractable from static HTML with no browser (Vietcombank, Techcombank,
Sacombank, VPBank, ACB, MSB) and account for 261+ live postings on their own.

Within the SuccessFactors cluster the URL and markup shapes are identical across tenants:
`/search/?locale=vi_VN` server-renders the listing with pagination, and job links follow
`/job/<url-encoded-title>/<numeric-id>/`. Vietcombank's listing HTML carried title, location
("Hà Nội, VN") and posted date ("12 thg 8, 2026") directly.

SHB appears in two rows above. Which platform actually serves its jobs is unresolved and is a
P0 task.

## Decision

**Build one adapter per *platform*, parameterised by a per-bank config object. Do not build one
scraper per bank.**

Concretely:

- An adapter is a module exporting `discover(config, ctx): Promise<RawListing[]>` and optionally
  `hydrate(listing, config, ctx): Promise<RawDetail>`.
- A bank config is a TypeScript object in `crawler/banks/<slug>.ts` naming the adapter, the base
  URL, pagination parameters, and any selector overrides.
- Planned adapters: `successfactors`, `talent-vn`, `taleo`, `vn-careers-shared`, `json-api`
  (generic: endpoint + field mapping), `html-list` (generic: CSS selectors), `browser`
  (Playwright, last resort — see ADR-0003).
- **Adapters return raw strings only.** All normalisation (NFC, city mapping, level inference,
  date parsing, dedupe key) happens in one shared pipeline downstream. An adapter that normalises
  is a bug.
- Bank configs live in the repository, not in the database. They are code, they change together
  with the parser that reads them, and they must be reviewable in a diff.
- Every adapter has fixture-based tests: a saved HTML/JSON snapshot per bank in
  `crawler/fixtures/`, asserted against expected parsed output. Re-recording a fixture is the
  first step of every "bank X broke" investigation.

## Alternatives considered

| Alternative | Why it lost |
|---|---|
| **15 bespoke scrapers** (the PRD's implicit assumption) | 15 independent things to understand and repair. Four banks share byte-identical SuccessFactors markup; writing four parsers for it is four times the maintenance for zero benefit. Fails NFR-8 (solo maintainability) at the 50-bank target. |
| **One fully generic config-driven scraper** (selectors entirely in config, no code per platform) | Pagination, locale handling, JSON-LD extraction and JS execution differ structurally between platforms, not just by selector. A config language expressive enough to cover them becomes a programming language with worse tooling and no type checking. |
| **Configs in the database, edited via a dashboard** | Config drifts from parser code with no atomic change and no review. Requires an admin UI (a whole component) for a solo maintainer who already has an editor and git. |
| **A third-party scraping API / SaaS** | Every credible option is paid at this volume. Violates C-1 (0 VND). |

## Consequences

**Good**

- 4–6 adapters cover all 13 banks. Adding a 14th bank on a known platform is a config file, not a
  scraper — this is what makes the ~50-bank target (R-2) reachable at all.
- A SuccessFactors markup change is fixed **once** and four banks recover simultaneously.
- Shared normalisation means level inference and city mapping are provably identical across banks,
  and are unit-testable without any network access.
- Fixtures make "did my change break another bank?" a test run rather than a live crawl.

**Bad — state this honestly**

- **Correlated failure.** One SAP change takes out four banks at once. The blast radius of a single
  upstream change is now larger than with bespoke scrapers.
- Mitigation is that repair is correlated too: one fix, four recoveries. Net expected downtime for
  a solo maintainer is lower, but the *variance* is higher — a bad day is worse.
- Per-bank outcome recording (FR-5) remains mandatory and is not weakened by this ADR. In addition,
  the crawl summary groups outcomes **by platform** so that "4 banks failed" is immediately legible
  as "SuccessFactors broke" rather than four unrelated incidents.
- A config-driven adapter is more abstract than a straight-line scraper. Keep configs declarative
  and resist adding conditional logic to them; when a bank needs behaviour its platform adapter
  cannot express, give it the `html-list` or `json-api` adapter rather than branching inside a
  platform adapter.

## Revisit if

- A platform adapter accumulates more than ~2 bank-specific conditional branches. That is the
  signal the bank has diverged and should move to a generic adapter or its own.
- Coverage expansion past ~25 banks reveals a long tail of genuinely unique sites, at which point
  the generic `html-list` adapter carries most of the weight and platform adapters become the
  minority case.
