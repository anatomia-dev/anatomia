# Spec: Version Awareness Notifications

**Created by:** AnaPlan
**Date:** 2026-05-10
**Scope:** .ana/plans/active/version-awareness/scope.md

## Approach

Add a self-contained `update-check.ts` utility module that provides two version checks — npm registry lookup (cached, background spawn) and local ana.json comparison (instant, no network). Both feed into `StatusOutput` as new fields and render in `printHumanReadable`.

The key structural change is making `getWorkStatus` async so it can call the existing `getCliVersion()`. This has a mechanical blast radius on 21 existing test call sites in work.test.ts — the `captureOutput` helper must become async-capable. Handle this conversion first before adding any new code.

The npm check uses a detached child process that writes to `.ana/state/cache/update-check.json`. The parent never waits for it. On the next `work status` call, the cache is read synchronously. First run after install shows nothing — the background process writes the cache for next time.

**Structural analog:** The "behind remote" notification in `getWorkStatus` (work.ts lines 656-669). Same shape: best-effort check, conditional informational line, silent on failure.

**Functional analog:** The `readArtifactBranch` pattern for reading ana.json — but the version check must NOT call `process.exit(1)` on failure like `readArtifactBranch` does. Use a separate, graceful read.

## Output Mockups

### Update available (human-readable)

```
Pipeline Status (artifact branch: main)

ℹ anatomia-cli v1.2.0 available (current: v1.1.0). Run: npm update -g anatomia-cli
ℹ Project initialized with v1.0.0 (current CLI: v1.1.0). Run: ana init

  some-feature (1 phase):
    scope.md         ✓ main
    ...

Scope new work: claude --agent ana
```

### Update available (no active work)

```
ℹ anatomia-cli v1.2.0 available (current: v1.1.0). Run: npm update -g anatomia-cli

No active work. Run: claude --agent ana to scope new work.
```

### Versions current — no notification lines appear

### JSON output

```json
{
  "artifactBranch": "main",
  "currentBranch": "main",
  "onArtifactBranch": true,
  "updateAvailable": {
    "current": "1.1.0",
    "latest": "1.2.0"
  },
  "projectMismatch": {
    "cliVersion": "1.1.0",
    "projectVersion": "1.0.0"
  },
  "items": []
}
```

When versions are current, both fields are `null`:

```json
{
  "updateAvailable": null,
  "projectMismatch": null
}
```

## File Changes

### packages/cli/src/utils/update-check.ts (create)

**What changes:** New utility module with five exports:
1. `isNewerVersion(current, latest)` — pure semver comparison, no dependencies. Splits on `.`, compares numeric segments left-to-right.
2. `readUpdateCache(projectRoot)` — sync read of `.ana/state/cache/update-check.json`. Returns `{ version, timestamp }` or `null`. Silent on any error.
3. `spawnUpdateCheck(projectRoot, packageName)` — spawns detached child process that fetches `https://registry.npmjs.org/{package}/latest`, writes cache, exits. Parent does not wait. Skipped when `CI=true`.
4. `getProjectAnaVersion(projectRoot)` — sync read of `.ana/ana.json`, returns `anaVersion` field. Returns `null` on any error (missing file, parse failure, missing field). Returns `"unknown"` when the value is `"0.0.0"`.
5. `checkForUpdates(projectRoot)` — async orchestrator. Calls `getCliVersion()`, reads cache, spawns background check if cache is stale/missing and not CI, returns `{ updateAvailable, projectMismatch }` with resolved values or nulls.

**Pattern to follow:** Error handling follows the git fetch pattern in work.ts (lines 656-669) — best-effort, silent on failure. File reading follows `readArtifactBranch` in git-operations.ts but without `process.exit(1)`.

**Why:** Keeps version logic isolated from the work command. Testable without git repos or network.

### packages/cli/tests/utils/update-check.test.ts (create)

