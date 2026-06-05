# Scope: Captured Test Evidence — Engine-Captured, Seal-Gated Test Evidence

**Created by:** Ana
**Date:** 2026-06-05

## Intent

The single most-trusted number a customer reads from a build — *did the tests pass, how many* — is today the **agent's self-report**, and nothing mechanically verifies the agent pasted real output. `validateBuildReportFormat` (`artifact-validators.ts:582-600`) checks only section *headers*; the test evidence inside is whatever the agent typed. This is the one place "verified over trusted" is currently only *hoped*: an agent that types "all tests pass" seals exactly like one that ran them.

Make test evidence **engine-captured and seal-gated**: the agent decides, the engine does the mechanics. The agent runs tests through a new `ana test` command; the engine tees the real bytes, inlines them verbatim into the build report, sha-checks them, and — once a project has proven it can capture — refuses to seal a build report without a genuine, untruncated capture.

**Secondary, real, NOT the headline:** running tests through the capture command returns a compact marker instead of 40–50 lines of scrollback, so the agent's working context stays lean on *every* test run, across the session, on any harness. This recurring saving comes from the **capture mechanism as the default test path**, not from measuring it. There is no token metric in this scope (see Rejected Approaches — the ledger is cut).

**Source:** `captured-test-evidence-anathink-handoff.md` (2026-06-05), the authoritative re-scope after the prior `token-efficiency` work item was cancelled. Its load-bearing claims were re-verified against live source during scoping. The handoff is **data, not a locked scope** — one of its central claims was verified false and is corrected below.

**Correction carried into scope — DO NOT inherit the handoff's §5/§6 propagation framing.** The handoff states the gate-vs-instruction "sequencing landmine" was a modeling error, "resolved, not a concern," because "customers receive new code and new templates together only on re-init." **Verified false against live code.** The gate is runtime CLI code (`artifact.ts`) and goes live on `npm update` with no re-init. The `ana test` instruction lives in agent templates, and `copyAgentFiles` **skips any agent file that already exists** (`assets.ts:263-268`; same for Codex `:617`, CLAUDE.md `:288`) — re-init does **not** refresh templates for existing customers, which project-context's own merge-not-overwrite contract confirms. So an unconditional fail-closed gate would ship on the CLI channel while the install base's stale templates still instruct the raw path (`ana-build.md:107`) → no marker → **every existing customer's seal blocked on update.** Propagation is a real, load-bearing concern. The resolution is in the Approach: the instruction rides the **code-generated brief** (the only surface that propagates *with* the gate), and the gate **defaults to warn-mode, self-arming to fail-closed per project** — not optional polish, the required migration bridge.

## Complexity Assessment

