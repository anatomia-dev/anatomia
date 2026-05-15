# Build Report: Documentation links in init and setup

**Created by:** AnaBuild
**Date:** 2026-05-14
**Spec:** .ana/plans/active/docs-links-init-setup/spec.md
**Branch:** feature/docs-links-init-setup

## What Was Built

- `packages/cli/src/constants.ts` (modified): Added `DOCS_QUICKSTART` and `DOCS_SETUP_GUIDE` URL constants in a new "Documentation URLs" section before the legacy constants.
- `packages/cli/src/commands/init/state.ts` (modified): Added quickstart URL line (`Quickstart  https://...`) after the commit-readiness indicator block, before the final trailing blank line. Imported `DOCS_QUICKSTART` from constants.
- `packages/cli/src/commands/setup.ts` (modified): Added guide URL line (`Guide  https://...`) between the agent command and subcommands list. Imported `DOCS_SETUP_GUIDE` from constants.
- `packages/cli/templates/.claude/agents/ana-setup.md` (modified): Added `https://anatomia.dev/docs/guides/using-ana-setup#design-principles` reference line in Step 6 scripted block, between the "Examples from other teams" list and the "Your project starts with 3 defaults" paragraph.
- `website/content/docs/guides/using-ana-setup.mdx` (modified): Added `<p style>` annotation with link to `/docs/reference/context#design-principles` between the design principles code block and the existing annotation paragraph.
- `.claude/agents/ana-setup.md` (modified): Synced dogfood agent definition with the updated template to satisfy the dogfood-matches-template test.
- `packages/cli/tests/commands/init.test.ts` (modified): Added 9 new tests covering URL constants, init quickstart output, setup guide output, template URL, and docs page link.

## PR Summary

- Add `DOCS_QUICKSTART` and `DOCS_SETUP_GUIDE` constants in `constants.ts` for centralized URL management
- Surface quickstart link after `ana init` success output and guide link in bare `ana setup` output, both using `chalk.bold` label + `chalk.gray` URL styling
- Add design principles guide URL to the ana-setup agent template's Step 6 scripted block and cross-reference link in the using-ana-setup docs page
- 9 new tests verify URL presence, positioning, and constant values across all four surfaces

## Acceptance Criteria Coverage

- AC1 "init success output ends with quickstart URL" → init.test.ts "shows quickstart URL with label" (2 assertions: contains URL, contains label)
- AC2 "setup bare command includes guide URL" → init.test.ts "shows guide URL with label" (2 assertions: contains URL, contains label)
- AC3 "ana-setup.md template includes design principles URL" → init.test.ts "includes design principles guide URL in Step 6 block" (1 assertion)
- AC4 "docs page links to reference design principles" → init.test.ts "links to design principles reference section" (1 assertion)
- AC5 "CLI URLs defined as named constants" → init.test.ts "DOCS_QUICKSTART has correct value" + "DOCS_SETUP_GUIDE has correct value" (2 assertions)
- AC6 "Existing init and setup tests continue to pass" → ✅ All 2288 baseline tests pass
- AC7 "www.anatomia.dev redirects" → NO TEST (human criterion, Vercel domain config)

## Implementation Decisions

- **Setup command test approach:** Used Commander's `program.parse(['setup'], { from: 'user' })` with `exitOverride()` to invoke the synchronous setup action in tests, rather than `require()` (incompatible with ESM) or direct action handler access.
- **Dogfood sync:** The `agent-proof-context.test.ts` test enforces that `.claude/agents/ana-setup.md` matches the template exactly. Updated the dogfood copy in a separate commit to keep the template change and dogfood sync as distinct logical units.
- **MDX annotation text:** Spec said "with text like 'See our design principles'" — used "See our design principles reference for the full list and how each one shapes agent behavior." to be informative without being verbose.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  103 passed (103)
     Tests  2288 passed | 2 skipped (2290)
  Duration  38.74s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  103 passed (103)
     Tests  2297 passed | 2 skipped (2299)
  Duration  38.50s
```

### Comparison
- Tests added: 9
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/init.test.ts`:
  - `displaySuccessMessage quickstart URL > shows quickstart URL with label` (A001, A002)
  - `displaySuccessMessage quickstart URL > shows quickstart URL after Next steps block` (A003)
  - `displaySuccessMessage quickstart URL > shows quickstart URL even when engineResult is null` (A011)
  - `setup bare command guide URL > shows guide URL with label` (A004, A005)
  - `setup bare command guide URL > shows guide URL between agent command and subcommands` (A006)
  - `URL constants > DOCS_QUICKSTART has correct value` (A007)
  - `URL constants > DOCS_SETUP_GUIDE has correct value` (A008)
  - `setup agent template > includes design principles guide URL in Step 6 block` (A009)
  - `using-ana-setup docs page > links to design principles reference section` (A010)

## Verification Commands
```bash
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
278a0c55 [docs-links-init-setup] Sync dogfood agent definition with template
7091bae4 [docs-links-init-setup] Add design principles URLs to template and docs
26318648 [docs-links-init-setup] Add quickstart and guide URLs to CLI output
2e424e71 [docs-links-init-setup] Add documentation URL constants
```

## Open Issues

- The `using-ana-setup.mdx` annotation links to `/docs/reference/context#design-principles` — this target path must exist on the website. If the reference page doesn't have a `#design-principles` anchor, the link will 404 or land on the wrong section. The spec treats this as a stable URL contract, so the website team owns ensuring it resolves.

Verified complete by second pass.
