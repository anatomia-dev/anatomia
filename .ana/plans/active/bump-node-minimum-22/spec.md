# Spec: Bump Node Minimum to 22, Add Node 24 to CI

**Created by:** AnaPlan
**Date:** 2026-05-15
**Scope:** .ana/plans/active/bump-node-minimum-22/scope.md

## Approach

Lockstep version string replacement across all declaration points — engines fields, build target, CI matrix, documentation, and website copy. No code changes, no new files, no dependency updates. The predecessor scope (`fix-ci-matrix-and-broken-tests`) already landed and reduced the CI matrix to Ubuntu-only with Node `[20, 22]`. This scope replaces `20` with `22` and adds `24`.

Work in four layers, top-down:

1. **Config layer** — engines fields in all three package.json files, tsup build target, tsconfig comment
2. **CI layer** — test matrix, coverage upload gate
3. **Docs layer** — README, both CONTRIBUTINGs, ARCHITECTURE, deployment skill
4. **Website layer** — MDX sources, copy.ts, then regenerate llms-full.txt and search-index.json

Branch protection update is a post-merge manual step (requires admin permissions, depends on the new check names existing in CI first).

## Output Mockups

No user-facing output changes. The CLI produces identical behavior. The only visible changes are documentation strings and CI matrix labels.

CI check names change from:
```
Test (ubuntu-latest, Node 20)
Test (ubuntu-latest, Node 22)
```
to:
```
Test (ubuntu-latest, Node 22)
Test (ubuntu-latest, Node 24)
```

## File Changes

### `package.json` (modify)
**What changes:** `engines.node` from `>=20.0.0` to `>=22.0.0`
**Pattern to follow:** Same field, same format — just the version number
**Why:** Root engines declaration. pnpm respects this with `engine-strict`. Must match the actual minimum.

### `packages/cli/package.json` (modify)
**What changes:** `engines.node` from `>=20.0.0` to `>=22.0.0`
**Pattern to follow:** Same as root package.json
**Why:** Published package engines. npm warns users on install if their Node version is below this.

### `website/package.json` (modify)
**What changes:** `engines.node` from `>=20.11` to `>=22.0.0`
**Pattern to follow:** Same as root package.json
**Why:** Website runs on same infrastructure. Version mismatch creates confusion.

### `packages/cli/tsup.config.ts` (modify)
**What changes:** `target` from `'node20'` to `'node22'`
**Pattern to follow:** Line 6, string literal replacement
**Why:** Tells esbuild the syntax floor. No functional change (no differing syntax features), but the declaration should match the engines field.

### `tsconfig.base.json` (modify)
**What changes:** Comment on line 35 from "Node 20+" to "Node 22+"
**Pattern to follow:** Comment-only change
**Why:** Developer reference. Stale comment creates confusion about why target is ES2022.

### `.github/workflows/test.yml` (modify)
**What changes:** Three changes:
1. Matrix `node-version: [20, 22]` → `[22, 24]`
2. Coverage upload step name from "Node 20 only" to "Node 22 only"
3. Coverage condition from `matrix.node-version == 20` to `matrix.node-version == 22`
**Pattern to follow:** Existing workflow structure. Keep the numeric comparison (not string).
**Why:** Stop testing against EOL Node 20. Start testing against Node 24 (Current, LTS in Oct 2026).

### `README.md` (modify)
**What changes:** Line 56: "Requires Node.js 20+" → "Requires Node.js 22+"
**Pattern to follow:** Same sentence structure
**Why:** User-facing requirement statement.

### `CONTRIBUTING.md` (modify)
**What changes:** Line 13: "Node.js 20+" → "Node.js 22+"
**Pattern to follow:** Same sentence structure
**Why:** Contributor setup instructions.

### `packages/cli/CONTRIBUTING.md` (modify)
**What changes:** Three locations:
1. Line 12: "Node.js 20+" → "Node.js 22+"
2. Line 398: "Node 20/22" → "Node 22/24"
3. Line 414: "Node 20/22" → "Node 22/24"
**Pattern to follow:** Same sentence structure at each location
**Why:** CLI-specific contributor docs. Lines 398 and 414 describe the CI matrix.

### `packages/cli/ARCHITECTURE.md` (modify)
**What changes:** Line 225: "Node 20/22" → "Node 22/24"
**Pattern to follow:** Same sentence structure
**Why:** Architecture doc describes CI enforcement layer.

### `.claude/skills/deployment/SKILL.md` (modify)
**What changes:** Line 12: "Node 20, 22" → "Node 22, 24"
**Pattern to follow:** Same sentence structure
**Why:** Agent-facing deployment skill. Stale version info causes agents to make wrong assumptions.

### `website/content/docs/start.mdx` (modify)
**What changes:** Line 10: "Node.js 20 or later" → "Node.js 22 or later"
**Pattern to follow:** Same sentence structure
**Why:** Getting started page — first thing new users see.

### `website/content/docs/guides/troubleshooting.mdx` (modify)
**What changes:** Line 15: "Node 20+" → "Node 22+"
**Pattern to follow:** Same sentence structure
**Why:** Troubleshooting guide references minimum version.

### `website/lib/copy.ts` (modify)
**What changes:** Line 475: "Requires Node 20+ and Git" → "Requires Node 22+ and Git"
**Pattern to follow:** Same string, same location
**Why:** User-facing website copy rendered on the site.

### `website/public/llms-full.txt` (regenerated)
**What changes:** Regenerated by running `cd website && pnpm prebuild`. Will reflect the updated MDX sources.
**Pattern to follow:** Never edit directly — always regenerate via script.
**Why:** Stale generated file contradicts source MDX.

