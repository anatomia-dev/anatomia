# Build Report: Proof card visual redesign on a shared render vocabulary

**Created by:** AnaBuild
**Date:** 2026-06-09
**Spec:** .ana/plans/active/proof-card-redesign/spec.md
**Branch:** feature/proof-card-redesign

## What Was Built

- **`packages/cli/src/utils/render.ts`** (created): the shared terminal-render vocabulary. Six pure primitives — `headerBox`, `sectionRule`, `keyValueRows`, `statGrid`, `proportionBar`, `statusGlyph` — plus the lifted `formatTokenCount`, `columnWidth`, `BOX`, and a `visibleWidth`/`truncateCell`/`padVisible` trio that computes alignment on the **plain** text and applies color after padding (the ANSI-width trap fix). Every primitive takes an explicit `width` (default 71) and never reads `process.stdout.columns`. `headerBox` defaults to **square** corners (health byte-identity) and opts into rounded via `corners: 'rounded'`; the square-default-as-transition intent is documented in its JSDoc.
- **`packages/cli/src/commands/proof.ts`** (modified): `formatHumanReadable` rebuilt entirely on the primitives — no inline box literals or ad-hoc `bold + gray ─` headers remain. Rounded `headerBox` headline (`✓ PASS · feature` / `✗ FAIL · feature`) with a `surface · duration[ · cost]` subtitle; `sectionRule`s with roll-ups (Contract ratio, Findings/Concerns severity counts); a contract `proportionBar` + collapsed counted line, with UNSATISFIED/DEVIATED assertions (and the **folded-in Deviations detail**) rendered individually; Findings + Build Concerns routed through one shared `renderSeverityList` helper (`SEVERITY_ORDER` sort + `severityRollup` collapsed from the two duplicated blocks) with an actionable `--json` overflow line; and a Provenance `statGrid` surfacing **in / out / cache** token columns with a `TOTAL` footer under a rule. `formatHealthDisplay` adopts `headerBox` with default (square) corners → byte-identical. The duplicated `BOX`, `getStatusIcon`, `formatTokenCount`, `columnWidth`, and stale `// @ana A005, A006` tag were removed.
- **`packages/cli/tests/utils/render.test.ts`** (created): 23 unit tests, one describe per primitive (shape + alignment + the edge that matters), tagged `@ana A001`–`A011`.
- **`packages/cli/tests/commands/proof-card-golden.test.ts`** (created): `toMatchSnapshot` over the full card across five in-memory fixtures (provenance-rich, provenance-absent, ≥6 sessions, unpriced model, FAIL/DEVIATED) with `chalk.level = 0`, plus explicit tagged assertions for `@ana A012`–`A027`, `A029`–`A031`.
- **`packages/cli/tests/commands/__snapshots__/proof-card-golden.test.ts.snap`** (created): the five committed golden snapshots.
- **`packages/cli/tests/commands/proof.test.ts`** (modified): rewrote the ~9 exact-format assertions broken by the redesign (verdict in header, contract ratio in the rule roll-up, deviation folded inline, `--json` overflow, rounded corners, surface in subtitle, per-session cost in the grid); added one `@ana A028` test proving the `--json` path still carries the assertions array unchanged. No test deleted; count rises.

## PR Summary

- Introduces `utils/render.ts`, a shared, pure terminal-render vocabulary (six primitives + lifted helpers) that the proof, scan, and health cards can converge on instead of each re-deriving box/section/grid/glyph logic.
- Rebuilds the `ana proof <slug>` human card on those primitives: rounded header with the verdict and cost, inset section rules with roll-ups, a contract proportion bar, collapsed passing assertions with failures/deviations shown in full, and a Provenance grid.
- Credibility fix: the Provenance breakdown now shows **input, output, AND cache** tokens per session with a clearly separated TOTAL and price-table version, so each session's cost reconciles. Unpriced models render `n/a`, never `$0.00`.
- `ana proof health` adopts the shared header primitive with square corners, leaving its output byte-identical; the `--json` render path is untouched.
- Adds 31 tests (23 primitive units + 7 golden snapshots + 1 JSON-integrity check); no existing test removed.

## Acceptance Criteria Coverage

