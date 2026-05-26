# Scope: Fix False Positive Secret Detection

**Created by:** Ana
**Date:** 2026-05-26

## Intent

The secret scanner's weak signing secret regex produces false critical findings from enum values, JSDoc examples, dev default constants, form field type declarations, and mock methods. Across 48 repos tested, this regex has zero true positives and 23+ false positives. Those false findings propagate into AGENTS.md as duplicated constraint lines and into project-context.md as inflated issue counts. The PostHog `phc_` pattern also flags intentionally-public analytics keys as warnings.

The user wants the scan to stop lying. A medusa founder running `ana scan` sees 10 red critical findings — all false. An infisical founder sees 12 — all false. The fix removes the patterns that produce false data and deduplicates the downstream propagation path so that even legitimate repeated findings don't produce identical AGENTS.md lines.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — 6 discrete changes in 2 files, plus test updates
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/engine/findings/rules/secrets.ts` (4 changes)
  - `packages/cli/src/commands/init/assets.ts` (1 change)
  - `packages/cli/tests/engine/findings/secrets.test.ts` (test updates)
- **Blast radius:** Three downstream consumers display or propagate findings data. All three are fixed by correcting the findings source:
  1. `src/commands/scan.ts:327-331` — CLI display iterates `criticalOrWarn` findings. Fewer false findings = cleaner display. No code change needed.
  2. `src/commands/init/assets.ts:455-466` — AGENTS.md constraint generation iterates all findings. False findings produce duplicate lines. Fixed by (a) reducing false findings at the source and (b) deduplicating constraint lines.
  3. `src/utils/scaffold-generators.ts:92-98` — project-context.md renders `"X critical, Y warnings"` from finding counts. Fixed by reducing false findings at the source. No code change needed.
- **Estimated effort:** 1-2 hours implementation, 1 hour test updates
- **Multi-phase:** no

## Approach

Remove the weak signing secret regex that produces 0 true positives across 48 repos. Harden the database URL placeholder filters with bracket template patterns and additional placeholder values. Add AWS's known example key to a blocklist. Remove the PostHog `phc_` pattern (public-by-design keys should not be flagged at any severity). Deduplicate AGENTS.md constraint lines by rendered string content so that multiple instances of the same finding never produce identical instruction lines.

The service-specific patterns (Stripe `sk_live_`, OpenAI `sk-proj-`, AWS `AKIA`, GitHub `ghp_`/`github_pat_`, DB URLs with real credentials, Resend, SendGrid, Twilio) remain untouched. These patterns verify by structural prefix and have zero false positives across all tested repos.

## Acceptance Criteria
- AC1: `ana scan` on medusa produces 0 critical secret findings (currently 10)
- AC2: `ana scan` on infisical produces 0 critical secret findings (currently 12) and 0 warnings (currently 1 PostHog)
- AC3: `ana scan` on openpanel produces 0 critical secret findings (currently 1 DB URL false positive)
- AC4: `ana scan` on n8n, trigger.dev, langfuse produce 0 PostHog warnings (currently 1 each)
- AC5: `ana init` on medusa produces AGENTS.md with at most 1 `hardcoded-secret` constraint line, not 10 duplicates
- AC6: All Group A sniper-customer repos (dub, inbox-zero, formbricks, midday, openpanel, Cap) remain clean — zero regressions
- AC7: `ana scan` on electric still detects the DB URL with real credentials (true positive preserved)
- AC8: All existing secrets tests pass except the weak signing secret test, which is removed or converted to a negative test
- AC9: `SECRET_PATTERNS` array no longer contains the weak signing secret pattern or the PostHog `phc_` pattern

## Edge Cases & Risks

**Risk: removing the weak signing secret regex misses future real secrets.** A repo with `jwtSecret = "password"` in production config would go undetected. Mitigated by: (a) 0 true positives across 48 tested repos including auth-heavy projects like hanko, strapi, chatwoot, tooljet, discourse; (b) the value list (`supersecret`, `password`, `changeme`, etc.) only catches placeholder values, not real weak passwords — a developer who ships `jwtSecret = "mycompanykey"` was never caught anyway; (c) the service-specific patterns (Stripe, OpenAI, AWS, DB URLs) remain and catch actual credential leaks.

**Risk: removing PostHog pattern hides PostHog usage from scan output.** PostHog project keys are intentionally public (PostHog's own docs say so). Flagging them at any severity produces a false signal. PostHog usage is already detected by the external services detector if present as a dependency — the secret scanner is the wrong place to surface this.

**Risk: bracket template patterns must handle both DB URL split variants.** The DB URL regex `://([^:]+):([^@]+)@` splits around colons. For `postgres://[user]:[:password]@host`, the password group extracts `[:password]` — matched by `/^\[[^\]]*\]$/`. For `postgres://[user][:password]@host`, the password group extracts `password]` (trailing artifact after colon split) — matched by `/^[a-z_-]*\]$/`. Both patterns are needed. This was caught by three independent reviewers of the REQ; I did not independently verify it.

