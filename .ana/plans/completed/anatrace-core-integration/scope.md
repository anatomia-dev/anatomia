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
  - `packages/cli/package.json` — add `anatrace-core` dependency (pinned exact to `0.2.0`)
  - `packages/cli/src/utils/forensics.ts` — replace derive internals; becomes capture-orchestration around core (reads bytes → `NamedBlob`, calls core)
  - `packages/cli/src/commands/artifact.ts` — **(added per review)** the two save-site callers of `captureProvenanceAtSave` (`:1246`, `:1668`, import `:30`) and provenance staging/commit; the new compliance producer fires here too
  - `packages/cli/src/types/proof.ts` — migrate `ProvenanceCounts` (core adds `derive_version`, key order shifts); add `ComplianceAttestation` type (net-new)
  - `packages/cli/src/data/pricing.ts` — replace local table with core source (see Approach / pricing decision)
  - `packages/cli/src/commands/work-proof.ts` — feed core-derived provenance; add net-new compliance assembly/read
  - `packages/cli/src/commands/proof.ts` — render net-new behavioral-attestation section; **update the two `computeCost` call sites (`:292`, `:464`) to core's 3-arg signature**
  - `packages/cli/src/commands/run.ts` — extend `buildCaptureEnv` (`:125-157`) launch env for capture-coverage metadata
  - `packages/cli/src/commands/_capture.ts` — likely unchanged (capture plumbing stays Anatomia-owned), pending the adapter-input decision not forcing session markers (it does not — see Constraints)
  - New: compliance producer module (likely under `src/utils/` or `src/commands/`)
  - Tests: `tests/utils/forensics.test.ts`, `tests/utils/forensics-derive.test.ts` (incl. **Codex fixture rewrite with a real `apply_patch` body**), `tests/data/pricing.test.ts`, `tests/commands/work-proof-process.test.ts`, `tests/commands/_capture.test.ts` (network-freedom scan — make transitive), `tests/commands/artifact-provenance.test.ts`, plus new compliance producer/display/soundness/scrub tests
- **Blast radius:** The proof chain. Every completed pipeline run writes a `ProcessAttestation`; provenance records are committed and read cross-machine. Existing `proof_chain.json` entries and committed `provenance/*.json` predate core fields — all readers must tolerate old shapes (verified safe: untyped parse + name-access at `work-proof.ts:132-143`, `proof.ts:289-301` guard `s.derived`). `ProvenanceCounts` has only 3 importers (forensics.ts defines, types/proof.ts re-exports via `SessionProvenance.derived`, the derive test); *adding* fields is non-breaking, only *renaming* existing ones ripples into `proof.ts`'s stat grid (`:460-475`). The 5 existing forensics/provenance/pricing test files (~1,500 lines) lock the current derive's exact numbers; the derive tests need invariant-rewrite, the assembly tests are type-shape-only (they build their own `SessionProvenance` via `prov()`). New risk surface: the save-time path must stay **total** (any core throw degrades to absent record — see AC13) and committed verdict evidence must be **scrubbed** (see AC15).
- **Estimated effort:** Phase 1 ~2-3 days (mechanical swap + invariant test rewrite + Codex fixture). Phase 2 ~4-6 days. The adapter input contract is **resolved** (see Constraints), so Phase 2's residual unknown is coverage-context/soundness design, not adapter wiring — re-estimate at plan time. Multi-phase; sequence below.
- **Multi-phase:** yes

## Approach

Anatomia already built the right outer shell — launcher, capture hook, pending-pointer lifecycle, provenance-file lifecycle, proof-chain persistence and display. The integration replaces the *inner transcript mechanics* and adds deterministic behavioral verdicts at the existing seams. It is a cleanup followed by an expansion, not a bolt-on.

