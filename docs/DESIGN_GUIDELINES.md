# Design Guidelines & Design System — BankJobs VN

| Field | Value |
|---|---|
| **Version** | 0.1 |
| **Status** | Draft for review. Sections marked **Open** are not decided (§14) |
| **Author** | ux-designer |
| **Date** | 2026-08-13 |
| **Source of truth** | `PRD.md` v0.1. Where this document and the PRD disagree, the PRD wins — except the two collisions flagged in §13 |
| **Scope** | Design system only. Per-screen specifications are a separate deliverable (`docs/screens/*.md`) and are **not** in this document |
| **Styling system** | Tailwind CSS. This document defines the theme; it introduces no second styling system |

---

## 1. What this product's design is actually about

The visual problem here is not making a job list look nice. Job lists are a solved pattern and we should steal the solved pattern.

The unsolved problem is that **this product knows things with five different degrees of certainty and must never let the user confuse them.** The bank's own job title is fact. The city is our normalisation. The level is our guess. The posted date is sometimes missing. The whole bank's data is sometimes 3 days old because a scraper broke. A saved job may no longer exist at all.

A candidate who applies to a job that closed last week, or who filters out the exact role they wanted because our keyword matcher mislabelled it, does not blame the scraper. They stop using the site. **The design system's primary job is to make degrees of certainty visible at a glance**, cheaply enough that one person can build and maintain it.

Everything below serves that. The rest is convention.

---

## 2. Design principles

Five rules. Each exists to settle a specific argument that will come up during the build.

### P1 — A system guess never removes information from the screen

Inference may *annotate*; it may never *subtract*. Uncategorized levels, undetermined cities and unknown posted dates stay in the unfiltered list, always (PRD FR-8, AC-15.3, AC-12.2). No default filter is ever pre-applied. No row is ever collapsed, greyed out or de-prioritised because our parsing was weak.

> *Settles:* "should we hide Uncategorized to make the list look cleaner?" — No. Ever.

### P2 — Display every value at the confidence level it actually has

There is one visual tier per confidence level (§3) and data is rendered at its true tier. A guessed level never looks like a stated fact. An absent field is named as absent, never filled with a placeholder, an em dash, or a plausible-looking default.

> *Settles:* "can we just show the level as a normal tag like every other job board?" — No, because on every other job board the employer chose it.

### P3 — Colour means state, never identity

The entire non-neutral palette is reserved for freshness, inference and availability. No bank gets a brand colour. No bank gets a logo. No accent colour is used decoratively. If a colour appears in a row, it is telling the user something about how much to trust that row.

> *Settles:* "should each bank have its brand colour so they're easier to spot?" — No. Thirteen brand colours would consume the only channel we have for communicating trust, and at 20px most Vietnamese bank marks are indistinguishable anyway.

### P4 — Scan first, read second

The core task is reading 30 result rows in 20 seconds and picking 2. Anything added to a result row must pay for its vertical height by helping that decision. Anything that does not help the scan belongs on the detail view.

> *Settles:* "can we show a description snippet in the row?" — No. It doubles row height and no scan decision depends on it.

### P5 — Weight is a feature

Every kilobyte competes with a 3-second first paint on 4G (NFR-2) on a free tier (NFR-7). No webfont, no icon library, no animation library, no imagery, no client-side chart, no component library that ships its own theme. The design is built entirely from type, colour, border and space — the four things that cost nothing.

> *Settles:* "can we add a small icon library, it's only 40KB?" — No. Ten hand-written inline SVGs cost 2KB.

---

## 3. The confidence ladder — the core of this system

Every piece of data on screen sits on exactly one of these five tiers. Learn this table and most design questions answer themselves.

| Tier | What it is | Examples | Visual treatment | Never |
|---|---|---|---|---|
| **1 — Bank's own words** | Text published by the bank, unmodified (AC-9.2, AC-27.2) | Job title, description, source URL | `text-fg` (`#171B23`), full weight, no ornament, no border | Never paraphrased, translated, title-cased or truncated in the DOM |
| **2 — Normalised by us** | Bank's fact, reformatted by us | City, posted date, bank name | `text-fg-secondary` (`#545C6B`), plain text, no chip | Never styled to compete with the title |
| **3 — Guessed by us** | Produced by inference, not published | Inferred level (FR-7, FR-9) | Chip with **dashed** border, neutral only, always within reach of the standing note | Never the accent colour, never a solid border, never presented without the note |
| **4 — Absent** | The source did not provide it (AC-19.2) | Missing city, unknown posted date, no description | `text-fg-muted` (`#626A79`), a phrase that *names the absence* in Vietnamese | Never `—`, never `N/A`, never blank, never a guessed default |
| **5 — Suspect** | We have it, but it may no longer be true | Bank data >24h stale, expired saved job | Tinted notice or chip — amber (stale) or red (gone) | Never `opacity-50` on the content itself (§9.4) |

**The one-sentence rule the whole system rests on:**

> **A solid border means the bank said it. A dashed border means we guessed it.**

That rule is cheap in Tailwind (`border` vs `border border-dashed`), survives at 320px, survives greyscale, and does not depend on the user reading a legend.

---

## 4. Layout, grid and spacing

### 4.1 Viewports

| Name | Width | Notes |
|---|---|---|
| **Design baseline** | **360px** | PRD NFR-9. Every layout is designed here first. |
| **Reflow floor** | **320px** | WCAG 2.1 **1.4.10 Reflow** (AA) requires no two-dimensional scrolling down to 320px. The accessibility bar is stricter than NFR-9 — build to 320. |
| `sm` | 640px | First branch point |
| `lg` | 1024px | Second branch point |

**Rule:** branch at `sm` and `lg` only. A solo maintainer with no design tooling cannot keep four breakpoints honest. `md` and `xl` are available in Tailwind but are not used by this design; if a layout seems to need one, the mobile layout is wrong.

### 4.2 Containers

| Context | Max width | Horizontal padding |
|---|---|---|
| List / search page | `64rem` (1024px) | `1rem` (<640) → `1.5rem` (≥640) |
| Job detail page | `48rem` (768px) | same |
| Long-form prose (description, legal, coverage) | `42rem` (672px) measure | same |
| Auth forms | `24rem` (384px) | same |

The 42rem measure exists because Vietnamese averages ~5.5 characters per word with diacritics; 42rem at 16px lands near 70 characters per line, which is the readable band. A description rendered full-width at 1024px is unreadable and will happen by default if nobody constrains it.

### 4.3 Two-column at `lg`

Below `lg`, filters live in a bottom sheet. At `lg` and above, filters become a sticky left column so results and controls are visible together.

```
< lg (360–1023)                    >= lg (1024+)
┌──────────────────────┐           ┌────────┬───────────────────────┐
│ header               │           │ header                         │
│ search               │           │ search                         │
│ freshness            │           │ freshness                      │
│ [Bộ lọc (2)] chips…  │           │ filters│ chips…                │
│ ─── results ───      │           │ 15rem  │ ─── results ───       │
│                      │           │ sticky │                       │
└──────────────────────┘           └────────┴───────────────────────┘
```

Left column: `15rem` (240px), `position: sticky`, `top` = header height + `1rem`, own `overflow-y: auto`, `max-height: calc(100vh - …)`.

### 4.4 Spacing scale

Tailwind's 4px base, restricted to this subset. **Arbitrary spacing values (`p-[13px]`) are not permitted.**

| Token | px | Used for |
|---|---|---|
| `1` | 4 | Chip inner padding (vertical), icon-to-label gaps |
| `2` | 8 | Chip padding (horizontal), tight stacks, gap between meta items |
| `3` | 12 | Card inner padding (mobile), stack gap inside a card |
| `4` | 16 | Container padding, card inner padding (≥sm), gap between cards |
| `6` | 24 | Section gap, container padding ≥sm |
| `8` | 32 | Major section separation |
| `12` | 48 | Page-level blocks (top of empty state, footer separation) |
| `16` | 64 | Rare — top/bottom of full-page empty and error states |

