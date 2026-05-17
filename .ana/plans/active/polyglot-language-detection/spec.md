# Spec: Polyglot Language Detection

**Created by:** AnaPlan
**Date:** 2026-05-17
**Scope:** .ana/plans/active/polyglot-language-detection/scope.md

## Approach

Rewrite the `package.json` detection block in `detectProjectType` (lines 41-48) from a simple early-return to a tiered heuristic that disambiguates polyglot repos. The tiers, in order:

1. **package.json + lockfile + no pyproject.toml** → Node 0.95 (fast path, unchanged)
2. **package.json + workspaces field** → Node 0.90 (monorepo root, definitively Node)
3. **package.json + lockfile + pyproject.toml with real deps** → Python 0.90 (content read required)
4. **package.json + no lockfile + pyproject.toml** → Python 0.85 (exists-check sufficient)
5. **package.json + no lockfile + no competing manifest** → Node 0.70 (weak signal)

A new helper `hasPythonProjectDeps(content: string): boolean` does section-presence detection via regex — checks for `[project]` section with a `dependencies` array containing 1+ entries, OR `[tool.poetry.dependencies]` section with 1+ package entries. This is NOT full TOML parsing — just section-header and key-presence regex matching.

The `frameworkDeps` ternary in scan-engine.ts gets a one-line fix: only use `census.primaryDeps` when the project IS Node AND layout is monorepo. Otherwise always use `deps` (language-specific).

Additionally, `bun.lock` (Bun 1.2+ text-based lockfile) is added alongside the existing `bun.lockb` check.

## Output Mockups

No user-facing output changes. `detectProjectType` returns a `ProjectTypeResult` consumed internally. The effect is that scanning a repo like litellm now produces:

```
Language: Python
Framework: FastAPI
```

Instead of the current incorrect:

```
Language: Node.js
Framework: unknown
```

## File Changes

### packages/cli/src/engine/detectors/projectType.ts (modify)
**What changes:** The `package.json` detection block (lines 41-48) is replaced with the tiered heuristic. A new helper function `hasPythonProjectDeps` is added above `detectProjectType`. The `bun.lock` check is added alongside `bun.lockb`.
**Pattern to follow:** The existing `exists()` helper and lockfile indicator recording pattern (lines 43-46). The new code extends this pattern with conditional content reads.
**Why:** Without this, any repo with package.json (even for frontend tooling) misdetects as Node regardless of primary language.

### packages/cli/src/engine/scan-engine.ts (modify)
**What changes:** The `frameworkDeps` ternary at line 675 adds a type check: `census.layout === 'monorepo' && projectTypeResult.type === 'node'`.
**Pattern to follow:** The existing conditional at that line — it's a one-condition change.
**Why:** Without this fix, a polyglot repo that flips to Python would still route Node deps (from the monorepo census) to Python framework detection, causing no framework match.

### packages/cli/tests/engine/detectors/projectType.test.ts (modify)
**What changes:** The test at line 36-45 ("detects Node.js project from package.json") updates its confidence assertion from 0.95 to 0.70 — bare package.json without a lockfile is now a weaker signal. Additional lockfile invariant tests are added.
**Pattern to follow:** The existing test structure — `createTempDir()`, write files, call `detectProjectType(dir)`, assert result.
**Why:** Ensures the Node fast-path (package.json + lockfile) is preserved as an invariant before polyglot logic is added.

### packages/cli/tests/engine/detectors/polyglot.test.ts (create)
**What changes:** New test file covering the polyglot heuristic specifically — all 5 tiers plus edge cases (malformed pyproject.toml, Poetry format, tooling-only pyproject.toml, workspaces override).
**Pattern to follow:** Identical structure to `projectType.test.ts` — same imports, same `createTempDir` helper, same cleanup pattern.
**Why:** Separating polyglot tests from the base detection tests keeps both files focused and prevents the existing file from growing unwieldy.

## Acceptance Criteria

