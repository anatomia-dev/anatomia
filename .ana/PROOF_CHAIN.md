# Proof Chain Dashboard

185 runs · 173 active · 5 promoted · 876 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 33 | 33 | 2026-06-02 |
| cli | 128 | 117 | 2026-06-02 |
| website | 24 | 23 | 2026-06-01 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 13 | 8 |
| packages/cli/src/engine/detectors/surfaces.ts | 10 | 4 |
| packages/cli/tests/commands/work.test.ts | 8 | 7 |
| packages/cli/tests/commands/work-ci-mocked.test.ts | 6 | 2 |
| packages/cli/tests/commands/proof.test.ts | 5 | 4 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 173 total)

### packages/cli/src/commands/work-proof.ts

- **code:** Backfill migration uses `as string` cast to compare old accept values against narrowed type — *Rename finding action accept to acknowledge*

### packages/cli/src/commands/work.ts

- **code:** Unsupported mergeStrategy classifier matches broad 'not allowed'/'disabled' text and can steal future policy failures from more specific guidance — *Fix work complete merge strategy*
- **code:** Dead conditional — verifyAgent always equals 'ana-verify' on both branches — *Fix Multi-Phase Timestamp Poisoning*

### packages/cli/src/engine/census.ts

- **test:** A019 (FRAMEWORK_HINTS vite count) has no tagged test — FRAMEWORK_HINTS is not exported so cannot be unit-tested directly — *Fix Vite Framework Detection and Service Detection Gaps*

### packages/cli/src/engine/detectors/surfaces.ts

- **code:** Redundant loop in isNonProductFilePath — EXCLUDED_SEGMENTS check and -e2e suffix check iterate the same range in separate loops — *Fix non-product path over-exclusion at deep segments*
- **code:** NON_PRODUCT_GLOB_IGNORE **/build/** collision with legitimate build directories persists — out of scope for this fix, tracked as fix-non-product-code-pollution-C5 — *Fix non-product path over-exclusion at deep segments*
- **code:** isNonProductFilePath suffix loop comment doesn't explain why it can't use last-segment pattern (last segment is filename for file paths, not directory) — *Fix non-product path over-exclusion at deep segments*
- **code:** resolveViteFramework only handles 4 framework deps — Preact, Qwik, and other Vite-based frameworks return null — *Fix Vite Framework Detection and Service Detection Gaps*
- **code:** Inline dep-to-framework map in resolveViteFramework duplicates knowledge from the framework registry — *Fix Vite Framework Detection and Service Detection Gaps*
- **code:** Signal 2 (apps/ directory) does not apply the library guard — a library package under apps/ with vite.config.ts and hasMain would still be detected as surface — *Fix Vite Framework Detection and Service Detection Gaps*
- **test:** No per-surface test for vue+react simultaneous deps in resolveViteFramework (Vue wins by priority, but untested) — *Fix Vite Framework Detection and Service Detection Gaps*
- **code:** NON_PRODUCT_GLOB_IGNORE includes **/build/** which collides with legitimate 'build' directories in some monorepo layouts — *Fix non-product code pollution in findings, hot files, schema counts, and deploy detection*

### packages/cli/src/engine/findings/rules/errorBoundaries.ts

- **code:** Redundant alias: GLOB_IGNORE = NON_PRODUCT_GLOB_IGNORE adds an unnecessary indirection — *Fix non-product code pollution in findings, hot files, schema counts, and deploy detection*

### packages/cli/src/engine/scan-engine.ts

- **code:** Synchronous execSync in async function — documented as acceptable but adds subprocess overhead to every scan — *Fix scan display accuracy — env hygiene false positive and contributor label*
- **test:** A011-A015 (service detection entries) have no tagged tests — verified by source inspection only — *Fix Vite Framework Detection and Service Detection Gaps*

### packages/cli/tests/commands/config.test.ts

- **test:** Diff removes many pre-existing @ana tags and explanatory comments from unrelated tests, weakening future contract traceability — *Fix work complete merge strategy*

### packages/cli/tests/commands/init.test.ts

- **test:** init.test.ts line 866 test description says '5 agent files' but body asserts 12 (6 agents) — *Learn Agent Codex Adaptation*

### packages/cli/tests/commands/run.test.ts

- **test:** A004/A005 test checks test helper output, not real init behavior — *Learn Agent Codex Adaptation*
- **test:** A003 test asserts mock stub content ('# ana-learn prompt') not contract value ('Ana Learn') — *Learn Agent Codex Adaptation*

### packages/cli/tests/commands/scan.test.ts

- **test:** git init without -b main in contributor display test — *Fix scan display accuracy — env hygiene false positive and contributor label*
- **test:** A005 tests singular form only — contract value 'active contributors' (plural) not directly verified because test has 1 contributor — *Fix scan display accuracy — env hygiene false positive and contributor label*
- **test:** Contributor display test gates assertion behind truthy check — if Activity line disappears from output, test silently passes — *Fix scan display accuracy — env hygiene false positive and contributor label*

### packages/cli/tests/commands/work-ci-mocked.test.ts

- **test:** Duplicate @ana tags A001-A006 in work-ci-mocked.test.ts — old getAgentPid/conflict tests and new session tests share tag IDs from different contracts — *Fix Conditional Test No-Ops*
- **test:** createSessionTestProject helper is now triplicated — work.test.ts (removed), work-ci-mocked.test.ts (added), plus createMergedProject as similar pattern — *Fix Conditional Test No-Ops*
- **code:** A002 and A004 are semantically identical tests — both create session file with known timestamp, call startWork, assert saves.work_started_at equals that timestamp — *Fix Conditional Test No-Ops*

### packages/cli/tests/commands/work-merge.test.ts

- **test:** A003 is partly satisfied by source inspection because the tagged JSON success test checks clean output, not the merge argv — *Fix work complete merge strategy*

### packages/cli/tests/commands/work.test.ts

- **test:** A015 edge-case test uses toBeGreaterThanOrEqual(1) — weak assertion on entry count — *Rename finding action accept to acknowledge*

### packages/cli/tests/engine/detectors/surfaces.test.ts

- **test:** @ana tag namespace collision — surfaces.test.ts carries A001-A027 tags from 3+ prior contracts, making per-contract tag lookup ambiguous — *Fix non-product path over-exclusion at deep segments*

### packages/cli/tests/engine/scan-engine-secrets.test.ts

- **test:** git init without -b main in both new test files — CI runners with different init.defaultBranch may fail — *Fix scan display accuracy — env hygiene false positive and contributor label*

### General

- **code:** JSON API shape change: by_action key renamed from accept to acknowledge — breaking for any external consumer — *Rename finding action accept to acknowledge*

