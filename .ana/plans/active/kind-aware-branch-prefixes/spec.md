# Spec: Kind-aware branch prefixes

**Created by:** AnaPlan
**Date:** 2026-05-12
**Scope:** .ana/plans/active/kind-aware-branch-prefixes/scope.md

## Approach

Two coordinated changes that share a single principle: **use config only for creation, use git for lookup.**

**1. Config expansion.** `branchPrefix` in ana.json becomes a union: string (existing) or record mapping kind names to prefix strings (new). The Zod schema in `anaJsonSchema.ts` accepts both forms. The runtime reader `readBranchPrefix()` gains an optional `kind` parameter. When kind is provided and config is a map, it looks up the kind key. Fallback chain: requested kind → `'feature'` key → hardcoded `'feature/'`. String-form config ignores `kind` entirely.

**2. Slug-based branch lookup.** Every function that finds or displays an existing branch stops reconstructing `${branchPrefix}${slug}` from config. Instead:
- `getWorkBranch(slug)` matches branches by `b.endsWith('/' + slug) || b === slug` — the slug is the stable identifier.
- `getWorktreeInfo(projectRoot, slug)` reads the branch name from `git rev-parse --abbrev-ref HEAD` inside the worktree.
- `printExistingWorktree(projectRoot, slug, ...)` reads HEAD from the worktree.
- `startWork` resume path reads HEAD from the worktree.

Config-dependent branch creation happens in exactly one place: `startBuildPhase()`, where `extractScopeKind()` reads the scope's kind and `readBranchPrefix(root, kind)` resolves the prefix. Every subsequent operation finds the branch by slug or reads it from git.

## Output Mockups

**ana.json with map-form branchPrefix:**
```json
{
  "branchPrefix": {
    "feature": "feature/",
    "fix": "fix/",
    "chore": "chore/"
  }
}
```

**Branch creation for a fix-kind scope:**
```
Creating worktree for `auth-timeout`...
  Branch: fix/auth-timeout
  Worktree: .ana/worktrees/auth-timeout
```

**Branch found after config change (user changed prefix from `feature/` to map form):**
```
Worktree exists for `auth-timeout`.
  Path: .ana/worktrees/auth-timeout
  Branch: feature/auth-timeout
  Commits: 3 since branch point
```
The branch name comes from git, not config — so the old `feature/` prefix is displayed correctly even after config changes.

## File Changes

### `packages/cli/src/commands/init/anaJsonSchema.ts` (modify)
**What changes:** The `branchPrefix` field becomes a union of string and record. Both arms have `.catch('feature/')` for fail-soft behavior. The record arm validates that all values are strings.
**Pattern to follow:** The existing per-field `.catch()` + `.default()` pattern already in this file.
**Why:** Without this, `preserveUserState()` in `state.ts` would destroy map-form config on re-init — `AnaJsonSchema.safeParse()` would fail the string validator and `.catch()` would reset to `'feature/'`.

### `packages/cli/src/utils/git-operations.ts` (modify)
**What changes:** `readBranchPrefix()` gains an optional `kind` parameter. When config is a record (checked via `typeof prefix === 'object' && prefix !== null && !Array.isArray(prefix)`), it resolves the requested kind from the map with fallback chain: kind key → `'feature'` key → `'feature/'`. Each map value is individually validated with `validateBranchName()`. When config is a string, behavior is unchanged — `kind` is ignored.
**Pattern to follow:** The existing `readBranchPrefix()` structure: read JSON, type-check, validate, fallback. Also `readArtifactBranch()` in the same file for the structural pattern.
**Why:** This is the runtime reader. The schema governs re-init; the reader governs runtime. They handle the map form independently.

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** Six reconstruction sites change:

1. **`getWorkBranch` (line 135):** Remove `branchPrefix` parameter. Filter changes from exact match against `${branchPrefix}${slug}` to `b.endsWith('/' + slug) || b === slug`. Prefers local over remote (existing behavior preserved). All 3 callers (lines 295, 744, 1388) drop the `branchPrefix` argument.

