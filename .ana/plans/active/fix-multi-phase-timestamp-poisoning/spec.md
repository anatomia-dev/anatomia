# Spec: Fix Multi-Phase Timestamp Poisoning

**Created by:** AnaPlan
**Date:** 2026-05-31
**Scope:** .ana/plans/active/fix-multi-phase-timestamp-poisoning/scope.md

## Approach

The disease: `.saves.json` has a flat namespace where phase-blind session timestamps (`build_started_at`, `verify_started_at`) coexist with phase-aware artifact metadata (`build-report-1`, `verify-report-1`). Multi-phase work writes one timestamp per session type, but the state machine iterates N phases — Phase 1's `verify_started_at` poisons Phase 2's status determination.

Three coordinated changes:

**1. Phase resolver (`resolvePhase`).** A new pure function in `work-state.ts` that examines artifact state and saves metadata to determine the current phase number, stage, and the correct `.saves.json` keys. Both `determineStage` and `startWork` call this resolver for multi-phase routing. No independent glob-based routing remains in `startWork` for phase detection.

**2. Phase-scoped session keys.** For multi-phase work, write `build_started_at_N`, `verify_started_at_N`, `build_agent_N`, `verify_agent_N`. The resolver generates keys for any phase number. Unsuffixed keys continue for single-spec work. Backward compatibility: unsuffixed keys fall back for Phase 1 only when Phase 1 is the phase being evaluated.

**3. Defense-in-depth timestamp validation.** Even with the correct per-phase key, `determineStage` verifies that the timestamp postdates the current phase's `build-report-N.saved_at`. A `verify_started_at_2` predating `build-report-2.saved_at` is provably stale. `computeTiming` applies matching sanity: `build_started_at_N` valid only after previous phase boundary and before `build-report-N.saved_at`.

**Consolidating `isTimestampRecent` and `checkConcurrencyGuard`.** These duplicate logic (finding `pipeline-concurrency-guards-C2`). `isTimestampRecent` becomes a thin wrapper: delegates to `checkConcurrencyGuard` internally, returns `result.blocked`. Public API unchanged, duplication eliminated.

## Output Mockups

### `ana work status` — Phase 2 ready for verify (was incorrectly showing verify-in-progress)

```
Pipeline Status (artifact branch: main)

  docs-readme-platform-update (2 phases):
    scope.md         ✓ main
    plan.md          ✓ main
    spec-1.md        ✓ main
    spec-2.md        ✓ main
    Phase 1: ✓ built ✓ verified
    Phase 2: ✓ built ✗ not verified
    Stage: phase-2-ready-for-verify
    → ana run verify
```

### `.saves.json` after Phase 2 verify start (multi-phase)

```json
{
  "build_started_at_1": "2026-05-30T10:00:00Z",
  "build_agent_1": "ana-build",
  "verify_started_at_1": "2026-05-30T11:00:00Z",
  "verify_agent_1": "ana-verify",
  "build_started_at_2": "2026-05-30T12:00:00Z",
  "build_agent_2": "ana-build",
  "verify_started_at_2": "2026-05-30T13:00:00Z",
  "verify_agent_2": "ana-verify",
  "build-report-1": { "saved_at": "...", "hash": "..." },
  "verify-report-1": { "saved_at": "...", "hash": "..." },
  "build-report-2": { "saved_at": "...", "hash": "..." }
}
```

## File Changes

