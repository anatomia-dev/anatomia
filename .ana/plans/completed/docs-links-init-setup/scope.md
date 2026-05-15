# Scope: Documentation links in init and setup

**Created by:** Ana
**Date:** 2026-05-14

## Intent

Users complete init and setup without knowing the documentation exists. The docs site has a quickstart guide, a detailed setup walkthrough, and Anatomia's own design principles as a working example — content that directly helps at the moments users encounter it. The CLI and agent template should surface these URLs at the right moments: orientation points where users are deciding what to do, not flow moments where they're in the middle of doing something.

The user also wants `www.anatomia.dev` to redirect to `anatomia.dev` so URLs work regardless of whether someone adds www. This is a Vercel domain configuration, not a code change.

## Complexity Assessment
- **Kind:** feature
- **Size:** small — 5 files changed, each with 1-3 lines added
- **Files affected:**
  - `packages/cli/src/commands/init/state.ts` (displaySuccessMessage)
  - `packages/cli/src/commands/setup.ts` (bare command action)
  - `packages/cli/src/constants.ts` (new URL constants)
  - `packages/cli/templates/.claude/agents/ana-setup.md` (Step 6 framing)
  - `website/content/docs/guides/using-ana-setup.mdx` (design principles subsection)
- **Blast radius:** Low. CLI output changes are additive — one `console.log` line each. Agent template change is a URL in an existing text block. Docs page change is a small linked element in an existing section. No behavioral changes, no new dependencies.
- **Estimated effort:** 1-2 hours including tests
- **Multi-phase:** no

## Approach

Add documentation URLs at three user-facing moments — init success, `ana setup` bare command, and the setup agent's design principles phase — plus a linked element on the docs page's design principles section pointing to Anatomia's own principles as a reference example.

Centralize the two CLI output URLs (init success, `ana setup` bare command) as named constants in one file. The agent template URL and docs page URL are hardcoded strings by necessity — templates and MDX files can't read from constants. All four URLs are stable contracts: the website must redirect if pages ever move. Constants keep the CLI side maintainable (one place to update); website redirects cover all four surfaces including old CLI versions and previously-copied templates.

Use full `https://` URLs everywhere. No OSC 8 terminal hyperlinks, no shorthand — plain URLs that every modern terminal auto-links. Zero new rendering dependencies.

## Acceptance Criteria
- AC1: `ana init` success output ends with `Quickstart  https://anatomia.dev/docs/start` after the existing "Next:" block
- AC2: `ana setup` (bare command, no subcommand) output includes `Guide  https://anatomia.dev/docs/guides/using-ana-setup` between the agent command and the subcommands list
- AC3: The `ana-setup.md` agent template includes `https://anatomia.dev/docs/guides/using-ana-setup#design-principles` in the Step 6 design principles framing block
- AC4: The `using-ana-setup.mdx` docs page includes a linked element in the design principles subsection (§4) pointing to `https://anatomia.dev/docs/reference/context#design-principles` with text like "See our design principles"
- AC5: All documentation URLs used in CLI output are defined as named constants in a single location (constants.ts or a dedicated module), not as inline string literals
- AC6: Existing init and setup tests continue to pass
- AC7 (human): `www.anatomia.dev` redirects to `anatomia.dev` — configured in Vercel domain settings, not a code change

## Edge Cases & Risks

**URL stability after CLI publish.** Once a CLI version ships to npm, its URLs are baked in. If the docs site restructures, old CLI versions link to 404s. Mitigation: centralized constants make URLs easy to update in new releases, and the website must maintain redirects for any moved pages. The specific paths (`/docs/start`, `/docs/guides/using-ana-setup`, `/docs/reference/context`) should be treated as stable contracts.

**Anchor fragility.** The `#design-principles` anchor on the reference page is derived from the filename `design-principles.md` via `f.name.replace(/\./g, "-")`. It would only break if that context file were renamed. Anchors can't redirect — but this anchor is structurally stable.

**Agent template URL reproduction.** The setup agent reads the template and presents its version of scripted blocks. URLs in scripted ``` blocks are typically reproduced verbatim, but agent behavior isn't perfectly deterministic. The URL could theoretically be rephrased or omitted. Acceptable risk — the inline examples still work without the link.

**Re-init shows quickstart link to returning users.** The init success message doesn't distinguish first-init from re-init. Returning users see the quickstart link again. This is harmless — they'll skip past it. Adding conditional logic isn't worth the complexity.

**Terminal auto-linking.** Full `https://` URLs are auto-linked by iTerm2, Ghostty, Kitty, VS Code terminal, Windows Terminal, and Hyper. Older terminals or raw SSH sessions show the URL as plain text — still readable, just not clickable. No degradation risk.

