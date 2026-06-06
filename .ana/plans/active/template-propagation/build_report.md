# Build Report: Template Propagation — Lock-Stock Refresh of Machine-Owned Templates on Re-init

**Created by:** AnaBuild
**Date:** 2026-06-05
**Spec:** .ana/plans/active/template-propagation/spec.md
**Branch:** feature/template-propagation

## What Was Built

- **packages/cli/src/constants.ts** (modified): Added `CLAUDE_AGENT_CONFIG_KEYS` (`['model', 'tools']`) and `CODEX_AGENT_CONFIG_KEYS` (`['model', 'sandbox_mode', 'model_reasoning_effort']`) with the deliberate-`tools`-CONFIG-call rationale documented in a comment. Single source of truth for the preserve-vs-refresh classification.
- **packages/cli/src/utils/agent-config.ts** (modified): Added two pure helpers — `stripFrontmatter(content)` (returns the body after the first anchored `---` pair, content unchanged when no frontmatter; body `---` rules never mistaken for frontmatter) and `preserveTomlConfigKeys(stockToml, existingToml, configKeys)` (line-based, format-preserving flat-TOML merge that substitutes preserved key values into stock; function-replacer used so `$` in values is never interpreted).
- **packages/cli/src/commands/init/assets.ts** (modified): Added `atomicWriteFile(destPath, content, fileName)` — temp-sibling write → SHA-256 integrity verify of the written bytes → `rename` over target, with temp cleanup on any failure. Removed the now-dead `copyAndVerifyFile` (everything writes through the atomic helper). Rewrote `copyAgentFiles` → `Promise<string[]>`: removed skip-if-exists, carries forward CONFIG-class frontmatter keys onto stock, records the filename only when the stripped body differs. Rewrote `copyClaudeMd` → `Promise<string | null>`: overwrite-always, gated against freshly-interpolated output (not raw stock). Rewrote `copyCodexAgentFiles` → `Promise<string[]>`: `.md` overwritten wholesale (recorded on change), `.agent.toml` config keys preserved while machine fields refresh (never in the changed list). `createClaudeConfiguration`/`createCodexConfiguration` now return the aggregated changed-file list. Exported `copyAgentFiles`/`copyCodexAgentFiles` for direct unit testing.
- **packages/cli/src/commands/init/index.ts** (modified): Captures the returned changed-file lists from both `create*Configuration` calls, dedupes, and pushes ONE consolidated `Refreshed to v${cliVersion} stock: …` warning (with conditional git-recovery guidance) onto `preflight.warnings` before `displaySuccessMessage`. `getCliVersion` added to the existing state import.
- **packages/cli/src/commands/work.ts** (modified): Sharpened the `projectMismatch` nudge copy in `printNotifications` to tell stale-version customers that `ana init` refreshes agent templates & CLAUDE.md. Detection unchanged.
- **website/content/docs/guides/configurability.mdx** (modified): Reversed the "Agent templates" promise (instruction bodies + CLAUDE.md overwritten from stock, recover via git, basic config preserved); moved agent files + CLAUDE.md from Preserved → Refreshed in the survive-re-init lists and added a Preserved line for agent basic config; apostrophes written as `&apos;`.
- **CHANGELOG.md** (modified): Added an `[Unreleased] → Changed` entry recording the behavior reversal and the preserved config classes.
- **packages/cli/tests/commands/init.test.ts** (modified): Flipped the `:894` Codex test to drive the real `copyCodexAgentFiles` and assert body-overwrite + `.agent.toml` config-preserve + machine-field-refresh.
- **packages/cli/tests/commands/init/template-propagation.test.ts** (created): 22 tests — built-CLI integration (dirty/clean/config-only re-init, fresh, Claude-only), atomic-write, content-gated warning, the exhaustive AC5 preserve-contract guard (direct `preserveUserState`), and docs/changelog assertions.
- **packages/cli/tests/utils/agent-config.test.ts** (modified): 8 unit tests for `stripFrontmatter` and `preserveTomlConfigKeys`.
- **packages/cli/tests/commands/work.test.ts** (modified): Tagged + strengthened the existing project-mismatch notification test to assert the sharpened "refresh templates" copy (A024/A025).

## PR Summary

