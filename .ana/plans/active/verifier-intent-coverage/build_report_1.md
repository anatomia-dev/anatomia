# Build Report: Verifier Intent Coverage — Phase 1 (extractor + pre-seal coverage gate)

**Created by:** AnaBuild
**Date:** 2026-06-16
**Spec:** .ana/plans/active/verifier-intent-coverage/spec-1.md
**Branch:** feature/verifier-intent-coverage

## What Was Built

- **packages/cli/src/types/contract.ts** (modified): Added `ac?: string | string[]` to `ContractAssertion`; added the exported `CoverageWaiver` interface (`ac`, `kind: 'judgment' | 'retired'`, `reason`) and `coverage_waivers?: CoverageWaiver[]` to `ContractSchema`. All additive/optional — zero migration. JSDoc documents that `coverage_waivers` consciously supersedes the scope's literal `judgment_only: string[]` (reason-required honesty + removes the judgment/retired duplication) so a future reader does not "fix" it back.
- **packages/cli/src/commands/artifact-validators.ts** (modified): Added three exported pure functions plus two exported interfaces and a private version helper, beside `validateContractFormat`:
  - `extractScopeACs(scopeContent)` — recovers AC ids from `- AC1:`, `## AC1`, `**AC1**`, and bare `AC1:` forms; de-duplicates and upper-cases ids; sets `ambiguous: true` only when AC-signal is present but no clean id is recoverable (the AC14 classifier); returns `{ ids: [], ambiguous: false }` for a no-AC scope.
  - `joinCoverage(scopeContent, contract)` — exported foundation (Phase 2 reuses it); per-AC join returning `{ acs: [{ id, status, assertions, weakOnly }], ambiguous }`. A waiver counts only if it carries a non-empty `reason`.
  - `evaluateCoverageGate({ scopeContent, contract })` — the pure policy gate over `joinCoverage`, returning `{ active, block, uncovered, errors, warnings, info, diagnostic }`. Activation = `version >= "1.1"` (numeric major.minor) AND non-ambiguous AND ≥1 AC. Never throws.
  - `COVERAGE_GATE_MIN_VERSION = '1.1'` constant; `WEAK_MATCHERS` set; `isVersionAtLeast` numeric comparator.
- **packages/cli/src/commands/artifact.ts** (modified): Added `applyCoverageGate(contractPath)` (mirrors `applyTestEvidenceGate`): reads sibling `scope.md`, parses the contract YAML, calls `evaluateCoverageGate`, always prints one `Coverage gate: {diagnostic}` line, prints info (gray) / warnings (yellow), and on block prints errors (red) + `process.exit(1)`. Wired into the `baseType === 'contract'` block of BOTH `saveArtifact` and `saveAllArtifacts`, after `validateContractFormat` and before the seal hash.
- **packages/cli/tests/commands/coverage-gate.test.ts** (created): Unit tests for the extractor (four forms, ambiguous, no-AC, de-dup, multi-digit, empty) and the gate (activation by version, block/no-block, uncovered listing, waivers, weak-matcher info, fail-open, always-present diagnostic, never-throws) + the AC3 backward-compat `validateContractFormat` case.
- **packages/cli/tests/commands/scope-ac-corpus.test.ts** (created): The AC1 live-corpus sweep over `.ana/plans/completed/*/scope.md`, repo-root-resolved from `import.meta.url`, oracle = literal `## Acceptance Criteria` heading.

## PR Summary

- Adds a pre-seal coverage gate that mechanically proves a contract covers every scope acceptance criterion, blocking a contract that silently drops one.
- Ships inert-but-safe: activation is gated on contract `version >= 1.1` (numeric compare), and every existing contract is `version 1.0`, so the gate no-ops everywhere today. Nothing emits `1.1` until Phase 2.
- New `extractScopeACs` recovers AC ids from four markdown conventions; validated against the full 205-scope live corpus with zero false-ambiguous and zero empty-extraction (oracle independent of the extractor).
- New `coverage_waivers` (`kind: judgment | retired`, required `reason`) unifies judgment-only and retired ACs; a reason is required so over-waiving stays visible.
- `joinCoverage` is exported as a shared foundation so Phase 2 consumes the same join with no cross-PR refactor.

## Acceptance Criteria Coverage

