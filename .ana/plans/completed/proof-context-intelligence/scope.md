# Scope: Proof-Context Intelligence — make `ana proof context` answer *why this file exists* and *what moves with it*

**Created by:** Ana
**Date:** 2026-06-18

## Intent

Turn `ana proof context {files}` from a "what's wrong here" lookup into the orientation surface an agent reads before touching code. It already returns `findings + build_concerns + touch_count + last_touched` (`proofSummary.ts:1147`). Add the two highest-value questions an agent has and can't answer anywhere else:

- **Shaped by** — the verified, contract-passed work items that shaped this file, with their stated intent. The "why is this the way it is." Grounded in `scope_summary` (populated 208/208 in our chain, decision-bearing), not git-blame inference. **Proof-only** — never faked from commit messages.
- **Also changes with** — the "what else will I have to touch," **gracefully degrading by what data exists**: a day-1 static layer from the import graph (what imports this / what it imports — *visible* blast radius, available the moment `ana init` runs, on any repo) and, as the proof chain accrues, the surprising layer on top — files that change with it but share *no* import edge (`hidden`). The import layer is not a fresh-repo consolation prize: it is the baseline the `hidden` flag is defined against, so heavy users need both.

This rides the **pull surface** (on-demand, scoped to files at hand), not scan.json. Zero scan cost, zero always-on load. It is the next extraction from the proof chain — Anatomia's one un-copyable asset — and "why is this here, and what moves with it, *provably*" is a sentence no competitor can say.

**Day-1 value vs compounds-with-use.** Most of this surface's power is proof-derived and therefore dormant until a team has run the pipeline (fresh repos have no proof chain). The import-graph blast-radius layer of **Also changes with** breaks that dormancy: it needs only `ana init`, so a brand-new user gets real "what depends on this" value immediately, and the section enriches (gains `hidden` co-change) as proof accrues. The "why" stays honestly absent on fresh repos rather than faked from low-trust commit messages.

The non-negotiable constraint, set by the user: **every vector is a context-bloat risk, and complexity is its own cost.** The default output is a first-screen, not a record. We minimize the big risk (bloat dumped into agent context) and accept reasonable residuals — we do not 2x complexity to shave 10% off one shape. No per-agent output flag. One uniform, hard-capped output.

This **supersedes the co-change slice of `scan-coupling-conventions`** (git-derived, into scan.json). That scope's convention-break work is judged marginal utility and will be retired, rewritten later if convention intelligence is needed. Co-change ships here, proof-derived, on the pull surface — the higher-trust source, with hidden-coupling detection git can't produce. Co-change is therefore a **compounds-with-use** signal: dormant on fresh repos (no proof chain), valuable once the pipeline has run. Accepted.

