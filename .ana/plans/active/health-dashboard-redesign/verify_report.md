# Verify Report: Health dashboard + proof list table adopt the render vocabulary

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-09
**Spec:** .ana/plans/active/health-dashboard-redesign/spec.md
**Branch:** feature/health-dashboard-redesign

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../health-dashboard-redesign/contract.yaml
  Seal: INTACT (hash sha256:1d37e682fd7af4a382ab8f06b453253518f71f6cf4ea3d3b2cf30271167b6631)
```

Seal status: **INTACT** — the contract is unmodified since AnaPlan sealed it.

**Build:** `(cd packages/cli && pnpm run build)` — success (tsup ESM, 58ms).
**Tests:** sealed verify run via `ana test --stage verify` — **3700 passed, 0 failed, 2 skipped (verdict: pass)**.
Independent CLI-only full run `(cd packages/cli && pnpm vitest run)` — **3699 passed, 1 failed, 2 skipped**; the 1 failure is `tests/commands/init/template-propagation.test.ts > a Claude-only project never creates or touches the .codex tree`, which **passes in isolation (21/21)** — a flaky subprocess test under full-suite parallel load (5031ms), unrelated to this build's scope (render/proof/scan). Not a regression.
Target suites `proof.test.ts scan.test.ts render.test.ts health-golden.test.ts scan-card-golden.test.ts proof-card-golden.test.ts` — **428 passed across 6 files** (baseline 415 across 5; +13 includes the new golden suite). Test count did not decrease.
**Lint:** `(cd packages/cli && pnpm run lint)` — **0 errors**, 1 pre-existing warning in `packages/cli/src/utils/git-operations.ts` (unused eslint-disable), a file this build does not touch.

Sealed test marker:
```
<!-- ana:capture stage=verify slug=health-dashboard-redesign counts=3700p/0f/2s verdict=pass sha256=c9f994079d2bbbe809a5ba49baa504aad484f75ae8baa4a58c4e233307e54b33 -->
```

## Contract Compliance
| ID   | Says                                                          | Status       | Evidence |
|------|---------------------------------------------------------------|--------------|----------|
| A001 | Trends render as a real bar chart, not arrow-joined numbers   | ✅ SATISFIED | render.test.ts:204 — `sparkline([2,5,4,6])` asserts `.toContain('█')` + `▁` + length 4 |
| A002 | Flat trend renders cleanly without crashing                   | ✅ SATISFIED | render.test.ts:212 — flat `[3,3,3]` asserts `spark.length` `.toBe(3)` and `=== '▁▁▁'`; guarded by `range > 0 ? … : 0` (render.ts:486) |
| A003 | Trend chart degrades to plain ASCII on low-fidelity terminals | ✅ SATISFIED | render.test.ts:224 — `{ascii:true}` asserts `.not.toContain('█')` (+ all blocks absent) |
| A004 | Empty trend renders as nothing rather than an error           | ✅ SATISFIED | render.test.ts:236 — `sparkline([])` asserts `emptySpark.length` `.toBe(0)` |
| A005 | Scan card shows weekly-commit trend as a real sparkline       | ✅ SATISFIED | scan.test.ts:1303 asserts Activity line `.toContain('█')` + `.not.toContain('→')`; live `ana scan` → `Activity  3 active contributors · ▂▁▅█ weekly` |
| A006 | Weekly-activity label preserved on the scan card              | ✅ SATISFIED | scan.test.ts:1303 asserts `.toContain('weekly')`; confirmed live |
| A007 | Health dashboard uses the same rounded header as proof card   | ✅ SATISFIED | health-golden.test.ts:167 `.toContain('╭')`; snapshot pins `╭…╮` (71 wide) |
| A008 | Old hand-rolled square box is gone                            | ✅ SATISFIED | health-golden.test.ts:168 `.not.toContain('┌')`; `BOX` import removed from proof.ts |
| A009 | Quality section introduced by a clean inset rule              | ✅ SATISFIED | health-golden.test.ts:169 `.toContain('── Quality')` |
| A010 | Verification section introduced by a clean inset rule         | ✅ SATISFIED | health-golden.test.ts:170 `.toContain('── Verification')` |
| A011 | Hot Spots section introduced by a clean inset rule            | ✅ SATISFIED | health-golden.test.ts:171 `.toContain('── Hot Spots')` |
| A012 | Risk trend numbers still reported                             | ✅ SATISFIED | health-golden.test.ts:172 `.toContain('(last 5)')`; snapshot `Risks/run  1 (last 5) · 2 (all)` |
| A013 | No-runs dashboard shows a clear no-data message               | ✅ SATISFIED | health-golden.test.ts:184 `.toContain('No data.')`; live `0 runs` path confirmed |
| A014 | Pipeline hidden when too few timed runs                       | ✅ SATISFIED | health-golden.test.ts:191 `.not.toContain('── Pipeline')` on `pipeline:undefined` fixture |
| A015 | Hot Spots hidden when there are none                          | ✅ SATISFIED | health-golden.test.ts:199 `.not.toContain('── Hot Spots')` on empty fixture |
| A016 | Next Actions never shows more than five                       | ✅ SATISFIED | health-golden.test.ts:213 — 8-candidate fixture, `actionLines.length` `.toBe(5)`; snapshot shows exactly 5 |
| A017 | Hot Spots disambiguates colliding basenames via folder        | ✅ SATISFIED | health-golden.test.ts:173 `.toContain('/')`; snapshot pins `commands/proof.ts` + `engine/proof.ts` (see Findings — substring is loose, snapshot is load-bearing) |
| A018 | Over-long module name truncated, not sheared                  | ✅ SATISFIED | health-golden.test.ts:174 `.toContain('…')`; snapshot pins `a-very-long-module-fi…`; statGrid maxWidth:22 + truncateCell (render.ts:97) |
| A019 | Summary list uses clean inset header, not a bold label        | ✅ SATISFIED | health-golden.test.ts:222 `.toContain('── Proof History')` |
| A020 | Summary list shows each proof's pass/fail result              | ✅ SATISFIED | health-golden.test.ts:223 `.toContain('PASS')` + `FAIL`; live list confirms |
| A021 | Very long slug truncated in summary list                      | ✅ SATISFIED | health-golden.test.ts:225 `.toContain('…')`; snapshot pins `health-dashboard-re…` (Slug maxWidth:20) |
| A022 | Health JSON still carries trajectory unchanged                | ✅ SATISFIED | proof.test.ts:2686 `json.results.trajectory` typeof object; live `proof health --json` → trajectory key present; JSON code path untouched in diff |
| A023 | Proof list JSON still carries entries unchanged               | ✅ SATISFIED | proof.test.ts:255 `json.results.entries` instanceof Array; live `proof --json` → entries present (count 201) |
| A024 | Dashboard legible with color stripped, no stray escapes       | ✅ SATISFIED | health-golden.test.ts:175 `/\x1b\[/.test(out)` `.toBe(false)`; snapshot is pure plain text |

**24 of 24 assertions SATISFIED.**

## Independent Findings

The migration is clean and faithful to the spec's "presentation-only" mandate. Both `formatHealthDisplay` and `formatListTable` were rebuilt on the shared `render.ts` vocabulary (`headerBox` rounded, `sectionRule`, `keyValueRows`, `statGrid`) with 11 primitive call-sites and **zero** hand-rolled box-drawing or `chalk.bold('  …')` headers remaining in either function (swept lines 537–825). The `BOX` import was correctly dropped; `columnWidth` survives only at proof.ts:2288 — a different function out of this build's scope — so AC2 holds for both target functions and the import is not orphaned.

**Predictions resolved:** (1) sparkline flat-series divide-by-zero — *not found*; guarded by `range > 0 ? … : 0` (render.ts:486), and A002's test pins `▁▁▁`. (2) scan.ts adopts sparkline without `ascii` — *confirmed*; see Findings (observation, not a blocker — the whole card already requires UTF-8). (3) leftover `columnWidth` in the two functions — *not found*. (4) surviving inline bold header — *not found*. (5) A024 trivially-passing — *not found*; the golden suite strips color via `chalk.level=0` and the snapshot is verifiably escape-free.

**Surprised:** the contract's A017 matcher (`contains '/'`) is looser than it looks — any slash in the dashboard satisfies it. The real disambiguation coverage lives in the golden snapshot (`commands/proof.ts` vs `engine/proof.ts`), which is load-bearing. Noted as an upstream observation.

**cli-polish-C3 closed:** migrating Hot Spots to `statGrid` with `maxWidth:22` makes over-long module names truncate with `…` (snapshot: `a-very-long-module-fi…`) instead of the old `padEnd` pass-through. The disambiguation fixture includes an over-long name exactly as the Build Brief requested.

**Header box invariant:** all four box lines measure exactly 71 visible columns (verified programmatically) — right borders align with corners. The date rendering flush to the right border is unchanged `headerBox` behavior shared with the proof card, so AC3 convergence holds. The pre-existing local trailing-gap tests (proof.test.ts:5505/5532) still pass.

## AC Walkthrough
- **AC1** — ✅ PASS. `formatHealthDisplay` renders via shared primitives; no hand-rolled box-drawing or bold-label-plus-dashed-underline headers (swept 537–825, none found).
- **AC2** — ✅ PASS. Neither function calls `columnWidth`; both rebuilt on `statGrid`. The remaining `columnWidth` use is in an unrelated function (proof.ts:2288).
- **AC3** — ✅ PASS. Live `ana proof health`, `ana proof`, and the proof card all share the rounded header box, inset rules, and bracket-badge vocabulary — verified by running all three.
- **AC4** — ✅ PASS. `sparkline` primitive added to render.ts and adopted in scan's Activity row (live: `▂▁▅█ weekly`); ascii fallback unit-tested (render.test.ts:224).
- **AC5** — ✅ PASS. Zero-runs "No data.", Pipeline omitted (<3 timed), Hot Spots omitted when empty, Next Actions capped at 5 — each pinned by a golden fixture; omission guards byte-identical in the diff.
- **AC6** — ✅ PASS. `ansiCount === 0` (A024); snapshots are pure plain text; colored cells (PASS/FAIL) pair with a word.
- **AC7** — ✅ PASS. JSON code paths untouched in the diff; existing JSON tests pass; live `--json` confirms `trajectory` and `entries` present.
- **AC8** — ✅ PASS. Hot Spots alignment holds for long/disambiguated names; over-long names truncate via `statGrid maxWidth` — closes `cli-polish-C3`.
- **AC9** — ✅ PASS. Existing proof/list tests pass (updated for the colon-drop format); test count rose 415→428 on target files, no decrease.
- **AC10** — ✅ PASS. `health-golden.test.ts` snapshots the full dashboard + list across 7 fixtures, color stripped, clock + TZ pinned (`vi.setSystemTime('2026-06-09T12:00:00Z')`, `TZ=UTC`).
- **All target test files green** — ✅ PASS (428/428).
- **No new lint/build errors** — ✅ PASS (0 lint errors; build success).

## Blockers
None. Every contract assertion (24/24) is SATISFIED and every acceptance criterion passes. I searched specifically for: unused exports in `render.ts` (the `sparkline` export has a real consumer in scan.ts; `SparklineOptions` is exported alongside it per the `proportionBar` pattern), orphaned imports after the `BOX` removal (none — build and lint pass), error/edge paths in `sparkline` (empty, flat, single-value all tested), section-omission regressions (all guards byte-identical in the diff, each pinned by a fixture), and JSON drift (code path untouched, confirmed live). Nothing rises to blocker level.

## Findings
- **Upstream — cli-polish-C3 closed:** `packages/cli/src/commands/proof.ts:683` — Hot Spots now rendered via `statGrid` with `maxWidth:22`, so over-long `displayNames` truncate with `…` (snapshot: `a-very-long-module-fi…`) instead of the old `padEnd` pass-through. Resolves the prior finding.
- **Code — sparkline ascii fallback has no production consumer:** `packages/cli/src/commands/scan.ts:325` — the sole call site passes only `{ color: chalk.gray }`, never `ascii: true`, and there is no terminal-capability detection to trigger it. On a genuinely non-UTF-8 terminal the block glyphs would mojibake. Mitigated: the whole card output (rounded `headerBox`, `keyValueRows`) already assumes UTF-8, so this introduces no *new* assumption — but the tested ascii path is currently dead capability. Observation, monitor.
- **Code — flat non-zero series reads as low activity:** `packages/cli/src/utils/render.ts:486` — a steady series like `[5,5,5]` renders identically to a near-zero one (`▁▁▁`). It is the documented `spark`-tool convention and behaves per JSDoc, but for weekly-commit volume a flat-busy week looks visually identical to a flat-dead one. Observation, monitor.
- **Upstream — A017 matcher is loose:** `packages/cli/tests/commands/health-golden.test.ts:173` — the contract's `contains '/'` is satisfied by any slash in the dashboard (e.g. the Next Actions file path `src/engine/scan-engine.ts`), not specifically the Hot Spots disambiguation. The test is contract-aligned; real coverage comes from the golden snapshot pinning `commands/proof.ts`/`engine/proof.ts`. Acknowledge.
- **Code — Hot Spots middle column unbounded:** `packages/cli/src/commands/proof.ts:688` — only the name (`maxWidth:22`) and runs columns are constrained; the findings-text column is free. A pathological severity breakdown could push the runs column right. Bounded in practice by small integer counts. Observation, monitor.
- **Test — build relies on a weak pre-existing trailing-gap test:** `packages/cli/tests/commands/proof.test.ts:5505` — the health box trailing-gap guard asserts only `content.toContain('  ')` (any double-space on the line), not specifically a gap before the right border. This is already a recurring proof-chain finding ("A005 assertion checks for any double space…", 4 entries, surfaced in live `proof health`). This build's rounded-corner flip touches the box this test guards but does not strengthen it. Not introduced here; debt, monitor.

## Deployer Handoff
- Presentation-only change to `ana proof health`, `ana proof` (list), and `ana scan` (Activity row). No data, schema, or `--json` changes — both JSON outputs verified unchanged live.
- New reusable primitive `sparkline(values, opts?)` in `render.ts`; `formatHealthDisplay` and `formatListTable` are now `export`ed (golden-suite access only — not relocated, per `learn-session-memory-C1`).
- Closes `cli-polish-C3` (Hot Spots truncation).
- The one full-suite test failure is a known-flaky `init` subprocess test unrelated to this change (passes in isolation) — not a merge blocker.
- 1 pre-existing lint warning in `git-operations.ts` is untouched by this PR.

## Verdict
**Shippable:** YES

All 24 contract assertions SATISFIED, all 10 acceptance criteria PASS, target suites 428/428 green, build and lint clean, JSON outputs verified unchanged on real data, and the new sparkline confirmed rendering live (`▂▁▅█ weekly`). The findings are observations and pre-existing debt — none blocks shipping. I would stake my name on this.
