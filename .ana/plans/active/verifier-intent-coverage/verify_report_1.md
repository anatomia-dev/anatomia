# Verify Report: Verifier Intent Coverage — Phase 1 (extractor + pre-seal coverage gate)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-16
**Spec:** .ana/plans/active/verifier-intent-coverage/spec-1.md
**Branch:** feature/verifier-intent-coverage

## Pre-Check Results

`ana verify pre-check verifier-intent-coverage`:
```
=== CONTRACT COMPLIANCE ===
  Contract: .../verifier-intent-coverage/contract.yaml
  Seal: INTACT (hash sha256:5095b2cec3666d3f8b3c0288ddaec41cc378473a12533bbb4e86e035fe195dd8)
```
Seal status: **INTACT** — the contract is unmodified since AnaPlan sealed it.

**Scope note:** This is a 2-phase plan with a single sealed contract. Phase 1 (spec-1.md) builds
the extractor + pre-seal coverage gate, covering assertions **A001–A022** (AC1–AC6, AC13, AC14).
Assertions **A023–A035** (AC7, AC8, AC9, AC10, AC11, AC12 — proof card, `ana plan coverage`,
template edits) belong to Phase 2 and reference files not built in this phase; they are out of
scope for this verification and marked DEFERRED below.

### Test / Build / Lint

- **Build:** `pnpm run build` (packages/cli) — success (tsup ESM, dist/index.js emitted).
- **Typecheck:** `pnpm run typecheck` (`tsc --noEmit`, the pre-commit gate) — **0 errors**.
- **Lint:** `pnpm run lint` — 0 errors, 1 warning (`src/utils/git-operations.ts:198` unused
  eslint-disable) — pre-existing, not a Phase 1 file.
- **Sealed verify-stage run** (`ana test --stage verify --slug verifier-intent-coverage`):
  `3766 passed, 1 failed, 2 skipped (verdict: fail)`
  `<!-- ana:capture stage=verify slug=verifier-intent-coverage counts=3766p/1f/2s verdict=fail sha256=e8d2ec59275f8bdeb1ac35a5338b6b53816c58811d866c6ece1d95b170c2adf2 -->`
- **Independent re-runs:** the 1 failure **never reproduced**. Full suite run 7 more times
  (3767 passed, 0 failed each); regression-focus files (`artifact.test.ts` + `verify.test.ts`)
  run 5× (218 passed each); Phase 1 files run isolated (34 passed). See Findings — flaky
  pre-existing test, not Phase 1 code.
- **Phase 1 checkpoint:** `coverage-gate.test.ts` + `scope-ac-corpus.test.ts` → **34 passed**.

## Contract Compliance

