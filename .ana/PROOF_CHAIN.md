# Proof Chain Dashboard

187 runs · 169 active · 5 promoted · 888 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 34 | 35 | 2026-06-06 |
| cli | 129 | 111 | 2026-06-03 |
| website | 24 | 23 | 2026-06-01 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 13 | 8 |
| packages/cli/tests/commands/work.test.ts | 7 | 6 |
| packages/cli/src/engine/detectors/surfaces.ts | 7 | 4 |
| packages/cli/tests/commands/work-ci-mocked.test.ts | 6 | 2 |
| packages/cli/tests/commands/proof.test.ts | 5 | 4 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 169 total)

### packages/cli/src/commands/init/assets.ts

- **test:** atomicWriteFile SHA-256 integrity-failure branch (hash mismatch throw + temp cleanup) is untested — A011 is verified only indirectly via a passing happy-path write — *Template Propagation — Lock-Stock Refresh of Machine-Owned Templates on Re-init*
- **code:** atomicWriteFile fully replaces the removed copyAndVerifyFile (spec implied factoring the two to share). All writes now route through one content-based atomic+integrity helper; old helper removed with no remaining callers — cleaner than the spec's letter, no dead code — *Template Propagation — Lock-Stock Refresh of Machine-Owned Templates on Re-init*

### packages/cli/src/commands/init/index.ts

- **code:** Refresh-warning git-recovery hint hardcodes '.claude/agents/ana-build.md' regardless of which files changed — a Codex-only user, or one whose only change was CLAUDE.md, gets a Claude-path example. Echoes the hardcoded-'.claude/'-path pattern of gitignore-disclosure-and-hardening-C1 — *Template Propagation — Lock-Stock Refresh of Machine-Owned Templates on Re-init*

### packages/cli/src/commands/work-state.ts

- **code:** resolvePhase returns null for both 'all phases passed' and 'single-spec' — dual-meaning null forces callers to disambiguate — *Fix Multi-Phase Timestamp Poisoning*

### packages/cli/src/commands/work.ts

- **code:** Unsupported mergeStrategy classifier matches broad 'not allowed'/'disabled' text and can steal future policy failures from more specific guidance — *Fix work complete merge strategy*
- **code:** Dead conditional — verifyAgent always equals 'ana-verify' on both branches — *Fix Multi-Phase Timestamp Poisoning*
- **code:** startBuildPhaseWithKey is an unnecessary wrapper — delegates entirely to startBuildPhase with unused _buildAgentKey param — *Fix Multi-Phase Timestamp Poisoning*

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

### packages/cli/tests/commands/config.test.ts

- **test:** Diff removes many pre-existing @ana tags and explanatory comments from unrelated tests, weakening future contract traceability — *Fix work complete merge strategy*

### packages/cli/tests/commands/init.test.ts

- **test:** init.test.ts line 866 test description says '5 agent files' but body asserts 12 (6 agents) — *Learn Agent Codex Adaptation*

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

### packages/cli/tests/commands/work-ci-mocked.test.ts

- **test:** Duplicate @ana tags A001-A006 in work-ci-mocked.test.ts — old getAgentPid/conflict tests and new session tests share tag IDs from different contracts — *Fix Conditional Test No-Ops*
- **test:** createSessionTestProject helper is now triplicated — work.test.ts (removed), work-ci-mocked.test.ts (added), plus createMergedProject as similar pattern — *Fix Conditional Test No-Ops*
- **code:** A002 and A004 are semantically identical tests — both create session file with known timestamp, call startWork, assert saves.work_started_at equals that timestamp — *Fix Conditional Test No-Ops*

### packages/cli/tests/commands/work-merge.test.ts

- **test:** A003 is partly satisfied by source inspection because the tagged JSON success test checks clean output, not the merge argv — *Fix work complete merge strategy*

### packages/cli/tests/engine/detectors/detection-overrides.test.ts

- **test:** Temp fixture isolation depends on the package-manager detector's current five-level parent walk — *Fix SQL table counting regex*

### packages/cli/tests/engine/detectors/surfaces.test.ts

- **test:** @ana tag namespace collision — surfaces.test.ts carries A001-A027 tags from 3+ prior contracts, making per-contract tag lookup ambiguous — *Fix non-product path over-exclusion at deep segments*

### packages/cli/tests/engine/scan-engine-secrets.test.ts

- **test:** git init without -b main in both new test files — CI runners with different init.defaultBranch may fail — *Fix scan display accuracy — env hygiene false positive and contributor label*

