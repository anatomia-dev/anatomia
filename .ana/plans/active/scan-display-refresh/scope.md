# Scope: Scan Display Refresh

**Created by:** Ana
**Date:** 2026-05-23

## Intent

Three display surfaces show the scan output — the terminal, the README, and the website. All three have issues:

1. **Terminal box alignment bug.** The header box's right border `│` doesn't align with the top border `┐`. The shape text (`web-app`, `cli`, `full-stack`) and right border extend past the box edge. Root cause: `padEnd(innerWidth)` on a string containing `chalk.dim()` ANSI escape codes — `padEnd` counts invisible escape codes as visible characters, so it adds insufficient or zero padding.

2. **README example is outdated.** Shows a fictional `my-saas-app` single-package scan with no surfaces, no workspace info. Written before surfaces, backend detection, and monorepo intelligence shipped. A developer reading the README sees a scan that doesn't represent the current product.

3. **Website ScanSlab is outdated.** Shows papermark (single-package, 0 surfaces, "⚠ No test framework" warning). Written before the R5/R6 fixes. The first impression for a website visitor is a scan without surfaces and a testing warning — the opposite of what the product now delivers. The current product detects surfaces, backend services, testing frameworks, and produces a rich monorepo view. None of this is visible to someone visiting the site.

## Complexity Assessment

- **Kind:** chore
- **Size:** small — 1 code fix (~5 lines), 2 content rewrites (README markdown + website JSX)
- **Surface:** cross-surface
- **Files affected:**
  - `packages/cli/src/commands/scan.ts` — box alignment fix (line 147)
  - `README.md` — scan example replacement (lines 17-46)
  - `website/components/scan/ScanSlab.tsx` — terminal mock content update (lines 44-114)
- **Blast radius:** Minimal. The terminal fix is a padding calculation — no behavioral change. The README and website changes are content-only — no code logic changes.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

**Terminal fix:** Replace `nameWithShape.padEnd(innerWidth)` with explicit trailing padding calculated from the known visible width. The visible width is already computed at line 143 (`namePad = innerWidth - projectName.length - shape.length - 4`). Add trailing spaces explicitly instead of relying on `padEnd` which can't account for ANSI escape codes. One-line change.

**README:** Replace the `my-saas-app` example with a real-world monorepo scan that shows surfaces. Use inbox-zero as the reference — it's the A+ repo, perfect sniper profile (Next.js, Prisma 63 models, Better Auth, Stripe, Vercel AI, 3 surfaces). Show the exact terminal output a developer would see, including the Surfaces section with framework annotations. Keep the same format (code block in markdown). The example should make a developer think "that looks like my project."

**Website ScanSlab:** Replace the papermark mock content with a monorepo mock based on inbox-zero. Update the project header (name, shape, stack summary), the Stack grid (add AI, update auth), add a Surfaces section between Stack and Intelligence, update Intelligence to show positive detection (tests found, not "no tests"), and update the footer CTA. The visual design (colors, spacing, layout) stays identical — only the text/data content changes. The mock remains hardcoded JSX — it's a marketing display, not a live scan.

## Acceptance Criteria

- AC1: The terminal header box right border `│` aligns with the top border `┐` for project names and shapes of all tested lengths (verified on at least: `root`/`full-stack`, `anatomia-workspace`/`cli`, `inbox-zero`/`web-app`, `helicone-monorepo`/`web-app`).
- AC2: The README scan example shows a monorepo with surfaces. The Surfaces section is visible in the example. The stack includes at minimum: framework, database with models, auth, AI, payments, testing, UI.
- AC3: The README example does not use a fictional project name — it uses a real or realistic-looking project name that a developer would recognize as representative.
- AC4: The website ScanSlab terminal mock shows a monorepo scan with a Surfaces section listing 2-3 surfaces with framework annotations.
- AC5: The website ScanSlab does NOT show "⚠ No test framework" — it shows positive testing detection.
- AC6: The website ScanSlab stack section includes AI and testing fields (showing the product detects these).
- AC7: The website ScanSlab maintains the existing visual design — colors, spacing, typography, component structure unchanged. Only data content changes.
- AC8: The README box example has correct alignment (no border misalignment in the markdown code block).

## Edge Cases & Risks

**README authenticity:** Using `inbox-zero` by name ties the README to a specific third-party project. If inbox-zero changes significantly, the example becomes stale. Alternative: use a composite name like `acme-platform` with realistic data derived from real scans. Risk is low either way — the example is a static code block, not a live output.

**Website ScanSlab monorepo data:** The current mock is for a single-package project. Adding a Surfaces section requires a new JSX block between Stack and Intelligence. The layout should accommodate this without breaking the responsive grid. The existing spacing pattern (`mt-4` between groups) should be followed.

