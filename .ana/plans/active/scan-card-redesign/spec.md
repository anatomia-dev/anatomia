# Spec: Scan card redesign — adopt the render vocabulary + surface "How your team writes"

**Created by:** AnaPlan
**Date:** 2026-06-09
**Scope:** .ana/plans/active/scan-card-redesign/scope.md

## Approach

Rebuild scan's `formatHumanReadable` (scan.ts:101–379) on the shared `utils/render.ts`
primitives so the scan card speaks the same visual language as the redesigned proof card,
and add a confidence-gated **"How your team writes"** section that surfaces the convention
and pattern data the engine already computes and the card currently discards.

Three moves:

1. **Header → `headerBox`.** Replace the hand-rolled box (and the duplicate local `BOX`
   constant) with a `headerBox({ corners: 'rounded' })` call. `title` = project name,
   `subtitleLeft` = the stack summary one-liner, `subtitleRight` = application shape (dim,
   right-aligned — the same slot proof uses for its timestamp).
2. **Section headers → `sectionRule`; rows → `keyValueRows`.** Every `bold('  Label')` +
   `gray('  ─────')` pair (Stack, Surfaces, Intelligence) becomes one `sectionRule('Label')`
   call. The simple label/value rows become `keyValueRows`.
3. **Add the Conventions section** via `sectionRule('How your team writes')` + `keyValueRows`,
   gated at a single global confidence threshold of **0.7**.

The Findings + footer/CTA block (scan.ts:322–376) is **left unchanged** — it keeps its
current 4-space gray detail indent, which means `scan-finding-details.test.ts` needs no
edits. This is deliberate blast-radius control: only the box, the section headers, and the
new section change.

**Width is 71 and does not change.** The scope's premise ("proof uses 80, scan uses 71") is
stale — the landed `proof-card-redesign` settled proof at `width = 71` and the module's
`DEFAULT_WIDTH = 71`. Scan is already 71. There is no dimensional mismatch to resolve, and
the two `length === 71` box-width assertions **survive** rather than break.

