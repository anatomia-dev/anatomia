# Scope: Init must surface scan quality and pipeline readiness

**Created by:** Ana
**Date:** 2026-05-09

## Intent
`ana init` tells users what it found but never what it missed. Tree-sitter failures are silently swallowed — the user sees "Analysis complete" with a checkmark and walks away thinking they got a full deep scan when they got surface-tier only. Init also never checks whether the tools needed for the pipeline (`gh`, `git user.name`/`user.email`) are available, leaving users to discover gaps at the worst time — mid-pipeline, after investing real work. The user wants init to be honest about scan quality and upfront about what the pipeline needs.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — new display logic in init, preflight additions, type change for data flow, template update for setup agent
- **Files affected:** `packages/cli/src/commands/init/preflight.ts`, `packages/cli/src/commands/init/state.ts`, `packages/cli/src/commands/init/types.ts`, `packages/cli/src/commands/init/index.ts`, `packages/cli/src/engine/scan-engine.ts`, `packages/cli/templates/.claude/agents/ana-setup.md`
- **Blast radius:** Init terminal output only. No changes to scan logic, asset generation, or pipeline commands. The scan engine's blind spot message changes affect both `ana scan` and `ana init` display (shared data), but `ana scan` already displays blind spots — the enhanced message improves both contexts.
- **Estimated effort:** 3-4 hours
- **Multi-phase:** no

## Approach
Three layers, each addressing a different disease:

**Layer 1 (scan quality):** After the scan completes and before asset generation, display blind spots from `engineResult.blindSpots`. Distinguish three states: full success (checkmark), degraded (warning — tree-sitter failed, surface-tier only), total failure (existing behavior). Enhance the tree-sitter blind spot message in scan-engine.ts to use language-neutral terms describing what was lost. This data already exists — init just needs to show it instead of hiding it.

