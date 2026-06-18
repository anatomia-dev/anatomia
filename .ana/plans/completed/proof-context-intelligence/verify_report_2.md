# Verify Report: Proof-Context Intelligence — Phase 2 (import-graph write pipeline + reader)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-18
**Spec:** .ana/plans/active/proof-context-intelligence/spec-2.md
**Branch:** feature/proof-context-intelligence

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .../proof-context-intelligence/contract.yaml
  Seal: INTACT (hash sha256:10c99c610fde35bfec8bb5edb2c1c60f3436cad702f3a8e52ea33e8ce44e43e0)
```
Seal status: **INTACT** — contract unmodified since AnaPlan sealed it.

**Build:** PASS (`cd packages/cli && pnpm run build`, exit 0).
**Lint:** PASS — 0 errors (`pnpm run lint`). 2 warnings, both in files untouched by this phase (`website/components/hero/Hero.tsx`, `packages/cli/src/utils/git-operations.ts`) — pre-existing.
**Tests (sealed verify run):**
```
<!-- ana:capture stage=verify slug=proof-context-intelligence counts=4022p/1f/2s verdict=fail sha256=0fbe8625f8313425d597f803ccd77669a3f2976df9664845cc58c9396825548f -->
```
Sealed counts: 4022 passed, 1 failed, 2 skipped. The single failure is a **pre-existing flaky test** unrelated to Phase 2 logic — see Independent Findings and Blockers. A clean re-run of the full suite produced 4023 passed / 0 failed / 2 skipped; the targeted Phase 2 tests (graph builder, reader, init integration) pass 20/20 in isolation across repeated runs.

## Contract Compliance

Phase 2 is verified against `spec-2.md`. Of the 34 sealed assertions, the two in the contract's "AC2b precondition / Phase 2" section are this phase's responsibility (A028, A029). The remaining assertions belong to Phase 1 (already verified) and Phase 3 (not started) and are out of scope here.

| ID   | Says                                                              | Status       | Evidence |
|------|-----------------------------------------------------------------|--------------|----------|
| A028 | A fresh install writes the import graph (non-empty `code-graph.json`) so blast-radius works day one | ✅ SATISFIED | `tests/commands/init/code-graph-init.test.ts:66` (`@ana A028`) — drives the real built CLI end-to-end (`node dist/index.js init --force`), reads the LIVE `.ana/state/code-graph.json` after the atomic swap, asserts `graph.nodes.length` `toBeGreaterThan(0)`. Matcher `greater`/value `0` ↔ `toBeGreaterThan(0)` ✓. A companion test (line 77) asserts the actual `src/a.ts → src/b.ts` edge is recorded — not a sentinel. |
| A029 | Reading a missing import graph returns nothing instead of crashing | ✅ SATISFIED | `tests/engine/analyzers/graph/readGraph.test.ts:48` (`@ana A029`) — `expect(() => readCodeGraph(tmpDir)).not.toThrow()` and `expect(readCodeGraph(tmpDir)).toBeNull()`. Matcher `equals`/value `null` ↔ `toBeNull()` ✓. Source confirms: `readGraph.ts:35-47` returns `null` in the catch. |

Note on `@ana A028`/`A029` tag collisions: these IDs also appear in ~20 unrelated test files (e.g. `pricing.test.ts`, `doctor.test.ts`, `work-merge.test.ts`). Those are stale tags carried from *other* features' contracts whose numbering happens to collide — they are not evidence for this contract. The genuine tagged tests for this contract are the two cited above; verified by reading each.

## Independent Findings

**Predictions (made before reading implementation), resolved:**
1. *"Harvested builder will carry more surface than Phase 2 uses."* — **Confirmed.** `CodeGraph` carries `inDegree`, `barrelFiles`, `generatedFiles`; none are consumed in src this phase, and `readCodeGraph` has zero src callers. This is **sanctioned**, not YAGNI — the spec explicitly frames Phase 2 as producing an inert artifact for Phase 3 and instructs harvesting the full type verbatim. Flagged so Phase 3 closes the loop (Finding).
2. *"Init write may not fire / land in the wrong dir."* — **Not found / correct.** `init/index.ts:131` passes `path.join(tmpAnaPath, 'state')` (the staging dir, same convention as `buildSymbolIndexSafe`), and the integration test proves the file survives the atomic swap into live `.ana/state`. I checked `createDirectoryStructure` (`assets.ts:90`) — it uses idempotent recursive `mkdir`, so writing the graph before it (line 131 vs 134) does not clobber. Noted the ordering asymmetry as a latent observation (Finding).
3. *"A new test will be a sentinel."* — **Not found.** The init test asserts a concrete edge and non-empty nodes; the reader tests cover present/absent/bad-JSON/wrong-shape/non-object/forward-compat (6 cases); the builder tests assert exact edges, unresolved counts, in-degree dedup, determinism, and monorepo resolution. Real assertions throughout.
4. *"`ana scan` byte-parity may break."* — **Partially confirmed (test gap, not code defect).** The write is correctly gated by `if (options.persistGraphTo)` (`scan-engine.ts:875`), so `ana scan` (which passes no dir) writes nothing. But the spec's mandated byte-parity regression test does not exist — the read-only contract is verified by source inspection only (Finding).
5. *"Spec guidance led Build astray."* — **Not found.** The harvest-verbatim + scan-engine-hook approach was followed exactly; the wiring matches the pattern extract in the Build Brief.

**Production-risk sweep (beyond predictions):** The graph build now runs inside every deep scan that init triggers, adding parse-free graph work to `ana init`. It is wrapped in its own try/catch (`scan-engine.ts:868-883`) and `persistCodeGraph` is independently fail-soft, so a graph failure cannot invalidate a scan or crash init — confirmed by the `persistCodeGraph` "never throws on invalid path" test. Engine purity holds: `buildGraph.ts`/`readGraph.ts` import only `node:fs`/`node:path` and the type modules — zero chalk/ora/commander. Empty engine catch blocks are intentional (house rule) and correctly left unlogged.

The one surprise was the **sealed run's 1 failed test**. I traced it to `template-propagation.test.ts > "a Claude-only project never creates or touches the .codex tree"` — a pre-existing test (byte-identical to main) that spawns the real CLI `init` twice in one test under the default 5000ms timeout. It passes 100% in isolation and flakes only under full-suite CPU contention at the ~5025ms boundary. I ran the full suite on `main` 4× to settle regression-vs-baseline: it failed there too (1/4 runs, same test, same 5025ms), so this is **pre-existing flakiness, not a Phase 2 regression**. Phase 2's added init work may marginally raise the flake rate (the branch flaked more often in a small sample), which is captured as a Finding.

## AC Walkthrough
(Acceptance criteria from `spec-2.md`.)

- ✅ **PASS** — `buildImportGraph` + `persistCodeGraph` exist on main and build/persist a deterministic `CodeGraph`; harvested verbatim, builds and type-checks against main's types. Evidence: build exit 0; `buildGraph.test.ts` determinism test (`g1 === g2` modulo timestamp, sorted nodes/edges); type imports resolve (`types/parsed.js`, `types/census.js`).
- ⚠️ **PARTIAL** — `scanProject` accepts `persistGraphTo` and writes only when set; `ana scan` keeps its read-only contract. The code is correct (`scan-engine.ts:711` option added; write guarded by `if (options.persistGraphTo)` at `:875`). **Gap:** the spec's mandated `ana scan` byte-parity regression test (assert no `code-graph.json` written when `persistGraphTo` unset) was not written — verified by source inspection only.
- ✅ **PASS** — `ana init` writes `.ana/state/code-graph.json` with non-empty `nodes` on a fresh repo. Evidence: `code-graph-init.test.ts` drives the real CLI init end-to-end and asserts a live, non-empty graph with the expected edge after the atomic swap. (This is the mandatory "don't assume day-1 is day-1" check the spec demanded — present and strong.)
- ✅ **PASS** — `readCodeGraph` returns a typed `CodeGraph` when present and `null` (never throws) when absent/unparseable/malformed/wrong-shape. Evidence: `readGraph.test.ts` (6 cases, all asserting concrete outcomes).
- ✅ **PASS** — A graph-build or persist failure never invalidates the scan. Evidence: own try/catch in `scan-engine.ts:868-883`; `persistCodeGraph` independently fail-soft (test: resolves to `undefined` on an invalid path); engine catch blocks intentionally empty (house rule honored).
- ⚠️ **PARTIAL** — Tests pass / no build errors / lint clean. Build: clean. Lint: 0 errors. Tests: all Phase 2 tests pass; the full suite carries one **pre-existing flaky** test (reproduced on main) that is not a Phase 2 defect. Marked PARTIAL because the suite is not deterministically green, though the flake predates this phase.

## Blockers
None.

What I searched for and ruled out as blockers:
- **Failing test as a regression** — the one sealed-run failure was reproduced on `main` with no Phase 2 code (1/4 runs, same test, same 5025ms timeout). Pre-existing baseline flake, not introduced here. Both Phase 2 contract assertions (A028, A029) pass deterministically.
- **Crash surface from the new code** — graph build and persist are each wrapped fail-soft; verified `persistCodeGraph` never throws on a bad path and the scan-engine hook has its own try/catch. No unhandled error path.
- **`ana scan` behavior change** — write is opt-in via `persistGraphTo`; `ana scan` passes nothing, so its output is unchanged (confirmed by source; not by test — noted as Finding).
- **Init clobber / wrong write location** — graph lands in the staging `state/` dir and survives the atomic swap (integration test); recursive-mkdir ordering is safe.
- **Engine architectural boundary** — no CLI deps added to engine files; empty catches left intentionally unlogged per house rule.

## Findings
- **Test — Pre-existing flaky init test, margin eroded by added init work:** `packages/cli/tests/commands/init/template-propagation.test.ts:308` — "a Claude-only project never creates or touches the .codex tree" spawns the real CLI `init` **twice** under the default 5000ms timeout and flakes under full-suite concurrency (~5025ms). Reproduced on main (1/4 runs) → **not a regression**, but Phase 2 adds import-graph work to every `init`, which can raise the flake rate. Fix at the source: give the CLI-spawning init tests an explicit, generous timeout. (severity: risk · scope)
- **Test — Missing `ana scan` byte-parity regression test:** `packages/cli/src/engine/scan-engine.ts:875` — the spec's Testing Strategy explicitly required a test asserting `scanProject` writes no `code-graph.json` when `persistGraphTo` is unset. No such test exists; the read-only contract rests on the `if (options.persistGraphTo)` guard, verified by inspection only. A one-line regression test would lock the contract. (severity: debt · scope)
- **Test — New integration test uses `git init` without `-b main`:** `packages/cli/tests/commands/init/code-graph-init.test.ts:45` — violates the documented testing standard ("CI runners vary `init.defaultBranch` — has caused CI failures 3 times"). It mirrors the pre-existing flawed pattern in `template-propagation.test.ts:44`, so it's not new debt unique to this build, but the new file inherits the risk. (severity: risk · scope)
- **Code — Stale harvested JSDoc on `CodeGraph.filesAnalyzed`:** `packages/cli/src/engine/analyzers/graph/buildGraph.ts:64` — the field is `filesAnalyzed: number` (a count), but its JSDoc reads "Files whose imports were considered (the parse universe), sorted," which describes an array. The doc drifted from the field during the verbatim harvest. Cosmetic; fix when next touched. (severity: observation · acknowledge)
- **Code — Harvested-but-unused surface (by design):** `packages/cli/src/engine/analyzers/graph/readGraph.ts:35` and `CodeGraph.{barrelFiles,generatedFiles,inDegree}` — zero src consumers this phase. The spec frames Phase 2 as an inert artifact consumed in Phase 3 and instructed harvesting the full type verbatim, so this is sanctioned over-build, not YAGNI. Flagged so Phase 3 verification confirms these are actually consumed (`inDegree` by the fusion, `readCodeGraph` by both proof-context layers). (severity: observation · monitor)
- **Code — Init write ordering asymmetry:** `packages/cli/src/commands/init/index.ts:131` — `code-graph.json` is written before `createDirectoryStructure` (line 134), whereas `symbol-index.json` is written after (line 138). Safe today (recursive idempotent `mkdir`), but a latent footgun if `createDirectoryStructure` ever clears the staging `state/` dir. Consider writing the graph alongside the symbol index, after scaffolding, for symmetry. (severity: observation · monitor)

Proof-chain note: `ana proof context` for `scan-engine.ts` and `init/state.ts` surfaced active findings around the atomic-swap path, double filesystem reads, and `getTemplatesDir()` dev-path fragility. This build interacts with the atomic-swap path (writes the graph into the staging dir) but does not address or worsen those findings, and resolves none of them.

## Deployer Handoff
- This phase ships **inert infrastructure**: it writes `.ana/state/code-graph.json` at `ana init` and provides `readCodeGraph`, but nothing renders or consumes the graph yet — that is Phase 3. No user-facing behavior change; `ana scan` output is unchanged (the write is opt-in via `persistGraphTo`).
- `ana init` now does slightly more work (graph build inside the deep scan). It is fail-soft end to end — a graph failure degrades to "no graph" and never blocks init.
- **Do not create the PR yet** — Phase 3 has not been built. Per the pipeline, the PR is created only after all phases are verified. Run `ana run build` for Phase 3 next.
- One pre-existing flaky init test (`template-propagation.test.ts`, Claude-only) can intermittently fail CI under load. It predates this work; consider raising the timeout on the CLI-spawning init tests independently.

## Verdict
**Shippable:** YES (for Phase 2 scope)

Both Phase 2 contract assertions (A028, A029) are satisfied by real, non-sentinel tests; the mandatory init day-1 integration test is present and drives the real CLI end-to-end; build and lint are clean; the new engine code is pure and fail-soft. The lone full-suite test failure is a pre-existing flake, proven by reproducing it on `main` with no Phase 2 changes. The findings (missing byte-parity test, flaky-test timeout, harvested-but-unused surface) are worth the next engineer's attention but none block shipping this phase. I would stake my name on Phase 2 going forward to Phase 3.
