# Spec: Fix Application Shape Detection Priority Chain

**Created by:** AnaPlan
**Date:** 2026-05-22
**Scope:** .ana/plans/active/fix-shape-detection-priority/scope.md

## Approach

The disease: dependency-based signals (MCP SDK, LangChain, CLI deps like yargs) override framework-based identity, producing wrong shapes. Framework is identity; dependency is capability. The fix reorders the priority chain so framework evidence ranks above dependency-based classification.

Three coordinated changes within `detectApplicationShape()`:

1. **Extend MCP guard to block on ANY framework (browser or server).** Currently the guard only checks `BROWSER_FRAMEWORKS`. Express + MCP SDK is "an API server that also offers MCP" — not a dedicated MCP server. Use `hasWebFramework` (browser OR server) instead of just `hasBrowserFramework`.

2. **Gate ai-agent on "no framework detected."** Same principle. LangChain + Next.js is a web app with AI features, not an AI agent. Add the same `!hasWebFramework` guard used for MCP.

3. **Move framework checks above bin and CLI dep checks. Remove CLI dep fallback (old step 10) entirely.** If NestJS is detected, the project is an api-server regardless of yargs in deps. Library markers move above where CLI dep was, so `hasMain`/`hasExports` still classifies correctly. The CLI dep fallback (old step 6) produced zero true positives in 70-repo validation and one false positive — delete it.

**Hoist `hasWebFramework`.** Currently computed at line 174 for the worker step. Three steps now need it (MCP guard, ai-agent guard, worker). Compute it once right after the non-Node early return (after line 150), before any step that uses it.

**Extract `BROWSER_DEP_ALIASES`.** The inline array `['next', '@angular/core', 'solid-js']` at line 205-207 becomes a module-level `Set` constant, following the same pattern as `BROWSER_FRAMEWORKS`, `SERVER_FRAMEWORKS`, etc.

The resulting priority chain:

```
Node.js projects:
  1. MCP SDK (guard: no framework) → mcp-server
  2. Agent framework (guard: no framework) → ai-agent
  3. Mobile deps → mobile-app
  4. Job framework without web framework → worker
  5. Browser framework → web-app
  6. Server framework + browser deps → full-stack
  7. Server framework alone → api-server
  8. bin field → cli
  9. Library markers (main/module/exports) → library
  10. unknown
```

## Output Mockups

No user-facing output changes. Shape appears in scan.json (`applicationShape` field), terminal header, and project-context scaffold. The values are the same closed set — only which value is returned for specific input combinations changes.

Before (wrong):
```
directus    → mcp-server  (has MCP SDK + Express)
novu        → cli         (has yargs + NestJS)
hono        → cli         (has arg in devDeps + library markers)
langfuse    → ai-agent    (has @langchain/core + Next.js)
```

After (correct):
```
directus    → api-server  (Express is identity; MCP SDK is capability)
novu        → api-server  (NestJS is identity; yargs is capability)
hono        → library     (library markers win; CLI dep fallback removed)
langfuse    → web-app     (Next.js is identity; LangChain is capability)
```

## File Changes

### `packages/cli/src/engine/detectors/applicationShape.ts` (modify)

**What changes:**

1. Add a `BROWSER_DEP_ALIASES` constant (Set) near the other constants. Contains `'next'`, `'@angular/core'`, `'solid-js'` — the package names that differ from their internal framework keys. Currently an inline array at line 205-207.

2. Hoist `hasWebFramework` computation to right after the non-Node early return (after line 150). This variable is currently computed at line 174-176. Three steps now consume it: MCP guard, ai-agent guard, worker guard.

3. Change the MCP guard (line 155-159): replace the `hasBrowserFramework` check with `!hasWebFramework`. This blocks MCP classification when ANY framework (browser or server) is present.

4. Add a framework guard to the ai-agent step (line 162-165): wrap the return in `if (!hasWebFramework)`, same pattern as the MCP guard.

5. Reorder the remaining steps: move the framework-based classification block (browser → web-app, server → full-stack/api-server) above the bin check and CLI dep check.

6. Delete the CLI dep fallback step entirely (old step 6, lines 187-189). No replacement.

7. Update the file-level JSDoc comment (lines 1-18) to reflect the new priority chain.

**Pattern to follow:** The existing MCP guard (lines 155-159) is the structural template for the ai-agent guard — same shape, same logic, same comment style.

