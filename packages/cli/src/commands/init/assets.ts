/**
 * Asset scaffolding for ana init — everything that writes files or
 * directories.
 *
 * This is the widest module in the split (~500 lines). It orchestrates
 * the file-generation phase of init:
 *
 * - createDirectoryStructure: bootstrap .ana/ sub-dirs in the tmp work
 *   area before atomic rename
 * - generateScaffolds: project-context.md + design-principles.md from
 *   scan data (scaffold-generators.ts templates)
 * - atomicWriteFile: temp-then-rename write with SHA-256 integrity verify
 *   (shared by every file init writes into the live tree)
 * - createClaudeConfiguration: the .claude/ tree (agents, skills,
 *   settings.json) — delegates skill copies to skills.scaffoldAndSeedSkills
 * - copyAgentFiles: .claude/agents/*.md — refresh instruction body from
 *   stock on re-init, preserving CONFIG-class frontmatter keys
 * - copyClaudeMd + generateAgentsMd: the cross-tool CLAUDE.md and
 *   AGENTS.md entry points at the project root
 * - mergeHooksSettings + hookEntryMatches: dedup-safe merge of our hooks
 *   into an existing .claude/settings.json
 *
 * Entry points called from index.ts are exported; copyAgentFiles and
 * copyCodexAgentFiles are also exported for direct unit testing of the
 * refresh-by-class behavior. Remaining helpers (copyClaudeMd,
 * atomicWriteFile, hook merge helpers) stay internal.
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { EngineResult } from '../../engine/types/engineResult.js';
import { createEmptyEngineResult } from '../../engine/types/engineResult.js';
import { getProjectName } from '../../utils/validators.js';
import {
  generateProjectContextScaffold,
  generateDesignPrinciplesTemplate,
} from '../../utils/scaffold-generators.js';
import {
  CLAUDE_AGENT_CONFIG_KEYS,
  CODEX_AGENT_CONFIG_KEYS,
  getStackSummary,
} from '../../constants.js';
import {
  parseFrontmatter,
  setFrontmatterField,
  stripFrontmatter,
  preserveTomlConfigKeys,
} from '../../utils/agent-config.js';
import {
  resolveAgentSkills,
  resolveAgentRoster,
  BUILTIN_AGENT_ROSTER,
} from '../../manifest.js';
import { resolvePlatformDescriptor } from '../../platforms/registry.js';
import type { InitState } from './types.js';
import { dirExists, fileExists } from './preflight.js';
import { getTemplatesDir, makeTestCommandNonInteractive } from './state.js';
import {
  mergeGitignore,
  ANA_GITIGNORE_STOCK,
  CLAUDE_GITIGNORE_STOCK,
  CODEX_GITIGNORE_STOCK,
} from './gitignore.js';
// scaffoldAndSeedSkills is now called from the init orchestrator (index.ts)
import { getPatternLibrary } from '../../engine/types/patterns.js';

/**
 * Phase 3: Create directory structure
 *
 * Creates all required directories for .ana/ framework:
 * - context/
 * - plans/active/, plans/completed/
 * - state/
 *
 * Step files, framework-snippets, and docs directories removed — they had
 * drifted vs. the agent definitions; agent files in templates/.claude/agents/
 * are the spec.
 *
 * @param tmpAnaPath - Path to temp .ana/ directory
 */
export async function createDirectoryStructure(tmpAnaPath: string): Promise<void> {
  const spinner = ora('Creating directory structure...').start();

  // Create directories (recursive: true creates parents)
  await fs.mkdir(path.join(tmpAnaPath, 'context'), { recursive: true });
  await fs.mkdir(path.join(tmpAnaPath, 'plans/active'), { recursive: true });
  await fs.mkdir(path.join(tmpAnaPath, 'plans/completed'), { recursive: true });
  await fs.mkdir(path.join(tmpAnaPath, 'state'), { recursive: true });
  await fs.mkdir(path.join(tmpAnaPath, 'learn'), { recursive: true });

  // Seed learn state file
  await fs.writeFile(
    path.join(tmpAnaPath, 'learn', 'state.json'),
    JSON.stringify({ last_session_at: null }, null, 2),
    'utf-8',
  );

  // Create .gitkeep files for empty plan directories
  await fs.writeFile(path.join(tmpAnaPath, 'plans/active/.gitkeep'), '', 'utf-8');
  await fs.writeFile(path.join(tmpAnaPath, 'plans/completed/.gitkeep'), '', 'utf-8');

  // Create the managed .gitignore for runtime state files. Block-only here
  // (no existing user content in the fresh temp tree); on re-init
  // preserveUserState re-merges the OLD live .gitignore's user lines into this
  // temp file before the atomic swap. Plain writeFile — temp tree, swapped
  // atomically later.
  await fs.writeFile(
    path.join(tmpAnaPath, '.gitignore'),
    mergeGitignore(null, ANA_GITIGNORE_STOCK),
    'utf-8',
  );

  spinner.succeed('Directory structure created');
}

/**
 * Phase 5: Generate context scaffolds
 *
 * Writes 2 context files:
 * - project-context.md: scan-seeded format with 6 sections
 * - design-principles.md: static human-content template
 *
 * @param tmpAnaPath - Temp .ana/ path
 * @param engineResult - Engine result or null
 */
export async function generateScaffolds(
  tmpAnaPath: string,
  engineResult: EngineResult | null,
): Promise<void> {
  const spinner = ora('Generating context scaffolds...').start();

  // Use empty result if analyzer failed
  const analysis = engineResult || createEmptyEngineResult();

  // Generate 2 context files
  const projectContext = generateProjectContextScaffold(analysis);
  const designPrinciples = generateDesignPrinciplesTemplate();

  await fs.writeFile(path.join(tmpAnaPath, 'context', 'project-context.md'), projectContext, 'utf-8');
  await fs.writeFile(path.join(tmpAnaPath, 'context', 'design-principles.md'), designPrinciples, 'utf-8');

  const totalLines = projectContext.split('\n').length + designPrinciples.split('\n').length;
  spinner.succeed(`Generated 2 context scaffolds (${totalLines} lines total)`);
}

/**
 * Atomically write content to a destination with SHA-256 integrity verification.
 *
 * Writes to a temp sibling in the destination directory, verifies the written
 * bytes hash to the expected content, then renames over the target. A crash
 * mid-write leaves either the old file or the new file — never a truncated one.
 * On any failure the temp file is removed and the error re-thrown.
 *
 * This is the shared integrity + atomicity guarantee for every file init
 * writes into the live tree (fresh copies and re-init overwrites alike).
 *
 * @param destPath - Destination file path
 * @param content - Full file content to write
 * @param fileName - Display name for errors
 */
