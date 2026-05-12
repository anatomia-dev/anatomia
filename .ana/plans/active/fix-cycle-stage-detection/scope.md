# Scope: Fix cycle stage detection breaks on multi-phase builds

**Created by:** Ana
**Date:** 2026-05-12

## Intent

After a FAIL verification on a multi-phase build, the fix cycle gets permanently stuck at `needs-fixes` even when the fix build completes successfully. AnaVerify reports "nothing to verify." The pipeline is dead until a human manually intervenes. This happened on `configurability-improvements` — the first real multi-phase build to go through a FAIL-fix-re-verify cycle. It will happen to every customer who hits a verify rejection on any multi-phase work item, and the single-spec path has the same underlying fragility.

## Complexity Assessment

- **Kind:** fix
- **Size:** medium — touches 6 files across 2 packages (source + templates), but the changes follow existing patterns
- **Files affected:**
  - `packages/cli/src/commands/artifact.ts` — auto-rename extension, `.saves.json` key changes, companion handling
  - `packages/cli/src/commands/work.ts` — stage detection rewrite (git timestamps → `.saves.json`), `completeWork` key migration
  - `packages/cli/templates/.claude/agents/ana-build.md` — resume protocol phase-awareness
  - `packages/cli/templates/.claude/agents/ana-verify.md` — re-verify stage recognition
  - `packages/cli/tests/commands/work.test.ts` — fix-cycle stage transition tests
  - `packages/cli/tests/commands/artifact.test.ts` — auto-rename fix-cycle tests
- **Blast radius:** Stage detection affects `ana work status` output, which every agent reads on startup. `.saves.json` key changes affect `completeWork` (which reads keys for completeness checks). Template changes affect all new pipeline runs. Existing `.saves.json` files with old keys (`build-report`) need backward-compatible reads.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Fix cycles aren't modeled as a first-class flow. The template instructions, auto-rename fallback, companion handling, `.saves.json` keys, stage detection, and verify agent intake were all designed for the happy path (first build, first verify). Fix cycles are inferred through heuristics — git timestamp ordering, file existence checks — that break on the first real rejection cycle. Three independently designed subsystems each assume the happy path, and their gaps compound.

The fix makes fix cycles mechanically reliable through two layers:

**Layer 1 — Mechanical guarantees (code).** Extend auto-rename to handle fix cycles (both report and companion files). Make `.saves.json` keys phase-aware so timestamps are per-phase. Replace git timestamp comparison with `.saves.json` timestamp comparison for stage detection. These are the checks that catch what templates can't guarantee.

**Layer 2 — Template correctness.** Make the build resume protocol phase-aware from the first instruction, not as a late afterthought. Add re-verify stages to the verify agent's intake filter. These reduce the frequency of mechanical interventions but are not trusted as the sole defense.

## Acceptance Criteria

- AC1: Multi-phase fix cycle works end-to-end — FAIL verify on phase N, fix build, `ana artifact save build-report-N`, stage transitions to `phase-N-ready-for-re-verify`, AnaVerify picks up the work.
- AC2: `artifact save` is self-healing — when both `build_report.md` and `build_report_N.md` exist, save renames the unnumbered file's content to the numbered path. Works for both reports and companion data files. Works for verify reports too.
- AC3: Stage detection uses `.saves.json` `saved_at` timestamps instead of git commit timestamps — both single-spec path (lines 395-421) and multi-phase path (lines 458-483).
- AC4: `.saves.json` keys are phase-aware — `build-report-1`, `verify-report-1`, `build-data-1`, `verify-data-1` for numbered artifacts. Unnumbered artifacts (`build-report`, `verify-report`) unchanged.
- AC5: `completeWork` completeness check reads phase-aware keys for multi-phase work, with fallback to old unnumbered keys for backward compatibility.
- AC6: Template `ana-build.md` resume protocol uses phase-numbered filenames (`build_report_{N}.md`, `build-report-{N}`) from the first instruction, not as a late hint.
- AC7: Template `ana-verify.md` "Find Work" section lists `ready-for-re-verify` and `phase-N-ready-for-re-verify` as valid stages.
- AC8: Tests exist for `ready-for-re-verify` stage transition (single-spec), `phase-N-ready-for-re-verify` stage transition (multi-phase), auto-rename when both numbered and unnumbered files exist, auto-rename of companion files alongside reports, and full FAIL-fix-re-verify stage progression.

