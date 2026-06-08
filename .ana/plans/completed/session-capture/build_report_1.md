# Build Report: session-capture — Phase 1: Capture

**Created by:** AnaBuild
**Date:** 2026-06-07
**Spec:** .ana/plans/active/session-capture/spec-1.md
**Branch:** feature/session-capture

## What Was Built

- **packages/cli/src/utils/forensics.ts** (created): The capture substrate. `SessionRecord` + `HookPayload` interfaces, `getForensicsBufferPath` (single source of truth for `~/.ana/forensics/sessions.jsonl`), `parseHookPayload` (safe narrowing of untyped stdin), `buildSessionRecord` (env+payload merge with clean-degrade fallbacks), `appendSessionRecord` (atomic `O_APPEND`, dir-creating), and `isProcessCaptureEnabled` (the gate read, mirroring `isCaptureGateEnabled` minus the test-command carve-out).
- **packages/cli/src/commands/_capture.ts** (created): The hidden, total `ana _capture` subcommand. Reads stdin (bounded 250ms), resolves project root by walking up for `.ana/`, checks the gate, appends one record. Wrapped so every failure mode exits 0. No network, no throw, no block.
- **packages/cli/src/commands/run.ts** (modified): `buildCaptureEnv` assembles the five `ANA_*` vars (harness, role, slug, cli-version, sha256 agent-def hash) and is merged over `process.env` at both the Claude and Codex `spawnSync` sites — additive only. `getCliVersionSync` + `resolveAgentDefPath` helpers. `--slug` option added (consumed by plan; threaded through `executeRun`/`dispatchToClaude`/`dispatchToCodex`).
- **packages/cli/src/commands/init/anaJsonSchema.ts** (modified): Added `processCapture: z.enum(['on','off']).optional().catch(undefined)` — no `.default()`, migration-safe like `captureGate`.
- **packages/cli/src/commands/init/state.ts** (modified): `createAnaJson` now emits `processCapture: 'off'` (customer default).
- **packages/cli/src/commands/init/assets.ts** (modified): Install-time gating. `injectCaptureHook` + `pruneCaptureHook` helpers (keyed on the `ana _capture` command signature). `createClaudeConfiguration` reads the gate (`isProcessCaptureEnabled(cwd)`) and injects the SessionStart hook when on, prunes it when off (preserving user hooks). `applyCodexCaptureHooks` does the parallel install/prune for `.codex/hooks.json` + `config.toml`.
- **packages/cli/src/index.ts** (modified): Registers `registerCaptureCommand` outside any commandsGroup (hidden).
- **packages/cli/templates/.codex/hooks.json** (created) + **packages/cli/templates/.codex/config.toml** (created): Codex SessionStart hook template + `[features] hooks = true`.
- **.ana/ana.json** (modified, dogfood): `processCapture: on`.
- **.claude/settings.json** (modified, dogfood): SessionStart `ana _capture` hook.
- **.codex/hooks.json** + **.codex/config.toml** (created, dogfood): our Codex capture config.
- **Tests** (created): `tests/utils/forensics.test.ts`, `tests/commands/_capture.test.ts`, `tests/commands/init/assets-capture-hooks.test.ts`; **modified**: `tests/commands/run.test.ts` (buildCaptureEnv block).

## PR Summary

- Adds agent-session forensic capture (Phase 1): every pipeline agent session appends one provenance line to `~/.ana/forensics/sessions.jsonl` the instant it starts, via a SessionStart hook that runs a hidden `ana _capture` command.
- Tags each spawned agent at launch with five `ANA_*` env vars (harness, role, work-item slug, CLI version, sha256 of the agent-def file) — purely additive, never altering argv/cwd/stdio/exit propagation.
- Gates the whole feature install-time: opted-out customers (the default — `processCapture: off`) get zero hook entries and run zero per-session code; turning it off and re-initializing prunes the hook while preserving user-authored hooks.
- `ana _capture` is total by construction: exits 0 in every failure mode (gate off, malformed/empty stdin, unwritable buffer, no project), never throws, never blocks, makes no network calls.
- Dogfoods the feature on this repo (Claude + Codex) so we bank our own pipeline runs immediately.

## Acceptance Criteria Coverage