**Phase 1 — Provenance swap.** Add `anatrace-core` as a pinned dependency. In `forensics.ts`, the derive path (currently `deriveClaude` ~L416, `deriveCodex` ~L512, the JSONL reader, and the regex test-counters) is replaced by `parseSession(blobs, ...)` → `deriveCounts(session)`. Keep the pointer resolution, transcript-path resolution, and provenance-file writing — that lifecycle (`captureProvenanceAtSave`, ~L668) is correct. Migrate the `ProvenanceCounts` type to the core type, keeping older committed records readable (core adds a `derive_version` field and shifts key order — additive for readers, but new records serialize different bytes; re-baseline accounts for both). Record `transcript_hash` and `derive_version` on each provenance record so recomputability is stated honestly (hashes prove byte identity; they do not replace retained bytes — do not over-claim recompute). Adopt core pricing (`PRICES` / `computeCost` / `PRICE_TABLE_VERSION`) so Anatomia, anatrace, and crack3d share one cost source. **This is a caller migration, not a thin re-export:** core's `computeCost(tokens, model, {priceTable})` differs from our 2-arg signature, so the two call sites in `proof.ts` (`:292`, `:464`) and the `forensics.ts` version-stamp must be updated to thread `{priceTable: PRICES}`. Note the tables are byte-identical at 0.2.0 (same version `2026-06-08`, same rows), so adoption changes **no** displayed cost today — the value is one source going forward. (Developer recommended path; veto in review to keep local table.) Separately, `proof.ts:299` reads each record's stamped `price_table_version` while `:292/:464` recompute cost from the *current* table — Plan must decide whether display honors the stamped version or re-prices, and the displayed version must match the table actually used.

