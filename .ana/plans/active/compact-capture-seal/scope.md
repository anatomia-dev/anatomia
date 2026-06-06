# Scope: Compact the capture seal + fix the count

**Created by:** Ana
**Date:** 2026-06-06

## Intent

The capture gate seals test evidence into the build/verify report. Today that seal **inlines the entire raw test output** (the `retire-capture-self-arming` build report carried ~3,100 lines / 246 KB), and the sealed **count abstains on our own repo** because counts are regex-scraped from human-formatted output that our turbo-wrapped root runner doesn't match. A third defect shares the same root: the marker parser matches `<!-- ana:capture … -->` even inside prose, so a report that *describes* a marker corrupts parsing.

Replace the inlined seal with a **compact, one-line sealed result** and source the count from a **machine-readable reporter**. Fold the prose-collision parser fix in — we're reworking the marker format anyway, so the old parser is replaced, not patched.

This is Step 3 of the capture-seal cleanup handoff. Steps 1 (remove brittle A028 test) and 2 (refuse `--stage build`+passthrough) already landed (PR #281).

## Complexity Assessment

- **Kind:** feature
- **Size:** large
- **Surface:** cli
  - *(Also touches the 4 agent templates that document the seal — a product change that ships to all customers, not a website change.)*
- **Files affected:**
  - `packages/cli/src/utils/capture-marker.ts` — format/parse/inliner/validators (significant deletion)
  - `packages/cli/src/utils/capture-runner.ts` — new JSON-reporter count parser (analog: existing `parseGo`)
  - `packages/cli/src/commands/test.ts` — count source + compact seal emit
  - `packages/cli/src/commands/artifact.ts` — capture gate + inline call site
  - `packages/cli/src/commands/init/anaJsonSchema.ts` + count-source config
  - `.ana/.gitignore` and the template `.gitignore` generator — add a `.captures/` rule
  - `packages/cli/templates/.claude/agents/ana-build.md`, `ana-verify.md` + the `.codex/` pair — update the seal description (currently says "expands into a verbatim, sha-sealed block")
- **Blast radius:** The seal is a contract between `ana test` (emit), `artifact save` (gate), the agent templates (instruction), and the build/verify reports (consumer). Changing the seal shape touches all four. The three validators (`validateCapturePresent`, `validateCaptureInlined`, `validateCaptureNotTruncated`) assume an inlined block and largely collapse once nothing is inlined.
- **Estimated effort:** 2–3 days. Most of the cost is design (what the seal attests, the L3-ready shape) and careful deletion, not new code — but the upper end applies if the count source expands to **auto-deriving** a JSON reporter (per-runner flag logic + tests) rather than only reading opt-in `test_json`. The 1–2 day version assumes opt-in.
- **Multi-phase:** no — one cohesive scope. The two halves (compaction + count source) must ship together: a compact seal that still reads `abstain` is still confusing. Plan may sequence internally.

## Approach

Separate the **evidence** from the **attestation**. Today they're fused: the committed raw bytes *are* the evidence, verified byte-for-byte against a hash, and the count is regex-scraped from those same bytes. That fusion is the disease — it forces the dump and ties the count to human output.

Split them:
- **Evidence** — the full output is captured to a `.captures/*.log` during the run, used to compute the hash and (with a JSON reporter) the count, then **not inlined and not committed**. A `.captures/` gitignore rule is belt-and-suspenders so a missed cleanup never commits raw output.
- **Attestation** — a compact, single-line sealed marker carrying `counts + verdict + sha256 + byte/line totals`. One line, not a dump.
- **Count source** — a machine-readable reporter (the `test_json` variant already in the schema), parsed mechanically, instead of regex over human output. This is what fixes the `abstain` on our own runs. Follow the shape of `parseGo`, which already consumes a JSON event stream.
- **Parser** — design the new marker as a closed, unambiguous token that does not collide with prose describing it. The old inliner/`locateBlock`/byte-offset machinery and two of three validators go away (this is mostly a red diff — the elegant solution removes).

**Shape the marker so L3 is a fill-in, not a second migration.** L3 (an engine-bound token that makes a seal unforgeable) is the known next change to this same format. Leave room for that field in the marker now. **Do not build the nonce machinery** — just don't force a second format rework when L3 lands.

## Acceptance Criteria

- AC1: A baseline `ana test --stage build` emits a single-line sealed marker containing counts, verdict, a sha256 of the captured output, and byte + line totals — and no inlined raw output.
- AC2: At `artifact save`, a compliant report seals without inlining the raw output; the build/verify report no longer contains a verbatim test-output block.
- AC3: The count is derived from a machine-readable reporter (`test_json`), not regex over human output. Running the seal on this repo produces a real count, not `abstain`. **State the fix's reach honestly in the contract** — it fixes the abstain *where a JSON reporter is configured or auto-derivable*, NOT a blanket "fixes the abstain." A repo with no JSON reporter still abstains safely (AC4). (The reach hinges on the auto-derive-vs-opt-in decision below — if opt-in, the abstain is fixed only for repos that manually configure `test_json`, possibly almost none.)
- AC4: When no machine-readable reporter is configured/resolvable, the seal abstains safely (fail-open, no fabricated count) — the no-false-green guarantee in `deriveVerdict` is preserved.
- AC5: The marker format is a closed token: a report containing the literal marker text inside prose does not corrupt parsing or falsely satisfy the gate.
- AC6: The full output is written to `.captures/*.log` during the run (for hash + count) and is not committed; a `.captures/` gitignore rule exists in both the dogfood `.ana/.gitignore` and the generated template.
- AC7: The marker parser round-trips a marker **with the reserved L3 token field present AND with it absent** — both parse as valid and both re-serialize unchanged. This mechanically proves the non-breaking-addition property (adding the token later requires no second format migration) **without** implementing the token. **Do NOT let AC7 land as "verified by inspection"** — a counterfactual ("future migration unneeded") is the A014 trap, the exact unbacked-assertion problem this cleanup just refused to ship. The present/absent round-trip is the testable form of that claim.
- AC8: The build + verify agent templates (Claude + Codex) describe the compact seal accurately (no "verbatim, sha-sealed block" language).
- AC9: The seal change is verified against a **concrete** non-vitest runner — `go test -json` via the existing `parseGo` (`capture-runner.ts:492`) is the natural second runner — proving the JSON-count path is not hard-wired to vitest. Proportional to "every change must work for all customers."
- AC10: The new parser tolerates a legacy (old-format) inlined marker without choking or false-gating. Back-compat at runtime is already moot — nothing re-parses completed reports (see Constraints) — so this is cheap defense-in-depth against a future caller, and it is testable: feed the parser an old-format marker block and assert it neither throws nor reports a satisfied seal.

## Edge Cases & Risks

- **Widened final-stage forgeability (named interim risk, consciously accepted until L3).** The incident was *forgery*, not tampering, and the two differ. Today a forged `pass` needs bytes that hash to the claimed sha; once the log is captured-then-cleaned, a forged `pass` is just *writing the numbers*, because nothing re-checks them. Stage independence catches a forged **build** seal (Verify re-runs the tests), but **nothing re-runs after the final Verify seal** — so that one seal gets easier to forge. The inlined seal did not actually resist forgery either (the incident proved it), so the real guarantee was always stage independence + founder review, not seal-forgery-resistance. Compaction does not weaken that guarantee — but it does widen the final-seal forgery surface, and that is **accepted on purpose until L3 (engine-bound token) closes it.** This is recorded so the acceptance is conscious, not papered over.
- **Fail-case durable record (deferred to Plan, low-stakes).** A `pass` seal needs no output; a committed `fail` seal with zero output is a thinner durable record. This is *not* a "debugger gets nothing" problem — the live-debugging path is already covered (the log is on disk during the run, and Scope 2 Spec B compacts failures into the agent return). So the only open question is whether the *committed* artifact should retain a bounded fail-excerpt for posterity. Left for Plan as a low-stakes durable-record decision, not a blocker.
- **Reporter availability.** Not every project has a JSON reporter wired. The seal must abstain cleanly, never fabricate. Remedy if it bites is to broaden reporter detection, never to restore a fabrication-prone regex fallthrough (see proof finding `captured-test-evidence-C3`).
- **Idempotent re-save.** Today re-inlining is idempotent and survives a cleaned `.log`. The compact seal must also be stable across re-save and fresh checkout — but it's simpler, since there's no block to reconcile.
- **The `.captures/*.log` must be cleaned after the count + hash are computed**, or the gitignore rule is the only thing standing between raw output and the repo. Both belong in this scope.

## Rejected Approaches

- **B — Compact seal + honest head/tail excerpt** (the proof chain's tracked over-ceiling fast-follow: full sha + an excerpt with its own `excerpt_sha256`). Keeps a human trail but is bigger. Rejected as the default: the handoff's guiding principle is "when in doubt, the smaller version is the right one," and the live-debugging path is already covered elsewhere. The excerpt idea may still inform Plan's fail-case decision.
- **C — Compact on pass, excerpt on fail.** A reasonable middle path for the fail-case specifically. Not adopted wholesale, but handed to Plan as the alternative for the fail-case open item.
- **Patching the old prose-collision parser as a separate fix.** Rejected per the handoff — this scope reworks the marker format anyway, so the parser is replaced, not patched. A separate patch would be throwaway scaffolding.

## Open Questions

- **Count source — auto-derive vs opt-in (the real, consequential fork).** *Decided already, not open:* the engine must read **top-level** `commands.test_json` (today `resolveTestCommandString` reads `test_json` only under surfaces). Requiring a surface would force every customer to reconfigure, violating the top-level-abstain constraint and AC9 — so top-level reading is in scope, full stop. **The genuine open question is whether the JSON reporter is auto-derived or stays opt-in.** If `test_json` stays opt-in, the abstain is fixed only for repos that manually configure it — possibly almost none, including us until we set it. Auto-deriving (e.g. appending a JSON reporter flag for known runners) fixes the abstain for everyone but is more code and more per-runner risk. Plan must decide this deliberately, and AC3's stated reach must match the decision.
- **Fail-case durable record:** should the committed artifact retain a bounded fail-excerpt (approach C), or stay fully compact even on failure (A)? Plan decides; live-debugging is already covered, so this is durable-record taste, not capability.
- **Validator collapse:** what exactly do `validateCaptureInlined` / `validateCaptureNotTruncated` become when nothing is inlined — deleted, or transformed into "the seal is well-formed and references a real run"? Lean toward deletion.

**Resolved during scoping (recorded, not open):**
- **Marker-format back-compat — confirmed safe.** The marker parser / inliner / validators / gate are called *only* from `artifact.ts` at save time, on the report being saved (the active slug). Completed reports are never re-parsed: `work-proof.ts:124` only `existsSync`-checks a completed verify report (never reads its content), neither `work-proof.ts` nor `proofSummary.ts` imports the marker parser, and the website's Proof Explorer reads `proof_chain.json`, not report markers. Old-format markers sitting in `plans/completed/*` reports are therefore inert. AC10 adds parser tolerance anyway as defense-in-depth against a future caller.

## Exploration Findings

### Patterns Discovered
- `capture-marker.ts:97-147` — `formatMarker` / `parseMarkerText`: the current single-line marker format and its key/value parse. The compact seal reshapes this.
- `capture-marker.ts:66-67` — `MARKER_REGEX = /<!--\s*ana:capture\s+[^\n>]*?-->/`. This is the prose-collision surface: it matches any line containing the marker shape, including prose describing one.
- `capture-marker.ts:207-318` — `locateBlock` / `renderBlock` / `inlineCaptures`: the length-addressed byte-offset inliner. Most of this is removed under approach A.
- `capture-runner.ts:492+` — `parseGo`: already parses a `go test -json` event stream into `TestCounts`. **Structural analog** for the new vitest-JSON count parser.
- `capture-runner.ts:385-417` — `deriveCounts` (hint-only; returns null when no hint) and `deriveVerdict` (no-false-green). The count source changes; the no-false-green discipline must be preserved exactly.
- `test.ts:98-116` — `resolveTestCommandString`: already prefers `test_json` over `test` **for surfaces only**. Top-level `test_json` is the missing piece for our own repo.

### Constraints Discovered
- [TYPE-VERIFIED] `CaptureStage = 'build' | 'verify'` (`capture-marker.ts:31`) — both stages seal in baseline form.
- [OBSERVED] No `.captures/` gitignore rule exists in `.ana/.gitignore` or the template — a left-behind `.log` could currently be committed.
- [OBSERVED] The capture-flow instruction lives in `packages/cli/templates/.claude/agents/ana-build.md:109-111` and `ana-verify.md` (+ the `.codex/` pair). It is correct (baseline vs checkpoint forms) but describes the *old* inlined-block expansion at line 110 — must be updated.
- [INFERRED] `anaJsonSchema.ts:48` already has `test_json: z.string().nullable()` at the surface level; extending to top-level is a small schema + resolver change.
- [VERIFIED] Marker-format back-compat is safe by call-graph: the parser/inliner/validators/gate are invoked only from `artifact.ts` at save time on the active slug's report. `work-proof.ts:124` only `existsSync`-checks a completed verify report; neither it nor `proofSummary.ts` imports the marker parser; the website reads `proof_chain.json`, not markers. Old markers in `plans/completed/*` are never re-parsed.

### Test Infrastructure
- `packages/cli/tests/commands/test-command.test.ts` — `executeCapture` baseline/checkpoint tests, with a `mkProject` helper that writes an `ana.json` and a fake runner script. The seal-shape and count-source tests extend this.
- `packages/cli/tests/utils/` — `capture-marker` and `capture-runner` unit tests (the parser/validator/format coverage). The format change is tested here.

## For AnaPlan

### Structural Analog
`capture-runner.ts` `parseGo` (~line 492) — a JSON-stream-to-`TestCounts` parser. The new machine-readable (vitest-JSON) count parser follows its exact shape: detect the JSON shape, count actions, return `TestCounts | null`. This is the closest structural match for the count-source half.

For the seal-format half, the analog is the **existing marker system itself** (`formatMarker`/`parseMarkerText` in `capture-marker.ts`) — it is the thing being reshaped, so its format/parse/validate triplet is the template for the compact version.

### Relevant Code Paths
- `packages/cli/src/utils/capture-marker.ts` — format, parse, inliner, validators, gate.
- `packages/cli/src/utils/capture-runner.ts` — `deriveCounts`, `deriveVerdict`, per-runner parsers.
- `packages/cli/src/commands/test.ts` — `executeCapture`, `resolveTestCommandString`, `inferRunner`, seal emit.
- `packages/cli/src/commands/artifact.ts:784-841` — inline call site + `evaluateCaptureGate` + gate enablement.
- `packages/cli/src/commands/init/anaJsonSchema.ts:48` — `test_json` schema.

### Patterns to Follow
- Pure functions, no chalk/commander/process.exit in `capture-marker.ts` and `capture-runner.ts` (existing module discipline — keep it).
- No-false-green in `deriveVerdict` — a `pass` requires positive evidence; preserve exactly.
- Mostly-red diff — delete the inliner and the inlined-block validators rather than adapting them.

### Known Gotchas
- The marker regex must not match prose describing a marker (AC5). The old design leaked because the token wasn't closed.
- Top-level `test_json` is **not** read today (surface-only). Fixing our own abstain requires the top-level path.
- `deriveCounts` is hint-only now; do not reintroduce the regex fallthrough (proof finding C3) when adding the JSON path.
- The four agent templates (build + verify × Claude + Codex) are a product change — they ship to all customers. Update all four; do not edit only the dogfood `.claude/` copies.

### Things to Investigate
- **Count source: auto-derive vs opt-in** — the highest-priority decision (see Open Questions). It sets AC3's honest reach: opt-in fixes the abstain only for repos that configure `test_json` (maybe almost none); auto-derive (append a JSON-reporter flag for known runners) fixes it broadly at the cost of per-runner logic + tests. Decide before estimating — it's the difference between the 1–2 and 2–3 day estimate.
- Fail-case durable record (A vs C) — design judgment, see Open Questions.
- Exact validator collapse — design judgment (lean deletion).

## Sequencing Guardrail

`context-compression-savings` (Scope 2, currently parked with 4 specs written) **must land after this scope** — it measures the very capture this scope changes. Do not build Scope 2 Phase 1 until this merges. Scope 2 Spec B (compacting failures into the agent return) is also the reason the fail-case durable-record question is low-stakes.
