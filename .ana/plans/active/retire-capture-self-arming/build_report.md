# Build Report: Retire Capture-Gate Self-Arming — Drive the Gate from a Committed Config Flag

**Created by:** AnaBuild
**Date:** 2026-06-06
**Spec:** .ana/plans/active/retire-capture-self-arming/spec.md
**Branch:** feature/retire-capture-self-arming

## What Was Built

For each file created, modified, or deleted:

- `packages/cli/src/utils/capture-state.ts` (deleted): Removed the entire arming module — `isArmed`, `armCapture`, the `CaptureState` interface, and all `.ana/state/capture.json` read/write. This is the invisible per-working-copy state the scope exists to remove.
- `packages/cli/tests/utils/capture-state.test.ts` (deleted): Its subject is gone (6 arming tests). The undefined-safe default behavior is re-expressed as new-contract A005 against `isCaptureGateEnabled`.
- `packages/cli/src/utils/capture-marker.ts` (modified): Renamed the `evaluateCaptureGate` option `armed → enabled` (and `opts.armed → opts.enabled`). Block logic is byte-identical (same validator loop, same warn/error partition). Rewrote the JSDoc to describe config enablement instead of Phase-1/Phase-2 arming.
- `packages/cli/src/commands/artifact.ts` (modified): Removed the `capture-state.js` import. Added exported `isCaptureGateEnabled(projectRoot)` — reads `ana.json` undefined-safe, returns `captureGate === 'on' && hasResolvableTestCommand` with the surface-only carve-out. Rewrote `applyCaptureGate` to read enablement from config, return `void`, and emit a config-framed dynamic block message (real validator error(s) + `ana test` fix + `captureGate: "off"` disable). Deleted `CaptureGateOutcome`, `armAfterValidBuildReport`, the `buildReportOutcome` plumbing, and both arm call sites in `saveArtifact` and `saveAllArtifacts`.
- `packages/cli/src/commands/init/anaJsonSchema.ts` (modified): Declared `captureGate: z.enum(['on','off']).optional().catch(undefined)` alongside `mergeStrategy`. No `.default` — absent must stay `undefined`.
- `packages/cli/src/commands/init/state.ts` (modified): `createAnaJson` now writes `captureGate: 'on'` (fresh-init opt-in). Added a clarifying comment at the `preserveUserState` override site noting `captureGate` is intentionally preserved-not-refreshed (no logic change — the existing `{ ...parsed.data }` spread already carries it).
- `packages/cli/src/commands/work.ts` (modified): Added `captureGate` (raw flag) and `captureGateActive` (computed) to `StatusOutput`. `getWorkStatus` reads the raw flag and computes active via `isCaptureGateEnabled`. `printHumanReadable` renders one `Capture gate:` line near the header (three states); JSON output carries the raw flag for parity.
- `packages/cli/tests/utils/capture-marker.test.ts` (modified): Renamed all `{ armed }` → `{ enabled }`, relabeled the Phase-1/Phase-2 describes to config terms, re-pointed gate-case tags (A001/A002/A003/A004), added a clean-valid enabled case (A002). Removed three stale old-contract tags (A012/A013/A014) from preservation-validator tests (see Deviations).
- `packages/cli/tests/commands/artifact.test.ts` (modified): Replaced `armProject()`/`isProjectArmed()` with a config-driven `enableGate()` helper; deleted the A031 self-arming test. Re-expressed A001/A002/A003/A006/A007 as integration tests, added `isCaptureGateEnabled` unit tests (A005/A008/A009 + top-level-true + off-false), and the block-message test (A015/A016/A017) using a truncated capture.
- `packages/cli/tests/commands/init.test.ts` (modified): Added A010 (fresh `createAnaJson` writes `on`), A011 (re-init preserves `off`), A012 (absent stays absent AND enablement reads off).
- `packages/cli/tests/commands/init/anaJsonSchema.test.ts` (modified): Added `captureGate` enum validation (on/off parse, invalid catches to undefined, absence yields undefined).
- `packages/cli/tests/commands/work.test.ts` (modified): Added A013 — the `Capture gate:` line renders on/off/inactive, plus a `--json` raw-flag parity case.
- `packages/cli/tests/commands/init/template-propagation.test.ts` (modified): Realigned A028 to AC15 (see Deviations).
- `website/content/docs/guides/configurability.mdx` (modified): Added a capture-gate settings card, the `captureGate` field in the ana.json example, and a net-new behavior description.
- `.ana/context/project-context.md` (modified): Corrected stale re-init prose (~86, ~123) to reflect template propagation.
- `CHANGELOG.md` (modified): Removed the premature `### Changed` `[Unreleased]` entry (kept the empty header); pointed the compare link at `v1.2.2...HEAD`.
- `.ana/ana.json` (modified): Added `"captureGate": "on"` — the dogfood gate is now live.

