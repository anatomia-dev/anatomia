# Spec: Proof card visual redesign on a shared render vocabulary

**Created by:** AnaPlan
**Date:** 2026-06-09
**Scope:** .ana/plans/active/proof-card-redesign/scope.md

## Approach

Extract a small, pure terminal-render vocabulary into a new `utils/render.ts` and rebuild the `ana proof <slug>` human card (`formatHumanReadable` in `commands/proof.ts`) entirely on top of it. The module is the foundation; the proof card is the first and only consumer wired in this scope. `formatHealthDisplay` additionally adopts only the shared **header** primitive (square default → byte-identical output). `scan.ts` is NOT modified — it is validated against the primitives on paper (see "AC11 paper-validation" below) so it can adopt them in a later scope without a rewrite.

This is **presentation-only**: no schema change, no new captured data, the `--json` path untouched. The credibility fix (surfacing cache tokens) renders fields that already exist on `ProvenanceCounts.tokens`.

### The six primitives (AC1)

All primitives are pure (data in → `string` or `string[]` out), take an explicit `width` (default 71, the current box inner-width convention) rather than reading `process.stdout.columns`, and emit color via `chalk` so chalk's own `NO_COLOR`/non-TTY auto-stripping governs ANSI. No layout may depend on ANSI being present.

1. **`headerBox`** — the one ceremonial box. Title line + optional subtitle line with left content and right-aligned content (e.g. timestamp). Takes a `corners` option: **`'square'` (default)** uses `┌┐└┘`; `'rounded'` uses `╭╮╰╯`. Reproduces the current 71-wide box dimensions exactly when called with defaults, so health stays byte-identical.
2. **`sectionRule`** — an inset horizontal rule carrying a label and an optional right-aligned roll-up: `── Contract ───────────────── 44/44 ✓`, `── Findings ──────────── 1 debt · 4 obs`. Replaces every `chalk.bold('  Label')` + `chalk.gray('  ' + '─'.repeat(n))` pair.
3. **`keyValueRows`** — aligned label/value rows: a gray label column (`padEnd` to a computed or given width) followed by the value. Covers the proof Timing block, scan's Stack/Conventions rows, and health's Quality/Verification/Pipeline lines.
4. **`statGrid`** — a borderless aligned grid. Per-column alignment (`'left'` for text, `'right'` for numerics), column widths computed from content with a min/max (lift `columnWidth` into the module and use it here), an optional footer row visually separated by a rule (the Provenance `TOTAL` row), and a per-column max-width that **truncates** over-long cells rather than letting them shear the grid (this is the alignment-preservation mechanism and it fixes the known `cli-polish-C3` Hot-Spots truncation bug when health adopts it later).
5. **`proportionBar`** — a filled/empty ratio bar (`████████░░░░`) with an `ascii` option that degrades block glyphs to ASCII (`####----` or similar). Must be returned as a standalone string for use on its own line — never placed inside an alignment-critical column.
6. **`statusGlyph`** — the semantic status glyph (lift and generalize `getStatusIcon`): SATISFIED→green `✓`, UNSATISFIED→red `✗`, DEVIATED→yellow `⚠`, UNVERIFIED/UNCOVERED→gray `?`, else gray `·`. Every colored glyph is paired with a word/count by its callers so it survives `NO_COLOR`.

Also lift `formatTokenCount` (the `48.2k`/`1.4M` formatter), `columnWidth`, and the `BOX` constant into `render.ts`. `commands/proof.ts` imports them from the module; do not leave duplicate copies behind.

### Open-question resolutions (locked)

- **Module name** → `utils/render.ts`.
- **Min-width** → hard 80-col assumption; primitives take a `width` param (default 71) so a future responsive layer is a one-line change. Do NOT read `process.stdout.columns` — it is `undefined` when piped and fights the pure/pipe-safe property.
- **Accent** → keep cyan.
- **Header corners** → `headerBox` defaults to **square**. The proof card passes `corners: 'rounded'`. `formatHealthDisplay` uses the default → byte-identical. **The end state is rounded everywhere** — health flips to rounded in its own redesign scope; the square default here is a temporary transition state, not a permanent divergence. Document this intent in the `headerBox` JSDoc so the next adopter doesn't read square-default as the final design.
- **Health header adoption** → yes, now, header-only, square default.

### AC11 paper-validation (required Plan deliverable — zero gaps)

