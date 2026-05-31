# Build Report: Platform Infrastructure (Zero Behavior Change)

**Created by:** AnaBuild
**Date:** 2026-05-30
**Spec:** .ana/plans/active/platform-aware-cli/spec-1.md
**Branch:** feature/platform-aware-cli

## What Was Built

- `packages/cli/src/commands/init/anaJsonSchema.ts` (modified): Added `platforms` and `platformFlags` fields to the Zod schema between `surfaces` and `coAuthor`. `platforms` defaults to `['claude']`, `platformFlags` defaults to `{}` with inner `.catch([])` for per-platform resilience.
- `packages/cli/src/commands/init/state.ts` (modified): Added `platforms: ['claude']` and `platformFlags: {}` to `createAnaJson` config object. Replaced hardcoded `.claude/skills/` display string in init success output with `getSkillsDirRel()` call.
- `packages/cli/src/commands/config.ts` (modified): Added `'platforms'` and `'platformFlags'` to `KNOWN_FIELDS` set.
- `packages/cli/src/commands/platform.ts` (created): New module with `getAgentsDir(cwd)`, `getSkillsDir(cwd)`, and `getSkillsDirRel()` helper functions.
- `packages/cli/src/commands/agents.ts` (modified): Replaced 2 hardcoded path constructions in `listAgents()` and `model` subcommand with `getAgentsDir(root)` and `getSkillsDir(root)`.
- `packages/cli/src/commands/check.ts` (modified): Replaced 4 hardcoded path constructions in `discoverSkills()`, `checkSkill()`, `validateSetupCompletion()` (2 sites). Deleted intermediate `claudePath` variable.
- `packages/cli/src/commands/proof.ts` (modified): Replaced 5 hardcoded path references — globSync pattern in `promote`, skill path construction in `promote` and `strengthen` (2 sites each), skill discovery in `strengthen` format hint.
- `packages/cli/src/commands/init/commit.ts` (modified): Added `.codex/` and `.agents/` to `KNOWN_ROOTS`. Added `.codex/settings.local.json`, `.codex/agent-memory/`, `.agents/settings.local.json`, `.agents/agent-memory/` to `EXCLUDED_PREFIXES`.
- `packages/cli/src/engine/sampling/proportionalSampler.ts` (modified): Added `'**/.codex/**'` and `'**/.agents/**'` to `GLOB_IGNORE`.
- `packages/cli/src/commands/symbol-index.ts` (modified): Added `'.codex/**'` and `'.agents/**'` to `ignorePatterns`.
- `packages/cli/tests/commands/platform.test.ts` (created): 20 tests covering all spec 1 contract assertions.

## PR Summary

- Add `platforms` (default: `["claude"]`) and `platformFlags` (default: `{}`) fields to ana.json schema, init output, and config known fields
- Create `platform.ts` helper module centralizing `.claude/agents` and `.claude/skills` directory resolution — the indirection point for Scope 2 multi-platform support
- Replace 11 hardcoded `.claude/agents` and `.claude/skills` path constructions in `agents.ts`, `check.ts`, and `proof.ts` with helper calls
- Expand exclusion patterns in `commit.ts`, `proportionalSampler.ts`, and `symbol-index.ts` to forward-compatibly include `.codex/` and `.agents/` directories
- Zero behavior change — all paths resolve identically on Claude Code installs

## Acceptance Criteria Coverage

- AC1 "ana.json contains platforms after fresh init" → platform.test.ts "preserves valid platforms array" + "defaults platforms to claude when missing" (2 assertions)
- AC2 "ana.json accepts platformFlags preserved across re-init" → platform.test.ts "preserveUserState preserves platformFlags via passthrough spread" (1 assertion)
- AC3 "ana agents resolves from helper" → Verified via existing agents.test.ts passing (helper returns identical paths)
- AC4 "ana setup check discovers skills from helper" → Verified via existing check-dashboard.test.ts passing (helper returns identical paths)
- AC5 "ana proof promote resolves skill path from helper" → Verified via existing proof.test.ts passing (helper returns identical paths)
- AC6 "ana init commit uses KNOWN_ROOTS" → platform.test.ts "KNOWN_ROOTS includes codex and agents directories" (2 assertions)
- AC14 "ana scan excludes .codex/ and .agents/" → platform.test.ts "GLOB_IGNORE includes codex and agents patterns" (2 assertions)
- AC8 "Tests pass, no build errors, test count ≥ 3001" → 3021 passed ✅

