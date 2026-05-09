# Scope: Section 4 — The System (replace Bento)

**Created by:** Ana
**Date:** 2026-05-09

## Intent
Replace the existing Bento section with a new "System" section that shows what `ana init` ships into a repo: agents, skills, context files, and the CLI. The design is a four-drawer accordion with file trees and a man-page CLI mock. The handoff HTML is approved and responsive-tested at 375/768/1280. This scope covers re-engineering it into modular Next.js components following existing website patterns, fixing factual errors in the handoff, and making key data (version, command count) maintainable.

## Complexity Assessment
- **Kind:** feature
- **Size:** large — new section with 5-6 components, CSS module, copy.ts additions, page composition change
- **Files affected:**
  - `website/lib/copy.ts` — new `system` key with all strings + update `#agents`/`#pipeline` anchors to `#system` across hero, nav, footer, manifesto
  - `website/components/system/` — new directory: SystemSection.tsx, Drawer.tsx (client), FileTree.tsx, ManPage.tsx, SpecStrip.tsx, system.module.css
  - `website/app/(marketing)/page.tsx` — replace Bento import with SystemSection
  - `website/components/bento/` — remove (or leave dead, defer cleanup)
  - `website/components/scan/ScanSlab.tsx` — update thread text and href
  - `website/components/hero/ScrollHint.tsx` — update href (or copy.ts `scrollHint`)
  - `website/app/globals.css` — possibly add `--spacing-section` if not already present
- **Blast radius:** Replaces the Bento section in the landing page. No other pages reference Bento. Pricing, DeepDive, ProofFeed are unaffected.
- **Estimated effort:** 3-4 hours
- **Multi-phase:** no

## Approach
Port the approved handoff HTML into componentized Next.js following the patterns already established by ScanSlab, Hero, and Bento. All user-visible strings go in `copy.ts`. The drawer toggle is the only client-side interaction — everything else is server-rendered. Use a CSS module for section-specific styles (the handoff has ~800 lines of CSS with 5 responsive breakpoints — too complex for inline Tailwind). CLI version is read from package.json at build time. Counts (agents, skills, commands) are constants in copy.ts so a single edit updates all derived values.

## Acceptance Criteria
- AC1: The Bento section is replaced by the System section on the landing page
- AC2: Page order is Hero → CompatMarquee → ScanSlab → SystemSection → DeepDive → Pricing → ProofFeed
- AC3: All four drawers open/close with animation (grid-template-rows 0fr→1fr)
- AC4: The CLI version in the man page reads dynamically from `packages/cli/package.json` at build time
- AC5: Command count is 25 (not 23), and `+ N more` is derived (25 - 6 shown = `+ 19 more`)
- AC6: The `+ more` trailing list names only real commands (no `check`, no `index`; include `init`)
- AC7: Context drawer file tree shows `.ana/context/` subfolder containing project-context.md and design-principles.md, with scan.json and ana.json at `.ana/` root
- AC8: Agent count is 5 (setup intentionally omitted — pipeline agents only)
- AC9: All strings live in `copy.ts` under a `system` key
- AC10: Responsive behavior matches handoff at 375px, 768px, and 1280px viewports
- AC11: Dark theme works via existing CSS custom properties (no hardcoded colors)
- AC12: Drawers use `<button>` with `aria-expanded` and `aria-controls` for accessibility
- AC13: The website builds without errors
- AC14: The section closer ("That's the system. Next: **the proof**.") uses the same mechanical pattern as the scan section thread — mono text, oxblood arrow, link to the next section (`#proof`). The arrow has a subtle opacity breathe animation (~3s cycle, 0.4→1→0.4) honoring `prefers-reduced-motion`.
- AC15: The scan section thread is updated: "feeds the pipeline" → "feeds the system", `href="#pipeline"` → `href="#system"`
- AC16: All orphaned `#pipeline` and `#agents` anchors are updated to `#system`:
  - `ScrollHint.tsx` line 24: `href="#pipeline"` → `href="#system"`
  - `ScanSlab.tsx` line 163: `href="#pipeline"` → `href="#system"`
  - `copy.ts` hero secondary CTA: `href: "#agents"` → `href: "#system"`
  - `copy.ts` nav link "Agents": `href: "/#agents"` → `href: "/#system"`
  - `copy.ts` footer "Pipeline" + "Agents" links: `href: "/#agents"` → `href: "/#system"`
  - `copy.ts` manifesto outbound: `href: "/#pipeline"` → `href: "/#system"`

