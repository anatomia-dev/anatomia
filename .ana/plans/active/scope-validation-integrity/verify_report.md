# Verify Report: Scope Validation Integrity

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-08
**Spec:** .ana/plans/active/scope-validation-integrity/spec.md
**Branch:** feature/scope-validation-integrity

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/scope-validation-integrity/contract.yaml
  Seal: INTACT (hash sha256:258d09bd9df9ff27b126fcdef70040571951cb921faf60b1655ce81147a9762f)
```

Tests: 2024 passed, 0 failed, 2 skipped. Build: success. Lint: 0 errors, 1 pre-existing warning (unused eslint-disable directive in git-operations.ts — not from this build).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Scopes without a Kind field are rejected at save time | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:780` — removes Kind, asserts throw + error contains 'Kind' |
| A002 | Scopes with an invalid Kind like 'fix + chore' are rejected with a message showing the bad value | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:815` — uses `fix + chore`, asserts error contains 'fix + chore' |
| A003 | Scopes with a valid Kind like 'fix' are accepted | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:851` — uses Kind: fix, asserts not.toThrow() |
| A004 | Scopes without a Size field are rejected at save time | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:913` — removes Size, asserts throw + error contains 'Size' |
| A005 | Compound sizes like 'small-medium' are accepted using lenient parsing | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:948` — uses `small-medium`, asserts not.toThrow() |
| A006 | Sizes with trailing context like 'medium (8 items)' are accepted | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:979` — uses `medium (8 items)`, asserts not.toThrow() |
| A007 | Non-standard size values like 'tiny' are rejected | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:1010` — uses `tiny`, asserts error contains 'tiny' |
| A008 | Scopes without a Multi-phase field are rejected at save time | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:1046` — removes Multi-phase, asserts throw + error contains 'Multi-phase' |
| A009 | Multi-phase values with trailing context like 'no (this is Phase 1)' are accepted | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:1081` — uses `no (this is Phase 1)`, asserts not.toThrow() |
| A010 | Invalid Multi-phase values like 'maybe' are rejected | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:1112` — uses `maybe`, asserts error contains 'maybe' |
| A011 | Scopes missing the Complexity Assessment section are rejected | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:749` — removes section, asserts error contains 'Complexity Assessment' |
| A012 | Scopes missing the Approach section are rejected | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:1148` — removes Approach, asserts error contains 'Approach' |
| A013 | Scopes with an empty Approach section are rejected | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:1181` — empty Approach (heading + no content), asserts error contains 'Empty' |
| A014 | Scopes missing the Edge Cases section are rejected | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:1216` — removes Edge Cases, asserts error contains 'Edge Cases' |
| A015 | A fully valid scope with all required sections and fields passes validation | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:851` — full valid scope with Kind, Size, Multi-phase, Approach, Edge Cases, Structural Analog, Intent, 3 ACs — passes |
| A016 | Kind validation is case-insensitive — 'Feature' and 'FIX' are accepted | SATISFIED | `packages/cli/tests/commands/artifact.test.ts:882` — uses `Feature` (PascalCase), not.toThrow(). Code at `artifact.ts:424` does `.toLowerCase()` comparison, covering all case variants |
| A017 | The dogfood ana.md template marks Kind, Size, and Multi-phase as enforced enums | SATISFIED | `.claude/agents/ana.md:189` — contains `*(validated by \`ana artifact save scope\` — exact match required)*`. All three fields annotated at lines 189, 190, 194 |
| A018 | The shipped ana.md template matches the dogfood template's Complexity Assessment section | SATISFIED | Both files identical at lines 188-194. Existing sync test at `packages/cli/tests/templates/agent-proof-context.test.ts:67` enforces exact match |
| A019 | A post-merge hook exists that rebuilds the CLI when source files change | SATISFIED | `.husky/post-merge` exists with `rwxr-xr-x` permissions. Contains `pnpm run build` inside conditional |
| A020 | The post-merge hook only rebuilds when CLI source files changed | SATISFIED | `.husky/post-merge:9` — greps for `^packages/cli/src/`, only enters build block if matches found |
| A021 | The six most recent proof chain entries have correct kind values after backfill | SATISFIED | Verified: all 6 entries have kind fields — website-direct-polish:chore, ship-log-polish:chore, test-suite-hygiene:chore, website-nav-copy-polish:fix, worktree-artifact-cleanup:fix, ci-artifact-path-ignore:chore |
| A022 | ci-artifact-path-ignore is classified as chore in the proof chain | SATISFIED | `.ana/proof_chain.json` last entry: `ci-artifact-path-ignore` has `kind: "chore"` |
| A023 | worktree-artifact-cleanup is classified as fix in the proof chain | SATISFIED | `.ana/proof_chain.json` second-to-last entry: `worktree-artifact-cleanup` has `kind: "fix"` |
| A024 | Existing tests continue to pass after validation changes | SATISFIED | Full suite: 2024 passed, 0 failed, 2 skipped. Baseline was 2009 passed — 15 new tests added, 0 regressions |

