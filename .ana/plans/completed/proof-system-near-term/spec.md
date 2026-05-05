# Spec: Proof System Near-Term

**Created by:** AnaPlan
**Date:** 2026-05-05
**Scope:** .ana/plans/active/proof-system-near-term/scope.md

## Approach

Six code changes that fix verified infrastructure problems in the proof commands, plus one template edit to document the new tools. All changes follow existing patterns already in the codebase — no new abstractions, no new dependencies.

The guiding principle is "the elegant solution is the one that removes." Four copy-pasted finding-search loops become one function. Four copy-pasted commit+push blocks become one function. Four copy-pasted pull blocks become one function. The push retry logic lives in the shared function, so it's written once and all four subcommands inherit it.

### Key design decisions

**Three shared helpers, not one.** The scope identifies `findFindingById` as the extraction target — but the commit+push duplication is the bigger problem because that's where the push retry lives. Extract three helpers:

1. `findFindingById(chain, id)` in proofSummary.ts — shared across modules, exported. Returns `{ finding, entry } | null`.
2. `pullBeforeRead(proofRoot)` local to proof.ts — the pre-read pull block that all 4 subcommands duplicate.
3. `commitAndPushProofChanges(options)` local to proof.ts — commit via spawnSync + push via runGit + retry-after-pull on push failure.

**Push retry: one retry, abort on conflict.** When push fails: pull --rebase, then retry push. If pull --rebase has a merge conflict, run `git rebase --abort` and warn. If the retried push also fails, warn. In both failure cases the commit is already local — data is safe. Error messages distinguish commit failure ("Changes NOT saved") from push failure ("Committed locally. Push failed after retry — run `git push`").

**`computeChainHealth` severity/action: in-place fix.** The old counts were wrong — they counted all findings regardless of status. The fix adds the same active-only filter that `getProofContext` uses at proofSummary.ts:1870. No new field, no backward compat shim. The counts were wrong, now they're right.

**Audit filters: post-collection filtering.** Add `--severity <values>` and `--entry <slug>` options to the audit Commander subcommand. After collecting all active findings into the `activeFindings` array, filter it before grouping. This keeps the existing grouping/sorting/truncation logic untouched.

**Pre-commit: staged-file check.** Use `git diff --cached --name-only` to get staged file paths. If every path starts with `.ana/`, exit 0 to skip checks. Mixed commits run full checks.

### Open question resolutions

- **`by_severity` in-place vs new field:** In-place. The counts were wrong. Nobody depends on wrong values being wrong in a specific way.
- **Retry pull on network failure:** No. Pull already degrades gracefully (warns and continues with local data). The next command pulls again anyway.

## Output Mockups

### Push failure after retry
```
✓ Closed F001 — Duplicate of promoted rule
  Committed locally. Push failed after retry — run `git push`
```

### Commit failure
```
Error: Failed to commit. Changes NOT saved to git.
```

### Audit with severity filter
```
$ ana proof audit --severity risk,debt

Proof Audit: 12 active findings (12 actionable, 0 monitoring) across 5 files
  risk: 3 · debt: 9

  src/commands/proof.ts (4)
    [risk]  F001  Missing validation on ...
    [debt]  F003  Duplicated loop ...
    ...
```

### Audit with entry filter
```
$ ana proof audit --entry proof-intelligence-hardening

Proof Audit: 6 active findings (4 actionable, 2 monitoring) across 3 files
  ...
```

### Learn template Reference/Commands section (replace existing)
```markdown
**Commands:**
- `ana proof health --json` — proof chain overview (trajectory, hot modules, candidates)
- `ana proof audit --json` — active findings list (truncated to 3 per file group)
- `ana proof audit --json --full` — all active findings without truncation
- `ana proof audit --severity risk,debt` — filter by severity (comma-separated)
- `ana proof audit --entry {slug}` — filter to findings from a specific pipeline run
- `ana proof context {files...}` — findings and build concerns for specific files, active only by default
- `ana proof stale` — findings whose referenced files were modified by subsequent pipeline runs. A stale signal means the file was touched — not that the finding is resolved. Always verify before closing.
- `ana proof stale --json` — structured staleness output
- `ana proof lesson C1 C2 --reason "{reason}"` — record as institutional lesson: verified, real, but not actionable now
- `ana proof close C1 C2 C3 --reason "{reason}"` — close findings (variadic)
- `ana proof promote C1 C2 --skill {name} --text "{rule}"` — promote to skill rule (variadic)
- `ana proof strengthen C1 C2 --skill {name} --reason "{reason}"` — commit skill edit + mark promoted (variadic)
- `ana work status` — pipeline state check

**When to use which:**
- **Session start:** `--severity risk,debt` to identify deep review targets
- **Lesson candidates:** `--severity observation` for findings that are real but not actionable
- **Post-ship review:** `--entry {slug}` after a scope ships to see its findings in isolation
- **Full picture:** `--full` when the truncated top 3 per file isn't enough
- **File-focused triage:** `context {files}` when working on specific modules
- **Stale candidates:** `stale` for findings that COULD be resolved — always verify with a code read before closing
```

