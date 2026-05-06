# Spec: Code Comment Cleanup

**Created by:** AnaPlan
**Date:** 2026-05-05
**Scope:** .ana/plans/active/code-comment-cleanup/scope.md

## Approach

Systematic pass through ~97 files removing internal development artifacts from comments. Work in four waves, checkpointing after each:

1. **Fix lies** — `analyze()` references, broken `@example` blocks, tombstones, dead doc refs (`START_HERE.md`, `/ATLAS3/`). These actively mislead contributors.
2. **Rewrite identifiers in src/** — sprint refs (`S13`-`S24`), ticket refs (`SCAN-*`, `SETUP-*`, `INFRA-*`), plan refs (`Lane 0`, `STEP_`, `CP0`-`CP3`), design doc refs (`D6.1`, `Item N`). Apply decision rule per reference.
3. **Clean test files** — same identifier cleanup across 34 test files + rename `s11-detection.test.ts` → `detection-overrides.test.ts`.
4. **Replace 14 `any` types** in 4 test files with proper types.

Waves are ordering guidance, not phases. One spec, one build, one commit.

**Decision rule for each identifier reference:**
1. Read 2-3 lines of surrounding code.
2. If the identifier labels a design rationale worth preserving, rewrite to plain English. Drop the identifier.
3. If the identifier is pure noise (marking when something was added), remove the comment entirely.
4. Only modify comments — never variable names, constant names, or string literals.

**Exceptions:**
- `ruby.ts` and `php.ts` — rewrite headers to remove `S19/INFRA-013` but keep the explanation of why the parser exists without a reader.
- `Item 12` in `skills.ts` — carries real path protection rationale. Rewrite to plain English, don't remove.
- `SCAN-050` in `engineResult.ts` — explains why `testing` changed from `string | null` to `string[]`. Keep rationale, drop ticket ID.
- `CROSS-CUTTING` comment in `engineResult.ts` lines 8-14 — accurate infrastructure documentation. Keep the content, remove identifiers within it.

## Output Mockups

No user-facing output changes. All changes are comments/headers in source files.

**scan-engine.ts header — after:**
```
/**
 * scanProject() — top-level engine function
 *
 * Composes EngineResult from multiple detection sources:
 * 1. Dependency detection (primary — always runs)
 * 2. Structure/file analysis (always runs)
 * 3. Git detection (always runs)
 * 4. Command detection (always runs)
 * 5. External services, schemas, secrets (always runs)
 * 6. Tree-sitter deep analysis (only when depth === 'deep')
 */
```

**engine/index.ts — after (entire file):**
```ts
export type { EngineResult } from './types/engineResult.js';
export { scanProject } from './scan-engine.js';
export { ASTCache } from './cache/astCache.js';
export { ParserManager } from './parsers/treeSitter.js';
```

**ruby.ts header — after:**
```
/**
 * Ruby dependency parser (Gemfile).
 *
 * Low-level parser only — the higher-level reader that wrapped this
 * was deleted as dead code. No production code path consumes Ruby
 * dependency data today; the parser is retained as a tested utility
 * in case Ruby support ships later.
 */
