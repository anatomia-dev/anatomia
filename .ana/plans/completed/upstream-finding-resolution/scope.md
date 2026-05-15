# Scope: Upstream Finding Resolution

**Created by:** Ana
**Date:** 2026-05-15

## Intent

When Verify runs `ana proof context` and sees active findings for files it's reviewing, it can note that a finding has been resolved by the current build. These observations enter the proof chain as upstream findings with `status: 'lesson'`. But the original finding stays active because nothing connects the upstream claim to the original. Learn must manually read the upstream finding's prose, identify which original it references, verify the claim, and close it with `ana proof close`.

The user wants structured resolution claims so the system can surface Verify's conclusions without manual cross-referencing, while keeping humans in the loop for the actual closure decision.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — 5 targeted changes across existing code paths, no new subsystems
- **Files affected:**
  - `src/commands/proof.ts` — `formatContextResult` display (piece 1), `computeStaleness` display or new stale section (piece 4)
  - `src/commands/artifact.ts` — `validateVerifyDataFormat` schema validation (piece 2)
  - `src/commands/work.ts` — upstream finding processing at lines 926-932 (piece 3)
  - `src/utils/proofSummary.ts` — `computeStaleness` if stale integration lives here (piece 4)
  - `src/types/proof.ts` — finding type extension for `resolves` (pieces 2-3)
  - `templates/.claude/agents/ana-verify.md` — staleness awareness instruction, template for new users (piece 5)
  - `.claude/agents/ana-verify.md` — staleness awareness instruction, dogfood instance our pipeline reads (piece 5)
- **Blast radius:** Low. All changes are additive — existing fields untouched, existing behavior preserved. `resolves` is optional. proof context format change adds information without removing any. Verify agent definition change is instruction text, not code.
- **Estimated effort:** 1 pipeline run
- **Multi-phase:** no

## Approach

Close the gap between Verify's resolution observations and the proof chain's finding lifecycle by making three things happen that currently don't:

1. **Show Verify what it needs to reference.** `ana proof context` human-readable output currently omits finding IDs. Add them so Verify can cite specific findings.

2. **Give Verify a structured way to make claims.** Add an optional `resolves` field to the verify_data.yaml schema for upstream findings. Verify populates it with finding IDs from proof context.

3. **Surface claims without auto-acting.** `work complete` records the link. `ana proof stale` surfaces unresolved claims. Humans or Learn close with evidence already assembled.

This is the "structured claims without auto-close" approach. It separates signal from action, consistent with "verified over trusted" — Verify provides structured evidence, the system surfaces it, a human or Learn acts.

## Acceptance Criteria

- AC1: `ana proof context {file}` human-readable output includes the finding ID for each finding (e.g., `[code] (proof-intelligence-hardening-C13) Lesson command catch block...`)
- AC2: `verify_data.yaml` accepts an optional `resolves` field (array of strings) on upstream-category findings. Validation passes when present with valid finding IDs, passes when absent, errors when present with wrong type.
- AC3: `resolves` field on non-upstream findings produces a validation warning (not error — don't block saves, but it's likely a mistake)
- AC4: `work complete` processing: when an upstream finding has a `resolves` array, the proof chain entry preserves the field on the finding object. No auto-close of referenced findings.
- AC5: `work complete` emits a summary line when upstream findings contain `resolves` claims (e.g., "Verify claims N findings resolved — review with `ana proof stale`")
- AC6: `ana proof stale` includes a new section: "Verify resolution claims" — listing upstream findings with `resolves` fields whose referenced finding IDs are still active. Shows the upstream claim summary and the original finding ID.
- AC7: `ana proof stale` resolution claims section is empty (not shown) when no unresolved claims exist
- AC8: ana-verify.md staleness awareness instruction tells Verify to: use finding IDs from proof context output, populate the `resolves` field in verify_data.yaml for upstream findings, include the original finding ID (not just the description). Applied to BOTH `templates/.claude/agents/ana-verify.md` (template for new users) and `.claude/agents/ana-verify.md` (dogfood instance our pipeline reads). Agent definitions aren't overwritten on re-init, so both files must be updated explicitly.
- AC9: Existing upstream findings without `resolves` field continue to work — no migration needed, no breakage of existing proof chain entries
- AC10: All new behavior has test coverage

## Edge Cases & Risks

- **Verify references a finding ID that doesn't exist in the chain.** `resolves` field should be treated as claims, not validated against the chain at save time — Verify might misspell an ID or reference a finding that was closed between proof context read and verify save. `ana proof stale` should silently skip non-existent IDs.
- **Verify references a finding that's already closed.** `ana proof stale` should skip these (already resolved). Not an error.
- **Multiple upstream findings claim to resolve the same original.** Valid — different builds might each partially address the same finding. `ana proof stale` should deduplicate, showing the most recent claim.
- **`resolves` on a non-upstream finding.** Warn during validation but don't block. The field is semantically meaningful only on upstream findings, but blocking would be too aggressive.
- **Backward compatibility.** Old proof chain entries lack `resolves`. Old verify_data files lack it. Both must continue working without modification.
- **proof context format change.** Adding IDs to the display changes what agents parse. Verify's instruction update (piece 5) handles this. Other agents that read proof context (Learn reads it too) benefit from seeing IDs.

