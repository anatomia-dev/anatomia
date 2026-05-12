# Build Report: Docs Data Pipeline

**Created by:** AnaBuild
**Date:** 2026-05-12
**Spec:** .ana/plans/active/docs-data-pipeline/spec.md
**Branch:** feature/docs-data-pipeline

## What Was Built

- `website/scripts/extract-docs-data.ts` (created): Single extraction script reading 7 monorepo data sources (proof chain, CLI commands, agent templates, skill templates, gotchas, context files, build meta). Writes 7 JSON files to `website/data/docs/`. Validates completeness and exits non-zero on failure.
- `website/lib/docs-data/types.ts` (created): Shared TypeScript interfaces for all 7 JSON data shapes — ProofEntry (including `rejectionCycles`), AgentTemplate, SkillTemplate, CommandsData, GotchaEntry, ContextFile, BuildMeta, plus ProofStats.
- `website/lib/docs-data/proofs.ts` (created): Typed loader for proof-entries.json. Exports `getProofEntries()` and `getProofStats()`. Rejections computed from `rejectionCycles > 0`.
- `website/lib/docs-data/agents.ts` (created): Typed loader for agent-templates.json. Exports `getAgentTemplates()`, `getAgentByName()`, `getAgentCount()`.
- `website/lib/docs-data/skills.ts` (created): Typed loader for skill-templates.json. Exports `getSkillTemplates()`, `getSkillByName()`, `getSkillCount()`.
- `website/lib/docs-data/commands.ts` (created): Typed loader for commands.json. Exports `getCommands()`, `getCommandCount()`, `getCommandGroups()`.
- `website/lib/docs-data/context.ts` (created): Typed loader for context-files.json. Exports `getContextFiles()`.
- `website/lib/docs-data/gotchas.ts` (created): Typed loader for gotchas.json. Exports `getGotchas()`, `getGotchaCount()`.
- `website/lib/docs-data/meta.ts` (created): Typed loader for build-meta.json. Exports `getBuildMeta()`.
- `website/lib/docs-data/index.ts` (created): Barrel re-exporting all types and loader functions.
- `website/package.json` (modified): Added `"prebuild": "tsx scripts/extract-docs-data.ts"` script and `tsx` devDependency.

## PR Summary

- Add a prebuild extraction pipeline that reads 7 data sources from the monorepo (proof chain, CLI commands, agent/skill templates, gotchas, context files, build meta) and writes typed JSON to `website/data/docs/`
- Create typed loader modules in `website/lib/docs-data/` with build-time caching — page components import `getProofEntries()`, `getAgentTemplates()`, etc. from a single barrel
- Command extraction uses regex parsing across 10 registered command files, handling subcommand nesting via `addCommand()`, `.command()` chains, and cross-file imports (setup → check.ts, symbol-index.ts)
- Agent template extraction merges YAML frontmatter, body-parsed forbidden items, and hardcoded reads/writes arrays per the pipeline architecture
- The prebuild lifecycle hook ensures extraction runs before `next build`, failing fast on any extraction error

## Acceptance Criteria Coverage

- AC1 "pnpm build succeeds with prebuild" → ✅ Verified: `pnpm build` runs extraction then next build successfully
- AC2 "Seven JSON files written" → ✅ Verified: all 7 files created in `website/data/docs/`
- AC3 "Proof entries have computed stage" → ✅ Verified: all 86 entries have stage values (Engine: 9, Templates: 3, Commands: 43, Pipeline: 19, Website: 12)
- AC4 "CLI commands extracted from 10 files" → ✅ Verified: 32 commands extracted including all subcommands (proof: 8, work: 3, artifact: 2, config: 3, setup: 3, agents: 1, verify: 1, pr: 1)
- AC5 "Agent templates include frontmatter + forbidden + reads/writes" → ✅ Verified: 6 agents with model, forbidden arrays (ana-build: 8, ana-verify: 8, ana-plan: 4, ana-learn: 6, ana/ana-setup: 0), reads/writes
- AC6 "Skill templates include frontmatter and sections" → ✅ Verified: 8 skills each with 4 sections (Detected, Rules, Gotchas, Examples)
- AC7 "Typed loaders return correct data" → 🔨 Implemented: all loader functions created with correct return types and caching
- AC8 "build-meta.json has version/commitSha/buildTimestamp" → ✅ Verified: version=1.0.2, commitSha from git, ISO timestamp
- AC9 "Extraction deletes data/docs/ and validates completeness" → ✅ Verified: rmSync before write, validation checks for entry counts
- AC10 "Exits non-zero on error" → 🔨 Implemented: process.exit(1) on validation failure or unhandled error
- Tests pass → ✅ Verified: 2178 passed, 2 skipped (identical to baseline)
- No TypeScript errors → ✅ Verified: `pnpm typecheck` clean
- Prebuild lifecycle hook wires correctly → ✅ Verified: `pnpm build` triggers extraction automatically

