# Scope: Simplify `ana test` to its load-bearing core

**Created by:** Ana
**Date:** 2026-06-06
**Revised:** 2026-06-06 — after three-agent redundant review (see "Review Findings Folded In" at end)

## Intent

Strip `ana test` down to the mechanical spine that the product actually needs, and fix the one defect in that spine: the seal is not deterministic.

Two diseases, stated plainly:

1. **The seal hashes raw runner output.** `executeCapture` computes `sha256` over `result.rawBytes` — the concatenated stdout+stderr, which carries durations, progress, and ordering. The same test outcome therefore produces a *different* marker on every run. The seal — whose entire job is "this result was engine-derived, byte-for-byte reproducible" — cannot currently be reproduced byte-for-byte. The marker also carries `bytes` and `lines` (raw-output size), which are non-deterministic for the same reason and which nothing downstream consumes.

2. **Half of `ana test` serves an aspiration the agent correctly ignores.** "Route every test through `ana test`" was aspirational. In practice Build iterates with raw test runs and invokes `ana test` only at the end to mint the seal — which is correct and sufficient (settled founder direction). The checkpoint passthrough mode (`-- <command>`), its refuse-guard, its degrade-to-raw path, and the agent-def text telling agents to route per-file checkpoints through `ana test` all exist to serve that abandoned aspiration.

