# Scope: Pipeline Concurrency Guards

**Created by:** Ana
**Date:** 2026-05-15

## Intent

Prevent concurrent pipeline sessions from corrupting each other. Learn Session 5 uncovered a real failure: two AnaVerify sessions ran against the same scope simultaneously. Session #2 archived a valid verify report, created a duplicate PR, force-pushed over the merged branch, and left `work complete` unable to detect the merge. Recovery required git internals knowledge our target customer doesn't have. The pipeline assumes one agent per stage but enforces nothing — this scope adds mechanical enforcement.

## Complexity Assessment
- **Kind:** fix
- **Size:** medium — three guards across two files, new `--force` flag on `work start`, new stage values in `determineStage`, new gh check in `createPr`, reordered merge detection in `completeWork`
- **Files affected:** `packages/cli/src/commands/work.ts`, `packages/cli/src/commands/pr.ts`, `packages/cli/tests/commands/work.test.ts`, `packages/cli/tests/commands/pr.test.ts`
- **Blast radius:** Medium. `determineStage` runs on every `ana work status`. `startWork` runs on every agent session entry. `createPr` runs once per pipeline cycle. `completeWork` runs once per merge. All are hot paths but the changes are additive guards — existing behavior is unchanged when no concurrency is detected.
- **Estimated effort:** 3-4 hours
- **Multi-phase:** no

## Approach

Three guards, one shared theme: the pipeline now enforces mutual exclusion mechanically instead of trusting agents to coordinate.

**Guard 1 — In-progress stage detection:** Add active blocking in `startWork` and passive display in `determineStage` for verify-in-progress and plan-in-progress. The guard reads timestamps from `.saves.json` and blocks a second session if the timestamp is recent (within 1 hour). A `--force` flag on `ana work start` overrides the guard for crash recovery.

Critical implementation detail: `verify_started_at` is written to the worktree filesystem but never committed. `determineStage` reads via `readFileOnBranch` (git show) which only sees committed content. The guard must read the worktree's `.saves.json` directly from the filesystem, following the precedent of `worktreeExists()` at line 384. `plan_started_at` IS committed and can be read via the existing `readFileOnBranch` path.

