# Spec: Multi-phase Gantt visualization for proof timeline

**Created by:** AnaPlan
**Date:** 2026-05-13
**Scope:** .ana/plans/active/gantt-multi-phase/scope.md

## Approach

Extend the existing multi-phase timing loop in `computeTiming()` to capture per-phase durations as a `segments` array alongside the existing flat timing fields. The loop at proofSummary.ts:1615-1648 already iterates each phase and computes build/verify milliseconds — this change captures each phase's values individually instead of only summing them.

Segments are only emitted for multi-phase proofs (numbered build-report keys in saves.json). Single-spec proofs — including those with rejection cycles — keep flat timing only. The flat fields (`think`, `plan`, `build`, `verify`, `total_minutes`) remain unchanged for backward compatibility.

The segments flow through the pipeline: ProofSummary timing → ProofChainEntry timing (inherited) → extraction script → website ProofTiming → PipelineGantt. The Gantt detects segments and renders N bars (with phase labels) or falls back to the existing 4-bar layout.

A `phases` field is added to ProofChainEntry as a top-level optional field (like `rejection_cycles`), populated from `countPhases(plan.md)` during `writeProofChain()`.

The Gantt bar-building logic is extracted as a pure function testable in the CLI package's vitest suite, keeping the rendering untested but the data transformation covered.

## Output Mockups

### CLI: `ana proof show` with multi-phase timing

```
  Timing
  ──────
  Total        108 min
  Think          8 min
  Plan          13 min
  Build         57 min
  Verify        30 min

  Phase breakdown
    Build 1     32 min
    Verify 1     7 min
    Build 2     14 min
    Verify 2    13 min
    Build 3     11 min
    Verify 3    10 min
```

### CLI: single-phase (unchanged)

```
  Timing
  ──────
  Total        45 min
  Think         5 min
  Plan         10 min
  Build        20 min
  Verify       10 min
```

### Website: proof detail page timeline text

Single-phase (unchanged):
> Intent to proven code in 45 min across Think, Plan, Build, and Verify.

Multi-phase:
> Intent to proven code in 1h 48m across Think, Plan, and 3 Build→Verify phases.

### Website: PipelineGantt bars

Single-phase: 4 rows (Think, Plan, Build, Verify) — unchanged.

Multi-phase (3 phases): 8 rows:
```
THINK     ████░░░░░░░░░░░░░░░░░░░░░░░  8m
PLAN      ░░░░████████░░░░░░░░░░░░░░░░ 13m
BUILD 1   ░░░░░░░░░░░░████████████████ 32m
VERIFY 1  ░░░░░░░░░░░░░░░░░░░░░░░░░██  7m
BUILD 2   ░░░░░░░░░░░░░░░░░░░░░░░░░░█ 14m
VERIFY 2  ░░░░░░░░░░░░░░░░░░░░░░░░░░█ 13m
BUILD 3   ░░░░░░░░░░░░░░░░░░░░░░░░░░█ 11m
VERIFY 3  ░░░░░░░░░░░░░░░░░░░░░░░░░░█ 10m
```

Labels: "THINK", "PLAN" (no number), "BUILD 1", "VERIFY 1", etc.
Opacity: think 0.55, plan 0.70, build phases 0.85, verify phases 1.0.

## File Changes

### `packages/cli/src/utils/proofSummary.ts` (modify)
**What changes:** Add `segments?` to the inline timing type at line 56. Modify `computeTiming()` to populate segments during the multi-phase loop. The existing loop at lines 1620-1648 already computes per-phase durations — capture each as a segment object instead of only accumulating sums.
**Pattern to follow:** The existing multi-phase loop structure. Each iteration already has `durationMs` for both build and verify — wrap those into segment objects and push to an array.
**Why:** Without segments, the Gantt can only show 4 aggregated bars, hiding how time was distributed across phases.

