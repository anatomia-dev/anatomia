# Proof Chain Dashboard

132 runs · 116 active · 3 promoted · 659 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 25 | 20 | 2026-05-20 |
| cli | 88 | 80 | 2026-05-21 |
| website | 19 | 16 | 2026-05-18 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/init/state.ts | 11 | 5 |
| packages/cli/src/commands/work.ts | 10 | 8 |
| packages/cli/src/engine/detectors/projectType.ts | 8 | 3 |
| packages/cli/tests/commands/work.test.ts | 7 | 6 |
| packages/cli/src/utils/proofSummary.ts | 4 | 3 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 116 total)

### packages/cli/src/commands/config.ts

- **code:** config delete on top-level machine-managed fields (anaVersion, name, etc.) blocked by MACHINE_MANAGED_FIELDS guard, but delete on whole 'surfaces' key is allowed — could wipe all surfaces — *Surface Awareness Schema and Pipeline Integration*

### packages/cli/src/commands/doctor.ts

- **code:** assessSurfaces reads ana.json independently — adds to known duplicate-read pattern (add-doctor-command-C3) — *Surface Awareness Bridge*

### packages/cli/src/commands/init/state.ts

- **code:** Surface path injected into shell command without sanitization — paths with spaces or special chars produce broken subshell — *Surface Awareness Schema and Pipeline Integration*
- **code:** Non-Node surface gets empty commands object instead of null commands — no native command generation for Rust/Go surfaces — *Surface Awareness Schema and Pipeline Integration*
- **code:** displaySuccessMessage surface padding hardcoded at padEnd(9) — surface names longer than 8 chars will misalign — *Surface Awareness Schema and Pipeline Integration*
- **test:** A020 has no tagged test — verified by source inspection only — *Command Detection Language Awareness*
- **code:** displaySuccessMessage treats empty string test command as null for init display — consistent with upstream blank sanitizer — *Command Detection Language Awareness*
- **code:** buildNonNodeCommands returns early per-language without fallthrough — adding a new language requires a new if-block, no extensibility pattern — *Command Detection Language Awareness*

### packages/cli/src/commands/proof.ts

- **code:** Surface validation reads ana.json from disk on every --surface invocation — consistent with existing patterns but adds to file I/O per command — *Surface Awareness Bridge*

### packages/cli/src/commands/work.ts

- **code:** Backfill iterates all chain.entries on every work complete — O(n) with no short-circuit after first fully-backfilled run — *Surface Awareness Bridge*

### packages/cli/src/engine/census.ts

- **code:** 29 FRAMEWORK_HINTS entries vs spec's claim of 18+9=27 — 2 entries existed before this build (react-router.config.ts, astro.config.ts), making the true delta 11 new entries not 9 — *Scan Surface Detection*

### packages/cli/src/engine/detectors/dependencies.ts

- **code:** @openrouter/ai-sdk-provider added to AI_PACKAGES but not in spec — over-building with zero test coverage — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*
- **code:** AI_SDK_EXCLUSIONS set recreated on every detectServiceDeps call — could be module-level constant — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*

### packages/cli/src/engine/detectors/projectType.ts

- **code:** Stale docstring — says 'Python → Go → Rust → Ruby → PHP' but polyglot tier order is Python → Rust → Ruby → Go — *Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects*
- **code:** indexOf('\n[') section boundary misses header at position 0 of sliced block — inherited from hasPythonProjectDeps pattern — *Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects*

### packages/cli/src/engine/detectors/surfaces.ts

- **code:** deriveRawName @scope stripping handles segment-level scoped names but path-level scoped packages use last path segment after split, making the @scope branch in deriveRawName unreachable for standard monorepo layouts — *Scan Surface Detection*
- **code:** Collision disambiguation can still produce duplicates if two version-like paths share the same parent (e.g., packages/api/v1 and packages/api/v2 both become api-v1 and api-v2 — fine, but apps/api/v1 and packages/api/v1 would both become api-v1 after version normalization) — *Scan Surface Detection*

### packages/cli/src/engine/scan-engine.ts

- **code:** detectNonNodeTesting Ruby branch uses existsSync (synchronous) inside an async function — inconsistent with other branches that use async reads — *Command Detection Language Awareness*

### packages/cli/src/utils/displayNames.ts

- **code:** nuxt and astro missing from FRAMEWORK_DISPLAY_NAMES — surfaces display lowercase keys instead of 'Nuxt'/'Astro' — *Scan Surface Detection*

### packages/cli/src/utils/proofSummary.ts

- **code:** Redundant type annotation: surface?: string | undefined — the ? already implies | undefined — *Surface Awareness Bridge*

### packages/cli/src/utils/worktree.ts

- **code:** getBuildCommandString exported solely for testing with @internal tag — follows project convention but increases public API surface — *Command Detection Language Awareness*

### packages/cli/templates/.claude/agents/ana-learn.md

- **test:** No tagged test for A018/A019 learn template assertions — verified by source inspection only — *Surface Awareness Bridge*

### packages/cli/tests/commands/proof-surface-derivation.test.ts

- **code:** deriveSurface logic duplicated in test — test reimplements work.ts logic instead of importing it — *Surface Awareness Schema and Pipeline Integration*

### packages/cli/tests/commands/scope-surface-validation.test.ts

- **test:** A019 scope rejection test depends on cwd-based findProjectRoot — fragile coupling between test isolation and global state — *Surface Awareness Schema and Pipeline Integration*

### packages/cli/tests/commands/template-surface-awareness.test.ts

- **test:** A028 Zod schema test — malformed entry defaults checked but no test for completely invalid surfaces value (e.g., surfaces: 42) — *Surface Awareness Schema and Pipeline Integration*

### packages/cli/tests/commands/work.test.ts

- **test:** A021 idempotency test checks pure function determinism, not backfill loop guard — *Surface Awareness Bridge*

### packages/cli/tests/engine/census-detection.test.ts

- **test:** Workspace label tests verify a replicated helper, not the actual scan-engine.ts ternary — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*

### packages/cli/tests/engine/detectors/ai-sdk-detection.test.ts

- **test:** Wildcard capitalization only tested with single-word providers — no test for hyphenated wildcard input like @ai-sdk/foo-bar — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*

### packages/cli/tests/engine/detectors/surfaces.test.ts

- **test:** A023 tests STRONG_FRAMEWORK_CONFIGS presence as proxy for FRAMEWORK_HINTS count — FRAMEWORK_HINTS is not exported — *Scan Surface Detection*
- **test:** A021 tests data shape availability, not actual terminal output containing 'Surfaces' string — *Scan Surface Detection*