- AC1 "inject ANA_* with no argv/cwd/stdio/exit change" → run.test.ts `buildCaptureEnv` (HARNESS/ROLE/HASH/additive-PATH) + the spawn-site env merge (✅ unit; the no-side-effect property is structural — one `env` key added to each options object)
- AC2 "slug resolution per role" → run.test.ts A005/A006/A007 (build/verify→worktree, think/learn→empty, plan→--slug, plain plan→empty)
- AC3 "install-time gating + prune, both harnesses" → assets-capture-hooks.test.ts A019/A020/A021/A022 (built-CLI end-to-end: fresh-off no hook, on installs, off prunes, user hook preserved, idempotent)
- AC4 "_capture appends one line with the AC4 field set, transcript_path verbatim" → _capture.test.ts A010 + forensics.test.ts A008/A009 (every field asserted; transcript_path verbatim incl. empty)
- AC5 "_capture total, no network, sub-300ms" → _capture.test.ts A011/A012/A013 + empty-stdin/unwritable-buffer/no-project cases (exit 0 throughout); no-network via source-enforcement assertion
- AC6 "direct launch still recorded, role←agent_type, slug empty" → forensics.test.ts A014/A015
- AC7 "isProcessCaptureEnabled reads the flag, fail-safe false; customer default off, dogfood on" → forensics.test.ts A016/A017 + assets-capture-hooks.test.ts A018; dogfood-on in .ana/ana.json
- AC (new) "install-time gate verified by test" → assets-capture-hooks.test.ts (on→hook, off→no hook + prune w/ user hook kept)
- AC (new) "createAnaJson emits processCapture: off" → assets-capture-hooks.test.ts A018
- AC (new) "tests pass, no type errors, lint clean" → 3469 passed / 0 failed / 2 skipped; `tsc --noEmit` clean (src + tests); eslint clean on changed files

## Implementation Decisions

