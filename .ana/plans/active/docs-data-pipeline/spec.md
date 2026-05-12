# Spec: Docs Data Pipeline

**Created by:** AnaPlan
**Date:** 2026-05-12
**Scope:** .ana/plans/active/docs-data-pipeline/scope.md

## Approach

Build a single TypeScript extraction script that runs at prebuild time. It reads 7 data sources from the monorepo, writes 7 JSON files to `website/data/docs/`, and exits non-zero on any failure so `next build` never runs against stale or missing data.

A parallel set of typed loader functions in `website/lib/docs-data/` reads those JSON files via `fs.readFileSync` at Next.js build time. Page components import typed accessors — never raw JSON.

**Extraction strategy by data source:**

1. **Proof chain** — Read `.ana/proof_chain.json`, parse `entries` array. Compute `stage` per entry using `modules_touched` pattern matching (path prefix → category), with keyword fallback on `scope_summary` for the 2 entries missing `modules_touched`. Default category: `Infra`.
2. **CLI commands** — Regex extraction from the 10 registered command files. Parse `new Command('name').description('...')` chains and `parentCommand.addCommand(childCommand)` nesting. Cross-reference `index.ts` imports to determine which files to parse. Extract group names from `program.commandsGroup('...')` calls.
3. **Agent templates** — Read 6 `.md` files from `packages/cli/templates/.claude/agents/`. Parse YAML frontmatter for structured fields. Parse `## What You Do NOT Do` section for `forbidden` array. Merge with a hardcoded static map for `reads` and `writes` arrays (pipeline architecture facts that change only when agent roles change).
4. **Skill templates** — Read 8 `SKILL.md` files from `packages/cli/templates/.claude/skills/*/`. Parse YAML frontmatter (`name`, `description`). Parse section structure: Detected, Rules, Gotchas, Examples — extract heading + content for each.
5. **Gotchas** — Import `packages/cli/src/data/gotchas.ts` directly via `tsx`. It's a pure data file exporting `GOTCHAS: GotchaEntry[]` with zero external dependencies. The `GotchaEntry` interface is defined in the same file.
6. **Context files** — Read `.ana/context/project-context.md` and `.ana/context/design-principles.md`. Extract front matter if present, plus the full markdown body. These are small files — store the full content.
7. **Build meta** — Read `packages/cli/package.json` for `version`. Get commit SHA from `VERCEL_GIT_COMMIT_SHA` env var, falling back to `git rev-parse --short HEAD`, falling back to `"unknown"`. Generate ISO timestamp.

**Key decision — command extraction:** The scope says "11 command files" but only 10 are registered in `index.ts`. `check.ts` is actually `ana setup check` and `symbol-index.ts` is `ana setup index` — both are subcommands of setup, not standalone registrations. The extraction script parses only the files imported in `index.ts`: `scan.ts`, `init/index.ts`, `setup.ts`, `work.ts`, `artifact.ts`, `verify.ts`, `pr.ts`, `config.ts`, `proof.ts`, `agents.ts`.

**Key decision — command groups:** Extract group names from `index.ts` via regex on `program.commandsGroup('...')`. This keeps the docs correct if groups are renamed or reordered without requiring a manual update.

**Key decision — agent reads/writes/forbidden:** Three sources merged per agent:
- Frontmatter (parsed) → `name`, `model`, `description`, plus optional `skills`, `memory`, `initialPrompt`
- Body section (parsed) → `forbidden` array from `## What You Do NOT Do` bullet items. 4 of 6 agents have this section (build, verify, plan, learn). `ana` and `ana-setup` get empty arrays.
- Static map (hardcoded in script) → `reads` and `writes` arrays. These are pipeline architecture facts. The map:
  - `ana`: reads `[codebase, .ana/context/*, .ana/scan.json]`, writes `[scope.md]`
  - `ana-plan`: reads `[scope.md, codebase]`, writes `[plan.md, spec.md, contract.yaml]`
  - `ana-build`: reads `[spec.md, contract.yaml]`, writes `[code, tests, build_report.md]`
  - `ana-verify`: reads `[spec.md, contract.yaml, code, tests]`, writes `[verify_report.md]`
  - `ana-learn`: reads `[proof_chain.json, skills, codebase]`, writes `[skill rules, finding closures]`
  - `ana-setup`: reads `[scan.json, codebase]`, writes `[project-context.md, design-principles.md]`

