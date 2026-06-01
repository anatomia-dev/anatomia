# Spec: Fix work complete merge strategy

**Created by:** AnaPlan
**Date:** 2026-06-01
**Scope:** .ana/plans/active/fix-work-complete-merge-strategy/scope.md

## Approach
Make `ana work complete --merge` deterministic before it attempts a GitHub merge. The disease is that the command currently asks GitHub CLI to choose a repository policy without telling it which merge method to use. That can prompt or fail in non-interactive contexts.

Add an optional user-owned `mergeStrategy` field to `.ana/ana.json`. Valid values are `merge`, `squash`, and `rebase`. Fresh `ana init` output must not include the field. Existing configured values must survive re-init through the existing `AnaJsonSchema` and `preserveUserState` merge path.

In `completeWork`, resolve the merge strategy after PR state/base validation and before printing `Merging PR...` or calling `gh pr merge`. Resolution order:

1. Read `mergeStrategy` from schema-validated `.ana/ana.json`. If valid and present, use it and do not call `gh api`.
2. If absent, call `gh api repos/{owner}/{repo}` from the project root and parse `allow_merge_commit`, `allow_squash_merge`, and `allow_rebase_merge`.
3. If exactly one of those fields is boolean `true`, map it to `merge`, `squash`, or `rebase` and use that strategy.
4. If multiple methods are allowed, stop before merging and tell the user to run `ana config set mergeStrategy <method>`.
5. If the API call fails, returns malformed JSON, or any required field is missing/non-boolean, stop before merging with the same configuration guidance.

Every merge attempt must call GitHub CLI with an explicit strategy flag: `--merge`, `--squash`, or `--rebase`. Do not add `--delete-branch`; branch cleanup remains in the existing step 12 local/remote branch deletion path.

Keep the implementation command-local in `work.ts`. A helper inside the command file is acceptable because this behavior has one caller and depends on command-specific JSON/human error handling. Do not wire `src/engine/detectors/git.ts` or scan-detected `git.mergeStrategy` into this feature; that detector is history-based and unreliable for destructive runtime merge choices.

For JSON mode, strategy-resolution failures must use `wrapJsonError('work complete', code, message, {}, null)` and must not print human progress text to stdout before the JSON envelope. Standardize these new codes:

- `MERGE_STRATEGY_AMBIGUOUS` for multiple allowed repository methods and no configured method.
- `MERGE_STRATEGY_DISCOVERY_UNAVAILABLE` for failed `gh api`, malformed JSON, or missing/non-boolean allowed-method fields.
- `MERGE_STRATEGY_UNSUPPORTED` for configured strategy rejected by `gh pr merge` as disabled or unsupported for the repository.

Retain existing merge failure classifications for branch protection, branch-behind, no PR, base mismatch, already merged, and unknown merge failures. Update the existing "multiple merge strategies" defense-in-depth branch to the new recovery guidance and JSON code, even though preflight should normally catch ambiguity before `gh pr merge`.

Current `gh pr merge --help` says merge queue targets do not require a strategy, but the command still exposes the strategy flags. Do not add merge-queue special handling unless the actual merge call rejects the configured flag; that rejection belongs in `MERGE_STRATEGY_UNSUPPORTED`.

## Output Mockups
Configured strategy success should keep the existing happy-path output shape:

```text
Merging PR...
PR merged.

PASS - test-slug
  12/12 satisfied - 0 deviations
```

Ambiguous repository methods should stop before merge:

```text
Error: Multiple GitHub merge methods are enabled and no mergeStrategy is configured.
Choose the method this repository should use:
  ana config set mergeStrategy merge
  ana config set mergeStrategy squash
  ana config set mergeStrategy rebase

Then retry: ana work complete --merge test-slug
```

Unavailable discovery should avoid dumping raw auth/API noise as the primary message:

```text
Error: Could not determine the repository merge strategy automatically.
Set the repository default once:
  ana config set mergeStrategy squash

Then retry: ana work complete --merge test-slug
```

Configured strategy rejected by GitHub should identify the stale setting:

```text
Error: Configured mergeStrategy "squash" is not allowed for this repository.
Update the setting to an allowed method:
  ana config set mergeStrategy merge

Then retry: ana work complete --merge test-slug
```

JSON strategy failures should be a clean error envelope with no human text before it:

```json
{
  "command": "work complete",
  "ok": false,
  "error": {
    "code": "MERGE_STRATEGY_AMBIGUOUS",
    "message": "Multiple GitHub merge methods are enabled and no mergeStrategy is configured."
  }
}
```

## File Changes

