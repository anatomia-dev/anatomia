# Verify Report: Merge (not clobber) managed .gitignore files on re-init

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-08
**Spec:** .ana/plans/active/gitignore-merge-on-reinit/spec.md
**Branch:** feature/gitignore-merge-on-reinit

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../gitignore-merge-on-reinit/contract.yaml
  Seal: INTACT (hash sha256:4c8355461a47a39d974ada58e196b5a8e63e52529ed1e7f63828fc37fdf75fff)
```

Seal status: **INTACT** — contract unmodified since AnaPlan sealed it.

- **Build:** clean (`pnpm run build` — ESM build success, no errors).
- **Tests (sealed verify re-run):** 3621 passed, 0 failed, 2 skipped. Baseline was 3582 passing / 2 skipped → +39 net new tests, no regressions.
  `<!-- ana:capture stage=verify slug=gitignore-merge-on-reinit counts=3621p/0f/2s verdict=pass sha256=eb655d8a6817c69c9bafe02a6fe0d2421412ff4cf19f7bad35eee4857877e5c6 -->`
- **Lint:** 0 errors, 1 warning. The warning is in `src/utils/git-operations.ts` (an unused eslint-disable directive) — a file NOT touched by this build. Pre-existing, not a regression.

## Contract Compliance

| ID   | Says                                                              | Status      | Evidence |
|------|-------------------------------------------------------------------|-------------|----------|
| A001 | User line in `.ana/.gitignore` survives re-setup                  | ✅ SATISFIED | `tests/commands/init.test.ts:701-728` — real `preserveUserState` call, `expect(merged).toContain('user-custom-ignore-line')` (line 725) |
| A002 | User line in `.claude/.gitignore` survives re-setup               | ✅ SATISFIED | `tests/commands/init.test.ts:751-771` — real `createClaudeConfiguration(...,'reinit')`, toContain user line (769) |
| A003 | Codex gets its own ignore file on first setup, lists private files| ✅ SATISFIED | `tests/commands/init.test.ts:773-781` — created `.codex/.gitignore` `toContain('agent-memory/')` (778); also stock-content test `init/gitignore.test.ts:277-282` |
| A004 | User line in `.codex/.gitignore` survives re-setup                | ✅ SATISFIED | `tests/commands/init.test.ts:783-796` — fresh then reinit, toContain user line (794) |
| A005 | Stock entries restored even if user deleted them                  | ✅ SATISFIED | `init/gitignore.test.ts:58-68` toContain `state/`; also `init.test.ts:726` |
| A006 | Re-running setup leaves `.ana` ignore byte-identical              | ✅ SATISFIED | `init/gitignore.test.ts:198-202` (ANA) `expect(second).toBe(first)` |
| A007 | Re-running setup leaves `.claude` ignore byte-identical           | ✅ SATISFIED | `init/gitignore.test.ts:198-202` / `204-210` (CLAUDE) `.toBe` |
| A008 | Re-running setup leaves `.codex` ignore byte-identical            | ✅ SATISFIED | `init/gitignore.test.ts:198-210` (CODEX) `.toBe`; also `init.test.ts:770` lock present |
| A009 | User `!negation` below block keeps winning after re-setup         | ✅ SATISFIED | `init/gitignore.test.ts:82-94` — afterEnd toContain `!settings.local.json.example` |
| A010 | Legacy unmarked file upgraded into managed-block format           | ✅ SATISFIED | `init/gitignore.test.ts:136-150` toContain START sentinel (144) |
| A011 | Legacy upgrade preserves user's non-stock lines                   | ✅ SATISFIED | `init/gitignore.test.ts:136-150` toContain `user-custom-ignore-line` (145,149) |
| A012 | Claude session lock never committed by setup                      | ✅ SATISFIED | `tests/commands/init/commit.test.ts:169-172` `expect(isExcluded('.claude/scheduled_tasks.lock')).toBe(true)` |
| A013 | Claude ignore file lists the session lock                         | ✅ SATISFIED | `init/gitignore.test.ts:266-275` exact CLAUDE stock incl. `scheduled_tasks.lock` |
| A014 | `.ana` ignore never hides provenance                              | ✅ SATISFIED | `init/gitignore.test.ts:228-231` `.not.toContain('provenance')` |
| A015 | `.claude` ignore never hides provenance                           | ✅ SATISFIED | `init/gitignore.test.ts:233-236` `.not.toContain('provenance')` |
| A016 | `.codex` ignore never hides provenance                            | ✅ SATISFIED | `init/gitignore.test.ts:238-241` `.not.toContain('provenance')` |
| A017 | User lines above the block tidied below it                        | ✅ SATISFIED | `init/gitignore.test.ts:96-108` — afterEnd toContain + index assertion |
| A018 | Broken/hand-written marker treated as user content, never deleted | ✅ SATISFIED | `init/gitignore.test.ts:160-186` — only-START/only-END/dup-START/END-before-START all preserve content |
| A019 | Starting from nothing produces clean managed block                | ✅ SATISFIED | `init/gitignore.test.ts:21-33` exact `.toBe` full block incl. END sentinel |
| A020 | User's CRLF line endings kept verbatim                            | ✅ SATISFIED | `init/gitignore.test.ts:122-132` toContain `user-crlf-line\r` |
| A021 | User line matching a stock entry kept as written                  | ✅ SATISFIED | `init/gitignore.test.ts:110-120` — afterEnd toContain `state/` (preserve-verbatim, not stripped) |
| A022 | Ignore entries same for every project regardless of language      | ✅ SATISFIED | `init/gitignore.test.ts:249-254` `.not.toContain('TypeScript')` |
| A023 | Whole-file-CRLF managed block recognized and stable on re-setup   | ✅ SATISFIED | `init/gitignore.test.ts:213-224` `.toBe` + single-block assertion |

All 23 assertions SATISFIED. Every matcher method matches the contract: `equals` assertions use `.toBe` (A006-A008, A012, A023), `contains` use `.toContain`, `not_contains` use `.not.toContain` (A014-A016, A022). No method mismatches.

## Independent Findings

**Predictions made before reading code (resolved):**
1. *CRLF idempotency (A023) is the trap — case-2 sentinel detection must `\r`-trim like case 3.* — **Not found.** `normalizeForMatch` (gitignore.ts:64) applies `.trim()` to both sentinel detection and stock-strip; I traced the whole-file-CRLF round-trip by hand and it converges byte-identically (block normalizes to LF, user interior `\r` preserved). The test at line 213 asserts exactly this.
2. *A044 guard implemented as an assumption rather than an assertion.* — **Not found / better.** gitignore.ts:116 actively `throw`s if `stockBlock` contains `provenance`, and there's a dedicated test (line 243). Hard gate, not assumed.
3. *A user line equal to a stock value gets wrongly stripped in the well-formed case.* — **Not found.** Case 2 never strips against stock; user region is preserved verbatim (A021 test confirms). Stripping only happens in legacy case 3, which is correct per spec.
4. *Pattern breaks at scale.* — Pure function, O(n) over lines, no fs/CLI deps. No scaling concern.
5. *Spec guidance led Build astray.* — Spec was unusually precise (exact algorithm + mockups); Build followed it faithfully.

**Production-risk prediction:** *An existing customer's clobbered, unmarked `.gitignore` must migrate without data loss on first re-init.* — Covered by the legacy/fail-safe path (case 3) and tested (A010/A011). The fail-safe is conservative: anything not recognized as current stock survives.

**Surprised-by (not predicted):** Build added a `mergeAndWriteGitignore` wrapper (assets.ts:205) the spec didn't literally name. It is a thin DRY helper around `atomicWriteFile` used at all three in-place call sites — good factoring, routes through the existing crash-safe primitive exactly as the spec's *pattern* required. Over-build check passed: no unused exports in `gitignore.ts` (all three stock constants + `mergeGitignore` are imported by `assets.ts`/`state.ts`/tests), no dead branches, no unused parameters.

**Code quality:** `gitignore.ts` is correctly pure (no chalk/ora/fs), named exports only, explicit return types, `@param`/`@returns` JSDoc present. `.js` extensions on all relative imports. state.ts/commit.ts/assets.ts changes match the spec's file-change plan precisely (commit.ts is a literal one-line `EXCLUDED_PREFIXES` add; the `.ana` merge lives pre-swap in `preserveUserState` as required).

**Test quality:** Integration tests exercise the real `preserveUserState`/`createClaudeConfiguration`/`createCodexConfiguration` against actual files (only `getTemplatesDir` is spied — an unavoidable filesystem boundary). Unit tests use exact `.toBe` on full strings for idempotency. Contract-aligned matchers throughout.

## AC Walkthrough

- **AC1** ✅ PASS — `.ana` user line preserved (init.test.ts:701-728, A001).
- **AC2** ✅ PASS — `.claude` user line preserved (init.test.ts:751-771, A002).
- **AC3** ✅ PASS — `.codex/.gitignore` created with Codex stock + survives re-init (init.test.ts:773-796, A003/A004).
- **AC4** ✅ PASS — stock always present after re-init even if deleted; user-region line equal to stock left verbatim (A005, A021).
- **AC5** ✅ PASS — byte-identical re-init for all three surfaces, with/without user content (A006-A008 `.toBe`).
- **AC6** ✅ PASS — `!negation` after the block stays below and wins (A009).
- **AC7** ✅ PASS — legacy bare-stock file migrated, user lines preserved below (A010/A011).
- **AC8** ✅ PASS — `scheduled_tasks.lock` in `EXCLUDED_PREFIXES` (commit.ts:55, A012) AND in CLAUDE stock (A013).
- **AC9** ✅ PASS — no surface ignores `provenance`; hard throw + tests (A014-A016).
- **AC10** ✅ PASS — stock is project-type-independent, no language tokens (A022).
- **AC11** ✅ PASS — user content above the block consolidated below (A017).
- **AC12** ✅ PASS — partial/duplicate/hand-authored sentinels degrade to user content (A018).
- **AC13** ✅ PASS — whole-file-CRLF managed block detected well-formed, regenerates byte-identical (A023).
- **Full suite** ✅ PASS — 3621 passed / 2 skipped, 0 failed.
- **Build** ✅ PASS — no errors.
- **Lint** ✅ PASS — 0 errors (1 pre-existing warning in an untouched file).

## Blockers

None. Searched specifically for:
- **Unused exports** in `gitignore.ts` — all four exports (`mergeGitignore` + 3 stock constants) are imported by `assets.ts`, `state.ts`, and tests. None orphaned.
- **Unused parameters / dead branches** — read every branch of `mergeGitignore`; case 1/2/3 are all reachable and tested. No dead `if`/`for`.
- **Silently swallowed errors** — the two `try/catch` blocks (state.ts:899, assets.ts:203 reads) intentionally degrade to block-only output when the old file is absent; this is the spec's documented graceful-degradation contract, and both paths are covered (init.test.ts:730 absent-file test).
- **Contract↔test matcher mismatches** — none; every `equals` uses `.toBe`, every `not_contains` uses `.not.toContain`.
- **Regressions** — 0 failed, baseline preserved; `worktree.test.ts:306` (depends on `worktrees/` staying in stock) still green.

Nothing qualifies as a blocker.

## Findings

- **Test — atomicWriteFile SHA-256 failure branch still untested:** `packages/cli/src/commands/init/assets.ts:190` — the integrity-failure branch (hash-mismatch throw + temp cleanup) of `atomicWriteFile` remains uncovered, and the new `.claude`/`.codex` gitignore writes now route through it via `mergeAndWriteGitignore`. Carry-forward of `template-propagation-C3` — still present, not introduced here. Latent (the branch only fires on a write-corruption race), so not a blocker; worth a dedicated test next time this file is opened.
- **Test — stale `@ana` ID collisions in commit.test.ts:** `packages/cli/tests/commands/init/commit.test.ts:70,89,139,322,665` carry `@ana A001/A003/A004/A012/...` tags from a *prior* contract whose assertion IDs numerically collide with this contract's. The one legitimate tag for this contract (A012 at line 169) is correct, but a grep-based `@ana` coverage tool would mis-attribute the stale tags. Observation — coverage was verified by reading each test, not by tag-grep.
- **Code — legacy migration absorbs user copies of stock lines:** `packages/cli/src/commands/init/gitignore.ts:159` — in case 3 (legacy/fail-safe), any line equal to a *current* stock value is stripped regardless of position, so a user who independently listed e.g. `settings.local.json` in a pre-marker file has it absorbed into the managed block on first re-init. Harmless (the path stays ignored) and one-time-only, and the spec documents this as intended. Recorded for the next engineer who touches the migration path.
- **Code — `mergeAndWriteGitignore` helper beyond literal spec:** `packages/cli/src/commands/init/assets.ts:205` — not named in the spec (which said "route through `atomicWriteFile`") but a clean DRY wrapper used at 3 sites. Over-building check: justified, no unused surface. Noting per the YAGNI/scope-creep audit, not a concern.
- **Process — verify worktree 2 commits behind main:** both commits (`fe243eef`, `6ea61c75`) are `.ana/plans/active/remove-plan-phase-checkbox/` artifact updates for an unrelated slug — zero source overlap with this build. No conflict risk at merge.

## Deployer Handoff

- This fixes the re-init clobber bug (#292): `ana init` now merges the three managed `.gitignore` files (`.ana`, `.claude`, `.codex`) instead of overwriting them, preserving user lines.
- **Behavioral note for existing installs:** the first re-init after this ships migrates each customer's currently-clobbered, unmarked `.gitignore` into the managed-block format. User lines are preserved; bare stock lines get wrapped into the block. This is a one-time, non-destructive upgrade.
- New file committed: `.codex/.gitignore` now appears on Codex installs (previously absent).
- `.claude/scheduled_tasks.lock` is now both gitignored and force-add-excluded, so it will no longer be committed by `ana init commit`.
- `.agents/` was deliberately left out of scope (no `.gitignore` exists there today; its state is already exclusion-covered). A `.agents/.gitignore` parity pass is a clean follow-up.
- Merge will need a trivial rebase/merge over the 2 artifact-only commits on main — no code conflict.

## Verdict

**Shippable:** YES

All 23 contract assertions SATISFIED with read-and-verified tests, all 13 acceptance criteria PASS, 3621 tests green with no regressions, build and lint clean. The merge algorithm is faithful to the spec — I hand-traced the two subtle invariants (whole-file-CRLF idempotency and user-line-equals-stock preservation) and both hold. Findings are latent/observational, none block shipping. I would stake my name on this going to production.
