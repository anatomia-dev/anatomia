# Verify Report: CLI Polish — Phase 2

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-24
**Spec:** .ana/plans/active/cli-polish/spec-2.md
**Branch:** feature/cli-polish

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/cli-polish/.ana/plans/active/cli-polish/contract.yaml
  Seal: INTACT (hash sha256:b2a545759d42c1ddd83f8af393c4b8602f9b1058ab6546221e124a7a7874138e)
```

Seal status: **INTACT**

Tests: CLI 2919 passed, 2 skipped. Website 68 passed. Build: success (both surfaces). Lint: 0 errors, 1 pre-existing warning (unused eslint-disable directive in proof.ts).

## Contract Compliance

Phase 2 assertions only (A015–A021). Phase 1 assertions (A001–A014, A022) were verified in verify_report_1.md.

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A015 | The CLI reference data includes the Doctor command | ✅ SATISFIED | `website/data/docs/commands.json:98` — `"name": "doctor"` present in Getting Started group. Source inspection: `funcToFile` map at `website/scripts/extract-docs-data.ts:469` includes `Doctor: 'src/commands/doctor.ts'`, and third-pass fix at line 331 handles `program.command()` pattern. |
| A016 | The CLI reference data includes the Learn command | ✅ SATISFIED | `website/data/docs/commands.json:541` — `"name": "learn"` present in Intelligence group. Source inspection: `funcToFile` map at `website/scripts/extract-docs-data.ts:470` includes `Learn: 'src/commands/learn.ts'`. |
| A017 | The Learn command in reference data shows its end subcommand | ✅ SATISFIED | `website/data/docs/commands.json:548` — `"name": "end"` with description "End learn session — mark timestamp for next session" under learn's subcommands array. |
| A018 | The Learn agent template uses JSON output for the audit matrix command | ✅ SATISFIED | `packages/cli/templates/.claude/agents/ana-learn.md:66` — contains `ana proof audit --matrix --json`. Also updated at line 495. |
| A019 | The Learn agent template no longer uses bare --matrix without --json | ✅ SATISFIED | The command invocation at line 66 was changed from `--matrix` to `--matrix --json`. The command reference at line 495 was also updated. The contract's mechanical matcher (`not_contains: "--matrix\`"`) is technically violated by flag references at lines 84 and 514 (`` `--matrix` `` as a flag name, not a command invocation), but the intent — no bare `--matrix` in actual run instructions — is satisfied. Noted as upstream finding. |
| A020 | The README documents the config get command | ✅ SATISFIED | `README.md:168` — `\| \`ana config get <field>\` \| Get a config field value. Dot notation supported \|` |
| A021 | The README documents the config set command | ✅ SATISFIED | `README.md:169` — `\| \`ana config set <field> <value>\` \| Set a config field value \|` |

## Independent Findings

**Extract-docs-data changes are minimal and correct.** Two changes: (1) `Learn` added to `funcToFile` map — one line, follows the existing pattern. (2) Third-pass `program.command()` fix — moves the early `if (!parentName) continue` after a new block that handles `parentVar === 'program'` by adding to the top-level commands map. The duplicate guard `if (!commands.has(childName))` prevents re-adding commands already found by the first pass.

**README changes follow existing table format.** Two rows added between `config show` and `config delete`, with backtick-wrapped commands and pipe-delimited columns matching adjacent rows.

**Template changes are symmetric.** Both the product template (`packages/cli/templates/.claude/agents/ana-learn.md`) and the dogfood copy (`.claude/agents/ana-learn.md`) were updated at lines 66 and 495. The spec only scoped the product template — the dogfood update is over-building, but correctly keeps the two copies in sync.

**commands.json regeneration is complete.** Doctor appears in "Getting Started" group with `--json` flag and empty subcommands array. Learn appears in "Intelligence" group with `end` subcommand. Total commands: 35. Learn description matches Phase 1's imperative form: "Manage learn sessions."

**Prediction resolution:**
1. Duplicate guard missing — NOT FOUND. Guard present at line 332.
2. Dogfood copy not updated — NOT FOUND. Both copies updated (over-build).
3. README formatting mismatch — NOT FOUND. Format matches adjacent rows.
4. Stale learn description — NOT FOUND. Correct in commands.json.
5. Edge cases with regex — LOW RISK. The regex could match `.command()` in comments, but the `program` check and `!commands.has()` guard mitigate this.

**No over-building beyond the dogfood copy.** No new exports, no unused functions, no extra parameters. The changes are the minimum needed.

## AC Walkthrough