## Rejected Approaches

**OSC 8 terminal hyperlinks.** Would allow display text like "Quickstart guide" with a hidden URL. Rejected: requires terminal capability detection, a fallback path, and introduces escape-sequence garbage in terminals that don't support it. Plain URLs are universally safe and most terminals auto-link them.

**Links per concept/skill.** Considered linking to the skills page, pipeline page, context page at various points in init/setup output. Rejected: violates "every character earns its place." Three links at three moments is the right density. More would be a docs index, not helpful output.

**Links in error messages.** "Init failed — see troubleshooting: [link]." Rejected: error messages should tell you what went wrong and how to fix it inline. Sending users to a website during an error adds friction.

**Conditional links based on init state.** Different links for fresh-init vs re-init. Rejected: marginal value for added complexity. The quickstart link is useful at any experience level.

**A shared `docsUrl()` helper function.** Over-engineering for 3 string constants. A constants object is sufficient.

**Runtime URL validation.** Fetching URLs to check for 404s before displaying. Rejected: adds latency, network dependency, and failure modes to every init/setup run.

## Open Questions

None — all design decisions resolved during analysis.

## Exploration Findings

### Patterns Discovered
- `displaySuccessMessage` in `state.ts:608-705` — the init success output function. Final line is currently the "Next:" block with two `console.log` calls. New link goes after these.
- `setupCommand.action` in `setup.ts:40-48` — the bare `ana setup` handler. Currently logs the agent command and subcommands. Link goes between them.
- `ana-setup.md` Step 6 framing at template line ~306-345 — scripted ``` block that the agent presents verbatim. URL goes in this block.
- `using-ana-setup.mdx` §4 "Design principles" at content line ~76-107 — shows Anatomia's principles as examples. Linked element goes here.

### Constraints Discovered
- [OBSERVED] chalk v5.6.2 has no `.link()` method — OSC 8 would require manual escape sequences
- [OBSERVED] Terminal is Ghostty (xterm-ghostty) — supports auto-linking of https:// URLs
- [OBSERVED] `www.anatomia.dev` returns 404 — no www redirect configured
- [OBSERVED] Reference page anchor `#design-principles` is generated from filename via `f.name.replace(/\./g, "-")` at `reference/context/page.tsx:22` — structurally stable

### Test Infrastructure
- Init tests in `init.test.ts` — verify output content of displaySuccessMessage
- Setup tests would need to verify bare command output if tests exist for it

## For AnaPlan

### Structural Analog
`displaySuccessMessage` in `state.ts` — the function already has the exact pattern: labeled output lines with `chalk.bold` labels and values. The new URL line follows this pattern.

### Relevant Code Paths
- `packages/cli/src/commands/init/state.ts:700-704` — the "Next:" block, where the quickstart URL goes after
- `packages/cli/src/commands/setup.ts:40-48` — bare command handler, where the guide URL goes
- `packages/cli/src/constants.ts` — existing constants file, where URL constants should live
- `packages/cli/templates/.claude/agents/ana-setup.md:306-345` — Step 6 framing block
- `website/content/docs/guides/using-ana-setup.mdx:76-107` — design principles subsection

### Patterns to Follow
- Label alignment in `state.ts` — labels like `Stack:`, `Deploy:`, `Branch:` are right-padded with spaces for visual alignment. The `Quickstart` label should follow this pattern.
- `chalk.gray` for secondary information — used throughout the success message for non-primary content. Consider for the URL line styling.
- The docs site uses inline styled `<a>` or `<Link>` elements within content sections — follow existing link patterns in the MDX files.

### Known Gotchas
- The agent template uses scripted ``` blocks that the agent presents verbatim. The URL must be INSIDE the block to be reliably reproduced. If placed outside, the agent may rephrase or skip it.
- `constants.ts` already exists and exports several things. URL constants should be a clearly labeled group, not mixed in with existing exports.
- The website uses Next.js `<Link>` for internal navigation. The button in the docs page should use `<Link>` not `<a>`.

### Things to Investigate
- What styling pattern does the docs site use for inline call-to-action links within content sections? Check existing patterns in other MDX files or components to match the "little button" aesthetic Ryan described.
