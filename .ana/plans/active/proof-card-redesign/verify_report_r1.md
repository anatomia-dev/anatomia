# Verify Report: Proof card visual redesign on a shared render vocabulary

**Result:** FAIL
**Created by:** AnaVerify
**Date:** 2026-06-09
**Spec:** .ana/plans/active/proof-card-redesign/spec.md
**Branch:** feature/proof-card-redesign

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../proof-card-redesign/contract.yaml
  Seal: INTACT (hash sha256:3c785de70ad7d4c68cf1de057ee9c472aef9a64e97e0470ca6e9d01df0ee3431)
```

Seal status: **INTACT** — the contract was not modified after sealing.

Build: **success** (`pnpm run build` — tsup ESM build, 36ms).
Lint: **pass** — 0 errors. 1 warning (`src/utils/git-operations.ts:198` unused eslint-disable) is **pre-existing**, in a file this build does not touch.
Tests (local, MDT): **3673 passed, 0 failed, 2 skipped** (150 files). Baseline was 3642 passed + 2 skipped (148 files) → +31 tests, +2 files. Test count did not decrease.

Sealed verify run marker:
`<!-- ana:capture stage=verify slug=proof-card-redesign counts=3673p/0f/2s verdict=pass sha256=f0fa55454085066122c1b2f93c454ab767d088c1a7813a18375348c278923731 -->`

**Critical caveat:** the local suite is green only because it runs in the author's timezone (MDT). Under `TZ=UTC` — which is what CI (`ubuntu-latest`) uses — the 5 golden snapshot tests fail deterministically. See Blockers.

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | render module provides all six building blocks | ✅ SATISFIED | render.test.ts:34 — asserts all six are functions |
| A002 | section divider shows label, fills to width | ✅ SATISFIED | render.test.ts:89 — rule contains 'Contract', starts `── ` |
| A003 | divider can right-align a summary | ✅ SATISFIED | render.test.ts:96 — rollup ends at right edge within width |
| A004 | header box keeps 71-column width | ✅ SATISFIED | render.test.ts:43 — every line visibleWidth === 71; DEFAULT_WIDTH===71 |
| A005 | header box rounded corners on request | ✅ SATISFIED | render.test.ts:61 — topLeft `╭` |
| A006 | header box square corners by default | ✅ SATISFIED | render.test.ts:52 — topLeft `┌` (health stays unchanged) |
| A007 | labelled rows align into a column | ✅ SATISFIED | render.test.ts:111 — values share a column across differing labels |
| A008 | numeric columns right-align | ✅ SATISFIED | render.test.ts:134 — right edges align across rows |
| A009 | over-long cell truncated, grid not sheared | ✅ SATISFIED | render.test.ts:152 — `…` appears, both rows equal width |
| A010 | proportion bar degrades to ASCII | ✅ SATISFIED | render.test.ts:183 — ascii bar has no `█`, equals `####----` |
| A011 | status maps to its glyph | ✅ SATISFIED | render.test.ts:204 — SATISFIED → `✓` |
| A012 | card shows verdict prominently in header | ✅ SATISFIED | snapshot line 75 `✓ PASS`; golden test:182 toContain 'PASS' (logic valid; see blocker — containing test fails in CI) |
| A013 | every section introduced by inset rule | ✅ SATISFIED | golden test:183 `── Contract`; snapshot confirms all section rules |
| A014 | Contract section summarises satisfied ratio | ✅ SATISFIED | golden test:184 — Contract rule contains `/` (`44/44`) |
| A015 | passing assertions collapse to one line | ✅ SATISFIED | golden test:195 (non-snapshot, **passes under UTC**) — 'satisfied' counted line |
| A016 | failed assertion shown in full with says | ✅ SATISFIED | snapshot line 40-41; golden test:232 UNSATISFIED says text present |
| A017 | deviated assertion shows deviation detail | ✅ SATISFIED | snapshot line 42-43; golden test:233-234 says + `→` detail |
| A018 | Findings leads with severity count | ✅ SATISFIED | golden test:185 — Findings rule matches /debt\|obs/ |
| A019 | overflow points to full data (--json) | ✅ SATISFIED | golden test:197 (non-snapshot, **passes under UTC**) — overflow contains '--json' |
| A020 | never a bare 'and N more' | ✅ SATISFIED | golden test:198 (non-snapshot, **passes under UTC**) — overflow not.toContain 'and'; proof.test.ts:375 confirms via dist |
| A021 | cost breakdown shows cached tokens | ✅ SATISFIED | golden test:186 — 'cache' column header; snapshot line 100 |
| A022 | shows input and output tokens | ✅ SATISFIED | golden test:187 — 'out' column; snapshot line 100 (`in out cache`) |
| A023 | ends with separated TOTAL + table version | ✅ SATISFIED | golden test:188 — /TOTAL.*table v3/; snapshot lines 105-106 |
| A024 | completeness stated on one line | ✅ SATISFIED | golden test:189 — 'completeness'; snapshot line 108 |
| A025 | card fits within 80 columns | ✅ SATISFIED | golden test:241 (non-snapshot, **passes under UTC**) — maxLineWidth ≤ 80 across all 5 fixtures |
| A026 | unpriced shown as n/a, never free | ✅ SATISFIED | golden test:221-222 — 'n/a' present, no '$0.00'. **But see Findings: all-unpriced edge renders $0.00 and is untested** |
| A027 | layout correct with color disabled | ✅ SATISFIED | golden test:242 (non-snapshot, **passes under UTC**) — no ANSI escape with chalk.level 0 |
| A028 | --json assertions array unchanged | ✅ SATISFIED | proof.test.ts:625 (new) — runs vs dist, asserts array + length + says; --json path untouched in diff |
| A029 | provenance-absent golden matches | ❌ UNSATISFIED | golden snapshot test fails under UTC (TZ-dependent timestamp) — does not match in CI |
| A030 | ≥6-sessions golden matches | ❌ UNSATISFIED | golden snapshot test fails under UTC (TZ-dependent timestamp) — does not match in CI |
| A031 | FAIL/DEVIATED golden matches | ❌ UNSATISFIED | golden snapshot test fails under UTC — proven: subtitle renders `22:40` vs baked `16:40` |

