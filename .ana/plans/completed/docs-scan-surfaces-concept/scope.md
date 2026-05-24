# Scope: Scan & Surfaces Concept Page + Docs Gaps

**Created by:** Ana
**Date:** 2026-05-23

## Intent

The scan is the product's entry point — every user runs it first. Surfaces are the headline feature for monorepos — they're what makes the pipeline per-surface instead of project-wide. Application shape is visible in every scan header. But none of these have a concept page. A developer scanning their monorepo sees "3 surfaces" and "web-app" with no reference explaining what either means, how they were determined, or how they flow through the pipeline.

The existing 7 concept pages cover the pipeline, skills, context, toolbelt, artifacts, contract, and findings. The scan — which feeds all of them — is a gap. The result: the Getting Started page says "run `ana init`" and the README shows the scan output, but there's no intermediate explanation of what the scan actually produces and why surfaces matter for the pipeline.

Three documentation gaps to close:

1. **New concept page: `concepts/scan.mdx`** — what the scan detects, how surfaces are identified, what application shape means, and critically: how surfaces cascade through scope → plan → build → verify → proof chain.

2. **Configurability guide surface section** — the existing guide mentions `ana config set surfaces.cli.commands.test` but doesn't explain how to add a surface the scan missed, remove a false surface, or what happens to surfaces on re-init. These are immediate questions when a developer's scan doesn't match their expectations.

3. **Setup guide mention of verification hints** — the setup verification hints feature (stack provenance notes, surface gap check) shipped but the using-ana-setup guide doesn't mention them. A developer reading the guide before running setup won't know that setup can now catch and correct scan gaps.

## Complexity Assessment

- **Kind:** chore
- **Size:** medium — 1 new MDX page (~80-100 lines), 2 guide updates (~15-20 lines each)
- **Surface:** website
- **Files affected:**
  - `website/content/docs/concepts/scan.mdx` — new concept page
  - `website/content/docs/concepts/meta.json` — add scan to page ordering
  - `website/content/docs/guides/configurability.mdx` — add surface management section
  - `website/content/docs/guides/using-ana-setup.mdx` — add verification hints mention
- **Blast radius:** None. New MDX page + additive content in two existing pages. No code changes. No component changes.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

**New concept page (`scan.mdx`)** — follows the style of existing concept pages (64-89 lines, direct prose, no filler). Covers four areas:

1. **What the scan detects.** The stack fields (language, framework, database, auth, testing, payments, AI SDK, UI system, workspace), external services, deployment platform, git intelligence, conventions, documentation inventory, and findings. One paragraph overview, not an exhaustive list — the reference pages handle detail.

2. **Surfaces.** What they are (the things you deploy — apps, services, CLIs), how they're detected (four signals: bin+dev, apps/+config, framework config, server framework dep), what gets excluded (examples, templates, e2e, test fixtures), and what they carry (path, language, framework, testing, per-surface commands). Emphasize: surfaces are workspace packages the team deploys, not every package in the monorepo.

3. **Application shape.** What the 9 shapes mean (web-app, api-server, full-stack, cli, library, mcp-server, ai-agent, mobile-app, worker, unknown), how shape is determined (framework evidence outranks dependency signals), and what shape affects (scan header, scaffold descriptions, agent context — not pipeline behavior).

4. **The cascade.** This is the section that explains why surfaces matter. The flow: scan detects surfaces → init writes per-surface commands to ana.json → Ana scopes work to a specific surface → Plan looks up that surface's test command for checkpoint commands → Build runs surface-specific tests → Verify checks independently → proof chain labels the entry by surface → `ana proof health --surface api` shows per-surface quality. This section should make a developer think "oh, that's why surfaces matter — my API tests run separately from my frontend tests in the pipeline."

**Configurability guide update** — add a "### Surface management" subsection under the existing CLI-supported settings section. Cover:
- Adding a surface setup missed: `ana config set surfaces.api.path "apps/api"` + commands
- Removing a false surface: `ana config delete surfaces.example-app`
- What happens on re-init: detected surfaces refresh, manually-added surfaces are preserved (mergeSurfaces keeps orphaned surfaces with a warning), false-surface paths are silently dropped
- Surface field protection: `path`, `language`, `framework` are machine-managed and blocked from `config set`

**Setup guide update** — add a callout or paragraph in the Step 2 section mentioning that setup now cross-checks the scan:
- Stack provenance notes: setup flags stack detections from non-primary packages
- Surface gap check: setup identifies workspace packages with dev scripts that weren't surfaced and offers to add them
- Both are silent when the scan is correct — no friction for the sniper customer

## Acceptance Criteria

- AC1: `website/content/docs/concepts/scan.mdx` exists with frontmatter (title, description, readingTime) and covers: what the scan detects, surfaces (detection and exclusion), application shape, and the surface cascade through the pipeline.
- AC2: `concepts/meta.json` includes "scan" in the pages array, positioned before "pipeline" (the scan feeds the pipeline — read order should reflect this).
- AC3: The scan concept page includes at least one concrete example of the surface cascade (e.g., "Surface: api → Plan writes `(cd 'packages/api' && pnpm run test)` → proof chain labels entry as api").
- AC4: The scan concept page does NOT explain the 4 signals by name (Signal 1, Signal 2, etc.) — those are implementation details. It explains the CONCEPT: "surfaces are detected from workspace packages that have deployment indicators — CLI entry points, framework configs, or server framework dependencies."
- AC5: The configurability guide has a surface management subsection covering: adding a surface, removing a surface, re-init behavior, and field protection.
- AC6: The using-ana-setup guide mentions stack provenance notes and surface gap check in the Step 2 section.
- AC7: The new concept page follows existing style: 80-100 lines, direct prose, no filler, NextCards at the bottom linking to the pipeline concept.
- AC8: Website builds successfully: `(cd website && pnpm run build)`.

