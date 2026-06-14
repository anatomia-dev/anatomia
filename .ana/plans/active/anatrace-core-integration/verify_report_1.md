# Verify Report: anatrace-core integration — Phase 1 (Provenance swap)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-13
**Spec:** .ana/plans/active/anatrace-core-integration/spec-1.md
**Branch:** feature/anatrace-core-integration

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/anatrace-core-integration/contract.yaml
  Seal: INTACT (hash sha256:59f34b384715784b106096d04f61bbc891730e7c3c21ea3212ecc041baa263a4)
```

Seal **INTACT** — contract unmodified since AnaPlan sealed it.

**Verify-stage sealed test run (independent re-run):**
<!-- ana:capture stage=verify slug=anatrace-core-integration counts=3704p/0f/2s verdict=pass sha256=45aa8fb976f6005da25673e532285116a3f75c2fdfc770fa47d48b0443a52ac6 -->

- **Tests:** 3704 passed, 0 failed, 2 skipped (baseline 3700 passed / 2 skipped → +4, no decrease).
- **Build:** `pnpm run build` — typecheck clean, tsup ESM success, `anatrace-core` resolves from the registry (no local link).
- **Lint:** `pnpm run lint` — 0 errors, 1 warning. The warning is `git-operations.ts:198` (unused eslint-disable), a file NOT in this diff → pre-existing, not a regression.

**Scope note:** This is Phase 1 of a 2-phase plan. Contract assertions **A001–A012** are Phase 1 (Provenance swap). A013–A026 (Phase 2a/2b behavioral attestation) are out of scope and verified against their own spec later.

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Provenance counts come from a pinned anatrace engine | ✅ SATISFIED | `package.json:59` `"anatrace-core": "0.2.0"` (exact, no caret). `tests/commands/_capture.test.ts:220` `@ana A001` asserts `toBe('0.2.0')`. Installed pkg confirmed `0.2.0`. |
| A002 | Anatomia no longer hand-parses transcripts | ✅ SATISFIED | Source inspection: `grep` of `forensics.ts` finds no `function deriveClaude`/`deriveCodex`/`readTranscriptLines`/`parseTestCounts`/`durationFromTimestamps`/`toolResultText` — all deleted; derive delegated to `parseSession`+`deriveCounts`. |
| A003 | Each record states its engine derive version | ✅ SATISFIED | `tests/utils/forensics-derive.test.ts:207,265` `@ana A003` assert `derive_version === '3'` (Claude+Codex); `forensics.test.ts:222` asserts `prov.derived.derive_version === '3'` on a committed record. |
| A004 | Deriving the same session twice is identical | ✅ SATISFIED | `forensics-derive.test.ts:213,295` `@ana A004` assert `JSON.stringify` equality across two derives (Claude+Codex). |
| A005 | Captured session records a transcript fingerprint | ✅ SATISFIED | `forensics.test.ts:218` `@ana A005` asserts `prov.transcript_hash === sha256OfFile(transcript)` + `/^sha256:[0-9a-f]{64}$/`; `:260` asserts it is omitted when unreadable. |
| A006 | Unreadable transcript still records who ran | ✅ SATISFIED | `forensics.test.ts:262` `@ana A006` — unreadable path still writes file with `session_id === 'sess-1'`, `derived`/`transcript_hash` both undefined. |
| A007 | Older proof records still load | ✅ SATISFIED | `tests/commands/work-proof-process.test.ts:151` `@ana A007` writes a legacy record (no `derive_version`/`transcript_hash`), `assembleProcessAttestation` reads it intact (`session_id`, `tokens.input === 900`). |
| A008 | Codex reports files it changed | ✅ SATISFIED | `forensics-derive.test.ts:291` `@ana A008` — rewritten Codex fixture carries a real `patch_apply_end` body; asserts `files_touched` `toBeGreaterThan(0)` **and** `toBe(1)`. |
| A009 | Raw transcript text never leaks into a record | ✅ SATISFIED | `forensics-derive.test.ts:246,304` `@ana A009` assert `SECRET_TRANSCRIPT_BODY_DO_NOT_PERSIST` absent; `forensics.test.ts:230` asserts the committed JSON contains no body. Sentinel matches contract value exactly. |
| A010 | Unpriced model shown as unpriced, never guessed | ✅ SATISFIED | `tests/data/pricing.test.ts:57` `@ana A010` — unknown model → `priced === false`, `cost_usd === 0`, version still stamped. |
| A011 | Displayed price-table version = the one used | ✅ SATISFIED | `pricing.test.ts:88` `@ana A011` asserts `PRICE_TABLE_VERSION === '2026-06-08'`; `proof.ts:301` now sources the label from `c.price_table_version` (the `CostResult`), confirmed by golden snapshot `(table 2026-06-08)`. |
| A012 | Engine adds no network capability | ✅ SATISFIED | `_capture.test.ts:223` `@ana A012` asserts installed `anatrace-core` runtime deps ⊆ `{ yaml }`. Verified directly: installed `0.2.0` `dependencies = { "yaml": "^2.8.1" }`. |

All 12 Phase-1 assertions **SATISFIED**.

## Independent Findings

I predicted, before reading source, that the builder would likely (1) accidentally delete the shared `readString` helper, (2) misplace `transcript_hash` inside `derived` or compute it on the unreadable path, (3) ship a fake Codex `apply_patch` fixture or a weak `>0`-only assertion, (4) miss one of the two `computeCost` call sites, and (5) add a new zero-importer export. **All five were wrong** — the build is disciplined:

- `readString` correctly retained (still used by `readPendingPointer`/`parseHookPayload`); `readNumber`/`readObject` correctly removed with their only callers.
- `transcript_hash` lives on the `SessionProvenance` wrapper, is computed inside the capture try/catch from the **same bytes** used for the derive, and is omitted (with `derived`) when the transcript is unreadable. A test explicitly asserts `prov.derived.transcript_hash` is `undefined`.
- The Codex fixture carries a genuine `patch_apply_end` change set; the assertion is both contract-aligned (`>0`) and strong (`toBe(1)`).
- Both `computeCost` sites (`proof.ts:292`, `:467`) thread `{ priceTable: PRICES }`.
- No new zero-importer export; the spec-mandated `deriveTranscript` seam is preserved.

**Surprise (not predicted): the golden snapshot changed, and it is the AC6 fix surfacing.** The TOTAL footer now reads `(table 2026-06-08)` instead of the synthetic per-record stamp `(table v3)` — exactly because the display now sources the version from the computed `CostResult` rather than `s.derived.price_table_version`. This is correct and desirable. The side effect: the builder widened two fixtures' `cache_read` inputs (80k→1M, 900k→1M) and shortened a model id (`gpt-5-codex`→`gpt-5`) to keep the card ≤80 columns, which changed the displayed costs in those fixtures ($1.77→$1.92 etc.). Those cost deltas are a consequence of **changed inputs**, not a pricing change — cost-invariance for unchanged inputs is independently proven by `pricing.test.ts` exact literals (`36.75`, `0.56363`) which survive the swap. Recorded as a finding (the golden test no longer carries that invariance itself).

**Re-baselined literals are documented in the tests**, not silently snapshot-regenerated: Codex `input 300→220` (core subtracts cached from fresh input), `duration 30000→28000`, `tool_calls 2→3` — each annotated inline with the old→new value and the reason, satisfying the spec's re-baseline discipline.

**Over-build / YAGNI check:** None. The change is a net deletion (forensics.ts −406/+? lines; pricing.ts collapsed to re-exports). No unused exports introduced, no speculative parameters, no dead branches in the new code (`deriveCountsFromBytes` is a tight 4-line delegation; the capture nested try/catch has a single degrade path).

## AC Walkthrough

- **AC1** — ✅ PASS. Exact pin `"anatrace-core": "0.2.0"`; build resolves the published package (tsup success, typecheck clean).
- **AC2** — ✅ PASS. No hand-rolled Claude/Codex parsing or regex count derivation remains in `forensics.ts`; counts come from `parseSession` + `deriveCounts`.
- **AC3** — ✅ PASS. `transcript_hash` on the wrapper + `derive_version` inside `derived`; both omitted on the unreadable path (identity row still written). Tests at `forensics.test.ts:218,255`.
- **AC4** — ✅ PASS. Legacy record without core fields reads via `assembleProcessAttestation` (`work-proof-process.test.ts:151`).
- **AC5** — ✅ PASS. Both harnesses derive; Codex `files_touched` derived from a real `apply_patch`/`patch_apply_end` body, asserted `toBe(1)`.
- **AC6** — ✅ PASS. `{ priceTable: PRICES }` threaded at both sites; displayed version sourced from `CostResult`; unknown model → `priced: false`. Exact-cost literals unchanged in `pricing.test.ts`.
- **AC12 (Phase-1 slice)** — ✅ PASS. Test count 3700→3704 (no decrease); determinism, no-raw-body, Codex `files_touched>0` all asserted; every re-baselined literal justified inline.
- **AC13 (Phase-1 slice)** — ✅ PASS (code inspection). New `fs.readFileSync` + hash + `deriveCountsFromBytes` calls sit inside a nested try/catch within the total outer `captureProvenanceAtSave` try/catch; a failure degrades to an absent `derived`/`transcript_hash`, never a throw. See finding on the absence of an explicit throw-injection test.
- **AC17 (Phase-1 slice)** — ✅ PASS. `types/proof.ts` JSDoc states `transcript_hash` is "byte-identity ATTESTATION ONLY ... does NOT imply the provenance can be regenerated without those retained bytes." No field/JSDoc claims regenerability.
- **Network-freedom transitive** — ✅ PASS. `_capture.test.ts:223` asserts core runtime deps ⊆ `{ yaml }`; verified installed deps = `{ yaml }`.
- **`pnpm vitest run` + `pnpm run lint`** — ✅ PASS. 3704 passed / 0 failed / 2 skipped; lint 0 errors (1 pre-existing warning outside this diff).

## Blockers

None. Searched specifically for: (1) deleted-but-still-referenced helpers — none (`readString` retained, others fully removed); (2) the shared `readString` accidental deletion — did not occur; (3) `transcript_hash` honesty leak (present on unreadable path) — does not occur, test-asserted; (4) a missed `computeCost` migration site — both sites migrated; (5) new zero-importer exports — none added; (6) silent snapshot regeneration — every re-baselined literal is annotated old→new with cause; (7) raw transcript body / cost_usd leakage into committed JSON — asserted absent. Nothing rises to blocker level.

## Findings

- **Test — Golden fixture inputs changed to fit layout:** `packages/cli/tests/commands/proof-card-golden.test.ts:165` — `cache_read` bumped (80k→1M, 900k→1M) and a model id shortened (`gpt-5-codex`→`gpt-5`) so the wider real `2026-06-08` version label keeps the card ≤80 columns. Legitimate and documented, but the displayed costs in those fixtures shifted ($1.77→$1.92, $1.07→$1.17, $0.70→$0.75) as a result, so the golden test no longer demonstrates cost-invariance. That invariance is still proven by `pricing.test.ts` exact literals. Worth knowing for whoever next edits these goldens. (debt / monitor)
- **Test — AC13 totality not directly exercised:** `packages/cli/src/utils/forensics.ts:422` — no test forces `parseSession`/`deriveCounts` to throw mid-capture to prove the save still returns. Totality is structurally guaranteed by the outer catch and partially covered by the unreadable-transcript omit test, but a thrown-core path is untested. (debt / monitor)
- **Code — Read-once duplication between deriveTranscript and captureProvenanceAtSave:** `packages/cli/src/utils/forensics.ts:419` — capture re-reads bytes and calls `deriveCountsFromBytes` directly (rather than via `deriveTranscript`) so the hash and the derive attest identical bytes. This is the right call for read-once + hashing, but the read-bytes+basename+derive sequence now exists in two places and `deriveTranscript` is reachable only from tests. (observation / monitor)
- **Test — Stray indentation in shape helper:** `packages/cli/tests/commands/work-proof-process.test.ts:75` — `derive_version: '3'` sits at 6 spaces vs siblings' 8. Lint passes; cosmetic only. (observation / acknowledge)
- **Upstream — session-capture-C12 resolved:** the `parseTestCounts` best-effort regex (which inflated `tests_executed` on prose "N passed") is deleted; test-count derivation now goes through core's command-tool-gated path. The Codex `files_touched=0` build concern is likewise resolved (A008). Recorded with `resolves: [session-capture-C12]`. (observation / acknowledge)
- **Code — harness_version still empty:** `packages/cli/src/utils/forensics.ts` — the session-capture build concern about empty `harness_version` is NOT closed by this phase; the spec defers filling it from the transcript `version` key to Phase 2. Flagged so it is not assumed resolved by the swap. (observation / monitor)
- **Code — resolveTranscriptPath zero-importer export persists:** `packages/cli/src/utils/forensics.ts` — `cross-machine-provenance-C2` remains (exported, only internal caller). Not introduced here and out of scope; the refactor correctly avoided adding new zero-importer exports. (observation / monitor)

## Deployer Handoff

- This is **Phase 1 of 2** — do **not** create a PR or merge yet. Phase 2 (behavioral attestation, A013–A026) is "not started." After this passes, the next step is `ana run build` for Phase 2.
- The committed provenance JSON gains two fields (`transcript_hash` on the wrapper, `derive_version` inside `derived`). Old records without them still read (A007 verified). No migration needed.
- No displayed cost changes for identical inputs (table byte-identical at 0.2.0). The one visible UI change is the proof card's table-version label, which now shows the real `2026-06-08` (the version actually computed against) instead of a per-record stamp — this is the intended AC6 fix.
- `anatrace-core@0.2.0` is now a runtime dependency; its only transitive runtime dep is `yaml`. A test will fail loudly if a future bump adds anything else.

## Verdict

**Shippable:** YES (for Phase 1; Phase 2 remains).

All 12 Phase-1 contract assertions are SATISFIED with file+line evidence, all acceptance criteria PASS, the independent sealed test re-run is green at 3704 passing (no decrease), build and lint are clean, and the contract seal is INTACT. The swap is a disciplined caller-migration-plus-deletion: re-baselined literals are documented, honesty rules (no guessed counts, no body/cost leakage, attestation-only `transcript_hash`) hold under test, and the only behavioral change in the UI is the intended AC6 version-label fix. The findings are observations and test-debt for the next engineer, not defects in shipped behavior. I would stake my name on this Phase shipping.
