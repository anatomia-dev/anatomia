# Verify Report: Cross-machine provenance — Phase 3 (init hooks)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-08
**Spec:** .ana/plans/active/cross-machine-provenance/spec-3.md
**Branch:** feature/cross-machine-provenance

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../cross-machine-provenance/contract.yaml
  Seal: INTACT (hash sha256:300546c9ebe06e0342606d1641dbc6e6f915113038dcfbf878d0bb7cad0db4af)
```

Seal status: **INTACT** — the contract has not been modified since AnaPlan sealed it.

**Build:** `pnpm run build` (packages/cli) → success (tsup, 37ms).
**Tests (sealed, verify stage):** 3572 passed, 0 failed, 2 skipped — verdict pass.
`<!-- ana:capture stage=verify slug=cross-machine-provenance counts=3572p/0f/2s verdict=pass sha256=c1d3f720e47d27ea0f46251b13a9bf79635aae358086e50c6c62a250c0ef739f -->`
**Focused Phase-3 file** (`tests/commands/init/assets-capture-hooks.test.ts`): 21 passed.
**Lint:** 0 errors, 1 warning — `src/utils/git-operations.ts:198` unused eslint-disable directive. That file is **not** in Phase 3's changeset; the warning is pre-existing, not a regression from this build.

## Contract Compliance

Phase 3 covers assertions A038–A044. Each was verified against its tagged test AND independently re-confirmed by live `node dist/index.js init` invocation on a real temp git repo.

| ID   | Says | Status | Evidence |
|------|------|--------|----------|
| A038 | Fresh install gets exactly one capture hook on Claude | ✅ SATISFIED | `assets-capture-hooks.test.ts:206-209` asserts `SessionStart` contains `ana _capture` AND exactly one occurrence. Live: fresh init produced `SessionStart → ana _capture` only. |
| A039 | Fresh install installs no end-of-session derive hook | ✅ SATISFIED | `test:212-215` asserts no `--derive` and `SessionEnd` undefined. Live: no `SessionEnd` key in generated settings. |
| A040 | Re-init removes a stale derive hook left by an older version | ✅ SATISFIED | `test:240-243` asserts derive gone from `SessionEnd` and whole settings. Impl: `pruneHookCommand` at `assets.ts:267` in the merge branch. Live: seeded legacy `SessionEnd` derive → re-init → 0 `--derive` occurrences. |
| A041 | Pruning a stale hook never removes the user's own hooks | ✅ SATISFIED | `test:246-250` asserts co-located `my-own-cleanup.sh` survives and `SessionStart` capture intact. Live: user hook preserved, derive removed. |
| A042 | The Codex install template carries no derive hook | ✅ SATISFIED | `test:430-440` reads `templates/.codex/hooks.json`, asserts no `--derive` and `Stop` undefined. Template diff confirms the entire `Stop` block deleted. |
| A043 | Re-init prunes the stale derive hook on Codex too | ✅ SATISFIED | `test:405-408` (built-CLI e2e) seeds a `Stop` derive hook, re-inits, asserts derive pruned; `test:410-413` confirms user `Stop` hook preserved. Impl: `pruneHookCommand` at `assets.ts:833`. |
| A044 | Provenance files are never gitignored | ✅ SATISFIED | `init.test.ts:56-62` calls the real `createDirectoryStructure` generator and asserts the produced `.ana/.gitignore` lacks `provenance`. Generator (`assets.ts:96-102`) unchanged. Live: generated `.gitignore` contains no `provenance`. |

All 7 assertions SATISFIED. Tests are genuine end-to-end (built CLI against real temp git repos), and matchers align with the contract (`contains`/`not_contains` → `toContain`/`not.toContain`, plus stronger exact-count and key-absence checks).

## Independent Findings

**Implementation quality.** The `pruneHookCommand` helper (`assets.ts:715-743`) is clean and faithful to the spec: it mirrors `injectHookEvent`'s shape, is total/never-throw (guards `!hooks || typeof hooks !== 'object'` and `!Array.isArray(entries)`), keys on the exact command string, and — critically — **deletes the event key when the entry array becomes empty** rather than leaving a dangling `"SessionEnd": []`. This directly addresses the prior proof-chain finding `session-capture-C3` (the old `pruneCaptureHook` left empty arrays behind). The retirement is complete: `grep` confirms `CAPTURE_DERIVE_COMMAND` now appears only in the two prune calls and its definition — no injection site remains on either platform.

**Comments updated.** I predicted the stale "no flip-off prune" comments (spec gotcha, lines 213–216 / 789–791) would be missed. They were updated correctly (`assets.ts:213-216`, `268-270`, `824-832`), and the legacy-constant JSDoc now reads "(legacy) — pruned on re-init."

**Prediction resolution.**
1. *Empty-event cleanup left undone* → **Not found.** Implemented (`assets.ts:737-741`) and tested (`test:252-255`).
2. *Codex prune path weakly covered* (was untested per proof context) → **Not found.** Now covered by full built-CLI e2e tests (A043 + user-hook preservation). This closes the `session-capture` "Codex install/prune path is untested" concern.
3. *Stale comments* → **Not found.** Updated.
4. *Never-throw edge cases thin* → **Confirmed (minor).** The no-op path (re-init with no `SessionEnd`) is exercised by the on/off re-init flows, but the malformed-`hooks`-object and non-array-event-value defensive branches have no direct test. See Findings.
5. *gitignore test against template not generated output* → **Not found.** The A044 test exercises the real generator.

**Not predicted / surprised.** `pruneHookCommand` drops the entire entry object if *any* of its `hooks[].command` values match — so a user who co-located their own command inside the same entry object as the derive command would lose it. This is faithful to the spec's wording ("drop any entry whose `hooks[].command === command`") and unreachable in practice (Anatomia installs one command per entry), but worth recording. See Findings.

**Over-building / YAGNI.** None. The change is minimal and on-spec: one new helper, two prune call-sites, two comment refreshes, one template block deletion. No new exports, parameters, or code paths beyond the spec. The "delta #2" Codex `config.toml` merge test (`test:398-402`) is a co-located regression guard for **pre-existing** behavior — `git diff` confirms Phase 3 made no `config.toml`/`ensureCodexHooksFlag` changes.

## AC Walkthrough

- ✅ **PASS** — Fresh `ana init` installs exactly one Claude capture hook (`SessionStart → ana _capture`, no `SessionEnd`). Test A038/A039 + live invocation.
- ✅ **PASS** — Fresh `ana init` installs exactly one Codex capture hook (`SessionStart`, no `Stop`). Test `assets-capture-hooks.test.ts:381-388`.
- ✅ **PASS** — Re-init prunes a stale Claude `SessionEnd → ana _capture --derive`; co-located user hook preserved; all-derive `SessionEnd` key removed entirely. Tests A040/A041 + `test:252-255` + live invocation.
- ✅ **PASS** — Re-init prunes a stale Codex `Stop → --derive`, preserving a user `Stop` hook. Test A043 + `test:410-413`.
- ✅ **PASS** — `templates/.codex/hooks.json` carries no `Stop`/`--derive` entry. Test A042 + template diff.
- ✅ **PASS** — Generated `.ana/.gitignore` contains no `provenance` entry. Test A044 + live invocation.
- ✅ **PASS** — The `SessionStart` `ana _capture` install is unchanged and dedup-safe (stays on re-init, exactly one). Tests `test:225-231`.
- ✅ **PASS** — `pnpm run build` succeeds; `pnpm vitest run` passes. Suite green (3572p/0f/2s). See note below on the "not decreased" clause.
  - ⚠️ Note: Phase 2 did not record a numeric baseline count, so I could not do an exact numeric comparison. Verified instead that the suite is fully green with zero failures and that Phase 3 *added* net-new tests (prune, empty-key removal, gitignore regression) while deleting none — so the count did not decrease.

## Blockers

None. Searched specifically for:
- **Residual derive injection** — `grep` for `CAPTURE_DERIVE_COMMAND` / `_capture --derive` across `src/` and `templates/`: only prune calls, the constant, and comments remain. No install site survives on either platform.
- **Empty-event cruft** — the exact regression class (`session-capture-C3`) this work risked: confirmed the event key is deleted, both in code and by test, and live.
- **User-hook collateral damage** — prune keys on the exact command; user hooks survive (verified live for Claude, by test for Codex).
- **Unhandled malformed-input crash** — the prune is total/never-throw; guards cover absent/non-object hooks and non-array event values (untested but present — see Findings).
- **gitignore regression** — generator output asserted directly; `provenance` absent.

No contract assertion is UNSATISFIED, no AC fails, no regression (full suite green). Nothing qualifies as a blocker.

## Findings

- **Test — Never-throw guards unexercised:** `packages/cli/src/commands/init/assets.ts:725-728` — the malformed-`hooks` (non-object) and non-array-event-value branches of `pruneHookCommand` have no direct test. The spec's Testing Strategy explicitly listed these edge cases (malformed `hooks` object; missing/empty event array). The no-op path (re-init with no `SessionEnd`) *is* exercised via the on/off re-init flows, but the defensive degradation branches are not. Low risk (the guards are simple and correct by inspection), but the next engineer refactoring this helper has no test to catch a regression in its never-throw posture.
- **Code — Whole-entry prune semantics:** `packages/cli/src/commands/init/assets.ts:729-731` — `pruneHookCommand` drops the entire entry object when *any* of its `hooks[].command` values match, so a user who placed their own command inside the same entry object as `ana _capture --derive` would lose it. This is faithful to the spec wording and mirrors `injectHookEvent`'s `some()` dedup idiom; it is unreachable in practice because Anatomia installs one command per entry. Recorded for awareness, not action.
- **Upstream — A044 test location vs contract:** the A044 regression test lives in `packages/cli/tests/commands/init.test.ts:56`, but the contract's Phase-3 `file_changes` lists only `assets-capture-hooks.test.ts`. The test exists and correctly exercises the generated output; the contract simply under-specified where it would land. No code impact.
- **Code — Pre-existing Codex TOML concern still live (out of scope):** `packages/cli/src/commands/init/assets.ts:870` — `ensureCodexHooksFlag` flips any `hooks =` key via regex regardless of which TOML table it sits under, so a `hooks =` key under a non-`[features]` table could be flipped. This is the `session-capture` build concern about text-based TOML matching. Phase 3 does not touch this path, so it is neither resolved nor regressed here — flagged so the next engineer touching Codex config knows it remains open. (Separately, `session-capture-C2` — the flag being written only when `config.toml` was absent — is already resolved on `main` via the human-approved "Delta #2" merge at `assets.ts:857`; not this build's work.)
- **Code — Pre-existing lint warning:** `packages/cli/src/utils/git-operations.ts:198` — unused `eslint-disable` for `no-control-regex`. Not introduced by Phase 3 (file not in the changeset). Flagged so it is not mistaken for new debt from this work; trivially fixable with `--fix`.

## Deployer Handoff

- Phase 3 is the last phase of `cross-machine-provenance`; Phases 1 and 2 already verified PASS. With this PASS, all three phases are verified and the work is PR-ready.
- This phase only changes the **install** surface: `ana init` now installs a single `SessionStart` capture hook per platform and actively prunes the retired `ana _capture --derive` hook from upgraded installs. No runtime/provenance behavior changes here.
- Upgrade behavior to expect in the field: existing installs that re-run `ana init` will have their stale `SessionEnd`/`Stop` derive hook silently removed; user-authored hooks under the same event are preserved.
- One pre-existing lint warning (`git-operations.ts:198`) is unrelated to this work — safe to ignore or `--fix` separately.

## Verdict

**Shippable:** YES

All 7 Phase-3 assertions (A038–A044) are SATISFIED with evidence from both the sealed test suite and independent live `ana init` invocations I ran this session. The implementation is minimal, on-spec, total/never-throw, and closes two prior proof-chain concerns (`session-capture-C3` empty-event cruft, and the previously-untested Codex prune path). The five findings are observations and minor test-gap debt — none blocks shipping. I would stake my name on this shipping to production.
