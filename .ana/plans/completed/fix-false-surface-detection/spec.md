# Spec: Fix False Surface Detection

**Created by:** AnaPlan
**Date:** 2026-05-21
**Scope:** .ana/plans/active/fix-false-surface-detection/scope.md

## Approach

Non-product workspace packages (examples, templates, e2e fixtures, playgrounds) reach Signal 3 and get classified as surfaces. The fix removes wrong inputs before they reach signal evaluation — a path-segment pre-filter, same pattern as the existing INFRA_PATTERNS check.

Two changes:
1. **Detection pre-filter** — new `isNonProductPath` predicate in `surfaces.ts`, inserted after the INFRA_PATTERNS check (line 228). Checks all path segments against an exclusion set, plus a `-e2e` suffix check on the last segment.
2. **Merge cleanup** — modify `mergeSurfaces()` in `state.ts` to use `isNonProductPath` when deciding what to do with orphaned surfaces. Non-product paths are silently dropped. Product paths are kept with the existing console.warn.

The predicate is exported from `surfaces.ts` — surface-detection domain logic, not a generic utility. The `commands/ → engine/detectors/` import path has established precedent (`artifact.ts` imports from `engine/findings/rules/secrets.js`).

**Design principle applied:** "The elegant solution is the one that removes" — we remove wrong inputs rather than adding complexity to signal logic. And "every change should be foundation" — `isNonProductPath` is reusable for any future feature that needs to distinguish product from non-product paths.

## Output Mockups

No user-visible output changes. The effect is invisible: repos that previously produced false surfaces now produce correct (often zero) surfaces. The only observable change is that `ana.json` surfaces entries for non-product paths disappear on re-init.

Before (repo with `examples/next-app`, `examples/remix-app`):
```json
{
  "surfaces": {
    "next-app": { "path": "examples/next-app", ... },
    "remix-app": { "path": "examples/remix-app", ... }
  }
}
```

After re-init:
```json
{
}
```
(No `surfaces` key at all — omitted when empty, matching fresh-init behavior at state.ts line 559.)

## File Changes

### `packages/cli/src/engine/detectors/surfaces.ts` (modify)
**What changes:** Add `EXCLUDED_SEGMENTS` constant (private), `isNonProductPath` exported predicate, and a pre-filter `continue` after line 228.
**Pattern to follow:** The existing `INFRA_PATTERNS` check at lines 227-228. Same shape: Set of known names, checked against path segments, `if (match) continue`.
**Why:** Without this, Signal 3 classifies any workspace package with a framework config as a surface — including examples, templates, and fixtures that happen to contain `next.config.ts`.

### `packages/cli/src/commands/init/state.ts` (modify)
**What changes:** Two modifications:
1. In `mergeSurfaces()` (line 641-645): replace the unconditional "keep removed surfaces" loop with selective behavior — use `isNonProductPath` to silently drop false surfaces while keeping legitimate orphaned surfaces with the existing console.warn.
2. In `preserveUserState()` (line 768-770): after `mergeSurfaces()` returns, check if the result is empty and delete the `surfaces` key instead of assigning `{}`.
**Pattern to follow:** The empty-check spread at line 559: `...(Object.keys(surfaces).length > 0 ? { surfaces } : {})`. The merge caller should produce the same outcome — no `surfaces` key when empty.
**Why:** Without this, re-init on a repo that previously had false surfaces keeps them forever with a confusing console.warn about surfaces the user never configured.

### `packages/cli/tests/engine/detectors/surfaces.test.ts` (modify)
**What changes:** Add test cases for the non-product pre-filter covering: exact segment exclusion, `-e2e` suffix exclusion, compound names NOT excluded (`test-utils`), case insensitivity, and multiple signals blocked by the pre-filter.
**Pattern to follow:** Existing pre-filter test structure at lines 489-557 — uses `makeRoot()` + `makeCensus()` helpers, asserts `surfaces.toHaveLength(0)` for excluded packages.
**Why:** The pre-filter is the entire fix. If it's wrong, false surfaces persist or legitimate surfaces get excluded.