**Why:** Without this change, 8 repos are misclassified. Framework is the strongest identity signal for Node.js projects; letting dependency-based signals override it produces wrong answers.

### `packages/cli/tests/engine/detectors/applicationShape.test.ts` (modify)

**What changes:**

1. Fix the test at line 73-79: the comment says "pure MCP server" but the input has `frameworkName: 'express'`. Change the assertion from `mcp-server` to `api-server` (Express is a server framework — MCP guard now blocks). Update the comment to reflect what this actually tests: "MCP + server framework → api-server."

2. Add a NEW test for actual pure MCP server (no framework, just MCP SDK). This is the test the old line 73 claimed to be.

3. Change the `ai-agent wins over api-server` test (line 81-87): with the framework guard, LangChain + Express → `api-server`, not `ai-agent`. Update assertion and comment.

4. Add new tests for ai-agent + browser framework (→ web-app) and ai-agent + no framework (→ ai-agent, unchanged).

5. Change the A006 tests (lines 120-141): CLI deps alone (commander, yargs, meow, cac) now → `unknown` instead of `cli`. Update assertions, keep the tests — they verify the detector handles CLI-dep-only input without crashing. Update the describe block text to reflect the new behavior.

6. Change the A014 tests (lines 271-282): CLI dep + library markers. With step 10 removed, these combos now → `library` (library markers are checked, CLI dep is not). Update assertions.

7. Add new test cases per AC12: pure MCP server (no framework), MCP + server framework, ai-agent + browser framework, ai-agent + server framework, framework + CLI dep, framework + bin, library markers + CLI dep, bin + library markers (bin wins).

8. Add an explicit test for `bin + server framework` → `api-server` with a code comment documenting the design decision per AC13.

**Pattern to follow:** Existing test structure with `makeInput()` helper and `@ana` contract tags. Group related tests in `describe` blocks.

**Why:** Tests must match the new priority chain. Old assertions encode the old (wrong) behavior.

## Acceptance Criteria

- [ ] AC1: directus scenario (MCP SDK + Express framework) → `api-server`
- [ ] AC2: activepieces scenario (MCP SDK + server framework) → `api-server`
- [ ] AC3: novu scenario (NestJS + yargs in deps) → `api-server`
- [ ] AC4: amplication scenario (NestJS + CLI deps) → `api-server`
- [ ] AC5: hono scenario (library markers + `arg` in deps, no framework self-detection) → `library`
- [ ] AC6: langfuse scenario (Next.js + @langchain/core) → `web-app`
- [ ] AC7: Anatomia scenario (bin + commander, no framework) → `cli` (unchanged)
- [ ] AC8: ghostfolio scenario (NestJS + @angular/core) → `full-stack` (unchanged)
- [ ] AC9: dub/inbox-zero/supabase scenarios (Next.js, no special deps) → `web-app` (unchanged)
- [ ] AC10: Non-Node repos (Python, Go, Rust) unchanged — separate code path, not touched
- [ ] AC11: All existing tests pass or are updated with correct new assertions
- [ ] AC12: New test cases cover: pure MCP server (no framework), MCP + server framework, ai-agent + browser framework, ai-agent + server framework, framework + CLI dep, framework + bin, library markers + CLI dep, bin + library markers (bin wins)
- [ ] AC13: `bin + server framework` has an explicit test and a code comment documenting the design decision
- [ ] Tests pass: `(cd 'packages/cli' && pnpm vitest run)`
- [ ] No build errors: `pnpm run build`
- [ ] Lint passes: `pnpm run lint`

## Testing Strategy

- **Unit tests:** All tests are in `applicationShape.test.ts`. Pure function with `makeInput()` helper — no mocking, no filesystem, no setup. Each test constructs an input and asserts the output shape. Follow existing patterns exactly.
- **Integration tests:** Not needed. This is a pure function with no side effects. The scan engine assembles the input from census data; that path is not changing.
- **Edge cases:**
  - `bin + server framework` → `api-server` (framework wins — documented design decision)
  - CLI dep alone (commander, yargs) → `unknown` (step 10 removed)
  - CLI dep + library markers → `library` (library markers checked, CLI dep not)
  - MCP SDK + server framework (Express, NestJS) → `api-server`
  - MCP SDK + browser framework (Next.js) → `web-app` (unchanged)
  - Agent framework + browser framework → `web-app`
  - Agent framework + server framework → `api-server`
  - Agent framework alone → `ai-agent` (unchanged)
  - `bin + library markers` → `cli` (bin checked before library markers, unchanged)

