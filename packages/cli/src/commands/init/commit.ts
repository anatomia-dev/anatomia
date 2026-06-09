/**
 * ana init commit — persist infrastructure files to git.
 *
 * Commits all infrastructure files (`.ana/`, `.claude/`, `CLAUDE.md`,
 * `AGENTS.md`) to the artifact branch. Follows the guard-commit-push
 * sequence from `artifact save` but at `commitAndPushProofChanges`
 * implementation weight.
 *
 * Guard sequence:
 *   1. Worktree guard — reject if running from a worktree
 *   2. Init guard — `.ana/ana.json` must exist
 *   3. Branch validation — current branch must equal artifact branch
 *   4. Pull with rebase — skip if no remotes, conflict = error
 *   5. Discover infrastructure files via known roots + exclusions
 *   6. Idempotent check — exit 0 if nothing dirty
 *   7. Stage and commit with `--no-verify`
 *   8. Push — soft-fail on push failure
 *
 * Exclusion list (files with their own commit lifecycle):
 *   - `.ana/proof_chain.json`  — managed by `ana work complete`
 *   - `.ana/PROOF_CHAIN.md`    — managed by `ana work complete`
 *   - `.ana/plans/`            — managed by `ana artifact save`
 *   - `.ana/state/`            — gitignored runtime state
 *   - `.ana/worktrees/`        — gitignored runtime state
 *   - `.claude/settings.local.json` — per-developer preference
 *   - `.claude/agent-memory/`  — per-developer session state
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import chalk from 'chalk';
import { isWorktreeDirectory } from '../../utils/worktree.js';
import {
  runGit,
  readArtifactBranch,
  getCurrentBranch,
  readCoAuthor,
} from '../../utils/git-operations.js';
import { findProjectRoot } from '../../utils/validators.js';

/**
 * Paths excluded from infrastructure commits. Each has its own
 * commit lifecycle managed by a different command.
 */
const EXCLUDED_PREFIXES = [
  '.ana/proof_chain.json',
  '.ana/PROOF_CHAIN.md',
  '.ana/plans/',
  '.ana/state/',
  '.ana/worktrees/',
  '.claude/settings.local.json',
  '.claude/agent-memory/',
  '.claude/scheduled_tasks.lock',
  '.codex/settings.local.json',
  '.codex/agent-memory/',
  '.agents/settings.local.json',
  '.agents/agent-memory/',
];

/**
 * Known directory roots that contain infrastructure files.
 */
const KNOWN_ROOTS = [
  '.ana/',
  '.claude/',
  '.codex/',
  '.agents/',
];

/**
 * Known root-level infrastructure files.
 */
const KNOWN_ROOT_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
];

/**
 * Check whether a path is excluded from infrastructure commits.
 *
 * @param filePath - Repo-relative file path from git status
 * @returns True if the path should be excluded
 */
export function isExcluded(filePath: string): boolean {
  return EXCLUDED_PREFIXES.some(prefix => filePath.startsWith(prefix));
}

/**
 * Discover infrastructure files that are dirty (untracked or modified).
 *
 * Walks known directory roots and root-level files, intersects with
 * `git status --porcelain` output. Returns repo-relative paths.
 *
 * @param projectRoot - Project root directory
 * @returns Array of repo-relative paths to dirty infrastructure files
 */
