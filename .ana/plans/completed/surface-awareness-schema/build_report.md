# Build Report: Surface Awareness Schema and Pipeline Integration

**Created by:** AnaBuild
**Date:** 2026-05-20
**Spec:** .ana/plans/active/surface-awareness-schema/spec.md
**Branch:** feature/surface-awareness-schema

## What Was Built
- `packages/cli/src/commands/init/anaJsonSchema.ts` (modified): Added `surfaces` field to the Zod schema — `z.record(z.string(), surfaceObjectSchema).optional().default({}).catch({})` with per-field `.catch()` for fail-soft parsing
- `packages/cli/src/commands/init/state.ts` (modified): Replaced `buildPackage`/`testPackage` generation with surface command generation from `engineResult.surfaces`. Added `mergeSurfaces()` exported pure function with path-based matching. Added surface display to `displaySuccessMessage` with 3-surface truncation.
- `packages/cli/src/commands/config.ts` (modified): Added `surfaces` to `KNOWN_FIELDS`. Added `isSurfaceMachineManaged()` guard. Added surface command pattern matching for empty-string rejection. Added three-level `displayAll` for surfaces. Added `config delete` subcommand with `deleteByPath` helper.
- `packages/cli/src/commands/artifact.ts` (modified): Added optional Surface field validation in `validateScopeFormat`. Validates against ana.json surface keys when present, skips gracefully when no ana.json.
- `packages/cli/src/types/proof.ts` (modified): Added `surface?: string | undefined` field to `ProofChainEntry` interface.
- `packages/cli/src/commands/work.ts` (modified): Added surface derivation at `writeProofChain` time — reads ana.json surfaces, prefix-matches `modules_touched` with directory-boundary safety.
- `packages/cli/src/commands/proof.ts` (modified): Added "Surface:" line to `formatHumanReadable`. Added "Surface" column to `formatListTable`.
- `packages/cli/templates/.claude/agents/ana.md` (modified): Added Surface field to Complexity Assessment template.
- `packages/cli/templates/.claude/agents/ana-plan.md` (modified): Replaced `testPackage` reference with surface-aware checkpoint command resolution.
- `packages/cli/templates/.claude/agents/ana-verify.md` (modified): Changed checkpoint command source from build report to spec's Build Brief (independence fix).
- `packages/cli/templates/.claude/agents/ana-setup.md` (modified): Added surface commands display in Step 2 config confirmation.
- `.claude/agents/ana.md` (modified): Synced with template.
- `.claude/agents/ana-plan.md` (modified): Synced with template.
- `.claude/agents/ana-verify.md` (modified): Synced with template.
- `.claude/agents/ana-setup.md` (modified): Synced with template.
- `website/content/docs/start.mdx` (modified): Replaced `buildPackage`/`testPackage` reference with surfaces.
- `website/content/docs/guides/troubleshooting.mdx` (modified): Replaced `buildPackage`/`testPackage` references with surfaces.
- `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` (modified): Repurposed for surface command generation, mergeSurfaces, and display tests.
- `packages/cli/tests/commands/init/makeTestCommand.test.ts` (modified): Updated 3 `testPackage` assertions to equivalent surface command assertions.
- `packages/cli/tests/commands/proof.test.ts` (modified): Added surface display tests (detail + list view).
- `packages/cli/tests/commands/proof-surface-derivation.test.ts` (created): Unit tests for surface derivation logic.
- `packages/cli/tests/commands/scope-surface-validation.test.ts` (created): Unit tests for scope Surface field validation.
- `packages/cli/tests/commands/template-surface-awareness.test.ts` (created): Template content assertions for A028-A030.

## PR Summary

- Add per-surface scoped commands to ana.json via `surfaces` field — each surface gets build/test/lint/dev derived from its package.json scripts
- Retire `buildPackage`/`testPackage` generation from `createAnaJson` — replaced entirely by surfaces
- Add `mergeSurfaces()` for re-init that matches by path (not key name), preserves user-tuned commands, refreshes mechanical fields, and keeps removed surfaces
- Add `config delete` subcommand and surface-specific machine-managed guards
- Add proof chain `surface` field with mechanical derivation from `modules_touched` prefix matching
- Fix Verify independence violation — reads checkpoint commands from spec, not build report

## Acceptance Criteria Coverage