### `packages/cli/src/commands/work-state.ts` (modify)
**What changes:** Add `resolvePhase()` function. Modify `determineStage` to call it for multi-phase verify-in-progress checks with phase-scoped keys and defense-in-depth timestamp validation. Consolidate `isTimestampRecent` to delegate to `checkConcurrencyGuard` logic internally (move `checkConcurrencyGuard` from `work.ts` to here, or extract shared logic).
**Pattern to follow:** `gatherArtifactState` — pure function, typed interface for return value, takes pre-gathered data as input.
**Why:** Without this, Phase 1's `verify_started_at` poisons Phase 2 status for up to 1 hour.

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** Modify `startWork` to use `resolvePhase` for all multi-phase build/verify/fix routing instead of independent glob-based detection. Write phase-scoped timestamp keys (`build_started_at_N`, `verify_started_at_N`). Both main-tree and worktree-resume paths call the resolver and produce the same phase decision. Remove independent `hasNumberedVerifyReport` routing.
**Pattern to follow:** Existing `startWork` structure — the phase resolver replaces the ad-hoc glob checks, same control flow otherwise.
**Why:** Without this, `startWork` writes generic `verify_started_at` for Phase 2, providing no concurrency guard and poisoning the status check.

### `packages/cli/src/utils/proofSummary.ts` (modify)
**What changes:** `computeTiming` checks per-phase start keys (`build_started_at_N`, `verify_started_at_N`) before falling back to segment timing. Sanity: `build_started_at_N` valid only when after previous phase boundary and before `build-report-N.saved_at`; `verify_started_at_N` valid only when after `build-report-N.saved_at` and before `verify-report-N.saved_at`.
**Pattern to follow:** Existing `computeTiming` fallback pattern — try `_started_at`, validate, fall back to segment timing. Same pattern, extended to per-phase keys.
**Why:** Without this, Phase 2's build timing uses Phase 1's `build_started_at`, producing inflated durations.

### `packages/cli/tests/commands/work.test.ts` (modify)
**What changes:** Add tests for phase-scoped timestamp behavior in `determineStage` (AC1, AC3, AC4), `startWork` phase-scoped key writes (AC2, AC9, AC11), arbitrary N phases (AC13, AC14), re-verify routing (AC5), backward compatibility (AC6). Update imports if `checkConcurrencyGuard` moves.
**Pattern to follow:** Existing `createWorkTestProject` helper, `captureOutput` pattern, `describe`/`it` blocks mirroring the existing stage detection test structure.
**Why:** The gap is multi-phase timestamp-based concurrency tests — they don't exist today.

### `packages/cli/tests/utils/proofSummary.test.ts` (modify)
**What changes:** Add tests for per-phase start keys in `computeTiming` (AC7). Test sanity validation (stale `build_started_at_N` falls back to segment timing). Test fallback for old saves without per-phase keys.
**Pattern to follow:** Existing `computeTiming with build_started_at and verify_started_at` describe block — same temp dir setup, same `generateProofSummary(slugDir)` assertion pattern.
**Why:** Ensures per-phase timing accuracy and validates the sanity checks don't break existing single-phase proofs.

## Acceptance Criteria

