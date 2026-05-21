# Spec: Fix sampler budget overflow

**Created by:** AnaPlan
**Date:** 2026-05-20
**Scope:** .ana/plans/active/fix-sampler-budget-overflow/scope.md

## Approach

The `allocateBudget` function's first-pass loop assigns floor 1 to every non-empty bucket without checking whether the budget is exhausted. When `budget < nonEmpty.length`, `remaining` goes negative and the function returns allocations summing to more than the budget.

The fix applies the same `remaining > 0` guard that already exists on the second pass (line 85) to the first-pass loop condition. Add a comment above the guard explaining the shallow-priority consequence: when budget < bucket count, shallow buckets get allocation first because buckets are ordered `[shallow, mid, deep]`.

The `sampleFilesProportional` root-level allocation at lines 136–139 has the same bug pattern (floor 1 per root without a remaining check). However, the scope explicitly limits this fix to `allocateBudget`. The root-level allocation is protected by the final `allFiles.slice(0, budget)` trim at line 169, and the scope's blast radius assessment covers only the bucket allocation. Leave the root-level allocation for a separate scope if needed.

## Output Mockups

No user-visible output changes. This is an internal correctness fix. The only observable difference: when a source root receives a very small allocation from `sampleFilesProportional` and all 3 depth buckets have files, `globFromDir` will now sample fewer files from that root (correct) instead of over-sampling and relying on the final trim (wasteful).

## File Changes

### `packages/cli/src/engine/sampling/proportionalSampler.ts` (modify)
**What changes:** Add `&& remaining > 0` to the first-pass loop condition at line 78. Add a comment above explaining shallow-priority behavior under small budgets.
**Pattern to follow:** The second-pass guard at line 85 (`if (remaining > 0)`) — same pattern, different loop.
**Why:** Without this guard, `allocateBudget` violates its documented contract. Individual `globFromDir` calls over-sample, wasting glob and sort work even though the final trim prevents incorrect output.

### `packages/cli/tests/engine/sampling/proportional-sampler.test.ts` (modify)
**What changes:** Add a test that creates files at all 3 depth levels (shallow, mid, deep) with a budget of 2 (smaller than 3 non-empty buckets). Verify total sampled files ≤ budget and that shallow files are present (shallow-priority from iteration order).
**Pattern to follow:** The existing `includes files from all depth levels via stratification` test at line 144 — same directory structure setup, same `sampleFilesProportional` call, different budget and assertions.
**Why:** No existing test exercises the budget < bucket count path. Without this test, the guard could regress silently.

## Acceptance Criteria

- [ ] AC1: `allocateBudget` never returns allocations that sum to more than the budget parameter.
- [ ] AC2: When budget < non-empty bucket count, shallow buckets receive allocation before mid and deep buckets (iteration order bias).
- [ ] AC3: A comment at the guard explains the shallow-priority behavior: when budget is smaller than the number of non-empty buckets, allocation favors shallower files because buckets are ordered shallow → mid → deep.
- [ ] AC4: A test creates a scenario with files at multiple depth levels and a small budget, verifying total sampled files do not exceed budget.
- [ ] AC5: Existing sampler tests continue to pass unchanged.
- [ ] AC6: Tests pass with project test command.
- [ ] AC7: No build errors.

## Testing Strategy

- **Unit tests:** Add one test to the existing `proportional-sampler.test.ts`. Create a temp directory with files at all 3 depth levels (reuse the directory structure pattern from the `includes files from all depth levels via stratification` test). Set budget to 2. Assert: total files ≤ 2, at least one shallow file present (shallow-priority).
- **Edge cases:** budget=1 with 3 non-empty buckets (returns exactly 1 file, shallow). The test with budget=2 implicitly covers the "budget < bucket count" path. budget=0 returns empty (handled by remaining starting at 0).
- **Regression:** All 8 existing tests must pass unchanged.

## Dependencies

None. The fix is self-contained within the sampler module.

## Constraints

- Engine files have zero CLI dependencies — no chalk, no commander, no ora.
- The fix must not change behavior when budget ≥ non-empty bucket count (the common case).

## Gotchas

- The root-level allocation in `sampleFilesProportional` (lines 136–139) has the same pattern but is out of scope. Don't fix it here.
- `DepthBucket` uses `label` not `name` — use `label` in any assertions that reference bucket properties.
- The test must create files at real filesystem paths because `sampleFilesProportional` calls `glob`. Use `fs.mkdtempSync` + try/finally cleanup like every other test in the file.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Engine files (`src/engine/`) have zero CLI dependencies.
- Always use `--run` with `pnpm vitest` to avoid watch mode hang.

### Pattern Extracts

The second-pass guard (the structural analog) from `proportionalSampler.ts` lines 84–107:

```typescript
  // Second pass: distribute remaining proportionally
  if (remaining > 0) {
    let distributed = 0;
    for (const [i, bucket] of buckets.entries()) {
      if (bucket.files.length === 0) continue;
      const proportion = bucket.files.length / totalFiles;
      const extra = Math.floor(proportion * remaining);
      allocations[i] = (allocations[i] ?? 0) + extra;
      distributed += extra;
    }
```

The test setup pattern from `proportional-sampler.test.ts` lines 144–180 (depth stratification test):

```typescript
  // @ana A018
  it('includes files from all depth levels via stratification', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sampler-'));
    try {
      // Create files at different depths
      // Shallow (depth ≤ 2): 50 files
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      for (let i = 0; i < 50; i++) {
        fs.writeFileSync(path.join(tmpDir, 'src', `shallow${i}.ts`), '// shallow');
      }
      // Mid (depth 3-5): 30 files
      fs.mkdirSync(path.join(tmpDir, 'src', 'features', 'auth'), { recursive: true });
      for (let i = 0; i < 30; i++) {
        fs.writeFileSync(path.join(tmpDir, 'src', 'features', 'auth', `mid${i}.ts`), '// mid');
      }
      // Deep (depth 6+): 20 files
      fs.mkdirSync(path.join(tmpDir, 'src', 'features', 'auth', 'providers', 'oauth', 'google'), { recursive: true });
      for (let i = 0; i < 20; i++) {
        fs.writeFileSync(path.join(tmpDir, 'src', 'features', 'auth', 'providers', 'oauth', 'google', `deep${i}.ts`), '// deep');
      }

      const root = makeRoot('.', 100, true);
      root.absolutePath = tmpDir;
      const census = makeCensus(tmpDir, [root]);
```

### Proof Context

- `[code] fix-deep-tier-sampling-C2`: allocateBudget can return total exceeding budget when budget < non-empty bucket count — **this is the finding we're fixing**. Directly overlaps contract assertions A001–A004.
- `[build] depthThenAlpha function is dead code after stratification rewrite` — out of scope for this fix.

### Checkpoint Commands

- After modifying `proportionalSampler.ts`: `(cd packages/cli && pnpm vitest run tests/engine/sampling/)` — Expected: 8 tests pass (existing tests unaffected by the guard)
- After adding the new test: `(cd packages/cli && pnpm vitest run tests/engine/sampling/)` — Expected: 9 tests pass
- After all changes: `pnpm run test -- --run` — Expected: all tests pass
- Lint: `pnpm run lint`

### Build Baseline

- Current tests: 8 passed in 1 test file
- Command used: `(cd packages/cli && pnpm vitest run tests/engine/sampling/)`
- After build: expected 9 tests in 1 file
- Regression focus: existing 8 sampler tests — the guard must not change behavior when budget ≥ bucket count
