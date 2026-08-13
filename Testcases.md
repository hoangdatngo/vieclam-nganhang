# Test Cases

A running log of what has been tested, by whom, against which requirement, and with what result.
Append-only — entries are never edited or removed. Newest at the bottom.

Written by the `test-task` skill (`.claude/skills/test-task/SKILL.md`) at the end of each
implementation task.

---

## 2026-08-13 — Vietnamese text normaliser (`lib/normalize.ts`)

*Backfilled: the code and tests were written before this log existed.*

**Code under test:** `lib/normalize.ts` — `toStorage`, `toSearch`, `toSearchTokens`
**Test file:** `lib/normalize.test.ts`
**Spec:** PRD FR-13, FR-14 (AC-14.1 – AC-14.3) · AC-9.2 · NFR-5 · `docs/adr/0004-diacritic-insensitive-vietnamese-search.md`

### `toSearch` — the search-folding form

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 1 | "Chuyên viên Tín dụng" folds to "chuyen vien tin dung" | AC-14.1 — the exact example in the PRD | pass |
| 2 | "Chuyên viên Quan hệ Khách hàng" folds correctly | AC-14.1 | pass |
| 3 | `đồng` → `dong` | ADR-0004 — `đ` (U+0111) has **no** Unicode canonical decomposition, so NFD + mark-stripping alone leaves it intact and the fold silently fails | pass |
| 4 | `Đồng` → `dong` | ADR-0004 — same for uppercase `Đ` (U+0110) | pass |
| 5 | "Ngân hàng TMCP Đầu tư và Phát triển" (BIDV's legal name) folds correctly | AC-14.1, real data | pass |
| 6 | "Giao dịch viên" folds correctly | AC-14.1, real data | pass |
| 7 | Every Vietnamese vowel form incl. `ăâêôơư` and stacked marks (`ế ộ ữ ỹ ạ`) | AC-14.1 — Vietnamese stacks tone marks on modified vowels; a fold that handles only one layer is wrong | pass |
| 8 | Real listing: "Chuyên viên Cao cấp Quản lý Quan hệ Khách hàng Ưu tiên - Gold" | AC-14.1, observed on a bank career site | pass |
| 9 | Real listing: "[2026_PTKSĐT] Chuyên viên Phát triển đối tác" → "2026 ptksdt chuyen vien phat trien doi tac" | AC-14.1 — bracketed internal req codes are common in real postings | pass |
| 10 | Repeated and edge whitespace collapses; result is trimmed | consistency with the stored `title_search` column | pass |
| 11 | "Kế toán/Kiểm toán" → "ke toan kiem toan" (punctuation becomes a separator, not a join) | AC-14.1 — slash-joined titles are common; `ke toankiem toan` would be unsearchable | pass |
| 12 | Already-plain ASCII passes through unchanged | regression guard | pass |
| 13 | Empty string returns empty string, does not throw | edge, unspecified | pass |
| 14 | The fold is **idempotent** — `toSearch(toSearch(x)) === toSearch(x)` | ADR-0004: crawler writes `title_search`, reader folds the query; both call this function and the results must meet | pass |
| 15 | NFC and NFD inputs produce **identical** output | ADR-0004 — bank sites are inconsistent about normalisation form | pass |
| 16 | Input containing `tsquery` operators (`& \| ! :* ( ) ' <-> \`) is stripped to bare terms | **Security property** — ADR-0004. Reducing output to `[a-z0-9 ]` is what stops user input carrying query syntax into a constructed `tsquery` | pass |
| 17 | Output **never** contains a character outside `[a-z0-9 ]`, across four real Vietnamese titles | same — the guarantee is worthless if it holds only for the crafted hostile input | pass |

### `toStorage` — the canonical display form

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 18 | Returns NFC regardless of whether input was NFC or NFD | dedupe and index correctness — byte-different titles must compare equal | pass |
| 19 | Visually identical NFD and NFC titles compare equal after normalising | job identity, ADR-0006 | pass |
| 20 | Whitespace collapsed and trimmed, including newlines from scraped HTML | crawler ingestion | pass |
| 21 | Diacritics and letter case are **preserved** | AC-9.2 and NFR-5 — the detail view shows the bank's own words, unmodified | pass |

### `toSearchTokens`

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 22 | A query splits into its terms | FR-14 — terms are AND-ed as prefix matches | pass |
| 23 | Blank input returns `[]`, not `['']` | a `['']` token matches nothing and would silently empty the result list; callers read `[]` as "no search applied" | pass |
| 24 | Punctuation-only input (`'!!!'`) also returns `[]` | same failure, reachable by a real user | pass |

### Not covered, and why

- **AC-14.1 and AC-14.2 end to end.** These tests cover the *folding* half only. The half that
  turns tokens into a `tsquery` and matches the `title_search` GIN index does not exist yet
  (no database). Re-test at the search-query task; until then AC-14 is **partially** verified.
- **AC-14.3** — "diacritic-insensitive matching does not return postings sharing no meaningful
  term". This is a property of the AND-ed prefix query, not of the normaliser. Untestable here,
  and it is the criterion most likely to be quietly missed. Must be covered when search is built.
- **Non-Vietnamese scripts.** Not tested. Out of scope: v1 is Vietnamese-only, and any input
  outside `[a-z0-9]` after folding is stripped by design.
- **Performance.** Not measured. The function is O(n) over short strings; NFR-1 is a page-load
  budget, tested at the page level.

**Result:** 24 passed, 0 failed · `npm test` (vitest 4.1.10, 1.68s) · `npm run typecheck` clean

### Findings

1. **`npm run typecheck` fails on a clean checkout until `next build` has run at least once.**
   `app/layout.tsx:20` uses `LayoutProps<"/">`, a global type Next.js 16 *generates* into
   `.next/types/` (already on the `tsconfig.json` include path). Before any build that directory
   does not exist, and `tsc --noEmit` reports `TS2304: Cannot find name 'LayoutProps'`. Not a code
   defect — but **`ci.yml` must run `next build` before `typecheck`**, or CI fails on its first
   run for a reason that looks like a type error and is not. Recorded against
   `docs/TECHNICAL_DESIGN.md` §15 (P1 step 15).
   Verified: after `npm run build`, `npm run typecheck` exits 0.

2. **`app/layout.tsx` still carries `create-next-app` defaults** — `lang="en"` and the metadata
   title "Create Next App". The product is Vietnamese-only (PRD, interface language), so `lang`
   must become `vi`; an incorrect `lang` also degrades screen-reader pronunciation, which the
   design guidelines treat as a WCAG obligation. Not fixed here — belongs to the layout task, and
   this entry does not silently expand its own scope.

---

## 2026-08-13 — Repository hygiene, the F-14 guard (T-002)

**Code under test:** `.gitignore` and the git index itself. T-002 produced no application code —
its deliverable is a property of the repository, and that property is what is tested.
**Test file:** `test/repo-hygiene.test.ts`
**Spec:** `docs/TECHNICAL_DESIGN.md` §8.5 (Secrets and the CV problem) · `docs/adr/0003` (the
repository is public) · failure mode **F-14**

F-14 is the only row in the §11 failure table whose recovery column reads *"Prevention only —
there is no clean recovery from a pushed commit"*. §8.5 answers it with three independent layers,
and each is asserted separately below. The tests read **git's index, not the working tree**: the
question is never "is the file on disk?" but "would a push publish it?"

### The detectors fire on known-bad input

Asserted first, because a suite where every pattern matches nothing is indistinguishable from a
clean repository. Each detector is checked in both directions.

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 1–6 | `*.pdf` flags `CV_folder/dat-cv.pdf`, `docs/scan.PDF`, `resume.pdf`; allows `pdf-notes.md` and two source paths | F-14 — case-insensitivity matters, `.PDF` is a real filename | pass |
| 7–10 | `CV_folder/` flags the directory at root and nested; allows `docs/cv-policy.md` | §8.5 layer 1 bypassed by `git add -f` | pass |
| 11–17 | `.env*` flags `.env`, `.env.local`, `.env.production`, `app/.env`; **allows `next-env.d.ts`** | §8.5 — `next-env.d.ts` is the obvious false positive and it is a tracked file, so a naive `\.env` substring test would fail the build forever | pass |
| 18–20 | `.claude/agent-memory/` flags `user-profile.md`; allows `.claude/agents/` and `.claude/skills/` | T-002 finding, below | pass |
| 21 | The secret-assignment pattern flags the service-role key followed by `=` or `:` and a JWT-shaped value, but not prose or a markdown table cell naming the key | §8.5 secrets table | pass |
| 22 | The connection-string pattern flags a Postgres URL carrying `user:password@`, but not a credential-free `postgresql://localhost:5432/postgres`, nor prose naming `DATABASE_URL` | §8.5 — credentials, not mentions | pass |

> The literal bad examples live in `test/repo-hygiene.test.ts` and are deliberately **not**
> reproduced here — see finding 5.

### §8.5 layer 1 — personal files live outside the repository

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 23 | No `CV_folder/` exists inside the repository directory | §8.5 step 1 — *"this is the actual fix; the rest is belt and braces"*. Asserted against the filesystem rather than the index, because layers 2 and 3 only catch a mistake that layer 1 already permitted | pass |

### §8.5 layer 2 — `.gitignore` covers the forbidden patterns

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 24 | `.gitignore` contains `CV_folder` | §8.5 step 2, named literally | pass |
| 25 | …contains `*.pdf` | §8.5 step 2 | pass |
| 26 | …contains `.env*` (which subsumes `.env.local`) | §8.5 step 2 | pass |
| 27 | …contains `.claude/agent-memory` | T-002 finding | pass |

### §8.5 layer 3 — nothing forbidden is tracked by git

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 28 | No tracked path matches `*.pdf` | §8.5 step 3 — the predicate is quoted verbatim in the spec | pass |
| 29 | No tracked path matches `CV_folder/` | §8.5 step 3 | pass |
| 30 | No tracked path matches `.env*` | §8.5 step 3 | pass |
| 31 | No tracked path under `.claude/agent-memory/` | T-002 finding | pass |
| 32 | `.claude/agents/cto.md` and `.claude/skills/test-task/SKILL.md` **are** still tracked | Inverse guard. Ignoring all of `.claude/` would satisfy cases 28–31 while silently deleting the four agents and this skill from the repository — a "fix" that passes every test and destroys project assets | pass |

### §8.5 secrets table — nothing secret is committed

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 33 | No tracked **source** file references `SUPABASE_SERVICE_ROLE_KEY` | §8.5: *"nowhere — neither component needs it"* | pass |
| 34 | No tracked file assigns it a value | §8.5 — the leak that matters is the value, not the name | pass |
| 35 | No tracked file contains a credential-bearing Postgres URL | §8.5 — `DATABASE_URL` lives in an Actions secret, `DATABASE_URL_POOLED` in Vercel env | pass |

### Not covered, and why

- **Repository visibility.** That the repo is `PUBLIC` was verified manually against the GitHub
  API during T-002, not automated. A unit test that makes a network call to GitHub is a flake and
  needs credentials CI would not have. If this ever needs enforcing, it belongs in a workflow step,
  not in vitest.
- **Git history.** These tests inspect the **current index only**. A file committed and later
  removed would pass every case here while remaining public forever — which is precisely F-14.
  Acceptable today because the repository has four commits, all created during T-002, and the
  index was verified clean before each. It stops being acceptable the moment history grows;
  the real answer then is a history scanner (`gitleaks`, `git log --diff-filter=A`), and that is
  **not** what this file does.
- **CI enforcement.** `scripts/check-forbidden-files.ts` (T-033) does not exist yet. Until it does,
  these assertions only run when someone runs `npm test` — they do not block a push.
- **Whether git honours `.gitignore`.** Case 24–27 assert the patterns are present, not that git
  obeys them. That is git's job, and layer 3 catches the outcome regardless.
- **Binary file contents.** The secret scan skips images, fonts and `package-lock.json`. A secret
  hidden in a PNG would not be found — judged not worth the runtime.

**Result:** 59 passed, 0 failed (35 new here, 24 pre-existing in `lib/normalize.test.ts`) ·
`npm test` (vitest 4.1.10, 1.26s) · `tsc --noEmit` exit 0

### Findings

1. **The spec's word "nowhere" is ambiguous, and the first draft of this test read it the wrong
   way.** `SUPABASE_SERVICE_ROLE_KEY | nowhere` (§8.5 secrets table) was initially tested as "no
   mention in any tracked file". That **failed** — on `tasks.md` and `docs/TECHNICAL_DESIGN.md`,
   both of which name the key *in order to forbid it*. The repository was correct and the test was
   wrong. Resolved as the two properties §8.5 actually protects: no source file references the key,
   and no file assigns it a value. **T-033 must resolve this the same way**, or
   `check-forbidden-files.ts` will fail CI on the very documents that state the rule.
2. **`next-env.d.ts` is a live false-positive trap for the `.env` pattern.** It is tracked, and a
   substring test for `.env` matches it. Any implementation of T-033 that uses `contains('.env')`
   rather than an anchored pattern will fail the build on a clean checkout. Now covered by case 17.
3. **`next build` fails inside a git worktree whose `node_modules` is a junction** —
   `TurbopackInternalError: Symlink [project]/node_modules is invalid, it points out of the
   filesystem root`. Tooling artifact, not a code defect; `vitest` and `tsc` are unaffected. Worth
   knowing because the project's CI must run `next build` before `typecheck` (finding 1 of the
   entry above), so builds should be verified in a real checkout rather than a linked worktree.
4. **The guard caught its own test log, on its first run against real content.** The first version
   of this entry quoted the detectors' bad examples literally — an assignment of a JWT-shaped value
   to the service-role key, and a `user:password@` connection string. Both are tracked file content,
   so cases 34 and 35 failed on `Testcases.md` itself. The guard was right and the documentation
   was careless.

   `Testcases.md` was **not** added to the exclusion list. A real secret pasted into a test log is
   precisely the accident this is meant to catch, and an exemption would have been a hole shaped
   exactly like the next mistake. The examples were reworded instead; the literal strings live only
   in `test/repo-hygiene.test.ts`, which is excluded because a detector's own fixtures must contain
   the thing it detects.

   This is also the only evidence so far that the guard fires on real content rather than on
   synthetic input — the detector self-tests (cases 1–22) prove the patterns work, but this proves
   the wiring does.

5. **Anything documenting these patterns must avoid reproducing them.** That includes
   `scripts/check-forbidden-files.ts` (T-033) and any ADR or README describing the rule. The
   convention established here: describe the shape in prose, keep literal examples inside `test/`.

6. No defect was found in the repository itself. All three §8.5 layers hold, and the remote tree
   was independently confirmed clean after the push.

---

## 2026-08-13 — Design-system shell (T-003)

**Code under test:** `app/globals.css`, `app/layout.tsx`, `app/page.tsx`
**Test file:** `test/design-system.test.ts`
**Spec:** `docs/DESIGN_GUIDELINES.md` §4.2, §4.4, §5.1, §5.2, §5.4, §6.1, §6.2, §7.3, §8, §10.2,
§10.6 · PRD FR-27 · NFR-9 · NFR-10 · NFR-2

The guidelines ban several things *"in this codebase"* — webfonts, the `dark:` variant, the three
tightest leading utilities, uppercase Vietnamese, arbitrary spacing. A ban nothing enforces is a
preference, and preferences erode silently. These 57 cases are what make them rules.

### §8 / §6.2 — the theme carries every contrast-verified token

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 1–22 | All 22 colour tokens are present with their **exact** hex values | §6.2 — every value was *computed* against WCAG 2.1, not chosen. Nudging `--color-fg-muted` one shade lighter drops it below 4.5:1 and nothing else in the project would notice. Changing a value here requires recomputing the ratio in the same commit | pass |
| 23 | `--text-xs` is `0.8125rem` (13px), not Tailwind's 12px | §5.2 — below 13px, `ẻ` / `ẽ` / `ẹ` stop being reliably distinguishable on a mid-range Android screen | pass |
| 24–29 | Every line height is exactly as specified **and** ≥ 1.35 | §5.2 — Vietnamese stacks two marks above the x-height and one below; 1.25 clips the upper mark against the line above | pass |
| 30 | `--color-*: initial` and `--text-*: initial` are both present | §8 — without the reset, `text-red-500` and a 12px `text-xs` stay available | pass |
| 31–34 | The four container widths (`64/48/42/24rem`) | §4.2 — the 42rem prose measure is what keeps a Vietnamese line near 70 characters | pass |
| 35 | `color-scheme: light` is declared | §6.1 — without it some Android and desktop browsers force-darken form controls and contrast silently fails AA | pass |
| 36 | Exactly one global `:focus-visible` ring using the accent token | §10.2 — applied once, never per-component | pass |
| 37 | A `prefers-reduced-motion` block exists | §7.3 | pass |
| 38 | `--font-sans` is the system stack and names no webfont | §5.1 | pass |

### §5.1 / P5 — no webfont

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 39 | Nothing under `app/` or `components/` imports from `next/font` | §5.1 — the scaffold shipped Geist and Geist_Mono; a webfont is the largest avoidable cost against NFR-2's 3-second budget on 4G, and the system stack already ships designed Vietnamese glyphs | pass |
| 40 | No `@font-face`, no `.woff`/`.woff2` reference, no Google Fonts host | §5.1 — closes the other routes to the same mistake | pass |

### §6.1 — no dark mode in v1

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 41 | No `dark:` Tailwind variant anywhere | §6.1 — a partial dark mode is a bug factory; the states that break first are stale/expired/error, the ones nobody re-checks | pass |
| 42 | No `prefers-color-scheme` block | §6.1 — the scaffold's `globals.css` had one; it is gone | pass |

### §5.2 / §5.4 / §4.4 — banned utilities

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 43–45 | The three tightest leading utilities are unused | §5.2 — each clips stacked diacritics | pass |
| 46 | `uppercase` is unused | §5.4 — `Ế Ộ Ữ Ằ` exceed cap height and clip in exactly the fixed-height containers a design system encourages | pass |
| 47–49 | `tracking-wide` / `-wider` / `-widest` are unused | §5.4 — all exceed the 0.02em ceiling for Vietnamese | pass |
| 50 | No arbitrary spacing value (`p-[13px]` and friends) | §4.4 — breaks the 4px scale the layout rests on | pass |

### §10.6 — document semantics

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 51 | `<html lang="vi">` | WCAG 3.1.1 — also drives Vietnamese screen-reader pronunciation, font selection and line breaking | pass |
| 52 | `<header>`, `<main>` and `<footer>` landmarks are present | §10.6 | pass |
| 53 | A skip link exists, targets the `id` on `<main>`, and appears **before** `<header>` in the DOM | §10.6 — it must be the first focusable element, and the target must actually resolve | pass |
| 54 | The shell declares no `<h1>` | §10.6 — one `<h1>` per page, owned by the page, not the layout | pass |

### The detector fires on known-bad input

| # | What is asserted | Why | Result |
|---|---|---|---|
| 55 | A banned utility inside a real `className` is flagged, including behind a `sm:` variant | A matcher that never matches is indistinguishable from a clean codebase | pass |
| 56 | A longer class merely *containing* the banned name is not flagged | Word-boundary correctness — `leading-tighter-custom` is not `leading-tight` | pass |
| 57 | A banned name appearing only in a comment is not flagged | Finding 2 below | pass |

### Not covered, and why

- **Rendered contrast.** The tests assert the token *values* match the computed ratios in §6.2;
  they do not re-derive the ratios, and they cannot see what a browser actually paints. A wrong
  pairing — `fg-muted` text on `bg-muted` fill, never checked in §6.2 — would pass. The real check
  is the greyscale-and-axe pass in T-048.
- **320px reflow, 200% zoom, keyboard order.** NFR-9 and NFR-10 are asserted only at the level of
  markup semantics. The shell is a single-column container with no fixed widths, so reflow is very
  likely fine, but "likely fine" is not verification. **T-048 owns this** and must not be skipped
  because these tests are green.
- **That the page looks right.** Nothing here renders a component. These are static-analysis
  assertions over source text.
- **Vietnamese copy quality.** §11's register rules (no `Quý khách`, sentence case, no exclamation
  marks) are not machine-checkable and were applied by hand.
