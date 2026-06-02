# Spec: Learn Agent Codex Adaptation

**Created by:** AnaPlan
**Date:** 2026-06-01
**Scope:** .ana/plans/active/learn-codex-adaptation/scope.md

## Approach

Create a Codex-specific Learn template adapted from the 533-line CC original. The adaptation requires three categories of change beyond the standard frontmatter-strip: (1) update 3 `.claude/skills/` path references to `.ana/skills/`, (2) rewrite 6 `skills:` frontmatter diagnostic references to use Codex-appropriate language, and (3) add a note about promoted rules requiring `ana init` to take effect.

The diagnostic rewrites follow a single pattern: wherever the CC template says "Plan's `skills:` frontmatter" or similar, the Codex template says "Plan's prompt file at `.codex/agents/ana-plan.md`" — because on Codex, skill content is baked into the prompt file at init time rather than loaded dynamically via frontmatter.

The CC template also gets its 3 stale `.claude/skills/` paths corrected to `.ana/skills/` as part of this scope — same file, same locations, avoids double-touch.

Wiring is mechanical: remove the 5-line hard block in `dispatchToCodex`, add `'ana-learn.md'` to `CODEX_AGENT_FILES`. The existing dispatch function is fully generic after the guard — no other changes needed.

For docs: all 3 files have ForPlatform blocks disclosing the Learn limitation. Since the limitation is being removed and both platforms now behave identically for Learn, collapse each pair into a single unplatformed statement. The pairing test enforces equal counts of `<ForPlatform platform="claude-code">` and `<ForPlatform platform="codex">` — removing both blocks from each pair maintains the invariant.

## Output Mockups

After this change, `ana run learn --platform codex` launches the Codex CLI with the Learn agent prompt — same interactive experience as other Codex agents:

```
$ ana run learn --platform codex
# Codex TUI opens with ana-learn prompt loaded via developer_instructions
```

`ana init --platforms codex` now generates 6 agent files instead of 5:
```
.codex/agents/
├── ana.md
├── ana.agent.toml
├── ana-build.md
├── ana-build.agent.toml
├── ana-learn.md          ← new
├── ana-learn.agent.toml  ← new
├── ana-plan.md
├── ana-plan.agent.toml
├── ana-setup.md
├── ana-setup.agent.toml
├── ana-verify.md
└── ana-verify.agent.toml
```

## File Changes

### `packages/cli/templates/.codex/agents/ana-learn.md` (create)
**What changes:** New 533-line Codex Learn template adapted from CC original.
**Pattern to follow:** `packages/cli/templates/.codex/agents/ana-verify.md` — frontmatter-stripped body. But Learn requires additional diagnostic language rewrites beyond the verify pattern.
**Why:** Without this file, `dispatchToCodex` fails at the "Agent prompt not found" check.

### `packages/cli/templates/.codex/agents/ana-learn.agent.toml` (create)
**What changes:** TOML manifest for Learn agent on Codex.
**Pattern to follow:** `packages/cli/templates/.codex/agents/ana-build.agent.toml` — same field structure (name, description, model, sandbox_mode, model_reasoning_effort, developer_instructions).
**Why:** `readAgentToml` reads this to determine model and sandbox settings.

### `packages/cli/src/commands/run.ts` (modify)
**What changes:** Remove lines 165-170 (the `if (agentSuffix === 'learn')` guard clause and its error/exit body).
**Pattern to follow:** The function is already generic — just delete the guard.
**Why:** This is the hard block preventing Learn on Codex.

### `packages/cli/src/constants.ts` (modify)
**What changes:** Add `'ana-learn.md'` to `CODEX_AGENT_FILES` array. Update the comment from "no Learn agent" to match the new state.
**Pattern to follow:** Existing array entries — alphabetical is not enforced, but Learn should go after verify (last position) to match the `AGENT_FILES` ordering.
**Why:** `copyCodexAgentFiles` in `assets.ts` iterates this array to copy both `.md` and `.agent.toml` during init.

### `packages/cli/templates/.claude/agents/ana-learn.md` (modify)
**What changes:** Update 3 path references from `.claude/skills/` to `.ana/skills/` at lines 45, 307, and 524.
**Pattern to follow:** Other CC agent templates already use `.ana/skills/` — this file is stale.
**Why:** The canonical skill location is `.ana/skills/` since the skills migration. Stale paths mislead the agent.

### `.codex/agents/ana-learn.md` (create)
**What changes:** Dogfood copy of the Codex Learn template.
**Pattern to follow:** Other files in `.codex/agents/` — these are copies of the product templates.
**Why:** Anatomia dogfoods itself. The dogfood installation should include Learn.

### `.codex/agents/ana-learn.agent.toml` (create)
**What changes:** Dogfood copy of the Learn TOML manifest.
**Pattern to follow:** `.codex/agents/ana-build.agent.toml` (dogfood).
**Why:** Same as above — complete the dogfood installation.

