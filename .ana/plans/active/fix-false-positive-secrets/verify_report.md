# Verify Report: Fix False Positive Secret Detection

**Result:** FAIL
**Created by:** AnaVerify
**Date:** 2026-05-26
**Spec:** .ana/plans/active/fix-false-positive-secrets/spec.md
**Branch:** feature/fix-false-positive-secrets

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-false-positive-secrets/contract.yaml
  Seal: INTACT (hash sha256:b29c1d9ddb1bf2268e5d28f847761cd947649193950ac9021fb5c1e81f8b9c72)
```
Seal status: **INTACT**

Tests: 2932 passed, 2 failed, 2 skipped. Build: clean. Lint: 0 errors (1 pre-existing warning in git-operations.ts, 2 pre-existing warnings in website Hero.tsx).

## Contract Compliance
| ID   | Says                                                         | Status       | Evidence |
|------|--------------------------------------------------------------|--------------|----------|
| A001 | The weak signing secret regex no longer exists in the scanner | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:68` — writes `jwtSecret = "supersecretkey"`, asserts no finding title includes "Weak signing". Confirmed: SECRET_PATTERNS in `secrets.ts:69-109` contains no "Weak signing" entry. |
| A002 | PostHog public analytics keys are no longer flagged           | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:221` — writes `phc_abc123...` key, asserts no finding title includes "PostHog". Confirmed: SECRET_PATTERNS contains no `phc_` pattern. |
| A003 | AWS documented example key is not flagged as a secret         | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:212` — writes `AKIAIOSFODNN7EXAMPLE`, asserts no critical AWS finding. validate function at `secrets.ts:84` rejects this exact string. |
| A004 | Real AWS keys are still detected                              | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:41` — writes `AKIA1234567890ABCDEF`, asserts critical AWS finding. Test key changed from collision-prone `AKIAIOSFODNN7EXAMPLE1`. |
| A005 | Database URLs with bracket template passwords are not flagged | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:230` — writes `postgres://user:[password]@host:5432/db`, asserts no critical finding. Bracket pattern at `secrets.ts:43` catches `[password]`. |
| A006 | Database URLs with short placeholder passwords are not flagged | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:239` — writes `postgres://user:pw@localhost:5432/db`, asserts no critical finding. `pw` added to DB_URL_PLACEHOLDERS at `secrets.ts:34`. |
| A007 | Database URLs with real credentials are still detected        | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:278` — writes `postgres://deploy:s3cureP@ss!@prod.db.example.com:5432/app`, asserts critical Database finding. |
| A008 | Enum values like SECRET = secret no longer trigger false findings | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:257` — writes `SECRET = "secret"` enum, asserts no critical finding. Pattern was removed; no pattern in current set matches this. |
| A009 | Stripe live keys are still detected                           | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:269` — writes `sk_live_abcdefghij1234567890`, asserts critical "Live secret key" finding. |
| A010 | Duplicate constraint lines are collapsed in AGENTS.md         | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:313` — 3 identical `hardcoded-secret` findings produce 1 constraint line. Set-based dedup in `assets.ts:456-471` confirmed by source read. |
| A011 | Different constraint types are preserved, not collapsed       | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:325` — 4 findings (2 hardcoded-secret + api-validation + env-hygiene) produce 3 distinct lines. |
| A012 | Database URLs with pwd placeholder are not flagged            | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:248` — writes `postgres://user:pwd@localhost:5432/db`, asserts no critical finding. `pwd` added to DB_URL_PLACEHOLDERS at `secrets.ts:34`. |

## Independent Findings

**Predictions before code read:**
1. *Predicted:* Builder probably didn't update commit-hygiene tests that depend on removed patterns. **Confirmed** — commit-hygiene.test.ts at lines 103 and 122 use `phc_` PostHog keys as test fixtures. With the PostHog pattern removed, these 2 tests fail. This is the blocker.
2. *Predicted:* Builder probably left stale comments/docstrings referencing removed patterns. **Confirmed** — `secrets.ts:5` module docstring still mentions "weak signing secrets."
3. *Predicted:* The trailing bracket pattern might be overly broad. **Confirmed** — `/^[a-z_-]+\]$/` at `secrets.ts:44` matches any lowercase word ending in `]`, not just bracket template artifacts. A production password `mypass]` in a DB URL would be suppressed. Low probability but the pattern is broader than the `[password]` pattern it supplements.
4. *Predicted:* Dedup test probably tests a copy of the logic, not the actual code path. **Confirmed** — A010/A011 tests at `secrets.test.ts:293` extract a local `buildConstraintLines` function that mirrors `assets.ts` rather than testing `generateAgentsMd` directly. If assets.ts drifts, the test passes on broken code.
5. *Not predicted:* @ana tag collision — pre-existing tags A001-A007 from fix-scanner-trust-output remain on the template filtering tests (lines 114-176). The builder added new tests with the same assertion IDs for this contract. Two tags per ID creates ambiguity in tag-to-assertion mapping.

**Production risk:** The PostHog pattern removal has a downstream impact beyond secret detection — the commit-hygiene module uses the same SECRET_PATTERNS to check committed files. Any repo that previously triggered PostHog findings in commit hygiene will silently stop detecting them. This is the intended behavior (PostHog keys are public) but the test infrastructure wasn't updated.

