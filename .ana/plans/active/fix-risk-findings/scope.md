# Scope: Fix Risk Findings

**Created by:** Ana
**Date:** 2026-05-24

## Intent

The proof chain has 6 risk-severity findings — the highest severity category. Three are fixable with minimal changes and zero blast radius. Fixing them clears the risk backlog and moves the health trend from "worsening" toward "improving."

## Complexity Assessment

- **Kind:** fix
- **Size:** small — 3 independent fixes across 3 files, each 1-5 lines
- **Surface:** cross-surface
- **Files affected:**
  - `packages/cli/src/commands/init/state.ts` — escape single quotes in surface command strings (4 template literals)
  - `packages/cli/src/commands/work.ts` — backfill guard explicit null check (1 line)
  - `website/lib/docs-data/docsStatValues.ts` — export `DocsStatKey` type (1 type definition)
  - `website/components/docs/content/DocsStat.tsx` — narrow prop type from `string` to `DocsStatKey` (1 line)
- **Blast radius:** Zero behavior change for all three fixes. The path escape is a no-op on paths without single quotes. The backfill guard change doesn't fire on any existing installation (migration already completed). The type narrowing has zero runtime effect — it only adds build-time validation.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Three independent one-line fixes that close 3 of 6 risk findings. Each is verified to have zero blast radius.

**Fix 1: Escape single quotes in surface path commands (state.ts)**

Lines 513, 520, 524, 531 interpolate `surface.path` into single-quoted shell subcommands: `` `(cd '${surface.path}' && ...)` ``. A path containing a single quote (e.g., `apps/it's-broken`) would produce broken shell syntax.

Fix: replace `surface.path` with `surface.path.replace(/'/g, "'\\''")`  in all 4 template literals. The `'\''` pattern ends the single-quoted string, inserts an escaped literal quote, and reopens the single-quoted string. This is the standard POSIX shell idiom for quoting single quotes within single-quoted strings.

Verified: `surface.path` originates from `root.relativePath` in the census (surfaces.ts:363), which comes from `@manypkg/get-packages`. These are filesystem directory paths. Paths without single quotes are unchanged (the replace is a no-op). The escape only affects the command STRING written to ana.json — not the path field itself, not the surface name, and not anything the CLI executes.

Existing tests assert exact command strings like `"(cd 'packages/cli' && pnpm run test)"`. These pass unchanged because the test paths contain no single quotes.

**Fix 2: Explicit null check in backfill guard (work.ts)**

Line 1101: `if (!existing.surface && existing.modules_touched?.length)`. The `!existing.surface` check is truthy for both `undefined` and `''` (empty string). While `surface: ''` never occurs in practice (deriveSurface returns `string | undefined`, never `''`), the guard should be explicit: `existing.surface === undefined || existing.surface === null` (catches both `undefined` and `null` but not `''`).

Verified: the backfill migration has already run on our installation (`chain.migrations.surface_backfill = true`), so this block is skipped entirely. For new installations, the chain starts with 0 entries, so the loop iterates 0 times. The fix is purely defensive — it makes the code say what it means.

**Fix 3: Type-narrow DocsStat value prop (docsStatValues.ts + DocsStat.tsx)**

DocsStat accepts `value: string` and renders `values[value] ?? value`. A misspelled key silently renders the raw key as visible text. No build-time or runtime error.

Fix: export a `DocsStatKey` union type from `docsStatValues.ts` with the 9 valid keys. Change `DocsStat` prop from `value: string` to `value: DocsStatKey`. TypeScript catches misspelled keys at build time in MDX files.

Verified: all 9 current usages in MDX files use valid keys. `buildDocsStatValues` continues to return `Record<string, string>` — the type narrowing is only on the component prop, not the builder function. `resolveDocsStatTags` (prebuild script) is unaffected — it operates on strings from regex capture, not typed props. Zero runtime change.

## Acceptance Criteria

- AC1: Surface command strings in state.ts escape single quotes in paths using the `'\''` shell idiom.
- AC2: A test verifies that a surface path containing a single quote produces a correctly escaped command string.
- AC3: The backfill guard at work.ts:1101 uses `existing.surface === undefined || existing.surface === null` instead of `!existing.surface`.
- AC4: `DocsStatKey` type is exported from `docsStatValues.ts` as a union of the 9 valid keys.
- AC5: `DocsStat` component prop `value` accepts `DocsStatKey` instead of `string`.
- AC6: Website builds successfully (`cd website && pnpm run build`) — all existing MDX usages compile.
- AC7: All existing tests pass unchanged: `pnpm run test -- --run`.

## Edge Cases & Risks

