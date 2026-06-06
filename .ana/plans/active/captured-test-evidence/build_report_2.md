# Build Report: Captured Test Evidence — Phase 2 (Self-arming flip to fail-closed)

**Created by:** AnaBuild
**Date:** 2026-06-05
**Spec:** .ana/plans/active/captured-test-evidence/spec-2.md
**Branch:** feature/captured-test-evidence

## What Was Built

Phase 2 makes the capture gate **fail-closed — but only for a project that has already sealed a real capture**. Five carried-in findings on the Phase-1 code were folded into the same build; two are hard preconditions for arming safely.

- `packages/cli/src/utils/capture-state.ts` (**created**): the marker-sealed arming signal. `isArmed(projectRoot)` reads `.ana/state/capture.json` undefined-safe (missing/malformed → `false`, never throws). `armCapture(projectRoot)` writes `{ armed: true, armedAt }` idempotently (preserves the original `armedAt`), only ever to `.ana/state/`. Separate file from `.saves.json` → zero added reads on the hot save path.
- `packages/cli/src/commands/artifact.ts` (**modified**): split inlining from gating. `inlineReportCaptures` (warn-only, shared) expands markers into sealed blocks. `applyCaptureGate` now does **check-then-arm**: inline → evaluate the gate against the project's *current* armed state → `process.exit(1)` (before the seal hash) only when armed AND a preservation validator fails → return validity. `armAfterValidBuildReport` arms the project AFTER a confirmed-valid save and prints the one-time flip message. Wired at **both** build-report save sites (`saveArtifact`, `saveAllArtifacts`). Verify-report saves now call `inlineReportCaptures` (Verify's own sealed account) but are **never** gated.
- `packages/cli/src/utils/capture-marker.ts` (**modified, item 2 precondition**): `validateCapturePresent` now uses the block-skipping `eachMarker` scan instead of a per-line `parseMarkers` scan, so a `build` marker embedded *inside* another capture's inlined block can no longer satisfy the present-check. The present-check now agrees with the integrity validators on what a real top-level marker is — load-bearing once the gate enforces.
- `packages/cli/src/utils/capture-runner.ts` (**modified, item 1 precondition**): `deriveCounts` now parses **only** with the hinted runner's parser; unidentified output abstains (`null`) instead of running every parser, where a loose summary regex could coincidentally match prose and fabricate a count. The rspec summary regex is also anchored to its line as defense-in-depth.
- `packages/cli/src/commands/test.ts` (**modified, item 4 fold-in**): a multi-token checkpoint passthrough is used as **verbatim argv** (`program=argv[0]`, rest=args) instead of being joined and re-parsed through the config-string parser (which silently lost quoting on args like `-k "a or b"`). A single-token passthrough is still string-parsed (handles the `(cd && cmd)` wrapper). A runner hint is now inferred in checkpoint mode too, so checkpoints derive counts.
- `packages/cli/tests/utils/capture-state.test.ts` (**created**): 6 unit tests for the arming signal.
- `packages/cli/tests/utils/capture-runner.test.ts` (**modified**): +4 fabrication-guard tests for the hint-only count derivation.
- `packages/cli/tests/utils/capture-marker.test.ts` (**modified**): present-check block-skipping tests + the Phase-2 fail-closed flip unit tests (armed→blocked, fail-open-on-counts).
- `packages/cli/tests/commands/test-command.test.ts` (**modified**): +argv-verbatim and checkpoint-count tests; one baseline fixture updated to name its runner (see Deviations).
- `packages/cli/tests/capture-corpus/invariants.test.ts` (**modified, item 5 fold-in**): distinctive per-stack error tokens for ERROR-NEVER-STRIPPED.
- `packages/cli/tests/commands/artifact.test.ts` (**modified**): +5 integration tests exercising the gate through the real command path (check-then-arm, armed-block, never-armed-pass, verify-not-gated, non-build-not-gated).

## PR Summary

