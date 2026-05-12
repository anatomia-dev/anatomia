# Spec: Content Pages — Phase 2 (Seven Concept Pages)

**Created by:** AnaPlan
**Date:** 2026-05-12
**Scope:** .ana/plans/active/content-pages/scope.md

## Approach

Phase 2 creates 7 concept MDX pages with content translated from the supermock's locked render functions. Each page follows an identical structure: frontmatter (title, description, readingTime, lastReviewed) → h1 → lede paragraph → MetaRow → sections with h2/h3 headings → NextCards at bottom.

The 7 concept pages and their supermock sources:
1. `pipeline.mdx` ← `renderPipeline()` — 5 stages, independence, rejection cycles, artifact table, learn stage, proof chain
2. `skills.mdx` ← `renderSkills()` — what Anatomia adds, 4-section structure, ownership model, how skills grow, all skills table, conditional matching, gotcha library
3. `context.mdx` ← `renderContextConcept()` — what context files are, context vs skills, creation flow, each file's purpose, who reads what, freshness
4. `toolbelt.mdx` ← `renderToolbelt()` — what it is, what it enforces, per-agent commands table, why it matters, how access is enforced
5. `artifacts.mdx` ← `renderArtifacts()` — where artifacts live, scope.md, plan.md, spec.md, contract.yaml, build_report.md, build_data.yaml, verify_report.md, verify_data.yaml
6. `contract.mdx` ← `renderContract()` — what a contract is, matcher types table, sealing, assertion→test tagging, writing good assertions
7. `findings.mdx` ← `renderFindings()` — severity levels, suggested actions, categories, lifecycle, real finding example

**Content translation rules:**
- Supermock `code(lang, body)` → fenced code blocks with language hint. Strip `<span class="tk-*">` tags, keep text content.
- Supermock `callout(kind, text)` → `<Callout variant="rule">` or `<Callout variant="note">`. Children are MDX, not HTML strings. Convert `<strong>`, `<code>`, `<a>` in callout text to markdown equivalents.
- Supermock `nextCards([...])` → `<NextCards cards={[...]} />`. Map `route` → `href` (prefix with `/docs`), `label` → `eyebrow`, `title` → `title`, `desc` → `description`.
- Supermock inline HTML tables → markdown tables.
- Supermock inline-styled divs (grids, cards) → Tailwind-styled JSX is NOT available in MDX. Use markdown structure (headings, lists, bold text) instead. The prose styling in docs.css handles typography.
- Supermock `<a class="link" data-route="...">` → markdown links with `/docs/` prefix paths.

**Dynamic values:** Some supermock pages reference `PROOF_STATS.entries`, `SKILLS.length`, `GOTCHAS.length`, etc. In MDX, these can't be dynamic (MDX is compiled at build time without access to data loaders). Two options per value:
- Values that change rarely and are known at spec time: hardcode with a comment `{/* Dynamic: update on data change */}`.
- Values that must be current: use a custom component that calls the data loader. Only worth it for high-visibility numbers.

Decision: hardcode with comments. The concept pages are editorial — the exact number matters less than the explanation. The overview page (Phase 1) handles the dynamic showcase.

**Ghost agents page:** NOT created. No `concepts/agents.mdx`. AC10 is satisfied by omission — the agents concept content lives in the pipeline page.

## Output Mockups

### Concept page structure (all 7 follow this pattern)
```
Docs / Concepts / The pipeline          ← breadcrumb (auto from catch-all)

The pipeline                             ← h1 from frontmatter
Five stages. Five agents. Each runs...  ← lede (first paragraph)
6 min read · Last reviewed 2026-05-10   ← MetaRow from frontmatter

## Five stages                           ← content sections
...

[Next concept: Skills] [Guide: Verifying changes]  ← NextCards
```

### NextCards mapping example
Supermock:
```js
{ route: '/concepts/skills', label: 'Next concept', title: 'Skills', desc: '...' }
```
Becomes MDX:
```jsx
<NextCards cards={[
  { eyebrow: "Next concept", title: "Skills", href: "/docs/concepts/skills", description: "..." }
]} />
```

## File Changes