## PR Summary

- Retire the capture gate's invisible self-arming state (`.ana/state/capture.json`) and drive enforcement from a committed `captureGate` flag in `ana.json`. Net-negative LOC: the arming module, its outcome plumbing, and both arm call sites are deleted, not replaced.
- Enablement = `captureGate: "on"` AND a resolvable test command (top-level or per-surface). A new exported `isCaptureGateEnabled` is undefined-safe: a missing or malformed `ana.json` reads as off and never throws.
- The gate's block behavior is unchanged — it still blocks only when enabled and a preservation validator fails (missing/tampered/truncated); counts and verdict never block. The block message is now config-framed and names the real failure reason, the `ana test` fix, and the `captureGate: "off"` escape hatch.
- Fresh `ana init` opts projects in (`captureGate: "on"`); re-init preserves an explicit on/off and never imposes `on` on a project that never set the flag. `ana work status` surfaces the gate's state.
- The dogfood repo turns the gate on, making it a live regression check on our own build-report saves.

## Acceptance Criteria Coverage

- **AC1** "no source/test references isArmed/armCapture/capture.json/wasArmed/armedAt" → `capture-state.ts` + test deleted; verified by repo-wide grep (see Test Results → Reference checks).
- **AC2** "gate block behavior unchanged" → capture-marker.test.ts "gate enabled (fail-closed)" A001/A002/A004 + validator tests; integration A001.
- **AC3** "enablement driven by committed flag" → artifact.test.ts A001 (on→block), A003 (absent→warn); isCaptureGateEnabled unit tests.
- **AC4** "init writes on unconditionally" → init.test.ts A010 (createAnaJson writes `on`).
- **AC5** "re-init preserves explicit; absent stays absent" → init.test.ts A011 (off preserved), A012 (absent stays absent + enablement off).
- **AC6** "flag on + no test command → warn-mode" → artifact.test.ts A008 (isCaptureGateEnabled false); init A012 behavior assertion.
- **AC7** "flag on + test command + no evidence → blocked, message names fix + disable" → artifact.test.ts A001 + the A015/A016/A017 block-message test.
- **AC8** "verify-report & non-build-report never gated" → artifact.test.ts A006 (verify), A007 (spec).
- **AC9** "gate re-expressed in new sealed contract; assertions backed by passing tests" → contract.yaml A001–A017, all tagged and passing.
- **AC10** "dogfood ana.json captureGate on; no capture.json; no-evidence save blocked" → `.ana/ana.json` set to `on`; this report's own save is gate-validated (live check).
- **AC11** "ana work status reports gate state" → work.test.ts A013 (human + JSON).
- **AC12** "configurability.mdx documents captureGate; net-new description" → mdx settings card + behavior paragraph (also satisfies the template-propagation A026/A027 mdx test).
- **AC13** "project-context.md no longer claims kept-as-is/skipped-if-exists on re-init" → rewritten lines ~86, ~123.
- **AC15** "premature Unreleased entry removed; footer → v1.2.2...HEAD; no new entry" → CHANGELOG edited; A028 realigned (see Deviations).
- **AC16** "build, full suite, lint, typecheck pass; test count does not decrease" → 3431 passed / 0 failed / 2 skipped (3433 total, +12 vs 3421 baseline). Build + typecheck + typecheck:tests + lint green.

