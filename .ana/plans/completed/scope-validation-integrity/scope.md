# Scope: Scope Validation Integrity

**Created by:** Ana
**Date:** 2026-05-08

## Intent
Agents write scope fields inconsistently and nothing catches it. Kind was added to the scope template and wired through the CLI — but 1 of 4 post-fix scopes omitted it entirely, 1 wrote an invalid compound value (`fix + chore`), and all 4 produced MISSING in the proof chain because the CLI binary was never rebuilt after the fix merged. The same pattern applies to Size (10 of 70 scopes used non-standard values like `small-medium` or `medium (with explanation)`) and Multi-phase (4 of 70 had trailing context that would break strict parsing). The validator at `ana artifact save scope` checks ACs, Structural Analog, and Intent — but doesn't check any Complexity Assessment fields. Agents populate what they want, the pipeline accepts it silently, and data is lost downstream.

## Complexity Assessment
- **Kind:** fix
- **Size:** medium
- **Files affected:**
  - `packages/cli/src/commands/artifact.ts` — `validateScopeFormat()` expansion
  - `packages/cli/tests/commands/artifact.test.ts` — new validation tests
  - `.claude/agents/ana.md` — template clarity for enum fields
  - `packages/cli/templates/.claude/agents/ana.md` — same template update for shipped product
  - `.husky/post-merge` — new hook for dev rebuild
  - `.ana/proof_chain.json` — backfill Kind on existing entries
  - `scripts/backfill-kind.ts` — one-shot backfill script (delete after use)
- **Blast radius:** `validateScopeFormat` is called by `ana artifact save scope`. Stricter validation means agents that write non-conforming scopes will be rejected at save time — this is the intended behavior, but it changes the current experience where anything is accepted. The post-merge hook affects dev workflow only (husky-installed, not shipped). The backfill touches proof_chain.json which feeds every `ana proof` command and the website.
- **Estimated effort:** 2-3 hours
- **Multi-phase:** no

## Approach
Three layers: make the gate catch bad data, make the template unambiguous, and prevent the class of error where source changes don't reach the running binary.

The validation uses **lenient parsing** for Size and Multi-phase — extract the first valid token, ignore trailing qualifiers. Ana writes `small-medium` or `no (skill template updates are a separate follow-up scope)` and the parser reads `small` and `no`. This matches how 15% of historical scopes were written. Kind is strict because it has exactly three values with no meaningful in-between.

The post-merge hook is a dev-environment concern only. End users get matched agents + binary from npm releases — they don't have this drift problem. We have it because agents update instantly (markdown read from disk) while the CLI needs a build step. The hook closes that gap.

## Acceptance Criteria
- AC1: `validateScopeFormat` rejects scopes missing a `**Kind:**` line with a clear error naming the field and valid values.
- AC2: `validateScopeFormat` rejects scopes where Kind is not exactly one of `feature`, `fix`, `chore` (case-insensitive). Error message shows the invalid value: `"Kind must be exactly one of: feature, fix, chore. Got: 'fix + chore'"`.
- AC3: `validateScopeFormat` rejects scopes missing a `**Size:**` line.
- AC4: Size validation uses lenient parsing — extracts the first valid token (`small`, `medium`, `large`) from the value. `small-medium` passes (parsed as `small`). `medium (8 items)` passes (parsed as `medium`). `tiny` or empty fails.
- AC5: `validateScopeFormat` rejects scopes missing a `**Multi-phase:**` line.
- AC6: Multi-phase validation uses lenient parsing — extracts first token (`yes` or `no`). `no (this IS Phase 1...)` passes. `maybe` fails.
- AC7: `validateScopeFormat` rejects scopes missing a `## Complexity Assessment` section.
- AC8: `validateScopeFormat` rejects scopes missing a `## Approach` section with content (same pattern as existing Intent check).
- AC9: `validateScopeFormat` rejects scopes missing a `## Edge Cases` section.
- AC10: All validation error messages name the specific field, show the invalid value (if applicable), and state the constraint. No generic "invalid scope" errors.
- AC11: `.claude/agents/ana.md` and `templates/.claude/agents/ana.md` template updated — Kind, Size, and Multi-phase show as machine-parsed enums with explicit valid values and a note that the save validator enforces them.
- AC12: Both template files have identical Complexity Assessment sections (template sync).
- AC13: `.husky/post-merge` hook exists. When a `git pull` brings changes to `packages/cli/src/`, it runs `pnpm run build` in `packages/cli/`. When no CLI source changed, it does nothing.
- AC14: The 6 most recent proof chain entries have correct `kind` values. Specifically: `ci-artifact-path-ignore` → `chore`, `worktree-artifact-cleanup` → `fix`, `website-nav-copy-polish` → `fix`, `test-suite-hygiene` → `chore`, `ship-log-polish` → `chore`, `website-direct-polish` → `chore`.
- AC15: After backfill, the website ship log displays correct tags: mix of "feature", "fix", and "improve" — not all "feature".
- AC16: Backfill script is deleted after use (not shipped as a CLI feature).
- AC17: Existing passing tests continue to pass. New tests cover all validation rules.

