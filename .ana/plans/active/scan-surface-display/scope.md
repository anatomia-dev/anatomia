# Scope: Scan Surface Display

**Created by:** Ana
**Date:** 2026-05-22

## Intent

The scan terminal output shows detected surfaces as a flat list: `cli · website (Next.js)`. scan.json already knows each surface's language, framework, and testing framework — but the terminal throws it away. A monorepo customer scanning for the first time sees names, not identity. The scan says "I found these" instead of "I understand these."

Promote surfaces from a single inline label inside the Workspace block to their own section with per-surface intelligence. This is a rendering-only change to one function in one file. The engine, scan.json, init, scaffold generators, and all other consumers are untouched.

## Complexity Assessment
- **Kind:** feature
- **Size:** small
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/scan.ts` — `formatHumanReadable` function, surface rendering block (~30 lines replaced)
- **Blast radius:** Terminal display only. `formatHumanReadable` is a private function called once (scan.ts:423). Not exported, not consumed by init, not consumed by tests directly. Init has its own independent surface display (`state.ts:987-1007`) reading from ana.json, not from this renderer. scaffold-generators reads `result.surfaces` for context scaffolds independently. scan.json output and `--json` flag are unaffected. `--quiet` and `--save` paths are unaffected.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Replace the inline Surfaces line (currently rendered as a sub-item under Workspace) with a standalone section at the same level as Stack and Intelligence. Each surface gets its own line showing its framework (or language if no framework) and primary testing framework. The section renders for any monorepo with detected surfaces and is omitted entirely for single-repo projects.

The Workspace line in the Stack section loses its Surfaces sub-item. It keeps monorepo tool, package count, and primary package — the structural information. Surface identity moves to its own section — the intelligence.

## Acceptance Criteria

- AC1: For monorepos with detected surfaces, the scan terminal output renders a "Surfaces" section between Stack and Intelligence, with a header and divider matching the existing section style.
- AC2: Each surface displays on its own line with: name (left-aligned, padded), framework or language (framework preferred when present, language as fallback), and primary testing framework (first entry from the surface's testing array, omitted when empty).
- AC3: The section displays up to 4 surfaces. When more exist, a `(+N more)` overflow indicator renders below the last surface, matching the existing overflow style.
- AC4: Single-repo projects (empty surfaces array) render no Surfaces section. No empty state, no placeholder.
- AC5: The Surfaces sub-item line is removed from the Workspace block in the Stack section. Workspace continues to show monorepo tool, package count, and primary package.
- AC6: The `--json`, `--save`, `--quiet` code paths are unchanged. Only the `formatHumanReadable` rendering path is modified.
- AC7: Init's `displaySuccessMessage` surface display (state.ts:987-1007) is unchanged and continues to show per-surface test commands independently.

## Edge Cases & Risks

- **1 surface:** A section with one entry feels heavier than the current inline. Accepted tradeoff — consistency matters more than saving one line, and the single entry still shows identity + testing that the inline format loses. Repos affected: formbricks, langfuse, dittofeed, lobe-chat, rally, medusa.
- **Surface with null framework AND null language:** Degrade gracefully — show just the name with no detail after it. This is theoretically possible but doesn't occur in any of the 50 test repos scanned.
- **Surface with no testing:** Show framework/language only, no testing signal. The absence of testing IS the signal — surfaces without tests are visually distinct from those with them.
- **Long surface names:** Names like `nestjs-backend` (14 chars) or `design-system` (13 chars) exist in real repos. Pad the name column dynamically based on the longest name in the displayed set, capped at a reasonable maximum to prevent line overflow.
- **14 surfaces (refine):** Shows 4, overflow says `(+10 more)`. The high count is a detection quality issue (example apps classified as surfaces), not a display issue. Out of scope.
- **Funnel vs installed context:** The `isFunnel` flag doesn't affect surface rendering today and shouldn't affect the new section. Surfaces render the same way in both contexts.

## Rejected Approaches

**File count per surface.** Considered right-aligning `244 files` on each line. Dropped — file count is relative (244 is big in one project, small in another). It adds visual weight without actionable insight. Framework + testing is the identity. File count stays in scan.json for agents.

**Showing all testing frameworks per surface.** Considered showing `Vitest, Playwright, Testing Library`. Dropped — too noisy for a terminal summary. The primary testing framework (first entry) is sufficient signal. Full list is in scan.json.

**Branching convention in Intelligence section.** Considered adding `Branching    feature/ (93% of merges)`. Dropped from this scope — branch pattern detection has a separate data quality issue (measures live remote branches, not merge history convention). Worth fixing but independent. Nobody consumes `branchPatterns` in the terminal today.

**Inline enhanced format for 1-surface case.** Considered keeping 1-surface monorepos inline (`Surfaces     web (Next.js · Vitest)`) and only promoting to a section for 2+. Dropped — inconsistent rendering based on count creates branching logic that doesn't earn its complexity. One format for all cases.

## Open Questions

None. The rendering logic is straightforward and all edge cases are resolved from the 50-repo scan analysis.

## Exploration Findings

### Patterns Discovered
- `scan.ts:206-217`: Current surface rendering — inline under Workspace block, shows `name (framework)` joined by ` · `, caps at 4 with overflow.
- `scan.ts:155-157`: Stack section header pattern — `chalk.bold('  Stack')` + `chalk.gray('  ' + BOX.horizontal.repeat(5))`. Surfaces section should match.
- `scan.ts:291-296`: Intelligence section follows same header pattern with `repeat(12)`.
- `state.ts:987-1007`: Init's independent surface display reads from ana.json config, pads names to 9 chars, shows test commands. Completely separate code path.

### Constraints Discovered
- [TYPE-VERIFIED] `formatHumanReadable` is not exported (scan.ts:101) — private to the module, called once at line 423. No external consumers.
- [TYPE-VERIFIED] No test directly asserts the terminal format of surfaces. A021 test (surfaces.test.ts:592) asserts data shape availability, not rendered output.
- [OBSERVED] `result.surfaces` is typed as `Surface[]` with `name`, `path`, `packageName`, `language`, `framework`, `testing: string[]`, `sourceFiles` fields. All available for rendering.
- [OBSERVED] Across 50 test repos: surface counts range from 0 (single repos) to 14 (refine). Median for monorepos with surfaces is 3. Names range from 3 chars (`api`) to 14 chars (`nestjs-backend`).

### Test Infrastructure
- `tests/commands/scan.test.ts`: Tests scanProject engine results and CLI command via subprocess. No assertions on formatHumanReadable output.
- `tests/engine/detectors/surfaces.test.ts`: 28 contract assertions on surface detection logic. A021 verifies data shape for terminal display.

## For AnaPlan

### Structural Analog
`scan.ts:244-296` — the Intelligence section. Same pattern: conditional section with header + divider, iterates data array, formats each line, handles overflow. The Surfaces section is structurally identical.

### Relevant Code Paths
- `packages/cli/src/commands/scan.ts:101-349` — `formatHumanReadable`, the entire function. Surfaces block at 206-217 is replaced. New section inserts between Stack (ends ~line 218) and Intelligence (starts ~line 244).
- `packages/cli/src/commands/scan.ts:36-43` — BOX constants used for dividers.

### Patterns to Follow
- Section headers use `chalk.bold('  {Name}')` + `chalk.gray('  ' + BOX.horizontal.repeat(N))` where N matches the header text length.
- Data lines use `chalk.gray(label.padEnd(N))` for alignment. Stack uses 12. Intelligence uses 12. Surfaces should auto-detect based on max name length.
- Overflow uses `chalk.dim()` matching existing `(+N more)` pattern at line 184 and 214.

### Known Gotchas
- The Surfaces line at 206-217 is nested inside the `if (result.monorepo.isMonorepo)` block at line 198. The new section must be OUTSIDE this block (after it closes at line 218) but still gated on `result.surfaces.length > 0`. Surfaces are already empty for single repos by detector design, so the guard is sufficient.
- Name padding: using a fixed padEnd risks misalignment when the longest name in the set is much longer or shorter than the pad. Compute max name length from the displayed surfaces (up to the cap) and pad accordingly.

### Things to Investigate
- Whether the divider repeat count for the "Surfaces" header should be 8 (matching text length) or a standard width. Look at Stack (5 for 5-char "Stack") and Intelligence (12 for 12-char "Intelligence") — the pattern is that repeat matches the text length. "Surfaces" = 8.