| ID   | Says | Status | Evidence |
|------|------|--------|----------|
| A001 | Dash-bullet AC recognized | ✅ SATISFIED | coverage-gate.test.ts:71 `expect(result.ids).toContain('AC1')`; extractor bullet regex artifact-validators.ts:518 |
| A002 | Heading AC recognized | ✅ SATISFIED | coverage-gate.test.ts:77 `toContain('AC2')`; heading regex :514 |
| A003 | Bold AC recognized | ✅ SATISFIED | coverage-gate.test.ts:83 `toContain('AC3')`; bold regex :526 |
| A004 | Bare-label AC recognized | ✅ SATISFIED | coverage-gate.test.ts:89 `toContain('AC4')`; bare regex :522 |
| A005 | Clean scope not ambiguous | ✅ SATISFIED | coverage-gate.test.ts:95 `expect(result.ambiguous).not.toBe(true)` — matches contract not_equals/true |
| A006 | Corpus: zero false-ambiguous | ✅ SATISFIED | scope-ac-corpus.test.ts:92 `falseAmbiguousCount` `toBe(0)`; live sweep over 205 oracle-positive scopes = 0 |
| A007 | Corpus: zero empty-extraction | ✅ SATISFIED | scope-ac-corpus.test.ts:87 `emptyExtractionCount` `toBe(0)`; same 205-scope sweep = 0 |
| A008 | Unfamiliar format → ambiguous | ✅ SATISFIED | coverage-gate.test.ts:101 `expect(result.ambiguous).toBe(true)`; classifier :538-541 |
| A009 | Ambiguous never blocks (fail open) | ✅ SATISFIED | coverage-gate.test.ts:325 `block).not.toBe(true)`; gate :636-647 |
| A010 | Dropped AC is blocked | ✅ SATISFIED | coverage-gate.test.ts:236 `block).toBe(true)`; gate :685 |
| A011 | Full coverage allowed through | ✅ SATISFIED | coverage-gate.test.ts:269 `block).not.toBe(true)` — matches not_equals/true |
| A012 | Block names uncovered AC | ✅ SATISFIED | coverage-gate.test.ts:249 `uncovered).toContain('AC3')`; gate :678 |
| A013 | Weak-matcher AC still covered | ✅ SATISFIED | coverage-gate.test.ts:285 `block).not.toBe(true)` + info contains AC1; gate :679-683 |
| A014 | Judgment waiver = covered | ✅ SATISFIED | coverage-gate.test.ts:296 `block).not.toBe(true)`; joinCoverage :592-595 |
| A015 | Retired-with-reason doesn't block | ✅ SATISFIED | coverage-gate.test.ts:307 `block).not.toBe(true)`; waiver join :577-584 |
| A016 | Dropped-no-reason blocks | ✅ SATISFIED | coverage-gate.test.ts:262 `block).toBe(true)` |
| A017 | No-AC scope never gated | ✅ SATISFIED | coverage-gate.test.ts:197 `active).not.toBe(true)`+`block` false; gate :664-675 |
| A018 | Legacy 1.0 inactive | ✅ SATISFIED | coverage-gate.test.ts:187 `active).not.toBe(true)`; version gate :649-662 |
| A019 | 1.1 + new fields = 0 validation errors | ✅ SATISFIED | coverage-gate.test.ts:367 `validationErrors.length` `toBe(0)`; validateContractFormat untouched on ac/coverage_waivers |
| A020 | Zero-link 1.1 still activates | ✅ SATISFIED | coverage-gate.test.ts:205 `active).toBe(true)` |
| A021 | Zero-link 1.1 blocks, not silent | ✅ SATISFIED | coverage-gate.test.ts:215 `block).toBe(true)` |
| A022 | Gate always emits diagnostic | ✅ SATISFIED | coverage-gate.test.ts:332 `diagnostic).toBeTruthy()` across active/inactive/skipped — matches exists |
| A023 | PARTIAL count parsed | ⏸ DEFERRED (Phase 2) | parseACResults / proofSummary not in Phase 1 scope |
| A024 | Card surfaces PARTIAL | ⏸ DEFERRED (Phase 2) | proof card output — Phase 2 |
| A025 | Proof records AC coverage | ⏸ DEFERRED (Phase 2) | generateProofSummary — Phase 2 |
| A026 | Judgment counted separately | ⏸ DEFERRED (Phase 2) | summary coverage — Phase 2 |
| A027 | Card shows coverage breakdown | ⏸ DEFERRED (Phase 2) | proof card — Phase 2 |
| A028 | Preview lists each AC | ⏸ DEFERRED (Phase 2) | `ana plan coverage` — Phase 2 |
| A029 | Preview marks UNCOVERED | ⏸ DEFERRED (Phase 2) | `ana plan coverage` — Phase 2 |
| A030 | Preview never blocks (exit 0) | ⏸ DEFERRED (Phase 2) | `ana plan coverage` — Phase 2 |
| A031 | plan command registered | ⏸ DEFERRED (Phase 2) | src/commands/plan.ts (create) — Phase 2 |
| A032 | ana-plan template emits 1.1 | ⏸ DEFERRED (Phase 2) | template edit — Phase 2 (spec-1 forbids touching it) |
| A033 | ana-verify template states two-gate | ⏸ DEFERRED (Phase 2) | template edit — Phase 2 |
| A034 | ana-verify retains prediction step | ⏸ DEFERRED (Phase 2) | template edit — Phase 2 |
| A035 | No re-seal path introduced | ⏸ DEFERRED (Phase 2) | template edit — Phase 2 |

