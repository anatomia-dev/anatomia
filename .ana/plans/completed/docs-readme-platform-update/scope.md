# Scope: Docs, Website, and README Multi-Platform Update

**Created by:** Ana
**Date:** 2026-05-31

## Intent
Update the public documentation, website copy, and README for the 1.2.0 multi-platform release. Anatomia now works with Claude Code and Codex through the universal `ana run` command, but user-facing content still teaches a Claude-only model with `claude --agent` commands and Claude-exclusive positioning.

This is the final documentation gate before the 1.2.0 version bump. The docs must match the CLI that already shipped: `ana run`, `platforms`, `platformFlags`, Codex `.agent.toml` manifests, Codex agent delivery, and canonical `.ana/skills/`.

## Complexity Assessment
- **Kind:** feature
- **Size:** large — broad editorial and website update across README, landing copy, docs navigation, 12+ MDX pages, one new guide page, and conditional platform content
- **Surface:** website
- **Files affected:**
  - `README.md`
  - `website/content/docs/start.mdx`
  - `website/content/docs/guides/platform-setup.mdx` (new)
  - `website/content/docs/guides/meta.json`
  - `website/content/docs/guides/configurability.mdx`
  - `website/content/docs/guides/troubleshooting.mdx`
  - `website/content/docs/guides/verifying-changes.mdx`
  - `website/content/docs/guides/using-ana-setup.mdx`
  - `website/content/docs/guides/using-ana-learn.mdx`
  - `website/content/docs/guides/reading-a-proof.mdx`
  - `website/content/docs/concepts/context.mdx`
  - `website/content/docs/concepts/findings.mdx`
  - `website/content/docs/concepts/pipeline.mdx`
  - `website/content/docs/concepts/toolbelt.mdx`
  - `website/content/docs/concepts/skills.mdx`
  - `website/components/docs/layout/PlatformSwitcher.tsx`
  - `website/components/docs/content/ForPlatform.tsx`
  - `website/components/docs/content/AudienceCards.tsx`
  - `website/lib/copy.ts`
  - Generated website assets under `website/public/` if the build regenerates `search-index.json`, `llms.txt`, or `llms-full.txt`
- **Blast radius:** User-facing docs and marketing copy. The PlatformSwitcher change affects all docs pages. `ForPlatform` content affects SSR/client-rendered docs behavior and stripped LLM docs output. Generated static assets can change broadly because content text changes.
- **Estimated effort:** 1-2 days across two specs: mechanical migration first, then new content and conditional platform sections
- **Multi-phase:** yes — two specs

## Approach
Make `ana run` the public command surface everywhere. Explain the relationship between `ana run` and platform-specific agent invocation once in the quickstart, then avoid dual syntax elsewhere. This is the foundation: users learn one command that works across configured platforms, while the implementation detail remains behind the CLI.

Use platform-specific rendering only where the user experience genuinely differs. `ForPlatform` should appear in a small number of paired Claude Code and Codex blocks, not as a wrapper around every command. The Codex path needs real content wherever the Claude Code path has conditional content, or Codex users will see empty gaps.

Create a focused Platform setup guide instead of expanding Configurability. The guide should cover `ana run`, `ana init --platforms`, platform auto-detection, `platformFlags`, Claude Code permission modes, Codex `.agent.toml` manifests, Codex sandbox behavior, and switching configured platforms on an existing project. Configurability should stay focused on broad customization and only update its custom-agent sections where platform delivery actually differs.

Keep reference page source paths as-is. The reference pages show real template/source paths and symlink-compatible paths; adding platform-conditional path rendering there would add noise without solving a user problem.

This scope is intentionally split into two implementation specs:

**Spec 1 — Mechanical migration and positioning.** Replace user-facing `claude --agent` commands with `ana run` equivalents across docs and README, rewrite Claude-exclusive prose, enable Codex in the PlatformSwitcher, update landing and audience copy, fix `verifying-changes.mdx` frontmatter, and keep npm package metadata out of scope because it is already done.

**Spec 2 — New content and platform-specific experience.** Add `/docs/guides/platform-setup`, add paired `ForPlatform` blocks in the few places where Claude Code and Codex differ, update the quickstart terminal mockup to match current `ana init` output, and verify generated docs assets.

