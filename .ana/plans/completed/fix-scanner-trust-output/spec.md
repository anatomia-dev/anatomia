# Spec: Fix Scanner Trust Output

**Created by:** AnaPlan
**Date:** 2026-05-16
**Scope:** .ana/plans/active/fix-scanner-trust-output/scope.md

## Approach

Two isolated fixes that share zero code paths:

**Fix 1 — Template pattern recognition in secret validator.** The `validate` function on the DB URL pattern (`secrets.ts:63-66`) currently checks the extracted password against a word list. Add structural template detection BEFORE the word list check. If the password (already lowercased at line 65) matches any anchored template regex, return `false` immediately — it's categorically not a credential.

The four structural patterns (tested against `pw`, which is the lowercased extracted password):
- `<<...>>` — `/^<<[^>]+>>$/`
- `{{...}}` — `/^\{\{[^}]+\}\}$/`
- `${...}` — `/^\$\{[^}]+\}$/`
- `<word>` — `/^<[a-z][a-z_-]*>$/` (single-angle with lowercase alpha+underscore+hyphen content, matches `<YOUR_PASSWORD>`, `<your-password>`, `<db-password-here>` after lowercasing)

All patterns are anchored (`^...$`) — the template syntax must be the ENTIRE password. This ensures passwords containing template characters (`p@ss<w0rd`, `my{secret}123`) are not suppressed.

**Fix 2 — npm runner mapping in `buildDirectTestCommand`.** The function currently interpolates `packageManager` directly into the command string. This works for pnpm/yarn/bun (they forward to local bins) but not npm (requires `npx`). Add a single `const runner = packageManager === 'npm' ? 'npx' : packageManager;` and use `runner` in the return strings.

## Output Mockups

**Before fix 1** (false positive on scan):
```
CRITICAL  Database credentials in URL
          postgres://user:<<password>>@host:5432/db
          File: config/example.ts:3
```

**After fix 1:** No finding generated. The pass result remains unchanged.

**Before fix 2** (broken command in ana.json):
```json
{ "test": "(cd packages/web && npm vitest run)" }
```

**After fix 2:**
```json
{ "test": "(cd packages/web && npx vitest run)" }
```

## File Changes

### `packages/cli/src/engine/findings/rules/secrets.ts` (modify)
**What changes:** Add a `isTemplateSyntax` helper function and call it in the `validate` function before the word list check. If the extracted password matches any structural template pattern, return `false`.
**Pattern to follow:** The existing `DB_URL_PLACEHOLDERS` check at line 66. The new check is a peer — same location, similar early-return logic.
**Why:** Without this, template URLs in config examples and documentation fire CRITICAL findings, eroding first-user trust.

### `packages/cli/src/commands/init/state.ts` (modify)
**What changes:** Add runner resolution (`const runner = packageManager === 'npm' ? 'npx' : packageManager`) at the top of `buildDirectTestCommand`, then use `runner` instead of `packageManager` in the return strings.
**Pattern to follow:** The function already maps frameworks to flags — the runner mapping is the same kind of lookup.
**Why:** Without this, npm monorepo users get unrunnable test commands (`npm vitest run` → "npm ERR! Missing script").

### `packages/cli/tests/engine/findings/secrets.test.ts` (modify)
**What changes:** Add a new `describe` block for template pattern filtering with tests covering: `<<password>>`, `{{db_pass}}`, `${dbPassword}`, `${process.env.DB_URL}`, `<your_password>` (at least 5 variants). Also add negative tests confirming real passwords with template characters still fire.
**Pattern to follow:** The existing "filters database URL with placeholder password" test at line 55-64 — same tmpDir + writeFile + assert pattern.
**Why:** Establishes regression safety for the new template detection logic.

### `packages/cli/tests/commands/init/makeTestCommand.test.ts` (modify)
**What changes:** Correct the existing mocha assertion (line 98) from `'npm mocha --exit'` to `'npx mocha --exit'`. Add three new `it()` blocks: npm+Vitest (`'npx vitest run'`), npm+Jest (`'npx jest --watchAll=false'`), npm+Mocha (`'npx mocha --exit'`).
**Pattern to follow:** The existing `buildDirectTestCommand` tests at lines 84-116 — one `it()` per case, direct call, `toBe()` assertion.
**Why:** The existing test enshrines broken behavior as expected. Correcting it + adding npm cases prevents regression.

## Acceptance Criteria

- [x] AC1: Template syntax patterns (`<<password>>`, `{{db_pass}}`, `${dbPassword}`, `${process.env.DB_URL}`, `<YOUR_PASSWORD>`) in the password position of a DB URL do NOT produce findings
- [x] AC2: Real credentials still fire — `postgres://user:realPassword123@prod.example.com:5432/db` remains CRITICAL
- [x] AC3: Passwords containing special chars still fire — `p@ss<w0rd`, `my{secret}123`, `p<ss{word` are NOT suppressed
- [x] AC4: Tests cover at least 5 template syntax variants including mixed-case content in `${...}`
- [x] AC5: `buildDirectTestCommand(['Vitest'], 'npm')` returns `npx vitest run`
- [x] AC6: `buildDirectTestCommand(['Jest'], 'npm')` returns `npx jest --watchAll=false`
- [x] AC7: `buildDirectTestCommand(['Mocha'], 'npm')` returns `npx mocha --exit`
- [x] AC8: pnpm/yarn/bun behavior unchanged — existing tests pass unmodified (except the npm mocha assertion which corrects from `npm` to `npx`)
- [x] AC9: All existing tests pass (`pnpm vitest run` in packages/cli)
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `(cd packages/cli && pnpm run build)`
- [ ] No lint errors with `pnpm run lint`

