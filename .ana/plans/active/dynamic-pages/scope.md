# Scope: Dynamic Pages

**Created by:** Ana
**Date:** 2026-05-13

## Intent

Build all data-driven pages for the anaDocs production site — the reference section (CLI commands, agent templates, skill files, context files) and the proof chain section (explorer with filters/sorting, detail pages for all 89+ proofs). These are the product's signature pages: the proof chain is the "show, don't tell" that no competitor has.

The extraction pipeline must be extended first. The current `ProofEntry` type has summary counts only (assertionCount, findingCount). Proof detail pages need the full arrays — assertions with id/says/status, findings with severity/location/action, timing breakdowns, artifact hashes. All 89 entries in `proof_chain.json` have this data; the extraction script just doesn't pull it yet.

Three prerequisite fixes ship with this scope: word boundary regex bug (D7), transformer URL mismatch (D14), and the extraction pipeline extension.

## Complexity Assessment
- **Kind:** feature
- **Size:** large — 10 new components, extraction pipeline extension, ~28 new routes, two prerequisite fixes
- **Files affected:**
  - `website/scripts/extract-docs-data.ts` (extraction extension)
  - `website/lib/docs-data/types.ts` (type extensions)
  - `website/lib/docs-data/proofs.ts` (new loader functions)
  - `website/lib/docs-data/skills.ts` (extend for conditional/rules/content)
  - `website/lib/docs-data/agents.ts` (extend for role field)
  - `website/lib/source.ts` (fix transformer URLs)
  - `website/app/docs/reference/cli/page.tsx` (new)
  - `website/app/docs/reference/agents/page.tsx` (new)
  - `website/app/docs/reference/agents/[name]/page.tsx` (new)
  - `website/app/docs/reference/skills/page.tsx` (new)
  - `website/app/docs/reference/skills/[name]/page.tsx` (new)
  - `website/app/docs/reference/context/page.tsx` (new)
  - `website/app/docs/proof/page.tsx` (new)
  - `website/app/docs/proof/[slug]/page.tsx` (new)
  - `website/components/docs/reference/ReferenceGrid.tsx` (new)
  - `website/components/docs/reference/AgentCard.tsx` (new)
  - `website/components/docs/reference/SkillCard.tsx` (new)
  - `website/components/docs/reference/CommandGroup.tsx` (new)
  - `website/components/docs/proof/ProofExplorer.tsx` (new, client component)
  - `website/components/docs/proof/ProofHero.tsx` (new)
  - `website/components/docs/proof/PipelineGantt.tsx` (new)
  - `website/components/docs/proof/AssertionLedger.tsx` (new)
  - `website/components/docs/proof/FindingsList.tsx` (new)
  - `website/components/docs/proof/IntegritySeal.tsx` (new)
  - `website/components/docs/layout/RightRail.tsx` (extend with variant prop)
  - `website/app/docs/docs.css` (new hover states, responsive rules, explorer styles)
- **Blast radius:** Extraction script changes affect all downstream data consumers. Transformer URL fix changes sidebar links. RightRail variant prop is additive — no existing behavior changes.
- **Estimated effort:** ~4-6 hours across two pipeline phases
- **Multi-phase:** yes — Phase 1: data pipeline extension + reference pages. Phase 2: proof explorer + proof detail pages.

## Approach

Two phases, data-first.

**Phase 1** extends the extraction pipeline to pull full proof detail data (assertions array, findings array, timing breakdown, hashes, severity counts, adjacent proof slugs) and adds the missing fields to skill templates (conditional, rules count, content) and agent templates (role). Then builds all four reference page routes — CLI commands, agent templates index + 6 detail pages, skill files index + 8 detail pages, context files reference. Also fixes the two prerequisites: word boundary regex (D7) and transformer URLs (D14).

**Phase 2** builds the proof explorer (client component with filter chips and column sorting) and all proof detail pages (generateStaticParams for 89+ proofs with full assertion ledger, finding cards, Gantt chart, integrity seal, and adjacent proof navigation). The explorer hides the right rail and uses full-width content. Detail pages show a RightRail variant with placeholder proof-specific links.

