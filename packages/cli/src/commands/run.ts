/**
 * ana run - Universal agent invocation surface.
 *
 * Maps `ana run build` → platform-specific dispatch:
 * - Claude: `claude --agent ana-build` with platformFlags
 * - Codex: `codex exec` or `codex` (interactive) with TOML manifest config
 *
 * Platform resolution chain: --platform flag → ANA_PLATFORM env → sole
 * platform in ana.json → error with guidance.
 *
 * Usage:
 *   ana run [agent] [--platform claude|codex] [-- ...args]
 *
 * Exit codes:
 *   0 - Agent process exited successfully
 *   1 - Configuration error (conflict guard, missing project, missing executable)
 *   * - Passthrough from the spawned agent process
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPlatformFlags } from './platform.js';
import { AnaJsonSchema } from './init/anaJsonSchema.js';

/**
 * Known agent suffix mappings.
 *
 * The key is the user-facing argument. The value is the full
 * `--agent` value passed to the underlying platform executable.
 */
const AGENT_MAP: Record<string, string> = {
  '': 'ana',
  build: 'ana-build',
  plan: 'ana-plan',
  verify: 'ana-verify',
  setup: 'ana-setup',
  learn: 'ana-learn',
};

/**
 * Agents that run in interactive (TUI) mode on Codex.
 *
 * These use `codex` without `exec` — the user gets an interactive
 * conversation. Non-interactive agents use `codex exec` with
 * developer_instructions piped via `$(cat)`.
 */
// All Codex agents run in interactive TUI mode — same experience as Claude Code.
// codex exec was attempted but it's single-turn (fire and forget), which
// doesn't work for pipeline agents that need to read files, write code,
// run tests, and iterate.

/** Platforms recognized by ana run. Unknown values are rejected. */
const KNOWN_PLATFORMS = new Set(['claude', 'codex']);

/**
 * Parse a simple TOML file (key = "value" pairs, no nested tables).
 *
 * Handles the `.agent.toml` manifest format used by Codex agents.
 * Does not support full TOML — only string values and bare keys.
 *
 * @param content - TOML file content
 * @returns Record of key-value pairs
 */
export function parseSimpleToml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(\w+)\s*=\s*"([^"]*)"$/);
    if (match && match[1] !== undefined && match[2] !== undefined) {
      result[match[1]] = match[2];
    }
  }
  return result;
}

/**
 * Resolve which platform to dispatch to.
 *
 * Resolution chain: --platform flag → ANA_PLATFORM env → sole platform
 * in ana.json → error with guidance.
 *
 * @param projectRoot - Project root directory
 * @param platformFlag - Explicit --platform flag value (may be undefined)
 * @returns Resolved platform name ('claude' or 'codex')
 */
export function resolvePlatform(projectRoot: string, platformFlag: string | undefined): string {
  // 1. Explicit --platform flag
  if (platformFlag) {
    return platformFlag;
  }

  // 2. ANA_PLATFORM environment variable
  const envPlatform = process.env['ANA_PLATFORM'];
  if (envPlatform) {
    return envPlatform;
  }

  // 3. Sole platform in ana.json
  let platforms: string[] = ['claude'];
  try {
    const raw = fs.readFileSync(path.join(projectRoot, '.ana', 'ana.json'), 'utf-8');
    const parsed = AnaJsonSchema.parse(JSON.parse(raw));
    platforms = parsed.platforms ?? ['claude'];
  } catch {
    return 'claude';
  }

  if (platforms.length === 1 && platforms[0] !== undefined) {
    return platforms[0];
  }

  if (platforms.length > 1) {
    console.error(chalk.red(`Error: Multiple platforms configured (${platforms.join(', ')}). Specify which to use:`));
    console.error(chalk.red(`  ana run build --platform codex`));
    console.error(chalk.red(`  or set ANA_PLATFORM=codex`));
    process.exit(1);
  }

  // Empty platforms — fall through to default
  return 'claude';
}

/**
 * Read the Codex agent TOML manifest.
 *
 * Reads `.codex/agents/{agentName}.agent.toml` from the project root
 * and returns the parsed key-value pairs.
 *
 * @param projectRoot - Project root directory
 * @param agentName - Agent name (e.g. 'ana-build')
 * @returns Parsed TOML fields, or null if not found
 */
function readAgentToml(projectRoot: string, agentName: string): Record<string, string> | null {
  const tomlPath = path.join(projectRoot, '.codex', 'agents', `${agentName}.agent.toml`);
  try {
    const content = fs.readFileSync(tomlPath, 'utf-8');
    return parseSimpleToml(content);
  } catch {
    return null;
  }
}