### packages/cli/src/commands/work.ts (modify)
**What changes:** Add merge strategy resolution before `gh pr merge`, pass an explicit strategy flag, and add the three strategy-specific recovery/error paths.
**Pattern to follow:** Existing `completeWork` PR validation and merge failure classification block.
**Why:** Without this, `gh pr merge <branch>` can prompt or fail when multiple repository merge methods are enabled.

### packages/cli/src/commands/init/anaJsonSchema.ts (modify)
**What changes:** Add optional `mergeStrategy` enum parsing with `.catch(undefined)`.
**Pattern to follow:** Existing optional user-owned fields that fail soft and survive passthrough parsing.
**Why:** Hand-edited invalid values must not crash config reads or re-init.

### packages/cli/src/commands/config.ts (modify)
**What changes:** Add `mergeStrategy` to known fields and validate write-time values for `ana config set mergeStrategy`.
**Pattern to follow:** Existing `KNOWN_FIELDS`, machine-managed guard, and command-field validation in the `set` action.
**Why:** Users need a supported recovery command, and invalid values must not modify `.ana/ana.json`.

### packages/cli/tests/commands/work-merge.test.ts (modify)
**What changes:** Update existing merge tests for explicit strategy flags and add coverage for configured, inferred, ambiguous, unavailable, JSON, and unsupported-strategy paths.
**Pattern to follow:** Existing real temp git repository setup with mocked `gh` calls only.
**Why:** The behavior depends on command sequencing and external `gh` output classification.

### packages/cli/tests/commands/config.test.ts (modify)
**What changes:** Add tests for accepted and rejected `mergeStrategy` writes and ensure known-field warnings do not fire for valid writes.
**Pattern to follow:** Existing Commander program tests that read raw `.ana/ana.json` after `config set`.
**Why:** The recovery command must be safe and scriptable.

### packages/cli/tests/commands/init/anaJsonSchema.test.ts (modify)
**What changes:** Add schema tests for accepted, absent, and invalid `mergeStrategy` values.
**Pattern to follow:** Existing per-field `.catch()` isolation tests.
**Why:** Invalid hand-edited config should behave as absent rather than crashing.

### packages/cli/tests/commands/init.test.ts (modify)
**What changes:** Add a small `preserveUserState` test showing configured `mergeStrategy` survives re-init metadata refresh. This test is not part of the focused checkpoint command requested for this scope, but it covers the re-init acceptance criterion directly.
**Pattern to follow:** Existing "preserves user-owned fields during metadata refresh" tests.
**Why:** `mergeStrategy` is user-owned and must not be dropped by re-init.

### website/content/docs/guides/troubleshooting.mdx (modify)
**What changes:** Update the `ana work complete failed` card with merge-strategy recovery guidance.
**Pattern to follow:** Existing concise numbered troubleshooting cards.
**Why:** Users need the recovery command when automatic strategy discovery is ambiguous or unavailable.

### website/content/docs/guides/configurability.mdx (modify)
**What changes:** List `mergeStrategy` as a CLI-supported user-owned setting and include it in the `ana.json` example.
**Pattern to follow:** Existing CLI-supported settings section.
**Why:** This is now a first-class persistent team setting, not only an error workaround.

## Acceptance Criteria

- [ ] `ana work complete --merge <slug>` passes an explicit `--merge`, `--squash`, or `--rebase` flag to `gh pr merge` whenever it attempts a merge.
- [ ] When `.ana/ana.json` contains `mergeStrategy: "squash"`, the merge call uses `gh pr merge --squash <branch>` without querying GitHub for allowed methods.
- [ ] When `mergeStrategy` is absent and `gh api repos/{owner}/{repo}` reports exactly one allowed method, `work complete --merge` auto-selects that method.
- [ ] When `mergeStrategy` is absent and GitHub reports multiple allowed methods, `work complete --merge` exits before merging and tells the user to set `mergeStrategy` with `ana config set mergeStrategy <method>`.
- [ ] When the GitHub API call fails, returns malformed JSON, or does not expose reliable merge-method booleans, `work complete --merge` exits before merging with guidance to set `mergeStrategy`.
- [ ] When a configured merge strategy is rejected by GitHub as not allowed for the repository, the command reports that the configured method is stale or unsupported and tells the user to set an allowed method.
- [ ] `--json` merge-strategy failures return the standard JSON error envelope with specific error codes and no human-readable stdout pollution.
- [ ] `AnaJsonSchema` accepts `mergeStrategy` values `merge`, `squash`, and `rebase`; absent or invalid hand-edited values parse as `undefined`.
- [ ] Fresh `ana init` output does not add `mergeStrategy`; existing configured values survive re-init through the schema merge.
- [ ] `ana config set mergeStrategy merge|squash|rebase` writes the value without an unknown-field warning.
- [ ] `ana config set mergeStrategy <invalid>` rejects the value and does not modify `.ana/ana.json`.
- [ ] Existing `work complete --merge` success, branch protection, branch-behind, base mismatch, no-PR, already-merged, and unknown-error behaviors continue to work with the new strategy selection path.
- [ ] Docs that mention `work complete --merge` describe the `mergeStrategy` recovery command when merge-method selection cannot be determined automatically.
- [ ] Focused CLI tests pass with the checkpoint command in this spec.
- [ ] Lint has no new errors.
- [ ] Full suite is treated as a CI gate because the local full 129-file CLI run has known pre-existing worker-isolation failures in scan/package-manager tests.