- [ ] AC1: `ana work status` returns `phase-2-ready-for-verify` (not `phase-2-verify-in-progress`) when Phase 1 has a recent `verify_started_at`, Phase 1 is PASS, Phase 2 build report exists, and Phase 2 verify report is missing.
- [ ] AC2: `ana work start` for Phase 2 verify writes `verify_started_at_2` and `verify_agent_2` to `.saves.json`, not the generic `verify_started_at`.
- [ ] AC3: A recent `verify_started_at_1` does not block Phase 2 status or entry.
- [ ] AC4: Single-spec work with a recent generic `verify_started_at` still correctly returns `verify-in-progress`.
- [ ] AC5: Phase 2 FAIL verify + newer Phase 2 build report returns `phase-2-ready-for-re-verify`. `startWork` writes `verify_started_at_2` (not `build_started_at` or `build_started_at_2`) — re-verify is a verify entry, not a build entry.
- [ ] AC6: Existing old `.saves.json` files without suffixed keys behave correctly for single-spec work. For multi-phase backward compatibility, unsuffixed keys fall back only when Phase 1 is the phase being evaluated.
- [ ] AC7: `computeTiming` uses per-phase start keys when present and falls back to segment timing when absent. Sanity: `build_started_at_N` is used only when after the previous phase boundary and before `build-report-N.saved_at`; `verify_started_at_N` is used only when after `build-report-N.saved_at` and before `verify-report-N.saved_at`.
- [ ] AC8: A phase resolver is exported from `work-state.ts`. Both `determineStage` and `startWork` call it for multi-phase build/verify/fix/re-verify routing. No independent `hasNumberedVerifyReport` glob-based routing remains in `startWork` for phase detection.
- [ ] AC9: `ana work start` for Phase 2 build writes `build_started_at_2` and `build_agent_2` to `.saves.json`, not the generic `build_started_at`.
- [ ] AC10: Phase 2 build start is not blocked or misrouted by Phase 1's `build_started_at` or `verify_started_at`.
- [ ] AC11: Main-tree `ana work start {slug}` and worktree `ana work start {slug}` produce the same phase decision for Phase 2 build, Phase 2 verify, and Phase 2 re-verify — same timestamp key written, same phase label printed.
- [ ] AC12: The phase resolver receives or loads `.saves.json` save metadata (`build-report-N.saved_at`, `verify-report-N.saved_at`) and uses it for defense-in-depth freshness checks and re-verify detection. It does not rely solely on `ArtifactState` filename/existence data.
- [ ] AC13: Phase-scoped keys work for arbitrary N, not just Phase 2. Given a 4-phase scope where phases 1-3 have PASS verify reports, phase 4 has `build_report_4.md` and no `verify_report_4.md`, and recent `verify_started_at_1`/`verify_started_at_2`/`verify_started_at_3` exist: `ana work status` returns `phase-4-ready-for-verify` and `ana work start` writes `verify_started_at_4`.
- [ ] AC14: Re-verify works for arbitrary N. Given a 4-phase scope where phase 4 has a FAIL `verify_report_4.md` and a newer `build_report_4.md`: `ana work status` returns `phase-4-ready-for-re-verify` and `ana work start` writes `verify_started_at_4`, not `build_started_at_4`.
- [ ] AC15: Single-spec FAIL verify + newer build report → `startWork` writes `verify_started_at` (not `build_started_at`). Re-verify is a verify session regardless of phase count.
- [ ] Tests pass with `(cd 'packages/cli' && pnpm vitest run)`
- [ ] No build errors with `(cd 'packages/cli' && pnpm run build)`
- [ ] Lint passes with `(cd 'packages/cli' && pnpm run lint)`

## Testing Strategy

- **Unit tests (work.test.ts):**
  - Phase resolver: given various artifact + saves states, returns correct phase number, stage, and key names
  - `determineStage` with phase-scoped keys: verify Phase 1's timestamps don't poison Phase 2+
  - `startWork` writes correct phase-scoped keys for build, verify, and re-verify at each phase
  - Backward compat: unsuffixed keys work for single-spec and Phase 1 fallback
  - Arbitrary N: 4-phase scenarios for both status and start
  - Main-tree vs worktree `startWork` produce same phase decision

- **Unit tests (proofSummary.test.ts):**
  - `computeTiming` with per-phase start keys: uses them when valid, falls back when absent
  - Sanity validation: stale `build_started_at_N` (before phase boundary) triggers fallback
  - Mixed: some phases have start keys, others don't — per-phase fallback
  - Old saves without per-phase keys still produce correct segment timing

- **Edge cases:**
  - Corrupted/missing `.saves.json` — doesn't crash, falls through gracefully
  - Phase 1 with unsuffixed keys + Phase 2 with suffixed keys (migration scenario)
  - `verify_started_at_2` that predates `build-report-2.saved_at` (defense-in-depth rejection)
  - Clock skew: `build_started_at_N` after `build-report-N.saved_at` — falls back to segment timing

## Dependencies

- `work-state.ts` changes must land before `work.ts` changes (resolver must exist before callers use it)
- `proofSummary.ts` changes are independent of the state model changes

## Constraints

