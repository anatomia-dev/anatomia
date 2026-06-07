# Scope: Simplify `ana test` to its load-bearing core

**Created by:** Ana
**Date:** 2026-06-06

## Intent

Strip `ana test` down to the mechanical spine that the product actually needs, and fix the one defect in that spine: the seal is not deterministic.

Two diseases, stated plainly:

1. **The seal hashes raw runner output.** `executeCapture` computes `sha256` over `result.rawBytes` — the concatenated stdout+stderr, which carries durations, progress, and ordering. The same test outcome therefore produces a *different* marker on every run. The seal — the anti-fabrication core, whose entire job is "this result was engine-derived, byte-for-byte reproducible" — cannot currently be reproduced byte-for-byte. The marker also carries `bytes` and `lines` (raw-output size), which are non-deterministic for the same reason and which nothing downstream consumes.

2. **Half of `ana test` serves an aspiration the agent correctly ignores.** The instruction "route every test through `ana test`" was aspirational. In practice Build iterates with raw test runs and invokes `ana test` only at the end to mint the seal — which is correct and sufficient (settled founder direction). The checkpoint passthrough mode (`-- <command>`), its refuse-guard, its degrade-to-raw path, and the agent-def text telling agents to route per-file checkpoints through `ana test` all exist to serve that abandoned aspiration.

