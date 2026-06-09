# Proof Chain Dashboard

198 runs · 229 active · 5 promoted · 910 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 37 | 45 | 2026-06-09 |
| cli | 137 | 161 | 2026-06-09 |
| website | 24 | 23 | 2026-06-01 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 16 | 11 |
| packages/cli/src/commands/init/assets.ts | 9 | 4 |
| packages/cli/tests/commands/artifact.test.ts | 8 | 7 |
| packages/cli/tests/commands/work.test.ts | 8 | 7 |
| packages/cli/src/engine/detectors/surfaces.ts | 7 | 4 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 229 total)

### packages/cli/src/commands/artifact-validators.ts

- **code:** validatePlanFormat phase detection recognizes only '- ' bullets (line.startsWith('- ')). A '* ' bullet or tab-prefixed dash would be silently uncounted. This faithfully mirrors countPhases (intentional, commented), so behavior is consistent — but it records a frozen-format fragility shared by both copies for the next engineer. — *Remove the non-authoritative plan.md phase checkbox*

### packages/cli/src/commands/artifact.ts

- **code:** artifact.ts comments still call the policy 'the capture gate' in prose (1041, 1073, 1495) — concept now named test-evidence gate — *Rename captureGate → testEvidenceGate (clean rename, no back-compat)*
- **code:** No-work re-validation leaves the provenance file modified-but-unstaged in the working tree. captureProvenanceAtSave writes provenance/{role}-{id}.json to disk BEFORE the no-changes guard; on the no-op path only `git reset -- provenancePaths` runs (unstage), which does not restore working-tree content. On the Claude fallback path captured_at is a fresh wall-clock each call, so the file churns on every re-save. AC9 ('no staged provenance') is met; this is beyond-AC. Risk: a downstream clean-tree assumption (future ana command, user pre-push hook) could trip on the lingering change. — *Cross-machine process provenance (capture v2)*

### packages/cli/src/commands/doctor.ts

- **test:** assessEnforcement parse-failure fallback (all-off) is untested — every enforcement test uses createMinimalProject which always writes a valid ana.json, so the try/catch catch branch never runs — *Move enforcement-gate state from ana work status to ana doctor*
- **code:** assessEnforcement reads ana.json twice per doctor run — once via the raw inline parse and once inside isCaptureGateEnabled. Deliberate and documented in the spec (correctness-without-duplication on a cold human-invoked path); recorded so it is revisited if doctor ever becomes a hot path — *Move enforcement-gate state from ana work status to ana doctor*

### packages/cli/src/commands/init/assets.ts

- **test:** atomicWriteFile SHA-256 integrity-failure branch still untested; .claude/.codex gitignore writes now route through it — *Merge (not clobber) managed .gitignore files on re-init*
- **code:** mergeAndWriteGitignore wrapper added beyond the literal spec (which said 'route through atomicWriteFile'). Thin DRY helper used at 3 call sites — good factoring, not scope creep. Over-build check: no unused exports, no dead paths. — *Merge (not clobber) managed .gitignore files on re-init*
- **test:** pruneHookCommand never-throw guards for malformed shapes are unexercised — non-object hooks and non-array event value branches have no direct test — *Cross-machine process provenance (capture v2)*
- **code:** pruneHookCommand drops the WHOLE entry if any hooks[].command matches — a user co-locating their command in the same entry object as the derive hook would lose it (faithful to spec wording; Anatomia installs one command per entry so unreachable in practice) — *Cross-machine process provenance (capture v2)*
- **code:** session-capture build concern remains live (out of Phase 3 scope): ensureCodexHooksFlag flips any `hooks =` key via regex regardless of TOML table, so `hooks =` under a non-[features] table could be flipped. Not touched by this phase. — *Cross-machine process provenance (capture v2)*

### packages/cli/src/commands/init/gitignore.ts

- **code:** Legacy migration (case 3) strips any user line equal to a current stock value anywhere in the file — a user's own copy of a stock line is absorbed into the managed block on first re-init. Documented benign (still ignored), one-time only. — *Merge (not clobber) managed .gitignore files on re-init*

### packages/cli/src/commands/work-proof.ts

- **code:** computeCompleteness signature drops the spec's provenanceDir param — implemented as (reportsDir, sessions) vs spec's (provenanceDir, reportsDir, sessions) — *Cross-machine process provenance (capture v2)*
- **code:** Completeness is a presence floor (present >= expected): missing provenance is caught, but an extra/orphan build or verify session (present > expected) never flags. Intended for rework tolerance, but worth recording — the check only detects under-counting. — *Cross-machine process provenance (capture v2)*

### packages/cli/src/commands/work.ts

- **code:** work.ts pull defense gates on porcelain status with !trimStart().startsWith('??'). A staged-deleted ('D ') or renamed ('R ') plan.md is also treated as 'modified' and restored from HEAD. Behavior is benign (restoring a non-authoritative file is desirable), but the comment frames the guard narrowly as 'tracked-modified'. — *Remove the non-authoritative plan.md phase checkbox*
- **code:** Provenance-file reader is duplicated: the strict guard in work.ts inlines the same readdirSync+JSON.parse loop that assembleProcessAttestation uses; the two could drift (and the guard copy omits the sort). Spec permitted it, but a shared readSessionsFromDir helper would remove the drift risk. — *Cross-machine process provenance (capture v2)*