- AC1 "extractor accuracy + live corpus" → coverage-gate.test.ts A001–A005 (four forms + not-ambiguous) AND scope-ac-corpus.test.ts A006/A007 (corpus: 0 false-ambiguous, 0 empty-extraction over 205 scopes) → ✅ Verified
- AC2 "block iff uncovered" → coverage-gate.test.ts A010 (block on dropped), A011 (no-block when covered), A012 (uncovered names AC3), A013 (weak still covered) → ✅ Verified
- AC3 "backward compat" → coverage-gate.test.ts A018 (1.0 inactive), A019 (validateContractFormat accepts 1.1 + ac + coverage_waivers, 0 errors); artifact.test.ts (209 existing contract-save tests still green) → ✅ Verified
- AC4 "judgment waiver satisfies" → coverage-gate.test.ts A014 → ✅ Verified
- AC5 "retired vs dropped" → coverage-gate.test.ts A015 (retired no-block), A016 (neither → block) → ✅ Verified
- AC6 "build-only / no-AC scope never gates" → coverage-gate.test.ts A017 (no-AC scope inactive) → ✅ Verified (see Deviations on the no-assertions clause)
- AC13 "zero-link 1.1 contract surfaced, never silent" → coverage-gate.test.ts A020 (active true), A021 (block true), A022 (diagnostic always present) → ✅ Verified
- AC14 "ambiguous format fails open" → coverage-gate.test.ts A008 (ambiguous flagged), A009 (gate does not block) → ✅ Verified
- "Gate wired into BOTH save paths, before seal, exit(1) on block" → wired in `saveArtifact` and `saveAllArtifacts`; no-op verified by artifact.test.ts → ✅ Verified (no-op path) / 🔨 Implemented (block path — unit-covered, not integration-driven; see Open Issues)
- "Extractor + gate are pure (no chalk, no exit)" → both live in artifact-validators.ts which imports no chalk; all output in artifact.ts → ✅ Verified
- "Tests pass; count does not decrease; no build/lint errors" → 3767 passed / 2 skipped (+34); tsc + eslint clean on changed files → ✅ Verified

**Contract coverage: 22/22 Phase-1 assertions tagged (A001–A022). A023–A035 belong to Phase 2.**

## Implementation Decisions

- **Diagnostic wording.** Chose `active — {covered}/{total} acceptance criteria covered ({k} by waiver)` and `inactive (legacy contract, version {v})` / `inactive (scope has no acceptance criteria)` / `skipped (AC format unrecognized — warn only, not blocking)`. No assertion pins exact text (A022 only requires non-empty); wording follows the spec's Output Mockups closely.
- **Sibling scope resolution.** `applyCoverageGate` reads `scope.md` from the contract file's own directory (`path.dirname(contractPath)`), since contract.yaml and scope.md are always plan-dir siblings — simpler and worktree-safe versus re-deriving the plan dir.
- **Waiver requires a non-empty reason to count.** A `coverage_waivers` entry with an empty/missing `reason` is treated as no waiver (the AC falls through to `uncovered` and blocks). This is the spec's "reason required for both kinds" anti-silent-abuse rule made mechanical.
- **Corpus repo-root anchor.** Resolved from `import.meta.url` (up 4 levels), never `process.cwd()`, with a `> 50` floor guarded for a legitimately-empty corpus — per the spec Gotcha on vacuous cwd-relative passes.

## Deviations from Contract

### A006 / A007: corpus false-ambiguous / empty-extraction counts
**Instead:** Measured via an oracle (the literal `## Acceptance Criteria` heading) independent of the extractor, exactly as the spec's Testing Strategy mandates; the target keys `corpusMeasurement.falseAmbiguousCount` / `corpusMeasurement.emptyExtractionCount` are computed in the test as oracle-driven counts (not surfaced by product code).
**Reason:** These contract targets describe a measurement the test performs over the live corpus, not a value returned by a shipped function.
**Outcome:** Intent fully preserved — both counts assert `toBe(0)` over all 205 oracle-positive scopes. The verifier can re-run `scope-ac-corpus.test.ts`.

### A022: diagnostic "exists"
**Instead:** Asserted the diagnostic is truthy AND non-empty (`length > 0`) across active/inactive/skipped results, rather than a bare `toBeDefined`.
**Reason:** The `says` is "always returns a non-empty diagnostic line"; a present-but-empty string would defeat AC13's "never invisible" intent.
**Outcome:** Strictly stronger than `exists`; intent preserved.

