# Spec: Hygiene debt cleanup

**Created by:** AnaPlan
**Date:** 2026-05-12
**Scope:** .ana/plans/active/hygiene-debt-cleanup/scope.md

## Approach

Three independent mechanical fixes for accumulated hygiene debt. No feature logic, no control flow changes, no architectural decisions. Each fix is isolated — if any one broke (it won't), the others are unaffected.

1. **`--autostash` on all `pull --rebase` calls.** Three call sites in `work.ts`. Add `'--autostash'` to each args array. No other changes to pull logic, retry handling, or error messaging.

2. **Delete dead fixture files and their parent directories.** Three files across two directory trees under `tests/engine/fixtures/`. The `loadFixture()` consumer was deleted in commit `785a9eb`. No test references these files — confirmed by scope's grep across all path patterns, imports, and readFile calls. After deletion, `tests/engine/fixtures/` directory tree is empty (the adjacent `fixtures.ts` is a sibling file at `tests/engine/fixtures.ts`, not inside the directory). Remove the entire `fixtures/` directory tree.

3. **`pnpm update` at workspace root.** Picks up patch-level transitive updates within existing semver ranges. Target: minimatch 9.0.5→9.0.6+ (via glob's `^9.0.4`), picomatch 4.0.3→4.0.4 (within `^4.0.0`). Dev-only transitives (postcss, rollup, flatted) also have patches. Single lockfile at workspace root covers both CLI and website.

Also: commit the existing `.gitignore` change (`.mcp.json` entry already present in working tree) and add one rule to the testing-standards skill template.

## Output Mockups

No user-facing output changes. The `--autostash` flag is invisible to users when pulls succeed (the common case). When stash/pop conflicts occur, git's native conflict messaging appears — no custom formatting needed.

## File Changes

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** Add `'--autostash'` to the args array of all three `pull --rebase` calls. Line 1206: `['pull', '--rebase']` → `['pull', '--rebase', '--autostash']`. Line 1287: same. Line 1796: same.
**Pattern to follow:** The existing args arrays — just append one string element.
**Why:** Without this, dirty working trees cause silent pull skips. The local branch falls behind remote, compounding across work items.

### `packages/cli/tests/engine/fixtures/python/requirements.txt/simple.txt` (delete)
### `packages/cli/tests/engine/fixtures/python/requirements.txt/with-extras.txt` (delete)
### `packages/cli/tests/engine/fixtures/node/package.json/simple.txt` (delete)
**What changes:** Delete these three files and remove their now-empty parent directories up to and including `tests/engine/fixtures/`.
**Why:** Dead code since `785a9eb`. Real package names in these files trigger GitHub security advisory alerts — false positives that create noise.

### `packages/cli/templates/.claude/skills/testing-standards/SKILL.md` (modify)
**What changes:** Add one rule at the end of the `## Rules` section (after the existing 5th rule about never weakening tests).
**Pattern to follow:** Existing rules — imperative, one sentence, explains the why.
**New rule text:** `- Use inline fixture data for scanner and parser tests — write files to temp directories at test time. Standalone manifest files with real package names (requirements.txt, package.json) trigger GitHub security advisory false positives.`
**Why:** Encodes the codebase's existing pattern so future agents don't recreate the problem.

### `.gitignore` (modify — commit existing change)
**What changes:** The file already has the `.mcp.json` entry in the working tree. Just commit it.
**Why:** `.mcp.json` contains local paths — project convention is to gitignore it.

### `pnpm-lock.yaml` (modify)
**What changes:** Updated by `pnpm update` at workspace root.
**Why:** Resolves transitive dependency vulnerabilities within semver ranges.

## Acceptance Criteria

- [ ] AC1: All three `git pull --rebase` calls in work.ts include `--autostash`
- [ ] AC2: Dead fixture files deleted — `tests/engine/fixtures/python/` and `tests/engine/fixtures/node/` directories removed, along with parent `tests/engine/fixtures/` directory
- [ ] AC3: All existing tests pass (`pnpm vitest run` in packages/cli) — confirms fixtures were truly unreferenced
- [ ] AC4: `pnpm update` (no `--latest`) has been run at workspace root and lockfile updated
- [ ] AC5: `pnpm audit` reports fewer findings than the current 20 (target: 0, acceptable: ≤3 dev-only)
- [ ] AC6: Testing-standards skill template includes a rule about using inline fixture data (not standalone manifest files) for scanner tests
- [ ] AC7: `.gitignore` includes the `.mcp.json` entry (committed, not just local)
- [ ] AC8: `pnpm run build` succeeds — confirms no type or compilation regressions from dependency updates

## Testing Strategy

- **Unit tests:** No new tests required. This is mechanical cleanup — no new behavior to test. All existing tests must continue passing (2177 passing, 2 skipped, 100 test files).
- **Integration tests:** Not applicable.
- **Edge cases:** The `--autostash` change is tested by running `pnpm vitest run` — existing work.ts tests exercise the pull code paths. Fixture deletion is verified by the test suite passing (if any test referenced the files, it would fail).
- **Audit verification:** Run `pnpm audit` after `pnpm update` and record the finding count.

## Dependencies

None. All changes are against existing files with no prerequisite work.

## Constraints

- `pnpm update` must NOT use `--latest`. Stay within existing semver ranges only.
- Do not modify the `work complete` retry logic (lines 1208-1289) — `--autostash` handles unstaged changes, the retry logic handles untracked files from worktree agents. These are orthogonal problems.
- Do not modify inline fixture strings in `.ts` test files (e.g., `'flask==2.0.0'` in `projectType.test.ts`). These are inside TypeScript source and do NOT trigger GitHub security scanning.

## Gotchas

- The `tests/engine/fixtures/` directory is NOT the same as `tests/engine/fixtures.ts`. The directory contains only the dead fixture files. The `.ts` file exports `skipIfNoWasm()` — completely unrelated. Delete the directory, leave the file.
- After deleting fixture files, `git rm -r` handles directory cleanup. Don't try to manually `rmdir` empty directories.
- `pnpm update` operates on the workspace root lockfile. Do NOT `cd packages/cli` first — run at repo root.
- If `pnpm audit` still shows findings after update, check if they're dev-only (postcss via vite, rollup via vitest). Dev-only findings under 3 are acceptable per AC5.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Test count must not decrease (current: 2177 passing, 2 skipped, 100 files).
- Prefer early returns over nested conditionals.
- Co-author trailer: `Ana <build@anatomia.dev>`

### Pattern Extracts

The three `pull --rebase` call sites (from `packages/cli/src/commands/work.ts`):

```typescript
// Line 1206 — work complete, initial pull
let pullResult = runGit(['pull', '--rebase'], { cwd: projectRoot });

// Line 1287 — work complete, retry after untracked file cleanup
pullResult = runGit(['pull', '--rebase'], { cwd: projectRoot });

// Line 1796 — work start, pull latest
const pullResult = runGit(['pull', '--rebase'], { cwd: projectRoot });
```

Each becomes `['pull', '--rebase', '--autostash']`.

Testing-standards rule format (from `packages/cli/templates/.claude/skills/testing-standards/SKILL.md`):

```markdown
## Rules
- Test behavior, not implementation. Assert on what the code returns or produces — not which internal functions it calls. Tests should survive refactoring when behavior is unchanged.
- Prefer real implementations over mocks. Mock only what you can't control: network calls, time, randomness. Every mock is a lie about how the system actually behaves.
```

New rule follows same format — imperative, one sentence with rationale after the em dash.

### Proof Context

**`packages/cli/src/commands/work.ts`** — 12 active findings, none related to pull --rebase logic. Most relevant:
- "Untested defensive branches in startWork — 'not a git repo' and 'git pull conflict' paths have no dedicated unit tests" — informational only, not in scope.
- "Layer 3 planning artifact content-match reads file without try-catch" — adjacent code (lines 1258-1264), not affected by `--autostash` addition.

**`packages/cli/templates/.claude/skills/testing-standards/SKILL.md`** — No active proof findings.

### Checkpoint Commands

- After `--autostash` changes: `grep -n 'autostash' packages/cli/src/commands/work.ts` — Expected: 3 matches at lines ~1206, ~1287, ~1796
- After fixture deletion: `ls packages/cli/tests/engine/fixtures/ 2>&1` — Expected: "No such file or directory"
- After all code changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2177 tests pass, 100 test files
- After pnpm update: `pnpm audit` — Expected: fewer than 20 findings
- Final: `pnpm run build` — Expected: success

### Build Baseline
- Current tests: 2177 passed, 2 skipped (2179 total)
- Current test files: 100
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: same — 2177 passed, 100 files (no new tests expected)
- Current audit findings: 20 (8 moderate, 12 high)
- Regression focus: `packages/cli/tests/engine/` (fixture deletion), `packages/cli/tests/commands/work/` (pull behavior)
