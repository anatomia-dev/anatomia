# Verify Report: Fix False Positive Secret Detection

**Result:** PASS
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

Tests: 2934 passed, 0 failed, 2 skipped. Build: clean. Lint: 0 errors (1 pre-existing warning in git-operations.ts, 2 pre-existing warnings in website Hero.tsx).

## Contract Compliance
| ID   | Says                                                         | Status       | Evidence |
|------|--------------------------------------------------------------|--------------|----------|
| A001 | The weak signing secret regex no longer exists in the scanner | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:68` — writes `jwtSecret = "supersecretkey"`, asserts no finding title includes "Weak signing". Confirmed: SECRET_PATTERNS in `secrets.ts:69-109` contains no "Weak signing" entry. |
| A002 | PostHog public analytics keys are no longer flagged           | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:220` — writes `phc_abc123...` key, asserts no finding title includes "PostHog". Confirmed: SECRET_PATTERNS contains no `phc_` pattern. |
| A003 | AWS documented example key is not flagged as a secret         | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:211` — writes `AKIAIOSFODNN7EXAMPLE`, asserts no critical AWS finding. `validate` function at `secrets.ts:84` rejects this exact string. |
| A004 | Real AWS keys are still detected                              | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:40` — writes `AKIA1234567890ABCDEF`, asserts critical AWS finding. Test key doesn't collide with example key. |
| A005 | Database URLs with bracket template passwords are not flagged | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:229` — writes `postgres://user:[password]@host:5432/db`, asserts no critical finding. Bracket pattern at `secrets.ts:43` matches. |
| A006 | Database URLs with short placeholder passwords are not flagged | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:238` — writes `postgres://user:pw@localhost:5432/db`, asserts no critical finding. `pw` in DB_URL_PLACEHOLDERS at `secrets.ts:34`. |
| A007 | Database URLs with real credentials are still detected        | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:277` — writes `postgres://deploy:s3cureP@ss!@prod.db.example.com:5432/app`, asserts critical Database finding. |
| A008 | Enum values like SECRET = secret no longer trigger false findings | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:256` — writes `SECRET = "secret"` enum, asserts no critical finding. No pattern in current set matches this. |
| A009 | Stripe live keys are still detected                           | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:268` — writes `sk_live_abcdefghij1234567890`, asserts critical "Live secret key" finding. |
| A010 | Duplicate constraint lines are collapsed in AGENTS.md         | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:312` — 3 identical `hardcoded-secret` findings produce 1 constraint line. Set-based dedup in `assets.ts:456-471` confirmed by source read. |
| A011 | Different constraint types are preserved, not collapsed       | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:324` — 4 findings (2 hardcoded-secret + api-validation + env-hygiene) produce 3 distinct lines. |
| A012 | Database URLs with pwd placeholder are not flagged            | ✅ SATISFIED | `packages/cli/tests/engine/findings/secrets.test.ts:247` — writes `postgres://user:pwd@localhost:5432/db`, asserts no critical finding. `pwd` in DB_URL_PLACEHOLDERS at `secrets.ts:34`. |

## Independent Findings

**Predictions before code read:**
1. *Predicted:* Builder replaced `phc_` keys with `sk_live_*` in commit-hygiene — may have been mechanical. **Confirmed partially** — builder fixed lines 103, 114, 122-123 but missed line 137 (`__tests__` exclusion test still uses `phc_`). The missed test is vacuously true, not failing.
2. *Predicted:* Stale docstring in secrets.ts:5 not fixed. **Not found** — builder cleaned up the docstring. Lines 1-15 no longer mention "weak signing secrets."
3. *Predicted:* Vacuously true test at line 137 still uses `phc_`. **Confirmed** — `excludes __tests__ directory from secret scan` uses `phc_testaaaaabbbbbcccccddddd` which is no longer detectable by any pattern, so the test asserts 0 findings for a reason unrelated to `__tests__` exclusion.
4. *Predicted:* Trailing bracket regex still broader than needed. **Confirmed** — `secrets.ts:44` unchanged. Non-blocker.
5. *Predicted:* Builder may introduce new fixture collisions. **Not found** — the `sk_live_*` replacements are clean and don't collide with existing patterns.

**Production risk:** None new. The `phc_` pattern removal is intentional (public keys), and the builder correctly updated the three commit-hygiene tests that were failing. The remaining `phc_` usage at line 137 is cosmetic — it tests directory exclusion, not pattern detection.

## Previous Findings Resolution

### Previously UNSATISFIED Assertions
No assertions were UNSATISFIED in the previous report. All 12 were SATISFIED.

### Previous Findings
| Finding | Status | Notes |
|---------|--------|-------|
| PostHog removal broke commit-hygiene tests (BLOCKER) | Fixed | Lines 103, 114, 122-123 now use `sk_live_*` keys. All 33 commit-hygiene tests pass. |
| Module docstring stale after pattern removal | Fixed | `secrets.ts` lines 1-15 no longer mention "weak signing secrets." |
| Trailing bracket regex broader than needed | Still present | `secrets.ts:44` — `/^[a-z_-]+\]$/` unchanged. Low-probability false suppression. Accepted. |
| Dedup assertions test extracted logic, not actual code path | Still present | `secrets.test.ts:293` — local `buildConstraintLines` mirrors `assets.ts` logic. Reasonable given `generateAgentsMd` setup cost. |
| @ana tag namespace collision across build cycles | Still present | A001-A007 duplicated from fix-scanner-trust-output cycle. Non-functional — proof chain resolves per-contract. |

