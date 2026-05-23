# Scope: Backend Service Surface Detection

**Created by:** Ana
**Date:** 2026-05-22

## Intent

The surface detector has a structural blind spot for backend services. All three existing signals rely on filesystem artifacts: bin fields (Signal 1), directory conventions (Signal 2), and config files (Signal 3). Backend frameworks like Express, Fastify, Koa, Hono, and Elysia are imported as dependencies — they leave no filesystem trace beyond package.json. This causes 6-8 repos in the 85-repo validation set to have legitimate backend services invisible to the scan. A startup with a Next.js frontend + Express API backend detects the frontend but misses the backend entirely.

## Complexity Assessment

- **Kind:** feature
- **Size:** small — one new signal in an existing pure function, one prerequisite bug fix
- **Surface:** cli
- **Files affected:**
  - `src/engine/detectors/surfaces.ts` — Signal 3 `continue` fix, `SERVER_FRAMEWORK_DEPS` constant, `MIN_FILES_SERVER_DEP` constant, Signal 4 logic
  - `tests/engine/detectors/surfaces.test.ts` — Signal 4 tests, Signal 3 `continue` regression test
- **Blast radius:** Low. `detectSurfaces` is a pure function called once at the terminal end of the scan pipeline (scan-engine.ts:996). Its output does not feed back into any other detector — not shape detection, not primary selection, not dependency detection. Downstream consumers (`createAnaJson`, `mergeSurfaces`, `doctor`, `work`, `proof`) all handle variable surface counts. Adding more surfaces is purely additive to scan.json and ana.json.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Add a fourth signal to `detectSurfaces()`: if a workspace package has a server framework as a production dependency AND has a development script (`dev` or `start:dev`) AND has 15+ source files, classify it as a backend service surface. Fix the prerequisite missing `continue` on Signal 3 to prevent duplicate candidates.

The threshold philosophy is principled, not arbitrary. Each signal has an evidence strength that determines its file count gate:

- **Strong signals** (bin field, config file) trust at `MIN_SOURCE_FILES = 5`. A bin field or a `next.config.ts` is unambiguous — if it exists, the package is almost certainly a surface.
- **Medium signals** (server framework dep + dev script) require `MIN_FILES_SERVER_DEP = 15`. The two-signal gate (dependency + script) is weaker than filesystem artifacts — shared libraries can have server frameworks in deps and dev scripts for watch mode. 15 source files is the point where "service" becomes much more likely than "utility."
- **Weak signals** (apps/ directory without config) require `APPS_DIR_FILE_THRESHOLD = 50`. Directory convention alone is the weakest evidence — any package can live under apps/.

This forms an evidence ladder where each threshold corresponds to a signal strength tier: the weaker the signal, the more supporting evidence (file count) required. The three tiers are well-separated (5, 15, 50). The threshold of 15 is a conservative initial value validated against 85 real-world repos — the smallest genuine miss in the set is dittofeed at 44 files, so 15 is well below the true positives while above the false positives (highlight/packages/ai at 5 files). This threshold may need adjustment based on field data from microservice-heavy architectures where backend services with 6-14 source files are plausible (BFF layers, simple API gateways).

## Acceptance Criteria

- AC1: Signal 3 (line 289) has `continue` after `candidates.push()`, matching Signals 1 and 2. A package matching both Signal 3 and Signal 4 is pushed exactly once.
- AC2: `SERVER_FRAMEWORK_DEPS` is a named, exported constant containing: express, fastify, koa, hono, @hono/node-server, @nestjs/core, elysia, polka, restify, h3. No protocol libraries (@trpc/server, socket.io, ws, graphql-yaml, @grpc/grpc-js).
- AC3: Signal 4 checks `root.deps` (production dependencies only), not `root.devDeps`. A package with express in devDeps + dev script does NOT trigger Signal 4.
- AC4: Signal 4 requires `root.fileCount >= MIN_FILES_SERVER_DEP` (15). Packages with fewer than 15 source files do not trigger Signal 4 regardless of deps and scripts.
- AC5: Signal 4 accepts `dev` or `start:dev` as the development script. `start:dev` is the NestJS convention for development mode — without it, `@nestjs/core` in SERVER_FRAMEWORK_DEPS would be dead weight for NestJS backends that lack `nest-cli.json`. The check should match exact script key names, not substring.
- AC6: Signal 4 fires after Signal 3 (with `continue`), so packages already caught by Signals 1-3 are not re-evaluated. Signal evaluation order is load-bearing — a code comment must document this.
- AC7: `MIN_FILES_SERVER_DEP` is an exported named constant (not a magic number), following the `MIN_SOURCE_FILES` and `APPS_DIR_FILE_THRESHOLD` pattern.
- AC8: The module-level JSDoc comment is updated to document four signals, not three.
- AC9: No regressions on existing signals — packages detected by Signals 1-3 remain detected. Packages excluded by pre-filters remain excluded.

