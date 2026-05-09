# Spec: Init must surface scan quality and pipeline readiness

**Created by:** AnaPlan
**Date:** 2026-05-09
**Scope:** .ana/plans/active/init-scan-quality/scope.md

## Approach

Three layers, each making init honest about a different gap:

**Layer 1 — Scan quality display.** After `displayDetectionSummary` inside `runAnalyzer` (state.ts), add a new `displayBlindSpots` function that renders `engineResult.blindSpots`. The spinner message at line 67 becomes conditional: when blind spots include an entry with `area === 'Analyzer'`, use `spinner.warn('Deep scan incomplete')` instead of `spinner.succeed('Analysis complete')`. When no blind spots exist, use `spinner.succeed('Deep scan complete — no gaps detected')`. When blind spots exist but none are Analyzer-related (e.g., missing Prisma schema, no git), keep `spinner.succeed('Analysis complete')` — those aren't scan degradation, they're project gaps.

The `displayBlindSpots` function translates the Analyzer blind spot's technical message to human terms at display time: "code patterns, conventions, and structure analysis skipped" instead of the raw `scan.json` message about tree-sitter. Other blind spot types display their `area`, `issue`, and `resolution` fields directly — they're already human-readable.

**Layer 2 — Pipeline dependency checks.** Add git user and `gh` checks to `validateInitPreconditions` in preflight.ts. Git user checks (`git config user.name`, `git config user.email`) are guarded behind `hasGit` — skip if git isn't installed. The `gh` check uses `spawnSync('gh', ['--version'])` (same pattern as pr.ts line 179). The existing remote message at line 180-181 gets enhanced with pipeline context and a `git remote add origin` suggestion. All warnings are captured in a new `warnings: string[]` field on `PreflightResult` instead of being `console.log`'d inline and lost.

**Layer 3 — Setup agent template.** Add environment validation instructions to the setup agent template between the `setupPhase: "complete"` write and the summary display. The agent runs diagnostic commands and reports results. Explicit guardrail: "Report findings. Do not install software or modify git configuration unless the user explicitly asks."

## Output Mockups

**Degraded scan (tree-sitter failed):**
```
⚠ Deep scan incomplete

  ✓ Stack: TypeScript · Vitest
  ✓ Files: 125 source, 97 tests
  ✓ Git: main branch, 842 commits, 3 contributors

  ⚠ Blind spots:
    Analyzer — code patterns, conventions, and structure analysis skipped
      Surface-tier detection (dependencies, config files) continues normally.
```

**Clean scan (no blind spots):**
```
✓ Deep scan complete — no gaps detected

  ✓ Stack: TypeScript · Vitest
  ✓ Files: 125 source, 97 tests
  ✓ Git: main branch, 842 commits, 3 contributors
  ✓ Patterns: 3 detected (deep scan)
```

**Scan with non-analyzer blind spots (e.g., missing Prisma schema):**
```
✓ Analysis complete

  ✓ Stack: TypeScript · Prisma · Vitest
  ✓ Files: 80 source, 40 tests

  ⚠ Blind spots:
    Database — Prisma dependency found but no schema.prisma
      Create prisma/schema.prisma (or packages/<pkg>/prisma/schema.prisma in a monorepo)
```

**Pipeline readiness warnings in success message:**
```
✓ Scanned my-project (4.2s)

  Stack:    TypeScript · Vitest
  Branch:   main
  Test:     pnpm vitest run

  Pipeline readiness:
    ⚠ git user.name not configured
      git config --global user.name "Your Name"
    ⚠ gh CLI not installed — PR creation unavailable
      Install from https://cli.github.com/
      The pipeline works without it through Build/Verify

  Next:
    claude --agent ana          Start working (Ana knows your stack)
    claude --agent ana-setup    Enrich with your team's knowledge (optional, ~10 min)
```

