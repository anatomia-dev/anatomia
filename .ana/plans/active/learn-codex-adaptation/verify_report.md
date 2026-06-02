# Verify Report: Learn Agent Codex Adaptation

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-01
**Spec:** .ana/plans/active/learn-codex-adaptation/spec.md
**Branch:** feature/learn-codex-adaptation

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/learn-codex-adaptation/.ana/plans/active/learn-codex-adaptation/contract.yaml
  Seal: INTACT (hash sha256:3a0f7e3b07b3cb11c46ff68a41be3c002b5d0c333571f987be1213dcec48c098)
```

Seal: **INTACT**

Build: PASS (both packages). CLI tests: 3154 passed, 2 skipped (3156 total). Website tests: 84 passed. Lint: PASS. Baseline was 3148+2 skipped; net +6 tests from new `codex-learn-template.test.ts`.

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Running Learn on Codex dispatches successfully instead of erroring | SATISFIED | `packages/cli/tests/commands/run.test.ts:354-365` — `runAndGetExit('learn')` produces a `codex` spawn call |
| A002 | The Learn hard block no longer exists in dispatch code | SATISFIED | `packages/cli/src/commands/run.ts:159-165` — guard clause removed (confirmed via `git diff main`), test dispatches without error |
| A003 | Codex Learn prompt content is passed to the codex CLI | SATISFIED | `packages/cli/tests/commands/run.test.ts:362-364` — asserts `developer_instructions=` arg contains prompt content. Mock uses stub text, but mechanism is correct; real template starts with `# Ana Learn` which satisfies the contract value |
| A004 | Init generates a Codex Learn prompt file | SATISFIED | Template exists at `packages/cli/templates/.codex/agents/ana-learn.md` (529 lines). `CODEX_AGENT_FILES` includes it (A006). Test at `run.test.ts:434-440` confirms file presence |
| A005 | Init generates a Codex Learn TOML manifest | SATISFIED | Template exists at `packages/cli/templates/.codex/agents/ana-learn.agent.toml` (6 lines). `CODEX_AGENT_FILES` drives both `.md` and `.agent.toml` copy |
| A006 | The agent file list now includes Learn | SATISFIED | `packages/cli/tests/commands/init.test.ts:794-796` — `expect(CODEX_AGENT_FILES).toHaveLength(6)` |
| A007 | The agent file list contains the Learn entry | SATISFIED | `packages/cli/tests/commands/init.test.ts:796` — `expect(CODEX_AGENT_FILES).toContain('ana-learn.md')` |
| A008 | The Codex Learn template has no YAML frontmatter | SATISFIED | `packages/cli/tests/templates/codex-learn-template.test.ts:18-22` — `startsWith('---')` is false. Source inspection: first line is `# Ana Learn` |
| A009 | The Codex Learn template uses the correct skill path | SATISFIED | `packages/cli/tests/templates/codex-learn-template.test.ts:25-28` — `not.toContain('.claude/skills/')`, `toContain('.ana/skills/')`. Source: 3 `.ana/skills/` refs, 0 `.claude/skills/` |
| A010 | The Codex Learn template has no CC-specific frontmatter diagnostic language | SATISFIED | `packages/cli/tests/templates/codex-learn-template.test.ts:32-35` — `not.toContain('frontmatter \`skills:\`')`. Source: 0 occurrences confirmed |
| A011 | The Codex Learn template references Plan's prompt file for diagnostics | SATISFIED | `packages/cli/tests/templates/codex-learn-template.test.ts:37` — `toContain('.codex/agents/ana-plan.md')`. Source: 6 references |
| A012 | The Codex Learn template notes that promoted rules require re-init | SATISFIED | `packages/cli/tests/templates/codex-learn-template.test.ts:41-46` — `toContain('ana init')` and `toContain('regenerate')`. Source: line 343 explicitly states the re-init requirement |
| A013 | The CC Learn template no longer references .claude/skills/ | SATISFIED | `packages/cli/tests/templates/codex-learn-template.test.ts:51-53` — `not.toContain('.claude/skills/')`. Source: `grep` confirms 0 occurrences |
| A014 | The CC Learn template uses the canonical .ana/skills/ path | SATISFIED | `packages/cli/tests/templates/codex-learn-template.test.ts:54` — `toContain('.ana/skills/')`. Source: 3 `.ana/skills/` references at lines 45, 307, 524 |
| A015 | Docs no longer mention Learn being unavailable on Codex | SATISFIED | `website/lib/__tests__/docs-platform-content.test.ts:203` — `not.toContain('Codex Learn is not yet available')`. Source: `grep -rn` across all website content confirms 0 occurrences |
| A016 | ForPlatform blocks remain balanced across all docs | SATISFIED | `website/lib/__tests__/docs-platform-content.test.ts:172-181` — counts `claude-code` and `codex` blocks, asserts equal length. Source: manual count per file confirms balance (start 2/2, configurability 2/2, platform-setup 1/1, troubleshooting 2/2) |
| A017 | The using-ana-learn terminal example no longer shows the limitation message | SATISFIED | `website/lib/__tests__/docs-platform-content.test.ts:204` — `not.toContain('use Claude Code for Learn sessions')`. Source: line 16 of using-ana-learn.mdx contains clean terminal output with no limitation |
| A018 | Dogfood installation includes the Codex Learn prompt | SATISFIED | `packages/cli/tests/templates/codex-learn-template.test.ts:62-74` — reads `.codex/agents/ana-learn.md`, asserts matches product template. Source: `diff` confirms identical |
| A019 | Dogfood installation includes the Codex Learn TOML | SATISFIED | `packages/cli/tests/templates/codex-learn-template.test.ts:68-74` — reads `.codex/agents/ana-learn.agent.toml`, asserts matches product template. Source: `diff` confirms identical |