2. **`startWork` resume path (line 1683):** Replace `const branchName = \`${branchPrefix}${slug}\`` with `git rev-parse --abbrev-ref HEAD` read. The worktree is confirmed to exist at this point (`currentWorktreeSlug === slug`). Remove `readBranchPrefix()` call at line 1673 — no longer needed; `readArtifactBranch` is still needed.

3. **`printExistingWorktree` (line 2013):** Remove `branchPrefix` parameter. Read branch from `runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: wtPath })`. All 3 callers (lines 1884, 1919, and the verify/fix resume paths) drop the `branchPrefix` argument.

4. **`startBuildPhase` (line 1907):** This is the ONE call site that needs kind-resolved prefix. Read scope kind via `extractScopeKind(path.join(activePath, 'scope.md'))`, pass to `readBranchPrefix(projectRoot, kind)`, pass resolved prefix to `createWorktree()`. Import `extractScopeKind` from `proofSummary.ts`.

5. **`completeWork` branch cleanup (line 1387-1402):** Replace parallel `workBranchName = \`${branchPrefix}${slug}\`` construction with the `getWorkBranch(slug)` return value. Lines 1391 (`git branch -r --list`), 1397 (`merge-base --is-ancestor`), and 1402 (`gh pr view`) all use the returned branch name. Remove the `readBranchPrefix()` call at line 1045 — no longer needed for this path.

6. **`completeWork --merge` path (line 1072-1131):** Replace `workBranchName = \`${branchPrefix}${slug}\`` with `getWorkBranch(slug)`. For the "already merged" edge case where the branch is deleted, `getWorkBranch` returns null — fall back to `readBranchPrefix(projectRoot, extractScopeKind(...))` reconstruction for that single path. This is the only place config-based reconstruction survives as a fallback.

**`getWorkStatus` (line 672):** Remove `readBranchPrefix()` call. The `branchPrefix` local is no longer passed to `getWorkBranch` or `getWorktreeInfo`. The `gatherArtifactState` call at line 737 may still need it — check whether `gatherArtifactState` uses `branchPrefix` internally. If not, remove from its parameter list too. Similarly, `getNextAction` at line 746 takes `_branchPrefix` (unused) — leave that parameter for API compat.

**Pattern to follow:** The existing `runGit` helper for git operations. The existing `getWorkBranch` glob+filter pattern — the slug-based filter replaces the exact-match filter but the structure is identical.
**Why:** Config-based reconstruction is the disease. Every consumer that reconstructs `${branchPrefix}${slug}` will break when config changes. Slug-based lookup removes the dependency.

### `packages/cli/src/commands/pr.ts` (modify)
**What changes:** Line 174 changes from `currentBranch.startsWith(branchPrefix)` to slug-based check: `currentBranch.endsWith('/' + slug) || currentBranch === slug`. The warning message changes to reference the slug rather than the prefix pattern.
**Pattern to follow:** Same `endsWith` pattern used in `getWorkBranch`.
**Why:** With map-form config, `startsWith(branchPrefix)` would need to check all map values. The slug check is simpler and correct regardless of config form.

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:** Line 951 replaces `git checkout ${branchPrefix}${slug}` guidance with either the `getWorkBranch()` return value or a generic "switch to the feature branch" hint when no branch exists yet. Import `getWorkBranch` from `work.ts` if it's exported, or use `readBranchPrefix(projectRoot, extractScopeKind(...))` as a one-off reconstruction — the error message is guidance text, not an operation that must succeed.
**Pattern to follow:** The existing error message pattern in artifact.ts — `chalk.red` + `chalk.gray` guidance.
**Why:** With map-form config, `${branchPrefix}` is an object, not a string. The guidance message would show `[object Object]slug`.

### `packages/cli/src/utils/worktree.ts` (modify)
**What changes:** `getWorktreeInfo` (line 293) removes `branchPrefix` parameter. Reads branch name from `runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: wtPath })` instead of constructing `${branchPrefix}${slug}`. The read branch name is used for commit counting (line 308), last activity (line 322), and the returned `branch` field (line 337). `createWorktree` is unchanged — it receives a resolved prefix string from the caller.
**Pattern to follow:** The existing `runGit` usage in the same file.
**Why:** The worktree's git HEAD is the truth. Reconstruction from config can't be wrong if we don't reconstruct.