(AC14 was dropped by the spec — editing the frozen completed `captured-test-evidence` spec/scope is an immutability violation; superseded by the new contract.)

## Implementation Decisions

- **`isCaptureGateEnabled` placement and reuse.** Implemented in `artifact.ts` (its home per the spec) and imported into `work.ts` for the status readout. Verified no import cycle: `work.ts` did not previously import `artifact.ts`, and neither `artifact.ts` nor `verify.ts` imports `work.ts`.
- **Carve-out shape.** Top-level `resolveTestCommandString(anaJson, undefined)` is checked first, then each `surfaces` key is iterated — any single resolvable command returns enabled. This keeps surface-only monorepos enforced (the gotcha trap).
- **`captureGateActive` on StatusOutput.** Added a computed boolean (not just the raw flag) so the human render can show the third "on (inactive)" state without threading `projectRoot` into `printHumanReadable`. It also appears in `--json`. See Open Issues.
- **Truncation fixture for the block-message test.** Built a valid inlined report via the real `inlineCaptures`, deleted a line inside the sealed block (`text.replace('line two\n','')`), then removed the `.captures/*.log` so the save's re-inline cannot repair the truncation (committed block becomes the source of truth) — `validateCaptureNotTruncated` then trips with "truncated". A local `captureGateError` helper captures `console.error` (the shared `captureError` is scoped to a different nested describe).

## Deviations from Contract

### A028 (template-propagation contract): "CHANGELOG records the re-init overwrite behavior reversal"
**Instead:** Realigned the test to assert the `[Unreleased]` section does NOT contain the overwrite note (it is deferred to the next version bump).
**Reason:** This scope's AC15 removes that premature `[Unreleased]` entry; the existing A028 asserted its presence, so the two are in direct conflict. AC15 is authoritative for this work, and AC16 requires the full suite green.
**Outcome:** The test still makes a meaningful, AC15-aligned assertion. This modifies a test owned by a separate (completed) contract — flagged for the verifier in Open Issues. The spec authored AC15 but did not account for A028.

### Stale @ana tags removed from capture-marker.test.ts preservation-validator tests
**Instead:** Dropped the old-contract `@ana A012/A013/A014` comments from three validator unit tests (the tests themselves are kept as untagged bonus coverage).
**Reason:** The new active contract reuses A012/A013/A014 with entirely different meanings (re-init enablement / status / verify sealed account). Leaving the stale tags would mis-attribute coverage when the verifier greps the active contract's IDs.
**Outcome:** The new contract's A012/A014 are covered by real tests in init.test.ts (A012) and artifact.test.ts (A014). No live verification depends on the old completed contract's tags.

## Test Results

### Baseline (before changes)
Command: `(cd 'packages/cli' && pnpm vitest run)`
Tests: **3419 passed, 0 failed, 2 skipped** (3421 total, 139 files)

### After Changes
Command: `(cd 'packages/cli' && pnpm vitest run)`
Tests: **3431 passed, 0 failed, 2 skipped** (3433 total)

Engine-captured evidence for the after-changes full run:

<!-- ana:capture stage=build slug=retire-capture-self-arming bytes=7934 sha256=7e12f926ace2830f8544c64f6711d0d94bb3102edc456e5e24bf5191d353c5fa file=.captures/test-build-1780732479.log counts=3431p/0f/2s verdict=pass -->
<!-- ana:capture-begin bytes=7934 sha256=7e12f926ace2830f8544c64f6711d0d94bb3102edc456e5e24bf5191d353c5fa -->

 RUN  v4.1.5 /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/retire-capture-self-arming/packages/cli


 Test Files  138 passed (138)
      Tests  3431 passed | 2 skipped (3433)
   Start at  01:54:40
   Duration  49.56s (transform 5.95s, setup 0ms, import 14.59s, tests 273.75s, environment 7ms)

