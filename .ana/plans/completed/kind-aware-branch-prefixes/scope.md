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
  - `packages/cli/src/commands/work.ts` — 6 reconstruction sites that change:
    - `getWorkBranch:141-142` — filter changes from prefix-match to slug-match
    - `startBuildPhase:1963` — passes kind-resolved prefix to `createWorktree`
    - `startWork:1666` — resume display: read git HEAD instead of reconstructing
    - `printExistingWorktree:2004` — display + commit counting: read git HEAD instead of reconstructing
    - `completeWork:1386` — branch cleanup: use `getWorkBranch` return value, eliminate parallel reconstruction
    - `completeWork:1072` — `--merge` path: use `getWorkBranch` return value (branch must exist pre-merge)
  - `packages/cli/src/commands/pr.ts:174` — branch validation: change from `startsWith(branchPrefix)` to slug-based check
  - `packages/cli/src/commands/artifact.ts:946` — error message guidance: use `getWorkBranch` return value or generic worktree path hint
  - `packages/cli/src/utils/worktree.ts`:
    - `createWorktree:185` — receives kind-resolved prefix for branch creation (no signature change)
    - `getWorktreeInfo:301,308,322,337` — read git HEAD instead of reconstructing from prefix (3 internal uses + return value)
  - `packages/cli/src/commands/init/state.ts` (no code change, but `preserveUserState` behavior must be verified against new schema)
  - `packages/cli/tests/utils/git-operations.test.ts` (new map-form tests)
  - `packages/cli/tests/commands/work.test.ts` (new kind-aware + slug-based matching tests)
  - `packages/cli/tests/commands/pr.test.ts` (slug-based validation test)
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

### Config expansion
- AC1: `branchPrefix: "feature/"` (string form) continues to work identically — all existing tests pass unchanged
- AC2: `branchPrefix: { "feature": "feature/", "fix": "fix/", "chore": "chore/", "milestone": "milestone/" }` (map form) is accepted by the Zod schema without error
- AC3: `readBranchPrefix(projectRoot)` with no kind argument returns `'feature/'` as default when config is a map (backward-compatible fallback)
- AC4: `readBranchPrefix(projectRoot, 'fix')` returns `'fix/'` when config is `{ "fix": "fix/", "feature": "feature/" }`
- AC5: `readBranchPrefix(projectRoot, 'fix')` returns `'feature/'` when config is `"feature/"` (string form ignores kind)
- AC6: `readBranchPrefix(projectRoot, 'unknown')` with a kind not in the map falls back to the `feature` key, then to `'feature/'`
- AC7: `readBranchPrefix(projectRoot, undefined)` with map config returns the `feature` key value as default
- AC8: A malformed map (e.g., `{ "fix": 42 }`) falls back to `'feature/'` via `.catch()`
- AC9: Map-form `branchPrefix` survives `ana init` re-init (preserved through `AnaJsonSchema.safeParse()` + `preserveUserState`)
- AC10: Each map value is independently validated by `validateBranchName()` — an invalid value in one key doesn't corrupt the entire map
- AC11: Empty map `{}` falls back to `'feature/'`
- AC12: Map with only partial keys (e.g., `{ "fix": "bugfix/" }`) resolves missing keys to `'feature/'` default

### Branch creation (config-dependent — the one path that resolves from config)
- AC13: `startBuildPhase` reads the scope's kind via `extractScopeKind()` and passes the kind-resolved prefix to `createWorktree` — a `Kind: fix` scope with map config creates a `fix/{slug}` branch

### Branch lookup (slug-based — all paths that find existing branches)
- AC14: `getWorkBranch` finds branches by slug match (`b.endsWith('/' + slug) || b === slug`) regardless of what prefix was used at creation time
- AC15: `getWorkBranch` returns the full branch name (e.g., `fix/auth-timeout`) — consumers use the actual name, not a config-based reconstruction
- AC16: `getWorkBranch` does not false-match branches containing the slug as a substring (e.g., branch `add-auth-system` does not match slug `add-auth` — the `/` separator or exact equality prevents this)
- AC17: A branch created with `feature/my-slug` is found by `getWorkBranch` after config changes to `{ "feature": "feat/" }` — slug match is prefix-independent

