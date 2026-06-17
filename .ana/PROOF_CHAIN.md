# Proof Chain Dashboard

206 runs · 273 active · 5 promoted · 923 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 38 | 48 | 2026-06-09 |
| cli | 144 | 202 | 2026-06-17 |
| website | 24 | 23 | 2026-06-01 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 16 | 11 |
| packages/cli/src/commands/init/assets.ts | 9 | 4 |
| packages/cli/tests/commands/artifact.test.ts | 8 | 7 |
| packages/cli/tests/commands/work.test.ts | 8 | 7 |
| packages/cli/src/commands/proof.ts | 8 | 6 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 273 total)

### packages/cli/src/commands/artifact-validators.ts

- **code:** Bold-form regex /\*\*\s*(AC\d+)/ matches **ACn** anywhere on a line, so a prose mention ('see **AC3** above') extracts AC3 as a criterion id. Harmless across the 205-scope corpus and the dogfood (exactly AC1-14, no spurious ids), but a future version-1.1 contract could gain a spurious prose-derived id that becomes a false 'uncovered' block. Latent, low-likelihood. — *Verifier Intent Coverage — mechanically guarantee the contract covers scope intent*
- **code:** Defensive try/catch around joinCoverage in evaluateCoverageGate is effectively unreachable — joinCoverage is total (no throw path), so the 'could not evaluate' diagnostic branch cannot trigger in practice and no test exercises it. Spec explicitly requested defensive depth, so it is intentional, but it is untested dead-ish code. — *Verifier Intent Coverage — mechanically guarantee the contract covers scope intent*

### packages/cli/src/commands/plan.ts

- **code:** plan.ts missing-slug guard prints 'Error:' to stderr but exits 0 — an error condition reports success exit code — *Verifier Intent Coverage — mechanically guarantee the contract covers scope intent*
- **code:** plan.ts re-parses coverage_waivers for reason text because joinCoverage does not return the reason; minor duplication of waiver iteration — *Verifier Intent Coverage — mechanically guarantee the contract covers scope intent*

### packages/cli/src/commands/work-proof.ts

- **code:** User-facing incomplete-coverage warning says 'behavioral verdicts are evidence, never a gate' unqualified, while its sibling display copy in proof.ts:670 was correctly qualified with the veto exception — *Verifier Verdict Honesty (light) — the PASS/FAIL verdict stops grading itself*

### packages/cli/src/types/proof.ts

- **code:** Three type docstrings still assert verdicts are 'EVIDENCE, NEVER A GATE' unconditionally, now imprecise for the one allowlisted veto claim — *Verifier Verdict Honesty (light) — the PASS/FAIL verdict stops grading itself*

### packages/cli/src/utils/compliance-context.ts

- **code:** buildRootLaneContext boundary param is inert (void boundary) — accepted and threaded from the call site but has zero effect on output today; spec-sanctioned future seam — *anatrace-core integration (provenance swap + behavioral attestation)*

### packages/cli/src/utils/compliance.ts

- **code:** projectVerdicts default param `coreVersion: string = readCoreVersion()` re-invokes the resolver. The sole production caller passes coreVersion explicitly so it never fires today, but a future caller relying on the default would bypass the fail-closed gate and interpolate an empty `anatrace-core@` into the drift warning. — *Bump anatrace-core 0.2.0 → 0.4.0 (pin, fail-closed emit, reason lock, real-engine CI)*
- **test:** Malformed-but-readable transcript branch (parseSession returns null) is never exercised; the A022 totality test uses the unreadable-file path instead, leaving compliance.ts:193 uncovered — *anatrace-core integration (provenance swap + behavioral attestation)*
- **code:** readCoreVersion returns '' on failure; A020 ('exists') would still pass with an empty string, so a record could carry an empty engine version while satisfying the assertion — *anatrace-core integration (provenance swap + behavioral attestation)*

### packages/cli/src/utils/forensics.ts

- **code:** captureProvenanceAtSave no longer calls deriveTranscript — it re-reads bytes and calls deriveCountsFromBytes directly so the transcript_hash attests the same bytes (read-once). deriveTranscript is now reachable only from tests. Intentional, but the read-bytes+basename+derive sequence is duplicated across the two functions. — *anatrace-core integration (provenance swap + behavioral attestation)*
- **test:** AC13 totality (a core call throwing mid-capture must not break the save) has no explicit test that forces parseSession/deriveCounts to throw. Covered structurally by the outer try/catch in captureProvenanceAtSave and by the unreadable-transcript omit test, but not directly exercised. — *anatrace-core integration (provenance swap + behavioral attestation)*
- **code:** harness_version is still recorded empty — the session-capture build concern is NOT addressed by this phase (the spec explicitly defers filling it from the transcript version key to Phase 2). Noted so it is not assumed closed. — *anatrace-core integration (provenance swap + behavioral attestation)*
- **code:** resolveTranscriptPath remains exported with zero external importers (cross-machine-provenance-C2 still present). Not introduced by this build and not in scope; the refactor correctly added no NEW zero-importer exports. — *anatrace-core integration (provenance swap + behavioral attestation)*

### packages/cli/src/utils/git-operations.ts