**Key decision — proof entry categorization:** The `stage` field uses `modules_touched` path prefixes:
- `src/engine/` → Engine
- `src/commands/` → Commands
- `src/utils/` or `src/data/` → Utils
- `templates/` → Templates
- `website/` → Website
- `.ana/` or `.claude/` → Pipeline
- Mixed or unclear → keyword match on `scope_summary` (scan/detect → Engine, command/cli → Commands, proof/verify → Pipeline, etc.)
- Default: `Infra`

## Output Mockups

### JSON file: `proof-entries.json`
```json
[
  {
    "slug": "proof-list-view",
    "feature": "Proof List View",
    "result": "PASS",
    "stage": "Commands",
    "contract": { "total": 19, "satisfied": 19 },
    "assertionCount": 19,
    "findingCount": 3,
    "completedAt": "2026-04-15T...",
    "scopeSummary": "Add proof list command...",
    "modulesTouched": ["src/commands/proof.ts", "..."]
  }
]
```

### JSON file: `agent-templates.json`
```json
[
  {
    "name": "ana-build",
    "model": "opus[1m]",
    "description": "AnaBuild — reads spec, produces working code...",
    "skills": ["git-workflow"],
    "memory": null,
    "initialPrompt": null,
    "reads": ["spec.md", "contract.yaml"],
    "writes": ["code", "tests", "build_report.md"],
    "forbidden": [
      "Don't re-scope or re-plan.",
      "Don't question acceptance criteria.",
      "Don't create PRs.",
      "..."
    ],
    "bodyMarkdown": "# AnaBuild\n\nYou are **AnaBuild**..."
  }
]
```

### JSON file: `commands.json`
```json
{
  "groups": [
    {
      "name": "GETTING STARTED",
      "commands": [
        {
          "name": "scan",
          "description": "Zero-install project scanner",
          "arguments": [{ "name": "path", "description": "Path to scan", "required": false }],
          "options": [
            { "flags": "--json", "description": "Output JSON format" },
            { "flags": "--quick", "description": "Fast scan — skip deep code analysis" }
          ],
          "subcommands": []
        }
      ]
    }
  ],
  "totalCommands": 27
}
```

### JSON file: `skill-templates.json`
```json
[
  {
    "name": "coding-standards",
    "description": "Invoke when implementing features...",
    "sections": [
      { "heading": "Detected", "content": "<!-- Populated by scan... -->" },
      { "heading": "Rules", "content": "- Prefer named exports..." },
      { "heading": "Gotchas", "content": "*Not yet captured...*" },
      { "heading": "Examples", "content": "*Not yet captured...*" }
    ]
  }
]
```

### JSON file: `gotchas.json`
```json
[
  {
    "id": "vitest-watch-mode",
    "triggers": { "testing": "Vitest" },
    "skill": "testing-standards",
    "text": "Vitest defaults to watch mode..."
  }
]
```

### JSON file: `context-files.json`
```json
[
  {
    "name": "project-context",
    "filename": "project-context.md",
    "content": "# Project Context\n\n## What This Product Does..."
  },
  {
    "name": "design-principles",
    "filename": "design-principles.md",
    "content": "---\nname: design-principles\n..."
  }
]
```

### JSON file: `build-meta.json`
```json
{
  "version": "1.0.2",
  "commitSha": "c8bfb0c",
  "buildTimestamp": "2026-05-12T15:40:00.000Z"
}
```

### Loader usage (by page components)
```ts
import { getProofEntries, getProofStats } from '@/lib/docs-data';

const entries = getProofEntries();
const stats = getProofStats();
// stats = { entries: 86, assertions: 1871, findings: 497, rejections: 0 }
```

## File Changes

### `website/scripts/extract-docs-data.ts` (create)
**What changes:** The extraction script. Single file with internal extractor functions for each data source. Runs via `tsx` at prebuild time. Deletes `data/docs/` at start, creates it, writes 7 JSON files, validates completeness, exits non-zero on any error.
**Pattern to follow:** `packages/cli/src/commands/init/assets.ts` — same shape of read files → parse → transform → write. But simpler: no spinner, no CLI dependencies, just file I/O and transforms.
**Why:** Without this script, no data flows to the docs site. All downstream scopes (3-6) are blocked.

