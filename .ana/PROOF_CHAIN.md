# Proof Chain Dashboard

202 runs · 242 active · 5 promoted · 916 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 38 | 48 | 2026-06-09 |
| cli | 140 | 171 | 2026-06-10 |
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

## Active Findings (30 shown of 242 total)

### packages/cli/src/commands/artifact-validators.ts

- **code:** validatePlanFormat phase detection recognizes only '- ' bullets (line.startsWith('- ')). A '* ' bullet or tab-prefixed dash would be silently uncounted. This faithfully mirrors countPhases (intentional, commented), so behavior is consistent — but it records a frozen-format fragility shared by both copies for the next engineer. — *Remove the non-authoritative plan.md phase checkbox*

### packages/cli/src/commands/artifact.ts

- **code:** artifact.ts comments still call the policy 'the capture gate' in prose (1041, 1073, 1495) — concept now named test-evidence gate — *Rename captureGate → testEvidenceGate (clean rename, no back-compat)*

### packages/cli/src/commands/doctor.ts

- **test:** assessEnforcement parse-failure fallback (all-off) is untested — every enforcement test uses createMinimalProject which always writes a valid ana.json, so the try/catch catch branch never runs — *Move enforcement-gate state from ana work status to ana doctor*

### packages/cli/src/commands/init/assets.ts

- **test:** atomicWriteFile SHA-256 integrity-failure branch still untested; .claude/.codex gitignore writes now route through it — *Merge (not clobber) managed .gitignore files on re-init*
- **code:** mergeAndWriteGitignore wrapper added beyond the literal spec (which said 'route through atomicWriteFile'). Thin DRY helper used at 3 call sites — good factoring, not scope creep. Over-build check: no unused exports, no dead paths. — *Merge (not clobber) managed .gitignore files on re-init*

### packages/cli/src/commands/init/gitignore.ts

- **code:** Legacy migration (case 3) strips any user line equal to a current stock value anywhere in the file — a user's own copy of a stock line is absorbed into the managed block on first re-init. Documented benign (still ignored), one-time only. — *Merge (not clobber) managed .gitignore files on re-init*

### packages/cli/src/commands/proof.ts

- **code:** Hot Spots statGrid middle column (findings text) is unbounded — only name (maxWidth:22) and runs columns are constrained; a pathological severity breakdown could push the runs column right. Bounded in practice by small integer counts — *Health dashboard + proof list table adopt the shared render vocabulary; sparkline primitive added and adopted in the scan card*
- **code:** Ad-hoc bold sub-header `chalk.bold('  Phase breakdown')` still present inside formatHumanReadable. AC2 says no inline section-header construction should remain; this sub-header (inside the Timing block, multi-phase path) was not converted to a primitive. Carried from the FAIL round — never a blocker (AC2 was PARTIAL), and a defensible call since it is a sub-header inside a section, not a top-level section header. — *Proof card visual redesign on a shared render vocabulary*
- **code:** Counts-unavailable session (derived absent) renders as a standalone `<label>  counts unavailable` line above the grid (proof.ts:452-455), not as an in-grid row spanning the numeric columns as the spec mockup depicts. This is arguably cleaner (keeps numeric columns from widening) and the substance — the session is shown loudly and contributes nothing to totals — is fully met. No contract assertion governs the exact rendering. — *Proof card visual redesign on a shared render vocabulary*
- **code:** Empty-chain JSON payload now triplicated — --last empty branch adds a third copy of wrapJsonResponse('proof', { entries }, chain) — *Surface the proof after work complete + ana proof --last*
- **code:** sortEntriesByRecency kept module-private (not exported) — good restraint given proof.ts's documented history of over-exporting helpers (learn-session-memory-C1) — *Surface the proof after work complete + ana proof --last*

### packages/cli/src/commands/scan.ts

- **code:** scan.ts adopts sparkline but never wires the ascii fallback — the tested ascii path has zero production consumers, so a non-UTF-8 terminal gets block glyphs — *Health dashboard + proof list table adopt the shared render vocabulary; sparkline primitive added and adopted in the scan card*

### packages/cli/src/commands/work.ts

- **code:** work.ts pull defense gates on porcelain status with !trimStart().startsWith('??'). A staged-deleted ('D ') or renamed ('R ') plan.md is also treated as 'modified' and restored from HEAD. Behavior is benign (restoring a non-authoritative file is desirable), but the comment frames the guard narrowly as 'tracked-modified'. — *Remove the non-authoritative plan.md phase checkbox*

### packages/cli/src/utils/displayNames.ts

- **code:** Seven of eight new validation display-name entries (joi, yup, valibot, superstruct, ajv, pydantic, marshmallow) are unexercised — only 'zod' is reached. Consistent with the map's existing forward-coverage convention, low risk. — *Scan card redesign — shared render vocabulary + gated 'How your team writes' section*

### packages/cli/src/utils/git-operations.ts

- **code:** Pre-existing lint warning: unused eslint-disable (no-control-regex) in git-operations.ts — not introduced by this build (file not in diff), surfaced by the full lint run — *Rename captureGate → testEvidenceGate (clean rename, no back-compat)*