- **The comment stripper is naive.** It does not understand `//` inside a string literal, so a URL
  in a string could hide a following banned utility on the same line. Judged acceptable: the
  failure mode is a false *negative* on a line that would be obvious in review.

**Result:** 116 passed, 0 failed (57 new here; 59 pre-existing) · `npm test` (vitest 4.1.10) ·
`npm run build` clean with Turbopack in a real checkout · `tsc --noEmit` exit 0 · `eslint` exit 0

### Findings

1. **The scaffold violated two guidelines, and neither was in T-003's checklist.** `app/layout.tsx`
   loaded `Geist` and `Geist_Mono` from `next/font/google` — webfonts are banned outright by §5.1
   and P5 — and `app/globals.css` carried a `prefers-color-scheme: dark` block, which §6.1 forbids
   in v1. Both were removed and both are now guarded by cases 39–42. Worth noting that the task's
   definition of done said only *"no longer contains starter content"*; the specific violations
   surfaced from reading the guidelines rather than from the checklist.
2. **A comment explaining a rule trips the test enforcing that rule — three times now.** The shell
   carries `{/* Not an <h1>: each page owns its own single <h1> */}`, which failed case 54 on the
   first run. This is the same shape as T-002 findings 4 and 5. The durable fix applied here is
   mechanical rather than editorial: every scan strips comments first, and case 57 asserts the
   stripper works. `app/globals.css`'s note about leading utilities was also reworded to name them
   in prose, per the T-002 convention.
