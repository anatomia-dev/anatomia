# Spec: Add milestone kind

**Created by:** AnaPlan
**Date:** 2026-05-12
**Scope:** .ana/plans/active/add-milestone-kind/scope.md

## Approach

Expand the kind enum from three values (`feature`, `fix`, `chore`) to four by adding `milestone` across all consumers. The change is purely additive — no existing behavior changes, no schema migration, no data backfill.

The existing pattern is inline if-chains with string literals. Maintain that pattern — add `|| raw === 'milestone'` to each chain. Don't extract a `VALID_KINDS` constant; the existing pattern is inline strings and three consumers isn't enough to justify the structural deviation.

The agent template gets classification guidance so Ana can reliably distinguish feature from milestone. The guidance must be universal (works for any product, not just Anatomia) and actionable (gives a clear threshold).

The website gets a gold/amber badge for milestone, visually above feature in the hierarchy: **milestone (gold) > feature (brand/oxblood) > fix (neutral) > chore (ghost)**. The gold color uses `oklch` color-mix consistent with how `brand-soft` and `brand-deep` are derived.

## Output Mockups

### CLI — scope validation error for invalid kind

```
Kind must be exactly one of: feature, fix, chore, milestone. Got: 'epic'
```

### CLI — scope validation success

No output change. `ana artifact save scope` accepts `**Kind:** milestone` silently, same as it accepts `feature`.

### Website — proof feed row with milestone badge

```
MILESTONE  Add authentication system    12 / 12    93a4cac    2h ago
```

The "MILESTONE" badge renders in gold/amber — visually distinct from the oxblood "FEATURE" badge. Same uppercase, same font-size, same letter-spacing as existing badges.

## File Changes

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:** Add `'milestone'` to the kind validation if-chain (line 426) and update both error message strings (lines 423, 427) to list all four valid values.
**Pattern to follow:** The existing if-chain at lines 420-428. Same inline string pattern — no constant extraction.
**Why:** Without this, `ana artifact save scope` rejects `**Kind:** milestone` as invalid.

### `packages/cli/src/utils/proofSummary.ts` (modify)
**What changes:** Two changes: (1) Add `'milestone'` to the return type union of `extractScopeKind` (line 432) and the `@returns` JSDoc (line 430). (2) Add `|| raw === 'milestone'` to the if-chain (line 439).
**Pattern to follow:** Existing if-chain at lines 432-444.
**Why:** Without this, `extractScopeKind` returns `undefined` for milestone scopes, and the kind is lost from proof chain entries.

### `packages/cli/src/utils/proofSummary.ts` line 67 — `ProofSummary` type (modify)
**What changes:** Add `'milestone'` to the `kind` union: `kind?: 'feature' | 'fix' | 'chore' | 'milestone' | undefined`.
**Pattern to follow:** Existing union at line 67.
**Why:** Type safety — ensures the type matches what `extractScopeKind` can now return.

### `packages/cli/src/types/proof.ts` (modify)
**What changes:** Add `'milestone'` to the `kind` union on the `ProofChainEntry` type (line 66).
**Pattern to follow:** Existing union at line 66.
**Why:** Type safety — the proof chain entry type must accept milestone values.

### `packages/cli/templates/.claude/agents/ana.md` (modify)
**What changes:** Update line 189 to list all four kinds and add classification guidance. The line currently reads:
```
- **Kind:** feature / fix / chore *(validated by `ana artifact save scope` — exact match required)*
```
Change to:
```
- **Kind:** feature / fix / chore / milestone *(validated by `ana artifact save scope` — exact match required). Use milestone for significant new capabilities that are announcement-worthy — a new product surface, a major integration, a system that changes what's possible. Most work is feature; milestone is the exception.*
```
**Pattern to follow:** Inline guidance, same line. Don't restructure.
**Why:** Without guidance, Ana will rarely choose milestone over feature because it lacks criteria for the distinction.

### `.claude/agents/ana.md` (modify)
**What changes:** Byte-identical change to line 189, matching the template.
**Pattern to follow:** Must be byte-identical to `packages/cli/templates/.claude/agents/ana.md`.
**Why:** The dogfood sync test at `tests/commands/agent-proof-context.test.ts` enforces byte-identical match between template and `.claude/agents/`. If they diverge, the test fails.

### `website/lib/proof-feed.ts` (modify)
**What changes:** (1) Add `"milestone"` to the `ProofKind` type (line 21). (2) Add `|| entry.kind === "milestone"` to the `resolveKind` function's if-chain (line 155), returning it as-is.
**Pattern to follow:** Existing if-chain at line 155. Milestone entries will always have explicit `kind`, so they never hit the slug heuristic fallback.
**Why:** Without this, milestone entries would fall through to the slug heuristic and render as "feature."

### `website/components/proof-feed/ProofFeed.tsx` (modify)
**What changes:** Add milestone handling to `kindClass()` and `kindLabel()` functions. Add `if (kind === "milestone") return styles.kindMilestone;` before the feature check (so milestone renders distinctly, not as feature). Add `if (kind === "milestone") return "milestone";` to `kindLabel()`.
**Pattern to follow:** Existing if-chains at lines 19-29.
**Why:** Without this, milestone entries fall through to `styles.kindChore` (the least-styled badge) — visually wrong.

