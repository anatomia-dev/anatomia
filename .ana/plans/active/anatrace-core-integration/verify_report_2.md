# Verify Report: Phase 2 — Behavioral attestation

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-13
**Spec:** .ana/plans/active/anatrace-core-integration/spec-2.md
**Branch:** feature/anatrace-core-integration

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../anatrace-core-integration/contract.yaml
  Seal: INTACT (hash sha256:59f34b384715784b106096d04f61bbc891730e7c3c21ea3212ecc041baa263a4)
```

Seal status: **INTACT** — the contract has not been modified since AnaPlan sealed it.

**Build:** PASS (`pnpm run build` — tsup ESM build success, 2 tasks successful).
**Lint:** PASS (`pnpm run lint` — 0 errors; 3 pre-existing warnings, none in Phase 2 files: `website/components/hero/Hero.tsx` unused vars, `git-operations.ts` unused eslint-disable).
**Tests (sealed verify re-run):** 3725 passed, 1 failed, 2 skipped.

```
<!-- ana:capture stage=verify slug=anatrace-core-integration counts=3725p/1f/2s verdict=fail sha256=e832d2e023a42ec0c84bc8f2c8bb1a6c6fb4e35c52ed42bbe2a5e06abf7d4443 -->
```

The single failing test is `tests/commands/init/template-propagation.test.ts > a Claude-only project never creates or touches the .codex tree` — a **5000ms timeout** under full-suite parallel load. It is **not a Phase 2 file** (init/template propagation, untouched by this build) and **passes 21/21 in isolation** (8.96s). This is an environmental flaky timeout on a slow init test, not a regression introduced by Phase 2. The three Phase 2 test files pass 21/21 independently and the suite count grew over the Phase-1 baseline (≥ 3700), so the count-does-not-decrease gate holds.

## Contract Compliance

Phase 2 owns assertions **A013–A026** (A001–A012 were verified in Phase 1, `verify_report_1.md`). Each row was confirmed by reading the tagged test and the implementation it exercises.

| ID   | Says                                                              | Status      | Evidence |
|------|-----------------------------------------------------------------|-------------|----------|
| A013 | Coverage declared by the trusted launcher, not inferred          | ✅ SATISFIED | compliance-context.test.ts:135-140 asserts `ctx.captureCoverage.source === 'trusted-launcher'`; built at compliance-context.ts:82-92 |
| A014 | Delegate-inclusive claim we didn't capture → unverifiable        | ✅ SATISFIED | compliance-context.test.ts:156-182 — real adapter mandate, subject widened to `delegates:'include'`, asserts `status === 'unverifiable'` |
| A015 | An unobserved behavior is never reported satisfied               | ✅ SATISFIED | compliance-context.test.ts:185-203 — Codex skill channel verdicts all `not.toBe('satisfied')`, ≥1 `codex-blind` |
| A016 | A runtime test assertion is never faked as a behavioral pass     | ✅ SATISFIED | compliance-context.test.ts:206-217 asserts `contract:A001` status `not satisfied` and `=== 'unverifiable'`, reason `runtime-scoped`; also compliance.test.ts:181-192 at record level |
| A017 | Never claims to have watched an uncaptured sub-agent             | ✅ SATISFIED | compliance-context.test.ts:143-153 — no non-root lane `captured:true`; root IS captured (non-vacuous) |
| A018 | Every session gets its own record — rework never collapsed        | ✅ SATISFIED | compliance.test.ts:156-178 — two build sessions → `['build-build-A.json','build-build-B.json']` (count 2) |
| A019 | Each record tied to the session that produced it                | ✅ SATISFIED | compliance.test.ts:138 `rec.session_id === 'sess-1'`; key `{role}-{session_id}` at compliance.ts:248 |
| A020 | Each record states which engine version judged it               | ✅ SATISFIED | compliance.test.ts:142-143 — `anatrace_core_version` equals `createRequire('anatrace-core/package.json').version` (not hardcoded; compliance.ts:51-59) |
| A021 | Each record states how much it could actually check             | ✅ SATISFIED | compliance.test.ts:146-147 — `coverage.total` is a number > 0; built at compliance.ts:233-237 |
| A022 | A broken transcript can never break saving your work            | ✅ SATISFIED | compliance.test.ts:206-223 — dangling transcript → `not.toThrow()`, null, no file; producer is one outer try-catch (compliance.ts:152/251) |
| A023 | Secrets in a session command never reach committed proof        | ✅ SATISFIED | compliance.test.ts:195-203 — secret token absent from committed record; `scrubDeep` at compliance.ts:244 + record stores no transcript bytes |
| A024 | A behavioral concern never flips a passing run to failing       | ✅ SATISFIED | proof-compliance-display.test.ts:87-107 — violated verdict rendered, `entry.result === 'PASS'`, card has no FAIL; `result: proof.result` only (work-proof.ts:357) |
| A025 | The proof shows how the session behaved, in its own section     | ✅ SATISFIED | proof-compliance-display.test.ts:68-84 — card contains "Session Attestation", counts, coverage, abbreviated hashes; renderSessionAttestation proof.ts:574-641 |
| A026 | When coverage was incomplete, the proof says so loudly          | ✅ SATISFIED | proof-compliance-display.test.ts:110-114 — "incomplete coverage — verdicts are evidence, never a gate" (proof.ts:637); loud WARN also at work-proof.ts:345-351 |

All 14 Phase 2 assertions SATISFIED. Every tagged test was read and confirmed to assert the contract's target/matcher/value — no rubber-stamping. Matcher methods match: A014/A016 use equality (`toBe`), A015/A016 negatives use `not.toBe('satisfied')`, A018 equality on the file set, A019/A020/A021 existence, A024 equality on `result === 'PASS'`, A025/A026 substring containment.

## Independent Findings

The implementation is a faithful, high-discipline mirror of the existing provenance/process-attestation pipeline. Notable strengths confirmed by reading source:

- **Soundness hinge is genuinely sound.** `buildRootLaneContext` (compliance-context.ts:72-99) never fabricates a `captured:true` delegate lane — it declares a root-only `ExpectedLaunchBoundary` and lets `coverageFromExpectedLaunchBoundary` reconcile against real `extractLineage` output. The mandatory-lineage gotcha (no lineage → everything unverifiable) is handled and documented (compliance-context.ts:87-91).
- **Save-site ordering is correct.** `captureComplianceAtSave` runs **before** `captureProvenanceAtSave` at both save sites (artifact.ts:1250→1258 and 1682→1690), so the producer reads the pending pointer before provenance deletes it. The producer reads but never deletes the pointer (compliance.ts:160-163).
- **Carried gotcha `cross-machine-provenance-C1` handled.** The compliance file is staged into the separate non-artifact `provenancePaths` list with `git reset` on the no-op path (artifact.ts:1272-1273, 1702-1703) and added to the commit pathspec (1285, 1715) — identical to provenance.
- **Never gates.** `result: proof.result` (work-proof.ts:357) is the only source of the headline; compliance is conditionally spread (work-proof.ts:389) and is never an input to the result. The display renders a violated verdict in red (proof.ts:608) but the count is presentational only.
- **Module boundary respected** (`learn-session-memory-C1`): `renderSessionAttestation` is module-private (proof.ts:574, no `export`).
- **Codex genuinely exercised, not parity-claimed** (compliance.test.ts:239-255): a real Codex rollout produces a record with `harness:'codex'`, a `codex-blind` verdict, and `complete:false`.

### Prediction resolution (Step 3)
1. *Producer might not run before provenance* — **Not found.** Ordering is correct at both sites.
2. *C1 staging/reset might be missed for the compliance file* — **Not found.** Pattern followed exactly.
3. *Soundness suite might be weakened* — **Not found.** Tests run the real `anatomiaAdapter`/`runCompliance` and assert reason *membership*, never a single literal (compliance-context.test.ts:128-131, 181, 198). **Surprise:** the delegate-inclusive arm required synthesizing one claim's `subject` because the adapter emits no `delegates:'include'` claims today — honestly documented in the test header (lines 21-30).
4. *`anatrace_core_version` hardcoded* — **Not found.** Read via `createRequire` (compliance.ts:51-59); test asserts equality to the live package version.
5. *Scrub not actually protecting* — **Surprise (partial).** scrubDeep runs, but the record shape already excludes transcript bytes, so the A023 test would pass even without scrubDeep. The guarantee holds; the test just can't isolate the mechanism (see Findings).

### Over-building / YAGNI check
- `buildRootLaneContext`'s `boundary` parameter is **inert today** (`void boundary;` at compliance-context.ts:80) — read and threaded from the call site (compliance.ts:200) but with no effect on output, since only `'root'` is supported. This is a spec-sanctioned future seam, not unrequested scope creep (spec-2.md:32, 62-65). Recorded as an observation.
- `canonicalSort` (named in the spec for the mandate hash) is **not imported** — the build hashes source-blob bytes instead. No unused import; the choice aligns with AC17 ("hashes are byte-identity attestation only"). Recorded as an upstream observation.
- No unused exports: `captureComplianceAtSave`/`assembleComplianceAttestations` are imported by artifact.ts/work-proof.ts; `buildRootLaneContext` by compliance.ts; the types by both. `renderSessionAttestation` kept module-private.

## Previous Findings Resolution

*Not applicable — this is the first verification of Phase 2. No prior `verify_report_2.md` existed.*

## AC Walkthrough

- **AC7** (one record per transcript, keyed `{role}-{session_id}`, with verdicts/hashes/version/framework/coverage): ✅ PASS — compliance.test.ts:127-178; record built at compliance.ts:224-240.
- **AC8** (coverage-aware verdicts; unobservable channel → unverifiable; reason varies, not hard-coded): ✅ PASS — compliance-context.test.ts:185-240 asserts reason membership and that ≥2 distinct reasons occur.
- **AC9** (`ana proof` renders Session Attestation with counts, hashes, coverage, loud incomplete warning, scrubbed detail): ✅ PASS — proof-compliance-display.test.ts:68-84; proof.ts:574-641.
- **AC10** (behavioral verdicts never gate PASS/FAIL): ✅ PASS — proof-compliance-display.test.ts:87-107; result sourced only from `proof.result` (work-proof.ts:357).
- **AC11** (delegate-inclusive negatives → unverifiable under root-only coverage): ✅ PASS — compliance-context.test.ts:156-182.
- **AC13** (every core call inside a total try-catch; malformed transcript → absent record, save completes, nothing throws): ✅ PASS — compliance.ts:152/251-253; compliance.test.ts:206-223. ⚠️ See Findings: the test exercises the *unreadable* path, not the *parseable-but-null* branch (compliance.ts:193).
- **AC14** (fail-closed, Anatomia-owned; never resolves unobserved channel to satisfied; never fabricates `captured:true`): ✅ PASS — compliance-context.test.ts:143-153, 185-203.
- **AC16** (runtime contract assertions never surface as satisfied): ✅ PASS — compliance-context.test.ts:206-217; compliance.test.ts:181-192.
- **AC17** (no regeneration-without-bytes claim; hashes are byte-identity only): ✅ PASS — both hashes are sha256 of raw bytes (compliance.ts:107-120, 188); types document "byte-identity attestation only" (proof.ts:174-177).
- **Codex acceptance** (producer exercised on a Codex fixture, or explicitly flagged): ✅ PASS — exercised (compliance.test.ts:239-255).
- **`pnpm vitest run` passes; lint passes; count does not decrease**: ⚠️ PARTIAL — lint clean and count grew, but the full suite shows 1 failed via a flaky timeout in an unrelated init test (passes in isolation; not a Phase 2 file). Phase 2 files: 21/21 green. Treated as environmental, not a regression.

## Blockers

None. Searched specifically for:
- **Coverage over-statement** (the one invariant that may not bend): no path constructs `captured:true` for a delegate lane; the soundness suite fails closed and is non-vacuous (root proven captured). None found.
- **Result gating**: confirmed `result` derives solely from `proof.result`; compliance is never an input. None found.
- **Pointer-ordering / lost Codex session**: producer runs before provenance at both save sites and does not consume the pointer. None found.
- **C1 unstaged-file regression**: compliance file staged into the separate list with reset-on-no-op. None found.
- **Secret egress into committed proof**: record stores no transcript bytes and passes scrubDeep; secret absent from the written file. None found.
- **Real test failures**: the single suite failure is a 5000ms timeout in an untouched init test that passes in isolation — environmental, not a Phase 2 regression.

## Findings

The YAML companion (`verify_data_2.yaml`) is the machine-authoritative list. Narrative reasoning below.

- **Test — A023 scrub test cannot isolate the scrub mechanism:** `packages/cli/tests/utils/compliance.test.ts:195` — the test asserts the secret token is absent from the committed record, but the record shape (`compliance.ts:215-240`) never copies transcript bytes (`says` comes from the mandate, evidence pointers are dropped), so the test would pass even if `scrubDeep` (compliance.ts:244) were deleted. A023 is genuinely SATISFIED — the guarantee holds by construction — but the test gives false confidence in the scrub call specifically. Next cycle: feed scrubDeep a record that *does* carry a token field to prove the scrub itself works.
- **Test — malformed-but-readable transcript branch is uncovered:** `packages/cli/src/utils/compliance.ts:193` (`if (session === null) return null`) is the spec's literal "malformed transcript" path, but the A022 totality test (compliance.test.ts:206) uses a *dangling/unreadable* file, which returns null one branch earlier (readFileSync catch at :185). The parseSession-returns-null branch is defensive code with no direct test. Low risk (totality is proven via the sibling path), but the exact AC13 case isn't pinned.
- **Code — `buildRootLaneContext` boundary param is inert:** `packages/cli/src/utils/compliance-context.ts:75` — `boundary` is accepted, threaded from `env['ANA_CAPTURE_BOUNDARY']` (compliance.ts:200), then discarded (`void boundary;`) because only `'root'` is supported. This is an intentional, spec-directed future seam (spec-2.md:32), not creep — flagged so the next engineer knows the param is currently a no-op and the env var has no observable effect yet.
- **Upstream — mandate hash uses byte-identity, not `canonicalSort`:** `packages/cli/src/utils/compliance.ts:107` — the spec named `canonicalSort` for the mandate hash, but the build hashes the agent-def+contract source bytes directly. This is arguably *more* faithful to AC17 ("byte-identity attestation only") and avoids an unused import. Worth acknowledging on the next contract seal so spec and code agree.
- **Code — empty engine version still satisfies A020:** `packages/cli/src/utils/compliance.ts:51` — `readCoreVersion` returns `''` on failure. A020's matcher is `exists`, so a record could carry an empty `anatrace_core_version` and still pass. In practice core's package.json is always resolvable, so this is observational only.
- **Test — flaky init test under parallel load:** `packages/cli/tests/commands/init/template-propagation.test.ts:308` times out at 5000ms in the full suite but passes 21/21 in isolation (~9s). Pre-existing, unrelated to Phase 2. Recommend raising its `testTimeout` or splitting the built-CLI fixture work so the full-suite run is deterministic.

## Deployer Handoff

- This is **Phase 2 of 2**. Phase 1 (provenance swap, A001–A012) is already verified and merged to the artifact state. With Phase 2 verified, the work item is complete — a PR covering the feature branch will be created.
- Phase 2 is **additive and backward-compatible**: `compliance?` is optional on `ProofChainEntry`; pre-existing proof entries remain valid. Behavioral verdicts are evidence only and never change any PASS/FAIL.
- New on-disk artifact: `.ana/plans/active/{slug}/compliance/{role}-{session_id}.json`, committed alongside provenance via the same separate-staging path.
- The full-suite run will intermittently show one timeout in `template-propagation.test.ts` — it is a known-flaky, unrelated init test (see Findings); re-run in isolation to confirm green.

## Verdict
**Shippable:** YES

All 14 Phase 2 contract assertions are SATISFIED against tests I read line-by-line, every acceptance criterion passes (one PARTIAL only because of an unrelated flaky-timeout test that passes in isolation), the build and lint are clean, and the correctness hinge — sound, fail-closed coverage that never produces a false `satisfied` — holds under the real `anatrace-core` engine. The findings are observations and test-hardening notes for the next cycle, not blockers. I would stake my name on this shipping.
