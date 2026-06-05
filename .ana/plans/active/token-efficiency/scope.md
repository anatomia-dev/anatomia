# Scope: Token Efficiency — Engine-Captured Test Evidence + Enriched Build Briefing

**Created by:** Ana
**Date:** 2026-06-05

## Intent

Make the build report's test evidence **engine-computed, not agent-transcribed** — and prove the small token side-effect honestly. Today the most important number a customer trusts (did the tests pass, how many) is an agent self-report, and **nothing mechanically verifies the agent pasted real output** (`validateBuildReportFormat` at artifact-validators.ts:585 checks only section *headers*). This scope closes that gap with a capturing test command, a save-time gate that makes "typed 'tests pass' cannot seal," and a sealed measurement of bytes kept out of the agent's working context. It also lights up an existing dark asset — the auto-built symbol index — by folding symbol locations into the briefing the agent already reads.

Source: REQ-token-efficiency.md (2026-06-04), studied and re-verified against live code 2026-06-05. The REQ is **data, not a locked scope**; this scope takes its high-confidence slice and drops what verification showed to be weak.

**Framing correction carried into scope (do not inherit the REQ's headline):** The REQ names the disease as a "self-contradictory mandate" at ana-build.md:413/415. **Verified false** — those lines are complementary (both demand real pasted output; :413 just permits abbreviating >100-line output to the per-file summary). Do **not** write "resolves a prompt contradiction" anywhere — it won't survive anyone reading the prompt. The real, verified disease is below.

## Complexity Assessment

- **Kind:** feature
- **Size:** large
- **Surface:** cli
- **Files affected:**
  - **Phase 1 (keystone):** new `packages/cli/src/commands/test.ts`; new capturing runner (new file under `src/utils/`, e.g. `capture-runner.ts`); `src/index.ts` (register command); `src/utils/artifact-validators.ts` (3 new validators); wire validators at the save-time gate (`src/commands/artifact.ts`); `src/types/proof.ts` (`token_economy` on `ProofChainEntry`); `src/commands/work-proof.ts` (fold ledger at complete); new token-ledger writer + `js-tiktoken` dep (`packages/cli/package.json`); new `ana gain` read-only command; `ana.json` schema for `test_json` override (`src/commands/init/anaJsonSchema.ts` + `createAnaJson` in state.ts); cross-stack corpus fixtures + `describe.each` invariant test (`tests/`).
  - **Phase 2 (briefing):** `src/commands/work.ts` (~:1695 contextData assembly) + `src/utils/worktree.ts` (`writeWorktreeContext`) to inject symbol locations + ana.json command scalars; read `.ana/state/symbol-index.json`.
- **Blast radius:** Phase 1 touches the seal/save path and adds a non-optional gate — any bug blocks a customer's seal, so the gate MUST fail-open on counts and fail-closed only on missing preservation. New runner uses array-arg spawn (NO shell) — it is a security boundary. Phase 2 is a write-time projection into a file the agent already reads (ana-build.md:93) — low blast radius, soft-fallback to current behavior if assembly fails. The `js-tiktoken` dep is net-new (bundle size, lockfile).
- **Estimated effort:** Phase 1: 3–5 days (the corpus + cross-stack invariant test is the bulk). Phase 2: 0.5–1 day.
- **Multi-phase:** yes

## Approach

**The thesis:** the agent decides; the engine does mechanics. Every token an agent spends reading deterministic output to reach a deterministic conclusion is both waste and an unverified self-report. Move the *mechanics* into the engine where utility is real (high-frequency × high-token × purely mechanical); keep all *judgment* with the agent.

**Phase 1 — `ana test --capture` + the guarantee + sealed measurement (the keystone).**
Build one capture-aware test command that runs the project's test command, tees the **full raw bytes** to an artifact sink, derives counts deterministically **where the runner supports it** (best-effort, abstain otherwise), and inlines the verbatim output into the build report at seal via a marker the inliner expands. Enforce it with three new pure validators at the existing save-time gate — the load-bearing one, `validateCapturePresent`, makes a build report unable to seal without a real captured run. Measure the byte delta with a stamped tokenizer into a per-slug append-only ledger that folds into a new `token_economy` field on the proof chain at `ana work complete`, reusing the existing artifact-hash seal (zero new crypto). Report it as **"raw test bytes kept out of working context (preserved verbatim in the proof),"** never "tokens saved" and never "% cheaper."

Raw-byte **preservation is universal** (`tee → sha256 → inline → re-sha256 → compare` — nothing language-specific) and is the spine. Structured **count-parsing is additive, best-effort, and barred from the preservation path**: a stack with no structured reporter degrades to capture-raw / inline-raw / hash-raw, counts go honestly N/A. Adding a customer's stack = adding a fixture row; the guarantee auto-extends.

**Phase 2 — enrich the build briefing.**
The engine already bundles contract + proof into `.ana/worktree-context.md`, and the prompt already reads it (ana-build.md:93). Extend the generator (work.ts:~1695 → writeWorktreeContext) to also inject, for the files this work item touches, their **symbol definition sites** (from the auto-built `.ana/state/symbol-index.json`) plus the **ana.json command scalars** the agent would otherwise open ana.json to get. The agent gets, for free, the file:lines it would otherwise grep for — in a file it already reads, delivered through code that reaches the installed base via CLI update (no prompt change required).

## Acceptance Criteria

**Phase 1 — keystone:**
- AC1: `ana test --capture [--baseline] [--stage build|verify] [--slug <s>] [--surface <name>]` runs the resolved test command via a NEW capturing runner that uses **array-arg spawn with NO shell**, keeps stdout, and tees full raw bytes to `.ana/plans/active/{slug}/.captures/test-{stage}-{epoch}.log` (mode=always, fsync'd, no rotation). `--baseline` is a flag, not a sibling command.
- AC2: The full raw captured bytes are inlined verbatim into the build report at seal via a marker; inlined bytes are byte-for-byte identical to the capture file (sha256 equal).
- AC3: `validateCaptureInlined` (inlined block sha256 == marker hash), `validateCapturePresent` (a build report must carry ≥1 build capture, else save fails), and `validateCaptureNotTruncated` (inlined byte length == marker `bytes=N`) run at the existing save-time `process.exit(1)` gate, BEFORE the save-hash is taken.
- AC4: Counts are derived **once, from the captured bytes**. Where the runner has a structured mode, counts are engine-computed; where it does not, counts are honestly `N/A` and the build still seals (fail-open on counts).
- AC5: A green verdict on a collection-error / compile-error / empty-suite fixture is a CI-failing bug (NO-FALSE-GREEN). Errors are never stripped from preserved output. A malformed/unknown runner → `verdict: unverified` + raw passthrough (ABSTAIN-ON-UNKNOWN), still writing a preservation marker.
- AC6: Cross-stack corpus exists for `{vitest, jest, pytest, go, cargo, rspec, junit, dotnet}` (`.raw` + `.fail`) with a `describe.each(STACKS)` sweep asserting: PRESERVE (inlined == raw byte-for-byte), NO-COMPRESS-IN-ARTIFACT, COUNTS-FROM-CAPTURE, SEAL-BINDS/TAMPER-FIRES, ERROR-NEVER-STRIPPED, NO-FALSE-GREEN, ABSTAIN-ON-UNKNOWN.
- AC7: An `ana.json` `test_json` per-surface override ships (opt-in structured-mode command). Flags are **never auto-appended** to a customer's `commands.test`.
- AC8: A per-slug append-only `.token_ledger.jsonl` records each compressed call (`raw_tokens`, `view_tokens`, `saved_tokens`, `destination: context|artifact`, `capture_hash`, stamped tokenizer name). Artifact-bound calls have `saved_tokens == 0` by construction (the `destination` interlock).
- AC9: Tokens are counted with an exact stamped tokenizer (`o200k_base` via `js-tiktoken`), not chars/4. The tokenizer name is recorded in the ledger and the proof entry.
- AC10: At `ana work complete`, the ledger folds into a new `token_economy` field on `ProofChainEntry`; the ledger is treated as an artifact via `writeSaveMetadata` so its hash lifts into `entry.hashes` (reuse existing seal — no new crypto).
- AC11: A read-only `ana gain` surfaces the sealed `token_economy`. No dollar claims, no "% cheaper," no total-spend denominator.
- AC12: `--capture` wraps the **final `commands.test` baseline only** (Build's after-all-changes run and Verify's independent re-run) — NOT per-checkpoint single-file commands. No AnaPlan prompt change in this scope.

**Phase 2 — briefing:**
- AC13: `writeWorktreeContext` injects, for the files the work item touches, their symbol definition sites resolved from `.ana/state/symbol-index.json`, labeled as a freshness-stamped starting-point snapshot (advisory, not source of truth).
- AC14: The briefing also carries the ana.json command scalars the agent needs (build/test/lint), removing the need to open ana.json separately.
- AC15: If the symbol index is absent or assembly fails, the briefing soft-falls-back to current content (no error, no block). Symbol injection is scoped to files the work item touches (not all 1,449 symbols).

## Edge Cases & Risks

- **The gate must never block a legitimate customer.** Fail-OPEN on counts (abstain → marker with count=N/A still seals), fail-CLOSED only on missing preservation (no marker → no seal). A runner with no structured mode is the common case, not the exception (`pytest` needs a plugin; `go`/`cargo` emit streaming JSONL not a document; `dotnet` is TRX).
- **Shell injection.** The existing `runBuildCommand` (worktree.ts:447) uses `shell:true` and discards stdout — do NOT reuse it. The new runner is a security boundary: array-arg spawn, no shell, no appended flags.
- **tee-write is fatal.** If preservation can't be written, the run fails closed — there is no `--no-verify` escape and no "capture-less" seal.
- **Counterfactual honesty.** The agent already pastes the per-file summary (corpus: 176 reports, summary-only; `.saves.json` carries zero token data). The byte number is "moved out of working context," measured in context-window bytes via the stamped ruler — and the same bytes are preserved in the artifact (re-incurred at read). The number on tests will be **small** (summary-vs-summary). It is NOT the headline; the fidelity claim is.
- **Symbol-index staleness (Phase 2).** The index is a pre-build snapshot; it goes stale the moment Build edits. Inject as advisory orientation with a freshness stamp, scoped to touched files — never as a value the agent should trust mid-edit.
- **`js-tiktoken` is net-new.** Bundle size + lockfile change. Confirm it tree-shakes / lazy-loads so it doesn't bloat every CLI invocation.
- **Multi-surface.** `--surface` must resolve the right per-surface test command from ana.json `surfaces`.

## Rejected Approaches

- **Regex-scrubbing test output.** Fragile across every customer's runner; risks the artifact. Use the runner's structured mode where present; verbatim for the artifact. (The one RTK pattern explicitly NOT ported for tests.)
- **Item 2 — generic discovery-command filtering (always-on `PreToolUse:Bash` hook).** CUT. A live failure surface on every Bash call — a bug degrades the whole session for every customer mid-run. Corpus shows reports are already tight. Revisit only if capture data proves a real burn, and only fail-open + opt-in.
- **`ana where` standalone command (Item 3).** CUT as a command. It competes with the agent's grep reflex with no forcing function, and the only promotion channel (the prompt) doesn't propagate to existing installs (merge-not-overwrite). The symbol index is salvaged into the Phase 2 briefing instead — push, not pull.
- **Contract double-read fix.** The agent does read the contract twice (ana-build.md:93 embedded + :128 raw), but eliminating it needs a prompt change that doesn't propagate. Dropped — small and prompt-gated.
- **Per-checkpoint capture in slice one.** Requires an AnaPlan prompt change to emit capture-wrapped checkpoints (doesn't propagate) and widens the surface. Deferred to a fast-follow gated on dogfood data. Slice one captures the baseline whose counts get sealed.
- **Enforced per-stage token budgets.** Breaks the trust core — the agent could skip a contract assertion to stay under budget. Never build.
- **Dollar/total-spend claims, chars/4, "% cheaper," "N tokens saved."** All imply a denominator (total spend) we cannot measure (`run.ts` is `stdio:'inherit'`) or a counterfactual the agent never consumed. The honest claim is bytes kept out of working context.
- **N `ana testing` namespace / `ana test baseline` / `ana test diff` nouns.** Flags on one capture-aware command, not new nouns.

## Open Questions

- **Tokenizer honesty (headline form).** Lead with the absolute byte/token integer + visible stamped tokenizer name (reproducible = sealed), or the ratio? Lean: absolute + stamped ruler. AnaPlan need not resolve — it affects `ana gain` copy, not mechanics.
- **`ana work complete` already exists for in-flight items** (cli-telemetry, verifier-intent-coverage). Confirm the `token_economy` fold is additive and back-compatible for proof entries written without a ledger (older entries → field absent/empty, never an error).

## Exploration Findings

### Patterns Discovered
- `artifact-validators.ts:585` — `validateBuildReportFormat` checks only section headers (regex). The NEW validators sit alongside it, same pure `(filePath) => string | null` shape.
- `artifact.ts:74` — `const hash = createHash('sha256').update(content).digest('hex')`; idempotent compare at :77–80. This is the hashing primitive the guarantee reuses; the new validators run at the save-time `process.exit(1)` gate **before** this hash is taken.
- `verify.ts:64-67` — the seal re-hashes **only** `contract.yaml`. `build_report.md` is never re-checked after save. The guarantee is a NEW save-time gate, NOT a free extension of a continuously-enforced tamper loop.
- `worktree.ts:447` — `runBuildCommand(wtPath): boolean | null`, `stdio:'pipe'` (discards stdout for capture purposes), `shell:true`. Do NOT reuse — the new runner needs stdout + array-arg spawn + no shell.
- `run.ts:206` & `:382` — agent dispatch is `stdio:'inherit'`. Total spend is unmeasurable by design — this is why we never claim "% cheaper."
- `work.ts:1695-1753` — `contextData` assembly (contract assertions + proof findings) → `writeWorktreeContext`. The contract is read once here and embedded; Phase 2 extends this assembly.
- ana-build.md:93 — agent already instructed to read `.ana/worktree-context.md`. Phase 2 enriches content through the generator; the read channel already exists and reaches everyone with the current prompt.
- ana-build.md:107 — Build runs Plan-authored per-checkpoint single-file commands; `commands.test` only for the final baseline. This is why AC12 scopes capture to the baseline.

### Constraints Discovered
- [TYPE-VERIFIED] `ProofChainEntry` (src/types/proof.ts:~48) — no `token_economy` field today; AC10 adds it.
- [TYPE-VERIFIED] `runBuildCommand` returns `boolean | null` (worktree.ts:447) — stdout is discarded; unusable for capture.
- [OBSERVED] `.ana/state/symbol-index.json` — auto-built during `ana init` (state.ts:119 `buildSymbolIndexSafe` → `buildSymbolIndex`), fresh on each scan (dogfood: 276 files, generated on the latest scan). Universally present for any initialized project. NOT copied on re-init (rebuilt) per state.ts:671.
- [OBSERVED] Corpus: 176 completed build reports are summary-only; `grep -ri token` across `.saves.json` = 0. Token measurement starts fresh at the Phase-1 ledger, forward-only. No retroactive baseline.
- [INFERRED] `js-tiktoken` is not in package.json — net-new dependency.

### Test Infrastructure
- Vitest, fixtures under `tests/`. The cross-stack corpus (AC6) is the bulk of Phase-1 effort: real `.raw` + `.fail` captures per runner + a `describe.each(STACKS)` invariant sweep. Copy RTK's inline runner tests as a regression seed where applicable (Apache-2.0, attribute).

## For AnaPlan

### Structural Analog
- **New command `test.ts`:** model on an existing focused command with flag parsing + ana.json resolution — `src/commands/scan.ts` or `src/commands/proof.ts` (commander registration in `src/index.ts`). For the read-only `ana gain`, the closest shape is the read-only `ana proof` subcommands in `src/commands/proof.ts`.
- **New validators:** structurally identical to `validateBuildReportFormat` (artifact-validators.ts:585) — pure `(filePath) => string | null`, wired at the same save-time gate.
- **Ledger-as-artifact:** follow the existing `writeSaveMetadata(slugDir, type, …)` call path so the ledger hash lifts into `entry.hashes` (work-proof.ts).

### Relevant Code Paths
- `src/utils/artifact-validators.ts` (validators), `src/commands/artifact.ts` (save-time gate + hashing primitive), `src/commands/verify.ts:64` (seal — for understanding, NOT where the gate lives), `src/commands/work-proof.ts` + `src/types/proof.ts` (proof entry + `token_economy`), `src/utils/worktree.ts:447` (the runner NOT to reuse) and `writeWorktreeContext` (Phase 2), `src/commands/work.ts:1695` (briefing assembly), `src/commands/symbol-index.ts` + `.ana/state/symbol-index.json` (Phase 2 source), `src/commands/init/anaJsonSchema.ts` + `createAnaJson` (the `test_json` override).

### Patterns to Follow
- Capturing runner: array-arg spawn, no shell, keep stdout, fsync the tee. New file under `src/utils/` (e.g. `capture-runner.ts`) — do not extend `runBuildCommand`.
- Counts derived once from captured bytes so Build's reported counts == Build's pasted transcript by construction.
- Soft-fallback is the law for Phase 2 (mirror how the existing briefing degrades).

### Known Gotchas
- The gate runs BEFORE the save-hash — ordering matters (artifact.ts).
- Fail-OPEN on counts, fail-CLOSED on preservation — encode this explicitly; it's the line that keeps the gate from blocking real customers.
- `shell:true` + appended flags is an injection surface — the new runner must avoid both.
- Gotcha/skill propagation: validator + command + ledger reach the installed base via CLI update; the prompt does not. Do NOT design any Phase-1 guarantee that depends on a prompt change.
- Phase 2 symbol injection must be scoped to touched files and freshness-stamped — whole-index injection would mislead and bloat.

### Things to Investigate
- **Decompose into two specs.** Recommended: spec-1 = Phase 1 (capture + guarantee + sealed measurement), spec-2 = Phase 2 (briefing enrichment). Phase 2 is independent and low-risk; it can plan/build/verify on its own once Phase 1's shape is known, or in parallel.
- The exact marker format (how the inliner expands marker → verbatim bytes at seal, and how `validateCaptureNotTruncated` reads `bytes=N`) — Plan's design call.
- Whether `ana test --capture` resolves the test command from `ana.json` top-level `commands.test` or per-surface `surfaces[name].commands.test` when `--surface` is given (both exist in ana.json — see surfaces block).
- `js-tiktoken` load strategy so it doesn't bloat cold CLI startup.