### `packages/cli/src/types/proof.ts` (modify)
**What changes:** Add `phases?: number` to ProofChainEntry (alongside existing optional fields like `kind?`, `worktree?`).
**Pattern to follow:** The existing optional field pattern on ProofChainEntry (e.g., `kind?: 'feature' | 'fix' | 'chore' | 'milestone' | undefined`).
**Why:** Consumers need to know phase count without parsing segments.

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** In `writeProofChain()` at the entry construction (line 874), populate `phases` from `countPhases()`. Read plan.md from the completed plan directory (the plan is archived before `writeProofChain` runs). If plan.md can't be read or parsed, omit the field.
**Pattern to follow:** The existing `countPhases()` call pattern at work.ts:157. The completed plan directory path is already constructed as `completedPlanDir` at line 866.
**Why:** The `phases` field records the work item's structural complexity in the proof chain.

### `packages/cli/src/commands/proof.ts` (modify)
**What changes:** In `formatHumanReadable()` at line 284, after the flat timing display, add a "Phase breakdown" subsection when `entry.timing.segments` exists. Show each segment as `"Build 1     32 min"` etc.
**Pattern to follow:** The existing timing display pattern at lines 288-301 (padEnd(12), chalk formatting).
**Why:** CLI users need to see per-phase timing without switching to `--json`.

### `website/lib/docs-data/types.ts` (modify)
**What changes:** Add `segments?` and `phases?` to the ProofTiming interface. Segment shape: `Array<{ stage: string; minutes: number; phase?: number }>`. Add `phases?: number` to ProofEntry.
**Pattern to follow:** The existing ProofTiming interface at lines 22-28.
**Why:** The website type is manually defined, independent of the CLI type. Must be updated separately.

### `website/scripts/extract-docs-data.ts` (modify)
**What changes:** In the timing normalization block (lines 151-166), pass through `segments` from `entry.timing.segments` when present. Also pass through `phases` from the entry's top-level `phases` field to the mapped ProofEntry.
**Pattern to follow:** The existing timing normalization pattern — defaults for missing fields, camelCase output.
**Why:** Without passthrough, segments are lost between proof chain and website rendering.

### `website/components/docs/proof/PipelineGantt.tsx` (modify)
**What changes:** When `timing.segments` exists, build the bar array from segments instead of the hardcoded `STAGES` array. Think and Plan get their values from the flat fields. Each build/verify segment gets a row with a phase-numbered label. When segments is absent, fall back to the existing 4-bar STAGES logic — zero visual regression for old proofs.
**Pattern to follow:** The existing bar rendering pattern: 3-column grid (60px label, 1fr bar, 50px duration), cumulative left offsets, opacity per stage type.
**Why:** The Gantt is the visual story of pipeline time. Multi-phase proofs need multiple chapters.

### `website/app/docs/proof/[slug]/page.tsx` (modify)
**What changes:** The timeline text at line 90 changes from a hardcoded string to conditional: "across Think, Plan, Build, and Verify" for single-phase, "across Think, Plan, and {N} Build→Verify phases" for multi-phase. Use `entry.timing.phases` or `entry.phases` to detect.
**Pattern to follow:** The existing inline style and `formatDuration` usage at line 90.
**Why:** The text must match the Gantt's visual representation.

### `packages/cli/tests/utils/proofSummary.test.ts` (modify)
**What changes:** Add tests for segment generation alongside the existing `computeTiming segment-based computation` describe block (line 3799). Test: 2-phase produces 6 segments (think, plan, build-1, verify-1, build-2, verify-2), 3-phase produces 8 segments, single-phase produces no segments, segment minutes match per-phase durations.
**Pattern to follow:** The existing multi-phase test pattern at lines 3833-3877 (saves.json fixtures, generateProofSummary assertions).
**Why:** Segment generation is the core logic. Tests prevent regressions in the timing computation.

## Acceptance Criteria

