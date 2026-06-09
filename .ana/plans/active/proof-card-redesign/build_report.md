# Build Report: Proof card visual redesign on a shared render vocabulary

**Created by:** AnaBuild
**Date:** 2026-06-09
**Spec:** .ana/plans/active/proof-card-redesign/spec.md
**Branch:** feature/proof-card-redesign

> Clean snapshot after one fix cycle (see **Fix History**). Verify cycle 1 returned
> FAIL on a CI-only timezone defect in the golden snapshots; this report reflects the
> final, fixed state. Prior report versions are in git history.

## What Was Built

- **`packages/cli/src/utils/render.ts`** (created): the shared terminal-render vocabulary. Six pure primitives — `headerBox`, `sectionRule`, `keyValueRows`, `statGrid`, `proportionBar`, `statusGlyph` — plus the lifted `formatTokenCount`, `columnWidth`, `BOX`, and a `visibleWidth`/`truncateCell`/`padVisible` trio that computes alignment on the **plain** text and applies color after padding (the ANSI-width trap fix). Every primitive takes an explicit `width` (default 71) and never reads `process.stdout.columns`. `headerBox` defaults to **square** corners (health byte-identity) and opts into rounded via `corners: 'rounded'`.
- **`packages/cli/src/commands/proof.ts`** (modified): `formatHumanReadable` rebuilt entirely on the primitives — rounded `headerBox` headline (`✓ PASS · feature` / `✗ FAIL · feature`) with a `surface · duration[ · cost]` subtitle; `sectionRule`s with roll-ups; a contract `proportionBar` + collapsed counted line with UNSATISFIED/DEVIATED assertions (and folded-in Deviations) rendered individually; Findings + Build Concerns through one shared `renderSeverityList` helper with an actionable `--json` overflow line; and a Provenance `statGrid` surfacing **in / out / cache** token columns with a `TOTAL` footer under a rule. `formatHealthDisplay` adopts `headerBox` with default (square) corners → byte-identical. The duplicated `BOX`, `getStatusIcon`, `formatTokenCount`, `columnWidth` were removed. **Fix cycle:** the Provenance TOTAL footer now renders `n/a` when no session is priced (previously an unconditional `$${provTotalCost.toFixed(2)}` that printed `$0.00` for an all-unpriced run).
- **`packages/cli/tests/utils/render.test.ts`** (created): 23 unit tests, one describe per primitive, tagged `@ana A001`–`A011`.
- **`packages/cli/tests/commands/proof-card-golden.test.ts`** (created): `toMatchSnapshot` over the full card across **seven** in-memory fixtures (provenance-rich, provenance-absent, ≥6 sessions, unpriced model, FAIL/DEVIATED, **all-unpriced**, **counts-unavailable/Codex**) with `chalk.level = 0`, plus tagged assertions for the card-level contract. **Fix cycle:** the suite pins `process.env.TZ = 'UTC'` in `beforeAll` (restored in `afterAll`) so the timestamp-bearing snapshots are deterministic on every runner; two new fixtures added for the AC7 alignment edges.
- **`packages/cli/tests/commands/__snapshots__/proof-card-golden.test.ts.snap`** (created): the seven committed golden snapshots, captured under UTC.
- **`packages/cli/tests/commands/proof.test.ts`** (modified): rewrote the ~9 exact-format assertions broken by the redesign; added one `@ana A028` test proving the `--json` path still carries the assertions array unchanged. No test deleted.

## PR Summary

