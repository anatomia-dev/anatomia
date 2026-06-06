# Scope: Generalize Capture to Build & Lint, Compact Failures, Instrument Pipeline Savings

**Created by:** Ana
**Date:** 2026-06-06

## Intent

Turn the thick-command / thin-prompt capture architecture — today the product's sellable lead but built only for `ana test` — into the demoable, measurable core the founder review identified.

Three moves, in strict dependency order:

- **A — Generalize capture to build & lint.** `ana build` and `ana lint` as siblings of `ana test`, reusing the proven `resolveCommand` + capture spine, pointed at `commands.build` / `commands.lint`. Pure Layer A: capture + compact return, **no seal, no gate.** The thesis naked.
- **B — Compact failures into the agent-facing return.** On a failing run (test/build/lint), the return the agent receives carries a mechanically-extracted, actionable failure summary (`file:line: msg`, capped) instead of only a marker pointing at a `.log` the agent must separately re-read. Verdict/counts always included. This is what makes the fix-loop demo true ("context stays flat across five build-fix iterations instead of ballooning to 50k") and what makes C's measurement honest.
- **C — Instrument pipeline savings + command activity.** Engine-side, per capture event, record atomic facts (bytes/lines raw vs returned, command, phase, counts/verdict for test). Accumulate in a gitignored per-work-item sidecar that every capturing phase appends to; at `ana work complete`, when an **opt-in, off-by-default** flag is on, write a durable, **unsealed** rollup onto the proof entry.

The discipline this scope must not violate: we deliberately cut the token ledger (`js-tiktoken`, `token_economy`, `.token_ledger.jsonl`, `ana gain`). C records **bytes/lines/counts only**, **unsealed**, **off by default**, reporting **compression ("emitted X, surfaced Y")** — never a counterfactual saving, never a tokenizer, never a percentage of cost.

The headline value: **A + B carry the demo** (context compression in the fix loop); **C produces the number** (a fact, not a vanity estimate). The verification rigor from `captured-test-evidence` is the quiet guarantee underneath; this scope is the sellable surface of the same machine.

## Complexity Assessment

- **Kind:** feature
- **Size:** large
- **Surface:** cross-surface
  - *(primary `cli`; secondary `website` — the proof viewer renders the metrics block)*
- **Files affected:**
  - **Spec A (new):** `packages/cli/src/commands/build.ts`, `packages/cli/src/commands/lint.ts` (thin — parameterize the existing capture path by command key); registration in `packages/cli/src/index.ts`; **the four agent templates** — `packages/cli/templates/.claude/agents/ana-build.md`, `.../ana-verify.md`, `packages/cli/templates/.codex/agents/ana-build.md`, `.../ana-verify.md` (ana-build + ana-verify, the two agents that *run* commands).
  - **Spec B:** the return-formatting / `printOutcome` path in `packages/cli/src/commands/test.ts` and the new `build.ts`/`lint.ts` wrappers; a **new failure-extraction util** (`packages/cli/src/utils/failure-extract.ts` or similar) + per-stack deterministic test fixtures.
  - **Spec C (code):** the per-capture recorder (engine-side, in/around `capture-runner.ts` / the command wrappers — **NOT** the agent prompt); the sidecar writer (`.ana/state/savings.jsonl`); the rollup reader+writer at `ana work complete` (`packages/cli/src/commands/work.ts`, `packages/cli/src/commands/work-proof.ts`); the `metrics` field on the proof entry (`packages/cli/src/types/proof.ts`, `packages/cli/src/utils/proofSummary.ts`).
  - **Spec C (C4 config — BLOCKED on Scope 1):** `packages/cli/src/commands/init/anaJsonSchema.ts`, `packages/cli/src/commands/init/state.ts` (`createAnaJson` + `preserveUserState`).
  - **Spec C (viewer):** `website/app/docs/proof/[slug]/page.tsx` (render the metrics block when present).
  - **Dogfood:** root `ana.json` (flip the metrics flag on for ourselves).
