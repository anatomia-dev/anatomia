# Build Report: Merge (not clobber) managed .gitignore files on re-init

**Created by:** AnaBuild
**Date:** 2026-06-08
**Spec:** .ana/plans/active/gitignore-merge-on-reinit/spec.md
**Branch:** feature/gitignore-merge-on-reinit

## What Was Built

- **packages/cli/src/commands/init/gitignore.ts** (created): New pure module — zero CLI deps, no `fs`. Exports `mergeGitignore(existingContent, stockBlock)` plus the three stock constants `ANA_GITIGNORE_STOCK`, `CLAUDE_GITIGNORE_STOCK`, `CODEX_GITIGNORE_STOCK`. Sentinel strings are module-private. Implements the three-case merge algorithm (block-only / well-formed regenerate / legacy fail-safe), line-ending-agnostic sentinel + stock matching, and the A044 hard gate.
- **packages/cli/src/commands/init/assets.ts** (modified): (1) `createDirectoryStructure` now writes `mergeGitignore(null, ANA_GITIGNORE_STOCK)` to the temp `.ana/.gitignore` instead of a hard-coded string. (2) `createClaudeConfiguration` deletes the inline `claudeGitignoreContent`; both write sites (fresh + re-init) now go through a new `mergeAndWriteGitignore` helper that reads-merges-writes via `atomicWriteFile`. (3) `createCodexConfiguration` gains a net-new `.codex/.gitignore` write (fresh + re-init) through the same helper. Added one private helper `mergeAndWriteGitignore`.
- **packages/cli/src/commands/init/state.ts** (modified): `preserveUserState` gains step 9 — read the OLD live `.ana/.gitignore` from `existingAnaPath` (guarded), `mergeGitignore` it against current stock, write to the temp tree before the atomic swap. Policy doc comment at the `.gitignore` bullet rewritten to record the clobber→merge change and why intent is preserved.
- **packages/cli/src/commands/init/commit.ts** (modified): Added `'.claude/scheduled_tasks.lock'` to `EXCLUDED_PREFIXES`.
- **packages/cli/tests/commands/init/gitignore.test.ts** (created): 32 unit tests for the pure helper.
- **packages/cli/tests/commands/init.test.ts** (modified): 6 integration tests for `.ana`/`.claude`/`.codex` preservation + A044-on-all-surfaces, under a spy that points `getTemplatesDir` at the real templates tree.
- **packages/cli/tests/commands/init/commit.test.ts** (modified): 1 exclusion test for `scheduled_tasks.lock`.

## PR Summary

- Re-running `ana init`/`ana run setup` no longer clobbers user content in `.ana/`, `.claude/`, and `.codex/` `.gitignore` files — a single `mergeGitignore` helper writes only a sentinel-delimited managed block and preserves everything outside it verbatim.
- `.codex/.gitignore` is now created on init (net-new) with grounded Codex stock (`agent-memory/`, `settings.local.json`), and survives re-init like the other surfaces.
- Legacy un-marked `.gitignore` files (every existing install) migrate safely on first re-init: stock is wrapped into the managed block, all other lines preserved below; partial/hand-authored markers fail safe and are never deleted.
- `.claude/scheduled_tasks.lock` is now both gitignored and added to `EXCLUDED_PREFIXES`, so the Claude session lock is never committed by setup.
- In-place live-tree `.gitignore` writes route through the existing `atomicWriteFile` crash-safety primitive; the `.ana` merge runs pre-swap in `preserveUserState` (the only place with access to the old file).

## Acceptance Criteria Coverage

- AC1 "preserves `.ana` user line" → init.test.ts ".ana: preserveUserState preserves a user line and regenerates stock" + gitignore.test.ts case-2/legacy tests (A001)
- AC2 "preserves `.claude` user line" → init.test.ts ".claude: createClaudeConfiguration preserves a user line and lists the session lock" (A002)
- AC3 "`.codex/.gitignore` created with stock + survives re-init" → init.test.ts ".codex: fresh init creates .gitignore with Codex stock" + ".codex: re-init preserves a user line" (A003, A004)
- AC4 "stock always present; managed block carries no dup stock" → gitignore.test.ts "regenerates stock when the user deleted a stock line" (A005)
- AC5 "re-init twice byte-identical, all surfaces, ±user content" → gitignore.test.ts idempotency suite (A006, A007, A008)
- AC6 "user `!negation` after block keeps winning" → gitignore.test.ts "keeps a user !negation below the END sentinel" (A009)
- AC7 "legacy migration wraps stock, preserves other lines" → gitignore.test.ts "wraps a legacy bare-stock file..." (A010, A011)
- AC8 "`scheduled_tasks.lock` excluded + stock ignores it" → commit.test.ts "excludes .claude/scheduled_tasks.lock" + gitignore.test.ts CLAUDE stock exact-content (A012, A013)
- AC9 "never ignores provenance, all surfaces" → gitignore.test.ts A044 suite + init.test.ts "generated .gitignore for all three surfaces never ignores provenance" (A014, A015, A016)
- AC10 "stock identical regardless of language" → gitignore.test.ts "ANA stock contains no language/framework tokens" + exact-content assertions (A022)
- AC11 "content above start sentinel consolidated below" → gitignore.test.ts "consolidates user content above the start sentinel below the block" (A017)
- AC12 "partial/duplicate/hand-authored sentinel → user content, never deleted" → gitignore.test.ts fail-safe suite (A018)
- AC13 "whole-file-CRLF managed file detected well-formed, byte-identical" → gitignore.test.ts "whole-file-CRLF managed input..." (A023)
- "Full CLI suite passes" → 3621 passed / 0 failed / 2 skipped (sealed marker below)
- "No build errors" → `pnpm run build` green (typecheck + tsup)
- "Lint clean" → 0 errors (1 pre-existing warning in git-operations.ts, not mine)