Second critical detail: `verify_started_at` must be written with `force: true` (overwrite), not write-once. Write-once creates stale timestamps in FAIL-to-re-verify cycles (the old timestamp persists because the re-verify path never resets it) and in multi-phase scopes (phase 1's timestamp blocks phase 2). The only consumers are the new guard and the timing computation — both want the latest timestamp.

**Guard 2 — PR duplicate detection:** Before creating a PR in `createPr`, check `gh pr list --head {branch} --state all`. If any PR is MERGED, block with a message directing to `work complete`. If any PR is OPEN, block with its URL. This catches the exact failure mode: session #2 creating PR #141 after session #1's PR #140 was already merged.

**Guard 3 — Merge detection resilience:** In `completeWork`, reorder the merge check. Currently: `is-ancestor` first, `gh pr view` second. Both failed in the incident — `is-ancestor` fails after rebase, `gh pr view` found the wrong PR. New order: `gh pr list --head {branch} --state merged` first (if ANY merged PR exists, it's merged — full stop), `is-ancestor` second (offline fallback), remote-deleted-after-prune third (unchanged).

## Acceptance Criteria
- AC1: `ana work start {slug}` blocks with an error when `verify_started_at` exists in the worktree's `.saves.json` and is less than 1 hour old
- AC2: `ana work start {slug}` blocks with an error when `plan_started_at` exists in the artifact branch's `.saves.json` and is less than 1 hour old
- AC3: `ana work start {slug} --force` overrides both AC1 and AC2 guards
- AC4: `ana work status` displays `verify-in-progress` when verify guard conditions are met (worktree exists, `verify_started_at` recent, no verify report)
- AC5: `ana work status` displays `plan-in-progress` when plan guard conditions are met (`plan_started_at` recent, no spec/contract)
- AC6: `ana pr create` refuses to create a PR when a MERGED PR already exists for the branch, with a message directing to `work complete`
- AC7: `ana pr create` refuses to create a PR when an OPEN PR already exists for the branch, displaying the existing PR URL
- AC8: `ana work complete` detects a merged PR via `gh pr list --state merged` even when `is-ancestor` fails (squash merge, rebase, force-push scenarios)
- AC9: `ana work complete` falls back to `is-ancestor` when `gh` is unavailable
- AC10: `verify_started_at` is written with `force: true` so FAIL-to-re-verify cycles and multi-phase transitions get fresh timestamps
- AC11: The 1-hour timeout auto-expires stale timestamps from crashed sessions without requiring `--force`
- AC12: `getNextAction` returns appropriate guidance for `verify-in-progress` and `plan-in-progress` stages (e.g., "Verify session in progress. Use --force to override.")

## Edge Cases & Risks

**Stale timestamp from crashed session:** A crashed verify session leaves `verify_started_at` on the worktree filesystem. The 1-hour timeout auto-recovers. The `--force` flag provides immediate override. Risk: if the timeout is too short, a slow verify on a large test suite could be interrupted. 1 hour is 2-6x the typical verify duration (5-30 min).

**TOCTOU race:** Between reading `verify_started_at` and writing it, another session could pass the same check. The window is microseconds (synchronous read-check-write). For this to fire, two terminals must run `ana work start` within 1-5 seconds. Theoretical, not practical. Not worth a lockfile.

**Multi-phase phase 2+ verify:** The inside-worktree resume path (line 1778) can't distinguish "all phases done" from "phase N done, phase N+1 pending." It sees phase 1's PASS verify report and returns early without writing `verify_started_at`. Phase 2+ verify gets no guard. This is a known gap — the root cause is coarse phase detection in `startWork`'s resume path, which is a separate scope. The guard protects the common case (single-phase and phase 1).

**FAIL-to-re-verify:** After FAIL, fix, and rebuild, `startWork` from the worktree sees the old FAIL verify report and routes to the Fix path. It writes `build_started_at`, not `verify_started_at`. The re-verify session gets no guard. Same root cause as multi-phase: `startWork` can't distinguish phases that `determineStage` can (via saved_at comparison). Known gap, separate scope.

**`gh` unavailable for Guard 2:** The PR duplicate check runs after the existing `gh --version` check (line 194). If gh is unavailable, PR creation already fails at that check. No additional handling needed.

**`gh` unavailable for Guard 3:** If `gh pr list --state merged` fails or gh is unavailable, fall back to `is-ancestor` (current behavior). The reordering improves the happy path; the fallback preserves the unhappy path.

**Worktree exists but `.saves.json` missing or corrupted:** Guard reads with try-catch. If `.saves.json` doesn't exist or can't parse, the guard passes (no timestamp to check). This is correct — no timestamp means no session started.

**`--force` and `plan_started_at` write-once:** Plan uses write-once (no force) for `plan_started_at`. When `--force` is used to bypass the plan guard, the old timestamp persists. This is fine — the guard checks recency, not existence. The old timestamp will be > 1 hour old (that's why the user is forcing), so even without resetting it, the guard won't re-fire. If it's < 1 hour old, the user explicitly forced — they know what they're doing.

**`verify_started_at` force-write and timing:** `proofSummary.ts` uses `verify_started_at` for single-phase timing computation (line 1853). Force-writing means the timestamp reflects the last verify session's start, not the first. For FAIL-to-re-verify, this is more accurate — timing should measure the successful verify. For multi-phase, timing uses per-phase artifact metadata, not `verify_started_at`. No impact.

## Rejected Approaches

**Lockfile with O_EXCL:** Atomic file creation would close the TOCTOU race entirely. But lockfiles from crashed sessions need cleanup (stale lockfile detection, timeout, manual removal). The timestamp approach reuses existing infrastructure (`.saves.json`, `writeTimestamp`) and auto-expires via timeout. The TOCTOU window is impractical to hit. Lockfile adds complexity for a theoretical benefit.

**PID-based session detection:** Write the Claude process PID alongside `verify_started_at`, then check if the PID is still alive. More precise than a timeout — a crashed session is detected immediately instead of waiting 1 hour. But `getClaudePid` already has reliability issues across environments (line 2163-2186). Platform-dependent process checking (kill -0 on Unix, tasklist on Windows) adds fragile code. The timeout is simpler and sufficient.

**Guard in agent definitions (instructions) instead of CLI code:** Tell agents "check work status before starting" and "don't create duplicate PRs." Faster to ship (edit a markdown file), but violates "verified over trusted." An agent can ignore instructions. The CLI can't be ignored. Mechanical enforcement is the right choice.

**Separate scopes for prevention (Guard 1) vs recovery (Guards 2+3):** Three pipeline runs for 50-80 lines of code. The overhead exceeds the implementation. All three guards respond to the same incident and share the "concurrent session" theme. One scope, independently testable ACs.

**Artifact save session identity check:** Have `ana artifact save` refuse to archive when a different session already saved the artifact (using the `verify_agent` field as a session identifier). Guard 1 prevents the second session from reaching artifact save. If it somehow gets past Guard 1, the archive preserves the original as `_r1` — annoying but not destructive. Over-engineering for a scenario the upstream guard already blocks.

## Open Questions

None — all investigable items resolved during scoping.

## Exploration Findings

### `.saves.json` Write Path Map

Every write, where it lands, and whether it's committed:

| Mechanism | Key | Location | Committed? | Force? |
|-----------|-----|----------|-----------|--------|
| `writeTimestamp` (line 1881) | `work_started_at` | artifact branch | Yes (1882) | no |
| `writeTimestamp` (line 1919) | `plan_started_at` | artifact branch | Yes (1920) | no |
| `writeTimestamp` (line 1801) | `verify_started_at` | worktree filesystem | No | no (change to yes) |
| `writeTimestamp` (line 1935) | `verify_started_at` | worktree filesystem | No | no (change to yes) |
| `writeTimestamp` (line 1804) | `build_started_at` | worktree filesystem | No | no |
| `writeTimestamp` (line 2008) | `build_started_at` | worktree filesystem | No | no |
| `writeTimestamp` (line 2095) | `build_started_at` | worktree filesystem | No | no |
| `writeTimestamp` (line 1797) | `build_started_at` | worktree filesystem | No | yes |
| `writeTimestamp` (line 1968) | `build_started_at` | worktree filesystem | No | yes |
| `writeSaveMetadata` (artifact.ts:47) | `{artifactType}` | wherever save runs | Yes (staged+committed) | n/a |
| `runPreCheckAndStore` (artifact.ts:131) | `pre-check` | slug dir (worktree) | Yes (staged) | n/a |
| `captureModulesTouched` (artifact.ts:175) | `modules_touched` | slug dir (worktree) | Yes (staged) | n/a |
| `runCommitHygieneChecks` (artifact.ts:238) | `commit_hygiene` | slug dir (worktree) | Yes (staged) | n/a |

The split is intentional: timestamp writes to the worktree avoid dirtying the artifact branch (which would block `git pull`). Artifact metadata writes are committed as part of the artifact save commit.

### `.saves.json` Read Path Map

| Consumer | How it reads | What it reads | Location |
|----------|-------------|---------------|----------|
| `determineStage` (work.ts:408, 465) | `readFileOnBranch` (git show) | `saved_at` for FAIL-to-re-verify detection | work branch committed |
| `completeWork` (work.ts:1533) | `fs.existsSync` + `readFileSync` | artifact metadata (hashes, saved_at) | artifact branch filesystem |
| `completeWork` (work.ts:1597) | `fs.existsSync` + `readFileSync` | `build_started_at` | artifact branch filesystem |
| `writeProofChain` (work.ts:853) | `fs.existsSync` + `readFileSync` | `modules_touched`, `commit_hygiene` | **completed** dir |
| `proofSummary.ts:1819` | `fs.existsSync` + `readFileSync` | everything (hashes, timing, hygiene) | slug dir (whichever is passed) |
| `verify.ts:38` | `fs.existsSync` + `readFileSync` | `pre-check` seal hash | slug dir (worktree) |

The new guard adds a filesystem read from the worktree for `verify_started_at` — consistent with how `worktreeExists` already works at line 384.

### Patterns Discovered
- `work.ts:384` — `worktreeExists(projectRoot, slug)` is the precedent for filesystem-level checks inside `determineStage`. The verify-in-progress guard follows this pattern.
- `work.ts:1797,1968` — `build_started_at` uses `force: true` for FAIL-to-Fix. This is the precedent for `verify_started_at` force-write.
- `work.ts:2296-2302` — `startCommand` currently takes no options. The `completeCommand` at line 2304-2311 shows the pattern for adding options.
- `pr.ts:194` — gh availability check. PR duplicate guard goes after this line.
- `work.ts:1449-1470` — merge detection block. Guard 3 reorders this.

### Constraints Discovered
- [TYPE-VERIFIED] verify_started_at never committed (work.ts:1801, 1935) — both write paths lack `commitSaves()` call. readFileOnBranch cannot see the timestamp.
- [TYPE-VERIFIED] plan_started_at IS committed (work.ts:1919-1920) — commitSaves called immediately after writeTimestamp.
- [TYPE-VERIFIED] writeTimestamp write-once guard (work.ts:2210) — prevents double-write but does NOT block execution. Both sessions proceed silently.
- [OBSERVED] startWork resume path is not phase-aware (work.ts:1778-1808) — multi-phase phase 2+ and FAIL-to-re-verify are not correctly routed. This limits guard coverage but is a separate scope.
- [OBSERVED] determineStage CAN distinguish FAIL-to-re-verify via saved_at comparison (work.ts:406-416) but startWork does not replicate this logic.

### Test Infrastructure
- `packages/cli/tests/commands/work.test.ts` — primary test file. Uses vitest, mocks git operations, tests determineStage and stage transitions.
- `packages/cli/tests/commands/pr.test.ts` — PR command tests. Mocks gh CLI and git operations.

## For AnaPlan

### Structural Analog
`completeWork`'s `--merge` flag (work.ts:2304-2311) — same pattern as adding `--force` to `startWork`: option on command, threaded to function, conditionally changes behavior. The merge detection reorder at work.ts:1449-1470 is the exact block being modified for Guard 3.

### Relevant Code Paths
- `work.ts:366-494` — `determineStage` function. Add verify-in-progress and plan-in-progress stages.
- `work.ts:505-556` — `getNextAction` function. Add guidance for new stages.
- `work.ts:1750-1810` — `startWork` inside-worktree resume path. Guard check before verify timestamp write at line 1799-1801.
- `work.ts:1930-1959` — `startWork` artifact-branch verify path. Guard check before verify timestamp write at line 1935.
- `work.ts:1919-1922` — `startWork` plan path. Guard check before plan timestamp write.
- `work.ts:1449-1470` — `completeWork` merge detection. Reorder to gh-first.
- `work.ts:2296-2302` — `startCommand` registration. Add `--force` option.
- `pr.ts:193-199` — gh availability check. PR duplicate guard goes after this.
- `pr.ts:300-305` — PR creation. Duplicate guard fires before this.

### Patterns to Follow
- `work.ts:384` — filesystem check in `determineStage` via `worktreeExists`
- `work.ts:2304-2311` — option threading pattern from `completeCommand`
- `work.ts:1797` — `writeTimestamp` with `force: true`

### Known Gotchas
- `readFileOnBranch` (work.ts:124-127) uses `git show` — it CANNOT see uncommitted worktree content. The verify guard must use direct filesystem reads. Do not use `readFileOnBranch` for `verify_started_at`.
- The plan guard CAN use either `readFileOnBranch` or filesystem reads because `plan_started_at` is committed. Filesystem read is simpler and consistent with the verify guard.
- `writeTimestamp`'s write-once guard (line 2210) silently returns without writing. The calling code has no way to know the write was skipped. The guard must read BEFORE calling writeTimestamp, not rely on writeTimestamp's behavior.
- `getNextAction` returns multi-line strings for `ready-to-merge` (line 531). The `fix-work-saves-compat` scope in the pipeline is changing this to `string | string[]`. Coordinate: if that scope lands first, follow its pattern. If not, use a single-line string for the new stages.
- `fix-work-saves-compat` is also in the pipeline touching work.ts. Different functions (that scope: `completeWork` + `getWorkStatus` saves.json backward-compat guard; this scope: `determineStage` + `startWork` + `completeWork` merge check). Low conflict risk but the planner should be aware of overlapping file changes.

### Things to Investigate
- Whether the guard timeout (1 hour) should be configurable via `ana.json`. Probably not for v1 — hardcoded is simpler and sufficient. But note the constant's location for future extraction.