- Flips the capture gate to **fail-closed** via a marker-sealed, per-working-copy arming signal (`.ana/state/capture.json`): a project arms only after it seals its first valid build-report capture, so arming is itself proof the agent is capturing — brick-proof by construction.
- Implements **check-then-arm** ordering at both build-report save sites: the gate is evaluated before arming, so the first valid save never blocks itself; the next build-report save with no/invalid evidence on the now-armed project is blocked before the seal hash.
- Gate is scoped to `build_report.md` only; **verify reports are never gated**, but now keep their own inlined + sha-sealed capture account (closing the last unsealed spot in the proof chain).
- Hardens two Phase-1 preconditions that make arming safe: `deriveCounts` abstains on unidentified output (never fabricates a count), and `validateCapturePresent` uses the block-skipping scan so an embedded marker can't satisfy it.
- Folds in two correctness fixes: checkpoint passthrough argv is used verbatim (no quoting loss), and the adversarial corpus asserts distinctive per-stack error tokens.

## Acceptance Criteria Coverage

- **AC12** "armed → three validators fail-closed at exit(1) before the seal" → `artifact.test.ts` "blocks an armed build-report save that has no captured evidence" (A030) + `capture-marker.test.ts` "blocks when armed and a preservation validator fails" / "blocks an armed save whose inlined block was altered".
- **AC13** "never-captured stays warn-mode, never blocked; fail-open on counts, fail-closed on preservation" → `artifact.test.ts` "does not block a build-report save on a never-armed project" (A032); `capture-marker.test.ts` "does not block when armed if preservation holds but counts abstain" (A033).
- **AC14** "gate scoped to build_report.md; verify_report not gated" → `artifact.test.ts` "never gates a verify-report save even when armed" (A035) + "never gates a non-build-report save even when armed" (A036).
- **New (check-then-arm)** "first valid save not blocked, then armed; next invalid blocked" → `artifact.test.ts` "first valid-capture save arms the project; the next invalid save blocks" (A031).
- **New** "`isArmed` undefined-safe" → `capture-state.test.ts` "returns false for a fresh project" / "returns false on a malformed capture.json" (A034).
- **New** "`armCapture` idempotent, writes only to `.ana/state/`" → `capture-state.test.ts` "is idempotent — a second arm preserves the original armedAt" / "writes ONLY to .ana/state/".
- **New** "`pnpm vitest run` passes, count does not decrease, `tsc --noEmit` clean" → see Test Results + Verification Commands (3389 passed; +21 net tests; tsc + tsc -p tsconfig.test.json clean).

## Contract Coverage

Phase-2 assertions A030–A036, all tagged with `// @ana`:
- A030 → `capture-marker.test.ts` (2 tests) + `artifact.test.ts`
- A031 → `artifact.test.ts`
- A032 → `artifact.test.ts`
- A033 → `capture-marker.test.ts`
- A034 → `capture-state.test.ts` (2 tests)
- A035 → `artifact.test.ts`
- A036 → `artifact.test.ts`

Contract coverage: 7/7 Phase-2 assertions tagged. (A027 ABSTAIN-ON-UNKNOWN also re-tagged in `capture-runner.test.ts` for the new fabrication guard.)

## Implementation Decisions

- **`armCapture` placed AFTER `writeSaveMetadata` (the seal), gate BEFORE it.** This is the literal check-then-arm ordering: the un-armed first valid save passes the gate, seals, then arms; the next invalid save is evaluated armed and blocked before its seal.
- **"Valid" = no gate warnings and no gate errors.** The gate only ever weighs the three preservation validators, so a sealed report whose counts abstain is still "valid" and arms the project — fail-open on counts holds by construction (the gate never inspects counts/verdict).
- **One-time flip message keyed on `wasArmed`.** `armCapture` is idempotent; the "capture gate armed" line prints only when the project transitions from un-armed to armed, never on re-saves of an already-armed project.
- **Item 1 chose ABSTAIN over anchoring-alone.** Removed the parse-every-runner fallthrough entirely (hint-only), then *also* anchored the rspec regex. Per the finding, abstain is the safe default; anchoring is defense-in-depth.

