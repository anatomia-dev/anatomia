# Scope: Docs Data Pipeline

**Created by:** Ana
**Date:** 2026-05-12

## Intent
Every dynamic value on the docs site needs a source, an extraction path, and a typed loader. The docs site currently has no data — proof counts, agent names, command lists, version numbers are all absent. This scope builds the pre-build extraction pipeline that reads source files from the monorepo, writes typed JSON to `website/data/docs/`, and exposes typed loader functions that page components import. Without this, Scopes 3-6 are blocked.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — one script, one loader module per data source, types, wiring
- **Files affected:**
  - `website/scripts/extract-docs-data.ts` (new — the extraction script)
  - `website/lib/docs-data/proofs.ts` (new)
  - `website/lib/docs-data/agents.ts` (new)
  - `website/lib/docs-data/skills.ts` (new)
  - `website/lib/docs-data/commands.ts` (new)
  - `website/lib/docs-data/context.ts` (new)
  - `website/lib/docs-data/gotchas.ts` (new)
  - `website/lib/docs-data/meta.ts` (new)
  - `website/lib/docs-data/types.ts` (new — shared types for all data shapes)
  - `website/lib/docs-data/index.ts` (new — barrel export)
  - `website/package.json` (modify — add `prebuild` script)
- **Blast radius:** Low. All new files. The only modification to existing code is adding a `prebuild` script to `website/package.json`. The extraction script reads from the CLI package and `.ana/` but doesn't modify them. `data/docs/` is already gitignored (Scope 1).
- **Estimated effort:** 3-4 hours
- **Multi-phase:** no

## Approach
Build a single TypeScript extraction script that runs at prebuild time. It reads 7 source locations in the monorepo, computes derived data (proof categories, command groups, agent metadata), and writes 7 JSON files to `website/data/docs/`. A parallel set of typed loader functions in `website/lib/docs-data/` reads those JSON files via `fs.readFileSync` at Next.js build time and exposes typed accessors.

CLI command extraction uses regex on Commander.js source files — the registration pattern (`new Command().description().argument().option()`) is consistent across all 11 command files. This avoids importing the CLI module graph (ora, chalk, git helpers, etc.) into the website build.

Gotcha extraction imports `gotchas.ts` directly via tsx — it's a pure data file with zero external dependencies.

The extraction script deletes `data/docs/` at the start of each run, validates data completeness before writing, and exits non-zero on any error — so `next build` fails if extraction fails (missing JSON files cause import errors).

## Acceptance Criteria
- AC1: `pnpm build` succeeds in the website package with the extraction script running at prebuild
- AC2: Seven JSON files are written to `website/data/docs/`: `proof-entries.json`, `agent-templates.json`, `skill-templates.json`, `commands.json`, `context-files.json`, `gotchas.json`, `build-meta.json`
- AC3: Proof entries have computed `stage` values using the category algorithm from the blueprint (modules_touched pattern matching with keyword fallback)
- AC4: CLI commands are extracted via regex from all 11 command files, including subcommands (proof: 6, work: 3, artifact: 2, config: 3)
- AC5: Agent templates include parsed YAML frontmatter (name, model, description, reads, writes, forbidden) and markdown body
- AC6: Skill templates include parsed section structure (Detected, Rules, Gotchas, Examples sections)
- AC7: All typed loader functions return correct data — e.g., `getProofEntries()` returns the full array, `getProofStats()` returns `{ entries, assertions, findings, rejections }`, `getCommandCount()` matches the extracted command count
- AC8: `build-meta.json` contains `version` (from `packages/cli/package.json`), `commitSha` (from `git rev-parse --short HEAD`), and `buildTimestamp` (ISO string)
- AC9: The extraction script deletes `data/docs/` before each run and validates completeness (proof entries > 0, commands array not empty, all 6 agent templates found, all 8 skill templates found)
- AC10: The extraction script exits non-zero on any extraction error, preventing stale data from surviving a failure

## Edge Cases & Risks
- **Early proof entries without `modules_touched`:** Some entries predate this field. The categorization algorithm falls back to keyword matching on `scope_summary`, then defaults to `Infra`.
- **Subcommand nesting:** `proof` has 6 subcommands, `work` has 3, `artifact` has 2, `config` has 3. The regex extraction must handle `new Command()` inside `register*Command` functions, distinguishing parent commands from subcommands.
- **`check` and `symbol-index` commands:** These exist in `src/commands/` but are not registered in `index.ts`. The extraction should only include registered commands — either by cross-referencing `index.ts` imports or by only parsing files that have a corresponding `register*Command` import.
- **Agent template frontmatter variation:** Some templates may have fields others lack (e.g., `reads`, `writes`, `forbidden` are not present on all agents). The parser must handle optional fields.
- **Gotchas import path:** `gotchas.ts` uses relative imports for its type. The tsx import needs the correct path resolution from the website scripts directory.
- **Git state during Vercel builds:** `git rev-parse --short HEAD` must work in Vercel's build environment. Vercel clones the repo, so this should work, but worth a build-time fallback (e.g., `VERCEL_GIT_COMMIT_SHA` env var).