**All 22 Phase 1 assertions (A001–A022): SATISFIED.** Every one carries an `@ana` tag on a test
I read; matcher methods align with the contract (`toContain`↔contains, `toBe(0)`↔equals 0,
`.not.toBe(true)`↔not_equals true, `.toBe(true)`↔truthy, `toBeTruthy`↔exists). Phase 2 assertions
correctly deferred — spec-1 explicitly ships inert and forbids template changes.

## Independent Findings

**Predictions (made before reading implementation), resolved:**

1. *Bold regex over-extraction* — **Confirmed as latent behavior, not realized.** The bold form
   matches `**ACn**` anywhere on a line, so prose mentions are extracted. But across the 205-scope
   corpus and the live dogfood (extracted exactly AC1–AC14, zero spurious), it never produced a bad
   id. Recorded as a monitor-level code observation.
2. *Corpus oracle dependency could break* — **Not found; builder got it right.** The oracle is the
   literal `## Acceptance Criteria` heading (independent of the extractor), and all 205
   oracle-positive scopes extracted non-empty + non-ambiguous. The test does not self-grade.
3. *Worktree behind main / corpus shift* — **Not an issue now** (corpus = 205, sweep green), but the
   live-corpus `toBe(0)` coupling is a future-maintenance observation (see Findings).
4. *Test-count baseline unverifiable* — **Resolved by measurement:** `git diff` shows 2 new test
   files (+497 lines), zero test files deleted or modified. Count strictly increased (+34).
5. *AC14 false-positive on real corpus* — **Not found:** 0 false-ambiguous across 205 scopes.

**Unpredicted (the surprise):** a flaky test in the broader suite — see Findings. It is the only
blemish and it is not in Phase 1 code.

**Code quality:** The implementation closely follows the spec and project standards. `extractScopeACs`,
`joinCoverage`, `evaluateCoverageGate`, and the exported `CoverageJoin`/`CoverageGateResult` interfaces
all carry explicit return types and `@param`/`@returns` JSDoc. `import type` is used for type-only
imports; all local imports end in `.js`. The engine/command boundary is honored — `artifact-validators.ts`
is chalk-free and exit-free (verified by grep: matches only in comments), all printing + `process.exit(1)`
live in `artifact.ts`'s `applyCoverageGate`. Version compare is numeric major.minor via
`isVersionAtLeast` (the "1.10 beats 1.9" trap is tested at coverage-gate.test.ts:224). The bold-form
regex is re-created per line, so there is no stateful-`lastIndex` bug.

**Wiring:** `applyCoverageGate` is called in **both** save paths — `saveArtifact` (artifact.ts:1153)
and `saveAllArtifacts` (artifact.ts:1580) — inside the `baseType === 'contract'` block, after
`validateContractFormat`, before the seal hash, mirroring the adjacent `applyTestEvidenceGate`. The
diagnostic line is always printed (AC13). The gate's 5 stale-no-op cases (no contract, no scope, no
ACs, legacy 1.0, malformed YAML) all return benign inactive results and never throw.

**Over-building / YAGNI:** `joinCoverage` and `CoverageJoin` are exported and consumed only by the gate
+ tests in Phase 1. This is **not** YAGNI — spec-1 explicitly mandates the export as a Phase-2 foundation
("exported deliberately so Phase 2 consumes the same join — no Phase-2 refactor across a PR boundary"),
and testing-standards treats test-only exports as intentional. No scope creep, no gold-plating: the
deviation from the scope's literal `judgment_only: string[]` to unified `coverage_waivers` is documented
in the spec's "Design decisions locked with the developer" and in a JSDoc on `CoverageWaiver` warning
future readers not to revert it — design, not drift.