### `packages/cli/tests/commands/init/state.test.ts` (modify)
**What changes:** Add test cases for `mergeSurfaces()` selective cleanup: non-product orphaned surfaces dropped silently (no console.warn), product orphaned surfaces kept with console.warn, and empty merge result.
**Pattern to follow:** Existing `mergeSurfaces` tests in the same file — find them and follow the same setup/assertion style.
**Why:** The merge cleanup behavior change is the second half of the fix. Must verify both the "drop" and "keep" paths.

## Acceptance Criteria

- [ ] AC1: Repos with false surfaces produce correct surface counts — non-product paths (examples/, example/, example-apps/, templates/, template/, e2e/, test/, tests/, fixtures/, fixture/, playground/, playgrounds/, sandbox/, demos/, demo/, starters/, starter/, samples/, sample/, boilerplate/, references/, reference/) excluded from detection. The authoritative set is 22 entries.
- [ ] AC2: Repos with legitimate surfaces are unaffected — `apps/web`, `packages/cli`, `web/`, `plugins/` paths pass through
- [ ] AC3: Library repos correctly get zero surfaces when all detected surfaces were from non-product paths
- [ ] AC4: Re-init on a repo with false surfaces in ana.json silently drops them — no console.warn for non-product paths
- [ ] AC5: `packages/test-utils` (segment = `test-utils`) is NOT excluded — only exact segment matches trigger exclusion
- [ ] AC6: `apps/gauzy-e2e` (segment = `gauzy-e2e`, ends with `-e2e`) IS excluded via suffix check
- [ ] AC7: `isNonProductPath` is exported from `surfaces.ts` and used by both detection and merge — single source of truth
- [ ] AC8: After merge cleanup produces empty result, `surfaces` key is omitted from ana.json (not written as `"surfaces": {}`)
- [ ] Tests pass: `(cd packages/cli && pnpm vitest run)`
- [ ] No lint errors: `pnpm run lint`

## Testing Strategy

- **Unit tests (surfaces.test.ts):** Test `isNonProductPath` through `detectSurfaces()` — create synthetic roots with non-product paths and verify they're excluded. Cover: each category of excluded segment (at least `examples`, `templates`, `e2e`, `test`, `playground`, `sandbox`, `fixtures`), the `-e2e` suffix rule, compound names that should NOT be excluded (`test-utils`, `demo-app`), case-insensitive matching (`Examples/`, `TEMPLATES/`), and multi-segment paths where an excluded segment appears mid-path (`packages/examples/next-app`).
- **Unit tests (state.test.ts):** Test `mergeSurfaces()` directly — orphaned surface with non-product path dropped silently, orphaned surface with product path kept with console.warn, mixed scenario with both. Test the empty-result handling at the `preserveUserState` caller level if the existing tests provide a pattern for it.
- **Edge cases:** `packages/test-utils` not excluded (exact match only), `apps/gauzy-e2e` excluded (suffix), root `examples` vs nested `packages/examples/app` (both excluded — any segment match), single-segment paths like `examples` with no parent.

## Dependencies

None. Both files exist with established patterns.

## Constraints

- Engine files have zero CLI dependencies — `isNonProductPath` in `surfaces.ts` must not import chalk, commander, or ora.
- The predicate must use exact segment matching (not substring) to avoid false negatives on compound names like `test-utils`.
- Case-insensitive comparison via `.toLowerCase()` for macOS HFS+ compatibility.

## Gotchas