**Risk: AGENTS.md dedup must be by rendered string content, not finding ID.** The `api-validation` instruction uses `{lib}` substitution (`assets.ts:460-462`), so different finding instances could theoretically produce different rendered instructions (e.g., `Validate with zod` vs `Validate with a schema validator`). Content-based dedup using `Set<string>` handles this correctly — identical rendered strings are collapsed, distinct ones are preserved.

**Note: PostHog severity change is a behavior change, not just display.** The AGENTS.md constraint filter at `assets.ts:457` checks `f.severity !== 'critical' && f.severity !== 'warn'`. Removing the PostHog pattern entirely (rather than downgrading to `info`) avoids the question of whether `info` findings should propagate. It also avoids leaving a known-false pattern in the codebase.

## Rejected Approaches

**Option B/C/D (JSDoc detection, enum exclusion, combined):** Adding context-aware filtering to work around a fundamentally broken regex. These add code to manage a problem instead of removing the code that causes it. Design principle: "The elegant solution is the one that removes."

**Option E (narrow value list — remove "secret", keep regex):** Eliminates ~13 FPs (enum + mock patterns where the matched value is literally `"secret"`) but leaves JSDoc examples (`"supersecret"`) and dev defaults unfixed. Still scaffolding — a partial fix on a pattern that produces 0 true positives.

**Option E+B (narrow value list + JSDoc detection):** Better coverage than E alone, but adds a JSDoc state machine to support a regex with 0 true positives. Foundation principle violated.

**Downgrade PostHog to `info` instead of removing:** Leaves a known-false pattern in the codebase. An `info` finding that is always false is still false data in `scan.json`. Removing is cleaner.

**Comment-line skipping (blanket):** Dangerous for service-specific patterns. A real `sk_live_` Stripe key in a comment IS a credential leak. Comment detection should never apply to structural-prefix patterns. Moot since Option A removes the only pattern that would benefit.

## Open Questions

None. All investigation items from the REQ have been resolved:
- Broader scan completed (48 repos, 0 true positives for weak signing secret regex)
- Bracket template patterns verified by 3 independent reviewers and corrected
- AGENTS.md dedup approach confirmed as content-based
- PostHog removal confirmed as correct approach
- `.env.example` exclusion confirmed working (`SECRET_GLOB_IGNORE` line 130: `'**/.env*'`)

## Exploration Findings

### Patterns Discovered
- `secrets.ts`: Well-structured pattern array with `SecretPattern` interface. Each pattern has regex, type, severity, optional validate function. The weak signing secret at lines 107-109 is the only pattern without structural verification — it matches by vocabulary proximity instead of fixed prefix.
- `assets.ts:455-466`: Finding-to-constraint loop iterates all findings without deduplication. The `findingInstructions` map at lines 449-452 maps finding IDs to instruction strings, but the loop emits one line per finding instance, not per unique finding ID.
- `scaffold-generators.ts:92-98`: Counts findings by severity and renders into project-context.md. No code change needed — count becomes correct when findings are correct.

