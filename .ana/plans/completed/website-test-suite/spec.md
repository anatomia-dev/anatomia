# Spec: Website Test Suite

**Created by:** AnaPlan
**Date:** 2026-05-20
**Scope:** .ana/plans/active/website-test-suite/scope.md

## Approach

Add the missing `"test": "vitest run"` script to `website/package.json`, then create 7 new test files covering the website's data layer computation functions, pure utilities, and structural integrity. All tests use synthetic inline fixtures and module-level mocking following the convention established by `marketing-stats.test.ts`. Zero production code changes.

Two mocking strategies are needed:

1. **Module-boundary mocking** (used by most files): `vi.mock('@/lib/docs-data/proofs')` etc., same pattern as marketing-stats.test.ts. Used when testing a module that *imports* data accessors.

2. **`node:fs` mocking** (proofs.test.ts only): `vi.mock('node:fs')` with controlled `readFileSync` returns. Required because we're testing computation functions (`getProofStats`, `getMedianTimings`) that are *exported from the same module* that does the IO. Can't mock the module to test its own exports.

The proofs.test.ts module-level cache (`let cached = null`) means once `load()` runs, subsequent calls return cached data regardless of mock changes. Use `vi.resetModules()` + dynamic `import()` between describe blocks to get fresh module instances with different synthetic datasets.

## Output Mockups

```
$ cd website && pnpm vitest run

 ✓ lib/__tests__/marketing-stats.test.ts (8)
 ✓ lib/__tests__/docs-data/proofs.test.ts (8)
 ✓ lib/__tests__/docs-data/docs-stat-values.test.ts (5)
 ✓ lib/__tests__/docs-data/strip-jsx.test.ts (6)
 ✓ lib/__tests__/docs-data/data-integrity.test.ts (5)
 ✓ lib/__tests__/format.test.ts (4)
 ✓ lib/__tests__/proof-feed.test.ts (6)
 ✓ lib/__tests__/copy.test.ts (6)

 Test Files  8 passed (8)
      Tests  48 passed (48)
```

## File Changes

### `website/package.json` (modify)
**What changes:** Add `"test": "vitest run"` to the scripts object.
**Pattern to follow:** The CLI package already has a test script; this mirrors it for the website surface.
**Why:** Without this, Turborepo `turbo run test` and the root `pnpm run test` skip the website. The surface-awareness bridge in ana.json already expects this command at `surfaces.website.commands.test`.

### `website/lib/__tests__/docs-data/proofs.test.ts` (create)
**What changes:** Tests `getProofStats` and `getMedianTimings` computation logic from `lib/docs-data/proofs.ts`.
**Pattern to follow:** Diverges from marketing-stats pattern — uses `vi.mock('node:fs')` instead of module-boundary mocking, and `vi.resetModules()` + dynamic import for cache busting between describe blocks.
**Why:** These are the core computation functions powering the proof stats displayed on the site. The zero-filtering in median computation and the `rejectionCycles > 0` counting are non-trivial logic worth covering.

Test matrix:
- `getProofStats` with multi-entry dataset: verify entries count, assertions sum, findings sum, rejections count (only entries with `rejectionCycles > 0`)
- `getProofStats` with empty dataset: all fields return 0
- `getMedianTimings` with multi-entry dataset including zero-valued timing stages: verify zeros are filtered out before median computation
- `getMedianTimings` with odd vs even entry count: verify median calculation (middle value vs average of two middle values)
- `getMedianTimings` with empty dataset: all stages return 0
- `getMedianTimings` with all-zero timing for one stage: that stage returns 0

Each describe block that needs different data should use `vi.resetModules()` in a `beforeEach`, then dynamically import the module under test within each `it()` block. Define a helper function at the top of the file that sets up the `readFileSync` mock return value for a given dataset.

### `website/lib/__tests__/docs-data/docs-stat-values.test.ts` (create)
**What changes:** Tests `buildDocsStatValues` and `resolveDocsStatTags` as pure functions with no mocking.
**Pattern to follow:** Simplest possible test structure — direct import, direct call, direct assertion.
**Why:** These are pure functions with zero dependencies. `buildDocsStatValues` maps 9 numeric inputs to strings. `resolveDocsStatTags` regex-replaces `<DocsStat value="..." />` tags.

