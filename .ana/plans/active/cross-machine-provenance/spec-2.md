# Spec: Cross-machine provenance — Phase 2 (completeness + enforcement + display)

**Created by:** AnaPlan
**Date:** 2026-06-07
**Scope:** .ana/plans/active/cross-machine-provenance/scope.md

## Approach

Phase 1 made provenance travel as committed `provenance/*.json` files and rewrote `assembleProcessAttestation` to read them. This phase makes the proof **loud about gaps**: it adds a per-phase presence-floor completeness check, surfaces gaps in the proof entry and on the terminal, and lets a team opt into hard failure via a new `processCaptureStrict` gate. It also finalizes cost-at-display and proves the cross-machine and squash-merge survival behaviors with fixtures.

**The completeness check** is a presence floor tied to *saved reports*, never to `rejection_cycles` (which would false-fail legitimate rework):
- Expected: one `plan` session for the item; for builds, one `build` session per saved `build_report*.md`; for verifies, one `verify` session per saved `verify_report*.md`.
- `ana` and `learn` roles are excluded — never required.
- A shortfall in any bucket is a **gap**: recorded in the proof entry's `process.completeness` and printed as a warning. Under `processCaptureStrict: 'on'`, a gap **fails** `ana work complete` (exit 1) before the proof chain is written. Default/absent/off → warn only. Loud, never silent.

**Why tie to saved reports, not phases or cycles:** report files are the durable on-disk record of how many build/verify sessions legitimately happened (including rework like `build_report_2_r1.md`). Counting them gives the exact expected session count without parsing session ids or false-failing reruns — and it degrades correctly for multi-phase items (each phase contributes its own numbered reports).

