# Spec: Verdict Honesty — Component 3 (deterministic read-build-report veto)

**Created by:** AnaPlan
**Date:** 2026-06-16
**Scope:** .ana/plans/active/verifier-verdict-honesty/scope.md

## Approach

Make the verdict **trust-the-bytes** for one process claim: if the verify session deterministically read `build_report.md`, force-FAIL the proof regardless of the prose headline. anatrace-core already judges this from the transcript; today the verdict is stored as EVIDENCE and never gates (`compliance.ts:22-23`). Component 3 flips **that one claim** evidence→gate.

**The go/no-go is resolved — GO.** I ran anatrace-core 0.4.0's `anatomiaAdapter.extract()` + `runCompliance()` against the real (and Spec-1-de-contradicted) `ana-verify.md`. The build-report prohibition is gate-eligible and the verdict is deterministic. **The corrected engine facts below supersede the scope's type-def guesses — use these, not the scope's `forbidden`/`predicate-matched` framing.**

**Verified engine facts (anatrace-core 0.4.0, run empirically):**
- The prohibition emits as a **stable claim** with id **`ana-verify:verify-independence`** — *identical before and after Spec 1's edit* (Spec 1 does not change the id; the allowlist is safe).
- Its predicate is `{ target: 'read-paths', scope: 'transcript', matcher: 'not_contains', value: 'build_report' }`. The engine models the prohibition via **`matcher: not_contains`**, NOT `strength: 'forbidden'`.
- When the verify session reads `build_report.md`: the verdict is `{ status: 'violated', reason: 'predicate-not-matched', source: 'deterministic' }`.
- `ComplianceVerdict.source` is the type-disjoint determinism channel (`'deterministic'`), separate from the `'llm'` judge channel. **Gate on `source`, NOT on `reason`** — `reason` is the drift-prone vocabulary item `anatrace-pin-0-4-0` is locking; `source` is stable.
- The `read-paths` projection binds only to `Read` tool `file_path` (precision 1.0 on the engine's corpus) — Grep/Glob/Bash substrings do NOT count as a read. No false positives from diff-scoping commands.

**Gate predicate (the whole of Component 3):** force-FAIL iff an assembled compliance verdict satisfies **all four**:
`role === 'verify'` ∧ `claim_id === 'ana-verify:verify-independence'` ∧ `status === 'violated'` ∧ `source === 'deterministic'`.

**Forward-only, fail-open-but-surfaced** (decisions #3, #4):
- The persisted record does not store `source` today — add it. **Old records lack `source` → treated as non-gating** (forward-only; no historical re-judging).
- No verify compliance record (capture off, or pre-veto session) → **no veto → fall back to Spec 1's consistency-checked headline.** Never a silent skip: the proof must state `verdict veto: not applied — no captured transcript`.
- One honesty-boundary line on the proof/card: the veto is forward-only; pre-veto verdicts were self-reported; publishing a pass-rate is gated on the forward-vs-historical framing (owned outside the pipeline). **No assertion, no code beyond the line.**

**Sequencing:** Build after `anatrace-pin-0-4-0` has merged to main (it has — `package.json` pins `0.4.0`, and `forensics.ts`/`compliance.ts` already import it). Run `pnpm install` so the engine is in `node_modules` before building. Depends on Spec 1 (the de-contradicted agent-def).

## Output Mockups

**Veto trips — `ana work complete` blocked (headline said PASS):**
```
Error: Cannot complete work with a FAIL verification result.
Deterministic veto: the verify session read build_report.md.
  claim ana-verify:verify-independence — violated (source: deterministic)
Verify must not read the build report. The PASS headline is overridden.
```

**Proof card — Session Attestation, veto applied:**
```
  verify · 5 claims   ✓ 2 satisfied · 1 violated · 2 unverifiable
        ⚠ ana-verify:verify-independence  violated (predicate-not-matched)
  ⛔ verdict veto: APPLIED — verify read build_report.md (forward-only)
```

**Proof card — veto not applicable (capture off / no transcript):**
```
  verdict veto: not applied — no captured transcript
```

**Honesty-boundary line (rendered once on the proof/card):**
```
  veto is forward-only; pre-veto verdicts were self-reported.
```

## File Changes

> Re-derive all line numbers at build time — `compliance.ts`, `work-proof.ts`, and `proof.ts` are all recently churned by the anatrace/session-capture work.

### packages/cli/src/types/proof.ts (modify)
**What changes:** (1) Add `source` to `ComplianceVerdictRecord` (`:188`) — `source?: 'deterministic' | 'llm' | (string & {})` to mirror the engine's disjoint channel while staying forward-compatible (follow the existing `reason: VerdictReason | (string & {})` pattern at `:201`). Optional so old records (no `source`) deserialize and read as non-gating. (2) Add a veto-status field to the proof-chain entry type, e.g. `verdict_veto?: { applied: boolean; reason?: string }`.
**Why:** The gate reads `source`; the proof must record whether the veto fired (applied / not-applied-no-transcript).

### packages/cli/src/utils/compliance.ts (modify)
**What changes:** (1) `projectVerdicts` (`:78`) — thread `v.source` through: add `source` to the input verdict shape and onto the projected `ComplianceVerdictRecord` (additive, on top of anatrace-pin's locked record). (2) Update the module docstring (`:22-23`) — it currently asserts "EVIDENCE, never a gate" unconditionally; that is now **false for one claim**. Rewrite to: "EVIDENCE, except the allowlisted `ana-verify:verify-independence` verdict, which gates the proof when `violated` + `source: deterministic` (Component 3 / verifier-verdict-honesty). All other verdicts remain non-gating evidence."
**Why:** Persist the determinism signal; stop the docstring from lying about the new gate.

### packages/cli/src/utils/verdict.ts (modify — created in Spec 1)
**What changes:** Add the gate evaluator, e.g. `evaluateReadBuildReportVeto(compliance: ComplianceAttestation[]): { applied: boolean; reason?: string }`. Returns `applied: true` with a reason when any record matches the four-part predicate; otherwise `applied: false`. Export the allowlisted claim id as a named constant `VERIFY_INDEPENDENCE_CLAIM_ID = 'ana-verify:verify-independence'` with a comment citing the empirical source.
**Pattern to follow:** keep it pure (records in → decision out), like `deriveVerdict`. No I/O.
**Why:** Single home for verdict logic; testable in isolation.

### packages/cli/src/commands/work-proof.ts (modify) — THE load-bearing change
**What changes:** Wire the veto into `writeProofChain` so it gates **before the proof entry is written**. Current ordering is the trap:
- `guardFailResult(proof.result)` runs at `~:290`.
- `assembleComplianceAttestations(...)` runs LATER at `~:337-342`.

**The veto needs the compliance records, so you MUST reorder:** assemble (or read) the verify compliance attestations *before* the verdict guard, evaluate `evaluateReadBuildReportVeto`, and when `applied`, force-FAIL — either by setting an effective FAIL result fed to `guardFailResult`, or a dedicated veto guard that prints the veto message (Output Mockups) and `process.exit(1)` exactly like `guardFailResult`. Record the outcome on the entry (`verdict_veto`). When no verify record exists, set `verdict_veto: { applied: false, reason: 'no captured transcript' }` and proceed with the headline.
**Verify explicitly at build time** that the veto evaluation sits *upstream* of the proof-chain write and the FAIL guard — this is the one place Component 3 can go subtly wrong (a veto computed after the entry is written gates nothing).
**Why:** A deterministic `violated` must override a PASS headline; that override must happen at the seal decision.

### packages/cli/src/commands/proof.ts (modify)
**What changes:** `renderSessionAttestation` (`:574`) and its surrounding "evidence, never a gate" copy (`:565-567`, `:607`, `:637`) — update so the one gating claim is no longer described as never-gating. Render the veto status line (APPLIED / not applied — no captured transcript) and the one-line honesty boundary. Keep all *other* verdicts rendered as non-gating evidence (unchanged).
**Why:** The card currently tells the user verdicts never gate — false for this one claim. Decisions #3/#4 require the veto status and boundary to be visible.

## Acceptance Criteria

- [ ] **AC1 (carried — from scope AC6):** A verify compliance verdict with `claim_id === 'ana-verify:verify-independence'` ∧ `status === 'violated'` ∧ `source === 'deterministic'` ∧ `role === 'verify'` force-FAILs the proof regardless of the headline. The veto applies forward-only.
- [ ] **AC2 (scope AC7):** `unverifiable`, `satisfied`, non-`verify` roles, non-allowlisted claim ids, and any verdict with `source !== 'deterministic'` (e.g. `'llm'` or absent) do NOT gate — the veto fires on exactly one claim under exactly the four conditions.
- [ ] **AC3:** `source` is persisted on `ComplianceVerdictRecord` via `projectVerdicts`. Records written before this change (no `source`) deserialize and are treated as non-gating (forward-only).
- [ ] **AC4 (decision #3):** With capture off or no verify record, no veto fires, the headline (Spec-1 consistency-checked) stands, and the proof states `verdict veto: not applied — no captured transcript` — never a silent skip.
- [ ] **AC5:** The veto evaluation runs upstream of the proof-chain write and the FAIL guard (the reorder is correct — verified by a test where a build-report-read fixture blocks completion).
- [ ] **AC6:** The `compliance.ts` docstring and `proof.ts` attestation copy no longer claim verdicts "never gate" unconditionally; they name the one gating claim. The forward-only honesty-boundary line renders once.
- [ ] **AC7 (decision #4):** No pass-rate / green-rate number or assertion is added anywhere — only the one honesty-boundary line.
- [ ] **AC8:** Codex parity — the veto path works for both harnesses (`compliance.ts` already branches on harness; the claim id is harness-independent). A codex fixture exercises the gate.
- [ ] **AC9:** `pnpm run test -- --run` green, no regressions; lint clean.

## Testing Strategy

- **Unit (`tests/utils/verdict.test.ts`, extend):** `evaluateReadBuildReportVeto` truth table — all four conditions met → applied; flip each one (status `satisfied`; `source` absent/`'llm'`; claim id other; role `build`) → not applied. No record → `{ applied: false, reason: 'no captured transcript' }`.
- **Projection (`tests/utils/compliance.test.ts`, extend):** `projectVerdicts` carries `source` onto the record; a verdict without `source` projects to a record without `source`.
- **Integration (`tests/commands/` or `tests/utils/compliance.test.ts`):** synthesize a minimal verify transcript with a `Read{file_path: …/build_report.md}` event → through `parseSession` + `anatomiaAdapter.extract` + `runCompliance` → assemble → veto applied → `work complete` path blocks (force-FAIL) even with a PASS headline. Mirror the harness in `tests/utils/compliance.test.ts` (present once anatrace-pin is installed). Run the equivalent for a codex transcript (AC8).
- **Display (`tests/commands/proof-compliance-display.test.ts`, extend):** veto APPLIED renders the override line; veto not-applicable renders `not applied — no captured transcript`; the honesty-boundary line renders once.
- **Edge cases:** a verify session that reads build_report via Bash/Grep (NOT the `Read` tool) → engine does NOT mark violated → no veto (no false positive); multiple verify sessions (rework) where one read the report → veto applies.

## Dependencies

- Spec 1 merged (de-contradicted `ana-verify.md`, `verdict.ts` exists).
- `anatrace-core@0.4.0` installed (`pnpm install`) — it is already pinned and imported in `compliance.ts`/`forensics.ts`.

## Constraints

- Gate on `source === 'deterministic'`, never on `reason` (vocabulary drift).
- Forward-only: never re-judge historical proofs; missing `source` is non-gating.
- Fail-open but surfaced: absence of evidence never blocks completion, but is always stated.
- The four-part predicate is exact — widening (more claims, other roles) is explicitly out of scope (scope Rejected Approaches: Fork A).

## Gotchas

- **The reorder is the risk.** `assembleComplianceAttestations` runs *after* `guardFailResult` today. Move the veto evaluation upstream of both the FAIL guard and the proof-chain write, or it gates nothing. Verify by reading the live `writeProofChain` ordering at build time (`~:290` guard vs `~:337` assembly — re-derive).
- `compliance.ts:22-23` and `proof.ts` copy currently assert "never a gate" — both become false; update or AnaVerify will (correctly) flag a doc-vs-behavior contradiction.
- Capture is `processCapture: on` in `ana.json`, but tests and some installs run with it off — the no-record path (AC4) must be exercised, not assumed.
- `source` may be absent on the engine verdict in unforeseen channels — treat absent `source` as non-deterministic (non-gating), never as a default-gate.
- The claim id `ana-verify:verify-independence` is derived by the adapter from the agent-def; it is stable across Spec 1's edit (verified) but is engine-owned — if a future anatrace bump changes it, the allowlist constant must move with it (cite the empirical check in the constant's comment so the dependency is discoverable).

## Build Brief

### Rules That Apply
- `.js` import extensions; `import type` for types; named exports; explicit return types; JSDoc on exports.
- `utils/` is a leaf — `verdict.ts` and `compliance.ts` never import from `commands/`.
- `| null` vs `?:` convention (proof.ts) — `source` is `?:` (may be absent on old records), not `| null`.
- Additive-only on the locked record (`anatrace-pin-0-4-0` locked the verdict reason set + record shape) — add `source`, don't restructure.

### Pattern Extracts

The projection to extend — `compliance.ts:78-101` (`projectVerdicts`): thread `source` through the input shape and onto the returned record alongside `status`/`reason`.

The "evidence, never a gate" contract being flipped — `compliance.ts:22-23`:
```
 * The record is EVIDENCE, never a gate: a `violated` verdict is stored and
 * rendered but never changes a proof's PASS/FAIL.
```

The guard the veto converges with — `work-proof.ts:193-201` (`guardFailResult`, shown in Spec 1). The veto either feeds an effective FAIL into this, or mirrors its print-and-exit shape.

The assembly call to relocate above the guard — `work-proof.ts:341-342`:
```ts
  const compliance = isProcessCaptureEnabled(projectRoot)
    ? assembleComplianceAttestations(projectRoot, slug)
```

The empirically-verified verdict the gate keys on (from running 0.4.0):
```json
{"claimId":"ana-verify:verify-independence","status":"violated","reason":"predicate-not-matched","source":"deterministic"}
```

### Proof Context
Run `ana proof context` for `compliance.ts`, `work-proof.ts`, `proof.ts`, `verdict.ts` at build time and surface active findings (especially any on the seal/compliance path).

### Checkpoint Commands
- After `pnpm install` (engine present): `(cd packages/cli && pnpm vitest run tests/utils/compliance.test.ts)` — Expected: existing compliance tests green.
- After `projectVerdicts` + types: `(cd packages/cli && pnpm vitest run tests/utils)` — Expected: source projection + veto table green.
- After `work-proof.ts` reorder: `(cd packages/cli && pnpm vitest run tests/commands)` — Expected: integration veto-blocks-completion green.
- After all: `pnpm run test -- --run` — Expected: full suite green; lint `pnpm run lint`.

### Build Baseline
Run `pnpm run test -- --run` after Spec 1 lands and record counts before starting Spec 2.
- Current tests: {fill from terminal, post-Spec-1}
- Current test files: {fill from terminal}
- Command used: `pnpm run test -- --run`
- After build: expected current + veto/projection/integration/display cases.
- Regression focus: `compliance.ts` capture+assembly, `work-proof.ts` seal path, `proof.ts` attestation rendering.
