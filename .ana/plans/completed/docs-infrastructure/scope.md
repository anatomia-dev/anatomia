# Scope: Docs Infrastructure — Fumadocs MDX Pipeline

**Created by:** Ana
**Date:** 2026-05-12

## Intent
Stand up the Fumadocs MDX pipeline inside the existing Next.js 16 website so that one test page renders at `/docs`. This is the foundation for the entire anaDocs production site — 37 routes, 78+ proof pages, 6 guides, 7 concept pages. Nothing renders until this infrastructure works. The old quickstart-style `/docs` page is replaced.

## Complexity Assessment
- **Kind:** feature
- **Size:** small — well-defined dependencies, clear deliverables, no ambiguity in what "done" means
- **Files affected:**
  - `website/package.json` (add deps)
  - `website/source.config.ts` (new)
  - `website/lib/source.ts` (new)
  - `website/next.config.ts` (modify — wrap with createMDX)
  - `website/tsconfig.json` (modify — add collections path alias)
  - `website/.gitignore` (modify — add .source/, data/docs/)
  - `website/app/docs/layout.tsx` (new)
  - `website/app/docs/[[...slug]]/page.tsx` (new)
  - `website/content/docs/index.mdx` (new)
  - `website/app/(marketing)/docs/page.tsx` (delete)
  - `website/components/docs/DocsHero.tsx` (delete)
  - `website/components/docs/DocsNext.tsx` (delete)
  - `website/components/docs/DocsRecap.tsx` (delete)
  - `website/components/docs/DocsSteps.tsx` (delete)
- **Blast radius:** The marketing site must remain unaffected. Root layout (fonts, theme bootstrap, analytics) is shared. The `(marketing)/` route group is untouched except for the `/docs` page deletion. Sitemap already references `/docs` — that resolves correctly once the new route exists.
- **Estimated effort:** 2-4 hours
- **Multi-phase:** no

## Approach
Install Fumadocs core infrastructure (no UI package), configure the MDX compilation pipeline, create a minimal docs layout that proves the catch-all route works, and delete the old quickstart docs page. The layout is deliberately skeletal — just enough to validate MDX renders. The full shell (navbar, sidebar, right rail) is Scope 3.

