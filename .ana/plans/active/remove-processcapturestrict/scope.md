# Scope: Remove `processCaptureStrict` — provenance records-and-annotates, never blocks

**Created by:** Ana
**Date:** 2026-06-08

## Intent

`processCaptureStrict` is a config flag that, at `ana work complete`, blocks completion (`process.exit(1)`) when recorded process provenance is incomplete. It should not exist. Process provenance is **metadata** — who/where each pipeline stage ran. Metadata blocking a terminal pipeline action is overreach, and this particular guard has a defect:

- **It blocks the proof record, not the merge.** In the `--merge` path the PR merge has already happened when the guard fires; strict then refuses to write the proof entry and archives nothing. You land code **and** keep no audit trail — strictly worse than landing code with an honestly-annotated incomplete proof.
- **Its own remediation is to disable itself.** The block message says *"set processCaptureStrict to off and re-run to record the gap and finish"* (`work.ts:1152`), and there's a test that encodes exactly that round-trip (`work.test.ts:1470`). A mode whose fix is "turn this mode off" has no stable job.

**The disease:** we modelled provenance as *complete-or-blocked* when it is *recorded-or-annotated*. The correct, already-existing behavior is the non-strict path: capture on → always assemble an attestation and record any completeness gaps in the proof entry; capture off → record nothing. `work complete` never blocks on provenance. This scope removes strict and makes that the only path.

Two-state model after this lands: **`processCapture` on = best-effort capture (hooks may or may not fire); off = no provenance recorded.** No third flag.