### `website/components/proof-feed/proof-feed.module.css` (modify)
**What changes:** Add `.kindMilestone` class after the existing `.kindFeature` rule (line 290). Gold/amber treatment for light mode, gold text for dark mode:
```css
.kindMilestone { background: color-mix(in oklch, oklch(0.75 0.15 85) 18%, transparent); color: oklch(0.45 0.12 85); }
:global([data-theme="dark"]) .kindMilestone { color: oklch(0.75 0.15 85); }
```
The `oklch(0.75 0.15 85)` is a warm gold — hue 85 sits in amber territory. The 18% background mix matches the `brand-soft` pattern (14% brand mix). The dark text `oklch(0.45 0.12 85)` ensures readability on the light gold background. In dark mode, just the text goes gold (matching how feature goes brand-color in dark mode).
**Pattern to follow:** `.kindFeature` at line 290 — same structure, same dark-mode override pattern.
**Why:** Milestone needs a distinct visual treatment above feature in the hierarchy.

### `website/MAINTENANCE_MANUAL.md` (modify)
**What changes:** Update line 75 from `"feature" | "fix" | "chore"` to `"feature" | "fix" | "chore" | "milestone"`.
**Pattern to follow:** Existing inline type comment.
**Why:** Documentation must match the type.

### `docs-research/supermock/pages.js` (modify)
**What changes:** Two locations: (1) Line 627 — update the prose reference from `feature/fix/chore` to `feature/fix/chore/milestone`. (2) No other changes needed in pages.js; the line 627 reference is the only place kinds are listed as prose.
**Pattern to follow:** Existing inline text.
**Why:** The configurability guide examples should show all valid kinds.

### `docs-research/supermock/data.js` (modify)
**What changes:** Update line 694 from `feature / fix / chore` to `feature / fix / chore / milestone`.
**Pattern to follow:** Existing scope template text.
**Why:** The supermock scope template should list all valid kinds.

### `packages/cli/tests/utils/proofSummary.test.ts` (modify)
**What changes:** Add two new tests in the `extractScopeKind` describe block (after the chore test at line 1613):
1. "parses milestone from Kind line" — write a temp scope.md with `**Kind:** milestone`, assert `extractScopeKind` returns `'milestone'`.
2. "handles case-insensitive milestone" — write with `**Kind:** Milestone`, assert returns `'milestone'`.

Follow the exact pattern of the feature test at lines 1592-1598.
**Pattern to follow:** `proofSummary.test.ts:1592-1598`.
**Why:** AC3 and AC4 require these tests.

### `packages/cli/tests/commands/artifact.test.ts` (modify)
**What changes:** Add one new test near the existing Kind validation tests (around line 675): a scope with `**Kind:** milestone` that passes validation. Follow the pattern of the existing valid scope test.
**Pattern to follow:** `artifact.test.ts:671-684` — the existing valid scope structure.
**Why:** AC1 requires this test.

## Acceptance Criteria

- [ ] AC1: `ana artifact save scope` accepts `**Kind:** milestone` without error
- [ ] AC2: `ana artifact save scope` still rejects invalid kinds (e.g., `**Kind:** epic`) with an error message listing all four valid values
- [ ] AC3: `extractScopeKind()` returns `'milestone'` when scope contains `**Kind:** milestone`
- [ ] AC4: `extractScopeKind()` returns `'milestone'` for case-insensitive input (`**Kind:** Milestone`)
- [ ] AC5: The `ProofSummary` and `ProofChainEntry` TypeScript types include `'milestone'` in their `kind` union
- [ ] AC6: A completed pipeline run with `Kind: milestone` in scope produces a proof chain entry with `kind: "milestone"`
- [ ] AC7: The Ana agent template lists `feature / fix / chore / milestone` in the Kind field with classification guidance that distinguishes milestone from feature
- [ ] AC8: The dogfood Ana agent (`.claude/agents/ana.md`) is byte-identical to the template
- [ ] AC9: The website `ProofKind` type includes `"milestone"`
- [ ] AC10: The website `resolveKind()` function passes through `"milestone"` without falling back to slug heuristic
- [ ] AC11: The website `ProofFeed` component renders milestone entries with a distinct badge style and label
- [ ] AC12: The website `MAINTENANCE_MANUAL.md` documents `"milestone"` in the ProofKind type definition
- [ ] AC13: The supermock configurability guide and scope template show `feature / fix / chore / milestone`
- [ ] AC14: No existing tests break. Test count increases.
- [ ] AC15: Existing proof chain entries (with `kind: "feature"`, `kind: "fix"`, `kind: "chore"`, or `kind: undefined`) render identically to today
- [ ] Tests pass with `pnpm vitest run` in `packages/cli`
- [ ] No TypeScript build errors

## Testing Strategy

