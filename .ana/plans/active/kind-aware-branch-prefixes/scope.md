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

Expand `branchPrefix` in ana.json from a string to a union of string or record. When the value is a string, behavior is identical to today — every branch gets that prefix. When the value is a record mapping kind names to prefixes, the system resolves the prefix by reading the scope's `kind` field at branch-relevant moments.

The key architectural choice: **resolve the prefix as late as possible, as close to the consumer as possible.** `readBranchPrefix()` gains an optional `kind` parameter. When kind is provided and the config is a map, it looks up the kind. When kind is not provided or the config is a string, it returns the string (backward-compatible). Callers that need the resolved prefix (branch creation, branch lookup) pass the kind. Callers that only need a display hint can pass nothing and get the default.

For call sites where reading the scope's kind would be expensive (e.g., `work status` iterating all slugs), the function falls back to constructing branch names using each possible prefix and checking which one exists in git. This avoids N filesystem reads for scope.md during status display.

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
- AC19: In-flight work items created with string-form prefix remain discoverable after config changes to map form (graceful migration)
- AC20: No existing tests break. Test count increases.

## Edge Cases & Risks

### Critical: In-flight branch resolution

The most dangerous scenario: a user has `feature/add-auth` in progress (created when `branchPrefix` was `"feature/"`). They change their config to the map form: `{ "feature": "feat/", "fix": "fix/" }`. Now `getWorkBranch` looks for `feat/add-auth` — can't find it. The work item appears to have no branch.

**Mitigation strategy:** `getWorkBranch` must be resilient to config changes. When the primary lookup (`{resolved_prefix}{slug}`) fails, fall back to searching for `*{slug}*` in branch list and matching any branch that ends with the slug. This is what `getWorkBranch` already does partially (line 136: `git branch -a --list *{slug}*`) — but the exact-match filter on line 141 (`branches.find(b => b === \`${branchPrefix}${slug}\`)`) is what breaks. The fix: try the kind-based prefix first, then try the default `feature` key, then try any branch ending in the slug. Document the fallback chain clearly.

This is the highest-risk edge case. AnaPlan should design the fallback chain carefully and ensure it doesn't match unrelated branches (e.g., `other-project/add-auth` matching on slug alone).

### Critical: Re-init schema preservation

`preserveUserState()` at `state.ts:493` parses existing ana.json through `AnaJsonSchema.safeParse()`. The current schema defines `branchPrefix` as `z.string().optional().default('feature/').catch('feature/')`. If the user has a map-form `branchPrefix`, the string validator fails, `.catch()` fires, and the map silently resets to `'feature/'`.

**Mitigation:** The schema change must use `z.union()` — accepting both string and record forms. Both forms must have their own `.catch()` behavior. If the union itself fails, fall back to `'feature/'`. This is the same fail-soft pattern used by every other field in `anaJsonSchema.ts`.

**Dependency:** This is why `configurability-improvements` Phase 1 (passthrough) should ship first. With passthrough, even if the schema change hasn't landed, the map form would survive re-init as an unknown key. Without passthrough AND without the schema change, re-init destroys the map. With the schema change, re-init preserves it regardless of passthrough.

### Medium: scope.md reading for kind resolution

Multiple call sites need the kind to resolve the prefix. `extractScopeKind()` reads and parses scope.md from disk. This adds filesystem I/O to code paths that previously only read ana.json.

**Performance concern:** `work status` iterates all active slugs. Each slug would need a scope.md read to get the kind. For typical usage (1-3 active items), this is negligible. For pathological cases (20+ stalled items), it's 20+ file reads.

**Mitigation:** For `getWorkBranch` calls in `work status`, use the git-search fallback (check all branches matching the slug pattern) instead of reading scope.md. Reserve scope.md reading for write operations (`startBuildPhase`, `work complete`) where accuracy matters more than speed.

### Medium: `printExistingWorktree` display

At `work.ts:2004`, `printExistingWorktree` constructs `const branchName = \`${branchPrefix}${slug}\`` for display and commit counting. With map-form config, this needs the kind. But `printExistingWorktree` is called from multiple resume paths, not all of which have the kind readily available.

**Mitigation:** `printExistingWorktree` can read the actual branch name from the worktree's git HEAD instead of reconstructing it: `runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: wtPath })`. This is more robust regardless of the config form — it shows what the branch actually is, not what we think it should be.

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

