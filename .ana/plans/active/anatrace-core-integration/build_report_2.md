# Build Report: Phase 2 — Behavioral attestation

**Created by:** AnaBuild
**Date:** 2026-06-13
**Spec:** .ana/plans/active/anatrace-core-integration/spec-2.md
**Branch:** feature/anatrace-core-integration

## What Was Built

- **packages/cli/src/utils/compliance-context.ts** (created): `buildRootLaneContext(session, blobs, boundary?)` — the soundness hinge. Declares a trusted-launcher root-only `ExpectedLaunchBoundary`, runs `extractLineage`, reconciles via `coverageFromExpectedLaunchBoundary`, and returns `{ thisAgent: root, captureCoverage, lineage }`. Never fabricates `captured: true`; under-claims rather than over-states. The `boundary` param is read (defaults to `'root'`) so a future delegate-capturing phase is a one-line change.
- **packages/cli/src/utils/compliance.ts** (created): `captureComplianceAtSave(projectRoot, slug, env)` — the total save-time producer (mirror of `captureProvenanceAtSave`); resolves the session without consuming the pointer, parses it, builds the mandate from the role's agent-def + the work item's `contract.yaml`, hands core a sound context, runs `runCompliance`, and writes one `scrubDeep`'d record per transcript at `compliance/{role}-{session_id}.json`. `assembleComplianceAttestations(projectRoot, slug)` — reads committed records from `completed/{slug}/compliance/`, skips unparseable, orders deterministically, never throws.
- **packages/cli/src/types/proof.ts** (modified): added `ComplianceVerdictRecord` and `ComplianceAttestation` interfaces (the durable, snake_case, scrubbed record shape) and an optional `compliance?: ComplianceAttestation[]` field on `ProofChainEntry` (optional, never gates, proof valid without it — mirrors `process?`).
- **packages/cli/src/commands/run.ts** (modified): `buildCaptureEnv` now emits `ANA_CAPTURE_BOUNDARY: 'root'`; JSDoc updated (six → seven `ANA_*` vars) documenting it as the trusted-launcher capture-boundary declaration.
- **packages/cli/src/commands/artifact.ts** (modified): at both save sites, `captureComplianceAtSave` fires immediately **before** `captureProvenanceAtSave` (provenance consumes the pointer; Codex has no env fallback once gone). Its file is staged into the same separate non-artifact path list with identical `git reset`-on-no-op and commit-pathspec handling (cross-machine-provenance-C1).
- **packages/cli/src/commands/work-proof.ts** (modified): `writeProofChain` assembles `compliance` (capture-on only), conditionally spreads it onto the entry, and emits a loud `chalk.yellow` warning for incomplete-coverage records — never blocks.
- **packages/cli/src/commands/proof.ts** (modified): `formatHumanReadable` renders a **Session Attestation** section after Provenance when `entry.compliance?.length` — per-transcript counts, coverage line, abbreviated mandate/transcript hashes, compact scrubbed detail, loud incomplete warning. New render helpers (`renderSessionAttestation`, `shortHash`) are module-private (learn-session-memory-C1). Presentation only; never touches the headline.
- **Tests** (created): `tests/utils/compliance-context.test.ts` (6), `tests/utils/compliance.test.ts` (10), `tests/commands/proof-compliance-display.test.ts` (5). **Modified**: `tests/commands/run.test.ts` (+1 — `ANA_CAPTURE_BOUNDARY` assertion).

## PR Summary

- Adds deterministic, coverage-aware **behavioral attestation** — verdicts about *how* an agent session behaved (egress, file-scope, verify-independence) — as the mirror of the existing provenance pipeline: a save-time producer writes one committed record per transcript, `ana work complete` assembles them onto the proof entry, and `ana proof` renders a new **Session Attestation** section.
- The single correctness invariant — **over-stated coverage must never produce `satisfied`** — is built first and test-first in `buildRootLaneContext`: it declares a trusted-launcher root-only boundary and lets the published `anatrace-core` engine reconcile it against observed lineage, never fabricating a captured delegate lane.
- Verdicts are **evidence, never a gate**: a `violated` verdict renders with a red glyph but never changes a proof's PASS/FAIL. Every record is `scrubDeep`'d before commit, so no transcript bytes (and no tokens) reach git history.
- The producer is **total**: a malformed/unreadable transcript, an adapter exception, or a `runCompliance` failure leaves `ana artifact save` intact with the record simply absent. One record per transcript (keyed `{role}-{session_id}`) — rework is never collapsed.
- Both harnesses are exercised: a Codex fixture drives the `codex-blind` channel path.

## Acceptance Criteria Coverage