export function discoverDirtyFiles(projectRoot: string): string[] {
  // Get git status — porcelain paths are relative to repo root.
  // Use spawnSync directly (not runGit) because runGit trims stdout,
  // which corrupts the first line's leading space in porcelain format
  // (e.g., " M .ana/ana.json" → "M .ana/ana.json" → slice(3) = "ana/ana.json").
  const statusResult = spawnSync('git', ['status', '--porcelain'], {
    cwd: projectRoot,
    stdio: 'pipe',
    encoding: 'utf-8',
  });
  if (statusResult.status !== 0) {
    return [];
  }

  // Parse porcelain output: "XY path" or "XY path -> renamed"
  const dirtyPaths = new Set<string>();
  const rawOutput = statusResult.stdout ?? '';
  for (const line of rawOutput.split('\n')) {
    if (!line || line.length < 4) continue;
    // Status is first 2 chars, then space, then path
    const filePath = line.slice(3).split(' -> ')[0];
    if (filePath) {
      dirtyPaths.add(filePath);
    }
  }

  if (dirtyPaths.size === 0) {
    return [];
  }

  // Collect infrastructure files from known roots
  const roots = [...KNOWN_ROOTS];

  // Add monorepo AGENTS.md if scan.json has primaryPackage
  const monorepoAgentsMd = resolveMonorepoAgentsMd(projectRoot);
  const rootFiles = [...KNOWN_ROOT_FILES];
  if (monorepoAgentsMd) {
    rootFiles.push(monorepoAgentsMd);
  }

  // Intersect: keep dirty paths that match known roots or root files
  const discovered: string[] = [];

  for (const dirtyPath of dirtyPaths) {
    // Check root files first (exact match)
    if (rootFiles.includes(dirtyPath)) {
      if (!isExcluded(dirtyPath)) {
        discovered.push(dirtyPath);
      }
      continue;
    }

    // Check known roots (prefix match)
    const matchesRoot = roots.some(root => dirtyPath.startsWith(root));
    if (matchesRoot && !isExcluded(dirtyPath)) {
      discovered.push(dirtyPath);
    }
  }

  // Second pass: root files whose parent directories appear as untracked
  // directories in git status (e.g., "?? packages/" when we want
  // "packages/cli/AGENTS.md"). Check if the file exists on disk and
  // its containing untracked directory is in the dirty set.
  for (const rootFile of rootFiles) {
    if (discovered.includes(rootFile)) continue;
    if (isExcluded(rootFile)) continue;

    // Check if any dirty directory entry is a prefix of this root file
    const containedInDirtyDir = [...dirtyPaths].some(dp =>
      dp.endsWith('/') && rootFile.startsWith(dp)
    );
    if (containedInDirtyDir && fs.existsSync(path.join(projectRoot, rootFile))) {
      discovered.push(rootFile);
    }
  }

  return discovered.sort();
}

/**
 * Discover infrastructure files that exist on disk but are gitignored.
 *
 * Enumerates actual files under KNOWN_ROOTS and KNOWN_ROOT_FILES using
 * `fs.readdirSync({ recursive: true })`, filters through `isExcluded()`,
 * batch-checks against `git check-ignore --stdin`, and returns the
 * gitignored subset. Files already in `dirtyFiles` are excluded to
 * prevent double-staging.
 *
 * @param projectRoot - Project root directory
 * @param dirtyFiles - Files already discovered by `discoverDirtyFiles()`
 * @returns Array of repo-relative paths to gitignored infrastructure files
 */
