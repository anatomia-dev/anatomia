# Build Spec — Best-in-the-World Scan

**Status:** READY (design → adversarial-verified → corrections folded in → spot-checked by Ana)
**Verdict:** build-with-corrections · 25 confirmed · 5 refuted (all legitimate, all folded in) · 0 outright showstoppers
**Source:** scan-supremacy-design (wc48budje) + adversarial-verify (who4ffq62), corrections applied below.

---

## Thesis
The only repo scan that fuses **symbol-graph centrality + git co-change + a verified work-outcome ledger** into one token-budgeted "read these first" list — personalized to the active scope, **proven** with a real with/without agent benchmark, and auto-refreshed on every merge so it compounds and never rots.

## Verified premises (independently confirmed by Ana via grep — NOT the planner's word)
- **The ledger is real.** `.ana/proof_chain.json` has 202 entries; **200 carry** `modules_touched`/`rejection_cycles`/`previous_failures`, **2 legacy entries don't → readers MUST use `?? []`**. Field names are snake_case as cited. Full-path ranking is exact: `src/commands/work.ts`=68, `src/commands/proof.ts`=42, `src/utils/proofSummary.ts`=36. (Note: two `proof.ts` files exist — rank by full path, not basename.)
- **The graph primitive is real.** `extractImports` has `names: [], // Simplified` (`treeSitter.ts:648`); the `namedImport` query is written but `getQuery` is never called with it (`queries.ts:78/119/216`). Wire it — don't build it.
- **The engine seams are real.** gitIntelligence null stubs (`scan-engine.ts:1137`, default `engineResult.ts:410`), the 5-site procedure (`engineResult.ts:8-14`), `completeWork` anchors (`work.ts:1151+`, coAuthor hoist `:586`), deep-tier gating + 750-file cap (`proportionalSampler.ts:126`, `scan-engine.ts:830`), `scan-freshness` 7d/50-commit notice — all verify. No with/without benchmark exists today (so the prove-it harness is genuinely new).

---

## Build order (CORRECTED — flat `parallelSafe` was wrong; a Phase-0 shape-freeze unblocks parallelism)

`scan-engine.ts` and `engineResult.ts` are the contention magnets — slices 1/3/5 all touch them. Freeze the shape ONCE, then population work parallelizes.

```
PHASE 0  (serial, ~30 min — one commit freezes the EngineResult shape)
  Shape-freeze pre-slice

PHASE 1  (parallel — disjoint regions / new files after the shape is frozen)
  Slice 1 — Proof-history risk map   ∥   Slice 2 — Import-graph primitive   ∥   Slice 4 — Prove-it harness (BARE arm)

PHASE 2  (serial)
  Slice 3 — Fused reading list (needs Slice 1 + Slice 2)
  Slice 5 — Context-never-rots       (needs Phase 0's indexedCommit field)
```

---

## PHASE 0 — Shape-freeze pre-slice  ·  serial, first
One commit, the documented 5-site procedure, freezing every EngineResult change so later slices only populate disjoint regions:
- **CORRECTION #1:** widen `coChangeCoupling[].hasImportRelationship` → `boolean | null` (`engineResult.ts:293`); emit `null` (never `false`) when import resolution is low-confidence.
- **CORRECTION #3:** extend `bugMagnetFiles` with explicit proof-chain fields — `{ file, touchCount, findingsPerTouch, rejectionCycles }` — do NOT overload the commit-semantics `bugCommitCount`/`totalCommitCount`/`ratio` (keep those for the git-churn path).
- Add new top-level `readingOrder: { budget, personalizedTo, entries[] } | null`.
- Add `overview.indexedCommit` (git HEAD at scan time).
- Add all `createEmptyEngineResult` defaults (`engineResult.ts:379+`), `scan-engine.ts:1131-1142` null stubs, and `analyzer-contract.test.ts` key gates.
- **Drop the "no shape change" wording** from slices 1/3 — they *do* change the shape, and that's fine; it's done here, once.

## PHASE 1 (parallel)

### Slice 1 — Proof-history risk map
- **Scope:** `readProofHistory(projectRoot)` over `.ana/proof_chain.json` → populate `bugMagnetFiles` (ranked by **findings-per-touch RATE + rejection_cycles**, normalized, not raw counts) + `intentCouples` (files co-occurring in the same `modules_touched`, carrying linking slugs). Gate ≥3 touches; `null` when no proof chain.
- **Legacy guard:** `modules_touched ?? []` (2 of 202 entries lack it).
- **Files (owner):** `analyzers/proof-history/index.ts` (new); populates the Phase-0 stub in `scan-engine.ts` (gitIntelligence region only).
- **Test:** against synthetic fixture AND real chain — `work.ts` ranks #1, deterministic, `null` when absent/under-gate. Sub-50ms.

