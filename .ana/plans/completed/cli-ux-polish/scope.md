# Scope: CLI UX Polish — First 10 Minutes

**Created by:** Ana
**Date:** 2026-05-05

## Intent

Make the first 10 minutes of using Anatomia feel professional. A developer who runs `ana --help` should immediately understand what the tool does, which commands matter, and how to start. Right now: flat command list, jargon descriptions, no examples, wrong ordering, misleading CTA. Every competitor (gh, npm, docker) has grouped commands, clear descriptions, and examples. We don't.

## Complexity Assessment
- **Size:** small-medium
- **Files affected:**
  - `src/index.ts` — command registration order, descriptions, help text formatting, version output
  - `src/commands/scan.ts` — CTA wording (line 322)
  - `src/commands/setup.ts` — hide `index` subcommand
  - `templates/.claude/skills/*/ENRICHMENT.md` — add internal marker (8 files)
  - Tests that assert on help output or version format
- **Blast radius:** User-facing output only. No behavioral changes. No data model changes.
- **Estimated effort:** 1 phase
- **Multi-phase:** no

## Approach

Seven changes, one principle: a stranger should understand every word in `ana --help`.

### 1. Fix scan CTA
`scan.ts:322` — `"Found ${findings} issues. Run \`ana init\` to fix them."` → `"Found ${findings} issues. Run \`ana init\` to scaffold context and agents for your project."`

The word "fix" creates a false promise. Init scaffolds context — it has nothing to do with fixing hardcoded secrets or missing validation.

### 2. Add examples to subcommand help
Add `.addHelpText('after', ...)` with concrete examples to:
- `scan` — `ana scan .` and `ana scan /path/to/project --json`
- `init` — `ana init` and `ana init --yes`
- `work start` — `ana work start fix-auth-timeout`
- `artifact save` — `ana artifact save scope my-feature`

Format follows the `gh` pattern:
```
EXAMPLES
  $ ana scan .
  $ ana scan /path/to/project --json
```

### 3. Rewrite command descriptions
Every description must be understood by someone who has never heard of Anatomia:
- `init` → "Scan project and generate agent context"
- `scan` → "Detect stack, conventions, and patterns"
- `setup` → "Enrich context with team knowledge"
- `artifact` → "Save pipeline outputs with hash verification"
- `work` → "Start, track, and complete development tasks"
- `verify` → "Verify contract assertions before code review"
- `pr` → "Create pull request from verified build"
- `agents` → "List installed agent definitions"
- `proof` → "View proof chain entries, health, and findings" (already clear — keep)

### 4. Group and reorder commands
Replace the flat command list with grouped categories (gh pattern):

```
Getting Started
  scan [path]        Detect stack, conventions, and patterns
  init               Scan project and generate agent context
  setup              Enrich context with team knowledge

Pipeline
  work               Start, track, and complete development tasks
  artifact           Save pipeline outputs with hash verification
  verify             Verify contract assertions before code review
  pr                 Create pull request from verified build

Intelligence
  proof [slug]       View proof chain entries, health, and findings
  agents             List installed agent definitions
```

Entry-point commands first (scan before init — zero-install audition). Pipeline commands second. Intelligence commands last.

Implementation: Commander v14 has native `.commandsGroup()` support. Call `program.commandsGroup('GETTING STARTED')` before registering scan/init/setup, then `program.commandsGroup('PIPELINE')` before work/artifact/verify/pr, then `program.commandsGroup('INTELLIGENCE')` before proof/agents. No custom help rendering needed.

### 5. Add internal marker to ENRICHMENT.md files
First line of each ENRICHMENT.md: `<!-- Internal: read by ana-setup only. Not for manual editing. -->`

8 files in `templates/.claude/skills/*/ENRICHMENT.md`.

### 6. Fix version output
`index.ts` — change from `anatomia-cli/${pkg.version}` to `ana/${pkg.version}`.

### 7. Hide `setup index` subcommand
`setup.ts` — add `.hideHelp()` to the `index` subcommand registration. It's agent-internal tooling, not for human use.

