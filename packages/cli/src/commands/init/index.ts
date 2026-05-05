/**
 * ana init - Initialize .ana/ context framework (Item 14c orchestrator).
 *
 * Exports registerInitCommand (Item 22 registration consistency). The
 * action handler orchestrates the 9-phase init pipeline by calling into
 * sibling modules.
 *
 * S19/NEW-001: Swap-based atomic rename replaces the backup-then-delete
 * flow. The existing `.ana/` is left in place throughout phases 2-9. At
 * the swap step we:
 *   1. Build the replacement fully in tmpDir
 *   2. Copy user state (context/, ana.json, setup-progress.json) from
 *      the live `.ana/` into tmpDir via preserveUserState
 *   3. Rename `.ana/` → `.ana.old-{ts}` (atomic, same filesystem)
 *   4. Rename `tmpDir/.ana` → `.ana/` (atomic or cross-FS copy fallback)
 *   5. On success, delete `.ana.old-{ts}`
 *   6. On any failure, roll back: restore `.ana.old-{ts}` → `.ana/`
 *
 * "No changes made to your project" in the catch block is now true:
 * if the swap step never runs, the original `.ana/` is untouched.
 *
 * SIGKILL recovery: if the process dies between step 3 and step 5, a
 * stale `.ana.old-*` directory remains. Preflight detects this on the
 * next init run and refuses to proceed until the user resolves it.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { getProjectName } from '../../utils/validators.js';
import type { InitCommandOptions } from './types.js';
import { validateInitPreconditions } from './preflight.js';
import {
  createDirectoryStructure,
  generateScaffolds,
  createClaudeConfiguration,
} from './assets.js';
import {
  runAnalyzer,
  saveScanJson,
  createAnaJson,
  buildSymbolIndexSafe,
  atomicRename,
  displaySuccessMessage,
  preserveUserState,
} from './state.js';

/**
 * Register the `init` command.
 *
 * @param program - Commander program instance.
 */
export function registerInitCommand(program: Command): void {
  const initCommand = new Command('init')
    .description('Scan project and generate agent context')
    .option('-f, --force', 'Skip confirmation prompts for existing installations')
    .option('-y, --yes', 'Skip confirmation prompts (non-interactive mode)')
    .addHelpText('after', '\nEXAMPLES\n  $ ana init\n  $ ana init --yes')
    .action(async (options: InitCommandOptions, command: Command) => {
    // Reject positional arguments (init operates on cwd)
    if (command.args.length > 0) {
      console.error(chalk.red(`Error: ana init does not accept a path argument.`));
      console.error(chalk.gray('cd into the project directory and run: ana init'));
      process.exit(1);
    }

    const cwd = process.cwd();
    const anaPath = path.join(cwd, '.ana');

    // Phase 1: Pre-scan validation (D7)
    //   - Classifies the existing install (fresh/reinit/upgrade/corrupted)
    //   - Detects stale .ana.old-* dirs from an interrupted prior init
    //   - Does NOT back up, does NOT delete (S19/NEW-001 Option B)
    const preflight = await validateInitPreconditions(cwd, anaPath, options);
    if (!preflight.canProceed) {
      return; // Exit already handled in validation
    }

    // Phase 2-9: Build replacement in tmpDir. Existing .ana/ is untouched.
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-init-'));
    const tmpAnaPath = path.join(tmpDir, '.ana');
    let swapStarted = false;
    const oldPath = `${anaPath}.old-${Date.now()}`;

    try {
      // Redirect AST cache writes to tmpDir during analysis so the
      // existing .ana/state/cache/ is not mutated.
      const { ASTCache } = await import('../../engine/index.js');
      const tmpCacheDir = path.join(tmpAnaPath, 'state', 'cache');
      ASTCache.setCacheDir(tmpCacheDir);

      const scanStart = Date.now();
      const engineResult = await runAnalyzer(cwd);

      ASTCache.setCacheDir(null);
      await createDirectoryStructure(tmpAnaPath);
      await generateScaffolds(tmpAnaPath, engineResult);
      await saveScanJson(tmpAnaPath, engineResult);
      const newAnaConfig = await createAnaJson(tmpAnaPath, engineResult);
      await buildSymbolIndexSafe(cwd, tmpAnaPath);

      // S19/NEW-001: preserve user state from the still-existing .ana/
      if (preflight.anaExisted) {
        await preserveUserState(anaPath, tmpAnaPath, newAnaConfig);
      }

      // Atomic swap:
      //   1. .ana/ → .ana.old-{ts}  (same-FS rename, atomic)
      //   2. tmpDir/.ana → .ana/    (atomic or cross-FS copy fallback)
      //   3. rm .ana.old-{ts}       (success cleanup)
      // Rollback on swap failure: restore .ana.old-{ts} → .ana/
      if (preflight.anaExisted) {
        swapStarted = true;
        await fs.rename(anaPath, oldPath);
      }
      await atomicRename(tmpAnaPath, anaPath);
      if (preflight.anaExisted) {
        await fs.rm(oldPath, { recursive: true, force: true });
      }

      // Create .claude/ configuration (outside .ana/ — merges with existing)
      await createClaudeConfiguration(cwd, engineResult, preflight.initState);

      // Display success
      const scanTime = ((Date.now() - scanStart) / 1000).toFixed(1);
      const projectName = await getProjectName(cwd);
      displaySuccessMessage(engineResult, projectName, scanTime, newAnaConfig);
    } catch (error) {
      // FAILURE: clean up tmp build. If the swap had started, roll back.
      await fs.rm(tmpDir, { recursive: true, force: true });

      // Rollback: if we renamed .ana/ → .old but didn't complete the swap,
      // restore it. Handles both pre-swap errors (never swapped) and
      // swap-rename errors (partial swap).
      if (swapStarted) {
        try {
          // If anaPath was successfully replaced by tmpDir, the new .ana/
          // may exist. Remove it so we can restore the old one.
          const anaExistsNow = await fs
            .stat(anaPath)
            .then(() => true)
            .catch(() => false);
          if (anaExistsNow) {
            await fs.rm(anaPath, { recursive: true, force: true });
          }
          await fs.rename(oldPath, anaPath);
        } catch (rollbackErr) {
          console.error(
            chalk.red(`\n⚠ Rollback failed. Your previous .ana/ is at: ${oldPath}`)
          );
          console.error(
            chalk.gray(`  Run: mv ${path.basename(oldPath)} .ana  (from your project root)`)
          );
          if (rollbackErr instanceof Error) {
            console.error(chalk.gray(`  Rollback error: ${rollbackErr.message}`));
          }
        }
      }

      if (error instanceof Error) {
        console.error(chalk.red(`\nError: Init failed: ${error.message}`));
        console.error(chalk.gray('No changes made to your project.'));
      }
      process.exit(1);
    }
  });

  program.addCommand(initCommand);
}