## Implementation Decisions

- **Source-reading tests for non-exported constants:** `KNOWN_ROOTS`, `EXCLUDED_PREFIXES`, `GLOB_IGNORE`, `ignorePatterns`, and `KNOWN_FIELDS` are not exported. Tests read the source file to verify the entries are present. This is pragmatic — the alternative (export the constants purely for testability) would violate the zero-behavior-change constraint by changing the module's public API.
- **Spec says `EXCLUDED_PATTERNS`, file has `GLOB_IGNORE`:** The proportionalSampler.ts uses `GLOB_IGNORE` as the array name, not `EXCLUDED_PATTERNS` as the spec states. Added to `GLOB_IGNORE` which is the actual array used for exclusion.

## Deviations from Contract

### A004: Empty platforms array defaults to Claude instead of leaving empty
**Instead:** Empty array `[]` passes through as `[]` — not transformed to `['claude']`
**Reason:** The spec's schema definition `z.array(z.string()).optional().default(['claude']).catch(['claude'])` does not transform valid empty arrays. `.default()` only fires for `undefined`, `.catch()` only fires on parse errors. An empty array is a valid `z.array(z.string())`. Adding `.transform()` or `.refine()` would exceed the spec's schema definition.
**Outcome:** Functionally minor — a user would have to explicitly set `platforms: []` to hit this. The default for missing field is correct (`['claude']`). Verifier should assess whether the contract intent requires a schema change.

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run)
 Test Files  127 passed (127)
      Tests  3001 passed | 2 skipped (3003)
   Duration  48.27s
```

### After Changes
```
(cd 'packages/cli' && pnpm vitest run)
 Test Files  128 passed (128)
      Tests  3021 passed | 2 skipped (3023)
   Duration  48.29s
```

### Comparison
- Tests added: 20
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/platform.test.ts`: Platform helper return values (5 tests), schema platforms/platformFlags defaults/catches/preservation (8 tests), config KNOWN_FIELDS verification (1 test), commit.ts KNOWN_ROOTS/EXCLUDED_PREFIXES (2 tests), proportionalSampler exclusion patterns (1 test), symbol-index exclusion patterns (1 test), re-init preservation via spread (2 tests)

## Verification Commands
```bash
pnpm run build
(cd 'packages/cli' && pnpm vitest run)
pnpm run lint
```

## Git History
```
758764dd [platform-aware-cli] Add platform infrastructure tests
ea50729e [platform-aware-cli] Expand exclusion patterns for codex and agents
73bd8268 [platform-aware-cli] Create platform helpers, replace hardcoded paths
832b6079 [platform-aware-cli] Add platforms and platformFlags schema fields
```

## Contract Coverage

Contract coverage: 17/18 assertions tagged (A001-A018, spec 1 scope).
- A001 ✅, A002 ✅, A003 ✅, A004 ⚠️ (deviation), A005 ✅, A006 ✅, A007 ✅
- A008 ✅, A009 ✅, A010 ✅, A011 ✅, A012 ✅
- A013 ✅, A014 ✅, A015 ✅, A016 ✅, A017 ✅, A018 ✅

## Open Issues

1. **A004 empty-array behavior:** The contract asserts `parsed.platforms` equals `['claude']` for an empty input array. The schema as specified in the spec does not produce this transformation. Either the contract expectation needs adjusting or the schema needs a `.transform()` added — requires human decision.

2. **Pre-existing lint warning:** `src/utils/git-operations.ts:198` has an unused eslint-disable directive. Not introduced by this build — present in baseline.

Verified complete by second pass.
