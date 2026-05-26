# Spec: Fix deploy platform detection for monorepos

**Created by:** AnaPlan
**Date:** 2026-05-26
**Scope:** .ana/plans/active/fix-deploy-platform-detection/scope.md

## Approach

Thread `census.primarySourceRoot` into `detectDeployment` so it prefers a deployment entry from the primary package over the alphabetically-first entry.

The fix is minimal: add an optional `primaryPath` parameter to `detectDeployment`. When provided, `find()` for an entry whose `sourceRootPath === primaryPath`. If found, use it. Otherwise fall back to `deployments[0]` — identical to current behavior. The parameter is optional so the existing fallback test (and any future callers without census context) continues to work.

At the single call site in `scan-engine.ts` (line 924), pass `census.primarySourceRoot` as the second argument.

Add a comment on `DEPLOYMENT_CONFIGS` in `census.ts` documenting that insertion order serves as intentional within-root priority (V8 string-key insertion order guarantee). No code change — comment only.

## Output Mockups

Before fix — inbox-zero scan:
```
Platform    Cloudflare Workers
```

After fix — inbox-zero scan:
```
Platform    Vercel
```

No change to output format. The platform field value becomes correct.

## File Changes

### `src/engine/detectors/deployment.ts` (modify)
**What changes:** Add optional `primaryPath?: string` parameter to `detectDeployment`. When provided, `find()` for entry matching `sourceRootPath === primaryPath` before falling back to `deployments[0]`. Update the JSDoc comment at line 30-31 to accurately describe the new behavior instead of the aspirational comment that's there now.
**Pattern to follow:** Same function — the existing shape is a pure function taking census entries and returning a result object. `detectCI` in the same file is the structural analog.
**Why:** Without this, monorepo scans return whichever platform config sorts first alphabetically across all packages, which is wrong when the primary package deploys to a different platform.

### `src/engine/scan-engine.ts` (modify)
**What changes:** Pass `census.primarySourceRoot` as the second argument to `detectDeployment` at line 924.
**Pattern to follow:** Other detector calls in the same block that receive census data (e.g., `detectSchemas` at line 922 receives `census.configs.schemas`).
**Why:** This is the only call site. The census object is already in scope and fully constructed.

### `src/engine/census.ts` (modify)
**What changes:** Add a comment above `DEPLOYMENT_CONFIGS` (line 81) documenting that insertion order is intentional within-root priority. V8 guarantees string-key insertion order matches definition order. When a single source root has both `vercel.json` and `Dockerfile`, Vercel wins because it's listed first. No code change — comment only.
**Pattern to follow:** Other const declarations in the file that have explanatory comments.
**Why:** Documents a design decision that affects correctness. Without this comment, a future contributor might reorder the map alphabetically and break priority.

### `tests/engine/detectors/ci-detection.test.ts` (modify)
**What changes:** Add new tests for primary-aware deployment detection. Keep all existing tests unchanged — especially the fallback test at line 53-59 which documents `deployments[0]` behavior when no `primaryPath` is provided.
**Pattern to follow:** The existing deployment tests in the same file (lines 37-60). Direct construction of `DeploymentEntry[]` arrays, no filesystem mocking.
**Why:** The new behavior needs coverage: primary match wins over alphabetical order, primary with no deploy config falls back, single-repo behavior preserved.

## Acceptance Criteria

