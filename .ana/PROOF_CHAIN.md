# Proof Chain Dashboard

204 runs · 256 active · 5 promoted · 921 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 38 | 48 | 2026-06-09 |
| cli | 142 | 185 | 2026-06-16 |
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

## Active Findings (30 shown of 256 total)

### packages/cli/src/commands/init/assets.ts

- **test:** atomicWriteFile SHA-256 integrity-failure branch still untested; .claude/.codex gitignore writes now route through it — *Merge (not clobber) managed .gitignore files on re-init*

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

### packages/cli/src/utils/compliance-context.ts

- **code:** buildRootLaneContext boundary param is inert (void boundary) — accepted and threaded from the call site but has zero effect on output today; spec-sanctioned future seam — *anatrace-core integration (provenance swap + behavioral attestation)*

### packages/cli/src/utils/compliance.ts

- **code:** projectVerdicts default param `coreVersion: string = readCoreVersion()` re-invokes the resolver. The sole production caller passes coreVersion explicitly so it never fires today, but a future caller relying on the default would bypass the fail-closed gate and interpolate an empty `anatrace-core@` into the drift warning. — *Bump anatrace-core 0.2.0 → 0.4.0 (pin, fail-closed emit, reason lock, real-engine CI)*
- **test:** Malformed-but-readable transcript branch (parseSession returns null) is never exercised; the A022 totality test uses the unreadable-file path instead, leaving compliance.ts:193 uncovered — *anatrace-core integration (provenance swap + behavioral attestation)*
- **code:** readCoreVersion returns '' on failure; A020 ('exists') would still pass with an empty string, so a record could carry an empty engine version while satisfying the assertion — *anatrace-core integration (provenance swap + behavioral attestation)*

### packages/cli/src/utils/displayNames.ts

- **code:** Seven of eight new validation display-name entries (joi, yup, valibot, superstruct, ajv, pydantic, marshmallow) are unexercised — only 'zod' is reached. Consistent with the map's existing forward-coverage convention, low risk. — *Scan card redesign — shared render vocabulary + gated 'How your team writes' section*

### packages/cli/src/utils/forensics.ts

- **code:** captureProvenanceAtSave no longer calls deriveTranscript — it re-reads bytes and calls deriveCountsFromBytes directly so the transcript_hash attests the same bytes (read-once). deriveTranscript is now reachable only from tests. Intentional, but the read-bytes+basename+derive sequence is duplicated across the two functions. — *anatrace-core integration (provenance swap + behavioral attestation)*
- **test:** AC13 totality (a core call throwing mid-capture must not break the save) has no explicit test that forces parseSession/deriveCounts to throw. Covered structurally by the outer try/catch in captureProvenanceAtSave and by the unreadable-transcript omit test, but not directly exercised. — *anatrace-core integration (provenance swap + behavioral attestation)*
- **code:** harness_version is still recorded empty — the session-capture build concern is NOT addressed by this phase (the spec explicitly defers filling it from the transcript version key to Phase 2). Noted so it is not assumed closed. — *anatrace-core integration (provenance swap + behavioral attestation)*
- **code:** resolveTranscriptPath remains exported with zero external importers (cross-machine-provenance-C2 still present). Not introduced by this build and not in scope; the refactor correctly added no NEW zero-importer exports. — *anatrace-core integration (provenance swap + behavioral attestation)*

### packages/cli/src/utils/render.ts

- **code:** sparkline flat non-zero series renders as all-lowest glyphs (▁▁▁) — a steady weekly-commit series reads visually as near-zero/declining activity; documented spark-tool convention but a perceptual gotcha for this use case — *Health dashboard + proof list table adopt the shared render vocabulary; sparkline primitive added and adopted in the scan card*

### packages/cli/tests/commands/init/commit.test.ts

- **test:** Stale @ana A001/A003/A004/A005/A006/A007/A013/A018/A021 tags on pre-existing commit.test.ts tests collide numerically with this contract's IDs, making grep-based @ana coverage ambiguous across contracts — *Merge (not clobber) managed .gitignore files on re-init*

