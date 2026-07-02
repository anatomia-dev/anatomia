---
req: REQ-consumption-proof
title: Prove retrieved memory gets used — the consumption metric
priority: high
status: open
created: 2026-07-02
source: roadmap Step 4 (critiques w1-03/w2-03) + founder design sessions 2026-07-01
appetite: 2-3 days
---

## Problem

The memory loop can prove findings are *retrieved* at decision time, but nothing checks whether agents actually *use* what they're handed — the product's hero claim ("decision-time institutional memory") is asserted, not measured.

## Evidence

Retrieval is wired and verified at every decision point: Think/Plan/Verify run `ana proof context`, and the harness deterministically injects a Risk Profile into Build's worktree context (`work.ts` → `getProofContext`, no LLM in the path). But: (1) nothing verifies a `resolves:[id]` claim points at an id that was actually in the retrieved set for the touched files; (2) the Risk Profile renders severity + summary **without finding ids** (`work.ts:~1746/1760`), so Build literally cannot cite what it consumed; (3) the only existing "effectiveness" metric, `reduction_pct` (`proof-health.ts:321-370`), divides by all subsequent entries instead of entries touching the promoted file — inflating the win 13–50×, reporting ~94–98% "effective" regardless of reality — and is rendered nowhere. Corpus facts: 30–45% of confident headline claims in research-wave REQs were later corrected; 34 findings carry structured `resolves` arrays. The metric is the number an honest narrative (and the AnaWeb dashboard) needs and cannot currently produce.

## Done Looks Like

At `ana work complete`: the harness computes `retrieved` (active finding ids from `getProofContext` over the files the diff actually touched — the same filter agents saw), scrapes `cited` (all `resolves:[id]` claims plus finding ids referenced in plan.md and verify_report.md), records `consumed = |cited ∩ retrieved| / |retrieved|` on the proof entry, and prints it in the completion summary. A soft WARN — never a block — lists retrieved `severity:risk` findings with no citation or disposition. `ana proof health` gains one aggregate line. The Risk Profile carries finding ids. `reduction_pct` and `computePromotionEffectiveness` are deleted. The number is re-derivable by a stranger from the chain.

## Leads

Full design exists in `anatomia_reference/MINTED_ROADMAPS/anatomia/critique/w2-03-memory-consumption-proof.md` (the formula, the `verify-consumption` command shape, the risk-scoped soft gate) — treat as leads to verify, not gospel. Denominator must reuse `getProofContext`'s active-filter (`proofSummary.ts`) as the single source of truth. Put the computation in a new module — `proofSummary.ts` carries five oversize findings; `proof-health.ts` goes net-negative from the deletion. One-line template nudge in plan + verify (both platforms) to cite finding ids when addressing retrieved findings, or the numerator silently starves.

## Constraints

The WARN never blocks completion and applies to `severity:risk` only — a hard must-disposition gate was explicitly rejected (wave-1: it trains rubber-stamping and fights the "findings are context, not a checklist" design). Metric keys on actually-touched files from the diff, not the contract's declared `file_changes`. No growth of `proofSummary.ts`.

## Not This

No dashboard/visualization beyond the one health line (rendering waits for real data). No per-finding disposition ceremony for observations/debt. Not a fix of `reduction_pct` — delete it; this metric is its honest replacement.

## Open Questions

Exact proof-entry field shape (`consumption: {rate, retrieved, cited, unaddressed_risks}`?). Whether the citation scan also reads build_report.md or stays plan + verify + `resolves`. Whether an all-zero denominator (no findings retrieved) records `null` or is omitted.

## Relationship to Other Work

Kin to `requirements-contract` — both convert a loop from asserted to measured. The first numbers may be low; that is the metric working (retrieved-and-ignored is exactly what it exists to expose). This is the stat the AnaWeb dashboard should eventually headline.
