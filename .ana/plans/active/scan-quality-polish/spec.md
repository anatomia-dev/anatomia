# Spec: Scan Quality Polish (6 Additive Fixes)

**Created by:** AnaPlan
**Date:** 2026-05-22
**Scope:** .ana/plans/active/scan-quality-polish/scope.md

## Approach

Six surgical fixes — three product accuracy improvements and three test quality improvements. Every fix is additive: new filter, new entry, new assertion, or moved tag. No existing behavior changes for correctly-scanned repos.

Each fix has a structural analog already in the codebase. The builder follows the existing pattern exactly.

## Output Mockups

No user-visible output changes. Product fixes affect scan.json content for edge-case repos (monorepos with schemas in e2e directories, capitalized infra package names, Vue projects using `.ts` config). Test fixes affect test assertions only.

## File Changes

### `packages/cli/src/engine/census.ts` (modify)
**What changes:** Fix 1 — add `isNonProductPath` filter to `discoverSchemas` loop. Fix 3 — add `vue.config.ts` entry to `FRAMEWORK_HINTS`.
**Pattern to follow:** surfaces.ts:272 for the filter pattern. The adjacent `.js`/`.mjs` Vue entries at census.ts:62-63 for the hint entry format.
**Why:** Without Fix 1, a monorepo with `e2e/express-ts/prisma/schema.prisma` falsely reports that as a product schema. Without Fix 3, Vue projects using `vue.config.ts` aren't detected — every other framework has full `.ts`/`.js`/`.mjs` coverage.

### `packages/cli/src/engine/detectors/surfaces.ts` (modify)
**What changes:** Fix 2 — add `.toLowerCase()` to `lastSegment` before `INFRA_PATTERNS.has()` check. Fix 3 — add `vue.config.ts` to `STRONG_FRAMEWORK_CONFIGS`.
**Pattern to follow:** surfaces.ts:87 uses `.toLowerCase()` before `EXCLUDED_SEGMENTS` lookup — same pattern one line later in the same filter chain. The adjacent `vue.config.js`, `vue.config.mjs` entries at surfaces.ts:35 for the config entry.
**Why:** Without Fix 2, a package named `Tsconfig` (capitalized) bypasses the infra filter. This directly addresses proof finding `fix-false-surface-detection-C2`. Without Fix 3 (paired with census.ts), `hasStrongConfig` at surfaces.ts:236 won't recognize `vue.config.ts`.

### `packages/cli/tests/commands/scan.test.ts` (modify)
**What changes:** Fix 4 — replace vacuous `if (surfIdx > -1)` guard with `expect(surfIdx).toBeGreaterThan(-1)` assertion plus flat assertions. Fix 5 — add value-level assertions for rendered framework, language, and testing values.
**Pattern to follow:** scan.test.ts:1077 already uses `expect(surfIdx).toBeGreaterThan(-1)` — apply the same in the A007 test. For Fix 5, use `toContain()` on the `surfaceBlock` string — same assertion style as the existing `cli`/`web` name checks.
**Why:** Without Fix 4, the A007 test passes vacuously if the Surfaces section doesn't render (proof finding `scan-surface-display-C1`). Without Fix 5, tests confirm surface names appear but not their identity data (proof finding `scan-surface-display-C2`).

### `packages/cli/tests/engine/detectors/applicationShape.test.ts` (modify)
**What changes:** Fix 6 — move `// @ana A003` from line 319 (above `describe('detector is a pure function')`) to a new line before the `it()` at line 64 (inside the priority `describe`).
**Pattern to follow:** The existing `// @ana A001` tag at line 73 — same placement style (own line, before the `it()`).
**Why:** A003 asserts "Next.js + MCP yields to web-app" — the test at line 64 tests that. The tag at line 319 marks a purity test that has nothing to do with A003. Proof finding `fix-shape-detection-priority-C2` documents this mismatch.

## Acceptance Criteria

- [ ] AC1: `discoverSchemas` skips non-product paths (e2e fixtures, examples, templates). A monorepo with `e2e/express-ts/prisma/schema.prisma` does not report that as a product schema.
- [ ] AC2: `INFRA_PATTERNS` matching is case-insensitive, consistent with `EXCLUDED_SEGMENTS` on the adjacent line.
- [ ] AC3: `vue.config.ts` is recognized in both `FRAMEWORK_HINTS` and `STRONG_FRAMEWORK_CONFIGS`, achieving parity with every other framework's `.ts`/`.js`/`.mjs` coverage.
- [ ] AC4: The "surfaces without testing" test (scan.test.ts) fails if the Surfaces section doesn't render or the surface line isn't found — no vacuous pass.
- [ ] AC5: Surface display tests assert on rendered framework/language/testing values, not just surface names.
- [ ] AC6: `// @ana A003` tags the "Next.js + MCP yields to web-app" test (applicationShape.test.ts:64), not the "detector is a pure function" test (line 319).
- [ ] AC7: Tests pass with `(cd packages/cli && pnpm vitest run)` — no regressions.
- [ ] AC8: No build errors with `pnpm run build`.

## Testing Strategy

