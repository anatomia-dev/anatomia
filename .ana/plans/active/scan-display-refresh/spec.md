# Spec: Scan Display Refresh

**Created by:** AnaPlan
**Date:** 2026-05-23
**Scope:** .ana/plans/active/scan-display-refresh/scope.md

## Approach

Three independent fixes across three surfaces — terminal, README, website. All are display/content changes with no behavioral impact on the scan engine.

**Terminal box alignment** — two bugs on lines 147 and 150 of `packages/cli/src/commands/scan.ts`:

1. **Name line (line 147):** `nameWithShape.padEnd(innerWidth)` miscounts because `chalk.dim(shape)` embeds ANSI escape codes (`\x1b[2m...\x1b[22m` = 9 invisible characters). `padEnd` sees the string as 9 chars longer than it appears, so it adds insufficient padding. Fix: compute the visible width from the already-known components (`2 + projectName.length + Math.max(1, namePad) + shape.length`) and manually append trailing spaces to reach `innerWidth`. Do not use `padEnd` on ANSI-containing strings.

2. **Summary line (line 150):** The summary string can exceed `innerWidth` (69) when database display is long AND it's a monorepo. Example: `"  TypeScript · Next.js · Prisma → PostgreSQL (100 models) · 113 packages"` = 72 visible chars. `padEnd(69)` adds nothing — the string is already longer. Fix: when building `summaryParts`, drop the package count from the summary if including it would cause `summaryPadded` to exceed `innerWidth`. The package count is redundant — it's already shown in the Workspace line below. If the summary STILL overflows after dropping packages (extremely long database display), truncate with `…` to fit.

**README example** — replace the `my-saas-app` fictional scan at lines 17-46 with a real-world example based on inbox-zero. The example must show:
- A monorepo project header with shape badge
- Full stack detection including database with models, auth, AI, payments, testing
- A Surfaces section with 2-3 surfaces showing framework annotations
- Intelligence section with activity, hot files, docs, pre-commit
- Correct box alignment at 71 chars wide

**Website ScanSlab** — replace the papermark mock with an inbox-zero-based monorepo mock. Changes are content-only within the existing JSX structure:
- Update terminal header path from `~/work/papermark` to `~/work/inbox-zero`
- Update project header card: name → `inbox-zero`, shape → `web-app`, summary → TypeScript · Next.js · Prisma → PostgreSQL (63 models)
- Update Stack grid: add Testing row (`Vitest`), update Auth to `Better Auth`, update AI to show `Vercel AI · OpenAI`, keep Payments as `Stripe`
- Add a Surfaces section between Stack and Intelligence, following the same grid pattern
- Update Intelligence: change hot files to realistic inbox-zero files, update contributor count
- Replace the "⚠ No test framework" warning with a positive testing indicator or remove the warning entirely
- Update footer CTA to reference inbox-zero's stack
- Keep all visual styling identical — inline styles, colors, spacing, component structure

## Output Mockups

### Terminal box — fixed alignment

```
┌─────────────────────────────────────────────────────────────────────┐
│  inbox-zero                                                web-app │
│  TypeScript · Next.js · Prisma → PostgreSQL (63 models)             │
└─────────────────────────────────────────────────────────────────────┘
```

Note: the `│` on the right side of both content lines aligns with the `┐` and `┘`. The shape text `web-app` is dim. The box is exactly 71 characters wide.

### Terminal box — long summary truncation

When the summary would overflow (e.g., cal.com with 100 models + 113 packages), the package count is dropped because it's shown in the Workspace line:

```
┌─────────────────────────────────────────────────────────────────────┐
│  calcom-monorepo                                           web-app │
│  TypeScript · Next.js · Prisma → PostgreSQL (100 models)            │
└─────────────────────────────────────────────────────────────────────┘
```

### README scan example

