# ADR-0002 — Postgres on Supabase as the single datastore

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-13 |
| Drives | PRD C-1, C-3, FR-13, FR-14, FR-22–FR-26, NFR-7, A-6, A-13 |
| Reversal cost | High — schema, queries, auth and deployment all bind to it |

## Context

The crawler (GitHub Actions) and the website (Vercel) need a shared store. Requirements that
constrain the choice:

1. Free tier, 0 VND (C-1, NFR-7).
2. Reachable from two separate hosts — so an embedded/file database is only viable if the data is
   read-only at runtime.
3. **Runtime writes** are required: saved jobs and followed banks (FR-24, FR-25).
4. Diacritic-insensitive Vietnamese full-text search (FR-13, FR-14) — see ADR-0004.
5. Accounts on a free tier (A-13).
6. Data volume: roughly 500–2,000 live postings plus soft-deleted history. Tiny.

## Decision

**Supabase Postgres, accessed as plain Postgres, with Supabase Auth for accounts.**

- All job data is read and written through **Drizzle ORM over the `postgres` (postgres.js) driver**
  using a standard `DATABASE_URL`. No Supabase-specific client is used for job data.
- Supabase Auth is used only for sign-in and session cookies (ADR-0005). It is isolated behind
  `src/lib/auth/`.
- Connection routing (verify hostnames/ports at build time in the Supabase dashboard):
  - Website (Vercel, serverless, many short connections) → **Supavisor transaction pooler**, with
    `prepare: false` set on postgres.js (transaction-mode pooling cannot use prepared statements).
  - Crawler and migrations (GitHub Actions, one long connection) → **Supavisor session pooler**.
    Do not assume the direct database host is reachable: Supabase's direct connection is IPv6-only
    on free projects and GitHub-hosted runners are IPv4-only. **Verify at build time**; if the
    direct host resolves and connects from a runner, it may be used instead.
- **Row Level Security is enabled on every table in `public`, without exception.** This is not
  optional hardening: Supabase exposes `public` tables over PostgREST to anyone holding the anon
  key, and the anon key is public by definition. A table with RLS disabled is a world-writable
  table. Policies: `select` for `anon`/`authenticated` on `banks` and `jobs`; owner-only on
  `saved_jobs` and `followed_banks`; no policies at all on `crawl_runs`/`crawl_bank_results`
  (server-side reads only). The crawler connects as the table owner and bypasses RLS.

## Alternatives considered

| Option | Why it lost |
|---|---|
| **No database — crawler commits a SQLite/JSON artifact, site reads it at build time** | Genuinely the fewest moving parts and my preference *if accounts were out of scope*. It dies on FR-24/FR-25: saved jobs and followed banks require multi-user runtime writes. Recorded because if accounts were ever dropped, this becomes the right answer. |
| **Neon free tier** | Equivalent Postgres, arguably better developer experience for branching. Loses on two counts: (a) no bundled auth, so accounts need a second vendor (see ADR-0005); (b) free-tier compute autosuspends on idle, adding cold-start latency to a first page load already budgeted at 3s (NFR-2). Neon remains the designated escape hatch — because job data uses plain Postgres, moving is a connection-string change plus replacing auth. |
| **Turso / libSQL** | Attractive free tier, but SQLite's full-text story (FTS5) is weaker for the tsvector approach in ADR-0004, and it adds an unfamiliar driver for no gain at this data volume. |
| **MongoDB Atlas free tier** | Text search is weaker for Vietnamese, no bundled auth, and the relational shape here (jobs ↔ banks ↔ users) is exactly what Postgres is good at. |
| **Firebase / Firestore** | Bundles auth, but query model fights the FR-15..FR-18 conjunctive filter + full-text requirement, and free-tier read quotas are counted per document. |

## Consequences

**Good**

- One vendor for database + auth; one dashboard to check when something is wrong.
- Postgres gives `tsvector` + GIN, arrays with GIN, partial indexes, and generated columns — every
  feature the search and filter requirements need, with no extension beyond core.
- Because job data never touches a Supabase-proprietary API, vendor lock-in is confined to auth.

**Bad / accepted**

- Free-tier Supabase projects pause after a period of inactivity. A 12-hourly crawl plus real
  traffic should prevent this, but **it is an availability risk that must be verified at build
  time** and re-checked if the crawl is ever paused. If the project pauses, the site is down —
  not merely stale — which is worse than the NFR-4 posture.
- RLS is a correctness-critical piece of configuration living in SQL migrations rather than in
  application code. It must be covered by a migration and re-checked whenever a table is added.
  Add the check to the definition of done for any new table.
- Free-tier database size and connection ceilings are unverified. **Verify at build time**; A-6
  (volume fits the free tier) is almost certainly safe at ~2,000 rows, but the ceiling on
  concurrent connections is the one that bites a serverless website. The pooler is the mitigation.
