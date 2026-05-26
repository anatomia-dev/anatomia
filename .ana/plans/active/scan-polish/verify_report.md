# Verify Report: Scan Polish — Detection Gaps + AGENTS.md Quality

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-26
**Spec:** .ana/plans/active/scan-polish/spec.md
**Branch:** feature/scan-polish

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/scan-polish/contract.yaml
  Seal: INTACT (hash sha256:2769892e5435e2fdc0bae20e67cbfbd45cde6daf30633748b4b3d33e640a1c23)
```

Seal: INTACT. Build: ✅ clean (typecheck + tsup). Tests: 2981 passed, 2 skipped, 0 failed (baseline 2971 — 10 new tests). Lint: 0 errors, 3 pre-existing warnings (none in changed files).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Barrel-index Drizzle schemas aggregate table counts from all files in the directory | ✅ SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:608` (`@ana A001`), creates barrel index + 2 sibling files with 3 sqliteTable calls, asserts `modelCount` toBe(3) and toBeGreaterThan(0) |
| A002 | The barrel file path is preserved as the schema entry point | ✅ SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:608` (`@ana A002`), asserts `result.schemas['drizzle']!.path` toContain('index.ts') |
| A003 | Provider is determined from aggregated table helper counts | ✅ SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:608` (`@ana A003`), asserts `result.schemas['drizzle']!.provider` toBe('sqlite') — all 3 tables use sqliteTable |
| A004 | Single-file schemas with real tables are not affected by the barrel fallback | ✅ SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:637` (`@ana A004`), single file with 3 pgTable calls, asserts modelCount toBe(3) |
| A005 | A schema file with zero tables and no sibling files still reports zero | ✅ SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:655` (`@ana A005`), schema.ts imports pgTable but has no calls, asserts modelCount toBe(0) |
| A006 | Monorepo env example in primary source root is detected | ✅ SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:669` (`@ana A006`), monorepo with `.env.example` in `packages/api/`, asserts `secrets.envExampleExists` toBe(true) |
| A007 | Root-level env example still detected when primary is root | ✅ SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:696` (`@ana A007`), single-package project with `.env.example` at root, asserts `secrets.envExampleExists` toBe(true) |
| A008 | AI sub-provider variants are excluded from AGENTS.md services | ✅ SATISFIED | `packages/cli/tests/commands/agents-md.test.ts:41` (`@ana A008`), sets aiSdk='Vercel AI', includes 3 sub-provider services, asserts not.toContain('Vercel AI (OpenAI)') etc. |
| A009 | Direct SDK services are preserved even when AI SDK sub-providers are filtered | ✅ SATISFIED | `packages/cli/tests/commands/agents-md.test.ts:41` (`@ana A009`), same test, asserts toContain('OpenAI') standalone |
| A010 | AGENTS.md includes a Surfaces section for monorepo projects | ✅ SATISFIED | `packages/cli/tests/commands/agents-md.test.ts:83` (`@ana A010`), 2 surfaces, asserts toContain('## Surfaces') |
| A011 | Surface entries show name and path | ✅ SATISFIED | `packages/cli/tests/commands/agents-md.test.ts:83` (`@ana A011`), asserts toContain('- cli (packages/cli)') |
| A012 | Surface entries include framework when present | ✅ SATISFIED | `packages/cli/tests/commands/agents-md.test.ts:83` (`@ana A012`), asserts toContain('Next.js') via website surface line |
| A013 | Single-package projects do not get a Surfaces section | ✅ SATISFIED | `packages/cli/tests/commands/agents-md.test.ts:100` (`@ana A013`), empty surfaces array, asserts not.toContain('## Surfaces') |
| A014 | More than 4 surfaces shows truncation indicator | ✅ SATISFIED | `packages/cli/tests/commands/agents-md.test.ts:112` (`@ana A014`), 6 surfaces, asserts toContain('+2 more') and not.toContain('- admin') |
| A015 | Stale comment about allDeps is updated to reflect three-tier model | ✅ SATISFIED | Source inspection: `packages/cli/src/engine/scan-engine.ts:754` now reads "payments, aiSdk) use three-tier resolution: primary → workspace → allDeps." — no longer contains "stay on allDeps" |
| A016 | Stale line reference is corrected to ~659 | ✅ SATISFIED | Source inspection: `packages/cli/src/engine/scan-engine.ts:763` reads "primaryRoot was resolved above (line ~659)" — contains "~659" |

16/16 assertions SATISFIED.

## Independent Findings

Predictions resolved — all 5 predicted failure modes were properly handled by the builder. No surprises in the implementation logic.

Code review of all changed files (scan-engine.ts: 47 lines added, assets.ts: 28 lines added) and both new test files found clean, well-structured code that follows existing patterns. The barrel fallback reuses the same regex patterns from the scoring loop (lines 452-456). The surfaces section mirrors the terminal display truncation pattern from state.ts. The AI sub-provider filter correctly guards on `stack.aiSdk` nullity.

