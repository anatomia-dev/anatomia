# Spec: Fix False Rejection Archives on Same-Session Re-Saves

**Created by:** AnaPlan
**Date:** 2026-05-22
**Scope:** .ana/plans/active/fix-false-rejection-archive/scope.md

## Approach

Three-layer defense-in-depth. The disease: `archivePreviousVersion` and `writeSaveMetadata` trigger on content diff when rejection is a pipeline-state concept. A rejection cycle means the opposing pipeline stage advanced between saves. A same-session correction means it didn't.

**Part 1 — Gate archiving on stage transition.** Extract a helper `deriveOpposingReportKey` (mirrors `deriveCompanionKey` at artifact.ts:1117) that maps an artifact type to its opposing report key phase-aware: `verify-report-2` → `build-report-2`, `build-report` → `verify-report`. Extract a predicate `hasOpposingStageAdvanced(slugDir, artifactType)` that reads `.saves.json`, gets the current artifact's latest `saved_at`, gets the opposing key's latest `saved_at`, and returns true only if the opposing timestamp is more recent. Apply this gate at all four `archivePreviousVersion` call sites — the two in `saveArtifact` (report at ~1248, companion at ~1414) and the two loops in `saveAllArtifacts` (report loop at ~1794, companion loop at ~1801). If the gate returns false, skip archiving.

**Part 2 — Gate history pushes on the same check.** In `writeSaveMetadata`, add a parameter `options?: { gateOnStageTransition?: { slugDir: string; artifactType: string } }`. When provided and the artifact is archivable (`build-report` or `verify-report` variant), call `hasOpposingStageAdvanced` before pushing to history. If the gate returns false, update `saved_at` and `hash` but skip the history push — the save still records, it just doesn't create a history trail that implies a rejection cycle. Non-archivable types (scope, spec, plan, contract, companion data) are unaffected.

**Part 3 — Replace `hasRejectionHistory` with content-based detection.** In `computeTiming`, change the function signature to accept `slugDir` in addition to `saves`. Replace the `hasRejectionHistory` boolean (line 1710) with content-based detection: find verify report files in `slugDir` (unnumbered first, then numbered), read them, call the already-exported `parseRejectionCycles`, check `cycles > 0`. If any verify report has rejection content, use the rejection-cycle timing branch. `generateProofSummary` passes `slugDir` alongside `saves`.

## Output Mockups

No user-visible output changes. The fix suppresses false artifacts and history entries — the absence of noise is the outcome. A same-session re-save that previously produced:

```
Archived verify_report.md → verify_report_r1.md (previous round)
```

Now produces no archive message. Genuine rejection cycles (opposing stage advanced) produce the same archive message as before.

## File Changes

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:** Add `deriveOpposingReportKey` helper. Add `hasOpposingStageAdvanced` predicate. Gate all four `archivePreviousVersion` call sites. Add stage-transition option to `writeSaveMetadata` calls for archivable types.
**Pattern to follow:** `deriveCompanionKey` (artifact.ts:1117-1123) for the key derivation helper. The idempotency check in `writeSaveMetadata` (artifact.ts:66-68) for the conditional-skip pattern.
**Why:** Without the gate, same-session corrections create false `_r` archive files and false history entries that imply rejection cycles that never happened. If verify-report content changes, the false history entry activates the rejection-cycle timing reconstruction path, corrupting the proof chain entry's timing data.

### `packages/cli/src/utils/proofSummary.ts` (modify)
**What changes:** `computeTiming` gains a `slugDir` parameter. Replace `hasRejectionHistory` with content-based detection using `parseRejectionCycles` (already exported from the same file). `generateProofSummary` passes `slugDir` to `computeTiming`.
**Pattern to follow:** The existing `parseRejectionCycles` call at proofSummary.ts:2067 (used for proof chain `rejection_cycles` field) — same function, same trust level.
**Why:** Even if gates 1-2 miss an edge case, timing data cannot be corrupted by false history entries. Content-based detection is authoritative — it checks what the verify report actually says, not what `.saves.json` implies.

### `packages/cli/tests/commands/artifact.test.ts` (modify)
**What changes:** Update existing archive tests to include opposing-stage entries in `.saves.json` (so the gate permits archiving). Add new tests for same-session correction scenarios (gate blocks archiving). Add tests for companion gating.
**Pattern to follow:** The existing archive test pattern at lines 3300-3530 — `createTestProject`, `createSlugDir`, write-commit-overwrite-save cycle.
**Why:** Existing archive tests will fail under the new gate because they don't set up opposing-stage timestamps. They need `.saves.json` entries where the opposing stage has a timestamp between the two saves.

