# Spec: Fix Deep Tier Sampling & Finding Accuracy

**Created by:** AnaPlan
**Date:** 2026-05-19
**Scope:** .ana/plans/active/fix-deep-tier-sampling/scope.md

## Approach

Three independent fixes that address three independent problems in deep-tier scan accuracy:

**1. Findings get their own file discovery.** The validation and error-boundaries rules stop depending on `ctx.sampledFiles` / `ctx.parsedFiles` and instead glob for the specific files they need, following the pattern established by the secrets rule (`secrets.ts`). The validation rule globs for API route files, reads first 30 lines of each, checks for validation imports, and reports with full denominators. The error-boundaries rule globs for `error.tsx/jsx` and `page.tsx/jsx` directly. Both rules become async (safe — `generateFindings` already awaits results).

**2. The import alias classifier returns all aliases.** `parseTsconfigAlias` changes return type from `string | null` to `string[]`. The alias detection heuristic generalizes: a tsconfig `paths` key is an alias if it ends with `/*` AND is NOT a scoped npm package (where the `@scope` portion is longer than 2 chars). This catches `@/*`, `@/lib/*`, `~/lib/*`, `#imports/*`, `components/*` while excluding `@nestjs/*`, `@types/*`. Returns `[]` when no aliases found. Two call sites need updating:
- Convention orchestrator (`conventions/index.ts` line 94): currently wraps single result in array — change to `.map()` over returned array.
- `detectProjectRoot` (`imports.ts` line 259): currently returns the alias as the "project root" for Node — semantically wrong. Change to return `null` for Node projects. The convention orchestrator already calls `parseTsconfigAlias` separately, so this was redundant.

**3. Depth-stratified sampling with budget 750.** Replace `depthThenAlpha` sorting with depth-bucketed allocation. Three buckets: shallow (depth ≤ 2), mid (3–5), deep (6+). Budget allocated proportionally to each bucket's file count with floor of 1 per non-empty bucket. Within each bucket: alphabetical sort for determinism. Empty buckets redistribute their budget. Default budget increases from 500 to 750.

**4. Comment fix.** `treeSitter.ts` line 904 says "50-150ms" — measured amortized cost is ~0.8ms/file. Fix the comment.

## Output Mockups

### Validation finding — project with partial validation (e.g., Dub)
```
warn  63/139 API routes have no validation imports
      Checked top-of-file imports for validation libraries. Routes using
      wrapper-based or middleware-based validation may not be detected.
```

### Validation finding — all routes validated
```
pass  All 42 API routes have validation imports
```

### Validation finding — small project (<10 routes)
```
info  3/7 API routes have no validation imports
      Checked top-of-file imports for validation libraries. Routes using
      wrapper-based or middleware-based validation may not be detected.
```

### Error-boundaries finding — detected via glob
```
pass  Error boundary detected
```

### Error-boundaries finding — pages exist but no error boundaries
```
info  24 pages, no error boundaries
      Consider adding app/error.tsx for graceful error handling
```

## File Changes

### `packages/cli/src/engine/findings/rules/validation.ts` (modify)
**What changes:** Rewrite to glob for API route files directly instead of filtering `ctx.parsedFiles`. The rule globs for both App Router (`**/api/**/route.{ts,js,tsx,jsx}`) and Pages Router (`**/pages/api/**/*.{ts,js,tsx,jsx}`) patterns. For each matched file, reads first 30 lines and checks for validation library imports or schema/validate path patterns. Returns finding with full denominator. Severity logic: all validated = `pass`; <10 total routes = `info` max; ≥10 routes with unvalidated = `warn`. Title uses actual counts. Detail text includes limitation note when not all routes are validated.
**Pattern to follow:** `secrets.ts` — same glob + readFileSync + per-file analysis pattern. Import `glob` from `'glob'` and `readFileSync` from `'node:fs'`, use `ctx.rootPath` as cwd.
**Why:** Current rule depends on sampled files, producing "1/1" or "12/12" findings that misrepresent projects with hundreds of routes.

### `packages/cli/src/engine/findings/rules/errorBoundaries.ts` (modify)
**What changes:** Replace `ctx.sampledFiles` filtering with direct glob. Glob for `**/error.{tsx,jsx}` to check existence and `**/page.{tsx,jsx}` to count pages. Same ignore patterns as secrets rule for node_modules/dist/etc. Becomes async.
**Pattern to follow:** `secrets.ts` — glob from `ctx.rootPath`.
**Why:** Current rule misses error boundaries in deep directories because they weren't in the sample.