- AC7 "one record per transcript, keyed {role}-{session_id}, with verdicts/hashes/version/framework/coverage" → compliance.test.ts "writes ONE record per transcript" + "writes a compact record keyed {role}-{session_id} …" (A018, A019/A020/A021)
- AC8 "verdicts coverage-aware; unobservable channel → unverifiable; reason varies; never false satisfied" → compliance-context.test.ts "never resolves an unobserved channel to satisfied — Codex skill channel is blind" + "emits subject-dependent unverifiable reasons" (A015)
- AC9 "ana proof renders the Session Attestation section" → proof-compliance-display.test.ts "renders the section with counts, coverage line, and abbreviated hashes" (A025)
- AC10 "behavioral verdicts never gate PASS/FAIL" → proof-compliance-display.test.ts "renders a violated verdict but never flips the PASS headline or result" (A024)
- AC11 "delegate-inclusive negatives resolve unverifiable (root-only)" → compliance-context.test.ts "resolves a delegate-inclusive negative to unverifiable under root-only capture" (A014)
- AC13 "every producer core call inside a total try-catch; malformed transcript → absent record, save completes, nothing throws" → compliance.test.ts "is total — an unreadable transcript leaves the save intact with no record, no throw" (A022)
- AC14 "soundness fail-closed and Anatomia-owned; root-only context resolves delegate-inclusive negatives unverifiable; never resolves an unobserved channel satisfied; never fabricates captured:true" → compliance-context.test.ts "never marks a delegate lane captured — even when a delegate was observed" + the delegate-inclusive + unobserved-channel tests (A013/A014/A015/A017)
- AC16 "runtime contract.yaml assertions never satisfied" → compliance-context.test.ts "never surfaces a runtime contract assertion as a satisfied behavioral verdict" + compliance.test.ts "records a runtime contract assertion as never satisfied" (A016)
- AC17 "no field/rendering claims regeneration without retained bytes; hashes are byte-identity only" → enforced by design (hash JSDoc states "byte-identity attestation only"); record stores hashes, never transcript bytes. No dedicated test (documentation/design criterion).
- AC (Codex acceptance) "producer exercised on a Codex fixture, or flagged untested" → compliance.test.ts "produces a record for a Codex session (Codex exercised…)" — **Codex is exercised, not parity-claimed.**
- AC (suite) "pnpm vitest run passes; lint passes; test count does not decrease" → sealed run 3726 passed / 0 failed / 2 skipped (3706 → 3728 tests; +22). Lint clean on all changed files.

A026 "incomplete-coverage record renders a loud warning" → proof-compliance-display.test.ts "renders a loud warning when a record has incomplete coverage" (A026).

## Implementation Decisions

- **`provenancePaths` list reused for both records.** At each save site the compliance file is pushed onto the existing `provenancePaths` array rather than introducing a parallel list. The staging, `git reset`-on-no-op, and commit-pathspec logic already operate on that one list, so this keeps the cross-machine-provenance-C1 handling identical and minimal. The variable name now covers both non-artifact records; comments clarify.
- **`mandate_hash` = sha256 of agent-def bytes followed by contract bytes.** A byte-identity attestation of the mandate's source inputs (the spec specifies a `mandate_hash` / "mandate sha256" without prescribing the exact preimage). The contract bytes are folded in only when the contract is readable.
- **Engine identity rendered from the first record.** All records in one work item share the installed core version/framework, so the section prints `core vX · framework Y` once from `compliance[0]`.
- **Contract optional in the producer.** The agent-def is required (no agent-def → no mandate → no record); `contract.yaml` is folded in when present so its runtime `contract-matcher` assertions appear (and resolve `unverifiable`/`runtime-scoped`).

## Deviations from Contract

### A014: A claim about sub-agents we did not capture is reported unverifiable, never satisfied
**Instead:** The soundness test for the delegate-inclusive arm augments a *real* adapter-extracted claim's `subject` to `{ kind: 'agent', selector: 'this', delegates: 'include' }` before feeding it to `runCompliance`, rather than obtaining a delegate-inclusive claim directly from `anatomiaAdapter.extract`.
**Reason:** Probing core's actual behavior showed `anatomiaAdapter` does not emit any `subject.delegates: 'include'` claim from the current Anatomia agent-defs — every extracted claim carries an absent subject (the legacy flat session union). The spec's Step-1 plan assumed a delegate-inclusive claim would be available from the real mandate; it is not. The base mandate is still genuine adapter output; only the WHO-axis of one claim is set to the value the published `ClaimSubject` type defines.
**Outcome:** Functionally equivalent and arguably stronger — verified that the *same* real claim is `satisfied` when scoped to the observed root and flips to `unverifiable` (`delegate-coverage-incomplete`) once it claims delegate coverage we did not capture, with an observed-but-uncaptured delegate present in the session. The invariant (delegate-inclusive → never satisfied under root-only capture) is demonstrated against core's real reconciliation. Verifier should assess.

## Test Results

