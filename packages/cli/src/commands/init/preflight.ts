/**
 * Pre-flight validation for ana init.
 *
 * Runs before any filesystem mutation. Verifies the current directory is
 * a valid project root, detects any existing .ana/ installation state
 * (fresh / reinit / upgrade / corrupted), warns on missing git or package
 * manifest, and returns a PreflightResult telling the orchestrator whether
 * to proceed.
 *
 * Preflight no longer backs up or deletes `.ana/`. The
 * existing installation is left in place until the atomic swap at the
 * end of the pipeline. User state is copied from the live `.ana/` into
 * tmpDir by preserveUserState (state.ts). "No changes made" in the
 * catch block is now true — if the swap never happens, the old `.ana/`
 * is untouched.
 *
 * Exported helpers (dirExists, fileExists) are reused by sibling modules
 * (assets.ts uses them for mkdir/copy logic; skills.ts uses fileExists
 * for SKILL.md existence checks). confirm() lives in state.ts (not here)
 * to break a preflight ↔ state cycle — preflight → state is one-way.
 */

import chalk from 'chalk';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { runGit } from '../../utils/git-operations.js';
import type { InitCommandOptions, InitState, PreflightResult } from './types.js';
import { confirm, getCliVersion } from './state.js';

/**
 * Phase 1: Pre-scan validation (D7)
 *
 * Validates project environment before scanning:
 * 7.1 — Project root detection
 * 7.2 — Existing installation detection (fresh/reinit/upgrade/corrupted)
 * 7.4 — Git validation (4 states)
 * 7.5 — Package manager check
 *
 * @param cwd - Current working directory
 * @param anaPath - Path to .ana/ directory
 * @param options - Command options
 * @returns Preflight result (canProceed, initState, anaExisted)
 */
