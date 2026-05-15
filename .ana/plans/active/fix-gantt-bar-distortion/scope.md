# Scope: Fix Gantt Bar Distortion and Document Timing

**Created by:** Ana
**Date:** 2026-05-15

## Intent

The pipeline Gantt chart on proof detail pages inflates the last bar to absorb idle time between phases. A proof with 21 minutes of active pipeline time and 129 minutes wall-clock shows Verify at 86% width instead of 14%. This affects 24% of all proof entries (13 severe, 11 moderate). Separately, the docs don't explain what timing measures or why duration can exceed the sum of phases — users see "2h 9m" in the header and "21m" in the bars and have no way to reconcile them.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — one pure function rewrite, one docs section expansion, one regeneration step
- **Files affected:** `website/components/docs/proof/PipelineGantt.tsx`, `website/content/docs/guides/reading-a-proof.mdx`, `website/public/llms-full.txt` (regenerated), `website/public/search-index.json` (regenerated)
- **Blast radius:** Low. `buildGanttBars` is a pure function with no consumers outside `PipelineGantt.tsx`. The docs change expands an existing section. No CLI code changes. No data schema changes.
- **Estimated effort:** 1-2 hours
- **Multi-phase:** no

## Approach

**Gantt fix:** Change the denominator in `buildGanttBars` from `timing.totalMinutes` (wall-clock) to the sum of the values being rendered (active phase time). Both the flat 4-bar path (lines 76-103) and the segment path (lines 42-73) have the same bug and get the same fix. Remove the `lefts.push(100)` sentinel — when the denominator equals the sum, cumulative positioning reaches 100% naturally. The original rounding-gap bug that motivated the sentinel cannot resurface: verified across all 103 proof entries, the worst-case gap with the new denominator and cumulative positioning is exactly 0%.

**Docs expansion:** Expand "The timeline" section in `reading-a-proof.mdx` (currently 2 sentences at lines 56-60) to explain what each phase measures, what the `_started_at` timestamps are, why duration includes idle time between sessions, and how multi-phase proofs work. Match the guide's existing style: terse, example-driven, no theory.

**Regeneration:** Run `website/scripts/extract-docs-data.ts` (prebuild) after editing MDX to update `llms-full.txt` and `search-index.json`.

## Acceptance Criteria

- AC1: Gantt bars are proportional to active phase duration, not wall-clock total — each bar's width is `phase_minutes / sum_of_all_phases * 100%`
- AC2: No `lefts.push(100)` sentinel in either the flat or segment path of `buildGanttBars`
- AC3: For `findings-expand-collapse` (13m think, 2m plan, 3m build, 3m verify): Verify bar renders at ~14% width, not 86%
- AC4: For `content-pages` (8-segment multi-phase): last segment renders proportionally, not inflated
- AC5: Zero-duration phases still render with a minimum width (existing `value === 0 ? 2 : ...` guard preserved)
- AC6: "The timeline" section in `reading-a-proof.mdx` explains: what each phase measures (start-of-session to artifact-save), what `_started_at` timestamps are, why duration exceeds the sum of phases (idle time between sessions), and how multi-phase timing works
- AC7: `llms-full.txt` and `search-index.json` regenerated
- AC8: Website builds cleanly (`pnpm --filter anatomia-website check`)

## Edge Cases & Risks

- **Zero active time:** If all four phases are 0, the sum is 0 and division by zero occurs. The existing `if (total === 0) return []` guard at line 40 uses `timing.totalMinutes`. With the new denominator (sum of phases), this guard must use the computed sum instead. Entries where wall-clock is >0 but all phases are 0 would render "No timing data" — this is correct behavior (no active time was recorded).
- **Negative phase values:** The timing computation in `proofSummary.ts` can theoretically produce negative values if timestamps are out of order (e.g., clock skew). `buildGanttBars` should treat negative values as 0 for rendering purposes. Currently not guarded.
- **Multi-phase segment sum differs from flat field sum:** For multi-phase entries, the flat fields (think/plan/build/verify) are aggregates across all phases, while segments are per-phase. The segment path should use the segment sum, not the flat field sum. The flat path should use the flat field sum. These are already separate code paths.
- **Header text still says wall-clock:** "Intent to proven code in 2h 9m" remains correct — it's the wall-clock duration. The Gantt bars now show how that active time was distributed. No text change needed; the new docs section explains the distinction.

## Rejected Approaches

