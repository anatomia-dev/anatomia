# Spec: Unified Staleness Awareness

**Created by:** AnaPlan
**Date:** 2026-05-16
**Scope:** .ana/plans/active/unified-staleness-awareness/scope.md

## Approach

Create `scan-freshness.ts` following the exact structure of `update-check.ts`: exported interface for the result, a single async exported function that computes staleness, silent-on-failure semantics. The function accepts `lastScanAt` (string from ana.json) and `projectRoot` (for scan.json read and git operations). It reads `git.head` from scan.json, runs `git rev-list --count {sha}..HEAD` via `runGit`, and applies the combined threshold (>7 days AND >50 commits).

The function returns `null` in three cases: CI environment, missing/unparseable `lastScanAt`, or any internal error. When `git rev-list` fails (exit code 128 from shallow clones or force-pushed repos), the function falls back to time-only evaluation (>7 days alone triggers staleness, `commitsSinceScan` is `null`).

Integration into `work status`: rename `printVersionNotifications` → `printNotifications`, add scan staleness line after existing notifications. Add `scanStale` field to `StatusOutput` interface and both output paths (the normal assembly at line 845 and the JSON early-return at line 794).

`setup check`: add a Freshness section after Consistency using the same `readAnaJson`/`readScanJson` calls already present.

Template change: one sentence added to both `packages/cli/templates/.claude/agents/ana.md` and `.claude/agents/ana.md` after the `work status --session` paragraph.

## Output Mockups

### work status — stale scan (full info)
```
ℹ Scan is 12 days old (73 commits since scan). Run: ana init
```

### work status — stale scan (time-only fallback)
```
ℹ Scan is 12 days old. Run: ana init
```

### work status — JSON output (scanStale field)
```json
{
  "artifactBranch": "main",
  "currentBranch": "main",
  "onArtifactBranch": true,
  "updateAvailable": null,
  "projectMismatch": null,
  "scanStale": {
    "isStale": true,
    "daysSinceScan": 12,
    "commitsSinceScan": 73
  },
  "items": []
}
```

### work status — scan is current (JSON)
```json
{
  "scanStale": null,
  ...
}
```

### setup check — Freshness section (stale)
```
Freshness
─────────
  ⚠ Scan age: 12 days old (73 commits since scan)
```

### setup check — Freshness section (current)
```
Freshness
─────────
  ✓ Scan age: current
```

## File Changes

### `packages/cli/src/utils/scan-freshness.ts` (create)
**What changes:** New utility module. Exports `ScanFreshnessResult` interface and `checkScanFreshness` function.
**Pattern to follow:** `packages/cli/src/utils/update-check.ts` — same structure (exported interface, single exported async function, silent failure, CI suppression).
**Why:** Separates git-dependent staleness logic from the pure filesystem/network logic in update-check.ts. Becomes the home for future staleness checks.

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** (1) Add `scanStale` field to `StatusOutput` interface. (2) Rename `printVersionNotifications` → `printNotifications`. (3) Add scan staleness notification line inside the renamed function. (4) Add `scanStale` to both the normal output assembly and the JSON early-return path. (5) Call `checkScanFreshness` alongside `checkForUpdates`.
**Pattern to follow:** Existing `updateAvailable`/`projectMismatch` fields — same nullable pattern, same conditional rendering.
**Why:** `work status` is where all agents look for project health signals. This is the correct integration point.

### `packages/cli/src/commands/check.ts` (modify)
**What changes:** Add a Freshness section after the Consistency section. Reads `lastScanAt` from the already-loaded `anaJson`, reads `git.head` from already-loaded `scanJson`, calls `checkScanFreshness`.
**Pattern to follow:** The Consistency section immediately above (line 1420-1432) — same structure: `chalk.bold` header, separator line, `${symbol} ${label}: ${detail}` format.
**Why:** The setup check dashboard shows project health at a glance. Freshness belongs there.

### `packages/cli/templates/.claude/agents/ana.md` (modify)
**What changes:** Add one sentence after the `work status --session` paragraph in Step 0: "If the output includes ℹ notification lines (updates, staleness, version mismatches), include them in your first message verbatim."
**Pattern to follow:** The existing instruction style in that section — imperative, no justification.
**Why:** Fixes the buried notification problem. Without this, agents may see notifications but not relay them.

### `.claude/agents/ana.md` (modify)
**What changes:** Identical sentence added at the identical location.
**Pattern to follow:** Must be byte-identical to the template change for the modified paragraph.
**Why:** Dogfood installation must match product template for the affected section.

## Acceptance Criteria

- [ ] AC1: `ana work status` displays `ℹ Scan is {N} days old ({M} commits since scan). Run: ana init` when scan is >7 days old AND >50 commits behind HEAD
- [ ] AC2: When git SHA from scan.json is unresolvable, notification falls back to time-only: `ℹ Scan is {N} days old. Run: ana init`
- [ ] AC3: Scan staleness notification is suppressed when `CI=true`
- [ ] AC4: `ana setup check` displays a Freshness section showing scan age or "current" status
- [ ] AC5: Ana agent template (both product and dogfood) includes the relay instruction after the `work status --session` paragraph
- [ ] AC6: Product template and dogfood template contain identical content for the modified section
- [ ] AC7: `printVersionNotifications` is renamed to `printNotifications` with no behavior change to existing notifications
- [ ] AC8: The `scanStale` field appears in both human-readable and JSON output paths of `work status`
- [ ] AC9: `checkScanFreshness` returns `null` when `lastScanAt` is missing or unparseable
- [ ] AC10: No new ana.json fields, no new CLI commands, no schema changes
- [ ] Tests pass with `pnpm vitest run`
- [ ] No lint errors

