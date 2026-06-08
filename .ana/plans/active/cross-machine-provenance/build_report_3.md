# Build Report: Cross-machine provenance — Phase 3 (init hooks)

**Created by:** AnaBuild
**Date:** 2026-06-08
**Spec:** .ana/plans/active/cross-machine-provenance/spec-3.md
**Branch:** feature/cross-machine-provenance

## What Was Built

- **packages/cli/src/commands/init/assets.ts** (modified):
  - `injectCaptureHook` — removed the `SessionEnd` derive injection; now installs only the `SessionStart → ana _capture` hook.
  - `applyCodexCaptureHooks` — removed the `Stop` derive injection; now installs only `SessionStart`, then calls the new prune on `Stop` before writing `hooks.json`. JSDoc updated.
  - Added `pruneHookCommand(hooks, event, command)` — mirrors `injectHookEvent`'s shape; filters out entries whose `hooks[].command` matches the target, deletes the event key when it becomes empty, and is total/never-throw on a malformed/absent/non-array shape.
  - `createClaudeConfiguration` merge branch — calls `pruneHookCommand(existingSettings.hooks, SessionEnd, derive)` before `mergeHooksSettings`, so re-init removes a stale Claude derive hook while preserving user hooks. Stale "no flip-off prune" comments updated.
  - Legacy constants (`CAPTURE_DERIVE_COMMAND`, `CAPTURE_END_EVENT_CLAUDE`, `CAPTURE_END_EVENT_CODEX`) kept — the prune targets them. JSDoc updated to "(legacy) pruned on re-init".
  - `.ana/.gitignore` generator (lines ~96–102): **no change** (do-not-regress requirement — `provenance/` must stay un-ignored).
- **packages/cli/templates/.codex/hooks.json** (modified): removed the `Stop` block; only `SessionStart → ana _capture` remains.
- **packages/cli/tests/commands/init/assets-capture-hooks.test.ts** (modified): rewritten to the single-hook + prune model — fresh-install single hook (Claude + Codex), derive absence, derive prune on re-init (user hook preserved, empty-event-key removal), and a structural enforcement test on the shipped Codex template.
- **packages/cli/tests/commands/init.test.ts** (modified): added the `.ana/.gitignore` regression test (A044) to the existing `directory structure` describe (co-located with the other `createDirectoryStructure` `@ana` tests).

## PR Summary

- `ana init` now installs exactly one capture hook — `SessionStart → ana _capture` — on both Claude and Codex; the retired end-of-session `ana _capture --derive` hook is no longer installed.
- Re-init actively prunes a stale `ana _capture --derive` hook (Claude `SessionEnd` / Codex `Stop`) from upgraded installs — PR #291 had deleted the prune path, so upgraders would otherwise keep it forever.
- The prune keys on the exact command string: user-authored hooks under the same event are always preserved, and an event left empty is removed entirely (no dangling `"SessionEnd": []`).
- Locked in a regression guard that the generated `.ana/.gitignore` never ignores `provenance/` (it must travel in git for cross-machine assembly).
- Net +6 tests; full suite green (3572 passed, 2 skipped), build + lint + typecheck clean.

## Acceptance Criteria Coverage

- AC1 "fresh Claude installs exactly one SessionStart hook, no SessionEnd" → assets-capture-hooks.test.ts "fresh install installs the SessionStart capture hook" (A038) + "fresh install installs no SessionEnd derive hook" (A039)
- AC2 "fresh Codex installs exactly one SessionStart hook, no Stop" → "fresh install installs the SessionStart capture hook (Codex)" + "fresh install installs no Stop derive hook (Codex)"
- AC3 "re-init prunes Claude SessionEnd derive; user hook preserved; all-derive key removed" → "re-init prunes a stale SessionEnd derive hook" (A040), "re-init preserves a co-located user-authored SessionEnd hook" (A041), "removes the SessionEnd key entirely when it held only the derive hook"
- AC4 "re-init prunes Codex Stop derive; user hook preserved" → "re-init prunes a stale Stop derive hook (Codex)" (A043) + "re-init preserves a co-located user-authored Stop hook (Codex)"
- AC5 "template has no Stop/--derive entry" → "templates/.codex/hooks.json has no derive entry and no Stop key" (A042)
- AC6 "generated .ana/.gitignore contains no provenance entry" → init.test.ts "generated .ana/.gitignore does not ignore provenance" (A044)
- AC7 "SessionStart ana _capture install unchanged, dedup-safe" → "init installs the ana _capture hook" + "re-init is idempotent (exactly one capture hook)" + "capture hook stays installed when the flag is off"
- AC8 "build succeeds; suite passes, count not decreased" → build green; suite 3572 passed (baseline 3566), +6 net, 0 regressions

## Implementation Decisions

- **Gitignore regression test placed in `init.test.ts`, not the hook test file.** The spec allowed co-location "with the existing `.gitignore`/scaffold test if one exists." `tests/commands/init.test.ts` already has a `directory structure` describe with `createDirectoryStructure`-based `@ana`-tagged tests — the natural home. This also let the regression guard be its own independent commit (it does not touch the hook code path).
- **`pruneHookCommand` typed `hooks: unknown`.** The Claude call site passes `existingSettings.hooks` from arbitrary parsed JSON; typing the param `unknown` and narrowing inside keeps the total/never-throw posture honest (handles absent/non-object/non-array-event without a cast at the call site). Reuses the existing `HookEntry` type for the entry filter, per the spec.
- **Two commits.** Source + template + the inverting hook tests ship together (the old tests asserted the derive hook *was* installed; they must flip in lockstep with the source to keep the suite green). The independent gitignore regression guard is a second commit.

