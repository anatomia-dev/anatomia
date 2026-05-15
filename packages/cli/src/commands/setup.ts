/**
 * ana setup - Setup-related commands
 *
 * Subcommands:
 * - complete: Validate context files and finalize setup
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'node:path';
import { DOCS_SETUP_GUIDE } from '../constants.js';
import * as fs from 'node:fs/promises';
import { pathExists, findProjectRoot } from '../utils/validators.js';
import { isWorktreeDirectory } from '../utils/worktree.js';
import { createCheckCommand } from './check.js';
import { createIndexCommand } from './symbol-index.js';
import { validateSetupCompletion } from './check.js';

interface SetupCompleteOptions {
  force?: boolean;
}

/**
 * Register the `setup` command (with `check`, `index`, `complete` sub-commands).
 *
 * @param program - Commander program instance.
 */
export function registerSetupCommand(program: Command): void {
  const setupCommand = new Command('setup').description(
    'Enrich context with team knowledge'
  );

  setupCommand.addCommand(createCheckCommand());
  setupCommand.addCommand(createIndexCommand(), { hidden: true });

  // Bare `ana setup` should tell the user that setup is an
  // agent flow, not a CLI action. `ana init` and `ana scan` have root
  // actions because they ARE CLI operations; `ana setup` is different —
  // the main operation runs inside a Claude Code agent. Showing auto-
  // generated help gives the user nothing actionable.
  setupCommand.action(() => {
    console.log(chalk.bold('\nSetup is an interactive agent flow.\n'));
    console.log(`  ${chalk.cyan('claude --agent ana-setup')}`);
    console.log();
    console.log(`  ${chalk.bold('Guide')}  ${chalk.gray(DOCS_SETUP_GUIDE)}`);
    console.log();
    console.log(chalk.gray('Subcommands:'));
    console.log(chalk.gray('  ana setup check     — validate setup state'));
    console.log(chalk.gray('  ana setup complete  — finalize setup'));
    console.log();
  });

  setupCommand
    .command('complete')
    .description('Validate context files and finalize setup')
    .option('--force', 'Force complete regardless of validation')
    .action(async (options: SetupCompleteOptions) => {
    // Guard: cannot run from inside a worktree
    if (isWorktreeDirectory()) {
      console.error(chalk.red('Error: Run setup from the main project directory, not from a worktree.'));
      process.exit(1);
    }

    const cwd = findProjectRoot();
    const anaPath = path.join(cwd, '.ana');
    const anaJsonPath = path.join(anaPath, 'ana.json');

    // Check .ana/ exists
    if (!(await pathExists(anaPath))) {
      console.error(chalk.red('Error: .ana/ directory not found'));
      console.error(
        chalk.gray('Run `ana init` first to create .ana/ structure.')
      );
      process.exit(1);
    }

    // Check ana.json exists
    if (!(await pathExists(anaJsonPath))) {
      console.error(chalk.red('Error: ana.json not found'));
      console.error(chalk.gray('Run `ana init` first.'));
      process.exit(1);
    }

    console.log(chalk.blue('\nValidating setup...\n'));

    // Run validation
    const result = await validateSetupCompletion(cwd);

    // --force overrides to "complete"
    const finalPhase = options.force ? 'complete' : result.setupPhase;

    // Display warnings
    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        console.log(chalk.yellow(`  ⚠ ${w}`));
      }
      console.log();
    }

    // Update ana.json
    let config: Record<string, unknown>;
    try {
      const content = await fs.readFile(anaJsonPath, 'utf-8');
      config = JSON.parse(content);
    } catch {
      config = {};
    }

    config['setupPhase'] = finalPhase;
    await fs.writeFile(anaJsonPath, JSON.stringify(config, null, 2), 'utf-8');

    // Handle setup-progress.json lifecycle
    const progressPath = path.join(anaPath, 'state', 'setup-progress.json');
    if (finalPhase === 'complete') {
      // Delete on complete
      try {
        await fs.unlink(progressPath);
      } catch {
        // File may not exist — that's fine
      }
    }
    // If partial: keep for resume (no action needed)

    // Display summary
    const { stats } = result;
    if (finalPhase === 'complete') {
      console.log(chalk.green('✓ Setup complete\n'));
      console.log(`  Skills:     ${stats.skillsCalibrated} calibrated`);
      console.log(`  Context:    ${stats.contextSections.populated}/${stats.contextSections.total} sections`);
      console.log(`  Principles: ${stats.principlesCaptured ? 'captured' : 'skipped'}`);
      console.log();
      console.log(`  Ana now knows your team. Start working:`);
      console.log(`  claude --agent ana`);
      console.log();
    } else {
      console.log(chalk.yellow('✓ Setup complete (partial)\n'));
      for (const w of result.warnings) {
        console.log(chalk.yellow(`  ⚠ ${w}`));
      }
      console.log();
      console.log(`  Run ${chalk.cyan('ana setup')} to fill remaining sections.`);
      console.log(`  claude --agent ana`);
      console.log();
    }
  });

  program.addCommand(setupCommand);
}
