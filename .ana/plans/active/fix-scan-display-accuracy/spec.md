# Spec: Fix scan display accuracy — env hygiene false positive and contributor label

**Created by:** AnaPlan
**Date:** 2026-06-02
**Scope:** .ana/plans/active/fix-scan-display-accuracy/scope.md

## Approach

Two independent fixes to scan accuracy:

1. **Env hygiene false positive.** Replace the substring match `gitignore.includes('.env')` in `detectSecrets()` with `git check-ignore --no-index .env`. The substring match produces false positives — `.env.local` contains `.env`, so repos that only gitignore `.env.local` variants get a false "clean" result. `git check-ignore` is the authoritative evaluator: it handles negation patterns, nested gitignores, and glob semantics. The `--no-index` flag evaluates regardless of whether `.env` exists or is tracked.

   This is the first `execSync` call in scan-engine.ts. The inline try/catch follows the same 3-line pattern as `gitExec` in `git.ts:55-61` but does NOT import or reuse that helper — it's a private function in a different module. Add `import { execSync } from 'node:child_process'` to scan-engine.ts.

   The try/catch defaults `gitignoreCoversEnv` to `false` on failure (conservative: assume not covered). This handles non-git directories, old git versions, and any subprocess errors.

2. **Contributor label.** Add "active" before "contributor" in the scan display. The data field is already named `activeContributors` — the display just drops the qualifier. One-word change plus matching the singular form.

## Output Mockups

Before (env hygiene, repo with only `.env.local` in gitignore):
```
  env-hygiene    pass   No environment config detected
```

After:
```
  env-hygiene    warn   .env not in .gitignore
```

Before (contributor display):
```
  Activity     3 contributors · 332→569→1000→349 weekly
```

After:
```
  Activity     3 active contributors · 332→569→1000→349 weekly
```

Singular:
```
  Activity     1 active contributor · 50→75 weekly
```

## File Changes

### `packages/cli/src/engine/scan-engine.ts` (modify)
**What changes:** Replace the `gitignore.includes('.env')` block (lines 592-595) with a `git check-ignore --no-index .env` subprocess call wrapped in try/catch. Add `execSync` import from `node:child_process`.
**Pattern to follow:** `gitExec` in `src/engine/detectors/git.ts:55-61` — same try/catch-returning-null pattern, but inline rather than extracted.
**Why:** The substring match produces false positives for repos with `.env.local` but not `.env` in their gitignore.

### `packages/cli/src/commands/scan.ts` (modify)
**What changes:** Add "active " before "contributor" in the activity display line (around line 276).
**Pattern to follow:** The existing pluralization on the same line — `contributor${... === 1 ? '' : 's'}`.
**Why:** The field is `activeContributors` (a 14-day window) but the display says "contributors", which users read as total count.

### `packages/cli/tests/engine/scan-engine-secrets.test.ts` (create)
**What changes:** New test file for `detectSecrets()` gitignore detection logic. Tests four scenarios: happy path (`.env` in gitignore), false positive fix (`.env.local` only), fallback on non-git directory, and negation pattern handling.
**Pattern to follow:** `tests/engine/findings/secrets.test.ts` for temp directory lifecycle (mkdtempSync + rmSync in before/afterEach).
**Why:** `detectSecrets` had no dedicated tests. The new subprocess call needs coverage for both the success and failure paths — especially the fallback, since this is the first `execSync` in scan-engine.ts.

### `packages/cli/tests/commands/scan.test.ts` (modify)
**What changes:** Add a test verifying the contributor display line includes "active".
**Pattern to follow:** Existing display tests in the same file.
**Why:** Prevents regression on the label fix.

## Acceptance Criteria

