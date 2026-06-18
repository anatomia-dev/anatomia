# Spec: "Also changes with" — assembly + render + co-change templates

**Created by:** AnaPlan
**Date:** 2026-06-18
**Scope:** .ana/plans/active/proof-context-intelligence/scope.md

## Approach

Add the **Also changes with** section to `ana proof context` — a single, hard-capped, gracefully-degrading list answering "what else will I have to touch." It composes two layers, both built from artifacts already on main after Phase 2:

- **Proof co-change layer** — files co-touched with the queried file across ≥2 verified work items, each flagged `hidden` / `imports` / `unknown` against the import graph. Reads only the proof chain (on main) + the Phase 2 graph reader.
- **Day-1 import layer** — the queried file's direct import relationships (imported-by / imports) from `code-graph.json`. Available the moment `ana init` has run (Phase 2), no proof chain required.

**Assembly decision (resolves scope open question) — harvest the logic, not the IO.** The branch's `readProofHistory` is `async` and re-reads the chain; `getProofContext` is `sync` and already parses it. Do **not** call the async analyzer (double-read + sync/async mismatch). Instead, create a **pure sync** helper `computeCoChange(entries, queryFile, graph)` in `engine/analyzers/proof-history/index.ts` that takes the already-parsed entries `getProofContext` holds, plus the optional `CodeGraph` from `readCodeGraph` (Phase 2), and returns the classified, gated, capped partner list. Call it inside the loop `getProofContext` already runs. One parse, no async infection. *The elegant solution removes.*

**Gates (harvested, AC5):** a partner pair counts only when both files clear `MIN_TOUCHES = 3` (appear in ≥3 work items) and the couple clears `MIN_COTOUCH = 2` (≥2 shared verified items). Lift these constants and the `intentCouples` pair-accumulation logic from `feature/devday-scan:proof-history/index.ts`; lift the `hidden`/edge classification from `reading-order/index.ts:355-388`.