### packages/cli/src/utils/forensics.ts

- **code:** resolveTranscriptPath is exported from forensics.ts but has zero importers anywhere — its only consumer is the internal call at forensics.ts:695. Per the project rule 'flag exports with zero imports anywhere', the export keyword is needless public-API surface. The spec instructed the builder to keep it exported, so this is partly an upstream hint that did not pan out (no other consumer materialized). — *Cross-machine process provenance (capture v2)*

### packages/cli/src/utils/git-operations.ts

- **code:** Pre-existing lint warning: unused eslint-disable (no-control-regex) in git-operations.ts — not introduced by this build (file not in diff), surfaced by the full lint run — *Rename captureGate → testEvidenceGate (clean rename, no back-compat)*
- **code:** Pre-existing lint warning (unused eslint-disable for no-control-regex) in git-operations.ts — not introduced by Phase 3 (file not in changeset); flagged so it is not mistaken for new debt — *Cross-machine process provenance (capture v2)*

### packages/cli/tests/commands/artifact-provenance.test.ts

- **test:** The no-work re-validation integration test asserts only `git diff --staged --quiet` (nothing staged) but does not assert a clean working tree (`git status --porcelain` empty). It therefore passes despite the modified-but-unstaged provenance file the no-op path leaves behind (see the artifact.ts code finding). A stronger assertion would have surfaced that beyond-AC behavior. — *Cross-machine process provenance (capture v2)*

### packages/cli/tests/commands/artifact.test.ts

- **test:** A010's tagged test runs on the artifact branch, where the removed verify-report→plan.md staging block was a guarded no-op (!artifactPaths.includes). The test passes identically with or without the fix — it does not discriminate the change it claims to cover. — *Remove the non-authoritative plan.md phase checkbox*
- **test:** A004's tagged test exercises missing/malformed ana.json, not the precise 'valid config, flag absent' fail-safe; that exact case is covered untagged in init.test.ts — *Rename captureGate → testEvidenceGate (clean rename, no back-compat)*

### packages/cli/tests/commands/config.test.ts

- **test:** config A016-A018 are absence-only assertions (not.toContain 'not a known ana.json field') — they would pass vacuously if the config-set validation path no-op'd; they do not positively confirm the field was written. Contract-aligned (matcher is not_contains) but fragile as regression guards — *Move enforcement-gate state from ana work status to ana doctor*

### packages/cli/tests/commands/doctor.test.ts

- **test:** A014 verified via results.overall === 'pass' proxy, not the literal exit code the contract names (doctorExitCode equals 0) — *Remove processCaptureStrict — provenance records-and-annotates, never blocks*
- **test:** @ana A006 appears on both config.test.ts (this contract's KNOWN_FIELDS assertion) and doctor.test.ts (a predecessor contract's A006) — tags are not globally unique, muddying traceability — *Rename captureGate → testEvidenceGate (clean rename, no back-compat)*

### packages/cli/tests/commands/init/assets-capture-hooks.test.ts

- **test:** Codex capture install/prune path (applyCodexCaptureHooks) has zero automated test coverage — init integration test runs only --platforms claude — *session-capture — agent-session capture & provenance unlock*

### packages/cli/tests/commands/init/commit.test.ts

- **test:** Stale @ana A001/A003/A004/A005/A006/A007/A013/A018/A021 tags on pre-existing commit.test.ts tests collide numerically with this contract's IDs, making grep-based @ana coverage ambiguous across contracts — *Merge (not clobber) managed .gitignore files on re-init*

### packages/cli/tests/commands/work-merge.test.ts

- **test:** Keystone merge test re-declares seedProvenance/readChainEntry helpers that duplicate seedActiveProvenance/readChainEntry in work.test.ts; cross-file duplication is justified by the child_process mock isolation but worth noting — *Remove processCaptureStrict — provenance records-and-annotates, never blocks*

### packages/cli/tests/commands/work.test.ts

- **test:** Strict guard under --merge is not directly exercised — the strict integration tests pre-merge via createMergedProject then call completeWork without --merge. The documented 'merge precedes guard' boundary message is unverified by test. — *Cross-machine process provenance (capture v2)*

### packages/cli/tests/utils/capture-marker.test.ts

- **test:** capture-marker.test.ts edited but absent from contract file_changes — a necessary consequence of renaming the exported evaluateCaptureGate/CaptureGateResult symbols — *Rename captureGate → testEvidenceGate (clean rename, no back-compat)*

### packages/cli/vitest.config.ts

- **test:** Coverage gate — the spec's designated 'real gate' (vitest.config thresholds 80/75/80/80) — is not mechanically runnable; @vitest/coverage-v8 is not a declared dependency, so the threshold check silently no-ops wherever the provider is absent — *Remove processCaptureStrict — provenance records-and-annotates, never blocks*

