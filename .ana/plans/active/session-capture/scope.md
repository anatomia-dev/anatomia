# Scope: session-capture — agent-session capture & provenance unlock

**Created by:** Ana
**Date:** 2026-06-07

## Intent

Record, for **every** pipeline agent conversation (Think/Plan/Build/Verify/Learn) on **both** Claude Code and Codex, the session pointer plus full provenance — the moment each fact is knowable — so Anatomia starts banking a labeled dataset of every run immediately. This is the "Scope 0" unlock from the anatrace spike: it closes Anatomia's process-trust gap (today the proof verifies the *outcome* but trusts that each agent followed its mandate) by first capturing the raw material that later scopes will verify and analyze.

**Capture-now-or-lose-forever** is the driving rationale: every pipeline run we complete without this is a dataset row — `(model, harness, agent-role, task-shape, agent_def_hash) → (cost, churn, outcome)` — that can never be recovered. The session transcripts the harnesses already write are ephemeral (the user can clear `~/.claude` / `~/.codex` at any time). This scope captures the pointer the instant a session starts and derives the durable counts before the transcript can vanish.

**This is capture + provenance ONLY.** No rule engine, no findings, no verdicts, no reader/stats UX. That line is a guardrail, stated explicitly in §Approach and §Out of Scope, and it must hold.

## Complexity Assessment

- **Kind:** feature
- **Size:** large
- **Surface:** cli
- **Files affected:**
  - `src/commands/run.ts` — env injection at the two `spawnSync` sites (`:206` Codex, `:382` Claude); `detectWorktreeSlug` call; `--slug` option for `ana run plan`; compute `agent_def_hash` at spawn
  - `src/commands/_capture.ts` *(new)* — the hidden, total, fast capture subcommand; register in `src/index.ts`
  - `src/utils/forensics.ts` *(new)* — home-buffer append writer + the transcript-derive function (counts/cost/tokens/model); the gate reader `isProcessCaptureEnabled`
  - `src/data/pricing.ts` *(new)* — versioned price table (data, not a fetch) for `cost_usd`
  - `templates/.claude/settings.json` — add `SessionStart` + `SessionEnd` hook entries
  - `templates/.codex/hooks.json` *(new)* + `templates/.codex/config.toml` *(new)* — Codex `SessionStart` + `Stop` hooks; `[features] hooks = true`
  - `src/commands/init/assets.ts` — generate the Codex hook config (Claude rides existing `mergeHooksSettings` at `:577`)
  - `src/commands/init/anaJsonSchema.ts` + `init/state.ts` (`createAnaJson`) — the `processCapture` flag (customer default off)
  - `src/types/proof.ts` (`:94`) → `src/utils/proofSummary.ts` (`:887`) → `src/commands/work-proof.ts` (`:163`) → `src/commands/proof.ts` (`:405`) — the `process?: ProcessAttestation` 4-touch attach
  - `src/commands/artifact.ts` — extend `captureModulesTouched` (`:181`) with a `--numstat`-derived `module_churn` key (do **not** redefine `modules_touched`)
  - dogfood: our `.ana/ana.json` set `processCapture: "on"`; our `.claude/settings.json` + `.codex/` regenerated with the hooks
  - tests + a CI network-denylist test for the capture path
- **Blast radius:**
  - `run.ts` is the highest-churn file in the repo and the single launch path for all five agents — the `env` addition must be purely additive (`{ ...process.env, ... }`) and must not alter argv, cwd, or exit-code propagation.
  - `init/assets.ts` changes ship to **every customer** on their next `ana init`; the hook templates get installed for everyone (but stay dark until the gate flips). Must respect the re-init preservation contract.
  - The proof type change touches the 4 proof-write/render points; `ProcessAttestation` is optional, so proof integrity never depends on it (decoupled, like `commit_hygiene`).
  - Hooks execute inside live agent sessions — a slow or throwing hook would degrade or break the user's session. The capture command must be sub-300ms and total (always exit 0).
- **Estimated effort:** ~4–7 working days across two phases.
- **Multi-phase:** yes

## Approach

Three locked design pillars, already ratified:

1. **Tag, don't correlate.** Anatomia spawns every agent (`spawnSync('claude'|'codex', …, { stdio:'inherit' })`), so inject identity (`ANA_HARNESS`, `ANA_ROLE`, `ANA_SLUG`, `ANA_CLI_VERSION`, `ANA_AGENT_DEF_HASH`) into the child environment at the two spawn sites. Both harnesses expose a `SessionStart` hook that inherits that environment **and** receives `session_id` + `transcript_path` + `model` on stdin — so a hook fired inside the session self-identifies deterministically. No timestamp/cwd correlation.