- **AC8:** `commands.json` includes both `doctor` and `learn` commands with their subcommands.
  ✅ PASS — Doctor at `commands.json:98` with `--json` flag and empty subcommands. Learn at `commands.json:541` with `end` subcommand including `--json` flag.

- **AC9:** The CLI reference page at anatomia.dev/docs/reference/cli renders Doctor and Learn.
  ⚠️ PARTIAL — Website build succeeds (`pnpm run build` passes), and `commands.json` includes both commands. The actual rendering on anatomia.dev requires deployment, which is outside this verification. The build success confirms the data pipeline is correct.

- **AC10:** All existing `--json` output is unchanged.
  ✅ PASS — No changes to `proof.ts` JSON output paths in Phase 2. The Phase 1 tests for JSON output (A013 in proof.test.ts) pass. Website `--json` data files are regenerated but structurally correct (68 website tests pass).

- **AC11:** Tests pass: `pnpm run test -- --run`.
  ✅ PASS — CLI: 2919 passed, 2 skipped. Website: 68 passed. 132 test files total.

- **AC12:** The ana-learn template uses `ana proof audit --matrix --json`.
  ✅ PASS — `packages/cli/templates/.claude/agents/ana-learn.md:66` contains `--matrix --json`. Second reference at line 495 also updated.

- **AC13:** README commands table includes `config get` and `config set`.
  ✅ PASS — `README.md:168-169`, rows added in correct table format near existing config entries.

## Blockers

No blockers. All 7 Phase 2 contract assertions satisfied. All 6 acceptance criteria pass (1 partial — AC9 requires deployment). No test failures. No regressions from Phase 1. Checked for: unused exports in modified files (none — `funcToFile` is internal, no new exports added), unhandled error paths in the third-pass fix (the `continue` statements handle all branches), dead code in new blocks (none — every branch either adds to `commands` map or falls through to existing parent logic).

## Findings

- **Upstream — Contract A019 matcher too broad:** Contract specifies `not_contains: "--matrix\`"` but the template legitimately uses `` `--matrix` `` as a flag reference (not a command invocation) at lines 84 and 514. The actual fix (changing command invocations) is correct. The matcher should have been scoped to the specific command pattern (e.g., `"audit --matrix\`"`) rather than any `--matrix` followed by backtick. Not a blocker — the intent is satisfied.

- **Code — Dogfood ana-learn.md updated beyond spec scope:** `.claude/agents/ana-learn.md` was updated alongside the product template. The spec scoped only `packages/cli/templates/.claude/agents/ana-learn.md`. This is a reasonable over-build — the dogfood copy should stay in sync — but it's unspecified behavior.

- **Code — Third-pass regex could match .command() in non-code contexts:** `website/scripts/extract-docs-data.ts:315` — the regex `(\w+)\s*\.command\(` could theoretically match `.command()` calls in comments or string literals within the collapsed content. The `parentVar === 'program'` check and `!commands.has()` guard limit the blast radius. No false positives in current source files, but a future file with a comment like `// program.command('example')` would create a phantom entry. Low risk.

- **Test — No dedicated test for commands.json command names:** `website/lib/__tests__/docs-data/data-integrity.test.ts` validates the shape of `commands.json` (has `groups`, has `totalCommands >= 1`) but doesn't assert that specific commands like `doctor` or `learn` exist. The website build succeeding is an indirect validation, but a test that checks for expected command names would catch regressions if a `funcToFile` entry were accidentally removed.

- **Upstream — Median computation still duplicated:** `website/scripts/extract-docs-data.ts:1154` defines a local `median()` function that duplicates `getMedianTimings()` in `website/lib/docs-data/proofs.ts`. This is a pre-existing finding from `fix-prebuild-source-mutation` (finding `fix-prebuild-source-mutation-C6`). Not introduced by this build.

## Deployer Handoff

Straightforward merge. The `commands.json` file at `website/data/docs/commands.json` is regenerated by the prebuild script (`tsx scripts/extract-docs-data.ts`) — it will be re-generated on next website build. The committed version is a snapshot from the builder's environment.

After merge, the next `ana init` on any project will install the updated ana-learn template with `--matrix --json`. Existing installations keep the old template until they run `ana init` again.

The dogfood copy at `.claude/agents/ana-learn.md` was also updated — this takes effect immediately for this repo's Learn agent.

## Verdict

**Shippable:** YES

All 7 Phase 2 contract assertions satisfied. All ACs pass. Tests green. Build succeeds across both surfaces. The changes are minimal, scoped, and follow existing patterns. The A019 matcher concern is a contract precision issue, not a code issue — the actual fix is correct. Would I stake my name on this shipping? Yes.