**Confirmed decisions (developer, this session):**
- Rounded corners for scan (match proof; the module's stated end-state).
- Single global 0.7 gate (not per-signal). 0.7 is the engine's own `mixed` cutoff
  (`mixed = confidence < 0.7`) and the pattern detector's `threshold` — not a magic constant.
- Commit/branch format stays out of scan's Conventions — it's proof's Commit Hygiene
  territory; surfacing it here would duplicate one signal across two cards.

**No new render primitive is added.** `headerBox` + `sectionRule` + `keyValueRows` cover the
Conventions section completely; a distribution bar would push it toward the "data dump" the
scope explicitly rejects. `src/utils/render.ts` and `tests/utils/render.test.ts` stay
untouched — reuse, don't add.

## Output Mockups

Full deep-tier card (color stripped, the form the golden snapshot pins). Box is 71 columns wide:

```
╭─────────────────────────────────────────────────────────────────────╮
│  anatomia-workspace                                                   │
│  TypeScript · 2 packages                                     cli tool │
╰─────────────────────────────────────────────────────────────────────╯

── Stack ──────────────────────────────────────────────────────────────
  Language     TypeScript
  Testing      Vitest
  Workspace    pnpm · primary: packages/cli

── How your team writes ────────────────────────────────────────────────
  Naming       camelCase functions · SCREAMING_SNAKE_CASE constants
  Indentation  spaces, 2-wide
  Error style  exceptions
  Validation   Zod

── Intelligence ────────────────────────────────────────────────────────
  Activity     3 active contributors · 2▸5▸4▸6 weekly

  Full data: .ana/scan.json
  Run `ana init` to scaffold 6 skills (4 core + api-patterns, data-access)
```

Surface-tier (`--quick`) card — `conventions`/`patterns` are null, so the whole "How your
team writes" section is **absent** (no header, no blank line for it):

```
╭─────────────────────────────────────────────────────────────────────╮
│  anatomia-workspace                                                   │
│  TypeScript · 2 packages                                     cli tool │
╰─────────────────────────────────────────────────────────────────────╯

── Stack ──────────────────────────────────────────────────────────────
  Language     TypeScript
  ...
```

### The Conventions gate — exact rules

The section is built from candidate rows; **each row is computed only if its source clears the
gate, and the entire section is omitted if zero rows survive** (no empty header, no stray rule).

| Row | Source | Show when | Value format |
|-----|--------|-----------|--------------|
| Naming | `conventions.naming.{functions,classes,constants}` | per sub-category: `confidence >= 0.7 && mixed === false` | cleared sub-categories joined by ` · `, each `"<majority> <kind>"` (e.g. `camelCase functions`). Skip `variables` (mirrors functions) and `files`. |
| Indentation | `conventions.indentation` | `confidence >= 0.7` | `"<style>, <width>-wide"` when `style === 'spaces'` and width set; else `"<style>"` |
| Error style | `patterns.errorHandling` | `confidence >= 0.7` | the pattern `library` (use `getPatternLibrary` for the union) |
| Validation | `patterns.validation` | `confidence >= 0.7` | the pattern `library` |

- **Naming `mixed === true` → omit that sub-category.** `mixed` is the engine's honest signal
  that no majority dominates; showing a 0.60 "majority" is exactly the false-confidence the
  section exists to avoid.
- **Testing is NOT shown here** — it already appears in the Stack section; don't duplicate.
- **Commit/branch format is NOT shown** (developer decision; proof owns Commit Hygiene).
- If `result.conventions` is null AND `result.patterns` is null → no candidate rows → section
  omitted. Both are null on surface-tier / `--quick` scans.

This gate, on the anatomia repo itself, shows {functions=camelCase, constants=SCREAMING_SNAKE_CASE,
indentation=2-space, error=exceptions, validation=Zod} and omits {file naming (mixed 0.60),
class naming (0.55, n=6), import style (mixed 0.69), null-style (mixed), commit format (0.02)}.
That shown-vs-omitted split is the credibility test, and it is pinned by the golden fixtures.

## File Changes

(Machine-readable list is in contract.yaml. Prose context below.)

### packages/cli/src/commands/scan.ts (modify)
**What changes:** Delete the local `BOX` constant (36–43). Rebuild `formatHumanReadable`'s
header (127–168), Stack header (171–172), Surfaces header (229–230), and Intelligence header
(316–318) onto `headerBox`/`sectionRule`/`keyValueRows` imported from `../utils/render.js`.
Add the new "How your team writes" section after Stack (and after Surfaces if present),
before Intelligence. Leave the no-stack ancestor-walk fallback (244–266) and the entire
Findings + footer/CTA block (322–376) behaviorally unchanged.
**Pattern to follow:** `packages/cli/src/commands/proof.ts` — its `formatHumanReadable`
(headerBox at 326–334 with `corners: 'rounded'`, `sectionRule` at 347/372/etc.,
`keyValueRows` at 380). Mirror its use of the primitives exactly.
**Why:** The card both speaks a dated, duplicated idiom and breaks its own
"conventions and patterns" promise by discarding `result.conventions`/`result.patterns`.

### packages/cli/tests/commands/scan.test.ts (modify)
**What changes:** Update the corner-glyph check (`toContain('┌')`, ~913) to `'╭'`. Repair the
Surfaces section-finding logic (~1079, ~1101): the label and the dashes now share one
`sectionRule` line, so `l.includes('Surfaces') && !l.includes('────')` finds nothing — locate
the section line by its label and slice data rows from the **next** line (no separate divider
line to skip). Fix the conditional-gated width assertion at ~1196 (`if (summaryLine) {...}`) to
assert `expect(summaryLine).toBeDefined()` first (testing-standards: assert the search
succeeded). Add `toContain`-level coverage for the new Conventions section.
**Pattern to follow:** existing assertions in this file; the golden file (below) carries the
full-layout pinning.
**Why:** Three assertions assume the old square-box / two-line-header idiom.

### packages/cli/tests/commands/scan-card-golden.test.ts (create)
**What changes:** New golden/snapshot suite that calls `formatHumanReadable` directly with
crafted `EngineResult` fixtures and `chalk.level = 0`, snapshotting the full card plus a few
targeted `toContain`/`not.toContain` assertions per fixture.
**Pattern to follow:** `packages/cli/tests/commands/proof-card-golden.test.ts` — copy its
structure exactly (`beforeAll(() => { chalk.level = 0; })`, `makeResult` factory built on
`createEmptyEngineResult()`, `expect(card).toMatchSnapshot()` + targeted asserts). Build
fixtures with the EngineResult factory and spread overrides per level (testing-standards).
**Why:** `toContain` cannot catch a sheared grid or a leaked low-confidence guess; the golden
files make PR review of alignment and the gate mechanical (AC10).

## Acceptance Criteria

- [ ] AC1: `formatHumanReadable` renders via the shared `utils/render.ts` primitives; the local
  duplicate `BOX` constant and all hand-rolled bold-label + dashed-underline section headers are
  removed from scan.ts.
- [ ] AC2: The scan card and the proof card are visually consistent — rounded header box, inset
  `── Label ──` section rules, shared palette/glyph vocabulary, same 71-column width.
- [ ] AC3: A "How your team writes" section renders, surfacing naming, indentation, error
  handling, and validation from `result.conventions` and `result.patterns`.
- [ ] AC4: Every Conventions row is gated at confidence ≥ 0.7 (naming additionally requires
  `mixed === false`); below-threshold rows are omitted; when no row clears the gate the whole
  section is omitted with no empty header.
- [ ] AC5: Color is one accent + grayscale + semantic glyphs; the full card is legible and
  aligned with color stripped (`chalk.level = 0` / `FORCE_COLOR=0`) — no layout depends on ANSI.
- [ ] AC6: `ana scan --json` output is unchanged (presentation-only; engine and schema untouched).
- [ ] AC7: Funnel mode is preserved — clean-acknowledgment + `ana init` CTA on funnel; scan.json
  reference + skill-manifest CTA off funnel.
- [ ] AC8: Graceful degradation — surface-tier (null conventions/patterns), monorepo surface
  overflow (`+N more`), no-stack ancestor-walk fallback, and long project names render without
  breaking alignment.
- [ ] AC9: All existing scan tests pass (updated where the visible format changed); test count
  does not decrease; new coverage added for the Conventions section.
- [ ] AC10: Golden snapshots pin the full card (color stripped) across: full deep-tier,
  surface-tier (section omitted, no empty header), monorepo overflow, no-stack fallback, and a
  gate fixture proving the mixed/low-confidence signals (file naming, import style, null-style)
  are OMITTED.
- [ ] AC11: The 0.7 gate is calibrated against real scan output and the shown-vs-omitted split is
  pinned by the AC10 gate fixture. (Calibrated this session on the anatomia repo — see the gate
  table above.)
- [ ] AC12: `render.ts` is unchanged — no new primitive inlined into scan.ts.
- [ ] AC13: `pnpm run lint` clean; `pnpm run build` succeeds.

## Testing Strategy

- **Golden snapshots (new file, the AC10 spine):** five fixtures, color stripped via
  `chalk.level = 0`, each `toMatchSnapshot()` plus targeted asserts:
  1. **Full deep-tier** — populated conventions + patterns. Asserts the section header and the
     cleared signals (`camelCase`, `spaces`, `exceptions`, `Zod`) are present.
  2. **Surface-tier** — `conventions: null, patterns: null`. Asserts the section is absent
     (`not.toContain('How your team writes')`) with no empty header.
  3. **Monorepo overflow** — > `MAX_SURFACES` surfaces. Asserts `(+` overflow indicator.
  4. **No-stack fallback** — empty stack, ancestor manifest present. Asserts the project-root
     guidance survives the restyle.
  5. **Gate fixture** — naming with `files` mixed (conf 0.60), `imports` mixed (0.69),
     `nullStyle` mixed, alongside confident functions/constants. Asserts confident signals
     present and the mixed ones omitted (`not.toContain('mixed')`, no file-naming row).
- **Edge cases:** long project name (header truncation, no border shear); subtitle overflow
  (summary + right-aligned shape must not exceed 71); zero-finding funnel vs non-funnel footer.
- **Unchanged-behavior guard:** `scan-finding-details.test.ts` must still pass untouched (the
  Findings/footer block does not change) — run it to confirm no regression.

## Dependencies

- `proof-card-redesign` (LANDED) — ships `src/utils/render.ts`. Confirmed present:
  `headerBox`, `sectionRule`, `keyValueRows`, `statGrid`, `proportionBar`, `statusGlyph`,
  `visibleWidth`, `truncateCell`, `DEFAULT_WIDTH = 71`.

## Constraints

- `ana scan --json` output must not change — only the human render path changes.
- `EngineResult` schema, the engine, and proof.ts are untouched.
- Engine boundary unaffected: scan.ts is a command, so chalk/render imports are allowed here.
- `formatHumanReadable` stays pure (string in/out, no I/O) so it remains directly unit-testable.

## Gotchas

- **Two `formatHumanReadable` symbols exist** — scan.ts and proof.ts. Change ONLY scan's.
- **`headerBox` does not truncate.** Scan currently truncates its summary (drop monorepo package
  count, then ellipsis) to fit 71. Preserve that ladder, and compute its width budget as
  `inner − visibleWidth(shape) − minGap` so the subtitle (summary left + shape right) never
  overflows 71. Losing this is how A002 (summary line `length === 71`) would break.
- **Rounded corners only change the four corner glyphs** (`╭╮╰╯`); the vertical border stays
  `│`. So the name/summary line lengths stay 71 and A001/A002 hold; only the `┌` corner check
  and golden snapshots change.
- **`patterns.errorHandling`/`validation` are a `PatternConfidence | MultiPattern` union.** Use
  `getPatternLibrary(pattern)` (exported from `engine/types/patterns.js`) and read `confidence`
  off the value; do not assume `.library` exists on the bare union.
- **Naming `mixed` is the trap.** `mixed === true` means "no real majority" — omit, never show
  the inflated `majority`. The gate fixture exists to prove this.
- **Surface-tier nulls.** `result.conventions` and `result.patterns` are both `null` on
  `--quick`; guard with early returns before reading sub-fields.
- **Tests run against compiled `dist/`** for the subprocess (`runScan`) tests in scan.test.ts —
  rebuild (`pnpm run build`) before running them manually, or stale dist gives false passes. The
  new golden file imports `formatHumanReadable` directly (no dist, no subprocess) and is immune.
- **`.js` import extension** required on the `../utils/render.js` import (ESM runtime).

## Build Brief

### Rules That Apply
- Local imports end in `.js`; `import type` for type-only imports, kept separate from value
  imports (coding-standards). Import the render primitives from `'../utils/render.js'`.
- Prefer early returns over nested conditionals — gate each Conventions row with an early skip,
  keep the main path flat (coding-standards).
- Explicit return types on exported functions; `formatHumanReadable` keeps its current signature.
- Golden snapshots: strip color with `chalk.level = 0` in `beforeAll`; restore nothing else is
  needed (no TZ dependence — scan's card has no timestamp). Assert specific values, never
  tautologies; when a search (`find`/`findIndex`) backs an assertion, assert it succeeded first
  (testing-standards).
- When overriding `EngineResult` fields in fixtures, spread at each nesting level off
  `createEmptyEngineResult()` — never reconstruct the 40-field object by hand (testing-standards).
- Force the branch name in any git-repo test with `git init -b main` (testing-standards) — only
  relevant if a fixture shells out; the direct-render golden fixtures avoid git entirely.

### Pattern Extracts

Header + section + rows, from `packages/cli/src/commands/proof.ts` (the structural analog):

```ts
// proof.ts:326–334 — rounded header box
lines.push(
  ...headerBox({
    title: headline,
    subtitleLeft,
    subtitleRight: timestamp,
    corners: 'rounded',
    width,
  })
);
// proof.ts:347 — inset section rule with optional roll-up
lines.push(sectionRule('Contract', { rollup, width }));
// proof.ts:373–380 — aligned key/value rows
const timingRows: KeyValueRow[] = [{ label: 'Total', value: `${entry.timing.total_minutes} min` }];
lines.push(...keyValueRows(timingRows, { labelWidth: 12 }));
```

Pattern-union accessor, from `packages/cli/src/engine/types/patterns.ts`:

```ts
// getPatternLibrary handles PatternConfidence | MultiPattern; returns null if unset.
const lib = getPatternLibrary(result.patterns?.errorHandling); // 'exceptions' | null
```

The current scan rows already match `keyValueRows` shape — `chalk.gray(label.padEnd(12))` +
value (scan.ts:189) is exactly `keyValueRows(rows, { labelWidth: 12 })`.

Golden-test skeleton, from `packages/cli/tests/commands/proof-card-golden.test.ts:13–36, 236–249`:

```ts
import chalk from 'chalk';
import { formatHumanReadable } from '../../src/commands/scan.js';
import { createEmptyEngineResult } from '../../src/engine/types/engineResult.js';

beforeAll(() => { chalk.level = 0; });

it('renders the full deep-tier card', () => {
  const card = formatHumanReadable(deepTierResult, { isFunnel: false, rootPath: '/tmp/x' });
  expect(card).toMatchSnapshot();
  expect(card).toContain('── How your team writes');
  expect(card).toContain('camelCase');
});
```

### Proof Context
- `packages/cli/src/commands/scan.ts` — one build concern on record: *"formatHumanReadable not
  exported — surfaces display tested structurally"* (from Scan Surface Detection). **Stale** —
  the function is now exported (scan.ts:101) and the new golden file tests rendered output
  directly, which closes that concern.
- `packages/cli/src/utils/render.ts` — no active proof findings.

### Checkpoint Commands
- After scan.ts changes (focused, fast): `(cd packages/cli && pnpm vitest run tests/commands/scan.test.ts tests/commands/scan-finding-details.test.ts)` — Expected: scan-finding-details unchanged (all pass); scan.test.ts passes after the 3 assertion updates.
- After the golden file: `(cd packages/cli && pnpm vitest run tests/commands/scan-card-golden.test.ts)` — Expected: snapshots written then green; review the written `.snap` for alignment and the gate split before committing.
- After all changes (full baseline): `pnpm run test -- --run` — Expected: full suite green, count ≥ prior + new tests.
- Lint: `pnpm run lint` — Expected: clean.
- Build: `(cd packages/cli && pnpm run build)` — Expected: succeeds (required before subprocess scan tests see new behavior).

### Build Baseline
- Command used (focused): `(cd packages/cli && pnpm vitest run tests/commands/scan.test.ts tests/commands/scan-finding-details.test.ts)`
- Current tests (these two files): **96 passing in 2 files** (measured this session).
- After build: same 96 still pass (3 assertions updated in place, not removed) **+ new** Conventions
  `toContain` cases in scan.test.ts **+ ~5 golden tests** in the new `scan-card-golden.test.ts`.
  Net test count must not decrease; scan-finding-details.test.ts count is unchanged.
- Regression focus: `scan.test.ts` box-alignment and Surfaces blocks (the 3 updated assertions);
  `scan-finding-details.test.ts` must stay green untouched (proves the Findings/footer path
  didn't move).
