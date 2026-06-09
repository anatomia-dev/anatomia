# Build Report: Scan card redesign — shared render vocabulary + gated "How your team writes"

**Created by:** AnaBuild
**Date:** 2026-06-09
**Spec:** .ana/plans/active/scan-card-redesign/spec.md
**Branch:** feature/scan-card-redesign

## What Was Built

- **packages/cli/src/commands/scan.ts** (modified): Rebuilt `formatHumanReadable` on the shared
  `utils/render.ts` primitives. Deleted the local `BOX` constant. The 3-line identity box is now a
  `headerBox({ corners: 'rounded' })` call (title = project name, subtitleLeft = stack summary,
  subtitleRight = dim application shape). Every `bold('  Label')` + `gray('  ─────')` pair (Stack,
  Surfaces, Intelligence) is now a single `sectionRule('Label')`, and the label/value rows are now
  `keyValueRows(rows, { labelWidth })`. Added a new confidence-gated **"How your team writes"**
  section (after Stack/Surfaces, before Intelligence) surfacing naming, indentation, error handling,
  and validation from `result.conventions`/`result.patterns` at a single 0.7 gate. The Findings +
  footer/CTA block (and the no-stack ancestor-walk fallback) are behaviorally unchanged.
- **packages/cli/src/utils/displayNames.ts** (modified): Added validation libraries (zod→Zod, joi→Joi,
  yup→Yup, valibot→Valibot, superstruct→Superstruct, ajv→Ajv, pydantic→Pydantic, marshmallow→Marshmallow)
  to `PATTERN_DISPLAY_NAMES` so the validation row renders "Zod", not raw "zod". See Deviations (A010).
- **packages/cli/tests/commands/scan.test.ts** (modified): Updated the 3 assertions that assumed the old
  square-box / two-line-header idiom (corner glyph `┌`→`╭`; Surfaces section located by `── Surfaces`
  with data rows on the next line; conditional width assertion now asserts the search succeeded first).
  Added a "How your team writes (direct render)" describe (section present/absent, mixed omission),
  a `zod`→`Zod` display-name test, and an A014 assertion that `--json` still emits `"conventions"`.
- **packages/cli/tests/commands/scan-card-golden.test.ts** (created) + its `__snapshots__/*.snap`:
  Golden suite — five fixtures (full deep-tier, surface-tier, monorepo overflow, no-stack fallback,
  confidence gate) rendered color-stripped and snapshotted, plus a box-width describe pinning the
  71-column header lines and long-name truncation.

## PR Summary

- Rebuilds the `ana scan` human card on the shared `utils/render.ts` primitives, so it speaks the same
  visual language as the redesigned proof card: a rounded header box and inset `── Label ──` section rules.
- Adds a confidence-gated "How your team writes" section that surfaces the naming, indentation, error-handling,
  and validation signals the engine already computes — gated at 0.7 so the card never shows a low-confidence
  or "mixed" guess.
- Removes the duplicated local `BOX` constant and all hand-rolled bold-label + dashed-underline headers from
  scan.ts; `render.ts` is untouched (reuse, not add).
- Pins the full card layout and the shown-vs-omitted gate split with a new golden snapshot suite (5 fixtures).
- Presentation-only: the engine, the `EngineResult` schema, `proof.ts`, and `--json` output are unchanged.

## Acceptance Criteria Coverage

- AC1 "renders via shared primitives, BOX + hand-rolled headers removed" → ✅ scan-card-golden full-card
  (`── Stack`, `╭`, `not ┌`) + code review (BOX deleted, headerBox/sectionRule/keyValueRows used throughout).
- AC2 "visually consistent with proof card, 71 wide" → ✅ scan-card-golden box-width describe (lines === 71),
  rounded corners + inset rules in snapshot.
- AC3 "How your team writes section surfaces naming/indent/error/validation" → ✅ golden full-deep-tier +
  scan.test direct-render (`camelCase functions`, `spaces, 2-wide`, `exceptions`, `Zod`).
- AC4 "every row gated ≥0.7 (naming also mixed===false); omitted below; whole section omitted if empty" → ✅
  golden gate fixture + surface-tier + scan.test "omits mixed sub-category" / "omits entire section".