## Testing Strategy

- **Unit tests:** Extend `AnaJsonSchema` tests for enum acceptance, invalid fallback to `undefined`, and absent default. Extend `config.test.ts` for valid writes, invalid rejection with no file modification, and no unknown-field warning for `mergeStrategy`.
- **Integration tests:** Extend `work-merge.test.ts` using the existing mocked `gh` boundary. Cover configured strategy, inferred single allowed method for each strategy family where practical, ambiguous methods, API failure, malformed JSON, missing/non-boolean fields, JSON error envelopes, and configured method rejected by `gh pr merge`.
- **Edge cases:** Verify `gh api` is not called when config is present; `gh pr merge` is not called when strategy resolution fails; already-merged PRs do not need strategy resolution; no human-readable `Merging PR...` text appears in `--json` failures.

## Dependencies

- GitHub CLI remains required for `--merge`.
- `gh api repos/{owner}/{repo}` must be mocked in tests; do not require a real remote or GitHub token.
- Existing `wrapJsonError` envelope shape remains the JSON error mechanism for `work complete`.

## Constraints

- Do not use scan-detected merge strategy for runtime merge decisions.
- Do not add `mergeStrategy` to fresh `createAnaJson` output.
- Do not add `--delete-branch` to `gh pr merge`; existing local cleanup owns branch deletion.
- Do not print raw `gh api` auth or REST errors as the primary user-facing message.
- Preserve JSON stdout cleanliness whenever `options.json` is set.
- Keep imports ESM-safe with `.js` extensions and `node:` prefixes for built-ins.

## Gotchas

- `gh api repos/{owner}/{repo}` uses GitHub CLI placeholder resolution from the current repository. Tests should assert the `gh api` call shape and return mocked JSON.
- Boolean absence is not false. If any of the three allowed-method fields is missing or not a boolean, discovery is unavailable.
- Existing tests default unrecognized `gh` calls to failure. Update every affected `work-merge.test.ts` scenario deliberately: either configure `mergeStrategy` in fixture config or mock the new `gh api` call.
- A configured strategy can become stale after repository settings change. The merge failure handler must classify "not allowed", "disabled", or strategy-related GitHub CLI wording before the generic unknown-error path, without stealing branch protection or branch-behind failures.
- In JSON mode, `console.error` human guidance is acceptable for stderr, but stdout must remain only the JSON envelope.
- Local full-suite baseline has known pre-existing worker-isolation failures in scan/package-manager tests. Do not debug or change scan detection for this scope.

## Build Brief

### Rules That Apply

- Local TypeScript imports must use `.js` extensions; built-ins use `node:` prefixes.
- Use `import type` for type-only imports, separate from value imports.
- Command-layer errors use chalk messaging and `process.exit(1)`/`process.exitCode`; engine files stay untouched.
- Exported functions require explicit return types and JSDoc, but this change should prefer internal helpers unless a helper truly needs exporting.
- Tests should mock only external `gh` behavior and use real temp git repos like the existing merge tests.
- Run Vitest with `run`; watch mode must not be used in checkpoints.
- Test behavior and exact values, especially command args and JSON error codes.

### Pattern Extracts

From `packages/cli/src/commands/work.ts`, current merge failure classification:

```ts
      if (mergeResult.status !== 0) {
        const mergeOutput = (mergeResult.stderr || '') + (mergeResult.stdout || '');

        // Branch protection / checks blocking
        if (mergeOutput.includes('required status check') || (mergeOutput.includes('check') && mergeOutput.includes('pending')) || mergeOutput.includes('prohibits the merge')) {
          console.error(chalk.red('Error: Merge blocked by branch protection.'));
          console.error('');
          console.error(chalk.gray('Options:'));
          console.error(chalk.gray(`  Wait for checks, then retry:  ana work complete --merge ${slug}`));
          console.error(chalk.gray(`  Enable auto-merge:            gh pr merge --auto ${workBranchName}`));
          console.error(chalk.gray(`  Bypass (admin):               gh pr merge --admin ${workBranchName}`));
          console.error('');
          console.error(chalk.gray(`After merging manually: ana work complete ${slug}`));
          if (options?.json) {
            console.log(JSON.stringify(wrapJsonError('work complete', 'BRANCH_PROTECTION', 'Merge blocked by branch protection. Merge the PR manually, then run ana work complete.', {}, null), null, 2));
          }
          process.exit(1);
        }
```

