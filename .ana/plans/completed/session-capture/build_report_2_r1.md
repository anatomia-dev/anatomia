# Build Report: session-capture — Phase 2 (Derive + attach)

**Created by:** AnaBuild
**Date:** 2026-06-07
**Spec:** .ana/plans/active/session-capture/spec-2.md
**Branch:** feature/session-capture

## What Was Built

For each file created or modified:

- `packages/cli/src/data/pricing.ts` (created): Versioned price table (`PRICE_TABLE_VERSION`, `PRICES`) and a pure `computeCost(tokens, model)` — no network, no clock. Unknown model → `cost_usd: 0` with the version still stamped (never throws). Cost rounded to 6 dp for a byte-stable estimate.
- `packages/cli/src/utils/forensics.ts` (modified): Added `ProvenanceCounts` type, `deriveTranscript(path, harness)` (deterministic), and `updateSessionRecord(sessionId, derived)`; extended `SessionRecord` with optional `derived?`. Claude branch dedupes token usage by top-level `requestId`, reads per-message `model`. Codex branch reads `model` from `turn_context.payload.model` and tokens from the **last** cumulative `event_msg`/`token_count` `total_token_usage`. Duration from transcript timestamps only (parse, not clock). Malformed lines are skipped, never thrown.
- `packages/cli/src/commands/artifact.ts` (modified): `captureModulesTouched` now also writes `module_churn` (per-file `{added, deleted}`) from a sibling `git diff --numstat` over the same merge-base, folded into the existing `.saves.json` read/write (no extra read). `modules_touched` left exactly as-is. Binary files coerce to `0/0`. Exported `computeModuleChurn` for unit testing.
- `packages/cli/src/types/proof.ts` (modified): **Touch 1/4** — added optional `process?: ProcessAttestation` to `ProofChainEntry`. `ProcessAttestation` carries work-item-level `outcome` + `task_shape` + `module_churn` **plus `sessions: SessionProvenance[]`** — one entry per matching session (role/harness/model/agent_def_hash/cli_version/session_id/derived). `outcome` stays top-level (contract A032). (See Deviations — Delta #4.)
- `packages/cli/src/utils/proofSummary.ts` (modified): **Touch 2/4** — documented that `process` is an optional attach (defaults absent), consistent with its optionality.
- `packages/cli/src/commands/work-proof.ts` (modified): **Touch 3/4** — reads `module_churn` from `.saves.json`; assembles and spreads the optional `process` attestation at work-complete, gated on `isProcessCaptureEnabled` + matching worktree sessions. Collects **ALL** matching sessions (deterministic order: timestamp, then role), one `SessionProvenance` each. Exported `assembleProcessAttestation`. **Contains the human-approved slug-recovery DEVIATION + the all-sessions DEVIATION (see Deviations).**
- `packages/cli/src/commands/proof.ts` (modified): **Touch 4/4** — display-only "Provenance" section: one line per session (harness · role · model · turns/tools/tokens/cost) plus a work-item `total` (session count + combined cost + table version) and `churn`, gated on `entry.process`. Never influences PASS/FAIL. Added `formatTokenCount`.
- `packages/cli/src/commands/_capture.ts` (modified): `--derive` mode (SessionEnd/Stop) — total, exits 0 always, no network. Runs `deriveTranscript` on the finished transcript and writes counts back into the matching buffer record. Codex transcript-path glob fallback (`$CODEX_HOME/sessions/**/rollout-*-<session_id>.jsonl`); harness detection from env or path shape.
- `packages/cli/src/commands/init/assets.ts` (modified): Installs the SessionEnd (Claude) / Stop (Codex) derive hook alongside SessionStart; prune now removes **both** capture entries on flip-off (`isCaptureCommand` matches `ana _capture` and `ana _capture --derive`). **Delta #2** — `ensureCodexHooksFlag` idempotently merges `[features] hooks = true` into an existing `config.toml`.
- `packages/cli/templates/.codex/hooks.json` (modified): Added the `Stop` → `ana _capture --derive` hook.
- Tests created: `tests/data/pricing.test.ts`, `tests/utils/forensics-derive.test.ts`, `tests/commands/artifact-module-churn.test.ts`, `tests/commands/work-proof-process.test.ts`. Tests extended: `tests/commands/_capture.test.ts` (derive mode + network-denylist now covers pricing.ts), `tests/commands/init/assets-capture-hooks.test.ts` (Claude SessionEnd + **Delta #3** full Codex install/prune/config coverage).

## PR Summary

- Derives durable, **deterministic** provenance (tokens, cost, model, turns, tool/command counts, duration) from finished agent transcripts — Claude (requestId-deduped) and Codex (cumulative total) — with a versioned local price table; no network, no clock, no raw transcript body persisted.
- Attaches an optional `process` attestation to the proof at `ana work complete` via the `commit_hygiene` 4-touch pattern: per-session provenance for ALL the work item's sessions (plan/build/rework/verify), plus work-item-level outcome joins, task shape, and per-file `module_churn`. The field is decoupled and never gates the proof — capture off or no matching session → a valid proof that simply omits it.
- Records per-file `module_churn` (`git diff --numstat`) without changing the existing `modules_touched` path array.
- Adds the SessionEnd/Stop derive hook so non-pipeline sessions are counted before their transcript can vanish; the install-time prune now removes both capture hooks on flip-off.
- Fixes a Codex `config.toml` silent-degrade (merges the `[features] hooks=true` flag into an existing file) and adds the previously-missing Codex install/prune/config test coverage.

## Acceptance Criteria Coverage

- AC8 "deriveTranscript counts + determinism" → `forensics-derive.test.ts` (Claude: input=1500, output=800 deduped, model, cache/turns/tools/duration/cost; Codex: cumulative total, turn_context model; determinism both) + `pricing.test.ts` (12 assertions)
- AC9 "ProcessAttestation attach via 4-touch" → `work-proof-process.test.ts` "attaches an attestation…", "captures ALL matching sessions with correct per-role metadata", "keeps repeated build attempts…", determinism, "joins outcome and task_shape…" (A031), first_pass_verify (A032), capture-off/no-match → null (A033)
- AC10 "module_churn, modules_touched unchanged" → `artifact-module-churn.test.ts` (exact churn, binary 0/0, .ana excluded, .saves.json both keys) (A029/A030)
- AC11 "SessionEnd/Stop derive, async/total" → `_capture.test.ts` "--derive" block (A034) + `assets-capture-hooks.test.ts` (hook install/prune, Claude + Codex)
- AC12 "no network, no raw body" → `_capture.test.ts` network-denylist (now covers pricing.ts) + no-raw-body record assertion; `forensics-derive.test.ts` SECRET_BODY assertions (A035)
- New "computeCost deterministic, unknown→0" → `pricing.test.ts` (A027/A028)
- New "determinism byte-identical" → `forensics-derive.test.ts` (A026)
- New "capture-off proof renders identically" → `work-proof-process.test.ts` null path + 538 proof/work regression tests green
- New "tests pass, no type errors, lint clean, count does not decrease" → 3520 passed (was 3469), 0 failed; typecheck + lint clean

**Contract coverage: 13/13 Phase-2 assertions tagged (A023–A035).** (A001–A022 are Phase 1.)

## Implementation Decisions

- **Codex shape confirmed against a real rollout** (`~/.codex/sessions/2026/05/31/rollout-*.jsonl`) — and it contradicted spec-2's assumptions (see Deviations). Recorded the confirmed shape in the `deriveCodex` JSDoc.
- **Cost rounding to 6 dp** (`Math.round(raw * 1e6) / 1e6`) for a byte-stable, recomputable estimate. Documented exact expected values in tests.
- **All matching sessions captured** in `process.sessions[]` (Delta #4), deterministically ordered by timestamp then role; rejection-cycle build reworks are kept as distinct rows.
- **`computeModuleChurn` / `assembleProcessAttestation` exported** solely to unit-test them directly; the `entry.process` spread is a typechecked one-liner mirroring the existing `commit_hygiene` structural-verification precedent.
- **`injectHookEvent` extracted** so SessionStart and SessionEnd/Stop injection share one dedup-safe code path (Claude and Codex).

## Deviations from Contract

The contract assertions (A023–A035) were followed exactly. The three deviations below are from **spec-2.md**, all human-approved, and the third also corrects spec-2's stated Codex shape.

### Delta #1 — Slug recovery for Build/Verify (human-approved, required)
**Instead:** spec-2 says "find buffer record(s) for this slug." Build/Verify launch from the MAIN repo (the agent `cd`s into the worktree only after its session starts), so `ANA_SLUG` is empty at SessionStart and Phase 1 correctly records them with an empty slug. So `assembleProcessAttestation` recovers records DETERMINISTICALLY by matching the worktree path (`.ana/worktrees/{slug}/`) against (a) the recorded `transcript_path`, (b) the record `cwd`, or (c) the transcript's OWN per-line `cwd` entries — not the buffer's empty slug field. A direct `record.slug === slug` match still wins first (covers `ana run plan --slug`).
**Reason:** The slug is genuinely unknowable at spawn for Build/Verify; matching the empty slug field would never recover them. work-complete already knows the slug.
**Outcome:** Faithful to the AC9 intent (attestation attached for slug runs) and to AC6 (empty-slug capture is correct). Think/Learn/empty-slug records not tied to a worktree stay buffer-only, as designed. Covered by `work-proof-process.test.ts` "recovers an empty-slug Build record via the transcript cwd (the DEVIATION)".

### Delta #2 — Codex config.toml silent-degrade fix (human-approved)
**Instead:** spec-2/Phase-1 only wrote `config.toml` when ABSENT, so a pre-existing TOML lacking `[features] hooks = true` got a `hooks.json` whose hooks never fired. `ensureCodexHooksFlag` now idempotently merges the flag into an existing file (set existing `hooks` key true / insert under existing `[features]` / append a `[features]` section) without mangling the user's other config.
**Reason:** Verify flagged the silent degrade as a risk; a hook that never fires is worse than none.
**Outcome:** Hook now reliably enabled. Covered by `assets-capture-hooks.test.ts` "merges the [features] hooks flag into a pre-existing config.toml". Uses regex (not a TOML parser) — noted in Open Issues.

### Delta #4 — `process` carries ALL work-item sessions (human-approved)
**Instead:** The first cut of `assembleProcessAttestation` kept only the newest matching record (always the verify session), so the committed proof lost build/plan provenance — defeating the per-role dataset goal. `ProcessAttestation` now has `sessions: SessionProvenance[]` (one per matching session: `role`/`harness`/`model`/`agent_def_hash`/`cli_version`/`session_id`/`derived`), with `outcome`/`task_shape`/`module_churn` recorded once at the work-item level. ALL sessions are kept, **including repeated build attempts from rejection cycles** (that rework is wanted data), in deterministic order (timestamp, then role).
**Reason:** The per-role provenance dataset is the point; collapsing to one session discards the build/plan rows.
**Outcome:** Contract unchanged — `outcome` stays top-level so A032 (`entry.process.outcome.first_pass_verify`) still holds; A031 (`entry.process` exists) still holds. Display renders per-session lines + a work-item total. Covered by `work-proof-process.test.ts` "captures ALL matching sessions with correct per-role metadata", "keeps repeated build attempts from rejection cycles", and a determinism test. Supersedes the earlier newest-record-only decision (previously listed as an open issue).

### Delta #3 — Codex install/prune test coverage (human-approved)
**Instead:** Phase-1 gating tests ran `--platforms claude` only. Added a full Codex describe: SessionStart `ana _capture`, Stop `ana _capture --derive`, the config-flag merge, and the flip-off prune of both hooks (user hooks preserved).
**Reason:** The Codex install/prune/config path had zero automated coverage.
**Outcome:** Codex path now covered for both Phase-1 SessionStart and Phase-2 Stop + prune.

### Codex shape correction (folded into Delta #3 work)
spec-2 stated Codex "model is session-level (first-line `session_meta` payload)" and that usage "lives in the payload." Confirmed against a real rollout this is WRONG: `session_meta.payload.model` is `null`; the model is on `turn_context.payload.model`. Usage is a CUMULATIVE running total on `event_msg`/`token_count` under `payload.info.total_token_usage` (take the LAST, do not sum); keys are `input_tokens`/`output_tokens`/`cached_input_tokens` (→ `cache_read`) with NO cache-creation equivalent. Filename UUID == `session_meta.payload.id` (confirmed). `deriveCodex` implements the confirmed shape; the spike's structured-diff/exit-code claims were not relied upon (scan finding INFERRED).

## Test Results

### Baseline (before changes)
Command: `ana test --stage build --slug session-capture`
```
captured  counts: 3469 passed, 0 failed, 2 skipped  (verdict: pass)
sealed sha256=2929c29bf53221862d677e7c7c8dd412bcc01d0269d52cf7383d0434994a1b64
```
Tests: 3469 passed, 0 failed, 2 skipped (baseline marker shown as text; the live sealed marker below is the After-Changes run)

### After Changes
Command: `ana test --stage build --slug session-capture` → `✓ captured  counts: 3523 passed, 0 failed, 2 skipped  (verdict: pass)`

Sealed capture marker (live seal — intentionally outside any code fence):

<!-- ana:capture stage=build slug=session-capture counts=3523p/0f/2s verdict=pass sha256=498a0f6b074b57662bc66cae1731d1c57723f22b2f3e38fe6564098e317085be -->

Tests: 3523 passed, 0 failed, 2 skipped (3520 after the initial Phase-2 build; +3 from the Delta #4 multi-session/rework/determinism tests)

### Comparison
- Tests added: 54 (3523 − 3469); 51 in the initial Phase-2 build + 3 for the Delta #4 amendment
- Tests removed: 0
- Regressions: none

### New Tests Written
- `tests/data/pricing.test.ts`: computeCost exact/fractional/unknown/zero/determinism; table version + unique ids.
- `tests/utils/forensics-derive.test.ts`: Claude derive (tokens/dedup/model/cache/turns/tools/files/duration/cost/test-counts), Codex derive (turn_context model, cumulative total, turns/tools), determinism, no-raw-body, edge cases (dangling/empty), `updateSessionRecord`.
- `tests/commands/artifact-module-churn.test.ts`: exact churn, binary 0/0, `.ana` excluded, unresolvable merge-base, `.saves.json` both-keys integration.
- `tests/commands/work-proof-process.test.ts`: attach (A031), first_pass_verify (A032), outcome/task_shape joins, the slug-recovery deviation, all-sessions/per-role capture + rejection-cycle rework + determinism (Delta #4), capture-off/no-match/dangling → null (A033).
- `tests/commands/_capture.test.ts` (extended): `--derive` writes counts back, no-raw-body record, gate-off/missing-transcript/malformed → exit 0.
- `tests/commands/init/assets-capture-hooks.test.ts` (extended): Claude SessionEnd hook + prune; full Codex install/prune/config-merge.

## Verification Commands
```
pnpm run build
(cd 'packages/cli' && pnpm vitest run)
(cd 'packages/cli' && pnpm run lint)
```
Targeted: `(cd 'packages/cli' && pnpm vitest run tests/data/pricing.test.ts tests/utils/forensics-derive.test.ts tests/commands/artifact-module-churn.test.ts tests/commands/work-proof-process.test.ts tests/commands/_capture.test.ts tests/commands/init/assets-capture-hooks.test.ts)`

## Git History
```
ccb84776 [session-capture:s2] Carry all work-item sessions in ProcessAttestation
ae1def45 [session-capture:s2] SessionEnd/Stop derive hook + Codex config merge + coverage
e0c5601b [session-capture:s2] Attach optional ProcessAttestation to proof (4-touch)
dac7b1d5 [session-capture:s2] Record per-file module_churn via git diff --numstat
d7fbd7c8 [session-capture:s2] Add deterministic deriveTranscript + updateSessionRecord
2355c5ec [session-capture:s2] Add versioned price table and computeCost
```

## Open Issues

See `build_data_2.yaml` for the structured companion. Summary:

1. **Best-effort test/failure parsing** (`forensics.ts`, debt/monitor): `parseTestCounts` takes the first `N passed`/`N failed` match in tool-result text; ambiguous multi-line runner output can mis-count. Counts are provenance-only and never gate anything; documented as best-effort.
2. **Codex derive gaps** (`forensics.ts`, observation/monitor): `files_touched=0` (apply_patch parsing out of scope) and `reasoning_output_tokens` excluded from `output`. Both documented best-effort, never inferred judgements.
3. **TOML flag merge is regex-based** (`assets.ts`, debt/monitor): `ensureCodexHooksFlag` uses text matching, not a TOML parser (no TOML lib is a dependency). A `hooks =` key under a non-`[features]` table could be flipped. Acceptable given the confirmed config shape; revisit if a TOML dependency lands.
4. **All sessions captured** (`work-proof.ts`, observation/acknowledge): per Delta #4, `process.sessions[]` now carries every matching session (one `SessionProvenance` per role/attempt, including rejection-cycle build reworks), in deterministic order (timestamp, then role). This supersedes the earlier newest-record-only design that discarded build/plan provenance.

Second pass — reviewed for unused params/imports, unhandled spec edge cases, and assumptions about external state. Pre-existing lint warning in `src/utils/git-operations.ts` (unused eslint-disable) is unrelated to this build and untouched. Nothing further surfaced. Verified complete by second pass.