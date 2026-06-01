# Spec: Platform Setup Guide and Conditional Platform Content

**Created by:** AnaPlan
**Date:** 2026-06-01
**Scope:** .ana/plans/active/docs-readme-platform-update/scope.md

## Approach
Phase 2 adds the content that makes Codex selection useful instead of merely selectable. Create a focused Platform setup guide, link it from the Guides nav, and add paired platform-specific content only where Claude Code and Codex differ. This phase should not re-litigate the Phase 1 `ana run` migration; it builds on that foundation.

Use `website/content/docs/guides/configurability.mdx` as the structural analog for guide shape: frontmatter, compact sections, shell examples, callouts, and `NextCards`. Keep the new guide narrower than Configurability. It should answer "how do I configure Claude Code or Codex for Anatomia?" rather than covering every customization surface.

Use `ForPlatform` only for true differences:
- Claude Code permission modes and `platformFlags.claude`.
- Codex `.agent.toml` manifests, `developer_instructions`, `sandbox_mode`, and missing Learn support.
- Troubleshooting differences for missing executables, sandbox/manifest problems, and Learn fallback.

Every `ForPlatform platform="claude-code"` block must have a paired `ForPlatform platform="codex"` block for the same user need. Include platform names in natural prose inside the blocks so `llms-full.txt` remains readable after JSX stripping. Do not put `ForPlatform` inside fenced code blocks.

The Platform setup guide should document platform resolution in the order implemented by `packages/cli/src/commands/run.ts`: explicit `--platform`, `ANA_PLATFORM`, sole configured platform, then guidance when multiple are configured. It should document init platform resolution from `packages/cli/src/commands/init/index.ts`: `ana init --platforms`, then existing `ana.json`, then PATH auto-detection. It should also document that Codex Learn is not available yet and users should run Learn through Claude Code for now.

## Output Mockups
Guides nav order:

```json
{
  "title": "Guides",
  "pages": ["using-ana-setup", "platform-setup", "verifying-changes", "reading-a-proof", "using-ana-learn", "configurability", "troubleshooting"]
}
```

Platform setup guide command examples:

```bash
ana init --platforms claude,codex
ana run build --platform codex
ANA_PLATFORM=codex ana run verify
ana config set platformFlags.claude '["--dangerously-skip-permissions"]'
```

Codex manifest example:

```toml
model = "gpt-5.5"
sandbox_mode = "danger-full-access"
```

Conditional content shape:

```mdx
<ForPlatform platform="claude-code">
Claude Code users ...
</ForPlatform>

<ForPlatform platform="codex">
Codex users ...
</ForPlatform>
```

## File Changes

Filesystem check before writing: `website/content/docs/guides/platform-setup.mdx` does not exist and should be created. All other files below exist.

### website/content/docs/guides/platform-setup.mdx (create)
**What changes:** Add a new guide covering `ana run`, `ana init --platforms`, platform auto-detection, explicit `ana run --platform`, `ANA_PLATFORM`, `platformFlags`, Claude Code permission modes, Codex `.agent.toml` fields, Codex `danger-full-access`, switching platforms on an existing project, and current Codex Learn limitation.
**Pattern to follow:** `website/content/docs/guides/configurability.mdx` frontmatter and guide style.
**Why:** Codex users need one searchable setup page instead of scattered configuration notes.

### website/content/docs/guides/meta.json (modify)
**What changes:** Add `platform-setup` immediately after `using-ana-setup`.
**Pattern to follow:** Existing `pages` array.
**Why:** Platform setup belongs in onboarding before Verify/Learn operations.

### website/content/docs/start.mdx (modify)
**What changes:** Add concise paired platform content where prerequisites or dispatch behavior differs, but do not wrap the terminal mockup. Link to `/docs/guides/platform-setup` for details. Ensure Codex users see complete content after selecting Codex.
**Pattern to follow:** Existing callout style and `ForPlatform` block registration from docs renderer.
**Why:** Quickstart needs enough Codex-specific guidance to avoid empty or Claude-only prerequisites.

### website/content/docs/guides/configurability.mdx (modify)
**What changes:** Update custom skill examples to `.ana/skills/`. Update custom agent sections to explain platform-specific delivery: Claude Code custom agents under `.claude/agents/`, Codex agents under `.codex/agents/` with `.agent.toml` when needed. Keep detailed platform setup in the new guide.
**Pattern to follow:** Existing "Edit the files" and "Going further" sections.
**Why:** Configurability should stay broad while no longer teaching stale canonical paths.