3. **`npm run build` cannot be verified inside a git worktree whose `node_modules` is a junction.**
   Confirms T-002 finding 3 from the other direction: `next build --webpack` succeeds there, and
   only Turbopack rejects the symlink. The default `npm run build` was therefore verified in the
   real checkout, which is the only run that counts for the definition of done.
4. **The machine ran out of disk during this task** — `ENOSPC`, 0 bytes free on `C:`, which killed
   an `npm install`. Not a code defect, but it will break builds, Next.js caches and git in
   unpredictable ways. 1.33 GB was reclaimed by clearing the npm cache; free space is ~1.7 GB,
   which is still low for a Next.js project.
5. **Tailwind's default palette is genuinely gone.** Verified directly in the compiled stylesheet:
   zero `oklch()` functions remain, which is how v4's default colours would appear. `text-red-500`
   now produces no styling rather than a colour that quietly bypasses §6.2.

---

## 2026-08-13 — Shared type definitions (T-004)

**Code under test:** `lib/types.ts`
**Test file:** `lib/types.test.ts`
**Spec:** `docs/TECHNICAL_DESIGN.md` §3.3 (shared library), §4 (data model), §5.1 (crawl
pipeline), §8.9 (time zones) · ADR-0006 · PRD FR-5, FR-8, AC-11.2, AC-12.2, AC-15.3, AC-19.2

