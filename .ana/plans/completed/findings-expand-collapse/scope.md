# Scope: FindingsList expand/collapse for proof pages

**Created by:** Ana
**Date:** 2026-05-14

## Intent

Nearly half of proof pages (46 of 96 entries, 48%) show truncated findings with no way to view the rest. FindingsList hard-caps at 5 items and renders a "+N more findings" badge that is purely informational. Users see data is hidden but have no way to reveal it. AssertionLedger on the same page already has expand/collapse — FindingsList should match.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — single component file, ~15 lines changed
- **Files affected:** `website/components/docs/proof/FindingsList.tsx`
- **Blast radius:** None. No other components import FindingsList. Parent page passes `findings` as a prop — no changes needed upstream. The component becomes a client island, matching AssertionLedger which is already a client island on the same page.
- **Estimated effort:** 15 minutes
- **Multi-phase:** no

## Approach

Convert FindingsList from a server component to a client component and add toggle state so users can expand and collapse the full findings list. Reuse the existing "+N more" badge as the toggle target rather than adding new UI elements.

## Acceptance Criteria
- AC1: FindingsList renders all findings when expanded, first 5 when collapsed
- AC2: The "+N more findings" badge is clickable and toggles between expanded/collapsed states
- AC3: When expanded, the badge text changes to "collapse ↑"
- AC4: When collapsed after expansion, the badge returns to "+N more findings"
- AC5: Pages with 5 or fewer findings render identically to current behavior (no badge, no toggle)

## Edge Cases & Risks
- 0 findings: parent doesn't render the component — no change needed
- 1–5 findings: no badge rendered, no toggle — identical to current behavior
- 6 findings: badge shows "+1 more" — toggle works for a single additional item, consistency over optimization
- 19 findings (observed max): all 19 render when expanded, page scrolls naturally, no max-height needed
- Server/client boundary: `ProofFinding` type is a plain object (strings/numbers) — serializable across the boundary without issue

## Rejected Approaches
- **Toggle above the list (like AssertionLedger):** The "+N more" badge already sits at the bottom where the user's eye lands after scanning. Repurposing it is less code and puts the action where attention already is.
- **Max-height with scroll when expanded:** Adds complexity for a max of 19 findings. Natural page scroll is sufficient.
- **Raising the threshold from 5 to 8:** Finding cards are taller than assertion table rows. 5 is a reasonable default to avoid overwhelming the viewport.

## Open Questions

None.

## Exploration Findings

### Patterns Discovered
- AssertionLedger.tsx: `"use client"`, `useState(false)`, `expanded ? all : slice(0, N)`, text toggle with `cursor: pointer` and `color: var(--brand-light)` styling
- FindingsList.tsx lines 98–134: "+N more" badge is a full card-styled div with severity badge layout — repurpose as the toggle target

### Constraints Discovered
- [OBSERVED] Server component — FindingsList has no `"use client"` directive, must be added for `useState`
- [OBSERVED] Client island pattern — AssertionLedger already establishes the pattern on the same proof page
- [TYPE-VERIFIED] ProofFinding (lib/docs-data/types.ts) — plain object type, safe for server→client serialization

### Test Infrastructure
- Website has no test suite. Verification is build success + visual inspection.

## For AnaPlan

### Structural Analog
`website/components/docs/proof/AssertionLedger.tsx` — same page, same expand/collapse UX, same `useState` + slice pattern. Direct template.

### Relevant Code Paths
- `website/components/docs/proof/FindingsList.tsx` — the only file to change
- `website/components/docs/proof/AssertionLedger.tsx` — pattern reference (read, don't modify)

### Patterns to Follow
- AssertionLedger's `useState(false)` + ternary slice pattern
- Toggle text styling: `cursor: pointer`, `color: var(--brand-light)`, `borderBottom: 1px solid var(--ink-25)`
- "collapse ↑" as the expanded-state label

### Known Gotchas
- The "+N more" badge (lines 98–134) needs `cursor: pointer` added and an `onClick` handler. It's currently a plain div — make sure the interactive affordance is visible.
- The `extra` variable (line 29) is computed as `findings.length - 5`. This stays the same — it controls whether the badge renders at all, independent of expanded state.

### Things to Investigate
- None. The pattern is established and the change is mechanical.