- [ ] AC1: A repo with `package.json` + `package-lock.json` + `pyproject.toml` containing `[project]` with `dependencies = ["openai", "httpx"]` detects as `type: 'python'`.
- [ ] AC2: A repo with `package.json` + `pnpm-lock.yaml` and NO pyproject.toml detects as `type: 'node'` with confidence 0.95 (unchanged behavior).
- [ ] AC3: A repo with `package.json` + `workspaces` field in package.json detects as `type: 'node'` regardless of pyproject.toml presence.
- [ ] AC4: A repo with `package.json` (no lockfile) + `pyproject.toml` detects as `type: 'python'` with confidence 0.85.
- [ ] AC5: A repo with `package.json` (no lockfile) and NO other manifest detects as `type: 'node'` with confidence 0.70.
- [ ] AC6: A repo with `package.json` + `package-lock.json` + pyproject.toml containing ONLY `[tool.ruff]` (no `[project]`, no `[tool.poetry.dependencies]`) detects as `type: 'node'`.
- [ ] AC7: Anatomia's own repo (`package.json` + `pnpm-lock.yaml`, no pyproject.toml) still detects as `type: 'node'`.
- [ ] AC8: After type flip to Python, `detectFramework` receives Python deps (not Node primaryDeps) and correctly detects FastAPI/Django/Flask.
- [ ] AC9: Lockfile invariant tests exist and pass BEFORE the polyglot logic is implemented: `package.json + any-lockfile + NO-pyproject.toml → MUST be node`.
- [ ] AC10: All existing tests pass (one assertion updated: bare package.json confidence 0.95 → 0.70).
- [ ] AC11: `bun.lock` (Bun 1.2+ text-based lockfile) is recognized alongside `bun.lockb`.
- [ ] Tests pass with `pnpm vitest run`
- [ ] No build errors from `pnpm run build`

## Testing Strategy

- **Unit tests (projectType.test.ts):** Update the bare package.json test confidence from 0.95 to 0.70. Add lockfile invariant tests: for each lockfile type (pnpm-lock.yaml, package-lock.json, yarn.lock, bun.lockb, bun.lock), assert package.json + lockfile + NO pyproject.toml → node 0.95.
- **Unit tests (polyglot.test.ts):** New file testing the polyglot heuristic:
  - package.json + lockfile + pyproject.toml with PEP 621 deps → python
  - package.json + lockfile + pyproject.toml with Poetry deps → python
  - package.json + lockfile + tooling-only pyproject.toml → node
  - package.json + workspaces + pyproject.toml with deps → node (workspaces wins)
  - package.json + no lockfile + pyproject.toml → python 0.85
  - package.json + no lockfile + no pyproject.toml → node 0.70
  - Malformed/unreadable pyproject.toml → falls through to node
  - bun.lock recognized as lockfile indicator
- **Integration-level:** AC8 (frameworkDeps fix) needs a test that verifies the cascade. Recommended approach: in `polyglot.test.ts`, import `detectFramework` alongside `detectProjectType`. Write a test that creates a temp dir with package.json + lockfile + pyproject.toml (containing fastapi in deps), calls `detectProjectType` to get the type, then calls `detectFramework(pythonDeps, type, [])` and asserts `framework === 'fastapi'`. This proves the frameworkDeps path uses Python deps when type flips. The scan-engine.ts ternary fix enables this cascade — the test proves the cascade works end-to-end at the detector level without needing full scan-engine integration.
- **Edge cases:** Empty pyproject.toml, pyproject.toml with `[project]` but empty `dependencies = []`, pyproject.toml with only `[tool.ruff]` and `[tool.black]`.

## Dependencies

None. All affected files exist. No new packages required.

## Constraints

- Zero additional I/O for the common case (package.json + lockfile, no pyproject.toml). The content read only triggers when pyproject.toml coexists.
- Engine files must remain pure — no chalk, no CLI dependencies.
- The `hasPythonProjectDeps` helper must not crash on malformed input. Wrap in try/catch, return false on failure.
- `bun.lock` is a text-based file (Bun 1.2+), distinct from `bun.lockb` (binary). Both must be checked.

## Gotchas

