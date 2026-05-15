# Anatomia CLI — Architecture

A **map**, not a manual. Read this to understand where things are. Read [CONTRIBUTING.md](CONTRIBUTING.md) to understand how to change them.

Every file path and code identifier below is verified against the codebase; if something here does not match the code, the code is right.

Anatomia scans a project, detects stack + conventions + patterns, and writes AI-ready context (CLAUDE.md, AGENTS.md, `.ana/`, `.claude/skills/`) so AI coding tools get project-specific guidance. 9 commands; the heart is `ana scan` (pure read) and `ana init` (writes). Every display surface reads from a single unified result type — `EngineResult`.

---

## Module Layout

```
packages/cli/src/
  index.ts                          — CLI entry: registers all 9 commands

  commands/                         — Command handlers (one file per command)
    init/                           — `ana init` split into 7 files
      index.ts                      — Orchestrator + command registration
      types.ts                      — InitCommandOptions, InitState
      preflight.ts                  — validateInitPreconditions
      assets.ts                     — directory creation, scaffolds, hook scripts
      state.ts                      — runAnalyzer, saveScanJson, success display
      skills.ts                     — scaffoldAndSeedSkills, SKILL_INJECTORS
      anaJsonSchema.ts              — ana.json schema validation
    scan.ts                         — `ana scan`
    setup.ts                        — `ana setup` (check / index / complete sub-commands)
    artifact.ts                     — `ana artifact save / save-all`
    work.ts                         — `ana work status / complete`
    proof.ts                        — `ana proof`
    pr.ts                           — `ana pr`
    agents.ts                       — `ana agents`
    verify.ts                       — `ana verify pre-check`
    check.ts                        — validateSetupCompletion (shared internal)
    symbol-index.ts                 — createIndexCommand (shared internal)

  engine/                           — Detection + analysis engine
    index.ts                        — Re-exports: EngineResult, scanProject, ASTCache, ParserManager
    scan-engine.ts                  — scanProject(): the public entry point for `ana scan`

    analyzers/
      conventions/                  — 5 files: codePatterns, imports, indentation, index, naming
      patterns/                     — 4 files: index, dependencies, confirmation, confidence
      structure/                    — 6 files: index, entry-points, architecture, test-locations, tree-builder, config-files

    detectors/
      applicationShape.ts           — application shape classification (cli, web-app, api-server, library, ...)
      commands.ts                   — detectCommands (build/test/lint/dev scripts)
      dependencies.ts               — detectFromDeps, detectAiSdk, AI_PACKAGES
      deployment.ts                 — detectDeployment (Vercel/Docker/Fly.io/Railway/...), detectCI
      documentation.ts              — documentation inventory
      framework.ts                  — detectFramework() dispatches to per-language registry
      git.ts                        — detectGitInfo
      go.ts                         — detectGoFramework (single-function)
      packageManager.ts             — detectPackageManager
      projectType.ts                — detectProjectType
      readme.ts                     — README extraction
      rust.ts                       — detectRustFramework (single-function)
      node/                         — 6 detector files + framework-registry.ts
        express.ts, nestjs.ts, nextjs.ts, other.ts, react.ts, remix.ts
      python/                       — 4 detector files + framework-registry.ts
        cli.ts, django.ts, fastapi.ts, flask.ts

    sampling/
      proportionalSampler.ts        — Proportional file sampling for tree-sitter (500 files max)

    types/                          — Zod schemas + inferred TS types
      engineResult.ts               — EngineResult interface + createEmptyEngineResult factory
      conventions.ts                — ConventionAnalysis, NamingConventionResult
      patterns.ts                   — PatternAnalysis, PatternConfidence, MultiPattern, getPatternLibrary, isMultiPattern
      parsed.ts                     — ParsedFile, ParsedAnalysis (tree-sitter output)
      structure.ts                  — StructureResult
      index.ts                      — AnalysisResult, ProjectType, createEmptyAnalysisResult

    parsers/
      treeSitter.ts                 — ParserManager, parseProjectFiles
      node.ts, python.ts, go.ts,    — Dependency file readers (readNodeDependencies, etc.)
      rust.ts, ruby.ts, php.ts
      node/, python/                — Language-specific sub-parsers
      queries.ts                    — tree-sitter query strings

    utils/
      routeHandlers.ts              — isRouteHandlerFile, isHttpMethodName
      serviceAnnotation.ts          — annotateServiceRoles
      confidence.ts, directory.ts, file.ts, importScanner.ts

    cache/astCache.ts               — ASTCache (disk + memory cache for parsed trees)

  types/                            — Cross-command types
    proof.ts                        — ProofChainEntry
    symbol-index.ts                 — SymbolEntry, SymbolIndex

  utils/                            — Shared utilities (not engine-specific)
    git-operations.ts               — readArtifactBranch, getCurrentBranch
    gotchas.ts                      — matchGotchas (compound-trigger matching against GOTCHAS)
    displayNames.ts                 — language/framework/pattern display name maps
    scaffold-generators.ts          — CLAUDE.md/AGENTS.md/context scaffolds
    validators.ts                   — getProjectName, pathExists
    file-writer.ts                  — atomic write helper
    fileCounts.ts                   — source/test/config file counting
    proofSummary.ts                 — generateProofSummary

  data/
    gotchas.ts                      — GOTCHAS: pre-populated trigger-based gotchas

  constants.ts                      — CORE_SKILLS, CONDITIONAL_SKILL_TRIGGERS, computeSkillManifest, getStackSummary
```

