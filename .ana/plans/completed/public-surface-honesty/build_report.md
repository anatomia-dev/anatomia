# Build Report: Public-surface honesty touch-ups

**Created by:** AnaBuild
**Date:** 2026-06-17
**Spec:** .ana/plans/active/public-surface-honesty/spec.md
**Branch:** feature/public-surface-honesty

## What Was Built

- **`.ana/context/project-context.md`** (modified): Replaced the flat-wrong CI claim
  "CI runs across 3 OS × 2 Node versions" with the real matrix — "CI runs on Ubuntu
  across Node 22 and 24, with lint, typecheck, and coverage gates." Verified against
  `.github/workflows/test.yml` (`runs-on: ubuntu-latest`, `matrix.node-version: [22, 24]`,
  lint + typecheck:tests + vitest steps) and `packages/cli/vitest.config.ts` (coverage
  thresholds: lines 80, branches 75, statements 80). The "test count must not decrease"
  framing and the vitest.config.ts coverage-threshold mention were preserved.

- **`website/lib/copy.ts`** (modified): Changed exactly one string — the `ana-verify`
  chip `role` in `copy.bento.agents.chips` from `"isolated · mechanical"` to
  `"isolated · fault-finds"`. No other line in the file changed.

- **`website/lib/__tests__/copy.test.ts`** (modified): Added four tagged guard `describe`
  blocks (A001–A004) ahead of the existing A031 block, mirroring the A031–A035 pattern
  (`import { copy }`, one `// @ana A0NN` per `describe`, describe text == contract `block`
  field, plain `expect`). A001 pins the chip change; A002–A004 lock the three protected
  lines.

- **`website/content/docs/concepts/contract.mdx`** (modified): Added one new section,
  "Acceptance-criteria coverage," placed between "How assertions become tests" and
  "Writing good assertions." Additive only — no existing line changed. Re-derived from
  shipped code (`contract.ts`, `artifact-validators.ts`, `plan.ts`).

## PR Summary

- Removes three public-surface honesty gaps: a false CI-matrix claim in the dogfood
  context file, a verdict-framing word in website copy, and a missing docs section.
- Corrects the dogfood CI description to match `test.yml` (Ubuntu only, Node 22 & 24,
  with lint/typecheck/coverage gates).
- Retunes the `ana-verify` marketing chip from "mechanical" to "fault-finds" so it
  reflects the verifier's independent assessment, not a machine re-execution.
- Documents acceptance-criteria coverage in `contract.mdx` (the `ac` field,
  `coverage_waivers`, the pre-seal coverage gate, and `ana plan coverage`), including
  the explicit honesty bound that coverage proves a link, not exercise.
- Adds four tagged guard assertions that fail the build if the chip word is wrong or any
  of the three deliberately-kept protected copy lines is altered.

## Acceptance Criteria Coverage

- AC1 "real CI matrix in project-context.md" → ✅ Verified by reading edit against
  `test.yml` + `vitest.config.ts`. No mechanical test (dogfood context file, not a
  testable surface) — `coverage_waivers` AC1 (judgment).
- AC2 "chip role changed, protected lines untouched" → ✅ copy.test.ts A001 (chip
  role), A002 (diff title), A003 (diff body), A004 (manifesto pull) — all pass.
- AC3 "contract.mdx gains accurate coverage section" → 🔨 Implemented; accuracy is
  Verify judgment — `coverage_waivers` AC3 (judgment).
- AC4 "honesty bound stated explicitly" → 🔨 Implemented (final paragraph of new
  section); prose claim — `coverage_waivers` AC4 (judgment).
- AC5 "website builds clean, no out-of-scope edits" → ✅ `pnpm --filter
  anatomia-website check` EXIT 0; `git diff --name-only` shows only the four targets.
- New "A001–A004 tagged and pass" → ✅ Four `// @ana A0NN` tags present; all pass.
- New "website suite passes, 88/11, no regression" → ✅ 88 tests / 11 files (84 → 88);
  no new failures.

## Implementation Decisions

- **Fix 1 kept as a single physical line** to match the surrounding bullets in the
  "Active Constraints" section (each bullet is one line), rather than the wrapped form
  shown in the spec's Output Mockup. The mockup fixed content, not line-wrapping.
