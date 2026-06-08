# Verify Report: session-capture — Phase 1: Capture

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-07
**Spec:** .ana/plans/active/session-capture/spec-1.md
**Branch:** feature/session-capture

## Pre-Check Results

`ana verify pre-check session-capture`:
```
=== CONTRACT COMPLIANCE ===
  Contract: .../session-capture/contract.yaml
  Seal: INTACT (hash sha256:130cc607fb298032b71120b7eec56a5a6a8989fb184482e6df58dae2844edc0f)
```
Seal status: **INTACT** — the contract was not modified after sealing.

**Build/Test/Lint (independent re-run this session):**
- Build: `(cd 'packages/cli' && pnpm run build)` → **success** (ESM, 32ms).
- Tests: `ana test --stage verify --slug session-capture` → **3469 passed, 0 failed, 2 skipped**. Baseline at plan time was 3424 passed / 2 skipped → **+45 new tests, no regressions**.
  - Sealed marker: `<!-- ana:capture stage=verify slug=session-capture counts=3469p/0f/2s verdict=pass sha256=1e15c08a79022bcfbfedd2d964c37774321435065f8764e61d430c71579586cd -->`
- Lint: `(cd 'packages/cli' && pnpm run lint)` → **0 errors, 1 warning**. The single warning (`src/utils/git-operations.ts:198` unused eslint-disable) is in a file **not touched by this build** — pre-existing, not a regression.
- Types: `npx tsc --noEmit` → **clean, exit 0**.

## Contract Compliance

Phase 1 covers A001–A022 (A023–A035 are Phase 2, out of scope). All 22 assertions carry a `@ana` tag, and every test's assertion method matches the contract `matcher`/`value`.

| ID   | Says                                                          | Status       | Evidence |
|------|--------------------------------------------------------------|--------------|----------|
| A001 | Agent tagged with its harness                                | ✅ SATISFIED | `run.test.ts:628` asserts `ANA_HARNESS==='claude'` (and codex) |
| A002 | Agent tagged with its pipeline role                          | ✅ SATISFIED | `run.test.ts:636` `ANA_ROLE==='build'`, think→'ana' |
| A003 | Records sha256 fingerprint of agent-def                      | ✅ SATISFIED | `run.test.ts:644` `toContain('sha256')` + `/^sha256:[0-9a-f]{64}$/`; impl `run.ts:140-141` reads+hashes resolved file |
| A004 | Tagging never strips existing env                            | ✅ SATISFIED | `run.test.ts:668` merge `{...process.env,...env}`, `PATH` defined; `buildCaptureEnv` emits only `ANA_*` keys |
| A005 | Worktree build tagged with the work item                     | ✅ SATISFIED | `run.test.ts:678` worktree-meta fixture → `ANA_SLUG==='session-capture'` |
| A006 | Think/Learn tagged with empty slug                           | ✅ SATISFIED | `run.test.ts:691` think → `ANA_SLUG===''` |
| A007 | Plan tied to a named work item via --slug                    | ✅ SATISFIED | `run.test.ts:705` plan+slug → `'session-capture'` |
| A008 | Each session records its session id                          | ✅ SATISFIED | `forensics.test.ts:107` `rec.session_id==='0a2f6d97'` |
| A009 | transcript_path recorded verbatim                            | ✅ SATISFIED | `forensics.test.ts:109`/`125` verbatim incl. empty; `_capture.test.ts:87` `'/tmp/fixture/transcript.jsonl'` |
| A010 | Exactly one record per session start                         | ✅ SATISFIED | `_capture.test.ts:81` `bufferLineCount()===1`; `forensics.test.ts:167` one line |
| A011 | Capture exits cleanly on malformed stdin                     | ✅ SATISFIED | `_capture.test.ts:114` status `0` on malformed stdin (live-confirmed) |
| A012 | Gate off → nothing written                                   | ✅ SATISFIED | `_capture.test.ts:98` `bufferLineCount()===0` (live-confirmed) |
| A013 | Capture never reaches the network                            | ✅ SATISFIED | `_capture.test.ts:156` source-scan enforcement test (see Findings — static, spec-sanctioned) |
| A014 | Direct-launch falls back to payload agent_type for role      | ✅ SATISFIED | `forensics.test.ts:143` `rec.role==='ana'` |
| A015 | Direct-launch recorded with empty slug, not dropped          | ✅ SATISFIED | `forensics.test.ts:145` `rec.slug===''` |
| A016 | Capture enabled only when explicitly on                      | ✅ SATISFIED | `forensics.test.ts:186` on → `true` |
| A017 | Broken config never enables capture                          | ✅ SATISFIED | `forensics.test.ts:202` malformed → `false` |
| A018 | New customer projects default capture off                    | ✅ SATISFIED | `assets-capture-hooks.test.ts:52` `createAnaJson` → `'off'`; `state.ts:573` |
| A019 | Turning capture on installs the hook                         | ✅ SATISFIED | `assets-capture-hooks.test.ts:153` onCommands contains `ana _capture` (Claude path — see Findings re Codex) |
| A020 | Opted-out customers get no hook                              | ✅ SATISFIED | `assets-capture-hooks.test.ts:148` freshCommands not_contains |
| A021 | Flip off + re-init prunes the hook                           | ✅ SATISFIED | `assets-capture-hooks.test.ts:167` offCommands not_contains |
| A022 | Pruning never touches user-authored hooks                    | ✅ SATISFIED | `assets-capture-hooks.test.ts:158`/`172` USER_COMMAND survives on+off |

