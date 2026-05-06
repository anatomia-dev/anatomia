# Spec: Worktrees V2 — Phase Timing + Danger Map + Prune

**Created by:** AnaPlan
**Date:** 2026-05-06
**Scope:** .ana/plans/active/worktrees-v2-timing-danger-prune/scope.md

## Approach

Three independent improvements to the proof chain's operational surface. All additive — no behavioral changes to existing code paths.

**Danger Map:** In `startBuildPhase`, parse the already-read `contract.yaml` with `yaml.parse()` to extract `file_changes[].path`. Pass those paths to the existing `getProofContext(paths, projectRoot)` (batch call — it reads the chain once). Rank files by severity-weighted finding count (risk=3, debt=2, observation=1). Format as a markdown ranked list and pass as `proofFindings` to `writeWorktreeContext`, which already has the plumbing for a `## Proof Findings` section but has never been populated. Findings only — no build concerns (AC4). When all files have zero active findings, omit the field entirely so no empty section appears (AC2). On YAML parse failure, fall back to the current raw-string behavior (AC3).

**Phase Timing:** `computeTiming` currently computes build/verify durations from artifact-gap timing (contract→build-report, build-report→verify-report). V1 laid the groundwork by writing `build_started_at` and `verify_started_at` to `.saves.json`, but `computeTiming` never reads them. V2 reads these timestamps and uses them when available, with a sanity guard: if `_started_at` is later than the corresponding artifact save, or the computed duration is negative, or duration exceeds 24 hours, fall back to artifact-gap timing. This handles multi-phase cross-contamination automatically. `computePipelineStats` gains `median_plan` collection following the existing pattern. `formatHealthDisplay` adds a `plan` column to the pipeline breakdown. `writeTimestamp` gains an optional agent identity parameter.

**Worktree Prune:** `getWorkStatus` calls `runGit(['worktree', 'prune'])` inside the existing `if (currentBranch)` guard, before `discoverSlugs`. Errors swallowed silently. Five lines.

## Output Mockups

### Risk Profile in worktree-context.md

When files have active findings:
```
## Risk Profile

**src/utils/proofSummary.ts** (risk score: 8) — 3 findings
  - risk: Cache never invalidated — stale if files created between resolveFindingPaths calls
  - debt: Module exceeds 1500 lines — hot module with 11 pipeline touches
  - observation: floorMedian helper could be extracted to shared utils

**src/commands/work.ts** (risk score: 5) — 2 findings
  - risk: Untested defensive branches in startWork
  - debt: guardFailResult JSDoc is copy-paste from writeProofChain
```

When no files have active findings: the `proofFindings` field is omitted entirely. No `## Proof Findings` section appears.

### Health display with plan column

```
  Pipeline
  ──────────
  Median:  70m (scope 10m · plan 8m · build 32m · verify 14m)
```

When `median_plan` is null (insufficient data): omitted from breakdown, same as other phases.

### Agent identity in .saves.json

```json
{
  "work_started_at": "2026-05-06T10:00:00Z",
  "work_agent": "ana",
  "plan_started_at": "2026-05-06T10:05:00Z",
  "plan_agent": "ana-plan",
  "build_started_at": "2026-05-06T10:35:00Z",
  "build_agent": "ana-build"
}
```

## File Changes

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** Three touch points. (1) `startBuildPhase` gains YAML parsing of the contract, calls `getProofContext` with extracted file paths, formats a risk profile, and passes it as `proofFindings` to the worktree context data. (2) `writeTimestamp` gains an optional third parameter for agent identity, writing `{phase}_agent` alongside the timestamp. (3) All `writeTimestamp` call sites pass their agent string. (4) `getWorkStatus` gains a `runGit(['worktree', 'prune'])` call before `discoverSlugs`.
**Pattern to follow:** The existing contract read at line 1559-1562 is the insertion point for YAML parsing. `writeTimestamp` at line 1634 for the agent identity extension.
**Why:** Without (1), Build enters the worktree blind to file history. Without (2), timing measures idle time not work time. Without (3), agent identity is lost. Without (4), stale worktree records accumulate.

### `packages/cli/src/utils/proofSummary.ts` (modify)
**What changes:** `computeTiming` reads `build_started_at` and `verify_started_at` from saves data and uses them for build/verify duration when they pass sanity checks. `computePipelineStats` collects `timing.plan` values and computes `median_plan`.
**Pattern to follow:** The existing `workStartedAt` read pattern at line 1483-1486 for reading raw ISO timestamps. The existing `scopes`/`builds`/`verifies` collection at lines 966-968 for `plans`.
**Why:** Without this, timing measures artifact-save gaps (includes idle time). Pipeline stats omit the plan phase entirely.