One area warranting note: the env enrichment heuristic at line 1000-1002 uses `startsWith('.env') && endsWith('.example')` which is slightly broader than what `detectSecrets` might check — but this is reasonable since it's a re-check for a specific directory and the heuristic covers standard naming patterns.

## AC Walkthrough

- **AC1:** ✅ PASS — Barrel file test at scanProject.test.ts:608 creates openstatus-like structure (barrel index + sibling table files), asserts modelCount=3. Test passes.
- **AC2:** ✅ PASS — Monorepo env test at scanProject.test.ts:669 puts `.env.example` in `packages/api/`, asserts envExampleExists=true. Test passes.
- **AC3:** ✅ PASS — AI collapse test at agents-md.test.ts:41 filters "Vercel AI (OpenAI)" etc. while preserving standalone "OpenAI". Additional test at line 66 verifies no filtering when aiSdk is null. Tests pass.
- **AC4:** ✅ PASS — Surfaces section tested: rendered when surfaces>0 (agents-md.test.ts:83), omitted when empty (agents-md.test.ts:100). Tests pass.
- **AC5:** ✅ PASS — scan-engine.ts:751-754 comment accurately describes three-tier model. Verified by source inspection.
- **AC6:** ✅ PASS — scan-engine.ts:763 references "line ~659". Verified by source inspection.
- **AC7:** ✅ PASS — Single-file schema test at scanProject.test.ts:637 shows modelCount=3 unchanged. Test passes.
- **AC8:** ✅ PASS — Full suite: 2981 passed, 0 failed, 2 skipped. Baseline was 2971. Zero regressions.
- **Tests pass with `pnpm vitest run`:** ✅ PASS — 2981 passed across 127 test files.
- **No lint errors:** ✅ PASS — 0 errors (3 pre-existing warnings, none in changed files).

## Blockers

None. All 16 contract assertions satisfied. All 10 acceptance criteria pass. No regressions (2981 tests, baseline 2971). No unused exports in new code — `generateAgentsMd` export is used by test and documented as `@internal`. No unhandled error paths — all new try/catch blocks follow the engine's empty-catch graceful degradation pattern. No assumptions about external state — barrel expansion uses same `SCHEMA_GLOB_OPTS` and `rootPath` as surrounding code. No missing edge cases from spec — null aiSdk guard, zero-surface guard, and single-file-schema non-interference all tested.

## Findings

- **Code — Barrel glob matches .d.ts files:** `packages/cli/src/engine/scan-engine.ts:483` — `${dir}/**/*.ts` matches TypeScript declaration files. Benign because the `pgTable\s*\(` / `sqliteTable\s*\(` regexes won't match declaration content, but an explicit `!**/*.d.ts` exclusion would be more precise.
- **Code — Env enrichment heuristic divergence:** `packages/cli/src/engine/scan-engine.ts:1000` — The enrichment check uses `f.startsWith('.env') && f.endsWith('.example')` which is slightly different from whatever `detectSecrets` uses internally. If `detectSecrets` changes its patterns, the enrichment could produce inconsistent results. Worth keeping in sync on future changes.
- **Test — generateAgentsMd exported for test access:** `packages/cli/src/commands/init/assets.ts:340` — Function changed from private to `export` with `@internal` JSDoc. This is the documented pattern per testing standards, but TypeScript doesn't enforce `@internal`. Consumers could import it. Accepted per project convention.
- **Code — No blank line after overflow indicator:** `packages/cli/src/commands/init/assets.ts:403` — When surfaces overflow, the `+2 more` line is followed by `lines.push('')` which does add a blank separator. On closer inspection this is correct — the empty string push at line 405 is inside the outer if block and runs after the overflow branch. Not a real issue.
- **Upstream — Contract A001 uses weak matcher:** Contract specifies `greater` with value 0, but the test correctly asserts `toBe(3)` — the specific value. The contract could be `equals: 3` for tighter verification. Minor — the test is already stronger than the contract requires.

## Deployer Handoff

Five independent changes, all additive. No migration needed. No config changes. The `generateAgentsMd` export is `@internal` — won't affect public API surface. The barrel fallback only activates for census-resolved Drizzle configs with zero direct tables, so existing scan results for non-barrel schemas are unchanged. The env enrichment only fires when `primarySourceRoot !== '.'`, so single-package projects are unaffected. AGENTS.md changes only apply to new inits (existing files are skipped via early return at line 342).

## Verdict
**Shippable:** YES

16/16 contract assertions satisfied. 10/10 acceptance criteria pass. 2981 tests pass (10 new, 0 regressions). Clean build, clean lint. All five changes are well-scoped, follow existing patterns, and include proper edge case coverage. The findings are all observations — no blockers.