### Branch display (git HEAD — all paths that show branch info in worktrees)
- AC18: `printExistingWorktree` reads the branch name from the worktree's git HEAD, not from config reconstruction
- AC19: `getWorktreeInfo` reads the branch name from the worktree's git HEAD for commit counting, last-activity display, and the returned `branch` field
- AC20: `startWork` resume path (inside worktree) reads git HEAD for branch display

### Consumer updates (use `getWorkBranch` return value, not parallel reconstruction)
- AC21: `work complete` uses the branch name returned by `getWorkBranch` for branch cleanup, merge verification, and `gh pr view` — the parallel `workBranchName = ${branchPrefix}${slug}` construction at line 1386 is eliminated
- AC22: `work complete --merge` calls `getWorkBranch` to get the branch name for `gh pr view` and `gh pr merge` — the branch must exist pre-merge, so `getWorkBranch` always finds it
- AC23: `pr.ts` branch validation uses slug-based check (`currentBranch.endsWith('/' + slug) || currentBranch === slug`) instead of `startsWith(branchPrefix)` — works with both string and map config
- AC24: `artifact.ts` error message guidance uses `getWorkBranch` return value for the branch name hint, or a generic worktree path when no branch exists yet
- AC25: `work status` correctly displays branch info for all active work items regardless of prefix config form

### Safety
- AC26: No existing tests break. Test count increases.

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
- **Storing the branch name in `.saves.json` at creation time.** Would work — `.saves.json` is written to the worktree at `work.ts:1977`, the worktree is accessible during most pre-merge operations, and the data reaches the artifact branch via PR merge. But it adds stored state that must be kept in sync. The slug-based approach is stateless — it queries git directly. No sync issues, no stale data, no timing dependencies about which `.saves.json` copy (worktree vs artifact branch) has the field. The "remove over add" principle: slug-based matching removes the config dependency; `.saves.json` adds a stored-state dependency. Removing is better than adding.
- **Making `readBranchPrefix()` always return a resolved string by requiring kind at every call site.** Would require all 6 callers to either know the kind or pass `undefined`. Rejected because: most callers don't need to resolve from config at all. Only `startBuildPhase` creates a branch. Every other caller finds or displays a branch that already exists — slug-based lookup is sufficient.
- **Using `kind` in the slug itself (e.g., `fix-auth-timeout` auto-detects kind from the `fix-` prefix).** Fragile — `fix-header-layout` is a feature, not a fix. Slug naming is the developer's creative domain. Don't parse meaning from it.
- **Separate `branchPrefixes` field instead of overloading `branchPrefix`.** Would be cleaner (no union type) but creates two fields that mean the same thing. Which one wins? What happens when both are set? The union on a single field is simpler — one field, two shapes, clear priority.

## Open Questions

- **Should partial maps warn during `readBranchPrefix`?** If the map has `fix` and `chore` but not `feature`, that's probably a mistake. Should `readBranchPrefix` log a warning? Or is silent fallback sufficient?

## Exploration Findings