## Rejected Approaches
- **Importing Commander.js modules via tsx:** Would pull the entire CLI dependency tree (ora, chalk, fs helpers, git helpers, tree-sitter) into the website build. The command registration pattern is consistent enough for regex extraction. Build-time completeness assertions catch any drift.
- **AST parsing for commands (tree-sitter/ts-morph):** Accurate but heavy. Adding a full AST parser dependency for extracting simple chained method calls is over-engineered. Regex handles the consistent pattern; completeness checks catch edge cases.
- **Separate extraction scripts per data source:** Unnecessary fragmentation. The total script is ~300-400 lines — one file with internal extractor functions is cleaner and easier to maintain.
- **Runtime data loading (API routes):** All data is known at build time. Static JSON files read via `fs.readFileSync` are simpler, faster, and produce static HTML. No runtime overhead.

## Open Questions
- Plan should verify the exact YAML frontmatter shape across all 6 agent templates — which fields are present on which agents (reads, writes, forbidden, memory, model).
- Plan should decide whether `commandsGroup()` group names from `index.ts` (GETTING STARTED, PIPELINE, CONFIGURATION, INTELLIGENCE) are extracted or hardcoded. They're stable but technically extractable.
- Plan should verify the `symbol-index` and `check` commands — are they internal/hidden, or should they appear in the docs CLI reference?

## Exploration Findings

### Patterns Discovered
- `packages/cli/src/index.ts`: Commands registered via `register*Command(program)` pattern, grouped with `program.commandsGroup('GROUP NAME')` (lines 41-58)
- `packages/cli/src/commands/*.ts`: All 11 files export a `register*Command` function. Commands use chained `.description()`, `.argument()`, `.option()` calls. Subcommands use `parentCommand.addCommand(childCommand)` pattern.
- `packages/cli/templates/.claude/agents/*.md`: 6 files with YAML frontmatter (delimited by `---`) containing at minimum `name`, `model`, `description`
- `packages/cli/templates/.claude/skills/*/SKILL.md`: 8 files with section-based structure
- `packages/cli/src/data/gotchas.ts`: Exports `GOTCHAS: GotchaEntry[]` with `id`, `triggers`, `skill`, `text` fields. Pure data, zero external dependencies.
- `.ana/proof_chain.json`: 22K lines, entries have `slug`, `feature`, `result`, `contract`, `assertions[]`, `findings[]`, `timing`, `hashes`, `modules_touched[]`, `scope_summary`

### Constraints Discovered
- [TYPE-VERIFIED] Commander pattern (all 11 command files) — Consistent `new Command('name').description('...').argument('...').option('...')` chaining
- [TYPE-VERIFIED] Proof chain shape (proof_chain.json:1-60) — Entries have `slug`, `feature`, `result`, `contract` (with `total`, `satisfied`), `assertions[]`, `modules_touched[]`
- [OBSERVED] Agent frontmatter — At minimum `name`, `model`, `description` fields in YAML between `---` delimiters
- [OBSERVED] Gotcha type — `GotchaEntry` interface with `id: string`, `triggers: Record<string, string>`, `skill: string`, `text: string`
- [OBSERVED] data/docs/ already gitignored — Scope 1 added this
- [OBSERVED] website has `tsx` available — used for `postinstall: fumadocs-mdx`, available as dev dependency

### Test Infrastructure
- Website has no test files currently — this scope's verification is `pnpm build` succeeding with data flowing through
- CLI package has extensive Vitest tests but they don't cover the website extraction script

## For AnaPlan

### Structural Analog
`packages/cli/src/commands/init/assets.ts` — the closest structural match. It reads source files (templates, skill files), parses their content, and generates output files. The extraction script does the same thing in reverse: reading CLI source to produce website data. Same shape: read files → parse → transform → write.

### Relevant Code Paths
- `packages/cli/src/index.ts` — command registration with group names (lines 38-58)
- `packages/cli/src/commands/*.ts` — 11 command files, each with `register*Command` export
- `packages/cli/templates/.claude/agents/*.md` — 6 agent template files
- `packages/cli/templates/.claude/skills/*/SKILL.md` — 8 skill template files
- `packages/cli/src/data/gotchas.ts` — gotcha library (pure data export)
- `.ana/proof_chain.json` — proof chain data
- `.ana/context/*.md` — 2 context files (project-context.md, design-principles.md)
- `.ana/ana.json` — project config
- `.ana/scan.json` — scan results
- `packages/cli/package.json` — version field
- `website/package.json` — where `prebuild` script gets added

### Patterns to Follow
- `packages/cli/src/commands/init/assets.ts` for file reading + content generation pattern
- `packages/cli/src/data/gotchas.ts` for the gotcha data shape (import directly)
- Proof chain JSON shape from `.ana/proof_chain.json` entries

### Known Gotchas
- `git rev-parse` needs a fallback for CI environments — Vercel provides `VERCEL_GIT_COMMIT_SHA` env var
- `tsx` must be available at script execution time — it's a dev dependency, available during build
- The `prebuild` script in `package.json` runs before `next build` — it must complete successfully or the build fails
- `data/docs/` directory may not exist on first run — the script must create it after deletion

### Things to Investigate
- Exact YAML frontmatter fields across all 6 agent templates (which have reads/writes/forbidden/memory)
- Whether `symbol-index` and `check` commands should be included or excluded from the CLI reference
- Whether `commandsGroup()` group names should be extracted from `index.ts` or hardcoded