### `website/content/docs/concepts/pipeline.mdx` (create)
**What changes:** Pipeline concept page. Covers 5 stages, independence guarantees, rejection cycles, artifact production table, learn stage, proof chain. Includes the PipelineDiagram component from Phase 1.
**Pattern to follow:** Supermock `renderPipeline()` (lines 297–347) for content. Catch-all page.tsx for how MDX pages render.
**Why:** Central concept — everything else references the pipeline.

### `website/content/docs/concepts/skills.mdx` (create)
**What changes:** Skills concept page. What Anatomia adds to skills, 4-section structure, ownership (machine vs human), how skills grow (init → setup → manual → promotion), how agents use skills, all skills table, conditional matching, gotcha library example.
**Pattern to follow:** Supermock `renderSkills()` (lines 387–447) for content.
**Why:** Explains the learned-rules layer that shapes agent behavior.

### `website/content/docs/concepts/context.mdx` (create)
**What changes:** Context concept page. What context files are (project-context.md, design-principles.md, scan.json, ana.json), context vs skills distinction, creation flow, what each file does, who reads what, freshness model.
**Pattern to follow:** Supermock `renderContextConcept()` (lines 1571–1623) for content.
**Why:** Explains how agents know the project.

### `website/content/docs/concepts/toolbelt.mdx` (create)
**What changes:** Toolbelt concept page. What the toolbelt is, what it enforces (artifact save example), per-agent command table, why it matters (mechanical enforcement, less context, deterministic state, audit trail), how access is enforced.
**Pattern to follow:** Supermock `renderToolbelt()` (lines 621–672) for content.
**Why:** Explains the CLI enforcement layer.

### `website/content/docs/concepts/artifacts.mdx` (create)
**What changes:** Artifacts concept page. Where artifacts live, then each of the 8 artifact types: scope.md, plan.md, spec.md, contract.yaml, build_report.md, build_data.yaml, verify_report.md, verify_data.yaml. Each with writer, reader, and purpose.
**Pattern to follow:** Supermock `renderArtifacts()` (lines 449–495) for content.
**Why:** Defines the 8 typed artifacts that form the pipeline record.

### `website/content/docs/concepts/contract.mdx` (create)
**What changes:** Contract concept page. What a contract is (YAML with assertions), real example from security-hardening, matcher types table, sealing moment, how assertions become tests via `@ana` tags, writing good assertions.
**Pattern to follow:** Supermock `renderContract()` (lines 497–566) for content.
**Why:** Explains the mechanical definition of "done."

### `website/content/docs/concepts/findings.mdx` (create)
**What changes:** Findings concept page. Severity levels table (risk, debt, observation), suggested actions table (promote, scope, monitor, accept), categories (code, test, upstream), lifecycle (active → closed/promoted/lesson), real finding example from security-hardening.
**Pattern to follow:** Supermock `renderFindings()` (lines 568–619) for content.
**Why:** Explains what happens after verification.

## Acceptance Criteria

- [ ] AC3: All 7 concept pages render at `/docs/concepts/{slug}` with correct content matching the supermock, including MetaRow with reading time and last reviewed date
- [ ] AC10: Ghost agents concept page does NOT exist — no `/docs/concepts/agents` route
- [ ] AC13: TOC (right rail) populates correctly on all concept pages from heading structure
- [ ] AC14: NextCards at the bottom of each page link to the correct next page, matching the supermock's navigation flow
- [ ] AC12: `pnpm build` succeeds with all pages compiling without errors
- [ ] No type errors or missing component imports

## Testing Strategy

- **Build verification:** `pnpm build` in the website directory. All 7 MDX files must compile, frontmatter must validate against the Zod schema in `source.config.ts`, and all component imports must resolve.
- **Visual verification:** Vercel preview against supermock.
- **Edge cases:**
  - No `concepts/agents.mdx` file exists (AC10)
  - Each page has `<NextCards>` with correct hrefs (all prefixed with `/docs/`)
  - Tables render correctly in the prose styling (skills table, artifact table, matcher table)

## Dependencies

- Phase 1 must be complete: Callout fix (label text), meta.json files (sidebar ordering), catch-all page.tsx fix (editUrl org).
- PipelineDiagram component from Phase 1 is used on the pipeline concept page.

## Constraints