Contract coverage: 23/23 assertions tagged (A001–A023). A044 legacy invariant also tagged.

## Implementation Decisions

- **`mergeAndWriteGitignore` private helper (assets.ts).** The `.claude` and `.codex` in-place writes both need the same read-existing → merge → `atomicWriteFile` sequence at two call sites each (fresh + re-init). I factored it into one private helper rather than inlining four copies. The spec described the behavior per-site but did not name a helper; this keeps the read-merge-write discipline in one place and matches the spec's "single place" intent. The `.ana` surface deliberately does NOT use this helper — its merge must run pre-swap in `preserveUserState` with a plain temp-tree write, per the spec.
- **A044 hard gate implemented as a runtime throw in `mergeGitignore`.** The spec calls A044 a "hard gate ... assert it, never assume it." I added a guard that throws if `stockBlock` contains `provenance`. It never fires for our constants (holds by construction) so it has zero behavioral impact on normal operation, but it makes the invariant a true gate rather than only a test-time check. Covered by a dedicated unit test.
- **`getTemplatesDir` spy in integration tests.** `createClaudeConfiguration`/`createCodexConfiguration` resolve templates via `getTemplatesDir()`, which only points at the real tree from `dist/`. Under vitest-from-src it mis-resolves to a non-existent `src/templates`. I spy on the `state.js` namespace export to point it at the package's real `templates/` dir for these full-flow tests (matching how sibling tests compute the templates path). See Open Issues — this is a pre-existing quirk, not introduced here.

## Deviations from Contract

None — contract followed exactly. Every assertion A001–A023 is satisfied by a tagged test using the contract's matcher semantics (`contains`/`equals`/`not_contains`).

## Test Results

### Baseline (before changes)
Affected-file baseline verified directly:
```
(cd packages/cli && pnpm vitest run tests/commands/init.test.ts tests/commands/init/commit.test.ts)
Test Files  2 passed (2)
     Tests  104 passed (104)
```
Full-suite baseline (per spec, confirmed by reconciliation below): 3582 passed, 2 skipped.

### After Changes
Sealed capture (`ana test --stage build --slug gitignore-merge-on-reinit`):
```
✓ captured  counts: 3621 passed, 0 failed, 2 skipped  (verdict: pass)
```
<!-- ana:capture stage=build slug=gitignore-merge-on-reinit counts=3621p/0f/2s verdict=pass sha256=b564d93a4baed4ac91005ac1da42cd6cad7d90182d19cd0bb2e7317d90d4f8e8 -->

Per-file (after):
```
gitignore.test.ts   32 passed
init.test.ts        65 passed  (+6)
init/commit.test.ts 46 passed  (+1)
```

### Comparison
- Tests added: 39 (32 new gitignore.test.ts file + 6 init.test.ts + 1 commit.test.ts)
- Tests removed: 0
- Regressions: none (3582 + 39 = 3621, 0 failed; 2 skipped unchanged)

### New Tests Written
- gitignore.test.ts: all three merge cases, idempotency (3 surfaces ±user content), whole-file CRLF, CRLF-in-user-line, negation ordering, above-block consolidation, legacy migration + benign promotion, fail-safe (only-START/only-END/duplicate/END-before-START), A044 (+throw gate), stock exact-content + language-independence.
- init.test.ts: `.ana` preserve + absent-old-file, `.claude` preserve + lock, `.codex` fresh-create + re-init-preserve, provenance-free on all three surfaces.
- commit.test.ts: `isExcluded('.claude/scheduled_tasks.lock')` === true.

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run tests/commands/init/gitignore.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/init.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/init/commit.test.ts)
(cd packages/cli && pnpm vitest run)
(cd packages/cli && pnpm run lint)
```

## Git History
```
db73acd5 [gitignore-merge-on-reinit] Exclude .claude/scheduled_tasks.lock from infra commits
f1bd88a6 [gitignore-merge-on-reinit] Route the three clobber sites through mergeGitignore
d5ccf8a1 [gitignore-merge-on-reinit] Add pure mergeGitignore helper and stock constants
```

## Open Issues

- **`getTemplatesDir()` mis-resolves under vitest-from-src.** It returns `src/templates` (nonexistent) instead of the real `templates/` dir; only `dist/` resolves correctly. Pre-existing — not introduced by this build. My integration tests work around it with a `vi.spyOn` on the `state.js` namespace export. If `getTemplatesDir` is ever fixed to resolve in the src context, the spy can be removed. Severity: debt; suggested action: scope.
- **`atomicWriteFile` integrity-failure branch remains untested** (noted in spec Proof Context). The new `.claude`/`.codex` `.gitignore` writes now route through it, but I did not add a test for the SHA-mismatch throw branch (out of scope). Awareness only. Severity: observation; suggested action: monitor.
- **A044 runtime guard is an addition beyond the literal spec.** The spec said "assert it"; I interpreted that as a runtime throw plus a test. If the verifier considers the throw out of scope, it is trivially removable (the test-time assertions alone also satisfy A014–A016). Severity: observation; suggested action: acknowledge.

Second pass — what I noticed but hadn't written: the `.codex/.gitignore` is net-new, so on a re-init of an install that predates this change there is no old `.codex/.gitignore`; the fresh branch only runs when `.codex/` itself is absent, while the re-init branch runs `mergeAndWriteGitignore` with `existing = null` (read fails gracefully) and produces block-only output — correct, and covered by the `.codex` fresh test plus idempotency. No further issues. Verified complete by second pass.