### `packages/cli/tests/commands/run.test.ts` (modify)
**What changes:** Replace 2 tests. The test at line 354 ("shows helpful error for Learn agent on Codex") becomes a positive dispatch test ("dispatches Learn agent on Codex"). The test at line 430 ("no codex learn template exists") becomes a positive existence test ("codex learn template and TOML exist"). Remove `@ana A035` and `@ana A040` tags — those contract assertions validated the removed limitation.
**Pattern to follow:** The existing Codex dispatch test at line 335 ("dispatches to codex in interactive mode") — same structure with `createCodexProject()` + `runAndGetExit('learn')` + assertions on `mockedSpawnSync`.
**Why:** Tests currently assert behavior that no longer exists.

### `packages/cli/tests/commands/init.test.ts` (modify)
**What changes:** Update the test at line 793 from `toHaveLength(5)` to `toHaveLength(6)` and change `not.toContain('ana-learn.md')` to `toContain('ana-learn.md')`.
**Pattern to follow:** Same test, inverted assertions.
**Why:** `CODEX_AGENT_FILES` now includes Learn.

### `website/lib/__tests__/docs-platform-content.test.ts` (modify)
**What changes:** Two updates: (1) Remove the `expect(learn).toContain('Codex Learn is not yet available')` assertion at line 202. (2) Remove the `expect(guide).toContain('Codex Learn is not yet available')` assertion at line 165. Replace both with assertions that confirm Learn is documented as available on both platforms.
**Pattern to follow:** Other assertions in the same describe blocks — simple `toContain` checks.
**Why:** The limitation no longer exists. Tests should assert the new reality.

### `website/content/docs/guides/using-ana-learn.mdx` (modify)
**What changes:** Three locations: (1) Lines 9-15: collapse ForPlatform pair into a single unplatformed statement like "Start Learn with the universal command:" (2) Line 22: remove `\n\nCodex Learn is not yet available; use Claude Code for Learn sessions.` from the template literal in the JSX `<pre>` block. (3) Line 26: rewrite the sentence to remove the limitation clause — describe what Learn does without the Codex caveat.
**Pattern to follow:** Other sections in the same file that don't use ForPlatform wrappers.
**Why:** The limitation is removed. Docs must reflect current state.

### `website/content/docs/guides/platform-setup.mdx` (modify)
**What changes:** Lines 127-133: remove both ForPlatform blocks and replace with a single unplatformed statement confirming all pipeline stages including Learn work on both platforms.
**Pattern to follow:** Surrounding prose in the same file.
**Why:** Both platforms now support Learn — no platform difference to document.

### `website/content/docs/guides/troubleshooting.mdx` (modify)
**What changes:** Lines 103-109: remove both ForPlatform blocks and replace with a single unplatformed statement about using `ana run learn` for proof-chain triage.
**Pattern to follow:** Surrounding `<TroubleCard>` content in the same file.
**Why:** The Codex Learn limitation no longer exists.

## Acceptance Criteria

- [x] AC1: `ana run learn --platform codex` dispatches to Codex successfully (no error exit)
- [x] AC2: `ana init --platforms codex` generates `.codex/agents/ana-learn.md` and `.codex/agents/ana-learn.agent.toml`
- [x] AC3: The Codex Learn template contains zero `.claude/skills/` path references — all use `.ana/skills/`
- [x] AC4: The Codex Learn template contains zero `skills:` frontmatter references — all 6 locations use Codex-appropriate diagnostic language referencing prompt files
- [x] AC5: The Codex Learn template has no YAML frontmatter block
- [x] AC6: The CC Learn template's 3 `.claude/skills/` references are updated to `.ana/skills/`
- [x] AC7: `CODEX_AGENT_FILES` includes `'ana-learn.md'` (6 entries total)
- [x] AC8: The hard block in `dispatchToCodex` (`if agentSuffix === 'learn'`) is removed
- [x] AC9: All existing tests pass — the 5 tests asserting the Learn-Codex limitation are updated or replaced
- [x] AC10: Dogfood `.codex/agents/` contains `ana-learn.md` and `ana-learn.agent.toml` matching product templates
- [x] AC11: Docs no longer contain "Codex Learn is not yet available" or equivalent limitation language
- [x] AC12: `ForPlatform` pairing test continues to pass — no orphaned platform blocks
- [x] No build errors
- [x] Tests pass with `(cd 'packages/cli' && pnpm vitest run)` and `(cd 'website' && pnpm vitest run)`

## Testing Strategy

- **Unit tests (run.test.ts):** Replace the Learn-error test with a positive dispatch test: `createCodexProject()` must include `ana-learn` in its agents list, `runAndGetExit('learn')` should trigger a Codex spawn (not exit 1), and the spawn args should include `developer_instructions=` with Learn prompt content. Replace the "no template exists" test with a positive check that Learn files exist.
- **Unit tests (init.test.ts):** Flip the CODEX_AGENT_FILES assertion — length 6, contains `'ana-learn.md'`.
- **Integration tests (docs-platform-content.test.ts):** Remove "not yet available" assertions. Add assertions confirming Learn is described as working on both platforms. Verify ForPlatform pairing test still passes (equal block counts).
- **Edge cases:** Verify the ForPlatform block count remains balanced after all docs changes. Grep all docs for "not yet available" and "Learn is not" to confirm no remnants.