## Edge Cases & Risks
- **Agents bounce on save.** The validator will reject scopes that were previously accepted. This is intentional — the error message tells the agent exactly what to fix. One re-save cycle, not a loop. If an agent can't self-correct from "Kind must be exactly one of: feature, fix, chore. Got: 'fix + chore'", the message is wrong.
- **Lenient parsing ambiguity.** `small-medium` → `small`. Is that right? The alternative is requiring Ana to pick one. Given 10 of 70 historical scopes used compound sizes, lenient parsing avoids breaking natural agent behavior. The trailing context goes in Estimated effort where it belongs.
- **Post-merge hook build failure.** If `pnpm run build` fails after pull, the hook should print the error but not block. The merge is already complete — the repo is in the correct state, the binary is just stale. A manual `pnpm run build` fixes it.
- **Post-merge hook and contributors.** Anyone who clones and runs `pnpm install` gets husky hooks. The post-merge hook is lightweight — one grep + conditional build. No risk to contributors.
- **Backfill correctness.** Three entries have parseable Kind from their scopes. Three need manual assignment. The manual assignments (`website-nav-copy-polish` → `fix`, `test-suite-hygiene` → `chore`, `website-direct-polish` → `chore`) are judgment calls based on the work. Document the reasoning in the backfill script.
- **proof_chain.json integrity.** Entry hashes are artifact-level (scope SHA, spec SHA), not entry-level integrity seals. Adding `kind` to entries doesn't invalidate any hash. All `ana proof` commands handle `kind` as optional — existing behavior is unaffected.
- **Post-rewrite gap.** The post-merge hook fires on `git pull` (merge) but not `git rebase`. If we switch to rebase-based pulls, we'd need a `post-rewrite` hook too. Not a problem today.
- **Website ISR cache.** After pushing backfilled proof_chain.json, the website fetches with 60-second ISR revalidation. Brief staleness window. No action needed — it self-resolves.

## Rejected Approaches
- **Staleness check in `work complete`.** This would add dev-environment logic to shipped CLI code that every end user runs. End users install releases with matched agents + binary — they don't have source/binary drift. The post-merge hook solves the dev problem without polluting the product.
- **Staleness warning on every `ana` invocation.** Too noisy. Most `ana` commands don't care about binary freshness. Only `work complete` writes data that depends on the built code, and the post-merge hook prevents the stale state from occurring at all.
- **Strict Size validation (reject `small-medium`).** 15% of historical scopes used compound sizes. Strict validation would create unnecessary friction. Lenient parsing extracts the signal without fighting natural agent behavior.
- **Making Kind optional in the validator.** The whole point is that optional Kind = silent data loss. The field was already added as "optional" and the result was 67 of 70 entries with no Kind. Make it required, catch it early.
- **Backfilling ALL 70 entries.** Only 6 show on the website. The rest are historical. Backfilling 64 additional entries for entries nobody sees adds risk (more manual judgment calls) for no visible benefit. Old entries without Kind continue to use the slug heuristic in the website.

## Open Questions
None — all design decisions resolved in conversation.

## Exploration Findings