## Deviations from Contract

The contract (A030–A036) was followed exactly. The deviations below are spec-adjacent judgment calls and a stated decision, documented for the verifier.

### Stated decision (spec item 3): built the verify-report sealed account this phase
**Instead:** Verify-report saves now run `inlineReportCaptures` (inline + sha-seal the verify capture), but are never gated.
**Reason:** The Phase-2 spec explicitly assumes verify captures are "still inlined + sealed per Phase 1" — but that path fell through in Phase 1; the verify count sat as unsealed prose. I implemented the spec's stated intent rather than leave the last soft spot open.
**Outcome:** Closes the proof-chain gap. It is warn-mode (never blocks Verify), so brick-proofness and Verify's independence are both preserved. Not in the sealed contract (no A-id) — flagged here so the verifier assesses the scope decision.

### Test fixture updated: baseline `ana test` fixture now names its runner
**Instead:** `test-command.test.ts` "emits a sealed marker on a passing baseline run" changed its script name `ok.cjs` → `vitest-run.cjs` so `inferRunner` identifies the runner.
**Reason:** Item 1 makes counts hint-only; the old fixture leaned on the now-removed fallthrough to parse a vitest-shaped summary from an unidentifiable `node ok.cjs` command. Real configs always name their runner.
**Outcome:** Every assertion in the test is preserved (verdict=pass, sealed marker); only the fixture command was made realistic. No assertion was weakened.

### Behavior change (item 1): unidentified runners now abstain on counts
**Instead:** A project whose test command names no recognizable runner (e.g. a bare `npm test` wrapping vitest) now seals `verdict=abstain` instead of a parsed count.
**Reason:** Precondition for safe arming — never fabricate a count. Abstain preserves the raw bytes verbatim and never blocks (fail-open).
**Outcome:** A usability cost (fewer auto-counts for un-named runners) traded for the no-false-green guarantee the feature exists to provide. Endorsed by the finding.

## Test Results

### Baseline (before changes, post-Phase-1)
Command: `(cd 'packages/cli' && pnpm vitest run)`
```
Test Files  137 passed (137)
     Tests  3368 passed | 2 skipped (3370)
```

### After Changes
Command: `(cd 'packages/cli' && pnpm vitest run)`
```
Test Files  138 passed (138)
     Tests  3389 passed | 2 skipped (3391)
```

### Sealed capture of this build (engine-captured, verdict pass)

<!-- ana:capture stage=build slug=captured-test-evidence bytes=7557 sha256=1183562f3da41be7345629c60984faf64113eafc85043b1d184cd3bdb0bcd47d file=.captures/test-build-1780710840.log counts=3389p/0f/2s verdict=pass -->
<!-- ana:capture-begin bytes=7557 sha256=1183562f3da41be7345629c60984faf64113eafc85043b1d184cd3bdb0bcd47d -->

 RUN  v4.1.5 /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/captured-test-evidence/packages/cli


 Test Files  138 passed (138)
      Tests  3389 passed | 2 skipped (3391)
   Start at  19:54:01
   Duration  53.08s (transform 5.47s, setup 0ms, import 16.46s, tests 288.09s, environment 35ms)

- Scanning project...
- Scanning project...
Error: Path not found: /nonexistent/path/abc123
- Scanning project...
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
Error: Wrong branch. Switch to `main` to end learn session.
  Run: git checkout main
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
Error: No proof found for slug "nonexistent"

Run `ana work status` to see completed work items.
Error: No proof found for slug "nonexistent"

Run `ana work status` to see completed work items.
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
- Creating directory structure...
- Creating ana.json...
Error: No proof chain found at .ana/proof_chain.json

Complete work items with `ana work complete {slug}` to generate proof entries.
✔ Created ana.json
✔ Directory structure created
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
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
Error: No proof chain found at .ana/proof_chain.json

