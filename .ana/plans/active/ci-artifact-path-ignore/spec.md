# Spec: CI path filtering for artifact-only commits

**Created by:** AnaPlan
**Date:** 2026-05-07
**Scope:** .ana/plans/active/ci-artifact-path-ignore/scope.md

## Approach

Add `paths-ignore` entries for `.ana/**` and `.claude/**` to both the `push` and `pull_request` triggers in `.github/workflows/test.yml`. This mirrors the pre-commit hook's existing path-based skip logic (`.husky/pre-commit` lines 12–18) at the CI layer. Commits that only modify pipeline artifacts and agent metadata skip CI entirely. Commits that include any source, config, or test file change trigger the full matrix as before.

GitHub Actions `paths-ignore` semantics: the workflow skips only when ALL changed files match the ignore patterns. A mixed commit (artifact + code) correctly triggers CI — no special handling needed.

**Known edge case — required status checks on `.ana/`+`.claude/`-only PRs:**
Branch protection on `main` requires 6 Test matrix checks. If `paths-ignore` skips the workflow, those checks never report, and the PR is blocked from merging. This cannot happen through the pipeline — `artifact.ts` enforces artifacts go to main (not feature branches), `proof.ts` pushes directly to main, and all PRs from feature branches contain code changes (confirmed across 91 PRs). The only scenario is a manually-created PR that edits only `.claude/agents/` or `.claude/skills/` files — unusual and solvable by including any source file change. Accepted risk; no mitigation needed.

Do NOT add `website/` to `paths-ignore`. The pre-commit hook skips website files because there are no local checks worth running. But `test.yml` has a dedicated `website:` job that should fire on website changes.

## Output Mockups

Before (current `test.yml` lines 3–7):
```yaml
on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]
```

After:
```yaml
on:
  push:
    branches: [main, staging]
    paths-ignore:
      - '.ana/**'
      - '.claude/**'
  pull_request:
    branches: [main, staging]
    paths-ignore:
      - '.ana/**'
      - '.claude/**'
```

## File Changes

### `.github/workflows/test.yml` (modify)
**What changes:** Add `paths-ignore` with `.ana/**` and `.claude/**` under both `push` and `pull_request` triggers.
**Pattern to follow:** `.husky/pre-commit` lines 12–18 — same path set (minus `website/`), same skip-when-all-match semantics.
**Why:** 56% of recent pushes to main are artifact-only commits. Each triggers 7 CI jobs against unchanged source code.

## Acceptance Criteria

- [ ] AC1: Pushing a commit that only modifies files under `.ana/` does not trigger the Test Suite workflow
- [ ] AC2: Pushing a commit that only modifies files under `.claude/` does not trigger the Test Suite workflow
- [ ] AC3: Pushing a commit that modifies any file outside `.ana/` and `.claude/` triggers the full Test Suite workflow as before
- [ ] AC4: Pull requests with code changes continue to trigger the full Test Suite workflow
- [ ] AC5: The `release.yml` workflow is unchanged (already scoped to `v*` tags)
- [ ] AC6: No other workflow files are created or modified
- [ ] AC7: The `website:` job is not affected — website-only changes still trigger it

## Testing Strategy

- **Unit tests:** None. This is a CI config change — no TypeScript code is modified.
- **Integration tests:** None applicable. CI config is verified by observing subsequent workflow behavior.
- **Validation:** After merge, push an artifact-only commit (e.g., `ana artifact save scope`) and confirm the Test Suite workflow does not trigger. Then push a code change and confirm it does.

## Dependencies

None. No code changes required.

## Constraints

- `release.yml` must not be modified — it is correctly scoped to `v*` tags already.
- No new workflow files. No `dorny/paths-filter`. No external actions.
- The 6 required status checks on `main` branch protection remain unchanged.

## Gotchas

- `paths-ignore` uses glob syntax. `.ana/**` matches recursively. `.ana/` alone would not.
- `paths-ignore` applies at the workflow level, not per-job. Both the `test` and `website` jobs skip together for `.ana/`-only commits. This is correct — there's no point running the website check for artifact changes either.
- `templates/.claude/` (actual source code for agent templates) is a different path from `.claude/` (project metadata). Changes to template source files are NOT skipped.
- The `staging` branch is referenced in both triggers but does not exist as a remote branch. No impact — it's a no-op trigger. Not in scope to clean up.

## Build Brief

### Rules That Apply
- This is a YAML-only change. No TypeScript, no imports, no tests.
- Do not modify `release.yml`.
- Do not add `website/` to paths-ignore.

### Pattern Extracts

Pre-commit hook skip logic (`.husky/pre-commit` lines 11–18) — the structural analog:
```bash
# Skip build/typecheck/lint for commits that only touch .ana/ or .claude/ files
# (proof chain updates, skill edits, agent definitions — no TypeScript to check)
STAGED_FILES=$(git diff --cached --name-only)
if [ -n "$STAGED_FILES" ]; then
  NON_ANA_FILES=$(echo "$STAGED_FILES" | grep -v '^\.ana/' | grep -v '^\.claude/' | grep -v '^website/' || true)
  if [ -z "$NON_ANA_FILES" ]; then
    exit 0
  fi
fi
```

Current test.yml trigger block (`.github/workflows/test.yml` lines 3–7):
```yaml
on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]
```

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands

- After modifying test.yml: `yamllint .github/workflows/test.yml` or manual YAML syntax check — Expected: valid YAML
- Lint: N/A (no TypeScript changes)
- Tests: N/A (no TypeScript changes)

### Build Baseline
- Current tests: 2009 passed, 2 skipped (95 test files)
- Command used: `cd packages/cli && pnpm vitest run`
- After build: no change to test counts (no code modified)
- Regression focus: none — no source files affected
