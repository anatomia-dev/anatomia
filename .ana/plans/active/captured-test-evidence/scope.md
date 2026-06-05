# Scope: Captured Test Evidence — Engine-Captured, Seal-Gated Test Evidence

**Created by:** Ana
**Date:** 2026-06-05

## Intent

The single most-trusted number a customer reads from a build — *did the tests pass, how many* — is today the **agent's self-report**, and nothing mechanically verifies the agent pasted real output. `validateBuildReportFormat` (`artifact-validators.ts:582-600`) checks only section *headers*; the test evidence inside is whatever the agent typed. This is the one place "verified over trusted" is currently only *hoped*: an agent that types "all tests pass" seals exactly like one that ran them.

Make test evidence **engine-captured and seal-gated**: the agent decides, the engine does the mechanics. The agent runs tests through a new `ana test` command; the engine tees the real bytes, inlines them verbatim into the build report, sha-checks them, and — once a project has proven it can capture — refuses to seal a build report without a genuine, untruncated capture.

**Secondary, real, NOT the headline:** running tests through the capture command returns a compact marker instead of 40–50 lines of scrollback, so the agent's working context stays lean on *every* test run, across the session, on any harness. This recurring saving comes from the **capture mechanism as the default test path**, not from measuring it. There is no token metric in this scope (see Rejected Approaches — the ledger is cut).

**Source:** `captured-test-evidence-anathink-handoff.md` (2026-06-05), the authoritative re-scope after the prior `token-efficiency` work item was cancelled. Its load-bearing claims were re-verified against live source during scoping. The handoff is **data, not a locked scope** — one of its central claims was verified false and is corrected below.

**Hard prerequisite — this scope ASSUMES a separate infrastructure scope lands first or in tandem.** That infra scope fixes the actual root cause of propagation: today re-init does **not** refresh agent templates (`copyAgentFiles` skips any file that already exists — `assets.ts:263-268`; same for Codex `:617`, CLAUDE.md `:288`), which project-context's merge-not-overwrite contract confirms. The infra scope makes re-init **refresh machine-owned template content** (the same section-ownership model skills already use) and adds a **CLI nudge to re-init when `anaVersion` is stale.** Propagation is owned entirely by that scope. This scope places the `ana test` instruction in the agent templates and **relies on them propagating** — it does not re-derive, re-solve, or build any workaround for propagation. We will spin up a separate AnaThink to scope the infra fixes.

