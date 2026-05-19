# Spec: CLI Telemetry Foundation

**Created by:** AnaPlan
**Date:** 2026-05-18
**Scope:** .ana/plans/active/cli-telemetry/scope.md

## Approach

Add a self-contained telemetry module that writes events to disk and flushes them via a detached child process — the same architecture `update-check.ts` uses for npm registry lookups.

Three layers:

1. **`src/utils/telemetry.ts`** — the core module. Manages consent state (`~/.config/anatomia/telemetry.json`), appends events to `~/.config/anatomia/pending-events.ndjson`, spawns a detached child to POST events to PostHog's `/capture` batch endpoint. Every public function catches internally and never throws. Mirrors the silent-on-error pattern from `update-check.ts`.

2. **`src/commands/telemetry.ts`** — the user-facing command. `ana telemetry` (status), `ana telemetry enable`, `ana telemetry disable`, `ana telemetry show`. Follows the `config.ts` subcommand-group pattern with `addCommand(showCommand, { isDefault: true })`.

3. **`src/index.ts`** — three integration points: (a) `program.hook('preAction', ...)` fires `command_run` for every command except `telemetry` subcommands, (b) after `parseAsync()` succeeds, call `flush()`, (c) in the catch block, track `error_occurred` before `process.exit(1)`.

**Consent prompt:** On first interactive run, before the first `command_run` event is recorded, the `preAction` hook calls `telemetry.ensureConsent()`. This checks if `telemetry.json` exists. If not, and `process.stdin.isTTY && process.stdout.isTTY`, it prompts with a 3-line message and `[y/N]` default. Uses the same `createInterface` readline pattern as `confirm()` in `state.ts` — but is its own function, not imported from `state.ts` (telemetry has no init dependency). Non-TTY silently disables. `DO_NOT_TRACK=1` env var silently disables without prompt or disk write.

**`command_run` via `preAction` hook:** Commander v14's `program.hook('preAction', fn)` fires for all nested subcommands (verified: `work start`, `artifact save scope`, `proof health` all trigger the hook registered on the root program). The `actionCommand` parameter is the leaf command; walking `actionCommand.parent` up the chain builds the full command name (e.g., `work start`). The hook skips `telemetry` subcommands by checking if any ancestor command is named `telemetry`.

**`--version` and `--help` exclusion:** Commander built-ins (`ana --version`, `ana --help`, `ana help <command>`) bypass the action chain entirely — `preAction` does not fire for them. This is correct behavior: version/help are not interesting for funnel analysis and should not be tracked.

**Config directory resolution:** A `getConfigDir()` helper returns the global config path: `$XDG_CONFIG_HOME/anatomia/` if `XDG_CONFIG_HOME` is set, else `~/.config/anatomia/` on macOS/Linux, `%APPDATA%/anatomia/` on Windows. Uses `os.homedir()` and `os.platform()`.