## Rejected Approaches

**Option A — Auto-close on work complete.** Verify's resolution claims are AI judgment, not mechanical verification. Auto-closing based on judgment violates "verified over trusted." A wrongly-closed finding becomes invisible to proof context, staleness, and audit. There's no reopen mechanism. The failure is silent. We can earn auto-close trust later by tracking Verify's accuracy on resolution claims — this scope creates the data to make that possible.

**Option B — Better Verify prose instructions only.** Scaffolding. Verify can't see finding IDs in proof context output (the root blocker), so instructions to "include the finding ID" force Verify to grep proof_chain.json manually. Fragile, no mechanical guarantee, adds cognitive load. Addresses the symptom without fixing the information flow.

**Option E — Pattern-match existing upstream summaries in `ana proof stale`.** Tempting because it requires no schema change. But text-matching against free-form summaries is inherently brittle — the analysis above shows automated matching can't reliably connect upstream claims to originals. Creates a fragile heuristic instead of a clean data path.

## Open Questions

- Should the `resolves` field be validated against actual finding ID format (e.g., `{slug}-C{N}`)? Lightweight format check vs. pure passthrough. AnaPlan should decide based on implementation cost.

## Exploration Findings

### Patterns Discovered
- `formatContextResult` (proof.ts:2280-2320): Finding display format is `[category] anchor — summary` with `From: feature` on next line. Finding ID is available in the data (`finding.id`) but not rendered.
- `validateVerifyDataFormat` (artifact.ts:827-920): Validates category, summary, severity, suggested_action, related_assertions, file. Uses error accumulation pattern. Optional fields use warnings not errors. Clean extension point for `resolves`.
- `computeStaleness` (proofSummary.ts:1124-1200): Returns `StalenessResult` with high/medium confidence tiers. Pure function, no display logic. Display is in proof.ts.
- work.ts:926-932: Simple category check — `upstream` → `lesson`, else `active`. The `resolves` field on the finding object would survive into the proof chain entry as-is if the type allows it.

### Constraints Discovered
- [TYPE-VERIFIED] ProofChainEntry.findings type (proof.ts:67-82) — finding objects have explicit fields; adding `resolves` requires type change
- [OBSERVED] verify_data validation is strict on known fields, silent on unknown fields — YAML parse produces whatever fields exist, validation only checks known ones. `resolves` would pass through even without validation, but explicit validation is better.
- [OBSERVED] `closed_by` discriminator already exists with values `'mechanical' | 'human' | 'agent'` (proof.ts:80) — future auto-close could add `'verify'` here
- [OBSERVED] `ana proof stale` display is in proof.ts, computation in proofSummary.ts — the stale command already formats output with sections, adding a new section follows the existing pattern

### Test Infrastructure
- proof.test.ts — extensive test coverage for proof subcommands including stale, context, close, promote. Test helpers create chain fixtures with findings.
- artifact.test.ts — `validateVerifyDataFormat` has dedicated test blocks with valid/invalid YAML inputs
- work.test.ts — `writeProofChain` / `completeWork` tested with finding status assignment

## For AnaPlan

### Structural Analog
`related_assertions` field on verify_data findings (artifact.ts:894-906). Same pattern: optional array of strings on a finding, validated in `validateVerifyDataFormat`, preserved through to the proof chain entry. `resolves` follows identical validation, type, and passthrough shape.

### Relevant Code Paths
- `formatContextResult` (proof.ts:2280-2320) — where finding IDs need to appear in display
- `validateVerifyDataFormat` (artifact.ts:827-920) — where `resolves` validation goes
- ProofChainEntry.findings type (proof.ts:67-82) — where `resolves` type goes
- work.ts:926-932 — where upstream finding processing happens (passthrough, no new logic needed if type allows it)
- `computeStaleness` (proofSummary.ts:1124-1200) — where resolution claims analysis may live
- stale display in proof.ts — where the new "Verify resolution claims" section renders
- `templates/.claude/agents/ana-verify.md`:98-102 — template staleness awareness instruction
- `.claude/agents/ana-verify.md` — dogfood instance, same instruction block (line numbers may differ)

### Patterns to Follow
- `related_assertions` validation in artifact.ts:894-906 — same optional-array-of-strings pattern
- Error accumulation in `validateVerifyDataFormat` — push to arrays, return at end
- `StalenessResult` type structure — if resolution claims need their own type, follow the same shape
- Stale display sections in proof.ts — follow existing section/subsection formatting

### Known Gotchas
- The finding type in proof.ts has a CROSS-CUTTING warning (lines 16-21): adding a field requires changes in 4+ locations. `resolves` touches: type definition, verify_data validation, proof chain entry construction (passthrough), and display.
- proof context human-readable format is consumed by both Verify and Learn agents. The format change (adding IDs) must not break their parsing. IDs should be visually distinct (parenthesized) to separate from existing anchor/summary text.
- `computeStaleness` is a pure function — any resolution claims analysis should follow the same pattern (pure, synchronous, caller handles I/O).

### Things to Investigate
- The stale command display code in proof.ts — determine exact insertion point for the "Verify resolution claims" section relative to existing high/medium confidence sections
- Whether `StalenessResult` type should be extended with a `resolution_claims` field or whether a separate return type is cleaner
