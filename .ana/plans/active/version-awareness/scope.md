# Scope: Version Awareness

**Created by:** Ana
**Date:** 2026-05-10

## Intent

Users have zero visibility into version drift. Two silent failures happen today:

1. A newer `anatomia-cli` is on npm — the user doesn't know. They miss bug fixes and features.
2. The user upgraded the CLI but their project's `.ana/` still has templates from the old version. Every command runs on stale context silently.

The user wants two informational notifications on `work status` — the command every agent and human runs at session start — that surface when the CLI or project templates are outdated.

## Complexity Assessment

- **Kind:** feature
- **Size:** small — self-contained utility module + one consumer, no architectural changes
- **Files affected:** 4 files (2 new, 2 modified)
  - `packages/cli/src/utils/update-check.ts` (new)
  - `packages/cli/tests/utils/update-check.test.ts` (new)
  - `packages/cli/src/commands/work.ts` (modified — `getWorkStatus`, `StatusOutput`, `printHumanReadable`, action handler)
  - `packages/cli/tests/commands/work.test.ts` (modified — notification assertions)
- **Blast radius:** Low. The new utility is self-contained. `work.ts` changes are additive — new fields on `StatusOutput`, new render lines in `printHumanReadable`, async conversion of `getWorkStatus`. No changes to agent templates, init, artifact, proof, or ana.json schema.
- **Estimated effort:** ~175 LoC across 4 files. Single pipeline run.
- **Multi-phase:** no

## Approach

Add a self-contained version-check utility that provides two checks: an npm registry lookup (cached, non-blocking, via detached child process) and a local `ana.json` comparison (instant, no network). Both feed into `StatusOutput` as new fields, rendered by `printHumanReadable` after pipeline items and before "Scope new work." Both checks run before the empty-slugs early return so users with no active work still see notifications.

`getWorkStatus` becomes async to reuse the existing `getCliVersion()`. The detached child process pattern handles the npm check without blocking — the parent exits immediately, the child fetches and writes a 24-hour cache under `.ana/state/cache/` (already gitignored).

Requirements are locked at `anatomia_reference/v1_Release/VERSION_AWARENESS_REQUIREMENTS.md` with 12 acceptance criteria, 9 edge cases, and 6 design decisions — all verified against the current codebase via 3-agent scrutiny.

## Acceptance Criteria