- **Storing the resolved prefix in `.saves.json` at branch creation time.** Would eliminate the need to re-resolve the prefix during status/complete. Rejected because: it adds a new field that must be read by every consumer, older work items wouldn't have it (migration problem), and the fallback chain in `getWorkBranch` is more robust and requires no stored state.
- **Making `readBranchPrefix()` always return a resolved string by requiring kind at every call site.** Would require all 6 callers to either know the kind or pass `undefined`. Rejected because: `work status` and `pr.ts` don't always have easy access to kind, and the optional parameter approach is cleaner — callers that can provide kind do; callers that can't get the default.
- **Reading the actual branch name from git in all cases (never reconstructing from config).** Would work for existing worktrees but not for `startBuildPhase` (creating a new branch) or `getWorkBranch` (finding a remote-only branch). Branch creation inherently requires knowing the desired name. Reconstruction from config is unavoidable for write operations.
- **Using `kind` in the slug itself (e.g., `fix-auth-timeout` auto-detects kind from the `fix-` prefix).** Fragile — `fix-header-layout` is a feature, not a fix. Slug naming is the developer's creative domain. Don't parse meaning from it.
- **Separate `branchPrefixes` field instead of overloading `branchPrefix`.** Would be cleaner (no union type) but creates two fields that mean the same thing. Which one wins? What happens when both are set? The union on a single field is simpler — one field, two shapes, clear priority.

## Open Questions

- **Should `getWorkBranch` use git-search fallback universally (for both string and map configs)?** This would make the function resilient to any config change, not just string→map migration. The downside is that `git branch -a --list *{slug}*` could match unrelated branches in repos with many branches. AnaPlan should evaluate whether the exact-match-first, fallback-second approach is sufficient or whether tighter matching (e.g., checking if the matched branch ends with exactly `/{slug}` or equals `{slug}`) is needed.
- **Should `work complete` read the actual branch name from git instead of reconstructing it?** The cleanup path at `work.ts:1386` does `${branchPrefix}${slug}` to find the branch to delete. If the branch was created with a different prefix, this would fail to find it. Reading the branch name from the worktree's HEAD or from `.saves.json` would be more robust. But `.saves.json` doesn't currently store the branch name, and the worktree might already be removed by the time branch cleanup runs (line 1522 removes the worktree before branch cleanup at line 1386). AnaPlan needs to evaluate the ordering carefully.
- **Should partial maps warn during `readBranchPrefix`?** If the map has `fix` and `chore` but not `feature`, that's probably a mistake. Should `readBranchPrefix` log a warning? Or is silent fallback sufficient?

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
- [OBSERVED] `work complete` removes the worktree (line 1522) BEFORE branch cleanup (line 1386). This means the worktree's HEAD is unavailable during branch cleanup. The branch name must be resolved from config or stored elsewhere.
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
- **Worktree removal ordering.** `work complete` removes the worktree (line 1522) before looking up the branch for cleanup (line 1386). If the branch name was resolved from the worktree's HEAD, it's unavailable at cleanup time. The branch name must be resolved earlier in the function and stored in a local variable before worktree removal.
- **`readBranchPrefix` is not schema-aware.** It reads raw JSON with `JSON.parse()` and checks `typeof prefix`. It does NOT import or use `AnaJsonSchema`. The map-form handling must be added to the raw-JSON reader, not to the Zod schema. The schema governs re-init; the reader governs runtime. They must both handle the map form, but they're independent code paths.
- **`getWorkBranch` glob matching.** The `git branch -a --list *{slug}*` glob is loose — it would match `some-other/my-slug` in addition to `feature/my-slug`. The fallback chain must verify that matches have the expected structure (end with `/{slug}` or equal `{slug}`) to avoid false positives.
- **The `_branchPrefix` parameter in `getNextAction`.** This unused parameter exists for API compatibility. Don't remove it — it would break the call signature at line 745. Leave it unused.
- **`ana config` display.** When configurability-improvements Phase 2 ships, `ana config` shows all fields. A map-form `branchPrefix` would need readable display — not `[object Object]`. This isn't this scope's problem, but AnaPlan should note that `config.ts` (Phase 2) should handle object values in its display logic. If Phase 2 ships before this scope, the display code already exists and may need updating.

### Things to Investigate
- Whether any agent template (Build, Plan, Verify) programmatically calls `readBranchPrefix()` or equivalent at runtime, vs. treating `{branchPrefix}` as instructional text. If agents resolve this placeholder themselves, they need kind awareness.
- Whether `.saves.json` should store the resolved branch name at worktree creation time as a cheap lookup for `work complete`. This would add one field to `.saves.json` but eliminate the worktree-removal-before-branch-lookup ordering problem entirely.
- The exact fallback chain for `getWorkBranch`: should it try [kind-prefix, feature-prefix, any-ending-with-slug] or [kind-prefix, feature-prefix, string-form-default, any-ending-with-slug]? The number of git operations per fallback step matters for performance.