### `packages/cli/src/commands/proof.ts` (modify)
**What changes:** `formatHealthDisplay` adds `plan` to the pipeline phase breakdown, following the conditional push pattern at lines 446-448.
**Pattern to follow:** The existing `if (report.pipeline.median_scope !== null) parts.push(...)` pattern.
**Why:** Plan phase exists in the data but isn't displayed.

### `packages/cli/src/types/proof.ts` (modify)
**What changes:** `PipelineStats` gains `median_plan: number | null`.
**Pattern to follow:** The existing `median_scope`, `median_build`, `median_verify` fields at lines 177-179.
**Why:** Type must match the new field computed in `computePipelineStats`.

### `packages/cli/tests/commands/work.test.ts` (modify)
**What changes:** New test block for danger map integration — verifying `startBuildPhase` behavior when contract has `file_changes` and proof chain has findings for those files. Tests for worktree prune call in `getWorkStatus`. Tests for agent identity in `writeTimestamp`.
**Pattern to follow:** The existing worktree creation test pattern at line 216 (creates a test project, calls `createWorktree`, checks `worktree-context.md` content).
**Why:** New behavior requires new tests.

### `packages/cli/tests/utils/proofSummary.test.ts` (modify)
**What changes:** New tests for `computeTiming` with `_started_at` timestamps — happy path, sanity guard fallbacks (negative duration, >24h, start-after-save), backward compat when timestamps absent. New tests for `median_plan` in `computePipelineStats`.
**Pattern to follow:** The existing `computeTiming with work_started_at` describe block starting at line 501.
**Why:** Timing logic has edge cases that must be tested.

### `packages/cli/tests/commands/proof.test.ts` (modify)
**What changes:** Existing pipeline display test (line 2699) updated to verify `plan` appears in the breakdown. New test confirming `plan` is omitted when `median_plan` is null.
**Pattern to follow:** The existing test at line 2699 that checks for scope/build/verify in pipeline output.
**Why:** Display change must be verified.

## Acceptance Criteria

- [ ] AC1: When `startBuildPhase` creates a worktree and `contract.yaml` exists with `file_changes`, the resulting `worktree-context.md` contains a `## Risk Profile` section with files ranked by severity-weighted finding count (risk=3, debt=2, observation=1)
- [ ] AC2: When `file_changes` files have zero active findings in the proof chain, the `## Risk Profile` section is omitted entirely — no empty sections
- [ ] AC3: When `contract.yaml` is missing or unparseable, `startBuildPhase` falls back to current behavior (raw string pass-through, no danger map) with no error
- [ ] AC4: Risk profile includes findings only — not build concerns
- [ ] AC5: `computeTiming` reads `build_started_at` and `verify_started_at` from `.saves.json` and uses them for build/verify phase durations when available
- [ ] AC6: `computeTiming` falls back to artifact-gap timing when `_started_at` timestamps are absent (backward compat for pre-V2 entries)
- [ ] AC7: `computeTiming` falls back to artifact-gap timing when a sanity check fails: `_started_at` is later than the corresponding artifact save, or computed duration is negative, or duration exceeds 24 hours
- [ ] AC8: `computePipelineStats` computes `median_plan` from `timing.plan` values across entries
- [ ] AC9: `formatHealthDisplay` shows 4 phases: `scope Xm · plan Xm · build Xm · verify Xm`
- [ ] AC10: `writeTimestamp` accepts an optional agent identity string and writes `{phase}_agent` alongside `{phase}_started_at` in `.saves.json` (e.g., `build_agent: "ana-build"`)
- [ ] AC11: Agent identity is hardcoded at each call site: `work_started_at` → `ana`, `plan_started_at` → `ana-plan`, `build_started_at` → `ana-build`, `verify_started_at` → `ana-verify`
- [ ] AC12: `getWorkStatus` calls `runGit(['worktree', 'prune'])` before `discoverSlugs`, inside the existing `if (currentBranch)` guard, swallowing errors silently
- [ ] AC13: `PipelineStats` type gains `median_plan: number | null`
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors

## Testing Strategy

- **Unit tests (proofSummary.test.ts):**
  - `computeTiming` with `build_started_at`/`verify_started_at` — uses actual timestamps, verifies duration is computed from `_started_at` to artifact save instead of gap timing
  - `computeTiming` sanity guard — `_started_at` later than artifact save falls back to gap timing
  - `computeTiming` sanity guard — negative duration falls back
  - `computeTiming` sanity guard — >24h duration falls back
  - `computeTiming` backward compat — no `_started_at` keys, same behavior as V1
  - `computePipelineStats` — entries with `timing.plan` produce `median_plan`
  - `computePipelineStats` — entries without `timing.plan` produce `median_plan: null`