## AC Walkthrough
- **AC1:** `ana scan` on medusa produces 0 critical secret findings. -- UNVERIFIABLE — no access to medusa repo. Contract assertions A001/A008 cover the specific false-positive patterns.
- **AC2:** `ana scan` on infisical produces 0 critical/0 warnings. -- UNVERIFIABLE — no access to infisical repo. A002 covers PostHog removal.
- **AC3:** `ana scan` on openpanel produces 0 critical. -- UNVERIFIABLE — no access to openpanel repo. A005 covers bracket template filtering.
- **AC4:** `ana scan` on n8n, trigger.dev, langfuse produce 0 PostHog warnings. -- UNVERIFIABLE — no access to repos. A002 covers PostHog removal.
- **AC5:** `ana init` on medusa produces AGENTS.md with at most 1 constraint line. -- UNVERIFIABLE as live test. A010/A011 cover dedup logic via unit test.
- **AC6:** Group A sniper-customer repos remain clean. -- UNVERIFIABLE — no access to repos. No patterns added, only removed/hardened.
- **AC7:** `ana scan` on electric still detects DB URL with real credentials. ⚠️ PARTIAL — A007 covers this via unit test but no live run on electric.
- **AC8:** All existing secrets tests pass except weak signing secret test. ✅ PASS — 2934 passed, 0 failed, 2 skipped. commit-hygiene tests all pass after fixture update.
- **AC9:** SECRET_PATTERNS no longer contains weak signing secret or PostHog patterns. ✅ PASS — confirmed by reading `secrets.ts:69-109`. Both patterns absent.
- **AC Tests pass:** ✅ PASS — 2934 passed, 0 failed, 2 skipped.
- **AC No build errors:** ✅ PASS — `pnpm run build` clean, lint clean.

## Blockers
No blockers. All 12 contract assertions satisfied. All tests pass (2934 passed, 0 failed). Build clean. Lint clean. The previous blocker (2 failing commit-hygiene tests) is resolved — builder replaced `phc_` fixture keys with `sk_live_*` keys at lines 103, 114, 122-123. Checked for: unused exports in new code (none — no new exports added), unhandled error paths (AWS validate returns boolean cleanly), assumptions about external state (none — all patterns are self-contained regex), missing edge cases from spec (bracket regex breadth noted in Findings but not a blocker).

## Findings

- **Test — Vacuously true __tests__ exclusion test:** `packages/cli/tests/commands/commit-hygiene.test.ts:137` — still uses `phc_testaaaaabbbbbcccccddddd` as fixture. With PostHog pattern removed, this key is undetectable by any pattern. The test asserts 0 findings, which is correct — but the test now passes because the key doesn't match anything, not because `__tests__` directory exclusion works. A real secret fixture (e.g., `sk_live_*`) would exercise the actual exclusion logic.

- **Code — Trailing bracket regex broader than [password] intent:** `packages/cli/src/engine/findings/rules/secrets.ts:44` — `/^[a-z_-]+\]$/` matches any lowercase word ending in `]`, not just bracket template artifacts. A production password like `mypass]` in a DB URL would be suppressed. Low probability (passwords rarely contain literal `]` and are rarely all-lowercase), but the pattern is broader than the `^\[[^\]]+\]$` pattern at line 43 that it supplements.

- **Test — Dedup assertions test extracted logic, not actual code path:** `packages/cli/tests/engine/findings/secrets.test.ts:293` — A010/A011 tests use a local `buildConstraintLines` function that mirrors `assets.ts:456-471` rather than exercising `generateAgentsMd` directly. If `assets.ts` drifts, the test passes on broken code. Reasonable given `generateAgentsMd` requires filesystem setup and full EngineResult — the mirror is an acceptable trade-off.

- **Test — @ana tag namespace collision across build cycles:** `packages/cli/tests/engine/findings/secrets.test.ts` — Pre-existing tags A001-A007 from fix-scanner-trust-output (lines 114-176) coexist with this contract's A001-A007 (lines 211-283). Two tags per ID degrades readability. Non-functional — proof chain resolves per-contract.

- **Upstream — fix-scanner-trust-output-C1 still present:** `packages/cli/tests/engine/findings/secrets.test.ts:169` — old A007 test asserts "at least one critical" across two URLs without verifying both passwords fire independently. Not introduced by this build, but still active per proof context.

## Deployer Handoff
Clean merge. All tests pass, build clean, lint clean. The previous blocker (commit-hygiene test regressions) is fixed. One cosmetic debt: the `__tests__` exclusion test at commit-hygiene.test.ts:137 still uses a `phc_` key that's now undetectable — worth swapping to `sk_live_*` in a future hygiene pass but doesn't affect correctness.

## Verdict
**Shippable:** YES
All 12 contract assertions satisfied. 2934 tests pass, 0 failures. Build clean. Lint clean. The previous blocker is resolved — builder replaced `phc_` fixtures in commit-hygiene tests. The remaining findings (vacuously true test, bracket regex breadth, dedup test indirection, tag namespace collision) are observations, not blockers. The secret detection changes are correct, the dedup logic works, and the downstream test dependency that caused the first FAIL is fixed.
