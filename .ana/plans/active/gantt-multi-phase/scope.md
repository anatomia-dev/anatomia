# Scope: Multi-phase Gantt visualization for proof timeline

**Created by:** Ana
**Date:** 2026-05-13

## Intent

The pipeline Gantt chart on proof detail pages always renders 4 bars (Think, Plan, Build, Verify) regardless of how many phases a proof went through. A 3-phase proof like content-pages (108 minutes across 3 build/verify cycles) shows a single "Build 57m" bar and "Verify 30m" bar — hiding that phase 1 took 32+7 minutes, phase 2 took 14+13 minutes, and phase 3 took 11+10 minutes. The temporal shape of the pipeline run is invisible.

10 of 90 completed work items (11%) are multi-phase. This is growing — multi-phase builds are natural for larger features. The Gantt is the visual story of how pipeline time was spent. For multi-phase, that story has chapters the current chart can't tell.

This scope depends on `fix-timing-accuracy` (Scope A), which produces accurate per-phase timing from saves.json. This scope adds the schema field and visual rendering.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — 1 schema change (timing.segments), 1 component rewrite (PipelineGantt), updates to extraction + types + computeTiming
- **Files affected:**
  - `packages/cli/src/utils/proofSummary.ts` — ProofSummary timing type (line 56), `computeTiming()` produces segments
  - `packages/cli/src/types/proof.ts` — inherits timing change from ProofSummary, add `phases?: number` to ProofChainEntry
  - `packages/cli/src/commands/work.ts` — populate `phases` from `countPhases(plan.md)` in `writeProofChain()`
  - `packages/cli/src/commands/proof.ts` — `formatHumanReadable()` shows per-phase breakdown when segments exist
  - `website/lib/docs-data/types.ts` — ProofTiming gains optional `segments` array
  - `website/scripts/extract-docs-data.ts` — pass through segments from proof chain to ProofEntry
  - `website/components/docs/proof/PipelineGantt.tsx` — render N bars when segments exist, 4 bars when not
  - `website/app/docs/proof/[slug]/page.tsx` — timeline text adapts for multi-phase
- **Blast radius:** The timing type change touches CLI + website. ProofChainEntry inherits timing from ProofSummary (proof.ts:60), so the type change propagates automatically. The extraction script and PipelineGantt are the two website consumers. Old proofs without segments render as today — zero visual regression for existing entries. The `ana proof show` CLI display gets an optional per-phase breakdown.
- **Estimated effort:** 3-4 hours plan+build+verify
- **Multi-phase:** no

## Approach

Add an optional `segments` array to the proof chain timing field that represents the temporal sequence of pipeline stages. Think and Plan are always one segment each. For multi-phase proofs, Build and Verify alternate per phase: Build 1, Verify 1, Build 2, Verify 2, etc.

Segments are only present when phases > 1. Single-spec proofs (including ones with rejection cycles) keep flat timing only — Scope A's accurate aggregates are sufficient for 4-bar rendering.

The Gantt component detects segments and renders N bars (with phase labels) or falls back to the existing 4-bar layout. The flat fields (`think`, `plan`, `build`, `verify`) remain alongside segments for backward compatibility — any consumer that reads flat fields still works.

Rejection cycles within a phase are aggregated into that phase's build/verify segment, not shown as separate bars. The Gantt visualizes pipeline phases, not internal retry loops. Rejection count is already tracked as `rejection_cycles` on the proof entry.

## Acceptance Criteria
- AC1: ProofSummary timing type includes optional `segments?: Array<{ stage: string; minutes: number; phase?: number }>` — `phase` is only present on build/verify segments
- AC2: `computeTiming()` produces `segments` array for multi-phase proofs (saves.json has numbered keys like `build-report-1`, `verify-report-1`), omits it for single-spec proofs
- AC3: Segments are ordered temporally: think, plan, build-1, verify-1, build-2, verify-2, ..., build-N, verify-N
- AC4: The flat fields (`think`, `plan`, `build`, `verify`, `total_minutes`) are always present alongside segments. `build` and `verify` are the aggregates (sum of per-phase segments)
- AC5: ProofChainEntry gains optional `phases?: number`, populated from `countPhases(plan.md)` during `writeProofChain()`. Old entries without it are treated as single-phase
- AC6: ProofTiming in website types includes optional `segments` and `phases` fields
- AC7: The extraction script passes `segments` through from proof chain timing to ProofEntry when present
- AC8: PipelineGantt renders per-phase bars when `segments` exists — labels show "Build 1", "Verify 1", etc. Think and Plan remain unlabeled (always single)
- AC9: PipelineGantt renders 4 bars (current behavior) when `segments` is absent — old proofs unchanged
- AC10: Build/verify phase bars use the same brand color with opacity differentiation (build at 0.85, verify at 1.0) consistent across all phases
- AC11: Proof detail page timeline text adapts: "...across Think, Plan, Build, and Verify" for single-spec, "...across Think, Plan, and {N} Build→Verify phases" for multi-phase
- AC12: `formatHumanReadable()` in proof.ts shows per-phase breakdown when segments exist (e.g., "Build 1: 32 min, Verify 1: 7 min") below the aggregate timing
- AC13: Existing tests pass, new tests cover segment generation for multi-phase saves data and PipelineGantt rendering with/without segments

