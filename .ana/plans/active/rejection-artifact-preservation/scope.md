# Scope: Rejection Cycle Artifact Preservation

**Created by:** Ana
**Date:** 2026-05-06

## Intent

When a pipeline run has rejection cycles (FAIL → fix → PASS), intermediate artifacts are lost. The Verify agent correctly deletes previous reports before writing fresh ones — this ensures write independence across rounds. But the FAIL-round verify report, its companion YAML, and the pre-fix build report are gone by the time `artifact save` runs. The proof chain entry records `rejection_cycles` count and `previous_failures` summaries, but the full artifacts are permanently lost.

At 56 pipeline entries with ~7 rejection cycles, that's 7 FAIL reports gone. The rejection cycle is the most interesting part of the proof record — it documents what went wrong, why, and how it was fixed.

## Complexity Assessment
- **Size:** small
- **Files affected:** `packages/cli/src/commands/artifact.ts`
- **Blast radius:** Low. The archive is additive — it creates new `_r{N}` files. No existing file patterns, regexes, or consumers match the `_r{N}` suffix. Verified: `saveAllArtifacts` scan regex (`^build_report_\d+\.md$`), `proofSummary` filters (`^verify_report(_\d+)?\.md$`), `deriveCompanionFileName` (`^(verify|build)_report(_\d+)?\.md$`), and orphan-cleanup regex all ignore `_r{N}` files by design.
- **Estimated effort:** ~30-40 LoC for the shared helper + calls from both save paths
- **Multi-phase:** no

## Approach

Extract previously committed artifact versions from git history at save time. Before staging a report file, check if HEAD has a different committed version via `git show HEAD:{relPath}`. If it does, write that content to `{name}_r{N}.md` (or `.yaml`) and stage both the archive and the new file. The agent never knows this happened.

This is purely mechanical, invisible to agents, and works regardless of whether the agent deleted the file or overwrote it. The Verify template's delete-for-independence instruction stays untouched — it's correct design. The CLI adds a safety net beneath it.

## Acceptance Criteria

- AC1: When `ana artifact save verify-report {slug}` runs and `verify_report.md` has a different committed version in HEAD, the committed version is extracted and written to `verify_report_r1.md` before staging
- AC2: Same for `verify_data.yaml` → `verify_data_r1.yaml`
- AC3: Same for `build_report.md` → `build_report_r1.md`
- AC4: Round number increments: if `_r1` already exists, next archive is `_r2`
- AC5: Files with no committed version in HEAD (`git show` fails) are skipped — no false archives
- AC6: All existing tests pass
- AC7: Build succeeds, typecheck clean, lint clean

## Edge Cases & Risks

- **First save (no committed version):** `git show HEAD:{path}` fails. Skip archive. Most common case.
- **Agent overwrites instead of delete-then-write:** `git show HEAD:{path}` still returns the committed version. Mechanism is agnostic to agent behavior.
- **Agent deletes file before save:** `git show HEAD:{path}` still works — committed content is in git history regardless of disk state.
- **Multi-phase:** `verify_report_1.md` uses `_N` for phase numbering. Rejection archive uses `_rN`. A rejected Phase 1 report becomes `verify_report_1_r1.md`. No collision.
- **Companion YAML for archived reports:** `_r{N}` suffix doesn't match `deriveCompanionFileName`'s regex. Archived reports don't get companions derived — correct by design. Companions for the current round derive from current (non-archived) filenames.
- **`saveAllArtifacts` directory scan:** The scan regexes (`^build_report_\d+\.md$`, etc.) don't match `_r{N}` files. Archived files are invisible to the scan loop.
- **Orphan cleanup in `saveAllArtifacts`:** The `artifactPattern` regex at line 1346 also doesn't match `_r{N}`. Archived files won't be cleaned up as orphans.
- **`work complete`:** Moves the entire plan directory. `_r{N}` files travel with it. No change needed.
- **`generateProofSummary`:** Filters with `^verify_report(_\d+)?\.md$` and `^build_report(_\d+)?\.md$`. Reads final reports only. No change needed.
- **Auto-rename fallback (lines 824-838 in artifact.ts):** Renames `build_report.md` → `build_report_1.md` when Build writes the default name instead of the phase-numbered one. This MUST run before the git-history archive check. The archive check targets the final filename after any rename.
- **`build_data.yaml` companion archiving:** Same mechanism. If `git show HEAD:{path}` returns different content, archive to `build_data_r1.yaml`.

