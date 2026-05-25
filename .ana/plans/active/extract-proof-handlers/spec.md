# Spec: Extract Proof Command Handlers

**Created by:** AnaPlan
**Date:** 2026-05-25
**Scope:** .ana/plans/active/extract-proof-handlers/scope.md

## Approach

Mechanical extraction refactor. Move 8 inline `.action(async () => { ... })` handlers out of `registerProofCommand` into standalone `async function handleX(...)` functions in the same file. The registration function becomes ~75 lines of command declarations with thin arrow-function wrappers.

**Key decisions:**

- **`parentJson` as a separate parameter.** The 7 subcommand handlers each receive `parentJson: boolean` as their last parameter. It's not a Commander-parsed option — it's an internal forwarding value from `proofCommand.opts()['json']`. The root handler (`handleProofList`) does NOT receive `parentJson` — it IS the parent command.
- **Handlers placed above `registerProofCommand`.** All existing module-level helpers (`createExitError`, `validateSurface`, `formatListTable`, etc.) are defined above the registration function. The extracted handlers follow the same placement — after the module-level helpers, before `registerProofCommand`.
- **Arrow-function wrappers, not references.** Each `.action()` gets `.action(async (...args) => handleX(...args, parentJson))` — not `.action(handleX)`. The wrapper resolves `parentJson` from `proofCommand.opts()['json']` and forwards it.
- **Zero internal refactoring.** Handler bodies move verbatim. Don't clean up, simplify, or restructure the logic inside any handler. The only change is replacing `const parentOpts = proofCommand.opts(); const useJson = options.json || parentOpts['json'];` with `const useJson = options.json || parentJson;` — removing the closure dependency.
- **JSDoc on each handler.** Brief description + `@param` tags. Non-exported, but the coding standards favor documentation.

**Closure dependencies resolved:**

Every handler currently reads `proofCommand.opts()['json']` to check the parent `--json` flag. After extraction, the thin wrapper resolves this and passes `parentJson: boolean`. No other closure dependencies exist — all other references are to module-level functions, constants, and imports.

## Output Mockups

No user-facing output changes. The CLI behaves identically before and after. This is purely a code organization refactor.

## File Changes

### packages/cli/src/commands/proof.ts (modify)

**What changes:** Extract 8 inline action handlers into named functions. `registerProofCommand` shrinks from 1687 lines (646–2332) to ~75 lines of command registration.

**Pattern to follow:** The existing module-level functions in the same file — `createExitError` (line 135), `validateSurface` (line 84), `formatListTable` (line 593). Same style: `async function handleX(...)`, with JSDoc.

**Why:** A 1695-line function body is unnavigable. A stranger adding a 9th subcommand can't find where to add it without scrolling through 8 existing handlers. After extraction, `registerProofCommand` reads like a table of contents.

**The 8 handlers to extract:**

| Handler function | Current location | Arguments | Notes |
|---|---|---|---|
| `handleProofList` | lines 651–718 | `(slug: string \| undefined, options: { json?: boolean })` | Root handler. No `parentJson` — it IS the parent. |
| `handleProofContext` | lines 728–758 | `(files: string[], options: { json?: boolean }, parentJson: boolean)` | Shortest handler (~30 lines). |
| `handleProofClose` | lines 769–1005 | `(ids: string[], options: { reason?: string; dryRun?: boolean; json?: boolean }, parentJson: boolean)` | Uses `createExitError`, `isWorktreeDirectory`, `pullBeforeRead`, `commitAndPushProofChanges`. |
| `handleProofPromote` | lines 1018–1335 | `(ids: string[], options: { skill?: string; text?: string; section?: string; force?: boolean; json?: boolean }, parentJson: boolean)` | Uses `globSync`, `validateSkillName`. |
| `handleProofStrengthen` | lines 1347–1592 | `(ids: string[], options: { skill?: string; reason?: string; force?: boolean; json?: boolean }, parentJson: boolean)` | Similar to promote — uses `globSync`, `validateSkillName`, `commitAndPushProofChanges`. |
| `handleProofAudit` | lines 1607–2148 | `(options: { json?: boolean; full?: boolean; severity?: string; entry?: string; matrix?: boolean; new?: boolean; since?: string; surface?: string }, parentJson: boolean)` | Largest handler (541 lines). Has internal branching for many flags. Move as-is — don't refactor internals. |
| `handleProofHealth` | lines 2155–2218 | `(options: { json?: boolean; surface?: string }, parentJson: boolean)` | Uses `validateSurface`, `computeChainHealth`, `generateDashboard`. |
| `handleProofStale` | lines 2226–2328 | `(options: { after?: string; minConfidence?: string; json?: boolean }, parentJson: boolean)` | Uses `computeStaleness`. |

