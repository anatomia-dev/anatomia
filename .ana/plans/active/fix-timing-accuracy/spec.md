# Spec: Fix pipeline timing accuracy for multi-phase and rejection cycles

**Created by:** AnaPlan
**Date:** 2026-05-13
**Scope:** .ana/plans/active/fix-timing-accuracy/scope.md

## Approach

Two changes that work together to fix inaccurate build/verify splits.

**Change 1: Preserve timestamp history on overwrite.** In `writeSaveMetadata()` (artifact.ts), before overwriting an artifact entry with new content, push the old `{ saved_at, hash }` to a `history` array on the entry. The existing hash-based idempotency guard at line 64-66 naturally prevents history entries on no-op re-saves — if the hash matches, the function returns early before reaching the overwrite logic.

**Change 2: Segment-based timing computation.** In `computeTiming()` (proofSummary.ts), add a segment-based computation path that runs when multi-phase keys or history data are detected. Instead of endpoint subtraction (latest build timestamp minus contract timestamp = build time), sum per-phase or per-cycle segments where each segment's boundaries are derived from artifact `saved_at` timestamps.

The existing computation path stays intact as the fallback for single-phase proofs without history. `getLatestTime()` is still used for `total_minutes` calculation.

**Segment boundary derivation (no `_started_at` dependency):**
- Phase 1 build starts at `contract.saved_at`
- Phase N+1 build starts at `verify-report-N.saved_at`
- Each verify segment starts at the corresponding `build-report-N.saved_at`
- Each segment ends at its own artifact's `saved_at`

For rejection cycles with history, the timeline reconstructs from history entries:
- Cycle 1 build: `contract.saved_at` → `build-report.history[0].saved_at`
- Cycle 1 verify: `build-report.history[0].saved_at` → `verify-report.history[0].saved_at`
- Cycle 2 build: `verify-report.history[0].saved_at` → `build-report.saved_at` (current)
- Cycle 2 verify: `build-report.saved_at` → `verify-report.saved_at` (current)

**Detection logic:** Check for numbered keys (`build-report-1`, etc.) for multi-phase. Check for `history` arrays on build-report/verify-report entries for rejection cycles. If neither detected, fall through to existing computation.

**Duplicate types kept separate.** `SaveMetadata` (artifact.ts:31) and `SaveEntry` (proofSummary.ts:92) both gain `history?: Array<{ saved_at: string; hash: string }>`. They remain independent — write-side has required fields, read-side has optional fields. Different optionality contracts in different layers.

## Output Mockups

No user-facing output changes. The timing object shape is unchanged:

```json
{
  "total_minutes": 68,
  "think": 20,
  "plan": 16,
  "build": 25,
  "verify": 7
}
```

The only observable change: build/verify values become accurate for multi-phase and rejection proofs. The `total_minutes` value was already correct.

A saves.json entry after rejection now includes history:

```json
{
  "build-report": {
    "saved_at": "2026-05-13T11:30:00Z",
    "hash": "sha256:abc123...",
    "history": [
      { "saved_at": "2026-05-13T10:30:00Z", "hash": "sha256:def456..." }
    ]
  }
}
```

## File Changes

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:** `SaveMetadata` interface gains `history` field. `writeSaveMetadata()` pushes old `{ saved_at, hash }` to history array before overwriting when content has changed.
**Pattern to follow:** The existing read-modify-write pattern in `writeSaveMetadata()` (lines 45-77). The history push inserts between the idempotency check (line 65) and the overwrite (line 70). Follow the same shape as `archivePreviousVersion()` (line 183-231) — detect previous version exists, preserve it before replacing.
**Why:** Without history, rejection cycle timestamps are lost on overwrite. The old `saved_at` is the only record of when the original build/verify completed.

### `packages/cli/src/utils/proofSummary.ts` (modify)
**What changes:** `SaveEntry` interface gains `history` field. `computeTiming()` gains segment-based computation for multi-phase and rejection-with-history cases. Existing computation path unchanged as fallback.
**Pattern to follow:** The existing fallback chain in `computeTiming()` — `_started_at` preferred, artifact-gap fallback, `MAX_PHASE_MS` sanity guard. The new segment computation is a third tier that runs before the existing code when multi-phase or history data is detected.
**Why:** The current endpoint-subtraction model conflates all phases and cycles into a single interval. Only segment-based computation can produce accurate splits.

