# Spec: Phase 2 — Behavioral attestation

**Created by:** AnaPlan
**Date:** 2026-06-13
**Scope:** .ana/plans/active/anatrace-core-integration/scope.md
**Depends on:** Phase 1 (anatrace-core@0.2.0 installed; `parseSession`, `transcript_hash` discipline in place).

## Approach

Build deterministic, coverage-aware verdicts about *how an agent session behaved* — did Verify avoid the build report, did Build stay in file scope, was there egress — and surface them in `ana proof`. This is the **mirror of the existing `ProcessAttestation` pipeline**, one layer over: a save-time producer writes one committed record per transcript; `ana work complete` assembles those onto the proof entry; `ana proof` renders them. Verdicts are **evidence that never gates PASS/FAIL** (AC10), exactly like `ProcessAttestation`.

The engine does the judging. The one thing Anatomia must get right itself is **coverage soundness**: the core faithfully evaluates whatever coverage it is handed, so if Anatomia over-states coverage, the core will faithfully emit a false `satisfied` it cannot catch. That is the single correctness hinge — and it is built **first, test-first**, before any of it touches the save path.

### Build order (the soundness proof comes first)

**Step 1 — Prove the sound coverage context (do this before writing the producer).**
Anatomia's launcher captures only the *root* agent's transcript, never delegate (sub-agent) transcripts. The context must reflect exactly that and nothing more. Build `buildRootLaneContext(session, blobs)` in `src/utils/compliance-context.ts`:
1. Construct an `ExpectedLaunchBoundary` (`source: 'trusted-launcher'`, a single root lane `{ agent: { kind: 'root' }, expectedDelegates: [] }`).
2. Run `extractLineage(session, blobs)` to project which lanes' bytes were actually checked.
3. Call `coverageFromExpectedLaunchBoundary(boundary, lineage)` → `CaptureCoverage`. **Never hand-construct a `LaneCaptureCoverage` with `captured: true`** — let core's reconciliation decide. Core's contract: "Expected launch records alone never prove capture; absent lineage yields uncaptured lanes." Root is captured (bytes checked); observed delegates are uncaptured.
4. Return `{ thisAgent: { kind: 'root' }, captureCoverage, lineage }`.

Then write the adversarial soundness suite and make it pass **without weakening it**. These tests are the definition of done for this step:
- a delegate-inclusive negative claim (`subject.delegates === 'include'`) → `unverifiable` (AC11/AC14);
- a channel absent from the captured root transcript → never `satisfied` (AC8/AC14);
- a runtime-scoped `contract-matcher` claim → never `satisfied` (AC16);
- the constructed `captureCoverage` marks no delegate lane `captured: true` (AC14 guard);
- the `unverifiable` *reason* varies by subject (`delegate-coverage-incomplete`/`subject-unresolvable` for delegate-inclusive; `channel-coverage-incomplete`/`codex-blind` for a root channel) — assert membership, never a single literal (AC8).

This step is derived from core's published type contracts, not a live run. If core's actual reconciliation needs a different boundary/lineage wiring than described, **follow core's behavior and document the delta in the build report.** The invariant that may not bend: over-stated coverage must never produce `satisfied`.

`run.ts buildCaptureEnv` emits `ANA_CAPTURE_BOUNDARY: 'root'` — the trusted launcher declaring which lanes it captured. The construction reads it (absence defaults to `'root'`). This puts the capture-boundary declaration at the one place that knows it, so a future phase that captures delegates is a one-line change.

