# Spec: Scan & Surfaces Concept Page + Docs Gaps

**Created by:** AnaPlan
**Date:** 2026-05-23
**Scope:** .ana/plans/active/docs-scan-surfaces-concept/scope.md

## Approach

New concept page for scan and surfaces, plus two additive guide updates. All four files are independent — no ordering dependency between changes.

The scan concept page follows the `pipeline.mdx` structural pattern: frontmatter, `##` sections of direct prose, `<NextCards>` at the bottom. No custom components (`<Callout>`, `<DocsStat>`, `<PipelineDiagram>`) — this page is prose-driven. Target ~90-100 lines. Four sections: what the scan detects, surfaces, application shape, and the cascade.

The configurability guide gets a `### Surface management` subsection using standard markdown — not the JSX card pattern used for CLI-supported settings above it. Commands and behaviors read better as prose + inline code.

The setup guide gets a paragraph in the Step 1 (Config confirmation) section — not Step 2 as the scope states. Step 2 is "Product identity" (describing your user's problem). Verification hints (stack provenance, surface gap check) are scan cross-checks that belong in config confirmation, where setup presents detected configuration. The paragraph goes after the existing config confirmation content and before the `### 2. Product identity` heading.

## Output Mockups

### scan.mdx structure

```
---
title: Scan and surfaces
description: The scan is the entry point...
readingTime: 6
---

## What the scan detects
{1-2 paragraphs: stack fields, external services, conventions, findings. Overview — not exhaustive.}

## Surfaces
{2-3 paragraphs: what surfaces are (workspace packages you deploy), how they're detected (deployment indicators — CLI entry points, framework configs, server framework deps), what gets excluded (examples, templates, e2e), what they carry (path, language, framework, per-surface commands).}

## Application shape
{1 paragraph: the 9 shapes, how shape is determined (framework evidence outranks deps), what shape affects (scan header, scaffold descriptions, agent context — not pipeline behavior).}

## The cascade
{2 paragraphs: scan detects surfaces → init writes per-surface commands → scope targets a surface → plan looks up surface test command → build runs surface-specific tests → verify checks independently → proof chain labels by surface. Include the concrete example from AC3.}

<NextCards> → Pipeline concept + Configurability guide
```

### Configurability surface management section

```
### Surface management

Adding a surface the scan missed:
  ana config set surfaces.api.path "apps/api"
  ana config set surfaces.api.commands.test "cd apps/api && pnpm test"

Removing a false surface:
  ana config delete surfaces.example-app

Re-init behavior: detected surfaces refresh, manually-added surfaces preserved (with warning if path doesn't exist), false surfaces silently dropped.

Field protection: path, language, framework are machine-managed and blocked from config set.
```

### Setup guide verification hints mention

```
A paragraph after config confirmation explaining:
- Stack provenance notes: setup flags stack detections from non-primary packages
- Surface gap check: setup identifies workspace packages with dev scripts that weren't surfaced
- Both are silent when the scan is correct — no friction
```

## File Changes

### `website/content/docs/concepts/scan.mdx` (create)
**What changes:** New concept page covering scan, surfaces, application shape, and the surface cascade through the pipeline.
**Pattern to follow:** `website/content/docs/concepts/pipeline.mdx` — same frontmatter fields (title, description, readingTime), same `##` section depth, same direct prose style, same `<NextCards>` closing pattern.
**Why:** The scan is the product's entry point. Every user runs it first. Surfaces are the headline monorepo feature. Neither has a concept page — developers see "3 surfaces" and "web-app" in scan output with no reference explaining what these mean or how they flow through the pipeline.

### `website/content/docs/concepts/meta.json` (modify)
**What changes:** Add `"scan"` at index 0 of the pages array. Result: `["scan", "pipeline", "skills", "context", "toolbelt", "artifacts", "contract", "findings"]`.
**Pattern to follow:** Existing array structure in meta.json.
**Why:** The scan feeds the pipeline — read order should reflect this. Adding "scan" first makes it the entry point for concept navigation.

### `website/content/docs/guides/configurability.mdx` (modify)
**What changes:** Add a `### Surface management` subsection after line 34 (the `Remove any field with...` paragraph) and before `### What ana.json looks like`. Covers: adding a surface, removing a surface, re-init behavior, field protection.
**Pattern to follow:** The existing prose + inline code pattern below the JSX cards in `configurability.mdx`. Standard markdown, not JSX cards.
**Why:** The guide mentions `ana config set surfaces.cli.commands.test` but doesn't explain how to add a surface the scan missed, remove a false surface, or what happens on re-init. These are immediate questions when a developer's scan doesn't match their expectations.

### `website/content/docs/guides/using-ana-setup.mdx` (modify)
**What changes:** Add a paragraph after the existing Step 1 (Config confirmation) content (after the JSX code block showing the bash session, around line 48) and before the `### 2. Product identity` heading. Mentions stack provenance notes and surface gap check.
**Pattern to follow:** The existing prose style in the setup guide — direct sentences, no callout component needed for this.
**Why:** The verification hints feature shipped but the guide doesn't mention it. A developer reading the guide before running setup won't know setup can catch and correct scan gaps.

## Acceptance Criteria

- [ ] AC1: `website/content/docs/concepts/scan.mdx` exists with frontmatter (title, description, readingTime) and covers: what the scan detects, surfaces (detection and exclusion), application shape, and the surface cascade through the pipeline.
- [ ] AC2: `concepts/meta.json` includes "scan" in the pages array, positioned before "pipeline" (the scan feeds the pipeline — read order should reflect this).
- [ ] AC3: The scan concept page includes at least one concrete example of the surface cascade (e.g., "Surface: api → Plan writes `(cd 'packages/api' && pnpm run test)` → proof chain labels entry as api").
- [ ] AC4: The scan concept page does NOT explain the 4 signals by name (Signal 1, Signal 2, etc.) — those are implementation details. It explains the CONCEPT: "surfaces are detected from workspace packages that have deployment indicators — CLI entry points, framework configs, or server framework dependencies."
- [ ] AC5: The configurability guide has a surface management subsection covering: adding a surface, removing a surface, re-init behavior, and field protection.
- [ ] AC6: The using-ana-setup guide mentions stack provenance notes and surface gap check in the Step 1 (Config confirmation) section.
- [ ] AC7: The new concept page follows existing style: 80-120 lines, direct prose, no filler, NextCards at the bottom linking to the pipeline concept.
- [ ] AC8: Website builds successfully: `(cd website && pnpm run build)`.
- [ ] AC9: No build errors or lint warnings in modified files.

## Testing Strategy

- **Build test:** `(cd website && pnpm run build)` — the build validates all MDX pages. A malformed page, broken JSX, or bad frontmatter fails the build. This is the primary verification.
- **No unit tests for MDX content.** The build IS the test.
- **Manual verification:** The concept page should render with correct sidebar ordering (scan before pipeline) and NextCards navigation.

## Dependencies

None. All changes are additive documentation. No code changes, no component changes.

## Constraints

- The scan concept page must stay under 120 lines. If content grows beyond that during implementation, trim the "What the scan detects" section — it's an overview, not a reference.
- Do NOT explain the 4 detection signals by name or number. Describe the concept: deployment indicators.
- Do NOT add links from start.mdx to the new page. The start page's surface callout links to Configurability, which is the correct target for that context (command overrides).
- Use `&apos;` for apostrophes in JSX text content — the `react/no-unescaped-entities` lint rule rejects raw `'` characters.

## Gotchas

- **meta.json ordering controls NextCards.** The pipeline page's NextCards currently points to Skills (the next page after pipeline). After adding "scan" before "pipeline," verify that pipeline's NextCards still point to Skills — they should, since NextCards are hardcoded per page, not auto-generated from meta.json. But the new scan page's NextCards must point to Pipeline (its successor in meta.json order).
- **JSX in MDX.** MDX files are JSX — curly braces, angle brackets, and apostrophes have special meaning. If the prose includes code examples with curly braces, wrap them in backtick code spans or code blocks.
- **Proof context note:** The setup guide has one active proof finding about a `/docs/reference/context#design-principles` link that must resolve. Don't remove or modify any existing links in the setup guide — only add content.
- **readingTime value.** All concept pages use `readingTime: 6`. Use the same value for consistency.

## Build Brief

### Rules That Apply
- Use `&apos;` for apostrophes in JSX text content (`don&apos;t` not `don't`). The `react/no-unescaped-entities` lint rule rejects raw `'`.
- MDX frontmatter must include `title` and `description`. `readingTime` is optional but all concept pages include it — follow convention.
- Concept pages use `##` for major sections — not `#` (reserved for the page title rendered from frontmatter) or `###`.
- `<NextCards>` takes an array of `{ eyebrow, title, href, description }` objects.

### Pattern Extracts

**pipeline.mdx frontmatter + opening (lines 1-11):**
```mdx
---
title: The pipeline
description: Five stages. Five agents. Each runs in its own session with restricted access — it reads what it needs, produces typed artifacts, and never sees the full picture. No agent grades its own work.
readingTime: 6
---

## Five stages

<PipelineDiagram variant="concept" />

Think understands what should change and why. Plan designs the solution and defines what "done" means. Build implements it. Verify makes sure everyone else did their job. Learn tends the record and makes the next cycle better.
```

**pipeline.mdx NextCards pattern (lines 51-64):**
```mdx
<NextCards cards={[
  {
    eyebrow: "Next concept",
    title: "Skills",
    href: "/docs/concepts/skills",
    description: "How project-specific rules shape what agents build."
  },
  {
    eyebrow: "Guide",
    title: "Verifying changes",
    href: "/docs/guides/verifying-changes",
    description: "How the independence guarantee works in practice."
  }
]} />
```

**configurability.mdx line 34 (insertion point):**
```mdx
Remove any field with `ana config delete <field>` — useful for clearing overrides and reverting to detected defaults.
```

**using-ana-setup.mdx Step 1 section (lines 47-48):**
```mdx
### 1. Config confirmation

Setup presents your detected configuration — application shape, stack, test and build commands, artifact branch — and asks "does this look right?" Correct anything that's wrong. These settings control how agents compile, test, and commit your code.
```

### Proof Context
- `using-ana-setup.mdx`: One active finding — `/docs/reference/context#design-principles` link must resolve. Not related to current changes. Don't modify existing links.
- No active proof findings for other affected files.

### Checkpoint Commands
- After `scan.mdx` + `meta.json`: `(cd website && pnpm run build)` — Expected: clean build, scan page appears in output
- After all changes: `(cd website && pnpm run build)` — Expected: clean build
- Full test suite: `pnpm run test -- --run` — Expected: 68 tests pass (no test changes in this build)

### Build Baseline
- Current tests: 68 passed in 10 test files
- Command used: `pnpm run test -- --run`
- Website build: clean (all pages render)
- After build: 68 tests in 10 files (no test changes expected)
- Regression focus: website build — MDX syntax errors will fail the build
