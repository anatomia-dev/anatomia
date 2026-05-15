# Verify Report: FindingsList expand/collapse for proof pages

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-14
**Spec:** .ana/plans/active/findings-expand-collapse/spec.md
**Branch:** feature/findings-expand-collapse

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/findings-expand-collapse/contract.yaml
  Seal: INTACT (hash sha256:3d7587634f9453c0278b5c91008a09296110465ff40e9b211f725111f0c45354)
```

Seal status: **INTACT**

Tests: N/A — website has no test suite (spec confirms). Build: ✅ success (`cd website && npx next build`). Lint: ✅ pass (1 pre-existing warning, not introduced by this build).

## Contract Compliance

Testing strategy is build-only per spec. No `@ana` tags expected. All assertions verified by source inspection.

| ID   | Says                                                        | Status        | Evidence |
|------|-------------------------------------------------------------|---------------|----------|
| A001 | Findings list shows only the first 5 findings by default    | ✅ SATISFIED   | `FindingsList.tsx:32` — `useState(false)` initializes collapsed; `findings.slice(0, 5)` when `expanded` is false |
| A002 | Clicking the badge reveals all hidden findings              | ✅ SATISFIED   | `FindingsList.tsx:32` — `expanded ? findings : findings.slice(0, 5)` shows all when expanded; `FindingsList.tsx:104` — `onClick={() => setExpanded(!expanded)}` toggles state |
| A003 | The badge is clickable with a pointer cursor                | ✅ SATISFIED   | `FindingsList.tsx:111` — `cursor: "pointer"` on the badge div |
| A004 | Expanded badge shows collapse text instead of the count     | ✅ SATISFIED   | `FindingsList.tsx:123-130` — ternary renders `collapse ↑` when expanded; badge content ("+N more") hidden via else branch |
| A005 | Collapsing returns to showing only 5 findings               | ✅ SATISFIED   | `FindingsList.tsx:104` — `setExpanded(!expanded)` toggles back to false; line 32 slices to 5 when false |
| A006 | After collapsing, the badge shows the hidden count again    | ✅ SATISFIED   | `FindingsList.tsx:131-151` — when `!expanded`, renders `+{extra}` and `more findings` spans |
| A007 | Pages with 5 or fewer findings show no toggle badge         | ✅ SATISFIED   | `FindingsList.tsx:33` — `extra = findings.length - 5`; line 102 — `extra > 0` gates badge rendering. ≤5 findings → extra ≤ 0 → no badge |
| A008 | The component uses client-side state for toggling            | ✅ SATISFIED   | `FindingsList.tsx:1` — `"use client"` directive as first line |

8/8 assertions SATISFIED.

## Independent Findings

**Prediction resolution:**
1. Badge/expanded interaction bug — **Not found.** `extra > 0` is computed from array length, independent of `expanded` state.
2. Missing style properties — **Not found.** All three match AssertionLedger exactly.
3. `"use client"` placement — **Not found.** Correctly on line 1.
4. Wrong threshold (8 vs 5) — **Not found.** Uses 5 throughout.
5. onClick on wrong element — **Not found.** onClick is on the outer badge div as spec requires. Inner span has redundant `cursor: pointer`.

**What I didn't predict:** The badge div is an interactive element (`onClick`) but lacks `role="button"` and `tabIndex={0}` — keyboard users can't focus or activate it. AssertionLedger uses `<span>` with onClick too, so this is a pre-existing pattern limitation, not a regression.

## AC Walkthrough

- ✅ **AC1:** FindingsList renders all findings when expanded, first 5 when collapsed — Line 32: `expanded ? findings : findings.slice(0, 5)`. Confirmed by source inspection.
- ✅ **AC2:** The "+N more findings" badge is clickable and toggles — Line 104: `onClick={() => setExpanded(!expanded)}` on badge div. Confirmed.
- ✅ **AC3:** When expanded, badge text changes to "collapse ↑" — Lines 123-130: ternary renders collapse span when expanded. Confirmed.
- ✅ **AC4:** When collapsed after expansion, badge returns to "+N more findings" — Lines 131-151: else branch renders `+{extra}` and "more findings". Confirmed.
- ✅ **AC5:** Pages with ≤5 findings render identically (no badge, no toggle) — Line 102: `extra > 0` guard unchanged from original. Confirmed.
- ✅ **AC6:** Website builds without errors — Ran `cd website && npx next build`, completed successfully with 96+ static pages generated.

6/6 acceptance criteria PASS.

## Blockers

No blockers. All 8 contract assertions satisfied, all 6 ACs pass, build succeeds, no regressions. Checked for: unused exports in new code (none — `FindingsList` is the only export, imported by `app/docs/proof/[slug]/page.tsx`), dead code paths (none — every `if` and ternary branch is reachable), unhandled error paths (component is pure render, no error paths to handle), scope creep (no new parameters, exports, or features beyond spec).

## Findings

- **Code — Redundant cursor:pointer on inner collapse span:** `website/components/docs/proof/FindingsList.tsx:125` — The parent badge div (line 111) already sets `cursor: "pointer"`. The inner `<span>` repeats it. Not harmful but unnecessary — the AssertionLedger pattern sets cursor on the span because the span is the interactive element there (no wrapping clickable div). Here the click handler is on the div, making the span's cursor redundant.
- **Code — Toggle pattern deviation from AssertionLedger:** `website/components/docs/proof/FindingsList.tsx:104` — Uses `setExpanded(!expanded)` on one element, while AssertionLedger uses separate `setExpanded(true)` and `setExpanded(false)` calls on distinct elements. Functionally equivalent but a minor pattern inconsistency. The toggle approach is arguably cleaner for this use case since both actions share the same click target.
- **Code — Badge opacity persists when interactive:** `website/components/docs/proof/FindingsList.tsx:111` — The `opacity: 0.75` was appropriate when the badge was decorative. Now that it's interactive, the reduced contrast slightly weakens the click affordance. Not a blocker — `cursor: pointer` provides the primary affordance — but worth noting for a future polish pass.
- **Code — No ARIA attributes on interactive div:** `website/components/docs/proof/FindingsList.tsx:103` — The badge div has `onClick` but no `role="button"`, no `tabIndex={0}`, no `onKeyDown` handler. Keyboard-only users cannot focus or activate the toggle. This matches the AssertionLedger pattern (which also lacks these), so it's a pre-existing gap, not a regression. Worth scoping as a future accessibility improvement across both components.
- **Upstream — Contract has no keyboard accessibility assertion:** The contract tests pointer interaction only. An A009 asserting keyboard focus/activation would catch the accessibility gap above. Not a fault of the builder — the contract didn't require it.

## Deployer Handoff

Single file change to `website/components/docs/proof/FindingsList.tsx`. Converts it from server to client component. The only consumer is `app/docs/proof/[slug]/page.tsx`. ProofFinding objects are plain data — no serialization risk across the server/client boundary. Build succeeds. No environment variables, config changes, or migration steps needed. The lint warning (`no-control-regex` unused disable) is pre-existing and unrelated.

## Verdict
**Shippable:** YES

Clean implementation. One file changed, follows the AssertionLedger pattern closely, all contract assertions satisfied by source inspection, website builds successfully. The accessibility gap (no keyboard support on the toggle) is a pre-existing pattern limitation shared with AssertionLedger — worth scoping as a future improvement but not a regression.
