# Spec: Remove the non-authoritative plan.md phase checkbox

**Created by:** AnaPlan
**Date:** 2026-06-08
**Scope:** .ana/plans/active/remove-plan-phase-checkbox/scope.md

## Approach

Phase completion is tracked twice: mechanically (build/verify artifacts + seals — the
only source `ana work status` and `countPhases` read) and as a hand-edited `- [ ]`/`- [x]`
markdown checkbox that **no code reads**. The redundant copy has a cross-tree commit path
(verify-report save stages plan.md) that mis-fires, producing a dirty working tree that can
block `ana work complete --merge`. The fix removes the redundant copy and the machinery that
maintains/commits it, then re-anchors the validator to enforce the *real* phase contract
(a `Spec:` ref per phase) instead of the checkbox glyph that was standing in for it.

Five coordinated moves, one spec (tightly coupled — the same agent files and validator are
touched once):

1. **Remove the commit path.** Delete the two `verify-report → git add plan.md` special-case
   blocks in `artifact.ts`. Nothing should touch plan.md after Plan writes it.
2. **Re-anchor the validator.** Rewrite `validatePlanFormat` to walk the `## Phases` section
   and require a `Spec:` ref per phase, accepting **both** old (checkbox) and new (no-glyph)
   formats. Drop the checkbox requirement without dropping `Spec:` enforcement.
3. **Defend the merge pull.** Before the autostash pull in `ana work complete`, normalize a
   tracked-modified non-authoritative plan.md by restoring it from HEAD.
4. **Change the emitted format.** AnaPlan stops emitting `- [ ]`; AnaVerify stops ticking;
   AnaBuild's "don't touch plan.md" wording is reconciled. 12 agent files, in lockstep.
5. **Fix the doc.** Remove the checkbox mention from `artifacts.mdx`.

### Design decisions (the two judgment calls)

**Validator re-anchoring — mirror, not share.** Rewrite `validatePlanFormat` to treat every
**unindented** `- ` line inside the `## Phases` section as a phase entry (this matches BOTH
`- [ ] desc` and plain `- desc` — the glyph is just leading text), require ≥1 phase, and
require a `Spec:` ref between each phase and the next phase (or section end). Mirror
`countPhases`'s `Spec:` regex **verbatim** (`/Spec:\s*(spec(?:-\d+)?\.md)/`, `work-state.ts:125`)
with a comment pointing to the canonical copy. Do NOT import from or modify `work-state.ts`:
`countPhases` returns `{total, specs}` for *counting* and is consumed by status/pr/work —
extending it to also report "phase missing spec" would change its return contract and ripple
to those consumers, violating AC7. The genuine duplication is one regex on a frozen,
load-bearing format; the comment keeps the two copies in lockstep.

**Pull defense — restore from HEAD, scoped to plan.md only.** Before the
`git pull --rebase --autostash` (`work.ts:749`), if this slug's plan.md is tracked-*modified*
(uncommitted working-tree diff), run `git checkout HEAD -- {relPlanPath}` to discard the
non-authoritative local diff. Autostash then has nothing to stash for it, so the rebase can't
collide on plan.md. Scope the restore to **only** that one path — never the sibling artifacts
(scope/spec/contract) — so a legitimately-edited artifact is untouched. Safe because plan.md
is non-authoritative and fixed after Plan writes it. This is defense-in-depth: with the
staging removed (move 1), plan.md should never be modified going forward, but in-flight items
started before this fix may already carry a dirty plan.md on disk.

### Open questions from scope, resolved

- *"Share `countPhases`'s walk or mirror it in the validator?"* → **Mirror.** See above.
- *"Exact mechanism to normalize a tracked-modified plan.md?"* → **Restore from HEAD**
  (`git checkout HEAD -- {plan.md}`), scoped to the single plan.md path. Not stash-and-drop
  (touches the whole tree), not a blanket discard (could harm a real artifact edit).

## Output Mockups

**New plan.md format AnaPlan emits (single-phase):**
```markdown
# Plan: {slug}

**Branch:** {branchPrefix}{slug}

## Phases

- {phase description matching the scope}
  - Spec: spec.md
```

**New plan.md format (multi-phase):**
```markdown
## Phases

- {phase 1 description}
  - Spec: spec-1.md
- {phase 2 description}
  - Spec: spec-2.md
  - Depends on: Phase 1
```

**Validator behavior (no user-visible output change for valid plans):**
- Valid (old or new format) → `validatePlanFormat` returns `null`, save proceeds.
- Phase missing a `Spec:` ref → returns an error string; `ana artifact save plan` prints
  `Error: plan.md format invalid` and exits 1 (existing surfacing path, unchanged).