## Edge Cases & Risks

- **Agent writes BOTH numbered AND unnumbered files during fix cycle.** Auto-rename overwrites numbered with unnumbered. This is wrong if the numbered file had correct fix content, but: the template instructs unnumbered first (the bug), so the unnumbered file is the intentional output. The template fix (AC6) makes this scenario near-zero. Acceptable tradeoff — mechanical backup beats trusting agent filename choice.
- **`.saves.json` idempotent skip on identical content.** `writeSaveMetadata` skips the write (and timestamp update) if the content hash matches. If a fix build produces identical content to the original build, the timestamp won't update, and stage detection sees `needs-fixes`. This is correct behavior — identical content means nothing was actually fixed.
- **Backward compatibility of `.saves.json` keys.** Existing work items have `build-report` as the key. New saves write `build-report-1`. `completeWork` must check both — phase-aware key first, fall back to old key. Stage detection reads from the worktree branch, where keys will always be the format that was active when that artifact was saved.
- **`.saves.json` race condition.** `writeTimestamp` (work.ts) and `writeSaveMetadata` (artifact.ts) both do read-modify-write without locking. Not a real risk: CLI is single-process, these are separate invocations separated by minutes/hours. Theoretical two-terminal scenario is user error with recoverable consequences. No hardening needed.
- **Archive creates duplicate if step 6a and 6b-pre both try to archive.** Step 6a (auto-rename) does a destructive overwrite — it replaces the numbered file content with the unnumbered content. Step 6b-pre (archive) then sees disk content != HEAD content and creates the archive. No duplication — step 6a doesn't archive, step 6b-pre does. The separation is clean.
- **Cross-platform `fs.renameSync` over existing file.** On Unix, atomic overwrite. On Windows, Node.js handles it. Existing auto-rename code already uses `fs.renameSync` (line 1007). Same API, extended use case.

## Rejected Approaches

- **Fix only multi-phase, leave single-spec alone.** Lines 395-421 have the identical git timestamp fragility for single-spec FAIL-fix-re-verify. The idempotent check (lines 1274-1280) could prevent a commit on identical content, permanently breaking single-spec stage detection too. Fixing both paths costs almost nothing extra — it's the same function, same pattern.
- **Harden git timestamp comparison instead of replacing it.** Could ensure every artifact save always commits (remove idempotent check). But this fights the existing design — idempotent saves are intentional for atomic safety. And git timestamps are a proxy for "was this artifact re-saved" when `.saves.json` is the explicit record of exactly that.
- **Use unnumbered file presence as "fixes applied" signal.** An unnumbered file could exist for reasons other than a fix cycle (agent wrote it during first build, save crashed before rename). Too fragile to use as a stage detection signal.
- **Add atomic locking to `.saves.json` writes.** The race condition is theoretical — two concurrent CLI processes on the same slug. Not a practical risk in the sequential CLI execution model. Over-engineering for a scenario that's user error.

## Open Questions

None. All open items from initial scoping were investigated and resolved.

## Exploration Findings

### Patterns Discovered

- `artifact.ts:997-1011` — auto-rename fallback pattern. Checks `!fs.existsSync(filePath) && isNumbered`, renames unnumbered → numbered. The fix extends the condition to also handle `fs.existsSync(filePath) && unnumberedAlsoExists`.
- `artifact.ts:183-231` — archive pattern. Compares disk content vs `git show HEAD:{path}`. Naturally handles the post-rename case without modification.
- `artifact.ts:885-891` — `deriveCompanionFileName` correctly handles numbered files (`build_report_1.md` → `build_data_1.yaml`). No change needed here.
- `artifact.ts:899-903` — `deriveCompanionKey` returns unnumbered keys (`build-data`). Needs phase awareness.
- `work.ts:300-343` — artifact discovery maps spec filenames to expected report filenames. This is the source of truth for which report files to expect per phase.

### Constraints Discovered

