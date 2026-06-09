# Spec: Health dashboard + proof list table adopt the render vocabulary

**Created by:** AnaPlan
**Date:** 2026-06-09
**Scope:** .ana/plans/active/health-dashboard-redesign/scope.md

## Approach

Pure presentation. Rebuild the two remaining hand-rolled proof renderers —
`formatHealthDisplay` and `formatListTable` in `src/commands/proof.ts` — on the
shared `src/utils/render.ts` primitives so all three proof renders (card, health,
summary table) speak one visual language. No data changes, no `--json` changes,
no engine touch. The `HealthReport` shape and every section-omission rule are
preserved exactly.

The direct structural analog is the already-rebuilt proof card
(`formatHumanReadable`, proof.ts:281–537). Mirror its primitive usage: `headerBox`
for the identity box, `sectionRule` for every section header, `keyValueRows` for
aligned label/value seams, `statGrid` for the borderless aligned grids. The local
`columnWidth` helper was already folded into `render.ts` during
`proof-card-redesign`; these two functions stop calling it directly and use
`statGrid` (whose internal width math supersedes the manual `columnWidth` + `padEnd`).

**Decisions locked with the developer:**

1. **Rounded corners for health + list.** AC3 requires the health box match the
   card's. The card uses `corners: 'rounded'`. The health header's own code comment
   (proof.ts:557–559) anticipated "Health flips to rounded in its own redesign
   scope" — this is that scope. Flip both renderers to rounded so the card, scan
   card, and health all converge (scan is already rounded). No existing test asserts
   square corners (`┌`) for health, so the flip is test-safe; the golden suite pins
   the new form.

2. **Real sparkline lives in scan, not health.** The scope's AC4 describes "a real
   sparkline for the weekly-commit trend (today it joins counts with a gray `→`)."
   That `→`-join is `scan.ts:325` (`activity.weeklyCommits.join(chalk.gray('→'))`),
   operating on scan's `number[]` series. Health's `TrajectoryData` is two scalars
   (`risks_per_run_last5`, `risks_per_run_all`) plus a `trend` enum word — there is
   **no series in health to sparkline**, and adding one would be a data/schema change
   (forbidden by AC7 and "no data changes"). Resolution: add a tested `sparkline`
   primitive to `render.ts` and adopt it in `scan.ts` where the real series exists.
   Health does **not** get a degenerate 2-point sparkline; its quality numbers render
   as aligned `keyValueRows`.

3. **List table uses a lighter `── Proof History ──` sectionRule header**, not the
   full bordered box. A multi-row list is not a single-subject card; the ceremonial
   box overweights it. Still fully consistent with the card's section vocabulary.

4. **Severity treatment is the card's bracket-badge idiom**, not new glyphs. The card's
   `renderSeverityList` (proof.ts:246–) renders `[severity · action]` text badges,
   not colored glyphs. Health's Next Actions already uses `[severity]`. Keep that —
   "consistent with the card's finding treatment" means the bracket badge, preserved.

## Output Mockups

**Health dashboard — after (color stripped, rounded corners, inset rules, aligned seams):**

```
╭─────────────────────────────────────────────────────────────────────╮
│  ana proof health                                                     │
│  7 runs                                                    2026-06-09  │
╰─────────────────────────────────────────────────────────────────────╯

── Quality ────────────────────────────────────────────────────────────
  Trend       improving
  Risks/run   1 (last 5) · 2 (all)

── Verification ────────────────────────────────────────────────────────
  First-pass  86% (6 of 7)
  Caught      4 issues before shipping

── Pipeline ────────────────────────────────────────────────────────────
  Median      42m (scope 5m · plan 8m · build 21m · verify 8m)

── Hot Spots ───────────────────────────────────────────────────────────
  proof.ts      12 findings (3 risk, 5 debt, 4 obs)      6 runs
  scan.ts        4 findings (1 risk, 3 debt)             3 runs

── Next Actions ────────────────────────────────────────────────────────
  Promote: [risk] Empty catch swallows detector failure — scan-engine.ts
  Fix: SEVERITY_ORDER duplicated across two blocks (3 entries)
```

Zero-runs path (unchanged content, new box):

```
╭─────────────────────────────────────────────────────────────────────╮
│  ana proof health                                                     │
│  0 runs                                                    2026-06-09  │
╰─────────────────────────────────────────────────────────────────────╯

  No data.
```