**Oversized-item cap (resolves scope open question — adding one).** The live 208-entry chain has a single work item touching **110 files**. `MIN_COTOUCH=2` alone leaves a real spurious-pair risk: two large refactors with overlapping file sets manufacture a surviving couple. So `computeCoChange` **excludes items above a file-count cap from pair generation** (touch-counting for `MIN_TOUCHES` is unaffected — only pairing is skipped). Default cap: **40 files** (well above a normal feature's footprint, below the mega-refactor regime; the 110-file item and similar are excluded). Make it a named constant; the test calibrates against the chain.

**Hidden/imports/unknown trichotomy (AC4):** for each proof partner, with graph `G`:
- both query and partner in `G.nodes` and an edge exists either direction → `imports`
- both in `G.nodes` and no edge → `hidden`
- partner (or query) absent from `G.nodes`, **or no graph at all** → `unknown`

Never collapse `unknown` into `imports: false`. No graph → every proof partner is `unknown` (not `hidden`, not a crash).

**Test-partner suppression (AC3, net-new — branch does not do this):** before ranking, drop proof partners that are the same-stem test file of the query (or vice versa): `work.ts` ↔ `work.test.ts`, `work.spec.ts`. Match on basename stem equality ignoring a `.test`/`.spec` infix and shared directory-or-suffix (reuse the `fileMatches` stem logic in `proofSummary.ts:1216`). When a partner is suppressed, set a flag so the render emits a one-line note.

**Two-layer composition (resolves scope open question):** one single list, not two overlapping lists.
- Hidden co-change ranked **first** (the surprising, higher-value signal), by co-touch count desc.
- `imports`-flagged proof partners next.
- Then the day-1 import layer (imported-by, then imports) for files **not already shown** as a proof partner — dedup so a proof partner that is also an import edge appears **once** (as the proof row, flagged `imports`), never repeated in the import layer.

**Caps (AC10, calibrated against `work.ts` = 69 shapers / many partners):**
- Proof co-change: top 3, footer "top 3 of N".
- Day-1 import layer: cap **imported-by** and **imports** separately (a hub can have 50 importers). Prioritize **imported-by** ("who breaks if I change this") for an editing agent. Cap each at 3, footer per sub-direction.
- Whole section's first-screen budget is a hard cap; the test asserts a hot file renders under the line budget.

## Output Mockups

`ana proof context packages/cli/src/commands/work.ts` (mature repo, graph present), **Also changes with** section appended after Findings/Build concerns:

```
Also changes with:
  Changed together (hidden — no import edge):
    packages/cli/tests/commands/artifact.test.ts   ·  4 work items
    packages/cli/src/commands/pr.ts                 ·  3 work items
  Changed together (also imports):
    packages/cli/src/utils/proofSummary.ts          ·  5 work items
  top 3 of 9 — drill a work item with `ana proof <slug> --why`
  (note: work.test.ts suppressed — same-stem test partner)

  Imported by:
    packages/cli/src/commands/run.ts
    packages/cli/src/index.ts
    + 6 more — see `ana proof context --json`
  Imports:
    packages/cli/src/utils/proofSummary.ts   (shown above)
    packages/cli/src/utils/worktree.ts
```

Fresh repo (graph present, **no** proof chain) — day-1 layer only:
```
Also changes with:
  Imported by:
    packages/cli/src/commands/run.ts
    + 2 more — see `ana proof context --json`
  Imports:
    packages/cli/src/utils/worktree.ts
```

No graph **and** no proof chain → the whole **Also changes with** section is absent (AC7).

## File Changes

### packages/cli/src/engine/analyzers/proof-history/index.ts (create)
**What changes:** Harvest the `intentCouples` pair logic + `MIN_TOUCHES`/`MIN_COTOUCH` from the branch, refactored to a **pure sync** `computeCoChange(entries, queryFile, graph?)`. Add the oversized-item cap and same-stem test-partner suppression (both net-new). Lift the `hidden`/edge-set classification from `reading-order/index.ts:355-388`. Returns `{ partners: Array<{ file, coTouchCount, relation: 'hidden'|'imports'|'unknown', slugs }>, total, suppressedTestPartner: boolean }`.
**Pattern to follow:** branch `proof-history/index.ts` for pair accumulation; branch `reading-order/index.ts:355-388` for the edge-set/`hidden` logic (pasted in Build Brief).
**Why:** AC2, AC3, AC4, AC5 — the proof co-change engine, pure and testable in isolation.

### packages/cli/src/utils/proofSummary.ts (modify)
**What changes:** Add optional `also_changes_with` to `ProofContextResult` — a structured object carrying the proof partners (with `relation` + `coTouchCount`), the day-1 import layer (`imported_by[]`, `imports[]`), the proof total, and `suppressed_test_partner`. In `getProofContext`: after the existing loop, call `readCodeGraph(projectRoot)` once (Phase 2 reader; may be `null`), call `computeCoChange(entries, query, graph)` per query, and assemble the day-1 layer from the graph (the query's edges). Dedup proof partners against the import layer. When both graph and proof co-change are empty, leave `also_changes_with` undefined (section absent).
**Pattern to follow:** the same optional-field discipline added in Phase 1 for `shaped_by`; the fail-soft single-read of `.ana/` already in this function.
**Why:** AC2, AC2b, AC7, AC8 — joins the layers into the result the renderer consumes.

### packages/cli/src/commands/proof.ts (modify)
**What changes:** In `formatContextResult`, render **Also changes with** after Build concerns: hidden-first proof sub-group, then `imports` proof sub-group, then the "top 3 of N" footer with the `--why` drill hint, then the suppression note when set, then the day-1 **Imported by** / **Imports** sub-groups with per-direction "+N more — see `ana proof context --json`" footers. Mark import-layer rows that duplicate a shown proof partner as "(shown above)" or omit per the dedup rule.
**Pattern to follow:** the Phase 1 **Shaped by** render and the footer house style (`proof.ts:265`).
**Why:** AC2, AC2b, AC3, AC10 — the single coherent capped section.

### packages/cli/templates/.claude/agents/ana-plan.md (modify)
**What changes:** At the "Proof Context" Build-Brief section (~`:438`), instruct Plan to include the **co-change partners** of affected files in the Build Brief so Build inherits "don't forget B" without running the command (Build stays spec-only). Frame co-change as blast-radius.
**Why:** AC13.

### packages/cli/templates/.claude/agents/ana-verify.md (modify)
**What changes:** Direct Verify to consume **both** findings and co-change from `ana proof context` (Phase 1 dropped the hedge; this adds co-change). Reaffirm: co-change/shaped-by is orientation — Verify forms findings independently.
**Why:** AC12 (co-change part).

### packages/cli/templates/.claude/agents/ana.md (modify)
**What changes:** Frame **Also changes with** as blast-radius discovery in the scope process (complements the Phase 1 adoption edit).
**Why:** AC11 (co-change framing part).

### packages/cli/templates/.codex/agents/{ana,ana-plan,ana-verify}.md (modify)
**What changes:** Mirror the three `.claude` co-change edits in lockstep.
**Why:** AC14 (co-change part).

### Tests (create)
- `packages/cli/tests/engine/analyzers/proof-history.test.ts` — harvest the branch's tests (no-chain → empty, dedup-within-item, gate at `MIN_TOUCHES`/`MIN_COTOUCH`, legacy entries lacking `modules_touched`, determinism, same-basename by full path) and add: oversized-item exclusion (a 110-file item generates no surviving pairs by itself), test-partner suppression + flag, hidden/imports/unknown classification (with graph, without graph → all `unknown`, partner off-graph → `unknown`).
- Render tests in `tests/commands/`: hot-file caps + footers; hidden-first ordering; dedup (proof partner that imports shown once); fresh-repo (graph, no chain) → day-1 layer only; neither → section absent.

## Acceptance Criteria
- [ ] AC2: **Also changes with** lists proof co-touched files across ≥2 verified items, with co-touch count, capped top 3, "top 3 of N" footer; absent when no proof chain (day-1 layer may still render, AC2b).
- [ ] AC2b: when `code-graph.json` is present, the section surfaces the file's import relationships (imported-by / imports) as a static layer, capped, with only `ana init` run; renders on fresh repos.
- [ ] AC3: same-stem test partners suppressed from the proof co-change layer, with a one-line suppression note.
- [ ] AC4: each proof partner flagged `hidden` / `imports` / `unknown`, never fabricated; absent graph → `unknown`, no crash; day-1 import layer is not flagged (it *is* the edges).
- [ ] AC5: co-change couples appear only when both files clear `MIN_TOUCHES` (≥3) and the couple clears `MIN_COTOUCH` (≥2); oversized items excluded from pairing.
- [ ] AC7: no proof chain → **Shaped by** and proof co-change absent; no chain *and* no graph → **Also changes with** absent entirely; `getProofContext` returns cleanly.
- [ ] AC8: `also_changes_with` is an optional field; old callers and JSON shape unaffected.
- [ ] AC10: a hot file (`work.ts`) renders within the caps — a first-screen, not a record (under the asserted line budget).
- [ ] AC12 (co-change): `ana-verify.md` directs Verify to consume co-change; independence reaffirmed.
- [ ] AC13: `ana-plan.md` includes co-change partners of affected files in the Build Brief.
- [ ] AC14 (co-change): `.codex` mirrors carry the equivalent guidance.
- [ ] Tests pass with `pnpm run test -- --run`; no build errors; lint clean.

## Testing Strategy
- **Unit (`computeCoChange`):** gates, oversized-item exclusion, suppression + flag, trichotomy with/without graph, determinism, legacy-entry tolerance.
- **Unit (render):** hidden-first order, dedup, caps + footers, suppression note, fresh-repo day-1-only, neither-present → absent.
- **Edge cases:** query path vs repo-relative `modules_touched` reconciliation (reuse `fileMatches`); a proof partner that is also an import edge (shown once); query file absent from graph (partners → `unknown`).

## Dependencies
Phase 2 merged — `readCodeGraph` and a written `code-graph.json` must exist. Phase 1 merged — `getProofContext`/`formatContextResult` already carry `shaped_by` (this phase extends the same functions).

## Constraints
- Engine purity: `computeCoChange` is a pure sync function (entries + optional graph in, classified partners out) — no IO, no chalk. All reads happen in `getProofContext`; all render in `proof.ts`.
- `also_changes_with` optional (AC8).
- Hard caps are mandatory — the default is a first-screen, not a record (AC10).
- Never fabricate a relationship: `unknown` is a first-class state, never `imports: false` (AC4).

## Gotchas
- **`unknown` ≠ `imports: false`.** Off-graph or no-graph → `unknown`. Preserve the branch's honesty-by-construction (it returns low-confidence/`null` for off-graph files).
- **Test-partner suppression is net-new** — the harvest does NOT cover it. Build it; don't assume the lifted analyzer suppresses partners.
- **Oversized-item cap is net-new** — the branch has no per-item file-count cap. Add it (default 40), calibrate against the chain; exclude only from pairing, not touch-counting.
- **Monorepo path reconciliation** — `modules_touched` is repo-relative; the query path may be relative or absolute. Reuse `fileMatches` (`proofSummary.ts:1216`) for the query↔partner and query↔graph-node match; do not introduce a second matcher.
- **Dedup the layers** — a proof partner that is also an import edge renders once (proof row, `imports`), never repeated in the day-1 layer. The scope flags double-listing as a real risk.
- **Sync composition** — `computeCoChange` and `readCodeGraph` are sync; keep `getProofContext` sync.
- **`.codex` mirrors move in lockstep** — never ship a one-platform template change.

## Build Brief

### Rules That Apply
- `.js` import extensions; `import type` separated; explicit return types + JSDoc on exports.
- Engine purity: `proof-history/index.ts` is pure — no chalk/ora, no IO. Empty engine catch blocks stay empty.
- `?:` optional for `also_changes_with` (genuinely absent when no data).
- No default exports; early returns.

### Pattern Extracts

Hidden/edge classification to harvest (`feature/devday-scan:reading-order/index.ts:357-388`):
```ts
  const edgeSet = new Set<string>();
  for (const e of graph.edges) {
    edgeSet.add(`${e.from}\0${e.to}`);
    edgeSet.add(`${e.to}\0${e.from}`);
  }
  const graphNodeSet = new Set(graph.nodes);
  // …per couple:
        acc.topHidden =
          graphNodeSet.has(self) && graphNodeSet.has(other) && !edgeSet.has(`${self}\0${other}`);
```

Pair accumulation + gate to harvest (`feature/devday-scan:proof-history/index.ts`):
```ts
const MIN_TOUCHES = 3;
// dedupe files within an item, form sorted unordered pairs, accumulate linking slugs:
    const files = Array.from(new Set(touched));
    const sorted = [...files].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}\0${sorted[j]}`;
        const set = pairSlugs.get(key) ?? new Set<string>();
        if (slug) set.add(slug);
        pairSlugs.set(key, set);
      }
    }