**PostHog API key:** Hardcoded as a string constant `POSTHOG_API_KEY` in `telemetry.ts`. PostHog project API keys are public by design (same pattern as the website's `NEXT_PUBLIC_POSTHOG_KEY` in client-side JS). The key is `'phc_zj7BAuN3GtaS3HDAfeR9XcXYin38j5zHuuYoiLmnoxFf'`.

**Flush script:** The detached child process runs an inline CommonJS script (same as `update-check.ts` — `node -e` runs outside the ESM bundle). It reads `pending-events.ndjson`, parses each line, constructs a PostHog `/capture` batch payload, sends a single HTTPS POST, and on success deletes the NDJSON file. On failure, the file is left on disk for next run. The script caps at the 500 most recent events (by reading all lines, keeping last 500). Timeout: 5 seconds.

## Output Mockups

### Consent Prompt (first interactive run)

```
Anatomia collects anonymous usage data to improve the CLI.
What's collected: command names, OS, Node version. No code, no file paths.

Enable anonymous telemetry? [y/N]
```

### `ana telemetry` / `ana telemetry status`

```
Telemetry: disabled
Config:    ~/.config/anatomia/telemetry.json
```

```
Telemetry: enabled
Config:    ~/.config/anatomia/telemetry.json
```

### `ana telemetry enable`

```
Telemetry enabled.
```

### `ana telemetry disable`

```
Telemetry disabled.
```

### `ana telemetry show`

```
Sample telemetry event:

{
  "event": "command_run",
  "properties": {
    "command": "scan",
    "cliVersion": "1.1.1",
    "os": "darwin",
    "nodeVersion": "v25.9.0",
    "isCI": false,
    "source": "cli"
  },
  "timestamp": "2026-05-18T23:42:40.360Z",
  "distinct_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}

Fields:
  event        Command or lifecycle event name
  command      CLI command that was run
  cliVersion   Installed CLI version
  os           Operating system (darwin, linux, win32)
  nodeVersion  Node.js version
  isCI         Whether running in a CI environment
  source       Always "cli" — distinguishes from website events
  distinct_id  Random UUID, not tied to any identity
  timestamp    ISO 8601 timestamp
```

## File Changes

### `src/utils/telemetry.ts` (create)
**What changes:** New module — consent management, event recording, flush orchestration.
**Pattern to follow:** `src/utils/update-check.ts` — same detached-spawn pattern, same silent-on-error discipline, same filesystem read/write style.
**Why:** This is the core of the feature. Without it, nothing else works.

### `src/commands/telemetry.ts` (create)
**What changes:** New command — `ana telemetry` with status/enable/disable/show subcommands.
**Pattern to follow:** `src/commands/config.ts` — same subcommand group structure with `addCommand(statusCommand, { isDefault: true })`, same error handling with `chalk.red` + `process.exitCode = 1`.
**Why:** Users need a way to check, enable, and disable telemetry. The `show` subcommand provides transparency.

### `src/index.ts` (modify)
**What changes:** Three additions: (1) import and register the telemetry command, (2) add `preAction` hook for `command_run` tracking + consent prompt, (3) call `flush()` after `parseAsync` and track `error_occurred` in catch.
**Pattern to follow:** Existing command registration pattern (import `registerTelemetryCommand`, call it, add to CONFIGURATION group). The `preAction` hook is new — no existing pattern to follow, but it's a single `program.hook()` call.
**Why:** The entry point is the only place that sees every command invocation and controls the process lifecycle.

### `src/commands/scan.ts` (modify)
**What changes:** Single `telemetry.track('scan_completed', { duration_ms, hasFindings })` call after scan succeeds. `duration_ms` computed from a `Date.now()` captured at action start minus `Date.now()` at completion. `hasFindings` derived from the existing `countFindings()` helper (truthy if > 0).
**Pattern to follow:** No existing telemetry pattern — this is the first instrumentation point. Keep it to one line plus the timing variable.
**Why:** Tracks scan funnel conversion.

### `src/commands/init/index.ts` (modify)
**What changes:** Single `telemetry.track('init_completed', { duration_ms, isReinit, detectedStack })` call after successful init (after `displaySuccessMessage`). `duration_ms` from the existing `scanStart` variable. `isReinit` from `preflight.anaExisted`. `detectedStack` from `engineResult` stack summary (language + framework, e.g., "TypeScript" or "Next.js + Prisma").
**Pattern to follow:** Same one-line pattern as scan.
**Why:** Tracks init funnel conversion and stack distribution.

### `src/commands/work.ts` (modify)
**What changes:** Two instrumentation points: (1) `telemetry.track('pipeline_started')` at the end of `startWork()` after successful completion, (2) `telemetry.track('pipeline_completed', { result, duration_ms })` at the end of `completeWork()` after successful archival. `result` is the verification result (pass/fail/skipped). `duration_ms` for `pipeline_completed` is the duration of the `completeWork` operation itself (not the total pipeline duration — that spans multiple agent sessions and is not measurable from a single CLI invocation).
**Pattern to follow:** Same one-line pattern.
**Why:** Tracks pipeline adoption and completion rates.

### `src/commands/artifact.ts` (modify)
**What changes:** Single `telemetry.track('artifact_saved', { stage })` call after successful artifact commit. `stage` is the artifact type string already available in the command action (e.g., "scope", "spec", "build-report").
**Pattern to follow:** Same one-line pattern.
**Why:** Tracks which pipeline stages are actively used.

### `tests/utils/telemetry.test.ts` (create)
**What changes:** Comprehensive test suite for the telemetry module.
**Pattern to follow:** `tests/utils/update-check.test.ts` — same temp directory setup/teardown, same mock patterns for `child_process.spawn`, same module-level `vi.mock()` for ESM compatibility.
**Why:** Telemetry is a critical trust component. Users must be confident it behaves as documented.

## Acceptance Criteria

- [ ] AC1: First interactive CLI run displays a 3-line prompt showing what's collected and asking `Enable? [y/N]`. Choosing `y` enables telemetry. Choosing `N` or pressing Enter disables it. The choice persists across all future runs.
- [ ] AC2: Consent state stored in `~/.config/anatomia/telemetry.json` with fields: `enabled`, `anonymousId` (UUIDv4), `promptedAt` (ISO timestamp), `version` (schema version integer).
- [ ] AC3: If `!process.stdin.isTTY` or `!process.stdout.isTTY`, no prompt fires and telemetry defaults to disabled silently.
- [ ] AC4: If `DO_NOT_TRACK=1` is set, telemetry is disabled regardless of config file. No prompt, no events, no disk writes.
- [ ] AC5: Seven events fire at the correct instrumentation points: `command_run` (every command except `ana telemetry *`), `scan_completed`, `init_completed`, `pipeline_started` (`work start`), `pipeline_completed` (`work complete`), `artifact_saved`, `error_occurred` (unhandled exception in `main()` catch block).
- [ ] AC6: Every event includes `anonymousId`, `timestamp`, and `source: 'cli'`. `command_run` includes `command`, `cliVersion`, `os`, `nodeVersion`, `isCI`. Other events include their specific properties.
- [ ] AC7: No PII in any event. No file paths, no project names, no git URLs, no usernames. `detectedStack` is the only project-derived property and contains only technology names.
- [ ] AC8: Events are appended to `~/.config/anatomia/pending-events.ndjson` as one JSON object per line. No read-modify-write.
- [ ] AC9: After successful command completion (parseAsync resolves in main), a detached child process is spawned that reads pending events, POSTs them to PostHog's capture API, and deletes the file. The main CLI process does not wait.
- [ ] AC10: `ana telemetry` / `ana telemetry status` prints whether enabled or disabled and the config file path.
- [ ] AC11: `ana telemetry enable` enables telemetry (generates anonymousId if needed). `ana telemetry disable` disables it.
- [ ] AC12: `ana telemetry show` prints a sample event payload with field descriptions — the transparency command.
- [ ] AC13: All telemetry operations (track, flush, prompt) catch errors internally and never throw. A failure in telemetry never crashes or delays the CLI.
- [ ] AC14: PostHog project API key is hardcoded in source. Not in env vars, not in config. It's a public key by design.
- [ ] AC15: If the detached flush fails (network error, PostHog down), events remain on disk and are included in the next flush attempt.
- [ ] AC16: Tests verify: consent persistence, event shape validation, DO_NOT_TRACK override, non-TTY default, NDJSON append correctness, no-throw guarantees on telemetry failure, mock injection for the HTTP layer.
- [ ] AC17: The flush script caps pending events at 500 most recent. Older events are discarded before sending.
- [ ] AC18: `ana --version`, `ana --help`, and `ana help <command>` do not trigger `command_run` events. These are Commander built-ins that bypass the action chain.
- [ ] AC19: Tests pass with `pnpm vitest run` from `packages/cli`.
- [ ] AC20: No build errors (`pnpm run build`).

## Testing Strategy

- **Unit tests:** Test the telemetry module in isolation. Mock `node:child_process` spawn at module level (same pattern as `update-check.test.ts`). Use real temp directories for config/NDJSON file operations.
  - Consent: write config, read it back, verify fields and types
  - DO_NOT_TRACK: set env var, verify `track()` is a no-op and no files are written
  - Non-TTY: mock `process.stdin.isTTY = false`, verify no prompt, disabled by default
  - Event recording: call `track()`, read NDJSON file, parse lines, verify event shape
  - Event shape: validate each event type includes required fields (use Zod schemas in tests only)
  - Flush spawn: verify `spawn` is called with correct args (detached, stdio ignore, unref), verify inline script content includes PostHog endpoint and NDJSON file path
  - No-throw: corrupt the config file, verify `track()` returns silently. Remove write permissions on config dir, verify no crash.
  - Cap: write 600 events, trigger flush, verify spawn script would process only last 500

- **Integration tests:** Not needed for this scope. The telemetry module is self-contained — it touches only `~/.config/anatomia/` (mocked via temp dirs) and spawns a detached process (mocked). The instrumentation points are single-line calls that are trivially correct.

- **Edge cases:**
  - Config directory doesn't exist (auto-created with `mkdirSync({ recursive: true })`)
  - Config file is corrupt JSON (treated as not-yet-prompted, re-prompts)
  - NDJSON file has corrupt lines (flush script skips invalid lines)
  - Multiple concurrent appends (NDJSON + appendFileSync is safe under PIPE_BUF)
  - HOME is unset or read-only (all operations catch and return silently)

## Dependencies

- No new npm dependencies. Uses `node:https`, `node:fs`, `node:path`, `node:os`, `node:crypto` (for `randomUUID()`), `node:child_process`, `node:readline`.
- PostHog project API key (placeholder — developer fills in before shipping).

## Constraints

- **No PII.** The contract and tests enforce this. `detectedStack` is technology names only.
- **No CLI latency impact.** `track()` is synchronous disk append. Flush is detached. Consent prompt fires once ever.
- **No new dependencies.** PostHog's capture API is a single HTTPS POST. The 640KB `posthog-node` SDK is not justified.
- **CommonJS in flush script.** The inline `node -e` script runs outside the ESM bundle. Must use `require('https')`, `require('fs')`, etc. Same constraint as `update-check.ts`.
- **Silent on all errors.** Every public function in `telemetry.ts` wraps its body in try/catch. Telemetry failures never crash or delay the CLI.

## Gotchas

- **The `preAction` hook's `actionCommand` is the leaf command, not the full chain.** To get `work start`, walk `actionCommand.parent` up until you hit the root program. Build the full name by collecting names in reverse. The root program's name (`ana`) is excluded from the command string.
- **`process.exit(1)` in command handlers skips the flush in `main()`.** Events from error exits are written to disk (track is synchronous) but the detached flush spawn after `parseAsync` is skipped. Events persist and flush on the next successful run. This is acceptable.
- **The flush script must use `JSON.stringify()` for path interpolation** to prevent injection — same security pattern as `update-check.ts` (ANA-SEC-001 class). Never use template literal interpolation for file paths in the inline script.
- **`getCliVersion()` is async** (reads package.json). In the `preAction` hook, this needs to be awaited. Commander v14 supports async hooks.
- **Don't import from `state.ts`.** The telemetry module must have zero dependency on init. The `confirm()` function in `state.ts` is a pattern reference, not an import target. Telemetry has its own consent prompt function.
- **`ana telemetry` subcommands must not track `command_run`.** The `preAction` hook must check the command ancestry chain for a `telemetry` parent and skip tracking. Otherwise telemetry commands inflate usage counts with circular self-measurement.
- **`randomUUID()` is available in Node 19+.** The project requires Node 22+ (see CI matrix), so `crypto.randomUUID()` is safe. No need for a UUID library.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer named exports. No default exports.
- Error handling: commands surface errors with `chalk.red` + `process.exitCode = 1`. Utility functions catch internally and return defaults.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Use `| null` for fields that were checked and found empty.
- Prefer early returns over nested conditionals.

### Pattern Extracts

**Detached spawn pattern** — from `src/utils/update-check.ts` lines 99-140:
```typescript
export function spawnUpdateCheck(projectRoot: string, packageName: string): void {
  if (process.env['CI'] === 'true') return;

  const cacheFile = path.join(projectRoot, CACHE_PATH);
  const cacheDir = path.dirname(cacheFile);

  // Inline Node.js script for the child process
  // Uses JSON.stringify for safe path interpolation and encodeURIComponent for URL interpolation (ANA-SEC-001 class)
  const script = `
const https = require('https');
const fs = require('fs');
const path = require('path');

const cacheFile = ${JSON.stringify(cacheFile)};
const cacheDir = ${JSON.stringify(cacheDir)};

const req = https.get('https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest', { timeout: 3000 }, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const pkg = JSON.parse(data);
      if (pkg.version) {
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify({ version: pkg.version, timestamp: Date.now() }));
      }
    } catch {}
    process.exit(0);
  });
});
req.on('error', () => process.exit(0));
req.on('timeout', () => { req.destroy(); process.exit(0); });
`;

  const child = spawn('node', ['-e', script], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  child.unref();
}
```

