# Spec: Template Propagation — Lock-Stock Refresh of Machine-Owned Templates on Re-init

**Created by:** AnaPlan
**Date:** 2026-06-05
**Scope:** .ana/plans/active/template-propagation/scope.md

## Approach

Re-init must propagate machine-owned **instruction content** to the install base, while never resetting a customer's **basic configuration**. The fix is a *refresh-by-class* rule, applied per harness:

- **INSTRUCTION class → refreshed wholesale (overwrite from stock):** the agent `.md` body (the operating-instruction prose) on both harnesses, all machine-owned frontmatter/metadata, and CLAUDE.md. This is what the disease froze; this is what must move.
- **CONFIG class → preserved silently (never reset, never warned):** Claude `.md` frontmatter `model` (and `tools` if present); Codex `.agent.toml` `model`, `sandbox_mode`, `model_reasoning_effort`. These are settings, not customizations — they are not a git-recover concern.

This removes the cause (the conservative skip-if-exists) for exactly the instruction surface, rather than adding machinery to manage around it. Whole-file prose overwrite keeps us clear of the rejected section-ownership trap: the only field-level handling is the **structured config** (YAML frontmatter keys, flat TOML keys), which is tractable — parse, preserve the config keys, refresh the rest.

**Instruction surface — verified per harness (template content confirms it):**
- **Claude** reads operating instructions from the `.md` **body** (prose after the first `---` frontmatter pair). Overwriting the body propagates the `ana test` instruction. ✓
- **Codex** reads operating instructions from the `.md` **body**: each `.agent.toml` carries `developer_instructions = "Full instructions in <agent>.md. Invoke via: ana run"` — a pointer, not the instruction itself. Overwriting the `.md` body propagates the instruction. ✓ As belt-and-suspenders, the `.agent.toml` machine fields (`name`, `description`, `developer_instructions`) are *also* refreshed from stock, so even the pointer stays current — config-preservation cannot strand the instruction on either harness.

**Reuse, do not reinvent.** `src/utils/agent-config.ts` already provides `parseFrontmatter` and the format-preserving, body-safe `setFrontmatterField` — these are the exact tools for Claude config preservation. The `ana agents model` command already stores a customer's model override in the `.md` frontmatter `model:` key, so that key IS the canonical Claude config-preservation target. Codex `.agent.toml` is a flat `key = value` file (no nesting, no arrays) — a line-based key-preserving merge is the right tool (no new dependency).

**Warning design (content-gated consolidated — founder-selected).** On re-init, after computing each refreshed file's final content, compare the **instruction prose** against what was there before. Emit **one consolidated** warning listing only the files whose instruction content actually changed, with conditional wording that never claims the customer edited anything:

- Agent `.md`: compare existing **body** vs stock body (config-key merges are excluded, so a model-only change never triggers it).
- CLAUDE.md: compare existing content vs the **freshly-interpolated** output (not raw stock) — so the same project context produces no false positive.
- Codex `.agent.toml`: never participates in the warning (it carries config + machine metadata, no instruction prose).

The warning is stateless — **no hash manifest, no per-project state, nothing added to the preserve contract.** It fires only on a real instruction-content change and is silent on a no-op re-init. Warnings never block init.

**Atomic per-file writes.** Overwrites run post-swap, in the live tree (same structural position as `scaffoldAndSeedSkills`), outside the atomic `.ana/` rename — so per-file write atomicity is the guard. Write to a temp sibling in the destination directory, then `rename` over the target; verify content integrity (extend the existing SHA-256 check in `copyAndVerifyFile`). A crash mid-refresh leaves either the old file or the new file, never a truncated one.

**Nudge — verify and sharpen, don't rebuild.** The version-mismatch detection (`update-check.ts` `projectMismatch`) already fires; the rendered copy lives at `work.ts` `printNotifications`. Sharpen only that copy so a stale-version customer is told `ana init` refreshes templates. No new signal is exported (the capture feature chose marker-sealed arming; a currency signal would be a dead export).

**Out of scope (deferred, tracked):** AGENTS.md and the primary-package AGENTS.md stay skip-if-exists (they are *generated*, not copied — different refresh path). Keep the atomic-write + content-gated-warn scaffolding general so adding AGENTS.md later is cheap.

## Output Mockups