**Phase 2 — Behavioral attestation.** All of this is **net-new** — no compliance type, producer, reader, or display exists today (verified by grep; the research doc's claim that `assembleComplianceAttestation`/`compliance/*.json` already exist is false). At artifact-save, while the transcript is still available, build an anatrace mandate from our `contract.yaml` + relevant agent definitions via `anatomiaAdapter`, run `runCompliance(mandate, session, resolver, ...)`, and write **one compact compliance record per transcript** (never per-role — multiple Build/rework attempts must not collapse). New `ComplianceAttestation` type holds per-transcript verdicts (`claimId`, `status`, `reason`, scrubbed evidence), the mandate/transcript hashes, the `anatrace_core_version`, and a coverage summary. Capture coverage is **root-lane only** in this phase: root role/session marked captured; delegate-inclusive negative claims stay `unverifiable`. The core enforces this, but the soundness depends on the `MandateEvaluationContext` *Anatomia constructs* — if we mark coverage complete when only the root lane was captured, the core will faithfully emit a false `satisfied`. So soundness is an Anatomia-owned, fail-closed obligation (AC8/AC14), not something we inherit for free. `ana proof` renders a behavioral-attestation section: per-transcript satisfied/violated/unverifiable counts, mandate + transcript hash, a coverage line, loud warnings on incomplete records, compact (scrubbed) detail for violations and unverifiables. Verdicts are evidence — they never gate PASS/FAIL, mirroring the existing `ProcessAttestation` discipline.

Naming: call the new section "behavioral attestation" / "session attestation," distinct from Verify's contract-compliance table (which stays — it verifies outcome/runtime assertions, not transcript behavior).

## Acceptance Criteria

- AC1: `anatrace-core@0.2.0` (or compatible) is a pinned `packages/cli` dependency; the CLI builds and the published package resolves (no local link).
- AC2: `forensics.ts` no longer contains hand-rolled Claude/Codex transcript parsing or regex count derivation; counts come from `anatrace-core` `parseSession` + `deriveCounts`.
- AC3: Provenance records carry `transcript_hash` and `derive_version`/core-version metadata; missing/unreadable transcripts still produce absent derived provenance (no guessed values), preserving current behavior.
- AC4: Existing committed `proof_chain.json` entries and `provenance/*.json` records that lack core fields still read without error (backward compatibility verified by test).
- AC5: Provenance derive works for **both** Claude and Codex harnesses. Codex `files_touched` is derived (no longer hardcoded 0) — demonstrated by a **rewritten Codex fixture carrying a real `apply_patch` body** and a positive `files_touched > 0` Codex assertion (the current fixture's bodyless `apply_patch` cannot demonstrate this). A committed Codex rollout fixture exercises the capture/save path, not just inline derive.
- AC6: Cost is computed via the chosen source (core pricing if adopted) with `{priceTable}` threaded to all call sites (`proof.ts:292,464`, `forensics.ts` stamp); `price_table_version` recorded; unknown model → `priced: false`, never guessed. The `price_table_version` displayed matches the table actually used (no stamped-vs-computed mismatch).
- AC7: A compliance producer writes **one record per transcript** at save time, keyed by role + session_id (no role collapse), including verdicts, mandate/transcript hashes, core version, and coverage. (Net-new producer, type, AND reader — not a migration of an existing seam.)
- AC8: Behavioral verdicts are coverage-aware and honest: an unobservable channel yields `unverifiable` (with reason), never a false `satisfied`. The verdict reason string varies by subject/context (`channel-coverage-incomplete` for a root-subject claim with an unknown channel; `delegate-coverage-incomplete` / `subject-unresolvable` for delegate-inclusive claims) — display and tests must not hard-code one reason.
- AC9: `ana proof` renders the behavioral-attestation section (per-transcript counts, hashes, coverage line, loud warning on incomplete records, compact violation/unverifiable detail) in the existing proof UI — no separate report surface.
- AC10: Behavioral verdicts never gate pipeline PASS/FAIL; they are recorded as evidence.
- AC11: Delegate-inclusive negative claims remain `unverifiable` (no launcher manifest in this phase) — sidecar discovery is not treated as complete coverage.
- AC12: Test count does not decrease. The regression net's **invariants are preserved as assertions** — determinism (same bytes → identical output), no raw transcript body escapes into any committed record (provenance *and* compliance evidence), Codex `files_touched > 0` where a patch exists. Any exact-count change is justified in the build report, never a silent snapshot regeneration.
- AC13: **Totality preserved.** All anatrace-core calls at capture/save time (`parseSession`, `deriveCounts`, `runCompliance`, adapter) are wrapped so any throw/hang degrades to an absent provenance/compliance record — `ana artifact save` and the live agent session are never broken. Tested with a malformed/adversarial transcript: the save completes and the record is omitted, not errored. (Preserves the existing `forensics.ts:721-723` try/catch discipline around the new dependency.)
- AC14: **Soundness is fail-closed and Anatomia-owned.** An Anatomia-owned test constructs a root-only coverage context and asserts every delegate-inclusive negative claim resolves to `unverifiable`, and that a channel absent from the captured root transcript never resolves to `satisfied`. The test fails closed if Anatomia's `MandateEvaluationContext`/`captureCoverage` construction over-states coverage. (This lives in Anatomia's suite — soundness is not delegated to the dependency's good behavior.)
- AC15: **Evidence is scrubbed.** Verdict/evidence committed to proof is scrubbed of secrets (via core `scrubText`/`scrubFinding`/`scrubDeep` or equivalent). A test asserts a transcript containing a token-bearing command (e.g. a `curl` with a credential) does not write that token into the committed compliance record. (Egress violation evidence is the most likely secret carrier.)
- AC16: **Runtime assertions are never faked.** Only behavioral-eligible claims are mapped into the mandate; runtime/outcome `contract.yaml` assertions either stay Verify-owned or surface as `unverifiable`, never transcript-`satisfied`. A test feeds a `contract.yaml` with a runtime assertion and asserts it does not appear as a `satisfied` behavioral verdict. (Core already emits these as `contract-matcher`/`scope:runtime` → unverifiable — verified — so this locks the boundary.)
- AC17: **Retention honesty.** No provenance field or `ana proof` rendering claims provenance can be regenerated without retained bytes; `transcript_hash`/`derive_version` are presented as byte-identity attestation only. Cross-version counts are not silently reconciled (entries are comparable only within the same `derive_version`/`price_table_version`).

## Edge Cases & Risks

- **Coverage-context soundness (the real Phase 2 hard problem).** The `anatomiaAdapter` input contract is resolved (see Constraints), but constructing a *correct* `MandateEvaluationContext` — `thisAgent`, `roleBindings`, and especially `captureCoverage` — is the genuine design risk. Over-stating coverage produces a true false-positive the core cannot catch. Must fail closed (AC14).
- **Save path becomes failure-capable.** Today derive is best-effort and wrapped; the new producer adds `runCompliance` + adapter at save time. A malformed transcript or adapter exception must not escape `captureProvenanceAtSave` and break `ana artifact save` for every customer (AC13).
- **Secret leakage into committed proof.** Verdict evidence (esp. egress command lines) can carry tokens/credentials; committed to the artifact branch it persists in git history. Must be scrubbed (AC15).
- **Network-freedom guarantee goes transitive.** `_capture.test.ts:197` enforces no-network by scanning the *source text* of three files — it does not scan the new `anatrace-core` dependency. The guarantee must become transitive (lock/verify the dep tree; core's only runtime dep is `yaml`, verified).
- **Schema migration.** Old proof/provenance records lack core fields. Readers must degrade, not throw (verified safe today). The new `ComplianceAttestation` must not break entries written before it existed.
- **Role collapse.** A naive per-role compliance shape collapses multiple Build/rework attempts. The producer must store one row per transcript, keyed by role+session_id.
- **Transcript retention honesty.** Committed proof stores derived facts + hashes, not transcript bytes. Do not claim the proof chain can recompute provenance without the bytes (AC17).
- **Runtime assertions are not transcript behavior.** A runtime `contract.yaml` assertion must not be faked as `satisfied` by transcript scanning (AC16). Core already routes these to `contract-matcher`/`scope:runtime` → unverifiable (verified).
- **Both-harness constraint.** Every change must work for Claude and Codex and ship to all customers. Phase 1 derive validated on Claude; Codex needs a committed rollout fixture (AC5). Phase 2 (`anatomiaAdapter`/`runCompliance`) validated on Claude only — Phase 2 must add Codex acceptance or explicitly flag Codex as untested (no silent parity claim).
- **Count drift on re-baseline.** `deriveCounts` will not match our regex derive exactly (token dedup, turn counting, Codex `apply_patch`). Re-baseline preserves invariants, not literals (AC12).

## Rejected Approaches

- **Shell out to the `anatrace` CLI.** Rejected per research doc: the CLI is the human/CI wrapper (filesystem I/O, YAML, pretty output, SARIF, exit codes). Anatomia is already a CLI with its own proof chain and artifact lifecycle — it needs the pure engine, embedded.
- **Target anatrace-core 0.1.0.** Rejected: 0.1.0 has the verdict engine but lacks the launch-boundary/lineage seam (`coverageFromExpectedLaunchBoundary`, `ExpectedLaunchBoundary`, `extractLineage`, Codex delegate parsing). Building Phase 2 coverage on 0.1.0 is scaffolding we'd rework — 0.2.0 is foundation. (0.2.0 is now published and verified.)
- **Keep local `pricing.ts` as source of truth.** Recommended against (not hard-rejected): a divergent local table drifts from anatrace/crack3d. Adopting core pricing removes the duplication. Developer may veto in review.
- **Build Phase 3 (rollups/egress-policy/Learn) now.** Deferred: it rests entirely on Phase 2 existing, and the delegate-manifest soundness work is the hardest correctness problem. Root-lane coverage first.

## Open Questions

- **Coverage-context construction (the one real design question):** what does Anatomia pass as `MandateEvaluationContext.captureCoverage` / `thisAgent` / `roleBindings` for root-lane v1, and what is the failure mode if that value over-states coverage? Must fail closed (AC14). This — not adapter wiring — is what Plan should spike first.
- Exact durable schema for the per-transcript compliance record (field names, keying by role+session_id) — must tolerate absence in old entries.
- Display/pricing decision: does `ana proof` honor each record's stamped `price_table_version`, or re-price against the current table? (Today it does both inconsistently — `proof.ts:299` vs `:292/:464`.)

*Resolved during scoping (no longer open):* The `anatomiaAdapter.extract` input contract — it consumes a `NamedBlob[]` of agent-def markdown (filename `agents/*.md` or `ana*.md`) + a `contract.yaml`/`.yml` blob, keyed by filename; it is pure and never reads the transcript (the transcript goes to `runCompliance` as the `session`). Verified live: feeding our real `ana-verify.md` + a contract yielded 7 claims (skill-invoked, verify-independence, forbidden git commands, file-scope, runtime contract-matcher). Anatomia must assemble those blobs from disk at save time.

## Exploration Findings

### Patterns Discovered
- `forensics.ts` derive seams: `deriveClaude` (~L416), `deriveCodex` (~L512), transcript JSONL reader (~L323-344), `resolveTranscriptPath` (~L615-642), `captureProvenanceAtSave` (~L668-724). The lifecycle is correct; only the derive internals change.
- `_capture.ts` SessionStart hook writes a transient `PendingPointer` to `~/.ana/forensics/pending/{run_id}.json`; totality (exit 0 always). Keep as-is.
- `run.ts` `buildCaptureEnv` (~L125-157) injects `ANA_HARNESS`, `ANA_ROLE`, `ANA_SLUG`, `ANA_CLI_VERSION`, `ANA_AGENT_DEF_HASH`, `ANA_RUN_ID`. This is where trusted launch-boundary/coverage metadata should originate in Phase 2.
- `work-proof.ts` `assembleProcessAttestation` (~L118-183) reads committed `provenance/*.json`; `computeCompleteness` (~L56-90) is a presence floor. No compliance producer or reader exists today.

### Constraints Discovered
- [TYPE-VERIFIED] `anatrace-core@0.2.0` exports (published, smoke-tested live): `parseSession`, `deriveCounts`, `computeCost(tokens, model, {priceTable})`, `PRICES`, `PRICE_TABLE_VERSION`, `DERIVE_VERSION`, `loadPolicyYaml`, `runCompliance(mandate, session, resolver?, config?, repoRoot?, context?) → {verdicts, findings, dossier, hookRequests, verificationCoverage}`, `verdictsForMandate`, `anatomiaAdapter` (`MandateAdapter` with `detect`/`extract`), `claudeAdapter`/`codexAdapter`, `transcriptContentResolver(session)`, `CaptureCoverage`, `MandateEvaluationContext` (`{thisAgent, roleBindings, captureCoverage, lineage}`), `coverageFromExpectedLaunchBoundary`, `ExpectedLaunchBoundary`, `extractLineage`, scrub helpers. Pure core; only runtime dep is `yaml`.
- [TYPE-VERIFIED] `parseSession(group: NamedBlob[], harness?: Harness): NormalizedSession | null` and `deriveCounts(session): ProvenanceCounts` are **synchronous** — so `captureProvenanceAtSave` stays sync and the seam signature is preservable (forensics.ts must read transcript bytes into a `NamedBlob` itself; the file-read responsibility moves up but does not disappear). Scrub helpers `scrubText`/`scrubFinding`/`scrubDeep` exist (verified).
- [TYPE-VERIFIED] `anatomiaAdapter.detect/extract(group: NamedBlob[])` consumes agent-def `.md` (filename `agents/*.md` or `ana*.md`) + `contract.yaml`/`.yml`, keyed by filename; pure, never reads the transcript. Verified live: real `ana-verify.md` + contract → `detect:true`, 7 claims. Contract `assertions` with runtime `says` map to `contract-matcher` (`scope:runtime`) → unverifiable, never faked-satisfied (verified).
- [OBSERVED] Live verdict run on a real Claude transcript (subject `this-agent`): `no-force-push → satisfied (predicate-matched)`, `no-egress → unverifiable (channel-coverage-incomplete)`; coverage reported total/fullyChecked/unverifiable explicitly. Note: the `unverifiable` *reason* is subject/context-dependent — delegate-inclusive subjects yield `delegate-coverage-incomplete`, and a missing context yields `subject-unresolvable`. Do not hard-code one reason string.
- [OBSERVED] `deriveCounts` output is richer than ours: full token breakdown (input/output/cache_create/cache_read), `turns`, `tool_calls`, `commands_run`, `tests_executed`, `failures_encountered`, `files_touched`, `model`, `derive_version` (= `"3"`). Core's `ProvenanceCounts` inserts `derive_version` vs our type (key order shifts; additive for readers).
- [VERIFIED-IN-TREE] `captureProvenanceAtSave` is called at `artifact.ts:1246` and `:1668` (import `:30`) — both save sites and provenance staging are in the blast radius. `proof.ts:292,464` use the local 2-arg `computeCost`; `:299` reads the record's stamped `price_table_version`. `_capture.test.ts:197` enforces no-network by scanning source text of 3 files (non-transitive). Codex test fixture's `apply_patch` (`forensics-derive.test.ts:123`) has no body, and the only `files_touched` assertion (`:188`) is in the Claude block.
- [VERIFIED-IN-TREE] No compliance code exists today: no `ComplianceAttestation` type, no `assembleComplianceAttestation`, no `compliance/*.json` reader, and `proof.ts` renders only a `process`/provenance section. The research doc's claims to the contrary are false; Phase 2 is build-from-scratch.

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
- `anatomiaAdapter.extract` needs agent-def `.md` + `contract.yaml` blobs by filename — feed those, not the transcript (which goes to `runCompliance`/`parseSession`).
- `transcriptContentResolver` takes the `session`, not the raw blobs.
- `computeCost` requires `{ priceTable }` in opts — it does not default; updating to it breaks `proof.ts:292,464` until threaded.
- `parseSession`/`deriveCounts` are sync — keep `captureProvenanceAtSave` sync; forensics still reads bytes into a `NamedBlob`.
- Codex yields real `files_touched` only with a real `apply_patch` body — the existing fixture has none; rewrite it.
- The `unverifiable` reason string is subject/context-dependent — don't assert one literal.
- `_capture.test.ts` network scan is source-text-only; it won't catch the new dependency. Make it transitive.

### Sequencing (multi-phase)
- **Phase 1 (provenance swap):** dependency + derive swap + pricing caller-migration + invariant test rewrite + Codex fixture. Ships standalone.
- **Phase 2a (soundness spike):** design + prove the `MandateEvaluationContext`/`captureCoverage` construction. Exit criteria: AC14 fail-closed soundness test passes on a root-only context; AC16 runtime-assertion test passes. Adapter wiring is already resolved, so this spike is narrow.
- **Phase 2b (producer + display):** `ComplianceAttestation` type, producer (AC7/AC13/AC15), `ana proof` render (AC9), Codex Phase-2 acceptance. Do not estimate 2b until 2a closes.

### Things to Investigate
- Coverage-context construction and its fail-closed failure mode (Phase 2a exit criterion — the one genuine design problem).
- Whether to map all `contract.yaml` assertions into the mandate or only behavioral-eligible ones (runtime assertions must surface `unverifiable`, never satisfied — AC16).
- Display pricing decision: honor stamped `price_table_version` vs re-price (AC6).
