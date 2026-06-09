# Scope: Remove `processCaptureStrict` — provenance records-and-annotates, never blocks

**Created by:** Ana
**Date:** 2026-06-08
**Revised:** 2026-06-08 — back-compat framing removed (see note below)

> **Revision note:** An earlier draft hedged on legacy `processCaptureStrict` keys — "leave-inert vs. scrub," `.passthrough()` tolerance, migration safety. **All moot.** `processCaptureStrict` shipped with `cross-machine-provenance`, which merged *this session* — it is absent from the published `v1.2.2` tag (2026-06-02) and exists nowhere but unreleased `main`. **Zero installs carry it**, and our own dogfood `.ana/ana.json` never even set it. So this is a clean delete: no inert-key handling, no migration, no tolerance code. Remove the flag and its guard, done.

## Intent

`processCaptureStrict` is a config flag that, at `ana work complete`, blocks completion (`process.exit(1)`) when recorded process provenance is incomplete. It should not exist. Process provenance is **metadata** — who/where each pipeline stage ran. Metadata blocking a terminal pipeline action is overreach, and this particular guard has a defect:

- **It blocks the proof record, not the merge.** In the `--merge` path the PR merge has already happened when the guard fires; strict then refuses to write the proof entry and archives nothing. You land code **and** keep no audit trail — strictly worse than landing code with an honestly-annotated incomplete proof.
- **Its own remediation is to disable itself.** The block message says *"set processCaptureStrict to off and re-run to record the gap and finish"* (`work.ts:1152`), and there's a test that encodes exactly that round-trip (`work.test.ts:1470`). A mode whose fix is "turn this mode off" has no stable job.

**The disease:** we modelled provenance as *complete-or-blocked* when it is *recorded-or-annotated*. The correct, already-existing behavior is the non-strict path: capture on → always assemble an attestation and record any completeness gaps in the proof entry; capture off → record nothing. `work complete` never blocks on provenance. This scope removes strict and makes that the only path.

Two-state model after this lands: **`processCapture` on = best-effort capture (hooks may or may not fire); off = no provenance recorded.** No third flag.

