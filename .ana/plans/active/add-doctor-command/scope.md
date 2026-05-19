# Scope: ana doctor — unified project health diagnostic

**Created by:** Ana
**Date:** 2026-05-19

## Intent

There is no single command that answers "is my Anatomia installation healthy?" The health data exists — scan freshness, context maturity, skill enrichment, proof chain trajectory, CLI version, stale work items — but it's scattered across `setup check`, `work status`, `proof health`, and `update-check.ts`. Nobody runs all four. A customer who just finished init has no way to know what's healthy, what's next, and what needs attention.

`ana doctor` is the one command that reads all of these sources, assembles a unified view, and tells the user exactly what to do. It's an assembly command — every data source already exists as tested, exported functions. Doctor orchestrates and formats; it builds nothing new.

## Complexity Assessment

- **Kind:** feature
- **Size:** medium
- **Files affected:**
  - `packages/cli/src/commands/doctor.ts` (new — the command, ~200-300 LoC)
  - `packages/cli/src/index.ts` (register command in GETTING STARTED group)
  - `packages/cli/tests/commands/doctor.test.ts` (new)
  - `website/scripts/extract-docs-data.ts` (add `Doctor` to `funcToFile` map so the prebuild extraction picks up the new command)
  - `website/content/docs/guides/troubleshooting.mdx` (add TroubleCard for "How do I know if my installation is healthy?", update "Version mismatch warning" card to mention `ana doctor`)
  - `website/content/docs/start.mdx` (add `ana doctor` as a post-init verification step in Step 2, update Updating section to mention `ana doctor`)
  - `README.md` (add `ana doctor` to Quick Start section and to the Commands table under "Scan and init")
- **Blast radius:** Low. Doctor reads from existing modules but doesn't modify them. The structural changes are: command registration in index.ts, a one-entry map addition in extract-docs-data.ts (the prebuild script that auto-generates commands.json, search index, and llms.txt from CLI source), two small edits to the troubleshooting guide, and a one-line addition to the README Quick Start.
- **Estimated effort:** 1-2 days
- **Multi-phase:** no

## Approach

Create a new `ana doctor` command that orchestrates existing data sources into a unified health dashboard. Six visible status lines organized into five diagnostic dimensions, with output density calibrated to project maturity.

The command reads, never writes. It imports from `update-check.ts`, `scan-freshness.ts`, `check.ts`, `proofSummary.ts`, and `work.ts` — calling their existing exported functions directly. No health-checking logic is reimplemented.

Doctor lives in its own `doctor.ts` file (not in proofSummary.ts, which is already at 2330 lines and flagged by the proof chain as past comfort threshold).

Output density adapts to maturity: a project with zero proof chain entries and a scan from minutes ago gets a compact welcome view. A project with 50+ entries and stale dimensions gets the full diagnostic dashboard. The maturity detection is explicit, not emergent.

### Output Design

Six visible status lines under five dimensions. Context and Skills are siblings under one conceptual heading ("Setup maturity") but render as two separate lines — they answer different questions ("does the AI know your project?" vs "does the AI know your conventions?") and have different fixes.

**Symbols:** ✓ (green, healthy), ○ (yellow, note/opportunity), ✗ (red, needs action)

**Compact view** (new project, zero proof runs, scan <1 day old):
```
ana doctor

  ✓ CLI v1.1.1 (current)
  ✓ Scan fresh (today, deep)
  ○ Context — scaffold (run: claude --agent ana-setup)
  ○ Skills — scaffold defaults
  ○ Proof chain — no pipeline runs yet

Everything's set up. Next: claude --agent ana-setup
```

**After setup, before first pipeline run:**
```
ana doctor

  ✓ CLI v1.1.1 (current)
  ✓ Scan fresh (today, deep)
  ✓ Context — 6/6 sections populated
  ✓ Skills — 5 of 5 enriched
  ○ Proof chain — no pipeline runs yet

Ready for your first pipeline run. Next: claude --agent ana
```

**Established project (10+ runs):**
```
ana doctor

  ✓ CLI v1.1.1 (current)
  ✓ Scan fresh (2d ago, 8 commits)
  ✓ Context — 6/6 sections populated
  ✓ Skills — 5 of 5 enriched
  ✓ Proof chain — 10 runs, 3 active findings, improving

All healthy.
```

