# Scope: Kind-aware branch prefixes

**Created by:** Ana
**Date:** 2026-05-12

## Intent

Branch prefixes are static — one string for all work items. But the system already knows the work type: Ana classifies every scope as `feature`, `fix`, `chore`, or `milestone` (after Scope 1 ships). Teams with git conventions like `fix/`, `feature/`, `chore/` can't express those conventions through Anatomia. The branch always gets whatever single prefix is configured, regardless of what the work actually is. This scope makes `branchPrefix` kind-aware: a map from kind to prefix, so `fix/auth-timeout` and `feature/add-export` happen automatically based on what Ana already knows.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — schema change with backward compatibility, 6 source files, ~8 test files, multiple edge cases
- **Files affected:**
  - `packages/cli/src/commands/init/anaJsonSchema.ts` (schema: string → string | record)
  - `packages/cli/src/utils/git-operations.ts` (`readBranchPrefix` signature + map resolution)
  - `packages/cli/src/commands/work.ts` (4 call sites: `startWork`, `getWorkStatus`, `completeWork`, `startBuildPhase` — each needs kind resolution strategy)
  - `packages/cli/src/commands/pr.ts` (1 call site — branch validation warning)
  - `packages/cli/src/commands/artifact.ts` (1 call site — error message guidance)
  - `packages/cli/src/utils/worktree.ts` (2 functions: `createWorktree`, `getWorktreeInfo` — receive resolved prefix, no change to signature, but callers change)
  - `packages/cli/src/commands/init/state.ts` (no code change, but `preserveUserState` behavior must be verified against new schema)
  - `packages/cli/tests/utils/git-operations.test.ts` (new map-form tests)
  - `packages/cli/tests/commands/work.test.ts` (new kind-aware tests)
  - `packages/cli/tests/commands/pr.test.ts` (map-form validation test)
  - `packages/cli/tests/commands/artifact.test.ts` (map-form error message test)