## Edge Cases & Risks
- **CSS class collisions:** The handoff uses generic names (`.section`, `.container`, `.header`, `.lede`). Using a CSS module eliminates this — all class names are scoped automatically.
- **Fraunces font:** Already loaded site-wide as `--font-serif`. No additional font imports needed.
- **IntersectionObserver pulse animation:** The handoff stamps `pulse-fire` on `<body>`. In the Next.js version, stamp it on the section root element instead and adjust keyframe selectors.
- **prefers-reduced-motion:** The blinking cursor honors it. The disclosure pulse does not — wrap it in `@media (prefers-reduced-motion: no-preference)`.
- **Dark theme for man page:** The handoff uses `--terminal-bg` and `--terminal-fg` which already flip in dark mode. Should work out of the box, but verify.
- **Orphaned `#pipeline` anchors:** The hero scroll hint and scan thread both link to `#pipeline`. The old Bento used `id="agents"`. The new section uses `id="system"`. Both links need updating (covered in AC15 and AC16).

## Rejected Approaches
- **Iframe embed** — The INTEGRATION.md suggests this as a fallback. Rejected: breaks smooth scroll, no dark theme support, no copy.ts integration.
- **Inline Tailwind instead of CSS module** — The responsive behavior has 5 breakpoints with grid-area reflows. CSS module is the right tool; Tailwind would be unreadable.
- **Dynamic agent/skill/context counts from scanning the template directory** — Over-engineered. These change once or twice a year. A constant in copy.ts is the right level of indirection.
- **Including ana-setup in the agent count** — Setup is a one-time calibration agent, not a pipeline participant. The drawer's story is 5 pipeline agents with 5 distinct jobs and independence guarantees. Setup doesn't fit that narrative.

## Open Questions
- **DeepDive may overlap:** DeepDive shows a terminal running `ana init` while this section shows what init *produced*. Process vs output — probably fine, but Plan should verify the narrative doesn't feel redundant and flag if DeepDive needs adjustment.

## Exploration Findings

### Patterns Discovered
- Existing sections follow a consistent pattern: server component imports from `copy.ts`, uses `<Container>` for max-width, CSS module for complex styles, client component only where JS interaction is needed (e.g., CopyButton in ScanSlab, ThemeToggle in Nav).
- The Bento section uses tile sub-components in a `tiles/` subdirectory. The System section's drawers are analogous — each drawer's visual (FileTree, ManPage) is a sub-component.

### Constraints Discovered
- [VERIFIED] `--font-serif` (Fraunces) is already loaded site-wide (globals.css line 29)
- [VERIFIED] `--spacing-section` is defined in globals.css as 116px
- [VERIFIED] `--terminal-bg`/`--terminal-fg` flip correctly in dark theme (globals.css lines 98-99, 126-127)
- [VERIFIED] Container component exists at `components/ui/Container.tsx`
- [VERIFIED] CLI version is `1.0.2` in `packages/cli/package.json`
- [VERIFIED] Total CLI commands: 25 (9 top-level + 16 subcommands)
- [VERIFIED] Context files: project-context.md and design-principles.md are in `.ana/context/`, not `.ana/` root
- [VERIFIED] Init ships 6 agent files (including ana-setup), but section shows 5 (pipeline only)

### Test Infrastructure
- No unit tests for website components. AC13 (build succeeds) is the primary verification.
- Visual verification at 375px, 768px, 1280px viewports against the handoff HTML.

## For AnaPlan

