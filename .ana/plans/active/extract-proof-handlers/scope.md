# Scope: Extract Proof Command Handlers

**Created by:** Ana
**Date:** 2026-05-24

## Intent

`registerProofCommand` is 1695 lines — a single function containing 8 inline action handlers for the proof subcommands. A developer navigating proof.ts has to scroll through the entire function to find the audit handler at line 1607 or the stale handler at line 2226. The function is structurally correct — each handler is self-contained — but it violates "finished means a stranger can extend it." A stranger adding a new proof subcommand would need to understand the full 1695-line function body to know where to add it.

The disease: Commander's `.action(async () => { ... })` API encourages inline handlers. Each new subcommand added another 100-500 lines inside the same closure. After 8 subcommands, the function is unnavigable.

## Complexity Assessment

- **Kind:** chore
- **Size:** small — 1 file, extract 8 functions from inline closures to named functions, zero behavior change
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/proof.ts` — extract 8 handlers from `registerProofCommand` into standalone named functions in the same file
- **Blast radius:** Zero. The compiled CLI output is behaviorally identical. All 284 proof tests invoke the CLI via `execSync` on the built binary — they test input→output, not internal function structure. No test imports handler functions. No consumer imports handler functions. The only exports from proof.ts are `registerProofCommand` (index.ts) and `formatHumanReadable` (2 test files) — neither changes.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Extract each inline `.action(async () => { ... })` handler into a standalone async function in the same file. The registration in `registerProofCommand` becomes thin wrappers that call the extracted functions. No file split — everything stays in proof.ts.

The only closure dependency is `proofCommand.opts()` — each handler reads the parent `--json` flag. The extracted functions receive this as a `parentJson: boolean` parameter instead of closing over `proofCommand`.

**Before (1695 lines):**
```typescript
export function registerProofCommand(program: Command): void {
  const proofCommand = new Command('proof')
    .action(async (slug, options) => {
      // 77 lines of list/detail logic
    });
  
  const contextCommand = new Command('context')
    .action(async (files, options) => {
      // 32 lines
    });
  proofCommand.addCommand(contextCommand);
  
  // ... 6 more subcommands, each 100-500 lines inline
}
```

**After (~75 lines):**
```typescript
async function handleProofList(slug: string | undefined, options: { json?: boolean }): Promise<void> {
  // 77 lines — moved unchanged
}

async function handleProofContext(files: string[], options: { json?: boolean }, parentJson: boolean): Promise<void> {
  // 32 lines — moved unchanged, proofCommand.opts() replaced with parentJson parameter
}

// ... 6 more handler functions

