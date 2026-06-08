# Spec: Cross-machine provenance — Phase 3 (init hooks)

**Created by:** AnaPlan
**Date:** 2026-06-07
**Scope:** .ana/plans/active/cross-machine-provenance/scope.md

## Approach

Phases 1–2 made provenance capture/assemble/verify run off the `ana artifact save` checkpoint and committed files. The per-turn derive hook is now dead code at runtime (Phase 1 made `ana _capture --derive` a no-op). This phase finishes the cleanup on the **install** side: `ana init` should install exactly one capture hook (SessionStart) on both platforms, and should **actively prune** the old `ana _capture --derive` hook from existing installs — because PR #291 deleted the prune path, so a customer who upgrades and re-inits would otherwise keep a stale derive hook forever.

Three independent edits (no type coupling — these touch hook command strings and templates only):
1. **Stop installing the derive hook** — remove the `SessionEnd` (Claude) / `Stop` (Codex) derive injection from both injector functions and from `templates/.codex/hooks.json`.
2. **Targeted prune** — on re-init, remove any hook entry whose command is exactly `ana _capture --derive` from `.claude/settings.json` (under `SessionEnd`) and `.codex/hooks.json` (under `Stop`), preserving every user-authored hook and dropping the now-empty event key.
3. **`.gitignore` guard** — the generated `.ana/.gitignore` must never ignore `provenance/` (it travels git). The generator already omits it; lock that in with a regression test.

This phase is order-independent from Phase 2 but depends on Phase 1 (the `--derive` no-op tolerance is what makes a still-installed-but-not-yet-pruned derive hook harmless during the transition).

## Output Mockups

**Fresh `.claude/settings.json` after `ana init`:**
```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "ana _capture" } ] }
    ]
  }
}
```
(No `SessionEnd` key.)

**Re-init pruning a stale derive hook** — before:
```json
{
  "hooks": {
    "SessionStart": [ { "hooks": [ { "type": "command", "command": "ana _capture" } ] } ],
    "SessionEnd": [
      { "hooks": [ { "type": "command", "command": "ana _capture --derive" } ] },
      { "hooks": [ { "type": "command", "command": "my-own-cleanup.sh" } ] }
    ]
  }
}
```
after `ana init` — the derive entry is gone, the user hook survives:
```json
{
  "hooks": {
    "SessionStart": [ { "hooks": [ { "type": "command", "command": "ana _capture" } ] } ],
    "SessionEnd": [
      { "hooks": [ { "type": "command", "command": "my-own-cleanup.sh" } ] }
    ]
  }
}
```
(If `SessionEnd` held only the derive hook, the whole `SessionEnd` key is removed.)

**Fresh `.codex/hooks.json` after `ana init`:** `SessionStart` only, no `Stop` key.

## File Changes

### packages/cli/src/commands/init/assets.ts (modify)
**What changes:**
- **`injectCaptureHook`** (assets.ts:681–689): delete the line that injects the Claude derive hook — `injectHookEvent(hooks, CAPTURE_END_EVENT_CLAUDE, CAPTURE_DERIVE_COMMAND)` (line 688) and its comment. Keep only the `SessionStart` injection.
- **`applyCodexCaptureHooks`** (assets.ts:771–799): delete the line that injects the Codex derive hook — `injectHookEvent(hooksObj, CAPTURE_END_EVENT_CODEX, CAPTURE_DERIVE_COMMAND)` (line 793). Keep only the `SessionStart` injection. **Before** writing `hooks.json`, call the new prune on `hooksObj` for the `Stop` event.
- **Add `pruneHookCommand(hooks, event, command)`** — a helper mirroring `injectHookEvent`'s shape: filter the event's entries to drop any whose `hooks[].command === command`; if the event array becomes empty, `delete hooks[event]`; otherwise reassign. Mutates in place, total/never-throw on a malformed shape. Reuse the existing `HookEntry` type.
- **Claude re-init prune:** in `createClaudeConfiguration`'s merge branch (assets.ts:258–274), after parsing `existingSettings` and before (or after) `mergeHooksSettings`, call `pruneHookCommand(existingSettings.hooks, CAPTURE_END_EVENT_CLAUDE, CAPTURE_DERIVE_COMMAND)` so a pre-existing derive hook is removed. Guard for `existingSettings.hooks` being absent/non-object. The merged result is then written as today.
- Keep the constants `CAPTURE_DERIVE_COMMAND`, `CAPTURE_END_EVENT_CLAUDE`, `CAPTURE_END_EVENT_CODEX` — the prune targets them. Update their JSDoc to "(legacy) pruned on re-init" rather than "installed".
- **`.ana/.gitignore` generator (assets.ts:96–102): NO change.** It must continue to NOT list `provenance/`. This is a "do not regress" requirement — the regression test below enforces it.
**Pattern to follow:** `injectHookEvent` (assets.ts:701–708) for the prune helper's shape and the dedup-by-command idiom. The existing merge branch structure (258–274) for placement.
**Why:** Exactly one capture hook should exist (AC4); a stale derive hook on an upgraded install must be removed mechanically, not left to chance (Verified-over-trusted). `provenance/` must stay tracked or cross-machine assembly breaks.

