# Spec: Rename Finding Action `accept` → `acknowledge`

**Created by:** AnaPlan
**Date:** 2026-06-01
**Scope:** .ana/plans/active/rename-accept-to-acknowledge/scope.md

## Approach

Mechanical rename of the string `'accept'` to `'acknowledge'` everywhere it appears as a finding action value — type unions, validator arrays, switch cases, object keys, display labels, template action definitions, test fixtures, and docs content. Plus a one-time backfill migration on the proof chain, and validator tolerance for old values.

Three categories of change:

1. **Source code** — type unions, cast expressions, switch cases, object literal keys, display labels, validator array. All in `packages/cli/src/`.
2. **Templates and dogfood** — agent definitions in `templates/.claude/agents/`, `templates/.codex/agents/`, `.claude/agents/`, `.codex/agents/`. Only structured action values — English prose uses of "accept" are untouched.
3. **Tests and docs** — fixture data in test files, action table and terminal mockup in website MDX.

The migration follows the existing `surface_backfill` pattern in `work-proof.ts`: check migration marker, iterate all entries, transform data, set marker. The backfill runs inside `writeProofChain` so it executes on next `work complete`.

The validator tolerance is one line — add `'accept'` alongside `'acknowledge'` in the `VALID_FINDING_ACTIONS` array so old templates don't break on `ana artifact save`.

## Output Mockups

### `ana proof health` terminal output (action line)

Before:
```
  3 promote · 18 scope · 10 monitor · 8 accept (closeable)
```

After:
```
  3 promote · 18 scope · 10 monitor · 8 acknowledge
```

### `ana proof health --json` output (action object)

Before:
```json
"by_action": { "promote": 3, "scope": 18, "monitor": 10, "accept": 8, "unclassified": 0 }
```

After:
```json
"by_action": { "promote": 3, "scope": 18, "monitor": 10, "acknowledge": 8, "unclassified": 0 }
```

### Template action definition (ana-verify.md, ana-build.md)

Before:
```
suggested_action` (promote/scope/monitor/accept)
```

After:
```
suggested_action` (promote/scope/monitor/acknowledge)
```

## File Changes

### `packages/cli/src/types/proof.ts` (modify)
**What changes:** Two union type literals at lines 77 and 92: `'accept'` → `'acknowledge'` in `suggested_action` fields for findings and build_concerns.
**Pattern to follow:** Same union style already used — just a string literal swap.
**Why:** These are the canonical type definitions. Everything downstream casts to these types.

### `packages/cli/src/utils/proofSummary.ts` (modify)
**What changes:** Six locations where `'accept'` appears in type definitions and `as` casts — lines 68, 78, 994, 1052, 1096, 1128, 1137. All are string literal type references or cast targets.
**Pattern to follow:** Same `as 'promote' | 'scope' | 'monitor' | 'accept'` cast pattern — swap the literal.
**Why:** These are the parsing and type assertion points where incoming data gets cast to the action type.

### `packages/cli/src/utils/proof-health.ts` (modify)
**What changes:** Three changes: (1) variable `actAccept` → `actAcknowledge` at declaration (line 804), switch case (line 829), and return object (line 841). (2) The `by_action` return type at line 44: key `accept` → `acknowledge`. (3) The return object literal key at line 841: `accept: actAccept` → `acknowledge: actAcknowledge`.
**Pattern to follow:** Existing counting pattern — just rename variable and keys.
**Why:** This is the computation layer. The type, variable, switch case, and return key must all agree.

### `packages/cli/src/commands/proof.ts` (modify)
**What changes:** Four areas: (1) `matrixByAction` object key at line 2037: `accept:` → `acknowledge:`. (2) `byAction` object key at line 2340: `accept:` → `acknowledge:`. (3) `actOrder` array at line 2413: `'accept'` → `'acknowledge'`. (4) The special-case label logic at lines 2417-2419: remove the `act === 'accept'` ternary that appends `(closeable)`. All actions now use the simple `${count} ${act}` format.
**Pattern to follow:** The existing display pattern — the special label was only needed because "accept" was ambiguous.
**Why:** These are the display and JSON output paths for `ana proof audit` and `ana proof health`.