export function registerProofCommand(program: Command): void {
  const proofCommand = new Command('proof')
    .action(async (slug, options) => handleProofList(slug, options));
  
  const contextCommand = new Command('context')
    .action(async (files, options) => {
      const parentJson = proofCommand.opts()['json'] as boolean | undefined;
      handleProofContext(files, options, !!parentJson);
    });
  proofCommand.addCommand(contextCommand);
  
  // ... 6 more, each a 3-line wrapper
}
```

The `proofCommand.opts()` call stays in the thin wrapper — the extracted function receives `parentJson` as a plain boolean. This eliminates the closure dependency entirely.

## Acceptance Criteria

- AC1: `registerProofCommand` is under 150 lines (was 1695). It contains only command registration, option/argument declarations, and thin action wrappers.
- AC2: 8 handler functions exist as standalone named functions: `handleProofList`, `handleProofContext`, `handleProofClose`, `handleProofPromote`, `handleProofStrengthen`, `handleProofAudit`, `handleProofHealth`, `handleProofStale`.
- AC3: Each handler function receives `parentJson: boolean` instead of closing over `proofCommand`.
- AC4: Zero behavior change — all 284 proof tests pass without modification.
- AC5: The two exports from proof.ts (`registerProofCommand`, `formatHumanReadable`) remain unchanged in signature and behavior.
- AC6: `pnpm run test -- --run` passes.
- AC7: Build and lint pass.

## Edge Cases & Risks

**The root action handler.** The proof command's root `.action()` (list/detail view, line 651) receives `(slug, options)` directly — no `parentJson` needed because IT is the parent. This handler just becomes `handleProofList(slug, options)`.

**`createExitError` usage.** Several handlers use `createExitError()` (defined at proof.ts:135). This is a module-level function, not inside `registerProofCommand`. The extracted handlers can call it directly — no closure issue.

**`validateSurface` usage.** Same — module-level function at proof.ts:84. Callable from anywhere in the file.

**`formatHealthDisplay`, `formatListTable`, `formatContextResult`, `formatHumanReadable`, `columnWidth`.** All module-level functions. No closure dependency.

**Handler-specific imports.** Each handler uses imports already at the top of proof.ts (`fs`, `path`, `chalk`, `yaml`, proof chain types, proofSummary functions). No new imports needed — the file doesn't change, functions just move within it.

**Test stability.** All 284 tests use `execSync` to invoke the built CLI. They don't import handler functions. The extraction is completely invisible to the test suite. Zero test changes.

**Agent stability.** Agents invoke proof commands via CLI. No agent imports from proof.ts. Output format is unchanged. Zero agent impact.

## Rejected Approaches

**Splitting handlers into separate files.** Over-decomposition for 8 functions that share the same imports and module-level helpers. proof.ts would become a thin registration file that imports from 8 handler files — more indirection for no added clarity. The handlers belong in the same file as the command registration.

**Passing `proofCommand` as a parameter.** The handlers only need `opts()['json']` from it. Passing the entire Commander object creates an unnecessary coupling. A simple `parentJson: boolean` is cleaner.

**Making handlers methods on a class.** Class-based command handlers are a pattern in some CLIs but Commander's API is function-based. A class wrapper adds abstraction without value.

## Open Questions

None.

## Exploration Findings

### Patterns Discovered

- All 8 handlers follow the same pattern: read `proofCommand.opts()` for parent `--json`, find project root, read proof chain, branch on json/human output. The extraction is mechanical.
- Handler sizes: root 77, context 32, close 238, promote 319, strengthen 247, audit 541, health 63, stale 104. Total 1620 lines of handler logic + ~75 lines of registration boilerplate.
- No handler calls another handler. No shared mutable state between handlers. Each is completely self-contained.

### Constraints Discovered

- [VERIFIED] Only closure dependency is `proofCommand.opts()` for `--json` flag. Used by 7 of 8 handlers (root handler doesn't need it — it IS the parent).
- [VERIFIED] 284 tests use `execSync` — zero test file imports from proof.ts handler functions.
- [VERIFIED] 2 test files import `formatHumanReadable` from proof.ts — this is a module-level function, not inside `registerProofCommand`. Unaffected.
- [VERIFIED] index.ts imports only `registerProofCommand`. Signature unchanged.
- [VERIFIED] No agent template imports from proof.ts or parses handler output structurally.

### Test Infrastructure

- proof.test.ts: 284 tests via `execSync`. The extraction is invisible — if it builds, it passes.

## For AnaPlan

### Structural Analog

The `registerWorkCommand` in work.ts uses the same inline handler pattern but is smaller (~200 lines). The extraction pattern is the same: inline `.action()` → named function with explicit parameters.

### Relevant Code Paths

- `packages/cli/src/commands/proof.ts` lines 646-2341 — the entire `registerProofCommand` function
- Module-level functions that handlers call: `formatHumanReadable` (222), `formatHealthDisplay` (416), `formatListTable` (593), `formatContextResult` (2341), `createExitError` (135), `validateSurface` (84), `columnWidth` (62), `getStatusIcon` (199), `formatLocalDate` (38)

### Patterns to Follow

- Same function signature style as existing module-level functions in proof.ts
- `async function handleX(...)` — not exported, not arrow functions
- JSDoc on each handler with `@param` tags

### Known Gotchas

- The `audit` handler (541 lines) is the largest. It has internal branching for `--matrix`, `--new`, `--since`, `--full`, `--severity`, `--entry`, `--surface` flags. All of this moves as-is — don't refactor the internals, just extract the closure.
- The `promote` handler at line 1018 has a `try/catch` that calls `process.exit(1)` on failure. This stays as-is in the extracted function.
- Some handlers use `console.log` and `console.error` directly. This stays as-is — the CLI uses stdout/stderr directly, not a logger abstraction.

### Things to Investigate

- Whether the `parentJson` parameter should be part of each handler's options object (`{ ...options, parentJson }`) or a separate parameter. Separate parameter is cleaner — it's not a Commander-parsed option, it's an internal forwarding mechanism.
