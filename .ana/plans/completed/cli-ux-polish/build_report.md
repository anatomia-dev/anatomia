# Build Report: CLI UX Polish — First 10 Minutes

**Created by:** AnaBuild
**Date:** 2026-05-05
**Spec:** .ana/plans/active/cli-ux-polish/spec.md
**Branch:** feature/cli-ux-polish

## What Was Built

- `packages/cli/src/index.ts` (modified): Added `commandsGroup()` calls to group commands under GETTING STARTED / PIPELINE / INTELLIGENCE headings. Reordered registrations so scan appears before init. Added `addHelpCommand(false)` to suppress residual help subcommand. Changed version from `anatomia-cli/${pkg.version}` to `ana/${pkg.version}`.
- `packages/cli/src/commands/scan.ts` (modified): Description changed to "Detect stack, conventions, and patterns". CTA changed from "fix them" to "scaffold context and agents for your project". Added EXAMPLES help text.
- `packages/cli/src/commands/init/index.ts` (modified): Description changed to "Scan project and generate agent context". Added EXAMPLES help text.
- `packages/cli/src/commands/setup.ts` (modified): Description changed to "Enrich context with team knowledge". Index subcommand hidden via `{ hidden: true }`.
- `packages/cli/src/commands/work.ts` (modified): Description changed to "Start, track, and complete development tasks". Added EXAMPLES help text to `start` subcommand.
- `packages/cli/src/commands/artifact.ts` (modified): Description changed to "Save pipeline outputs with hash verification". Added EXAMPLES help text to `save` subcommand.
- `packages/cli/src/commands/verify.ts` (modified): Description changed to "Verify contract assertions before code review".
- `packages/cli/src/commands/pr.ts` (modified): Description changed to "Create pull request from verified build".
- `packages/cli/src/commands/agents.ts` (modified): Description changed to "List installed agent definitions".
- `packages/cli/templates/.claude/skills/*/ENRICHMENT.md` (modified, 8 files): Prepended `<!-- Internal: read by ana-setup only. Not for manual editing. -->` as first line.

## PR Summary

- Group `ana --help` commands under three headings (GETTING STARTED, PIPELINE, INTELLIGENCE) using Commander v14's `commandsGroup()` API
- Replace internal jargon in all command descriptions with user-friendly language
- Add EXAMPLES sections to scan, init, work start, and artifact save help output
- Change version output from `anatomia-cli/X.Y.Z` to `ana/X.Y.Z` and fix scan CTA wording
- Hide `setup index` from help and mark ENRICHMENT.md templates as internal-only

## Acceptance Criteria Coverage

- AC1 "scaffold context not fix them" → scan.ts line 322 string replacement verified in source
- AC2 "scan --help shows examples" → scan.ts `addHelpText` adds EXAMPLES with 2 commands
- AC3 "init --help shows examples" → init/index.ts `addHelpText` adds EXAMPLES with 2 commands
- AC4 "work start --help shows examples" → work.ts `addHelpText` adds EXAMPLES with 1 command
- AC5 "commands grouped" → index.ts `commandsGroup()` calls for all 3 headings
- AC6 "scan before init" → index.ts registers scan before init in GETTING STARTED group
- AC7 "jargon-free" → all 9 descriptions updated, no "context framework", "contract seal", "plan artifacts", "deployed agents"
- AC8 "ana/X.Y.Z version" → index.ts version string changed
- AC9 "setup index hidden" → setup.ts `addCommand` with `{ hidden: true }`
- AC10 "ENRICHMENT.md markers" → all 8 files prepended with HTML comment
- AC11 "all existing tests pass" → 1883 passed, 2 skipped (matches baseline exactly)
- AC12 "no build errors" → `pnpm run build` passes in pre-commit hook
- AC13 "artifact save --help shows examples" → artifact.ts `addHelpText` adds EXAMPLES with 2 commands

## Implementation Decisions

- Placed `addHelpCommand(false)` immediately after the `.version()` call rather than after command registrations. Commander processes this setting at parse time regardless of position, and placing it early makes the intent clear.
- ENRICHMENT.md comment uses blank line separator between comment and existing content for readability.

## Deviations from Contract

None — contract followed exactly. All 19 assertions (A001-A019) are addressed by source code changes. No tests written per spec's Testing Strategy — these are string-only changes with no logic.

Note on test tagging: The spec explicitly states "No new unit tests required" — these are string/description changes with no behavioral logic. Contract assertions are verified through source inspection and manual CLI invocation, not automated tests. No `@ana` tags were placed because no test files were created or modified.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run --run)
 Test Files  94 passed (94)
      Tests  1883 passed | 2 skipped (1885)
   Duration  52.46s
```

### After Changes
```
(cd packages/cli && pnpm vitest run --run)
 Test Files  94 passed (94)
      Tests  1883 passed | 2 skipped (1885)
   Duration  55.83s
```

### Comparison
- Tests added: 0
- Tests removed: 0
- Regressions: none

### New Tests Written
None. Spec states: "No new unit tests required. These are string changes to help text and descriptions — no logic changes."

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run --run)
pnpm run lint
```

Manual verification after build:
```bash
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js --version
node packages/cli/dist/index.js scan --help
node packages/cli/dist/index.js init --help
node packages/cli/dist/index.js setup --help
node packages/cli/dist/index.js work start --help
node packages/cli/dist/index.js artifact save --help
```

## Git History
```
c32ad2b [cli-ux-polish] Add help examples and ENRICHMENT.md markers
44f4a15 [cli-ux-polish] Regroup commands and update descriptions
```

## Open Issues

Pre-existing lint warnings (15 warnings, 0 errors) in files not touched by this build: `git-operations.ts`, `analyzer-contract.test.ts`, `confirmation.test.ts`, `imports.test.ts`, `ai-sdk-detection.test.ts`. All are `@typescript-eslint/no-explicit-any` or unused eslint-disable directive warnings.

The `commandsGroup()` API is Commander v14-specific. If the project ever downgrades Commander, the grouped help output will break silently (Commander ignores unknown method calls in some versions, throws in others).

Verified complete by second pass.
