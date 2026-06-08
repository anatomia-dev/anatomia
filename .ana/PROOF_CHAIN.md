# Proof Chain Dashboard

192 runs · 200 active · 5 promoted · 901 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 35 | 37 | 2026-06-06 |
| cli | 133 | 140 | 2026-06-08 |
| website | 24 | 23 | 2026-06-01 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 14 | 9 |
| packages/cli/tests/commands/work.test.ts | 7 | 6 |
| packages/cli/src/engine/detectors/surfaces.ts | 7 | 4 |
| packages/cli/tests/commands/artifact.test.ts | 6 | 5 |
| packages/cli/tests/commands/work-ci-mocked.test.ts | 6 | 2 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 200 total)

### packages/cli/src/commands/_capture.ts

- **code:** executeDerive awaits a synchronous readFileSync + per-line JSON.parse of the full transcript before process.exit(0) on SessionEnd/Stop. The 250ms stdin cap bounds the read-wait, not the derive itself, so a very large finished transcript adds to hook teardown latency despite the spec's 'async, never delays teardown' intent. Low impact; recorded for awareness. Unchanged this cycle. — *session-capture — agent-session capture & provenance unlock*

### packages/cli/src/commands/artifact.ts

- **code:** Block message did not reassure a build-only/no-tests agent. When the gate blocks on an armed project, the agent is told evidence is required and to run `ana test`, but not that `ana test` seals a harmless abstain when there are no tests. Added one chalk.gray guidance line; gate logic unchanged. Re-verified (build + full suite + lint + tsc green). — *Captured Test Evidence — engine-captured, seal-gated test evidence*
- **code:** isArmed is read twice on the first valid build-report save (applyCaptureGate at :796, then armCapture's idempotency guard at capture-state.ts:75). Negligible — capture.json is a small separate file off the hot .saves.json path — but the second read is redundant given wasArmed is already known. — *Captured Test Evidence — engine-captured, seal-gated test evidence*

### packages/cli/src/commands/init/assets.ts

- **code:** Codex config.toml [features] hooks=true is written only when the file is absent — a customer with a pre-existing .codex/config.toml that lacks the flag, turning capture on, gets hooks.json but no enablement, so the SessionStart hook silently never fires — *session-capture — agent-session capture & provenance unlock*
- **code:** pruneCaptureHook leaves empty hook-event arrays — a project whose only SessionStart entry was ours becomes "SessionStart": [] after flip-off (harmless cruft, no hook fires) — *session-capture — agent-session capture & provenance unlock*

### packages/cli/src/commands/run.ts

- **code:** Empirical cwd/slug checkpoint from spec-1 (confirm real cwd of an ana run build/verify launch) has no in-repo evidence. Slug resolves via detectWorktreeSlug(projectRoot), unit-tested with a worktree-meta fixture; clean-degrade (empty slug) covers the worst case regardless — *session-capture — agent-session capture & provenance unlock*

### packages/cli/src/commands/test.ts

- **code:** test.ts top docstring says verify 'resolves the top-level commands.test' but the implementation resolves via resolveTestCommandString, which prefers commands.test_json when present — the named field is imprecise — *Simplify ana test to its load-bearing core (deterministic seal)*
- **code:** 'Verify runs the full project' is config-dependent: on this repo top-level test_json scopes to packages/cli, so a --stage verify seal covers the CLI suite only and excludes the website package. Matches spec's accepted resolution rules; reader could over-read 'full project' — *Simplify ana test to its load-bearing core (deterministic seal)*
- **code:** isCheckpointSealConflict over-builds beyond this contract: it refuses an explicit --stage build/verify run through the -- <command> checkpoint form. Well-implemented and tested, and aligns with the anti-fabrication intent, but it is not part of the compact-capture-seal scope — it arrived via the merged sibling branch PR #281. — *Compact the capture seal + fix the count*
- **code:** Checkpoint passthrough is joined with spaces and re-parsed by resolveCommand, losing original argv quoting. A multi-token checkpoint command whose args contain spaces/parens/metacharacters is misparsed or refused (verified live: parens in an arg triggered a subshell refusal). Mitigated by degrade-to-raw so it never blocks, but counts/verdict are lost. — *Captured Test Evidence — engine-captured, seal-gated test evidence*
- **code:** inferRunner has a garbled inline comment about cargo/go precedence ('cargo test contains the substring go test… not, but be explicit'). Cosmetic; logic is correct (cargo checked before go). — *Captured Test Evidence — engine-captured, seal-gated test evidence*

### packages/cli/src/commands/work-proof.ts

- **code:** Unrequested scope expansion during the fix cycle: commit 41cdc1cb ('prefer banked counts, never drop a matched session') changed SessionProvenance.derived from required to optional, made assembleProcessAttestation keep a matched-but-counts-less session as a metadata-only row, and updated proof.ts to render 'counts unavailable' and skip such rows in cost totals. Beyond the FAIL's single required fix. It is a genuine robustness improvement (prevents silent session loss on a dangling/deleted transcript), well-tested (two new tests, both green) and type-safe (proof.ts handles d? everywhere). Not a blocker — recorded because a fix cycle widened beyond its mandate. — *session-capture — agent-session capture & provenance unlock*
- **code:** Partially mitigated, not resolved: assembleProcessAttestation still reads the home-global forensics buffer (~/.ana/forensics/sessions.jsonl, machine-wide, never pruned in Phase 1) in full at every work-complete, and recordBelongsToWorktree still reads each non-slug/non-cwd-matched record's entire transcript end-to-end for the per-line cwd scan. The 41cdc1cb banked-counts preference removed the redundant RE-derive for already-counted matched sessions, so per-matched-session cost is lower, but the unbounded buffer scan and per-candidate transcript read remain. Cost still grows with lifetime session count. — *session-capture — agent-session capture & provenance unlock*

### packages/cli/src/commands/work.ts

- **code:** getWorkStatus reads + parses .ana/ana.json twice per call — once inline (readFileSync + JSON.parse) for lastScanAt/captureGate at work.ts:~500, then again inside isCaptureGateEnabled (which re-reads + AnaJsonSchema.parses the same file) for captureGateActive at ~515. Harmless (status is cold-path) but two reads of one file; could thread the parsed object through. Unchanged since prior verify. — *Retire Capture-Gate Self-Arming — Drive the Gate from a Committed Config Flag*

### packages/cli/src/utils/capture-marker.ts

- **code:** Dropping required `lines` widens the accepted-seal grammar: any well-formed five-field line outside a fence now parses as a real seal (verbatim-paste forgery surface). Recorded-not-guarded per spec; deferred to the reserved enginebind token — *Simplify ana test to its load-bearing core (deterministic seal)*
- **code:** validateCapturePresent uses parseMarkers (per-line scan) which does NOT skip inlined block content, unlike the integrity validators that use eachMarker. A capture marker embedded in preserved output could falsely satisfy 'present.' Harmless when a real top-level marker exists; the asymmetry is worth recording. — *Captured Test Evidence — engine-captured, seal-gated test evidence*

### packages/cli/src/utils/capture-runner.ts

- **code:** deriveCounts falls through to every parser when no hint matches; the rspec parser regex /(\d+) examples?, (\d+) failures?/ is loose enough to match unrelated output, risking a false count (and a false 'pass' when passed>0 at exit 0) on an unknown runner. Counts are fail-open by design, but a coincidental match defeats ABSTAIN-ON-UNKNOWN for that input. — *Captured Test Evidence — engine-captured, seal-gated test evidence*

### packages/cli/src/utils/forensics.ts

- **code:** parseTestCounts matches the first /(\d+)\s+passed/ in any Bash tool_result text, so prose mentioning 'N passed' (not a test runner) inflates tests_executed/failures_encountered. Documented best-effort and provenance-only (never feeds a verdict), so impact is low, but the metric is not trustworthy. Unchanged this cycle. — *session-capture — agent-session capture & provenance unlock*

### packages/cli/src/utils/git-operations.ts

- **code:** Pre-existing lint warning (unused eslint-disable for no-control-regex) in git-operations.ts:198 — NOT introduced by this build (file is outside the diff); noted so it is not mistaken for a regression — *Simplify ana test to its load-bearing core (deterministic seal)*

### packages/cli/tests/capture-corpus/invariants.test.ts

- **test:** Corpus errorToken is the generic string 'Error' for 7 of 8 stacks (vitest uses the specific 'AssertionError'). It is present in each fail fixture, but a generic token is a weak assertion for ERROR-NEVER-STRIPPED — it would pass even if a different error string were the one preserved. — *Captured Test Evidence — engine-captured, seal-gated test evidence*

### packages/cli/tests/commands/_capture.test.ts

- **test:** A013 no-network is a static source-scan (asserts no network-module imports / no fetch() in the capture source), not a runtime network counter — would not catch network I/O reached via an already-imported transitive module. Spec-sanctioned enforcement approach; low risk given capture path is fs+os only — *session-capture — agent-session capture & provenance unlock*
- **test:** AC12 no-network enforcement scan (_capture.test.ts:156) covers the derive/cost core (_capture.ts, forensics.ts, pricing.ts) but not the work-proof.ts assembly wrapper or artifact.ts churn path. Source inspection confirms no network code on the assembly path, so the guarantee holds where it matters, but the scanned set is narrower than the AC phrasing ('the capture + derive path'). — *session-capture — agent-session capture & provenance unlock*

### packages/cli/tests/commands/artifact.test.ts

- **test:** A026 (byte-stable re-save / AC12) has no dedicated test, though the spec's Testing Strategy explicitly requested one. Behavior is sound by construction — inlining is deleted and applyCaptureGate is read-only, so the save path never mutates the report — but the contract target reportUnchangedOnSecondSave is verified by source inspection, not a regression test. — *Compact the capture seal + fix the count*
- **test:** A014 (verify-report sealed account) now has a genuine targeted @ana A014 test: saves a verify report carrying a bare marker with the gate ON, then asserts the saved verify_report.md contains the begin/end delimiters, the real sha256, AND the verbatim captured bytes that were absent before the save. Closes the prior verify's AC9 PARTIAL gap. Not a sentinel. — *Retire Capture-Gate Self-Arming — Drive the Gate from a Committed Config Flag*

### packages/cli/tests/commands/init/assets-capture-hooks.test.ts

- **test:** Codex capture install/prune path (applyCodexCaptureHooks) has zero automated test coverage — init integration test runs only --platforms claude — *session-capture — agent-session capture & provenance unlock*

### packages/cli/tests/commands/template-capture-instruction.test.ts

- **test:** Template wording assertions A020/A021 (AC8) have no automated regression test. template-capture-instruction.test.ts was not modified and contains no compact-seal assertion. A future template edit could silently reintroduce 'verbatim, sha-sealed block' or drop the compact description with the suite still green. — *Compact the capture seal + fix the count*

### packages/cli/tests/commands/test-command.test.ts

- **test:** A008 (configured test_json yields a non-abstain verdict on real output) has no hermetic unit test. Verified via live dogfood run (this repo seals 3429p/0f/2s, verdict=pass) plus the A006 JSON-parser test, but no in-test fixture exercises the full test_json -> executeCapture -> verdict!=abstain chain. — *Compact the capture seal + fix the count*

### packages/cli/tests/utils/capture-runner.test.ts

- **test:** capture-runner.test.ts tee test adds a redundant weaker follow-up (toBeGreaterThan(0)) right after a specific toBe(11) on the same value; the specific assertion already covers it — *Simplify ana test to its load-bearing core (deterministic seal)*

### General

- **test:** A016/A017 (.captures/ rule in the dogfood .ana/.gitignore and the init generator) are verified by source inspection only — no test asserts either gitignore carries the rule. The rule in assets.ts predates this build (PR #281); this build only corrected its stale comment. — *Compact the capture seal + fix the count*
- **test:** Net test count dropped 3434 -> 3431 (3429 passed + 2 skipped, 0 failed). Consistent with the documented deletion of the inliner round-trip and two block-validator suites, partially offset by new strict-parser/JSON/round-trip tests. No failing test, no coverage of live code lost — not a regression. The spec's literal '>= 3434' floor is not met. — *Compact the capture seal + fix the count*