### `packages/cli/src/engine/analyzers/conventions/imports.ts` (modify)
**What changes:** Three changes:
1. `parseTsconfigAlias` return type changes from `Promise<string | null>` to `Promise<string[]>`. The `aliasKeys.find()` becomes `aliasKeys.filter()`. The filter condition generalizes: accept any key ending with `/*` that is NOT a scoped npm package (defined as `@{scope}/*` where scope length > 2). Returns filtered keys mapped through `.replace('/*', '/')`. Returns `[]` instead of `null`.
2. `detectProjectRoot` returns `null` for `projectType === 'node'` instead of delegating to `parseTsconfigAlias`. The function's purpose is project name/root detection — aliases are a separate concern handled by the convention orchestrator.
3. Update JSDoc on `parseTsconfigAlias` to reflect new return type and semantics.
**Pattern to follow:** The existing filter logic structure — just generalize the condition and change `find` → `filter`.
**Why:** Projects with multiple path aliases (`@/lib/*`, `@/pages/*`, `@/ui/*`) only get the first one, causing all other aliased imports to be misclassified as external.

### `packages/cli/src/engine/analyzers/conventions/index.ts` (modify)
**What changes:** Update the `parseTsconfigAlias` call site. Currently: `const tsconfigAlias = ... await parseTsconfigAlias(...); const aliasPatterns = tsconfigAlias ? [`${tsconfigAlias}*`] : undefined;`. Changes to: `const tsconfigAliases = ... await parseTsconfigAlias(...); const aliasPatterns = tsconfigAliases.length > 0 ? tsconfigAliases : undefined;`. The aliases already come back as `@/lib/`, `@/` etc. from the updated `parseTsconfigAlias`, so no need to append `*`. Also update `analyzeImportConvention` call. The `aliasPattern` field on the convention result stores `tsconfigAliases[0] ?? null` — the first alias for backward compatibility. No scan.json schema change.
**Pattern to follow:** Existing code at lines 92-103.
**Why:** Completes the alias classifier fix — the orchestrator must pass all aliases through to `classifyTSImport`.

### `packages/cli/src/engine/sampling/proportionalSampler.ts` (modify)
**What changes:** Replace `depthThenAlpha` sort with depth-bucketed allocation inside `globFromDir`. After globbing and filtering test files:
1. Compute depth for each file (`file.split('/').length`).
2. Bucket into shallow (≤ 2), mid (3–5), deep (6+).
3. Allocate the per-root limit proportionally across non-empty buckets (floor of 1 per non-empty bucket).
4. Within each bucket, sort alphabetically and take the allocation.
5. Concatenate buckets in order (shallow first, then mid, then deep).
Change default budget from 500 to 750.
**Pattern to follow:** The existing proportional allocation logic (floor-of-1, distribute remaining proportionally, leftover to largest) — apply the same algorithm to depth buckets within each source root.
**Why:** Depth-first sorting systematically over-represents shallow files (config, types, barrel exports). Stratification ensures deep application code gets proportional representation.

### `packages/cli/src/engine/scan-engine.ts` (modify)
**What changes:** Change the budget parameter from `500` to `750` on the `sampleFilesProportional` call at line 719.
**Pattern to follow:** N/A — single constant change.
**Why:** Matches the new default and provides more representative coverage.

### `packages/cli/src/engine/parsers/treeSitter.ts` (modify)
**What changes:** Fix comment on line 904 from `"slow path: 50-150ms"` to reflect measured amortized cost of ~0.8ms/file. The comment describes the cache-miss code path for a single file parse.
**Pattern to follow:** N/A — comment-only change.
**Why:** Misleading comment implies parsing is 60-180x slower than it actually is.

## Acceptance Criteria

- [ ] AC1: Scanning Dub produces a validation finding with denominator ≥100 (not "1/1")
- [ ] AC2: Scanning a project with 10+ API routes and validation imports produces a `pass` or accurately-counted finding — not a false alarm
- [ ] AC3: Validation finding covers both App Router (`**/api/**/route.{ts,js,tsx,jsx}`) and Pages Router (`**/pages/api/**/*.{ts,js,tsx,jsx}`) patterns
- [ ] AC4: Validation severity considers absolute route count — projects with <10 total routes get `info` at most
- [ ] AC5: Error-boundaries finding detects `error.tsx` files regardless of their depth in the directory tree
- [ ] AC6: `parseTsconfigAlias` returns `string[]` containing all path aliases from tsconfig, not just the first match
- [ ] AC7: A project with `@/lib/*`, `@/pages/*`, `@/ui/*` aliases classifies all three as absolute imports. A project with `~/lib/*` or `#imports/*` aliases classifies those as absolute, not external
- [ ] AC8: General sample at budget 750 includes files from all depth levels (not just shallowest)
- [ ] AC9: Scan performance remains under 12 seconds on repos up to 11k source files
- [ ] AC10: treeSitter.ts comment accurately reflects measured parse performance (~0.8ms/file amortized)
- [ ] AC11: Validation finding title uses actual counts, not "sampled" (e.g., "63/139 API routes have no validation imports" or "All 139 API routes have validation imports"). Detail text includes a limitation note when less than 100% of routes have validation imports
- [ ] Tests pass with `pnpm run test -- --run`
- [ ] No build errors with `pnpm run build`