**Escape affects existing tests?** No. Existing tests use paths like `packages/cli` and `apps/web` — no single quotes. The `.replace(/'/g, "'\\''")` is a no-op on these strings. Test assertions remain exact string matches.

**Type narrowing breaks MDX?** No. fumadocs + Next.js type-check MDX component props at build time. All 9 current usages pass valid literal strings. A future typo would fail the build — that's the point.

**`buildDocsStatValues` return type change?** No change. It stays `Record<string, string>`. Only the DocsStat component prop narrows. `Record<DocsStatKey, string>` would be incompatible with `Record<string, string>` in some TypeScript contexts, so we avoid it. The type narrowing lives at the component boundary only.

**Backfill guard — does `== null` change behavior for `undefined`?** No. `undefined == null` is `true` in JavaScript. The check `existing.surface === undefined || existing.surface === null` is truthy for both `undefined` and `null`, matching the original `!existing.surface` behavior for those values. The only difference: `'' == null` is `false`, so empty strings are no longer treated as "no surface."

**Other places using `!surface` pattern?** Checked. Line 1053 uses `entry.surface = derived` (assignment, not guard). No other `!surface` guards exist in the codebase.

## Rejected Approaches

**Using double quotes instead of single quotes for the cd command.** Double quotes allow variable expansion, which is a different class of injection risk. Single quotes with proper escaping is the safer shell convention.

**Changing `buildDocsStatValues` return type to `Record<DocsStatKey, string>`.** Would require updating `resolveDocsStatTags` parameter type and the prebuild script variable type. More churn for no additional safety — the component prop narrowing is sufficient.

**Fixing all 6 risk findings in one scope.** The PID guard tests (3 findings) and GitHub outage → 404 (1 finding) are real but mitigated. The PID behavior is tested in `work-ci-mocked.test.ts`. The proof page self-heals on revalidation. Including them would triple the scope size for marginal additional safety.

## Open Questions

None. All three fixes are verified to have zero blast radius.

## Exploration Findings

### Patterns Discovered

- The 4 template literals in state.ts lines 513-531 are the ONLY places in the codebase that interpolate paths into shell command strings. No other file has this pattern.
- `deriveSurface` returns `string | undefined`, never `''`. The empty-string scenario requires manual editing of proof_chain.json.
- DocsStat is used in 6 MDX files with 11 total instances, all using valid keys.

### Constraints Discovered

- [VERIFIED] Surface paths come from `@manypkg/get-packages` via census `root.relativePath`. These are filesystem directory paths. Single quotes in directory names are legal but extremely rare in npm workspace projects.
- [VERIFIED] `chain.migrations.surface_backfill = true` on our installation. The backfill block at line 1099 is skipped entirely.
- [VERIFIED] `resolveDocsStatTags` takes `Record<string, string>` and uses regex-captured keys. Unaffected by the type narrowing at the component level.
- [VERIFIED] monorepoCommandScoping tests assert exact command strings. Paths without quotes pass unchanged.

### Test Infrastructure

- `monorepoCommandScoping.test.ts` line 122-377: surface command string assertions. Add one test with a single-quote-in-path to verify the escape.
- `work.test.ts` line 5815-5982: backfill tests. The guard change is exercised by the existing "derives surface from modules_touched for backfill scenario" test.
- No DocsStat tests exist. The website build IS the test — build-time type checking catches invalid keys.

## For AnaPlan

### Structural Analog

The security-hardening scope that fixed command injection vulnerabilities in git operations. Same pattern: escape user-derived strings before shell interpolation.

### Relevant Code Paths

- `src/commands/init/state.ts` lines 513, 520, 524, 531 — surface command template literals
- `src/commands/work.ts` line 1101 — backfill guard
- `website/lib/docs-data/docsStatValues.ts` lines 28-40 — buildDocsStatValues return
- `website/components/docs/content/DocsStat.tsx` line 6 — DocsStatProps interface

### Patterns to Follow

- Shell escape: `str.replace(/'/g, "'\\''")` — POSIX standard
- Null check: `== null` (not `=== null`) to catch both undefined and null
- Type narrowing: union type at the consumption boundary, not at the producer

### Known Gotchas

- The escape string `"'\\''""` in TypeScript source looks unusual. In the template literal, `surface.path.replace(/'/g, "'\\''")` produces the correct shell output. The backslash escaping is: `\\'` → literal `\'` in the output, wrapped by quotes → `'\''` in the shell command.
- The codebase uses strict equality (`=== null`, `!== null`) throughout — no `== null` anywhere. The fix uses `existing.surface === undefined || existing.surface === null` to match the convention.

### Things to Investigate

- RESOLVED: The codebase uses strict equality throughout. Using `existing.surface === undefined || existing.surface === null`.
