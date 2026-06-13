# Spec: Phase 2b — Behavioral-attestation producer + display

**Created by:** AnaPlan
**Date:** 2026-06-13
**Scope:** .ana/plans/active/anatrace-core-integration/scope.md
**Depends on:** Phase 2a (`buildRootLaneContext` in `src/utils/compliance-context.ts`; `ANA_CAPTURE_BOUNDARY` in the launch env).

## Approach

Phase 2a proved the sound coverage-context construction. This phase wires it into the save path and surfaces the result. It is the **mirror of the existing `ProcessAttestation` pipeline**, one layer over: a save-time producer writes one committed record per transcript; `ana work complete` assembles those records onto the proof entry; `ana proof` renders them. Like `ProcessAttestation`, behavioral verdicts are **evidence that never gates PASS/FAIL** (AC10).

**Producer (`captureComplianceAtSave`).** At `ana artifact save`, while the transcript is still on disk, the producer:
1. Resolves the session the same way `captureProvenanceAtSave` does (pointer → session id → transcript path → bytes), but **does not consume the pointer** (provenance owns that). It runs **before** `captureProvenanceAtSave` at each save site so the pointer is still present (provenance deletes it).
2. Parses the session: `parseSession(blobs, harness)`.
3. Assembles the mandate: reads the role's agent-def `.md` and the work item's `contract.yaml` into `NamedBlob`s and calls `anatomiaAdapter.extract([agentDefBlob, contractBlob])`. Degrades to no record when `extract` returns `null` or the mandate has no claims.
4. Builds the context: `buildRootLaneContext(session, blobs)` (Phase 2a).
5. Runs `runCompliance(mandate, session, transcriptContentResolver(session), undefined, projectRoot, context)`.
6. Builds one `ComplianceAttestation` from the result, **scrubs it** (`scrubDeep`), and writes `.ana/plans/active/{slug}/compliance/{role}-{session_id}.json`.

The whole producer is wrapped in a single try-catch that returns `null` on any throw — a malformed transcript, an adapter exception, a `runCompliance` failure: **the save completes and the record is simply absent** (AC13). This preserves the exact totality discipline of `captureProvenanceAtSave`.

**One record per transcript, never per-role-collapsed (AC7).** Keying is `{role}-{session_id}` — identical to provenance — so plan, build, every build-rework attempt, and verify each write their own record (distinct session ids never collide). Multiple build attempts are preserved data, not overwritten.

**Scrub is mandatory (AC15).** Core's verdict `evidence` is *pointers* (`blobName`/`lineIndex`), never copied bytes — scrub-safe by construction. The record stores claim id / `says` / status / reason and the coverage summary — **no transcript excerpts.** As defense in depth, the whole record passes through `scrubDeep` before write, so an egress command line carrying a token never lands in committed git history.

**Coverage honesty (AC8/AC11/AC17).** The coverage summary comes from `runCompliance`'s `verificationCoverage`. A record whose coverage is incomplete renders with a loud warning. Display never claims a verdict is satisfied for an unobservable channel, and never implies the proof can be recomputed without retained bytes — `transcript_hash`/`mandate_hash` are byte-identity attestation only.