// gate: both files cleared MIN_TOUCHES, couple cleared MIN_COTOUCH(=2)
```

`fileMatches` to reuse for path reconciliation (`proofSummary.ts:1216`) — three-tier exact/suffix/basename; do not write a second matcher.

### Proof Context
Run `ana proof context packages/cli/src/utils/proofSummary.ts packages/cli/src/commands/proof.ts`. Curate top findings (Plan note: both are high-touch files — expect active findings; flag any whose `related_assertions` overlap this contract's co-change render assertions). If none active, state so.

### Checkpoint Commands
- After `computeCoChange`: `(cd 'packages/cli' && pnpm vitest run)` scoped to proof-history tests — Expected: gates, suppression, oversized-cap, trichotomy pass.
- After render: `(cd 'packages/cli' && pnpm vitest run)` scoped to proof command tests — Expected: caps/footers/dedup pass.
- After all changes: `pnpm run test -- --run` — Expected: 3893 + Phase 1/2/3 cases, 0 regressions.
- Lint: `pnpm run lint`.

### Build Baseline
- Current tests: **3893** test cases (before any phase)
- Current test files: **171**
- Command used: `pnpm run test -- --run`
- After build: expected baseline + harvested proof-history cases + suppression/cap/trichotomy/render cases in 171 + ~1–2 new files
- Regression focus: Phase 1's `shaped_by` render tests (Also changes with inserts below them — layout shifts), any `formatContextResult` snapshot.
