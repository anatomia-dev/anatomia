# Spec: Captured Test Evidence — Phase 1 (Capture spine + warn-mode gate)

**Created by:** AnaPlan
**Date:** 2026-06-05
**Scope:** .ana/plans/active/captured-test-evidence/scope.md

> **The single most-trusted number a customer reads from a build — did the tests pass, how many — is today the agent's self-report.** This phase makes that number an engine-captured fact: the agent runs tests through `ana test`, the engine tees the real bytes, inlines them verbatim into the build report, and sha-checks them. Phase 1 ships the entire integrity spine but **never blocks a save** — the validators run in warn-mode so the change cannot brick the install base. Phase 2 (spec-2.md) flips enforcement on per-project.

> **CRITICAL — the seed is reference data, not code to ship.** A cancelled build of this feature exists in the worktree at `.ana/worktrees/token-efficiency/packages/cli/`. It is a **re-verifiable seed: read it as data, re-derive everything against the corpus, never merge/cherry-pick/branch from it.** Build on a fresh `feature/captured-test-evidence` worktree off `main`. The seed shipped two bugs (since fixed in its own commit `e3af02b1`) and an entire rejected token-ledger subsystem. Reproduce what's right; do differently everything that's wrong. The "Seed: reproduce vs. correct" table below is the checklist.

---

## Approach

Build the integrity spine as four cooperating pieces, all CLI-side and harness-agnostic:

1. **A shell-free capturing runner** (`capture-runner.ts`) — a fresh security boundary. It resolves the project's test command without a shell, runs it via **array-arg `spawnSync` with `shell: false`**, tees the **full raw bytes** (stdout+stderr) to a capture file (fsync'd), derives counts from the captured bytes where the runner has a structured mode, and computes a trinary verdict. It is the security-hardened **inverse** of `runBuildCommand` (`worktree.ts:447`) — do NOT extend or reuse that function.

2. **A marker + length-addressed verbatim inliner** (`capture-marker.ts`) — the runner emits a one-line comment marker carrying `bytes=N` and `sha256=`. The agent pastes that marker into the build report. At save, the inliner expands it into a verbatim block delimited by `ana:capture-begin/-end` **comments** — **no code fence**, and **extraction is by byte length, never by scanning for the end delimiter** (see Gotchas — both are load-bearing correctness decisions, not style).

3. **Three save-time validators** (`validateCapturePresent`, `validateCaptureInlined`, `validateCaptureNotTruncated`) — pure `(filePath) => string | null`, same shape as the existing `validateBuildReportFormat` (`artifact-validators.ts:582`). Orchestrated by a single pure `evaluateCaptureGate` so the warn-vs-block decision is unit-testable without `process.exit`.

4. **The `ana test` command** (`commands/test.ts`) — the default test path for every run. Baseline runs emit the sealed marker; checkpoint runs (`-- <command>`) capture too but **degrade to raw and never block** on any capture bug.

The instruction to use `ana test` goes into the **four agent templates** that run tests (Build/Verify wrap their own commands; Plan stays command-agnostic). Propagation to existing customers is owned by the **prerequisite infra scope** — this spec places the instruction and relies on it propagating; it builds **no** brief/`worktree-context` workaround.

**Counts fail-OPEN, preservation fails-CLOSED.** Unstructured runners (Go, cargo, default pytest) are the common case — counts go honestly `abstain` and the build still seals. Only missing/mismatched/truncated *preserved bytes* will (in Phase 2) block. This line is what keeps the gate from blocking real customers; encode it explicitly.

### Seed: reproduce vs. correct (the de-risk checklist)

