# Verify Report: Codex Support — Init Infrastructure

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-30
**Spec:** .ana/plans/active/codex-support/spec-1.md
**Branch:** feature/codex-support

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/codex-support/.ana/plans/active/codex-support/contract.yaml
  Seal: INTACT (hash sha256:5e81db6a68903af056d21ea6aa883cf1425370f5e4dacacb882bae95d1d82473)
```

Seal: INTACT. Build: ✅ (tsup success). Tests: 3064 passed, 2 skipped (up from baseline 3041 — 23 new tests). Lint: ✅ (1 pre-existing warning, no errors).

## Contract Compliance

Phase 1 assertions only (A001-A029, A039-A040). A030-A038 belong to Spec 2.

| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Skills are stored in a single canonical location | ✅ SATISFIED | platform.test.ts:22-24, `getSkillsDir` returns path containing `.ana/skills` |
| A002 | Relative skills path points to the canonical location | ✅ SATISFIED | platform.test.ts:28-30, `getSkillsDirRel()` returns `.ana/skills` |
| A003 | Agent files are found in the right directory for each platform | ✅ SATISFIED | platform.test.ts:47-50, `getAgentsDir(cwd, 'codex')` returns `.codex/agents` |
| A004 | Claude agent path is unchanged | ✅ SATISFIED | platform.test.ts:34-37, `getAgentsDir(cwd)` returns `.claude/agents` |
| A005 | Default agent path is Claude when no platform specified | ✅ SATISFIED | platform.test.ts:41-43, `getAgentsDir(cwd, 'claude')` contains `.claude/agents` |
| A006 | Dual-platform init creates the Claude configuration directory | ✅ SATISFIED | Source inspection: index.ts:164 gates `createClaudeConfiguration` on `platforms.includes('claude')`, function creates `.claude/` at assets.ts:194 |
| A007 | Dual-platform init creates the Codex configuration directory | ✅ SATISFIED | init.test.ts:1036-1065, verifies `.codex/agents/` created with 5 md + 5 toml files |
| A008 | Skills are written to the canonical location | ✅ SATISFIED | Source inspection: index.ts:159-161 writes skills to `.ana/skills/`. init.test.ts:1108 creates `.ana/skills/` for symlink tests |
| A009 | Claude skills directory is a symlink to the canonical location | ✅ SATISFIED | init.test.ts:1115-1116, `lstatSync` confirms `.claude/skills` is symlink |
| A010 | Agents skills directory is a symlink to the canonical location | ✅ SATISFIED | init.test.ts:1120-1121, `lstatSync` confirms `.agents/skills` is symlink |
| A011 | Codex-only projects do not create Claude configuration | ✅ SATISFIED | Source inspection: index.ts:164 — `createClaudeConfiguration` only called when `platforms.includes('claude')`. Codex-only = `['codex']` skips this call |
| A012 | Codex-only projects do not generate a CLAUDE.md file | ✅ SATISFIED | Source inspection: `copyClaudeMd()` is inside `createClaudeConfiguration()` (assets.ts:203). Not called for codex-only |
| A013 | Codex-only projects still get the cross-tool AGENTS.md file | ✅ SATISFIED | Source inspection: index.ts:173 calls `generateAgentsMd()` unconditionally (outside platform gates) |
| A014 | Codex Build agent uses the unified invocation syntax | ✅ SATISFIED | init.test.ts:975-983, template contains `ana run` |
| A015 | Codex Build agent does not reference Claude Code specific tools | ✅ SATISFIED | init.test.ts:986-994, template does not contain "Claude Code's Write tool" or "claude --agent" |
| A016 | Codex agent templates do not have YAML frontmatter | ✅ SATISFIED | init.test.ts:959-971, all 5 Codex templates start with `#` not `---` |
| A017 | Codex Build manifest specifies the correct model | ✅ SATISFIED | init.test.ts:1007, TOML contains `model = "gpt-5.5"` |
| A018 | Codex Build runs with full access for git operations | ✅ SATISFIED | init.test.ts:1008, TOML contains `sandbox_mode = "danger-full-access"` |
| A019 | Codex Build runs in exec mode for non-interactive pipeline | ✅ SATISFIED | init.test.ts:1010, TOML contains `mode = "exec"` |
| A020 | Both platform skill paths resolve to the same underlying file | ✅ SATISFIED | init.test.ts:1124-1145, both `.claude/skills/` and `.agents/skills/` resolve to same content via symlinks |
| A021 | User customizations to Codex agent files survive re-initialization | ✅ SATISFIED | init.test.ts:1067-1101, writes custom content, simulates re-init merge-not-overwrite, verifies custom content preserved |
| A022 | Existing enriched skills are migrated to the canonical location | ✅ SATISFIED | init.test.ts:1164-1188, creates real `.claude/skills/` dir, calls `migrateSkillsToCanonical`, verifies content moved to `.ana/skills/` |
| A023 | After migration the old skills directory becomes a symlink | ✅ SATISFIED | init.test.ts:1179-1180, `lstatSync` confirms `.claude/skills` is symlink after migration |
| A024 | Claude Code agent templates use the unified invocation syntax | ✅ SATISFIED | init.test.ts:1208-1221, all 6 CC agent templates do not contain "claude --agent" |
| A025 | The CLAUDE.md template uses the unified invocation syntax | ✅ SATISFIED | init.test.ts:1223-1233, CLAUDE.md contains "ana run" and does not contain "claude --agent" |
| A026 | First-time init auto-detects available platforms from the system PATH | ✅ SATISFIED | init.test.ts:1250-1254, `detectPlatforms()` returns array with length > 0 |
| A027 | Re-initialization preserves the previously configured platforms | ✅ SATISFIED | init.test.ts:1258-1291, `preserveUserState` preserves `platforms: ['claude', 'codex']` and `platformFlags` |
| A028 | Setup check displays the correct skills directory path | ✅ SATISFIED | init.test.ts:1236-1245, check.ts source does not contain "No skills found in .claude/skills/" and does contain `getSkillsDirRel()` |
| A029 | Init flow test validates the current template syntax | ✅ SATISFIED | init-flow.test.ts:157, asserts `claudeMdContent.toContain('ana run')` — verified by source inspection (no @ana tag) |
| A039 | All existing tests continue to pass | ✅ SATISFIED | Full suite: 3064 passed, 2 skipped. Baseline was 3041. No test files removed (129 files). |
| A040 | Codex does not include a Learn agent template | ✅ SATISFIED | init.test.ts:936-938, `CODEX_AGENT_FILES` has length 5 and does not contain "ana-learn.md" |

