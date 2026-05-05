# Scope: Proof System Near-Term — Learn Infrastructure Foundation

**Created by:** Ana
**Date:** 2026-05-05

## Intent

Fix the infrastructure that makes Learn sessions slow, error-prone, and wasteful. Six changes that each address a verified problem from 3 Learn sessions. The proof commands have push error handling that confuses Learn, a pre-commit hook that wastes 30s per close on JSON files, severity counts that lie, duplicated search loops, an audit command without filters, and a template missing critical guidance.

None of these are about Learn's judgment — Learn's triage is good. These are about the tools Learn uses being wrong for batch operations.

## Complexity Assessment
- **Size:** medium
- **Files affected:**
  - `src/commands/proof.ts` — push retry logic (4 sites), findFindingById extraction (10 sites), audit filters
  - `src/utils/proofSummary.ts` — severity count fix, findFindingById function
  - `.husky/pre-commit` — path filter
  - `templates/.claude/agents/ana-learn.md` — 6 template edits
  - `.claude/agents/ana-learn.md` — dogfood copy sync
  - Test files for proof commands and proofSummary
- **Blast radius:** All proof subcommands (close, lesson, promote, strengthen consume shared changes). Health JSON output changes shape (active-only severity). Audit gains new options.
- **Estimated effort:** 2 phases
- **Multi-phase:** yes

## Approach

Two layers: fix the tools (code changes), then fix the instructions (template changes). Tools first because the template improvements depend on the tools working correctly.

**Layer 1 — Code:** Fix push error recovery (retry after pull instead of misleading error). Skip pre-commit for non-source commits. Make severity counts active-only. Extract the duplicated finding-search loop. Add severity and entry filters to audit.

**Layer 2 — Template:** Update the Reference/Commands section with new tools (lesson, context, audit filters) and prescriptive usage guidance on when to use each. Position stale findings as "could be stale" candidates, not conclusions.

## Acceptance Criteria

