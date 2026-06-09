# Build Report: Remove the non-authoritative plan.md phase checkbox

**Created by:** AnaBuild
**Date:** 2026-06-08
**Spec:** .ana/plans/active/remove-plan-phase-checkbox/spec.md
**Branch:** feature/remove-plan-phase-checkbox

## What Was Built

- **packages/cli/src/commands/artifact-validators.ts** (modified): Rewrote `validatePlanFormat`.
  Kept the `## Phases` heading check; replaced the checkbox-coupled checks with a phase-list
  walk that collects every unindented `- ` line in the `## Phases` section as a phase entry
  (matches both old `- [ ]` and new glyph-free `- ` formats), requires ≥1 phase, and requires a
  `Spec:` ref between each phase and the next (or section end) using the verbatim mirrored regex
  `/Spec:\s*(spec(?:-\d+)?\.md)/`. A comment points to the canonical copy in `work-state.ts:125`.
- **packages/cli/src/commands/artifact.ts** (modified): Deleted both `verify-report → git add
  plan.md` special-case blocks — the single-save block in `saveArtifact` and the multi-save block
  in `saveAllArtifacts`. No dead variables left behind.
- **packages/cli/src/commands/work.ts** (modified): Added a normalization block inside the
  `if (remotes)` block, immediately before the `git pull --rebase --autostash` in `completeWork`.
  If this slug's plan.md is tracked-modified (porcelain non-empty and not `??` untracked), it is
  restored from HEAD (`git checkout HEAD -- {relPlanPath}`), scoped strictly to that one path, with
  an optional `chalk.yellow` notice guarded by `!options?.json`.
- **packages/cli/templates/.claude/agents/ana-plan.md**, **.codex/...**, **.claude/agents/ana-plan.md**,
  **.codex/agents/ana-plan.md** (modified): Step 5 phase lines are now plain `- ` items (no glyph)
  for both single- and multi-spec blocks; the two "mandatory" sentences re-anchored to "the
  `## Phases` heading and a `Spec:` ref per phase are mandatory" (dropped "checkbox"/"`- [ ]`").
  Acceptance-criteria `- [ ]` lines and the "Genuinely unresolvable" example left untouched.
- **ana-verify** (4 files, modified): Removed the "change the phase's checkbox from `[ ]` to `[x]`"
  step and renumbered; changed the save parenthetical to "(pushes automatically)"; updated the two
  "What You Do NOT Do" bullets to "the only file you write is verify_report.md" and "Don't touch
  plan.md at all"; dropped "stages plan.md if present" from the Reference save description.
- **ana-build** (4 files, modified): Both checkbox references reworded to "Do NOT touch plan.md.
  AnaPlan owns it." while preserving the surrounding "Do NOT read other specs" guidance.
- **website/content/docs/concepts/artifacts.mdx** (modified): Dropped the "(checkbox updates in
  multi-phase)" parenthetical from the plan.md "Read by" line.
- **packages/cli/tests/commands/artifact.test.ts** (modified): Rewrote the `plan format validation`
  block (old/new/multi-phase accepted; missing-Spec, empty-section, missing-heading rejected);
  inverted the single-save staging test to assert plan.md is NOT committed; added a save-all test.
- **packages/cli/tests/commands/work-state.test.ts** (created): countPhases regression tests for
  old-format, new-format, and multi-phase plans.
- **packages/cli/tests/commands/work-merge.test.ts** (modified): Added an integration test that
  reproduces the autostash collision with a tracked-modified plan.md and asserts a clean,
  uncorrupted completion.

## PR Summary

- Removes the redundant, no-code-reads-it plan.md phase checkbox and the machinery that maintained
  and committed it, eliminating the cross-tree commit path that dirtied the working tree.
- Re-anchors `validatePlanFormat` to enforce the *real* contract — a `## Phases` section with a
  `Spec:` ref per phase — accepting both old (checkbox) and new (glyph-free) plans, so in-flight
  plans on disk keep validating. `countPhases` is untouched and stays format-agnostic.
- Adds a defense-in-depth guard in `ana work complete --merge`: a tracked-modified plan.md is
  restored from HEAD before the autostash pull, preventing an autostash-pop conflict from silently
  committing `<<<<<<<` conflict markers into the archived plan.md.
- Updates all 12 agent instruction files (templates + dogfood, Claude + Codex, behaviorally
  identical) and the artifacts doc so nothing tells an agent to emit, tick, or stage the checkbox.