## Acceptance Criteria
- AC1: PlatformSwitcher shows Codex as selectable and no longer marks Codex as disabled or "soon"; Cursor, Copilot, Windsurf, and Cline remain disabled.
- AC2: Selecting Codex in the docs switcher shows Codex-appropriate content anywhere `ForPlatform` is used.
- AC3: Every `ForPlatform platform="claude-code"` content block has a corresponding `ForPlatform platform="codex"` block for the same user need.
- AC4: `start.mdx` quickstart works for both Claude Code and Codex users, uses `ana run` commands, explains the `ana run` platform dispatch relationship once, and does not wrap the terminal mockup in `ForPlatform`.
- AC5: The `start.mdx` terminal mockup reflects current `ana init` output: canonical `.ana/skills/`, `ana run`, `ana run setup`, and current next-step language.
- AC6: User-facing MDX prose and code examples no longer instruct users to run `claude --agent ...`; they use `ana run ...` unless intentionally discussing platform internals.
- AC7: README no longer claims Claude Code exclusivity and opens with the locked product positioning: "Anatomia is a CLI that runs every code change through a five-agent pipeline — scope, spec, contract, build, and independent verification. It works with Claude Code and Codex."
- AC8: README quickstart uses `ana run setup` and `ana run`, and the "Works with" section states Claude Code and Codex support while preserving the broader markdown-aware tool claim.
- AC9: Landing page copy includes Codex in native pipeline support, and homepage tree diagrams stop presenting `.claude/skills/` as the canonical skill location.
- AC10: `AudienceCards` no longer says installation requires Claude Code only.
- AC11: New guide exists at `/docs/guides/platform-setup` and is linked from the Guides nav.
- AC12: The Platform setup guide covers `ana run`, `ana init --platforms`, platform auto-detection, explicit `ana run --platform`, `ANA_PLATFORM`, `platformFlags`, Claude Code permission modes, Codex `.agent.toml` fields, Codex `danger-full-access`, and switching platforms on an existing project.
- AC13: `configurability.mdx` custom skill and custom agent sections are updated for canonical `.ana/skills/` and platform-specific agent delivery where needed.
- AC14: `troubleshooting.mdx` includes Codex-specific recovery guidance where failures differ, including Codex not installed, sandbox/manifest issues, and the current Learn availability gap.
- AC15: `verifying-changes.mdx` frontmatter description and examples use `ana run verify` / `ana run build`.
- AC16: Concept page prose is platform-neutral in `pipeline.mdx`, `toolbelt.mdx`, and `skills.mdx`.
- AC17: Learn documentation is honest about current platform support: `ana run learn` is the universal command, but Codex Learn is not yet available and redirects users to Claude Code.
- AC18: Reference page path displays and GitHub URLs are not changed solely for platform conditionality.
- AC19: Website build succeeds from `website/` with `pnpm run build`.
- AC20: Generated docs assets (`search-index.json`, `llms.txt`, `llms-full.txt`) are regenerated or verified current after the content changes.

## Edge Cases & Risks
`ForPlatform` cannot be placed inside fenced code blocks. MDX compiles fenced blocks before JSX resolves. Platform-specific code examples must be separate fenced blocks, each wrapped in its own `ForPlatform`, with spacing that keeps MDX valid.

`ForPlatform` renders Claude Code by default on the server. Search engines and first-load SSR see Claude Code content. This is acceptable because Claude Code remains the default, but Codex users must get complete replacement content after switching.

The stripped LLM docs output removes JSX tags and may concatenate both platform variants. Platform-specific sections should label the platform in natural prose so `llms-full.txt` remains readable after stripping.

Codex Learn is deferred. Docs that blindly say `ana run learn` works the same on both platforms would be inaccurate. The scope should preserve universal command syntax while explicitly documenting the current Codex limitation where Learn is discussed.

The quickstart terminal mockup is complex inline JSX. It should be updated in place to show universal output, not refactored into a component unless the planner finds an established local pattern that makes the edit safer.

README should not become a configuration tutorial. It should position the product, show the quickstart, and point to docs for platform setup. The detailed platform configuration belongs in the new guide.

`packages/cli/package.json` keywords and description are already updated with `codex`, `openai`, and five-agent copy. Do not include package metadata edits in this scope.

Landing copy has existing proof-chain findings about stale accuracy. Verify the rendered landing copy and links, not just string replacements.