**Step 2 — The producer (`captureComplianceAtSave`).**
At `ana artifact save`, while the transcript is still on disk, the producer:
1. Resolves the session like `captureProvenanceAtSave` does (pointer → session id → transcript path → bytes) but **does not consume the pointer**, and runs **before** `captureProvenanceAtSave` at each save site (provenance deletes the pointer; Codex has no env fallback once it's gone).
2. `parseSession(blobs, harness)`.
3. Assembles the mandate: reads the role's agent-def `.md` and the work item's `contract.yaml` into `NamedBlob`s, calls `anatomiaAdapter.extract([agentDefBlob, contractBlob])`. No record when `extract` returns `null` or the mandate has no claims.
4. `buildRootLaneContext(session, blobs)` (Step 1).
5. `runCompliance(mandate, session, transcriptContentResolver(session), undefined, projectRoot, context)`.
6. Builds one `ComplianceAttestation`, **scrubs it (`scrubDeep`)**, writes `.ana/plans/active/{slug}/compliance/{role}-{session_id}.json`.

The entire producer is one outer try-catch → `null` on any throw. A malformed transcript, an adapter exception, a `runCompliance` failure: **the save completes and the record is simply absent** (AC13). Same totality discipline as `captureProvenanceAtSave`.

**One record per transcript, never collapsed (AC7).** Keying is `{role}-{session_id}` — identical to provenance — so plan, build, every build-rework attempt, and verify each write their own record. Distinct session ids never collide.

**Scrub is mandatory (AC15).** Core verdict `evidence` is *pointers* (`blobName`/`lineIndex`), never copied bytes. The record stores claim id / `says` / status / reason / coverage — **no transcript excerpts** — and the whole record passes `scrubDeep` before write, so an egress command carrying a token never lands in committed git history.

**Step 3 — Reader + display.**
`ana work complete` assembles committed `compliance/*.json` onto the proof entry (mirror of `assembleProcessAttestation`); `ana proof` renders a **Session Attestation** section — distinct from the Contract section (Verify's outcome/runtime assertions). The section shows per-transcript satisfied/violated/unverifiable counts, mandate + transcript hashes, a coverage line, a loud warning on incomplete records, and compact (already-scrubbed) detail for violations/unverifiables. A `violated` verdict renders with a red glyph but **never** changes the PASS/FAIL headline (AC10).

**Carried gotcha (`cross-machine-provenance-C1`).** The provenance file is written before the no-changes guard, so a no-work re-validation can leave it modified-but-unstaged. The compliance file has the identical risk — stage it into the **separate** non-artifact path list and `git reset` it on the no-op path, exactly as provenance does at `artifact.ts:1255-1262`/`:1677-1681`.

## Output Mockups

No user-facing output until Step 3. The Step 1 observables are the `MandateEvaluationContext` and the `ComplianceVerdict[]` core produces from it:

```jsonc
{ "claimId": "no-egress",     "status": "unverifiable", "reason": "delegate-coverage-incomplete", "source": "deterministic", "evidence": [] }
{ "claimId": "no-force-push", "status": "unverifiable", "reason": "channel-coverage-incomplete", "source": "deterministic", "evidence": [] }
{ "claimId": "contract-A001", "status": "unverifiable", "reason": "runtime-scoped",              "source": "deterministic", "evidence": [] }
```

The Step 3 `ana proof <slug>` section (after Provenance):

```
── Session Attestation ─────────────────────────────────  3 transcripts ──
  core v0.2.0 · framework anatomia
  build · 8 claims   ✓ 5 satisfied · 0 violated · 3 unverifiable
        coverage 5/8 checked · 3 unverifiable
        ⚠ no-egress  unverifiable (delegate-coverage-incomplete)
        mandate sha256:1a2b… · transcript sha256:9f8e…
  verify · 7 claims  ✓ 6 satisfied · 0 violated · 1 unverifiable
        coverage 6/7 checked · 1 unverifiable
        mandate sha256:4c5d… · transcript sha256:7a6b…
  ⚠ 1 record has incomplete coverage — verdicts are evidence, never a gate.
```

The committed per-transcript record (compact, scrubbed):

```jsonc
// .ana/plans/active/{slug}/compliance/build-<session_id>.json
{
  "role": "build", "harness": "claude", "session_id": "0a2f…",
  "captured_at": "2026-06-13T21:00:00.000Z",
  "anatrace_core_version": "0.2.0", "framework": "anatomia",
  "mandate_hash": "sha256:1a2b…", "transcript_hash": "sha256:9f8e…",
  "coverage": { "total": 8, "fully_checked": 5, "unverifiable": 3 },
  "complete": false,
  "verdicts": [
    { "claim_id": "no-force-push", "says": "Never force-push", "status": "satisfied",    "reason": "predicate-matched" },
    { "claim_id": "no-egress",     "says": "No network egress", "status": "unverifiable", "reason": "delegate-coverage-incomplete" }
  ]
}
```

The exact `reason` is subject/context-dependent — display and tests must not hard-code a single literal.

## File Changes

### packages/cli/src/utils/compliance-context.ts (create)
**What changes:** `export function buildRootLaneContext(session: NormalizedSession, blobs: NamedBlob[], boundary?: string): MandateEvaluationContext` — Step 1 construction. Imports `extractLineage`, `coverageFromExpectedLaunchBoundary`, and the relevant types from `anatrace-core`. Pure; never fabricates `captured: true`.
**Pattern to follow:** `forensics.ts` module shape — focused utility, explicit return type, JSDoc. The "never over-state" discipline mirrors forensics' "omit the field when unknown" honesty.
**Why:** The sound coverage construction is the correctness hinge; isolating it as a function (not a phase) keeps it independently testable while it ships with its caller.

### packages/cli/src/commands/run.ts (modify)
**What changes:** Add `ANA_CAPTURE_BOUNDARY: 'root'` to the `buildCaptureEnv` return (`:150-157`); update the `@returns` JSDoc count and document the new var as the trusted-launcher capture-boundary declaration.
**Pattern to follow:** The existing `ANA_*` keys; clean-degrade convention.
**Why:** The capture boundary is a fact only the launcher knows.

### packages/cli/src/types/proof.ts (modify)
**What changes:** Add the `ComplianceAttestation` interface (fields per the record mockup). Add `compliance?: ComplianceAttestation[]` to `ProofChainEntry` with JSDoc mirroring the `process?` field's "optional, never gates, proof valid without it" wording. Follow the cross-cutting checklist at `:116-124`.
**Pattern to follow:** `ProcessAttestation` + the `process?` field (`:64-114`, `:209`).
**Why:** The durable per-transcript record shape and its attachment point.

### packages/cli/src/utils/compliance.ts (create)
**What changes:** `export function captureComplianceAtSave(projectRoot, slug, env): string | null` (Step 2 producer, total/never-throws) and `export function assembleComplianceAttestations(projectRoot, slug): ComplianceAttestation[]` (reads committed `compliance/*.json` from `completed/{slug}/`, skips unparseable, never throws). Reuse `isProcessCaptureEnabled`/`readPendingPointer`/`resolveTranscriptPath` from `forensics.js`; `buildRootLaneContext` from `compliance-context.js`; `parseSession`/`anatomiaAdapter`/`runCompliance`/`transcriptContentResolver`/`scrubDeep`/`canonicalSort` from `anatrace-core`.
**Pattern to follow:** `forensics.ts:captureProvenanceAtSave` (total try-catch, `{role}-{session_id}` write) + `work-proof.ts:assembleProcessAttestation` (committed-record read loop).
**Why:** The save-time and complete-time halves of the attestation lifecycle.

### packages/cli/src/commands/artifact.ts (modify)
**What changes:** At both save sites, immediately **before** `captureProvenanceAtSave(...)` (`:1246`, `:1668`), call `captureComplianceAtSave(projectRoot, slug, process.env)`. Stage its file into a separate (non-artifact) path list with the identical `git reset`-on-no-op and commit-pathspec handling as provenance. Import from `../utils/compliance.js`.
**Pattern to follow:** The provenance staging block (`:1245-1262`) and commit pathspec (`:1267-1274`).
**Why:** The producer must fire at save while the transcript exists; the file travels git with the artifact without making every re-save commit.

### packages/cli/src/commands/work-proof.ts (modify)
**What changes:** In `writeProofChain`, after `processAttestation`, assemble `compliance = assembleComplianceAttestations(projectRoot, slug)` (capture-on only) and conditionally spread `compliance` onto `entry`. Emit a `chalk.yellow` warning when any record has `complete === false` (mirror `:327-334`) — never block.
**Pattern to follow:** The `processAttestation` assembly + conditional spread (`:300-321`, `:370`) and the completeness WARN (`:327-334`).
**Why:** Attaches records to the proof entry; loud, never gating.

### packages/cli/src/commands/proof.ts (modify)
**What changes:** In `formatHumanReadable`, after the Provenance section, render the `Session Attestation` section when `entry.compliance?.length` (header/counts per record, coverage line, capped scrubbed violation/unverifiable detail, mandate/transcript hashes, loud `⚠` on incomplete). Use the shared `sectionRule`/`statGrid`/`chalk` vocabulary; presentation only; never affect the headline. Keep any new render helper module-private (`learn-session-memory-C1`: do not over-export from proof.ts).
**Pattern to follow:** The Provenance section (`:418-531`).
**Why:** AC9 — in the existing proof UI, no separate report.

### Tests (create)
- `packages/cli/tests/utils/compliance-context.test.ts` — the Step 1 adversarial soundness suite (AC8/AC11/AC14/AC16). Build the mandate via `anatomiaAdapter.extract` from a real agent-def (`.claude/agents/ana-verify.md`) + a `contract.yaml` with a runtime assertion; parse a fixture session; feed both to core with the built context. Include a Codex fixture path so a `codex-blind` reason is exercised.
- `packages/cli/tests/utils/compliance.test.ts` — producer: one record per transcript (two build sessions → two files, AC7); record carries `anatrace_core_version`/`mandate_hash`/`transcript_hash`/`coverage`/`framework`; totality (adversarial transcript → no record, no throw, AC13); scrub (token-bearing `curl` not in committed record, AC15); runtime assertion never `satisfied` in the record (AC16); reader skips unparseable files.
- `packages/cli/tests/commands/proof-compliance-display.test.ts` — section renders with counts/coverage/hashes (AC9); `violated` verdict leaves the PASS headline unchanged (AC10); incomplete record renders the loud warning.
**Pattern to follow:** `tests/commands/work-proof-process.test.ts` (seed committed records, assemble, assert) + `tests/utils/forensics.test.ts` (save-path totality) + `tests/utils/forensics-derive.test.ts` (deterministic inline fixtures).

## Acceptance Criteria

- [ ] AC7: One record per transcript at save time, keyed `{role}-{session_id}` (no collapse), with verdicts, mandate/transcript hashes, core version, framework, coverage.
- [ ] AC8: Verdicts are coverage-aware — an unobservable channel → `unverifiable` (reason varies by subject; never a false `satisfied`; tests/display don't hard-code one reason).
- [ ] AC9: `ana proof` renders the Session Attestation section (counts, hashes, coverage line, loud incomplete warning, compact scrubbed detail) in the existing UI.
- [ ] AC10: Behavioral verdicts never gate PASS/FAIL — a `violated` verdict leaves `result` and the headline unchanged.
- [ ] AC11: Delegate-inclusive negatives resolve `unverifiable` (root-only coverage).
- [ ] AC13: Every core call in the producer is inside a total try-catch — a malformed transcript yields an absent record, the save completes, nothing throws.
- [ ] AC14: Soundness is fail-closed and Anatomia-owned — a root-only context resolves delegate-inclusive negatives to `unverifiable` and never resolves an unobserved channel to `satisfied`; the test fails closed if the construction over-states coverage; the builder never fabricates `captured: true`.
- [ ] AC16: Runtime `contract.yaml` assertions never surface as `satisfied` behavioral verdicts.
- [ ] AC17: No field or rendering claims regeneration without retained bytes; hashes are byte-identity attestation only.
- [ ] Codex acceptance: the producer is exercised on a Codex fixture, or Codex is explicitly flagged untested in the build report (no silent parity claim).
- [ ] `pnpm vitest run` (in `packages/cli`) passes; `pnpm run lint` passes; test count does not decrease.

## Testing Strategy

- **Soundness (test-first, Step 1):** the AC8/AC11/AC14/AC16 adversarial suite — run against real `anatomiaAdapter` output; both harnesses represented.
- **Unit:** producer record shape + per-transcript keying; reader skip-unparseable; display rendering + counts.
- **Integration:** two build-rework sessions → two distinct committed records; a committed record travels into the proof entry via `assembleComplianceAttestations`.
- **Edge cases:** adversarial transcript (totality); token-bearing command (scrub); incomplete coverage (warning); `violated` verdict (PASS unchanged); empty mandate / `extract` null (no record, no error); Codex fixture.

## Dependencies

- Phase 1 merged: `anatrace-core@0.2.0`, `parseSession`, `transcript_hash` discipline.
- A resolvable role agent-def `.md` and the work item's `contract.yaml` at save time (both committed in the active plan dir).

## Constraints

- **No over-statement, ever** — the single invariant that may not bend: over-stated coverage must never produce `satisfied`.
- **Totality** — the producer must never break `ana artifact save` or the live session.
- **Scrub** — `scrubDeep` every record; store no transcript excerpts.
- **Never gates** — verdicts are evidence; PASS/FAIL is computed upstream and untouched.
- **One record per transcript** — keyed role + session_id; no rework collapse.
- **Both harnesses** — Codex exercised or explicitly flagged untested.
- **Backward compatibility** — `compliance?` is optional; pre-existing entries remain valid.

## Gotchas

- `coverageFromExpectedLaunchBoundary` with **no** lineage yields *all* lanes uncaptured (including root) → everything `unverifiable`. Pass `extractLineage(session, blobs)` so root is marked captured.
- Run the compliance producer **before** `captureProvenanceAtSave` at each save site — provenance deletes the pending pointer, and Codex has no env fallback once it's gone.
- `cross-machine-provenance-C1`: stage the compliance file into the separate non-artifact list and `git reset` it on the no-op path — never the artifact `stagedPaths`.
- `anatomiaAdapter.extract` consumes agent-def `.md` + `contract.yaml` **blobs keyed by filename**, never the transcript. The transcript goes to `parseSession`/`runCompliance`.
- `runCompliance`'s context is the **6th** positional arg: `(mandate, session, resolver, config, repoRoot, context)`. Pass `transcriptContentResolver(session)` and `projectRoot` as `repoRoot`.
- The `unverifiable` reason is subject/context-dependent — assert membership, never one literal (AC8 trap).
- Delegate-inclusiveness lives in `subject` (`{ kind:'agent', selector:'this', delegates:'include'|'exclude' }` / `{ kind:'role', …, delegates }`), not in `kind`. Inspect `mandate.claims[i].subject` when selecting test claims.
- `anatrace_core_version`: `createRequire(import.meta.url)('anatrace-core/package.json').version` (core's `exports` exposes `./package.json`) — do not hardcode.
- A `violated` verdict must not touch `proof.result` — render it, never gate on it.

## Build Brief

### Rules That Apply
- Bare `anatrace-core` / `node:` specifiers no `.js`; local imports keep `.js`.
- `import type` separate from values; named exports only; explicit return types + `@param`/`@returns` JSDoc on exported functions.
- `| null` return for the producer; `?:` for the optional `compliance` field and absent record fields.
- Two-layer errors: the producer degrades internally (total catch → `null`); `chalk.yellow` warnings live in the command layer (`work-proof.ts`/`proof.ts`), never the util.
- Presentation stays in `proof.ts`; never mutate entry data while rendering. Keep new render helpers module-private.
- Avoid `any` at the core boundary — import core's types.

### Pattern Extracts

Step 1 core types (import, do not redefine):
```ts
interface MandateEvaluationContext { thisAgent?: AgentRef; roleBindings?: Record<string, AgentRef[]>; captureCoverage?: CaptureCoverage; lineage?: LineageExtraction; }
interface ExpectedLaunchBoundary { source: 'trusted-launcher'; lanes: ExpectedLaunchLane[]; }
interface ExpectedLaunchLane { agent: AgentRef; expectedDelegates: AgentRef[]; }
interface CaptureCoverage { source: 'trusted-launcher'; completeness?: 'complete' | 'incomplete'; lanes: LaneCaptureCoverage[]; }
interface LaneCaptureCoverage { agent: AgentRef; captured: boolean; delegateManifest: DelegateManifest; }
type ClaimSubject = { kind:'agent'; selector:'this'; delegates:'exclude'|'include' } | { kind:'session' } | { kind:'role'; role:string; delegates:'exclude'|'include' };
type VerdictStatus = 'satisfied' | 'violated' | 'unverifiable';
declare function coverageFromExpectedLaunchBoundary(boundary: ExpectedLaunchBoundary, lineage?: LineageExtraction): CaptureCoverage;
declare function extractLineage(session: NormalizedSession, blobs?: NamedBlob[], hooks?: HarnessLineageHook[]): LineageExtraction;
declare function runCompliance(mandate: Mandate, session: NormalizedSession, resolver?: ContentResolver, config?: Config, repoRoot?: string, context?: MandateEvaluationContext): ComplianceResult; // { verdicts, findings, dossier, hookRequests, verificationCoverage }
declare const anatomiaAdapter: MandateAdapter; // .framework === 'anatomia'; extract(group: NamedBlob[]): Mandate | null
declare function transcriptContentResolver(session: NormalizedSession): ContentResolver;
declare function scrubDeep<T>(value: T): T;
```

The producer mirrors this total orchestrator (forensics.ts:668-724) — same try-catch, same `{role}-{session_id}` write:
```ts
export function captureProvenanceAtSave(projectRoot, slug, env): string | null {
  try {
    if (!isProcessCaptureEnabled(projectRoot)) return null;
    const role = env['ANA_ROLE'] ?? ''; if (!role) return null;
    // … resolve sessionId / transcriptPath (read pointer, DO NOT delete it in the producer) …
    const dir = path.join(projectRoot, '.ana', 'plans', 'active', slug, 'compliance');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${role}-${sessionId}.json`), JSON.stringify(record, null, 2) + '\n', 'utf-8');
    return filePath;
  } catch { return null; }
}
```

The reader mirrors this loop (work-proof.ts:130-148) — skip unparseable, never throw. The save-site staging mirrors artifact.ts:1245-1262 (separate path list, `git reset` on no-op).

### Proof Context
- `artifact.ts` — `cross-machine-provenance-C1`: the compliance file MUST follow the separate-staging + reset-on-no-op pattern. Other findings on the file are unrelated.
- `work-proof.ts` — `session-capture-C7/C8` (legacy home-buffer reads) are not on this path; don't regress or extend them.
- `proof.ts` — heavily touched (17 cycles); keep the new section additive on the shared render vocabulary; new helpers stay module-private (`learn-session-memory-C1`).
- `run.ts` — no blocking finding on `buildCaptureEnv`.

### Checkpoint Commands
- After Step 1: `(cd 'packages/cli' && pnpm vitest run tests/utils/compliance-context.test.ts)` — Expected: soundness suite green (not weakened).
- After Step 2: `(cd 'packages/cli' && pnpm vitest run tests/utils/compliance.test.ts)` — Expected: producer/scrub/totality green.
- After Step 3: `(cd 'packages/cli' && pnpm vitest run tests/commands/proof-compliance-display.test.ts)` — Expected: render + never-gates green.
- After all changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: ≥ Phase-1 count, no decrease.
- Lint: `(cd 'packages/cli' && pnpm run lint)`.

### Build Baseline
- Baseline is Phase 1's end state (≥ 3700 passing across 152 files).
- Command used: `pnpm vitest run` (from `packages/cli`).
- After build: expected ≥ Phase-1 count (this phase only adds modules + tests + a one-key env change + additive type/render).
- Regression focus: `run.ts` env consumers (any test asserting the exact `ANA_*` key set — add `ANA_CAPTURE_BOUNDARY`), `work-proof-process.test.ts` (entry assembly shape), and any `formatHumanReadable` snapshot (the new section changes the card — update intentionally and note it).