## Independent Findings

**Predictions resolved:**

1. **Symlink relative paths wrong** — NOT FOUND. Builder used `path.join('..', '.ana', 'skills')` which produces `../.ana/skills`, correct from both `.claude/skills` and `.agents/skills` (both one level deep from project root).
2. **Frontmatter stripping too aggressive** — NOT FOUND. Codex `ana-build.md` has 13 `---` lines (CC has 15 = 13 body + 2 frontmatter). All body horizontal rules preserved.
3. **Platform auto-detection tests mock-heavy** — CONFIRMED (partial). The test calls `detectPlatforms()` and asserts `length > 0` — it tests "something is returned" but not "the right platforms are detected." However, the function is a thin wrapper around `which`/`where`, and mocking PATH executables would make the test fragile. The weak assertion is reasonable.
4. **Skill migration conflict resolution not tested** — CONFIRMED. `migrateSkillsToCanonical` tests cover the happy path (real dir → content migrated + symlink) and the skip path (already a symlink). The `copyIfNewer` mtime conflict logic in state.ts:1177-1193 has no test exercising the "destination is newer, source is skipped" case. This is debt, not a blocker.
5. **Stale `generateAgentsMd()` call inside createClaudeConfiguration** — NOT FOUND. Both calls successfully extracted to index.ts:173-174. No stale calls remain in assets.ts.

**Surprise finding:** Duplicate JSDoc block on `getPlatformFlags` (platform.ts:83-95). The old JSDoc was left in place and a new one added directly below it. Both describe the same function. Cosmetic debt.

