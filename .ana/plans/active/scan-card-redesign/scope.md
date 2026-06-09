# Scope: Scan card redesign — adopt the render vocabulary + surface "how your team writes"

**Created by:** Ana
**Date:** 2026-06-09

## Intent

`ana scan` is the top-of-funnel surface — `npx anatomia-cli scan .`, no install, ten seconds, the first thing a newcomer ever sees and the asset the README GIF records. Two problems:

1. **The card is styled with the same dated idiom as the old proof card** — a hand-rolled cyan box, bold labels over gray dashed underlines, gray one-liners crammed into an "Intelligence" block. It also duplicates proof.ts's `BOX` constant byte-for-byte and hand-rolls the section-header underline at every section with magic-number widths.
2. **The card breaks its own promise.** The command describes itself as "Detect stack, **conventions, and patterns**," but `formatHumanReadable` never reads `result.conventions` or `result.patterns`. The deep-tier engine computes naming style, indentation, import style, error-handling signal, null-style preference, validation library, and commit format — all rich, all confidence-scored, all **discarded at render**. The single most differentiating thing scan can show a skeptical engineer — *"it read my code, not my package.json"* — is computed and thrown away.

This scope does two things together because they touch the same function and the same tests: (a) **adopt the shared `utils/render.ts` vocabulary** built in `proof-card-redesign` so scan and the proof card share one visual language, and (b) **add a "How your team writes" / Conventions section** surfacing the already-computed convention and pattern data with disciplined confidence gating. Doing both in one pass avoids reopening `scan.ts` twice ("don't ship something you'll re-open").

In the user's words across the session: "ana scan is an interesting prospect too... make scan + health easy to adopt it later... make it pretty and have taste." The conventions surfacing is the "money shot of the README-killer GIF" (issue #305).

## Complexity Assessment

