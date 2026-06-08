# Build Report: session-capture — Phase 2 (Derive + attach)

**Created by:** AnaBuild
**Date:** 2026-06-07
**Spec:** .ana/plans/active/session-capture/spec-2.md
**Branch:** feature/session-capture

> Clean snapshot of final state after fix cycle 1 (worktree path prefix collision blocker). See **Fix History** for what changed since the prior verification.

## What Was Built

For each file created or modified:

- `packages/cli/src/data/pricing.ts` (created): Versioned price table (`PRICE_TABLE_VERSION`, `PRICES`) and a pure `computeCost(tokens, model)` — no network, no clock. Unknown model → `cost_usd: 0` with the version still stamped (never throws). Cost rounded to 6 dp for a byte-stable estimate.
- `packages/cli/src/utils/forensics.ts` (modified): Added `ProvenanceCounts` type, `deriveTranscript(path, harness)` (deterministic), and `updateSessionRecord(sessionId, derived)`; extended `SessionRecord` with optional `derived?`. Claude branch dedupes token usage by top-level `requestId`, reads per-message `model`. Codex branch reads `model` from `turn_context.payload.model` and tokens from the **last** cumulative `event_msg`/`token_count` `total_token_usage`. Duration from transcript timestamps only (parse, not clock). Malformed lines are skipped, never thrown.
- `packages/cli/src/commands/artifact.ts` (modified): `captureModulesTouched` now also writes `module_churn` (per-file `{added, deleted}`) from a sibling `git diff --numstat` over the same merge-base, folded into the existing `.saves.json` read/write (no extra read). `modules_touched` left exactly as-is. Binary files coerce to `0/0`. Exported `computeModuleChurn` for unit testing.
- `packages/cli/src/types/proof.ts` (modified): **Touch 1/4** — added optional `process?: ProcessAttestation` to `ProofChainEntry`. `ProcessAttestation` carries work-item-level `outcome` + `task_shape` + `module_churn` **plus `sessions: SessionProvenance[]`** — one entry per matching session (role/harness/model/agent_def_hash/cli_version/session_id/derived). `outcome` stays top-level (contract A032). (See Deviations — Delta #4.) **Fix cycle 2:** `SessionProvenance.derived` is now optional — a matched session with no available counts is kept as a metadata-only row.
- `packages/cli/src/utils/proofSummary.ts` (modified): **Touch 2/4** — documented that `process` is an optional attach (defaults absent), consistent with its optionality.
- `packages/cli/src/commands/work-proof.ts` (modified): **Touch 3/4** — reads `module_churn` from `.saves.json`; assembles and spreads the optional `process` attestation at work-complete, gated on `isProcessCaptureEnabled` + matching worktree sessions. Collects **ALL** matching sessions (deterministic order: timestamp, then role), one `SessionProvenance` each. Exported `assembleProcessAttestation`. Contains the human-approved slug-recovery DEVIATION + the all-sessions DEVIATION (see Deviations). **Fix cycle 1:** `recordBelongsToWorktree` now enforces a path-segment boundary before every prefix comparison (the worktree-prefix-collision blocker — see Fix History); stale JSDoc on `assembleProcessAttestation` corrected to describe the all-sessions behavior. **Fix cycle 2:** the assembly loop prefers banked `record.derived` counts over re-deriving and no longer drops a matched session when no counts are available (metadata-only row) — see Fix History.
- `packages/cli/src/commands/proof.ts` (modified): **Touch 4/4** — display-only "Provenance" section: one line per session (harness · role · model · turns/tools/tokens/cost) plus a work-item `total` (session count + combined cost + table version) and `churn`, gated on `entry.process`. Never influences PASS/FAIL. Added `formatTokenCount`. **Fix cycle 2:** a counts-less session renders as `… counts unavailable` and is excluded from the cost total / table-version pick.
- `packages/cli/src/commands/_capture.ts` (modified): `--derive` mode (SessionEnd/Stop) — total, exits 0 always, no network. Runs `deriveTranscript` on the finished transcript and writes counts back into the matching buffer record. Codex transcript-path glob fallback (`$CODEX_HOME/sessions/**/rollout-*-<session_id>.jsonl`); harness detection from env or path shape.
- `packages/cli/src/commands/init/assets.ts` (modified): Installs the SessionEnd (Claude) / Stop (Codex) derive hook alongside SessionStart; prune now removes **both** capture entries on flip-off (`isCaptureCommand` matches `ana _capture` and `ana _capture --derive`). **Delta #2** — `ensureCodexHooksFlag` idempotently merges `[features] hooks = true` into an existing `config.toml`.
- `packages/cli/templates/.codex/hooks.json` (modified): Added the `Stop` → `ana _capture --derive` hook.
- Tests created: `tests/data/pricing.test.ts`, `tests/utils/forensics-derive.test.ts`, `tests/commands/artifact-module-churn.test.ts`, `tests/commands/work-proof-process.test.ts`. Tests extended: `tests/commands/_capture.test.ts` (derive mode + network-denylist now covers pricing.ts), `tests/commands/init/assets-capture-hooks.test.ts` (Claude SessionEnd + **Delta #3** full Codex install/prune/config coverage). **Fix cycle 1:** `work-proof-process.test.ts` gains the `<slug>-v2`-not-attributed-to-`<slug>` regression test.

## Fix History

### Cycle 1 — Worktree path prefix collision (BLOCKER from verify_report_2)

Verify re-issued Phase 2 as FAIL on human severity override, with one sole blocker: `recordBelongsToWorktree` (`work-proof.ts`) matched sessions to work items with raw character-prefix comparisons (`record.cwd.startsWith(worktreePath)`, `transcript_path.includes(worktreePath)`, and the inner transcript-cwd `startsWith`). Because `…/worktrees/feat` is a character-prefix of `…/worktrees/feat-v2`, the shorter slug greedily absorbed the longer slug's sessions, silently contaminating the per-role `ProcessAttestation` dataset — the feature's core output — under ordinary iterative slug naming (`<name>`, `<name>-v2`, `<name>-fix`).

**Fix applied:**
- Added a `worktreeWithSep = worktreePath + path.sep` and an `isUnderWorktree(p)` helper (`p === worktreePath || p.startsWith(worktreeWithSep)`) inside `recordBelongsToWorktree`. This mirrors the established in-file precedent in `deriveSurface`, which appends a trailing slash before its prefix compare for exactly this collision class.
- The `record.cwd` check (line 51) and the inner transcript per-line `cwd` check now use `isUnderWorktree`.
- The `transcript_path.includes(...)` check now requires `worktreeWithSep` (a transcript is always a file *under* the worktree, never the dir itself), so a `slug-v2` transcript path can no longer substring-match `slug`.
- The cheap pre-filter `line.includes(worktreePath)` before `JSON.parse` is intentionally left broad — it only gates parsing; correctness is enforced by the inner `isUnderWorktree`. (A line whose cwd is exactly the worktree root would not contain the trailing separator, so tightening the pre-filter would skip the legitimate exact-dir case.)
- Corrected the stale `assembleProcessAttestation` JSDoc (verify Finding #3) in the same pass — it claimed "the newest by timestamp wins," contradicting the implemented all-sessions behavior.

**Regression test added:** `work-proof-process.test.ts` → "does NOT attribute a `<slug>-v2` session to `<slug>` (worktree prefix boundary)". Seeds only a `feat-v2` session (transcript cwd under `…/worktrees/feat-v2`) and asserts (a) `assembleProcessAttestation(root, 'feat', …)` returns `null` — the `feat-v2` session is never attributed to `feat` — and (b) `assembleProcessAttestation(root, 'feat-v2', …)` still correctly attributes it. This test fails against the old raw-`startsWith` code and passes with the boundary fix.

### Cycle 2 — No-session / deleted-transcript robustness (developer-requested defect fix)

`assembleProcessAttestation` re-derived counts for **every** matching record (`deriveTranscript(record.transcript_path, harness); if (!derived) continue;`). Two problems: (1) it always re-read the transcript even though the SessionEnd `--derive` hook had already banked counts into `record.derived`, and (2) if the transcript was gone (months passed, `~/.claude` cleared) the session was **dropped entirely**, silently losing it from the per-role dataset.

**Fix applied:**
- **Prefer banked counts, fall back to re-derive:** `const derived = record.derived ?? deriveTranscript(record.transcript_path, record.harness) ?? undefined;` — `record.derived` is what the SessionEnd hook wrote back and it survives transcript deletion; re-derive only runs when banked counts are absent.
- **Never drop a matched session:** the `if (!derived) continue;` is removed. The `SessionProvenance` row is always pushed with its Phase-1 metadata (role/harness/model/agent_def_hash/cli_version/session_id); the `derived` block is omitted when no counts are available (`...(derived ? { derived } : {})`). `model` falls back to `record.model || derived?.model || ''`. `null` is now returned **only** when there are zero matching sessions (unchanged).
- **`derived` made optional** on the `SessionProvenance` interface (`packages/cli/src/types/proof.ts`) so a counts-less row is a valid shape.
- **Display hardened** (`packages/cli/src/commands/proof.ts`, Touch 4/4): a counts-less session renders as `harness · role · model   counts unavailable` and is excluded from the cost total / table-version pick. Pre-existing rows with counts render unchanged.

**Guardrails preserved:** deterministic (no clock/random; banked counts are already-frozen facts), no network, no raw bodies (only counts/metadata), decoupled/optional, never gates the proof.

**Tests:** two cases added to `work-proof-process.test.ts` — (a) "uses banked derived counts when the transcript is gone (no re-derive needed)" (record with banked `derived` + dangling `transcript_path` → session keeps the banked counts); (b) "keeps a matched session (metadata only, no derived block) when banked counts are absent AND the transcript is deleted" (→ a session row with metadata and no `derived`). **Test-behavior change:** the prior test "returns null when the matched transcript is unreadable (dangling pointer)" asserted the now-superseded drop-to-null behavior; per the developer's explicit instruction it is replaced by case (b) above. Capture-off/no-match → null behavior is retained by the existing `A033` tests.

## PR Summary

- Derives durable, **deterministic** provenance (tokens, cost, model, turns, tool/command counts, duration) from finished agent transcripts — Claude (requestId-deduped) and Codex (cumulative total) — with a versioned local price table; no network, no clock, no raw transcript body persisted.
- Attaches an optional `process` attestation to the proof at `ana work complete` via the `commit_hygiene` 4-touch pattern: per-session provenance for ALL the work item's sessions (plan/build/rework/verify), plus work-item-level outcome joins, task shape, and per-file `module_churn`. The field is decoupled and never gates the proof — capture off or no matching session → a valid proof that simply omits it.
- Session-to-work-item matching enforces a path-segment boundary, so iterative slugs (`feat` vs `feat-v2`) never cross-contaminate the per-role provenance dataset.
- Provenance assembly prefers the counts the SessionEnd hook banked into the buffer record (surviving transcript deletion) and never drops a matched session — a session with no available counts is kept as a metadata-only row rather than silently lost.
- Records per-file `module_churn` (`git diff --numstat`) without changing the existing `modules_touched` path array.
- Adds the SessionEnd/Stop derive hook so non-pipeline sessions are counted before their transcript can vanish; the install-time prune now removes both capture hooks on flip-off. Also fixes a Codex `config.toml` silent-degrade (merges the `[features] hooks=true` flag into an existing file) and adds the previously-missing Codex install/prune/config test coverage.

## Acceptance Criteria Coverage

- AC8 "deriveTranscript counts + determinism" → `forensics-derive.test.ts` (Claude: input=1500, output=800 deduped, model, cache/turns/tools/duration/cost; Codex: cumulative total, turn_context model; determinism both) + `pricing.test.ts` (12 assertions)
- AC9 "ProcessAttestation attach via 4-touch" → `work-proof-process.test.ts` "attaches an attestation…", "captures ALL matching sessions with correct per-role metadata", "keeps repeated build attempts…", "does NOT attribute a `<slug>-v2` session to `<slug>`" (cycle-1 boundary regression), "uses banked derived counts when the transcript is gone" + "keeps a matched session (metadata only…)" (cycle-2 robustness), determinism, "joins outcome and task_shape…" (A031), first_pass_verify (A032), capture-off/no-match → null (A033)
- AC10 "module_churn, modules_touched unchanged" → `artifact-module-churn.test.ts` (exact churn, binary 0/0, .ana excluded, .saves.json both keys) (A029/A030)
- AC11 "SessionEnd/Stop derive, async/total" → `_capture.test.ts` "--derive" block (A034) + `assets-capture-hooks.test.ts` (hook install/prune, Claude + Codex)
- AC12 "no network, no raw body" → `_capture.test.ts` network-denylist (now covers pricing.ts) + no-raw-body record assertion; `forensics-derive.test.ts` SECRET_BODY assertions (A035)
- New "computeCost deterministic, unknown→0" → `pricing.test.ts` (A027/A028)
- New "determinism byte-identical" → `forensics-derive.test.ts` (A026)
- New "capture-off proof renders identically" → `work-proof-process.test.ts` null path + proof/work regression tests green
- New "tests pass, no type errors, lint clean, count does not decrease" → 3525 passed (was 3469 at plan time), 0 failed; typecheck + lint clean

**Contract coverage: 13/13 Phase-2 assertions tagged (A023–A035).** (A001–A022 are Phase 1.)

## Implementation Decisions

- **Path-segment boundary via an in-file `isUnderWorktree` helper** rather than a shared utility — keeps the fix local to the one function with the defect and matches the equally-local `deriveSurface` precedent in the same file. The pre-filter before `JSON.parse` stays broad by design (see Fix History).
- **Codex shape confirmed against a real rollout** (`~/.codex/sessions/2026/05/31/rollout-*.jsonl`) — and it contradicted spec-2's assumptions (see Deviations). Recorded the confirmed shape in the `deriveCodex` JSDoc.
- **Cost rounding to 6 dp** (`Math.round(raw * 1e6) / 1e6`) for a byte-stable, recomputable estimate. Documented exact expected values in tests.
- **All matching sessions captured** in `process.sessions[]` (Delta #4), deterministically ordered by timestamp then role; rejection-cycle build reworks are kept as distinct rows.
- **`computeModuleChurn` / `assembleProcessAttestation` exported** solely to unit-test them directly; the `entry.process` spread is a typechecked one-liner mirroring the existing `commit_hygiene` structural-verification precedent.
- **`injectHookEvent` extracted** so SessionStart and SessionEnd/Stop injection share one dedup-safe code path (Claude and Codex).

## Deviations from Contract

The contract assertions (A023–A035) were followed exactly. The deviations below are from **spec-2.md**, all human-approved, and the last also corrects spec-2's stated Codex shape. The fix-cycle boundary change introduces no new deviation — it satisfies A031's intent more faithfully (the attestation now carries only the work item's own sessions).

### Delta #1 — Slug recovery for Build/Verify (human-approved, required)
**Instead:** spec-2 says "find buffer record(s) for this slug." Build/Verify launch from the MAIN repo (the agent `cd`s into the worktree only after its session starts), so `ANA_SLUG` is empty at SessionStart and Phase 1 correctly records them with an empty slug. So `assembleProcessAttestation` recovers records DETERMINISTICALLY by matching the worktree path (`.ana/worktrees/{slug}/`) against (a) the recorded `transcript_path`, (b) the record `cwd`, or (c) the transcript's OWN per-line `cwd` entries — not the buffer's empty slug field. A direct `record.slug === slug` match still wins first (covers `ana run plan --slug`). The match now enforces a path-segment boundary (fix cycle 1).
**Reason:** The slug is genuinely unknowable at spawn for Build/Verify; matching the empty slug field would never recover them. work-complete already knows the slug.
**Outcome:** Faithful to the AC9 intent (attestation attached for slug runs) and to AC6 (empty-slug capture is correct). Think/Learn/empty-slug records not tied to a worktree stay buffer-only, as designed. Covered by `work-proof-process.test.ts` "recovers an empty-slug Build record via the transcript cwd (the DEVIATION)" and the new boundary regression test.

### Delta #2 — Codex config.toml silent-degrade fix (human-approved)
**Instead:** spec-2/Phase-1 only wrote `config.toml` when ABSENT, so a pre-existing TOML lacking `[features] hooks = true` got a `hooks.json` whose hooks never fired. `ensureCodexHooksFlag` now idempotently merges the flag into an existing file (set existing `hooks` key true / insert under existing `[features]` / append a `[features]` section) without mangling the user's other config.
**Reason:** Verify flagged the silent degrade as a risk; a hook that never fires is worse than none.
**Outcome:** Hook now reliably enabled. Covered by `assets-capture-hooks.test.ts` "merges the [features] hooks flag into a pre-existing config.toml". Uses regex (not a TOML parser) — noted in Open Issues.

### Delta #4 — `process` carries ALL work-item sessions (human-approved)
**Instead:** The first cut of `assembleProcessAttestation` kept only the newest matching record (always the verify session), so the committed proof lost build/plan provenance — defeating the per-role dataset goal. `ProcessAttestation` now has `sessions: SessionProvenance[]` (one per matching session: `role`/`harness`/`model`/`agent_def_hash`/`cli_version`/`session_id`/`derived`), with `outcome`/`task_shape`/`module_churn` recorded once at the work-item level. ALL sessions are kept, **including repeated build attempts from rejection cycles** (that rework is wanted data), in deterministic order (timestamp, then role).
**Reason:** The per-role provenance dataset is the point; collapsing to one session discards the build/plan rows.
**Outcome:** Contract unchanged — `outcome` stays top-level so A032 (`entry.process.outcome.first_pass_verify`) still holds; A031 (`entry.process` exists) still holds. Display renders per-session lines + a work-item total. Covered by `work-proof-process.test.ts` "captures ALL matching sessions with correct per-role metadata", "keeps repeated build attempts from rejection cycles", and a determinism test.

### Delta #3 — Codex install/prune test coverage (human-approved)
**Instead:** Phase-1 gating tests ran `--platforms claude` only. Added a full Codex describe: SessionStart `ana _capture`, Stop `ana _capture --derive`, the config-flag merge, and the flip-off prune of both hooks (user hooks preserved).
**Reason:** The Codex install/prune/config path had zero automated coverage.
**Outcome:** Codex path now covered for both Phase-1 SessionStart and Phase-2 Stop + prune.

### Codex shape correction (folded into Delta #3 work)
spec-2 stated Codex "model is session-level (first-line `session_meta` payload)" and that usage "lives in the payload." Confirmed against a real rollout this is WRONG: `session_meta.payload.model` is `null`; the model is on `turn_context.payload.model`. Usage is a CUMULATIVE running total on `event_msg`/`token_count` under `payload.info.total_token_usage` (take the LAST, do not sum); keys are `input_tokens`/`output_tokens`/`cached_input_tokens` (→ `cache_read`) with NO cache-creation equivalent. Filename UUID == `session_meta.payload.id` (confirmed). `deriveCodex` implements the confirmed shape; the spike's structured-diff/exit-code claims were not relied upon (scan finding INFERRED).

## Test Results

### Baseline (plan-time)
Plan-time baseline was 3424 (per verify_report_2); the initial Phase-2 build measured 3469 → 3523. Fix cycle 1 baseline (target file, before fix): `work-proof-process.test.ts` 11 passed.

### After Changes (fix cycle 2 — current state)
Command: `ana test --stage build --slug session-capture` → `✓ captured  counts: 3525 passed, 0 failed, 2 skipped  (verdict: pass)`

Sealed capture marker (live seal — intentionally outside any code fence):

<!-- ana:capture stage=build slug=session-capture counts=3525p/0f/2s verdict=pass sha256=5a748dc280af053030c92294de99ed5815d81a931546f8915aa65e1ed27787a1 -->

Tests: 3525 passed, 0 failed, 2 skipped. Targeted `work-proof-process.test.ts`: 13 passed (was 12; net +1 — replaced the dangling-→null test with two no-counts robustness cases).

Build: `pnpm run build` — success. Typecheck: `tsc --noEmit` (source) and `tsc --noEmit -p tsconfig.test.json` (tests) — both 0 errors. Lint: `eslint src/commands/work-proof.ts src/commands/proof.ts src/types/proof.ts tests/commands/work-proof-process.test.ts` — 0 errors, 0 warnings.

Fix cycle 1 prior seal (3524p/0f/2s): `sha256=67fb31f892a98868f102c47a7b94a68490a80bfd4d0cdba29f076e0e6702bec6`.

### Comparison
- Tests added cycle 1: 1 (3523 → 3524) — the `<slug>-v2` boundary regression test.
- Tests net change cycle 2: +1 (3524 → 3525) — added 2 no-counts robustness cases, replaced 1 superseded dangling-→null test.
- Tests removed: 1 in cycle 2 — "returns null when the matched transcript is unreadable (dangling pointer)", whose drop-to-null assertion is intentionally superseded by the developer-requested behavior (a matched session is kept, not dropped). Replaced by case (b).
- Regressions: none

### New Tests Written
- Cycle 1 — `tests/commands/work-proof-process.test.ts`: "does NOT attribute a `<slug>-v2` session to `<slug>` (worktree prefix boundary)" — proves the boundary fix; fails against pre-fix code.
- Cycle 2 — `tests/commands/work-proof-process.test.ts`: "uses banked derived counts when the transcript is gone (no re-derive needed)" and "keeps a matched session (metadata only, no derived block) when banked counts are absent AND the transcript is deleted".

## Verification Commands
```
pnpm run build
(cd 'packages/cli' && pnpm vitest run)
(cd 'packages/cli' && pnpm run lint)
```
Targeted: `(cd 'packages/cli' && pnpm vitest run tests/commands/work-proof-process.test.ts)`

## Git History
```
41cdc1cb [session-capture:s2] Fix: prefer banked counts, never drop a matched session
e845e24a [session-capture:s2] Fix: path-segment boundary in recordBelongsToWorktree
ccb84776 [session-capture:s2] Carry all work-item sessions in ProcessAttestation
ae1def45 [session-capture:s2] SessionEnd/Stop derive hook + Codex config merge + coverage
e0c5601b [session-capture:s2] Attach optional ProcessAttestation to proof (4-touch)
dac7b1d5 [session-capture:s2] Record per-file module_churn via git diff --numstat
d7fbd7c8 [session-capture:s2] Add deterministic deriveTranscript + updateSessionRecord
2355c5ec [session-capture:s2] Add versioned price table and computeCost
```

## Open Issues

See `build_data_2.yaml` for the structured companion. Summary:

1. **Best-effort test/failure parsing** (`forensics.ts`, debt/monitor): `parseTestCounts` takes the first `N passed`/`N failed` match in tool-result text; ambiguous multi-line runner output can mis-count. Counts are provenance-only and never gate anything; documented as best-effort. (Verify Finding #7.)
2. **Codex derive gaps** (`forensics.ts`, observation/monitor): `files_touched=0` (apply_patch parsing out of scope) and `reasoning_output_tokens` excluded from `output`. Both documented best-effort, never inferred judgements.
3. **TOML flag merge is regex-based** (`assets.ts`, debt/monitor): `ensureCodexHooksFlag` uses text matching, not a TOML parser (no TOML lib is a dependency). A `hooks =` key under a non-`[features]` table could be flipped. Acceptable given the confirmed config shape; revisit if a TOML dependency lands.
4. **Unbounded home-global buffer scan** (`work-proof.ts`, debt/monitor — verify Finding #2): `assembleProcessAttestation` reads `~/.ana/forensics/sessions.jsonl` (machine-wide, never pruned in Phase 1) in full and reads each non-slug-matched record's full transcript end-to-end. Cost grows linearly with lifetime session count. Provenance-only and best-effort, not a correctness blocker; a buffer-prune or slug-indexed lookup would bound it. Out of scope for this fix cycle (the blocker was correctness, not cost).
5. **AC12 no-network scan boundary** (`_capture.test.ts`, observation/monitor — verify Finding #5): the enforcement scan covers the derive/cost core but not the `work-proof.ts` assembly wrapper. Source inspection confirms no network code on the assembly path; adding `work-proof.ts` to the scanned set would close the phrasing gap.
6. **SessionEnd derive blocks on a synchronous full-transcript read before exit** (`_capture.ts`, observation/acknowledge — verify Finding #6): `executeDerive` awaits a `readFileSync` + per-line parse before `process.exit(0)`. Low impact; the 250ms stdin cap bounds the read-wait, not the derive.

Second pass — **Cycle 1:** reviewed for unused params/imports (the `isUnderWorktree` closure is used in three sites; no dead code), boundary edge cases (exact-dir cwd handled by the `=== worktreePath` branch; the broad pre-filter is intentional and documented), and that no other raw `startsWith(worktreePath)`/`includes(worktreePath)` comparisons remain in the matching path (grep-confirmed: the only remaining bare `includes(worktreePath)` is the documented pre-filter gate). **Cycle 2:** confirmed every consumer of `SessionProvenance.derived` handles the now-optional field — grep-confirmed the only consumers are `proof.ts` (guarded: `if (d)` for the per-session line, `if (!s.derived) continue` for the total) and the tests (non-null asserted where a `derived` block is expected). Determinism holds (a counts-less row serializes identically across runs since it omits `derived` deterministically). No `derived!`-without-guard remains in source. Pre-existing lint warning in `src/utils/git-operations.ts:198` (unused eslint-disable) is unrelated to this build and untouched. Nothing further surfaced. Verified complete by second pass.
