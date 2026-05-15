# Scope: Bump Node Minimum to 22, Add Node 24 to CI

**Created by:** Ana
**Date:** 2026-05-14

## Intent

Node 20 passed its maintenance EOL in April 2026 — it no longer receives security patches. Our engines field still declares `>=20`, our CI still tests against it, and our docs still advertise it. Meanwhile Node 22 is current LTS (maintained until April 2027) and Node 24 is Current (LTS in October 2026). We should stop validating against a dead version and start validating against the version our users will be on next.

This scope depends on `fix-ci-matrix-and-broken-tests` landing first — that scope trims the OS matrix to Ubuntu-only and fixes the 3 broken tests. This scope then replaces Node 20 with Node 24 in the remaining matrix.

## Complexity Assessment
- **Kind:** chore
- **Size:** small — version string updates across ~17 locations, one branch protection API call, one regeneration step
- **Files affected:** `package.json`, `packages/cli/package.json`, `packages/cli/tsup.config.ts`, `.github/workflows/test.yml`, `README.md`, `CONTRIBUTING.md`, `packages/cli/CONTRIBUTING.md`, `packages/cli/ARCHITECTURE.md`, `.claude/skills/deployment/SKILL.md`, `tsconfig.base.json` (comment), `website/package.json`, `website/content/docs/start.mdx`, `website/content/docs/guides/troubleshooting.mdx`, `website/lib/copy.ts`, `website/public/llms-full.txt` (regenerated), `website/public/search-index.json` (regenerated)
- **Blast radius:** Low. Zero code changes. No dependency incompatibilities — all 9 production deps accept Node 22+. No version-conditional code paths exist in the source. The tsup target change (`node20` → `node22`) produces identical build output because we use no syntax features that differ between the two.
- **Estimated effort:** 30 minutes
- **Multi-phase:** no

## Approach

Update the minimum supported Node version from 20 to 22 across all declaration points (engines, tsup target, CI matrix, docs). Replace Node 20 with Node 24 in the CI test matrix so we validate current LTS + Current. Move the coverage upload gate from Node 20 to Node 22 (follows convention of uploading from the lowest supported version). Update branch protection required status checks to match the new matrix check names.

No tsconfig changes — `target: ES2022` and `lib: [ES2022]` stay as-is. We don't use ES2024 features, so bumping the target would raise the floor without providing value. Bump when we adopt new syntax, not before.

## Acceptance Criteria

- AC1: `engines.node` is `>=22.0.0` in both `package.json` and `packages/cli/package.json`
- AC2: `tsup.config.ts` target is `node22`
- AC3: CI test matrix is `node-version: [22, 24]` (Node 20 removed, Node 24 added)
- AC4: Coverage upload gated on `matrix.node-version == 22`
- AC5: Branch protection required status checks are `Test (ubuntu-latest, Node 22)` and `Test (ubuntu-latest, Node 24)`
- AC6: README says "Requires Node.js 22+"
- AC7: `website/content/docs/start.mdx` says "Node.js 22 or later"
- AC8: `website/content/docs/guides/troubleshooting.mdx` says "Node 22+"
- AC9: `website/public/llms-full.txt` regenerated via `prebuild` script (reflects updated MDX sources)
- AC10: All remaining documentation references updated: `CONTRIBUTING.md` (root), `packages/cli/CONTRIBUTING.md`, `packages/cli/ARCHITECTURE.md`, `.claude/skills/deployment/SKILL.md` (Node version portion), `tsconfig.base.json` (comment), `website/package.json` (engines), `website/lib/copy.ts` (user-facing copy)
- AC11: All tests pass on both Node 22 and Node 24

## Edge Cases & Risks

