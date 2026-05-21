# Spec: Polyglot detection hygiene

**Created by:** AnaPlan
**Date:** 2026-05-20
**Scope:** .ana/plans/active/fix-polyglot-detection-hygiene/scope.md

## Approach

Three independent fixes in the polyglot detector, bundled because they share context:

1. **Docstring update.** The JSDoc at `detectProjectType` (line 129-135) documents the non-package.json fallthrough order but omits the polyglot tier priority inside the package.json branch. Add a line documenting the polyglot order (Python → Rust → Ruby → Go) and note that it intentionally differs from the non-package.json order (Python → Go → Rust → Ruby → PHP) — the polyglot path uses content checks while the fallthrough path uses existence checks.

2. **Tauri indicator fix.** Both Tauri discriminator paths (Tier 3 at line 202-204, Tier 4 at line 251-252) push `pnpm-workspace.yaml` to indicators but omit `Cargo.toml`. The non-Tauri Rust path correctly includes it. Add `indicators.push('Cargo.toml')` before the existing `indicators.push('pnpm-workspace.yaml')` in both Tauri branches. Indicators are display-only — no production code reads them for branching.

3. **Priority order regression tests.** Add two tests to `polyglot.test.ts` that create all four competing manifests alongside package.json + lockfile. Test 1: all four present → Python wins at 0.90. Test 2: Python removed → Rust wins at 0.90.

## Output Mockups

No user-visible output changes. The docstring is developer-facing. The indicator fix changes scan.json output for Tauri projects only — adding `Cargo.toml` to the `indicators.projectType` array. The tests are additive.

Tauri scan.json indicator change (before → after):
```
Before: ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]
After:  ["package.json", "pnpm-lock.yaml", "Cargo.toml", "pnpm-workspace.yaml"]
```

## File Changes

### `packages/cli/src/engine/detectors/projectType.ts` (modify)
**What changes:** (1) Expand the JSDoc at line 129-135 to document both priority orders. (2) Add `indicators.push('Cargo.toml')` before the existing `pnpm-workspace.yaml` push in both Tauri branches (line 202-203 and line 251-252).
**Pattern to follow:** Existing JSDoc style at line 129-135. Existing `indicators.push()` calls throughout the function.
**Why:** The docstring omission makes the priority order undiscoverable without reading the if-else cascade. The missing indicator makes Tauri scan output inconsistent with the non-Tauri Rust path.

### `packages/cli/tests/engine/detectors/polyglot.test.ts` (modify)
**What changes:** Add two new tests after the existing "Python wins over Rust" test at line 596-612.
**Pattern to follow:** The "Python wins over Rust" test at line 596 — same structure: `createTempDir()`, write manifest files, call `detectProjectType()`, assert `type` and `confidence`.
**Why:** No existing test verifies the full four-way priority. This guards the documented order against accidental reordering.

## Acceptance Criteria

- [ ] AC1: The `detectProjectType` docstring documents both priority orders — non-package.json fallthrough AND polyglot tier priority — with a note that the orders differ intentionally.
- [ ] AC2: A Tauri project's indicators array contains `Cargo.toml` in both Tier 3 (lockfile present) and Tier 4 (no lockfile) paths.
- [ ] AC3: A test with all four competing manifests (pyproject.toml with real deps + Cargo.toml with [workspace] + Gemfile + go.mod) alongside package.json + lockfile asserts the result is Python at 0.90 confidence.
- [ ] AC4: A test with three competing manifests (Cargo.toml with [workspace] + Gemfile + go.mod) alongside package.json + lockfile — no pyproject.toml — asserts the result is Rust at 0.90 confidence.
- [ ] AC5: Existing polyglot tests continue to pass unchanged.
- [ ] AC6: Tests pass with `(cd 'packages/cli' && pnpm vitest run)`
- [ ] AC7: No build errors

## Testing Strategy

- **Unit tests:** Two new tests in `polyglot.test.ts` following the existing `createTempDir` + `writeFile` + `detectProjectType` + `expect` pattern. No new test infrastructure needed.
- **Integration tests:** None — the indicator fix is display-only and the docstring is documentation.
- **Edge cases:** The pyproject.toml in the all-four test MUST contain real dependencies (e.g., `dependencies = ["fastapi"]`). A tooling-only pyproject.toml falls through to Node. The Cargo.toml MUST have a `[workspace]` section. Without it, the Rust path doesn't fire. The go.mod and Gemfile just need to exist — no content checks for those languages.

## Dependencies

None. All changes are within existing files.

## Constraints

- Engine files have zero CLI dependencies — no chalk, no commander, no ora. Both files being modified already comply.
- Indicators are display-only. The fix must not introduce any logic that branches on indicator contents.

## Gotchas

- The `pyproject.toml` in the all-four test must have real dependencies. A bare `[project]` section or a `[tool.ruff]`-only file falls through Python detection and the test would assert the wrong winner.
- The `Cargo.toml` must have `[workspace]` (not `[workspace.members]` under `[package]`). The `hasRustWorkspace` check looks for the `[workspace]` header specifically.
- The existing Tauri test at line 471 asserts `indicators.toContain('pnpm-workspace.yaml')` — this still passes. It does not assert array length or exact contents. No existing test needs updating.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Engine files (`src/engine/`) have zero CLI dependencies.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Empty catch blocks in engine are intentional graceful degradation — don't add logging.
- Always use `--run` with pnpm vitest to avoid watch mode hang.

### Pattern Extracts

The structural analog — "Python wins over Rust" test at `polyglot.test.ts:596-612`:
```typescript
  // @ana A014
  it('Python wins over Rust when both compete alongside package.json', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "ml-pipeline"
dependencies = ["torch", "numpy"]
`);
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[workspace]
members = ["crates/*"]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.90);
  });
```

The Tauri indicator pattern at `projectType.ts:201-204` (the code to fix):
```typescript
          if (hasTauriWorkspaceDep(cargoContent) && hasPnpmWorkspace) {
            indicators.push('pnpm-workspace.yaml');
            return { type: 'node', confidence: 0.85, indicators };
          }
```

### Proof Context
- `projectType.ts`: Finding C5 (priority ordering untested) — directly addressed by AC3/AC4. Finding C1 (stale docstring) — directly addressed by AC1. Finding C3 (Tauri missing Cargo.toml indicator) — directly addressed by AC2.
- `polyglot.test.ts`: No active findings relevant to this build.

### Checkpoint Commands
- After docstring + indicator changes to `projectType.ts`: `(cd 'packages/cli' && pnpm vitest run polyglot)` — Expected: all existing polyglot tests pass
- After adding new tests: `(cd 'packages/cli' && pnpm vitest run polyglot)` — Expected: existing + 2 new tests pass
- After all changes: `pnpm run test -- --run` — Expected: 2715 tests pass (2713 + 2 new)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2713 passed, 2 skipped (2715 total)
- Current test files: 120
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected 2715 passed (2713 + 2 new), 2 skipped, in 120 test files
- Regression focus: `polyglot.test.ts` — existing Tauri tests that assert on indicators