Complete work items with `ana work complete {slug}` to generate proof entries.
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Scanning project...
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
Error: No proof found for slug "any-slug"

Run `ana work status` to see completed work items.
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
Error: Wrong branch. Switch to `main` to close findings.
  Run: git checkout main
- Scanning project...
Error: Finding "F999" not found.
  Run `ana proof audit` to see active findings.
Error: Finding "F003" is already closed.
  Closed by: mechanical on 2026-04-22T10:00:00Z
  Reason: auto-closed
Error: --reason is required.
  Proof closures must explain why the finding no longer applies.
  Usage: ana proof close {id} --reason "explanation"
Error: Cannot combine path argument with --save. Use --json and pipe to a file for subdirectory results.
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
Error: All 2 finding IDs failed to close.
- Scanning project...
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
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
- Tests added: +21 net (+1 test file: `capture-state.test.ts`)
- Tests removed: 0
- Regressions: none

### New Tests Written
- `capture-state.test.ts`: arming signal — undefined-safe, sticky, idempotent, state-only (6).
- `capture-marker.test.ts`: present-check block-skipping (embedded marker rejected) + Phase-2 flip (armed→blocked, fail-open-on-counts).
- `capture-runner.test.ts`: fabrication guards — unhinted abstains, wrong-hint abstains, rspec anchored (3).
- `test-command.test.ts`: pre-tokenized argv passed verbatim; checkpoint runner-hint counts (2).
- `artifact.test.ts`: check-then-arm, armed-block, never-armed-pass, verify-not-gated, non-build-not-gated (5).

## Verification Commands
```
(cd 'packages/cli' && pnpm run build)
(cd 'packages/cli' && pnpm vitest run)
(cd 'packages/cli' && pnpm run typecheck)
(cd 'packages/cli' && pnpm run typecheck:tests)
(cd 'packages/cli' && pnpm exec eslint src/utils/capture-state.ts src/utils/capture-runner.ts src/utils/capture-marker.ts src/commands/test.ts src/commands/artifact.ts)
```

## Git History
```
a1aaff85 [captured-test-evidence:s2] Self-arming flip to fail-closed
6bbc7ba1 [captured-test-evidence:s2] Strengthen corpus error tokens
591904a7 [captured-test-evidence:s2] present-check uses block-skipping scan
b580a080 [captured-test-evidence:s2] Use checkpoint passthrough argv verbatim
fd12e9af [captured-test-evidence:s2] Abstain on unhinted counts — never guess a count
```

## Open Issues

1. **Enforcement is per-working-copy, by design (not a gap).** The arming flag is gitignored `.ana/state/capture.json`, so a fresh clone / CI runner / ephemeral agent starts un-armed and stays in warn-mode until it captures once locally. CI does **not** enforce the seal-gate guarantee unless that working copy has itself sealed a capture and persists `.ana/state/`. This is the intended boundary (committing the flag would re-introduce the brick on fresh clones), stated so no one expects CI to enforce it. (severity: observation, action: acknowledge)

2. **The verify-report sealed account (spec item 3) is not covered by a contract assertion.** It is real, tested via the existing verify-save integration tests staying green and exercised by saving this phase's own verify report, but there is no A-id binding it. Recorded so the verifier weighs the scope decision rather than assuming it was contracted. (severity: observation, action: monitor)

3. **`deriveCounts` abstain may surprise projects whose test command does not name a recognizable runner.** Such projects now seal `verdict=abstain` rather than a count. Safe (fail-open, bytes preserved) but a visible behavior change; if it bites real users, the remedy is to broaden `inferRunner` (e.g. read a `test_json`/explicit runner hint from config), not to restore the fabrication-prone fallthrough. (severity: debt, action: monitor)

Second pass — re-examined for anything noticed-but-unwritten: the global released `ana` (1.2.2) has neither `ana test` nor the gate, so this build report was captured and will be sealed using the worktree's freshly-built CLI (true dogfood). No other concerns surfaced. The three items above are the complete set.
