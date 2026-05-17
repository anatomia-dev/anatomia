# Scope: Unified Staleness Awareness

**Created by:** Ana
**Date:** 2026-05-16

## Intent

The system generates project intelligence (scan.json) and tracks version currency, but has no mechanism to detect when that intelligence is drifting — and even existing notifications (npm updates, version mismatch) can be buried in tool output that the Ana agent may or may not relay. Both problems must be fixed together: adding scan staleness detection without fixing the relay problem means the new notification gets buried the same way existing ones do.

## Complexity Assessment
- **Kind:** fix
- **Size:** medium — 5 files touched, one new utility, one function rename, one template instruction
- **Files affected:**
  - `packages/cli/src/utils/scan-freshness.ts` (new)
  - `packages/cli/src/commands/work.ts` (add field, rename function, integrate)
  - `packages/cli/src/commands/check.ts` (add Freshness row)
  - `packages/cli/templates/.claude/agents/ana.md` (one sentence added to Step 0)
  - `.claude/agents/ana.md` (identical change — dogfood)
- **Blast radius:** The template change affects every customer's Ana session on next `ana init`. The work.ts changes are additive (new field, new notification line, rename of internal function). The check.ts change is a new dashboard row. The utility is new code with no existing consumers.
- **Estimated effort:** 2-3 hours implementation + testing
- **Multi-phase:** no

## Approach

Create a shared scan freshness utility that measures drift via time AND commit distance. Surface it through the existing notification system in `work status` (where all agents already look). Rename the notification function to reflect its expanded role. Add a Freshness row to `setup check` for the dashboard view. Fix the buried notification problem by adding one explicit relay instruction to the Ana agent template.

The combined threshold (>7 days AND >50 commits) ensures proportional detection — solo devs aren't nagged on quiet weeks, active teams aren't nagged before a week regardless of velocity. The time floor prevents false positives. The commit gate prevents nagging on unchanged codebases.

## Acceptance Criteria
- AC1: `ana work status` displays `ℹ Scan is {N} days old ({M} commits since scan). Run: ana init` when scan is >7 days old AND >50 commits behind HEAD
- AC2: When git SHA from scan.json is unresolvable (shallow clone, force-push), the notification falls back to time-only: `ℹ Scan is {N} days old. Run: ana init`
- AC3: Scan staleness notification is suppressed when `CI=true` (same pattern as npm update check)
- AC4: `ana setup check` displays a Freshness section showing scan age or "current" status
- AC5: The Ana agent template (both product and dogfood) includes this exact instruction after the `work status --session` paragraph in Step 0: "If the output includes ℹ notification lines (updates, staleness, version mismatches), include them in your first message verbatim."
- AC6: Product template and dogfood template contain identical content for the modified section
- AC7: `printVersionNotifications` is renamed to `printNotifications` with no behavior change to existing notifications
- AC8: The `scanStale` field appears in both human-readable and JSON output paths of `work status`
- AC9: `checkScanFreshness` returns `null` when `lastScanAt` is missing or unparseable (graceful degradation)
- AC10: No new ana.json fields, no new CLI commands, no schema changes

## Edge Cases & Risks

- **Shallow clones:** `git rev-list --count {sha}..HEAD` fails with exit code 128 if the scan SHA isn't in history. Must catch non-zero exit and fall back to `commitsSinceScan: null`, using time-only for threshold evaluation.
- **Force-pushed repos:** Same failure mode as shallow clones. Same fallback.
- **First init:** `lastScanAt` is set during init. Immediately after init, staleness is 0. Function returns `isStale: false` — no special handling needed.
- **Template blast radius:** One sentence in the template affects every Ana session for every customer. The wording must not cause over-reporting (mentioning absence of notifications) or conflict with existing instructions. The conditional "If the output includes..." correctly handles the zero-notification case.
- **JSON output path:** work.ts line 795-802 manually constructs JSON when no slugs exist. The new `scanStale` field must appear there too, not just in the `StatusOutput` that feeds the human-readable path.
- **CI environments:** Staleness warnings in CI output are noise. Suppress via `process.env['CI'] === 'true'` check inside the freshness function, matching the existing pattern in `spawnUpdateCheck`.
- **Monorepo sub-packages:** Scan is repo-wide, git operations are repo-level. No per-package complexity.

## Rejected Approaches

**Extending `update-check.ts` instead of creating `scan-freshness.ts`:** The update-check module is purely filesystem + network (read ana.json, fetch npm registry, write cache). Scan freshness requires git operations (`git rev-list`). Mixing git operations into a file that currently has none muddies its contract and dependency profile. A separate file creates cleaner separation and becomes the obvious home for Phase 3's ana.json field staleness check.

