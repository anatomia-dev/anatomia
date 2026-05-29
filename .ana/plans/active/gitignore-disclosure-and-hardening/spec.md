# Spec: Gitignore disclosure at init time, commit hardening, and docs

**Created by:** AnaPlan
**Date:** 2026-05-29
**Scope:** .ana/plans/active/gitignore-disclosure-and-hardening/scope.md

## Approach

Three independent additions that close the gaps left after the force-add fix (PR #226):

1. **Init-time disclosure.** After `createClaudeConfiguration` in the init orchestrator (index.ts), call `discoverGitignoredFiles` from commit.ts to detect gitignored infrastructure files. If any are found, push a multi-line warning onto the existing `preflight.warnings` array before it reaches `displaySuccessMessage`. The warning appears in the "Pipeline readiness" section alongside existing warnings (branch mismatch, missing gh CLI, etc.). Pass an empty array for the `dirtyFiles` parameter — at init time there's no dirty set to deduplicate against, and we only need to know WHETHER files are gitignored.

2. **Commit hardening.** In commit.ts, after `discoverDirtyFiles` returns, cross-check the dirty set against `git check-ignore --stdin`. Any dirty file that is also gitignored (tracked from a previous force-add) gets moved from the normal `git add` call to the `git add -f` call. This eliminates the dependency on git's accidental exit-1-but-still-stages behavior. The existing `discoverGitignoredFiles` only catches files NOT in the dirty set (it deduplicates). The hardening needs the inverse: dirty files that ARE gitignored. A new helper function handles this.

3. **Troubleshooting docs.** Add a `TroubleCard` to the "Pipeline problems" section of troubleshooting.mdx covering the "Unknown skill" symptom caused by gitignored `.claude/` files.

## Output Mockups

### Init-time warning (when gitignored files detected)

```
  Pipeline readiness:
    ⚠ Some infrastructure files under .claude/ are gitignored
      ana init commit will force-add them for worktree compatibility.
      Use --respect-gitignore to skip. See: ana init commit --help
```

### Commit hardening (no user-visible change)

The hardening is invisible — files that were previously staged via accidental git behavior are now staged explicitly with `git add -f`. The existing console output (force-add notice, file count, success message) is unchanged.

### Troubleshooting docs card

```
## Unknown skill errors or missing agents in pipeline

Symptom: "Unknown skill: git-workflow" or agents can't find skills/context during pipeline runs.
Cause: Host repo's .gitignore blocks .claude/ or .ana/ directories.
Diagnosis: git ls-files .claude/skills/
Fix: Upgrade to latest Anatomia (npm install -g anatomia-cli). Recent versions auto-detect
     gitignored infrastructure and force-add it during ana init commit.
```

## File Changes

### `packages/cli/src/commands/init/index.ts` (modify)
**What changes:** After `createClaudeConfiguration` (line 131), add a gitignore detection call using `discoverGitignoredFiles`. If files are found, push a warning string onto `preflight.warnings`. Import `discoverGitignoredFiles` from `./commit.js` (already imports `registerInitCommitCommand` from there).
**Pattern to follow:** The existing warning flow — `preflight.warnings` is a `string[]` that flows to `displaySuccessMessage` at line 136. Warnings render as yellow first line + gray subsequent lines (state.ts:1035-1041).
**Why:** Without this, users discover the gitignore override at commit time, after investing time in setup. Disclosure before the investment respects the user's decision.

### `packages/cli/src/commands/init/commit.ts` (modify)
**What changes:** Add a helper function that takes the dirty files array and returns the subset that are also gitignored. In the commit action, after `discoverDirtyFiles`, call this helper. Move gitignored dirty files from the normal staging path to the force-add path. Deduplicate so no file appears in both `git add` calls.
**Pattern to follow:** The existing `discoverGitignoredFiles` function's `git check-ignore --stdin` pattern (lines 238-248). Same spawnSync approach, same exit code handling.
**Why:** Without this, subsequent commits after the initial force-add rely on git's undocumented behavior where `git add <tracked-but-gitignored-file>` exits 1 but still stages. If git changes this behavior, subsequent commits silently break.

### `website/content/docs/guides/troubleshooting.mdx` (modify)
**What changes:** Add a new `TroubleCard` in the "Pipeline problems" section covering gitignore-related skill/agent issues.
**Pattern to follow:** Existing `TroubleCard` components in the same file. Each card has a `title` prop and markdown body with numbered steps.
**Why:** Teams who hit gitignore issues before upgrading have no guidance. This gives them a diagnosis path and fix.

### `packages/cli/tests/commands/init/commit.test.ts` (modify)
**What changes:** Add tests for the new `discoverGitignoredDirtyFiles` helper — the core hardening logic. Test scenarios: dirty file that's also gitignored gets identified; dirty file that's not gitignored returns empty; no dirty files returns empty.
**Pattern to follow:** The existing `discoverGitignoredFiles` test block (lines 606-806) — same temp dir setup, same `.gitignore` creation, same `git check-ignore` verification pattern.
**Why:** The hardening is the safety-critical change — it must be tested to ensure tracked-but-gitignored files are correctly identified and routed to force-add.

## Acceptance Criteria

- [ ] AC1: When `ana init` detects gitignored infrastructure files under `.claude/`, the success output includes a warning in the Pipeline readiness section explaining that `ana init commit` will force-add them.
- [ ] AC2: The warning explains WHY the force-add is necessary (worktree compatibility for Build and Verify agents).
- [ ] AC3: When no `.claude/` files are gitignored, no warning appears (existing behavior unchanged).
- [ ] AC4: On subsequent `ana init commit` calls where tracked infrastructure files are gitignored, those files are staged with `git add -f` instead of the normal `git add`.
- [ ] AC5: The troubleshooting docs page has a section covering gitignore-related skill/agent issues with symptom, cause, diagnosis, and fix.
- [ ] AC6: All existing tests continue to pass.
- [ ] Tests pass with `pnpm run test -- --run`
- [ ] No build errors with `pnpm run build`
- [ ] Lint passes with `pnpm run lint`

## Testing Strategy

- **Unit tests:** Test `discoverGitignoredDirtyFiles` (the new helper) in isolation using the existing temp-dir-with-real-git-repo pattern from commit.test.ts. Three scenarios: (1) dirty + gitignored → returned, (2) dirty + not gitignored → not returned, (3) empty dirty set → empty result.
- **Integration tests:** The init-time disclosure is harder to integration-test (requires running the full init pipeline). Skip for now — the disclosure is a cosmetic warning that reuses already-tested functions (`discoverGitignoredFiles`). The commit hardening is covered by the new unit tests plus the existing force-add integration tests.
- **Edge cases:** Non-git directory (spawnSync returns non-zero, helper returns empty array). All dirty files are gitignored (all move to force-add, normal `git add` is skipped). No dirty files are gitignored (force-add path is empty, normal path unchanged).

## Dependencies

- PR #226 (gitignore-force-add) must be merged. It is — confirmed in scope.

## Constraints

- The init-time check must not fail or block init if git is unavailable. Follow the same pattern as preflight's git checks — silently skip.
- The warning text must be a single string with `\n` separators (that's what `displaySuccessMessage` parses — first line yellow, rest gray).
- The commit hardening must not change behavior when no files are gitignored — zero blast radius for the common case.
- MDX in troubleshooting.mdx must use `&apos;` for apostrophes in JSX text content (lint rule: `react/no-unescaped-entities`).

## Gotchas

- `discoverGitignoredFiles` requires a `dirtyFiles` parameter for deduplication. At init time, pass an empty array — we're checking whether files WOULD be gitignored, not deduplicating against a commit set.
- The `preflight.warnings` array is already constructed and returned by the time we reach `createClaudeConfiguration`. But it's a mutable reference — pushing onto it before `displaySuccessMessage` is called works fine. No need to thread a new parameter.
- The new hardening helper is distinct from `discoverGitignoredFiles`. The existing function finds files that are gitignored AND NOT dirty (for first-time force-add). The new helper finds files that ARE dirty AND ALSO gitignored (for subsequent force-add). They check the same condition from opposite directions.
- In commit.ts, after identifying gitignored dirty files, remove them from the `files` array before the normal `git add` call. The `files` variable from `discoverDirtyFiles` is a fresh array, so filtering it is safe.
- The `.claude/` directory might not exist at init-time check if `createClaudeConfiguration` failed silently. Wrap the check in a try-catch that silently skips — the warning is a nice-to-have, not a gate.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { discoverGitignoredFiles } from './commit.js'`
- Use `import type` for type-only imports, separate from value imports
- Exported functions require `@param` and `@returns` JSDoc tags
- Explicit return types on all exported functions
- Error handling in commands: chalk.red + process.exit(1). But for the gitignore check at init time, silently skip on failure (it's a warning, not a gate).
- In MDX: use `&apos;` for apostrophes in text content
- Always use `--run` with pnpm test / vitest to avoid watch mode

### Pattern Extracts

**Warning flow in init orchestrator** (index.ts lines 131-136):
```typescript
      // Create .claude/ configuration (outside .ana/ — merges with existing)
      await createClaudeConfiguration(cwd, engineResult, preflight.initState);

      // Display success
      const scanTime = ((Date.now() - scanStart) / 1000).toFixed(1);
      const projectName = await getProjectName(cwd);
      displaySuccessMessage(engineResult, projectName, scanTime, mergedConfig ?? newAnaConfig, preflight.warnings);
```

**Warning rendering in displaySuccessMessage** (state.ts lines 1032-1043):
```typescript
  // Pipeline readiness — recap warnings from preflight (only when present)
  if (warnings && warnings.length > 0) {
    console.log('  Pipeline readiness:');
    for (const warning of warnings) {
      const lines = warning.split('\n');
      console.log(chalk.yellow(`    ⚠ ${lines[0]}`));
      for (const line of lines.slice(1)) {
        console.log(chalk.gray(`      ${line}`));
      }
    }
    console.log('');
  }
```

**git check-ignore pattern** (commit.ts lines 238-248):
```typescript
  // Batch-check against git check-ignore --stdin
  const checkResult = spawnSync('git', ['check-ignore', '--stdin'], {
    cwd: projectRoot,
    stdio: 'pipe',
    encoding: 'utf-8',
    input: candidates.join('\n'),
  });

  // Exit code 0 = at least one path ignored, 1 = no paths ignored, 128+ = error
  if (checkResult.status !== null && checkResult.status >= 128) {
    return [];
  }
```

**Existing multi-line warning** (preflight.ts line 218):
```typescript
    const msg = 'gh CLI not installed — PR creation unavailable\n      Install from https://cli.github.com/\n      The pipeline works without it through Build/Verify';
    warnings.push(msg);
```

**TroubleCard pattern** (troubleshooting.mdx):
```mdx
<TroubleCard title="My verify failed">

1. Read `verify_report.md`. It lists every UNSATISFIED assertion with evidence.
2. Common causes: test tagged `@ana A003` but doesn&apos;t actually test what the contract says...

</TroubleCard>
```

### Proof Context

**commit.ts** — 4 active findings:
- `[test] (init-commit-C2)` No integration test for pull conflict abort path — not relevant to this build.
- `[code] (gitignore-force-add-C1)` Duplicated scan.json read in `resolveMonorepoAgentsMd` — not relevant, but don't add another call to it.
- `[code] (gitignore-force-add-C2)` No symlink guard in readdirSync — not relevant to this build (the new helper uses `git check-ignore`, not filesystem enumeration).
- `[code] (gitignore-force-add-C4)` lstatSync per-file during candidate enumeration — not relevant (new helper checks dirty files, not filesystem candidates).

**index.ts** — No directly relevant findings.

**troubleshooting.mdx** — No active proof findings.

### Checkpoint Commands

- After commit.ts changes: `(cd 'packages/cli' && pnpm vitest run tests/commands/init/commit.test.ts)` — Expected: all existing + new tests pass
- After all changes: `pnpm run test -- --run` — Expected: 2996+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2996 passed, 2 skipped (2998 total)
- Current test files: 127 passed
- Command used: `pnpm run test -- --run`
- After build: expected ~2999+ tests in 127 files (new tests added to existing commit.test.ts)
- Regression focus: `tests/commands/init/commit.test.ts` (direct changes), init orchestrator behavior (warning injection)
