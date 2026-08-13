# ADR-0004 — Diacritic-insensitive search by folding at write time, not query time

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-13 |
| Drives | PRD FR-13, FR-14, AC-14.1–14.3, NFR-1, NFR-6 |
| Reversal cost | Medium-high — it is a stored column plus an index; changing it is a backfill migration |

## Context

FR-14 requires "chuyen vien tin dung" (no diacritics) and "Chuyên viên Tín dụng" (with diacritics)
to return the same posting, and AC-14.3 forbids the loosening from returning unrelated results.
Vietnamese is the hard case for this: it stacks tone marks on vowels that already carry a
modifier (`ư`, `ơ`, `ă`, `â`, `ê`, `ô`), and `đ` is a stroked consonant with **no Unicode
decomposition at all** — NFD normalisation alone will not turn `đ` into `d`.

## Decision

**Fold text to lowercase ASCII in TypeScript when a job is written, store the result in a
`title_norm` column, and search against a generated `tsvector` built from that column. Fold the
user's query with the identical function at query time.**

```ts
// src/lib/text/fold.ts — shared verbatim by crawler and website
export function fold(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // strip combining tone/diacritic marks
    .replace(/đ/g, "d")           // đ  → d  (no decomposition exists)
    .replace(/Đ/g, "D")           // Đ  → D
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
```

Verified in Node 24 against real inputs:
`"Chuyên viên Tín dụng Đầu tư ĐÀ NẴNG ưu tiên"` → `"chuyen vien tin dung dau tu da nang uu tien"`.

Storage and index:

```sql
title_norm  text NOT NULL,
search_tsv  tsvector GENERATED ALWAYS AS (to_tsvector('simple', title_norm)) STORED,
-- CREATE INDEX jobs_search_tsv_idx ON jobs USING GIN (search_tsv);
```

`to_tsvector('simple', …)` with a literal configuration is `IMMUTABLE`, so it is legal in a stored
generated column. The `'simple'` configuration is deliberate: it does no stemming and no stopword
removal, both of which are English-centric and would corrupt Vietnamese tokens.

Query construction (word-AND semantics, prefix match on the final token only):

```ts
const tokens = fold(q).split(" ").filter(Boolean).map(t => t.replace(/[^a-z0-9]/g, "")).filter(Boolean);
// -> to_tsquery('simple', 'chuyen & vien & tin & dung:*')
```

AND across tokens is what satisfies AC-14.3: a result must contain every word the user typed, so
folding cannot pull in postings that share no meaningful term. Prefix-matching only the last token
supports as-you-type search without loosening earlier terms.

## Alternatives considered

| Option | Why it lost |
|---|---|
| **Postgres `unaccent` extension** (`to_tsvector('simple', unaccent(title))`) | The obvious answer, and it fails on details. `unaccent()` is `STABLE`, not `IMMUTABLE`, so it cannot be used in an index expression or generated column without wrapping it in a hand-written `IMMUTABLE` wrapper function — a well-known foot-gun that produces subtly wrong results if the rules file ever changes. Coverage of `đ` and the horned vowels depends on the server's `unaccent.rules` version, which we neither control nor test. And it puts search behaviour in the database, where it cannot be unit-tested next to the code that depends on it. |
| **Fold at query time only, with `ILIKE '%…%'`** | No stored column, but the query cannot use an index (leading wildcard), and it matches across word boundaries, weakening AC-14.3. Fine at 2,000 rows; a trap at 20,000 when coverage expands toward 50 banks. |
| **`pg_trgm` trigram similarity** | Handles typos, which nobody asked for, and returns fuzzy matches that directly threaten AC-14.3. Also a much larger index. |
| **An external search service (Algolia/Meilisearch/Typesense free tiers)** | Real diacritic handling out of the box, but a second datastore to keep in sync, a second failure mode, and free tiers that can change under a project with no budget. Vastly disproportionate to ~2,000 rows. |

## Consequences

**Good**

- Folding is a **pure function with unit tests**, run identically on both sides of the query. A
  search bug is reproducible in a test file, not only against a live database.
- No database extension dependency: the schema is portable to Neon, or to any Postgres, unchanged
  (preserves the ADR-0002 escape hatch).
- Indexed GIN lookup; search cost is irrelevant at this data volume and stays irrelevant at 20×.

**Bad / accepted**

- `title_norm` is derived data that can drift from `title` if the folding function changes.
  Mitigation: changing `fold()` requires a backfill migration, and this must be written on the
  function as a comment. Treat `fold()` as versioned schema, not as a utility.
- Folding loses the distinction between genuinely different words (`má`/`mà`/`mã` all become `ma`).
  This is the explicit product requirement, not a defect — FR-14 asks for exactly this.
- Search covers job titles only, per FR-13. Extending it to descriptions later means adding them
  to the folded column and reindexing — cheap, and no structural change.