**What changes inside each handler body:**

Replace this pattern (appears in 7 of 8 handlers):
```
const parentOpts = proofCommand.opts();
const useJson = options.json || parentOpts['json'];
```
With:
```
const useJson = options.json || parentJson;
```

The root handler (`handleProofList`) has no `parentOpts` — it reads `options.json` directly. No change needed to its json logic.

Everything else in each handler body stays verbatim — `createExitError` calls, `console.log`/`console.error`, `process.exit(1)`, early `return` statements after `exitError(...)` calls, the `useJson = options.json || parentJson` derivation.

**What the thin wrappers look like:**

For subcommands (7 handlers):
```typescript
.action(async (args..., options) => {
  const parentJson = !!proofCommand.opts()['json'];
  await handleProofX(args..., options, parentJson);
})
```

For the root command (1 handler):
```typescript
.action(async (slug, options) => handleProofList(slug, options))
```

## Acceptance Criteria

- [ ] AC1: `registerProofCommand` is under 150 lines. It contains only command registration, option/argument declarations, and thin action wrappers.
- [ ] AC2: 8 non-exported handler functions exist as standalone named functions: `handleProofList`, `handleProofContext`, `handleProofClose`, `handleProofPromote`, `handleProofStrengthen`, `handleProofAudit`, `handleProofHealth`, `handleProofStale`.
- [ ] AC3: Each subcommand handler (7 of 8) receives `parentJson: boolean` instead of closing over `proofCommand`. The root handler (`handleProofList`) does not receive `parentJson`.
- [ ] AC4: Zero behavior change — all existing proof tests pass without modification.
- [ ] AC5: The two exports from proof.ts (`registerProofCommand`, `formatHumanReadable`) remain unchanged in signature and behavior.
- [ ] AC6: `pnpm run test -- --run` passes.
- [ ] AC7: Build and lint pass.

## Testing Strategy

- **No new tests.** This is a zero-behavior-change refactor. The existing 284 proof tests via `execSync` cover all handler behavior. They test input→output through the built binary — internal function structure is invisible.
- **Regression focus:** Run `(cd packages/cli && pnpm vitest run)` after the extraction. All 2921 tests must pass, 2 skipped. Pay special attention to proof test output — any handler wiring error (wrong args, missing parentJson) will show up as a test failure.
- **No test file imports handler functions.** Two test files import `formatHumanReadable` from proof.ts — that's a module-level export, unaffected.

## Dependencies

None. This is a self-contained refactor to one file.

## Constraints

- Zero behavior change. The compiled CLI output must be identical.
- No new exports. All 8 handler functions are file-private (no `export` keyword).
- No new imports. All dependencies are already imported at the top of proof.ts.
- No file splitting. Everything stays in proof.ts.

## Gotchas

