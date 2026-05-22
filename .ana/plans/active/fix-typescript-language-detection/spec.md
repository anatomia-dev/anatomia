# Spec: Fix TypeScript Language Detection for Monorepos and Multi-Directory Projects

**Created by:** AnaPlan
**Date:** 2026-05-22
**Scope:** .ana/plans/active/fix-typescript-language-detection/scope.md

## Approach

Expand the TypeScript override block at scan-engine.ts:853-861 from a two-check to a three-tier detection. The structure stays the same — a post-detection fixup gated on `stack.language === 'Node.js'`. No restructuring.

**Tier 1** (unchanged): `existsSync(path.join(rootPath, 'tsconfig.json'))`.

**Tier 2** (one addition): Add `census.rootDevDeps['typescript'] !== undefined` to the existing `hasTsDep` check. Currently `hasTsDep` only checks `allDeps`, which for monorepos merges workspace package deps only — root devDeps are separate. Budibase has typescript as a root devDependency (monorepo toolchain), invisible to `allDeps`. The fix is `allDeps['typescript'] !== undefined || census.rootDevDeps['typescript'] !== undefined`.

**Tier 3** (new, gated): When Tiers 1 and 2 both miss, check for `tsconfig.json` in four subdirectories: `frontend`, `backend`, `server`, `web`. Uses `existsSync` (already imported). Only runs when the cheap checks fail — short-circuit via the existing `if (hasTsConfig || hasTsDep)` guard. Fixes infisical (backend/tsconfig.json) and tooljet (frontend/tsconfig.json).

The Node.js gate (`stack.language === 'Node.js'`) remains the outer guard. Non-Node projects (Go, Python, Rust, null) never enter this block. This prevents false positives like Memos (Go project with `web/tsconfig.json`).

## Output Mockups

Before fix — budibase scan:
```
Stack      Node.js · ...
```

After fix — budibase scan:
```
Stack      TypeScript · ...
```

The change is a single field value. No new output, no new commands.

## File Changes

### packages/cli/src/engine/scan-engine.ts (modify)
**What changes:** Expand the TypeScript override block (currently lines 853-861). Tier 2 adds `census.rootDevDeps['typescript']` to the dep check. Tier 3 adds a subdirectory tsconfig check after the existing `if` block, gated on `!hasTsConfig && !hasTsDep`.
**Pattern to follow:** The existing override block structure — same variable naming (`hasTsConfig`, `hasTsDep`), same `existsSync` usage, same conditional upgrade pattern.
**Why:** Four repos (budibase, infisical, tooljet, immich) incorrectly detect as Node.js instead of TypeScript.

### packages/cli/tests/engine/detectors/detection-overrides.test.ts (modify)
**What changes:** Add new test cases to the existing "TypeScript language detection" describe block.
**Pattern to follow:** The three existing tests in this file — `scanProject(tempDir, { depth: 'surface' })` with temp dir fixtures. Use `fs.mkdtemp` for setup, `fs.rm` in afterEach (already handled by the existing beforeEach/afterEach).
**Why:** The three new detection tiers need coverage — rootDevDeps-only, subdirectory-tsconfig-only, and the Node.js gate for non-Node languages.

## Acceptance Criteria

- [ ] AC1: Budibase scan produces `stack.language: "TypeScript"` (was "Node.js")
- [ ] AC2: Infisical scan produces `stack.language: "TypeScript"` (was "Node.js")
- [ ] AC3: Tooljet scan produces `stack.language: "TypeScript"` (was "Node.js")
- [ ] AC4: Repos currently detecting as TypeScript remain TypeScript (no regression)
- [ ] AC5: Non-Node.js repos (Go, Python, Rust, null) are unaffected by the change
- [ ] AC6: Tier 3 is short-circuited when Tier 1 or Tier 2 already matches
- [ ] AC7: Unit test covers typescript-in-rootDevDeps-only scenario (budibase case)
- [ ] AC8: Unit test covers subdirectory-tsconfig-only scenario (infisical/tooljet case)
- [ ] AC9: Unit test covers the Node.js gate blocking non-Node languages
- [ ] Tests pass with `(cd 'packages/cli' && pnpm vitest run)`
- [ ] No build errors

## Testing Strategy