## Testing Strategy

- **Unit tests (secrets):** Each template variant gets its own test case inside a single `describe('filters template syntax in database URLs')` block. Write one `.ts` file per test containing a postgres URL with the template password. Assert: no critical findings. Add 2 negative cases confirming real passwords with template chars still fire.
- **Unit tests (test command):** Three new `it()` blocks for npm + each framework. Correct the existing mocha assertion. All use direct `buildDirectTestCommand()` calls with `toBe()`.
- **Edge cases:** `${process.env.DB_URL}` (dotted path inside template), `<your_password>` (lowercase single-angle after lowercasing), passwords with unpaired `<` or `{` that should NOT be filtered.

## Dependencies

None. Both fixes modify leaf functions with no upstream dependencies.

## Constraints

- The `validate` function receives the full URL match string, not just the password. Password extraction happens inside validate (line 64). The new template check must operate on `pw` (the extracted, lowercased password).
- Engine files have zero CLI dependencies — no chalk, no ora. The `isTemplateSyntax` helper is a pure function.
- All imports use `.js` extensions.

## Gotchas

- **`pw` is lowercased.** The `<UPPER_CASE>` pattern from source becomes `<your_password>` by the time the regex sees it. The single-angle regex must match lowercase with hyphens: `/^<[a-z][a-z_-]*>$/` (covers `<your-password>`, `<db-password-here>`).
- **Anchoring is critical.** Without `^...$`, passwords like `p@ss<w0rd` would partially match `<w0rd>` patterns. Every template regex must be fully anchored.
- **The existing mocha test is WRONG.** Line 98 asserts `'npm mocha --exit'` — this is the broken behavior. The fix changes the expected value, it doesn't add a "skip" or "todo". If the builder leaves the old assertion, the test will fail.
- **`bun` forwards to local bins.** Don't add bun to the npm conditional. Only npm needs the `npx` substitution.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Engine files have zero CLI dependencies.
- Prefer early returns over nested conditionals.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Use `import type` for type-only imports, separate from value imports.
- Named exports only.

### Pattern Extracts

**Existing validate function (secrets.ts:61-68):**
```typescript
  { regex: /(postgres|mysql|mongodb|redis):\/\/([^:\s'"]+):([^@\s'"]+)@[^\s'"]+/g,
    type: 'Database credentials in URL', severity: 'critical',
    validate: (match: string) => {
      const pwMatch = match.match(/:\/\/[^:]+:([^@]+)@/);
      const pw = pwMatch?.[1]?.toLowerCase();
      return pw ? !DB_URL_PLACEHOLDERS.some(p => pw === p || pw.startsWith(p + '-')) : true;
    },
  },
```

**Existing buildDirectTestCommand (state.ts:248-268):**
```typescript
export function buildDirectTestCommand(
  frameworks: string[],
  packageManager: string,
): string | null {
  if (frameworks.includes('Vitest')) {
    return `${packageManager} vitest run`;
  }
  if (frameworks.includes('Jest')) {
    return `${packageManager} jest --watchAll=false`;
  }
  if (frameworks.includes('Mocha')) {
    return `${packageManager} mocha --exit`;
  }
  if (frameworks.includes('pytest')) {
    return 'pytest';
  }
  return null;
}
```

**Existing secrets test pattern (secrets.test.ts:55-64):**
```typescript
  it('filters database URL with placeholder password', async () => {
    fs.writeFileSync(path.join(tmpDir, 'example.ts'), `
      // Example: postgres://user:password@localhost:5432/db
      const url = "postgres://user:password@localhost:5432/mydb";
    `);
    const findings = await checkHardcodedSecrets(makeContext(tmpDir));
    // Should be a pass — placeholder password filtered
    expect(findings.some(f => f.severity === 'pass')).toBe(true);
    expect(findings.some(f => f.severity === 'critical')).toBe(false);
  });
```

**Existing buildDirectTestCommand test pattern (makeTestCommand.test.ts:84-98):**
```typescript
describe('buildDirectTestCommand', () => {
  it('returns pnpm vitest run for Vitest', () => {
    expect(buildDirectTestCommand(['Vitest'], 'pnpm')).toBe('pnpm vitest run');
  });

  it('returns yarn vitest run for Vitest + yarn', () => {
    expect(buildDirectTestCommand(['Vitest'], 'yarn')).toBe('yarn vitest run');
  });

  it('returns mocha --exit for Mocha', () => {
    expect(buildDirectTestCommand(['Mocha'], 'npm')).toBe('npm mocha --exit');
  });
```

### Proof Context

No active proof findings for affected files.

### Checkpoint Commands

- After modifying `secrets.ts`: `(cd packages/cli && pnpm vitest run tests/engine/findings/secrets.test.ts)` — Expected: all tests pass including new template cases
- After modifying `state.ts`: `(cd packages/cli && pnpm vitest run tests/commands/init/makeTestCommand.test.ts)` — Expected: all tests pass with corrected npm assertions
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2366+ tests pass (baseline 2366)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2366 passed, 2 skipped (2368 total)
- Current test files: 106
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 2374+ tests in 106 files (adding ~8 new test cases across existing files)
- Regression focus: `tests/engine/findings/secrets.test.ts`, `tests/commands/init/makeTestCommand.test.ts`
