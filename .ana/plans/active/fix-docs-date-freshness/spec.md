# Spec: Fix AnaDocs date freshness

**Created by:** AnaPlan
**Date:** 2026-05-22
**Scope:** .ana/plans/active/fix-docs-date-freshness/scope.md

## Approach

Three fixes, all website-only:

1. **CLI reference page** — Replace the hardcoded `"2026-05-22"` date string with `meta.buildTimestamp.slice(0, 10)`. The page already imports `getBuildMeta()` and has `meta` available. Remove the duplication.

2. **Git-derived page dates + staleness warning** — In `extract-docs-data.ts`, add a function that walks `content/docs/`, runs `git log -1 --format=%aI -- {filepath}` for each MDX file, and writes the results to `page-dates.json`. The staleness warning checks these git-derived dates against a 60-day threshold and emits `console.warn` for stale pages. Shallow clone fallback: if `git log` returns empty output, use the current `buildTimestamp` as the date.

3. **Consume git dates in page rendering** — Add a `lib/docs-data/pageDates.ts` module that reads `page-dates.json` and exports `getPageDate(slug: string): string | null`. In `[...slug]/page.tsx`, call `getPageDate()` and pass the result to `MetaRow` instead of `page.data.lastReviewed`. Remove `lastReviewed` from all 14 MDX frontmatter files. Update `source.config.ts` to remove `lastReviewed` from the schema (or keep it optional with no consumers — removing is cleaner).

The staleness warning uses git-derived dates (the same data that feeds `page-dates.json`), not frontmatter. This means the warning and the rendered dates are always consistent — both derive from the same git source.

## Output Mockups

### CLI reference page (rendered)
```
Commands · 42    Last reviewed · 2026-05-22
```
(Date now auto-updates on every build.)

### page-dates.json (generated at build time)
```json
{
  "start": "2026-05-16",
  "concepts/artifacts": "2026-05-13",
  "concepts/context": "2026-05-13",
  "guides/configurability": "2026-05-16",
  ...
}
```
Keys are slug paths (matching the `[...slug]` route param joined with `/`). Values are `YYYY-MM-DD` dates derived from git.

### Staleness warning (when stale files exist)
```
  ⚠ Stale docs (last commit > 60 days ago):
    concepts/artifacts.mdx — 74 days
    guides/reading-a-proof.mdx — 65 days
```

### No staleness (all dates within threshold)
```
  ✓ No stale docs
```

## File Changes

### `website/app/docs/reference/cli/page.tsx` (modify)
**What changes:** Replace the hardcoded `"2026-05-22"` string on line 69 with `{meta.buildTimestamp.slice(0, 10)}`.
**Pattern to follow:** Same file already uses `meta.buildTimestamp` in RightRail props (line 79).
**Why:** Without this, the date silently goes stale whenever someone forgets to update it.

### `website/scripts/extract-docs-data.ts` (modify)
**What changes:** Add two things: (1) a function that walks MDX files, runs git log per file, collects dates into a map, and writes `page-dates.json`; (2) a staleness check that warns if any date is older than 60 days. Both are called in `main()` — page dates extraction before the staleness check, staleness check after link validation.
**Pattern to follow:** `validateInternalLinks` (line 962) — standalone function, walks directory, reads files, checks condition, returns results. The caller in `main()` handles output.
**Why:** Git is the single source of truth for "when was this page last touched." This removes manual date maintenance entirely.

### `website/lib/docs-data/pageDates.ts` (create)
**What changes:** New module that reads `page-dates.json` from `data/docs/` and exports `getPageDate(slug: string): string | null`. Follow the exact pattern of `meta.ts` — read JSON, cache, export accessor.
**Pattern to follow:** `website/lib/docs-data/meta.ts` — same structure: const DATA_PATH, cached variable, load function, exported getter.
**Why:** The `[...slug]/page.tsx` needs to read the git-derived date at render time.