## Rejected Approaches
**Conditional syntax everywhere.** Rejected because it teaches platform internals instead of the stable product abstraction. `ana run` is the foundation; `ForPlatform` is for actual experience differences only.

**Adding a Multi-Platform concept page.** Rejected because platform support is configuration and delivery, not a methodology concept. The concept pages should explain the pipeline, skills, context, artifacts, contracts, findings, and toolbelt.

**Expanding Configurability with a large Platforms section.** Rejected because the page is already dense and covers broader customization. Codex users need a focused landing page for "how do I set up my platform?"

**Changing reference page paths to be platform-conditional.** Rejected because the current `.claude/` template paths and symlinked skill paths remain factual and usable. Conditional path rendering in server components would add complexity without improving the user journey.

**Including Cursor, Copilot, Windsurf, or Cline.** Rejected for this release. They stay disabled in the switcher until their delivery path exists.

**Updating ARCHITECTURE.md, CONTRIBUTING.md, or extract-docs-data.ts.** Rejected because those files describe factual repo internals or source extraction paths and are not part of the user-facing multi-platform docs gap.

**Adding the changelog entry here.** Rejected because changelog belongs to the version bump, not this docs scope.

## Open Questions
- Where exactly should `platform-setup` appear in the Guides nav order: near Quickstart/Setup or near Configurability?
- Should the Learn availability note live only in `using-ana-learn`, or also in the new Platform setup guide's Codex section?
- Should the landing page tree diagram for agents stay platform-neutral (`agent files`) or show `.claude/agents/` plus `.codex/agents/` as a compact paired representation?

## Exploration Findings

### Patterns Discovered
- `website/app/docs/[...slug]/page.tsx`: MDX component registration already includes `ForPlatform`, so content can use it without renderer changes.
- `website/components/docs/providers/PlatformProvider.tsx:18`: Platform type already includes `codex`; cookie state defaults to `claude-code`.
- `website/components/docs/content/ForPlatform.tsx:12`: Client component returns children only when the active platform matches.
- `website/components/docs/layout/PlatformSwitcher.tsx:14`: Switcher already lists Codex; only the disabled state blocks selection.
- `packages/cli/src/commands/platform.ts:66`: `agentCommand()` generates the universal user-facing syntax (`ana run`, `ana run build`, etc.).
- `packages/cli/src/commands/init/state.ts:981`: Current init output prints `Skills → .ana/skills/`.
- `packages/cli/src/commands/init/state.ts:1073`: Current init output prints `ana run`, `ana run setup`, and `ana init commit` as next steps.
- `packages/cli/src/commands/run.ts:165`: Codex Learn is explicitly unavailable and prints a Claude Code fallback.
- `packages/cli/package.json:18`: `codex` and `openai` keywords are already present.

### Constraints Discovered
- [TYPE-VERIFIED] `ForPlatform` accepts `Platform` values from the provider, including `claude-code` and `codex`.
- [TYPE-VERIFIED] `ana run` resolves platform by explicit `--platform`, `ANA_PLATFORM`, sole configured platform, or errors with guidance when multiple platforms are configured.
- [TYPE-VERIFIED] Codex dispatch reads `.codex/agents/{agent}.agent.toml`, passes `developer_instructions` through `-c`, and uses `sandbox_mode` default `danger-full-access`.
- [OBSERVED] Requirements and release notes agree that package metadata is already updated; scope should not edit it.
- [OBSERVED] `rg` currently finds user-facing `claude --agent` references in README and 10+ docs pages, including JSX terminal mockups.
- [OBSERVED] `website/content/docs/guides/meta.json` currently lists six guide pages and needs the new guide added.
- [INFERRED] The quickstart is the highest-risk page because it is the first Codex user journey and contains both prerequisite copy and inline terminal JSX.

### Test Infrastructure
- `website/package.json` provides `pnpm run build`, which runs `prebuild` and validates MDX compilation, data extraction, generated docs data, and Next.js build.
- Existing generated docs assets are produced during website build or prebuild; Plan/Build should verify whether content changes update `website/public/search-index.json`, `website/public/llms.txt`, and `website/public/llms-full.txt`.
- No dedicated component tests were found for `PlatformSwitcher` or `ForPlatform`; verification should include at least build-time checks and a rendered/manual or automated smoke check for switching to Codex on a page with paired `ForPlatform` content.

