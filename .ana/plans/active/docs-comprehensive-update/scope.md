# Scope: Comprehensive Documentation Update for Surface Awareness

**Created by:** Ana
**Date:** 2026-05-20

## Intent

Surface awareness shipped across three stages but the documentation doesn't reflect it. The proof data pipeline strips the `surface` field, so the website's proof pages can't display it even though the proof chain has it (88 cli, 19 website, 25 unscoped). The quickstart leads with monorepo complexity that confuses simple-app users. The troubleshooting card for "tests fail" is ordered wrong — surface config first, database not running last. The README is missing `config delete` and any mention of surfaces. Several guide and concept pages need minor corrections to stay accurate.

The docs are the product's first impression. Incomplete docs after a feature ships make the product look unfinished.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — 9 files across website content, components, data pipeline, and README
- **Surface:** website
- **Files affected:**
  - `website/lib/docs-data/types.ts`
  - `website/scripts/extract-docs-data.ts`
  - `website/components/docs/proof/ProofHero.tsx`
  - `website/components/docs/proof/ProofExplorer.tsx`
  - `website/content/docs/start.mdx`
  - `website/content/docs/guides/troubleshooting.mdx`
  - `website/content/docs/guides/reading-a-proof.mdx`
  - `website/content/docs/guides/using-ana-learn.mdx`
  - `website/content/docs/guides/configurability.mdx`
  - `README.md`
- **Blast radius:** Proof pages render from extracted data — the type change flows through ProofHero, ProofExplorer, and the detail page. Content changes are prose-only with no runtime risk. README is standalone.
- **Estimated effort:** 2-3 hours pipeline time
- **Multi-phase:** no

## Approach

Thread surface awareness through the proof data pipeline so it reaches the website, then update prose across 6 content files to reflect what shipped. Every change serves the specific reader who arrives on that page: the anxious quickstart reader gets simpler guidance, the frustrated troubleshooting reader gets causes ranked by frequency, the browsing proof reader gets surface metadata at appropriate weight, the evaluating README reader gets a complete command list. No page gets surface detail it doesn't need — concept pages that aren't factually wrong stay untouched.

## Acceptance Criteria

- AC1: `ProofEntry` type includes `surface?: string | null` and the extract script maps it from proof chain entries
- AC2: ProofHero displays a `surface` label as the LAST item in the metadata row (after "shipped"), only when the entry has a surface value, styled at the same visual weight as "shipped" — plain mono text, no badge, no color
- AC3: ProofExplorer shows surface as an inline 10px mono label on each row (same styling as existing stage badge), only for entries with a surface value — no filter chip added
- AC4: Quickstart commands callout simplified to three lines: verify detected commands (Test, Build, Lint), override syntax, link to configurability guide for monorepo per-surface config
- AC5: Quickstart has an external services callout between the Step 3 heading and the first code block — two sentences about starting database/Redis/Docker before the pipeline
- AC6: Troubleshooting "Tests fail in pipeline but pass locally" card rewritten with causes ranked: database not running, missing env vars, wrong test command, Prisma client, monorepo surface mismatch — where item 5 cross-references the existing "Monorepo: scan covers the whole repo" card instead of repeating override syntax
- AC7: Troubleshooting best practices section gains two bullets: "Start small" and "Check your test command first"
- AC8: README commands table includes `config delete` with a one-line description
- AC9: README init section includes one sentence about monorepo surface detection
- AC10: Reading-a-proof guide mentions the surface label after the hero grid: "Monorepo projects show one additional label: the surface that was verified"
- AC11: Using-ana-learn guide includes a brief mention of `--surface` flag on `proof health` and `proof audit` for scoped triage — one line, not a section
- AC12: Configurability guide includes `config delete` mention (one sentence after the settings grid) and per-surface command override syntax (one line in or near the "Build / test / lint commands" card)
- AC13: No changes to toolbelt, pipeline, or context concept pages — these are not factually wrong and don't need surface detail

## Edge Cases & Risks

- **25 unscoped proof entries** have no surface value. ProofHero and ProofExplorer must gracefully omit the surface label for these — conditional rendering, not "surface: unknown."
- **Reading-a-proof visual grid** currently shows exactly 6 items in a 3x2 layout. Surface is NOT added to the grid — it's a sentence after the grid. This avoids breaking the visual mock.
- **Stage vs surface overlap in ProofExplorer.** The "Website" stage filter already correlates with `surface: website`. This is fine — Stage is a domain categorization, surface is an architectural fact. They serve different purposes. No deduplication needed.
- **Quickstart callout links to configurability.** The configurability page must deliver for the reader who follows that link — AC12 ensures per-surface override syntax is there.
- **Troubleshooting card cross-reference.** Item 5 references the "Monorepo: scan covers the whole repo" card by name. If that card's title changes, the reference breaks. Use stable language: "See the monorepo card above" rather than quoting the exact title.

## Rejected Approaches

**ProofExplorer Surface filter chip.** With 132 entries and only 3 surface values (2 meaningful + null), a filter dimension doesn't create useful segmentation. The existing Stage filter partially overlaps (Website stage = website surface). An inline label per row provides the information without interaction overhead. Revisit when there are 4+ distinct surfaces or 200+ entries.

**ProofHero surface badge after verdict.** Verdict is the hero's hero — the only colored element. Placing surface next to it elevates metadata to result-level prominence. Surface belongs last in the row, same weight as "shipped."

**Adding surface detail to concept pages.** Pipeline, context, and toolbelt pages aren't factually wrong. They describe concepts at a level where surfaces are an implementation detail. Adding surface mentions would pursue comprehensive over accurate — the REQ's own principle of "fix misleading, don't pursue comprehensive" applies.