| From the seed | Action |
|---|---|
| Array-arg `spawnSync`, `shell:false`, fsync'd tee | **Reproduce.** Re-verify it never routes through `runBuildCommand`. |
| `result.error` fail-closed gate (spawn fail / maxBuffer / timeout throws before any sink write) | **Reproduce** (seed bug 1, fixed in `e3af02b1`). Load-bearing — AC3. |
| `deriveVerdict` requires `passed > 0` for `pass`; `{0,0,0}`@exit-0 → never green | **Reproduce** (seed bug 2, fixed in `e3af02b1`). |
| `resolveCommand` parser (bare cmd / `(cd … && cmd)` / leading `VAR=val`) | **Reproduce + re-verify** against the real generated command forms. |
| 8-stack `deriveCounts` (vitest/jest/pytest/go/cargo/rspec/junit/dotnet) | **Reproduce + re-verify** each regex against fresh fixtures. |
| Three validators + inliner | **Reproduce the shape, CORRECT the body** (see below). |
| 8-stack / 17-fixture corpus + `describe.each` sweep | **Reproduce + re-derive**; add two new adversarial rows (delimiter-in-output, backtick/fence-in-output). |
| ` ```text ` code-fence inside the inlined block | **CORRECT — remove it entirely.** Comment delimiters only (AC4 backtick-break). |
| Inliner finds block end by scanning for `ana:capture-end` | **CORRECT — extract by `bytes=N` length; the end delimiter is a post-check at the expected offset.** |
| Verdict value `unverified` | **CORRECT — rename to `abstain`** (trinary `pass\|fail\|abstain`; `unverified` collides with the Verify stage). |
| Token ledger: `token-ledger.ts`, `ana gain`, `TokenEconomy` proof field + 4-loc cross-cut, `js-tiktoken` dep, `tokenizer=` marker field, `recordCapture`/`foldLedger`, `--json-counts` token wiring | **DO NOT carry forward — excise entirely.** No token metric is sealed (Rejected Approaches). |
| Inline ceiling | **Seed never implemented it. NEW: 8 MiB interim fail-closed** (see Inline Ceiling below). |

---

## Output Mockups

**`ana test` compact output (baseline run — the marker is what the agent pastes):**
```
$ ana test --stage build --slug captured-test-evidence
✓ captured  vitest  47 passed, 0 failed, 2 skipped  (verdict: pass)
  3104 bytes → .ana/plans/active/captured-test-evidence/.captures/test-build-1749150000.log

  Paste this marker into build_report.md:
  <!-- ana:capture stage=build slug=captured-test-evidence bytes=3104 sha256=9f2c…a1 file=.captures/test-build-1749150000.log counts=47p/0f/2s verdict=pass -->
```

**`ana test` with an unstructured runner (counts abstain, still sealed):**
```
$ ana test --stage build --slug some-go-project
✓ captured  go  counts: abstain  (verdict: abstain — raw output preserved)
  8821 bytes → .ana/plans/active/some-go-project/.captures/test-build-1749150100.log
  <!-- ana:capture stage=build slug=some-go-project bytes=8821 sha256=… file=.captures/test-build-1749150100.log counts=abstain verdict=abstain -->
```

**Over the inline ceiling (8 MiB) — fail-closed CAPTURE error, distinct exit code 3 (NOT "tests failed"):**
```
$ ana test --stage build --slug huge-suite
✗ CAPTURE error: capture too large to seal — 11.4 MiB exceeds the 8 MiB inline ceiling.
  The full output is on disk at .captures/test-build-….log but cannot be sealed into the
  build report. Reduce test output (less verbose reporter) or split the suite.
  (Excerpt-on-overflow sealing is a tracked fast-follow — see spec.)
[exit 3]   # capture/seal error — an orchestrator must NOT read this as a test failure
```

**`resolveCommand` refusal (no silent shell fallback — also a CAPTURE error, exit 3):**
```
$ ana test --slug x -- "vitest run | tee out.txt"
✗ CAPTURE error: command contains a pipe ('|'), which requires a shell. ana test runs
  commands without a shell for security. Provide a single program with arguments, or set
  a per-surface test_json command in ana.json.
[exit 3]
```

> **Exit-code contract:** `0` = tests ran (verdict `pass`/`abstain`); `1` = tests failed (verdict `fail`, mirrors the runner's own status); `3` = capture/seal error (over-ceiling, refusal, `spawnSync` `result.error`). Checkpoint runs degrade to raw and exit with the underlying test status (AC9); the distinct `3` is the baseline seal path.

**Inlined block in `build_report.md` after save (comment-delimited, NO fence, verbatim):**
```
<!-- ana:capture stage=build slug=captured-test-evidence bytes=3104 sha256=9f2c…a1 file=.captures/test-build-1749150000.log counts=47p/0f/2s verdict=pass -->
<!-- ana:capture-begin bytes=3104 sha256=9f2c…a1 -->
 RUN  v1.6.0 /Users/.../packages/cli
 ✓ tests/utils/foo.test.ts (12)
 ... exactly 3104 bytes of verbatim runner output, which MAY itself contain ``` or the
     literal string <!-- ana:capture-end --> without breaking the boundary ...
 Test Files  14 passed (14)
      Tests  47 passed | 2 skipped (49)
<!-- ana:capture-end -->
```
The N bytes between the begin line's trailing newline and the `\n<!-- ana:capture-end -->` are byte-for-byte the capture file. SHA-256 and byte-length are computed over exactly those N bytes.