**Vertical rhythm rule:** gap between result cards is `2` (8px) with a visible card border. Not `4`. Denser list = more rows per scan (P4), and the border already separates them.

### 4.5 Radius

| Token | Value | Applied to |
|---|---|---|
| `sm` | `0.25rem` / 4px | Nothing by default — reserved |
| `md` | `0.5rem` / 8px | Cards, inputs, buttons, notices, sheets' inner elements |
| `lg` | `0.75rem` / 12px | Bottom sheet, dropdown panel |
| `full` | `9999px` | Chips, tags, filter pills, freshness pill |

One radius for structure (8px), one for pills (full). Do not introduce a third.

---

## 5. Typography

### 5.1 Typeface: the native system stack. No webfont.

```css
--font-sans:
  ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
  "Helvetica Neue", Arial, "Noto Sans", sans-serif;
```

**Why, specifically for Vietnamese:**

1. **Coverage is genuinely there.** The three fonts that will actually resolve for this audience — Roboto (Android, the dominant device class here), SF Pro (iOS), Segoe UI (Windows) — all ship complete Vietnamese Latin Extended-Additional coverage, including the hard cases: `ế ề ệ ể ễ`, `ộ ổ ỗ ơ ớ ờ ợ`, `ư ứ ừ ữ ự`, `ă ắ ằ ặ`, `đ Đ`. These are not fallback-composed; they are designed glyphs with the diacritics properly stacked and kerned. This is not true of many popular webfonts, where Vietnamese is machine-composed and the double-stacked marks (`ế` = circumflex + acute) collide or sit at the wrong height.
2. **It costs zero bytes and produces zero layout shift.** NFR-2 gives us 3 seconds on 4G. A webfont is the single largest avoidable cost in that budget, and FOUT on a text-dense list page is visually violent.
3. **It is free forever and needs no asset management** (NFR-7, C-5).

**Rejected: Be Vietnam Pro.** It is the strongest option on the merits — designed by a Vietnamese foundry specifically for Vietnamese diacritics, and it would give the product a real identity. It is rejected for v1 only because identity is not a v1 goal and two weights subset to `vietnamese,latin` still costs ~50–70KB and a font-loading strategy the maintainer would have to keep correct. Revisit at v2 if the product acquires a brand (see OQ-D8).

**Rejected: Inter.** No Vietnamese-specific advantage over the system stack, and it costs the download anyway.

### 5.2 Type scale

Tailwind's default `text-xs` (12px) and default line heights are **wrong for Vietnamese** and are replaced.

| Token | Size | Line height | Used for |
|---|---|---|---|
| `xs` | `0.8125rem` / 13px | `1.5` | Meta text, chip labels, footnotes, legal |
| `sm` | `0.875rem` / 14px | `1.55` | Secondary body, form helper text, filter labels |
| `base` | `1rem` / 16px | `1.6` | Body text, **job card title**, inputs |
| `lg` | `1.125rem` / 18px | `1.5` | Section headings, job title on detail ≥sm |
| `xl` | `1.375rem` / 22px | `1.4` | Page `h1` on mobile, job title on detail (mobile) |
| `2xl` | `1.75rem` / 28px | `1.35` | Page `h1` at ≥sm |

**Two hard rules, both about diacritics:**

- **Minimum size for Vietnamese text is 13px (`text-xs`).** Below that, the difference between `ẻ` and `ẽ` and `ẹ` stops being reliably resolvable on a mid-range Android screen. Tailwind's 12px default is overridden for this reason, not for taste.
- **Minimum line-height is 1.35, and 1.5 for anything multi-line.** Vietnamese stacks two marks above the x-height (`ế`, `ữ`, `ố`) and one below (`ộ`, `ệ`, `ợ`). Tailwind's `leading-tight` (1.25) clips the upper mark against the descender of the line above. **`leading-none`, `leading-tight` and `leading-snug` are banned in this codebase.**

### 5.3 Weights

Three only: `400` (normal), `500` (medium), `600` (semibold). No `700` — on Roboto and SF at 16px, 600 vs 700 is indistinguishable and 700 makes stacked diacritics muddy.

| Weight | Use |
|---|---|
| 600 | Job card title, page `h1`, primary button label, active filter pill |
| 500 | Bank name, section headings, secondary button label, chip labels |
| 400 | Everything else |

### 5.4 Never set Vietnamese in uppercase

`uppercase` / `text-transform: uppercase` is **banned on any Vietnamese string**. Reasons, in order of severity:

1. Uppercase Vietnamese with marks (`Ế`, `Ộ`, `Ữ`, `Ằ`) exceeds the cap height by a large margin and clips in any fixed-height container — exactly the containers a design system encourages (chips, badges, table headers).
2. Vietnamese readers rely on diacritics to disambiguate words; uppercase reduces glyph distinctiveness and measurably slows scanning, which is the one thing we are optimising (P4).
3. It reads as shouting, which is the wrong register for a free public utility (§11).

**Sole exception:** bank ticker codes (`VCB`, `TCB`) are Latin-only abbreviations with no diacritics and are set uppercase by definition, not by `text-transform`. Write them uppercase in the data.

Also banned for the same containment reason: `letter-spacing` above `0.02em` on Vietnamese, and `text-overflow: ellipsis` on a single line where `line-clamp` on 2–3 lines would work instead.

### 5.5 Truncation

| Element | Mobile | ≥ sm |
|---|---|---|
| Job card title | `line-clamp-3` | `line-clamp-2` |
| Bank name | never truncated | never truncated |
| City list | `Hà Nội +3` pattern (§11.5) | same |
| Detail page title | never truncated | never truncated |

Realistic worst case — `Chuyên viên Cao cấp Quản lý Quan hệ Khách hàng Ưu tiên - Gold` (62 characters) — occupies 3 lines at 16px/600 in a 328px content column. Two-line clamping on mobile would cut it mid-phrase, and the tail is the discriminating part. Hence 3 lines on mobile. `line-clamp` leaves the full string in the DOM, so screen readers and search engines still get all of it — do not additionally set `title=""` or slice the string server-side.

---

## 6. Colour

### 6.1 Position on dark mode: **not in v1.** Tokens are structured so v2 is a swap, not a rewrite.

Reasoning: dark mode doubles the surface that has to be contrast-verified by hand, and this palette's whole job is encoding trust states (§3) — amber-on-white and amber-on-near-black are different design problems, not the same colour inverted. For one person with no design tooling, a half-correct dark mode is worse than none, because the states that would break first are exactly the low-frequency ones (stale, expired, error) that nobody re-checks.

**What v1 must do anyway, so v2 is cheap:**

1. Define every colour as a CSS custom property with a **semantic** name (`--color-fg-muted`), never a literal one (`--color-gray-500`), so a dark theme redefines values without touching a single component.
2. Set `color-scheme: light` on `:root`. Without it, some Android and desktop browsers force-darken form controls and the resulting text contrast silently fails AA.
3. **Do not use Tailwind's `dark:` variant anywhere in v1.** A partial dark mode is a bug factory.

### 6.2 Palette

Every pairing below was computed, not estimated. Ratios are WCAG 2.1 relative-luminance contrast.

**Neutrals**

