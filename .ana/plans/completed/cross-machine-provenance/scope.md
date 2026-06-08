# Scope: Cross-machine process provenance (capture v2)

**Created by:** Ana
**Date:** 2026-06-07
**Validated by:** three independent redundant reviewers + founder + self-verification (see "Validation" below). No open spikes — the Codex hook contract was resolved from the shipped binary schema.

## Intent

Make per-session process provenance (model, tokens, churn, outcome — cost derived at display) **complete across machines and people**, so a work item's committed proof carries every role's record regardless of which machine each pipeline session ran on.

This reworks the shipped `session-capture` feature (PR #289/#291), which is correct on a **single machine** but silently incomplete across a team. It writes each session to a home-global buffer (`~/.ana/forensics/sessions.jsonl`) and, at `ana work complete`, reads *that machine's* buffer and matches sessions to the work item by local worktree paths. On a real team — Plan on one laptop, Build on another, Verify on a third — the completing machine sees only its own sessions and the proof is silently incomplete. For a product whose moat is *proof-as-dataset + mandate-verification*, a silently-incomplete proof is brand-fatal.

**Root cause (the disease):** the old design picked the wrong reconciliation point — it defers assembly to `ana work complete`, on a machine that may not hold the data, using a home-global buffer as the cross-machine channel. But a home-global file does not cross machines. Both facts the assembly needs are available *earlier and locally*: the work-item identity (slug) is the explicit argument to `ana artifact save`, and the harness session id is available in-session (Claude env var; Codex hook payload). Git is the only thing that crosses machines, and `.ana/plans/active/{slug}/` already travels through it.

**The cure:** derive each session's provenance at the `ana artifact save` checkpoint (where slug + session are both known and the transcript is on the local disk), write a self-contained per-session file into the work item, and commit it in the save's existing commit — so it travels the same git rails as every other artifact. `ana work complete` then reads committed files (no buffer, no transcript, no worktree matching) and verifies completeness.

This is a **product change** — it ships to every customer and supersedes the `session-capture` buffer/derive-hook/matching mechanism. It is the foundation the standalone anatrace tool and Anatomia mandate-verification (proof `process` verdicts) build on.

## Complexity Assessment

- **Kind:** feature
- **Size:** large
- **Surface:** cli
- **Files affected (primary):**
  - `src/commands/run.ts` — `buildCaptureEnv`: inject `ANA_RUN_ID` (per-launch UUID).
  - `src/commands/_capture.ts` — reduce the SessionStart hook to a pointer writer keyed by `ANA_RUN_ID`; **remove** the SessionEnd/Stop derive path (`executeDerive`). (Note: an unrelated `executeCapture`-style symbol also exists in `src/commands/test.ts` — do NOT touch it.)
  - `src/commands/artifact.ts` — fold derive+write+stage into **BOTH** `saveArtifact` (883) **and** `saveAllArtifacts` (1363); the "Wiring BOTH save sites is required" precedent is at 1477. Stage the provenance file in the existing `--no-verify` scoped-pathspec commit; scope the no-changes guard (1249 / 1664) so re-validation with no new work still no-ops while provenance always stages.
  - `src/utils/forensics.ts` — keep `deriveTranscript`, `ProvenanceCounts`, `computeCost`/price-table, `isProcessCaptureEnabled`; **delete** the home-buffer machinery (`appendSessionRecord`, `updateSessionRecord`, `buildSessionRecord`, `parseHookPayload`-as-buffer, `getForensicsBufferPath`, the `SessionRecord` buffer shape). Make `deriveTranscript` degrade to `null` on an unreadable/binary transcript (it already catches) — no zstd.
  - `src/commands/work-proof.ts` — `assembleProcessAttestation` reads committed `provenance/*.json` from the merged work-item tree; **delete** `recordBelongsToWorktree` (48-84) and the buffer scan; add the completeness check.
  - `src/commands/init/assets.ts` — install only the SessionStart hook; **remove** the derive-hook install (Claude `SessionEnd`, Codex `Stop`) in both the injector functions and the static `templates/.codex/hooks.json`; **add a targeted prune** that removes existing hook entries whose command is `ana _capture --derive` (PR #291 deleted the prune path, so existing installs retain the derive hook without this). Keep `provenance/` out of the generated `.ana/.gitignore` (do not add it).
  - `src/types/proof.ts` — `ProcessAttestation` gains a `completeness` record; `SessionProvenance` drops committed `cost_usd` (carry `tokens` + `model` + `price_table_version`; cost computed at display).
  - `src/commands/proof.ts` — compute `cost_usd` at display from the committed tokens/model/price-table.
  - Tests: `tests/commands/_capture.test.ts`, `tests/utils/forensics*.test.ts`, `tests/commands/work-proof-process.test.ts`, `tests/commands/init/assets-capture-hooks.test.ts` — rewrite from buffer-model to committed-file model + completeness + re-init-prune + a cross-machine fixture (a fake merged tree) + a squash-merge survival fixture.
- **Blast radius:** the capture subsystem, both `ana artifact save` paths, the proof entry shape + its only reader (`proof.ts`), hook install/prune on both platforms, and the `session-capture` tests. Confirmed *no* website consumer of the `.process` block; churn diff already excludes `.ana` so provenance files won't distort `module_churn`. Single-machine output stays at parity.
- **Estimated effort:** ~3–5 focused days incl. test rewrites; multi-phase.
- **Multi-phase:** yes

## Approach

Anchor capture on the **`ana artifact save`** checkpoint (deterministic — it always happens; a session-end event may never fire because a user can leave the tab open). Three parts:

1. **Correlation id.** `ana run` mints one `ANA_RUN_ID` per launch and injects it into the agent env (`buildCaptureEnv`). It is the only key available to *both* the SessionStart hook and the in-session `ana artifact save`, on *both* harnesses — needed because at save-time neither harness exposes the session id as an env var to a child process (Claude has `$CLAUDE_CODE_SESSION_ID`, but using one mechanism for both, and for concurrency safety, `ANA_RUN_ID` is the correlation key). Its job is save-time correlation + concurrency disambiguation, not "Codex lacks a session id."

2. **One SessionStart hook (fires once), pointer only.** On session start the hook records the harness-supplied `session_id` (and `transcript_path` when present) into a transient pointer keyed by `ANA_RUN_ID`, at `~/.ana/forensics/pending/{run_id}.json`. No derive, no git — stays inside the hook's total/never-throw contract. SessionStart fires once on both harnesses (Codex `Stop` is turn-scoped and is removed entirely, so there is no per-turn hook).

3. **Derive + write + commit at `ana artifact save`.** The save (slug is the required arg; it already commits `--no-verify` with a scoped pathspec on the role-correct branch and pushes) additionally: reads the pointer by `ANA_RUN_ID` (Claude fallback: `$CLAUDE_CODE_SESSION_ID`), derives the complete-so-far transcript via `deriveTranscript`, writes a self-contained `.ana/plans/active/{slug}/provenance/{role}-{session_id}.json`, stages it in the same commit, and deletes the consumed pointer. Re-saves overwrite the same file (latest counts win). Separate sessions (rework cycles) write distinct files — no merge conflicts, full per-attempt data. Wired into **both** `saveArtifact` and `saveAllArtifacts`.

At `ana work complete`, `assembleProcessAttestation` reads the committed `provenance/*.json` from the **merged artifact-branch tree** (worktree is removed before the archive copy, but the merged content is already in the main tree — assembly reads `completed/{slug}/provenance/`, which is safe). It then runs a **completeness check**: a per-phase **presence floor** — for each phase, assert ≥1 `build` and a `verify` are present, plus one `plan` for the item; the expected build count is tied to *saved* build reports (not raw `rejection_cycles`, which would false-fail legitimate rework); `ana`/`learn` roles are excluded. A gap is recorded in the proof entry and **warned**; under an opt-in strict mode (an `ana.json` user field that survives re-init) it fails. Loud, never silent.

**Net removal (the elegant-solution-removes test):** delete the per-turn derive hook, the home buffer **entirely** (the standalone tool reads raw transcripts directly — no demoted buffer), `recordBelongsToWorktree`, and the committed `cost_usd`. Keep one SessionStart pointer hook + derive-and-commit folded into a commit that already happens.

**Accepted data boundaries (founder-approved, documented on the dataset — not silent):**
- Capturing at save-time omits post-save work (e.g. Verify's `ana pr create`). Deliberate — that is overhead, not the role's core work.
- Subagent (Task tool) transcripts are excluded; counts reflect the main session.
- A resumed/compacted session's counts reflect the latest session segment.
- A pipeline session launched outside `ana run` (no `ANA_RUN_ID`): Claude recovers via `$CLAUDE_CODE_SESSION_ID`; Codex has no fallback, so that role surfaces as a gap in the completeness check (loud).

## Acceptance Criteria

- AC1: For a single-machine run, the proof's `process` block contains one `SessionProvenance` per role (plan, each build attempt, verify) with derived counts — at parity with today's single-machine output.
- AC2: For a run split across machines (Plan on A, Build/Verify on B), the completed proof on either machine contains all roles' provenance, assembled purely from committed files — no dependency on any machine's home state or local transcript.
- AC3: Provenance is captured on **Claude and Codex** via the SessionStart hook (which delivers `session_id`; `transcript_path` may be null on Codex, resolved by glob-by-session-id) + `ANA_RUN_ID` correlation.
- AC4: Exactly one capture hook (SessionStart) is installed; `ana init` **removes** any existing `ana _capture --derive` hook from `.claude/settings.json` and `.codex/hooks.json` (targeted prune), and re-init leaves no derive hook. A test asserts the prune on a settings file that contains the old derive hook.
- AC5: Each session's provenance is committed in the **same commit** as the artifact save that produced it, on the role-correct branch, from **both** `saveArtifact` and `saveAllArtifacts`, with no extra commit and no `git` work inside the hook. A test covers each save path.
- AC6: Re-saving overwrites that session's provenance file (latest counts win); distinct sessions produce distinct files; provenance files survive squash/rebase PR merge (fixture test).
- AC7: `ana work complete` assembles the `process` block by reading committed `provenance/*.json` from the merged tree only — `recordBelongsToWorktree` and the home-buffer scan are gone.
- AC8: The completeness check is a per-phase presence floor (≥1 build + verify per phase, one plan per item; build expectation tied to saved build reports; `ana`/`learn` excluded). A gap is recorded in the proof entry and warned; strict mode (opt-in `ana.json` field, survives re-init) fails. Correct multi-phase + rejection-cycle pipelines never false-fail.
- AC9: `ana artifact save` works when the agent was launched from any directory (slug is the arg; transcript located via the pointer/`ANA_RUN_ID`, not cwd). The no-changes guard still no-ops a true re-validation (guard scoped to artifact paths) while provenance always stages.
- AC10: The home buffer (`~/.ana/forensics/sessions.jsonl`) and its machinery are removed. The transient pointer (`pending/{run_id}.json`) is deleted by the consuming save and age-capped to prevent orphan accumulation. Nothing grows unbounded.
- AC11: `cost_usd` is NOT committed; committed records carry `tokens` + `model` + `price_table_version`, and `cost_usd` is computed at display in `proof.ts`. No per-session USD is written into customer git history.
- AC12: Test count does not decrease; capture/forensics/work-proof/init-hook suites cover the committed-file model, the completeness check, the re-init prune, and a cross-machine fixture.
- AC13: No transcript bodies are committed — only derived counts/metadata, preserving the local-only/no-network/no-raw-transcript posture.

## Edge Cases & Risks

- **Launched outside `ana run`** (no `ANA_RUN_ID`): Claude → `$CLAUDE_CODE_SESSION_ID`; Codex → gap surfaced by the completeness check (loud).
- **SessionStart hook didn't fire** (capture off, malformed payload): same fallback chain as above; never silent.
- **Agent never saves an artifact** (abandoned/crashed): no provenance and no artifact → work item can't progress → nothing to be incomplete about.
- **Re-save behavior change:** because provenance derives from a live, growing transcript, a re-save with new turns now produces a commit even if the report is unchanged. The no-changes guard is scoped to artifact paths so a true no-work re-validation still exits cleanly; document the changed behavior.
- **Multi-phase build/verify sessions:** stored as a flat `sessions[]` (matches today's shape); no phase tag in the filename. Completeness counts presence per phase via saved reports, not session-id parsing.
- **Concurrency:** two `ana run` launches mint distinct `ANA_RUN_ID`s → distinct pointers and distinct `{role}-{session_id}.json` files → no clobber.
- **Branch/merge:** distinct per-session filenames union cleanly across merge/squash/rebase; verify with a squash fixture. Worktree branches from artifact-branch HEAD at `work start`, inheriting committed planning artifacts; assembly reads the merged artifact-branch tree at completion.
- **Codex format:** cli 0.137.0 writes plain `.jsonl` (verified 0 `.zst` / 29). `deriveTranscript` degrades to null on an unreadable file — no zstd dependency added.
- **`.gitignore`:** generated `.ana/.gitignore` does not ignore `provenance/`; re-init refreshes it wholesale, so the requirement is simply "never add `provenance/` to the generator." Add a regression test.
- **Privacy:** committed records carry tokens/model only; `cost_usd` is display-derived (AC11) — no USD in git history.

## Rejected Approaches

- **Commit from the SessionEnd/Stop hook.** Violates the hook's total contract (never throw/block, <250ms, no network); pre-commit runs `pnpm install`; Codex `Stop` is turn-scoped (fires per turn). Killed.
- **`ana run` parent commits after the session ends.** The session may never cleanly end (tab left open); relying on `spawnSync` returning is unreliable, and after-the-fact commit captures irrelevant post-save chatter. Killed by founder.
- **In-agent capture via `$CLAUDE_CODE_SESSION_ID` only / hookless cwd+newest-rollout.** Claude-only without a hook, and the Codex cwd+recency glob is racy under concurrent same-cwd sessions. The SessionStart pointer + `ANA_RUN_ID` is the concurrency-safe cross-harness choice. (Considered and rejected on concurrency safety, not feasibility.)
- **Store provenance in shared `.saves.json`.** One file edited on two divergent branches → merge-conflict risk in the cross-team case. Per-session files are ordering-independent. Killed.
- **Keep the home buffer (demoted).** A home-global file does not cross machines and re-introduces the concept the rework removes; the standalone tool reads raw transcripts. Deleted entirely.
- **Commit `cost_usd`.** Writes per-session USD into customer git history (and PR diffs). Derive at display instead. Killed.
- **Keep a SessionEnd capture to count post-save work / verify PR.** Reintroduces the turn-scoped-hook + reconcile-late disease for a boundary we accept. Killed.

## Open Questions

(None blocking. Resolved in this scope: Codex hook contract → confirmed from binary schema; cost exposure → derive at display; buffer fate → delete entirely; strict default → warn, strict opt-in.)

- Minor, for AnaPlan to settle in the spec: exact `ana.json` field name + schema for the opt-in strict completeness mode; exact age-cap window for orphan pointer pruning.

## Validation

Pressure-tested by three independent redundant reviewers (same prompt) + self-verification against current code:
- **Confirmed:** disease/shape correct; the commit machinery reused as-is; both save paths real (artifact.ts:883/1363, "wire both" precedent at 1477); no flip-off prune exists (assets.ts:265/766) → targeted prune required; buffer/`.process` consumers confined to `_capture.ts`/`forensics.ts`/`work-proof.ts`/`proof.ts` (no website); `module_churn` already excludes `.ana`; `work complete` ordering supports reading the merged tree.
- **Spike resolved:** Codex SessionStart input schema (extracted from the shipped 0.137.0 binary) requires `session_id` (+ `source`, `model`, `cwd`); `transcript_path` nullable → glob-by-id fallback retained; `Stop` is turn-scoped (`turn_id`) → removed; rollouts plain `.jsonl` (no `.zst`).
- **Folded in:** presence-floor completeness; delete buffer; derive cost at display; `ANA_RUN_ID` rationale corrected; pointer lifecycle; both save paths; derive-hook prune; drop `.zst`.

## Exploration Findings

### Patterns Discovered
- `ana artifact save` (both `saveArtifact`:883 and `saveAllArtifacts`:1363) already commits `--no-verify` + scoped pathspec on the role-correct branch and pushes; writes/stages `.saves.json` + `modules_touched`/`module_churn` (churn diff excludes `.ana` at ~196/245). Fold provenance into both, before the no-changes guard (1249/1664).
- `ana run` is spawn-and-wait; `buildCaptureEnv` (~121-153) is the `ANA_RUN_ID` injection point; env merges over `process.env` in both Claude (493) and Codex (308) dispatch.
- `deriveTranscript`/`ProvenanceCounts`/`computeCost`/`isProcessCaptureEnabled` (forensics.ts) are pure/deterministic/harness-aware — reuse verbatim.
- `.ana/plans/active/{slug}/` is git-tracked, inherited by the worktree (branched from artifact HEAD at `work start`), and `cp`'d to `completed/{slug}/` at `work complete` (work.ts:1154) after the PR merge/pull — committed files travel for free.

### Constraints Discovered
- [TYPE-VERIFIED] `_capture.ts` hooks are total (never throw, swallow, <250ms, exit 0) — no git/network from the hook.
- [TYPE-VERIFIED] Codex SessionStart input schema (0.137.0 binary) delivers `session_id`/`source`/`model`/`cwd`; `transcript_path` nullable. `Stop` is turn-scoped.
- [OBSERVED] Codex rollouts: plain `.jsonl`, filename UUID = `session_meta.payload.id`, `cwd` present; 0 `.zst` / 29.
- [TYPE-VERIFIED] `$CLAUDE_CODE_SESSION_ID` present in agent + subprocess env, equals the transcript filename.
- [TYPE-VERIFIED] No flip-off prune in `init` (assets.ts:265/766) — derive-hook removal needs a new targeted prune.
- [OBSERVED] `ANA_ROLE` is `ana` for Think (run.ts:148); `rejection_cycles` summed across phases (proofSummary.ts:~1013); phases from `countPhases(plan.md)` (work-state.ts:111).
- [OBSERVED] `.process` block readers: `proof.ts` (display) + `work-proof.ts` (assembly) only.

### Test Infrastructure
- `tests/commands/_capture.test.ts` drives the compiled CLI with stdin payloads — adapt to assert pointer writes (no derive/commit).
- `tests/commands/work-proof-process.test.ts` seeds the home buffer — rewrite to seed committed `provenance/*.json` (incl. a fake merged-tree / squash fixture) and assert the completeness check.
- `tests/commands/init/assets-capture-hooks.test.ts` — assert single SessionStart hook + the derive-hook prune on a pre-existing settings file.
- Build (`pnpm run build`) must precede these (they spawn the compiled CLI).

## For AnaPlan

### Structural Analog
`.ana/plans/completed/session-capture/` — the same subsystem being reworked. Read its spec-1/spec-2, contract, and the verify reports (especially the human-FAIL on the `recordBelongsToWorktree` prefix collision) to see exactly what exists and what this supersedes.

### Relevant Code Paths
- `src/commands/run.ts` `buildCaptureEnv` — add `ANA_RUN_ID`.
- `src/commands/_capture.ts` — SessionStart → pointer; remove derive path.
- `src/commands/artifact.ts` — `saveArtifact` (883) + `saveAllArtifacts` (1363); commit (1262/1676), no-changes guard (1249/1664), churn (196/245).
- `src/utils/forensics.ts` — keep derive/cost; remove buffer machinery.
- `src/commands/work-proof.ts` — rewrite `assembleProcessAttestation`; delete `recordBelongsToWorktree` (48-84); add completeness check.
- `src/commands/init/assets.ts` — single SessionStart install + targeted derive-hook prune; `templates/.codex/hooks.json`; `.ana/.gitignore` generator (do not add `provenance/`).
- `src/types/proof.ts` — `ProcessAttestation.completeness`; drop committed `cost_usd`.
- `src/commands/proof.ts` — compute cost at display.

### Patterns to Follow
- Commit: mirror the existing `--no-verify` scoped-pathspec + push; wire BOTH save paths (precedent comment artifact.ts:1477).
- Derive: reuse `deriveTranscript` unchanged.
- Hook safety: SessionStart stays I/O-only within the total contract.
- Prune: mirror whatever hook-keying the install uses; key the prune on the exact command `ana _capture --derive`.

### Known Gotchas
- The no-changes early-exit must not skip provenance staging; scope the guard to artifact paths.
- Re-init refreshes `.ana/.gitignore` wholesale — keep `provenance/` tracked by never adding it to the generator.
- `ANA_ROLE` is `ana` for Think; completeness vocab is `plan|build|verify`, expectations per phase tied to saved reports.
- Worktree removed before the archive copy — assemble from the merged artifact-branch tree, not the worktree.
- Unrelated `executeCapture`-style symbol in `test.ts` — don't touch it.
- Confirm provenance files survive squash/rebase (fixture), not just merge-commit.

### Things to Investigate (design judgment, not unknowns)
- Final `ana.json` schema for the opt-in strict completeness mode and the orphan-pointer age-cap value.
- Whether the SessionStart hook should also stamp `model`/`source` into the pointer (it has them) to reduce the save's transcript reads.
- One-line live sanity check on first real Codex SessionStart capture (the binary schema already confirms the contract; this is confirmation, not a blocker).