**What changes:** Tests for the utility module. Organized in describe blocks per function:
- `isNewerVersion` — pure function tests: equal versions, newer available, older on npm, multi-digit segments (1.10.0 > 1.2.0), pre-release versions, malformed input.
- `readUpdateCache` — fixture-based: valid cache, expired cache (>24h), missing file, corrupt JSON.
- `getProjectAnaVersion` — fixture-based: normal version, missing field, `"0.0.0"` value, missing ana.json.
- `spawnUpdateCheck` — mock `child_process.spawn` to verify it's called with correct args, `detached: true`, `windowsHide: true`, and that `unref()` is called. Verify CI skip via `process.env.CI`.
- `checkForUpdates` — integration of the above. Mock `getCliVersion` and cache reads. Verify return shape.

**Pattern to follow:** Test structure matches `git-operations.test.ts` — temp directories with fixtures, `beforeEach`/`afterEach` cleanup, `fs.mkdtemp` for isolation.

**Why:** The utility is the core logic. These tests verify the contract assertions directly.

### packages/cli/src/commands/work.ts (modify)

**What changes:**
1. `StatusOutput` interface gains two fields: `updateAvailable: { current: string; latest: string } | null` and `projectMismatch: { cliVersion: string; projectVersion: string } | null`.
2. `getWorkStatus` signature changes from `function getWorkStatus(options)` to `async function getWorkStatus(options)` with return type `Promise<void>`.
3. At the top of `getWorkStatus`, after `readArtifactBranch`/`getCurrentBranch`: call `checkForUpdates(projectRoot)` to get version info. Add the results to the `StatusOutput` object.
4. In `printHumanReadable`: render notification lines after the "behind remote" check and before items. Use `chalk.yellow` with `ℹ` prefix matching the "behind remote" style. Notification text: `ℹ anatomia-cli v{latest} available (current: v{current}). Run: npm update -g anatomia-cli` and `ℹ Project initialized with v{projectVersion} (current CLI: v{cliVersion}). Run: ana init`.
5. In the `printHumanReadable` empty-items early return (line 564): render notifications before the "No active work" line and return.
6. In the zero-slugs early return in `getWorkStatus` (line 682): include `updateAvailable` and `projectMismatch` in the JSON output, and for human-readable, render notifications before the "No active work" message.
7. Action handler (line 2069): add `async` and `await`.

**Pattern to follow:** The "behind remote" notification (lines 663-667) for style. The existing async action handlers (`startWork`, `completeWork`) for the async pattern.

**Why:** This is the only consumer. Version checks must render before both early returns — a user with no active work is exactly when they should see "update available."

### packages/cli/tests/commands/work.test.ts (modify)

**What changes:**
1. `captureOutput` helper changes to accept `() => void | Promise<void>` and return `Promise<string>`. All 21 existing call sites become `await captureOutput(async () => await getWorkStatus(...))`. This is a mechanical conversion — the existing behavior is preserved.
2. Add a new `describe('version notifications')` block with tests for: update available renders notification, project mismatch renders notification, both suppressed when current, notification renders with no active work items, JSON output includes fields, CI skips update check.
3. Mock strategy: mock the `update-check.ts` module (`vi.mock`) to control `checkForUpdates` return values without network or cache dependencies.

**Pattern to follow:** Existing test structure in work.test.ts — `createWorkTestProject` helper, `captureOutput` helper, `expect(output).toContain()` assertions.

**Why:** Validates notifications appear in the right places, including the two early-return paths.

## Acceptance Criteria