- Content is translated from the supermock, not invented. Every heading, every paragraph has a source in the supermock render functions.
- MDX cannot call data loaders at render time. Values that the supermock renders dynamically (like `PROOF_STATS.entries`) are hardcoded with `{/* Dynamic: update on data change */}` comments.
- No inline HTML styling in MDX. The supermock's inline `style` attributes must be translated to markdown structure or dropped.
- Frontmatter must include `title` (string) and `description` (string) — required by the Zod schema. `readingTime` (number) and `lastReviewed` (string) are optional but should be included per the supermock.

## Gotchas

- **MDX component imports are automatic.** Components registered in the `mdxComponents` object in `[[...slug]]/page.tsx` (Callout, NextCards, StatsStrip, ForPlatform) are available in all MDX files without explicit imports. PipelineDiagram is NOT registered — if the pipeline page needs it, either register it in mdxComponents or import it explicitly in the MDX file.
- **Markdown tables in MDX:** Use standard markdown table syntax. The prose CSS in `docs.css` styles `th`, `td`, `table` elements. No custom table component needed.
- **NextCards href prefix:** Supermock routes like `/concepts/skills` must become `/docs/concepts/skills` in production. Every `href` in NextCards must start with `/docs/`.
- **Heading IDs for TOC:** Fumadocs automatically generates heading IDs from text content for the TOC. Don't add manual `id` attributes — let the MDX pipeline handle it.
- **Code blocks:** Use fenced code blocks with language hints (`yaml`, `markdown`, `json`, `typescript`, `bash`). The `pre` → `CodeBlock` MDX override handles rendering. Don't use the `<CodeBlock>` component directly in MDX.
- **Callout children in MDX:** Content inside `<Callout>` must be valid MDX. Use markdown formatting (`**bold**`, `` `code` ``) not HTML (`<strong>`, `<code>`). Except for inline elements that MDX supports natively.

## Build Brief

### Rules That Apply
- Frontmatter: `title` and `description` required. `readingTime` (number, minutes) and `lastReviewed` (string, "May 2026" format) optional.
- MDX components available without import: `Callout`, `NextCards`, `StatsStrip`, `ForPlatform`, plus `pre` → `CodeBlock`.
- Markdown links for internal navigation: `[text](/docs/concepts/skills)` not `<Link>`.
- Use standard markdown for emphasis, lists, tables. Don't reach for HTML unless markdown can't express it.

### Pattern Extracts

**Existing MDX page (index.mdx — frontmatter + component usage):**
```mdx
---
title: Anatomia Documentation
description: Learn how to use Anatomia for verified AI development.
readingTime: 5
lastReviewed: May 2026
---

# Anatomia Documentation

<Callout variant="rule">
  Every change must be verified.
</Callout>

<NextCards cards={[
  {
    eyebrow: "Guide",
    title: "Your First Pipeline Run",
    href: "/docs/guides/first-pipeline",
    description: "Walk through scoping..."
  }
]} />
```

**Supermock concept page wrapper (renderConceptPage — shows the structure each page follows):**
```js
// supermock-v1-locked/pages.js lines 286-295
function renderConceptPage(config) {
  return `<div class="prose">
    ${crumb([{route:'/', label:'Docs'}, {route:'/concepts/pipeline', label:'Concepts'}, {label:config.title}])}
    <h1 class="page-title">${config.title}</h1>
    <p class="lede">${config.lede}</p>
    <div class="meta-row"><span><b>Reading time</b> · ${config.readTime || '5 min'}</span><span><b>Last reviewed</b> · 2026-05-10</span></div>
    ${config.body}
    ${config.nextCards ? nextCards(config.nextCards) : ''}
  </div>`;
}
```

### Proof Context

No active proof findings for affected files.

### Checkpoint Commands

- After first 3 concept pages: `cd website && pnpm build` — Expected: build succeeds
- After all 7 concept pages: `cd website && pnpm build` — Expected: build succeeds with all concept pages
- Lint: `cd website && pnpm lint`

### Build Baseline

- After Phase 1: build succeeds with overview + quickstart
- After Phase 2: build succeeds with overview + quickstart + 7 concept pages
- Regression focus: sidebar ordering (meta.json interaction with new pages), catch-all page rendering