- Reverses re-init's skip-if-exists behavior so machine-owned agent instruction bodies and `CLAUDE.md` are refreshed wholesale from stock on `ana init` — the install base finally receives template updates.
- Preserves a customer's basic config by class: Claude frontmatter `model`/`tools` and Codex `.agent.toml` `model`/`sandbox_mode`/`model_reasoning_effort` are carried forward; Codex machine fields (`name`/`description`/`developer_instructions`) refresh so the instruction pointer can't go stale.
- Every overwrite is an atomic temp-then-rename write with SHA-256 integrity verification — a crash mid-refresh never leaves a truncated file.
- Emits one consolidated, content-gated warning naming only files whose instruction content actually changed (config-only changes and identical re-interpolated CLAUDE.md stay silent); init never blocks on it.
- Updates docs, changelog, and the stale-version nudge to lead the behavior reversal; `AGENTS.md` stays skip-if-exists (deferred).

## Acceptance Criteria Coverage

- AC1 "instruction overwrite, config preserved, per-harness" → template-propagation.test.ts "overwrites the Claude agent instruction body" + "preserves the customer Claude frontmatter model" + init.test.ts:894 "re-init overwrites Codex instruction body while preserving .agent.toml config" (A001, A002, A004, A005, A006)
- AC2 "CLAUDE.md overwritten + interpolated; AGENTS.md untouched" → template-propagation.test.ts "refreshes CLAUDE.md with re-applied project name and stack" + "leaves AGENTS.md untouched" (A007, A008, A009)
- AC3 "atomic per-file write + integrity" → template-propagation.test.ts "leaves no temp or partial files" + "writes content that passes integrity" (A010, A011)
- AC4 "content-gated consolidated warning" → template-propagation.test.ts warning + clean-re-init + config-only tests; agent-config.test.ts stripFrontmatter body-equality (A012–A017)
- AC5 "exhaustive preserve-contract guard" → template-propagation.test.ts "preserves the COMPLETE preserveUserState contract (all eight items)" + "does NOT carry setup-progress when complete" (A018–A021, A029, A030)
- AC6 "fresh unchanged; single-harness" → template-propagation.test.ts "fresh install … no overwrite warning" + "Claude-only project never creates the .codex tree" (A022, A023)
- AC7 "version nudge points to ana init + conveys refresh" → work.test.ts "shows project mismatch notification" + template-propagation.test.ts "work.ts nudge … conveys template refresh" (A024, A025)
- AC8 "docs + changelog reversal" → template-propagation.test.ts "configurability.mdx documents overwrite + preserved config" + "CHANGELOG records the reversal" (A026, A027, A028)
- "Suite stays green, count does not decrease" → ✅ 3266 tests (baseline 3236), 133 files
- "lint clean; tsc --noEmit clean" → ✅ 0 lint errors in touched files; tsc + tsc -p tsconfig.test.json clean (pre-commit gate passed on every commit)

## Implementation Decisions

- **Removed `copyAndVerifyFile` rather than keeping it as a thin wrapper.** The spec said to factor the integrity/atomicity guarantee so `copyAndVerifyFile` and the new overwrites share it. In practice every caller now writes through `atomicWriteFile` (the content-based helper), leaving `copyAndVerifyFile` dead. Keeping an unused wrapper would have tripped `no-unused-vars`; deleting it is the cleaner realization of the same "single shared guarantee" intent. The module header was updated to describe `atomicWriteFile`.
- **Warning de-duplicates changed filenames across harnesses** (`[...new Set(changedFiles)]`). When the same agent body changed in both `.claude` and `.codex`, the consolidated warning lists the basename once — recovering it from git applies to both trees, and the mockup shows one entry per file.
- **AC5 guard implemented as a direct `preserveUserState` call** (modeled on the existing init.test.ts:612+ tests) rather than a second full built-CLI round-trip. This is deterministic, exhaustive, and cross-checks every one of the eight items enumerated in `preserveUserState` (state.ts:696–873), including the setup-progress conditional (both branches).
- **`preserveTomlConfigKeys` uses a function replacer** (`replace(lineRegex, () => existingLine[0])`) so a `$` in a preserved value is never interpreted as a replacement pattern.

## Deviations from Contract

None — contract followed exactly. All 30 assertions (A001–A030) are addressed and `@ana`-tagged.

Ambiguity/addition notes (documented for transparency, not contract deviations):
- The spec's "factor `copyAndVerifyFile`" guidance resolved to deleting it (see Implementation Decisions) — same guarantee, no dead wrapper.
- A024 ("nudge fires on mismatch") is satisfied by the unchanged detection path; rather than write a redundant new test, the existing `work.test.ts` project-mismatch test was tagged and strengthened to also assert the sharpened copy.

## Test Results

### Baseline (before changes)
Command: `(cd packages/cli && pnpm vitest run)`
```
 Test Files  132 passed (132)
      Tests  3234 passed | 2 skipped (3236)
```

