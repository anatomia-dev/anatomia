# Scope: Add milestone kind

**Created by:** Ana
**Date:** 2026-05-12

## Intent

The kind system classifies work as `feature`, `fix`, or `chore`. These three values are accurate but incomplete — there's no way to distinguish routine feature work from significant new capabilities. A filter button added to an existing page and an entirely new authentication system are both "feature." This matters because kind flows into the proof chain, the website ship log, and will soon drive branch prefix selection (Scope 2: kind-aware branch prefixes). A fourth kind, `milestone`, gives Ana and developers a way to signal "this is announcement-worthy" — enabling downstream consumers to surface significant work differently from routine work.

## Complexity Assessment
- **Kind:** feature
- **Size:** small — enum expansion across known touchpoints, no new systems
- **Files affected:**
  - `packages/cli/src/commands/artifact.ts` (validator, 2 lines)
  - `packages/cli/src/utils/proofSummary.ts` (parser return type + match, 3 lines)
  - `packages/cli/src/types/proof.ts` (TypeScript union type, 1 line)
  - `packages/cli/templates/.claude/agents/ana.md` (scope template guidance, 1 line)
  - `.claude/agents/ana.md` (dogfood copy, 1 line)
  - `website/lib/proof-feed.ts` (ProofKind type + resolveKind, 2 lines)
  - `website/components/proof-feed/ProofFeed.tsx` (kindClass + kindLabel, 4 lines)
  - `website/components/proof-feed/proof-feed.module.css` (new badge style, 1 line)
  - `docs-research/supermock/pages.js` (configurability guide scope template, 1 line)
  - `docs-research/supermock/data.js` (scope template in mock data, 1 line)
- **Blast radius:** Low. Every consumer of kind already handles `undefined` (65 of 78 proof chain entries lack kind). Adding a fourth value to an already-optional field has no effect on existing entries, existing scopes, or existing tests. The only code that needs changes is code that hardcodes the allowed values.
- **Estimated effort:** ~30 minutes
- **Multi-phase:** no

## Approach

Expand the kind enum from three values to four across all consumers. The change is purely additive — no existing behavior changes, no schema migration, no data backfill. `milestone` joins the existing `feature / fix / chore` set everywhere the set is defined: the scope validator, the scope parser, the TypeScript types, the agent template, and the website display layer.

The Ana agent template gets classification guidance so the LLM can reliably distinguish `feature` from `milestone`. The guidance must be universal — it has to work for any product, not just Anatomia.

## Acceptance Criteria

- AC1: `ana artifact save scope` accepts `**Kind:** milestone` without error
- AC2: `ana artifact save scope` still rejects invalid kinds (e.g., `**Kind:** epic`) with an error message listing all four valid values
- AC3: `extractScopeKind()` returns `'milestone'` when scope contains `**Kind:** milestone`
- AC4: `extractScopeKind()` returns `'milestone'` for case-insensitive input (`**Kind:** Milestone`)
- AC5: The `ProofSummary` and `ProofChainEntry` TypeScript types include `'milestone'` in their `kind` union
- AC6: A completed pipeline run with `Kind: milestone` in scope produces a proof chain entry with `kind: "milestone"`
- AC7: The Ana agent template lists `feature / fix / chore / milestone` in the Kind field with classification guidance that distinguishes milestone from feature
- AC8: The dogfood Ana agent (`.claude/agents/ana.md`) is byte-identical to the template
- AC9: The website `ProofKind` type includes `"milestone"`
- AC10: The website `resolveKind()` function passes through `"milestone"` without falling back to slug heuristic
- AC11: The website `ProofFeed` component renders milestone entries with a distinct badge style and label
- AC12: The website `MAINTENANCE_MANUAL.md` documents `"milestone"` in the ProofKind type definition
- AC13: The supermock configurability guide and scope template show `feature / fix / chore / milestone`
- AC14: No existing tests break. Test count increases.
- AC15: Existing proof chain entries (with `kind: "feature"`, `kind: "fix"`, `kind: "chore"`, or `kind: undefined`) render identically to today

## Edge Cases & Risks