```
┌─────────────────────────────────────────────────────────────────────┐
│  inbox-zero                                                web-app │
│  TypeScript · Next.js · Prisma → PostgreSQL (63 models)             │
└─────────────────────────────────────────────────────────────────────┘

  Stack
  ─────
  Language     TypeScript
  Framework    Next.js
  Database     Prisma → PostgreSQL (63 models)
  Auth         Better Auth
  AI           Vercel AI · OpenAI
  Payments     Stripe
  Testing      Vitest
  UI           Tailwind CSS
  Services     Resend · Sentry · PostHog · Upstash (+2 more)
  Deploy       Vercel · GitHub Actions

  Surfaces
  ────────
  web          Next.js · Vitest
  api          TypeScript · Vitest
  cli          TypeScript

  Intelligence
  ────────────
  Activity     7 contributors · 22→18→25→19 weekly
  Hot files    clean.ts (14), ai-categorize.ts (11), schema.prisma (9)
  Docs         README.md · CONTRIBUTING.md · .env.example + 2 more
  Pre-commit   typecheck + lint

  Run `ana init` to scaffold 8 skills (5 core + ai-patterns, data-access, api-patterns)
```

## File Changes

### `packages/cli/src/commands/scan.ts` (modify)
**What changes:** Fix box alignment on lines 147 and 150. Line 147: replace `nameWithShape.padEnd(innerWidth)` with explicit trailing space calculation using the known visible width. Line 150: add overflow protection before `padEnd` — drop the package count from `summaryParts` when including it would cause overflow, and truncate with `…` as a last resort.
**Pattern to follow:** The existing `namePad` calculation at line 143 already computes the correct visible spacing. Extend this pattern to also handle trailing padding.
**Why:** The right border `│` misaligns with the top border `┐`, breaking the terminal box visual on projects with shapes or long summaries.

### `README.md` (modify)
**What changes:** Replace lines 17-46 (the `my-saas-app` scan example) with an inbox-zero monorepo example showing surfaces, modern stack detection, and correct box alignment. The surrounding text ("No install. One command. Here's what you'll see:") stays.
**Pattern to follow:** Same code block format, same box-drawing characters, same indentation.
**Why:** The current example shows a fictional single-package project with no surfaces — it doesn't represent what the product actually produces.

### `website/components/scan/ScanSlab.tsx` (modify)
**What changes:** Replace all hardcoded papermark content with inbox-zero content. Add a Surfaces section between Stack and Intelligence. Remove the "⚠ No test framework" warning. Update footer CTA.
**Pattern to follow:** The Stack grid at lines 74-87 — same `gridTemplateColumns: "92px 1fr"`, same inline style patterns, same color values (`#67e8f9` for values, `rgba(255,255,255,0.55)` for labels, `rgba(255,255,255,0.45)` for separators).
**Why:** The current mock shows papermark (0 surfaces, no tests detected) — the worst possible first impression after surfaces and testing detection shipped.

## Acceptance Criteria

- [ ] AC1: Terminal header box right border `│` aligns with top border `┐` on BOTH the name line AND the summary line, for all tested repos including long summaries (verified on at least: `root`/`full-stack`, `anatomia-workspace`/`cli`, `inbox-zero`/`web-app`, `calcom-monorepo`/`web-app` with `Prisma → PostgreSQL (100 models) · 113 packages`).
- [ ] AC2: The README scan example shows a monorepo with surfaces. The Surfaces section is visible in the example. The stack includes at minimum: framework, database with models, auth, AI, payments, testing, UI.
- [ ] AC3: The README example uses `inbox-zero` as the project name.
- [ ] AC4: The website ScanSlab terminal mock shows a monorepo scan with a Surfaces section listing 2-3 surfaces with framework annotations.
- [ ] AC5: The website ScanSlab does NOT show "⚠ No test framework" — it shows positive testing detection.
- [ ] AC6: The website ScanSlab stack section includes AI and testing fields.
- [ ] AC7: The website ScanSlab maintains the existing visual design — colors, spacing, typography, component structure unchanged. Only data content changes.
- [ ] AC8: The README box example has correct alignment (no border misalignment in the markdown code block).
- [ ] AC9: Tests pass with `pnpm run test -- --run`.
- [ ] AC10: No build errors.

## Testing Strategy

- **Unit tests:** Add a test to `scan.test.ts` that verifies box alignment when the name line contains a shape (ANSI codes). The test should construct a project with a detected shape, run the scan with `FORCE_COLOR=0`, and verify the name line length matches `boxWidth`. Add a test for summary overflow — construct a project with a long database display + monorepo packages that would exceed `innerWidth`, verify the output still renders correctly.
- **Integration tests:** Not needed — the README and ScanSlab changes are content-only.
- **Edge cases:** Summary line exactly at `innerWidth` (should work with no truncation). Summary line 1 char over (should drop packages). Summary with no packages but still overflowing (should truncate with `…`).