- AC1 "typed, unit-tested primitives" → render.test.ts (23 tests, one describe per primitive) — `@ana A001`–`A011` ✅
- AC2 "card uses only shared primitives, no inline box/section literals" → proof.ts `formatHumanReadable` rebuild; golden snapshots show the result ✅ (no `BOX.*repeat`/`bold+gray ─` constructs remain in the function)
- AC3 "every section header is an inset rule; Contract & Findings carry roll-ups" → proof-card-golden.test.ts "provenance-rich card" asserts `── Contract` + ratio roll-up + Findings severity roll-up — `@ana A013, A014, A018` ✅
- AC4 "passing collapse; UNSATISFIED/DEVIATED render individually" → golden "FAIL/DEVIATED card" + proof.test.ts "displays says/deviations" — `@ana A015, A016, A017` ✅
- AC5 "severity roll-up + actionable `--json` overflow, never bare 'and N more'" → golden "collapses passing… overflow to --json" + proof.test.ts "shows top 5… overflow" — `@ana A019, A020` ✅
- AC6 "Provenance grid w/ input+output+cache, per-session & TOTAL cost + table version, rule-separated TOTAL, completeness one line" → golden "provenance-rich" — `@ana A021, A022, A023, A024` ✅
- AC7 "≤80 cols, single-width glyphs, alignment for long ids / ≥6 sessions / counts-unavailable / unpriced / Codex" → golden "≥6-session" + "unpriced" + the all-fixtures ≤80 check — `@ana A025, A026, A030` ✅
- AC8 "color independence, legible with NO_COLOR / non-TTY" → golden "no ANSI escapes when color stripped" — `@ana A027` ✅
- AC9 "`--json` byte-identical" → proof.test.ts "still carries the assertions array unchanged" + the `--json` render path was not touched — `@ana A028` ✅
- AC10 "existing tests pass, count rises, render + golden tests exist" → full suite 3673 pass (+31), render.test.ts + proof-card-golden.test.ts added ✅
- AC11 "(Plan deliverable — paper-validation)" → satisfied in the spec; Provenance is the in-build stress test that exercises `statGrid`'s right-aligned numerics + footer-under-rule + label truncation 🔨
- "`headerBox` square default; health byte-identical" → `formatHealthDisplay` adopts `headerBox()` defaults; all existing health-display assertions pass unchanged ✅
- "No duplicate BOX/getStatusIcon/formatTokenCount/columnWidth in proof.ts" → removed; imported from render.ts (typecheck enforces) ✅
- "vitest passes; build succeeds; lint passes" → 3673 pass / 0 fail; `pnpm build` green; lint clean on changed files ✅

## Implementation Decisions

