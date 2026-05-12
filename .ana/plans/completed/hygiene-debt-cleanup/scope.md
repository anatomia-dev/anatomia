# Scope: Hygiene debt cleanup

**Created by:** Ana
**Date:** 2026-05-12

## Intent

Three independent sources of recurring development noise — git pull warnings during `work complete`, Dependabot false positives on test fixtures, and transitive dependency vulnerability alerts. All share the same root cause: incremental maintenance that wasn't done, accumulating into confusing signals. The user wants to clean house — eliminate the noise permanently with minimal regression risk.

## Complexity Assessment
- **Kind:** chore
- **Size:** small — 3 independent mechanical changes, no feature logic
- **Files affected:**
  - `packages/cli/src/commands/work.ts` (3 lines changed — add `--autostash` flag)
  - `packages/cli/tests/engine/fixtures/python/requirements.txt/simple.txt` (delete)
  - `packages/cli/tests/engine/fixtures/python/requirements.txt/with-extras.txt` (delete)
  - `packages/cli/tests/engine/fixtures/node/package.json/simple.txt` (delete)
  - `packages/cli/templates/.claude/skills/testing-standards/SKILL.md` (one rule addition)
  - `.gitignore` (commit existing change — `.mcp.json` entry)
  - `pnpm-lock.yaml` (updated by `pnpm update`)
- **Blast radius:** Low. `--autostash` only changes git behavior during pull. Fixture deletions remove dead files — no test references them. `pnpm update` stays within semver ranges; workspace shares a single lockfile so both CLI and website transitives update together.
- **Estimated effort:** ~30 minutes of Build time
- **Multi-phase:** no

## Approach

Three independent fixes for three symptoms of accumulated hygiene debt:

1. **Git sync fragility.** The CLI's `pull --rebase` calls fail silently when the working tree has uncommitted changes. In `work complete`, the pull is skipped with a warning; in `work start`, it's skipped with no output at all. The local branch falls behind remote and this compounds across work items. The disease is tool fragility against normal developer working-tree state, not the specific dirty file (a `.gitignore` change that should also be committed independently).

   Add `--autostash` to all three `pull --rebase` calls. Git stashes before rebase, pops after. If pop conflicts, the developer sees conflict markers immediately — nothing is hidden. The only scenario where `--autostash` is worse than current behavior (mid-rebase state with stash) requires local unpushed commits on the artifact branch, which violates the workflow. For the 99% case (dirty tree, fast-forward pull), it fixes a silent sync failure.

   Also commit the existing `.gitignore` change (`.mcp.json` entry) — this is project convention (MCP config contains local paths), not personal state. Fixes the specific current trigger while `--autostash` fixes the general case.

2. **Dead fixture files triggering security scanners.** Three files in `tests/engine/fixtures/` contain real package names (`flask`, `django`, `express`, etc.) that trigger GitHub security advisory alerts. These files are dead code — the `loadFixture()` function that consumed them was deleted during the test migration (`785a9eb`), and no test references them. The codebase pattern is inline fixtures via `writeFile` to temp directories.

   Delete the files. This follows the design principle "the elegant solution is the one that removes." Renaming dead files to use fictional names would be treating a symptom of a symptom. Add one rule to the testing-standards skill template encoding the codebase's existing pattern: use inline fixture data for scanner tests, not standalone manifest files.