## File Changes

### `packages/cli/src/utils/proofSummary.ts` (modify)
**What changes:** Add `findFindingById` function. Fix `computeChainHealth` severity/action counts to filter active-only.
**Pattern to follow:** The active-only filter at proofSummary.ts:1870: `if (!options?.includeAll && finding.status && finding.status !== 'active') continue`. Apply the same condition in `computeChainHealth` before the severity and action switch blocks.
**Why:** `findFindingById` eliminates 10+ inline search loops in proof.ts. The severity fix makes health counts match audit counts — currently they disagree.

### `packages/cli/src/commands/proof.ts` (modify)
**What changes:** Extract `pullBeforeRead` and `commitAndPushProofChanges` as file-local helpers. Replace all 4 pull blocks and all 4 commit+push blocks with calls to these helpers. Replace all inline finding-search loops with calls to `findFindingById`. Add `--severity` and `--entry` options to the audit subcommand.
**Pattern to follow:** `createExitError` factory at proof.ts:65 — same "extract shared behavior into a local helper" pattern. For audit options, follow the existing `--json` and `--full` option pattern on the audit Command.
**Why:** Without extraction, the push retry logic would be copy-pasted into 4 blocks. Without `findFindingById`, the search loop remains duplicated 10+ times.

### `.husky/pre-commit` (modify)
**What changes:** Add a staged-file check before the build/typecheck/lint commands. If all staged files are under `.ana/`, exit 0.
**Pattern to follow:** Standard git hook pattern using `git diff --cached --name-only`.
**Why:** Saves ~30s on every proof close/lesson/promote/strengthen commit. These commits only touch `.ana/proof_chain.json` and `.ana/PROOF_CHAIN.md` — running build + typecheck + lint on them is provably redundant.

### `packages/cli/tests/utils/proofSummary.test.ts` (modify)
**What changes:** Add tests for `findFindingById`. Update `computeChainHealth` tests to verify active-only severity/action counting.
**Pattern to follow:** Existing `computeChainHealth` test structure at proofSummary.test.ts:1967 — plain chain objects, direct assertions on return values.
**Why:** New exported function needs unit tests. Existing tests assert on the old (wrong) counts and need updating.

### `packages/cli/tests/commands/proof.test.ts` (modify)
**What changes:** Add tests for push retry behavior (push fails → pull → retry succeeds). Add tests for audit `--severity` and `--entry` filters.
**Pattern to follow:** Existing `createCloseTestProject` helper and `runProof` helper. Tests use real git repos in temp directories, not mocks.
**Why:** Push retry and audit filters are new behavior that needs coverage.

### `packages/cli/templates/.claude/agents/ana-learn.md` (modify)
**What changes:** Replace the Reference/Commands section (lines 489–498) with the expanded version from the Output Mockups section above. Adds lesson, context, audit filters, a "when to use which" guide, and repositions the stale description as "could be resolved" rather than a conclusion.
**Pattern to follow:** Existing command list format in the same section.
**Why:** Learn doesn't know about `lesson`, `context`, or audit filters. Without the when-to-use guide, Learn guesses which filter to apply.

### `.claude/agents/ana-learn.md` (modify)
**What changes:** Same edit — sync the dogfood copy's Reference/Commands section.
**Pattern to follow:** Identical content to the template.
**Why:** The dogfood copy is what Learn reads in this project.

## Acceptance Criteria