- **Backward compatibility.** Old `.saves.json` files without suffixed keys must continue to work for single-spec work and Phase 1 fallback. No migration step.
- **Pure functions.** `resolvePhase` and `determineStage` take pre-gathered data — no filesystem reads inside.
- **All pipeline agents call `work status` and `work start`.** These are hot paths. The resolver must not add git operations beyond what already exists.
- **Test count must not decrease.** Current: 3099 passed, 129 test files.

## Gotchas

- **`writeTimestamp` write-once guard.** Phase-scoped keys (`build_started_at_2`) are new keys, so the write-once guard won't block first writes. But crash-and-restart scenarios need `force: true` for all verify and fix entries (already done for single-phase verify/fix). Ensure all phase-scoped verify/re-verify calls pass `force: true`.
- **`startWork` worktree-resume path uses `globSync` for artifact detection.** The phase resolver should NOT use filesystem operations when called from `determineStage` (which operates on git branch data). The resolver must take pre-gathered artifact state as input. For the worktree-resume path in `startWork`, gather artifact state first via filesystem reads, then call the resolver.
- **`isTimestampRecent` reads from filesystem path.** It's called from `determineStage` with the worktree path. When consolidating with `checkConcurrencyGuard`, preserve this filesystem-path-based interface for `determineStage`'s usage. The consolidation is internal — the call signature for `isTimestampRecent` stays the same.
- **`determineStage` currently reads `.saves.json` via `readFileOnBranch` (git show).** For the defense-in-depth check, it needs `build-report-N.saved_at` from `.saves.json` on the work branch. This data is already being read in the multi-phase FAIL check (line 460-468). Extract this read to happen once per slug, pass it to both the phase resolver and the FAIL-check logic.
- **Main-tree `startWork` can't see worktree artifacts on the filesystem** (they're committed on the work branch, not checked out on the artifact branch). But it CAN read them via `gatherArtifactState` which uses `fileExistsOnBranch` / `readFileOnBranch`. For `.saves.json` timestamps, the main-tree path should read from the worktree filesystem (via `getWorktreePath`) since timestamps are written there, not committed to the work branch.
- **Re-verify writes `verify_started_at_N`, not `build_started_at_N`.** The scope explicitly calls this out (AC5). The current single-phase re-verify path writes `build_started_at` (work.ts line 1177) — this is also wrong for single-phase but hasn't been noticed because the fix path routes to build. For multi-phase, the distinction matters: re-verify is a verify session. Update both single-phase and multi-phase re-verify to write the verify key. AC15 enforces this for single-phase.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer named exports. Exported functions require `@param` and `@returns` JSDoc tags.
- Explicit return types on all exported functions.
- Prefer early returns over nested conditionals.
- Engine files have zero CLI dependencies — but these changes are in `commands/` and `utils/`, not engine.
- Always use `--run` with pnpm test to avoid watch mode hang.

### Pattern Extracts

**`gatherArtifactState` return interface pattern (work-state.ts:16-55):**
```typescript
export interface ArtifactState {
  scope: ArtifactInfo;
  plan: ArtifactInfo;
  specs: SpecInfo[];
  buildReports: ReportInfo[];
  verifyReports: VerifyReportInfo[];
}
```
The phase resolver return type should follow this — typed interface, exported, all fields required.

**Multi-phase loop in `determineStage` (work-state.ts:426-487):**
```typescript
for (let i = 0; i < totalPhases; i++) {
  const phaseNum = i + 1;
  const spec = specs[i];
  if (!spec) continue;
  const expectedBuildReport = spec.file === 'spec.md' ? 'build_report.md' : `build_report_${phaseNum}.md`;
  const expectedVerifyReport = spec.file === 'spec.md' ? 'verify_report.md' : `verify_report_${phaseNum}.md`;

  const phaseBuildReport = buildReports.find(r => r.file === expectedBuildReport);
  const phaseVerifyReport = verifyReports.find(r => r.file === expectedVerifyReport);

  if (!phaseBuildReport) {
    if (phaseNum === 1) {
      return 'phase-1-build-in-progress';
    } else {
      return `phase-${phaseNum}-ready-for-build`;
    }
  }

  if (phaseBuildReport && !phaseVerifyReport) {
    if (projectRoot && worktreeExists(projectRoot, slug)) {
      const wtSavesDir = path.join(getWorktreePath(projectRoot, slug), '.ana', 'plans', 'active', slug);
      if (isTimestampRecent(wtSavesDir, 'verify_started_at')) {  // ← BUG: phase-blind key
        return `phase-${phaseNum}-verify-in-progress`;
      }
    }
    return `phase-${phaseNum}-ready-for-verify`;
  }
```
The fix: replace `'verify_started_at'` with `'verify_started_at_${phaseNum}'` and add defense-in-depth check against `build-report-N.saved_at`.