- The `lastSegment` variable at line 227 is already available and can be reused for the `-e2e` suffix check. But the EXCLUDED_SEGMENTS check iterates ALL segments of the path (not just the last one) — `packages/examples/next-app` must be excluded because `examples` is a mid-path segment.
- `relativePath` uses forward slashes even on Windows — comes from `@manypkg/get-packages` normalized paths. Safe to split on `/`.
- The existing `console.warn` at line 643 is for RETAINED orphaned surfaces, not dropped ones. The new code drops non-product surfaces silently (no log), and keeps the console.warn only for product surfaces that are no longer detected.
- The merge caller at `preserveUserState` lines 766-770 enters the merge path when EITHER existing OR fresh surfaces are non-empty. After merge returns `{}`, the caller must check and delete the key — otherwise `"surfaces": {}` persists in ana.json.
- `isNonProductPath` should NOT check the root package path (`.` or `''`). Those are already filtered by the pre-filter at line 221. But if called from `mergeSurfaces` with an orphaned surface that has an unusual path, it should handle gracefully (return false for paths that don't contain excluded segments).

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Constants use SCREAMING_SNAKE_CASE.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Engine files have zero CLI dependencies.
- Prefer early returns over nested conditionals.
- Use `| null` for checked-and-empty fields. Reserve `?:` for unchecked.
- Test behavior, not implementation. Assert on specific expected values.

### Pattern Extracts

**INFRA_PATTERNS pre-filter (surfaces.ts lines 45-52, 227-228) — the structural analog:**
```typescript
// surfaces.ts:45-52
export const INFRA_PATTERNS = new Set([
  'tsconfig',
  'eslint-config',
  'prettier-config',
  'tailwind-config',
  'config-typescript',
  'biome-config',
]);

// surfaces.ts:226-228
    const lastSegment = root.relativePath.split('/').pop() || '';
    if (INFRA_PATTERNS.has(lastSegment)) continue;
```

**Empty-surfaces spread (state.ts line 559) — pattern for omitting empty surfaces:**
```typescript
// state.ts:559
    ...(Object.keys(surfaces).length > 0 ? { surfaces } : {}),
```

**Merge cleanup loop (state.ts lines 641-645) — what to modify:**
```typescript
// state.ts:641-645
  // Keep removed surfaces (never silently delete user state)
  for (const [, { key, entry }] of existingByPath) {
    console.warn(`Surface '${key}' (${entry.path}) no longer detected — keeping existing configuration.`);
    merged[key] = entry;
  }
```

**Merge caller (state.ts lines 766-770) — where to add empty check:**
```typescript
// state.ts:766-770
    const existingSurfaces = ((merged as Record<string, unknown>)['surfaces'] ?? {}) as Record<string, SurfaceEntry>;
    const freshSurfaces = (newAnaConfig['surfaces'] ?? {}) as Record<string, SurfaceEntry>;
    if (Object.keys(freshSurfaces).length > 0 || Object.keys(existingSurfaces).length > 0) {
      (merged as Record<string, unknown>)['surfaces'] = mergeSurfaces(existingSurfaces, freshSurfaces);
    }
```

### Proof Context

**surfaces.ts:** Two code findings — unreachable `@scope` branch in `deriveRawName` and collision disambiguation edge case. Neither affects this change.

**state.ts:** Six findings — path sanitization issues (monorepo-build-scoping-C5, flip-monorepo-commands-C4), empty string handling (command-language-awareness-C3), non-Node empty commands (surface-awareness-schema-C3), null script value (fix-surface-test-priority-C1), scoped JS command test gap. None overlap with the current contract assertions. The path sanitization findings are in different code paths (command generation, not surface merge).

No active proof findings for `surfaces.test.ts`.

### Checkpoint Commands
- After surfaces.ts changes: `(cd packages/cli && pnpm vitest run tests/engine/detectors/surfaces.test.ts)` — Expected: all existing + new tests pass
- After state.ts changes: `(cd packages/cli && pnpm vitest run tests/commands/init/state.test.ts)` — Expected: all existing + new tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2720+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2720 passed, 2 skipped (2722 total)
- Current test files: 120 passed
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2740+ tests in 120 files (new tests added to existing files)
- Regression focus: `tests/engine/detectors/surfaces.test.ts`, `tests/commands/init/state.test.ts`