This separation means Verify catches data shape issues before any proof UI is built on top of them. The proof explorer is the most complex client component on the site — filter state, sort state, 15 chips, 7 columns, mobile horizontal scroll. Building it on a verified data foundation prevents the "wrong shape, rebuild everything" failure mode.

## Acceptance Criteria

### Phase 1
- AC1: Word boundary regex fix — proof categorization keyword patterns in `extract-docs-data.ts` use `\b` word boundaries. "scannable" no longer matches the "scan" keyword.
- AC2: Transformer URLs in `source.ts` match the blueprint: `/docs/reference/cli`, `/docs/reference/agents`, `/docs/reference/skills`, `/docs/reference/context`.
- AC3: `ProofEntry` type extended with: `assertions` array (id, says, status), `findings` array (severity, file, summary, suggestedAction, status), `timing` object (think, plan, build, verify, totalMinutes), `hashes` object, `findingSeverity` object (risk, debt, observation), `duration` (totalMinutes), `prevSlug`, `nextSlug`.
- AC4: `SkillTemplate` type extended with `conditional` (boolean), `rules` (number), `content` (full markdown body).
- AC5: AgentTemplate type extended with `role` field.
- AC6: Extraction script produces the extended data for all proof entries. Findings without a `severity` field default to `"observation"`.
- AC7: `prevSlug` and `nextSlug` are pre-computed in the extraction script based on chronological sort order. First entry has `prevSlug: null`, last has `nextSlug: null`.
- AC8: CLI reference page renders at `/docs/reference/cli` from `commands.json`. All command groups display with name, args, description, and flags.
- AC9: Agent templates index renders at `/docs/reference/agents` with cards split into Pipeline agents and System agents sections.
- AC10: Agent detail pages render at `/docs/reference/agents/{name}` for all 6 agents with reads/writes/forbidden table and full template markdown.
- AC11: Skill files index renders at `/docs/reference/skills` with cards split into Core skills and Conditional skills sections.
- AC12: Skill detail pages render at `/docs/reference/skills/{name}` for all 8 skills with full SKILL.md content.
- AC13: Context files reference renders at `/docs/reference/context` with all 4 context files showing path, description, and content.
- AC14: All reference pages use the `docs-content-area` class on their content container.
- AC15: All reference pages render their own RightRail with appropriate TOC entries.
- AC16: `pnpm build` succeeds with all new routes.
- AC17: Reference card grids have className props for CSS targeting. Responsive collapse rules added to `docs.css`: ≤1180px adjusts grid columns, ≤880px stacks to single column.

**CRITICAL contract rule:** Assertions must NEVER pin to specific counts that grow. Use `greater 0` or `exists` matchers for any value derived from growing data (proof count, command count, finding count, assertion total). Never `equals N`. This exact mistake happened in Scope 2 — A002 said "proof count equals 87" and was stale before Build ran.

### Phase 2
- AC18: Proof explorer renders at `/docs/proof` as a client component with filter chips and column sorting.
- AC19: Filter chips computed from proof data — stage categories (All + each category present in data), finding filters (≥5, Any), cycle filters (First-try, Rejected ≥1). Categories are NOT hardcoded.
- AC20: Explorer table has 7 columns: Proof (slug + feature + tags), Stage, Assertions, Findings, Duration, Shipped, Verdict.
- AC21: Column headers for Assertions, Findings, Duration, and Shipped are sortable.
- AC22: Proof explorer page hides the right rail. Content container does NOT use the 120px right padding — either a modifier class (`docs-content-area--full`) or a custom container style removes the gap.
- AC23: Proof detail pages render at `/docs/proof/{slug}` via `generateStaticParams` for all proof entries.
- AC24: Proof detail pages display: ProofHero (slug, feature, scope summary, verdict, score, findings breakdown, duration, rejection cycles, shipped date), PipelineGantt (4-bar timing chart), AssertionLedger (table with id/says/matcher/status, show-all toggle for >8 assertions), FindingsList (finding cards with severity badge, file location, summary, action), IntegritySeal (hash display with audit command).
- AC25: Finding severity badges render: `risk` (red), `debt` (amber), `obs` (gray). Findings without severity display as `obs`.
- AC26: Adjacent proof navigation at bottom of each detail page using pre-computed `prevSlug`/`nextSlug`.
- AC27: RightRail on proof detail pages uses a variant prop showing placeholder links: "View on GitHub" (links to `.ana/plans/completed/{slug}/`), "Download artifacts" (placeholder), "Open in Claude" (placeholder).
- AC28: Proof explorer mobile: horizontal scroll on the table with sticky first column (Proof). Works at ≤880px without truncation.
- AC29: All proof components have className props for CSS targeting. Responsive rules in `docs.css` for ≤1180px, ≤880px, and ≤640px breakpoints.
- AC30: `pnpm build` succeeds with all proof routes statically generated.
- AC31: Duration formatting: `${Math.floor(m/60)}h ${m%60}m` for >60 minutes, `${m}m` otherwise. Input is `timing.total_minutes` (integer) from proof_chain.json.