Test matrix:
- `buildDocsStatValues`: all 9 keys present with correct string conversions
- `resolveDocsStatTags`: replaces known keys with values from map
- `resolveDocsStatTags`: leaves unrecognized keys as-is (the tag stays in output)
- `resolveDocsStatTags`: handles text with no DocsStat tags (returns unchanged)
- `resolveDocsStatTags`: handles multiple DocsStat tags in one string

### `website/lib/__tests__/docs-data/strip-jsx.test.ts` (create)
**What changes:** Tests the `stripJsx` function's regex/stripping logic with all 5 data accessor imports mocked.
**Pattern to follow:** `marketing-stats.test.ts` — `vi.mock()` at module boundary for each data accessor module, `vi.mocked()` for typed access, `beforeEach(() => vi.resetAllMocks())`.
**Why:** `stripJsx` orchestrates DocsStat resolution and 6 categories of JSX stripping. The mocking isolates the stripping logic from data IO.

Mock setup: Mock 3 modules — `@/lib/docs-data/proofs`, `@/lib/docs-data/skills`, `@/lib/docs-data/gotchas`. Return controlled values: `getProofEntries` → array of 2 synthetic entries, `getProofStats` → `{ entries: 2, assertions: 10, findings: 3, rejections: 1 }`, `getMedianTimings` → `{ think: 3, plan: 8, build: 15, verify: 7 }`, `getSkillCount` → `8`, `getGotchaCount` → `15`.

Test matrix:
- Import/export lines removed
- JSX expression comments `{/* ... */}` removed
- Self-closing components `<Component />` removed
- `blockComponents` (Callout, ForPlatform, TroubleCard): tags removed, children preserved
- `stripFull` components (PipelineDiagram, NextCards, StatsStrip, CodeBlock): entire element including children removed
- `<DocsStat value="proofCount" />` resolved to computed value before stripping

### `website/lib/__tests__/docs-data/data-integrity.test.ts` (create)
**What changes:** Validates real `data/docs/*.json` files exist and match expected shapes. Uses `describe.skipIf` when data directory doesn't exist.
**Pattern to follow:** No structural analog — this is a new pattern (contract test against generated data).
**Why:** Data files are gitignored and generated by `prebuild`. This test catches schema drift between the extraction script and the data accessor types without creating a build-time dependency on the CLI.

Use `existsSync` from `node:fs` to check `join(process.cwd(), 'data', 'docs')` exists. Wrap all tests in `describe.skipIf(!dataExists)`.

Test matrix (all 8 JSON files):
- `proof-entries.json`: array, ≥1 entries, first entry has required ProofEntry keys (slug, feature, result, timing, contract, assertionCount, findingCount, rejectionCycles, assertions, findings, findingSeverity)
- `skill-templates.json`: array, ≥1 entries, first entry has name/description/sections/rules keys
- `gotchas.json`: array, ≥1 entries, first entry has id/triggers/skill/text keys
- `build-meta.json`: object with version/commitSha/buildTimestamp keys
- `commands.json`: object with groups/totalCommands keys, totalCommands is a number ≥1

Group the remaining 3 files (agent-templates, context-files, search-index) into a single "supplementary files are valid JSON arrays" test.

### `website/lib/__tests__/format.test.ts` (create)
**What changes:** Tests `splitHeadline` parsing of `*emphasis*` markers.
**Pattern to follow:** Pure function tests, no mocking. Direct import and assertion.
**Why:** `splitHeadline` powers emphasis rendering in Hero, Footer, and anywhere copy uses `*asterisks*`.

Test matrix:
- String with one `*emphasized*` word: produces 3 segments, middle has `em: true`
- String with no emphasis markers: produces 1 segment, no `em` field
- String with emphasis at start: first segment has `em: true`
- String with emphasis at end: last segment has `em: true`