### `packages/cli/tests/utils/proofSummary.test.ts` (modify)
**What changes:** Update the rejection-cycle timing test (line 4194) to include a verify report file with "Previous Findings Resolution" content so `parseRejectionCycles` returns cycles > 0. Add a test for content-based detection: no history arrays but verify report has rejection content → rejection timing branch activates. Add a test for false history with no rejection content → fallback branch (not rejection branch).
**Pattern to follow:** The existing `computeTiming` test setup at lines 4113-4125 — temp dir with slugDir, write `.saves.json`, call `generateProofSummary`.
**Why:** The existing rejection test relies on history arrays to trigger the branch. Under content-based detection, it needs a verify report file too.

## Acceptance Criteria

- [ ] AC1: Same-session re-save of verify-report does NOT create `_r` archive files when build-report has not been re-saved since the last verify-report save
- [ ] AC2: Same-session re-save of verify-report does NOT create a history entry in `.saves.json` for `verify-report` when the opposing stage has not advanced
- [ ] AC3: Same criteria for build-report — no false `_r` files or history entries when verify-report has not been re-saved since the last build-report save
- [ ] AC4: Genuine rejection cycles (opposing stage advanced between saves) still create `_r` archive files and history entries — behavior preserved
- [ ] AC5: Multi-phase numbered artifacts use phase-aware opposing key lookup (`verify-report-2` checks `build-report-2`)
- [ ] AC6: `computeTiming` uses `parseRejectionCycles` (report content) instead of `hasRejectionHistory` (`.saves.json` history arrays) to select the timing reconstruction path
- [ ] AC7: Companion artifacts (verify-data, build-data) follow the same gating as their parent report — no false companion archives on same-session re-save
- [ ] AC8: First-time saves (no prior entry in `.saves.json`) continue to work — no archiving, no history, no regression
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`
- [ ] No lint errors with `pnpm run lint`

## Testing Strategy

- **Unit tests (artifact.test.ts):**
  - Update all 8 existing archive tests (lines 3300-3530) to write a `.saves.json` with an opposing-stage entry timestamped between the first commit and the second save. This satisfies the gate and preserves existing test intent.
  - Add test: same-session re-save of verify-report without opposing-stage advancement → no `_r` files created, no history entry added.
  - Add test: same-session re-save of build-report without opposing-stage advancement → same gating behavior.
  - Add test: genuine rejection (opposing stage timestamp after current entry) → archiving proceeds, history entry created.
  - Add test: companion artifacts follow parent's gate — verify-data not archived when verify-report gate blocks.
  - Add test: multi-phase `verify-report-2` checks `build-report-2` opposing key, not `build-report`.
  - Add test: first-time save (no `.saves.json`) → no archiving, no crash.

- **Unit tests (proofSummary.test.ts):**
  - Update existing rejection-cycle test (line 4194): add a `verify_report.md` file to `slugDir` with a "Previous Findings Resolution" section containing an UNSATISFIED assertions table. History arrays remain for the timing reconstruction data.
  - Add test: no history arrays but verify report has rejection content → rejection timing branch activates.
  - Add test: history arrays present but verify report has no rejection content → fallback branch activates (not rejection branch). This validates the behavioral change.
  - Add test: verify report file missing → graceful fallback to simple endpoint-subtraction.

- **Edge cases:**
  - Multi-phase: `verify_report_1.md` with rejection content, `verify_report_2.md` without → rejection branch still activates (any phase triggers it).
  - Empty `.saves.json` or malformed JSON → existing error handling covers this (fresh `saves = {}`).

## Dependencies

- `parseRejectionCycles` already exported from proofSummary.ts — no new exports needed.
- `deriveCompanionKey` already exists as the structural analog — no new patterns introduced.

## Constraints

- Both save paths (`saveArtifact` and `saveAllArtifacts`) must apply the same gate. Every change to one path must be mirrored in the other.
- `writeSaveMetadata` is exported (used in tests). The signature change adds an optional parameter — backward compatible.
- `computeTiming` is internal (not exported). Signature change has no external impact.
- The gate must read `.saves.json` state from BEFORE the current write — this is naturally the case because archiving runs before `writeSaveMetadata` in both paths. Do not reorder these calls.

## Gotchas

- **Existing archive tests will break without `.saves.json` setup.** The 8 existing archive tests at lines 3300-3530 create a write-commit-overwrite-save cycle but never write `.saves.json`. Under the new gate, the absence of opposing-stage entries means the gate returns false and archiving is skipped. Every existing archive test needs a `.saves.json` with a properly-timed opposing-stage entry between the commit and the re-save.
- **`saveAllArtifacts` companion loop (lines 1801-1804) iterates companion objects, not artifact objects.** Companions have `{ fileName, key, absPath, relPath }` — no `typeInfo`. To gate, derive the parent report type from the companion key: `verify-data-2` → parent is `verify-report-2`. The `deriveOpposingReportKey` helper should accept companion keys too, or the gate should derive the parent key first.
- **`computeTiming` verify report file discovery.** Single-spec uses `verify_report.md`. Numbered uses `verify_report_1.md`, `verify_report_2.md`, etc. Use the same `getNumberedPhases('verify-report')` pattern already in `computeTiming` to discover which files to check. For single-spec, check `verify_report.md` directly. For multi-phase, iterate numbered keys and derive filenames.
- **`writeSaveMetadata` hash comparison runs before the gate.** The existing idempotency check (same hash → skip) runs at line 66-68, before the history push at line 72-77. If content is identical, the function returns early before the gate is ever evaluated. This is correct — identical content means nothing changed, so no history is needed regardless of stage state.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer early returns over nested conditionals.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Prefer named exports. No default exports.
- Test behavior, not implementation — assert on what the code produces.
- Prefer real implementations over mocks.
- Tests that create git repos must use `git init -b main`.
- Always pass `--run` flag when invoking Vitest.

### Pattern Extracts

**`deriveCompanionKey` — structural analog for `deriveOpposingReportKey` (artifact.ts:1117-1123):**
```typescript
function deriveCompanionKey(artifactType: string): string | null {
  const match = artifactType.match(/^(verify-report|build-report)(-\d+)?$/);
  if (!match) return null;
  const base = match[1] === 'verify-report' ? 'verify-data' : 'build-data';
  const suffix = match[2] ?? '';
  return `${base}${suffix}`;
}
```

**`writeSaveMetadata` idempotency and history push — the block to gate (artifact.ts:66-77):**
```typescript
  // Idempotent: skip write if hash matches existing entry
  const existing = saves[artifactType];
  if (existing && existing.hash === fullHash) {
    return false;
  }

  // Preserve previous timestamp and hash in history before overwriting
  if (existing && existing.saved_at && existing.hash) {
    const historyEntry = { saved_at: existing.saved_at, hash: existing.hash };
    const history = existing.history ?? [];
    history.push(historyEntry);
    saves[artifactType] = {
      saved_at: new Date().toISOString(),
      hash: fullHash,
      history,
    };
  } else {
    // First write — no history to preserve
    saves[artifactType] = {
      saved_at: new Date().toISOString(),
      hash: fullHash,
    };
  }
