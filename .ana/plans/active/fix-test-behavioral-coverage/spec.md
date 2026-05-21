# Spec: Fix test behavioral coverage gaps

**Created by:** AnaPlan
**Date:** 2026-05-20
**Scope:** .ana/plans/active/fix-test-behavioral-coverage/scope.md

## Approach

Two independent test-only fixes. No production code changes. Same disease — assertions that pass but don't exercise the behavior they claim.

**Finding 1 — doctor.test.ts line 430:** Delete the dead ternary. `'still scaffold'.split(' ')[0]` evaluates to `'still'` (truthy), so the ternary always resolves to `'deployment'`, duplicating the assertion on line 428. The A022 contract ("names scaffold-default skills when not all enriched") is already satisfied by the two `toContain` assertions on lines 428-429. Delete line 430, leave lines 428-429 unchanged.

**Finding 2 — work.test.ts lines 5848-5855:** Replace the trivial `deriveSurface` idempotency test with a meaningful backfill guard test. `deriveSurface` is a pure function — calling it twice with the same inputs proves nothing beyond determinism, which is trivially true for any function without side effects. The real idempotency concern is the backfill loop guard at work.ts:1101: `if (!existing.surface && existing.modules_touched?.length)`. This guard prevents overwriting an entry's existing surface during backfill, and it has zero test coverage.

The replacement test belongs in the `migration markers` describe block (work.test.ts:5858), not the `deriveSurface` block. It tests backfill behavior, not the pure function. The `deriveSurface` block retains 4 tests covering its actual contract (cli path, website path, cross-surface, directory-boundary matching).

## Output Mockups

No user-facing output changes. Both fixes are test-internal. The test suite reports the same count (2713 passed) with the same test names adjusted:

```
✓ names scaffold-default skills when not all enriched
✓ preserves existing surface during backfill — does not overwrite
```

## File Changes

### packages/cli/tests/commands/doctor.test.ts (modify)
**What changes:** Delete line 430 — the dead `'still scaffold'.split(' ')[0]` ternary assertion. Lines 423-429 and 431 remain unchanged.
**Pattern to follow:** N/A — pure deletion.
**Why:** The line duplicates line 428's assertion via a ternary that always evaluates to the same branch. It creates false confidence that something additional is being tested.

### packages/cli/tests/commands/work.test.ts (modify)
**What changes:** Delete the trivial idempotency test at lines 5848-5855. Add a new test inside the `migration markers` describe block (after line 6021) that tests the `!existing.surface` backfill guard.
**Pattern to follow:** The adjacent migration marker tests at lines 5958-6021. Same helpers (`createProofProjectWithChain`, `completeWork`), same fixture shape, same assertion pattern (read chain JSON, check entry fields).
**Why:** The existing test proves nothing — pure function determinism is trivially true. The replacement test exercises the untested guard that prevents surface overwrite during backfill.

## Acceptance Criteria

- [ ] AC1: doctor.test.ts line 430 (the `'still scaffold'.split(' ')[0]` ternary) is deleted. Lines 428-429 remain unchanged.
- [ ] AC2: The A022 test ("names scaffold-default skills when not all enriched") still passes with the same assertions minus the dead line.
- [ ] AC3: The trivial idempotency test at work.test.ts:5848-5855 is replaced with a test that creates a proof chain entry WITH an existing `surface` value, runs backfill, and verifies the existing surface is not overwritten.
- [ ] AC4: The replacement test creates a scenario where `modules_touched` would derive to a DIFFERENT surface than the one already set — this makes the assertion non-trivial (it proves the guard prevents overwrite, not just that the derivation happens to match).
- [ ] AC5: The `@ana A021` contract tag is preserved on the replacement test.
- [ ] AC6: All existing tests pass unchanged. No other test modifications.
- [ ] AC7: Tests pass with `pnpm run test -- --run`.
- [ ] AC8: No build errors.

## Testing Strategy