**Reader + display.** `ana work complete` assembles committed `compliance/*.json` onto the proof entry (mirror of `assembleProcessAttestation`); `ana proof` renders a **"Session Attestation"** section — distinct from the Contract section (which is Verify's outcome/runtime assertions). The section shows per-transcript satisfied/violated/unverifiable counts, the mandate + transcript hashes, a coverage line, a loud warning on incomplete records, and compact (already-scrubbed) detail for violations and unverifiables.

**Gotcha carried from prior work (`cross-machine-provenance-C1`).** The provenance file is written to disk *before* the no-changes guard, so a no-work re-validation can leave it modified-but-unstaged. The compliance file has the identical risk — stage it into the **separate** path list (never the artifact `stagedPaths`) and `git reset` it on the no-op path, exactly as provenance does at `artifact.ts:1255-1262` / `:1677-1681`.

## Output Mockups

`ana proof <slug>` gains a section after Provenance:

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

A `violated` verdict renders with a red glyph but **does not** change the card's PASS/FAIL headline. The committed record (compact, scrubbed):

```jsonc
// .ana/plans/active/{slug}/compliance/build-<session_id>.json
{
  "role": "build",
  "harness": "claude",
  "session_id": "0a2f…",
  "captured_at": "2026-06-13T21:00:00.000Z",
  "anatrace_core_version": "0.2.0",
  "framework": "anatomia",
  "mandate_hash": "sha256:1a2b…",
  "transcript_hash": "sha256:9f8e…",
  "coverage": { "total": 8, "fully_checked": 5, "unverifiable": 3 },
  "complete": false,
  "verdicts": [
    { "claim_id": "no-force-push", "says": "Never force-push", "status": "satisfied",   "reason": "predicate-matched" },
    { "claim_id": "no-egress",     "says": "No network egress", "status": "unverifiable", "reason": "delegate-coverage-incomplete" }
  ]
}
```

## File Changes

### packages/cli/src/types/proof.ts (modify)
**What changes:** Add the `ComplianceAttestation` interface (fields per the mockup: `role`, `harness`, `session_id`, `captured_at`, `anatrace_core_version`, `framework`, `mandate_hash`, `transcript_hash`, `coverage: { total; fully_checked; unverifiable }`, `complete`, `verdicts: Array<{ claim_id; says; status; reason }>`). Add an optional `compliance?: ComplianceAttestation[]` field to `ProofChainEntry` with a JSDoc mirroring the `process?` field's "optional, never gates, proof valid without it" wording. Note the cross-cutting checklist already in the file (4 locations) — follow it.
**Pattern to follow:** The existing `ProcessAttestation` interface and the `process?: ProcessAttestation` field on `ProofChainEntry` (`:64-114`, `:209`).
**Why:** The durable per-transcript record shape and its attachment point.

### packages/cli/src/utils/compliance.ts (create)
**What changes:** New module exporting `captureComplianceAtSave(projectRoot: string, slug: string, env: Record<string, string | undefined>): string | null` — the producer described in Approach. Total/never-throws (single outer try-catch → `null`). Also export `assembleComplianceAttestations(projectRoot: string, slug: string): ComplianceAttestation[]` reading committed `compliance/*.json` from `completed/{slug}/` (mirror of `assembleProcessAttestation`'s read loop — skip unparseable files, never throw). Reuse `isProcessCaptureEnabled`, `readPendingPointer`, `resolveTranscriptPath` from `forensics.js`; `buildRootLaneContext` from `compliance-context.js`; `parseSession`, `anatomiaAdapter`, `runCompliance`, `transcriptContentResolver`, `scrubDeep`, `canonicalSort` from `anatrace-core`.
**Pattern to follow:** `forensics.ts:captureProvenanceAtSave` (total try-catch, session resolution, per-`{role}-{session_id}` file write) and `work-proof.ts:assembleProcessAttestation` (committed-record read loop).
**Why:** Net-new producer + reader; the save-time and complete-time halves of the attestation lifecycle.

### packages/cli/src/commands/artifact.ts (modify)
**What changes:** At **both** save sites, immediately **before** the existing `captureProvenanceAtSave(projectRoot, slug, process.env)` call (`:1246`, `:1668`), call `captureComplianceAtSave(projectRoot, slug, process.env)`. Stage its returned file into the **same separate `provenancePaths`-style list** (rename to a shared non-artifact list or add a parallel `compliancePaths` list) and apply the identical `git reset` on the no-changes path and inclusion in the commit `--` pathspec. Import from `../utils/compliance.js`.
**Pattern to follow:** The provenance staging block (`:1245-1253`), the no-op reset (`:1255-1262`), and the commit pathspec (`:1267-1274`) — the compliance file rides the **same** commit only when artifacts actually changed, never on its own.
**Why:** The producer must fire at save while the transcript exists; the file must travel git with the artifact (AC7) without making every re-save commit (the `cross-machine-provenance-C1` discipline).

### packages/cli/src/commands/work-proof.ts (modify)
**What changes:** In `writeProofChain`, after assembling `processAttestation`, assemble `compliance = assembleComplianceAttestations(projectRoot, slug)` (only when capture is on) and add `...(compliance.length > 0 ? { compliance } : {})` to the `entry` object. Emit a loud `chalk.yellow` warning when any assembled record has `complete === false` (mirroring the existing completeness warning at `:327-334`) — but never block.
**Pattern to follow:** The `processAttestation` assembly + conditional-spread onto `entry` (`:300-321`, `:370`) and the completeness WARN block (`:327-334`).
**Why:** Attaches the committed records to the proof entry; keeps the "loud, never gating" discipline.

### packages/cli/src/commands/proof.ts (modify)
**What changes:** In `formatHumanReadable`, after the Provenance section, render a `Session Attestation` section when `entry.compliance?.length`. Per record: a header line (role · claim count · satisfied/violated/unverifiable counts), a coverage line, compact scrubbed detail lines for `violated`/`unverifiable` verdicts (cap like the existing `MAX_DISPLAY = 5`), and the mandate/transcript hashes. A loud `⚠` line when any record is incomplete. Use the existing `sectionRule`/`statGrid`/`chalk` render vocabulary — presentation only, never mutate data, never affect the PASS/FAIL headline.
**Pattern to follow:** The Provenance section (`:418-531`) and `renderSeverityList`/`sectionRule` helpers.
**Why:** AC9 — the behavioral-attestation surface lives in the existing proof UI, no separate report.

### Tests (create)
- `packages/cli/tests/utils/compliance.test.ts` — producer: one record per transcript (two build sessions → two files, no collapse, AC7); record carries `anatrace_core_version`, `mandate_hash`, `transcript_hash`, `coverage`, `framework` (AC7); **totality** — an adversarial/malformed transcript yields no record and no throw, save path intact (AC13); **scrub** — a transcript containing a `curl` with a credential token does not write that token into the committed record (AC15); a runtime contract assertion never appears as a `satisfied` verdict (AC16, producer-level).
- `packages/cli/tests/commands/proof-compliance-display.test.ts` — `formatHumanReadable` renders the Session Attestation section with counts/coverage/hashes; a `violated` verdict does not change the PASS headline (AC10); an incomplete record renders the loud warning (AC9).
- Reader coverage may live in `compliance.test.ts` or a `work-proof` test: `assembleComplianceAttestations` reads committed records and skips unparseable files.
**Pattern to follow:** `tests/commands/work-proof-process.test.ts` (seed committed records into `completed/{slug}/…`, assemble, assert) and `tests/utils/forensics.test.ts` (save-path totality).

## Acceptance Criteria

- [ ] AC7: A producer writes one record per transcript at save time, keyed by `{role}-{session_id}` (no role collapse), including verdicts, mandate/transcript hashes, core version, framework, and coverage.
- [ ] AC9: `ana proof` renders the Session Attestation section (per-transcript counts, hashes, coverage line, loud warning on incomplete records, compact scrubbed violation/unverifiable detail) in the existing proof UI.
- [ ] AC10: Behavioral verdicts never gate PASS/FAIL — a `violated` verdict leaves `result` and the card headline unchanged; the record is evidence only.
- [ ] AC11: Delegate-inclusive negative claims remain `unverifiable` in the written record (root-only coverage from Phase 2a).
- [ ] AC13: Every core call in the producer is inside a total try-catch — a malformed/adversarial transcript yields an absent record, the save completes, nothing throws.
- [ ] AC15: Verdict/evidence committed to proof is scrubbed (`scrubDeep`); a token-bearing command in the transcript does not appear in the committed compliance record.
- [ ] AC16: Runtime `contract.yaml` assertions never surface as a `satisfied` behavioral verdict (producer-level test).
- [ ] AC17: No field or rendering claims provenance/compliance can be regenerated without retained bytes; hashes are byte-identity attestation only.
- [ ] Codex acceptance: the producer is exercised on a Codex fixture (or Codex is explicitly flagged untested in the build report — no silent parity claim).
- [ ] `pnpm vitest run` (in `packages/cli`) passes; `pnpm run lint` passes; test count does not decrease.

## Testing Strategy

- **Unit tests:** producer record shape + per-transcript keying; reader skip-unparseable; display rendering + counts.
- **Integration tests:** two build-rework sessions → two distinct committed records (no collapse); committed record travels into the proof entry via `assembleComplianceAttestations`.
- **Edge cases:** adversarial transcript (totality); token-bearing command (scrub); incomplete coverage (loud warning); `violated` verdict (PASS unchanged); empty mandate / `extract` returns null (no record, no error); Codex fixture path.

## Dependencies

- Phase 2a merged: `buildRootLaneContext`, `ANA_CAPTURE_BOUNDARY`.
- Phase 1 merged: `parseSession`, `transcript_hash` discipline.
- A resolvable role agent-def `.md` and the work item's `contract.yaml` at save time (both committed in the active plan dir).

## Constraints

- **Totality** — the producer must never break `ana artifact save` or the live session.
- **Scrub** — no secret may reach committed git history; `scrubDeep` every record; store no transcript excerpts.
- **Never gates** — verdicts are evidence; PASS/FAIL is computed upstream and untouched.
- **One record per transcript** — keyed by role + session_id; no collapse across rework attempts.
- **Both harnesses** — Codex must be exercised or explicitly flagged untested.
- **Backward compatibility** — `compliance?` is optional on `ProofChainEntry`; entries written before it existed remain valid.

## Gotchas

- **Run the compliance producer BEFORE `captureProvenanceAtSave`** at each save site — provenance consumes (deletes) the pending pointer at the end of its run, and Codex has no env fallback to recover the session id once the pointer is gone.
- **`cross-machine-provenance-C1`:** stage the compliance file into the separate non-artifact path list and `git reset` it on the no-changes path — never let it ride the artifact `stagedPaths` (the transcript grows every save, so it would make every re-save commit).
- `anatomiaAdapter.extract` needs the agent-def `.md` + `contract.yaml` **blobs keyed by filename**, never the transcript. The transcript goes to `parseSession`/`runCompliance`.
- `runCompliance`'s context is the **6th** positional arg: `runCompliance(mandate, session, resolver, config, repoRoot, context)`. Pass `transcriptContentResolver(session)` as the resolver and `projectRoot` as `repoRoot`.
- Verdict `evidence` is pointers, not bytes — but still `scrubDeep` the whole record (defense in depth) and store no raw excerpts.
- `anatrace_core_version` comes from the installed package: `createRequire(import.meta.url)('anatrace-core/package.json').version` (core's `exports` map exposes `./package.json`). Do not hardcode.
- A `violated` verdict must not touch `proof.result` — render it, never gate on it.
- Adding `compliance` to `ProofChainEntry` is the cross-cutting 4-location change documented at `types/proof.ts:116-124` — type, default, construction, display. You touch type + construction + display here; no proofSummary default is needed (it's read from committed files, not computed in the summary).

## Build Brief

### Rules That Apply
- Bare `anatrace-core` / `node:` specifiers no `.js`; local imports keep `.js`.
- `import type` separate from values; named exports only; explicit return types + JSDoc on exported functions.
- `| null` return for the producer (checked-and-absent); `?:` for the optional `compliance` field and record fields that may be absent.
- Two-layer error handling: the producer degrades internally (engine-style total catch → `null`); user-facing warnings (`chalk.yellow`) live in the command layer (`work-proof.ts`/`proof.ts`), never in the util.
- Presentation stays in `proof.ts`; never mutate entry data while rendering.

### Pattern Extracts

The producer's shape mirrors this total save orchestrator (forensics.ts:668-724) — same try-catch, same `{role}-{session_id}` keying, same `mkdirSync` + `writeFileSync`:
```ts
export function captureProvenanceAtSave(projectRoot, slug, env): string | null {
  try {
    if (!isProcessCaptureEnabled(projectRoot)) return null;
    const role = env['ANA_ROLE'] ?? ''; if (!role) return null;
    const harness = env['ANA_HARNESS'] || 'claude';
    const pointer = runId ? readPendingPointer(runId) : null;
    // … resolve sessionId, transcriptPath …
    const provDir = path.join(projectRoot, '.ana', 'plans', 'active', slug, 'provenance');
    fs.mkdirSync(provDir, { recursive: true });
    fs.writeFileSync(path.join(provDir, `${role}-${sessionId}.json`), JSON.stringify(record, null, 2) + '\n', 'utf-8');
    return filePath;
  } catch { return null; }  // Total: a capture failure must never break a save.
}
```

The reader mirrors this committed-record loop (work-proof.ts:130-148) — skip unparseable, never throw:
```ts
const sessions: SessionProvenance[] = [];
try {
  for (const file of fs.readdirSync(provDir)) {
    if (!file.endsWith('.json')) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(fs.readFileSync(path.join(provDir, file), 'utf-8')); } catch { continue; }
    if (typeof parsed === 'object' && parsed !== null) sessions.push(parsed as SessionProvenance);
  }
} catch { /* no dir → zero records, not an error */ }
```

The save-site staging discipline to replicate for the compliance file (artifact.ts:1245-1262):
```ts
const provenancePaths: string[] = [];
const provenancePath = captureProvenanceAtSave(projectRoot, slug, process.env);
if (provenancePath) {
  try { const rel = path.relative(projectRoot, provenancePath); runGit(['add', rel], { cwd: projectRoot }); provenancePaths.push(rel); }
  catch { /* non-blocking */ }
}
// no-changes guard checks ARTIFACT paths only; on status===0, `git reset -- ...provenancePaths`
```

Core symbols (import, do not redefine): `parseSession`, `anatomiaAdapter`, `runCompliance`, `transcriptContentResolver`, `scrubDeep`, `canonicalSort`, types `ComplianceResult`, `ComplianceVerdict`, `VerificationCoverage`, `Mandate`, `NamedBlob`, `NormalizedSession`.

### Proof Context
- `packages/cli/src/commands/artifact.ts` — `cross-machine-provenance-C1` (no-work re-validation leaves the provenance file unstaged): the compliance file MUST follow the same separate-staging + reset-on-no-op pattern. Other findings (`fix-false-rejection-archive-C3`, `captured-test-evidence-C9/10/11`) are unrelated to this change.
- `packages/cli/src/commands/work-proof.ts` — `session-capture-C7/C8` (legacy home-buffer reads in `assembleProcessAttestation`) are not in this change's path; do not regress them, do not extend them.
- `packages/cli/src/commands/proof.ts` — heavily touched (17 cycles); keep the new section additive and on the shared render vocabulary (`learn-session-memory-C1`: do not over-export proof.ts helpers — keep the new render helper module-private).

### Checkpoint Commands
- After producer + tests: `(cd 'packages/cli' && pnpm vitest run tests/utils/compliance.test.ts)` — Expected: producer/scrub/totality green.
- After display + tests: `(cd 'packages/cli' && pnpm vitest run tests/commands/proof-compliance-display.test.ts)` — Expected: render + never-gates green.
- After all changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: ≥ Phase-2a count, no decrease.
- Lint: `(cd 'packages/cli' && pnpm run lint)`.

### Build Baseline
- Baseline is Phase 2a's end state. This phase adds one util module, one type, three command-file edits, and new tests.
- Command used: `pnpm vitest run` (from `packages/cli`).
- Regression focus: `work-proof-process.test.ts` (entry assembly shape), `proof.ts` render tests, any snapshot of `formatHumanReadable` output (a new section changes the rendered card — update intentionally and note it).
