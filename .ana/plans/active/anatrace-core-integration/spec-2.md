# Spec: Phase 2a — Behavioral-attestation soundness spike

**Created by:** AnaPlan
**Date:** 2026-06-13
**Scope:** .ana/plans/active/anatrace-core-integration/scope.md
**Depends on:** Phase 1 (anatrace-core@0.2.0 is an installed dependency).

## Approach

This phase proves the **one genuine correctness problem** in the whole milestone before any of it touches the save path: constructing a `MandateEvaluationContext` whose `captureCoverage` is *sound* — it must never let core emit a false `satisfied` for a behavior Anatomia did not actually observe. The core engine faithfully evaluates whatever coverage it is handed; if Anatomia hands it over-stated coverage, the core will faithfully produce a false positive the core itself cannot catch. So soundness is **Anatomia-owned and fail-closed** (AC14).

There is **no producer and no display in this phase.** The deliverable is a pure construction module plus an adversarial test suite that is the exit gate. Phase 2b wires the construction into the save path.

**The construction (root-lane v1).** Anatomia's launcher captures only the *root* agent's transcript — never delegate (sub-agent) transcripts. The context must reflect exactly that and nothing more:

1. Build an `ExpectedLaunchBoundary` with `source: 'trusted-launcher'` and a single root lane (`agent: { kind: 'root' }`, `expectedDelegates: []`) — the launcher declares it intended to capture the root lane only.
2. Run `extractLineage(session, blobs)` to project the observed delegation lineage (which lanes' bytes were actually checked).
3. Call `coverageFromExpectedLaunchBoundary(boundary, lineage)` to derive the `CaptureCoverage`. **Never hand-construct a `LaneCaptureCoverage` with `captured: true`** — let core's reconciliation decide. Core's contract is explicit: "Expected launch records alone never prove capture; absent lineage yields uncaptured lanes." Root is marked captured because its bytes were checked; any observed delegate lane is marked uncaptured.
4. Assemble `MandateEvaluationContext = { thisAgent: { kind: 'root' }, captureCoverage, lineage }`.

The consequence, which the tests must confirm empirically: a claim whose `subject` is delegate-inclusive (`delegates: 'include'`) resolves `unverifiable`; a root-subject claim about a channel not observable in the captured root transcript never resolves `satisfied`; a runtime-scoped `contract-matcher` claim resolves `unverifiable` (never `satisfied`).

**This is a spike — the tests are the spec's ground truth.** The construction above is derived from core's published type contracts, not from a live run. AnaBuild must write the adversarial tests first, run them against real `anatomiaAdapter` output, and adjust the *construction* until the fail-closed assertions pass **without weakening the assertions**. If core's actual reconciliation requires a different boundary/lineage wiring than described, follow core's behavior and document the delta in the build report. The invariant that may not bend: **no over-stated coverage may produce a `satisfied`.**

**Trusted-launcher signal in the env.** `run.ts buildCaptureEnv` emits a new `ANA_CAPTURE_BOUNDARY` variable declaring which lanes the launcher captured (`'root'` in this phase). The construction reads it; absence defaults to the most conservative value (`'root'`). This puts the capture-boundary declaration at the one place that knows it — the spawning process — so a future phase that captures delegates changes the declaration in one location, not in save-time inference.

## Output Mockups

No user-facing output in this phase. The observable artifacts are (a) the `MandateEvaluationContext` returned by the builder and (b) the `ComplianceVerdict[]` produced when that context is fed to core. Illustrative verdict shapes the tests assert against:

```jsonc
// delegate-inclusive negative claim, root-only capture → fails closed
{ "claimId": "no-egress",        "status": "unverifiable", "reason": "delegate-coverage-incomplete", "source": "deterministic", "evidence": [] }
// root-observable channel, not seen in the captured root transcript → never "satisfied"
{ "claimId": "no-force-push",    "status": "unverifiable", "reason": "channel-coverage-incomplete", "source": "deterministic", "evidence": [] }
// runtime contract assertion → core routes to unverifiable, never transcript-satisfied
{ "claimId": "contract-A001",    "status": "unverifiable", "reason": "runtime-scoped", "source": "deterministic", "evidence": [] }
```

The exact `reason` is **subject/context-dependent** — display and tests must not hard-code a single literal (a delegate-inclusive subject may yield `delegate-coverage-incomplete` or `subject-unresolvable`; a root channel gap yields `channel-coverage-incomplete`; Codex blindness yields `codex-blind`).

## File Changes

### packages/cli/src/utils/compliance-context.ts (create)
**What changes:** New module exporting the root-lane context builder, e.g.:
`export function buildRootLaneContext(session: NormalizedSession, blobs: NamedBlob[], boundary?: string): MandateEvaluationContext`.
It constructs the `ExpectedLaunchBoundary` (root lane, no expected delegates), runs `extractLineage`, calls `coverageFromExpectedLaunchBoundary`, and returns the context. Imports `extractLineage`, `coverageFromExpectedLaunchBoundary`, and the `MandateEvaluationContext`, `ExpectedLaunchBoundary`, `NormalizedSession`, `NamedBlob`, `CaptureCoverage`, `AgentRef` types from `anatrace-core`. Pure (no fs/clock/network — core does the work). Must never fabricate `captured: true`.
**Pattern to follow:** `forensics.ts` module shape — focused utility, explicit return type, exported-function JSDoc. The "never over-state" discipline mirrors forensics' "omit the field when unknown" honesty.
**Why:** The sound coverage-context construction is the foundation Phase 2b's producer stands on; isolating it here lets the soundness proof exist before the save-path wiring.

### packages/cli/src/commands/run.ts (modify)
**What changes:** In `buildCaptureEnv` (`:125-158`), add `ANA_CAPTURE_BOUNDARY: 'root'` to the returned record. Update the function's `@returns` JSDoc (currently "the six `ANA_*` variables") to reflect the new count and document the new variable as the trusted-launcher capture-boundary declaration.
**Pattern to follow:** The existing `ANA_*` keys in the returned object (`:150-157`); clean-degrade convention.
**Why:** The capture boundary is a fact only the launcher knows; declaring it here keeps save-time construction from guessing and makes a future delegate-capturing phase a one-line change.

### packages/cli/tests/utils/compliance-context.test.ts (create)
**What changes:** The adversarial soundness suite (the exit gate). Build a mandate via `anatomiaAdapter.extract([...agentDefBlobs, contractBlob])` from a real Anatomia agent-def (e.g. the committed `.claude/agents/ana-verify.md`) plus a `contract.yaml` blob carrying at least one runtime assertion. Parse a fixture session via `parseSession`. Build the context via `buildRootLaneContext`. Feed both to core (`runCompliance` or `verdictsForMandate` with `transcriptContentResolver(session)` and the context). Assert:
- **AC14 (a):** every delegate-inclusive negative claim (`subject.delegates === 'include'`) resolves `status === 'unverifiable'`.
- **AC14 (b):** a channel/behavior absent from the captured root transcript never resolves `status === 'satisfied'` (assert `!== 'satisfied'`).
- **AC14 (guard):** the constructed `captureCoverage` marks no delegate lane `captured: true` — fails closed if a future edit over-states coverage.
- **AC16:** a runtime-scoped `contract-matcher` claim resolves `!== 'satisfied'` (core routes runtime assertions to `unverifiable`).
- **AC8 (no hard-coded reason):** assert the `reason` of a delegate-inclusive claim is one of `{ 'delegate-coverage-incomplete', 'subject-unresolvable' }` and the `reason` of a root-channel gap is `'channel-coverage-incomplete'` (or `'codex-blind'` on a Codex fixture) — i.e. assert membership, never a single fixed literal across both.
- **AC11:** a delegate-inclusive negative stays `unverifiable` (no launcher delegate manifest exists in this phase — sidecar discovery is not completeness).
**Pattern to follow:** `tests/utils/forensics-derive.test.ts` fixture construction (inline blobs, deterministic). Log `mandate.claims` (their `kind`/`subject`/`scope`) while authoring to select claims that exercise each path.
**Why:** These assertions ARE the phase's definition of done. They must pass without being weakened.

## Acceptance Criteria

- [ ] AC8: Behavioral verdicts are coverage-aware — an unobservable channel yields `unverifiable` (with a reason), never a false `satisfied`. The reason varies by subject/context; tests and (later) display do not hard-code one literal.
- [ ] AC11: Delegate-inclusive negative claims resolve `unverifiable` (no launcher manifest this phase); sidecar discovery is not treated as complete coverage.
- [ ] AC14: Soundness is fail-closed and Anatomia-owned. A root-only context resolves every delegate-inclusive negative to `unverifiable`, and a channel absent from the captured root transcript never resolves `satisfied`. The test fails closed if the context construction over-states coverage.
- [ ] AC16: A runtime `contract.yaml` assertion surfaces as `unverifiable` (core's `contract-matcher`/runtime-scoped route), never a transcript-`satisfied` verdict.
- [ ] The context builder never fabricates `captured: true`; coverage is always derived via `coverageFromExpectedLaunchBoundary`.
- [ ] `pnpm vitest run` (in `packages/cli`) passes; `pnpm run lint` passes. Test count does not decrease.

## Testing Strategy

- **Unit tests:** `buildRootLaneContext` returns a context whose `captureCoverage.source === 'trusted-launcher'` and whose delegate lanes are never `captured: true`.
- **Adversarial soundness tests (the gate):** the AC14/AC16/AC8/AC11 assertions above, run against real `anatomiaAdapter` output and a fixture session.
- **Both harnesses:** include at least one Codex fixture path so a `codex-blind` reason is exercised (network-egress is unobservable on Codex) — confirms the no-hard-coded-reason discipline across harnesses.

## Dependencies

- Phase 1 merged: `anatrace-core@0.2.0` installed; `parseSession` available to build fixture sessions.
- A real Anatomia agent-def file and a `contract.yaml` to feed `anatomiaAdapter.extract` (the dogfood `.claude/agents/*.md` are committed and usable as test inputs).

## Constraints

- **No over-statement, ever.** The single invariant that may not bend: over-stated coverage must not produce `satisfied`. Every other design detail yields to making the fail-closed tests pass honestly.
- **Pure construction.** The builder reads only its inputs (session, blobs) — no fs, clock, or network. Core does the reconciliation.
- **No display, no producer, no save-path change** in this phase beyond the `run.ts` env declaration.
- **Both harnesses** must be represented in the soundness suite.

## Gotchas

- `coverageFromExpectedLaunchBoundary` with **no** lineage yields *all* lanes uncaptured (including root) — you must pass `extractLineage(session, blobs)` so the root lane is marked captured; otherwise every claim goes `unverifiable` (over-conservative, hides real signal).
- `anatomiaAdapter.extract` consumes agent-def `.md` (filename `agents/*.md` or `ana*.md`) + `contract.yaml`/`.yml` blobs keyed by filename — it is pure and **never** reads the transcript. The transcript goes to `parseSession`/`runCompliance`, not to `extract`.
- `transcriptContentResolver(session)` takes the parsed **session**, not the raw blobs — it is the in-core content resolver for predicate content.
- The `unverifiable` reason is subject/context-dependent — `delegate-coverage-incomplete` vs `subject-unresolvable` vs `channel-coverage-incomplete` vs `codex-blind`. Assert membership, never a single literal (this is an explicit AC8 trap).
- A claim's delegate-inclusiveness lives in `subject` (`{ kind: 'agent', selector: 'this', delegates: 'include' | 'exclude' }` or `{ kind: 'role', …, delegates }`), not in its `kind`. Inspect `mandate.claims[i].subject` when selecting test claims.
- Core's `runCompliance` signature is `(mandate, session, resolver?, config?, repoRoot?, context?)` — the context is the **6th** positional arg; do not pass it in the wrong slot.

## Build Brief

### Rules That Apply
- Bare specifier `anatrace-core` (no `.js`); local imports keep `.js`; `node:` prefix for built-ins.
- `import type` separate from value imports; named exports only; explicit return type + `@param`/`@returns` JSDoc on the exported builder.
- Avoid `any` at the core boundary — core ships full types; import them (`MandateEvaluationContext`, `CaptureCoverage`, `NormalizedSession`, `NamedBlob`, `AgentRef`, `ExpectedLaunchBoundary`).
- Deterministic tests: inline fixtures, no clock/network.

### Pattern Extracts

Core types this phase binds against (from `anatrace-core`'s published `.d.ts` — do not redefine, import them):
```ts
interface MandateEvaluationContext { thisAgent?: AgentRef; roleBindings?: Record<string, AgentRef[]>; captureCoverage?: CaptureCoverage; lineage?: LineageExtraction; }
interface ExpectedLaunchBoundary { source: 'trusted-launcher'; lanes: ExpectedLaunchLane[]; }
interface ExpectedLaunchLane { agent: AgentRef; expectedDelegates: AgentRef[]; }
interface CaptureCoverage { source: 'trusted-launcher'; completeness?: 'complete' | 'incomplete'; lanes: LaneCaptureCoverage[]; }
interface LaneCaptureCoverage { agent: AgentRef; captured: boolean; delegateManifest: DelegateManifest; }
type ClaimSubject = { kind: 'agent'; selector: 'this'; delegates: 'exclude' | 'include' } | { kind: 'session' } | { kind: 'role'; role: string; delegates: 'exclude' | 'include' };
type VerdictStatus = 'satisfied' | 'violated' | 'unverifiable';
declare function coverageFromExpectedLaunchBoundary(boundary: ExpectedLaunchBoundary, lineage?: LineageExtraction): CaptureCoverage;
declare function extractLineage(session: NormalizedSession, blobs?: NamedBlob[], hooks?: HarnessLineageHook[]): LineageExtraction;
declare function runCompliance(mandate: Mandate, session: NormalizedSession, resolver?: ContentResolver, config?: Config, repoRoot?: string, context?: MandateEvaluationContext): ComplianceResult;
declare const anatomiaAdapter: MandateAdapter; // .framework === 'anatomia'; detect/extract(group: NamedBlob[])
declare function transcriptContentResolver(session: NormalizedSession): ContentResolver;
```

The launcher env to extend (run.ts `buildCaptureEnv` return, :150-157):
```ts
return {
  ANA_HARNESS: platform,
  ANA_ROLE: agentSuffix || 'ana',
  ANA_SLUG: slug,
  ANA_CLI_VERSION: getCliVersionSync(),
  ANA_AGENT_DEF_HASH: agentDefHash,
  ANA_RUN_ID: randomUUID(),
  // ← add: ANA_CAPTURE_BOUNDARY: 'root'
};
```

### Proof Context
No active proof findings for net-new files. `run.ts` has no blocking finding on `buildCaptureEnv`.

### Checkpoint Commands
- After the builder + tests: `(cd 'packages/cli' && pnpm vitest run tests/utils/compliance-context.test.ts)` — Expected: the soundness suite passes (and is not weakened).
- After all changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: ≥ Phase-1 count, no decrease.
- Lint: `(cd 'packages/cli' && pnpm run lint)`.

### Build Baseline
- Baseline is Phase 1's end state (≥ 3700 passing). This phase only adds tests + one new module + a one-key env change.
- Command used: `pnpm vitest run` (from `packages/cli`).
- Regression focus: `run.ts` env consumers (any test asserting the exact `ANA_*` key set from `buildCaptureEnv` — update it to include `ANA_CAPTURE_BOUNDARY`).
