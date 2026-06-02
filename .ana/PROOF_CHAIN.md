# Proof Chain Dashboard

181 runs · 170 active · 5 promoted · 856 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 33 | 35 | 2026-06-02 |
| cli | 124 | 111 | 2026-06-01 |
| website | 24 | 24 | 2026-06-01 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 13 | 8 |
| packages/cli/tests/commands/work.test.ts | 8 | 7 |
| packages/cli/src/commands/run.ts | 7 | 2 |
| packages/cli/tests/commands/work-ci-mocked.test.ts | 6 | 2 |
| packages/cli/tests/commands/proof.test.ts | 5 | 4 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 170 total)

### .claude/agents/ana-learn.md

- **code:** Dogfood .claude/agents/ana-learn.md also received .claude/skills/ -> .ana/skills/ fix, not listed in contract file_changes — *Learn Agent Codex Adaptation*

### packages/cli/src/commands/artifact.ts

- **code:** Phase inference adds a second .saves.json reader instead of sharing the existing metadata read path — *Multi-Phase Report Naming Guard*

### packages/cli/src/commands/work-proof.ts

- **code:** Backfill migration uses `as string` cast to compare old accept values against narrowed type — *Rename finding action accept to acknowledge*

### packages/cli/src/commands/work-state.ts

- **code:** resolvePhase returns null for both 'all phases passed' and 'single-spec' — dual-meaning null forces callers to disambiguate — *Fix Multi-Phase Timestamp Poisoning*

### packages/cli/src/commands/work.ts

- **code:** Unsupported mergeStrategy classifier matches broad 'not allowed'/'disabled' text and can steal future policy failures from more specific guidance — *Fix work complete merge strategy*
- **code:** Dead conditional — verifyAgent always equals 'ana-verify' on both branches — *Fix Multi-Phase Timestamp Poisoning*
- **code:** startBuildPhaseWithKey is an unnecessary wrapper — delegates entirely to startBuildPhase with unused _buildAgentKey param — *Fix Multi-Phase Timestamp Poisoning*
- **code:** getMainTreeResolution re-reads filesystem artifacts via gatherLocalArtifactState even though caller already has hasNumberedSpec/buildReportExists flags — *Fix Multi-Phase Timestamp Poisoning*
- **code:** Inside-worktree resume writes phase-scoped timestamps without concurrency guard check — now phase-aware but still no guard — *Fix Multi-Phase Timestamp Poisoning*

### packages/cli/tests/commands/artifact.test.ts

- **test:** Work-status progression test calls determineStage with constructed state instead of exercising ana work status discovery — *Multi-Phase Report Naming Guard*
- **test:** No-target error test asserts only the headline message, not the exit code or explicit numbered-command guidance — *Multi-Phase Report Naming Guard*

### packages/cli/tests/commands/config.test.ts

- **test:** Diff removes many pre-existing @ana tags and explanatory comments from unrelated tests, weakening future contract traceability — *Fix work complete merge strategy*

### packages/cli/tests/commands/init.test.ts

- **test:** init.test.ts line 866 test description says '5 agent files' but body asserts 12 (6 agents) — *Learn Agent Codex Adaptation*
- **test:** No test for codex-only init path — A011/A012/A013 verified by source inspection only — *Codex Support*

### packages/cli/tests/commands/run.test.ts

- **test:** A004/A005 test checks test helper output, not real init behavior — *Learn Agent Codex Adaptation*
- **test:** A003 test asserts mock stub content ('# ana-learn prompt') not contract value ('Ana Learn') — *Learn Agent Codex Adaptation*

### packages/cli/tests/commands/work-ci-mocked.test.ts

- **test:** Duplicate @ana tags A001-A006 in work-ci-mocked.test.ts — old getAgentPid/conflict tests and new session tests share tag IDs from different contracts — *Fix Conditional Test No-Ops*
- **test:** createSessionTestProject helper is now triplicated — work.test.ts (removed), work-ci-mocked.test.ts (added), plus createMergedProject as similar pattern — *Fix Conditional Test No-Ops*
- **code:** A002 and A004 are semantically identical tests — both create session file with known timestamp, call startWork, assert saves.work_started_at equals that timestamp — *Fix Conditional Test No-Ops*

### packages/cli/tests/commands/work-merge.test.ts

- **test:** A003 is partly satisfied by source inspection because the tagged JSON success test checks clean output, not the merge argv — *Fix work complete merge strategy*

### packages/cli/tests/commands/work.test.ts

- **test:** A015 edge-case test uses toBeGreaterThanOrEqual(1) — weak assertion on entry count — *Rename finding action accept to acknowledge*
- **test:** A023 test only covers worktree startWork path — doesn't actually compare main-tree vs worktree output as the test title claims — *Fix Multi-Phase Timestamp Poisoning*

### packages/cli/tests/e2e/init-flow.test.ts

- **test:** A029 (init-flow.test.ts asserts ana run) lacks @ana tag — verified by source inspection — *Codex Support*

### packages/cli/tests/templates/codex-learn-template.test.ts

- **code:** Extra file not in contract: codex-learn-template.test.ts created for dedicated assertion coverage — *Learn Agent Codex Adaptation*

### website/content/docs/guides/platform-setup.mdx

- **code:** Platform flags guide shows Codex sandbox as platformFlags even though run dispatch already passes sandbox mode — *Docs, Website, and README Multi-Platform Update*

### website/lib/__tests__/docs-platform-content.test.ts

- **test:** ForPlatform pairing test only compares total block counts — *Docs, Website, and README Multi-Platform Update*
- **test:** Generated docs asset assertions read ignored prebuild outputs directly, so focused tests can depend on stale or missing local files — *Docs, Website, and README Multi-Platform Update*
- **test:** ForPlatform pairing test proves count and adjacency but not that paired blocks address the same user need — *Docs, Website, and README Multi-Platform Update*

### website/public/search-index.json

- **test:** Generated search index can still surface stale direct Claude agent command text — *Docs, Website, and README Multi-Platform Update*

### General

- **code:** JSON API shape change: by_action key renamed from accept to acknowledge — breaking for any external consumer — *Rename finding action accept to acknowledge*