## Dependencies

- The CC Learn template at `packages/cli/templates/.claude/agents/ana-learn.md` exists and is the source for adaptation.
- The `dispatchToCodex` function is generic except for the Learn guard — no other code changes needed for dispatch to work.

## Constraints

- ForPlatform pairing: every removal of a `<ForPlatform platform="codex">` block must also remove its adjacent `<ForPlatform platform="claude-code">` block. The test at `docs-platform-content.test.ts:183` enforces adjacent pairs.
- The `createCodexProject()` helper in run.test.ts hardcodes its agent list. Adding `'ana-learn'` to the helper's `agents` array is required for the positive dispatch test to work.
- TOML must use `gpt-5.5` — Learn's diagnostic reasoning needs a capable model, and this matches other Codex agents.

## Gotchas

- **ForPlatform removal order matters for the pairing test.** If you remove blocks in `using-ana-learn.mdx` but not `platform-setup.mdx`, the global count can temporarily become unbalanced. Process all 3 docs files before running the pairing test, or run the test only after all docs changes.
- **The `createCodexProject()` helper hardcodes agents.** The array at run.test.ts line 92 is `['ana', 'ana-build', 'ana-plan', 'ana-verify', 'ana-setup']`. Add `'ana-learn'` to this array — otherwise the positive dispatch test fails at the "Agent prompt not found" check.
- **Line 22's template literal in using-ana-learn.mdx.** The limitation message is a substring within `{"\n\n..."}` JSX expression. Remove only `Codex Learn is not yet available; use Claude Code for Learn sessions.\n\n` from the string — don't touch the surrounding JSX structure or the proof orientation output that follows.
- **The Codex template must NOT have frontmatter.** Codex reads the file as raw prompt content via `fs.readFileSync`. YAML frontmatter would appear verbatim in the prompt.
- **The CC template fix (.claude/skills/ → .ana/skills/) creates a diff between CC and Codex templates at those 3 locations.** Both should say `.ana/skills/` after this change — the paths are platform-neutral.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports.
- Prefer early returns over nested conditionals.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- In JSX text content, use `&apos;` for apostrophes (react/no-unescaped-entities rule).
- Tests use `--run` flag with vitest to avoid watch mode hang.

### Pattern Extracts

**TOML manifest pattern** (from `packages/cli/templates/.codex/agents/ana-build.agent.toml`):
```toml
name = "ana-build"
description = "AnaBuild — reads spec, produces working code, tests, and build report."
developer_instructions = "Full instructions in ana-build.md. Invoke via: ana run"
model = "gpt-5.5"
sandbox_mode = "danger-full-access"
model_reasoning_effort = "high"
```

**createCodexProject helper** (from `packages/cli/tests/commands/run.test.ts:75-103`):
```typescript
function createCodexProject(config?: Record<string, unknown>): void {
  const anaDir = path.join(tempDir, '.ana');
  fs.mkdirSync(anaDir, { recursive: true });
  fs.writeFileSync(
    path.join(anaDir, 'ana.json'),
    JSON.stringify({
      name: 'test',
      platforms: ['codex'],
      platformFlags: {},
      ...config,
    }),
  );

  const agentsDir = path.join(tempDir, '.codex', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });

  const agents = ['ana', 'ana-build', 'ana-plan', 'ana-verify', 'ana-setup'];
  for (const agent of agents) {
    fs.writeFileSync(
      path.join(agentsDir, `${agent}.agent.toml`),
      `model = "gpt-5.5"\nsandbox_mode = "danger-full-access"\nmodel_reasoning_effort = "high"\n`,
    );
    fs.writeFileSync(
      path.join(agentsDir, `${agent}.md`),
      `# ${agent} prompt\nYou are ${agent}.`,
    );
  }
}
```

**Positive Codex dispatch test pattern** (from `run.test.ts:335-351`):
```typescript
it('dispatches to codex in interactive mode (no exec)', () => {
  createCodexProject();
  runAndGetExit('verify');

  const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'codex');
  expect(spawnCall).toBeDefined();
  const spawnArgs = spawnCall![1] as string[];
  expect(spawnArgs).not.toContain('exec');
});
```

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands
- After `run.ts` + `constants.ts` changes: `(cd 'packages/cli' && pnpm vitest run tests/commands/run.test.ts --run)` — Expected: tests pass (after test file updates)
- After all changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: 3148+ tests pass
- Website tests: `(cd 'website' && pnpm vitest run)` — Expected: 84 tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current CLI tests: 3148 passed, 2 skipped (3150 total) — command: `(cd 'packages/cli' && pnpm vitest run)`
- Current website tests: 84 passed — command: `(cd 'website' && pnpm vitest run)`
- After build: 3148+ tests (replacing 2 negative tests with 2 positive tests maintains count)
- Regression focus: `run.test.ts` (dispatch tests), `init.test.ts` (CODEX_AGENT_FILES), `docs-platform-content.test.ts` (ForPlatform pairing + content assertions)