## AC Walkthrough
- **AC1:** `ana scan` on medusa produces 0 critical secret findings. -- UNVERIFIABLE — no access to medusa repo in this session. Contract assertions A001/A008 cover the specific patterns that produced the false positives.
- **AC2:** `ana scan` on infisical produces 0 critical/0 warnings. -- UNVERIFIABLE — no access to infisical repo. A002 covers PostHog removal.
- **AC3:** `ana scan` on openpanel produces 0 critical. -- UNVERIFIABLE — no access to openpanel repo. A005 covers bracket template filtering.
- **AC4:** `ana scan` on n8n, trigger.dev, langfuse produce 0 PostHog warnings. -- UNVERIFIABLE — no access to repos. A002 covers PostHog removal.
- **AC5:** `ana init` on medusa produces AGENTS.md with at most 1 constraint line. -- UNVERIFIABLE as live test. A010/A011 cover the dedup logic via unit test.
- **AC6:** Group A sniper-customer repos remain clean. -- UNVERIFIABLE — no access to repos. No patterns were added, only removed/hardened, so regressions are unlikely.
- **AC7:** `ana scan` on electric still detects DB URL with real credentials. ⚠️ PARTIAL — A007 covers this via unit test but no live run on electric.
- **AC8:** All existing secrets tests pass except weak signing secret test. ❌ FAIL — 2 failures in `commit-hygiene.test.ts` (lines 102-109, 121-127) caused by PostHog `phc_` pattern removal. These tests use `phc_` keys as fixtures and now fail because the pattern no longer exists.
- **AC9:** SECRET_PATTERNS no longer contains weak signing secret or PostHog patterns. ✅ PASS — confirmed by reading `secrets.ts:69-109`. Both patterns absent.
- **AC Tests pass:** ❌ FAIL — 2932 passed, 2 failed, 2 skipped. Failures in `commit-hygiene.test.ts`.
- **AC No build errors:** ✅ PASS — `pnpm run build` clean, typecheck passed.

## Blockers
2 test regressions in `packages/cli/tests/commands/commit-hygiene.test.ts`:
1. **"detects secret in source file" (line 102)** — uses `phc_testaaaaabbbbbcccccddddd` as test fixture. PostHog `phc_` pattern removed → test finds 0 secrets instead of 1.
2. **"resets regex lastIndex between files" (line 121)** — uses two `phc_` keys across files. Same root cause → finds 0 instead of 2.

**Fix:** Replace `phc_` fixture keys with a still-detected pattern (e.g., `sk_live_abcdefghij1234567890`). Also update the "excludes test files from secret scan" test at line 113 which uses the same `phc_` key — that one happens to still pass (asserting 0 findings) but is now vacuously true.

## Findings

- **Code — PostHog removal broke commit-hygiene tests (BLOCKER):** `packages/cli/tests/commands/commit-hygiene.test.ts:103` — 3 tests use `phc_` PostHog keys as fixtures for secret detection. With the PostHog pattern removed from SECRET_PATTERNS, 2 tests fail and 1 becomes vacuously true. The builder updated `secrets.test.ts` but missed the downstream consumer in `commit-hygiene.test.ts`.

- **Code — Module docstring stale after pattern removal:** `packages/cli/src/engine/findings/rules/secrets.ts:5` — docstring still says "weak signing secrets" but the pattern was removed. Minor — but stale documentation in the module header misleads future readers about what the scanner checks.

- **Code — Trailing bracket regex broader than needed:** `packages/cli/src/engine/findings/rules/secrets.ts:44` — `/^[a-z_-]+\]$/` matches any lowercase word ending in `]`, not just bracket template artifacts. A real password like `mypass]` in a DB URL would be suppressed. The probability is low (passwords rarely contain literal `]` and are rarely all-lowercase), but the pattern is broader than the `^\[[^\]]+\]$` pattern it supplements. The spec hypothesized a "trailing bracket artifact from DB URL colon splitting" but the DB URL regex captures the full `[password]` including both brackets, so this artifact scenario may not actually occur.

- **Test — Dedup assertions test extracted logic, not actual code path:** `packages/cli/tests/engine/findings/secrets.test.ts:293` — A010/A011 tests replicate the constraint dedup logic in a local `buildConstraintLines` function rather than exercising `generateAgentsMd` in `assets.ts`. This is a reasonable approach given `generateAgentsMd` requires filesystem setup and full EngineResult, but it means the test passes even if the real implementation drifts from the test copy.

- **Test — @ana tag namespace collision across build cycles:** `packages/cli/tests/engine/findings/secrets.test.ts` — Pre-existing tags A001-A007 from fix-scanner-trust-output (lines 114-176) coexist with new tags for this contract's A001-A007 (lines 211-283). Two tests per assertion ID creates ambiguity. The proof chain system resolves tags per-contract, but a human reading the file sees duplicates. Not a functional problem — the correct tags exist — but it degrades readability.

## Deployer Handoff
Do not merge. 2 test regressions block this PR. The fix is straightforward: replace `phc_` fixture keys in `commit-hygiene.test.ts` (lines 103, 114, 122-123) with a still-detected pattern like `sk_live_abcdefghij1234567890`. After fixing, re-run `(cd 'packages/cli' && pnpm vitest run tests/commands/commit-hygiene.test.ts)` to confirm all 33 tests pass, then the full suite.

## Verdict
**Shippable:** NO
2 test regressions from PostHog pattern removal. The secret detection changes are correct. The dedup logic is correct. The test coverage for this contract's assertions is thorough. But the builder didn't catch the downstream dependency in commit-hygiene.test.ts. Fix the fixtures and this passes.