- [TYPE-VERIFIED] `ArtifactTypeInfo` (artifact.ts:246-251) — has no field for the full type string. `baseType` always strips the phase number. Needs an `artifactType` field.
- [TYPE-VERIFIED] `parseArtifactType` (artifact.ts:259-298) — parses the number but only uses it for `fileName` construction, doesn't store it on the return type.
- [OBSERVED] `.saves.json` from configurability-improvements worktree — keys are `build-report`, `verify-report`, `build-data`, `verify-data`. No phase numbers.
- [OBSERVED] `completeWork` at lines 1483-1486 — hardcoded to read `savesData['build-report']` and `savesData['verify-report']`. Phase-unaware.
- [OBSERVED] Stage detection reads artifacts via `fileExistsOnBranch` (git show) — `.saves.json` can be read the same way for timestamp comparison.

### Test Infrastructure

- `tests/commands/work.test.ts` — uses `createWorkTestProject` helper to set up plan directories with files. Has tests for `needs-fixes` stage (line 212) but none for `ready-for-re-verify`. Pattern is clear — create files, call `getWorkStatus`, assert output contains stage string.
- `tests/commands/artifact.test.ts` — no fix-cycle tests exist. Has auto-rename tests for the "unnumbered exists, numbered doesn't" case. Pattern needs extending.

## For AnaPlan

### Structural Analog

`artifact.ts:997-1011` — the existing auto-rename fallback. It handles "agent wrote unnumbered, we expected numbered" for first builds. Extending it to handle "both exist, prefer unnumbered" for fix cycles is a natural evolution. The condition changes from `!exists(numbered) && exists(unnumbered)` to also include `exists(numbered) && exists(unnumbered)`.

### Relevant Code Paths

- `artifact.ts:997-1011` — auto-rename fallback (extend for fix cycles + companions)
- `artifact.ts:183-231` — archivePreviousVersion (no changes needed, works naturally after rename)
- `artifact.ts:246-298` — ArtifactTypeInfo + parseArtifactType (add `artifactType` field)
- `artifact.ts:45-77` — writeSaveMetadata (change key from baseType to artifactType)
- `artifact.ts:899-903` — deriveCompanionKey (make phase-aware)
- `artifact.ts:1251` — saveArtifact call to writeSaveMetadata (use new key)
- `artifact.ts:1655` — saveAllArtifacts call to writeSaveMetadata (use new key)
- `work.ts:395-421` — single-spec stage detection (replace git timestamps with .saves.json)
- `work.ts:458-483` — multi-phase stage detection (replace git timestamps with .saves.json)
- `work.ts:1483-1486` — completeWork completeness check (phase-aware keys + fallback)
- `ana-build.md:432-451` — resume protocol (make phase-aware from first instruction)
- `ana-verify.md:39-41` — find work stages (add re-verify stages)

### Patterns to Follow

- Auto-rename at `artifact.ts:1007` — `fs.renameSync` with chalk.gray log message
- Archive at `artifact.ts:183-231` — compare disk vs `git show HEAD`, write `_r{N}` file
- Stage detection at `work.ts:466-472` — read data from worktree branch, compare, return stage string
- `.saves.json` reads at `work.ts:1483` — parse JSON, read keyed entries, check saved_at/hash

### Known Gotchas

- `deriveCompanionKey` is called in two places: `saveArtifact` (line 1127) and `saveAllArtifacts` (line 1517). Both pass `baseType`. The signature change to accept the full artifact type must be applied consistently.
- `saveAllArtifacts` iterates artifacts and writes save metadata at line 1655 using `artifact.typeInfo.baseType`. The `typeInfo` objects come from scanning the plan directory (line 1426-1470), NOT from CLI argument parsing. Ensure the scanned artifacts get the full `artifactType` field populated.
- `completeWork` backward compatibility: for single-spec work items created before this fix, `.saves.json` will have `build-report` key. For multi-phase work items created before this fix, `.saves.json` will also have `build-report` key (phase 2 overwrites phase 1). The fallback must handle both.
- The `.saves.json` is on the worktree branch, readable from main via `git show {branch}:.ana/plans/active/{slug}/.saves.json`. Stage detection currently reads individual files via `fileExistsOnBranch` and `readFileOnBranch` — the `.saves.json` read follows the same pattern.

### Things to Investigate

- Whether `saveAllArtifacts` auto-rename and companion rename logic should be added (it discovers artifacts by scanning, not by type string — the fix-cycle rename in `saveArtifact` may not apply, but verify this assumption).
