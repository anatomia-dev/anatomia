# Build Report: Cross-machine provenance — Phase 2 (completeness + enforcement + display)

**Created by:** AnaBuild
**Date:** 2026-06-08
**Spec:** .ana/plans/active/cross-machine-provenance/spec-2.md
**Branch:** feature/cross-machine-provenance

## What Was Built

- **packages/cli/src/types/proof.ts** (modified): Added the required `completeness` record to `ProcessAttestation` (`complete` / `expected{plan,build,verify}` / `present{plan,build,verify}` / `gaps[]`), placed after `module_churn`, before `sessions`, with JSDoc explaining the report-count-tied, never-gating contract.
- **packages/cli/src/utils/forensics.ts** (modified): Added exported `isProcessCaptureStrictEnabled(projectRoot)`, mirroring `isProcessCaptureEnabled` exactly — total/never-throw, returns `true` only when `processCaptureStrict === 'on'`.
- **packages/cli/src/commands/work-proof.ts** (modified): Added exported pure helper `computeCompleteness(reportsDir, sessions)` — the single source of truth for the verdict; `expected.plan=1`, `expected.build/verify` from `globSync('build_report*.md' / 'verify_report*.md')`, `present` counted from sessions by role, `ana`/`learn` never required. Wired it into `assembleProcessAttestation` (attaches `completeness`, reading the completed slug dir). Added the **warn path** in `writeProofChain`: when the attestation is incomplete, print a yellow warning and continue (the gap is recorded in the entry).
- **packages/cli/src/commands/work.ts** (modified): Added the **early strict guard** in `completeWork`, placed after the report-presence checks and immediately before `// 8c.` (i.e. before `removeWorktree`/`cp active→completed`). When `processCaptureStrict` is on and the verdict (computed from `active/{slug}/` provenance + reports) is incomplete, it prints the red error listing each gap and `process.exit(1)` — leaving `active/` and the worktree fully intact so the re-run is an ordinary completion.
- **packages/cli/src/commands/init/anaJsonSchema.ts** (modified): Added `processCaptureStrict: z.enum(['on','off']).optional().catch(undefined)` immediately after `processCapture`, with the same migration-safe comment posture (no `.default`).
- **packages/cli/src/commands/init/state.ts** (modified): `createAnaJson` now emits `processCaptureStrict: 'off'` after `processCapture: 'off'`. Deliberately NOT added to `preserveUserState`'s mechanical-override list, so an explicit on/off survives re-init via `...parsed.data`.
- **packages/cli/src/commands/proof.ts** (modified): Added the completeness line at the end of the Provenance block (inside `if (entry.process)`), optional-guarded on `p.completeness`: `✓ complete (plan p/e · build p/e · verify p/e)` or `⚠ incomplete — …`. Display-only; never influences PASS/FAIL. (Cost-at-display was already `computeCost`-based from Phase 1 — left as-is.)
- **packages/cli/tests/commands/work-proof-process.test.ts** (modified): +13 tests — completeness via `assembleProcessAttestation`, pure `computeCompleteness`, cross-machine fixture, squash-merge survival fixture.
- **packages/cli/tests/commands/work.test.ts** (modified): +3 tests — strict block (exit 1 / no entry / active intact), strict-off recovery re-run via ordinary path, strict-on-but-complete completes.
- **packages/cli/tests/commands/init/anaJsonSchema.test.ts** (modified): +4 tests — `processCaptureStrict` enum parse on/off/invalid/absent.
- **packages/cli/tests/commands/init.test.ts** (modified): +2 tests — `createAnaJson` emits `off`; re-init preserves explicit `on`.
- **packages/cli/tests/commands/proof.test.ts** (modified): +4 tests — cost estimate rendered, complete/incomplete completeness lines, incomplete block never changes PASS.

## PR Summary