### `packages/cli/src/commands/artifact-validators.ts` (modify)
**What changes:** `VALID_FINDING_ACTIONS` array at line 44: becomes `['promote', 'scope', 'monitor', 'acknowledge', 'accept']`. Both values present — `'acknowledge'` is canonical, `'accept'` is tolerated.
**Pattern to follow:** Same array format.
**Why:** Backward compatibility for existing installations whose templates still write `accept`.

### `packages/cli/src/commands/work-proof.ts` (modify)
**What changes:** Add a new migration block before the `chain.entries.push(entry)` call at line 305. The block follows the `surface_backfill` pattern at line 226: check `chain.migrations?.['accept_to_acknowledge']`, iterate all `chain.entries` findings and build_concerns, rename `suggested_action: 'accept'` → `'acknowledge'`, set the migration marker. Also update line 307 to include the new marker: `chain.migrations = { ...chain.migrations, surface_backfill: true, accept_to_acknowledge: true }`.
**Pattern to follow:** The `surface_backfill` migration block at lines 226-235.
**Why:** Existing proof chain data has hundreds of findings with `accept`. This backfill renames them in-place on next `work complete`.

### `packages/cli/templates/.claude/agents/ana-verify.md` (modify)
**What changes:** Two locations: the `suggested_action` field list and the action description. `accept` → `acknowledge` in both. The description changes from "acknowledged and can be closed" to match the new verb naturally — "acknowledged, no action needed" or similar.
**Pattern to follow:** Existing template prose style.
**Why:** Product templates define what Verify writes. New installations must write `acknowledge`.

### `packages/cli/templates/.claude/agents/ana-build.md` (modify)
**What changes:** Same two locations as ana-verify.md: field list and action description.
**Pattern to follow:** Same as ana-verify.md.
**Why:** Build also writes findings with suggested_action.

### `packages/cli/templates/.claude/agents/ana-learn.md` (modify)
**What changes:** Six+ locations: (1) Line 155 — action list `promote / scope / monitor / accept` → `promote / scope / monitor / acknowledge`. Update the adjacent prose: "Accept means…" → "Acknowledge means…" (2) Lines 203-205 — three closure reason examples: `"accept: intentional behavior"` → `"acknowledge: intentional behavior"`, same for "known residual" and "cosmetic". (3) Line 227 — prose reference: `accept/monitor` → `acknowledge/monitor`.
**Pattern to follow:** Existing template prose. Note: the scope flagged that `ana-setup.md` uses "accept" in English prose — do NOT touch those.
**Why:** Learn is the agent most affected by the semantic gap. This is the whole point of the rename.

### `packages/cli/templates/.codex/agents/ana-verify.md` (modify)
**What changes:** Same two locations as the Claude template.
**Pattern to follow:** Mirror the Claude template changes.
**Why:** Codex templates must match.

### `packages/cli/templates/.codex/agents/ana-build.md` (modify)
**What changes:** Same two locations as the Claude template.
**Pattern to follow:** Mirror the Claude template changes.
**Why:** Codex templates must match.

### `.claude/agents/ana-verify.md` (modify)
**What changes:** Same changes as the product template — dogfood installation.
**Pattern to follow:** Mirror product template.
**Why:** Our installation must match.

### `.claude/agents/ana-build.md` (modify)
**What changes:** Same changes as the product template.
**Pattern to follow:** Mirror product template.
**Why:** Our installation must match.

### `.claude/agents/ana-learn.md` (modify)
**What changes:** Same changes as the product template.
**Pattern to follow:** Mirror product template.
**Why:** Our installation must match.

### `.codex/agents/ana-verify.md` (modify)
**What changes:** Same changes as the product template.
**Pattern to follow:** Mirror product template.
**Why:** Our installation must match.

### `.codex/agents/ana-build.md` (modify)
**What changes:** Same changes as the product template.
**Pattern to follow:** Mirror product template.
**Why:** Our installation must match.

### `packages/cli/tests/utils/proof-health.test.ts` (modify)
**What changes:** Five fixture locations with `suggested_action: 'accept'` → `'acknowledge'`. Lines 322, 340, 409, 450, 452. Pure data — no test logic changes.
**Pattern to follow:** Same fixture format.
**Why:** Test data must match the new action value.

