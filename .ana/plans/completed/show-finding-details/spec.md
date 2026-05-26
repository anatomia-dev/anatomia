# Spec: Show Finding Details in CLI Output

**Created by:** AnaPlan
**Date:** 2026-05-26
**Scope:** .ana/plans/active/show-finding-details/scope.md

## Approach

Two changes, both small:

1. **Display loop in `scan.ts`:** After each finding title line is pushed, check if `f.detail` is non-null. If so, split on `\n` and push each line as `chalk.gray()` with 4-space indent. This sits inside the existing `for (const f of criticalOrWarn)` loop, immediately after the title push.

2. **Validation detail rewrite in `validation.ts`:** Replace the two-line detail string (which contains a literal `\n`) with a single line: `Heuristic: checks imports in first 30 lines. Checks imports in first 30 lines; wrapper-based or middleware validation may not be detected.`

The structural analog is the funnel-mode pass display at `scan.ts:333-340` — same `lines.push()` pattern, same loop context. The detail rendering follows the same shape: conditional content pushed as indented lines below the primary line.

## Output Mockups

**Warn finding with detail (validation):**
```
  ⚠ 3/10 API routes have no validation imports
    Heuristic: checks imports in first 30 lines. Checks imports in first 30 lines; wrapper-based or middleware validation may not be detected.
```

**Critical finding with detail (secret):**
```
  ● Hardcoded API key
    sk_l****aBcD  src/config.ts:42
```

**Warn finding with detail (env hygiene):**
```
  ⚠ No .env.example · .env not in .gitignore
    AI won't know what env vars this project needs without .env.example
```

**Finding with null detail (pass — never reaches this loop):** No detail line rendered.

## File Changes

### `packages/cli/src/commands/scan.ts` (modify)
**What changes:** Inside the `for (const f of criticalOrWarn)` loop, after `lines.push(\`  ${icon} ${text}\`)`, add a null-check on `f.detail` and push each detail line as indented gray text.
**Pattern to follow:** The funnel-mode pass display at lines 333-340 — same `lines.push()` calls, same indentation style.
**Why:** Without this, `f.detail` is computed by every finding rule but never shown to the user. Three of four rules write meaningful detail text that aids diagnosis.

### `packages/cli/src/engine/findings/rules/validation.ts` (modify)
**What changes:** Replace the detail string at line 116 from the two-line version (with literal `\n`) to a single line: `'Heuristic: checks imports in first 30 lines. Checks imports in first 30 lines; wrapper-based or middleware validation may not be detected.'`
**Pattern to follow:** The env.ts detail at line 50 — a single explanatory sentence.
**Why:** The current two-line detail produces a sentence fragment on line 1 if rendered individually. A single line is cleaner and complete.

## Acceptance Criteria

