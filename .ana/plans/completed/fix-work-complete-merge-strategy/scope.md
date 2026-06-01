# Scope: Fix work complete merge strategy

**Created by:** Ana
**Date:** 2026-06-01

## Intent
`ana work complete --merge` should work in non-interactive contexts and across repositories with different GitHub merge-method settings. Today it calls `gh pr merge <branch>` without an explicit merge method, so GitHub CLI may prompt interactively or fail immediately when multiple merge methods are enabled. The fix should make the merge method deterministic while preserving zero-config behavior for repositories where GitHub exposes exactly one allowed method.

## Complexity Assessment
- **Kind:** fix
- **Size:** medium - small source change, but config, GitHub API failure modes, JSON errors, docs, and tests all need coverage
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/work.ts`
  - `packages/cli/src/commands/init/anaJsonSchema.ts`
  - `packages/cli/src/commands/config.ts`
  - `packages/cli/tests/commands/work-merge.test.ts`
  - `packages/cli/tests/commands/config.test.ts`
  - `packages/cli/tests/commands/init/anaJsonSchema.test.ts`
  - `website/content/docs/guides/troubleshooting.mdx`
  - `website/content/docs/guides/configurability.mdx` if Plan decides the setting should be discoverable outside troubleshooting
- **Blast radius:** `work complete --merge` behavior, `ana config set` validation, `ana.json` parsing/re-init preservation, JSON error codes for merge failures, docs that mention merge completion
- **Estimated effort:** half day
- **Multi-phase:** no

## Approach
Model the repository merge method as user-owned configuration only when the command cannot infer a single safe choice. Add an optional `mergeStrategy` field to `ana.json`, validate writes through `ana config set`, and have `work complete --merge` use the configured method when present. If the field is absent, query GitHub at merge time for the repository's allowed merge methods. Auto-select only when GitHub returns exactly one allowed method. When multiple methods are allowed, or the API cannot provide a reliable answer, stop with a clear one-time configuration command.

Do not use scan output to populate this field. The existing scan detector infers merge style from commit history and explicitly cannot distinguish squash from rebase in zero-merge-history repositories, so using it here would create silent wrong behavior.

## Acceptance Criteria
- AC1: `ana work complete --merge <slug>` passes an explicit `--merge`, `--squash`, or `--rebase` flag to `gh pr merge` whenever it attempts a merge.
- AC2: When `.ana/ana.json` contains `mergeStrategy: "squash"`, the merge call uses `gh pr merge --squash <branch>` without querying GitHub for allowed methods.
- AC3: When `mergeStrategy` is absent and `gh api repos/{owner}/{repo}` reports exactly one allowed method, `work complete --merge` auto-selects that method.
- AC4: When `mergeStrategy` is absent and GitHub reports multiple allowed methods, `work complete --merge` exits before merging and tells the user to set `mergeStrategy` with `ana config set mergeStrategy <method>`.
- AC5: When the GitHub API call fails, returns malformed JSON, or does not expose reliable merge-method booleans, `work complete --merge` exits before merging with guidance to set `mergeStrategy`.
- AC6: When a configured merge strategy is rejected by GitHub as not allowed for the repository, the command reports that the configured method is stale or unsupported and tells the user to set an allowed method.
- AC7: `--json` merge-strategy failures return the standard JSON error envelope with specific error codes and no human-readable stdout pollution.
- AC8: `AnaJsonSchema` accepts `mergeStrategy` values `merge`, `squash`, and `rebase`; absent or invalid hand-edited values parse as `undefined`.
- AC9: Fresh `ana init` output does not add `mergeStrategy`; existing configured values survive re-init through the schema merge.
- AC10: `ana config set mergeStrategy merge|squash|rebase` writes the value without an unknown-field warning.
- AC11: `ana config set mergeStrategy <invalid>` rejects the value and does not modify `.ana/ana.json`.
- AC12: Existing `work complete --merge` success, branch protection, branch-behind, base mismatch, no-PR, already-merged, and unknown-error behaviors continue to work with the new strategy selection path.
- AC13: Docs that mention `work complete --merge` describe the `mergeStrategy` recovery command when merge-method selection cannot be determined automatically.

## Edge Cases & Risks
- Repositories with all three merge methods enabled should not guess. The user must pick the team's default once.
- Repositories with exactly one enabled merge method should remain zero-config.
- GitHub CLI may be authenticated but lack access to a private repository or merge settings. Treat `401`, `403`, `404`, missing fields, and malformed output as "could not determine", not as zero allowed strategies.
- Public repositories may be readable through the REST API without token permissions, but `gh api` still requires GitHub CLI authentication unless a token is supplied. The command already requires `gh` for merging, so fallback errors must be phrased as recoverable configuration guidance.
- Hand-edited invalid `mergeStrategy` should not crash parsing. It should behave as absent, then use runtime fallback or ask for explicit configuration.
- A configured method can become stale if repository settings change. The `gh pr merge` failure handler must distinguish "strategy not allowed" from branch protection, branch-behind, and unknown errors.
- Merge queue repositories do not require a strategy according to `gh pr merge --help`; passing a strategy should remain harmless, but Plan should verify current GitHub CLI behavior if this needs special handling.
- Existing tests that mock `gh` will fail if they do not account for the new `gh api` call. Tests should deliberately choose config-present or fallback-present setup per scenario.

## Rejected Approaches
- Use scan-detected `git.mergeStrategy`: rejected because `detectMergeStrategy` only reads merge commits and treats zero merge commits as squash-or-rebase with incomplete confidence. That is not reliable enough to drive a destructive merge command.
- Add a `--strategy` flag now: rejected as a future enhancement. The current need is a persistent team default plus safe runtime discovery.
- Always default to squash: rejected because it silently imposes a repository policy and can fail or create the wrong history shape.
- Keep only the existing post-failure "multiple strategies" handler: rejected because it still relies on `gh pr merge` failing after an ambiguous command instead of making the command deterministic before merge.
- Auto-populate `mergeStrategy` during init: rejected because init-time detection can be wrong and repository settings can change after initialization.

## Open Questions
- Should docs update only troubleshooting, or should configurability list `mergeStrategy` as a first-class user-owned field?
- Which exact JSON error code names should Plan standardize for ambiguous strategy, unavailable strategy discovery, and configured strategy rejected by GitHub?

## Exploration Findings

### Patterns Discovered
- `packages/cli/src/commands/work.ts:467`: `--merge` flow is contained inside `completeWork`, before the existing pull/archive/proof-chain completion path.
- `packages/cli/src/commands/work.ts:531`: current merge call is `gh pr merge <branch>` with no merge method flag.
- `packages/cli/src/commands/work.ts:535`: merge failure handling already classifies branch protection, branch-behind, multiple strategies, and unknown failures.
- `packages/cli/src/commands/work.ts:1009`: branch cleanup is separate from `gh pr merge`; the merge call should not add `--delete-branch`.
- `packages/cli/src/commands/init/anaJsonSchema.ts:55`: `AnaJsonSchema` is the central parse/merge schema and uses per-field `.catch()` plus `.passthrough()`.
- `packages/cli/src/commands/config.ts:44`: `KNOWN_FIELDS` drives unknown-field warnings for `ana config set`.
- `packages/cli/src/commands/config.ts:411`: config set already has write-time value validation for command fields; `mergeStrategy` enum validation should follow this local pattern.
- `packages/cli/tests/commands/work-merge.test.ts:118`: tests intercept `gh` through a module-level `spawnSync` mock.
- `packages/cli/tests/commands/work-merge.test.ts:151`: the success test currently asserts no `--squash` or `--rebase`; that assertion becomes wrong.
- `packages/cli/src/engine/detectors/git.ts:303`: scan merge strategy detection is history-based and not suitable for runtime merge-method selection.

### Constraints Discovered
- [TYPE-VERIFIED] `AnaJsonSchema` (packages/cli/src/commands/init/anaJsonSchema.ts:55) - adding a known optional field affects the inferred `AnaJson` type and re-init merge behavior.
- [OBSERVED] GitHub repository API - `gh api repos/{owner}/{repo}` returns `allow_merge_commit`, `allow_squash_merge`, and `allow_rebase_merge` for this repo.
- [OBSERVED] GitHub CLI auth failure - invalid token returns `HTTP 401`; no GitHub CLI auth returns a local `gh auth login` message before the API call.
- [OBSERVED] Current repo settings - all three merge methods are enabled, so the ambiguous path is real for Anatomia itself.
- [OBSERVED] Proof health - project quality trend is worsening, and `work.ts` is a hot spot with active findings. Keep the implementation localized and test the new branches directly.
- [INFERRED] API access semantics - private repos and insufficient tokens may yield `401`, `403`, or `404`; all should be treated as unavailable discovery.

### Test Infrastructure
- `packages/cli/tests/commands/work-merge.test.ts`: creates a real temporary git repository, mocks only `gh` calls, and lets real git pass through.
- `packages/cli/tests/commands/config.test.ts`: exercises the Commander program and reads raw `.ana/ana.json` after `config set`.
- `packages/cli/tests/commands/init/anaJsonSchema.test.ts`: unit tests parse defaults, passthrough preservation, and per-field `.catch()` behavior.

## For AnaPlan

### Structural Analog
`packages/cli/src/commands/work.ts` merge-failure block at lines 535-594 is the closest structural analog: it classifies `gh pr merge` stderr into user-facing recovery paths and JSON error envelopes. The new strategy resolution should fit into the same command-local flow, before the merge attempt.

### Relevant Code Paths
- `packages/cli/src/commands/work.ts`: `completeWork` branch validation, PR lookup, base-branch check, merge attempt, merge error classification, and JSON error wrapping.
- `packages/cli/src/commands/init/anaJsonSchema.ts`: add optional `mergeStrategy` parse field without defaulting fresh configs.
- `packages/cli/src/commands/config.ts`: add known field and write-time enum validation before `setByPath`.
- `packages/cli/src/commands/init/state.ts`: verify no `createAnaJson` change is needed; re-init should preserve via schema passthrough/known field merge.
- `packages/cli/src/engine/detectors/git.ts`: do not wire scan detection into this feature.
- `website/content/docs/guides/troubleshooting.mdx`: update `work complete --merge` failure guidance.
- `website/content/docs/guides/configurability.mdx`: decide whether to list `mergeStrategy` with other user-owned config fields.

### Patterns to Follow
- Use `spawnSync` with argument arrays, matching existing `gh` calls in `work.ts`.
- Keep human progress messages out of stdout when `options.json` is set, matching existing guarded merge success messages.
- Use `wrapJsonError('work complete', code, message, {}, null)` for pre-proof-chain merge failures.
- Keep config validation in `config.ts` write path, not only in Zod parse.
- Preserve current branch deletion flow at step 12; do not delegate deletion to GitHub CLI.

### Known Gotchas
- `gh api repos/{owner}/{repo}` relies on GitHub CLI resolving `{owner}` and `{repo}` from local git remotes. Tests should mock the exact command rather than requiring a real remote.
- A failed or unauthenticated `gh api` call can write useful details to stderr; do not expose noisy raw auth output as the primary UX.
- Boolean field absence is not the same as `false`. If any required merge-method field is missing or non-boolean, discovery is unavailable.
- Existing `work-merge.test.ts` mocks default unknown `gh` calls to failure, so adding an API call will break broad sets of tests unless each scenario is updated deliberately.
- The current multiple-strategy failure string at `work-merge.test.ts:303` is fabricated. New coverage should test both preflight ambiguity and defense-in-depth stderr matching for real GitHub CLI wording where feasible.
- The repo already has an active proof finding that merge failure paths lack JSON tests. Add direct JSON coverage for at least one new strategy failure.

### Things to Investigate
- Whether GitHub CLI ever rejects strategy flags on merge-queue repositories in current versions, despite help text saying no strategy is required.
- Whether the docs should include a dedicated configuration example for `mergeStrategy`, or only surface it in troubleshooting to avoid over-explaining a mostly transparent fallback.