## File Changes

> The machine-readable change list is in contract.yaml `file_changes`. This section is prose
> context. All actions verified against the filesystem at plan time.

### packages/cli/src/commands/artifact.ts (modify)
**What changes:** Delete the two `verify-report → git add plan.md` special-case blocks:
single-save (`saveArtifact`, the `if (typeInfo.baseType === 'verify-report')` block staging
plan.md) and multi-save (`saveAllArtifacts`, the `if (artifacts.some(... 'verify-report'))`
block). Remove the blocks entirely — do not leave dead variables (`relPlanPath`, `planPath`).
**Pattern to follow:** The existing single-save/multi-save parallelism — both blocks go in
lockstep, mirroring how the file keeps the two save paths behaviorally parallel.
**Why:** This is the cross-tree commit path that mis-fires and dirties the working tree.
Removing it (not patching the agent text) is the disease cure.

### packages/cli/src/commands/artifact-validators.ts (modify)
**What changes:** Rewrite `validatePlanFormat` body. Keep the `## Phases` heading check.
Replace the "≥1 checkbox" check and the checkbox-coupled `Spec:` check with a phase-list
walk (see Approach → Validator re-anchoring). Keep the function signature and JSDoc shape.
**Pattern to follow:** `countPhases` (`work-state.ts:111-133`) — the same `## Phases` section
walk (start at `## Phases`, stop at the next `## `) and the same `Spec:` regex verbatim.
**Why:** The current `Spec:` enforcement only runs on checkbox lines. Dropping the checkbox
without re-anchoring would silently stop enforcing `Spec:` refs — a regression in the real
contract. This is the trap the scope flagged.

### packages/cli/src/commands/work.ts (modify)
**What changes:** Add a normalization block inside the `if (remotes)` block, immediately
before the `git pull --rebase --autostash` at the current `work.ts:749`. If this slug's
plan.md is tracked-modified, restore it from HEAD (see Approach → Pull defense). Do not touch
the existing untracked-file recovery (`:754-846`) — it handles a different (untracked) case.
**Pattern to follow:** The existing recovery block's structure and the `runGit` wrapper for
git calls; build the rel path the same way (`.ana/plans/active/${slug}/plan.md`).
**Why:** The existing recovery only covers *untracked* files. A tracked-modified plan.md left
by an in-flight item predating this fix collides with the autostash rebase and blocks the merge.

### packages/cli/templates/.claude/agents/ana-plan.md (modify)
### packages/cli/templates/.codex/agents/ana-plan.md (modify)
### .claude/agents/ana-plan.md (modify)
### .codex/agents/ana-plan.md (modify)
**What changes:** In the Step 5 plan.md format section, change both code blocks (single-spec
and multi-spec) so phase lines are plain list items (`- {desc}`) with no `- [ ]` glyph; the
`Spec:` sub-line is unchanged. Rewrite the two "mandatory" sentences (the one after the Step 5
code blocks and the one in the "Plan Format Reference" section) to anchor on the real contract:
the `## Phases` heading and a `Spec:` ref per phase are mandatory — the CLI parses this
structure — drop the words "checkbox" and "`- [ ]`". **Do NOT touch** the Acceptance Criteria
`- [ ]` checkboxes in the Spec Format section, nor the `- [ ]` in the "Genuinely unresolvable"
example — those are spec content, not the plan.md phase format.
**Pattern to follow:** Keep Claude and Codex behaviorally identical; edit templates and dogfood
copies in lockstep with the same wording.
**Why:** AnaPlan must stop producing the glyph that no code reads (AC3).