**Summary table (`ana proof`, no slug) — after (lighter inset header + aligned grid):**

```
── Proof History ───────────────────────────────────────────────────────
  Slug                  Result   Assertions   Surface   Date
  health-dashboard-re…  PASS     22/22        cli       2026-06-09
  cli-telemetry         PASS     14/14        cli       2026-06-08
  scan-card-redesign    PASS     19/19        cli       2026-06-07
```

**Scan card weekly activity — before/after:**

```
before:  Activity     3 active contributors · 2→5→4→6 weekly
after:   Activity     3 active contributors · ▁█▅█ weekly
```

(Block-glyph heights are illustrative; the bar maps each week's commit count to a
level in `▁▂▃▄▅▆▇█`. ASCII fallback path for the primitive is unit-tested.)

## File Changes

### src/utils/render.ts (modify)
**What changes:** Add one new pure primitive, `sparkline(values, opts?)`, that maps
a numeric series to a single-line string of block glyphs (`▁▂▃▄▅▆▇█`). It follows
the exact contract conventions of the existing `proportionBar`: explicit width-free
data-in/string-out, an `ascii` option that degrades block glyphs to a single-width
ASCII ramp for low-fidelity/non-UTF-8 terminals, and optional color. Like
`proportionBar`, it must be used on its own line (block glyphs render wide) and never
inside an alignment-critical column.
**Pattern to follow:** `proportionBar` (render.ts:398–436) for the option shape,
JSDoc style, ascii-degradation pattern, and "own line only" warning. Normalize each
value across the series' min–max range to pick a glyph; document the chosen behavior.
**Why:** Health/scan currently fake trends; the module is the single home for this
vocabulary. The scope is explicit: a primitive the renderers need but the module lacks
is added here, never re-inlined in a command file.

### src/commands/proof.ts (modify)
**What changes:**
- `formatHealthDisplay` (537–728): export it; flip `headerBox` to `corners: 'rounded'`;
  replace every `chalk.bold('  Label')` + `chalk.gray('  ' + '─'.repeat(n))` section
  header with `sectionRule(label, { width })`; render Quality, Verification, and
  Pipeline bodies as `keyValueRows`; rebuild Hot Spots on `statGrid` (preserving the
  basename-disambiguation `displayNames` computation exactly); keep Next Actions'
  merged promote/scope logic, recurrence sort, and cap-5 unchanged, only swapping its
  bold header for `sectionRule`. Every section-omission guard stays byte-identical.
