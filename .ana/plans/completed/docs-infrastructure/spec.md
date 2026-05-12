# Spec: Docs Infrastructure — Fumadocs MDX Pipeline

**Created by:** AnaPlan
**Date:** 2026-05-12
**Scope:** .ana/plans/active/docs-infrastructure/scope.md

## Approach

Install fumadocs-core and fumadocs-mdx (no fumadocs-ui), configure the MDX compilation pipeline, create a catch-all docs route that renders MDX from `content/docs/`, and delete the old quickstart docs page with its 4 components.

The pipeline has three layers:
1. **Source config** (`source.config.ts`) — defines where MDX content lives and the frontmatter Zod schema
2. **Source loader** (`lib/source.ts`) — creates the page tree from compiled MDX, with injected Reference and Proof Chain sections for future scopes
3. **Catch-all route** (`app/docs/[[...slug]]/page.tsx`) — resolves pages from the source loader and renders the MDX body

`createMDX()` wraps the existing Next.js config. It returns a function that takes the config object and adds MDX compilation — the existing `headers()` and `viewTransition` experimental flag pass through unchanged.

The docs layout is deliberately skeletal — a wrapper that renders children without Nav/Footer. The full shell (navbar, sidebar, right rail) is a separate scope.

## Output Mockups

After implementation, visiting `/docs` in the browser renders the test MDX page:

```
Anatomia Documentation

Welcome to the Anatomia documentation. This page validates that the
Fumadocs MDX pipeline is working correctly.

Getting Started

Install Anatomia and run your first scan...
```

The `pnpm build` output in the website package completes without errors, and the route `/docs` appears in the build output route list.

## File Changes

### `website/package.json` (modify)
**What changes:** Add `fumadocs-core`, `fumadocs-mdx`, and `zod` as dependencies. Add `"postinstall": "fumadocs-mdx"` script.
**Pattern to follow:** Existing dependency entries in the same file.
**Why:** fumadocs-core provides Source API and page tree. fumadocs-mdx provides MDX compilation and type generation. zod is a peer dependency of fumadocs-core for frontmatter schema validation. The postinstall script generates `.source/` types on install.

### `website/source.config.ts` (create)
**What changes:** Define the docs collection with `defineDocs()` pointing at `content/docs/`. Define a custom frontmatter schema extending the default with required `title` and `description` fields (both strings, enforced by Zod). Export a default config via `defineConfig()`.
**Pattern to follow:** Fumadocs convention — `defineConfig` + `defineDocs` from `fumadocs-mdx/config`.
**Why:** This is the entry point for the MDX compilation pipeline. Without it, `fumadocs-mdx` postinstall has nothing to generate from.

### `website/lib/source.ts` (create)
**What changes:** Create the source loader using `loader()` from `fumadocs-core/source`. Import the generated docs source from the collections path alias. Set `baseUrl: '/docs'`. Include page tree injections for Reference and Proof Chain sections — these will be dead links until future scopes but validate the transformer API works.
**Pattern to follow:** Fumadocs `loader()` API — `source.getPage()`, `source.getPages()`, `source.generateParams()`.
**Why:** Central source of truth for all docs page resolution. The catch-all route and future sidebar both consume this.

### `website/next.config.ts` (modify)
**What changes:** Import `createMDX` from `fumadocs-mdx/config`. Call `createMDX()` to get the wrapper function. Export `withMDX(nextConfig)` instead of `nextConfig` directly. The existing `nextConfig` object (with `viewTransition` and `headers()`) remains unchanged — it passes through the wrapper.
**Pattern to follow:** The existing file's clean, typed, minimal style. The wrapper is the only structural change.
**Why:** `createMDX` enables MDX compilation in the Next.js build pipeline. Without it, `.mdx` files are not processed.

### `website/tsconfig.json` (modify)
**What changes:** Add `"collections/*": ["./.source/*"]` to the `paths` object alongside the existing `@/*` alias. This lets TypeScript resolve imports from the fumadocs-generated `.source/` directory.
**Pattern to follow:** The existing `@/*` path alias pattern in the same file.
**Why:** fumadocs-mdx generates type definitions into `.source/`. Without this alias, imports from `collections/*` fail with module resolution errors.

### `website/.gitignore` (modify)
**What changes:** Add two entries: `.source/` (fumadocs auto-generated types) and `data/docs/` (future build artifact from Scope 2). Add them in a new `# fumadocs` section after the existing `# next.js` section.
**Pattern to follow:** The existing section-comment style in the file (e.g., `# next.js`, `# production`).
**Why:** `.source/` is regenerated on every install. `data/docs/` will be a build artifact. Neither belongs in version control.

