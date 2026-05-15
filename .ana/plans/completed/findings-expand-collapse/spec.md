# Spec: FindingsList expand/collapse for proof pages

**Created by:** AnaPlan
**Date:** 2026-05-14
**Scope:** .ana/plans/active/findings-expand-collapse/scope.md

## Approach

Convert FindingsList from a server component to a client component by adding `"use client"` and `useState`. Follow AssertionLedger's exact expand/collapse pattern: `useState(false)` + ternary slice.

The existing "+N more findings" badge (lines 98–134) becomes the toggle target. Add `cursor: pointer` and an `onClick` handler to the outer badge div. When expanded, replace the badge content with "collapse ↑" text styled identically to AssertionLedger's collapse toggle.

The `extra` variable continues to gate whether the badge renders at all — it's independent of expanded state.

## Output Mockups

**Collapsed (current behavior, now clickable):**
```
┌──────────────────────────────────┐
│ [risk] src/engine/scan.ts    → … │  ← finding card 1
│ Missing null check on return     │
└──────────────────────────────────┘
  ... (cards 2–5) ...
┌──────────────────────────────────┐
│ [+3]  more findings              │  ← clickable badge
└──────────────────────────────────┘
```

**Expanded (after clicking badge):**
```
┌──────────────────────────────────┐
│ [risk] src/engine/scan.ts    → … │  ← finding cards 1–8 (all)
│ Missing null check on return     │
└──────────────────────────────────┘
  ... (all cards) ...
┌──────────────────────────────────┐
│ collapse ↑                       │  ← clickable, same card style
└──────────────────────────────────┘
```

**5 or fewer findings:** No badge rendered. Identical to current behavior.

## File Changes

### `website/components/docs/proof/FindingsList.tsx` (modify)
**What changes:** Add `"use client"` directive. Import `useState`. Add `expanded` state. Change `visible` from `findings.slice(0, 5)` to a ternary: `expanded ? findings : findings.slice(0, 5)`. Make the "+N more" badge clickable with `onClick` toggling state. When expanded, swap badge content to "collapse ↑" text.
**Pattern to follow:** `website/components/docs/proof/AssertionLedger.tsx` — same `useState(false)`, same ternary slice, same toggle text styling (`cursor: pointer`, `color: var(--brand-light)`, `borderBottom: 1px solid var(--ink-25)`).
**Why:** Without this, 48% of proof pages show truncated findings with no way to reveal the rest.

## Acceptance Criteria
- [ ] AC1: FindingsList renders all findings when expanded, first 5 when collapsed
- [ ] AC2: The "+N more findings" badge is clickable and toggles between expanded/collapsed states
- [ ] AC3: When expanded, the badge text changes to "collapse ↑"
- [ ] AC4: When collapsed after expansion, the badge returns to "+N more findings"
- [ ] AC5: Pages with 5 or fewer findings render identically to current behavior (no badge, no toggle)
- [ ] AC6: Website builds without errors (`cd website && npx next build`)

## Testing Strategy
- **Unit tests:** None — website has no test suite.
- **Integration tests:** None.
- **Verification:** Build success + visual inspection on proof pages with >5 findings.

## Dependencies
None. Single component, no upstream changes.

## Constraints
- ProofFinding is a plain object type — serialization across the server/client boundary is safe.
- No other components import FindingsList — zero blast radius.

## Gotchas
- The badge div (lines 98–134) is currently a plain div with `opacity: 0.75`. When it becomes interactive, keep the opacity but add `cursor: pointer` so the affordance is visible.
- When expanded, the badge still renders (with "collapse ↑" text). Don't conditionally hide it — the user needs a way to collapse back.
- The `extra` variable guards badge rendering (`extra > 0`). Don't touch this logic — it correctly prevents the badge from appearing when there are ≤5 findings, regardless of expanded state.

## Build Brief

### Rules That Apply
- `"use client"` directive must be the first line of the file, before any imports.
- Use `import type` for type-only imports, separate from value imports.
- 2-space indentation.
- Named exports only.

### Pattern Extracts

From `website/components/docs/proof/AssertionLedger.tsx` lines 1–16 — the client component + state + slice pattern:
```tsx
"use client";

import { useState } from "react";
import type { ProofAssertion } from "@/lib/docs-data/types";

// ...

export function AssertionLedger({ assertions, total, className }: AssertionLedgerProps) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = assertions.length > 8;
  const visible = expanded ? assertions : assertions.slice(0, 8);
```

From `website/components/docs/proof/AssertionLedger.tsx` lines 39–44 — the collapse toggle styling:
```tsx
<span
  onClick={() => setExpanded(false)}
  style={{ cursor: "pointer", color: "var(--brand-light)", borderBottom: "1px solid var(--ink-25)" }}
>
  collapse ↑
</span>
```

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands
- After modifying FindingsList.tsx: `cd website && npx next build` — Expected: builds successfully
- Lint: `pnpm run lint`

### Build Baseline
- Website has no test suite. Build success is the verification.
- Command: `cd website && npx next build`
- Regression focus: `website/components/docs/proof/FindingsList.tsx` — ensure proof pages with ≤5 findings still render without a badge.