export async function atomicWriteFile(
  destPath: string,
  content: string,
  fileName: string
): Promise<void> {
  const dir = path.dirname(destPath);
  const tmpPath = path.join(dir, `.${path.basename(destPath)}.tmp-${process.pid}-${Date.now()}`);
  const expectedHash = createHash('sha256').update(content, 'utf-8').digest('hex');

  try {
    await fs.writeFile(tmpPath, content, 'utf-8');

    // Verify the temp file's bytes before swapping it into place
    const written = await fs.readFile(tmpPath);
    const writtenHash = createHash('sha256').update(written).digest('hex');
    if (writtenHash !== expectedHash) {
      throw new Error(
        `File integrity check failed: ${fileName}\n` +
          `Expected: ${expectedHash}\n` +
          `Got: ${writtenHash}\n` +
          'File may be corrupted during write.'
      );
    }

    // Atomic swap — same directory, same filesystem
    await fs.rename(tmpPath, destPath);
  } catch (err) {
    // Never leave a temp/partial file behind
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
}

/**
 * Read an existing live-tree `.gitignore` (if present), merge our managed
 * block via mergeGitignore, and write the result atomically.
 *
 * Used for the in-place `.claude/` and `.codex/` writes. The `.ana/` surface
 * is handled separately — its merge runs pre-swap in preserveUserState because
 * only that path can read the OLD `.ana/.gitignore` before the atomic swap.
 *
 * @param gitignorePath - Absolute path to the surface's `.gitignore`
 * @param stockBlock - Raw stock lines for this surface (no sentinels)
 * @param displayName - Display name for integrity-check errors
 */
async function mergeAndWriteGitignore(
  gitignorePath: string,
  stockBlock: string,
  displayName: string,
): Promise<void> {
  let existing: string | null = null;
  try {
    existing = await fs.readFile(gitignorePath, 'utf-8');
  } catch {
    // No existing .gitignore — merge from null (block-only output).
  }
  await atomicWriteFile(gitignorePath, mergeGitignore(existing, stockBlock), displayName);
}

/**
 * Create .claude/ configuration
 *
 * Creates .claude/ directory with settings.json, agents/ directory, agent files,
 * skills directories, and CLAUDE.md at project root.
 * If .claude/ already exists, merges our hooks into existing settings.json.
 * On re-init the agent instruction bodies and CLAUDE.md are refreshed wholesale
 * from stock (config keys preserved); the returned list names the files whose
 * instruction content actually changed, for the consolidated refresh warning.
 *
 * @param cwd - Project root directory
 * @param engineResult - Engine result for skill seeding (null if skipped)
 * @param _initState - Installation state (unused — skills scaffolding moved to orchestrator)
 * @param anaJson - Parsed ana.json driving per-agent skill projection (absent = today; stock)
 * @returns Filenames whose instruction content changed (empty on a fresh install or no-op re-init)
 */
export async function createClaudeConfiguration(cwd: string, engineResult: EngineResult | null, _initState: InitState, anaJson: unknown = {}): Promise<string[]> {
  const spinner = ora('Creating .claude/ configuration...').start();

  const claudePath = path.join(cwd, '.claude');
  const settingsPath = path.join(claudePath, 'settings.json');
  const agentsPath = path.join(claudePath, 'agents');
  const templatesDir = getTemplatesDir();

  // Load our template settings
  const templateSettingsPath = path.join(templatesDir, '.claude/settings.json');
  const templateContent = await fs.readFile(templateSettingsPath, 'utf-8');
  const templateSettings = JSON.parse(templateContent);

  // Capture hooks are ALWAYS installed; the `processCapture` flag in ana.json is
  // the single RUNTIME switch — `ana _capture` reads the flag and no-ops when it
  // is off. This makes the flag a live toggle (flip on/off with no re-init) and
  // removes the flag↔hook desync of the prior install-time gating.
  injectCaptureHook(templateSettings);

  const claudeExists = await dirExists(claudePath);

  // Merge (not clobber) the .gitignore for per-developer state on every run.
  // Our managed block regenerates from stock; any user lines are preserved.
  // Routed through atomicWriteFile — it's an in-place live-tree write.
  const claudeGitignorePath = path.join(claudePath, '.gitignore');

  const changed: string[] = [];

  if (!claudeExists) {
    // First run: create everything fresh
    await fs.mkdir(claudePath, { recursive: true });
    await fs.mkdir(agentsPath, { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(templateSettings, null, 2), 'utf-8');
    await mergeAndWriteGitignore(claudeGitignorePath, CLAUDE_GITIGNORE_STOCK, '.claude/.gitignore');

    // Copy all agent files (fresh — never reports changes)
    changed.push(...await copyAgentFiles(agentsPath, templatesDir, anaJson));

    // Copy CLAUDE.md to project root (fresh — never reports a change)
    const claudeMdChanged = await copyClaudeMd(cwd, templatesDir, engineResult);
    if (claudeMdChanged) changed.push(claudeMdChanged);

    spinner.succeed('Created .claude/ configuration');
    return changed;
  }

  // .claude/ exists - handle merge
  // Merge .gitignore — regenerate our managed block, preserve user lines.
  await mergeAndWriteGitignore(claudeGitignorePath, CLAUDE_GITIGNORE_STOCK, '.claude/.gitignore');

  const settingsExists = await fileExists(settingsPath);

  if (!settingsExists) {
    // settings.json doesn't exist - create it
    await fs.writeFile(settingsPath, JSON.stringify(templateSettings, null, 2), 'utf-8');
  } else {
    // settings.json exists - try to merge our hooks
    try {
      const existingContent = await fs.readFile(settingsPath, 'utf-8');
      const existingSettings = JSON.parse(existingContent);
      // Targeted prune of the retired SessionEnd derive hook. Legacy installs
      // shipped it and PR #291 deleted the prune path, so an upgraded install
      // would otherwise keep a stale `ana _capture --derive` hook forever. Remove
      // it mechanically — keying on the exact command, never a user-authored hook.
      pruneHookCommand(existingSettings.hooks, CAPTURE_END_EVENT_CLAUDE, CAPTURE_DERIVE_COMMAND);
      // mergeHooksSettings is dedup-safe and adds the always-installed capture
      // hook idempotently while preserving user-authored hooks. The flag is the
      // runtime switch, so the SessionStart hook is never flip-off pruned.
      const mergedSettings = mergeHooksSettings(existingSettings, templateSettings);
      await fs.writeFile(settingsPath, JSON.stringify(mergedSettings, null, 2), 'utf-8');
    } catch {
      // Malformed JSON - warn and overwrite with our defaults
      console.log(
        chalk.yellow('\n  Warning: existing .claude/settings.json is malformed, overwriting with Anatomia defaults')
      );
      await fs.writeFile(settingsPath, JSON.stringify(templateSettings, null, 2), 'utf-8');
    }
  }

  // Create agents/ if it doesn't exist
  const agentsExists = await dirExists(agentsPath);
  if (!agentsExists) {
    await fs.mkdir(agentsPath, { recursive: true });
  }

  // Refresh agent instruction bodies from stock (config keys preserved)
  changed.push(...await copyAgentFiles(agentsPath, templatesDir, anaJson));

  // Refresh CLAUDE.md from stock (re-interpolated)
  const claudeMdChanged = await copyClaudeMd(cwd, templatesDir, engineResult);
  if (claudeMdChanged) changed.push(claudeMdChanged);

  spinner.succeed('Created .claude/ configuration (merged)');
  return changed;
}

/**
 * Render a skills list as an inline-YAML frontmatter array (stock format).
 *
 * Matches the stock template byte layout (`skills: [git-workflow]`,
 * `skills: [coding-standards, testing-standards]`) so a projected value that
 * happens to equal stock stays byte-identical.
 *
 * @param skills - Ordered, deduplicated skill names
 * @returns The inline-array value (no `skills:` prefix), e.g. `[a, b]`
 */
function renderSkillsArray(skills: string[]): string {
  return `[${skills.join(', ')}]`;
}

/**
 * Set a flat `skills = [...]` array line in flat-TOML content.
 *
 * Replaces an existing top-level `skills = ...` line if present, otherwise
 * appends one (with a single trailing newline boundary). Values are rendered as
 * a TOML string array: `skills = ["git-workflow", "api-patterns"]`. Format-
 * preserving and line-based — no TOML parser, matching `preserveTomlConfigKeys`.
 *
 * @param toml - Existing flat-TOML content
 * @param skills - Ordered, deduplicated skill names
 * @returns The TOML with the `skills` line set
 */
function setTomlSkills(toml: string, skills: string[]): string {
  const line = `skills = [${skills.map((s) => `"${s}"`).join(', ')}]`;
  const lineRegex = /^skills\s*=.*$/m;
  if (lineRegex.test(toml)) {
    return toml.replace(lineRegex, line);
  }
  const base = toml.endsWith('\n') ? toml : `${toml}\n`;
  return `${base}${line}\n`;
}

/**
 * Render the body of a Codex `## Skills` managed block (no markers).
 *
 * The block lists the agent's projected skills as a markdown bullet list under a
 * `## Skills` heading, so a human reading the `.codex/agents/<name>.md` sees the
 * same skill roster the `.agent.toml` declares. Markers are added by
 * {@link mergeManagedBlock}.
 *
 * @param skills - Ordered, deduplicated skill names
 * @returns The block body (heading + bullet list)
 */
function renderCodexSkillsBlock(skills: string[]): string {
  const bullets = skills.map((s) => `- ${s}`).join('\n');
  return `## Skills\n\n${bullets}`;
}

/**
 * Build a minimal Codex `.agent.toml` manifest (defensive fallback).
 *
 * Built-in agents ship a hand-authored `.agent.toml` with the CLI; this
 * synthesizes one only as a fallback if that stock manifest is ever missing.
 * The machine fields (`name`, `description`, `developer_instructions`) mirror
 * the stock manifest shape, and the runtime defaults (`model`, `sandbox_mode`)
 * are seeded from the codex platform descriptor so a synthesized manifest
 * matches the built-ins' Codex runtime exactly. The user can override the
 * runtime fields — they are CONFIG-class and preserved across re-init.
 *
 * @param baseName - Agent base name (e.g. 'ana-release')
 * @returns Full `.agent.toml` content
 */
function buildCodexAgentToml(baseName: string): string {
  const codex = resolvePlatformDescriptor('codex');
  const lines = [
    `name = "${baseName}"`,
    `description = "${baseName} — custom agent scaffolded by Anatomia."`,
    `developer_instructions = "Full instructions in ${baseName}.md. Invoke via: ana run"`,
  ];
  if (codex.runDefaults.model !== undefined) {
    lines.push(`model = "${codex.runDefaults.model}"`);
  }
  if (codex.runDefaults.sandboxMode !== undefined) {
    lines.push(`sandbox_mode = "${codex.runDefaults.sandboxMode}"`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Copy agent files to .claude/agents/, refreshing instruction content from stock.
 *
 * Re-init propagates the machine-owned instruction body from each tree's own
 * stock. For an existing file, CONFIG-class frontmatter keys
 * ({@link CLAUDE_AGENT_CONFIG_KEYS}, e.g. a customer's `model`) are carried
 * forward onto the stock content, then the merged file is atomically written.
 * The body of the existing file is compared against the stock body (config-key
 * merges excluded) and the filename recorded when it differs. Fresh files
 * (no existing destination) are written from stock and never reported.
 *
 * Per-agent skills are PROJECTED from `ana.json.agents.<name>.skills` onto the
 * frontmatter `skills:` line on EVERY init (fresh and re-init). `skills` is
 * deliberately NOT in {@link CLAUDE_AGENT_CONFIG_KEYS}: we never carry forward
 * the existing file's `skills:` line — that was the re-init revert bug (a stock
 * `skills:` line would overwrite the user's edit). Instead ana.json (which
 * survives re-init) is the source of truth, so a second re-init re-projects the
 * same value. When the agent has no config-declared skills the stock `skills:`
 * line stands untouched — byte-identical to stock (no-regression contract).
 *
 * @param agentsPath - Path to .claude/agents/ directory
 * @param templatesDir - Path to CLI templates directory
 * @param anaJson - Parsed ana.json driving per-agent skill projection (absent = stock)
 * @returns Filenames whose instruction body changed vs the prior file
 */
export async function copyAgentFiles(agentsPath: string, templatesDir: string, anaJson: unknown = {}): Promise<string[]> {
  const changed: string[] = [];
  // The roster is the fixed built-in set; ana.json only PROJECTS per-agent
  // skills onto these (it does not add/remove agents).
  for (const baseName of resolveAgentRoster()) {
    const agentFile = `${baseName}.md`;
    const destPath = path.join(agentsPath, agentFile);
    const displayName = `.claude/agents/${agentFile}`;

    // Source is always the CLI's bundled template for this built-in agent.
    const sourcePath = path.join(templatesDir, '.claude/agents', agentFile);
    if (!(await fileExists(sourcePath))) continue;
    const stockContent = await fs.readFile(sourcePath, 'utf-8');

    // Per-agent skills projected from ana.json (absent = [] = leave stock alone).
    const projectedSkills = resolveAgentSkills(anaJson, baseName);

    const exists = await fileExists(destPath);
    if (!exists) {
      // Fresh — start from stock, then project config-declared skills.
      let fresh = stockContent;
      if (projectedSkills.length > 0) {
        const updated = setFrontmatterField(fresh, 'skills', renderSkillsArray(projectedSkills));
        if (updated) fresh = updated;
      }
      await atomicWriteFile(destPath, fresh, displayName);
      continue;
    }

    const existingContent = await fs.readFile(destPath, 'utf-8');

    // Carry forward CONFIG-class frontmatter keys onto stock. `skills` is NOT a
    // CONFIG key — it is projected from ana.json below, never preserved from the
    // existing file (preserving it would reintroduce the re-init revert bug).
    let merged = stockContent;
    const existingFm = parseFrontmatter(existingContent);
    if (existingFm) {
      for (const key of CLAUDE_AGENT_CONFIG_KEYS) {
        const value = existingFm.raw[key];
        if (value !== undefined) {
          const updated = setFrontmatterField(merged, key, value);
          if (updated) merged = updated;
        }
      }
    }

    // Project config-declared skills onto the (stock-derived) frontmatter. When
    // there are none, the stock `skills:` line stands — byte-identical to stock.
    if (projectedSkills.length > 0) {
      const updated = setFrontmatterField(merged, 'skills', renderSkillsArray(projectedSkills));
      if (updated) merged = updated;
    }

    // Record an instruction change only when the body actually differs
    // (config-key + skills frontmatter merges are excluded — a model-only or
    // skills-only change is silent, both live in the frontmatter we strip).
    if (stripFrontmatter(existingContent) !== stripFrontmatter(stockContent)) {
      changed.push(agentFile);
    }

    await atomicWriteFile(destPath, merged, displayName);
  }
  return changed;
}

/**
 * Copy CLAUDE.md to project root with project name + stack interpolation.
 *
 * Re-init overwrites CLAUDE.md wholesale, re-applying project-name and stack
 * interpolation from the current scan. The warning is gated against the
 * freshly-interpolated output (NOT the raw stock template), so the same
 * project context produces no false positive.
 *
 * @param cwd - Project root directory
 * @param templatesDir - Path to CLI templates directory
 * @param engineResult - Engine result for stack interpolation (null if skipped)
 * @returns `'CLAUDE.md'` if a prior file existed and differed from the interpolated output, else `null`
 */
async function copyClaudeMd(
  cwd: string,
  templatesDir: string,
  engineResult: EngineResult | null
): Promise<string | null> {
  const destPath = path.join(cwd, 'CLAUDE.md');

  // Read template and interpolate
  const sourcePath = path.join(templatesDir, 'CLAUDE.md');
  let content = await fs.readFile(sourcePath, 'utf-8');

  // Replace header with project name
  const projectName = await getProjectName(cwd);
  content = content.replace(/^# .*$/m, `# ${projectName}`);

  // Add stack summary after header
  if (engineResult) {
    const stackParts = getStackSummary(engineResult);
    if (stackParts.length > 0) {
      content = content.replace(/^(# .*)$/m, `$1\n\n**Stack:** ${stackParts.join(' · ')}`);
    }
  }

  // Gate the warning against the interpolated output, not raw stock
  let changed: string | null = null;
  const exists = await fileExists(destPath);
  if (exists) {
    const existingContent = await fs.readFile(destPath, 'utf-8');
    if (existingContent !== content) {
      changed = 'CLAUDE.md';
    }
  }

  await atomicWriteFile(destPath, content, 'CLAUDE.md');
  return changed;
}

/**
 * Generate AGENTS.md for cross-tool AI coding compatibility.
 *
 * AGENTS.md is the Linux Foundation standard read by Cursor, Copilot,
 * Codex, Windsurf, and other AI coding tools. Does not overwrite existing.
 *
 * @internal Exported for testing only — call via createClaudeConfiguration.
 * @param cwd - Project root directory
 * @param engineResult - Engine result for stack/convention interpolation
 */
export async function generateAgentsMd(cwd: string, engineResult: EngineResult | null): Promise<void> {
  const destPath = path.join(cwd, 'AGENTS.md');
  if (await fileExists(destPath)) return;

  const projectName = await getProjectName(cwd);
  const lines: string[] = [];

  lines.push(`# ${projectName}`);
  lines.push('');

  if (engineResult) {
    const stackParts = getStackSummary(engineResult);
    if (stackParts.length > 0) {
      lines.push(`${stackParts.join(' · ')}`);
      lines.push('');
    }
  }

  if (engineResult) {
    const cmds = engineResult.commands;
    const cmdLines: string[] = [];
    if (cmds.build) cmdLines.push(`- Build: \`${cmds.build}\``);
    if (cmds.test) {
      const testCmd = makeTestCommandNonInteractive(cmds.test, engineResult.stack.testing, cmds.all?.['test']);
      cmdLines.push(`- Test: \`${testCmd}\``);
    }
    if (cmds.lint) cmdLines.push(`- Lint: \`${cmds.lint}\``);
    if (cmds.dev) cmdLines.push(`- Dev: \`${cmds.dev}\``);
    if (cmdLines.length > 0) {
      lines.push('## Commands');
      lines.push(...cmdLines);
      lines.push('');
    }

    // Deployment context — the critical safety warning for deployed projects
    if (engineResult.deployment?.platform) {
      lines.push('## Deployment');
      lines.push(`- Platform: ${engineResult.deployment.platform}`);
      if (engineResult.deployment.platform === 'Vercel') {
        lines.push('- Push to main deploys to production. PRs get preview deployments.');
        lines.push('- Serverless function limits apply — long-running tasks need streaming or background processing.');
      } else if (engineResult.deployment.platform === 'Docker' || engineResult.deployment.platform === 'Docker Compose') {
        lines.push('- Deployed via Docker containers.');
      }
      if (engineResult.deployment.ci) {
        lines.push(`- CI: ${engineResult.deployment.ci}`);
      }
      lines.push('');
    }
  }

  // Surfaces section — shows monorepo surfaces with path and framework.
  if (engineResult && engineResult.surfaces.length > 0) {
    const MAX_SURFACE_DISPLAY = 4;
    const display = engineResult.surfaces.slice(0, MAX_SURFACE_DISPLAY);
    lines.push('## Surfaces');
    for (const s of display) {
      const fw = s.framework ? ` — ${s.framework}` : '';
      lines.push(`- ${s.name} (${s.path})${fw}`);
    }
    if (engineResult.surfaces.length > MAX_SURFACE_DISPLAY) {
      const remaining = engineResult.surfaces.length - MAX_SURFACE_DISPLAY;
      lines.push(`+${remaining} more`);
    }
    lines.push('');
  }

  if (engineResult?.conventions) {
    const convLines: string[] = [];
    const naming = engineResult.conventions.naming;
    // Confidence threshold: suppress low-confidence conventions from AGENTS.md.
    // Without this, a 29% majority from 2 samples gets exported as
    // authoritative fact to every AI coding tool that reads AGENTS.md.
    const isReliable = (c: { confidence: number; sampleSize: number } | undefined) =>
      !!c && c.confidence >= 0.5 && c.sampleSize >= 5;
    if (naming?.functions && isReliable(naming.functions)) {
      convLines.push(`- Functions: ${naming.functions.majority}`);
    }
    if (naming?.files && isReliable(naming.files)) {
      convLines.push(`- Files: ${naming.files.majority}`);
    }
    const imp = engineResult.conventions.imports;
    if (imp && imp.style !== 'mixed') {
      const importStyle = (imp.style === 'absolute' && imp.aliasPattern)
        ? `path aliases (${imp.aliasPattern})`
        : imp.style;
      convLines.push(`- Imports: ${importStyle}`);
    }
    const indent = engineResult.conventions.indentation;
    if (indent && indent.confidence >= 0.5) {
      convLines.push(`- Indentation: ${indent.style}, ${indent.width} wide`);
    }
    if (convLines.length > 0) {
      lines.push('## Conventions');
      lines.push(...convLines);
      lines.push('');
    }
  }

  // Services — dedup against stack roles (same pattern as scan.ts display).
  // Services that fulfill a stack role (database, auth, payments, aiSdk,
  // deployment) already appear in the header line — don't repeat them.
  // AI sub-provider variants (e.g. "Vercel AI (OpenAI)") are collapsed —
  // the SDK itself already appears via stack role.
  if (engineResult && engineResult.externalServices.length > 0) {
    const aiSdkPrefix = engineResult.stack.aiSdk ? `${engineResult.stack.aiSdk} (` : null;
    const standalone = engineResult.externalServices.filter(svc => {
      if (svc.stackRoles.length > 0) return false;
      if (aiSdkPrefix && svc.name.startsWith(aiSdkPrefix)) return false;
      return true;
    });
    if (standalone.length > 0) {
      lines.push('## Services');
      for (const svc of standalone) {
        lines.push(`- ${svc.name} (${svc.category})`);
      }
      lines.push('');
    }
  }

  // Scan-derived constraints — real constraints only, no generic
  // boilerplate. Removed two slop lines that used to ship
  // here unconditionally ("Follow existing patterns in the codebase" and
  // "Run tests before committing"). Both were content-free and violated
  // "every character earns its place." If nothing was detected, skip
  // the section entirely rather than rendering a vacuous one.
  const constraintLines: string[] = [];
  if (engineResult?.conventions?.imports?.aliasPattern &&
      engineResult.conventions.imports.style === 'absolute') {
    constraintLines.push(`- Use ${engineResult.conventions.imports.aliasPattern} path aliases for imports`);
  }
  // Finding-derived constraints (instruction-oriented, stale-resistant)
  const findingInstructions: Record<string, string> = {
    'hardcoded-secret': '🔴 Use environment variables for all API keys and credentials — never hardcode secrets',
    'api-validation': '⚠ Validate all API route input with {lib} at the boundary',
    'env-hygiene': '⚠ Maintain a .env.example documenting all required environment variables',
  };

  if (engineResult && engineResult.findings.length > 0) {
    const seenConstraints = new Set<string>();
    for (const f of engineResult.findings) {
      if (f.severity !== 'critical' && f.severity !== 'warn') continue;
      const instruction = findingInstructions[f.id];
      if (instruction) {
        const line = instruction.replace(
          '{lib}',
          getPatternLibrary(engineResult.patterns?.validation) || 'a schema validator'
        );
        const rendered = `- ${line}`;
        if (!seenConstraints.has(rendered)) {
          seenConstraints.add(rendered);
          constraintLines.push(rendered);
        }
      }
    }
  }

  if (constraintLines.length > 0) {
    lines.push('## Constraints');
    lines.push(...constraintLines);
    lines.push('');
  }

  await fs.writeFile(destPath, lines.join('\n'), 'utf-8');
}

/**
 * Merge Anatomia hooks into existing settings
 *
 * Appends our hooks alongside existing ones without duplicates.
 * Uses the hook command path as the unique identifier.
 *
 * @param existing - Existing settings.json content
 * @param template - Our template settings
 * @returns Merged settings object
 */
function mergeHooksSettings(
  existing: Record<string, unknown>,
  template: Record<string, unknown>
): Record<string, unknown> {
  // Start with existing settings
  const merged = { ...existing };

  // Ensure hooks object exists
  if (!merged['hooks'] || typeof merged['hooks'] !== 'object') {
    merged['hooks'] = {};
  }

  const mergedHooks = merged['hooks'] as Record<string, unknown[]>;
  const templateHooks = (template['hooks'] || {}) as Record<string, unknown[]>;

  // Merge each hook type (PostToolUse, Stop, etc.)
  for (const hookType of Object.keys(templateHooks)) {
    const templateHookArray = templateHooks[hookType] as HookEntry[];
    const existingHookArray = (mergedHooks[hookType] || []) as HookEntry[];

    // Merge each hook entry
    for (const templateEntry of templateHookArray) {
      const isDuplicate = existingHookArray.some((existingEntry) =>
        hookEntryMatches(existingEntry, templateEntry)
      );

      if (!isDuplicate) {
        existingHookArray.push(templateEntry);
      }
    }

    mergedHooks[hookType] = existingHookArray;
  }

  return merged;
}

/** Hook entry type for merge logic */
interface HookEntry {
  matcher?: string;
  hooks?: Array<{ type: string; command: string; timeout?: number }>;
}

/**
 * Check if two hook entries match (by command path)
 *
 * @param a - First hook entry
 * @param b - Second hook entry
 * @returns true if entries match
 */
function hookEntryMatches(a: HookEntry, b: HookEntry): boolean {
  // Different matchers = different entries
  if (a.matcher !== b.matcher) {
    return false;
  }

  // Check if any command in a matches any command in b
  const aCommands = (a.hooks || []).map((h) => h.command);
  const bCommands = (b.hooks || []).map((h) => h.command);

  return bCommands.some((cmd) => aCommands.includes(cmd));
}

/**
 * The machine-owned capture hook command — Anatomia's signature.
 *
 * The prune path keys on this exact string (regardless of matcher or hook
 * event) to remove only our hook, never user-authored hooks.
 */
const CAPTURE_HOOK_COMMAND = 'ana _capture';

/**
 * The retired end-of-session derive command (legacy) — once ran `deriveTranscript`
 * on the finished transcript under SessionEnd (Claude) / Stop (Codex). No longer
 * installed; the prune path keys on this exact string to remove it from upgraded
 * installs that still carry it.
 */
const CAPTURE_DERIVE_COMMAND = 'ana _capture --derive';

/** The SessionStart hook event Anatomia installs the capture hook under. */
const CAPTURE_HOOK_EVENT = 'SessionStart';

/** The end-of-session hook event for Claude (legacy derive) — pruned on re-init. */
const CAPTURE_END_EVENT_CLAUDE = 'SessionEnd';

/** The end-of-session hook event for Codex (legacy derive) — pruned on re-init. */
const CAPTURE_END_EVENT_CODEX = 'Stop';

/**
 * Inject the `ana _capture` SessionStart hook into a settings object.
 *
 * Idempotent — does nothing if an entry with the capture command is already
 * present under SessionStart. No `matcher` is set, so the hook fires on every
 * session-start source; the `source` field is recorded for disambiguation.
 *
 * @param settings - The settings object to mutate (gains `hooks.SessionStart`)
 */
function injectCaptureHook(settings: Record<string, unknown>): void {
  if (!settings['hooks'] || typeof settings['hooks'] !== 'object') {
    settings['hooks'] = {};
  }
  const hooks = settings['hooks'] as Record<string, unknown>;
  injectHookEvent(hooks, CAPTURE_HOOK_EVENT, CAPTURE_HOOK_COMMAND);
}

/**
 * Idempotently add a capture hook command under a hook event in a hooks object.
 *
 * Dedup-safe — does nothing if an entry with the command already exists under the
 * event. Mutates `hooks` in place.
 *
 * @param hooks - The `hooks` object (event → entries[])
 * @param event - The hook event name (e.g. `SessionStart`)
 * @param command - The hook command to ensure is present
 */
function injectHookEvent(hooks: Record<string, unknown>, event: string, command: string): void {
  const entries = (hooks[event] as HookEntry[] | undefined) ?? [];
  const already = entries.some((e) => (e.hooks || []).some((h) => h.command === command));
  if (!already) {
    entries.push({ hooks: [{ type: 'command', command }] });
  }
  hooks[event] = entries;
}

/**
 * Prune any hook entry whose command exactly matches `command` from a hook event.
 *
 * Mirrors {@link injectHookEvent}'s shape, but removes instead of adds. Drops
 * every entry under `event` that carries a matching command (keying on the exact
 * command string, never a matcher), preserving every user-authored entry. When
 * the event's entry array becomes empty the event key is deleted entirely so no
 * dangling `"SessionEnd": []` is left behind to confuse future merges.
 *
 * Total / never-throw — a malformed `hooks` shape (absent, non-object, or a
 * non-array event value) degrades to a no-op rather than crashing init. Mutates
 * `hooks` in place.
 *
 * @param hooks - The `hooks` object (event → entries[]); may be absent/non-object
 * @param event - The hook event name (e.g. `SessionEnd`)
 * @param command - The exact hook command to prune (legacy `ana _capture --derive`)
 */
function pruneHookCommand(hooks: unknown, event: string, command: string): void {
  if (!hooks || typeof hooks !== 'object') return;
  const hooksObj = hooks as Record<string, unknown>;
  const entries = hooksObj[event];
  if (!Array.isArray(entries)) return;
  const kept = (entries as HookEntry[]).filter(
    (e) => !(e.hooks || []).some((h) => h.command === command),
  );
  if (kept.length === 0) {
    delete hooksObj[event];
  } else {
    hooksObj[event] = kept;
  }
}

// ── Managed-block surfaces (Slice 4) ───────────────────────────────────────
//
// `mergeManagedBlock` is NET-NEW code modeled on two existing disciplines, NOT
// an extraction or rename of `mergeHooksSettings` (which is hook-array
// dedup-by-command — a different mechanism left fully intact above):
//
//   1. The hooks-merge BOUNDARY discipline — only ever touch the Anatomia-owned
//      region of a file; every byte the user authored outside it survives.
//   2. The `## Detected` / .gitignore-sentinel INJECTION discipline — the owned
//      region is delimited by begin/end markers, so re-init replaces exactly
//      that region in place (or strips it entirely when the source is removed).
//
// Wired through it: the Codex per-agent `## Skills` projection block
// (keyed `skills:<agent>`) — a marker-bounded region of `.codex/agents/<a>.md`
// that re-init replaces in place, leaving the rest of the body untouched.

/**
 * HTML-comment begin marker for an Anatomia-managed block in a markdown file.
 *
 * @param markerKey - Stable key identifying the managed region
 * @returns The begin-marker line
 */
function managedBlockBegin(markerKey: string): string {
  return `<!-- >>> Anatomia managed: ${markerKey} (do not edit this block) >>> -->`;
}

/**
 * HTML-comment end marker for an Anatomia-managed block in a markdown file.
 *
 * @param markerKey - Stable key identifying the managed region
 * @returns The end-marker line
 */
function managedBlockEnd(markerKey: string): string {
  return `<!-- <<< Anatomia managed: ${markerKey} <<< -->`;
}

/**
 * Merge an Anatomia-managed block into existing file content, touching only the
 * marker-delimited region keyed by `markerKey` and preserving every other byte.
 *
 * Boundary + injection discipline (see the section comment above):
 *  - `existing` null/absent → return the wrapped block alone (fresh write).
 *  - `existing` already carries this marker block → replace just that region in
 *    place, preserving all surrounding user content.
 *  - `existing` has no such block → append the wrapped block after the user's
 *    content (a single trailing newline of separation), preserving it verbatim.
 *  - `managed` null → PRUNE: strip this marker block out entirely, returning the
 *    surrounding user content (or `null` when nothing user-authored remains, so
 *    the caller can delete a now-empty managed-only file).
 *
 * Never throws. A file whose markers were hand-mangled (begin without end)
 * degrades to the append path rather than corrupting the file.
 *
 * @param existing - Existing file content, or null when the file is absent
 * @param managed - The managed block body (no markers), or null to prune the block
 * @param markerKey - Stable key identifying this managed region
 * @returns The merged file content, or null when pruning leaves nothing
 */
export function mergeManagedBlock(
  existing: string | null,
  managed: string | null,
  markerKey: string,
): string | null {
  const begin = managedBlockBegin(markerKey);
  const end = managedBlockEnd(markerKey);
  const wrapped = managed === null ? null : `${begin}\n${managed}\n${end}`;

  if (existing === null || existing === '') {
    // Fresh file: emit the wrapped block (or nothing when pruning a non-file).
    return wrapped === null ? null : `${wrapped}\n`;
  }

  const beginIdx = existing.indexOf(begin);
  const endIdx = existing.indexOf(end);
  const hasBlock = beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx;

  if (!hasBlock) {
    // No managed region present.
    if (wrapped === null) return existing; // nothing to prune — leave as-is
    // Append our block, preserving the user's content with one blank line gap.
    const base = existing.endsWith('\n') ? existing : `${existing}\n`;
    return `${base}\n${wrapped}\n`;
  }

  // Replace or strip the existing managed region in place.
  const before = existing.slice(0, beginIdx);
  const after = existing.slice(endIdx + end.length);

  if (wrapped === null) {
    // PRUNE: drop the block, collapse the blank line that separated it, and
    // trim trailing whitespace introduced by removal.
    const stitched = `${before.replace(/\n+$/, '')}${after.replace(/^\n+/, '\n')}`;
    const trimmed = stitched.replace(/\s+$/, '');
    return trimmed === '' ? null : `${trimmed}\n`;
  }

  return `${before}${wrapped}${after}`;
}

/**
 * Create .codex/ configuration
 *
 * Creates .codex/agents/ directory with Codex agent templates and TOML manifests.
 * On re-init the agent instruction `.md` bodies refresh wholesale from stock and
 * the `.agent.toml` machine fields refresh while CONFIG keys are preserved.
 *
 * @param cwd - Project root directory
 * @param _initState - Installation state (unused — reserved for future merge logic)
 * @param anaJson - Parsed ana.json driving per-agent skill projection (absent = stock)
 * @returns Filenames whose instruction body changed (empty on a fresh install or no-op re-init)
 */
export async function createCodexConfiguration(cwd: string, _initState: InitState, anaJson: unknown = {}): Promise<string[]> {
  const spinner = ora('Creating .codex/ configuration...').start();

  const codexPath = path.join(cwd, '.codex');
  const agentsPath = path.join(codexPath, 'agents');
  const codexGitignorePath = path.join(codexPath, '.gitignore');
  const templatesDir = getTemplatesDir();

  const codexExists = await dirExists(codexPath);

  if (!codexExists) {
    // First run: create fresh
    await fs.mkdir(codexPath, { recursive: true });
    await fs.mkdir(agentsPath, { recursive: true });

    // Copy agent .md files and .agent.toml manifests
    const changed = await copyCodexAgentFiles(agentsPath, templatesDir, anaJson);

    await applyCodexCaptureHooks(codexPath, templatesDir);

    // Create .gitignore for Codex per-developer state (agent-memory/, settings.local.json).
    await mergeAndWriteGitignore(codexGitignorePath, CODEX_GITIGNORE_STOCK, '.codex/.gitignore');

    spinner.succeed('Created .codex/ configuration');
    return changed;
  }

  // .codex/ exists — refresh instruction content, preserve TOML config keys
  const agentsExists = await dirExists(agentsPath);
  if (!agentsExists) {
    await fs.mkdir(agentsPath, { recursive: true });
  }

  const changed = await copyCodexAgentFiles(agentsPath, templatesDir, anaJson);

  await applyCodexCaptureHooks(codexPath, templatesDir);

  // Merge .gitignore — regenerate our managed block, preserve user lines.
  await mergeAndWriteGitignore(codexGitignorePath, CODEX_GITIGNORE_STOCK, '.codex/.gitignore');

  spinner.succeed('Created .codex/ configuration (merged)');
  return changed;
}

/**
 * Install the Codex capture hook (always-on; runtime-gated by the flag).
 *
 * Merges the `ana _capture` SessionStart hook into `.codex/hooks.json`
 * (dedup-safe, preserving user-authored hooks), prunes any retired
 * `ana _capture --derive` Stop hook left by a legacy install, and ensures
 * `config.toml` has `[features] hooks = true` (merged into an existing file,
 * never clobbering the user's other config). The SessionStart hook is always
 * installed; the `processCapture` flag is the runtime switch (`ana _capture`
 * no-ops when off), so it is never flip-off pruned.
 *
 * @param codexPath - Path to the `.codex/` directory
 * @param templatesDir - Path to the CLI templates directory
 */
async function applyCodexCaptureHooks(
  codexPath: string,
  templatesDir: string,
): Promise<void> {
  const hooksPath = path.join(codexPath, 'hooks.json');
  const configPath = path.join(codexPath, 'config.toml');

  // Read any existing hooks.json (the Codex hooks file is the event-map directly).
  let hooksObj: Record<string, unknown> = {};
  if (await fileExists(hooksPath)) {
    try {
      hooksObj = JSON.parse(await fs.readFile(hooksPath, 'utf-8'));
      if (typeof hooksObj !== 'object' || hooksObj === null) hooksObj = {};
    } catch {
      hooksObj = {};
    }
  }

  // The SessionStart capture hook is ALWAYS installed; the `processCapture` flag
  // is the runtime switch (`ana _capture` no-ops when off), so it is never
  // flip-off pruned. Merge it dedup-by-command, preserving user-authored hooks.
  injectHookEvent(hooksObj, CAPTURE_HOOK_EVENT, CAPTURE_HOOK_COMMAND);
  // Targeted prune of the retired Stop derive hook from legacy installs — keying
  // on the exact command, never a user-authored Stop hook.
  pruneHookCommand(hooksObj, CAPTURE_END_EVENT_CODEX, CAPTURE_DERIVE_COMMAND);
  await fs.writeFile(hooksPath, JSON.stringify(hooksObj, null, 2), 'utf-8');

  // Ensure config.toml enables hooks — idempotently MERGE `[features] hooks = true`
  // into an existing TOML without mangling the user's other config.
  await ensureCodexHooksFlag(configPath, templatesDir);
}

/**
 * Ensure `.codex/config.toml` enables lifecycle hooks (`[features] hooks = true`).
 *
 * Delta #2 (human-approved fix): the previous code only wrote config.toml when it
 * was ABSENT, so a pre-existing TOML lacking the flag got a hooks.json whose hooks
 * never fired (silent degrade — Verify flagged this). This idempotently MERGES the
 * flag into an existing file without mangling the user's other config:
 *  - file absent → write the stock template;
 *  - `hooks = true` already present → no-op;
 *  - a `hooks =` key present but not `true` → set it to `true`;
 *  - `[features]` section present without a `hooks` key → insert the key under it;
 *  - otherwise → append a `[features]` section.
 *
 * @param configPath - Path to `.codex/config.toml`
 * @param templatesDir - Path to the CLI templates directory
 */
async function ensureCodexHooksFlag(configPath: string, templatesDir: string): Promise<void> {
  if (!(await fileExists(configPath))) {
    const templateConfig = await fs.readFile(path.join(templatesDir, '.codex/config.toml'), 'utf-8');
    await fs.writeFile(configPath, templateConfig, 'utf-8');
    return;
  }

  let content = await fs.readFile(configPath, 'utf-8');

  // Already enabled → nothing to do.
  if (/^\s*hooks\s*=\s*true\s*$/m.test(content)) return;

  // A `hooks =` key exists but isn't `true` → flip it (preserves the rest).
  if (/^\s*hooks\s*=.*$/m.test(content)) {
    content = content.replace(/^(\s*hooks\s*=\s*).*$/m, '$1true');
    await fs.writeFile(configPath, content, 'utf-8');
    return;
  }

  // A `[features]` section exists without a hooks key → insert under the header.
  if (/^\s*\[features\]\s*$/m.test(content)) {
    content = content.replace(/^(\s*\[features\]\s*)$/m, '$1\nhooks = true');
    await fs.writeFile(configPath, content, 'utf-8');
    return;
  }

  // No `[features]` section at all → append one (don't disturb existing config).
  const sep = content.endsWith('\n') ? '' : '\n';
  content = `${content}${sep}\n[features]\nhooks = true\n`;
  await fs.writeFile(configPath, content, 'utf-8');
}

/**
 * Copy Codex agent files to .codex/agents/, refreshing instruction content.
 *
 * For each `.md` (no frontmatter): overwrite wholesale from stock, then project
 * the per-agent skill roster into a single marker-bounded `## Skills` block
 * (keyed `skills:<name>`) via {@link mergeManagedBlock}. The changed-files
 * comparison strips that managed block from BOTH sides, so a skills-only change
 * never registers as an instruction change. For each `.agent.toml`: preserve
 * CONFIG keys ({@link CODEX_AGENT_CONFIG_KEYS}) from the existing file onto
 * stock while refreshing all machine fields, then write a flat `skills = [...]`
 * line projected from ana.json, then atomic-write. The `.agent.toml` never
 * contributes to the changed-files list (it carries config + machine metadata).
 *
 * `skills` is NOT a CONFIG key on either surface: it is projected from ana.json
 * (which survives re-init), never preserved from the existing file — preserving
 * it would reintroduce the re-init revert bug. Absent per-agent skills leaves
 * both surfaces byte-identical to stock (no `## Skills` block, no `skills` line).
 *
 * @param agentsPath - Path to .codex/agents/ directory
 * @param templatesDir - Path to CLI templates directory
 * @param anaJson - Parsed ana.json driving per-agent skill projection (absent = stock)
 * @returns Filenames whose `.md` instruction content changed vs the prior file
 */
export async function copyCodexAgentFiles(agentsPath: string, templatesDir: string, anaJson: unknown = {}): Promise<string[]> {
  const changed: string[] = [];
  // The roster is the fixed built-in set; ana.json only PROJECTS per-agent
  // skills onto these (it does not add/remove agents).
  for (const baseName of resolveAgentRoster()) {
    const agentFile = `${baseName}.md`;
    const skillsMarker = `skills:${baseName}`;
    const projectedSkills = resolveAgentSkills(anaJson, baseName);

    // .md instruction body — overwrite wholesale from the CLI's bundled stock
    // template, then project the skills roster as a marker-bounded `## Skills`
    // block. The flat `skills = [...]` line is projected onto the `.agent.toml`.
    const mdSource = path.join(templatesDir, '.codex/agents', agentFile);
    if (!(await fileExists(mdSource))) continue;
    const mdDest = path.join(agentsPath, agentFile);
    const stockMd = await fs.readFile(mdSource, 'utf-8');
    if (await fileExists(mdDest)) {
      const existingMd = await fs.readFile(mdDest, 'utf-8');
      // Strip the managed `## Skills` block from the existing file before the
      // instruction comparison, so a skills-only change isn't a false positive.
      const existingBody = mergeManagedBlock(existingMd, null, skillsMarker) ?? '';
      if (existingBody !== stockMd) {
        changed.push(agentFile);
      }
    }
    const blockBody = projectedSkills.length > 0 ? renderCodexSkillsBlock(projectedSkills) : null;
    const finalMd = mergeManagedBlock(stockMd, blockBody, skillsMarker) ?? stockMd;
    await atomicWriteFile(mdDest, finalMd, `.codex/agents/${agentFile}`);

    // .agent.toml manifest — preserve config keys, refresh machine fields,
    // then project the flat `skills = [...]` line from ana.json. The built-in's
    // stock toml ships with the CLI; the synthesized fallback is defensive.
    const tomlFile = `${baseName}.agent.toml`;
    const tomlDest = path.join(agentsPath, tomlFile);
    const tomlSource = path.join(templatesDir, '.codex/agents', tomlFile);
    const stockToml = (await fileExists(tomlSource))
      ? await fs.readFile(tomlSource, 'utf-8')
      : buildCodexAgentToml(baseName);
    let finalToml = stockToml;
    if (await fileExists(tomlDest)) {
      const existingToml = await fs.readFile(tomlDest, 'utf-8');
      finalToml = preserveTomlConfigKeys(stockToml, existingToml, CODEX_AGENT_CONFIG_KEYS);
    }
    if (projectedSkills.length > 0) {
      finalToml = setTomlSkills(finalToml, projectedSkills);
    }
    await atomicWriteFile(tomlDest, finalToml, `.codex/agents/${tomlFile}`);
  }
  return changed;
}

/** Which platform files a scoped skill projection actually touched. */
export interface AgentSkillsProjection {
  /** Relative path of the Claude agent file updated, if `.claude/agents/<a>.md` existed. */
  claude: string | null;
  /** Relative path of the Codex `.agent.toml` updated, if `.codex/agents/<a>.agent.toml` existed. */
  codexToml: string | null;
  /** Relative path of the Codex `.md` updated, if `.codex/agents/<a>.md` existed. */
  codexMd: string | null;
}

/**
 * Project a single agent's skills onto its live platform files RIGHT NOW —
 * the same projection `ana init` performs, scoped to one agent so `ana agents
 * skills` is a one-step, immediately-visible change rather than a deferred
 * "run init to see it" promise.
 *
 * Touches ONLY the skills surface (never the instruction body): the Claude
 * frontmatter `skills:` line, the Codex `.agent.toml` flat `skills = [...]`
 * line, and the marker-bounded `## Skills` block in the Codex `.md`.
 *
 * Lockstep with init: a non-empty `skills` projects the list exactly as
 * {@link copyAgentFiles}/{@link copyCodexAgentFiles} would. An EMPTY `skills`
 * (the clear case) re-derives the agent's skills surface from its STOCK
 * template — restoring the stock Claude `skills:` line and stock Codex toml
 * line, and removing the marker-bounded `## Skills` block — so the result is
 * byte-identical to what the next `ana init` would produce for an agent with no
 * ana.json skills entry (NOT a forced `skills: []`). When the stock template is
 * unavailable (a non-built-in / hand-authored agent, or a missing templates
 * dir), clear falls back to dropping the line.
 *
 * Fail-soft: a platform file that doesn't exist is skipped (reported as null),
 * never created from scratch — projection only updates files init already laid
 * down. ana.json remains the durable source of truth; this just front-runs the
 * re-init so the change is live.
 *
 * @param cwd - Project root directory
 * @param agentName - Agent base name (e.g. 'ana-build')
 * @param skills - Ordered, deduplicated skill names ([] clears to stock)
 * @returns Which platform files were actually updated
 */
export async function projectAgentSkillsToFiles(
  cwd: string,
  agentName: string,
  skills: string[],
): Promise<AgentSkillsProjection> {
  const result: AgentSkillsProjection = { claude: null, codexToml: null, codexMd: null };
  const has = skills.length > 0;
  const isBuiltin = BUILTIN_AGENT_ROSTER.includes(agentName);
  const templatesDir = getTemplatesDir();

  // Resolve the stock Claude template path. Built-ins ship with the CLI; a
  // non-built-in (hand-authored) agent has no bundled stock, so the clear path
  // below degrades to dropping the `skills:` line.
  const stockClaude = isBuiltin
    ? path.join(templatesDir, '.claude/agents', `${agentName}.md`)
    : path.join(cwd, '.ana', 'agent-templates', `${agentName}.md`);

  /**
   * Read the stock frontmatter `skills:` value for the clear path.
   *
   * @returns The stock `skills:` inline value, or null when unavailable
   */
  async function stockClaudeSkillsValue(): Promise<string | null> {
    if (!(await fileExists(stockClaude))) return null;
    const stockFm = parseFrontmatter(await fs.readFile(stockClaude, 'utf-8'));
    const v = stockFm?.raw?.['skills'];
    return typeof v === 'string' ? v : null;
  }

  // ── Claude: .claude/agents/<name>.md frontmatter `skills:` line ──────────
  const claudeFile = path.join(cwd, '.claude', 'agents', `${agentName}.md`);
  if (await fileExists(claudeFile)) {
    const content = await fs.readFile(claudeFile, 'utf-8');
    let updated: string | null;
    if (has) {
      updated = setFrontmatterField(content, 'skills', renderSkillsArray(skills));
    } else {
      // Clear → restore the stock `skills:` value (lockstep with init). Fall back
      // to an empty list only when no stock value is recoverable.
      const stockVal = await stockClaudeSkillsValue();
      updated = setFrontmatterField(content, 'skills', stockVal ?? renderSkillsArray([]));
    }
    if (updated && updated !== content) {
      await atomicWriteFile(claudeFile, updated, `.claude/agents/${agentName}.md`);
    }
    if (updated) result.claude = `.claude/agents/${agentName}.md`;
  }

  // ── Codex: .codex/agents/<name>.agent.toml flat `skills = [...]` line ────
  const codexTomlFile = path.join(cwd, '.codex', 'agents', `${agentName}.agent.toml`);
  if (await fileExists(codexTomlFile)) {
    const toml = await fs.readFile(codexTomlFile, 'utf-8');
    // has → set/replace the line; empty → strip any existing `skills = ...` line
    // (stock toml ships no `skills` line, so stripping == stock).
    const updated = has
      ? setTomlSkills(toml, skills)
      : toml.replace(/^skills\s*=.*\n?/m, '');
    if (updated !== toml) {
      await atomicWriteFile(codexTomlFile, updated, `.codex/agents/${agentName}.agent.toml`);
    }
    result.codexToml = `.codex/agents/${agentName}.agent.toml`;
  }

  // ── Codex: .codex/agents/<name>.md marker-bounded `## Skills` block ──────
  const codexMdFile = path.join(cwd, '.codex', 'agents', `${agentName}.md`);
  if (await fileExists(codexMdFile)) {
    const md = await fs.readFile(codexMdFile, 'utf-8');
    const skillsMarker = `skills:${agentName}`;
    // has → write/replace the block; empty → prune it (stock has no block).
    const blockBody = has ? renderCodexSkillsBlock(skills) : null;
    const updated = mergeManagedBlock(md, blockBody, skillsMarker) ?? md;
    if (updated !== md) {
      await atomicWriteFile(codexMdFile, updated, `.codex/agents/${agentName}.md`);
    }
    result.codexMd = `.codex/agents/${agentName}.md`;
  }

  return result;
}

/**
 * Create skill symlinks for platform directories.
 *
 * Creates symlinks from `.claude/skills` and `.agents/skills` to the
 * canonical `.ana/skills/` directory. Uses relative paths so symlinks
 * survive clone. Idempotent — skips if symlink already exists.
 *
 * @param cwd - Project root directory
 * @param platforms - Array of active platforms
 */
export async function createSkillSymlinks(cwd: string, platforms: string[]): Promise<void> {
  const symlinks: Array<{ linkPath: string; target: string }> = [];

  if (platforms.includes('claude')) {
    symlinks.push({
      linkPath: path.join(cwd, '.claude', 'skills'),
      target: path.join('..', '.ana', 'skills'),
    });
  }

  if (platforms.includes('codex')) {
    // .agents/skills → ../.ana/skills
    const agentsDir = path.join(cwd, '.agents');
    await fs.mkdir(agentsDir, { recursive: true });
    symlinks.push({
      linkPath: path.join(agentsDir, 'skills'),
      target: path.join('..', '.ana', 'skills'),
    });
  }

  for (const { linkPath, target } of symlinks) {
    try {
      const stats = await fs.lstat(linkPath);
      if (stats.isSymbolicLink()) {
        // Already a symlink — skip (idempotent)
        continue;
      }
      // It's a real directory — will be handled by skill migration in state.ts
    } catch {
      // Doesn't exist — create the symlink
      await fs.mkdir(path.dirname(linkPath), { recursive: true });
      await fs.symlink(target, linkPath);
    }
  }
}

/**
 * Generate AGENTS.md for the primary package in a monorepo.
 *
 * Creates a minimal AGENTS.md inside the primary package directory with:
 * - Package name heading
 * - "Primary package in {project-name}" identifier
 * - Package-scoped commands (when available)
 * - Pointer to root AGENTS.md for full project context
 *
 * Does not overwrite existing files. Skips non-monorepos and projects
 * without a detected primary package.
 *
 * @param cwd - Project root directory
 * @param engineResult - Engine result for monorepo/command data
 * @returns The generated content string, or null if skipped
 */
export async function generatePrimaryPackageAgentsMd(
  cwd: string,
  engineResult: EngineResult | null
): Promise<string | null> {
  // Skip if no engine result or not a monorepo
  if (!engineResult) return null;
  if (!engineResult.monorepo.isMonorepo) return null;
  if (!engineResult.monorepo.primaryPackage) return null;

  const pkg = engineResult.monorepo.primaryPackage;
  const destPath = path.join(cwd, pkg.path, 'AGENTS.md');

  // Don't overwrite existing file
  if (await fileExists(destPath)) return null;

  const projectName = await getProjectName(cwd);
  const lines: string[] = [];

  // Package heading
  lines.push(`# ${pkg.name}`);
  lines.push('');

  // Identity line
  lines.push(`Primary package in ${projectName}.`);
  lines.push('');

  // Commands section (if any commands exist)
  const cmds = engineResult.commands;
  const cmdLines: string[] = [];
  if (cmds.build) cmdLines.push(`- Build: \`${cmds.build}\``);
  if (cmds.test) {
    const testCmd = makeTestCommandNonInteractive(cmds.test, engineResult.stack.testing, cmds.all?.['test']);
    cmdLines.push(`- Test: \`${testCmd}\``);
  }
  if (cmds.lint) cmdLines.push(`- Lint: \`${cmds.lint}\``);

  if (cmdLines.length > 0) {
    lines.push('## Commands');
    lines.push(...cmdLines);
    lines.push('');
  }

  // Relative path back to root AGENTS.md
  // pkg.path is like "packages/cli" or "cli" — count segments for depth
  const depth = pkg.path.split('/').filter(Boolean).length;
  const relativePath = '../'.repeat(depth) + 'AGENTS.md';

  lines.push('## Full Project Context');
  lines.push(`See [AGENTS.md](${relativePath}) at the project root for conventions, services, and constraints.`);
  lines.push('');

  const content = lines.join('\n');
  await fs.writeFile(destPath, content, 'utf-8');

  return content;
}