## Edge Cases & Risks

**Old proofs without segments.** 90 existing entries have no `segments` field. The Gantt must render 4 bars from flat timing for these. The extraction script and component handle both schemas.

**Multi-phase with rejection within a phase.** E.g., phase 2 had a FAIL→Fix cycle. Scope A's history-based computation produces accurate per-phase aggregates. Segments for phase 2 show the aggregated build and verify times, not the internal retry. This is the correct abstraction — the Gantt shows pipeline progression, not internal loops.

**Single-spec with rejection.** No segments produced. Scope A gives accurate aggregate build/verify. The 4-bar Gantt renders correctly. This is not a multi-phase proof.

**Phase count mismatch.** The `phases` field comes from `countPhases(plan.md)` (which counts `Spec:` references). The segment count comes from `computeTiming()` (which counts numbered keys in saves.json). These should agree but could diverge if a phase was skipped or plan.md was edited after completion. Defensive: if segments exist, derive phase count from segments. The `phases` field is advisory.

**Segment minutes don't sum to total.** Rounding can cause off-by-one. The Gantt uses percentages of `total_minutes`, not absolute pixel widths. Small rounding discrepancies in segment sums are visually harmless — the total is computed independently as (last event - first event).

**Very many phases.** No practical upper bound, but 3-4 is typical. At 10+ phases the Gantt would be very tall. Not a concern for current usage patterns.

**PipelineGantt performance.** Currently iterates a 4-element array. Multi-phase iterates up to ~12 elements (3 phases × 2 stages + think + plan). Negligible.

## Rejected Approaches

**Always emit segments, even for single-spec.** A single-spec proof would have segments `[think, plan, build, verify]` — identical to the flat fields. This adds schema weight to 90% of proofs for no visual difference. Segments are only useful when they show information the flat fields can't.

**Show rejection cycles as separate bars.** A phase with a FAIL→Fix would show Build 2a, Verify 2 (FAIL), Build 2b, Verify 2 (PASS). This adds visual complexity for a detail that most users don't need. The rejection count is already shown elsewhere on the proof page. The Gantt is about pipeline phases, not retry granularity.

**Separate timing.phases from timing.segments.** The requirements doc suggests phases as part of the segment schema. But `phases` as a top-level entry field (like `rejection_cycles`) is cleaner — it describes the work item's structure, not just the timing. Segments are the timing data; phases is the metadata.

**Rewrite PipelineGantt as a canvas/SVG chart.** The current implementation uses inline styles on divs. This works well for the simple 4-bar layout and extends naturally to N bars. Canvas/SVG would add complexity for no visual gain — the Gantt is decorative, not interactive.

## Open Questions

None. Design decisions are made:
1. Segments only for multi-phase → yes
2. Rejection aggregated per phase → yes
3. `phases` as top-level entry field → yes
4. Flat fields alongside segments → yes (backward compat)
5. Phase labels in Gantt → "Build 1", "Verify 1", etc.

## Exploration Findings

### Patterns Discovered
- PipelineGantt.tsx uses a hardcoded `STAGES` array with `key`, `label`, `opacity` (line 8-13). Multi-phase rendering replaces this with a dynamic array built from segments.
- Each Gantt bar uses a 3-column grid: label (60px), bar (1fr), duration (50px). The bar positions use cumulative left offsets. Multi-phase extends this pattern — left offsets are cumulative across all segments.
- The extraction script normalizes timing at lines 151-166: `snake_case → camelCase`, defaults to 0 for missing stages. Segments need the same normalization.
- `countPhases()` in work.ts:157 counts `Spec:` references in plan.md's `## Phases` section. This is the source for the `phases` field.
- ProofChainEntry's timing type at proof.ts:60 is `ProofSummary['timing']` — direct inheritance. Adding `segments` to ProofSummary propagates automatically.

