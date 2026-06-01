# Build Report: Fix work complete merge strategy

**Created by:** AnaBuild
**Date:** 2026-06-01
**Spec:** .ana/plans/active/fix-work-complete-merge-strategy/spec.md
**Branch:** feature/fix-work-complete-merge-strategy

## What Was Built
- packages/cli/src/commands/work.ts (modified): Added command-local merge strategy discovery/config resolution, explicit `gh pr merge --merge|--squash|--rebase` calls, and new recovery/JSON error paths.
- packages/cli/src/commands/init/anaJsonSchema.ts (modified): Added fail-soft optional `mergeStrategy` enum parsing.
- packages/cli/src/commands/config.ts (modified): Added `mergeStrategy` to known fields and write-time validation.
- packages/cli/tests/commands/work-merge.test.ts (modified): Added configured, inferred, ambiguous, unavailable, malformed, unreliable, JSON, unsupported, and regression coverage with current contract tags.
- packages/cli/tests/commands/config.test.ts (modified): Added valid/invalid `mergeStrategy` config command tests and docs contract checks.
- packages/cli/tests/commands/init/anaJsonSchema.test.ts (modified): Added accepted/absent/invalid schema tests.
- packages/cli/tests/commands/init.test.ts (modified): Added fresh init omission and re-init preservation coverage for `mergeStrategy`.
- website/content/docs/guides/troubleshooting.mdx (modified): Added recovery guidance for merge strategy selection failures.
- website/content/docs/guides/configurability.mdx (modified): Documented `mergeStrategy` as a user-owned setting and added it to the example.

## PR Summary
- Makes `ana work complete --merge` deterministic by resolving an explicit GitHub merge strategy before invoking `gh pr merge`.
- Adds user-owned `mergeStrategy` config support with schema fail-soft parsing and `ana config set` validation.
- Covers configured, inferred, ambiguous, unavailable, JSON, and unsupported strategy paths in CLI tests.
- Updates troubleshooting and configurability docs with `ana config set mergeStrategy` recovery guidance.

## Acceptance Criteria Coverage
- AC1 explicit merge flag → work-merge.test.ts "uses configured squash merge strategy" and "merge-succeeded path with --json produces valid JSON" (`@ana A003`).
- AC2 configured squash skips discovery → work-merge.test.ts "uses configured squash merge strategy" (`@ana A001, A002`).
- AC3 single allowed method auto-selects → work-merge.test.ts inferred merge/squash/rebase tests (`@ana A004, A005, A006`).
- AC4 multiple methods stop before merging with config guidance → work-merge.test.ts "reports multiple merge strategies" (`@ana A007, A008`).
- AC5 failed/malformed/unreliable API discovery stops before merging → work-merge.test.ts unavailable/malformed/unreliable tests (`@ana A009, A010, A011`).
- AC6 configured strategy rejected by GitHub reports stale setting → work-merge.test.ts "reports unsupported configured merge strategy" (`@ana A012, A015`).
- AC7 JSON strategy failures have clean envelopes → work-merge.test.ts JSON ambiguous/unavailable/unsupported tests (`@ana A013, A014, A015, A016`).
- AC8 schema accepts valid values and invalid parses as undefined → anaJsonSchema.test.ts mergeStrategy enum tests (`@ana A017-A020`).
- AC9 fresh init omits mergeStrategy and re-init preserves it → init.test.ts init/re-init tests (`@ana A021, A022`).
- AC10 config set writes valid strategy without warning → config.test.ts valid write test (`@ana A023, A026`).
- AC11 config set rejects invalid without modification → config.test.ts invalid write test (`@ana A024, A025`).
- AC12 existing merge regressions remain covered → work-merge.test.ts branch protection, behind, and already merged tests (`@ana A027-A029`) plus existing untagged no-PR/base/unknown tests.
- AC13 docs mention recovery → config.test.ts docs check and troubleshooting.mdx (`@ana A030`).
- AC14 focused CLI tests pass → `pnpm vitest run tests/commands/work-merge.test.ts tests/commands/config.test.ts tests/commands/init/anaJsonSchema.test.ts tests/commands/init.test.ts`, 139 passed.
- AC15 lint has no new errors → `pnpm run lint`, 0 errors; pre-existing warnings only.
- AC16 full suite treated as CI gate → `pnpm run test -- --run` executed; failed only in known scan/package-manager areas outside this scope.