- **Kind:** feature
- **Size:** large
- **Surface:** cli
- **Files affected:**
  - **Phase 1 — capture + warn-mode (never blocks):**
    - NEW `packages/cli/src/utils/capture-runner.ts` — shell-free capturing runner (array-arg `spawn`/`spawnSync`, NO shell), `resolveCommand` parser, `deriveCounts` (per-stack, best-effort), `deriveVerdict` (trinary).
    - NEW `packages/cli/src/utils/capture-marker.ts` — marker format, comment-delimited verbatim inliner, the three validators.
    - NEW `packages/cli/src/commands/test.ts` — `ana test` (the default test path; compact output every run).
    - `src/index.ts` — register the `test` command.
    - `src/utils/worktree.ts` — `writeWorktreeContext` (`:556-618`): inject the "run tests via `ana test`" instruction into the brief (the propagation-safe surface).
    - `src/commands/artifact.ts` — wire the three validators in **warn-mode** at both save sites (`saveArtifact:928` region, `saveAllArtifacts:1324` region), before the seal hash (`writeSaveMetadata`, hash at `:74`; called `:1078` / `:1489`).
    - `templates/.claude/agents/ana-build.md` + `ana-verify.md` and `templates/.codex/agents/ana-build.md` + `ana-verify.md` — direct the agent to run tests via `ana test` (convenience for **new installs only**; nothing relies on this reaching existing customers).
    - `ana.json` schema — `test_json` per-surface opt-in structured-mode override (`src/commands/init/anaJsonSchema.ts` `surfaceCommandsSchema:38-53`).
    - `tests/` — cross-stack adversarial corpus + `describe.each(STACKS)` invariant sweep.
  - **Phase 2 — flip to fail-closed on the per-project adoption signal:**
    - `src/commands/artifact.ts` — the warn-mode gate self-arms to fail-closed once a valid capture marker has been sealed for *this project*; absence of a marker then blocks the seal.
    - Adoption-signal storage (Plan's design call — candidates: a sticky flag in `.ana/state/`, `ana.json` `custom`, or derived from prior sealed build reports in the proof chain / completed plans).
- **Blast radius:** **High — the seal/save path gains a fail-closed gate.** Mitigated structurally: (1) warn-mode is the default and Phase 1 *never* blocks; (2) the flip is **per-project and self-arming** — a project only enters fail-closed after it has itself produced a valid capture, so the gate can never block a customer who was never capturing; (3) fail-OPEN on counts, fail-CLOSED only on preservation. The capturing runner is a **security boundary** (array-arg spawn, no shell, no appended flags) — `runBuildCommand` (`worktree.ts:459`, `shell:true`, discards stdout) must NOT be reused. The brief-injection (`writeWorktreeContext`) soft-falls-back to current content on any failure.
- **Estimated effort:** Phase 1: 4–6 focused days (the cross-stack adversarial corpus is the bulk and the de-risk). Phase 2: 0.5–1 day (the flip is small once the marker and arming signal exist).
- **Multi-phase:** yes — phased by **enforcement stage**, not by feature. Both phases ship the same spine; Phase 1 observes, Phase 2 enforces.

## Approach

**The thesis:** the agent decides; the engine does the mechanics. The number a customer trusts must be a captured fact, not a typed claim. Build the integrity spine once, ship it in warn-mode so it can never brick the install base, and let each project arm its own gate the moment it proves it can capture.

**The spine (both phases):**
1. **Shell-free capturing runner.** `ana test` resolves the project's test command and runs it via **array-arg spawn, NO shell**, tees the **full raw bytes** to a capture file (fsync'd), and returns a compact marker to the agent instead of the scrollback. This is a security boundary — not `runBuildCommand`.
2. **Marker + verbatim inliner + sha-check.** The agent pastes a one-line marker into the build report. At save, the engine expands it into a verbatim block delimited by `ana:capture-begin/-end` **comments** (not code fences — so captured output containing backticks round-trips) and sha256-checks the inlined block against the marker hash.
3. **Three save-time validators**, wired at **both** save sites before the seal hash: `validateCapturePresent` (a build report carries ≥1 capture), `validateCaptureInlined` (inlined block sha256 == marker hash), `validateCaptureNotTruncated` (inlined byte length == marker `bytes=N`).
4. **Counts derived once, from the captured bytes**, where the runner has a structured mode; honestly `N/A` otherwise. So the agent's reported counts == the pasted transcript by construction.

**The propagation-safe rollout (the correction to the handoff):**
- **Instruction surface = the code-generated brief.** The "run tests via `ana test`" direction goes into `writeWorktreeContext` (`worktree.ts`, the generated `worktree-context.md`). This is the *only* channel that propagates *with* the gate via `npm update`, is harness-agnostic (one file read identically by Codex and Claude Code), and Build already reads it (`ana-build.md:93`, an instruction existing customers already have). The agent templates are also updated so **new installs** are clean — but the brief is load-bearing; the template is convenience, and **nothing may depend on a template reaching an existing customer.**
- **Warn → fail-closed, self-arming per project.** Mirrors the verifier-intent-coverage warn-until-proven-then-flip pattern. Phase 1's gate observes and warns but never blocks. The gate **arms for a project the first time that project seals a build report carrying a valid capture marker** — from then on, a missing capture fails the seal closed. This is automatic and per-project: new installs arm on their first capture; existing installs stay in warn-mode until their agent (driven by the now-propagated brief, or a re-init that refreshes templates) produces a first real capture. The flip is a **defined automatic signal, not a lingering optional setting** — we are not shipping a permanently-optional guarantee.