## For AnaPlan

### Structural Analog
`website/content/docs/guides/configurability.mdx` is the structural analog for the new Platform setup guide: frontmatter, guide prose, code examples, callouts, and NextCards. It is also the functional analog for platform configuration, but the new guide should be narrower and more searchable.

For mechanical command migration, `packages/cli/src/commands/platform.ts` and the existing migrated CLI templates are the functional source of truth: docs should mirror `agentCommand()` output (`ana run`, `ana run setup`, `ana run plan`, `ana run build`, `ana run verify`, `ana run learn`).

For platform-specific rendering, `website/components/docs/content/ForPlatform.tsx` plus `website/components/docs/providers/PlatformProvider.tsx` are the structural analogs. They define the exact platform IDs and rendering behavior.

### Relevant Code Paths
- `README.md` — primary repo positioning, quickstart, Works with section, uninstall notes
- `website/content/docs/start.mdx` — quickstart, prerequisites, terminal mockup, first pipeline instructions
- `website/content/docs/guides/configurability.mdx` — canonical customization guide; update skill paths and custom agent section, but do not turn it into the platform guide
- `website/content/docs/guides/troubleshooting.mdx` — recovery guidance; add Codex-specific differences through paired platform content where needed
- `website/content/docs/guides/verifying-changes.mdx` — frontmatter and Verify examples
- `website/content/docs/guides/using-ana-setup.mdx` — setup examples and rerun command
- `website/content/docs/guides/using-ana-learn.mdx` — Learn examples and current Codex limitation
- `website/content/docs/guides/reading-a-proof.mdx` — Learn triage command
- `website/content/docs/concepts/context.mdx` — setup command and infrastructure file list
- `website/content/docs/concepts/findings.mdx` — Learn command
- `website/content/docs/concepts/pipeline.mdx` — session independence prose
- `website/content/docs/concepts/toolbelt.mdx` — baseline tool prose
- `website/content/docs/concepts/skills.mdx` — skills intro, setup command, canonical skill path
- `website/components/docs/layout/PlatformSwitcher.tsx` — enable Codex only
- `website/components/docs/content/AudienceCards.tsx` — update install requirement copy
- `website/lib/copy.ts` — landing page tree diagrams and compatibility claim
- `packages/cli/src/commands/run.ts` — source of truth for platform dispatch and Codex Learn limitation
- `packages/cli/src/commands/init/state.ts` — source of truth for current init terminal output
- `packages/cli/src/commands/platform.ts` — source of truth for user-facing agent commands and canonical skill dir

### Patterns to Follow
- Use `ana run` everywhere for normal pipeline invocation.
- Use one explanatory quickstart callout for the dispatch relationship: `ana run` invokes Claude Code agents on Claude projects and opens Codex with the generated agent instructions on Codex projects.
- Use paired `ForPlatform` blocks with platform labels in prose when the experience differs.
- Keep code blocks outside JSX conditionals unless the whole fenced block is wrapped by `ForPlatform`.
- Keep product identity first and platform support second in README and landing copy.
- Keep reference paths factual rather than platform-personalized.

### Known Gotchas
- `ForPlatform` inside fenced code blocks will not work.
- Codex users will see empty sections if any Claude Code conditional block lacks a Codex counterpart.
- `ana run learn` is currently not implemented for Codex; docs need to avoid implying full parity for Learn.
- The docs default platform is Claude Code on SSR, so platform-specific content must still read cleanly when stripped into LLM text.
- The quickstart mockup should match CLI output, not an imagined docs-only ideal.
- README copy should be concise; the detailed platform setup belongs in the new guide.
- Do not change `packages/cli/package.json` metadata in this scope.
- Do not change dynamic reference page `.claude/` source paths for platform reasons.

### Things to Investigate
- Exact guide nav placement for `platform-setup`.
- Whether `llms.txt` and `llms-full.txt` are regenerated automatically by `website` build or require a separate command.
- Best compact presentation for landing page agent tree paths: platform-neutral label vs paired `.claude/agents/` and `.codex/agents/`.
- Whether a minimal rendered smoke check should be added or scripted to verify the Codex switcher state on at least the quickstart and platform setup guide.