| Token | Hex | Role | Verified contrast |
|---|---|---|---|
| `--color-bg` | `#FFFFFF` | Card surface, sheet surface, input fill | — |
| `--color-bg-subtle` | `#F7F8FA` | Page background behind cards | — |
| `--color-bg-muted` | `#EFF1F4` | Chip fill, table header, inactive tab | — |
| `--color-border` | `#E1E4EA` | Hairline divider, card border (decorative — meaning never depends on it) | 1.27:1 vs white — intentionally decorative |
| `--color-border-strong` | `#C9CED8` | Card border on tinted surfaces | 1.58:1 vs white — decorative |
| `--color-border-control` | `#868EA0` | **Input, select, checkbox, dashed chip borders** | **3.29:1** vs white ✅ (WCAG 1.4.11) |
| `--color-fg-muted` | `#626A79` | Absent-data phrases, placeholders, footnotes | **5.44:1** on white ✅ · **5.12:1** on `bg-subtle` ✅ |
| `--color-fg-secondary` | `#545C6B` | City, date, bank name, visited title | **6.73:1** on white ✅ · **6.33:1** on `bg-subtle` ✅ |
| `--color-fg-strong` | `#3E4553` | Chip labels on `bg-muted` | **9.63:1** on white ✅ · **8.51:1** on `bg-muted` ✅ |
| `--color-fg` | `#171B23` | Titles, body, headings | **17.25:1** on white ✅ · **16.23:1** on `bg-subtle` ✅ |

> `--color-border` at 1.27:1 is deliberate: it is a decorative hairline. **No information may ever be conveyed by it alone.** Anything a user must perceive as a boundary — inputs, controls, the dashed inference chip — uses `--color-border-control` at 3.29:1.

**Accent** — links, focus, primary action. One hue, three stops.

| Token | Hex | Role | Verified contrast |
|---|---|---|---|
| `--color-accent-subtle` | `#EDF2FD` | Selected filter pill fill, active nav fill | — |
| `--color-accent` | `#1E4BC4` | Links, primary button fill, focus ring | **7.35:1** on white ✅ · **6.91:1** on `bg-subtle` ✅ · white on it **7.35:1** ✅ |
| `--color-accent-strong` | `#17399A` | Hover/active on accent, text on `accent-subtle` | **10.06:1** on white ✅ · **8.96:1** on `accent-subtle` ✅ |

Chosen as a blue that is deliberately not any covered bank's brand blue and reads as institutional rather than promotional. It appears only on interactive elements — see P3.

**Semantic — state only**

| State | Text | Surface | Border | Verified |
|---|---|---|---|---|
| **Success / fresh** | `#0E7A46` | `#E7F6EE` | `#2E8F5E` | text on surface **4.84:1** ✅ · text on white **5.40:1** ✅ · border on surface **3.61:1** ✅ |
| **Warning / stale** | `#8A5300` | `#FDF3E2` | `#A87515` | text on surface **5.76:1** ✅ · text on white **6.33:1** ✅ · border on surface **3.66:1** ✅ |
| **Danger / gone / error** | `#B0271D` | `#FDECEA` | `#C96A5F` | text on surface **5.82:1** ✅ · text on white **6.66:1** ✅ · border on surface **3.22:1** ✅ |

Every semantic colour clears AA for normal-size text on both white and its own surface, so a chip can move between a card and the page background without re-checking. Every semantic border clears 3:1, so the notice boundary is perceivable independently of the fill.

**Colour is never the only signal.** Every state that uses a semantic colour also carries a Vietnamese text label and (for notices) an icon. Verify by taking a greyscale screenshot: if a state becomes ambiguous, it is wrong.

### 6.3 Visited links — a real feature here, not decoration

A user scanning the same list every few days needs to see which postings they already opened. Standard purple would introduce a sixth hue and collide with P3.

**Decision:** a visited job title renders at `--color-fg-secondary` (`#545C6B`, 6.73:1 ✅) instead of `--color-fg` (17.25:1). Clearly different, no new hue, still comfortably AA.

Implementation note: browsers restrict `:visited` to `color`, `background-color`, `border-color`, `outline-color` and `column-rule-color`, and always report the unvisited computed style to JS. Do not attempt weight, opacity or icon changes — they will silently not work.

---

## 7. Elevation, iconography and motion

### 7.1 Elevation: borders, not shadows

| Level | Treatment | Used for |
|---|---|---|
| 0 | `border border-border` on `bg` | Cards, notices, inputs, panels — **the default** |
| 1 | `0 8px 24px -6px rgb(23 27 35 / 0.18)` + `border-border` | Bottom sheet, dropdown panel, only while open |

A shadow on a white card sitting on a near-white page communicates nothing and costs paint time on the cheap Android GPUs this audience uses. One shadow token exists, only for things that float above the page.

### 7.2 Icons: ~10 hand-written inline SVGs, no library

Required set: `search`, `filter`, `close`, `chevron-down`, `external-link`, `bookmark` (+ filled), `check`, `alert-triangle`, `info`, `dot`. That is the complete inventory; a new icon needs a reason.

Spec: 24×24 viewBox, `stroke="currentColor"`, `stroke-width="1.75"`, `fill="none"`, `stroke-linecap="round"`. Rendered at 20px inline with text, 24px standalone. Always `aria-hidden="true"` with a text label beside it, **except** where the icon is the only content — then the control needs `aria-label`.

Two icons carry real meaning and are non-optional:
- `external-link` on the apply CTA — this is how AC-20.3 ("the user is leaving for the bank's site") is satisfied visually.
- `alert-triangle` on stale/error notices — the non-colour half of the signal.

### 7.3 Motion: almost none

| Transition | Duration | Easing |
|---|---|---|
| Colour / background / border on hover, focus, press | `150ms` | `ease-out` |
| Bottom sheet enter/exit (`translateY`) | `200ms` | `ease-out` |
| Dropdown panel enter (`opacity` + 4px `translateY`) | `120ms` | `ease-out` |

Nothing else animates. **No skeleton shimmer** — a looping animation on 20 placeholder rows is a measurable battery and jank cost on low-end devices, and gains nothing over static blocks.

Wrap all of the above in:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 8. Tailwind theme

Tailwind v4 CSS-first syntax, in `app/globals.css`. (For a v3 project, the same tokens map into `theme.extend` in `tailwind.config.ts` with identical names minus the `--color-` prefix.)