### Baseline (before changes)
Command: `pnpm vitest run` (from `packages/cli`)
```
Test Files  1 failed | 151 passed (152)
     Tests  1 failed | 3703 passed | 2 skipped (3706)
```
The single failure is a 5s test-timeout in `tests/commands/init/template-propagation.test.ts` ("a Claude-only project never creates or touches the .codex tree") under full-suite load. The `init` module is **not touched by this spec**. Confirmed pre-existing: the file passes 21/21 in isolation. This is the regression baseline (1 pre-existing failure).

### After Changes
Command (sealed): `ana test --stage build --slug anatrace-core-integration` → **3726 passed, 0 failed, 2 skipped** (verdict: pass). Sealed marker (bare line, outside any code fence so the gate parses it):

<!-- ana:capture stage=build slug=anatrace-core-integration counts=3726p/0f/2s verdict=pass sha256=8f04f001d48e8c8b764804d9d16fa672c5445f950cc3abba20c49f0ef1293375 -->

A clean sealed run: **3726 passed, 0 failed, 2 skipped**. The pre-existing `template-propagation.test.ts` 5s-timeout flake (the 1 failure seen in an earlier full-suite run) passed this run, confirming it is a load-dependent flake and not a regression from this build.

### Comparison
- Tests added: 22 (compliance-context 6, compliance 10, proof-compliance-display 5, run.test +1)
- Tests removed: 0
- Test count: 3706 → 3728 (does not decrease)
- Regressions: **none**. (An earlier full-suite run showed 1 failure — the pre-existing init/template-propagation timeout — which passed on the sealed re-run and in isolation; the `init` module is untouched by this spec.)

### New Tests Written
- `tests/utils/compliance-context.test.ts` — adversarial soundness: trusted-launcher coverage, no-delegate-captured guard, delegate-inclusive → unverifiable, unobserved Codex channel never satisfied, runtime-scoped never satisfied, subject-dependent reasons.
- `tests/utils/compliance.test.ts` — producer record shape/keying, two-sessions-two-records, runtime never satisfied in record, secret scrubbed, unreadable-transcript totality, capture-off / missing-agent-def → no record, Codex exercised, reader skip-unparseable + deterministic order.
- `tests/commands/proof-compliance-display.test.ts` — section render, violated-never-gates, incomplete warning, no-records-no-section, rework index.

## Verification Commands
```
pnpm run build                                                  # from repo root (typecheck + tsup)
(cd packages/cli && pnpm vitest run tests/utils/compliance-context.test.ts)
(cd packages/cli && pnpm vitest run tests/utils/compliance.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/proof-compliance-display.test.ts)
(cd packages/cli && pnpm vitest run)                            # full suite (≥ 3725 passing)
(cd packages/cli && pnpm run lint)
```

## Git History
```
c068420c [anatrace-core-integration:s2] Render the Session Attestation proof section
f41fbac8 [anatrace-core-integration:s2] Attach behavioral attestations to the proof entry
04c18266 [anatrace-core-integration:s2] Fire compliance producer at both save sites
c9c4a8a7 [anatrace-core-integration:s2] Behavioral attestation producer + reader
42cbe154 [anatrace-core-integration:s2] Add ComplianceAttestation type + capture-boundary env
0136ea20 [anatrace-core-integration:s2] Sound root-lane coverage construction
```
(Earlier commits are Phase 1 + its build/verify reports.)

## Open Issues

- **The producer's outer try-catch is not separately unit-triggered.** Every documented no-record path (capture off, no role, unresolvable session, unreadable transcript, missing agent-def, empty mandate) is an early return and is tested; a mid-pipeline throw (e.g. an adapter/`runCompliance` exception) that the outer `catch` would absorb is not forced in a test, because no external input reliably makes those core calls throw. The outer catch is defensive and mirrors `captureProvenanceAtSave`. Severity: observation; suggested action: monitor.
- **`parseSession` never returns null for in-band garbage.** It degrades any unparseable/empty/binary content to an empty session, so the "malformed transcript → no record" path is exercised via an *unreadable* (dangling) transcript, not corrupt bytes. A corrupt-but-readable transcript will still produce a record (with whatever the empty/degenerate session yields). This matches core's robustness but is worth noting against the spec's "malformed transcript" wording. Severity: observation; suggested action: monitor.
- **`provenancePaths` now holds compliance paths too** (see Implementation Decisions). Behavior is correct; the name is slightly broader than it reads. Severity: debt; suggested action: monitor.
- **Pre-existing flaky test (not introduced by this build):** `tests/commands/init/template-propagation.test.ts` intermittently times out at 5s under full-suite load; passes in isolation. Severity: debt; suggested action: scope (raise its timeout) — outside this spec's scope.

Forced second pass — re-examined: the delegate-inclusive deviation is documented above (not an open issue, it's a deviation); hashes-are-attestation-only (AC17) is design-enforced with no dedicated test, noted in AC coverage; no unused imports/params (lint clean); the section render mutates nothing. Nothing further surfaced. Verified complete by second pass.
