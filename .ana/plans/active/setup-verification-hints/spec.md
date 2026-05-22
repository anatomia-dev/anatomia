# Spec: Setup Verification Hints

**Created by:** AnaPlan
**Date:** 2026-05-22
**Scope:** .ana/plans/active/setup-verification-hints/scope.md

## Approach

Two additive changes that work together to let the setup agent present verification hints during config confirmation:

**1. Scan enrichment — stack provenance.** Extend `detectFromDeps` to forward-capture the triggering npm package name alongside each display name (new optional `databasePkg`, `authPkg`, `paymentsPkg` fields on `DependencyDetectionResult`). Then add a pure `findStackProvenance` function in the same file that takes a census, the extended dep result, and the aiSdk display name, and determines which source root contributed each detection. When all detections came from the primary package (or for single-repo projects), provenance is `{}`. When a detection came from a non-primary root, it records `{ database: "packages/nodes-langchain" }`.

The provenance function checks `database`, `auth`, `payments`, and `aiSdk` — NOT `testing` (intentionally cross-package via rootDevDeps fallback) or `framework` (uses primaryDeps by construction).

For each field, the function checks whether the primary root's deps or devDeps contain the triggering package. If yes, no provenance entry. If no, it searches non-primary roots for the triggering package and records the first match's relative path. For `aiSdk`, since it's detected separately by `detectAiSdk` and `AI_SDK_PACKAGES` is an array of `[pkg, name]` tuples in the same file, the function filters entries matching the detected display name and checks roots for any of those packages.

**2. Setup template — verification-aware Step 2.** Two conditional blocks added to the Config Confirmation step:

- **Surface gap check.** After the surfaces block, cross-reference `monorepo.packages` against `surfaces` from scan.json. Flag packages with a `dev` script, 15+ source files, not already in surfaces, and not matching inlined non-product path patterns. Present up to 5, sorted by source file count descending. Include framework when available. If the developer confirms adding any, write them to ana.json with scoped commands.

- **Provenance notes.** When `stackProvenance` has entries, show an `ⓘ` note for each non-primary detection with the source path. Prompt correction without being alarming.

Both additions are silent when there's nothing to flag.

## Output Mockups

**Provenance in scan.json — common case (single-repo or all detections from primary):**
```json
{
  "stackProvenance": {}
}
```

**Provenance in scan.json — cross-package detection:**
```json
{
  "stackProvenance": {
    "database": "packages/nodes-langchain"
  }
}
```

**Setup Step 2 — surface gap check (when gaps found):**
```
  Surfaces:
    cli              (cd 'packages/cli' && pnpm vitest run)
    website          (cd 'website' && pnpm run test)

  Possible surfaces not yet tracked:
    packages/api         Express, 305 files, has dev/test/build
    packages/worker      —, 42 files, has dev/test
    + 3 more
```

**Setup Step 2 — provenance notes (when non-primary detections exist):**
```
  Stack                Supabase · Vitest · pnpm monorepo
    ⓘ Database (Supabase): detected from packages/nodes-langchain, not
      your primary package. Correct?
```

**Setup Step 2 — adding a surface after developer confirms:**
```json
{
  "surfaces": {
    "api": {
      "path": "packages/api",
      "language": "TypeScript",
      "framework": "Express",
      "commands": {
        "test": "(cd 'packages/api' && pnpm run test)",
        "build": "(cd 'packages/api' && pnpm run build)",
        "lint": "(cd 'packages/api' && pnpm run lint)",
        "dev": null
      }
    }
  }
}
```

## File Changes

### `src/engine/detectors/dependencies.ts` (modify)
**What changes:** Extend `DependencyDetectionResult` with optional `databasePkg`, `authPkg`, `paymentsPkg` fields. Extend each detection loop in `detectFromDeps` to capture the triggering package name alongside the display name (one extra assignment per loop, ~5 lines total). Add new exported `findStackProvenance` function (~40 lines) and exported `StackProvenance` type.
**Pattern to follow:** `detectFromDeps` in the same file — pure function, data in, structured result out.
**Why:** Without forward capture, recovering the triggering package name requires a fragile reverse lookup through maps with many-to-one collisions (4 packages → "PostgreSQL", 3 → "Stripe").