## Independent Findings

**Predictions resolved:**

1. **En-dash in Size (not found):** The regex `/^(small|medium|large)\b/i` correctly handles `small–medium` because `\b` matches between a word char and a non-word char (en-dash). Tested conceptually — the builder got this right.

2. **Approach regex matching 'Rejected Approaches' (not found):** The regex at `artifact.ts:450` uses `/##\s+Approach\s*$/im` — the `$` anchor prevents matching `## Rejected Approaches`. Correct.

3. **Tests using plain toThrow() (confirmed — pre-existing):** The OLD scope validation tests at lines 697-746 still use plain `toThrow()` without checking error messages. However, all NEW tests capture `console.error` and check specific error content. The builder improved on the existing pattern for new tests but didn't retrofit old ones — reasonable scope.

4. **Backfill script deleted (confirmed correct):** `scripts/backfill-kind.ts` does not exist. AC16 met.

5. **Template sync (confirmed identical):** Both `.claude/agents/ana.md` and `packages/cli/templates/.claude/agents/ana.md` have identical Complexity Assessment sections (verified at lines 188-194).

**Over-building check:** No extra functions, parameters, or features beyond what the spec requires. The 5 commits touch exactly the files listed in the contract's `file_changes`. No unused exports in new code. No dead code paths in the validation logic — every `if` branch serves a validation rule.

**Production risk check:** Post-merge hook is non-blocking (`if ! pnpm run build` inside `set -e` is safe because `if` suppresses exit-on-error). If `pnpm` is missing, the `if` catches the error and prints a message. Correct pattern.

## AC Walkthrough
- **AC1:** validateScopeFormat rejects missing Kind — ✅ PASS. Test at line 780 captures error and verifies 'Kind' in message.
- **AC2:** rejects invalid Kind with error showing value — ✅ PASS. Test at line 815 verifies 'fix + chore' in error. Code at line 426 uses template literal to show the bad value.
- **AC3:** rejects missing Size — ✅ PASS. Test at line 913.
- **AC4:** lenient Size parsing — ✅ PASS. `small-medium` passes (line 948), `medium (8 items)` passes (line 979), `tiny` fails (line 1010). Regex `/^(small|medium|large)\b/i` matches first token correctly.
- **AC5:** rejects missing Multi-phase — ✅ PASS. Test at line 1046.
- **AC6:** lenient Multi-phase parsing — ✅ PASS. `no (this is Phase 1)` passes (line 1081), `maybe` fails (line 1112).
- **AC7:** rejects missing Complexity Assessment section — ✅ PASS. Test at line 749.
- **AC8:** rejects missing/empty Approach — ✅ PASS. Missing: test at line 1148. Empty: test at line 1181 (checks for 'Empty' in error).
- **AC9:** rejects missing Edge Cases section — ✅ PASS. Test at line 1216.
- **AC10:** error messages name field, show value, state constraint — ✅ PASS. Verified all 6 error messages in code (lines 422, 426, 432, 436, 442, 446). Each names the field, valid values, and shows the invalid value where applicable.
- **AC11:** templates updated with enforced enums — ✅ PASS. Both templates show "validated by `ana artifact save scope`" annotations on Kind, Size, and Multi-phase.
- **AC12:** template sync — ✅ PASS. Both files identical at Complexity Assessment section. Enforced by existing test at `agent-proof-context.test.ts:67`.
- **AC13:** post-merge hook — ⚠️ PARTIAL. Hook exists, is executable, has correct logic (greps for `packages/cli/src/`, runs build conditionally). Cannot live-test without a real merge event — verified by reading hook source.
- **AC14:** proof chain backfill — ✅ PASS. All 6 entries verified: ci-artifact-path-ignore=chore, worktree-artifact-cleanup=fix, website-nav-copy-polish=fix, test-suite-hygiene=chore, ship-log-polish=chore, website-direct-polish=chore.
- **AC15:** website ship log displays correct tags — ⚠️ PARTIAL. Data is correct (kind values present). ProofFeed.tsx at line 25-28 maps chore→"improve", fix→"fix", feature→"feature". Cannot run the website in this session to visually confirm.
- **AC16:** backfill script deleted — ✅ PASS. `scripts/backfill-kind.ts` does not exist on the branch.
- **AC17:** existing tests pass, new tests cover all rules — ✅ PASS. 2024 passed (up from 2009 baseline), 0 failures. 15 new tests covering all 6 validation rules with acceptance and rejection cases.