### packages/cli/templates/.codex/hooks.json (modify)
**What changes:** Remove the entire `"Stop"` block; leave only the `"SessionStart"` entry with command `ana _capture`.
**Pattern to follow:** The current file's `SessionStart` block stays verbatim; only the `Stop` block is deleted.
**Why:** Fresh Codex installs must not get the derive hook (it is a runtime no-op and a stale concept).

## Acceptance Criteria

- [ ] A fresh `ana init` installs exactly one Claude capture hook: `SessionStart` → `ana _capture`, with no `SessionEnd` entry.
- [ ] A fresh `ana init` installs exactly one Codex capture hook: `SessionStart` → `ana _capture`, with no `Stop` entry.
- [ ] Re-init on a `.claude/settings.json` that already contains `SessionEnd` → `ana _capture --derive` removes that entry; a co-located user-authored `SessionEnd` hook is preserved; an all-derive `SessionEnd` key is removed entirely.
- [ ] Re-init on a `.codex/hooks.json` that already contains `Stop` → `ana _capture --derive` removes that entry, preserving any user-authored `Stop` hook.
- [ ] `templates/.codex/hooks.json` contains no `Stop`/`--derive` entry (structural/enforcement test).
- [ ] The generated `.ana/.gitignore` contains no `provenance` entry (regression test).
- [ ] The SessionStart `ana _capture` install is unchanged (still present, dedup-safe).
- [ ] `pnpm run build` succeeds; `pnpm vitest run` passes with test count not decreased.

## Testing Strategy

- **Unit (`tests/commands/init/assets-capture-hooks.test.ts`):** rewrite/extend to the single-hook + prune model.
  - Fresh Claude: assert `settings.json.hooks.SessionStart` has the `ana _capture` entry and `settings.json.hooks.SessionEnd` is undefined.
  - Fresh Codex: assert `hooks.json.SessionStart` present, `hooks.json.Stop` undefined.
  - Re-init Claude prune: seed `settings.json` with a `SessionEnd` containing both the derive hook and a user hook (`my-own-cleanup.sh`); run the Claude config step; assert the derive entry is gone, the user hook remains, `SessionStart` present. Seed a second case where `SessionEnd` holds only the derive hook → assert the `SessionEnd` key is removed.
  - Re-init Codex prune: seed `hooks.json` with a `Stop` derive hook + a user `Stop` hook; assert the derive entry is pruned and the user hook preserved.
  - Enforcement: read `templates/.codex/hooks.json` and assert no entry command contains `--derive` and there is no `Stop` key.
- **Regression (`.gitignore`):** run the `.ana` scaffold step (or call the generator path) and read the produced `.ana/.gitignore`; assert it does NOT contain the substring `provenance`. Co-locate with the init asset tests or the existing `.gitignore`/scaffold test if one exists.
- **Edge cases:** re-init on a `settings.json` with NO `SessionEnd` key (prune is a no-op, no throw); malformed `hooks` object (prune degrades, no throw); a `SessionEnd` entry whose `hooks` array is missing/empty (skipped cleanly).

## Dependencies

Phase 1 merged (the `--derive` no-op tolerance makes a not-yet-pruned derive hook harmless). Independent of Phase 2.

## Constraints

- Both platforms must be handled identically in spirit (Claude `SessionEnd`, Codex `Stop`).
- The prune must remove ONLY the exact `ana _capture --derive` command — never a user-authored hook, even one under the same event.
- Re-init refreshes `.ana/.gitignore` wholesale; the only requirement is that the generator never lists `provenance/`. No allowlist/denylist logic — just absence, locked by test.
- Total/never-throw posture in the prune helper — a malformed settings shape degrades, never crashes init.
- Test count must not decrease.

## Gotchas

