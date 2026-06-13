# Scope: anatrace-core integration (provenance swap + behavioral attestation)

**Created by:** Ana
**Date:** 2026-06-13

## Intent

Replace Anatomia's hand-rolled transcript forensics with the published `anatrace-core` package, then build a behavioral-attestation layer on top of it. In the user's words: "properly use and test anatrace within anatomia... use the real anatrace package, test it, and even expand what we currently do by leveraging anatrace."

Two phases, confirmed with the developer:

- **Phase 1 — Provenance swap.** Stop maintaining our own Claude/Codex transcript parsers. Derive provenance counts from `anatrace-core`.
- **Phase 2 — Behavioral attestation.** Build the capability we don't have at all: deterministic, coverage-aware verdicts about *how the agent session behaved* (did Verify avoid reading the build report, did Build stay in file scope, was there egress), surfaced in `ana proof`.

Out of scope (explicitly deferred to later work): pipeline-level rollups across a work item, egress-as-first-class-policy in templates, full delegate-manifest soundness, and Learn-loop promotion of recurring violations. (These were the user's "Phase 3.")

## Complexity Assessment

- **Kind:** milestone
- **Size:** large
- **Surface:** cli
- **Files affected:**
  - `packages/cli/package.json` — add `anatrace-core` dependency (pinned)
  - `packages/cli/src/utils/forensics.ts` — replace derive internals; becomes capture-orchestration around core
  - `packages/cli/src/types/proof.ts` — migrate `ProvenanceCounts`; add `ComplianceAttestation` type
  - `packages/cli/src/data/pricing.ts` — replace local table with core re-export (see Approach / pricing decision)
  - `packages/cli/src/commands/work-proof.ts` — feed core-derived provenance; add compliance assembly/read
  - `packages/cli/src/commands/proof.ts` — render behavioral attestation section
  - `packages/cli/src/commands/run.ts` — extend launch env for capture coverage metadata
  - `packages/cli/src/commands/_capture.ts` — likely unchanged (capture plumbing stays Anatomia-owned)
  - New: compliance producer module (likely under `src/utils/` or `src/commands/`)
  - Tests: `tests/utils/forensics.test.ts`, `tests/utils/forensics-derive.test.ts`, `tests/data/pricing.test.ts`, `tests/commands/work-proof-process.test.ts`, plus new compliance producer/display tests
- **Blast radius:** The proof chain. Every completed pipeline run writes a `ProcessAttestation`; provenance records are committed and read cross-machine. Existing `proof_chain.json` entries and committed `provenance/*.json` predate core fields — all readers must tolerate old shapes. The 5 existing forensics/provenance/pricing test files (~1,500 lines) lock the current derive's exact numbers; they are the regression net and must be consciously re-baselined.
- **Estimated effort:** Phase 1 ~2-3 days (mechanical swap + test re-baseline). Phase 2 ~4-6 days (new type, producer, adapter wiring, display, coverage). Multi-phase; sequence below.
- **Multi-phase:** yes

## Approach

Anatomia already built the right outer shell — launcher, capture hook, pending-pointer lifecycle, provenance-file lifecycle, proof-chain persistence and display. The integration replaces the *inner transcript mechanics* and adds deterministic behavioral verdicts at the existing seams. It is a cleanup followed by an expansion, not a bolt-on.

**Phase 1 — Provenance swap.** Add `anatrace-core` as a pinned dependency. In `forensics.ts`, the derive path (currently `deriveClaude` ~L416, `deriveCodex` ~L512, the JSONL reader, and the regex test-counters) is replaced by `parseSession(blobs, ...)` → `deriveCounts(session)`. Keep the pointer resolution, transcript-path resolution, and provenance-file writing — that lifecycle (`captureProvenanceAtSave`, ~L668) is correct. Migrate the `ProvenanceCounts` type to the core type, keeping older committed records readable. Record `transcript_hash` and `derive_version` on each provenance record so recomputability is stated honestly (hashes prove byte identity; they do not replace retained bytes — do not over-claim recompute). Adopt core pricing (`PRICES` / `computeCost` / `PRICE_TABLE_VERSION`) so Anatomia, anatrace, and crack3d share one cost source — `pricing.ts` becomes a thin re-export rather than a divergent copy. (Developer recommended path; veto in review to keep local table.)

**Phase 2 — Behavioral attestation.** At artifact-save, while the transcript is still available, build an anatrace mandate from our `contract.yaml` + relevant agent definitions via `anatomiaAdapter`, run `runCompliance(mandate, session, resolver, ...)`, and write **one compact compliance record per transcript** (never per-role — multiple Build/rework attempts must not collapse). New `ComplianceAttestation` type holds per-transcript verdicts (`claimId`, `status`, `reason`, evidence), the mandate/transcript hashes, the `anatrace_core_version`, and a coverage summary. Capture coverage is **root-lane only** in this phase: root role/session marked captured; delegate-inclusive negative claims stay `unverifiable` (the core enforces this — proven live: `no-egress → unverifiable: channel-coverage-incomplete`). `ana proof` renders a behavioral-attestation section: per-transcript satisfied/violated/unverifiable counts, mandate + transcript hash, a coverage line, loud warnings on incomplete records, compact detail for violations and unverifiables. Verdicts are evidence — they never gate PASS/FAIL, mirroring the existing `ProcessAttestation` discipline.

Naming: call the new section "behavioral attestation" / "session attestation," distinct from Verify's contract-compliance table (which stays — it verifies outcome/runtime assertions, not transcript behavior).

## Acceptance Criteria

- AC1: `anatrace-core@0.2.0` (or compatible) is a pinned `packages/cli` dependency; the CLI builds and the published package resolves (no local link).
- AC2: `forensics.ts` no longer contains hand-rolled Claude/Codex transcript parsing or regex count derivation; counts come from `anatrace-core` `parseSession` + `deriveCounts`.
- AC3: Provenance records carry `transcript_hash` and `derive_version`/core-version metadata; missing/unreadable transcripts still produce absent derived provenance (no guessed values), preserving current behavior.
- AC4: Existing committed `proof_chain.json` entries and `provenance/*.json` records that lack core fields still read without error (backward compatibility verified by test).
- AC5: Provenance derive works for **both** Claude and Codex harnesses (Codex `files_touched` is no longer hardcoded to 0).
- AC6: Cost is computed via the chosen source (core pricing if adopted), with `price_table_version` recorded; unknown model → `priced: false`, never a guessed cost.
- AC7: A compliance producer writes **one record per transcript** at save time, keyed by role + session_id (no role collapse), including verdicts, mandate/transcript hashes, core version, and coverage.
- AC8: Behavioral verdicts are coverage-aware and honest: an unobservable channel yields `unverifiable` (with reason), never a false `satisfied`. Verified against a real transcript.
- AC9: `ana proof` renders the behavioral-attestation section (per-transcript counts, hashes, coverage line, loud warning on incomplete records, compact violation/unverifiable detail) in the existing proof UI — no separate report surface.
- AC10: Behavioral verdicts never gate pipeline PASS/FAIL; they are recorded as evidence.
- AC11: Delegate-inclusive negative claims remain `unverifiable` (no launcher manifest in this phase) — sidecar discovery is not treated as complete coverage.
- AC12: Test count does not decrease; re-baselined forensics/provenance tests pass against core-derived numbers; new producer and display tests added.

## Edge Cases & Risks

- **Count drift on re-baseline.** `anatrace-core.deriveCounts` may not produce byte-identical numbers to our regex derive (token dedup strategy, turn counting, Codex now parsing `apply_patch` for files_touched). The 5 existing test files assert exact values; re-baselining must be deliberate, not a blind snapshot update. This is the single biggest Phase 1 risk.
- **`anatomiaAdapter` input wiring (UNKNOWN).** On a raw transcript `anatomiaAdapter.detect()` returned `false` and `extract()` returned `null` — the adapter expects Anatomia-shaped inputs (contract.yaml + agent defs as blobs, or pipeline markers). The exact delivery contract is unresolved and is the key Plan investigation.
- **Schema migration.** Old proof/provenance records lack core fields. Readers must degrade, not throw. The new `ComplianceAttestation` must not break entries written before it existed.
- **Role collapse.** The research doc warns the prior compliance shape (`per_phase: Record<string,...>`) collapses multiple same-role sessions. The producer must store one row per transcript or key by role+session_id.
- **Transcript retention honesty.** Committed proof stores derived facts + hashes, not transcript bytes. Carry hashes and state retention honestly; do not claim the proof chain can recompute provenance without the bytes.
- **Runtime assertions are not transcript behavior.** A runtime `contract.yaml` assertion must not be faked as `satisfied` by transcript scanning — it stays Verify-owned or becomes `unverifiable`.
- **Both-harness constraint.** Every change must work for Claude and Codex and ship to all customers. Core provides `claudeAdapter`/`codexAdapter`; Phase 1 validated on Claude — Codex path needs explicit test coverage.
- **Cost-display change.** Adopting core pricing changes displayed cost math (different table version/rows). Acceptable per developer recommendation; flag in build report.

## Rejected Approaches

- **Shell out to the `anatrace` CLI.** Rejected per research doc: the CLI is the human/CI wrapper (filesystem I/O, YAML, pretty output, SARIF, exit codes). Anatomia is already a CLI with its own proof chain and artifact lifecycle — it needs the pure engine, embedded.
- **Target anatrace-core 0.1.0.** Rejected: 0.1.0 has the verdict engine but lacks the launch-boundary/lineage seam (`coverageFromExpectedLaunchBoundary`, `ExpectedLaunchBoundary`, `extractLineage`, Codex delegate parsing). Building Phase 2 coverage on 0.1.0 is scaffolding we'd rework — 0.2.0 is foundation. (0.2.0 is now published and verified.)
- **Keep local `pricing.ts` as source of truth.** Recommended against (not hard-rejected): a divergent local table drifts from anatrace/crack3d. Adopting core pricing removes the duplication. Developer may veto in review.
- **Build Phase 3 (rollups/egress-policy/Learn) now.** Deferred: it rests entirely on Phase 2 existing, and the delegate-manifest soundness work is the hardest correctness problem. Root-lane coverage first.

## Open Questions

- How does `anatomiaAdapter.extract` expect `contract.yaml` and agent definitions to be delivered — as additional `NamedBlob`s alongside the transcript, via pipeline markers embedded in the session, or another contract? (Adapter returned null on a raw transcript; this needs design judgment, not just a lookup.)
- Exact durable schema for the per-transcript compliance record (field names, keying) — must avoid role collapse and tolerate absence in old entries.
- Re-baseline strategy for the existing forensics/derive/pricing tests: regenerate expected values from core, or assert structural invariants (determinism, no-raw-body-escape) rather than exact counts?

## Exploration Findings

### Patterns Discovered
- `forensics.ts` derive seams: `deriveClaude` (~L416), `deriveCodex` (~L512), transcript JSONL reader (~L323-344), `resolveTranscriptPath` (~L615-642), `captureProvenanceAtSave` (~L668-724). The lifecycle is correct; only the derive internals change.
- `_capture.ts` SessionStart hook writes a transient `PendingPointer` to `~/.ana/forensics/pending/{run_id}.json`; totality (exit 0 always). Keep as-is.
- `run.ts` `buildCaptureEnv` (~L125-157) injects `ANA_HARNESS`, `ANA_ROLE`, `ANA_SLUG`, `ANA_CLI_VERSION`, `ANA_AGENT_DEF_HASH`, `ANA_RUN_ID`. This is where trusted launch-boundary/coverage metadata should originate in Phase 2.
- `work-proof.ts` `assembleProcessAttestation` (~L118-183) reads committed `provenance/*.json`; `computeCompleteness` (~L56-90) is a presence floor. No compliance producer or reader exists today.

### Constraints Discovered
- [TYPE-VERIFIED] `anatrace-core@0.2.0` exports (published, smoke-tested live): `parseSession`, `deriveCounts`, `computeCost(tokens, model, {priceTable})`, `PRICES`, `PRICE_TABLE_VERSION`, `DERIVE_VERSION`, `loadPolicyYaml`, `runCompliance(mandate, session, resolver?, config?, repoRoot?, context?) → {verdicts, findings, dossier, hookRequests, verificationCoverage}`, `verdictsForMandate`, `anatomiaAdapter` (`MandateAdapter` with `detect`/`extract`), `claudeAdapter`/`codexAdapter`, `transcriptContentResolver(session)`, `CaptureCoverage`, `MandateEvaluationContext` (`{thisAgent, roleBindings, captureCoverage, lineage}`), `coverageFromExpectedLaunchBoundary`, `ExpectedLaunchBoundary`, `extractLineage`, scrub helpers. Pure core; only runtime dep is `yaml`.
- [OBSERVED] Live verdict run on a real Claude transcript: `no-force-push → satisfied (predicate-matched)`, `no-egress → unverifiable (channel-coverage-incomplete)`; coverage reported total/fullyChecked/unverifiable explicitly. Honesty discipline confirmed in the engine.
- [OBSERVED] `deriveCounts` output is richer than ours: full token breakdown (input/output/cache_create/cache_read), `turns`, `tool_calls`, `commands_run`, `tests_executed`, `failures_encountered`, `files_touched`, `model`, `derive_version`.
- [OBSERVED] `anatomiaAdapter.detect()` = false / `extract()` = null on a raw (non-pipeline) transcript — needs Anatomia-shaped inputs.
- [INFERRED] `loadPolicyYaml` verb schema: `never_egress`/`never_run`/`never_read` take a non-empty string or list of strings (not boolean) — `never_egress: true` was rejected; `never_egress: ["*"]` accepted.

### Test Infrastructure
- `tests/utils/forensics.test.ts` (~403L) — pointer I/O, capture gate.
- `tests/utils/forensics-derive.test.ts` (~269L) — determinism (AC8), Claude vs Codex derive, token dedup, no raw-body escape (AC12).
- `tests/commands/work-proof-process.test.ts` (~535L) — ProcessAttestation assembly, completeness, session sorting.
- `tests/data/pricing.test.ts` (~90L) — cost determinism, unknown-model handling.
- `tests/commands/_capture.test.ts` (~250L) — totality, stdin timeout, no-network.

## For AnaPlan

### Structural Analog
`packages/cli/src/utils/forensics.ts` itself is the best analog for Phase 1 — the change is *within* its existing derive/save structure, swapping internals while preserving the public seam (`captureProvenanceAtSave`) and the provenance-file lifecycle. For Phase 2, the structural analog for the producer is `assembleProcessAttestation` in `work-proof.ts` (reads committed records, assembles a typed attestation, degrades when capture is off) — the compliance producer mirrors that shape but writes per-transcript records at save time.

### Relevant Code Paths
- `src/utils/forensics.ts` — derive + save seam (Phase 1 core).
- `src/types/proof.ts` — `ProvenanceCounts` (migrate), `ProcessAttestation`, `SessionProvenance`; add `ComplianceAttestation`.
- `src/commands/work-proof.ts` — provenance read/assembly; new compliance read.
- `src/commands/proof.ts` — proof UI rendering (new behavioral-attestation section).
- `src/commands/run.ts` `buildCaptureEnv` — launch-boundary metadata for coverage.
- `src/data/pricing.ts` — pricing source decision.

### Patterns to Follow
- Provenance lifecycle and "omit field when transcript unreadable" honesty already in `forensics.ts`.
- `ProcessAttestation` discipline: typed, never gates PASS/FAIL, degrades cleanly when capture off (`work-proof.ts`).
- Backward-compat reader tolerance already practiced for proof entries.

### Known Gotchas
- `anatomiaAdapter` needs the right inputs (see Open Questions) — do not assume a raw transcript suffices.
- Policy verbs want strings/lists, not booleans.
- `transcriptContentResolver` takes the `session`, not the raw blobs.
- `computeCost` requires `{ priceTable }` in opts — it does not default internally.
- Codex now yields real `files_touched`; old tests asserting 0 will break by design.

### Things to Investigate
- The `anatomiaAdapter.extract` input contract (design judgment).
- Whether to map all of `contract.yaml` into mandate claims or only behavioral-eligible ones (runtime assertions must not be faked as transcript-satisfied).
- Coverage context construction: what `MandateEvaluationContext` (`thisAgent`, `roleBindings`) Anatomia should pass for root-lane v1.