This is a **subtraction scope**. The bar for keeping anything is: is it load-bearing for one of the four spine guarantees (sealed contract, present-check gate, Verify's independent re-run, founder merge)? If not, it goes.

## Complexity Assessment

- **Kind:** fix
  - *(The headline is a correctness defect: the integrity seal is non-deterministic. The bulk is subtraction, but the load-bearing justification is the determinism fix + removing machinery that creates footguns.)*
- **Size:** medium
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/test.ts` — remove checkpoint mode, the `isCheckpointSealConflict` guard, `failOrDegrade`'s checkpoint branch, the `[command...]` argument, `--all`-never (keep `--surface`); change the hash input to a canonical form; remove the `bytes`/`lines` console line in `printOutcome`; update the file's top docstring (lines ~7–9 describe `byte/line totals` — will be false).
  - `packages/cli/src/utils/capture-marker.ts` — drop `bytes`/`lines` from `CaptureMarker`, `formatMarker`, and `parseMarkerText` (required-field set); remove the now-dead `countLines`; the `lines`-required back-compat discriminator goes; update the module docstring (lines ~6–18 describe `byte + line totals` and "required `lines` field").
  - `packages/cli/src/utils/capture-runner.ts` — remove `CaptureRunResult.bytes` (the interface field at ~L54 and its assignment at ~L346); it exists *only* to feed the removed marker `bytes` field — count derivation uses `rawBytes` (the Buffer), never `bytes`. Update the `CaptureRunResult` docstring (~L50–55). `rawBytes` stays (counts + hash-free; see Approach).
  - **Agent defs — per-role edits (NOT identical across roles; identical within a role across template/dogfood × Claude/Codex):**
    - `ana-build.md` ×4 — remove "Run every test through `ana test`" (~L109) and the checkpoint bullet wrapping per-file commands in `ana test --slug -- {checkpoint}` (~L111); keep the baseline-seal instruction; update the marker description "(counts + verdict + sha256 + byte/line totals)" (~L110) to drop byte/line.
    - `ana-verify.md` ×4 — remove the focused `ana test --slug -- {checkpoint command}` form (~L179); make the full re-run instruction unconditional (S4: verify runs the full project); update the marker description (~L179) to drop byte/line.
  - **`ana-plan.md` — UNTOUCHED.** Verified: ana-plan (~L420) authors per-file test commands into the Build Brief from `commands.test`/`surfaces.*.commands.test`; it does NOT route them through `ana test`. The Build-Brief per-file commands SURVIVE as Build's raw iteration — only the `ana test … -- {cmd}` *wrapper* is removed. (See Approach → "What 'remove checkpoint' does and does not mean.")
  - **Tests:**
    - `packages/cli/tests/commands/template-capture-instruction.test.ts` — **the instruction-sync test that hard-asserts the checkpoint form** (`ana test --slug {slug} -- {checkpoint command`, ~L43) and "all four templates instruct running tests through `ana test`" (~L33). It WILL fail; rewrite it to assert only the surviving instruction (final-seal minted by `ana test`, baseline + verify forms), not the removed checkpoint form.
    - `packages/cli/tests/utils/capture-marker.test.ts` — remove/rewrite the `@ana A024` old-format-rejection test (~L183): it rejects an old marker *because it lacks `lines`*; once `lines` is no longer required, that marker would parse — the test must change and the accepted-seal shape change must be acknowledged.
    - `packages/cli/tests/commands/test-command.test.ts`, `packages/cli/tests/utils/capture-runner.test.ts` — trim checkpoint, conflict-guard, and `bytes`/`lines` assertions.
    - `packages/cli/tests/capture-corpus/invariants.test.ts` — already free of checkpoint/bytes/lines (asserts counts/verdict only); confirm no edit needed rather than assume a trim.
    - **Add** the idempotency test (the byte-stable-marker invariant; see AC3).
    - Keep `packages/cli/tests/commands/init/template-propagation.test.ts` + `packages/cli/tests/templates/agent-proof-context.test.ts` passing.
  - **Codex dogfood sync coverage gap (see Blast radius):** `packages/cli/tests/templates/codex-learn-template.test.ts` byte-checks only the `ana-learn` codex dogfood copy. Extend it (or add a sibling) to byte-check ALL codex dogfood agent files against templates — otherwise the repo-root `.codex/agents/ana-build.md` / `ana-verify.md` edits are NOT test-enforced.
- **Blast radius:** The marker FORMAT changes — every producer (`formatMarker`), consumer (`parseMarkers`/`parseMarkerText`), the gate's present-check, the agent-def descriptions, the source docstrings, and the sync tests move together or the gate breaks. The gate itself (`evaluateCaptureGate`, present-check) is spine and its *behavior* must not change — only the fields it parses. **Sync-enforcement is asymmetric:** `.claude` dogfood IS byte-checked against templates (`agent-proof-context.test.ts:67`), but the two `.codex` build/verify dogfood copies are NOT (only `ana-learn` is) — so "the sync tests catch any drift" is false for 2 of the 8 def files until the coverage gap above is closed. Markers in `plans/completed/` are historical and never re-gated, so dropping the `lines` discriminator is safe on this clean base. `ana.json`, the Build-Brief command delivery, and `ana-plan.md` are untouched.
- **Estimated effort:** 0.5–1 day. Mostly red diff; the care is in the marker-format change rippling cleanly through parser + tests + docstrings + the per-role def edits in lockstep.
- **Multi-phase:** no

## Approach

Four interlocking moves, one coherent diff.

**Make the seal deterministic (the fix).** Hash over a canonical, normalized representation of the *result* — `stage | slug | counts | verdict` in stable order — not over raw runner bytes. Counts and verdict are already deterministic for a given outcome (counts are read by key from the JSON reporter, not scraped from timing text). Remove `bytes` and `lines` from the marker entirely: they are non-deterministic raw-output measurements, nothing consumes them, and they are the residue of the bytes-saved metric already retired as vanity. The marker becomes `stage slug counts verdict sha256` — every field deterministic, byte-identical for a stable outcome. A single canonical-string function must be the shared source for BOTH the hash input and the idempotency test, so the test cannot pass while the hash silently diverges from the visible fields.

**Be honest about what the hash now proves.** After this change the `sha256` is computed over fields that are ALL visible in the marker — so anyone who can type a marker can recompute the hash. The hash therefore provides **determinism and self-consistency, not forgery resistance**. The real anti-fabrication guarantee is the **present-check gate** (Build cannot save a report without a well-formed engine-derived build seal), and engine-bound forgery resistance is deferred to the reserved `enginebind` field. This is settled direction (the brief mandates the canonical hash) and is not being relitigated — but the scope states it plainly so no one mistakes the recomputable hash for proof the engine ran. Prove the determinism with the missing idempotency test: capture twice on the same outcome, assert byte-identical markers.

**Collapse the scope model to its minimum.** Keep `--surface <name>` (Build seals the surface it touched, with a real count) and `--slug`/`--stage`/`--json`. Drop the checkpoint passthrough mode and everything that exists only for it. The absence of `--surface` means "the whole project" — which is exactly what Verify needs — so no `--all` flag is added. A multi-surface build invokes `--surface` once per touched surface (each a clean real-count seal), which is better evidence than a combined run that would abstain; so no middle `surfaces` level is added. A single-surface / non-monorepo project (no `surfaces` in `ana.json`) is served by the `--surface`-absent fallback to top-level `commands.test` — verified — so the model ships to all customers.

**What "remove checkpoint" does and does not mean.** REMOVED: the `ana test … -- <command>` passthrough mode in the CLI, its degrade-to-raw path, the `isCheckpointSealConflict` guard, and the agent-def lines that wrap per-file commands in `ana test … -- {checkpoint}`. KEPT: the Build-Brief's per-file test commands themselves — Build runs them as raw iteration (the settled "Build iterates with raw test runs"), and Plan keeps authoring them. So `ana-plan.md` does not change; only ana-build/ana-verify lose the `ana test` wrapping of those commands.

**Make Verify-runs-everything mechanical.** `--stage verify` runs the full project by default — a property of the stage, not a per-scope instruction. The full multi-package run may abstain on the machine-readable count; that is the accepted tradeoff (Verify's job is full-project pass/fail to catch a regression a narrow build scope would miss, not a pretty count). An abstaining run still produces a deterministic marker (`counts=abstain`, verdict from exit code).

**Tell the truth in the templates AND the source comments, identically per role, everywhere.** Remove "route every test through `ana test`" and the checkpoint-wrapping instruction from every agent def and dogfood copy; update the marker description to the new field set; keep the accurate instruction (final seal minted by `ana test`, cannot save without it). The same byte/line-totals language lives in source docstrings (`test.ts`, `capture-marker.ts`, `capture-runner.ts`) and must be corrected too — truth-in-comments, not just templates. A def that says *less*.

The seam this leaves clean: the `enginebind` reserved field stays as-is (out of scope) — it is the documented hook for a future engine-bound forgery-resistant seal, and the founder's first priority is anti-fabrication, so removing the seam would force a future format migration for no present gain. Noted, not touched.

## Acceptance Criteria

- AC1: The capture marker's `sha256` is computed over a canonical normalized representation of the result (`stage | slug | counts | verdict`, stable order) via a single shared canonical-string function — not over raw runner output.
- AC2: The marker carries no non-deterministic field — `bytes` and `lines` are removed from `CaptureMarker`, `formatMarker`, and the parser's required/accepted fields; the `bytes`/`lines` console line in `printOutcome` is removed.
- AC3: Two captures of the same test outcome produce a byte-identical marker, asserted by a new test that pins the exact canonical byte layout (the idempotency invariant — "save twice → byte-identical marker" — currently defended only "by construction"). Plan assigns this test a fresh local contract id; do NOT reuse the label "A026" (it is a per-plan-local id meaning different things in other plans).
- AC4: The checkpoint passthrough mode (`-- <command>`) is removed, along with `isCheckpointSealConflict`, the degrade-to-raw path, `rawText`/`degradedToRaw`/`mode`, the `[command...]` argument, AND `CaptureRunResult.bytes` (interface field + assignment) — with no dead code left behind. (`formatCounts`, `inferRunner`, `KNOWN_RUNNERS`, `countHint` stay — verified still load-bearing.)
- AC5: `ana test` exposes only the load-bearing flags: `--slug` (required), `--stage` (build|verify), `--surface <name>`, `--json`. No `--all` flag. `--surface` absent = full project, falling back to top-level `commands.test` for single-surface/non-monorepo projects.
- AC6: `--stage verify` runs the full project regardless of `--surface`; "Verify runs everything" is enforced by the stage, not by a per-scope instruction.
- AC7: The instruction "route every test through `ana test`" and the checkpoint-wrapping instruction are removed from every ana-build/ana-verify def and dogfood copy; the marker-description prose ("byte/line totals") is updated; the accurate "final seal is minted by `ana test`, cannot save without it" instruction remains. Edits are identical WITHIN each role (template = dogfood = Claude = Codex) but differ BETWEEN ana-build and ana-verify. `ana-plan.md` is unchanged.
- AC8: The sync/instruction tests pass: `template-propagation.test.ts`, `agent-proof-context.test.ts`, and the rewritten `template-capture-instruction.test.ts` (which must no longer assert the removed checkpoint form). The `@ana A024` old-format-rejection test in `capture-marker.test.ts` is removed or rewritten.
- AC9: The save-time present-check gate behavior is unchanged — a build report still requires exactly one well-formed `build` marker to save; only the parsed field set changes. (Acknowledged: the accepted-seal shape widens — once `lines`/`bytes` are no longer required, any line carrying stage/slug/counts/verdict/sha256 parses as a seal. No live path re-parses historical reports, so no live break; this is recorded, not a regression.)
- AC10: Source docstrings describing the old marker fields are corrected: `test.ts` (~L7–9), `capture-marker.ts` (~L6–18, incl. the "required `lines`" note), `capture-runner.ts` (~L50–55).
- AC11: Codex dogfood agent files (`.codex/agents/ana-build.md`, `ana-verify.md`) are brought into sync AND covered by a byte-check test (extend `codex-learn-template.test.ts` or a sibling) so future drift is caught — closing the asymmetric-enforcement gap.
- AC12: Full suite green; no fragile tests added (no assertion on cosmetic/prose); the diff removes the tests for the removed machinery and adds only the idempotency test. One clean diff, nothing half-removed.

## Edge Cases & Risks

- **Abstaining marker determinism.** A full-project (Verify) or unknown-runner run abstains on counts. Confirm `counts=abstain` + verdict-from-exit-code still yields a deterministic marker and a valid `build`/`verify` seal.
- **Bare-build abstain is accepted behavior.** `ana test --stage build --slug X` with no `--surface` runs the full project, often abstains on count (e.g. a turbo/pnpm-wrapped top-level command), yet still mints a gate-passing build seal. This is ACCEPTED: the existing `countHint` already nudges the operator toward `--surface`/`test_json`, and requiring `--surface` for build would break single-surface/non-monorepo customers (no surface to name). Recorded as accepted, not guarded.
- **Accepted-seal shape widens (see AC9).** Dropping the required `lines`/`bytes` fields means a line with the five core fields parses as a seal. Safe because no live path re-parses historical reports (gate runs only on the report being saved, via `artifact.ts:803`). Plan must confirm no new re-parse path is introduced.
- **The hash is recomputable (see Approach).** Post-change, the seal is hand-recomputable from visible fields — determinism, not anti-forgery. The gate is the protection. Surfaced so the integrity story is honest.
- **Proof-of-execution.** `bytes`/`lines` (>0) were weak evidence that *something ran*. Their removal loses no *load-bearing* signal: `deriveVerdict` already returns `abstain` (not `pass`) for a 0-test run, and the gate never read bytes/lines. Pre-existing behavior; noted for completeness.
- **Verify + `--surface` interaction.** Decide handling when `--surface` is passed with `--stage verify`: ignore-and-run-full (simplest, lean) vs refuse. No current caller passes `--surface` for verify, so forcing full breaks nothing; final call to Plan.
- **Per-role lockstep.** ana-build edits ≠ ana-verify edits, but each must be identical across its 4 copies. The `.claude` copies are byte-checked; the `.codex` build/verify copies are not until AC11 lands — so Build must not rely on tests alone for those two and must apply AC11 first.

## Rejected Approaches

- **Keep `bytes`/`lines`, make them deterministic.** Not viable — they measure raw output size, which is inherently non-deterministic; making them stable means hardcoding (a lie) or removing meaning. Nothing reads them. Removal is the only honest option, and it aligns with the already-retired bytes-saved vanity metric.
- **Three-level scope model (`surface` | `surfaces` | `all`) or an explicit `--all` flag.** Rejected on YAGNI. A combined multi-surface run abstains on count (worse evidence than per-surface seals), so the `surfaces` middle level isn't load-bearing; multi-surface is served by invoking `--surface` per touched surface. `--all` is pure sugar over "omit `--surface`," which already means full project.
- **Require `--surface` for `--stage build`.** Rejected — single-surface / non-monorepo projects (the majority of customers) have no `surfaces` to name, so a hard requirement would break them. The existing `countHint` nudge is the right touch; an abstaining build seal is accepted (see Edge Cases).
- **Keep checkpoint mode "just in case."** Rejected — it is the machinery for the removed aspiration, it creates the footgun the #281 refuse-guard exists to block, and Build doesn't use it. Removing it removes the guard too (elegant-removes). The Build-Brief per-file commands survive as raw iteration regardless.
- **Hash a canonical form but keep raw-byte hashing as a second field.** Rejected — two hashes is more surface, not less; the canonical hash is the seal.

## Open Questions

- Verify + `--surface` handling: ignore-and-run-full vs refuse (lean ignore; Plan decides).
- Exact canonical serialization for the hash (delimiter, field order, how `abstain` renders, whether `enginebind` participates) — Plan specifies the precise byte layout via the single shared function so the idempotency test pins it.
- Codex enforcement (AC11): extend the existing codex sync test vs add a sibling — Plan picks the smaller clean option.

## Exploration Findings

### Patterns Discovered
- `test.ts:303` — `createHash('sha256').update(result.rawBytes)` is the determinism defect (hash over raw output).
- `test.ts:152,176–187,436–445` — `SEALING_STAGES`, `isCheckpointSealConflict`, and its use in `runTest`; all exist only for the checkpoint/stage conflict.
- `test.ts:196,204–223,287–300,345–371,404–411` — checkpoint mode, its branch in `executeCapture`, `failOrDegrade`'s checkpoint half, and the duplicated `bytes/lines` console line.
- `capture-marker.ts:110–122` — `formatMarker` field order `stage slug counts verdict sha256 bytes lines [enginebind]`.
- `capture-marker.ts:171–177` — `parseMarkerText` requires `bytes` and `lines`; `lines` is the old-format discriminator.
- `capture-marker.ts:94–100` — `countLines`, dead once `lines` is removed.
- `capture-runner.ts:50–55,346` — `CaptureRunResult.bytes` field + assignment; fed only the removed marker field (count derivation uses `rawBytes`).
- `capture-runner.ts:385,407,439–528` — `deriveCounts`/`deriveVerdict` and the vitest/go JSON-reporter paths; counts are read by key (deterministic); `deriveVerdict` returns `abstain` (not `pass`) for 0 tests.

### Constraints Discovered
- [TYPE-VERIFIED] `validateCapturePresent` (capture-marker.ts:220) → `evaluateCaptureGate` (243) → called by `artifact.ts:803`: the gate is the spine; behavior must not change; never reads bytes/lines.
- [TYPE-VERIFIED] `template-capture-instruction.test.ts:43` asserts `ana test --slug {slug} -- {checkpoint command` — breaks on checkpoint removal.
- [TYPE-VERIFIED] `agent-proof-context.test.ts:67` byte-checks `.claude` dogfood; `codex-learn-template.test.ts` covers only `ana-learn` codex dogfood — codex build/verify is unguarded.
- [OBSERVED] No consumer of marker `bytes`/`lines` anywhere in `src/`, the proof chain, or `website/` (Proof Explorer reads `proof_chain.json`, never markers) — safe to remove.
- [OBSERVED] `ana-plan.md:420` authors per-file commands but does not route them through `ana test` — stays untouched.
- [OBSERVED] `enginebind` is reserved plumbing, round-tripped, no machinery — leave as-is (future forgery-binding seam).
- [OBSERVED] `.captures/` gitignore (`assets.ts:100`) stays — baseline still writes-then-deletes a scratch log; crash backstop.

### Test Infrastructure
- Sync/instruction enforcers: `template-propagation.test.ts`, `agent-proof-context.test.ts` (.claude dogfood byte-check), `template-capture-instruction.test.ts` (instruction forms), `codex-learn-template.test.ts` (codex — learn only).
- Surface being subtracted: `test-command.test.ts`, `capture-marker.test.ts` (incl. `@ana A023/A024` old-format tests), `capture-runner.test.ts`, `capture-corpus/invariants.test.ts`.
- Base confirmed green before scoping: 138 files, 3429 passed, 2 skipped, 0 failed.

## For AnaPlan

### Structural Analog
`packages/cli/src/commands/test.ts` itself is its own best analog — the existing baseline-seal path (resolve command → runCapture → deriveCounts/deriveVerdict → formatMarker) stays; the change is to its hash input and the removal of the checkpoint sibling. For the canonical-hash pattern, mirror how `deriveCounts` reads stable fields by key rather than scraping raw text — the hash should consume the same already-normalized values, via one shared canonical-string function used by both `formatMarker`'s hash input and the idempotency test.

### Relevant Code Paths
- `src/commands/test.ts` — command, flags, `executeCapture`, `printOutcome`, the guard.
- `src/utils/capture-marker.ts` — marker interface, `formatMarker`, `parseMarkerText`, gate.
- `src/utils/capture-runner.ts` — `deriveCounts`/`deriveVerdict`, JSON reporter paths, `CaptureRunResult` (drop `.bytes`).
- `src/commands/artifact.ts:803` — the gate call site (do not change behavior).

### Patterns to Follow
- Keep the pure-module boundary: `capture-marker.ts` stays free of chalk/commander/exit.
- Field-order and formatting must be fixed and stable (the idempotency test pins the exact bytes via the shared canonical function).
- Per-role def edits: identical within a role's 4 copies, different between ana-build and ana-verify.

### Known Gotchas
- Edit all **eight** def files (ana-build + ana-verify × template/dogfood × Claude/Codex) — but the two `.codex` dogfood copies are NOT test-enforced until AC11 lands. Apply AC11's coverage first, then the edits.
- `template-capture-instruction.test.ts` and the `@ana A024` test in `capture-marker.test.ts` WILL fail and must be rewritten — they are the "now-wrong test" trap this scope exists to avoid.
- Removing `lines` changes the parser's required set AND widens the accepted-seal shape (AC9) — record it; verify no new re-parse path depends on the old-format rejection.
- The gate must keep blocking a missing seal under `captureGate: on` — only the parsed fields change, not the present-check.
- Source docstrings (test.ts, capture-marker.ts, capture-runner.ts) describe the old fields — update them or they become lies.

### Things to Investigate
- Decide the precise canonical serialization (delimiter + order + abstain rendering) and pin it in the idempotency test via the shared function.
- Decide verify+`--surface` handling (ignore vs refuse).
- Decide the codex sync-coverage shape (extend vs sibling test) for AC11.

---

## Review Findings Folded In (three-agent redundant review, 2026-06-06)

Three independent reviewers (identical prompt) scrutinized the prior revision; findings were verified against code before folding in.

**Confirmed and incorporated (must/should-fix):**
- Added `template-capture-instruction.test.ts` (breaks on checkpoint removal) — AC8, Files.
- Named `CaptureRunResult.bytes` as a created-orphan — AC4, Files.
- Clarified that checkpoint *commands* survive as raw iteration; only the `ana test … -- {cmd}` *wrapper* is removed; `ana-plan.md` untouched — Approach, Files.
- Named the `@ana A024` old-format test + recorded the accepted-seal-shape widening — AC8/AC9.
- Recorded the asymmetric sync enforcement (codex build/verify unguarded) + added AC11 to close it — Blast radius, AC11.
- Added the marker-description prose + source-docstring corrections — AC7, AC10.
- Added the honesty statement: the canonical hash is determinism, not anti-forgery; the gate is the protection — Approach, Edge Cases.
- Stated the bare-build abstain as accepted; promoted the console-line removal to AC2.

**Reviewer points handled differently (with reason):**
- "A026 is the wrong contract id" (2/3 called must-fix) → downgraded to a wording fix: contract ids are per-plan-local; AC3 now says describe the invariant and assign a fresh id, don't reuse "A026."
- "Require `--surface` for build" (floated by 2 reviewers) → rejected: breaks single-surface/non-monorepo customers; the `countHint` nudge + accepted abstain is the right touch (Rejected Approaches, Edge Cases).