### `packages/cli/tests/utils/proofSummary.test.ts` (modify)
**What changes:** New test cases for multi-phase timing, rejection timing with history, idempotent re-save (no history), mixed scenarios, and backward compatibility.
**Pattern to follow:** Existing timing tests at line 447+ — construct mock saves data inline, write to `.saves.json`, call `generateProofSummary()`, assert timing fields.
**Why:** Every new computation path needs test coverage.

## Acceptance Criteria
- [ ] AC1: `writeSaveMetadata()` preserves the previous `{ saved_at, hash }` in a `history` array when overwriting an artifact entry with different content
- [ ] AC2: `SaveEntry` type includes optional `history?: Array<{ saved_at: string; hash: string }>` in both `artifact.ts` and `proofSummary.ts`
- [ ] AC3: `computeTiming()` produces accurate build/verify splits for multi-phase builds by summing per-phase segments from numbered keys
- [ ] AC4: `computeTiming()` produces accurate build/verify splits for rejection cycles when history data is available
- [ ] AC5: `computeTiming()` falls back to existing endpoint-subtraction for old proofs without history or numbered keys (backward compatibility)
- [ ] AC6: Existing tests pass, new tests cover multi-phase timing, rejection timing with history, and mixed scenarios
- [ ] AC7: The proof chain timing schema (`{ total_minutes, think, plan, build, verify }`) is unchanged — no downstream consumer breaks
- [ ] AC8: No build errors, `pnpm run build` passes
- [ ] AC9: Idempotent re-save (same hash) does NOT create a history entry

## Testing Strategy

- **Unit tests (via `generateProofSummary`):** `computeTiming` is private — all tests go through `generateProofSummary()` with mock `.saves.json` data. Follow the existing pattern at line 447+.
- **Test cases to write:**
  - **Multi-phase 2 phases:** saves with `build-report-1`, `verify-report-1`, `build-report-2`, `verify-report-2`. Assert build = sum of per-phase build segments, verify = sum of per-phase verify segments.
  - **Multi-phase 3 phases:** Same pattern, 3 numbered key pairs. Validates the loop handles N phases.
  - **Rejection with history (1 cycle):** `build-report` and `verify-report` each with 1 history entry. Assert build and verify are summed across cycles.
  - **No history, no numbered keys (backward compat):** Existing saves shape. Assert timing matches the existing computation exactly.
  - **History with `build-data-N` keys present:** Verify `build-data-N` and `verify-data-N` keys are ignored in segment computation (they share parent timestamps, not timing-relevant).
  - **Segment exceeding `MAX_PHASE_MS`:** One segment > 24h should be excluded from build/verify totals.
- **Edge case tests:**
  - **Idempotent re-save:** Same hash → no history entry added. Test via `writeSaveMetadata` behavior reflected in saves.json (call twice with same content, verify history is absent).
  - **Multi-phase with `_started_at` values present:** The segment computation should take precedence over `_started_at`-based computation for build/verify when numbered keys are detected.

## Dependencies
None — both files exist, all test infrastructure is in place.

## Constraints

- **No proof chain schema change.** The output `{ total_minutes, think, plan, build, verify }` shape must not change. Downstream consumers (`work complete`, `proof health`, `proof chain display`) all depend on this shape.
- **Additive saves.json change.** Old saves.json without `history` must parse and compute identically. No migration, no backfill.
- **`build-data-N` and `verify-data-N` are NOT timing-relevant.** These companion data keys share the same `saved_at` as their parent report. The segment computation must filter them out — match `build-report-N` and `verify-report-N` only. The `getLatestTime` regex (`key.startsWith(baseKey + '-') && /\d+$/.test(key)`) would match `build-data-1` if called with `build-data` as baseKey, but `computeTiming` only calls it with `build-report` and `verify-report` so this isn't a current bug. The new segment enumeration must be equally specific.
- **`MAX_PHASE_MS` applies per-segment.** A segment > 24h indicates stale data, not a real build. Exclude that segment from the phase total. Note: `MAX_PHASE_MS` is currently declared twice in `computeTiming` (once for plan at line 1561, once for build/verify at line 1580) — extract to a single `const` at the top of the function.

## Gotchas