**Subcommand group pattern** — from `src/commands/config.ts` lines 252-351:
```typescript
export function registerConfigCommand(program: Command): void {
  const configCommand = new Command('config')
    .description('Read and write ana.json settings');

  const showCommand = new Command('show')
    .description('Show all settings')
    .option('--json', 'Output as JSON')
    .action((options: { json?: boolean }) => {
      try {
        // ...
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exitCode = 1;
      }
    });

  // ...more subcommands...

  configCommand.addCommand(showCommand, { isDefault: true });
  configCommand.addCommand(getCommand);
  configCommand.addCommand(setCommand);
  program.addCommand(configCommand);
}
```

**Readline prompt pattern** — from `src/commands/init/state.ts` lines 32-48:
```typescript
export async function confirm(message: string, defaultYes: boolean): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return defaultYes;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultYes ? '(Y/n)' : '(y/N)';
  return new Promise((resolve) => {
    rl.question(`${message} ${suffix} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '') resolve(defaultYes);
      else resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}
```

**Test mock pattern** — from `tests/utils/update-check.test.ts` lines 1-20:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const mockUnref = vi.fn();
const mockSpawn = vi.fn().mockReturnValue({ unref: mockUnref });
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: (...args: unknown[]) => mockSpawn(...args) };
});
```