**Re-init that refreshed changed instruction content (warning fires):**
```
✔ Created .claude/ configuration (merged)
✔ Created .codex/ configuration (merged)

  Pipeline readiness:
    ⚠ Refreshed to v1.2.3 stock: ana-build.md, CLAUDE.md
      If you customized these, recover your version from git
      (e.g. git log -- .claude/agents/ana-build.md)
```

**Re-init with no instruction changes (silent — no warning):**
```
✔ Created .claude/ configuration (merged)
✔ Created .codex/ configuration (merged)
```
(A customer who only changed their model via `ana agents model` sees no warning — config is preserved, not "changed".)

**Sharpened version nudge (e.g. on `ana work status`):**
```
ℹ Project initialized with v1.1.0 (current CLI: v1.2.3).
  Run: ana init to refresh agent templates & CLAUDE.md to the current version.
```

## File Changes

### packages/cli/src/commands/init/assets.ts (modify)
**What changes:**
- Add an atomic write helper (temp sibling in the destination dir → `rename` → SHA-256 integrity verify). Factor it so `copyAndVerifyFile` and the new content-based overwrites share the integrity + atomicity guarantee. The new helper takes a destination path + a content string (the overwrites compute content in memory before writing).
- `copyAgentFiles(agentsPath, templatesDir)` — return `Promise<string[]>` (changed filenames). Remove skip-if-exists. For each agent `.md`: read stock; if a destination exists, parse its frontmatter (`parseFrontmatter`) and carry forward each CONFIG key present (`CLAUDE_AGENT_CONFIG_KEYS`) onto the stock content via `setFrontmatterField`; compare existing body vs stock body and record the filename if the body differs; atomic-write the merged content. Fresh path (no existing file) writes stock with no warning.
- `copyClaudeMd(cwd, templatesDir, engineResult)` — return `Promise<string | null>`. Remove the early-return-if-exists. Build the interpolated content (project name + stack, as today); atomic-write it always; return `'CLAUDE.md'` if a prior file existed and differed from the interpolated content, else `null`. CLAUDE.md has no config keys to preserve.
- `copyCodexAgentFiles(agentsPath, templatesDir)` — return `Promise<string[]>`. For each `.md`: overwrite wholesale (no frontmatter), atomic-write, record changed filename if a prior file differed. For each `.agent.toml`: read stock + existing; preserve `CODEX_AGENT_CONFIG_KEYS` values from the existing file onto the stock toml (line-based merge helper); refresh all other keys from stock; atomic-write always. The `.toml` never contributes to the changed-files list.
- `createClaudeConfiguration(...)` — return `Promise<string[]>`: aggregate `copyAgentFiles` results and the `copyClaudeMd` result; return the combined changed-file list. Update both the fresh and the merge branches to capture/return.
- `createCodexConfiguration(...)` — return `Promise<string[]>`: return `copyCodexAgentFiles` results.
- Update the JSDoc on the changed functions (re-init now overwrites instruction content; config preserved). Keep `generateAgentsMd` / primary-package AGENTS.md skip-if-exists untouched.
**Pattern to follow:** structural position and per-file shape of `scaffoldAndSeedSkills` (`skills.ts`), minus its section-merge; SHA-256 integrity from existing `copyAndVerifyFile`; frontmatter handling via `agent-config.ts`.
**Why:** this is the propagation fix — without overwriting the instruction body the install base never receives template updates.

### packages/cli/src/utils/agent-config.ts (modify)
**What changes:** add two pure, tested helpers:
- `stripFrontmatter(content): string` — return the body (everything after the first `---` pair; if no frontmatter, return content unchanged). Used for body-vs-body warning comparison. Mirror the anchored first-`---`-pair regex already used by `parseFrontmatter`/`setFrontmatterField` so body `---` rules are never mistaken for frontmatter.
- A flat-TOML config-preserving merge, e.g. `preserveTomlConfigKeys(stockToml, existingToml, configKeys): string` — for each `configKeys` entry present as a `key = value` line in `existingToml`, substitute that line's value into the corresponding line of `stockToml`; all other lines come from stock. Line-based, format-preserving, no dependency. Keys absent from the existing file keep the stock value.
**Pattern to follow:** the existing line-based, body-safe field operations in this file (`setFrontmatterField`/`removeFrontmatterField`).
**Why:** keeps parsing logic pure and unit-tested in one place; assets.ts stays I/O-only.

