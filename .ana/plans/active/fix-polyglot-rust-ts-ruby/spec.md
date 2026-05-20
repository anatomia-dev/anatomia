# Spec: Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects

**Created by:** AnaPlan
**Date:** 2026-05-19
**Scope:** .ana/plans/active/fix-polyglot-rust-ts-ruby/scope.md

## Approach

Two independent fixes in the polyglot detection heuristic, same disease class: non-Node project with secondary package.json misclassified.

**Fix 1 — Tauri discriminator.** Add a `hasTauriWorkspaceDep(content)` helper that section-scopes to `[workspace.dependencies]` in Cargo.toml, following the `hasPythonProjectDeps` pattern. Inside the existing Tier 3 and Tier 4 Rust checks (where `hasRustWorkspace(cargoContent)` is already true), add a secondary check: if `hasTauriWorkspaceDep(cargoContent)` AND `pnpm-workspace.yaml` exists, return Node instead of Rust. This refinement sits INSIDE the `hasRustWorkspace` conditional — not a separate tier.

**Fix 2 — Ruby competing manifest.** Add `hasGemfile` existence check. Gate the Tier 1 fast path on `!hasGemfile`. Add Ruby Tier 3 (lockfile + Gemfile → Ruby 0.90) and Tier 4 (no lockfile + Gemfile → Ruby 0.85) checks. Insert between Rust and Go in tier ordering: Python → Rust → Ruby → Go.

## Output Mockups

Before (Cap repo):
```
Language: Rust (0.90)
Indicators: package.json, pnpm-lock.yaml, Cargo.toml
```

After (Cap repo):
```
Language: Node (0.85)
Indicators: package.json, pnpm-lock.yaml, pnpm-workspace.yaml
```

Before (Maybe Finance):
```
Language: Node (0.95)
Indicators: package.json, package-lock.json
```

After (Maybe Finance):
```
Language: Ruby (0.90)
Indicators: package.json, package-lock.json, Gemfile
```

## File Changes

### `packages/cli/src/engine/detectors/projectType.ts` (modify)

**What changes:**
1. New `hasTauriWorkspaceDep(content: string): boolean` helper — section-scopes to `[workspace.dependencies]` and checks for `tauri` key within that section. Also checks for `[workspace.dependencies.tauri]` sub-table header anywhere in the file. Returns true if either format matches.
2. Tier 3 Rust check (the block where `hasLockfile && hasCargo` and `hasRustWorkspace(cargoContent)` is true): before returning Rust, check if `hasTauriWorkspaceDep(cargoContent)` AND `pnpm-workspace.yaml` exists. If both true, push `pnpm-workspace.yaml` to indicators and return Node 0.85. If not, fall through to existing Rust 0.90 return.
3. Tier 4 Rust check (the block where `!hasLockfile && hasCargo` and `hasRustWorkspace(cargoContent)` is true): same Tauri discriminator. If both conditions, return Node 0.80. Otherwise existing Rust 0.85.
4. New `hasGemfile` existence check alongside existing `hasPyproject`, `hasCargo`, `hasGoMod` checks.
5. Tier 1 fast path condition: add `&& !hasGemfile`.
6. New Tier 3 Ruby block after Rust, before Go: `if (hasLockfile && hasGemfile)` → push `Gemfile` to indicators, return Ruby 0.90.
7. New Tier 4 Ruby block after Rust, before Go: `if (!hasLockfile && hasGemfile)` → push `Gemfile` to indicators, return Ruby 0.85.

**Pattern to follow:** `hasPythonProjectDeps` at lines 48-98 for section-scoping. The Tauri function is simpler — find section header, slice to next section, check for `^\s*tauri\s*=` within the slice.
**Why:** Cap (sniper customer profile) detects as Rust. Maybe Finance detects as Node. Both are trust-killing misclassifications.

### `packages/cli/tests/engine/detectors/polyglot.test.ts` (modify)

**What changes:** New test cases added to the existing `describe('polyglot language detection')` block. All tests follow the existing pattern: create temp dir, write manifest files, call `detectProjectType(dir)`, assert type/confidence/indicators.

**Tests to add (mapped to acceptance criteria):**