### `website/lib/__tests__/proof-feed.test.ts` (create)
**What changes:** Tests `formatAge` boundary behavior across all time thresholds.
**Pattern to follow:** Pure function test. Use `vi.useFakeTimers()` to control `Date.now()` for deterministic results.
**Why:** `formatAge` has two distinct clamp behaviors and four time thresholds — both worth covering.

Test matrix:
- Timestamp 30 seconds ago → `"30s ago"`
- Timestamp 0 seconds ago (exact now) → `"1s ago"` (inner `Math.max(1, ...)` clamp prevents "0s ago")
- Timestamp in the future → `"1s ago"` (outer `Math.max(0, ...)` clamp prevents negative diff, inner clamp prevents "0s ago")
- Timestamp 90 seconds ago → `"1m ago"`
- Timestamp 2 hours ago → `"2h ago"`
- Timestamp 48 hours ago → `"2d ago"`

Use `vi.useFakeTimers()` with a fixed `Date.now()`, then construct ISO strings relative to that fixed time. Clean up with `vi.useRealTimers()` in `afterEach`.

### `website/lib/__tests__/copy.test.ts` (create)
**What changes:** Validates structural integrity of the copy catalog.
**Pattern to follow:** Pure import, structural assertions. No mocking.
**Why:** The copy catalog has 20 sections, typed nav links, and footer columns that components depend on. Structural tests catch accidental deletions or shape changes.

Test matrix:
- 20 top-level sections exist (list them by name)
- `nav.links` is a 4-element array, each with `label` (string) and `href` (string)
- `footer.columns` is a 3-element array, each with `title` (string) and `links` (non-empty array)
- All footer column links have non-empty `label` and `href`
- `hero.ctas.primary` has `label`, `command`, and `href`
- `pricing.plans` has 2 entries with `name` and `features` arrays

## Acceptance Criteria

- [ ] AC1: `website/package.json` has `"test": "vitest run"` script
- [ ] AC2: `cd website && pnpm vitest run` passes with 38+ tests (8 existing + 30+ new)
- [ ] AC3: `pnpm run test -- --run` (root) runs both CLI and website tests without hanging
- [ ] AC4: proofs.test.ts tests `getProofStats` and `getMedianTimings` computation logic with mocked `node:fs`
- [ ] AC5: docs-stat-values.test.ts tests `buildDocsStatValues` and `resolveDocsStatTags` as pure functions (no mocking)
- [ ] AC6: strip-jsx.test.ts tests regex/stripping logic with 5 mocked data accessor imports (proofs ×3, skills ×1, gotchas ×1)
- [ ] AC7: data-integrity.test.ts validates real `data/docs/*.json` files exist and match expected shapes, skipped via `describe.skipIf` when data dir doesn't exist
- [ ] AC8: format.test.ts tests `splitHeadline` parsing of `*emphasis*` markers
- [ ] AC9: proof-feed.test.ts tests `formatAge` boundary behavior (seconds/minutes/hours/days thresholds, future timestamp clamping)
- [ ] AC10: copy.test.ts validates structural integrity of the copy catalog (top-level sections, nav links, footer columns, non-empty strings)
- [ ] AC11: Zero production code changes — no modifications to any `lib/`, `app/`, or `components/` source files
- [ ] AC12: All new test files are in `lib/__tests__/` or `lib/__tests__/docs-data/` (matches existing vitest include pattern)
- [ ] Tests pass with `(cd website && pnpm vitest run)`
- [ ] No build errors from `(cd website && pnpm run build)`

## Testing Strategy

- **Unit tests:** All 7 new files are unit tests. Follow marketing-stats.test.ts pattern for mocked tests (vi.mock before imports, vi.mocked for typed access, beforeEach resetAllMocks). Pure function tests need no mocking at all.
- **Integration tests:** data-integrity.test.ts serves as the integration test — it validates real generated JSON files against expected shapes. Gracefully skipped on fresh clones.
- **Edge cases:** Empty datasets (proofs), zero-valued timings (median filtering), future timestamps (formatAge), unrecognized DocsStat keys (resolveDocsStatTags), emphasis at string boundaries (splitHeadline).

## Dependencies

- Vitest is already installed and configured in `website/vitest.config.ts`
- The `lib/__tests__/` directory and subdirectory pattern already works with the vitest include glob
- Data files in `data/docs/` exist on this machine (generated by prebuild), enabling data-integrity tests