### Patterns Discovered
- `git-operations.ts:107-134`: `readBranchPrefix()` reads raw JSON, checks `typeof prefix`, validates with `validateBranchName()`, returns string or fallback. The function is self-contained — no dependency on Zod schema, no import of AnaJsonSchema. This is important: the schema change and the reader change are independent. The schema governs re-init preservation; the reader governs runtime behavior.
- `work.ts:135-145`: `getWorkBranch()` does `git branch -a --list *{slug}*` then exact-matches against `${branchPrefix}${slug}`. The glob search already finds branches regardless of prefix — the exact match is what filters. The fallback chain would operate between the glob and the filter.
- `work.ts:1963`: `createWorktree()` is the ONLY place a branch is created. It's called from `startBuildPhase()`. At this point, scope.md exists (validated by `artifact save scope` earlier in the pipeline). `extractScopeKind()` is available and reliable here.
- `work.ts:2004`: `printExistingWorktree()` constructs the branch name for display + commit counting. It's called from 3 resume paths (Build, Verify, Fix). All have the worktree path available — reading actual HEAD is possible.
- `worktree.ts:185`: `createWorktree()` receives resolved `branchPrefix` as a parameter. Constructs `branchName` for branch creation. No change needed — the caller passes the kind-resolved prefix.
- `worktree.ts:301,308,322,337`: `getWorktreeInfo()` constructs `branchName` internally from prefix+slug and uses it for commit counting (308), last activity (322), and return value (337). All three must change to read git HEAD from the worktree instead of reconstructing.

