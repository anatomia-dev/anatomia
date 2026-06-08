# Scope: Cross-machine process provenance (capture v2)

**Created by:** Ana
**Date:** 2026-06-07

## Intent

Make per-session process provenance (model, tokens, cost, duration, turns, churn, outcome) **complete across machines and people**, so a work item's committed proof carries every role's record regardless of which machine each pipeline session ran on.

This is a rework of the shipped `session-capture` feature (PR #289/#291). That version captures correctly **only on a single machine**: it writes each session to a home-global buffer (`~/.ana/forensics/sessions.jsonl`) and, at `ana work complete`, reads *that machine's* buffer and matches sessions to the work item by local worktree paths. On a real team — Plan on one laptop, Build on another, Verify on a third — the completing machine silently sees only its own sessions, and the proof is silently incomplete. For a product whose moat is *proof-as-dataset + mandate-verification*, a silently-incomplete proof is brand-fatal.

The fix: capture provenance **where the work item identity and the session are both known, derive it at the artifact-save checkpoint, and commit it into the work item** so it travels through the same git channel as every other artifact. The local home buffer stops being the source of truth.

This is a **product change** — it ships to every customer on their next `ana init`/CLI update, and changes the `session-capture` mechanism. It is the foundation the standalone anatrace tool and Anatomia mandate-verification (proof `process` verdicts) build on.

## Complexity Assessment

- **Kind:** feature
- **Size:** large
- **Surface:** cli
- **Files affected (primary):**
  - `src/commands/_capture.ts` — reduce the SessionStart hook to a pointer writer; **remove** the SessionEnd/Stop derive hook path.
  - `src/utils/forensics.ts` — keep `deriveTranscript`/`ProvenanceCounts`/`isProcessCaptureEnabled`; remove the home-buffer-as-source-of-truth machinery (`appendSessionRecord`, `updateSessionRecord`, buffer record shape) in favor of a transient pointer + a committed per-session record.
  - `src/commands/artifact.ts` — at save, read the pointer, derive the transcript, write the per-session provenance file, stage it in the existing `--no-verify` commit.
  - `src/commands/run.ts` — inject a per-launch correlation id (`ANA_RUN_ID`) into the agent env in `buildCaptureEnv`.
  - `src/commands/work-proof.ts` — `assembleProcessAttestation` reads committed provenance files (not the buffer); **delete** `recordBelongsToWorktree`; add the completeness check.
  - `src/commands/init/assets.ts` — install only the SessionStart hook; remove the SessionEnd (Claude) / Stop (Codex) derive-hook install.
  - `src/types/proof.ts` — `ProcessAttestation` gains a completeness record; `SessionProvenance` unchanged in spirit.
  - Tests: `tests/commands/_capture.test.ts`, `tests/utils/forensics*.test.ts`, `tests/commands/work-proof-process.test.ts`, `tests/commands/init/assets-capture-hooks.test.ts` — substantial rewrites (the buffer-scan + matching tests become committed-file tests).
- **Blast radius:** the capture subsystem, `ana artifact save` commit path, the proof chain entry shape, hook install on both platforms, and the `session-capture` tests. No effect on scan/init-context/website beyond hook-install templates. Re-init must keep installing the (now single) SessionStart hook idempotently and must not reintroduce the removed derive hook.
- **Estimated effort:** ~3–5 focused days incl. the Codex live spike and test rewrites; multi-phase.
- **Multi-phase:** yes

## Approach

Capture provenance at the moment both facts are known — and let it ride the rails that already cross machines.

The disease (name it precisely): **provenance is the only pipeline output not synced through git, because counts are knowable only at session-time while the work-item identity (slug) and the harness session id are knowable only mid-session — and the old design tried to reconcile them later, on a machine that may not have the data.** Git is the only thing that crosses machines, and `.ana/plans/active/{slug}/` already travels through it (artifact branch for Plan/Think; worktree feature branch → PR merge for Build/Verify). So provenance must become a committed artifact of the work item.

Three moving parts, anchored on the **artifact save** as the deterministic trigger (not session-end, which may never fire):

1. **A correlation id.** `ana run` mints one id per launch (`ANA_RUN_ID`) and injects it into the agent env. It is the harness-agnostic key that ties the SessionStart hook and the in-session `ana artifact save` together — this is what makes the design work on **Codex**, which exposes no session-id environment variable (confirmed: OpenAI feature request openai/codex#8923 is still open as of June 2026).

2. **One SessionStart hook (fires once), pointer only.** On session start, the hook records the harness-supplied `session_id` (+ transcript path if provided) into a small transient pointer keyed by `ANA_RUN_ID`. It does **not** derive and does **not** commit — it just leaves a breadcrumb so the later save knows which transcript is its own. The SessionStart hook is *necessary* (not a convenience): on Codex it is the only way to learn the session id. It fires once per session on both harnesses, so there is **no per-turn hook** (the per-turn Codex `Stop` derive hook is removed).

3. **Derive + write + commit at `ana artifact save`.** When the agent saves its report (`ana artifact save {type} {slug}` — the slug is the required arg, the save already commits `--no-verify` with a scoped pathspec on the correct branch and pushes), the command additionally: reads the pointer by `ANA_RUN_ID`, derives the complete-so-far transcript counts via the existing `deriveTranscript`, writes a self-contained `provenance/{role}-{session_id}.json` into the work-item dir, and includes it in the same commit. Re-saves overwrite the same file (last/most-complete wins). Separate sessions (rework cycles) write distinct files — no merge conflicts, full per-attempt data.

At `ana work complete`, `assembleProcessAttestation` becomes a **read of the committed `provenance/*.json` files** (no buffer, no transcript, no worktree-path matching) plus a **completeness check**: derive the expected role set (plan + build×(rejection cycles, per phase) + verify) and compare to found; record any gap in the proof entry itself and warn (fail under an opt-in strict mode). This is the *verified-over-trusted* pillar — the proof verifies its own provenance completeness instead of silently omitting.

Net removal (the elegant-solution-removes test): delete the per-turn derive hook, the home-buffer-as-source-of-truth, and `recordBelongsToWorktree`. Keep one SessionStart pointer hook + a derive-and-write folded into a commit that already happens.

**Accepted data boundary (founder-approved):** capturing at save-time means anything the agent does *after* its final save (e.g. Verify's `ana pr create` PR authoring, or a post-save "how did that go?" follow-up) is not counted. This is deliberate — that work is overhead, not the role's core work — and must be **documented** on the dataset, not silent.

## Acceptance Criteria

- AC1: For a pipeline run entirely on one machine, the completed proof entry's `process` block contains one `SessionProvenance` per role (plan, each build attempt, verify) with derived counts — at parity with today's single-machine output.
- AC2: For a pipeline run split across machines (Plan on machine A, Build/Verify on machine B), the completed proof on either machine contains **all** roles' provenance, assembled purely from committed files — no dependency on any single machine's home buffer or local transcript.
- AC3: Provenance is captured identically on **Claude and Codex**, using the SessionStart hook + `ANA_RUN_ID` correlation (no dependency on a Codex session-id env var).
- AC4: There is **no per-turn hook**. Exactly one capture hook is installed (SessionStart); the SessionEnd (Claude) / Stop (Codex) derive hook is removed by `ana init` and absent after re-init.
- AC5: Each session's provenance is committed in the **same commit** as the artifact save that produced it, on the role's correct branch (artifact branch for Plan/Think; feature branch for Build/Verify), with no extra commit and no `git` work performed inside the hook.
- AC6: Re-saving an artifact overwrites that session's provenance file (latest counts win); distinct sessions (rework cycles) produce distinct files; no merge conflicts on the provenance files across the PR merge.
- AC7: `ana work complete` assembles the `process` block by reading committed `provenance/*.json` files only — `recordBelongsToWorktree` and the home-buffer scan are removed.
- AC8: `ana work complete` performs a completeness check (expected vs found roles), records any gap in the proof entry, and warns; under an opt-in strict mode it fails. A missing role surfaces loudly, never silently.
- AC9: `ana artifact save` works when the agent was launched from any directory (the slug is the explicit arg; the transcript is located via the pointer/`ANA_RUN_ID`, not via cwd).
- AC10: The home buffer is no longer the proof's source of truth and does not grow unbounded; any transient pointer is bounded/cleaned after consumption.
- AC11: Test count does not decrease; the capture/forensics/work-proof/init-hook suites are updated to cover the committed-file model, the completeness check, and the cross-machine path (simulated via fixture commits).
- AC12: No transcript bodies are committed — only derived counts/metadata, preserving the existing local-only/no-network/no-raw-transcript posture.

## Edge Cases & Risks

- **SessionStart hook didn't fire** (capture off, malformed payload): on Claude, the save falls back to `$CLAUDE_CODE_SESSION_ID`; on Codex there is no fallback, so the session shows as a gap in the completeness check (loud, not silent). Acceptable.
- **Agent never saves an artifact** (abandoned/crashed session): no provenance and no artifact → the work item cannot progress, so there is nothing to be incomplete about. Acceptable.
- **Verify PR authoring after save** and **post-save chatter**: not captured by design (documented boundary, AC + dataset note).
- **Codex `Stop` is turn-scoped** (would fire per turn): the derive hook is removed entirely, so this hazard disappears; capture is driven by save, not by Stop.
- **Codex rollout format:** current version (cli 0.135.0) writes plain `.jsonl`, filename UUID = session id, `cwd` present in `session_meta`. The derive must tolerate `.jsonl` and defensively handle `.jsonl.zst` (seen in newer docs, not on this machine).
- **Branch/merge:** per-session files (distinct names) union cleanly across the PR merge; verify against squash/rebase merge strategies. Avoid the shared-file (`.saves.json`) merge-conflict trap.
- **Worktree teardown ordering at `work complete`** (worktree removed before the archive copy): provenance must already be committed/merged into the artifact-branch tree before assembly — confirm the read happens against the merged tree, not the worktree.
- **`ana artifact save` no-changes guard / pathspec:** provenance staging must be unconditional (don't let an idempotent re-save's early-exit skip the provenance write), and the provenance path must be in the commit pathspec.
- **`.gitignore`:** ensure `plans/active/*/provenance/` is NOT ignored, and that re-init (which rewrites `.ana/.gitignore` wholesale) keeps it tracked.
- **Privacy:** per-session cost/model/tokens are committed into the customer's repo (already true today for the proof `process` block). Confirm this is acceptable as default; consider an opt-out that survives re-init.
- **Completeness expected-set correctness:** multi-phase plans (spec-1/spec-2) and per-phase rejection cycles make the expected role count non-trivial; the role vocabulary is `ana`/`plan`/`build`/`verify` (`ANA_ROLE` defaults `ana` for Think). Get this right or strict mode will false-fail correct pipelines.

## Rejected Approaches

- **Commit from the SessionEnd/Stop hook.** Violates the hook's total contract (never throw/block, <250ms, no network); the repo's pre-commit runs `pnpm install`; Codex `Stop` fires per turn. Silent commit failure recreates the disease. Killed by red-team.
- **`ana run` parent commits after the session ends.** The session may never cleanly end (user leaves the tab open); relying on `spawnSync` returning is relying on something we don't control. After-the-fact commit also captures irrelevant post-save chatter. Killed by founder.
- **In-agent capture via `$CLAUDE_CODE_SESSION_ID` only (no hook).** Claude-only — Codex exposes no session-id env var (openai/codex#8923 open). Breaks a first-class harness.
- **Store provenance in the shared `.saves.json`.** One file edited on two divergent branches → merge-conflict risk exactly in the cross-team case. Per-session files are ordering-independent and merge-clean. Killed on robustness.
- **Keep the home buffer as the cross-machine channel.** A home-global file does not cross machines; this is the root defect being removed.

## Open Questions

- Strict-mode default: should the completeness gap **warn** (default) and **fail** only under an explicit flag, or fail by default? (Lean: warn by default; strict opt-in for CI.)
- Should `cost_usd` be committed by default, or behind an opt-out, given it lands in customer git history?
- Transient pointer location/lifetime: where does the SessionStart pointer live (e.g. `~/.ana/forensics/pending/{run_id}.json`) and who prunes it (the consuming save vs. an age cap)?
- Do we keep a demoted, prunable local session log for the future standalone tool's `--global`, or rely on the tool reading raw transcripts directly? (Defer to Scope 1; default: do not keep a new buffer.)

## Exploration Findings

### Patterns Discovered
- `ana artifact save` already performs the exact commit we need: `git commit --no-verify` with a scoped pathspec on the role-correct branch, then push (`src/commands/artifact.ts` ~1262/1271/1280), and already writes/stages `.saves.json` and `modules_touched`/`module_churn` (excludes `.ana` from the churn diff at ~196).
- `ana run` is spawn-and-wait and already builds the injected capture env in `buildCaptureEnv` (`src/commands/run.ts` ~121-153) — the natural place to add `ANA_RUN_ID`.
- `deriveTranscript` / `ProvenanceCounts` / `isProcessCaptureEnabled` (`src/utils/forensics.ts`) are pure, deterministic, harness-aware, and tested — reuse verbatim.
- `.ana/plans/active/{slug}/` is git-tracked and `cp`'d to `completed/{slug}/` at `work complete` (`src/commands/work.ts` ~1154); committed files there already travel via PR merge.

### Constraints Discovered
- [TYPE-VERIFIED] `_capture.ts` hooks are total by construction (never throw, swallow all errors, <250ms stdin, exit 0) — no git/network from the hook.
- [OBSERVED] Codex has no session-id env var (openai/codex#8923 open, June 2026); the SessionStart hook payload is the only harness-agnostic source of the Codex session id.
- [OBSERVED] Real Codex rollouts on this machine (cli 0.135.0): plain `.jsonl`, filename UUID = `session_meta.payload.id`, `cwd` present in `session_meta`. No `.zst` seen (docs mention it for newer versions).
- [TYPE-VERIFIED] `$CLAUDE_CODE_SESSION_ID` is present in the agent env and in subprocess env, equals the transcript filename, transcript written live (verified this session).
- [OBSERVED] `commands/proof.ts` reads the `.process` block for display — the schema has a live consumer.

### Test Infrastructure
- `tests/commands/_capture.test.ts` drives the compiled CLI with stdin payloads and asserts buffer line counts — adapt to assert pointer writes + provenance files.
- `tests/commands/work-proof-process.test.ts` seeds the home buffer and asserts `assembleProcessAttestation` — rewrite to seed committed `provenance/*.json` and assert the completeness check.
- `tests/commands/init/assets-capture-hooks.test.ts` asserts hook install — update to assert single SessionStart hook and absence of the derive hook.
- Build must compile (`pnpm run build`) before these tests run (they spawn the compiled CLI).

## For AnaPlan

### Structural Analog
The shipped `session-capture` work — `.ana/plans/completed/session-capture/` (scope.md, spec-1/spec-2, contract.yaml, build/verify reports). This is the same subsystem; read it to see the current capture/derive/attach design and the human-FAIL→fix cycle, then design the v2 that supersedes the buffer + SessionEnd-hook + `recordBelongsToWorktree` pieces.

### Relevant Code Paths
- `src/commands/_capture.ts` — hook command (reduce to SessionStart pointer; remove derive path).
- `src/utils/forensics.ts` — keep derive/cost; remove buffer-as-source machinery.
- `src/commands/artifact.ts` — fold derive+write+stage into `saveArtifact`/`saveAllArtifacts`.
- `src/commands/run.ts` `buildCaptureEnv` — add `ANA_RUN_ID`.
- `src/commands/work-proof.ts` — `assembleProcessAttestation` (rewrite to read committed files), delete `recordBelongsToWorktree` (lines ~48-84), add completeness check.
- `src/commands/init/assets.ts` — hook install (single SessionStart; drop derive hook), and `.ana/.gitignore` generation (keep `provenance/` tracked).
- `src/types/proof.ts` — `ProcessAttestation` completeness field.

### Patterns to Follow
- Commit mechanics: mirror `ana artifact save`'s existing `--no-verify` + scoped-pathspec + push (artifact.ts).
- Derive: reuse `deriveTranscript` unchanged.
- Hook safety: keep the SessionStart hook within the existing total/never-throw contract (I/O only).

### Known Gotchas
- The `ana artifact save` no-changes early-exit must not skip provenance staging; add the provenance path to the commit pathspec unconditionally.
- Re-init rewrites `.ana/.gitignore` wholesale — `provenance/` must remain tracked across re-init.
- `ANA_ROLE` is `ana` for Think (not `think`); the completeness expected-set must use the real role vocabulary and account for multi-phase + per-phase rejection cycles.
- Worktree is removed before the archive copy at `work complete` — assemble from the merged artifact-branch tree, not the worktree.

### Things to Investigate
- **Codex SessionStart payload spike (do first):** on a live Codex session, confirm the SessionStart hook receives `session_id` (and whether it includes `transcript_path`); confirm the rollout is locatable by id and/or `session_meta.cwd`; confirm derive accuracy on a real Codex rollout; add `.jsonl.zst` tolerance.
- Decide the transient pointer location + pruning.
- Decide strict-mode default and the `cost_usd` opt-out question.
- Confirm provenance files survive squash/rebase merge strategies (not just merge-commit).