### `website/lib/docs-data/types.ts` (create)
**What changes:** Shared TypeScript interfaces for all 7 JSON data shapes. `ProofEntry`, `AgentTemplate`, `SkillTemplate`, `CommandGroup`, `Command`, `GotchaEntry`, `ContextFile`, `BuildMeta`. Also `ProofStats` for the computed summary.
**Pattern to follow:** Define interfaces matching the JSON output mockups above. Use `| null` for optional fields per coding standards.
**Why:** Type safety for both the extraction script (output) and loaders (input). Shared types prevent drift between writer and reader.

### `website/lib/docs-data/proofs.ts` (create)
**What changes:** Typed loader for proof-entries.json. Exports `getProofEntries(): ProofEntry[]` and `getProofStats(): ProofStats`. `getProofStats()` computes `{ entries, assertions, findings, rejections }` from the array.
**Pattern to follow:** `fs.readFileSync` + `JSON.parse` with type assertion. Cache the parsed result in a module-level variable so repeated calls during a single build don't re-parse.
**Why:** Page components need both the full array (for proof feed/timeline) and aggregate stats (for hero numbers).

### `website/lib/docs-data/agents.ts` (create)
**What changes:** Typed loader for agent-templates.json. Exports `getAgentTemplates(): AgentTemplate[]`, `getAgentByName(name: string): AgentTemplate | null`, `getAgentCount(): number`.
**Pattern to follow:** Same readFileSync + cache pattern as proofs.ts.
**Why:** Agent reference pages need per-agent data. Count needed for hero stats.

### `website/lib/docs-data/skills.ts` (create)
**What changes:** Typed loader for skill-templates.json. Exports `getSkillTemplates(): SkillTemplate[]`, `getSkillByName(name: string): SkillTemplate | null`, `getSkillCount(): number`.
**Pattern to follow:** Same readFileSync + cache pattern.
**Why:** Skill reference pages need per-skill data.

### `website/lib/docs-data/commands.ts` (create)
**What changes:** Typed loader for commands.json. Exports `getCommands(): CommandsData`, `getCommandCount(): number`, `getCommandGroups(): CommandGroup[]`.
**Pattern to follow:** Same readFileSync + cache pattern.
**Why:** CLI reference page needs grouped commands. Count needed for hero stats.

### `website/lib/docs-data/context.ts` (create)
**What changes:** Typed loader for context-files.json. Exports `getContextFiles(): ContextFile[]`.
**Pattern to follow:** Same readFileSync + cache pattern.
**Why:** Docs pages showing how context files work.

### `website/lib/docs-data/gotchas.ts` (create)
**What changes:** Typed loader for gotchas.json. Exports `getGotchas(): GotchaEntry[]`, `getGotchaCount(): number`.
**Pattern to follow:** Same readFileSync + cache pattern.
**Why:** Gotcha reference page.

### `website/lib/docs-data/meta.ts` (create)
**What changes:** Typed loader for build-meta.json. Exports `getBuildMeta(): BuildMeta`.
**Pattern to follow:** Same readFileSync + cache pattern.
**Why:** Version display, build info for footer/debug.

### `website/lib/docs-data/index.ts` (create)
**What changes:** Barrel export re-exporting all loader functions and types from sibling modules.
**Pattern to follow:** Standard barrel pattern. Re-export everything.
**Why:** Single import path for page components: `import { getProofStats, getAgentTemplates } from '@/lib/docs-data'`.

### `website/package.json` (modify)
**What changes:** Add `"prebuild": "tsx scripts/extract-docs-data.ts"` to scripts. Add `tsx` as a devDependency.
**Pattern to follow:** Existing scripts section. `prebuild` is a npm lifecycle hook — it runs automatically before `build`.
**Why:** Wires the extraction into the build pipeline. `tsx` is needed to run TypeScript directly without a compile step.

## Acceptance Criteria