- **code:** Pre-existing lint warning (unused eslint-disable directive) in git-operations.ts:198 — not in this build's file_changes, not a regression — *Verifier Verdict Honesty (light) — the PASS/FAIL verdict stops grading itself*

### packages/cli/src/utils/proofSummary.ts

- **code:** deriveVerdict coerces only on an exactly-spelled 'UNSATISFIED' status; a typo'd/garbled status cell falls back to 'UNKNOWN' (proofSummary.ts:205) and will NOT gate a PASS — consistent with the self-authored honesty boundary but fragile — *Verifier Verdict Honesty (light) — the PASS/FAIL verdict stops grading itself*
- **code:** proofSummary.ts continues to grow past the comfort threshold (Phase 2 adds coverage threading) — *Verifier Intent Coverage — mechanically guarantee the contract covers scope intent*
- **code:** parseACResults PARTIAL regex false-match risk only partially mitigated; section-scoping helps but in-section bullets containing PARTIAL in prose could still match — *Verifier Intent Coverage — mechanically guarantee the contract covers scope intent*

### packages/cli/src/utils/verdict.ts

- **code:** Circular import between verdict.ts and proofSummary.ts — verdict.ts imports parseComplianceTable, proofSummary.ts imports deriveVerdict — *Verifier Verdict Honesty (light) — the PASS/FAIL verdict stops grading itself*
- **code:** deriveVerdict never coerces a PASS on DEVIATED or UNCOVERED rows — only UNSATISFIED. By design (coverage gating is the separate verifier-intent-coverage feature), but the contradiction signal is intentionally narrow — *Verifier Verdict Honesty (light) — the PASS/FAIL verdict stops grading itself*

### packages/cli/tests/commands/proof-card-golden.test.ts

- **test:** Golden snapshot fixture INPUTS were changed (cache_read 80k→1M, 900k→1M; model gpt-5-codex→gpt-5) to keep the card within 80 columns once the wider real table-version label is shown — so the golden test no longer proves cost-invariance for unchanged inputs. — *anatrace-core integration (provenance swap + behavioral attestation)*

### packages/cli/tests/commands/scope-ac-corpus.test.ts

- **test:** scope-ac-corpus.test.ts asserts toBe(0) against the live, growing completed-scope corpus (205 today). A future completed scope using '## Acceptance Criteria' with non-AC-id criteria would flip emptyExtractionCount/falseAmbiguousCount and break this test in an unrelated future PR. Intentional safety gate, but couples future greens to historical scope formatting. — *Verifier Intent Coverage — mechanically guarantee the contract covers scope intent*

### packages/cli/tests/commands/verdict-veto-integration.test.ts

- **test:** A verify session that reads build_report.md via Bash/Grep substring (not the Read tool) is never exercised in Anatomia's own suite — relied on as an anatrace-core engine guarantee (read-paths binds only to Read file_path); a future engine bump could regress it undetected here — *Verifier Verdict Honesty (light) — the PASS/FAIL verdict stops grading itself*

### packages/cli/tests/commands/work-proof-process.test.ts

- **test:** Stray indentation in the prov() shape helper: derive_version sits at 6 spaces while sibling keys are at 8. Lint passes (eslint indent not enforced inside this object literal) but it is inconsistent with the file. — *anatrace-core integration (provenance swap + behavioral attestation)*

### packages/cli/tests/templates/agent-proof-context.test.ts

- **test:** @ana tags A001-A005 are duplicated within agent-proof-context.test.ts (prior merged contract + this contract) — tag-by-id resolution is ambiguous in this file — *Verifier Verdict Honesty (light) — the PASS/FAIL verdict stops grading itself*

### packages/cli/tests/utils/compliance.test.ts

- **test:** Real-engine happy-path tests (A052/A053/A054) judge a trivial 'doing work' transcript. A053 guards with verdicts.length > 0 before asserting zero out-of-set reasons, so it cannot pass vacuously — a good defensive assertion worth preserving if the fixture is ever simplified further. — *Bump anatrace-core 0.2.0 → 0.4.0 (pin, fail-closed emit, reason lock, real-engine CI)*
- **test:** A023 scrub test cannot isolate the scrub mechanism — the record shape already excludes transcript bytes, so the test passes even if scrubDeep were removed — *anatrace-core integration (provenance swap + behavioral attestation)*

### packages/cli/tests/utils/proofSummary.test.ts

- **test:** Stale/cross-contract @ana tags in long-lived test files mis-map this contract's assertion IDs — *Verifier Intent Coverage — mechanically guarantee the contract covers scope intent*

### General

- **test:** Flaky test in the broader suite — one test failed in the sealed verify run (3766p/1f/2s) but never reproduced across 7 full-suite runs + 5 regression-focus runs. 'Push failed after retry' noise points to a git-operation/retry test, not Phase 1 code. — *Verifier Intent Coverage — mechanically guarantee the contract covers scope intent*
- **code:** Observable (non-gating): no compliance record with anatrace_core_version == 0.4.0 is on disk yet for this cycle — it emits at `ana artifact save`, not at test time. Expected to land when the verify report is saved. Absence is a ~5-min follow-on per spec, never a held PR. — *Bump anatrace-core 0.2.0 → 0.4.0 (pin, fail-closed emit, reason lock, real-engine CI)*

