# Verify Report: Agent Dashboard Phase 1

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-07
**Spec:** .ana/plans/active/agent-dashboard-p1/spec.md
**Branch:** feature/agent-dashboard-p1

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/agent-dashboard-p1/contract.yaml
  Seal: INTACT (hash sha256:afb74c4f2c3aa0abf1a81a01498d91f046fded6d52cc3b572d51ffd62e663d9d)
```

Seal status: **INTACT**

Tests: 1998 passed, 2 skipped (2000 total) across 96 test files. Build: success. Lint: 0 errors, 1 warning (pre-existing unused eslint-disable directive in unrelated file).

Baseline was 1950 passed / 2 skipped. This build added 48 new tests — no regressions.

## Contract Compliance
| ID   | Says                                                      | Status         | Evidence |
|------|-----------------------------------------------------------|----------------|----------|
| A001 | Agent listing shows how many characters each agent uses   | ✅ SATISFIED    | `agents.test.ts:95-114` — tagged test creates agent, calls `listAgents()`, asserts `output.toContain('chars')` |
| A002 | Character count includes both template and loaded skills  | ✅ SATISFIED    | `agents.test.ts:117-143` — creates agent with skill, calls `getAgentInfoList()`, asserts `charCount > templateSize` and `charCount > 0` |
| A003 | Running model with no args shows each agent's current model | ✅ SATISFIED  | `agents.test.ts:385-402` — runs `['agents', 'model']` via Commander, asserts `output.toContain('Agent models')` |
| A004 | Agents without a model setting show as using the default  | ✅ SATISFIED    | `agents.test.ts:405-421` — agent without model field, runs model read, asserts `output.toContain('(default)')` |
| A005 | Setting an agent's model writes the value to frontmatter  | ✅ SATISFIED    | `agents.test.ts:426-446` — runs model set, reads file, asserts `modelMatch[1]` equals `'sonnet'` |
| A006 | Setting a model does not change the rest of the agent file | ✅ SATISFIED   | `agents.test.ts:449-480` — creates agent with body containing `---` rules, runs model set, asserts name/description/skills/body all preserved |
| A007 | Clearing a model removes the model line from frontmatter  | ✅ SATISFIED    | `agents.test.ts:484-504` — runs `--default`, reads file, asserts `content.not.toMatch(/^model:/m)` — model line absent |
| A008 | Clearing a model confirms the agent will use the default  | ✅ SATISFIED    | `agents.test.ts:507-526` — runs `--default`, asserts `output.toContain('default')` |
| A009 | Setting model for all agents updates every agent file     | ✅ SATISFIED    | `agents.test.ts:552-579` — creates 6 agent files, runs `--all sonnet`, reads all 6, asserts `updatedCount === 6` |
| A010 | Uniform model shows single footer line                    | ✅ SATISFIED    | `agents.test.ts:208-232` — two agents with same model, asserts `output.toContain('Model:')` and `output.toContain('opus')` |
| A011 | Mixed models show per-agent model inline                  | ✅ SATISFIED    | `agents.test.ts:235-258` — two agents with different models, asserts `output.toContain('mixed')` |
| A012 | Agents without model field appear in the listing          | ✅ SATISFIED    | `agents.test.ts:261-292` — two agents without model, asserts both names in output and `agents.length === 2` |
| A013 | Unknown agent error shows available agent names           | ✅ SATISFIED    | `agents.test.ts:644-662` — runs model set for `nonexistent`, asserts `errorOutput.toContain('Unknown agent')` and `errorOutput.toContain('ana')` |
| A014 | Model-like agent name suggests --all syntax               | ✅ SATISFIED    | `agents.test.ts:665-682` — runs `model sonnet` (no agent name), asserts `errorOutput.toContain('--all')` |
| A015 | Clearing already-default model is a no-op with message    | ✅ SATISFIED    | `agents.test.ts:529-547` — agent without model field, runs `--default`, asserts `output.toContain('already uses default')` |
| A016 | Agents with skills show the skill count                   | ✅ SATISFIED    | `agents.test.ts:147-164` — agent with 2 skills, asserts `output.toContain('2 skills')` |
| A017 | Agents without skills show zero skills                    | ✅ SATISFIED    | `agents.test.ts:167-184` — agent without skills field, asserts `output.toContain('0 skills')` |
| A018 | Writing a model preserves all other frontmatter fields    | ✅ SATISFIED    | `agent-config.test.ts:179-194` — sets model on content with name+description, re-parses, asserts all fields preserved |
| A019 | Writing a model does not touch body content               | ✅ SATISFIED    | `agent-config.test.ts:213-239` — body with multiple `---` rules, sets model, asserts `result.toContain(body)` — exact body preservation |
| A020 | Bulk set skips corrupt files with warning                 | ✅ SATISFIED    | `agents.test.ts:582-611` — one valid + one no-frontmatter file, runs `--all`, asserts `errorOutput.toContain('Warning')` and `errorOutput.toContain('skipped')`, valid file updated |
| A021 | Bulk set reports how many agents were updated             | ✅ SATISFIED    | `agents.test.ts:614-639` — two agents, runs `--all`, asserts `output.toContain('2 agents')` |
| A022 | Parser returns null for files without frontmatter         | ✅ SATISFIED    | `agent-config.test.ts:15-18` — plain markdown, asserts `parseFrontmatter(content).toBeNull()` |
| A023 | Parser extracts skills array from inline YAML syntax      | ✅ SATISFIED    | `agent-config.test.ts:104-112` — `skills: [coding-standards, testing-standards]`, asserts `skills.toEqual(['coding-standards', 'testing-standards'])` — contains `git-workflow` variant also tested at line 114-121 |
| A024 | Missing agents directory shows helpful error mentioning init | ✅ SATISFIED | `agents.test.ts:689-691` — no agents dir, asserts `listAgents().toThrow(/init/)` |

## Independent Findings

**Prediction resolution:**

1. **`---` body separator handling** — Not found. The regex `^---\s*\n([\s\S]*?)\n---` is properly anchored to start-of-string. Tests at `agent-config.test.ts:156-174` and `agents.test.ts:694-724` exercise body `---` rules explicitly. The `setFrontmatterField` and `removeFrontmatterField` functions use the same anchored pattern and rebuild from `match[0].length`, preserving body content. Solid.

2. **Skill file path resolution** — Not found. The `resolveSkillCharCount` function uses dependency injection (`statSync` parameter) and catches all errors. Missing skills contribute 0 chars as specified. Tests at `agent-config.test.ts:324-368` cover valid, missing, empty, and mixed scenarios.

3. **Model-like agent name detection** — Confirmed minor concern. The check at `agents.ts:201` uses `KNOWN_MODEL_NAMES.includes(agentName.toLowerCase())` which is case-insensitive. If someone creates an agent literally named `sonnet.md` this would show the hint erroneously — but that's a reasonable tradeoff. Not a bug, just a known limitation of the heuristic.

4. **--all corrupt file test** — The test uses a file with no frontmatter at all. Adequate — `setFrontmatterField` returns null for any content without a `---` opener, so the "corrupt" and "no frontmatter" cases collapse to the same code path.

5. **All-default is uniform** — Not found as a problem. Tested explicitly at `agents.test.ts:294-320`. When all agents have no model field, the footer shows `Model: (default)`. Correct.

**Production risks:**
1. Concurrent writes — still valid concern. No locking on file writes. Two simultaneous `model --all` invocations could interleave reads and writes, producing corrupted frontmatter. Unlikely in practice (CLI tool, single user), but worth noting.
2. Bytes vs characters — `statSync` returns byte size, which is what the spec calls for ("file byte size, not token estimates"). Correctly implemented per spec.

## AC Walkthrough
- [x] AC1: `ana agents` shows character count — ✅ PASS — live output shows "14,883 chars" for each agent. Test at `agents.test.ts:95`.
- [x] AC2: `ana agents model` shows current models — ✅ PASS — live output shows "Agent models:" with each agent's model. Test at `agents.test.ts:385`.
- [x] AC3: `ana agents model ana-build sonnet` writes frontmatter — ✅ PASS — test at `agents.test.ts:426` reads file after set and confirms `model: sonnet`.
- [x] AC4: `ana agents model ana-build --default` removes model line — ✅ PASS — test at `agents.test.ts:484` confirms no `model:` line after clear.
- [x] AC5: `ana agents model --all sonnet` writes to every file — ✅ PASS — test at `agents.test.ts:552` creates 6 files, verifies all 6 updated.
- [x] AC6: Uniform footer vs mixed inline — ✅ PASS — live test shows `Model: opus[1m]` footer for uniform. Tests at `agents.test.ts:208` and `agents.test.ts:235`.
- [x] AC7: Agents without model show "(default)" — ✅ PASS — test at `agents.test.ts:261` and `agents.test.ts:294`.
- [x] AC8: Unknown agent error with available names — ✅ PASS — live test shows `Unknown agent 'nonexistent'` + available agents list. Test at `agents.test.ts:644`.
- [x] AC9: Clear when already default is no-op — ✅ PASS — test at `agents.test.ts:529` asserts "already uses default" message.
- [x] AC10: Skills count appears — ✅ PASS — live output shows "1 skill" / "0 skills". Tests at `agents.test.ts:147` and `agents.test.ts:167`.
- [x] AC11: Frontmatter write preserves all fields — ✅ PASS — unit tests at `agent-config.test.ts:179` and `agent-config.test.ts:246`. Command test at `agents.test.ts:449` verifies body with `---` rules preserved through the full write path.
- [x] AC12: `--all` skips corrupt files with warning — ✅ PASS — test at `agents.test.ts:582` confirms warning printed and valid files still updated.
- [x] Tests pass — ✅ PASS — 1998 passed, 2 skipped, 0 failed.
- [x] No build errors — ✅ PASS — `pnpm run build` succeeds.
- [x] No lint errors — ✅ PASS — 0 errors (1 pre-existing warning in unrelated file).

## Blockers

No blockers. All 24 contract assertions satisfied. All 15 acceptance criteria pass. No regressions (baseline 1950 → 1998 tests, +48 net new). Checked for: unused exports in new code (`AgentFrontmatter` is exported but only used internally — minor, not a blocker), unhandled error paths (all throw/catch paths tested), sentinel test patterns (assertions check specific values not just existence, except A002 which uses `toBeGreaterThan` — reasonable for a computed value), body `---` corruption risk (explicitly tested in both unit and integration tests).

## Findings

- **Code — Double error output for unknown agent in setModel():** `packages/cli/src/commands/agents.ts:197` — `setModel()` prints to stderr via `console.error` then throws. The action handler catch block at line 382 catches the throw and prints the error message again via `chalk.red(msg)`. Live test confirms: "Unknown agent 'nonexistent'" appears twice. The `sonnet` case (line 368) doesn't have this because it uses `process.exitCode` without throwing. Fix: either remove the throw and use `process.exitCode = 1` (like the sonnet path), or remove the `console.error` calls from `setModel()` and let the catch block handle it.

- **Code — maxModelLen recomputed on every loop iteration:** `packages/cli/src/commands/agents.ts:130` — `Math.max(...models.map(m => m.length))` is called inside the `for (const agent of agents)` loop. Should be hoisted above the loop. O(n²) instead of O(n). Not a practical problem at 6 agents but a code quality nit.

- **Code — AgentFrontmatter exported but unused externally:** `packages/cli/src/utils/agent-config.ts:13` — The `AgentFrontmatter` interface is exported but never imported outside the module. Only consumed as the return type of `parseFrontmatter()`. Callers use `AgentInfo` from `agents.ts`. Minor — the export is harmless and could be useful for future consumers.

- **Test — A002 assertion weaker than necessary:** `packages/cli/tests/commands/agents.test.ts:141` — The test creates a known skill content string `'Skill content that adds to the char count'` (42 bytes) and asserts `charCount > templateSize`. Since the skill content is fixture-controlled, it could assert the exact expected value: `templateSize + 42`. The `toBeGreaterThan` assertion would pass even if skill resolution returned 1 byte instead of 42. Not a sentinel test — it does verify skills add to the count — but the assertion could be tighter.

- **Upstream — Stale finding resolved:** Proof chain flagged `agents.ts` file header as stale ("List deployed agents"). This build updated it to "Agent dashboard and model management" at line 2. Stale finding resolved by this build.

## Deployer Handoff

This is a straightforward feature addition — no breaking changes, no new dependencies, no migrations. The `agents` command was previously a flat `listAgents()` call; it's now a parent command with a `model` subcommand. The existing `ana agents` behavior is preserved (default action lists agents).

The double-error-output finding (setModel throws after printing) is cosmetic — users see "Unknown agent" twice on invalid input. Not a merge blocker but worth a follow-up.

The build added 48 tests with strong coverage of frontmatter edge cases, especially the `---` body separator risk. The `agent-config.ts` module is well-isolated — pure functions on strings, no I/O.

## Verdict
**Shippable:** YES

All 24 contract assertions satisfied. All 15 acceptance criteria pass. 48 new tests, no regressions. Live testing confirms the dashboard output matches the spec mockups. The frontmatter write logic — the highest-risk area — is thoroughly tested including the `---` body separator edge case. The double-error-output finding is a minor UX glitch, not a correctness issue.
