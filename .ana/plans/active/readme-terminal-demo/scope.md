# Scope: README Terminal Demo

**Created by:** Ana
**Date:** 2026-05-26

## Intent
Replace the static code block in the README hero section with an animated terminal recording of `ana scan` running on dub (23K stars, YC company). The recording shows the command typed, the spinner running, and the full scan output resolving — framework, database with 80 models, auth, AI, payments, surfaces, intelligence with contributor activity and hot files. The static code block is removed. The demo is the product's front door: a developer sees the scan resolve a recognizable project's entire identity in seconds and thinks "I need to try this on my repo."

The README currently shows inbox-zero scan output as a pasted code block. It could be any tool's output — it doesn't move, doesn't show the spinner, doesn't show the scan completing in real time, and doesn't prove the tool works on a project the visitor recognizes.

## Complexity Assessment
- **Kind:** feature
- **Size:** small — 2 files changed (README.md, assets created), no production code
- **Surface:** cross-surface
- **Files affected:** `README.md`, `assets/demo/dub-scan.tape` (new), `assets/demo/dub-scan.gif` (new)
- **Blast radius:** README only. No production code changes. No test changes.
- **Estimated effort:** 1-2 hours
- **Multi-phase:** no

## Approach
Record an animated GIF of `ana scan .` running on a full clone of dub using VHS (charmbracelet). Commit the `.tape` script and the generated GIF to `assets/demo/`. Replace the README's static code block section with the GIF embedded via an `<img>` tag, with the `npx` install command moved below the demo. Remove the static code block entirely — the GIF replaces it.

The recording uses a full clone of dub (not shallow) so the Intelligence section populates with Activity, Hot files, and Docs. This was verified: `--depth 200` does NOT produce Activity/Hot files, but a full clone produces `5 contributors · 44→61→39→64 weekly` and three hot files with edit counts.

Dark theme only (Catppuccin Mocha). No light variant. No `<picture>` element for theme switching. Rationale: npm's README renderer strips `<picture>` and `<source>` elements, so dark/light switching works on GitHub but breaks on npmjs.com. A dark terminal recording on any background is the industry standard (charmbracelet/gum, freeze, bat, ripgrep all do this). Zero terminal-recording-based CLI projects ship dark/light variants.

## Acceptance Criteria
- AC1: The README hero section contains an animated GIF showing `ana scan .` running on dub, displaying the full scan output including the Intelligence section (Activity, Hot files, Docs).
- AC2: The static code block that previously showed inbox-zero scan output is removed.
- AC3: The `npx anatomia-cli scan .` command appears below the GIF, not above it.
- AC4: The GIF is embedded via `<img>` tag with `alt` text and `width="600"`.
- AC5: `assets/demo/dub-scan.tape` exists and is a valid VHS tape file that reproduces the recording.
- AC6: `assets/demo/dub-scan.gif` exists and is under 500KB.
- AC7: The GIF renders correctly on GitHub (animated, autoplaying, looping).
- AC8: The GIF renders correctly on npmjs.com via `<img>` tag.
- AC9: A "See more examples" link points to the docs site examples page.

## Edge Cases & Risks

**Dub's scan output will drift over time.** The recording is a snapshot. If someone clones dub next month and runs `ana scan`, the output may differ (new packages, changed model counts, different hot files). This is how every CLI project handles demo recordings — the `.tape` file documents the method, not a live promise. The GIF should be re-recorded after any scan output format change (header box layout, section names, field formatting).

**Hot files and Activity data are git-history-dependent.** The recording must be made from a full clone. The `.tape` file should include a comment documenting this requirement. If recording is done from the existing test repo at `test_repos/_handoff_30/dub` (which is a shallow clone), the Intelligence section will show only Docs.

**The finding heuristic detail wraps at 1200px/font 18.** `"Wrapper-based or middleware validation may not be dete\ncted."` wraps one word. This is a natural terminal wrap, not a rendering bug. It looks like how a real terminal would display it.

**Hot files line is long.** `network-partner-application-sheet.tsx (8)` pushes close to the right edge. This is dub's actual hot file — it's honest output. Minor visual clip at the margin.

**npm `<img>` tag attribute limits.** npm's sanitizer allows alt, src, width, height on `<img>`. No `loading`, no `class`, no `style`. The embed must use only these four attributes.

**Catppuccin Latte is NOT a working light theme in VHS.** Verified: it renders dark despite the name. If a light variant is ever added, use `Builtin Solarized Light` instead.

## Rejected Approaches

**SVG via agentstation/vhs fork.** Tested — produces 25KB animated SVG with selectable text and vector crispness. Rejected because: (a) the fork has 9 stars and hasn't been updated since Dec 2025, (b) GIF file sizes are already trivial (~155KB), so the size advantage is irrelevant, (c) animated SVG rendering on npm is unverified. The quality difference doesn't justify the dependency risk. Can revisit if the fork matures.

