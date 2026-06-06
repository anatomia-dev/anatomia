# Proof Chain Dashboard

189 runs · 179 active · 5 promoted · 894 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 35 | 37 | 2026-06-06 |
| cli | 130 | 119 | 2026-06-06 |
| website | 24 | 23 | 2026-06-01 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 14 | 9 |
| packages/cli/tests/commands/work.test.ts | 7 | 6 |
| packages/cli/src/engine/detectors/surfaces.ts | 7 | 4 |
| packages/cli/tests/commands/work-ci-mocked.test.ts | 6 | 2 |
| packages/cli/tests/commands/proof.test.ts | 5 | 4 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 179 total)

### packages/cli/src/commands/artifact.ts

- **code:** Block message did not reassure a build-only/no-tests agent. When the gate blocks on an armed project, the agent is told evidence is required and to run `ana test`, but not that `ana test` seals a harmless abstain when there are no tests. Added one chalk.gray guidance line; gate logic unchanged. Re-verified (build + full suite + lint + tsc green). — *Captured Test Evidence — engine-captured, seal-gated test evidence*
- **code:** isArmed is read twice on the first valid build-report save (applyCaptureGate at :796, then armCapture's idempotency guard at capture-state.ts:75). Negligible — capture.json is a small separate file off the hot .saves.json path — but the second read is redundant given wasArmed is already known. — *Captured Test Evidence — engine-captured, seal-gated test evidence*
- **test:** The 'valid' arming predicate uses warnings.length === 0 as a proxy for 'all three preservation validators passed' rather than asserting on validator results directly. Correct today because evaluateCaptureGate routes all non-blocking messages to warnings, but the coupling is implicit — a future change that emits an informational warning would silently stop arming. — *Captured Test Evidence — engine-captured, seal-gated test evidence*

### packages/cli/src/commands/init/assets.ts

- **test:** atomicWriteFile SHA-256 integrity-failure branch (hash mismatch throw + temp cleanup) is untested — A011 is verified only indirectly via a passing happy-path write — *Template Propagation — Lock-Stock Refresh of Machine-Owned Templates on Re-init*
- **code:** atomicWriteFile fully replaces the removed copyAndVerifyFile (spec implied factoring the two to share). All writes now route through one content-based atomic+integrity helper; old helper removed with no remaining callers — cleaner than the spec's letter, no dead code — *Template Propagation — Lock-Stock Refresh of Machine-Owned Templates on Re-init*

### packages/cli/src/commands/init/index.ts

- **code:** Refresh-warning git-recovery hint hardcodes '.claude/agents/ana-build.md' regardless of which files changed — a Codex-only user, or one whose only change was CLAUDE.md, gets a Claude-path example. Echoes the hardcoded-'.claude/'-path pattern of gitignore-disclosure-and-hardening-C1 — *Template Propagation — Lock-Stock Refresh of Machine-Owned Templates on Re-init*

### packages/cli/src/commands/test.ts

- **code:** Checkpoint passthrough is joined with spaces and re-parsed by resolveCommand, losing original argv quoting. A multi-token checkpoint command whose args contain spaces/parens/metacharacters is misparsed or refused (verified live: parens in an arg triggered a subshell refusal). Mitigated by degrade-to-raw so it never blocks, but counts/verdict are lost. — *Captured Test Evidence — engine-captured, seal-gated test evidence*
- **code:** inferRunner has a garbled inline comment about cargo/go precedence ('cargo test contains the substring go test… not, but be explicit'). Cosmetic; logic is correct (cargo checked before go). — *Captured Test Evidence — engine-captured, seal-gated test evidence*

### packages/cli/src/commands/work.ts

- **code:** getWorkStatus reads + parses .ana/ana.json twice per call — once inline (readFileSync + JSON.parse) for lastScanAt/captureGate at work.ts:~500, then again inside isCaptureGateEnabled (which re-reads + AnaJsonSchema.parses the same file) for captureGateActive at ~515. Harmless (status is cold-path) but two reads of one file; could thread the parsed object through. Unchanged since prior verify. — *Retire Capture-Gate Self-Arming — Drive the Gate from a Committed Config Flag*

### packages/cli/src/engine/detectors/surfaces.ts

- **code:** Redundant loop in isNonProductFilePath — EXCLUDED_SEGMENTS check and -e2e suffix check iterate the same range in separate loops — *Fix non-product path over-exclusion at deep segments*
- **code:** resolveViteFramework only handles 4 framework deps — Preact, Qwik, and other Vite-based frameworks return null — *Fix Vite Framework Detection and Service Detection Gaps*
- **code:** Signal 2 (apps/ directory) does not apply the library guard — a library package under apps/ with vite.config.ts and hasMain would still be detected as surface — *Fix Vite Framework Detection and Service Detection Gaps*
- **test:** No per-surface test for vue+react simultaneous deps in resolveViteFramework (Vue wins by priority, but untested) — *Fix Vite Framework Detection and Service Detection Gaps*
- **code:** NON_PRODUCT_GLOB_IGNORE includes **/build/** which collides with legitimate 'build' directories in some monorepo layouts — *Fix non-product code pollution in findings, hot files, schema counts, and deploy detection*

### packages/cli/src/engine/findings/rules/errorBoundaries.ts

- **code:** Redundant alias: GLOB_IGNORE = NON_PRODUCT_GLOB_IGNORE adds an unnecessary indirection — *Fix non-product code pollution in findings, hot files, schema counts, and deploy detection*

### packages/cli/src/engine/scan-engine.ts

- **test:** A011-A015 (service detection entries) have no tagged tests — verified by source inspection only — *Fix Vite Framework Detection and Service Detection Gaps*

### packages/cli/src/utils/capture-marker.ts

- **code:** validateCapturePresent uses parseMarkers (per-line scan) which does NOT skip inlined block content, unlike the integrity validators that use eachMarker. A capture marker embedded in preserved output could falsely satisfy 'present.' Harmless when a real top-level marker exists; the asymmetry is worth recording. — *Captured Test Evidence — engine-captured, seal-gated test evidence*

### packages/cli/src/utils/capture-runner.ts

- **code:** deriveCounts falls through to every parser when no hint matches; the rspec parser regex /(\d+) examples?, (\d+) failures?/ is loose enough to match unrelated output, risking a false count (and a false 'pass' when passed>0 at exit 0) on an unknown runner. Counts are fail-open by design, but a coincidental match defeats ABSTAIN-ON-UNKNOWN for that input. — *Captured Test Evidence — engine-captured, seal-gated test evidence*

### packages/cli/tests/capture-corpus/invariants.test.ts

- **test:** Corpus errorToken is the generic string 'Error' for 7 of 8 stacks (vitest uses the specific 'AssertionError'). It is present in each fail fixture, but a generic token is a weak assertion for ERROR-NEVER-STRIPPED — it would pass even if a different error string were the one preserved. — *Captured Test Evidence — engine-captured, seal-gated test evidence*

### packages/cli/tests/commands/artifact.test.ts

- **test:** A014 (verify-report sealed account) now has a genuine targeted @ana A014 test: saves a verify report carrying a bare marker with the gate ON, then asserts the saved verify_report.md contains the begin/end delimiters, the real sha256, AND the verbatim captured bytes that were absent before the save. Closes the prior verify's AC9 PARTIAL gap. Not a sentinel. — *Retire Capture-Gate Self-Arming — Drive the Gate from a Committed Config Flag*

### packages/cli/tests/commands/init/template-propagation.test.ts

- **test:** `tools` config-key preservation is untested — CLAUDE_AGENT_CONFIG_KEYS includes 'tools' but no test sets a tools frontmatter key and asserts it survives re-init; only `model` (A004) is exercised — *Template Propagation — Lock-Stock Refresh of Machine-Owned Templates on Re-init*
- **test:** CLAUDE.md overwrite-of-a-user-edit is not directly tested — A007 is verified only by presence of interpolation; no test mutates CLAUDE.md body then proves re-init resets it to stock — *Template Propagation — Lock-Stock Refresh of Machine-Owned Templates on Re-init*
- **test:** Changed-files warning test (A014) does not assert the exact set — it checks ana-build.md present and CLAUDE.md absent, but an unchanged agent erroneously appearing in the warning would not be caught — *Template Propagation — Lock-Stock Refresh of Machine-Owned Templates on Re-init*

### packages/cli/tests/commands/run.test.ts

- **test:** A004/A005 test checks test helper output, not real init behavior — *Learn Agent Codex Adaptation*
- **test:** A003 test asserts mock stub content ('# ana-learn prompt') not contract value ('Ana Learn') — *Learn Agent Codex Adaptation*

### packages/cli/tests/commands/scan.test.ts

- **test:** git init without -b main in contributor display test — *Fix scan display accuracy — env hygiene false positive and contributor label*
- **test:** A005 tests singular form only — contract value 'active contributors' (plural) not directly verified because test has 1 contributor — *Fix scan display accuracy — env hygiene false positive and contributor label*

### packages/cli/tests/engine/detectors/detection-overrides.test.ts

- **test:** Temp fixture isolation depends on the package-manager detector's current five-level parent walk — *Fix SQL table counting regex*

### packages/cli/tests/engine/detectors/surfaces.test.ts

- **test:** @ana tag namespace collision — surfaces.test.ts carries A001-A027 tags from 3+ prior contracts, making per-contract tag lookup ambiguous — *Fix non-product path over-exclusion at deep segments*

### packages/cli/tests/engine/scan-engine-secrets.test.ts

- **test:** git init without -b main in both new test files — CI runners with different init.defaultBranch may fail — *Fix scan display accuracy — env hygiene false positive and contributor label*