## Blockers
No blockers. All 24 contract assertions satisfied. All mechanically-verifiable ACs pass. Checked: no unused exports in new code (validation function is internal, not exported), no unused parameters in `validateScopeFormat`, no unhandled error paths (all regex matches checked for null before access), no assumptions about external state beyond file system reads (consistent with existing pattern). The 2 PARTIAL ACs (AC13 post-merge hook, AC15 website rendering) are verifiable only by integration testing that requires infrastructure not available in this session — the code paths are correct by source inspection.

## Findings

- **Test — A016 tests one case variant, not both:** `packages/cli/tests/commands/artifact.test.ts:882` — contract says "'Feature' and 'FIX' are accepted" but the test only uses 'Feature'. The code is correct (`.toLowerCase()` at `artifact.ts:424` handles all cases), but the test only proves one variant. A second case like 'FIX' would strengthen the assertion.

- **Test — Console.error capture pattern duplicated in 8 tests:** `packages/cli/tests/commands/artifact.test.ts:771-1245` — every rejection test manually saves/restores `console.error` and collects errors into an array. A shared helper like `captureErrors(() => saveArtifact(...))` would reduce 6 lines per test to 1. Not a correctness issue — a maintainability observation.

- **Test — Pre-existing scope tests use plain toThrow():** `packages/cli/tests/commands/artifact.test.ts:711,727,745` — the 3 original scope validation tests (insufficient ACs, missing Structural Analog, empty Intent) still use `toThrow()` without checking error content. Still present — see proof context finding from Structured Findings Companion. New tests in this build correctly check error content.

- **Code — Post-merge hook fragility under set -e:** `.husky/post-merge:6` — the hook uses `set -e` but wraps the build command in `if ! ...` to prevent exit. This is correct now, but any future command added after the `if` block without its own guard will fail-exit the hook. The pre-commit hook uses the same pattern and hasn't had issues, so this is a known-safe pattern in this project.

- **Upstream — AC15 not mechanically verifiable:** AC15 requires visual confirmation of the website ship log rendering. The data layer is correct (kind values present in proof_chain.json, ProofFeed.tsx maps them correctly at lines 19-28). Full verification requires running the website — noted as PARTIAL in AC walkthrough.

## Deployer Handoff
Clean build. 5 commits, all scoped to the spec. The branch includes `proof_chain.json` changes (backfill) that will merge cleanly — no other branch is likely modifying the same entries. The `getValidScopeContent()` test helper was updated to include all new required sections, so no downstream test breakage. The post-merge hook at `.husky/post-merge` needs its execute bit preserved on merge (git tracks this). After merge, any `git pull` that brings CLI source changes will auto-rebuild — this is the intended behavior. The backfill script was already deleted; no cleanup needed.

## Verdict
**Shippable:** YES

All 24 contract assertions satisfied. 15/17 ACs pass mechanically, 2 are partial (require integration infrastructure). No regressions (2024 tests pass vs 2009 baseline). No over-building. Clean implementation that follows existing patterns. The validation code is well-structured — 62 new lines in artifact.ts, each serving a spec-required check. Would I stake my name on this shipping? Yes.