- [x] AC1: `pnpm build` succeeds in the website package with the extraction script running at prebuild
- [ ] AC2: Seven JSON files are written to `website/data/docs/`: `proof-entries.json`, `agent-templates.json`, `skill-templates.json`, `commands.json`, `context-files.json`, `gotchas.json`, `build-meta.json`
- [ ] AC3: Proof entries have computed `stage` values using the category algorithm (modules_touched pattern matching with keyword fallback)
- [ ] AC4: CLI commands are extracted via regex from all 10 registered command files, including subcommands (proof: 8, work: 3, artifact: 2, config: 3, agents: 1)
- [ ] AC5: Agent templates include parsed YAML frontmatter (name, model, description, plus optional skills/memory/initialPrompt), parsed forbidden array from body, and hardcoded reads/writes arrays
- [ ] AC6: Skill templates include parsed YAML frontmatter (name, description) and section structure (Detected, Rules, Gotchas, Examples)
- [ ] AC7: All typed loader functions return correct data — e.g., `getProofEntries()` returns the full array, `getProofStats()` returns `{ entries, assertions, findings, rejections }`, `getCommandCount()` matches the extracted command count
- [ ] AC8: `build-meta.json` contains `version` (from `packages/cli/package.json`), `commitSha` (from git or env var), and `buildTimestamp` (ISO string)
- [ ] AC9: The extraction script deletes `data/docs/` before each run and validates completeness (proof entries > 0, commands array not empty, all 6 agent templates found, all 8 skill templates found)
- [ ] AC10: The extraction script exits non-zero on any extraction error, preventing stale data from surviving a failure
- [ ] Tests pass with project test command
- [ ] No TypeScript errors in the website package (`pnpm typecheck` in website/)
- [ ] `prebuild` lifecycle hook wires correctly — `pnpm build` in website/ triggers extraction automatically

## Testing Strategy

- **Unit tests:** None for the extraction script itself — the website package has no test infrastructure. Verification is the build succeeding with data flowing through.
- **Integration test:** `pnpm build` in the website package is the integration test. If extraction fails or produces bad data, the build fails.
- **Manual verification:** After build, inspect the 7 JSON files in `website/data/docs/` for completeness and correctness. Spot-check: proof entry count = 86, command count = 27, agent count = 6, skill count = 8.
- **Completeness assertions in the script itself:** The extraction script validates before exiting: proof entries > 0, commands not empty, 6 agents, 8 skills, gotchas array exists, context files exist, meta has version.

## Dependencies

- `tsx` must be available as a devDependency of the website package
- `packages/cli/src/data/gotchas.ts` must remain a pure data file (no external imports)
- `.ana/proof_chain.json` must exist with `entries` array
- `packages/cli/templates/.claude/agents/` must contain 6 `.md` files
- `packages/cli/templates/.claude/skills/*/SKILL.md` must contain 8 skill files
- `data/docs/` must be in `website/.gitignore` (already added by Scope 1)

## Constraints

- The extraction script must NOT import any CLI package modules that pull in ora, chalk, commander, or other CLI dependencies. Regex extraction for commands, direct file reads for everything else.
- The single exception is `gotchas.ts` which is imported via `tsx` — it has zero external dependencies.
- All loader functions use synchronous `fs.readFileSync` — these run at Next.js build time, not at request time.
- The script must work in Vercel's build environment (git available, env vars available, no interactive prompts).

## Gotchas

- **`prebuild` lifecycle hook:** npm/pnpm runs `prebuild` automatically before `build`. But `next build` is what's in the `build` script — so `prebuild` runs the extraction, then `next build` runs. If extraction fails, `next build` never starts. This is the desired behavior.
- **Path resolution from website/scripts/:** The extraction script runs from `website/` as cwd. All paths to CLI source files must be relative: `../packages/cli/src/commands/...`. Use `path.resolve(__dirname, '..')` or similar to compute the monorepo root reliably.
- **`tsx` import of gotchas.ts:** The script itself runs under `tsx`, so it can import `.ts` files directly. Import `gotchas.ts` using a relative path from the script location. The `GotchaEntry` type is defined in the same file — no transitive imports.
- **Proof chain `modules_touched` missing on 2 entries:** The earliest 2 entries predate this field. The categorization must handle `undefined` gracefully — fall through to keyword matching, then default to `Infra`.
- **Agent frontmatter parsing:** YAML between `---` delimiters. Some fields are arrays (`skills: [git-workflow]`), some are strings. Use a YAML parser (the `yaml` package is available in the CLI's deps — but the website doesn't have it). Either add `yaml` as a devDependency or write a simple frontmatter parser for the limited set of fields. The frontmatter is simple enough that a basic parser works: split on `---`, parse key-value lines. But `yaml` is cleaner — add it as a devDependency.
- **`## What You Do NOT Do` parsing:** Extract bullet items between this heading and the next `---` or `## ` heading. Strip the `**...**` bold prefix from each bullet. Some bullets have multi-sentence explanations — take only the bold prefix text as the forbidden item label.
- **Command regex must handle multiline chains:** `new Command('name')\n  .description('...')\n  .argument(...)` spans multiple lines. The regex should work on the full file content, not line-by-line. Use dotAll or multiline mode.
- **`init` command lives in `commands/init/index.ts`**, not `commands/init.ts`. The import in `index.ts` is `./commands/init/index.js` — the file resolution must follow this.

