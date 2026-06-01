# Scope: Learn Agent Codex Adaptation

**Created by:** Ana
**Date:** 2026-06-01

## Intent

Learn is the only pipeline agent without Codex support. A Codex-only team cannot tend their proof chain — findings accumulate unchecked, patterns never become rules, quality doesn't compound. The user wants to close this gap by creating a Codex Learn template, removing the hard block in `dispatchToCodex`, and updating constants, tests, dogfood, and docs.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — 533-line template adaptation with 9 modification sites, 2 source file changes (trivial), TOML boilerplate, 5 test updates across 3 files, 3 docs files with ForPlatform pairing constraints
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/run.ts` — remove hard block (5 lines)
  - `packages/cli/src/constants.ts` — add `'ana-learn.md'` to `CODEX_AGENT_FILES`
  - `packages/cli/templates/.codex/agents/ana-learn.md` — new (adapted from CC template)
  - `packages/cli/templates/.codex/agents/ana-learn.agent.toml` — new
  - `packages/cli/templates/.claude/agents/ana-learn.md` — update `.claude/skills/` → `.ana/skills/` (3 locations)
  - `.codex/agents/ana-learn.md` — new (dogfood)
  - `.codex/agents/ana-learn.agent.toml` — new (dogfood)
  - `packages/cli/tests/commands/run.test.ts` — update/replace 2 tests
  - `packages/cli/tests/commands/init.test.ts` — update 1 test
  - `website/lib/__tests__/docs-platform-content.test.ts` — update 2 test assertions
  - `website/content/docs/guides/platform-setup.mdx` — replace ForPlatform pair
  - `website/content/docs/guides/using-ana-learn.mdx` — update 3 locations + ForPlatform pair
  - `website/content/docs/guides/troubleshooting.mdx` — remove ForPlatform pair
- **Blast radius:** The `ForPlatform` pairing test (`docs-platform-content.test.ts:170`) enforces that Claude Code and Codex blocks come in adjacent pairs. Removing a Codex block without handling its Claude Code pair breaks CI. All 3 docs files have paired blocks that need simultaneous handling.
- **Estimated effort:** 2-3 hours
- **Multi-phase:** no

## Approach

Create a Codex-specific Learn template adapted from the CC original — stripping frontmatter, correcting skill paths, and rewriting the 6 diagnostic references to describe Codex's skill delivery mechanism instead of CC's frontmatter-based loading. Wire it into the dispatch path by removing the hard block and adding Learn to the Codex agent file list. Update 5 existing tests that assert the limitation, update 3 docs files that disclose it, and refresh the CC template's stale `.claude/skills/` paths to `.ana/skills/`.

The diagnostic language replacement is the design work. On CC, Learn says "check Plan's `skills:` frontmatter list." On Codex, skill content is baked into the agent prompt file at init time — there's no structured list to check. The Codex template should say "check whether the skill's rules appear in Plan's prompt file at `.codex/agents/ana-plan.md`" — this is mechanically equivalent and actionable. The template should also note that promoted rules take effect after the next `ana init`, since Codex skill loading isn't dynamic.

## Acceptance Criteria
- AC1: `ana run learn --platform codex` dispatches to Codex successfully (no error exit)
- AC2: `ana init --platforms codex` generates `.codex/agents/ana-learn.md` and `.codex/agents/ana-learn.agent.toml`
- AC3: The Codex Learn template contains zero `.claude/skills/` path references — all use `.ana/skills/`
- AC4: The Codex Learn template contains zero `skills:` frontmatter references — all 6 locations use Codex-appropriate diagnostic language referencing prompt files
- AC5: The Codex Learn template has no YAML frontmatter block
- AC6: The CC Learn template's 3 `.claude/skills/` references are updated to `.ana/skills/`
- AC7: `CODEX_AGENT_FILES` includes `'ana-learn.md'` (6 entries total)
- AC8: The hard block in `dispatchToCodex` (`if agentSuffix === 'learn'`) is removed
- AC9: All existing tests pass — the 5 tests asserting the Learn-Codex limitation are updated or replaced
- AC10: Dogfood `.codex/agents/` contains `ana-learn.md` and `ana-learn.agent.toml` matching product templates
- AC11: Docs no longer contain "Codex Learn is not yet available" or equivalent limitation language
- AC12: `ForPlatform` pairing test continues to pass — no orphaned platform blocks

## Edge Cases & Risks

- **ForPlatform pairing constraint.** Three docs files have paired Claude Code / Codex blocks about Learn. Some pairs can be collapsed into a single unpaired statement (both platforms now behave the same). Others may need updated paired content if there's still a meaningful platform difference to describe. The builder must check the pairing test after each docs change.
- **Terminal example in using-ana-learn.mdx.** The mock terminal output at line 22 includes "Codex Learn is not yet available; use Claude Code for Learn sessions" as part of the rendered `ana run learn` output. This line must be removed from the example — it's embedded in a JSX `<pre>` block, not a ForPlatform wrapper.
- **Prose at using-ana-learn.mdx line 26.** Contains "Codex Learn is not yet available; `ana run learn` routes supported Learn sessions through Claude Code." This is inline prose, not a ForPlatform block — needs a rewrite, not a deletion.
- **Promoted rules don't auto-load on Codex.** On CC, promoted skill rules reach Plan on next run via frontmatter loading. On Codex, skill content is baked into the prompt at init time. The Codex template should note this: "Promoted rules take effect after the next `ana init`." This isn't a blocker — it's a documentation-level difference in the template's diagnostic guidance.
- **Model selection in TOML.** The CC template uses `model: opus[1m]`. Learn's diagnostic reasoning is the most complex of any agent — a weak model will batch-close instead of evaluating. The TOML should use `gpt-5.5` (matching other Codex agents).
- **Contract assertion `@ana` tags.** Tests at `run.test.ts:353` and `run.test.ts:429` carry `@ana A035` and `@ana A040` tags from the codex-support contract. These assertions validated the limitation that's being removed. The tags should be removed or retagged to new assertions.

## Rejected Approaches

**Keep the Learn template identical across platforms (strip frontmatter only).** This is how Verify was adapted — the templates are identical except for frontmatter. But Learn has 6 references to the `skills:` frontmatter mechanism that are CC-specific. Copying them verbatim would give Codex Learn incorrect diagnostic guidance — it would tell the agent to "check Plan's `skills:` frontmatter list" when no such list exists on Codex. Wrong reasoning is worse than no template. This is why the original codex-support scope deferred Learn.

**Platform-neutral diagnostic language ("check the platform's skill loading mechanism").** Accurate but vague — doesn't help Learn debug. Learn's value is in precise diagnostics. "Check Plan's prompt file" is actionable. "Check the loading mechanism" is not.

**Ship the path corrections (`.claude/skills/` → `.ana/skills/`) separately.** Could be independent, but it's the same 3 locations in the same file being adapted. Bundling avoids touching the file twice and keeps the CC and Codex templates synchronized.

## Open Questions

- The `using-ana-learn.mdx` example terminal output at line 22 is a complex JSX block with inline styles. Should the builder rewrite the entire terminal example to remove the limitation line, or is there a simpler edit? AnaPlan should look at the JSX structure.

## Exploration Findings

### Patterns Discovered
- `templates/.codex/agents/ana-verify.md`: Codex adaptation pattern is frontmatter-strip only — body identical to CC version. Learn requires more work because it has platform-specific diagnostic content.
- `templates/.codex/agents/ana-build.agent.toml`: TOML manifest pattern — name, description, model, developer_instructions, sandbox_mode, model_reasoning_effort fields.
- `run.ts:159-218`: `dispatchToCodex` is fully generic after the Learn guard clause — reads TOML, reads prompt, spawns Codex. No other agent-specific gates.

### Constraints Discovered
- [TYPE-VERIFIED] ForPlatform pairing (`docs-platform-content.test.ts:170`) — test enforces Claude Code and Codex blocks appear in adjacent pairs across all .mdx docs files
- [TYPE-VERIFIED] CODEX_AGENT_FILES iteration (`assets.ts:613`) — `copyCodexAgentFiles` iterates this array to copy both `.md` and `.agent.toml` files during init. Adding to the array is sufficient.
- [OBSERVED] Skill loading divergence — CC loads skills via frontmatter `skills:` field; Codex bakes skill content into the prompt blob passed via `-c developer_instructions=`. Promoted rules require `ana init` to reach Codex agents.

### Test Infrastructure
- `run.test.ts`: Uses `createCodexProject()` helper, `mockedSpawnSync`, `runAndGetExit()`. Tests at lines 354 and 430 assert the limitation being removed.
- `init.test.ts`: Tests `CODEX_AGENT_FILES` array directly (length and contents). Line 793.
- `docs-platform-content.test.ts`: Uses `readRepoFile()` helper. Tests assert exact strings in docs content.

## For AnaPlan

### Structural Analog
`packages/cli/templates/.codex/agents/ana-verify.md` — the most recently adapted Codex template. Shows the minimal adaptation pattern (frontmatter strip only). Learn requires the same plus diagnostic language rewrites.

### Relevant Code Paths
- `packages/cli/templates/.claude/agents/ana-learn.md` — full 533-line source document
- `packages/cli/src/commands/run.ts:159-218` — `dispatchToCodex` function with hard block at 165-170
- `packages/cli/src/constants.ts:171-178` — `CODEX_AGENT_FILES` array
- `packages/cli/src/commands/init/assets.ts:612-630` — `copyCodexAgentFiles` iterates `CODEX_AGENT_FILES`
- `packages/cli/tests/commands/run.test.ts:354-361, 430-437` — Learn limitation tests
- `packages/cli/tests/commands/init.test.ts:793-796` — CODEX_AGENT_FILES count test
- `website/lib/__tests__/docs-platform-content.test.ts:164, 201` — docs content assertions
- `website/content/docs/guides/using-ana-learn.mdx:9-15, 22, 26` — three limitation locations

### Patterns to Follow
- `packages/cli/templates/.codex/agents/ana-build.agent.toml` — TOML manifest format
- `packages/cli/templates/.codex/agents/ana-verify.md` — adaptation pattern (frontmatter strip + body)

### Known Gotchas
- The `ForPlatform` pairing test will fail if you remove a Codex block without also removing or updating its Claude Code pair. Process each paired block together.
- `using-ana-learn.mdx` line 22 is a JSX `<pre>` block with complex inline styles. The limitation message is embedded in the template string content, not a separate element. Careful editing required.
- The `createCodexProject()` helper in `run.test.ts` creates agent files based on what's in the test fixture, not what's in `CODEX_AGENT_FILES`. Adding Learn to the helper setup may be needed for the new dispatch test.

### Things to Investigate
- How should the ForPlatform blocks in `platform-setup.mdx` lines 127-133 and `troubleshooting.mdx` lines 103-109 be handled? Options: (a) collapse both blocks into a single unpaired statement since there's no longer a platform difference, (b) keep paired blocks with both saying "all stages supported." The pairing test constrains this — investigate which option preserves test compliance with the least churn.
- The terminal example in `using-ana-learn.mdx` line 22 — what's the cleanest edit to remove just the limitation line without breaking the JSX structure?
