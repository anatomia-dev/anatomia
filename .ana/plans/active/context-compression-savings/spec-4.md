# Spec: D — Config flag `captureMetrics: "on" | "off"`

**Created by:** AnaPlan
**Date:** 2026-06-06
**Scope:** .ana/plans/active/context-compression-savings/scope.md

## ⛔ BUILD-GATED — read first

**Do not build this spec until `retire-capture-self-arming` (Scope 1) is merged to `main`.** Spec D edits the exact three functions Scope 1 modifies to add its `captureGate` flag — `anaJsonSchema.ts`'s config object, `createAnaJson`, and `preserveUserState`. Building D first means threading the flag through arming machinery Scope 1 is deleting, plus a near-certain merge conflict. **Build is the gate; planning now is safe** because D mirrors the *stable* `mergeStrategy` config pattern (and Scope 1's `captureGate` sibling), not Scope 1's exact final text. Specs A, B, and C-core have **no** Scope 1 dependency and build first.

When you build: open Scope 1's merged `captureGate` and add `captureMetrics` as its sibling in the same three places, same style, **inverse default** (`captureGate` is `on`; `captureMetrics` is `off`).

## Approach

A single top-level `ana.json` enum flag, `captureMetrics: "on" | "off"`, declared in the schema (typed, not merely `.passthrough()`-tolerated), written **`off`** by `ana init`, and **preserved** across re-init — the exact end-to-end path `mergeStrategy` follows. **Absent = off** (brick-proof, zero-surprise): an old config without the key, or any non-`"on"` value, means off.

C-core already reads the flag raw with `absent = off` and is fully functional without D. D's job is to make the flag **typed, discoverable, and written-by-default** so customers who opt in get a validated key and re-init never drops it — closing the `.passthrough()`-masking gap (an undeclared key would survive silently but be invisible and unvalidated).

**Three touch points, mirroring `mergeStrategy`:**

1. **Schema** (`anaJsonSchema.ts`, ~line 99, beside `mergeStrategy`): declare
   ```ts
   captureMetrics: z.enum(['on', 'off']).optional().catch(undefined),
   ```
   Optional + `.catch(undefined)` so a malformed value degrades to absent (= off), never throws. Place it next to `mergeStrategy`/`captureGate`.

2. **Init-write** (`createAnaJson`, `state.ts`, the `anaConfig` literal ~lines 556–571): add `captureMetrics: 'off'` so every fresh `ana init` writes the key explicitly off. (Scope 1 writes `captureGate: 'on'` in the same literal — add `captureMetrics: 'off'` adjacent.)

3. **Re-init preserve** (`preserveUserState`, `state.ts`, ~line 725): the merge already spreads `...parsed.data`, so a user's existing `captureMetrics` survives automatically once it is in the typed schema (step 1). **Verify** this — confirm the field is not clobbered by the mechanical-field overrides (it is not in the override list: `anaVersion`, `lastScanAt`, `name`, `language`, `framework`, `packageManager`). No new override line is needed; the `...parsed.data` spread carries it. An **old config without the key** parses to `captureMetrics: undefined` (= off) — correct brick-proof behavior; do not force it to `'off'` on re-init (that would silently flip absent→explicit, which is fine semantically but unnecessary; match how `mergeStrategy`/`captureGate` handle absence).

**Do not change C-core's reader.** C-core reads `captureMetrics === 'on'` raw from ana.json. After D, the value is schema-validated on init/re-init but the runtime read is unchanged. The two are consistent: raw `'on'` and typed `'on'` are the same string.

## Output Mockups

Fresh `ana init` writes (excerpt of `.ana/ana.json`):
```json
{
  "mergeStrategy": "merge",
  "captureGate": "on",       // from Scope 1
  "captureMetrics": "off",   // this spec — off by default
  "branchPrefix": "feature/",
  "custom": {}
}
```

Re-init on a customer who opted in (`"captureMetrics": "on"`): the value is preserved. Re-init on an old config without the key: stays absent (= off), no error.

## File Changes

> Machine-readable `file_changes` is in contract.yaml. Prose context below.

