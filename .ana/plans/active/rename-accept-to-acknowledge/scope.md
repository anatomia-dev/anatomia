# Scope: Rename Finding Action `accept` → `acknowledge`

**Created by:** Ana
**Date:** 2026-06-01

## Intent
Rename the finding action `accept` to `acknowledge` everywhere. The word "accept" causes Learn to batch-close findings instead of evaluating them — 7 sessions, 3 template rewrites, same failure. "Accept" implies the finding is acceptable. "Acknowledge" implies it was seen. The semantic gap is the disease: Verify means "acceptable for shipping," Learn hears "acceptable period."

## Complexity Assessment
- **Kind:** fix
- **Size:** small — mechanical string replacement across source, templates, tests, and docs, plus a one-time backfill
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/types/proof.ts` — union type literals (2 locations)
  - `packages/cli/src/utils/proofSummary.ts` — type definitions and casts (6 locations)
  - `packages/cli/src/utils/proof-health.ts` — action counting (1 location)
  - `packages/cli/src/commands/proof.ts` — matrix counts, display order, label (3 locations)
  - `packages/cli/src/commands/artifact-validators.ts` — VALID_FINDING_ACTIONS (1 location)
  - `packages/cli/src/commands/work-proof.ts` — backfill migration
  - `packages/cli/templates/.claude/agents/ana-verify.md` — action definition (2 locations)
  - `packages/cli/templates/.claude/agents/ana-build.md` — action definition (2 locations)
  - `packages/cli/templates/.claude/agents/ana-learn.md` — action guidance (6+ locations: action list at line 155, closure reason examples at lines 203-205, action-adjacent prose at line 227)
  - `packages/cli/templates/.codex/agents/ana-verify.md` — action definition (2 locations)
  - `packages/cli/templates/.codex/agents/ana-build.md` — action definition (2 locations)
  - Dogfood templates: `.claude/agents/` and `.codex/agents/` (same files, our installation)
  - `packages/cli/tests/utils/proof-health.test.ts` — fixture data (5 locations)
  - `packages/cli/tests/commands/proof.test.ts` — fixture data (9 locations)
  - `website/content/docs/concepts/findings.mdx` — action table and guidance (2 locations)
  - `website/content/docs/guides/using-ana-learn.mdx` — terminal mockup (1 location)
- **Blast radius:** Every command that reads or displays finding actions. Learn agent behavior (the actual disease). Proof chain data (580 findings in our chain). AnaDocs findings concept page.
- **Estimated effort:** Half a day
- **Multi-phase:** no

## Approach
Mechanical rename. Replace every `'accept'` action value with `'acknowledge'` in source, types, templates, tests, and docs. Run a one-time backfill on our proof chain through the existing migration pattern in `writeProofChain`. Keep `accept` as a tolerated value in the artifact validator so any hypothetical existing installation doesn't hard-break on its next `ana artifact save`.

The validator tolerance is one line — not a full backward compatibility system. No dual display logic, no fallback counting. If a customer exists with old templates, their Verify still writes `accept`, the validator lets it through, and whenever they run `work complete` the backfill renames it. That's the extent of backward compat.

The variable `actAccept` in `proof-health.ts` becomes `actAcknowledge`. The display label `accept (closeable)` becomes `acknowledge`. No parenthetical — the word doesn't need explanation.

## Acceptance Criteria
- AC1: Zero occurrences of the string `'accept'` as an action value in source files under `packages/cli/src/` (comments and unrelated uses of "accept" like "acceptable" are excluded).
- AC2: Zero occurrences of `suggested_action: 'accept'` in test fixture data under `packages/cli/tests/`.
- AC3: Product templates (both `.claude/agents/` and `.codex/agents/` under `templates/`) use `acknowledge` in action definitions and guidance, with zero occurrences of `accept` as an action value.
- AC4: Dogfood templates (`.claude/agents/` and `.codex/agents/` at repo root) use `acknowledge`.
- AC5: `VALID_FINDING_ACTIONS` in `artifact-validators.ts` includes both `'acknowledge'` and `'accept'` — the old value is tolerated, not rejected.
- AC6: `writeProofChain` runs a one-time backfill gated by `migrations.accept_to_acknowledge`. Every finding and build concern with `suggested_action: 'accept'` is renamed to `'acknowledge'`. Migration marker is set.
- AC7: After backfill, our proof chain has zero findings with `suggested_action: 'accept'` and `migrations.accept_to_acknowledge` is `true`.
- AC8: `ana proof audit` and `ana proof health` display `acknowledge` in action counts, not `accept`.
- AC9: AnaDocs `findings.mdx` action table shows `acknowledge` with updated description. Terminal mockup in `using-ana-learn.mdx` shows `observation/acknowledge` not `observation/accept`.
- AC10: Website builds successfully after content changes.

## Edge Cases & Risks
**The word "accept" in non-action contexts.** Templates use "accept" in natural prose — "accept it," "if still no, accept it." These are English, not action values. The rename targets only the structured action value `'accept'` in type unions, validator arrays, fixture data, and template action definitions. Grep carefully.

**Proof chain entries written by old Verify templates.** Existing customer installations have old templates (merge-not-overwrite). Their Verify still writes `accept`. The validator tolerance handles this — `accept` is allowed on write. The backfill handles it on `work complete`. No intermediate breakage.

**AnaDocs generated assets.** Changing `findings.mdx` content regenerates `search-index.json`, `llms.txt`, `llms-full.txt`. The website build handles this automatically.

**JSON output key rename.** `proof.ts` lines 2037 and 2340 build object literals with `accept:` as a property key for `--json` output (`ana proof audit --json`, `ana proof health --json`). Renaming to `acknowledge:` changes the JSON shape. Zero customers makes this safe, but Build should handle it deliberately — rename the key, not just the value lookup.

## Rejected Approaches
**Elaborate backward compat with dual display logic.** No customers exist to justify `case 'accept': case 'acknowledge':` fallthrough in every display path. The validator tolerance is sufficient. If a customer surfaces, their `work complete` runs the backfill.

**Direct commit without pipeline.** The change touches types, logic, templates, tests, and docs across 20+ files. The pipeline catches errors a manual review would miss.

## Open Questions
None. The REQ is thorough, the code paths are verified, the migration pattern exists.

## Exploration Findings

### Patterns Discovered
- `work-proof.ts:226`: Existing migration pattern (`surface_backfill`) — gated by `chain.migrations` key, iterates all entries, sets marker. The accept→acknowledge backfill follows the same pattern.
- `proof-health.ts:829`: `case 'accept': actAccept++` — the counting logic. Single location.
- `proof.ts:2413-2418`: Action display order array and special label for accept. The `accept (closeable)` parenthetical disappears with the rename.
- `artifact-validators.ts:44`: `VALID_FINDING_ACTIONS` array — the single validation gate for incoming findings.

### Constraints Discovered
- [OBSERVED] 580 findings/concerns in our proof chain have `suggested_action: 'accept'`. REQ said 314 — the chain grew since.
- [OBSERVED] Codex templates exist now (not mentioned in original REQ). 4 additional template files need updating.
- [OBSERVED] `actAccept` variable in `proof-health.ts` moved from `proofSummary.ts` during the decompose-proofSummary scope. REQ line numbers are stale.
- [OBSERVED] `using-ana-learn.mdx` terminal mockup contains `8 observation/accept` in inline JSX.

### Test Infrastructure
- `packages/cli/tests/utils/proof-health.test.ts`: 5 fixtures with `accept` — all in test data objects
- `packages/cli/tests/commands/proof.test.ts`: 9 fixtures with `accept` — all in test data objects
- No test logic changes needed — only fixture string replacements

## For AnaPlan

### Structural Analog
`work-proof.ts:226-307` (`surface_backfill` migration) is the structural analog for the backfill. Same pattern: check migration marker, iterate entries, transform data, set marker.

For the string replacement, there is no structural analog — it's a mechanical find-replace across typed union literals, validator arrays, and template prose.

### Relevant Code Paths
- `packages/cli/src/types/proof.ts:77,92` — action union types
- `packages/cli/src/utils/proofSummary.ts:68,78,994,1052,1096,1128,1137` — type definitions and casts
- `packages/cli/src/utils/proof-health.ts:829` — `actAccept` counting
- `packages/cli/src/commands/proof.ts:2037,2340,2413,2418` — matrix counts, display, and JSON output object property keys (lines 2037, 2340 are property key names in `--json` output, not just string lookups)
- `packages/cli/src/commands/artifact-validators.ts:44` — VALID_FINDING_ACTIONS
- `packages/cli/src/commands/work-proof.ts:226` — migration insertion point
- `website/content/docs/concepts/findings.mdx:14,27` — action table
- `website/content/docs/guides/using-ana-learn.mdx:22` — terminal mockup

### Patterns to Follow
- Migration pattern: `if (!chain.migrations?.['accept_to_acknowledge'])` → iterate → set marker
- Validator tolerance: add `'accept'` alongside `'acknowledge'` in the array
- Template action definitions: `acknowledge = noted, evaluate in Learn`

### Known Gotchas
- `ana-learn.md` has 6+ locations with `accept` as an action value: line 155 (action list and "Accept means Verify didn't block shipping" prose), lines 203-205 (three `"accept: intentional behavior"` closure reason examples that reference the action name), and line 227 (action-adjacent prose). All need updating — the closure reason examples become `"acknowledge: intentional behavior"` etc.
- `ana-setup.md` uses "accept" in English prose ("accept it", "accept the rest") — these are NOT action values, do not rename.
- `findings.mdx` inline JSX has the terminal mockup string — the `observation/accept` substring needs updating inside the JSX string literal.
- The Codex Learn template doesn't exist (Learn is CC-only), so no Codex Learn template to update.

### Things to Investigate
- Confirm the exact variable name `actAccept` in `proof-health.ts` and whether any other variables reference the action name.