- [ ] AC1: inbox-zero scan shows "Vercel" not "Cloudflare Workers"
- [ ] AC2: Cap scan shows "Vercel" not "Cloudflare Workers"
- [ ] AC3: dub scan still shows "Vercel" (regression check)
- [ ] AC4: formbricks scan still shows "Docker" (regression check — no vercel.json, Docker is correct)
- [ ] AC5: `ana init` on inbox-zero produces AGENTS.md with Vercel-specific serverless guidance
- [ ] AC6: Prisma + Vercel gotcha fires for inbox-zero after the fix
- [ ] AC7: Single-repo projects unaffected — `primaryPath='.'` matches all entries from the single root
- [ ] AC8: Existing fallback test continues to pass — documents behavior when no `primaryPath` is provided
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`
- [ ] No lint errors with `pnpm run lint`

## Testing Strategy

- **Unit tests:** Add to the existing `describe('Deployment detection')` block in `ci-detection.test.ts`. Construct `DeploymentEntry[]` arrays directly — no filesystem mocking needed. The existing pattern constructs entries inline.
- **Test cases to add:**
  1. Primary match wins over first entry — entries `[{Cloudflare, apps/image-proxy}, {Vercel, apps/web}]` with `primaryPath='apps/web'` → returns Vercel
  2. Primary has no deploy config — entries `[{Docker, apps/worker}]` with `primaryPath='apps/web'` → falls back to Docker (graceful degradation)
  3. Single-repo primaryPath — entries `[{Vercel, '.'}]` with `primaryPath='.'` → returns Vercel (no regression)
  4. Multiple entries, no primaryPath — existing test at line 53-59, keep as-is (documents fallback)
- **Integration tests:** AC1-AC6 are verified by running scans on real repos. Not unit-testable — these are manual verification criteria.
- **Edge cases:** Empty deployments array with primaryPath provided — should return nulls (existing empty-array test covers this shape, but add one with primaryPath to be explicit).

## Dependencies

None. All infrastructure exists.

## Constraints

- `detectDeployment` must remain a pure function with no filesystem access.
- The `primaryPath` parameter must be optional to preserve backward compatibility.
- Engine files have zero CLI dependencies — no chalk, commander, ora.
- All imports use `.js` extensions.
- Exported functions require `@param` and `@returns` JSDoc tags.

## Gotchas

- The comment at `deployment.ts:30-31` says "Returns the first match (primary source root's deployment in a monorepo)" — this is aspirational documentation that currently describes the wrong behavior. Update it to match the actual new behavior after the change.
- The existing test at line 53-59 asserts `deployments[0]` fallback when multiple entries exist with no primaryPath. This test must be kept — it documents the backward-compatible fallback path.
- `DeploymentEntry.sourceRootPath` uses relative paths (e.g., `'apps/web'`, `'.'`). `census.primarySourceRoot` uses the same convention. The `===` comparison works directly — no path normalization needed.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { foo } from './bar.js'`
- Use `import type` for type-only imports, separate from value imports
- Explicit return types on all exported functions
- Exported functions require `@param` and `@returns` JSDoc tags
- Engine files have zero CLI dependencies
- Prefer early returns over nested conditionals
- Use `| null` for checked-and-empty fields, `?:` for unchecked

### Pattern Extracts

The function to modify (`src/engine/detectors/deployment.ts:32-38`):
```typescript
export function detectDeployment(deployments: DeploymentEntry[]): DetectedDeployment {
  if (deployments.length > 0) {
    const first = deployments[0]!;
    return { platform: first.platform, configFile: first.path };
  }
  return { platform: null, configFile: null };
}
```

The call site (`src/engine/scan-engine.ts:924`):
```typescript
  const deployment = detectDeployment(census.configs.deployments);
```

Existing test pattern (`tests/engine/detectors/ci-detection.test.ts:53-59`):
```typescript
  it('returns first deployment when multiple present', () => {
    const result = detectDeployment([
      { platform: 'Docker', sourceRootPath: '.', path: 'Dockerfile' },
      { platform: 'Vercel', sourceRootPath: '.', path: 'vercel.json' },
    ]);
    expect(result.platform).toBe('Docker');
  });
```

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands
- After `deployment.ts` change: `(cd packages/cli && pnpm vitest run tests/engine/detectors/ci-detection.test.ts)` — Expected: existing 7 tests pass
- After adding new tests: `(cd packages/cli && pnpm vitest run tests/engine/detectors/ci-detection.test.ts)` — Expected: all tests pass including new ones
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2924+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2924 passed, 2 skipped (2926 total)
- Current test files: 124
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2929 tests in 124 files (4-5 new tests in existing file)
- Regression focus: `tests/engine/detectors/ci-detection.test.ts` — all existing tests must continue to pass unchanged