- Introduces `utils/render.ts`, a shared, pure terminal-render vocabulary (six primitives + lifted helpers) that the proof, scan, and health cards can converge on instead of each re-deriving box/section/grid/glyph logic.
- Rebuilds the `ana proof <slug>` human card on those primitives: rounded header with verdict and cost, inset section rules with roll-ups, a contract proportion bar, collapsed passing assertions with failures/deviations shown in full, and a Provenance grid with input/output/**cache** tokens per session and a separated TOTAL.
- Credibility: unpriced sessions render `n/a`, and an entirely-unpriced run now shows an `n/a` TOTAL rather than a misleading `$0.00` — a real future trigger is a new model id missing from `pricing.ts`.
- `ana proof health` adopts the shared header primitive with square corners, leaving its output byte-identical; the `--json` render path is untouched.
- Golden snapshot tests are pinned to UTC so they are deterministic in CI while the product keeps rendering local time for users.

## Acceptance Criteria Coverage

- AC1 "typed, unit-tested primitives" → render.test.ts (23 tests) — `@ana A001`–`A011` ✅
- AC2 "card uses only shared primitives" → proof.ts `formatHumanReadable` rebuild ✅ (one `chalk.bold('Phase breakdown')` Timing **sub**-header remains — see Open Issues #4 / Deviations)
- AC3 "every section header is an inset rule; Contract & Findings carry roll-ups" → golden "provenance-rich" — `@ana A013, A014, A018` ✅
- AC4 "passing collapse; UNSATISFIED/DEVIATED individually" → golden "FAIL/DEVIATED" + proof.test.ts — `@ana A015, A016, A017` ✅
- AC5 "severity roll-up + actionable `--json` overflow" → golden + proof.test.ts — `@ana A019, A020` ✅
- AC6 "Provenance grid w/ in+out+cache, TOTAL + table version, completeness" → golden "provenance-rich" — `@ana A021, A022, A023, A024` ✅
- AC7 "≤80 cols; alignment for long ids / ≥6 / counts-unavailable / unpriced / Codex" → golden ≥6 + unpriced + **all-unpriced** + **counts-unavailable/Codex** fixtures + all-fixtures ≤80 — `@ana A025, A026, A030` ✅ (all listed edges now have a fixture)
- AC8 "color independence" → golden "no ANSI escapes when color stripped" — `@ana A027` ✅
- AC9 "`--json` byte-identical" → proof.test.ts `@ana A028` ✅
- AC10 "existing tests pass, count rises, render + golden tests exist; green where it must be" → full suite 3675 pass (+33), **green under TZ=UTC (CI parity)** ✅
- AC11 "(Plan deliverable — paper-validation)" → satisfied in spec; Provenance is the in-build stress test 🔨
- "`headerBox` square default; health byte-identical" → `formatHealthDisplay` adopts `headerBox()` defaults; health assertions pass unchanged ✅
- "No duplicate BOX/getStatusIcon/formatTokenCount/columnWidth in proof.ts" → removed; imported from render.ts ✅
- "vitest passes; build succeeds; lint passes" → 3675 pass / 0 fail (local **and** UTC); `pnpm build` green; lint clean on changed files ✅

## Contract Coverage

31/31 assertions tagged. A029/A030/A031 (golden snapshots) — previously UNSATISFIED in CI due to the timezone defect — are now satisfied: the snapshots match deterministically under `TZ=UTC` and `TZ=America/Denver`.

## Implementation Decisions

- **TZ pinned in the test, not the product.** The card renders its header timestamp in *local* time, which is the correct UX for a CLI receipt — a user wants their own wall-clock. The defect was only that the golden snapshots baked author-local times and so failed under CI's UTC. The fix pins the *test* timezone (UTC) for determinism and leaves the product rendering local time. Node re-reads `process.env.TZ` on each `Date` construction (verified empirically), so a `beforeAll` set takes effect before any fixture renders; `afterAll` restores the original so no other suite inherits it.
- **all-unpriced TOTAL → `n/a`.** Mirrors the existing per-session `n/a`. The trailing `(table vX)` is kept even when the value is `n/a` — it records which price table was consulted (and found no row), which is informative, not misleading.
- **Codex fixture uses a real non-claude model id (`gpt-5-codex`).** Its cost renders `n/a` (unknown to `pricing.ts`), which is realistic; the fixture's purpose is the `cache_create = 0` alignment case (cache column = 0 create + 600k read = `600.0k`), which it exercises directly.
- (From cycle 1, retained) Verdict glyph rendered on both PASS and FAIL headlines (honoring spec behavioral text over the illustrative mockup); unpriced count carried on the left of the TOTAL label to keep the line ≤80; counts-unavailable sessions rendered as free lines before the grid; `renderSeverityList` collapses the duplicated `SEVERITY_ORDER` logic.

## Deviations from Contract

None — contract followed exactly. All 31 assertions (A001–A031) are satisfied with tagged tests; coverage is 31/31.

One **spec-task-list** deviation (not a contract assertion), carried from cycle 1 and unchanged: AC2's "no inline construction" is met for all top-level card sections, but one `chalk.bold('  Phase breakdown')` Timing **sub**-header remains (it is a sub-section inside Timing, and `proofSummary.test.ts` asserts the `Phase breakdown` token). Left as-is per agreed scope (Open Issue #4). Documented here for the reviewer.

## Fix History

**Cycle 1 (initial build):** Built the render vocabulary, rebuilt the proof card, health header adoption, tests. Suite green locally (3673 pass). Verify FAILED: 5 golden snapshots are timezone-dependent and fail under CI's UTC (`16:40` MDT baked vs `22:40` UTC rendered) → A029/A030/A031 UNSATISFIED, AC10 red in CI. Verifier also flagged the all-unpriced `$0.00` risk (A026 defended on a gap) and missing AC7 fixtures.

**Cycle 2 (this report) — scope: blocker + (a) + (b), agreed with developer:**
- **Blocker** — pinned the golden suite to `TZ=UTC` (`beforeAll`/`afterAll`) and regenerated the 5 snapshots. Now deterministic; proven green under both UTC and Denver, and the full suite is green under `TZ=UTC`. → A029/A030/A031 satisfied, AC10 CI-green. *(commit `dcc3d3b4`)*
- **(a) risk** — Provenance TOTAL renders `n/a` when no session is priced. → closes the A026 all-unpriced gap. *(commit `8b38881a`)*
- **(b) debt** — added all-unpriced and counts-unavailable/Codex golden fixtures. → AC7's listed alignment edges all now have a fixture. *(commit `8b38881a`)*
- The AC2 `Phase breakdown` sub-header was explicitly **out of scope** for this cycle (optional polish; risks `proofSummary.test.ts` churn).

## Test Results

### Baseline (start of this fix cycle, local TZ)
Command: `(cd packages/cli && pnpm vitest run)`
```
Test Files  150 passed (150)
     Tests  3673 passed | 2 skipped (3675)
```
(Locally green, but 5 golden snapshots fail under `TZ=UTC` — the CI defect this cycle fixes.)

### After Changes (sealed, local TZ)
Command: `ana test --stage build --slug proof-card-redesign`
```
✓ captured  counts: 3675 passed, 0 failed, 2 skipped  (verdict: pass)
```
<!-- ana:capture stage=build slug=proof-card-redesign counts=3675p/0f/2s verdict=pass sha256=85def15f688b7dd11858c760b51562efc9b82c4912f9366aa6e644109dc764f6 -->

### After Changes (CI parity — full suite under TZ=UTC)
Command: `(cd packages/cli && TZ=UTC pnpm vitest run)`
```
Test Files  150 passed (150)
     Tests  3675 passed | 2 skipped (3677)
```
This is the headline proof: the suite is now green where it must be (UTC/CI), not only locally.

### Comparison
- Tests added this cycle: **+2** (the two new golden fixtures: all-unpriced, counts-unavailable/Codex). Total added by the feature: **+33** vs the pre-feature baseline of 3642.
- Tests removed: **0**
- Regressions: **none** (0 failures under both local TZ and UTC)
- Golden snapshots: 5 → 7

### New Tests Written (this cycle)
- `proof-card-golden.test.ts` "renders an all-unpriced run with an n/a TOTAL, never $0.00" — asserts the TOTAL line carries `n/a` and no `$`, `3 unpriced` count, ≤80 cols.
- `proof-card-golden.test.ts` "renders counts-unavailable and Codex (cache_create=0) sessions aligned" — asserts the `counts unavailable` line and the `600.0k` cache figure, ≤80 cols.

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run tests/utils/render.test.ts)
(cd packages/cli && TZ=UTC pnpm vitest run tests/commands/proof-card-golden.test.ts)   # CI-parity check
(cd packages/cli && pnpm vitest run tests/commands/proof.test.ts tests/commands/proof-card-golden.test.ts tests/utils/proofSummary.test.ts tests/commands/commit-hygiene.test.ts)
(cd packages/cli && TZ=UTC pnpm vitest run)
(cd packages/cli && pnpm run lint)
```

## Git History
```
8b38881a [proof-card-redesign] Fix: n/a TOTAL when all-unpriced; cover unpriced/Codex edges
dcc3d3b4 [proof-card-redesign] Fix: pin golden snapshot tests to UTC so they pass in CI
9bb6bcb1 [proof-card-redesign] Add A028 coverage: --json path carries assertions unchanged
86ac832d [proof-card-redesign] Rebuild proof card on render primitives; health header adopts headerBox
cd63c827 [proof-card-redesign] Add shared render vocabulary (utils/render.ts) + primitive tests
```
(The intervening `Build report` / `Verify report` commits are pipeline artifacts.)

## Open Issues

1. **AC2 `Phase breakdown` sub-header is a plain `chalk.bold` label, not a `sectionRule`** — `proof.ts:386`. It is a Timing sub-section (not a top-level card section) and `proofSummary.test.ts` asserts the `Phase breakdown` token. Explicitly out of scope for this fix cycle by agreement; would be cheap to convert to a `sectionRule` if the token assertion is updated in lockstep. (debt / scope)
2. **Pre-existing `@ana` tag-ID collision** — `proof.test.ts`/`proof.ts` carry `@ana A0xx` tags from the *original* proof contract, which reuse IDs this feature's contract assigns to different assertions. Tag-driven verification could mis-map the old ones. This feature's genuine coverage is in `render.test.ts` (A001–A011) and `proof-card-golden.test.ts` + the A028 test (A012–A031). (observation / monitor)
3. **Stale `@ana A020` tag in `proofSummary.test.ts:2409`** (verifier finding) — points at the phase-breakdown test, but A020 here is the findings-overflow rule. Pre-existing mis-tag in a file this build does not modify; A020 is correctly covered by the golden test. Flagged for a future tag sweep, not fixed here (out of scope; unmodified file). (observation / monitor)
4. **Finding/Build-Concern summaries are not width-bounded** — free text; a pathological long summary could exceed 80 cols. The card's *structural* layout stays ≤80 across all seven golden fixtures. The `statGrid`/`keyValueRows` truncation primitives are the eventual fix when health adopts them (`cli-polish-C3`). Pre-existing behavior. (debt / monitor)
5. **Pre-existing lint warning** — `src/utils/git-operations.ts:198` "Unused eslint-disable directive". Not a file this build touches; flagged by the verifier as pre-existing. Not introduced here. (observation / acknowledge)

Second pass — re-examined for anything noticed but unwritten: the `n/a` TOTAL keeps its `(table vX)` trailing token (intentional — records the consulted table; documented in Implementation Decisions); the counts-unavailable session is correctly excluded from `provUnpriced` (it has no `derived`, so the mixed-counts TOTAL reads `1 unpriced`, counting only the Codex row — verified against the snapshot); TZ restoration in `afterAll` handles the `undefined` original case via `delete`. The one previously-noted non-reproducible single-test failure from cycle 1's first sealed run did not recur in any of this cycle's runs (sealed local + full UTC + targeted), consistent with a transient. All surfaced concerns are captured above. Verified complete by second pass.