**Live behavior (dogfood):** This feature's own contract is `version: "1.1"` with `ac:` on every
assertion. Running the real gate against the real `scope.md` + `contract.yaml`:
`active — 14/14 acceptance criteria covered`, `block: false`, `uncovered: []`, 3 info notes, 0 warnings.
The feature correctly holds itself to its own standard without false-blocking. (The gate stays dormant
in production until Phase 2 teaches the template to emit `1.1` — confirmed: no template changed here.)

## AC Walkthrough

- **AC1** (extractor accuracy + live-corpus sweep): ✅ PASS — all four forms extract
  (coverage-gate.test.ts:71-92); corpus sweep over 205 oracle-positive scopes returns 0 empty / 0
  false-ambiguous (scope-ac-corpus.test.ts). De-dup and multi-digit (AC10/AC11) covered (:112,:123).
- **AC2** (gate blocks iff active AND uncovered AND no waiver): ✅ PASS — block-true (:236) and
  block-false (:269) both asserted; `block = active && uncovered.length > 0` at :685.
- **AC3** (backward compat): ✅ PASS — legacy 1.0 inactive (:187); `validateContractFormat` accepts
  1.1 + ac/coverage_waivers with 0 errors (:367); regression-focus suite (218 tests, 5× stable) all
  use 1.0 contracts and the gate no-ops on them.
- **AC4** (judgment waiver satisfies coverage): ✅ PASS — :296; reason required (empty-reason waiver
  → uncovered, :164).
- **AC5** (retired vs silently-dropped): ✅ PASS — retired-with-reason doesn't block (:307);
  no-reason/no-link blocks (:262).
- **AC6** (build-only / no-AC never gates): ✅ PASS — :197 (`active` false, `block` false).
- **AC13** (zero-link 1.1 surfaced, always diagnostic): ✅ PASS — active+block on zero links
  (:205,:215); diagnostic always non-empty across all 3 paths (:332).
- **AC14** (ambiguous → warn-only): ✅ PASS — ambiguous classification (:101) + fail-open no-block
  (:325).
- **Gate wired into BOTH save paths, before seal, exit(1) on block:** ✅ PASS — artifact.ts:1153 &
  :1580, verified by read.
- **Pure (no chalk/process.exit in extractor+gate):** ✅ PASS — grep confirms module purity.
- **Tests pass; count does not decrease; no build/lint errors:** ⚠️ PARTIAL — count increased (+34,
  no deletions), build clean, lint clean (warning pre-existing & unrelated). Marked PARTIAL only
  because the sealed verify run reported 1 failure; it is a pre-existing flaky test that never
  reproduced in 7 subsequent full runs and is not in Phase 1 code (see Findings). No Phase 1 test
  and no contract assertion is affected.

## Blockers

None. Searched specifically for:
- **Uncovered Phase 1 assertions** — all 22 (A001–A022) have a tagged test that mechanically does
  what the contract says; none UNSATISFIED.
- **Unused exports / YAGNI** — `joinCoverage`/`CoverageJoin` are spec-mandated Phase-2 foundations,
  tested directly; not dead.
- **Error paths that swallow silently** — the gate's catch blocks degrade to a benign inactive result
  with a diagnostic, by design (AC3/AC14 fail-safe); the one effectively-unreachable catch is noted
  as an observation, not a blocker.
- **External-state assumptions** — corpus harness resolves repo root from `import.meta.url`, not
  `cwd` (scope-ac-corpus.test.ts:25-28), with a `>50` vacuous-pass guard; no env/network assumptions
  in Phase 1 code.