- Net +7 tests; full CLI suite green (3589 passed, 2 skipped).

## Acceptance Criteria Coverage

- AC1 "no uncommitted/modified plan.md after multi-phase completion" → work-merge.test.ts
  "completes --merge with a tracked-modified plan.md (autostash collision) and leaves a clean tree"
  asserts `git status --porcelain` is empty post-completion (1 assertion). ✅
- AC2 "`--merge` never blocked by plan.md state, incl. pre-fix items" → same test: completion
  succeeds (no throw/exit) with a tracked-modified plan.md and origin divergence. ✅
- AC3 "AnaPlan emits glyph-free phases, all 4 files, Claude==Codex" → verified by inspection:
  4/4 ana-plan files contain `- {phase description matching the scope}`; 0 residual `- [ ]` phase
  glyphs in Step 5; edited regions byte-identical across Claude/Codex (A014). ✅
- AC4 "no instruction tells Verify to tick plan.md; Build guidance coherent" → 0 residual "change
  the phase's checkbox" / "stages plan.md" in ana-verify; 0 residual "plan.md checkboxes" in
  ana-build (A015–A017). ✅
- AC5 "verify-report save (single + multi) does not stage/commit plan.md" → artifact.test.ts
  "verify-report single-save does NOT stage plan.md" and "save-all ... no verify-report-coupled
  plan.md staging" (A009, A010, A011). ✅ (see Deviation A010)
- AC6 "validator enforces Spec per phase, accepts old+new, in-flight plans validate" →
  artifact.test.ts plan-format block, 6 cases (A001–A005, A019). ✅
- AC7 "countPhases unchanged; status display unchanged" → work-state.test.ts, 3 cases
  (A006–A008); `countPhases` and `work.ts:351-372` not modified. ✅
- AC8 "artifacts.mdx no longer describes checkbox updates" → 0 residual "checkbox updates in
  multi-phase" (A018). ✅
- AC9 "Claude and Codex behaviorally identical" → edited regions confirmed identical across
  harnesses for ana-plan, ana-verify, ana-build. ✅
- Implementation "full suite passes, no new lint, specific tests inverted/replaced" → 3589 passed,
  0 failed, 2 skipped; lint clean on changed files; staging test inverted, no-checkbox plan test
  replaced with missing-Spec test. ✅

## Implementation Decisions

- **Validator mirrors countPhases, does not import it.** Per the spec's design decision, I mirrored
  the `## Phases` walk and the `Spec:` regex verbatim with a comment pointing at the canonical copy,
  rather than extending `countPhases` (which would change its `{total, specs}` return contract and
  ripple to status/pr/work consumers, violating AC7).
- **Empty-`## Phases`-section error message.** The re-anchored validator returns a distinct message
  ("No phases found...") for the zero-phase case (A019), separate from the missing-heading message.
- **Pull-defense notice is emitted (not silent).** I included the optional `chalk.yellow` notice
  (guarded by `!options?.json`) so a restore is visible to the developer, matching the existing
  recovery block's logging style.

## Deviations from Contract

### A010: Saving a verify report no longer commits the plan file (bulk save)
**Instead:** The save-all test asserts the verify report commits successfully and that plan.md is
left clean (no uncommitted diff) — not that plan.md is absent from git (`isFileCommitted == false`).
**Reason:** `saveAllArtifacts` stages *every* recognized artifact found on disk in the plan
directory, and plan.md on disk is always classified as the `plan` artifact (artifact.ts:1401).
Therefore the removed multi-save special-case block (`fs.existsSync(planPath) && !artifactPaths.includes(relPlanPath)`)
was **dead code** — its `!artifactPaths.includes(...)` guard was always false because plan.md, when
present, is always already in `artifactPaths`. save-all commits plan.md as a primary artifact
regardless of the block. The literal target `isFileCommitted(plan.md) === false` is therefore not
achievable via save-all without breaking normal artifact saving.
**Outcome:** Functionally equivalent to the contract's intent (AC5: "does not *stage* plan.md" as a
verify-report side-effect). The verify-report-coupled staging is gone; plan.md is committed only as
a normal primary artifact. Removing the block is behavior-preserving. The single-save path (A009),
where the special case was load-bearing and real, is fully satisfied: plan.md is NOT committed.
Verifier should assess whether the contract's A010 target should be re-expressed for the save-all
reality.

## Test Results

### Baseline (before changes)
Command: `(cd packages/cli && pnpm vitest run)`
```
 Test Files  146 passed (146)
      Tests  3582 passed | 2 skipped (3584)
```