### packages/cli/src/constants.ts (modify)
**What changes:** add `CLAUDE_AGENT_CONFIG_KEYS` (`['model', 'tools']`) and `CODEX_AGENT_CONFIG_KEYS` (`['model', 'sandbox_mode', 'model_reasoning_effort']`), near `AGENT_FILES`/`CODEX_AGENT_FILES`. These define the CONFIG class that is preserved on re-init.
**Why:** single source of truth for the preserve-vs-refresh classification; referenced by assets.ts and tests.

### packages/cli/src/commands/init/index.ts (modify)
**What changes:** capture the `string[]` returned by `createClaudeConfiguration` and `createCodexConfiguration` (post-swap call sites, ~`:163-168`). If any files changed, build ONE consolidated warning string and push it onto `preflight.warnings` before the existing `displaySuccessMessage(..., preflight.warnings)` call (`:196`). First line: `Refreshed to v${cliVersion} stock: ${changed.join(', ')}`; following lines: the conditional git-recovery guidance. Obtain `cliVersion` via the same version helper `preflight.ts` uses (`getCliVersion`).
**Pattern to follow:** the existing `warnings`-array → `displaySuccessMessage` flow (warnings render as `⚠ <line0>` + indented gray continuation lines in `state.ts:1052-1063`).
**Why:** surfaces the overwrite through the established init output channel without a new mechanism.

### packages/cli/src/commands/work.ts (modify)
**What changes:** in `printNotifications`, sharpen the `projectMismatch` copy (~`:300-303`) so it tells the stale-version customer that `ana init` **refreshes agent templates & CLAUDE.md** to the current version. Keep it a single `ℹ` line family; do not change the detection.
**Why:** AC7 — the propagation path needs the nudge to reliably point a stale customer at the refresh.

### website/content/docs/guides/configurability.mdx (modify)
**What changes:**
- `~:141-145` ("Agent templates") — reverse the promise: agent `.md` instruction bodies and CLAUDE.md are **overwritten** from the current stock on `ana init`; your edits are recoverable via git; init warns when an overwritten file had changed content. State clearly that **basic config is preserved** — Claude frontmatter `model`/`tools` and Codex `.agent.toml` `model`/`sandbox_mode`/`model_reasoning_effort` are never reset.
- "What survives re-init" lists (~:209-229) — move agent files and CLAUDE.md from **Preserved** to **Refreshed** (instruction content); add a Preserved line for agent **basic config** (model/tools, model/sandbox/reasoning). Keep AGENTS.md under Preserved (still skip-if-exists). Keep the existing pipeline-assumptions Callout.
- Use `&apos;` for apostrophes in JSX text (lint rule).
**Why:** AC8 — the central product risk is a reversed documented promise; docs must lead, not lag.

### CHANGELOG.md (modify)
**What changes:** add an entry recording the behavior reversal: re-init now overwrites agent instruction bodies and CLAUDE.md from stock (recover prior versions via git); agent basic-config (model/sandbox/reasoning/tools) is preserved; Codex `.agent.toml` user settings preserved. Flag it as a behavior change for customers who relied on edit-persistence.
**Pattern to follow:** the existing entry format already in the file.
**Why:** AC8 — loud, customer-facing record of the reversal.

### packages/cli/tests/commands/init.test.ts (modify)
**What changes:** flip the existing `merge-not-overwrite preserves existing Codex agent customizations` test (~:894). It must now assert the OPPOSITE for instruction content (a customized Codex `ana-build.md` body IS overwritten with stock) WHILE asserting a customized `ana-build.agent.toml` `model`/`sandbox_mode`/`model_reasoning_effort` IS preserved. Drive it through the real `copyCodexAgentFiles` (not an inline re-implementation of the old skip logic). Audit nearby tests (e.g. the Claude `re-init does not duplicate agent files` test ~:229) for any other encoding of the old preserve promise and update.
**Why:** these tests currently encode the reversed promise and will otherwise lie.

### packages/cli/tests/commands/init/template-propagation.test.ts (create)
**What changes:** focused coverage for the new behavior (see Testing Strategy). House the preserve-contract regression guard, overwrite/preserve-by-class tests, atomic-write test, and warning tests here.
**Pattern to follow:** `tests/commands/skill-seeding.test.ts` (mkdtemp project + git init + run built CLI) for integration; direct function calls for unit-level (init.test.ts style).