### `website/lib/docs-data/index.ts` (modify)
**What changes:** Add export for `getPageDate` from `./pageDates`.
**Pattern to follow:** Existing exports in the file — one line per module.
**Why:** Maintains the barrel export pattern.

### `website/app/docs/[...slug]/page.tsx` (modify)
**What changes:** Import `getPageDate` from `@/lib/docs-data`. Call `getPageDate(slug.join("/"))` and pass the result to `MetaRow` as `lastReviewed` instead of `page.data.lastReviewed`.
**Pattern to follow:** Same file already imports `getBuildMeta` from `@/lib/docs-data/meta` (line 6).
**Why:** Switches the rendered date from frontmatter (manual) to git-derived (automatic).

### `website/source.config.ts` (modify)
**What changes:** Remove `lastReviewed` from the frontmatter schema extension. It's no longer consumed.
**Pattern to follow:** Existing schema — just delete the line.
**Why:** Dead schema fields mislead future developers into thinking frontmatter dates are used.

### 14 MDX files in `website/content/docs/` (modify)
**What changes:** Remove the `lastReviewed: "YYYY-MM-DD"` line from frontmatter in all 14 files.
**Pattern to follow:** Just delete the line. Keep other frontmatter fields intact.
**Why:** Git is now the source of truth. Keeping the field would be misleading.

The 14 files:
- `website/content/docs/start.mdx`
- `website/content/docs/concepts/artifacts.mdx`
- `website/content/docs/concepts/context.mdx`
- `website/content/docs/concepts/contract.mdx`
- `website/content/docs/concepts/findings.mdx`
- `website/content/docs/concepts/pipeline.mdx`
- `website/content/docs/concepts/skills.mdx`
- `website/content/docs/concepts/toolbelt.mdx`
- `website/content/docs/guides/configurability.mdx`
- `website/content/docs/guides/reading-a-proof.mdx`
- `website/content/docs/guides/troubleshooting.mdx`
- `website/content/docs/guides/using-ana-learn.mdx`
- `website/content/docs/guides/using-ana-setup.mdx`
- `website/content/docs/guides/verifying-changes.mdx`

## Acceptance Criteria

- [ ] AC1: The CLI reference page renders "Last reviewed" with a date derived from `buildTimestamp`, not a hardcoded string. No static date string remains in the source.
- [ ] AC2: Running `extract-docs-data.ts` with any MDX page whose git last-commit date is older than 60 days emits a warning to stderr with the file path and age in days.
- [ ] AC3: Running `extract-docs-data.ts` with all git dates within 60 days emits no staleness warnings.
- [ ] AC4: `page-dates.json` is generated in `website/data/docs/` with slug-to-date entries for all MDX files.
- [ ] AC5: All 14 MDX files have `lastReviewed` REMOVED from frontmatter.
- [ ] AC6: The `[...slug]/page.tsx` page renders the git-derived date via `getPageDate()`, not frontmatter.
- [ ] AC7: If git log returns empty (shallow clone), the date falls back to `buildTimestamp.slice(0, 10)`.
- [ ] AC8: The website build succeeds. No test regressions.
- [ ] AC9: MDX files where git log returns no date (e.g., new file not yet committed) use the buildTimestamp fallback gracefully.

## Testing Strategy

- **Unit tests:** Test the `getPageDate()` accessor — mock a `page-dates.json` fixture, verify it returns correct dates for known slugs and null for unknown slugs.
- **Unit tests:** Test the staleness check logic — provide a set of dates with known ages, verify correct warn/no-warn behavior.
- **Integration:** The `extract-docs-data.ts` script runs as `pnpm prebuild` — running the website build verifies integration end-to-end.
- **Edge cases:** MDX file with no git history (fallback), slug not in page-dates.json (returns null), empty git output from shallow clone.

## Dependencies

- Git must be available in the build environment (it is — Vercel and GitHub Actions both have git).
- The MDX files must be tracked in git (they are — all 14 are committed).

## Constraints

