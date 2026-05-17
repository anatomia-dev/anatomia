# Verify Report: Fix Scanner Trust Output

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-16
**Spec:** .ana/plans/active/fix-scanner-trust-output/spec.md
**Branch:** feature/fix-scanner-trust-output

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-scanner-trust-output/contract.yaml
  Seal: INTACT (hash sha256:d2f86ad220310165247968e46a2cf33bb183587e975989f1c0bef6aa06e64c9b)
```

Tests: 2376 passed, 2 skipped (2378 total). Build: success. Lint: 0 errors, 1 warning (pre-existing unused eslint-disable directive).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Double-angle template passwords are not flagged as secrets | ✅ SATISFIED | `secrets.test.ts:113` — writes `<<password>>` in DB URL, asserts no critical findings |
| A002 | Mustache template passwords are not flagged as secrets | ✅ SATISFIED | `secrets.test.ts:122` — writes `{{db_pass}}` in DB URL, asserts no critical findings |
| A003 | Dollar-brace template passwords are not flagged as secrets | ✅ SATISFIED | `secrets.test.ts:131` — writes `${dbPassword}` in DB URL, asserts no critical findings |
| A004 | Environment variable references in DB URLs are not flagged | ✅ SATISFIED | `secrets.test.ts:140` — writes `${process.env.DB_URL}`, asserts no critical findings |
| A005 | Single-angle placeholder passwords are not flagged as secrets | ✅ SATISFIED | `secrets.test.ts:149` — writes `<YOUR_PASSWORD>` (uppercase in source, lowercased by validate), asserts no critical findings |
| A006 | Real passwords in database URLs are still caught as critical | ✅ SATISFIED | `secrets.test.ts:158` — writes `realPassword123` in DB URL, asserts critical finding present |
| A007 | Passwords containing angle brackets but not template syntax still fire | ✅ SATISFIED | `secrets.test.ts:167` — writes `p@ss<w0rd` and `my{secret}123`, asserts critical finding present |
| A008 | npm projects get npx vitest run, not npm vitest run | ✅ SATISFIED | `makeTestCommand.test.ts:104` — `buildDirectTestCommand(['Vitest'], 'npm')` toBe `'npx vitest run'` |
| A009 | npm projects get npx jest with watch disabled | ✅ SATISFIED | `makeTestCommand.test.ts:109` — `buildDirectTestCommand(['Jest'], 'npm')` toBe `'npx jest --watchAll=false'` |
| A010 | npm projects get npx mocha with exit flag | ✅ SATISFIED | `makeTestCommand.test.ts:114` — `buildDirectTestCommand(['Mocha'], 'npm')` toBe `'npx mocha --exit'` |
| A011 | pnpm projects still get pnpm as the command prefix | ✅ SATISFIED | `makeTestCommand.test.ts:86` — `buildDirectTestCommand(['Vitest'], 'pnpm')` toBe `'pnpm vitest run'` |
| A012 | yarn projects still get yarn as the command prefix | ✅ SATISFIED | `makeTestCommand.test.ts:91` — `buildDirectTestCommand(['Vitest'], 'yarn')` toBe `'yarn vitest run'` |

## Independent Findings

**Prediction resolution:**
- Predicted single-angle regex might be too permissive → Partially confirmed. Pattern `/^<[a-z][a-z_-]*>$/` would suppress a real password like `<admin>` or `<token>`. In practice this is acceptable — single-word lowercase passwords in angle brackets in DB URLs are astronomically unlikely in production. Logged as observation.
- Predicted builder might miss empty template edge cases → Not found. All regexes use `+` quantifier (1+ chars required). Empty delimiters (`<<>>`, `${}`, `<>`) correctly don't match.
- Predicted inline ternary instead of `const runner` → Not found. Builder followed spec exactly.
- Predicted weak test assertions → Partially confirmed for A007 (see below).
- Predicted DB_URL_PLACEHOLDERS redundancy → Not found. No overlap between word placeholders and structural templates.

**Production risk check:** The `npx` fix doesn't verify npx availability, but this mirrors how pnpm/yarn are treated (assumed installed). Consistent behavior, not a gap.

## AC Walkthrough
- ✅ AC1: Template patterns don't produce findings — verified via tests (A001–A005 all pass)
- ✅ AC2: Real credentials still fire — test at line 158 asserts critical finding for `realPassword123`
- ✅ AC3: Partial template chars still fire — test at line 167 with `p@ss<w0rd` and `my{secret}123`
- ✅ AC4: At least 5 template variants tested — 5 template tests (A001–A005) plus A004 covers dotted path `${process.env.DB_URL}`
- ✅ AC5: `buildDirectTestCommand(['Vitest'], 'npm')` returns `'npx vitest run'` — test line 105
- ✅ AC6: `buildDirectTestCommand(['Jest'], 'npm')` returns `'npx jest --watchAll=false'` — test line 110
- ✅ AC7: `buildDirectTestCommand(['Mocha'], 'npm')` returns `'npx mocha --exit'` — test line 115
- ✅ AC8: pnpm/yarn unchanged — existing tests pass; mocha test corrected from `'npm'` to `'pnpm'` (fixing previously-wrong assertion)
- ✅ AC9: All tests pass — 2376 passed, 2 skipped, 0 failures

## Blockers

None. All 12 contract assertions satisfied. All 9 acceptance criteria pass. No regressions (baseline was 2366 tests, now 2376 — 10 new tests added). No unused exports in new code (both `isTemplateSyntax` and `TEMPLATE_PATTERNS` are module-private). No unhandled error paths in the new code (both changes are pure synchronous logic with no external I/O). No assumptions about external state.

## Findings

- **Test — A007 asserts "at least one" but doesn't isolate both passwords:** `packages/cli/tests/engine/findings/secrets.test.ts:167` — The test writes two URLs (`p@ss<w0rd` and `my{secret}123`) and asserts `findings.some(f => f.severity === 'critical')`. If the regex accidentally suppresses one but not the other, the test still passes. Separating into two test cases would catch individual regressions. Not a blocker — both passwords are structurally dissimilar to any template pattern, so false suppression is unlikely.

- **Code — Single-angle pattern has a theoretical false-negative window:** `packages/cli/src/engine/findings/rules/secrets.ts:43` — `/^<[a-z][a-z_-]*>$/` would suppress a real password that happens to be a single lowercase word in angle brackets (e.g., `<admin>`, `<token>`). This is acceptable given the use case (template/placeholder detection) and the vanishing likelihood of such passwords in production DB URLs. Worth noting for future pattern expansion.

- **Upstream — Proof chain finding still active:** `monorepo-build-scoping-C5` (pkg.path injected into shell command without sanitization in `state.ts`) remains present. This build doesn't modify that code path — the `buildDirectTestCommand` function is unrelated to the `buildCommandWithScoping` function where the injection exists.

## Deployer Handoff

Straightforward two-fix build. Both changes are leaf functions with no callers beyond their existing integrations. The secrets fix eliminates false-positive CRITICAL findings for template URLs in config examples — this directly improves first-scan trust for new users. The npm runner fix produces correct test commands for npm-based projects. No configuration changes, no new dependencies, no migration needed.

## Verdict
**Shippable:** YES

Clean implementation that follows the spec precisely. No over-building, no dead code, no scope creep. The 10 new tests cover all specified cases and the negative cases. Both fixes are isolated, well-anchored, and regression-safe.
