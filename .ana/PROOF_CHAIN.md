# Proof Chain Dashboard

195 runs · 219 active · 5 promoted · 907 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 36 | 42 | 2026-06-09 |
| cli | 135 | 154 | 2026-06-08 |
| website | 24 | 23 | 2026-06-01 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 15 | 10 |
| packages/cli/tests/commands/work.test.ts | 8 | 7 |
| packages/cli/tests/commands/artifact.test.ts | 7 | 6 |
| packages/cli/src/engine/detectors/surfaces.ts | 7 | 4 |
| packages/cli/src/commands/artifact.ts | 7 | 5 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 219 total)

### packages/cli/src/commands/_capture.ts

- **code:** executeDerive awaits a synchronous readFileSync + per-line JSON.parse of the full transcript before process.exit(0) on SessionEnd/Stop. The 250ms stdin cap bounds the read-wait, not the derive itself, so a very large finished transcript adds to hook teardown latency despite the spec's 'async, never delays teardown' intent. Low impact; recorded for awareness. Unchanged this cycle. — *session-capture — agent-session capture & provenance unlock*

### packages/cli/src/commands/artifact.ts

- **code:** artifact.ts comments still call the policy 'the capture gate' in prose (1041, 1073, 1495) — concept now named test-evidence gate — *Rename captureGate → testEvidenceGate (clean rename, no back-compat)*
- **code:** No-work re-validation leaves the provenance file modified-but-unstaged in the working tree. captureProvenanceAtSave writes provenance/{role}-{id}.json to disk BEFORE the no-changes guard; on the no-op path only `git reset -- provenancePaths` runs (unstage), which does not restore working-tree content. On the Claude fallback path captured_at is a fresh wall-clock each call, so the file churns on every re-save. AC9 ('no staged provenance') is met; this is beyond-AC. Risk: a downstream clean-tree assumption (future ana command, user pre-push hook) could trip on the lingering change. — *Cross-machine process provenance (capture v2)*

### packages/cli/src/commands/doctor.ts

- **test:** assessEnforcement parse-failure fallback (all-off) is untested — every enforcement test uses createMinimalProject which always writes a valid ana.json, so the try/catch catch branch never runs — *Move enforcement-gate state from ana work status to ana doctor*
- **code:** assessEnforcement reads ana.json twice per doctor run — once via the raw inline parse and once inside isCaptureGateEnabled. Deliberate and documented in the spec (correctness-without-duplication on a cold human-invoked path); recorded so it is revisited if doctor ever becomes a hot path — *Move enforcement-gate state from ana work status to ana doctor*

### packages/cli/src/commands/init/assets.ts

- **test:** pruneHookCommand never-throw guards for malformed shapes are unexercised — non-object hooks and non-array event value branches have no direct test — *Cross-machine process provenance (capture v2)*
- **code:** pruneHookCommand drops the WHOLE entry if any hooks[].command matches — a user co-locating their command in the same entry object as the derive hook would lose it (faithful to spec wording; Anatomia installs one command per entry so unreachable in practice) — *Cross-machine process provenance (capture v2)*
- **code:** session-capture build concern remains live (out of Phase 3 scope): ensureCodexHooksFlag flips any `hooks =` key via regex regardless of TOML table, so `hooks =` under a non-[features] table could be flipped. Not touched by this phase. — *Cross-machine process provenance (capture v2)*
- **code:** Codex config.toml [features] hooks=true is written only when the file is absent — a customer with a pre-existing .codex/config.toml that lacks the flag, turning capture on, gets hooks.json but no enablement, so the SessionStart hook silently never fires — *session-capture — agent-session capture & provenance unlock*
- **code:** pruneCaptureHook leaves empty hook-event arrays — a project whose only SessionStart entry was ours becomes "SessionStart": [] after flip-off (harmless cruft, no hook fires) — *session-capture — agent-session capture & provenance unlock*

### packages/cli/src/commands/run.ts

- **code:** Empirical cwd/slug checkpoint from spec-1 (confirm real cwd of an ana run build/verify launch) has no in-repo evidence. Slug resolves via detectWorktreeSlug(projectRoot), unit-tested with a worktree-meta fixture; clean-degrade (empty slug) covers the worst case regardless — *session-capture — agent-session capture & provenance unlock*

### packages/cli/src/commands/test.ts

- **code:** test.ts top docstring says verify 'resolves the top-level commands.test' but the implementation resolves via resolveTestCommandString, which prefers commands.test_json when present — the named field is imprecise — *Simplify ana test to its load-bearing core (deterministic seal)*

### packages/cli/src/commands/work-proof.ts

- **code:** computeCompleteness signature drops the spec's provenanceDir param — implemented as (reportsDir, sessions) vs spec's (provenanceDir, reportsDir, sessions) — *Cross-machine process provenance (capture v2)*
- **code:** Completeness is a presence floor (present >= expected): missing provenance is caught, but an extra/orphan build or verify session (present > expected) never flags. Intended for rework tolerance, but worth recording — the check only detects under-counting. — *Cross-machine process provenance (capture v2)*
- **code:** Unrequested scope expansion during the fix cycle: commit 41cdc1cb ('prefer banked counts, never drop a matched session') changed SessionProvenance.derived from required to optional, made assembleProcessAttestation keep a matched-but-counts-less session as a metadata-only row, and updated proof.ts to render 'counts unavailable' and skip such rows in cost totals. Beyond the FAIL's single required fix. It is a genuine robustness improvement (prevents silent session loss on a dangling/deleted transcript), well-tested (two new tests, both green) and type-safe (proof.ts handles d? everywhere). Not a blocker — recorded because a fix cycle widened beyond its mandate. — *session-capture — agent-session capture & provenance unlock*
- **code:** Partially mitigated, not resolved: assembleProcessAttestation still reads the home-global forensics buffer (~/.ana/forensics/sessions.jsonl, machine-wide, never pruned in Phase 1) in full at every work-complete, and recordBelongsToWorktree still reads each non-slug/non-cwd-matched record's entire transcript end-to-end for the per-line cwd scan. The 41cdc1cb banked-counts preference removed the redundant RE-derive for already-counted matched sessions, so per-matched-session cost is lower, but the unbounded buffer scan and per-candidate transcript read remain. Cost still grows with lifetime session count. — *session-capture — agent-session capture & provenance unlock*