**"Subsequent runs are faster as agents learn patterns" on the quickstart.** Not mechanically true. The proof chain gives context to future agents but doesn't reduce wall-clock time. Marketing language doesn't belong in documentation.

**Pre-existing failures note on the troubleshooting "Tests fail" card.** True but wrong place. The reader is debugging a failure. Telling them "but pre-existing failures are fine" muddies the message. If worth documenting, it deserves its own TroubleCard.

## Open Questions

None — all design questions resolved during investigation.

## Exploration Findings

### Patterns Discovered

- `ProofHero.tsx` (lines 51-89): metadata row is a flex-wrap div with consistent `<b>label</b> value` pattern at 11.5px mono. Adding surface means one more `<span>` in the same pattern, conditionally rendered.
- `ProofExplorer.tsx` (lines 240-260): each row already has inline badges (stage badge, rejection count badge) using 10px mono with hairline border. Surface label follows the same pattern.
- `extract-docs-data.ts` (line 188-209): the mapped entry object is assembled in one block. Surface addition is `surface: entry.surface || null` at line ~199, same pattern as `scopeSummary`.
- `troubleshooting.mdx`: TroubleCard pattern is title → brief mental model → numbered causes → optional closing note. The proposed rewrite follows this pattern exactly.
- `start.mdx` (line 43-45): existing callout is a `<Callout variant="note">` with bold lead and inline code. Replacement follows the same structure.

### Constraints Discovered

- [TYPE-VERIFIED] ProofEntry type (`website/lib/docs-data/types.ts:31-56`) — adding `surface` as optional field is non-breaking; all existing consumers handle undefined gracefully via conditional rendering
- [OBSERVED] Proof chain has 132 entries: 88 cli, 19 website, 25 null — null entries must render without the surface label
- [OBSERVED] `reading-a-proof.mdx` hero grid is a hardcoded 3x2 `display:grid` layout (line 27) — adding a 7th cell would break the visual. Surface must be a sentence after the grid, not a grid cell
- [OBSERVED] `--surface` flag exists on `proof health` and `proof audit` in `src/commands/proof.ts` — shipped in stage 3 (surface-awareness-bridge)

### Test Infrastructure

- Website test suite is a separate in-flight work item (`website-test-suite`, ready to merge). This scope produces prose and small type/component changes — the website build (`pnpm build` in `website/`) is the primary verification that nothing breaks.

## For AnaPlan

### Structural Analog

`website/scripts/extract-docs-data.ts` line 188-209 — the proof entry mapping block. Every field follows the same `fieldName: entry.field_name || default` pattern. Surface addition is one line in this block.

For the component changes, `ProofHero.tsx` line 88 (`<span><b>shipped</b> {formatDate(entry.completedAt)}</span>`) is the structural analog for the surface label — same element, same styling, conditional wrapper.

### Relevant Code Paths

- `website/lib/docs-data/types.ts:31-56` — ProofEntry interface, add `surface` after `completedAt`
- `website/scripts/extract-docs-data.ts:188-209` — mapped entry assembly, add `surface: entry.surface || null`
- `website/components/docs/proof/ProofHero.tsx:51-89` — metadata flex row, add surface span after shipped span
- `website/components/docs/proof/ProofExplorer.tsx:231-265` — row cell with inline badges, add surface badge
- `website/content/docs/start.mdx:43-45` — commands callout to simplify
- `website/content/docs/start.mdx` — between Step 3 heading (line 63) and first code block (line 68), add external services callout
- `website/content/docs/guides/troubleshooting.mdx:73-79` — "Tests fail" card to rewrite
- `website/content/docs/guides/troubleshooting.mdx:139-146` — best practices section, add two bullets
- `README.md:155-191` — commands tables, add `config delete` row
- `README.md:86-96` — init section, add monorepo sentence
- `website/content/docs/guides/reading-a-proof.mdx:52-54` — after hero grid, add surface sentence
- `website/content/docs/guides/using-ana-learn.mdx` — brief `--surface` mention, one line
- `website/content/docs/guides/configurability.mdx:12-33` — settings grid area, add `config delete` and per-surface override

### Patterns to Follow

- `ProofHero.tsx` line 88 — the `<span><b>label</b> value</span>` pattern for metadata items
- `ProofExplorer.tsx` lines 244-250 — the inline badge styling (10px mono, hairline border, `var(--ink-60)`)
- `troubleshooting.mdx` TroubleCard pattern — title, one-line mental model, numbered list, optional note
- `start.mdx` Callout pattern — `<Callout variant="note">` with bold lead text

### Known Gotchas

- The `reading-a-proof.mdx` hero grid is a hardcoded 3-column CSS grid. Do NOT add a 7th grid cell — add a prose sentence after the grid closes.
- The troubleshooting "Tests fail" card item 5 should cross-reference the existing monorepo card, not repeat override syntax. Use "See the monorepo troubleshooting card above" rather than quoting the exact card title.
- The quickstart's existing "start small" guidance at line 65 must not be duplicated. The REQ's proposed copy for this was rejected — line 65 already covers it.
- ProofExplorer rows are clickable (`onClick` navigates to detail page). The surface badge must not interfere with row click behavior — it's a display element, not interactive.

### Things to Investigate

- The `configurability.mdx` settings grid uses a 2-column CSS grid layout. Determine whether `config delete` is better as a 5th card in the grid or as a sentence after the grid. A sentence is probably lighter weight and avoids an odd-numbered grid.
