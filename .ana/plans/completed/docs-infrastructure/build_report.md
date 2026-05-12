# Build Report: Docs Infrastructure — Fumadocs MDX Pipeline

**Created by:** AnaBuild
**Date:** 2026-05-12
**Spec:** .ana/plans/active/docs-infrastructure/spec.md
**Branch:** feature/docs-infrastructure

## What Was Built

- `website/package.json` (modified): Added fumadocs-core ^16.8.10, fumadocs-mdx ^15.0.4, zod ^4.4.3 as dependencies. Added `"postinstall": "fumadocs-mdx"` script.
- `website/source.config.ts` (created): Defines docs collection with `defineDocs()` pointing at `content/docs/`. Extends frontmatter schema to require `description` as a string (default schema has it optional).
- `website/lib/source.ts` (created): Source loader using `loader()` from fumadocs-core with `baseUrl: '/docs'`. Uses `docs.toFumadocsSource()` to bridge fumadocs-mdx collections to the loader API.
- `website/next.config.ts` (modified): Imported `createMDX` from `fumadocs-mdx/next` and wrapped the export with `withMDX(nextConfig)`. Existing config (viewTransition, headers) passes through unchanged.
- `website/tsconfig.json` (modified): Added `"collections/*": ["./.source/*"]` path alias.
- `website/.gitignore` (modified): Added `.source/` and `data/docs/` in a new `# fumadocs` section.
- `website/eslint.config.mjs` (modified): Added `.source/**` to global ignores — auto-generated files fail lint rules.
- `website/app/docs/layout.tsx` (created): Minimal wrapper layout — no Nav, no Footer. Just a container div.
- `website/app/docs/[[...slug]]/page.tsx` (created): Catch-all page with `source.getPage()`, `notFound()` for missing pages, MDX body rendering. Exports `generateStaticParams` and `generateMetadata`.
- `website/content/docs/index.mdx` (created): Test MDX page with title/description frontmatter and basic content.
- `website/app/(marketing)/docs/page.tsx` (deleted): Old quickstart docs page — route conflict with catch-all.
- `website/components/docs/DocsHero.tsx` (deleted): Dead code after page deletion.
- `website/components/docs/DocsNext.tsx` (deleted): Dead code after page deletion.
- `website/components/docs/DocsRecap.tsx` (deleted): Dead code after page deletion.
- `website/components/docs/DocsSteps.tsx` (deleted): Dead code after page deletion.
- `website/scripts/smoke-test.sh` (modified): Changed `/docs` to `/docs/[[...slug]]` in route array. Switched `grep` to `grep -F` (fixed string) to handle brackets.
- `pnpm-lock.yaml` (modified): Updated with new dependencies.

## PR Summary

- Install fumadocs-core + fumadocs-mdx + zod and configure the MDX compilation pipeline with `source.config.ts` and `createMDX()` wrapper
- Create catch-all docs route (`app/docs/[[...slug]]/page.tsx`) that resolves MDX content from `content/docs/`, with static params and metadata generation
- Delete old quickstart docs page and its 4 components (DocsHero, DocsSteps, DocsRecap, DocsNext) to resolve route conflict
- Add skeletal docs layout (no Nav/Footer) as independent layout boundary from marketing pages
- Update smoke test for catch-all route pattern and add `.source/` to gitignore and eslint ignores

## Acceptance Criteria Coverage

- AC1 "`pnpm build` succeeds" → ✅ Build succeeds with 0 errors, 13 static pages generated
- AC2 "`/docs` renders test MDX page" → 🔨 Build output shows `/docs` under `/docs/[[...slug]]` route. Manual browser verification needed.
- AC3 "Catch-all route resolves MDX files" → ✅ `source.getPage(slug)` resolves `content/docs/index.mdx` at build time
- AC4 "Frontmatter validation works" → ✅ `source.config.ts` extends frontmatterSchema with required `description: z.string()`
- AC5 "`next.config.ts` preserves viewTransition and headers" → ✅ Config object unchanged, only wrapped with `withMDX()`
- AC6 "Old docs page and components deleted" → ✅ 5 files deleted
- AC7 "Marketing pages render correctly" → ✅ All marketing routes present in build output (/, /about, /cli, /changelog, /contact, /examples, /license, /manifesto)
- AC8 "`.source/` gitignored" → ✅ Added to `.gitignore`
- AC9 "`data/docs/` gitignored" → ✅ Added to `.gitignore`
- AC10 "`collections/*` path alias" → ✅ Added to `tsconfig.json` paths
- AC11 "Tests pass" → ✅ CLI: 2178 passed, 2 skipped. Website: build + lint + typecheck pass.
- AC12 "No build or type errors" → ✅ `pnpm build` and `tsc --noEmit` both clean
- AC13 "Smoke test passes" → ✅ All 9 routes found