- [ ] AC1: Scanning a repo where `.gitignore` contains `.env.local` but NOT `.env` produces `gitignoreCoversEnv: false`
- [ ] AC2: Scanning a repo where `.gitignore` contains `.env` produces `gitignoreCoversEnv: true` (no regression)
- [ ] AC3: The contributor display line reads "N active contributors" (not "N contributors")
- [ ] AC4: Singular form "1 active contributor" works correctly
- [ ] AC5: Existing env hygiene tests pass, new tests cover the `.env.local`-only false positive case
- [ ] AC6: No scan output changes for repos that already have `.env` in their gitignore
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`

## Testing Strategy

- **Unit tests (new file: `tests/engine/scan-engine-secrets.test.ts`):**
  - Export `detectSecrets` from scan-engine.ts for direct testing
  - Create temp directories with real git repos (`git init` + write `.gitignore`)
  - **Happy path:** `.gitignore` contains `.env` → `gitignoreCoversEnv: true`
  - **False positive fix:** `.gitignore` contains only `.env.local` → `gitignoreCoversEnv: false`
  - **Fallback: non-git directory:** Plain temp dir, no `git init` → `execSync` throws, `gitignoreCoversEnv: false`
  - **Negation pattern:** `.gitignore` has `.env` then `!.env` → git honors negation, `gitignoreCoversEnv: false`

- **Display test (modify `tests/commands/scan.test.ts`):**
  - Verify contributor label formatting includes "active" qualifier

- **Existing tests:** `tests/engine/findings/env.test.ts` — untouched. These test the finding rule with pre-computed booleans, not the detection logic.

## Dependencies

None. Both changes are independent of each other and of any in-progress work.

## Constraints

- `git check-ignore --no-index` requires git 2.10+ (2016). Safe for any modern environment.
- Engine files have zero CLI dependencies — the `execSync` import is from `node:child_process`, not a CLI package.
- The subprocess call is synchronous in an async function. This is fine — `detectSecrets` is already async for `fs` operations, and `execSync` for a single git command is instantaneous.

## Gotchas

- **`detectSecrets` is not exported.** The builder must add `export` to the function declaration for the new test file to import it. This is the only API surface change.
- **`git check-ignore` exit codes:** Exit 0 means the path IS ignored. Exit 1 means it is NOT ignored. Exit 128 means not a git repo. The try/catch handles 1 and 128 the same way (both mean "not covered"), which is correct — a non-zero exit causes `execSync` to throw.
- **The `gitignore.includes('.env')` block also reads the file.** The replacement removes both the `fs.readFile` and the `includes` check, replacing the entire try/catch block (lines 592-595) with the `git check-ignore` subprocess call. Don't leave the old file read in place.
- **Test temp dirs need `git init`.** `git check-ignore` only works inside a git repository. Three of the four test cases need `git init`; the non-git fallback test explicitly does NOT.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins: `import { execSync } from 'node:child_process'`
- Engine files have zero CLI dependencies — no chalk, no commander, no ora
- Use `import type` for type-only imports, separate from value imports
- Explicit return types on exported functions
- Exported functions require `@param` and `@returns` JSDoc tags
- Prefer early returns over nested conditionals
- Always use `--run` with pnpm test to avoid watch mode hang

### Pattern Extracts

From `src/engine/detectors/git.ts:55-61` — the try/catch pattern for git subprocess calls:
```typescript
function gitExec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}
```

From `tests/engine/findings/secrets.test.ts:21-29` — temp directory lifecycle:
```typescript
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
});
```

From `src/commands/scan.ts:274-276` — current contributor display:
```typescript
if (activity.activeContributors) {
  parts.push(`${activity.activeContributors} contributor${activity.activeContributors === 1 ? '' : 's'}`);
}
```

### Proof Context

**scan-engine.ts** — 6 pipeline cycles. Active findings about inline complexity and duplicate calls, but none related to `detectSecrets` or env hygiene. No overlap with current contract assertions.

**scan.ts** — 1 pipeline cycle. `formatHumanReadable` not exported, so display tested structurally. No overlap with current assertions.

### Checkpoint Commands

- After scan-engine.ts change: `(cd packages/cli && pnpm vitest run scan-engine-secrets)` — Expected: 4 new tests pass
- After scan.ts change: `(cd packages/cli && pnpm vitest run scan.test)` — Expected: existing + 1 new test pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 3179+ tests pass (3175 baseline + 4+ new)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 3175 passed, 2 skipped (3177 total)
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 3179+ tests in current + 1 new test file
- Regression focus: `tests/engine/findings/env.test.ts` (must remain untouched and passing)