19/19 SATISFIED.

## Independent Findings

### Prediction Resolution

1. **Incomplete diagnostic language rewrites** — NOT FOUND. All 6 `skills:` frontmatter references were rewritten. Template has 0 `frontmatter \`skills:\`` occurrences and 6 `.codex/agents/ana-plan.md` references. Builder got this right.
2. **createCodexProject helper not updated** — NOT FOUND. Helper at run.test.ts:92 includes `'ana-learn'`.
3. **ForPlatform orphaned whitespace** — NOT FOUND. Docs are clean; collapsed sections read naturally. Balance maintained.
4. **Dogfood files stale** — NOT FOUND. Both dogfood files are byte-identical to product templates (`diff` returned empty).
5. **TOML wrong fields** — NOT FOUND. TOML has all 6 fields matching the ana-build.agent.toml pattern exactly.

### Production risk predictions

- **Stale `.claude/skills/` paths in template** — NOT FOUND. Both CC and Codex templates use `.ana/skills/`.
- **Hard block removal incomplete** — NOT FOUND. The guard clause is cleanly removed; no other Learn-specific blocks in dispatch code.

### Surprises

- Builder created an extra test file (`packages/cli/tests/templates/codex-learn-template.test.ts`) not in the contract's file_changes. This provided dedicated `@ana` tag coverage for A008-A014 and A018-A019, which improved contract traceability. Net +6 tests.
- Builder also fixed the dogfood `.claude/agents/ana-learn.md` with the same `.claude/skills/` → `.ana/skills/` path fix — also not in the contract but consistent with the CC template fix.

## AC Walkthrough

- **AC1:** `ana run learn --platform codex` dispatches to Codex successfully — ✅ PASS. Test at run.test.ts:354-365 verifies spawn call exists with no error exit. Guard clause removed from source.
- **AC2:** `ana init --platforms codex` generates Learn files — ✅ PASS. Templates exist in `packages/cli/templates/.codex/agents/`. `CODEX_AGENT_FILES` includes `ana-learn.md` (verified at constants.ts:178).
- **AC3:** Codex Learn template has zero `.claude/skills/` references — ✅ PASS. `grep` confirms 0 occurrences, 3 `.ana/skills/` references.
- **AC4:** Codex Learn template has zero `skills:` frontmatter references — ✅ PASS. 0 `frontmatter \`skills:\`` occurrences, 6 `.codex/agents/ana-plan.md` references for Codex-appropriate diagnostic language.
- **AC5:** Codex Learn template has no YAML frontmatter block — ✅ PASS. Starts with `# Ana Learn`. Test confirms `startsWith('---')` is false.
- **AC6:** CC Learn template's 3 `.claude/skills/` references updated to `.ana/skills/` — ✅ PASS. `grep` confirms 0 `.claude/skills/`, 3 `.ana/skills/` at lines 45, 307, 524.
- **AC7:** `CODEX_AGENT_FILES` includes `'ana-learn.md'` (6 entries) — ✅ PASS. constants.ts:172-179, test at init.test.ts:794-796.
- **AC8:** Hard block removed — ✅ PASS. `git diff main -- packages/cli/src/commands/run.ts` shows clean 7-line removal of the guard clause.
- **AC9:** All existing tests pass, limitation tests updated — ✅ PASS. CLI: 3154 passed (up from 3148 baseline). Website: 84 passed. 2 negative tests replaced with positive tests; 6 new tests added via codex-learn-template.test.ts.
- **AC10:** Dogfood `.codex/agents/` contains both Learn files matching templates — ✅ PASS. `diff` returns empty for both files. Test at codex-learn-template.test.ts:62-74 asserts byte equality.
- **AC11:** Docs no longer contain limitation language — ✅ PASS. `grep -rn` for "Codex Learn is not yet available" and "use Claude Code for Learn sessions" across website/content returns 0 matches.
- **AC12:** ForPlatform pairing test passes — ✅ PASS. Website tests pass (84/84). Manual count: claude-code blocks = codex blocks in every doc file.
- **No build errors** — ✅ PASS. `pnpm run build` succeeds for both packages.
- **Tests pass with checkpoint commands** — ✅ PASS. Both `(cd 'packages/cli' && pnpm vitest run)` and `(cd 'website' && pnpm vitest run)` pass.