**`writeTimestamp` signature (work.ts:1650-1671):**
```typescript
async function writeTimestamp(activePath: string, key: string, agent?: string, force: boolean = false, timestamp?: string): Promise<void> {
```
Phase-scoped calls: `writeTimestamp(dir, 'verify_started_at_2', 'ana-verify', true)`. The key is a plain string — no structural change needed, just pass the suffixed key.

**`checkConcurrencyGuard` (work.ts:1591-1638):**
```typescript
export function checkConcurrencyGuard(
  savesDir: string,
  timestampKey: string,
  slug: string,
  force: boolean = false,
): ConcurrencyGuardResult {
```
This and `isTimestampRecent` (work-state.ts:319-332) duplicate the same logic. Consolidate: move the core comparison into `work-state.ts`, have `isTimestampRecent` call it.

**`computeTiming` single-phase start key usage (proofSummary.ts:770-798):**
```typescript
if (buildTime && contractTime) {
  let usedStartedAt = false;
  if (buildStartedAt !== null && buildStartedAt <= buildTime) {
    const durationMs = buildTime - buildStartedAt;
    if (durationMs >= 0 && durationMs <= MAX_PHASE_MS) {
      timing.build = Math.round(durationMs / 60000);
      usedStartedAt = true;
    }
  }
  if (!usedStartedAt) {
    timing.build = Math.round((buildTime - contractTime) / 60000);
  }
}
```
Extend this pattern to the multi-phase branch: for each phase, try `build_started_at_N`, validate, fall back to segment timing.

**Test helper pattern (work.test.ts:62-151):**
```typescript
async function createWorkTestProject(options: {
  slugs?: Array<{
    slug: string;
    artifacts: string[];
    planContent?: string;
    featureBranch?: boolean;
    worktree?: boolean;
    featureArtifacts?: Array<{ file: string; content?: string }>;
  }>;
}): Promise<void> {
```
New tests use this helper. For worktree-based tests that need `.saves.json` in the worktree, write to the worktree path after creation (same pattern as the existing concurrency guard tests at line 5294).

### Proof Context
- `decompose-work-ts-C4`: `determineStage` is 148 lines with deep nesting — the phase resolver extraction directly addresses this.
- `pipeline-concurrency-guards-C2`: `isTimestampRecent` duplicates `checkConcurrencyGuard` — this spec consolidates them.
- `pipeline-concurrency-guards-C3`: Inside-worktree resume writes `verify_started_at` without checking concurrency guard — the phase resolver makes this phase-aware.

### Checkpoint Commands
- After `work-state.ts` changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: all existing tests pass
- After `work.ts` changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: all existing tests pass
- After `proofSummary.ts` changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: all existing tests pass
- After all test additions: `(cd 'packages/cli' && pnpm vitest run)` — Expected: 3099 + new tests pass
- Final: `pnpm run test -- --run` — Expected: all tests pass across workspace
- Lint: `(cd 'packages/cli' && pnpm run lint)`

### Build Baseline
- Current tests: 3099 passed (2 skipped)
- Current test files: 129
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected ~3120+ tests (estimated 20+ new tests for phase resolver, phase-scoped keys, timing, backward compat, arbitrary N)
- Regression focus: `work.test.ts` stage detection tests, `proofSummary.test.ts` timing tests, concurrency guard tests