A types module fails in two distinct ways, so there are two kinds of assertion.

**Runtime drift** — the `const` enumerations must match the schema's CHECK constraints. If they
diverge, the crawler writes a value the database rejects, at 01:00, inside a transaction, on one
bank. The design's DDL is parsed directly and compared, so the two cannot drift silently.

**Type-level regressions** — asserted with `expectTypeOf`, and for cases that must be *rejected*,
with `@ts-expect-error`. That direction is the important one: a positive assertion still passes if
a union quietly collapses, whereas an unused `@ts-expect-error` is itself a compile error. These
run under `tsc --noEmit`, not `npm test`.

### Enumerations match the schema

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 1–4 | `LEVELS`, `JOB_STATUSES`, `CRAWL_RUN_STATUSES`, `CRAWL_RESULT_STATUSES` each equal the values in the correspondingly-named CHECK constraint, parsed out of `TECHNICAL_DESIGN.md` §4 | §4.2–§4.3 — a mismatch is a runtime insert failure, not a compile error | pass |
| 5 | The constraint parser returns more than one value | Guards the vacuous case where a doc reformat makes cases 1–4 compare `[]` to `[]` and pass forever | pass |
| 6–11 | No enumeration contains a duplicate | Cheap guard against a bad merge | pass |

### Rules that must not be edited away

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 12 | `uncategorized` is in the level taxonomy | FR-8 — a wrong guess must never hide a job. Removing it makes the `NOT NULL DEFAULT` unsatisfiable | pass |
| 13 | `EXPIRY_PERMITTING_STATUS` is `success` | ADR-0006 — the single rule standing between a broken paginator and 122 silently expired jobs | pass |
| 14 | `blocked` and `failure` are distinct | §8.4 — a robots.txt disallow is not a breakage and must never alert | pass |
| 15 | `degraded` and `ok` are distinct | AC-11.2 — the indicator advances on both, but FR-29's per-bank notice needs to tell them apart | pass |