**Problems detected (stale scan, outdated CLI, stalled work):**
```
ana doctor

  ✗ CLI v1.1.1 → v1.3.0 available
    Run: npm update -g anatomia-cli
  ✗ Scan stale (23d, 87 commits since scan)
    Run: ana init
  ✓ Context — 6/6 sections populated
  ○ Skills — 3 of 5 enriched (deployment, ai-patterns still scaffold)
  ✓ Proof chain — 42 runs, 8 active findings (2 risk), stable

  ⚠ fix-auth-timeout: stalled 14d at ready-for-plan

2 issues found. Fix the ✗ items above.
```

### Maturity Detection

First-time vs returning is determined by concrete signals, not heuristics:
- **New project:** scan age < 1 day AND proof chain entries == 0
- **Early project:** proof chain entries > 0 AND entries < 10
- **Established project:** proof chain entries >= 10

New projects get the compact welcome view with a "Next:" CTA. Early and established projects get the full dashboard. The threshold is explicit in a constant, not buried in conditionals.

### Dimension Details

**1. CLI Version** (red/green only)
- Calls `checkForUpdates()` from `update-check.ts`
- Green: current version matches latest (or no cache yet — first run gets green, background check populates for next time)
- Red: newer version available on npm
- Also checks project version mismatch (ana.json anaVersion vs installed CLI)

**2. Scan Freshness** (red/green/yellow)
- Calls `checkScanFreshness()` from `scan-freshness.ts`
- Green: not stale (within 7d/50-commit thresholds)
- Red: stale (both thresholds exceeded)
- Also reports scan depth (deep vs surface-only) and commits-since-scan when available
- Yellow: surface-only scan (could benefit from deep scan)

**3. Context Quality** (red/green/yellow)
- Calls `checkContextForDashboard()` from `check.ts` for project-context.md
- Also calls `countPopulatedContextSections()` for section-level detail
- Checks `setupPhase` from ana.json (or `readSetupProgress()` from check.ts) to detect interrupted setups
- Green: all sections populated beyond scaffold
- Yellow with setup-aware messaging:
  - If `setupPhase` is an intermediate value (e.g., "guided"): `○ Context — setup in progress (resume: claude --agent ana-setup)`
  - If `setupPhase` is "complete" but sections are still scaffold-quality: `○ Context — scaffold (setup completed but sections thin)`
  - If no `setupPhase` (setup never started): `○ Context — scaffold (run: claude --agent ana-setup)`
- Red: missing sections or file not found

**4. Skill Enrichment** (green/yellow)
- Calls `checkSkill()` from `check.ts` for each discovered skill
- Enriched means the Rules section has content beyond the template default. Detected is machine-populated by init — every skill has Detected after init, so Detected alone does NOT indicate enrichment. Uses `countEntriesInSection(content, 'Rules')` from check.ts to count Rules entries. A skill with 3 Detected lines but zero non-template Rules lines is scaffold, not enriched.
- Green: all skills have Rules entries beyond template defaults
- Yellow: N of M enriched, names the scaffold-default ones
- Never red — scaffold skills aren't broken, they're just not enriched yet

**5. Proof Chain** (green/yellow)
- Calls `computeChainHealth()` from `proofSummary.ts`
- Zero runs: yellow with "no pipeline runs yet" (not an error)
- Has runs: shows count, active finding count, risk count if > 0, trend if sufficient data
- Green: runs exist, no worsening trend
- Yellow: zero runs, or worsening trend, or risk findings present

**Stale work items** (bonus line, not a dimension)
- Reads active work directories from `.ana/plans/active/`
- For each, determines the last activity timestamp. **Critical:** `.saves.json` has a two-domain split — Think/Plan timestamps live on the artifact branch, Build/Verify timestamps live in the worktree's copy (see saves-json-system reference doc). For staleness detection, doctor should use the artifact branch's `.saves.json` timestamps (scope/contract `saved_at`) for pre-build stages, and worktree existence + git log for build/verify stages. Alternatively, delegate to `determineStage()` from work.ts which already handles this complexity, and compute staleness from the stage + the most recent artifact-branch timestamp.
- Surfaces items stalled > 14 days at any stage
- Rendered as ⚠ lines after the five dimensions

