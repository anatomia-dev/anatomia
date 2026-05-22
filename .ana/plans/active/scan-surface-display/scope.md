# Scope: Scan Surface Display

**Created by:** Ana
**Date:** 2026-05-22

## Intent

Two scan improvements that make the output more accurate and more informative.

**Surfaces.** The scan terminal output shows detected surfaces as a flat list: `cli · website (Next.js)`. scan.json already knows each surface's language, framework, and testing framework — but the terminal throws it away. A monorepo customer scanning for the first time sees names, not identity. The scan says "I found these" instead of "I understand these." Promote surfaces from a single inline label inside the Workspace block to their own section with per-surface intelligence.

**Branch pattern detection.** `detectBranchPatterns` in git.ts measures currently existing remote branches to determine the primary prefix. Branches are ephemeral — they exist during active work and get deleted after merge. On the Anatomia repo: 3 `fix/` branches and 2 `feature/` branches are in flight right now, so the scan reports `fix/` as primary. But the merge history shows 48 of the last 50 merges used `feature/`. The scan is reporting the weather, not the climate. Fix the data source to read merge commit history on the default branch, falling back to current behavior when no merge history is available (shallow clones).

## Complexity Assessment
- **Kind:** feature
- **Size:** small
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/scan.ts` — `formatHumanReadable` function, surface rendering block (~30 lines replaced)
  - `packages/cli/src/engine/detectors/git.ts` — `detectBranchPatterns` function (~30 lines replaced)
- **Blast radius:** Surfaces change is terminal display only. `formatHumanReadable` is a private function called once (scan.ts:423). Not exported, not consumed by init, not consumed by tests directly. Init has its own independent surface display (`state.ts:987-1007`) reading from ana.json, not from this renderer. scaffold-generators reads `result.surfaces` for context scaffolds independently. scan.json `--json` and `--save` paths are unaffected. Branch pattern change affects scan.json `git.branchPatterns` data values — same type shape, better data source. No consumer reads `branchPatterns` outside of scan.json serialization: init hardcodes `branchPrefix: 'feature/'` (state.ts:562), scaffold-generators doesn't reference it, no command reads it. The only downstream consumers are agents reading scan.json.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

**Surfaces.** Replace the inline Surfaces line (currently rendered as a sub-item under Workspace) with a standalone section at the same level as Stack and Intelligence. Each surface gets its own line showing its framework (or language if no framework) and primary testing framework. The section renders for any monorepo with detected surfaces and is omitted entirely for single-repo projects. The Workspace line in the Stack section loses its Surfaces sub-item. It keeps monorepo tool, package count, and primary package — the structural information. Surface identity moves to its own section — the intelligence.

**Branch patterns.** Replace the data source in `detectBranchPatterns` from live remote branches (`git branch -r`) to merge commit history on the default branch. Extract branch names from merge commit subjects (the `Merge pull request #N from org/prefix/slug` or `Merge branch 'prefix/slug'` patterns). Count prefix frequency from those. Fall back to the current approach (remote branches) when no merge history is available — this covers shallow clones, repos with no merges, and repos with no remote. Same return type, same field shape in scan.json.

## Acceptance Criteria