### `JobRow` models `job_expired_ck` as a discriminated union

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 16 | `status: "active"` narrows `expired_at` to `null` | §4.2 — the CHECK makes the mismatch unrepresentable in SQL; the type does the same in TS | pass |
| 17 | `status: "expired"` narrows `expired_at` to `Date` | Means T-055 cannot render an expired saved job and forget the timestamp | pass |
| 18 | Active-with-timestamp and expired-without-timestamp are both **compile errors** | The two states `job_expired_ck` forbids | pass |

### Nullability matches the schema

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 19 | `cities` is `string[] \| null` | AC-15.3 — `null` means *undetermined*, not *none*, and those jobs stay reachable | pass |
| 20 | `posted_date` is `string \| null`, **not** `Date` | §8.9 — see finding 1 | pass |
| 21 | `description_html` and `description_text` are nullable | AC-19.2 — absent renders as absent, never as a placeholder | pass |
| 22 | `level` is not nullable, and `null` is a compile error | FR-8 is enforced by the column, not by callers remembering | pass |
| 23 | `title` is non-nullable | Every job has the bank's own words | pass |
| 24 | `crawl_run.finished_at` is nullable | F-9 — a crawler that dies mid-run leaves the row open | pass |
| 25 | `crawl_result.error` is nullable | Absent on success | pass |