## Dependencies

None. All three changes are independent.

## Constraints

- Box width is hardcoded at 71 characters. Do not change this.
- `innerWidth` is 69 (boxWidth - 2 for the `│` borders).
- The website ScanSlab uses inline styles exclusively — do not introduce utility classes for colors or spacing.
- JSX text must use `&apos;` for apostrophes (lint rule: `react/no-unescaped-entities`).

## Gotchas

- **`chalk.bold()` wraps the whole name line.** The ANSI issue is from the inner `chalk.dim(shape)`, not the outer `chalk.bold()`. The outer bold is applied AFTER padding is computed, so it doesn't affect the visible width calculation. The fix targets the inner dim codes only.
- **`FORCE_COLOR=0` in tests.** The existing scan tests disable color output, which means the ANSI padding bug is invisible in tests. The new alignment test should verify structural correctness (line length) rather than ANSI character counting. The test uses `FORCE_COLOR=0` so `padEnd` works correctly — the test verifies the FIX works, not that it reproduces the bug.
- **ScanSlab inline styles use specific rgba values.** Don't introduce new color values. Reuse: `#67e8f9` (cyan values), `var(--color-brand)` (green accents), `rgba(255,255,255,0.55)` (labels), `rgba(255,255,255,0.45)` (separators/dim text), `#fbbf24` (yellow/warning).
- **README box alignment in markdown.** The box-drawing characters are all single-width. Count characters carefully — each line inside the box must be exactly 71 characters including the `│` borders.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- In JSX text content, use `&apos;` for apostrophes.
- Use `import type` for type-only imports, separate from value imports.
- Prefer named exports. No default exports.
- Explicit return types on all exported functions.
- Engine files have zero CLI dependencies — but scan.ts is in `src/commands/`, so chalk/ora are fine.

### Pattern Extracts

**Name line construction (scan.ts lines 142-147) — the code to fix:**
```typescript
  // Render box
  const namePad = innerWidth - projectName.length - shape.length - 4;
  const nameWithShape = `  ${projectName}${' '.repeat(Math.max(1, namePad))}${chalk.dim(shape)}`;

  lines.push(chalk.cyan(BOX.topLeft + BOX.horizontal.repeat(innerWidth) + BOX.topRight));
  lines.push(chalk.cyan(BOX.vertical) + chalk.bold(nameWithShape.padEnd(innerWidth)) + chalk.cyan(BOX.vertical));
```

**Summary line construction (scan.ts lines 148-151) — the code to fix:**
```typescript
  if (summaryLine) {
    const summaryPadded = `  ${summaryLine}`;
    lines.push(chalk.cyan(BOX.vertical) + summaryPadded.padEnd(innerWidth) + chalk.cyan(BOX.vertical));
  }
```

**ScanSlab Stack grid (ScanSlab.tsx lines 72-87) — pattern for the new Surfaces section:**
```tsx
            {/* Stack group */}
            <div className="mt-4">
              <div className="mb-1.5 text-[10.5px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>Stack</div>
              <div className="grid gap-y-0.5" style={{ gridTemplateColumns: "92px 1fr" }}>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>Auth</span>
                <span><span style={{ color: "#67e8f9" }}>NextAuth</span></span>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>AI</span>
                <span><span style={{ color: "#67e8f9" }}>Anthropic</span> <span style={{ color: "rgba(255,255,255,0.45)" }}>·</span> <span style={{ color: "#67e8f9" }}>OpenAI</span></span>
              </div>
            </div>
```

### Proof Context
- `scan.ts`: `formatHumanReadable` is not exported — display tested structurally via CLI output, not by calling the function directly. Tests run the built CLI with `FORCE_COLOR=0`.
- `README.md`: No relevant active findings.
- `ScanSlab.tsx`: No active proof findings.

### Checkpoint Commands
- After scan.ts fix: `(cd 'packages/cli' && pnpm vitest run)` — Expected: 2903+ tests pass
- After all changes: `pnpm run test -- --run` — Expected: 2903+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2903 passed, 2 skipped across 122 test files
- Command used: `pnpm run test -- --run`
- After build: expected 2905+ tests (2-3 new alignment tests) in 122 files
- Regression focus: `packages/cli/tests/commands/scan.test.ts` — existing box/header tests