**Time-only threshold (no commit count):** Produces false positives on inactive projects. A personal project untouched for 14 days has a "stale" scan that is perfectly accurate. The combined threshold catches real drift without nagging.

**Commit-only threshold (no time check):** Misses stale scans on slow-cadence projects. A solo dev at 3 commits/day would never trigger until day 17 — by which point the scan might be meaningfully stale even at low velocity. The 7-day floor ensures a minimum check cadence.

**Configurable threshold in ana.json:** Over-engineered for the problem. The combined threshold works for both customer profiles (sniper at 2-4 eng, shotgun at 5-15 eng). Add config later if users complain. Solve this problem completely, don't build the roadmap.

**Adding relay instructions to ALL agent templates:** Plan, Build, Verify, and Learn read `work status` for routing only — they don't report general project health. They dive straight into their task. Ana is the conversational agent that talks to developers. Notification relay is Ana-only.

**Template wording with justification ("these are important signals the user needs to see"):** Explains *why* to the agent, which is unnecessary — agents follow instructions without justification. The justification language could cause Ana to over-emphasize notifications. Tighter wording: "include them in your first message verbatim."

## Open Questions

None. All questions from the requirements file were resolved during investigation.

## Exploration Findings

### Patterns Discovered
- `printVersionNotifications` (work.ts:620-631): conditional console.log per notification type, all using `chalk.gray` with `ℹ` prefix
- `checkForUpdates` (update-check.ts:182-227): async function, reads ana.json, returns typed result, suppresses in CI via early return
- `setup check` dashboard (check.ts:1420-1432): reads ana.json + scan.json, runs `checkConsistency`, prints section with symbol + label + detail format

### Constraints Discovered
- [TYPE-VERIFIED] StatusOutput interface (work.ts:96-103) — exactly matches requirements documentation
- [TYPE-VERIFIED] UpdateCheckResult interface (update-check.ts:29-32) — `{ updateAvailable, projectMismatch }` only
- [OBSERVED] work.ts does NOT read scan.json today — freshness function must introduce that read for `git.head`
- [OBSERVED] JSON output path (work.ts:795-802) manually constructs object, bypasses StatusOutput — must be updated separately
- [OBSERVED] git rev-list with nonexistent SHA returns exit code 128 — fallback must check exit code, not parse output
- [OBSERVED] CI suppression uses `process.env['CI'] === 'true'` string comparison (not truthy check)

### Test Infrastructure
- `tests/commands/work.test.ts` — tests work status output, will need new tests for scanStale field
- `tests/commands/check.test.ts` — tests setup check sections
- `tests/utils/update-check.test.ts` — tests version comparison utilities, pattern to follow for scan-freshness tests

## For AnaPlan

### Structural Analog
`packages/cli/src/utils/update-check.ts` — same shape: exported interface for the result, pure computation function that reads project state and returns typed data, called by work.ts during status assembly. The new `scan-freshness.ts` follows this exact structure but with git operations instead of npm/filesystem.

### Relevant Code Paths
- `packages/cli/src/commands/work.ts:620-631` — `printVersionNotifications`, the function to rename and extend
- `packages/cli/src/commands/work.ts:845-852` — where `StatusOutput` is assembled, where `scanStale` gets added
- `packages/cli/src/commands/work.ts:795-802` — JSON early-return path that also needs the field
- `packages/cli/src/commands/check.ts:1420-1432` — where Freshness section gets added (after Consistency)
- `packages/cli/src/utils/update-check.ts:182-227` — pattern for the async check function
- `packages/cli/templates/.claude/agents/ana.md:35-36` — insertion point for relay instruction
- `.claude/agents/ana.md:35-36` — identical insertion point in dogfood

### Patterns to Follow
- Notification format: `chalk.gray(\`ℹ {message}. Run: {command}\`)` — match existing lines exactly
- CI suppression: `if (process.env['CI'] === 'true') return;` at function top or as early return
- Error handling: silent catch, return null/fallback — never crash on best-effort checks
- check.ts section format: `chalk.bold('\nSectionName')` + separator + `  ${symbol} ${label}: ${detail}`

### Known Gotchas
- The `readArtifactBranch` call in work.ts already parses ana.json. The freshness function needs `lastScanAt` from ana.json AND `git.head` from scan.json — don't re-read ana.json, accept `lastScanAt` as a parameter or read both in one pass.
- Template files must be byte-identical for the modified section. Copy-paste, don't type twice.
- `runGit` (from `src/utils/git-operations.ts`) returns `{ stdout, stderr, exitCode }` — use it for `rev-list` instead of raw `child_process` to maintain consistency.

### Things to Investigate
- Whether `readArtifactBranch` already returns the full ana.json or just the branch string — determines how to pass `lastScanAt` to the freshness check without re-reading the file.