- **Don't pass `handleX` by reference to `.action()`.** Use `.action(async (...) => handleX(...))`. Arrow wrappers are needed so `parentJson` can be resolved from `proofCommand.opts()` at call time, and to preserve Commander's expected callback shape.
- **The audit handler is 541 lines.** It has complex internal branching for `--matrix`, `--new`, `--since`, `--full`, `--severity`, `--entry`, `--surface`. Move the entire body as-is. Do not refactor, simplify, or restructure its internals.
- **Preserve `return;` statements after `exitError(...)` calls.** These provide TypeScript type narrowing even though `exitError` returns `never`. Removing them may cause type errors.
- **Preserve `useJson = options.json || parentJson` exactly.** Each handler ORs its own `options.json` with `parentJson`. Both sources matter — a user might pass `--json` to the subcommand or to the parent `proof` command.
- **`handleProofList` is different from the other 7.** It's the root command's action, not a subcommand. It receives `(slug, options)` — no `parentJson`. Its json logic uses `options.json` directly. Don't add `parentJson` to it.
- **Module-level dependencies used by handlers:** `EMPTY_AUDIT_MATRIX`, `SEVERITY_ORDER`, `BOX`, `isWorktreeDirectory` (imported), `validateSkillName` (imported), `globSync` (imported), `createExitError`, `validateSurface`, `formatHealthDisplay`, `formatListTable`, `formatContextResult`, `formatHumanReadable`, `columnWidth`, `getStatusIcon`, `formatLocalDate`, `MIN_ENTRIES_FOR_TREND`, `findProjectRoot`, `findFindingById`, `formatRelativeTime`. All module-level — no issue.
- **`// @ana AXXX` assertion tags in handler bodies.** Preserve these exactly where they are. They're proof chain anchors.

## Build Brief

### Rules That Apply
- All local imports use `.js` extensions. No new imports needed for this change, but don't accidentally remove the extension from existing ones.
- Use `import type` for type-only imports, separate from value imports.
- Prefer early returns over nested conditionals — the existing handlers already follow this.
- Explicit return types on exported functions. The extracted handlers are non-exported, so return type inference is acceptable, but `Promise<void>` is trivial to add.

### Pattern Extracts

The existing module-level function style to follow (proof.ts lines 84–99):

```typescript
function validateSurface(projectRoot: string, surfaceName: string): { valid: boolean; available: string[]; configured: boolean } {
  try {
    const anaJsonPath = path.join(projectRoot, '.ana', 'ana.json');
    if (!fs.existsSync(anaJsonPath)) {
      return { valid: false, available: [], configured: false };
    }
    const anaContent = JSON.parse(fs.readFileSync(anaJsonPath, 'utf-8'));
    const surfaces = anaContent.surfaces as Record<string, unknown> | undefined;
    if (!surfaces || Object.keys(surfaces).length === 0) {
      return { valid: false, available: [], configured: false };
    }
    const available = Object.keys(surfaces);
    return { valid: available.includes(surfaceName), available, configured: true };
  } catch {
    return { valid: false, available: [], configured: false };
  }
}
```

The `parentJson` resolution pattern in the thin wrapper (what each subcommand wrapper looks like):

```typescript
// Current inline pattern (7 handlers):
const parentOpts = proofCommand.opts();
const useJson = options.json || parentOpts['json'];

// After: wrapper resolves parentJson, handler receives it
.action(async (ids, options) => {
  const parentJson = !!proofCommand.opts()['json'];
  await handleProofClose(ids, options, parentJson);
})
```

### Proof Context
- **(audit-matrix-orientation-C5)** Duplicated zero-entry JSON payload — not related to this extraction. Existing code, move as-is.
- **(learn-session-memory-C1)** `commitAndPushProofChanges` and `pullBeforeRead` exported from proof.ts instead of git-operations — pre-existing concern, unrelated to this refactor. These are imports, not closures.
- **(cli-polish-C3)** Hot spots displayNames not truncated — inside audit handler. Move as-is, don't fix.

No active proof findings are affected by this extraction. All findings reference module-level code or handler internals that move verbatim.

### Checkpoint Commands
- After extracting all handlers: `(cd packages/cli && pnpm vitest run)` — Expected: 2921 passed, 2 skipped
- After all changes: `pnpm run test -- --run` — Expected: all tasks pass (4 packages)
- Lint: `pnpm run lint`
- Build: `pnpm run build`

### Build Baseline
- Current tests: 2921 passed, 2 skipped (124 test files)
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: 2921 passed, 2 skipped (124 test files) — zero new tests
- Regression focus: `tests/commands/proof.test.ts` (284 tests via execSync)