### `src/engine/types/engineResult.ts` (modify)
**What changes:** Import `StackProvenance` from dependencies.ts. Add `stackProvenance: StackProvenance` field to `EngineResult` interface (alongside `stack`). Add `stackProvenance: {}` to `createEmptyEngineResult()`.
**Pattern to follow:** Existing `stack` field at line 111. The cross-cutting checklist at lines 8-14 documents all locations that need updating.
**Why:** The field must exist in the type for TypeScript to enforce completeness in `createEmptyEngineResult`, and `createEmptyEngineResult` must initialize it for test fixtures.

### `src/engine/scan-engine.ts` (modify)
**What changes:** Import `findStackProvenance` from dependencies.ts. Call it after `detectAiSdk` (around line 787) with `census`, `depResult`, and the resolved `aiSdk` value. Add `stackProvenance` to the return object at line 985 alongside `stack`.
**Pattern to follow:** The existing flow: `depResult` assigned at line 663, `stack` assembled at 773, `detectAiSdk` at 787. Provenance goes after aiSdk is resolved but before non-Node enrichment (since non-Node aiSdk has no provenance — the function handles this by checking if aiSdk came from `detectAiSdk` vs `detectNonNodeAiSdk`).
**Why:** Provenance depends on both the dep result and the resolved aiSdk value, so it must run after both are available.

### `tests/engine/detectors/dependencies.test.ts` (modify)
**What changes:** Add import for `findStackProvenance`. Add new describe blocks testing: forward capture of `databasePkg`/`authPkg`/`paymentsPkg` in `detectFromDeps`, and `findStackProvenance` behavior (single-repo → empty, monorepo primary detection → empty, monorepo non-primary detection → populated, devDeps detection, aiSdk provenance, null dep fields skipped).
**Pattern to follow:** Existing `detectFromDeps` tests in the same file — synthetic dep maps as input, assertions on structured output. For provenance tests, create local `makeRoot`/`makeCensus` helpers following the pattern in `surfaces.test.ts` but minimal (only deps/devDeps/isPrimary/relativePath needed).
**Why:** Pure functions with synthetic inputs are the most reliable test pattern. The provenance function has specific edge cases (devDeps, null fields, single-repo) that require explicit test coverage.

### `tests/contract/analyzer-contract.test.ts` (modify)
**What changes:** Add `'stackProvenance'` to the `expectedKeys` array (line 148-183). The array must stay sorted in the same order as `createEmptyEngineResult` returns keys.
**Pattern to follow:** The existing list — one string per line, matching the key order in `createEmptyEngineResult`.
**Why:** This test enforces that every `EngineResult` field has a corresponding entry. Adding `stackProvenance` to `EngineResult` without updating this list fails CI.

### `templates/.claude/agents/ana-setup.md` (modify)
**What changes:** Add two conditional blocks inside Step 2 (Config Confirmation), after the existing surfaces block (line 151). First block: surface gap check with inlined exclusion patterns. Second block: provenance notes with `ⓘ` presentation. Both blocks are conditional — silent when nothing to flag. Also add instructions for writing surfaces to ana.json when developer confirms.
**Pattern to follow:** The existing conditional block `[If surfaces in ana.json:` at line 148 — same conditional presentation style, same indentation.
**Why:** The setup agent is an LLM following prose instructions. The surface gap criteria must be explicit and deterministic (not "decide if this looks like a surface"). The LLM cannot read code constants, so exclusion patterns must be inlined.

## Acceptance Criteria

- [ ] AC1: `DependencyDetectionResult` gains optional `databasePkg`, `authPkg`, `paymentsPkg` fields. `detectFromDeps` captures these alongside display names.
- [ ] AC2: scan.json contains a `stackProvenance` field. Empty `{}` for single-repo or all-primary detections. Populated for non-primary detections.
- [ ] AC3: `findStackProvenance` checks `database`, `auth`, `payments`, and `aiSdk`. NOT `testing` or `framework`.
- [ ] AC4: `findStackProvenance` signature: `(census: ProjectCensus, depResult: DependencyDetectionResult, aiSdk: string | null) => StackProvenance`. Pure function, no filesystem access.
- [ ] AC5: `findStackProvenance` checks BOTH `root.deps` AND `root.devDeps` for each source root.
- [ ] AC6: Single-repo projects always produce `stackProvenance: {}`. Non-Node aiSdk (from `detectNonNodeAiSdk`) produces no aiSdk provenance entry.
- [ ] AC7: Setup template Step 2 cross-references `monorepo.packages` against `surfaces`. Packages with `dev` script + 15+ source files + not in surfaces + not matching exclusion patterns shown as potential surfaces. Capped at 5, sorted by source file count descending.
- [ ] AC8: Setup template Step 2 shows `ⓘ` notes for non-primary detections from `stackProvenance`.
- [ ] AC9: When developer confirms adding a surface, setup agent writes to ana.json with scoped commands using `(cd '{path}' && {pm} run {script})` pattern. `dev: null`. Reads back to confirm.
- [ ] AC10: When no provenance flags and no surface gaps, Step 2 is identical to current flow.
- [ ] Tests pass with `pnpm run test -- --run`
- [ ] No build errors with `pnpm run build`
- [ ] `stackProvenance` added to `expectedKeys` in analyzer-contract.test.ts