(Follows GitHub issue thinking from the `captureGate` cleanup. **Assumes `enforcement-state-in-doctor` (A) and `rename-capturegate-testevidencegate` (B) have shipped** — C edits A's doctor Enforcement view and the post-A `KNOWN_FIELDS`.)

## Complexity Assessment

- **Kind:** fix
- **Size:** small
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/work.ts` — delete the §8b-strict guard block (`work.ts:1117–1155`) and the `isProcessCaptureStrictEnabled` import (`work.ts:34`). Nothing else in `work complete` changes.
  - `packages/cli/src/utils/forensics.ts` — delete `isProcessCaptureStrictEnabled` and its doc comment (`forensics.ts:271–292`).
  - `packages/cli/src/commands/init/anaJsonSchema.ts` — delete the `processCaptureStrict` schema field + comment (`:116–123`).
  - `packages/cli/src/commands/init/state.ts` — stop emitting `processCaptureStrict: 'off'` in `createAnaJson` (`state.ts:583`) + prune the comment that references it (`:580–582`).
  - `packages/cli/src/commands/doctor.ts` — remove the `process_capture_strict` field from the Enforcement dimension that A added (interface field, assessor read, terminal line, `--json`).
  - `packages/cli/src/commands/config.ts` — remove `processCaptureStrict` from `KNOWN_FIELDS` (A added it).
  - Tests: `work.test.ts` (the `strict process-completeness guard` describe block, ~`:1393–`), `init.test.ts` (`:135–143`, `:802–833`), `anaJsonSchema.test.ts` (`:236–255`), and A's `doctor.test.ts` strict assertion — remove the strict cases, **add** the replacement behavioral tests below.
- **Blast radius:**
  - Behavioral change at `ana work complete`: a project that set `processCaptureStrict: "on"` will **no longer be blocked** on incomplete provenance — it records the gap and completes. This is the intended correction; call it out in the build report / release notes.
  - Legacy `processCaptureStrict` keys in existing `ana.json` files become inert. The schema is `.passthrough()` (`anaJsonSchema.ts:127`), so a present-but-unread key parses harmlessly — no migration required, no error.
  - **Must NOT touch:** `processCapture` (the recorder), `isProcessCaptureEnabled`, `computeCompleteness`, `assembleProcessAttestation`. These are the record path and stay byte-for-byte.
- **Estimated effort:** ~half a day. Mostly deletion; the care is in the test rebalance and confirming the record path is untouched.
- **Multi-phase:** no

## Approach

1. **Delete the blocking guard, keep the recorder.** Remove the §8b-strict block in `work.ts` and the `isProcessCaptureStrictEnabled` reader. The record path — `assembleProcessAttestation`, which runs on `processCapture` alone and *always* attaches an attestation with `completeness` gaps even for zero sessions (`work-proof.ts:118–183`) — is already the desired end-state. It is not modified. The strict guard was purely additive (it recomputed the same `computeCompleteness` verdict just to block); removing it leaves recording fully intact. *The elegant solution removes.*

2. **Strip the flag from the config surface.** Schema field, `createAnaJson` emit, `KNOWN_FIELDS`. Leave existing keys inert via passthrough rather than actively scrubbing them (recommended — see Open Questions).

3. **Drop strict from A's doctor Enforcement view.** A surfaces three flags; after C it surfaces two (`test_evidence_gate`, `process_capture`). Remove the `process_capture_strict` field, its assessor read, its terminal line, and A's `doctor.test.ts` assertion for it.

4. **Rebalance tests to a net non-decrease.** Delete the strict-guard tests; add: (a) a behavioral test that `work complete` with **incomplete** committed provenance records the gap in the proof entry and **completes** (never blocks, entry IS written) — the positive inverse of the deleted `work.test.ts:1443` block test; (b) a test that a legacy `processCaptureStrict: "on"` key is inert (present in `ana.json`, completion proceeds); (c) confirm doctor reports only the two surviving flags.

Strategy only — exact test names and whether to scrub vs. leave-inert are Plan's call.

## Acceptance Criteria

- AC1: `ana work complete` never blocks on incomplete process provenance, regardless of any `processCaptureStrict` value present in `ana.json`.
- AC2: With `processCapture: "on"` and incomplete provenance (e.g. verify session missing), `work complete` writes the proof-chain entry and the entry's `process.completeness` records the gap (`complete: false`, the gap listed) — recorded, not hidden, not blocked.
- AC3: The record path is unchanged: with full provenance, the attestation and `completeness.complete: true` are identical to pre-change output for the same inputs.
- AC4: `processCaptureStrict` is gone from the schema, `createAnaJson` output, and `KNOWN_FIELDS`; a new project's `ana.json` contains no `processCaptureStrict` key.
- AC5: An existing `ana.json` containing `processCaptureStrict: "on"` parses without error and the key has no effect (inert via passthrough).
- AC6: `ana doctor`'s Enforcement view reports `test_evidence_gate` and `process_capture` only — no strict line — and `ana doctor` still exits 0 on valid config.
- AC7: `isProcessCaptureStrictEnabled` no longer exists in `src/`; `processCapture` / `isProcessCaptureEnabled` / `computeCompleteness` / `assembleProcessAttestation` are unchanged (grep: strict symbol → zero; recorder symbols → unchanged).
- AC8: Test count does not decrease — strict-guard tests removed and replaced by AC2/AC5/AC6 coverage at net ≥ parity.

## Edge Cases & Risks

- **Do not regress the recorder.** The single biggest risk is "removing strict" accidentally touching `computeCompleteness` or `assembleProcessAttestation` (they share the `completeness` concept). The guard *called* `computeCompleteness`; the recorder *also* calls it. Delete only the guard's call site (`work.ts:1141`), never the function or the recorder's call (`work-proof.ts:180`).
- **Deletion ordering in `work complete` is load-bearing — but C only removes.** The §8b-strict comment warns it must run before destructive steps. Since C deletes the whole block, there's no ordering to preserve; just confirm the removal leaves §8b (artifact-saved guards) and §8c (worktree metadata) adjacent and intact.
- **Inert legacy key.** `.passthrough()` already guarantees an unknown key survives parse. Verify with a test (AC5) rather than assuming — a future schema tightening could break this silently.
- **Contract assertions referencing strict are historical.** A's contract asserts `process_capture_strict` is reported, and `init.test.ts:802` is tagged `@ana A033` (re-init preserves strict). Those assertions belong to already-completed proof entries; C does not edit prior contracts — it removes the code and the now-obsolete tests. The proof chain history is immutable and stays as-is.
- **Multi-machine framing unaffected.** Provenance still assembles across machines exactly as before (capture v2); only the *blocking* on incompleteness is removed. The cross-machine value proposition (a proof you can read across machines) is intact — gaps are now always annotated rather than sometimes blocked.

## Rejected Approaches

- **Keep strict but only block before merge (gate earlier).** Rejected for now — that's building for hypothetical high-assurance demand no one has asked for; *scope for what the outcome requires, not what you imagine*. If a customer ever needs hard "no completion without full provenance," design it then, as an earlier gate, not a record-write block.
- **Actively scrub legacy `processCaptureStrict` keys on re-init.** Rejected as default — adds migration code to delete a key that passthrough already neutralizes. Leave-inert is the smaller, lower-risk change. (Reconsider only if dead keys in customer configs prove to be a real annoyance.)
- **Fold this into Scope B (the rename).** Rejected earlier — B is a surgical rename that explicitly scopes out `processCapture*`; mixing a behavioral guard removal into it muddies one verify run with two unrelated migrations.
- **One-time fix outside the pipeline.** Rejected — this deletes a blocking guard on the `work complete` / proof-writing path in a hot, fragile file; the new "always record, never block" guarantee needs independent verification. *Verified over trusted.*

## Open Questions

- **Leave-inert vs. scrub on re-init** for legacy `processCaptureStrict` keys. Recommendation: leave-inert (passthrough handles it; smaller diff). Plan to confirm there's no place that *iterates* known flags in a way a stray key would disrupt (none found — `KNOWN_FIELDS` is only used for the `config set` warning).

## Exploration Findings

### Patterns Discovered
- `work.ts:1117–1155` — §8b-strict guard: `if (isProcessCaptureStrictEnabled(...))` → read committed provenance → `computeCompleteness(activePath, strictSessions)` → on `!complete`, print error and `process.exit(1)`. Sits between §8b (artifact-saved guards) and §8c (worktree metadata). Import at `work.ts:34`.
- `work-proof.ts:118–183` — `assembleProcessAttestation`: the record path. Gated only on `isProcessCaptureEnabled` (`:126`). Always returns an attestation when capture is on, even with zero sessions (`:144–148`), embedding `completeness: computeCompleteness(completedSlugDir, sessions)` (`:180`). **This is the desired end-state; do not modify.**
- `forensics.ts:260–268` — `isProcessCaptureEnabled` (the recorder switch, KEEP). `:283–292` — `isProcessCaptureStrictEnabled` (DELETE).
- `anaJsonSchema.ts:116–123` — `processCaptureStrict` schema field, same migration-safe posture as its siblings. `state.ts:583` — `createAnaJson` emits `'off'`.

### Constraints Discovered
- [TYPE-VERIFIED] `computeCompleteness` (`work-proof.ts:56–90`) has two call sites: the strict guard (`work.ts:1141`, deleted) and the recorder (`work-proof.ts:180`, kept). The function itself stays.
- [TYPE-VERIFIED] Schema is `.passthrough()` (`anaJsonSchema.ts:127`) → removing the `processCaptureStrict` field leaves any existing key inert, not erroring.
- [OBSERVED] Dogfood root `.ana/ana.json` has `captureGate` + `processCapture` only — **no `processCaptureStrict` key** — so our own config needs no migration.
- [OBSERVED] A (`enforcement-state-in-doctor`) adds `doctorResults.dimensions.enforcement.process_capture_strict` (contract `enforcement-state-in-doctor/contract.yaml:71–72`) and adds `processCaptureStrict` to `KNOWN_FIELDS` ("the three gate keys"). C removes both.
- [OBSERVED] No `processCaptureStrict` references in `website/` or `templates/` — no docs or template changes needed.

### Test Infrastructure
- `work.test.ts:1393–` — `describe('strict process-completeness guard (Phase 2)')`. Reusable helpers to KEEP (minus the strict param): `setCaptureFlags` (`:1395`), `seedActiveProvenance` (`:1404`), `readChainEntry` (`:1435`). Strict cases to REMOVE: the block-and-write-nothing test (`:1443`, `@ana A027/A028/A045`) and the flip-strict-off round-trip (`:1470`, `@ana A029/A030/A046`). The replacement AC2 test reuses `seedActiveProvenance` (seed plan+build, omit verify) and `readChainEntry` to assert the entry IS written with `completeness.complete === false`.
- `init.test.ts:135–143` (createAnaJson writes strict off) and `:802–833` (`@ana A033` re-init preserves strict on) — remove.
- `anaJsonSchema.test.ts:236–255` (strict enum values) — remove.

## For AnaPlan

### Structural Analog
The deletion is the inverse of how `cross-machine-provenance` *added* strict — a single additive guard block in `work complete` plus a flag reader. There's no structural pattern to follow for "add code"; the analog for a clean guard removal is any prior scope that deleted a self-arming/redundant gate (e.g. `retire-capture-self-arming`, referenced in the proof chain) — same shape: remove the guard, keep the mechanically-derived state.

### Functional Analog
`assembleProcessAttestation` (`work-proof.ts:118`) — the behavior that *survives* and becomes the sole path. The AC2/AC3 tests assert its output is unchanged. Read it to confirm nothing in C touches it.

### Relevant Code Paths
- Delete: `work.ts:34` (import), `work.ts:1117–1155` (guard); `forensics.ts:271–292` (reader + comment); `anaJsonSchema.ts:116–123` (field + comment); `state.ts:580–583` (emit + comment); `config.ts` `KNOWN_FIELDS` strict entry; `doctor.ts` enforcement `process_capture_strict` field/assessor/line.
- Keep untouched: `forensics.ts:260–268`, `work-proof.ts:56–90` and `:118–183`, all `processCapture` references.

### Patterns to Follow
- After deleting the `work.ts` block, run the full `work complete` test suite (`work.test.ts`, `work-merge.test.ts`, `work-proof-process.test.ts`) — the completion path is hot and fragile (27 prior cycles); a clean removal must not perturb the surrounding guards.
- Test rebalance: convert the deleted block-tests into their positive inverse so behavior is asserted, not just absence. Net test count ≥ parity (hard CI constraint).

### Known Gotchas
- `computeCompleteness` is shared — delete only the guard's call site, never the function or the recorder's call.
- `processCapture` (recorder) and `processCaptureStrict` (deleted) differ by the `Strict` suffix only — grep precisely so the recorder isn't caught in the deletion. After: `grep -rn "processCaptureStrict\|isProcessCaptureStrictEnabled" src/` → zero; `grep -rn "processCapture\b\|isProcessCaptureEnabled" src/` → unchanged.
- C depends on A and B being merged. Planning against pre-A code will miss the doctor Enforcement field and the `KNOWN_FIELDS` entry that C must remove.
- Don't edit prior contracts (`enforcement-state-in-doctor/contract.yaml`, `@ana A033`) — they're historical proof. Remove only live code + obsolete tests.

### Things to Investigate
- Confirm leave-inert is safe: verify nothing iterates `ana.json` flags such that a stray `processCaptureStrict` key would surface or misbehave (only `KNOWN_FIELDS`/`config set` consumes the flag list; confirm).
- Decide the exact replacement-test set so test count nets ≥ parity, and place the AC2 behavioral test in the existing `work.test.ts` provenance describe block (rename it away from "strict").