- **Blast radius:** Medium. The schema change affects every code path that reads `branchPrefix`. Six source files call `readBranchPrefix()`. The Zod schema change affects re-init preservation. Agent templates are unaffected (`{branchPrefix}` is a placeholder, not a config read). Website is unaffected (doesn't read ana.json).
- **Estimated effort:** ~2 hours
- **Multi-phase:** no

## Approach

Two changes working together:

**1. Config expansion.** Expand `branchPrefix` in ana.json from a string to a union of string or record. When the value is a string, behavior is identical to today. When the value is a record mapping kind names to prefixes, the system resolves the prefix at branch creation time. `readBranchPrefix()` gains an optional `kind` parameter — when kind is provided and the config is a map, it looks up the kind; otherwise it returns the string or the `feature` key as default.

**2. Make branch lookup slug-based instead of prefix-based.** Today, every function that finds an existing branch reconstructs the name from config: `${branchPrefix}${slug}`. This breaks when config changes. But slugs are unique per project (enforced by `work start`), so the slug alone identifies the branch. The fix: `getWorkBranch` matches branches by slug (ending with `/{slug}` or equaling `{slug}` for empty prefix) instead of reconstructing from config. `printExistingWorktree` and `getWorktreeInfo` read the actual branch from git HEAD instead of reconstructing.

This is the key architectural choice: **use config only for creation, use git for lookup.** `readBranchPrefix(root, kind)` is called exactly once — when `startBuildPhase` creates the branch. Every subsequent operation finds the branch by slug (via git search) or by reading git HEAD (in worktrees). This makes branch operations immune to config changes. No stored state, no fallback chains, no reconstruction from config at consumption time.

## Acceptance Criteria

- AC1: `branchPrefix: "feature/"` (string form) continues to work identically — all existing tests pass unchanged
- AC2: `branchPrefix: { "feature": "feature/", "fix": "fix/", "chore": "chore/", "milestone": "milestone/" }` (map form) is accepted by the Zod schema without error
- AC3: `readBranchPrefix(projectRoot)` with no kind argument returns `'feature/'` as default when config is a map (backward-compatible fallback)
- AC4: `readBranchPrefix(projectRoot, 'fix')` returns `'fix/'` when config is `{ "fix": "fix/", "feature": "feature/" }`
- AC5: `readBranchPrefix(projectRoot, 'fix')` returns `'feature/'` when config is `"feature/"` (string form ignores kind)
- AC6: `readBranchPrefix(projectRoot, 'unknown')` with a kind not in the map falls back to the `feature` key, then to `'feature/'`
- AC7: `readBranchPrefix(projectRoot, undefined)` with map config returns the `feature` key value as default
- AC8: A malformed map (e.g., `{ "fix": 42 }`) falls back to `'feature/'` via `.catch()`
- AC9: `startBuildPhase` reads the scope's kind via `extractScopeKind()` and passes it to `readBranchPrefix()` — a `Kind: fix` scope with map config creates a `fix/{slug}` branch
- AC10: `getWorkBranch` finds branches created with kind-aware prefixes — when config is a map, it searches for `{prefix}{slug}` using the scope's kind
- AC11: `work status` correctly displays branch info for work items created with kind-aware prefixes
- AC12: `work complete` correctly identifies and cleans up branches created with kind-aware prefixes
- AC13: Map-form `branchPrefix` survives `ana init` re-init (preserved through `AnaJsonSchema.safeParse()` + `preserveUserState`)
- AC14: `pr.ts` branch validation warning works with map-form prefix — correctly warns when current branch doesn't match the expected kind-based prefix
- AC15: `artifact.ts` error message guidance uses the correct kind-based prefix in `git checkout` hint
- AC16: Each map value is independently validated by `validateBranchName()` — an invalid value in one key doesn't corrupt the entire map
- AC17: Empty map `{}` falls back to `'feature/'`
- AC18: Map with only partial keys (e.g., `{ "fix": "bugfix/" }`) resolves missing keys to `'feature/'` default
- AC19: `getWorkBranch` finds branches by slug match (ending with `/{slug}` or equaling `{slug}`) regardless of what prefix was used at creation time
- AC20: `getWorkBranch` returns the full branch name (e.g., `fix/auth-timeout`) not just `true` — consumers use the actual name, not a reconstruction
- AC21: `printExistingWorktree` reads the branch name from the worktree's git HEAD, not from config reconstruction
- AC22: `work complete` uses the branch name returned by `getWorkBranch` for cleanup, not a config-reconstructed name
- AC23: A branch created with `feature/my-slug` is found by `getWorkBranch` after config changes to `{ "feature": "feat/" }` — slug match is prefix-independent
- AC24: `getWorkBranch` does not false-match branches from other systems that coincidentally contain the slug as a substring (e.g., `some-other-add-auth-thing` should not match slug `add-auth`)
- AC25: No existing tests break. Test count increases.

## Edge Cases & Risks

### Critical: In-flight branch resolution

The most dangerous scenario: a user has `feature/add-auth` in progress (created when `branchPrefix` was `"feature/"`). They change their config to the map form: `{ "feature": "feat/", "fix": "fix/" }`. Config-based reconstruction would look for `feat/add-auth` — can't find it.

**Mitigation:** `getWorkBranch` matches by slug, not by prefix. It already runs `git branch -a --list *{slug}*` to find candidates (line 136). Today it then exact-matches against `${branchPrefix}${slug}`. Change the filter to match any branch that ends with `/{slug}` or equals `{slug}`. Since slugs are unique per project (enforced by `work start`), this finds exactly one branch regardless of what prefix was used at creation.

This eliminates the in-flight problem without stored state or fallback chains. The slug is the stable identifier. The prefix was a construction-time decision that shouldn't affect lookup.

### Critical: Re-init schema preservation

`preserveUserState()` at `state.ts:493` parses existing ana.json through `AnaJsonSchema.safeParse()`. The current schema defines `branchPrefix` as `z.string().optional().default('feature/').catch('feature/')`. If the user has a map-form `branchPrefix`, the string validator fails, `.catch()` fires, and the map silently resets to `'feature/'`.

**Mitigation:** The schema change must use `z.union()` — accepting both string and record forms. Both forms must have their own `.catch()` behavior. If the union itself fails, fall back to `'feature/'`. This is the same fail-soft pattern used by every other field in `anaJsonSchema.ts`.

**Dependency:** This is why `configurability-improvements` Phase 1 (passthrough) should ship first. With passthrough, even if the schema change hasn't landed, the map form would survive re-init as an unknown key. Without passthrough AND without the schema change, re-init destroys the map. With the schema change, re-init preserves it regardless of passthrough.

### Medium: scope.md reading for kind resolution

Only one call site needs to read the scope's kind: `startBuildPhase()`, where the branch is created. This is a single `extractScopeKind()` call at the moment of branch creation — acceptable cost, and scope.md is guaranteed to exist at this point (validated by `artifact save scope`).

All other call sites find the branch by slug match via git (no config read, no scope read). `work status` iterating multiple slugs incurs one `git branch -a --list` call per slug — the same cost as today.

### Medium: `printExistingWorktree` display

At `work.ts:2004`, `printExistingWorktree` constructs `const branchName = \`${branchPrefix}${slug}\`` for display and commit counting. With map-form config, this would need the kind for reconstruction.

**Mitigation:** Read from the worktree's git HEAD via `runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: wtPath })`. This shows what the branch actually is, not what config claims it should be. The worktree is guaranteed to exist at this call site (the function checks at line 2006). This is the most robust option — it can't be wrong, because it reads the truth from git.

### Low: Partial map keys

A user configures `{ "fix": "bugfix/" }` but doesn't include `feature`, `chore`, or `milestone`. When a feature-kind scope enters the build phase, `readBranchPrefix(root, 'feature')` finds no entry for `'feature'`.

**Mitigation:** Documented fallback chain in `readBranchPrefix()`: (1) look up the requested kind, (2) look up `'feature'` as default, (3) return `'feature/'` hardcoded. This means a partial map always has a sensible default.

### Low: Agent templates

Build, Plan, and Verify templates use `{branchPrefix}{slug}` as a placeholder. Agents read ana.json to resolve this. With map-form config, the agent would need to know the kind to resolve the placeholder. However, agents operate within a worktree where the branch already exists — they can read the branch name from git HEAD. The placeholder is documentation, not operational code.

**No code change needed** for templates — but the templates' behavior should be verified. If an agent literally does `readBranchPrefix()` + slug to construct a branch name, it would get the default fallback (the `feature` key or `'feature/'`), which might not match the actual branch. AnaPlan should investigate whether any agent template resolves this placeholder programmatically or whether it's purely instructional text.

### Low: `ana config set branchPrefix`

The `config set` command from configurability-improvements Phase 2 writes raw JSON values. `ana config set branchPrefix '{"feature":"feature/","fix":"fix/"}'` would write the map form. But `config set` currently treats the value as a string → `JSON.parse` → fallback. The map form would work via `JSON.parse` path. No special handling needed.

However, `ana config set branchPrefix "feature/"` after a map was configured would overwrite the map with a string — this is correct behavior (the user explicitly chose to simplify their config), but it's worth noting.

## Rejected Approaches

- **Fallback chain in `getWorkBranch`.** Try kind-based prefix, then `feature` key, then heuristic slug matching. Rejected because: each step is less reliable than the last, the chain exists to compensate for a flawed assumption (that config is stable between creation and lookup), and it's scaffolding. Slug-based matching eliminates the problem that the chain was built to manage.
- **Storing the branch name in `.saves.json` at creation time.** Would work for post-merge scenarios but fails for the `--merge` path and pre-merge operations. `.saves.json` is written to the worktree (not the artifact branch, to avoid dirty-file git pull blocking — see comment at `work.ts:1975`). So the branch name is only available on the artifact branch after PR merge. But `--merge`, `work status`, `pr create`, and `printExistingWorktree` all run pre-merge. The worktree's `.saves.json` is accessible during these paths, but the worktree might not exist (manually deleted, or non-worktree flow). Slug-based git matching is simpler and works universally — no stored state, no timing assumptions about when data reaches which branch.
- **Making `readBranchPrefix()` always return a resolved string by requiring kind at every call site.** Would require all 6 callers to either know the kind or pass `undefined`. Rejected because: most callers don't need to resolve from config at all. Only `startBuildPhase` creates a branch. Every other caller finds or displays a branch that already exists — slug-based lookup is sufficient.
- **Using `kind` in the slug itself (e.g., `fix-auth-timeout` auto-detects kind from the `fix-` prefix).** Fragile — `fix-header-layout` is a feature, not a fix. Slug naming is the developer's creative domain. Don't parse meaning from it.
- **Separate `branchPrefixes` field instead of overloading `branchPrefix`.** Would be cleaner (no union type) but creates two fields that mean the same thing. Which one wins? What happens when both are set? The union on a single field is simpler — one field, two shapes, clear priority.

## Open Questions

- **Should partial maps warn during `readBranchPrefix`?** If the map has `fix` and `chore` but not `feature`, that's probably a mistake. Should `readBranchPrefix` log a warning? Or is silent fallback sufficient?
- **Should `getWorkBranch` return the matched branch name directly?** Today it returns `string | null` where the string is the branch name. With slug-based matching, it would return the actual branch (e.g., `fix/auth-timeout` or `feature/auth-timeout`) — callers use this directly instead of reconstructing. AnaPlan should verify that all callers of `getWorkBranch` use only the returned value and don't separately reconstruct the name.

## Exploration Findings

### Patterns Discovered
- `git-operations.ts:107-134`: `readBranchPrefix()` reads raw JSON, checks `typeof prefix`, validates with `validateBranchName()`, returns string or fallback. The function is self-contained — no dependency on Zod schema, no import of AnaJsonSchema. This is important: the schema change and the reader change are independent. The schema governs re-init preservation; the reader governs runtime behavior.
- `work.ts:135-145`: `getWorkBranch()` does `git branch -a --list *{slug}*` then exact-matches against `${branchPrefix}${slug}`. The glob search already finds branches regardless of prefix — the exact match is what filters. The fallback chain would operate between the glob and the filter.
- `work.ts:1963`: `createWorktree()` is the ONLY place a branch is created. It's called from `startBuildPhase()`. At this point, scope.md exists (validated by `artifact save scope` earlier in the pipeline). `extractScopeKind()` is available and reliable here.
- `work.ts:2004`: `printExistingWorktree()` constructs the branch name for display + commit counting. It's called from 3 resume paths (Build, Verify, Fix). All have the worktree path available — reading actual HEAD is possible.
- `worktree.ts:185,301`: Both `createWorktree()` and `getWorktreeInfo()` receive `branchPrefix` as a parameter (already resolved). They construct `${branchPrefix}${slug}` from the resolved value. These functions don't need to change — their callers do.

### Constraints Discovered
- [TYPE-VERIFIED] `readBranchPrefix()` is called in 4 files: `work.ts` (3 call sites), `pr.ts` (1), `artifact.ts` (1), `git-operations.ts` (definition). Every call site has access to `projectRoot`.
- [TYPE-VERIFIED] `getWorkBranch()` searches git branches with a glob pattern — it ALREADY finds branches regardless of prefix. The exact-match filter is the only thing that breaks.
- [TYPE-VERIFIED] `getNextAction()` at `work.ts:502` takes `_branchPrefix` but doesn't use it (parameter is unused, kept for API compat). No change needed.
- [OBSERVED] `work complete` removes the worktree (line 1522) BEFORE branch cleanup (line 1386). The worktree's HEAD is unavailable at cleanup time. With slug-based `getWorkBranch`, this is not a problem — branch lookup uses git, not the worktree. But `getWorkBranch` must be called BEFORE the branch is deleted (line 1386 runs after prune at 1383).
- [TYPE-VERIFIED] `getWorkBranch` already returns the full branch name as a string. Callers at `work.ts:743` and `work.ts:1387` use the returned value. But `work complete` at line 1386 also constructs `workBranchName` separately — this parallel construction must be eliminated.
- [OBSERVED] `preserveUserState()` uses `AnaJsonSchema.safeParse()` — the schema MUST accept map-form before anyone writes map-form config. Otherwise re-init destroys it.
- [OBSERVED] Agent templates use `{branchPrefix}` as literal placeholder text — agents read ana.json themselves at runtime. The templates don't need updating, but agent behavior with map-form config should be verified.
- [INFERRED] The `ana config set` command (configurability-improvements Phase 2) would allow `JSON.parse` to write map-form values. No special handling needed, but the display for `ana config` (show all) should render maps readably, not as `[object Object]`.

### Test Infrastructure
- `tests/commands/work.test.ts:425-580`: Comprehensive branchPrefix tests — custom prefix, empty prefix, branch discovery, complete cleanup, template placeholders. Pattern: `createWorkTestProject()` with `branchPrefix` option → `getWorkStatus()` → assert output. New tests follow this pattern with map-form config.
- `tests/utils/git-operations.test.ts:39-100,258-299`: `readBranchPrefix` tests cover: configured value, absent field, empty string, invalid types (number, null), injection payloads. Schema round-trip tests for string form. New tests add: map-form value, map with missing keys, malformed map, map round-trip through schema.
- `tests/commands/pr.test.ts:140-170`: branchPrefix tests for PR warning behavior with custom prefix. New test: map-form prefix with kind-based warning.
- `tests/commands/artifact.test.ts:396+`: branchPrefix tests for artifact validation guidance messages. New test: map-form prefix in error messages.

## For AnaPlan

### Structural Analog
`packages/cli/src/utils/git-operations.ts:107-134` (`readBranchPrefix`) — the function being extended. Its existing pattern (read JSON, type-check, validate, fallback) defines the approach for the map form. The `readArtifactBranch` function at line 59 is structurally identical — same file, same pattern, same fallback strategy. Use both as templates.

### Relevant Code Paths
- `packages/cli/src/commands/init/anaJsonSchema.ts:41` — schema definition, the `.string()` that becomes a union
- `packages/cli/src/utils/git-operations.ts:107-134` — `readBranchPrefix()`, the core change
- `packages/cli/src/commands/work.ts:671,1044,1656` — three `readBranchPrefix()` call sites in work.ts
- `packages/cli/src/commands/work.ts:135-145` — `getWorkBranch()`, needs fallback chain
- `packages/cli/src/commands/work.ts:1386` — `work complete` branch cleanup, needs reliable branch resolution
- `packages/cli/src/commands/work.ts:1890-1963` — `startBuildPhase()`, the branch creation path where kind is available
- `packages/cli/src/commands/work.ts:1996-2025` — `printExistingWorktree()`, display-only branch name construction
- `packages/cli/src/commands/pr.ts:164,174` — branch validation warning
- `packages/cli/src/commands/artifact.ts:946,981` — error message guidance
- `packages/cli/src/utils/worktree.ts:177-185,293-301` — `createWorktree` and `getWorktreeInfo` (receive resolved prefix)
- `packages/cli/src/utils/proofSummary.ts:432` — `extractScopeKind()`, the kind reader
- `packages/cli/src/commands/init/state.ts:493` — `preserveUserState()`, the re-init merge path

### Patterns to Follow
- `git-operations.ts` fallback chain: check → validate → return, with `'feature/'` as ultimate fallback
- `anaJsonSchema.ts` per-field `.catch()` for fail-soft validation
- `work.test.ts:425+` test structure for branchPrefix behavior

### Known Gotchas
- **`getWorkBranch` callers that reconstruct separately.** Today, several callers call `getWorkBranch` to check existence and then SEPARATELY construct `${branchPrefix}${slug}` for use. For example, `work complete` at line 1386-1387 calls `getWorkBranch` but also constructs `workBranchName` independently. After this change, callers must use the branch name returned by `getWorkBranch` instead of reconstructing. AnaPlan should audit every call site to ensure the returned name is used, not a parallel reconstruction.
- **`work complete --merge` branch name.** The `--merge` path at line 1072 constructs `workBranchName` before checking whether a branch exists. It uses this name for `gh pr view` and `gh pr merge`. With slug-based lookup, it could call `getWorkBranch` first to get the actual name. But `getWorkBranch` might return null (branch already deleted after merge). The `--merge` path needs the name BEFORE merge to issue the merge command. AnaPlan must design this carefully: use `getWorkBranch` if branch exists, fall back to `readBranchPrefix(root, kind)` reconstruction only for `--merge`.
- **`readBranchPrefix` is not schema-aware.** It reads raw JSON with `JSON.parse()` and checks `typeof prefix`. It does NOT import or use `AnaJsonSchema`. The map-form handling must be added to the raw-JSON reader, not to the Zod schema. The schema governs re-init; the reader governs runtime. They must both handle the map form, but they're independent code paths.
- **Slug substring matching.** `git branch -a --list *{slug}*` is a substring glob. A slug `add-auth` would match branch `add-auth-system` belonging to a different work item. The filter `b.endsWith(\`/${slug}\`) || b === slug` avoids this — it requires the slug to be the final path segment or the entire name. But AnaPlan should verify this handles all branch naming patterns including `remotes/origin/` prefixes (which are stripped at line 140).
- **The `_branchPrefix` parameter in `getNextAction`.** This unused parameter exists for API compatibility. Don't remove it — it would break the call signature at line 745. Leave it unused.
- **`ana config` display.** When configurability-improvements Phase 2 ships, `ana config` shows all fields. A map-form `branchPrefix` would need readable display — not `[object Object]`. This isn't this scope's problem, but AnaPlan should note that `config.ts` (Phase 2) should handle object values in its display logic. If Phase 2 ships before this scope, the display code already exists and may need updating.

### Things to Investigate
- Whether any agent template (Build, Plan, Verify) programmatically calls `readBranchPrefix()` or equivalent at runtime, vs. treating `{branchPrefix}` as instructional text. If agents resolve this placeholder themselves, they need kind awareness.
- Whether `getWorkBranch` should still accept `branchPrefix` as a parameter at all after this change. Today its signature is `(slug, branchPrefix)` — if lookup is slug-based, the second parameter is unused. Removing it would break callers. Keeping it unused (like `_branchPrefix` in `getNextAction`) maintains API compat but adds confusion. AnaPlan should decide: remove and update callers, or deprecate-in-place.
- How the `--merge` path should resolve the branch name when the branch might not exist yet (pre-merge) or might already be deleted (post-merge-pre-complete). The safest approach may be: try `getWorkBranch` → fall back to `readBranchPrefix(root, extractScopeKind(...))` → fall back to `readBranchPrefix(root)`. But this is a 3-step fallback for one specific path. AnaPlan should evaluate whether `--merge` is common enough to warrant special handling or whether `getWorkBranch` + config fallback is sufficient.