```css
@import "tailwindcss";

@theme {
  /* Reset Tailwind's default palette and type scale so only our tokens exist.
     This is deliberate: it makes `text-red-500` a build-time error, not a review finding. */
  --color-*: initial;
  --text-*: initial;

  /* ---- Neutrals ---- */
  --color-bg:              #FFFFFF;
  --color-bg-subtle:       #F7F8FA;
  --color-bg-muted:        #EFF1F4;
  --color-border:          #E1E4EA;
  --color-border-strong:   #C9CED8;
  --color-border-control:  #868EA0;
  --color-fg-muted:        #626A79;
  --color-fg-secondary:    #545C6B;
  --color-fg-strong:       #3E4553;
  --color-fg:              #171B23;

  /* ---- Accent (interactive only) ---- */
  --color-accent-subtle:   #EDF2FD;
  --color-accent:          #1E4BC4;
  --color-accent-strong:   #17399A;

  /* ---- Semantic: state only ---- */
  --color-success:         #0E7A46;
  --color-success-surface: #E7F6EE;
  --color-success-border:  #2E8F5E;
  --color-warning:         #8A5300;
  --color-warning-surface: #FDF3E2;
  --color-warning-border:  #A87515;
  --color-danger:          #B0271D;
  --color-danger-surface:  #FDECEA;
  --color-danger-border:   #C96A5F;

  /* ---- Type ---- */
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, "Noto Sans", sans-serif;

  --text-xs:   0.8125rem;  --text-xs--line-height:   1.5;
  --text-sm:   0.875rem;   --text-sm--line-height:   1.55;
  --text-base: 1rem;       --text-base--line-height: 1.6;
  --text-lg:   1.125rem;   --text-lg--line-height:   1.5;
  --text-xl:   1.375rem;   --text-xl--line-height:   1.4;
  --text-2xl:  1.75rem;    --text-2xl--line-height:  1.35;

  /* ---- Radius ---- */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;

  /* ---- Elevation ---- */
  --shadow-overlay: 0 8px 24px -6px rgb(23 27 35 / 0.18);

  /* ---- Layout ---- */
  --container-list:   64rem;
  --container-detail: 48rem;
  --container-prose:  42rem;
  --container-form:   24rem;
}

:root {
  color-scheme: light;               /* stops OS force-darkening from breaking contrast */
}

html {
  -webkit-text-size-adjust: 100%;    /* stops iOS inflating text on rotate */
}

body {
  background: var(--color-bg-subtle);
  color: var(--color-fg);
  font-family: var(--font-sans);
  text-rendering: optimizeLegibility; /* keeps diacritic kerning correct */
}

/* Global focus ring — see §10.2. Applied once, not per-component. */
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

**Interoperation rule:** if a headless component library (Radix, shadcn/ui, Headless UI) is introduced, its tokens must be **mapped onto these**, not maintained alongside them. Two palettes is the failure mode this section exists to prevent.

**`<html lang="vi">` is mandatory** — it is WCAG 3.1.1, it makes Vietnamese screen readers pronounce the interface correctly, and it affects font selection and line breaking.

---

## 9. Component inventory

Every component below, in every state: `default`, `hover`, `focus-visible`, `active`, `disabled` (where it exists), `loading` (where it exists). Per-screen composition is specified separately.

### 9.1 Bank identity — text ticker badge. **No logos.**

**Recommendation: do not use bank logos in v1.** Three reasons, in order of weight:

1. **Legal posture.** The PRD's C-6 position is that the product attributes and links back but does not substitute for or associate itself with the banks. Displaying 13 registered trademarks on a commercial-looking aggregation page is the single most likely trigger for the objection that A-8 assumes will not happen and R-5 flags as high-impact. A text name is unambiguously attribution; a logo starts to look like affiliation.
2. **Weight and maintenance (P5, C-5).** 13 assets to source, optimise, colour-correct against a white card, re-fetch on every rebrand, and re-fetch again when the bank count moves toward 50. That is recurring manual work, which C-5 rules out by construction.
3. **They do not work at this size.** Most Vietnamese bank marks are wordmarks. At the ~24px a result row can afford, they are illegible — so the bank name would have to be printed next to the logo anyway, and the logo becomes pure decoration.

**Instead:** a monochrome 3-letter **ticker badge** plus the full bank name as text.

| Bank | Ticker | Bank | Ticker |
|---|---|---|---|
| Vietcombank | `VCB` | Sacombank | `STB` |
| BIDV | `BID` | SHB | `SHB` |
| VietinBank | `CTG` | HDBank | `HDB` |
| Techcombank | `TCB` | TPBank | `TPB` |
| MB | `MBB` | MSB | `MSB` |
| VPBank | `VPB` | LPBank | `LPB` |
| ACB | `ACB` | | |

All thirteen are exactly three characters — these are the banks' own HOSE/HNX stock codes, the shorthand the Vietnamese finance sector already uses daily. Exploit that: a fixed 3-character badge gives a fixed-width scan anchor with **zero layout jitter** across the whole list, costs zero bytes, and carries no trademark surface.

The badge never replaces the name. **The full bank name is always rendered as text** (AC-10.2), so a fresh-graduate user who does not know tickers loses nothing; the badge is a scan accelerator for the users who do.

| Property | Value |
|---|---|
| Size | `2.25rem × 1.25rem` (36×20), `radius-sm`, fixed |
| Fill / border / text | `bg-muted` / `border-border-strong` / `fg-strong` (`8.51:1` ✅) |
| Type | `text-xs`, weight 500, `tracking-[0.02em]`, uppercase-in-data |
| A11y | `aria-hidden="true"` — the adjacent full name is the accessible text |
| Variants | `default` · `muted` (on stale-bank rows, keeps contrast, loses the border) |

### 9.2 Job card (result row) — the most important component in the product

```
360px viewport, container padding 16px, card padding 12px
┌──────────────────────────────────────────────┐
│ Chuyên viên Cao cấp Quản lý Quan hệ    [🔖] │  ← title: text-base/600/fg, line-clamp-3
│ Khách hàng Ưu tiên - Gold                    │     tier 1, whole card is this link
│                                              │
│ [TCB] Techcombank                            │  ← badge + name: text-sm/500/fg-secondary, tier 2
│                                              │
│ Hà Nội +2 · 2 ngày trước   ⌜Chuyên viên⌟     │  ← meta: text-xs/400/fg-secondary, tier 2
└──────────────────────────────────────────────┘     level chip: dashed, tier 3
   gap-2 (8px)
┌──────────────────────────────────────────────┐
│ Giao dịch viên                          [🔖] │
│ [VCB] Vietcombank                            │
│ Chưa rõ địa điểm · Chưa rõ ngày đăng  ⌜…⌟   │  ← tier 4: named absences, fg-muted
└──────────────────────────────────────────────┘
```

| Aspect | Spec |
|---|---|
| Container | `bg` · `border border-border` · `radius-md` · `p-3` (`p-4` ≥sm) |
| Hover (pointer only) | `border-border-control` + `bg-subtle`; **no transform, no shadow** |
| Focus | Ring lands on the whole card via the title's `:focus-visible` (§10.2) |
| Line order | title → bank → meta. Fixed. Title first follows the pattern every job board uses; deviating costs learning time for no gain (P4). |
| Meta separator | ` · ` (U+00B7 with hair spaces), never `\|` or `•` |
| Density | ~130px tall at 360px with a 3-line title; ~4.5 cards visible per 800px viewport |

**Whole-card link — the fiddly part, specified so it is not got wrong.** The card must be one link target for touch, but it also contains a save button. Do **not** wrap the card in `<a>` (invalid nested interactive content, and a screen reader reads the entire card as one link label). Use the stretched-link pattern:

```
<article class="relative border …">
  <h3><a href="/viec-lam/…" class="after:absolute after:inset-0">{title}</a></h3>
  …
  <button class="relative z-10" aria-label="Lưu việc làm">…</button>
</article>
```

One link in the accessibility tree, one tab stop, full-card touch target, save button still clickable and independently focusable.

**Card variants**

| Variant | When | Change |
|---|---|---|
| `default` | Normal | As above |
| `visited` | Title link visited | Title colour → `fg-secondary` (§6.3) |
| `stale-bank` | This bank's data >2 crawl cycles old (**contingent on PRD OQ-7**) | Adds a `warning` chip in the meta line: `Dữ liệu ngân hàng này cập nhật 3 ngày trước`. Nothing else changes — the row keeps full contrast (P1) |
| `expired` | Saved-jobs list only, source posting gone | Adds a `danger` chip `Không còn tuyển` **before** the title. Save button remains (user must be able to un-save). Title keeps full contrast. See §9.4 |

### 9.3 Chip / tag

Four variants. The variant is chosen by confidence tier (§3), never by aesthetics.

| Variant | Tier | Style | Example |
|---|---|---|---|
| `fact` | 2 | `bg-muted` · no border · `fg-strong` · `radius-full` · `px-2 py-1` · `text-xs` | `Hà Nội` |
| `inferred` | 3 | **transparent fill · `border border-dashed border-border-control`** · `fg-strong` · `radius-full` | `Chuyên viên` |
| `state-warning` | 5 | `warning-surface` · `border border-warning-border` · `warning` text · `radius-full` | `Dữ liệu cũ` |
| `state-danger` | 5 | `danger-surface` · `border border-danger-border` · `danger` text · `radius-full` | `Không còn tuyển` |

The `inferred` chip additionally carries `title` and `aria-description` = `Cấp bậc do hệ thống suy đoán từ tên vị trí` so the caveat travels with the value even out of context. It is **never** the accent colour — accent means "interactive", and an inference is not a claim you can act on.

Interactive filter pills are a different component (§9.7), not a chip variant.

### 9.4 Expired-job treatment — the anti-pattern that must not happen

The reflex is `opacity-50` on the card. **Banned.** `opacity-50` on `#171B23` over white yields roughly 8.6:1 — but on `fg-secondary` meta text it drops under 4.5:1 and fails AA, and it degrades the information the user explicitly asked to keep (FR-26). Lower opacity also fails greyscale-legibility for exactly the users most affected.

