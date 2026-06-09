# Verify Report: Rename `captureGate` → `testEvidenceGate` (clean rename, no back-compat)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-08
**Spec:** .ana/plans/active/rename-capturegate-testevidencegate/spec.md
**Branch:** feature/rename-capturegate-testevidencegate

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../rename-capturegate-testevidencegate/contract.yaml
  Seal: INTACT (hash sha256:ba2d93a9959fd23175fbbd6291b6a8beb669aaaa7a44b974799fb30f0fe44c74)
```

Seal status: **INTACT** — contract unmodified since AnaPlan sealed it.

**Build:** PASS (`pnpm run build` — 2 tasks successful, turbo).
**Tests:** 3587 passed, 0 failed, 2 skipped (3589 total — matches baseline 3589). Sealed verify-stage marker:
`<!-- ana:capture stage=verify slug=rename-capturegate-testevidencegate counts=3587p/0f/2s verdict=pass sha256=b24f487ad70f3ce219462049ac2374a960455d38ca568cbc654dbdb23b366c0e -->`
**Lint:** PASS (0 errors). 1 warning — an unused eslint-disable in `git-operations.ts`, a file NOT in this change's diff (pre-existing, not a regression).

## Contract Compliance

| ID   | Says                                                          | Status        | Evidence |
|------|--------------------------------------------------------------|---------------|----------|
| A001 | New projects turn the gate on under its new name             | ✅ SATISFIED  | `tests/commands/init.test.ts` (`@ana A010, A001`) — `createAnaJson(...)` then asserts `config['testEvidenceGate']).toBe('on')` AND `written.testEvidenceGate).toBe('on')`. Source: `state.ts:572` emits `testEvidenceGate: 'on'`. |
| A002 | Gate on + resolvable test command → enabled (true)           | ✅ SATISFIED  | `tests/commands/artifact.test.ts` (two `@ana A002` tests) — surface-only and top-level test commands each → `isTestEvidenceGateEnabled(...)).toBe(true)`. |
| A003 | Gate off → not enabled (false)                               | ✅ SATISFIED  | `tests/commands/artifact.test.ts` (`@ana A003`) — `{ testEvidenceGate: 'off', commands.test }` → `.toBe(false)`. |
| A004 | Absent gate setting treated as off (false)                  | ✅ SATISFIED  | `tests/commands/artifact.test.ts` (`@ana A004`) — missing/malformed ana.json → `.toBe(false)`, never throws. Exact "valid config, flag absent + resolvable command → false" fail-safe additionally covered (untagged) in `init.test.ts:868`. |
| A005 | Block message names the testEvidenceGate setting             | ✅ SATISFIED  | `tests/commands/artifact.test.ts` (`@ana A005`) — drives `saveArtifact` through the block path, captures stderr, asserts `message).toContain('testEvidenceGate')`. Source: `artifact.ts:868` escape-hatch line renamed. |
| A006 | Setting the flag is recognized without a warning            | ✅ SATISFIED  | `tests/commands/config.test.ts` (`@ana A006`) — `config set testEvidenceGate off` → output does NOT contain 'not a known ana.json field'. Source: `config.ts:60` KNOWN_FIELDS has `testEvidenceGate` (replaced, not added). |
| A007 | Config files can carry the setting under the new name        | ✅ SATISFIED  | `tests/commands/init/anaJsonSchema.test.ts` (`@ana A007`) — `AnaJsonSchema.parse({ testEvidenceGate: 'on' }).testEvidenceGate).toBe('on')`. Source: `anaJsonSchema.ts:105` field renamed, shape preserved. |
| A008 | Doctor reports gate state from the new key                   | ✅ SATISFIED  | `tests/commands/doctor.test.ts` (`@ana A006, A008`) — `{ testEvidenceGate: 'on' }` → `test_evidence_gate).toBe('on')` (≠ 'off'). Source: `doctor.ts:462` raw read renamed. |
| A009 | Legacy flag name gone from source                            | ✅ SATISFIED  | Verify-run sweep: `grep -rniE "captureGate" packages/cli/src website/content .ana/ana.json` → **zero hits** (exit 1). Also zero in `packages/cli/tests`. |
| A010 | No legacy gate symbol remains in source                      | ✅ SATISFIED  | Same case-insensitive sweep covers `CaptureGate` → zero hits. Boundary symbols intact: CaptureMarker=6, parseMarkers=2, validateCapturePresent=2, processCapture=22 (all non-zero). |

All 10 assertions SATISFIED.

## Independent Findings

Predictions before reading the implementation, resolved against the diff:

1. *Predicted the C9 reassurance line ("`ana test` seals a harmless abstain") would be dropped in the rename.* **Not found** — `artifact.ts` keeps the line verbatim; only the flag references around it changed.
2. *Predicted the `forensics.ts` comment-only JSDoc would be missed.* **Not found** — `forensics.ts:252` updated to `isTestEvidenceGateEnabled`.
3. *Predicted an unplanned migration/fallback block in `state.ts`.* **Not found** — `testEvidenceGate` rides along in `...parsed.data`, no convergence step, exactly as `captureGate` was treated. No back-compat code anywhere (no fallback read, no dual KNOWN_FIELDS entry, no legacy schema field).
4. *Predicted doctor's protected `test_evidence_gate` dimension field / local var would be touched.* **Not found** — only the raw flag read (`:462`) and the imported reader name/JSDoc changed; the dimension field and var (from the predecessor scope) are untouched.
5. *Predicted weak/sentinel test assertions.* **Not found** — assertions are specific-value (`.toBe('on')`, `.toBe(true/false)`, `.toContain('testEvidenceGate')`), contract-aligned with each matcher/value. The block-message test exercises the real `process.exit` path.

**Surprised (not predicted):** residual *prose* uses of "capture gate" (the concept, lowercase, with a space) survive in 4 comment/JSDoc spots — `capture-marker.ts:249` and `artifact.ts:1041,1073,1495`. These are invisible to A009/A010 (which match the `captureGate` symbol) and violate no assertion, but the spec framed this as a "clean, total rename" of the *policy concept*, now named "test-evidence gate." Low-severity doc debt — see Findings.

**Over-building / YAGNI:** none. The diff is a pure surface-area-neutral rename — no new exports, no new abstractions, no widened API. The earlier-planned `readTestEvidenceGateFlag` resolver was correctly NOT added (the spec reversed that decision once the fallback was gone; the reader stays a single inline field access). No dead code introduced.

**Proof-context respected:** C9 (reassurance line) and C11 (warning/error partition in `evaluateTestEvidenceGate` — the `warnings.length === 0` arming proxy depends on it) are both preserved through the rename. No regression of either.

## AC Walkthrough

- **AC1** — New projects get `testEvidenceGate: "on"`; `captureGate` never written. ✅ PASS — `state.ts:572`; verified by `init.test.ts` asserting both the returned config and the written file.
- **AC5** — Block message + escape hatch name `testEvidenceGate` (`set "testEvidenceGate": "off"`). ✅ PASS — `artifact.ts:868`; `artifact.test.ts` block-path test asserts `toContain('testEvidenceGate')`.
- **AC6** — `config set testEvidenceGate off` warns nothing; `captureGate` no longer in KNOWN_FIELDS. ✅ PASS — `config.ts:60`; `config.test.ts` confirms no unknown-field warning.
- **AC7** — No `captureGate`/`CaptureGate` in `packages/cli/src`, `website/content`, or `.ana/ana.json`; marker + processCapture symbols unchanged. ✅ PASS — Verify-run sweep zero hits; boundary counts non-zero (6/2/2/22). Tests dir also zero.
- **AC8** — `configurability.mdx` documents `testEvidenceGate`, no legacy note. ✅ PASS — lines 35/74/84/86 use `testEvidenceGate`; no "legacy captureGate" note present.
- **AC9** — Dogfood `.ana/ana.json` uses `testEvidenceGate: "on"`. ✅ PASS — worktree `.ana/ana.json:52`.
- **AC10** — Test count ≥ baseline 3589; new-key behavior tested; no back-compat tests. ✅ PASS — 3589 total (3587 + 2 skipped); enablement on/off/absent + block path + schema + doctor all covered; no fallback/precedence/convergence tests exist.
- **`tsc --noEmit` passes** — ✅ PASS (implied by green build + lint; the symbol rename is type-checked and tests import the renamed symbols successfully).
- **Lint passes** — ✅ PASS — 0 errors (1 pre-existing unrelated warning).

Live run of the changed `doctor` surface: ⚠️ Doctor enforces a "run from main, not a worktree" guard, so I could not invoke it live from the verify worktree. Behavior is covered by `doctor.test.ts` enforcement tests (A008) which drive `assessEnforcement` against `testEvidenceGate` fixtures and pass. Not a gap in the change — a property of where verification runs.

## Blockers

None. Specifically searched for and did not find:
- **Incomplete rename** — case-insensitive sweep of src + docs + dogfood + tests returns zero `captureGate`/`CaptureGate`; the only residue is concept *prose* ("capture gate" with a space), which breaks no assertion.
- **Broken boundary** — marker mechanism symbols (`CaptureMarker`, `parseMarkers`, `validateCapturePresent`) and `processCapture*` counts are non-zero and untouched in the diff.
- **Back-compat creep** — no fallback read, no migration block, no dual KNOWN_FIELDS entry (the spec's central constraint, held).
- **Dropped proof findings** — C9 reassurance line and C11 warn/error partition both preserved.
- **Weak assertions / regressions** — assertions are specific-value and contract-aligned; full suite green at baseline count.

## Findings

- **Code — Residual prose "capture gate" survives the total rename:** `packages/cli/src/utils/capture-marker.ts:249` (`@param opts.enabled - Whether the capture gate is enabled...`) and `packages/cli/src/commands/artifact.ts:1041,1073,1495` still name the policy "the capture gate" in comments. These are the concept, not the `captureGate` symbol — invisible to A009/A010 and to the docs/dogfood sweep — so no assertion fails. But the spec's stated intent was a *total* rename of the gate concept to "test-evidence gate." Doc debt only; the next reader sees mixed vocabulary for one concept. (`acknowledge`)
- **Test — `capture-marker.test.ts` edited outside the contract's planned file list:** `packages/cli/tests/utils/capture-marker.test.ts:12` swaps `evaluateCaptureGate` → `evaluateTestEvidenceGate` and renames a describe block. This file is not in `contract.yaml` `file_changes`, but the edit is the unavoidable consequence of renaming the *exported* evaluator + result type — without it `tsc`/imports would break. Legitimate, not scope creep; flagged only because the planned file list didn't anticipate it. (`acknowledge`)
- **Test — A004's tagged test is the missing/malformed case, not the exact absent-flag case:** `packages/cli/tests/commands/artifact.test.ts:513` tags `@ana A004` on a missing/malformed-`ana.json` test (returns false). The precise "valid config, flag absent, resolvable command → still false" fail-safe is the stronger case and is covered — but untagged — at `init.test.ts:868`. Coverage is genuinely strong; only the tag placement is imprecise. (`monitor`)
- **Test — `@ana A006` tag collision across contracts:** `packages/cli/tests/commands/doctor.test.ts:630` carries `@ana A006, A008`, where A006 belongs to a *predecessor* contract (this contract's A006 is the KNOWN_FIELDS assertion, owned by `config.test.ts`). Tags are not globally unique in this repo, so this is harmless mechanically, but it weakens tag-based traceability — a global `grep "@ana A006"` returns cross-contract noise. (`monitor`)
- **Code — Pre-existing lint warning surfaced by the full run:** `packages/cli/src/utils/git-operations.ts:198` — unused `eslint-disable` for `no-control-regex`. The file is NOT in this change's diff, so the warning predates this build; recording it so it isn't mistaken for a regression introduced here. (`monitor`)

## Deployer Handoff

This is a clean, no-back-compat rename of the `ana.json` flag `captureGate` → `testEvidenceGate` and its policy symbols (`isTestEvidenceGateEnabled`, `applyTestEvidenceGate`, `evaluateTestEvidenceGate`, `TestEvidenceGateResult`). The marker mechanism and `processCapture*` subsystem are deliberately untouched.

- **No migration ships.** `captureGate` was introduced after `v1.2.2` and never published, so there is zero install base. An existing local `.ana/ana.json` that still carries `captureGate` (e.g. the *main-tree* dogfood config, until this merges) will read as **gate-off** after upgrade — the old key is no longer recognized. That is intended per spec, but worth knowing: any developer with a hand-set `captureGate` must re-set `testEvidenceGate`.
- The verify-stage test re-run is sealed in the marker above (3587p/0f/2s, verdict pass).
- Findings are all low-severity doc/test-hygiene observations; none block merge.

## Verdict

**Shippable:** YES

All 10 contract assertions SATISFIED, all acceptance criteria PASS, build/lint clean, test suite green at baseline count (3589), the rename boundary held (marker + processCapture symbols intact), and the two governing proof findings (C9, C11) were preserved. The only findings are low-severity documentation and test-tag hygiene — none affect behavior. I'd stake my name on this shipping.
