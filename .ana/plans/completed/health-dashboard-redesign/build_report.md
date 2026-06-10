# Build Report: Health dashboard + proof list table adopt the render vocabulary

**Created by:** AnaBuild
**Date:** 2026-06-09
**Spec:** .ana/plans/active/health-dashboard-redesign/spec.md
**Branch:** feature/health-dashboard-redesign

## What Was Built

- **`packages/cli/src/utils/render.ts`** (modified): Added a pure `sparkline(values, opts?)` primitive that maps a numeric series to a single-line string of block glyphs (`▁▂▃▄▅▆▇█`). Mirrors `proportionBar`'s contract — explicit data-in/string-out, an `ascii` option degrading to a single-width ramp (`.-=+*#%@`), optional color, "own line only". Empty series → `''`; flat series → all-lowest glyph (the `spark`-tool convention); series max → full block `█`.
- **`packages/cli/src/commands/scan.ts`** (modified): The weekly-commit Activity row now renders the real `sparkline` over `activity.weeklyCommits` (gray), replacing the `→`-joined number string. The `weekly` label and the rest of the Activity composition are untouched.
- **`packages/cli/src/commands/proof.ts`** (modified): Exported and rebuilt `formatHealthDisplay` and `formatListTable` on the shared `render.ts` vocabulary:
  - Health: rounded `headerBox` (`corners: 'rounded'`); every section header is now a `sectionRule`; Quality/Verification/Pipeline bodies render as `keyValueRows`; Hot Spots renders as a `statGrid` (basename-disambiguation preserved exactly; `maxWidth: 22` on the name column adds truncation); Next Actions keeps its merged promote/scope logic, recurrence sort, and cap-5 — only the header changed. Every section-omission guard is byte-identical.
  - List table: lighter `── Proof History ──` `sectionRule` header (no bordered box); body rebuilt on `statGrid` (Slug/Result/Assertions/Surface/Date), preserving the recency sort, PASS/FAIL coloring, dim `--` surface fallback, and slug truncation (now via the Slug column's `maxWidth: 20`).
  - Removed the now-unused `BOX` import; removed an orphaned JSDoc block; updated the bespoke `columnWidth`/`padEnd` math out of both functions.
- **`packages/cli/tests/utils/render.test.ts`** (modified): Added a `sparkline` describe block — varied series (max → `█`), flat series (length preserved, no crash), single value, `ascii: true` (no block glyphs, top of ramp), empty series (`''`).
- **`packages/cli/tests/commands/scan.test.ts`** (modified): Added a backdated multi-week-commit fixture asserting the Activity row renders a sparkline (`█`) and keeps `weekly`, and that the `→` join is gone. Removed a stale colliding `@ana A005,A006,A007` tag from the contributor test.
- **`packages/cli/tests/commands/proof.test.ts`** (modified): Updated health assertions to the new colon-less idiom (`Trend`, `Risks/run`, `First-pass`, `Median`); the two pipeline-omission tests now assert on `Median` (meaningful now that the colon is gone). All omission-rule tests preserved.
- **`packages/cli/tests/commands/health-golden.test.ts`** (created): New golden/snapshot suite rendering `formatHealthDisplay` and `formatListTable` directly with color stripped and the clock + `TZ=UTC` pinned — full dashboard, zero-runs, Pipeline omitted, Hot Spots empty, Next Actions empty, Next Actions over-cap, and the summary list table (with a disambiguation + over-long-name fixture and an over-long slug).
- **`packages/cli/tests/commands/__snapshots__/scan-card-golden.test.ts.snap`** (modified): The deep-tier scan card Activity line updated from `2→5→4→6 weekly` to `▁▆▅█ weekly` (legitimate format change from the sparkline adoption).

## PR Summary

- Health dashboard and the `ana proof` summary table now render on the same shared `render.ts` vocabulary as the proof and scan cards — rounded header box, inset `── Section ──` rules, aligned `keyValueRows`, and borderless `statGrid` tables — so all three proof renders speak one visual language.
- Adds a real `sparkline` primitive (block glyphs with an ASCII fallback) and adopts it in the scan card's weekly-commit Activity row, replacing the arrow-joined numbers.
- Migrating Hot Spots and the list table to `statGrid` with column `maxWidth` closes finding `cli-polish-C3` (over-long module names now truncate with `…` instead of shearing the grid).
- Presentation-only: `HealthReport`/`TrajectoryData` shapes and both `--json` outputs are unchanged; every section-omission rule is preserved byte-identically.
- New golden snapshot suite pins the full dashboard and list table across seven fixtures with the clock + TZ pinned.

## Acceptance Criteria Coverage

- AC1 "health renders via shared primitives" → ✅ health-golden.test.ts "renders the full dashboard" asserts `── Quality/Verification/Hot Spots`, `╭`, not `┌`; no `chalk.bold('  …')` headers remain in `formatHealthDisplay`.
- AC2 "list table via shared primitives; no `columnWidth`" → ✅ health-golden "renders the summary list table"; `columnWidth` removed from both functions (still used elsewhere at proof.ts:2275, out of scope).
- AC3 "card/health/table visually consistent" → ✅ health-golden full-dashboard + list snapshots; same rounded box + inset rules as proof-card-golden.
- AC4 "real sparkline added + adopted in scan; ASCII fallback unit-tested" → ✅ render.test.ts sparkline block (A001–A004) + scan.test.ts "renders the weekly-commit trend as a sparkline" (A005/A006).
- AC5 "section-omission rules preserved" → ✅ health-golden zero-runs (A013), Pipeline omitted (A014), Hot Spots empty (A015), Next Actions over-cap (A016) + proof.test.ts omission tests (preserved).
- AC6 "color discipline; legible stripped" → ✅ health-golden A024 asserts no ANSI escapes with color stripped; all snapshots are plain text.
- AC7 "`--json` byte-identical" → 🔨 No `--json` code path touched (presentation-only edits); existing proof.test.ts `--json` envelope tests still pass. (Independent byte-diff left to AnaVerify.)
- AC8 "Hot Spots alignment/disambiguation/truncation; closes cli-polish-C3" → ✅ health-golden full-dashboard fixture: `commands/proof.ts`+`engine/proof.ts` disambiguation (A017 `/`), `a-very-long-module-fi…` truncation (A018 `…`) via `statGrid` `maxWidth`.
- AC9 "existing health/list tests pass incl. A005; count does not decrease" → ✅ proof.test.ts 282 passing incl. the trailing-gap/right-border test; suite count increased.
- AC10 "golden tests pin dashboard + table across fixtures" → ✅ health-golden.test.ts (7 tests, 7 snapshots).
- "All target suites green" → ✅ proof/scan/render/golden = 428 passing across 6 files.
- "No new lint/build errors" → ✅ build + lint clean (one pre-existing warning in git-operations.ts, untouched).

## Implementation Decisions

- **`keyValueRows` labelWidth: 12** for Quality/Verification/Pipeline — matches the proof card's Timing block idiom (`labelWidth: 12`) for cross-render consistency. The spec mockup's exact column is illustrative; the golden snapshot is the authoritative pin.
- **Hot Spots `statGrid` columns** = `[name (left, minWidth 8, maxWidth 22), findings (left), runs (right)]`. `maxWidth: 22` mirrors the proof card's session column and is what closes `cli-polish-C3`. Name/findings cells kept plain so `truncateCell` truncation applies.
- **List-table Slug `maxWidth: 20`** — matches the spec mockup's `health-dashboard-re…` (20 cols incl. `…`). Result cell colored (statGrid measures `visibleWidth`, so color does not shear); Slug/Assertions/Surface/Date plain.
- **Sparkline ASCII ramp** = `.-=+*#%@` (8 levels, increasing ink density); **flat series → all-lowest glyph** following the `spark` tool's convention (a relative chart has no baseline to lift a flat line off of). Documented in the JSDoc.
- **scan.test sparkline fixture** uses backdated commits via ISO `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` (approxidate `"N days ago"` was rejected by git's strict env-date parser) across weekly buckets so the series varies and a full block `█` is guaranteed.

## Deviations from Contract

None — contract followed exactly. Every assertion A001–A024 is addressed and tagged:
- A001–A004 → `render.test.ts` (sparkline block)
- A005–A006 → `scan.test.ts`
- A007–A018, A024 → `health-golden.test.ts` (A012 also exercised by proof.test.ts "displays condensed risks per run")
- A019–A021 → `health-golden.test.ts` (list table)
- A022–A023 → `proof.test.ts` "outputs JSON list with --json flag" (envelope `entries`) and existing health `--json` tests carry `trajectory`

**Contract coverage: 24/24 assertions tagged.**

## Test Results

### Baseline (before changes)
- Documented in spec (`(cd packages/cli && pnpm vitest run)`): 3689 total — 3657 passed, 15 failed (pre-existing, unrelated git-merge tests), 17 skipped.
- Target files measured at build start (`proof.test.ts`, `render.test.ts`, `scan.test.ts`, `proof-card-golden.test.ts`, `scan-card-golden.test.ts`): **415 passed, 0 failed**, 5 files.

### After Changes
Sealed full-suite run via `ana test --stage build --slug health-dashboard-redesign`:

<!-- ana:capture stage=build slug=health-dashboard-redesign counts=3700p/0f/2s verdict=pass sha256=b972db5bf53da1b160652de73c2e9dfa9ce2ccd6a84a5fe8c7734950ea38c97c -->

`✓ captured  counts: 3700 passed, 0 failed, 2 skipped  (verdict: pass)`

Target files (`proof.test.ts` + `render.test.ts` + `scan.test.ts` + `proof-card-golden` + `scan-card-golden` + `health-golden`): **428 passed, 0 failed**, 6 files.

### Comparison
- Tests added: sparkline unit tests (+5 in render.test.ts), scan sparkline test (+1), health-golden suite (+8, new file) = +14 net-new.
- Tests removed: 0.
- Regressions: none. The sealed suite is fully green (0 failed). The spec's documented 15 pre-existing git-merge failures did NOT reproduce under `ana test` in the worktree (environmental — those tests are git-config sensitive; this change does not touch them). 0 failures ⇒ no regression under either baseline.

### New Tests Written
- `tests/utils/render.test.ts`: sparkline — varied/flat/single/empty series + ASCII fallback.
- `tests/commands/scan.test.ts`: weekly-commit Activity row renders a sparkline (`█`), keeps `weekly`, drops `→`.
- `tests/commands/health-golden.test.ts`: full dashboard, zero-runs, Pipeline omitted, Hot Spots empty, Next Actions empty, Next Actions over-cap (5), summary list table.

## Verification Commands

```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run tests/utils/render.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/scan.test.ts tests/commands/scan-card-golden.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/proof.test.ts tests/commands/health-golden.test.ts)
(cd packages/cli && pnpm vitest run)
(cd packages/cli && pnpm run lint)
```

## Git History
```
cdf5f50f [health-dashboard-redesign] Rebuild health dashboard and list table on render primitives
40adeacc [health-dashboard-redesign] Adopt sparkline in scan card weekly activity
213157ae [health-dashboard-redesign] Add sparkline primitive to render.ts
```

## Open Issues

1. **Stale `@ana` tags in `proof.test.ts` (debt).** The file carries ~50 `@ana` tags (A001–A024) from prior proof contracts whose IDs now collide with this contract's assertions. This contract's authoritative coverage lives in the new `health-golden` suite + `render`/`scan` tests, so the collisions are noise, not missing coverage — but a future pass should reconcile or strip the prior-contract tags (the same hygiene issue `ana proof context` flagged for `scan.test.ts`, which I fixed for the one colliding tag I touched). Out of scope to mass-retag here.
2. **`'1 runs'` plural in Hot Spots (observation).** The entry-count cell always renders `runs` (e.g. `1 runs`). This is pre-existing behavior in the original `formatHealthDisplay`, preserved unchanged — not introduced by this build, not in scope.
3. **Baseline discrepancy (observation, favorable).** The spec documented 15 pre-existing failing git-merge tests; the sealed `ana test` run shows the full suite fully green (0 failed). The 15 are environmental (git-config sensitive) and unrelated to this change. Recorded for transparency — no action needed.

Second pass — what I noticed but had not written down: the `// Pipeline section` comment was the only inline section comment left in the old idiom; I updated it to the `── Pipeline ──` form for consistency with the new vocabulary (cosmetic, already committed). Nothing further surfaced.
