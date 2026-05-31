/**
 * ana run - Universal agent invocation surface.
 *
 * Maps `ana run build` → `claude --agent ana-build`, appending
 * platformFlags from ana.json automatically. Provides advisory
 * pipeline state checking and --agent conflict guards.
 *
 * Usage:
 *   ana run [agent] [-- ...args]
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
  // Map agent suffix to expected pipeline stages
  const stageMap: Record<string, string[]> = {
    plan: ['ready-for-plan'],
    build: ['ready-for-build', 'build-in-progress', 'needs-fixes'],
    verify: ['ready-for-verify', 'ready-for-re-verify'],
  };

  const expectedStages = stageMap[agentSuffix];
  if (!expectedStages) {
    // No pipeline stage expectation for this agent (setup, learn, think)
    return;
  }

  try {
    const plansDir = path.join(projectRoot, '.ana', 'plans', 'active');
    if (!fs.existsSync(plansDir)) return;

    const slugDirs = fs.readdirSync(plansDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    // Check if ANY work item is at an appropriate stage
    // We do a lightweight check: look for .saves.json stage markers
    for (const slug of slugDirs) {
      const savesPath = path.join(plansDir, slug, '.saves.json');
      if (!fs.existsSync(savesPath)) continue;

      try {
        const saves = JSON.parse(fs.readFileSync(savesPath, 'utf-8'));
        const stage = saves.stage as string | undefined;
        if (stage && expectedStages.some(s => stage.includes(s))) {
          return; // Found a matching stage, no warning needed
        }
      } catch {
        // Skip malformed saves files
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
 * @param agentSuffix - Agent suffix (e.g. 'build', 'plan', '' for Think)
 * @param passthroughArgs - Extra arguments after --
 */
export function executeRun(agentSuffix: string, passthroughArgs: string[]): void {
  // 1. Find project root
  const projectRoot = findRunProjectRoot();
  if (!projectRoot) {
    console.error(chalk.red('Error: No Anatomia project found. Run `ana init` first.'));
    process.exit(1);
  }

  // 2. Read platform flags
  const flags = getPlatformFlags(projectRoot);

  // 3. Check --agent conflict in platformFlags
  if (flags.some(f => f.startsWith('--agent'))) {
    console.error(chalk.red('Error: platformFlags.claude contains --agent, which conflicts with ana run\'s agent selection.'));
    console.error(chalk.red('Remove --agent from platformFlags in .ana/ana.json.'));
    process.exit(1);
  }

  // 4. Resolve agent name
  const agentName = AGENT_MAP[agentSuffix];
  if (agentName === undefined) {
    console.error(chalk.red(`Error: Unknown agent "${agentSuffix}".`));
    console.error(chalk.gray(`Available agents: ${Object.keys(AGENT_MAP).filter(k => k !== '').join(', ')}`));
    process.exit(1);
  }

  // 5. Check executable availability
  if (!isExecutableInPath('claude')) {
    console.error(chalk.red('Error: claude not found. Install Claude Code: https://docs.anthropic.com/s/claude-code'));
    process.exit(1);
  }

  // 6. Advisory pipeline state check
  advisoryPipelineCheck(projectRoot, agentSuffix);

  // 7. Build args and spawn
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
    .allowUnknownOption(true)
    .action((agent: string) => {
      // Collect passthrough args: everything after '--' in process.argv
      const dashDashIdx = process.argv.indexOf('--');
      const passthroughArgs = dashDashIdx >= 0 ? process.argv.slice(dashDashIdx + 1) : [];

      executeRun(agent, passthroughArgs);
    });
}