### packages/cli/src/commands/init/anaJsonSchema.ts (modify)
**What changes:** Add `captureMetrics: z.enum(['on', 'off']).optional().catch(undefined)` to the config object, beside `mergeStrategy` (and Scope 1's `captureGate`).
**Pattern to follow:** `mergeStrategy: z.enum(['merge', 'squash', 'rebase']).optional().catch(undefined)` (lines 99–102).
**Why:** `.passthrough()` would tolerate the key silently but leave it unvalidated and undiscoverable. Declaring it typed closes the masking gap (AC-C7).

### packages/cli/src/commands/init/state.ts (modify — `createAnaJson`)
**What changes:** Add `captureMetrics: 'off'` to the `anaConfig` literal returned by `createAnaJson`.
**Pattern to follow:** The adjacent literal keys (`branchPrefix: 'feature/'`, `mergeStrategy` if Scope 1 added it there) ~lines 556–571.
**Why:** Every fresh install gets the key written explicitly off (AC-C7).

### packages/cli/src/commands/init/state.ts (modify — `preserveUserState`)
**What changes:** Confirm (and test) that an existing `captureMetrics` survives re-init via the `...parsed.data` spread and is not in the mechanical-override list. No new override line expected; add a test proving preservation.
**Pattern to follow:** How `mergeStrategy`/`branchPrefix` survive (~lines 725–735).
**Why:** Re-init must never silently drop an opted-in customer's flag (AC-C7).

## Acceptance Criteria

- [ ] **AC-C7:** A top-level `ana.json` enum flag (`captureMetrics: "on"|"off"`) is declared in the schema (typed `z.enum`, not merely `.passthrough()`-tolerated), written **`off`** by `ana init`, and preserved by `preserveUserState`. **Absent = off.**
- [ ] A malformed `captureMetrics` value degrades to absent (= off) via `.catch(undefined)`, never throws.
- [ ] Re-init preserves an existing `captureMetrics: "on"`; re-init on an old config without the key leaves it absent (= off) with no error.
- [ ] C-core's runtime reader is unchanged and consistent with the typed value.
- [ ] `pnpm run build`, the `packages/cli` test suite, lint, typecheck pass; total test count does not decrease.

## Testing Strategy

- **Unit (schema):** `captureMetrics: 'on'` and `'off'` parse; a malformed value (`'yes'`, `true`, `5`) degrades to `undefined` (not a throw); absent key parses to `undefined`.
- **Unit (`createAnaJson`):** a fresh config includes `captureMetrics: 'off'`.
- **Unit (`preserveUserState`):** existing `'on'` survives re-init; existing `'off'` survives; old config without the key → absent after re-init; the field is not overwritten by mechanical-field refresh.
- **Edge cases:** ana.json with `captureMetrics` AND unknown passthrough keys both survive; re-init when the old config is malformed JSON falls back to the fresh `'off'`.

## Dependencies

- **External (hard):** `retire-capture-self-arming` merged to `main`. Do not build before then.
- Spec C-core merged (the reader + recorder the flag governs).

## Constraints

- **Mirror Scope 1's `captureGate` exactly** — same three functions, same style, inverse default (`off`). Do not invent a different config mechanism (no hand-rolled record key, no `custom.*` nesting).
- **Absent = off** is the contract — never default to on, never throw on a bad value.
- **Backward compatible** — old configs without the key keep working (off).

## Gotchas

- **Merge-conflict zone.** These three functions are exactly what Scope 1 edits. Build only after Scope 1 lands, and add `captureMetrics` *beside* the merged `captureGate`, not in a separate edit that races it.
- **Don't add a `preserveUserState` override line.** `captureMetrics` must ride the `...parsed.data` spread (preserved), not the mechanical-override list (refreshed). Adding it to the override list would reset customer opt-ins on re-init.
- **`.catch(undefined)`, not `.default('off')`** on the schema — absence must stay absence (= off) so a flag-off proof entry and a no-key config are indistinguishable from today's. (Init writes `'off'` explicitly; the schema does not need a default.)
- **The dogfood flag is already on** (set in C-core's root `.ana/ana.json`). After D + Scope 1 land, confirm re-init preserves our `"on"` — there is a preservation test for exactly this.

## Build Brief

### Rules That Apply
- `.js` imports, `node:` builtins, `import type` separate, named exports, explicit return types + JSDoc on exports.
- Zod schema conventions already in `anaJsonSchema.ts`: `.optional().catch(...)` for fault-tolerant fields (the file's whole point is surviving malformed/partial configs via `.passthrough()` + per-field `.catch`).
- Test git-repo fixtures: `git init -b main`. Assert specific parsed values.

### Pattern Extracts

Schema sibling (`anaJsonSchema.ts:99–102`):
```ts
mergeStrategy: z
  .enum(['merge', 'squash', 'rebase'])
  .optional()
  .catch(undefined),
// add beside it:
captureMetrics: z.enum(['on', 'off']).optional().catch(undefined),
```

Init-write literal (`state.ts:556–571`):
```ts
const anaConfig: Record<string, unknown> = {
  …
  artifactBranch: detectArtifactBranch(result),
  branchPrefix: 'feature/',
  // captureGate: 'on',      // Scope 1
  captureMetrics: 'off',     // this spec
  lastScanAt: result.overview.scannedAt,
  custom: {},
};
```

Preserve via spread (`state.ts:727–735`) — `captureMetrics` is carried by `...parsed.data`, NOT added to the override block:
```ts
const merged = {
  ...parsed.data,                       // ← captureMetrics rides here
  anaVersion: newAnaConfig['anaVersion'],
  lastScanAt: newAnaConfig['lastScanAt'],
  name: newAnaConfig['name'],
  language: newAnaConfig['language'],
  framework: newAnaConfig['framework'],
  packageManager: newAnaConfig['packageManager'],
};
```

### Proof Context
Run `ana proof context packages/cli/src/commands/init/anaJsonSchema.ts packages/cli/src/commands/init/state.ts`. **Also read Scope 1's merged diff** for `captureGate` and place `captureMetrics` beside it. Prioritize any blocker/risk findings on `state.ts` (init is load-bearing and idempotent).

### Checkpoint Commands
- After schema + state edits: `(cd 'packages/cli' && pnpm vitest run anaJsonSchema)` and `(cd 'packages/cli' && pnpm vitest run state)` (or the init/preserve test files) — Expected: schema + preserve tests pass.
- After all changes: `pnpm run test -- --run` — Expected: baseline + new pass.
- Lint: `pnpm run lint`. Build: `pnpm run build`.

### Build Baseline
- Current tests at plan time: **3421** (139 files); will be higher after Specs A+B+C-core **and** after Scope 1 merges. Re-record at build start.
- Command used: `pnpm run test -- --run`
- After build: expected prior + new (schema parse, init-write, preserve).
- Regression focus: `state.ts` (re-init preservation — existing user fields must survive); `anaJsonSchema.ts` (no existing field's parsing changes).
