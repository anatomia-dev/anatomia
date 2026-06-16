# Build Report: Bump anatrace-core 0.2.0 → 0.4.0 (pin, fail-closed emit, reason lock, real-engine CI)

**Created by:** AnaBuild
**Date:** 2026-06-16
**Spec:** .ana/plans/active/anatrace-pin-0-4-0/spec.md
**Branch:** feature/anatrace-pin-0-4-0

## What Was Built

Feature changes (spec-enumerated):

- **packages/cli/package.json** (modified): `anatrace-core` pin `0.2.0` → `0.4.0` exact.
- **pnpm-lock.yaml** (modified): regenerated via non-frozen `pnpm install` to resolve `anatrace-core@0.4.0`. Diff scoped to `anatrace-core` entries only (specifier, version, integrity, snapshot key) — no new packages, no incidental dep bumps.
- **packages/cli/src/types/proof.ts** (modified): added `VERDICT_REASONS` (the 15-member 0.4.0 closed set, the single source of truth), the derived `VerdictReason` type, and the `isVerdictReason` membership guard (O(1) Set-backed). Narrowed `ComplianceVerdictRecord.reason` from `string` → `VerdictReason | (string & {})` (closed-set documentation + forward-compatible storage of a future engine's reason).
- **packages/cli/src/utils/compliance.ts** (modified): (AC3) resolve core version ONCE, abstain (`return null`) on empty/unresolvable version, stamp from that same value; added `deps.readCoreVersion` injection seam. (AC2) extracted exported pure `projectVerdicts` helper that records an unknown reason verbatim and emits one stderr drift warning (never drops/coerces/abstains). Imports `isVerdictReason` from `proof.js`.
- **packages/cli/tests/utils/compliance.test.ts** (modified): added AC2/AC3/AC4 tests (tags A047–A055) including the ANSI-C force-push fixture.

Bump-forced version-stamp propagation (NOT spec-enumerated — see Deviations):

- **packages/cli/tests/commands/_capture.test.ts** (modified): pin assertion `0.2.0` → `0.4.0`, extended to also assert the installed engine resolves to `0.4.0` (AC1 / A045+A046). The single `0.4.0` literal for the whole change lives here.
- **packages/cli/tests/data/pricing.test.ts** (modified): `PRICE_TABLE_VERSION` stamp `2026-06-08` → `2026-06-14`.
- **packages/cli/tests/utils/forensics-derive.test.ts** (modified): 3× `price_table_version` stamp update (+ JSDoc).
- **packages/cli/tests/utils/forensics.test.ts** (modified): 1× `price_table_version` stamp update.
- **packages/cli/tests/commands/proof-card-golden.test.ts** (modified): inline `table 2026-06-14` assertion + regenerated golden snapshot (`__snapshots__/proof-card-golden.test.ts.snap`).

## PR Summary

- Bumps `anatrace-core` 0.2.0 → 0.4.0 (exact pin + regenerated lockfile), upgrading the behavioral-attestation engine. This is a behavioral fix, not a version-number edit: under 0.4.0 an ANSI-C-obfuscated force-push (`git $'push' --force`) now reads `violated` where 0.2.0 false-PASSed it.
- Locks the compliance verdict `reason` field to the 0.4.0 closed set via a single-source-of-truth `VERDICT_REASONS` const + `isVerdictReason` guard; an unknown reason from a future engine is recorded verbatim and surfaced as a stderr drift warning, never dropped.
- Closes C12 fail-closed: compliance capture now ABSTAINS (writes no record) when the engine version is empty/unresolvable, so no `anatrace_core_version: ""` record can ever land.
- Adds real-engine tests (every emitted reason ∈ the 0.4.0 set; the version stamp matches the installed engine; the decoded force-push reads `violated`).
- Verdict semantics shift recorded for the changelog at the 1.3.0 cut (deferred per AC5): new `command-unresolvable` / `harness-version-unrecognized` / `session-parse-suspect` reasons; price-table stamp moved `2026-06-08` → `2026-06-14` (cost values unchanged).

## Acceptance Criteria Coverage

- **AC1** "engine installed & pinned at 0.4.0; tsc/build clean" → ✅ `_capture.test.ts` "pins AND installs anatrace-core at exactly 0.4.0" (A045 installed-version + A046 pin, 2 assertions); `pnpm --filter anatomia-cli build` clean; lockfile resolves 0.4.0.
- **AC2** "reason locked to closed set; out-of-set recorded verbatim + warned" → ✅ `compliance.test.ts` A047 (recognizes `command-unresolvable`), A048 (rejects unknown), A049 (verbatim + warns once).
- **AC3** "fail-closed abstain on empty core version; computed once" → ✅ `compliance.test.ts` A050+A051 (null + zero records on empty version), A052 (non-empty stamp on happy path).
- **AC4** "real-engine assertions green" → ✅ A053 (zero out-of-set reasons), A054 (stamp == installed engine, dynamic), A055 (ANSI-C force-push reads `violated`).
- **AC5** "CHANGELOG deferred — not this PR" → ✅ honored: `CHANGELOG.md` not touched. Bump + verdict-semantics shift captured in this report and the PR summary for the 1.3.0 cut.
- **Observable (NON-GATING)** "≥1 record with anatrace_core_version == 0.4.0 on disk" → 🔨 not yet observed at build time (emits at `ana artifact save`, not `ana test`). Verify after save; absence is a ~5-min follow-on, never a held PR. See Open Issues.
- **New: `pnpm --filter anatomia-cli build` clean** → ✅ typecheck + tsup clean.
- **New: `cd packages/cli && pnpm lint` clean** → ✅ 0 errors in changed files (1 pre-existing warning in `git-operations.ts`, not introduced here).
- **New: full suite green, count non-decreasing** → ✅ 3733 passed / 0 failed / 2 skipped (sealed marker below); +7 vs the 0.4.0-install baseline.

Contract coverage: **11/11 assertions tagged** (A045–A055).

## Implementation Decisions

- **`projectVerdicts` gets an optional 3rd `coreVersion` param.** The spec showed `projectVerdicts(verdicts, saysById)`, but the AC2 drift message must interpolate the resolved engine version (never hardcoded). I added `coreVersion: string = readCoreVersion()` so production threads the once-computed version into the warning, while the spec's 2-arg test call still compiles and runs (the default resolves to the installed engine). No second `readCoreVersion()` call on the happy path.
- **`VERDICT_REASONS` / `isVerdictReason` placed in the types-only `proof.ts`.** Per the spec's deliberate-deviation note: keeps the const next to the derived type, avoids duplicating the 15-member list, and avoids a circular import (`compliance.ts` → `proof.ts`, never the reverse).
- **AC1's single `0.4.0` literal lives in `_capture.test.ts`.** Both A045 (installed) and A046 (pin) assert against one `EXPECTED_CORE_VERSION` constant there; the compliance/emit tests read the installed version dynamically (no second literal), per the spec's one-version-literal discipline.

## Deviations from Contract

### A055: An obfuscated forbidden command is caught as a violation under the real engine
**Instead:** Used the **verify** mandate (`installAgentDef('verify')`, role `verify`) as the force-push obligation source, not `ana-build.md` as the spec's Approach/Gotchas stated.
**Reason:** Empirically, the build mandate extracts no command predicate at all (only skill-load / verify-independence / contract claims), so a force-push can never flip it. The no-force-push obligation is the engine's built-in `VERIFY_FORBIDDEN_COMMANDS = ["git rebase", "git push --force"]`, generated for the VERIFY role (`anatrace-core@0.4.0` `index.mjs:5265,5463`). Confirmed by dumping verdicts across roles: under the verify mandate the ANSI-C `git $'push' --force` decodes and reads `violated` (claim `ana-verify:no-code-branch-mutation:git-push---force`), while `git rebase` correctly reads `satisfied` (absent).
**Outcome:** Intent fully preserved — AC4(iii) proves 0.4.0 catches the decoded, in-class force-push as `violated`, asserting on status only (never a specific reason, per the gotcha). The STOP guard was honored: the fixture genuinely flips against the real engine; I did not weaken it to a trivially-violated command.

### Scope: bump-forced version-stamp propagation in 5 non-enumerated test files
**Instead:** Updated `_capture.test.ts`, `pricing.test.ts`, `forensics-derive.test.ts`, `forensics.test.ts`, and `proof-card-golden.test.ts` (+ snapshot) — files the spec did not list under File Changes.
**Reason:** 0.4.0 re-exports a newer pricing layer: `PRICE_TABLE_VERSION` moved `2026-06-08` → `2026-06-14`. The spec assumed the bump was "purely additive" (3 new reasons only) and never ran the full suite (baseline was estimated by counting `it()` blocks), so it didn't anticipate the 11 resulting failures. The "full suite green" constraint requires them fixed. Developer-approved (Option 1, with the cosmetic-only guard).
**Outcome:** Proven cosmetic. The golden-snapshot diff is EXACTLY the `(table 2026-06-XX)` footer on 5 TOTAL lines — every rendered `cost_usd` ($4.02, $6.68, $1.92, $1.07, n/a) is byte-identical, and the `pricing.test` cost assertions (36.75, 0.56363) still pass unchanged. No price VALUE moved; `DERIVE_VERSION` is unchanged at `3`. Isolated in a separate, clearly-labeled commit (`test: propagate … price-table-version stamp; cost values unchanged`). The price-table-version move itself is flagged for the separately-gated cost-metric revalidation, not revalidated here.

### Note (not a deviation): `_capture.test.ts` pin assertion `0.2.0` → `0.4.0`
This updates an expected value, but it satisfies contract A046 (`value: "0.4.0"`) — it is the bump itself, not a weakening. Recorded here for transparency.

## Test Results

### Baseline (after the non-frozen 0.4.0 install, before adding new tests)
Command: `cd packages/cli && pnpm vitest run`
```
Test Files  5 failed | 150 passed (155)
     Tests  11 failed | 3715 passed | 2 skipped (3728)
```
The 11 failures were ALL caused by the in-scope bump (not pre-existing): 10 hardcoded/snapshotted the old `PRICE_TABLE_VERSION` `2026-06-08`, and 1 (`_capture.test.ts`) hardcoded the old `0.2.0` pin. The full suite cannot run in the main tree at all (anatrace-core uninstalled there), so this in-worktree run after the install is the true baseline. `compliance.test.ts` baseline: 10 `it()` blocks, all green under 0.4.0.

### After Changes
Command: `ana test --stage build --slug anatrace-pin-0-4-0` (capture-sealed)
```
✓ captured  counts: 3733 passed, 0 failed, 2 skipped  (verdict: pass)
```
<!-- ana:capture stage=build slug=anatrace-pin-0-4-0 counts=3733p/0f/2s verdict=pass sha256=3b60a26c263b21d959aae55df9cf0e132ebce9c00648131f2fd1671d0dcb5507 -->

### Comparison
- Tests added: **+7** (the A047–A055 cluster in `compliance.test.ts`: 7 new `it()` blocks; `_capture` was extended with an assertion, not a new block).
- Tests removed: **0**.
- Regressions: **none**. The 11 bump-induced baseline failures are all now green; no other test changed status.
- Count: 3728 → 3735 (strictly non-decreasing). ✓

### New Tests Written (`compliance.test.ts`, tags A047–A055)
- A047/A048: `isVerdictReason` recognizes the 0.4.0-new `command-unresolvable`; rejects an out-of-set reason.
- A049: `projectVerdicts` records an unknown reason verbatim + warns exactly once (console.warn spy).
- A050/A051: `captureComplianceAtSave({ readCoreVersion: () => '' })` returns null and writes zero records.
- A052/A054: happy-path stamp is non-empty and equals the dynamically-read installed engine version.
- A053: real-engine record has zero out-of-set reasons.
- A055: ANSI-C `git $'push' --force` fixture reads `violated` under the real 0.4.0 verify mandate.

## Verification Commands
```
pnpm --filter anatomia-cli build
cd packages/cli && pnpm vitest run tests/utils/compliance.test.ts
cd packages/cli && pnpm vitest run
cd packages/cli && pnpm lint
node -e "console.log(require('anatrace-core/package.json').version)"   # → 0.4.0
git diff --stat main..HEAD -- pnpm-lock.yaml                            # anatrace-core entries only
```

## Git History
```
af3cf9d0 [anatrace-pin-0-4-0] Real-engine reason/abstain/drift tests (AC2/AC3/AC4)
adc7272c [anatrace-pin-0-4-0] Lock verdict reason set + fail-closed emit (AC2/AC3)
250e43a7 [anatrace-pin-0-4-0] test: propagate anatrace-core 0.4.0 price-table-version stamp; cost values unchanged
1f2175dd [anatrace-pin-0-4-0] Bump anatrace-core 0.2.0 → 0.4.0 (pin + lockfile)
```

## Open Issues

1. **Price-table-version moved as a side effect of the bump (cost-metric layer).** 0.4.0 re-exports `PRICE_TABLE_VERSION` `2026-06-08` → `2026-06-14`. Handled here as cosmetic stamp propagation (proven: no `cost_usd` value changed, `DERIVE_VERSION` unchanged). The metric layer itself should be consciously revalidated under the separately-gated cost-metric work, not silently regenerated. *(observation / monitor)*

2. **Spec AC4(iii) mandate source is incorrect.** The spec states `ana-build.md` declares the no-force-push obligation; it is actually the engine's built-in `VERIFY_FORBIDDEN_COMMANDS` for the VERIFY role. The A055 fixture uses the verify mandate (documented deviation). Future bump/spec authoring should correct this understanding. *(observation / acknowledge)*

3. **Spec scoped only one test file and never ran the suite against 0.4.0.** The bump broke 11 tests across 5 files; the spec's baseline was estimated, not run. All fixed and proven cosmetic, but future bump specs should run the full suite before scoping File Changes. *(debt / monitor)*

4. **Non-gating observable not yet on disk at build time.** A compliance record with `anatrace_core_version == 0.4.0` emits at `ana artifact save` (not `ana test`), so it had not landed when the suite ran. To be verified immediately after the build-report save; per the spec, absence is a ~5-min follow-on `ana run`, never a held PR. *(observation / monitor)*

Forced second pass — re-examined the diff for anything unstated: the `(string & {})` narrowing is backward-compatible (assignable from any string; `tsc` clean confirms no reader breaks); both `artifact.ts` call sites (`:1250`, `:1682`) pass 3 args so the defaulted `deps` leaves them unchanged; the `console.warn` drift channel is the AC-mandated exception and is kept to one line; C9 (malformed-readable transcript) and the `commit_hygiene` duplication were left untouched per scope. The four issues above are the complete set.