### After Changes
Command: `(cd packages/cli && pnpm vitest run)`
```
 Test Files  133 passed (133)
      Tests  3264 passed | 2 skipped (3266)
```

### Comparison
- Tests added: +30 (agent-config.test.ts +8; template-propagation.test.ts +22; init.test.ts net 0 — one test repurposed/flipped; work.test.ts net 0 — one test strengthened)
- Tests removed: 0
- Regressions: none
- Test files: +1 (new template-propagation.test.ts)

### New / Changed Tests
- **tests/utils/agent-config.test.ts**: `stripFrontmatter` (present/absent/body-rule/config-only-body-equality) and `preserveTomlConfigKeys` (preserve listed, refresh machine, missing-key fallback, no-op).
- **tests/commands/init/template-propagation.test.ts**: dirty re-init (Claude+Codex overwrite, config preserve, per-harness ana-learn, CLAUDE.md interpolation, AGENTS.md untouched, no temp files, integrity, warning fires + lists + non-blocking); clean re-init silent; config-only re-init silent + preserved; fresh no-warning; Claude-only tree isolation; exhaustive AC5 preserve guard (8 items + setup-complete branch); work.ts nudge copy; docs + changelog.
- **tests/commands/init.test.ts**: flipped Codex preserve-promise test → asserts body overwrite + toml config preserve + machine refresh via real `copyCodexAgentFiles`.
- **tests/commands/work.test.ts**: project-mismatch test strengthened to assert the refresh-templates copy.

### Contract coverage
30/30 assertions (A001–A030) tagged with `@ana`.

## Verification Commands

```
pnpm run build
(cd packages/cli && pnpm vitest run tests/utils/agent-config.test.ts tests/commands/init.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/init/template-propagation.test.ts)
(cd packages/cli && pnpm vitest run)
(cd packages/cli && pnpm run lint)
(cd website && pnpm run lint)
```

## Proof Context (affected files)
- `assets.ts`: build concerns only (generateAgentsMd exported for testing; createClaudeConfiguration skills ordering) — neither blocks this change; both behaviors left intact.
- `index.ts`: a gitignore-disclosure code finding on unrelated warning text; the `--json` inheritance build concern — neither touched by this change.
- `work.ts`: several findings (result-parser casing, concurrency-guard dead param/duplication) — all outside the single nudge-copy line modified here.
- `agent-config.ts`, `configurability.mdx`: no active proof findings.

## Git History
```
a2cd7059 [template-propagation] Assert version nudge conveys template refresh (A024/A025)
2468ee1f [template-propagation] Reverse documented edit-persistence promise; changelog entry
ffbdb8d5 [template-propagation] Flip preserve-promise test; add propagation integration + preserve-guard tests
971b627d [template-propagation] Sharpen version-mismatch nudge to mention template refresh
1d431169 [template-propagation] Emit content-gated refresh warning on re-init
6bd44144 [template-propagation] Refresh agent instruction content on re-init, atomic + config-preserving
2f0505fe [template-propagation] Add stripFrontmatter + preserveTomlConfigKeys helpers
e950b0a3 [template-propagation] Add CONFIG-class preserve key constants
```

## Open Issues

- **Stale `@ana` tags from prior pipeline cycles** on unrelated tests (e.g. `A005/A006/A007/A022` on `parseFrontmatter`, `preserveUserState`, and Codex-inventory tests in init.test.ts/agent-config.test.ts). They predate this contract and now collide with this contract's ID meanings. Left untouched to avoid churning unrelated tests; flagged for the verifier so the collision isn't mistaken for mis-tagging in this build. (severity: observation, action: monitor)
- **`atomicWriteFile` temp-name uniqueness** uses `Date.now()` + `process.pid`. Init is single-process and writes destinations sequentially, so a same-millisecond collision is not reachable today; noted for awareness if init ever parallelizes file writes. (severity: observation, action: acknowledge)
- **Pre-existing lint warnings not introduced by this build**: `git-operations.ts:198` (unused eslint-disable directive) and `website/components/hero/Hero.tsx` (two unused-var warnings). Both untouched by this change; 0 errors in all files. (severity: observation, action: monitor)

Second pass — reviewed for unwritten concerns: imports are `.js`-suffixed and type-only where applicable; explicit return types on all now-returning exported functions; no `any` introduced; the atomic writer cleans temp files on both success (rename) and failure (rm); the warning is deduped and content-gated; CLAUDE.md gated against interpolated output. The `copyAndVerifyFile` removal and the A024 test-reuse are documented above as decisions, not silent changes. No further concerns surfaced.

Verified complete by second pass.
