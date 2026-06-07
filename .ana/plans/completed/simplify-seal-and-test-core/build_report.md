# Build Report: Simplify `ana test` to its load-bearing core

**Created by:** AnaBuild
**Date:** 2026-06-07
**Spec:** .ana/plans/active/simplify-seal-and-test-core/spec.md
**Branch:** feature/simplify-seal-and-test-core

## What Was Built

For each file created or modified:

- **packages/cli/src/utils/capture-marker.ts** (modified): Added `canonicalCaptureString(input)` and `captureSha(input)` — the shared canonical-hash functions and single source of truth for the seal. `captureSha` hashes the canonical string `stage=…\nslug=…\ncounts=…\nverdict=…` (fixed order, newline-separated, `enginebind` excluded). Removed `bytes`/`lines` from `CaptureMarker`, `formatMarker`, and the parser's required set; removed `countLines` and the `NL` constant. Corrected the module docstring (canonical-hash determinism story; `sha256` is now the parser's well-formedness discriminator instead of a required `lines` field). Added `import { createHash } from 'node:crypto'` (permitted in this pure module).
- **packages/cli/src/commands/test.ts** (modified): Replaced the seal computation — `createHash('sha256').update(result.rawBytes)` → `captureSha({ stage, slug, counts: formatCounts(counts), verdict })`. Deleted the entire checkpoint path: `mode`, the checkpoint branch in `executeCapture`, `SEALING_STAGES`, `isCheckpointSealConflict`, the conflict guard, `failOrDegrade`'s checkpoint half (now `failClosed`, baseline exit-3 only), the `[command...]` argument + `passthrough` plumbing, and the `bytes`/`lines`/`mode`/`degradedToRaw`/`rawText` fields on `TestRunOutcome`. Made `--stage verify` resolve the top-level command ignoring `--surface` (`effectiveSurface = stage === 'verify' ? undefined : surface`). Removed the `bytes / lines captured` console line. Corrected the top docstring.
- **packages/cli/src/utils/capture-runner.ts** (modified): Removed `CaptureRunResult.bytes` (interface field + assignment + docstring); `rawBytes` stays. Byte length is now read from `rawBytes.byteLength` by callers that need it.
- **packages/cli/templates/.claude/agents/ana-build.md**, **packages/cli/templates/.codex/agents/ana-build.md**, **.claude/agents/ana-build.md**, **.codex/agents/ana-build.md** (modified): Removed the "Run every test through `ana test`" framing and the per-file Checkpoints bullet; kept the Baseline final-seal instruction; changed the marker description from "(counts + verdict + sha256 + byte/line totals)" to "(counts + verdict + sha256)". Identical edit across all 4 copies.
- **packages/cli/templates/.claude/agents/ana-verify.md**, **packages/cli/templates/.codex/agents/ana-verify.md**, **.claude/agents/ana-verify.md**, **.codex/agents/ana-verify.md** (modified): Removed the focused-checkpoint sentence; kept the unconditional verify-seal instruction; trimmed "(counts + verdict + sha256 + byte/line totals; nothing inlined)" to "(counts + verdict + sha256; nothing inlined)"; kept the "never gated" note. Identical edit across all 4 copies.
- **packages/cli/tests/utils/capture-marker.test.ts** (modified): Removed `countLines` import + its test, dropped `bytes`/`lines` from the `marker()` factory and from all parser-well-formedness fixtures, removed the now-invalid old-format A024-rejection test. Added the canonical-layout, idempotency, hash-recompute, and hash-discriminates tests. Re-tagged to the current contract (A001–A010, A023–A025).
- **packages/cli/tests/utils/capture-runner.test.ts** (modified): Switched the tee test's `result.bytes` assertions to `result.rawBytes.byteLength`.
- **packages/cli/tests/commands/test-command.test.ts** (modified): Removed the `isCheckpointSealConflict` and `executeCapture — checkpoint` describe blocks and the import; dropped `bytes`/`lines`/`outcome.bytes` assertions from baseline; added the verify-runs-full-project test (A015). Re-tagged to the current contract (A011–A015).
- **packages/cli/tests/commands/template-capture-instruction.test.ts** (modified): Rewrote to assert the surviving forms present and the removed forms (`-- {checkpoint command`, "Run every test through", "byte/line totals") absent; kept the codex-mirrors-claude byte-check. Tagged A016–A020.
- **packages/cli/tests/templates/codex-learn-template.test.ts** (modified): Generalized the dogfood byte-check to loop over `CODEX_AGENT_FILES` (every codex `.md` dogfood == template), mirroring `agent-proof-context.test.ts`. Kept the `ana-learn.agent.toml` assertion and the learn-specific content tests. Tagged A021, A022.
- **packages/cli/tests/commands/artifact.test.ts** (modified — NOT in the spec's File Changes; see Deviations): Dropped `bytes`/`lines` from two `formatMarker` fixtures (type error after the shape change) and replaced the now-parseable old-format marker in the gate-block-message test with a non-hex placeholder.

## PR Summary

- Makes the `ana test` capture seal **deterministic**: the `sha256` is now computed over a canonical result summary (`stage|slug|counts|verdict`) via a single shared function in the pure `capture-marker` module, instead of over raw runner bytes — so the same outcome mints a byte-identical marker every run (confirmed live: two seals produced identical markers).
- Removes the non-deterministic `bytes`/`lines` marker fields, `countLines`, and `CaptureRunResult.bytes`; the marker is now `stage slug counts verdict sha256 [enginebind]` — every field deterministic.
- Deletes the abandoned checkpoint/passthrough machinery (`-- <command>` mode, `isCheckpointSealConflict`, `SEALING_STAGES`, degrade-to-raw) and makes `--stage verify` run the full top-level project regardless of `--surface`.
- Corrects all 8 ana-build/ana-verify agent defs (template + dogfood, `.claude` + `.codex`) to stop instructing route-everything/checkpoint-wrapping and drop the "byte/line" prose.
- Closes an asymmetric-enforcement gap: codex `.md` dogfood defs are now byte-checked against their templates for every agent, not just `ana-learn`.

## Acceptance Criteria Coverage

- **AC1** "sha256 over canonicalCaptureString via one shared function" → capture-marker.test.ts "canonicalCaptureString returns the exact fixed byte layout" + test.ts uses `captureSha(...)`. ✅ Verified
- **AC2** "bytes/lines/countLines/console line removed" → capture-marker.test.ts "drops the bytes and lines fields"; grep clean; printOutcome line removed. ✅ Verified
- **AC3** "two captures byte-identical, exact canonical layout pinned" → capture-marker.test.ts "two captures of the same outcome produce a byte-identical marker" + "canonicalCaptureString returns the exact fixed byte layout"; also confirmed live (two `ana test` runs → identical sha256). ✅ Verified
- **AC4** "checkpoint passthrough + CaptureRunResult.bytes removed, no dead code" → grep clean for `isCheckpointSealConflict`/`SEALING_STAGES`/`degradedToRaw`/`countLines`; build + lint clean. ✅ Verified
- **AC5** "ana test exposes only --slug/--stage/--surface/--json, no --all, no `[command...]`" → registerTestCommand has exactly those 4 options and no `.argument`. ✅ Verified
- **AC6** "--stage verify runs full project ignoring --surface" → test-command.test.ts "seals a stage=verify marker from the top-level command even when a surface is named" (A015). ✅ Verified
- **AC7** "route-everything + checkpoint-wrapping removed from all build/verify defs + dogfood; byte/line dropped; final-seal kept; ana-plan unchanged" → template-capture-instruction.test.ts (A016–A020); grep clean; ana-plan.md untouched. ✅ Verified
- **AC8** "template-propagation, agent-proof-context, rewritten template-capture-instruction pass; old @ana A024 test removed" → all three suites green; old-format rejection test removed. ✅ Verified
- **AC9** "gate present-check unchanged, only parsed field set narrows; no new re-parse path" → `evaluateCaptureGate`/`validateCapturePresent`/`parseMarkers` untouched except dropping `bytes`/`lines` from the parser; artifact.test.ts gate tests green. ✅ Verified
- **AC10** "docstrings corrected: test.ts, capture-marker.ts, capture-runner.ts" → all three updated. ✅ Verified
- **AC11** "codex dogfood ana-build/ana-verify synced + byte-check test" → codex-learn-template.test.ts loops `CODEX_AGENT_FILES` (A021/A022). ✅ Verified
- **AC12** "full suite green; no fragile prose assertions; one clean diff" → 138 files, 3424 passed / 2 skipped. ✅ Verified
- **AC13** "no new dependents on result.bytes / marker bytes/lines in src/ (grep clean)" → grep of src/ shows only unrelated `const lines: string[]` locals. ✅ Verified
- **AC14** "lint clean; build succeeds" → pre-commit lint 0 errors (1 pre-existing warning in git-operations.ts); build success. ✅ Verified

## Implementation Decisions

- **`failOrDegrade` → `failClosed`.** With the checkpoint half gone, the helper collapses to a single baseline fail-closed (exit 3) return. Renamed to `failClosed` to reflect its now-singular purpose and avoid a misleading "OrDegrade" name with no degrade path.
- **`--stage verify` ignore-and-run-full via `effectiveSurface`.** Implemented as `const effectiveSurface = params.stage === 'verify' ? undefined : params.surface;` at the single resolution point, so verify always resolves top-level `commands.test`. The `--surface` help text now notes "(build stage only)".
- **Verify-stage test proves ignore, not just runs.** The A015 fixture points the `cli` surface at a non-existent binary; a passing `stage=verify` marker can only result if `--surface` was ignored and the (valid) top-level command ran — so the test would fail if the ignore logic regressed.
- **Re-tagging to the current contract.** The rewritten test files carried `@ana` tags from a prior contract (numbers that no longer matched). I re-tagged the tests I rewrote to the current contract's A001–A025 so coverage maps correctly. Learn-specific tests in codex-learn-template.test.ts were left with their existing tags per the spec ("leave untouched").

## Deviations from Contract

None — contract followed exactly. (All 25 assertions satisfied as specified; see Acceptance Criteria Coverage.)

The items below are **additions / ambiguity resolutions beyond the listed File Changes**, not contract deviations:

- **packages/cli/tests/commands/artifact.test.ts modified, though not in the spec's File Changes.** Two `formatMarker` fixtures set `bytes`/`lines`, which became type errors once those fields left `CaptureMarker` (caught by the pre-commit `typecheck:tests`). I removed those two fields from both fixtures. The gate present-check does not recompute the sha, so the fixtures' existing `createHash` sha (a valid 64-hex string) still satisfies "present" — minimal change.
- **The artifact.test.ts gate-block-message test used an old-format marker that now parses.** Its marker (`…bytes=9 sha256=… file=… counts=abstain verdict=abstain`) relied on the old required-`lines` rule to be rejected; once `lines` is optional it parses as a valid seal, so the test's "blocked" expectation would fail. I replaced the marker with a non-hex-`sha256` placeholder (genuinely fails the strict grammar), preserving the test's intent (gate blocks + message names the reason/fix/disable). This is the same "now-wrong test" class as the removed capture-marker A024 test, in a file the plan didn't enumerate.
- **Build-instruction lead-in reworded.** The spec said remove the "Run every test through `ana test`" sentence but keep the Baseline bullet, which still needs a lead-in. I reworded it to "**Seal the final test run with `ana test`** — the capture-aware path." to introduce the surviving bullet accurately.

## Test Evidence

Sealed build capture (engine-attested, full project):

<!-- ana:capture stage=build slug=simplify-seal-and-test-core counts=3424p/0f/2s verdict=pass sha256=d7ffcfdb461f7bb6b7158f349d61d3e2e44a3a883430ef64af9e22e68cb0e1c3 -->

## Test Results

### Baseline (before changes)
Command: `ana test --stage build --slug simplify-seal-and-test-core` (full project via top-level `commands.test`)
```
✓ captured  counts: 3429 passed, 0 failed, 2 skipped  (verdict: pass)
```
Tests: 3429 passed, 0 failed, 2 skipped (3431 total) — 138 test files.

### After Changes
Command: `(cd packages/cli && pnpm vitest run)`
```
 Test Files  138 passed (138)
      Tests  3424 passed | 2 skipped (3426)
   Duration  49.84s
```
Sealed via the locally-built CLI (`node packages/cli/dist/index.js test --stage build --slug simplify-seal-and-test-core`), run twice — byte-identical marker both times (live determinism check):
```
<!-- ana:capture stage=build slug=simplify-seal-and-test-core counts=3424p/0f/2s verdict=pass sha256=d7ffcfdb461f7bb6b7158f349d61d3e2e44a3a883430ef64af9e22e68cb0e1c3 -->
```
Tests: 3424 passed, 0 failed, 2 skipped (3426 total) — 138 test files.

### Comparison
- Tests added: ~7 (canonical-layout, idempotency, hash-recompute, hash-discriminates, verify-runs-full, gate-no-marker-blocks, plus the generalized codex byte-check covering more files in one test).
- Tests removed: ~12 (5× `isCheckpointSealConflict`, 4× `executeCapture — checkpoint`, `countLines`, old-format A024 rejection, the single-file codex-learn dogfood test folded into a loop).
- Net: 3431 → 3426 total (−5). Spec did not pin a fixed total ("assert green, not a fixed number").
- Regressions: none. No test removed except the checkpoint/conflict/bytes/lines machinery the spec directed removing; no assertion weakened.

### New Tests Written
- capture-marker.test.ts: canonical byte-layout, two-capture idempotency, sha-recomputes-from-fields, sha-discriminates-on-verdict/counts, drops-bytes/lines shape, no-marker-blocks gate.
- test-command.test.ts: verify seals a `stage=verify` marker from the top-level command when a surface is named (proves ignore-and-run-full).
- codex-learn-template.test.ts: every `CODEX_AGENT_FILES` dogfood `.md` == template (byte-for-byte).

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```
Targeted regression files:
```
(cd packages/cli && pnpm vitest run tests/utils/capture-marker.test.ts tests/utils/capture-runner.test.ts tests/commands/test-command.test.ts tests/commands/template-capture-instruction.test.ts tests/templates/agent-proof-context.test.ts tests/templates/codex-learn-template.test.ts tests/commands/artifact.test.ts)
```
Determinism (build the CLI first):
```
node packages/cli/dist/index.js test --stage build --slug simplify-seal-and-test-core   # run twice → identical marker
```

## Git History
```
ac21de00 [simplify-seal-and-test-core] Correct agent defs + enforce codex dogfood
b1845f72 [simplify-seal-and-test-core] Deterministic seal + remove checkpoint machinery
```

## Open Issues

- **The globally-installed `ana` is stale (old bytes/lines marker).** Running `ana test …` from PATH still emits the old `bytes=…/lines=…` marker — that binary is not this worktree's build. The build report's sealed marker was produced by the locally-built CLI (`node packages/cli/dist/index.js …`). AnaVerify must seal its verify run the same way (build the worktree, run the local `dist`), or the global `ana` will mint an old-shape marker. Severity: observation; suggested action: monitor.
- **`@ana` tag namespace collides across contracts.** Several other test files carry `@ana A001…A0xx` tags belonging to prior/other contracts; the id space restarts per contract, so a bare grep for `@ana A011` matches both this contract's tests and unrelated ones. My 25 tags live in the four logical files for this contract and are correct; the collision is a pre-existing repo convention, not introduced here. Severity: observation; suggested action: monitor.
- **Net −5 tests.** Removing the checkpoint/conflict machinery deleted more tests than the determinism work added. Expected and spec-sanctioned (the spec did not pin a total), recorded for transparency. Severity: observation; suggested action: acknowledge.

Second pass — re-examined the diff for anything noticed-but-unwritten: the `failOrDegrade`→`failClosed` rename, the artifact.test.ts touch, and the build-instruction rewording are all captured above (Implementation Decisions / Deviations). No unused imports or params remain (lint clean). No further concerns surfaced. Verified complete by second pass.
