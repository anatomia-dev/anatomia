# Scope: Fix sampler budget overflow

**Created by:** Ana
**Date:** 2026-05-20

## Intent
The `allocateBudget` function in the proportional sampler can allocate more files than the budget allows. When the budget is smaller than the number of non-empty depth buckets, the first-pass floor allocation exceeds the budget and `remaining` goes negative. The function's contract says "budget" and it should mean budget. Source: Learn Session 7, finding `fix-deep-tier-sampling-C2`.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — 1 production file (one-line guard + comment), 1 test file (new test)
- **Surface:** cli
- **Files affected:** `packages/cli/src/engine/sampling/proportionalSampler.ts`, `packages/cli/tests/engine/sampling/` (new or existing test file)
- **Blast radius:** Contained. `allocateBudget` is a private function called only from `globFromDir` in the same module. The fix reduces allocations when budget is very small — but a top-level `allFiles.slice(0, budget)` trim at line 168-169 of `sampleFiles` already prevents wrong final output. This fix makes the internal function honor its contract and avoids wasting work on over-sampling.
- **Estimated effort:** Under 20 minutes
- **Multi-phase:** no

## Approach
Add a `&& remaining > 0` guard to the first-pass loop in `allocateBudget` so floor allocation stops when the budget is exhausted. Add a comment documenting that when budget < bucket count, shallow files get priority because bucket iteration order is shallow → mid → deep (established at line 208). Test through the public `sampleFiles` interface by creating a scenario where multiple depth categories have files but the budget is small.

## Acceptance Criteria
- AC1: `allocateBudget` never returns allocations that sum to more than the budget parameter.
- AC2: When budget < non-empty bucket count, shallow buckets receive allocation before mid and deep buckets (iteration order bias).
- AC3: A comment at the guard explains the shallow-priority behavior: when budget is smaller than the number of non-empty buckets, allocation favors shallower files because buckets are ordered shallow → mid → deep.
- AC4: A test creates a scenario with files at multiple depth levels and a small budget, verifying total sampled files do not exceed budget.
- AC5: Existing sampler tests continue to pass unchanged.

## Edge Cases & Risks
- **budget=0:** The first pass does nothing (remaining starts at 0, guard blocks all allocation). Second pass skips. Returns all-zero allocations. Correct behavior.
- **budget=1, 3 non-empty buckets:** First pass allocates 1 to shallow, guard blocks mid and deep. Returns [1, 0, 0]. Correct — shallow gets priority.
- **budget >= bucket count:** Guard never triggers. Behavior identical to current code. No regression risk.
- **All buckets empty:** Early return at line 70 handles this. No interaction with the fix.

## Rejected Approaches
- **Minimum budget floor.** Could enforce `budget >= bucketCount` at the caller. But the caller (`globFromDir`) receives its limit from the per-root allocation in `sampleFiles`, which legitimately produces small values when there are many source roots. The fix should be in `allocateBudget`, not the caller.
- **Priority-aware allocation (largest buckets first).** When budget < bucket count, could sort buckets by size and allocate to the largest. More "fair" but adds complexity for a case that's already rare. The shallow-first bias from iteration order is actually desirable — shallow files are more likely to be meaningful entry points. Simplicity wins.
- **Export `allocateBudget` for direct testing.** Could export the private function to test it directly. Testing through the public `sampleFiles` interface is stronger — it tests the actual contract, not an internal detail.

## Open Questions
None. The fix is straightforward and the edge cases are enumerated.

## Exploration Findings

### Patterns Discovered
- `allocateBudget` uses a two-pass strategy: first pass assigns floor of 1 to each non-empty bucket, second pass distributes remaining budget proportionally to file count. The second pass already has a `remaining > 0` guard at line 85. The first pass lacks this guard.
- `sampleFiles` at line 168-169 trims the final output: `return allFiles.slice(0, budget)`. This means the overflow from `allocateBudget` doesn't produce wrong final output, but individual `globFromDir` calls over-sample, wasting glob and sort work.

### Constraints Discovered
- [TYPE-VERIFIED] `allocateBudget` is private — not exported, called only from `globFromDir` at line 214
- [TYPE-VERIFIED] Buckets are always `[shallow, mid, deep]` — exactly 3 buckets, created at line 208
- [OBSERVED] The bug triggers when budget < 3 and all 3 depth buckets have files — realistic when `sampleFiles` distributes a small overall budget across many source roots
- [TYPE-VERIFIED] `sampleFiles` has a safety trim at line 168-169 that prevents incorrect final output

### Test Infrastructure
- Sampler tests live in `packages/cli/tests/engine/sampling/`. The test should create a `ProjectCensus`-compatible structure or call `sampleFiles` directly. Check the existing test patterns in that directory.

## For AnaPlan

### Structural Analog
The second-pass `remaining > 0` guard at line 85 of `allocateBudget` — the fix applies the same pattern to the first pass. Identical guard, different loop.

### Relevant Code Paths
- `packages/cli/src/engine/sampling/proportionalSampler.ts:68-82` — `allocateBudget` function, first-pass loop at lines 77-82 needs the guard
- `packages/cli/src/engine/sampling/proportionalSampler.ts:208-212` — bucket creation order (shallow, mid, deep) that determines allocation priority under the fix
- `packages/cli/src/engine/sampling/proportionalSampler.ts:168-169` — existing safety trim in `sampleFiles`
- `packages/cli/tests/engine/sampling/` — test directory

### Patterns to Follow
- The guard pattern already exists at line 85 (`if (remaining > 0)`). Apply the same pattern as `&& remaining > 0` in the first-pass condition at line 78.
- Comment style: match the existing inline comments in the function (e.g., "// First pass: assign floor of 1 to each non-empty bucket").

### Known Gotchas
- The `DepthBucket` interface uses `label` not `name` — use `label` in any test assertions.
- Testing through `sampleFiles` requires a `ProjectCensus` object. Check the interface and existing test fixtures to understand the minimum viable census for this test.
- The test must create files at multiple depth levels (shallow ≤ 2, mid 3-5, deep 6+) to populate all 3 buckets, then set a budget smaller than 3.

### Things to Investigate
- Check the existing test file structure in `packages/cli/tests/engine/sampling/` to determine whether to add to an existing file or create a new one.
