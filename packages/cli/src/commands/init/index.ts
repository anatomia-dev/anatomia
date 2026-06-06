/**
 * ana init - Initialize .ana/ context framework.
 *
 * Exports registerInitCommand. The action handler orchestrates the 9-phase
 * init pipeline by calling into sibling modules.
 *
 * Swap-based atomic rename replaces the backup-then-delete
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
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getProjectName } from '../../utils/validators.js';
import { isWorktreeDirectory } from '../../utils/worktree.js';
import type { InitCommandOptions } from './types.js';
import { validateInitPreconditions } from './preflight.js';
import { registerInitCommitCommand, discoverGitignoredFiles } from './commit.js';
import {
  createDirectoryStructure,
  generateScaffolds,
  createClaudeConfiguration,
  createCodexConfiguration,
  createSkillSymlinks,
  generateAgentsMd,
  generatePrimaryPackageAgentsMd,
} from './assets.js';
import {
  runAnalyzer,
  saveScanJson,
  createAnaJson,
  buildSymbolIndexSafe,
  atomicRename,
  displaySuccessMessage,
  preserveUserState,
  detectPlatforms,
  migrateSkillsToCanonical,
  getTemplatesDir,
  getCliVersion,
} from './state.js';
import { scaffoldAndSeedSkills } from './skills.js';

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
    .option('--platforms <platforms>', 'Comma-separated list of platforms (claude,codex)')
    .addHelpText('after', '\nEXAMPLES\n  $ ana init\n  $ ana init --yes\n  $ ana init --platforms claude,codex')
    .action(async (options: InitCommandOptions, command: Command) => {
    // Reject running from a worktree
    if (isWorktreeDirectory()) {
      console.error(chalk.red('Error: Run init from the main project directory, not from a worktree.'));
      process.exit(1);
    }

    // Reject positional arguments (init operates on cwd)
    if (command.args.length > 0) {
      console.error(chalk.red(`Error: ana init does not accept a path argument.`));
      console.error(chalk.gray('cd into the project directory and run: ana init'));
      process.exit(1);
    }

    const cwd = process.cwd();
    const anaPath = path.join(cwd, '.ana');

    // Phase 1: Pre-scan validation
    //   - Classifies the existing install (fresh/reinit/upgrade/corrupted)
    //   - Detects stale .ana.old-* dirs from an interrupted prior init
    //   - Does NOT back up, does NOT delete
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
      const newAnaConfig = await createAnaJson(tmpAnaPath, engineResult, cwd);
      await buildSymbolIndexSafe(cwd, tmpAnaPath);

      // Preserve user state from the still-existing .ana/
      const mergedConfig = preflight.anaExisted
        ? await preserveUserState(anaPath, tmpAnaPath, newAnaConfig)
        : null;

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

      // Determine platforms — flag > existing ana.json > auto-detect
      const platforms = resolvePlatforms(options, preflight.anaExisted, cwd);

      // Update ana.json with resolved platforms
      const anaJsonPath = path.join(anaPath, 'ana.json');
      try {
        const anaJsonContent = JSON.parse(await fs.readFile(anaJsonPath, 'utf-8'));
        anaJsonContent.platforms = platforms;
        await fs.writeFile(anaJsonPath, JSON.stringify(anaJsonContent, null, 2), 'utf-8');
      } catch {
        // ana.json missing or malformed — platforms will be default
      }

      // Migrate .claude/skills/ real dir → .ana/skills/ + symlink (re-init only)
      if (preflight.anaExisted) {
        await migrateSkillsToCanonical(cwd);
      }

      // Skills go to .ana/skills/ (canonical location, shared by all platforms)
      const skillsPath = path.join(anaPath, 'skills');
      const templatesDir = getTemplatesDir();
      await scaffoldAndSeedSkills(skillsPath, templatesDir, engineResult, preflight.initState);

      // Platform-conditional configuration.
      // Re-init refreshes agent instruction bodies + CLAUDE.md from stock;
      // the returned lists name files whose instruction content actually changed.
      const changedFiles: string[] = [];
      if (platforms.includes('claude')) {
        changedFiles.push(...await createClaudeConfiguration(cwd, engineResult, preflight.initState));
      }
      if (platforms.includes('codex')) {
        changedFiles.push(...await createCodexConfiguration(cwd, preflight.initState));
      }

      // Content-gated consolidated warning — one entry listing only the files
      // whose instruction content changed, with conditional git-recovery
      // guidance. Silent on a fresh install or a no-op re-init. Non-blocking.
      if (changedFiles.length > 0) {
        const uniqueChanged = [...new Set(changedFiles)];
        const cliVersion = await getCliVersion();
        preflight.warnings.push(
          `Refreshed to v${cliVersion} stock: ${uniqueChanged.join(', ')}\n`
          + 'If you customized these, recover your version from git\n'
          + '(e.g. git log -- .claude/agents/ana-build.md)'
        );
      }

      // Cross-tool files — always generated regardless of platform
      // CLAUDE.md is handled inside createClaudeConfiguration (Claude-specific)
      await generateAgentsMd(cwd, engineResult);
      await generatePrimaryPackageAgentsMd(cwd, engineResult);

      // Skill symlinks — connect platform dirs to canonical .ana/skills/
      await createSkillSymlinks(cwd, platforms);

      // Check for gitignored infrastructure files and warn before commit
      try {
        const gitignoredFiles = discoverGitignoredFiles(cwd, []);
        if (gitignoredFiles.length > 0) {
          preflight.warnings.push(
            'Some infrastructure files under .claude/ are gitignored\n'
            + 'ana init commit will force-add them for worktree compatibility.\n'
            + 'Use --respect-gitignore to skip. See: ana init commit --help'
          );
        }
      } catch {
        // Silently skip — the warning is a nice-to-have, not a gate
      }

      // Display success
      const scanTime = ((Date.now() - scanStart) / 1000).toFixed(1);
      const projectName = await getProjectName(cwd);
      displaySuccessMessage(engineResult, projectName, scanTime, mergedConfig ?? newAnaConfig, preflight.warnings);
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

  registerInitCommitCommand(initCommand);
  program.addCommand(initCommand);
}

/**
 * Resolve which platforms to configure.
 *
 * Priority: --platforms flag > existing ana.json > auto-detect from PATH.
 * Re-init preserves platforms from existing ana.json if no flag is given.
 *
 * @param options - Command options (may contain platforms flag)
 * @param anaExisted - Whether .ana/ existed before init
 * @param cwd - Project root directory
 * @returns Array of platform names
 */
function resolvePlatforms(options: InitCommandOptions, anaExisted: boolean, cwd: string): string[] {
  // Explicit flag takes priority
  if (options.platforms) {
    const platforms = options.platforms.split(',').map((p: string) => p.trim()).filter(Boolean);
    if (platforms.length > 0) return platforms;
  }

  // Re-init: preserve from existing ana.json
  if (anaExisted) {
    try {
      const anaJsonPath = path.join(cwd, '.ana', 'ana.json');
      const raw = JSON.parse(readFileSync(anaJsonPath, 'utf-8'));
      if (Array.isArray(raw.platforms) && raw.platforms.length > 0) {
        return raw.platforms;
      }
    } catch {
      // Fall through to auto-detect
    }
  }

  // Auto-detect from PATH
  return detectPlatforms();
}