### Patterns Discovered
- `packages/cli/src/commands/artifact.ts:375-414`: `validateScopeFormat` checks ACs (≥3), Structural Analog section, Intent section with content. Returns `string | null` (error message or null). Called at save time.
- `packages/cli/src/commands/artifact.ts:423-470`: `validateSpecFormat` follows similar pattern — checks for Build Brief section, warns on approximate baselines. Returns `{ error?: string; warning?: string }`.
- `packages/cli/src/utils/proofSummary.ts:432-444`: `extractScopeKind` — strict equality parse. Returns valid kind or undefined.
- Historical scopes: 67/70 missing Kind, 10/70 non-standard Size, 4/70 non-standard Multi-phase. All 70 have Approach and Edge Cases sections.
- `.husky/pre-commit` already runs `pnpm run build` for local commits. The gap is remote merges arriving via `git pull`.

### Constraints Discovered
- [TYPE-VERIFIED] `validateScopeFormat` returns `string | null` — single error, not error array. Adding multiple checks means returning the first failure, not all failures. This matches existing pattern (Intent check stops at first issue).
- [TYPE-VERIFIED] Global `ana` binary symlinks to local `packages/cli/dist/index.js` via npm link. Rebuild = immediate effect.
- [OBSERVED] Husky post-merge hook fires after `git merge` and `git pull`. Not after `git rebase` or `git cherry-pick`.
- [OBSERVED] proof_chain.json entry hashes are artifact-level, not entry-level integrity seals. Safe to patch.

### Test Infrastructure
- `packages/cli/tests/commands/artifact.test.ts` — existing validation tests. Pattern: write temp scope file, call validator, assert error message.
- `packages/cli/tests/utils/proofSummary.test.ts:1581-1645` — existing `extractScopeKind` tests (7 cases). These remain valid and unchanged.

## For AnaPlan

### Structural Analog
`validateSpecFormat` in `artifact.ts` — same file, same pattern, similar validation needs (required sections + field-level checks). The scope validator expansion follows this shape exactly.

### Relevant Code Paths
- `packages/cli/src/commands/artifact.ts:375-414` — `validateScopeFormat()`, the function to expand
- `packages/cli/src/commands/artifact.ts:1025-1027` — where scope validation is called during save
- `packages/cli/src/commands/artifact.ts:1405` — where scope validation is called during legacy save path
- `packages/cli/src/utils/proofSummary.ts:432-444` — `extractScopeKind()` for reference on parsing pattern
- `.husky/pre-commit` — existing hook for reference on hook structure and skip logic
- `.claude/agents/ana.md` — dogfood template (lines ~188-193 for Complexity Assessment)
- `packages/cli/templates/.claude/agents/ana.md` — shipped template (must stay in sync)

### Patterns to Follow
- Validation: return first error as string, null for valid. Match `validateScopeFormat` existing pattern.
- Error messages: follow existing format — `"Missing X. Scope must Y."` Name the field, state the constraint.
- Hook: follow `.husky/pre-commit` structure — `#!/usr/bin/env sh`, `set -e`, conditional logic.
- Template sync: both `ana.md` files must have identical Complexity Assessment sections. AC12 enforces this.

### Known Gotchas
- The lenient Size parser needs to handle `small-medium` (hyphenated), `small–medium` (en-dash — found in 1 scope), and `medium (explanation)` (parenthetical). The regex should match the first word boundary token.
- `validateScopeFormat` returns on first error. If a scope is missing Kind AND Size AND Multi-phase, the agent only sees the first error. This is consistent with existing behavior (Intent check short-circuits) but means multiple save attempts for multiple issues. Consider whether to change to returning all errors — but that's a signature change affecting callers.
- The pre-commit hook has a skip condition for `.ana/` and `.claude/` only commits. The post-merge hook should NOT have this skip — if CLI source changed in the merge, rebuild regardless of what else changed.

### Things to Investigate
- Should `validateScopeFormat` return all errors instead of first-error-only? This would change the return type from `string | null` to `string[] | null` and affect callers. Evaluate whether the benefit (agent fixes all issues in one pass) justifies the signature change.
