# Verify Report: Proof-Context Intelligence — Phase 3 ("Also changes with")

**Result:** FAIL
**Created by:** AnaVerify
**Date:** 2026-06-18
**Spec:** .ana/plans/active/proof-context-intelligence/spec-3.md
**Branch:** feature/proof-context-intelligence

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../proof-context-intelligence/contract.yaml
  Seal: INTACT (hash sha256:10c99c610fde35bfec8bb5edb2c1c60f3436cad702f3a8e52ea33e8ce44e43e0)
```

Seal status: **INTACT** — contract unmodified since sealing.

- **Tests:** 4068 passed, 0 failed, 2 skipped (sealed verify run; verdict pass).
  Marker: `<!-- ana:capture stage=verify slug=proof-context-intelligence counts=4068p/0f/2s verdict=pass sha256=6fa509ddd5500d37af85b2ca4a846b40d43d891bcd24e1966c5136642aa04b7b -->`
- **Build:** `pnpm run build` — exit 0.
- **Lint:** `pnpm run lint` — 0 errors, 1 warning. The warning (`git-operations.ts:198`, unused eslint-disable) is on a file Phase 3 never touched and is present on `main`. Pre-existing, not a regression.

Scope: Phase 3 only ("Also changes with" — proof co-change + day-1 import layer + co-change template guidance). Phase 1 (Shaped by, AC1/AC6/AC9) and Phase 2 (graph at init, A028/A029) were verified independently in verify_report_1 / verify_report_2 and are out of scope here.

## Contract Compliance

All assertions covering Phase 3's acceptance criteria. A028/A029 are Phase 2-owned (verified in verify_report_2).

| ID   | Says | Status | Evidence |
|------|------|--------|----------|
| A009 | shaped_by/also_changes_with proof partners returned | ✅ SATISFIED | proofSummary.test.ts `@ana A009` — asserts `also_changes_with` defined AND `proof_partners` contains PARTNER (beyond `exists`) |
| A010 | output shows "Also changes with" section | ✅ SATISFIED | proof.test.ts `@ana A010` — stdout contains `Also changes with:` + partner; live run confirms |
| A011 | "top N" footer when more partners exist | ✅ SATISFIED | proof.test.ts `@ana A011` — asserts `top 3 of 4` |
| A012 | imported_by layer from graph | ✅ SATISFIED | proofSummary.test.ts `@ana A012` — imported_by contains `run.ts` (beyond `exists`) |
| A013 | import layer renders with no proof history | ✅ SATISFIED | proof.test.ts `@ana A013` (fresh repo) + proofSummary "surfaces day-1 layer … no chain" — proof_partners `[]`, imported_by present |
| A014 | own test file suppressed; flag set | ✅ SATISFIED | proof-history.test.ts + proofSummary.test.ts `@ana A014` — `suppressed_test_partner === true`, partner absent. **See AC3 PARTIAL + Finding 1: holds for aligned path forms, fails for package-relative queries** |
| A015 | render emits one-line suppression note | ✅ SATISFIED | proof.test.ts `@ana A015` — stdout contains `suppressed`; live run emits `(note: same-stem test partner suppressed)` |
| A016 | partner carries a relation flag | ✅ SATISFIED | proof-history.test.ts `@ana A016` — `relation === 'imports'` (beyond `exists`) |
| A017 | absent graph → relation `unknown`, not guessed | ✅ SATISFIED | proof-history.test.ts + proofSummary `@ana A017` — every partner `unknown` with null graph |
| A018 | querying with no graph never crashes | ✅ SATISFIED | proofSummary.test.ts `@ana A017,A018` — `result.query` returned, no throw |
| A019 | under-touched file never a couple → 0 | ✅ SATISFIED | proof-history.test.ts `@ana A019` — `total === 0` when query under MIN_TOUCHES |
| A020 | couple needs ≥2 shared items; coTouchCount>1 | ✅ SATISFIED | proof-history + proofSummary `@ana A020` — `coTouchCount` `toBeGreaterThan(1)` (matches matcher `greater`/1) |
| A021 | one mega-refactor can't manufacture pairs → 0 | ✅ SATISFIED | proof-history.test.ts `@ana A021` — 110-file item, `total === 0` |
| A022 | no chain → Shaped by absent | ✅ SATISFIED | Source inspection: `shapedBy.length>0` gates the field and the render; no-chain → omitted. (Phase-1 owned) |
| A023 | no chain + no graph → Also changes with absent | ✅ SATISFIED | proof.test.ts + proofSummary `@ana A023` — section absent / `also_changes_with` undefined |
| A024 | touch_count still present | ✅ SATISFIED | proofSummary.test.ts `@ana A024` — `touch_count` intact |
| A025 | findings array still present | ✅ SATISFIED | proofSummary.test.ts `@ana A025` — `Array.isArray(findings)` |
| A026 | hot file caps partners at 3 | ✅ SATISFIED | proof.test.ts `@ana A026` — partner lines `=== 3` |
| A027 | hot file render has overflow footer | ✅ SATISFIED | proof.test.ts `@ana A027` — stdout contains `of` (`top 3 of 4`) |
| A030 | scoping agent told to run proof context | ✅ SATISFIED | grep: `ana proof context` present in both ana.md templates; Phase 3 adds blast-radius framing |
| A031 | verify drops "context, not a checklist" hedge | ✅ SATISFIED | grep: 0 occurrences in both ana-verify.md templates |
| A032 | verify reaffirms independent findings | ✅ SATISFIED | diff: "form your findings independently"; agent-proof-context.test.ts `@ana A032` |
| A033 | plan includes co-change in Build Brief | ✅ SATISFIED | diff: ana-plan.md co-change Build Brief paragraph; test `@ana A033` asserts `co-change` + `Build Brief` |
| A034 | codex mirror carries independence framing | ✅ SATISFIED | diff: codex ana-verify.md mirrors; test `@ana A034` asserts `co-change` + `independent` |

**25 of 25 in-scope assertions SATISFIED.** No UNSATISFIED, no DEVIATED.

**However — this verify is FAIL (Gate 2, intent).** Every sealed contract assertion passes mechanically (Gate 1 green), but the AC3 acceptance criterion is not met across plausible invocations: a package-relative query leaks the query's own test file into the co-change list (reproduced live, below). The A014/A015 tagged tests pass only because they use aligned path forms; they are too narrow to exercise the failure. A wall of green assertions is not a pass when the AC walkthrough shows the criterion isn't truly met — so this goes back to Build. The fix is code + a test (the contract is sealed and stays as-is; its narrowness is recorded as an upstream finding).

## Independent Findings

The engine (`proof-history/index.ts`) is genuinely clean: pure, synchronous, zero IO, zero chalk, single typed import of `CodeGraph`. Gates, oversized-item exclusion, trichotomy, and ordering are implemented exactly as the spec's harvested logic prescribes, and the tests assert specific values (`relation === 'imports'`, `coTouchCount === 2`, `total === 0`) rather than mere existence — even the `exists`-matcher assertions flagged "weak" by the coverage map are backed by tests that check concrete values. Lookup structures (node/edge sets) are precomputed once, not per partner. The two-layer dedup and the honest `unknown` state are correctly preserved.

**Prediction resolution:**
1. *Suppression regex edge case* — **CONFIRMED, and deeper than predicted.** The root cause is architectural: pairing/query-matching routes through `fileMatches` (suffix-tolerant), but suppression routes through a second matcher, `normalizeForTestMatch` (prefix-sensitive normalized equality). The spec's gotcha explicitly said *"do not introduce a second matcher."* When the query path form differs from the stored partner form, the query matches partners for pairing yet fails test-counterpart detection — leaking the query's own test file. See Finding 1 (reproduced live).
2. *Dedup basename collision* — **investigated, low risk.** Both layers use full repo-relative paths and `fileMatches` requires suffix containment, so different-directory same-basename files do NOT collide. The one exposure is a legacy bare-basename proof partner (tier-3 rule), which is rare. Recorded as an observation (Finding 3).
3. *`unknown`-group render untested* — **not found.** The A010 test runs with no graph, so partners render under the `unknown` group ("Changed together:") and the test exercises that path. Live run confirms.
4. *Weak `exists`/sentinel tests* — **not found.** A009/A012/A016/A024/A025 tests all assert beyond existence.
5. *Thin template edits* — **not found.** Edits are substantive paragraphs; enforcement tests check two distinct strings each.

**Second sweep (beyond predictions):** I checked the graph-resolution path (`resolveNode`/`resolveQueryNode`) — both correctly fall back to `fileMatches`, so graph node resolution is suffix-tolerant and does NOT share the suppression bug. I checked over-building: all exported constants/types are consumed by the engine, proofSummary, or tests (intentional per testing-standards); no dead code, no unused branches in the new engine. I checked the production risk I flagged (exact node-identity matching) — mitigated by `resolveNode`'s `fileMatches` fallback. The one thing live testing could NOT confirm is the hidden/imports render path, because this worktree has no `code-graph.json` (Finding 4) — it is covered by integration tests that write a synthetic graph.

## AC Walkthrough

- **AC2** ✅ PASS — proof co-touched files listed with co-touch count, capped top 3, "top 3 of N" footer (live: `top 3 of 39`). proof.test.ts A010/A011.
- **AC2b** ✅ PASS — graph-present import layer (imported_by/imports), capped, renders on fresh repo with only the graph. proofSummary "surfaces day-1 layer … no chain" + proof.test.ts A013.
- **AC3** ❌ FAIL — suppression + one-line note work for repo-relative queries (live: `top 3 of 39` + note) but **fail for package-relative queries**: `cd packages/cli && node dist/index.js proof context src/utils/proofSummary.ts` lists the query's own test file `packages/cli/tests/utils/proofSummary.test.ts` as a co-change partner with no suppression note (`top 3 of 40`). "A file's own test file is not listed as something that changes with it" is the AC, and it is violated in a normal CLI invocation. Contract A014/A015 are mechanically SATISFIED but too narrow to catch this. **This is the blocker.** See Finding 1 for the fix direction.
- **AC4** ✅ PASS — `hidden`/`imports`/`unknown` trichotomy, never fabricated; absent graph → `unknown`, no crash. proof-history A016/A017; live no-graph run shows `unknown` group only (honest).
- **AC5** ✅ PASS — MIN_TOUCHES (3) + MIN_COTOUCH (2) gates; oversized items (>40 files) excluded from pairing, touch-counting unaffected. proof-history A019/A020/A021.
- **AC7** ✅ PASS — no chain → Shaped by + proof co-change absent; no chain + no graph → whole section absent; `getProofContext` returns cleanly. A022/A023.
- **AC8** ✅ PASS — `also_changes_with` is optional (`?:`), added via spread only when present; old callers/JSON shape unaffected. A024/A025.
- **AC10** ✅ PASS — hot file caps at 3 with overflow footer; live `proofSummary.ts` query stays a first-screen (`top 3 of 39`). A026/A027.
- **AC12 (co-change)** ✅ PASS — ana-verify.md directs consuming co-change, independence reaffirmed. A032; codex mirror A034.
- **AC13** ✅ PASS — ana-plan.md instructs including co-change partners in the Build Brief. A033 (+ codex mirror).
- **AC14 (co-change)** ✅ PASS — all three .codex mirrors moved in lockstep with .claude. Confirmed in diff; A034.

## Blockers

**BLOCKER — AC3 test-partner suppression fails for package-relative queries.** Reproduced live: from `packages/cli`, `node dist/index.js proof context src/utils/proofSummary.ts` lists `packages/cli/tests/utils/proofSummary.test.ts` as a co-change partner with no suppression note (`top 3 of 40`); the full repo-relative query suppresses it (`top 3 of 39` + note). AC3 ("a file's own test file is not listed as something that changes with it") is violated in a normal invocation.

### Fix brief for AnaBuild
- **Root cause:** query↔partner pairing uses `fileMatches` (suffix-tolerant, reconciles `src/…` ↔ `packages/cli/src/…`), but `isSameStemTestPartner` → `normalizeForTestMatch` compares with exact `===`, which requires the directory prefixes to align. When the query path form differs from the stored partner form, the query matches partners for pairing yet fails test-counterpart detection. The spec gotcha warned: *"do not introduce a second matcher."*
- **Direction:** make the final comparison in `isSameStemTestPartner` as path-tolerant as pairing — change the normalized exact-equality to a `/`-boundary **suffix** match (so `/utils/proofSummary.ts` matches `packages/cli/utils/proofSummary.ts`). Must preserve all existing behaviors: `src/a.ts`↔`src/a.test.ts` suppress; `packages/cli/src/commands/work.ts`↔`packages/cli/tests/commands/work.test.ts` (parallel tree) suppress; `src/x/index.ts`↔`src/y/index.test.ts` (different module) NOT suppressed — the `/`-boundary protects this.
- **Test (the second finding):** add a suppression case in `proof-history.test.ts` where the query is package-relative and the partner is repo-relative (e.g. query `src/commands/work.ts`, partner `packages/cli/tests/commands/work.test.ts`) and assert `suppressedTestPartner === true`. This is the case that would have caught the bug; it must be red before the fix and green after.
- **Out of scope:** the contract is sealed — do not edit it. A014/A015's narrowness is recorded as an upstream finding for a future contract revision, not this cycle.

Everything else is clean — I searched for and ruled out: contract assertions not backed by value-checking tests (none); unhandled crash paths in `getProofContext` when chain/graph absent (handled — both existence-gated, JSON path falls back to an empty envelope); engine purity violations (none — no chalk/IO/fs in proof-history); unused exports or dead branches in the new engine (none); Phase 1 Shaped-by render regressions (none — 4068 pass, 0 fail).

## Findings

- **Code — AC3 suppression fails for package-relative queries:** `packages/cli/src/engine/analyzers/proof-history/index.ts:149` — `isSameStemTestPartner` compares via `normalizeForTestMatch` (prefix-sensitive normalized-string equality), while query↔partner pairing compares via `fileMatches` (suffix-tolerant). The two matchers disagree when the query and the stored partner use different path prefixes. Reproduced live: from `packages/cli`, `node dist/index.js proof context src/utils/proofSummary.ts` lists `packages/cli/tests/utils/proofSummary.test.ts` as a co-change partner with no suppression note (`top 3 of 40`); the full repo-relative query suppresses it correctly (`top 3 of 39` + note). The spec's own gotcha warned: *"Reuse `fileMatches`… do not introduce a second matcher."* Fix direction: reconcile the query and partner to a common form (via `fileMatches`/suffix) before the stem/normalize comparison, so suppression is exactly as path-tolerant as pairing. Severity risk; suggested action scope.
- **Test — no coverage for path-form mismatch in suppression:** `packages/cli/tests/engine/analyzers/proof-history.test.ts:185` — the "src↔tests mirror" test (and all suppression tests) use aligned path forms, so the live failure mode (package-relative query vs repo-relative `modules_touched`) is never exercised. A test passing `'src/commands/work.ts'` as the query against `'packages/cli/tests/commands/work.test.ts'` would have caught Finding 1. Severity debt; suggested action scope.
- **Code — legacy bare-basename partner can over-dedup the import layer:** `packages/cli/src/utils/proofSummary.ts:1339` — `isProofPartner` uses `fileMatches`, whose tier-3 rule returns true when a proof partner is a bare basename (legacy data), so it would suppress all same-basename files from the import layer regardless of directory. Low likelihood (requires legacy bare-basename `modules_touched`); silently drops real import edges if it occurs. Severity observation; suggested action monitor.
- **Test — hidden/imports render path not exercised end-to-end:** `packages/cli/src/commands/proof.ts:3320` — this worktree has no `.ana/state/code-graph.json`, so the live run rendered only the `unknown` group. The graph-present render (hidden/imports grouping + imported_by/imports sub-layers) is covered by integration tests that write a synthetic graph, not by a real-repo run. Reduced live confidence on that path only. Severity observation; suggested action monitor.
- **Code — proofSummary.ts continues to grow:** `packages/cli/src/utils/proofSummary.ts:1311` — Phase 3 added ~138 lines (`assembleAlsoChangesWith`, `resolveQueryNode`, the `also_changes_with` interface). The assembly/dedup glue could have lived in the pure engine module; placing it in the already-oversized util continues the trend tracked by `decompose-proof-summary-C1` and `audit-matrix-orientation-C7`. Severity observation; suggested action monitor.

## Deployer Handoff

Do not merge yet. Phase 3 is the final phase, but it FAILs on the AC3 suppression gap above — going back to Build for a code+test fix, then I re-verify. PR #332 was opened on the earlier PASS read; it is now premature — convert it to draft or leave it pending until the re-verify lands (the branch updates the same PR). Everything else in Phase 3 is solid: 4068 tests pass, build/lint clean, the engine is pure, the feature works for repo-relative queries. The fix is narrow (one comparison + one test) — this should be a fast cycle. Note: no `code-graph.json` exists in this worktree, so the hidden/imports relation labels were exercised by integration tests, not the live run.

## Verdict

**Shippable:** NO

The sealed contract is mechanically satisfied (Gate 1), but the AC3 acceptance criterion fails in a normal CLI invocation (Gate 2): a package-relative query leaks the query's own test file into the co-change list. A green assertion wall doesn't override an intent the walkthrough shows isn't met. The defect is well-understood, the fix is small (route suppression through the same path tolerance as pairing) and must ship with the test that exercises the path-form mismatch. Back to Build, then re-verify.