### --json Output

Structured envelope following the `proof` command pattern:
```json
{
  "command": "doctor",
  "timestamp": "...",
  "results": {
    "maturity": "new" | "early" | "established",
    "dimensions": {
      "cli_version": { "status": "pass" | "warn" | "fail", "current": "1.1.1", "latest": "1.3.0" | null, "project_version": "1.1.1" | null },
      "scan_freshness": { "status": "pass" | "warn" | "fail", "days_since_scan": 2, "commits_since_scan": 8 | null, "depth": "deep" | "surface" },
      "context": { "status": "pass" | "warn" | "fail", "sections_populated": 6, "sections_total": 6, "setup_state": "not_started" | "in_progress" | "complete" },
      "skills": { "status": "pass" | "warn", "enriched": 5, "total": 5, "scaffold_defaults": [] },
      "proof_chain": { "status": "pass" | "warn", "runs": 42, "active_findings": 8, "risk_findings": 2, "trend": "stable" }
    },
    "stale_work": [{ "slug": "fix-auth-timeout", "stage": "ready-for-plan", "stalled_days": 14 }],
    "overall": "pass" | "fail"
  }
}
```

### Exit Codes
- **0:** No red (✗) items. Yellow (○) and stale work don't affect exit code.
- **1:** At least one red (✗) item.

## Acceptance Criteria

- AC1: `ana doctor` with no flags prints a human-readable dashboard with one status line per dimension (6 lines: CLI, scan, context, skills, proof, plus optional stale work lines)
- AC2: `ana doctor --json` prints structured JSON matching the envelope schema above
- AC3: Exit code is 0 when no ✗ items exist, 1 when any ✗ exists. Yellow (○) does not affect exit code.
- AC4: A project with zero proof chain entries and scan age < 1 day shows the compact welcome view with a "Next:" CTA
- AC5: A project with 10+ proof chain entries shows the full diagnostic dashboard without the welcome CTA
- AC6: Doctor calls existing functions from update-check.ts, scan-freshness.ts, check.ts, and proofSummary.ts — no health-checking logic is reimplemented in doctor.ts
- AC7: Running `ana doctor` in a directory without `.ana/` prints "No Anatomia installation found. Run: ana init" and exits 1
- AC8: Each ✗ line includes an actionable fix command (e.g., "Run: npm update -g anatomia-cli", "Run: ana init")
- AC9: Skills dimension names which skills are still scaffold-default when not all are enriched
- AC10: Stale work items (>14 days at any stage) appear as ⚠ lines after the five dimensions
- AC11: `website/scripts/extract-docs-data.ts` `funcToFile` map includes `Doctor: 'src/commands/doctor.ts'` so the prebuild extraction auto-generates the correct commands.json entry, search index entry, and llms.txt reference — no manual data file edits needed
- AC12: `README.md` Quick Start section includes `ana doctor` as the "check your installation" step after `ana init commit`, and the Commands table has a `ana doctor` row under "Scan and init"
- AC13: `website/content/docs/guides/troubleshooting.mdx` has a new TroubleCard "How do I know if my installation is healthy?" that directs users to `ana doctor`, and the existing "Version mismatch warning" card mentions `ana doctor` alongside `ana work status`
- AC14: `website/content/docs/start.mdx` mentions `ana doctor` as a verification step after init (Step 2), and the Updating section references `ana doctor` for version/health checking
- AC15: Running `ana doctor` from inside a worktree prints "Run from the main project directory, not from a worktree." and exits 1 — same guard pattern as init, setup complete, and work complete

## Edge Cases & Risks