### After Changes
Command: `ana test --stage build --slug remove-plan-phase-checkbox` (capture-sealed)
```
✓ captured  counts: 3589 passed, 0 failed, 2 skipped  (verdict: pass)
```
<!-- ana:capture stage=build slug=remove-plan-phase-checkbox counts=3589p/0f/2s verdict=pass sha256=2ceaa394aa470218172de9bd5fdffd5e31dfb1235682603578efe4091a75105a -->

Per-file checkpoints (all passed):
- `pnpm vitest run tests/commands/artifact.test.ts tests/commands/work-state.test.ts` → 212 passed
- `pnpm vitest run tests/commands/work-merge.test.ts` → 24 passed

### Comparison
- Tests added: 7 (3582 → 3589)
- Tests removed: 0
- Regressions: none

### New Tests Written
- artifact.test.ts: new-format plan accepted, multi-phase new-format accepted, empty-`## Phases`
  rejected (3 new validator cases beyond the repurposed existing ones); save-all no-coupled-staging
  (1 new).
- work-state.test.ts: countPhases for old-format, new-format, multi-phase (3 new).
- work-merge.test.ts: autostash-collision completion leaves a clean, uncorrupted tree (1 new).

### Test discrimination note
The work-merge autostash test was verified to be discriminating: with the work.ts restore-from-HEAD
guard temporarily disabled, the test FAILS (the archived plan.md contains `<<<<<<<` conflict
markers, silently committed because `git pull --rebase --autostash` returns exit 0 even when the
autostash pop conflicts). With the guard enabled, it passes. The guard restored before commit.

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
(cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/work-state.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/work-merge.test.ts)
(cd packages/cli && pnpm run lint)
```

## Git History
```
560df7a7 [remove-plan-phase-checkbox] Drop plan.md checkbox mention from artifacts doc
af546cb3 [remove-plan-phase-checkbox] Stop emitting/ticking the plan.md checkbox in agent instructions
85e16de7 [remove-plan-phase-checkbox] Defend merge pull against a tracked-modified plan.md
0af49337 [remove-plan-phase-checkbox] Re-anchor plan validator to Spec-per-phase; drop verify-report plan.md staging
```

## Proof Context

`ana proof context` was run for the three modified source files:
- **artifact-validators.ts**: no proof context found.
- **artifact.ts**: one finding (`fix-false-rejection-archive-C3`) about `.saves.json` being read on
  every `hasOpposingStageAdvanced` call — unrelated to plan.md staging; no `related_assertions`
  overlap this contract.
- **work.ts**: one finding (`fix-merge-json-pollution-C3`): "Pull-recovery guards (2 of 5) not
  directly exercised by any test." This is tangentially relevant — my change adds a *new*
  pull-recovery guard (the plan.md restore) and ships a test that directly exercises it, so it does
  not worsen and slightly improves that coverage concern. No `related_assertions` overlap this
  contract.

## Open Issues

1. **Contract assertion A010 does not match `saveAllArtifacts` reality.** The multi-save
   verify-report→plan.md staging block was dead code, and save-all commits plan.md as a primary
   artifact. The literal A010 target (`isFileCommitted(plan.md) === false`) cannot hold for save-all
   without breaking normal artifact saving. Documented as a deviation; flagged here so the verifier
   and developer can decide whether to re-express A010. (severity: observation)
2. **Cross-feature `@ana` ID collision in work-merge.test.ts.** The file carries pre-existing
   `// @ana A001`–`A009` tags from a *different* feature's contract (the --merge JSON/strategy work).
   My contract reuses IDs A001–A013, so a naive tag scan over this file could mis-attribute those
   pre-existing tags to this contract. My new tags (A012, A013) do not collide. I did not touch the
   pre-existing tags (out of scope; guardrail against modifying unrelated tests). (severity:
   observation)
3. **A014–A018 are content assertions with no unit test.** They are verified by file inspection
   (grep), documented in AC Coverage above, not by an executable test. This matches the spec's
   testing strategy (no agent-file unit tests requested). (severity: observation)

Forced second pass — re-examined the diff for unused imports/variables (none; the deleted staging
blocks left no dead `relPlanPath`/`planPath`), unhandled edge cases (Depends-on sub-lines correctly
excluded by the unindented-`- ` detection; verified by the multi-phase validator and countPhases
tests), and assumptions about external state (the pull-defense porcelain check tolerates both
`??` untracked and modified statuses). The three items above are the complete set.