- Scanning project...
- Scanning project...
Error: Path not found: /nonexistent/path/abc123
- Scanning project...
- Scanning project...
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
Error: Wrong branch. Switch to `main` to end learn session.
  Run: git checkout main
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
Error: No proof found for slug "nonexistent"

Run `ana work status` to see completed work items.
- Creating directory structure...
✔ Directory structure created
- Creating ana.json...
✔ Created ana.json
Error: No proof found for slug "nonexistent"

Run `ana work status` to see completed work items.
- Creating directory structure...
✔ Directory structure created
- Creating directory structure...
- Scanning project...
✔ Directory structure created
Error: No proof chain found at .ana/proof_chain.json

Complete work items with `ana work complete {slug}` to generate proof entries.
- Creating directory structure...
✔ Directory structure created
- Creating directory structure...
✔ Directory structure created
- Creating directory structure...
✔ Directory structure created
- Creating directory structure...
✔ Directory structure created
- Creating directory structure...
✔ Directory structure created
Error: No proof chain found at .ana/proof_chain.json

Complete work items with `ana work complete {slug}` to generate proof entries.
- Creating directory structure...
✔ Directory structure created
Error: No proof found for slug "any-slug"

Run `ana work status` to see completed work items.
- Creating directory structure...
✔ Directory structure created
- Creating directory structure...
✔ Directory structure created
- Scanning project...
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
Error: Wrong branch. Switch to `main` to close findings.
  Run: git checkout main
- Scanning project...
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
Error: Finding "F999" not found.
  Run `ana proof audit` to see active findings.
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
- Scanning project...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
Error: Finding "F003" is already closed.
  Closed by: mechanical on 2026-04-22T10:00:00Z
  Reason: auto-closed
- Scanning project...
Error: --reason is required.
  Proof closures must explain why the finding no longer applies.
  Usage: ana proof close {id} --reason "explanation"
  Committed locally. Push failed after retry — run `git push`
Error: Cannot combine path argument with --save. Use --json and pipe to a file for subdirectory results.
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
Error: All 2 finding IDs failed to close.
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
Error: --skill is required. Available skills: coding-standards
  Available skills: coding-standards
  Usage: ana proof promote {id} --skill {name}
Error: Skill "data-access" not found.
  Available skills: coding-standards
  Committed locally. Push failed after retry — run `git push`
Error: Finding "F004" is already promoted.
  Promoted to: .ana/skills/coding-standards/SKILL.md
Error: Finding "F003" is already closed.
  Closed by: mechanical on 2026-04-22T10:00:00Z
  Reason: auto-closed
  Use --force to promote a closed finding.
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
Error: All 2 finding IDs failed to promote.
  Committed locally. Push failed after retry — run `git push`
Error: No uncommitted changes to .ana/skills/coding-standards/SKILL.md
  Edit the skill file first, then run this command to commit the changes.
  Usage: ana proof strengthen <ids...> --skill coding-standards --reason "..."
Error: Finding "F003" is already closed.
  Closed by: mechanical on 2026-04-22T10:00:00Z
  Reason: auto-closed
  Use --force to strengthen a closed finding.
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
Error: All 2 finding IDs failed to strengthen.
  Committed locally. Push failed after retry — run `git push`
Error: --reason is required.
  Usage: ana proof strengthen <ids...> --skill <name> --reason "..."
Error: --skill is required.
  Usage: ana proof strengthen <ids...> --skill <name> --reason "..."
Error: Failed to commit. Changes NOT saved to git.
error: pathspec '.ana/PROOF_CHAIN.md' did not match any file(s) known to git

Error: Invalid date for --since: "not-a-date". Use ISO format (e.g., 2026-05-15).
Error: Unknown surface "foo". Available surfaces: cli, website
Surfaces are not configured. Add surfaces to ana.json with `ana init`.

