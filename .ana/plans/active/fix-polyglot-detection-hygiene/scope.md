# Scope: Polyglot detection hygiene

**Created by:** Ana
**Date:** 2026-05-20

## Intent
The polyglot detection cascade in `detectProjectType` has undocumented priority ordering, a missing indicator in the Tauri path, and no test that verifies the full priority order. These are hygiene issues — none cause wrong type detection today, but they make the code harder to understand and extend safely. Source: Learn Session 7, findings from 10 most recent proofs.

## Complexity Assessment
- **Kind:** chore
- **Size:** small — 1 production file (comment + indicator fix), 1 test file (new tests)
- **Surface:** cli
- **Files affected:** `packages/cli/src/engine/detectors/projectType.ts`, `packages/cli/tests/engine/detectors/polyglot.test.ts`
- **Blast radius:** Minimal. The comment change has zero runtime impact. The indicator fix adds a string to a display-only array. The test is additive.
- **Estimated effort:** Under 30 minutes
- **Multi-phase:** no

## Approach
Three independent fixes in the same subsystem, bundled because they share context and have overlapping blast radius:

1. **Document the polyglot priority order.** The docstring at line 133 documents the non-package.json fallthrough (Python → Go → Rust → Ruby → PHP) but says nothing about the polyglot tier priority inside the package.json branch (Python → Rust → Ruby → Go). These orders differ intentionally — the polyglot path uses content checks while the non-package.json path uses existence checks. Add a docstring line making the polyglot order explicit.

2. **Add Cargo.toml to Tauri path indicators.** When the Tauri discriminator fires (lines 202-204 and 251-252), it pushes `pnpm-workspace.yaml` to indicators but omits `Cargo.toml`. The non-Tauri Rust path correctly includes it. Fix both Tauri paths to push `Cargo.toml` before `pnpm-workspace.yaml`. The indicators array is display-only — no production code reads it for branching logic — but scan output should accurately reflect what files were detected.

3. **Add priority order regression test.** No existing test creates all four competing manifests (pyproject.toml + Cargo.toml + Gemfile + go.mod) alongside package.json to verify which language wins. Add two tests: one with all four manifests (asserts Python wins), one with Python removed (asserts Rust wins). This guards the documented priority without creating a brittle cascading removal test.

## Acceptance Criteria
- AC1: The `detectProjectType` docstring documents both priority orders — non-package.json fallthrough AND polyglot tier priority — with a note that the orders differ intentionally.
- AC2: A Tauri project's indicators array contains `Cargo.toml` in both Tier 3 (lockfile present) and Tier 4 (no lockfile) paths.
- AC3: A test with all four competing manifests (pyproject.toml with real deps + Cargo.toml with [workspace] + Gemfile + go.mod) alongside package.json + lockfile asserts the result is Python at 0.90 confidence.
- AC4: A test with three competing manifests (Cargo.toml with [workspace] + Gemfile + go.mod) alongside package.json + lockfile — no pyproject.toml — asserts the result is Rust at 0.90 confidence.
- AC5: Existing polyglot tests continue to pass unchanged.

## Edge Cases & Risks
- The Tauri indicator fix changes what appears in scan.json for Tauri projects. Since indicators are display-only (verified: no production code reads `indicators.projectType`), this is safe. But Tauri test assertions that check `indicators` should be updated if they assert the exact array contents.
- The existing Tauri test at line 471 asserts `indicators.toContain('pnpm-workspace.yaml')` — this still passes after the fix. It doesn't assert the absence of `Cargo.toml`, so no test breakage.

## Rejected Approaches
- **Cascading removal test (Learn's prescription).** Learn proposed a test that creates all four manifests, then removes them one by one (Python → Rust → Ruby → Go), asserting each winner. This creates 4 tightly-coupled assertions that would all break if we intentionally reorder priorities. Two focused tests (all-four and Python-removed) cover the same concern with less brittleness.
- **Ruby content analysis (Finding 4).** Learn identified that Ruby detection is existence-only while Python and Rust get content checks. Investigated: of 17 R3 test repos, only `maybe` has a Gemfile and it's a genuine Rails project. Zero false positives. The false-positive scenario (JS project with root Gemfile for Fastlane/Vagrant) is theoretical. Dropped — don't punish correct Ruby detection for a scenario that hasn't occurred.
- **Confidence reduction for Ruby.** Learn suggested reducing Ruby confidence from 0.90 to 0.75 as a lighter alternative. This would make correctly-detected Ruby projects (like `maybe`) appear less certain for zero practical benefit. Bad tradeoff.

## Open Questions
None. All investigable questions resolved during scoping.

## Exploration Findings

### Patterns Discovered
- The polyglot cascade uses a tier system: Tier 1 (no competition), Tier 2 (workspaces), Tier 3 (lockfile + competing manifest + content check), Tier 4 (no lockfile + competing manifest + content check), Tier 5 (bare package.json). Priority within tiers is implicit in if-else order.
- The `indicators` array flows into `scan.json` at `indicators.projectType` (defined in `src/engine/types/index.ts:57-59`). No production code reads this field for logic — only stored in scan output.

### Constraints Discovered
- [TYPE-VERIFIED] Indicators are display-only (src/engine/types/index.ts:57-59) — no runtime branching depends on indicator contents
- [OBSERVED] Existing Tauri tests use `toContain` not exact array match — indicator additions won't break them
- [TYPE-VERIFIED] Ruby detection at lines 214-218 and 263-266 is existence-only — no content analysis function exists for Gemfiles

### Test Infrastructure
- `polyglot.test.ts` uses `createTempDir()` helper with afterEach cleanup. Each test creates a temp directory, writes manifest files, calls `detectProjectType`, and asserts result fields. Follow this pattern exactly.

## For AnaPlan

### Structural Analog
The existing "Python wins over Rust" test at line 596 of `polyglot.test.ts` — it creates two competing manifests and asserts one wins. The new all-four-manifests test has the same shape but adds Gemfile and go.mod.

### Relevant Code Paths
- `packages/cli/src/engine/detectors/projectType.ts:129-135` — docstring to update
- `packages/cli/src/engine/detectors/projectType.ts:196-211` — Tier 3 Rust/Tauri path (Cargo.toml indicator missing from Tauri branch at 202-204)
- `packages/cli/src/engine/detectors/projectType.ts:245-261` — Tier 4 Rust/Tauri path (Cargo.toml indicator missing from Tauri branch at 251-252)
- `packages/cli/tests/engine/detectors/polyglot.test.ts` — test file, add new tests

### Patterns to Follow
- Docstring format: match existing JSDoc style at line 129-135
- Test format: follow `createTempDir` + `writeFile` + `detectProjectType` + `expect` pattern used throughout polyglot.test.ts
- Indicator push order: push `Cargo.toml` before `pnpm-workspace.yaml` in Tauri paths (matches the logical order: Cargo.toml is the competing manifest, pnpm-workspace.yaml is the Tauri discriminator signal)

### Known Gotchas
- The pyproject.toml in the all-four-manifests test MUST have real dependencies (e.g., `dependencies = ["fastapi"]`) — a tooling-only pyproject.toml falls through to Node, which would make the test assert the wrong thing.
- The Cargo.toml in the test MUST have a `[workspace]` section — without it, the Rust path doesn't fire and the cascade skips to Ruby.
- The go.mod just needs to exist — no content check for Go.

### Things to Investigate
None. All implementation details are clear from the code.