---

## File Changes

> The machine-readable `file_changes` list (with create/modify per file) is in contract.yaml. Prose context here.

### `packages/cli/src/utils/capture-runner.ts` (create)
**What changes:** The shell-free capturing runner — the security boundary. `resolveCommand(cmdString)` parses an ana.json test command into `{ program, args, env, cwd }` without a shell. `runCapture(opts)` runs it via array-arg `spawnSync` (`shell: false`), tees full stdout+stderr to the capture file (open → write → `fsyncSync` → close), and **checks `result.error` before any sink write** (throws on spawn failure / maxBuffer overflow / timeout). `deriveCounts(raw, runner?)` returns `{ passed, failed, skipped } | null` via per-stack parsers. `deriveVerdict(counts, exitCode)` returns the trinary.
**Pattern to follow:** array-arg spawn like `git-operations.ts:38` (hard-coded argv). The **anti-pattern** is `runBuildCommand` (`worktree.ts:447`) — `shell:true`, discards stdout. Read it to see exactly what NOT to do.
**Why:** without engine-captured bytes, the trusted number stays a typed claim.

### `packages/cli/src/utils/capture-marker.ts` (create)
**What changes:** Marker format, the **length-addressed** verbatim inliner (`inlineCaptures(reportText, slugDir) → { text, errors }`), the three validators (`validateCapturePresent`, `validateCaptureInlined`, `validateCaptureNotTruncated`, each `(filePath) => string | null`), and a pure orchestrator `evaluateCaptureGate(filePath, { armed })` that runs the three validators and returns `{ blocked, warnings, errors }` — in Phase 1 `armed` is always effectively false so `blocked` is always false.
**Pattern to follow:** validator shape is `validateBuildReportFormat` (`artifact-validators.ts:582`).
**The `.log` / inliner boundary (scope edge 7 — make it explicit):** the committed source of truth is the **inlined block + marker in `build_report.md`**. The validators verify *that committed content* and **never re-read `.captures/*.log` after the report seals.** The inliner needs the `.log` **only** to expand a *bare* marker (the capture-fresh save, where the agent pasted a marker but no block yet exists). On any save where the block is **already present** — a re-save, a fresh checkout, or the `.log` cleaned up — the inliner is a **no-op** and validation runs against the committed block, so it does **not** fail for a missing `.log`. "Idempotent re-inline located by length" means: *if* a prior expansion exists, locate its bounds by `bytes=N` and leave/replace it; it does **not** mean the `.log` is required on every save.
**Why:** the marker binds the agent's pasted number to the captured bytes by construction; the artifact is self-contained once sealed.

### `packages/cli/src/commands/test.ts` (create)
**What changes:** `ana test [--stage build|verify] [--slug <s>] [--surface <name>] [--json] [-- <command...>]`. No passthrough → runs the **configured** command (top-level `commands.test` or per-surface `commands.test` / `test_json`). With `-- <command...>` → captures that arbitrary Plan-authored command (the checkpoint case), parsed shell-free by the same `resolveCommand`. Writes captures to `.ana/plans/active/{slug}/.captures/test-{stage}-{epoch}.log`. Prints compact output + the marker. **Checkpoint runs degrade to raw and exit normally on any capture bug; only the baseline produces the sealed marker.**
**Pattern to follow:** a focused command with flag parsing + ana.json resolution — `commands/scan.ts` or `registerVerifyCommand` (`verify.ts:132`). Command layer owns all chalk/ora; the runner stays pure.
**Why:** `ana test` is the default test path — compact output every run is the recurring context saving.

### `packages/cli/src/index.ts` (modify)
**What changes:** `import { registerTestCommand } from './commands/test.js';` and call it under the `PIPELINE` group (alongside `registerVerifyCommand(program)` at the existing registration block).
**Why:** registers the command.

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:** Call `evaluateCaptureGate` at **both** build-report save sites — in `saveArtifact` (the build-report block currently at ~`:928`, where `validateBuildReportFormat` is called) and in `saveAllArtifacts` (the build-report block currently at ~`:1324`) — **before** `writeSaveMetadata` (the seal hash at `:74`, called from saveArtifact at ~`:1078` and saveAllArtifacts at ~`:1495`). Also run the inliner (`inlineCaptures`) on the build-report content before it is written/hashed, so the sealed content contains the expanded verbatim block. In Phase 1, emit `result.warnings` and `result.errors` via `console.warn(chalk.yellow(...))` and **never `process.exit`** (`result.blocked` is always false this phase).
**Pattern to follow:** the existing build-report validator call at `:928` and the companion-data warn/fail pattern at ~`:981`. Share the existing `.saves.json` read path (`readSaveMetadata`, `:498`) — do NOT add a new independent reader (`artifact.ts` is hot; known smell, findings C1/C3).
**Why:** wiring one site is bypassable — both are required.