**Note on A012–A024/A026:** the *content* of these assertions is correct (verified directly against the snapshot file and the code) and their `toContain` logic is sound. However, the assertions tagged to the provenance-rich / unpriced / fail-deviated golden tests sit *after* a `toMatchSnapshot` call that throws under UTC, so those containing tests fail in CI. Their substance is met; the test harness has the TZ defect tracked as the blocker. A029/A030/A031, whose mechanical matcher *is* "golden snapshot matches", are marked UNSATISFIED outright.

## Independent Findings

**The redesign is genuinely good work.** The render module (`utils/render.ts`) is clean, pure, and correctly solves the spec's #1 flagged risk — every primitive computes alignment on *visible* width via `visibleWidth()` and pads with plain spaces before applying chalk, so embedded ANSI never shears a column. The snapshots render beautifully: right-aligned numeric grids, rules that fill to width, rounded header, `n/a` for unpriced cells, model-collapse when sessions share a model, rework indices (`build 2`), all within 80 columns. The `SEVERITY_ORDER` duplication (build-concern carried for several cycles) is genuinely collapsed into one `renderSeverityList` helper. No duplicate `BOX`/`getStatusIcon`/`formatTokenCount`/`columnWidth` remain in proof.ts — all imported from the module. `formatHealthDisplay` adopts `headerBox` with square defaults and is byte-identical (55 health assertions pass; verified by reasoning that square-corner headerBox reproduces the legacy construction line-for-line).

**Predictions resolved (Step 3):**
1. *padEnd on colored string mis-aligning* — **Not found.** The builder built `visibleWidth`/`padVisible` precisely to avoid this; truncation only ever runs on plain label cells. Got it right.
2. *unpriced/counts-unavailable edge incompletely handled* — **Surprised + confirmed.** counts-unavailable and model-collapse are handled well, but the **all-unpriced** case renders `$0.00` in the TOTAL footer (the credibility violation A026 exists to prevent) and no fixture exercises it.
3. *flaky time-dependent test* — **Confirmed, bigger than predicted.** Not just a latent flake: the golden snapshots are categorically timezone-dependent and fail in CI. This is the blocker.
4. *proofSummary/commit-hygiene tests untouched despite contract* — **Confirmed.** They were resilient substring checks and didn't need changes; harmless over-prediction by the contract.
5. *partial SEVERITY_ORDER collapse* — **Not found.** Fully collapsed. Good.