export function discoverGitignoredFiles(projectRoot: string, dirtyFiles: string[]): string[] {
  const dirtySet = new Set(dirtyFiles);

  // Collect candidate files from known roots (recursive enumeration)
  const candidates: string[] = [];
  const roots = [...KNOWN_ROOTS];

  for (const root of roots) {
    const absRoot = path.join(projectRoot, root);
    if (!fs.existsSync(absRoot)) continue;

    let entries: string[];
    try {
      entries = fs.readdirSync(absRoot, { recursive: true, encoding: 'utf-8' }) as string[];
    } catch {
      continue;
    }

    for (const entry of entries) {
      const repoRelative = path.posix.join(root, entry.replace(/\\/g, '/'));
      // Filter to files only (skip directories)
      const absPath = path.join(projectRoot, repoRelative);
      try {
        if (!fs.lstatSync(absPath).isFile()) continue;
      } catch {
        continue;
      }
      if (isExcluded(repoRelative)) continue;
      if (dirtySet.has(repoRelative)) continue;
      candidates.push(repoRelative);
    }
  }

  // Check root-level files
  const monorepoAgentsMd = resolveMonorepoAgentsMd(projectRoot);
  const rootFiles = [...KNOWN_ROOT_FILES];
  if (monorepoAgentsMd) {
    rootFiles.push(monorepoAgentsMd);
  }

  for (const rootFile of rootFiles) {
    if (isExcluded(rootFile)) continue;
    if (dirtySet.has(rootFile)) continue;
    const absPath = path.join(projectRoot, rootFile);
    if (fs.existsSync(absPath)) {
      candidates.push(rootFile);
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  // Batch-check against git check-ignore --stdin
  const checkResult = spawnSync('git', ['check-ignore', '--stdin'], {
    cwd: projectRoot,
    stdio: 'pipe',
    encoding: 'utf-8',
    input: candidates.join('\n'),
  });

  // Exit code 0 = at least one path ignored, 1 = no paths ignored, 128+ = error
  if (checkResult.status !== null && checkResult.status >= 128) {
    return [];
  }

  const stdout = checkResult.stdout ?? '';
  if (!stdout.trim()) {
    return [];
  }

  const ignoredPaths = new Set(
    stdout.split('\n').map(line => line.trim()).filter(Boolean)
  );

  // Also exclude files whose parent directory is already in the dirty set
  // (e.g., dirtyFiles has ".claude/" which means git add will already pick up children)
  const result = candidates.filter(c => {
    if (!ignoredPaths.has(c)) return false;
    // Check if any dirty entry is a directory prefix covering this file
    for (const dp of dirtyFiles) {
      if (dp.endsWith('/') && c.startsWith(dp)) return false;
    }
    return true;
  });

  return result.sort();
}

/**
 * Resolve the monorepo primary package AGENTS.md path from scan.json.
 *
 * @param projectRoot - Project root directory
 * @returns Repo-relative path to AGENTS.md, or null if not applicable
 */
function resolveMonorepoAgentsMd(projectRoot: string): string | null {
  const scanPath = path.join(projectRoot, '.ana', 'scan.json');
  if (!fs.existsSync(scanPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(scanPath, 'utf-8');
    const scan = JSON.parse(content);
    const primaryPath = scan?.monorepo?.primaryPackage?.path;
    if (typeof primaryPath === 'string' && primaryPath) {
      return path.posix.join(primaryPath, 'AGENTS.md');
    }
  } catch {
    // Silently skip — scan.json may be corrupted
  }

  return null;
}

/**
 * Identify dirty infrastructure files that are also gitignored.
 *
 * Takes the output of `discoverDirtyFiles` and filters it through
 * `git check-ignore --stdin` to find files that are tracked from a
 * previous force-add but still match a gitignore rule. These files
 * need `git add -f` on subsequent commits — plain `git add` may
 * exit 1 for gitignored paths.
 *
 * This is the inverse of `discoverGitignoredFiles`: that function
 * finds gitignored files NOT in the dirty set (for first-time
 * force-add). This function finds dirty files that ARE gitignored
 * (for subsequent force-add).
 *
 * @param projectRoot - Project root directory
 * @param dirtyFiles - Files already discovered by `discoverDirtyFiles()`
 * @returns Subset of dirtyFiles that are also gitignored
 */
export function discoverGitignoredDirtyFiles(projectRoot: string, dirtyFiles: string[]): string[] {
  if (dirtyFiles.length === 0) {
    return [];
  }

  // Batch-check against git check-ignore --no-index --stdin.
  // --no-index is required because these files are already tracked
  // (from a previous force-add). Without it, git check-ignore skips
  // tracked files even if they match gitignore rules.
  const checkResult = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {
    cwd: projectRoot,
    stdio: 'pipe',
    encoding: 'utf-8',
    input: dirtyFiles.join('\n'),
  });

  // Exit code 0 = at least one path ignored, 1 = no paths ignored, 128+ = error
  if (checkResult.status !== null && checkResult.status >= 128) {
    return [];
  }

  const stdout = checkResult.stdout ?? '';
  if (!stdout.trim()) {
    return [];
  }

  const ignoredPaths = new Set(
    stdout.split('\n').map(line => line.trim()).filter(Boolean)
  );

  return dirtyFiles.filter(f => ignoredPaths.has(f));
}

/**
 * Determine the commit message based on whether ana.json is already tracked.
 *
 * @param projectRoot - Project root directory
 * @returns "[ana] Initialize project context" or "[ana] Update project context"
 */
export function determineCommitMessage(projectRoot: string): string {
  const result = runGit(['ls-files', '--error-unmatch', '.ana/ana.json'], { cwd: projectRoot });
  if (result.exitCode === 0) {
    return '[ana] Update project context';
  }
  return '[ana] Initialize project context';
}

/**
 * Pull with rebase before committing. Skips if no remotes.
 * Exits process on conflict. Warns and continues on other failures.
 *
 * @param projectRoot - Project root directory
 */
function pullBeforeCommit(projectRoot: string): void {
  const remotes = runGit(['remote'], { cwd: projectRoot }).stdout;
  if (!remotes) {
    return;
  }

  const pullResult = runGit(['pull', '--rebase', '--autostash'], { cwd: projectRoot });
  if (pullResult.exitCode !== 0) {
    const errorMessage = pullResult.stderr;
    if (errorMessage.includes('conflict') || errorMessage.includes('Cannot rebase') || errorMessage.includes('CONFLICT')) {
      runGit(['rebase', '--abort'], { cwd: projectRoot });
      console.error(chalk.red('Error: Pull failed due to conflicts. Resolve conflicts and try again.'));
      process.exit(1);
    }
    console.error(chalk.yellow('  Warning: Pull failed. Continuing with local changes.'));
  }
}

/**
 * Push to remote with soft-fail. Warns on failure but does not exit.
 *
 * @param projectRoot - Project root directory
 */
function pushWithSoftFail(projectRoot: string): void {
  const remotes = runGit(['remote'], { cwd: projectRoot }).stdout;
  if (!remotes) {
    return;
  }

  console.log('  Committed locally. Pushing...');

  const pushResult = runGit(['push'], { cwd: projectRoot });
  if (pushResult.exitCode === 0) {
    const branch = getCurrentBranch() ?? 'remote';
    console.log(chalk.green(`✓ Pushed to origin/${branch}`));
    return;
  }

  // Push failed — pull --rebase and retry
  const pullResult = runGit(['pull', '--rebase', '--autostash'], { cwd: projectRoot });
  if (pullResult.exitCode !== 0) {
    const pullStderr = pullResult.stderr;
    if (pullStderr.includes('conflict') || pullStderr.includes('Cannot rebase') || pullStderr.includes('CONFLICT')) {
      runGit(['rebase', '--abort'], { cwd: projectRoot });
    }
    console.error(chalk.yellow('  ⚠ Push failed. Run `git push` manually.'));
    return;
  }

  // Retry push after successful pull
  const retryResult = runGit(['push'], { cwd: projectRoot });
  if (retryResult.exitCode === 0) {
    const branch = getCurrentBranch() ?? 'remote';
    console.log(chalk.green(`✓ Pushed to origin/${branch}`));
  } else {
    console.error(chalk.yellow('  ⚠ Push failed. Run `git push` manually.'));
  }
}

/**
 * Register the `commit` subcommand on the init parent command.
 *
 * @param initCommand - The parent `init` Command instance
 */
export function registerInitCommitCommand(initCommand: Command): void {
  initCommand
    .command('commit')
    .description('Commit infrastructure files to the artifact branch')
    .option('--respect-gitignore', 'Do not force-add gitignored infrastructure files')
    .action((options: { respectGitignore?: boolean }) => {
      // Guard 1: Reject worktree
      if (isWorktreeDirectory()) {
        console.error(chalk.red('Error: Run init commit from the main project directory, not from a worktree.'));
        process.exit(1);
      }

      // Guard 2: Init guard — find project root (requires .ana/ana.json)
      let projectRoot: string;
      try {
        projectRoot = findProjectRoot();
      } catch {
        console.error(chalk.red('Error: No .ana/ana.json found. Run `ana init` first.'));
        process.exit(1);
        return; // unreachable but satisfies TS
      }

      // Guard 3: Branch validation
      const artifactBranch = readArtifactBranch(projectRoot);
      const currentBranch = getCurrentBranch();
      if (currentBranch !== artifactBranch) {
        console.error(chalk.red(`Error: You're on \`${currentBranch}\`. Infrastructure must be committed to \`${artifactBranch}\`.`));
        console.error(chalk.gray(`  Run: git checkout ${artifactBranch}`));
        process.exit(1);
      }

      // Guard 4: Pull with rebase
      pullBeforeCommit(projectRoot);

      // Step 5: Discover dirty infrastructure files
      let files = discoverDirtyFiles(projectRoot);

      // Step 5a: Harden — identify dirty files that are also gitignored
      // (tracked from a previous force-add). Move them to the force-add
      // path so we don't rely on git's undocumented exit-1-but-still-stages
      // behavior for `git add <tracked-but-gitignored-file>`.
      const gitignoredDirtyFiles = discoverGitignoredDirtyFiles(projectRoot, files);
      if (gitignoredDirtyFiles.length > 0) {
        const gitignoredDirtySet = new Set(gitignoredDirtyFiles);
        files = files.filter(f => !gitignoredDirtySet.has(f));
      }

      // Step 5b: Discover gitignored infrastructure files (not dirty —
      // these are files that exist on disk but aren't in the dirty set)
      const gitignoredFiles = discoverGitignoredFiles(projectRoot, files);

      if (gitignoredFiles.length > 0 && options.respectGitignore) {
        // Warn about skipped gitignored files
        console.log(chalk.yellow(`  ⚠ ${gitignoredFiles.length} infrastructure file${gitignoredFiles.length !== 1 ? 's are' : ' is'} gitignored and ${gitignoredFiles.length !== 1 ? 'were' : 'was'} NOT committed:`));
        for (const f of gitignoredFiles) {
          console.log(`    ${f}`);
        }
        console.log("  These files won't be available in worktrees. Pipeline builds may fail.");
        console.log('');
      }

      const filesToForceAdd = [
        ...gitignoredDirtyFiles,
        ...(options.respectGitignore ? [] : gitignoredFiles),
      ];

      // Step 6: Idempotent check
      if (files.length === 0 && filesToForceAdd.length === 0) {
        console.log('Context is up to date.');
        return;
      }

      // Print force-add notice
      if (filesToForceAdd.length > 0) {
        console.log(chalk.yellow('  ⚠ Gitignored infrastructure files detected — force-adding for worktree compatibility:'));
        for (const f of filesToForceAdd) {
          console.log(`    ${f}`);
        }
        console.log('');
      }

      // Step 7: Stage and commit
      const message = determineCommitMessage(projectRoot);
      const coAuthor = readCoAuthor(projectRoot);
      const commitMessage = `${message}\n\nCo-authored-by: ${coAuthor}`;

      // Stage dirty files normally
      if (files.length > 0) {
        runGit(['add', ...files], { cwd: projectRoot });
      }

      // Force-add gitignored files separately
      if (filesToForceAdd.length > 0) {
        runGit(['add', '-f', ...filesToForceAdd], { cwd: projectRoot });
      }

      const allFiles = [...files, ...filesToForceAdd];
      const commitResult = spawnSync('git', ['commit', '--no-verify', '-m', commitMessage, '--', ...allFiles], {
        stdio: 'pipe',
        cwd: projectRoot,
      });

      if (commitResult.status !== 0) {
        const stderr = commitResult.stderr?.toString() || 'Commit failed';
        console.error(chalk.red('Error: Failed to commit infrastructure files.'));
        console.error(chalk.dim(stderr));
        process.exit(1);
      }

      const totalCount = allFiles.length;
      console.log(chalk.green(`✓ Infrastructure committed to ${artifactBranch} (${totalCount} file${totalCount !== 1 ? 's' : ''})`));
      console.log('');
      console.log(`  ${message}`);
      console.log('');

      // Step 8: Push with soft-fail
      pushWithSoftFail(projectRoot);
    });
}