### `website/app/docs/layout.tsx` (create)
**What changes:** Create a minimal layout that wraps children. No Nav, no Footer, no sidebar — just a container div with the children rendered inside. This is the docs layout boundary, separate from the marketing layout.
**Pattern to follow:** `website/app/(marketing)/layout.tsx` — same structural pattern (accept children, wrap in minimal markup) but without the Nav/Footer components.
**Why:** Docs pages must not render inside the marketing layout (no Nav/Footer). The full docs shell is a separate scope.

### `website/app/docs/[[...slug]]/page.tsx` (create)
**What changes:** Create the catch-all page component. Import `source` from `@/lib/source`. In the page component: extract `slug` from params, call `source.getPage(slug)`, return `notFound()` if no page found, otherwise render `page.data.body` as a React component. Export `generateStaticParams` using `source.generateParams()`. Export `generateMetadata` that reads `title` and `description` from `page.data`.
**Pattern to follow:** Fumadocs headless pattern — `source.getPage()` for resolution, `page.data.body` for the MDX component, `page.data.toc` for table of contents (available but not rendered in this skeletal layout).
**Why:** This is the core of the docs infrastructure — the route that resolves MDX content from the file system.

### `website/content/docs/index.mdx` (create)
**What changes:** Create a test MDX page with valid frontmatter (`title` and `description` fields) and basic markdown content. This is the root docs page that renders at `/docs`. Include a heading and a paragraph or two — enough to prove MDX compilation and rendering work.
**Pattern to follow:** Standard MDX with YAML frontmatter.
**Why:** Without at least one content file, the pipeline has nothing to render and build verification is impossible.

### `website/app/(marketing)/docs/page.tsx` (delete)
**What changes:** Delete the old quickstart docs page entirely.
**Why:** Cannot coexist with `app/docs/[[...slug]]/page.tsx` — Next.js throws a route conflict at build time. Both resolve `/docs`.

### `website/components/docs/DocsHero.tsx` (delete)
### `website/components/docs/DocsNext.tsx` (delete)
### `website/components/docs/DocsRecap.tsx` (delete)
### `website/components/docs/DocsSteps.tsx` (delete)
**What changes:** Delete all 4 quickstart docs components.
**Why:** Only consumer is the deleted `(marketing)/docs/page.tsx`. Dead code after deletion.

### `website/scripts/smoke-test.sh` (modify)
**What changes:** Update the `/docs` route check. The catch-all `[[...slug]]` route manifests differently in Next.js routes-manifest.json than a static page — it appears as `/docs/[[...slug]]` instead of `/docs`. Update the grep pattern for this route. All other routes remain unchanged.
**Pattern to follow:** The existing route-checking pattern in the same file.
**Why:** Without this update, the smoke test fails on `/docs` even though the route works correctly.

## Acceptance Criteria

- [ ] AC1: `pnpm build` succeeds in the website package with fumadocs-mdx and fumadocs-core installed
- [ ] AC2: `/docs` renders the test MDX page with content visible in the browser
- [ ] AC3: The catch-all route `app/docs/[[...slug]]/page.tsx` resolves MDX files from `content/docs/`
- [ ] AC4: Frontmatter validation works — a test page with valid frontmatter compiles; the Zod schema enforces `title` and `description` as required fields
- [ ] AC5: `next.config.ts` preserves existing `viewTransition` experimental flag and all security headers
- [ ] AC6: The old `/docs` quickstart page (`app/(marketing)/docs/page.tsx`) and its 4 components are deleted
- [ ] AC7: Marketing site pages (`/`, `/about`, `/cli`, `/changelog`, `/contact`) render correctly — no regressions
- [ ] AC8: `.source/` directory is gitignored (Fumadocs auto-generated output)
- [ ] AC9: `data/docs/` directory is gitignored (future build artifact from Scope 2)
- [ ] AC10: `tsconfig.json` includes `collections/*` path alias for Fumadocs code generation imports
- [ ] AC11: Tests pass with project test command — no regressions
- [ ] AC12: No build errors or type errors
- [ ] AC13: Smoke test passes with updated route pattern

## Testing Strategy

- **Build verification:** `pnpm build` in the website package is the primary test. It validates MDX compilation, route resolution, type checking, and static generation all work together.
- **Smoke test:** The existing `smoke-test.sh` script verifies all expected routes exist in the build manifest. Update it for the catch-all route pattern.
- **Manual verification:** After build, `pnpm start` and visit `/docs` in the browser to confirm rendering. This is a visual check, not automatable in this scope.
- **No new unit tests:** This scope is infrastructure plumbing — config files, route setup, content pipeline. The verification is "does it build and render." Unit testing MDX pipeline internals would test fumadocs, not our code.