- **Old CLI reading new data.** A proof chain entry with `kind: "milestone"` is read by an older CLI version. `extractScopeKind()` returns `undefined` (the `if (raw === 'feature' || raw === 'fix' || raw === 'chore')` check fails). The entry still renders — kind is optional everywhere. No crash, no data loss. The kind is just invisible to the old CLI.
- **Old entries without kind.** 65 of 78 proof chain entries lack the `kind` field entirely. The website's `resolveKind()` uses a slug-prefix heuristic (`slug.startsWith("fix-") ? "fix" : "feature"`) for these. No old entry would heuristically resolve to `"milestone"` because the heuristic only checks for `"fix-"`. No behavioral change for old data.
- **Website badge color for milestone.** Needs a distinct visual treatment. Feature uses brand color, fix uses neutral, chore uses border-only. Milestone should be visually elevated — something that signals significance without being garish. The exact color is a design judgment for AnaPlan/AnaBuild. The acceptance criterion is "distinct" — not "specific hex value."
- **Classification subjectivity.** "Is this a milestone or a feature?" is inherently a judgment call. The agent template guidance must be crisp enough that Ana classifies consistently, but the ultimate gate is the developer confirming the scope preview. If the developer disagrees with Ana's classification, they say so during confirmation. This is the existing mechanism for all three current kinds.
- **Compound kinds.** The validator already rejects `**Kind:** fix + chore` (tested at `artifact.test.ts:815`). It would equally reject `**Kind:** milestone + feature`. This is correct — kind is singular. No change needed.
- **The configurability guide is about to ship.** `docs-research/supermock/pages.js` line 694 and `data.js` show `feature / fix / chore` in the scope template. If this scope ships after the guide goes live, the guide would be momentarily out of date. Low risk — the guide is a supermock, not yet wired to production.

## Rejected Approaches

- **Making kinds configurable via ana.json.** The kind list would live in config, letting teams define their own kinds. Rejected because: (1) the TypeScript union type `'feature' | 'fix' | 'chore' | 'milestone'` can't be dynamic — it would have to become `string`, losing type safety across 6+ files; (2) the agent template needs to know valid kinds at prompt-write time, not at runtime; (3) no customer has asked for custom kinds; (4) the `custom` namespace in ana.json already exists for team-specific metadata. If demand appears, this can be revisited — the four-value enum is easier to generalize later than a dynamic system is to constrain.
- **Adding a significance axis instead of a fourth kind.** A separate `**Significance:** high / normal / low` field alongside kind. More expressive but adds complexity to every consumer (scope template, validator, parser, type, proof chain, website). The combinatorial surface (12 combinations) is worse than the flat list (4 values). And the only significance level anyone would act on is "high" — which is exactly what `milestone` captures.
- **Naming it `release`.** Collides with the release branch convention in git (`release/1.2.0` for stabilization). A `milestone` kind driving a `release/` branch prefix in Scope 2 would confuse teams that use release branches for their intended purpose.
- **Naming it `ship`.** Punchy and on-brand for Anatomia, but "Kind: ship" reads as a verb, not a noun. "This work is a ship" doesn't parse. "This work is a milestone" does.
- **Not adding a fourth kind.** Keeps the system simpler but leaves the feature-vs-significant-feature ambiguity permanent. The downstream consumers (kind-aware branch prefixes, potential dynamic website pill) need a signal that doesn't exist today. Three kinds can't express four levels of intent.

## Open Questions

- **Milestone badge color for the website.** Feature uses `var(--brand-soft)` / `var(--brand-deep)`. Fix uses neutral. Chore uses border-only. What color treatment communicates "elevated" without clashing? AnaPlan should decide based on the design system's existing palette. Consider: a warmer or more saturated version of the brand color, or gold/amber as a distinct "special" signal.

## Exploration Findings

### Patterns Discovered
- `artifact.ts:420-428`: Kind validation is a simple if-chain, not a Set or enum lookup. The error message on line 423 and 427 hardcodes the valid values as strings. Both lines need updating.
- `proofSummary.ts:432-444`: `extractScopeKind()` mirrors the validator — same if-chain pattern with `raw === 'feature' || raw === 'fix' || raw === 'chore'`. Return type is a hardcoded union.
- `proof.ts:66`: The TypeScript type is `kind?: 'feature' | 'fix' | 'chore' | undefined`. Same union on `proofSummary.ts:67`.
- `website/lib/proof-feed.ts:21,154-159`: `ProofKind` type and `resolveKind()` both hardcode the three values. `resolveKind` has a fallback heuristic for old entries without kind — it checks `slug.startsWith("fix-")`, otherwise defaults to `"feature"`. Milestone entries would never hit this path because they'll always have an explicit `kind` field.
- `website/components/proof-feed/ProofFeed.tsx:19-28`: `kindClass()` and `kindLabel()` use if-chains. Unknown kinds fall through to `styles.kindChore` (the least-styled option). Without the change, a `"milestone"` entry would render as a chore badge — visually wrong.
- `website/components/proof-feed/proof-feed.module.css:290-293`: Three CSS classes for kind badges. Milestone needs a fourth class.
- `website/MAINTENANCE_MANUAL.md:75`: Documents `ProofKind` as `"feature" | "fix" | "chore"`. Must be updated to include `"milestone"`.

