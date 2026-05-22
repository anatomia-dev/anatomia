# Scope: Fix False Rejection Archives on Same-Session Re-Saves

**Created by:** Ana
**Date:** 2026-05-22

## Intent

When an agent saves an artifact, notices a validation warning or content issue, edits, and re-saves within the same session, the system creates false `_r` archive files and false `.saves.json` history entries — signals that mean "rejection cycle happened" when no rejection occurred. Today this produces noise (false `_r1` files in git, misleading history arrays) but no data corruption, because the timing consumer (`hasRejectionHistory`) checks only `build-report` and `verify-report` history, and the observed trigger was on `verify-data` only. But if the verify report content itself changes on a same-session re-save, the false history entry on `verify-report` activates the rejection-cycle timing reconstruction path, producing phantom build/verify segments from timestamps seconds apart — corrupting the proof chain entry's timing data.

Observed during `fix-python-dep-separation` verification: AnaVerify saved, got a YAML validation warning, fixed the YAML, re-saved. Created false `verify_report_r1.md` and `verify_data_r1.yaml`. No data corruption this time — correct by accident, not by design.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — ~30-40 lines across two files, plus tests
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/artifact.ts` — `archivePreviousVersion` call sites (4), `writeSaveMetadata` (1)
  - `packages/cli/src/utils/proofSummary.ts` — `computeTiming` (1 check replacement)
  - `packages/cli/tests/commands/artifact.test.ts` — update existing archive tests, add same-session-correction tests
  - `packages/cli/tests/utils/proofSummary.test.ts` — update rejection timing test to use content-based detection
- **Blast radius:** Low. The gate adds a precondition to existing archiving and history logic — it narrows when they fire, never widens. Genuine rejection cycles (opposing stage advanced between saves) are unaffected. The content-based timing check replaces a `.saves.json`-based heuristic with the same function (`parseRejectionCycles`) already used as the authoritative source for `rejection_cycles` in the proof chain entry. No new mechanisms introduced.
- **Estimated effort:** 1-2 hours
- **Multi-phase:** no

## Approach

The disease: `archivePreviousVersion` and `writeSaveMetadata` trigger on **content diff** when rejection is a **pipeline-state concept**. A rejection cycle means the opposing pipeline stage (build ↔ verify) advanced between saves. A same-session correction means it didn't.

Three changes, layered for defense-in-depth:

1. **Gate archiving on stage transition.** Before creating `_r` files, check `.saves.json`: for verify artifacts, archive only if `build-report` saved after the current `verify-report` entry. For build artifacts, archive only if `verify-report` saved after the current `build-report` entry. Phase-aware: `verify-report-2` checks `build-report-2`. No opposing entry or no current entry → skip archiving (first save, nothing to archive from a previous round). This gate applies at all four `archivePreviousVersion` call sites (two in `saveArtifact`, two in `saveAllArtifacts`).

2. **Gate history pushes on the same stage-transition check.** In `writeSaveMetadata`, apply the same opposing-stage check before pushing to the history array. Only for archivable types (`build-report`, `verify-report` and their numbered variants). Planning artifact history is unaffected — it's inert (no consumer reads it) and re-saves during planning are normal workflow.

3. **Replace `hasRejectionHistory` with content-based detection.** In `computeTiming`, replace the `.saves.json` history-based `hasRejectionHistory` check with a content-based check: read the verify report, call `parseRejectionCycles`, check `cycles > 0`. This makes timing reconstruction use the same authoritative source as the proof chain entry's `rejection_cycles` field. Even if gates 1-2 miss an edge case, timing data cannot be corrupted by false history entries.

## Acceptance Criteria
- AC1: Same-session re-save of verify-report does NOT create `_r` archive files when build-report has not been re-saved since the last verify-report save
- AC2: Same-session re-save of verify-report does NOT create a history entry in `.saves.json` for `verify-report` when the opposing stage has not advanced
- AC3: Same criteria for build-report — no false `_r` files or history entries when verify-report has not been re-saved since the last build-report save
- AC4: Genuine rejection cycles (opposing stage advanced between saves) still create `_r` archive files and history entries — behavior preserved
- AC5: Multi-phase numbered artifacts use phase-aware opposing key lookup (`verify-report-2` checks `build-report-2`)
- AC6: `computeTiming` uses `parseRejectionCycles` (report content) instead of `hasRejectionHistory` (`.saves.json` history arrays) to select the timing reconstruction path
- AC7: Companion artifacts (verify-data, build-data) follow the same gating as their parent report — no false companion archives on same-session re-save
- AC8: First-time saves (no prior entry in `.saves.json`) continue to work — no archiving, no history, no regression

## Edge Cases & Risks

**Gate reads stale `.saves.json`:** Both save paths (`saveArtifact`, `saveAllArtifacts`) run archiving BEFORE `writeSaveMetadata`. The gate reads `.saves.json` state from before the current save updates it. This is the correct state — "has the opposing stage advanced since our LAST save?" Verified: `archivePreviousVersion` at lines 1248/1414 precedes `writeSaveMetadata` at lines 1484/1489 in `saveArtifact`; archiving at lines 1792-1804 precedes `writeSaveMetadata` at lines 1888-1897 in `saveAllArtifacts`.

**Content-based fallback degrades gracefully:** If `parseRejectionCycles` can't find a "Previous Findings Resolution" section (file missing, format unexpected), it returns 0 cycles. Timing falls through to the simple endpoint-subtraction path (line 1862+). This produces less-granular timing (no segment breakdown) but not corrupted timing. Degradation, not corruption.

**Multi-phase rejection detection limitation persists:** The existing `hasRejectionHistory` only checks unnumbered keys — multi-phase rejection timing was never detected. Part 3 replaces this with content-based detection, which works for multi-phase verify reports since `parseRejectionCycles` reads report content regardless of naming. This is an incidental improvement, not a regression.

**Planning artifact history unchanged:** `spec` already has a history entry in the observed `.saves.json` (AnaPlan saved, then re-saved). Nothing reads planning artifact history. The gate intentionally skips non-archivable types — no behavior change for planning re-saves.

**`saveAllArtifacts` companion loop (lines 1801-1804) lacks `isArchivable` check:** It archives all companions without filtering. Functionally harmless (only build/verify reports have companions), but the gate must still apply to companions in this loop. AnaPlan should note this — the gate is the fix, not adding the missing `isArchivable` check.

## Rejected Approaches

**Time-based heuristic** (archive only if > N minutes since last save): No threshold is correct. A fast rejection cycle (5 min) gets suppressed. A slow same-session correction (agent deliberates 45 min before re-saving) gets archived. Time doesn't encode pipeline state.

**Explicit `--correction` flag on `artifact save`:** Moves responsibility to agent instructions. Agents can forget the flag or misuse it. Violates "verified over trusted."

**Archive naming reform** (`_r` → `_v` for versioning): Cosmetic. Doesn't prevent false history entries or timing corruption. Treats the symptom.

**Skip Part 2 (rely only on Part 3):** Part 3 prevents timing corruption, so false history entries become inert. But `.saves.json` is a flight recorder — false entries are misleading to humans and future consumers. ~5 additional lines for Part 2 is cheap insurance. Defense in depth over minimal surface.

**Skip Part 1 (rely only on Parts 2+3):** False `_r` files in git history are permanent noise. They mislead anyone reading the plan directory into thinking a rejection cycle occurred. The archive is an audit trail — a false audit trail is worse than no audit trail.

## Open Questions

None. The REQ's open question about gating planning artifact history is resolved: gate only archivable types. Planning history is inert (no consumer) and planning re-saves are normal workflow.

## Exploration Findings

### Patterns Discovered
- `archivePreviousVersion` (artifact.ts:341): Pure function — reads git HEAD via `runGit(['show', ...])`, compares to disk, writes `_r{N}` file. No side effects beyond the file write. Gate can be applied at the call sites without modifying the function itself.
- `writeSaveMetadata` (artifact.ts:47): Reads `.saves.json`, computes SHA-256, pushes to history if existing entry differs. Already idempotent (hash match → skip). Gate adds one more condition to the existing `if (existing && existing.saved_at && existing.hash)` block.
- `computeTiming` (proofSummary.ts:1609): Three branches — multi-phase (line 1751), rejection history (line 1805), simple fallback (line 1862). The rejection branch interleaves build/verify timestamps from history arrays. Part 3 changes the branch selector, not the branch logic.

### Constraints Discovered
- [TYPE-VERIFIED] Two save paths (artifact.ts) — `saveArtifact` (~lines 1170-1550) and `saveAllArtifacts` (~lines 1630-1950). Both call `archivePreviousVersion` and `writeSaveMetadata`. Changes must be applied to BOTH paths. The saves-json-system doc (TEAM_DOCS) confirms: "Two save paths must stay in sync."
- [OBSERVED] Archiving runs BEFORE `writeSaveMetadata` in both paths — gate reads pre-save `.saves.json` state. Correct for the comparison logic.
- [OBSERVED] `parseRejectionCycles` is already exported from proofSummary.ts and used at line 2067 for proof chain `rejection_cycles`. Battle-tested, not a new dependency.
- [OBSERVED] `typeInfo.artifactType` is the full key (`verify-report-2`), `typeInfo.baseType` is the stem (`verify-report`). Gate needs `artifactType` for `.saves.json` lookup and must derive the opposing key phase-aware.

### Test Infrastructure
- `packages/cli/tests/commands/artifact.test.ts`: Existing archive tests at lines 3300-3530 test `_r1` creation for all four artifact types (verify report, verify data, build report, build data), round number incrementing, and `saveAllArtifacts` archiving. Tests create temp repos with committed versions, overwrite, and verify archive creation. These tests need `.saves.json` entries with opposing-stage timestamps to continue passing under the new gate.
- `packages/cli/tests/utils/proofSummary.test.ts`: Existing rejection timing test at line 4194 tests `computeTiming` with history arrays. This test needs a verify report file with "Previous Findings Resolution" content to trigger the rejection branch under the new content-based detection.

## For AnaPlan

### Structural Analog
`writeSaveMetadata` idempotency check (artifact.ts:66-68) — same shape: read existing state, compare, conditionally skip. The stage-transition gate is another conditional skip using the same `.saves.json` data.

### Relevant Code Paths
- `artifact.ts:47-91` — `writeSaveMetadata`: the history push at line 72-77 where the gate applies
- `artifact.ts:341-390` — `archivePreviousVersion`: the function itself is unchanged; gate applies at call sites
- `artifact.ts:1246-1253` — `saveArtifact` report archiving call site
- `artifact.ts:1414-1419` — `saveArtifact` companion archiving call site
- `artifact.ts:1792-1804` — `saveAllArtifacts` report + companion archiving
- `artifact.ts:1484-1489` — `saveArtifact` `writeSaveMetadata` calls
- `artifact.ts:1888-1897` — `saveAllArtifacts` `writeSaveMetadata` calls
- `proofSummary.ts:1705-1710` — `hasRejectionHistory` check to replace
- `proofSummary.ts:1805-1857` — rejection-cycle timing reconstruction (unchanged, but branch selector changes)
- `proofSummary.ts:1604-1640` — `parseRejectionCycles` (the replacement check, already exists)
- `artifact.ts:419-469` — `parseArtifactType`: `artifactType` (full key) vs `baseType` (stem) for phase-aware key derivation

### Patterns to Follow
- `writeSaveMetadata` idempotency pattern (artifact.ts:66-68): read existing, compare, skip
- `deriveCompanionKey` (artifact.ts:1117-1123): phase-aware key derivation from artifact type string — same pattern needed for opposing-stage key derivation

### Known Gotchas
- Two save paths must stay in sync. Every gate added to `saveArtifact` must also be added to `saveAllArtifacts`.
- The `saveAllArtifacts` companion loop (lines 1801-1804) iterates companion objects which have `relPath` and `key` but not `typeInfo`. The gate needs the artifact type to derive the opposing key — derive it from `companion.key` (e.g., `verify-data-2` → opposing is `build-report-2`).
- Existing archive tests don't set up `.saves.json` with opposing-stage entries. Under the new gate, they'll skip archiving (no opposing-stage timestamp → no stage transition detected → gate blocks). Tests must be updated to include opposing-stage entries that satisfy the gate.
- The `computeTiming` replacement needs the verify report file path. `computeTiming` receives `savesPath` (the `.saves.json` path). The verify report is in the same directory. Use `path.join(path.dirname(savesPath), 'verify_report.md')` — but also handle numbered reports and the case where the file doesn't exist.

### Things to Investigate
- The opposing-key derivation function: should it be a standalone helper (like `deriveCompanionKey`) or inline at each gate site? Four call sites for archiving + one for history suggests a helper is cleaner. Design judgment on naming and signature.