### Structural Analog
`website/components/scan/ScanSlab.tsx` — server component with one client sub-component (CopyButton), imports from copy.ts, uses Container. The System section follows the same shape but with more sub-components.

For the CSS module pattern: `website/components/hero/hero.module.css` — complex responsive styles with multiple breakpoints.

### Relevant Code Paths
- `website/app/(marketing)/page.tsx` — page composition root, swap Bento for SystemSection
- `website/lib/copy.ts` — add `system` key
- `website/components/bento/` — being replaced (Bento.tsx + tiles/)
- `website/components/ui/Container.tsx` — shared wrapper, reuse
- `website/app/globals.css` — design tokens already defined, `--brand-mark` token added this session
- Handoff source of truth: `/Users/rsmith/Downloads/handoff-package 2/section-4-system/Section 4 - System.html`
- Integration notes: `/Users/rsmith/Downloads/handoff-package 2/section-4-system/INTEGRATION.md`

### Patterns to Follow
- Copy in `copy.ts`, not inline — follow ScanSlab pattern
- CSS module for section styles — follow Hero pattern
- `"use client"` only on Drawer.tsx (toggle state) — follow CopyButton pattern
- `<Container>` for max-width wrapper
- `data-component="system"` attribute on section root for debugging

### Known Gotchas
- The handoff's CSS has `body.pulse-fire` selectors for the IntersectionObserver animation. In Next.js, don't stamp `body` from a section component — use a ref on the section root and a local class instead.
- The handoff defines its own `:root` CSS variables. Don't duplicate — the site already has all of them in globals.css. Only port the section-specific styles.
- The drawer animation uses `grid-template-rows: 0fr → 1fr`. This is well-supported in modern browsers but needs the `overflow: hidden` wrapper div (`drawer-body-wrap`) to prevent content flash.
- The man page version string must be imported at build time. In Next.js server components, you can `import pkg from '../../../packages/cli/package.json'` or use `fs.readFileSync` — prefer the import for simplicity and type safety.

### Factual Corrections to Apply During Build
These are the delta between the handoff HTML and reality:

| Handoff says | Should say | Where it appears |
|---|---|---|
| `v1.1.2` | Dynamic from package.json (currently `v1.0.2`) | Man page header + footer |
| `23 commands` | `25 commands` | Spec strip, drawer 04 meta |
| `+ 17 more` | `+ 19 more` | Man page +more line |
| `setup, check, index, verify, proof, agents` | `init, setup, verify, proof, agents` (drop check/index, add init) | Man page +more line |
| `2026-04` in man footer | `2026-05` or derive from build date | Man page footer |
| `install: 3.2s` in spec strip | Unverified — scan takes ~3.3s, init adds file generation on top. Verify or soften to `~3s` | Spec strip |
| Context files flat under `.ana/` | Show `.ana/context/` subfolder for project-context.md and design-principles.md | Context drawer file tree |

### Section Transition Design
Each content section ends with a "thread" — a consistent mechanical element teasing the next section. The hero's scroll hint is different (it's a general scroll cue with a falling dot). The threads are section-to-section links.

**Pattern:** mono text · oxblood arrow · anchor link to next section. Arrow has a subtle opacity breathe animation (~3s, 0.4↔1). Honors `prefers-reduced-motion`.

| Section | Thread text | Links to |
|---------|------------|----------|
| Scan | What Ana finds **→** feeds the system. See how ↓ | `#system` |
| System | That's the system. Next: **the proof**. ↓ | `#proof` (future section) |

The scan thread already exists (`ScanSlab.tsx` lines 158-166) and needs the text and href updated. The system closer is new and should follow the same component pattern. Consider extracting a shared `SectionThread` component if the shape is identical.

### Things to Investigate
- Best way to import CLI version in a Next.js server component — direct JSON import vs fs.readFileSync vs build-time env variable. Design decision for Plan.
- Whether `SectionThread` should be a shared component in `components/ui/` or just repeated inline. If future sections (proof, pricing) will also have threads, shared is right.