- AC5 "one accent + grayscale, legible color-stripped, no ANSI-dependent layout" → ✅ golden "no ANSI escape
  codes" test (A013) across fixtures.
- AC6 "--json unchanged" → ✅ scan.test `--quick --json` asserts `"conventions"` present (A014); engine untouched.
- AC7 "funnel mode preserved" → ✅ golden no-stack funnel test (`ana init`, A015) + full-card non-funnel
  (`.ana/scan.json`, A016).
- AC8 "graceful degradation (surface-tier, overflow, no-stack, long names)" → ✅ golden surface-tier,
  monorepo overflow (`(+2 more)`), no-stack fallback, and box-width long-name (120-char) truncation tests.
- AC9 "all existing scan tests pass, count does not decrease, new coverage added" → ✅ focused files 96→108
  (+12), full suite 3687 passed / 0 failed.
- AC10 "golden snapshots pin full card across the five scenarios incl. gate omission" → ✅ scan-card-golden.test.ts
  (5 snapshots written + reviewed).
- AC11 "0.7 gate calibrated against real scan output; shown-vs-omitted pinned" → ✅ verified against the real
  anatomia repo (deep scan): shows {camelCase functions, SCREAMING_SNAKE_CASE constants, spaces 2-wide,
  exceptions, Zod}; omits {file naming mixed 0.60, class naming 0.55, import style mixed 0.69, null-style mixed} —
  exactly the spec's calibration table. Pinned by the golden gate fixture.
- AC12 "render.ts unchanged" → ✅ no diff to src/utils/render.ts (verify: `git diff main -- packages/cli/src/utils/render.ts` is empty).
- AC13 "lint clean, build succeeds" → ✅ `pnpm run build` succeeds; `pnpm run lint` reports 0 errors in changed
  files (1 pre-existing warning in unrelated git-operations.ts).

## Implementation Decisions

- **Stack/Intelligence rows collected into `KeyValueRow[]` then emitted once via `keyValueRows`.** The spec's
  "rows → keyValueRows" move applies to all three sections; collecting rows (including Services/Deploy/Workspace
  for Stack, and Hot files/Docs/Pre-commit for Intelligence) into an array keeps the output byte-identical to the
  old inline `  ${gray(label.padEnd(12))} ${value}` while flattening the code to one render call per section.
- **Surfaces overflow row modeled as `{ label: '', value: dim('(+N more)') }`.** `keyValueRows` renders the
  empty label as `namePad` gray spaces — visually identical to the old `' '.repeat(namePad)` indent.
- **Summary width budget = `inner − 2 − shape.length − minGap`.** `headerBox` does not truncate, and the
  subtitle now carries the right-aligned shape, so the fit ladder (drop package count → ellipsis) budgets
  against the shape's reserved width to keep the composed subtitle at 71 (spec gotcha; protects A005).
- **Project name truncated to `inner − 2` with `…`.** `headerBox` does not truncate the title either; a long
  name would otherwise shear the rounded border (protects A004; covered by the 120-char box-width test).
- **`headerBox` options built conditionally** (not passing `undefined`) because the project's tsconfig sets
  `exactOptionalPropertyTypes: true`, which rejects explicit-`undefined` optional properties.

## Deviations from Contract

### A010: The card reports the team's validation library
**Instead:** The validation (and error-style) row is rendered through `getPatternDisplayName(library)`, and
validation libraries (zod, joi, yup, …) were added to the shared `PATTERN_DISPLAY_NAMES` map — a 4th file
(`displayNames.ts`) beyond the contract's 3-file `file_changes` list.
**Reason:** Contract A010 requires the output to contain `"Zod"`, but the engine stores the library lowercase
(`"zod"`), and the spec's gate table said to render "the pattern `library`" (which is `"zod"`). The contract is
authoritative over the spec, so display-naming is required. `getPatternDisplayName` is the project's single
source of truth for this exact transform (it already display-names database/auth/testing libraries); extending
it to validation is the faithful fix rather than a local capitalization hack in scan.ts. `getPatternDisplayName('exceptions')`
is unmapped and returns `"exceptions"` unchanged, so the error-style row stays lowercase as the mockup shows.
**Outcome:** Functionally correct and consistent with how every other pattern library is displayed. The extra
file is small, additive, and risk-free (validation libs are never passed through the database/auth/testing paths).
Verifier should assess whether the out-of-contract file is acceptable.