- **Unit tests:** No new test files. Fixes 4-6 modify existing tests. Fixes 1-3 are product code covered by existing integration tests.
- **Integration tests:** Fix 1 ideally gets a test in the schema discovery tests (if they exist) or is verified via the scan integration tests. If no schema-specific test exists, verify manually that the `discoverSchemas` loop skips non-product roots.
- **Edge cases:** Fix 5 requires the builder to run the test once with the fixture to capture actual rendered output before writing value assertions. The fixture creates a `web` surface with `next: '14.0.0'` dep + `next.config.js` config — verify the rendered string contains `Next.js`, `TypeScript`, and `Vitest`.

## Dependencies

None. All changes are to existing files with no new dependencies.

## Constraints

- Fix 3 requires lockstep update: `FRAMEWORK_HINTS` in census.ts AND `STRONG_FRAMEWORK_CONFIGS` in surfaces.ts. Both tables must have `vue.config.ts`. Missing one breaks detection.
- Fix 5: assertion strings must match actual rendered output. Do not guess — run the test, capture the output, then write assertions using `toContain()`.

## Gotchas

- **Fix 1 insertion point:** The `isNonProductPath` check goes inside the `for (const root of roots)` loop at the TOP, before any Prisma/Drizzle checks. It must `continue` to skip the entire root, not just one ORM check.
- **Fix 4 structure:** The current test has `if (surfIdx > -1) { ... }`. Replace the `if` with an `expect`, then move the body out of the conditional. The `cliLine` lookup also needs a non-vacuous assertion — add `expect(cliLine).toBeDefined()` before the `toNotContain` check.
- **Fix 5 rendered values:** The `web` surface in the fixture gets Next.js from the dep + config, TypeScript from `.ts` source files, and Vitest from `devDeps`. The `cli` surface gets TypeScript and Vitest. Assert on whichever values the renderer actually produces — run the test first to see the exact strings.
- **Fix 6 line accuracy:** Line numbers may have shifted if earlier fixes modify the same file. The tag `// @ana A003` at line 319 is above `describe('detector is a pure function'` — find it by content, not line number. The insertion point at line 64 is above `it('mcp-server yields to web-app when browser framework present'` — also find by content.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Engine files (`src/engine/`) have zero CLI dependencies — no chalk, no commander, no ora.
- Prefer early returns over nested conditionals.
- Constants use SCREAMING_SNAKE_CASE.

### Pattern Extracts

**Structural analog for Fix 1** — surfaces.ts:268-272 (the `isNonProductPath` continue pattern):
```typescript
    // Pre-filter: infrastructure package
    const lastSegment = root.relativePath.split('/').pop() || '';
    if (INFRA_PATTERNS.has(lastSegment)) continue;

    // Pre-filter: non-product package (examples, templates, fixtures, etc.)
    if (isNonProductPath(root.relativePath)) continue;
```

**Structural analog for Fix 2** — surfaces.ts:87 (`.toLowerCase()` before Set lookup):
```typescript
    if (EXCLUDED_SEGMENTS.has(segment.toLowerCase())) return true;
```

**Structural analog for Fix 4** — scan.test.ts:1076-1077 (non-vacuous surfIdx assertion):
```typescript
      const surfIdx = lines.findIndex((l: string) => l.includes('Surfaces') && !l.includes('────'));
      expect(surfIdx).toBeGreaterThan(-1);
```

**Structural analog for Fix 6** — applicationShape.test.ts:73-74 (tag placement):
```typescript
    // @ana A001
    it('MCP + server framework → api-server (directus scenario)', () => {
```

### Proof Context

**census.ts:**
- `fill-scan-detection-gaps-C3`: FRAMEWORK_HINTS not exported — no unit test for ordering. Not relevant to Fix 3 (we're adding an entry, not testing order).

**surfaces.ts:**
- `fix-false-surface-detection-C2`: INFRA_PATTERNS is case-sensitive while EXCLUDED_SEGMENTS is case-insensitive. **This is exactly what Fix 2 addresses.**

**scan.test.ts:**
- `scan-surface-display-C1`: A007 test passes vacuously if Surfaces section not rendered. **This is exactly what Fix 4 addresses.**
- `scan-surface-display-C2`: Tests assert surface names but not framework/language/testing values. **This is exactly what Fix 5 addresses.**

**applicationShape.test.ts:**
- `fix-shape-detection-priority-C2`: @ana A003 tags wrong test. **This is exactly what Fix 6 addresses.**

### Checkpoint Commands
- After census.ts changes (Fixes 1, 3): `(cd packages/cli && pnpm vitest run)` — Expected: 2846 pass, 2 skipped
- After surfaces.ts changes (Fixes 2, 3): `(cd packages/cli && pnpm vitest run)` — Expected: 2846 pass, 2 skipped
- After scan.test.ts changes (Fixes 4, 5): `(cd packages/cli && pnpm vitest run)` — Expected: 2846 pass, 2 skipped
- After applicationShape.test.ts change (Fix 6): `(cd packages/cli && pnpm vitest run)` — Expected: 2846 pass, 2 skipped
- After all changes: `pnpm run test -- --run` — Expected: all tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2846 passed, 2 skipped (2848 total)
- Current test files: 122
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: 2846 passed, 2 skipped in 122 test files (no new tests — fixes modify existing assertions)
- Regression focus: `scan.test.ts` (Fixes 4-5 modify assertions), `applicationShape.test.ts` (Fix 6 moves a tag)
