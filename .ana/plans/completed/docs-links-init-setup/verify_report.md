# Verify Report: Documentation links in init and setup

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-14
**Spec:** .ana/plans/active/docs-links-init-setup/spec.md
**Branch:** feature/docs-links-init-setup

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/docs-links-init-setup/contract.yaml
  Seal: INTACT (hash sha256:2a661b4b4e3f3333481d20afeb462c489a60956bcb1181beedbf5034ed88060d)
```

Seal status: **INTACT**

Tests: 2297 passed, 2 skipped (2299 total). Build: success. Lint: success (2/2 tasks).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Init success output shows a quickstart documentation link | ✅ SATISFIED | `packages/cli/tests/commands/init.test.ts:572–583` — captures console output, asserts `output.toContain(DOCS_QUICKSTART)` where DOCS_QUICKSTART = `https://anatomia.dev/docs/start` |
| A002 | The quickstart link has a labeled format users can scan | ✅ SATISFIED | `packages/cli/tests/commands/init.test.ts:572–583` — same test asserts `output.toContain('Quickstart')` |
| A003 | The quickstart link appears after the Next steps block | ✅ SATISFIED | `packages/cli/tests/commands/init.test.ts:587–601` — compares `indexOf('Next:')` < `indexOf(DOCS_QUICKSTART)`, both > -1 |
| A004 | Setup bare command shows a link to the setup guide | ✅ SATISFIED | `packages/cli/tests/commands/init.test.ts:618–633` — invokes `program.parse(['setup'])`, asserts `output.toContain(DOCS_SETUP_GUIDE)` where DOCS_SETUP_GUIDE = `https://anatomia.dev/docs/guides/using-ana-setup` |
| A005 | The setup guide link has a labeled format users can scan | ✅ SATISFIED | `packages/cli/tests/commands/init.test.ts:618–633` — same test asserts `output.toContain('Guide')` |
| A006 | The setup guide link appears between the agent command and subcommands | ✅ SATISFIED | `packages/cli/tests/commands/init.test.ts:636–655` — asserts `indexOf('claude --agent ana-setup')` < `indexOf(DOCS_SETUP_GUIDE)` < `indexOf('Subcommands:')` |
| A007 | CLI documentation URLs are defined as named constants, not inline strings | ✅ SATISFIED | `packages/cli/tests/commands/init.test.ts:660–662` — `expect(DOCS_QUICKSTART).toBe('https://anatomia.dev/docs/start')` |
| A008 | The setup guide URL constant matches the expected path | ✅ SATISFIED | `packages/cli/tests/commands/init.test.ts:665–667` — `expect(DOCS_SETUP_GUIDE).toBe('https://anatomia.dev/docs/guides/using-ana-setup')` |
| A009 | The setup agent template includes a link to the design principles guide | ✅ SATISFIED | `packages/cli/tests/commands/init.test.ts:687–694` — reads template file, asserts `content.toContain('https://anatomia.dev/docs/guides/using-ana-setup#design-principles')`. Verified URL at `packages/cli/templates/.claude/agents/ana-setup.md:347`, inside the scripted ``` block. |
| A010 | The docs page links to the reference page's design principles section | ✅ SATISFIED | `packages/cli/tests/commands/init.test.ts:699–706` — reads MDX file, asserts `content.toContain('/docs/reference/context#design-principles')`. Verified at `website/content/docs/guides/using-ana-setup.mdx:107`. |
| A011 | Init quickstart link appears even when scan data is unavailable | ✅ SATISFIED | `packages/cli/tests/commands/init.test.ts:604–612` — calls `displaySuccessMessage(null, ...)` with null engineResult, asserts `output.toContain(DOCS_QUICKSTART)` |

11/11 assertions SATISFIED.

## Independent Findings

**Predictions resolved:**

1. **Confirmed — A009/A010 tests assert on source content.** Both tests read a file from disk and check `.toContain()` on its text. The testing standard says "Never assert on source code content in a test — mock the trigger condition and assert on the output instead." However, the template file and MDX file have no runtime output path — they're consumed by external tools (Claude Code agent, Next.js docs site). Source inspection is the only viable verification method. This is a justified deviation, not a defect.

2. **Not found — no over-building.** All 5 file changes are in the spec's file_changes list. Both constants are imported by exactly one consumer each. No unused exports, no extra parameters, no dead code paths.

3. **Not found — template URL placement correct.** Verified the URL at line 347 sits inside the scripted ``` block that opens at line 323 and contains the Step 6 first interaction content. The spec required "inside the scripted ``` block" — satisfied.

4. **Not predicted — dogfood copy synced.** The build also updated `.claude/agents/ana-setup.md` (the dogfood copy), which is NOT in the contract's file_changes list. This is correct behavior — keeping the live copy in sync — but the proof chain noted (from a prior cycle) that no test enforces this sync for `ana-setup.md`. The dogfood sync gap remains.

**Code quality checks:**