**Why the prerequisite is hard, not soft (verified — DO NOT inherit the handoff's §5/§6 "resolved" framing).** The handoff calls the gate-vs-instruction "sequencing landmine" a modeling error, "resolved." It is not resolved by re-init *today*. The gate is runtime CLI code (`artifact.ts`) and goes live on `npm update` with no re-init. The instruction lives in templates that re-init currently skips for existing customers. So without the infra scope, an unconditional fail-closed gate would ship on the CLI channel while the install base's stale templates still instruct the raw path (`ana-build.md:107`) → no marker → **every existing customer's seal blocked on update.** These verified facts are the justification for the infra scope being a prerequisite — not a justification for any in-scope workaround. The residual window (a customer who updates the CLI but has not yet re-init'd) is covered by the warn→flip self-arming gate below, which is permanent rollout safety, not scaffolding.

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
    - `src/commands/artifact.ts` — wire the three validators in **warn-mode** at both save sites (`saveArtifact:928` region, `saveAllArtifacts:1324` region), before the seal hash (`writeSaveMetadata`, hash at `:74`; called `:1078` / `:1489`).
    - **THE instruction surface — the four test-running templates, kept in sync:** `templates/.claude/agents/ana-build.md` + `ana-verify.md` and `templates/.codex/agents/ana-build.md` + `ana-verify.md` — direct the agent to run tests via `ana test` instead of raw `commands.test`/checkpoint commands. This is the surface the feature relies on; it reaches existing customers via the prerequisite infra scope's re-init-refresh. (`ana-plan.md` ×2 *authors* the Build Brief command strings but does not run them — see For AnaPlan: decide whether Build/Verify wrap the authored command or Plan emits `ana test`-form directly.)
    - `ana.json` schema — `test_json` per-surface opt-in structured-mode override (`src/commands/init/anaJsonSchema.ts` `surfaceCommandsSchema:38-53`).
    - `tests/` — cross-stack adversarial corpus + `describe.each(STACKS)` invariant sweep.
  - **Phase 2 — flip to fail-closed on the per-project adoption signal:**
    - `src/commands/artifact.ts` — the warn-mode gate self-arms to fail-closed once a valid capture marker has been sealed for *this project*; absence of a marker then blocks the seal.
    - Adoption-signal storage (Plan's design call — candidates: a sticky flag in `.ana/state/`, `ana.json` `custom`, or derived from prior sealed build reports in the proof chain / completed plans).
- **Blast radius:** **High — the seal/save path gains a fail-closed gate.** Mitigated structurally: (1) warn-mode is the default and Phase 1 *never* blocks; (2) the flip is **self-arming** — a project only enters fail-closed after it is on a capture-aware version (or has produced a valid capture — Plan's choice), so the gate can never block a customer who was never capturing; (3) fail-OPEN on counts, fail-CLOSED only on preservation. The capturing runner is a **security boundary** (array-arg spawn, no shell, no appended flags) — `runBuildCommand` (`worktree.ts:459`, `shell:true`, discards stdout) must NOT be reused. No `worktree-context.md` / brief changes in this scope — propagation is owned by the prerequisite infra scope.
- **Estimated effort:** Phase 1: 4–6 focused days (the cross-stack adversarial corpus is the bulk and the de-risk). Phase 2: 0.5–1 day (the flip is small once the marker and arming signal exist).
- **Multi-phase:** yes — phased by **enforcement stage**, not by feature. Both phases ship the same spine; Phase 1 observes, Phase 2 enforces.

## Approach

**The thesis:** the agent decides; the engine does the mechanics. The number a customer trusts must be a captured fact, not a typed claim. Build the integrity spine once, ship it in warn-mode so it can never brick the install base, and let each project arm its own gate the moment it proves it can capture.

**The spine (both phases):**
1. **Shell-free capturing runner.** `ana test` resolves the project's test command and runs it via **array-arg spawn, NO shell**, tees the **full raw bytes** to a capture file (fsync'd), and returns a compact marker to the agent instead of the scrollback. This is a security boundary — not `runBuildCommand`.
2. **Marker + verbatim inliner + sha-check.** The agent pastes a one-line marker into the build report. At save, the engine expands it into a verbatim block delimited by `ana:capture-begin/-end` **comments** (not code fences — so captured output containing backticks round-trips) and sha256-checks the inlined block against the marker hash.
3. **Three save-time validators**, wired at **both** save sites before the seal hash: `validateCapturePresent` (a build report carries ≥1 capture), `validateCaptureInlined` (inlined block sha256 == marker hash), `validateCaptureNotTruncated` (inlined byte length == marker `bytes=N`).
4. **Counts derived once, from the captured bytes**, where the runner has a structured mode; honestly `N/A` otherwise. So the agent's reported counts == the pasted transcript by construction.

**The rollout — propagation owned by the prerequisite infra scope; instruction in the templates:**
- **Instruction surface = the agent templates that run tests.** The "run tests via `ana test`" direction goes into `ana-build.md` and `ana-verify.md` across both `templates/.claude/agents` and `templates/.codex/agents` (four files, kept in sync). This *is* the surface — not a convenience. It reaches existing customers because the **prerequisite infra scope makes re-init refresh machine-owned template content** and nudges re-init on `anaVersion` staleness. This scope builds **no in-product workaround** (no brief injection, no `worktree-context.md` change) — routing the instruction around the templates would be scaffolding for a problem the infra scope fixes at the root.
- **Warn → fail-closed, self-arming (residual-window safety, not scaffolding).** Mirrors the verifier-intent-coverage warn-until-proven-then-flip pattern, and protects the one window the infra scope can't instantly close: a customer who has `npm update`'d but not yet re-init'd. Phase 1's gate observes and warns but never blocks. Phase 2 flips to fail-closed on a **defined automatic signal** — *either* the project being on a capture-aware version (`anaVersion` current / post-re-init, now detectable thanks to the infra scope's staleness work) *or* a valid capture marker having been sealed for the project (the more verified-over-trusted signal). Exact choice is Plan's; the version-keyed option removes the need for a bespoke per-project marker store, simplifying Phase 2's keystone. The flip is automatic, not a lingering optional setting — we are not shipping a permanently-optional guarantee.

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
- **AC8:** The "run tests via `ana test`" instruction is placed in all four test-running templates (`ana-build.md` + `ana-verify.md` across `.claude` + `.codex`), kept in sync, directing the agent to invoke tests through `ana test` instead of raw `commands.test`/checkpoint commands. No brief / `worktree-context.md` change. Propagation to existing customers is the prerequisite infra scope's responsibility; this scope only places the instruction and relies on the templates propagating.
- **AC9:** `ana test` is the default for checkpoint runs as well as the baseline; a capture bug on a checkpoint run **degrades to raw and never blocks** the run. Only the baseline produces the sealed marker.
- **AC10:** A `test_json` per-surface ana.json override ships (opt-in structured-mode command); flags are **never auto-appended** to a customer's `commands.test`. `--surface` resolves the correct per-surface command.
- **AC11:** A cross-stack adversarial corpus exists for `{vitest, jest, pytest, go, cargo, rspec, junit, dotnet}`, each with **per-stack rows for empty / all-skipped / 0-exit-0 / collection-error / compile-error** (NO-FALSE-GREEN), plus `.raw`/`.fail` pairs. A `describe.each(STACKS)` sweep asserts: PRESERVE (inlined == raw byte-for-byte), COUNTS-FROM-CAPTURE, SEAL-BINDS/TAMPER-FIRES, ERROR-NEVER-STRIPPED, NO-FALSE-GREEN, ABSTAIN-ON-UNKNOWN. A green verdict on any adversarial row is a CI-failing bug.

**Phase 2 — flip to fail-closed on the per-project adoption signal:**
- **AC12:** On a **defined automatic arming signal** (the project being on a capture-aware version, or a valid capture marker having been sealed for the project — Plan picks one), the three validators arm to **fail-closed**: a subsequent build-report save with no marker / sha mismatch / byte-length mismatch hits `process.exit(1)` at the existing save-time gate, before the seal hash. The signal is automatic, not a user-toggled setting.
- **AC13:** A project that is not yet capture-aware (pre-update / pre-re-init, or never captured) remains in warn-mode and is **never blocked** — the gate cannot brick a customer who was never capturing. Fail-OPEN on counts and fail-CLOSED only on preservation hold after the flip.
- **AC14:** Build-only specs with no contract, and saves with no build report, never trigger the gate. The gate is scoped to `build_report.md`; `verify_report.md` saves are not gated (Verify's independence is preserved).

## Edge Cases & Risks

1. **Propagation (owned by the prerequisite infra scope — NOT solved here).** The gate ships on the CLI/npm channel; agent templates do NOT refresh on re-init today (`assets.ts:263-268`). This scope does not fix that — the infra scope does (re-init refreshes machine-owned template content + `anaVersion`-staleness re-init nudge). This scope's only obligations: place the instruction in the templates, and make the gate brick-proof for the residual window via warn→flip self-arming. **Do not build a brief/worktree-context workaround** — that would be scaffolding for a root cause being fixed elsewhere. If the infra scope slips, this scope ships in warn-mode and is still safe (never blocks an un-propagated customer).
2. **Residual update window.** A customer who `npm update`s before re-init'ing has the gate code but possibly stale templates. Self-arming covers this: the project does not arm until it is capture-aware, so a stale-template customer stays in warn-mode and is never blocked. Flag for Plan: the arming signal must be sticky and undefined-safe for never-captured / pre-re-init projects.
3. **`resolveCommand` refusing complex commands** is an availability edge. Covered cleanly: bare `cmd`, `(cd … && cmd)`, leading `VAR=val`, and any first-token binary (so `dotenv`/`cross-env` pass). The refused tail (pipes, multi-`&&`, redirects) gets a loud, actionable error — never a silent `shell:true` fallback (that would defeat the security boundary). A shell escape hatch, if ever wanted, must be explicit opt-in config, never the default.
4. **Silent truncation / empty seal** (bug 1 from the first build). `result.error` MUST be checked before any sink write (AC3).
5. **Vacuous green** (bug 2 from the first build). `pass` requires `passed > 0`; per-stack adversarial corpus is the mechanical hardening, treated as load-bearing, not test-padding (AC6, AC11).
6. **Inline size ceiling.** A legitimately huge honest capture must not hard-block. Set a generous ceiling *below* the spawn buffer: under → inline verbatim; over → don't inline, seal the full sha256 + a head/tail excerpt marked honestly; above the spawn buffer → fail-closed (AC3). Ship cheap, revisit with real data — an interim fail-closed-with-clear-message above the ceiling is acceptable. (Plan owns the value + excerpt-vs-fail-closed choice.)
7. **`.captures/` lifecycle.** The committed source of truth is the hashed inlined block in `build_report.md`; the raw `.log` is scratch the inliner reads at save time. Gitignore `.captures/`. **VALIDATE nothing re-reads the `.log` after the report seals.**
8. **Multi-harness.** Everything CLI-side (command, runner, validators, marker, counts, abstain, ceiling) is harness-agnostic. The instruction lives in both the `.claude` and `.codex` template trees (four files), kept in sync — there is no shared agent source, so a change to one must be mirrored to its twin. Validate the four bodies stay identical except for the `.claude` YAML frontmatter.
9. **`artifact.ts` is a hot file (6 pipeline cycles).** Known proof-chain smell: `.saves.json` is read independently several times per save (`hasOpposingStageAdvanced`, phase inference). The new validators must **share the existing metadata read path**, not add a fifth independent read.

## Rejected Approaches

| Proposal | Why not |
|----------|---------|
| **The token ledger, entirely** (`js-tiktoken`, `token_economy` proof field + its 4-location cross-cut, `.token_ledger.jsonl`, `ana gain`) | The first build proved `saved_tokens` is **0 by construction**, used the **wrong tokenizer** (`o200k_base` is GPT-4o's, not Claude's), and left a **dead `undefined` placeholder** in `proofSummary`. The saving is real but delivered by the *capture mechanism as the default path*, not by measuring it — removing the ledger loses zero savings, only a vanity number that can't be stated as "% cheaper" or "$" (no measurable denominator) and is a cross-harness proxy. The author's own build report called it "a clean 3-commit revert." |
| **Unconditional fail-closed gate on first ship** | Bricks every existing customer's seal on `npm update` — until the prerequisite infra scope makes re-init refresh templates, the install base runs tests raw and produces no marker. Replaced by self-arming warn→fail-closed. |
| **Brief / `worktree-context.md` injection of the `ana test` instruction** | The earlier draft routed the instruction through the code-generated brief to dodge templates-don't-propagate. That's scaffolding for a root cause being fixed properly by the prerequisite infra scope (re-init refreshes machine-owned template content). The elegant solution removes the cause; it does not add a second instruction surface to manage around it. The instruction lives in the templates, full stop. |
| **Solving propagation inside this scope** | Out of scope by decision — propagation is owned by a separate infrastructure scope (re-init template-refresh + `anaVersion`-staleness nudge) that lands first or in tandem. This scope assumes it and relies on it. |
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
2. **Gate rollout → warn→flip, self-arming (option a).** Warn-mode default; flips to fail-closed automatically on a defined signal (capture-aware version, or marker-sealed — Plan's choice). Not a lingering optional setting. Mirrors verifier-intent-coverage. Covers the residual update window.
3. **Instruction surface → the agent templates that run tests (option b, reframed).** The four files (`ana-build.md` + `ana-verify.md` × `.claude`/`.codex`) are THE surface. Propagation to existing customers is owned by the **prerequisite infra scope** (re-init refreshes machine-owned template content + `anaVersion`-staleness nudge) — not by a brief workaround. This scope assumes that scope lands first or in tandem.
4. **Capture scope → all-runs compact, baseline-only seal (option a).** `ana test` is the default for every run; checkpoints degrade to raw and never block; only the baseline seals.
5. **Old Phase 2 → separate work item (option a).**

Genuinely open for AnaPlan (design judgment, not founder decisions):
- The exact marker format and how the inliner expands marker → verbatim bytes at save, and how `validateCaptureNotTruncated` reads `bytes=N`.
- The inline ceiling value and the excerpt-vs-fail-closed-above-ceiling choice (edge 6).
- **The arming signal** — version-keyed (project on a capture-aware `anaVersion`, leaning on the infra scope's staleness work — simplest) vs marker-sealed (a valid capture seen for the project — more verified-over-trusted, needs a sticky store). The version-keyed option removes the bespoke per-project marker store; pick deliberately. Must be sticky, cheap at save time, undefined-safe for never-captured / pre-re-init projects.
- **Whether Plan authors `ana test`-form Build Brief commands or Build/Verify wrap the authored raw command** (the `ana-plan.md` authoring question — see For AnaPlan). Decides whether `ana-plan.md` ×2 also change, or only the four runner templates.

## Exploration Findings

### Patterns Discovered
- `artifact-validators.ts:582-600` — `validateBuildReportFormat` is four heading regexes, zero content inspection. The NEW validators sit alongside it, same pure `(filePath) => string | null` shape.
- `artifact.ts` — TWO save paths: `saveArtifact` (`:750`, the real pipeline path Build/Verify use via `ana artifact save build-report`) and `saveAllArtifacts` (`:1220`, the planning path). Build-report format gate today: `saveArtifact:928-934` and `saveAllArtifacts:1324-1330` (both `process.exit(1)`). **Wiring at one site is bypassable — both are required.**
- `artifact.ts:54-118` — `writeSaveMetadata`, the seal hash at `:74` (`sha256` over content), called `:1078` (single) / `:1489` (save-all). New validators must run BEFORE these calls.
- `verify.ts:64-67` — the seal re-hashes **only** `contract.yaml`; `build_report.md` is never re-checked after save. The guarantee is a NEW save-time gate, not a free extension of a continuously-enforced tamper loop.
- `worktree.ts:447-472` — `runBuildCommand`: `shell:true` (`:459-465`), discards stdout, returns `boolean`. Do NOT reuse — the new runner needs stdout + array-arg spawn + no shell.
- `ana-build.md:107` — today instructs "run `commands.test` for the final baseline" (raw), checkpoint commands at `:372`, full suite after fixes `:447`. `ana-verify.md:169-177` — "Run Build, Tests, Lint" (raw checkpoint command). These are the lines the `ana test` direction supersedes across both harness trees. (`ana-build.md:93` tells Build to read `worktree-context.md`, but this scope does NOT use that brief — propagation is the infra scope's job.)
- `ana-plan.md:420-427` — Plan *authors* the Build Brief checkpoint + baseline command strings that Build/Verify execute. Validated: this is the authoring source, distinct from the runner templates. Decide whether Build/Verify wrap or Plan emits `ana test`-form.

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
- `src/utils/artifact-validators.ts:582-600` (validator shape) · `src/commands/artifact.ts` (save sites `:928`/`:1324`, hash `:74`/`:1078`/`:1489`, the `.saves.json` read path to share) · `src/commands/verify.ts:64` (seal — for understanding, NOT where the gate lives) · `src/utils/worktree.ts:447` (the runner NOT to reuse — no `writeWorktreeContext` change in this scope) · `src/commands/init/anaJsonSchema.ts:38-53` (`test_json` override) · `src/commands/init/state.ts:252-273,353-401,521-529` + `commands.ts:74-81` (command generators — for `resolveCommand` to round-trip) · `templates/.claude/agents/{ana-build,ana-verify}.md` + `templates/.codex/agents/{ana-build,ana-verify}.md` (the four instruction-surface edits) · `templates/.claude/agents/ana-plan.md:420-427` + `.codex` twin (authoring source — change only if Plan emits `ana test`-form directly).

### Patterns to Follow
- Capturing runner: array-arg spawn, no shell, keep stdout+stderr, fsync the tee, **check `result.error` before writing the sink**. New file under `src/utils/` — do not extend `runBuildCommand`.
- Counts derived once from captured bytes so reported counts == pasted transcript by construction.
- Validators: share the existing `.saves.json` metadata read; do not add a fifth independent read (`artifact.ts` is hot — known smell).

### Known Gotchas
- **Prerequisite infra scope.** This scope assumes a separate infra scope (re-init refreshes machine-owned template content + `anaVersion`-staleness re-init nudge) lands first or in tandem and owns propagation. Build **no** brief/`worktree-context` workaround. If the infra scope slips, this scope still ships safely in warn-mode (never blocks).
- **Templates vs. dogfood:** template edits go to `templates/.claude/agents/*.md` AND `templates/.codex/agents/*.md` (the product, all customers — four files kept in sync, bodies byte-identical except `.claude` frontmatter). Do NOT only edit the root `.claude/agents/*.md` (our dogfood). The templates ARE the load-bearing instruction surface.
- The gate runs BEFORE the seal hash — ordering matters at both `artifact.ts:1078` and `:1489`.
- Fail-OPEN on counts, fail-CLOSED on preservation — encode explicitly; it's the line that keeps the gate from blocking real customers.
- `shell:true` + appended flags is an injection surface — the new runner must avoid both; `resolveCommand` must refuse shell metacharacters loudly, never fall back to a shell.
- Pre-commit runs `tsc --noEmit`, build uses SWC — type errors fail only the hook. Thread the verdict/marker types correctly everywhere.

### Things to Investigate
- **Decompose by enforcement stage.** spec-1 = capture + warn-mode (the whole spine, never blocks); spec-2 = the self-arming flip to fail-closed. Spec-1 is the critical-path build; spec-2 is small once the marker + arming signal exist. The cross-stack corpus belongs to spec-1 and is the de-risk — design it first.
- **The arming signal** — choose version-keyed (capture-aware `anaVersion`, leveraging the infra scope's staleness detection — no bespoke store) vs marker-sealed (sticky per-project store, more verified-over-trusted). This is the keystone of Phase 2; the version-keyed option simplifies it. Must be cheap at save time and undefined-safe for never-captured / pre-re-init projects.
- **The `ana-plan.md` authoring question** — Build/Verify wrap the authored Build Brief command in `ana test` (only the four runner templates change), or `ana-plan.md` ×2 emit `ana test`-form commands directly (six template files). Recommend the former (keeps Plan command-agnostic); confirm during planning.
- **`resolveCommand` round-trip** against the real generator output (`state.ts:521-529` cd-wrapper with `'\''`-escaped paths, `-- --run` passthrough flags) plus the hand-edited tail (`VAR=val`, `dotenv`/`cross-env`). Decide the exact refusal set and the actionable error copy.
- **The marker format + inliner** (edge 6/7) — expansion at save, `bytes=N` truncation check, the `ana:capture-begin/-end` comment delimiters, and confirmation nothing re-reads `.captures/*.log` after seal.
- **Inline ceiling** value and excerpt-vs-fail-closed-above-ceiling, gated on the spawn buffer size.