## Edge Cases & Risks

**Signal overlap (all safe after `continue` fix):**
- bin + dev + express → Signal 1 fires first, `continue`, Signal 4 never evaluated
- apps/ + 100 files + fastify + dev → Signal 2 fires first, `continue`, Signal 4 never evaluated
- nest-cli.json + @nestjs/core + dev → Signal 3 fires first (after fix), `continue`, Signal 4 never evaluated
- apps/ + 30 files + express + dev, no config → Signal 2 fails (30 < 50, no config), Signal 3 fails (no config), Signal 4 catches it. Correct — small apps/ backend is exactly what Signal 4 targets.

**False positive analysis:**
- Two accepted false positives: scalar/void-server (18 files, hono) and scalar/mock-server (21 files, hono). Both are test utility servers in a library monorepo, not sniper customer repos. No structural signal distinguishes "server for testing" from "server for production" in package.json. Setup handles cleanup.
- Three additional potential false positives from not adding INFRA_PATTERNS entries (see Rejected Approaches): vercel-ai/packages/devtools (16 files), refine/packages/devtools-server (24 files), teable/packages/v2/benchmark-node (11 files, below threshold so not actually triggered). All are non-sniper repos. Total: 4 actual false positives out of 85 repos = 95.3% precision.
- Zero false positives on any sniper customer repo (dub, inbox-zero, formbricks, supabase, cal.com, midday).

**h3 false positive risk:**
- `h3` is the underlying HTTP server for Nuxt/Nitro. Nuxt apps with `nuxt.config.ts` are caught by Signal 3 first (with `continue`), so Signal 4 never evaluates them. The risk is a non-Nuxt utility package that has `h3` in production deps + dev + 15+ files. This is low probability — `h3` is rarely used standalone outside the Nuxt ecosystem — but worth monitoring post-ship.

**Framework detection for Signal 4 surfaces:**
- `detectFramework()` only recognizes `STRONG_FRAMEWORK_CONFIGS` basenames. Express/Fastify/Koa/Hono/Elysia have no config files → Signal 4 surfaces get `framework: null`. This is structurally correct but produces degraded UX: setup and doctor show `api ()` with no framework while frontend surfaces show `web (Next.js)`. The data to infer framework IS available in `root.deps` — a follow-up scope could extend `detectFramework` with a deps-based fallback. Not in this scope to keep blast radius contained.

**Non-Node projects:**
- `root.deps` comes from `package.json` `dependencies`. Non-Node projects don't have package.json — their `deps` is `{}`. Signal 4 cannot fire for Python/Go/Rust projects. No interaction.

**peerDependencies:**
- `root.deps` reads `dependencies` only, not `peerDependencies`. Libraries that have express as a peerDep (middleware SDKs) do not trigger Signal 4. Correct — peerDep means "the consumer provides this."

**Re-init behavior:**
- `mergeSurfaces` matches by path, not name. New Signal 4 surfaces appear as new entries with default commands. Existing surfaces are matched by path and preserved with user-tuned commands.
- **Known limitation (pre-existing):** If a user manually removes a surface from ana.json and re-runs init, Signal 4 will re-detect it as a new surface and add it back. `mergeSurfaces` has no "user explicitly removed" tracking — it only knows about what exists vs. what's fresh. This predates this scope but Signal 4 increases the number of auto-detected surfaces, making resurrection more likely. Acceptable for now — the setup layer is the intended correction point for false positives.

**fileCount definition:**
- `countSourceFiles` counts `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs` files only, excluding node_modules/dist/.next/build. 15 source files means 15 files of real code, not configs or generated output.

## Rejected Approaches

