# Scope: Fix AnaDocs date freshness

**Created by:** Ana
**Date:** 2026-05-22

## Intent
Fix stale "Last reviewed" dates across AnaDocs. The CLI reference page hardcodes a date when `buildTimestamp` is already available. MDX content pages have intentionally manual `lastReviewed` dates with no mechanism to notice when they go stale. Reset all 14 MDX dates to today since all content was reviewed during the R5/R6 validation pass.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — 3 changes, all mechanical, no new abstractions
- **Surface:** website
- **Files affected:** `website/app/docs/reference/cli/page.tsx`, `website/scripts/extract-docs-data.ts`, 14 MDX files in `website/content/docs/`
- **Blast radius:** Website only. No CLI, no templates, no generators. No tests assert on `lastReviewed` dates.
- **Estimated effort:** 15–20 minutes build + verify
- **Multi-phase:** no

## Approach
Three independent fixes, all website-only:

1. **CLI reference page:** Replace the hardcoded `2026-05-22` date string with `meta.buildTimestamp.slice(0, 10)`. The page already imports `getBuildMeta()` and uses `meta.buildTimestamp` for RightRail. The inline date is redundant — remove the duplication. After this, the "Last reviewed" date updates automatically on every build.

2. **MDX staleness warning:** Add a build-time check at the end of the `extract-docs-data.ts` `main()` function. Walk `content/docs/`, parse frontmatter with the existing `parseFrontmatter()` helper, check `lastReviewed` against a 60-day threshold. Emit `console.warn` for stale pages. Warning only — does not fail the build. Follows the same structural pattern as `validateInternalLinks` (walk MDX, check a property, report).

3. **Date reset:** Update all 14 MDX files' `lastReviewed` frontmatter to `"2026-05-22"`. Content was verified during R5/R6. This resets the staleness clock so the new warning has a clean baseline.

## Acceptance Criteria
- AC1: The CLI reference page renders "Last reviewed" with a date derived from `buildTimestamp`, not a hardcoded string. No static date string remains in the source.
- AC2: Running `extract-docs-data.ts` with any MDX `lastReviewed` date older than 60 days emits a warning to stderr with the file path and age in days.
- AC3: Running `extract-docs-data.ts` with all dates within 60 days emits no staleness warnings.
- AC4: All 14 MDX files have `lastReviewed: "2026-05-22"` in frontmatter.
- AC5: The website build succeeds. No test regressions.

## Edge Cases & Risks
- An MDX file without `lastReviewed` frontmatter should be silently skipped (not all future MDX files may have it).
- `buildTimestamp` is an ISO string from `new Date().toISOString()` — `.slice(0, 10)` is safe because the format is always `YYYY-MM-DDTHH:MM:SS.sssZ`.
- The 60-day threshold is a constant, not configurable. If the team wants to change it, they edit one line. Not worth env-var complexity.

## Rejected Approaches
- **Automatic MDX dates (git date, build date):** Loses the semantic meaning of "a human reviewed this for accuracy." A typo fix shouldn't reset the review clock.
- **Build failure on stale dates:** Too aggressive. Stale docs are a credibility issue, not a correctness issue. Warning surfaces the problem without blocking deploys.
- **Adding "Last reviewed" to other reference pages (agents, context, skills):** Those pages don't have a metadata bar. Only the CLI reference has the command-count bar where the date lives. Don't add UI elements that don't exist in the design.
- **Shared MDX walker function:** The existing walkers (`scanMdxDir` in search index, `concatMdx` in llms.txt) are embedded in their parent functions with specific return concerns. A dedicated staleness check as a standalone block in `main()` is cleaner than refactoring shared iteration for three callers with different needs.

## Open Questions
None. All verification questions resolved during investigation.

## Exploration Findings

### Patterns Discovered
- `extract-docs-data.ts` main(): extraction → validation → summary. Staleness check fits between validation and summary.
- `parseFrontmatter()` (line 54) returns `{ frontmatter, body }` where frontmatter values are `string | string[] | null`. `lastReviewed` comes back as a string like `"2026-05-13"`.
- `validateInternalLinks` (line 962) is the structural analog: walks MDX, checks a property, reports issues. Uses `process.exit(1)` — staleness check uses `console.warn` instead.

### Constraints Discovered
- [TYPE-VERIFIED] buildTimestamp format (meta.ts + extractBuildMeta) — always `new Date().toISOString()`, safe for `.slice(0, 10)`
- [OBSERVED] No tests on lastReviewed — grep of all `*.test.*` files in website/ found zero references to `lastReviewed`
- [OBSERVED] Exactly 14 MDX files — dates range from 2026-05-13 to 2026-05-17

### Test Infrastructure
- No website tests reference `lastReviewed` dates. `marketing-stats.test.ts` uses `buildTimestamp` fixture data but in an unrelated domain.

## For AnaPlan

### Structural Analog
`validateInternalLinks` in `website/scripts/extract-docs-data.ts` (line 962). Same shape: walks MDX directory, reads files, parses frontmatter, checks a condition, reports results. The staleness check is this pattern with `console.warn` instead of error collection + `process.exit(1)`.

### Relevant Code Paths
- `website/app/docs/reference/cli/page.tsx` — line 17 (`getBuildMeta()`), line 70 (hardcoded date to replace)
- `website/scripts/extract-docs-data.ts` — line 54 (`parseFrontmatter`), line 962 (`validateInternalLinks` as pattern), line 1041 (`main()` where check goes)
- `website/lib/docs-data/meta.ts` — `getBuildMeta()` returns `BuildMeta` with `buildTimestamp: string`
- `website/content/docs/` — all 14 MDX files with `lastReviewed` frontmatter

### Patterns to Follow
- Follow `validateInternalLinks` structure for the staleness check: standalone function, called from `main()`, walks directory, reports
- The CLI reference page's metadata bar (lines 59–71) uses inline styles with `var(--font-mono)` — the fix changes only the date value, not the structure

### Known Gotchas
- `parseFrontmatter()` strips quotes from values, so `lastReviewed: "2026-05-13"` becomes the string `2026-05-13`. `new Date("2026-05-13")` parses this correctly.
- The content directory path is already defined as a local in `scanMdxDir` and `concatMdx` but not as a module-level constant. The staleness check should construct its own path with `path.join(WEBSITE_DIR, 'content', 'docs')` like the others do.

### Things to Investigate
- Whether to place the staleness check before or after `validateInternalLinks` in `main()`. After is natural — link validation is a hard fail, staleness is a soft warn. The summary log at the end stays last.