### `packages/cli/src/commands/init/state.ts` (no code change)
**What changes:** Nothing. `preserveUserState()` at line 493 runs `AnaJsonSchema.safeParse()` — the schema change in `anaJsonSchema.ts` is sufficient. Verify that map-form config survives the round-trip.

## Acceptance Criteria

### Config expansion
- [ ] AC1: `branchPrefix: "feature/"` (string form) continues to work identically — all existing tests pass unchanged
- [ ] AC2: `branchPrefix: { "feature": "feature/", "fix": "fix/", "chore": "chore/", "milestone": "milestone/" }` (map form) is accepted by the Zod schema without error
- [ ] AC3: `readBranchPrefix(projectRoot)` with no kind argument returns `'feature/'` as default when config is a map (backward-compatible fallback)
- [ ] AC4: `readBranchPrefix(projectRoot, 'fix')` returns `'fix/'` when config is `{ "fix": "fix/", "feature": "feature/" }`
- [ ] AC5: `readBranchPrefix(projectRoot, 'fix')` returns `'feature/'` when config is `"feature/"` (string form ignores kind)
- [ ] AC6: `readBranchPrefix(projectRoot, 'unknown')` with a kind not in the map falls back to the `feature` key, then to `'feature/'`
- [ ] AC7: `readBranchPrefix(projectRoot, undefined)` with map config returns the `feature` key value as default
- [ ] AC8: A malformed map (e.g., `{ "fix": 42 }`) falls back to `'feature/'` via `.catch()`
- [ ] AC9: Map-form `branchPrefix` survives `ana init` re-init (preserved through `AnaJsonSchema.safeParse()` + `preserveUserState`)
- [ ] AC10: Each map value is independently validated by `validateBranchName()` — an invalid value in one key doesn't corrupt the entire map
- [ ] AC11: Empty map `{}` falls back to `'feature/'`
- [ ] AC12: Map with only partial keys (e.g., `{ "fix": "bugfix/" }`) resolves missing keys to `'feature/'` default

### Branch creation
- [ ] AC13: `startBuildPhase` reads the scope's kind via `extractScopeKind()` and passes the kind-resolved prefix to `createWorktree` — a `Kind: fix` scope with map config creates a `fix/{slug}` branch

### Branch lookup
- [ ] AC14: `getWorkBranch` finds branches by slug match (`b.endsWith('/' + slug) || b === slug`) regardless of what prefix was used at creation time
- [ ] AC15: `getWorkBranch` returns the full branch name (e.g., `fix/auth-timeout`) — consumers use the actual name, not a config-based reconstruction
- [ ] AC16: `getWorkBranch` does not false-match branches containing the slug as a substring (e.g., branch `add-auth-system` does not match slug `add-auth`)
- [ ] AC17: A branch created with `feature/my-slug` is found by `getWorkBranch` after config changes to `{ "feature": "feat/" }` — slug match is prefix-independent

### Branch display
- [ ] AC18: `printExistingWorktree` reads the branch name from the worktree's git HEAD, not from config reconstruction
- [ ] AC19: `getWorktreeInfo` reads the branch name from the worktree's git HEAD for commit counting, last-activity display, and the returned `branch` field
- [ ] AC20: `startWork` resume path (inside worktree) reads git HEAD for branch display

### Consumer updates
- [ ] AC21: `work complete` uses the branch name returned by `getWorkBranch` for branch cleanup — the parallel `workBranchName = ${branchPrefix}${slug}` construction is eliminated
- [ ] AC22: `work complete --merge` calls `getWorkBranch` to get the branch name — falls back to config reconstruction only for the "already merged" edge case where branch is deleted
- [ ] AC23: `pr.ts` branch validation uses slug-based check instead of `startsWith(branchPrefix)`
- [ ] AC24: `artifact.ts` error message guidance uses a resolved branch name or generic hint instead of `${branchPrefix}${slug}` string concatenation
- [ ] AC25: `work status` correctly displays branch info for all active work items regardless of prefix config form