## Testing Strategy

- **Unit tests:** `tests/utils/scan-freshness.test.ts` — test the `checkScanFreshness` function in isolation. Mock `runGit` for git operations. Use temp directories for scan.json reads. Cover: stale (both thresholds met), not stale (time ok), not stale (commits ok), time-only fallback (git fails), null on missing lastScanAt, null on CI, null on unparseable date.
- **Integration coverage:** The work.ts and check.ts changes are tested through existing command test patterns — mock the freshness result and verify output contains the notification line / section.
- **Edge cases:** Empty string lastScanAt, invalid date string, scan.json missing git.head field, scan.json missing entirely, git rev-list returning exit code 128.

## Dependencies

- `runGit` from `src/utils/git-operations.ts` (already exported)
- `scan.json` must contain `git.head` field (it does — verified in our scan.json)

## Constraints

- No new ana.json fields (AC10)
- CI suppression must use `process.env['CI'] === 'true'` string comparison (not truthy)
- Template wording must be exact — conditional "If the output includes..." handles zero-notification case
- `scan-freshness.ts` is a utils file — no chalk, no commander imports (those belong in commands)

## Gotchas

- **Two output paths in work.ts:** The JSON early-return at line 794 constructs a raw object that bypasses `StatusOutput`. The `scanStale` field must be added to BOTH this manual object AND the `StatusOutput` assembly at line 845. Missing either means AC8 fails.
- **`readArtifactBranch` reads ana.json but doesn't expose `lastScanAt`.** Don't re-read ana.json. Instead, read ana.json once in the status function (it's already read by `readArtifactBranch` internally, but there's no exported access). Read it fresh with `fs.readFileSync` alongside the existing `checkForUpdates` call, extract `lastScanAt`, pass to `checkScanFreshness`.
- **`runGit` is synchronous.** The freshness function can be sync or async — but since `checkForUpdates` is async and they're called together, making `checkScanFreshness` sync is fine (runGit uses spawnSync).
- **Template byte-identity:** Copy-paste the exact modified paragraph between product template and dogfood template. Don't retype.
- **The notification function is called from THREE places** (lines 647, 726, 804). The rename must update all call sites.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins
- Use `import type` for type-only imports, separate from value imports
- Named exports only, no defaults
- Explicit return types on exported functions with `@param` and `@returns` JSDoc
- Early returns over nested conditionals
- Utils files have zero CLI dependencies (no chalk in scan-freshness.ts)
- `| null` for checked-and-empty fields (the return type is `ScanFreshnessResult | null`)
- Temp directory pattern with `fs.mkdtemp` in tests
- Always use `--run` flag with `pnpm vitest` to avoid watch mode hang

### Pattern Extracts

**update-check.ts structure (lines 28-32, 182-227) — follow this shape:**
```typescript
/** Shape returned by checkForUpdates */
export interface UpdateCheckResult {
  updateAvailable: { current: string; latest: string } | null;
  projectMismatch: { cliVersion: string; projectVersion: string } | null;
}

export async function checkForUpdates(projectRoot: string): Promise<UpdateCheckResult> {
  const result: UpdateCheckResult = {
    updateAvailable: null,
    projectMismatch: null,
  };

  try {
    const currentVersion = await getCliVersion();

    // npm update check
    if (process.env['CI'] !== 'true') {
      // ...logic...
    }

    // Project version mismatch check
    // ...logic...
  } catch {
    // Silent on any error — best-effort
  }

  return result;
}
```

**printVersionNotifications (work.ts lines 620-631) — extend this pattern:**
```typescript
function printVersionNotifications(output: StatusOutput): void {
  if (output.updateAvailable) {
    console.log(chalk.gray(
      `ℹ anatomia-cli v${output.updateAvailable.latest} available (current: v${output.updateAvailable.current}). Run: npm update -g anatomia-cli`
    ));
  }
  if (output.projectMismatch) {
    console.log(chalk.gray(
      `ℹ Project initialized with v${output.projectMismatch.projectVersion} (current CLI: v${output.projectMismatch.cliVersion}). Run: ana init`
    ));
  }
}
```

**check.ts Consistency section (lines 1420-1432) — follow this structure:**
```typescript
  // --- Consistency ---
  const anaJson = await readAnaJson(cwd);
  if (anaJson) {
    const scanJson = await readScanJson(cwd);
    const consistencyResults = await checkConsistency(cwd, anaJson, scanJson);

    console.log(chalk.bold('\nConsistency'));
    console.log('───────────');
    for (const r of consistencyResults) {
      console.log(`  ${r.symbol} ${r.label}: ${r.detail}`);
      if (r.symbol.includes('✗')) hasErrors = true;
    }
  }
```

**runGit usage (git-operations.ts lines 37-49):**
```typescript
export function runGit(args: string[], options?: { cwd?: string }): RunGitResult {
  const result = spawnSync('git', args, {
    cwd: options?.cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  return {
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    exitCode: result.status ?? 1,
  };
}
```

### Proof Context

No active proof findings for affected files.

### Checkpoint Commands

- After `scan-freshness.ts` created with tests: `(cd packages/cli && pnpm vitest run tests/utils/scan-freshness.test.ts --run)` — Expected: all new tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2351+ tests pass (existing 2351 + new)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2351 passed, 2 skipped (2353 total)
- Current test files: 105
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2365+ tests in 106+ files (new scan-freshness.test.ts + additions to work/check tests)
- Regression focus: `tests/commands/work.test.ts` (rename may break existing notification tests), `tests/commands/check.test.ts` (new section)
