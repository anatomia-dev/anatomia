# Scope: Gitignore disclosure at init time, commit hardening, and docs

**Created by:** Ana
**Date:** 2026-05-29

## Intent

The force-add fix shipped (PR #226). It solves the mechanical problem — gitignored infrastructure files now get committed. But there are three gaps:

1. **No disclosure before the override.** The user runs `ana init`, spends 10 minutes on setup, then `ana init commit` overrides their gitignore without prior warning. The disclosure comes at commit time, after the investment. It should come at init time, before they start.

2. **Subsequent commits rely on accidental git behavior.** After the initial force-add, modified infrastructure files show in `git status` (they're tracked). But `git add <specific-path>` on a tracked-but-gitignored file prints a warning, exits code 1, and still stages — by accident, not by design. The current `discoverGitignoredFiles` only catches the first-time case (files not yet tracked). On subsequent `ana init commit` calls, the normal `git add` path fires and relies on this accidental staging. If git's behavior changes, subsequent commits silently break.

3. **No documentation.** No troubleshooting entry for "Unknown skill" errors. No mention in the setup guide about gitignore interactions. Teams who hit this before upgrading have no guidance.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — 3 files changed, no new functions, extends existing patterns
- **Surface:** cross-surface
- **Files affected:**
  - `packages/cli/src/commands/init/index.ts` — pass gitignore warning to displaySuccessMessage
  - `packages/cli/src/commands/init/commit.ts` — harden the dirty-file staging to use `-f` for gitignored tracked files
  - `website/content/docs/guides/troubleshooting.mdx` — new section for gitignore-related pipeline issues
  - `packages/cli/tests/commands/init/commit.test.ts` — test for the subsequent-commit hardening
- **Blast radius:** Low. Init output gains one conditional warning line. Commit staging becomes more defensive. Docs gain a section. No behavior changes for repos without gitignore conflicts.
- **Estimated effort:** 2-3 hours
- **Multi-phase:** no

## Approach

Three additions, each independent:

**Disclosure:** After `createClaudeConfiguration` in the init orchestrator, check whether any infrastructure files under `.claude/` are gitignored (reuse the detection from `discoverGitignoredFiles` or a lightweight `git check-ignore` call). If any are, add a warning to the `warnings` array that flows to `displaySuccessMessage`. The warning appears in the "Pipeline readiness" section of init output, alongside existing warnings like branch mismatch. The user sees it before running setup and before running init commit.

**Hardening:** In commit.ts, after `discoverDirtyFiles` returns, check whether any files in the dirty set are also gitignored (they'd be tracked-but-gitignored from a previous force-add). For those files, move them from the normal `git add` call to the `git add -f` call. This eliminates the dependency on git's accidental exit-1-but-still-stages behavior.

**Docs:** Add a section to `website/content/docs/guides/troubleshooting.mdx` covering: symptom ("Unknown skill: git-workflow" or "skills missing in pipeline"), cause (host repo gitignores `.claude/skills/`), diagnosis (`git ls-files .claude/skills/`), fix (upgrade to latest Anatomia which handles this automatically), and the `--respect-gitignore` flag for teams that deliberately want the old behavior.

## Acceptance Criteria
- AC1: When `ana init` detects gitignored infrastructure files under `.claude/`, the success output includes a warning in the Pipeline readiness section explaining that `ana init commit` will force-add them.
- AC2: The warning explains WHY the force-add is necessary (worktree compatibility for Build and Verify agents).
- AC3: When no `.claude/` files are gitignored, no warning appears (existing behavior unchanged).
- AC4: On subsequent `ana init commit` calls where tracked infrastructure files are gitignored, those files are staged with `git add -f` instead of the normal `git add`.
- AC5: The troubleshooting docs page has a section covering gitignore-related skill/agent issues with symptom, cause, diagnosis, and fix.
- AC6: All existing tests continue to pass.

## Edge Cases & Risks

- **Init runs outside a git repo.** `git check-ignore` fails. The warning should be skipped silently — same as how branch detection handles non-git contexts.
- **Init runs with no `.claude/` files created yet.** The check runs after `createClaudeConfiguration`, so files exist on disk by then. But if init fails before that step, no check runs. That's fine — no files to warn about.
- **Dirty files that are also gitignored.** A file modified after a previous force-add is both in `discoverDirtyFiles` (tracked, modified) AND gitignored. The hardening moves it to the force-add path. The file should NOT appear in both `git add` calls — deduplicate.
- **Performance.** One extra `git check-ignore --stdin` call during init. Bounded by the number of infrastructure files (~20 max). Negligible.

## Rejected Approaches

### Interactive consent at init commit
Rejected in the previous scope — init commit runs in scripts and agents. An interactive prompt breaks automation. Disclosure at init time + force-add with opt-out at commit time is the right balance.

### Asking teams to modify their .gitignore
Considered telling teams to add negation patterns (`!.claude/skills/coding-standards/`). Rejected because negation doesn't work when the parent directory is ignored (`.claude/skills/` — git's documented limitation). Only works with wildcard patterns (`.claude/skills/*`) which we can't control.

### Separate docs page
The troubleshooting content fits as a section in the existing `troubleshooting.mdx` guide rather than a standalone page. It's one issue with one diagnosis and one fix — doesn't warrant its own page.

## Open Questions

None. All design questions resolved during investigation.

## Exploration Findings

### Patterns Discovered
- `state.ts:1032-1043`: `displaySuccessMessage` has a "Pipeline readiness" section that renders warnings passed from preflight. This is the exact mechanism for the init-time disclosure — add gitignore warnings to the `warnings` array.
- `commit.ts:417-418`: `discoverDirtyFiles` returns the dirty set. `discoverGitignoredFiles` checks for undiscovered-but-on-disk files. Neither handles the case where a dirty file is ALSO gitignored (tracked from a previous force-add).
- `git add <specific-gitignored-tracked-path>` exits 1 but still stages. `git add -A` and `git add .` stage without error. `git add -f <path>` stages without error. The hardening uses `-f`.

### Constraints Discovered
- [TYPE-VERIFIED] Git behavior: `git add <tracked-but-gitignored-file>` exits 1, prints warning, but stages. Accidental — not documented as guaranteed. (tested in /tmp)
- [TYPE-VERIFIED] Git negation: `!path` negation fails when parent directory is ignored. Only works with wildcard (`dir/*` not `dir/`). Git documentation confirms.
- [OBSERVED] `warnings` array flows from preflight → init orchestrator → `displaySuccessMessage`. Adding warnings to this array is the supported extension point.
- [OBSERVED] `discoverGitignoredFiles` is already exported and available for reuse in the init orchestrator.

### Test Infrastructure
- `commit.test.ts`: Existing test infrastructure from the force-add scope. Real git repos in temp dirs, `.gitignore` creation, `runInitCommit()` helper. The subsequent-commit test needs: create file, force-add, commit, modify file, run init commit again, verify file is staged with `-f`.

## For AnaPlan

### Structural Analog
`packages/cli/src/commands/init/index.ts` lines 130-136 — the existing warning pass-through from preflight to displaySuccessMessage. The gitignore detection adds warnings to the same array using the same pattern.

### Relevant Code Paths
- `packages/cli/src/commands/init/index.ts` — init orchestrator, where the gitignore check runs after createClaudeConfiguration
- `packages/cli/src/commands/init/state.ts:1032-1043` — displaySuccessMessage's Pipeline readiness rendering
- `packages/cli/src/commands/init/commit.ts:417-463` — the dirty file discovery and staging logic that needs hardening
- `packages/cli/src/commands/init/commit.ts:184-271` — discoverGitignoredFiles, reusable for the init-time check
- `website/content/docs/guides/troubleshooting.mdx` — existing troubleshooting page to extend

### Patterns to Follow
- Warning format in displaySuccessMessage: `⚠ {first line}` in yellow, subsequent lines in gray. Multi-line warnings supported.
- Docs MDX follows the existing sections in troubleshooting.mdx — symptom heading, explanation, fix steps.

### Known Gotchas
- `discoverGitignoredFiles` requires a `dirtyFiles` parameter. At init time, we haven't run `discoverDirtyFiles` yet (that's commit-time). For the init-time check, pass an empty array — we're just checking whether any `.claude/` files WOULD be gitignored, not deduplicating against a dirty set.
- The init orchestrator imports from `commit.ts` (already imports `registerInitCommitCommand`). Adding `discoverGitignoredFiles` to the import is straightforward.
- The docs page uses MDX. Check the existing sections for heading level, code block style, and whether there's a frontmatter schema to follow.

### Things to Investigate
- Whether the hardening should check ALL dirty files against `git check-ignore` or only dirty files under `.claude/`. Checking all is simpler but includes `.ana/` files which are unlikely to be gitignored. Checking only `.claude/` is more targeted. Planner's judgment call.