### AC6 ↔ AC13 tension (no contract assertion changed)
**Instead:** Activation is `version >= 1.1 AND scope-has-ACs AND not-ambiguous`, independent of assertion count. A version 1.1 contract with zero assertions over a scope-with-ACs is therefore active + blocking.
**Reason:** AC6's literal "a contract with no assertions never triggers (active:false)" conflicts with AC13's explicitly-pinned A020/A021 (zero-link 1.1 + scope ACs → active:true, block:true) for the zero-assertion case. The contract's pins (A020/A021) are authoritative.
**Outcome:** Every pinned assertion is satisfied; AC6's no-assertions clause holds in the legacy 1.0 regime and via the no-AC-scope path (A017). Recorded as an observation in build_data_1.yaml.

## Test Results

### Baseline (before changes)
Command: `(cd packages/cli && pnpm vitest run)`
```
 Test Files  155 passed (155)
      Tests  3733 passed | 2 skipped (3735)
```

### After Changes
Command: `ana test --stage build --slug verifier-intent-coverage`
```
✓ captured  counts: 3767 passed, 0 failed, 2 skipped  (verdict: pass)
```
<!-- ana:capture stage=build slug=verifier-intent-coverage counts=3767p/0f/2s verdict=pass sha256=00d38be73866a27e72390aaf5457b906ea74d5bf1afba2119a76d42cc5b8ce9a -->

Checkpoint runs:
- `pnpm vitest run tests/commands/coverage-gate.test.ts tests/commands/scope-ac-corpus.test.ts` → `Test Files 2 passed (2)`, `Tests 34 passed (34)` (corpus: 0 false-ambiguous / 0 empty-extraction over 205 scopes).
- `pnpm vitest run tests/commands/artifact.test.ts` → `Test Files 1 passed (1)`, `Tests 209 passed (209)` (gate no-ops on their 1.0 contracts).

### Comparison
- Tests added: 34 (3767 − 3733 = 34)
- Tests removed: 0
- Regressions: none

### New Tests Written
- coverage-gate.test.ts: 30 tests — extractScopeACs (4 forms, ambiguous, no-AC, de-dup, multi-digit, empty), joinCoverage (pinned, multi-AC, reason-less waiver, absent-AC waiver), evaluateCoverageGate (activation by version incl. numeric 1.10, block/no-block, uncovered listing, weak-matcher info, judgment/retired waivers, fail-open, diagnostic always present, never-throws), validateContractFormat 1.1 backward-compat.
- scope-ac-corpus.test.ts: 4 tests — corpus floor (>50, empty-guarded), emptyExtractionCount toBe(0), falseAmbiguousCount toBe(0), never-throws.

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run tests/commands/coverage-gate.test.ts tests/commands/scope-ac-corpus.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts)
(cd packages/cli && pnpm vitest run)
(cd packages/cli && pnpm run lint)
```

## Git History
```
147ebc6e [verifier-intent-coverage:s1] Wire coverage gate into both save paths
80d49d6c [verifier-intent-coverage:s1] Add scope-AC extractor + pre-seal coverage gate
fe070719 [verifier-intent-coverage:s1] Add ac links + coverage_waivers to contract types
```

## Open Issues

1. **Block path through artifact.ts is unit-covered, not integration-driven.** `applyCoverageGate`'s `process.exit(1)` on block is exercised via `evaluateCoverageGate` unit tests, but no test drives `saveArtifact`/`saveAllArtifacts` to an actual block — the gate is inert (no version 1.1 contract exists to trigger it until Phase 2). The artifact.ts layer is a thin print+exit mirror of the established `applyTestEvidenceGate`. (build_data_1.yaml: observation / monitor)
2. **AC6 ↔ AC13 resolution** documented above as a deviation; recorded as observation / acknowledge. The reading favors the explicitly-pinned AC13 assertions.
3. **Extractor precision (intentional).** `extractScopeACs` recovers ids only from the four structural forms; a mid-prose `AC3` without bold is not recovered. Intentional for precision; harmless while the gate is dormant; worth awareness when Phase 2 activates real contracts. (build_data_1.yaml: observation / monitor)
4. **Pre-existing lint warning** in `src/utils/git-operations.ts:198` ("Unused eslint-disable directive") — not introduced by this build, not in any file I touched.

Second pass: re-checked for unused params/imports (none — `ContractSchema` type import is used by `applyCoverageGate`), weakened assertions (none), and unhandled spec edge cases (multi-digit, heading+bullet de-dup, multi-AC `ac:` array, absent-AC waiver — all covered). The items above are the complete set.
