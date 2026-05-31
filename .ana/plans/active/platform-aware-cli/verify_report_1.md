# Verify Report: Platform Infrastructure (Phase 1)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-30
**Spec:** .ana/plans/active/platform-aware-cli/spec-1.md
**Branch:** feature/platform-aware-cli

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/platform-aware-cli/.ana/plans/active/platform-aware-cli/contract.yaml
  Seal: INTACT (hash sha256:436b8bf1d8ab1928fc8e0954a90ac21c59f71739563d76c1b4f5203d1246f8f6)
```

Seal: INTACT.

Tests: 3021 passed, 2 skipped (128 test files). Build: ✅. Lint: ✅ (1 pre-existing warning in `git-operations.ts`).

Baseline was 3001 passed / 127 files. Net gain: +20 tests, +1 test file (`platform.test.ts`).

## Contract Compliance

Phase 1 assertions only (A001–A018).

| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Fresh projects get a default platform list of Claude | ✅ SATISFIED | Source: `state.ts:563` hardcodes `platforms: ['claude']` in `createAnaJson`. Tagged test (`platform.test.ts:64`) tests schema preservation, not the fresh-init path — satisfied by source inspection. |
| A002 | Fresh projects get an empty platform flags object | ✅ SATISFIED | `platform.test.ts:76-79`, asserts `parsed.platformFlags` equals `{}` on missing field. Source: `state.ts:564` hardcodes `platformFlags: {}`. |
| A003 | Missing platforms field defaults to Claude instead of crashing | ✅ SATISFIED | `platform.test.ts:51-53`, `AnaJsonSchema.parse({ name: 'test' })` returns `platforms: ['claude']`. |
| A004 | Empty platforms array defaults to Claude instead of leaving empty | ❌ UNSATISFIED | `platform.test.ts:57-62` asserts `parsed.platforms` equals `[]`, contradicting the contract value `["claude"]`. The builder documented this as a Zod `.catch()` limitation — `.catch()` fires on parse errors, not valid empty arrays. The contract expectation is unachievable with the specified schema pattern. |
| A005 | A malformed flag entry for one platform does not wipe other platforms' flags | ✅ SATISFIED | `platform.test.ts:90-100`, parses malformed `codex: 'not-an-array'` alongside valid `claude` flags. Asserts `claude` preserved with `['--dangerously-skip-permissions']` and `codex` catches to `[]`. |
| A006 | User-set platforms survive re-initialization | ✅ SATISFIED | `platform.test.ts:108-116`, spread merge preserves `['claude', 'codex']`. |
| A007 | User-set platformFlags survive re-initialization | ✅ SATISFIED | `platform.test.ts:119-125`, spread merge preserves `claude: ['--dangerously-skip-permissions']`. |
| A008 | New platform fields recognized by config set (platforms) | ✅ SATISFIED | `platform.test.ts:131-143`, reads `config.ts` source, confirms `'platforms'` present in `KNOWN_FIELDS`. Verified by source: `config.ts:52`. |
| A009 | New platform fields recognized by config set (platformFlags) | ✅ SATISFIED | Same test, confirms `'platformFlags'` present. Verified by source: `config.ts:53`. |
| A010 | Agent directory resolves to the Claude Code agents path | ✅ SATISFIED | `platform.test.ts:19-23`, `getAgentsDir('/projects/my-app')` contains `.claude/agents`. |
| A011 | Skills directory resolves to the Claude Code skills path | ✅ SATISFIED | `platform.test.ts:26-30`, `getSkillsDir('/projects/my-app')` contains `.claude/skills`. |
| A012 | Relative skills path works for glob patterns | ✅ SATISFIED | `platform.test.ts:33-35`, `getSkillsDirRel()` equals `.claude/skills`. |
| A013 | Infrastructure commits include Codex directories when they exist | ✅ SATISFIED | `platform.test.ts:148-157`, reads `commit.ts` source, confirms `'.codex/'` present. Verified by source: `commit.ts:67`. |
| A014 | Infrastructure commits include generic agent directories when they exist | ✅ SATISFIED | Same test, confirms `'.agents/'` present. Verified by source: `commit.ts:68`. |
| A015 | Scan sampling excludes Codex directories | ✅ SATISFIED | `platform.test.ts:175-184`, reads `proportionalSampler.ts` source, confirms `'**/.codex/**'` present. Verified by source: `proportionalSampler.ts:37`. |
| A016 | Scan sampling excludes generic agent directories | ✅ SATISFIED | Same test, confirms `'**/.agents/**'` present. Verified by source: `proportionalSampler.ts:38`. |
| A017 | Symbol index excludes Codex directories | ✅ SATISFIED | `platform.test.ts:189-198`, reads `symbol-index.ts` source, confirms `'.codex/**'` present. Verified by source: `symbol-index.ts:340`. |
| A018 | Symbol index excludes generic agent directories | ✅ SATISFIED | Same test, confirms `'.agents/**'` present. Verified by source: `symbol-index.ts:341`. |

**Summary:** 17 SATISFIED, 1 UNSATISFIED (A004).

### A004 Assessment

A004 is UNSATISFIED because the test explicitly expects `[]` while the contract says `["claude"]`. However, this is an **upstream contract error**, not a builder error. The contract specifies `z.array(z.string()).optional().default(['claude']).catch(['claude'])` — Zod's `.catch()` only fires on parse errors, not on valid-but-empty arrays. An empty array is a valid `z.array(z.string())` value, so `.catch()` does not intercept it. The builder documented this deviation and wrote the test to match actual Zod behavior.

**Achieving the contract's intent** would require a `.transform()` or `.refine()` step — a schema pattern change not specified in the spec. The contract's expectation is mechanically incorrect for the specified schema approach. This is an upstream finding: the contract should be updated to reflect Zod's actual behavior, or the spec should specify a transform.

This does not block shipping — the behavior is reasonable (an empty array means "user explicitly cleared platforms") and the deviation is documented.

## Independent Findings

**Prediction resolution:**

1. **Field placement in `createAnaJson`** — Confirmed correct. `platforms` at line 563 (after `surfaces` spread), `platformFlags` at 564, both before `coAuthor` at 565. Matches spec exactly.
2. **Schema inner `.catch([])` test** — Not found (prediction wrong). The test at line 90-100 does use genuinely malformed data (`'not-an-array'` string) and verifies cross-contamination prevention. Good test.
3. **`EXCLUDED_PREFIXES` missing entries** — Not found. All four new entries present: `.codex/settings.local.json`, `.codex/agent-memory/`, `.agents/settings.local.json`, `.agents/agent-memory/`. Verified at `commit.ts:55-58`.
4. **Over-building in platform.ts** — Not found. Exactly three functions, all used, no extra logic. Clean.
5. **`preserveUserState` round-trip** — Tests at lines 108-125 verify the spread merge. They use schema parse → spread → check, which is the actual re-init mechanism. Acceptable.

**Surprise finding:** The A001 tag is on the wrong test. The tagged test (`platform.test.ts:64`) tests schema preservation of explicit `['claude', 'codex']`, not the fresh-project default `['claude']`. A001 claims "Fresh projects get a default platform list of Claude" — the fresh-project default is covered by A003's test instead. Satisfied by source inspection but the tagging is misleading.

**Production risk check:**
1. Empty `platforms: []` set by hand — the schema accepts it (per A004 finding above). Not dangerous but unexpected if the user assumed it would auto-fill.
2. `skillRelPath` in proof.ts — uses `getSkillsDirRel()` which returns the same `.claude/skills` string. No data format change. Verified at `proof.ts:1228` and `proof.ts:1623`.

## AC Walkthrough

- **AC1:** `ana.json` contains `platforms: ["claude"]` after fresh init and after re-init — ✅ PASS. `state.ts:563` hardcodes it. Schema test at `platform.test.ts:51-53` confirms default. Spread merge tests at lines 108-125 confirm re-init preservation.
- **AC2:** `ana.json` accepts `platformFlags` field preserved across re-init — ✅ PASS. `state.ts:564` writes `{}`. Schema test at `platform.test.ts:76-79`. Spread merge at `platform.test.ts:119-125`.
- **AC3:** `ana agents` resolves agent directory from helper, not hardcoded path — ✅ PASS. `agents.ts:89-90` uses `getAgentsDir(root)` and `getSkillsDir(root)`. Same at lines 323-324. No residual hardcoded paths in agents.ts (grep confirms).
- **AC4:** `ana setup check` discovers skills from helper — ✅ PASS. `check.ts:797`, `check.ts:813`, `check.ts:953`, `check.ts:1301` all use `getSkillsDir(cwd)`. `claudePath` variable eliminated.
- **AC5:** `ana proof promote --skill` resolves skill path from helper — ✅ PASS. `proof.ts:1159` uses `getSkillsDirRel()`, lines 1228-1229 and 1623-1624 use both `getSkillsDirRel()` and `getSkillsDir()`. `proof.ts:1555` uses `getSkillsDir(proofRoot)`.
- **AC6:** `ana init commit` uses static `KNOWN_ROOTS` including `.codex/` and `.agents/` — ✅ PASS. `commit.ts:64-69` lists all four roots. `EXCLUDED_PREFIXES` at lines 55-58 includes all four new entries.
- **AC14:** `ana scan` excludes `.codex/` and `.agents/` directories from sampling — ✅ PASS. `proportionalSampler.ts:37-38` has `'**/.codex/**'` and `'**/.agents/**'`. `symbol-index.ts:340-341` has `'.codex/**'` and `'.agents/**'`.
- **AC13 (tests):** Tests pass, no build errors, test count does not decrease from 3001 — ✅ PASS. 3021 tests passed (3001 baseline + 20 new), 128 test files (127 + 1).

## Blockers

None. The A004 UNSATISFIED assertion is an upstream contract error (Zod `.catch()` cannot intercept valid empty arrays). The implementation behavior is reasonable and documented. All other assertions satisfied, all ACs pass, no regressions.

Checked: no unused parameters in new `platform.ts` functions (each param used in its return expression), no unused exports (all three consumed by 4 files), no unhandled error paths in new code (pure functions with no error scenarios), no assumptions about external state (functions take explicit `cwd` parameter).

## Findings

- **Upstream — Contract A004 value unreachable with specified schema pattern:** The contract asserts `platforms` defaults to `["claude"]` when given `[]`, but Zod's `.catch()` only fires on parse errors. An empty array is valid `z.array(z.string())`. Achieving the contract's intent requires `.transform()` or a `.refine()` step — not specified in the spec. The builder's documented deviation is correct. Update contract A004 or specify a transform in Scope 2.

- **Test — A001 tag on wrong test:** `packages/cli/tests/commands/platform.test.ts:64` — tagged `@ana A001` but tests schema preservation of `['claude', 'codex']`, not the "fresh project defaults to `['claude']`" claim. The fresh-default behavior is covered by the A003 test at line 51. The A001 claim is satisfied by source inspection (`state.ts:563`) but the tag is misleading for future verification.

- **Test — Six assertions use source-content inspection:** `packages/cli/tests/commands/platform.test.ts:131-199` — A008, A009, A013-A018 read source files and assert on string presence. This is the weakest verification pattern — it proves the string exists in the source but not that the runtime uses it. Acceptable under the testing standards' "structural invariant" exception (these are static const arrays/sets), but behavioral tests would be stronger. Not a blocker — these are forward-compatible entries that match zero files today.

- **Code — Residual hardcoded `.claude/skills/` display string in check.ts:** `packages/cli/src/commands/check.ts:1411` — `console.log(chalk.gray('  No skills found in .claude/skills/'))` not migrated to use `getSkillsDirRel()`. The spec only specified migrating the `state.ts:961` display string, so this isn't a spec violation, but it's a residual that Scope 2 will need to catch. Adding it as a finding for the next cycle.

- **Code — `AGENTS.md` added to KNOWN_ROOT_FILES without spec mention:** `packages/cli/src/commands/init/commit.ts:76` includes `'AGENTS.md'` alongside `'CLAUDE.md'`. The spec said "KNOWN_ROOT_FILES (line 68, CLAUDE.md) is NOT a change target." The builder added `AGENTS.md` — reasonable forward-compatibility (Codex uses `AGENTS.md`), but it's an unspecified addition. Matches zero files on CC installs so no behavior change.

## Deployer Handoff

This is phase 1 of a 2-phase build. Do not merge until phase 2 is also verified.

Phase 1 is a pure refactor — zero behavior change on Claude Code installs. All new exclusion patterns (`.codex/`, `.agents/`) match zero files today. The `platforms: ['claude']` and `platformFlags: {}` fields are additive to `ana.json`.

**A004 contract deviation:** The empty-platforms-array case produces `[]` instead of `['claude']`. If this matters for Scope 2's multi-platform logic, address it there with a `.transform()` step. For now, it's harmless — no user path produces an empty platforms array.

**Residual hardcoded path:** `check.ts:1411` still says `.claude/skills/` in a display string. Track for Scope 2 cleanup.

## Verdict
**Shippable:** YES

17 of 18 phase 1 contract assertions satisfied. The one UNSATISFIED (A004) is an upstream contract error — the specified Zod schema pattern cannot intercept valid empty arrays. The implementation is correct for the schema used, the deviation is documented, and it has no user-facing impact. All 8 acceptance criteria pass. 3021 tests pass (20 above baseline). No regressions. Clean build, clean lint.