- Adds a presence-floor **completeness verdict** to process provenance: `expected` is tied to the count of saved `build_report*.md`/`verify_report*.md` files (never `rejection_cycles`), `present` is counted from committed per-session provenance, and any shortfall is a named gap. `ana`/`learn` roles are never required.
- Introduces an opt-in **`processCaptureStrict`** gate. Default-off (warn-and-record); when on, an incomplete proof blocks `ana work complete` with exit 1.
- The strict guard runs **before any archival step** (`removeWorktree`/`cp`), so a block leaves the work item fully intact and cleanly re-runnable — avoiding the crash-recovery branch that would silently drop the proof entry.
- One shared pure helper (`computeCompleteness`) drives both the early strict block and the recorded warn-path verdict, so they can never disagree.
- Surfaces completeness on `ana proof {slug}` (display-only, never gates PASS/FAIL) and proves machine-independence + squash-merge survival with fixtures.

## Acceptance Criteria Coverage

- AC1 "`ProcessAttestation.completeness` exists, populated when capture on (incl. zero-session)" → work-proof-process.test.ts "reads complete when…", "zero provenance files + capture on → all-gaps" (A022, plus zero-session case)
- AC2 "expected.build/verify = saved report count; plan=1; ana/learn never gap" → "ties expected.build/verify to the count of saved report files" (A021), "never requires ana/learn" (A026)
- AC3 "multi-phase + rejection-cycle pipeline reports complete (no false-fail)" → "does not false-fail legitimate rework" (A025)
- AC4 "missing role's provenance → complete:false with gap string" → "reads incomplete and names the missing verify role" (A023, A024)
- AC5 "strict + gap → red error, exit 1, NO entry, active/ + worktree intact" → work.test.ts "blocks completion with exit 1…" (A027, A028, A045)
- AC6 "after strict block, flip off + re-run → ordinary path, entry with completeness.complete===false, NOT crash-recovery" → work.test.ts "after a strict block, flipping strict off…" (A029, A030, A046)
- AC7 "computeCompleteness pure, shared by guard (active/) and assembler (completed/), same verdict" → computeCompleteness pure-helper describe; guard + assembler both call it
- AC8 "strict off/absent + gap → yellow warning, exit 0, entry records gap" → work.test.ts recovery test (A029/A030); warn path in writeProofChain
- AC9 "processCaptureStrict valid enum; createAnaJson emits off; explicit value survives re-init" → anaJsonSchema.test.ts (A031), init.test.ts (A032, A033)
- AC10 "ana proof shows cost-at-display + completeness line; never affects PASS/FAIL" → proof.test.ts (A034, A035)
- AC11 "cross-machine fixture assembles complete process block" → work-proof-process.test.ts cross-machine fixture (A036)
- AC12 "squash/rebase-merge fixture preserves all distinct provenance files (union)" → squash-merge survival fixture (A037)
- AC13 "build succeeds; vitest passes; count not decreased below Phase-1 total" → sealed run below (3566 passed vs 3540 baseline)

## Implementation Decisions

- **Strict guard placement**: inserted as `// 8b-strict.` immediately before `// 8c. Capture worktree metadata` (work.ts), after the report-presence checks and before `removeWorktree`/`cp`, exactly per the spec's verified-recovery reasoning. The guard reads provenance from `active/{slug}/provenance/` with a small inline reader mirroring `assembleProcessAttestation`'s tolerant parse (skips unparseable files, treats a missing dir as zero sessions → all-gaps → block, which is the intended loud behavior).
- **Warn message format**: `Warning: Process provenance is incomplete — {gaps joined by '; '}. Recorded in the proof's completeness block.` — placed beside the existing UNKNOWN/guard messages in `writeProofChain`, matching the `chalk.yellow`+continue convention.
- **Display line shows all three buckets** (`plan p/e · build p/e · verify p/e`) for both complete and incomplete states rather than only the gapped bucket from the mockup — strictly more informative and the gap is still visible via the `0/1` counts. No contract assertion constrains the exact text.

## Deviations from Contract