**Layer 2 (pipeline dependencies):** Add `git user.name`/`user.email` and `gh` checks to init's preflight. These checks must be guarded: skip git-user checks if `hasGit` is false (git not installed) — otherwise the user sees "git not installed" followed by "git user not configured," which is confusing and redundant. Enhance the existing git remote message at preflight.ts line 180-181 with pipeline context — don't add a duplicate check. All checks are warnings, not gates. The `gh` message notes the pipeline works without it (non-GitHub teams shouldn't feel forced). Capture warnings in `PreflightResult` so they can flow to the success message.

**Layer 3 (setup validation):** Add environment validation instructions to the setup agent template. The agent runs `gh --version`, `gh auth status`, `git config user.name`, `git config user.email`, `git remote -v` at the end of setup and reports results. Setup is interactive — the developer can fix issues on the spot.

## Acceptance Criteria
- AC1: When tree-sitter fails during init, the user sees a warning (not a checkmark) with "Deep scan incomplete" and what was lost in language-neutral terms
- AC2: When init completes with no blind spots, the user sees "Deep scan complete — no gaps detected"
- AC3: When init completes with blind spots, each blind spot is displayed with its area, issue, and resolution
- AC4: When `git user.name` or `git user.email` is not configured AND git is installed (`hasGit` is true), init displays a warning with copy-pasteable fix commands. When git is not installed, the git-user check is skipped (the "no git" warning already covers it).
- AC5: When `gh` is not installed, init displays a warning that includes "The pipeline works without it through Build/Verify" so non-GitHub teams know it's optional
- AC6: The existing git remote message at preflight.ts line 180-181 is enhanced with pipeline context and a `git remote add origin` suggestion — no second remote check is added
- AC7: None of the new checks prevent init from completing — all are informational
- AC8: The init success message includes a "Pipeline readiness" section listing any warnings, displayed before "Next:" — only shown if warnings exist
- AC9: `PreflightResult` carries a `warnings` field that flows from preflight through the orchestrator to `displaySuccessMessage`
- AC10: The setup agent template includes environment validation commands at the end of the setup flow — after `setupPhase: "complete"` is written but before the summary is printed. The template explicitly instructs: "Report findings. Do not install software or modify git configuration unless the user explicitly asks."
- AC11: The tree-sitter blind spot message in scan-engine.ts uses language-neutral terms ("code patterns, conventions, and structure analysis") that work for Python, TypeScript, JavaScript, and Go projects
- AC12: Re-running `ana init` (reinit) re-runs all dependency checks with updated results
- AC13: Total analyzer failure ("Analyzer failed — continuing with empty scaffolds") behavior is unchanged

## Edge Cases & Risks
**CI/CD false warnings.** Teams running `ana init` in CI see `gh` and git user warnings that don't matter in that context. AC7 ensures these don't block init. CI logs are already noisy — informational warnings are acceptable. No suppression mechanism needed unless customers request it.

**Tree-sitter WASM resolution failures.** `resolveWasmPath` (treeSitter.ts lines 50-88) tries three strategies. pnpm `.pnpm` store, monorepo hoisting, and `npx` temp directories are all failure modes. This scope improves messaging (R6) but doesn't fix resolution. A separate investigation if customers report persistent WASM failures.

**Non-GitHub teams seeing `gh` warning.** The message explicitly says "The pipeline works without it through Build/Verify." Non-GitHub teams (GitLab, Bitbucket, self-hosted) understand it's optional. They don't install `gh` and that's fine.

**`displaySuccessMessage` data flow.** Currently receives `engineResult`, `projectName`, `scanTime`, `anaConfig` — no preflight results. `PreflightResult` needs a `warnings: string[]` field, and the orchestrator in index.ts needs to pass it through. This is a type change + signature change + threading change. Not complex, but it touches 3 files (types.ts, preflight.ts, index.ts, state.ts) beyond what the display change alone requires.

**Setup agent checks are LLM-executed.** The setup agent runs bash commands and interprets results. Unlike init's mechanical checks, these are best-effort. If the agent misparses `gh auth status` output, the user sees wrong information. Acceptable tradeoff — init's checks (R3) are the reliable layer, setup's checks (R5) are the interactive layer. Both together provide coverage. The template must explicitly say "do not install software" to prevent the agent from running `brew install gh` or similar when it detects a missing tool.

**Blind spot message format.** The enhanced message must fit the existing three-field structure (`area`, `issue`, `resolution`). Multi-line content in the `resolution` field should work but the planner should verify formatting in both `ana scan` and `ana init` display contexts.

## Rejected Approaches
**Capabilities schema in `ana.json`.** Recording environment capabilities (gh installed, git user configured) as fields in `ana.json`. Over-engineered for one or two dependencies. Capabilities go stale (user installs `gh` after init). Preflight checks at init time are simpler and always current.

**`ana doctor` command.** A standalone command to check environment health. Adds a new command for checks that only matter once (during setup). Init and setup already have the user's attention — adding a third touchpoint creates choice paralysis.

**Blocking init on missing dependencies.** Requiring `gh` or git user config before init completes. This would prevent non-GitHub teams from using Anatomia entirely. Init's job is to bootstrap `.ana/` — it should succeed if the filesystem is writable and a project root exists.

**Separate remote check in R3.** Adding a new git remote check alongside the existing one at preflight.ts line 180-181. Creates two warnings for the same condition. Instead: enhance the existing message.

## Open Questions
None for Ana. Open questions for AnaPlan:
- Where exactly should the blind spot display code live — inside `runAnalyzer` (after `displayDetectionSummary`), or in `index.ts` (after `runAnalyzer` returns)? Both work, but the location affects code organization.

### Resolved Questions
- **Degraded state detection:** Use `engineResult.patterns === null && engineResult.overview.depth === 'deep'` — meaning "we asked for deep but got no patterns." This is semantic (checks what matters) and robust (doesn't couple to blind spot strings). `overview.depth` is the requested depth (scan-engine.ts line 942), not the achieved depth, so `depth === 'deep'` with null patterns reliably indicates degradation.
- **`displayDetectionSummary` contradiction:** No fix needed. When tree-sitter fails, `patterns` is null, so the patterns line (line 115-119) is skipped entirely. R2's "Deep scan incomplete" message won't be contradicted by a "(deep scan)" label.

## Exploration Findings

### Patterns Discovered
- `runAnalyzer` (state.ts lines 58-82): returns `EngineResult | null`. Calls `spinner.succeed('Analysis complete')` at line 67 regardless of degradation. `displayDetectionSummary` at line 68 shows what was found but never what was missed.
- `displayDetectionSummary` (state.ts lines 91-135): shows stack, files, git, patterns, services. Patterns line (119) shows "5 detected (deep scan)" even when tree-sitter failed and patterns came from surface-tier only. Misleading.
- Existing preflight git validation (preflight.ts lines 156-190): four-state check (no git, commits but no remote, empty git, validation failed). The "commits but no remote" state at line 180-181 already detects missing remotes with an informational message. R3 enhances this message, doesn't duplicate it.
- `PreflightResult` type (types.ts): `{ canProceed: boolean; initState: string; anaExisted: boolean }`. No warnings field. R7 requires adding one.

### Constraints Discovered
- [TYPE-VERIFIED] `displaySuccessMessage` signature (state.ts line 571): receives `engineResult`, `projectName`, `scanTime`, `anaConfig`. Does NOT receive preflight results. R7's data flow requires extending this.
- [TYPE-VERIFIED] `validateInitPreconditions` return type is `PreflightResult` (types.ts lines 27-33). Warnings are `console.log`'d inline and not captured. R3 must capture them.
- [TYPE-VERIFIED] Blind spots are `EngineResult['blindSpots']` — array of `{ area: string; issue: string; resolution: string }`. Available on `engineResult` after `runAnalyzer` returns.
- [CORRECTED] `ana scan` does NOT display blind spots. It only counts them in `countFindings()` (scan.ts line 91). There is no existing blind spot rendering pattern. R1 must design the display from scratch, following `displayDetectionSummary`'s chalk style for consistency.
- [OBSERVED] The setup agent template (`ana-setup.md`) has 8 steps (Steps 0-8). Step 8 is "Completion" — writes `setupPhase` to `"complete"` and prints summary. R5's environment checks would go before Step 8's completion write, or as a sub-step within Step 8.

### Test Infrastructure
- Init tests are in `tests/commands/init.test.ts`. They test preflight checks, asset generation, and success message output. New tests would verify: blind spot display appears in terminal output, preflight warnings appear in success message, degraded scan gets a warning not a checkmark.
- Preflight tests verify the four git states. New tests would verify: git user.name missing produces a warning, `gh` not found produces a warning, warnings flow to success message.

## For AnaPlan

### Structural Analog
`displayDetectionSummary` (state.ts lines 91-135) — the existing function that shows what the scan found. R1's blind spot display is the mirror: show what the scan missed. Same location (after scan, before assets), same formatting style (chalk-colored terminal output), same data source (engineResult). Note: this is a formatting analog only — there is no existing blind spot rendering code to copy. The display must be written from scratch.

### Relevant Code Paths
- `packages/cli/src/commands/init/state.ts` line 58 — `runAnalyzer` function (R1, R2: display goes here or after this returns)
- `packages/cli/src/commands/init/state.ts` line 67 — `spinner.succeed('Analysis complete')` (R2: change to context-dependent message)
- `packages/cli/src/commands/init/state.ts` line 91 — `displayDetectionSummary` (R1: blind spot display follows this pattern)
- `packages/cli/src/commands/init/state.ts` line 571 — `displaySuccessMessage` (R7: add pipeline readiness section)
- `packages/cli/src/commands/init/preflight.ts` line 176-181 — existing git remote check (R3: enhance message)
- `packages/cli/src/commands/init/preflight.ts` line 190 — end of git validation block (R3: git user check goes after)
- `packages/cli/src/commands/init/types.ts` lines 27-33 — `PreflightResult` type (R7: add warnings field)
- `packages/cli/src/commands/init/index.ts` line 82 — preflight call (R7: capture warnings)
- `packages/cli/src/commands/init/index.ts` line 135 — displaySuccessMessage call (R7: pass warnings)
- `packages/cli/src/engine/scan-engine.ts` lines 898-903 — analyzer blind spot (R6: enhance message)
- `packages/cli/templates/.claude/agents/ana-setup.md` — setup agent template (R5: add environment checks)

### Patterns to Follow
- state.ts lines 91-135 for the display pattern (chalk-colored, conditional sections)
- preflight.ts lines 159-168 for the warning pattern (chalk.yellow, informational text, copy-pasteable commands)
- preflight.ts line 180-181 for the existing remote message style

### Known Gotchas
- When tree-sitter fails, `patterns` is null and `displayDetectionSummary` line 115 skips the patterns line entirely. No contradiction with R2's "Deep scan incomplete" message. No fix needed for the detection summary in the common case.
- The `gh` check uses `spawnSync('gh', ['--version'])`. On Windows without WSL, the binary might be `gh.exe`. `spawnSync` handles this — Windows resolves the executable name. But test coverage should include a mock for `gh` not found.
- The setup agent template is already ~640 lines. R5 adds environment check instructions. Keep them concise — the template is a prompt, not documentation.

### Things to Investigate
- Determine whether the blind spot display goes inside `runAnalyzer` (after `displayDetectionSummary` at line 68) or in `index.ts` (after line 101). Inside `runAnalyzer` is self-contained but couples display to analysis. In `index.ts` is separated but requires inspecting `engineResult.blindSpots` in the orchestrator.
- Determine how to detect the "degraded" state: `engineResult.blindSpots.some(b => b.area === 'Analyzer')` or `engineResult.patterns === null`. The latter is more semantic.
- `ana scan` does not render blind spots — it only counts them. R6's enhanced message affects `scan.json` content (read by agents) but has no display impact in `ana scan`. Verify the enhanced resolution string doesn't break any consumers that parse `scan.json` blind spot fields.
