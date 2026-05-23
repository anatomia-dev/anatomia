# Spec: Backend Service Surface Detection

**Created by:** AnaPlan
**Date:** 2026-05-22
**Scope:** .ana/plans/active/add-backend-surface-detection/scope.md

## Approach

Add a fourth signal to `detectSurfaces()` in `surfaces.ts` that catches backend services invisible to the existing three filesystem-artifact-based signals. Backend frameworks (Express, Fastify, Koa, Hono, etc.) leave no filesystem trace beyond package.json — they're imported as production dependencies.

Signal 4 requires three conditions: a server framework in production deps (`root.deps`), a development script (`dev` or `start:dev`), and ≥15 source files. This is a medium-strength signal — weaker than a config file (Signal 3) but stronger than directory convention alone (Signal 2's file count path). The threshold of 15 is conservative: well below the smallest genuine miss in the 85-repo validation set (dittofeed at 44 files), well above false positives (highlight/packages/ai at 5 files).

Prerequisite: fix the missing `continue` on Signal 3. Without it, Signal 4 would re-evaluate packages already caught by Signal 3, causing duplicate candidates. Signals 1 and 2 already have `continue` — Signal 3 was harmless without it only because it was the last signal in the loop.

Signal evaluation order is load-bearing. Signals use `continue` to short-circuit, so packages matching multiple signals are caught by the first match only. Signal 4 goes last because it's the weakest signal — stronger signals should claim packages first.

## Output Mockups

A monorepo with a Next.js frontend and Express API backend. Before this change, only `web` appears. After:

```
Surfaces (2):
  api         packages/api         TypeScript   —
  web         apps/web             TypeScript   Next.js
```

Note: Signal 4 surfaces show `—` for framework because `detectFramework` only recognizes config-file-based frameworks. Express/Fastify/Koa have no config files. This is structurally correct — a follow-up scope could add deps-based framework inference.

## File Changes

### `packages/cli/src/engine/detectors/surfaces.ts` (modify)

**What changes:**
1. Module-level JSDoc updated from "Three signals" to "Four signals" with Signal 4 documented.
2. New exported constant `SERVER_FRAMEWORK_DEPS`: a `Set<string>` containing the 10 server framework package names from AC2 (express, fastify, koa, hono, @hono/node-server, @nestjs/core, elysia, polka, restify, h3).
3. New exported constant `MIN_FILES_SERVER_DEP = 15`.
4. `continue` added after `candidates.push({ root })` in Signal 3 (line 290).
5. Signal 4 block added after Signal 3: checks `root.deps` keys against `SERVER_FRAMEWORK_DEPS`, requires `dev` or `start:dev` in `root.scripts`, requires `root.fileCount >= MIN_FILES_SERVER_DEP`.

**Pattern to follow:** The existing signal blocks at lines 274-291 — each is a comment, an `if` condition, a `candidates.push({ root })`, and a `continue`.
**Why:** Without this, backend services using dependency-based frameworks are invisible to the scan. 6-8 repos in the validation set have legitimate backend services that go undetected.

### `packages/cli/tests/engine/detectors/surfaces.test.ts` (modify)

**What changes:**
1. Import `SERVER_FRAMEWORK_DEPS` and `MIN_FILES_SERVER_DEP` from surfaces.js.
2. New describe block for Signal 4 positive cases: server dep + dev script + ≥15 files → detected.
3. New describe block for Signal 4 negative cases: server dep in devDeps → not detected; server dep without dev/start:dev → not detected; server dep + dev + <15 files → not detected.
4. Positive case for `start:dev` script (NestJS convention).
5. Signal overlap test: package matching both Signal 3 and Signal 4 → exactly 1 surface (regression test for the `continue` fix).
6. Constant value assertions for `SERVER_FRAMEWORK_DEPS` (spot-check 3-4 entries + size = 10) and `MIN_FILES_SERVER_DEP` (equals 15).

**Pattern to follow:** The existing signal test sections at lines 143-247 — each signal has a `describe` for positive cases and a `describe` for negative cases, using `makeRoot` and `makeCensus` helpers.
**Why:** Without tests, the `continue` fix and Signal 4 logic have no regression protection. The overlap test specifically guards against the duplicate-candidate bug.

## Acceptance Criteria

- [ ] AC1: Signal 3 has `continue` after `candidates.push()`, matching Signals 1 and 2. A package matching both Signal 3 and Signal 4 is pushed exactly once.
- [ ] AC2: `SERVER_FRAMEWORK_DEPS` is a named, exported constant containing: express, fastify, koa, hono, @hono/node-server, @nestjs/core, elysia, polka, restify, h3.
- [ ] AC3: Signal 4 checks `root.deps` (production dependencies only), not `root.devDeps`. A package with express in devDeps + dev script does NOT trigger Signal 4.
- [ ] AC4: Signal 4 requires `root.fileCount >= MIN_FILES_SERVER_DEP` (15). Packages with fewer than 15 source files do not trigger Signal 4 regardless of deps and scripts.
- [ ] AC5: Signal 4 accepts `dev` or `start:dev` as the development script. Exact key match, not substring.
- [ ] AC6: Signal 4 fires after Signal 3 (with `continue`), so packages already caught by Signals 1-3 are not re-evaluated. A code comment documents the load-bearing evaluation order.
- [ ] AC7: `MIN_FILES_SERVER_DEP` is an exported named constant (not a magic number), following the `MIN_SOURCE_FILES` and `APPS_DIR_FILE_THRESHOLD` pattern.
- [ ] AC8: The module-level JSDoc comment is updated to document four signals, not three.
- [ ] AC9: No regressions on existing signals — all 69 existing tests pass unchanged.
- [ ] Tests pass with `pnpm run test -- --run`
- [ ] No build errors with `pnpm run build`

## Testing Strategy

- **Unit tests:** All tests use synthetic census objects via `makeRoot`/`makeCensus` — no filesystem access. Follow the existing pattern in lines 143-247 where each signal has positive and negative describe blocks.
- **Signal 4 positive cases:** Express in `root.deps` + `dev` in scripts + 20 files → detected. Fastify variant for variety. `start:dev` variant for NestJS convention.
- **Signal 4 negative cases:** Express in `root.devDeps` (not deps) → not detected. Express in deps but no dev/start:dev script → not detected. Express + dev but only 10 files → not detected.
- **Signal overlap/regression:** Package with `nest-cli.json` (Signal 3) AND `@nestjs/core` in deps + dev → exactly 1 surface. This is the critical regression test for the `continue` fix.
- **Constant assertions:** `SERVER_FRAMEWORK_DEPS.size` equals 10, spot-check that it includes `express`, `fastify`, `@nestjs/core`, `h3`. `MIN_FILES_SERVER_DEP` equals 15.

## Dependencies

None. All changes are within the existing `surfaces.ts` pure function and its test file. No new imports, no new packages, no schema changes.

## Constraints

- `surfaces.ts` is an engine file — zero CLI dependencies (no chalk, no ora, no commander).
- `detectSurfaces` is a pure function — no filesystem access. All data comes from the `ProjectCensus` input.
- Signal evaluation order is load-bearing. Signal 4 must be the last signal in the loop body.
- `root.scripts` is an array of exact script key names, not script values. `scripts.includes('dev')` matches the key `"dev"`, not a substring of another key's value.

## Gotchas

- **The `continue` fix on Signal 3 must be added BEFORE Signal 4 is inserted.** If both changes happen in the wrong order during editing, there's a window where Signal 3 lacks `continue` and Signal 4 exists — causing duplicates. In practice this means: edit Signal 3 first, then add Signal 4.
- **`root.deps` vs `root.devDeps` — they are separate fields.** `root.deps` is production `dependencies` from package.json. `root.devDeps` is `devDependencies`. Signal 4 must check `root.deps` only. Do not merge them or use a combined object.
- **`root.scripts` contains key names, not values.** Census reads `Object.keys(packageJson.scripts)`. So `scripts.includes('dev')` checks if a script named `dev` exists, not if any script's command contains the word "dev".
- **`@hono/node-server` is a scoped package name.** It's a single string in the Set — don't split on `/`. `Object.keys(root.deps).some(d => SERVER_FRAMEWORK_DEPS.has(d))` handles scoped packages correctly because dep keys are the full package name.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { SERVER_FRAMEWORK_DEPS } from '../../../src/engine/detectors/surfaces.js'`
- Use `import type` for type-only imports, separate from value imports
- Named exports only — no default exports
- Engine files have zero CLI dependencies
- Exported functions require `@param` and `@returns` JSDoc tags
- Early returns (via `continue`) over nested conditionals

### Pattern Extracts

Signal block pattern from `surfaces.ts` lines 274-286:
```typescript
    // Signal 1: bin + dev script
    if (root.hasBin && root.scripts.includes('dev')) {
      candidates.push({ root });
      continue;
    }

    // Signal 2: apps/ with strong config or large file count
    if (root.relativePath.startsWith('apps/')) {
      if (hasStrongConfig(root, census) || root.fileCount > APPS_DIR_FILE_THRESHOLD) {
        candidates.push({ root });
        continue;
      }
    }
```

Constant declaration pattern from `surfaces.ts` lines 95-99:
```typescript
/** Minimum source files for a package to be considered as a surface. */
export const MIN_SOURCE_FILES = 5;

/** File count threshold for apps/ packages without strong framework config. */
export const APPS_DIR_FILE_THRESHOLD = 50;
```

Test pattern from `surfaces.test.ts` lines 146-176:
```typescript
// @ana A009
describe('signal 1 detects bin + dev packages', () => {
  it('detects package with bin and dev script as surface', () => {
    const root = makeRoot({
      relativePath: 'packages/cli',
      hasBin: true,
      scripts: ['build', 'dev', 'test'],
      fileCount: 50,
    });
    const census = makeCensus({ roots: [root] });
    const surfaces = detectSurfaces(census, {});

    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.name).toBe('cli');
  });
});