The render module is the integration contract for `scan-card-redesign` and `health-dashboard-redesign`. Each future adopter section is expressible in the primitives with no gap:

| Future surface | Section | Primitive | Notes |
|---|---|---|---|
| `scan.ts` | Stack rows (`Language  TypeScript`) | `keyValueRows` (labelWidth 12) | matches current `chalk.gray(label.padEnd(12))` exactly |
| `scan.ts` | Conventions rows (same label/value shape) | `keyValueRows` | same primitive |
| `scan.ts` | Stack/Surfaces section header | `sectionRule('Stack')` (no roll-up) | replaces `bold + gray ─` pair |
| `formatHealthDisplay` | Hot Spots (name / findings / runs) | `statGrid` (left/left/left columns) | `statGrid`'s max-width truncation fixes `cli-polish-C3` |
| `formatHealthDisplay` | Quality / Verification / Pipeline | `keyValueRows` | label/value rows |
| proof card | Provenance (turns/tools/in/out/cache/cost + TOTAL) | `statGrid` (right-aligned numerics + footer) | the stress test that proves the grid general |

No primitive gap exists. The `statGrid` footer-row-under-rule and per-column alignment are the only capabilities beyond what the simplest sections need, and Provenance requires both — so the API is validated by its hardest in-scope consumer, not just on paper.

## Output Mockups

These define the user-visible contract. Widths shown are illustrative; exact column widths are computed by the primitives. All sections sit ≤80 columns.

### PASS card with Provenance (provenance-rich, ≥6 sessions, shared model)

```
╭───────────────────────────────────────────────────────────────────╮
│  PASS · Proof card visual redesign                                  │
│  cli · 23 min · $4.12                            2026-06-08 14:32    │
╰───────────────────────────────────────────────────────────────────╯

── Contract ──────────────────────────────────────────── 44/44 ✓
  ████████████████████████████████████████████████████████████████
  ✓ 44 satisfied · 0 unsatisfied · 0 deviated

── Timing ──────────────────────────────────────────────────
  Total        23 min
  Think         4 min
  Plan          5 min
  Build        10 min
  Verify        4 min

── Findings ───────────────────────────── 1 debt · 4 obs
  [debt · scope]   SEVERITY_ORDER map duplicated across two blocks
  [obs]            Hardcoded literal 10 instead of MIN_ENTRIES_FOR_TREND
  [obs]            No summary truncation for promotion candidates
  3 more — see `ana proof proof-card-redesign --json`

── Provenance ───────────────────────────────────────────────
  model  claude-opus-4-8
  session         turns  tools      in     out    cache     cost
  plan               12     48   12.1k    4.2k    880k    $0.42
  build              31    140   18.0k    9.1k     2.1M    $1.90
  build 2             9     22    4.0k    1.1k    410k    $0.31
  verify             14     61   10.2k    3.0k    920k    $1.49
  ─────────────────────────────────────────────────────────────
  TOTAL  4 sessions                                       $4.12  (table v3)
  churn  12 files · +840/−210
  completeness  ✓ complete (plan 1/1 · build 2/2 · verify 1/1)
```

Notes on the Provenance grid:
- When **all** sessions share one model, the model collapses to a single `model  <id>` header line and the session label column is just `<role>` (with a rework index like `build 2` for repeated build attempts). When models **differ**, drop the `model` header line and put the per-session model into the label column (`build · opus-4-8`), truncating the **label** column (never the numeric columns) if width-tight.
- `in / out / cache` are three separate right-aligned columns. Codex sessions have `cache_create = 0` and only `cache_read` — render the cache cell from the captured values as-is (a `0` create still sums into a meaningful cache figure; do not special-case Codex beyond what the numbers produce).
- Unpriced model → the cost cell shows `n/a` (never `$0.00`); such sessions add `· N unpriced` to the TOTAL line and contribute nothing to the cost sum.
- Counts-unavailable session (`derived` absent) → its row shows the label and `counts unavailable` spanning the numeric columns; it contributes nothing to totals.

### PASS card without Provenance (the DEFAULT — 192 of 199 entries)

```
╭───────────────────────────────────────────────────────────────────╮
│  PASS · Close the loop on proof context                             │
│  cli · 18 min                                    2026-06-07 09:11    │
╰───────────────────────────────────────────────────────────────────╯

── Contract ──────────────────────────────────────────── 12/12 ✓
  ████████████████████████████████████████████████████████████████
  ✓ 12 satisfied · 0 unsatisfied · 0 deviated

── Timing ──────────────────────────────────────────────────
  Total        18 min
  ...
```