### packages/cli/templates/.claude/agents/ana-verify.md (modify)
### packages/cli/templates/.codex/agents/ana-verify.md (modify)
### .claude/agents/ana-verify.md (modify)
### .codex/agents/ana-verify.md (modify)
**What changes:** In "Multi-Phase Handling": delete the step that says "Update plan.md: change
the phase's checkbox from `[ ]` to `[x]`" and renumber the remaining steps; change the Save
step's parenthetical "(this stages plan.md too, pushes automatically)" to "(pushes
automatically)". In "What You Do NOT Do": change "The only files you write are verify_report.md
and plan.md checkbox updates" to "The only file you write is verify_report.md"; replace the
"Don't update plan.md beyond checkboxes. Flip `[ ]` to `[x]`..." bullet with a bullet stating
Verify does not touch plan.md at all (it's written once by AnaPlan). In "Reference": change
the `ana artifact save verify-report` description "stages plan.md if present, pushes" to
"pushes" (drop the plan.md staging mention — that code is being deleted).
**Pattern to follow:** Claude/Codex identical; templates + dogfood in lockstep.
**Why:** No instruction should tell Verify to edit plan.md, and the "stages plan.md"
descriptions document code being deleted — leaving them dangling would lie (AC4).

### packages/cli/templates/.claude/agents/ana-build.md (modify)
### packages/cli/templates/.codex/agents/ana-build.md (modify)
### .claude/agents/ana-build.md (modify)
### .codex/agents/ana-build.md (modify)
**What changes:** Two references. In Multi-Phase Handling: "Do NOT update plan.md checkboxes.
That's AnaVerify's job after verification." → "Do NOT touch plan.md. AnaPlan owns it." In
"What You Do NOT Do": "**Don't update plan.md checkboxes.** That's AnaVerify's job." → a bullet
saying Build doesn't touch plan.md (AnaPlan owns it). Keep the surrounding "Do NOT read other
specs" guidance intact.
**Pattern to follow:** Claude/Codex identical; templates + dogfood in lockstep.
**Why:** AnaBuild's "don't touch plan.md" guidance must stay coherent and not reference a
checkbox AnaVerify no longer maintains (AC4).

### website/content/docs/concepts/artifacts.mdx (modify)
**What changes:** Line 21 — "**Read by:** developer, ana-build, ana-verify (checkbox updates
in multi-phase)." → "**Read by:** developer, ana-build, ana-verify." Drop the parenthetical.
**Pattern to follow:** N/A (single-line doc edit).
**Why:** The doc describes plan.md checkbox updates that no longer happen (AC8).

## Acceptance Criteria

From scope (verified against current commands/architecture), plus implementation criteria:

- [ ] AC1: Completing a multi-phase work item leaves no uncommitted/modified plan.md on any tree.
- [ ] AC2: `ana work complete --merge` is never blocked by plan.md state, including for items
      started before this fix (already-dirty/split-brain plan.md on disk).
- [ ] AC3: AnaPlan emits phases as a plain list with a `Spec:` ref per phase and no
      `- [ ]`/`- [x]` glyph, in all 4 ana-plan files, behaviorally identical for Claude and Codex.
- [ ] AC4: No agent instruction tells AnaVerify to edit/tick plan.md checkboxes; AnaBuild's
      "don't touch plan.md" guidance remains coherent (no dangling checkbox reference).
- [ ] AC5: `ana artifact save verify-report` (single-save and multi-save) does not stage or
      commit plan.md.
- [ ] AC6: `validatePlanFormat` enforces a `Spec:` ref per phase against the `## Phases`
      section and accepts both old (checkbox) and new (no-checkbox) plans; in-flight plans on
      disk still validate.
- [ ] AC7: `countPhases` behavior is unchanged; `ana work status` phase display is unchanged.
- [ ] AC8: `website/content/docs/concepts/artifacts.mdx:21` no longer describes plan.md
      checkbox updates.
- [ ] AC9: Claude and Codex agent instructions remain behaviorally identical.
- [ ] Implementation: full test suite passes (`(cd packages/cli && pnpm vitest run)`); no new
      lint errors. Existing test "verify-report save also stages plan.md if it exists"
      (artifact.test.ts:683) is INVERTED to assert plan.md is NOT staged. The "rejects plan.md
      without checkboxes" test (artifact.test.ts:827) is updated — a no-checkbox plan with a
      valid `Spec:` per phase must now PASS; replace it with a test that a plan with a phase
      missing its `Spec:` ref FAILS.

## Testing Strategy

- **Unit tests (validator):** Follow the existing `describe('plan format validation')` block
  in `artifact.test.ts` (drives `validatePlanFormat` via `saveArtifact('plan', ...)`).
  - Old-format plan (`- [ ] Phase` + `Spec:`) → passes (keep existing "accepts valid plan.md").
  - New-format plan (`- Phase` + `Spec:`, no glyph) → passes (NEW).
  - Multi-phase new-format plan (two `- Phase` items each with a `Spec:`) → passes (NEW).
  - Plan with a phase line but no `Spec:` ref before the next phase → fails (replaces the
    "rejects plan.md without checkboxes" test; proves the real contract is still enforced).
  - Missing `## Phases` heading → still fails (keep existing).
- **countPhases regression:** Add a focused test (new file `tests/commands/work-state.test.ts`
  or co-locate where `countPhases` consumers are tested) asserting `countPhases` returns the
  correct `{total, specs}` for both old-format and new-format plans — proving AC7 (counting is
  format-agnostic and unchanged).
