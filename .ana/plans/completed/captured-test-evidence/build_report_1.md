# Build Report: Captured Test Evidence — Phase 1 (Capture spine + warn-mode gate)

**Created by:** AnaBuild
**Date:** 2026-06-05
**Spec:** .ana/plans/active/captured-test-evidence/spec-1.md
**Branch:** feature/captured-test-evidence

## What Was Built

Phase 1 turns the build report's most-trusted number — "did tests pass, how many" — into an **engine-captured fact**. The full integrity spine ships but runs in **warn-mode**: it can never block a save this phase.

- `packages/cli/src/utils/capture-runner.ts` (created): The shell-free security boundary. `resolveCommand` parses the two generated command forms (`<program> <args>` and `(cd '<dir>' && <program> <args>)`, with leading `VAR=val` env assignments) and **throws, naming the construct**, on any shell metacharacter (pipe, `&&`-chain, `;`, `||`, redirection, `$()`, backtick, glob) — no silent shell fallback. `runCapture` runs via array-arg `spawnSync({shell:false})`, checks `result.error` **before any sink write** (fail-closed), then tees full stdout+stderr to an fsync'd capture file. `deriveCounts` parses 8 stacks; `deriveVerdict` is the trinary `pass|fail|abstain` with no false green (`passed>0` required for `pass`; `{0,0,0}`@exit-0 → `abstain`).
- `packages/cli/src/utils/capture-marker.ts` (created): Marker format + the **length-addressed** inliner and three pure validators. Blocks are comment-delimited (`ana:capture-begin/-end`) with **no code fence**; extraction reads exactly `bytes=N` after the begin delimiter and treats the end delimiter as a **post-check at the expected byte offset** — never a delimiter scan. Operates on Buffers throughout so length-addressing is exact for multi-byte UTF-8. `evaluateCaptureGate(filePath, {armed})` returns `{blocked, warnings, errors}`; `armed:false` (Phase 1) → `blocked` always false. No `tokenizer` field.
- `packages/cli/src/commands/test.ts` (created): The `ana test` command — the default capture-aware test path. Baseline emits the sealed marker; checkpoint (`-- <command>`) captures but **degrades to raw and never blocks**. Capture/seal errors (refusal, spawn error, 8 MiB over-ceiling) exit with a **distinct code 3**. Engine logic is pure of chalk; all output is in the command layer.
- `packages/cli/src/index.ts` (modified): Registers `ana test` under the PIPELINE group.
- `packages/cli/src/commands/artifact.ts` (modified): Runs `inlineCaptures` + the warn-mode `evaluateCaptureGate` at **both** build-report save sites (`saveArtifact` and `saveAllArtifacts`), **before** the seal hash and staging, via a shared `applyCaptureGate` helper. Phase 1 never `process.exit`s.
- `packages/cli/src/commands/init/anaJsonSchema.ts` (modified): `surfaceCommandsSchema` becomes an explicit object + `.passthrough()` (no regression to arbitrary keys) documenting the opt-in `test_json` structured override.
- `packages/cli/src/commands/init/assets.ts` (modified): Generated `.ana/.gitignore` now excludes `plans/active/*/.captures/`.
- `packages/cli/templates/.claude/agents/ana-build.md`, `.codex/agents/ana-build.md` (modified): Instruct running tests via `ana test` (baseline + checkpoint forms).
- `packages/cli/templates/.claude/agents/ana-verify.md`, `.codex/agents/ana-verify.md` (modified): Instruct Verify's independent re-run via `ana test --stage verify`.
- `.claude/agents/ana-build.md`, `.claude/agents/ana-verify.md`, `.codex/agents/ana-build.md`, `.codex/agents/ana-verify.md` (modified): Dogfood agent definitions synced to the templates (required by the `agent-proof-context` invariant test — see Deviations).
- Tests (created): `tests/utils/capture-runner.test.ts`, `tests/utils/capture-marker.test.ts`, `tests/capture-corpus/invariants.test.ts`; plus bonus coverage `tests/commands/test-command.test.ts`, `tests/commands/template-capture-instruction.test.ts`, and `test_json` cases in `tests/commands/init/anaJsonSchema.test.ts`.