- **Unit tests:** No new test files. Two modifications to existing test files.
- **Integration tests:** The replacement backfill guard test IS an integration test — it runs `completeWork` against a real git repo with proof chain data, matching the existing migration marker test pattern.
- **Edge cases:** AC4 specifically requires a surface mismatch (entry has `surface: 'website'`, modules derive to `'cli'`). This is the edge case that makes the assertion meaningful — if the guard were removed, this test would fail because the surface would be overwritten.

## Dependencies

None. Both changes are test-only with no production code dependencies.

## Constraints

- Test count must not decrease. The replacement test maintains the same count.
- The `@ana A021` contract tag must be preserved on the replacement test so proof chain linkage is maintained.

## Gotchas

- The replacement test must NOT set `migrations: { surface_backfill: true }` in the chain fixture. That flag causes the backfill loop to be skipped entirely (that's what the "skips backfill" test at line 5991 already covers). The point is to let backfill run but verify it respects the `!existing.surface` guard.
- The entry fixture needs BOTH `surface: 'website'` (pre-existing) AND `modules_touched: ['packages/cli/src/foo.ts']` (which derives to `'cli'` via the surfaces config in `createProofProjectWithChain`). The mismatch is intentional — it's what makes the assertion non-trivial.
- The `createProofProjectWithChain` helper sets up `surfaces: { cli: { path: 'packages/cli' } }` in ana.json. This means `modules_touched: ['packages/cli/src/foo.ts']` will derive to `'cli'`. Use this knowledge when constructing the fixture.

## Build Brief

### Rules That Apply
- Use `--run` flag with vitest to avoid watch mode hang.
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Prefer early returns over nested conditionals.

### Pattern Extracts

The structural analog — migration marker test at work.test.ts:5958-5988:

```typescript
  // @ana A001, A002, A003, A015
  it('writes migration markers after backfill runs', async () => {
    await createProofProjectWithChain('migration-test', {
      entries: [{
        slug: 'old-entry',
        feature: 'Old Entry',
        result: 'PASS',
        completed_at: '2026-03-01T00:00:00.000Z',
        modules_touched: ['packages/cli/src/foo.ts'],
        findings: [],
        build_concerns: [],
        assertions: [],
        acceptance_criteria: [],
        hashes: {},
        author: { name: 'Test', email: 'test@test.com' },
        rejection_cycles: 0,
        previous_failures: [],
      }],
    });

    await completeWork('migration-test');

    const chainPath = path.join(tempDir, '.ana', 'proof_chain.json');
    const chain = JSON.parse(fsSync.readFileSync(chainPath, 'utf-8'));

    expect(chain.migrations).toBeDefined();
    expect(chain.migrations.surface_backfill).toBe(true);
    expect(chain.migrations.lesson_to_closed).toBe(true);
    // Old entry without surface gets backfilled
    expect(chain.entries[0].surface).toBe('cli');
  });
```

The replacement test follows this exact shape but adds `surface: 'website'` to the entry fixture and asserts the surface is preserved as `'website'` (not overwritten to `'cli'`).

### Proof Context

**doctor.test.ts:**
- `(add-doctor-command-C2)` A022 test line 430 contains dead logic — directly addressed by this spec.

**work.test.ts:**
- `(surface-awareness-bridge-C1)` A021 idempotency test checks pure function determinism, not backfill loop guard — directly addressed by this spec.

### Checkpoint Commands

- After doctor.test.ts change: `(cd 'packages/cli' && pnpm vitest run tests/commands/doctor.test.ts)` — Expected: all doctor tests pass
- After work.test.ts change: `(cd 'packages/cli' && pnpm vitest run tests/commands/work.test.ts)` — Expected: all work tests pass
- After all changes: `pnpm run test -- --run` — Expected: 2713 passed, 2 skipped
- Lint: `pnpm run lint`

### Build Baseline

- Current tests: 2713 passed, 2 skipped
- Current test files: 120
- Command used: `pnpm run test -- --run`
- After build: 2713 passed (same count — one deleted, one added), 120 test files
- Regression focus: doctor.test.ts (A022 block), work.test.ts (deriveSurface block, migration markers block)