- **Integration tests:** All tests call `scanProject()` end-to-end, same as the 3 existing tests in the file. This tests the full census → allDeps → override chain.
- **Tier 2 test (budibase case):** Create a pnpm monorepo fixture — root package.json with `devDependencies: { typescript: '5.0.0' }`, a `pnpm-workspace.yaml`, and a workspace package whose deps do NOT include typescript. No root tsconfig.json. Assert `stack.language === 'TypeScript'`.
- **Tier 3 test (subdirectory tsconfig):** Create a single-repo fixture — root package.json with no typescript dep, no root tsconfig.json, but a `server/tsconfig.json`. Assert `stack.language === 'TypeScript'`.
- **Node.js gate test:** Create a fixture with NO package.json (so language detects as null or non-Node) but WITH a `web/tsconfig.json`. Assert `stack.language` is NOT 'TypeScript'. This confirms the gate prevents false positives.
- **Regression coverage:** The 3 existing tests in `detection-overrides.test.ts` already cover Tier 1 (root tsconfig) and Tier 1 via dep (typescript in devDeps of a single-repo). These must continue to pass unchanged.
- **Edge cases:**
  - Tier 3 with multiple matching subdirs — only one needs to exist, `some()` returns on first match
  - Tier 2 sufficiency — monorepo fixture with rootDevDeps typescript but NO subdirectory tsconfigs, proving Tier 2 alone upgrades to TypeScript (A007)
  - Multiple subdirectory tsconfigs — fixture with tsconfig.json in both `server/` and `web/`, confirming `some()` handles multiple matches (A008)

## Dependencies

None. The `existsSync` import and `census.rootDevDeps` are already available at the override site.

## Constraints

- No new imports needed.
- Engine code must stay pure — no chalk, no CLI dependencies.
- The subdirectory list is exactly `['frontend', 'backend', 'server', 'web']` — no speculative additions.

## Gotchas

- **Monorepo test setup requires `pnpm-workspace.yaml`:** Without a workspace config file, `@manypkg/get-packages` treats the project as single-repo, and root devDeps flow into `allDeps` via sourceRoots. The Tier 2 test only proves something if the census actually separates rootDevDeps from allDeps — which requires the monorepo path. Include a `pnpm-workspace.yaml` with a `packages` glob and at least one workspace package directory with its own `package.json`.
- **`census.rootDevDeps` is always safe to access:** Defaults to `{}` via nullish coalescing at census.ts:460. No null guard needed.
- **Dynamic import in existing tests:** The existing tests use `await import('../../../src/engine/scan-engine.js')` for `scanProject`. The newer `scanProject.test.ts` uses a static import. Either works — follow the pattern of the file you're modifying (detection-overrides uses dynamic import).

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Engine files have zero CLI dependencies — no chalk, no ora.
- Use `existsSync` (sync) for filesystem checks in the override block, matching the existing Tier 1 pattern.
- Exported functions require `@param` and `@returns` JSDoc. Internal changes to the existing function body don't need new JSDoc.
- Temp directories in tests use `fs.mkdtemp(path.join(os.tmpdir(), 'ana-...-'))` pattern.
- Test cleanup uses `fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })`.

### Pattern Extracts

**The override block to expand** (scan-engine.ts:853-861):
```typescript
  // TypeScript override: ONLY upgrade Node.js → TypeScript
  // Don't override null (could be Python/Go project with tsconfig for tooling)
  if (stack.language === 'Node.js') {
    const hasTsConfig = existsSync(path.join(rootPath, 'tsconfig.json'));
    const hasTsDep = allDeps['typescript'] !== undefined;
    if (hasTsConfig || hasTsDep) {
      stack.language = 'TypeScript';
    }
  }
```

**Existing test structure** (detection-overrides.test.ts:14-63):
```typescript
describe('TypeScript language detection', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-ts-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('detects TypeScript when tsconfig.json exists alongside package.json', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'ts-app', dependencies: { next: '14.0.0' } })
    );
    await fs.writeFile(
      path.join(tempDir, 'tsconfig.json'),
      '{ "compilerOptions": { "strict": true } }'
    );

    const { scanProject } = await import('../../../src/engine/scan-engine.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    expect(result.stack.language).toBe('TypeScript');
  });
```

**Tier 3 addition** — add after the existing `if (hasTsConfig || hasTsDep)` block, inside the Node.js gate (scan-engine.ts):
```typescript
    // Tier 3: subdirectory tsconfig — covers projects like infisical, tooljet
    // where tsconfig.json lives in frontend/, backend/, server/, or web/
    if (!hasTsConfig && !hasTsDep) {
      const tsSubdirs = ['frontend', 'backend', 'server', 'web'];
      const hasSubdirTsConfig = tsSubdirs.some(dir =>
        existsSync(path.join(rootPath, dir, 'tsconfig.json'))
      );
      if (hasSubdirTsConfig) {
        stack.language = 'TypeScript';
      }
    }
```

### Proof Context
- A017 (Node AI SDK unchanged) has no dedicated test — related to scan-engine.ts but orthogonal to this change. No overlap with current contract assertions.
- No active proof findings for detection-overrides.test.ts.

### Checkpoint Commands
- After modifying scan-engine.ts: `(cd 'packages/cli' && pnpm vitest run detection-overrides)` — Expected: existing 3 TS tests still pass
- After adding new tests: `(cd 'packages/cli' && pnpm vitest run detection-overrides)` — Expected: all tests pass (3 existing + new)
- After all changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: 2762+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2762 passed, 2 skipped (2764 total)
- Current test files: 120
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected 2765+ tests in 120 files (3+ new tests, same file)
- Regression focus: detection-overrides.test.ts, scanProject.test.ts (share the same engine code path)
