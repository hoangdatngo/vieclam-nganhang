# ADR-0005 — Accounts via Supabase Auth with Google OAuth only, no email sending

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-13 |
| Drives | PRD FR-21–FR-26, NFR-11, NFR-12, A-13, C-1 |
| Reversal cost | Medium-high — user identity is the one thing that cannot be re-derived if it goes wrong |

## Context

Accounts exist for exactly two features: save a job (FR-24) and follow a bank (FR-25). Browsing is
never gated (FR-21, NG-10), so authentication is a **side feature that must not cost anything, must
not leak, and must not become a support burden for a solo maintainer.**

The binding constraint is not auth — it is **email**. Every password-based or magic-link flow
implies transactional email: confirmation, password reset, magic links. On a 0 VND budget:

- Supabase's built-in email sender is heavily rate-limited and documented as suitable for testing
  only; production use requires custom SMTP.
- Free SMTP tiers (e.g. Resend) generally require **verifying a sending domain** before you can mail
  arbitrary recipients — and a domain costs money. OQ-1 leaves the domain undecided, so a
  `*.vercel.app` hostname must be assumed.

A password reset flow that cannot send email is not a degraded feature; it is a permanently locked
account and a user emailing the maintainer for help.

## Decision

**Supabase Auth with Google OAuth as the only sign-in method for v1. The product sends no email at
all.**

- Sign-in is "Đăng nhập bằng Google". No password is ever created, stored, or reset — which
  satisfies NFR-11 by removing the credential entirely rather than by protecting it.
- Sessions are cookie-based via `@supabase/ssr`, so server components can identify the user.
- The user identity lives in Supabase's `auth.users`. **No `profiles` table is created** — the
  product needs no name, avatar, or preferences. `saved_jobs.user_id` and `followed_banks.user_id`
  reference `auth.users(id)` with `ON DELETE CASCADE`, so deleting the account deletes the data
  (NFR-12).
- All auth calls are confined to `src/lib/auth/`. The rest of the app asks for `getUserId()` and
  gets a `string | null`. Swapping the provider means rewriting one directory.

## Alternatives considered

| Option | Why it lost |
|---|---|
| **Email + password** | Requires SMTP for password reset. Also puts the maintainer in the business of storing credentials (NFR-11) and handling "I forgot my password" by hand. |
| **Magic links / OTP by email** | No password to store, but every single sign-in depends on deliverable email — the exact dependency that cannot be funded. Worse than passwords here, because it fails on the happy path rather than the recovery path. |
| **Auth.js (NextAuth) with a Google provider, own `users` table** | Perfectly viable and vendor-neutral, and the right answer if the database ever moves to Neon. It loses today only because Supabase Auth is already present in the chosen platform, and one fewer integration matters more than portability for a solo v1. |
| **Anonymous-only, saves in `localStorage`** | Zero auth code and zero cost, and honestly tempting. Rejected because FR-24/AC-24.1 and FR-25/AC-25.1 require persistence "in a later session" across devices, and because FR-25's follow data is the substrate for the v2 email-alerts candidate (R-3). `localStorage` saves cannot be alerted on. |
| **Facebook / Zalo OAuth** | Zalo has far greater reach in Vietnam than Google for some segments, but its OAuth requires a registered business entity. Facebook Login requires app review for a public app. Google is the only provider a solo builder can turn on the same day, for free. |

## Consequences

**Good**

- No SMTP, no domain purchase, no email deliverability problem, no credential storage — three
  entire classes of failure removed from a v1 built by one person.
- Google account penetration among Vietnamese office workers is high, so the friction is low for
  the target audience.
- Deleting a user cascades all their data automatically; the privacy posture (NFR-12) is trivially
  defensible: the product stores a user id, a list of job ids, and a list of bank ids.

**Bad / accepted**

- **A user without a Google account cannot register.** This is a real, if small, exclusion. It is
  acceptable because accounts unlock only two convenience features and nothing is gated (FR-21).
  Adding a second provider later is a Supabase dashboard toggle plus a button.
- Google OAuth setup requires a Google Cloud project and correct redirect URIs, including the
  Supabase callback URL and the Vercel preview/production origins. This is fiddly the first time
  and is the most likely P3 time sink. Budget for it.
- Auth is the one place with genuine vendor lock-in (ADR-0002 keeps job data portable). Confining
  it to `src/lib/auth/` caps the migration cost at one directory.
- If OQ-1 later yields a purchased domain, revisit whether to add email sign-in. Do not add it
  before there is a domain and verified SMTP.