(Follows the `captureGate` cleanup thinking. **`enforcement-state-in-doctor` (A) and `rename-capturegate-testevidencegate` (B) are both merged** — C edits B's renamed doctor Enforcement view and the post-B `KNOWN_FIELDS`.)

## Complexity Assessment

- **Kind:** fix
- **Size:** small
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/work.ts` — delete the §8b-strict guard block (`work.ts:1117–1155`) and the `isProcessCaptureStrictEnabled` import (`work.ts:34`). Nothing else in `work complete` changes.
  - `packages/cli/src/utils/forensics.ts` — delete `isProcessCaptureStrictEnabled` and its doc comment (`forensics.ts:271–292`).
  - `packages/cli/src/commands/init/anaJsonSchema.ts` — delete the `processCaptureStrict` schema field + comment (`:116–123`).
  - `packages/cli/src/commands/init/state.ts` — stop emitting `processCaptureStrict: 'off'` in `createAnaJson` (`state.ts:583`) + prune the comment that references it (`:580–582`).
  - `packages/cli/src/commands/doctor.ts` — remove the `process_capture_strict` field from the Enforcement dimension (interface field, assessor read, terminal line, `--json`).
  - `packages/cli/src/commands/config.ts` — remove `processCaptureStrict` from `KNOWN_FIELDS`.
  - Tests: `work.test.ts` (the `strict process-completeness guard` describe block, ~`:1393–`), `init.test.ts` (`:135–143`, `:802–833`), `anaJsonSchema.test.ts` (`:236–255`), and the `doctor.test.ts` strict assertion — remove the strict cases, **add** the replacement behavioral tests below.
- **Blast radius:**
  - Behavioral change at `ana work complete`: incomplete provenance no longer blocks — it records the gap and completes. **Zero shipped installs are affected** — `processCaptureStrict` never published, so the only configs that could carry it are unreleased dev trees, and our dogfood never set it. The change is the intended correction; note it in the build report regardless.
  - **Must NOT touch:** `processCapture` (the recorder), `isProcessCaptureEnabled`, `computeCompleteness`, `assembleProcessAttestation`. These are the record path and stay byte-for-byte.
- **Estimated effort:** ~2-3 hours. Mostly deletion; the care is in the test rebalance and confirming the record path is untouched.
- **Multi-phase:** no

## Approach

1. **Delete the blocking guard, keep the recorder.** Remove the §8b-strict block in `work.ts` and the `isProcessCaptureStrictEnabled` reader. The record path — `assembleProcessAttestation`, which runs on `processCapture` alone and *always* attaches an attestation with `completeness` gaps even for zero sessions (`work-proof.ts:118–183`) — is already the desired end-state. It is not modified. The strict guard was purely additive (it recomputed the same `computeCompleteness` verdict just to block); removing it leaves recording fully intact. *The elegant solution removes.*

2. **Strip the flag from the config surface.** Schema field, `createAnaJson` emit, `KNOWN_FIELDS` entry — all deleted. No legacy handling: nothing shipped carries the key, and `.passthrough()` already tolerates any unknown key without special code, so there is nothing to scrub or migrate.

3. **Drop strict from the doctor Enforcement view.** The view surfaces three flags today; after C it surfaces two (`test_evidence_gate`, `process_capture`). Remove the `process_capture_strict` field, its assessor read, its terminal line, and the `doctor.test.ts` assertion for it.

4. **Rebalance tests to a net non-decrease.** Delete the strict-guard tests; add coverage of the now-*sole* record path: (a) a behavioral test that `work complete` with **incomplete** committed provenance records the gap in the proof entry and **completes** (never blocks, entry IS written) — the positive inverse of the deleted `work.test.ts:1443` block test; (b) the zero-session gap case still records, not hides; (c) `createAnaJson` emits no `processCaptureStrict` key; (d) doctor reports only the two surviving flags. The record path becomes the only path, so it earns the coverage the strict path used to hold.

Strategy only — exact test names and placement are Plan's call.

## Acceptance Criteria

- AC1: `ana work complete` never blocks on incomplete process provenance — there is no code path that exits non-zero on a provenance gap.
- AC2: With `processCapture: "on"` and incomplete provenance (e.g. verify session missing), `work complete` writes the proof-chain entry and the entry's `process.completeness` records the gap (`complete: false`, the gap listed) — recorded, not hidden, not blocked.
- AC3: The record path is unchanged: with full provenance, the attestation and `completeness.complete: true` are identical to pre-change output for the same inputs.
- AC4: `processCaptureStrict` is gone from the schema, `createAnaJson` output, and `KNOWN_FIELDS`; a new project's `ana.json` contains no `processCaptureStrict` key.
- AC5: `ana doctor`'s Enforcement view reports `test_evidence_gate` and `process_capture` only — no strict line — and `ana doctor` still exits 0 on valid config.
- AC6: `isProcessCaptureStrictEnabled` and `processCaptureStrict` no longer exist anywhere in `packages/cli/src` (grep → zero); `processCapture` / `isProcessCaptureEnabled` / `computeCompleteness` / `assembleProcessAttestation` are unchanged (grep counts unchanged).
- AC7: Test count does not decrease from baseline — strict-guard tests removed and replaced by AC2/AC3/AC5 coverage at net ≥ parity.

## Edge Cases & Risks

- **Do not regress the recorder.** The single biggest risk is "removing strict" accidentally touching `computeCompleteness` or `assembleProcessAttestation` (they share the `completeness` concept). The guard *called* `computeCompleteness`; the recorder *also* calls it. Delete only the guard's call site (`work.ts:1141`), never the function or the recorder's call (`work-proof.ts:180`).
- **Deletion ordering in `work complete` is load-bearing — but C only removes.** The §8b-strict comment warns it must run before destructive steps. Since C deletes the whole block, there's no ordering to preserve; just confirm the removal leaves §8b (artifact-saved guards) and §8c (worktree metadata) adjacent and intact.
- **Test-count parity is the real constraint, not behavior.** Removing strict deletes ~6–7 tests; the replacement set (AC2 never-block, AC3 record-path-unchanged, zero-session gap, doctor-two-flags, createAnaJson-no-key) must net ≥ parity against the post-B baseline. If the replacements can't reach parity, that's a signal the surviving behavior is under-tested — add coverage, don't pad.
- **Grep precision.** `processCapture` (recorder, KEEP) and `processCaptureStrict` (DELETE) differ only by the `Strict` suffix. A sloppy delete could catch the recorder.
- **Prior contracts/tests are historical.** The merged scopes' contracts assert `process_capture_strict` is reported, and `init.test.ts:802` is tagged `@ana A033` (re-init preserves strict). Those belong to already-completed proof entries — C does not edit prior contracts; it removes the live code and the now-obsolete tests. The proof chain history is immutable.
- **Multi-machine framing unaffected.** Provenance still assembles across machines exactly as before (capture v2); only the *blocking* on incompleteness is removed. The cross-machine value (a proof you can read across machines) is intact — gaps are now always annotated rather than sometimes blocked.

## Rejected Approaches

- **Keep strict but only block before merge (gate earlier).** Rejected — that's building for hypothetical high-assurance demand no one has asked for; *scope for what the outcome requires, not what you imagine*. If a customer ever needs hard "no completion without full provenance," design it then, as an earlier gate, not a record-write block.
- **Fold this into Scope B (the rename).** Rejected earlier — B was a surgical rename that explicitly scoped out `processCapture*`; mixing a behavioral guard removal into it would have muddied one verify run with two unrelated changes.
- **One-time fix outside the pipeline.** Rejected — this deletes a blocking guard on the `work complete` / proof-writing path in a hot, fragile file (27 prior cycles); the new "always record, never block" guarantee needs independent verification. *Verified over trusted.*

## Open Questions

- None. `processCaptureStrict` is unreleased, so there is no legacy key to migrate, scrub, or tolerate — the questions the earlier draft raised are moot.

## Exploration Findings

### Patterns Discovered
- `work.ts:1117–1155` — §8b-strict guard: `if (isProcessCaptureStrictEnabled(...))` → read committed provenance → `computeCompleteness(activePath, strictSessions)` → on `!complete`, print error and `process.exit(1)`. Sits between §8b (artifact-saved guards) and §8c (worktree metadata). Import at `work.ts:34`.
- `work-proof.ts:118–183` — `assembleProcessAttestation`: the record path. Gated only on `isProcessCaptureEnabled` (`:126`). Always returns an attestation when capture is on, even with zero sessions (`:144–148`), embedding `completeness: computeCompleteness(completedSlugDir, sessions)` (`:180`). **This is the desired end-state; do not modify.**
- `forensics.ts:260–268` — `isProcessCaptureEnabled` (the recorder switch, KEEP). `:283–292` — `isProcessCaptureStrictEnabled` (DELETE).
- `anaJsonSchema.ts:116–123` — `processCaptureStrict` schema field. `state.ts:583` — `createAnaJson` emits `'off'`.

### Constraints Discovered
- [VERIFIED] `processCaptureStrict` is **unreleased**: shipped with `cross-machine-provenance` (merged this session), absent from the `v1.2.2` tag. Published npm version is `1.2.2`. No install carries the key — clean delete, no migration.
- [TYPE-VERIFIED] `computeCompleteness` (`work-proof.ts:56–90`) has two call sites: the strict guard (`work.ts:1141`, deleted) and the recorder (`work-proof.ts:180`, kept). The function itself stays.
- [OBSERVED] Dogfood root `.ana/ana.json` never carried `processCaptureStrict` — our own config needs no edit.
- [OBSERVED] The merged scopes add `doctorResults.dimensions.enforcement.process_capture_strict` and the `processCaptureStrict` `KNOWN_FIELDS` entry. C removes both.
- [OBSERVED] No `processCaptureStrict` references in `website/` or `templates/` — no docs or template changes needed.

### Test Infrastructure
- `work.test.ts:1393–` — `describe('strict process-completeness guard (Phase 2)')`. Reusable helpers to KEEP (minus the strict param): `setCaptureFlags` (`:1395`), `seedActiveProvenance` (`:1404`), `readChainEntry` (`:1435`). Strict cases to REMOVE: the block-and-write-nothing test (`:1443`, `@ana A027/A028/A045`) and the flip-strict-off round-trip (`:1470`, `@ana A029/A030/A046`). The replacement AC2 test reuses `seedActiveProvenance` (seed plan+build, omit verify) and `readChainEntry` to assert the entry IS written with `completeness.complete === false`.
- `init.test.ts:135–143` (createAnaJson writes strict off → becomes "emits NO strict key") and `:802–833` (`@ana A033` re-init preserves strict on → remove).
- `anaJsonSchema.test.ts:236–255` (strict enum values) — remove.

## For AnaPlan

### Structural Analog
The deletion is the inverse of how `cross-machine-provenance` *added* strict — a single additive guard block in `work complete` plus a flag reader. The analog for a clean guard removal is any prior scope that deleted a self-arming/redundant gate (e.g. `retire-capture-self-arming`, in the proof chain) — same shape: remove the guard, keep the mechanically-derived state.

### Functional Analog
`assembleProcessAttestation` (`work-proof.ts:118`) — the behavior that *survives* and becomes the sole path. The AC2/AC3 tests assert its output is unchanged. Read it to confirm nothing in C touches it.

### Relevant Code Paths
- Delete: `work.ts:34` (import), `work.ts:1117–1155` (guard); `forensics.ts:271–292` (reader + comment); `anaJsonSchema.ts:116–123` (field + comment); `state.ts:580–583` (emit + comment); `config.ts` `KNOWN_FIELDS` strict entry; `doctor.ts` enforcement `process_capture_strict` field/assessor/line.
- Keep untouched: `forensics.ts:260–268`, `work-proof.ts:56–90` and `:118–183`, all `processCapture` references.

### Patterns to Follow
- After deleting the `work.ts` block, run the full `work complete` test suite (`work.test.ts`, `work-merge.test.ts`, `work-proof-process.test.ts`) — the completion path is hot and fragile; a clean removal must not perturb the surrounding guards.
- Test rebalance: convert the deleted block-tests into their positive inverse so behavior is asserted, not just absence. Net test count ≥ parity (hard CI constraint).

### Known Gotchas
- `computeCompleteness` is shared — delete only the guard's call site, never the function or the recorder's call.
- `processCapture` (recorder) and `processCaptureStrict` (deleted) differ by the `Strict` suffix only — grep precisely so the recorder isn't caught in the deletion. After: `grep -rn "processCaptureStrict\|isProcessCaptureStrictEnabled" packages/cli/src` → zero; `grep -rn "processCapture\b\|isProcessCaptureEnabled" packages/cli/src` → unchanged counts.
- Don't edit prior contracts (the merged scopes' `contract.yaml`, `@ana A033`) — they're historical proof. Remove only live code + obsolete tests.
- No back-compat code. If you find yourself writing inert-key tolerance, a migration step, or a `.passthrough` guard, stop — nothing shipped carries the flag.

### Things to Investigate
- Decide the exact replacement-test set so test count nets ≥ parity, and place the AC2 behavioral test in the existing `work.test.ts` provenance describe block (rename it away from "strict").
- Confirm the §8b-strict deletion leaves the surrounding `work complete` guards (§8b, §8c) intact and the record path (`assembleProcessAttestation`) untouched.