- **Blast radius:** `capture-runner.ts` and `commands/test.ts` are load-bearing and shared with the seal/gate. **Spec A and Spec B must not touch the seal, the gate, the inliner, or the sealed inline block in `build_report.md`** — B changes only what the agent *sees* on stdout, never the `.log` and never the sealed receipt. Spec C's C4 config work touches the exact three functions Scope 1 (`retire-capture-self-arming`) modifies — **hard build-order dependency** (see Edge Cases). `work-proof.ts` is the save path for every proof entry; the `metrics` field must be additive and optional so customer proofs stay byte-identical when the flag is off.
- **Estimated effort:** 3–5 focused days across the three specs. A is near-symmetric to test capture (low risk). B is the rabbit-hole spec (tuning + per-stack fixtures). C is broad (recorder + sidecar + durable rollup + viewer + config) but each piece is small.
- **Multi-phase:** yes

*(Three specs, strict order A → B → C. AnaPlan produces spec-1 (A), spec-2 (B), spec-3 (C). C depends on B because measuring "returned" before B overstates savings on failures. C4's config sub-item is additionally gated on Scope 1 landing — see Edge Cases.)*

## Approach

Generalize the proven capture spine to two new named verbs, make the *failing* return self-sufficient so the fix loop stays lean, then instrument the engine to record exact compression facts into a durable, unsealed, opt-in record. Each spec is foundation for the next: A gives B more commands to compact; B makes C's "returned" measurement honest.

**Spec A — capture, generalized (no seal, no gate).** `resolveCommand(cmdString, baseDir)` is already fully generic — "test" is not hardcoded; the command key is fetched one layer up. `ana build` / `ana lint` are thin commands that fetch `commands.build` / `commands.lint` (mirroring `ana test`'s `--surface` resolution), call the same `resolveCommand` + `runCapture`, and emit a marker with a new stage. **Crucially, build/lint are pure Layer A** — capture + compact return, zero integrity machinery. Nobody trusts "verified lint"; this is deliberate and it is the cleanest demo of the thesis. `deriveCounts` is runner-specific and **abstains** on unrecognized output — build/lint will usually produce null counts, which is correct (counts are a test concept). **Stop at three verbs.** No `ana check --kind`, no third capture mode, no invented `build_json`/`lint_json` surface variants (they do not exist in the schema and the REQ forbids inventing them).

**Spec B — the failing return becomes self-sufficient (mechanical).** Today a *green* run's marker hides the noise, but a *red* run forces the agent to re-read the full `.log` to get the failures — and that re-ingestion happens inside the fix loop, exactly when context pressure is worst. B extracts the failure lines (`FAIL`, `Error`, `AssertionError`, `file:line`, known runner failure shapes) plus minimal surrounding context, caps at N, head+tails the remainder, and **always prepends verdict/counts**. **Deterministic, mechanical — grep + cap + head/tail. No LLM-summarizer-of-errors** (slow, recursive, non-deterministic; the exact dark-room move we avoid). **Conservative-first:** keep more lines, prove the agent fixes from the return alone, then tune down — under-compacting wastes a little context; over-compacting forces a `.log` re-read and defeats both the demo and the metric. **Fallback:** if extraction finds no recognizable failure lines, return head+tail of the raw — never an empty or misleading summary. **Boundary that must hold:** full captured bytes still go to the `.log` and (for test) the sealed inline in the report. B changes only the agent-facing **return** (the `printOutcome` / stdout path), never the `.log` and never the sealed receipt. One capture, two representations: full fidelity for the record, signal for the agent.

**Spec C — record atomic facts, derive metrics at read.** Per capture event, record one row of atoms — never pre-compute only "savings":

```
{ ts, command (test|build|lint), phase (build|verify|checkpoint),
  raw_bytes, raw_lines, returned_bytes, returned_lines,
  verdict (pass|fail|abstain; test only, null otherwise),
  failed_count, passed_count, skipped_count (test only; from deriveCounts) }
```

`returned_*` measures the **post-B** representation (this is the B→C dependency). Compression (`raw − returned`), ratio, command counts by type/phase, failure counts, and the spin-out pattern (an ordered run of lint after a failed lint) are all derivable at read from the ordered rows — record the atoms, derive later.

- **Accumulation — one shared sidecar, free pipeline rollup.** A gitignored `.ana/state/savings.jsonl`, keyed by slug, that every capturing phase appends to. Confirmed: `.ana/state/` lives **inside the worktree checkout**, and Verify **reuses Build's worktree** — so one sidecar naturally accumulates Build's runs *and* Verify's runs. The rollup is a sum at the end; no cross-artifact "verify pulls from the build report" plumbing.
- **Durable record — option (b), the unsealed `metrics` field on the proof entry.** Confirmed: the proof-chain entry carries **no entry-level integrity hash** — `hashes` is a `Record` of per-artifact file hashes, and the only cryptographic seal is the capture block *inside `build_report.md`*. So an **optional `metrics` field on `ProofChainEntry`**, written only when the flag is on, is provably outside any integrity hash, leaves customer proofs byte-identical when the flag is off, and the proof viewer renders it for free. **Hard constraint:** metrics land on the proof entry, **never in `build_report.md`** (that file *is* hashed — putting metrics there would change the artifact hash). At `work complete`, the rollup reader reads the worktree's sidecar **before the worktree is pruned** and folds the summed atoms onto the entry.
- **C4 — config flag, mirroring Scope 1's convention.** A single top-level `ana.json` enum flag (lean: `captureMetrics: "on" | "off"`), following `mergeStrategy` end-to-end (schema enum → written in `createAnaJson` → preserved in `preserveUserState`), **populated `off` at init** (the inverse default of Scope 1's `captureGate: on`). **Absent = off** (brick-proof, zero-surprise). **When off, the sidecar is not even written** — zero cost, zero data, for every customer but us; we flip it on in the dogfood. This is the same config pattern Scope 1 establishes — a sibling flag in the same three functions, which is why this sub-item is build-gated on Scope 1 (below).
- **Honesty rules (non-negotiable):** lines and bytes, never tokens. "Compressed," not "saved." Never a percentage of cost. Unsealed — outside the integrity hash, never consumed by gate/seal. Compounding is narrative, not measured (record exact per-event compression; let the story carry "it persists across every turn"). Counts are facts too ("lint ran 7×, build 1×, test 4× — 3 failed → spun into retries").

The moat made concrete: almost everyone stuffs instructions into the prompt; we replace prose with a command whose *return is the context*, delivered fresh. Build/lint is the obvious next collapse of a fat instruction block into a thick command — and the pattern, not the verb count, is the moat.

## Acceptance Criteria

**Spec A — generalize capture to build & lint**
- **AC-A1:** `ana build` and `ana lint` exist as commands, registered under the pipeline group, resolving `commands.build` / `commands.lint` (with the same `--surface` resolution `ana test` has), and reusing `resolveCommand` + `runCapture` with **no re-authoring** of the capture spine.
- **AC-A2:** Build/lint capture is **pure Layer A** — it emits a marker and captures to a `.log`, but engages **no seal and no gate**: a build/lint capture never blocks an artifact save and is never length-addressed/sha-sealed into a report.
- **AC-A3:** On a command output `deriveCounts` does not recognize (the common build/lint case), counts are `null` (abstain) — never fabricated.
- **AC-A4:** The four agent templates (`.claude` + `.codex` × `ana-build` + `ana-verify`) instruct the thick command (`ana build` / `ana lint`) in place of prose like "run the build and check the output," consistent with how each already instructs `ana test`. ana-plan is unchanged (authoring-only; does not run commands).
- **AC-A5:** No third capture mode, no `ana check --kind`, and no `build_json`/`lint_json` surface variants are introduced.

**Spec B — compact failures into the return**
- **AC-B1:** On a **failing** test/build/lint run, the agent-facing return includes a mechanically-extracted failure summary (failure lines with `file:line: msg` where available, plus minimal surrounding context), capped at a defined N, with the remainder head+tailed.
- **AC-B2:** The return always prepends verdict and counts (counts where applicable).
- **AC-B3:** Extraction is **deterministic** — pure pattern-matching (grep + cap + head/tail), no LLM call, no network, identical output for identical input. Verified by per-stack fixtures.
- **AC-B4:** When no recognizable failure lines are found, the return falls back to head+tail of the raw output — never an empty or misleading summary.
- **AC-B5:** The full captured bytes are unchanged in the `.log`, and (for test) the sealed inline block in `build_report.md` is byte-identical to pre-B behavior. **B changes only the agent-facing return.**
- **AC-B6:** Conservative-first calibration is documented: the chosen N and context window favor "the agent can fix from the return alone" over maximal compression, with the tuning rationale recorded for later tightening.

**Spec C — instrument savings + activity**
- **AC-C1:** Each capture event (test/build/lint, baseline and checkpoint) records one atomic row — `ts, command, phase, raw_bytes, raw_lines, returned_bytes, returned_lines`, plus `verdict` and `passed/failed/skipped_count` for test (null otherwise) — to `.ana/state/savings.jsonl` keyed by slug. `returned_*` reflects the **post-B** representation.
- **AC-C2:** Recording is **engine-side only** — no measurement instruction appears in any agent template/prompt. The agent runs the thick command unaware it is being measured.
- **AC-C3:** When the metrics flag is **off or absent, the sidecar is not written at all** — zero files, zero cost.
- **AC-C4:** Build and Verify of one work item append to the **same** sidecar (shared worktree), so the rollup spans both phases without cross-artifact plumbing.
- **AC-C5:** At `ana work complete`, when the flag is on, a durable rollup is written to an **optional `metrics` field on the proof entry** — summing the sidecar's atoms (per-command counts, total raw vs returned bytes/lines, failure counts). The rollup is read from the worktree sidecar before the worktree is pruned.
- **AC-C6:** The `metrics` field is **outside any integrity hash**, is **absent entirely when the flag is off** (a flag-off proof entry is byte-identical to today's), and metrics never appear in `build_report.md`.
- **AC-C7 (C4 — blocked on Scope 1):** A top-level `ana.json` enum flag (lean `captureMetrics: "on"|"off"`) is declared in the schema (typed, not merely `.passthrough()`-tolerated), written **`off`** by `ana init`, and preserved by `preserveUserState` — mirroring `mergeStrategy` / Scope 1's `captureGate`. **Absent = off.**
- **AC-C8:** The dogfood (`anatomia` repo) has the flag written **`on`** in its `ana.json`, and a completed pipeline run produces a populated `metrics` field on its proof entry.
- **AC-C9:** The proof viewer (`website/app/docs/proof/[slug]/page.tsx`) renders the metrics block when present and renders nothing (no empty panel) when absent.
- **AC-C10:** Reported figures are bytes/lines/counts only — no tokens, no percentage-of-cost, no sealed/economy field. Language is "compressed/emitted/surfaced," never "saved."

**Cross-cutting**
- **AC-X1:** `pnpm run build`, the full `packages/cli` test suite, lint, and typecheck pass; total test count does not decrease (new commands, the extraction util, and the recorder each carry coverage).

## Edge Cases & Risks

- **HARD BUILD-ORDER DEPENDENCY — Scope 1 must land first.** This scope **must not enter Build until `retire-capture-self-arming` is merged to `main`.** Specifically, C4 edits `anaJsonSchema.ts`, `createAnaJson`, and `preserveUserState` — the exact three functions Scope 1 modifies to add `captureGate`. Building C4 before Scope 1 lands means threading the metrics flag through the arming machinery Scope 1 is deleting (the precise rework the REQ warns against) and a near-certain merge conflict. Scoping and planning now is safe (C4 references Scope 1's *stable config pattern*, the `mergeStrategy` analog — not its exact final text); **Build is the gate.** Specs A and B have **no** Scope 1 dependency and can build first.
- **Scope drift into the seal/gate (Spec A & B).** Build/lint are pure Layer A and B touches only the return. Do **not** touch: `evaluateCaptureGate`/`applyCaptureGate` (the gate), `validateCapturePresent`/`validateCaptureInlined`/`validateCaptureNotTruncated` (the seal), `inlineReportCaptures` (the inliner), the sealed inline block in `build_report.md`, the trinary verdict, or the 8-stack no-false-green corpus. If Plan/Build finds itself editing these, stop.
- **B over-compaction defeats the whole point.** If the summary omits what the agent needs to fix, the agent re-reads the `.log`, context balloons in the fix loop (A's demo breaks), and C records "returned = 2 lines" while the agent actually re-ingested 300 (the metric lies). Conservative-first is a requirement, not a preference. The no-recognizable-failures fallback (head+tail raw) must never produce an empty return.
- **The metrics field must be truly absent when off (Spec C).** A `metrics: null` or `metrics: {}` left on the entry when the flag is off would make customer proofs differ from today's byte-for-byte. The field must be omitted entirely. This is the line that keeps C on the right side of the cut-ledger discipline.
- **Sidecar lifetime vs. worktree pruning.** The sidecar lives in the worktree's gitignored `.ana/state/`. The rollup reader at `work complete` must read it **before** `work complete` prunes the worktree. Plan must pin this ordering.
- **`returned_*` must measure the real return.** C must record the bytes/lines the agent actually receives (post-B compaction), at the same point the return is emitted — not the raw capture. Recording raw as "returned" reintroduces the dishonesty.
- **deriveCounts abstains for build/lint.** Expected and correct — but Plan must ensure the recorder and the `metrics` rollup handle null counts cleanly (build/lint contribute byte/line/count-of-runs facts, not pass/fail counts).
- **`.passthrough()` masking (C4).** `AnaJsonSchema` uses `.passthrough()`, so an undeclared `captureMetrics` key would survive silently. Declare it explicitly as a typed enum so it is validated and discoverable.
- **Test-count floor.** CI enforces test count must not decrease across 3 OS × 2 Node. Each spec adds coverage; Plan documents the expected delta.

## Rejected Approaches

- **A token count / tokenizer / `$`-or-`%`-of-cost.** Rejected — cross-harness-wrong, no clean denominator; the exact vanity we cut with the token ledger. Bytes/lines/counts only.
- **Sealing the metrics / putting them in the integrity hash.** Rejected — pollutes the proof and makes the seal vary by flag. Metrics are an unsealed fact record.
- **Metrics on by default.** Rejected — off by default, flag-gated, sidecar not even written when off. Customers carry zero cost.
- **An LLM-summarizer for failure-compaction (Spec B).** Rejected — non-deterministic, slow, recursive; the dark-room move we avoid. B is mechanical: grep + cap + head/tail.
- **A seal or gate on build/lint (Spec A).** Rejected — nobody trusts "verified lint." Build/lint is pure capture, no integrity machinery; the cleanest thesis demo.
- **A new command empire (`ana gain`, `ana metrics`, generic `ana check --kind`).** Rejected — surfacing is a read (at `work complete`, or one thin readout). Three verbs: test/build/lint. Don't rebuild the ledger's command surface.
- **Burdening the agent prompt with measurement instructions.** Rejected — all measurement is engine-side; the agent just runs the thick command.
- **"Verify pulls the build rollup from the build report."** Rejected — the shared worktree sidecar makes cross-phase aggregation automatic; no cross-artifact pulling.
- **Option (a) sidecar-only durable record.** Rejected — fails the founder's "go back and look at old proofs" requirement; the sidecar is ephemeral and gitignored.
- **Option (c) separate committed `.ana/metrics/<slug>.json`.** Considered, not chosen — durable and keeps the proof structurally pure, but the viewer must ingest it separately. Chosen (b) because investigation confirmed the proof entry has no entry-level seal, so (b) is safe *and* renders in the viewer for free. (Plan may revisit only if it finds an entry-level hash I missed.)
- **Building C4 now alongside Scope 1.** Rejected — the build-order gate above. Plan now, build after Scope 1 lands.

## Open Questions

*(Most REQ open questions are resolved in Exploration Findings. These remain for Plan's design judgment.)*

- **OQ-C1 (RESOLVED → option b).** Durable rollup is an optional `metrics` field on the proof entry. Basis: the proof entry carries no entry-level integrity hash (verified — `proofSummary.ts:898–902`, no entry hashing anywhere); the only seal is the capture block inside `build_report.md`. Plan owns the field's exact shape. *(Re-open only if Plan discovers an entry-level hash.)*
- **OQ-B1 — failure-extraction tuning.** The exact N, context-window size, and per-runner failure patterns. Conservative-first. This is the spec most likely to need a real corpus of failing outputs per stack — Plan should define the fixture corpus (mirror the 8-stack capture corpus shape).
- **OQ-C6 — flag name + status readout.** Lean `captureMetrics: "on"|"off"`. Scope 1 is adding a gate readout to `ana work status`; a one-line "metrics: off | gate: on" there is cheap visibility — Plan decides whether to fold it in (don't over-build).
- **OQ-C4 — cross-proof analysis (explicitly later).** Out of scope. Record the durable facts now in a scannable shape (the proof-entries array already is one); the cross-proof *read tool* is future work. Don't preclude it; don't build it.
- **Sidecar schema versioning.** Should `savings.jsonl` rows carry a schema version for future-proofing the durable rollup? Lean: yes, a cheap `v` field. Plan's call.

## Exploration Findings

### Patterns Discovered
- **`resolveCommand`** (`packages/cli/src/utils/capture-runner.ts:242–271`) is fully generic and shell-free — takes a command string + baseDir, refuses shell metacharacters, returns `{program,args,env,cwd}`. "test" is **not** hardcoded; the command key is fetched one layer up in `test.ts`. `ana build`/`ana lint` reuse it by fetching a different key.
- **Command-key resolution** lives in `test.ts` (`resolveTestCommandString`, ~:98–116): per-surface `commands.test_json` → `commands.test` → top-level `commands.test`. Build/lint mirror this against `commands.build` / `commands.lint`.
- **`deriveCounts`** (`capture-runner.ts:385–389`, parsers ~:443–603) is runner-specific (vitest/jest/pytest/go/cargo/rspec/junit/dotnet) and **abstains (returns null) on unknown** — load-bearing "never guess a count." Build/lint output usually abstains; correct.
- **Capture/return path** (`commands/test.ts`): `runCapture` tees raw bytes to `.ana/plans/active/<slug>/.captures/test-<stage>-<epoch>.log`; the marker is printed to stdout via `printOutcome` (~:316–352); the agent pastes the marker into `build_report.md`, where the inliner expands it into the sealed block at save time. **Spec B targets `printOutcome` / the return; the `.log` and the sealed block are untouched.**
- **Return on FAILURE today:** on a test *failure* (tests ran, failed), the marker is still printed/sealed and the agent must re-read the `.log` for the failures. **This is exactly what B compacts.** (On a capture *error* — spawn/timeout/maxbuffer — exit 3, no marker; out of B's scope.)
- **The seal** is the capture block inside `build_report.md` only: sha256 over captured bytes, length-addressed, validated by three preservation validators (`capture-marker.ts`). Anything outside the begin/end delimiters is unsealed.

### Constraints Discovered
- [TYPE-VERIFIED] **`commands.build` / `commands.lint` exist** — top-level `commands` is `z.record(z.string(), z.unknown())` (`anaJsonSchema.ts:73`), populated at init with `build/test/lint/dev` (`state.ts:463–468`). Per-surface commands are typed `build/test/lint/dev/test_json` (`anaJsonSchema.ts:40–54`). **No `build_json`/`lint_json` exist — do not invent them.** (Resolves OQ-C5.)
- [TYPE-VERIFIED] **Plan is authoring-only** — across `.claude` + `.codex`, ana-plan *writes* checkpoint command strings into the Build Brief (`ana-plan.md` ~:412–425) but never executes them. ana-build + ana-verify are the only agents that run test/build/lint. **The rollup spans Build + Verify.** (Resolves OQ-C3.)
- [TYPE-VERIFIED] **Phases share one `.ana/state/`** — `.ana/state/` lives inside the worktree checkout (`worktree.ts:223`), and Verify **reuses Build's worktree** rather than creating a new one (`work.ts:1481–1496`). A `savings.jsonl` appended during Build is visible/appendable during Verify. **The pipeline rollup is free.** `state/` is gitignored (`assets.ts:96`). (Resolves OQ-C2.)
- [TYPE-VERIFIED] **The proof entry has no entry-level seal** — `hashes` is a `Record<string,string>` of per-artifact file hashes (`proofSummary.ts:898–902`); no code computes a hash over the entry itself. An optional `metrics` field is provably outside any integrity hash. (Resolves OQ-C1 → option b.)
- [OBSERVED] **Config-flag pattern (C4 analog).** `mergeStrategy` is a `z.enum` (`anaJsonSchema.ts:99–102`), written in `createAnaJson` (`state.ts` return ~:560–571), preserved in `preserveUserState` (`state.ts:696`). Scope 1 adds `captureGate` here following exactly this path; `captureMetrics` is the sibling, `off`-by-default.
- [OBSERVED] **Scope 1 is `retire-capture-self-arming`**, on `main` (`.ana/plans/active/retire-capture-self-arming/scope.md`), in final revision and headed to Plan. Its AC4/AC5 establish the init-writes / re-init-preserves / absent=off convention this scope's C4 mirrors.

### Test Infrastructure
- Capture corpus: the existing 8-stack no-false-green corpus is the shape to mirror for **Spec B's failing-output fixtures** (deterministic, per-stack). Plan defines the failing corpus.
- New coverage: `ana build`/`ana lint` resolution + capture (A); the failure-extraction util with per-stack fixtures + the no-recognizable-failures fallback (B); the recorder writing rows, the flag-off no-write path, the shared-sidecar accumulation, the durable rollup, and the absent-when-off entry shape (C).

## For AnaPlan

### Structural Analog
- **Spec A:** `packages/cli/src/commands/test.ts` — `ana build`/`ana lint` are near-symmetric siblings. Follow it for command registration, `--surface`/`--slug` handling, command-key resolution, and the `runCapture` call — minus all seal/gate code (build/lint are Layer A).
- **Spec C config (C4):** `mergeStrategy` end-to-end (`anaJsonSchema.ts` enum → `createAnaJson` write → `preserveUserState`). The **functional analog is Scope 1's `captureGate`** — build the sibling flag the same way, inverse default (`off`).
- **Spec C metrics field:** the existing optional entry fields (`worktree`, `commit_hygiene` on `ProofChainEntry`, `types/proof.ts`) — optional, absent when not applicable, rendered by the viewer when present.

### Relevant Code Paths
- `packages/cli/src/utils/capture-runner.ts:242–271` (`resolveCommand`), `:385–603` (`deriveCounts`) — reuse, do not re-author.
- `packages/cli/src/commands/test.ts:~98–116` (key resolution), `:~316–352` (`printOutcome` — Spec B's target).
- `packages/cli/src/index.ts` — command registration.
- `packages/cli/templates/.claude/agents/ana-build.md`, `ana-verify.md`; `packages/cli/templates/.codex/agents/ana-build.md`, `ana-verify.md` — Spec A template edits.
- `packages/cli/src/commands/work.ts` (`work complete` flow), `work-proof.ts:~150` (entry write) — Spec C rollup + metrics field.
- `packages/cli/src/types/proof.ts` (`ProofChainEntry`), `src/utils/proofSummary.ts:~56` (`ProofSummary`) — the metrics field.
- `packages/cli/src/commands/init/anaJsonSchema.ts:~99`, `state.ts` (`createAnaJson` ~:560, `preserveUserState` :696) — C4 (blocked on Scope 1).
- `website/app/docs/proof/[slug]/page.tsx` — viewer rendering.

### Patterns to Follow
- Capture reuse: parameterize by command key + stage; never re-implement the spine.
- Config flag: mirror `mergeStrategy` / Scope 1's `captureGate` (typed enum, init-write, re-init-preserve, absent=off) — not a hand-rolled record key.
- Optional entry field: additive, omitted entirely when not applicable (matches `worktree`/`commit_hygiene`), so flag-off proofs stay byte-identical.
- Deterministic extraction: pattern tables + cap + head/tail; per-stack fixtures like the capture corpus.

### Known Gotchas
- **Do not Build C4 until `retire-capture-self-arming` is on `main`** — same three functions; rework + conflict otherwise. Specs A and B have no such gate.
- B must not alter the `.log` or the sealed inline block — only the agent-facing return.
- The metrics field must be **absent** (not null/empty) when the flag is off.
- The rollup reader must run before the worktree is pruned at `work complete`.
- `deriveCounts` returns null for build/lint — handle cleanly in the recorder and rollup.
- Declare `captureMetrics` explicitly in the schema (`.passthrough()` would silently tolerate it).
- `returned_*` records the post-B representation, not the raw capture.

### Things to Investigate
- OQ-B1: finalize N, context window, per-runner failure patterns, and the failing-output fixture corpus (design judgment + a real corpus).
- OQ-C6: whether to fold a one-line metrics/gate readout into `ana work status` (coordinate with Scope 1's readout).
- Sidecar row schema-versioning (`v` field) for durable-rollup forward-compat.
- The exact `metrics` field shape on the entry (what to sum vs. store raw) — keep it atoms-summed, derive ratios at read.