```

**`hasRejectionHistory` — the check to replace (proofSummary.ts:1708-1710):**
```typescript
  const buildReportEntry = saves['build-report'] as SaveEntry | undefined;
  const verifyReportEntry = saves['verify-report'] as SaveEntry | undefined;
  const hasRejectionHistory = !!(buildReportEntry?.history?.length || verifyReportEntry?.history?.length);
```

**`computeTiming` call site showing current signature (proofSummary.ts:1965):**
```typescript
      summary.timing = computeTiming(saves);
```

### Proof Context

- `artifact.ts`: "History array grows without bound across rejection cycles" — known, not addressed here. The gate reduces false entries but doesn't cap growth.
- `artifact.ts`: "writeSaveMetadata exported for testing — widens public API surface" — the optional parameter addition is backward compatible, doesn't worsen this.
- `proofSummary.ts`: "proofSummary.ts ~2330 lines — past comfort threshold" — known. This change adds ~10 lines, not a significant contributor.

### Checkpoint Commands

- After `artifact.ts` changes: `(cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts)` — Expected: existing tests updated, new gate tests pass
- After `proofSummary.ts` changes: `(cd packages/cli && pnpm vitest run tests/utils/proofSummary.test.ts)` — Expected: existing timing tests updated, new content-based tests pass
- After all changes: `pnpm run test -- --run` — Expected: 2856+ tests pass (baseline + new tests)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2856 passed, 2 skipped
- Current test files: 122
- Command used: `pnpm run test -- --run`
- After build: expected 2856 + ~11 new tests across 122 test files
- Regression focus: `artifact.test.ts` (archive tests need `.saves.json` setup), `proofSummary.test.ts` (rejection timing test needs verify report file)