## Constraints

- Zero production code changes. Only test files and package.json test script.
- Test script must be `vitest run` (not `vitest`) so Turborepo exits cleanly.
- All test files must be in `lib/__tests__/` or `lib/__tests__/docs-data/` to match the existing vitest include pattern `lib/__tests__/**/*.test.ts`.

## Gotchas

- **proofs.ts module-level cache:** `let cached = null` means once `load()` runs, all subsequent calls return the same data. Tests that need different datasets must use `vi.resetModules()` + dynamic `import()` to get a fresh module instance. Don't try to clear `cached` directly — it's not exported.
- **Mock order matters for stripJsx:** All `vi.mock()` calls must come before the `import` of `stripJsx`. Vitest hoists `vi.mock()` but the mock declarations must be at the top of the file for clarity and to match the marketing-stats convention.
- **`describe.skipIf` needs the condition evaluated at file load time:** `const dataExists = existsSync(...)` must be at module scope, not inside a test. `describe.skipIf` evaluates its argument when the describe block is defined.
- **proofs.ts mocks `readFileSync` not `readFile`:** The module uses synchronous `readFileSync` from `node:fs`. Mock `node:fs` not `node:fs/promises`.
- **formatAge uses `Date.now()`:** Tests must use `vi.useFakeTimers()` to control the current time, otherwise assertions drift. Remember to call `vi.useRealTimers()` in `afterEach`.
- **Import paths use `@/` alias:** The vitest config defines `@ → website root`. All imports in test files should use `@/lib/...` paths, matching the marketing-stats convention.
- **`phases` field is optional on ProofEntry:** The types.ts interface marks it as `phases?: number`. Don't include it in synthetic test data unless specifically testing it.

## Build Brief

### Rules That Apply
- Use `import type` for type-only imports, separate from value imports
- Prefer named exports
- All imports use `@/` alias (vitest config resolves `@` to website root)
- No `.js` extensions needed in test files — website uses Next.js/vitest resolution, not ESM direct
- Explicit return types on exported functions (not applicable here — test files don't export)
- `beforeEach(() => vi.resetAllMocks())` in every test file that uses mocks

### Pattern Extracts

The canonical mocking pattern from `website/lib/__tests__/marketing-stats.test.ts` (lines 1-17):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the docs-data modules before importing marketing-stats
vi.mock('@/lib/docs-data', () => ({
  getCommandCount: vi.fn(),
  getBuildMeta: vi.fn(),
}));

import { getMarketingCommandCount, getMarketingVersion } from '../marketing-stats';
import { getCommandCount, getBuildMeta } from '@/lib/docs-data';

const mockGetCommandCount = vi.mocked(getCommandCount);
const mockGetBuildMeta = vi.mocked(getBuildMeta);

beforeEach(() => {
  vi.resetAllMocks();
});
```

### Proof Context
- `docsStatValues.ts`: 2 of 9 value keys (skillCount, findings) defined but unused in any MDX file — not relevant to testing, just extraction coverage.
- `proof-feed.ts`: VERSION_FALLBACK evaluated at module load time — not relevant since we're only testing `formatAge`, not the feed loading.
- `copy.ts`: Manifesto outbound link points to `/#pipeline` which may not exist; proofFeed copy references clickable rows — these are content issues, not structural integrity issues. Our tests check structure, not content accuracy.

### Checkpoint Commands
- After `package.json` change: `(cd website && pnpm vitest run)` — Expected: 8 tests pass (existing)
- After each new test file: `(cd website && pnpm vitest run)` — Expected: incremental test count increase
- After all changes: `pnpm run test -- --run` — Expected: CLI tests + 48 website tests pass
- Lint: `(cd website && pnpm run lint)`

### Build Baseline
- Current tests: 8 passed in 1 file
- Current test files: 1 (`marketing-stats.test.ts`)
- Command used: `(cd website && pnpm vitest run)`
- After build: expected 48 tests in 8 files
- Regression focus: marketing-stats.test.ts (must not break from new test infrastructure)