- **Kind:** feature
- **Size:** medium
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/scan.ts` — `formatHumanReadable` (lines 101–379) rebuilt on the shared module; local `BOX` constant (36–43) removed in favor of the module; NEW Conventions section reading `result.conventions` + `result.patterns`
  - `packages/cli/src/utils/render.ts` — consumed (built in `proof-card-redesign`); MAY gain a small primitive if scan needs one the proof card didn't (e.g. a confidence-bar or distribution strip) — added to the module, not inlined
  - `packages/cli/tests/commands/scan.test.ts` — update the ~5 brittle format assertions (two `length === 71` box-width checks, the `/────────/` divider regex used twice, the `┌` box check); add coverage for the new Conventions section
  - `packages/cli/tests/commands/scan-finding-details.test.ts` — update the 4-space-indent finding-detail assertions if the finding render changes
  - `packages/cli/tests/utils/render.test.ts` — extend if a new primitive is added
- **Blast radius:** Contained to scan's human render path and its tests. The engine, `EngineResult` schema, scan's `--json` path, and the proof command are untouched. Test coupling is light — the agent map found only ~5 brittle assertions, all in scan.test.ts, no snapshots. Adding the Conventions section is net-new rendering with no existing tests blocking it.
- **Estimated effort:** ~1.5–2 days. The restyle is mechanical once the module exists; the design work is the Conventions section — deciding what to show, the confidence gate, and the format that reads as "tasteful restraint" not "data dump."
- **Multi-phase:** no

## Approach

Rebuild scan's `formatHumanReadable` on the shared `utils/render.ts` vocabulary so it speaks the same visual language as the redesigned proof card — one ceremonial header box, inset section rules with inline roll-ups, right-aligned key/value seams, the same palette discipline (one cyan accent + grayscale + semantic status glyphs, every color paired with a glyph). Remove scan's duplicate `BOX` and per-section hand-rolled underlines; they become calls into the module. This is the "elegant solution removes" principle: the duplication between scan.ts and proof.ts collapses into the one module.

Then **add the Conventions section** — the reason scan is the hook. Surface `result.conventions` (naming majority + confidence + the `mixed` flag, indentation style/width, import style) and `result.patterns` (error handling, validation library, each with its human-readable `evidence`), plus commit format from `git.commitFormat` / `git.branchPatterns`. The discipline *is* the feature: **gate every line on a confidence threshold and omit anything below it** — a half-confident guess is worse than silence here, because the whole point is "we actually read your code." Render it as a scannable block (the worked proof-card mock is the visual reference: aligned labels, dim secondary detail, no box).

Width strategy is a deliberate decision for Plan: scan currently hardcodes 71 while the proof card uses 80 — the redesign should unify on one approach (the module's), so the two cards are dimensionally consistent. Funnel mode (`isFunnel`, footer-only today) is preserved.

Out of scope, explicitly: **live animated scan progress (issue #299)** — that is streaming `onProgress` *during* the scan, a separate concern from the final static card, and folding it in would balloon this. Noted as the natural next scan scope.

## Acceptance Criteria

- AC1: Scan's `formatHumanReadable` renders using the shared `utils/render.ts` primitives; the local duplicate `BOX` constant and all hand-rolled bold-label-plus-dashed-underline section headers are removed from scan.ts.
- AC2: The scan card and the redesigned proof card are visually consistent — same header-box treatment, same inset-rule section idiom, same palette and glyph vocabulary, same width strategy (no two-different-widths mismatch).
- AC3: A new "How your team writes" / Conventions section renders, surfacing convention and pattern data from `result.conventions` and `result.patterns` (naming, indentation, imports, error-handling, validation, commit format) that the card does not surface today.
- AC4: Every Conventions line is gated on a confidence threshold; anything below threshold is omitted entirely (no low-confidence guesses shown). When nothing clears the gate (e.g. surface-tier scan with null conventions), the section is omitted cleanly with no empty header.
- AC5: Color is one accent + grayscale + semantic-status-only; every colored element pairs with a glyph/word; the full card is legible and aligned under `NO_COLOR` / non-TTY (scan tests already run `FORCE_COLOR=0`).
- AC6: `ana scan --json` output is byte-identical to before this change (presentation-only; the engine and schema are untouched).
- AC7: Funnel mode (`isFunnel`) behavior is preserved — clean-acknowledgment line and `ana init` CTA on funnel, scan.json reference and skill-manifest CTA off funnel.
- AC8: Graceful degradation — surface-tier scans (`conventions`/`patterns` null), monorepos with many surfaces (existing `MAX_SURFACES` cap), the no-stack ancestor-walk fallback, and long project names all render without breaking alignment.
- AC9: All existing scan tests pass (updated where the visible format changed); test count does not decrease; new coverage is added for the Conventions section.

## Edge Cases & Risks

- **Surface-tier / `--quick` scans:** `conventions` and `patterns` are null — the Conventions section must vanish cleanly, not render an empty header.
- **Confidence gating is the whole game:** showing a 0.4-confidence naming guess undermines the "we read your code" claim. The threshold and the omit-below behavior are the design crux, not a detail.
- **`mixed: true` naming** (e.g. files split PascalCase/kebab/camel) — decide whether to show "mixed" honestly or omit; honesty likely reads better than a false majority.
- **Width unification:** scan is 71, proof is 80 — picking one (the module's) shifts scan's box width and breaks the two `length === 71` assertions by design (update, don't delete).
- **Brittle assertions:** the `/────────/` divider regex (used twice to find sections) and the `┌` box-corner check assume the old idiom — they change with the inset-rule/rounded-box redesign.
- **NO_COLOR / FORCE_COLOR=0:** scan tests already run with color off; alignment must not depend on ANSI.
- **No-stack fallback** (ancestor walk, "Run from project root" in yellow) must survive the restyle.
- **Monorepo surfaces** capped at `MAX_SURFACES=4` — overflow `(+N more)` treatment preserved.
- **Commit-format data shape:** `git.commitFormat.conventional` is a confidence + sampleSize — gate it like the rest; don't assert a format from a tiny sample.

## Rejected Approaches

- **Restyle only, defer the Conventions section** — rejected. It reopens scan.ts a second time and ships a prettier card that still breaks scan's own "conventions and patterns" promise. The redesign is the right moment to add the section.
- **Fold in live animated scan progress (#299)** — rejected. Streaming `onProgress` during the scan is a separate architecture (threading a reporter through `scanProject`); bundling it balloons blast radius. It's the next scan scope, not this one.
- **Show all computed convention data** — rejected. A data dump undermines the credibility the section exists to build. Restraint (confidence gating, omit-below) is the feature.
- **Add new engine computation for conventions** — rejected/unnecessary. The data is already computed in the deep tier and discarded at render; this is surfacing, not computing.

## Open Questions

- The confidence threshold for the Conventions section (single global threshold vs per-signal) — a taste/calibration call for Plan, informed by real scan output on a few repos.
- Width strategy: adopt the module's chosen width (recommended, for cross-card consistency) — confirm the module exposes it.
- Whether a new primitive is needed (confidence indicator / distribution strip) or the existing proof-card primitives suffice.
- Exact ordering/placement of the Conventions section relative to Stack and Intelligence (likely right after Stack, as the second "money" block).

## Exploration Findings

### Patterns Discovered
- `packages/cli/src/commands/scan.ts:101-379` — scan's `formatHumanReadable(result, { isFunnel, rootPath })`. Sections in order: header box (127–168), Stack (170–266, incl. Services/Deploy/Workspace sub-rows), Surfaces (222–242), Intelligence (268–320: Activity/Hot files/Docs/Pre-commit), Findings + footer/CTA (322–376).
- `packages/cli/src/commands/scan.ts:36-43` — local `BOX` constant, byte-identical to proof.ts:132. The duplication the module removes.
- The "bold label + gray dashed underline" idiom is hand-rolled 3× in scan (Stack/Surfaces/Intelligence) with magic-number widths — no `sectionHeader()` helper exists. The shared module introduces it.
- Header box uses manual visible-width math (`nameVisibleWidth`, `nameTrailing`) to survive chalk ANSI — the module's header primitive should encapsulate this.

### Constraints Discovered
- [TYPE-VERIFIED] `EngineResult.conventions: ConventionAnalysis | null` and `EngineResult.patterns: PatternAnalysis | null` are populated deep-tier but never read by scan's render. `conventions` carries naming (majority/confidence/`mixed`/distribution), imports, indentation, codePatterns (emptyCatches, nullStyle, defaultExports, jsExtensionImports, nodePrefix). `patterns` carries errorHandling/validation/testing each with confidence + `evidence[]`.
- [TYPE-VERIFIED] `git.commitFormat`, `git.branchPatterns`, `git.mergeStrategy`, `git.coAuthor` exist on the result; scan surfaces none of them today (proof.ts surfaces Commit Hygiene).
- [OBSERVED] Width hardcoded `boxWidth = 71` (scan) vs 80 (proof) — a real inconsistency to resolve. No `process.stdout.columns` read anywhere.
- [OBSERVED] `isFunnel = !existsSync(<root>/.ana)` (scan.ts:451) affects only the footer.
- [OBSERVED] Scan tests run with `FORCE_COLOR=0` — color-off legibility is already exercised.

### Test Infrastructure
- `packages/cli/tests/commands/scan.test.ts` (1,334 lines, ~48 format assertions, 0 snapshots). ~5 brittle: two `length === 71` box-width checks (1174, 1197), `/────────/` divider regex (1066) used to locate sections (1079, 1101), `toContain('┌')` (913). The rest are substring `toContain`/regex that survive if labels/glyphs persist.
- `packages/cli/tests/commands/scan-finding-details.test.ts` (160 lines, 8 `toContain`, calls `formatHumanReadable` directly) — couples on 4-space detail indentation.
- `packages/cli/tests/engine/detectors/surfaces.test.ts:1027` — a comment only; tests data shape, not output.

## For AnaPlan

### Structural Analog
The redesigned `formatHumanReadable` in `proof.ts` (delivered by `proof-card-redesign`) is the direct structural analog and the source of the shared module — scan's render should mirror its use of the primitives. The functional analog is scan's own current render (same data-to-card shape, dated idiom).

### Relevant Code Paths
- `packages/cli/src/commands/scan.ts:101-379` — the function to rebuild
- `packages/cli/src/commands/scan.ts:36-43` — duplicate BOX to delete
- `packages/cli/src/engine/types/conventions.ts` — convention data shape (naming/imports/indentation/codePatterns)
- `packages/cli/src/engine/types/patterns.ts` — pattern data shape (errorHandling/validation/testing + evidence)
- `packages/cli/src/engine/types/engineResult.ts:224,227,390` — where conventions/patterns/git live on the result
- `packages/cli/src/utils/render.ts` — the shared module to consume (prerequisite)

### Patterns to Follow
- Keep `formatHumanReadable` pure (string in/out) — directly unit-testable as today.
- Reuse the cyan accent and the module's glyph vocabulary; introduce no new color system.
- Mirror the proof card's section idiom exactly so the two cards are visibly one family.

### Known Gotchas
- Two `formatHumanReadable` symbols exist (scan.ts and proof.ts) — this scope changes ONLY scan's.
- `--json` must stay byte-identical; the human render is the only thing changing.
- Confidence gating is the credibility crux of the Conventions section — under-show, don't over-show.
- The `mixed` naming flag and small commit-format sample sizes are traps for over-confident display.

### Things to Investigate
- The right confidence threshold(s) for the Conventions section — calibrate against real scan output on several repos (e.g. a clean TS repo, a mixed vibe-coded repo, a Python repo) so the gate reads as honest.
- Whether the module needs a confidence/distribution primitive, or existing primitives suffice.
- Whether to surface commit format here or leave it to proof's Commit Hygiene — avoid duplicating the same signal in two surfaces.

## DEPENDENCY

This scope **requires `proof-card-redesign` to land first** — it ships `utils/render.ts` (the shared vocabulary this scope adopts). Sequence: `proof-card-redesign` → `scan-card-redesign`. If scoped/planned in parallel, the module API is the integration contract.