**`ana test` is the default for every test run; only the baseline seals.** Checkpoint runs go through `ana test` too (compact output = the recurring saving) but **degrade to raw and never block iteration** on any capture bug. Only the final after-all-changes baseline produces the sealed marker and hits the gate. Verify's independent re-run also uses `ana test` (compact), but the **seal gate is scoped to `build_report.md`** so Verify's independence is never a propagation hostage.

**Baked-in invariants (the hardening — from the two bugs the first build shipped):**
- **Fail-closed on `spawnSync` `result.error`.** maxBuffer overflow or ENOENT must throw *before* writing the sink — never tee+seal truncated or empty bytes. (The first build ignored `result.error`; truncated/empty captures sealed as real.)
- **A `pass` requires `passed > 0`.** Zero-test, all-skipped, collection-error, compile-error, empty-but-exit-0 are NEVER green. (The first build's `deriveVerdict` returned `pass` for `{0,0,0}` at exit 0.)
- **Verdict trinary `pass | fail | abstain`** (renamed from the first build's `unverified` — it collides with the Verify stage and misreads as a trust judgment; `abstain` matches ABSTAIN-ON-UNKNOWN).
- **Fail-OPEN on counts / fail-CLOSED on preservation.** Unstructured runners (Go, cargo, .NET, default pytest) are the common case — counts go honestly `abstain`, the build still seals. No marker / no file / sha mismatch / byte-length mismatch → no seal (once armed).

## Acceptance Criteria

**Phase 1 — capture + warn-mode (never blocks):**
- **AC1:** `ana test [--stage build|verify] [--slug <s>] [--surface <name>]` runs the resolved test command via the NEW capturing runner using **array-arg spawn with NO shell**, keeps stdout+stderr, and tees the full raw bytes to `.ana/plans/active/{slug}/.captures/test-{stage}-{epoch}.log` (mode=always, fsync'd). It returns a compact one-line marker to the agent, not the raw scrollback.
- **AC2:** `resolveCommand` parses ana.json test commands without a shell: accepts a bare `cmd args`, the `(cd <path> && cmd args)` wrapper (POSIX `'\''`-unescaping the path), and a leading run of `VAR=val` env assignments (lifted into the spawn `env`); treats the first non-assignment token as the executable so `dotenv`/`cross-env` pass. It **refuses** pipes, additional `&&`-chains, `;`, `||`, redirections, `$()`, backticks, and globs with a clear, actionable error naming the offending construct. No silent shell fallback.
- **AC3:** The runner is **fail-closed on `spawnSync` `result.error`** — maxBuffer overflow or spawn failure (ENOENT) throws before any sink is written. A truncated or empty capture is never sealed.
- **AC4:** The captured bytes are inlined verbatim into the build report at save, delimited by `ana:capture-begin/-end` comments; the inlined block is byte-for-byte identical to the capture file (sha256 equal). Captured output containing backticks/fences round-trips intact.
- **AC5:** `validateCapturePresent`, `validateCaptureInlined`, and `validateCaptureNotTruncated` run at **both** save sites (`saveArtifact` and `saveAllArtifacts`) **before** the seal hash. In Phase 1 they run in **warn-mode**: a failure prints a warning, never `process.exit(1)`.
- **AC6:** Verdict is trinary `pass | fail | abstain`. `pass` requires counts read AND `passed > 0` AND no failures; `fail` = counts read with failures OR non-zero exit/error; `abstain` = couldn't read counts (unknown/unstructured) OR zero-test/all-skipped — raw output captured + sealed, no pass/fail asserted. **A `{0,0,0}` exit-0 result is never `pass`.**
- **AC7:** Counts are derived once, from the captured bytes, where the runner has a structured mode; `abstain` otherwise (**fail-open on counts** — the build still seals). Errors are never stripped from preserved output.
- **AC8:** The "run tests via `ana test`" instruction is injected into the code-generated brief by `writeWorktreeContext`; on any assembly failure the brief soft-falls-back to current content (no error, no block). The four agent templates (`.claude` + `.codex`, build + verify) are updated for new installs, but no behavior depends on a template reaching an existing customer.
- **AC9:** `ana test` is the default for checkpoint runs as well as the baseline; a capture bug on a checkpoint run **degrades to raw and never blocks** the run. Only the baseline produces the sealed marker.
- **AC10:** A `test_json` per-surface ana.json override ships (opt-in structured-mode command); flags are **never auto-appended** to a customer's `commands.test`. `--surface` resolves the correct per-surface command.
- **AC11:** A cross-stack adversarial corpus exists for `{vitest, jest, pytest, go, cargo, rspec, junit, dotnet}`, each with **per-stack rows for empty / all-skipped / 0-exit-0 / collection-error / compile-error** (NO-FALSE-GREEN), plus `.raw`/`.fail` pairs. A `describe.each(STACKS)` sweep asserts: PRESERVE (inlined == raw byte-for-byte), COUNTS-FROM-CAPTURE, SEAL-BINDS/TAMPER-FIRES, ERROR-NEVER-STRIPPED, NO-FALSE-GREEN, ABSTAIN-ON-UNKNOWN. A green verdict on any adversarial row is a CI-failing bug.

**Phase 2 — flip to fail-closed on the per-project adoption signal:**
- **AC12:** Once a project has sealed a build report carrying a valid capture marker, the three validators arm to **fail-closed** for that project: a subsequent build-report save with no marker / sha mismatch / byte-length mismatch hits `process.exit(1)` at the existing save-time gate, before the seal hash. The arming signal is sticky and automatic (not a user-toggled setting).
- **AC13:** A project that has never produced a valid capture remains in warn-mode and is **never blocked** — the gate cannot brick a customer who was never capturing. Fail-OPEN on counts and fail-CLOSED only on preservation hold after the flip.
- **AC14:** Build-only specs with no contract, and saves with no build report, never trigger the gate. The gate is scoped to `build_report.md`; `verify_report.md` saves are not gated (Verify's independence is preserved).

## Edge Cases & Risks

1. **Propagation (the #1 risk, corrected from the handoff).** The gate ships on the CLI/npm channel; agent templates do NOT refresh on re-init (`assets.ts:263-268`). An unconditional fail-closed gate bricks every existing customer's seal. Closed by: instruction in the code-generated brief (propagates with the gate) + self-arming warn→fail-closed (a project only enters enforcement after it has itself captured).
2. **Arming during the adoption window.** Once the propagated brief gets an existing customer's agent to capture once, the project arms — and a later raw run (stale template still says "run raw") would then block. This is the *intended* end state (once proven, enforce), but the brief instruction must be unambiguous enough that the agent uses `ana test` consistently. Flag for Plan: arming is sticky; the brief wording is load-bearing.
3. **`resolveCommand` refusing complex commands** is an availability edge. Covered cleanly: bare `cmd`, `(cd … && cmd)`, leading `VAR=val`, and any first-token binary (so `dotenv`/`cross-env` pass). The refused tail (pipes, multi-`&&`, redirects) gets a loud, actionable error — never a silent `shell:true` fallback (that would defeat the security boundary). A shell escape hatch, if ever wanted, must be explicit opt-in config, never the default.
4. **Silent truncation / empty seal** (bug 1 from the first build). `result.error` MUST be checked before any sink write (AC3).
5. **Vacuous green** (bug 2 from the first build). `pass` requires `passed > 0`; per-stack adversarial corpus is the mechanical hardening, treated as load-bearing, not test-padding (AC6, AC11).
6. **Inline size ceiling.** A legitimately huge honest capture must not hard-block. Set a generous ceiling *below* the spawn buffer: under → inline verbatim; over → don't inline, seal the full sha256 + a head/tail excerpt marked honestly; above the spawn buffer → fail-closed (AC3). Ship cheap, revisit with real data — an interim fail-closed-with-clear-message above the ceiling is acceptable. (Plan owns the value + excerpt-vs-fail-closed choice.)
7. **`.captures/` lifecycle.** The committed source of truth is the hashed inlined block in `build_report.md`; the raw `.log` is scratch the inliner reads at save time. Gitignore `.captures/`. **VALIDATE nothing re-reads the `.log` after the report seals.**
8. **Multi-harness.** Everything CLI-side (command, runner, validators, marker, counts, abstain, ceiling, brief injection) is harness-agnostic. The only harness-sensitive surface is *where the instruction lives* — resolved by using the code-generated brief, which both harnesses read identically.
9. **`artifact.ts` is a hot file (6 pipeline cycles).** Known proof-chain smell: `.saves.json` is read independently several times per save (`hasOpposingStageAdvanced`, phase inference). The new validators must **share the existing metadata read path**, not add a fifth independent read.

## Rejected Approaches

| Proposal | Why not |
|----------|---------|
| **The token ledger, entirely** (`js-tiktoken`, `token_economy` proof field + its 4-location cross-cut, `.token_ledger.jsonl`, `ana gain`) | The first build proved `saved_tokens` is **0 by construction**, used the **wrong tokenizer** (`o200k_base` is GPT-4o's, not Claude's), and left a **dead `undefined` placeholder** in `proofSummary`. The saving is real but delivered by the *capture mechanism as the default path*, not by measuring it — removing the ledger loses zero savings, only a vanity number that can't be stated as "% cheaper" or "$" (no measurable denominator) and is a cross-harness proxy. The author's own build report called it "a clean 3-commit revert." |
| **Unconditional fail-closed gate on first ship** | Bricks every existing customer's seal on `npm update` — templates don't refresh on re-init, so the install base runs tests raw and produces no marker. Replaced by self-arming warn→fail-closed. |
| **Instruction in agent templates only (the handoff's implied surface)** | `copyAgentFiles` skips existing files (`assets.ts:263-268`) — never reaches existing customers. The brief is the propagation-safe surface; templates are convenience for new installs. |
| **Reusing `runBuildCommand`** | `shell:true` + discards stdout (`worktree.ts:459`). A shell is an injection surface and the function throws away the bytes we need. The runner is a fresh security boundary. |
| **Regex-scrubbing test output** | Fragile across every customer's runner; risks the artifact. Use the runner's structured mode for counts; verbatim bytes for the artifact. |
| **Code-fence-delimited inline blocks** | Captured output containing backticks breaks fence round-tripping. Use `ana:capture-begin/-end` comment delimiters. |
| **A sealed token/byte metric of any kind** | Bytes/lines are exact and harness-agnostic but belong in the capture command's *own ephemeral output*, never sealed into the proof. Tokens are a proxy. No metric is sealed. |
| **Always-on `PreToolUse:Bash` discovery-filtering hook** | A live failure surface on every Bash call; a bug degrades the whole session. |
| **Standalone `ana where` command** | Competes with the grep reflex with no forcing function; doesn't propagate. |
| **Enforced per-stage token budgets** | Corrupts the agent's incentives — it could skip a contract assertion to stay under budget. **Never build.** |
| **New `ana test` nouns (`baseline`, `diff`)** | Flags on one capture-aware command, not new nouns. |
| **Old Phase 2 — symbol-site + ana.json-scalar briefing enrichment** | Separate work item. Keeps this scope on the integrity spine and avoids its "verify this line before trusting it" polite-instruction splinter. The brief is touched here only to inject the `ana test` instruction. |

## Open Questions

Resolved at scoping with the founder (Ryan) — recorded as decisions, not open items:

1. **Name/slug/branch → `captured-test-evidence` / `feature/captured-test-evidence`.** Verified kebab-case and matching `branchPrefix: feature/`. "verified" deliberately avoided (collides with the Verify stage).
2. **Gate rollout → warn→flip, self-arming per project (option a).** Warn-mode default; flips to fail-closed automatically when a valid capture marker is sealed for that project. A defined automatic signal, not a lingering optional setting. Mirrors verifier-intent-coverage.
3. **Instruction surface → the code-generated brief, required (option a).** `writeWorktreeContext` is the only channel that propagates with the gate and is harness-agnostic. Templates updated for new installs; nothing relies on a template reaching an existing customer.
4. **Capture scope → all-runs compact, baseline-only seal (option a).** `ana test` is the default for every run; checkpoints degrade to raw and never block; only the baseline seals.
5. **Old Phase 2 → separate work item (option a).**

Genuinely open for AnaPlan (design judgment, not founder decisions):
- The exact marker format and how the inliner expands marker → verbatim bytes at save, and how `validateCaptureNotTruncated` reads `bytes=N`.
- The inline ceiling value and the excerpt-vs-fail-closed-above-ceiling choice (edge 6).
- Where the per-project arming signal is stored (state file vs `ana.json custom` vs derived from prior sealed build reports) — must be sticky, cheap to read at save time, and undefined-safe for projects that never captured.

## Exploration Findings

### Patterns Discovered
- `artifact-validators.ts:582-600` — `validateBuildReportFormat` is four heading regexes, zero content inspection. The NEW validators sit alongside it, same pure `(filePath) => string | null` shape.
- `artifact.ts` — TWO save paths: `saveArtifact` (`:750`, the real pipeline path Build/Verify use via `ana artifact save build-report`) and `saveAllArtifacts` (`:1220`, the planning path). Build-report format gate today: `saveArtifact:928-934` and `saveAllArtifacts:1324-1330` (both `process.exit(1)`). **Wiring at one site is bypassable — both are required.**
- `artifact.ts:54-118` — `writeSaveMetadata`, the seal hash at `:74` (`sha256` over content), called `:1078` (single) / `:1489` (save-all). New validators must run BEFORE these calls.
- `verify.ts:64-67` — the seal re-hashes **only** `contract.yaml`; `build_report.md` is never re-checked after save. The guarantee is a NEW save-time gate, not a free extension of a continuously-enforced tamper loop.
- `worktree.ts:447-472` — `runBuildCommand`: `shell:true` (`:459-465`), discards stdout, returns `boolean`. Do NOT reuse — the new runner needs stdout + array-arg spawn + no shell.
- `worktree.ts:556-618` — `writeWorktreeContext` (called `:244`) writes the brief; Build Status section at `:586-598` already references the build command but carries no test instruction. Phase 1 injects the `ana test` direction here. `ana-build.md:93` already tells Build to read this brief — the read channel exists for existing customers.
- `ana-build.md:107` — today instructs "run `commands.test` for the final baseline" (raw). `ana-verify.md:169-177` — "Run Build, Tests, Lint" (raw). These are the lines the `ana test` direction supersedes (new installs).

### Constraints Discovered
- [TYPE-VERIFIED] Agent-template propagation: `copyAgentFiles` (`assets.ts:258-273`) skips existing files (`:263-268`); `copyCodexAgentFiles` (`:612-630`) same (`:617`, `:626`); `copyClaudeMd` (`:285-292`) same. Re-init does not refresh templates for existing customers. **The propagation correction rests on this.**
- [TYPE-VERIFIED] Codex templates are a **physically duplicated** tree (`templates/.codex/agents/*.md` + `*.agent.toml`), bodies byte-identical to `.claude`. Reaching both harnesses via templates = editing four files kept in sync. The brief avoids this entirely (one code path).
- [OBSERVED] ana.json test commands are shell strings — top-level `pnpm run test -- --run`; surfaces `(cd 'packages/cli' && pnpm vitest run)`. Generated by `state.ts:521-529` (cd-wrapper) and `commands.ts:74-81` (top-level), post-processed by `makeTestCommandNonInteractive` (`state.ts:353-401`). No structured cwd/argv form exists; `resolveCommand` is net-new.
- [OBSERVED] No `shell-quote`/`string-argv`/equivalent in `packages/cli/package.json` — the command parser is written from scratch. Every existing array-arg spawn hard-codes argv (`git-operations.ts:38`, etc.).
- [OBSERVED] `artifact.ts` is hot (6 cycles); known smell: multiple independent `.saves.json` reads per save. Validators must share the existing metadata read path.

### Test Infrastructure
- Vitest, fixtures under `tests/`. **Test count must not decrease** (CI 3 OS × 2 Node). The cross-stack adversarial corpus (AC11) is the bulk of Phase-1 effort and the de-risk: real `.raw`/`.fail` captures per runner + per-stack empty/all-skipped/0-exit-0/collection-error/compile-error rows + a `describe.each(STACKS)` invariant sweep. The backed-out build's corpus (8 stacks, 17 fixtures, in `.ana/worktrees/token-efficiency`) is a re-verifiable seed — read as data, re-derive.

## For AnaPlan

### Structural Analog
- **New command `test.ts`:** model on a focused command with flag parsing + ana.json resolution — `src/commands/scan.ts` or the `verify` command group (`verify.ts:132` `registerVerifyCommand`), registered in `src/index.ts:57-75`.
- **New validators:** structurally identical to `validateBuildReportFormat` (`artifact-validators.ts:582-600`) — pure `(filePath) => string | null`, wired at the same save-time gate at both save sites.
- **Warn→fail-closed flip:** mirror the verifier-intent-coverage warn-until-proven-then-flip (that scope's gate degrades to warn if its measurement can't go green; here the gate *starts* in warn and arms per project). Same philosophy: never ship a gate that can false-block a legitimate customer.

### Functional Analog
- `runBuildCommand` (`worktree.ts:447`) — same domain (spawn a project command), opposite shape (shell, no capture). Read it to see exactly what NOT to do; the new runner is its security-hardened inverse.

### Relevant Code Paths
- `src/utils/artifact-validators.ts:582-600` (validator shape) · `src/commands/artifact.ts` (save sites `:928`/`:1324`, hash `:74`/`:1078`/`:1489`, the `.saves.json` read path to share) · `src/commands/verify.ts:64` (seal — for understanding, NOT where the gate lives) · `src/utils/worktree.ts:556-618` (`writeWorktreeContext` — Phase 1 brief injection) and `:447` (the runner NOT to reuse) · `src/commands/init/anaJsonSchema.ts:38-53` (`test_json` override) · `src/commands/init/state.ts:252-273,353-401,521-529` + `commands.ts:74-81` (command generators — for `resolveCommand` to round-trip) · `templates/.claude/agents/{ana-build,ana-verify}.md` + `templates/.codex/agents/{ana-build,ana-verify}.md` (four template edits, new installs only).

### Patterns to Follow
- Capturing runner: array-arg spawn, no shell, keep stdout+stderr, fsync the tee, **check `result.error` before writing the sink**. New file under `src/utils/` — do not extend `runBuildCommand`.
- Counts derived once from captured bytes so reported counts == pasted transcript by construction.
- Soft-fallback is the law for the brief injection (mirror how `writeWorktreeContext` already degrades).
- Validators: share the existing `.saves.json` metadata read; do not add a fifth independent read.

### Known Gotchas
- **Templates vs. dogfood:** template edits go to `templates/.claude/agents/*.md` AND `templates/.codex/agents/*.md` (the product, all customers — and four files to keep in sync). Do NOT only edit the root `.claude/agents/*.md` (our dogfood). And **nothing may rely on a template reaching an existing customer** — the brief is the load-bearing surface.
- The gate runs BEFORE the seal hash — ordering matters at both `artifact.ts:1078` and `:1489`.
- Fail-OPEN on counts, fail-CLOSED on preservation — encode explicitly; it's the line that keeps the gate from blocking real customers.
- `shell:true` + appended flags is an injection surface — the new runner must avoid both; `resolveCommand` must refuse shell metacharacters loudly, never fall back to a shell.
- Pre-commit runs `tsc --noEmit`, build uses SWC — type errors fail only the hook. Thread the verdict/marker types correctly everywhere.

### Things to Investigate
- **Decompose by enforcement stage.** spec-1 = capture + warn-mode (the whole spine, never blocks); spec-2 = the self-arming flip to fail-closed. Spec-1 is the critical-path build; spec-2 is small once the marker + arming signal exist. The cross-stack corpus belongs to spec-1 and is the de-risk — design it first.
- **The per-project arming signal** — exact storage and read-at-save-time mechanism (sticky, cheap, undefined-safe for never-captured projects). This is the keystone of Phase 2; design it before the flip.
- **`resolveCommand` round-trip** against the real generator output (`state.ts:521-529` cd-wrapper with `'\''`-escaped paths, `-- --run` passthrough flags) plus the hand-edited tail (`VAR=val`, `dotenv`/`cross-env`). Decide the exact refusal set and the actionable error copy.
- **The marker format + inliner** (edge 6/7) — expansion at save, `bytes=N` truncation check, the `ana:capture-begin/-end` comment delimiters, and confirmation nothing re-reads `.captures/*.log` after seal.
- **Inline ceiling** value and excerpt-vs-fail-closed-above-ceiling, gated on the spawn buffer size.