```

**engineResult.ts sprint ref rewrite — before:**
```
// non-Node projects (Python, Go, Rust) have no package manager in the Node
// sense (S19/SCAN-032 — pre-fix, the detector fell back to "npm" which was
// a semantic lie that propagated into ana.json for every non-Node project).
```
**After:**
```
// Non-Node projects (Python, Go, Rust) have no package manager in the Node
// sense — the detector previously fell back to "npm", which was a semantic
// lie that propagated into ana.json for every non-Node project.
```

**imports.test.ts — before/after:**
```ts
// before
const imports: any[] = [
// after
const imports: ImportInfo[] = [
```

**ai-sdk-detection.test.ts — before/after:**
```ts
// before
const skills = computeSkillManifest(result as any);
// after
const skills = computeSkillManifest(result);
```

## File Changes

### Wave 1: Fix lies

#### `src/engine/scan-engine.ts` (modify)
**What changes:** (1) Rewrite header lines 1-14 — remove `analyze()` claim, keep the accurate 6-step pipeline description. (2) Remove lines 605-613 — the paragraph describing relationship to `analyze()`. (3) Rewrite line 677 comment from "replaces analyze() — Lane 0 Step 7" to "Direct detection phases — project type, framework, structure, and deep-tier analysis." (4) Lines 613-619 describe fail-soft behavior that's real and applies to scanProject — rewrite to remove `analyze()` mention but keep the fail-soft description.
**Pattern to follow:** The accurate parts of the existing header (lines 3-11).
**Why:** Contributors will look for `analyze()` and find nothing.

#### `src/engine/index.ts` (modify)
**What changes:** Remove "verified S18" comment (line 1). Remove 4-line tombstone block (lines 7-10). File becomes 4 clean re-export lines.
**Why:** 4 of 10 lines are tombstone for a deleted function.

#### `src/engine/parsers/treeSitter.ts` (modify)
**What changes:** (1) Remove checkpoint list lines 12-16 (`CP0`-`CP3`, `SS-10`). Keep lines 1-10. (2) Fix `@example` at line 1007-1012 that calls `analyze(rootPath)` — either rewrite to show correct usage with `DeepTierInput` or remove if `@param`/`@returns` already cover the contract.
**Why:** Checkpoints are internal tracking. The `@example` references a deleted function.

#### `src/engine/utils/confidence.ts` (modify)
**What changes:** Remove line 10 — the `/ATLAS3/` design doc reference. Keep the confidence weight description (lines 5-8).

#### 8 files with `START_HERE.md` references (modify)
Files: `src/engine/types/conventions.ts`, `src/engine/detectors/projectType.ts`, `src/engine/parsers/python/Pipfile.ts`, `src/engine/parsers/python/pyproject.ts`, `src/engine/parsers/go.ts`, `src/engine/analyzers/conventions/naming.ts`, `src/engine/analyzers/conventions/indentation.ts`, `src/engine/analyzers/conventions/index.ts`, `src/engine/analyzers/conventions/imports.ts`.
**What changes:** Remove the `START_HERE.md` reference line from each header.

#### `src/engine/parsers/ruby.ts` and `src/engine/parsers/php.ts` (modify)
**What changes:** Rewrite headers — remove `S19/INFRA-013`, keep the explanation of why the parser exists without a reader. See Output Mockups.

#### Remaining tombstone locations (modify)
**What changes:** Grep for `DELETED`, `deleted in S`, `removed in S`, `mapToPatternDetail` in src/. Remove each tombstone. If it carries design rationale, preserve in plain English.

### Wave 2: Rewrite identifiers in src/

**Discovery commands:**
```
grep -rn "S1[3-9]\|S2[0-4]" packages/cli/src/ --include="*.ts"
grep -rn "SCAN-\|SETUP-\|INFRA-" packages/cli/src/ --include="*.ts"
grep -rn "Lane 0\|STEP_" packages/cli/src/ --include="*.ts"
grep -rn "Item [0-9]\|D[0-9]\+\.[0-9]" packages/cli/src/ --include="*.ts"
```

**High-density files** (work these first, apply decision rule to each reference):
- `src/engine/types/index.ts` — 24 refs. Mostly "added in S18" markers on re-exports. Remove markers, keep structural explanations.
- `src/commands/check.ts` — 12 refs. `D12.3`, `SCAN-*` in check logic. Read context, decide per reference.
- `src/engine/analyzers/patterns/confirmation.ts` — 13 refs. Sprint markers on detection logic. Remove markers, keep algorithm rationale.
- `src/engine/parsers/queries.ts` — 12 refs. Sprint markers on query definitions. Likely all removable.
- `src/engine/parsers/treeSitter.ts` — remaining refs after Wave 1 checkpoint removal.
- `src/data/gotchas.ts` — 10 refs. `SCAN-*` prefixes on gotcha comments. Remove identifier, keep rationale if it adds value beyond the gotcha text.
- `src/commands/init/skills.ts` — 10 refs. `Item 12` carries path protection rationale — rewrite to plain English.
- `src/engine/types/engineResult.ts` — `D2-compliant`, `Items 3, 6, 7a/b/d`, `S19/SCAN-032`, `SCAN-050`. Keep rationale, drop identifiers.
- All remaining src/ files with 1-3 references each.

### Wave 3: Clean test files

**Discovery:** `grep -rn "S1[3-9]\|S2[0-4]\|SCAN-\|SETUP-\|INFRA-\|Item [0-9]\|D[0-9]\+\.[0-9]\|Lane 0\|STEP_" packages/cli/tests/ --include="*.ts"`

Apply the same decision rule. Most test comments are simpler — "added in S18" markers that should be removed entirely.

#### `tests/engine/detectors/s11-detection.test.ts` → `tests/engine/detectors/detection-overrides.test.ts` (rename)
**What changes:** `git mv` to rename. Update header from "S11 detection improvements tests" to describe what it tests: "Tests for detection override scenarios: TypeScript language override, Prisma provider parsing, package manager inheritance." Clean any sprint refs in the file body. The file is self-contained — no other files import from it.

### Wave 4: Replace `any` types

#### `tests/engine/detectors/ai-sdk-detection.test.ts` (modify)
**What changes:** Remove 6 `as any` casts from `computeSkillManifest()` calls. Every `result` is built from `{ ...createEmptyEngineResult(), stack: { ...createEmptyEngineResult().stack, field: 'value' } }` which produces a full `EngineResult`. The cast is unnecessary. Also rewrite `SETUP-028` comment on line 93 to plain English.

#### `tests/engine/conventions/imports.test.ts` (modify)
**What changes:** Replace 4 `any[]` with `ImportInfo[]`. Add `import type { ImportInfo } from '../../../src/engine/types/parsed.js';`.

#### `tests/contract/analyzer-contract.test.ts` (modify)
**What changes:** Remove 1 `as any` cast from `generateProjectContextScaffold(result as any)`. The `result` is built from `createEmptyEngineResult()` with overrides — already `EngineResult`.

#### `tests/engine/analyzers/patterns/confirmation.test.ts` (modify)
**What changes:** Replace 3 `as any` casts with `isMultiPattern()` type guard from `src/engine/types/patterns.ts`. Add `import { isMultiPattern } from '../../../../src/engine/types/patterns.js';`. Replace `expect('patterns' in (df as any)).toBe(true)` with `expect(isMultiPattern(df)).toBe(true)`. For the line that follows with `const multi = df as any` — use an explicit guard: `if (!isMultiPattern(df)) throw new Error('expected MultiPattern');` then `const multi = df;`. For line 1424: `expect(isMultiPattern(df)).toBe(false)`.

## Acceptance Criteria

- [ ] AC1: `scan-engine.ts` header accurately describes the census-based pipeline — no reference to `analyze()`
- [ ] AC2: `scan-engine.ts:605-613` paragraph about `analyze()` relationship is removed
- [ ] AC3: `engine/index.ts` tombstone comments removed — file contains only clean re-exports
- [ ] AC4: `treeSitter.ts` checkpoint list removed
- [ ] AC5: Zero references to `START_HERE.md` or `/ATLAS3/` remain in source
- [ ] AC6: Zero tombstone comments for deleted functions remain (except ruby.ts/php.ts which explain parser purpose without sprint refs)
- [ ] AC7: `engine/utils/confidence.ts:10` design doc reference removed
- [ ] AC8: Sprint references (`S13`-`S24`) either removed or rewritten to plain English — no bare sprint identifiers in src/ or tests/
- [ ] AC9: `STEP_`, `Lane 0`, `CP0-CP3` references either removed or rewritten — no implementation plan identifiers
- [ ] AC10: `Item N`, `D6.1` etc. references either removed or rewritten — no backlog/design doc identifiers
- [ ] AC11: 14 `any` types in test files replaced with proper types
- [ ] AC12: Zero JSDoc `@example` blocks reference `analyze()` — all updated or removed
- [ ] AC16: Sprint references in test files either removed or rewritten — same standard as src/
- [ ] AC17: `s11-detection.test.ts` renamed to `detection-overrides.test.ts`
- [ ] AC18: All existing tests pass
- [ ] AC19: Build succeeds, typecheck clean, lint clean (0 errors)

## Testing Strategy

- **No new tests.** Zero behavioral change except 14 type narrowings (which change compilation, not runtime).
- **Regression:** All 1883 tests must pass after every wave.
- **Type verification:** `pnpm tsc --noEmit` after Wave 4 to confirm `any` replacements compile.
- **Verification greps after all waves:**
  - `grep -rn "analyze()" packages/cli/src/engine/ --include="*.ts"` — zero (or only natural English use, not function references)
  - `grep -rn "START_HERE.md\|/ATLAS3/" packages/cli/src/ --include="*.ts"` — zero
  - `grep -rn "S1[3-9]\|S2[0-4]" packages/cli/src/ packages/cli/tests/ --include="*.ts"` — zero
  - `grep -rn "SCAN-\|SETUP-\|INFRA-" packages/cli/src/ packages/cli/tests/ --include="*.ts"` — zero
  - `grep -rn "Lane 0\|STEP_" packages/cli/src/ packages/cli/tests/ --include="*.ts"` — zero
  - `grep -rn ": any\|as any" packages/cli/tests/ --include="*.ts"` — zero (or only legitimate third-party boundary uses)
  - `ls packages/cli/tests/engine/detectors/s11-detection.test.ts` — file not found
  - `ls packages/cli/tests/engine/detectors/detection-overrides.test.ts` — file exists

## Dependencies

None. This is a standalone cleanup.

## Constraints

- Zero behavioral change (except the 14 type narrowings which don't change runtime behavior).
- Only modify comments, headers, and type annotations. Never modify production logic.
- `git mv` for the test file rename to preserve history.
- Test count must not decrease. 1883 tests, 94 files (unchanged).

## Gotchas

- **Don't delete rationale behind sprint refs.** `S19/SCAN-032` is jargon but "non-Node projects return null instead of defaulting to npm" is real design context. Read surrounding code before deciding remove vs. rewrite.
- **`scan-engine.ts` lines 613-619** describe fail-soft behavior that IS real — just rewrite to remove the `analyze()` mention. Don't delete the entire paragraph.
- **`scan-engine.ts` line 677** marks a meaningful code section. Rewrite "replaces analyze() — Lane 0 Step 7" to describe what the section does.
- **`ImportInfo` field requirements.** Check `ImportInfoSchema` in `src/engine/types/parsed.ts` before replacing `any[]`. Test data has `{ module, names, line }` — verify these are the required fields. If `ImportInfo` has additional required fields, add them to test data.
- **`confirmation.test.ts` type narrowing.** After the `isMultiPattern()` assertion, TypeScript won't automatically narrow `df`. Need an explicit `if` guard before accessing `multi.patterns.length`.
- **Volume management.** ~300 references across ~97 files. Work by directory: `engine/types/` first (highest density), then `commands/`, then `engine/analyzers/`, then `engine/parsers/`, then `data/`, then `tests/`. Checkpoint after each directory group.
- **Some `D` references may appear in string literals.** Only modify comments. If `D6.1` is a string value, leave it.
- **`CROSS-CUTTING` comment in engineResult.ts lines 8-14** — keep the content (it's accurate infrastructure documentation). Only remove identifiers within it.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions — the `ImportInfo` and `isMultiPattern` imports must use `.js`.
- Use `import type` for type-only imports — `ImportInfo` is type-only. `isMultiPattern` is a runtime function, use regular `import`.
- Avoid `any` — use `unknown` and narrow with type guards.
- Engine files have zero CLI dependencies — don't add chalk/ora when rewriting comments.
- Explicit return types on exported functions — don't accidentally remove JSDoc `@param`/`@returns` tags when editing headers.

### Pattern Extracts

**ruby.ts header (lines 1-9) — the exception pattern for tombstones with rationale:**
```typescript
/**
 * Ruby dependency parser (Gemfile).
 *
 * Low-level parser only — `readRubyDependencies` (the higher-level
 * reader that wrapped this) was deleted in S19/INFRA-013 as dead code.
 * No production code path consumes Ruby dependency data today; the
 * parser is retained as a tested utility in case Ruby support ships
 * later.
 */
```
File: `packages/cli/src/engine/parsers/ruby.ts`, lines 1-9.

**isMultiPattern usage in production (confirmation.ts):**
```typescript
  if (isMultiPattern(dbPattern)) return;
```
File: `packages/cli/src/engine/analyzers/patterns/confirmation.ts`, line 370.

**engineResult.ts lines 111-117 — sprint ref with real rationale (rewrite, don't remove):**
```typescript
  // Composed from the detector's DetectedCommands (Item 7a) — adding a field
  // to DetectedCommands now flows through automatically. The only extra field
  // scan-engine appends on top is packageManager, which is nullable because
  // non-Node projects (Python, Go, Rust) have no package manager in the Node
  // sense (S19/SCAN-032 — pre-fix, the detector fell back to "npm" which was
  // a semantic lie that propagated into ana.json for every non-Node project).
  commands: DetectedCommands & { packageManager: string | null };
```
File: `packages/cli/src/engine/types/engineResult.ts`, lines 111-117.

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands

- After Wave 1 (lies + tombstones): `(cd packages/cli && pnpm vitest run)` — Expected: 1883 tests pass
- After Wave 2 (src/ identifiers): `(cd packages/cli && pnpm vitest run)` — Expected: 1883 tests pass
- After Wave 3 (test identifiers + rename): `(cd packages/cli && pnpm vitest run)` — Expected: 1883 tests pass
- After Wave 4 (`any` types): `(cd packages/cli && pnpm vitest run)` — Expected: 1883 tests pass
- Final typecheck: `(cd packages/cli && pnpm tsc --noEmit)` — Expected: clean
- Final lint: `pnpm run lint` — Expected: 0 errors
- Verification greps: see Testing Strategy section

### Build Baseline
- Current tests: 1883 passed, 2 skipped (94 test files)
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: 1883 tests, 94 test files (no change)
- Regression focus: `imports.test.ts`, `ai-sdk-detection.test.ts`, `confirmation.test.ts`, `analyzer-contract.test.ts` — files with type changes.
