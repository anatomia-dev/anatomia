# Spec: Fix AnaDocs date freshness

**Created by:** AnaPlan
**Date:** 2026-05-22
**Scope:** .ana/plans/active/fix-docs-date-freshness/scope.md

## Approach

Three independent fixes, all website-only:

1. **CLI reference page** — Replace the hardcoded date string with `meta.buildTimestamp.slice(0, 10)`. The page already imports `getBuildMeta()` and uses `meta` for RightRail. The inline `"2026-05-22"` is redundant duplication.

2. **Staleness warning** — Add a `checkStaleDocs()` function to `extract-docs-data.ts`, following the same shape as `validateInternalLinks`: standalone function, walks `content/docs/`, parses frontmatter, checks a condition, reports. Called in `main()` after link validation and before completeness validation. Uses `console.warn` (stderr) — never fails the build.

3. **Date reset** — Update all 14 MDX files' `lastReviewed` frontmatter to `"2026-05-22"`.

## Output Mockups

### CLI reference page (rendered)
The metadata bar renders identically to today — the date just comes from `buildTimestamp` instead of a hardcoded string:
```
Commands · 42    Last reviewed · 2026-05-22
```

### Staleness warning (when stale files exist)
```
  ⚠ Stale docs (last reviewed > 60 days ago):
    concepts/artifacts.mdx — 74 days
    guides/reading-a-proof.mdx — 65 days
```

### No staleness (all dates within threshold)
No output — silent pass, matching the pattern where `validateInternalLinks` only prints on success (`✓ Internal links validated`). Add a similar success line:
```
  ✓ No stale docs
```

## File Changes

### `website/app/docs/reference/cli/page.tsx` (modify)
**What changes:** Replace the hardcoded `"2026-05-22"` string on line 69 with `{meta.buildTimestamp.slice(0, 10)}`.
**Pattern to follow:** Same file already uses `meta.buildTimestamp` and `meta.commitSha` in the RightRail props (line 79).
**Why:** Without this, the date silently goes stale every time someone forgets to update it manually.

### `website/scripts/extract-docs-data.ts` (modify)
**What changes:** Add a `checkStaleDocs()` function and call it in `main()` between link validation and completeness validation (between lines 1125 and 1127).
**Pattern to follow:** `validateInternalLinks` (line 962) — standalone function, walks directory, reads files, parses frontmatter, checks condition, returns results. The caller in `main()` handles output.
**Why:** Without a staleness signal, docs rot silently. The warning surfaces the problem during every build without blocking deploys.

### 14 MDX files in `website/content/docs/` (modify)
**What changes:** Update `lastReviewed` frontmatter value from current date to `"2026-05-22"`.
**Pattern to follow:** Existing frontmatter format — YAML key with quoted date string.
**Why:** Resets the staleness clock after the R5/R6 validation pass. Gives the new warning a clean baseline.

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
- [ ] AC2: Running `extract-docs-data.ts` with any MDX `lastReviewed` date older than 60 days emits a warning to stderr with the file path and age in days.
- [ ] AC3: Running `extract-docs-data.ts` with all dates within 60 days emits no staleness warnings.
- [ ] AC4: All 14 MDX files have `lastReviewed: "2026-05-22"` in frontmatter.
- [ ] AC5: The website build succeeds. No test regressions.
- [ ] AC6: MDX files without `lastReviewed` frontmatter are silently skipped (no crash, no warning).

## Testing Strategy

- **Unit tests:** Add a test for `checkStaleDocs` logic in the website test suite. Test with a mock content directory containing: one file with a stale date, one file within threshold, one file without `lastReviewed`. Verify correct warn/skip behavior. Follow existing website test patterns.
- **Integration:** The `extract-docs-data.ts` script runs as part of `pnpm prebuild` in website — running the website build verifies the integration.
- **Edge cases:** Missing `lastReviewed` field, malformed date string, file without frontmatter delimiter.

## Dependencies

None. All files exist and patterns are established.

## Constraints

- The staleness check must NOT fail the build (`console.warn` only, no `process.exit`).
- The 60-day threshold is a constant, not configurable via env vars.
- The CLI reference page must not import any new modules — `meta` is already available.

## Gotchas

- `parseFrontmatter()` strips quotes from values. `lastReviewed: "2026-05-13"` becomes the string `2026-05-13`. `new Date("2026-05-13")` parses this correctly in all environments.
- The content directory path is NOT a module-level constant — each walker constructs it locally. Do the same: `path.join(WEBSITE_DIR, 'content', 'docs')`.
- `console.warn` writes to stderr. This is intentional — it won't interfere with stdout-based build summaries.
- The `parseFrontmatter` regex requires `---\n` delimiters. MDX files without frontmatter return `{ frontmatter: {}, body: content }` — the `lastReviewed` check must handle this by skipping when the field is absent.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports.
- Prefer early returns over nested conditionals.
- Explicit return types on exported functions.
- In JSX text content, use `&apos;` for apostrophes (lint rule).
- Named exports only — no default exports.

### Pattern Extracts

From `website/scripts/extract-docs-data.ts` lines 1116-1125 (how `main()` calls a validation function and handles its result):
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

From `website/scripts/extract-docs-data.ts` lines 54-68 (parseFrontmatter helper):
```typescript
function parseFrontmatter(content: string): { frontmatter: Record<string, string | string[] | null>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatter: Record<string, string | string[] | null> = {};
  for (const line of match[1].split('\n')) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (!kvMatch) continue;
    const [, key, rawValue] = kvMatch;
    let value: string | string[] | null = rawValue;
```

From `website/app/docs/reference/cli/page.tsx` lines 67-70 (the metadata bar with the hardcoded date):
```tsx
        <div ...>
          <span><b>Commands</b> · {commandCount}</span>
          <span><b>Last reviewed</b> · 2026-05-22</span>
        </div>
```

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands
- After CLI reference page change: `(cd 'website' && pnpm run build)` — Expected: build succeeds
- After staleness function added: `(cd 'website' && pnpm vitest run)` — Expected: tests pass
- After all changes: `(cd 'website' && pnpm vitest run)` — Expected: 55+ tests pass
- Lint: `(cd 'website' && pnpm run lint)`

### Build Baseline
- Current tests: 55 passed (8 test files)
- Command used: `(cd 'website' && pnpm vitest run)`
- After build: expected 55+ tests (new staleness test adds coverage)
- Regression focus: `extract-docs-data.ts` script execution during `prebuild`