**Strict gate** mirrors the existing `processCapture` / `captureGate` enums exactly: a top-level `ana.json` field `processCaptureStrict: 'on' | 'off'`, `.optional().catch(undefined)`, emitted `'off'` by `createAnaJson`, preserved across re-init by riding `...parsed.data` (it must NOT be added to `preserveUserState`'s mechanical-override list).

## Output Mockups

**`ana proof {slug}` Provenance section — complete (no gaps):**
```
  Provenance
  ──────────
  claude · plan · opus-4      18 turns · 22 tools · in 0.9k/out 3.1k · est. $0.34
  claude · build · opus-4     31 turns · 58 tools · in 1.4k/out 6.2k · est. $0.71
  codex · verify · gpt-5      24 turns · 19 tools · in 2.1k/out 4.0k · est. $0.22
  total   3 sessions · est. $1.27 (table 2026-06-01)
  churn   6 files · +412/−88
  completeness  ✓ complete (plan 1/1 · build 1/1 · verify 1/1)
```

**`ana proof {slug}` Provenance section — gap (warn mode):**
```
  total   2 sessions · est. $1.05 (table 2026-06-01)
  completeness  ⚠ incomplete — verify 0/1 (verify provenance missing for this item)
```

**`ana work complete {slug}` under `processCaptureStrict: 'on'` with a gap:**
```
Error: Process provenance is incomplete and processCaptureStrict is on.
  - verify: 0 of 1 expected session(s) present
A complete cross-machine proof requires every role's provenance to be committed.
Re-run the missing role through `ana run`, or set processCaptureStrict to off to allow a warned gap.
```
(exit 1; the proof chain entry is NOT written.)

**`ana work complete` under default (warn) with the same gap:**
```
Warning: Process provenance is incomplete — verify 0/1. Recorded in the proof's completeness block.
```
(exit 0; the proof entry is written WITH the gap recorded.)

## File Changes

### packages/cli/src/types/proof.ts (modify)
**What changes:** Add a `completeness` record to `ProcessAttestation`:
```ts
completeness: {
  complete: boolean;
  expected: { plan: number; build: number; verify: number };
  present: { plan: number; build: number; verify: number };
  gaps: string[]; // human-readable, e.g. "verify: 0 of 1 expected session(s) present"
};
```
Place it after `module_churn`, before `sessions`. Update the JSDoc. (No `cost_usd` change needed — Phase 1 already removed it from `ProvenanceCounts`, which `SessionProvenance.derived` references.)
**Pattern to follow:** The existing optional-but-typed sub-records on `ProcessAttestation` (`outcome`, `task_shape`). `completeness` is required on the attestation (always computed when capture is on).
**Why:** The completeness verdict must be a durable, machine-readable part of the proof — not just a terminal warning that scrolls away (Verified-over-trusted).

### packages/cli/src/commands/work-proof.ts (modify)
**What changes:**
- In `assembleProcessAttestation`, after collecting `sessions[]` from committed files, compute `completeness`:
  - `expected.plan = 1`.
  - `expected.build` = count of `build_report*.md` files in `completed/{slug}/` (glob `build_report*.md`; include rework files like `build_report_2_r1.md`).
  - `expected.verify` = count of `verify_report*.md` files.
  - `present.{role}` = number of `sessions` with that `role`.
  - `gaps` = one string per bucket where `present < expected` (plan/build/verify). `ana`/`learn` sessions are counted in the dataset but never produce an expected/gap.
  - `complete = gaps.length === 0`.
  - Attach `completeness` to the returned attestation. Continue to return the attestation (never `null`) whenever capture is on — including when `sessions` is empty (then all buckets gap → maximally loud).
- Add an exported helper `isProcessCaptureStrictEnabled(projectRoot: string): boolean` mirroring `isProcessCaptureEnabled` (reads `ana.json`, returns `anaJson['processCaptureStrict'] === 'on'`, total/never-throw). Co-locate it with `isProcessCaptureEnabled` (it lives in `forensics.ts` — add it there and import it here) for one source of truth on gate reads.
**Pattern to follow:** `isProcessCaptureEnabled` (forensics.ts:226–235) for the new gate read. The existing report-file discovery the pipeline already does — mirror how `work.ts` locates `build_report`/`verify_report` files (the `ana artifact save` type list and `work complete`'s missing-report checks reference these names; use `globSync('build_report*.md', { cwd: completedSlugDir })`).
**Why:** Completeness must be computed where the sessions are assembled and the reports are on disk, so the verdict is a pure function of committed state (AC8 determinism, AC2 machine-independence).

### packages/cli/src/commands/work-proof.ts — `writeProofChain` (modify)
**What changes:** After `assembleProcessAttestation` returns (the existing call ~line 331), if the attestation exists and `completeness.complete === false`:
- If `isProcessCaptureStrictEnabled(projectRoot)`: print the red strict-mode error (see mockup), listing each gap, and `process.exit(1)` **before** the proof entry is constructed/written — completion is blocked.
- Else: print the yellow warning (see mockup) and continue; the entry is written with `process.completeness` carrying the gaps.
Place this beside the existing `guardFailResult` / `UNKNOWN`-warning block (work-proof.ts:305–316) so all completion guards live together.
**Pattern to follow:** `guardFailResult` (work-proof.ts:209–217) — the same `chalk.red` + `process.exit(1)` command-layer convention for the strict path; `chalk.yellow` + continue for the warn path (mirrors the UNKNOWN warning at 310–315).
**Why:** Strict mode is the mechanical enforcement of completeness — a prompt can't guarantee a team notices a warning, but `exit 1` blocks the merge (Verified-over-trusted, Hooks-enforce-what-prompts-can't).

### packages/cli/src/commands/init/anaJsonSchema.ts (modify)
**What changes:** Add `processCaptureStrict` to the schema as a sibling of `processCapture`:
```ts
processCaptureStrict: z
  .enum(['on', 'off'])
  .optional()
  .catch(undefined),
```
Place it immediately after the `processCapture` field (anaJsonSchema.ts:112–115). Mirror the comment posture: no `.default` — absent stays `undefined` and reads as off; the default-off is emitted by `createAnaJson`, and absence survives re-init untouched.
**Pattern to follow:** The `processCapture` field definition (anaJsonSchema.ts:112–115) verbatim, renamed.
**Why:** The opt-in must be a typed, migration-safe `ana.json` field that survives re-init like its sibling gates.

### packages/cli/src/commands/init/state.ts (modify)
**What changes:** In `createAnaJson` (the object built ~state.ts:560–580), add `processCaptureStrict: 'off'` immediately after the `processCapture: 'off'` line, with a comment mirroring the captureGate/processCapture posture (default-off; survives re-init via `...parsed.data`; excluded from the mechanical-override list in `preserveUserState`). **Do NOT** add `processCaptureStrict` to `preserveUserState`'s mechanical-override list — leaving it out is what preserves a user's explicit on/off across re-init (same treatment the comment at state.ts:570–578 describes for `processCapture`/`captureGate`).
**Pattern to follow:** The `processCapture: 'off'` emission and its surrounding comment (state.ts:574–578).
**Why:** New installs default to warn (off); a team that turns strict on keeps it across re-init.

### packages/cli/src/commands/proof.ts (modify)
**What changes:** Finalize the Provenance display (Phase 1 left a minimal `computeCost` patch at lines 454/469):
- Compute each session's cost via `computeCost(s.derived.tokens, s.derived.model)` and the combined total the same way (this supersedes the Phase-1 stopgap — keep it `computeCost`-based).
- Add a `completeness` line at the end of the Provenance block: `✓ complete (plan p/e · build p/e · verify p/e)` when `complete`, else `⚠ incomplete — {gap summary}`. Read it from `entry.process.completeness`. Display-only — NEVER influences PASS/FAIL (the block is already guarded by `if (entry.process)`).
**Pattern to follow:** The Provenance display block (proof.ts:435–486) and its `chalk.gray`/`chalk.bold` styling.
**Why:** A founder reading the proof sees whether the cross-machine record is complete at a glance — the headline value of this rework.

## Acceptance Criteria

- [ ] `ProcessAttestation.completeness` exists with `complete`/`expected`/`present`/`gaps`; it is populated whenever capture is on (including zero-session case).
- [ ] `expected.build`/`expected.verify` equal the count of saved `build_report*.md`/`verify_report*.md` files; `expected.plan` is 1; `ana`/`learn` roles never create an expected/gap.
- [ ] A correct multi-phase + rejection-cycle pipeline (multiple numbered/rework reports, each with a session) reports `complete: true` — no false-fail.
- [ ] A run missing a role's provenance reports `complete: false` with a gap string for that bucket.
- [ ] With `processCaptureStrict: 'on'` and a gap, `ana work complete` prints the red error, exits 1, and does NOT write the proof chain entry.
- [ ] With strict off/absent and a gap, `ana work complete` prints the yellow warning, exits 0, and writes the entry with `process.completeness` recording the gap.
- [ ] `processCaptureStrict` is a valid `ana.json` enum; `createAnaJson` emits `'off'`; an explicit `'on'`/`'off'` survives `ana init` re-run unchanged.
- [ ] `ana proof {slug}` shows session cost computed at display (no committed `cost_usd`) and a completeness line; the block never affects the PASS/FAIL result.
- [ ] A cross-machine fixture (provenance files authored as if from different machines, no shared home state) assembles a complete `process` block.
- [ ] A squash/rebase-merge fixture preserves all distinct per-session provenance files (union, no loss).
- [ ] `pnpm run build` succeeds; `pnpm vitest run` passes with test count not decreased below the Phase-1 total.

## Testing Strategy

- **Unit (`tests/commands/work-proof-process.test.ts`):** extend the Phase-1 committed-file tests with completeness. Seed `completed/{slug}/` with N `build_report*.md` + M `verify_report*.md` + provenance files, assert `expected`/`present`/`gaps`/`complete`. Cover: all present → complete; missing verify → gap; rework reports (`build_report_2_r1.md`) with matching build sessions → complete (no false-fail); `ana`/`learn` sessions present but never required. Assert specific counts (`expected.build` `toBe(2)`, not `toBeGreaterThan`).
- **Unit — strict enforcement:** drive `writeProofChain` (or the `work complete` flow) with a gap and `processCaptureStrict: 'on'` → asserts process exit 1 and no chain write; with strict off → asserts exit 0, entry written, `process.completeness.complete === false`. Mock only `process.exit` (or assert via a thrown sentinel) per the existing `guardFailResult` test pattern.
- **Unit — schema/state (`tests/commands/init/*.test.ts`):** `processCaptureStrict` parses to `'on'`/`'off'`/`undefined`; `createAnaJson` emits `'off'`; a re-init preserving an existing `'on'` keeps it (mirror the existing `processCapture`/`captureGate` preservation test).
- **Unit — display (`tests/commands/proof*.test.ts`):** a proof entry with `process` shows cost via `computeCost` and the completeness line; complete vs incomplete render the right marker; the result line is unaffected by an incomplete block.
- **Fixtures (AC2/AC6):**
  - **Cross-machine:** author provenance files for plan/build/verify with distinct `session_id`s and no home buffer present; assemble → complete `process` block. Proves machine-independence.
  - **Squash-merge survival:** simulate a squashed feature branch where all `provenance/*.json` land in the merged tree under distinct filenames; assert the union is intact (no file lost to a merge collision). A merge-commit fixture is not sufficient — squash is the risk case.
- **Edge cases:** zero provenance files + capture on → attestation with all-gaps completeness (loud), not `null`; strict on + complete → exit 0; an `ana`/`learn`-only dataset (no plan/build/verify) → gaps for plan/build/verify, `ana`/`learn` ignored.

## Dependencies

Phase 1 merged: committed `provenance/*.json` written at save, `assembleProcessAttestation` reading them, `ProvenanceCounts` without `cost_usd`, `recordBelongsToWorktree` deleted.

## Constraints

- Completeness is a pure function of committed state (report files + provenance files) — no clock, no home state, no transcript re-read (AC8 determinism, AC2 machine-independence).
- The `process` block and its completeness NEVER influence PASS/FAIL — provenance only, never the rule engine.
- Strict failure must happen BEFORE the proof entry is written, so a blocked completion leaves no partial entry.
- `processCaptureStrict` must survive re-init (preserved via `...parsed.data`, not in the mechanical-override list).
- Test count must not decrease.

## Gotchas

- **Report-count, not `rejection_cycles`:** `proof.rejection_cycles` is summed across phases and would false-fail legitimate rework. Count saved `*_report*.md` files instead — that is the explicit scope decision (AC8).
- **Sessions have no phase tag:** the committed files are a flat set (`{role}-{session_id}.json`, no phase in the name). Completeness is presence-by-role against report counts, NOT per-phase session-id parsing. Do not try to bind a session to a specific phase.
- **Zero sessions must be loud, not null:** the Phase-1 assembly already returns a non-null attestation with `sessions: []` when capture is on. Keep that — computing completeness over an empty set yields all-gaps, which is the intended loud signal. Returning `null` here would re-introduce the silent-incompleteness this whole rework removes.
- **Strict gate read is total:** `isProcessCaptureStrictEnabled` must never throw on a malformed `ana.json` — return `false` (warn) so a broken config never blocks completion unexpectedly. Mirror `isProcessCaptureEnabled` exactly.
- **`completeness` is a CROSS-CUTTING proof field:** per the `ProofChainEntry` note (proof.ts type header), adding it touches the type, the assembler (work-proof.ts), and the display (proof.ts). All three are in this spec — don't miss the display.

## Build Brief

### Rules That Apply
- `.js` on all relative imports; `node:` on built-ins; `import type` separate from value imports; named exports; explicit return types + `@param`/`@returns` on exported functions.
- Command-layer error convention: `chalk.red` + `process.exit(1)` for the strict block; `chalk.yellow` + continue for the warn path (matches `guardFailResult` / the UNKNOWN warning).
- Gate reads are total/never-throw — malformed `ana.json` → `false`.
- Tests: assert exact counts (`toBe`), not range matchers; cover the gap (error) path alongside the complete (happy) path; force `git init -b main` in any repo fixture; build before spawning `dist`.

### Pattern Extracts

Total gate read to mirror for `isProcessCaptureStrictEnabled` (forensics.ts:226–235):
```ts
export function isProcessCaptureEnabled(projectRoot: string): boolean {
  let anaJson: Record<string, unknown>;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(projectRoot, '.ana', 'ana.json'), 'utf-8')) as unknown;
    anaJson = AnaJsonSchema.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }
  return anaJson['processCapture'] === 'on';
}
```

Completion guard to place the strict/warn block beside (work-proof.ts:305–316):
```ts
  // FAIL result guard — block proof chain entry for failed verification
  guardFailResult(proof.result);

  // UNKNOWN result warning (AC12)
  const completedPlanDir = path.join(anaDir, 'plans', 'completed', slug);
  if (proof.result === 'UNKNOWN') {
    const verifyReportPath = path.join(completedPlanDir, 'verify_report.md');
    if (fs.existsSync(verifyReportPath)) {
      console.error(chalk.yellow(`Warning: Entry '${slug}' has result UNKNOWN but a verify report exists. ...`));
    }
  }
```

Schema field to mirror (anaJsonSchema.ts:112–115):
```ts
    processCapture: z
      .enum(['on', 'off'])
      .optional()
      .catch(undefined),
```

Provenance display block to extend (proof.ts:435–486) — add the completeness line at the end, keep it inside `if (entry.process)`.

### Proof Context
Run `ana proof context src/commands/work-proof.ts src/commands/proof.ts src/types/proof.ts src/commands/init/anaJsonSchema.ts src/commands/init/state.ts`. Curate the top findings into the build report. The structural analog `session-capture` `verify_report_2_r1.md` documents the original `recordBelongsToWorktree` collision that Phase 1 removed — context for why completeness is now report-count-based, not path-match-based. If `ana proof context` returns no active findings for these files, state so.

### Checkpoint Commands
- After work-proof.ts: `(cd packages/cli && pnpm run build && pnpm vitest run tests/commands/work-proof-process.test.ts)` — Expected: completeness + strict tests pass.
- After schema/state: `(cd packages/cli && pnpm vitest run tests/commands/init)` — Expected: pass.
- After proof.ts: `(cd packages/cli && pnpm run build && pnpm vitest run tests/commands/proof*.test.ts)` — Expected: pass.
- After all changes: `pnpm run test -- --run` — Expected: full suite green, count ≥ Phase-1 total.
- Lint: `pnpm run lint`.

### Build Baseline
Run `pnpm run test -- --run` at the start of this phase (after Phase 1 merged) and record the exact count — Phase 1 raised it above 3528. After build: expect that count + the new completeness/strict/schema/display/fixture tests; **no decrease**. Regression focus: `tests/commands/work-proof-process.test.ts`, `tests/commands/proof*.test.ts`, `tests/commands/init/*` (schema parse), `tests/commands/work*.test.ts` (the new `work complete` strict-exit path).