## Acceptance Criteria
- AC1: `ana scan .` on a project with findings shows "scaffold context" not "fix them"
- AC2: `ana scan --help` shows at least 2 usage examples
- AC3: `ana init --help` shows at least 1 usage example
- AC4: `ana work start --help` shows at least 1 usage example
- AC5: `ana --help` shows commands grouped into "Getting Started", "Pipeline", and "Intelligence" categories
- AC6: `scan` appears before `init` in the Getting Started group
- AC7: Every command description is free of internal jargon (no "context framework", "contract seal", "plan artifacts", "deployed agents")
- AC8: `ana --version` outputs `ana/X.Y.Z` not `anatomia-cli/X.Y.Z`
- AC9: `ana setup --help` does NOT show `index` subcommand
- AC10: Every ENRICHMENT.md starts with `<!-- Internal: ... -->` HTML comment
- AC11: All existing tests pass

## Edge Cases & Risks
- **Commander grouping:** Commander v14 has native `.commandsGroup()` — verified locally. No custom help rendering needed.
- **Test impact:** Tests that assert on `--help` output or version string format will need updating.
- **`setup index` visibility:** `.hideHelp()` hides from `--help` but the command still works if called directly. This is correct — agents call it programmatically.
- **Subcommand examples format:** The `EXAMPLES` section via `.addHelpText('after', ...)` appears after Commander's default help. Verify the visual layout doesn't look broken.

## Rejected Approaches
- **Custom help renderer.** Commander v14 has native `.commandsGroup()`. No custom renderer needed.
- **Examples in top-level help.** `gh` puts examples only in subcommand help, not the top-level `--help`. Follow the same pattern — keep top-level clean.

## Open Questions
- The `EXAMPLES` section in top-level help — use `.addHelpText('after', ...)` to append examples after the grouped commands. Plan should verify the visual layout is clean with Commander v14's grouped output.

## Exploration Findings

### Patterns Discovered
- `gh` groups commands into CORE COMMANDS, GITHUB ACTIONS COMMANDS, ADDITIONAL COMMANDS with section headers
- `gh` uses `Run 'gh <command> <subcommand> --help' for more information` as footer
- `gh` examples use `$ ` prefix format with right-aligned descriptions
- `docker` groups into Management Commands and Commands
- Commander v14 has native `.commandsGroup(heading)` — verified locally: `typeof program.commandsGroup === 'function'`. Also has `.helpGroup(heading)` per-command. No custom help rendering needed.

### Constraints Discovered
- [OBSERVED] Commander registers commands in insertion order — reordering in `index.ts` changes `--help` order
- [OBSERVED] Commander `.addHelpText('beforeAll', text)` adds text before the generated help
- [OBSERVED] Current `index.ts` registers: init, scan, setup, artifact, work, proof, pr, agents, verify

### Test Infrastructure
- `tests/commands/` — various test files may assert on help output
- Version assertion may exist in `tests/` (search for `anatomia-cli/`)

## For AnaPlan

### Structural Analog
`gh --help` — the gold standard for grouped command help in a CLI. Same pattern: tagline, usage, grouped commands with section headers, footer pointing to subcommand help.

### Relevant Code Paths
- `src/index.ts:33-44` — command registration (9 `register*Command` calls)
- `src/index.ts:26-33` — version setup
- `src/commands/scan.ts:322` — CTA wording
- `src/commands/setup.ts` — `index` subcommand registration

### Patterns to Follow
- `gh` help format: section headers in caps, aligned descriptions, footer with "Run X --help for more"
- `gh pr create --help` example format: `EXAMPLES` header, `$ ` prefix, 3-5 examples

### Known Gotchas
- Commander's default help output must be suppressed or overridden for grouped commands — if not, you get both the custom groups AND the default flat list
- `.hideHelp()` on `setup index` only hides from parent help — `ana setup index --help` still works (correct behavior)
- ENRICHMENT.md files exist in both `templates/.claude/skills/` (8 files) and potentially `.claude/skills/` (dogfood copies). Only template files need the marker — init copies them to user projects.
