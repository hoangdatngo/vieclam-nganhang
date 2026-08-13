# ADR-0004 — Diacritic-insensitive search via an application-normalised column

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-08-13 |
| **Decides** | PRD FR-13, FR-14 (AC-13.1, AC-13.2, AC-14.1–14.3), NFR-6 |

## Context

FR-14 requires "chuyen vien tin dung" to match a posting titled "Chuyên viên Tín dụng", and
AC-14.3 requires that diacritic-insensitivity must **not** make the search return postings sharing
no meaningful term with the query. Those two pull in opposite directions: loosening matching
without loosening it into noise.

Two Vietnamese-specific facts drive the implementation and are the usual source of bugs:

1. **`đ`/`Đ` (U+0111/U+0110) has no Unicode canonical decomposition.** Unicode NFD normalisation
   followed by combining-mark stripping — the standard trick — removes the diacritics from `ế`,
   `ộ`, `ữ` and every other Vietnamese vowel, but leaves `đ` untouched. "tín dụng" becomes
   "tin dung" but "đồng" becomes "đong", and a user typing "dong" gets nothing.
2. **The same visible Vietnamese string can arrive in NFC or NFD form** depending on the source
   site. Two byte-different titles that look identical will break equality comparison, dedupe keys,
   and any index. Bank career sites are not consistent about this.

## Decision

**Normalise in TypeScript, store the result in a dedicated column, and search it with PostgreSQL
full-text search using the `simple` configuration.**

The normaliser, in `lib/normalize.ts`, used by **both** the crawler (on ingest) and the website
(on every query) — it must be one function, not two implementations:

```ts
/** Storage form: canonical NFC. Apply to every string the crawler ingests. */
export const toStorage = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

/** Search form: lowercase, diacritic-free, alphanumeric + spaces only. */
export const toSearch = (s: string) =>
  s.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip combining marks
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')  // MUST be explicit: đ does not decompose
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
```

Schema:

```sql
title        text NOT NULL,               -- original, unmodified, NFC (FR-19 AC-9.2, NFR-5)
title_search text NOT NULL,               -- toSearch(title), written by the crawler
search_tsv   tsvector GENERATED ALWAYS AS (to_tsvector('simple', title_search)) STORED
CREATE INDEX job_search_tsv_idx ON job USING GIN (search_tsv);
```

Query construction:

```
tokens = toSearch(userInput).split(' ').filter(Boolean)
tsquery = tokens.map(t => t + ':*').join(' & ')       -- AND across tokens, prefix on each
... WHERE search_tsv @@ to_tsquery('simple', $tsquery)
```

- `&` (AND) is what satisfies AC-14.3: every token must be present, so an unrelated posting cannot
  be returned.
- `:*` prefix matching makes partial words and search-as-you-type work, at no correctness cost
  since all tokens must still match.
- `simple` is the correct configuration: it lowercases and tokenises on whitespace/punctuation
  without stemming. There is no Vietnamese stemmer in PostgreSQL, and Vietnamese is
  not inflected in a way that would benefit from one. English stemming would actively corrupt
  Vietnamese tokens.
- **No SQL injection surface**: `toSearch` reduces input to `[a-z0-9 ]`, so the constructed tsquery
  cannot contain tsquery operators. This is a security property of the normaliser and must not be
  weakened when someone later "improves" the character class.
- Search covers the **job title only**, per FR-13's wording. Including bank and city would make
  "ha noi" return every Hanoi posting and drown title matches.

## Alternatives considered

| Alternative | Why it lost |
|---|---|
| **PostgreSQL `unaccent` extension** (`unaccent(title)`, or an `unaccent`-based FTS configuration) | The obvious answer, and it probably works — modern `unaccent.rules` does map `đ→d`. But it makes correctness depend on an extension's rules file version, on the extension being available on the host's free tier, and on `unaccent` being wrapped in an `IMMUTABLE` function before it can be indexed (it is `STABLE` by default — a well-known trap). Doing it in TypeScript is testable with a unit test, identical in the crawler and the website, portable to any database, and has no version surprises. |
| **`pg_trgm` + `ILIKE '%…%'` or similarity ranking** | Simplest to write and fine at this data volume. Rejected on AC-14.3: trigram similarity returns results that share no meaningful term ("tin dung" fuzzily matching "tin hoc ung dung"), which is exactly the failure mode the acceptance criterion forbids. Trigram remains the right tool if fuzzy/typo tolerance is ever wanted as an explicit, separately-labelled feature. |
| **A hosted search service (Algolia / Meilisearch Cloud / Typesense Cloud)** | Excellent Vietnamese handling out of the box. Adds a vendor, a sync path between Postgres and the index, and a free tier that will eventually change. For ~2,000 short strings this is a search engine to keep alive in exchange for nothing Postgres cannot do. Violates "fewer moving parts", and free-tier ceilings put C-1 at risk. |
| **Client-side search over the full dataset** (ship all jobs as JSON, filter in the browser) | Genuinely viable at 2,000 rows and very fast. Rejected on NFR-15 (job detail pages and filtered views must be server-rendered and indexable) and NFR-2 (shipping the full dataset to a 4G mobile client on first load). |

## Consequences

**Good**

- One normaliser, unit-tested, used identically on both sides. A round-trip test
  (`toSearch("Chuyên viên Tín dụng") === "chuyen vien tin dung"`) is the whole verification.
- No extensions, no vendor, no sync job. Portable to any PostgreSQL.
- Query cost is a GIN index lookup; comfortably inside NFR-1's 2-second budget at any plausible v1
  data volume.

**Bad**

- `title_search` is derived data that can drift from `title` if a future code path writes `title`
  without recomputing it. Mitigation: both columns are written only by the crawler's persistence
  layer, in one function; nothing else may write to `job`.
- Changing the normaliser requires a backfill (`UPDATE job SET title_search = ...` for every row).
  Cheap at this size, but it is a migration, not a deploy. Note it in the runbook.
- No relevance ranking — results are ordered by posted date (FR-12), not by match quality. This is
  a deliberate simplification; revisit only if users report it.