## Complexity Assessment
- **Kind:** feature
- **Size:** large
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/utils/proofSummary.ts` — `ProofContextResult` (`:1147`) gains two optional fields; `getProofContext` (`:1256`) collects them in the loop it already runs.
  - `packages/cli/src/commands/proof.ts` — `formatContextResult` (`:3158`) renders the two new sections with caps/suppression; `formatHumanReadable` (`:281`) gains a signal-only `--why` mode for `ana proof <slug>`.
  - `packages/cli/src/engine/analyzers/proof-history/` — harvested from `feature/devday-scan` (co-change + gates). New `also_changes_with` assembly.
  - A reader for `.ana/state/code-graph.json` (the persisted import graph) for the hidden flag — new; the branch persists this artifact but never reads it back.
  - `packages/cli/templates/.claude/agents/{ana,ana-plan,ana-verify}.md` + `.codex` mirrors — when/why/sequencing.
  - Tests: harvest the branch's `proof-history`/`reading-order` analyzer tests; new tests for test-partner suppression, the graph reader, the `--why` renderer, role-free output caps.
- **Blast radius:** Low by design. Read-only command enrichment. No scan.json change, no schema migration on the always-loaded path. `ProofContextResult` gains two **optional** fields → old callers unaffected. Inert without a proof chain; inert until invoked. Worst case of a bad render is over-long command output, instantly recoverable. The one genuinely new dependency is the persisted-graph reader (staleness/absence handled by the `unknown` flag).
- **Estimated effort:** ~3–4 days across two phases.
- **Multi-phase:** yes

## Approach

Enrich a typed, read-only command — don't bolt on a feature, don't touch the scan. Two phases, each independently shippable end-to-end (engine → command output → template guidance).

**Phase 1 — The "why" + bloat discipline + adoption.** Add `shaped_by` to `ana proof context` (verified work items + truncated intent, hard-capped). Add the signal-only `ana proof <slug> --why` drill-down so depth is *pulled*, never dumped. Fix the agent templates so the command is actually run at the right moment with the right framing. This phase has no graph dependency and ships value on the dogfood install immediately — it is the uncopyable core.

**Phase 2 — What moves with it.** Add `also_changes_with` as a two-layer, gracefully-degrading section:
- The **day-1 import layer** (imported-by / imports), read from the persisted import graph (`.ana/state/code-graph.json`, written on `ana init`). Available on any repo with zero pipeline cycles — this is the fresh-repo value and the baseline the `hidden` flag is defined against.
- The **proof co-change layer**, harvested from the `proof-history` analyzer (reads only the proof chain; gates `MIN_TOUCHES=3` / `MIN_COTOUCH=2` already kill mega-refactor artifacts and are already tested), with the two things the branch left undone: same-stem test-partner suppression, and the graph reader. Each proof partner marks `hidden` / `imports` / `unknown` — never fabricated.

The graph reader does **double duty**: it powers the day-1 import layer and defines the `hidden` flag for the proof layer. One new reader, two payoffs.

**One uniform output, hard-capped.** No `--for` role flag — flag bloat and per-agent output logic are not worth the marginal token savings over a capped output. Every agent gets the same first-screen; the small amount each agent should weight differently is handled in its template wording, not in command machinery. The single new flag is `--why`, justified because the drill-down cascade is the largest bloat vector.

**Harvest, don't rebuild.** `feature/devday-scan`'s `proof-history` analyzer (229 lines, proof-chain-only, zero scan-engine coupling, already unit-tested) lifts directly onto `getProofContext`, which already reads the same proof chain.

## Acceptance Criteria
- AC1: `ana proof context {file}` output includes a **Shaped by** section listing verified work items that touched the file (`slug`, `kind`, `completed_at`, truncated `scope_summary`), capped at top 3, with a "N more · `ana proof <slug> --why`" footer when more exist.
- AC2: `ana proof context {file}` output includes an **Also changes with** section: proof co-touched files across ≥2 verified work items, with the co-touch count, capped at top 3, with a "top 3 of N" footer. When no proof chain exists, this proof-derived layer is absent (see AC2b).
- AC2b: **Day-1 import layer.** When the persisted import graph (`.ana/state/code-graph.json`) is present, **Also changes with** surfaces the file's direct import relationships (imported-by / imports) as a static blast-radius layer, capped, available with only `ana init` run — no proof chain required. This layer renders on fresh repos and enriches with the proof layer on mature ones. With neither graph nor proof chain, the section is absent (AC7).
- AC3: Same-stem test partners (e.g. `work.ts` ↔ `work.test.ts`) are suppressed from the proof co-change layer of **Also changes with**, with a one-line note that a partner was suppressed.
- AC4: Each **proof co-change** partner is flagged `hidden` (in graph, no import edge), `imports` (edge exists), or `unknown` (file absent from graph, or no graph present) — **never a fabricated relationship**. Absence of the graph yields `unknown`, not a crash and not `hidden`. The day-1 import layer (AC2b) is not flagged — it *is* the import edges.
- AC5: Co-change couples appear only when both files clear `MIN_TOUCHES` (≥3 work items) and the couple clears `MIN_COTOUCH` (≥2 shared verified items) — the harvested mega-refactor guard.
- AC6: `ana proof <slug> --why` renders **signal only** — `scope_summary`, failed/deviated assertions with reasons, open findings, `modules_touched` — and **omits** cost, token counts, hashes, timing, provenance, and attestation.
- AC7: With no proof chain, **Shaped by** and the proof co-change layer are **absent**, not fabricated — honest "compounds with use." With no proof chain *and* no import graph, **Also changes with** is absent entirely. `getProofContext` returns cleanly in every case.
- AC8: `ProofContextResult` gains `shaped_by` and `also_changes_with` as **optional** fields; existing consumers and the JSON shape for old callers are unaffected.
- AC9: `scope_summary` is truncated to a hard character cap in **Shaped by**; never reworded or embellished.
- AC10: The default `ana proof context` first-screen for a hot file (e.g. `work.ts`: 69 shapers, 9 partners) renders within the caps — a first-screen, not a record.
- AC11: `ana.md` scope process runs `ana proof context` on seed files as a non-optional step for any scope touching existing code, sequenced so file identification precedes (or is explicitly seeded by) the query, and frames co-change as blast-radius discovery.
- AC12: `ana-verify.md` directs Verify to consume findings **and** co-change, drops the "context, not a checklist" hedge, and instructs that the shaped-by history is orientation only — Verify forms findings independently (protects the two-account independence model).
- AC13: `ana-plan.md` includes the co-change partners of affected files in the Build Brief, so Build inherits "don't forget B" without running the command (preserves Build's spec-only discipline).
- AC14: Codex mirror templates (`.codex/agents/{ana,ana-plan,ana-verify}.md`) carry the equivalent guidance — the change works for both platforms.

## Edge Cases & Risks
- **Context bloat is the headline risk.** Caps (top 3 each), test-partner suppression, truncation, and the signal-only drill-down are the mitigations. The default must be a first-screen. (AC1–3, AC6, AC9, AC10.)
- **The drill-down cascade.** "3 slugs shaped this" → agent drills all 3 → ~3,400 tokens of hashes/cost/provenance under today's all-or-nothing `ana proof <slug>`. `--why` (AC6) cuts each drill to ~200 signal-only tokens. Plan should also weigh whether the Shaped-by footer should *discourage* reflexive drilling (drill only on a specific signal), via wording.
- **Hidden-flag honesty.** A partner not in the import graph must be `unknown`, never `hidden` and never `imports`. The branch already does this correctly (`reading-order` returns `null`/low-confidence for off-graph files) — preserve it. (AC4.)
- **Graph staleness.** `.ana/state/code-graph.json` is written at `init` and `work complete` — same cadence as the proof chain — so it's reasonably fresh on any pipeline-using repo. Absent/stale graph → `unknown`, never blocking. Plan to confirm the freshness assumption and decide whether to surface a staleness note.
- **scope_summary quality varies by customer.** It's only as good as their scope.md. Truncate; never embellish. Dogfood-strong, weaker on undisciplined repos — acceptable, it compounds with use.
- **Mega-work-item spurious pairs.** One item touching 100 files manufactures pairs — held by `MIN_COTOUCH=2` (harvested, tested). The branch has **no** oversized-item cap beyond the gate; confirm the gate is sufficient on our 208-entry chain or add a cap.
- **Monorepo path forms.** `modules_touched` is repo-relative; the query path must reconcile. The branch uses paths as-is with no normalization — Plan must verify the query-path-to-`modules_touched` match handles our path forms (the same reconciliation the REQ flagged).
- **Fresh-repo dormancy (mitigated, not eliminated).** No proof chain → no `shaped_by`, no proof co-change layer. But the **day-1 import layer** (AC2b) fires on any repo with `ana init`, so a fresh repo still gets real blast radius — the section enriches as proof accrues. The "why" stays honestly absent (never faked). Stated, not hidden. (AC2b, AC7.)
- **Day-1 layer must not be redundant noise for heavy users.** The import layer and the proof layer are complementary (visible vs hidden coupling), not duplicative — but Plan must ensure they render as one coherent section, not two overlapping lists. When a proof partner *is* an import edge (`imports`), it should not also be repeated in the import layer.
- **Adoption regression.** Adding sections without fixing the templates makes the command heavier *and* still under-run. The template work (AC11–14) is not optional polish — it is half the value.

## Rejected Approaches
- **A `--for {think|plan|verify}` role-targeted output.** Considered and cut. Per-agent output logic + a flag is added complexity and CLI surface for a marginal token saving over a hard-capped uniform output. "Every vector is a risk; minimize the big one." The big risk (bloat) is handled by caps; per-role tailoring is the 10%-gain-for-2x-complexity trap. Per-agent nuance lives in template wording, which is free.
- **A scan.json field for any of this.** The `feature/devday-scan` mistake — global, always-loaded, ~11k-token dump to every agent every run. The pull surface is the correct home. (*The elegant solution removes.*)
- **Git-derived co-change here (v1).** Git's one genuine gift is fresh-repo *hidden* coupling (the import graph can't show hidden by definition; proof needs history). But pulling it in re-imports the entire squash-merge / rename / shallow-clone edge-case surface set down with `scan-coupling-conventions`, for a noisier, lower-trust version of a blast-radius signal the day-1 import layer (AC2b) already serves cleanly. That is the "2x complexity for 10%" line. **Held as a deliberate future option (Phase 3), not a v1 hedge** — revisit only if fresh-repo hidden coupling proves a real felt gap once this ships.
- **Faking "why" from git on fresh repos.** Commit-message mining is the inferred-why already rejected as off-thesis, and it is worst exactly where there is no proof (vibe-coded sniper-customer repos with "wip / fix" commits). Fresh repos get honest absence on "why," not a diluted differentiator.
- **Inferred "why" (git blame / commit-message mining).** Lower evidence tier, off-thesis. Only verified-work-item intent.
- **Rebuilding co-change from scratch.** The branch's analyzer lifts cleanly; rebuilding is waste.
- **A new Build caller.** Build stays spec-only; it gets co-change through Plan's Build Brief (AC13).

## Open Questions
*(Design-judgment calls for AnaPlan — factual ones are resolved in Exploration Findings.)*
- **`shaped_by` ranking** — when 69 items shaped one file and only 3 show, what's the ordering? Lean: most-recent-first, surfacing `kind` so feature/milestone is visible over chore. Plan to decide whether recency alone is the right signal or whether kind/churn should weight it.
- **Drill-down framing** — should the Shaped-by footer actively discourage reflexive drill-into-all (drill only on a specific signal), and how is that worded without nagging?
- **Graph staleness surfacing** — silently use the persisted graph, or note its age when it's old? Lean: silent + `unknown` for off-graph files; revisit only if staleness proves misleading.
- **Oversized-item cap** — is `MIN_COTOUCH=2` sufficient on our chain, or is an explicit per-item file-count cap warranted? Empirical — calibrate against the 208-entry chain.
- **Where `also_changes_with` assembly lives** — extend `getProofContext` directly, or call the harvested `proof-history` analyzer and join? Lean: call the analyzer (it already returns `intentCouples`), join in `getProofContext`.
- **How the two `also_changes_with` layers compose visually** — one merged ranked list (import edges + hidden co-change interleaved by signal), or two labeled sub-groups ("Imports" / "Changes together — hidden")? And the dedup rule when a proof partner is also an import edge. Lean: a single list, hidden co-change ranked first (it's the surprising, higher-value signal), import edges below, no entry shown twice. Plan to decide the exact render.
- **Day-1 import layer cap and direction** — cap imported-by vs imports separately or together? A widely-imported module could have 50 importers. Calibrate the cap; consider whether imported-by (who breaks if I change this) outranks imports (what I depend on) for an editing agent.

## Exploration Findings

### Patterns Discovered
- `proofSummary.ts:1256` `getProofContext` **already iterates every proof entry per queried file** to compute `touch_count`/`last_touched`, reading `completed_at`, `feature`, `findings`, `build_concerns`. It uses a minimal projection `ProofChainEntryForContext` (`:1177`) that **omits `scope_summary` and never reads `modules_touched`** — both new sections are near-free additions to a loop that already runs.
- `proof.ts:3158` `formatContextResult` currently renders header + findings + build_concerns. It emits **no slugs and no drill-down hint today** — so the cascade surface is something this scope *introduces*, which is exactly why `--why` must ship with it.
- `proof.ts:281` `formatHumanReadable` is the `ana proof <slug>` renderer: ~28 lines / ~1,125 tokens, of which hashes (6 sha256), provenance (per-session tokens/cost/turns), timing segments, and attestation (mandate/transcript hashes) are noise for an agent. No focused mode exists — `--why` is net-new.
- Drill-down already exists as a command: `ana proof <slug>` (`proof.ts:1079-1117`, `formatHumanReadable`). `--why` is a render mode on it, not a new command.

### Constraints Discovered
- [TYPE-VERIFIED] `ProofContextResult` (`proofSummary.ts:1147`) = `{query, findings[], build_concerns[], touch_count, last_touched}`. Add `shaped_by?` and `also_changes_with?` as optional. `EngineResultPartial`-style validators are not in this path — old callers unaffected.
- [TYPE-VERIFIED] `ProofChainEntry` (`types/proof.ts:298`) carries `slug` (`:299`), `kind` (`:335`), `completed_at` (`:331`), `modules_touched` (`:333`), `scope_summary` (`:334`) — all present; `scope_summary` populated 208/208 and decision-bearing.
- [TYPE-VERIFIED] Branch `proof-history/index.ts`: `MIN_TOUCHES=3`; `reading-order/index.ts`: `MIN_COTOUCH=2` (documented as the mega-refactor-artifact guard). `intentCouples` dedupes files within an item, forms sorted unordered pairs, accumulates linking slugs, gates both files at `MIN_TOUCHES`.
- [TYPE-VERIFIED] Hidden flag (`reading-order/index.ts` ~`:355`): both files in `graph.nodes` + no edge either direction → `hidden`; partner absent from graph → not claimed (low-confidence/`null`). Honest by construction.
- [OBSERVED] `proof-history` analyzer reads **only** `.ana/proof_chain.json` — imports are Node built-ins + types, zero scan-engine/`ProjectCensus` coupling. Clean lift onto a read-only command.
- [OBSERVED] `buildGraph.ts` `persistCodeGraph` writes `.ana/state/code-graph.json` at init + completeWork rescan; `ana scan` never writes it. **No reader exists on the branch** — the reader is new work in this scope.
- [OBSERVED] The branch has **no** same-stem test-partner suppression — new work here.
- [OBSERVED] `ana-build.md` is not a caller of `ana proof context`; Build gets proof awareness via the spec's Build Brief.

### Test Infrastructure
- Harvestable: `packages/cli/tests/engine/analyzers/proof-history.test.ts` (no-chain → null, dedup, gate, legacy entries lacking `modules_touched`, malformed shape, determinism, same-basename by full path) and `reading-order.test.ts` (hidden detection, off-graph → low-confidence, one-off gating).
- New tests required: test-partner suppression; `code-graph.json` reader (present/absent/stale → `unknown`); `formatContextResult` caps + footers for a hot file; `--why` signal-only render (asserts hashes/cost/provenance are **absent**); empty-chain → sections absent.
- Existing: contract/analyzer tests; command tests for `proof` subcommands.

## For AnaPlan

### Structural Analog
`getProofContext` + `formatContextResult` are their own structural analog — the loop and renderer already exist and already shape per-file proof output. This scope extends them in place. For the harvested engine logic, `proof-history/index.ts` on `feature/devday-scan` is the source; for the `--why` render mode, `formatHumanReadable` (`proof.ts:281`) is the function to add a filtered branch to.

### Relevant Code Paths
- `packages/cli/src/utils/proofSummary.ts:1147` (`ProofContextResult`), `:1177` (`ProofChainEntryForContext` projection — widen it), `:1256` (`getProofContext` loop — collect new data here).
- `packages/cli/src/commands/proof.ts:3158` (`formatContextResult` — render new sections), `:281` (`formatHumanReadable` — add `--why`), `:1079-1117` (`ana proof <slug>` handler — wire `--why`), `:1127-1159` (`handleProofContext`).
- `packages/cli/src/types/proof.ts:298` (`ProofChainEntry`).
- `feature/devday-scan`: `packages/cli/src/engine/analyzers/proof-history/index.ts` (harvest), `reading-order/index.ts` (hidden-flag logic), `graph/buildGraph.ts` (`persistCodeGraph` — write side exists; add the read side).
- Templates: `packages/cli/templates/.claude/agents/{ana.md:108, ana-plan.md:438, ana-verify.md:105}` + `.codex` mirrors.

### Patterns to Follow
- Optional-field additions to the result type (old callers unaffected) — the same grouped-object discipline used across the proof types.
- Honest absence: section omitted, never fabricated (mirrors how `getProofContext` already returns clean empties).
- The `unknown`/`hidden`/`imports` trichotomy from the branch's `reading-order` — never collapse `unknown` into `imports: false`.
- Caps + "N more · drill down" footers — the existing FindingsList overflow pattern (`+N more`) is the house style.

### Known Gotchas
- The cascade: `--why` must ship in the same phase as any drill-down hint, or the hint is a bloat trap. Do not add a `shaped_by` drill-down hint before `--why` exists.
- Hidden flag honesty: off-graph → `unknown`, never `hidden`/`imports`.
- Test-partner suppression is net-new — the branch doesn't do it; don't assume the harvest covers it.
- The graph reader is net-new — the branch persists but never reads `code-graph.json`. It now serves two purposes (day-1 import layer + the `hidden` flag), so build it as a shared reader, not buried inside the co-change path.
- `code-graph.json` is written at `ana init` and `work complete` — confirm `ana init` write path actually fires for a fresh user so the day-1 layer is genuinely day-1 (verify, don't assume).
- `scope_summary` truncation must not embellish — hard char cap, raw text.
- Monorepo path reconciliation between query path and repo-relative `modules_touched`.
- Codex mirrors must move in lockstep — never scope a template change that assumes one platform.

### Things to Investigate
- `shaped_by` ranking signal (recency vs kind vs churn) when many items shaped one file.
- Whether `MIN_COTOUCH=2` alone is sufficient against mega-items on the 208-entry chain, or an explicit per-item file-count cap is warranted.
- Whether to surface graph staleness or stay silent + `unknown`.
- Exact char caps / item caps that keep a hot file's first-screen tight (calibrate against `work.ts`).
- Whether `also_changes_with` is best assembled by calling the harvested analyzer and joining, vs inlining the pair computation into `getProofContext`.