Instead:

| Element | Treatment |
|---|---|
| Card | Full contrast throughout. Border → `danger-border` |
| Above the title | `state-danger` chip: **`Không còn tuyển`** |
| Body of detail view | Notice: **`Tin tuyển dụng này không còn trên trang tuyển dụng của {Bank}. Nội dung dưới đây là bản đã lưu và có thể không còn chính xác.`** |
| Apply CTA | **Removed, not disabled.** A disabled button is exempt from contrast rules, invisible to some assistive tech, and still looks actionable. Replace it with static text: **`Tin này không còn nhận hồ sơ. Bạn có thể xem trang tuyển dụng của {Bank}.`** with a normal link to the bank's careers index (AC-26.3) |

**General rule this establishes: this product has no disabled buttons.** Where an action is unavailable, the control is replaced by an explanation. Cheaper to build, impossible to get wrong for contrast, and more informative.

### 9.5 Freshness indicator

The most trust-bearing element on the site (FR-11, G-2). Visible on the list view without scrolling (AC-11.3), so it sits directly under the search field.

| State | Condition (since last **successful** crawl, AC-11.2) | Treatment | String |
|---|---|---|---|
| `fresh` | ≤ 14h | Pill: `success-surface` · `success` text · 6px `success` dot | `Cập nhật 3 giờ trước` |
| `delayed` | 14h – 24h | Pill: `bg-muted` · `fg-strong` · `border-border-control` dot | `Cập nhật 18 giờ trước` |
| `stale` | > 24h | Full-width notice, `warning`, `alert-triangle` | `Dữ liệu chưa được cập nhật hơn 24 giờ. Bạn nên kiểm tra lại trên trang tuyển dụng của ngân hàng trước khi ứng tuyển.` |
| `unknown` | No successful crawl on record | Full-width notice, `warning` | `Chưa xác định được thời điểm cập nhật gần nhất.` |

The 14-hour threshold is the 12-hour cycle plus a 2-hour grace period, so a slightly late run does not flip the site into a warning state.

Rendered as `<p role="status">` so a client-side update is announced (WCAG 4.1.3). The machine-readable timestamp goes in `<time datetime="…">`; the visible text is the relative phrase.

### 9.6 Notice / banner

Inline, in the document flow. **No toasts** — a toast for a data-integrity message is a message the user can miss, and this product's notices are all things they must not miss.

| Variant | Surface / border / text | Icon | Used for |
|---|---|---|---|
| `info` | `accent-subtle` / `border` / `fg` | `info` | Coverage statement, uncovered-bank note |
| `warning` | `warning-surface` / `warning-border` / `warning` | `alert-triangle` | Stale data, partial crawl failure |
| `danger` | `danger-surface` / `danger-border` / `danger` | `alert-triangle` | Load failure, expired job |

Structure: `radius-md` · `p-3` · `border` · icon `20px` at top-left · text `text-sm` · optional action as an inline link, never a button. Not dismissible in v1 — a dismissed warning is a warning that has to be re-shown correctly on the next page, which is state nobody wants to maintain.

**Partial crawl failure** (the case that will actually occur) is a `warning` notice above the results:

> `3 ngân hàng chưa cập nhật trong lần quét gần nhất: Techcombank, ACB, MSB. Việc làm của các ngân hàng này có thể không còn chính xác.` [`Xem tình trạng dữ liệu`]

Names the banks — a candidate who only cares about Vietcombank can then ignore it entirely. A vague "some data may be outdated" makes every row suspect and is worse than saying nothing.

### 9.7 Filter controls

| Viewport | Pattern |
|---|---|
| < `lg` | Trigger button `Bộ lọc (2)` opens a **bottom sheet** — full-width, `radius-lg` top corners, `max-height: 85vh`, sticky footer with `Xoá bộ lọc` + `Xem 248 việc làm`. Bottom sheet, not a full-page modal, so results stay partly visible behind it. |
| ≥ `lg` | Sticky left column, filter groups always expanded, applying updates results immediately |

Filter option control: native `<input type="checkbox">` inside a `<label>`, styled with `accent-color: var(--color-accent)`. Native controls are keyboard-correct, screen-reader-correct, and free. Do not build custom checkboxes.

Minimum row height in the filter list: `44px` (§10.3).

**Active filter pills** sit above the results and are removable:

| State | Style |
|---|---|
| `default` | `accent-subtle` fill · `accent-strong` text (`8.96:1` ✅) · `radius-full` · `px-3 py-1.5` · trailing `close` icon |
| `hover` | `border-accent` added |
| `focus-visible` | Global ring |

Each pill is a `<button>` with `aria-label="Bỏ lọc: Hà Nội"`. A trailing `Xoá tất cả` text button clears everything.

**Filter state lives in the URL** so a filtered view is shareable and restorable (US-16) and server-rendered (NFR-15). Exact parameter naming is a technical concern — coordinate with `TECHNICAL_DESIGN.md`; the design requirement is only that every filter, the search query, and the page number are all recoverable from the URL alone.

**Standing note above the level filter group** (satisfies AC-9.1, and this is the correct place for it — at the moment of use):

> `Cấp bậc do hệ thống suy đoán từ tên vị trí, không phải thông tin ngân hàng công bố. Chọn "Chưa phân loại" để xem những tin không suy đoán được.`

### 9.8 Search input

| Property | Value |
|---|---|
| Height | `2.75rem` (44px), `text-base` (**16px is mandatory** — below 16px, iOS Safari zooms the page on focus and breaks the 360px layout) |
| Style | `bg` · `border border-border-control` (3.29:1 ✅) · `radius-md` · `pl-10` for the leading search icon |
| Focus | Global ring; border → `accent` |
| Placeholder | `fg-muted` (5.44:1 ✅) — `Tìm theo tên vị trí, ví dụ: chuyên viên tín dụng` |
| Semantics | `<form role="search">` wrapping `<input type="search" name="q">` with a visually-hidden `<label>` |
| Clear | `close` button appears at right when non-empty, `aria-label="Xoá từ khoá"`, 44×44 hit area |

Placeholder text is never the only label. A `<label>` exists in the DOM (visually hidden) because placeholders vanish on input and are skipped by some assistive tech (WCAG 3.3.2).

### 9.9 Buttons

| Variant | Style | Use |
|---|---|---|
| `primary` | `accent` fill · white text (7.35:1 ✅) · `radius-md` · weight 600 | Apply CTA, sheet confirm, sign in |
| `secondary` | `bg` fill · `border-border-control` · `fg` text · weight 500 | Filter trigger, cancel, secondary paths |
| `ghost` | Transparent · `accent` text | Tertiary text actions |

| State | Change |
|---|---|
| `hover` | primary → `accent-strong`; secondary → `bg-muted` |
| `active` | Same as hover, no transform |
| `focus-visible` | Global ring + `2px` offset. Verified: `accent` ring against the white offset gap = 7.35:1; the white gap against the `accent` fill = 7.35:1. Both clear 3:1, so the ring is visible on both light and accent-filled buttons. |
| `loading` | Label unchanged, `aria-busy="true"`, `aria-disabled="true"`; **stays focusable** |
| `disabled` | **Does not exist** — see §9.4 |

Sizes: `md` = 44px tall (default, all touch contexts), `sm` = 36px (desktop-only dense contexts, never the sole way to complete a task on mobile).

### 9.10 Apply CTA — the hand-off (FR-20)

The one place primary colour appears on the detail page.

- Label: **`Ứng tuyển trên trang {Bank}`** — names the destination in the label itself; the strongest available signal for AC-20.3.
- Trailing `external-link` icon, `aria-hidden`.
- `target="_blank" rel="noopener noreferrer"`, with a visually-hidden `(mở trang ngoài)` appended to the accessible name so screen-reader users are warned before activation.
- Helper line below, `text-sm`, `fg-muted`: **`Liên kết mở trang tuyển dụng của {Bank} trong tab mới. Hồ sơ được nộp trực tiếp cho ngân hàng.`**