**Raise `MIN_SOURCE_FILES` globally instead of per-signal threshold.** Would tighten Signals 1-3 unnecessarily. A CLI tool with 6 source files and a bin field (Signal 1) is a legitimate surface. Raising the global floor to 15 would miss it. Per-signal thresholds let each signal calibrate independently.

**Include protocol libraries (@trpc/server, socket.io, ws, graphql-yoga).** These are mounted ON server frameworks, not frameworks themselves. A package with only @trpc/server and a dev script is likely a shared library or route definition, not a standalone service. Including them creates false positives for non-service packages.

**Add `start` script as alternative to `dev` script.** `start` is too common in non-service packages (storybook, docs sites, build tools). `dev` is a stronger signal — it means "run this thing during development," which is the hallmark of a service you're actively building. `start:dev` IS accepted because it's the NestJS convention and carries the same semantic signal as `dev` (see AC5).

**Add `devtools`, `devtools-server`, `benchmark` to INFRA_PATTERNS.** Three redundant review agents unanimously flagged this as too aggressive. The existing INFRA_PATTERNS entries (`tsconfig`, `eslint-config`, `prettier-config`, etc.) are all unambiguously infrastructure/config packages. `devtools` is semantically different — it's a legitimate product name (React DevTools, Vue DevTools, Chrome DevTools extension repos). Adding it to global INFRA_PATTERNS would exclude a startup's primary product surface from ALL four signals, not just Signal 4. `benchmark` provides zero marginal value — the target package (teable/benchmark-node at 11 files) is already below MIN_FILES_SERVER_DEP = 15. Accept the additional false positives (vercel-ai/devtools, refine/devtools-server) — setup handles cleanup.

**Add `mock-server` and `void-server` to INFRA_PATTERNS.** Too specific to one repo (scalar). These are legitimate package names that could be real products for other customers.

**Use dependency COUNT as a threshold instead of file count.** A service with 1 production dep (just express) and 200 source files is clearly a service. A utility with 10 deps and 3 source files is clearly not. File count is the better proxy for "this is real code," not dependency count.

## Open Questions

None. Requirements doc questions resolved:
- The `continue` bug on Signal 3 is confirmed (verified in source — Signal 3 has no `continue`, Signals 1 and 2 do).
- `root.deps` is confirmed as production-only (census.ts lines 524, 539 — reads from `package.json` `dependencies`).
- `detectFramework` returns null for non-config frameworks (verified in source, lines 182-194).
- `detectSurfaces` is terminal — its output doesn't feed back into any other detector (scan-engine.ts:996).
- `mergeSurfaces` handles new surfaces gracefully (state.ts lines 636-639), with the known resurrection limitation documented above.
- Threshold resolved at 15 by judgment (not code investigation): conservative initial value well below the smallest genuine miss (44 files), above clear false positives (5 files). Subject to field adjustment.
- Script check resolved to accept both `dev` and `start:dev` after redundant review identified `@nestjs/core` as dead weight without NestJS convention support.
- INFRA_PATTERNS additions rejected after redundant review — `devtools` is a product name, `benchmark` is below threshold. Accept the false positives.

## Exploration Findings

### Patterns Discovered

- `surfaces.ts`: signals are evaluated in order with `continue` after each push. Pure function, census in → surfaces out. No filesystem access. (lines 260-292)
- `census.ts`: `root.deps` comes directly from `package.json` `dependencies` field (line 524, 539). Clean separation from devDeps.
- `scan-engine.ts`: `detectSurfaces` called at line 996, after all other detectors. Terminal output — no feedback loops.
- `state.ts`: `mergeSurfaces` matches by path (line 613), preserves user commands (line 616-633), adds new surfaces with defaults (line 638).

### Constraints Discovered

- [TYPE-VERIFIED] SourceRoot.deps is production-only (census.ts:524) — `package.json` `dependencies` field cast to `Record<string, string>`
- [TYPE-VERIFIED] SourceRoot.devDeps is dev-only (census.ts:525) — `package.json` `devDependencies` field
- [TYPE-VERIFIED] SourceRoot.fileCount counts source files only (census.ts:233-250) — filtered by SOURCE_EXTENSIONS, excludes node_modules/dist/.next/build
- [OBSERVED] Signal 3 missing `continue` (surfaces.ts:291) — harmless today because Signal 3 is last in the loop, but will cause duplicates when Signal 4 is added after it
- [OBSERVED] applicationShape.ts has zero references to surfaces — shape detection and surface detection are completely independent
- [OBSERVED] Signal evaluation order is load-bearing — signals use `continue` to short-circuit, so reordering changes which signal "wins" for packages matching multiple signals
- [OBSERVED] `root.scripts` contains exact key names (census.ts:527,542). `scripts.includes('dev')` does NOT match `start:dev` — these are separate keys. NestJS convention uses `start:dev`, not `dev`.

