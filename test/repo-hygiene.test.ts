import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Repository hygiene — the F-14 guard.
 *
 * Spec: docs/TECHNICAL_DESIGN.md §8.5 ("Secrets and the CV problem") · ADR-0003
 * (the repository is public, for the Actions free-tier minutes policy) ·
 * failure mode F-14 ("CV PDF committed to a public repository").
 *
 * F-14 is the one failure in the design table whose recovery column reads
 * "Prevention only — there is no clean recovery from a pushed commit". A file
 * committed once and later removed stays in history forever. §8.5 therefore
 * specifies three independent layers, and this file asserts all three.
 *
 * These tests read git's index rather than the working tree on purpose: the
 * question is never "is the file on disk?" but "would a push publish it?".
 * `.gitignore` is one `git add -f` away from being bypassed, which is exactly
 * why §8.5 does not stop at layer 2.
 *
 * Every detector below is asserted in both directions — that it passes on the
 * real repository, and that it actually fires on a known-bad input. A guard
 * that cannot fail is not a guard.
 *
 * Companion to scripts/check-forbidden-files.ts (T-033), which runs the same
 * assertion in CI. Two copies of one rule is deliberate: this one fails a local
 * `npm test` before a push, that one fails the build after.
 */

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

/** The predicates §8.5 step 3 names, as data so they can be tested both ways. */
const FORBIDDEN_PATHS = [
  {
    label: "*.pdf",
    why: "F-14: permanent public exposure of personal data",
    matches: /\.pdf$/i,
    bad: ["CV_folder/dat-cv.pdf", "docs/scan.PDF", "resume.pdf"],
    good: ["docs/TECHNICAL_DESIGN.md", "app/page.tsx", "pdf-notes.md"],
  },
  {
    label: "CV_folder/",
    why: "§8.5 layer 1 bypassed via `git add -f`",
    matches: /(^|\/)CV_folder\//i,
    bad: ["CV_folder/anything.txt", "nested/CV_folder/x.md"],
    good: ["docs/cv-policy.md", "lib/normalize.ts"],
  },
  {
    label: ".env*",
    why: "§8.5: credentials in a public repository",
    matches: /(^|\/)\.env($|\.)/i,
    bad: [".env", ".env.local", ".env.production", "app/.env"],
    // next-env.d.ts is tracked-adjacent and must NOT trip this.
    good: ["next-env.d.ts", "lib/env-helpers.ts", "docs/environment.md"],
  },
  {
    label: ".claude/agent-memory/",
    why: "T-002 finding: agent memory holds the maintainer's personal profile notes",
    matches: /^\.claude\/agent-memory\//,
    bad: [".claude/agent-memory/prd-architect/user-profile.md"],
    good: [".claude/agents/cto.md", ".claude/skills/test-task/SKILL.md"],
  },
] as const;