- **Branch protection sequencing:** Same constraint as `fix-ci-matrix-and-broken-tests` — the required status check names change from `Test (ubuntu-latest, Node 20)` and `Test (ubuntu-latest, Node 22)` to `Test (ubuntu-latest, Node 22)` and `Test (ubuntu-latest, Node 24)`. Must update protection rules before or during merge. Since `fix-ci-matrix-and-broken-tests` handles the first protection update, this scope modifies an already-reduced set.
- **pnpm engines enforcement:** pnpm respects `engines` in package.json during `pnpm install` when `engine-strict` is set. Users with pnpm + engine-strict + Node 20 would be blocked from installing. This is intentional — Node 20 is EOL.
- **search-index.json:** Contains no Node version references (verified). No update needed.
- **tsconfig target stays ES2022:** If someone later uses `Object.groupBy` or `Array.fromAsync` (ES2024) without bumping the target, TypeScript will flag it at compile time. This is the desired behavior — the type system catches it.
- **Release workflow stays on Node 24:** Already builds and publishes on Node 24. No change needed.
- **Dependabot:** May propose PRs that reference Node 20 in action configurations. The `github-actions` ecosystem update in dependabot.yml will handle this naturally.
- **website/package.json engines:** Currently `>=20.11`. Should bump to `>=22.0.0` for consistency, even though the website is a separate package — it runs on the same infrastructure and a version mismatch creates confusion.
- **llms-full.txt and search-index.json regeneration:** Both are generated by `website/scripts/extract-docs-data.ts` (runs as `prebuild`). Editing MDX sources without regenerating leaves these files stale. The build agent must run `cd website && pnpm prebuild` (or equivalent) after editing MDX files, then commit the regenerated output.

## Rejected Approaches

**Bump minimum to Node 24.** Node 24 isn't LTS yet (becomes LTS October 2026). Some users' CI environments or managed hosting platforms may not have Node 24 available. The safe floor is current LTS (22); we test against Current (24) to catch forward-compat issues without blocking users.

**Add a runtime version check at CLI startup.** Our users have Claude Code installed, which already requires Node >= 18. Adding a `process.version` check in `src/index.ts` solves a problem we don't have — nobody is reaching `ana scan` on Node 18 without Claude Code already being present. The `engines` field warns at install time, which is sufficient.

**Bump tsconfig target to ES2024.** We don't use any ES2024 syntax features (`Object.groupBy`, `Array.fromAsync`, `Promise.withResolvers`, iterator helpers). Bumping the target without using the features raises the minimum JS engine requirement for zero benefit. Bump when we adopt, not before.

**Keep Node 20 in the matrix alongside 22 and 24.** Testing against an EOL version gives false confidence. If a user reports a Node 20 issue, we would tell them to upgrade. Testing against it implies a support commitment we don't intend to honor.

## Open Questions

None. Coverage upload convention resolved: gate on Node 22 (lowest supported version). Zero version-conditional code paths in source, so coverage reports are identical across versions — convention is the tiebreaker.

## Exploration Findings

