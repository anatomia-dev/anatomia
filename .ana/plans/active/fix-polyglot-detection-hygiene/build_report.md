# Build Report: Polyglot detection hygiene

**Created by:** AnaBuild
**Date:** 2026-05-20
**Spec:** .ana/plans/active/fix-polyglot-detection-hygiene/spec.md
**Branch:** feature/fix-polyglot-detection-hygiene

## What Was Built
- `packages/cli/src/engine/detectors/projectType.ts` (modified): Expanded JSDoc at `detectProjectType` to document both priority orders (polyglot: Python → Rust → Ruby → Go; fallthrough: Python → Go → Rust → Ruby → PHP) with note that the difference is intentional. Added `indicators.push('Cargo.toml')` before the existing `pnpm-workspace.yaml` push in both Tauri discriminator branches (Tier 3 and Tier 4).
- `packages/cli/tests/engine/detectors/polyglot.test.ts` (modified): Added two new tests after the existing "Python wins over Rust" test — one with all four competing manifests (Python wins at 0.90), one with Python removed (Rust wins at 0.90).

## PR Summary

- Add missing `Cargo.toml` indicator to both Tauri discriminator branches so Tauri scan output includes all relevant manifest files
- Document both polyglot priority orders in `detectProjectType` JSDoc — polyglot tier (Python → Rust → Ruby → Go) vs fallthrough (Python → Go → Rust → Ruby → PHP) — noting the intentional difference
- Add two regression tests verifying the full four-way polyglot priority cascade: Python wins when all four compete, Rust wins when Python is absent

## Acceptance Criteria Coverage

- AC1 "docstring documents both priority orders" → projectType.ts JSDoc now contains both orders and "intentionally" note ✅
- AC2 "Tauri indicators contain Cargo.toml in both tiers" → Added `indicators.push('Cargo.toml')` in Tier 3 (line ~203) and Tier 4 (line ~253) ✅
- AC3 "all four manifests → Python at 0.90" → polyglot.test.ts "Python wins when all four competing manifests are present" (2 assertions) ✅
- AC4 "three manifests without Python → Rust at 0.90" → polyglot.test.ts "Rust wins when Python is absent but three competitors remain" (2 assertions) ✅
- AC5 "existing polyglot tests pass unchanged" → 35 original tests pass, 0 modified ✅
- AC6 "tests pass with vitest run" → 2715 passed, 2 skipped ✅
- AC7 "no build errors" → typecheck + build succeed, 0 lint errors ✅

## Implementation Decisions

- Placed `indicators.push('Cargo.toml')` before `indicators.push('pnpm-workspace.yaml')` in both Tauri branches, matching the spec's instruction and the output mockup order (`["package.json", "pnpm-lock.yaml", "Cargo.toml", "pnpm-workspace.yaml"]`).
- Used `fastapi` and `uvicorn` as Python deps in the all-four test (spec said "e.g., `fastapi`"), differentiating from the existing Python-vs-Rust test which uses `torch` and `numpy`.
- Gave Gemfile and go.mod minimal realistic content rather than empty files — spec said "just need to exist" but realistic content avoids fragility if content checks are added later.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run polyglot)
 Test Files  1 passed (1)
      Tests  35 passed (35)
   Duration  219ms
```

### After Changes
```
(cd 'packages/cli' && pnpm vitest run polyglot)
 Test Files  1 passed (1)
      Tests  37 passed (37)
   Duration  431ms

(cd 'packages/cli' && pnpm vitest run)
 Test Files  120 passed (120)
      Tests  2715 passed | 2 skipped (2717)
   Duration  50.96s
```

### Comparison
- Tests added: 2
- Tests removed: 0
- Regressions: none

### New Tests Written
- `polyglot.test.ts`: "Python wins when all four competing manifests are present" (pyproject.toml + Cargo.toml + Gemfile + go.mod → python 0.90), "Rust wins when Python is absent but three competitors remain" (Cargo.toml + Gemfile + go.mod → rust 0.90)

## Verification Commands
```
(cd 'packages/cli' && pnpm run build)
(cd 'packages/cli' && pnpm vitest run polyglot)
(cd 'packages/cli' && pnpm vitest run)
pnpm run lint
```

## Git History
```
2d86e303 [fix-polyglot-detection-hygiene] Fix docstring, Tauri indicators, and priority order tests
```

## Open Issues

Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