- AC1: When `ana proof close` push fails, the command pulls and retries once before warning. Error message distinguishes commit failure ("Changes NOT saved") from push failure ("Committed locally. Push failed after retry — run `git push`")
- AC2: Same retry-then-warn pattern for lesson, promote, and strengthen
- AC3: `git commit` on a change that only touches `.ana/` files skips the pre-commit build/typecheck/lint checks
- AC4: `git commit` on a change that touches both `.ana/` and `packages/cli/src/` files runs all pre-commit checks normally
- AC5: `computeChainHealth` `by_severity` and `by_action` count only active findings (status === 'active')
- AC6: `ana proof health --json` severity/action counts match `ana proof audit --json` counts (they're both active-only now)
- AC7: A shared `findFindingById(chain, id)` function exists in proofSummary.ts and is used by close, lesson, promote, and strengthen
- AC8: Zero inline finding-search loops remain in proof.ts (all use the shared function)
- AC9: `ana proof audit --severity risk,debt` returns only findings with those severities
- AC10: `ana proof audit --entry proof-intelligence-hardening` returns only findings from that entry
- AC11: Both filters work with `--json` and `--full`
- AC12: Learn template Reference section includes `ana proof lesson` with description: record as institutional lesson — verified, real, but not actionable
- AC13: Learn template Reference section includes `ana proof context {files...}` with description: findings and build concerns for specific files, active only by default
- AC14: Learn template Reference section includes audit filter usage: `--severity risk,debt` to filter by severity, `--entry {slug}` to filter by pipeline run
- AC15: Learn template Reference section includes a "when to use which" guide that prescribes: `--severity risk,debt` at session start for deep review targets, `--severity observation` for lesson candidates, `--entry {slug}` after a scope ships to see its findings, `--full` when truncated top 3 isn't enough, `context {files}` for file-focused triage, `stale` for candidates that COULD be resolved (not conclusions — always verify before closing)
- AC16: Learn template positions stale findings as "could be stale" — candidates for investigation, not conclusions. A stale signal means the file was touched, NOT that the finding is resolved
- AC17: All existing tests pass

## Edge Cases & Risks

- **Push retry loop:** Must retry exactly once, not indefinitely. Pull --rebase before retry. If retry also fails, warn and continue — don't block the session.
- **Pre-commit path filter:** Mixed commits (`.ana/` + source files) must still run full checks. The grep pattern must handle paths correctly including the `.` prefix on `.ana/`.
- **Severity count backward compat:** Any tool or script consuming `health --json` `meta.by_severity` as total-including-closed will see different numbers. Nothing in our codebase does this — Learn is the only consumer and it WANTS active-only. But external consumers (if any) would break.
- **findFindingById return type:** Must return both finding and entry (the entry is needed for slug, feature name in close/promote output). Returning just the finding loses context.
- **Audit --severity filter:** Must handle unclassified findings. `--severity unclassified` should work. Comma separation means `--severity risk,debt` — need to parse.
- **Audit --entry filter:** Entry slug must match exactly. No partial matching.
- **Template sync:** Changes to `templates/.claude/agents/ana-learn.md` must be synced to `.claude/agents/ana-learn.md` (dogfood copy).

## Rejected Approaches

- **Remove pull/push entirely.** The system is autonomous — "developer pushes when ready" contradicts the autonomy model. The push is correct behavior. The error handling is what's wrong.
- **Batch close with per-finding reasons.** Push retry (this scope) makes individual closes reliable. Batch is polish for later.
- **`ana proof triage --since` command.** Audit filters (`--severity`, `--entry`) compose to provide the same delta view without a new command.
- **Lesson-specific type fields (`lesson_reason`).** The `status` field already distinguishes lesson from closed. Type surface area expansion not worth it.

## Open Questions

- Should `computeChainHealth` `by_severity` change in-place (breaking) or add new `active_by_severity` alongside (backward compat)? I recommend in-place — the old counts were wrong, nobody depends on wrong counts being wrong in a specific way. Plan decides.
- Should the push retry also apply to the pull block (retry pull on network failure)? Currently pull warns and continues with local data. A retry might help but adds complexity. Plan decides.

## Exploration Findings

### Patterns Discovered
- `proof.ts:824-842`: commit + push block for close. Identical pattern at lesson (~1130), promote (~1480), strengthen (~1810). The push-then-warn pattern is copy-pasted 4 times.
- `proof.ts:671-685`: pull block for close. Identical at lesson (955), promote (1287), strengthen (1679).
- `proofSummary.ts:1226-1249`: `computeChainHealth` iterates all findings, counts severity at lines 1236-1240 without status filter.
- `.husky/pre-commit:9-15`: unconditional `cd packages/cli && pnpm run build && ...`

### Constraints Discovered
- [TYPE-VERIFIED] `findFindingById` must return `{ finding: ProofChainEntry['findings'][0], entry: ProofChainEntry }` — callers need both for output formatting (close shows entry_slug, promote shows entry_feature).
- [OBSERVED] `computeChainHealth` `by_severity` is consumed only by health JSON `meta` block. No other code path reads it. Audit computes its own counts from `activeFindings`.
- [OBSERVED] Pre-commit runs `pnpm run build` which includes `pnpm typecheck`. Then runs `pnpm typecheck` again separately. Then `pnpm typecheck:tests`. Then `pnpm lint`. For source changes this is correct (build, typecheck src, typecheck tests, lint). For .ana/ changes all 4 are provably redundant.

### Test Infrastructure
- `tests/commands/proof.test.ts` — large test file for proof subcommands. Close tests at ~line 3800+, lesson tests at ~line 4044+.
- `tests/utils/proofSummary.test.ts` — unit tests for computeChainHealth, computeStaleness, parseACResults.

## For AnaPlan

### Structural Analog
`proof.ts` close command at lines 824-842 — the commit+push pattern that all 4 subcommands share. The push retry logic should be extracted into a shared function alongside the commit, just like `createExitError` was extracted for error handling.

### Relevant Code Paths
- `proof.ts:824-842` — close commit+push (and 3 identical copies)
- `proof.ts:671-685` — close pull block (and 3 identical copies)
- `proofSummary.ts:1226-1249` — computeChainHealth severity counting
- `proofSummary.ts:1835` — getProofContext (existing, works correctly)
- `.husky/pre-commit:1-16` — full hook
- `templates/.claude/agents/ana-learn.md` — Learn template

### Patterns to Follow
- `createExitError` factory pattern (already in proof.ts) — the push retry helper follows the same "extract shared behavior" approach
- `getProofContext` filter at line 1870 — `if (!options?.includeAll && finding.status && finding.status !== 'active') continue` — same active-only filter pattern for computeChainHealth

### Known Gotchas
- `spawnSync` for commit (line 832) vs `runGit` for push (line 839) — different APIs. The retry helper needs to handle both or standardize on one.
- Template sync: `.claude/agents/ana-learn.md` is the dogfood copy. `templates/.claude/agents/ana-learn.md` is the template. Both must be updated.
- The pre-commit `set -e` at line 9 means any non-zero exit stops the hook. The path filter must exit 0 (skip) before `set -e` takes effect, or be placed after it with correct exit codes.

### Things to Investigate
- Does the push retry need to handle the case where pull --rebase introduces a merge conflict on proof_chain.json? Two concurrent closures could conflict. The retry should abort cleanly if the rebase conflicts.
- How does `pnpm run build` in the pre-commit interact with the path filter? The `cd packages/cli` at line 11 changes directory. The path filter must run before the `cd`.