### `packages/cli/src/commands/init/anaJsonSchema.ts` (modify)
**What changes:** Add an optional `test_json` string to `surfaceCommandsSchema` (`:40-43`) — and to the top-level `commands` shape if it accepts known keys — as an opt-in structured-mode override. Same `z.string().nullable().catch(null)` fail-soft pattern as the sibling command fields.
**Why:** lets a project opt into a stricter structured test command for counts without auto-appending flags to `commands.test`.

### `packages/cli/src/commands/init/assets.ts` (modify)
**What changes:** Add `.captures/` to the generated `.ana/.gitignore` content (`:81-84`, currently `state/` + `worktrees/`). Use a pattern that covers `plans/active/*/.captures/` (e.g. add `plans/active/*/.captures/`). The committed source of truth is the inlined block in `build_report.md`; the raw `.log` is scratch.
**Why:** raw capture logs must never be committed; nothing re-reads them after the report seals.

### `packages/cli/templates/.claude/agents/ana-build.md` (modify)
**What changes:** Direct Build to run tests via `ana test` instead of raw `commands.test`/checkpoint commands. Baseline (the "after all changes" run, currently instructed at `:107`/`:251`) → `ana test --stage build --slug {slug}`, paste the emitted marker into the build report's test-evidence section. Checkpoints (currently `:372`) → `ana test --slug {slug} -- {checkpoint command from Build Brief}`. Keep the existing "paste complete runner output / exact counts" expectation (`:413`) — now satisfied by the marker + inlined block. **Do NOT add any `worktree-context.md`/brief instruction.**
**Why:** this is THE instruction surface the feature relies on.

### `packages/cli/templates/.claude/agents/ana-verify.md` (modify)
**What changes:** Direct Verify's independent re-run through `ana test --stage verify --slug {slug}` (compact). Verify's capture is inlined + sha-sealed into `verify_report.md` via the normal save path (two independent sealed accounts), but `verify_report.md` is **not** gated. Update the "Run Build, Tests, Lint" instruction (currently ~`:169`).
**Why:** preserves the pipeline's two-independent-accounts value as captured facts.

### `packages/cli/templates/.codex/agents/ana-build.md` (modify)
**What changes:** Mirror the `.claude/agents/ana-build.md` body edits exactly. Bodies are byte-identical except the `.claude` YAML frontmatter.
**Why:** Codex is a physically duplicated tree; a change to one must be mirrored to its twin.

### `packages/cli/templates/.codex/agents/ana-verify.md` (modify)
**What changes:** Mirror the `.claude/agents/ana-verify.md` body edits exactly.
**Why:** same four-file sync constraint.

### `packages/cli/tests/...` (create)
**What changes:** Unit tests for the runner, marker/inliner, and validators, plus the cross-stack adversarial corpus + `describe.each(STACKS)` invariant sweep. See Testing Strategy.

---

## Acceptance Criteria

Copied from scope (Phase 1), expanded with implementation criteria:

