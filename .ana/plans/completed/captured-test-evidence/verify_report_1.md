# Verify Report: Captured Test Evidence — Phase 1 (Capture spine + warn-mode gate)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-05
**Spec:** .ana/plans/active/captured-test-evidence/spec-1.md
**Branch:** feature/captured-test-evidence

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../captured-test-evidence/contract.yaml
  Seal: INTACT (hash sha256:23c7ef1e5e87348ef51f0f411279f5ed5aa2557446f396c357c16d14ebaed4e3)
```

Seal status: **INTACT** — the contract was not modified after the planner sealed it.

**Build/Test/Lint:** Build success (tsup). Tests: **3368 passed, 0 failed, 2 skipped** (137 files) via `(cd packages/cli && pnpm vitest run)`. Lint: clean (1 pre-existing warning in `git-operations.ts`, a file not touched by this build). `tsc --noEmit`: exit 0, clean. Test count did not decrease — six new test files were added and the full suite is green.

This phase covers contract assertions **A001–A029**. A030–A036 belong to Phase 2 (self-arming flip) and are out of scope here.

## Contract Compliance

| ID   | Says                                                                 | Status       | Evidence |
|------|---------------------------------------------------------------------|--------------|----------|
| A001 | Running tests through capture writes full raw output to a file        | ✅ SATISFIED | `capture-runner.test.ts:126` asserts `result.bytes === 11 > 0`, sink file equals returned bytes. Confirmed live (26-byte capture written). |
| A002 | Capture returns a compact marker, not raw scrollback                  | ✅ SATISFIED | `test-command.test.ts:74` asserts `outcome.marker` contains `ana:capture`; `capture-marker.test.ts:71` asserts `formatMarker` output contains `ana:capture`. Live marker emitted. |
| A003 | Bare command parsed into program + args without a shell               | ✅ SATISFIED | `capture-runner.test.ts:41` asserts `r.program==='vitest'`, `r.args==['run','--reporter=dot']`. |
| A004 | `(cd 'path' && cmd)` wrapper parsed, cwd recovered                    | ✅ SATISFIED | `capture-runner.test.ts:49` asserts `r.cwd===resolve(base,'packages/cli')`, program `pnpm`. |
| A005 | Leading `VAR=val` lifted into env                                     | ✅ SATISFIED | `capture-runner.test.ts:63` asserts `r.env.CI==='1'`, `NODE_ENV==='test'`, program `vitest`. |
| A006 | Pipe refused with an error naming the pipe                           | ✅ SATISFIED | `capture-runner.test.ts:86` asserts thrown `CaptureCommandError` message contains `pipe`. Confirmed live (exit 3). |
| A007 | Command substitution / backticks refused, no shell fallback          | ✅ SATISFIED | `capture-runner.test.ts:98` asserts `$()` and backtick both throw `CaptureCommandError`. |
| A008 | Spawn failure throws before any capture file is written              | ✅ SATISFIED | `capture-runner.test.ts:154` ENOENT throws and `fs.existsSync(sink)===false`. Confirmed live (degrade path). |
| A009 | Inlined block matches captured output exactly by SHA-256             | ✅ SATISFIED | `capture-marker.test.ts:86` + `invariants.test.ts:139` round-trip: `validateCaptureInlined` null (sha equal), block byte-for-byte. |
| A010 | Backticks/code fences round-trip intact (no fence)                   | ✅ SATISFIED | `capture-marker.test.ts:100`, `invariants.test.ts:229` — raw with ``` round-trips; report contains no `` ``` `` wrapper. |
| A011 | End-delimiter string in output round-trips (length-addressed)        | ✅ SATISFIED | `capture-marker.test.ts:116`, `invariants.test.ts:220` — content with literal `<!-- ana:capture-end -->` extracts by length, validators null. |
| A012 | Report with no captured evidence is flagged                          | ✅ SATISFIED | `capture-marker.test.ts:179` — `validateCapturePresent` returns non-null. |
| A013 | Tampered evidence block is caught                                    | ✅ SATISFIED | `capture-marker.test.ts:187` — flipped byte (same length) → `validateCaptureInlined` non-null via sha mismatch. |
| A014 | Truncated evidence block is caught                                   | ✅ SATISFIED | `capture-marker.test.ts:200` — deleted line → `validateCaptureNotTruncated` non-null (end-delimiter off offset). |
| A015 | Warn-mode: a failing check warns but never blocks                    | ✅ SATISFIED | `capture-marker.test.ts:215` — `evaluateCaptureGate(..,{armed:false})` → `blocked===false`, warnings>0. |
| A016 | Pass only when ≥1 passed and none failed                            | ✅ SATISFIED | `capture-runner.test.ts:176` — `deriveVerdict({47,0,2},0)==='pass'`. |
| A017 | Zero tests at exit 0 never passing                                   | ✅ SATISFIED | `capture-runner.test.ts:181` — `{0,0,0}@0 → 'abstain'`. |
| A018 | Failing tests marked failing                                        | ✅ SATISFIED | `capture-runner.test.ts:190` — `{1,2,0}@1 → 'fail'`. |
| A019 | Unreadable counts → abstain                                          | ✅ SATISFIED | `capture-runner.test.ts:199` — `deriveVerdict(null,0)==='abstain'`. |
| A020 | Counts derived from captured output                                  | ✅ SATISFIED | `capture-runner.test.ts:206` + `invariants.test.ts:125` — `counts.passed===47 > 0` (and per-stack `>0`). |
| A021 | Error text never stripped                                            | ✅ SATISFIED | `capture-marker.test.ts:167`, `invariants.test.ts:154` — error token survives verbatim into sealed report. |
| A022 | All four agent templates instruct `ana test`                        | ✅ SATISFIED | `template-capture-instruction.test.ts:33` — 4/4 templates match; build/verify forms + codex mirroring asserted. Confirmed via grep. |
| A023 | Checkpoint capture problem degrades to raw, never blocks             | ✅ SATISFIED | `test-command.test.ts:126` — `degradedToRaw===true`, exit ≠ 3. Confirmed live (pipe/ENOENT → exit 1, raw). |
| A024 | Per-surface `test_json` accepted in config                          | ✅ SATISFIED | `anaJsonSchema.test.ts:54` — `AnaJsonSchema.parse` yields `surfaces.cli.commands.test_json`. |
| A025 | Configured command run as-is, no flags appended                     | ✅ SATISFIED | `capture-runner.test.ts:79` — `r.args` not contains `--appended`; `resolveCommand` never appends. |
| A026 | No adversarial fixture reported as passing                          | ✅ SATISFIED | `invariants.test.ts:133/204` — `describe.each` over 8 stacks × .fail + 30 pathology rows: verdict ≠ pass. |
| A027 | Unknown output abstains on counts, still preserved                  | ✅ SATISFIED | `invariants.test.ts:241` — `deriveCounts(unknown)===null`, bytes still inlined/sealed. |
| A028 | Capture/seal failure exits with distinct code 3                     | ✅ SATISFIED | `test-command.test.ts:101/110` — pipe refusal and over-ceiling → exit 3. Confirmed live (exit 3 baseline; exit 1 on tests-fail; exit 0 on pass). |
| A029 | No token-measurement code ships                                     | ✅ SATISFIED | grep for `js-tiktoken\|token_economy\|ana gain\|tokenizer=\|recordCapture\|foldLedger\|token-ledger` across src/tests/package.json → 0 matches. `capture-marker.test.ts:72` asserts marker has no `tokenizer` field. |

All 29 Phase-1 assertions SATISFIED.

## Independent Findings

The integrity spine is well-built and matches the spec's intent precisely. The two load-bearing correctness decisions — **no code fence** and **length-addressed extraction** — are implemented correctly and proven by targeted adversarial tests (delimiter-in-output, backtick-in-output, nested-marker-in-content). The security boundary (`shell:false`, argv-array spawn, explicit metacharacter refusal with no fallback) is clean and never routes through `runBuildCommand`. The seed's two known bugs were reproduced-as-fixed: `result.error` gates before any sink write (`capture-runner.ts:322`), and `deriveVerdict` requires `passed > 0` for `pass` (`:419`). The token ledger is fully excised.

**Live verification** (built `dist/index.js`, throwaway project): baseline success emits the sealed marker and exits 0; a pipe in the configured command is a CAPTURE error at **exit 3**; failing tests give verdict `fail` at **exit 1**; checkpoint capture bugs degrade to raw at exit 1 (never 3). The marker format matches the spec mockup byte-for-byte.

Findings from reading the code (none block):
- **Scope:** the build edited the **repo-root** `.claude/`/`.codex/` agent files in addition to the four templates. The spec's Gotcha explicitly says "Templates, not dogfood … not the repo-root `.claude/agents/*.md`," assigning that propagation to a separate re-init scope. The edits are byte-identical to the template edits, so they're harmless and arguably good dogfooding — but they are out-of-scope work that another scope owns and could be overwritten by re-init.
- **Robustness:** the checkpoint passthrough is `join(' ')`-ed and re-parsed, losing argv quoting (see Findings F2). Surfaced during live testing.
- **Counts fall-through:** `deriveCounts` tries every parser when unhinted; the rspec regex is loose (F3).

The proof-context concern about `artifact.ts` adding redundant `.saves.json` readers is **respected**: `applyCaptureGate` reads only the report file and hardcodes `armed:false`; no new `.saves.json` reader was introduced this phase (the arming-state reader is Phase 2 work).

## AC Walkthrough

- **AC1** (capture/spawn/tee, fsync, configured vs `--` command) → ✅ PASS — `runCapture` + `executeCapture`; A001/A002; live capture file written.
- **AC2** (resolveCommand parse + refuse, no fallback) → ✅ PASS — A003–A007 + refusal sweep `capture-runner.test.ts:103`.
- **AC3** (fail-closed on `result.error` before sink) → ✅ PASS — A008; `capture-runner.ts:322`.
- **AC4** (verbatim inline, comment-delimited, length-addressed, sha-bound) → ✅ PASS — A009–A011.
- **AC5** (three validators, both save sites, before seal, warn-mode) → ✅ PASS — A012–A015; gate wired at `artifact.ts:966` and `:1365`, both before `writeSaveMetadata` (`:1111`, `:1531`).
- **AC6** (trinary verdict, no `{0,0,0}` green) → ✅ PASS — A016–A019.
- **AC7** (counts from capture, fail-open; errors not stripped) → ✅ PASS — A020/A021.
- **AC8** (instruction in 4 templates, no brief change) → ✅ PASS — A022; no `worktree-context.md` change in diff.
- **AC9** (checkpoint degrade, baseline seals) → ✅ PASS — A023 + live.
- **AC10** (`test_json` opt-in, no auto-append, `--surface`) → ✅ PASS — A024/A025; `resolveTestCommandString` honors surface override.
- **AC11** (cross-stack corpus + `describe.each` sweep, new adversarial rows) → ✅ PASS — A026/A027; 8 stacks, 30 pathologies, 2 new rows.
- **New — exit-code class (0/1/3)** → ✅ PASS — A028 + live confirmation of all three codes.
- **New — no token ledger** → ✅ PASS — A029; grep clean.
- **New — vitest passes, count not decreased, tsc clean** → ✅ PASS — 3368 passed, tsc exit 0.

## Blockers

None. I searched specifically for: contract assertions whose tagged test does not match the matcher/value (none — every Phase-1 assertion has a behavior-asserting test); a `process.exit` in the warn-mode gate path (none — `evaluateCaptureGate` and `applyCaptureGate` only `console.warn`); gate wired at only one save site (no — both `saveArtifact` and `saveAllArtifacts`, both before the seal hash); truncated/empty captures reaching the sink (no — `result.error` throws first); a code fence or delimiter-scan in the inliner (no — comment delimiters only, length-addressed extraction); and token-ledger artifacts (none). Nothing qualifies as a blocker.

## Findings

- **Upstream — Repo-root dogfood agents edited out of scope:** `.claude/agents/ana-build.md` (+`ana-verify.md`, +`.codex/` twins) — the spec's "Templates, not dogfood" Gotcha excludes these; propagation to the dogfood is the re-init scope's job. Edits are byte-identical to the template edits, so functionally harmless, but they are machine-owned content that re-init may overwrite. Monitor.
- **Code — Checkpoint passthrough loses argv quoting:** `packages/cli/src/commands/test.ts:149` — `params.passthrough!.join(' ')` then re-parses via `resolveCommand`, so a multi-token checkpoint command whose arguments contain spaces/parens/metacharacters is misparsed or refused (verified live: parens inside an arg triggered the subshell refusal). Degrade-to-raw means it never blocks, but the capture/counts for that checkpoint are lost. Documented usage (a single quoted `-- "(cd '…' && …)"` token) works. Worth a future fix to capture argv directly instead of join-then-reparse.
- **Code — `deriveCounts` fall-through can coincidentally match:** `packages/cli/src/utils/capture-runner.ts:531` — when unhinted, every parser is tried; the rspec regex `(\d+) examples?, (\d+) failures?` is loose enough to match unrelated text, which could yield a false count and (with `passed>0`, exit 0) a false `pass`, weakening ABSTAIN-ON-UNKNOWN for that input. Counts are fail-open by design; the integrity spine (preserved bytes) is unaffected. Monitor.
- **Code — `validateCapturePresent` scan asymmetry:** `packages/cli/src/utils/capture-marker.ts:362` — uses `parseMarkers` (per-line) which, unlike the integrity validators' `eachMarker`, does not skip inlined block content; a marker embedded in preserved output could falsely satisfy "present." Harmless when a real top-level marker exists. Monitor.
- **Test — Generic `errorToken` in corpus:** `packages/cli/tests/capture-corpus/invariants.test.ts:72` — 7 of 8 stacks use the token `'Error'` for ERROR-NEVER-STRIPPED; it is present in each fixture but generic enough to pass even if a different error string were the preserved one. Vitest's `'AssertionError'` is the model to follow. Acknowledge.
- **Code (cosmetic) — Garbled comment in `inferRunner`:** `packages/cli/src/commands/test.ts:128` — the cargo/go precedence comment is malformed; logic is correct. Acknowledge.
- **Upstream — `@ana` tag-number collisions:** capture tests reuse tag numbers A001–A028 that also exist in other contracts' test files; proof tooling resolves by active-slug context, but the global tag space is ambiguous across files. Monitor.

## Deployer Handoff

- This is **Phase 1 of 2**. It ships the full capture/seal spine but runs the gate in **warn-mode only** (`armed:false` hardcoded) — it can never block a save. Phase 2 wires the self-arming flip to fail-closed. Do **not** create the PR until Phase 2 is also verified.
- The feature is **dogfooded**: this repo's own `.claude`/`.codex` agents now instruct `ana test`. That is out-of-spec (a separate re-init scope owns it) but functional; if you re-init this project, expect those agent files to be regenerated from the templates.
- New CLI surface: `ana test [--stage build|verify] [--slug <s>] [--surface <name>] [--json] [-- <command…>]`. Exit codes: `0` tests ran (pass/abstain), `1` tests failed, `3` capture/seal error. Orchestrators must distinguish 3 from 1.
- Raw capture logs land in `.ana/plans/active/<slug>/.captures/` and are gitignored in generated projects (`assets.ts`); the committed truth is the inlined block in `build_report.md`.

## Verdict
**Shippable:** YES (for Phase 1 — warn-mode, cannot block saves)

All 29 Phase-1 contract assertions are SATISFIED with behavior-asserting tests, all 14 acceptance criteria pass, the full suite is green (3368 passed), lint and `tsc` are clean, and the exit-code contract and capture spine are confirmed by live invocation. The findings are observations and one low-risk robustness gap (checkpoint quoting) — none prevent shipping this warn-mode phase. The one scope deviation (repo-root agent edits) is harmless and recorded. I would stake my name on this Phase-1 change shipping in warn-mode.
