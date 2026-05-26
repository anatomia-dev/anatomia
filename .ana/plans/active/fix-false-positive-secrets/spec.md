# Spec: Fix False Positive Secret Detection

**Created by:** AnaPlan
**Date:** 2026-05-26
**Scope:** .ana/plans/active/fix-false-positive-secrets/scope.md

## Approach

Six changes across two source files, plus test updates. The disease: a regex with zero structural verification produces false critical findings that propagate into AGENTS.md and project-context.md. The fix removes the patterns that lie, hardens the patterns that can still false-positive on edge cases, and deduplicates the downstream propagation path.

Changes in `secrets.ts`:
1. **Remove weak signing secret pattern** (lines 107-109). Zero true positives across 48 repos. Matches by vocabulary proximity instead of structural prefix — fundamentally different from every other pattern in the array.
2. **Remove PostHog `phc_` pattern** (line 105). Public-by-design keys flagged as warnings. PostHog usage is already detected by the external services detector via dependency scanning.
3. **Add bracket template patterns to `TEMPLATE_PATTERNS`** (lines 38-43). Two new regexes for `[password]` and the trailing-bracket artifact from DB URL colon splitting. These filter false positives from repos like openpanel that use `[placeholder]` syntax in config examples.
4. **Add `pw` and `pwd` to `DB_URL_PLACEHOLDERS`** (lines 31-35). Common short placeholder passwords not currently covered. Note: `pass` is already present at line 33 — do not add it again.
5. **Add `validate` function to AWS pattern** (line 81) rejecting `AKIAIOSFODNN7EXAMPLE`. This is AWS's documented example key — it appears in SDK docs and tutorials. Follow the existing `validate` pattern from the GitHub PAT at lines 84-86.

Change in `assets.ts`:
6. **Deduplicate AGENTS.md constraint lines** (lines 455-466). Wrap the constraint push in a `Set<string>` guard so that multiple findings with the same ID don't produce duplicate instruction lines. The dedup must be by rendered string content (after `{lib}` substitution), not by finding ID.

## Output Mockups

Before (medusa `ana scan`):
```
  ✗ Hardcoded Live secret key (sk_live_*)      enum.ts:42
  ✗ Hardcoded Weak signing secret               auth.config.ts:15
  ✗ Hardcoded Weak signing secret               jwt.ts:8
  ... (10 critical findings, all false)
```

After (medusa `ana scan`):
```
  ✓ No hardcoded secrets detected
    Checked: Stripe, OpenAI, Anthropic, AWS, GitHub, database URLs, Resend, SendGrid, Twilio
```

Before (medusa AGENTS.md):
```
## Constraints
- 🔴 Use environment variables for all API keys and credentials — never hardcode secrets
- 🔴 Use environment variables for all API keys and credentials — never hardcode secrets
- 🔴 Use environment variables for all API keys and credentials — never hardcode secrets
... (10 identical lines)
```

After:
```
## Constraints
- 🔴 Use environment variables for all API keys and credentials — never hardcode secrets
```

## File Changes

### `packages/cli/src/engine/findings/rules/secrets.ts` (modify)
**What changes:** Remove 2 patterns from `SECRET_PATTERNS`, add 2 regexes to `TEMPLATE_PATTERNS`, add 2 values to `DB_URL_PLACEHOLDERS`, add `validate` function to AWS pattern.
**Pattern to follow:** The existing `validate` function on the GitHub PAT pattern (lines 84-86) for the AWS example key check. The existing `TEMPLATE_PATTERNS` array (lines 38-43) for bracket patterns. The existing `DB_URL_PLACEHOLDERS` array (lines 31-35) for new placeholder values.
**Why:** These patterns produce false critical findings that propagate into AGENTS.md and project-context.md, making the scan output unreliable.

### `packages/cli/src/commands/init/assets.ts` (modify)
**What changes:** Add `Set<string>` dedup guard in the finding-to-constraint loop so identical rendered instruction strings are not pushed multiple times.
**Pattern to follow:** Standard `Set<string>` with `has`/`add` guard before `constraintLines.push`.
**Why:** Even after reducing false findings at the source, multiple legitimate findings with the same ID (e.g., two real hardcoded secrets in different files) would still produce duplicate instruction lines.

### `packages/cli/tests/engine/findings/secrets.test.ts` (modify)
**What changes:** Remove the weak JWT signing secret test (lines 66-72). Add 3 new negative tests: AWS example key, bracket template in DB URL, `pw` placeholder in DB URL. Optionally add a regression negative test for `SECRET = "secret"` enum pattern.
**Pattern to follow:** Existing test structure — `fs.writeFileSync` + `checkHardcodedSecrets(makeContext(tmpDir))` + severity assertions.
**Why:** Tests must reflect the new pattern set. The removed pattern needs its positive test removed. The hardened patterns need negative tests proving they filter correctly.

## Acceptance Criteria
- [ ] AC1: `ana scan` on medusa produces 0 critical secret findings (currently 10)
- [ ] AC2: `ana scan` on infisical produces 0 critical secret findings (currently 12) and 0 warnings (currently 1 PostHog)
- [ ] AC3: `ana scan` on openpanel produces 0 critical secret findings (currently 1 DB URL false positive)
- [ ] AC4: `ana scan` on n8n, trigger.dev, langfuse produce 0 PostHog warnings (currently 1 each)
- [ ] AC5: `ana init` on medusa produces AGENTS.md with at most 1 `hardcoded-secret` constraint line, not 10 duplicates
- [ ] AC6: All Group A sniper-customer repos (dub, inbox-zero, formbricks, midday, openpanel, Cap) remain clean — zero regressions
- [ ] AC7: `ana scan` on electric still detects the DB URL with real credentials (true positive preserved)
- [ ] AC8: All existing secrets tests pass except the weak signing secret test, which is removed or converted to a negative test
- [ ] AC9: `SECRET_PATTERNS` array no longer contains the weak signing secret pattern or the PostHog `phc_` pattern
- [ ] Tests pass with `(cd 'packages/cli' && pnpm vitest run)`
- [ ] No build errors with `(cd 'packages/cli' && pnpm run build)`