**No pipeline warnings (clean environment):**
```
✓ Scanned my-project (4.2s)

  Stack:    TypeScript · Vitest
  Branch:   main
  Test:     pnpm vitest run

  Next:
    claude --agent ana          Start working (Ana knows your stack)
    claude --agent ana-setup    Enrich with your team's knowledge (optional, ~10 min)
```

## File Changes

### `packages/cli/src/commands/init/types.ts` (modify)
**What changes:** Add `warnings: string[]` to the `PreflightResult` interface.
**Pattern to follow:** Existing interface at lines 27-33.
**Why:** Without this, preflight warnings are `console.log`'d and lost — they can't flow to `displaySuccessMessage` for the pipeline readiness section.

### `packages/cli/src/commands/init/preflight.ts` (modify)
**What changes:** Three additions: (1) git user.name/user.email check after the git remote check, guarded by `hasGit`, (2) `gh --version` check after git validation, (3) enhanced remote message at line 180-181 with pipeline context. All warnings captured in a `warnings` array returned via `PreflightResult`. Requires adding `import { spawnSync } from 'node:child_process'`.
**Pattern to follow:** The existing warning style at preflight.ts lines 159-168 (chalk.yellow, informational text). The `gh` check pattern at pr.ts line 179 (`spawnSync('gh', ['--version'])`).
**Why:** Without these, users discover missing pipeline dependencies mid-pipeline after investing real work.

### `packages/cli/src/commands/init/state.ts` (modify)
**What changes:** Two modifications: (1) `runAnalyzer` spinner message becomes conditional based on blind spots, (2) new `displayBlindSpots` function called after `displayDetectionSummary`. (3) `displaySuccessMessage` gains a "Pipeline readiness" section that renders warnings when present. Its signature adds an optional `warnings` parameter.
**Pattern to follow:** `displayDetectionSummary` (state.ts lines 91-135) for the chalk-colored display style. The `chalk.yellow('  ⚠ ')` prefix for warnings.
**Why:** The spinner lie ("Analysis complete" when analysis was degraded) and the missing blind spot display are the core disease.

### `packages/cli/src/commands/init/index.ts` (modify)
**What changes:** Thread `preflight.warnings` from the preflight result through to `displaySuccessMessage`. The call at line 135 gains the warnings argument.
**Pattern to follow:** Existing data threading pattern — `preflight.canProceed`, `preflight.anaExisted` are already threaded.
**Why:** The orchestrator is the bridge between preflight (which discovers warnings) and the success message (which displays them).

### `packages/cli/templates/.claude/agents/ana-setup.md` (modify)
**What changes:** Add environment validation instructions between the `setupPhase: "complete"` write and the summary display in Step 8. The agent runs `gh --version`, `gh auth status`, `git config user.name`, `git config user.email`, `git remote -v` and reports results. Include explicit guardrail against installing software.
**Pattern to follow:** The existing Step 8 structure — imperative instructions with code blocks showing expected output.
**Why:** Setup is the interactive touchpoint where the developer can fix environment issues on the spot. Init's checks are reliable but non-interactive; setup's checks are interactive but best-effort. Both layers together provide coverage.

### `packages/cli/tests/commands/init.test.ts` (modify)
**What changes:** Add tests for blind spot display, preflight warnings, pipeline readiness section in success message, and degraded scan spinner message. Tests import `displayBlindSpots` and `displaySuccessMessage` directly — unit-test the display functions with mock data.
**Pattern to follow:** Existing test structure in init.test.ts — `describe`/`it` blocks, `tmpDir` setup/teardown, direct function imports.
**Why:** Verifies all three layers work as specified.

## Acceptance Criteria