## Edge Cases & Risks

- **Growing data counts in contracts.** Any assertion that pins to a specific count (89 proofs, 32 commands, 532 findings) will be stale within days. All count-based assertions must use `greater 0` or range matchers.
- **Findings without severity.** 62 findings across 19 early proof entries lack the `severity` field. The extraction script defaults these to `"observation"`. The finding cards render them with the `obs` badge (gray). No special handling needed in components — the data layer normalizes it.
- **Proof entries without modules_touched.** 11 entries lack this field. They're already handled by keyword fallback in the extraction script. The word boundary fix (AC1) corrects the one miscategorization.
- **Proof entries without rejection_cycles.** 2 early entries lack this field. Default to `0` in the extraction script.
- **SkillTemplate conditional detection.** The extraction script must determine whether a skill is conditional or core. This is derivable from the skill template directory structure or from whether the skill has trigger conditions in the gotcha library. AnaPlan should investigate the cleanest approach.
- **ProofExplorer filter chip count.** The supermock hardcodes 7 stage chips (All, Engine, Pipeline, Templates, CLI, Infra, Website). Production must compute these from the data — if a category has zero entries, the chip still appears (it just filters to zero results). The chip set should match whatever categories the extraction produces.
- **Multi-phase proof entries.** Some proofs have phase-specific hashes (e.g., `build-report-1`, `build-report-2`, `build-report-3` instead of `build-report`). The IntegritySeal component must handle both shapes.
- **Large assertion tables.** Some proofs have 30+ assertions. The AssertionLedger should show the first 8 with a "show all →" toggle, matching the supermock's pattern.
- **Proof explorer table at mobile widths.** 7 columns don't fit on mobile. Horizontal scroll with sticky first column is the chosen pattern. The sticky column needs a left shadow indicator when scrolled.

## Rejected Approaches

**Single phase.** Building all ~28 routes in one spec means data shape bugs propagate to every component before Verify catches them. The extraction extension is foundational — verifying it separately is worth the overhead.

**Summary template for non-featured proofs.** The supermock uses `renderProofSummary` (no assertion ledger, no finding cards) for most proofs and `renderProofDetail` (full data) for 3 featured proofs. Investigation found ALL 89 proofs have full assertion arrays, findings arrays, timing, and hashes in `proof_chain.json`. Building two templates is wasted work. Every proof gets the full detail treatment.

**Reading proof_chain.json directly in page components.** Would skip the extraction pipeline and read the source file at build time. Simpler for proof pages but breaks the architecture: all other data flows through the extraction script → JSON → typed loaders. Consistency matters more than convenience.

**Column hiding on mobile for proof explorer.** Hiding columns loses information the user came to see. Horizontal scroll preserves all data while fitting the viewport.

**Full-width content area for all proof pages.** Considered hiding the right rail on proof detail pages too. Rejected — proof detail pages benefit from a right rail with TOC (5 sections: timeline, assertions, findings, integrity, adjacent) and proof-specific links.

## Open Questions

- **AgentTemplate `role` field.** The supermock renders `a.role` ("The builder") separately from `a.description` (longer text). The current extraction has only `description` which concatenates both. AnaPlan should investigate whether the agent template frontmatter has `role` as a separate field, or whether it needs to be parsed from the description string (the pattern appears to be `{AgentName} — {description}. {role}.`).