### Constraints Discovered
- [TYPE-VERIFIED] `readBranchPrefix()` is called in 4 files: `work.ts` (3 call sites), `pr.ts` (1), `artifact.ts` (1), `git-operations.ts` (definition). Every call site has access to `projectRoot`.
- [TYPE-VERIFIED] `getWorkBranch()` searches git branches with a glob pattern — it ALREADY finds branches regardless of prefix. The exact-match filter is the only thing that breaks.
- [TYPE-VERIFIED] `getNextAction()` at `work.ts:502` takes `_branchPrefix` but doesn't use it (parameter is unused, kept for API compat). No change needed.
- [OBSERVED] `work complete` removes the worktree (line 1522) BEFORE branch cleanup (line 1386). The worktree's HEAD is unavailable at cleanup time. With slug-based `getWorkBranch`, this is not a problem — branch lookup uses git, not the worktree.
- [TYPE-VERIFIED] `getWorkBranch` already returns the full branch name as a string. Callers at `work.ts:743` and `work.ts:1387` use the returned value. But `work complete` at line 1386 also constructs `workBranchName` separately — this parallel construction must be eliminated. Lines 1390, 1396, 1401 use the reconstructed name for `git branch -r --list`, `merge-base --is-ancestor`, and `gh pr view` — all must switch to the `getWorkBranch` return value.
- [TYPE-VERIFIED] `getWorktreeInfo` at `worktree.ts:301` constructs `branchName` internally from prefix+slug — it does NOT just receive a resolved prefix from callers. The constructed name is used for commit counting (308), last activity (322), and is returned as the `branch` field (337). All three uses must change to git HEAD reads.
- [TYPE-VERIFIED] `startWork` at `work.ts:1666` constructs `branchName` for display when resuming inside a worktree. The worktree is confirmed to exist at this point (`currentWorktreeSlug === slug` at line 1663). Should read git HEAD.
- [VERIFIED] The `endsWith` matching handles all branch patterns correctly: `"origin/my-slug".endsWith("/my-slug")` is true (empty-prefix remote), `"feature/my-slug".endsWith("/my-slug")` is true (prefixed local), `"origin/feature/my-slug".endsWith("/my-slug")` is true (prefixed remote), `"other-my-slug".endsWith("/my-slug")` is false (substring rejection), `"feature/system-add-auth".endsWith("/add-auth")` is false (distinct slugs with shared suffix).
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
- `packages/cli/src/commands/work.ts:135-145` — `getWorkBranch()`, needs slug-based filter change
- `packages/cli/src/commands/work.ts:1666` — `startWork()` resume path, needs git HEAD read
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
- **Parallel reconstruction elimination.** Today, `work complete` at line 1386-1387 calls `getWorkBranch` but also constructs `workBranchName = ${branchPrefix}${slug}` independently. Lines 1390, 1396, 1401 then use the reconstructed name for `git branch -r --list`, `merge-base --is-ancestor`, and `gh pr view`. After this change, all these lines must use the `getWorkBranch` return value. AnaPlan should audit every call site — the rule is simple: if `getWorkBranch` was called, use its return value everywhere that branch name appears. Never reconstruct alongside a lookup.
- **`work complete --merge` branch resolution.** The `--merge` path at line 1072 constructs `workBranchName` for `gh pr view` and `gh pr merge`. The branch MUST exist pre-merge (you can't merge a nonexistent branch), so `getWorkBranch` will find it. Replace the reconstruction with `getWorkBranch`. The only edge case is "already merged" (`prData.state === 'MERGED'` at line 1113) — GitHub retains PR metadata after merge even if the branch is deleted, so `gh pr view` still works. For this edge case, fall back to `readBranchPrefix(root, extractScopeKind(...))` reconstruction — this is a 2-step resolution for one specific edge case, not a systemic fallback chain.
- **`readBranchPrefix` is not schema-aware.** It reads raw JSON with `JSON.parse()` and checks `typeof prefix`. It does NOT import or use `AnaJsonSchema`. The map-form handling must be added to the raw-JSON reader, not to the Zod schema. The schema governs re-init; the reader governs runtime. They must both handle the map form, but they're independent code paths.
- **Slug substring matching.** `git branch -a --list *{slug}*` is a substring glob. A slug `add-auth` would match branch `add-auth-system` belonging to a different work item. The filter `b.endsWith('/' + slug) || b === slug` avoids this — it requires the slug to be the final path segment or the entire name. Verified: `"origin/my-slug".endsWith("/my-slug")` is true, `"other-my-slug".endsWith("/my-slug")` is false, `"feature/system-add-auth".endsWith("/add-auth")` is false. The `/` separator prevents suffix collisions between distinct slugs.
- **`remotes/` stripping at line 140.** `getWorkBranch` strips `remotes/` but NOT `origin/`. After stripping, remote branches look like `origin/feature/my-slug`. The `endsWith('/' + slug)` filter correctly matches these (`origin/feature/my-slug` ends with `/my-slug`). The function currently returns `origin/feature/my-slug` for remotes and `feature/my-slug` for locals, preferring local. This behavior is unchanged by slug-based matching.
- **`getWorktreeInfo` returns `branchName` in its `branch` field (line 337).** The reconstructed name propagates to callers. With git HEAD reading, all three internal uses (commit count at 308, last activity at 322, return value at 337) use the correct name.
- **`branchExists()` in `createWorktree` at line 199.** Uses `branchExists(projectRoot, branchName)` where `branchName` is constructed from prefix+slug. If config changes between runs, this could miss an existing branch under the old prefix. However, `worktreeExists` at `work.ts:1898` catches the resume case (worktree directory exists → skip creation). And git itself rejects `git worktree add -b` if the branch already exists. Documented edge case, not a code change.
- **The `_branchPrefix` parameter in `getNextAction`.** This unused parameter exists for API compatibility. Don't remove it — it would break the call signature at line 745. Leave it unused.
- **`ana config` display.** When configurability-improvements Phase 2 ships, `ana config` shows all fields. A map-form `branchPrefix` would need readable display — not `[object Object]`. This isn't this scope's problem, but AnaPlan should note that `config.ts` (Phase 2) should handle object values in its display logic.

### Things to Investigate
- Whether any agent template (Build, Plan, Verify) programmatically calls `readBranchPrefix()` or equivalent at runtime, vs. treating `{branchPrefix}` as instructional text. If agents resolve this placeholder themselves, they need kind awareness.
- Whether `getWorkBranch` should still accept `branchPrefix` as a parameter after this change. Today its signature is `(slug, branchPrefix)` — with slug-based matching, the second parameter is unused. Options: remove and update callers, or deprecate-in-place (like `_branchPrefix` in `getNextAction`). AnaPlan should decide based on how many callers need updating.