### Constraints Discovered
- [TYPE-VERIFIED] Kind is optional everywhere — `kind?: ... | undefined` in types, `undefined` return from parser, no consumer assumes kind is present
- [TYPE-VERIFIED] No switch statements on kind — all consumers use if-chains, so adding a value doesn't trigger exhaustiveness errors (no default-throw pattern to update)
- [TYPE-VERIFIED] `proof.ts` comment (lines 16-21) warns that adding a field requires changes in 4+ locations — kind already exists as a field, we're only expanding its value set, so this cross-cutting warning doesn't apply
- [OBSERVED] 65 of 78 proof entries lack kind — the system is battle-tested for missing kind values
- [OBSERVED] `formatHumanReadable()`, `formatListTable()`, `formatHealthDisplay()`, and `generateDashboard()` in proof.ts/proofSummary.ts do not display or filter by kind — no CLI display logic needs updating
- [OBSERVED] Build, Verify, Plan, and Learn agent templates do not reference kind values — only the Ana (Think) template does
- [OBSERVED] The artifact.test.ts test at line 815 uses `**Kind:** fix + chore` to verify compound rejection — this test is unaffected

### Test Infrastructure
- `tests/utils/proofSummary.test.ts:1581-1645`: 7 tests for `extractScopeKind` — happy path for each kind, case insensitivity, invalid value, missing line, missing file. Follows pattern of writing a temp scope.md and asserting return value. New `milestone` test follows exact same pattern.
- `tests/commands/artifact.test.ts:780-840`: 2 validation tests — missing Kind field and invalid Kind value. The invalid-value test uses `fix + chore`. Neither test needs modification — they test rejection paths that are unchanged. But a new test should verify `milestone` acceptance.

## For AnaPlan

### Structural Analog
`packages/cli/tests/utils/proofSummary.test.ts:1592-1598` — the `parses feature from Kind line` test. Every new test for milestone follows this exact pattern: write a temp scope.md, call `extractScopeKind()`, assert the return value. The validator test at `artifact.test.ts:675-677` (a passing scope) is the structural analog for acceptance testing.

### Relevant Code Paths
- `packages/cli/src/commands/artifact.ts:420-428` — validator (the gate)
- `packages/cli/src/utils/proofSummary.ts:432-444` — parser (the reader)
- `packages/cli/src/utils/proofSummary.ts:67` — ProofSummary type
- `packages/cli/src/types/proof.ts:66` — ProofChainEntry type
- `packages/cli/templates/.claude/agents/ana.md:189` — agent template
- `.claude/agents/ana.md:189` — dogfood copy
- `website/lib/proof-feed.ts:21,154-159` — website type + resolver
- `website/components/proof-feed/ProofFeed.tsx:19-28` — website display
- `website/components/proof-feed/proof-feed.module.css:290-293` — website badge styles
- `website/MAINTENANCE_MANUAL.md:75` — website documentation
- `docs-research/supermock/pages.js:694` — configurability guide scope template
- `docs-research/supermock/data.js:694` — supermock scope template

### Patterns to Follow
- `proofSummary.test.ts:1592-1598` for parser tests (write temp file, call function, assert)
- `artifact.test.ts:675-677` for valid-scope-saves acceptance test
- `proof-feed.module.css:290-293` for badge style precedent (feature > fix > chore visual weight)
- The Ana agent template's existing kind guidance at line 189 — extend inline, don't restructure

### Known Gotchas
- The dogfood sync test at `tests/commands/agent-proof-context.test.ts` enforces byte-identical match between template and `.claude/agents/`. If you update the template but not the dogfood copy (or vice versa), this test will fail. Update both files identically.
- The error messages at `artifact.ts:423` and `artifact.ts:427` hardcode the valid values as prose strings, not computed from a constant. Update both strings. If you extract a constant, it's a nice-to-have but not required — the existing pattern is inline strings.
- `ProofFeed.tsx:22` falls through unknown kinds to `styles.kindChore` (the least-styled badge). Without the code change, milestone entries silently render as chore. This is a cosmetic bug, not a crash — but it's wrong.
- The Ana agent template needs classification guidance in addition to listing the value. Without guidance, Ana will rarely choose `milestone` over `feature` because it has no criteria for distinguishing them. The guidance must be concise (one sentence), universal (works for any product), and actionable (not subjective).

### Things to Investigate
- What badge color for milestone best fits the existing design system. The three existing colors form a visual hierarchy: brand (feature) > neutral (fix) > ghost (chore). Milestone should sit above feature in that hierarchy without introducing a new color that clashes. Options: gold/amber, a more saturated brand color, or the brand color with an accent border.