### Proof Context

- **`src/index.ts`:** `commandsGroup()` is Commander v14-specific. Not relevant to this build but confirms we're on v14.
- **`src/commands/work.ts`:** High-churn file (20 pipeline cycles). The `startWork` and `completeWork` functions are long — add instrumentation at the very end of each, after all success logic. Don't add it mid-function where early returns could skip it.
- No active proof findings for `scan.ts`, `init/index.ts`, `artifact.ts`, or `update-check.ts`.

### Checkpoint Commands

- After `src/utils/telemetry.ts` + `tests/utils/telemetry.test.ts`: `cd packages/cli && pnpm vitest run tests/utils/telemetry.test.ts` — Expected: all telemetry tests pass
- After `src/commands/telemetry.ts`: `cd packages/cli && pnpm vitest run` — Expected: full suite passes (no regressions from import)
- After all instrumentation + `src/index.ts` changes: `cd packages/cli && pnpm vitest run` — Expected: 2489+ tests pass
- Lint: `cd packages/cli && pnpm run lint` — Expected: clean
- Build: `pnpm run build` — Expected: no errors

### Build Baseline

- Current tests: 2489 passed, 2 skipped (2491 total)
- Current test files: 108
- Command used: `cd packages/cli && pnpm vitest run`
- After build: expected ~2510+ tests in 109 files (1 new test file, ~20+ new tests)
- Regression focus: `tests/commands/config.test.ts` (if telemetry command registration affects Commander state), `tests/utils/update-check.test.ts` (if spawn mock patterns conflict)