The page tree transformer in `lib/source.ts` includes the Reference and Proof Chain section structure now (it's Source API configuration, not component code). The injected entries will be dead links until Scopes 3 and 5, but this validates the transformer API works and keeps Source API config in one place.

## Acceptance Criteria
- AC1: `pnpm build` succeeds in the website package with fumadocs-mdx and fumadocs-core installed
- AC2: `/docs` renders the test MDX page with content visible in the browser
- AC3: The catch-all route `app/docs/[[...slug]]/page.tsx` resolves MDX files from `content/docs/`
- AC4: Frontmatter validation works — a test page with valid frontmatter compiles; the Zod schema enforces `title` and `description` as required fields
- AC5: `next.config.ts` preserves existing `viewTransition` experimental flag and all security headers
- AC6: The old `/docs` quickstart page (`app/(marketing)/docs/page.tsx`) and its 4 components are deleted
- AC7: Marketing site pages (`/`, `/about`, `/cli`, `/changelog`, `/contact`) render correctly — no regressions
- AC8: `.source/` directory is gitignored (Fumadocs auto-generated output)
- AC9: `data/docs/` directory is gitignored (future build artifact from Scope 2)
- AC10: `tsconfig.json` includes `collections/*` path alias for Fumadocs code generation imports

## Edge Cases & Risks
- **createMDX wrapper composition:** `createMDX()` returns a function that wraps the Next config. Must preserve the existing `headers()` async function and `viewTransition` experimental flag. The blueprint shows `withMDX(nextConfig)` — straightforward, but test that headers still appear in build output.
- **Route conflict:** `app/docs/` is a real directory, not a route group. `app/(marketing)/docs/page.tsx` currently serves `/docs`. Deleting the marketing docs page MUST happen in the same scope — both cannot coexist. Next.js would throw a route conflict at build time.
- **postinstall timing:** `fumadocs-mdx` needs a postinstall step to generate `.source/` from `content/docs/` + `source.config.ts`. If the postinstall runs before `content/docs/` exists, it may error. Plan should verify the failure mode and sequencing.
- **Zod peer dependency:** `fumadocs-core` peers on `zod 4.x.x`. The CLI package has zod 4.3.6 but the website doesn't. Must add zod to the website's dependencies. pnpm workspace hoisting might resolve it, but explicit is better.
- **Empty `(app)` route group:** An empty `(app)/` route group exists with just a README. No conflict with `app/docs/`, but Plan should be aware of it.

## Rejected Approaches
- **Full shell in Scope 1:** Building the real navbar/sidebar/right-rail here would mix infrastructure validation with component design. The handoff explicitly separates these (Scope 1 = infrastructure, Scope 3 = shell). A minimal layout proves the pipeline works without introducing component dependencies.
- **Deferring page tree transformer:** Could add Reference and Proof Chain sections to the page tree in Scope 3 or 5 instead. Rejected because the transformer is Source API configuration that belongs with `lib/source.ts`, and validating it now catches integration issues early.
- **fumadocs-ui:** Locked decision — no fumadocs-ui. The docs site has highly custom components (pipeline diagrams, proof explorers, Gantt charts). fumadocs-ui's `DocsLayout` would fight the custom layout. Core gives infrastructure for free, UI gives opinions we don't want.
- **Plain @next/mdx:** Would require building sidebar generation, TOC extraction, search infrastructure, breadcrumbs, and frontmatter validation from scratch. Estimated 40-80 hours of infrastructure work. Fumadocs core provides all of this.

## Open Questions
- **fumadocs-mdx postinstall invocation:** What's the exact command? `fumadocs-mdx` CLI? A `postinstall` script entry? Plan should verify by checking fumadocs-mdx docs or source. This is a factual lookup, not a design question.

## Exploration Findings

### Patterns Discovered
- `website/next.config.ts` (lines 1-44): Clean config with `viewTransition` experimental flag and security headers via `async headers()`. No existing wrappers — createMDX will be the first.
- `website/app/layout.tsx` (lines 1-67): Root layout provides Geist fonts, Geist Mono, Fraunces, theme bootstrap script, analytics. All shared with docs via layout nesting.
- `website/app/(marketing)/layout.tsx` (lines 1-18): Simple Nav + Footer wrapper. Docs will NOT use this — `app/docs/layout.tsx` is a separate layout.
- `website/tsconfig.json`: Uses `@/*` path alias. Needs `collections/*` added for Fumadocs imports.

### Constraints Discovered
- [TYPE-VERIFIED] Next.js 16.2.5 (package.json) — fumadocs-core peers on `next: "16.x.x"` ✓
- [TYPE-VERIFIED] React 19.2.4 (package.json) — fumadocs-core peers on `react: "^19.2.0"` ✓
- [TYPE-VERIFIED] Tailwind v4 (package.json) — no fumadocs-ui means no @fumadocs/tailwind peer dep concern
- [OBSERVED] zod not installed in website — must add for fumadocs-core frontmatter schema
- [OBSERVED] `(app)` route group exists with only README — no conflict but noteworthy
- [OBSERVED] fumadocs-mdx peers on `fumadocs-core: "^16.7.0"` — version alignment confirmed

### Test Infrastructure
- `website/scripts/smoke-test.sh` exists — Plan should check if it needs updating after the docs page change
- No docs-specific tests exist yet — Scope 1's verification is `pnpm build` success + route rendering

## For AnaPlan

### Structural Analog
`website/app/(marketing)/layout.tsx` — the simplest layout wrapper in the codebase. The docs layout follows the same pattern (wrap children) but without Nav/Footer. Also reference the root layout for font/theme inheritance.

### Relevant Code Paths
- `website/next.config.ts` — must be modified to wrap with createMDX
- `website/tsconfig.json` — must add collections path alias
- `website/package.json` — dependency additions and postinstall script
- `website/.gitignore` — additions for .source/ and data/docs/
- `website/app/(marketing)/docs/page.tsx` — delete (the old quickstart)
- `website/components/docs/` — delete all 4 files (DocsHero, DocsSteps, DocsRecap, DocsNext)
- `website/app/layout.tsx` — read-only reference for shared root layout

### Patterns to Follow
- `website/app/(marketing)/layout.tsx` for layout structure
- `website/next.config.ts` for config composition style (clean, typed, minimal)

### Known Gotchas
- Route conflict if both `(marketing)/docs/page.tsx` and `app/docs/` exist — delete must be in the same build
- pnpm workspace hoisting may or may not resolve zod — add explicitly to website/package.json
- fumadocs-mdx `.source/` generation must run after content files exist

### Things to Investigate
- The exact fumadocs-mdx postinstall command and whether it needs a `source.config.ts` to exist first
- Whether `createMDX()` accepts the existing config shape or needs adaptation (the `headers()` async function specifically)
