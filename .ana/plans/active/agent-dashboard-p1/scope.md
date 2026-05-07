# Scope: Agent Dashboard Phase 1

**Created by:** Ana
**Date:** 2026-05-06

## Intent

Agent model configuration requires hand-editing markdown frontmatter — open a file, find `model:`, know the exact identifier, save. Six agents means six manual edits. `ana agents` currently shows name, model, description and nothing else. The user wants CLI-driven model configuration and visibility into what each agent costs in context characters.

Two capabilities ship: an `ana agents model` subcommand for read/set/clear/blanket model changes, and an enhanced default display showing character budgets and skill counts.

Requirements are locked at `anatomia_reference/v1_Release/AGENT_DASHBOARD_PHASE1_REQUIREMENTS.md` (3-agent scrutiny, 2026-05-06). This scope faithfully transcribes that document into pipeline format.

## Complexity Assessment
- **Size:** medium
- **Files affected:** `packages/cli/src/commands/agents.ts`, `packages/cli/src/utils/agent-config.ts` (new), `packages/cli/tests/commands/agents.test.ts`
- **Blast radius:** Low. Self-contained in agents command. No changes to templates, init, artifact, work, proof, or ana.json.
- **Estimated effort:** ~350 LoC (replacing ~117 existing)
- **Multi-phase:** no (this IS Phase 1 of a larger Agent Dashboard vision; Phase 2 is separately scoped)

## Approach

Fix the current `parseFrontmatter` bug that rejects agents without `model:` — make model optional, show "(default)" when absent. Rewrite the display to show character count (template + loaded skills), skill count, and model in a collapsed footer (uniform) or inline column (mixed). Add `ana agents model` subcommand that reads/writes frontmatter directly in agent files. Extract write logic to `agent-config.ts` — the frontmatter serialization within the first `---` block is tricky enough to warrant its own module and tests.

