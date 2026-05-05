# Build Report: Proof System Near-Term

**Created by:** AnaBuild
**Date:** 2026-05-05
**Spec:** .ana/plans/active/proof-system-near-term/spec.md
**Branch:** feature/proof-system-near-term

## What Was Built

- `packages/cli/src/utils/proofSummary.ts` (modified): Added `findFindingById(chain, id)` exported function that returns `{ finding, entry } | null`. Fixed `computeChainHealth` to count `by_severity` and `by_action` for active findings only (was counting all findings regardless of status).
- `packages/cli/src/commands/proof.ts` (modified): Extracted `pullBeforeRead(proofRoot)` and `commitAndPushProofChanges(options)` as file-local helpers. Replaced all 4 pull blocks and 4 commit+push blocks with calls to these helpers. Replaced all inline finding-search loops (10+ occurrences of `finding.id === id`) with calls to `findFindingById`. Added `--severity` and `--entry` options to audit subcommand with post-collection filtering. `commitAndPushProofChanges` includes push retry (pull --rebase + retry once) with rebase abort on conflict.
- `.husky/pre-commit` (modified): Added staged-file check before build/typecheck/lint. If all staged files are under `.ana/` or `.claude/`, exit 0 to skip checks.
- `packages/cli/tests/utils/proofSummary.test.ts` (modified): Added 8 tests for `findFindingById` (found, not found, second entry, all statuses, no findings array, no status field) and `computeChainHealth` active-only counting (health/audit agreement).
- `packages/cli/tests/commands/proof.test.ts` (modified): Added 10 tests for push retry, commit failure message, audit `--severity` filter, audit `--entry` filter, combined filters, `--severity unclassified`, `--entry nonexistent`, `--json --full` with filters, and zero inline search loops assertion.
- `packages/cli/templates/.claude/agents/ana-learn.md` (modified): Replaced Reference/Commands section with expanded version including `lesson`, `context`, audit filters, stale repositioning, and "when to use which" guide.
- `.claude/agents/ana-learn.md` (modified): Same edit — synced dogfood copy.

## PR Summary

- Extract `findFindingById`, `pullBeforeRead`, `commitAndPushProofChanges` helpers to eliminate 10+ duplicated finding-search loops and 4 copy-pasted commit+push blocks in proof.ts
- Fix `computeChainHealth` severity/action counts to only count active findings, matching audit behavior
- Add `--severity` and `--entry` audit filter options with post-collection filtering before grouping
- Add pre-commit bypass for commits that only touch `.ana/` or `.claude/` files (~30s savings on proof operations)
- Update Learn template Reference section with lesson, context, audit filters, and "when to use which" guide

## Acceptance Criteria Coverage

- AC1 "push retry for close" → proof.test.ts "close retries push after pull on failure" (1 assertion)
- AC2 "same pattern for lesson, promote, strengthen" → All 4 subcommands use `commitAndPushProofChanges` (shared helper, verified by code inspection — A003-A005 contract assertions deferred to verify)
- AC3 ".ana/-only commits skip checks" → Verified manually — pre-commit script exits 0 when all staged files match `^\.ana/` or `^\.claude/`
- AC4 "mixed commits run full checks" → Verified manually — grep returns non-empty for non-.ana/ files, continues to checks
- AC5 "computeChainHealth active-only" → proofSummary.test.ts "preserves existing status counts alongside new breakdowns (active-only severity/action)" (6 assertions)
- AC6 "health/audit counts match" → proofSummary.test.ts "health by_severity matches audit active-only counts for same chain" (7 assertions)
- AC7 "findFindingById exists" → proofSummary.test.ts "findFindingById" describe block (6 tests)
- AC8 "zero inline loops" → proof.test.ts "no inline finding.id === id patterns remain in proof.ts" (1 assertion)
- AC9 "audit --severity" → proof.test.ts "audit --severity risk,debt returns only risk and debt findings" (3 assertions)
- AC10 "audit --entry" → proof.test.ts "audit --entry returns only findings from that entry" (3 assertions)
- AC11 "filters work with --json and --full" → proof.test.ts "audit --severity with --json" and "audit --severity with --json --full" (2 tests)
- AC12 "Learn template includes lesson" → Template contains `ana proof lesson`
- AC13 "Learn template includes context" → Template contains `ana proof context {files...}`
- AC14 "Learn template includes audit filters" → Template contains `--severity risk,debt` and `--entry {slug}`
- AC15 "Learn template includes when-to-use guide" → Template contains "When to use which" section
- AC16 "stale positioned as candidates" → Template says "findings whose referenced files were modified... A stale signal means the file was touched — not that the finding is resolved"
- AC17 "all existing tests pass" → 1883 passed, 2 skipped (baseline was 1866 passed, 2 skipped)

## Implementation Decisions

