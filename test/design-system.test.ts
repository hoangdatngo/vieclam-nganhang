import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Design-system invariants — docs/DESIGN_GUIDELINES.md.
 *
 * The guidelines ban several things "in this codebase": webfonts (§5.1/P5), the
 * `dark:` variant (§6.1), the three tightest leading utilities (§5.2), uppercase
 * Vietnamese (§5.4), and arbitrary spacing values (§4.4). A ban that nothing
 * enforces is a preference, and preferences erode. These tests are what make
 * them rules.
 *
 * The colour values are asserted literally because each one was *computed*
 * against WCAG 2.1, not chosen (§6.2). Nudging `--color-fg-muted` a shade
 * lighter silently drops it below 4.5:1, and nothing else in the project would
 * notice. If a value here needs to change, the contrast must be recomputed and
 * §6.2 updated in the same commit — that is what this test is for.
 */

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const GLOBALS_CSS = join(repoRoot, "app", "globals.css");

/** Every source file that can carry a Tailwind class or a font import. */
function uiSourceFiles(): { path: string; content: string }[] {
  const roots = ["app", "components"].map((d) => join(repoRoot, d)).filter(existsSync);
  const out: { path: string; content: string }[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if ([".tsx", ".jsx", ".ts", ".js", ".css"].includes(extname(abs))) {
        out.push({ path: abs.slice(repoRoot.length + 1).replace(/\\/g, "/"), content: readFileSync(abs, "utf8") });
      }
    }
  };

  roots.forEach(walk);
  return out;
}

/**
 * Strips comments before scanning for banned class names.
 *
 * Without this, a comment explaining *why* a utility is banned trips the test
 * that enforces the ban — the same trap recorded as T-002 finding 5. Naive
 * stripping (it does not understand `//` inside a string literal) is adequate
 * here and the limitation is recorded in Testcases.md.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** Matches a Tailwind utility as it appears in a className, not inside a word. */
function usesUtility(source: string, utility: string): boolean {
  const escaped = utility.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|["'\`\\s{])(?:[a-z-]+:)*${escaped}(?:["'\`\\s}]|$)`).test(source);
}

describe("§8 — the theme carries every contrast-verified token", () => {
  const css = readFileSync(GLOBALS_CSS, "utf8");

  // Exact values from §6.2, each with a recorded WCAG ratio. Changing one
  // without recomputing its ratio is the failure this guards.
  it.each([
    ["--color-bg", "#ffffff", "card and input surface"],
    ["--color-bg-subtle", "#f7f8fa", "page background"],
    ["--color-bg-muted", "#eff1f4", "chip fill"],
    ["--color-border", "#e1e4ea", "decorative hairline — 1.27:1, never load-bearing"],
    ["--color-border-strong", "#c9ced8", "card border on tinted surfaces"],
    ["--color-border-control", "#868ea0", "3.29:1 — inputs and dashed inference chips"],
    ["--color-fg-muted", "#626a79", "5.44:1 on white — absent-data phrases"],
    ["--color-fg-secondary", "#545c6b", "6.73:1 on white — city, date, bank name"],
    ["--color-fg-strong", "#3e4553", "8.51:1 on bg-muted — chip labels"],
    ["--color-fg", "#171b23", "17.25:1 on white — titles and body"],
    ["--color-accent-subtle", "#edf2fd", "selected filter pill"],
    ["--color-accent", "#1e4bc4", "7.35:1 — links, focus ring, primary action"],
    ["--color-accent-strong", "#17399a", "10.06:1 — hover and active"],
    ["--color-success", "#0e7a46", "fresh"],
    ["--color-success-surface", "#e7f6ee", "fresh surface"],
    ["--color-success-border", "#2e8f5e", "3.61:1 on its surface"],
    ["--color-warning", "#8a5300", "stale"],
    ["--color-warning-surface", "#fdf3e2", "stale surface"],
    ["--color-warning-border", "#a87515", "3.66:1 on its surface"],
    ["--color-danger", "#b0271d", "gone / error"],
    ["--color-danger-surface", "#fdecea", "danger surface"],
    ["--color-danger-border", "#c96a5f", "3.22:1 on its surface"],
  ])("defines %s as %s — %s", (token, value) => {
    expect(css.toLowerCase()).toContain(`${token}: ${value}`);
  });

  // §5.2: 13px floor, because below it ẻ / ẽ / ẹ stop being distinguishable.
  it("overrides text-xs to 13px, not Tailwind's 12px default", () => {
    expect(css).toContain("--text-xs: 0.8125rem");
  });

  it.each([
    ["--text-xs--line-height", 1.5],
    ["--text-sm--line-height", 1.55],
    ["--text-base--line-height", 1.6],
    ["--text-lg--line-height", 1.5],
    ["--text-xl--line-height", 1.4],
    ["--text-2xl--line-height", 1.35],
  ])("sets %s to at least 1.35 for stacked diacritics", (token, expected) => {
    const found = css.match(new RegExp(`${token.replace(/-/g, "\\-")}:\\s*([\\d.]+)`));
    expect(found, `${token} is not defined`).not.toBeNull();
    expect(Number(found![1])).toBe(expected);
    expect(Number(found![1])).toBeGreaterThanOrEqual(1.35);
  });

  it("resets Tailwind's default palette and type scale", () => {
    // Without these, `text-red-500` and a 12px `text-xs` remain available.
    expect(css).toContain("--color-*: initial");
    expect(css).toContain("--text-*: initial");
  });

  it.each([
    ["--container-list", "64rem"],
    ["--container-detail", "48rem"],
    ["--container-prose", "42rem"],
    ["--container-form", "24rem"],
  ])("defines %s as %s (§4.2)", (token, value) => {
    expect(css).toContain(`${token}: ${value}`);
  });

  it("declares color-scheme: light so the OS cannot force-darken controls", () => {
    // §6.1 — force-darkening silently breaks form-control contrast.
    expect(css).toMatch(/color-scheme:\s*light/);
  });

  it("defines one global :focus-visible ring (§10.2)", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-accent\)/);
  });

  it("honours prefers-reduced-motion (§7.3)", () => {
    expect(css).toContain("prefers-reduced-motion");
  });

  it("uses the system font stack and names no webfont", () => {
    expect(css).toContain("--font-sans:");
    expect(css).toMatch(/system-ui/);
  });
});