- [ ] AC1: When `ana proof close` push fails, the command pulls and retries once before warning. Error message distinguishes commit failure ("Changes NOT saved") from push failure ("Committed locally. Push failed after retry — run `git push`")
- [ ] AC2: Same retry-then-warn pattern for lesson, promote, and strengthen
- [ ] AC3: `git commit` on a change that only touches `.ana/` files skips the pre-commit build/typecheck/lint checks
- [ ] AC4: `git commit` on a change that touches both `.ana/` and `packages/cli/src/` files runs all pre-commit checks normally
- [ ] AC5: `computeChainHealth` `by_severity` and `by_action` count only active findings (status === 'active')
- [ ] AC6: `ana proof health --json` severity/action counts match `ana proof audit --json` counts (they're both active-only now)
- [ ] AC7: A shared `findFindingById(chain, id)` function exists in proofSummary.ts and is used by close, lesson, promote, and strengthen
- [ ] AC8: Zero inline finding-search loops remain in proof.ts (all use the shared function)
- [ ] AC9: `ana proof audit --severity risk,debt` returns only findings with those severities
- [ ] AC10: `ana proof audit --entry proof-intelligence-hardening` returns only findings from that entry
- [ ] AC11: Both filters work with `--json` and `--full`
- [ ] AC12: Learn template Reference section includes `ana proof lesson` with description
- [ ] AC13: Learn template Reference section includes `ana proof context {files...}` with description
- [ ] AC14: Learn template Reference section includes audit filter usage: `--severity`, `--entry`
- [ ] AC15: Learn template Reference section includes a "when to use which" guide
- [ ] AC16: Learn template positions stale findings as "could be stale" — candidates for investigation, not conclusions
- [ ] AC17: All existing tests pass

## Testing Strategy

- **Unit tests (proofSummary.test.ts):**
  - `findFindingById`: found by id returns `{ finding, entry }`, not found returns null, finding in second entry returns correct entry, respects all statuses (doesn't skip closed/promoted — the caller decides what to do with status)
  - `computeChainHealth`: chain with mixed statuses returns severity/action counts for active-only. Update the existing test at line 2057 that asserts `by_severity.risk` = 1 / `by_severity.debt` = 1 for a chain with 1 active-risk + 1 closed-debt + 1 lesson-observation — after the fix, `by_severity` should be `{ risk: 1, debt: 0, observation: 0, unclassified: 0 }` because only the active finding counts.

- **Integration tests (proof.test.ts):**
  - Push retry: create a test project with a remote (use `git clone --bare` to make a local remote). Push to it, then create a conflicting commit on the remote. Run proof close — verify the push retries and succeeds after pull. This requires a local bare remote, which the existing test infrastructure supports (it uses real git repos).
  - Audit `--severity`: create chain with mixed severities, run `ana proof audit --severity risk,debt --json`, verify only risk/debt findings in output.
  - Audit `--entry`: create chain with multiple entries, run `ana proof audit --entry {slug} --json`, verify only findings from that entry.
  - Audit combined filters: `--severity risk --entry {slug}` returns the intersection.

- **Edge cases:**
  - Audit `--severity unclassified` returns findings without a severity field
  - Audit `--entry nonexistent` returns zero findings (not an error)
  - `findFindingById` with finding that has no status field (treated as active by callers)
  - Pre-commit with only `.ana/` files staged: verify no build/typecheck/lint runs
  - Pre-commit with mixed `.ana/` + source files: verify full checks run

## Dependencies

None. All changes use existing infrastructure.

## Constraints

- Push retry must retry exactly once, not loop.
- `findFindingById` must return both finding and entry — callers need entry for slug, feature name in output formatting.
- Pre-commit path filter must handle the `.` prefix on `.ana/` correctly in grep.
- Audit `--severity` values are comma-separated, parsed at the command level. No partial matching on entry slugs.
- All 1866 existing tests must continue to pass.

## Gotchas

- **spawnSync for commit vs runGit for push.** The current code uses `spawnSync('git', ['commit', ...])` for commits and `runGit(['push'])` for pushes. The `commitAndPushProofChanges` helper must use both — `spawnSync` for commit (it needs `stdio: 'pipe'` to capture stderr for error messages) and `runGit` for push (returns `{ exitCode, stderr }`). Don't standardize on one — they serve different purposes.
- **Push retry on rebase conflict.** If `pull --rebase` produces a merge conflict on `proof_chain.json`, the helper must run `git rebase --abort` to clean up before warning. Leaving a dirty rebase state would break the user's working directory.
- **Existing `computeChainHealth` tests will break.** The test at proofSummary.test.ts:2057 asserts `by_severity.risk` = 1 for a chain that has 1 active-risk + 1 closed-debt + 1 lesson-observation. After the fix, `by_severity.debt` and `by_severity.observation` must become 0 since those findings aren't active. Update those test assertions to match the new correct behavior.
- **Audit filter placement.** The `--severity` and `--entry` filters must be applied AFTER collecting activeFindings and BEFORE grouping by file. Filtering after grouping would leave empty file groups in the output.
- **Pre-commit `set -e`.** The hook has `set -e` at line 9. The `git diff --cached --name-only` command exits 0 normally, so it's safe after `set -e`. The path check should use `grep -qv '^\.ana/'` — if grep finds any non-`.ana/` file, continue to checks. If grep finds nothing (all `.ana/`), exit 0.
- **Promote/strengthen finding-search doesn't capture entry.** The current promote and strengthen code only captures `foundFinding`, not `foundEntry`. When replacing with `findFindingById`, the entry is now available — but these subcommands don't currently use it in their output. Don't add entry fields to promote/strengthen output — just use `findFindingById` and ignore the entry where it's not needed. The error-path lookups (for "already promoted" messages) currently do their own inline search — those get replaced too.
- **Template path is `packages/cli/templates/`, not top-level `templates/`.** There is no top-level templates directory.
- **Dogfood copy is `.claude/agents/ana-learn.md` at the repo root.** Both files must have identical Reference/Commands sections after the edit.
- **Don't touch the Staleness Detection section** (lines 165-180 of the template). It already says "staleness is a signal, not proof of resolution" — that's correct. The stale repositioning (AC16) only applies to the Reference/Commands section.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { findFindingById } from '../utils/proofSummary.js'`
- Use `import type` for type-only imports, separate from value imports
- Explicit return types on all exported functions — `findFindingById` needs a declared return type
- Exported functions require `@param` and `@returns` JSDoc tags
- Early returns over nested conditionals
- Always pass `--run` with pnpm vitest to avoid watch mode hang

### Pattern Extracts

**Active-only filter (proofSummary.ts:1870) — apply same pattern in computeChainHealth:**
```typescript
        if (!options?.includeAll && finding.status && finding.status !== 'active') continue;
```

**Finding search loop (proof.ts:706-720) — the pattern to extract into findFindingById:**
```typescript
      for (const id of ids) {
        // Find the finding across all entries
        let foundFinding: ProofChainEntry['findings'][0] | null = null;
        let foundEntry: ProofChainEntry | null = null;

        for (const entry of chain.entries) {
          for (const finding of entry.findings || []) {
            if (finding.id === id) {
              foundFinding = finding;
              foundEntry = entry;
              break;
            }
          }
          if (foundFinding) break;
        }
```

**Commit+push block (proof.ts:824-842) — the pattern to extract into commitAndPushProofChanges:**
```typescript
      // Git: stage, commit, push — one commit for the batch
      const coAuthor = readCoAuthor(proofRoot);
      try {
        runGit(['add', '.ana/proof_chain.json', '.ana/PROOF_CHAIN.md'], { cwd: proofRoot });
        const idList = closed.length <= 3
          ? closed.map(c => c.id).join(', ')
          : `${closed.slice(0, 2).map(c => c.id).join(', ')}, ... (${closed.length} total)`;
        const commitMessage = `[proof] Close ${idList}: ${options.reason}\n\nCo-authored-by: ${coAuthor}`;
        const commitResult = spawnSync('git', ['commit', '-m', commitMessage], { stdio: 'pipe', cwd: proofRoot });
        if (commitResult.status !== 0) throw new Error(commitResult.stderr?.toString() || 'Commit failed');
      } catch {
        console.error(chalk.red('Error: Failed to commit. Changes saved to proof_chain.json but not committed.'));
        process.exit(1);
      }

      const closePushResult = runGit(['push'], { cwd: proofRoot });
      if (closePushResult.exitCode !== 0) {
        console.error(chalk.yellow('Warning: Push failed. Changes committed locally. Run `git push` manually.'));
      }
```

**Audit option pattern (proof.ts:1861-1865) — extend with new options:**
```typescript
  const auditCommand = new Command('audit')
    .description('List active findings grouped by file')
    .option('--json', 'Output JSON format')
    .option('--full', 'Return all findings without truncation (requires --json)')
    .action(async (options: { json?: boolean; full?: boolean }) => {
```

### Proof Context
- `proof.ts`: "Lesson command duplicates close's finding-search loop pattern — 4 identical loops across lesson, close, promote, strengthen" — this spec directly addresses it.
- `proof.ts`: "Lesson command catch block at proof.ts:1141 loses error detail" — the `commitAndPushProofChanges` extraction replaces this catch block. Preserve the error detail in the new helper (include stderr in the error message).
- `proofSummary.ts`: "proofSummary.ts ~1550 lines — past comfort threshold" — this spec adds ~20 lines (findFindingById). Not materially worse.

### Checkpoint Commands

- After `findFindingById` + `computeChainHealth` fix: `cd packages/cli && pnpm vitest run tests/utils/proofSummary.test.ts --run` — Expected: proofSummary tests pass (update assertions for active-only counts first)
- After proof.ts extraction + audit filters: `cd packages/cli && pnpm vitest run tests/commands/proof.test.ts --run` — Expected: proof tests pass
- After all changes: `cd packages/cli && pnpm vitest run` — Expected: 1866+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 1866 passed, 2 skipped (94 test files)
- Command used: `cd packages/cli && pnpm vitest run`
- After build: expected ~1885+ tests (new tests for findFindingById, push retry, audit filters, pre-commit)
- Regression focus: `tests/commands/proof.test.ts` (all close/lesson/promote/strengthen tests), `tests/utils/proofSummary.test.ts` (computeChainHealth tests)