- **Don't import `parsePyprojectToml`:** The full parser in `parsers/python/pyproject.ts` extracts dependency names. The type detection helper only needs to know "does a project section with deps EXIST?" — different question, different function. Importing the full parser creates unnecessary coupling and does more work than needed.
- **The `readFile` for pyproject.toml must use utf-8 encoding explicitly.** Without it, Node returns a Buffer in some edge cases.
- **`[project]` with empty `dependencies = []` is NOT a Python project.** The check must verify 1+ entries in the array — a project section with zero deps is likely a tool config that adopted PEP 621 metadata format but has no actual Python dependencies.
- **Workspaces check must handle both array and object format.** In package.json, `workspaces` can be `["packages/*"]` (array) or `{"packages": ["packages/*"]}` (object, Yarn). Check for the key's existence, not its value shape.
- **The test ordering matters for AC9.** The lockfile invariant tests should be committed or at least run BEFORE the polyglot logic is added, to prove the fast-path is preserved. In practice this means: write the invariant tests first, run them (they pass against current code), then add the polyglot logic and verify they still pass.
- **`pyproject.toml` that has BOTH `[project]` with deps AND is in a repo with workspaces:** Workspaces wins. The check order is: workspaces → polyglot → bare. This prevents monorepo roots (which definitively ARE Node) from flipping.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Engine files have zero CLI dependencies — no chalk, no commander.
- Explicit return types on exported functions. Internal helpers can use inference.
- Prefer early returns over nested conditionals.
- Error handling in engine: catch internally and return defaults. Never crash the scan.
- Use `| null` for fields that were checked and found empty.
- Always use `--run` with pnpm vitest to avoid watch mode.

### Pattern Extracts

From `packages/cli/src/engine/detectors/projectType.ts` lines 41-48 (the block being replaced):
```typescript
  // Node.js / JavaScript / TypeScript
  if (await exists(path.join(rootPath, 'package.json'))) {
    indicators.push('package.json');
    if (await exists(path.join(rootPath, 'pnpm-lock.yaml'))) indicators.push('pnpm-lock.yaml');
    if (await exists(path.join(rootPath, 'package-lock.json'))) indicators.push('package-lock.json');
    if (await exists(path.join(rootPath, 'yarn.lock'))) indicators.push('yarn.lock');
    if (await exists(path.join(rootPath, 'bun.lockb'))) indicators.push('bun.lockb');
    return { type: 'node', confidence: 0.95, indicators };
  }
```

**Implementation note:** `projectType.ts` already imports `node:fs/promises` as `fs` and has a local `exists()` helper (line 19). No new imports are needed for `fs.readFile` calls — use the existing `fs` import directly.

From `packages/cli/src/engine/scan-engine.ts` lines 675-678 (the ternary to patch):
```typescript
  const frameworkDeps = census.layout === 'monorepo'
    ? Object.keys(census.primaryDeps)
    : deps;
  const frameworkResult = detectFramework(frameworkDeps, projectTypeResult.type, census.configs.frameworkHints);
```

From `packages/cli/tests/engine/detectors/projectType.test.ts` lines 14-34 (test infrastructure pattern):
```typescript
describe('detectProjectType', () => {
  const tempDirs: string[] = [];

  // Helper to create a temp directory
  async function createTempDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'anatom-test-'));
    tempDirs.push(dir);
    return dir;
  }

  // Cleanup after each test
  afterEach(async () => {
    for (const dir of tempDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch {
        // Ignore cleanup errors
      }
    }
    tempDirs.length = 0;
  });
```

### Proof Context

scan-engine.ts has one active finding: A017 (Node AI SDK unchanged) has no dedicated test. Not relevant to this build — different assertion from a different scope.

No active proof findings for projectType.ts.

### Checkpoint Commands

- After writing lockfile invariant tests: `(cd packages/cli && pnpm vitest run tests/engine/detectors/projectType.test.ts --run)` — Expected: all existing + new invariant tests pass
- After writing polyglot.test.ts (before implementation): `(cd packages/cli && pnpm vitest run tests/engine/detectors/polyglot.test.ts --run)` — Expected: tests FAIL (implementation doesn't exist yet — confirms tests are actually testing something)
- After implementation complete: `(cd packages/cli && pnpm vitest run --run)` — Expected: 2405+ tests pass, 0 failures
- Build: `(cd packages/cli && pnpm run build)` — Expected: clean build
- Lint: `pnpm run lint` — Expected: no errors

### Build Baseline
- Current tests: 2405 passed, 2 skipped (2407 total)
- Current test files: 106
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2425+ tests in 107 files (1 new test file, ~20 new tests)
- Regression focus: `tests/engine/detectors/projectType.test.ts` (confidence assertion change), any scan-engine integration tests that assert project type
