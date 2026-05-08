# Spec: Scope Validation Integrity

**Created by:** AnaPlan
**Date:** 2026-05-08
**Scope:** .ana/plans/active/scope-validation-integrity/scope.md

## Approach

Three layers: stricter validation gate, unambiguous templates, and dev-environment rebuild hook.

**Validation expansion.** `validateScopeFormat` in `packages/cli/src/commands/artifact.ts` currently checks ACs (≥3), Structural Analog section, and Intent section with content. Expand it to also check: Complexity Assessment section exists, Kind field (strict — exactly `feature`, `fix`, or `chore`), Size field (lenient — extract first valid token), Multi-phase field (lenient — extract first token `yes`/`no`), Approach section with content, and Edge Cases section. Keep the existing `string | null` return type and first-error-only pattern — consistent with all other validators in the file.

**Validation order:** Complexity Assessment section → Kind → Size → Multi-phase → Approach section with content → Edge Cases section. Check the container section first, then fields within it. The existing AC/Structural Analog/Intent checks remain at the top, unchanged.

**Lenient parsing strategy.** Size and Multi-phase use regex that matches the first valid token at the start of the value, ignoring anything after it. `small-medium` → matches `small`. `medium (8 items)` → matches `medium`. `no (this is Phase 1)` → matches `no`. Kind is strict — exact match only after trimming and lowercasing, because the three values have no meaningful in-between.

**Template update.** Both `ana.md` files (dogfood and shipped) get the same change: the Complexity Assessment template section marks Kind, Size, and Multi-phase as machine-parsed enums with explicit valid values and a note that `ana artifact save scope` enforces them.

**Post-merge hook.** New `.husky/post-merge` hook. Fires after `git pull` merges. Greps the incoming changes for `packages/cli/src/` — if CLI source changed, runs `pnpm run build` in `packages/cli/`. If no CLI source changed, exits silently. If the build fails, prints the error but exits 0 (non-blocking — the merge is already complete).

**Backfill.** One-shot script at `scripts/backfill-kind.ts` that patches the 6 most recent proof chain entries with correct `kind` values. Run with `tsx`, then delete the script.

## Output Mockups

### Validation error — missing Kind
```
Error: scope.md format invalid.
Missing 'Kind' field in Complexity Assessment. Add: **Kind:** feature / fix / chore
```

### Validation error — invalid Kind value
```
Error: scope.md format invalid.
Kind must be exactly one of: feature, fix, chore. Got: 'fix + chore'
```

### Validation error — invalid Size value
```
Error: scope.md format invalid.
Size must start with one of: small, medium, large. Got: 'tiny'
```

### Validation error — missing Complexity Assessment section
```
Error: scope.md format invalid.
Missing 'Complexity Assessment' section. Every scope needs a complexity assessment.
```

### Validation error — missing Approach section
```
Error: scope.md format invalid.
Missing 'Approach' section. Scope must describe the strategic direction.
```

### Validation error — empty Approach section
```
Error: scope.md format invalid.
Empty 'Approach' section. Scope must describe the strategic direction.
```

### Post-merge hook output (CLI source changed)
```
[post-merge] CLI source changed — rebuilding packages/cli...
```

### Post-merge hook output (no CLI source changed)
*(silent — no output)*

## File Changes

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:** Expand `validateScopeFormat` with 6 new checks: Complexity Assessment section, Kind (strict), Size (lenient), Multi-phase (lenient), Approach section with content, Edge Cases section. All new checks go after the existing Intent content check and before the `return null`.
**Pattern to follow:** The existing Intent-with-content check in the same function — it finds a section heading, extracts lines between it and the next `##`, checks for content. The Kind/Size/Multi-phase checks follow the `extractScopeKind` pattern in `proofSummary.ts` (regex match on `**Field:**` line, extract value, validate).
**Why:** Without this, agents write non-conforming scopes that silently lose data downstream.

### `packages/cli/tests/commands/artifact.test.ts` (modify)
**What changes:** New tests in the existing `scope format validation` describe block. Each new validation rule gets at least one acceptance test and one rejection test. The valid scope helper (`getValidScopeContent`) must be updated to include all newly-required sections so existing tests don't break.
**Pattern to follow:** The existing scope validation tests — write a scope string, call `saveArtifact('scope', 'test-slug')`, assert `toThrow()` or `not.toThrow()`.
**Why:** Every validation rule needs a test. Existing tests that use `getValidScopeContent()` will fail if the helper doesn't include the new required sections.