### Constraints Discovered
- [TYPE-VERIFIED] `SECRET_GLOB_IGNORE` excludes `**/*.spec.*` files but NOT `**/spec/**` directories (secrets.ts:117-118). Ruby's `*_spec.rb` naming convention happens to match the file glob, but a Ruby file in `spec/` not named `*_spec.rb` would be scanned.
- [OBSERVED] The `pass` finding detail at line 200 lists checked services but doesn't mention "weak signing secrets" — removing the pattern requires no change to the pass message.
- [OBSERVED] The `findingInstructions` map in `assets.ts:449-452` has entries for `hardcoded-secret`, `api-validation`, and `env-hygiene`. The `api-validation` entry uses `{lib}` substitution, making content-based dedup necessary over ID-based dedup.

### Test Infrastructure
- `tests/engine/findings/secrets.test.ts`: 17 tests using temp directories with `fs.writeFileSync` to create synthetic source files. Test at lines 66-72 ("detects weak JWT signing secret") explicitly tests the pattern being removed — must be removed or converted to a negative assertion. Test at lines 39-44 ("detects AWS access key") uses `AKIAIOSFODNN7EXAMPLE1` which is one character different from the AWS example key `AKIAIOSFODNN7EXAMPLE` — unaffected by the blocklist addition.

## For AnaPlan

### Structural Analog
`secrets.ts` lines 84-86 — the GitHub personal access token pattern with a `validate` function (`hasMinimumEntropy`). This is the closest structural match for how to add the AWS example key blocklist: add a `validate` function to the AWS pattern that rejects the known example key. Alternatively, add a standalone blocklist check in the main scan loop — but the `validate` pattern is already established.

### Relevant Code Paths
- `packages/cli/src/engine/findings/rules/secrets.ts` — all 4 secret scanner changes happen here
  - Lines 38-43: `TEMPLATE_PATTERNS` array — add 2 bracket patterns
  - Lines 31-35: `DB_URL_PLACEHOLDERS` array — add `pw`, `pass`, `pwd` (note: `pass` is already present at line 33)
  - Lines 80-81: AWS access key pattern — add `validate` function rejecting `AKIAIOSFODNN7EXAMPLE`
  - Lines 105: PostHog `phc_` pattern — remove entirely
  - Lines 107-109: Weak signing secret pattern — remove entirely
- `packages/cli/src/commands/init/assets.ts` — 1 change
  - Lines 455-466: finding-to-constraint loop — add `Set<string>` dedup guard before `constraintLines.push`
- `packages/cli/tests/engine/findings/secrets.test.ts` — test updates
  - Lines 66-72: weak signing secret test — remove or convert to negative test
  - Add: test for AWS example key `AKIAIOSFODNN7EXAMPLE` (should not be flagged)
  - Add: test for bracket template `[password]` in DB URL (should not be flagged)
  - Add: test for `pw` placeholder in DB URL (should not be flagged)

### Patterns to Follow
- The `validate` function pattern on `SecretPattern` (see GitHub PAT at line 84-86) for the AWS example key check
- The `DB_URL_PLACEHOLDERS` array pattern for adding new placeholder values
- The `TEMPLATE_PATTERNS` array pattern for adding new bracket patterns
- Existing test structure: `fs.writeFileSync` + `checkHardcodedSecrets(makeContext(tmpDir))` + severity/title assertions

### Known Gotchas
- `DB_URL_PLACEHOLDERS` already contains `pass` (line 33). Only `pw` and `pwd` are new additions. AnaPlan/AnaBuild should verify this before adding duplicates.
- The AWS access key test at line 39-44 uses `AKIAIOSFODNN7EXAMPLE1` (note trailing `1`). This is NOT the AWS example key `AKIAIOSFODNN7EXAMPLE` (no trailing `1`). The test should still pass after adding the blocklist. The new blocklist test should use the exact `AKIAIOSFODNN7EXAMPLE` string.
- Removing the PostHog pattern from `SECRET_PATTERNS` means PostHog keys no longer appear in scan output at all — not as critical, not as warn, not as info. This is intentional. If PostHog presence should be tracked, it belongs in the external services detector, not the secret scanner.

### Things to Investigate
- Whether to add a regression test scanning a synthetic file with `SECRET = "secret"` in an enum pattern to confirm it's NOT flagged (negative test for the removed regex). This is a design judgment call — the regex is removed, so there's no code path to test. But a regression test documents the intent.