3. **Transitive dependency patches.** Run `pnpm update` (workspace-wide, no `--latest`) to pick up patches within existing semver ranges. Research confirms patches exist for the production-path vulnerabilities: minimatch 9.0.5→9.0.6+ (via glob's `^9.0.4`), picomatch 4.0.3→4.0.4 (within `^4.0.0`). Dev-only findings (postcss, rollup, flatted) also have patches available. Single lockfile at workspace root — update covers both CLI and website transitives.

## Acceptance Criteria
- AC1: All three `git pull --rebase` calls in work.ts include `--autostash`
- AC2: Dead fixture files deleted — `tests/engine/fixtures/python/` and `tests/engine/fixtures/node/` directories removed
- AC3: All existing tests pass (`pnpm vitest run` in packages/cli) — confirms fixtures were truly unreferenced
- AC4: `pnpm update` (no `--latest`) has been run at workspace root and lockfile updated
- AC5: `pnpm audit` reports fewer findings than the current 20 (target: 0, acceptable: ≤3 dev-only)
- AC6: Testing-standards skill template includes a rule about using inline fixture data (not standalone manifest files) for scanner tests
- AC7: `.gitignore` includes the `.mcp.json` entry (committed, not just local)
- AC8: `pnpm run build` succeeds — confirms no type or compilation regressions from dependency updates

## Edge Cases & Risks

- **`--autostash` conflict on pop:** If stashed changes conflict with pulled content, git leaves conflict markers after pop. This is correct behavior — the developer sees the conflict immediately. No worse than the current state where the pull is silently skipped.
- **`--autostash` mid-rebase state:** If the rebase itself conflicts (not the pop), the developer is left mid-rebase with a stash applied. Without `--autostash`, the dirty tree would have prevented the rebase from starting. This is theoretically worse, but requires local unpushed commits on the artifact branch — a workflow violation. The common case (fast-forward pull with dirty tree) is what matters, and `--autostash` fixes it.
- **`pnpm update` breaking something:** Semver-only updates should be safe, but transitive changes can surprise. AC3 and AC8 (tests pass, build succeeds) catch regressions. If something breaks, `git checkout pnpm-lock.yaml && pnpm install` reverts cleanly.
- **`pnpm update` website side effects:** The website shares the workspace lockfile. Transitive updates could affect Next.js/React/Tailwind behavior in ways tests don't cover. Risk is low (patch versions only) and the website has no test suite to verify against — visual inspection is the mitigation if concerns arise.
- **Fixture deletion leaving empty directories:** After deleting the three files, `tests/engine/fixtures/python/` and `tests/engine/fixtures/node/` directories become empty. Git doesn't track empty directories, so they disappear from the repo automatically. The parent `tests/engine/fixtures/` directory should also be removed if empty (the only other content is `fixtures.ts` which is at `tests/engine/fixtures.ts`, not inside the `fixtures/` directory — verify this).

## Rejected Approaches

- **Renaming fixture package names to fictional ones.** The files are dead code — no test reads them. Renaming treats a symptom of a symptom. Deletion is cleaner, simpler, and follows "the elegant solution is the one that removes."
- **`dependabot.yml` ignore rules for fixture paths.** Only controls version update PRs, not security advisory alerts (which are the actual noise). Moot now that we're deleting the files.
- **`pnpm update --filter anatomia-cli` (CLI-only update).** Single lockfile means filtering creates a half-updated state that's harder to reason about. Some audit findings are from the website's dependency tree (picomatch 2.3.1 via eslint-config-next). Workspace-wide update is simpler and clears more noise.
- **`pnpm update --latest` (major version bumps).** glob 10→13 risks API breakage throughout the codebase. typescript 5→6 just released — too early for production CLI tooling. web-tree-sitter 0.25→0.26 could break WASM loading in the deep scanner. None are motivated by exploitable vulnerabilities in a CLI processing local files. Defer until specifically needed.
- **CI `pnpm audit` gate.** Over-engineering for a CLI with zero network attack surface. Quarterly manual `pnpm update` within semver is proportional to actual risk.
- **Splitting into three separate pipeline runs.** All changes are mechanical, non-overlapping, and small. Three pipeline runs for config-level work is overhead that doesn't serve verification.

## Open Questions

None — all resolved during scoping.

## Exploration Findings

### Patterns Discovered
- `work.ts:1202, 1283, 1762` — three `pull --rebase` call sites. Lines 1202 and 1283 are in `work complete` (initial pull and retry after untracked file cleanup). Line 1762 is in `work start`.
- `work.ts:1288-1299` — when non-conflict pull failure occurs in `work complete`, warns and continues without syncing. The branch silently falls behind.
- `work.ts:1762-1769` — when non-conflict pull failure occurs in `work start`, silently continues with zero output. Even less visible than `work complete`.
- Fixture files created in `a77c8b3` ("[STEP_1.1] CP1 - Complete parser implementation") with a `loadFixture()` consumer. During migration (`785a9eb`), files were moved but `loadFixture()` was deleted and `fixtures.ts` rewritten to only export `skipIfNoWasm()`. Files have been dead since April 2.
- `with-extras.txt` was added during the migration commit — fixture coverage that was never wired up.
- All parser tests use inline fixtures: `projectType.test.ts` writes `'flask==2.0.0'` to temp dirs, `python.test.ts` uses inline strings, `node-package.test.ts` uses inline JSON objects. This is the established codebase pattern.

### Constraints Discovered
- [TYPE-VERIFIED] glob 10.x pins `minimatch: '^9.0.4'` (npm registry) — 9.0.6+ (patched) resolves within range, confirmed via `npm view`
- [TYPE-VERIFIED] picomatch 4.0.4 (patched) exists within `^4.0.0` range (npm registry) — resolves via `pnpm update`
- [TYPE-VERIFIED] glob@10.5.0 is already latest 10.x (npm registry) — no glob update itself, only its transitive minimatch
- [VERIFIED-DEAD] `loadFixture()` deleted during migration. Zero references to fixture files across entire codebase. Confirmed via grep of all path patterns, import statements, and readFile calls.
- [OBSERVED] Single `pnpm-lock.yaml` at workspace root — both `packages/*` and `website` share one lockfile. No per-package lockfiles exist.

### Test Infrastructure
- `tests/engine/fixtures.ts` exports only `skipIfNoWasm()` — unrelated to the `fixtures/python/` and `fixtures/node/` directories despite the naming adjacency.
- `tests/engine/analyzers/patterns/fixtures/testProjects.ts` is a separate fixtures file for pattern analyzer tests — not affected by this scope.

## For AnaPlan

### Structural Analog
`work.ts` lines 1202-1300 — the `work complete` pull logic with its retry handling. The `--autostash` addition follows the same pattern at all three sites.

### Relevant Code Paths
- `packages/cli/src/commands/work.ts:1198-1301` — `work complete` pull + untracked file recovery
- `packages/cli/src/commands/work.ts:1759-1770` — `work start` pull
- `packages/cli/tests/engine/fixtures/python/requirements.txt/simple.txt` — dead file, delete
- `packages/cli/tests/engine/fixtures/python/requirements.txt/with-extras.txt` — dead file, delete
- `packages/cli/tests/engine/fixtures/node/package.json/simple.txt` — dead file, delete
- `packages/cli/templates/.claude/skills/testing-standards/SKILL.md` — where the fixture rule goes (Rules section, line 16)

### Patterns to Follow
- `--autostash` is a single flag addition to existing `['pull', '--rebase']` arrays — no control flow changes
- Testing-standards skill rules follow existing rule format in the SKILL.md template — concise, imperative, one sentence per rule
- The existing 5 rules are about universal test quality. The new rule is about test infrastructure. It fits but should go at the end to maintain the quality-first ordering.

### Known Gotchas
- The `pnpm update` must run at workspace root. Single lockfile covers all packages.
- Don't modify the `work complete` retry logic (lines 1204-1285) — it handles a different problem (untracked files from worktree agents). `--autostash` handles unstaged changes, which is orthogonal.
- After `pnpm update`, run `pnpm audit` to verify actual resolution count. If minimatch 3.1.2 persists via eslint, it's dev-only and acceptable.
- Verify `tests/engine/fixtures/` directory is fully empty after deleting the three files (it should be — `fixtures.ts` is a sibling file at `tests/engine/fixtures.ts`, not inside the directory). Remove the empty `fixtures/` directory tree.
- The `projectType.test.ts` file contains inline `'flask==2.0.0'` strings — these are inside `.ts` files and do NOT trigger GitHub security scanning. Leave them alone.

### Things to Investigate
None — all questions resolved during scoping.