- **SessionStart hook omits `matcher`.** Confirmed against a live Claude install (via claude-code-guide): `matcher` is optional and omitting it fires on every source (startup/resume/clear/compact). I omitted it to maximize capture ("capture-or-lose-forever"); the `source` field is recorded verbatim for disambiguation. Dedup/merge still works (undefined === undefined in `hookEntryMatches`).
- **`ANA_CLI_VERSION` via a synchronous package.json read** (`getCliVersionSync`), because the spawn path is synchronous and cannot `await getCliVersion`. Mirrors `getCliVersion`'s bundle-vs-dev resolution exactly.
- **`buildCaptureEnv` returns only the `ANA_*` keys**; the spawn site does the `{ ...process.env, ...buildCaptureEnv(...) }` merge (per the spec's spawn-site shape). The A004 additive property is tested by simulating that merge.
- **Install/prune gate is read via `isProcessCaptureEnabled(cwd)`** inside `createClaudeConfiguration`/`createCodexConfiguration`. Verified the init orchestration (init/index.ts) performs the atomic `.ana` swap *before* these run, so `cwd/.ana/ana.json` already holds the final (preserved or default) `processCapture` value.
- **Init gating tests run the built CLI** (`node dist/index.js init`), the sanctioned pattern in this repo (template-propagation.test.ts), because `getTemplatesDir()`'s dev path is only correct when compiled (see Open Issues).
- **No-network (A013) tested as a source-enforcement assertion** over `_capture.ts` + `forensics.ts` (testing-standards sanctions source-content enforcement tests). Phase 1 capture is fs+os only; the assertion guards against a future network import.

## Deviations from Contract

### A013: Capture never reaches out to the network
**Instead:** Verified by a source-enforcement assertion (the capture-path source imports no network module and calls no `fetch`) rather than a runtime `networkCallCount === 0` probe.
**Reason:** A reliable runtime network-call counter on a spawned process is out of scope for Phase 1; the full CI network-denylist is AC12 in Phase 2. The Build Brief explicitly asks Phase 1 to "already carry a no-network assertion for the capture path."
**Outcome:** Functionally equivalent for Phase 1 — the capture path provably performs no network I/O by construction. Phase 2's denylist will add the runtime proof. Verifier should assess.

Ambiguity/addition notes (documented, not contract-violating):
- **`harness_version` is recorded empty at Phase 1.** The Claude SessionStart payload does not deliver a harness version (confirmed: payload keys are session_id/transcript_path/cwd/hook_event_name/source/model/agent_type). The field exists in `SessionRecord` and is populated from `payload.version` if ever present, else `''`. The contract does not assert `harness_version`; Phase 2's transcript derive can fill it from the transcript `version` key. (See Open Issues.)
- **Codex install path is best-effort.** Codex's exact `hooks.json` stdin schema could not be confirmed against a live Codex install (none present on this machine). The template mirrors the Claude shape; records are verbatim per spec. An existing user `config.toml` is not rewritten (only created when absent). (See Open Issues.)

## Test Results

### Baseline (before changes)
Command: `pnpm run test -- --run` (cli surface, full)
```
Test Files  138 passed (138)
     Tests  3424 passed | 2 skipped (3426)
```

### After Changes (sealed)
Command: `ana test --stage build --slug session-capture`
```
✓ captured  counts: 3469 passed, 0 failed, 2 skipped  (verdict: pass)
```
<!-- ana:capture stage=build slug=session-capture counts=3469p/0f/2s verdict=pass sha256=2929c29bf53221862d677e7c7c8dd412bcc01d0269d52cf7383d0434994a1b64 -->

### Comparison
- Tests added: **+45 passing** (3424 → 3469); test files 138 → 141
- Tests removed: 0
- Regressions: none (0 failed)

### New Tests Written
- `tests/utils/forensics.test.ts` (15): getForensicsBufferPath, parseHookPayload (valid/malformed/empty/non-object), buildSessionRecord (happy + clean-degrade + verbatim-empty transcript), appendSessionRecord (one line, dir creation, second-append), isProcessCaptureEnabled (on/off/absent/malformed/missing).
- `tests/commands/_capture.test.ts` (9): one-line on gate-on, zero on gate-off/absent, exit-0 on malformed/empty stdin / unwritable buffer / no-project, hidden from --help, no-network source assertion. (Runs against `dist/index.js`.)
- `tests/commands/init/assets-capture-hooks.test.ts` (7): createAnaJson default-off; built-CLI fresh-off→no hook, on→installs, idempotent, off→prunes, user hook preserved on both install and prune.
- `tests/commands/run.test.ts` (+14): buildCaptureEnv — HARNESS, ROLE (incl. think default), AGENT_DEF_HASH (claude/codex/unreadable), additive PATH, slug per role (build/verify/think/learn/plan/plain-plan/plan-ignores-worktree), non-empty CLI version.

### Contract Coverage
Phase 1 assertions **A001–A022: 22/22 tagged**. (A023–A035 are Phase 2, out of scope for this spec.)

## Verification Commands
```
(cd 'packages/cli' && pnpm run build)        # compiles dist + copies templates (required before integration tests)
pnpm run test -- --run                        # full suite (turbo builds dist first)
(cd 'packages/cli' && pnpm vitest run)        # cli surface
(cd 'packages/cli' && pnpm run lint)          # lint
(cd 'packages/cli' && pnpm exec tsc --noEmit) # types (src)
(cd 'packages/cli' && pnpm exec tsc --noEmit -p tsconfig.test.json)  # types (tests)
```

## Git History
```
a3c7a8ef [session-capture:s1] Dogfood: enable process capture for this repo
f6533924 [session-capture:s1] Install-time capture gating with prune (Claude + Codex)
d353699a [session-capture:s1] Add hidden total ana _capture command
7415448a [session-capture:s1] Inject ANA_* capture env at both spawn sites
33ebe4da [session-capture:s1] Add forensics buffer, SessionRecord, and processCapture gate
```

## Open Issues

1. **`harness_version` empty at Phase 1.** The Claude SessionStart payload carries no version; the record field is present but written `''`. Phase 2's transcript derive should populate it from the transcript `version` key. Severity: debt.
2. **Codex hooks.json/config.toml schema unconfirmed against a live install.** No Codex CLI present on this machine; templates mirror the Claude shape and the install path is structurally complete but unverified end-to-end. The Codex install/prune is also untested (assets gating tests run `--platforms claude` only). Severity: risk.
3. **Existing `config.toml` is never rewritten** by `applyCodexCaptureHooks` (only created when absent) to avoid mangling user TOML — a customer who has a `config.toml` without `[features] hooks = true` won't get the flag added. Severity: debt.
4. **`getTemplatesDir()` dev path is off-by-one** (`src/commands/init` → `../../templates` = `src/templates`, which doesn't exist). It only resolves correctly when compiled. Pre-existing (not introduced here); it forced the init-gating tests to run against `dist`. Severity: observation.
5. **Pre-existing `@ana` tag collision in run.test.ts.** Unrelated CC-dispatch tests carry tags A028–A037, which in *this* contract are Phase-2 assertion IDs. Not introduced by this build (flagged in the plan's risk profile); a verifier matching tags in run.test.ts should disregard A028–A037 there. Severity: observation.
6. **Pre-existing lint warning** in `src/utils/git-operations.ts:198` (unused eslint-disable). Not my file, not introduced by this build; surfaced by the pre-commit lint over the whole package. Severity: observation.

Forced second pass — re-examined the diff for unstated concerns: the `_capture` totality wrapper, the additive env merge, the prune command-signature keying, and the dogfood hook shape all match their tests and the confirmed Claude schema; the `cwd`-launch reality (build launched from main repo → empty slug at spawn) is the spec's documented clean degrade and is covered by A006-style empty-slug behavior. The items above are the complete set.