- **Integration tests (work.test.ts):**
  - `startBuildPhase` with contract containing `file_changes` and proof chain with findings → `worktree-context.md` contains `## Risk Profile` with ranked files
  - `startBuildPhase` with contract containing `file_changes` but no proof findings → no `## Risk Profile` section
  - `startBuildPhase` with malformed YAML contract → falls back to raw string, no error
  - `startBuildPhase` with no contract → current behavior unchanged
  - `writeTimestamp` with agent parameter → saves contains both timestamp and agent key
  - `getWorkStatus` prune call — verify `git worktree prune` is called (or verify stale worktree records are cleaned)

- **Display tests (proof.test.ts):**
  - Pipeline breakdown includes `plan` when `median_plan` is present
  - Pipeline breakdown omits `plan` when `median_plan` is null

- **Edge cases:**
  - `file_changes` with paths that don't exist in proof chain → those files don't appear in risk profile
  - All `file_changes` files have zero findings → risk profile omitted entirely (not empty section)
  - Mixed findings: some files have findings, some don't → only files with findings appear
  - Findings without severity → weighted as 0 (no contribution to score, but finding still listed)

## Dependencies

- `yaml` package (already a dependency, used in `proofSummary.ts` and `artifact.ts`)
- `getProofContext` exported from `proofSummary.ts` (already exported)
- `runGit` available in `work.ts` (already imported)

## Constraints

- `proofSummary.ts` is ~1950 lines and a known hot module. Changes must be minimal — modify existing functions, don't add new ones.
- `work.ts` uses `process.exit(1)` in validation paths. New code must return errors, not exit.
- Backward compatibility: old `.saves.json` entries without `_started_at` timestamps must produce identical timing to V1.
- The `proofFindings` field passed to `writeWorktreeContext` must be a string (pre-formatted markdown). No type changes to the data parameter.

## Gotchas

- `writeTimestamp` is called twice for `build_started_at` — once in `startBuildPhase` (line 1550) for new builds, once in the FAIL→Fix path (line 1519). Both must pass the agent identity `"ana-build"`.
- `computeTiming` has two fallback paths already (with/without `work_started_at`). The `_started_at` read logic must work correctly in both branches — build and verify durations are independent of the think/plan split.
- The `yaml` import must be added to `work.ts`. Follow the existing pattern from `proofSummary.ts`: `import * as yaml from 'yaml';`.
- `getProofContext` must be imported in `work.ts` from `'../utils/proofSummary.js'`. Verify the `.js` extension.
- `formatHealthDisplay` pushes parts conditionally. The `plan` entry must be inserted between `scope` and `build` to maintain chronological order: `scope Xm · plan Xm · build Xm · verify Xm`.
- `computePipelineStats` collects `timing.plan` values. Old entries have `timing.plan === timing.think` (backward compat at line 1507). This is correct — plan duration for old entries is the think→contract gap, which is what `timing.plan` stores.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { getProofContext } from '../utils/proofSummary.js'`
- Use `import * as yaml from 'yaml'` (matches existing pattern in `proofSummary.ts` and `artifact.ts`)
- Use `import type` for type-only imports, separate from value imports
- Prefer early returns over nested conditionals
- Explicit return types on exported functions; internal helpers can use inference
- Exported functions require `@param` and `@returns` JSDoc tags
- Use `| null` for checked-and-empty fields. `PipelineStats.median_plan: number | null`
- Always use `--run` flag with `pnpm vitest` to avoid watch mode hang

### Pattern Extracts

**computePipelineStats collection pattern** (proofSummary.ts:965-968):
```typescript
  const totals = validEntries.map(e => e.timing!.total_minutes!);
  const scopes = validEntries.map(e => e.timing!.think ?? e.timing!.scope ?? null).filter((v): v is number => v !== null);
  const builds = validEntries.map(e => e.timing!.build ?? null).filter((v): v is number => v !== null);
  const verifies = validEntries.map(e => e.timing!.verify ?? null).filter((v): v is number => v !== null);
```

**computePipelineStats return pattern** (proofSummary.ts:970-976):
```typescript
  return {
    median_total: floorMedian(totals),
    median_scope: scopes.length > 0 ? floorMedian(scopes) : null,
    median_build: builds.length > 0 ? floorMedian(builds) : null,
    median_verify: verifies.length > 0 ? floorMedian(verifies) : null,
    entries_with_timing: validEntries.length,
  };