### Patterns Discovered
- `tsup.config.ts`: target field controls esbuild syntax floor. Changing `node20` → `node22` is a string replacement with zero effect on output (no differing syntax features used).
- `vitest.config.ts`: coverage provider is `v8` (Node's built-in). No version-specific behavior.
- All 9 production deps accept Node 22+: `commander@14` (>=20), `chalk@5` (>=16), `ora@8` (>=18), `yaml@2` (>=14.6), rest have no engine constraints.

### Constraints Discovered
- [TYPE-VERIFIED] Node 20 maintenance EOL: April 2026 — past (nodejs.org release schedule)
- [TYPE-VERIFIED] Node 22 maintenance until: April 2027 (nodejs.org release schedule)
- [TYPE-VERIFIED] Node 24 LTS date: October 2026 (nodejs.org release schedule)
- [OBSERVED] Zero `process.version` checks in source — no version-conditional code paths
- [OBSERVED] Zero deprecated Node API usage (`Buffer()`, `url.parse`, etc.)
- [OBSERVED] web-tree-sitter is pure WASM, no native bindings — Node version agnostic
- [OBSERVED] `createHash('sha256')` usage in 3 files — stable API, no OpenSSL 3.5 concerns for SHA-256

### Test Infrastructure
- WASM smoke test (`tests/engine/integration/wasm-smoke.test.ts`) validates tree-sitter loads and parses — passes on all Node versions
- Coverage thresholds enforced in `vitest.config.ts`: lines 80%, branches 75%, functions 80%, statements 80%

## For AnaPlan

### Structural Analog
The `fix-ci-matrix-and-broken-tests` scope (predecessor in the same pipeline area). Same files, same branch protection update pattern, same matrix modification pattern. The planner should reference that scope's spec for the protection update mechanism.

### Relevant Code Paths
**Engines and build config:**
- `package.json:23` — root engines: `"node": ">=20.0.0"` → `">=22.0.0"`
- `packages/cli/package.json:40` — package engines: `"node": ">=20.0.0"` → `">=22.0.0"`
- `packages/cli/tsup.config.ts:6` — build target: `'node20'` → `'node22'`
- `website/package.json:38` — website engines: `"node": ">=20.11"` → `">=22.0.0"`

**CI workflow:**
- `.github/workflows/test.yml:24` — matrix: `[20, 22]` → `[22, 24]` (after scope 1 lands)
- `.github/workflows/test.yml:66-67` — coverage comment + condition: `Node 20` → `Node 22`

**Documentation (user-facing):**
- `README.md:56` — "Requires Node.js 20+"
- `CONTRIBUTING.md:13` — "Requires Node.js 20+ and pnpm 9+"
- `packages/cli/CONTRIBUTING.md:12` — "Node.js 20+"
- `website/content/docs/start.mdx:10` — "Node.js 20 or later"
- `website/content/docs/guides/troubleshooting.mdx:15` — "Node 20+ required"
- `website/lib/copy.ts:475` — "Requires Node 20+ and Git"

**Documentation (developer/agent-facing):**
- `tsconfig.base.json:35` — comment: "Node 20+ supports ES2022" → "Node 22+"
- `packages/cli/ARCHITECTURE.md:225` — "Node 20/22" → "Node 22/24" (OS portion already fixed by scope 1)
- `packages/cli/CONTRIBUTING.md:398,414` — "Node 20/22" → "Node 22/24" (OS portion already fixed by scope 1)
- `.claude/skills/deployment/SKILL.md:12` — Node version portion (OS portion already fixed by scope 1)

**Generated files (regenerated, not edited directly):**
- `website/public/llms-full.txt:710,1052` — generated from MDX sources by `website/scripts/extract-docs-data.ts`
- `website/public/search-index.json` — generated by same script (no Node 20 references, but regenerated as side effect)

### Patterns to Follow
- Every version reference updates in lockstep — engines, target, CI, docs. Missing one creates a lie somewhere.
- Branch protection update via `gh api` — same pattern as predecessor scope

### Known Gotchas
- `llms-full.txt` IS generated — by `website/scripts/extract-docs-data.ts`, runs as `prebuild` in website/package.json. Edit MDX sources, then run `cd website && pnpm prebuild` to regenerate both `llms-full.txt` and `search-index.json`. Commit the regenerated output.
- The coverage upload condition in test.yml references `matrix.node-version` as a number, not a string — `== 22` not `== '22'`
- This scope MUST land after `fix-ci-matrix-and-broken-tests`. The predecessor changes the matrix from `[ubuntu, windows, macos] x [20, 22]` to `[ubuntu] x [20, 22]`. This scope then changes to `[ubuntu] x [22, 24]`. If sequencing is violated, the branch protection updates collide.
- Several files are touched by BOTH scopes (ARCHITECTURE.md, CONTRIBUTING.md, deployment skill). Scope 1 updates OS references; this scope updates Node version references. The planner should read these files fresh (after scope 1 lands) rather than assuming line numbers from this scope document.
- `website/lib/copy.ts:475` is user-facing website copy — the text "Requires Node 20+ and Git" appears in the rendered site. This is not documentation, it's product copy.

### Things to Investigate
None — all open questions resolved during research.