export async function validateInitPreconditions(
  cwd: string,
  anaPath: string,
  options: InitCommandOptions
): Promise<PreflightResult> {
  const autoYes = options.yes || options.force;

  // Check directory is readable/writable
  try {
    await fs.access(cwd, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    console.error(chalk.red('Error: Cannot read/write current directory'));
    console.error(chalk.gray('Check permissions: ls -la .'));
    process.exit(1);
  }

  // SIGKILL recovery check — refuse to proceed if a prior init was
  // interrupted between rename(anaPath → .old) and rename(tmpDir → anaPath).
  // The user must manually resolve to prevent silent data loss.
  const parentDir = path.dirname(anaPath);
  const parentName = path.basename(anaPath);
  try {
    const siblings = await fs.readdir(parentDir);
    const staleOld = siblings.find(n => n.startsWith(`${parentName}.old-`));
    if (staleOld) {
      const staleOldPath = path.join(parentDir, staleOld);
      console.error(chalk.yellow('\n⚠ Found incomplete init from a previous run:'));
      console.error(chalk.gray(`  ${staleOldPath}`));
      console.error('');
      console.error('This usually means a prior `ana init` was interrupted mid-swap.');
      console.error('To recover:');
      console.error(chalk.cyan(`  mv ${staleOld} .ana`) + chalk.gray('  (restore the previous install)'));
      console.error(chalk.gray('  — or —'));
      console.error(chalk.cyan(`  rm -rf ${staleOld}`) + chalk.gray('   (discard and run `ana init` fresh)'));
      console.error('');
      console.error(chalk.red('Refusing to proceed until resolved.'));
      process.exit(1);
    }
  } catch {
    // parentDir may not exist on first init — not an error
  }

  // 7.1 — Project root detection
  const rootIndicators = ['package.json', 'go.mod', 'Cargo.toml', 'pyproject.toml', '.git'];
  const hasRoot = await Promise.all(
    rootIndicators.map(f => fileExists(path.join(cwd, f)))
  ).then(results => results.some(Boolean));

  if (!hasRoot) {
    console.error(chalk.red('No project root detected in this directory.'));
    console.error(chalk.gray("Run `ana init` from your project's root directory."));
    process.exit(1);
  }

  // 7.2 — Existing installation detection (4 states)
  const anaExists = await dirExists(anaPath);
  let initState: InitState = 'fresh';

  if (anaExists) {
    const anaJsonPath = path.join(anaPath, 'ana.json');
    const cliVersion = await getCliVersion();

    try {
      const anaJsonContent = await fs.readFile(anaJsonPath, 'utf-8');
      const config = JSON.parse(anaJsonContent);

      if (config.anaVersion && config.anaVersion !== cliVersion) {
        // Upgrade: version mismatch
        initState = 'upgrade';
        console.log(`\nAnatomia installation detected (v${config.anaVersion}).`);
        console.log(`Current CLI version: v${cliVersion}.\n`);
        console.log('Re-initializing will update scan data and skill detection.');
        console.log('Your confirmed rules, gotchas, and context files are preserved.\n');

        if (!autoYes) {
          const proceed = await confirm('Continue?', true);
          if (!proceed) { process.exit(0); }
        }
      } else {
        // Re-init: same version (or no anaVersion field yet)
        initState = 'reinit';
        console.log('\nExisting Anatomia installation detected.\n');
        console.log('This will:');
        console.log('  ✓ Refresh scan data');
        console.log('  ✓ Update skill ## Detected sections');
        console.log('  ✓ Add new skills if stack changes detected');
        console.log('  ✗ Will NOT touch your confirmed rules, gotchas, or context files\n');

        if (!autoYes) {
          const proceed = await confirm('Continue?', true);
          if (!proceed) { process.exit(0); }
        }
      }
    } catch {
      // Corrupted: .ana/ exists but no valid ana.json
      initState = 'corrupted';
      console.log(chalk.yellow('\nFound .ana/ directory but no valid ana.json.'));
      console.log('Treating as fresh initialization. Existing files may be overwritten.\n');

      if (!autoYes) {
        const proceed = await confirm('Continue?', true);
        if (!proceed) { process.exit(0); }
      }
    }

    // No backup, no deletion. The existing .ana/ stays put
    // until the atomic swap at the end of the pipeline. preserveUserState
    // (state.ts) will read context/, state/setup-progress.json, and
    // ana.json directly from the live .ana/ when building the replacement
    // in tmpDir.
  }

  // 7.4 — Git validation (4 states)
  const hasGit = await dirExists(path.join(cwd, '.git'));
  const warnings: string[] = [];

  if (!hasGit) {
    // No git at all — strong warning, default NO
    console.log(chalk.yellow('\n⚠ No git repository detected.\n'));
    console.log("Anatomia's pipeline requires git for:");
    console.log('  • Feature branching (ana work start)');
    console.log('  • Artifact commits (ana artifact save)');
    console.log('  • Pull requests (ana pr create)');
    console.log('  • Proof chain tracking\n');
    console.log('Init will continue but pipeline commands will not function.');
    console.log('Scan, skills, and context files will still work.\n');

    if (!autoYes) {
      const proceed = await confirm('Initialize without git?', false);
      if (!proceed) { process.exit(0); }
    }
  } else {
    // Git exists — check remote and commits
    try {
      const hasCommits = gitHasCommits(cwd);
      const hasRemote = gitHasRemote(cwd);

      if (hasCommits && !hasRemote) {
        console.log(chalk.blue('ℹ No remote detected. artifactBranch will use local branch names.'));
        console.log(chalk.blue('  ana pr create won\'t function until a remote is added.'));
        console.log(chalk.blue('  git remote add origin <url>'));
        warnings.push('No remote detected — add one with: git remote add origin <url>');
      } else if (!hasCommits) {
        console.log(chalk.yellow('⚠ Empty git repository. Some scan data will be limited. Commit at least once before running the pipeline.'));
      }
      // Git + remote + commits = happy path, proceed silently
    } catch {
      // Git check failed — proceed with warning
      console.log(chalk.yellow('⚠ Git validation failed. Proceeding with limited git detection.'));
    }

    // Git user identity checks — missing user.name/email causes commit failures
    const userName = runGit(['config', 'user.name'], { cwd });
    if (userName.exitCode !== 0 || !userName.stdout.trim()) {
      const msg = 'git user.name not configured — git config --global user.name "Your Name"';
      console.log(chalk.yellow(`⚠ ${msg}`));
      warnings.push(msg);
    }
    const userEmail = runGit(['config', 'user.email'], { cwd });
    if (userEmail.exitCode !== 0 || !userEmail.stdout.trim()) {
      const msg = 'git user.email not configured — git config --global user.email "you@example.com"';
      console.log(chalk.yellow(`⚠ ${msg}`));
      warnings.push(msg);
    }
  }

  // 7.4b — GitHub CLI check (pipeline dependency, not a gate)
  const ghCheck = spawnSync('gh', ['--version'], { stdio: 'pipe' });
  if (ghCheck.status !== 0) {
    const msg = 'gh CLI not installed — PR creation unavailable\n      Install from https://cli.github.com/\n      The pipeline works without it through Build/Verify';
    console.log(chalk.yellow(`⚠ ${msg}`));
    warnings.push(msg);
  }

  // 7.5 — Package manager check
  const hasPackageJson = await fileExists(path.join(cwd, 'package.json'));
  const hasGoMod = await fileExists(path.join(cwd, 'go.mod'));
  const hasCargo = await fileExists(path.join(cwd, 'Cargo.toml'));
  const hasPyproject = await fileExists(path.join(cwd, 'pyproject.toml'));
  const hasPackageManifest = hasPackageJson || hasGoMod || hasCargo || hasPyproject;

  if (!hasPackageManifest) {
    console.log(chalk.yellow('⚠ No package.json (or equivalent) found. Stack detection will be limited.'));
  } else if (hasPackageJson) {
    const hasNodeModules = await dirExists(path.join(cwd, 'node_modules'));
    if (!hasNodeModules) {
      // Detect package manager for the message
      let pkgMgr = 'npm';
      if (await fileExists(path.join(cwd, 'pnpm-lock.yaml'))) pkgMgr = 'pnpm';
      else if (await fileExists(path.join(cwd, 'yarn.lock'))) pkgMgr = 'yarn';
      else if (await fileExists(path.join(cwd, 'bun.lockb'))) pkgMgr = 'bun';
      console.log(chalk.blue(`ℹ Dependencies not installed. Convention detection may be limited. Run ${pkgMgr} install for deeper detection.`));
    }
  }

  return {
    canProceed: true,
    initState,
    anaExisted: anaExists,
    warnings,
  };
}

/**
 * Check if git repository has any commits
 * @param cwd - Working directory
 * @returns true if HEAD exists (has commits)
 */
function gitHasCommits(cwd: string): boolean {
  const result = runGit(['rev-parse', '--verify', 'HEAD'], { cwd });
  return result.exitCode === 0;
}

/**
 * Check if git repository has a remote configured
 * @param cwd - Working directory
 * @returns true if at least one remote exists
 */
function gitHasRemote(cwd: string): boolean {
  const result = runGit(['remote'], { cwd });
  return result.exitCode === 0 && result.stdout.length > 0;
}

/**
 * Check if directory exists
 * @param dirPath - Path to check
 * @returns true if directory exists
 */
export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if file exists
 * @param filePath - Path to check
 * @returns true if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}