The card must read as finished without a Provenance section. The header subtitle omits the cost segment when no priced provenance exists.

### FAIL / DEVIATED card

```
╭───────────────────────────────────────────────────────────────────╮
│  ✗ FAIL · Some half-built feature                                   │
│  cli · 31 min                                    2026-06-05 22:40    │
╰───────────────────────────────────────────────────────────────────╯

── Contract ──────────────────────────────── 9/12 · 2 ✗ · 1 ⚠
  ██████████████████████████████████████████░░░░░░░░░░░░░░░░░░░░░░
  9 satisfied · 2 unsatisfied · 1 deviated
  ✗ A007  Webhook signature is verified before processing
  ⚠ A010  Idempotency key is enforced on retried writes
        → built with a 5-minute TTL instead of permanent dedup
```

Passing assertions collapse to the counted line; each UNSATISFIED renders individually with its `says`; each DEVIATED renders with its `says` and its deviation detail (the old standalone "Deviations" section folds in here — no detail is lost). The verdict glyph: green `✓` on PASS headline, red `✗` on FAIL headline.

## File Changes

### `packages/cli/src/utils/render.ts` (create)
**What changes:** New module exporting the six primitives plus the lifted `formatTokenCount`, `columnWidth`, `BOX`, and `statusGlyph`. Pure functions, explicit return types, JSDoc `@param`/`@returns` on every export.
**Pattern to follow:** the pure string-building style of the current `formatHumanReadable`; the `columnWidth`-driven dynamic alignment already in `proof.ts` (lines 85–98) and the Hot-Spots block (`proof.ts:644–672`).
**Why:** without one render vocabulary, three surfaces keep duplicating box/section/icon logic and drift; this is the single place they converge on.