- `formatListTable` (769–811): export it; replace `chalk.bold('  Proof History')`
  with `sectionRule('Proof History', { width })`; rebuild the body on `statGrid`
  (Slug/Result/Assertions/Surface/Date columns), preserving the recency sort
  (`sortEntriesByRecency`), the PASS/FAIL green/red coloring, the dim `--` surface
  fallback, and slug truncation (now via the Slug column's `maxWidth`).
**Pattern to follow:** the proof card `formatHumanReadable` in the same file —
Contract/Timing/Provenance sections show `sectionRule` + `keyValueRows` + `statGrid`
usage on real data (proof.ts:336–532).
**Why:** Without this, two dated renders sit one screen from the new card in the same
file. "Finished means consistent."

### src/commands/scan.ts (modify)
**What changes:** In the Intelligence/Activity block (scan.ts:317–330), replace
`activity.weeklyCommits.join(chalk.gray('→')) + ' weekly'` with the new `sparkline`
primitive over `activity.weeklyCommits`, keeping the `weekly` label and the rest of
the `Activity` row composition intact.
**Pattern to follow:** the existing `keyValueRows`/`sectionRule` usage already in
scan.ts (it consumes the module); just swap the faked trend for the real primitive.
**Why:** This is the one place a real weekly-commit series exists; it is the genuine
consumer the scope's AC4 describes.

### tests/utils/render.test.ts (modify)
**What changes:** Add a `sparkline` describe block — varied series renders block
glyphs (max value → full block); flat series renders without crashing; empty series
returns empty string; single value renders one glyph; `ascii: true` emits the ASCII
ramp and no block glyphs.
**Pattern to follow:** the existing `proportionBar` tests in this file.

### tests/commands/proof.test.ts (modify)
**What changes:** Update the health-display and list-table assertions to the new
format (inset rules, rounded box, dropped label colons, `statGrid` alignment),
including the `A005` trailing-gap/right-border check (satisfied by `headerBox`, which
already passes it — update only if the rounded flip shifts the asserted substring).
Preserve every omission-rule test. Tag new/updated tests with the contract IDs.
**Pattern to follow:** existing `describe('ana proof health')` (2184+) and the list
table tests; substring `toContain` on color-stripped stdout, asserting search success
per testing-standards.

### tests/commands/scan.test.ts (modify)
**What changes:** Update the Activity-row assertion to expect a sparkline glyph rather
than the `→`-joined number string; keep the `weekly` label assertion.

### tests/commands/health-golden.test.ts (create)
**What changes:** New golden/snapshot suite (mirrors `scan-card-golden.test.ts`)
rendering `formatHealthDisplay` and `formatListTable` directly with color stripped
(`chalk.level = 0`) across fixtures: full dashboard, zero-runs ("No data."), Pipeline
omitted (<3 timed entries), Hot Spots empty, Next Actions empty, the summary list
table, and a Hot Spots disambiguation fixture (colliding basenames). Pin the clock
(`vi.setSystemTime`) and `TZ=UTC` so the health header date is deterministic. Assert
the full layout via `toMatchSnapshot()` plus targeted `toContain`/width checks.
**Pattern to follow:** `tests/commands/scan-card-golden.test.ts` (structure, color
strip) and `tests/commands/proof-card-golden.test.ts` (the `TZ=UTC` + restore pattern
for a timestamped card). The generated `__snapshots__/health-golden.test.ts.snap` is
created by vitest on first run.

## Acceptance Criteria

- [ ] AC1: `formatHealthDisplay` renders via the shared `render.ts` primitives; no
  hand-rolled box-drawing or bold-label-plus-dashed-underline section headers remain.
- [ ] AC2: `formatListTable` renders via the shared grid/section primitives; neither
  function calls the bespoke `columnWidth` math (it is superseded by `statGrid`).
- [ ] AC3: Health dashboard, proof card, and summary table are visually consistent —
  same rounded header box, inset-rule sections, palette, and bracket-badge vocabulary.
- [ ] AC4: A real `sparkline` primitive is added to `render.ts` and adopted in the
  scan card's weekly-commit Activity row, replacing the `→`-joined number string; it
  degrades to an ASCII fallback via its `ascii` option (unit-tested both paths).
- [ ] AC5: All health section-omission rules are preserved exactly — zero-runs shows
  "No data."; Pipeline omitted when fewer than 3 entries have timing; Hot Spots
  omitted when empty; Next Actions capped at 5 and sorted by recurrence.
- [ ] AC6: One accent + grayscale + semantic-status-only; every colored element pairs
  with a glyph/word; all three renders are legible and aligned with color stripped.
- [ ] AC7: `ana proof health --json` and `ana proof --json` outputs are byte-identical
  to before this change (presentation-only).
- [ ] AC8: Hot Spots column alignment holds for long/disambiguated module names; the
  basename-disambiguation behavior is preserved and over-long names truncate (via
  `statGrid` `maxWidth`) rather than shear — closing finding `cli-polish-C3`.
- [ ] AC9: All existing proof health and list-table tests pass (updated where the
  visible format changed, including the `A005` check); test count does not decrease.
- [ ] AC10: Golden/snapshot tests pin the full rendered dashboard and summary table
  with color stripped across the fixtures listed in the File Changes section.
- [ ] All target test files green: `(cd packages/cli && pnpm vitest run)` for
  proof/scan/render/golden suites.
- [ ] No new lint errors; no build errors.

## Testing Strategy

- **Unit tests (`render.test.ts`):** the new `sparkline` primitive — varied series
  (max → `█`), flat series (no crash, uniform output), empty series (`''`), single
  value, and `ascii: true` (ASCII ramp, no block glyphs). Mirror `proportionBar` tests.
- **Integration / format tests (`proof.test.ts`, `scan.test.ts`):** drive the commands
  with color stripped and assert the new substrings (`── Quality`, `── Hot Spots`,
  `── Proof History`, `╭`, not `┌`, sparkline glyph in scan Activity). Update existing
  health/list assertions to the new idiom; preserve all omission-rule tests.
- **Golden snapshots (`health-golden.test.ts`):** full-layout snapshots of both
  renderers across the seven fixtures, color stripped, clock + TZ pinned. These catch
  a sheared Hot Spots grid or misaligned column that `toContain` cannot.
- **Edge cases:** zero-runs box; Pipeline omitted (2 timed entries); Hot Spots empty;
  Next Actions empty and Next Actions >5 (cap); colliding basenames → `dir/file`;
  over-long module name truncated with `…`; `--json` unchanged for both paths.

## Dependencies

- `proof-card-redesign` has landed (`src/utils/render.ts` exists, card rebuilt). Verified.
- `scan-card-redesign` has landed (scan consumes the module). Verified.
- No new packages. `sparkline` is added to the existing `render.ts`.

## Constraints

- **Presentation-only.** `HealthReport` / `TrajectoryData` shapes and both `--json`
  outputs must be byte-identical before and after.
- **No engine touch, no schema change.** `render.ts` may use `chalk`; it must never be
  imported into `src/engine/`.
- Header box stays 71 wide; the `A005` trailing-gap/right-border invariant must hold.
- Block glyphs (sparkline) never inside an alignment-critical column — own line only.
- ESM: every relative import ends in `.js`; `import type` separate from value imports.

## Gotchas

- **`new Date()` in `formatHealthDisplay`** makes the header date non-deterministic —
  the golden suite MUST pin the clock (`vi.setSystemTime`) and `TZ=UTC`, or snapshots
  drift daily. The data tests (`proof-health.test.ts`) are unaffected.
- **`A005` is the one exact-format test** (proof.test.ts ~5505/5532: "box has trailing
  gap before right border"). `headerBox` already satisfies it; the rounded-corner flip
  changes corner glyphs only, not the trailing-gap. Re-run these specifically.
- **Label colons drop.** `keyValueRows` renders a gray padded label with no colon, so
  "Trend:" → "Trend", "First-pass:" → "First-pass", etc. Any test asserting the colon
  form must be updated. Assert on the value substring, not the colon.
- **Basename disambiguation is load-bearing** — recompute `displayNames` exactly as
  today (colliding basenames → `path.basename(dirname)/base`) before feeding `statGrid`.
- **`statGrid` truncates only PLAIN cells** via `truncateCell`. Keep the Slug and
  module-name cells uncolored so `maxWidth` truncation works; color the Result cell
  (PASS/FAIL) — `statGrid` measures it with `visibleWidth`, so color won't shear it.
- **Section-omission guards are byte-identical** — do not let a primitive emit an empty
  header when a section is omitted. Guard first, then push the `sectionRule`.
- **Export, don't relocate.** Adding `export` to the two functions is enough for the
  golden suite; do not move them out of proof.ts (the file already over-exports —
  finding `learn-session-memory-C1`).

## Build Brief

### Rules That Apply
- All relative imports end in `.js`; `import type` for type-only imports, separate
  from value imports (ESM runtime requirement — compiles without, crashes at runtime).
- Exported functions need `@param`/`@returns` JSDoc and an explicit return type
  (pre-commit lint enforces). The two functions become exported — add the tags.
- `render.ts` may use `chalk`; never import it into `src/engine/`.
- Tests: assert specific values on color-stripped output (`FORCE_COLOR: '0'` for
  subprocess runs, `chalk.level = 0` for direct-call golden tests). When searching
  stdout, assert the search succeeded before asserting the value.
- Prefer real implementations; mock only time (the golden clock pin is the one mock).
- Run `(cd packages/cli && pnpm run build)` before subprocess terminal-output tests —
  scan/proof integration tests run against compiled `dist`, stale dist gives false passes.

### Pattern Extracts

Card section idiom to mirror (proof.ts:370–380) — `sectionRule` + `keyValueRows`:
```ts
  lines.push('');
  lines.push(sectionRule('Timing', { width }));
  const timingRows: KeyValueRow[] = [
    { label: 'Total', value: `${entry.timing.total_minutes} min` },
  ];
  if (entry.timing.think != null) timingRows.push({ label: 'Think', value: `${entry.timing.think} min` });
  lines.push(...keyValueRows(timingRows, { labelWidth: 12 }));
```

Card grid idiom to mirror for Hot Spots / list table (proof.ts:486–507) — `statGrid`
with per-column align + `maxWidth` (truncation) + an optional header:
```ts
  lines.push(
    ...statGrid({
      columns: [
        { align: 'left', maxWidth: 22 },
        { align: 'right' },
        { align: 'right' },
      ],
      header: ['session', 'turns', 'tools'],
      rows,
    })
  );
```

`proportionBar` — the option/ascii/JSDoc shape the new `sparkline` should follow
(render.ts:422–436):
```ts
export function proportionBar(filled: number, total: number, opts?: ProportionBarOptions): string {
  const width = opts?.width ?? 64;
  const ratio = total > 0 ? Math.min(1, Math.max(0, filled / total)) : 0;
  const fillCh = opts?.ascii ? '#' : '█';
  const emptyCh = opts?.ascii ? '-' : '░';
  // ...returns a single own-line string
}
```

Basename disambiguation to preserve (proof.ts:654–660):
```ts
    const base = path.basename(mod.file);
    const displayName =
      (basenameCounts.get(base) ?? 0) > 1
        ? `${path.basename(path.dirname(mod.file))}/${base}`
        : base;
```

Golden-suite skeleton to mirror (scan-card-golden.test.ts:15–23, plus the proof card's
TZ pin):
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
beforeAll(() => { chalk.level = 0; process.env['TZ'] = 'UTC'; });
// ...render formatHealthDisplay(fixture) / formatListTable(fixture); expect(out).toMatchSnapshot();
```

### Proof Context
Curated active findings on the affected files (from `ana proof context`):
- **`cli-polish-C3` (blocker-adjacent, directly relevant):** "Hot spots displayNames
  not truncated when exceeding maxWidth — padEnd passes through unchanged." Migrating
  Hot Spots to `statGrid` with a `maxWidth` on the name column **closes this finding**.
  Make the golden suite's disambiguation fixture include an over-long name so the
  truncation is pinned (overlaps AC8).
- **`proof-card-redesign-C1` (observation):** an ad-hoc `chalk.bold('  Phase breakdown')`
  survived the card migration. Heed the lesson: leave **no** inline `chalk.bold('  …')`
  section header in either function you touch — every header goes through `sectionRule`.
- **`learn-session-memory-C1` (note):** proof.ts has a documented history of
  over-exporting helpers. Export only the two render functions the golden suite needs;
  do not relocate or export anything else.

### Checkpoint Commands
Surface is `cli`.
- After `render.ts` sparkline: `(cd packages/cli && pnpm vitest run tests/utils/render.test.ts)` — Expected: existing render tests pass + new sparkline tests pass.
- After `scan.ts`: `(cd packages/cli && pnpm vitest run tests/commands/scan.test.ts tests/commands/scan-card-golden.test.ts)` — Expected: Activity row shows sparkline; scan suites green.
- After `proof.ts` + golden: `(cd packages/cli && pnpm vitest run tests/commands/proof.test.ts tests/commands/health-golden.test.ts)` — Expected: updated health/list assertions pass; new golden snapshots written and stable.
- After all changes (baseline): `(cd packages/cli && pnpm vitest run)` — Expected: 3674 passing (3657 prior + 17 new), 15 pre-existing failures unchanged (unrelated git-merge tests), 17 skipped.
- Lint: `(cd packages/cli && pnpm run lint)` — Expected: no new errors.

### Build Baseline
Measured on `main` before this build:
- Full CLI suite (`(cd packages/cli && pnpm vitest run)`): **3689 tests** total —
  3657 passed, **15 failed (pre-existing, UNRELATED** — git merge/branch tests; not in
  any file this spec touches), 17 skipped, across 151 test files.
- Target files (all green on `main`): `proof.test.ts`, `render.test.ts`, `scan.test.ts`,
  `proof-card-golden.test.ts`, `scan-card-golden.test.ts` — **415 tests passing**, 5 files.
- Command used: `(cd packages/cli && pnpm vitest run)`.
- After build: expect ~17 net-new tests (sparkline unit tests + health/list golden
  fixtures), 1 new test file (`health-golden.test.ts`). The 15 unrelated failures
  must remain exactly 15 — do not "fix" them in this scope.
- Regression focus: `proof.test.ts` (health + list assertions change most),
  `scan.test.ts` (Activity row), `render.test.ts` (additive). Confirm the `A005`
  trailing-gap tests and all section-omission tests still pass.
