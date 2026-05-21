# Scope: Proof chain migration loop cleanup

**Created by:** Ana
**Date:** 2026-05-20

## Intent

Remove dead migration code from `writeProofChain` — the function that runs on every `ana work complete` and writes the entire proof chain to disk. Two one-shot migrations (surface backfill and lesson-to-closed conversion) have completed their work across 132 pipeline runs but still iterate every entry on every completion. Gate the backfill with a migration marker so it never runs again, delete the lesson check entirely, and remove the redundant outer guards that duplicate what `deriveSurface` already handles internally.

## Complexity Assessment

- **Kind:** chore
- **Size:** small
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/work.ts` — writeProofChain: migration marker gate, lesson check removal, outer guard simplification (~20 lines changed)
  - `packages/cli/src/types/proof.ts` — ProofChain interface: add `migrations` field (~1 line)
  - `packages/cli/src/utils/proofSummary.ts` — DashboardEntry: remove redundant `| undefined` (~1 line)
  - `packages/cli/tests/commands/work.test.ts` — new tests for migration marker behavior (~10-15 lines)
- **Blast radius:** `writeProofChain` runs on every `ana work complete` and writes the entire proof chain to disk. Getting this wrong means corrupting the proof chain, losing findings, or breaking the pipeline's completion flow. However, the changes are deletions and guards — no new logic paths. The function's output shape is unchanged. All consumers of `proof_chain.json` use `JSON.parse` without schema validation, so the additive `migrations` field won't break readers.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Convert permanent migration loops into versioned one-shot migrations gated by markers. The surface backfill loop gets a `migrations.surface_backfill` marker — it runs one final time (finding nothing), sets the marker, and never runs again. The lesson-to-closed check is deleted outright since `lesson` is not a valid status in the type system and cannot be produced by current code. Redundant outer guards that duplicate `deriveSurface`'s internal defenses are simplified. A cosmetic type annotation fix in `proofSummary.ts` removes a redundant `| undefined`.

## Acceptance Criteria

- AC1: `proof_chain.json` gains a top-level `migrations` field (`Record<string, boolean>`) after the first `work complete` on this code. Old proof chains without the field are handled via optional chaining.
- AC2: The surface backfill loop (iterating all entries to derive missing `surface`) is skipped entirely when `chain.migrations.surface_backfill` is `true`.
- AC3: The lesson-to-closed migration code (6 lines inside the findings loop) is removed. The surrounding loop (staleness checks, anchor-absent auto-closing, file-moved detection) is untouched.
- AC4: The outer `Object.keys(anaSurfaces).length > 0` guards at both call sites (new-entry surface derivation and backfill loop) are simplified to `if (anaSurfaces)`.
- AC5: `ProofChain` interface in `types/proof.ts` includes `migrations?: Record<string, boolean>`.
- AC6: `DashboardEntry.surface` in `proofSummary.ts` changes from `surface?: string | undefined` to `surface?: string`.
- AC7: The `case 'lesson'` backward-compat line in `computeChainHealth` (proofSummary.ts:1419) is preserved. It's the last safety net for any hypothetical proof chain restored from pre-migration backup.
- AC8: Existing tests pass unchanged. New tests verify: (a) migration marker is written after backfill runs, (b) backfill loop is skipped when marker is present.
- AC9: The `resolveFindingPaths` loop over existing entries (work.ts:1092-1096) is NOT touched — it's still doing active work (10 findings with basename-only paths).

## Edge Cases & Risks

- **First `work complete` after deploy:** Migration markers don't exist yet. The backfill runs one final time (finds nothing — all 107 derivable entries already have surface), sets `surface_backfill: true`, and never runs again. The lesson migration marker (`lesson_to_closed: true`) is written immediately since the code is deleted.
- **New surface added to ana.json after marker is set:** Old entries for the new surface path won't get backfilled because the migration is marked complete. This is a behavior change from today, where the backfill runs continuously. Accepted tradeoff — surfaces are defined at init time and rarely change, new entries already derive surface on creation, and the alternative (continuous derivation) is what we're eliminating.
- **Restored old proof_chain.json with lesson-status findings:** The migration code is gone, so those findings stay as `lesson` forever. `computeChainHealth` counts them as closed (line 1419). They won't appear in active-finding lists. Ghost findings — counted but never displayed or acted on. Acceptable for a scenario requiring a time machine.
- **Restored proof_chain.json with markers but stale data:** Can't happen naturally — markers are only written alongside the migration running. If someone hand-edits the JSON to add markers without backfilling, they get what they deserve.

## Rejected Approaches

- **Gate the lesson check with a marker instead of deleting it.** Unnecessary complexity — `lesson` is not in the status union type, current code cannot produce it, and `computeChainHealth` already handles it as a counting safety net. Keeping dead code behind a marker is still dead code.
- **Add a migration marker for `resolveFindingPaths`.** Still doing active work (10 basename-only paths). Idempotent and cheap (string checks, no I/O for already-resolved paths). Not a migration — it's ongoing maintenance.
- **Typed migration object instead of `Record<string, boolean>`.** A typed `{ lesson_to_closed?: boolean; surface_backfill?: boolean }` is more precise but requires a type change for every future migration. `Record<string, boolean>` is extensible — new migrations just add a key.
- **Remove `case 'lesson'` from `computeChainHealth` too.** It's one line with zero runtime cost that handles the time-machine edge case. Removing it saves nothing and removes the last safety net.

## Open Questions

None — all questions from the REQ were resolved during investigation.

## Exploration Findings

### Patterns Discovered

- `writeProofChain` (work.ts:952-1216) follows a clear pipeline: read chain → build entry → derive surface → resolve paths → run migrations → run maintenance → write chain. Migrations are interleaved with maintenance, not isolated. The migration marker approach isolates them.
- `deriveSurface` (work.ts:919-941) is fully defensive — handles empty modules, empty surfaces, cross-surface, and single-surface. The outer guards at call sites are pure redundancy.

### Constraints Discovered

- [TYPE-VERIFIED] `lesson` not in status union (proof.ts:79) — `status?: 'active' | 'promoted' | 'closed'`. The migration cast `(finding.status as string) === 'lesson'` exists because TypeScript rejects the comparison otherwise.
- [OBSERVED] Zero lesson findings (proof_chain.json) — 778 findings across 132 entries, verified by iteration.
- [OBSERVED] 107 entries with surface, 25 without (11 no modules_touched, 13 cross-surface, 1 no-match on `.github/` path).
- [OBSERVED] 10 findings with basename-only paths — `resolveFindingPaths` is still active.
- [OBSERVED] `computeChainHealth` (proofSummary.ts:1419) has `case 'lesson': closed++` backward-compat — not addressed by REQ, must be preserved.
- [OBSERVED] REQ §2 code snippet keeps `Object.keys().length > 0` inside the migration block, contradicting §3 which says to simplify. §3 is correct.

### Test Infrastructure

- `work.test.ts` has extensive proof chain tests (~100+ assertions across many test cases). No tests reference `lesson` status. Tests create chains as `{ entries: [...] }` — the optional `migrations` field won't break them. `deriveSurface` has 7 dedicated unit tests including the `{}` edge case.

## For AnaPlan

### Structural Analog

`work.ts:1092-1096` — the `resolveFindingPaths` loop over existing entries. Same shape as the surface backfill loop (iterate `chain.entries`, check condition, transform if needed). Shows the pattern of idempotent maintenance passes in `writeProofChain`.

### Relevant Code Paths

- `packages/cli/src/commands/work.ts:919-941` — `deriveSurface` function with internal guards
- `packages/cli/src/commands/work.ts:952-1216` — entire `writeProofChain` function
- `packages/cli/src/commands/work.ts:1040-1055` — new-entry surface derivation with redundant outer guard
- `packages/cli/src/commands/work.ts:1098-1107` — surface backfill loop to gate with marker
- `packages/cli/src/commands/work.ts:1128-1183` — maintenance loop containing dead lesson check at 1130-1138
- `packages/cli/src/types/proof.ts:26-29` — `ProofChain` interface to extend
- `packages/cli/src/utils/proofSummary.ts:1417-1422` — `computeChainHealth` switch with `case 'lesson'` to preserve
- `packages/cli/src/utils/proofSummary.ts:458-464` — `DashboardEntry` with redundant type annotation

### Patterns to Follow

- `chain.schema = 1` at work.ts:1189 — existing pattern of setting chain-level metadata on every write. The `migrations` field follows the same pattern.
- Optional chaining for backward compat (`chain.migrations?.surface_backfill`) — matches how the codebase handles absent fields on old proof chain entries throughout.

### Known Gotchas

- The REQ's code snippet in §2 keeps the full `Object.keys(anaSurfaces).length > 0` guard inside the migration block. This contradicts §3. Use the simplified `if (anaSurfaces)` form everywhere — `deriveSurface` handles empty surfaces internally.
- Do NOT touch the maintenance loop (1128-1183) beyond removing lines 1130-1138. The anchor-absent checks, file-moved detection, and staleness handling are essential live operations.
- Do NOT touch the `resolveFindingPaths` loop (1092-1096). Still doing active work.
- The `lesson_to_closed` marker should be written immediately (not gated by a "run one more time" check) since the migration code is being deleted, not gated.

### Things to Investigate

- Decide where in the write sequence to set `chain.migrations.lesson_to_closed = true`. Options: alongside `chain.schema = 1` (line 1189), or inside the migration marker block with surface_backfill. The former is cleaner — both markers are set in the same place near the write.