14/14 PASS.

## Blockers

No blockers. All 19 contract assertions satisfied. All 14 acceptance criteria pass. No regressions (test count increased from 3148 to 3154 CLI, website stable at 84). No unused exports in new files (template test file has no exports). No unhandled error paths introduced (only code change is a deletion). No assumptions about external state. Lint passes.

## Findings

- **Test — A004/A005 test checks helper output, not real init:** `packages/cli/tests/commands/run.test.ts:434-440` — the test calls `createCodexProject()` (which manually creates Learn files) then asserts those files exist. This tests the helper, not the init code path. The real mechanism (CODEX_AGENT_FILES iteration) is covered by A006/A007, so the assertion chain is intact — but the A004/A005 test itself is weaker than it appears.

- **Test — A003 test asserts mock stub, not contract value:** `packages/cli/tests/commands/run.test.ts:364` — asserts `diArg` contains `'# ana-learn prompt'` (the stub text from `createCodexProject`), not `'Ana Learn'` (the contract value). The mechanism is correct — `developer_instructions` IS populated with the prompt content — but the test doesn't prove the specific contract value. In production with the real template, it would contain "Ana Learn".

- **Test — Stale test description:** `packages/cli/tests/commands/init.test.ts:866` — test name says "5 agent files and 5 TOML manifests" but the body asserts `toHaveLength(12)` (6 agents x 2 files). The description wasn't updated when Learn was added. Harmless but confusing for the next engineer.

- **Upstream — Contract A008 matcher imprecise:** Contract says `templateContent not_contains "---"` but the template has `---` as markdown horizontal rules (13 occurrences). The test correctly checks `startsWith('---')` which is the right way to detect YAML frontmatter. The contract's literal matcher would fail if evaluated mechanically.

- **Code — Extra file not in contract:** `packages/cli/tests/templates/codex-learn-template.test.ts` — created by builder for dedicated assertion coverage, not listed in contract `file_changes`. The file adds 6 focused tests (77 lines) with proper `@ana` tags. Reasonable over-building that improved contract traceability.

- **Code — Dogfood CC template also fixed:** `.claude/agents/ana-learn.md` — received the same `.claude/skills/` -> `.ana/skills/` path fix as the product template. Not listed in contract `file_changes` but consistent with the intent. The dogfood installation should match the product.

## Deployer Handoff

Clean feature addition. The build removes a hard block preventing Learn on Codex, adds the Codex Learn template and TOML, updates tests and docs. No configuration changes, no new dependencies, no migration steps.

The Codex Learn template is 529 lines adapted from the 533-line CC original. It requires no runtime behavior changes — the dispatch function was already generic; the guard clause was the only blocker.

Docs changes collapse 3 pairs of ForPlatform blocks into single unplatformed statements. The ForPlatform pairing test continues to pass with balanced counts.

After merge: `ana init --platforms codex` on existing Codex projects will generate the Learn agent files on next init. Existing installations get Learn by re-running init.

## Verdict

**Shippable:** YES

19/19 contract assertions satisfied. 14/14 acceptance criteria pass. No regressions. Build, tests, lint all green. The implementation is mechanical and well-scoped — guard clause removed, template added, constants updated, tests flipped, docs cleaned. Findings are minor (test description staleness, mock stub precision, contract matcher imprecision). Would stake my name on this shipping.
