# Scope: Remove the non-authoritative plan.md phase checkbox

**Created by:** Ana
**Date:** 2026-06-08

## Intent

Make `plan.md` phase status honest by deleting the hand-maintained `- [ ]`/`- [x]`
checkbox entirely. Phase completion is currently tracked twice: once mechanically
(build/verify artifacts + seals — the only source `ana work status` and `countPhases`
actually read) and once as an agent-hand-edited markdown checkbox that **no code reads**.
The redundant copy has a cross-tree commit path that mis-fires, producing split-brain
state and a dirty working tree that can block `ana work complete --merge`.

Resolves GitHub issue #308. The issue proposed three options (preferring "stop
maintaining the checkbox"); we go further — full removal — because stopping maintenance
alone leaves a checkbox that *reliably lies* (every completed phase would show `- [ ]`
forever). A plain phase list with a `Spec:` ref describes the plan without asserting a
false status. Status stays where it is authoritative: `work.ts:351-372`, artifact-derived.

## Complexity Assessment

- **Kind:** fix
- **Size:** medium
- **Surface:** cli
- **Files affected:** 15 —
  - 8 agent files (build + verify × {templates, dogfood} × {claude, codex}): remove the AnaVerify tick instruction
  - 4 AnaPlan files (ana-plan.md × {templates, dogfood} × {claude, codex}): change emitted plan format
  - `packages/cli/src/commands/artifact.ts`: delete the plan.md staging (2 sites)
  - `packages/cli/src/commands/artifact-validators.ts`: re-anchor `validatePlanFormat`
  - `packages/cli/src/commands/work.ts`: defense-in-depth before the autostash pull
  - `website/content/docs/concepts/artifacts.mdx`: doc line :21
- **Blast radius:** Two platforms (Claude + Codex) must stay behaviorally identical.
  Dogfood agents must be updated in lockstep with templates (templates/ is source of
  truth, dogfood regenerates on re-init, but update both now so the dogfood install is
  correct immediately). `countPhases` is NOT touched. The `Spec:` line format is NOT
  touched. In-flight active plans on disk (cli-telemetry has a checkbox plan.md) must
  still validate and count.
- **Estimated effort:** ~2-3 hours. Mostly mechanical edits across parallel files; the
  one design-judgment piece is the validator re-anchoring.
- **Multi-phase:** no

## Approach

Delete the redundant phase-status copy and the machinery that maintains and commits it,
then make the validator enforce the *real* phase contract (a `Spec:` ref per phase in the
`## Phases` section) instead of the checkbox glyph that was standing in for it.

Three coordinated moves:

1. **Stop producing and maintaining the glyph.** AnaPlan stops emitting `- [ ]`; AnaVerify
   stops ticking it. Phases become a plain list, each with its `Spec:` ref.
2. **Remove the commit path.** Delete the special-case plan.md staging in `ana artifact
   save verify-report` — nothing should touch plan.md after Plan writes it. This is the
   band-aid that mis-fires across trees; removing it is the disease cure, not the templates.
3. **Re-anchor the contract + defend in depth.** The validator's load-bearing check
   (`Spec:` per phase) is currently coupled to checkbox lines; re-anchor it to the
   `## Phases` structure so dropping the glyph doesn't silently drop enforcement, and accept
   both old and new formats. Separately, harden `ana work complete` so a tracked-modified
   non-authoritative plan.md (left behind by items started before this fix) can't block the
   merge pull.

A non-technical summary: phase status was written down in two places; one of them was
copied by hand, lied when it drifted, and gummed up the merge. We delete that copy and
keep the one the tools actually trust.

## Acceptance Criteria

- AC1: Completing a multi-phase work item leaves **no** uncommitted/modified `plan.md` on any tree (main or worktree).
- AC2: `ana work complete --merge` is never blocked by `plan.md` state, including for items started *before* this fix (which already have a dirty/split-brain plan.md on disk).
- AC3: AnaPlan emits phases as a plain list with a `Spec:` ref per phase and **no** `- [ ]`/`- [x]` glyph, in all 4 ana-plan files, behaviorally identical for Claude and Codex.
- AC4: No agent instruction anywhere tells AnaVerify to edit/tick plan.md checkboxes; AnaBuild's "don't touch plan.md" guidance remains coherent (no dangling reference to a checkbox AnaVerify no longer maintains).
- AC5: `ana artifact save verify-report` (single-save and multi-save paths) does **not** stage or commit `plan.md`.
- AC6: `validatePlanFormat` enforces a `Spec:` ref per phase against the `## Phases` section and accepts **both** old (checkbox) and new (no-checkbox) plans. In-flight plans on disk still validate and count.
- AC7: `countPhases` behavior is unchanged; `ana work status` phase display is unchanged (already artifact-derived).
- AC8: `website/content/docs/concepts/artifacts.mdx:21` no longer describes plan.md checkbox updates.
- AC9: Claude and Codex agent instructions remain behaviorally identical (platform-parity constraint).

## Edge Cases & Risks