```

**formatHealthDisplay conditional push pattern** (proof.ts:445-449):
```typescript
    const parts: string[] = [];
    if (report.pipeline.median_scope !== null) parts.push(`scope ${report.pipeline.median_scope}m`);
    if (report.pipeline.median_build !== null) parts.push(`build ${report.pipeline.median_build}m`);
    if (report.pipeline.median_verify !== null) parts.push(`verify ${report.pipeline.median_verify}m`);
    const breakdown = parts.length > 0 ? ` (${parts.join(' \u00b7 ')})` : '';
```

**writeTimestamp current pattern** (work.ts:1634-1646):
```typescript
async function writeTimestamp(activePath: string, key: string): Promise<void> {
  const savesPath = path.join(activePath, '.saves.json');
  let saves: Record<string, unknown> = {};
  if (fs.existsSync(savesPath)) {
    try {
      saves = JSON.parse(fs.readFileSync(savesPath, 'utf-8'));
    } catch {
      // Start fresh if corrupted
    }
  }
  saves[key] = new Date().toISOString();
  await fsPromises.writeFile(savesPath, JSON.stringify(saves, null, 2), 'utf-8');
}
```

**workStartedAt raw ISO read pattern** (proofSummary.ts:1483-1486):
```typescript
  const workStartedAtRaw = saves['work_started_at'];
  const workStartedAt = typeof workStartedAtRaw === 'string'
    ? new Date(workStartedAtRaw).getTime()
    : null;
```

**writeWorktreeContext proofFindings plumbing** (worktree.ts:480-482):
```typescript
  if (data?.proofFindings) {
    sections.push('## Proof Findings', '', data.proofFindings, '');
  }
```

**startBuildPhase contract read** (work.ts:1557-1563):
```typescript
  let contextData: { contractAssertions?: string; proofFindings?: string; summary?: string } | undefined;
  const contractPath = path.join(activePath, 'contract.yaml');
  if (fs.existsSync(contractPath)) {
    const contractContent = fs.readFileSync(contractPath, 'utf-8');
    contextData = { contractAssertions: contractContent };
  }
```

**Existing computeTiming test pattern** (proofSummary.test.ts:501-538):
```typescript
describe('computeTiming with work_started_at', () => {
  let tempDir: string;
  let slugDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'timing-test-'));
    slugDir = path.join(tempDir, 'test-timing');
    await fs.promises.mkdir(slugDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('computes think from work_started_at and plan differs from think', async () => {
    const saves = {
      work_started_at: '2026-04-01T09:40:00Z',
      scope: { saved_at: '2026-04-01T10:00:00Z' },
      contract: { saved_at: '2026-04-01T10:30:00Z' },
      'build-report': { saved_at: '2026-04-01T11:30:00Z' },
      'verify-report': { saved_at: '2026-04-01T12:00:00Z' },
    };
    await fs.promises.writeFile(path.join(slugDir, '.saves.json'), JSON.stringify(saves));

    const summary = generateProofSummary(slugDir);

    expect(summary.timing.think).toBe(20);
    expect(summary.timing.plan).toBe(30);
    expect(summary.timing.build).toBe(60);
    expect(summary.timing.verify).toBe(30);
  });
});
```

### Proof Context

**work.ts** — 7 pipeline touches. Key findings:
- [code] Untested defensive branches in startWork — no dedicated unit tests for 'not a git repo' and 'git pull conflict' paths
- [test] Phase detection logic has no dedicated tagged tests
- Build concern: `process.exit(1)` in startWork prevents unit testing phase detection

**proofSummary.ts** — 11 pipeline touches. Key finding:
- [code] Cache never invalidated — stale if files created between resolveFindingPaths calls

**proof.ts, worktree.ts, proof.ts types** — No active findings directly relevant to this build.

### Checkpoint Commands

- After `PipelineStats` type change: `(cd packages/cli && pnpm vitest run --reporter=verbose -t "pipeline" --run)` — Expected: existing pipeline tests pass
- After `computeTiming` changes: `(cd packages/cli && pnpm vitest run --reporter=verbose -t "computeTiming" --run)` — Expected: existing + new timing tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: all tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 1913 passed, 2 skipped (95 test files)
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~1930+ tests (timing tests ~8 new, danger map tests ~5 new, display tests ~2 new, prune/agent tests ~3 new)
- Regression focus: `proofSummary.test.ts` (timing tests), `proof.test.ts` (health display tests), `work.test.ts` (worktree tests)