### packages/cli/tests/commands/init/template-propagation.test.ts

- **test:** tests/commands/init/template-propagation.test.ts is flaky under full-suite parallel load (5000ms timeout; passes in isolation at ~9s). Pre-existing, unrelated to Phase 2 — raise its timeout or split it — *anatrace-core integration (provenance swap + behavioral attestation)*

### packages/cli/tests/commands/proof-card-golden.test.ts

- **test:** Golden snapshot fixture INPUTS were changed (cache_read 80k→1M, 900k→1M; model gpt-5-codex→gpt-5) to keep the card within 80 columns once the wider real table-version label is shown — so the golden test no longer proves cost-invariance for unchanged inputs. — *anatrace-core integration (provenance swap + behavioral attestation)*
- **test:** Golden test pins the timezone by mutating process.env['TZ']='UTC' in beforeAll and restoring in afterAll. Correct and robust for this file (verified green under UTC/Tokyo/New_York, and full suite green under TZ=UTC). But process.env.TZ is process-global: if vitest ever runs this file in a worker shared with another time-dependent test file, that file could transiently observe UTC during this file's run. No leak observed in practice; the restore is clean. — *Proof card visual redesign on a shared render vocabulary*

### packages/cli/tests/commands/proof.test.ts

- **test:** Build touches the health header box but relies on the pre-existing weak trailing-gap test (local A005, proof.test.ts:5505) which asserts only toContain('  ') anywhere on the line — already a recurring proof-chain finding, not strengthened here — *Health dashboard + proof list table adopt the shared render vocabulary; sparkline primitive added and adopted in the scan card*
- **test:** No coverage for `proof --last --json` on an empty/missing chain — A011/A012 only exercise human stdout + exit code, so the new duplicated JSON empty branch is unexercised — *Surface the proof after work complete + ana proof --last*

### packages/cli/tests/commands/scan.test.ts

- **test:** Stale @ana tags in scan.test.ts collide with this contract's assertion IDs — *Scan card redesign — shared render vocabulary + gated 'How your team writes' section*

### packages/cli/tests/commands/work-proof-process.test.ts

- **test:** Stray indentation in the prov() shape helper: derive_version sits at 6 spaces while sibling keys are at 8. Lint passes (eslint indent not enforced inside this object literal) but it is inconsistent with the file. — *anatrace-core integration (provenance swap + behavioral attestation)*

### packages/cli/tests/utils/compliance.test.ts

- **test:** Real-engine happy-path tests (A052/A053/A054) judge a trivial 'doing work' transcript. A053 guards with verdicts.length > 0 before asserting zero out-of-set reasons, so it cannot pass vacuously — a good defensive assertion worth preserving if the fixture is ever simplified further. — *Bump anatrace-core 0.2.0 → 0.4.0 (pin, fail-closed emit, reason lock, real-engine CI)*
- **test:** A023 scrub test cannot isolate the scrub mechanism — the record shape already excludes transcript bytes, so the test passes even if scrubDeep were removed — *anatrace-core integration (provenance swap + behavioral attestation)*

### packages/cli/tests/utils/proofSummary.test.ts

- **test:** Stale `@ana A020` tag points at the wrong assertion. In this contract A020 is the findings-overflow no-bare-and-N-more rule, but the tag sits on the single-phase phase-breakdown test in an unmodified file. Pre-existing mis-tag; harmless here (A020 is correctly covered by the golden test at line 251) but would mislead tag-driven verification. Carried from the FAIL round; the fix cycle did not touch this file. — *Proof card visual redesign on a shared render vocabulary*

### General

- **code:** Observable (non-gating): no compliance record with anatrace_core_version == 0.4.0 is on disk yet for this cycle — it emits at `ana artifact save`, not at test time. Expected to land when the verify report is saved. Absence is a ~5-min follow-on per spec, never a held PR. — *Bump anatrace-core 0.2.0 → 0.4.0 (pin, fail-closed emit, reason lock, real-engine CI)*