## Implementation Decisions

- **Command count is 32, not 27:** The spec expected 27 commands but didn't count subcommands added via cross-file imports (setup: check, complete, index) or inline `.command()` chains (verify: pre-check, pr: create). The actual count of 32 is correct — all registered commands and their subcommands are captured.
- **Cross-file command parsing:** setup.ts uses `createCheckCommand()` imported from check.ts and `createIndexCommand()` from symbol-index.ts. The extraction script follows these imports and parses the `return new Command(...)` pattern in the target files.
- **Multiline chain handling:** Commands like `verifyCommand\n    .command('pre-check')` span multiple lines. The extraction collapses whitespace to match these chains reliably.
- **eslint-disable for no-explicit-any:** Proof chain entries have dynamic shape from JSON.parse. Used `Record<string, any>` with an inline eslint-disable comment rather than defining a full interface for the external data format.

## Deviations from Contract

None — contract followed exactly.

## Fix History

- **Rejection count fix:** Initial implementation computed rejections as `result !== 'PASS'` (yielding 1). Corrected to use `rejection_cycles > 0` from the proof chain data, which correctly identifies 19 entries that went through FAIL → fix → PASS cycles during their pipeline run.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  100 passed (100)
     Tests  2178 passed | 2 skipped (2180)
  Duration  39.45s
```
Tests: 2178 passed, 0 failed, 2 skipped

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  100 passed (100)
     Tests  2178 passed | 2 skipped (2180)
  Duration  42.02s
```
Tests: 2178 passed, 0 failed, 2 skipped

### Comparison
- Tests added: 0 (website has no test infrastructure per spec)
- Tests removed: 0
- Regressions: none

### New Tests Written
None — per spec's Testing Strategy: "Unit tests: None for the extraction script itself — the website package has no test infrastructure. Verification is the build succeeding with data flowing through."

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
cd website && pnpm typecheck
cd website && npx tsx scripts/extract-docs-data.ts
```

## Git History
```
6a157e3 [docs-data-pipeline] Fix: compute rejections from rejection_cycles field
23037c7 [docs-data-pipeline] Build report
2c0186b [docs-data-pipeline] Fix lint error in extraction script
9bdcb37 [docs-data-pipeline] Wire prebuild into website build lifecycle
faad612 [docs-data-pipeline] Add typed loader modules and barrel index
71388d6 [docs-data-pipeline] Add types and extraction script
```

## Open Issues

1. **Command count discrepancy (32 vs 27):** The spec expected 27 commands but the actual registered command count including all subcommands is 32. The spec miscounted by excluding subcommands from setup (3), verify (1), and pr (1). The extraction is correct — all commands registered in index.ts and their nested subcommands are captured.

2. **Spec says 2 entries missing modules_touched, actual is 11:** The categorization algorithm handles this correctly — the 11 entries without `modules_touched` fall through to keyword matching on `scope_summary` with `Infra` as default. No functional impact.

3. **Loader modules are untested at runtime:** The loaders use `readFileSync` with `process.cwd()` resolution, which works during `next build` but would fail if called from a different working directory. This is the expected usage pattern per spec, but worth noting.

Verified complete by second pass.