- [ ] AC1: `ana scan` on a repo with warn/critical findings shows `f.detail` as indented gray text below each finding title.
- [ ] AC2: `ana scan` on a repo with all-pass findings shows no detail lines (pass findings only render in funnel mode, and funnel mode doesn't use the detail path).
- [ ] AC3: The validation finding's detail is a single line: `Heuristic: checks imports in first 30 lines. Checks imports in first 30 lines; wrapper-based or middleware validation may not be detected.`
- [ ] AC4: Secret findings show their redacted match + file:line detail below each title.
- [ ] AC5: Env hygiene finding shows its explanatory detail below the title.
- [ ] AC6: CLI output for a repo with multiple findings remains compact — one detail line per finding, indented under its title.
- [ ] AC7: Tests pass with `pnpm run test -- --run`
- [ ] AC8: No build errors with `pnpm run build`

## Testing Strategy

- **Unit tests:** Add a test for the validation detail text change. The existing test A007 in `tests/engine/findings/rules/validation.test.ts` asserts `detail` contains `'wrapper-based'` — the new detail text preserves this exact substring (lowercase, hyphenated), so A007 continues to pass. Add a new test asserting the detail is a single line (no `\n`) and matches the exact AC3 text.
- **Unit tests:** Add a test for the `scan.ts` display rendering. The `formatHumanReadable` function is not exported, so test via the finding detail rendering logic directly — create findings with detail, pass through the display, and verify detail lines appear in output.
- **Edge cases:** Finding with `detail: null` produces no extra lines. Finding with multi-line detail (split on `\n`) produces multiple gray lines.

## Dependencies

None. Both files exist and the patterns are established.

## Constraints

- Engine files (`validation.ts`) must have zero CLI dependencies — no chalk. The detail is a plain string; chalk formatting happens only in `scan.ts`.
- The funnel-mode branch (`else if (options.isFunnel)`) must not be touched — it handles a different display path.

## Gotchas

- The validation detail at line 116 uses a literal `\n` inside a regular string, not a template literal newline. The replacement is the entire string, so the `\n` handling is moot — but don't try to "fix" the escape; replace the whole value.
- `formatHumanReadable` is not exported. To test the display rendering, the builder will need to either export it or test via the existing test patterns for scan display. Check how other scan display tests work — if none exist, export the function or test the detail-rendering logic in isolation.
- Existing test A007 asserts `finding.detail` contains `'wrapper-based'`. The new detail text preserves `wrapper-based` (lowercase, hyphenated) so the case-sensitive `.toContain()` assertion passes unchanged.

## Build Brief

### Rules That Apply
- All local imports use `.js` extensions (`import { foo } from './bar.js'`).
- Engine files (`src/engine/`) have zero CLI dependencies — no chalk, no commander, no ora.
- Use `import type` for type-only imports, separate from value imports.
- Prefer early returns over nested conditionals.
- 2-space indentation throughout.

### Pattern Extracts

**Structural analog — funnel-mode pass display (`scan.ts:333-340`):**
```typescript
  } else if (options.isFunnel) {
    // In funnel mode, acknowledge clean check in one line
    const passChecks: string[] = [];
    if (result.findings.some(f => f.id === 'hardcoded-secret' && f.severity === 'pass')) passChecks.push('no secrets');
    if (result.secrets.gitignoreCoversEnv) passChecks.push('.gitignore covers .env');
    if (passChecks.length > 0) {
      lines.push(`  ${chalk.green('✓')} Clean — ${passChecks.join(', ')}`);
    }
  }
```

**Title line pattern (`scan.ts:328-331`):**
```typescript
    for (const f of criticalOrWarn) {
      const icon = f.severity === 'critical' ? chalk.red('●') : chalk.yellow('⚠');
      const text = f.severity === 'critical' ? chalk.red(f.title) : f.title;
      lines.push(`  ${icon} ${text}`);
    }
```

**Env detail — single-line pattern (`env.ts:46-52`):**
```typescript
  return {
    id: 'env-hygiene',
    severity: 'warn',
    title: issues.join(' · '),
    detail: 'AI won\'t know what env vars this project needs without .env.example',
    category: 'quality',
  };
```

**Existing validation detail to replace (`validation.ts:112-118`):**
```typescript
  return {
    id: 'api-validation',
    severity,
    title: `${unvalidated}/${routeFiles.length} API routes have no validation imports`,
    detail: 'Checked top-of-file imports for validation libraries. Routes using\nwrapper-based or middleware-based validation may not be detected.',
    category: 'security',
  };
```

### Proof Context
- `scan.ts`: `formatHumanReadable` not exported — display tested structurally, not via rendered output. Builder should be aware export may be needed for testing.
- `validation.ts`: False-positive risk on VALIDATION_PATH_PATTERNS (known, not relevant to this change). Sync readFileSync pattern established (not relevant to this change).

### Checkpoint Commands
- After `validation.ts` change: `(cd 'packages/cli' && pnpm vitest run tests/engine/findings/rules/validation.test.ts)` — Expected: 9 tests pass (including A007 unchanged)
- After `scan.ts` change: `(cd 'packages/cli' && pnpm vitest run)` — Expected: all tests pass
- After all changes: `pnpm run test -- --run` — Expected: 2924+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2924 passed, 2 skipped (2926 total)
- Current test files: 124
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected 2926+ tests (2924+ passing) — new tests for detail rendering and detail text
- Regression focus: `tests/engine/findings/rules/validation.test.ts` (A007 detail assertion)