- AC1: Tauri+TS monorepo with pnpm-workspace.yaml → Node 0.85. Write `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `Cargo.toml` with `[workspace]` + `[workspace.dependencies]` containing `tauri = { version = "2.5.0" }`.
- AC2: Rust workspace without tauri dep → Rust 0.90 (unchanged). Already tested by existing "detects Rust when Cargo.toml has [workspace] section" test. No new test needed.
- AC3: Tauri dep but no pnpm-workspace.yaml → Rust 0.90 (pure Tauri desktop app). Write `package.json`, `pnpm-lock.yaml`, `Cargo.toml` with tauri dep but no `pnpm-workspace.yaml`.
- AC4: workspaces field in package.json + Cargo.toml with tauri → Node 0.90 (Tier 2 guard fires first). Already tested. No new test needed.
- AC5: Ruby with lockfile → Ruby 0.90. Write `package.json`, `package-lock.json`, `Gemfile`.
- AC6: Ruby without lockfile → Ruby 0.85. Write `package.json`, `Gemfile`.
- AC7: Node fast path unchanged. Already tested. No new test needed.
- AC8: Regression — existing tests pass without modification.
- AC9: Priority ordering test — `pyproject.toml` (with deps) + `Cargo.toml` (with workspace) + `package.json` + lockfile → Python wins. Tests that code-position ordering (Python before Rust) is deliberate and preserved.
- AC10: Tier 4 Tauri — `package.json` (no lockfile) + `pnpm-workspace.yaml` + `Cargo.toml` with workspace + tauri dep → Node 0.80.
- AC11: Malformed `[workspace.dependencies]` section → falls through to Rust (conservative default). Write `Cargo.toml` with `[workspace]` header but garbled content after `[workspace.dependencies]`.
- AC12: Sub-table format `[workspace.dependencies.tauri]` → detected as having tauri. Write `Cargo.toml` using sub-table format instead of inline.

**Pattern to follow:** Existing tests at lines 284-301 (Rust workspace test).
**Why:** Every acceptance criterion needs a corresponding test. The priority ordering test addresses proof finding rust-go-polyglot-detection-C5.

## Acceptance Criteria

- [ ] AC1: Tauri+TS monorepo (package.json + pnpm-lock.yaml + pnpm-workspace.yaml + Cargo.toml with [workspace] + tauri in [workspace.dependencies]) → Node 0.85
- [ ] AC2: Rust workspace without tauri dep → Rust 0.90 (unchanged)
- [ ] AC3: Tauri dep but no pnpm-workspace.yaml → Rust 0.90 (pure Tauri desktop app)
- [ ] AC4: workspaces field in package.json overrides Tauri check → Node 0.90 (Tier 2 fires first, unchanged)
- [ ] AC5: Ruby with lockfile (package.json + lockfile + Gemfile) → Ruby 0.90
- [ ] AC6: Ruby without lockfile (package.json + Gemfile) → Ruby 0.85
- [ ] AC7: Node fast path (package.json + lockfile + no competing manifests) → Node 0.95 (unchanged)
- [ ] AC8: All existing polyglot tests pass without modification
- [ ] AC9: Priority ordering test: Python + Rust coexist alongside package.json + lockfile → Python wins
- [ ] AC10: Tier 4 Tauri (no lockfile) → Node 0.80
- [ ] AC11: Malformed [workspace.dependencies] falls through to Rust
- [ ] AC12: Sub-table format [workspace.dependencies.tauri] detected correctly
- [ ] Tests pass: `pnpm run test -- --run`
- [ ] No build errors: `pnpm run build`
- [ ] Lint passes: `(cd packages/cli && pnpm run lint)`

## Testing Strategy

- **Unit tests:** All new tests follow the existing polyglot test pattern — temp directory with manifest files, call `detectProjectType()`, assert result shape. No new test infrastructure needed.
- **Integration tests:** Not applicable — `detectProjectType` is a pure function (filesystem reads only). The test IS the integration test.
- **Edge cases:** Malformed Cargo.toml content (AC11), sub-table TOML format (AC12), missing pnpm-workspace.yaml with tauri dep (AC3), priority ordering (AC9).

## Dependencies

None. Both fixes are self-contained changes to the existing detection heuristic.

## Constraints

- `hasTauriWorkspaceDep` MUST section-scope to `[workspace.dependencies]` — whole-file regex would match `"apps/desktop/src-tauri"` in the workspace members array.
- The Tauri discriminator requires BOTH `hasTauriWorkspaceDep(cargoContent)` AND `pnpm-workspace.yaml` existence. Either condition alone is insufficient.
- Ruby `hasGemfile` MUST be added to the Tier 1 fast path gate. Without it, a Ruby project with a lockfile and no other competing manifest would return Node 0.95.
- Engine code: no chalk, no ora, no CLI dependencies. Empty catch blocks are intentional graceful degradation.

## Gotchas

- The `hasTauriWorkspaceDep` check fires INSIDE the existing `hasRustWorkspace` conditional — it refines the Rust path, it doesn't create a new tier. The code flow: `hasRustWorkspace(content)` is true → check `hasTauriWorkspaceDep(content)` + `hasPnpmWorkspace` → if both, return Node; otherwise return Rust.
- Cap's Cargo.toml has `"apps/desktop/src-tauri"` as a workspace MEMBER path string. A naive `/tauri/` regex on the whole file would match this path. The section-scoping to `[workspace.dependencies]` prevents this.
- The `pnpm-workspace.yaml` `exists()` call adds one filesystem check per Tier 3/4 Rust detection. This only fires when `package.json` + `Cargo.toml` + `[workspace]` all exist — a rare path. Compute the check once and reuse for both Tier 3 and Tier 4 (declare `hasPnpmWorkspace` alongside the other manifest checks, or inside the Cargo block since it's only relevant when Cargo exists).
- The existing "fallthrough Node 0.95" at line 178-181 (`hasLockfile` but no competing manifest matched) already handles the case where Gemfile exists but somehow the Ruby check didn't fire. But the Gemfile check is unconditional on content (existence-only), so this fallthrough should never be reached for Ruby.

## Build Brief

### Rules That Apply
- All local imports use `.js` extensions. `import type` for type-only imports.
- Engine files have zero CLI dependencies — no chalk, no commander.
- Empty catch blocks in engine are intentional graceful degradation. New `hasTauriWorkspaceDep` should follow this pattern.
- Explicit return types on exported functions. Helpers can use inference.
- Prefer early returns over nested conditionals.
- Always use `--run` flag with pnpm test to avoid watch mode hang.

### Pattern Extracts

**Section-scoping pattern from `hasPythonProjectDeps` (projectType.ts:48-58):**
```typescript
function hasPythonProjectDeps(content: string): boolean {
  try {
    // PEP 621: [project] section with dependencies = ["pkg", ...]
    const projectMatch = content.match(/^\[project\]\s*$/m);
    if (projectMatch) {
      // Find dependencies array after [project] but before next section
      const projectStart = projectMatch.index! + projectMatch[0].length;
      const nextSection = content.indexOf('\n[', projectStart);
      const projectBlock = nextSection === -1
        ? content.slice(projectStart)
        : content.slice(projectStart, nextSection);
```

**Tier 3 Rust check to modify (projectType.ts:159-169):**
```typescript
    if (hasLockfile && hasCargo) {
      // Tier 3: package.json + lockfile + Cargo.toml with [workspace] → Rust 0.90
      try {
        const cargoContent = await fs.readFile(path.join(rootPath, 'Cargo.toml'), 'utf-8');
        if (hasRustWorkspace(cargoContent)) {
          indicators.push('Cargo.toml');
          return { type: 'rust', confidence: 0.90, indicators };
        }
      } catch {
        // Unreadable Cargo.toml — fall through
      }
    }
```

**Competing manifest checks (projectType.ts:137-143):**
```typescript
    const hasPyproject = await exists(path.join(rootPath, 'pyproject.toml'));
    const hasCargo = await exists(path.join(rootPath, 'Cargo.toml'));
    const hasGoMod = await exists(path.join(rootPath, 'go.mod'));

    if (hasLockfile && !hasPyproject && !hasCargo && !hasGoMod) {
      // Tier 1: package.json + lockfile + no competing manifest → Node 0.95 (fast path)
      return { type: 'node', confidence: 0.95, indicators };
```

**Existing test pattern (polyglot.test.ts:285-301):**
```typescript
  it('detects Rust when Cargo.toml has [workspace] section (with lockfile)', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '');
    await fs.writeFile(path.join(dir, 'Cargo.toml'), `[workspace]
members = ["crates/*"]

[workspace.package]
version = "0.1.0"
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('rust');
    expect(result.confidence).toBe(0.90);
    expect(result.indicators).toContain('Cargo.toml');
  });
```

### Proof Context

- **rust-go-polyglot-detection-C5** (priority ordering untested) — directly addressed by AC9. Builder should add this test.
- **rust-go-polyglot-detection-C4** (unreachable catch in `hasRustWorkspace`) — not in scope, but `hasTauriWorkspaceDep` uses the same regex-only pattern, so its catch block is similarly defensive-only. Fine.

### Checkpoint Commands

- After adding `hasTauriWorkspaceDep` helper + Tier 3/4 modifications: `(cd packages/cli && pnpm vitest run tests/engine/detectors/polyglot.test.ts)` — Expected: all existing tests pass
- After adding Gemfile competing manifest + Ruby tiers: `(cd packages/cli && pnpm vitest run tests/engine/detectors/polyglot.test.ts)` — Expected: all existing tests pass
- After adding all new tests: `(cd packages/cli && pnpm vitest run tests/engine/detectors/polyglot.test.ts)` — Expected: all tests pass including new ones
- After all changes: `pnpm run test -- --run` — Expected: 2548+ tests pass
- Lint: `(cd packages/cli && pnpm run lint)`

### Build Baseline
- Current tests: 2548 passed, 2 skipped (112 test files)
- Command used: `pnpm run test -- --run`
- After build: expected ~2556 tests (8 new: AC1, AC3, AC5, AC6, AC9, AC10, AC11, AC12) in 112 test files
- Regression focus: existing polyglot tests in `polyglot.test.ts` — all must pass unmodified
