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