**Render idle time as gray gaps between bars.** Would make the Gantt a true timeline visualization with bars at their wall-clock positions and gaps visible. Rejected because it requires a fundamentally different layout (absolute positioning based on timestamps, not just widths) and most gaps would dominate the chart, making the active bars invisible slivers. The Gantt's job is to show the shape of active work, not the shape of human time.

**Change `totalMinutes` to mean sum-of-phases instead of wall-clock.** Would fix the Gantt but break the header text and CLI output, which correctly report wall-clock time. The data is right — the rendering is wrong.

**Add a "gap" bar to the Gantt.** Shows idle time as an explicit labeled bar. Rejected because idle time isn't a pipeline phase — it's human time (reviewing, sleeping, context switching). Adding it to the Gantt implies it's part of the pipeline. The docs explanation is the right place to surface this.

## Open Questions

None.

## Exploration Findings

### Patterns Discovered
- `PipelineGantt.tsx:buildGanttBars` is a pure function — takes `ProofTiming`, returns `GanttBar[]`. Exported but only consumed internally at line 120.
- The sentinel pattern (`lefts.push(100)`) was introduced in commit `1dce7f5c` ("Fix: Gantt bar rounding gaps") to prevent independent `Math.round` from leaving 1-2% gaps at the right edge. The fix was correct for its assumption (phases ≈ total) but that assumption is wrong for 24% of entries.
- The original pre-sentinel code computed each bar independently: `Math.round(value / total * 100)`. The current code computes cumulative left positions and derives widths from adjacent positions. The new fix keeps the cumulative approach but changes the denominator.

### Constraints Discovered
- [OBSERVED] 13 of 103 entries have gaps >50% (last bar severely distorted). 11 more have gaps 20-50%.
- [OBSERVED] When denominator = sum of phases and cumulative positioning is used, the worst-case rounding gap across all 103 entries is exactly 0% — sentinel is unnecessary.
- [OBSERVED] `dynamic-pages` has flat fields summing to 129 but segments summing to 100 (matching total) — the two paths use different data and need different sum calculations.
- [TYPE-VERIFIED] The `reading-a-proof.mdx` "The timeline" section is currently 2 sentences (lines 56-60) with a dynamic median comment.

### Test Infrastructure
- No website test suite exists. `buildGanttBars` is exported but untested. The CLI has a re-implemented version in `proofSummary.test.ts` that was used for the gantt-multi-phase contract — but that tests the CLI's timing computation, not the website's rendering function.

## For AnaPlan

### Structural Analog
The original `PipelineGantt.tsx` before commit `1dce7f5c` — it computed each bar independently with `(value / total) * 100`. The fix is the same idea but uses the cumulative positioning approach (which eliminates rounding gaps) with the correct denominator.

### Relevant Code Paths
- `website/components/docs/proof/PipelineGantt.tsx:38-104` — `buildGanttBars` function, both flat and segment paths
- `website/components/docs/proof/PipelineGantt.tsx:106-174` — `PipelineGantt` component (renders bars from `buildGanttBars`)
- `website/content/docs/guides/reading-a-proof.mdx:56-60` — "The timeline" section to expand
- `website/scripts/extract-docs-data.ts:157-168` — timing extraction (context only, not modified)
- `packages/cli/src/utils/proofSummary.ts:1583-1763` — `computeTiming` (context only, not modified)

### Patterns to Follow
- The existing `reading-a-proof.mdx` style: terse paragraphs, inline styled components for examples, no headings below H2 for subsections (uses bold text instead), specific proof slugs as examples.
- The `ana:dynamic` comment pattern at line 60 — marks content that gets refreshed by the build pipeline. Don't remove it.

### Known Gotchas
- The `total === 0` guard at line 40 uses `timing.totalMinutes`. After the fix, it should use the computed sum. An entry with wall-clock > 0 but all phases 0 should show "No timing data", not divide by zero.
- The flat path (lines 76-103) iterates `STAGES` which reads `timing[stage.key]`. The sum must be computed from these same values, not from `timing.totalMinutes`.
- The segment path (lines 42-73) iterates `timing.segments`. The sum must come from `timing.segments.reduce((s, seg) => s + seg.minutes, 0)`, not from the flat fields.
- `llms-full.txt` and `search-index.json` are generated by `website/scripts/extract-docs-data.ts`, invoked via `cd website && pnpm prebuild`. Must be run after editing MDX and committed.
- The `ana:dynamic` comment `{/* ana:dynamic medianTimings */}` on line 60 of `reading-a-proof.mdx` is a marker for the build pipeline to refresh median statistics. Don't remove or move it.

### Things to Investigate
None — all questions resolved during research.