### packages/cli/tests/utils/agent-config.test.ts (modify)
**What changes:** add unit tests for `stripFrontmatter` (frontmatter present / absent / body `---` rules untouched) and the TOML config-preserve merge (preserves listed keys, refreshes others, handles keys missing from the existing file).
**Why:** the pure helpers are the load-bearing logic; test them directly.

## Acceptance Criteria

- [ ] **AC1:** Re-init overwrites all six agent `.md` instruction bodies from each harness tree's own stock, unconditionally — skip-if-exists removed for these files. Both `.claude` and `.codex` trees refresh; each from its OWN tree's stock (`ana-learn.md` per-harness divergence preserved; never cross-written). Codex `.agent.toml` `model`/`sandbox_mode`/`model_reasoning_effort` and Claude frontmatter `model`/`tools` are PRESERVED (config class), never reset. Codex `.agent.toml` machine fields (`name`/`description`/`developer_instructions`) refresh from stock.
- [ ] **AC2:** CLAUDE.md is overwritten from stock on re-init, re-applying project-name and stack interpolation from the current scan. AGENTS.md and the primary-package AGENTS.md remain skip-if-exists (deferred follow-up).
- [ ] **AC3:** Every overwrite is an atomic per-file write (temp-then-rename) with post-write integrity verification; a crash mid-refresh never leaves a half-written or truncated file in the live tree.
- [ ] **AC4:** Content-gated consolidated warning: re-init emits ONE warning listing only the files whose instruction content actually changed, with conditional "if you customized these, recover from git" wording (never asserts the customer edited). Compares agent `.md` body vs stock body and CLAUDE.md vs freshly-interpolated output (NOT raw stock — no false positive on CLAUDE.md). A config-only change (e.g. model) produces no warning. No per-project state, no hash manifest. Warnings never block init.
- [ ] **AC5:** Surgically scoped — no other preserved content regresses. `context/`, `plans/active/`, `plans/completed/`, `proof_chain.json` + `PROOF_CHAIN.md`, `learn/`, `skills/` (Rules/Gotchas/Examples), and ana.json user fields all survive re-init unchanged. A regression test asserts the full preserve contract.
- [ ] **AC6:** Fresh install is unchanged — nothing overwritten, no warning fires. Claude-only projects (no `.codex` tree) refresh only the trees present.
- [ ] **AC7:** The `update-check.ts` `projectMismatch` nudge reliably tells a stale-version customer to run `ana init`, with copy conveying that re-init refreshes templates. Detection unchanged; only the rendered copy (`work.ts`) is sharpened.
- [ ] **AC8:** `configurability.mdx` no longer promises agent-file edits persist; it documents that re-init overwrites agent `.md` bodies and CLAUDE.md (warns on changed files, recover via git) while basic config is preserved; the survive-re-init lists are corrected. CHANGELOG records the reversal.
- [ ] All new/changed tests pass; full suite `(cd packages/cli && pnpm vitest run)` stays green and test count does not decrease (baseline 3236).
- [ ] `pnpm run lint` clean; `tsc --noEmit` clean (pre-commit gate).

## Testing Strategy

- **Unit (`agent-config.test.ts`):** `stripFrontmatter` (with/without frontmatter; body `---` rules preserved); TOML config-preserve merge (listed keys preserved, others refreshed, missing-key falls back to stock).
- **Integration (`template-propagation.test.ts`):** build a temp project, run the built CLI `init --force` once, mutate files, run `init --force` again, assert outcomes:
  - Claude agent `.md` with an edited body → body reset to stock; a `model:` set via frontmatter → preserved. Codex `.md` body reset; `.agent.toml` config keys preserved, machine fields refreshed.
  - `ana-learn.md` refreshed from its own harness stock in each tree (Claude vs Codex bodies differ post-refresh).
  - CLAUDE.md refreshed and re-interpolated (project name + stack present); AGENTS.md untouched.
  - Atomic write: after a refresh, no temp/partial files remain in the agents dir, and the written content matches intended (integrity).
  - Warning: fires and lists exactly the changed files when a body was edited; silent on a clean re-init; silent when only `model` changed; CLAUDE.md with unchanged project context produces no warning; init exits 0 regardless.
  - Fresh install: no warning. Claude-only project: `.codex` never created/touched.
  - **Preserve-contract regression guard (AC5 — load-bearing):** seed `context/`, a completed plan, an active plan, proof chain files, `learn/state.json`, customized skill Rules/Gotchas/Examples, and ana.json user fields; after re-init assert every one survives byte-for-byte (model the existing `re-init preserves learn state.json` / `re-init refreshes metadata fields` tests at init.test.ts:612+).