### `packages/cli/tests/commands/proof.test.ts` (modify)
**What changes:** Nine fixture locations with `suggested_action: 'accept'` → `'acknowledge'`. Lines 409, 1523, 1577, 1647, 1780, 1944, 3730, 4078, 4213. Pure data — no test logic changes. Also check for any string assertions expecting `accept (closeable)` in display output and update to `acknowledge`.
**Pattern to follow:** Same fixture format.
**Why:** Test data must match the new action value.

### `website/content/docs/concepts/findings.mdx` (modify)
**What changes:** Two locations: (1) Line 14 — severity table's "Typical action" column: `` `accept` or `monitor` `` → `` `acknowledge` or `monitor` ``. (2) Line 27 — action table row: `` `accept` `` → `` `acknowledge` `` with description updated from "Acknowledged. Valid observation, no action needed. Can be closed." to match the new verb naturally.
**Pattern to follow:** Existing MDX table format.
**Why:** AnaDocs is the authoritative reference.

### `website/content/docs/guides/using-ana-learn.mdx` (modify)
**What changes:** Line 22 — terminal mockup JSX string: `8 observation/accept` → `8 observation/acknowledge`.
**Pattern to follow:** Inline JSX string literal — update the substring.
**Why:** The mockup must show the current action name.

## Acceptance Criteria

- [ ] AC1: Zero occurrences of `'accept'` as an action value in source files under `packages/cli/src/` (comments and unrelated uses excluded).
- [ ] AC2: Zero occurrences of `suggested_action: 'accept'` in test fixture data under `packages/cli/tests/`.
- [ ] AC3: Product templates (both `.claude/agents/` and `.codex/agents/` under `templates/`) use `acknowledge` in action definitions and guidance, with zero occurrences of `accept` as an action value.
- [ ] AC4: Dogfood templates (`.claude/agents/` and `.codex/agents/` at repo root) use `acknowledge`.
- [ ] AC5: `VALID_FINDING_ACTIONS` in `artifact-validators.ts` includes both `'acknowledge'` and `'accept'`.
- [ ] AC6: `writeProofChain` runs a one-time backfill gated by `migrations.accept_to_acknowledge`. Every finding and build concern with `suggested_action: 'accept'` is renamed to `'acknowledge'`. Migration marker is set.
- [ ] AC7: After backfill, our proof chain has zero findings with `suggested_action: 'accept'` and `migrations.accept_to_acknowledge` is `true`.
- [ ] AC8: `ana proof audit` and `ana proof health` display `acknowledge` in action counts, not `accept`.
- [ ] AC9: AnaDocs `findings.mdx` action table shows `acknowledge` with updated description. Terminal mockup in `using-ana-learn.mdx` shows `observation/acknowledge`.
- [ ] AC10: Website builds successfully after content changes.
- [ ] AC11: All existing tests pass — no regressions.
- [ ] AC12: No build errors (`pnpm run build` clean).

## Testing Strategy

- **Unit tests:** No new test files needed. Existing tests in `proof-health.test.ts` and `proof.test.ts` cover the action counting and display paths. Updating fixture data from `'accept'` to `'acknowledge'` validates the rename end-to-end through those tests.
- **Integration tests:** The backfill migration should be tested. Add a test in `proof.test.ts` or `work-proof.test.ts` (whichever has the `writeProofChain` tests) that: (1) creates a chain with `accept` findings, (2) calls `writeProofChain`, (3) verifies findings now say `acknowledge`, (4) verifies the migration marker is set, (5) verifies a second call doesn't re-process.
- **Edge cases:** Test that the backfill handles entries with no findings array, entries with no build_concerns array, and findings without a `suggested_action` field. The migration must be defensive.

## Dependencies

None. All affected files exist. The migration pattern is established.

## Constraints

- **Backward compatibility:** `VALID_FINDING_ACTIONS` must include `'accept'` as tolerated. Old templates in customer installations still write it.
- **Prose discrimination:** Only structured action values are renamed. English prose "accept" in `ana-setup.md` templates is untouched. Grep carefully — the word appears in natural language throughout templates.
- **JSON output shape:** The `by_action` key changes from `accept` to `acknowledge` in `--json` output. This is a breaking change to the JSON API surface. Acceptable given zero external consumers.