/** `KEY=value` / `KEY: value` — an actual secret, not prose naming the key. */
const SECRET_ASSIGNMENT = /SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*["']?[A-Za-z0-9._-]/;

/** A connection string carrying real credentials, not prose mentioning DATABASE_URL. */
const CREDENTIAL_URL = /postgres(?:ql)?:\/\/[^\s:/]+:[^\s@]+@/i;

const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Tracked files that are plausibly text, read as UTF-8. Skips binaries and the lockfile. */
function trackedTextFiles(): { path: string; content: string }[] {
  const skip = /\.(ico|png|jpe?g|gif|webp|woff2?|ttf|eot|pdf)$/i;
  return trackedFiles()
    .filter((p) => !skip.test(p) && p !== "package-lock.json")
    .map((p) => {
      const abs = join(repoRoot, p);
      // A tracked path can be absent from the working tree mid-operation; treat as empty.
      if (!existsSync(abs) || !statSync(abs).isFile()) return { path: p, content: "" };
      return { path: p, content: readFileSync(abs, "utf8") };
    });
}

describe("the detectors fire on known-bad input", () => {
  // Without this block the suite could pass because the patterns match nothing
  // at all, which is indistinguishable from a clean repository.
  describe.each(FORBIDDEN_PATHS)("$label", ({ matches, bad, good }) => {
    it.each(bad)("flags %s", (path) => {
      expect(matches.test(path)).toBe(true);
    });
    it.each(good)("allows %s", (path) => {
      expect(matches.test(path)).toBe(false);
    });
  });

  it("flags a committed service-role key but not prose naming it", () => {
    expect(SECRET_ASSIGNMENT.test("SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiJ9.abc")).toBe(true);
    expect(SECRET_ASSIGNMENT.test('SUPABASE_SERVICE_ROLE_KEY: "sb_secret_123"')).toBe(true);
    expect(SECRET_ASSIGNMENT.test("`SUPABASE_SERVICE_ROLE_KEY` exists nowhere in the project")).toBe(
      false,
    );
    expect(SECRET_ASSIGNMENT.test("| SUPABASE_SERVICE_ROLE_KEY | **nowhere** |")).toBe(false);
  });

  it("flags a credential-bearing connection string but not prose naming DATABASE_URL", () => {
    expect(CREDENTIAL_URL.test("postgresql://postgres:hunter2@db.supabase.co:5432/postgres")).toBe(
      true,
    );
    expect(CREDENTIAL_URL.test("postgres://user:pw@localhost/db")).toBe(true);
    expect(CREDENTIAL_URL.test("`DATABASE_URL` (direct, :5432) | GitHub Actions secret")).toBe(
      false,
    );
    expect(CREDENTIAL_URL.test("postgresql://localhost:5432/postgres")).toBe(false);
  });
});

describe("§8.5 layer 1 — personal files live outside the repository directory", () => {
  // "Move CV_folder/ out of the repository directory entirely. This is the actual
  // fix; the rest is belt and braces." Layers 2 and 3 catch mistakes; this is the fix,
  // so it is asserted against the filesystem, not the index.
  it("has no CV_folder/ inside the repository", () => {
    expect(existsSync(join(repoRoot, "CV_folder"))).toBe(false);
  });
});

describe("§8.5 layer 2 — .gitignore covers the forbidden patterns", () => {
  const patterns = readFileSync(join(repoRoot, ".gitignore"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    // A leading slash anchors to the repo root and a trailing one marks a
    // directory; neither changes which name is being ignored.
    .map((l) => l.replace(/^\//, "").replace(/\/$/, ""));

  // §8.5 names these three literally. `.env.local` is covered by the `.env*` glob.
  it.each([
    ["CV_folder", "the directory holding the maintainer's CV"],
    ["*.pdf", "any PDF, wherever it sits"],
    [".env*", "every env file variant, including .env.local"],
    [".claude/agent-memory", "agent memory, per the T-002 finding"],
  ])("ignores %s — %s", (pattern) => {
    expect(patterns).toContain(pattern);
  });
});

describe("§8.5 layer 3 — no forbidden file is tracked by git", () => {
  // The authoritative check. §8.5 step 3 specifies exactly this predicate:
  // "failing the build if `git ls-files` matches *.pdf, CV_folder/, or .env*".
  it.each(FORBIDDEN_PATHS)("tracks nothing matching $label — $why", ({ matches }) => {
    expect(trackedFiles().filter((p) => matches.test(p))).toEqual([]);
  });

  // The agent definitions and the skill ARE project assets and must stay tracked.
  // Without this, ignoring all of `.claude/` would satisfy every test above while
  // silently dropping the four agents and the test-task skill from the repository.
  it("still tracks the agent definitions and skills", () => {
    const tracked = trackedFiles();
    expect(tracked).toContain(".claude/agents/cto.md");
    expect(tracked).toContain(".claude/skills/test-task/SKILL.md");
  });
});

describe("§8.5 secrets table — nothing secret is committed", () => {
  // "SUPABASE_SERVICE_ROLE_KEY | nowhere | Neither component needs it.
  //  Do not add it 'just in case'."
  //
  // "Nowhere" is ambiguous. The first draft of this test read it as "no mention
  // in any tracked file" and failed on tasks.md and docs/TECHNICAL_DESIGN.md,
  // both of which name the key *in order to forbid it* — the behaviour the spec
  // wants, not a violation. Resolved as the two properties §8.5 actually
  // protects: no component uses the key, and no value for it is ever committed.
  it("is not referenced by any source file — neither component needs it", () => {
    const offenders = trackedTextFiles()
      .filter((f) => SOURCE_FILE.test(f.path) && !f.path.startsWith("test/"))
      .filter((f) => f.content.includes("SUPABASE_SERVICE_ROLE_KEY"))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("never has a value assigned to it in a tracked file", () => {
    const offenders = trackedTextFiles()
      .filter((f) => !f.path.startsWith("test/"))
      .filter((f) => SECRET_ASSIGNMENT.test(f.content))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  // DATABASE_URL and DATABASE_URL_POOLED are held by GitHub Actions and Vercel
  // respectively (§8.5). Naming them in prose is fine; a URL carrying real
  // credentials is not.
  it("contains no credential-bearing Postgres connection string", () => {
    const offenders = trackedTextFiles()
      .filter((f) => !f.path.startsWith("test/"))
      .filter((f) => CREDENTIAL_URL.test(f.content))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