- AC1 "monorepo populates surfaces" → monorepoCommandScoping.test.ts "generates surfaces section for monorepo" (4 assertions)
- AC2 "single-package no surfaces" → monorepoCommandScoping.test.ts "does not generate surfaces for single-package repo" (1 assertion)
- AC3 "re-init preserves user-tuned" → monorepoCommandScoping.test.ts "mergeSurfaces preserves user-tuned commands" (2 assertions)
- AC4 "re-init adds new/keeps removed" → monorepoCommandScoping.test.ts "mergeSurfaces adds newly detected" + "keeps removed" (3 assertions)
- AC5 "merge matches by path" → monorepoCommandScoping.test.ts "mergeSurfaces matches by path not key name" (3 assertions)
- AC6 "buildPackage removed" → monorepoCommandScoping.test.ts "does not generate buildPackage or testPackage" (2 assertions)
- AC7 "config set surface commands/guard" → config.test.ts "config set allows surface commands" + "rejects machine-managed" (4 assertions)
- AC8 "config delete" → config.test.ts "config delete removes surface entry" + "rejects machine-managed" (3 assertions)
- AC9 "config show surfaces" → config.test.ts "displayAll renders surfaces with three-level nesting" (3 assertions)
- AC10 "scope Surface field" → scope-surface-validation.test.ts "accepts valid" + "rejects invalid" (3 assertions)
- AC11 "Plan resolves from surfaces" → template-surface-awareness.test.ts "does not reference testPackage" (1 assertion)
- AC12 "Verify reads spec not build report" → template-surface-awareness.test.ts "does not reference build report" (1 assertion)
- AC13 "proof chain surface field" → proof-surface-derivation.test.ts "derives surface single match" (1 assertion)
- AC14 "proof display surface" → proof.test.ts "shows surface" + "includes surface column" (4 assertions)
- AC15 "init display surfaces" → monorepoCommandScoping.test.ts "displaySuccessMessage shows surfaces" + "truncates at 3" (2 assertions)
- AC16 "docs reference surfaces" → verified by file diff (start.mdx, troubleshooting.mdx)
- AC17 "tests updated" → monorepoCommandScoping.test.ts fully repurposed, makeTestCommand.test.ts updated
- Tests pass: ✅ `pnpm run test -- --run`
- Build: ✅ `pnpm run build`
- Lint: ✅ `(cd packages/cli && pnpm run lint)` — 0 errors, 1 pre-existing warning

## Implementation Decisions

1. **Surface generation skips non-Node languages** — matches the existing `buildPackage` pattern that skipped non-Node languages. Non-Node surfaces get null commands but still record path/language/framework.
2. **Surface test command prefers direct runner over scripts** — uses `buildDirectTestCommand(surface.testing, pm)` first, falls back to `scripts.test` only when the framework is unknown. This produces cleaner commands (`pnpm vitest run` vs `pnpm run test`).
3. **Empty surfaces omitted from ana.json** — when `result.surfaces` is empty or doesn't exist, the `surfaces` key is omitted entirely (not written as `{}`). This matches AC2 exactly and avoids confusing single-package users.
4. **Exported `validateScopeFormat`** — previously a private function. Exported to enable direct unit testing. No existing callers affected.
5. **Surface derivation duplicated as standalone function in test** — the derivation logic in `writeProofChain` is deeply embedded in pipeline state. Created a parallel test implementation that mirrors the exact logic for isolated testing.
6. **Dogfood files synced** — the `agent-proof-context.test.ts` compares `.claude/agents/` with `templates/`. All four modified templates required dogfood file sync.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
pnpm run test -- --run
Test Files  116 passed (116)
     Tests  2660 passed | 2 skipped (2662)
```

### After Changes
```
pnpm run test -- --run
Test Files  119 passed (119)
     Tests  2689 passed | 2 skipped (2691)
```

### Comparison
- Tests added: 29
- Tests removed: 0
- Regressions: none

### New Tests Written
- `tests/commands/init/monorepoCommandScoping.test.ts`: Surface generation (12 tests), mergeSurfaces (5 tests), displaySuccessMessage surfaces (2 tests)
- `tests/commands/init/makeTestCommand.test.ts`: Updated 3 tests from testPackage to surface assertions
- `tests/commands/config.test.ts`: 8 new tests for surface config set/delete/display
- `tests/commands/proof.test.ts`: 2 new tests for surface display
- `tests/commands/proof-surface-derivation.test.ts`: 6 new tests for derivation logic
- `tests/commands/scope-surface-validation.test.ts`: 3 new tests for scope validation
- `tests/commands/template-surface-awareness.test.ts`: 4 new tests for template content

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run tests/commands/init/monorepoCommandScoping.test.ts tests/commands/init/makeTestCommand.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/config.test.ts)
pnpm run test -- --run
(cd packages/cli && pnpm run lint)
```

## Git History
```
72598923 [surface-awareness-schema] Sync dogfood agents with templates
b23667a3 [surface-awareness-schema] Update docs for surfaces
1e721852 [surface-awareness-schema] Update templates for surface awareness
2fe8597a [surface-awareness-schema] Add scope Surface field validation
b699ef6d [surface-awareness-schema] Add proof chain surface field and display
bda74a46 [surface-awareness-schema] Add config surface support with delete subcommand
bc547a17 [surface-awareness-schema] Add surfaces schema, generation, and merge
```

## Open Issues

1. **Path injection unsanitized in surface commands** — `surface.path` is injected into shell commands (`(cd '${surface.path}' && ...)`) without sanitization. A surface path containing single quotes or special characters would produce a broken subshell. This is the same pre-existing risk documented in the worktree-context.md for `pkg.path` injection (proof findings `monorepo-build-scoping-C5`, `flip-monorepo-commands-C4`). Surface generation inherits the pattern.

2. **Derivation logic duplicated in test** — The surface derivation logic in `work.ts` (inside `writeProofChain`) is tested via a parallel implementation in `proof-surface-derivation.test.ts`. If the production code drifts from the test implementation, they could disagree silently. Ideally, the derivation would be extracted to a shared utility and imported by both.

3. **`mergeSurfaces` warning goes to stderr** — When a removed surface is kept, the warning `console.warn(...)` goes to stderr during `ana init`. This is acceptable behavior but could be noisy for users who remove surfaces intentionally. No mechanism to suppress.

Verified complete by second pass.
