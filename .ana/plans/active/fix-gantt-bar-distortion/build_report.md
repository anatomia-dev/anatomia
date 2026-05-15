# Build Report: Fix Gantt Bar Distortion and Document Timing

**Created by:** AnaBuild
**Date:** 2026-05-15
**Spec:** .ana/plans/active/fix-gantt-bar-distortion/spec.md
**Branch:** feature/fix-gantt-bar-distortion

## What Was Built

- `website/components/docs/proof/PipelineGantt.tsx` (modified): Changed `buildGanttBars` denominator from `timing.totalMinutes` (wall-clock) to sum of rendered phase values. Removed `lefts.push(100)` sentinel from both segment and flat paths. Added `Math.max(0, ...)` clamping on phase values when accumulating and computing widths. Moved zero guard into each path using computed sum instead of wall-clock total. Widths now computed directly as `(value / total) * 100` instead of from adjacent left positions.
- `website/content/docs/guides/reading-a-proof.mdx` (modified): Expanded "The timeline" section with three new subsections: "What each phase measures" (session start to artifact save), "Why duration exceeds the sum of phases" (idle time between sessions), and "Multi-phase timing" (per-phase bars proportional to active time). Preserved `ana:dynamic medianTimings` marker.
- `website/public/llms-full.txt` (modified): Regenerated via `pnpm prebuild`.
- `website/public/search-index.json` (modified): Regenerated via `pnpm prebuild`.

## PR Summary

- Fix Gantt chart bar width distortion where the last bar absorbed idle time gaps (e.g., 86% width for a 3-minute verify phase)
- Change denominator from wall-clock `totalMinutes` to sum of active phase durations, making bars proportional to actual work time
- Clamp negative phase values to zero and handle all-zero-phases edge case
- Expand "The timeline" docs section explaining phase measurement, idle time gaps, and multi-phase timing
- Regenerate search index and LLM context files

## Acceptance Criteria Coverage

- AC1 "Gantt bars proportional to active phase duration" → Code: `(value / total) * 100` where total is sum of phases. For 13/2/3/3: think=61.9%, plan=9.5%, build=14.3%, verify=14.3%. ✅
- AC2 "No lefts.push(100) sentinel in flat or segment path" → Both removed. ✅
- AC3 "findings-expand-collapse verify at ~14%, not 86%" → `3/21 * 100 = 14.29%`. ✅
- AC4 "content-pages last segment proportional" → Last segment computed as `value/total * 100`, not forced to 100%. ✅
- AC5 "Zero-duration phases get minimum width" → `value === 0 ? 2 : ...` guard preserved in both paths. ✅
- AC6 "Timeline docs explain phases, timestamps, idle time, multi-phase" → Three new `<p>` subsections added. ✅
- AC7 "llms-full.txt and search-index.json regenerated" → `pnpm prebuild` ran successfully. ✅
- AC8 "Website builds cleanly" → `pnpm build` succeeds, 2/2 tasks. ✅
- AC9 "Negative values clamped to 0" → `Math.max(0, seg.minutes)` and `Math.max(0, timing[stage.key])` in both paths. ✅
- AC10 "Zero active time returns empty array" → `if (total === 0) return []` after computing sum, in both paths. ✅

## Implementation Decisions

- **Width computation changed from adjacent-lefts to direct.** The spec says "cumulative positioning approach stays" — left positions are still cumulative. But without the sentinel, widths are computed as `(value / total) * 100` instead of `lefts[i+1] - lefts[i]`. Mathematically equivalent with correct denominator. Simpler code, no sentinel needed.
- **Zero guard moved into each path.** The old top-level `const total = timing.totalMinutes; if (total === 0) return []` is replaced by per-path guards after computing the sum. This means an entry with `totalMinutes > 0` but all phase values = 0 correctly returns empty.
- **`minutes` field preserves original value.** The `bars[].minutes` field stores the original `seg.minutes` / `timing[stage.key]`, not the clamped value. The clamped value is only used for positioning and width. This preserves display accuracy — negative values would show as "−2m" in the label while rendering as 0-width bars.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
$ pnpm build
Tasks: 2 successful, 2 total
Cached: 0 cached, 2 total
Time: 8.144s
```
No website test suite exists. CLI tests unaffected.

### After Changes
```
$ pnpm build
Tasks: 2 successful, 2 total
Cached: 1 cached, 2 total
Time: 6.903s

$ pnpm run lint
Tasks: 2 successful, 2 total
Cached: 0 cached, 2 total
Time: 4.015s
```

### Comparison
- Tests added: 0 (no website test suite; build-only verification per spec)
- Tests removed: 0
- Regressions: none

### New Tests Written
None — spec's testing strategy is build-only. No website test framework exists.

## Verification Commands
```
pnpm build
pnpm run lint
```

## Git History
```
357f32f2 [fix-gantt-bar-distortion] Expand timeline docs and regenerate assets
dfb2c871 [fix-gantt-bar-distortion] Fix buildGanttBars denominator and remove sentinels
```

## Open Issues

None — verified by second pass. The code change is arithmetic (denominator swap + clamping), the docs change is additive prose, and the regenerated files are machine-generated. No unused parameters, no assumptions about external state, no unhandled edge cases beyond what the spec identified.
