# Scope: Health dashboard + proof list table adopt the render vocabulary

**Created by:** Ana
**Date:** 2026-06-09

## Intent

After `proof-card-redesign` ships, `proof.ts` will contain **three** human renderers: the redesigned proof card (`formatHumanReadable`), the health dashboard (`formatHealthDisplay`), and the no-slug summary table (`formatListTable`). The card will be rebuilt on the shared `utils/render.ts` vocabulary; the other two will still hand-roll the old idiom — the same cyan box, bold labels over gray dashed underlines, magic-number widths — in the very same file. Leaving them dated means `ana proof health` and `ana proof` look like a different, older product than `ana proof <slug>` one screen away. *Finished means consistent.*

This scope makes the two secondary proof renders adopt the shared vocabulary so the whole proof command speaks one visual language, and gives the health dashboard the small visual upgrades it's been faking — a real sparkline for the weekly-commit trend (today it joins counts with a gray `→`), aligned stat rows, and inset-rule sections matching the card.

This is the small, clean adopter the session anticipated: "make scan + health easy to adopt it later." Health is the easy one.

## Complexity Assessment

- **Kind:** feature
- **Size:** small
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/proof.ts` — `formatHealthDisplay` (537–722) and `formatListTable` (730+) rebuilt on the shared module; the local `columnWidth` helper either moves into the module (it's the grid-primitive prior art) or is replaced by the module's grid primitive
  - `packages/cli/src/utils/render.ts` — consumed; the existing `columnWidth` logic likely folds in as the stat-grid primitive's backing
  - `packages/cli/tests/commands/proof.test.ts` — update health-display and list-table format assertions (including the health `A005` double-space / right-border check, which is exact-format by design)
  - `packages/cli/tests/utils/render.test.ts` — extend if the grid primitive gains capability
- **Blast radius:** Smallest of the three. Confined to two functions in proof.ts and their tests. No schema change, no `--json` change, no engine touch. The health JSON path and `HealthReport` type are untouched.
- **Estimated effort:** ~0.5–1 day. Mechanical adoption once the module exists; the only net-new visual is the sparkline.
- **Multi-phase:** no

## Approach

Rebuild `formatHealthDisplay` and `formatListTable` on the shared `utils/render.ts` primitives so they match the redesigned card: the shared header box, inset section rules (Quality, Verification, Pipeline, Hot Spots, Next Actions), the right-aligned key/value seam for the stat rows, and the aligned stat-grid primitive for Hot Spots (which already does manual column-width math via `columnWidth` — that logic is the natural backing for the module's grid primitive, so this scope **removes** the bespoke helper rather than keeping a parallel one).

Two small visual upgrades for health, both pure presentation:
- **A real sparkline** for `trajectory` / weekly commits using the module's bar/sparkline primitive, replacing the gray-`→`-joined number string.
- **Severity-aware glyphs** in Hot Spots and Next Actions consistent with the card's finding treatment (risk/debt/observation), so a reader who's seen one proof surface reads them all the same way.

`formatListTable` (the `ana proof` summary of all entries) is a genuine table — it adopts the module's grid primitive so the no-slug view is consistent with everything else. Including it here (rather than leaving it) is the point: after this scope, proof.ts has zero dated renders.

No data changes. The `HealthReport` shape, the zero-runs path, all section-omission rules (Pipeline omitted under 3 timed entries, Hot Spots omitted when empty, Next Actions cap of 5) are preserved exactly.

## Acceptance Criteria

- AC1: `formatHealthDisplay` renders using the shared `utils/render.ts` primitives; no hand-rolled box-drawing or bold-label-plus-dashed-underline section headers remain in the function.
- AC2: `formatListTable` renders using the shared grid/section primitives; the local `columnWidth` helper is removed (folded into the module's grid primitive) rather than duplicated.
- AC3: The health dashboard, the proof card, and the summary table are visually consistent — same header box, inset-rule sections, palette, and glyph vocabulary.
- AC4: The weekly-commit / trajectory trend renders as a real sparkline via the module's primitive, replacing the `→`-joined number string; it degrades to an ASCII/textual fallback under NO_COLOR / non-UTF-8.
- AC5: All health section-omission rules are preserved exactly — zero-runs shows "No data."; Pipeline omitted when fewer than 3 entries have timing; Hot Spots omitted when empty; Next Actions capped at 5 and sorted by recurrence.
- AC6: Color is one accent + grayscale + semantic-status-only; every colored element pairs with a glyph/word; both renders are legible and aligned under NO_COLOR / non-TTY.
- AC7: `ana proof health --json` and `ana proof --json` outputs are byte-identical to before this change (presentation-only).
- AC8: Hot Spots column alignment holds for long/disambiguated module names (the existing basename-disambiguation behavior is preserved) and many findings.
- AC9: All existing proof health and list-table tests pass (updated where the visible format changed, including the exact-format `A005` check); test count does not decrease.

## Edge Cases & Risks

- **Zero-runs path** (`reportOrZero === 0`) — must still render the header box + "No data." cleanly through the new primitives.
- **Section omission:** Pipeline (under 3 timed entries), Hot Spots (empty), Next Actions (none) — each omitted with no empty header, exactly as today.
- **`A005` exact-format test:** asserts no double-space / trailing gap before the right border — a brittle check that the new header primitive must satisfy or the assertion must be updated to the new format. This is the one genuinely exact-format test in the set.
- **Sparkline rendering:** block glyphs (`▁▂▃▄▅▆▇█`) render wider in some fonts and may not survive non-UTF-8 locales — needs an ASCII fallback; never place it inside an alignment-critical column.
- **Hot Spots basename disambiguation** (`dir/file` when basenames collide) must survive the grid-primitive migration.
- **`columnWidth` removal:** any other caller of `columnWidth` must be checked before deletion (confirm it's local to these renders).
- **NO_COLOR / non-TTY:** alignment must not depend on ANSI; chalk auto-strips.

## Rejected Approaches

- **Leave health and the list table on the old idiom** — rejected. It leaves two dated renders in the same file as the new card, one screen apart. "Finished means consistent." The whole reason to scope these is to remove the divergence.
- **Redesign health's information architecture** (new metrics, reordered sections) — rejected/out of scope. This is presentation adoption, not a rethink of what health reports. Data and section logic are preserved.
- **Keep `columnWidth` as a parallel helper** — rejected. That keeps two grid implementations (the module's and the local one) drifting. Fold it in; delete the duplicate ("the elegant solution removes").
- **Split health and the list table into separate scopes** — rejected. Both are small, same file, same adoption pattern, same tests; splitting them is overhead for no benefit.

## Open Questions

- Whether `columnWidth` (or its logic) becomes the public grid primitive in the module, or the module's grid primitive supersedes it entirely — depends on the API `proof-card-redesign` settles.
- Sparkline glyph set and ASCII fallback — should match whatever the module standardizes for proportion/trend bars.
- Whether the summary table (`formatListTable`) wants the same header box as the dashboard, or a lighter treatment (it's a list, not a single-subject card).

## Exploration Findings

### Patterns Discovered
- `packages/cli/src/commands/proof.ts:537-722` — `formatHealthDisplay`. Header box (546–563, "same dimensions as formatHumanReadable" — explicit duplication). Sections: Quality (575–601), Verification (603–613), Pipeline (615–629), Hot Spots (631–673, uses `columnWidth` for alignment + basename disambiguation), Next Actions (675–717, merged promote/scope, cap 5). Zero-runs early return (566–571).
- `packages/cli/src/commands/proof.ts:730+` — `formatListTable`, the no-slug `ana proof` summary; same bold-header idiom (`Proof History`).
- Health already fakes a sparkline: `activity.weeklyCommits.join(chalk.gray('→'))` in scan, and the trajectory trend in health is plain text — both want a real bar/sparkline primitive.
- `columnWidth(values, accessor, min)` — existing column-width helper used by Hot Spots; the prior art for the module's grid primitive.

### Constraints Discovered
- [TYPE-VERIFIED] `HealthReport` drives the dashboard; this scope reads it unchanged. Zero case is the sentinel `0`.
- [OBSERVED] Header box dimensions (boxWidth 71) are shared with the card by copy, not by a primitive — the duplication the module removes.
- [OBSERVED] Section-omission rules are load-bearing (Pipeline <3 timed entries, Hot Spots empty, Next Actions cap 5) and must be preserved.
- [OBSERVED] No `process.stdout.columns` usage; width is hardcoded.

### Test Infrastructure
- `packages/cli/tests/commands/proof.test.ts` (5,465 lines) — health and list-table assertions live here alongside the card's; mostly substring `toContain`, with the exact-format `A005` double-space/right-border check being the one brittle case. The health dashboard health-trajectory tests are in `tests/utils/proof-health.test.ts` (data-level, unaffected by render).

## For AnaPlan

### Structural Analog
The redesigned `formatHumanReadable` (proof card) in the same file is the direct structural analog and the module source — health and the list table should mirror its primitive usage exactly. They share the file, so the adoption pattern is copy-the-card's-approach.

### Relevant Code Paths
- `packages/cli/src/commands/proof.ts:537-722` — `formatHealthDisplay`
- `packages/cli/src/commands/proof.ts:730+` — `formatListTable`
- `packages/cli/src/commands/proof.ts` — `columnWidth` helper (grid prior art)
- `packages/cli/src/utils/render.ts` — shared module to consume (prerequisite)
- `packages/cli/src/types/proof.ts` — `HealthReport` (read-only)

### Patterns to Follow
- Keep both renderers pure (string in/out).
- Reuse the cyan accent and the module's glyph/sparkline vocabulary.
- Mirror the card's section idiom so all three proof renders are one family.

### Known Gotchas
- The `A005` exact-format assertion is the one brittle test — satisfy it through the header primitive or update it deliberately.
- `columnWidth` removal requires confirming no other caller.
- Section-omission rules are load-bearing — preserve every one.
- Sparkline glyphs need an ASCII/non-UTF-8 fallback and must stay out of aligned columns.

### Things to Investigate
- Whether `formatListTable` wants the full header box or a lighter list treatment.
- The exact sparkline primitive contract (glyph set, fallback) — should be standardized in the module, not invented here.

## DEPENDENCY

This scope **requires `proof-card-redesign` to land first** — it ships `utils/render.ts`. Natural sequence: `proof-card-redesign` → (`scan-card-redesign` and `health-dashboard-redesign`, either order; health is the smaller/safer of the two). The module API is the integration contract.