## Implementation Decisions

1. **`createMDX` import path:** Spec said `fumadocs-mdx/config`. Actual export is from `fumadocs-mdx/next`. Fixed to match the actual API.
2. **`defineDocs` schema placement:** Spec said `schema` as top-level option. API requires `docs.schema` with the schema being a Zod object extending `frontmatterSchema`. Used `frontmatterSchema.extend({ description: z.string() })`.
3. **`source` bridging:** The `loader()` API expects a `Source` type, not a raw `DocsCollectionEntry`. Used `docs.toFumadocsSource()` to convert.
4. **eslint.config.mjs:** Not in the spec's file list, but `.source/` generated files fail lint rules (`@ts-nocheck`, empty object types). Added `.source/**` to eslint globalIgnores. Necessary for `pnpm lint` to pass.
5. **grep -F in smoke test:** The `[[...slug]]` brackets caused `grep` to interpret them as regex character classes. Switched to `grep -F` for fixed-string matching.

## Deviations from Contract

### Page tree injections omitted
**Instead:** Source loader created without Reference/Proof Chain page tree injections
**Reason:** The spec references `attachFolder` in the `pageTree` option of `loader()`, but fumadocs-core 16.x `PageTreeOptions` does not include `attachFolder`. The available options are `url`, `idPrefix`, `noRef`, `generateFallback`, `transformers`.
**Outcome:** The source loader works correctly without injections. Future scope can add page tree transformers when the Reference and Proof Chain content exists. Functionally neutral — these were intended as dead links.

## Test Results

### Baseline (before changes)
```
Website: pnpm build → success (13 static pages, /docs as static route)
CLI: pnpm vitest run → 2178 passed, 2 skipped (100 test files)
```

### After Changes
```
Website build:
  ✓ Compiled successfully in 1448ms
  ✓ Generating static pages (13/13) in 432ms
  Route (app)            Revalidate  Expire
  ┌ ○ /                          1m      1y
  ├ ○ /_not-found
  ├ ○ /about                     1m      1y
  ├ ○ /changelog                 1m      1y
  ├ ○ /cli                       1m      1y
  ├ ○ /contact                   1m      1y
  ├ ● /docs/[[...slug]]
  │ └ /docs
  ├ ○ /examples                  1m      1y
  ├ ○ /license                   1m      1y
  ├ ○ /manifesto                 1m      1y
  ├ ○ /robots.txt
  └ ○ /sitemap.xml

Smoke test: All 9 routes found.
Lint: pnpm lint → clean (0 errors)
Typecheck: tsc --noEmit → clean (0 errors)
CLI: 2178 passed, 2 skipped (100 test files)
```

### Comparison
- Tests added: 0 (no unit tests — infrastructure scope, build is the test)
- Tests removed: 0
- Regressions: none

### New Tests Written
None. Per spec: "No new unit tests. This scope is infrastructure plumbing... The verification is 'does it build and render.'"

## Verification Commands
```bash
cd website && pnpm build
cd website && bash scripts/smoke-test.sh
cd website && pnpm lint
cd website && pnpm typecheck
cd packages/cli && pnpm vitest run
```

## Git History
```
e306831 [docs-infrastructure] Update smoke test for catch-all route
99da250 [docs-infrastructure] Remove old quickstart docs page and components
4b252f0 [docs-infrastructure] Add MDX pipeline and docs route
3506d51 [docs-infrastructure] Add fumadocs dependencies and config
```

## Open Issues

1. **Page tree injections not implemented.** The spec calls for Reference and Proof Chain sections in the page tree via `attachFolder`, but this API does not exist in fumadocs-core 16.x. The `pageTree.transformers` API could achieve something similar when content exists. This is a future scope concern, not a current build gap — the injections were explicitly described as dead links.

2. **Vite peer dependency warning.** `fumadocs-mdx 15.0.4` peers on `vite 7.x.x || 8.x.x` but the workspace has `vite 6.4.2` (via vitest). No runtime impact observed — fumadocs-mdx uses vite only for its own build tooling. Monitor on future fumadocs upgrades.

3. **eslint.config.mjs not in spec file list.** Modified to ignore `.source/` generated files. Without this change, `pnpm lint` fails on auto-generated code. The spec didn't anticipate this because `.source/` is gitignored, but eslint still scans it.

4. **Spec references incorrect fumadocs API paths.** `createMDX` is from `fumadocs-mdx/next` not `fumadocs-mdx/config`. `defineDocs` schema goes in `docs.schema` not top-level `schema`. These are spec inaccuracies, not code issues — the implementation uses the correct APIs.

Verified complete by second pass.