## Dependencies

- fumadocs-core (latest 16.x — check npm for exact version at install time)
- fumadocs-mdx (latest 15.x — check npm for exact version at install time)
- zod (^3.x or 4.x — match what fumadocs-core peers on; check the installed fumadocs-core's peer requirements)

## Constraints

- **No fumadocs-ui.** This is a locked decision from scope. Use fumadocs-core only.
- **Marketing site untouched.** The `(marketing)/` route group and all its pages (except the deleted `/docs` page) must remain unchanged.
- **Root layout shared.** Docs pages inherit fonts, theme bootstrap, and analytics from the root layout. The docs layout adds a wrapper, not a replacement.
- **Minimal layout.** No sidebar, no navbar, no right rail in the docs layout. Just enough to prove the pipeline works.

## Gotchas

- **Route conflict is a build-time error.** If both `(marketing)/docs/page.tsx` and `app/docs/[[...slug]]/page.tsx` exist, Next.js fails the build. Delete the old page before or alongside creating the new route — never leave both in place.
- **Postinstall ordering.** `fumadocs-mdx` postinstall needs `source.config.ts` to exist. If you add the dependency before creating the config file, `pnpm install` will run postinstall and may error. Sequence: create `source.config.ts` and `content/docs/index.mdx` first, then run `pnpm install` with the new dependencies. Or: add deps, install, expect postinstall to warn, then create config and run `fumadocs-mdx` manually.
- **Zod version alignment.** Check what version fumadocs-core peers on. The CLI package uses zod 4.3.6 but the website has no zod. Add the correct version to the website's dependencies explicitly — don't rely on workspace hoisting.
- **Catch-all params are arrays.** `params.slug` in `[[...slug]]` is `string[] | undefined`, not `string`. The `source.getPage()` API expects this shape, but if you destructure wrong you'll get type errors.
- **`next.config.ts` stays as `.ts`.** The fumadocs docs sometimes suggest `.mjs` — ignore that. The existing file is `.ts` and Next.js 16 handles TypeScript configs natively.
- **Smoke test manifest format.** The routes-manifest.json uses `"page"` for static routes and `"page"` with bracket syntax for dynamic routes. After switching to catch-all, the `/docs` entry changes shape. Verify the exact format after the first build and adjust the grep pattern.

## Build Brief

### Rules That Apply
- 2-space indentation, TypeScript throughout
- Prefer named exports — except for Next.js page/layout components which require default exports (framework convention overrides project convention)
- `import type` for type-only imports, separate from value imports
- Explicit return types on exported functions (except Next.js page components where the framework infers)
- Early returns over nested conditionals (`if (!page) notFound()` before main render)

### Pattern Extracts

**Marketing layout — structural analog for docs layout** (`website/app/(marketing)/layout.tsx`):
```typescript
import type { ReactNode } from "react";
import { Nav } from "@/components/nav/Nav";
import { Footer } from "@/components/footer/Footer";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      {children}
      <Footer />
    </>
  );
}
```

**Next.js config — file to modify** (`website/next.config.ts`):
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        source: "/fonts/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

**Smoke test route array** (`website/scripts/smoke-test.sh`, lines 19-29):
```bash
ROUTES=(
  "/"
  "/docs"
  "/manifesto"
  "/contact"
  "/changelog"
  "/cli"
  "/examples"
  "/about"
  "/license"
)
```

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands

- After creating `source.config.ts` + `content/docs/index.mdx` + adding deps to `package.json`: `cd website && pnpm install` — Expected: installs successfully, `fumadocs-mdx` postinstall generates `.source/` directory
- After all file changes: `cd website && pnpm build` — Expected: build succeeds with `/docs` route in output
- After build: `cd website && bash scripts/smoke-test.sh` — Expected: all routes found
- Lint: `cd website && pnpm lint`
- Typecheck: `cd website && pnpm typecheck`
- CLI tests (regression): `cd packages/cli && pnpm vitest run` — Expected: 2178 passed, 2 skipped

### Build Baseline
- Current CLI tests: 2178 passed, 2 skipped (100 test files)
- Command used: `cd packages/cli && pnpm vitest run`
- After build: same — no CLI test changes expected
- Website verification: `pnpm build` in website package (no unit tests for website)
- Regression focus: smoke-test.sh (route manifest check)