### website/content/docs/guides/troubleshooting.mdx (modify)
**What changes:** Add Codex-specific recovery guidance for missing Codex executable, manifest/prompt issues, sandbox behavior, and current Learn unavailability. Update generic recovery commands to `ana run build` / `ana run verify` and skill paths to `.ana/skills/`. Use paired platform content where Claude Code and Codex differ.
**Pattern to follow:** Existing `TroubleCard` structure.
**Why:** Codex failures differ from Claude Code failures and need actionable recovery paths.

### website/content/docs/guides/using-ana-learn.mdx (modify)
**What changes:** Use `ana run learn` as the universal command, then state plainly that Codex Learn is not available yet and `ana run learn --platform codex` fails with a Claude Code fallback. Include the limitation near the start of the guide.
**Pattern to follow:** Existing terminal mockup and narrative.
**Why:** Learn docs must preserve universal syntax without implying full Codex parity.

### website/lib/__tests__/docs-platform-content.test.ts (modify)
**What changes:** Extend the Phase 1 enforcement test to cover the new guide, nav order, paired `ForPlatform` blocks, required platform setup topics, Learn limitation, and generated LLM/search assets.
**Pattern to follow:** Same file created in Phase 1.
**Why:** The new page and conditional content are the highest-risk drift points.

### website/public/search-index.json (modify)
**What changes:** Regenerate or verify current after adding the new guide and changing docs text.
**Pattern to follow:** Generated by `website/scripts/extract-docs-data.ts`.
**Why:** Search must include `/docs/guides/platform-setup`.

### website/public/llms.txt (modify)
**What changes:** Regenerate or verify current after adding the new guide.
**Pattern to follow:** Generated by `website/scripts/extract-docs-data.ts`.
**Why:** LLM docs index must include platform setup.

### website/public/llms-full.txt (modify)
**What changes:** Regenerate or verify current after adding the new guide and paired platform sections.
**Pattern to follow:** Generated by `website/scripts/extract-docs-data.ts`.
**Why:** Stripped platform content must remain readable for LLM consumers.

## Acceptance Criteria
- [ ] AC2: Selecting Codex in the docs switcher shows Codex-appropriate content anywhere `ForPlatform` is used.
- [ ] AC3: Every `ForPlatform platform="claude-code"` content block has a corresponding `ForPlatform platform="codex"` block for the same user need.
- [ ] AC4: `start.mdx` quickstart works for both Claude Code and Codex users, uses `ana run` commands, explains the `ana run` platform dispatch relationship once, and does not wrap the terminal mockup in `ForPlatform`.
- [ ] AC5: The `start.mdx` terminal mockup reflects current `ana init` output: canonical `.ana/skills/`, `ana run`, `ana run setup`, and current next-step language.
- [ ] AC11: New guide exists at `/docs/guides/platform-setup` and is linked from the Guides nav.
- [ ] AC12: The Platform setup guide covers `ana run`, `ana init --platforms`, platform auto-detection, explicit `ana run --platform`, `ANA_PLATFORM`, `platformFlags`, Claude Code permission modes, Codex `.agent.toml` fields, Codex `danger-full-access`, and switching platforms on an existing project.
- [ ] AC13: `configurability.mdx` custom skill and custom agent sections are updated for canonical `.ana/skills/` and platform-specific agent delivery where needed.
- [ ] AC14: `troubleshooting.mdx` includes Codex-specific recovery guidance where failures differ, including Codex not installed, sandbox/manifest issues, and the current Learn availability gap.
- [ ] AC17: Learn documentation is honest about current platform support: `ana run learn` is the universal command, but Codex Learn is not yet available and redirects users to Claude Code.
- [ ] AC19: Website build succeeds from `website/` with `pnpm run build`.
- [ ] AC20: Generated docs assets (`search-index.json`, `llms.txt`, `llms-full.txt`) are regenerated or verified current after the content changes.
- [ ] Tests pass with the website test command.
- [ ] Root test baseline still passes after all phases.

## Testing Strategy
- **Unit tests:** Extend `website/lib/__tests__/docs-platform-content.test.ts`. Add checks for nav order, required guide terms, paired `ForPlatform` counts, no `ForPlatform` wrapped terminal mockup in `start.mdx`, generated assets containing Platform setup, and generated LLM docs containing platform labels.
- **Integration tests:** Run `(cd 'website' && pnpm run build)`. This validates MDX, routes, internal links, `search-index.json`, `llms.txt`, `llms-full.txt`, and the new static docs route.
- **Edge cases:** Ensure stripped LLM output remains readable when both Claude and Codex variants appear. Ensure `using-ana-learn` does not imply Codex Learn support. Ensure Configurability does not absorb the full platform setup guide.