The cancelled seed at `.ana/worktrees/token-efficiency/` was read as reference data only — nothing was merged or branched from it. The entire token-ledger subsystem was excised; both seed bugs (`result.error` before sink write; `passed>0` for pass) were reproduced as correct behavior; the code-fence and delimiter-scan were corrected; `unverified` was renamed to `abstain`.

## PR Summary

- Adds `ana test` — a shell-free capturing test runner that tees full raw test output, derives counts across 8 stacks, and emits a sha-sealed marker the agent pastes into the build report, making "tests passed, N of them" an engine-captured fact rather than the agent's self-report.
- Inlines captured output verbatim into the build report by **byte length** (no code fence, no delimiter scan), so output containing backticks, the literal end-delimiter, or nested markers round-trips intact and is sha-bound.
- Ships the full integrity spine in **warn-mode** (Phase 1): three save-time validators run at both build-report save sites but never block — the change cannot brick the install base. Phase 2 flips enforcement on per-project.
- Distinct exit-code contract: `0` tests ran, `1` tests failed, `3` capture/seal error — an orchestrator can tell "your tests are red" from "I couldn't capture your tests."
- No token-measurement code ships (the entire rejected token-ledger subsystem is excised).

## Acceptance Criteria Coverage

- AC1 "capturing runner tees full bytes, compact marker" → capture-runner.test.ts "tees exactly the captured bytes" (A001) + test-command.test.ts "emits a sealed marker" (A002) ✅
- AC2 "resolveCommand shell-free + refusals" → capture-runner.test.ts resolveCommand suite: bare/cwd/env/dotnet/escaped-quote + pipe/substitution/chaining/redirect/glob refusals (A003–A007, A025) ✅
- AC3 "fail-closed on spawn error before any sink write" → capture-runner.test.ts "throws on ENOENT and writes NO capture file" (A008) ✅
- AC4 "verbatim inline, sha-bound, length-addressed, round-trips" → capture-marker.test.ts round-trip/backticks/end-delimiter/nested-marker + corpus adversarial rows (A009–A011) ✅
- AC5 "three validators, warn-mode" → capture-marker.test.ts validators + "never blocks when not armed" (A012–A015) ✅
- AC6 "trinary verdict, no false green" → capture-runner.test.ts deriveVerdict table (A016–A019) ✅
- AC7 "counts from capture, errors never stripped" → capture-runner.test.ts deriveCounts + corpus ERROR-NEVER-STRIPPED (A020, A021) ✅
- AC8 "instruction in all four templates" → template-capture-instruction.test.ts (A022) ✅
- AC9 "checkpoint degrades to raw, never blocks" → test-command.test.ts "degrades to raw and does NOT block" (A023) ✅
- AC10 "test_json opt-in, no auto-appended flags" → anaJsonSchema.test.ts test_json + capture-runner.test.ts "no flags appended" (A024, A025) ✅
- AC11 "cross-stack adversarial corpus + sweep" → invariants.test.ts (82 cases: 8 stacks × invariants + pathologies + 2 new adversarial rows + abstain-on-unknown) (A026, A027) ✅
- New "distinct exit code 3" → test-command.test.ts "exits 3 when command needs a shell" + "exceeds 8 MiB ceiling" (A028) ✅
- New "no token-ledger artifacts" → grep across all new/modified files: zero matches; `tiktoken` absent from package.json (A029) ✅
- New "pnpm vitest run passes; count does not decrease; tsc clean" → full suite 3368 passed (was 3234); pre-commit tsc clean on every commit ✅

## Implementation Decisions

