---
name: test-task
description: Write and run tests for an implementation task that has just been completed, then record what was tested in Testcases.md. Use this whenever a coding task, feature, module, adapter, migration, or bug fix is finished and before marking it complete — including when the user says "done", "that's finished", "test this", "write tests for what we just did", or asks whether the code actually works. Tests are derived from the PRD acceptance criteria and technical design, never from reading the implementation back.
---

# Test the completed task

A task is not done when the code exists. It is done when something other than the author has
checked it against what it was supposed to do, and that check is written down.

This skill runs at the end of an implementation task, before it is marked complete.

## The one rule that makes this worth doing

**Derive the expected behaviour from the spec, not from the code.**

The failure mode of "write tests for what we just built" is tests that assert whatever the code
currently happens to do. They pass on the first run, they pass forever, and they catch nothing —
a bug becomes the tested behaviour. Every hour spent that way is wasted, and worse than wasted,
because it buys false confidence.

So, in order:

1. Read the spec for what was built — the numbered acceptance criteria in `PRD.md`, the relevant
   section of `docs/TECHNICAL_DESIGN.md`, the governing ADR in `docs/adr/`.
2. Write down what the code *should* do, in terms of inputs and expected outputs.
3. *Then* look at the implementation — only to find the seams and edge cases the spec did not
   anticipate, not to decide what "correct" means.

If a test disagrees with the code, the test is not automatically wrong. Work out which one is
wrong before changing either.

## Steps

### 1. Establish what changed

Identify the files the task touched. If unclear, ask — do not guess and test the wrong surface.

### 2. Find the spec

| What was built | Where its truth lives |
|---|---|
| Pure functions in `lib/` | `PRD.md` FR / AC numbers (e.g. FR-14, AC-7.2) |
| Crawler adapter or bank config | `docs/TECHNICAL_DESIGN.md` §crawler, `docs/adr/0001` |
| Expiry, dedupe, job identity | `docs/adr/0006`, PRD FR-8 and the OQ-5 guard |
| Search behaviour | `docs/adr/0004`, PRD FR-14 |
| Schema or migration | `docs/TECHNICAL_DESIGN.md` §data model |
| UI screen | `docs/DESIGN_GUIDELINES.md` and the screen spec |

Cite the identifiers (`AC-7.2`, `ADR-0006`) in the test file as comments. A test whose reason for
existing is traceable survives refactoring; a test that just exists gets deleted by the next person
who finds it inconvenient.

If the task has **no** spec — it was ad hoc — say so plainly in `Testcases.md` and state the
behaviour you assumed. Do not invent an acceptance criterion and present it as agreed.

### 3. Choose the right test level

This project's stack is **vitest**. Match the test to the thing:

- **Pure functions** (`lib/normalize.ts`, `lib/levels.ts`, `lib/cities.ts`) — table-driven
  `it.each`, real inputs, no mocks. These are the correctness core; they deserve the most cases.
- **Parsers and adapters** — test against a **recorded fixture** in `crawler/fixtures/`, never a
  live HTTP request. A test that hits a bank's website is not a test, it is a flake and a
  politeness violation.
- **Database logic** — test the query-building and guard logic as pure functions where possible.
  Do not stand up a database to assert that Postgres works.
- **UI** — assert behaviour and accessible names, not markup structure or class strings.

### 4. Write the cases

Cover, in this order of value:

1. **The acceptance criteria verbatim.** Each AC becomes at least one case.
2. **The edge that the spec explicitly calls out** — e.g. "Chuyên viên cao cấp" must resolve to
   Senior and not Officer (AC-7.2); `đ`/`Đ` have no Unicode decomposition; `toSearchTokens('')`
   returns `[]` not `['']`.
3. **The empty, blank, and absent cases.** `posted_date` and `cities` are commonly NULL in this
   system — code that assumes they are present is the most likely bug in any given task.
4. **Anything the code guards against.** If there is a guard, there must be a test that trips it.
   The `suspect` guard is worthless if nothing ever proves it fires.
5. **Real observed data.** Paste actual job titles from bank career sites into the table. Synthetic
   inputs test synthetic behaviour.

Do not write: snapshot tests of whole objects, tests that mock the thing under test and then assert
the mock was called, or one test per line of code for coverage's sake.

### 5. Run them

```
npm test          # vitest run
npm run typecheck # tsc --noEmit
```

Both must pass. Run the full suite, not just the new file — the point is partly to catch what this
task broke elsewhere.

### 6. On failure, report — do not paper over

A failing test is the skill working. Never:

- loosen an assertion until it passes,
- delete the failing case,
- or edit the implementation to match the test without first deciding the test is right.

State the failure, state which of the two is wrong and why, then fix that one. If it is genuinely
ambiguous, leave the test failing, mark it `it.fails` or `it.todo` with a comment, and raise it —
an open question is more useful than a false green.

### 7. Record it in `Testcases.md`

Append a new section at the **end** of `/Testcases.md` (project root). Never rewrite or prune
earlier entries — this file is a log, and its value is that it accumulates.

Create the file with the header below if it does not exist.

## `Testcases.md` format

```markdown
# Test Cases

A running log of what has been tested, by whom, against which requirement, and with what result.
Append-only — entries are never edited or removed. Newest at the bottom.

---

## YYYY-MM-DD — <task name>

**Code under test:** `lib/levels.ts`
**Test file:** `lib/levels.test.ts`
**Spec:** PRD FR-7, FR-8 · AC-7.1 – AC-7.4

| # | What is asserted | Why (spec ref) | Result |
|---|---|---|---|
| 1 | "Chuyên viên cao cấp" → Senior, not Officer | AC-7.2 — most-specific match wins | pass |
| 2 | Unmatched title → Uncategorized, still listed when no filter applied | FR-8 — a wrong guess must never hide a job | pass |
| 3 | Empty title → Uncategorized rather than throwing | edge, unspecified | pass |

**Not covered, and why:**
- Level inference for English-language titles — out of scope for v1 (PRD: Vietnamese only).

**Result:** 14 passed, 0 failed · `npm test` (vitest 4.1.10) · typecheck clean
**Findings:** none.
```

The **Not covered** section is not optional and is not filler. It is the honest half of the
document: a reader who knows what was *not* checked can judge the risk. A test log that only lists
successes is marketing.

**Findings** records anything the testing turned up — a real bug found and fixed, a spec ambiguity,
a guard that could not be triggered. Write "none" when there is nothing rather than dropping the
line.

## Finishing

Report to the user, briefly:

- how many cases were added and what they cover,
- the actual pass/fail counts from the real run output,
- anything found, including specs that turned out to be ambiguous.

Do not claim a task is verified if the suite did not run clean. Say what failed.