## Testing Strategy

- **Unit tests (dependencies.test.ts):**
  - `detectFromDeps` forward capture: verify `databasePkg`, `authPkg`, `paymentsPkg` are set alongside display names. Verify they're null/undefined when no detection.
  - `findStackProvenance` single-repo: single root marked primary → `{}`.
  - `findStackProvenance` monorepo, primary detection: detection package in primary root's deps → `{}`.
  - `findStackProvenance` monorepo, non-primary detection: detection package only in non-primary root's deps → `{ database: "packages/other" }`.
  - `findStackProvenance` devDeps: detection package in a root's devDeps (not deps) → correctly attributed.
  - `findStackProvenance` aiSdk provenance: AI SDK package in non-primary root → `{ aiSdk: "packages/ai" }`.
  - `findStackProvenance` null dep fields: when `depResult.database` is null, no database provenance even if a root has database packages.
  - `findStackProvenance` aiSdk null: when aiSdk param is null, no aiSdk provenance entry.
- **Contract test (analyzer-contract.test.ts):** `stackProvenance` in expectedKeys list.
- **Edge cases:** Pattern-detected fields (depResult field null but stack field non-null) produce no provenance. Non-Node aiSdk produces no provenance. Multiple non-primary roots — first match wins.

## Dependencies

- `ProjectCensus` type from `src/engine/types/census.ts` (stable, no changes needed).
- `AI_SDK_PACKAGES` constant in `dependencies.ts` (file-local, accessible to `findStackProvenance`).

## Constraints

- Engine files have zero CLI dependencies — `findStackProvenance` is pure, no chalk/ora/fs.
- `StackProvenance` type must be exported from `dependencies.ts` and re-exported or imported by `engineResult.ts`.
- The setup template ships to ALL customers — changes must be conservative. False alerts on a simple single-repo project are unacceptable.
- `createEmptyEngineResult` must not use `as EngineResult` — the explicit return type enforces completeness.

## Gotchas

- **`AI_SDK_PACKAGES` has display name collisions** — 4 packages map to "Vercel AI", 2 to "LangChain". For aiSdk provenance, the function must filter AI_SDK_PACKAGES to all entries matching the detected display name, then check if ANY of those packages exist in a root's deps/devDeps. Don't use `.find()` — use `.filter()` then `.some()`.
- **Pattern-detected stack fields have no package provenance.** When `depResult.database` is null but `stack.database` is non-null (filled by pattern detection at scan-engine.ts:803-811), `findStackProvenance` must not create a database provenance entry. The function reads `depResult` fields (which have package info), not `stack` fields.
- **The provenance call site matters.** `findStackProvenance` needs the resolved `aiSdk` value. `detectAiSdk(allDeps)` runs at line 787 during stack construction. But non-Node aiSdk enrichment runs at line 834. The provenance function should be called with the Node-detected aiSdk only (from `detectAiSdk`), because non-Node aiSdk uses language-specific deps that aren't in `SourceRoot.deps/devDeps`. Capture `const nodeAiSdk = detectAiSdk(allDeps)` separately, use it in both the stack construction and the provenance call.
- **`expectedKeys` order in analyzer-contract.test.ts** — the list is not alphabetically sorted. It follows the order of `createEmptyEngineResult`. Add `stackProvenance` right after `stack` to match insertion order.
- **Template change is a product change** — `templates/.claude/agents/ana-setup.md` ships to all customers. The dogfood file at `.claude/agents/ana-setup.md` is separate and NOT modified in this scope.
- **Surface gap exclusion patterns must be inlined** — the LLM executing the template cannot read code constants. Inline the non-product path segments (`examples`, `templates`, `fixtures`, `e2e`, `test`, `tests`, `testing`, `playground`, `sandbox`, `demos`, `starters`, `samples`, `boilerplate`, `references`) and infra patterns (`tsconfig`, `eslint-config`, `prettier-config`, `tailwind-config`, `config-typescript`, `biome-config`) directly in the template prose.
- **Surface commands use `(cd '{path}' && {pm} run {script})` not `(cd '{path}' && {pm} {script})`** — note the `run` keyword. For npm it's `npm run`, for pnpm it's `pnpm run`, for yarn it's `yarn run`. All use `run`.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { findStackProvenance } from './detectors/dependencies.js'`
- Use `import type` for type-only imports, separate from value imports
- Engine files (`src/engine/`) have zero CLI dependencies — no chalk, no ora, no fs
- Use `| null` for fields checked and found empty. `?:` for unchecked optional fields
- Prefer early returns over nested conditionals
- Explicit return types on all exported functions
- Exported functions require `@param` and `@returns` JSDoc tags
- `pnpm run test -- --run` to avoid watch mode hang