- **Staging behavior:** In `artifact.test.ts`, invert the existing "verify-report save also
  stages plan.md" test (line 683) to assert plan.md is NOT committed by a verify-report save;
  cover both single-save and multi-save paths.
- **Pull defense / merge:** Follow `tests/commands/work-merge.test.ts` patterns. Add a test:
  with a tracked-modified plan.md present, `ana work complete --merge` succeeds and leaves no
  modified plan.md. Add/confirm a multi-phase completion test asserting no modified plan.md
  remains on the tree afterward.
- **Edge cases:** new-format plan where `Depends on:` sub-lines are present (must not be
  miscounted as phases — they're indented sub-items); plan with a phase whose `Spec:` is on the
  line immediately following vs. two lines below.

## Dependencies

None. All files exist and are listed in File Changes.

## Constraints

- **Platform parity:** Claude and Codex agent instructions must be behaviorally identical.
- **Templates = source of truth; dogfood in lockstep.** Re-init overwrites agent bodies from
  templates, but edit the dogfood `.claude`/`.codex` copies now too so this install is correct
  immediately (don't wait for the next re-init).
- **Frozen format:** Do NOT change the `Spec:` line format. `countPhases` (`work-state.ts:125`)
  depends on `/Spec:\s*(spec(?:-\d+)?\.md)/` verbatim; the validator must mirror it exactly.
- **Do NOT modify `countPhases`** or `work.ts:351-372` (artifact-derived phase display).
- **Backward compatibility:** the validator must accept old-format (checkbox) plans already on
  disk (e.g., cli-telemetry's plan.md).

## Gotchas

- **This plan's own plan.md uses the OLD checkbox format on purpose.** The current (pre-build)
  validator still requires a checkbox, so the new format would fail to save until this build
  merges. Don't "fix" it.
- **The `Spec:` enforcement is coupled to checkbox lines today.** Decoupling without
  re-anchoring silently drops the real check. Re-anchor to the phase-list walk.
- **Acceptance-criteria checkboxes in ana-plan.md are NOT the plan.md phase format.** The
  `- [ ]` lines in the Spec's Acceptance Criteria section (and the "Genuinely unresolvable"
  example) are spec content — leave them untouched. Only the two Step-5 format code blocks and
  the two "mandatory checkbox" sentences change.
- **"stages plan.md too / stages plan.md if present" lines describe deleted code.** Correct
  them when the staging is removed; don't leave dangling descriptions.
- **`Depends on:` sub-lines** are indented list items, not phases — the unindented-`- `
  detection must exclude them (it does, since they start with whitespace).
- **No dead variables** after deleting the staging blocks (`relPlanPath`/`planPath`).

## Build Brief

### Rules That Apply
- All local imports use `.js` extensions and `node:` prefix for built-ins. Omitting `.js`
  compiles but crashes the built CLI at runtime.
- `import type` for type-only imports, separate from value imports.
- Explicit return types on exported functions; `@param`/`@returns` JSDoc on exported functions
  (pre-commit lint enforces this) — `validatePlanFormat` keeps its existing JSDoc.
- Commands surface errors via `chalk.red` + `process.exit(1)`; the validator returns an error
  string (no CLI deps in `artifact-validators.ts` — keep it pure).
- Prefer early returns over nested conditionals.
- Edit Claude and Codex agent files identically; edit templates and dogfood copies in lockstep.

### Pattern Extracts

**`countPhases` — the `## Phases` walk and `Spec:` regex to mirror (`work-state.ts:111-133`):**
```ts
export function countPhases(planContent: string): { total: number; specs: string[] } {
  const lines = planContent.split('\n');
  const specs: string[] = [];
  let inPhases = false;

  for (const line of lines) {
    if (line.trim() === '## Phases') {
      inPhases = true;
      continue;
    }
    if (inPhases && line.startsWith('## ')) {
      break; // next section
    }
    if (inPhases) {
      const specMatch = line.match(/Spec:\s*(spec(?:-\d+)?\.md)/);
      if (specMatch && specMatch[1]) {
        specs.push(specMatch[1]);
      }
    }
  }

  return { total: specs.length, specs };
}
```

**Current `validatePlanFormat` to rewrite (`artifact-validators.ts:52-81`):**
```ts
export function validatePlanFormat(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check for ## Phases heading
  if (!content.includes('## Phases')) {
    return "Missing '## Phases' heading. Plan must contain a '## Phases' section with checkbox items.";
  }

  // Check for at least one checkbox
  const checkboxPattern = /- \[([ x])\]/;
  if (!checkboxPattern.test(content)) {
    return "No checkbox items found. Plan must contain at least one '- [ ]' or '- [x]' checkbox.";
  }

  // Check that checkbox lines contain Spec: reference
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue; // noUncheckedIndexedAccess guard
    if (checkboxPattern.test(line)) {
      // Check this line and next 2 lines for Spec: reference
      const nextLines = lines.slice(i, i + 3).join('\n');
      if (!nextLines.includes('Spec:')) {
        return `Checkbox item "${line.trim()}" is missing a 'Spec:' reference. Each phase must reference its spec file.`;
      }
    }
  }

  return null; // valid
}
```
Re-anchor: keep the `## Phases` check; replace the checkbox checks with a walk that (a)
collects unindented `- ` lines within the `## Phases` section as phase entries, (b) returns an
error if there are zero phases, (c) for each phase entry, checks the lines from that phase up
to the next phase (or section end) for a `Spec:` ref using the verbatim mirrored regex, and
errors if absent. Note `noUncheckedIndexedAccess` is on — guard `lines[i]` access.

**Single-save staging block to delete (`artifact.ts:1201-1208`):**
```ts
    // Special case: verify-report also stages plan.md if it exists
    if (typeInfo.baseType === 'verify-report') {
      const relPlanPath = path.join('.ana', 'plans', 'active', slug, 'plan.md');
      if (fs.existsSync(path.join(projectRoot, relPlanPath))) {
        runGit(['add', relPlanPath], { cwd: projectRoot });
        stagedPaths.push(relPlanPath);
      }
    }
```

**Multi-save staging block to delete (`artifact.ts:1630-1638`):**
```ts
    // Special case: if verify-report exists, also stage plan.md
    if (artifacts.some(a => a.typeInfo.baseType === 'verify-report')) {
      const planPath = path.join(planDir, 'plan.md');
      const relPlanPath = path.relative(projectRoot, planPath);
      if (fs.existsSync(planPath) && !artifactPaths.includes(relPlanPath)) {
        runGit(['add', planPath], { cwd: projectRoot });
        stagedPaths.push(relPlanPath);
      }
    }
```

**Pull path — insert normalization before this (`work.ts:745-749`):**
```ts
  // 4. Pull latest to get merged content
  {
    const remotes = runGit(['remote'], { cwd: projectRoot }).stdout;
    if (remotes) {
      let pullResult = runGit(['pull', '--rebase', '--autostash'], { cwd: projectRoot });
```
Add, just before the `let pullResult = ...` line: detect whether
`.ana/plans/active/${slug}/plan.md` is tracked-modified (e.g.
`git status --porcelain -- {relPlanPath}` returns a line whose status is a modification, not
`??` untracked), and if so `runGit(['checkout', 'HEAD', '--', relPlanPath], { cwd: projectRoot })`.
Scope strictly to that one path. A brief `chalk.yellow` notice (guarded by `!options?.json`,
matching the existing recovery's logging) is acceptable but optional.

### Proof Context
Run `ana proof context` for the affected files if you want institutional memory. No active
proof findings were surfaced for these files at plan time. State explicitly in the build report
if `ana proof context {file}` returns findings whose `related_assertions` overlap this contract.

### Checkpoint Commands
Surface is `cli`. Per-file checkpoint (fast):
- After `artifact-validators.ts` + `artifact.test.ts` edits:
  `(cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts)` — Expected: all pass,
  including the new/updated validator + staging tests.
- After `work.ts` + merge-test edits:
  `(cd packages/cli && pnpm vitest run tests/commands/work-merge.test.ts)` — Expected: all pass.
- After all changes (baseline): `(cd packages/cli && pnpm vitest run)` — Expected: 3582+ tests
  pass (existing 3582 minus replaced tests plus new ones; no regressions).
- Lint: `(cd packages/cli && pnpm run lint)` — Expected: clean.

### Build Baseline
Run `(cd packages/cli && pnpm vitest run)` and record exact counts.
- Current tests: 3582 passed, 2 skipped (3584 total)
- Current test files: 146
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~3585+ (one staging test inverted in place, one validator test
  replaced in place, ~3-4 new validator/countPhases/merge tests added). Net positive.
- Regression focus: `artifact.test.ts` (validator + staging), `work-merge.test.ts`,
  `work-ci-mocked.test.ts`, `work.test.ts`, `artifact-provenance.test.ts` (also saves
  verify-report). Any test asserting plan.md is committed by a verify-report save must flip.
