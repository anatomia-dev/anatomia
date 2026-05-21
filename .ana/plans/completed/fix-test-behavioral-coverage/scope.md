# Scope: Fix test behavioral coverage gaps

**Created by:** Ana
**Date:** 2026-05-20

## Intent

Two tests pass but don't prove what they claim. One has dead logic that duplicates another assertion. One tests a trivially true property of a pure function instead of the actual behavioral guard it's named after. These create false confidence — the test suite reports green but the claimed behavior is unexercised. Fix both so the assertions match their intent.

## Complexity Assessment

- **Kind:** fix
- **Size:** small
- **Surface:** cli
- **Files affected:**
  - `packages/cli/tests/commands/doctor.test.ts` — delete line 430 (dead ternary)
  - `packages/cli/tests/commands/work.test.ts` — replace trivial idempotency test at lines 5848-5855 with a meaningful backfill guard test
- **Blast radius:** Test-only. No production code changes. Both tests are in the CLI test suite. A022 contract assertion is still satisfied by lines 428-429. A021 contract assertion gets stronger evidence.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Two independent test fixes, same disease — assertions that exercise nothing.

**Finding 1 (doctor.test.ts:430):** Delete the dead ternary line. `'still scaffold'.split(' ')[0]` evaluates to `'still'` (truthy), so the ternary always resolves to `'deployment'`, duplicating line 428. The A022 contract ("When some skills are still scaffold-default, their names are shown") is already satisfied by lines 428-429 which assert `scaffold_defaults` contains both `'deployment'` and `'troubleshooting'`. Verify originally flagged this as debt in the add-doctor-command verify_report.md.

**Finding 2 (work.test.ts:5848-5855):** Replace the trivial `deriveSurface` idempotency test with one that tests the actual behavioral guard. `deriveSurface` is a pure function (no side effects, no closures, no I/O) — calling it twice with the same inputs proves nothing. The real idempotency concern is: does the backfill loop at work.ts:1101 skip entries that already have a surface? The `!existing.surface` guard is currently untested. The existing migration marker tests cover the marker gate (line 5991) and the happy-path backfill (line 5958), but neither creates an entry WITH an existing surface to verify it's preserved.

## Acceptance Criteria

- AC1: doctor.test.ts line 430 (the `'still scaffold'.split(' ')[0]` ternary) is deleted. Lines 428-429 remain unchanged.
- AC2: The A022 test ("names scaffold-default skills when not all enriched") still passes with the same assertions minus the dead line.
- AC3: The trivial idempotency test at work.test.ts:5848-5855 is replaced with a test that creates a proof chain entry WITH an existing `surface` value, runs backfill, and verifies the existing surface is not overwritten.
- AC4: The replacement test creates a scenario where `modules_touched` would derive to a DIFFERENT surface than the one already set — this makes the assertion non-trivial (it proves the guard prevents overwrite, not just that the derivation happens to match).
- AC5: The `@ana A021` contract tag is preserved on the replacement test.
- AC6: All existing tests pass unchanged. No other test modifications.

## Edge Cases & Risks

- **AC4 fixture design:** The test needs an entry with `surface: 'website'` but `modules_touched: ['packages/cli/src/foo.ts']` (which would derive to `'cli'`). This mismatch is the point — it proves the guard works. If the guard were removed, this test would fail because the surface would be overwritten from `'website'` to `'cli'`.
- **Test infrastructure:** The replacement test uses `createProofProjectWithChain` and `completeWork`, matching the pattern of the adjacent migration marker tests at lines 5958-6021. No new test infrastructure needed.

## Rejected Approaches

- **Replace line 430 with `expect(scaffold_defaults.length).toBeGreaterThanOrEqual(2)`.** Fragile — the count depends on how many template skills exist. The two `toContain` assertions are better evidence for A022's contract.
- **Add a new test instead of replacing the trivial one.** The trivial test has no value. Replacing it keeps the test count stable and gives A021 meaningful evidence. Adding alongside would leave a dead test in the suite.
- **Include Finding 3 (orphaned lesson references).** The proof-migration-cleanup scope decided this intentionally today. `lesson` status shipped to customers in v1.0.0-v1.0.2. The `case 'lesson': closed++` line is a one-line safety net worth keeping. The migration marker documents the concern was addressed. Re-litigating adds risk for zero benefit.

## Open Questions

None.

## Exploration Findings

### Patterns Discovered

- doctor.test.ts A022 block (lines 423-431): three assertions, two meaningful (`toContain('deployment')`, `toContain('troubleshooting')`), one dead (line 430). Original commit 13430ce9 introduced all three — no evolution.
- work.test.ts migration marker tests (lines 5958-6021): use `createProofProjectWithChain` helper with explicit entry fixtures. Two tests cover marker-writing and marker-skipping. Neither tests existing-surface preservation.
- `deriveSurface` (work.ts:919-941): pure function, no side effects. Takes `(string[], Record<string, {path: string}>)`, returns `string | undefined`.
- Backfill guard (work.ts:1101): `if (!existing.surface && existing.modules_touched?.length)` — the `!existing.surface` check prevents overwrite but is untested.

### Constraints Discovered

- [TYPE-VERIFIED] deriveSurface is pure (work.ts:919-941) — no closures, no I/O, no mutable state
- [OBSERVED] A022 contract satisfied by lines 428-429 — verified in add-doctor-command/contract.yaml and verify_report.md
- [OBSERVED] Verify originally flagged line 430 as debt — add-doctor-command/verify_data.yaml and verify_report.md:105

### Test Infrastructure

- `createProofProjectWithChain` helper in work.test.ts — creates temp dir with git repo, ana.json, and proof_chain.json with supplied entries and optional migrations field
- `completeWork` helper — runs the work complete flow against the temp project
- Both helpers are used by adjacent migration marker tests — the replacement test follows the same pattern

## For AnaPlan

### Structural Analog

The migration marker tests at work.test.ts:5958-6021 are the exact structural analog for the replacement test. Same helpers, same fixture shape, same assertion pattern (read chain JSON, check entry fields).

### Relevant Code Paths

- `packages/cli/tests/commands/doctor.test.ts:423-431` — A022 test block, line 430 is the deletion target
- `packages/cli/tests/commands/work.test.ts:5848-5855` — trivial idempotency test, full replacement
- `packages/cli/tests/commands/work.test.ts:5858-6021` — migration marker tests, structural analog for the replacement
- `packages/cli/src/commands/work.ts:1098-1108` — backfill loop with the `!existing.surface` guard being tested

### Patterns to Follow

- Migration marker test fixture shape at work.test.ts:5960-5976
- `createProofProjectWithChain` API — accepts `{ entries: [...], migrations?: {...} }`

### Known Gotchas

- The replacement test must NOT set `migrations: { surface_backfill: true }` — that would skip the backfill entirely (that's what the "skips backfill" test at line 5991 already covers). The point is to let backfill run but verify it skips entries with existing surfaces.
- The entry fixture needs both `surface: 'website'` (existing) AND `modules_touched: ['packages/cli/src/foo.ts']` (derives to `'cli'`). The mismatch is intentional — it's what makes the assertion meaningful.

### Things to Investigate

- Confirm `createProofProjectWithChain` supports the `surface` field on entry fixtures. If the helper strips unknown fields, the test won't work as designed.