- **PR #291 deleted the prune path** — there is no existing flip-off prune to mirror; this is net-new (the install comments at assets.ts:213–216 and 789–791 explicitly say "no flip-off prune"). Update those comments — they will be stale once the prune exists.
- **The template settings.json is `{ "hooks": {} }`** — Claude hooks are injected programmatically via `injectCaptureHook`, not stored statically. So removing the Claude derive hook is a code change in `injectCaptureHook`, not a template edit. Codex IS template-stored (`templates/.codex/hooks.json`), so that one is a template edit.
- **Don't delete the legacy constants** (`CAPTURE_DERIVE_COMMAND` etc.) — the prune targets them. Removing them breaks the prune.
- **Empty-event cleanup:** after pruning, an event key left with an empty array should be deleted, not left as `"SessionEnd": []` — keep the settings file clean and avoid a dangling event that confuses future merges.
- **`.gitignore` is generated, not a template** — the regression test must assert the GENERATED output, not a template file (there is no `provenance/` line to remove; the test guards against a future addition).

## Build Brief

### Rules That Apply
- `.js` on relative imports; `node:` on built-ins; `import type` separate; named exports; explicit return types + JSDoc on exported functions.
- Total/never-throw for the prune helper — degrade on malformed shape.
- Tests: assert exact structure (`toBeUndefined()` on the removed event, exact surviving command strings); cover the no-derive-present no-op path; source-content assertions are acceptable here as enforcement tests (template/structural invariants), per testing-standards.

### Pattern Extracts

`injectHookEvent` — mirror its shape for `pruneHookCommand` (assets.ts:701–708):
```ts
function injectHookEvent(hooks: Record<string, unknown>, event: string, command: string): void {
  const entries = (hooks[event] as HookEntry[] | undefined) ?? [];
  const already = entries.some((e) => (e.hooks || []).some((h) => h.command === command));
  if (!already) {
    entries.push({ hooks: [{ type: 'command', command }] });
  }
  hooks[event] = entries;
}
```

Claude injector to trim (assets.ts:681–689) — delete line 688 + its comment:
```ts
function injectCaptureHook(settings: Record<string, unknown>): void {
  if (!settings['hooks'] || typeof settings['hooks'] !== 'object') {
    settings['hooks'] = {};
  }
  const hooks = settings['hooks'] as Record<string, unknown>;
  injectHookEvent(hooks, CAPTURE_HOOK_EVENT, CAPTURE_HOOK_COMMAND);
  // Phase 2: the SessionEnd derive hook, banking non-work sessions' counts.   <-- DELETE
  injectHookEvent(hooks, CAPTURE_END_EVENT_CLAUDE, CAPTURE_DERIVE_COMMAND);     <-- DELETE
}
```

Codex injector to trim (assets.ts:792–794) — delete the Stop inject, add a prune before write:
```ts
  injectHookEvent(hooksObj, CAPTURE_HOOK_EVENT, CAPTURE_HOOK_COMMAND);
  injectHookEvent(hooksObj, CAPTURE_END_EVENT_CODEX, CAPTURE_DERIVE_COMMAND);   <-- DELETE
  await fs.writeFile(hooksPath, JSON.stringify(hooksObj, null, 2), 'utf-8');
```

`.ana/.gitignore` generator (assets.ts:96–102) — leave AS IS; the test guards it:
```ts
  const gitignoreContent = `# Anatomia runtime state — local to each developer
state/
worktrees/
# Raw test-capture logs — scratch; deleted after the count + sha are sealed into the compact build_report.md marker
plans/active/*/.captures/
`;
```

### Proof Context
Run `ana proof context src/commands/init/assets.ts templates/.codex/hooks.json`. Curate the top findings into the build report. The structural analog is the completed `session-capture` work (`spec-2.md` + its verify reports) — it installed these hooks; this phase removes the derive half. State if `ana proof context` returns no active findings.

### Checkpoint Commands
- After assets.ts + template: `(cd packages/cli && pnpm vitest run tests/commands/init/assets-capture-hooks.test.ts)` — Expected: single-hook + prune tests pass.
- After all changes: `(cd packages/cli && pnpm run build)` then `pnpm run test -- --run` — Expected: full suite green, count ≥ Phase-2 total.
- Lint: `pnpm run lint`.

### Build Baseline
Run `pnpm run test -- --run` at the start of this phase (after Phases 1–2 merged) and record the exact count. After build: expect that count + the new single-hook/prune/gitignore tests; **no decrease**. Regression focus: `tests/commands/init/*` (hook install + merge + scaffold), and any test asserting the old derive-hook install (those expectations invert — derive must now be absent/pruned).