describe("§5.1 / P5 — no webfont is loaded", () => {
  // A webfont is the largest avoidable cost against NFR-2's 3s budget on 4G,
  // and the system stack already ships designed Vietnamese glyphs. The
  // create-next-app scaffold shipped two Geist families; T-003 removed them.
  it("imports nothing from next/font", () => {
    const offenders = uiSourceFiles()
      .filter((f) => /from\s+["']next\/font/.test(stripComments(f.content)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("declares no @font-face and fetches no font file", () => {
    const offenders = uiSourceFiles()
      .filter((f) => /@font-face|\.woff2?|fonts\.googleapis\.com/.test(stripComments(f.content)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});

describe("§6.1 — no dark mode in v1", () => {
  // A partial dark mode is a bug factory: this palette encodes trust states,
  // and the states that break first are the ones nobody re-checks.
  it("uses no `dark:` Tailwind variant", () => {
    const offenders = uiSourceFiles()
      .filter((f) => /(?:^|["'`\s{])dark:[a-z]/.test(stripComments(f.content)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("has no prefers-color-scheme block", () => {
    const offenders = uiSourceFiles()
      .filter((f) => /prefers-color-scheme/.test(stripComments(f.content)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});

describe("§5.2 / §5.4 / §4.4 — banned utilities", () => {
  // Each of these clips or misreads Vietnamese specifically.
  it.each([
    ["leading-none", "§5.2 — clips the upper mark of ế against the line above"],
    ["leading-tight", "§5.2 — 1.25 is below the 1.35 floor for stacked marks"],
    ["leading-snug", "§5.2 — still below the floor"],
    ["uppercase", "§5.4 — Ế Ộ Ữ exceed cap height and clip in fixed containers"],
    ["tracking-wide", "§5.4 — letter-spacing above 0.02em on Vietnamese"],
    ["tracking-wider", "§5.4 — as above"],
    ["tracking-widest", "§5.4 — as above"],
  ])("does not use %s — %s", (utility) => {
    const offenders = uiSourceFiles()
      .filter((f) => usesUtility(stripComments(f.content), utility))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("uses no arbitrary spacing values (§4.4)", () => {
    // `p-[13px]` and friends break the 4px scale the whole layout rests on.
    const offenders = uiSourceFiles()
      .filter((f) => /(?:^|["'`\s{])(?:[a-z-]+:)*(?:p|m|gap|space)[trblxy]?-\[/.test(stripComments(f.content)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});

describe("§10.6 — document semantics", () => {
  // Comments are stripped here too. The shell carries a comment reading
  // "Not an <h1>: each page owns its own single <h1>", which trips the very
  // assertion it explains — the third instance of that trap in this project
  // (T-002 findings 4 and 5 were the first two).
  const layout = stripComments(readFileSync(join(repoRoot, "app", "layout.tsx"), "utf8"));

  it('sets lang="vi" on <html> — WCAG 3.1.1', () => {
    expect(layout).toMatch(/<html[^>]*lang="vi"/);
  });

  it("renders the header, main and footer landmarks", () => {
    expect(layout).toMatch(/<header[\s>]/);
    expect(layout).toMatch(/<main[\s>]/);
    expect(layout).toMatch(/<footer[\s>]/);
  });

  it("puts a skip link before the landmarks, targeting <main>", () => {
    const skipHref = layout.match(/href="#([a-z-]+)"/);
    expect(skipHref, "no skip link found").not.toBeNull();
    expect(layout).toMatch(new RegExp(`<main[^>]*id="${skipHref![1]}"`));
    // It must be the first focusable element in the DOM.
    expect(layout.indexOf("href=\"#")).toBeLessThan(layout.indexOf("<header"));
  });

  it("declares no <h1> in the shell, so each page owns its single h1", () => {
    expect(layout).not.toMatch(/<h1[\s>]/);
  });
});

describe("the banned-utility detector fires on known-bad input", () => {
  // Same reasoning as the repo-hygiene suite: a matcher that never matches is
  // indistinguishable from a clean codebase.
  it("flags a banned utility in a className", () => {
    expect(usesUtility('<p className="mt-2 leading-tight text-fg">', "leading-tight")).toBe(true);
    expect(usesUtility('<p className="sm:uppercase">', "uppercase")).toBe(true);
  });

  it("does not flag a longer utility that merely contains the banned name", () => {
    expect(usesUtility('<p className="leading-tighter-custom">', "leading-tight")).toBe(false);
    expect(usesUtility('<p className="not-uppercase-thing">', "uppercase")).toBe(false);
  });

  it("ignores banned names that appear only inside comments", () => {
    expect(usesUtility(stripComments("// leading-tight is banned"), "leading-tight")).toBe(false);
    expect(usesUtility(stripComments("/* uppercase is banned */"), "uppercase")).toBe(false);
  });
});
