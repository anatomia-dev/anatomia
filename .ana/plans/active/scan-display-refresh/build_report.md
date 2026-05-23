# Build Report: Scan Display Refresh

**Created by:** AnaBuild
**Date:** 2026-05-23
**Spec:** .ana/plans/active/scan-display-refresh/spec.md
**Branch:** feature/scan-display-refresh

## What Was Built

- `packages/cli/src/commands/scan.ts` (modified): Fixed name line padding — replaced `nameWithShape.padEnd(innerWidth)` with explicit visible width calculation that accounts for ANSI codes from `chalk.dim(shape)`. Added summary overflow protection that drops the monorepo package count when the summary would exceed `innerWidth`, with truncation+ellipsis as last resort.
- `packages/cli/tests/commands/scan.test.ts` (modified): Added 3 tests in new `box alignment` describe block — name line width with shape badge, summary line width, and overflow truncation with package count drop.
- `README.md` (modified): Replaced fictional `my-saas-app` example (lines 17-46) with `inbox-zero` monorepo scan showing Surfaces section, full stack (database with models, auth, AI, payments, testing, UI), and correct 71-char box alignment.
- `website/components/scan/ScanSlab.tsx` (modified): Replaced papermark content with inbox-zero — updated terminal header path, project name, stack grid (Better Auth, Vercel AI + OpenAI, Testing: Vitest, Tailwind CSS), added Surfaces section (web/api/cli), updated Intelligence (7 contributors, inbox-zero-specific hot files, docs, pre-commit), removed "No test framework" warning, updated footer CTA.

## PR Summary

- Fix terminal box alignment bug where ANSI escape codes from `chalk.dim(shape)` caused `padEnd` to miscalculate visible width, breaking the right border alignment
- Add summary overflow protection that drops redundant package count when the line would exceed box width
- Replace fictional `my-saas-app` README example with a real-world `inbox-zero` monorepo scan showing surfaces, database with models, and full stack detection
- Replace outdated papermark website mock with inbox-zero content including a Surfaces section, positive testing detection, and AI stack display
- Add 3 alignment tests verifying box width consistency for name lines with shapes, short summaries, and overflow scenarios

## Acceptance Criteria Coverage

- AC1 "Terminal box alignment" → scan.test.ts `box alignment > name line with shape badge has correct box width` (1 assertion: length === 71) + `summary line has correct box width` (1 assertion) + `drops package count from summary when it would overflow` (2 assertions: length === 71, not contains "packages")
- AC2 "README shows monorepo with surfaces" → README.md lines 17-46 contains Surfaces section with web/api/cli, stack includes framework, database, auth, AI, payments, testing, UI
- AC3 "README uses inbox-zero" → README.md line 19 contains "inbox-zero"
- AC4 "ScanSlab shows surfaces" → ScanSlab.tsx Surfaces section with web (Next.js · Vitest), api (TypeScript · Vitest), cli (TypeScript)
- AC5 "ScanSlab no test warning" → ScanSlab.tsx warning div removed entirely
- AC6 "ScanSlab stack includes AI and testing" → ScanSlab.tsx stack grid has "AI" → "Vercel AI · OpenAI" and "Testing" → "Vitest"
- AC7 "ScanSlab maintains visual design" → Only data content changed. All inline styles, colors (`#67e8f9`, `rgba(255,255,255,0.55)`, etc.), grid patterns (`92px 1fr`), component structure preserved.
- AC8 "README box alignment" → All 4 box lines verified at exactly 71 characters via Python char count
- AC9 "Tests pass" → 2906 passed, 2 skipped
- AC10 "No build errors" → Build succeeds, lint passes (0 errors, pre-existing 1 warning in git-operations.ts)

## Implementation Decisions

1. **Name line trailing spaces:** The `-4` in `namePad` calculation leaves 2 trailing spaces after the shape text. This is by design — it prevents the shape text from touching the right border `│`. The README box matches this pattern.
2. **Overflow filter uses `endsWith('packages')`:** This matches the exact format `"N packages"` produced by the monorepo summary logic. A regex would be overkill for this single known pattern.
3. **Test uses 1000 Prisma models:** The scan engine detects "Node.js" (7 chars) not "TypeScript" (10 chars) for test projects — so `(100 models)` (32 chars total in the Prisma display) produces a summary that fits exactly at innerWidth. Using 1000 models adds 1 char to push past the boundary.
4. **Replaced Secrets row with Pre-commit:** The papermark mock showed a Secrets row. Inbox-zero's Intelligence section matches the README example with Pre-commit instead, which is more representative of what the scan actually produces.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
pnpm run test -- --run
Test Files  122 passed (122)
     Tests  2903 passed | 2 skipped (2905)
  Duration  45.63s
```

### After Changes
```
pnpm run test -- --run
Test Files  122 passed (122)
     Tests  2906 passed | 2 skipped (2908)
  Duration  54.91s
```

### Comparison
- Tests added: 3
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/scan.test.ts`: 3 tests in `box alignment` describe block:
  - `name line with shape badge has correct box width` — verifies name line length === 71 when project has a detected shape
  - `summary line has correct box width` — verifies summary line length === 71 for a standard Next.js project
  - `drops package count from summary when it would overflow` — verifies summary fits in 71 chars and excludes "packages" text when database display + package count would overflow

## Verification Commands
```bash
pnpm run build
(cd 'packages/cli' && pnpm vitest run)
pnpm run test -- --run
pnpm run lint
```

## Git History
```
f78f862d [scan-display-refresh] Replace ScanSlab mock with inbox-zero
35b06bf2 [scan-display-refresh] Replace README scan example with inbox-zero
d5de6368 [scan-display-refresh] Fix terminal box alignment
```

## Open Issues

1. **Overflow test depends on scan engine language detection:** The test creates `.ts`/`.tsx` files but the scan detects "Node.js" not "TypeScript" in a temp directory context (likely because the file count heuristic favors Node.js for small projects). This means the overflow threshold in the test is tighter than real-world — we use 1000 models to push 1 char past innerWidth, whereas a real TypeScript project overflows 3 chars sooner. The test is correct but fragile to changes in language detection heuristics.

2. **Pre-existing lint warning:** `packages/cli/src/utils/git-operations.ts:198` has an unused eslint-disable directive — not introduced by this build.

Verified complete by second pass.