- **`SavesData` index signature.** The index signature at proofSummary.ts:127 is `[key: string]: SaveEntry | PreCheckData | undefined`. Adding `history` to `SaveEntry` flows through automatically — no index signature change needed. But be careful: the `readRawTimestamp` function (line 1534) reads raw string values like `work_started_at` which are NOT `SaveEntry` objects. Don't try to read `history` from those.
- **Phase enumeration order matters.** When enumerating numbered keys for segment computation, sort by phase number, not by insertion order. `Object.keys()` returns string keys in insertion order which happens to be numeric order in practice, but don't rely on it — parse the trailing number and sort.
- **History array ordering.** Entries should be in chronological order (oldest first). When pushing to history, always `push()` — the oldest entry is at index 0, newest at the end, matching the save timeline.
- **`writeSaveMetadata` return value semantics.** The function returns `true` if metadata was written. Adding the history push doesn't change this contract — it still returns `true` when content changes, `false` when idempotent skip.
- **The `getLatestTime` regex specificity.** The regex `/\d+$/` on `key.startsWith(baseKey + '-')` would match a hypothetical key like `build-report-data-1`. No such keys exist today, but the new segment enumeration should use the same or tighter pattern for consistency.
- **`modules_touched` is an array, not a `SaveEntry`.** It sits in saves.json alongside artifact entries. The segment enumeration must handle non-SaveEntry values in the saves object gracefully (check for `saved_at` property before treating as a segment boundary).

## Build Brief

### Rules That Apply
- All local imports use `.js` extensions. `import { foo } from './bar.js'`.
- Use `import type` for type-only imports, separate from value imports.
- Explicit return types on all exported functions. Internal helpers can use inference.
- Prefer early returns over nested conditionals.
- `@param` and `@returns` JSDoc tags required on exported functions. Internal helpers optional but recommended for complex logic.
- Always use `--run` flag with `pnpm vitest` to avoid watch mode hang.

### Pattern Extracts

**writeSaveMetadata — the overwrite site (artifact.ts:59-77):**
```typescript
  // Compute SHA256 of content
  const hash = createHash('sha256').update(content).digest('hex');
  const fullHash = `sha256:${hash}`;

  // Idempotent: skip write if hash matches existing entry
  const existing = saves[artifactType];
  if (existing && existing.hash === fullHash) {
    return false;
  }

  // Write entry for this artifact type
  saves[artifactType] = {
    saved_at: new Date().toISOString(),
    hash: fullHash,
  };

  fs.writeFileSync(savesPath, JSON.stringify(saves, null, 2));
  return true;
```

**Existing timing test pattern (proofSummary.test.ts:447-462):**
```typescript
  it('computes timing from save timestamps', async () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    expect(summary.timing.total_minutes).toBe(120); // 2 hours
    expect(summary.timing.think).toBe(30); // scope to contract
    expect(summary.timing.plan).toBe(30); // same as think
    expect(summary.timing.build).toBe(60); // contract to build
    expect(summary.timing.verify).toBe(30); // build to verify
  });
```

### Proof Context

**artifact.ts (5 pipeline cycles):**
- `MAX_PHASE_MS` declared twice in `computeTiming` — extract to single const (from Fix Pipeline Phase Timing)
- `archivePreviousVersion` uses string equality for content comparison — not relevant to this change but don't copy this pattern for history comparison (we use hash comparison)

**proofSummary.ts (14 pipeline cycles):**
- `SavesData` index signature treats `work_started_at` as `SaveEntry|PreCheckData|undefined` instead of string — known issue, don't introduce new raw string reads
- `MAX_PHASE_MS` declared twice in `computeTiming` — consolidate to one declaration at function top
- File is ~1550 lines — keep changes focused, don't refactor unrelated code

### Checkpoint Commands

- After `SaveMetadata` history field added to artifact.ts: `(cd packages/cli && pnpm vitest run)` — Expected: all 2178 existing tests pass (additive type change, no behavior change yet)
- After `computeTiming()` segment computation added: `(cd packages/cli && pnpm vitest run)` — Expected: existing timing tests still pass (fallback path unchanged)
- After new test cases added: `(cd packages/cli && pnpm vitest run)` — Expected: 2178 + new tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2178 passed, 2 skipped
- Current test files: 100
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2188+ tests (2178 + ~10 new timing tests) in 100 test files
- Regression focus: `proofSummary.test.ts` timing tests — the fallback path must produce identical results to existing tests