- **`resolveCommand` lives in `capture-runner.ts`** (the security boundary), per spec — the seed had it in `test.ts`. It returns `{ program, args, env, cwd }` and **throws** a `CaptureCommandError` naming the offending construct (the contract checks `error.message`), rather than returning null.
- **Metacharacter refusal is quote-aware.** Only *unquoted* shell metacharacters are refused; a quoted `"a|b"` is a literal argv token (we pass argv verbatim) and is allowed — refusing it would be wrong, since no shell is involved.
- **Length-addressing is done on Buffers**, not line-split strings. The seed's line-based `findFollowingBlock` scanned for the end-delimiter line, which truncates any output that contains that string — exactly the dogfood hazard. The rewrite slices exactly `bytes=N` and post-checks the delimiter at the offset.
- **Inliner idempotency / `.log` boundary:** when the capture file matches the marker it (re-)expands a fresh block; when the `.log` is gone but a block already exists (re-save, fresh checkout), the inliner is a **no-op** and validation runs against the committed block. The scanner also skips an existing block's byte span so a marker-looking line *inside* captured content is never re-matched.
- **`evaluateCaptureGate` carries the `armed` flag now** so Phase 2 wires only the arming decision — the warn-vs-block logic is already unit-testable.
- **Shared `applyCaptureGate` helper** wires both save sites identically (one site alone is bypassable).

## Deviations from Contract

### Ambiguity resolution — `test_json` selection
**Instead:** `resolveTestCommandString` prefers a surface's `test_json` over `commands.test` when present (project-config opt-in), with no CLI flag.
**Reason:** The spec kept the `test_json` feature but removed the seed's `--json-counts` flag, leaving the selection mechanism unspecified. AC10 requires only that the schema accepts `test_json` and that flags are never auto-appended — both hold.
**Outcome:** Functionally satisfies AC10; the selection mechanism is a judgment call the verifier should confirm. Recorded in build_data_1.yaml.

### Addition — `deriveVerdict` maps any non-zero exit to `fail`
**Instead:** A non-zero exit (collection/compile error, crash) returns `fail`, including when counts are null.
**Reason:** The spec's verdict table gives `null@0 → abstain` and `{1,2,0}@1 → fail` but not `null@1`. A non-zero exit is a real failure signal.
**Outcome:** Consistent with the corpus (exit-1 pathologies assert not-pass; exit-0 assert abstain). NO-FALSE-GREEN holds. Recorded as an observation.

### Addition — test files beyond the contract's `file_changes`
**Instead:** Added `tests/commands/test-command.test.ts`, `tests/commands/template-capture-instruction.test.ts`, and `test_json` cases in the existing `anaJsonSchema.test.ts`.
**Reason:** Assertions A002/A023/A028 (orchestrator), A022 (templates), and A024 (schema) have no test file listed in `file_changes`; they need a home.
**Outcome:** Bonus coverage; tags map to the intended assertions.

### Addition — dogfood agent definitions synced (4 repo-root files)
**Instead:** Updated `.claude/agents/{ana-build,ana-verify}.md` and `.codex/agents/{ana-build,ana-verify}.md` at the repo root, beyond the spec's listed file changes.
**Reason:** `tests/templates/agent-proof-context.test.ts` requires the dogfood agent definitions to be byte-identical to the shipped templates; editing only the templates breaks that invariant.
**Outcome:** Required maintenance, not scope creep. Recorded here and in git history.

## Test Results

### Baseline (before changes)
Command: `(cd 'packages/cli' && pnpm vitest run)`
```
Test Files  132 passed (132)
     Tests  3234 passed | 2 skipped (3236)
```

### After Changes
Command: `(cd 'packages/cli' && pnpm vitest run)`
```
Test Files  137 passed (137)
     Tests  3368 passed | 2 skipped (3370)
```

### Comparison
- Tests added: 134 (capture-runner 22, capture-marker 14, invariants 82, test-command 10, template-capture-instruction 4, anaJsonSchema test_json 2) — exactly accounts for 3234 → 3368.
- Tests removed: 0
- Regressions: none

### New Tests Written
- `tests/utils/capture-runner.test.ts` (22): resolveCommand parse/refusal, runCapture tee + fail-closed, deriveVerdict table, deriveCounts.
- `tests/utils/capture-marker.test.ts` (14): length-addressed round-trip, backticks/end-delimiter/nested-marker, idempotency, no-op-on-missing-log, validators, warn-mode gate.
- `tests/capture-corpus/invariants.test.ts` (82): 8-stack sweep + pathologies + 2 new adversarial rows + abstain-on-unknown.
- `tests/commands/test-command.test.ts` (10): exit-code contract, sealed marker, over-ceiling, checkpoint degrade.
- `tests/commands/template-capture-instruction.test.ts` (4): all four templates carry the instruction; codex bodies mirror claude.

