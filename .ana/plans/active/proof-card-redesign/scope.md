# Scope: Proof card visual redesign on a shared render vocabulary

**Created by:** Ana
**Date:** 2026-06-08

## Intent

Make `ana proof <slug>` *pop*. The proof card is the product's signature artifact — the receipt that proves an AI-built feature was scoped, planned, built, and independently verified, with per-agent turns/tokens/cost computed deterministically and committed to git. Nobody else can produce this data. But the **presentation is dated**: bold labels over dashed-underline rules, flat one-line-per-item lists, a hard `... and N more` truncation, every assertion listed (46 green lines for a large feature), and a Provenance cost that looks like bad math because the cache tokens that justify it are captured but never shown.

This is a **presentation-only** redesign — no schema change, no new captured data — that rebuilds the card to read like the modern tools engineers actually screenshot (vitest, cargo-nextest, ruff, the Charm ecosystem). It is also the surface the planned "Receipts" demo screenshots, so polishing it de-risks distribution.

Crucially: the styling is rebuilt on a **small, modular terminal-render vocabulary** so that `ana scan` and `ana proof health` — which today each carry their own duplicated box/section logic — can adopt the same primitives next, cheaply. Proof card is wired now; the module is built for the others.

In the user's words: "make the proof output pretty, we can do much better... I really want this to pop... make it modular like build a tiny shared render vocabulary, making scan + health easy to adopt it later. make it pretty and have taste."

## Complexity Assessment