- **No .ana/ directory:** Doctor should detect this early and print a single helpful message, not crash.
- **Partial .ana/ (corrupted init):** Missing ana.json, missing scan.json, missing context/ — each should degrade gracefully to a ✗ or ○ for that dimension, not crash the whole command.
- **npm cache not populated yet:** First run of doctor can't know the latest npm version. Show green (no data = no known issue). The background spawn will populate the cache for next time. This matches existing `work status` behavior.
- **CI environment:** `checkScanFreshness()` and `spawnUpdateCheck()` are already suppressed in CI. Doctor should still work in CI via `--json` for automated checks — scan freshness falls back to time-only, CLI version shows current without npm comparison.
- **No git repo:** Some dimensions (scan freshness commit count) won't have data. Degrade to time-only, same as existing `checkScanFreshness()` behavior.
- **Massive proof chain (100+ entries):** `computeChainHealth()` iterates all entries. This is already tested at scale in `proof health`. No additional risk.
- **Concurrent agent runs:** Doctor is read-only. No git operations, no file writes. Safe to run concurrently with anything.
- **Running from a worktree:** The worktree's `.ana/` has different content (Build/Verify artifacts, different `.saves.json`). `findProjectRoot()` inside a worktree returns the worktree root. Doctor would show misleading results. Guard with `isWorktreeDirectory()` from `worktree.ts` — same 3-line pattern used by init, setup complete, and work complete.
- **proofSummary.ts at 2330 lines:** Doctor MUST NOT add code to this file. Doctor is its own module that imports from it.

## Rejected Approaches

**8 dimensions (pipeline readiness, agent health as separate checks):** The prompt originally specified 8 diagnostic dimensions including pipeline readiness (gh installed, git configured, remote present) and agent health (agent files exist, modified from templates). These were cut because they're init-time concerns, not ongoing health. If init succeeded, these are fine. Checking them again on every doctor run surfaces green checkmarks that nobody acts on — "checks a box" per the design principles. Agent template drift is intentional customization, not illness.

**Collapsing skills into context as one line:** Skills and context answer different questions with different fixes. A customer with 6/6 context sections but scaffold-default skills needs to see both statuses. They're siblings under the "setup maturity" concept but render as two visible lines.

**Adding doctor logic to proofSummary.ts:** That file is at 2330 lines with active proof chain findings about its size. Doctor is its own command module that imports what it needs.

**Subcommands (`ana doctor --scan`, `ana doctor --skills`):** Over-engineering. One command, one view. If a user wants detail on skills, they run `ana setup check`. Doctor is the overview; other commands are the detail.

**Making proof chain zero-entries red:** A new project hasn't failed — it hasn't started. Zero entries is yellow (informational), not red (broken). New users should feel welcomed, not diagnosed.

## Open Questions

None — all resolved during scoping.

## Exploration Findings

### Patterns Discovered

- `check.ts`: Exports `checkSkill()`, `checkContextForDashboard()`, `countPopulatedContextSections()`, `checkSkillSections()`, `countEntriesInSection()`, `readSetupProgress()` — all async, all return structured results. The dashboard rendering in check.ts uses ✓/○/✗ symbols via chalk, same pattern doctor should follow.
- `proofSummary.ts`: Exports `computeChainHealth()` returning `ChainHealth` with runs, findings (active/closed/promoted/total, by_severity, by_action). Also exports `computeHealthReport()` for deeper analysis (trajectory, hot modules, promotion candidates).
- `update-check.ts`: Exports `checkForUpdates()` returning `UpdateCheckResult` with `updateAvailable` and `projectMismatch` — both nullable.
- `scan-freshness.ts`: Exports `checkScanFreshness()` returning `ScanFreshnessResult` with `isStale`, `daysSinceScan`, `commitsSinceScan`.
- `work.ts` `printNotifications()`: Internal function (not exported) that renders the notification lines in work status. Doctor should read the same data sources, not call this function.

### Constraints Discovered

- [TYPE-VERIFIED] proofSummary file size (proofSummary.ts:1-2349) — 2330+ lines, proof chain flagged as "past comfort threshold, growing." Doctor must be its own module.
- [TYPE-VERIFIED] checkScanFreshness CI suppression (scan-freshness.ts:45) — returns null when `CI=true`. Doctor must handle this gracefully.
- [TYPE-VERIFIED] checkForUpdates npm cache (update-check.ts:208-210) — spawns background check when cache is missing. First doctor run may have no npm data.
- [OBSERVED] check.ts uses async fs operations (fs/promises) while scan-freshness.ts and update-check.ts use sync fs. Doctor's action handler must be async.
- [OBSERVED] Commander commandsGroup() sets heading for all subsequent registrations. Doctor must be registered after `registerSetupCommand` and before the PIPELINE group boundary.

