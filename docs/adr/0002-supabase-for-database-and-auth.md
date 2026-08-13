# ADR-0002 — Supabase Postgres as the database, Supabase Auth as the only auth

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-08-13 |
| **Decides** | PRD FR-22–FR-26, NFR-7, NFR-11, A-13; C-1, C-3 |

## Context

The crawler and the website need a shared store (PRD §11). Accounts are a Must-have (FR-22, US-9,
US-10) but grant no extra data (FR-23) — auth is pure identity, nothing more. Budget is 0 VND
(C-1). One maintainer.

PRD C-3 recommends "Supabase or Neon free tier" without choosing. The choice is worth making
deliberately because it is the most expensive thing in this design to reverse: it is the one
component both other components depend on.

The differentiator is not the database. Both are managed Postgres on a free tier and either would
serve ~2,000 rows of job data comfortably. The differentiator is **auth**.

Facts checked 2026-08-13 (re-verify at build time — these change):

| Supabase free tier | Value |
|---|---|
| Database | 500 MB |
| Monthly active users (Auth) | 50,000 |
| Egress | 5 GB/month |
| Active projects | 2 |
| Pausing | after **7 days** with no database activity |

## Decision

**Use Supabase for both the Postgres database and authentication. Use Supabase Auth for identity
only; do not use PostgREST, Realtime, Storage, or Edge Functions.**

Access paths:

| Consumer | Mechanism | Why |
|---|---|---|
| Crawler (GitHub Actions) | Direct Postgres connection, session mode (port 5432), `postgres` (porsager) client | Needs multi-statement transactions and bulk upserts. |
| Website (Vercel, server components / route handlers) | Postgres via the **transaction pooler** (port 6543), `postgres` client with `prepare: false` | Serverless invocations must not hold direct connections. One SQL path for all reads, including joins between job tables and user tables. |
| Website (identity) | `@supabase/ssr` + `@supabase/supabase-js`, cookie-backed sessions | Managed sign-up, sign-in, password reset, email verification. |

**Security posture that this choice forces, and that must be implemented:**

Supabase exposes a public PostgREST API on the project URL with the publishable/anon key. Because
this design does **not** use PostgREST, that surface must be closed rather than left at defaults:

1. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on **every** table in `public`, with **no policies**
   granting `anon` or `authenticated` anything. Default-deny.
2. `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;` and revoke the equivalent
   default privileges.
3. The application connects as the owner role via the connection string, so RLS does not apply to
   it. **Authorisation for user-scoped data is therefore application-code correctness**: every
   query touching `saved_job` or `followed_bank` must filter by a `user_id` taken from a
   server-verified Supabase session, never from a request parameter. This is stated plainly because
   it is the one place where getting it wrong is a data breach (NFR-11), and RLS will not save you.
4. The `service_role` key is never present in the website's environment. The website has no use for
   it.

## Alternatives considered

| Alternative | Why it lost |
|---|---|
| **Neon Postgres + Auth.js (NextAuth)** | Neon's database is at least as good (arguably better serverless story, branching for migrations). But auth becomes a component the maintainer owns: provider config, session strategy, an adapter, a users table, password reset and email verification flows, plus an email sender — which on a 0-VND budget means another free-tier vendor (Resend/Postmark) and another failure mode. That is a large amount of surface for a feature the PRD explicitly says grants nothing (FR-23). |
| **Neon + Clerk/Auth0 free tier** | Adds a third vendor and a third dashboard, and free-tier MAU caps are the kind of limit that changes without warning. Two vendors beats three. |
| **Supabase with PostgREST + RLS for everything, search as a SQL RPC** | The idiomatic Supabase shape and safer by default. Rejected because it splits querying across two idioms (PostgREST filters for simple reads, hand-written SQL inside RPC functions for search) and makes the job↔saved_job join awkward. One SQL path is easier for one person to hold in their head, and PostgREST errors are markedly harder to debug than a logged SQL statement. |
| **SQLite/LibSQL (Turso) committed to the repo or hosted** | Attractive for a read-mostly dataset and genuinely cheap. Loses managed auth entirely, and a repo-committed database makes the crawler a code-pushing process, which conflicts with the GitHub Actions inactivity workaround being a *deliberate* signal rather than routine noise. Postgres full-text + array types also do more of the work here. |
| **No accounts in v1** | Not available — FR-22–FR-26 are Must-have and P3 is in the release plan. |

## Consequences

**Good**

- One vendor, one dashboard, one bill (zero). Auth is somebody else's problem.
- Free-tier project pausing after 7 days of inactivity is a non-issue: the crawler touches the
  database every 12 hours, so the project never idles. This is a real advantage over
  scale-to-zero databases where the *user-facing* request pays the cold-start cost.
- 50,000 MAU is ~4 orders of magnitude more headroom than this product will need.
- Plain SQL and plain Postgres mean the *database* is portable. If Supabase's free tier changes,
  only auth needs replacing, and the schema moves to Neon unchanged.

**Bad**

- Authorisation correctness sits in application code, not in the database. Accepted, with the
  mitigation above (single `user_id` source, server-verified). A code review checkpoint on this
  specific point belongs in P3.
- 500 MB is not large. Job descriptions are the only field that can grow without bound; see the
  size guard in the technical design (§8).
- Supabase's connection pooler is an additional hop that can fail independently of the database.
  Failure is loud (connection errors surface as 500s) rather than silent, which is acceptable.
- Vendor coupling on auth. Reversible but not cheap: user rows live in `auth.users`, and migrating
  identity providers means a password reset for every user.

## Revisit if

- Database size crosses ~400 MB, or monthly egress approaches 5 GB.
- Supabase changes free-tier auth limits or pausing behaviour.
- Account features grow beyond identity (roles, profiles, teams) — at which point RLS starts
  earning its keep and the PostgREST path deserves reconsideration.