**Terminal fix scope:** The fix only touches the name+shape line (line 147). The summary line below (line 150) uses `summaryPadded.padEnd(innerWidth)` but `summaryPadded` has no ANSI codes — it's plain text. No fix needed there. However, Plan should verify this assumption.

## Rejected Approaches

**Using `stripAnsi` + `padEnd` for the terminal fix.** Importing a strip-ansi library to calculate visible width is over-engineering. The visible width is already known from the padding calculation at line 143. Explicit trailing spaces are simpler and have zero dependencies.

**Making the website scan mock dynamic (reading from scan.json).** The ScanSlab is a marketing component. Hardcoded content is intentional — it's curated to show the best possible first impression, not a live scan. Dynamic content would add build complexity and reduce control over the presentation.

**Showing a monorepo with 5+ surfaces on the website.** Too much visual noise for a first impression. 2-3 surfaces is the sweet spot — enough to show the feature exists, not so many that it overwhelms.

## Open Questions

None. The scope is narrow and the approach is clear.

## Exploration Findings

### Patterns Discovered

- `scan.ts:143-147`: The padding calculation at line 143 correctly computes `namePad` for the visible width. The bug is that this correct calculation is then undermined by `padEnd` on line 147 which re-counts including ANSI codes. The fix is to use the already-correct `namePad` to also compute trailing padding.
- `scan.ts:150`: `summaryPadded` is plain text (no chalk calls). `padEnd` works correctly there. No fix needed.
- `ScanSlab.tsx`: The terminal mock is ~70 lines of inline JSX with hardcoded content. The visual structure (header, Stack grid, Intelligence grid, Warning, Footer) maps to CSS grid with `gridTemplateColumns: "92px 1fr"`. Adding a Surfaces section follows the same grid pattern.
- `README.md:17-46`: The scan example is a markdown code block. No dynamic rendering — pure text.

### Constraints Discovered

- [TYPE-VERIFIED] `chalk.dim()` wraps text in `\x1b[2m...\x1b[22m` (8 invisible characters). `padEnd` counts these, shortening visible padding by 8 characters.
- [OBSERVED] `boxWidth = 71`, `innerWidth = 69`. The box is fixed-width, not terminal-responsive.
- [OBSERVED] The website ScanSlab uses `papermark` as the example project. It shows 0 surfaces and a "No test framework" warning — the worst possible first impression after the R5/R6 fixes.
- [OBSERVED] The README example box has a subtle alignment issue too — the right `│` on the name line shows extra space: `web-app   │` vs the border line above.

### Test Infrastructure

- `scan.test.ts`: Has display rendering tests. The box alignment fix should be verifiable by checking the output length of the name line matches `boxWidth`.

## For AnaPlan

### Structural Analog

The existing ScanSlab at `website/components/scan/ScanSlab.tsx` IS the structural analog — it's the file being modified. The Stack grid JSX at lines 74-87 shows the pattern for adding a Surfaces section.

### Relevant Code Paths

- `packages/cli/src/commands/scan.ts` lines 142-152 — header box rendering. The fix is on line 147.
- `README.md` lines 17-46 — scan example code block.
- `website/components/scan/ScanSlab.tsx` lines 44-114 — terminal mock JSX.
- `website/lib/copy.ts` lines 70-82 — scan section copy text (may need minor updates to asserts).

### Patterns to Follow

- Terminal box: follow the `summaryPadded` pattern at line 149-150 — explicit string construction without relying on `padEnd` for ANSI-encoded strings.
- Website: follow the Stack grid pattern at lines 74-87 — `gridTemplateColumns: "92px 1fr"`, same spacing, same color conventions.
- README: follow the existing code block format — indented with 2 spaces, using box-drawing characters.

### Known Gotchas

- The `nameWithShape` line has TWO chalk operations: `chalk.dim(shape)` inside the string AND `chalk.bold()` wrapping the whole line. The fix must account for the inner `chalk.dim` escapes only — the outer `chalk.bold` is applied to the correctly-padded result.
- The website ScanSlab uses inline styles extensively (not utility classes for colors). Follow the existing pattern — `style={{ color: "rgba(255,255,255,0.55)" }}` etc.
- The README code block uses box-drawing characters that must align when rendered in monospace font. Test by viewing the rendered markdown, not just the source.

### Things to Investigate

- Whether the `copy.scan.asserts` array in `website/lib/copy.ts` should be updated to mention surfaces/monorepo detection. Currently says "Stack, auth, AI, payments, deploy — detected in seconds." Could add "Monorepo surfaces with per-package test commands."
- The exact project name and data for the README example. inbox-zero is the strongest candidate. Plan should decide whether to use the real name or a composite.