### Slice 2 — Import-graph primitive
- **Scope:** fix `extractImports` `names:[]` (`treeSitter.ts:648`), wire the `namedImport` query (`queries.ts`), resolve relative + tsconfig-path specifiers to in-repo files (unresolved → NO edge), build deterministic file→file digraph, persist `.ana/state/code-graph.json`. Reuse symbol-index def-extraction for node identity; do NOT mutate `SymbolEntry`.
- **Files (owner):** `analyzers/graph/buildGraph.ts` (new), `parsers/treeSitter.ts` (extractImports), `parsers/queries.ts` (wire namedImport). *Parser files are slice-2-exclusive — no engineResult overlap.*
- **Gating (CORRECTION #2):** deep tier + the verified 750-file sampler cap. **Do NOT cite "AC11"** (it's unrelated) — optionally add a real deep-scan latency test in `tests/performance/` mirroring the `<20s ana-init` gate.
- **Test:** edge `scan-engine.ts → census.ts`; external import → no edge; deterministic, fail-soft per file.

### Slice 4 — Prove-it harness (BARE arm today)
- **Scope:** `tests/benchmark/` — fixed localization/edit tasks on this repo at a pinned commit, two arms (BARE vs SCAN), model/prompt/budget constant. Metrics: distinct files read, **wrong-file reads** (cleanest reliability signal), tool-call count, tokens-to-first-correct-edit.
- **CORRECTION #4:** source transcript-derivation from **`src/utils/forensics.ts` (`deriveTranscript` / `ANA_RUN_ID`)** — NOT `capture-runner.ts`. Reuse `capture-runner.ts` only for the **trinary abstain-on-unknown design pattern** (never fabricate a result).
- **Files (owner):** `tests/benchmark/harness.ts`, `tasks/*.json`, `scorer.ts` (all new).
- **Test:** land 1 read-only task + BARE arm producing a metrics row; abstain when a transcript can't be parsed. Env-gated, out of default CI, mechanically scored (no LLM judge).

## PHASE 2 (serial)

### Slice 3 — Fused reading list (needs Slice 1 + Slice 2)
- **Scope:** ~40-line deterministic power-iteration PageRank over the Slice-2 graph; fuse centrality + Slice-1 bug-magnet rate + co-change into ranked `{file, score, reasons[]}`; binary-search to ~1k-token budget; personalize toward active `scope.md` "Files affected" when present; populate `readingOrder`; cross-ref edges vs co-change to set `hasImportRelationship` (null when low-confidence) + flag hidden coupling. Render "Start here" in `scan.ts`; inject the ~15-line block into `scaffold-generators.ts`.
- **Files (owner):** `analyzers/reading-order/index.ts`, `analyzers/graph/pagerank.ts` (new); populates `readingOrder` region of `scan-engine.ts`; `scan.ts` (render); `scaffold-generators.ts` (agent block).
- **Test:** hub files rank top-N; leaf type-only ranks low; two runs byte-identical; `readingOrder===null` below edge threshold; reasons state measured basis; in-scope files rank up when `scope.md` present.

### Slice 5 — Context-never-rots (needs Phase 0)
- **Scope:** after the archive commit in `completeWork` (`work.ts:1151+`), call `scanProject` in a TOTAL try-catch (never blocks completion), gated on material source delta. Stamp `overview.indexedCommit = HEAD`, write `scan.json` (respect worktree guard `scan.ts:470`), update `ana.json.lastScanAt`, append both to `completePaths` (inherit co-author trailer + push; push failure → follow-on commit). Extend `scan-freshness.ts` with HEAD-divergence stale flag in `ana work status`.
- **Files (owner):** `work.ts` (completeWork), `scan-freshness.ts`; `scan-engine.ts` `indexedCommit` STAMP (overview region — disjoint from Slice 1's gitIntelligence region).
- **Test:** complete a no-op item → `scan.json` in the commit, `indexedCommit===HEAD`. Force `scanProject` to throw → completion still succeeds. `stale=true` when `indexedCommit != HEAD`.

---

## No-regression contract
- Every change is additive/nullable, all via the 5-site procedure, frozen in Phase 0. Existing scan output byte-parity (populates currently-null fields or adds new nullable ones).
- Tier behavior unchanged: proof-history + co-change run at surface/`--quick`; graph + reading-order are deep-only behind the 750-cap.
- Honesty by construction: every analyzer emits `null` when its gate fails (no chain → null bugMagnets; below edge threshold → null readingOrder; unresolved specifier → no edge; low-confidence → `hasImportRelationship: null`, never fabricated).
- Rescan hook total-try-catch + material-delta gated → never blocks a merge, never timestamp-churns diffs.
- Benchmark env-gated, mechanically scored → no CI flake.
- Consumes the in-flight `scan-coupling-conventions` output; never re-mines git.

## Demo
`ana scan` → "Start here" card with measured reasons ("`work.ts` — 68 work items, 4 rework cycles; also check `proofSummary.ts` + `proof.ts`, changed together in 12 verified items"). `ana scan --scope <slug>` re-ranks for the task (Aider/repowise structurally can't — no machine-readable intent). Benchmark table: 9 files/4 wrong/14K tokens **without** vs 3 files/0 wrong/2K tokens **with**. `ana work complete` → `scan.json` refreshed in the commit, ranking already updated by the work that just merged.