- [ ] AC1: When tree-sitter fails during init, the user sees a warning (not a checkmark) with "Deep scan incomplete" and what was lost in language-neutral terms
- [ ] AC2: When init completes with no blind spots, the user sees "Deep scan complete — no gaps detected"
- [ ] AC3: When init completes with blind spots, each blind spot is displayed with its area, issue, and resolution
- [ ] AC4: When `git user.name` or `git user.email` is not configured AND git is installed (`hasGit` is true), init displays a warning with copy-pasteable fix commands. When git is not installed, the git-user check is skipped.
- [ ] AC5: When `gh` is not installed, init displays a warning that includes "The pipeline works without it through Build/Verify"
- [ ] AC6: The existing git remote message at preflight.ts line 180-181 is enhanced with pipeline context and a `git remote add origin` suggestion — no second remote check is added
- [ ] AC7: None of the new checks prevent init from completing — all are informational
- [ ] AC8: The init success message includes a "Pipeline readiness" section listing any warnings, displayed before "Next:" — only shown if warnings exist
- [ ] AC9: `PreflightResult` carries a `warnings` field that flows from preflight through the orchestrator to `displaySuccessMessage`
- [ ] AC10: The setup agent template includes environment validation commands at the end of the setup flow — after `setupPhase: "complete"` is written but before the summary is printed. Explicit instruction: "Report findings. Do not install software or modify git configuration unless the user explicitly asks."
- [ ] AC11: Init's blind spot display renders tree-sitter failures with language-neutral human terms ("code patterns, conventions, and structure analysis"). The scan-engine.ts blind spot message is NOT modified.
- [ ] AC12: Re-running `ana init` (reinit) re-runs all dependency checks with updated results
- [ ] AC13: Total analyzer failure ("Analyzer failed — continuing with empty scaffolds") behavior is unchanged
- [ ] AC14: Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] AC15: No build errors with `pnpm run build`

## Testing Strategy

- **Unit tests for `displayBlindSpots`:** Call with mock `blindSpots` arrays and capture `console.log` output. Test three states: empty array (no output), array with Analyzer entry (human-translated message), array with non-Analyzer entries (direct field rendering).
- **Unit tests for `runAnalyzer` spinner:** Mock `scanProject` to return an EngineResult with/without Analyzer blind spots. Verify spinner method called (`succeed` vs `warn`) and message text. Use the `createEmptyEngineResult()` factory and add blind spots to it.
- **Unit tests for `displaySuccessMessage` pipeline readiness:** Call with a warnings array and capture output. Verify "Pipeline readiness" section appears with warnings. Call with empty array — verify section is absent.
- **Unit tests for preflight warnings:** Test `validateInitPreconditions` with mocked git/gh commands. Verify `warnings` array contains expected strings for each failure mode. Verify git-user check is skipped when `hasGit` is false.
- **Edge cases:** Blind spots array with multiple entries (one Analyzer, one Database). Warnings array with all three warning types simultaneously. Empty warnings array produces no Pipeline readiness section.

## Dependencies

- `runGit` from `../../utils/git-operations.js` — already imported in preflight.ts
- `spawnSync` from `node:child_process` — needs import in preflight.ts
- `createEmptyEngineResult` from engine types — already used in tests

## Constraints

- **No changes to scan-engine.ts.** The `blindSpots` messages in `scan.json` stay technical for agent consumption. Translation happens at display time in init.
- **All checks are warnings, never gates.** `canProceed` is never set to false by the new checks.
- **Engine/CLI boundary.** No chalk/ora in engine files. All display logic stays in `src/commands/init/state.ts`.
- **Setup template brevity.** The template is already ~640 lines. Keep the environment validation section concise — instructions, not documentation.

## Gotchas

