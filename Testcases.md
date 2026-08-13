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
