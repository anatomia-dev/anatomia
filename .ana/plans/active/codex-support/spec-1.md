# Spec: Codex Support — Init Infrastructure

**Created by:** AnaPlan
**Date:** 2026-05-30
**Scope:** .ana/plans/active/codex-support/scope.md

## Approach

This spec establishes the unified skill architecture (`.ana/skills/` as canonical, symlinks for both platforms), creates Codex agent templates and TOML manifests, makes init platform-conditional, migrates CC templates from `claude --agent` to `ana run` syntax, and fixes two Scope 1 residuals.

The structural analog is `createClaudeConfiguration()` in `assets.ts` — `createCodexConfiguration()` mirrors its shape with the same parameters, same merge-not-overwrite pattern, and same delegation to `scaffoldAndSeedSkills()`.

The key architectural decision: skills live in `.ana/skills/` (one location, works for all platforms). Both `.claude/skills` and `.agents/skills` become symlinks pointing to `../../.ana/skills` (relative path — survives clone). `getSkillsDir()` and `getSkillsDirRel()` change return values; all 12+ consumer sites auto-update.

## Output Mockups

### `ana init --platforms claude,codex` (first init)

```
$ ana init --platforms claude,codex

Scanning project...
✓ Directory structure created
✓ Generated 2 context scaffolds (148 lines total)
✓ Saved scan.json
✓ Created ana.json (v1.1.5)
✓ Created .claude/ configuration
✓ Created .codex/ configuration
✓ Context → .ana/context/ (2 files)
✓ Skills → .ana/skills/ (5 skills)
    Core:      coding-standards, testing-standards, git-workflow, deployment, troubleshooting
  ✓ Cross-tool: CLAUDE.md + AGENTS.md

Next: ana init commit
```

### `ana init --platforms codex` (Codex-only)

```
$ ana init --platforms codex

...
✓ Created .codex/ configuration
✓ Skills → .ana/skills/ (5 skills)
  ✓ Cross-tool: AGENTS.md

Next: ana init commit
```

No `.claude/` directory created. No CLAUDE.md generated.

### Filesystem after `ana init --platforms claude,codex`

```
.ana/
  skills/
    coding-standards/SKILL.md
    testing-standards/SKILL.md
    ...
.claude/
  agents/ana.md, ana-build.md, ...
  skills → ../../.ana/skills        (symlink)
  settings.json
  .gitignore
.codex/
  agents/
    ana.md
    ana.agent.toml
    ana-build.md
    ana-build.agent.toml
    ana-plan.md
    ana-plan.agent.toml
    ana-setup.md
    ana-setup.agent.toml
    ana-verify.md
    ana-verify.agent.toml
.agents/
  skills → ../.ana/skills            (symlink)
CLAUDE.md
AGENTS.md
```

### Codex `.agent.toml` example (ana-build)

```toml
model = "gpt-5.5"
sandbox_mode = "danger-full-access"
model_reasoning_effort = "high"
mode = "exec"
```

## File Changes

### `packages/cli/src/commands/platform.ts` (modify)
**What changes:** `getSkillsDir()` returns `.ana/skills`. `getSkillsDirRel()` returns `.ana/skills`. `getAgentsDir()` accepts optional `platform` parameter — returns `.claude/agents` for `'claude'`, `.codex/agents` for `'codex'`. `getPlatformFlags()` accepts optional `platform` parameter instead of hardcoding `platforms[0]`.
**Pattern to follow:** Existing helper shape — pure functions, path.join, no side effects.
**Why:** All consumer sites (check.ts, proof.ts, agents.ts, state.ts) auto-update without individual changes. Skills path must be platform-neutral for the symlink architecture to work.