Contract coverage: 31/31 assertions tagged.

## Implementation Decisions
- Kept merge strategy helpers private inside `work.ts` as requested because the behavior has one command caller and command-specific output/error handling.
- Used schema-validated `.ana/ana.json` parsing in `work.ts`; invalid hand-edited values behave as absent and trigger discovery.
- Added docs contract checks in `config.test.ts` because the checkpoint already runs that file and the assertions are direct file-content checks.
- Removed stale `@ana` comments from the touched test files so only this contract's assertion IDs are claimed.

## Deviations from Contract
None - contract followed exactly.

## Test Results

### Baseline (before changes)
`pnpm run build`

```text
Tasks:    2 successful, 2 total
Cached:    2 cached, 2 total
Time:    53ms >>> FULL TURBO
```

`pnpm vitest run tests/commands/work-merge.test.ts tests/commands/config.test.ts tests/commands/init/anaJsonSchema.test.ts tests/commands/init.test.ts`

```text
Test Files  4 passed (4)
Tests  123 passed (123)
Duration  2.65s
```

Tests: 123 passed, 0 failed, 0 skipped

### After Changes
`pnpm run build`

```text
Tasks:    2 successful, 2 total
Cached:    0 cached, 2 total
Time:    8.838s
```

`pnpm vitest run tests/commands/work-merge.test.ts tests/commands/config.test.ts tests/commands/init/anaJsonSchema.test.ts tests/commands/init.test.ts`

```text
Test Files  4 passed (4)
Tests  139 passed (139)
Duration  4.32s
```

`pnpm run lint`

```text
Tasks:    2 successful, 2 total
anatomia-website:lint: 0 errors, 2 warnings in website/components/hero/Hero.tsx
anatomia-cli:lint: 0 errors, 1 warning in packages/cli/src/utils/git-operations.ts
```

`pnpm run test -- --run`

```text
Test Files  3 failed | 126 passed (129)
Tests  9 failed | 3137 passed | 2 skipped (3148)
Failed files:
- tests/commands/scan.test.ts: 2 failures expecting "No code detected"
- tests/engine/scanProject.test.ts: 3 non-Node packageManager failures
- tests/engine/detectors/detection-overrides.test.ts: 4 package manager inheritance failures
```

Tests: focused 139 passed, 0 failed, 0 skipped. Full suite 3137 passed, 9 failed, 2 skipped.

### Comparison
- Tests added: 16
- Tests removed: 0
- Regressions: none in touched areas; full-suite failures are the known scan/package-manager failures called out by the spec.

### New Tests Written
- packages/cli/tests/commands/work-merge.test.ts: configured strategy, inferred strategy, ambiguity, discovery failure, malformed/unreliable discovery, JSON envelopes, unsupported strategy.
- packages/cli/tests/commands/config.test.ts: valid/invalid `mergeStrategy` writes and docs checks.
- packages/cli/tests/commands/init/anaJsonSchema.test.ts: schema accepted/invalid/absent values.
- packages/cli/tests/commands/init.test.ts: fresh config omission and re-init preservation.

## Verification Commands
```bash
pnpm run build
cd packages/cli && pnpm vitest run tests/commands/work-merge.test.ts tests/commands/config.test.ts tests/commands/init/anaJsonSchema.test.ts tests/commands/init.test.ts
pnpm run lint
pnpm run test -- --run
```

## Git History
```text
4ce1ca34 [fix-work-complete-merge-strategy] Resolve merge strategy explicitly
```

## Open Issues
- Full project test command still has pre-existing scan/package-manager detector failures outside this scope. Recorded in build_data.yaml.
- Full project lint reports pre-existing warnings in untouched files. Recorded in build_data.yaml.

Second pass: No additional unfinished work or scope concerns found.