- **Verdict glyph on the PASS headline.** The PASS mockup omits a leading glyph, but spec text (line 132) says "green ✓ on PASS headline, red ✗ on FAIL headline," and AC8 requires every colored element to be paired with a glyph/word. I render `✓ PASS` / `✗ FAIL` (glyph on both verdicts), honoring the explicit behavioral text over the illustrative mockup. The golden snapshots encode this.
- **TOTAL line layout.** The spec mockup appends `· N unpriced` after the right-aligned cost on the TOTAL line. Appending a long suffix there overflowed the 80-column ceiling (observed: 86 cols on the unpriced fixture). I moved the unpriced count onto the **left** of the TOTAL label (`TOTAL  3 sessions · 1 unpriced`) and kept only `(table vX)` as the right trailing token. Both the table version and unpriced count are present (AC6/AC7), and every line stays ≤80.
- **Counts-unavailable sessions** render as free gray lines (kept out of the grid so their text can't widen a numeric column and shear alignment), placed before the derived-session grid to be loud about the data gap. See build_data.yaml.
- **Mixed-model labels** render `role · <model-without-claude-prefix>` and truncate the **label** column (`statGrid` `maxWidth: 22`), never the numeric columns, matching the spec's width-tight rule.
- **`renderSeverityList` shared helper.** Collapsed the duplicated severity-sort + roll-up logic from the Findings and Build Concerns blocks into one helper (`sortBySeverity` + `severityRollup`), resolving the known `SEVERITY_ORDER`-duplication build concern rather than carrying it forward.
- **`proofSummary.test.ts` and `commit-hygiene.test.ts` were NOT modified.** The spec listed them as "modify," but every assertion in them is a substring check on tokens the redesign preserves (`Phase breakdown`, `Build N` / `Verify N`, `Commit Hygiene`, the hygiene `message`). They pass unchanged against the new format; modifying them would have been churn with no behavioral need.

## Deviations from Contract

None — contract followed exactly. All 31 assertions (A001–A031) are satisfied with tagged tests; coverage is 31/31. The items above are deviations from the *illustrative mockup* / spec task-list, not from any contract assertion, and are documented as Implementation Decisions.

## Test Results

### Baseline (before changes)
Command: `(cd packages/cli && pnpm vitest run)` — captured 2026-06-09
```
Test Files  148 passed (148)
     Tests  3642 passed | 2 skipped (3644)
```

### After Changes
Command: `ana test --stage build --slug proof-card-redesign` (capture-sealed)
```
Test Files  150 passed (150)
     Tests  3673 passed | 2 skipped (3675)
```
<!-- ana:capture stage=build slug=proof-card-redesign counts=3673p/0f/2s verdict=pass sha256=692da6f64a0bcdd2202cc2344911aa41c5e4bcb7e060dd938b263106c643caa4 -->

### Comparison
- Tests added: **31** (render.test.ts 23 + proof-card-golden.test.ts 7 + proof.test.ts A028 1)
- Tests removed: **0**
- Regressions: **none** (0 failures; baseline failures were 0)
- Test files: 148 → 150 (2 new test files)

### New Tests Written
- `tests/utils/render.test.ts` — each primitive in isolation: header 71-width + square/rounded corners + colored-glyph width preservation; section-rule label + right-aligned roll-up + fill-to-width; key/value column alignment; stat-grid right-aligned numerics + over-width truncation + footer-under-rule; proportion-bar ASCII degradation + 0%/100% bounds; status-glyph per status; lifted-helper behavior.
- `tests/commands/proof-card-golden.test.ts` — full-card snapshots across five fixtures + tagged assertions for the card-level contract assertions + an all-fixtures ≤80-column and no-ANSI check.

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run tests/utils/render.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/proof.test.ts tests/commands/proof-card-golden.test.ts tests/utils/proofSummary.test.ts tests/commands/commit-hygiene.test.ts)
(cd packages/cli && pnpm vitest run)
(cd packages/cli && pnpm run lint)
```

## Git History
```
9bb6bcb1 [proof-card-redesign] Add A028 coverage: --json path carries assertions unchanged
86ac832d [proof-card-redesign] Rebuild proof card on render primitives; health header adopts headerBox
cd63c827 [proof-card-redesign] Add shared render vocabulary (utils/render.ts) + primitive tests
```

## Open Issues

1. **Pre-existing `@ana` tag-ID collision** — `proof.test.ts` and `proof.ts` carry `@ana A0xx` tags from the *original* proof contract, while this feature's contract reuses `A001`–`A031` for different assertions. A verifier scanning tags could mis-map the old ones. This feature's genuine, correct coverage is in `render.test.ts` (A001–A011) and `proof-card-golden.test.ts` + the new A028 test (A012–A031). (observation / monitor)
2. **Finding / Build-Concern summaries are not width-bounded** — they are free text; a pathological long summary could exceed 80 cols. The card's *structural* layout (header, grid, rules, footer) stays ≤80 across all five golden fixtures. The `statGrid`/`keyValueRows` truncation primitives are the eventual fix when health adopts them (this is the known `cli-polish-C3` direction). Pre-existing behavior — the old card did not truncate summaries either. (debt / monitor)
3. **Counts-unavailable provenance rows** render before the grid rather than interleaved in dataset order, to preserve numeric-column alignment and surface the gap loudly. No in-scope fixture exercises this beyond unit reasoning. (observation / acknowledge)
4. **"Phase breakdown" sub-label** is a plain `chalk.bold` label, not a `sectionRule` (it is a Timing sub-section, not a top-level card section); kept to preserve the `Build N` / `Verify N` tokens asserted by `proofSummary.test.ts`. (observation / acknowledge)

Second pass — re-examined for anything noticed but unwritten: the header subtitle right-content (timestamp) sits flush to the inner border with no trailing gap (correct right-alignment; the mockup's trailing spaces were illustrative); the contract `proportionBar` is fixed at 64 glyphs + 2 indent = 66 cols, comfortably within 80; mixed-model label truncation (maxWidth 22) was verified to keep numeric columns intact on the unpriced fixture. All surfaced concerns are captured in the four items above. Verified complete by second pass.