**Dark + light variants via `<picture>` element.** Rejected because npm strips `<picture>` and `<source>` elements. Half the README's audience (npmjs.com visitors) would see the fallback image only, defeating the purpose. No terminal-recording CLI project ships both variants. Dark-only is the industry norm.

**Collapsible secondary demos with `<details>`.** Rejected because: (a) no major CLI project uses `<details>` for demo sections, (b) one strong hero demo beats three demos that add scroll depth, (c) secondary demos belong on the docs site where the audience is "how do I use this" rather than "should I install this."

**langfuse as hero repo.** langfuse has a stronger Intelligence section (25 contributors, domain-relevant hot files) and higher star count (28K). Rejected after confirming that a full clone of dub populates the Intelligence section adequately (5 contributors, weekly trends, hot files). Dub wins on stack density (80 models, every field filled) and name recognition in the Next.js/YC ecosystem. langfuse remains available as a secondary demo for the docs site.

**`npx anatomia-cli scan .` in the recording instead of `ana scan .`** The README audience hasn't installed the tool, so `npx` is what they'd run. But `ana scan .` is shorter, cleaner in the recording, and the npx command is shown separately below the GIF as the call-to-action. The demo shows the product; the text shows the install path.

## Open Questions

None — all resolved during investigation.

## Exploration Findings

### Patterns Discovered
- VHS tape files are trivial to write (~15 lines). The entire recording is deterministic and reproducible.
- GIF file sizes for scan output are dramatically smaller than expected: 155KB for a 14-second animation at 1200×1000. The REQ's 2-5MB estimate and gifsicle optimization discussion are unnecessary.
- VHS captures ora spinner frames correctly as braille characters (⠋ ⠙ ⠹ etc.) — no ANSI escape garbage.
- Box-drawing characters (┌─┐│└─┘) render cleanly in VHS recordings.

### Constraints Discovered
- [TYPE-VERIFIED] npm-picture-strip — npm's README sanitizer strips `<picture>` and `<source>` elements. Only `<img>` with alt/src/width/height survives.
- [TYPE-VERIFIED] catppuccin-latte-broken — VHS "Catppuccin Latte" theme renders dark, not light. Use "Builtin Solarized Light" for light themes.
- [OBSERVED] shallow-clone-intelligence — `git clone --depth 200` of dub does NOT populate Activity/Hot files in the scan. Full clone required.
- [OBSERVED] dub-full-clone-intelligence — Full clone produces `5 contributors · 44→61→39→64 weekly` with hot files.
- [OBSERVED] font-18-1200-wrap — At font 18/1200px width, Services line fits with (+2 more) inline. Finding heuristic wraps one word. Hot files line clips at margin. All acceptable.

### Test Infrastructure
- VHS v0.11.0 (charmbracelet/tap) installed via brew with ffmpeg and ttyd dependencies.
- agentstation/vhs v0.11.1 installed as cask (separate binary at `/opt/homebrew/Caskroom/vhs/0.11.1/vhs`). Available for SVG experiments.
- gifsicle installed for optimization (not needed at current file sizes).
- Test recordings at `/tmp/vhs-test/` with multiple dimension/theme variants for comparison.

## For AnaPlan

### Structural Analog
`README.md` current hero section (lines 9-50). The replacement is 1:1 positional — the GIF replaces the static code block, the npx command moves below.

### Relevant Code Paths
- `README.md` — the file being changed. Hero section starts at "## Scan any project in 10 seconds" (~line 9).
- `assets/demo/` — new directory for tape file and GIF output.

### Patterns to Follow
- charmbracelet/gum README: `<img alt="description" width="600" src="relative/path.gif">`. Plain `<img>`, no `<picture>`, `width="600"` display width.
- VHS tape files are self-documenting. Include comments for clone requirements and re-recording instructions.

### Known Gotchas
- The recording MUST be made from a full clone of dub, not the existing shallow clone at `test_repos/_handoff_30/dub`. The Intelligence section difference is the whole point.
- VHS dimension: 1200×1000 pixels / font 18 / Catppuccin Mocha / TypingSpeed 50ms / Padding 20. These were tested across multiple variants and this combination fits the full output without scrolling. Do not change without visual verification.
- The tape needs `Sleep 12s` after Enter — the dub scan takes ~5.4 seconds and needs buffer for output rendering plus a hold at the end before loop.
- The `width="600"` in the `<img>` tag controls display size independent of the GIF's native 1200px resolution. This matches Charm's pattern and ensures the GIF doesn't dominate the page.

### Things to Investigate
- Whether to add a `## Examples` or `## See more` section at the bottom of the README linking to `anatomia.dev/docs` for additional demo repos — or whether the "See more examples" link should be inline near the hero. Design judgment for the spec.
