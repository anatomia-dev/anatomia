# Scope: Fix Workspace Glob Fallback

**Created by:** Ana
**Date:** 2026-05-24

## Intent

Three repos in the 90-repo validation set fail completely on `ana scan`: umami crashes, erxes gets zero detection, immich gets zero detection. These are the only repos where the product FAILS — every other known limitation is partial detection, not total failure. A developer hitting this on their first `npx anatomia-cli scan` would never come back.

The disease: `@manypkg/get-packages` can't handle two workspace edge cases — wildcard globs (`packages: ['**']`) and package.json files missing the `"name"` field. When these occur, the census builder either crashes (umami) or silently falls back to empty deps (erxes, immich). The root package.json has real deps that should be read but aren't.

## Complexity Assessment

- **Kind:** fix
- **Size:** small — 2 targeted fixes in one function, ~20 lines total
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/engine/census.ts` — expand `isSingleRepo` check (Fix A, 1 line), enhance catch fallback (Fix B, ~15 lines)
  - `packages/cli/tests/engine/census.test.ts` or `packages/cli/tests/engine/scanProject.test.ts` — tests for both fixes
- **Blast radius:** Low. Fix A changes one boolean condition that only fires when @manypkg returns 0 packages. Fix B adds root package.json reading in the catch block that currently produces empty deps. All 39 pnpm monorepos that currently work are unaffected — they have non-zero packages and @manypkg doesn't throw on them.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Two independent fixes in `buildCensus()` at census.ts, each addressing a different @manypkg failure mode.

**Fix A — Crash on 0-package workspace (umami)**

`@manypkg/get-packages` resolves umami's `packages: ['**']` glob and returns `tool='pnpm'` with `packages=[]` (0 packages). The `isSingleRepo` check at line 496 requires `result.tool.type === 'root'` to be true. Since `tool.type` is `'pnpm'` (not `'root'`), `isSingleRepo` is `false`. Census enters the monorepo branch (line 529), maps 0 packages to 0 source roots. At line 596, `sourceRoots.find(r => r.isPrimary)` returns `undefined`. The non-null assertion `!` at line 596 causes the crash: `primaryRoot.deps` → "Cannot read properties of undefined (reading 'deps')".

Fix: expand the `isSingleRepo` condition from:
```typescript
const isSingleRepo = !result || (result.tool.type === 'root' && nonRootPackages.length === 0);
```
to:
```typescript
const isSingleRepo = !result || nonRootPackages.length === 0;
```

When @manypkg returns a valid tool but 0 non-root packages, there are no workspace packages to process. The root package.json should be read as a single-repo. The `tool.type === 'root'` check was overly specific — it only matched when @manypkg couldn't determine the package manager. But "pnpm with 0 resolved packages" is equally a single-repo from the census perspective.

After this fix, umami enters the `isSingleRepo` branch at line 516, reads `rootPackage.packageJson` (which has 103 deps including Next.js, Prisma, React, Vitest), and produces a working scan.

**Fix B — Zero detection on @manypkg throw (erxes, immich)**

`@manypkg/get-packages` throws when workspace package.json files are missing the `"name"` field. erxes has 3 nameless package.json files in `backend/erxes-api-shared/`. immich has `.github/package.json` without a name. The catch block at line 488 sets `result = null`, and the fallback at line 503 creates a source root with empty deps (`deps: {}`, `devDeps: {}`). This is the "no package.json" fallback designed for Python/Go/Rust projects — it doesn't read the root package.json because it assumes none exists.

Fix: in the catch block, try reading root `package.json` directly. If it exists and parses, create the single-repo source root from it (with deps). If it doesn't exist, use the current empty-deps fallback.

```typescript
} catch {
  // @manypkg failed — try reading root package.json directly
  const rootPkgPath = path.join(normalizedRoot, 'package.json');
  if (existsSync(rootPkgPath)) {
    try {
      const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'));
      fallbackRootPackage = rootPkg;
    } catch { /* corrupt package.json — continue with empty fallback */ }
  }
}
```

Then the `!result` branch at line 503 checks for `fallbackRootPackage` and reads its deps if available, instead of always creating empty deps.

After this fix, erxes reads 145 prod deps + 91 dev deps from root package.json (mongoose, mongodb, @apollo/client, react, graphql all detected). immich reads 2 devDeps from root (minimal improvement — real deps are in workspace packages, which is a separate deeper scope).

## Acceptance Criteria

- AC1: `ana scan` on umami completes without crashing. Stack detection includes Next.js, Prisma, and React (from root package.json deps).
- AC2: `ana scan` on erxes detects database (Mongoose/MongoDB), framework (React or Apollo), and testing frameworks from root package.json deps. Not zero detection.
- AC3: `ana scan` on immich completes without crashing (already doesn't crash — just zero detection). Language should still be TypeScript (from Tier 3 tsconfig detection, already working).
- AC4: All existing monorepo scans produce identical results. The 39 pnpm monorepos, 13 yarn monorepos, and 6 npm monorepos in the test set are unaffected.
- AC5: `pnpm run test -- --run` passes.
- AC6: Build and lint pass.

## Edge Cases & Risks

**Fix A — could a real monorepo with packages be affected?**
No. `nonRootPackages.length === 0` only when @manypkg found 0 non-root packages. If @manypkg resolves workspace packages successfully, the count is > 0 and `isSingleRepo` is `false` — the monorepo path runs as before. The change only affects the "resolved 0 packages" case, which is currently a crash.

**Fix A — does this lose workspace detection?**
Yes, intentionally. umami IS a workspace project, but @manypkg couldn't resolve its packages. Treating it as single-repo reads root deps instead of crashing. The workspace tool information (`pnpm`) is available in `result.tool.type` — the scan could report "pnpm monorepo (workspace packages not resolved)" but that's a display enhancement, not a scope requirement. The minimum viable fix is: don't crash, read root deps.

**Fix A — what about `rootPackage` being null?**
When @manypkg succeeds, `result.rootPackage` is always present (it's the root package.json). The `isSingleRepo` branch at line 517 accesses `result.rootPackage!` — this is safe because if `result` exists and has 0 packages, `rootPackage` is the one package it DID find. Verified: umami returns `rootPackage` with `name: 'umami'` and 103 deps.

**Fix B — could reading root package.json cause harm?**
The root package.json is the developer's own file. Reading it to extract deps is the same operation the `isSingleRepo` branch already performs at line 524. The catch block just needs to provide the same data source. If the root package.json is corrupt (unparseable JSON), the inner try/catch handles it and falls through to the existing empty-deps fallback.

**Fix B — does this affect Python/Go/Rust projects?**
No. Python/Go/Rust projects don't have package.json at root. The `existsSync(rootPkgPath)` check at the start of Fix B returns false, and the empty-deps fallback runs as before.

**Fix B — what if @manypkg threw for a DIFFERENT reason?**
@manypkg can throw for: missing name field (erxes, immich), corrupt JSON, filesystem permission errors, or other edge cases. In all cases, reading root package.json is a reasonable fallback — it recovers the maximum possible information from the root level. Workspace package deps are lost, but root deps are better than nothing.

**Regression risk for existing repos:**
Fix A: the `isSingleRepo` condition becomes LESS restrictive (drops the `tool.type === 'root'` requirement). But it only becomes less restrictive when `nonRootPackages.length === 0` — a condition that means there are no workspace packages to process anyway. No existing repo with resolved packages is affected.

Fix B: the catch block adds code but doesn't change the existing path. When @manypkg throws AND root package.json exists, deps are read. When @manypkg throws AND no root package.json exists, the same empty-deps fallback runs. When @manypkg succeeds, the catch block doesn't fire at all.

## Rejected Approaches

**Custom workspace resolver as fallback.** Reading pnpm-workspace.yaml, resolving globs ourselves, and building source roots from valid packages. This would fully fix immich (recover server/ and web/ as workspace packages) and erxes (recover named backend packages). But it's 30-40 lines of new workspace resolution logic, a second code path for package discovery, and needs testing across all workspace config formats (pnpm, yarn, npm). The right fix eventually, but too much scope for a crash fix. The current approach recovers root deps and eliminates the crash — the deeper resolver is a follow-up.

**Catching the specific @manypkg error message.** Checking if the error mentions "missing 'name' field" and only doing the fallback for that specific error. Over-specific — the fallback is safe for ANY @manypkg failure, not just the name-missing case.

**Removing @manypkg entirely.** Building our own workspace resolver for all repos. Major rewrite, major risk, solves a problem that affects 3 of 90 repos.

## Open Questions

None. Both fixes are targeted, the blast radius is verified, and the fallback behavior is safe.

## Exploration Findings

### Patterns Discovered

- @manypkg returns `tool.type = 'pnpm'` even when it resolves 0 packages (umami). The tool detection succeeds (pnpm-workspace.yaml found) but glob resolution fails silently.
- @manypkg throws (not returns empty) when package.json files lack "name" field. This is a validation error in @manypkg, not a resolution failure.
- erxes has 3 nameless package.json files in `backend/erxes-api-shared/`. immich has 1 in `.github/`.
- umami's root package.json has 103 deps (64 prod + 39 dev) including Next.js, Prisma, React, Vitest.
- erxes's root package.json has 236 deps (145 prod + 91 dev) including Mongoose, MongoDB, Apollo, React, GraphQL.
- immich's root package.json has 2 devDeps only (prettier). Real deps are in server/ (81) and web/ (43).

### Constraints Discovered

- [VERIFIED] `result.rootPackage` is always present when @manypkg succeeds — verified on umami.
- [VERIFIED] The `isSingleRepo` branch at line 516-528 accesses `result.rootPackage!` — safe because result is non-null in that branch and rootPackage exists.
- [VERIFIED] 39 pnpm monorepos, 13 yarn monorepos, 6 npm monorepos in test set all have nonRootPackages.length > 0. Fix A's expanded condition doesn't affect any of them.
- [VERIFIED] Python/Go/Rust projects (bubbletea, ollama, fastapi, etc.) have no package.json at root. Fix B's existsSync check returns false — empty-deps fallback unchanged.
- [VERIFIED] `existsSync` and `readFileSync` are already imported in census.ts (line 11).

### Test Infrastructure

- `scanProject.test.ts` has integration tests that scan synthetic projects. The umami fix can be tested with a project that has pnpm-workspace.yaml but 0 resolvable packages. The erxes fix can be tested with a project where @manypkg throws.
- Alternatively, unit test `buildCensus` directly with a mocked @manypkg — but buildCensus is not currently exported for unit testing. The integration test path (create temp project, run scan) is more aligned with existing patterns.

## For AnaPlan

### Structural Analog

The existing catch block at census.ts:488 — same pattern, just enhanced with root package.json reading.

### Relevant Code Paths

- `packages/cli/src/engine/census.ts` line 496 — `isSingleRepo` condition (Fix A)
- `packages/cli/src/engine/census.ts` lines 488-491 — catch block (Fix B)
- `packages/cli/src/engine/census.ts` lines 503-515 — `!result` fallback (Fix B target)
- `packages/cli/src/engine/census.ts` lines 516-528 — `isSingleRepo` branch (the pattern Fix B should follow for reading root package.json)

### Patterns to Follow

- The existing `isSingleRepo` branch at line 516-528 for reading root package.json deps. Fix B should follow the same field access pattern.
- Error handling: inner try/catch with empty fallback, matching the existing catch-and-continue pattern.

### Known Gotchas

- `result.rootPackage!` at line 517 uses non-null assertion. After Fix A, this is safe because `result` is non-null (the `!result` check was already handled above) and `rootPackage` always exists when @manypkg succeeds. But the Plan should verify this assertion isn't moved to a context where it could be null.
- Fix B introduces `fallbackRootPackage` as a variable before the isSingleRepo check. This means the `!result` branch at line 503 needs to check for it. The cleanest implementation: read root package.json in the catch block, store it, then use it in the `!result` fallback.
- The `monorepoTool` at line 590 uses `result.tool.type`. After Fix A, umami goes through `isSingleRepo = true` but `result` still has `tool.type = 'pnpm'`. The `monorepoTool` would be set to `'pnpm'` (line 591) even though we're treating it as single-repo. This is actually correct — `monorepoTool` is `null` only when `isSingleRepo || !result`. After Fix A, `isSingleRepo` is `true`, so `monorepoTool` is `null`. The logic is: `(isSingleRepo || !result) ? null : ...`. Verified: this works correctly after Fix A.

### Things to Investigate

- Whether the scan terminal output should indicate "workspace packages not resolved" when Fix A or Fix B fires. Currently the scan would show no workspace info (no "X packages" in the header, no surfaces from workspace packages). A one-line note like "⚠ Workspace detected but packages could not be resolved" would help the developer understand why surfaces are missing. This is a display enhancement — not blocking for the fix scope.