---

## Data Flow: `ana scan`

`scan.ts` calls `scanProject()` in `src/engine/scan-engine.ts`. The function runs a census-based pipeline where a shared project model eliminates duplicate filesystem reads:

0. **Census** — `buildCensus()` creates the shared project model: `sourceRoots`, `allDeps`, `primaryDeps`, `configs`, `layout`. Every subsequent step derives from census data instead of making its own filesystem calls.

1. **Monorepo info** — derived from census (workspace tool + sub-packages). No separate monorepo detector.

2. **Package manager** — `detectPackageManager()` via lockfile signal.

3. **Dependencies** — `allDeps` already merged from all workspace packages by the census. `detectFromDeps()` produces database, auth, testing, payments candidates.

4. **Direct detection phases** (all tiers):
   - `detectProjectType()` — language detection
   - `detectFramework()` — dispatches to per-language registry, uses `primaryDeps` for monorepos
   - Application shape classification
   - Structure analysis (directories, entry points)

5. **Deep tier only** (when depth is `'deep'`):
   - Proportional file sampling via `proportionalSampler.ts` (500 files max, uses census `sourceRoots` for stratified sampling)
   - Tree-sitter parsing produces `ParsedAnalysis`
   - Pattern inference: error handling, validation, database, auth, testing
   - Convention detection: naming, imports, indentation, code patterns

6. **Stack assembly** — dependency-primary, pattern-enriched, with TypeScript override for Node.js projects with tsconfig.

7. **File counts, commands, README extraction, documentation inventory.**

8. **Git info, external services, schemas, secrets, deployment, CI.**

9. **Service annotation** — `annotateServiceRoles()` marks each service with its stack roles.

10. **Project profile.**

11. **Blind spots and findings.**

Returns a fully-typed `EngineResult`. `scan.ts` either prints human output, writes JSON (`--json`), or saves to `.ana/scan.json` (`--save`).

Census is the architectural foundation. Steps 1 and 3 derive from census data instead of making their own filesystem calls. The proportional sampler (step 5) uses census `sourceRoots` for stratified sampling. One shared model, no duplicate detection.

## Data Flow: `ana init`

`registerInitCommand()` in `commands/init/index.ts`. 9-phase atomic operation:

1. **Pre-scan validation** — `validateInitPreconditions()` in `preflight.ts`
2. **Temp directory** — all writes go to `/tmp/ana-init-<rand>/`; nothing touches the real project until phase 9
3. `createDirectoryStructure()` in `assets.ts` — builds `.ana/context/`, `.ana/state/`, `.ana/plans/`
4. **Scan** — `runAnalyzer()` in `state.ts` runs the scan engine against the project
5. **Scaffolds** — `generateScaffolds()` writes `.ana/context/*.md` from templates
6. **Skills** — `scaffoldAndSeedSkills()` in `skills.ts` copies skill templates, injects `## Detected` sections using `SKILL_INJECTORS`, pre-populates `## Gotchas` on fresh installs via `matchGotchas()`
7. **Artifacts** — `saveScanJson()`, `createAnaJson()`, `buildSymbolIndexSafe()`, `copyHookScripts()`
8. **Preservation** — if `--force`, restore state/ backup, context/ backup, and ana.json backup
9. **Atomic rename** — `atomicRename()` swaps tmp to real; then `createClaudeConfiguration()` writes CLAUDE.md + AGENTS.md + `.claude/` config outside the temp dir

On failure: the tmp dir is removed, the project is unchanged.

---

## The `EngineResult` Source of Truth

Every display surface (CLAUDE.md, AGENTS.md, skill Detected sections, init success, `ana scan` output) reads a single `EngineResult` from `scanProject()`. Type at `src/engine/types/engineResult.ts`; factory `createEmptyEngineResult()` is the single edit point for adding fields (tsc enforces completeness).

Five sub-fields compose their detector types directly:

