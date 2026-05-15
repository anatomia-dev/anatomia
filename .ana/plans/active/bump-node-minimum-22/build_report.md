# Build Report: Bump Node Minimum to 22, Add Node 24 to CI

**Created by:** AnaBuild
**Date:** 2026-05-15
**Spec:** .ana/plans/active/bump-node-minimum-22/spec.md
**Branch:** feature/bump-node-minimum-22

## What Was Built
- `package.json` (modified): engines.node from `>=20.0.0` to `>=22.0.0`
- `packages/cli/package.json` (modified): engines.node from `>=20.0.0` to `>=22.0.0`
- `website/package.json` (modified): engines.node from `>=20.11` to `>=22.0.0` (normalized format)
- `packages/cli/tsup.config.ts` (modified): target from `node20` to `node22`
- `tsconfig.base.json` (modified): comment from "Node 20+" to "Node 22+"
- `.github/workflows/test.yml` (modified): matrix `[20, 22]` → `[22, 24]`, coverage gate on Node 22
- `README.md` (modified): "Node.js 20+" → "Node.js 22+"
- `CONTRIBUTING.md` (modified): "Node.js 20+" → "Node.js 22+"
- `packages/cli/CONTRIBUTING.md` (modified): 3 locations updated (line 12: "Node.js 22+", lines 398/414: "Node 22/24")
- `packages/cli/ARCHITECTURE.md` (modified): "Node 20/22" → "Node 22/24"
- `.claude/skills/deployment/SKILL.md` (modified): "Node 20, 22" → "Node 22, 24"
- `website/content/docs/start.mdx` (modified): "Node.js 20 or later" → "Node.js 22 or later"
- `website/content/docs/guides/troubleshooting.mdx` (modified): "Node 20+" → "Node 22+"
- `website/lib/copy.ts` (modified): "Requires Node 20+" → "Requires Node 22+"
- `website/public/llms-full.txt` (regenerated): via `pnpm prebuild`
- `website/public/search-index.json` (regenerated): via `pnpm prebuild`

## PR Summary

- Bump Node.js minimum from 20 to 22 across all engines declarations, build config, and documentation
- Update CI test matrix from `[20, 22]` to `[22, 24]`, with coverage upload gated on Node 22
- Update all user-facing docs (README, getting started, troubleshooting) and contributor docs (CONTRIBUTING, ARCHITECTURE)
- Regenerate website assets (llms-full.txt, search-index.json) to reflect updated MDX sources

## Acceptance Criteria Coverage

- AC1 "engines.node >=22.0.0 in both package.json files" → ✅ Verified (grep confirms `>=22.0.0` in both files)
- AC2 "tsup target is node22" → ✅ Verified (tsup output shows `Target: node22`)
- AC3 "CI matrix is [22, 24]" → ✅ Verified (edited from `[20, 22]` to `[22, 24]`)
- AC4 "Coverage gated on node-version == 22" → ✅ Verified (edited condition and step name)
- AC5 "Branch protection checks" → 🔨 Post-merge manual step (as specified in constraints)
- AC6 "README says Node.js 22+" → ✅ Verified
- AC7 "start.mdx says Node.js 22 or later" → ✅ Verified
- AC8 "troubleshooting.mdx says Node 22+" → ✅ Verified
- AC9 "llms-full.txt regenerated" → ✅ Verified (contains "Node.js 22", zero "Node.js 20 or later")
- AC10 "All remaining docs updated" → ✅ Verified (all 7 files updated)
- AC11 "All tests pass" → ✅ Verified (2297 passed, 2 skipped)
- AC12 "No build errors" → ✅ Verified (build success)
- AC13 "No lint errors" → ✅ Verified (0 errors, 1 pre-existing warning in git-operations.ts)

## Implementation Decisions

- The prebuild script updated dynamic values (ana:dynamic markers) in 5 additional MDX files beyond those in the spec. These are legitimate side effects of the prebuild regeneration process — the script injects computed values at build time. Included in the website commit since they are part of the regeneration step the spec calls for.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
 Test Files  104 passed (104)
      Tests  2297 passed | 2 skipped (2299)
   Duration  38.37s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
 Test Files  104 passed (104)
      Tests  2297 passed | 2 skipped (2299)
   Duration  39.14s
```

### Comparison
- Tests added: 0
- Tests removed: 0
- Regressions: none

### New Tests Written
None — spec specifies no tests (chore scope, zero code changes).

## Verification Commands
```bash
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
91a1603a [bump-node-minimum-22] Update website copy and regenerate assets
20440b53 [bump-node-minimum-22] Update documentation references to Node 22
06b8117b [bump-node-minimum-22] Update CI matrix to Node 22/24
d8048704 [bump-node-minimum-22] Bump Node minimum to 22 in config layer
```

## Open Issues

- Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive for `no-control-regex`. Not introduced by this build.

Verified complete by second pass.