- **Copy assertion (`work.ts`):** the sharpened nudge copy contains `ana init` and conveys template refresh.
- **Docs/changelog:** assert `configurability.mdx` no longer contains the edit-persistence promise and documents overwrite + preserved-config; assert CHANGELOG contains the reversal entry.
- **Edge cases:** first re-init after this ships (no prior baseline) → behaves as a normal content-gated refresh, warn-only safe; partial install (`.claude` present, `.ana` missing) follows the same overwrite path.

## Dependencies
None new. Reuses `agent-config.ts`, `constants.ts`, the existing `warnings` channel, and `getCliVersion`. No new npm dependency (TOML merge is line-based).

## Constraints
- Surgical scope: only agent `.md` bodies + CLAUDE.md become overwrite-always; every other preserved item is untouched (AC5).
- Per-harness stock only — never cross-write bodies between `.claude` and `.codex`.
- Config class is never reset and never warned (it is settings, not customization).
- Backward-compatible behavior reversal — recovery path is git; surfaced via warning + docs + changelog.
- Type-clean (`tsc --noEmit`) and lint-clean; explicit return types on the now-returning exported functions; `.js` import extensions; `import type` for type-only imports.

## Gotchas
- **Templates vs dogfood:** edit `templates/.claude/agents/*` and `templates/.codex/agents/*` (the product). Do NOT touch the repo-root `.claude`/`.codex` dogfood.
- **Don't strand the instruction:** config preservation must touch only the structured config keys, never the `.md` body. Refresh the Codex `.agent.toml` machine fields too, so the instruction can't be stranded behind a stale pointer.
- **CLAUDE.md is interpolated:** never compare it against the RAW stock template for the warning (false-positive every re-init). Compare against the freshly-interpolated output you are about to write.
- **Codex `.agent.toml` is NOT instruction content:** preserve config keys; refresh machine keys; never include it in the changed-files warning.
- **Atomicity is per-file, post-swap:** overwrites land in the live tree outside the `.ana/` rename; temp-then-rename in the destination directory is the guard.
- **Frontmatter regex is anchored to the first `---` pair:** reuse `agent-config.ts` helpers so body `---` horizontal rules are never parsed as frontmatter.
- **Pre-commit runs `tsc --noEmit` (build uses SWC):** thread the new return types fully or the hook fails even when the build passes.
- **Test count must not decrease** (baseline 3236; CI is 3 OS × 2 Node).

## Build Brief

### Rules That Apply
- All relative imports end in `.js`; `node:` prefix for built-ins. Omitting `.js` compiles but crashes the built ESM CLI.
- `import type` for type-only imports, separate from value imports.
- Explicit return types on all exported functions (the now-returning `create*Configuration`/`copy*` functions).
- Exported functions need `@param`/`@returns` JSDoc — pre-commit eslint rejects missing tags.
- Engine purity rule does NOT apply here (this is `src/commands/` + `src/utils/`); chalk/ora are fine in the command layer. Keep `agent-config.ts` helpers pure (string in / string out, no I/O) — I/O stays in assets.ts.
- Avoid `any`; narrow `unknown`. Use `| null` for checked-empty returns (e.g. `copyClaudeMd` returns `string | null`).
- In `configurability.mdx` JSX text, write apostrophes as `&apos;`.

### Pattern Extracts

Format-preserving frontmatter field set (reuse for Claude config preservation) — `src/utils/agent-config.ts`:
```ts
export function setFrontmatterField(content: string, key: string, value: string): string | null {
  const match = content.match(/^(---\s*\n)([\s\S]*?)(\n---)/);
  if (!match) return null;
  const opener = match[1] ?? '', block = match[2] ?? '', closer = match[3] ?? '';
  const rest = content.slice(match[0].length);
  const fieldRegex = new RegExp(`^(${key}:\\s*)(.*)$`, 'm');
  const newBlock = block.match(fieldRegex) ? block.replace(fieldRegex, `${key}: ${value}`) : block + `\n${key}: ${value}`;
  return opener + newBlock + closer + rest;
}
```