- [ ] AC1: `work status` shows "v{X} available" when npm has a newer version (cached, non-blocking)
- [ ] AC2: `work status` shows "Project initialized with v{X}" when `ana.json` `anaVersion` differs from CLI version
- [ ] AC3: Both notifications are suppressed when versions are current
- [ ] AC4: Network failure (npm unreachable, timeout >3s) is silent — no error, no notification, no delay
- [ ] AC5: Cache persists for 24 hours — repeated `work status` calls don't re-fetch or re-spawn
- [ ] AC6: CI environments (`CI=true`) skip the npm update check entirely (no spawn, no cache read)
- [ ] AC7: `work status --json` includes `updateAvailable` and `projectMismatch` fields (null when current)
- [ ] AC8: First run after install shows no update notification (cache doesn't exist yet — background process writes it for next run)
- [ ] AC9: Notification text includes the exact command to run (`npm update -g anatomia-cli` or `ana init`)
- [ ] AC10: `anaVersion` missing or `"0.0.0"` in `ana.json` (old projects) shows mismatch notification with "unknown" as project version
- [ ] AC11: Semver comparison handles multi-digit versions correctly (`1.10.0 > 1.2.0`)
- [ ] AC12: Background check process exits independently — parent `work status` does not wait for it
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`
- [ ] All 21 existing `getWorkStatus` test calls work after async conversion — no regressions

## Testing Strategy

- **Unit tests (update-check.test.ts):** Test each exported function in isolation. `isNewerVersion` is pure — no mocks needed. `readUpdateCache` and `getProjectAnaVersion` use temp directory fixtures. `spawnUpdateCheck` mocks `child_process.spawn` to verify args and `unref()`. `checkForUpdates` mocks `getCliVersion` and the cache.
- **Integration tests (work.test.ts):** Mock the `update-check` module at the module level. Test that notifications appear in human-readable output, appear with no active work, appear in JSON output, and are suppressed when versions match.
- **Edge cases to test:**
  - Multi-digit semver: `1.10.0 > 1.2.0`
  - `anaVersion` missing from ana.json → returns `"unknown"`
  - `anaVersion` is `"0.0.0"` → returns `"unknown"`
  - Cache file missing → returns null, triggers background spawn
  - Cache file corrupt JSON → returns null gracefully
  - Cache expired (>24h) → triggers re-spawn
  - `CI=true` → no spawn call
  - Equal versions → no notification

## Dependencies

- `getCliVersion()` from `commands/init/state.ts` — already exists and is async.
- `node:child_process` `spawn` — new import to the codebase (only `spawnSync` via `runGit` is used currently).
- `node:https` — used inside the spawned child process script (inline), not imported into the module itself.

## Constraints

- No new npm dependencies. The npm registry check uses `node:https` directly.
- Background spawn must not delay `work status` — parent calls `child.unref()` and continues.
- 3-second timeout on the npm fetch inside the child process.
- Cache TTL is 24 hours (86400000ms).
- Notification phrasing must be passive ("available", "initialized with") — agents run `work status` at startup and must not interpret notifications as commands to execute.

## Gotchas

- **The captureOutput blast radius.** The helper is sync: `function captureOutput(fn: () => void): string`. Making `getWorkStatus` async means the helper must become async-capable. Update the helper FIRST, then convert all 21 call sites to `await`, then verify existing tests still pass BEFORE adding any new code. If this step is skipped, every existing test silently stops asserting (the promise resolves after `console.log` is restored).
- **Two early returns need notifications.** `printHumanReadable` returns early at line 564 when `items.length === 0`. `getWorkStatus` returns early at line 682 when `slugs.length === 0`. Both paths must render version notifications. The zero-slugs path doesn't call `printHumanReadable` at all for the human-readable case — it has its own inline `console.log`. Notifications must be added to both paths independently.
- **`JSON.stringify(cacheFile)` in spawn script.** The child process runs an inline Node.js script via `spawn('node', ['-e', script])`. The script interpolates the cache file path. Use `JSON.stringify(cacheFile)` to produce a safely-escaped string literal — not `'${cacheFile}'`. This prevents injection via paths containing quotes or backslashes. Same class as ANA-SEC-001.
- **`windowsHide: true` on spawn.** Without this option, Windows users see a console window flash when the background process starts.
- **`child.unref()` is required.** Without it, the parent process waits for the child to exit, adding up to 3 seconds of delay to `work status`.
- **Don't read cache in CI.** The scope says `CI=true` skips the npm check "entirely" — that means no spawn AND no cache read. Return `null` for `updateAvailable` immediately.
- **`anaVersion: "0.0.0"` display.** The Zod schema defaults missing `anaVersion` to `"0.0.0"`. But the utility reads ana.json with raw `JSON.parse`, not through Zod. So missing field returns `undefined` and `"0.0.0"` returns `"0.0.0"`. Both must map to `"unknown"` in the notification text — never show "initialized with v0.0.0".
- **`getCliVersion` import path.** Importing from `../commands/init/state.js` (from `utils/update-check.ts`). This reaches into the commands layer from utils — acceptable here because `getCliVersion` is a pure version reader, not a command. The alternative (moving `getCliVersion` to utils) has blast radius on every existing consumer.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer named exports. No default exports.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Early returns over nested conditionals.
- Error handling: commands surface errors to users; utilities catch internally and return defaults.
- Always pass `--run` flag when running vitest.
- Tests that create git repos must use `git init -b main` or `git branch -M main`.
- Prefer real implementations over mocks. Mock only network, time, child processes.

### Pattern Extracts

**"Behind remote" notification (work.ts:660-667) — structural analog for notification style:**
```typescript
      // Warn if local artifact branch is behind remote
      const behindResult = runGit(['rev-list', `${artifactBranch}..origin/${artifactBranch}`, '--count']);
      const behind = behindResult.stdout;
      if (parseInt(behind) > 0) {
        console.log(chalk.yellow(
          `ℹ ${artifactBranch} is ${behind} commit${behind === '1' ? '' : 's'} behind remote.`
        ));
      }
```

**StatusOutput interface (work.ts:94-99) — extend with new fields:**
```typescript
interface StatusOutput {
  artifactBranch: string;
  currentBranch: string;
  onArtifactBranch: boolean;
  items: WorkItem[];
}
```

**Empty items early return in printHumanReadable (work.ts:564-567):**
```typescript
  if (output.items.length === 0) {
    console.log(chalk.gray('No active work. Run: claude --agent ana to scope new work.'));
    return;
  }
```

**Zero-slugs early return in getWorkStatus (work.ts:682-694):**
```typescript
  if (slugs.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({
        artifactBranch,
        currentBranch: currentBranch || 'unknown',
        onArtifactBranch,
        items: [],
      }, null, 2));
    } else {
      console.log(chalk.gray('\nNo active work. Run: claude --agent ana to scope new work.'));
    }
    return;
  }