- AC1: For monorepos with detected surfaces, the scan terminal output renders a "Surfaces" section between Stack and Intelligence, with a header and divider matching the existing section style.
- AC2: Each surface displays on its own line with: name (left-aligned, padded), framework or language (framework preferred when present, language as fallback), and primary testing framework (first entry from the surface's testing array, omitted when empty).
- AC3: The section displays up to 4 surfaces. When more exist, a `(+N more)` overflow indicator renders below the last surface, matching the existing overflow style.
- AC4: Single-repo projects (empty surfaces array) render no Surfaces section. No empty state, no placeholder.
- AC5: The Surfaces sub-item line is removed from the Workspace block in the Stack section. Workspace continues to show monorepo tool, package count, and primary package.
- AC6: The `--json`, `--save`, `--quiet` code paths are unchanged. Only the `formatHumanReadable` rendering path is modified.
- AC7: Init's `displaySuccessMessage` surface display (state.ts:987-1007) is unchanged and continues to show per-surface test commands independently.
- AC8: `detectBranchPatterns` reads merge commit messages on the default branch to determine prefix frequency and primary prefix.
- AC9: The return type of `detectBranchPatterns` is unchanged: `{ prefixes: Record<string, number>; primary: string | null }`.
- AC10: When no merge commits exist (shallow clones, repos with no merges), `detectBranchPatterns` falls back to the current behavior of reading remote branches.
- AC11: Bot branch prefixes (dependabot/, renovate/, etc.) are excluded from merge-based detection, consistent with the existing `isBotBranch` filter.
- AC12: On the Anatomia repo, the fix produces `primary: 'feature/'` (matching the 96% merge history) instead of the current incorrect `primary: 'fix/'`.

## Edge Cases & Risks

- **1 surface:** A section with one entry feels heavier than the current inline. Accepted tradeoff — consistency matters more than saving one line, and the single entry still shows identity + testing that the inline format loses. Repos affected: formbricks, langfuse, dittofeed, lobe-chat, rally, medusa.
- **Surface with null framework AND null language:** Degrade gracefully — show just the name with no detail after it. This is theoretically possible but doesn't occur in any of the 50 test repos scanned.
- **Surface with no testing:** Show framework/language only, no testing signal. The absence of testing IS the signal — surfaces without tests are visually distinct from those with them.
- **Long surface names:** Names like `nestjs-backend` (14 chars) or `design-system` (13 chars) exist in real repos. Pad the name column dynamically based on the longest name in the displayed set, capped at a reasonable maximum to prevent line overflow.
- **14 surfaces (refine):** Shows 4, overflow says `(+10 more)`. The high count is a detection quality issue (example apps classified as surfaces), not a display issue. Out of scope.
- **Funnel vs installed context:** The `isFunnel` flag doesn't affect surface rendering today and shouldn't affect the new section. Surfaces render the same way in both contexts.
- **Shallow clones (branch detection):** All 70 test repos are `--depth 1` clones. They have zero merge history and only `origin/main` as a remote branch. `detectBranchPatterns` already returns `{ prefixes: {}, primary: null }` for these. The fallback preserves this behavior — no regression.
- **Non-standard merge formats (branch detection):** Not all repos use GitHub's `Merge pull request #N from org/branch` format. Some use `Merge branch 'name'`, some squash-merge (no merge commits at all). The implementation should handle both common patterns and degrade to `primary: null` when merge subjects don't contain recognizable branch names.
- **Repos with no default branch or no remote:** `detectBranchPatterns` already receives `cwd` and can call `detectDefaultBranch` (same file). If no default branch is found, skip merge-based detection and fall back to remote branches.

## Rejected Approaches

**File count per surface.** Considered right-aligning `244 files` on each line. Dropped — file count is relative (244 is big in one project, small in another). It adds visual weight without actionable insight. Framework + testing is the identity. File count stays in scan.json for agents.

**Showing all testing frameworks per surface.** Considered showing `Vitest, Playwright, Testing Library`. Dropped — too noisy for a terminal summary. The primary testing framework (first entry) is sufficient signal. Full list is in scan.json.

**Branching convention in Intelligence section.** Considered adding a `Branching    feature/ (93% of merges)` line to the terminal output. Dropped — branching convention is team workflow information, not "what's your project" identity. The data quality fix in scan.json is sufficient. Agents reading scan.json get better data; the terminal doesn't need to surface it.

**Inline enhanced format for 1-surface case.** Considered keeping 1-surface monorepos inline (`Surfaces     web (Next.js · Vitest)`) and only promoting to a section for 2+. Dropped — inconsistent rendering based on count creates branching logic that doesn't earn its complexity. One format for all cases.

## Open Questions

None. The surface rendering is straightforward, and the branch detection fix has a clear data source change with well-understood fallback behavior. All edge cases are resolved from the 50-repo scan analysis and merge history verification on the Anatomia repo.

## Exploration Findings

### Patterns Discovered
- `scan.ts:206-217`: Current surface rendering — inline under Workspace block, shows `name (framework)` joined by ` · `, caps at 4 with overflow.
- `scan.ts:155-157`: Stack section header pattern — `chalk.bold('  Stack')` + `chalk.gray('  ' + BOX.horizontal.repeat(5))`. Surfaces section should match.
- `scan.ts:291-296`: Intelligence section follows same header pattern with `repeat(12)`.
- `state.ts:987-1007`: Init's independent surface display reads from ana.json config, pads names to 9 chars, shows test commands. Completely separate code path.
- `git.ts:183-211`: Current `detectBranchPatterns` — reads `git branch -r`, strips `origin/`, filters bot branches, extracts prefixes, counts. Primary = most frequent.
- `git.ts:246-268`: `detectMergeStrategy` — reads `git log --merges --oneline -20 {defaultBranch}`. Precedent for reading merge commits in the same file.
- `git.ts:98-114`: `isBotBranch` — existing bot filter. Must be applied to branch names extracted from merge subjects too.

### Constraints Discovered
- [TYPE-VERIFIED] `formatHumanReadable` is not exported (scan.ts:101) — private to the module, called once at line 423. No external consumers.
- [TYPE-VERIFIED] No test directly asserts the terminal format of surfaces. A021 test (surfaces.test.ts:592) asserts data shape availability, not rendered output.
- [TYPE-VERIFIED] `branchPatterns` is consumed only by scan.json serialization. Grep across `packages/cli/src/commands/` and `packages/cli/src/utils/` returns zero hits. Init hardcodes `branchPrefix: 'feature/'` at state.ts:562.
- [OBSERVED] `result.surfaces` is typed as `Surface[]` with `name`, `path`, `packageName`, `language`, `framework`, `testing: string[]`, `sourceFiles` fields. All available for rendering.
- [OBSERVED] Across 50 test repos: surface counts range from 0 (single repos) to 14 (refine). Median for monorepos with surfaces is 3. Names range from 3 chars (`api`) to 14 chars (`nestjs-backend`).
- [OBSERVED] Anatomia merge history: 48/50 recent merges use `feature/`, 2 use `fix/`. Current detection reports `fix/` as primary (wrong). GitHub merge format: `Merge pull request #N from anatomia-dev/feature/slug`.
- [OBSERVED] All 70 test repos are shallow clones (depth 1). Zero merge history, one remote branch each. `detectBranchPatterns` returns `{ prefixes: {}, primary: null }` for all of them.

### Test Infrastructure
- `tests/commands/scan.test.ts`: Tests scanProject engine results and CLI command via subprocess. No assertions on formatHumanReadable output.
- `tests/engine/detectors/surfaces.test.ts`: 28 contract assertions on surface detection logic. A021 verifies data shape for terminal display.
- `tests/engine/detectors/git-detection.test.ts` and `git-workflow.test.ts`: Test git detection including `branchPatterns`. These tests will need updating to reflect the new merge-based data source.

## For AnaPlan

### Structural Analog
`scan.ts:244-296` — the Intelligence section. Same pattern: conditional section with header + divider, iterates data array, formats each line, handles overflow. The Surfaces section is structurally identical. For branch detection: `git.ts:161-178` — `detectCommitFormat`. Same pattern: reads N recent commits via `git log`, parses subjects, counts matches, computes confidence. The merge-based branch detection mirrors this approach.

### Relevant Code Paths
- `packages/cli/src/commands/scan.ts:101-349` — `formatHumanReadable`, the entire function. Surfaces block at 206-217 is replaced. New section inserts between Stack (ends ~line 218) and Intelligence (starts ~line 244).
- `packages/cli/src/commands/scan.ts:36-43` — BOX constants used for dividers.
- `packages/cli/src/engine/detectors/git.ts:183-211` — `detectBranchPatterns`, the function being replaced. Reads `git branch -r`.
- `packages/cli/src/engine/detectors/git.ts:246-268` — `detectMergeStrategy`, the structural analog for merge-based detection.
- `packages/cli/src/engine/detectors/git.ts:98-114` — `isBotBranch`, reused for filtering bot branches from merge subjects.

### Patterns to Follow
- Section headers use `chalk.bold('  {Name}')` + `chalk.gray('  ' + BOX.horizontal.repeat(N))` where N matches the header text length.
- Data lines use `chalk.gray(label.padEnd(N))` for alignment. Stack uses 12. Intelligence uses 12. Surfaces should auto-detect based on max name length.
- Overflow uses `chalk.dim()` matching existing `(+N more)` pattern at line 184 and 214.
- Git detection functions use `gitExec()` helper (git.ts:54-60) for all git commands. Branch detection should use the same helper.

### Known Gotchas
- The Surfaces line at 206-217 is nested inside the `if (result.monorepo.isMonorepo)` block at line 198. The new section must be OUTSIDE this block (after it closes at line 218) but still gated on `result.surfaces.length > 0`. Surfaces are already empty for single repos by detector design, so the guard is sufficient.
- Name padding: using a fixed padEnd risks misalignment when the longest name in the set is much longer or shorter than the pad. Compute max name length from the displayed surfaces (up to the cap) and pad accordingly.
- GitHub merge subjects use `Merge pull request #N from org/prefix/slug`. The branch name is the last path component after `from org/`. Must strip the org prefix to get the actual branch name. Other formats: `Merge branch 'prefix/slug'` (git CLI merge), `Merge branch 'prefix/slug' into main`. The regex must handle both.
- `detectBranchPatterns` currently takes only `cwd`. To read merge history on the default branch, it needs the default branch name. The caller (`detectGitInfo` at line 431) already has `defaultBranch` in scope. Either pass it as a parameter or call `detectDefaultBranch` internally.

### Things to Investigate
- Whether the divider repeat count for the "Surfaces" header should be 8 (matching text length) or a standard width. Look at Stack (5 for 5-char "Stack") and Intelligence (12 for 12-char "Intelligence") — the pattern is that repeat matches the text length. "Surfaces" = 8.
- The exact merge subject regex patterns across different git hosting platforms. GitHub is well-understood. GitLab uses `Merge branch 'name' into 'target'`. Bitbucket varies. The implementation should cover GitHub and generic git patterns, degrading to fallback for unrecognized formats.