Existing SHA-256 integrity copy to extend into an atomic content-write — `assets.ts:130-155`:
```ts
async function copyAndVerifyFile(sourcePath: string, destPath: string, fileName: string): Promise<void> {
  const sourceContent = await fs.readFile(sourcePath);
  const sourceHash = createHash('sha256').update(sourceContent).digest('hex');
  await fs.copyFile(sourcePath, destPath);
  const destContent = await fs.readFile(destPath);
  const destHash = createHash('sha256').update(destContent).digest('hex');
  if (sourceHash !== destHash) throw new Error(`File integrity check failed: ${fileName}...`);
}
```

Current skip-if-exists to REMOVE (Claude) — `assets.ts:258-273`:
```ts
async function copyAgentFiles(agentsPath: string, templatesDir: string): Promise<void> {
  for (const agentFile of AGENT_FILES) {
    const sourcePath = path.join(templatesDir, '.claude/agents', agentFile);
    const destPath = path.join(agentsPath, agentFile);
    const exists = await fileExists(destPath);
    if (exists) continue;                 // <-- remove; overwrite with config-preserving merge
    await copyAndVerifyFile(sourcePath, destPath, `.claude/agents/${agentFile}`);
  }
}
```

Codex copy — keep `.toml` config-preserving, overwrite `.md` — `assets.ts:612-630`:
```ts
async function copyCodexAgentFiles(agentsPath: string, templatesDir: string): Promise<void> {
  for (const agentFile of CODEX_AGENT_FILES) {
    const mdDest = path.join(agentsPath, agentFile);
    if (!(await fileExists(mdDest))) { await copyAndVerifyFile(/* .md */); }  // <-- overwrite always; warn on body change
    const tomlDest = path.join(agentsPath, `${agentFile.replace('.md','')}.agent.toml`);
    if (!(await fileExists(tomlDest))) { await copyAndVerifyFile(/* .toml */); } // <-- refresh machine keys, preserve config keys
  }
}
```

Warnings channel (push into `preflight.warnings`; rendered in `state.ts:1052-1063`):
```ts
displaySuccessMessage(engineResult, projectName, scanTime, mergedConfig ?? newAnaConfig, preflight.warnings);
```

Codex `.agent.toml` shape (config keys to preserve are the last three):
```toml
name = "ana-build"
description = "AnaBuild — reads spec, produces working code, tests, and build report."
developer_instructions = "Full instructions in ana-build.md. Invoke via: ana run"
model = "gpt-5.5"
sandbox_mode = "danger-full-access"
model_reasoning_effort = "high"
```

Claude `.md` frontmatter shape (config key to preserve is `model`; `tools` if present):
```yaml
---
name: ana-build
model: opus[1m]
description: "AnaBuild — ..."
skills: [git-workflow]
---
```

Current nudge copy to sharpen — `work.ts` `printNotifications` (~:300-303):
```ts
if (output.projectMismatch) {
  console.log(chalk.gray(
    `ℹ Project initialized with v${output.projectMismatch.projectVersion} (current CLI: v${output.projectMismatch.cliVersion}). Run: ana init`
  ));
}
```

### Proof Context
Run `ana proof context <file>` for assets.ts, index.ts, agent-config.ts, work.ts, and configurability.mdx before building, and fold any blocker/observation findings into the relevant change. If none are active, state "No active proof findings for affected files." in the build report.

### Checkpoint Commands
- After assets.ts + agent-config.ts + constants.ts changes: `(cd packages/cli && pnpm vitest run tests/utils/agent-config.test.ts tests/commands/init.test.ts)` — Expected: green, including the flipped :894 test.
- After the new test file: `(cd packages/cli && pnpm vitest run tests/commands/init/template-propagation.test.ts)` — Expected: all new cases pass.
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 132 files, ≥3236 tests, 0 failures.
- Lint: `(cd packages/cli && pnpm run lint)` — Expected: clean. Website docs lint: `(cd website && pnpm run lint)`.

### Build Baseline
- Current tests: **3236** (3234 passed, 2 skipped)
- Current test files: **132**
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected **3236 + new** tests across **133** files (new `template-propagation.test.ts` plus additions to `agent-config.test.ts` and `init.test.ts`; the flipped :894 test stays one test, repurposed).
- Regression focus: `tests/commands/init.test.ts` (preserve-behavior tests, the flipped :894 test), `tests/commands/skill-seeding.test.ts`, `tests/commands/platform.test.ts`, and any `agents` model-management tests that read frontmatter.