### packages/cli/src/utils/render.ts

- **code:** sparkline flat non-zero series renders as all-lowest glyphs (▁▁▁) — a steady weekly-commit series reads visually as near-zero/declining activity; documented spark-tool convention but a perceptual gotcha for this use case — *Health dashboard + proof list table adopt the shared render vocabulary; sparkline primitive added and adopted in the scan card*

### packages/cli/tests/commands/artifact.test.ts

- **test:** A010's tagged test runs on the artifact branch, where the removed verify-report→plan.md staging block was a guarded no-op (!artifactPaths.includes). The test passes identically with or without the fix — it does not discriminate the change it claims to cover. — *Remove the non-authoritative plan.md phase checkbox*
- **test:** A004's tagged test exercises missing/malformed ana.json, not the precise 'valid config, flag absent' fail-safe; that exact case is covered untagged in init.test.ts — *Rename captureGate → testEvidenceGate (clean rename, no back-compat)*

### packages/cli/tests/commands/config.test.ts

- **test:** config A016-A018 are absence-only assertions (not.toContain 'not a known ana.json field') — they would pass vacuously if the config-set validation path no-op'd; they do not positively confirm the field was written. Contract-aligned (matcher is not_contains) but fragile as regression guards — *Move enforcement-gate state from ana work status to ana doctor*

### packages/cli/tests/commands/doctor.test.ts

- **test:** A014 verified via results.overall === 'pass' proxy, not the literal exit code the contract names (doctorExitCode equals 0) — *Remove processCaptureStrict — provenance records-and-annotates, never blocks*
- **test:** @ana A006 appears on both config.test.ts (this contract's KNOWN_FIELDS assertion) and doctor.test.ts (a predecessor contract's A006) — tags are not globally unique, muddying traceability — *Rename captureGate → testEvidenceGate (clean rename, no back-compat)*

### packages/cli/tests/commands/init/commit.test.ts

- **test:** Stale @ana A001/A003/A004/A005/A006/A007/A013/A018/A021 tags on pre-existing commit.test.ts tests collide numerically with this contract's IDs, making grep-based @ana coverage ambiguous across contracts — *Merge (not clobber) managed .gitignore files on re-init*

### packages/cli/tests/commands/proof-card-golden.test.ts

- **test:** Golden test pins the timezone by mutating process.env['TZ']='UTC' in beforeAll and restoring in afterAll. Correct and robust for this file (verified green under UTC/Tokyo/New_York, and full suite green under TZ=UTC). But process.env.TZ is process-global: if vitest ever runs this file in a worker shared with another time-dependent test file, that file could transiently observe UTC during this file's run. No leak observed in practice; the restore is clean. — *Proof card visual redesign on a shared render vocabulary*

### packages/cli/tests/commands/proof.test.ts

- **test:** Build touches the health header box but relies on the pre-existing weak trailing-gap test (local A005, proof.test.ts:5505) which asserts only toContain('  ') anywhere on the line — already a recurring proof-chain finding, not strengthened here — *Health dashboard + proof list table adopt the shared render vocabulary; sparkline primitive added and adopted in the scan card*
- **test:** No coverage for `proof --last --json` on an empty/missing chain — A011/A012 only exercise human stdout + exit code, so the new duplicated JSON empty branch is unexercised — *Surface the proof after work complete + ana proof --last*

### packages/cli/tests/commands/scan.test.ts

- **test:** Stale @ana tags in scan.test.ts collide with this contract's assertion IDs — *Scan card redesign — shared render vocabulary + gated 'How your team writes' section*

### packages/cli/tests/commands/work-merge.test.ts

- **test:** Keystone merge test re-declares seedProvenance/readChainEntry helpers that duplicate seedActiveProvenance/readChainEntry in work.test.ts; cross-file duplication is justified by the child_process mock isolation but worth noting — *Remove processCaptureStrict — provenance records-and-annotates, never blocks*

### packages/cli/tests/utils/capture-marker.test.ts

- **test:** capture-marker.test.ts edited but absent from contract file_changes — a necessary consequence of renaming the exported evaluateCaptureGate/CaptureGateResult symbols — *Rename captureGate → testEvidenceGate (clean rename, no back-compat)*

### packages/cli/tests/utils/proofSummary.test.ts

- **test:** Stale `@ana A020` tag points at the wrong assertion. In this contract A020 is the findings-overflow no-bare-and-N-more rule, but the tag sits on the single-phase phase-breakdown test in an unmodified file. Pre-existing mis-tag; harmless here (A020 is correctly covered by the golden test at line 251) but would mislead tag-driven verification. Carried from the FAIL round; the fix cycle did not touch this file. — *Proof card visual redesign on a shared render vocabulary*

### packages/cli/vitest.config.ts

- **test:** Coverage gate — the spec's designated 'real gate' (vitest.config thresholds 80/75/80/80) — is not mechanically runnable; @vitest/coverage-v8 is not a declared dependency, so the threshold check silently no-ops wherever the provider is absent — *Remove processCaptureStrict — provenance records-and-annotates, never blocks*