- [ ] AC1: ProofSummary timing type includes optional `segments?: Array<{ stage: string; minutes: number; phase?: number }>` — `phase` is only present on build/verify segments
- [ ] AC2: `computeTiming()` produces `segments` array for multi-phase proofs (saves.json has numbered keys like `build-report-1`, `verify-report-1`), omits it for single-spec proofs
- [ ] AC3: Segments are ordered temporally: think, plan, build-1, verify-1, build-2, verify-2, ..., build-N, verify-N
- [ ] AC4: The flat fields (`think`, `plan`, `build`, `verify`, `total_minutes`) are always present alongside segments. `build` and `verify` are the aggregates (sum of per-phase segments)
- [ ] AC5: ProofChainEntry gains optional `phases?: number`, populated from `countPhases(plan.md)` during `writeProofChain()`. Old entries without it are treated as single-phase
- [ ] AC6: ProofTiming in website types includes optional `segments` and `phases` fields
- [ ] AC7: The extraction script passes `segments` through from proof chain timing to ProofEntry when present
- [ ] AC8: PipelineGantt renders per-phase bars when `segments` exists — labels show "Build 1", "Verify 1", etc. Think and Plan remain unlabeled (always single)
- [ ] AC9: PipelineGantt renders 4 bars (current behavior) when `segments` is absent — old proofs unchanged
- [ ] AC10: Build/verify phase bars use the same brand color with opacity differentiation (build at 0.85, verify at 1.0) consistent across all phases
- [ ] AC11: Proof detail page timeline text adapts: "...across Think, Plan, Build, and Verify" for single-spec, "...across Think, Plan, and {N} Build→Verify phases" for multi-phase
- [ ] AC12: `formatHumanReadable()` in proof.ts shows per-phase breakdown when segments exist (e.g., "Build 1: 32 min, Verify 1: 7 min") below the aggregate timing
- [ ] AC13: Existing tests pass, new tests cover segment generation for multi-phase saves data and PipelineGantt rendering with/without segments
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`

## Testing Strategy

- **Unit tests (proofSummary.test.ts):** Add to the existing `computeTiming segment-based computation` describe block. Test cases:
  - 2-phase saves → 6 segments with correct stages, phases, and minutes
  - 3-phase saves → 8 segments with correct ordering
  - Single-phase saves → no `segments` field on timing
  - Rejection-cycle saves (history arrays) → no `segments` field
  - Segment minutes for each phase match the per-phase durations from the saves timestamps
  - Think and plan segments have no `phase` field; build/verify segments do
- **Integration tests:** Not needed — the extraction script and PipelineGantt are simple passthrough/rendering. The core logic (segment generation) is covered by unit tests.
- **Edge cases:**
  - Missing verify for last build phase (incomplete pipeline) — segments should still include the build segment, omit the missing verify
  - Zero-minute segment (build and verify timestamps identical) — segment with `minutes: 0` is valid

## Dependencies

- `fix-timing-accuracy` must be merged. **Status: completed and merged ✓.**
- No other dependencies.

## Constraints

- Backward compatibility: old proof chain entries without `segments` or `phases` must render identically to today. The Gantt fallback path and extraction defaults handle this.
- The website ProofTiming type is manually defined — not imported from CLI. Changes must be made in both places.
- The `phases` field on ProofChainEntry is advisory. If segments exist, derive phase count from segments for rendering. Don't depend solely on the `phases` field.

## Gotchas

- **ProofTiming is independent.** The website type at `website/lib/docs-data/types.ts:22-28` is manually defined, not auto-generated. Adding `segments` to ProofSummary does NOT update ProofTiming. Both must change.
- **`computeTiming` is not exported.** It's a private function in proofSummary.ts. You test it indirectly through `generateProofSummary()`. The existing tests at line 3833 do exactly this — write a `.saves.json` fixture, call `generateProofSummary(slugDir)`, assert on `summary.timing`.
- **Plan directory for `phases` field.** By the time `writeProofChain()` runs, the plan has been archived to `.ana/plans/completed/{slug}/`. Read plan.md from `completedPlanDir` (already constructed at work.ts:866), not from `active/`.
- **Segment stage names.** Use lowercase: `"think"`, `"plan"`, `"build"`, `"verify"`. These are data values consumed by the Gantt, not display labels. The Gantt capitalizes for display.
- **Left offset calculation in Gantt.** Each bar's left offset = cumulative percentage of all preceding segments relative to `totalMinutes`. This positions each bar at its temporal location within the total timeline. The existing code computes this at PipelineGantt.tsx:47-52. For multi-phase, the same logic applies but iterates the segments array instead of the STAGES array.
- **`formatHumanReadable` is display-only.** The `--json` output already includes the full timing object which will contain segments. The phase breakdown is only added to the human-readable text display.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins
- Use `import type` for type-only imports, separate from value imports
- Prefer named exports — no default exports
- Use `| null` for checked-empty fields, `?:` for unchecked-optional
- Explicit return types on exported functions; internal helpers use inference
- Exported functions require `@param` and `@returns` JSDoc
- Engine files have zero CLI dependencies (proofSummary.ts is in utils, not engine — chalk is acceptable there via proof.ts consuming the data)
- Always use `--run` with `pnpm vitest` to avoid watch mode hang

### Pattern Extracts

**Multi-phase loop in computeTiming — the code you're extending** (proofSummary.ts:1614-1651):
```typescript
  // --- Segment-based build/verify computation ---
  if (isMultiPhase && contractTime) {
    // Multi-phase: sum per-phase segments
    let buildMs = 0;
    let verifyMs = 0;

    for (let i = 0; i < buildPhases.length; i++) {
      const buildPhase = buildPhases[i]!;
      const verifyPhase = verifyPhases[i];

      // Build segment: previous verify (or contract for phase 1) → this build
      const segStart = i === 0
        ? contractTime
        : getTime(verifyPhases[i - 1]!.key);
      const segEnd = getTime(buildPhase.key);

      if (segStart !== null && segEnd !== null) {
        const durationMs = segEnd - segStart;
        if (durationMs >= 0 && durationMs <= MAX_PHASE_MS) {
          buildMs += durationMs;
        }
      }

      // Verify segment: this build → this verify
      if (verifyPhase) {
        const vStart = getTime(buildPhase.key);
        const vEnd = getTime(verifyPhase.key);
        if (vStart !== null && vEnd !== null) {
          const durationMs = vEnd - vStart;
          if (durationMs >= 0 && durationMs <= MAX_PHASE_MS) {
            verifyMs += durationMs;
          }
        }
      }
    }

    timing.build = Math.round(buildMs / 60000);
    timing.verify = Math.round(verifyMs / 60000);
  }