### packages/cli/src/commands/work.ts

- **code:** Provenance-file reader is duplicated: the strict guard in work.ts inlines the same readdirSync+JSON.parse loop that assembleProcessAttestation uses; the two could drift (and the guard copy omits the sort). Spec permitted it, but a shared readSessionsFromDir helper would remove the drift risk. — *Cross-machine process provenance (capture v2)*

### packages/cli/src/utils/forensics.ts

- **code:** resolveTranscriptPath is exported from forensics.ts but has zero importers anywhere — its only consumer is the internal call at forensics.ts:695. Per the project rule 'flag exports with zero imports anywhere', the export keyword is needless public-API surface. The spec instructed the builder to keep it exported, so this is partly an upstream hint that did not pan out (no other consumer materialized). — *Cross-machine process provenance (capture v2)*
- **code:** parseTestCounts matches the first /(\d+)\s+passed/ in any Bash tool_result text, so prose mentioning 'N passed' (not a test runner) inflates tests_executed/failures_encountered. Documented best-effort and provenance-only (never feeds a verdict), so impact is low, but the metric is not trustworthy. Unchanged this cycle. — *session-capture — agent-session capture & provenance unlock*

### packages/cli/src/utils/git-operations.ts

- **code:** Pre-existing lint warning: unused eslint-disable (no-control-regex) in git-operations.ts — not introduced by this build (file not in diff), surfaced by the full lint run — *Rename captureGate → testEvidenceGate (clean rename, no back-compat)*
- **code:** Pre-existing lint warning (unused eslint-disable for no-control-regex) in git-operations.ts — not introduced by Phase 3 (file not in changeset); flagged so it is not mistaken for new debt — *Cross-machine process provenance (capture v2)*

### packages/cli/tests/commands/_capture.test.ts

- **test:** A013 no-network is a static source-scan (asserts no network-module imports / no fetch() in the capture source), not a runtime network counter — would not catch network I/O reached via an already-imported transitive module. Spec-sanctioned enforcement approach; low risk given capture path is fs+os only — *session-capture — agent-session capture & provenance unlock*
- **test:** AC12 no-network enforcement scan (_capture.test.ts:156) covers the derive/cost core (_capture.ts, forensics.ts, pricing.ts) but not the work-proof.ts assembly wrapper or artifact.ts churn path. Source inspection confirms no network code on the assembly path, so the guarantee holds where it matters, but the scanned set is narrower than the AC phrasing ('the capture + derive path'). — *session-capture — agent-session capture & provenance unlock*

### packages/cli/tests/commands/artifact-provenance.test.ts

- **test:** The no-work re-validation integration test asserts only `git diff --staged --quiet` (nothing staged) but does not assert a clean working tree (`git status --porcelain` empty). It therefore passes despite the modified-but-unstaged provenance file the no-op path leaves behind (see the artifact.ts code finding). A stronger assertion would have surfaced that beyond-AC behavior. — *Cross-machine process provenance (capture v2)*

### packages/cli/tests/commands/artifact.test.ts

- **test:** A004's tagged test exercises missing/malformed ana.json, not the precise 'valid config, flag absent' fail-safe; that exact case is covered untagged in init.test.ts — *Rename captureGate → testEvidenceGate (clean rename, no back-compat)*

### packages/cli/tests/commands/config.test.ts

- **test:** config A016-A018 are absence-only assertions (not.toContain 'not a known ana.json field') — they would pass vacuously if the config-set validation path no-op'd; they do not positively confirm the field was written. Contract-aligned (matcher is not_contains) but fragile as regression guards — *Move enforcement-gate state from ana work status to ana doctor*

### packages/cli/tests/commands/doctor.test.ts

- **test:** @ana A006 appears on both config.test.ts (this contract's KNOWN_FIELDS assertion) and doctor.test.ts (a predecessor contract's A006) — tags are not globally unique, muddying traceability — *Rename captureGate → testEvidenceGate (clean rename, no back-compat)*

### packages/cli/tests/commands/init/assets-capture-hooks.test.ts

- **test:** Codex capture install/prune path (applyCodexCaptureHooks) has zero automated test coverage — init integration test runs only --platforms claude — *session-capture — agent-session capture & provenance unlock*

### packages/cli/tests/commands/work.test.ts

- **test:** Strict guard under --merge is not directly exercised — the strict integration tests pre-merge via createMergedProject then call completeWork without --merge. The documented 'merge precedes guard' boundary message is unverified by test. — *Cross-machine process provenance (capture v2)*

### packages/cli/tests/utils/capture-marker.test.ts

- **test:** capture-marker.test.ts edited but absent from contract file_changes — a necessary consequence of renaming the exported evaluateCaptureGate/CaptureGateResult symbols — *Rename captureGate → testEvidenceGate (clean rename, no back-compat)*