- [ ] **AC1:** `ana test [--stage build|verify] [--slug <s>] [--surface <name>] [-- <command...>]` runs via array-arg spawn with NO shell, keeps stdout+stderr, tees full raw bytes to `.ana/plans/active/{slug}/.captures/test-{stage}-{epoch}.log` (fsync'd). No passthrough → configured command; `-- <command...>` → that command, parsed shell-free by `resolveCommand`. Returns a compact one-line marker, not raw scrollback.
- [ ] **AC2:** `resolveCommand` parses without a shell: bare `cmd args`, `(cd '<path>' && cmd args)` (POSIX `'\''`-unescaping the path), and leading `VAR=val` env assignments (lifted into spawn `env`); first non-assignment token is the executable (so `dotenv`/`cross-env` pass). **Refuses** pipes, extra `&&`-chains, `;`, `||`, redirections, `$()`, backticks, and globs with a clear error naming the offending construct. **No silent shell fallback.**
- [ ] **AC3:** Fail-closed on `spawnSync` `result.error` — maxBuffer overflow / spawn failure (ENOENT) / timeout throws **before any sink is written**. A truncated or empty capture is never sealed.
- [ ] **AC4:** Captured bytes are inlined verbatim into the build report at save, delimited by `ana:capture-begin/-end` **comments (no code fence)**; the inlined block is byte-for-byte identical to the capture file (sha256 equal). **Extraction is by `bytes=N` length, not by delimiter scan.** Output containing backticks/fences **and the literal end-delimiter string** round-trips intact.
- [ ] **AC5:** `validateCapturePresent`, `validateCaptureInlined`, `validateCaptureNotTruncated` run at **both** save sites **before** the seal hash, orchestrated by `evaluateCaptureGate`. In Phase 1 they run in **warn-mode**: a failure prints a warning, never `process.exit(1)` (`blocked` always false).
- [ ] **AC6:** Verdict is trinary `pass | fail | abstain`. `pass` requires counts read AND `passed > 0` AND no failures; `fail` = counts with failures OR non-zero exit/error; `abstain` = counts unreadable OR zero-test/all-skipped (raw captured + sealed, no pass/fail asserted). **A `{0,0,0}` exit-0 result is never `pass`.**
- [ ] **AC7:** Counts derived once, from the captured bytes, where the runner has a structured mode; `abstain` otherwise (**fail-open on counts**). Errors are never stripped from preserved output.
- [ ] **AC8:** The "run tests via `ana test`" instruction is placed in all four templates (`ana-build.md` + `ana-verify.md` × `.claude` + `.codex`), kept in sync. No brief/`worktree-context.md` change.
- [ ] **AC9:** `ana test` is the default for checkpoint runs (`-- <command...>` passthrough) and the baseline (configured command). A capture bug on a checkpoint **degrades to raw and never blocks**; only the baseline produces the sealed marker.
- [ ] **AC10:** A `test_json` per-surface ana.json override ships (opt-in); flags are **never auto-appended** to `commands.test`. `--surface` resolves the correct per-surface command.
- [ ] **AC11:** A cross-stack adversarial corpus exists for `{vitest, jest, pytest, go, cargo, rspec, junit, dotnet}`, each with per-stack rows for empty / all-skipped / 0-exit-0 / collection-error / compile-error (NO-FALSE-GREEN), plus `.raw`/`.fail` pairs, **plus the two new adversarial rows: output-contains-the-end-delimiter and output-contains-backticks/fence.** A `describe.each(STACKS)` sweep asserts PRESERVE, COUNTS-FROM-CAPTURE, SEAL-BINDS/TAMPER-FIRES, ERROR-NEVER-STRIPPED, NO-FALSE-GREEN, ABSTAIN-ON-UNKNOWN. A green verdict on any adversarial row is a CI-failing bug.
- [ ] **New (exit-code class):** Capture/seal failures (over-ceiling, `resolveCommand` refusal, `spawnSync` `result.error`) exit with a **distinct code `3`**, never `1` ("tests failed"). `0` = tests ran (`pass`/`abstain`); `1` = tests failed (`fail`). The armed-large-output fail-closed window is recorded in `build_report.md` Open Issues next to the excerpt-on-overflow fast-follow.
- [ ] **New:** No token-ledger artifacts exist anywhere in the build (no `js-tiktoken`, no `token_economy`, no `ana gain`, no `tokenizer=` field, no `recordCapture`/`foldLedger`).
- [ ] **New:** `pnpm vitest run` in `packages/cli` passes; test count does not decrease; `tsc --noEmit` clean (pre-commit hook).

---

## Testing Strategy

- **Unit — runner (`tests/utils/capture-runner.test.ts`):**
  - `resolveCommand`: bare `vitest run`; `(cd 'packages/cli' && pnpm vitest run)` (cwd + program recovered); a path with an escaped quote (`'\''`); leading `CI=1 NODE_ENV=test vitest`; `dotenv -- vitest`. **Refusals**, each asserting the error names the construct: pipe `|`, second `&&`, `;`, `||`, `>` redirect, `$(…)`, backtick, glob `*`. Assert **no shell fallback** ever occurs.
  - `runCapture`: a known fixed-output command tees exactly N bytes; the capture file exists and equals the returned bytes. **`result.error` path**: an ENOENT command throws AND no capture file is written.
  - `deriveVerdict`: `{47,0,2}`@0 → `pass`; `{0,0,0}`@0 → `abstain`; `{0,0,5}`@0 (all-skipped) → `abstain`; `{1,2,0}`@1 → `fail`; `null`@0 → `abstain`.
- **Unit — marker/inliner (`tests/utils/capture-marker.test.ts`):**
  - Round-trip: marker → inline → extracted block sha256 == marker sha256, byte length == `bytes`.
  - **Length-addressed extraction:** a capture body that *contains the literal `<!-- ana:capture-end -->` string* extracts correctly (boundary is length, end-delimiter is a post-check at the expected offset).
  - **No-fence:** a capture body containing ``` round-trips; no ` ```text ` wrapper is emitted.
  - Idempotent re-inline (replace prior expansion, located by length).
  - Validators: tampered byte → `validateCaptureInlined` returns error; truncated block → `validateCaptureNotTruncated` returns error; no marker → `validateCapturePresent` returns error.
  - `evaluateCaptureGate` warn-mode: every failing validator yields `blocked === false` in Phase 1.
- **Cross-stack corpus + sweep (`tests/capture-corpus/` + `invariants.test.ts`):** re-derive real `.raw`/`.fail` fixtures per runner; per-stack pathology rows (empty / all-skipped / 0-exit-0 / collection-error / compile-error); the two NEW rows (delimiter-in-output, backtick-in-output); `unknown.raw` for ABSTAIN-ON-UNKNOWN. `describe.each(STACKS)` asserts all six invariants. A `pass` verdict on any adversarial row fails CI.
- **Schema:** `anaJsonSchema` parses a surface carrying `test_json`; absent `test_json` is undefined-safe.
- **Edge cases:** over-ceiling (8 MiB) → fail-closed with the logged message; checkpoint capture bug → degrades to raw, exit 0.

---

## Dependencies

- Node `node:child_process` (`spawnSync`), `node:fs`, `node:crypto` (`createHash`) — all already used in the codebase. **No new npm dependencies** (explicitly NOT `js-tiktoken`, NOT `shell-quote`/`string-argv` — the parser is written from scratch, like every existing array-arg spawn).
- **Prerequisite infra scope** (re-init refreshes machine-owned template content + `anaVersion`-staleness nudge) owns propagation. If it slips, this spec still ships safely in warn-mode (never blocks).

---

## Constraints

- **Security boundary:** `shell: false`, array-arg spawn only. Never reuse `runBuildCommand`. `resolveCommand` must refuse shell metacharacters loudly; never fall back to a shell; never append flags to a customer's command.
- **Engine/CLI boundary:** the runner/marker logic is pure (no chalk/ora); all user-facing output lives in `commands/test.ts` and `commands/artifact.ts`.
- **`.js` import extensions** on all relative imports; `node:` prefix on builtins; `import type` for type-only imports.
- **Explicit return types** on exported functions; `@param`/`@returns` JSDoc (pre-commit enforces).
- **`artifact.ts` is hot:** validators must share the existing `.saves.json` read path; do not add a fifth/seventh independent read.
- **Test count must not decrease** (CI 3 OS × 2 Node). Pre-commit runs `tsc --noEmit`; build uses SWC (won't catch type errors) — thread the verdict/marker types correctly.
- **Four-file template sync:** `.codex` bodies byte-identical to `.claude` except frontmatter.

---

## Gotchas

- **No code fence in the inlined block.** The seed wrapped verbatim bytes in a ` ```text ` fence *inside* the comment delimiters — captured output containing ``` breaks the fence. Comment delimiters only; raw bytes sit directly between them. (AC4.)
- **Length-addressed extraction, not delimiter scan.** Read exactly `bytes=N` after the begin delimiter; treat `<!-- ana:capture-end -->` as a **post-check at the expected offset**, never the boundary search. Captured output can contain the literal end-delimiter string — and **will**, because the dogfood's own tests of this feature print capture markers, so the corpus itself contains the delimiters. This is the delimiter-analog of dropping the fence. (AC4 + the new corpus row.)
- **`result.error` before any sink write** (seed bug 1). maxBuffer overflow / ENOENT / timeout must throw before the tee — never seal truncated or empty bytes. (AC3.)
- **`passed > 0` for `pass`** (seed bug 2). Zero-test / all-skipped / collection-error / compile-error / empty-but-exit-0 are NEVER green. (AC6.)
- **Rename `unverified` → `abstain`** everywhere — it collides with the Verify stage and misreads as a trust judgment.
- **Excise the token ledger completely.** No `js-tiktoken`, `token_economy`, `ana gain`, `tokenizer=`, `recordCapture`, `foldLedger`. The saving is delivered by the capture mechanism being the default path, not by measuring it.
- **Both save sites.** Wiring only `saveArtifact` is bypassable via `saveAllArtifacts` (and vice-versa). Wire both, before the seal hash.
- **Gate runs BEFORE `writeSaveMetadata`** at both call sites — ordering matters.
- **Customer gitignore, not dogfood.** `.captures/` goes into the generated `.ana/.gitignore` (`assets.ts:81`), the file customers get. Our own `packages/cli/.ana/` is already fully gitignored — don't mistake that for the fix.
- **Templates, not dogfood.** Edit `packages/cli/templates/.claude/agents/*.md` AND `templates/.codex/agents/*.md` — not the repo-root `.claude/agents/*.md`.

## Inline Ceiling (decision — interim fail-closed @ 8 MiB)

- **Under 8 MiB (8388608 bytes):** inline verbatim (the common case).
- **8 MiB ≤ size < spawn maxBuffer (64 MiB):** **fail-closed** with a clear, **logged warning** (never silent). Message tells the agent the capture is too large to seal and how to reduce output (less verbose reporter, split the suite).
- **≥ spawn maxBuffer:** already covered by AC3 (`result.error` throws before any sink write).
- **Excerpt-on-overflow** (seal full sha256+bytes, inline an honest head/tail excerpt with its own `excerpt_sha256`/`excerpt_bytes`) is a **tracked fast-follow — explicitly deferred, not dropped.**

### Two failure cases over the ceiling — both must be NAMED, not implicit

1. **Never-armed project, always over ceiling** → never seals a valid capture → never arms → sits in **warn-mode** (never blocked). The logged over-ceiling warning is what keeps this from being a *silent* no-integrity state. Acceptable.
2. **Already-armed project whose honest output grows past 8 MiB** → that run produces no inlinable marker → on save it is `armed + no valid capture = blocked`, and the agent is stuck: its real test output is simply too big to seal and it cannot shrink it on demand. **This is fail-closed on a legitimate customer — the cardinal sin this whole design exists to avoid.** It is narrow (8 MiB is generous) and it is the **accepted interim cost** of fail-closed-over-ceiling, which closes the output-padding evasion hole that a degrade-to-warn would open. **Excerpt-on-overflow is the real fix.** Two hard requirements so this is named, not buried:
   - **(a) Distinct exit class.** `ana test`'s over-ceiling exit (and every other capture/seal failure — `resolveCommand` refusal, `spawnSync` `result.error`) is a **CAPTURE error with a distinct exit code (`3`), never conflated with "tests failed."** Reserve the exit-code space explicitly: **`0` = tests ran (verdict `pass`/`abstain`); `1` = tests failed (verdict `fail`, mirrors the runner's own non-zero status); `3` = capture/seal error (over-ceiling, refusal, spawn error).** An orchestrator keying on exit code must be able to tell "your tests are red" from "I could not capture your tests." (On a **checkpoint** run this still degrades to raw and exits with the underlying test status per AC9 — the distinct `3` is the **baseline** seal path.)
   - **(b) Record it in Open Issues.** Build must record the **armed-large-output block** in `build_report.md`'s Open Issues, right next to the excerpt-on-overflow fast-follow — so the known fail-closed-on-honest-capture window is a tracked item, not a surprise.

---

## Build Brief

### Rules That Apply
- All relative imports end in `.js`; builtins use `node:` prefix; `import type` for type-only imports (ESM runtime crashes otherwise).
- Named exports only — no default exports.
- Engine/util files are pure: no chalk/ora/commander. All user-facing output in `commands/`.
- Explicit return types on exported functions; `@param`/`@returns` JSDoc (eslint/pre-commit enforces).
- Use `| null` for "checked and empty" (e.g. `deriveCounts` returns `Counts | null`); `?:` for "may not have been checked".
- Avoid `any`; narrow `unknown` with type guards.
- Validators are pure `(filePath: string) => string | null` — error string on failure, `null` on pass.
- Security boundary: `spawnSync(program, args, { shell: false })`. Never `shell: true`. Never append flags to the resolved command.

### Pattern Extracts

**Existing validator shape to mirror** (`packages/cli/src/commands/artifact-validators.ts:582-600`):
```ts
export function validateBuildReportFormat(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const requiredSections = [
    { pattern: /###?\s+Deviation/i, name: 'Deviations' },
    // ...
  ];
  for (const section of requiredSections) {
    if (!section.pattern.test(content)) {
      return `Missing '${section.name}' section. ...`;
    }
  }
  return null; // valid
}
```

**The seal hash the gate must run BEFORE** (`packages/cli/src/commands/artifact.ts:73-75`):
```ts
const hash = createHash('sha256').update(content).digest('hex');
const fullHash = `sha256:${hash}`;
```

**Existing build-report validator call site to sit beside** (`artifact.ts:928-934`):
```ts
if (typeInfo.baseType === 'build-report') {
  const error = validateBuildReportFormat(filePath);
  if (error) {
    console.error(chalk.red(`Error: build_report.md format invalid.\n${error}`));
    process.exit(1);
  }
}
```
(Phase 1 capture gate sits here too, but emits `console.warn(chalk.yellow(...))` and never exits.)

**Shared `.saves.json` read path to reuse — do NOT add a new reader** (`artifact.ts:498-507`):
```ts
function readSaveMetadata(slugDir: string): Record<string, SaveMetadata> {
  const savesPath = path.join(slugDir, '.saves.json');
  if (!fs.existsSync(savesPath)) return {};
  try { return JSON.parse(fs.readFileSync(savesPath, 'utf-8')) as Record<string, SaveMetadata>; }
  catch { return {}; }
}
```

**The anti-pattern — do NOT reuse or extend** (`worktree.ts:447-472`):
```ts
function runBuildCommand(wtPath: string): boolean | null {
  // ...
  const result = spawnSync(buildCmd, {
    cwd: wtPath, stdio: 'pipe', encoding: 'utf-8',
    shell: true,        // ← injection surface; the new runner is shell:false
    timeout: 300000,
  });
  return result.status === 0;   // ← discards stdout; the new runner KEEPS it
}
```

**Generated customer gitignore to extend** (`assets.ts:81-85`):
```ts
const gitignoreContent = `# Anatomia runtime state — local to each developer
state/
worktrees/
`;
// add: plans/active/*/.captures/
```

**Surface command schema to extend** (`anaJsonSchema.ts:40-43`):
```ts
const surfaceCommandsSchema = z.record(
  z.string(),
  z.string().nullable().catch(null),
).optional().default({}).catch({});
// add an opt-in `test_json` (same fail-soft string shape)
```

### Proof Context
- `artifact.ts` — **active findings (heed):** `fix-false-rejection-archive-C3` and `multi-phase-report-naming-guard-C1` both flag **multiple independent `.saves.json` reads**. Your validators/gate must reuse `readSaveMetadata` (`:498`), not add another reader. Build concern: `writeSaveMetadata` is already exported for tests — don't widen the public surface further than necessary.
- `artifact-validators.ts` — no active proof findings.

### Checkpoint Commands
- After `capture-runner.ts` + its unit test: `(cd 'packages/cli' && pnpm vitest run capture-runner)` — Expected: new runner tests pass.
- After `capture-marker.ts` + its unit test: `(cd 'packages/cli' && pnpm vitest run capture-marker)` — Expected: round-trip, length-extraction, delimiter-in-output, tamper, truncation tests pass.
- After the corpus: `(cd 'packages/cli' && pnpm vitest run invariants)` — Expected: full `describe.each(STACKS)` sweep green; zero false-green.
- After all changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: baseline count + new tests, all pass.
- Lint: `(cd 'packages/cli' && pnpm run lint)` and `tsc --noEmit` clean.

> Run every one of these via `ana test` per the new instruction you are adding (dogfood the feature): e.g. `ana test --slug captured-test-evidence -- "(cd 'packages/cli' && pnpm vitest run capture-runner)"` for checkpoints, `ana test --stage build --slug captured-test-evidence` for the baseline.

### Build Baseline
Run `(cd 'packages/cli' && pnpm vitest run)` and record exact counts before writing code:
- Current tests: {record exact number from the terminal}
- Current test files: {record exact number}
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected {current + runner unit + marker unit + corpus sweep} tests across {current + ~3} files.
- Regression focus: `artifact.ts` (gate wiring + inliner call), `anaJsonSchema.ts` (schema), `index.ts` (registration).