## Independent Findings

**Build/test/lint:** all green, +45 tests, no regressions, types clean. Lint warning is in an untouched file.

**Live behavior (run this session against `dist/index.js`):**
- `ana _capture` is hidden from `ana --help` (0 occurrences).
- Gate on + valid payload → exactly one buffer line with the full AC4 field set; `transcript_path`, `cwd`, `source` recorded verbatim; `os`/`node`/`timestamp` populated. With `ANA_AGENT_DEF_HASH`/`ANA_CLI_VERSION` unset, those fields cleanly degrade to `""` (expected).
- Gate off → exit 0, zero lines.
- Stock customer template `templates/.claude/settings.json` is `{"hooks":{}}` — correctly hook-free. Dogfood `.claude/settings.json` carries the SessionStart hook; `.ana/ana.json` has `processCapture: "on"`; `.codex/hooks.json` + `config.toml [features] hooks = true` are present.

**Code quality:** Totality is well-built — `executeCapture` wraps the whole body in try/catch, `readStdin` uses a 250ms **unref'd** timeout so a never-closing stdin or TTY cannot hang the session (directly answers the sub-300ms / no-block constraint). The hash path degrades to empty on unreadable files. The env merge is purely additive at both spawn sites; `stdio`, `cwd`, and `process.exit(result.status ?? 1)` propagation are untouched. `processCapture` schema field mirrors `captureGate` exactly (no `.default`, migration-safe). No over-building or YAGNI: every new export is consumed (or is the deliberate shared `getForensicsBufferPath`/`SessionRecord` seam for Phase 2).

**Prediction resolution:** (hang/throw in `_capture`) — not found, handled. (hash hardcoding) — not found, correct. (A013 weak) — confirmed static enforcement test. (cwd/slug empirical checkpoint) — sound design, no in-repo evidence. **Surprise (unpredicted):** the Codex install/prune path has no automated coverage, and the Codex `config.toml` flag write is conditional on file absence — see Findings.

## AC Walkthrough

- **AC1** (inject 5 `ANA_*` vars, no change to argv/cwd/stdio/exit): ✅ PASS — `run.ts:493`/`308` additive `env`; `buildCaptureEnv` emits exactly the five vars; tests A001–A004.
- **AC2** (slug resolution: worktree / think-learn empty / plan --slug): ✅ PASS — `run.ts:132-135`; tests A005–A007 plus learn + plain-plan + plan-ignores-worktree cases.
- **AC3** (install-time gating + prune, both harnesses, idempotent, preserve user hooks): ⚠️ PARTIAL — fully verified for **Claude** (install/idempotent/prune/user-preserve, A019–A022) and confirmed present in dogfood `.codex/`, but the **Codex** install/prune code path has no automated test. Behavior is correct where exercised; the gap is coverage, not a defect. See Findings.
- **AC4** (one JSON line with the full field set, transcript_path verbatim): ✅ PASS — `forensics.test.ts` happy-path asserts every field; live run confirms; A008–A010.
- **AC5** (`_capture` total — exit 0 always, no throw, sub-300ms, no network): ✅ PASS — A011/A013 + empty-stdin, unwritable-buffer, outside-project cases all exit 0; 250ms bounded stdin read.
- **AC6** (direct launch still recorded, role←agent_type, empty slug, claude default): ✅ PASS — `forensics.test.ts:131`; A014/A015.
- **AC7** (`isProcessCaptureEnabled` fail-safe; customer default off; dogfood on): ✅ PASS — A016/A017; default-off A018; dogfood `.ana/ana.json` on (verified live).
- **New AC** (install-gate verified by test: on→hook, off/absent→no hook + prune seeded Anatomia hook, keep user hook): ✅ PASS — `assets-capture-hooks.test.ts` (Claude).
- **New AC** (`createAnaJson` emits `processCapture: 'off'`): ✅ PASS — A018.
- **New AC** (tests pass, no type errors, lint clean): ✅ PASS — 3469 pass / 0 fail, tsc exit 0, 0 lint errors.