## Dependencies
- Phase 1 must complete first so this phase can assume `ana run` syntax is already the public default.
- `ForPlatform` is already registered for MDX in `website/app/docs/[...slug]/page.tsx`; no renderer change is expected.
- CLI platform behavior is already implemented in `packages/cli/src/commands/run.ts` and `packages/cli/src/commands/init/index.ts`.

## Constraints
- Do not modify reference page path rendering solely for platform conditionality.
- Do not add unsupported platforms beyond disabled switcher entries.
- Do not claim Codex Learn parity.
- Keep the new platform setup guide focused; broad customization remains in Configurability.
- Platform-specific code examples must be separate fenced blocks wrapped by `ForPlatform`, not `ForPlatform` inside fences.

## Gotchas
- `ForPlatform` is a client component and defaults to Claude Code on SSR through the provider. This is okay, but Codex blocks must be complete when selected.
- `stripJsx` removes JSX tags but preserves block children. Both platform variants may appear in `llms-full.txt`; label them in prose.
- Codex dispatch reads `.codex/agents/{agent}.agent.toml` and prompt markdown. Missing manifest falls back for model/sandbox, but missing prompt file exits.
- `ana run learn --platform codex` exits with an error and prints a Claude Code fallback.
- `ana init --platforms` takes comma-separated CLI platform IDs (`claude,codex`), while docs switcher uses UI IDs (`claude-code`, `codex`). Do not mix those identifiers.

## Build Brief

### Rules That Apply
- Use paired `ForPlatform` blocks for every platform-specific user need.
- Do not place `ForPlatform` inside fenced code blocks.
- Keep natural platform labels inside conditional content so stripped LLM docs are readable.
- Use exact CLI platform IDs in command examples: `claude` and `codex`.
- Test behavior via content invariants for docs; do not add a heavy browser test unless needed.
- In JSX text content, use `&apos;` for apostrophes.

### Pattern Extracts
`website/components/docs/content/ForPlatform.tsx:7`

```tsx
interface ForPlatformProps {
  platform: Platform;
  children: ReactNode;
}

export function ForPlatform({ platform, children }: ForPlatformProps) {
  const { platform: active } = usePlatform();
  if (active !== platform) return null;
  return <>{children}</>;
}
```

`website/content/docs/guides/configurability.mdx:1`

```mdx
---
title: Configurability
description: "Everything ships as files in your repo — markdown agents, markdown skills, JSON config. Change what you need, from CLI commands to source-level edits. The parts that make verification work are fixed by design."
readingTime: 8
---

## CLI-supported settings

Settings the CLI manages for you. Change them with commands or `ana.json` edits — both survive `ana init`.
```

`packages/cli/src/commands/run.ts:83`

```ts
 * Resolution chain: --platform flag → ANA_PLATFORM env → sole platform
 * in ana.json → error with guidance.
 *
 * @param projectRoot - Project root directory
 * @param platformFlag - Explicit --platform flag value (may be undefined)
 * @returns Resolved platform name ('claude' or 'codex')
 */
export function resolvePlatform(projectRoot: string, platformFlag: string | undefined): string {
```

### Proof Context
- `website/content/docs/guides/using-ana-setup.mdx`: Prior link and apostrophe concerns; relevant if adding new JSX text or links.
- `website/content/docs/concepts/pipeline.mdx`: Existing diagram concern, but Phase 2 should not touch the diagram.
- `website/lib/copy.ts`: Existing landing stale-link concerns from proof context; Phase 2 should not edit landing copy unless Phase 1 left it incomplete.
- No active proof findings for `platform-setup.mdx`, `meta.json`, `troubleshooting.mdx`, `using-ana-learn.mdx`, generated assets, or the platform components.

### Checkpoint Commands
- After creating the guide and nav entry: `(cd 'website' && pnpm vitest run lib/__tests__/docs-platform-content.test.ts)` — Expected: 15 tests pass.
- After all Phase 2 content: `(cd 'website' && pnpm run build)` — Expected: MDX compiles, internal links validate, generated docs assets update, and docs route list includes `/docs/guides/platform-setup`.
- Lint: `(cd 'website' && pnpm run lint)`
- Final baseline after all phases: `pnpm run test -- --run` — Expected: 3182 passing tests and 2 skipped tests in 140 files.

### Build Baseline
- Current tests: 3167 passed, 2 skipped
- Current test files: 139 passed
- Command used: `pnpm run test -- --run`
- Website baseline: 68 tests in 10 files
- After build: expected 3182 passing tests, 2 skipped, in 140 files
- Regression focus: MDX compilation, Guides nav route generation, `ForPlatform` pairing, stripped LLM docs readability, generated search index