## Exploration Findings

### Patterns Discovered
- `proof_chain.json`: `assertions` is a list on all 89 entries (each with `id`, `says`, `status`). NOT named `contract_assertions` as SCOPE_DECOMPOSITION.md suggested.
- `proof_chain.json`: `findings` is a list on all 89 entries (87 non-empty). Keys: `id`, `category`, `summary`, `file`, `severity`, `suggested_action`, `status`, `anchor`, `line`, `related_assertions`, `closed_at`, `closed_by`, `closed_reason`.
- `proof_chain.json`: `timing` has `total_minutes`, `think`, `plan`, `build`, `verify` on all 89 entries.
- `proof_chain.json`: `hashes` exists on all 89 entries. Some have phase-specific keys (`build-report-1`, `build-report-2`).
- `proof_chain.json`: `rejection_cycles` exists on 87/89 entries. 2 early entries lack it (default to 0).
- `proof_chain.json`: `contract` has `total`, `satisfied`, `unsatisfied`, `deviated` on all entries.
- Finding severity distribution: 304 observation, 142 debt, 24 risk, 62 missing (across 19 early entries).
- Current `ProofEntry` type in `types.ts` has `assertionCount` and `findingCount` (numbers). Supermock accesses `entry.assertions.satisfied` and `entry.findings.total` — different shapes that must be normalized.
- Supermock `renderProofDetail` accesses `proof.contract.satisfied` and `proof.findingStats.total` — yet another shape. Production normalizes on one.
- SkillTemplate extraction produces `name`, `description`, `sections[]`. Missing: `conditional`, `rules` (count), `content` (full body).
- AgentTemplate extraction produces `name`, `model`, `description`, `reads`, `writes`, `forbidden`, `bodyMarkdown`. Missing: `role` as separate field.
- Transformer URLs currently: `/docs/reference/cli-commands`, `/docs/reference/agent-templates`, `/docs/reference/skill-files`, `/docs/reference/context-files`.
- Duration formatting alignment: `proof_chain.json` has `timing.total_minutes` (integer). Supermock's `formatDuration(d)` treats input as minutes: `${Math.floor(d/60)}h ${d%60}m` for >60, `${d}m` otherwise. They align — no conversion needed.

### Constraints Discovered
- [TYPE-VERIFIED] ProofEntry fields (website/lib/docs-data/types.ts:6-21) — Summary counts only, no arrays
- [TYPE-VERIFIED] SkillTemplate fields (website/lib/docs-data/types.ts:76-80) — Missing conditional, rules, content
- [OBSERVED] Transformer URLs (website/lib/source.ts:43-46) — Don't match blueprint, must be fixed as prerequisite
- [OBSERVED] Word boundary bug (website/scripts/extract-docs-data.ts) — Keyword fallback uses substring matching, miscategorizes ~1 proof
- [OBSERVED] 62 findings lack severity — Defaults to "observation" in extraction
- [OBSERVED] 2 entries lack rejection_cycles — Defaults to 0 in extraction

### Test Infrastructure
- No existing test files for extraction script or data loaders — these are build-time scripts validated by `pnpm build` succeeding
- Existing component tests: none for docs components (visual validation via Vercel preview)
- Contract assertions are the test surface for this scope

## For AnaPlan

### Structural Analog
`website/app/docs/[...slug]/page.tsx` — the catch-all MDX page. It demonstrates the pattern: import data, render content with `docs-content-area` class, render RightRail alongside content. All reference and proof page routes follow this shape.

For the ProofExplorer client component, there is no structural analog in the codebase — it's the first client component with filter/sort state. The supermock's `renderProofExplorer` (pages.js lines 1317–1410) is the behavioral spec.

