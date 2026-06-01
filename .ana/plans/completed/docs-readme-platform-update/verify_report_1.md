# Verify Report: Docs and README Multi-Platform Migration

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-01
**Spec:** .ana/plans/active/docs-readme-platform-update/spec-1.md
**Branch:** feature/docs-readme-platform-update

## Pre-Check Results
```text
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/docs-readme-platform-update/.ana/plans/active/docs-readme-platform-update/contract.yaml
  Seal: INTACT (hash sha256:b874a9cd520d9d07a42b877e589d10f3dedb993eca50444069991a84e0c97c28)
```

Seal status: INTACT.

Build: PASS (`pnpm run build`, 2/2 turbo tasks successful; website build also run directly from `website/` and generated 223 static pages).
Tests: PASS (`pnpm run test -- --run`: CLI 3099 passed, 2 skipped; website 81 passed. Focused docs test: 13 passed).
Lint: PASS (`pnpm run lint`, 0 errors; existing warnings in `website/components/hero/Hero.tsx` and `packages/cli/src/utils/git-operations.ts`).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | The docs switcher lets users select Codex | ✅ SATISFIED | `website/components/docs/layout/PlatformSwitcher.tsx:17` sets Codex `disabled: false`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:34`. |
| A002 | Unsupported future platforms remain marked as unavailable | ✅ SATISFIED | `website/components/docs/layout/PlatformSwitcher.tsx:16` and `:18-20` keep Cursor, Windsurf, Copilot, Cline disabled; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:40-43`. |
| A003 | The README opens with the approved multi-platform positioning | ✅ SATISFIED | `README.md:7` exactly matches the locked opening; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:54`. |
| A004 | The README quickstart starts setup through the universal command | ✅ SATISFIED | `README.md:37` contains `ana run setup`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:55`. |
| A005 | The README quickstart starts work through the universal command | ✅ SATISFIED | `README.md:38` contains `ana run`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:56`. |
| A006 | The README Works with section names both supported pipeline platforms | ✅ SATISFIED | `README.md:102` names Claude Code and Codex; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:57`. |
| A007 | Existing user-facing docs no longer teach direct Claude agent commands | ✅ SATISFIED | `rg "claude --agent" README.md website/content website/public/llms-full.txt website/public/llms.txt` found no migrated docs/LLM instructional hits; tagged test covers migrated files at `website/lib/__tests__/docs-platform-content.test.ts:61-66`. |
| A008 | The Quickstart explains that ana run dispatches to the configured platform | ✅ SATISFIED | `website/content/docs/start.mdx:77` explains `ana run` dispatch; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:75`. |
| A009 | The Quickstart mockup shows canonical Anatomia skills | ✅ SATISFIED | `website/content/docs/start.mdx:38` shows `Skills → .ana/skills/`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:76`. |
| A010 | The Quickstart mockup shows the current start-working command | ✅ SATISFIED | `website/content/docs/start.mdx:38` shows `ana run` in Next steps; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:77`. |
| A011 | The Quickstart mockup shows the current setup command | ✅ SATISFIED | `website/content/docs/start.mdx:38` shows `ana run setup`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:78`. |
| A012 | The landing page describes native support for Claude Code and Codex | ✅ SATISFIED | `website/lib/copy.ts:408` names Claude Code and Codex in `copy.bento.compat.body`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:87`. |
| A013 | The landing page no longer presents Claude skills as the canonical skill location | ✅ SATISFIED | `website/lib/copy.ts:137-140` sets the skills drawer folder to `.ana/skills/`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:88`. |
| A014 | The installing audience card no longer says Claude Code is required | ✅ SATISFIED | `website/components/docs/content/AudienceCards.tsx:30` says Claude Code or Codex; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:97-98`. |
| A015 | The Verify guide tells users to run Verify through ana run | ✅ SATISFIED | `website/content/docs/guides/verifying-changes.mdx:85` shows `ana run verify`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:107`. |
| A016 | The Verify guide tells users to return failed work through ana run build | ✅ SATISFIED | `website/content/docs/guides/verifying-changes.mdx:69` says `ana run build`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:108`. |
| A017 | Pipeline concept prose is platform-neutral | ✅ SATISFIED | `website/content/docs/concepts/pipeline.mdx:17` uses fresh platform session through `ana run`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:118`. |
| A018 | Skills concept prose points custom skills to the canonical skills directory | ✅ SATISFIED | `website/content/docs/concepts/skills.mdx:24` points custom skills to `.ana/skills/`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:119`. |
| A019 | The Platform setup guide exists | ✅ SATISFIED | `website/content/docs/guides/platform-setup.mdx:1` exists; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:126-130`. |
| A020 | The Guides navigation links to Platform setup near onboarding | ✅ SATISFIED | `website/content/docs/guides/meta.json:3` orders `using-ana-setup`, `platform-setup`, `verifying-changes`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:131`. |
| A021 | The Platform setup guide documents explicit platform selection | ✅ SATISFIED | `website/content/docs/guides/platform-setup.mdx:26` contains `ana run build --platform codex`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:132`. |
| A022 | The Platform setup guide documents environment-based platform selection | ✅ SATISFIED | `website/content/docs/guides/platform-setup.mdx:33-34` documents `ANA_PLATFORM`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:133`. |
| A023 | The Platform setup guide documents platform initialization | ✅ SATISFIED | `website/content/docs/guides/platform-setup.mdx:14` and `:63` contain `ana init --platforms`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:134`. |
| A024 | The Platform setup guide documents platform flags | ✅ SATISFIED | `website/content/docs/guides/platform-setup.mdx:41-48` documents `platformFlags`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:135`. |
| A025 | The Platform setup guide documents Codex agent manifests | ✅ SATISFIED | `website/content/docs/guides/platform-setup.mdx:56` documents `.agent.toml`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:136`. |
| A026 | The Platform setup guide documents Codex sandbox mode | ✅ SATISFIED | `website/content/docs/guides/platform-setup.mdx:58` documents `danger-full-access`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:137`. |
| A027 | Every Claude Code conditional docs block has a Codex counterpart | ✅ SATISFIED | `rg` found zero `ForPlatform platform="claude-code"` blocks and zero Codex blocks in `website/content/docs`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:148-151`. |
| A028 | Codex users are told Learn is not available yet | ✅ SATISFIED | `website/content/docs/guides/using-ana-learn.mdx:14` and `:18` disclose the limitation; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:161`. |
| A029 | Troubleshooting includes Codex executable recovery | ✅ SATISFIED | `website/content/docs/guides/troubleshooting.mdx:61-66` covers `codex not found`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:162`. |
| A030 | Troubleshooting includes Codex sandbox or manifest recovery | ✅ SATISFIED | `website/content/docs/guides/troubleshooting.mdx:70-72` covers manifest and sandbox issues; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:163`. |
| A031 | Configurability teaches the canonical custom skill location | ✅ SATISFIED | `website/content/docs/guides/configurability.mdx:86` contains `mkdir -p .ana/skills/billing`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:172`. |
| A032 | Configurability describes platform-specific custom agent delivery | ✅ SATISFIED | `website/content/docs/guides/configurability.mdx:134` mentions `.codex/agents/`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:173`. |
| A033 | Generated search data includes the Platform setup guide | ✅ SATISFIED | `website/public/search-index.json:59-60` includes `/docs/guides/platform-setup`; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:184`. |
| A034 | Generated LLM docs include the Platform setup guide | ✅ SATISFIED | `website/public/llms.txt:23` includes Platform setup; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:185`. |
| A035 | Generated full LLM docs no longer teach direct Claude agent commands | ✅ SATISFIED | `rg "claude --agent" website/public/llms-full.txt` returned no hits; tagged test at `website/lib/__tests__/docs-platform-content.test.ts:186`. |

## Independent Findings
Before reading the implementation, I predicted that the migration would likely miss generated docs/search surfaces, tests would lean on source-string sentinels, and Phase 2 content might bleed into Phase 1. Results:

- Confirmed: the public search index still contains a historical proof description with `claude --agent`, even though migrated docs and `llms-full.txt` are clean.
- Confirmed: the `ForPlatform` pairing test proves only equal counts, not actual pairing.
- Confirmed but not blocking: Phase 2 platform setup work was built in this phase. The sealed contract includes those assertions, so I verified them rather than treating them as out of scope.
- Not found: Codex switcher enablement and future-platform disabled states are correct in the actual component, not just test fixtures.

Over-building check: the build added Phase 2 docs (`platform-setup.mdx`, troubleshooting Codex cards, Learn limitation, configurability platform paths) even though spec-1 said Phase 2 owns those. This is extra surface, but it is also in the sealed contract, covered by tests, and passes build. No unused exports or unused parameters were introduced in the new test file; helper functions at `website/lib/__tests__/docs-platform-content.test.ts:9` and `:13` are used by the assertions. No new runtime error branches or external network assumptions were introduced by the docs-only implementation.

## AC Walkthrough
- ✅ PASS AC1: `website/components/docs/layout/PlatformSwitcher.tsx:17` makes Codex selectable; `:16` and `:18-20` keep Cursor, Windsurf, Copilot, and Cline disabled.
- ✅ PASS AC6: `rg "claude --agent" README.md website/content website/public/llms-full.txt website/public/llms.txt` found no migrated instructional docs hits; content uses `ana run` examples such as `website/content/docs/start.mdx:81-89`.
- ✅ PASS AC7: `README.md:7` matches the locked product positioning and no longer says Claude-only.
- ✅ PASS AC8: `README.md:37-38` uses `ana run setup` and `ana run`; `README.md:102-104` preserves broad markdown-aware tool language while naming Claude Code and Codex support.
- ✅ PASS AC9: `website/lib/copy.ts:408` confirms Claude Code and Codex native support copy; `website/lib/copy.ts:137-140` uses `.ana/skills/`.
- ✅ PASS AC10: `website/components/docs/content/AudienceCards.tsx:30` says Claude Code or Codex.
- ✅ PASS AC15: `website/content/docs/guides/verifying-changes.mdx:3`, `:69`, and `:85` use `ana run verify` / `ana run build`.
- ✅ PASS AC16: `website/content/docs/concepts/pipeline.mdx:17`, `website/content/docs/concepts/toolbelt.mdx:9`, and `website/content/docs/concepts/skills.mdx:9` use platform-neutral concepts.
- ✅ PASS AC18: I reviewed the diff for reference-page source paths and GitHub URLs; no reference page path displays or GitHub URLs were changed for platform conditionality.
- ✅ PASS Tests pass with the website test command: `pnpm vitest run lib/__tests__/docs-platform-content.test.ts --run` returned 1 file passed, 13 tests passed.
- ✅ PASS Website build succeeds from `website/`: `pnpm run build` completed Next build and generated 223 static pages.
- ✅ PASS Root test baseline still passes: `pnpm run test -- --run` returned CLI 3099 passed, 2 skipped; website 81 passed.
- ✅ PASS New docs enforcement tests cover the migrated command surface and switcher state: `website/lib/__tests__/docs-platform-content.test.ts:34-187` includes switcher, README, docs command-surface, landing, Verify guide, platform setup, troubleshooting, configurability, and generated asset assertions.

## Blockers
No blockers. I checked for unsatisfied contract assertions, missing files named by the contract, failed build/test/lint commands, direct `claude --agent` instructions in migrated docs and LLM docs, unused helper functions in the new test file, unpaired `ForPlatform` blocks in docs content, and new source files with runtime error branches. The remaining issues are documentation/test-quality observations rather than ship-stopping contract failures.

## Findings
- **Test — ForPlatform pairing test only compares total block counts:** `website/lib/__tests__/docs-platform-content.test.ts:151` — a single Claude block in one doc and an unrelated Codex block in another would pass. Current docs have zero blocks, so the contract is satisfied now, but this test will not catch future unpaired conditional content reliably.
- **Test — Generated search index can still surface stale direct Claude agent command text:** `website/public/search-index.json:1373` — `llms-full.txt` and migrated docs are clean, but public search data still contains `claude --agent ana-build` from a historical proof description. It is not an active instruction, so I did not fail A007/A035, but search users can still encounter the stale command surface.
- **Code — Platform flags guide shows Codex sandbox as platformFlags even though run dispatch already passes sandbox mode:** `website/content/docs/guides/platform-setup.mdx:41` — the example puts `["--sandbox", "danger-full-access"]` under `platformFlags.codex`, while `packages/cli/src/commands/run.ts:205-209` already appends `--sandbox` from the manifest/default before platform flags. Copying this example can duplicate the same option and makes precedence unclear.

## Deployer Handoff
This phase is shippable. The implementation updates the public docs contract, enables Codex in the switcher, adds the platform setup guide, and regenerates docs assets through the website build. Build output still prints the existing Next.js data-cache warnings for the large remote proof chain; the command exits successfully. Lint also exits successfully with pre-existing warnings outside this diff.

One deployment-facing caveat: `website/public/search-index.json` still includes a historical proof entry that mentions `claude --agent ana-build`. If search UX treats proof descriptions as current guidance, schedule a follow-up to filter or annotate historical proof text.

## Verdict
**Shippable:** YES

All 35 sealed contract assertions are SATISFIED, all acceptance criteria pass, focused website tests pass, root tests pass, website build passes from `website/`, and lint has no errors. The findings are real but do not block this phase from shipping.