### `NormalisedJob` is the write path, not a row

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 26 | An empty `cities` array is a **compile error**, while `null` is allowed | §4.2 forbids `'{}'` by convention. On the write path we produce the value, so the convention is a type. The read path deliberately does not claim this — see finding 2 | pass |
| 27 | `null` is still allowed for undetermined | AC-15.3 | pass |
| 28 | It carries no `id`, `status`, `expired_at`, `first_seen_at` or `last_seen_run_id` | Those belong to the database and to the orchestrator; the run id is supplied at persist time so a normalised job cannot be attributed to the wrong run | pass |

### Row types mirror the SQL columns

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 29 | Row types expose `bank_id` / `posted_date`, and **not** `bankId` / `postedDate` | See finding 3 | pass |

### Not covered, and why

- **That the migration matches.** `db/migrations/001_init.sql` does not exist yet (T-008). These
  tests compare against the DDL *in the technical design*, which is the design of record but is
  not what the database will actually enforce. **T-008 must repoint the parser at the migration**;
  that is now in its checklist. Until then, a migration that disagrees with these types would not
  be caught.
- **Runtime shape of anything.** No value here is validated against a real database row — there is
  no database. These types are assertions about what the schema *will* contain. The runtime
  boundary is zod in T-011, which is where a wrong assumption actually surfaces.