### Relevant Code Paths
- `website/scripts/extract-docs-data.ts` — extraction script to extend
- `website/lib/docs-data/types.ts` — type definitions to extend
- `website/lib/docs-data/proofs.ts` — proof loader functions to extend
- `website/lib/docs-data/skills.ts` — skill loader functions
- `website/lib/docs-data/agents.ts` — agent loader functions
- `website/lib/source.ts:38-52` — page tree transformer with URLs to fix
- `website/app/docs/[...slug]/page.tsx` — catch-all pattern to follow
- `website/app/docs/page.tsx` — custom page pattern (overview) to follow
- `website/components/docs/layout/RightRail.tsx` — extend with variant prop
- `website/app/docs/docs.css` — all docs CSS, extend with new component styles
- `.ana/proof_chain.json` — source data for proof entries (89 entries, full arrays)

### Patterns to Follow
- Content area: `docs-content-area` class on content container (see `[...slug]/page.tsx`)
- RightRail: rendered in page.tsx, not layout.tsx (D13 learning)
- Token isolation: all CSS in `docs.css`, scoped under `.docs-layout`, NEVER in `globals.css` (D22)
- Grid components: add `className` prop, use class like `docs-ref-grid` for CSS targeting
- Responsive: three breakpoints (≤1180px, ≤880px, ≤640px) in docs.css
- Static generation: `generateStaticParams` for dynamic routes (`[name]`, `[slug]`)
- Content translation: read supermock render functions VERBATIM — do not author from descriptions

### Supermock Source Locations (CRITICAL)
The supermock is at `/Users/rsmith/Projects/anatomia_project/anatomia_reference/docs-research/supermock/pages.js`. Build MUST read these render functions and translate content verbatim:

| Page | Render function | Lines |
|---|---|---|
| Proof explorer | `renderProofExplorer()` | 1317–1410 |
| Proof summary (UNUSED — all proofs get full detail) | `renderProofSummary()` | 1412–1460 |
| Proof detail | `renderProofDetail()` | 1462–1544 |
| CLI reference | `renderCLIReference()` | 1547–1568 |
| Agent index | `renderAgentIndex()` | 1626–1664 |
| Agent detail | `renderAgentDetail()` | 1666–1700 |
| Skill index | `renderSkillIndex()` | 1703–1739 |
| Skill detail | `renderSkillDetail()` | 1741–1766 |
| Context reference | `renderContextReference()` | 1769–1788 |

Scope 4's hardest lesson: Build without supermock access had to be rebuilt TWICE. 50 visual polish commits followed. The spec must include exact file paths and render function references so Build translates rather than authors.

### Known Gotchas
- `page.data.toc` is only accessible inside page components, not layout — RightRail must render in page.tsx
- Next.js route specificity: `/docs/proof/page.tsx` takes priority over `/docs/[...slug]/page.tsx` automatically
- `generateStaticParams` returns must match the dynamic segment name exactly (`{ name }` for `[name]`, `{ slug }` for `[slug]`)
- Proof explorer is a `'use client'` component — state management for filters and sorting is local React state, not URL params
- The `docs-content-area` class provides 120px right padding. Proof explorer must NOT use this padding when right rail is hidden — use a modifier class or custom container.
- Multi-phase hashes: some proof entries have `build-report-1`, `build-report-2` etc. instead of `build-report`. IntegritySeal must render whatever keys exist.
- Content in JSX blocks, not markdown: reference cards (ref-card), filter chips (fchip), proof hero (proof-hero), Gantt bars (gantt), assertion ledger (assn-tbl), finding cards (fnd), severity badges (fnd-sev), verdict pills (verdict, pass-pill), integrity seal (integ) — all need `<div style={{...}}>` JSX blocks. See Scope 4 guide pages for working examples.
- Existing components to REUSE: Breadcrumb, MetaRow, Callout, CodeBlock, StatsStrip, NextCards, RightRail. See ARCHITECTURE_BLUEPRINT.md "Built components" table for the full 21-component inventory.

### Things to Investigate
- AgentTemplate `role` field: is it a separate frontmatter field, or does it need to be parsed from the description string? Check `packages/cli/templates/.claude/agents/*.md` frontmatter.
- SkillTemplate `conditional` detection: what's the cleanest way to determine core vs conditional? Options: check if the skill directory name appears in gotcha triggers, or check for a `triggers` field in the template, or maintain a static list.
- ProofExplorer: should filter state be stored in URL search params (shareable filtered views) or local state only? The supermock uses local state. URL params would be a small enhancement but adds complexity.