No model name validation (Claude Code's domain). No git commits on write (model preference is local). No settings.json detection (Phase 2 if ever). Agent matching by filename, not frontmatter `name:` field.

## Acceptance Criteria
- AC1: `ana agents` shows character count for each agent (template + loaded skills)
- AC2: `ana agents model` with no arguments shows current model for each agent
- AC3: `ana agents model ana-build sonnet` writes `model: sonnet` to `.claude/agents/ana-build.md` frontmatter. File content otherwise unchanged.
- AC4: `ana agents model ana-build --default` removes the `model:` line from frontmatter
- AC5: `ana agents model --all sonnet` writes to every `.md` file in `.claude/agents/`
- AC6: When all agents share the same model, footer shows `Model: {value}`. When agents differ, per-agent models appear inline with footer noting overrides.
- AC7: Agents without `model:` in frontmatter display "(default)" and are not skipped from the listing
- AC8: `ana agents model nonexistent sonnet` prints a clear error with available agent names
- AC9: `ana agents model ana-build --default` when no `model:` line exists is a no-op with a message
- AC10: Skills count appears for agents with `skills:` in frontmatter
- AC11: Frontmatter write preserves all fields (`memory:`, `initialPrompt:`, `skills:`, etc.) — only `model:` is modified
- AC12: `--all` skips files with corrupt/missing frontmatter with a warning, continues to remaining files

## Edge Cases & Risks

- **Custom agents:** User-created `.md` files in `.claude/agents/` appear in the list. Character count works. Model config works (matched by filename). Skills show if declared.
- **Missing frontmatter:** Agent file with no `---` block. Listed by filename with a warning. Model commands skip with a warning. Don't crash.
- **Missing skills:** `skills: [nonexistent-skill]` — count it but add 0 characters. No warning.
- **Empty agents directory:** Already handled — shows "(none)".
- **No `.claude/agents/`:** Already handled — "Run `ana init` first."
- **`---` in body content:** Agent files use `---` as horizontal rules in markdown body. Frontmatter write MUST only modify within the first `---` pair. Parse-modify-serialize handles this.
- **YAML edge cases:** Current files use simple `key: value` on single lines. Quoted values (`description: "..."`) preserved by serialize step.
- **`ana agents model sonnet` (missing agent name):** Commander sees `sonnet` as agent arg with no model arg. Error: "Unknown agent 'sonnet'. Did you mean: `ana agents model --all sonnet`?"
- **Model validation:** Don't validate. `model: potato` is between the user and Claude Code.

## Rejected Approaches

- **Token counting:** chars/4 is not tokens. Characters are honest — it's what the file contains. Useful for relative comparison.
- **`--reset` flag:** `--default` says what happens (use default). `--reset` is ambiguous.
- **Frontmatter `name:` matching:** Filename matching is unambiguous, no collision risk.
- **Settings.json model detection:** Underspecified, no real-world use case proven. Cut from Phase 1.
- **Source labels ("(frontmatter)", "(settings.json)"):** Implementation detail leaking into UX. Silence for explicit settings, "(default)" for inherited.
- **Separate config file for model preferences:** Writing directly to the agent file is simpler — no new schema, no interpolation, no sync problem. The file that controls behavior IS the config.

## Open Questions

- Commander v14 parent-action + subcommand pattern: `ana agents` has a default action (list) AND a subcommand (`model`). AnaPlan should verify Commander supports this and design the registration shape.
- `listAgents()` currently returns void and logs directly. The `model` subcommand needs agent discovery too. AnaPlan should design how to refactor — likely extract an `getAgentInfoList()` data function that both display and model commands consume.

## Exploration Findings

### Patterns Discovered
- `agents.ts` lines 33-54: `parseFrontmatter` uses regex on first `---` block, returns null if any of name/model/description is missing. The model-required bug is on line 45.
- `agents.ts` lines 59-101: `listAgents` is a monolith — discovery, parsing, formatting, output all in one function. Needs decomposition for reuse.
- `agents.ts` lines 109-116: Registration is a simple `program.command('agents').action()`. Adding a subcommand changes this shape.

### Constraints Discovered
- [TYPE-VERIFIED] AgentInfo interface (agents.ts:21-25) — model is required string. Must become optional.
- [OBSERVED] parseFrontmatter returns null on missing model (agents.ts:45) — agents without model: in frontmatter are silently dropped from listing.
- [OBSERVED] listAgents uses process.exit(1) (agents.ts:66) — test for missing directory uses toThrow() because of this.

### Test Infrastructure
- `agents.test.ts`: Uses `createTestProject` helper + temp dir pattern. Tests are mostly "doesn't throw" — no output capture. New tests should verify actual output content.

## For AnaPlan

### Structural Analog
`agents.ts` itself is the analog — it's being rewritten in place. For the write utility pattern, look at any existing file in `src/utils/` that does parse-modify-write on a structured file.

### Relevant Code Paths
- `packages/cli/src/commands/agents.ts` — current implementation, 117 lines. Full rewrite of display, refactor of parsing.
- `packages/cli/tests/commands/agents.test.ts` — current tests, 144 lines. Expand significantly.
- `.claude/agents/*.md` — the files being read/written. Frontmatter structure is the contract.

### Patterns to Follow
- Command registration pattern from other commands in `src/commands/`
- Temp dir + `createTestProject` test pattern from `agents.test.ts`
- Utils module pattern from `src/utils/` for `agent-config.ts`

### Known Gotchas
- Agent `.md` files use `---` as horizontal rules in body content. The frontmatter parser/writer must scope to the FIRST `---` pair only.
- Commander parent-action + subcommand is the trickiest registration pattern — verify it works before building on it.
- `process.exit(1)` in `listAgents` makes unit testing awkward. Consider throwing instead.

### Things to Investigate
- Commander v14 parent command with default action + named subcommand — what's the registration API?
- How to decompose `listAgents` so agent discovery is reusable without breaking the existing test contract