### Dogfood — `ana test` run live against the cli surface
Built dist, then `node packages/cli/dist/index.js test --stage build --slug captured-test-evidence --surface cli`:
```
✓ captured  counts: 3368 passed, 0 failed, 2 skipped  (verdict: pass)
  7556 bytes → .ana/plans/active/captured-test-evidence/.captures/test-build-1780707580.log
```
Engine-captured marker emitted by the feature itself:
<!-- ana:capture stage=build slug=captured-test-evidence bytes=7556 sha256=bf84e711fa5bdb2c95dde91f703a25314826aa45dee457f675b18f756a776ce0 file=.captures/test-build-1780707580.log counts=3368p/0f/2s verdict=pass -->
<!-- ana:capture-begin bytes=7556 sha256=bf84e711fa5bdb2c95dde91f703a25314826aa45dee457f675b18f756a776ce0 -->

 RUN  v4.1.5 /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/captured-test-evidence/packages/cli


 Test Files  137 passed (137)
      Tests  3368 passed | 2 skipped (3370)
   Start at  18:59:40
   Duration  50.53s (transform 5.61s, setup 0ms, import 15.21s, tests 269.36s, environment 8ms)

- Scanning project...
- Scanning project...
Error: Path not found: /nonexistent/path/abc123
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
Error: Wrong branch. Switch to `main` to end learn session.
  Run: git checkout main
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
- Scanning project...
- Scanning project...
- Creating directory structure...
✔ Directory structure created
- Creating directory structure...
✔ Directory structure created
- Creating directory structure...
✔ Directory structure created
- Creating directory structure...
✔ Directory structure created
- Creating directory structure...
✔ Directory structure created
- Scanning project...
- Creating directory structure...
✔ Directory structure created
- Scanning project...
Error: No proof found for slug "nonexistent"

Run `ana work status` to see completed work items.
Error: No proof found for slug "nonexistent"

Run `ana work status` to see completed work items.
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
Error: No proof chain found at .ana/proof_chain.json

Complete work items with `ana work complete {slug}` to generate proof entries.
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
Error: No proof chain found at .ana/proof_chain.json

Complete work items with `ana work complete {slug}` to generate proof entries.
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
- Creating ana.json...
✔ Created ana.json
Error: No proof found for slug "any-slug"

Run `ana work status` to see completed work items.
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
Error: Wrong branch. Switch to `main` to close findings.
  Run: git checkout main
Error: Finding "F999" not found.
  Run `ana proof audit` to see active findings.
- Scanning project...
- Scanning project...
Error: Finding "F003" is already closed.
  Closed by: mechanical on 2026-04-22T10:00:00Z
  Reason: auto-closed
Error: --reason is required.
  Proof closures must explain why the finding no longer applies.
  Usage: ana proof close {id} --reason "explanation"
Error: Cannot combine path argument with --save. Use --json and pipe to a file for subdirectory results.
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
Error: All 2 finding IDs failed to close.
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
- Scanning project...
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
Error: --skill is required. Available skills: coding-standards
  Available skills: coding-standards
  Usage: ana proof promote {id} --skill {name}
Error: Skill "data-access" not found.
  Available skills: coding-standards
  Committed locally. Push failed after retry — run `git push`
Error: Finding "F004" is already promoted.
  Promoted to: .ana/skills/coding-standards/SKILL.md
Error: Finding "F003" is already closed.
  Closed by: mechanical on 2026-04-22T10:00:00Z
  Reason: auto-closed
  Use --force to promote a closed finding.
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
Error: All 2 finding IDs failed to promote.
  Committed locally. Push failed after retry — run `git push`
Error: No uncommitted changes to .ana/skills/coding-standards/SKILL.md
  Edit the skill file first, then run this command to commit the changes.
  Usage: ana proof strengthen <ids...> --skill coding-standards --reason "..."
Error: Finding "F003" is already closed.
  Closed by: mechanical on 2026-04-22T10:00:00Z
  Reason: auto-closed
  Use --force to strengthen a closed finding.
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
  Committed locally. Push failed after retry — run `git push`
