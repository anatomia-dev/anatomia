# Changelog

All notable changes to [anatomia-cli](https://www.npmjs.com/package/anatomia-cli) are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

## [Unreleased]

## [1.1.3] - 2026-05-22

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

### Added

- **Scan terminal Surfaces section** — surfaces promoted from inline sub-item to standalone section between Stack and Intelligence. Each surface shows framework (or language fallback) and primary testing framework.
- **Branch pattern detection from merge history** — reports the climate (e.g., "48/50 merges used `feature/`") instead of the weather (live remote branches). Falls back to remote branches for shallow clones.
- 10 new database packages — Kysely, MikroORM, slonik, @vercel/postgres, mongodb, postgres.js, sqlite3, mssql, and more
- 5 new framework config variants — `.mjs` variants for Svelte, Nuxt, Remix, React Router, Vue
- @stripe/react-stripe-js added to payment detection

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

[Unreleased]: https://github.com/anatomia-dev/anatomia/compare/v1.1.3...HEAD
[1.1.3]: https://github.com/anatomia-dev/anatomia/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/anatomia-dev/anatomia/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/anatomia-dev/anatomia/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/anatomia-dev/anatomia/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/anatomia-dev/anatomia/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/anatomia-dev/anatomia/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/anatomia-dev/anatomia/releases/tag/v1.0.0