2. **Capture into a home-anchored buffer; derive into the proof.** Every session appends one provenance line to `~/.ana/forensics/sessions.jsonl` (survives worktree teardown, covers the non-slug Think/Learn sessions, single sink, future `--global` substrate). For slug-scoped phases (Build/Verify, and Plan when tagged), Anatomia later **derives** the counts/cost/churn/outcome and attaches a `ProcessAttestation` to the proof entry — the same 4-touch enrichment pattern as `commit_hygiene`, decoupled so proof integrity never depends on it. This supersedes the spike's per-slug `.forensics.json`.

3. **Derive once, trigger twice.** The transcript-derive logic (counts/cost/tokens/model from a completed transcript) is required anyway for Build/Verify at `work complete`. The same function is triggered a second time by a `SessionEnd` (Claude) / `Stop` (Codex) hook so the non-work sessions (Think/Learn/untagged Plan) are also fully banked before their transcript can be cleared. **Guardrail: this derive is bounded to provenance (counts/cost/tokens/model) — it is NOT the rule engine. No findings, no verdicts, ever.** Work-complete derivation remains authoritative for slug runs (it fires even if `SessionEnd` didn't).

The whole feature is **enrichment, never a gate**: behind a fail-safe `ana.json` flag (absent/malformed → off), off the pipeline's critical path, and incapable of failing a run. It turns "verified over trusted" onto the agents themselves — but earns that the same way the rest of Anatomia does: mechanically, and without ever blocking the work.

## Out of Scope

This scope is **capture + provenance derivation ONLY.** It must not drift into:
- The anatrace **rule engine** — any findings, verdicts, scoring, or analysis beyond raw provenance counts.
- **Reader/query UX:** `ana proof process`, `ana proof stats`, `ana proof compare`.
- **AnaLearn consumption** of the captured data (promotion, drift, model-routing).
- **`contract_assertions_touched`** — net-new extraction; `@ana A0NN` tags are inert comments with no parser. Not here.
- **Cross-customer / hosted telemetry** — a later, opt-in, anonymized, hashed scope. This one is local-only.
- **The standalone OSS tool** (`@anatrace/core`, CLI, Action).

These are downstream scopes that consume what this one banks. Building any of them here violates "solve this problem so the next solution becomes obvious" — capture first, analyze later.

**Phasing** (ships value sooner; capture is comprehensive in Phase 1 regardless):
- **Phase 1 — Capture.** Env injection + Claude/Codex hook install + the `_capture` subcommand + the home buffer + the gate flag + dogfood default-on. Starts banking `session_id`/`transcript_path`/`harness`/`role`/`model`/`agent_def_hash`/`cli_version`/`slug` immediately.
- **Phase 2 — Derive + attach.** The transcript-derive (counts/cost/tokens/churn/outcome) + `numstat` `module_churn` + the versioned price table + the `ProcessAttestation` 4-touch proof attach + the `SessionEnd`/`Stop` derive trigger.

## Acceptance Criteria

**Phase 1 — Capture**
- AC1: `ana run <agent> --platform <claude|codex>` injects `ANA_HARNESS`, `ANA_ROLE`, `ANA_CLI_VERSION`, `ANA_AGENT_DEF_HASH`, and `ANA_SLUG` into the spawned agent's environment, with **no change** to argv, cwd, stdio, or exit-code propagation. `ANA_AGENT_DEF_HASH` is the sha256 of the resolved agent-def file at spawn time.
- AC2: Build/Verify runs (launched from inside `.ana/worktrees/<slug>`) inject a non-empty `ANA_SLUG` derived via `detectWorktreeSlug`; Think and Learn inject an empty `ANA_SLUG`; `ana run plan --slug <s>` injects the given slug and plain `ana run plan` injects empty — all valid.
- AC3: A `SessionStart` hook is installed for both harnesses (Claude via `templates/.claude/settings.json` merged by `mergeHooksSettings`; Codex via generated `templates/.codex/hooks.json` + `config.toml` `[features] hooks = true`). Re-init installs/merges them idempotently and preserves any user-authored hooks.
- AC4: The hook runs `ana _capture` (hidden, neutral name — not `ana forensics`), which reads the hook JSON on stdin + `ANA_*` env and appends exactly one JSON line to `~/.ana/forensics/sessions.jsonl` containing: `session_id`, `transcript_path` (recorded verbatim from the payload), `harness`, `harness_version`, `role`, `slug`, `model`, `agent_def_hash`, `cli_version`, `cwd`, `source`, `os`, `node`, `timestamp`.
- AC5: `ana _capture` is **total**: it exits 0 in every case — gate off, missing/invalid stdin, unwritable buffer, missing env. It never throws, never blocks (sub-300ms), and makes **no network calls**. When the gate is off or `ana` is not on PATH, it is a silent no-op and the agent session is unaffected.
- AC6: **Clean degrade on direct launch.** A session started as `claude --agent ana` directly (no `ana run`, so no `ANA_*` env) is still recorded — `role` falls back to the payload's `agent_type`, `slug` is empty, `harness` defaults to claude. The session is captured, not dropped.
- AC7: The gate: a new `ana.json` `processCapture` field read by `isProcessCaptureEnabled`, fail-safe to `false` on absent/malformed (mirrors `isCaptureGateEnabled`). New customer installs default **off**. Our dogfood `.ana/ana.json` is set **on** as part of this work.

**Phase 2 — Derive + attach**
- AC8: A deterministic derive function reads a recorded transcript and produces provenance counts: `tokens{input,output,cache_create,cache_read}` (deduped by `requestId`), `cost_usd` (token counts × the versioned price table — no network/clock), `duration_ms`, `turns`, `tool_calls`, `commands_run`, `tests_executed`, `failures_encountered`, `files_touched`, and `model` (session-level guaranteed; per-turn best-effort). Same input → byte-identical output.
- AC9: At `ana work complete`, for slug-scoped phases, the derived record + outcome joins (`first_pass_verify`, `assertions_satisfied/total`, `findings{risk,debt,observation}`) + task shape (`size`,`kind`,`multi_phase` from scope.md) + `module_churn` are attached to the proof entry as an optional `process?: ProcessAttestation`, via the 4-touch `commit_hygiene` pattern. A run with capture off, or with no matching buffer record, produces a valid proof with the field absent.
- AC10: `captureModulesTouched` additionally records per-file added/deleted churn under a new `module_churn` key from `git diff --numstat`; the existing `modules_touched` string array is unchanged.
- AC11: A `SessionEnd` (Claude) / `Stop` (Codex) hook triggers the **same** derive for non-work sessions, writing the counts back into the buffer record, running `async` so it never delays session teardown. The derive is provenance-only — it produces no findings/verdicts.
- AC12: A CI test asserts the capture + derive path performs no network I/O (network-denylist), and that no raw transcript body is ever persisted to the buffer or the proof — only the pointer + derived counts/hashes.

## Edge Cases & Risks

- **Hook breaks the session.** A throwing/slow/non-zero `SessionStart` hook could disturb or block a live agent. Mitigation: `_capture` always exits 0, is sub-300ms, async on the `SessionEnd`/`Stop` path; treat a missing `ana` binary as a no-op.
- **Worktree write-location.** A hook firing inside `.ana/worktrees/<slug>` must NOT write into the worktree's `.ana/` (it dies on teardown). The home-anchored buffer (`~/.ana/...`) sidesteps this entirely. The recorded `transcript_path` is the payload's absolute path (worktree-keyed for Claude) — recorded verbatim, never reconstructed; the file persists after teardown.
- **[LOAD-BEARING] The actual cwd of a real Build/Verify launch is an unverified assumption that decides two things at once.** The design assumes the user runs `ana run build`/`ana run verify` *from inside* `.ana/worktrees/<slug>`, which makes (a) `detectWorktreeSlug` resolve the slug for `ANA_SLUG`, and (b) Claude key the transcript under the worktree-cwd's `~/.claude/projects/...` dir. If the real flow is "launched from the main repo," **both** change: slug-via-cwd returns empty (Build/Verify lose their slug tag) and the transcript is keyed under the main repo. This must be **confirmed against a real launch in Phase 1, before the capture design is finalized** — not discovered in Build. Fallback if the assumption is false: derive the slug another way (e.g. inject it explicitly the way Plan gets `--slug`, or read the worktree's branch/meta at the spawn site regardless of cwd) and treat the transcript as main-repo-keyed.
- **Multiple active slugs.** We currently have 3 active slugs; `ana run plan` cannot infer "the" slug. Hence the explicit `--slug`; empty is a valid fallback.
- **Think precedes its own slug.** A Think session runs before `ana work start` mints the slug, so `slug` is legitimately empty; correlation to the produced scope.md is a later-scope concern.
- **Codex `transcript_path` "if available".** May be empty at `SessionStart`; fall back to globbing `$CODEX_HOME/sessions/**/rollout-*-<session_id>.jsonl`.
- **Codex id naming seam.** `session_id` (hook) vs `thread_id` (`--json`) vs the filename UUID — believed 1:1; verify string-equality once at build time before relying on it.
- **Claude per-turn model.** Per-turn model in the JSONL is undocumented; capture session-level now, treat per-turn as best-effort — do not block v1.
- **Re-init preservation.** Adding hooks to the templates must not clobber user-authored hooks (mergeHooksSettings dedupes by matcher+command) and must respect the asymmetric re-init contract for `.codex/`.
- **Price-table staleness.** `cost_usd` uses a hardcoded versioned table; stamp it with a version and treat cost as a labeled, recomputable estimate, never an invoice.
- **Buffer growth / concurrency.** Append-only JSONL from possibly-concurrent sessions — use atomic appends; the file can grow unbounded (pruning is a later concern, note it, don't build it).
- **Gate flip risk.** The generated customer default MUST stay off; only our dogfood `ana.json` flips on. A mistaken default in `createAnaJson` would turn on capture for every customer — guard with a test.

## Rejected Approaches

- **Per-slug `.forensics.json` (the spike's original).** Rejected: dies with the worktree, can't hold non-slug Think/Learn sessions, forces fragile main-repo-vs-worktree path resolution inside a shell hook. The home-anchored buffer is strictly more robust and is the only option that satisfies the all-convos requirement.
- **Post-hoc correlation by cwd + timestamp.** Rejected: the spawn-time env-injection makes tagging deterministic; correlation is a fallback we don't need.
- **A standalone hook script shipped in templates.** Rejected as the default: duplicates logic outside the CLI and drifts. The `ana _capture` subcommand is one implementation, identical across harnesses. (Cold-start ~200ms once per session is acceptable and off the critical path.)
- **Copying/archiving the raw transcript to avoid data loss.** Rejected: violates the privacy line (raw bodies hold code + secrets) and edges into the engine. Resolved instead by deriving counts early (work-complete + SessionEnd) so the durable record is counts/hashes, accepting that the pointer may later dangle.
- **A blocking gate on capture failure.** Rejected on principle: capture is enrichment, never a gate; it can never fail a pipeline run.

## Open Questions

None blocking — the design is locked. The items below are build-time verifications (AC-covered), not design decisions:
- Empirically confirm Claude records per-turn `model` in the JSONL (AC8 treats it best-effort regardless).
- Confirm Codex `session_id` == `thread_id` == filename UUID before relying on string-equality.
- Confirm whether Codex populates `transcript_path` at `SessionStart` or whether the glob fallback is needed.

## Exploration Findings

### Patterns Discovered
- Single launch chokepoint: `run.ts` `AGENT_MAP` (`:34`) → `spawnSync('codex', …)` (`:206`) / `spawnSync('claude', …)` (`:382`), both `{ stdio:'inherit', cwd: projectRoot }`, neither passing `env`. All five agents, both harnesses, no per-agent branching.
- Idempotent hook install: `mergeHooksSettings` (`assets.ts:577`) iterates `Object.keys(templateHooks)` and dedupes by matcher+command — a template edit installs a new hook with zero merge-code change.
- Fail-safe gate: `isCaptureGateEnabled` (`artifact.ts:762`) returns `false` on any read/parse failure — the exact posture to mirror.
- Optional proof enrichment: `commit_hygiene` is the clean 4-touch template (type `proof.ts:94` → default `proofSummary.ts:887` → optional spread `work-proof.ts:163` → display `proof.ts:405`).
- Git churn capture: `captureModulesTouched` (`artifact.ts:181`) already shells `git diff … --name-only`; `--numstat` is a one-flag extension into a new key.
- Worktree slug recovery: `detectWorktreeSlug` (`worktree.ts:114`) reads `worktree-meta.json` then falls back to path parsing.

### Constraints Discovered
- [TYPE-VERIFIED] Two-platform `ana.json` makes every `ana run` require `--platform` (`run.ts:116`), so `ANA_HARNESS` is unambiguous at spawn.
- [TYPE-VERIFIED] `templates/.claude/settings.json` ships `{"hooks":{}}` and `templates/.codex/` has only `agents/` — both hook installs are net-new content, but the Claude merge mechanism already exists.
- [OBSERVED] No session-id/transcript capture exists today (grep: zero `transcript_path`/`session_id`/`.jsonl`); the only prior art is a vestigial PID-marker timestamp (`work.ts:454`).
- [OBSERVED] `.claude/settings.json` is committed/tracked, so the hook is present in a worktree checkout and fires there.
- [INFERRED] Codex rollout claims in the spike (structured diffs / exit codes / "only reasoning encrypted") are overstated — Scope 0 only records the pointer + reads `usage`, so they don't bite here; the later engine must not assume them.

### Test Infrastructure
- Vitest across `packages/cli` (633-session real corpus available locally for derive-function fixtures). Pre-commit runs `tsc --noEmit` (types enforced, not the SWC build). The `commit_hygiene` and `captureModulesTouched` paths have existing tests to pattern the derive/attach tests on.

## For AnaPlan

### Structural Analog
**`commit_hygiene`** — the end-to-end template for this scope's durable side: data captured during the pipeline, derived at a point, attached optionally to the proof via 4 touch points, gated, decoupled from proof integrity. Read its full path: `artifact.ts` (capture) → `work-proof.ts:163` (spread) → `types/proof.ts:94` (type) → `proofSummary.ts:887` (default) → `proof.ts:405` (display). Mirror it exactly for `ProcessAttestation`.

### Relevant Code Paths
- `src/commands/run.ts` — `executeRun`, `dispatchToClaude` (`:382`), `dispatchToCodex` (`:206`), `resolvePlatform` (`:90`), `findRunProjectRoot` (`:219`).
- `src/commands/init/assets.ts` — `createClaudeConfiguration` (`:200`), `mergeHooksSettings` (`:577`), and wherever `.codex/` is generated (add hooks.json + config.toml here).
- `src/utils/worktree.ts` — `detectWorktreeSlug` (`:114`), `worktree-meta.json` write (`:222`).
- `src/commands/artifact.ts` — `captureModulesTouched` (`:181`), `isCaptureGateEnabled` (`:762`).
- `src/commands/work-proof.ts` — the proof-write spread (`:163`) and the work-complete derive call site.
- `src/types/proof.ts`, `src/utils/proofSummary.ts`, `src/commands/proof.ts` — the remaining proof touch points.
- `src/index.ts` — command registration (for the hidden `_capture`).

### Patterns to Follow
- Mirror `isCaptureGateEnabled` for `isProcessCaptureEnabled` (fail-safe to false).
- Mirror `commit_hygiene` for the proof attach (do not invent a new attach shape).
- Keep `_capture` in the shape of the smallest possible total command — no project-root resolution, no schema validation that can throw, no network.
- Price table as a versioned data module in `src/data/` (alongside `gotchas.ts`), not fetched.

### Known Gotchas
- Do **not** redefine `modules_touched` — downstream consumers (`work-proof.ts:109`, `artifact.ts:268`) assume a path array; add `module_churn` as a new key.
- The proof-write lives in `work-proof.ts`, not `work.ts` (stale references elsewhere say otherwise).
- `contract_assertions_touched` is **net-new extraction** — `@ana A0NN` tags are inert comments with no parser. It is **out of scope** here; do not promise it.
- `ana run` spawns with `cwd: projectRoot` (the user's shell dir), never `cd`-ing into the worktree itself — slug-via-`detectWorktreeSlug` only resolves when the user launched from inside the worktree (the intended Build/Verify flow).
- Customer default must be **off**; only dogfood `ana.json` flips on — guard with a test so a `createAnaJson` change can't flip everyone on.

### Things to Investigate
- **[Phase-1, must-do, load-bearing] Confirm the real cwd of an `ana run build`/`ana run verify` launch** (inside the worktree vs the main repo). This single fact decides both slug-tagging for Build/Verify and where Claude keys the transcript (see the [LOAD-BEARING] Edge Case). Verify before finalizing the capture design; if launched from the main repo, switch to an explicit slug-injection path and treat the transcript as main-repo-keyed.
- **[Plan decision — don't impose a silent cost] Install-time vs runtime gating.** As scoped (AC3/AC5), the hook installs for *every* customer and `ana _capture` no-ops when the gate is off — so every opted-out customer pays a ~200ms hook spawn per session. The alternative is to gate at **install** (only add the hook when `processCapture` is on → zero overhead when off, but flipping the flag requires a re-init) vs **runtime** (always install, no-op when off → flip without re-init, but a universal per-session cost). Plan must weigh this explicitly against "every change works for all customers" and "every character earns its place" — do not let opted-out customers silently pay for a feature they declined.
- The cleanest way to register a hidden/neutral subcommand (`_capture`) in `src/index.ts` and read stdin within it — find an existing stdin-reading command or the commander stdin idiom in this codebase.
- How `.codex/` assets are currently generated in `assets.ts` (verbatim copy vs generated), to decide whether `hooks.json`/`config.toml` are template files or generated strings, and how the re-init preservation contract treats them.
- Whether to emit the buffer record atomically (append with `O_APPEND`) to tolerate concurrent sessions, and where to centralize the buffer path/schema so both the hook-write and the work-complete-read agree on it.