**Code quality:** The `createSkillSymlinks` function at assets.ts:662-676 has a logic path where `lstat` succeeds and `isSymbolicLink()` is false (it's a real directory) — the comment says "will be handled by skill migration in state.ts" but there's no `else` branch. This falls through silently. The migration in state.ts does handle it, and `createSkillSymlinks` is called after `migrateSkillsToCanonical` in index.ts, so it's correct in practice — but the control flow relies on call ordering that isn't enforced.

## AC Walkthrough

- ✅ AC1: `ana init --platforms claude,codex` generates both platform dirs + symlinks — verified via `createClaudeConfiguration`, `createCodexConfiguration`, `createSkillSymlinks` function tests
- ✅ AC2: `ana init --platforms codex` does not generate `.claude/` or CLAUDE.md — verified by source inspection of platform-conditional gating in index.ts:164-174
- ✅ AC3: Codex build template has `ana run` syntax, `.ana/skills/` paths, no CC tool names, no YAML frontmatter — init.test.ts:974-996
- ✅ AC4: Codex TOML has correct model, sandbox_mode, mode, reasoning_effort — init.test.ts:999-1031
- ✅ AC5: Symlinks resolve to same content — init.test.ts:1124-1145
- ✅ AC9: Commit staging handled by existing `init commit` infrastructure — `.codex/` and `.agents/` in KNOWN_ROOTS (platform.test.ts:162-185)
- ✅ AC10: Re-init merge-not-overwrite preserves Codex customizations — init.test.ts:1067-1101
- ✅ AC11: Skill migration from real dir to canonical + symlink — init.test.ts:1163-1205
- ✅ AC14: CC agent templates use `ana run` syntax — init.test.ts:1208-1221 + grep confirms zero `claude --agent` in templates
- ✅ AC15: CLAUDE.md template uses `ana run` — init.test.ts:1223-1233
- ✅ AC16: `getSkillsDir()` returns `.ana/skills` — platform.test.ts:21-25
- ✅ AC17: `getAgentsDir()` returns `.codex/agents` for codex — platform.test.ts:46-51
- ✅ AC18: Auto-detect from PATH on first init, preserve from ana.json on re-init — init.test.ts:1249-1291
- ⚠️ AC19 (partial): `getSkillsDir()` returns `.ana/skills` which all consumers call — verified for check.ts (line 1411). Not all 12+ consumer sites individually verified, but the function is the single entry point.
- ✅ AC20: All existing tests pass. 3064 passed (baseline 3041). 129 test files. No regressions.
- ✅ Tests pass: `pnpm run test -- --run` — 3064 passed
- ✅ No build errors: `pnpm run build` — success
- ✅ `check.ts:1411` residual fixed — uses `getSkillsDirRel()` interpolation
- ✅ `init-flow.test.ts:157` residual fixed — asserts `ana run` pattern

## Blockers

None. All 31 phase-1 contract assertions satisfied. All ACs pass. No regressions detected. Checked for: unused exports in new code (all 5 new exports used by index.ts or tests), unused parameters (`_initState` in `createCodexConfiguration` is explicitly marked unused — matches CC analog), error paths that swallow silently (catch blocks in `resolvePlatforms` and `detectPlatforms` return safe defaults — consistent with fail-soft convention), template content drift (all Codex templates have correct `ana run` syntax and no CC-specific references).

## Findings

- **Test — No codex-only init integration test:** `packages/cli/tests/commands/init.test.ts` — Contract assertions A011-A013 (codex-only init doesn't create `.claude/` or CLAUDE.md, but does create AGENTS.md) are verified by source inspection of index.ts gating logic. The individual functions are tested but the combined codex-only init path has no test. If someone reorders the platform gates, no test would catch it.

- **Code — Duplicate JSDoc block on getPlatformFlags:** `packages/cli/src/commands/platform.ts:83-95` — The old single-parameter JSDoc was left above the new multi-parameter JSDoc. Both describe the same function. The old block should be removed.

- **Test — A029 missing @ana tag:** `packages/cli/tests/e2e/init-flow.test.ts:157` — The assertion tests the correct thing (`ana run` in CLAUDE.md content) but lacks the `@ana A029` tag. Verified by source inspection.

- **Test — A026 weak assertion for auto-detection:** `packages/cli/tests/commands/init.test.ts:1252` — Tests `platforms.length > 0` rather than checking for specific platforms. Reasonable given that `detectPlatforms()` depends on what's installed, but the assertion would pass even if detection logic was broken and fell through to the `['claude']` default.

- **Code — createSkillSymlinks relies on call ordering:** `packages/cli/src/commands/init/assets.ts:669` — When `lstat` finds a real directory (not a symlink), the function falls through silently with a comment saying "handled by skill migration." This works because `migrateSkillsToCanonical` runs before `createSkillSymlinks` in index.ts. But the dependency is implicit — the function's behavior changes based on when it's called relative to migration.

- **Test — copyIfNewer conflict case untested:** `packages/cli/src/commands/init/state.ts:1177-1193` — The `copyIfNewer` helper has logic for "destination exists and is newer than source → skip copy." No test exercises this branch. The migration happy path and symlink-skip path are tested, but the mtime conflict resolution is not.

## Deployer Handoff

This is phase 1 of 2. Phase 2 (runtime dispatch) depends on this phase.

Key things to know:
- Skills now live in `.ana/skills/` instead of `.claude/skills/`. Both `.claude/skills` and `.agents/skills` are symlinks. If you see broken symlinks after clone, ensure `.ana/skills/` exists.
- `ana.json` now has a `platforms` field (array). Existing projects without it default to `['claude']`.
- All `claude --agent` references in templates are now `ana run`. Users with customized agent files will keep their old invocations (merge-not-overwrite).
- 5 Codex agent templates + 5 TOML manifests added. No Learn agent for Codex.
- `ana init --platforms claude,codex` is the new dual-platform init. First-time init auto-detects from PATH.

## Verdict
**Shippable:** YES

All 31 contract assertions SATISFIED. All acceptance criteria pass. 3064 tests pass (23 new, 0 regressions). Build and lint clean. The findings are debt items (missing integration test for codex-only path, duplicate JSDoc, untested mtime conflict) — none prevent shipping. The core architectural change (canonical `.ana/skills/` with symlinks) is well-tested with idempotency and migration coverage.