### Test Infrastructure

- `tests/commands/` contains test files per command (check.test.ts, agents.test.ts, etc.)
- Tests use `createTestProject` helper from `tests/helpers/test-project.ts` for fixture setup
- Vitest with `--run` flag to avoid watch mode

## For AnaPlan

### Structural Analog

`packages/cli/src/commands/proof.ts` — specifically the `health` subcommand action handler. It reads proof_chain.json, calls `computeHealthReport()`, formats a multi-section terminal dashboard, and supports `--json`. Doctor follows the same orchestrate-and-format pattern across more data sources.

### Documentation Surface

**Auto-generated (cascades from CLI source code):**
- `website/data/docs/commands.json` — auto-generated by `website/scripts/extract-docs-data.ts` prebuild script. The script reads `index.ts` to find `commandsGroup()` calls, then reads each command file via a `funcToFile` map (line 448-459). Doctor needs one entry added to that map: `Doctor: 'src/commands/doctor.ts'`. The extraction script parses Commander chains (`.description()`, `.option()`, `.argument()`) and builds the JSON automatically. Once in the map, doctor flows into commands.json, search-index.json, public/llms.txt, and public/llms-full.txt with zero additional work.
- The `funcToFile` map currently has 10 entries (Scan through Agents). It does NOT auto-discover — new commands must be added explicitly. The script also has a hard-coded validation: it expects specific totals for agents (6), skills (8), context files (4). Commands don't have a hard-coded count so doctor won't break the validation.

**Manual edits:**
- `README.md` — Two locations: (1) Quick Start section (lines ~58-65) — add `ana doctor` after `ana init commit` as the "check your installation" step. (2) Commands table under "Scan and init" (lines ~154-161) — add a row: `ana doctor | Check project health and configuration. --json for CI`.
- `website/content/docs/start.mdx` — The primary onboarding path for strangers. Two locations: (1) After Step 2 (Initialize), add a note that users can run `ana doctor` to verify their installation is healthy before entering the pipeline. This is where a stranger naturally wants confirmation that init worked. (2) The "Updating" section (line ~101) currently says "`ana work status` will tell you when your project was initialized with an older version" — update to mention `ana doctor` as the primary health check after updates.
- `website/content/docs/guides/troubleshooting.mdx` — Two changes: (1) New TroubleCard under "Getting through the gate" section for "How do I know if my installation is healthy?" pointing to `ana doctor`. This is the natural first question after init. (2) Update the existing "Version mismatch warning" card under "Configuration and state" to mention `ana doctor` as the primary diagnostic, alongside `ana work status`.

**Not needed:**
- No dedicated guide page for doctor. It's a single command, not a concept. The auto-generated CLI reference entry plus the mentions in start.mdx and troubleshooting.mdx are sufficient.
- No changes to concept pages (pipeline.mdx, context.mdx, toolbelt.mdx, etc.). Doctor doesn't introduce new concepts. Toolbelt.mdx covers agent-facing CLI commands; doctor is human-facing only.
- No changes to other guide pages (using-ana-setup.mdx, using-ana-learn.mdx, etc.). These are agent workflow guides; doctor is a standalone diagnostic.

### Relevant Code Paths

- `packages/cli/src/commands/check.ts` — `checkSkill()`, `checkContextForDashboard()`, `countPopulatedContextSections()`, `discoverSkills()` (private — may need to export or duplicate the 5-line glob), `readSetupProgress()`
- `packages/cli/src/utils/proofSummary.ts` — `computeChainHealth()`, `computeHealthReport()`
- `packages/cli/src/utils/update-check.ts` — `checkForUpdates()`
- `packages/cli/src/utils/scan-freshness.ts` — `checkScanFreshness()`
- `packages/cli/src/commands/init/state.ts` — `getCliVersion()`
- `packages/cli/src/utils/validators.ts` — `findProjectRoot()`
- `packages/cli/src/utils/worktree.ts` — `isWorktreeDirectory()` for the worktree guard
- `packages/cli/src/index.ts` — command registration, `commandsGroup('GETTING STARTED')` block
- `website/scripts/extract-docs-data.ts` — `funcToFile` map (line 448-459), `extractCommands()` function, `buildCommandTree()` parser. The extraction script reads the actual CLI source to auto-generate commands.json. Doctor needs one map entry added.
- `website/content/docs/guides/troubleshooting.mdx` — existing TroubleCards using `<TroubleCard title="...">` component. Doctor adds one new card and edits one existing card.
- `website/content/docs/start.mdx` — the Quickstart guide. Step 2 (Initialize) and Updating section both reference `ana work status` for pipeline state. Doctor is the better command for "is my installation healthy?" post-init and post-update.
- `README.md` — Quick Start (lines ~58-65) and Commands table (lines ~152-205). Both need a doctor entry.