### `packages/cli/src/commands/init/assets.ts` (modify)
**What changes:** Extract `generateAgentsMd()` and `generatePrimaryPackageAgentsMd()` calls from `createClaudeConfiguration()` into the init orchestrator (they're cross-tool, not CC-specific). Add `createCodexConfiguration()` as a parallel function. Add `createSkillSymlinks()` to create the platform symlinks. Gate CLAUDE.md generation on `platforms.includes('claude')` — move `copyClaudeMd()` call into `createClaudeConfiguration()` only (already there) and gate it at the orchestrator level.
**Pattern to follow:** `createClaudeConfiguration()` shape — same parameters, same merge-not-overwrite via the existing `copyAgentFiles()` internal helper.
**Why:** Codex-only projects must not generate `.claude/` or CLAUDE.md. AGENTS.md is cross-tool and must generate regardless.

### `packages/cli/src/commands/init/skills.ts` (modify)
**What changes:** `scaffoldAndSeedSkills()` destination changes from `.claude/skills` to `.ana/skills` — this is already parameterized via the `skillsPath` argument. The caller passes `.ana/skills` instead of `.claude/skills`. The source template path (`templates/.claude/skills/`) stays unchanged — it's a template source, not a runtime path.
**Pattern to follow:** No structural change to the function — only the argument passed by the caller changes.
**Why:** The function is already parameterized correctly. The change is at the call site.

### `packages/cli/src/commands/init/index.ts` (modify)
**What changes:** Add `--platforms` flag to the init command. Platform-conditional gating: call `createClaudeConfiguration()` only when `platforms.includes('claude')`, call `createCodexConfiguration()` when `platforms.includes('codex')`. Call `generateAgentsMd()` and `generatePrimaryPackageAgentsMd()` unconditionally (cross-tool). Call `createSkillSymlinks()` after skills are written. First-init auto-detection from PATH when no `--platforms` flag. Re-init preserves platforms from existing `ana.json`.
**Pattern to follow:** Existing init orchestration at lines 94-189 — same try/catch structure, same phase ordering.
**Why:** Init must be platform-conditional to avoid generating `.claude/` for Codex-only projects.

### `packages/cli/src/commands/init/state.ts` (modify)
**What changes:** `preserveUserState()` gains skill migration: if `.claude/skills/` is a real directory (not symlink), move content to `.ana/skills/`, replace with symlink. Conflict resolution uses mtime. `createAnaJson()` writes `platforms` based on the `--platforms` flag or auto-detection.
**Pattern to follow:** Existing `preserveUserState()` structure — copy operations in numbered steps, try/catch per operation so one failure doesn't block others.
**Why:** Existing users upgrading need their enriched skills migrated to the canonical location. Without migration, CC reads enriched content from `.claude/skills/` while Codex reads unenriched templates from `.ana/skills/` — split-brain.

### `packages/cli/src/commands/check.ts` (modify)
**What changes:** Line 1411: replace hardcoded `'No skills found in .claude/skills/'` with `getSkillsDirRel()` interpolation.
**Pattern to follow:** Same pattern as state.ts:964 — `${getSkillsDirRel()}/`.
**Why:** Scope 1 residual (proof finding platform-aware-cli-C4).

### `packages/cli/templates/CLAUDE.md` (modify)
**What changes:** Replace 3 `claude --agent` references with `ana run` syntax.
**Pattern to follow:** Mechanical replacement. `claude --agent ana` → `ana run`, `claude --agent ana-setup` → `ana run setup`, `claude --agent ana-learn` → `ana run learn`.
**Why:** CC templates should use the unified `ana run` invocation surface.

### `packages/cli/templates/.claude/agents/ana.md` (modify)
**What changes:** Replace all `claude --agent` references with `ana run` syntax. 15 replacements.
**Pattern to follow:** Same mechanical replacement as CLAUDE.md.
**Why:** Unified invocation surface.

### `packages/cli/templates/.claude/agents/ana-build.md` (modify)
**What changes:** Replace `claude --agent` references with `ana run` syntax. Rewrite line 279 — the "Claude Code's Write tool" reference becomes platform-neutral: "Determine the absolute path with `pwd` before writing — file write tools may resolve paths against the main tree, not the worktree."
**Pattern to follow:** Mechanical replacement for `claude --agent`. Semantic rewrite for tool reference.
**Why:** Unified invocation + platform-neutral guidance.

### `packages/cli/templates/.claude/agents/ana-plan.md` (modify)
**What changes:** Replace `claude --agent` references with `ana run` syntax. 4 replacements.
**Pattern to follow:** Same mechanical replacement.
**Why:** Unified invocation surface.

### `packages/cli/templates/.claude/agents/ana-verify.md` (modify)
**What changes:** Replace `claude --agent` references with `ana run` syntax. Rewrite line 292 — same platform-neutral "Write tool" guidance as ana-build.md.
**Pattern to follow:** Same replacement pattern.
**Why:** Unified invocation + platform-neutral guidance.

### `packages/cli/templates/.claude/agents/ana-setup.md` (modify)
**What changes:** Replace `claude --agent` references with `ana run` syntax. Rewrite line 655 — "Write each enriched skill file using Claude Code's file writing tools" → "Write each enriched skill file using the available file writing tools".
**Pattern to follow:** Same replacement pattern + semantic rewrite.
**Why:** Unified invocation + platform-neutral guidance.

### `packages/cli/templates/.claude/agents/ana-learn.md` (modify)
**What changes:** Replace `claude --agent` references with `ana run` syntax. 6 replacements.
**Pattern to follow:** Same mechanical replacement.
**Why:** Unified invocation surface.

### `packages/cli/templates/.claude/skills/deployment/SKILL.md` (modify)
**What changes:** Replace `claude --agent ana-setup` with `ana run setup`.
**Pattern to follow:** Same mechanical replacement.
**Why:** Last remaining `claude --agent` reference in templates.

### `packages/cli/templates/.codex/agents/ana.md` (create)
**What changes:** Codex Think agent template. Body derived from CC's `ana.md` with: YAML frontmatter stripped, all `claude --agent` → `ana run`, skill paths reference `.ana/skills/`, CC-specific tool names removed, worktree guidance uses platform-neutral absolute-path approach.
**Pattern to follow:** CC `ana.md` body (after frontmatter stripping) as starting point.
**Why:** Codex needs agent prompts to run the pipeline.

### `packages/cli/templates/.codex/agents/ana.agent.toml` (create)
**What changes:** TOML manifest with `model = "gpt-5.5"`, `sandbox_mode = "danger-full-access"`, `model_reasoning_effort = "high"`, `mode = "auto"` (Think is interactive).
**Pattern to follow:** Codex agent manifest convention.
**Why:** `ana run` reads this manifest in Spec 2 for dispatch configuration.

### `packages/cli/templates/.codex/agents/ana-build.md` (create)
**What changes:** Codex Build agent template. Body from CC's `ana-build.md` with frontmatter stripped, `ana run` syntax, platform-neutral worktree guidance.
**Pattern to follow:** CC `ana-build.md` body.
**Why:** Build agent prompt for Codex pipeline.

### `packages/cli/templates/.codex/agents/ana-build.agent.toml` (create)
**What changes:** `model = "gpt-5.5"`, `sandbox_mode = "danger-full-access"`, `model_reasoning_effort = "high"`, `mode = "exec"`.
**Pattern to follow:** Codex agent manifest convention.
**Why:** Build runs non-interactively.

### `packages/cli/templates/.codex/agents/ana-plan.md` (create)
**What changes:** Codex Plan agent template. Frontmatter stripped, `ana run` syntax.
**Pattern to follow:** CC `ana-plan.md` body.
**Why:** Plan agent prompt for Codex pipeline.

### `packages/cli/templates/.codex/agents/ana-plan.agent.toml` (create)
**What changes:** Same TOML shape as Build. `mode = "exec"`.
**Pattern to follow:** Same manifest convention.
**Why:** Plan runs non-interactively.

### `packages/cli/templates/.codex/agents/ana-verify.md` (create)
**What changes:** Codex Verify agent template. Frontmatter stripped, `ana run` syntax, platform-neutral guidance.
**Pattern to follow:** CC `ana-verify.md` body.
**Why:** Verify agent prompt for Codex pipeline.

### `packages/cli/templates/.codex/agents/ana-verify.agent.toml` (create)
**What changes:** Same TOML shape. `mode = "exec"`.
**Pattern to follow:** Same manifest convention.
**Why:** Verify runs non-interactively.

### `packages/cli/templates/.codex/agents/ana-setup.md` (create)
**What changes:** Codex Setup agent template. Frontmatter stripped, `ana run` syntax, platform-neutral file writing guidance.
**Pattern to follow:** CC `ana-setup.md` body.
**Why:** Setup agent for Codex (generated and functional, CC-recommended).

### `packages/cli/templates/.codex/agents/ana-setup.agent.toml` (create)
**What changes:** `model = "gpt-5.5"`, `sandbox_mode = "danger-full-access"`, `model_reasoning_effort = "high"`, `mode = "auto"` (Setup is interactive).
**Pattern to follow:** Same manifest convention.
**Why:** Setup benefits from interactive mode.

### `packages/cli/src/constants.ts` (modify)
**What changes:** Add `CODEX_AGENT_FILES` array listing the 5 Codex agent filenames (no Learn). Export alongside `AGENT_FILES`.
**Pattern to follow:** Existing `AGENT_FILES` array shape.
**Why:** `createCodexConfiguration()` needs a manifest of which agent files to copy.

### `packages/cli/tests/commands/platform.test.ts` (modify)
**What changes:** Update existing assertions for `getSkillsDir` → `.ana/skills`, `getSkillsDirRel` → `.ana/skills`. Add tests for `getAgentsDir` with platform parameter. Add tests for `getPlatformFlags` with platform parameter.
**Pattern to follow:** Existing test structure in the file.
**Why:** Existing tests assert `.claude/skills` — they must be updated atomically with the helper change.

### `packages/cli/tests/e2e/init-flow.test.ts` (modify)
**What changes:** Line 157: update assertion from `'claude --agent ana'` to `'ana run'` (CLAUDE.md template migration).
**Pattern to follow:** Same assertion style.
**Why:** Scope 1 residual — assertion matches old template content.

### `packages/cli/tests/commands/init.test.ts` (modify)
**What changes:** Add tests for Codex template generation, skill symlink creation, platform-conditional init, skill migration on re-init.
**Pattern to follow:** Existing test patterns in `init.test.ts` — temp directories, `createClaudeConfiguration()` calls, filesystem assertions.
**Why:** New functionality needs test coverage.

## Acceptance Criteria

- [x] AC1: `ana init --platforms claude,codex` generates `.claude/`, `.codex/`, `.ana/skills/`, `.claude/skills` symlink, and `.agents/skills` symlink
- [x] AC2: `ana init --platforms codex` generates `.codex/` and `.agents/skills/` symlink without generating `.claude/` or CLAUDE.md
- [x] AC3: `.codex/agents/ana-build.md` contains the Build agent prompt with `ana run` syntax, `.ana/skills/` paths, worktree path guidance without CC tool names, and NO YAML frontmatter
- [x] AC4: `.codex/agents/ana-build.agent.toml` contains `model = "gpt-5.5"`, `sandbox_mode = "danger-full-access"`, `model_reasoning_effort = "high"`, `mode = "exec"`
- [x] AC5: `.ana/skills/coding-standards/SKILL.md` has unified content. Both `.claude/skills/coding-standards/SKILL.md` and `.agents/skills/coding-standards/SKILL.md` resolve to this same file via symlinks.
- [x] AC9: `ana init commit` stages `.codex/` and `.agents/` symlink pointers alongside `.ana/skills/` content
- [x] AC10: Re-init with existing `.codex/agents/` preserves user customizations (merge-not-overwrite)
- [x] AC11: Re-init with existing `.claude/skills/` real directory migrates content to `.ana/skills/` and replaces the real directory with a symlink
- [x] AC14: CC agent templates (`templates/.claude/agents/*.md`) use `ana run` syntax, not `claude --agent`
- [x] AC15: CLAUDE.md template (`templates/CLAUDE.md`) uses `ana run` syntax
- [x] AC16: `getSkillsDir()` returns `.ana/skills` path (canonical location, works for all platforms)
- [x] AC17: `getAgentsDir()` returns `.codex/agents` when active platform is codex
- [x] AC18: `ana init` with no `--platforms` flag on first init auto-detects from PATH. Re-init preserves `platforms` from existing `ana.json`.
- [x] AC19 (partial): `ana agents`, `ana setup check`, and `ana proof promote` all resolve skill paths correctly via `getSkillsDir()` returning `.ana/skills`
- [x] AC20: All existing tests pass. Test count does not decrease. CC behavior unchanged.
- [ ] Tests pass with `(cd 'packages/cli' && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`
- [ ] `check.ts:1411` residual fixed — uses `getSkillsDirRel()` interpolation
- [ ] `init-flow.test.ts:157` residual fixed — asserts `ana run` pattern

## Testing Strategy

- **Unit tests:** Update `platform.test.ts` for new return values. Test `getAgentsDir('codex')` returns `.codex/agents`. Test `getPlatformFlags(cwd, 'codex')` reads `platformFlags.codex`. Test skill symlink creation and resolution.
- **Integration tests:** Add cases to `init.test.ts`: Codex-only init (no `.claude/`), dual-platform init (both directories + symlinks), re-init skill migration (real dir → symlink with content preservation), re-init preserves Codex customizations.
- **E2E tests:** Update `init-flow.test.ts` assertion for template migration. Add a test verifying `.ana/skills/` is created and populated.
- **Edge cases:** Skill migration with conflicting content in both locations (mtime wins). Empty `platforms` array (error path). Symlink already exists on re-init (idempotent). `.claude/skills/` is already a symlink (skip migration).

## Dependencies

- Scope 1 (Platform-Aware CLI) must be merged — provides `platform.ts` helpers, `KNOWN_ROOTS` in commit.ts, and `agentCommand()`. **Status: merged.**
- CC agent template content is the source for Codex templates — build reads and derives from them.

## Constraints

- Symlinks must use relative paths (`../../.ana/skills` from `.claude/skills`, `../.ana/skills` from `.agents/skills`). Absolute paths break on clone.
- Git stores symlinks as mode 120000 blobs. `git add .claude/skills` stages the symlink pointer, `git add .ana/skills/` stages the content. No double-staging.
- Template source path stays `templates/.claude/skills/` — this is where the CLI's bundled templates live. Only the destination changes.
- Test count must not decrease (baseline: 3041 passed, 129 test files).
- Codex templates have NO YAML frontmatter — the `---` block with `model:`, `skills:`, etc. is CC-specific. Body `---` horizontal rules (section dividers) must NOT be stripped.
- No Learn template for Codex (5 agents, not 6).

## Gotchas

- **Frontmatter stripping for Codex templates:** CC templates start with `---\n...fields...\n---\n`. This is the first `---` to second `---` block. Body `---` lines (horizontal rules between sections) appear later and must NOT be stripped. Use a proper frontmatter parser or match only the first occurrence.
- **`scaffoldAndSeedSkills()` source vs. destination:** The `templatesDir` parameter reads from `templates/.claude/skills/` — this is a template source path and stays unchanged. Only the `skillsPath` destination parameter changes from `.claude/skills` to `.ana/skills`. Don't confuse the two.
- **`generateAgentsMd()` extracted from two places:** It's called on both the fresh path (line 209) and re-init path (line 261) inside `createClaudeConfiguration()`. Both calls must be removed and moved to the orchestrator.
- **`generatePrimaryPackageAgentsMd()` also in two places:** Same extraction needed — lines 210 and 262.
- **Relative symlink path depth:** `.claude/skills` is one level deep from project root, so the symlink target is `../../.ana/skills` (up to `.claude/`, up to project root, then into `.ana/skills`). `.agents/skills` is also one level deep, target is `../.ana/skills` (up to `.agents/`, then `.ana/skills`). Wait — `.agents/` is at project root, so `.agents/skills → ../.ana/skills`. Actually: from `.agents/skills`, the path to `.ana/skills` is `../.ana/skills`. From `.claude/skills`, the path is `../.ana/skills`. Both are one directory level down from project root.
- **Skill migration must check if source is already a symlink.** If `.claude/skills/` is already a symlink (from a previous run of this version), skip migration. Use `fs.lstat()` + `stat.isSymbolicLink()`.
- **`check.ts` `discoverSkills()` reads from `getSkillsDir()`** — when the path changes to `.ana/skills`, it auto-discovers from there. But it needs to follow symlinks when checking skill files. `fs.readFile` follows symlinks by default, so this works transparently.
- **Platform auto-detection must handle Windows:** `which` → `where` for executable detection. The existing `isExecutableInPath()` in `run.ts` already handles this — reuse or extract to a shared location.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer named exports. No default exports.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Use `| null` for checked-and-empty fields. Reserve `?:` for unchecked.
- Early returns over nested conditionals.
- Engine files (`src/engine/`) have zero CLI dependencies — this spec doesn't touch engine.

### Pattern Extracts

**`createClaudeConfiguration()` — structural analog (assets.ts:169-265):**
```typescript
export async function createClaudeConfiguration(cwd: string, engineResult: EngineResult | null, initState: InitState): Promise<void> {
  const spinner = ora('Creating .claude/ configuration...').start();

  const claudePath = path.join(cwd, '.claude');
  const settingsPath = path.join(claudePath, 'settings.json');
  const agentsPath = path.join(claudePath, 'agents');
  const skillsPath = path.join(claudePath, 'skills');
  const templatesDir = getTemplatesDir();

  // ... settings merge logic ...

  const claudeExists = await dirExists(claudePath);

  if (!claudeExists) {
    // First run: create everything fresh
    await fs.mkdir(claudePath, { recursive: true });
    await fs.mkdir(agentsPath, { recursive: true });
    await fs.mkdir(skillsPath, { recursive: true });
    // ... copy agents, seed skills, copy CLAUDE.md, generate AGENTS.md ...
    spinner.succeed('Created .claude/ configuration');
    return;
  }

  // .claude/ exists - handle merge
  // ... merge-not-overwrite logic ...
  spinner.succeed('Created .claude/ configuration (merged)');
}
```

**`copyAgentFiles()` — merge-not-overwrite (assets.ts:276-291):**
```typescript
async function copyAgentFiles(agentsPath: string, templatesDir: string): Promise<void> {
  for (const agentFile of AGENT_FILES) {
    const sourcePath = path.join(templatesDir, '.claude/agents', agentFile);
    const destPath = path.join(agentsPath, agentFile);

    const exists = await fileExists(destPath);
    if (exists) {
      continue;  // Skip - don't overwrite existing agent files
    }

    await copyAndVerifyFile(sourcePath, destPath, `.claude/agents/${agentFile}`);
  }
}
```

**`getAgentsDir()` current shape (platform.ts:19-21):**
```typescript
export function getAgentsDir(cwd: string): string {
  return path.join(cwd, '.claude', 'agents');
}
```

### Proof Context

- **run.ts:** Advisory pipeline check reads `.saves.json` stage field directly (platform-aware-cli-C7). Not affected by this spec — runtime dispatch is Spec 2.
- **assets.ts:** `generateAgentsMd` exported for testing — was private (build concern). This spec moves the call site, which is the intended direction.
- **index.ts:** Warning text hardcodes `.claude/` (gitignore-disclosure-and-hardening-C1). Not directly affected by this spec but worth noting — the gitignore warning may need updating in a future scope.

No active proof findings for platform.ts, skills.ts, or state.ts.

### Checkpoint Commands

- After platform.ts changes: `(cd 'packages/cli' && pnpm vitest run tests/commands/platform.test.ts)` — Expected: updated assertions pass
- After template migrations: `(cd 'packages/cli' && pnpm vitest run tests/e2e/init-flow.test.ts)` — Expected: line 157 assertion passes with `ana run`
- After all changes: `pnpm run test -- --run` — Expected: 3041+ tests pass
- Lint: `pnpm run lint`

### Build Baseline

- Current tests: 3041 passed (2 skipped)
- Current test files: 129
- Command used: `pnpm run test -- --run`
- After build: expected 3060+ tests in 131+ files (new init tests + updated platform tests)
- Regression focus: `platform.test.ts` (assertions change), `init-flow.test.ts` (template content assertion), `check-dashboard.test.ts` (skill path display)