- **In-flight plans started before the fix.** Their plan.md still contains `- [ ]`/`- [x]`
  and may be tracked-modified on a tree. Two failure modes: (a) the validator must still
  accept them; (b) `ana work complete --merge`'s `git pull --rebase --autostash`
  (`work.ts:749`) must not collide on a tracked-modified plan.md. The existing untracked-file
  recovery (`work.ts:754-846`) does NOT cover this — it only handles *untracked* files.
- **Validator silently dropping enforcement.** The current `Spec:` check (`artifact-validators.ts:66-78`)
  only runs on lines matching the checkbox pattern. If the checkbox requirement is removed
  without re-anchoring `Spec:` enforcement to the phase-list structure, plans with missing
  `Spec:` refs would start passing — a regression in the real contract. The `Spec:` line
  format (`Spec:\s*(spec(?:-\d+)?\.md)`) must stay verbatim; only the glyph goes.
- **Platform drift.** Editing 12 agent files by hand risks Claude/Codex divergence. The two
  must read behaviorally identically after the change.
- **Templates vs dogfood asymmetry.** Re-init overwrites agent bodies from stock, so templates/
  is the real source of truth — but the dogfood copies must be edited now too, or our own
  install is wrong until the next re-init.
- **Doc/template references to "stages plan.md too."** The agent text documents the staging
  ("this stages plan.md too, pushes automatically"). When the staging code is deleted, those
  description lines (ana-verify save-command bullets) must be corrected, not just the tick step.

## Rejected Approaches