From `packages/cli/src/commands/init/anaJsonSchema.ts`, fail-soft field pattern:

```ts
    branchPrefix: z
      .union([
        z.string(),
        z.record(z.string(), z.string()),
      ])
      .optional()
      .default('feature/')
      .catch('feature/'),
    setupPhase: z
      .enum(['not-started', 'context-complete', 'complete'])
      .optional()
      .catch(undefined),
```

From `packages/cli/src/commands/config.ts`, write-time validation location:

```ts
        const config = readRawConfig(root);
        const value = parseValue(rawValue);

        // Reject empty strings for command fields — never a valid command
        const COMMAND_FIELDS = ['commands.test', 'commands.build', 'commands.lint', 'commands.dev'];
        const isSurfaceCommand = /^surfaces\.[^.]+\.commands\.[^.]+$/.test(field);
        if ((COMMAND_FIELDS.includes(field) || isSurfaceCommand) && value === '') {
          console.error(chalk.red('Empty string is not a valid command. Provide a command or omit the field.'));
          console.error(chalk.gray(`  To unset: ana config set ${field} null`));
          process.exitCode = 1;
          return;
        }
```

### Proof Context

- `packages/cli/src/commands/work.ts`: active finding `work-complete-merge-C2` says merge failure paths lack JSON tests. This directly overlaps the current JSON strategy-failure assertions; add direct JSON tests.
- `packages/cli/src/commands/work.ts`: existing concern says `wrapJsonError` has a different shape than `wrapJsonResponse`; use the current helper anyway because all pre-proof-chain `work complete` errors use it.
- `packages/cli/src/commands/config.ts`: active finding notes missing empty-string command-field coverage and a separate surface deletion risk. Neither overlaps `mergeStrategy`; avoid touching unrelated config behavior.
- `packages/cli/src/commands/init/anaJsonSchema.ts`: prior concern says passthrough widens `AnaJson`; keep new `mergeStrategy` as a typed known field to reduce ambiguity for consumers.
- `packages/cli/src/commands/init/state.ts`: several surface command concerns are unrelated. Only add a narrow preservation test if needed; do not change surface merge behavior.
- `packages/cli/tests/commands/work-merge.test.ts`: active finding says no JSON merge failure tests. Current scope should close part of that gap for the new strategy failures.
- No active proof findings for `packages/cli/tests/commands/config.test.ts`, `packages/cli/tests/commands/init/anaJsonSchema.test.ts`, `website/content/docs/guides/troubleshooting.mdx`, or `website/content/docs/guides/configurability.mdx`.

### Checkpoint Commands

- After schema/config changes: `(cd 'packages/cli' && pnpm vitest run tests/commands/config.test.ts tests/commands/init/anaJsonSchema.test.ts)` - Expected: current 50 tests pass plus new tests.
- After work merge changes: `(cd 'packages/cli' && pnpm vitest run tests/commands/work-merge.test.ts tests/commands/config.test.ts tests/commands/init/anaJsonSchema.test.ts)` - Expected: current 69 tests pass plus new tests.
- Docs smoke: `(cd 'website' && pnpm vitest run)` - Expected: 84 tests pass.
- Lint: `pnpm run lint` - Expected: exits 0. Current baseline has 3 warnings unrelated to this scope.
- Final gate: GitHub Actions full suite - Expected: pass. Local `pnpm run test -- --run` is known to show 9 pre-existing worker-isolation failures in `scan.test.ts`, `scanProject.test.ts`, and `detection-overrides.test.ts`; those files pass individually/together and should not block this build.

### Build Baseline

- Current focused CLI tests: 69 tests in 3 files.
- Focused command used: `(cd 'packages/cli' && pnpm vitest run tests/commands/work-merge.test.ts tests/commands/config.test.ts tests/commands/init/anaJsonSchema.test.ts)`
- Current website tests: 84 tests in 11 files.
- Website command used: `(cd 'website' && pnpm vitest run)`
- Current lint: `pnpm run lint` exits 0 with 3 existing warnings.
- Local full-suite note: `pnpm run test -- --run` currently reports 9 failures across 3 CLI scan/package-manager files only when the full 129-file CLI suite runs in parallel locally. Treat this as known local isolation noise for this scope and rely on CI as the full-suite gate.
- After build: expected focused CLI test count increases by the new strategy/config/schema tests; exact count depends on builder's scenario grouping.
- Regression focus: `completeWork` merge sequencing, JSON stdout cleanliness, config write validation, schema fail-soft parsing, and docs wording around `mergeStrategy`.
