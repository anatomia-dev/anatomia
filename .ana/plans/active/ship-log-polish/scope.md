# Scope: Ship Log Polish

**Created by:** Ana
**Date:** 2026-05-07

## Intent
The ship log on anatomia.dev calls pipeline runs "commits," displays "new" as the tag for features (meaningless), and links to GitHub commits as the source of truth. A verification product whose marketing display is unverified. Fix the copy, add explicit `kind` classification to the proof chain so tags come from data instead of slug heuristics, and make the website read it.

## Complexity Assessment
- **Kind:** chore
- **Size:** medium
- **Files affected:** 8 files across 3 packages (website, CLI, agent templates)
- **Blast radius:** `ProofChainEntry` type is consumed by every proof command, health computation, and the website. Template change ships to all customers on next `ana init`.
- **Estimated effort:** ~30 minutes pipeline time
- **Multi-phase:** no

## Approach
Two layers, one scope. Layer 1: fix copy strings and tag display on the website. Layer 2: add a `kind` field to the proof chain entry so classification comes from data, not slug prefix guessing. The `kind` is set at scope time by Ana Think (where the diagnosis happens), parsed from scope.md by `extractScopeKind()`, and written to the proof chain entry by `writeProofChain()`. The website prefers explicit `kind` when present, falls back to the slug heuristic for old entries. No backfill — old entries age off the 6-row display naturally.

The structural analog is `scope_summary` — added the same way, same files, same wiring pattern. Optional field, parsed from scope.md, written to proof chain entry. `kind` follows this exactly.

## Acceptance Criteria
- AC1: `headTitle` in copy.ts reads `"Every change has *receipts*."` — no instance of the word "commit" or "commits" in the proof feed section
- AC2: Source of truth link points to `PROOF_CHAIN.md` on GitHub, label reads "Full proof chain →"
- AC3: Tags display as "feature", "fix", or "improve" — never "new"
- AC4: Expanded header says `"{n} verified changes"` not `"{n} commits · all verified"`
- AC5: `templates/.claude/agents/ana.md` scope template includes `**Kind:** feature / fix / chore` in the Complexity Assessment section
- AC6: `.claude/agents/ana.md` (dogfood copy) has the same `**Kind:**` line as the template
- AC7: `extractScopeKind()` exists in `proofSummary.ts`, returns parsed kind or undefined
- AC8: `ProofSummary` type has `kind?: 'feature' | 'fix' | 'chore'`
- AC9: `ProofChainEntry` type has `kind?: 'feature' | 'fix' | 'chore'`
- AC10: `writeProofChain()` writes `kind` to the entry (line ~838, same pattern as `scope_summary`)
- AC11: `generateProofSummary()` calls `extractScopeKind()` and sets `proof.kind`
- AC12: A scope with `**Kind:** fix` produces a proof chain entry with `kind: "fix"`
- AC13: A scope missing `**Kind:**` produces an entry with `kind: undefined` (no crash)
- AC14: Existing proof chain entries without `kind` still load and display correctly
- AC15: Website `mapEntry()` prefers explicit `kind` from entry, falls back to slug heuristic
- AC16: Website `kindLabel()` mapping: feature→"feature", fix→"fix", chore→"improve"
- AC17: The `ProofEntry` interface in `proof-feed.ts` includes `kind?: string` so TypeScript accepts the field from the API

## Edge Cases & Risks
- **Ana Think forgets to write `kind`.** Field is optional. `extractScopeKind()` returns undefined. Website falls back to slug heuristic. No crash.
- **Ana Think writes invalid kind.** Parser validates against three allowed values. Invalid → undefined (fallback).
- **Scope format varies.** Parser should look for `**Kind:**` on a line. Be lenient — check for the keyword with common formatting patterns (bold, plain, different casing).
- **Multi-phase plans.** Each phase has its own scope. Kind might differ per phase. Each pipeline run classifies independently. Correct behavior.
- **Old proof chain entries.** No `kind` field. `ProofChainEntry` type makes it optional. Website slug fallback handles them. CLI display commands ignore undefined `kind`.
- **`feature` field naming collision.** `ProofChainEntry` already has a `feature` field (display name, e.g., "Website Direct Polish"). The new `kind` field is distinct — `feature` is a name, `kind` is a classification. No rename needed; the field name is internal.
- **Template sync.** Both `packages/cli/templates/.claude/agents/ana.md` and `.claude/agents/ana.md` must be updated in the same commit. Build must verify both files have identical content in the Complexity Assessment section.

## Rejected Approaches
- **`--kind` flag on `ana work start`.** Forces classification before diagnosis. Violates "think more, build less." Kind belongs at scope time where Ana Think has already diagnosed the work.
- **Direct commit for website changes + pipeline for CLI.** Couples are better shipped together. The website's `kindLabel()` code references `kind` which doesn't exist yet — shipping dead code paths. And the template/type changes need verification, which is the whole point of the pipeline.
- **Scope validator warning for missing `kind`.** Adds noise for users who don't use the pipeline yet. The template instruction is sufficient — Ana Think writes it because the template tells it to.
- **Renaming `feature` field to `name`.** Breaking change to the type and all consumers. Internal-only naming. Not worth the churn.
- **Backfilling old entries.** Slug fallback handles old entries. New entries age in with accurate tags. 6-row display means old entries rotate out quickly.