<!-- ana:capture-end -->

### Comparison
- Tests added: ~19 (capture-marker A002; artifact.test.ts A001/A002/A003/A006/A007 re-expressed + A005/A008/A009 + top-level-true + off-false + A015/A016/A017; init A010/A011/A012; schema enum ×4; work status ×4)
- Tests removed: 7 (6 in `capture-state.test.ts` + 1 self-arming A031) — authorized by the spec
- Net: **+12** (3421 → 3433); test count did not decrease (AC16 satisfied)
- Regressions: none. One incidental break (`template-propagation` A028) was a direct, intended consequence of AC15 and is resolved (see Deviations).

### New Tests Written
- `capture-marker.test.ts`: enabled-gate valid-report not-blocked (A002).
- `artifact.test.ts`: config-driven gate block/no-block (A001/A002/A003), verify/non-build not gated (A006/A007), isCaptureGateEnabled matrix (A005/A008/A009 + 2 more), truncated block-message (A015/A016/A017).
- `init.test.ts`: fresh `on` (A010), re-init preserves `off` (A011), absent stays absent + enablement off (A012).
- `anaJsonSchema.test.ts`: captureGate enum (on/off/invalid/absent).
- `work.test.ts`: status readout on/inactive/off + `--json` parity (A013).

### Reference checks (AC1)
`grep -rn "isArmed|armCapture|capture-state|wasArmed|armedAt" packages/cli/src packages/cli/tests` → no matches.

## Verification Commands

```
pnpm run build
(cd 'packages/cli' && pnpm vitest run)
(cd 'packages/cli' && pnpm vitest run tests/utils/capture-marker.test.ts tests/commands/artifact.test.ts)
(cd 'packages/cli' && pnpm vitest run tests/commands/init.test.ts tests/commands/init/anaJsonSchema.test.ts tests/commands/work.test.ts)
pnpm run lint
```

## Git History

```
add30349 [retire-capture-self-arming] Realign A028 to AC15 (changelog note deferred)
65f24968 [retire-capture-self-arming] Document captureGate; enable the dogfood gate
9767fa55 [retire-capture-self-arming] Surface capture-gate state in ana work status
c0e472a8 [retire-capture-self-arming] Test init/schema captureGate behavior
2d094c6e [retire-capture-self-arming] Retire self-arming; drive capture gate from config flag
```

## Open Issues

1. **AC15 ↔ A028 cross-contract conflict (resolved, flagged for verifier).** AC15 removed a CHANGELOG `[Unreleased]` note that the completed template-propagation contract's A028 test asserted. A028 was realigned to AC15's intent (note deferred to next version bump). The verifier should confirm this is the intended resolution rather than reverting AC15.
2. **Stale @ana tags removed from capture-marker.test.ts validator tests.** Old-contract A012/A013/A014 tags dropped to avoid mis-attributing coverage under the reused new-contract IDs. Tests retained as bonus coverage.
3. **`captureGateActive` appears in `--json` beyond the raw flag the spec mockup named.** Needed for the human "inactive" state; improves JSON parity. The verifier may wish to confirm the extra field is acceptable.
4. **CHANGELOG `[1.2.2]` footer compare-link is missing (pre-existing).** AC15 only directed fixing the `[Unreleased]` link to `v1.2.2...HEAD`; the dangling `[1.2.2]` reference predates this work and was left untouched.
5. **Pre-existing lint warning** in `git-operations.ts:198` (unused eslint-disable directive) — not introduced here; surfaced by project-wide lint.

Second pass — re-examined the diff for anything noticed-but-unwritten: the `formatCaptureGateState` non-exported helper carries a JSDoc (jsdoc lint passes); the dogfood gate is intentionally live and will validate this report's own save; no unused imports/params remain (typecheck + lint green). The five items above are the complete set. Verified complete by second pass.