## Testing Strategy
- **Unit tests:** All changes are testable via the existing `checkHardcodedSecrets` harness. Each test creates a synthetic file in a temp directory and asserts on the findings array.
- **New negative tests:**
  - AWS example key `AKIAIOSFODNN7EXAMPLE` in a `.ts` file → should NOT be flagged
  - DB URL with `[password]` bracket template → should NOT be flagged
  - DB URL with `pw` as password → should NOT be flagged
- **Removed test:** The "detects weak JWT signing secret" test (lines 66-72) — remove it. The pattern no longer exists.
- **Regression negative test (optional):** A file containing `SECRET = "secret"` in an enum context → should NOT be flagged. Documents intent even though the code path is removed.
- **Existing tests that must still pass:** All other 20+ tests in the file. The AWS test at line 39-44 uses `AKIAIOSFODNN7EXAMPLE1` (trailing `1`) — this is NOT the AWS example key and must still be flagged as critical.

## Dependencies
None. All changes are self-contained within the CLI package.

## Constraints
- The `checkedServices` list in the pass message (line 200) must not be modified. It names services, not patterns.
- `DB_URL_PLACEHOLDERS` already contains `pass` at line 33. Do not add a duplicate.
- The AWS test at line 39-44 uses `AKIAIOSFODNN7EXAMPLE1` — one character different from the example key. The validate function must reject the exact example key only, not a prefix match.

## Gotchas
- The `validate` function for AWS receives the full regex match string (e.g., `AKIAIOSFODNN7EXAMPLE`). The check should compare the full 20-char match, not a substring. The regex is `/AKIA[A-Z0-9]{16}/g` — it matches exactly 20 characters.
- The bracket template regexes operate on the already-extracted, lowercased password from the DB URL regex. The password extraction happens in the existing `validate` function on the DB URL pattern (line 93-94). The new `TEMPLATE_PATTERNS` are checked by `isTemplateSyntax` which is already called at line 96. Adding the patterns to `TEMPLATE_PATTERNS` is sufficient — no new call site needed.
- When removing the PostHog pattern, also remove the trailing comma on the Twilio line if it becomes the last entry before the removed lines. Check formatting.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports.
- Engine files have zero CLI dependencies — no chalk, no ora.
- Explicit return types on all exported functions.
- `@param` and `@returns` JSDoc tags on exported functions.
- Use `| null` for checked-and-empty fields. Reserve `?:` for unchecked.
- Prefer early returns over nested conditionals.

### Pattern Extracts

**GitHub PAT validate pattern** (secrets.ts lines 84-86) — follow this for AWS example key:
```typescript
  { regex: /ghp_[a-zA-Z0-9]{36}/g, type: 'GitHub personal access token', severity: 'critical',
    validate: (match: string) => hasMinimumEntropy(match.slice(4)),
  },
```

**DB URL validate function** (secrets.ts lines 90-99) — shows how `isTemplateSyntax` is already called:
```typescript
  { regex: /(postgres|mysql|mongodb|redis):\/\/([^:\s'"]+):([^@\s'"]+)@[^\s'"]+/g,
    type: 'Database credentials in URL', severity: 'critical',
    validate: (match: string) => {
      const pwMatch = match.match(/:\/\/[^:]+:([^@]+)@/);
      const pw = pwMatch?.[1]?.toLowerCase();
      if (!pw) return true;
      if (isTemplateSyntax(pw)) return false;
      return !DB_URL_PLACEHOLDERS.some(p => pw === p || pw.startsWith(p + '-'));
    },
  },
```

**AGENTS.md constraint loop** (assets.ts lines 455-466) — add Set guard here:
```typescript
  if (engineResult && engineResult.findings.length > 0) {
    for (const f of engineResult.findings) {
      if (f.severity !== 'critical' && f.severity !== 'warn') continue;
      const instruction = findingInstructions[f.id];
      if (instruction) {
        const line = instruction.replace(
          '{lib}',
          getPatternLibrary(engineResult.patterns?.validation) || 'a schema validator'
        );
        constraintLines.push(`- ${line}`);
      }
    }
  }
```

### Proof Context
- `fix-scanner-trust-output-C2`: Single-angle pattern could suppress real passwords like `<admin>`. Closed concern — the pattern requires both `<` and `>` anchors. The new bracket patterns are similarly anchored with `[` and `]`. No action needed.
- No active proof findings for `assets.ts`.

### Checkpoint Commands
- After `secrets.ts` changes: `(cd 'packages/cli' && pnpm vitest run tests/engine/findings/secrets.test.ts)` — Expected: all tests pass (weak signing secret test removed, new negative tests added)
- After `assets.ts` changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: all tests pass
- After all changes: `pnpm run test -- --run` — Expected: 2924+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2924 passed, 2 skipped (2926 total)
- Current test files: 124 passed
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected 2926+ tests (removing 1 test, adding 3-4 new tests = net +2-3)
- Regression focus: `tests/engine/findings/secrets.test.ts` — all existing tests except the removed one must pass unchanged
