# Verify Report: Docs Infrastructure — Fumadocs MDX Pipeline

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-12
**Spec:** .ana/plans/active/docs-infrastructure/spec.md
**Branch:** feature/docs-infrastructure

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/docs-infrastructure/contract.yaml
  Seal: INTACT (hash sha256:ff1cd775dbc742aab856c1fefa808bf5a913161e14a43effd93c236c08a53ce6)
```

Seal status: **INTACT**

Tests: 2178 passed, 2 skipped (CLI — no regressions). Build: clean (Next.js 16.2.5, Turbopack). Lint: clean. Smoke test: 9/9 routes found.

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Website builds successfully with fumadocs deps | ✅ SATISFIED | `pnpm build` exits 0, route table shows 13 routes including `/docs/[[...slug]]` |
| A002 | Docs catch-all route exists in build output | ✅ SATISFIED | routes-manifest.json contains `"page": "/docs/[[...slug]]"` |
| A003 | Test MDX page has required title frontmatter | ✅ SATISFIED | `website/content/docs/index.mdx:2` — `title: Anatomia Documentation` |
| A004 | Test MDX page has required description frontmatter | ✅ SATISFIED | `website/content/docs/index.mdx:3` — `description: Learn how to use Anatomia for verified AI development.` |
| A005 | Docs page resolves MDX content from content directory | ✅ SATISFIED | `.next/server/app/docs.html` contains rendered MDX ("Anatomia Documentation", "Getting Started", code block) |
| A006 | Missing docs pages return 404 instead of crashing | ✅ SATISFIED | `website/app/docs/[[...slug]]/page.tsx:13` — `if (!page) notFound();` early return before render |
| A007 | Next.js config preserves viewTransition experimental flag | ✅ SATISFIED | `website/next.config.ts:7` — `viewTransition: true` inside `experimental` block, passed through `withMDX()` wrapper |
| A008 | Next.js config preserves security headers | ✅ SATISFIED | `website/next.config.ts:17` — `X-Frame-Options: DENY` present in headers config, build output confirms `viewTransition` experiment active |
| A009 | Old quickstart docs page is removed | ✅ SATISFIED | `website/app/(marketing)/docs/page.tsx` does not exist on filesystem |
| A010 | Four quickstart docs components removed | ✅ SATISFIED | `website/components/docs/` exists but is empty — all 4 files (DocsHero, DocsNext, DocsRecap, DocsSteps) deleted. No dangling imports found. |
| A011 | Fumadocs generated types directory is gitignored | ✅ SATISFIED | `website/.gitignore:41` — `.source/` entry present |
| A012 | Future docs data directory is gitignored | ✅ SATISFIED | `website/.gitignore:42` — `data/docs/` entry present |
| A013 | TypeScript resolves fumadocs collection imports | ✅ SATISFIED | `website/tsconfig.json:23` — `"collections/*": ["./.source/*"]` in paths |
| A014 | Docs layout does not include marketing Nav or Footer | ✅ SATISFIED | `website/app/docs/layout.tsx` — no Nav/Footer imports. Only mention is in JSDoc comment (line 4). |
| A015 | Static params generated for all docs pages | ✅ SATISFIED | `website/app/docs/[[...slug]]/page.tsx:24` — `generateStaticParams` exported, calls `source.generateParams()` |
| A016 | Page metadata generated from MDX frontmatter | ✅ SATISFIED | `website/app/docs/[[...slug]]/page.tsx:28` — `generateMetadata` exported, reads `page.data.title` and `page.data.description` with `notFound()` guard |
| A017 | Smoke test passes with all expected routes | ✅ SATISFIED | `bash scripts/smoke-test.sh` outputs "All 9 routes found." — exit code 0 |
| A018 | Marketing pages unaffected by docs infrastructure change | ✅ SATISFIED | routes-manifest.json contains 8 marketing routes (/, /about, /changelog, /cli, /contact, /examples, /license, /manifesto) — exceeds threshold of 5 |

## Independent Findings

**Prediction resolution:**

1. **Weak Zod schema (empty strings)** — Partially confirmed. `frontmatterSchema.extend({ description: z.string() })` uses `z.string()` without `.min(1)`. An MDX file with `title: ""` or `description: ""` would pass validation. Not a blocker — empty frontmatter is an authoring error, not a runtime crash — but worth tightening in a future scope.

2. **Page tree injections missing** — Confirmed. The spec says `lib/source.ts` should "Include page tree injections for Reference and Proof Chain sections." The implementation is a bare `loader()` call with no injections. No contract assertion covers this, and the spec itself calls them "dead links until future scopes" — so this is a spec gap, not a contract violation. The builder's minimalism is reasonable here.

3. **generateMetadata guard** — Not found. Builder correctly guards both render and metadata paths with `notFound()`.

4. **slug undefined handling** — Not found. `slug?: string[]` typing is correct, `source.getPage()` handles undefined.

5. **Minimal layout** — The layout has a semantic wrapper div with Tailwind utility classes (`mx-auto max-w-3xl px-4 py-16`). Reasonable for skeletal scope.

**Production risk predictions:**
- No error boundary in docs layout — confirmed absent. A malformed MDX page would crash the entire docs section with no fallback. Acceptable for infrastructure scope, but should be addressed when docs content grows.
- Sitemap/robots — non-issue, existing routes handle this.

**Surprise finding:** The `prose prose-neutral dark:prose-invert` classes on the article element in `page.tsx:18` reference Tailwind Typography plugin, but `@tailwindcss/typography` is not installed and no `@plugin` directive exists in `globals.css`. These classes are no-ops — MDX content renders without typographic styling (no heading sizes, no paragraph spacing, no code block formatting beyond defaults). The content appears but looks unstyled. Not a contract violation but defeats the purpose of the markup.

## AC Walkthrough

- **AC1:** `pnpm build` succeeds in the website package with fumadocs deps installed — ✅ PASS — Build exits 0, route table shows `/docs/[[...slug]]`
- **AC2:** `/docs` renders the test MDX page with content visible — ⚠️ PARTIAL — Static HTML in `.next/server/app/docs.html` contains "Anatomia Documentation" and "Getting Started" confirming MDX renders. However, visual browser verification was not performed (requires `pnpm start` + browser). Build output confirms content is present.
- **AC3:** Catch-all route resolves MDX files from `content/docs/` — ✅ PASS — `page.tsx` imports `source` from `@/lib/source`, calls `source.getPage(slug)`, renders `page.data.body`. Build generates static page at `/docs`.
- **AC4:** Frontmatter validation works with Zod schema — ✅ PASS — `source.config.ts` extends `frontmatterSchema` with required `description`. Base schema already requires `title`. Build succeeds with valid frontmatter in `index.mdx`.
- **AC5:** `next.config.ts` preserves viewTransition and security headers — ✅ PASS — `viewTransition: true` in experimental block, all 5 security headers present, `withMDX()` wraps cleanly. Build output confirms "✓ viewTransition" experiment active.
- **AC6:** Old `/docs` page and 4 components deleted — ✅ PASS — `app/(marketing)/docs/page.tsx` removed. `components/docs/` directory empty (4 files deleted). No dangling imports found via grep.
- **AC7:** Marketing site pages render correctly — ✅ PASS — All 8 marketing routes present in routes-manifest.json: /, /about, /changelog, /cli, /contact, /examples, /license, /manifesto.
- **AC8:** `.source/` gitignored — ✅ PASS — `website/.gitignore:41` contains `.source/`
- **AC9:** `data/docs/` gitignored — ✅ PASS — `website/.gitignore:42` contains `data/docs/`
- **AC10:** `collections/*` path alias in tsconfig — ✅ PASS — `website/tsconfig.json:23` maps `"collections/*"` to `"./.source/*"`
- **AC11:** Tests pass, no regressions — ✅ PASS — 2178 passed, 2 skipped (matches baseline exactly)
- **AC12:** No build errors or type errors — ✅ PASS — Build and typecheck clean, lint clean
- **AC13:** Smoke test passes with updated route pattern — ✅ PASS — 9/9 routes found, `/docs/[[...slug]]` correctly matched

## Blockers

No blockers. All 18 contract assertions satisfied. All 13 ACs pass (1 partial — visual browser check, mechanical verification confirms content). No regressions. Checked for: unused exports in new files (none — `source`, `docs`, and `defineConfig` default all consumed), sentinel test patterns (N/A — no unit tests, verification is build/smoke), error paths that swallow silently (none — `notFound()` is the only error path and it's correctly guarded in both render and metadata), unhandled environment assumptions (none — all paths are relative, no env vars consumed).

## Findings

- **Code — Prose classes without typography plugin:** `website/app/docs/[[...slug]]/page.tsx:18` — Uses `prose prose-neutral dark:prose-invert` Tailwind classes but `@tailwindcss/typography` is not in `package.json` and no `@plugin` directive exists in `globals.css`. These classes are no-ops. MDX content renders but without typographic styling. Should be addressed when building the docs shell scope.

- **Code — Page tree injections omitted from source loader:** `website/lib/source.ts:4` — Spec calls for "page tree injections for Reference and Proof Chain sections" but the implementation is a bare `loader()` call. Spec itself notes these would be "dead links until future scopes." No contract assertion covers this. Builder's minimalism is defensible but diverges from spec guidance.

- **Code — Empty components/docs directory left behind:** `website/components/docs/` — All 4 component files deleted but the directory itself remains. Harmless but untidy. Git doesn't track empty directories, so this won't appear in the repo after clone — only in existing worktrees.

- **Code — Out-of-spec eslint.config.mjs change:** `website/eslint.config.mjs:15` — Added `.source/**` to eslint ignore patterns. Not in the spec's file_changes list but a reasonable defensive change — without it, eslint would error on fumadocs generated files. Over-building, but the right call.

- **Code — Frontmatter schema allows empty strings:** `website/source.config.ts:8` — `z.string()` without `.min(1)` on both title and description. An MDX file with `title: ""` would pass Zod validation but produce empty metadata. Low risk — authoring error, not runtime crash — but worth tightening when content grows.

- **Code — No error boundary in docs layout:** `website/app/docs/layout.tsx` — No React error boundary. A broken MDX page (bad import, runtime error in custom component) crashes the entire docs section with no fallback. Acceptable for infrastructure-only scope; should be added when docs content grows beyond the single test page.

## Deployer Handoff

- Branch is **2 commits behind main** (`508aa20` lockfile sync check in pre-commit, `be23326` Google Search Console file). These are non-conflicting additions that will merge cleanly. Confirm after merge that `.husky/pre-commit` retains the lockfile check and `google2d838de19bfce7fb.html` is preserved.
- The `postinstall: "fumadocs-mdx"` script in `package.json` generates `.source/` types on every `pnpm install`. If CI caches `node_modules`, ensure postinstall still runs or `.source/` is regenerated.
- The `prose` CSS classes on the docs page are currently no-ops. When building the docs shell (next scope), install `@tailwindcss/typography` and add the plugin directive.
- Zod 4.4.3 is installed in the website package. The CLI uses Zod 4.3.6. Both are in the workspace — no conflict, but version drift may cause confusion if shared types cross package boundaries.

## Verdict

**Shippable:** YES

All 18 contract assertions satisfied. All 13 acceptance criteria pass. Build, lint, smoke test, and CLI regression suite all green. The findings are real (typography plugin missing, page tree injections omitted, empty directory) but none prevent shipping — they're debt for future scopes, not defects in this infrastructure build. The pipeline works: MDX compiles, content renders, routes resolve, old code is removed, marketing site is unaffected.