- The staleness check must NOT fail the build (`console.warn` only, no `process.exit`).
- The 60-day threshold is a `const`, not configurable via env vars.
- The CLI reference page must not import any new modules — `meta` is already available.
- Git subprocess calls should be synchronous (`execSync`) to match the script's existing synchronous style.
- `page-dates.json` keys must be slug paths that match `slug.join("/")` in the page component (e.g., `"concepts/artifacts"`, not `"concepts/artifacts.mdx"`).

## Gotchas

- `git log -1 --format=%aI -- {filepath}` returns empty string for files with no git history (new uncommitted files, or shallow clones that don't include the file's history). The fallback must handle both empty string and subprocess error.
- `execSync` throws on non-zero exit code. Wrap in try/catch — a git failure for one file shouldn't crash the entire extraction.
- The content directory path is NOT a module-level constant in `extract-docs-data.ts` — each walker constructs it locally. Do the same: `path.join(WEBSITE_DIR, 'content', 'docs')`.
- `WEBSITE_DIR` is `path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')` — it resolves to the website root.
- The slug in `page-dates.json` must NOT include the `.mdx` extension. The `[...slug]` route param is `["concepts", "artifacts"]` which joins to `"concepts/artifacts"`.
- Vercel's default clone depth is 10 commits. For docs that haven't been touched in a while, the last-modified commit may not be in the shallow history. The fallback to `buildTimestamp` handles this — the page shows a reasonable date rather than nothing.
- `source.config.ts` removing `lastReviewed` from the schema: if fumadocs-mdx validates strictly, leftover `lastReviewed` in MDX files that haven't been cleaned would fail validation. Since we're removing it from ALL 14 files, this is fine. But verify fumadocs doesn't error on unknown frontmatter keys in case future MDX files accidentally include it.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports.
- Prefer early returns over nested conditionals.
- Explicit return types on exported functions.
- Named exports only — no default exports.
- In JSX text content, use `&apos;` for apostrophes (lint rule).

### Pattern Extracts

From `website/lib/docs-data/meta.ts` (the exact pattern for the new `pageDates.ts`):
```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { BuildMeta } from './types';

const DATA_PATH = join(process.cwd(), 'data', 'docs', 'build-meta.json');

let cached: BuildMeta | null = null;

function load(): BuildMeta {
  if (!cached) {
    cached = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as BuildMeta;
  }
  return cached;
}

export function getBuildMeta(): BuildMeta {
  return load();
}
```

From `website/scripts/extract-docs-data.ts` lines 1116-1125 (how `main()` calls a validation function):
```typescript
  // Validate internal links
  const brokenLinks = validateInternalLinks(proofEntries, commands, agentTemplates, skillTemplates);
  if (brokenLinks.length > 0) {
    console.error('\n✗ Broken internal links:');
    for (const link of brokenLinks) {
      console.error(`  - ${link}`);
    }
    process.exit(1);
  }
  console.log('  ✓ Internal links validated');
```

From `website/app/docs/[...slug]/page.tsx` lines 109-112 (current MetaRow usage):
```tsx
        <MetaRow
          readingTime={page.data.readingTime}
          lastReviewed={page.data.lastReviewed}
        />
```

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands
- After CLI reference page change: `(cd 'website' && pnpm run build)` — Expected: build succeeds
- After page-dates extraction added: `(cd 'website' && pnpm run prebuild)` — Expected: `page-dates.json` appears in `data/docs/`
- After all changes: `(cd 'website' && pnpm vitest run)` — Expected: 55+ tests pass
- Lint: `(cd 'website' && pnpm run lint)`

### Build Baseline
- Current tests: 55 passed (8 test files)
- Command used: `(cd 'website' && pnpm vitest run)`
- After build: expected 55+ tests (new tests for pageDates accessor and staleness logic)
- Regression focus: `extract-docs-data.ts` script execution during `prebuild`, `[...slug]/page.tsx` rendering