### `.claude/agents/ana.md` (modify)
**What changes:** The Complexity Assessment template section gets updated to show Kind, Size, and Multi-phase as enforced enums with explicit valid values. Add a note that `ana artifact save scope` validates these fields.
**Pattern to follow:** The existing template section at lines ~188-194.
**Why:** Agents read this template to generate scopes. If the template is ambiguous, agents produce invalid values.

### `packages/cli/templates/.claude/agents/ana.md` (modify)
**What changes:** Identical change to the dogfood template. The Complexity Assessment section must be byte-for-byte identical to `.claude/agents/ana.md`.
**Pattern to follow:** Same as above.
**Why:** Template sync — the shipped product and dogfood must match (AC12).

### `.husky/post-merge` (create)
**What changes:** New husky hook that conditionally rebuilds the CLI after `git pull` brings CLI source changes.
**Pattern to follow:** `.husky/pre-commit` — same shebang (`#!/usr/bin/env sh`), `set -e` at top. But unlike pre-commit, no skip condition for `.ana/`-only changes and non-blocking on build failure (wrap the build in a conditional that prints but doesn't exit non-zero).
**Why:** Closes the dev-environment gap where agents update instantly (markdown) but the CLI binary goes stale until manually rebuilt.

### `scripts/backfill-kind.ts` (create)
**What changes:** One-shot script that reads `.ana/proof_chain.json`, patches the 6 most recent entries with correct `kind` values, and writes the file back. Hardcoded mapping with documented reasoning.
**Pattern to follow:** Simple Node script using `node:fs` — read JSON, patch, write. No CLI framework needed.
**Why:** The 6 most recent entries show on the website with incorrect tags. Old entries without Kind continue to use the slug heuristic.

### `.ana/proof_chain.json` (modify)
**What changes:** The 6 most recent entries get `kind` fields added by the backfill script.
**Pattern to follow:** Existing entry structure — `kind` is a sibling of `slug`, `feature`, `result`.
**Why:** Correct website ship log display (AC15).

## Acceptance Criteria

- [ ] AC1: `validateScopeFormat` rejects scopes missing a `**Kind:**` line with a clear error naming the field and valid values.
- [ ] AC2: `validateScopeFormat` rejects scopes where Kind is not exactly one of `feature`, `fix`, `chore` (case-insensitive). Error message shows the invalid value: `"Kind must be exactly one of: feature, fix, chore. Got: 'fix + chore'"`.
- [ ] AC3: `validateScopeFormat` rejects scopes missing a `**Size:**` line.
- [ ] AC4: Size validation uses lenient parsing — extracts the first valid token (`small`, `medium`, `large`) from the value. `small-medium` passes (parsed as `small`). `medium (8 items)` passes (parsed as `medium`). `tiny` or empty fails.
- [ ] AC5: `validateScopeFormat` rejects scopes missing a `**Multi-phase:**` line.
- [ ] AC6: Multi-phase validation uses lenient parsing — extracts first token (`yes` or `no`). `no (this IS Phase 1...)` passes. `maybe` fails.
- [ ] AC7: `validateScopeFormat` rejects scopes missing a `## Complexity Assessment` section.
- [ ] AC8: `validateScopeFormat` rejects scopes missing a `## Approach` section with content (same pattern as existing Intent check).
- [ ] AC9: `validateScopeFormat` rejects scopes missing a `## Edge Cases` section.
- [ ] AC10: All validation error messages name the specific field, show the invalid value (if applicable), and state the constraint. No generic "invalid scope" errors.
- [ ] AC11: `.claude/agents/ana.md` and `templates/.claude/agents/ana.md` template updated — Kind, Size, and Multi-phase show as machine-parsed enums with explicit valid values and a note that the save validator enforces them.
- [ ] AC12: Both template files have identical Complexity Assessment sections (template sync).
- [ ] AC13: `.husky/post-merge` hook exists. When a `git pull` brings changes to `packages/cli/src/`, it runs `pnpm run build` in `packages/cli/`. When no CLI source changed, it does nothing.
- [ ] AC14: The 6 most recent proof chain entries have correct `kind` values. Specifically: `ci-artifact-path-ignore` → `chore`, `worktree-artifact-cleanup` → `fix`, `website-nav-copy-polish` → `fix`, `test-suite-hygiene` → `chore`, `ship-log-polish` → `chore`, `website-direct-polish` → `chore`.
- [ ] AC15: After backfill, the website ship log displays correct tags: mix of "feature", "fix", and "improve" — not all "feature".
- [ ] AC16: Backfill script is deleted after use (not shipped as a CLI feature).
- [ ] AC17: Existing passing tests continue to pass. New tests cover all validation rules.

## Testing Strategy

- **Unit tests:** Expand the existing `scope format validation` describe block in `artifact.test.ts`. Each new check needs: (1) a test that a valid scope passes, (2) a test that a missing/invalid field is rejected with the correct error. For lenient parsing, add specific cases: `small-medium` passes, `medium (explanation)` passes, `tiny` fails.
- **Integration tests:** The existing `saveArtifact` flow already exercises the full path (write file → validate → git commit). New tests follow the same pattern — no new infrastructure needed.
- **Edge cases:** En-dash in `small–medium` (test that lenient parser handles non-hyphen word separators). Empty Complexity Assessment section (heading exists but no content). Kind with leading/trailing whitespace. Multi-phase with mixed case (`Yes`, `NO`).

## Dependencies

- Husky must be installed (`pnpm prepare` runs `husky`). Already configured in the project.
- `tsx` must be available for the backfill script. Already a dev dependency.

## Constraints

- `validateScopeFormat` must keep its `string | null` signature. Callers at lines ~1025 and ~1405 depend on it.
- The post-merge hook must be non-blocking — exit 0 even if build fails. The merge is already complete.
- The backfill script must not modify entries beyond the 6 specified. Older entries without Kind continue using the slug heuristic on the website.
- All validation error messages must be actionable — an agent reading the error should be able to fix the scope in one attempt.

## Gotchas

- **`getValidScopeContent()` helper must be updated first.** This helper is used by many existing tests. If the new validation checks require Complexity Assessment, Approach, and Edge Cases sections, the helper must include them or every existing scope test breaks. Update the helper before adding new validation.
- **Lenient regex must match at value start, not anywhere in line.** `/\b(small|medium|large)\b/i` would match `small` inside the word `dismall`. Use `/^\s*(small|medium|large)\b/i` on the extracted value (after `**Size:**`), not on the full line.
- **The Approach content check follows the Intent pattern exactly.** Find `## Approach`, collect lines until next `##`, check if trimmed content is non-empty. Don't accidentally match `## Rejected Approaches` — use `## Approach\s*$` or check for exact heading level.
- **Edge Cases section heading is `## Edge Cases & Risks` in the template** but the AC says `## Edge Cases`. The regex should match `## Edge Cases` as a prefix, so `## Edge Cases & Risks` also passes. Use `/##\s+Edge\s+Cases/i`.
- **Post-merge hook needs execute permission.** After creating `.husky/post-merge`, run `chmod +x`. Husky won't execute it without the permission bit.
- **proof_chain.json formatting.** When writing the backfill script, read the file, parse, patch, and write back with the same JSON formatting (2-space indent). Use `JSON.stringify(data, null, 2)` to match.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer early returns over nested conditionals.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Always use `--run` with `pnpm vitest` to avoid watch mode hang.
- Error messages in validators: name the field, state the constraint, show the invalid value. No generic messages.
- Temp directory pattern with `fs.mkdtemp` for test isolation.

### Pattern Extracts

**Existing scope validation pattern** — `packages/cli/src/commands/artifact.ts:375-414`:
```typescript
function validateScopeFormat(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check for at least 3 acceptance criteria
  const acPattern = /^-\s+(AC\d+|##?\s*AC|\*\*AC)/mi;
  const acMatches = content.match(new RegExp(acPattern.source, 'gmi'));
  if (!acMatches || acMatches.length < 3) {
    return "Missing acceptance criteria. Scope must contain at least 3 acceptance criteria (lines starting with '- AC').";
  }

  // Check for Structural Analog section
  if (!content.match(/###?\s+Structural\s+Analog/i)) {
    return "Missing 'Structural Analog' section. Every scope needs a structural analog to guide implementation.";
  }

  // Check for Intent section with content
  if (!content.match(/###?\s+Intent/i)) {
    return "Missing 'Intent' section. Scope must explain the purpose of this work.";
  }

  // Extract content between Intent heading and next section
  const lines = content.split('\n');
  let inIntent = false;
  const intentLines: string[] = [];
  for (const line of lines) {
    if (/^##\s+Intent/i.test(line)) {
      inIntent = true;
      continue;
    }
    if (inIntent) {
      if (/^##/.test(line)) break; // Next section starts
      intentLines.push(line);
    }
  }
  const intentContent = intentLines.join('\n').trim();
  if (!intentContent) {
    return "Empty 'Intent' section. Scope must explain the purpose of this work.";
  }

  return null; // valid
}
```

**Kind extraction pattern** — `packages/cli/src/utils/proofSummary.ts:432-444`:
```typescript
export function extractScopeKind(scopePath: string): 'feature' | 'fix' | 'chore' | undefined {
  if (!fs.existsSync(scopePath)) return undefined;
  try {
    const content = fs.readFileSync(scopePath, 'utf-8');
    const kindMatch = content.match(/\*\*Kind:\*\*\s*(.+)/);
    if (!kindMatch || !kindMatch[1]) return undefined;
    const raw = kindMatch[1].trim().toLowerCase();
    if (raw === 'feature' || raw === 'fix' || raw === 'chore') return raw;
    return undefined;
  } catch {
    return undefined;
  }
}
```

**Existing test pattern** — `packages/cli/tests/commands/artifact.test.ts:652-721`:
```typescript
describe('scope format validation', () => {
  it('accepts valid scope with 3+ ACs and Structural Analog', async () => {
    await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
    const validScope = `# Scope: test

## Intent
This adds a new feature.

## Acceptance Criteria
- AC1: First criterion
- AC2: Second criterion
- AC3: Third criterion

### Structural Analog
work.ts — similar command pattern`;
    await createArtifact('test-slug', 'scope.md', validScope);

    expect(() => saveArtifact('scope', 'test-slug')).not.toThrow();
  });

  it('rejects scope without sufficient ACs', async () => {
    // ... writes invalid scope, asserts toThrow()
  });
});
```

**Pre-commit hook structure** — `.husky/pre-commit`:
```sh
#!/usr/bin/env sh
set -e

# Skip build/typecheck/lint for commits that only touch .ana/ or .claude/ files
STAGED_FILES=$(git diff --cached --name-only)
if [ -n "$STAGED_FILES" ]; then
  NON_ANA_FILES=$(echo "$STAGED_FILES" | grep -v '^\.ana/' | grep -v '^\.claude/' | grep -v '^website/' || true)
  if [ -z "$NON_ANA_FILES" ]; then
    exit 0
  fi
fi

cd packages/cli
pnpm run build
```

### Proof Context

**artifact.ts:**
- [test] Scope validation tests use `toThrow()` without checking error message content — from Structured Findings Companion. Relevant: new tests should assert on error message content where possible (use `toThrow(/expected message/)` pattern).

**artifact.test.ts:**
- [test] blocks-save tests use `toThrow()` without checking exit code or error message content. New tests can improve on this pattern by checking message content.

No blockers for affected files.

### Checkpoint Commands

- After updating `validateScopeFormat`: `cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts --run` — Expected: existing scope tests pass (may need `getValidScopeContent` updated first)
- After all changes: `cd packages/cli && pnpm vitest run --run` — Expected: 2009+ tests pass, 0 failures
- Lint: `cd packages/cli && pnpm lint`
- Build: `cd packages/cli && pnpm run build`

### Build Baseline
- Current tests: 2009 passed, 2 skipped (2011 total)
- Current test files: 95
- Command used: `cd packages/cli && pnpm vitest run`
- After build: expected ~2025+ tests (current 2009 + ~16 new validation tests) in 95 test files
- Regression focus: existing scope format validation tests in `artifact.test.ts` — these use `getValidScopeContent()` which must be updated to include new required sections
