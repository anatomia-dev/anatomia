# Changelog

All notable changes to [anatomia-cli](https://www.npmjs.com/package/anatomia-cli) are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

## [Unreleased]

### Changed

- **Re-init now propagates agent template updates (behavior change).** `ana init` re-init overwrites the agent `.md` instruction bodies (both `.claude/agents/` and `.codex/agents/`) and `CLAUDE.md` from the current stock, so template improvements reach existing installs instead of being frozen by the old skip-if-exists rule. Init emits one consolidated warning listing any overwritten file whose content had changed; recover prior versions from git (e.g. `git log -- .claude/agents/ana-build.md`). **Your basic config is preserved** — Claude frontmatter `model`/`tools` and Codex `.agent.toml` `model`/`sandbox_mode`/`model_reasoning_effort` are never reset, and Codex `.agent.toml` machine fields refresh from stock. `AGENTS.md` is unaffected (still skip-if-exists). If you relied on agent-file edit persistence across re-init, move those edits to a custom agent or recover them from git.

## [1.2.2] - 2026-06-02

### Added

- **Vue framework detection.** Vue 3 apps using `vite.config.ts` are now correctly identified. hoppscotch (70K stars) goes from "unknown" shape with 2 surfaces to "Vue" framework with 6 surfaces. Dep-based framework fallback detects Vue and React even when no framework-specific config file exists.
- **Vite surface detection with library guard.** Packages with `vite.config.ts` are detected as surfaces. Library packages (those with `main`/`module`/`exports` in package.json) are excluded — they use Vite for bundling, not as a deployable app. Zero false positives across 22 validated repos.
- **`hasMain` and `hasExports` fields on `SourceRoot`.** Census reads library markers from package.json during construction. Used by the surface detection library guard.
- **MCP and Upstash service detection.** `@modelcontextprotocol/sdk` detected as "MCP Server." `@upstash/ratelimit`, `@upstash/vector`, `@upstash/workflow` added. Existing `@upstash/redis` and `@upstash/qstash` detection unchanged.

### Fixed

- **Non-product code counted as production code.** Test fixtures, templates, examples, playground, and reference directories were included in scan findings, hot files, schema model counts, and deploy detection. Supabase showed 39 models (real: 10). trigger.dev/payload/novu had 100% false-positive API route findings. shadcn hot files showed template config files. Payload's deploy platform came from a template Dockerfile. Fixed by wiring `isNonProductPath` filtering into all affected systems with a shared `NON_PRODUCT_GLOB_IGNORE` constant derived from `EXCLUDED_SEGMENTS`.
- **Non-product path filter over-excluded product code.** The initial fix used any-depth segment matching (`**/e2e/**`), which incorrectly filtered product endpoints named `e2e`, `test`, `sandbox`, `templates`, or `playground` deep inside app source trees. dub lost 9 production API routes. Fixed with depth-limited `isNonProductFilePath` that only checks the first 3 path segments (where workspace packages live). Root-anchored glob patterns replace any-depth patterns. Verified across 22 repos.
- **Env hygiene false positive.** `.gitignore` coverage check used `gitignore.includes('.env')` — a substring match that passed when only `.env.local` was covered. Replaced with `git check-ignore --no-index .env` for authoritative gitignore evaluation.
- **Contributor display missing "active" qualifier.** "27 contributors" now reads "27 active contributors." The count is a 30-day window, not all-time.

### Changed

- `EXCLUDED_SEGMENTS` exported from `surfaces.ts` — shared definition of non-product paths
- `NON_PRODUCT_GLOB_IGNORE` uses root-anchored patterns instead of any-depth `**/${s}/**`
- `isNonProductFilePath` exported for file-path callers. `isNonProductPath` unchanged for package-path callers.
- `detectSecrets` exported for testing
- Vue detector registered at position 5 in the node framework registry
- `FRAMEWORK_HINTS` and `STRONG_FRAMEWORK_CONFIGS` include `vite.config.ts/js/mjs`

## [1.2.1] - 2026-06-01

### Added

- **Codex Learn agent.** All five pipeline stages now work on both Claude Code and Codex. `ana run learn --platform codex` launches Learn with platform-specific diagnostic guidance. CC Learn template paths corrected to canonical `.ana/skills/`.
- **`mergeStrategy` config field.** `ana.json` gains an optional `mergeStrategy` field (`merge`, `squash`, or `rebase`). When absent, `ana work complete --merge` queries GitHub for allowed strategies and auto-selects when exactly one is enabled. Write-time validation rejects invalid values.

### Fixed

- **`ana work complete --merge` fails non-interactively.** The merge call had no strategy flag — `gh pr merge` without `--merge`/`--squash`/`--rebase` fails when stdin is piped (Codex, CI, scripts). Now always passes an explicit strategy with runtime fallback to GitHub API detection.
- **Finding action `accept` renamed to `acknowledge`.** The word "accept" caused Learn to batch-close findings instead of evaluating them. Renamed across source, templates, tests, and docs. One-time backfill migration renames existing proof chain entries. Old `accept` values tolerated from existing templates.
- **Multi-phase timestamp poisoning.** Phase 1's `verify_started_at` no longer blocks Phase 2 status for up to one hour. Phase-scoped timestamp keys prevent cross-phase interference. Centralized phase resolver ensures `work status` and `work start` agree.
- **Conditional test no-ops.** 6 tests that silently passed without executing assertions now run with mocked PID resolution. 2 parsing tests converted to visible `skipIf`.

### Changed

- `CODEX_AGENT_FILES` expanded to include Learn (5 → 6 agents)
- Finding action `accept` → `acknowledge` in JSON output, display, and proof chain
- `mergeStrategy` added as a user-owned `ana.json` field
- PlatformSwitcher shows only supported platforms (Claude Code, Codex)

## [1.2.0] - 2026-06-01

### Added

- **`ana run` — universal agent invocation.** One command for every pipeline stage: `ana run` (Think), `ana run plan`, `ana run build`, `ana run verify`, `ana run learn`, `ana run setup`. Dispatches to the configured platform automatically. Advisory pipeline state check warns when work isn't at the expected stage.
- **Codex platform support.** `ana init --platforms codex` generates Codex agent templates with `.agent.toml` manifests under `.codex/agents/`. `ana run` dispatches to Codex interactive TUI with `danger-full-access` sandbox mode. Platform auto-detection from PATH on first init.
- **`platformFlags` in `ana.json`.** Per-platform runtime flags applied automatically by `ana run`. Set `"claude": ["--dangerously-skip-permissions"]` once — never type the flag again.
- **`--platform` flag on `ana run`.** Explicit platform override per invocation. Resolution chain: `--platform` flag → `ANA_PLATFORM` env → sole configured platform → guidance when ambiguous.
- **Unified skill architecture.** Skills live in `.ana/skills/` — one canonical location shared across platforms. `.claude/skills/` and `.agents/skills/` are symlinks. Setup enriches through the symlink — zero change to existing setup workflows.
- **Multi-phase report naming guard.** `ana artifact save build-report` on a multi-phase scope auto-corrects to the numbered type (`build-report-1`) with a warning. Prevents off-plan artifact creation.
- **Phase-scoped pipeline timestamps.** Multi-phase work writes `build_started_at_N` and `verify_started_at_N` per phase. A centralized phase resolver ensures `ana work status` and `ana work start` agree on the current phase.
- **Gitignore disclosure at init time.** `ana init` warns when infrastructure files are gitignored. `ana init commit` force-adds them to prevent worktree failures from missing agent files.

### Fixed

- **Multi-phase timestamp poisoning.** Phase 1's `verify_started_at` no longer incorrectly blocks Phase 2 status for up to one hour. Each phase gets its own timestamp key. Defense-in-depth: verify timestamps predating the current phase's build report are rejected as stale.
- **Re-verify writes the correct timestamp.** Both single-phase and multi-phase FAIL→re-verify now write `verify_started_at` instead of `build_started_at`. Re-verify is a verify session, not a build session.
- **Timestamp duplication eliminated.** `isTimestampRecent` and `checkConcurrencyGuard` consolidated into a shared comparison path.
- **Advisory pipeline check false warnings.** Replaced `.saves.json` stage field read with file-existence checks. No more false warnings when starting agents.
- **Invalid `--platform` values rejected.** `--platform codeex` (typo) now errors instead of silently falling through.
- **Shell injection in Codex dispatch.** Eliminated `shell: true` — both platforms use safe `spawnSync` array arguments.
- **`work.ts` decomposition.** Extracted `work-state.ts` and `work-proof.ts` from the 1700-line monolith.
- **Gitignore force-add in init commit.** Tracked-but-gitignored infrastructure files detected and force-added.

### Changed

- All CLI display strings use `ana run` syntax instead of `claude --agent`
- `getClaudePid()` renamed to `getAgentPid()` — platform-agnostic
- `getSkillsDir()` returns `.ana/skills` (canonical location)
- `getAgentsDir()` accepts optional `platform` parameter
- `ana.json` gains `platforms` and `platformFlags` fields
- `KNOWN_ROOTS` expanded to `['.ana/', '.claude/', '.codex/', '.agents/']`
- `package.json` description: "four-agent" → "five-agent" pipeline
- Scan/index exclusion patterns include `.codex/` and `.agents/`
- `determineStage` uses phase-scoped timestamp keys for multi-phase concurrency
- `startWork` uses centralized phase resolver instead of glob-based detection

## [1.1.5] - 2026-05-26

### Added

- **Three-tier monorepo dependency resolution** — identity fields (database, auth, payments, AI SDK) now use tiered detection: primary package → all workspace packages → root package.json. Includes ORM-beats-driver merge rule: when a shared package has Prisma and the primary has @planetscale/database, Prisma wins. Fixes n8n false Supabase detection and postiz-app empty stack from hoisted deps.
- **Finding details in CLI output** — scan findings now show methodology detail as indented gray text below each warning. The validation finding's disclaimer ("Wrapper-based or middleware validation may not be detected") is now visible to founders instead of hidden in JSON.
- **Surfaces section in AGENTS.md** — monorepo projects get a `## Surfaces` section listing surface names, paths, and frameworks. Capped at 4 entries. Helps Cursor, Windsurf, and Copilot users navigate monorepo structure.
- **Env hygiene monorepo enrichment** — scanner now checks the primary source root for `.env.example` when root directory doesn't have one. Fixes 9 of 30 handoff repos including dub and inbox-zero.
- **Drizzle barrel-file model aggregation** — when a drizzle config points to a barrel index file (re-exports from subdirectories), table counts are aggregated across all files in the directory tree. Fixes openstatus (0 → 40 models).

### Fixed

- **False positive secret detection eliminated** — removed weak signing secret regex (0 true positives across 48 repos). Removed PostHog public key pattern. Added bracket template filters and placeholder values for DB URLs. Added AWS example key blocklist. Medusa: 10 false criticals → 0. Infisical: 12 → 0.
- **Deploy platform detection primary-aware** — monorepo scans now prefer the primary package's deploy config. Fixes inbox-zero and Cap showing "Cloudflare Workers" instead of "Vercel." Prisma+Vercel serverless singleton gotcha now fires correctly.
- **AGENTS.md constraint deduplication** — multiple secret findings no longer produce duplicate constraint lines. Medusa's 10 identical "🔴 Use environment variables..." lines → 1.
- **AI sub-provider collapse in AGENTS.md** — Vercel AI provider variants (OpenAI, Anthropic, Google, etc.) filtered from services section when the stack already reports the primary AI SDK. Direct SDK usage preserved.
- **Validation finding title qualified** — changed from `185/464 API routes have no validation imports` to `~185 of 464 API route files may lack input validation`. Tilde signals approximation. Singular/plural handled correctly.
- **shadcn/ui split-package detection** — UI system detection uses merged workspace deps for monorepos. The shadcn/ui 3-dep signature (cva + tw-merge + radix) commonly split across packages is now correctly detected. Fixes dub ("Tailwind CSS" → "shadcn/ui (Tailwind)").
- **Workspace glob fallback** — scanner no longer crashes on wildcard workspace patterns or packages with missing name fields.

### Changed

- `ProjectCensus` type gains `rootDeps` field (root package.json production dependencies)
- `ORM_PACKAGES` exported from `detectors/dependencies.ts` for the ORM-beats-driver merge rule
- `detectDeployment` gains optional `primaryPath` parameter
- `SECRET_PATTERNS` reduced from 11 to 9 entries
- `DB_URL_PLACEHOLDERS` and `TEMPLATE_PATTERNS` expanded
- Validation finding detail rewritten to single concise line
- `formatHumanReadable` exported for testing
- Stale comments in scan-engine.ts updated to reflect three-tier model

## [1.1.4] - 2026-05-24

### Added

- **Backend service surface detection** — workspace packages with a server framework dependency (Express, Fastify, Koa, Hono, NestJS, Elysia, and more) plus a `dev` script are now detected as surfaces. Monorepos with separate API backends get per-surface test commands automatically.
- **Stack provenance** — `scan.json` records which workspace package contributed each stack detection. Setup flags detections from non-primary packages so you can correct during configuration.
- **Setup surface gap check** — setup identifies workspace packages with dev scripts that weren't detected as surfaces and offers to add them.

### Fixed

- **Proof table alignment** — dynamic column widths replace hardcoded padding. Long slugs no longer crash into adjacent columns. 2-character minimum gap between all columns. Empty surfaces show `--` instead of blank space.
- **Terminal box trailing space** — proof detail and health view boxes maintain a gap before the right border.
- **`ana -help` shows help** — typing `-help` (single dash) now shows help instead of "unknown option" error. Works for all commands.
- **Health hot spots overflow** — long file paths no longer overflow into the findings column.
- **Scan header box alignment** — ANSI escape codes no longer break right-border alignment. Summary line truncates gracefully when content exceeds box width.

### Changed

- `learn` command description updated to "Manage learn sessions".
- Setup agent template uses `--json` for proof audit matrix output.

## [1.1.3] - 2026-05-22

### Added

- **Scan terminal Surfaces section** — surfaces promoted from inline sub-item to standalone section between Stack and Intelligence. Each surface shows framework (or language fallback) and primary testing framework.
- **Branch pattern detection from merge history** — reports the climate (e.g., "48/50 merges used `feature/`") instead of the weather (live remote branches). Falls back to remote branches for shallow clones.
- 10 new database packages — Kysely, MikroORM, slonik, @vercel/postgres, mongodb, postgres.js, sqlite3, mssql, and more
- 5 new framework config variants — `.mjs` variants for Svelte, Nuxt, Remix, React Router, Vue
- @stripe/react-stripe-js added to payment detection

### Fixed

- **False surface detection** — workspace packages in `examples/`, `templates/`, `e2e/`, `test/`, `playground/`, `sandbox/`, and similar directories excluded from surface detection. Re-init silently drops previously-detected false surfaces.
- **Application shape priority** — framework evidence now outranks CLI and MCP dependency signals. NestJS with yargs → `api-server` (was `cli`). Express with MCP SDK → `api-server` (was `mcp-server`). Next.js with LangChain → `web-app` (was `ai-agent`).
- **Primary package selection** — name-match policy uses the repo directory name to prefer packages whose npm name matches the project identity. Four-tier matching with file-count minimum guard prevents thin wrappers from winning.
- **TypeScript language detection** — three-tier detection: root `tsconfig.json`, `typescript` in root devDependencies, and `tsconfig.json` in common subdirectories. Fixes monorepos and non-workspace multi-dir projects.
- **Python testing framework detection** — PEP 735 `[dependency-groups]` parsed, TOML array regex handles extras brackets, single-quoted strings matched alongside double-quoted.
- **Python production/dev dependency separation** — stack detection (framework, database, auth, AI SDK) uses production deps only. Testing detection uses all deps. Fixes false framework/database detections from test dependencies.
- **Schema discovery filters non-product paths** — `discoverSchemas` skips e2e/test/example workspace roots and filters glob fallbacks through `isNonProductPath`.
- **TOML inline comment handling** — closing-bracket regex handles valid TOML `] # comment` across all pyproject.toml strategies.
- **False rejection archives** — same-session re-saves no longer create false archive files or history entries. Stage-transition gate prevents timing data corruption from phantom rejection cycles.

## [1.1.2] - 2026-05-21

### Added

- **Surface awareness for monorepos** — scan detects development surfaces (apps, packages) automatically using a three-signal heuristic. Each surface gets its own `path`, `language`, `framework`, and scoped `build`/`test`/`lint` commands in `ana.json`. Pipeline agents target the correct surface. Validated across 25 real-world repos.
- **Per-surface proof chain tracking** — each pipeline run records which surface was verified. `ana proof health --surface cli` and `ana proof audit --surface cli` filter by surface. Dashboard shows per-surface run counts and findings.
- **`ana doctor`** — unified project health diagnostic. Checks CLI version, scan freshness, context quality, skill enrichment, proof chain health, and surface configuration. `--json` flag for CI.
- **`ana config delete`** — remove config fields. Blocks deletion of machine-managed surface fields (path, language, framework).
- **Nx workspace detection** — monorepos with `nx.json` show "Nx (pnpm)" or "Nx (yarn)" instead of generic labels.
- **Expanded platform detection** — Cloudflare Workers, Helm, Kubernetes, AWS CDK, Pulumi, Serverless Framework for deployment. CircleCI, Jenkins, Bitbucket Pipelines for CI.
- **Expanded AI SDK detection** — 7 new Vercel AI provider packages + `@ai-sdk/*` wildcard catch.
- **Depth-stratified file sampling** — replaces depth-first sort with 3-bucket allocation (shallow, mid, deep). Budget increased from 500 to 750 files.

### Fixed

- **Per-surface test commands use developer's script** — surface test commands now prefer `pnpm run test` (script passthrough) over `pnpm vitest run` (direct invocation), preserving setup steps like `prisma:generate`, `dotenv`, `cross-env`. Falls back to direct invocation only when no test script exists. Previously 41% of surfaces produced commands that would skip setup and fail.
- **Validation finding accuracy** — rewired to own glob with honest denominators (e.g., "185/464 API routes have no validation imports"). Previously sampled a subset and extrapolated.
- **Error boundary finding accuracy** — rewired to own glob with exact page counts regardless of directory depth.
- **Import alias classifier** — returns all tsconfig aliases, not just the first. Fixes misclassification of 574 imports on projects with multiple path aliases.
- **Tauri+TS monorepos detect as TypeScript** — Cargo.toml with tauri workspace dep + pnpm-workspace.yaml correctly classified as Node, not Rust.
- **Ruby projects with package.json or yarn workspaces detect as Ruby** — Gemfile added to competing manifest checks. Mastodon-style projects correctly classified.
- **Non-Node projects get native commands** — Ruby, Python, Go, Rust projects no longer get JavaScript test commands.
- **Root lint now project-wide** — was scoped to primary package while build and test were already project-wide. Now consistent.
- **Sampler budget overflow** — `allocateBudget` could exceed budget when fewer files than depth categories. Fixed with remaining-count guard.
- **AnaVerify independence** — Verify reads checkpoint commands from the spec, not the build report. Fixes a contradiction in the agent template.

### Changed

- `buildPackage`/`testPackage` retired — replaced by per-surface commands in `surfaces` section. Old values preserved via `.passthrough()` for existing installations.
- `monorepo.packages` type changed from `{ name, path }[]` to enriched objects with per-package `language`, `framework`, `testing`, `hasBin`, `scripts`, and `sourceFiles`.
- Root `commands.lint` now project-wide for monorepos (was scoped to primary package only).
- `pullBeforeRead` and `commitAndPushProofChanges` moved from `proof.ts` to `git-operations.ts`.

## [1.1.1] - 2026-05-18

### Added
- **Unified staleness awareness** — `work status` warns when scan is temporally stale (>7 days AND >50 commits). `setup check` gains Freshness section. Ana template instructs verbatim relay of ℹ notification lines.
- **Re-init mechanical field refresh** — `ana init` now refreshes `name`, `language`, `framework`, `packageManager` from the fresh scan instead of preserving stale values
- **Polyglot language detection** — tiered heuristic detects primary + secondary languages in multi-language projects
- **Rust/Go polyglot detection** — Rust and Go added to the polyglot tier heuristic
- **Non-Node scan enrichment** — AI SDK detection, framework-to-shape mapping for Python, Go, and Rust projects
- Non-Node command suggestions: init suggests language-appropriate test commands (pytest, go test) when no test script detected
- **Audit matrix orientation** — proof audit output reoriented for better readability
- **Learn session memory** — `ana learn end` command, `--new` and `--since` audit flags with matrix enrichment, learn directory added to init and re-init
- **`buildPackage`/`testPackage` fields** — new ana.json fields for package-scoped commands in monorepos, validated by COMMAND_FIELDS

### Changed
- `printVersionNotifications` renamed to `printNotifications` — now handles version, mismatch, and staleness notifications
- Ana agent template: explicit instruction to relay ℹ notification lines verbatim (both product and dogfood templates)
- Setup template: `ana init commit` moved from inline prose to dedicated bash code block — reduces agent hallucination surface

### Fixed
- Scan branch detection: local-only branches no longer appear in scan.json; bot branches (dependabot, renovate) filtered from branch pattern analysis
- Monorepo build/lint scoping: `ana init` now scopes build and lint commands to the primary package, matching the existing test command scoping
- Sanitize blank command strings on re-init: if `commands.test/build/lint` is `""`, replaced with fresh scan detection value instead of preserving the blank forever
- `ana config set` rejects empty strings for command fields — was a silent footgun that corrupted ana.json
- AI SDK detection priority: meta-frameworks (Vercel AI) detected before raw providers (Anthropic/OpenAI), preventing mis-detection
- Polyglot regex: handle PEP 508 extras brackets in Python dependency parsing
- npm runner mapping: fix `buildDirectTestCommand` for npm-based projects
- Secret validator: template placeholder patterns no longer trigger false positive secret findings
- Filter placeholder GitHub tokens with low entropy — reduces false positive secret findings
- First-user display polish: blind spots count, `.git` root detection messaging, init config display
- PR multi-remote failure: parse origin URL and pass `--repo` to all `gh` calls (pr list, pr create, pr view) — fixes failure when multiple remotes exist (fork setups)
- Flip monorepo command semantics: `build`/`test` are now project-wide commands, `buildPackage`/`testPackage` target the primary package — fixes confusion where root commands ran package-scoped
- scan-freshness tests: clear CI env var in beforeEach so tests pass in GitHub Actions

## [1.1.0] - 2026-05-15

### Added

#### Build isolation
- **Worktree-based builds** — Build and Verify run in dedicated git worktrees, isolating pipeline work from the main working tree
- Worktree lifecycle management: creation, build-step execution, freshness detection, pruning on completion
- Worktree artifact cleanup — stale copies removed from main tree after merge
- Pipeline concurrency guards — prevent concurrent plan/build/verify sessions on the same slug

#### Infrastructure persistence
- **`ana init commit`** — commit infrastructure files (scan, context, skills, agents) to the artifact branch with a single command
- `ana init` surfaces scan quality gaps and pipeline readiness warnings
- Re-init now preserves `plans/active/` alongside completed plans, proof chain, and context files

#### Configuration
- **`ana config show` / `ana config get`** — read ana.json settings from the CLI
- Configurable branch prefixes — `branchPrefix` supports per-kind mappings (feature/, fix/, chore/)
- `ana.json` schema uses `.passthrough()` to preserve user-added fields across re-init

#### Pipeline improvements
- **Version awareness** — `work status` shows when a newer CLI version is available and when project context is outdated
- **`work complete --merge`** — merge the PR via GitHub CLI before completing, with actionable messaging for branch protection failures
- Scope validation — structural checks on scope.md (kind, size, multi-phase, AC format)
- Commit hygiene checks — lint staged files during build-report save
- Think session timestamps captured and displayed in proof chain timing
- Phase-accurate pipeline timing written to worktree artifacts
- Ship log `kind` field — explicit feature/fix/chore/milestone classification

#### Proof intelligence
- **`ana proof strengthen`** — commit skill file edits and close findings atomically
- Upstream finding resolution — institutional findings persist across pipeline runs
- Rejection artifact preservation — failed build artifacts preserved in git history

#### Agent improvements
- **Agent dashboard** — `ana agents` lists installed agents with model configuration
- Learn infrastructure foundation — severity-based triage, upstream category, strengthen workflow
- CLI UX polish — command grouping, help examples, ENRICHMENT.md markers for setup agent

#### Website and AnaDocs
- **anatomia.dev** — marketing site with product overview, system architecture, and pricing
- **AnaDocs** at anatomia.dev/docs — concept pages, guides, CLI reference, and Proof Explorer
- Dynamic reference pages for agents, skills, context files, and CLI commands
- Full-text search across all documentation
- Proof Explorer — navigable proof chain entries with assertion ledgers and finding details

### Changed
- **Node.js 22+ required** — dropped Node 20 support; CI matrix updated to Node 22 + 24
- **GitHub organization** — repository moved from `TettoLabs/anatomia` to `anatomia-dev/anatomia`; old URLs redirect
- Pipeline timing uses phase-accurate timestamps from worktree artifacts
- Branch cleanup uses force-delete (`-D`) for squash/rebase merged branches
- Work start timestamps committed to artifact branch immediately
- Auto-clean untracked plan artifacts during `work complete` pull

### Fixed
- `--merge` flag — replaced auto-escalation with actionable messaging, JSON.parse crash guard, stderr+stdout consolidation
- Proof chain JSON merge pollution — merge artifacts no longer corrupt proof data
- Pre-build source mutation — build step no longer modifies source files
- Gantt bar rendering distortion in multi-phase pipeline visualizations
- Worktree branch parsing for `+` markers in `git branch` output
- CI matrix failures on Node version mismatch
- Pipeline stage detection for resumed builds
- Phase timing precision across worktree boundaries

## [1.0.2] - 2026-05-05

### Added
- `ana proof lesson` command — record findings as institutional lessons (verified but not actionable)
- Audit headline now shows actionable vs monitoring split (e.g., "24 actionable, 48 monitoring")

### Fixed
- Fix parseACResults regex — scope to AC Walkthrough section only, preventing false PASS/FAIL matches from Findings bullets (3/44 proof chain entries had inflated counts)
- Normalize staleness detector confidence by file touch frequency — reduces false positives from 78% to ~40% on hot files
- Collapse dual FAIL guard in work.ts to single shared helper
- Unify recovery-path finding count with computeChainHealth
- Delete hardcoded zero-run defaults in favor of calling computeFirstPassRate
- Extract shared exitError factory across close/promote/strengthen subcommands
- Extract and apply summary truncation helper consistently
- Fix Learn template — remove "pre-classified for closure" language that caused batch-closing

## [1.0.1] - 2026-05-04

### Fixed
- Eliminate command injection via unvalidated slugs in artifact, pr, proof, and work complete commands
- Validate artifactBranch and branchPrefix from ana.json against shell metacharacters
- Migrate all git command execution from execSync to spawnSync array arguments
- Add findProjectRoot containment check — require .git alongside .ana/ana.json
- Strip control characters from coAuthor config values
- Add version/tag and CHANGELOG verification gates to release workflow
- Fix CHANGELOG 1.0.0 release date
- Update project metadata to reflect npm publication
- Refresh dogfood scan from clean main branch
- Remove internal development history from public repository

## [1.0.0] - 2026-05-04

First stable release.

### Added

#### Scan engine
- 40+ framework, database, auth, testing, and service detectors
- Convention analysis: naming, imports, indentation across 5 categories
- Pattern inference: error handling, validation, database, auth, testing
- Application shape classification (cli, web-app, api-server, library, and 5 more)
- Two-tier scanning: surface (dependency-based) and deep (tree-sitter AST)
- Git intelligence: activity, churn, hooks, commit format, contributors

#### Context generation
- `CLAUDE.md` and `AGENTS.md` for cross-tool AI consumption
- 5 core + 3 conditional skill templates with scan-driven Detected sections
- Project-context and design-principles scaffolds
- 16 stack-specific gotchas with compound triggers
- Idempotent init: re-run refreshes scan data, preserves user content

#### Pipeline
- Four-agent pipeline: Think, Plan, Build, Verify
- Sealed contracts with typed assertions (equals, contains, exists, greater, truthy, not_equals, not_contains)
- Hash-verified artifact saves with atomic commits
- Branch-aware pipeline state tracking
- PR creation from verified builds

#### Proof chain
- One entry per pipeline run: assertions, findings, timing, hashes
- Quality trajectory via `ana proof health`
- Finding lifecycle: active, closed, promoted, lesson
- Finding-to-rule promotion via `ana proof promote`
- Staleness detection via `ana proof stale`
- Severity classification: risk, debt, observation
- Active findings audit via `ana proof audit`
- File-scoped context queries via `ana proof context`

#### Learn agent
- Severity-based triage between pipeline cycles
- Pattern promotion to skill rules
- Think handoff for scope-worthy findings

#### Setup
- Guess-and-confirm enrichment via Claude Code agent
- Phase-tracked state with resume support
- Context file validation via `ana setup check`

#### Infrastructure
- CI: 3 OS (Ubuntu, macOS, Windows) x 2 Node versions (20, 22)
- Pre-commit hooks: typecheck + lint
- Atomic init with crash-safe rollback

---

Previous development history is preserved in git log.

[Unreleased]: https://github.com/anatomia-dev/anatomia/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/anatomia-dev/anatomia/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/anatomia-dev/anatomia/compare/v1.1.5...v1.2.0
[1.1.5]: https://github.com/anatomia-dev/anatomia/compare/v1.1.4...v1.1.5
[1.1.4]: https://github.com/anatomia-dev/anatomia/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/anatomia-dev/anatomia/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/anatomia-dev/anatomia/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/anatomia-dev/anatomia/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/anatomia-dev/anatomia/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/anatomia-dev/anatomia/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/anatomia-dev/anatomia/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/anatomia-dev/anatomia/releases/tag/v1.0.0