- AC1: `work status` shows "v{X} available" when npm has a newer version (cached, non-blocking)
- AC2: `work status` shows "Project initialized with v{X}" when `ana.json` `anaVersion` differs from CLI version
- AC3: Both notifications are suppressed when versions are current
- AC4: Network failure (npm unreachable, timeout >3s) is silent — no error, no notification, no delay
- AC5: Cache persists for 24 hours — repeated `work status` calls don't re-fetch or re-spawn
- AC6: CI environments (`CI=true`) skip the npm update check entirely (no spawn, no cache read)
- AC7: `work status --json` includes `updateAvailable` and `projectMismatch` fields (null when current)
- AC8: First run after install shows no update notification (cache doesn't exist yet — background process writes it for next run)
- AC9: Notification text includes the exact command to run (`npm update -g anatomia-cli` or `ana init`)
- AC10: `anaVersion` missing or `"0.0.0"` in `ana.json` (old projects) shows mismatch notification with "unknown" as project version
- AC11: Semver comparison handles multi-digit versions correctly (`1.10.0 > 1.2.0`)
- AC12: Background check process exits independently — parent `work status` does not wait for it

## Edge Cases & Risks

- **No network:** Background child process times out at 3s. Cache stays stale. No notification, no error, no delay.
- **`.ana/state/cache/` doesn't exist:** `mkdirSync` with `{ recursive: true }` creates it. Already gitignored.
- **`anaVersion` missing or `"0.0.0"`:** Both treated as "unknown." Raw `JSON.parse` returns `undefined` for missing; Zod schema defaults to `"0.0.0"`. Neither should produce "initialized with v0.0.0."
- **Windows:** `spawn` with `detached: true` needs `windowsHide: true` to prevent a visible console window flash.
- **Template literal injection:** The child process script interpolates `cacheFile` into JavaScript source. Use `JSON.stringify(cacheFile)` — not string interpolation with quotes — to prevent injection via paths containing quotes or backslashes. Same vulnerability class as the security audit finding (ANA-SEC-001).
- **Early return bypass:** `getWorkStatus` returns early when `slugs.length === 0` (line 682). `printHumanReadable` also returns early when `items.length === 0` (line 564). Version checks must run before both early returns — a user with no active work is exactly when they should see "update available."
- **Agent behavior:** Every agent template runs `ana work status` at startup. Notification phrasing is deliberately passive ("available", "initialized with") not imperative, so agents don't try to execute the suggested commands.
- **Concurrent calls:** Two terminals spawning background check processes simultaneously is safe — last writer wins, version number is identical regardless.
- **Downgrade:** User installs an older CLI. `isNewerVersion` correctly identifies npm version as newer. Project mismatch shows both directions.

## Rejected Approaches

- **`update-notifier` package:** 10 transitive dependencies. We need ~60 lines of the same core behavior. Every dependency is a security surface.
- **Fire-and-forget Promise:** Even with async `getWorkStatus`, the npm check should not block the command. A detached child process is the correct pattern — same as what `update-notifier` uses internally.
- **Reusing `readArtifactBranch` for `anaVersion`:** It reads `ana.json` but only extracts `artifactBranch` and discards the rest. Refactoring it to return more fields has blast radius across every consumer. A separate 3-line sync read is cleaner.
- **Checking on every command:** `work status` is the natural notification point — every session starts there. Adding to `scan`, `proof`, `agents` would train users to ignore the notification.
- **Sync `getWorkStatus` with inlined version read:** `getCliVersion()` already exists and is async. Duplicating its `import.meta.url` path resolution logic for a sync variant is fragile. Making `getWorkStatus` async is a one-word change — the pattern already exists in `startWork` and `completeWork`.

## Open Questions

None. All implementation questions resolved during scrutiny. The requirements doc is definitive.

## Exploration Findings

### Patterns Discovered

- `getWorkStatus` (work.ts:644): sync function, returns `void`. Action handler (line 2069) is also sync — both need async conversion.
- `printHumanReadable` (work.ts:556): pure renderer, takes `StatusOutput`. Has its own early return for empty items (line 564). Version notifications need to render before both this return and the "Scope new work" line (line 635).
- "Behind remote" notification (work.ts:663-667): same `ℹ` + `chalk.yellow` pattern, best-effort, silent on failure. This is the structural analog for notification style.
- `StatusOutput` interface (work.ts:94-99): `camelCase` fields — `artifactBranch`, `currentBranch`, `onArtifactBranch`, `items`. New fields must use `camelCase`: `updateAvailable`, `projectMismatch`.

### Constraints Discovered

- [TYPE-VERIFIED] `getCliVersion` is async (init/state.ts:177) — uses `fs.readFile` + `import.meta.url` path detection. `import.meta.url` resolves relative to the defining module, not the caller, so importing from `utils/update-check.ts` works correctly.
- [TYPE-VERIFIED] `anaVersion` schema default is `"0.0.0"` (anaJsonSchema.ts:33) — raw `JSON.parse` bypasses this, returning `undefined` for missing field.
- [TYPE-VERIFIED] `.gitignore` line 41 covers `**/.ana/state/cache/` only — `.ana/state/` itself is NOT gitignored. Cache must go under `cache/`.
- [TYPE-VERIFIED] `readArtifactBranch` calls `process.exit(1)` on missing `ana.json` (git-operations.ts:66) — cannot be reused for the version check.
- [OBSERVED] Codebase uses `spawnSync` everywhere via `runGit`. `spawn` (async, detached) is a new import from `node:child_process` — not currently used anywhere.
- [OBSERVED] Package name is `anatomia-cli` (package.json line 2) — matches the npm registry URL in the requirements.
- [OBSERVED] `start` and `complete` command actions are already async (work.ts:2077, 2086) — async `.action()` pattern is established.

### Test Infrastructure

- `packages/cli/tests/commands/work.test.ts` — existing test file for work commands. New notification tests go here.
- `packages/cli/tests/utils/` — existing test directory. New `update-check.test.ts` goes here.
- Codebase uses vitest. Always run with `--run` flag to avoid watch mode.

## For AnaPlan

### Structural Analog

The "behind remote" notification in `getWorkStatus` (work.ts:657-667). Same shape: best-effort check → conditional `ℹ` notification → silent on failure. The version notifications follow this exact pattern but with cache and background process additions.

### Relevant Code Paths

- `packages/cli/src/commands/work.ts` — `getWorkStatus` (line 644), `printHumanReadable` (line 556), `StatusOutput` (line 94), `registerWorkCommand` status action (line 2069)
- `packages/cli/src/commands/init/state.ts` — `getCliVersion` (line 177)
- `packages/cli/src/utils/git-operations.ts` — `readArtifactBranch` (line 62), demonstrates the ana.json read pattern
- `packages/cli/src/commands/init/anaJsonSchema.ts` — `anaVersion` field definition (line 33)

### Patterns to Follow

- Notification style: match the "behind remote" notification (work.ts:663-667) — `chalk.gray` with `ℹ` prefix for informational, `chalk.yellow` for warnings
- Error handling: match the git fetch pattern (work.ts:656-669) — best-effort, silent on failure, no user-visible errors
- JSON output: match existing `StatusOutput` convention — `camelCase` field names, `null` for absent values

### Known Gotchas

- The empty-slugs early return (line 682-694) and the empty-items early return in `printHumanReadable` (line 564-567) both need version notifications rendered before they return. Miss either one and some users never see notifications.
- `JSON.stringify(cacheFile)` in the child process script, not `'${cacheFile}'`. Security requirement.
- `windowsHide: true` on the `spawn` call. Without it, Windows users see a console flash.
- `anaVersion: "0.0.0"` must be treated as "unknown" — same as `undefined`.

### Things to Investigate

- Whether `printHumanReadable` should receive version info as `StatusOutput` fields or as separate parameters. The cleaner design is `StatusOutput` fields — keeps the interface consistent and the JSON output gets the same data for free.
