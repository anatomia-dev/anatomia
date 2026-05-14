# Spec: Capture actual think time from Ana session start

**Created by:** AnaPlan
**Date:** 2026-05-13
**Scope:** .ana/plans/active/capture-think-time/scope.md

## Approach

The think phase clock currently starts at `ana work start` (slug creation), not when the Ana conversation began. Real think time — investigation, discussion, scope drafting — happens before that. This fix captures the conversation start time via a PID-keyed session file and replays it into `work_started_at` when the slug is created.

Three changes:

1. **`getClaudePid()` utility** — resolves the Claude Code process PID by walking one level up from `process.ppid` (the shell) to the shell's parent (Claude). Returns `number | null`. Any failure returns `null`.

2. **`--session` flag on `ana work status`** — when present, writes `.ana/state/session-{claudePid}.json` with the current UTC timestamp. This flag only appears in Ana's agent prompt. Other agents call plain `work status`.

3. **Session file consumption in `startWork()`** — on the new-slug path only, before calling `writeTimestamp()`: read the session file, delete it immediately (delete-then-use — the file is consumed the moment it's read, regardless of what happens downstream), then pass the captured timestamp to `writeTimestamp()`.

`writeTimestamp()` gains an optional `timestamp` parameter. When provided, it uses that value instead of `new Date().toISOString()`. Existing call sites are unchanged — the parameter is optional with no default.

Every failure mode degrades to current behavior: `writeTimestamp()` uses `now()`.

## Output Mockups

No user-visible output changes. The feature is invisible — think time in proof chain entries and Gantt charts will reflect the actual conversation start rather than the slug creation moment. A 45-minute scoping session that currently shows "Think: 1m" will show "Think: 45m".

Session file example (`.ana/state/session-60243.json`):
```json
{ "timestamp": "2026-05-13T14:30:00.000Z" }
```

## File Changes

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** Three additions: (1) `getClaudePid()` utility function near the other utility functions at the bottom of the file, (2) session file write logic inside `getWorkStatus()` gated by `options.session`, (3) session file read-delete-use logic in `startWork()` on the new-slug path before `writeTimestamp()`. Also: `writeTimestamp()` gains an optional `timestamp` parameter, and the `--session` flag is registered on the `status` Commander subcommand.
**Pattern to follow:** Existing `writeTimestamp()` for the timestamp write pattern. Existing `try/catch` with silent fallback throughout `work.ts` for the graceful degradation pattern.
**Why:** This is where think time is measured. Without this change, `work_started_at` always records `now()` instead of conversation start.

### `.claude/agents/ana.md` (modify)
**What changes:** Two occurrences of `ana work status` become `ana work status --session`. Both are in Ana's startup instructions — the initial status check and the scoping reference.
**Pattern to follow:** Existing prompt text.
**Why:** Ana is the only agent that should write session markers. Without this flag, the session file is never created and think time stays at 1-2 minutes.

### `packages/cli/templates/.claude/agents/ana.md` (modify)
**What changes:** Same change as the dogfood copy — `ana work status` becomes `ana work status --session` in the same two locations.
**Pattern to follow:** Keep in sync with the dogfood copy.
**Why:** This is the template that `ana init` installs for new users. Without this, new installations don't get the session marker.

### `packages/cli/tests/commands/work.test.ts` (modify)
**What changes:** New test group for session file behavior: `getClaudePid()` utility tests (mock `execSync`), `--session` flag write tests, `startWork()` session consumption tests, and fallback behavior tests.
**Pattern to follow:** Existing `createWorkTestProject()` helper and `captureOutput()` pattern in the same test file.
**Why:** The PID resolution, file write, file read, and delete-then-use ordering all need verification.

## Acceptance Criteria

- [x] AC1: `ana work status --session` writes `.ana/state/session-{claudePid}.json` containing `{ "timestamp": "<UTC ISO string>" }` where `claudePid` is resolved from the process tree
- [x] AC2: `ana work start {slug}` (new slug path only) reads `session-{claudePid}.json`, deletes the file immediately, then uses its timestamp as `work_started_at`
- [x] AC3: When no session file exists, `work start` uses `now()` as `work_started_at` — identical to current behavior
- [x] AC4: The Claude PID resolution uses `ps -o ppid= -p {process.ppid}` (POSIX standard). If the `ps` call fails or returns an invalid PID, the session marker is skipped and `work start` falls back to `now()`
- [x] AC5: The `--session` flag is added to Ana's agent prompt (both `.claude/agents/ana.md` and `packages/cli/templates/.claude/agents/ana.md`). No changes to Plan, Build, or Verify prompts
- [x] AC6: Session files are written to `.ana/state/` which is already gitignored
- [x] AC7: Orphan session files (from Ana sessions that never scoped) are inert
- [x] AC8: Plain `ana work status` (without `--session`) does not write any session file
- [x] Tests pass with `pnpm vitest run`
- [x] No build errors

## Testing Strategy

- **Unit tests for `getClaudePid()`:** Mock `execSync` to return valid PID, invalid output, and throw. Verify returns `number` on success, `null` on any failure.
- **Integration tests for `--session` flag:** Use `createWorkTestProject()`, call `getWorkStatus({ session: true })` with a mocked `getClaudePid()`, verify session file exists with correct JSON structure. Call with `session: false` (or omitted), verify no session file.
- **Integration tests for session consumption in `startWork()`:** Pre-create a session file with a known timestamp, call `startWork()`, verify `.saves.json` contains that timestamp as `work_started_at`, verify session file is deleted. Test the no-session-file path: verify `work_started_at` uses a recent timestamp (within seconds of `now()`).
- **Delete-then-use ordering:** Pre-create a session file, mock `writeTimestamp()` to throw after the session file should be deleted. Verify the session file is still deleted even though the downstream operation failed.
- **Edge cases:** Invalid JSON in session file (fallback to `now()`), missing `.ana/state/` directory on write (create it), session file for wrong PID (not consumed).

## Dependencies

- `.ana/state/` directory exists and is gitignored (verified: it exists, `.ana/.gitignore` contains `state/`).
- `execSync` available from `node:child_process` (already imported in work.ts as `spawnSync` — add `execSync` to the existing import).

## Constraints

- No changes to any type definitions, proof chain, artifact system, or other agent prompts.
- POSIX-only for `ps` command — acceptable because Claude Code doesn't run on native Windows.
- `writeTimestamp()` signature change must be backward-compatible (optional parameter, no change to existing callers).

## Gotchas

- **`process.ppid` is the shell PID, NOT Claude's PID.** The process tree is `claude → shell → node`. `process.ppid` gives the shell. The Claude PID is the shell's parent: `ps -o ppid= -p ${process.ppid}`. Using `process.ppid` directly is the single most likely implementation mistake.
- **`--session` must be on the `status` subcommand, not the parent `work` command.** Commander.js option inheritance could cause it to appear on all subcommands if placed on `workCommand` instead of `statusCommand`.
- **Delete-then-use is mandatory.** Read the timestamp value, delete the file immediately, then pass the value to `writeTimestamp()`. Never hold the file open while doing downstream work. The developer explicitly required this ordering to prevent stale session files from being consumed by a future `work start` for a different slug.
- **`execSync` is already partially imported** — `spawnSync` is imported from `node:child_process` but not `execSync`. Add `execSync` to the existing destructured import. Don't add a new import line.
- **The `getWorkStatus` options type** must be extended to include `session?: boolean`. Check how the type is defined — it may be inline in the function signature or a separate interface.
- **`ana init` skips existing agent files.** The template prompt change only reaches new installations. Existing users keep their old prompt until `--force` re-init. This is a known distribution gap, not something to fix here.

## Build Brief

### Rules That Apply
- All local imports use `.js` extensions. `import { execSync } from 'node:child_process'` uses `node:` prefix.
- Use `import type` for type-only imports, separate from value imports.
- Prefer early returns over nested conditionals.
- Error handling in commands: `chalk.red` message + `process.exit(1)`. But for `getClaudePid()` and session file operations, use silent fallback (return `null`, skip) — these are best-effort, not user-facing errors.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Always use `--run` with `pnpm vitest` to avoid watch mode hang.

### Pattern Extracts

Existing `writeTimestamp()` — the function gaining the `timestamp` parameter (work.ts:2092-2113):
```typescript
async function writeTimestamp(activePath: string, key: string, agent?: string, force: boolean = false): Promise<void> {
  const savesPath = path.join(activePath, '.saves.json');
  let saves: Record<string, unknown> = {};
  if (fs.existsSync(savesPath)) {
    try {
      saves = JSON.parse(fs.readFileSync(savesPath, 'utf-8'));
    } catch {
      // Start fresh if corrupted
    }
  }
  // Write-once guard: skip if key already exists unless force is true
  if (!force && saves[key] !== undefined) {
    return;
  }
  saves[key] = new Date().toISOString();
  if (agent) {
    const agentKey = key.replace('_started_at', '_agent');
    saves[agentKey] = agent;
  }
  await fsPromises.writeFile(savesPath, JSON.stringify(saves, null, 2), 'utf-8');
}
```

New-slug path in `startWork()` — where session consumption goes (work.ts:1806-1811):
```typescript
    // Create directory
    await fsPromises.mkdir(activePath, { recursive: true });

    // Write work_started_at
    await writeTimestamp(activePath, 'work_started_at', 'ana');
    commitSaves(projectRoot, slug, `[${slug}] Start work`);
```

Commander `status` subcommand registration (work.ts:2161-2166):
```typescript
  const statusCommand = new Command('status')
    .description('Show pipeline state for all active work items')
    .option('--json', 'Output JSON format for programmatic consumption')
    .action(async (options: { json?: boolean }) => {
      await getWorkStatus(options);
    });
```

### Proof Context

Relevant findings for `packages/cli/src/commands/work.ts`:
- **[code]** Race condition in writeTimestamp: read-modify-write on .saves.json is not atomic — pre-existing, not introduced by this change, but be aware when modifying `writeTimestamp()`.
- **[test]** Untested defensive branches in startWork — 'not a git repo' and 'git pull conflict' paths have no dedicated unit tests — the new session logic adds to startWork's paths, so add thorough tests for the new paths.

No active proof findings for `.claude/agents/ana.md` or the template copy.

### Checkpoint Commands

- After `getClaudePid()` and `writeTimestamp()` changes: `(cd packages/cli && pnpm vitest run)` — Expected: existing 2178 tests still pass (no regressions from signature change)
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: ~2190+ tests pass (existing + new session tests)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2178 passed, 2 skipped (2180 total)
- Current test files: 100
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: ~2190+ tests in 100 files (new tests added to existing work.test.ts)
- Regression focus: `packages/cli/tests/commands/work.test.ts` — existing `startWork` and `getWorkStatus` tests must not break from the signature/options changes