- **The doc parser is brittle by construction.** It regex-matches from a constraint name to the
  first `))`. A reformat of §4 breaks it loudly, which is the intended failure — case 5 exists so
  it cannot break *quietly*.
- **`Platform` is stricter than the database.** The column is unconstrained `text`; the union is
  the set the crawler writes, kept true by `scripts/seed-banks.ts` (T-017), not by a constraint.

**Result:** 145 passed, 0 failed (29 new here; 116 pre-existing) · `npm test` (vitest 4.1.10) ·
`tsc --noEmit` exit 0 · `eslint` exit 0 · production build clean

### Findings

1. **`posted_date` is typed as a `YYYY-MM-DD` string, not a `Date`, and this constrains T-009.**
   A Postgres `date` carries no instant, so wrapping it in a JS `Date` forces an implicit timezone.
   §8.9 names exactly this as a real off-by-one source: a job posted `2026-08-13` becomes the 12th
   for an evening visitor once it round-trips through UTC, and FR-17's recency filter would then
   silently hide it — the failure mode FR-8 and AC-15.3 exist to prevent, arriving through a
   different door. **T-009 must verify what the `postgres` client actually returns for `date`
   columns and configure a parser if it returns `Date`.** This could not be verified here: the
   library is not a dependency yet. Added to T-009's checklist.