That second sentence does double duty: it satisfies AC-20.3 and it states NG-3 (we never touch applications) at the exact moment the user might otherwise assume we do.

### 9.11 Save / follow toggles

Two-state toggles, not buttons that change meaning.

| Component | Off | On |
|---|---|---|
| Save job | `bookmark` outline, `fg-secondary`, `aria-pressed="false"`, label `Lưu` | `bookmark` filled, `accent`, `aria-pressed="true"`, label `Đã lưu` |
| Follow bank | `Theo dõi`, `secondary` button | `Đang theo dõi`, `secondary` + `check` icon + `accent` text |

Hit area 44×44 even where the glyph is 20px. Signed-out activation opens the sign-in path and **returns the user to their exact position afterwards** (PRD Flow B step 2) — the return URL, filters and scroll anchor must survive the round trip.

### 9.12 Empty and no-result states

Structure: `py-12` · centred · no illustration (P5) · heading `text-lg/600` · body `text-sm/fg-secondary` · one `secondary` action.

| Case | Heading | Body | Action |
|---|---|---|---|
| No results, filters applied | `Không có việc làm nào khớp với bộ lọc` | `Thử bỏ bớt bộ lọc hoặc dùng từ khoá ngắn hơn.` | `Xoá tất cả bộ lọc` |
| No results, search term | `Không tìm thấy việc làm nào cho "{query}"` | `Thử từ khoá ngắn hơn, ví dụ "tín dụng" thay vì "chuyên viên tín dụng doanh nghiệp".` | `Xoá từ khoá` |
| Query names an uncovered bank | `Trang này chưa thu thập việc làm của {Bank}` | See §9.13 | `Xem danh sách ngân hàng` |
| Saved jobs empty | `Bạn chưa lưu việc làm nào` | `Nhấn biểu tượng lưu trên một tin tuyển dụng để xem lại sau.` | `Xem việc làm mới nhất` |
| Followed banks empty | `Bạn chưa theo dõi ngân hàng nào` | `Theo dõi ngân hàng để lọc nhanh việc làm của họ.` | `Xem danh sách ngân hàng` |
| Whole list empty (data failure) | `Chưa tải được danh sách việc làm` | `Có thể do sự cố tạm thời. Vui lòng thử lại.` | `Thử lại` |

The last row is a genuine failure, not an empty state, and uses the `danger` notice styling — the user must be able to tell "there are no jobs" from "we are broken".

### 9.13 Coverage disclosure — the uncovered banks

Kept deliberately cheap: **one page plus one line in the footer**, no per-row treatment.

Footer line, on every page, `text-xs/fg-muted`:
> `Đang thu thập việc làm từ 13 ngân hàng.` [`Xem tình trạng dữ liệu`]

Coverage page (`/tinh-trang-du-lieu`) — a single table, no new components:

| Column | Content |
|---|---|
| Ngân hàng | `[TCB] Techcombank` |
| Cập nhật gần nhất | `3 giờ trước` / `Chưa cập nhật` |
| Số việc làm | `48` |
| Tình trạng | `fact` chip `Bình thường` / `state-warning` chip `Dữ liệu cũ` / `state-warning` chip `Chưa thu thập` |

Below the table, an `info` notice:

> `Hai ngân hàng chưa được thu thập: VIB (trang tuyển dụng chặn thu thập tự động) và Agribank (đăng thông báo tuyển dụng dạng văn bản, không phải tin đăng có cấu trúc). Bạn nên xem trực tiếp trên trang tuyển dụng của hai ngân hàng này.`

Stating the gap and the reason costs one paragraph and buys the credibility that a silently 13-of-15 list would quietly lose. This is also where the C-6 posture and the removal-request contact belong.

**Cheap high-value touch:** when a search query matches an uncovered bank's name (a 2-entry string check, no infrastructure), surface that same `info` notice above the empty state. A user who searches "VIB" and gets nothing otherwise concludes the site is broken.

### 9.14 Loading states

Because the site is server-rendered, the first paint has data. Loading states only matter for client-side filter and search transitions.

| Case | Treatment |
|---|---|
| First load, no data yet | 5 static skeleton cards — `bg-muted` blocks at real line positions, matching the real card height. **No shimmer** (§7.3). `role="status"` + visually-hidden `Đang tải danh sách việc làm` |
| Filter / search transition, previous results on screen | **Keep the old results at full contrast.** Show a 2px indeterminate `accent` bar under the search field. Set `aria-busy="true"` on the results region. Do not dim, do not blank, do not shift layout |
| Result count updating | `<p role="status">` announces `Tìm thấy 248 việc làm` |

Dimming stale-but-correct results is the common reflex and it is wrong here: it reduces contrast below AA and makes the fastest path (results were already right) feel slower than it is.

### 9.15 Pagination

`secondary`-styled numbered pagination, 20 results per page, `<nav aria-label="Phân trang">`. Current page marked `aria-current="page"` with `accent-subtle` fill.

Chosen over infinite scroll because the page must be server-rendered and individually addressable (NFR-15), the position must survive a round trip to a job detail and back, and infinite scroll needs client JS plus scroll restoration that one person will have to debug. `Trang 1 / 13` is stated in text for orientation.

### 9.16 Forms (auth only)

`<label>` above field (never a floating label — Vietnamese strings are long and float labels truncate), `text-sm/500`. Input as §9.8. Helper text `text-xs/fg-muted`. Error text `text-xs/danger` with `aria-describedby` and `aria-invalid="true"` on the field; the field border becomes `danger-border`, and an `alert-triangle` icon accompanies it (colour is never alone).

`autocomplete="email"` / `"current-password"` / `"new-password"` are mandatory (WCAG 1.3.5, AA).

---

## 10. Accessibility baseline

### 10.1 Standard

**WCAG 2.1 Level AA** (PRD NFR-10). Where a WCAG 2.2 or AAA criterion is adopted anyway it is marked as such below, so the actual conformance claim stays accurate.

### 10.2 Focus visibility (2.4.7 AA, 1.4.11 AA)

One global `:focus-visible` rule (§8): `2px solid var(--color-accent)` with `2px` offset. Verified at **7.35:1** against white and **6.91:1** against `bg-subtle` — both far past the 3:1 requirement. The offset gap is what makes it visible on accent-filled buttons.

**`outline: none` without a replacement is banned.** If a component needs a different focus treatment, it changes the ring's colour or offset, never removes it.

### 10.3 Target size

WCAG 2.1 AA contains **no** target-size criterion (2.5.5 is AAA; the 24px minimum is WCAG 2.2 AA). We hold **44×44 CSS px** as a product rule regardless, because the primary device is a phone and the primary action is a precise tap in a dense list. Hit area may exceed the visual glyph via padding or a pseudo-element.

### 10.4 Contrast (1.4.3 AA, 1.4.11 AA)

Every pairing in §6.2 is computed and recorded. Additional standing rules:

- No text over an image, ever (there are no images — P5).
- `opacity` is never used to de-emphasise text (§9.4).
- Placeholder text meets 4.5:1 (`fg-muted`, 5.44:1) — it is not exempt.

### 10.5 Reflow and text spacing (1.4.10 AA, 1.4.12 AA)