```

**PipelineGantt bar rendering — the pattern for each row** (PipelineGantt.tsx:40-57):
```tsx
      {STAGES.map((stage) => {
        const value = timing[stage.key];
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        // Zero-duration stages get a 2% minimum width so the gap is visible
        const widthPct = value === 0 ? 2 : pct;

        // Calculate left offset: sum of preceding stages
        let left = 0;
        for (const s of STAGES) {
          if (s.key === stage.key) break;
          const v = timing[s.key];
          left += total > 0 ? Math.round((v / total) * 100) : 0;
        }

        return (
          <div key={stage.key} style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 50px",
```

**Existing multi-phase test pattern** (proofSummary.test.ts:3833-3853):
```typescript
  // @ana A007, A008, A011
  it('computes accurate build time for 2-phase pipeline', async () => {
    const saves = {
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report-1': { saved_at: '2026-04-01T11:00:00Z' },
      'verify-report-1': { saved_at: '2026-04-01T11:08:00Z' },
      'build-report-2': { saved_at: '2026-04-01T11:23:00Z' },
      'verify-report-2': { saved_at: '2026-04-01T11:37:00Z' },
    };
    fs.writeFileSync(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    expect(summary.timing.build).toBe(45);
    expect(summary.timing.verify).toBe(22);
    expect(summary.timing.total_minutes).toBe(97);
  });
```

### Proof Context

No active proof findings for affected files.

### Checkpoint Commands

- After proofSummary.ts changes: `(cd packages/cli && pnpm vitest run tests/utils/proofSummary.test.ts)` — Expected: existing timing tests still pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2208+ tests pass
- Lint: `pnpm run lint`
- Build: `pnpm run build`

### Build Baseline
- Current tests: 2208 passed, 2 skipped (2210 total)
- Current test files: 100
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2216+ tests (8+ new segment tests) in 100 test files
- Regression focus: `tests/utils/proofSummary.test.ts` (timing tests), `tests/commands/proof.test.ts` (formatHumanReadable output)