- `commands: DetectedCommands & { packageManager: string }` — from `detectors/commands.ts`
- `git: GitInfo` — from `detectors/git.ts`
- `deployment: DetectedDeployment & DetectedCI` — from `detectors/deployment.ts`
- `patterns: PatternAnalysis | null` — from `engine/types/patterns.ts`
- `conventions: ConventionAnalysis | null` — from `engine/types/conventions.ts`

Each composition has a compile-time assertion in `tests/engine/types.test.ts` that fails if the field regresses to an inline type.

---

## Extension Points

Brief list of where to add things. Step-by-step guides for each are in [CONTRIBUTING.md](CONTRIBUTING.md).

### Framework detector

`src/engine/detectors/<language>/<framework>.ts` + `framework-registry.ts`. Priority order matters — first match wins. Go and Rust have single-function detectors; add a registry when either grows multiple files. Step-by-step guide in [CONTRIBUTING.md](CONTRIBUTING.md).

### Service

`EXTERNAL_SERVICE_PACKAGES` in `src/engine/scan-engine.ts`. AI services have a second registration in `AI_PACKAGES` in `src/engine/detectors/dependencies.ts`. Step-by-step guide in [CONTRIBUTING.md](CONTRIBUTING.md).

### Gotcha

`GOTCHAS` in `src/data/gotchas.ts`. Compound triggers via `matchGotchas()` in `src/utils/gotchas.ts`. Step-by-step guide in [CONTRIBUTING.md](CONTRIBUTING.md).

### Skill template

`templates/.claude/skills/<skill>/SKILL.md` + `ENRICHMENT.md`. Register in `CORE_SKILLS` or `CONDITIONAL_SKILL_TRIGGERS` in `src/constants.ts`. Optional injector in `SKILL_INJECTORS` in `src/commands/init/skills.ts`. `computeSkillManifest()` in `constants.ts` combines core + matched conditional skills. Step-by-step guide in [CONTRIBUTING.md](CONTRIBUTING.md).

### Command

`src/commands/<name>.ts` exporting `registerXCommand(program: Command): void`. Import and call from `src/index.ts`. All 9 existing commands follow this pattern.

---

## Design Decisions

**One type per concept, zero mapping functions.** Five type pairs (conventions, patterns, commands, git, deployment) were unified. Inline duplicates + hand-written mapping functions silently dropped fields on drift; now composed directly, enforced by compile-time assertions in `tests/engine/types.test.ts`. Adding a field to a detector flows through automatically.

**Census eliminates duplicate filesystem reads.** `buildCensus()` creates one shared model. Detectors were making duplicate filesystem calls, producing inconsistent results across monorepo packages. The census model solved this — one read, consistent data for every step.

**Exact match over substring.** `annotateServiceRoles` in `src/engine/utils/serviceAnnotation.ts` replaced 4 copies of substring dedup that broke on the "Vercel AI" / "Vercel" collision. Exact match + "X Auth" suffix special case for Supabase-as-auth. Display filters standalone services via `stackRoles.length === 0`.

**File-scoped HTTP filter.** `isRouteHandlerFile` in `src/engine/utils/routeHandlers.ts` suppresses `GET`/`POST`/etc. from naming stats **only** inside `app/**/route.ts` (Next.js) and `src/routes/**/+server.ts` (SvelteKit). Elsewhere, a function named `GET` counts as SCREAMING_SNAKE_CASE.

**Dynamic imports for WASM deferral.** Tree-sitter loads native WASM at module-evaluation time — top-level imports would crash `ana --help`. String-literal specifiers are grep/madge invisible; see the inline comment for the rename hazard.

**Phantom code gets deleted.** `typeHints.ts` and `docstrings.ts` were removed — they read nonexistent fields via `as unknown as` and always returned zeros. **Do not recreate** without real tree-sitter extraction.

**tsc is the enforcement layer.** `pnpm build` runs `tsc --noEmit` before `tsup`. Husky pre-commit runs typecheck + typecheck:tests + lint. CI runs the same three on Ubuntu x Node 22/24. No path for untyped code to reach main.

**Templates are behavioral contracts.** Skill templates (`templates/.claude/skills/<name>/SKILL.md`) are not documentation — they are executable behavioral contracts that shape how AI tools interact with the project. The `## Detected` section is machine-owned (refreshed on every `ana init`); `## Rules`, `## Gotchas`, and `## Examples` are human-owned and preserved across regeneration.

---

## Known Debt

- **Unreachable catch in `parsers/node.ts`** — outer `try/catch` cannot fire; `utils/file.ts:readFile` and `parsePackageJson` both swallow upstream. Delete or surface errors.
- **`FrameworkResult` vs `Detection`** — structurally identical interfaces in two files. Works via structural assignability; cosmetic drift trap.
- **`stack.workspace` not in Stack line** — `getStackSummary` in `constants.ts` excludes it deliberately. UX decision pending.
