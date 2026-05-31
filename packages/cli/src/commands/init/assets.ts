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
 * - copyAndVerifyFile: SHA-256 hash-verified copy (used for agent files)
 * - createClaudeConfiguration: the .claude/ tree (agents, skills,
 *   settings.json) — delegates skill copies to skills.scaffoldAndSeedSkills
 * - copyAgentFiles: .claude/agents/*.md without overwriting user edits
 * - copyClaudeMd + generateAgentsMd: the cross-tool CLAUDE.md and
 *   AGENTS.md entry points at the project root
 * - mergeHooksSettings + hookEntryMatches: dedup-safe merge of our hooks
 *   into an existing .claude/settings.json
 *
 * Only the entry points called from index.ts are exported; private
 * helpers (copyAgentFiles, copyClaudeMd, generateAgentsMd, hook merge
 * helpers) stay internal.
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
import { AGENT_FILES, CODEX_AGENT_FILES, getStackSummary } from '../../constants.js';
import type { InitState } from './types.js';
import { dirExists, fileExists } from './preflight.js';
import { getTemplatesDir, makeTestCommandNonInteractive } from './state.js';
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

  // Create .gitignore for runtime state files
  const gitignoreContent = `# Anatomia runtime state — local to each developer
state/
worktrees/
`;
  await fs.writeFile(path.join(tmpAnaPath, '.gitignore'), gitignoreContent, 'utf-8');

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
 * Copy file with SHA-256 integrity verification
 *
 * Copies file and verifies hash matches after copy.
 * Throws if hashes don't match (file corruption).
 *
 * @param sourcePath - Source file path
 * @param destPath - Destination file path
 * @param fileName - Display name for errors
 */
async function copyAndVerifyFile(
  sourcePath: string,
  destPath: string,
  fileName: string
): Promise<void> {
  // Hash source before copy
  const sourceContent = await fs.readFile(sourcePath);
  const sourceHash = createHash('sha256').update(sourceContent).digest('hex');

  // Copy file
  await fs.copyFile(sourcePath, destPath);

  // Hash destination after copy
  const destContent = await fs.readFile(destPath);
  const destHash = createHash('sha256').update(destContent).digest('hex');

  // Verify hashes match
  if (sourceHash !== destHash) {
    throw new Error(
      `File integrity check failed: ${fileName}\n` +
        `Expected: ${sourceHash}\n` +
        `Got: ${destHash}\n` +
        'File may be corrupted during copy.'
    );
  }
}

/**
 * Create .claude/ configuration
 *
 * Creates .claude/ directory with settings.json, agents/ directory, agent files,
 * skills directories, and CLAUDE.md at project root.
 * If .claude/ already exists, merges our hooks into existing settings.json.
 * Agent/skill files are copied without overwriting existing ones (merge-not-overwrite).
 *
 * @param cwd - Project root directory
 * @param engineResult - Engine result for skill seeding (null if skipped)
 * @param _initState - Installation state (unused — skills scaffolding moved to orchestrator)
 */