- No two-dimensional scrolling at **320px** (stricter than NFR-9's 360px).
- No fixed-height text container. `line-clamp` is height-based and safe, but a `h-10` on a chip containing Vietnamese will clip at 200% text spacing — use padding, never height, on anything containing text.
- Layout must survive `line-height: 1.5`, `letter-spacing: 0.12em`, `word-spacing: 0.16em` applied by the user.
- Must survive 200% browser zoom at 360px (1.4.4 AA).

### 10.6 Semantics and structure

- `<html lang="vi">`. Job content from a bank is still Vietnamese; if a bank publishes an English title, wrap it `<span lang="en">`.
- Landmarks: `<header>`, `<nav>`, `<main>`, `<aside>` (filters), `<footer>`. One `<main>` per page.
- One `<h1>` per page. No level skipping. A result card title is `<h3>` under an `<h2>` results heading (which may be visually hidden).
- The result list is `<ul>` / `<li>` — screen readers then announce "list, 20 items", which is exactly the orientation a scan needs.
- Skip link (`Bỏ qua, tới danh sách việc làm`) as the first focusable element, visually hidden until focused.

### 10.7 Status messages (4.1.3 AA) — the criterion this product most depends on

Every one of these must be announced without moving focus:

| Change | Mechanism |
|---|---|
| Result count after filter/search | `<p role="status">Tìm thấy 248 việc làm</p>` |
| Freshness indicator update | `role="status"` on the pill |
| Save / unsave confirmation | `role="status"`, `Đã lưu việc làm` |
| Filter applied / removed | Covered by the result-count announcement — do not add a second live region, or the two will interrupt each other |
| Load error | `role="alert"` (assertive — this one interrupts) |

`role="alert"` is used **once**, for genuine failures. Everything else is `role="status"` (polite).

### 10.8 Keyboard

Tab order follows DOM order: skip link → search → filter trigger → active filter pills → result 1..n → pagination. One tab stop per result card (the title; the save button is a second, intentional stop). The bottom sheet traps focus while open, closes on `Esc`, and returns focus to the trigger.

### 10.9 What to test, concretely

1. Keyboard-only pass through search → filter → open a job → apply, at 360px.
2. 320px reflow check.
3. 200% zoom check.
4. Greyscale screenshot: every state still distinguishable.
5. Axe or Lighthouse pass on list, detail, saved jobs, and the empty/stale/error variants — **not just the happy path**.
6. VoiceOver or TalkBack pass with `lang="vi"` to confirm Vietnamese pronunciation.

---

## 11. Content and voice

### 11.1 Register

Plain, factual, neutral Vietnamese. This is a public utility, not a marketing site.

- Address the user as `bạn` where a pronoun is needed. **Not** `Quý khách` (commercial, implies a service relationship we do not have) and **not** `Anh/Chị` (assumes a register that does not fit a free tool).
- No exclamation marks. No `Rất tiếc`, no `Oops`, no apology theatre.
- Errors state **what happened** and **what to do**, in that order, in one or two sentences.
- Never claim more than we know. `Có thể không còn chính xác` is correct; `Tất cả việc làm mới nhất` is not.
- Never editorialise about a bank.

### 11.2 Capitalisation

**Sentence case everywhere.** Vietnamese capitalises the first word and proper nouns only.

- ✅ `Xoá tất cả bộ lọc` · `Ngày đăng` · `Ứng tuyển trên trang Techcombank`
- ❌ `Xoá Tất Cả Bộ Lọc` (English title case, common and wrong in Vietnamese)
- ❌ `BỘ LỌC` (see §5.4)

Bank names use the bank's own casing: `Vietcombank`, `BIDV`, `VietinBank`, `MB`, `VPBank`, `ACB`, `SHB`, `HDBank`, `TPBank`, `MSB`, `LPBank`, `Techcombank`, `Sacombank`.

### 11.3 Dates and times

| Context | Format | Examples |
|---|---|---|
| Crawl freshness (minute/hour scale) | Relative | `Vừa cập nhật` (<5 min) · `Cập nhật 42 phút trước` · `Cập nhật 3 giờ trước` · `Cập nhật 2 ngày trước` |
| Posted date (day scale) | Relative to 30 days, then absolute | `Hôm nay` · `Hôm qua` · `3 ngày trước` · `2 tuần trước` · then `12/07/2026` |
| Absolute date | `dd/MM/yyyy` | `12/08/2026` — never `08/12/2026`, never `2026-08-12` in the UI |
| Time | 24-hour | `14:30` |
| Unknown posted date | `Chưa rõ ngày đăng` | Never blank, never today's date |

Every relative string is paired with `<time datetime="2026-08-12T14:30:00+07:00">` so the exact value is machine-readable and available on hover.

Timezone is `Asia/Ho_Chi_Minh` (UTC+7) for all user-facing formatting. Relative dates must be computed server-side against that timezone or the "Hôm nay" boundary will be wrong for evening visitors.

### 11.4 Numbers

Vietnamese convention: **`.` for thousands, `,` for decimals.** Use `Intl.NumberFormat('vi-VN')`.

- ✅ `1.248 việc làm` · `Tìm thấy 248 việc làm`
- ❌ `1,248 việc làm` (English convention — will look like 1.248 to a Vietnamese reader)

Vietnamese has no plural inflection, so `1 việc làm` / `248 việc làm` need no pluralisation logic. Do not build any.

### 11.5 Place names

| Rule | Detail |
|---|---|
| Long form | `TP. Hồ Chí Minh`, `Hà Nội`, `Đà Nẵng`, `Cần Thơ`, `Hải Phòng` — used in filter lists and on the detail page |
| Short form | `TP.HCM` only in the card meta line, where width is tight |
| Nationwide | `Toàn quốc` — a real value, not an absence |
| Unknown | `Chưa rõ địa điểm` — an absence, `fg-muted` |
| Multiple (per PRD OQ-4's collapse default) | `Hà Nội +2` in the card; full list on the detail page. The `+n` is part of the same text node, never a separate chip |

### 11.6 Reusable strings

These are the canonical forms. Reuse them verbatim rather than writing near-variants.

| Key | String |
|---|---|
| Search placeholder | `Tìm theo tên vị trí, ví dụ: chuyên viên tín dụng` |
| Result count | `Tìm thấy 248 việc làm` |
| Freshness | `Cập nhật 3 giờ trước` |
| Stale warning | `Dữ liệu chưa được cập nhật hơn 24 giờ. Bạn nên kiểm tra lại trên trang tuyển dụng của ngân hàng trước khi ứng tuyển.` |
| Inference note (long) | `Cấp bậc do hệ thống suy đoán từ tên vị trí, không phải thông tin ngân hàng công bố.` |
| Inference note (short, chip) | `Cấp bậc suy đoán` |
| Uncategorized level | `Chưa phân loại` |
| Unknown city | `Chưa rõ địa điểm` |
| Unknown date | `Chưa rõ ngày đăng` |
| No description | `Ngân hàng không đăng mô tả chi tiết. Xem tin gốc trên trang của ngân hàng để biết thêm.` |
| Apply CTA | `Ứng tuyển trên trang {Bank}` |
| Apply helper | `Liên kết mở trang tuyển dụng của {Bank} trong tab mới. Hồ sơ được nộp trực tiếp cho ngân hàng.` |
| Expired chip | `Không còn tuyển` |
| Expired explanation | `Tin tuyển dụng này không còn trên trang tuyển dụng của {Bank}. Nội dung dưới đây là bản đã lưu và có thể không còn chính xác.` |
| Save / saved | `Lưu` / `Đã lưu` |
| Follow / following | `Theo dõi` / `Đang theo dõi` |
| Sign-in prompt | `Đăng nhập để lưu việc làm này` |
| Filters | `Bộ lọc` · `Địa điểm` · `Cấp bậc` · `Ngày đăng` · `Ngân hàng` |
| Date filter options | `7 ngày qua` · `14 ngày qua` · `30 ngày qua` · `Tất cả` |
| Clear filters | `Xoá bộ lọc` / `Xoá tất cả bộ lọc` |
| Sheet confirm | `Xem 248 việc làm` |
| Load error | `Không tải được danh sách việc làm. Vui lòng thử lại.` |
| Retry | `Thử lại` |
| Coverage footer | `Đang thu thập việc làm từ 13 ngân hàng.` + `Xem tình trạng dữ liệu` |
| Skip link | `Bỏ qua, tới danh sách việc làm` |

**Level labels are exactly as PRD FR-7 — do not paraphrase:**
`Thực tập sinh` · `Nhân viên` · `Chuyên viên` · `Chuyên viên cao cấp` · `Trưởng phòng / Trưởng bộ phận` · `Giám đốc` · `Chưa phân loại`

### 11.7 What never appears in the interface

Direct consequences of the PRD's non-goals; listed so they are not accidentally designed in later:

- Any salary figure or salary range (NG-5)
- Any file input, upload control, or application form (NG-3, AC-20.2)
- Any English interface string, including in errors and empty states (NG-4, AC-27.1)
- Any alert, subscribe, or notification affordance (NG-2, AC-25.3)
- Any personalised or "recommended for you" ranking (NG-8)
- Any login wall, teaser, or content gated behind an account (NG-10, AC-21.2)

---

## 12. Anti-patterns

Reflexes that will produce a worse product here. Each has caused a real failure in comparable interfaces.

| Anti-pattern | Why it fails here |
|---|---|
| `opacity-50` to de-emphasise expired or stale content | Fails AA on secondary text and hides information the user asked to keep (§9.4) |
| Bank brand colours or logos | Consumes the trust channel (P3) and invites the R-5 objection (§9.1) |
| Pre-selecting any filter by default | Violates P1 — a default filter hides jobs before the user has made a choice |
| Level rendered as a solid chip identical to city | Presents a guess as a fact; breaks FR-9 |
| `leading-tight` on Vietnamese | Clips stacked diacritics (§5.2) |
| `uppercase` on Vietnamese labels | Clips marks and slows reading (§5.4) |
| Toast notifications for data-quality messages | Missable; these messages must not be missable (§9.6) |
| Blanking or dimming results during a filter change | Reduces contrast, feels slower than doing nothing (§9.14) |
| Skeleton shimmer animation | Battery and jank cost on low-end Android for zero information (§7.3) |
| Infinite scroll | Breaks URL addressability (NFR-15) and back-navigation position (§9.15) |
| Disabled buttons | Contrast-exempt, ambiguous, less informative than an explanation (§9.4) |
| Placeholder as the only label | Vanishes on input; fails 3.3.2 (§9.8) |
| Search input below 16px | Triggers iOS auto-zoom and breaks the 360px layout (§9.8) |
| Filter state held only in React state | Kills sharing (US-16) and server rendering (NFR-15) (§9.7) |
| Adding a second token set via a component library | Two palettes drift; contrast guarantees become unverifiable (§8) |

---

## 13. Assumptions and PRD collisions

### 13.1 Collisions with `PRD.md` v0.1 — for the product owner to resolve

| # | Collision | This document assumes | Why it matters |
|---|---|---|---|
| **C-D1** | PRD FR-2 requires exactly **15** banks including Agribank and VIB. The design brief states **13**, with VIB (blocks crawlers) and Agribank (unstructured announcements) deliberately excluded. | Designed for **13 covered banks**, with an explicit public coverage statement naming the two exclusions and the reason (§9.13). | Not a design decision. It changes FR-2, AC-2.1, the §5 coverage metric (15/15), and the G-1 coverage claim. **The PRD needs updating either way** — the design merely stops the gap being invisible. |
| **C-D2** | WCAG 2.1 **1.4.10 Reflow** (AA, required by NFR-10) mandates no 2-D scrolling at **320px**. NFR-9 states 360px. | Build to **320px**. | The two requirements are not in conflict so much as NFR-9 being the looser of the two; meeting NFR-10 automatically satisfies NFR-9. Worth stating so nobody stops testing at 360. |

### 13.2 Design assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-D1 | Primary device is a mid-range Android phone, ~360×800, 4G, in Vietnam | Layout baseline shifts; nothing structural changes |
| A-D2 | The sector's 3-letter stock tickers are recognised by a meaningful share of the audience, and the full bank name always carries the meaning for those who do not recognise them | Badge becomes decorative rather than a scan aid — costs nothing, still no logos |
| A-D3 | No brand assets, logo, or name exist yet (PRD OQ-1 open) | The header wordmark is plain text and any name drops in without redesign |
| A-D4 | Job counts per bank are in the tens, total in the hundreds (PRD §5: ≥200) | Above ~5,000, pagination alone becomes insufficient and a sort control (OQ-D6) becomes necessary |
| A-D5 | Bank descriptions arrive as plain text or simple HTML, not rich layouts | The detail page needs a sanitised-HTML prose style; that is a screen-spec concern, flagged here |
| A-D6 | Users on this site are scanning, not reading — median session is a handful of rows and one or two click-outs | If sessions turn out to be long and comparison-driven, a comparison view becomes worth considering post-v1 |

---

## 14. Open questions

None of these blocks the build; each has a recommended default that should be treated as a recommendation, not a decision.

| # | Question | Recommended default | Blocks |
|---|---|---|---|
| **OQ-D1** | Product name and header wordmark (depends on PRD OQ-1) | Plain text wordmark, `text-lg/600/fg`, no logotype, no icon. Any name drops in with no redesign | Launch polish only |
| **OQ-D2** | Bank coverage: 13 or 15? (see C-D1) | 13, with the coverage statement in §9.13 | PRD FR-2, §5 metrics, coverage page |
| **OQ-D3** | Show per-bank staleness to users? (PRD OQ-7) | Yes, at the cheapest level: the coverage-page table (§9.13) plus a `state-warning` chip on cards from a bank stale >2 cycles. Honest degradation beats a silently incomplete list (R-7) | Card `stale-bank` variant |
| **OQ-D4** | Visited-link treatment: neutral or conventional purple? | Neutral `fg-secondary` (§6.3) — keeps P3 intact. Purple is more instantly recognisable but adds a sixth hue to a palette whose whole discipline is that colour means state | Card styling |
| **OQ-D5** | Pagination vs. "load more" vs. infinite scroll | Numbered pagination, 20 per page (§9.15) — server-renderable, addressable, no scroll-restoration bugs | List screen spec |
| **OQ-D6** | Any user-facing sort control? PRD FR-12 specifies newest-first only | No sort control in v1. Fixed newest-first. A relevance sort is meaningless without ranking signal (NG-8), and adding a control we cannot populate well costs trust | List screen spec |
| **OQ-D7** | Vietnamese URL slugs and query-parameter naming | Vietnamese path segments (`/viec-lam/…`, `/tinh-trang-du-lieu`) for SEO and legibility; parameter naming is a technical decision — coordinate with `TECHNICAL_DESIGN.md`. The design requirement is only that all filter state is URL-recoverable (§9.7) | Routing |
| **OQ-D8** | Webfont: stay on the system stack, or adopt Be Vietnam Pro? | System stack for v1 (§5.1). Revisit only if brand identity becomes a launch requirement and the 3s budget still has room | v2 |
| **OQ-D9** | Dark mode timing | Not in v1 (§6.1). Tokens are already semantic, so v2 is a token-value swap plus one contrast re-verification pass | v2 |
| **OQ-D10** | Should a row link to the bank's apply page directly, skipping our detail page? | No — always route through the detail page. It is the only place the inference caveat, the missing-field honesty and the hand-off warning can be stated, and NFR-15 requires the detail page to exist and be indexed anyway | List screen spec |

---

## 15. Next deliverables

Screen specifications, in build order (P2 → P3 of the PRD rollout), each as `docs/screens/<name>.md`:

1. `danh-sach-viec-lam` — list, search, filters. The screen the whole product lives or dies on.
2. `chi-tiet-viec-lam` — job detail and hand-off.
3. `tinh-trang-du-lieu` — coverage and data status.
4. `viec-lam-da-luu` — saved jobs, including the expired treatment.
5. `ngan-hang-theo-doi` — followed banks.
6. `dang-nhap` / `dang-ky` — auth.