2. **The empty-array convention is enforced on the write path only, deliberately.** §4.2 says
   `cities = '{}'` is forbidden "by convention" — but no CHECK enforces it, so typing the read path
   as non-empty would be a lie about what the database guarantees. `NormalisedJob` makes it a
   compile error where we produce the value; `JobRow` stays honest. **T-008 can close the gap with
   `CHECK (cities IS NULL OR cardinality(cities) > 0)`**, which would let the row type tighten too.
   Recorded in T-008's checklist as a recommendation, not a decision — it changes the migration.
3. **Row types are `snake_case` and that is load-bearing.** `postgres` (porsager) returns column
   names untransformed. If T-009 enables a camelCase `transform`, every row type in this file
   becomes wrong *while still compiling*, and the failure surfaces as `undefined` fields at
   runtime. Case 29 pins the convention; T-009's checklist now names the constraint explicitly.
4. **A JSDoc comment containing a glob closed the comment early.** Writing `` `**/*.ts` `` inside a
   block comment ends it at the `*/`, and the file failed to parse. Trivial, but it is the fourth
   time this session that prose *describing* a rule has broken the code enforcing it — the same
   family as T-002 findings 4–5 and T-003 finding 2.
5. **The `@ts-expect-error` mechanism was verified empirically, not assumed.** A scratch file with
   a deliberately unused directive was compiled to confirm `tsc` reports TS2578, then deleted.
   Without that, the eight negative type assertions could all have been silently inert.