## Dependencies

None. Pure function, no schema changes, no new dependencies.

## Constraints

- The `ApplicationShape` type, `ApplicationShapeInput` interface, and `ApplicationShapeResult` interface must not change. Same inputs, same type signature, different priority logic.
- Non-Node path (lines 147-150) must not be touched. The `FRAMEWORK_TO_SHAPE` lookup is unrelated.
- Zero runtime consumers branch on shape values — this is informational only. But test assertions must be precise.

## Gotchas

- **The A006 tests should change assertions, not be deleted.** They still verify the detector handles CLI-dep-only input. Change expected value from `cli` to `unknown`. Keep the tests.
- **The test at line 73-79 has a misleading comment.** It says "pure MCP server" but the input includes `frameworkName: 'express'`. Fix BOTH the comment and the assertion. Then add a separate test for actual pure MCP (no framework).
- **`BROWSER_FRAMEWORKS` does NOT contain `'hono'`.** `SERVER_FRAMEWORKS` does. Don't confuse the sets when writing guards.
- **The full-stack check needs `BROWSER_DEP_ALIASES` for the dep lookup.** When extracting the inline array to a constant, make sure the full-stack check uses the new constant. The check needs both `BROWSER_FRAMEWORKS` (for direct package-name matches like `react`, `vue`) and `BROWSER_DEP_ALIASES` (for names that differ from internal keys: `next`, `@angular/core`, `solid-js`).
- **`hasWebFramework` uses `input.frameworkName`, not deps.** It checks whether the framework detector identified a framework, not whether framework packages are in deps. This is the correct signal — `frameworkName` comes from the framework registry's priority-ordered detection.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer named exports. No default exports.
- Prefer early returns over nested conditionals.
- Engine files have zero CLI dependencies — no chalk, no commander, no ora.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Constants use SCREAMING_SNAKE_CASE (convention: 98% confidence, 213 sampled).

### Pattern Extracts

**MCP guard pattern (applicationShape.ts:152-159) — template for ai-agent guard:**
```typescript
  // 1. MCP server (most specific — dedicated protocol server)
  // BUT: if a browser framework is also present, this is a web app with an
  // MCP feature, not a dedicated MCP server. Let it fall through to web-app.
  if (input.deps.some(d => MCP_DEPS.has(d))) {
    const hasBrowserFramework = input.frameworkName !== null && BROWSER_FRAMEWORKS.has(input.frameworkName);
    if (!hasBrowserFramework) {
      return { shape: 'mcp-server' };
    }
  }
```

**hasWebFramework computation (applicationShape.ts:174-176) — to be hoisted:**
```typescript
  const hasWebFramework = input.frameworkName !== null && (
    BROWSER_FRAMEWORKS.has(input.frameworkName) || SERVER_FRAMEWORKS.has(input.frameworkName)
  );
```

**Full-stack browser dep check (applicationShape.ts:205-207) — inline array to extract:**
```typescript
      const hasBrowserDep = input.deps.some(d => BROWSER_FRAMEWORKS.has(d) || [
        'next', '@angular/core', 'solid-js',
      ].includes(d));
```

**Test makeInput helper (applicationShape.test.ts:7-17):**
```typescript
function makeInput(overrides: Partial<ApplicationShapeInput> = {}): ApplicationShapeInput {
  return {
    hasBin: false,
    hasMain: false,
    hasExports: false,
    frameworkName: null,
    projectType: 'node',
    deps: [],
    ...overrides,
  };
}
```

### Proof Context

No active proof findings for affected files.

### Checkpoint Commands

- After `applicationShape.ts` changes: `(cd 'packages/cli' && pnpm vitest run -- tests/engine/detectors/applicationShape.test.ts)` — Expected: some failures (tests still assert old behavior)
- After `applicationShape.test.ts` changes: `(cd 'packages/cli' && pnpm vitest run -- tests/engine/detectors/applicationShape.test.ts)` — Expected: all tests pass
- After all changes: `pnpm run test -- --run` — Expected: 2720+ tests pass (existing count preserved + new tests added)
- Lint: `pnpm run lint`
- Build: `pnpm run build`

### Build Baseline
- Current tests: 2720 passed, 2 skipped (2722 total)
- Current test files: 120
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected 2720+ tests (same file count, more test cases within applicationShape.test.ts)
- Regression focus: `applicationShape.test.ts` only — no other files consume or test shape detection logic