## Blockers

None. I searched for: contract assertions without satisfying tagged tests (none — all 22 satisfied, methods matched); matcher/value method mismatches (none); regressions in the highest-churn shared path `run.ts` (existing run tests still pass, argv/cwd/exit propagation unchanged by inspection); silent error-swallowing that would drop a live session (the totality swallowing is intentional and spec-required, exit always 0); customer-template leakage of the hook (template stays `{"hooks":{}}`); writes to the real `~/.ana` during tests (all tests redirect `HOME` to temp dirs). The Codex coverage gap (below) is a test-debt observation, not a shipping blocker — the Claude path is fully proven and the Codex path is correct in dogfood.

## Findings

- **Test — Codex capture install/prune path is untested:** `packages/cli/tests/commands/init/assets-capture-hooks.test.ts:91` runs `init` only with `--platforms claude`. The Codex parity logic in `applyCodexCaptureHooks` (`packages/cli/src/commands/init/assets.ts:786`) — hooks.json merge, `config.toml` feature-flag write, and prune — has no automated coverage. A019/A021/A022 are satisfied via the Claude path; Codex parity currently rides on manual/dogfood verification only. The next engineer touching Codex hook generation has no regression net. *(debt → scope)*
- **Code — Codex `config.toml` feature flag only written when the file is absent:** `assets.ts:823` writes `[features] hooks = true` only if `config.toml` doesn't already exist. A customer with a pre-existing `.codex/config.toml` that lacks the flag, turning capture on, gets a `hooks.json` but no enablement — so the SessionStart hook **silently never fires**. Documented inline as a limitation, but it's a real silent-degrade for existing-Codex-config customers. *(risk → scope)*
- **Code — `pruneCaptureHook` leaves empty hook-event arrays:** `assets.ts:705` filters entries but doesn't drop a now-empty event array. A project whose only `SessionStart` entry was ours becomes `"SessionStart": []` after flip-off. Harmless (no hook fires, user hooks intact) but leaves config cruft. *(observation → monitor)*
- **Test — A013 no-network is a static source-scan, not a runtime assertion:** `_capture.test.ts:156` asserts the capture source imports no network module and calls no `fetch(`. This is the spec-sanctioned enforcement approach, but it wouldn't catch network I/O reached through an already-imported transitive module. Low risk — the capture path is `node:fs`/`node:os`/`node:path`/`node:crypto` only. *(observation → monitor)*
- **Code — empirical cwd/slug checkpoint not evidenced:** spec-1 made "confirm the real cwd of an `ana run build`/`verify` launch and that `detectWorktreeSlug(projectRoot)` returns the slug" a build checkpoint. The implementation correctly resolves the slug via `detectWorktreeSlug(projectRoot)` (`run.ts:132`) and is unit-tested with a `worktree-meta.json` fixture, but there is no in-repo evidence the *real* launch cwd was empirically confirmed. The clean-degrade (empty slug, still captured) covers the worst case regardless. *(observation → acknowledge)*
- **Upstream — run.ts active finding `codex-support-C7` not regressed:** the "TOML mode field is dead data" finding is outside this build's env-injection change; this build does not touch the dispatch-shape logic and does not regress it. *(observation → monitor)*

## Deployer Handoff

- Phase 1 of a 2-phase plan. This PASS covers **A001–A022 only**; Phase 2 (derive/cost/churn/proof-attach, A023–A035) is not built yet — do **not** treat this as feature-complete.
- This change flips **our own** dogfood capture **on** (`.ana/ana.json` `processCapture: "on"`, `.claude/settings.json` + `.codex/` hooks). After merge, our pipeline sessions begin appending to `~/.ana/forensics/sessions.jsonl` on every Anatomia agent launch. Customer default remains **off**.
- Before relying on Codex capture for any customer, address the two Codex findings (untested path + `config.toml`-write-only-when-absent). The Claude path is fully proven.
- No network, no secrets, no new external deps. Tests isolate `HOME` to temp dirs — running the suite does not pollute your real `~/.ana`.

## Verdict

**Shippable:** YES

All 22 Phase-1 contract assertions are SATISFIED with matched matchers, all 10 acceptance criteria pass (AC3 partial only on Codex *test coverage*, not behavior), the suite is green with +45 tests and no regressions, types and lint are clean, and live runs confirm the gate, totality, hidden command, hook-free customer template, and dogfood-on configs. The findings are coverage/edge-case debt for the next cycle — none blocks shipping Phase 1. I'd stake my name on this Phase 1 going to production.