export async function createClaudeConfiguration(cwd: string, engineResult: EngineResult | null, _initState: InitState): Promise<void> {
  const spinner = ora('Creating .claude/ configuration...').start();

  const claudePath = path.join(cwd, '.claude');
  const settingsPath = path.join(claudePath, 'settings.json');
  const agentsPath = path.join(claudePath, 'agents');
  const templatesDir = getTemplatesDir();

  // Load our template settings
  const templateSettingsPath = path.join(templatesDir, '.claude/settings.json');
  const templateContent = await fs.readFile(templateSettingsPath, 'utf-8');
  const templateSettings = JSON.parse(templateContent);

  const claudeExists = await dirExists(claudePath);

  // Ensure .gitignore exists for per-developer state (agent-memory/, settings.local.json).
  // Written on every run (fresh and re-init) — infrastructure-owned, same as .ana/.gitignore.
  const claudeGitignorePath = path.join(claudePath, '.gitignore');
  const claudeGitignoreContent = `# Per-developer state — not committed
agent-memory/
settings.local.json
`;

  if (!claudeExists) {
    // First run: create everything fresh
    await fs.mkdir(claudePath, { recursive: true });
    await fs.mkdir(agentsPath, { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(templateSettings, null, 2), 'utf-8');
    await fs.writeFile(claudeGitignorePath, claudeGitignoreContent, 'utf-8');

    // Copy all agent files
    await copyAgentFiles(agentsPath, templatesDir);

    // Copy CLAUDE.md to project root
    await copyClaudeMd(cwd, templatesDir, engineResult);

    spinner.succeed('Created .claude/ configuration');
    return;
  }

  // .claude/ exists - handle merge
  // Always refresh .gitignore — infrastructure-owned, same as .ana/.gitignore
  await fs.writeFile(claudeGitignorePath, claudeGitignoreContent, 'utf-8');

  const settingsExists = await fileExists(settingsPath);

  if (!settingsExists) {
    // settings.json doesn't exist - create it
    await fs.writeFile(settingsPath, JSON.stringify(templateSettings, null, 2), 'utf-8');
  } else {
    // settings.json exists - try to merge our hooks
    try {
      const existingContent = await fs.readFile(settingsPath, 'utf-8');
      const existingSettings = JSON.parse(existingContent);
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

  // Copy agent files (merge-not-overwrite)
  await copyAgentFiles(agentsPath, templatesDir);

  // Copy CLAUDE.md to project root (merge-not-overwrite)
  await copyClaudeMd(cwd, templatesDir, engineResult);

  spinner.succeed('Created .claude/ configuration (merged)');
}

/**
 * Copy agent files to .claude/agents/
 *
 * Copies agent definition files from templates without overwriting existing ones.
 * This allows user customizations to persist across re-init.
 *
 * @param agentsPath - Path to .claude/agents/ directory
 * @param templatesDir - Path to CLI templates directory
 */
async function copyAgentFiles(agentsPath: string, templatesDir: string): Promise<void> {
  for (const agentFile of AGENT_FILES) {
    const sourcePath = path.join(templatesDir, '.claude/agents', agentFile);
    const destPath = path.join(agentsPath, agentFile);

    // Check if file already exists (don't overwrite)
    const exists = await fileExists(destPath);
    if (exists) {
      // Skip - don't overwrite existing agent files
      continue;
    }

    // Copy with verification
    await copyAndVerifyFile(sourcePath, destPath, `.claude/agents/${agentFile}`);
  }
}

/**
 * Copy CLAUDE.md to project root with project name + stack interpolation
 *
 * Reads template, replaces header with project name, optionally adds stack summary.
 * Does not overwrite existing CLAUDE.md.
 *
 * @param cwd - Project root directory
 * @param templatesDir - Path to CLI templates directory
 * @param engineResult - Engine result for stack interpolation (null if skipped)
 */
async function copyClaudeMd(cwd: string, templatesDir: string, engineResult: EngineResult | null): Promise<void> {
  const destPath = path.join(cwd, 'CLAUDE.md');

  // Check if file already exists (don't overwrite)
  const exists = await fileExists(destPath);
  if (exists) {
    return;
  }

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

  await fs.writeFile(destPath, content, 'utf-8');
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
 * Create .codex/ configuration
 *
 * Creates .codex/agents/ directory with Codex agent templates and TOML manifests.
 * Mirrors createClaudeConfiguration shape: merge-not-overwrite for existing agent files.
 *
 * @param cwd - Project root directory
 * @param _initState - Installation state (unused — reserved for future merge logic)
 */
export async function createCodexConfiguration(cwd: string, _initState: InitState): Promise<void> {
  const spinner = ora('Creating .codex/ configuration...').start();

  const codexPath = path.join(cwd, '.codex');
  const agentsPath = path.join(codexPath, 'agents');
  const templatesDir = getTemplatesDir();

  const codexExists = await dirExists(codexPath);

  if (!codexExists) {
    // First run: create fresh
    await fs.mkdir(codexPath, { recursive: true });
    await fs.mkdir(agentsPath, { recursive: true });

    // Copy agent .md files and .agent.toml manifests
    await copyCodexAgentFiles(agentsPath, templatesDir);

    spinner.succeed('Created .codex/ configuration');
    return;
  }

  // .codex/ exists — merge (don't overwrite user customizations)
  const agentsExists = await dirExists(agentsPath);
  if (!agentsExists) {
    await fs.mkdir(agentsPath, { recursive: true });
  }

  await copyCodexAgentFiles(agentsPath, templatesDir);

  spinner.succeed('Created .codex/ configuration (merged)');
}

/**
 * Copy Codex agent files to .codex/agents/
 *
 * Copies agent definition files (.md) and TOML manifests (.agent.toml)
 * from templates without overwriting existing ones.
 *
 * @param agentsPath - Path to .codex/agents/ directory
 * @param templatesDir - Path to CLI templates directory
 */
async function copyCodexAgentFiles(agentsPath: string, templatesDir: string): Promise<void> {
  for (const agentFile of CODEX_AGENT_FILES) {
    // Copy .md file
    const mdSource = path.join(templatesDir, '.codex/agents', agentFile);
    const mdDest = path.join(agentsPath, agentFile);
    if (!(await fileExists(mdDest))) {
      await copyAndVerifyFile(mdSource, mdDest, `.codex/agents/${agentFile}`);
    }

    // Copy .agent.toml manifest
    const baseName = agentFile.replace('.md', '');
    const tomlFile = `${baseName}.agent.toml`;
    const tomlSource = path.join(templatesDir, '.codex/agents', tomlFile);
    const tomlDest = path.join(agentsPath, tomlFile);
    if (!(await fileExists(tomlDest))) {
      await copyAndVerifyFile(tomlSource, tomlDest, `.codex/agents/${tomlFile}`);
    }
  }
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
