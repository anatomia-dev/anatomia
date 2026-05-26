# Spec: Qualify Validation Finding Title

**Created by:** AnaPlan
**Date:** 2026-05-26
**Scope:** .ana/plans/active/qualify-validation-title/scope.md

## Approach

Two string edits in `validation.ts` to change the finding titles from false-precision exact counts to qualified approximations. The warn title gets a tilde prefix and softer language ("may lack" instead of "have no"). Both titles change "routes" to "route files" since the check operates on files, not individual HTTP handlers. The pass title adds "detected" to signal methodology.

The detail text (line 116) is untouched — it already explains the limitation. The severity threshold (line 110) is untouched — out of scope.

AGENTS.md generation is confirmed safe: `assets.ts:449-458` uses `f.id` lookup, not `f.title`.

## Output Mockups

Warn (current):
```
⚠ 185/464 API routes have no validation imports
```

Warn (new):
```
⚠ ~185 of 464 API route files may lack input validation
```

Pass (current):
```
✓ All 10 API routes have validation imports
```

Pass (new):
```
✓ All 10 API route files have validation imports detected
```

## File Changes

### `packages/cli/src/engine/findings/rules/validation.ts` (modify)
**What changes:** Two template literal title strings — the pass title at line 103 and the warn title at line 115.
**Pattern to follow:** Same file, same interpolation pattern. Just different string content.
**Why:** The current title presents a heuristic (30-line import window) as an exact count. The tilde and "may lack" communicate the check's actual confidence level.

Pass title (line 103): change from:
```
`All ${routeFiles.length} API routes have validation imports`
```
to:
```
`All ${routeFiles.length} API route files have validation imports detected`
```

Warn title (line 115): change from:
```
`${unvalidated}/${routeFiles.length} API routes have no validation imports`
```
to:
```
`~${unvalidated} of ${routeFiles.length} API route files may lack input validation`
```

Do NOT touch line 110 (severity threshold) or line 116-117 (detail text).

### `packages/cli/tests/engine/findings/rules/validation.test.ts` (modify)
**What changes:** Update expected title strings in assertions that match against the old format.
**Pattern to follow:** Existing `toContain` assertions — keep using partial matching, just update the substring.
**Why:** Tests assert on title content. The title format changed.

Assertions to update:
- Line 40: `toContain('/15')` → `toContain('of 15 API route files')`
- Line 75: `toContain('3')` — still valid as-is (matches "All 3 API route files...")
- Line 121: `toContain('12/12')` → `toContain('~12 of 12 API route files')`

### `packages/cli/tests/engine/findings/validation.test.ts` (modify)
**What changes:** Update expected title strings in assertions that match against the old format.
**Pattern to follow:** Same as above.
**Why:** Same reason — title format changed.

Assertions to update:
- Line 47: `toContain('All 2 API routes')` → `toContain('All 2 API route files')`
- Line 63: `toContain('11/12')` → `toContain('~11 of 12 API route files')`
- Line 89: `toContain('1/1')` → `toContain('~1 of 1 API route files')`

Note on line 89: This is 1 route file, singular. However — the current code uses `routeFiles.length` which produces "1 API route files" (plural). This is grammatically wrong but matches the existing pattern (no pluralization logic exists anywhere in the finding rules). Keep it plural to match codebase convention. The singular edge case is cosmetic and out of scope.

## Acceptance Criteria

- [x] AC1: Warn title renders as `~{n} of {total} API route files may lack input validation`
- [x] AC2: Pass title renders as `All {total} API route files have validation imports detected`
- [x] AC3: AGENTS.md constraint continues to fire for warn-severity validation findings (no code change needed — uses `f.id`)
- [x] AC4: Existing tests pass with updated expected title strings
- [x] AC5: `ana scan` on a project with routes shows the new format
- [ ] Tests pass: `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors: `pnpm run build`

## Testing Strategy

- **Unit tests:** Update existing assertions in both test files to match new title format. No new tests needed — the behavior (counting, severity thresholds, detection) is unchanged.
- **Edge cases:** The `1/1` case in `validation.test.ts` line 89 — verify it renders with tilde and "of" format. The pass case with small counts — verify no tilde appears.

## Dependencies

None.

## Constraints

- Do not change the `detail` text or severity threshold logic.
- The `f.id` field (`api-validation`) must remain unchanged.

## Gotchas

- Two separate test files cover the validation rule: one in `tests/engine/findings/rules/` and one in `tests/engine/findings/`. Both need updates. Missing either will cause test failures.
- Line 75 in the rules test (`toContain('3')`) still passes because "3" appears in "All 3 API route files...". Don't change it — it's correct as-is.

## Build Brief

### Rules That Apply
- Engine files have zero CLI dependencies — no chalk, no ora. (Already true, no risk here since we're only changing strings.)
- All imports use `.js` extensions. (No new imports needed.)

### Pattern Extracts

From `packages/cli/src/engine/findings/rules/validation.ts:99-118`:
```typescript
  if (validated.length === routeFiles.length) {
    return {
      id: 'api-validation',
      severity: 'pass',
      title: `All ${routeFiles.length} API routes have validation imports`,
      detail: null,
      category: 'security',
    };
  }

  const unvalidated = routeFiles.length - validated.length;
  const severity = routeFiles.length < 10 ? 'info' : 'warn';

  return {
    id: 'api-validation',
    severity,
    title: `${unvalidated}/${routeFiles.length} API routes have no validation imports`,
    detail: 'Checked top-of-file imports for validation libraries. Routes using\nwrapper-based or middleware-based validation may not be detected.',
    category: 'security',
  };
```

### Proof Context

- `(fix-deep-tier-sampling-C1)` VALIDATION_PATH_PATTERNS false-positive on non-validation imports — not related to this title change, but awareness: the tilde qualifier partially addresses this known inaccuracy in the user-facing messaging.
- `(fix-deep-tier-sampling-C4)` No test for false positive boundary — not related to this change.

### Checkpoint Commands
- After validation.ts edit: `(cd packages/cli && pnpm vitest run tests/engine/findings/rules/validation.test.ts tests/engine/findings/validation.test.ts)` — Expected: tests fail (old title strings don't match)
- After test updates: `(cd packages/cli && pnpm vitest run tests/engine/findings/rules/validation.test.ts tests/engine/findings/validation.test.ts)` — Expected: all pass
- After all changes: `pnpm run test -- --run` — Expected: 2924 tests pass, 124 files
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2924 passed (2 skipped) in 124 files
- Command used: `pnpm run test -- --run`
- After build: 2924 tests in 124 files (no new tests, just updated assertions)
- Regression focus: `tests/engine/findings/rules/validation.test.ts`, `tests/engine/findings/validation.test.ts`