- Import style: Both new imports use `.js` extensions and named imports. Correct.
- Constants section: New `// Documentation URLs` section placed between the file manifest and legacy constants, with JSDoc on each constant. Follows the existing section header pattern.
- `state.ts` change: 4 lines added (blank line, comment, URL line, trailing blank). The URL line is unconditional — placed after both branches of the commit-readiness if/else, before the function's closing brace. Matches the spec's "after both branches" guidance.
- `setup.ts` change: 2 lines added between the agent command and subcommands block, with blank lines above and below. Matches the spec mockup exactly.
- Chalk usage: `chalk.bold` for labels, `chalk.gray` for URLs. Matches the spec's styling requirements.
- No terminal escape sequences — plain `https://` URLs only.

## AC Walkthrough

- [x] **AC1:** `ana init` success output ends with `Quickstart  https://anatomia.dev/docs/start` after the "Next:" block — ✅ PASS. Verified in source at `packages/cli/src/commands/init/state.ts:716-718` and tested at `init.test.ts:572-583`.
- [x] **AC2:** `ana setup` bare command output includes `Guide  https://anatomia.dev/docs/guides/using-ana-setup` between agent command and subcommands — ✅ PASS. Verified in source at `packages/cli/src/commands/setup.ts:45` and tested at `init.test.ts:618-655`.
- [x] **AC3:** `ana-setup.md` template includes design principles guide URL in Step 6 block — ✅ PASS. Verified at `packages/cli/templates/.claude/agents/ana-setup.md:347`, inside the scripted ``` block.
- [x] **AC4:** `using-ana-setup.mdx` includes linked element pointing to `/docs/reference/context#design-principles` — ✅ PASS. Verified at `website/content/docs/guides/using-ana-setup.mdx:107` — `<a href="/docs/reference/context#design-principles">our design principles reference</a>`.
- [x] **AC5:** All CLI-output documentation URLs defined as named constants — ✅ PASS. Grepped `packages/cli/src/` for `anatomia.dev/docs` — only hits are in `constants.ts:139,142`. Both consumer files import from constants.
- [x] **AC6:** Existing init and setup tests continue to pass — ✅ PASS. 2297 passed, 2 skipped. No regressions.
- [ ] **AC7 (human):** `www.anatomia.dev` redirects to `anatomia.dev` — -- UNVERIFIABLE. Vercel domain config, not a code change.
- [x] **Tests pass:** ✅ PASS. `pnpm vitest run` — 2297 passed, 2 skipped.
- [x] **No build errors:** ✅ PASS. `pnpm run build` succeeded.
- [x] **New tests verify URL appears:** ✅ PASS. 9 new test assertions across 7 test cases in `init.test.ts:570-707`.

## Blockers

None. All 11 contract assertions satisfied. All mechanical ACs pass. No regressions (2297 tests pass, baseline was 2288 — 9 new tests added). Checked for: unused exports in new code (both constants imported), unused parameters (no new function signatures), unhandled error paths (no new error paths — these are `console.log` additions), sentinel tests that pass on broken AND working code (the `toContain` assertions would fail if the URL were absent, and the ordering assertions use `indexOf` comparisons that verify relative position).

## Findings

- **Test — A009/A010 assert on source file content:** `packages/cli/tests/commands/init.test.ts:687,699` — both tests read a file and check `.toContain()` on its raw content. The testing standard says to assert on output, not source. Justified here — template and MDX files have no CLI-runtime output path. But if these URLs ever move to a runtime surface, the tests should be rewritten to assert on output. Severity: debt. Action: accept.

- **Upstream — Dogfood copy synced without enforcement:** `.claude/agents/ana-setup.md` was manually synced with the template change. The proof chain (from "Clear the Deck Phase 2") noted the dogfood sync test doesn't cover `ana-setup.md`. This build correctly synced the copy, but the gap persists — a future build could forget. Severity: observation. Action: monitor.

- **Code — URL reachability is a deployment assumption:** The 4 URLs (`/docs/start`, `/docs/guides/using-ana-setup`, `/docs/guides/using-ana-setup#design-principles`, `/docs/reference/context#design-principles`) are hardcoded stable contracts. The spec says "the website must redirect if pages ever move." No test or CI check verifies these URLs resolve. If a page is renamed without a redirect, users see dead links in CLI output and docs. Severity: observation. Action: monitor.

## Deployer Handoff

Straightforward change — 4 URL insertions across 5 files plus test coverage. The only non-code AC is AC7 (`www.anatomia.dev` → `anatomia.dev` redirect in Vercel). Verify that redirect is configured before or alongside this merge.

The 4 documentation URLs are now permanent API surface — `/docs/start`, `/docs/guides/using-ana-setup`, `/docs/guides/using-ana-setup#design-principles`, `/docs/reference/context#design-principles`. If the docs site restructures, these need redirects.

## Verdict

**Shippable:** YES

All 11 contract assertions satisfied. All ACs pass (AC7 is human-only). 9 new tests, zero regressions, clean build and lint. The implementation is minimal, correctly scoped, and matches the spec mockups. Three findings documented — all observations/debt, none blockers.