## Build Brief

### Rules That Apply
- No `.js` extensions needed in the website package — it uses Next.js with its own module resolution, not the CLI's ESM setup. The extraction script runs under `tsx` which handles resolution.
- Use `import type` for type-only imports, separate from value imports.
- Prefer named exports. No default exports.
- Explicit return types on all exported functions.
- Use `| null` for fields that were checked and found empty (e.g., `memory: string[] | null`).
- Early returns over nested conditionals.
- The website package uses Next.js conventions — `@/` path alias for imports from `lib/`, `components/`, etc.

### Pattern Extracts

**Command registration pattern** (from `packages/cli/src/index.ts`, lines 38-57):
```ts
program.commandsGroup('GETTING STARTED');
registerScanCommand(program);
registerInitCommand(program);
registerSetupCommand(program);

program.commandsGroup('PIPELINE');
registerWorkCommand(program);
registerArtifactCommand(program);
registerVerifyCommand(program);
registerPrCommand(program);

program.commandsGroup('CONFIGURATION');
registerConfigCommand(program);

program.commandsGroup('INTELLIGENCE');
registerProofCommand(program);
registerAgentsCommand(program);
```

**Subcommand pattern** (from `packages/cli/src/commands/work.ts`, lines 2158-2189):
```ts
const workCommand = new Command('work')
  .description('Start, track, and complete development tasks');

const statusCommand = new Command('status')
  .description('Show pipeline state for all active work items')

const startCommand = new Command('start')
  .description('Start a new work item')

const completeCommand = new Command('complete')
  .description('Archive completed work after PR merge, optionally merging the PR first')

workCommand.addCommand(statusCommand);
workCommand.addCommand(startCommand);
workCommand.addCommand(completeCommand);

program.addCommand(workCommand);
```

**Agent frontmatter** (from `packages/cli/templates/.claude/agents/ana-build.md`, lines 1-5):
```yaml
---
name: ana-build
model: opus[1m]
description: "AnaBuild — reads spec, produces working code, tests, and build report. The builder."
skills: [git-workflow]
---
```

**Gotcha data shape** (from `packages/cli/src/data/gotchas.ts`, lines 10-15):
```ts
export interface GotchaEntry {
  id: string;
  triggers: Record<string, string>;
  skill: string;
  text: string;
}
```

**Proof chain entry keys** (from `.ana/proof_chain.json`):
`slug`, `feature`, `result`, `author`, `contract` (`{ total, covered, uncovered, satisfied, unsatisfied, deviated }`), `assertions` (`[{ id, says, status }]`), `acceptance_criteria`, `timing`, `hashes`, `completed_at`, `build_concerns`, `findings` (`[{ category, summary, file, severity, suggested_action, id, status }]`), `scope_summary`, `modules_touched` (array of file paths, missing on 2 oldest entries).

### Proof Context
- `website/package.json`: 1 finding — release script missing semver guard. Not relevant to this build.
- `website/lib/`: No proof findings.
- No active proof findings for affected files.

### Checkpoint Commands

- After extraction script created: `cd website && npx tsx scripts/extract-docs-data.ts` — Expected: 7 JSON files written to `data/docs/`, script exits 0
- After loader module created: `cd website && pnpm typecheck` — Expected: no type errors
- After all changes: `cd website && pnpm build` — Expected: prebuild runs extraction, next build succeeds
- CLI tests (regression): `cd packages/cli && pnpm vitest run` — Expected: 2178 passed, 2 skipped (100 test files)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2178 passed, 2 skipped (100 test files)
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: no new test files expected (website has no test infrastructure)
- Regression focus: CLI tests should be unchanged — this scope creates new files in website/ and only modifies website/package.json