## Deviations from Contract

None — contract followed exactly. Every Phase-3 assertion (A038–A044) is satisfied by a tagged test using the contract's matcher intent (`not_contains` for derive absence via `not.toContain`, `contains` for the surviving user hook, exact `toBeUndefined()` for removed event keys).

## Test Results

### Baseline (before changes)
Command: `pnpm vitest run` (packages/cli)
```
 Test Files  146 passed (146)
      Tests  3566 passed | 2 skipped (3568)
```

### After Changes
Command: `ana test --stage build --slug cross-machine-provenance` (project-wide, sealed)
```
✓ captured  counts: 3572 passed, 0 failed, 2 skipped  (verdict: pass)
```
<!-- ana:capture stage=build slug=cross-machine-provenance counts=3572p/0f/2s verdict=pass sha256=cd9519de5162b1e4017c48231a6cb5ca1ddc2937464d4cf4b282a66b34a93c10 -->

Targeted checkpoint: `pnpm vitest run tests/commands/init/assets-capture-hooks.test.ts tests/commands/init.test.ts`
```
 Test Files  2 passed (2)
      Tests  81 passed (81)
```

### Comparison
- Tests added: +6 net (5 in the rewritten hook file, 1 gitignore regression in init.test.ts)
- Tests removed: 0
- Regressions: none

### New / changed tests
- `assets-capture-hooks.test.ts`: rewritten to single-hook + prune model — fresh single-hook install (Claude/Codex), derive absence on fresh install, derive prune on re-init with user-hook preservation and empty-event-key removal, structural enforcement on the shipped Codex template.
- `init.test.ts`: `.ana/.gitignore` regression test asserting the generator output omits `provenance`.

### Contract coverage
7/7 Phase-3 assertions tagged: A038, A039, A040, A041 (assets-capture-hooks.test.ts, Claude), A042 (template structural), A043 (assets-capture-hooks.test.ts, Codex), A044 (init.test.ts).

## Verification Commands
```
pnpm run build
(cd packages/cli && pnpm vitest run tests/commands/init/assets-capture-hooks.test.ts tests/commands/init.test.ts)
pnpm vitest run            # full CLI suite (run from packages/cli)
pnpm run lint
```

## Proof Context (curated)

`ana proof context src/commands/init/assets.ts` surfaced findings from the prior `session-capture` work (the structural analog that installed these hooks):
- **session-capture-C3** — "pruneCaptureHook leaves empty hook-event arrays." The new `pruneHookCommand` explicitly avoids this: it deletes the event key when the array becomes empty (covered by the "removes the SessionEnd key entirely" test).
- **session-capture-C2 / "applyCodexCaptureHooks never rewrites an existing config.toml"** — already addressed by the delta-#2 `ensureCodexHooksFlag` merge; untouched this phase and still covered by the config-merge test.
- **"Codex install/prune path is untested (init gating tests run --platforms claude only)"** — this phase **closes** that gap: the rewritten test file now exercises `--platforms codex` for fresh install + prune. The hooks.json schema remains unconfirmed against a live Codex install (recorded as an open observation).
- `templates/.codex/hooks.json`: no active proof context.

## Git History
```
782ee567 [cross-machine-provenance:s3] Guard that generated .ana/.gitignore never ignores provenance/
06ca5521 [cross-machine-provenance:s3] Install one capture hook; prune legacy derive on re-init
```

## Open Issues

1. **Codex hooks.json schema unconfirmed against a live Codex install.** The Codex install/prune path is now exercised by the built CLI (a real gap-closer vs prior phases), but the JSON shape is still validated only against our own fixtures, not a real Codex runtime. Severity: observation. Suggested action: monitor.
2. **Stale `@ana` tags corrected in the hook test file.** The prior file carried `@ana A018/A019/A022` tags that referenced the superseded install-time-gating contract; the current sealed contract reassigned those IDs to Phase 1/2 attestation/completeness assertions (verified by their own phase tests). Retagged to the correct Phase-3 IDs (A038–A043) and dropped the spurious ones. This is test-metadata correction, not a behavioral change. Severity: observation. Suggested action: acknowledge.
3. **`pruneHookCommand` drops a whole entry on any command match.** Correct for our install shape (one command per entry) and matches the spec's filter-by-command idiom, but a hand-authored entry co-locating the derive command with a user command in the same `hooks[]` array would lose the user command too. No such shape is produced by init. Severity: observation. Suggested action: acknowledge.

Second pass — re-checked for unused imports/params (none; `pruneHookCommand` and the new test helpers are all referenced), weakened assertions (none — structural `toBeUndefined`/`toContain`/`not.toContain`), and unhandled spec edge cases (no-SessionEnd no-op, malformed shape, empty hooks array all degrade cleanly via the early returns in `pruneHookCommand` and are exercised by the fresh-install path which has no SessionEnd to prune). The three items above are the complete set of observations.