**Production-risk prediction** ("what breaks in prod the spec didn't address"): a brand-new model id absent from `pricing.ts` makes *every* session unpriced → the card advertises a `$0.00` total for a run that genuinely cost money. This is the same all-unpriced gap surfaced above.

## AC Walkthrough

- **AC1** — primitives typed, JSDoc'd, unit-tested: ✅ PASS (render.test.ts, 11 cases, TZ-independent)
- **AC2** — card uses only shared primitives, no inline construction remains: ⚠️ PARTIAL — one ad-hoc `chalk.bold('  Phase breakdown')` sub-header survives in formatHumanReadable (proof.ts:322)
- **AC3** — every section header is an inset rule with roll-ups: ✅ PASS (Contract ratio, Findings/Concerns severity roll-ups; main section headers all `sectionRule`)
- **AC4** — passing collapse, UNSATISFIED/DEVIATED individual with says: ✅ PASS (snapshot lines 40-43; proof.test.ts:822, 853)
- **AC5** — severity roll-up + capped list + actionable --json overflow: ✅ PASS (renderSeverityList; proof.test.ts:375)
- **AC6** — provenance grid in/out/cache + TOTAL under rule + completeness: ✅ PASS (snapshot lines 100-108)
- **AC7** — 80 cols, single-width, alignment for long ids/≥6/unavailable/unpriced/Codex: ⚠️ PARTIAL — 80-col and long-id/≥6/unpriced verified; **counts-unavailable and Codex (cache_create=0) code paths exist but are untested by any fixture**
- **AC8** — color independence, NO_COLOR / non-TTY legible: ✅ PASS (golden test:242 passes under UTC)
- **AC9** — --json byte-identical: ✅ PASS (A028; --json path untouched in diff)
- **AC10** — all tests pass (updated where format changed), count not decrease, render.test + 5 golden color-stripped: ❌ FAIL — the golden tests exist and are color-stripped, but **fail in CI** (TZ). Locally green; the suite is not green where it must be
- **AC11** — Plan paper-validation deliverable: ✅ PASS (satisfied in spec's AC11 table; no build action)
- **headerBox square default; health byte-identical**: ✅ PASS (55 health assertions pass; verified construction equivalence)
- **No duplicate BOX/getStatusIcon/formatTokenCount/columnWidth in proof.ts**: ✅ PASS (grep confirms none; imported from render.ts)
- **build/test/lint pass**: ⚠️ PARTIAL — build ✅, lint ✅, test ✅ locally but ❌ under UTC/CI

## Blockers

**BLOCKER 1 — Golden snapshot tests fail across the entire CI matrix (timezone-dependent timestamps).**

`formatHumanReadable` renders the header timestamp with `completedDate.toTimeString().slice(0,5)` and `formatLocalDate` — both **local-timezone**. The golden snapshots were generated in the author's timezone (MDT, UTC−6) and bake in MDT-local times (`16:40`, `08:32`, `03:11`). CI runs on `ubuntu-latest` (Node 22 & 24) with no `TZ` pinning, so it runs in **UTC**.

Proven empirically:
```
$ TZ=UTC pnpm vitest run tests/commands/proof-card-golden.test.ts
 FAIL  ... renders the FAIL/DEVIATED card ...
- │  cli · 31 min                                       2026-06-05 16:40│
+ │  cli · 31 min                                       2026-06-05 22:40│
  Snapshots  5 failed
  Tests  5 failed | 2 passed (7)
```

All 5 snapshot tests fail in UTC. This is **deterministic in CI**, not flaky. The local green suite is misleading. AC10 — the headline deliverable of this scope — is red in CI.

*Fix direction (for Build, not prescriptive):* pin `process.env.TZ = 'UTC'` before the fixtures (a `beforeAll` or test-setup file) and regenerate the snapshots; or normalize the timestamp to a fixed zone in fixtures. The vitest config has no global setup file, so a per-file `process.env.TZ` set before import, or a shared setup, is needed. Note the same latent time-dependency already flagged in proof.ts/health (build concern: "formatHealthDisplay date uses runtime new Date()").

**Searched and cleared as non-blockers:** unused exports in render.ts (all six primitives + helpers are imported by proof.ts/tests; `visibleWidth`/`truncateCell` exported for test access — intentional per testing-standards); error paths (primitives are pure, no throw paths beyond clamping which is tested); external-state assumptions (none — pure functions, no `process.stdout.columns` read); engine boundary (render.ts correctly in `utils/`, uses chalk, never imported by engine).

## Findings

- **Test — Golden snapshots are timezone-dependent:** `packages/cli/tests/commands/proof-card-golden.test.ts:19` — fixtures use UTC `completed_at` but the card renders local-time; snapshots baked in MDT fail under UTC/CI. This is Blocker 1. (severity: risk)
- **Code — All-unpriced run renders "$0.00" in the TOTAL footer:** `packages/cli/src/commands/proof.ts:487` — the footer value is unconditionally `$${provTotalCost.toFixed(2)}`; when every session is unpriced, `provTotalCost === 0` → `$0.00`, exactly the "free run" lie A026 guards against. The unpriced golden fixture mixes priced + unpriced sessions (snapshot TOTAL `$1.77`), so the all-unpriced edge passes the `not.toContain('$0.00')` check on a gap. A real future trigger: a new model id missing from `pricing.ts`. Consider rendering the TOTAL value as `n/a` (or omitting it) when `provPriced` is false. (severity: risk)
- **Code — Ad-hoc bold sub-header remains in formatHumanReadable:** `packages/cli/src/commands/proof.ts:322` — `chalk.bold('  Phase breakdown')` is the one inline section-header construction AC2 says should not remain after the rebuild. Minor (it's a sub-header inside Timing, no underline pair), but it is literally what AC2 prohibits. (severity: debt)
- **Test — counts-unavailable and Codex sessions untested:** `packages/cli/tests/commands/proof-card-golden.test.ts:140` — AC7 lists "counts-unavailable sessions" and "Codex sessions (cache_create=0)" as alignment cases. Both code paths exist and read correct (the "counts unavailable" line; cache summed as `cache_create + cache_read`), but no fixture (golden or unit) exercises either. The `session()` helper supports `withCounts=false` but it's never used. (severity: debt)
- **Test — Stale `@ana A020` tag:** `packages/cli/tests/utils/proofSummary.test.ts:2409` — tag points at the single-phase phase-breakdown test, but A020 in this contract is the findings-overflow rule. Pre-existing mis-tag in an unmodified file; harmless here (A020 is correctly covered by the golden test) but would mislead tag-driven verification. (severity: observation)
- **Upstream — Contract over-predicted test file changes:** `proofSummary.test.ts` and `commit-hygiene.test.ts` are listed `modify` in contract file_changes but needed no change — their assertions are substring `toContain` checks that survive the new format. Harmless; planners could mark such resilient files as optional. (severity: observation)
- **Test — One non-reproducible suite failure:** the first sealed `ana test` run reported `3672p/1f/2s`; 7 subsequent runs (sealed + 6 direct, including JSON-reporter) all reported 0 failures. The seal marker records only counts, so the failing test could not be identified. Most likely a pre-existing flaky/time-dependent test (proof.ts and health both render runtime `new Date()`), not this build's deterministic new tests. Flagging so it isn't lost. (severity: observation)

## Deployer Handoff

**Do not merge.** This goes back to Build. The single code change required is small but essential: pin the test timezone (or normalize fixture timestamps) so the golden snapshots pass in CI, then regenerate the `.snap`. While in there, two cheap wins worth folding into the fix cycle: (a) render the Provenance TOTAL as `n/a` when no session is priced, to close the all-unpriced `$0.00` gap A026 implies; (b) add an all-unpriced fixture and a counts-unavailable/Codex fixture to actually cover AC7's listed edges. The AC2 `Phase breakdown` sub-header is optional polish (convert to `sectionRule` or accept as a documented sub-header). The render module itself is high quality and needs no changes.

## Verdict
**Shippable:** NO

The render vocabulary and the rebuilt card are excellent work and the design goal is clearly met. But the headline deliverable — AC10's golden snapshot tests — fails deterministically on every CI runner because timestamps are rendered in local time and the snapshots were captured in MDT. I proved this with `TZ=UTC` (5/5 snapshots fail). A green local suite that goes red in CI is not shippable. Three contract assertions (A029/A030/A031) are UNSATISFIED, AC10 fails, AC2 and AC7 are PARTIAL. Back to Build for a small, well-scoped fix.