### Signature of `computeCompleteness` — dropped the vestigial `provenanceDir` parameter
**Instead:** Implemented `computeCompleteness(reportsDir: string, sessions: SessionProvenance[])` rather than the spec's stated `computeCompleteness(provenanceDir, reportsDir, sessions)`.
**Reason:** Spec line 90 defines `present.{role}` as "the number of `sessions` with that role" — so `present` is derived entirely from the passed `sessions`, and `provenanceDir` is never read inside the helper. Keeping it would ship an unused parameter. `sessions` is the better source: it is the exact array attached to the attestation, guaranteeing `present` and the recorded `sessions` can never diverge. The spec's only hard requirement — "takes the dir as an argument so both share one implementation; don't hardcode `completed/`" (gotcha) — refers to the *reports* dir, which IS a parameter (`active/{slug}` for the guard, `completed/{slug}` for the assembler).
**Outcome:** Functionally equivalent and arguably more correct (single source for `present`). The contract does not constrain the signature. Verifier should assess.

No other deviations — the spec was otherwise followed exactly.

## Test Results

### Baseline (before changes — Phase 1 merged)
`pnpm run test -- --run`
Tests: 3540 passed, 0 failed, 2 skipped (3542 total) · 146 files

### After Changes (sealed)
`ana test --stage build --slug cross-machine-provenance`
<!-- ana:capture stage=build slug=cross-machine-provenance counts=3566p/0f/2s verdict=pass sha256=2be18d1bce011a8a9a1dcb0a9f84abf8e7549710efe6ed63cf4a5a06c8c51a22 -->
Tests: 3566 passed, 0 failed, 2 skipped

### Comparison
- Tests added: 26 (13 work-proof-process, 3 work, 6 init, 4 proof)
- Tests removed: 0
- Regressions: none

### New Tests Written
- work-proof-process.test.ts: completeness via assembler (complete / expected-from-reports / missing-verify gap / rework no-false-fail / learn-not-required / zero-sessions all-gaps); pure `computeCompleteness` (expected from globs / complete-floor / named gap / ana-learn-only / missing-reportsDir never-throws); cross-machine fixture (A036); squash-merge survival fixture (A037).
- work.test.ts: strict block exit1/no-entry/active-intact (A027/A028/A045); strict-off recovery re-run via ordinary path records gap (A029/A030/A046); strict-on+complete completes.
- anaJsonSchema.test.ts: processCaptureStrict on/off/invalid/absent (A031).
- init.test.ts: createAnaJson emits off (A032); re-init preserves on (A033).
- proof.test.ts: cost estimate rendered (A034); complete/incomplete lines; incomplete never changes PASS (A035).

### Contract Coverage
19/19 Phase-2 assertions tagged: A021–A037, A045, A046.

## Verification Commands
```
pnpm run build
(cd packages/cli && pnpm vitest run tests/commands/work-proof-process.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/work.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/init tests/commands/init.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/proof.test.ts)
pnpm run test -- --run
pnpm run lint
```

## Git History
```
fde62e2b [cross-machine-provenance:s2] Add cross-machine + squash-merge survival fixtures
c3756d33 [cross-machine-provenance:s2] Show completeness line in proof Provenance block
c4b6837b [cross-machine-provenance:s2] Add processCaptureStrict gate (schema + state default)
47e228ff [cross-machine-provenance:s2] Add strict completeness guard to work complete
50154e8e [cross-machine-provenance:s2] Add completeness verdict + computeCompleteness + warn path
```

## Open Issues

- **`computeCompleteness` signature deviation** (see Deviations): dropped the spec's `provenanceDir` param as it would be unused. Documented; verifier should confirm the call sites (`assembleProcessAttestation`, work.ts guard) and the contract are satisfied. Severity: observation.
- **`ana proof context` findings on touched files** are all pre-existing and unrelated to Phase 2 (`getTemplatesDir()` dev-path fragility from session-capture; surface-path shell sanitization; monorepo command scoping). None introduced or worsened by this build. Severity: observation.
- **Pre-existing lint warning** in `packages/cli/src/utils/git-operations.ts:198` (unused eslint-disable directive) — not my file, not introduced by this build.

Forced second pass — re-examined the diff for unused imports/params, unhandled edge cases, and assumptions about external state: the warn-path and strict-guard both tolerate a missing provenance dir; the display line and entry construction both optional-guard `completeness` for pre-Phase-2 entries; `present` is sourced from the attested `sessions` array (no divergence). Nothing new surfaced beyond the items above. Verified complete by second pass.