### Pattern Extracts

**Forward capture pattern — existing detection loop (dependencies.ts:307-309):**
```typescript
for (const [pkg, name] of Object.entries(DATABASE_PACKAGES)) {
    if (allDeps[pkg]) { result.database = name; break; }
  }
```
Each loop captures `pkg` and `name` but only stores `name`. Extend to also store `pkg` in the new `databasePkg` field:
```
if (allDeps[pkg]) { result.database = name; result.databasePkg = pkg; break; }
```

**Census SourceRoot type (census.ts:14-24):**
```typescript
export interface SourceRoot {
  absolutePath: string;
  relativePath: string;
  packageName: string | null;
  fileCount: number;
  isPrimary: boolean;
  deps: Record<string, string>;
  devDeps: Record<string, string>;
  hasBin: boolean;
  scripts: string[];
}
```

**Test helper pattern (surfaces.test.ts:22-34):**
```typescript
function makeRoot(overrides: Partial<SourceRoot> & { relativePath: string }): SourceRoot {
  return {
    absolutePath: `/tmp/project/${overrides.relativePath}`,
    relativePath: overrides.relativePath,
    packageName: overrides.packageName ?? overrides.relativePath.split('/').pop() ?? null,
    fileCount: overrides.fileCount ?? 100,
    isPrimary: overrides.isPrimary ?? false,
    deps: overrides.deps ?? {},
    devDeps: overrides.devDeps ?? {},
    hasBin: overrides.hasBin ?? false,
    scripts: overrides.scripts ?? [],
  };
}
```

**Setup template conditional block pattern (ana-setup.md:148-151):**
```
  [If surfaces in ana.json:
  Surfaces:
    {name}              {surfaces.{name}.commands.test ?? '⚠ no test command'}
    ...for each surface]
```

### Proof Context

**dependencies.ts:**
- Wildcard capitalization is naive for hyphenated provider names. Not relevant to this build — provenance doesn't change display names.

**scan-engine.ts:**
- Hardcoded subdirectory list inline in 900+ line function. Not relevant — provenance is a new call, not refactoring existing code.
- `readPythonDependencies` called twice. Not relevant — provenance doesn't touch Python deps.

**ana-setup.md:**
- Dogfood test doesn't cover ana-setup.md sync. Known limitation — the dogfood file is separate and not modified in this scope.

### Checkpoint Commands

- After `dependencies.ts` changes: `(cd 'packages/cli' && pnpm vitest run tests/engine/detectors/dependencies.test.ts)` — Expected: all existing + new provenance tests pass
- After `engineResult.ts` + `analyzer-contract.test.ts`: `(cd 'packages/cli' && pnpm vitest run tests/contract/analyzer-contract.test.ts)` — Expected: pass with new `stackProvenance` key
- After all code changes: `pnpm run test -- --run` — Expected: 2875+ tests pass, 0 failures
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2875 passed, 2 skipped (2877 total)
- Current test files: 122
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2890+ tests in 122 files (new tests added to existing dependencies.test.ts)
- Regression focus: `tests/contract/analyzer-contract.test.ts` (key count assertion), `tests/engine/detectors/dependencies.test.ts` (existing detection tests must not break)