/**
 * Dispatch an agent invocation to Codex.
 *
 * For interactive agents (Think, Setup): opens the Codex TUI with
 * developer_instructions loaded from the agent's prompt file.
 * For non-interactive agents (Build, Plan, Verify): runs `codex exec`
 * with the prompt injected via `$(cat)`.
 *
 * @param projectRoot - Project root directory
 * @param agentSuffix - Agent suffix (e.g. 'build', '')
 * @param agentName - Full agent name (e.g. 'ana-build')
 * @param passthroughArgs - Extra arguments after --
 */
function dispatchToCodex(
  projectRoot: string,
  agentSuffix: string,
  agentName: string,
  passthroughArgs: string[],
): void {
  // Learn is not available on Codex
  if (agentSuffix === 'learn') {
    console.error(chalk.red('Error: The Learn agent is not yet available on Codex.'));
    console.error(chalk.red('  Use Claude Code instead: claude --agent ana-learn'));
    process.exit(1);
  }

  // Check codex executable
  if (!isExecutableInPath('codex')) {
    console.error(chalk.red('Error: codex not found in PATH.'));
    console.error(chalk.red('  Install: https://openai.com/codex'));
    process.exit(1);
  }

  // Advisory pipeline state check (same as Claude dispatch)
  advisoryPipelineCheck(projectRoot, agentSuffix);

  // Read TOML manifest
  const toml = readAgentToml(projectRoot, agentName);
  const model = toml?.['model'] ?? 'gpt-5.5';
  const sandboxMode = toml?.['sandbox_mode'] ?? 'danger-full-access';

  // Read prompt file path
  const promptPath = path.join(projectRoot, '.codex', 'agents', `${agentName}.md`);
  if (!fs.existsSync(promptPath)) {
    console.error(chalk.red(`Error: Agent prompt not found: ${promptPath}`));
    process.exit(1);
  }

  // Read platform flags for codex
  const flags = getPlatformFlags(projectRoot, 'codex');

  // All agents run in interactive TUI mode — same experience as Claude Code.
  const flagStr = [...flags, ...passthroughArgs].map(f => `'${f}'`).join(' ');
  const cmd = `codex --model '${model}' --sandbox '${sandboxMode}' -c "developer_instructions=$(cat '${promptPath}')" ${flagStr}`;

  const result = spawnSync(cmd, {
    stdio: 'inherit',
    cwd: projectRoot,
    shell: true,
  });

  process.exit(result.status ?? 1);
}

/**
 * Find the project root by walking up from cwd looking for `.ana/`.
 *
 * @returns The project root path, or null if not found
 */