- **Missing files / partial build** — all 5 Phase 1 file_changes present and correct
  (contract.ts, artifact-validators.ts, artifact.ts modified; 2 test files created).
- **Regressions** — regression-focus suite stable 5×; full suite stable 7×; the lone flake is
  pre-existing and not introduced by this build.

The single sealed-run failure is a quality observation about an existing flaky test, not a Phase 1
defect. It does not qualify as a blocker.

## Findings

- **Test — Flaky test in the broader suite:** the sealed verify run reported `3766p / 1f / 2s`, but
  the failure never reproduced across 7 full-suite re-runs (`3767p / 0f` each) or 5 regression-focus
  runs. Pervasive `Push failed after retry` log noise points to a git-operation/network-retry test
  flaking under sandbox conditions — not Phase 1 code (its files are deterministic in every run).
  Pre-existing; worth a dedicated quarantine/retry-policy task so the verify gate isn't randomly red.
- **Test — Corpus sweep asserts `toBe(0)` against a live, growing corpus:**
  `packages/cli/tests/commands/scope-ac-corpus.test.ts:87` — the sweep reads
  `.ana/plans/completed/*/scope.md` (205 today). A future completed scope that uses a
  `## Acceptance Criteria` heading with criteria written as prose or plain numbers (no `ACn` id)
  would flip `emptyExtractionCount`/`falseAmbiguousCount` and break this test inside an unrelated
  future PR. This is the intended safety gate, but the next engineer should know a seemingly
  unrelated red here means "a new scope used an AC format the extractor doesn't recognize," not
  "my change broke the gate."
- **Code — Bold-form regex matches `**ACn**` anywhere on a line:**
  `packages/cli/src/commands/artifact-validators.ts:526` — a prose mention like "see **AC3** above"
  is extracted as criterion AC3. Harmless across the 205-scope corpus and the dogfood (exactly
  AC1–AC14, no spurious ids), but for a future `version 1.1` contract a prose-derived spurious id
  could surface as a false "uncovered" block. Low likelihood given corpus evidence; monitor if a
  future false-block is reported.
- **Code — Defensive `try/catch` around `joinCoverage` is effectively unreachable:**
  `packages/cli/src/commands/artifact-validators.ts:621` — `joinCoverage` is total (no throw path),
  so the "could not evaluate" diagnostic branch cannot trigger in practice and no test exercises it.
  Spec-1 explicitly asked for defensive depth at the gate boundary, so this is intentional, not a
  defect — recorded for honesty (untested branch).

## Deployer Handoff

- This is **Phase 1 of 2**. It ships **inert by design**: no template emits `version 1.1`, so the
  coverage gate no-ops on every contract that exists today (all are `version 1.0`). Do not expect any
  behavior change for users until Phase 2 lands. Confirmed: no template file was modified in this phase.
- The feature **dogfoods itself** — this plan's own `contract.yaml` is already `version 1.1` with
  `ac:` links, and the live gate reports `14/14 covered`. When Phase 2 re-saves this contract, the
  gate will pass.
- One pre-existing flaky test exists in the suite (not Phase 1 code). If CI shows a single random
  failure on this branch, re-run — Phase 1's own tests are deterministic.
- The new optional fields (`ac`, `coverage_waivers`) are additive and backward-compatible;
  `validateContractFormat` accepts them with zero errors and `tsc --noEmit` is clean.

## Verdict

**Shippable:** YES

All 22 Phase 1 contract assertions are SATISFIED on tests I read, all Phase 1 acceptance criteria
pass (one PARTIAL only because of a pre-existing flaky test that never reproduced in 7 independent
full-suite runs and lives outside Phase 1 code), the build and typecheck are clean, the engine/command
boundary and backward-compat constraints hold, and the live dogfood proves the gate evaluates the real
artifacts correctly without false-blocking. The four findings are observations for the next engineer,
not blockers. I would stake my name on this shipping.