### Constraints Discovered
- [TYPE-VERIFIED] ProofTiming in website (types.ts:22-28) is a separate manually-defined type, not imported from CLI. Must be updated independently.
- [TYPE-VERIFIED] The `timing` field in ProofSummary (proofSummary.ts:56-62) is an inline object type, not a named interface. The `segments` type must be defined inline or extracted.
- [OBSERVED] The supermock Gantt has no multi-phase concept — 4 bars always. The expanded rendering is a net-new visual design, not a supermock translation.
- [OBSERVED] 10/90 completed items are multi-phase (2-3 phases each). Zero proof chain entries currently record phase count.
- [OBSERVED] The proof detail page text at [slug]/page.tsx:68 says "across Think, Plan, Build, and Verify" — hardcoded string that needs conditional logic.

### Test Infrastructure
- PipelineGantt is a React component — tests would use React rendering or snapshot testing. The website doesn't currently have component tests (all testing is in the CLI package). The Gantt logic (building the bar array from segments) can be extracted as a pure function and tested in the CLI package's test suite.
- computeTiming segment generation can be tested alongside Scope A's timing tests — same mock saves.json data, additional assertions on the segments output.

## For AnaPlan

### Structural Analog
The closest analog is the existing `computeTiming()` multi-phase key walking in Scope A (`fix-timing-accuracy`). Scope A walks numbered keys to sum per-phase build/verify. This scope captures the per-phase values individually instead of summing them. The extraction is the same loop — the output shape differs.

### Relevant Code Paths
- `packages/cli/src/utils/proofSummary.ts:56-62` — ProofSummary timing type. Add `segments?` field.
- `packages/cli/src/utils/proofSummary.ts:1501-1609` — `computeTiming()`. The multi-phase computation from Scope A produces per-phase values that are summed for aggregates. This scope captures the intermediate values as segments.
- `packages/cli/src/types/proof.ts:47-98` — ProofChainEntry type. Add `phases?: number`.
- `packages/cli/src/commands/work.ts:811-891` — `writeProofChain()`. Populate `entry.phases` from `countPhases()`.
- `packages/cli/src/commands/work.ts:157-179` — `countPhases()`. Already exists, returns `{ total, specs }`.
- `packages/cli/src/commands/proof.ts:284-301` — `formatHumanReadable()` timing display. Add per-phase breakdown.
- `website/lib/docs-data/types.ts:22-28` — ProofTiming type. Add `segments?` and match segment shape.
- `website/scripts/extract-docs-data.ts:151-166` — Timing normalization. Pass through segments.
- `website/components/docs/proof/PipelineGantt.tsx` — Full component. Rewrite rendering logic.
- `website/app/docs/proof/[slug]/page.tsx:66-70` — Timeline section text and Gantt mount.

### Patterns to Follow
- PipelineGantt's current grid layout pattern (60px label, 1fr bar, 50px duration)
- Opacity differentiation by stage type (build: 0.85, verify: 1.0)
- ProofChainEntry's optional field pattern (e.g., `kind?: string`, `worktree?: {...}`) for backward-compatible additions
- Extraction script's normalization pattern (snake_case → camelCase, defaults for missing fields)

### Known Gotchas
- This scope DEPENDS on `fix-timing-accuracy`. The segment computation uses Scope A's per-phase key walking and history-aware timing. Plan must sequence this after Scope A is merged.
- The ProofTiming website type is manually defined, not auto-generated from CLI types. Adding `segments` to ProofSummary does NOT automatically update ProofTiming — both must be changed.
- `formatHumanReadable()` in proof.ts is also used by `ana proof show --json` (via the JSON wrapper). The per-phase breakdown is display-only — the JSON output already includes the timing object which will contain segments.
- The `phases` field on ProofChainEntry is a new top-level field. Per the cross-cutting comment at proof.ts:16-21, this requires changes in 4+ locations. But since it's optional and only used for display, the requirement is lighter: type definition, entry construction, and formatHumanReadable display. No default needed in generateProofSummary (it doesn't track phases).

### Things to Investigate
- Should segments include a `started_at` ISO timestamp alongside `minutes`? This would enable future features like absolute timeline rendering (clock time, not just duration). The cost is ~30 bytes per segment. Plan should decide whether this forward-looking data is worth including now.
- The Gantt bar positioning: current implementation uses cumulative left offsets per bar, but each bar renders on its own row (separate divs). This means left offset is technically unnecessary — the bar fills proportionally within its own track. Check whether the left offset is a visual feature (showing temporal position) or a vestige. If it's intentional positioning, multi-phase bars need cumulative offsets across all segments.