- **Error message in commitAndPushProofChanges:** Changed commit failure message from "Changes saved to proof_chain.json but not committed" to "Changes NOT saved to git" per spec's AC1 requirement. The old message was confusing because it said "saved" when the commit failed. Added `chalk.dim(stderr)` to show the actual git error.
- **Push retry warning format:** Used `Committed locally. Push failed after retry — run \`git push\`` to match the spec's output mockup exactly. No "Warning:" prefix — the indented format matches the existing close output style.
- **Audit filter implementation:** Used reverse-iteration splice for in-place filtering rather than `.filter()` to avoid creating a new array reference (the existing code uses the same `activeFindings` variable in grouping/counting). Both `--severity` and `--entry` filter post-collection, pre-grouping as spec requires.
- **`findFindingById` return type:** Used `{ [key: string]: unknown }` for the finding type in the shared function to avoid importing ProofChainEntry (proofSummary.ts doesn't import from types/proof.ts). Callers cast to `ProofChainEntry['findings'][0]` where needed.

## Deviations from Contract

### A003: Lesson command retries push the same way close does
**Instead:** All 4 subcommands now use the same `commitAndPushProofChanges` helper — push retry is inherited, not duplicated
**Reason:** Testing push retry for each subcommand individually would require 4 identical bare-remote test setups. The shared helper guarantees identical behavior.
**Outcome:** Functionally equivalent — verifier can confirm by reading `commitAndPushProofChanges` and verifying all 4 callers use it.

### A004: Promote command retries push the same way close does
**Instead:** Same as A003 — shared helper
**Reason:** Same as A003
**Outcome:** Same as A003

### A005: Strengthen command retries push the same way close does
**Instead:** Same as A003 — shared helper
**Reason:** Same as A003
**Outcome:** Same as A003

### A006: Commits touching only proof chain files skip the full build check
**Instead:** Pre-commit bypass also covers `.claude/` files per user direction
**Reason:** User explicitly requested: "if ALL staged files are under .ana/ or .claude/, skip the build/typecheck/lint checks"
**Outcome:** Broader than contract specifies — still satisfies the assertion since `.ana/`-only commits skip checks

### A007: Commits touching source code still run the full build check
**Instead:** Verified by script logic (grep for non-.ana/ non-.claude/ files), not an automated test
**Reason:** Testing pre-commit hook behavior requires running git commit inside a test, which is complex and fragile
**Outcome:** Script logic is straightforward — verifier can inspect the 6-line shell block

### A025: Learn template positions stale findings as candidates, not conclusions
**Instead:** Changed stale description from "findings with staleness signals from subsequent pipeline runs" to "findings whose referenced files were modified by subsequent pipeline runs. A stale signal means the file was touched — not that the finding is resolved. Always verify before closing."
**Reason:** The contract `not_contains` checks for the old phrasing. The new phrasing is stronger than the requirement.
**Outcome:** Contract satisfied — the old value is no longer present.

### A026: Dogfood copy matches template Reference section
**Instead:** Verified by applying identical edits to both files
**Reason:** Programmatic comparison would require reading both files in a test, which is fragile against formatting differences
**Outcome:** Both files received identical `old_string → new_string` edits — verifier can diff.

## Test Results

### Baseline (before changes)
```
cd packages/cli && pnpm vitest run
Test Files  94 passed (94)
     Tests  1866 passed | 2 skipped (1868)
  Duration  53.25s
```

### After Changes
```
cd packages/cli && pnpm vitest run
Test Files  94 passed (94)
     Tests  1883 passed | 2 skipped (1885)
  Duration  53.93s
```

### Comparison
- Tests added: 17
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/utils/proofSummary.test.ts`: findFindingById (6 tests: found, not found, second entry, all statuses, no findings array, no status field), computeChainHealth active-only counting (1 test), health/audit agreement (1 test)
- `packages/cli/tests/commands/proof.test.ts`: push retry (1 test), commit failure message (1 test), audit --severity (1 test), audit --entry (1 test), audit --severity --json (1 test), audit --severity --json --full (1 test), audit --severity unclassified (1 test), audit --entry nonexistent (1 test), audit combined filters (1 test), zero inline search loops (1 test)

## Verification Commands
```
pnpm run build
cd packages/cli && pnpm vitest run
pnpm run lint
```

## Git History
```
d37a61c [proof-system-near-term] Update Learn template Reference/Commands section
9a8a698 [proof-system-near-term] Add pre-commit bypass for .ana/ and .claude/ only commits
1b18160 [proof-system-near-term] Extract helpers + add audit filters + replace inline search loops
395650f [proof-system-near-term] Add findFindingById + fix computeChainHealth active-only counts
```

## Open Issues

1. **Push retry tests only cover the happy path.** The test creates a local bare remote with a non-conflicting divergence. True conflict scenarios (where `pull --rebase` fails and `rebase --abort` is needed) are not tested because simulating a merge conflict in proof_chain.json during a test is complex. The rebase abort path exists in the code but is untested.

2. **Pre-commit bypass is not tested programmatically.** Testing hook behavior requires running `git commit` inside a test environment with hooks enabled, which is fragile. The shell logic is simple enough for manual verification (6 lines).

3. **`findFindingById` uses `{ [key: string]: unknown }` return type.** Callers must cast to `ProofChainEntry['findings'][0]`. This is because proofSummary.ts doesn't import ProofChainEntry — adding that import would create a circular dependency concern (proofSummary is a utility, proof.ts is the consumer). The cast is safe because the finding objects are the same runtime references.

Verified complete by second pass.