### Test Infrastructure

- `surfaces.test.ts`: 1126 lines, well-structured. `makeRoot` and `makeCensus` helpers simplify synthetic census construction. All three signals have dedicated test sections. Pre-filters have exhaustive coverage. Constants are exported and tested for values.
- Existing proof findings on surfaces.test.ts: `fill-scan-detection-gaps-C1` (Svelte/Nuxt ordering test constructs hints in predetermined order — known limitation, not relevant to this scope).

## For AnaPlan

### Structural Analog

`surfaces.test.ts` sections "AC4: Signal 1" through "AC6: Signal 3" (lines 143-247). Each signal has a positive test ("detects X") and a negative test ("rejects Y without Z"). Signal 4 tests should follow this exact structure: positive case (server dep + dev + 15+ files → detected), negative cases (server dep in devDeps → not detected, server dep without dev → not detected, server dep with < 15 files → not detected), and a `start:dev` positive case.

### Relevant Code Paths

- `src/engine/detectors/surfaces.ts` lines 258-292 — the signal evaluation loop. Signal 4 goes after Signal 3 (once Signal 3 gets its `continue`), before the closing `}` of the for loop.
- `src/engine/detectors/surfaces.ts` lines 96-99 — existing threshold constants. `MIN_FILES_SERVER_DEP` goes here.
- `tests/engine/detectors/surfaces.test.ts` lines 1097-1125 — "exported constants" section. New constant value assertions go here.

### Patterns to Follow

- Name the constant `SERVER_FRAMEWORK_DEPS` following `STRONG_FRAMEWORK_CONFIGS` pattern (surfaces.ts:29)
- Name the threshold `MIN_FILES_SERVER_DEP` following `MIN_SOURCE_FILES` and `APPS_DIR_FILE_THRESHOLD` pattern (surfaces.ts:96-99)
- Export both constants for testability, following `INFRA_PATTERNS` and `STRONG_FRAMEWORK_CONFIGS` pattern
- Add `continue` after `candidates.push()` in Signal 4, following Signals 1 and 2 pattern (surfaces.ts:277, 284)
- Signal comment format: `// Signal 4: server framework dep (production) + dev script` following existing `// Signal 1:` format (surfaces.ts:274)
- Test structure: `describe('signal 4 detects server framework + dev packages')` following `describe('signal 1 detects bin + dev packages')` pattern (surfaces.test.ts:146)

### Known Gotchas

- The `continue` on Signal 3 MUST be added before Signal 4 is inserted. If Signal 4 is added first, packages with both a strong config and a server dep + dev script will be pushed twice in the same loop iteration. The test for AC1 should verify this explicitly (construct a root that matches both, assert exactly 1 surface).
- `root.deps` keys are package names as strings (e.g., `'express'`). The check should use `Object.keys(root.deps).some(d => SERVER_FRAMEWORK_DEPS.has(d))`, not `root.deps[name]` for each entry — iterating deps is O(n) in deps count, not O(n) in SERVER_FRAMEWORK_DEPS size.
- `fileCount` on SourceRoot is source-file-only count (census.ts `countSourceFiles`). Don't confuse with total file count. The threshold of 15 means 15 source files (.ts/.tsx/.js/.jsx/.py/.go/.rs), not 15 total files.

### Things to Investigate

- Whether the JSDoc at lines 1-14 should enumerate all four signals or keep the current "three signals" summary. The comment is the first thing a developer reads — it should be accurate.
- Whether `h3` in SERVER_FRAMEWORK_DEPS could create false positives in Nuxt-adjacent monorepo packages that use `h3` directly as a utility (not as a standalone server). Signal 3's `continue` prevents double-detection of Nuxt apps with `nuxt.config.ts`, but non-Nuxt `h3` utility packages are not protected.