### `website/public/search-index.json` (regenerated)
**What changes:** Regenerated as side effect of the same prebuild script. May or may not change (no Node version references in search index verified by scope).
**Pattern to follow:** Same — regenerate, commit whatever changed.
**Why:** Consistency with source MDX.

## Acceptance Criteria

- [ ] AC1: `engines.node` is `>=22.0.0` in both `package.json` and `packages/cli/package.json`
- [ ] AC2: `tsup.config.ts` target is `node22`
- [ ] AC3: CI test matrix is `node-version: [22, 24]` (Node 20 removed, Node 24 added)
- [ ] AC4: Coverage upload gated on `matrix.node-version == 22`
- [ ] AC5: Branch protection required status checks are `Test (ubuntu-latest, Node 22)` and `Test (ubuntu-latest, Node 24)` (post-merge manual step)
- [ ] AC6: README says "Requires Node.js 22+"
- [ ] AC7: `website/content/docs/start.mdx` says "Node.js 22 or later"
- [ ] AC8: `website/content/docs/guides/troubleshooting.mdx` says "Node 22+"
- [ ] AC9: `website/public/llms-full.txt` regenerated via `prebuild` script
- [ ] AC10: All remaining documentation references updated: `CONTRIBUTING.md` (root), `packages/cli/CONTRIBUTING.md`, `packages/cli/ARCHITECTURE.md`, `.claude/skills/deployment/SKILL.md`, `tsconfig.base.json` (comment), `website/package.json` (engines), `website/lib/copy.ts`
- [ ] AC11: All tests pass
- [ ] AC12: No build errors (`pnpm --filter anatomia-cli build`)
- [ ] AC13: No lint errors (`cd packages/cli && pnpm lint`)

## Testing Strategy

- **Unit tests:** None to write. Zero code changes — only version strings and documentation.
- **Integration tests:** Existing test suite validates the build works. Run full suite to confirm no regressions.
- **Edge cases:** None. This is a chore scope with no behavioral changes.

## Dependencies

- `fix-ci-matrix-and-broken-tests` must have landed. **Verified: it has.** The CI matrix is currently `[ubuntu] x [20, 22]`.

## Constraints

- **No tsconfig target change.** `target: ES2022` and `lib: [ES2022]` stay as-is. The scope explicitly rejects bumping to ES2024 — no features require it.
- **Coverage gate uses numeric comparison.** `matrix.node-version == 22` not `== '22'`. Matches existing convention in the workflow.
- **Branch protection is post-merge.** AnaBuild does not run `gh api` for protection rules. The developer handles this after merge, same as the predecessor scope.
- **Generated files are regenerated, never hand-edited.** `llms-full.txt` and `search-index.json` are produced by `website/scripts/extract-docs-data.ts`.

## Gotchas

- **Line numbers may drift.** The scope references specific line numbers. AnaBuild should search for the content strings (e.g., `"Node.js 20+"`, `"node": ">=20.0.0"`) rather than relying on line numbers.
- **Two files have multiple update locations.** `packages/cli/CONTRIBUTING.md` has 3 locations (lines 12, 398, 414). Miss one and the doc contradicts itself.
- **Regeneration order matters.** Edit all MDX sources FIRST, then run `cd website && pnpm prebuild` ONCE. Running prebuild between edits wastes time and may produce intermediate artifacts.
- **`website/package.json` engines format differs.** Currently `>=20.11` (not `>=20.0.0`). Normalize to `>=22.0.0` for consistency with root and CLI package.json.
- **Coverage upload step name is a comment, not a check name.** The string "Node 20 only" in the step name is cosmetic. The functional part is the `if:` condition.

## Build Brief

### Rules That Apply
- This is a chore — no new code, no new exports, no new tests. All changes are string replacements in existing files.
- Generated files (`llms-full.txt`, `search-index.json`) must be regenerated via `cd website && pnpm prebuild`, never hand-edited.
- Commit all changed files including regenerated output.

### Pattern Extracts

**CI matrix and coverage gate** (`.github/workflows/test.yml:22-24,65-67`):
```yaml
    strategy:
      fail-fast: false
      matrix:
        node-version: [20, 22]
```
```yaml
      - name: Upload coverage (Node 20 only)
        if: matrix.node-version == 20
```

**tsup target** (`packages/cli/tsup.config.ts:6`):
```typescript
  target: 'node20',
```

**Website copy** (`website/lib/copy.ts:475`):
```typescript
      reqs: "Requires Node 20+ and Git",
```

### Proof Context
- `package.json` and `packages/cli/package.json`: Known concern about `prepublishOnly` path and npm pack scope — not relevant to this change.
- `.github/workflows/test.yml`: Known finding about staging branch in trigger list — not relevant to this change.
- No active proof findings for remaining affected files.

### Checkpoint Commands

- After config changes (engines, tsup, tsconfig): `(cd packages/cli && pnpm vitest run)` — Expected: 2297 passed, 2 skipped
- After all source edits + regeneration: `(cd packages/cli && pnpm vitest run)` — Expected: same (no test count change)
- Build: `(cd packages/cli && pnpm run build)` — Expected: clean build
- Lint: `(cd packages/cli && pnpm lint)` — Expected: no errors

### Build Baseline
- Current tests: 2297 passed, 2 skipped (104 test files)
- Command used: `cd packages/cli && pnpm vitest run`
- After build: same — no new tests expected
- Regression focus: none — no code changes, only version strings
