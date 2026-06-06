# Verify Report: Template Propagation — Lock-Stock Refresh of Machine-Owned Templates on Re-init

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-05
**Spec:** .ana/plans/active/template-propagation/spec.md
**Branch:** feature/template-propagation

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../template-propagation/contract.yaml
  Seal: INTACT (hash sha256:4680e8e4e2139e992d966a63bc627cfe9f1c02fdb640a0f23e4cf2ea545005bf)
```

Seal status: **INTACT** — contract unmodified since the planner sealed it.

- **Build:** `pnpm run build` — success (ESM build in 34ms, 0 errors).
- **Tests:** `(cd packages/cli && pnpm vitest run)` — **3264 passed, 2 skipped (3266 total) across 133 files. 0 failures.** Baseline was 3236 across 132 files; count increased by 30 and one new test file was added. No regressions.
- **Lint:** CLI `pnpm run lint` — 0 errors (1 warning in `src/utils/git-operations.ts`, a pre-existing unused-disable directive, NOT in this build's file_changes). Website `pnpm run lint` — 0 errors (2 warnings in `components/hero/Hero.tsx`, also pre-existing, not touched here).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Re-init replaces customized Claude agent instructions | ✅ SATISFIED | template-propagation.test.ts:124 — mutates `.claude/agents/ana-build.md` body, asserts `not.toContain('CUSTOM CLAUDE BODY MARKER')` after re-init. Impl: assets.ts:298 `copyAgentFiles` removed skip-if-exists. |
| A002 | Re-init replaces customized Codex agent instructions | ✅ SATISFIED | template-propagation.test.ts:138 — `expect(refreshed).toBe(stockCodexBuild)` (exact match) after mutating Codex body. Impl: assets.ts:696 `copyCodexAgentFiles`. |
| A003 | Each tool keeps its own agent version (no cross-write) | ✅ SATISFIED | template-propagation.test.ts:161 — codexLearn === stock codex learn, claudeLearn ⊃ stock claude learn, `claudeLearn !== codexLearn`. |
| A004 | Customer's Claude model survives re-init | ✅ SATISFIED | template-propagation.test.ts:130 — `parseFrontmatter(refreshed)?.model` === `'my-custom-model'`. Impl: assets.ts:319 carries CLAUDE_AGENT_CONFIG_KEYS forward via `setFrontmatterField`. |
| A005 | Codex model/sandbox/reasoning survive re-init | ✅ SATISFIED | template-propagation.test.ts:144 + agent-config.test.ts:447 — three config keys preserved. Impl: `preserveTomlConfigKeys` (agent-config.ts:192). |
| A006 | Codex machine fields refreshed to current | ✅ SATISFIED | template-propagation.test.ts:152 + agent-config.test.ts:462 — name/developer_instructions refreshed from stock, `not.toContain('renamed-by-user')`. |
| A007 | Re-init refreshes CLAUDE.md to current template | ✅ SATISFIED | template-propagation.test.ts:174 — name + Stack present after re-init. Impl: copyClaudeMd (assets.ts:352) removed early-return-if-exists, always atomic-writes. See Findings (overwrite-of-edit not directly asserted). |
| A008 | Refreshed CLAUDE.md shows project name + stack | ✅ SATISFIED | template-propagation.test.ts:174 — `toContain('# propagation-fixture')`, `toContain('**Stack:**')`, `toContain('TypeScript')`. |
| A009 | AGENTS.md left untouched | ✅ SATISFIED | template-propagation.test.ts:181 — mutates AGENTS.md, marker survives re-init. Impl: generateAgentsMd keeps skip-if-exists (assets.ts:401). |
| A010 | No partial/temp file left behind | ✅ SATISFIED | template-propagation.test.ts:187 — reads both agent dirs, asserts no `.tmp-` entries. Impl: atomicWriteFile temp-then-rename + rm-on-failure (assets.ts:150). |
| A011 | Refreshed template passes integrity check | ✅ SATISFIED | template-propagation.test.ts:196 — on-disk body matches stock. Impl: SHA-256 verify before rename (assets.ts:157-172). Failure branch untested — see Findings. |
| A012 | Warn when overwrite changed content | ✅ SATISFIED | template-propagation.test.ts:206 — `toContain('Refreshed to v')` + recovery copy after a real body change. Impl: index.ts:174. |
| A013 | Silent when nothing changed | ✅ SATISFIED | template-propagation.test.ts:242 — clean re-init `not.toContain('Refreshed to v')`. |
| A014 | Warning names exactly the changed files | ✅ SATISFIED | template-propagation.test.ts:206 — refreshed line contains `ana-build.md`, not `CLAUDE.md`. Does not assert exact set — see Findings. |
| A015 | No false warning on same CLAUDE.md context | ✅ SATISFIED | template-propagation.test.ts:241 (clean re-init silent) + :215 (CLAUDE.md absent from changed line). Impl: copyClaudeMd gates against interpolated output (assets.ts:380). |
| A016 | Config-only change never warns | ✅ SATISFIED | template-propagation.test.ts:273/278 — model-only + toml-key-only change → no warning, change preserved. agent-config.test.ts:414 — equal bodies on model-only diff. |
| A017 | Refresh warning never blocks init | ✅ SATISFIED | template-propagation.test.ts:218 — runInit resolved exit 0 (execFileAsync would reject otherwise) + success banner present. Impl: pushes to non-blocking `preflight.warnings`. |
| A018 | Re-init preserves context files | ✅ SATISFIED | template-propagation.test.ts:410 — context/project-context.md survives `preserveUserState`. |
| A019 | Re-init preserves plans/proof/learn | ✅ SATISFIED | template-propagation.test.ts:428-439 — proof_chain.json, PROOF_CHAIN.md, plans/completed, plans/active, learn/state.json all survive. |
| A020 | Re-init preserves skill human content | ✅ SATISFIED | template-propagation.test.ts:442 — Rules/Gotchas/Examples survive. |
| A021 | Re-init preserves ana.json user fields | ✅ SATISFIED | template-propagation.test.ts:415-422 — coAuthor/artifactBranch/custom preserved; name/language refreshed. |
| A022 | Fresh install writes with no warning | ✅ SATISFIED | template-propagation.test.ts:298 — fresh install `not.toContain('Refreshed to v')`, templates written. |
| A023 | Claude-only project refreshes only Claude tree | ✅ SATISFIED | template-propagation.test.ts:307 — `.codex` never created across two runs. |
| A024 | Stale-version customer told to run ana init | ✅ SATISFIED | work.test.ts:1078 ("shows project mismatch notification when versions differ") — asserts `Project initialized with`, `ana init`, `v1.0.0`, `refresh`, `templates`. |
| A025 | Nudge conveys template refresh (`contains "ana init"`) | ✅ SATISFIED | work.test.ts:1078 + template-propagation.test.ts:480 — snippet contains `ana init` + `refresh` + `templates`. Matcher `contains "ana init"` met. |
| A026 | Docs no longer promise edit-persistence | ✅ SATISFIED | template-propagation.test.ts:490 — mdx `not.toContain('edits persist across re-init')`, documents `overwrit`. configurability.mdx:143. |
| A027 | Docs state basic config preserved | ✅ SATISFIED | template-propagation.test.ts:490 — mdx contains `preserv`; configurability.mdx:143 + survive-list adds "Agent basic config" line. |
| A028 | Changelog records the behavior reversal | ✅ SATISFIED | template-propagation.test.ts:504 — CHANGELOG contains `overwrit` + `re-init`. CHANGELOG.md:10. |
| A029 | In-progress setup keeps saved progress | ✅ SATISFIED | template-propagation.test.ts:448 — setup-progress.json preserved when `setupPhase !== complete`, AND dropped when complete (negative case at :449). |
| A030 | Tuned surface commands + extra keys survive | ✅ SATISFIED | template-propagation.test.ts:418-420 — `myUnknownTopLevelKey` survives, `surfaces.cli.commands.test` preserved while `surfaces.cli.framework` refreshes. |

All 30 assertions SATISFIED.

## Independent Findings

The implementation matches the spec's refresh-by-class design faithfully and the test suite is genuinely behavioral, not ceremonial — `toBe(stockCodexBuild)` exact-match, an exhaustive 8-item `preserveUserState` guard driven through the real function, and dedicated describe blocks for the silent/config-only paths. The pure helpers (`stripFrontmatter`, `preserveTomlConfigKeys`) are unit-tested with present/absent/body-rule/missing-key edge cases.

What my Step 3 predictions revealed:
1. **TOML whitespace handling (predicted weak)** — *Not found.* `preserveTomlConfigKeys` regex `^key\s*=` matches both `key=value` and `key = value`, and the function uses a function-replacer `() => existingLine[0]` that correctly dodges `$`-in-value replacement bugs. Solid.
2. **CLAUDE.md stack-line duplication (predicted)** — *Not found.* The template `templates/CLAUDE.md` has no hardcoded `**Stack:**` line; interpolation inserts it after the H1 once. No duplication.
3. **Predictable temp-file name / leftover (predicted)** — *Partially confirmed but safe.* Temp name is `.{basename}.tmp-${pid}-${Date.now()}` and any failure path runs `fs.rm(tmpPath, {force:true})`. Collision is effectively impossible; A010 confirms no leftovers. Fine.
4. **Body comparison false-positive on whitespace (predicted)** — *Not found.* Both sides pass through `stripFrontmatter`; a clean re-init writes byte-identical content via the same atomic writer, so A013 confirms silence. Correct.
5. **Over-build (predicted)** — *Surprised, in a good way.* The builder did NOT keep the old `copyAndVerifyFile` and factor it (the spec's letter) — it removed it entirely and routed every write through the single content-based `atomicWriteFile`. `grep` confirms zero remaining references, so no dead code. Cleaner than specified.

Surprise findings I did not predict:
- **The `tools` CONFIG key is implemented but never tested.** `CLAUDE_AGENT_CONFIG_KEYS = ['model', 'tools']`, and the constant's own comment flags `tools` as the riskier, capability-stranding-prone key — yet only `model` is exercised. The `tools` preservation path (array-valued frontmatter round-tripped through `setFrontmatterField`) is untested surface.
- **The warning's git-recovery example is hardcoded to `.claude/agents/ana-build.md`** even when the changed file is a Codex file or CLAUDE.md. Cosmetic, but it mirrors the existing proof-chain pattern `gitignore-disclosure-and-hardening-C1` (init warning hardcodes `.claude/`).

Production risk reflection: the `tools` stranding scenario is explicitly documented in `constants.ts` as a known future-migration concern (if stock ever manages `tools` as a granted capability, it must move to the refresh class). That is a sound, acknowledged deferral — not a defect today, since stock templates set no `tools` key and preservation is only-if-present.

## AC Walkthrough

- **AC1** (agent `.md` bodies overwritten per-harness; Claude model/tools + Codex config preserved; Codex machine fields refreshed): ✅ PASS — A001-A006 verified behaviorally; per-harness divergence proven by A003.
- **AC2** (CLAUDE.md overwritten + re-interpolated; AGENTS.md skip-if-exists): ✅ PASS — A007/A008 (interpolation present), A009 (AGENTS.md marker survives).
- **AC3** (atomic per-file write + integrity verify): ✅ PASS — A010 (no temp/partial leftover) + A011 (on-disk matches stock). Impl reviewed at assets.ts:150-181; integrity-failure branch is untested (Finding) but the verify code runs on every write.
- **AC4** (content-gated consolidated warning, no state, never blocks): ✅ PASS — A012/A013/A014/A015/A016/A017 all green.
- **AC5** (exhaustive preserve-contract regression guard, all 8 items): ✅ PASS — single exhaustive test drives the real `preserveUserState` and asserts all 8 categories plus the conditional setup-progress branch (both directions).
- **AC6** (fresh unchanged; single-harness only touches present tree): ✅ PASS — A022/A023.
- **AC7** (sharpened version nudge): ✅ PASS — A024/A025; detection unchanged, only `work.ts` copy sharpened (diff confirms).
- **AC8** (docs reversal + changelog): ✅ PASS — A026/A027/A028; configurability.mdx survive/refresh lists corrected, CHANGELOG entry present.
- **Test count ≥ 3236, suite green**: ✅ PASS — 3266 total, 0 failures, 133 files.
- **Lint clean + tsc**: ✅ PASS — 0 lint errors in both packages; build (which the pre-commit gate mirrors) clean; the only lint warnings are pre-existing and outside this build's files.

## Blockers

None. I searched specifically for: (1) UNSATISFIED assertions — read every tagged test body, all 30 do what the contract `says`; (2) regressions — full suite green, count increased 3236→3266; (3) dead code — confirmed `copyAndVerifyFile` removed with zero remaining references, no orphan exports; (4) silent-swallow error paths — atomicWriteFile re-throws after temp cleanup, init warnings are intentionally non-blocking by design (A017); (5) external-state assumptions — temp file uses pid+timestamp in the destination dir (same filesystem, rename-safe); (6) spec guardrail violations — per-harness stock respected (A003), config class never warned (A016), CLAUDE.md gated against interpolated output not raw stock (A015). Nothing rises to a blocker.

## Findings

- **Test — `tools` CONFIG key preservation is untested:** `packages/cli/tests/commands/init/template-propagation.test.ts:130` — `CLAUDE_AGENT_CONFIG_KEYS` includes `'tools'`, and `constants.ts:205` flags it as the riskier, capability-stranding-prone key, yet only `model` is exercised (A004). The `tools` path round-trips an array value through `parseFrontmatter`→`setFrontmatterField`; a regression there (e.g. multiline YAML array dropped to one line) would pass undetected. Add a case that sets `tools: [Bash, Read]` on an existing agent and asserts it survives re-init.
- **Test — CLAUDE.md overwrite-of-edit not directly proven:** `packages/cli/tests/commands/init/template-propagation.test.ts:174` — A007 is verified only by the presence of interpolation after a no-edit re-init. No test mutates the CLAUDE.md body then asserts re-init resets it to stock. The mechanism is correct by inspection (copyClaudeMd always atomic-writes the interpolated content), but the strongest behavioral proof — the symmetric analog of the A001 Claude-body test — is absent.
- **Test — A014 does not assert the exact changed-file set:** `packages/cli/tests/commands/init/template-propagation.test.ts:206` — checks `ana-build.md` is present and `CLAUDE.md` is absent from the warning line, but does not assert that the *only* listed file is `ana-build.md`. An unchanged agent (e.g. `ana-plan.md`) erroneously appearing in the warning would not be caught. Asserting the exact rendered list would close this.
- **Test — atomicWriteFile integrity-failure branch untested:** `packages/cli/src/commands/init/assets.ts:165` — the SHA-256 mismatch throw + `fs.rm` temp cleanup has no test. A011 is satisfied by a passing happy-path write only. This is hard to exercise without fault injection and is informational, not actionable now.
- **Code — refresh-warning git-recovery hint is hardcoded to `.claude/agents/ana-build.md`:** `packages/cli/src/commands/init/index.ts:184` — regardless of which files actually changed, the recovery example names a Claude path. A Codex-only customer, or one whose sole change was `CLAUDE.md`, sees a path that doesn't match their changed file. Cosmetic/UX; echoes the hardcoded-`.claude/`-path pattern recorded as `gitignore-disclosure-and-hardening-C1`. Consider deriving the example from the first changed file.
- **Code — atomicWriteFile cleanly supersedes copyAndVerifyFile (positive):** `packages/cli/src/commands/init/assets.ts:150` — the spec implied factoring `copyAndVerifyFile` to share the integrity guarantee; the builder instead removed it and routed all writes through one content-based atomic+verify helper, with no remaining callers. This is cleaner than the spec's letter and leaves no dead code. Noted as an acknowledged deviation, not a problem.

## Deployer Handoff

This is a **customer-facing behavior reversal**: after this ships, `ana init` re-init will *overwrite* agent `.md` instruction bodies and `CLAUDE.md` from stock instead of skipping them. Existing customers who hand-edited those files will see their instruction edits replaced on the next `ana init` (config — model/tools/sandbox/reasoning — is preserved; edits are recoverable via git, and init prints a consolidated warning naming changed files). The CHANGELOG entry and configurability.mdx both document this; make sure release notes surface the behavior change prominently. The first re-init any existing install runs after this ships may legitimately fire the warning for files whose old-code output differed from the new interpolated/stock output — that is expected and warn-only safe. No schema, state, or migration changes; no new dependencies.

## Verdict

**Shippable:** YES

All 30 contract assertions are SATISFIED with behavioral evidence I traced test-by-test, all 8 acceptance criteria PASS, the full suite is green (3266 tests, up from 3236, 0 failures), and lint/build are clean. The findings are test-coverage and cosmetic observations — the `tools` preservation path and the CLAUDE.md overwrite-of-edit case deserve follow-up tests, and the warning's recovery hint could be derived rather than hardcoded — but none affect correctness of the shipped behavior. I would stake my name on this shipping.