### Safety
- [ ] AC26: No existing tests break. Test count increases.
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`

## Testing Strategy

- **Unit tests for `readBranchPrefix`:** Add to `tests/utils/git-operations.test.ts`. Follow the existing describe block structure (lines 38-84). New tests: map-form value, map with kind parameter, map fallback chain (missing kind → feature key → hardcoded), malformed map values, empty map, partial map.
- **Unit tests for `AnaJsonSchema`:** Add to the existing `AnaJsonSchema branchPrefix` describe block (lines 258-301). New tests: map-form parse, map-form round-trip, map survives re-init parse.
- **Integration tests for `getWorkBranch`:** Add to `tests/commands/work.test.ts`. Follow the `createWorkTestProject` pattern. New tests: slug-based matching finds branches regardless of prefix, no false-match on substring slugs, branch found after config change.
- **Integration tests for slug-based display:** Test that `getWorkStatus` with map-form config correctly shows branch info. Follow existing status test patterns.
- **Tests for `pr.ts` slug-based check:** Add to `tests/commands/pr.test.ts` in the existing `configurable branchPrefix` block (line 140). New test: map-form prefix with slug-based branch validation warning.
- **Edge cases:** Empty map, partial map, malformed values in map, config change between creation and lookup.

## Dependencies

- `extractScopeKind` is already exported from `proofSummary.ts` (verified at line 432). No new dependencies needed.
- `validateBranchName` is already available in `git-operations.ts` (used by `readBranchPrefix`). No new imports for the map validation.

## Constraints

- All existing tests must pass unchanged. The string-form behavior is backward-compatible.
- `getNextAction` keeps its `_branchPrefix` parameter for API compatibility — it's referenced externally.
- `createWorktree` signature is unchanged — it receives a resolved prefix string.
- Agent templates are unchanged — they use `{branchPrefix}` as instructional text, not programmatic resolution.

## Gotchas

- **`readBranchPrefix` is not schema-aware.** It reads raw JSON with `JSON.parse()` and does `typeof` checks. The map-form handling must be added to the raw-JSON reader directly — not delegated to Zod. The schema and the reader are independent code paths that must both handle the map form.
- **`work complete` removes the worktree BEFORE branch cleanup (line 1522).** After worktree removal, `rev-parse HEAD` inside the worktree is impossible. With slug-based `getWorkBranch`, this is not a problem — branch lookup uses `git branch -a`, not the worktree's HEAD.
- **`remotes/` stripping at line 140.** `getWorkBranch` strips `remotes/` but NOT `origin/`. After stripping, remote branches look like `origin/feature/my-slug`. The `endsWith('/' + slug)` filter correctly matches these. The function prefers local over remote — this behavior is unchanged.
- **The `_branchPrefix` parameter in `getNextAction`.** Unused, kept for API compat. Don't remove it.
- **`branchExists()` in `createWorktree` at line 199.** Uses `branchExists(projectRoot, branchName)` where `branchName` is constructed from prefix+slug. If config changes between runs, this could miss an existing branch under the old prefix. However, `worktreeExists` at `work.ts:1915` catches the resume case before `createWorktree` is reached.
- **`gatherArtifactState` receives `branchPrefix`.** Check whether it uses it internally — if `getWorkBranch` calls inside it are updated to drop the param, the outer `branchPrefix` local in `getWorkStatus` may become unused. Clean up any dead locals.
- **`artifact.ts` needs `getWorkBranch` or similar.** If `getWorkBranch` is not exported from work.ts, the error message guidance in artifact.ts should use `readBranchPrefix(projectRoot, extractScopeKind(...))` for reconstruction — this is guidance text in an error message, not an operational branch lookup. Alternatively, export `getWorkBranch` — but consider whether artifact.ts should depend on work.ts.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Prefer early returns over nested conditionals.
- Always use `--run` flag with `pnpm vitest` to avoid watch mode hang.
- Use `| null` for checked-and-empty, `?:` for unchecked.
- Error handling: commands surface errors with `chalk.red` + `process.exit(1)`. Utility functions return defaults on failure.

### Pattern Extracts

**`readBranchPrefix` — the function being extended (git-operations.ts:107-134):**
```typescript
export function readBranchPrefix(projectRoot?: string): string {
  const anaJsonPath = path.join(projectRoot ?? process.cwd(), '.ana', 'ana.json');

  if (!fs.existsSync(anaJsonPath)) {
    return 'feature/';
  }

  let config: Record<string, unknown>;
  try {
    const content = fs.readFileSync(anaJsonPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    return 'feature/';
  }

  const prefix = config['branchPrefix'];
  if (typeof prefix !== 'string') {
    return 'feature/';
  }

  try {
    validateBranchName(prefix);
  } catch {
    return 'feature/';
  }

  return prefix;
}
```

**`getWorkBranch` — the filter being changed (work.ts:135-145):**
```typescript
function getWorkBranch(slug: string, branchPrefix: string): string | null {
  const result = runGit(['branch', '-a', '--list', `*${slug}*`]);
  if (result.exitCode !== 0 || !result.stdout) return null;

  // Parse branches — prefer local over remote
  const branches = result.stdout.split('\n').map(b => b.trim().replace(/^\* /, '').replace(/^remotes\//, ''));
  const local = branches.find(b => b === `${branchPrefix}${slug}`);
  const remote = branches.find(b => b === `origin/${branchPrefix}${slug}`);

  return local || remote || null;
}
```

**`getWorktreeInfo` — reconstruction to replace (worktree.ts:293-341):**
```typescript
export function getWorktreeInfo(
  projectRoot: string,
  slug: string,
  branchPrefix: string
): WorktreeInfo | null {
  const wtPath = getWorktreePath(projectRoot, slug);
  if (!fs.existsSync(wtPath)) return null;

  const branchName = `${branchPrefix}${slug}`;
  // ... uses branchName for rev-list, log, and return value
}
```

**Zod schema field — the line becoming a union (anaJsonSchema.ts:47):**
```typescript
    branchPrefix: z.string().optional().default('feature/').catch('feature/'),
```

**`extractScopeKind` — available for kind resolution (proofSummary.ts:432-444):**
```typescript
export function extractScopeKind(scopePath: string): 'feature' | 'fix' | 'chore' | 'milestone' | undefined {
  if (!fs.existsSync(scopePath)) return undefined;
  try {
    const content = fs.readFileSync(scopePath, 'utf-8');
    const kindMatch = content.match(/\*\*Kind:\*\*\s*(.+)/);
    if (!kindMatch || !kindMatch[1]) return undefined;
    const raw = kindMatch[1].trim().toLowerCase();
    if (raw === 'feature' || raw === 'fix' || raw === 'chore' || raw === 'milestone') return raw;
    return undefined;
  } catch {
    return undefined;
  }
}
```

### Proof Context

**git-operations.ts:** `getCurrentBranch` still uses `execSync` (not hardened). Pre-existing unused eslint-disable at line 169. Neither affects this build.

**work.ts, worktree.ts, pr.ts, artifact.ts, anaJsonSchema.ts:** No active proof findings relevant to this build.

### Checkpoint Commands

- After schema change (`anaJsonSchema.ts`): `(cd packages/cli && pnpm vitest run tests/utils/git-operations.test.ts --run)` — Expected: existing tests pass, new schema tests pass
- After `readBranchPrefix` change: `(cd packages/cli && pnpm vitest run tests/utils/git-operations.test.ts --run)` — Expected: all reader tests pass
- After work.ts changes: `(cd packages/cli && pnpm vitest run tests/commands/work.test.ts --run)` — Expected: all existing + new tests pass
- After all changes: `(cd packages/cli && pnpm vitest run --run)` — Expected: all tests pass, count > 2156
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2156 passed, 2 skipped (2158 total)
- Current test files: 100
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2180+ tests (adding ~8-12 new test cases for map-form config, slug-based matching, and consumer updates)
- Regression focus: `tests/commands/work.test.ts` (branchPrefix tests at line 628+), `tests/utils/git-operations.test.ts` (readBranchPrefix tests at line 38+), `tests/commands/pr.test.ts` (branchPrefix tests at line 140+)