- **`spawnSync` not currently imported in preflight.ts.** It imports `runGit` which wraps `spawnSync`, but for the `gh` check you need the raw `spawnSync` import since `runGit` is git-specific. Add `import { spawnSync } from 'node:child_process'`.
- **`displaySuccessMessage` signature change.** Adding `warnings?: string[]` as an optional parameter preserves backward compatibility — existing callers don't break. The parameter must be optional, not required.
- **The `hasGit` guard matters.** Without it, when git isn't installed, users see "git not installed" (existing warning) followed by "git user.name not configured" (new warning). The second is redundant and confusing. The git-user check must be inside the `hasGit === true` branch.
- **Preflight warnings are currently `console.log`'d and discarded.** The new approach captures them in the array AND still displays them inline during preflight (users expect to see warnings as they happen, not only at the end). The success message's "Pipeline readiness" section is a recap, not the first time the user sees the warning.
- **`engineResult` can be null in `displaySuccessMessage`.** When the analyzer totally fails, `engineResult` is null. The warnings section should still render if warnings exist — pipeline readiness is independent of scan success.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Error handling in commands: `chalk.red` or `chalk.yellow` for user messages.
- Engine files have zero CLI dependencies — no chalk, no ora. But this build doesn't touch engine files.
- Prefer early returns over nested conditionals.
- Explicit return types on all exported functions.
- Always use `--run` with `pnpm vitest` to avoid watch mode.

### Pattern Extracts

**Warning display pattern (preflight.ts lines 159-168):**
```typescript
  if (!hasGit) {
    // No git at all — strong warning, default NO
    console.log(chalk.yellow('\n⚠ No git repository detected.\n'));
    console.log("Anatomia's pipeline requires git for:");
    console.log('  • Feature branching (ana work start)');
    console.log('  • Artifact commits (ana artifact save)');
    console.log('  • Pull requests (ana pr create)');
    console.log('  • Proof chain tracking\n');
    console.log('Init will continue but pipeline commands will not function.');
    console.log('Scan, skills, and context files will still work.\n');
```

**Existing remote check (preflight.ts lines 180-181) — enhance this, don't add a second:**
```typescript
      if (hasCommits && !hasRemote) {
        console.log(chalk.blue('ℹ No remote detected. artifactBranch will use local branch names. ana pr create won\'t function until a remote is added.'));
```

**Detection summary display pattern (state.ts lines 91-98) — follow this style for blind spots:**
```typescript
export function displayDetectionSummary(result: EngineResult): void {
  console.log();

  // Stack
  const stackParts = getStackSummary(result);
  if (stackParts.length > 0) {
    console.log(chalk.green('  ✓ Stack: ') + stackParts.join(' · '));
  }
```

**Spinner conditional pattern (state.ts lines 67, 72):**
```typescript
    spinner.succeed('Analysis complete');
    // ...
    spinner.warn('Analyzer failed — continuing with empty scaffolds');
```

**gh check pattern (pr.ts lines 179-184):**
```typescript
  const ghCheck = spawnSync('gh', ['--version'], { stdio: 'pipe' });
  if (ghCheck.status !== 0) {
    console.error(chalk.red('Error: GitHub CLI (gh) not found.'));
```

**runGit usage (preflight.ts line 177):**
```typescript
      const hasCommits = gitHasCommits(cwd);
      const hasRemote = gitHasRemote(cwd);
```

**PreflightResult type (types.ts lines 27-33):**
```typescript
export interface PreflightResult {
  canProceed: boolean;
  initState: InitState;
  anaExisted: boolean;
}
```

### Proof Context

- state.ts: One proof finding — `[test] A010 has no runtime test — verified by source inspection only`. Not related to current assertions.
- preflight.ts, types.ts: No active proof findings.

### Checkpoint Commands

- After types.ts + preflight.ts changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2047 tests pass (no regressions, new tests not yet added)
- After state.ts + index.ts changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2047 tests pass (display changes, no new tests yet)
- After test additions: `(cd packages/cli && pnpm vitest run)` — Expected: 2047 + new tests pass
- Lint: `pnpm run lint`
- Build: `pnpm run build`

### Build Baseline
- Current tests: 2047 passed, 2 skipped (2049 total)
- Current test files: 96
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 2047 + ~12-18 new tests in 96 test files (tests added to existing init.test.ts)
- Regression focus: init.test.ts (modified), any test that imports from init/types.ts or init/state.ts