## Test Results

### Baseline (before changes)
Command (focused, per Build Brief): `pnpm vitest run tests/commands/scan.test.ts tests/commands/scan-finding-details.test.ts`
```
 Test Files  2 passed (2)
      Tests  96 passed (96)
```

### After Changes
Focused: `pnpm vitest run tests/commands/scan.test.ts tests/commands/scan-finding-details.test.ts tests/commands/scan-card-golden.test.ts`
```
 Test Files  3 passed (3)
      Tests  108 passed (108)
```

Full suite (sealed via `ana test --stage build`):
<!-- ana:capture stage=build slug=scan-card-redesign counts=3687p/0f/2s verdict=pass sha256=f4c9a8be67ad7b95ab78bf97656e1f49ba2215848908285e80076a2a2a744df7 -->
```
✓ captured  counts: 3687 passed, 0 failed, 2 skipped  (verdict: pass)
```

### Comparison
- Tests added: 12 (focused files 96→108: 8 golden incl. box-width, +4 in scan.test.ts).
- Tests removed: 0.
- Regressions: none. The 2 skipped tests are pre-existing (no `.skip` added by this build).

### New Tests Written
- `tests/commands/scan-card-golden.test.ts`: 5 snapshot fixtures (full deep-tier, surface-tier, monorepo
  overflow, no-stack fallback, confidence gate) + no-ANSI sweep + box-width describe (71-column header,
  long-name truncation).
- `tests/commands/scan.test.ts`: "How your team writes (direct render)" describe (section present, mixed
  omission, surface-tier omission), `zod`→`Zod` display-name test, and an A014 `"conventions"` JSON assertion.

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run tests/commands/scan.test.ts tests/commands/scan-finding-details.test.ts tests/commands/scan-card-golden.test.ts)
pnpm run test -- --run
pnpm run lint
# Confirm render.ts is untouched (AC12):
git diff main -- packages/cli/src/utils/render.ts   # expect empty
```

## Git History
```
29e9fa82 [scan-card-redesign] Add golden snapshot suite for the scan card
71cc2d24 [scan-card-redesign] Rebuild scan card on shared render primitives + gated conventions
```

## Open Issues

- **Out-of-contract file change (`displayNames.ts`).** Adding validation display names is required to satisfy
  contract A010 (see Deviations). It is additive and risk-free, but it is a 4th file beyond the spec's stated
  3-file change set — flagged for the verifier's awareness. (severity: observation, action: acknowledge)
- **Numerically-colliding `@ana` tags in scan.test.ts.** The file already carried `// @ana A001–A013` tags from
  a prior scan contract whose IDs mean different things than this contract's A001–A019. I left them untouched
  to avoid out-of-scope churn; authoritative coverage for THIS contract lives in `scan-card-golden.test.ts`
  (correctly tagged) and the new direct-render describe. The stale tags are noise, not coverage gaps — every
  assertion is genuinely exercised by a correctly-tagged test. (severity: debt, action: monitor)
- **Header shape slot renders raw `applicationShape`** (e.g. "cli"), where the spec mockup illustratively showed
  "cli tool". No shape display-name map exists and the contract does not assert the shape text, so raw value
  preserves existing behavior. (severity: observation, action: acknowledge)
- **Monorepo-overflow golden fixture shows "0 packages"** in the Workspace line because the fixture leaves
  `monorepo.packages` empty (it exists to exercise surface overflow, not package counting). Cosmetic to the
  fixture only; real scans populate packages. (severity: observation, action: acknowledge)

Second pass: re-read the diff and the four items above. The `keyValueRows`/`headerBox` conversions are
output-identical to the prior inline rendering (verified against a real deep scan and the box-width tests);
no unused imports remain (lint clean); no test assertions were weakened (the one conditional-gated width check
was strengthened to assert-defined-first per the spec). Nothing further surfaced — list is complete.

Contract coverage: 19/19 assertions tagged (A001–A019) across scan-card-golden.test.ts, scan.test.ts, and the
new direct-render describe.