## Open Questions
- Should `ana proof` terminal display commands show `kind`? Natural extension, low risk, but potentially out of scope. AnaPlan decides.
- Exact parser tolerance for `extractScopeKind()` — what formatting variants to accept. AnaPlan investigates.

## Exploration Findings

### Patterns Discovered
- `proofSummary.ts:410-421`: `extractScopeSummary()` — exact structural analog. Reads scope.md, regex matches a section, returns string or undefined.
- `proofSummary.ts:1583-1797`: `generateProofSummary()` — calls `extractScopeSummary()` at line 1794. New `extractScopeKind()` call goes alongside.
- `work.ts:815-848`: Entry construction. `scope_summary: proof.scope_summary` at line 838. `kind: proof.kind` goes right next to it.
- `proof-feed.ts:153-164`: `mapEntry()` — slug heuristic at line 158. Replace with explicit kind preference.
- `ProofFeed.tsx:96`: Tag display — `e.kind === "feature" ? "new" : e.kind`. Replace with `kindLabel()` mapping.

### Constraints Discovered
- [TYPE-VERIFIED] ProofChainEntry optional field pattern (proof.ts:65) — `scope_summary?: string | undefined` is the precedent for adding optional fields to the entry type
- [TYPE-VERIFIED] ProofSummary optional field pattern (proofSummary.ts:66) — same pattern on the summary side
- [OBSERVED] Template sync requirement — all 6 agent templates are identical between `packages/cli/templates/.claude/agents/` and `.claude/agents/`. Both locations must be updated together.
- [OBSERVED] CROSS-CUTTING comment (proof.ts:13-16) — type file documents that adding a field requires changes in 4+ locations. This scope follows those instructions exactly.
- [OBSERVED] CSS for tags already exists — `.kindFeature`, `.kindFix`, `.kindChore` in `proof-feed.module.css`. Only the label text changes, not the visual treatment.

### Test Infrastructure
- CLI tests in `packages/cli` via Vitest. `proofSummary.ts` has test coverage for `extractScopeSummary()` — new `extractScopeKind()` tests follow the same pattern.
- Website has no test suite. Visual verification only.

## For AnaPlan

### Structural Analog
`scope_summary` in `proofSummary.ts` — `extractScopeSummary()` at line 410. Same read-parse-return pattern. Same wiring through `generateProofSummary()` → `ProofSummary` → `writeProofChain()` → `ProofChainEntry`. Follow this path exactly for `kind`.

### Relevant Code Paths
- `packages/cli/src/utils/proofSummary.ts:410-421` — `extractScopeSummary()`, the pattern to follow
- `packages/cli/src/utils/proofSummary.ts:1583-1797` — `generateProofSummary()`, where to add the call
- `packages/cli/src/types/proof.ts:47-96` — `ProofChainEntry` type definition
- `packages/cli/src/commands/work.ts:815-848` — entry construction in `writeProofChain()`
- `website/lib/copy.ts:222-229` — proof feed copy strings
- `website/components/proof-feed/ProofFeed.tsx:38,96` — "commits" text and tag display
- `website/lib/proof-feed.ts:139-164` — `ProofChainEntry` interface and `mapEntry()` function
- `packages/cli/templates/.claude/agents/ana.md:188-193` — Complexity Assessment section in scope template
- `.claude/agents/ana.md` — dogfood copy, same section

### Patterns to Follow
- `extractScopeSummary()` in `proofSummary.ts` — parser pattern
- `scope_summary` wiring in `generateProofSummary()` and `writeProofChain()` — field propagation
- Optional field additions in `proof.ts` — type pattern with `?:` and `| undefined`
- `kindClass()` in `ProofFeed.tsx` — CSS class mapping (already exists, keep it)

### Known Gotchas
- The CROSS-CUTTING comment in `proof.ts` lists 4 locations that must change. This scope touches all 4. Don't miss the display in `proof.ts` commands if AnaPlan decides to include `kind` in terminal output.
- Template files are raw markdown, not TypeScript. No type checking. The `**Kind:**` line must match what `extractScopeKind()` parses.
- `ProofFeed.tsx` is a server component (async). No useState/useEffect. The `kindLabel()` function should be a plain function, not a hook.
- The `ProofEntry` interface in `website/lib/proof-feed.ts` is separate from the CLI's `ProofChainEntry`. Both need `kind` added independently — they're in different packages with no shared types.

### Things to Investigate
- Whether `extractScopeKind()` should also scan the Intent section as a fallback (e.g., "Fix X" implies `fix`) — or if that's over-engineering
- Whether existing tests for `proofSummary.ts` need updating or if new tests are purely additive
- The grid column width on `.proofRow` — the `kind` column is `54px` wide. "feature" (7 chars) and "improve" (7 chars) are wider than "new" (3 chars). Verify the column doesn't clip at `54px` with uppercase + letter-spacing.