```

**Async action handler pattern (work.ts:2077-2078):**
```typescript
    .action(async (slug: string) => {
      await startWork(slug);
    });
```

**captureOutput helper in work.test.ts (lines 104-113):**
```typescript
  function captureOutput(fn: () => void): string {
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };
    fn();
    console.log = originalLog;
    return logs.join('\n');
  }
```

**Test fixture helper pattern from git-operations.test.ts (lines 28-36):**
```typescript
  async function writeAnaJson(config: Record<string, unknown>): Promise<void> {
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify(config, null, 2),
      'utf-8'
    );
  }
```

### Proof Context

Findings for `packages/cli/src/commands/work.ts` (top 3 by relevance):
- [code] Untested defensive branches in startWork — 'not a git repo' and 'git pull conflict' paths have no dedicated unit tests. *Not directly relevant — different function.*
- [test] Phase detection logic (A001-A003, A006-A011) has no dedicated tagged tests. *Not directly relevant to version awareness.*
- [code] Early-return missing-worktree warning uses misleading message when inside worktree but plan dir absent. *Not relevant.*

No active proof findings for `packages/cli/src/utils/update-check.ts` (new file).

### Checkpoint Commands

- After async conversion of `captureOutput` + all 21 call sites: `(cd packages/cli && pnpm vitest run tests/commands/work.test.ts)` — Expected: all existing tests pass unchanged
- After `update-check.ts` + tests: `(cd packages/cli && pnpm vitest run tests/utils/update-check.test.ts)` — Expected: all new tests pass
- After wiring into work.ts: `(cd packages/cli && pnpm vitest run tests/commands/work.test.ts)` — Expected: existing + new notification tests pass
- Full suite: `(cd packages/cli && pnpm vitest run)` — Expected: all tests pass
- Lint: `pnpm run lint`
- Build: `pnpm run build`

### Build Baseline

- Current tests: 2069 passed, 2 skipped (2071 total)
- Current test files: 98
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2095+ tests in 99 test files (1 new test file)
- Regression focus: `tests/commands/work.test.ts` (21 call sites changing from sync to async)