- **Kind:** feature
- **Size:** medium
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/utils/render.ts` — NEW shared render vocabulary (the modular primitives)
  - `packages/cli/src/commands/proof.ts` — `formatHumanReadable` (proof card) rebuilt on the module; `getStatusIcon`, `formatTokenCount`, `BOX`, `SEVERITY_ORDER` likely move into / are consumed from the module; `formatHealthDisplay` adopts the shared header primitive only (no body redesign)
  - `packages/cli/tests/utils/render.test.ts` — NEW unit tests for the primitives (keeps test count rising)
  - `packages/cli/tests/commands/proof.test.ts` — update format assertions broken by the redesign
  - `packages/cli/tests/utils/proofSummary.test.ts` — `formatHumanReadable` phase-breakdown assertions
  - `packages/cli/tests/commands/commit-hygiene.test.ts` — commit-hygiene render assertions
  - (health) `packages/cli/tests/commands/proof.test.ts` health-display assertions if the shared header primitive shifts any spacing
- **Blast radius:** Contained to the `proof` command's human render path, one new util, and their tests. The `--json` path, the proof-chain schema, `forensics.ts`, and `pricing.ts` are untouched. `scan.ts` has its *own* `formatHumanReadable` and is NOT modified in this scope (it is the next adopter). Risk concentration is **test churn**, not runtime behavior.
- **Estimated effort:** ~1.5–2.5 days. The card rewrite and module are ~1 day; the bulk is updating format assertions across three large test files (proof.test.ts is 5,465 lines, 307 format assertions — most are substring `toContain` and survive; a minority assert exact severity-tag / spacing formats and must change).
- **Multi-phase:** no

## Approach

Extract a small, well-typed **terminal-render vocabulary** and rebuild the proof card on top of it. The vocabulary encodes the patterns that separate modern CLI output from dated output (validated against clig.dev, Evil Martians, and the actual output of vitest / cargo-nextest / ruff / lipgloss):

- **One ceremonial box, then inset rules.** A single rounded header box carries the verdict + headline numbers (PASS · feature · duration · total cost). Every internal section is an **inset horizontal rule with an inline roll-up** (`── Contract ──────── 44/44 ✓`, `── Findings ──── 1 debt · 4 obs`) — resize-safe, no corner math, summarized before you read it. This replaces the bold-label-over-dashed-underline pattern everywhere.
- **Collapse the routine, expand the exceptional.** Passing assertions become one counted line; UNSATISFIED/DEVIATED always render in full with their detail. Findings/Build Concerns lead with a severity roll-up and show the top items by severity; the overflow line is **actionable** (points to `ana proof <slug> --json`, which already carries the full set) rather than a dead `... and N more`.
- **Provenance as the one aligned stat grid.** Right-aligned numeric columns (turns, tools, tokens, cost), k/M-suffixed tokens, a `TOTAL` row under a rule, completeness on one line. **Surface the already-captured cache tokens** (`in / out / cache`) so each session's cost reconciles to a skeptic — the single most important credibility fix, and it is pure presentation (the fields exist in `ProvenanceCounts.tokens`).
- **Palette discipline.** One accent color (keep the current cyan for continuity) + grayscale for everything else, with **dim/faint** doing the hierarchy work; semantic color (green/red/yellow) reserved exclusively for status, and **every colored element paired with a glyph or word** so it survives `NO_COLOR`, non-TTY pipes, and colorblindness. No layout may depend on color width.

The module is the foundation; the proof card is the first and only consumer wired in this scope. Scan and health adopt it next as separate work — this scope must leave the primitives general enough that adoption is obvious, not a rewrite. This is the "elegant solution removes" principle applied: today three surfaces duplicate box/section/icon logic; this introduces the one place they will converge on.

## Acceptance Criteria

- AC1: A new shared render module (`utils/render.ts`) exports typed, unit-tested primitives covering: header box, inset section rule with optional right-aligned roll-up, right-aligned key/value block, borderless aligned stat grid, ASCII-degradable proportion bar, and semantic status glyph. Each primitive has dedicated tests.
- AC2: `formatHumanReadable` in `proof.ts` renders the card using only the shared primitives — no inline box-drawing literals or ad-hoc section-header/underline construction remain in the function.
- AC3: Every card section header is an inset rule; Contract and Findings/Build Concerns rules carry an inline roll-up (Contract: satisfied ratio; Findings/Concerns: counts by severity).
- AC4: Passing assertions collapse to a single counted line; assertions with status UNSATISFIED or DEVIATED always render individually with their `says` text (and deviation detail where present). No card lists every passing assertion.
- AC5: Findings and Build Concerns lead with a severity roll-up and cap the detailed list; any overflow line names an actionable next step (`--json` for the full set), never a bare "and N more".
- AC6: The Provenance block renders as an aligned grid that includes input, output, AND cache tokens per session; the per-session and TOTAL cost are present with the price-table version; a `TOTAL` row is visually separated by a rule; completeness renders on one line.
- AC7: Card output stays within 80 columns and uses only single-width glyphs; alignment is preserved for long model ids, ≥6 sessions (rejection cycles), counts-unavailable sessions, unpriced models, and Codex sessions (`cache_create = 0`).
- AC8: Color is one accent + grayscale + semantic-status-only; every colored element is paired with a glyph/word; the full card is legible and correctly aligned with `NO_COLOR=1` and when piped to a non-TTY (no layout depends on ANSI).
- AC9: `ana proof <slug> --json` output is byte-identical to before this change (presentation-only; no data/schema change).
- AC10: All existing proof, proofSummary, commit-hygiene, and health tests pass (updated where the visible format changed); total test count does not decrease; new `render.test.ts` adds coverage for the primitives.

## Edge Cases & Risks

- **NO_COLOR / non-TTY / pipe:** chalk auto-strips ANSI when not a TTY or when `NO_COLOR` is set — verify nothing in the layout (padding, bar widths, alignment) depends on color escape presence.
- **Narrow terminals (<80 cols):** inset rules and the stat grid must degrade gracefully (truncate the rule, never shear the grid). Plan to decide: hard-assume 80, or read `process.stdout.columns` with an 80 floor.
- **Entries without a `process` block:** 192 of 193 current entries have no Provenance — the card must look complete and intentional without that section.
- **Provenance variability:** ≥6 sessions from rejection cycles; `derived` omitted (counts-unavailable rows); unpriced models render `n/a` not `$0.00`; Codex sessions have `cache_create = 0` and only `cache_read`.
- **Long / suffixed model ids** (`claude-opus-4-8[1m]`) must not break column alignment.
- **Single-phase vs multi-phase timing** (`timing.segments`) — both render paths preserved.
- **DEVIATED assertions** currently render in a separate Deviations section; folding collapse logic must not lose deviation detail.
- **Older findings without severity/suggested_action** — fallback rendering path.
- **Wide block-glyph bars** (`█░`) render wider than ASCII in some fonts — keep proportion bars OUT of any column that must align, and provide an ASCII fallback.
- **Commit Hygiene** section retained.
- **Shared header primitive touches health:** `formatHealthDisplay` reuses the same box dimensions; if the primitive shifts spacing, health output (and its tests) shift. Mitigation: the header primitive reproduces current dimensions by default so health stays visually stable unless explicitly restyled (out of scope here).
- **Test brittleness:** exact-format assertions (e.g. the health `A005` double-space/right-border check, severity-tag `[risk · promote]` substrings) will break by design — these are updates, not deletions; the test-count-must-not-decrease constraint holds.

## Rejected Approaches

- **Charm/lipgloss-style bordered tables for every section** — rejected. Boxes shear on resize, miscount wide glyphs, fight copy-paste, and clutter when nested. clig.dev's rule: if everything is boxed, the box means nothing. One box max.
- **Adopt an external TUI library (Ink / blessed / a lipgloss port)** — rejected. Heavy dependency for static, pipe-friendly output; 22 files already render with chalk; conflicts with the NO_COLOR/non-TTY simplicity. The vocabulary is a thin chalk layer, not a framework.
- **Redesign scan + health in the same change** — rejected. Bigger blast radius delays the flagship surface. The module makes later adoption cheap; doing it now is scaffolding the roadmap instead of building the foundation.
- **Add new captured data (cost trends, per-cycle deltas)** — rejected. Out of scope; this is presentation-only. The cache tokens that fix the cost-credibility hole are *already captured* — surfacing them is rendering, not new data.
- **Add a `--verbose` flag to expand collapsed lists** — rejected for now. `--json` already exposes the complete dataset; the overflow hint points there. Avoid new command surface in a presentation change.

## Open Questions

- Module name/location: `utils/render.ts` (lean) vs `utils/terminal.ts` vs `utils/card.ts`. Plan to choose; `render.ts` is the working assumption.
- Does `formatHealthDisplay` adopt the shared **header** primitive in this scope (recommended: yes, header only — it already duplicates the box) or stay entirely untouched until the health redesign?
- Min-width strategy: hard 80-col assumption vs `process.stdout.columns` with an 80 floor.
- Accent color: keep cyan (recommended, continuity) vs switch to magenta.

## Exploration Findings

### Patterns Discovered
- `packages/cli/src/commands/proof.ts:264-525` — `formatHumanReadable`: the current card. Header box via `BOX` constant (`chalk.cyan`, width 71), sections as `chalk.bold('  Label')` + `chalk.gray('  ' + '─'.repeat(n))`, flat list bodies, `MAX_DISPLAY = 5` with `... and N more`, Provenance block at 436-507 (per-session line, totals, churn, completeness).
- `packages/cli/src/commands/proof.ts:132-139` — `BOX` constant (square corners `┌┐└┘`). Redesign may switch the header to rounded `╭╮╰╯`.
- `packages/cli/src/commands/proof.ts:229-256` — `getStatusIcon` (semantic glyph+color) and `formatTokenCount` (`48.2k`/`1.4M`) — reusable primitives to lift into the module.
- `packages/cli/src/commands/proof.ts:537+` — `formatHealthDisplay` reuses the exact box dimensions ("same dimensions as formatHumanReadable") — the duplication the shared module removes.
- `packages/cli/src/commands/scan.ts` — has its OWN `formatHumanReadable` (the scan render); the next adopter of the module. Confirms the consistency problem is real and cross-command.

### Constraints Discovered
- [TYPE-VERIFIED] `ProvenanceCounts.tokens` = `{ input, output, cache_create, cache_read }` (`utils/forensics.ts:45,418`). Cache tokens are captured for Claude; Codex sets `cache_create = 0`, `cache_read` from `cached_input_tokens` (`forensics.ts:504-538`). The cache column is real data, currently unrendered.
- [TYPE-VERIFIED] `ProcessAttestation` (`types/proof.ts:64-114`): `sessions[]` (per role/attempt, ordered), `module_churn`, `completeness {complete, expected, present, gaps}`, `outcome`, `task_shape`. `SessionProvenance.derived` is optional (counts-unavailable rows must render).
- [OBSERVED] Cost is recomputed at display time via `computeCost(tokens, model)` from `data/pricing.ts` (versioned). Never stored. Unpriced model → `n/a`, never `$0.00`.
- [OBSERVED] chalk auto-handles `NO_COLOR` / non-TTY (chalk v5). Prior art for color/TTY handling in `commands/_capture.ts`, `commands/init/state.ts`. No existing shared render/style util except `utils/displayNames.ts`.
- [OBSERVED] Project constraint: test count must not decrease (CI across 3 OS × 2 Node). Format-assertion updates are rewrites, not removals.

### Test Infrastructure
- `packages/cli/tests/commands/proof.test.ts` (5,465 lines, 307 format assertions; mostly `toContain` substring — many survive if section labels/tokens are preserved).
- `packages/cli/tests/utils/proofSummary.test.ts:2360+` — `formatHumanReadable` phase-breakdown tests.
- `packages/cli/tests/commands/commit-hygiene.test.ts:364+` — commit-hygiene render tests.
- Tests invoke `formatHumanReadable(entry)` directly (pure function returning a string) — easy to unit-test the redesign and the new primitives in isolation.

## For AnaPlan

### Structural Analog
`packages/cli/src/commands/scan.ts`'s own `formatHumanReadable` is the closest structural match — a sibling command that renders a human "card" from structured data and has parallel tests (`tests/commands/scan-finding-details.test.ts`). It is BOTH the structural analog to follow AND the intended next adopter of the shared module; design the primitives so scan's renderer could be expressed in them without contortion. The functional analog is `formatHealthDisplay` in the same file (same box, same section idiom, different payload).

### Relevant Code Paths
- `packages/cli/src/commands/proof.ts:264-525` — the card to rebuild
- `packages/cli/src/commands/proof.ts:436-507` — Provenance block (cache-column change lives here)
- `packages/cli/src/commands/proof.ts:128-256` — `BOX`, `getStatusIcon`, `formatTokenCount` (lift into module)
- `packages/cli/src/utils/forensics.ts:45-66,415-540` — token/cost shapes (read-only; do not modify)
- `packages/cli/src/data/pricing.ts` — `computeCost` (read-only consumer)
- `packages/cli/src/types/proof.ts:21-114` — `SessionProvenance` / `ProcessAttestation` shapes

### Patterns to Follow
- Keep render functions pure (string in/out) like the current `formatHumanReadable` — testable, no I/O.
- Reuse the cyan accent and existing glyph vocabulary; do not introduce a new color system.
- Match the project's chalk-based approach (no new rendering dependency).

### Known Gotchas
- Two different `formatHumanReadable` symbols exist (proof.ts and scan.ts) — only the proof.ts one changes here. Don't cross the streams.
- `formatHealthDisplay` shares header dimensions — keep the shared header primitive dimensionally back-compatible so health (and its tests) don't drift unintentionally.
- Many tests assert on exact severity-tag text (`[risk · promote]`) and exact spacing — decide the new finding-line format deliberately and update those assertions in lockstep.
- Proportion bars use wide block glyphs; never place them inside an alignment-critical column.

### Things to Investigate
- Whether to read `process.stdout.columns` for responsive width or hard-assume 80 (and how scan/health will want the same answer).
- The cleanest module API surface so scan/health adoption is a wiring exercise, not a redesign — i.e. what the *right* set of primitives is (this is the taste decision; the worked redesign in the thinking session is the reference target).
- Whether `getStatusIcon`/`formatTokenCount` belong in the module or stay local and are imported by it.