### `packages/cli/src/commands/proof.ts` (modify)
**What changes:** Rebuild `formatHumanReadable` (264–525) on the imported primitives — no inline box-drawing literals or ad-hoc `bold`+`gray ─` section headers remain. Header → `headerBox({ corners: 'rounded' })` with `PASS`/`✗ FAIL` headline + `surface · duration[ · cost]` subtitle. Each section header → `sectionRule` with the roll-up for Contract (satisfied ratio) and Findings/Build Concerns (severity counts). Contract body → `proportionBar` + collapsed counted line; UNSATISFIED/DEVIATED rendered individually (folds in today's Deviations block at 509–520). Findings/Build Concerns → severity roll-up + capped list + actionable `--json` overflow line (replace `... and N more`). Provenance block (436–507) → `statGrid` with `in/out/cache` columns and a `TOTAL` footer row under a rule. `formatHealthDisplay` (537+) header (556–563) → `headerBox()` with defaults (square) for byte-identical output. Remove the now-duplicated `BOX`, `getStatusIcon`, `formatTokenCount`, `columnWidth` definitions and import them from `render.ts`. Move/keep `SEVERITY_ORDER` usage; collapse the duplicated severity-sort/roll-up logic between Findings and Build Concerns into one shared helper (addresses the known duplication build-concern).
**Pattern to follow:** existing function structure; `getStatusIcon`/`formatTokenCount` semantics preserved exactly when lifted.
**Why:** the card is the redesign target; importing from the module removes the duplication the module exists to remove.

### `packages/cli/tests/utils/render.test.ts` (create)
**What changes:** Unit tests for each primitive in isolation (structural analog: `tests/commands/scan-finding-details.test.ts`, which imports a renderer and asserts on its string output).
**Why:** AC1 requires each primitive to have dedicated tests; keeps the test count rising.

### `packages/cli/tests/commands/proof-card-golden.test.ts` (create)
**What changes:** Golden/snapshot tests of the **full rendered card** via direct import of `formatHumanReadable`, using vitest `toMatchSnapshot`, across five fixtures: provenance-rich, provenance-absent, ≥6 sessions (rejection cycles), unpriced model, and a FAIL/DEVIATED card. `formatHumanReadable` is already color-free under vitest (non-TTY → `chalk.level` is 0, which is why `proofSummary.test.ts`'s `toContain` checks pass today); set `chalk.level = 0` defensively at the top of the file to guarantee plain-text snapshots regardless of runner TTY.
**Why:** AC10 — golden files make PR review mechanical (alignment, grid columns, rule widths) where `toContain` cannot.

### `packages/cli/tests/commands/proof.test.ts` (modify)
**What changes:** Update the minority of exact-format assertions broken by the redesign (section-header format, severity-tag `[risk · promote]` lines, Provenance line shape, the removed `... and N more`). Most are substring `toContain` on preserved labels/tokens and survive. **This file runs via `execSync` against `dist/index.js`** — it requires a fresh build to pass.
**Why:** the visible format changed; assertions are rewritten in lockstep (never deleted — test count must not decrease).

### `packages/cli/tests/utils/proofSummary.test.ts` (modify)
**What changes:** Update the `formatHumanReadable` phase-breakdown assertions (2400+) to the new Timing/section format. Direct import — no build needed.

### `packages/cli/tests/commands/commit-hygiene.test.ts` (modify)
**What changes:** Update commit-hygiene render assertions (364+) to the new section-rule format. The Commit Hygiene section is retained.

## Acceptance Criteria

Copied from scope, with implementation criteria appended:

- [ ] AC1: `utils/render.ts` exports typed, unit-tested primitives covering: header box, inset section rule with optional right-aligned roll-up, aligned key/value rows, borderless aligned stat grid, ASCII-degradable proportion bar, and semantic status glyph. Each has dedicated tests.
- [ ] AC2: `formatHumanReadable` renders the card using only shared primitives — no inline box-drawing literals or ad-hoc section-header/underline construction remain in the function.
- [ ] AC3: Every card section header is an inset rule; Contract and Findings/Build Concerns rules carry an inline roll-up (Contract: satisfied ratio; Findings/Concerns: counts by severity).
- [ ] AC4: Passing assertions collapse to a single counted line; UNSATISFIED/DEVIATED always render individually with their `says` (and deviation detail where present). No card lists every passing assertion.
- [ ] AC5: Findings and Build Concerns lead with a severity roll-up and cap the detailed list; any overflow line names an actionable next step (`--json`), never a bare "and N more".
- [ ] AC6: Provenance renders as an aligned grid including input, output, AND cache tokens per session; per-session and TOTAL cost are present with the price-table version; the TOTAL row is separated by a rule; completeness renders on one line.
- [ ] AC7: Card output stays within 80 columns and uses only single-width glyphs; alignment is preserved for long model ids, ≥6 sessions, counts-unavailable sessions, unpriced models, and Codex sessions (`cache_create = 0`).
- [ ] AC8: Color is one accent + grayscale + semantic-status-only; every colored element is paired with a glyph/word; the full card is legible and correctly aligned with `NO_COLOR=1` and when piped to a non-TTY.
- [ ] AC9: `ana proof <slug> --json` output is byte-identical to before this change.
- [ ] AC10: All existing proof, proofSummary, commit-hygiene, and health tests pass (updated where format changed); total test count does not decrease; `render.test.ts` adds primitive coverage; golden/snapshot tests of the full card exist across the five fixtures, rendered color-stripped.
- [ ] AC11: (Plan deliverable — satisfied in this spec's "AC11 paper-validation" table; no build action beyond keeping the primitives shaped as specified.)
- [ ] `headerBox` defaults to square corners; `formatHealthDisplay` output is byte-identical to pre-change (verify against existing health assertions).
- [ ] No duplicate `BOX` / `getStatusIcon` / `formatTokenCount` / `columnWidth` definitions remain in `proof.ts`.
- [ ] `(cd packages/cli && pnpm vitest run)` passes; `pnpm build` succeeds; lint passes.

## Testing Strategy

- **Unit tests (`render.test.ts`):** one `describe` per primitive. For each: a plain-text shape assertion (label present, rule fills to width), an alignment assertion (columns line up across rows of differing content width), and the edge that matters for that primitive — `headerBox` square vs rounded corner chars and 71-width back-compat; `sectionRule` right-aligned roll-up within width; `statGrid` right-aligned numerics + footer-under-rule + over-width cell truncation; `proportionBar` ASCII degradation and 0%/100% bounds; `statusGlyph` each status.
- **Golden tests (`proof-card-golden.test.ts`):** `toMatchSnapshot` on `formatHumanReadable(fixture)` for the five fixtures. Construct fixtures in-memory as `ProofChainEntry` objects (no temp dirs, no subprocess). Set `chalk.level = 0`.
- **Regression (existing files):** rewrite broken exact-format assertions to the new format; preserve all `toContain` checks on labels still present. Run the full cli surface before declaring done.
- **Edge cases to cover explicitly:** ≥6 sessions; mixed-model sessions (model column not collapsed); shared-model sessions (model header line); a `derived`-absent session; an unpriced-model session (`n/a` + TOTAL `unpriced` suffix); a Codex session (`cache_create = 0`); a long suffixed model id (`claude-opus-4-8[1m]`) proving label-column truncation; the no-Provenance card; a FAIL card with UNSATISFIED + DEVIATED; single-phase and multi-phase (`timing.segments`) timing paths.

## Dependencies

None new. Uses existing `chalk` (^5.3.0). No `strip-ansi` dependency — rely on `chalk.level = 0` in golden tests and chalk's own non-TTY stripping at runtime.

## Constraints

- **Presentation-only:** do not touch `forensics.ts`, `pricing.ts`, `types/proof.ts`, the proof-chain schema, or the `--json` render path. `computeCost` is consumed read-only.
- **Test count must not decrease** (CI: 3 OS × 2 Node). Format-assertion updates are rewrites, not deletions.
- **80-column ceiling, single-width glyphs only.** No layout may depend on ANSI presence.
- **Both harnesses:** Claude and Codex sessions must render correctly (Codex: `cache_create = 0`, `cache_read` populated).
- **Health byte-identical:** `formatHealthDisplay`'s rendered output must not change in this scope.
- **Engine boundary:** `render.ts` lives in `utils/` and may use `chalk` (utils/commands may; engine may not) — keep it out of `src/engine/`.

## Gotchas

- **`proof.test.ts` runs against `dist/index.js` via `execSync`.** Run `pnpm build` (or the cli build) before those assertions will reflect your changes; a stale `dist` will fail or pass misleadingly. The `render.test.ts`, `proof-card-golden.test.ts`, and `proofSummary.test.ts` import from `src` and need no build.
- **Two `formatHumanReadable` symbols exist** (`proof.ts` and `scan.ts`). Only the `proof.ts` one changes. Do not cross the streams; `scan.ts` is untouched this scope.
- **chalk + `padEnd` interaction:** ANSI codes inflate `.length`, so padding a colored string with `padEnd` mis-aligns (see scan.ts's explicit `nameVisibleWidth` workaround at 143–147). Primitives must compute widths on the **plain** text and apply color after padding, or measure visible width explicitly. This is the single most likely alignment bug.
- **Proportion bars use wide block glyphs** that some fonts render wider — keep them on their own line, never inside an aligned column, and provide the ASCII fallback.
- **DEVIATED collapse:** today's separate Deviations section (509–520) holds the deviation detail. Folding it into the assertions area must preserve the `says` + `→ deviation` detail for every DEVIATED assertion.
- **Severity roll-up duplication:** the Findings and Build Concerns blocks currently duplicate the severity-sort + tag logic, and `SEVERITY_ORDER` is duplicated (known build-concern). Collapse to one shared helper rather than copying it a third time.
- **Header subtitle cost:** include the ` · $cost` segment only when a priced Provenance total exists; the no-Provenance card (the default) must not show a dangling cost.
- **Model-collapse condition:** "all sessions share a model" compares the effective model (`derived?.model || s.model`) across sessions; a single differing or counts-unavailable session means do not collapse.

## Build Brief

### Rules That Apply
- All local imports end in `.js` (`import { headerBox } from '../utils/render.js'`) and use `import type` for type-only imports, separate from value imports. Built CLI is ESM — missing `.js` crashes at runtime.
- Named exports only; no default exports.
- Explicit return types on all exported functions; `@param`/`@returns` JSDoc on every export (pre-commit lint rejects missing tags).
- Prefer early returns; avoid `any` (use `unknown` + narrowing); use `| null` for checked-empty fields.
- `utils/` may use `chalk`; never add `chalk`/`ora` to `src/engine/`. This module is `utils/`, so chalk is fine.
- Compute column/pad widths on plain (uncolored) text; apply `chalk` after padding (the ANSI-width trap above).

### Pattern Extracts

Current dynamic column-width helper to lift into the module (`proof.ts:85–98`):
```ts
function columnWidth(
  items: readonly unknown[],
  accessor: (item: unknown) => string,
  minWidth: number,
  maxWidth = 40,
  gap = 2
): number {
  let longest = 0;
  for (const item of items) {
    const len = accessor(item).length;
    if (len > longest) longest = len;
  }
  return Math.min(maxWidth, Math.max(minWidth, longest + gap));
}
```

Status glyph to generalize into `statusGlyph` (`proof.ts:229–243`):
```ts
function getStatusIcon(status: string): string {
  switch (status.toUpperCase()) {
    case 'SATISFIED':   return chalk.green('✓');
    case 'UNSATISFIED': return chalk.red('✗');
    case 'DEVIATED':    return chalk.yellow('⚠');
    case 'UNVERIFIED':  return chalk.gray('?');
    case 'UNCOVERED':   return chalk.gray('?');
    default:            return chalk.gray('·');
  }
}
```

Token formatter to lift (`proof.ts:252–256`):
```ts
function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
```

The ANSI-width-safe padding pattern to follow for any colored, aligned cell (`scan.ts:143–147`):
```ts
const namePad = innerWidth - projectName.length - shape.length - 4;
// Compute visible width explicitly — chalk.dim(shape) adds ANSI codes that break padEnd
const nameVisibleWidth = 2 + projectName.length + Math.max(1, namePad) + shape.length;
const nameTrailing = ' '.repeat(Math.max(0, innerWidth - nameVisibleWidth));
```

Cost/unpriced handling to preserve when moving the Provenance totals into `statGrid` (`proof.ts:451–484`):
```ts
const cost = computeCost(d.tokens, d.model);
const costLabel = cost.priced ? `$${cost.cost_usd.toFixed(2)}` : 'n/a (unpriced)';
// ... TOTAL: sum priced, count unpriced, carry price_table_version from first derived session
```

Type shapes (read-only — `pricing.ts:17` and `forensics.ts:45`):
```ts
interface TokenCounts { input: number; output: number; cache_create: number; cache_read: number; }
// ProvenanceCounts.tokens: TokenCounts; also .turns, .tool_calls, .model, .price_table_version
// SessionProvenance.derived?: ProvenanceCounts  (optional — counts-unavailable rows)
```

### Proof Context

Active findings/concerns on `commands/proof.ts` relevant to this build (from `ana proof context`):
- **`cli-polish-C3` (debt):** "Hot spots displayNames not truncated when exceeding maxWidth — padEnd passes through unchanged." The `statGrid` max-width truncation directly fixes this when health adopts the grid later; build the truncation into `statGrid` now so the fix lands at adoption.
- **Build concern — `SEVERITY_ORDER` map duplicated** in the findings and build-concerns blocks. The redesign collapses these into one shared severity-roll-up helper — resolve the duplication rather than carry it forward.
- **Build concern — no summary truncation for promotion candidates / long summaries break formatting.** Not in this card's path (that's health's Next Actions), but the `statGrid`/`keyValueRows` truncation primitives are the eventual fix; keep them truncation-capable.
- `learn-session-memory-C1` (proof.ts over-exports helpers): keep the new render helpers in `render.ts`; do not export card-internal helpers from `proof.ts`.

No other active findings bear on the render path. `forensics.ts`, `pricing.ts`, `types/proof.ts` have no findings relevant here and are not modified.

### Checkpoint Commands
- After `render.ts` + `render.test.ts`: `(cd packages/cli && pnpm vitest run tests/utils/render.test.ts)` — Expected: all new primitive tests pass.
- After rebuilding `formatHumanReadable` + golden tests: `pnpm build` then `(cd packages/cli && pnpm vitest run tests/commands/proof.test.ts tests/commands/proof-card-golden.test.ts tests/utils/proofSummary.test.ts)` — Expected: pass (build required for `proof.test.ts`).
- After health header adoption: `(cd packages/cli && pnpm vitest run tests/commands/proof.test.ts)` health-display assertions — Expected: byte-identical, no change.
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: ≥ 3642 + new tests pass, 2 skipped, 0 failures.
- Lint: `(cd packages/cli && pnpm run lint)`.

### Build Baseline
Counts from `(cd 'packages/cli' && pnpm vitest run)` on 2026-06-09:
- Current tests: **3642 passed + 2 skipped (3644 total)**
- Current test files: **148**
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected **3642 + new** tests (new `render.test.ts` primitive tests + 5 golden snapshots; existing format assertions rewritten, not added/removed) across **150** files (2 new test files). Test count must not decrease.
- Regression focus: `tests/commands/proof.test.ts` (exact-format assertions, runs against `dist`), `tests/utils/proofSummary.test.ts` (phase-breakdown), `tests/commands/commit-hygiene.test.ts` (render), and any health-display assertions in `proof.test.ts`.