This is a **subtraction scope**. The bar for keeping anything is: is it load-bearing for one of the four spine guarantees (sealed contract, present-check gate, Verify's independent re-run, founder merge)? If not, it goes.

## Complexity Assessment

- **Kind:** fix
  - *(The headline is a correctness defect: the integrity seal is non-deterministic. The bulk is subtraction, but the load-bearing justification is the determinism fix + removing machinery that creates footguns.)*
- **Size:** medium
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/test.ts` — remove checkpoint mode, the `isCheckpointSealConflict` guard, `failOrDegrade`'s checkpoint branch, the `[command...]` argument, the `--surface`-stays/`--all`-never flag model; change the hash input to a canonical form; simplify `printOutcome`.
  - `packages/cli/src/utils/capture-marker.ts` — drop `bytes`/`lines` from `CaptureMarker`, `formatMarker`, and `parseMarkerText` (required-field set); remove the now-dead `countLines`; the `lines`-required back-compat discriminator goes.
  - `packages/cli/src/utils/capture-runner.ts` — minor: `bytes`/`rawBytes` stay only as far as count derivation needs them; drop anything that existed solely to feed the removed marker fields.
  - **Agent defs (8 files), identical edits per role:** `packages/cli/templates/.claude/agents/ana-build.md`, `.../ana-verify.md`, `packages/cli/templates/.codex/agents/ana-build.md`, `.../ana-verify.md`, and the four dogfood copies at repo root (`.claude/agents/`, `.codex/agents/`).
  - **Tests:** trim `tests/commands/test-command.test.ts`, `tests/utils/capture-marker.test.ts`, `tests/capture-corpus/invariants.test.ts`, `tests/utils/capture-runner.test.ts` (checkpoint, conflict-guard, bytes/lines assertions); **add** the A026 idempotency test. Keep `tests/commands/init/template-propagation.test.ts` + `tests/templates/agent-proof-context.test.ts` passing (the sync enforcers).
- **Blast radius:** The marker FORMAT changes — every producer (`formatMarker`), consumer (`parseMarkers`/`parseMarkerText`), the gate's present-check, the agent-def descriptions, and the sync tests move together or the gate breaks. The gate itself (`evaluateCaptureGate`, present-check) is spine and its *behavior* must not change — only the fields it parses. Markers in `plans/completed/` are historical and never re-gated, so dropping the `lines` back-compat discriminator is safe on this clean base. `ana.json` and the Build-Brief command delivery are untouched.
- **Estimated effort:** 0.5–1 day. Mostly red diff; the care is in the marker-format change rippling cleanly through parser + tests + 8 defs in lockstep.
- **Multi-phase:** no

## Approach

Four interlocking moves, one coherent diff.

**Make the seal deterministic (the fix).** Hash over a canonical, normalized representation of the *result* — `stage | slug | counts | verdict` in stable order — not over raw runner bytes. Counts and verdict are already deterministic for a given outcome (counts are read by key from the JSON reporter, not scraped from timing text). Remove `bytes` and `lines` from the marker entirely: they are non-deterministic raw-output measurements, nothing consumes them, and they are the residue of the bytes-saved metric already retired as vanity. The marker becomes `stage slug counts verdict sha256` — every field deterministic, byte-identical for a stable outcome. Prove it with the missing idempotency test (contract A026): capture twice on the same outcome, assert byte-identical markers.

**Collapse the scope model to its minimum.** Keep `--surface <name>` (Build seals the surface it touched, with a real count) and `--slug`/`--stage`/`--json`. Drop the checkpoint passthrough mode and everything that exists only for it. The absence of `--surface` means "the whole project" — which is exactly what Verify needs — so no `--all` flag is added. A multi-surface build invokes `--surface` once per touched surface (each a clean real-count seal), which is better evidence than a combined run that would abstain; so no middle `surfaces` level is added.

**Make Verify-runs-everything mechanical.** `--stage verify` runs the full project by default — a property of the stage, not a per-scope instruction. The full multi-package run may abstain on the machine-readable count; that is the accepted tradeoff (Verify's job is full-project pass/fail to catch a regression a narrow build scope would miss, not a pretty count). An abstaining run still produces a deterministic marker (`counts=abstain`, verdict from exit code).

**Tell the truth in the templates, identically, everywhere.** Remove "route every test through `ana test`" and the checkpoint instruction from every agent def and dogfood copy. Keep the accurate instruction: the final seal is minted by `ana test`, and Build cannot save its report without it. Update the marker description to match the new fields. A def that says *less*.

The seam this leaves clean: the `enginebind` reserved field stays as-is (out of scope) — it is the documented hook for a future engine-bound forgery-resistant seal, and the founder's first priority is anti-fabrication, so removing the seam would force a future format migration for no present gain. Noted, not touched.

## Acceptance Criteria

- AC1: The capture marker's `sha256` is computed over a canonical normalized representation of the result (`stage | slug | counts | verdict`, stable order), not over raw runner output.
- AC2: The marker carries no non-deterministic field — `bytes` and `lines` are removed from `CaptureMarker`, `formatMarker`, and the parser's required/accepted fields.
- AC3: Two captures of the same test outcome produce a byte-identical marker, asserted by a new test tagged for the idempotency assertion (the A026 gap).
- AC4: The checkpoint passthrough mode (`-- <command>`) is removed, along with `isCheckpointSealConflict`, the degrade-to-raw path, `rawText`/`degradedToRaw`/`mode`, and the `[command...]` argument — with no dead code left behind.
- AC5: `ana test` exposes only the load-bearing flags: `--slug` (required), `--stage` (build|verify), `--surface <name>`, `--json`. No `--all` flag. `--surface` absent = full project.
- AC6: `--stage verify` runs the full project regardless of `--surface`; "Verify runs everything" is enforced by the stage, not by a per-scope instruction.
- AC7: The instruction "route every test through `ana test`" and the checkpoint instruction are removed from every agent def and every dogfood copy; the accurate "final seal is minted by `ana test`, cannot save without it" instruction remains — identical across all copies.
- AC8: `template-propagation.test.ts` and `agent-proof-context.test.ts` pass (the S1 edits are complete and in sync).
- AC9: The save-time present-check gate behavior is unchanged — a build report still requires exactly one well-formed `build` marker to save; only the parsed field set changes.
- AC10: Full suite green; no fragile tests added (no assertion on cosmetic/prose); the diff removes the tests for the removed machinery and adds only the idempotency test. One clean diff, nothing half-removed.

## Edge Cases & Risks

- **Abstaining marker determinism.** A full-project (Verify) or unknown-runner run abstains on counts. Confirm `counts=abstain` + verdict-from-exit-code still yields a deterministic marker and a valid `build`/`verify` seal.
- **Dropping the `lines` back-compat discriminator.** `parseMarkerText` currently requires `lines` to reject old-format (`file`, no `lines`) markers. Removing it is safe only because old markers exist only in `plans/completed/` (never re-gated). Plan must confirm no live path re-parses historical reports.
- **Verify + `--surface` interaction.** Decide the handling when `--surface` is passed with `--stage verify`: ignore-and-run-full (simplest) vs refuse (consistent with the anti-footgun philosophy but adds a guard while we remove one). Lean ignore-and-run-full to avoid a new error path; final call to Plan.
- **`bytes`/`lines` console display.** `printOutcome` prints "X bytes / Y lines captured" — console UX, not the marker. It can stay (harmless) or go (cleaner). Lean remove with the fields; it is not load-bearing.
- **Hidden consumer of `bytes`/`lines`.** Grep found none, but if Plan finds a proof-render or downstream consumer, removal becomes an Open Question rather than a silent cut.
- **Eight-file lockstep.** The agent-def edit must be byte-identical across template + dogfood × Claude + Codex or the sync tests fail. This is a feature (it forces completeness), not a risk — but Build must edit all eight, not five.

## Rejected Approaches

- **Keep `bytes`/`lines`, make them deterministic.** Not viable — they measure raw output size, which is inherently non-deterministic; making them stable means hardcoding (a lie) or removing meaning. Nothing reads them. Removal is the only honest option, and it aligns with the already-retired bytes-saved vanity metric.
- **Three-level scope model (`surface` | `surfaces` | `all`) or an explicit `--all` flag.** Rejected on YAGNI. A combined multi-surface run abstains on count (worse evidence than per-surface seals), so the `surfaces` middle level isn't load-bearing; multi-surface is served by invoking `--surface` per touched surface. `--all` is pure sugar over "omit `--surface`," which already means full project. Adding either is the flag proliferation the subtraction bar forbids.
- **Keep checkpoint mode "just in case."** Rejected — it is the machinery for the removed aspiration, it creates the footgun the #281 refuse-guard exists to block, and Build doesn't use it. Removing it removes the guard too (elegant-removes).
- **Hash a canonical form but keep raw-byte hashing as a second field.** Rejected — two hashes is more surface, not less; the canonical hash is the seal.

## Open Questions

- Verify + `--surface` handling: ignore-and-run-full vs refuse (lean ignore; Plan decides).
- Exact canonical serialization for the hash (delimiter, field order) — Plan specifies the precise byte layout so the idempotency test pins it.
- Whether to keep the `bytes`/`lines` *console* line in `printOutcome` (lean remove).

## Exploration Findings

### Patterns Discovered
- `test.ts:303` — `createHash('sha256').update(result.rawBytes)` is the determinism defect (hash over raw output).
- `test.ts:152,176–187,436–445` — `SEALING_STAGES`, `isCheckpointSealConflict`, and its use in `runTest`; all exist only for the checkpoint/stage conflict.
- `test.ts:196,204–223,287–300,345–371` — checkpoint mode, its branch in `executeCapture`, and `failOrDegrade`'s checkpoint half.
- `capture-marker.ts:110–122` — `formatMarker` field order `stage slug counts verdict sha256 bytes lines [enginebind]`.
- `capture-marker.ts:171–177` — `parseMarkerText` requires `bytes` and `lines`; `lines` is the old-format discriminator.
- `capture-marker.ts:94–100` — `countLines`, dead once `lines` is removed.
- `capture-runner.ts:385,407,439–528` — `deriveCounts`/`deriveVerdict` and the vitest/go JSON-reporter paths; counts are read by key (deterministic).

### Constraints Discovered
- [TYPE-VERIFIED] `validateCapturePresent` (capture-marker.ts:220) → `evaluateCaptureGate` (243) → called by `artifact.ts:803`: the gate is the spine; behavior must not change.
- [OBSERVED] No consumer of marker `bytes`/`lines` anywhere in `src/` (grep-verified) — safe to remove.
- [OBSERVED] `enginebind` is reserved plumbing, round-tripped, no machinery — leave as-is (future forgery-binding seam).
- [OBSERVED] `.captures/` gitignore (`assets.ts:100`, `plans/active/*/.captures/`) stays — baseline still writes-then-deletes a scratch log; it's the crash backstop.

### Test Infrastructure
- `tests/commands/init/template-propagation.test.ts` + `tests/templates/agent-proof-context.test.ts` enforce agent-def sync — the S1 "everywhere" check.
- `tests/commands/test-command.test.ts`, `tests/utils/capture-marker.test.ts`, `tests/utils/capture-runner.test.ts`, `tests/capture-corpus/invariants.test.ts` cover the surface being subtracted.
- Base confirmed green before scoping: 138 files, 3429 passed, 2 skipped, 0 failed.

## For AnaPlan

### Structural Analog
`packages/cli/src/commands/test.ts` itself is its own best analog — the existing baseline-seal path (resolve command → runCapture → deriveCounts/deriveVerdict → formatMarker) stays; the change is to its hash input and the removal of the checkpoint sibling. For the canonical-hash pattern, mirror how `deriveCounts` reads stable fields by key rather than scraping raw text — the hash should consume the same already-normalized values.

### Relevant Code Paths
- `src/commands/test.ts` — command, flags, `executeCapture`, `printOutcome`, the guard.
- `src/utils/capture-marker.ts` — marker interface, `formatMarker`, `parseMarkerText`, gate.
- `src/utils/capture-runner.ts` — `deriveCounts`/`deriveVerdict`, JSON reporter paths, `CaptureRunResult`.
- `src/commands/artifact.ts:803` — the gate call site (do not change behavior).

### Patterns to Follow
- Keep the pure-module boundary: `capture-marker.ts` stays free of chalk/commander/exit.
- Field-order and formatting must be fixed and stable (the idempotency test pins the exact bytes).

### Known Gotchas
- Edit all **eight** agent-def files, not five — template + dogfood × Claude + Codex. The sync tests will fail loudly if any copy drifts.
- Removing `lines` changes the parser's required set; verify no live path depends on the old-format rejection before deleting the discriminator.
- The gate must keep blocking a missing seal under `captureGate: on` — only the parsed fields change, not the present-check.

### Things to Investigate
- Confirm (or refute) any consumer of `bytes`/`lines` outside `src/` — e.g. website proof-render reading committed markers — before final removal.
- Decide the precise canonical serialization (delimiter + order) and pin it in the A026 test.
- Decide verify+`--surface` handling (ignore vs refuse).