## Gotchas

- **`ana-setup.md` has "accept" in English prose.** Lines like "accept it" and "accept the rest" are NOT action values. Do not rename these. Both Claude and Codex versions. The scope warns about this — it's the highest-risk false positive.
- **`proof-health.ts` has a typed return interface.** The `by_action` object at line 40-46 has `accept: number` as a typed key. This must change to `acknowledge: number` — it's not just a string swap in the return statement, it's a type definition.
- **The `accept (closeable)` parenthetical.** `proof.ts` lines 2417-2419 have a ternary that special-cases the `accept` action to append `(closeable)`. Remove the entire ternary — all actions use the simple format. Don't just rename the string inside the ternary.
- **`findings.mdx` uses `accept` in two contexts.** Line 14 uses it in the severity table's "Typical action" column (as backtick-code). Line 27 uses it in the action table. Both need updating.
- **Terminal mockup in `using-ana-learn.mdx` is inside JSX.** The string `8 observation/accept` is inside a JSX expression with `{"\n..."}` interpolation. Update the substring within the JSX string, not outside it.
- **The migration must also cover `build_concerns`.** The scope mentions this — build concerns also have `suggested_action`. The backfill must iterate both `findings` and `build_concerns` arrays for each entry.

## Build Brief

### Rules That Apply
- All local imports use `.js` extensions — ESM requirement.
- Use `import type` for type-only imports.
- Explicit return types on exported functions.
- `&apos;` for apostrophes in JSX text content (relevant for MDX edits).
- Pre-commit hooks enforce types via `tsc --noEmit` — type changes must be consistent.

### Pattern Extracts

**Migration pattern from `work-proof.ts:226-235`:**
```typescript
  // Backfill migration: derive surface for existing entries without one
  if (anaSurfaces && !chain.migrations?.['surface_backfill']) {
    for (const existing of chain.entries) {
      if ((existing.surface === undefined || existing.surface === null) && existing.modules_touched?.length) {
        const derived = deriveSurface(existing.modules_touched, anaSurfaces);
        if (derived) {
          existing.surface = derived;
        }
      }
    }
  }
```

**Migration marker set at `work-proof.ts:307`:**
```typescript
  chain.migrations = { ...chain.migrations, surface_backfill: true };
```

**Action counting in `proof-health.ts:825-831`:**
```typescript
        switch (f.suggested_action) {
          case 'promote': actPromote++; break;
          case 'scope': actScope++; break;
          case 'monitor': actMonitor++; break;
          case 'accept': actAccept++; break;
          default: actUnclassified++; break;
        }
```

**Display label special case in `proof.ts:2413-2421`:**
```typescript
      const actOrder = ['promote', 'scope', 'monitor', 'accept'];
      const actParts: string[] = [];
      for (const act of actOrder) {
        if ((actionCounts[act] || 0) > 0) {
          const label =
            act === 'accept'
              ? `${actionCounts[act]} accept (closeable)`
              : `${actionCounts[act]} ${act}`;
          actParts.push(label);
        }
      }
```

### Proof Context

No active proof findings directly related to the files being renamed. The `proofSummary.ts` file has several active findings about size and technical debt, but none overlap with the action rename. No blockers.

### Checkpoint Commands

- After source file changes (`types/proof.ts`, `proofSummary.ts`, `proof-health.ts`, `proof.ts`, `artifact-validators.ts`, `work-proof.ts`): `(cd 'packages/cli' && pnpm vitest run)` — Expected: 3129 tests pass
- After test fixture updates: `(cd 'packages/cli' && pnpm vitest run)` — Expected: 3129 tests pass (+ any new migration test)
- After all changes: `pnpm run test -- --run` — Expected: all tests pass across both packages
- Lint: `pnpm run lint`
- Website build: `(cd 'website' && pnpm run build)` — Expected: clean build

### Build Baseline
- Current tests: 3129 passed, 2 skipped (3131 total) across 129 test files
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected 3129+ tests (migration test may add a few) in 129 test files
- Regression focus: `proof-health.test.ts`, `proof.test.ts` — these have the most fixture changes