function findRunProjectRoot(): string | null {
  let dir = process.cwd();
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, '.ana'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Check if an executable is available in PATH.
 *
 * @param name - Executable name
 * @returns True if the executable is found
 */
function isExecutableInPath(name: string): boolean {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(cmd, [name], { encoding: 'utf-8', stdio: 'pipe' });
  return result.status === 0;
}

/**
 * Run an advisory pipeline state check.
 *
 * Reads the pipeline state directory and checks if any work item
 * is at the appropriate stage for the requested agent. Prints a
 * warning if not — does not block execution.
 *
 * @param projectRoot - Project root path
 * @param agentSuffix - The agent suffix being invoked
 */
function advisoryPipelineCheck(projectRoot: string, agentSuffix: string): void {
  // Only check for agents with pipeline stage expectations
  if (!['plan', 'build', 'verify'].includes(agentSuffix)) {
    return;
  }

  try {
    const plansDir = path.join(projectRoot, '.ana', 'plans', 'active');
    if (!fs.existsSync(plansDir)) return;

    const slugDirs = fs.readdirSync(plansDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    // Lightweight file-existence check: does any work item have the
    // right artifact state for this agent? No .saves.json reads, no
    // timestamps, no git — just files on disk.
    for (const slug of slugDirs) {
      const slugDir = path.join(plansDir, slug);
      const hasScope = fs.existsSync(path.join(slugDir, 'scope.md'));
      const hasPlan = fs.existsSync(path.join(slugDir, 'plan.md'));

      if (agentSuffix === 'plan' && hasScope && !hasPlan) {
        return; // scope exists, plan missing → ready for plan
      }

      if (agentSuffix === 'build' && hasPlan) {
        return; // plan exists → plausibly ready for build (or in progress)
      }

      if (agentSuffix === 'verify' && hasPlan) {
        return; // plan exists → plausibly ready for verify (build may be done)
      }
    }

    // No work item at the expected stage
    console.log(chalk.yellow(`⚠ No work item at ${agentSuffix} stage. Continuing anyway.`));
  } catch {
    // Advisory check is best-effort — don't block on errors
  }
}

/**
 * Execute the ana run command.
 *
 * Resolves the target platform, then dispatches to either the Claude
 * or Codex execution path. Claude dispatch uses `claude --agent`.
 * Codex dispatch reads `.agent.toml` manifests and uses `codex exec`
 * (non-interactive) or `codex` (interactive TUI).
 *
 * @param agentSuffix - Agent suffix (e.g. 'build', 'plan', '' for Think)
 * @param passthroughArgs - Extra arguments after --
 * @param platformFlag - Explicit --platform flag value (optional)
 */
export function executeRun(agentSuffix: string, passthroughArgs: string[], platformFlag?: string): void {
  // 1. Find project root
  const projectRoot = findRunProjectRoot();
  if (!projectRoot) {
    console.error(chalk.red('Error: No Anatomia project found. Run `ana init` first.'));
    process.exit(1);
  }

  // 2. Resolve agent name
  const agentName = AGENT_MAP[agentSuffix];
  if (agentName === undefined) {
    console.error(chalk.red(`Error: Unknown agent "${agentSuffix}".`));
    console.error(chalk.gray(`Available agents: ${Object.keys(AGENT_MAP).filter(k => k !== '').join(', ')}`));
    process.exit(1);
  }

  // 3. Resolve platform
  const platform = resolvePlatform(projectRoot, platformFlag);

  // 3b. Validate platform
  if (!KNOWN_PLATFORMS.has(platform)) {
    console.error(chalk.red(`Error: Unknown platform "${platform}".`));
    console.error(chalk.gray(`Available platforms: ${[...KNOWN_PLATFORMS].join(', ')}`));
    process.exit(1);
  }

  // 4. Dispatch to platform
  if (platform === 'codex') {
    dispatchToCodex(projectRoot, agentSuffix, agentName, passthroughArgs);
    return;
  }

  // Claude dispatch (existing behavior)
  dispatchToClaude(projectRoot, agentSuffix, agentName, passthroughArgs);
}

/**
 * Dispatch an agent invocation to Claude Code.
 *
 * This is the original dispatch path — spawns `claude --agent` with
 * platformFlags and passthrough args.
 *
 * @param projectRoot - Project root directory
 * @param agentSuffix - Agent suffix (e.g. 'build', '')
 * @param agentName - Full agent name (e.g. 'ana-build')
 * @param passthroughArgs - Extra arguments after --
 */
function dispatchToClaude(
  projectRoot: string,
  agentSuffix: string,
  agentName: string,
  passthroughArgs: string[],
): void {
  // Read platform flags
  const flags = getPlatformFlags(projectRoot);

  // Check --agent conflict in platformFlags
  if (flags.some(f => f.startsWith('--agent'))) {
    console.error(chalk.red('Error: platformFlags.claude contains --agent, which conflicts with ana run\'s agent selection.'));
    console.error(chalk.red('Remove --agent from platformFlags in .ana/ana.json.'));
    process.exit(1);
  }

  // Check executable availability
  if (!isExecutableInPath('claude')) {
    console.error(chalk.red('Error: claude not found. Install Claude Code: https://docs.anthropic.com/s/claude-code'));
    process.exit(1);
  }

  // Advisory pipeline state check
  advisoryPipelineCheck(projectRoot, agentSuffix);

  // Build args and spawn
  const args = ['--agent', agentName, ...flags, ...passthroughArgs];

  const result = spawnSync('claude', args, {
    stdio: 'inherit',
    cwd: projectRoot,
  });

  process.exit(result.status ?? 1);
}

/**
 * Register the `ana run` command with the program.
 *
 * @param program - Commander program instance
 */
export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Run an Anatomia agent')
    .argument('[agent]', 'Agent to run (build, plan, verify, setup, learn)', '')
    .option('--platform <platform>', 'Platform to use (claude, codex)')
    .allowUnknownOption(true)
    .action((agent: string, opts: { platform?: string }) => {
      // Collect passthrough args: everything after '--' in process.argv
      const dashDashIdx = process.argv.indexOf('--');
      const passthroughArgs = dashDashIdx >= 0 ? process.argv.slice(dashDashIdx + 1) : [];

      executeRun(agent, passthroughArgs, opts.platform);
    });
}