// @ana A010
describe('signal 1 rejects bin without dev', () => {
  it('does not detect package with bin but no dev script', () => {
    const root = makeRoot({
      relativePath: 'packages/sdk',
      hasBin: true,
      scripts: ['build', 'test'],
      fileCount: 50,
    });
    const census = makeCensus({ roots: [root] });
    const surfaces = detectSurfaces(census, {});

    expect(surfaces).toHaveLength(0);
  });
});
```

Constant test pattern from `surfaces.test.ts` lines 1118-1124:
```typescript
  it('MIN_SOURCE_FILES is 5', () => {
    expect(MIN_SOURCE_FILES).toBe(5);
  });

  it('APPS_DIR_FILE_THRESHOLD is 50', () => {
    expect(APPS_DIR_FILE_THRESHOLD).toBe(50);
  });
```

### Proof Context

`surfaces.ts` — 2 active findings, neither relevant to this build:
- (scan-surface-detection-C5) `deriveRawName` @scope stripping unreachable for standard monorepo layouts — name derivation, not signal detection
- (scan-surface-detection-C6) Collision disambiguation edge case — name collision, not signal detection

Build concern: case-insensitive INFRA_PATTERNS has no dedicated test for capitalized package names — unrelated to Signal 4.

`surfaces.test.ts` — 1 active finding, not relevant:
- (fill-scan-detection-gaps-C1) Svelte/Nuxt ordering test constructs hints in predetermined order — framework ordering, not signal detection

### Checkpoint Commands

- After Signal 3 `continue` fix: `(cd 'packages/cli' && pnpm vitest run tests/engine/detectors/surfaces.test.ts)` — Expected: 69 tests pass (no regressions from `continue` addition)
- After Signal 4 + all test additions: `(cd 'packages/cli' && pnpm vitest run tests/engine/detectors/surfaces.test.ts)` — Expected: ~79 tests pass (69 existing + ~10 new)
- After all changes: `pnpm run test -- --run` — Expected: all tests pass across both packages
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2875 passed, 2 skipped (anatomia-cli: 122 test files) + 68 passed (anatomia-website: 10 test files)
- Current surfaces.test.ts: 69 tests
- Command used: `pnpm run test -- --run`
- After build: expected ~2885 tests (2875 + ~10 new Signal 4 tests)
- Regression focus: `tests/engine/detectors/surfaces.test.ts` — existing signal tests must remain green