- **Option 1 — stop maintaining the checkbox but keep the glyph (issue's preferred option).**
  Rejected. AnaPlan would still write `- [ ]` and AnaVerify would stop ticking it, so every
  completed phase shows `- [ ]` forever — a checkbox affordance that reliably implies "not done"
  on done work. That is worse than today's intermittent `[x]`: it half-cures the disease
  (removes the maintenance, keeps the misleading status). The disease is a non-authoritative
  phase-status carried out-of-band; only full removal makes plan.md honest.
- **Tick mechanically inside `ana artifact save` instead of removing (issue option 2).**
  Rejected. Keeps a second source of truth that nothing reads, just makes it consistent.
  Adds code to manage a problem the elegant solution deletes.
- **Split the AnaPlan/validator cleanup into a follow-up.** Rejected. We're already editing
  all 8 build/verify agent files for the bug fix; the format change touches AnaPlan's 4 files
  and the validator. Bundling avoids touching the same agent files twice and avoids shipping
  the always-`[ ]` misleading residual in the interim.

## Open Questions

- The validator re-anchoring is the one design-judgment call: how to walk the `## Phases`
  section and enforce a `Spec:` ref per phase without the checkbox glyph as the line anchor.
  `countPhases` (`work-state.ts:111-133`) already does this walk for counting — Plan should
  decide whether to share that walk or mirror it in the validator. (Sharing is the
  "remove duplication" move; mirroring keeps the validator self-contained. Plan's call.)

## Exploration Findings

### Patterns Discovered
- `artifact.ts:1201-1208` — single-save (`saveArtifact`) special-cases verify-report to `git add` plan.md.
- `artifact.ts:1630-1638` — multi-save (`saveAllArtifacts`) does the same. Both are the commit path the issue claimed didn't exist.
- `artifact-validators.ts:52-81` — `validatePlanFormat`: requires `## Phases`, requires ≥1 checkbox, and checks `Spec:` **only on checkbox lines** (lines 66-78). The `Spec:` enforcement is coupled to the glyph.
- `work-state.ts:111-133` — `countPhases` parses `## Phases` and matches `Spec:\s*(spec(?:-\d+)?\.md)`. Checkbox-agnostic. This is the real phase contract.
- `work.ts:351-372` — phase status display derived from build_report_N/verify_report_N existence. Not from `[x]`.
- `work.ts:745-847` — post-merge pull: `git pull --rebase --autostash` at :749; untracked-file recovery at :754-846 (untracked-only, does not cover tracked-modified plan.md).
- `ana-plan.md:180-200` (all 4 locations) — AnaPlan emits `## Phases` with `- [ ] {desc}` / `  - Spec: spec-N.md`.

### Constraints Discovered
- [TYPE-VERIFIED] `Spec:` line format (`work-state.ts:125`) — `Spec:\s*(spec(?:-\d+)?\.md)`. Load-bearing. Must not change.
- [OBSERVED] Only `[x]` in CLI source is an error-message string (`artifact-validators.ts:63`). `grep -rn "\[x\]" packages/cli/src` returns that one line. Nothing reads checked state.
- [OBSERVED] Agent text documents the staging: ana-verify "this stages plan.md too, pushes automatically" (claude :475/541, codex :468/534, dogfood mirrors). These description lines must be corrected when the code is deleted.
- [OBSERVED] `check.ts:1377` is **setup** phases (confirm/enrich/principles), NOT plan phases — unrelated to this scope. (Issue's reading list mis-pointed here.)

### Test Infrastructure
- `tests/commands/artifact.test.ts` — validator + save behavior, including plan.md staging.
- `tests/commands/work-merge.test.ts`, `tests/commands/work-ci-mocked.test.ts`, `tests/commands/work.test.ts` — multi-phase completion + merge paths.
- `tests/commands/artifact-provenance.test.ts` — also exercises verify-report save.
- `tests/commands/work-state.test.ts` — `countPhases` / phase resolution.

## For AnaPlan

### Structural Analog
`artifact.ts` save paths are the closest structural match for the staging deletion — two
near-identical special-case blocks (`:1201-1208` and `:1630-1638`) that must be removed in
lockstep, mirroring how the codebase already keeps single-save and multi-save behavior
parallel. For the validator change, `countPhases` (`work-state.ts:111-133`) is the
structural analog for "walk `## Phases`, enforce per-phase `Spec:`" — reuse or mirror its
exact parse.

### Relevant Code Paths
- `packages/cli/src/commands/artifact.ts:1201-1208, 1630-1638` — delete plan.md staging.
- `packages/cli/src/commands/artifact-validators.ts:52-81` — re-anchor validator.
- `packages/cli/src/commands/work-state.ts:111-133` — `countPhases` (reference; do not change).
- `packages/cli/src/commands/work.ts:745-847` — pull path; add tracked-modified plan.md normalization before/around `:749`.
- `packages/cli/src/commands/work.ts:351-372` — artifact-derived phase display (reference; unchanged).

### Agent Files (12 total — keep Claude/Codex identical, templates + dogfood in lockstep)
Remove AnaVerify tick instruction (verify, 4 files):
- `packages/cli/templates/.claude/agents/ana-verify.md` (:474 tick step, :475 + :541 "stages plan.md" description, :503 + :507 checkbox writes)
- `packages/cli/templates/.codex/agents/ana-verify.md` (:467, :468, :496, :500, :534)
- `.claude/agents/ana-verify.md` (dogfood; :474, :475, :503, :507, :541)
- `.codex/agents/ana-verify.md` (dogfood; :467, :468, :496, :500, :534)

Reconcile AnaBuild "don't touch checkboxes" wording (build, 4 files) — the instruction
should still say "don't touch plan.md" but must not reference a checkbox AnaVerify no longer maintains:
- `packages/cli/templates/.claude/agents/ana-build.md` (:436, :484)
- `packages/cli/templates/.codex/agents/ana-build.md` (:429, :477)
- `.claude/agents/ana-build.md` (dogfood; :436, :484)
- `.codex/agents/ana-build.md` (dogfood; :429, :477)

Change AnaPlan emitted format (plan, 4 files) — `## Phases` as plain list + `Spec:`, no glyph:
- `packages/cli/templates/.claude/agents/ana-plan.md` (:180-200)
- `packages/cli/templates/.codex/agents/ana-plan.md`
- `.claude/agents/ana-plan.md` (dogfood)
- `.codex/agents/ana-plan.md` (dogfood)

### Doc
- `website/content/docs/concepts/artifacts.mdx:21` — remove "checkbox updates in multi-phase" from the ana-verify "Read by" line.

### Patterns to Follow
- Mirror the existing single-save/multi-save parallelism in `artifact.ts` — both staging blocks go.
- For the validator, follow `countPhases`'s exact `## Phases` walk and `Spec:` regex.
- For the pull defense, follow the existing recovery block's structure (`work.ts:754-846`) but for the tracked-modified case: plan.md is non-authoritative, so restoring it (`git checkout -- plan.md` against HEAD, or discarding the local diff) before the autostash pull is acceptable — confirm the exact mechanism in Plan.

### Known Gotchas
- The `Spec:` enforcement in the validator is coupled to checkbox lines today — decoupling without re-anchoring silently drops the real check. This is the trap.
- Re-init overwrites agent bodies from stock (templates = source of truth). Dogfood copies must be edited now too, or our own install lies until next re-init.
- Don't change the `Spec:` line format; `countPhases` depends on it verbatim.
- The "stages plan.md too, pushes automatically" lines in ana-verify are *descriptions of the code being deleted* — correct them, don't leave them dangling.

### Things to Investigate (design judgment)
- Validator re-anchoring: share `countPhases`'s walk vs. mirror it in `artifact-validators.ts`. (Sharing removes duplication; mirroring keeps the validator dependency-free. Plan decides.)
- Pull defense mechanism: exact way to normalize a tracked-modified non-authoritative plan.md before `git pull --rebase --autostash` — restore from HEAD vs. discard local diff vs. stash-and-drop — without harming a legitimately-edited artifact in the same dir.

### Tests for Plan to assert
- Old-format plan (with `- [ ]`/`- [x]`) validates AND counts correctly.
- New-format plan (plain list + `Spec:`, no glyph) validates AND counts correctly.
- A plan missing a `Spec:` ref on a phase FAILS validation (proves the real contract is still enforced after decoupling).
- Multi-phase completion leaves no modified/uncommitted plan.md on any tree.
- `ana work complete --merge` succeeds when plan.md is tracked-modified (in-flight-item safety).
- `ana artifact save verify-report` does not stage plan.md (single-save and multi-save).