## Edge Cases & Risks

**Page ordering in meta.json.** Adding "scan" before "pipeline" changes the concept page navigation order. Every concept page currently has NextCards pointing to the next page. The pipeline page's NextCards point to "Skills." The new scan page's NextCards should point to "Pipeline." The pipeline page does NOT need to change — its NextCards still point to Skills.

**Overlap with start.mdx.** The start page briefly mentions surfaces in a callout. The new concept page goes deeper. No content should be duplicated — the start page should remain a quick-start guide, not a concept explanation. If anything, the start page's surface callout could link to the new concept page.

**Depth calibration.** The existing concept pages are 64-89 lines. The scan concept page covers more ground (scan + surfaces + shape + cascade) but should stay under 120 lines. If it grows beyond that, shape could be a separate subsection or the cascade could be shortened with a link to the configurability guide for details.

## Rejected Approaches

**Separate "Surfaces" concept page.** Surfaces are a feature of the scan, not an independent concept. A developer encountering surfaces encounters them via `ana scan`. Splitting scan and surfaces into two concept pages would create a navigation hop for a concept that flows naturally from scan output to pipeline behavior.

**Documenting the 4 signal names (Signal 1-4).** Implementation detail that changes when detection logic changes. The docs should explain WHAT surfaces are and WHY they exist, not HOW the detector decides. "Framework configs, CLI entry points, and server framework dependencies" is stable. "Signal 4 requires MIN_FILES_SERVER_DEP of 15" is not.

**Adding ana.json schema reference page.** Would document every field in ana.json. Useful but separate scope — the current gap is conceptual (what are surfaces) not reference (what fields does ana.json have).

## Open Questions

None.

## Exploration Findings

### Patterns Discovered

- Concept pages are 64-89 lines, use `##` for major sections, include a `<NextCards>` component at the bottom for navigation. Pipeline (64 lines) is the shortest, context (89 lines) the longest.
- `meta.json` ordering determines sidebar and NextCards navigation: `["pipeline", "skills", "context", "toolbelt", "artifacts", "contract", "findings"]`. Inserting "scan" at position 0 makes it the first concept page.
- Existing pages use `<Callout>`, `<DocsStat>`, and `<PipelineDiagram>` components. The scan page likely needs none of these — it's prose-driven.
- `<NextCards>` takes an array of `{ eyebrow, title, href, description }` objects.

### Constraints Discovered

- [OBSERVED] The configurability guide uses inline JSX `<div>` elements with `style={{}}` for the settings cards, not MDX components. Surface management content should use the same pattern OR use standard markdown if it fits better (the guide mixes both).
- [OBSERVED] The using-ana-setup guide's Step 2 section is at approximately line 30-50. The verification hints addition would go after the existing config confirmation explanation.
- [OBSERVED] The website builds MDX via fumadocs. Frontmatter must include `title` and `description`. `readingTime` is optional but all concept pages include it.

### Test Infrastructure

- Website build (`cd website && pnpm run build`) validates all MDX pages. A malformed page fails the build.
- No unit tests for MDX content — the build IS the test.

## For AnaPlan

### Structural Analog

`website/content/docs/concepts/pipeline.mdx` — same depth, same style, same audience. The scan concept page covers a system concept with the same "what it is → why it matters → how it works" structure.

### Relevant Code Paths

- `website/content/docs/concepts/scan.mdx` — new file
- `website/content/docs/concepts/meta.json` — page ordering
- `website/content/docs/guides/configurability.mdx` — surface management addition (~line 20-40 area, after the CLI-supported settings intro)
- `website/content/docs/guides/using-ana-setup.mdx` — verification hints mention (~line 30-50 area, Step 2 section)

### Patterns to Follow

- `pipeline.mdx` for concept page structure and tone
- `configurability.mdx` for guide section structure
- `using-ana-setup.mdx` for the Step 2 section style

### Known Gotchas

- `meta.json` pages array controls sidebar ordering. Adding "scan" to position 0 is: `["scan", "pipeline", "skills", "context", "toolbelt", "artifacts", "contract", "findings"]`. If the position is wrong, the sidebar nav is wrong.
- The existing pipeline concept page has `NextCards` pointing to Skills. The new scan page's NextCards should point to Pipeline. Don't modify pipeline's NextCards — they're correct (Pipeline → Skills).
- MDX files must not have JSX syntax errors — the website build will fail. Test with `cd website && pnpm run build`.

### Things to Investigate

- Whether the start.mdx surface callout should link to the new concept page. Currently says "Monorepos with multiple surfaces: see Configurability for per-surface overrides." Could add a link to the scan concept page for what surfaces ARE. Low priority — a nice-to-have link, not a content gap.
- Whether the `proof health --surface` flag should be mentioned in the cascade section or left for the Learn guide. The cascade section explains the flow; the Learn guide explains how to use it. Probably a one-sentence mention with a link is sufficient.