- **Fix 3 used a fenced `yaml` code block** for the `coverage_waivers` example to match
  `contract.mdx`'s established code-fence convention (the file uses ```` ```yaml ````
  blocks, not indented code).
- **Fix 3 avoided an apostrophe** in the closing sentence ("that remains a judgment for
  Verify" rather than "Verify's judgment") to sidestep any JSX/MDX unescaped-entity
  concern while preserving meaning and the terse voice.
- **A004 asserts on apostrophe-free substrings** (`"You don"` and `"have to trust the
  model. You read the chain."`) so the guard cannot fail on the unicode right-single-
  quote (`’`) in the source string.

## Deviations from Contract

None — contract followed exactly. All four assertions (A001–A004) are implemented with
the specified target, matcher, and value, and each test's `describe` text matches the
contract `block` field verbatim.

## Test Results

### Baseline (before changes)
Command: `(cd website && pnpm vitest run)`
```
 Test Files  1 failed | 9 passed | 1 skipped (11)
      Tests  1 failed | 77 passed | 6 skipped (84)
```
The single failure is `docs-platform-content.test.ts` → `ENOENT: public/search-index.json`
— a generated build asset absent in a fresh worktree, in a module this spec does not
touch. Recorded as the regression baseline (1 pre-existing failure).

### After Changes
Command: `(cd website && pnpm vitest run)`
```
 Test Files  1 failed | 9 passed | 1 skipped (11)
      Tests  1 failed | 81 passed | 6 skipped (88)
```
+4 tests (84 → 88), +4 passing (77 → 81). The same single pre-existing
`search-index.json` failure; no new failure.

Sealed repo-wide final run (`ana test --stage build`), after the build gate regenerated
`search-index.json` — the environmental failure resolves to 0:

<!-- ana:capture stage=build slug=public-surface-honesty counts=3865p/0f/2s verdict=pass sha256=8fa2e7e7782654acda858eced05b5f5f07da41bdc44f611968485b819aa3dd3c -->

### Comparison
- Tests added: 4 (A001–A004)
- Tests removed: 0
- Regressions: none (pre-existing environmental failure unchanged; resolves once the
  search index is generated)

### New Tests Written
- `website/lib/__tests__/copy.test.ts`: A001 (chip role == "isolated · fault-finds"),
  A002 (diff title unchanged), A003 (diff body retains no-self-grading line), A004
  (manifesto pull quote unchanged, apostrophe-safe).

## Verification Commands
```
pnpm run build
(cd website && pnpm vitest run)          # 88 tests / 11 files; copy.test.ts A001–A004 pass
pnpm --filter anatomia-website check     # lint + typecheck + build, EXIT 0
pnpm run test -- --run                   # repo-wide: 3865 passed, 0 failed, 2 skipped
```

## Git History
```
4183dd55 [public-surface-honesty] Document AC-coverage in contract docs
df1fee5b [public-surface-honesty] Align ana-verify chip to fault-finding, guard it
5513f61c [public-surface-honesty] Correct CI matrix claim in dogfood context
```

## Open Issues

1. **Pre-existing website vitest failure in a fresh worktree** —
   `docs-platform-content.test.ts` fails with `ENOENT public/search-index.json` until a
   Next build (or the `check` gate) regenerates the asset. Not introduced by this build;
   the sealed final `ana test` run shows 0 failures once the index exists. Recorded in
   `build_data.yaml` (observation / monitor).

2. **Pre-existing lint warnings** — `formatAge` and `latest` unused-var warnings (0
   errors, 2 warnings) remain in the website lint output, in files outside this spec's
   four targets. Not touched. Recorded in `build_data.yaml` (observation / acknowledge).

Second pass — re-examined the diff for anything unrecorded: the chip edit is a single
string; the three protected lines are byte-identical (confirmed by A002–A004 passing and
by `git diff website/lib/copy.ts` showing one changed line); the docs section is purely
additive; the context edit changed one bullet. No unused imports or parameters were
added. Nothing further surfaced. The two items above are the complete set.