## Testing Strategy

- **Unit tests for validation rule:** Create test file at `tests/engine/findings/rules/validation.test.ts`. Use temp directories with mock API route files. Test scenarios:
  - App Router routes with validation imports → `pass`
  - App Router routes without validation → `warn` (≥10 routes) or `info` (<10 routes)
  - Pages Router routes → detected correctly
  - Mixed validated/unvalidated → correct counts in title
  - No API routes → returns `null`
  - Validation via schema path pattern → detected
  - Detail text includes limitation note when not all validated

- **Unit tests for error-boundaries rule:** Create test file at `tests/engine/findings/rules/errorBoundaries.test.ts`. Use temp directories:
  - Next.js project with deeply nested `error.tsx` → `pass`
  - Next.js project with pages but no error boundaries → `info` with correct page count
  - Non-Next.js project → returns `null`
  - No pages → returns `null`

- **Unit tests for alias classifier:** Create test file at `tests/engine/analyzers/conventions/imports.test.ts` (or extend existing). Test:
  - Multiple `@/`-prefixed aliases all returned
  - `~/lib/*` and `#imports/*` returned as aliases
  - `@nestjs/*`, `@types/*` excluded (scope > 2 chars)
  - `components/*` (no prefix) returned as alias
  - No paths in tsconfig → returns `[]`
  - `classifyTSImport` with multiple aliases classifies all correctly

- **Update existing sampler tests:** Extend `tests/engine/sampling/proportional-sampler.test.ts`:
  - Files at different depths get representation (not just shallowest)
  - Default budget is 750
  - Empty depth buckets don't break allocation
  - Flat project (all depth 1-2) works correctly

- **Edge cases:**
  - Validation rule on project with zero API routes → `null`
  - Error-boundaries glob on project with no `.tsx` files → `null`
  - `parseTsconfigAlias` with empty tsconfig paths → `[]`
  - Sampler with all files at same depth → no crash, correct count

## Dependencies

None — all changes are to existing engine modules with no new dependencies.

## Constraints

- Scan performance must stay under 12 seconds on repos up to 11k source files. Budget 750 adds ~150ms based on benchmarks.
- `scan.json` schema for `aliasPattern` field stays `string | null` — no breaking change.
- Engine files have zero CLI dependencies — no chalk, no commander, no ora in any of these changes.
- The `FindingContext` interface is unchanged.

## Gotchas

- **Validation rule glob ignore patterns.** Must exclude `node_modules`, `dist`, `.next`, etc. — same as the secrets rule's `SECRET_GLOB_IGNORE` but scoped to route file extensions. Copy the relevant ignore patterns from secrets.ts.
- **Pages Router glob overlap.** The Pages Router pattern `**/pages/api/**/*.{ts,js,tsx,jsx}` could match non-route files if someone puts helpers in the api directory. This matches the existing behavior (line 31-32 of current validation.ts) and is an acceptable approximation.
- **`readFileSync` in async function.** The validation rule becomes async (for glob) but uses `readFileSync` for reading file content. This is intentional — reading 30 lines of a file is fast, and matching the secrets.ts pattern is more important than micro-optimizing I/O. The secrets rule does the same thing.
- **`depthThenAlpha` function removal.** The existing test "sorts by depth then alpha (shallow files first)" will need updating — the sort order changes with stratification. The test should verify depth representation instead.
- **Convention orchestrator double-call.** `detectProjectRoot` and `parseTsconfigAlias` are called separately in the orchestrator. After the fix, `detectProjectRoot` returns `null` for Node, and `parseTsconfigAlias` returns the aliases. This is correct — they serve different purposes, and the orchestrator already calls both.
- **Alias patterns format.** `parseTsconfigAlias` returns aliases like `@/`, `@/lib/`, `~/lib/` (with trailing slash, `/*` stripped). `classifyTSImport` at line 83 does `aliases?.some(alias => path.startsWith(alias.replace('/*', '')))` — but the new return values already have `/*` stripped. Check that line 97 (`normalizedPath.startsWith(alias.replace('*', ''))`) still works. The aliases come back as `@/lib/` — `replace('*', '')` is a no-op, and `normalizedPath.startsWith('@/lib/')` is correct.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Engine files have zero CLI dependencies — no chalk, no commander, no ora.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Explicit return types on all exported functions.
- Always pass `--run` flag when invoking Vitest.
- Use temp directories with `fs.mkdtempSync` for filesystem tests — clean up in `finally` blocks.
- Test behavior, not implementation — assert on return values, not internal calls.
- Assert on specific expected values, not just existence.