Error: All 2 finding IDs failed to strengthen.
  Committed locally. Push failed after retry — run `git push`
Error: --reason is required.
  Usage: ana proof strengthen <ids...> --skill <name> --reason "..."
Error: --skill is required.
  Usage: ana proof strengthen <ids...> --skill <name> --reason "..."
Error: Failed to commit. Changes NOT saved to git.
error: pathspec '.ana/PROOF_CHAIN.md' did not match any file(s) known to git

Error: Invalid date for --since: "not-a-date". Use ISO format (e.g., 2026-05-15).
Error: Unknown surface "foo". Available surfaces: cli, website
Surfaces are not configured. Add surfaces to ana.json with `ana init`.

<!-- ana:capture-end -->

(The marker above is the genuine output of `ana test`. The installed CLI v1.2.2 has no inliner, so auto-expansion into a sealed block activates only once this feature ships — see Open Issues. The inliner + validators are independently proven by the 84 unit/integration tests above and round-trip on real captured bytes.)

## Verification Commands
```
(cd 'packages/cli' && pnpm run build)
(cd 'packages/cli' && pnpm vitest run capture-runner)
(cd 'packages/cli' && pnpm vitest run capture-marker)
(cd 'packages/cli' && pnpm vitest run invariants)
(cd 'packages/cli' && pnpm vitest run)
(cd 'packages/cli' && pnpm run lint)
```
Dogfood (exercises the feature): `node packages/cli/dist/index.js test --stage build --slug captured-test-evidence --surface cli`

## Git History
```
fdb6e6ce [captured-test-evidence:s1] Sync dogfood agent definitions with updated templates
e33bbea3 [captured-test-evidence:s1] Instruct `ana test` in all four agent templates
960dc563 [captured-test-evidence:s1] Add test_json schema field + .captures customer gitignore
f3a24a65 [captured-test-evidence:s1] Wire warn-mode capture gate into build-report saves
d14a6b0a [captured-test-evidence:s1] Add `ana test` command + register under PIPELINE
5b9688ef [captured-test-evidence:s1] Add cross-stack capture corpus invariant sweep
b08837d1 [captured-test-evidence:s1] Add capture-marker — length-addressed inliner + validators
13e849cd [captured-test-evidence:s1] Add capture-runner — shell-free capturing runner
```

## Open Issues

1. **Armed-large-output fail-closed window (risk, Phase 2):** an already-armed project whose honest test output exceeds the 8 MiB inline ceiling produces no inlinable marker and is blocked on save. Narrow and the accepted interim cost of fail-closed-over-ceiling (which closes the output-padding evasion hole), but it is a real fail-closed-on-honest-capture case. **Excerpt-on-overflow is the real fix.** Recorded per spec AC-new(b). (build_data_1.yaml)
2. **Excerpt-on-overflow (debt):** the tracked fast-follow that seals the full sha256+bytes and inlines an honest head/tail excerpt above the ceiling. Explicitly deferred, not dropped.
3. **Dogfood seal is bootstrap-limited (observation):** the installed CLI v1.2.2 has no inliner, so the marker pasted into this report is not auto-expanded at save until this ships. Marker + engine-derived counts are included as evidence; the seal mechanism is proven by tests and a live `ana test` capture.
4. **`test_json` selection mechanism (observation):** project-config opt-in (prefer a surface's `test_json` when present), resolving a spec ambiguity. Worth confirming it matches intent.
5. **`deriveVerdict` non-zero-exit → fail (observation):** a deliberate choice over abstain; consistent with the corpus.
6. **Pre-existing lint warning (not mine):** `git-operations.ts:198` "Unused eslint-disable directive" predates this build — not introduced here.

Forced second pass — what I noticed but hadn't written down: (a) the `inlineCaptures` scanner advances `re.lastIndex` past an existing block so a nested marker line inside captured content is inert — load-bearing for the dogfood, covered by a marker test; (b) `runCapture` merges `process.env` with the lifted `env`, so `dotenv`/inline `CI=1` assignments reach the child — covered by resolveCommand env tests but the merge itself is only exercised indirectly. Both are intentional and tested at the boundary. No further concerns surfaced.