- **Unit tests:** Two new tests for `extractScopeKind` (milestone happy path + case insensitivity). Follow the temp-file-write-and-assert pattern at `proofSummary.test.ts:1592-1598`.
- **Integration tests:** One new test for scope validation acceptance of milestone kind. Follow the valid-scope pattern at `artifact.test.ts:671-684`.
- **Edge cases:** The existing tests for invalid kind rejection (`artifact.test.ts:815` — compound `fix + chore`) and undefined return on invalid value (`proofSummary.test.ts:1624-1629`) cover edge cases without modification. The error message strings in those tests may need updating if they assert on the exact error text — check the assertion content.

## Dependencies

None. All touchpoints exist and are stable.

## Constraints

- Dogfood sync: `.claude/agents/ana.md` must be byte-identical to `packages/cli/templates/.claude/agents/ana.md`. The test at `tests/commands/agent-proof-context.test.ts` enforces this.
- Kind remains optional everywhere. No consumer should assume kind is present.
- No new dependencies. No new files. No schema changes.

## Gotchas

- **Error message assertion in existing tests.** The invalid-kind test at `artifact.test.ts` may assert on the exact error message text `"feature, fix, chore"`. If so, the test will fail when the message changes to `"feature, fix, chore, milestone"`. Check the assertion — if it uses `toContain('feature, fix, chore')`, it still passes. If it uses `toBe(...)` with the full string, it needs updating.
- **Dogfood sync is the most fragile part.** Update both template and dogfood copy before running tests. If you update one and run tests, the sync test fails immediately.
- **Website has no test suite.** The website changes (proof-feed.ts, ProofFeed.tsx, CSS, MAINTENANCE_MANUAL.md) are verified visually, not programmatically. The contract assertions for website changes are type-level and code-structural, not runtime.
- **The `kindLabel` for chore returns `"improve"`, not `"chore"`.** This is intentional existing behavior. Milestone's label should be `"milestone"` — don't follow the chore precedent of aliasing.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Always use `--run` flag with `pnpm vitest` to avoid watch mode hang.
- Temp directories in tests use `fs.promises.mkdtemp` with cleanup in `afterEach`.

### Pattern Extracts

**Parser test pattern** (`packages/cli/tests/utils/proofSummary.test.ts:1592-1598`):
```typescript
  // @ana A012
  it('parses feature from Kind line', () => {
    const scopePath = path.join(tempDir, 'scope.md');
    fs.writeFileSync(scopePath, '# Scope\n\n## Complexity Assessment\n- **Kind:** feature\n- **Size:** small\n');
    const result = extractScopeKind(scopePath);
    expect(result).toBe('feature');
  });
```

**Validator if-chain** (`packages/cli/src/commands/artifact.ts:420-428`):
```typescript
  // Check for Kind field (strict — exact match only)
  const kindMatch = content.match(/\*\*Kind:\*\*\s*(.+)/);
  if (!kindMatch || !kindMatch[1]) {
    return "Missing 'Kind' field in Complexity Assessment. Add: **Kind:** feature / fix / chore";
  }
  const kindRaw = kindMatch[1].trim().toLowerCase();
  if (kindRaw !== 'feature' && kindRaw !== 'fix' && kindRaw !== 'chore') {
    return `Kind must be exactly one of: feature, fix, chore. Got: '${kindMatch[1].trim()}'`;
  }
```

**Website badge CSS** (`website/components/proof-feed/proof-feed.module.css:290-293`):
```css
.kindFeature { background: var(--brand-soft); color: var(--brand-deep); }
:global([data-theme="dark"]) .kindFeature { color: var(--color-brand); }
.kindFix { background: color-mix(in oklch, var(--fg) 8%, transparent); color: var(--ink-75); }
.kindChore { background: transparent; color: var(--ink-45); border: 1px solid var(--border-soft); }
```

### Proof Context

**artifact.ts** — 4 pipeline cycles. Active findings are about YAML double-parse, CRLF handling, round number bounds, and cross-fs atomicity. None overlap with this build's changes (kind validation is a different code path).

**proofSummary.ts** — 13 pipeline cycles. Active finding about cache invalidation in `resolveFindingPaths`. Not related to `extractScopeKind`.

No active proof findings for the website files, proof.ts, or agent templates.

### Checkpoint Commands

- After modifying `artifact.ts` + `proofSummary.ts` + `proof.ts`: `cd packages/cli && pnpm vitest run --run` — Expected: all existing tests pass
- After adding new tests: `cd packages/cli && pnpm vitest run --run` — Expected: 2142+ tests pass (2139 existing + 3 new)
- After all changes: `cd packages/cli && pnpm vitest run --run` — Expected: all tests pass, including dogfood sync

### Build Baseline

- Current tests: 2139 passed, 2 skipped (2141 total)
- Current test files: 100
- Command used: `cd packages/cli && pnpm vitest run`
- After build: expected 2142+ tests in 100 files (no new test files — tests added to existing files)
- Regression focus: `tests/commands/artifact.test.ts` (error message text assertions), `tests/commands/agent-proof-context.test.ts` (dogfood sync)