### Pattern Extracts

**secrets.ts — finding rule with own glob (lines 148-206):**
```typescript
// packages/cli/src/engine/findings/rules/secrets.ts:148-206
export async function checkHardcodedSecrets(ctx: FindingContext): Promise<Finding[]> {
  const findings: Finding[] = [];
  const checkedServices: string[] = [];

  try {
    const files = await glob('**/*.{ts,tsx,js,jsx,py}', {
      cwd: ctx.rootPath,
      absolute: false,
      ignore: SECRET_GLOB_IGNORE,
    });

    for (const file of files) {
      let content: string;
      try {
        content = readFileSync(path.join(ctx.rootPath, file), 'utf-8');
      } catch { continue; }
      // ... per-file analysis ...
    }
  } catch {
    // Glob failed — skip silently
  }

  if (findings.length === 0) {
    return [{
      id: 'hardcoded-secret',
      severity: 'pass',
      title: 'No hardcoded secrets detected',
      detail: `Checked: Stripe, OpenAI, Anthropic, AWS, GitHub, database URLs, Resend, SendGrid, Twilio`,
      category: 'security',
    }];
  }

  return findings;
}
```

**Sampler proportional allocation (lines 82-109):**
```typescript
// packages/cli/src/engine/sampling/proportionalSampler.ts:82-109
  // Allocate budget proportionally with floor of 1 per root
  const allocations: Array<{ root: typeof roots[0]; allocation: number }> = [];
  let remaining = budget;

  // First pass: assign floor of 1 to each root
  for (const root of roots) {
    allocations.push({ root, allocation: 1 });
    remaining--;
  }

  // Second pass: distribute remaining proportionally
  if (remaining > 0) {
    let distributed = 0;
    for (const entry of allocations) {
      const proportion = entry.root.fileCount / totalFiles;
      const extra = Math.floor(proportion * remaining);
      entry.allocation += extra;
      distributed += extra;
    }
    // Assign leftover to the largest root (rounding residual)
    const leftover = remaining - distributed;
    if (leftover > 0) {
      const largest = allocations.reduce((a, b) =>
        a.root.fileCount > b.root.fileCount ? a : b
      );
      largest.allocation += leftover;
    }
  }
```

**Sampler test helper (lines 8-38):**
```typescript
// tests/engine/sampling/proportional-sampler.test.ts:8-38
function makeRoot(relativePath: string, fileCount: number, isPrimary = false): SourceRoot {
  return {
    absolutePath: '', // set per test
    relativePath,
    packageName: null,
    fileCount,
    isPrimary,
    deps: {},
    devDeps: {},
    hasBin: false,
  };
}

function makeCensus(rootPath: string, roots: SourceRoot[]): ProjectCensus {
  return {
    rootPath,
    projectName: 'test',
    layout: roots.length > 1 ? 'monorepo' : 'single-repo',
    monorepoTool: roots.length > 1 ? 'pnpm' : null,
    sourceRoots: roots,
    primarySourceRoot: roots.find(r => r.isPrimary)?.relativePath ?? '.',
    allDeps: {},
    deps: {},
    devDeps: {},
    rootDevDeps: {},
    primaryDeps: {},
    configs: { frameworkHints: [], tsconfigs: [], schemas: [], deployments: [], ciWorkflows: [] },
    builtAt: new Date().toISOString(),
    buildDurationMs: 0,
  };
}
```

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands
- After validation.ts + errorBoundaries.ts: `cd packages/cli && pnpm vitest run tests/engine/findings/rules/validation.test.ts tests/engine/findings/rules/errorBoundaries.test.ts` — Expected: new tests pass
- After imports.ts + conventions/index.ts: `cd packages/cli && pnpm vitest run tests/engine/analyzers/conventions/imports.test.ts` — Expected: new tests pass
- After proportionalSampler.ts: `cd packages/cli && pnpm vitest run tests/engine/sampling/proportional-sampler.test.ts` — Expected: updated tests pass
- After all changes: `pnpm run test -- --run` — Expected: all tests pass
- Lint: `(cd packages/cli && pnpm run lint)`

### Build Baseline
- Current tests: 2524 passed, 2 skipped
- Current test files: 109
- Command used: `pnpm run test -- --run`
- After build: expected ~2560+ tests in 112+ files (3 new test files: validation, errorBoundaries, imports)
- Regression focus: `tests/engine/sampling/proportional-sampler.test.ts` (sort behavior changes), any existing convention/import tests