## Rejected Approaches

**Disk rename before save (original requirements):** Rename existing file on disk to `_r{N}` before writing the new one. Rejected because it requires changing the Verify template to remove the delete instruction. The delete instruction is correct design — it ensures write independence across rounds. The git-history approach preserves the instruction and adds mechanical preservation beneath it.

**Template-only change (remove delete instruction, let CLI rename):** Would change agent behavior during re-verification. The read → delete → write-fresh flow is deliberate: it prevents FAIL-round content from leaking into the PASS report. The CLI should work invisibly beneath this.

## Open Questions

None. All questions resolved during investigation.

## Exploration Findings

### Patterns Discovered
- `saveArtifact` and `saveAllArtifacts` are independent functions (not wrapper + implementation). Both need the archive logic.
- Companion YAMLs are discovered in a separate `companions` array in `saveAllArtifacts` (line 1249), not in the `artifacts` array. The archive helper must be called for companions too.
- `git show HEAD:{path}` works even after the file is deleted from disk — git history is authoritative.

### Constraints Discovered
- [TYPE-VERIFIED] Auto-rename sequencing (artifact.ts:824-838) — fallback rename from default to phase-numbered filename must run before archive check
- [TYPE-VERIFIED] Report pattern regexes across 4 locations (artifact.ts scan, proofSummary, deriveCompanionFileName, orphan cleanup) — all use `_\d+` not `_r\d+`, confirming `_r{N}` files are invisible to existing consumers
- [OBSERVED] `saveAllArtifacts` stages companions via separate loop (line 1326-1334) — archive logic needs to cover this path too

### Test Infrastructure
- `tests/commands/artifact.test.ts` (2562 lines) — comprehensive test suite with git repo setup, branch validation, format validation. Tests use `spawnSync` to run git commands in temp directories.

## For AnaPlan

### Structural Analog
`saveArtifact` auto-rename fallback at lines 824-838 — detects a condition (file doesn't exist but default does), performs a rename, then continues. The archive helper follows the same shape: detect condition (committed version differs), perform extraction + write, then continue with normal staging.

### Relevant Code Paths
- `packages/cli/src/commands/artifact.ts` — `saveArtifact()` (line 786) and `saveAllArtifacts()` (line 1124)
- In `saveArtifact`: archive check goes after auto-rename fallback (line 838) and before "Verify file exists" (line 841)
- In `saveAllArtifacts`: archive check goes before staging loop (line 1327), covering both artifacts and companions
- `deriveCompanionFileName()` (line 727) — used to find companion YAML for report files
- `runGit()` from `src/utils/git-operations.ts` — existing git command wrapper

### Patterns to Follow
- Use `runGit` for git operations (not raw `spawnSync`)
- Error handling: archive failure should warn and continue, not block the save
- The helper should be a standalone function like `captureModulesTouched` — called from both save paths

### Known Gotchas
- `saveAllArtifacts` discovers companions separately from artifacts. Don't forget to archive companions.
- In `saveArtifact`, the companion path is computed at line 908-916. The archive check for the companion must happen after companion discovery but before staging.
- `git show HEAD:{path}` needs the path relative to the repo root, not absolute.

### Things to Investigate
- Whether the archive files should be staged in the same commit as the new artifacts (recommended: yes, atomic) or a separate commit