### Patterns to Follow

- `packages/cli/src/commands/proof.ts` — JSON envelope pattern (`wrapJsonResponse`), chalk symbol rendering, exit code semantics
- `packages/cli/src/commands/check.ts` — ✓/○/✗ symbol pattern, async data loading, structured result types
- `packages/cli/src/commands/agents.ts` — compact command structure (single file, clear sections)

### Known Gotchas

- `discoverSkills()` in check.ts is not exported. Doctor needs skill discovery. Either export it or replicate the 5-line readdir+filter. Exporting is cleaner.
- `printNotifications()` in work.ts is not exported and tightly coupled to the work status output format. Doctor should NOT try to call it — it should call the same upstream functions (`checkForUpdates`, `checkScanFreshness`) directly.
- `checkContextForDashboard()` returns chalk-formatted strings with color codes. For `--json` output, doctor needs the raw status, not the formatted string. Plan should investigate whether to call the underlying check functions directly for JSON mode or strip chalk from the result.
- ana.json is read by multiple check functions independently. Doctor should read it once and pass it down to avoid redundant I/O.
- The `readScanJson()` function in check.ts is private. Doctor needs scan depth (deep vs surface). Plan should determine whether to export `readScanJson` or read scan.json directly (it's a simple JSON.parse).
- The `funcToFile` map in `extract-docs-data.ts` (line 448-459) is NOT auto-discovered — each command registration function name must be mapped explicitly to its source file. The map key is the PascalCase name from `register{Name}Command`. For doctor: `Doctor: 'src/commands/doctor.ts'`. Missing this entry means the command exists in the CLI but is invisible in AnaDocs, the search index, and llms.txt.
- The `buildCommandTree()` parser relies on Commander method chains (`.description()`, `.option()`, `.argument()`) following specific regex patterns. Doctor's Commander setup must follow the same patterns as existing commands for the extraction to work. Unusual patterns (multiline template strings for descriptions, etc.) can cause the parser to miss data.
- `.saves.json` has a two-domain split (see `anatomia_reference/TEAM_DOCS/COMPLICATED_CONCEPTS/saves-json-system.md`). Think/Plan timestamps and scope/contract save metadata live on the artifact branch. Build/Verify timestamps, build-report/verify-report metadata, modules_touched, and commit_hygiene live in the worktree's copy (feature branch). Doctor's stale work detection cannot simply read the artifact branch `.saves.json` and get a complete picture — for work items in build/verify stages, the most recent timestamps are in the worktree, accessible only via `git show` on the feature branch or by checking worktree existence. Plan should investigate whether to reuse `determineStage()` from work.ts (which already handles this via `readFileOnBranch`) or take a simpler approach using the artifact-branch timestamps as a lower bound on activity.

### Things to Investigate

- Whether `discoverSkills()` should be exported from check.ts or whether a simpler skill discovery belongs in a shared utility. This is a design judgment about where skill enumeration lives long-term.
- The right level of proof chain detail for the proof dimension. `computeChainHealth()` gives counts; `computeHealthReport()` gives trajectory and hot modules. Doctor probably needs `computeHealthReport()` for the trend indicator but shouldn't render hot modules — decide the right function to call.
- The right approach for stale work item detection given the two-domain `.saves.json` split. Options: (a) reuse `determineStage()` which already handles `readFileOnBranch` for worktree data, then compute staleness from the stage and the latest artifact-branch timestamp; (b) use a simpler heuristic — artifact-branch timestamps give a lower bound on activity, worktree existence means build is in progress. The simpler approach may be sufficient since doctor's goal is "stalled > 14 days" not "exactly when was the last activity."
