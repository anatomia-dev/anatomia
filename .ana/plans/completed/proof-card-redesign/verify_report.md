# Verify Report: Proof card visual redesign on a shared render vocabulary

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-09
**Spec:** .ana/plans/active/proof-card-redesign/spec.md
**Branch:** feature/proof-card-redesign

> Re-verification after the FAIL round. The previous report's three UNSATISFIED
> assertions (A029/A030/A031, TZ-dependent golden snapshots) and the A026
> all-unpriced `$0.00` risk are the focus. See **Previous Findings Resolution**.

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../proof-card-redesign/contract.yaml
  Seal: INTACT (hash sha256:3c785de70ad7d4c68cf1de057ee9c472aef9a64e97e0470ca6e9d01df0ee3431)
```

Seal status: **INTACT** — contract unmodified since the planner sealed it.

- **Build:** success (`pnpm run build` — tsup ESM, 38ms).
- **Lint:** pass — 0 errors, 1 warning (`packages/cli/src/utils/git-operations.ts:198`, unused eslint-disable) which is **pre-existing** in a file this build does not touch.
- **Tests (full cli suite, sealed verify run):** **3675 passed, 0 failed, 2 skipped** (150 files). Baseline was 3642 + 2 skipped (148 files); previous verify saw 3673. +2 this round from the two new golden fixtures (all-unpriced, counts-unavailable+Codex). Count increased, never decreased.
- **CI-condition re-run (`TZ=UTC pnpm vitest run`, full cli suite):** **150 files, 3675 passed, 0 failed, 2 skipped.** This is the exact condition that failed last round; it is now fully green. The previously-noted non-reproducible single failure did not recur across this and the golden-only UTC/Tokyo/New_York runs.

Sealed verify run marker:
`<!-- ana:capture stage=verify slug=proof-card-redesign counts=3675p/0f/2s verdict=pass sha256=93b0fc17852cbca8a76ea62374fec64fe72e4c2cc7d46dbb5de09f9341ce118b -->`

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | render module provides all six building blocks | ✅ SATISFIED | render.test.ts (module unchanged since round 1); all six primitives exported, unit-tested |
| A002 | section divider shows label, fills to width | ✅ SATISFIED | render.test.ts; live card shows `── Contract ──── 13/13 ✓` |
| A003 | divider can right-align a summary | ✅ SATISFIED | render.test.ts; rollup right-aligned within width |
| A004 | header box keeps 71-column width | ✅ SATISFIED | live card: all 4 header lines measured exactly 71 visible cols |
| A005 | header box rounded corners on request | ✅ SATISFIED | live card header topLeft `╭` |
| A006 | header box square corners by default | ✅ SATISFIED | render.test.ts; health header unchanged (square `┌`) |
| A007 | labelled rows align into a column | ✅ SATISFIED | render.test.ts; Timing block values share a column |
| A008 | numeric columns right-align | ✅ SATISFIED | render.test.ts; live Provenance grid in/out/cache right-aligned |
| A009 | over-long cell truncated, grid not sheared | ✅ SATISFIED | render.test.ts; statGrid maxWidth truncation tested |
| A010 | proportion bar degrades to ASCII | ✅ SATISFIED | render.test.ts; ascii bar has no `█` |
| A011 | status maps to its glyph | ✅ SATISFIED | render.test.ts; SATISFIED → `✓` |
| A012 | card shows verdict prominently in header | ✅ SATISFIED | golden test:237; live card `✓ PASS`; **golden snapshots now pass under UTC** |
| A013 | every section introduced by inset rule | ✅ SATISFIED | golden test:237; live card all sections are `── Label` rules |
| A014 | Contract section summarises satisfied ratio | ✅ SATISFIED | golden test:243 — Contract rule contains `/` (`13/13`) |
| A015 | passing assertions collapse to one line | ✅ SATISFIED | golden test:251 — counted `satisfied` line |
| A016 | failed assertion shown in full with says | ✅ SATISFIED | golden test:287,291 — UNSATISFIED says text present |
| A017 | deviated assertion shows deviation detail | ✅ SATISFIED | golden test:287,292-293 — says + `→` detail present |
| A018 | Findings leads with severity count | ✅ SATISFIED | golden test:244 — Findings rule matches /debt\|obs/ |
| A019 | overflow points to full data (--json) | ✅ SATISFIED | golden test:251,255 — overflow contains `--json` |
| A020 | never a bare 'and N more' | ✅ SATISFIED | golden test:251 — overflow `more — see`, not bare 'and N more' |
| A021 | cost breakdown shows cached tokens | ✅ SATISFIED | golden test:237; live grid has `cache` column |
| A022 | shows input and output tokens | ✅ SATISFIED | golden test:237; live grid `in out cache` columns |
| A023 | ends with separated TOTAL + table version | ✅ SATISFIED | golden test:237; live `TOTAL ... (table 2026-06-08)` under a rule |
| A024 | completeness stated on one line | ✅ SATISFIED | golden test:237; live `completeness ✓ complete (...)` |
| A025 | card fits within 80 columns | ✅ SATISFIED | golden test:268,318-320 — maxLineWidth ≤ 80 across all 7 fixtures |
| A026 | unpriced shown as n/a, never free | ✅ SATISFIED | golden test:277 (mixed) **+ new test:297 (all-unpriced)** — TOTAL is `n/a`, `not.toContain('$')`, `3 unpriced`. **Round-1 finding closed.** |
| A027 | layout correct with color disabled | ✅ SATISFIED | golden test:318-320 — no ANSI escape with chalk.level 0 |
| A028 | --json assertions array unchanged | ✅ SATISFIED | proof.test.ts:624 — `--json` path untouched; only proof.ts footer ternary changed in the fix |
| A029 | provenance-absent golden matches | ✅ SATISFIED | golden test:260 — **passes under UTC** (was UNSATISFIED) |
| A030 | ≥6-sessions golden matches | ✅ SATISFIED | golden test:268 — **passes under UTC** (was UNSATISFIED) |
| A031 | FAIL/DEVIATED golden matches | ✅ SATISFIED | golden test:286 — **passes under UTC**; subtitle renders deterministic `22:40` (was UNSATISFIED) |

All 31 assertions SATISFIED.

## Independent Findings

**The fix cycle is clean and surgical.** Two commits, both tightly scoped:
- `dcc3d3b4` touches only `proof-card-golden.test.ts` + its snapshot: pins `process.env['TZ']='UTC'` in `beforeAll`, restores in `afterAll`, and regenerates the snapshots (10-line snapshot delta — the baked timestamps shifted to UTC).
- `8b38881a` is a **5-line** change to `proof.ts` (the TOTAL footer value becomes `provPriced ? '$'+total : 'n/a'`) plus two new golden fixtures with strong assertions.

`render.ts` was **not touched** this round — the high-quality, pure render module verified in the FAIL round is unchanged, so its assessment carries forward.

**The TZ fix is genuinely robust, not a snapshot-pin band-aid.** I re-ran the golden file under `TZ=UTC`, `TZ=Asia/Tokyo`, and `TZ=America/New_York` (9 passing each), then the **entire cli suite under `TZ=UTC`** (3675 passing, 0 failing) — the exact CI condition. The root cause (local-time rendering vs. baked snapshots) is neutralized by forcing a fixed zone for the snapshot file; the code still renders runtime-local time at runtime (correct behavior for a human reading their own terminal), and only the deterministic test harness is pinned. The file comment correctly notes Node re-reads `process.env.TZ` per `Date` construction, which is why the in-test mutation works.

**The all-unpriced fix closes a real credibility hole, not a hypothetical.** The fix targets the exact trigger I flagged last round: a new model id shipping before `pricing.ts` knows it → every session unpriced → `provTotalCost === 0` → a paid run advertised as `$0.00`. The new `allUnpriced` fixture asserts the TOTAL line contains `n/a` and `not.toContain('$')` — it cannot pass on the mixed-priced gap the old `unpricedModel` fixture left open. The previously-untested counts-unavailable and Codex (`cache_create=0`) paths now have a dedicated fixture (`mixedCounts`) asserting `counts unavailable` and the Codex cache figure `600.0k` (0 create + 600k read).

**Live render confirms the design goal.** `ana proof --last` against real proof data renders a polished card: rounded 71-col header, inset section rules with roll-ups, full proportion bar, collapsed passing line, severity-tagged findings, a right-aligned in/out/cache grid with model-collapse (`model claude-opus-4-8`) and a TOTAL footer under a rule with the price-table version, and a one-line completeness. I measured all four header lines at exactly 71 visible columns — the apparent right-border misalignment in raw output is a multi-byte (3-byte box glyph) artifact, not a real shear.

**Predictions resolved (re-verify focus — did the fix introduce regressions?):**
1. *TZ pin leaks across files / fails to restore* — **Not found.** `afterAll` restores `ORIGINAL_TZ`; full suite green under both local and UTC.
2. *all-unpriced fix breaks the mixed-priced path* — **Not found.** Both `unpricedModel` (mixed → priced TOTAL) and `allUnpriced` (→ `n/a` TOTAL) pass.
3. *TZ pin doesn't actually take effect* — **Not found.** Empirically green under three zones.
4. *new fixtures use weak assertions* — **Not found.** Assertions are specific (`not.toContain('$')`, exact `600.0k`).
5. *counts-unavailable deviates from spec mockup* — **Confirmed, minor.** Rendered as a standalone line, not an in-grid row; substance met, no assertion governs it. Logged as an observation.

## Previous Findings Resolution

### Previously UNSATISFIED Assertions
| ID | Previous Issue | Current Status | Resolution |
|----|----------------|----------------|------------|
| A029 | Provenance-absent golden snapshot failed under UTC (TZ-dependent timestamp) | ✅ SATISFIED | TZ pinned to UTC in `beforeAll`; snapshot regenerated; passes under UTC/Tokyo/NY |
| A030 | ≥6-session golden snapshot failed under UTC | ✅ SATISFIED | Same TZ pin; verified green under `TZ=UTC` |
| A031 | FAIL/DEVIATED golden failed under UTC (`22:40` vs baked `16:40`) | ✅ SATISFIED | Same TZ pin; snapshot now bakes the UTC time deterministically |

### Previous Findings
| Finding | Status | Notes |
|---------|--------|-------|
| Golden snapshots are timezone-dependent (Blocker 1) | Fixed | `beforeAll` pins `process.env['TZ']='UTC'`; full suite green under `TZ=UTC` |
| All-unpriced run renders `$0.00` in TOTAL footer | Fixed | 5-line proof.ts fix: footer value `provPriced ? '$'+total : 'n/a'`; new `allUnpriced` fixture proves it |
| counts-unavailable and Codex sessions untested | Fixed | New `mixedCounts` fixture asserts `counts unavailable` + Codex cache `600.0k` |
| Ad-hoc bold `Phase breakdown` sub-header (AC2) | Still present | proof.ts:386 — not a blocker (AC2 was PARTIAL); defensible as an in-section sub-header. Logged again as debt |
| Stale `@ana A020` tag in proofSummary.test.ts | Still present | Unmodified file; harmless (A020 covered by golden test). Observation |
| Contract over-predicted test file changes (upstream) | Still present | proofSummary.test.ts / commit-hygiene.test.ts needed minimal change. Observation |
| One non-reproducible suite failure | No longer applicable | Did not recur across the sealed run, full UTC run, or three golden-file zone runs |

## AC Walkthrough

- **AC1** — primitives typed, JSDoc'd, unit-tested: ✅ PASS (render.test.ts, unchanged; module not touched this round)
- **AC2** — card uses only shared primitives, no inline construction: ⚠️ PARTIAL — one `chalk.bold('  Phase breakdown')` sub-header survives (proof.ts:386). Not a blocker; in-section sub-header, no top-level section header is hand-built
- **AC3** — every section header is an inset rule with roll-ups: ✅ PASS (live card: Contract ratio, Findings/Build-Concerns severity roll-ups, all `sectionRule`)
- **AC4** — passing collapse, UNSATISFIED/DEVIATED individual with says: ✅ PASS (golden test:251, 287)
- **AC5** — severity roll-up + capped list + actionable `--json` overflow: ✅ PASS (golden test:251,255; live `more — see ... --json`)
- **AC6** — provenance grid in/out/cache + TOTAL under rule + completeness: ✅ PASS (live card; golden test:237)
- **AC7** — 80 cols, single-width, alignment for long ids/≥6/unavailable/unpriced/Codex: ✅ PASS — **previously PARTIAL; now complete.** counts-unavailable and Codex covered by `mixedCounts`; all 7 fixtures ≤80 cols (golden test:318-320)
- **AC8** — color independence, NO_COLOR / non-TTY legible: ✅ PASS (golden test:318-320 — no ANSI with chalk.level 0)
- **AC9** — --json byte-identical: ✅ PASS (A028; fix touched only the human TOTAL footer ternary)
- **AC10** — all tests pass, count not decrease, render.test + golden color-stripped: ✅ PASS — **previously FAIL; now green in CI condition.** 3675 passed under `TZ=UTC`, 0 failed; +2 vs prior round; 5 golden fixtures (now 7 cases)
- **AC11** — Plan paper-validation deliverable: ✅ PASS (satisfied in spec; no build action)
- **headerBox square default; health byte-identical**: ✅ PASS (health header unchanged; 55 health assertions pass)
- **No duplicate BOX/getStatusIcon/formatTokenCount/columnWidth in proof.ts**: ✅ PASS (imported from render.ts; module unchanged)
- **build/test/lint pass**: ✅ PASS — build ✅, lint ✅ (1 pre-existing warning), test ✅ locally AND under `TZ=UTC`

## Blockers

**None.** Every previous blocker is resolved and re-proven under the CI condition that exposed them:
- The golden-snapshot timezone failure (the round-1 blocker) is fixed — I ran the full cli suite under `TZ=UTC` (3675 passed, 0 failed) and the golden file under three distinct zones.
- The all-unpriced `$0.00` credibility risk is fixed and now has a dedicated failing-on-regression fixture.

Searched and cleared as non-blockers this round: the TZ-pin's `process.env` mutation (restored in `afterAll`, no leak observed in the full-suite UTC run); the 5-line footer change (does not affect the mixed-priced path — both fixtures pass; does not touch `--json`); test-count regression (count rose +2, never fell); lint (only the pre-existing unrelated warning).

## Findings

- **Code — Ad-hoc bold sub-header remains in formatHumanReadable:** `packages/cli/src/commands/proof.ts:386` — `chalk.bold('  Phase breakdown')` is the one inline header construction AC2 nominally prohibits. It is a *sub*-header inside the Timing section (multi-phase path), not a top-level section header, so it is a defensible call — but it is literally the pattern AC2 names. Carried unchanged from the FAIL round; was never a blocker. (severity: debt, action: scope)
- **Test — Golden TZ pin mutates process-global `process.env['TZ']`:** `packages/cli/tests/commands/proof-card-golden.test.ts:28` — pinning is correct and robust (green under UTC/Tokyo/NY and full-suite UTC), and `afterAll` restores cleanly. But `process.env.TZ` is process-global; were vitest to ever co-locate this file with another time-dependent test in one worker, that file could transiently see UTC during this run. No leak observed in practice. (severity: observation, action: monitor)
- **Code — counts-unavailable renders as a standalone line, not an in-grid row:** `packages/cli/src/commands/proof.ts:452` — the spec mockup shows the derived-absent session as a row with `counts unavailable` spanning the numeric columns; the implementation renders it as a separate `<label>  counts unavailable` line above the grid. Arguably cleaner (numeric columns never widen), substance fully met, no assertion governs the exact form. (severity: observation, action: acknowledge)
- **Test — Stale `@ana A020` tag:** `packages/cli/tests/utils/proofSummary.test.ts:2409` — tag points at the single-phase phase-breakdown test, but A020 in this contract is the findings-overflow rule. Pre-existing mis-tag in an unmodified file; A020 is correctly covered by the golden test. (severity: observation, action: monitor)
- **Upstream — Contract over-predicted test file changes:** `proofSummary.test.ts` and `commit-hygiene.test.ts` are listed `modify` but their substring `toContain` assertions survive the new format with minimal/no change. Planners could mark such resilient files optional. (severity: observation, action: acknowledge)

Note on proof-chain context: the active findings on `proof.ts` from `ana proof context` (`audit-matrix-orientation-C5`, `learn-session-memory-C1`, `cli-polish-C3`, `proof-last-and-completion-hint-C1/C4`) are **not** resolved by this build — they live in code paths this scope does not change (JSON payloads, helper exports, the health Hot-Spots block). `cli-polish-C3` in particular is only *enabled* to be fixed later: `statGrid` carries the max-width truncation, but `formatHealthDisplay`'s Hot Spots still uses `padEnd` (proof.ts:648+) and adopts the grid in a future scope. No resolution claimed.

## Deployer Handoff

**Shippable — merge it.** The fix cycle did exactly what the FAIL report asked and nothing more: pinned the golden snapshots to UTC (the headline AC10 deliverable now passes on every CI runner — I proved it with a full-suite `TZ=UTC` run), and closed the A026 all-unpriced `$0.00` credibility gap with a 5-line change plus genuine coverage. All 31 contract assertions are SATISFIED; AC7 and AC10 moved from PARTIAL/FAIL to PASS. The render module is unchanged from its already-strong round-1 state.

Residual, all non-blocking and safe to merge as-is: (a) the AC2 `Phase breakdown` bold sub-header is an in-section sub-header, not a top-level header — optional to convert to `sectionRule`; (b) the stale `@ana A020` tag lives in an unmodified file and could be corrected opportunistically; (c) `cli-polish-C3` (Hot-Spots truncation) is intentionally deferred to the health-redesign scope that adopts `statGrid`. The lone lint warning (`git-operations.ts:198`) is pre-existing and out of scope.

## Verdict
**Shippable:** YES

The round-1 blocker — AC10's golden snapshots failing deterministically in CI — is conclusively fixed. I re-ran the full cli suite under `TZ=UTC` (3675 passed, 0 failed) and the golden file under three timezones; the failure cannot reproduce. The all-unpriced `$0.00` risk is closed with a surgical fix and a fixture that fails on regression, and the previously-uncovered counts-unavailable/Codex paths are now tested. All 31 assertions SATISFIED, every AC PASS except a cosmetic AC2 sub-header (PARTIAL, not a blocker). Two independent sealed test accounts agree. I'd stake my name on this shipping.
