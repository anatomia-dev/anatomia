/**
 * Shared git utilities for commands.
 *
 * Extracted from commands/artifact.ts so that pr.ts and work.ts don't have
 * to cross-command-import them. These are leaf utilities — read ana.json
 * for the artifact branch name, shell out to git for the current branch.
 * Neither depends on anything command-specific, so they belong in utils/.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import chalk from 'chalk';
import { validateBranchName } from './validators.js';

/**
 * Result from running a git command via spawnSync.
 */
export interface RunGitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a git command using spawnSync with array arguments.
 *
 * This eliminates shell interpolation by passing arguments as an array
 * directly to the git process. All git operations in commands/ and utils/
 * should use this instead of execSync.
 *
 * @param args - Array of arguments to pass to git (e.g., ['status', '--porcelain'])
 * @param options - Optional cwd override
 * @param options.cwd - Working directory for the git command
 * @returns Object with stdout, stderr, and exitCode
 */
export function runGit(args: string[], options?: { cwd?: string }): RunGitResult {
  const result = spawnSync('git', args, {
    cwd: options?.cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  return {
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    exitCode: result.status ?? 1,
  };
}

/**
 * Read the artifact branch name from .ana/ana.json. Exits the process with
 * an error message if the file is missing, corrupted, or lacks the field.
 *
 * The exit-on-error behavior is intentional — this is called from command
 * entry points where a missing ana.json is a configuration error the user
 * must fix before the command can do anything meaningful.
 *
 * @param projectRoot - Project root path (defaults to cwd)
 * @returns The artifact branch name
 */
export function readArtifactBranch(projectRoot?: string): string {
  const anaJsonPath = path.join(projectRoot ?? process.cwd(), '.ana', 'ana.json');

  if (!fs.existsSync(anaJsonPath)) {
    console.error(chalk.red('Error: No .ana/ana.json found. Run `ana init` first.'));
    process.exit(1);
  }

  let config: Record<string, unknown>;
  try {
    const content = fs.readFileSync(anaJsonPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    console.error(chalk.red('Error: Failed to read .ana/ana.json. File may be corrupted.'));
    process.exit(1);
  }

  if (!config['artifactBranch']) {
    console.error(chalk.red('Error: No artifactBranch configured in ana.json. Run `ana init` first.'));
    process.exit(1);
  }

  const branch = config['artifactBranch'] as string;

  try {
    validateBranchName(branch);
  } catch {
    console.error(chalk.red('Error: Invalid artifactBranch in ana.json: contains invalid characters.'));
    process.exit(1);
  }

  return branch;
}

/**
 * Read the branch prefix from .ana/ana.json. Returns `'feature/'` as fallback
 * when the file is missing, corrupted, or lacks the field.
 *
 * The fallback behavior is intentional — every existing install lacks
 * `branchPrefix`, so the common upgrade path must return the historical
 * default without forcing the user to re-init.
 *
 * Supports two config forms:
 * - String: `"feature/"` → returned directly (kind is ignored)
 * - Map: `{ "feature": "feature/", "fix": "fix/" }` → resolved by kind
 *   Fallback chain: requested kind → `'feature'` key → `'feature/'`
 *
 * @param projectRoot - Project root path (defaults to cwd)
 * @param kind - Optional scope kind for map-form resolution
 * @returns The configured branch prefix, or `'feature/'` as default
 */
export function readBranchPrefix(projectRoot?: string, kind?: string): string {
  const DEFAULT = 'feature/';
  const anaJsonPath = path.join(projectRoot ?? process.cwd(), '.ana', 'ana.json');

  if (!fs.existsSync(anaJsonPath)) {
    return DEFAULT;
  }

  let config: Record<string, unknown>;
  try {
    const content = fs.readFileSync(anaJsonPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    return DEFAULT;
  }

  const prefix = config['branchPrefix'];

  // String form — kind is ignored
  if (typeof prefix === 'string') {
    try {
      validateBranchName(prefix);
    } catch {
      return DEFAULT;
    }
    return prefix;
  }

  // Map form — resolve by kind with fallback chain
  if (typeof prefix === 'object' && prefix !== null && !Array.isArray(prefix)) {
    const map = prefix as Record<string, unknown>;

    // Resolve: requested kind → 'feature' key → hardcoded default
    const candidates = kind ? [kind, 'feature'] : ['feature'];
    for (const key of candidates) {
      const value = map[key];
      if (typeof value === 'string') {
        try {
          validateBranchName(value);
          return value;
        } catch {
          // Invalid value for this key — continue to next candidate
        }
      }
    }

    return DEFAULT;
  }

  return DEFAULT;
}

/**
 * Read the co-author trailer value from .ana/ana.json. Returns the default
 * `'Ana <build@anatomia.dev>'` when the file is missing, corrupted, or
 * lacks the field.
 *
 * The fallback behavior is intentional — every command that commits should
 * include a trailer, and the default is always safe to use.
 *
 * @param projectRoot - Project root path (defaults to cwd)
 * @returns The configured co-author string, or the default
 */
export function readCoAuthor(projectRoot?: string): string {
  const anaJsonPath = path.join(projectRoot ?? process.cwd(), '.ana', 'ana.json');

  if (!fs.existsSync(anaJsonPath)) {
    return 'Ana <build@anatomia.dev>';
  }

  let config: Record<string, unknown>;
  try {
    const content = fs.readFileSync(anaJsonPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    return 'Ana <build@anatomia.dev>';
  }

  const coAuthor = config['coAuthor'];
  if (typeof coAuthor !== 'string') {
    return 'Ana <build@anatomia.dev>';
  }

  // Strip newlines and control characters — co-author comes from user config,
  // not an attack vector, so strip silently rather than reject.
  return coAuthor.replace(/[\x00-\x1f\x7f]/g, '');
}

/**
 * Get the current git branch name, or null if not in a git repo.
 *
 * @returns Current branch name, or null on failure
 */
export function getCurrentBranch(): string | null {
  const result = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  return result.exitCode === 0 ? result.stdout : null;
}

/**
 * Pull latest changes before reading the proof chain.
 *
 * Checks for remotes and pulls with rebase. On conflict, exits with error.
 * On network failure, warns and continues with local data.
 *
 * @param proofRoot - Project root directory
 */
export function pullBeforeRead(proofRoot: string): void {
  const remotes = runGit(['remote'], { cwd: proofRoot }).stdout;
  if (remotes) {
    const pullResult = runGit(['pull', '--rebase', '--autostash'], { cwd: proofRoot });
    if (pullResult.exitCode !== 0) {
      const errorMessage = pullResult.stderr;
      if (errorMessage.includes('conflict') || errorMessage.includes('Cannot rebase')) {
        runGit(['rebase', '--abort'], { cwd: proofRoot });
        console.error(chalk.red('Error: Pull failed due to conflicts. Resolve conflicts and try again.'));
        process.exit(1);
      }
      console.error(chalk.yellow('⚠ Warning: Pull failed. Continuing with local data.'));
    }
  }
}

/**
 * Commit proof chain changes and push with one retry on failure.
 *
 * Uses spawnSync for commit (captures stderr for error messages) and
 * runGit for push (returns exitCode/stderr). On push failure: pulls
 * with rebase and retries once. On rebase conflict, aborts the rebase
 * and warns. On second push failure, warns.
 *
 * @param options - Commit and push options
 * @param options.proofRoot - Project root directory
 * @param options.files - Files to stage (relative paths)
 * @param options.message - Commit message (without co-author trailer)
 * @param options.coAuthor - Co-author trailer string
 */
export function commitAndPushProofChanges(options: {
  proofRoot: string;
  files: string[];
  message: string;
  coAuthor: string;
}): void {
  // Stage and commit
  runGit(['add', ...options.files], { cwd: options.proofRoot });
  const commitMessage = `${options.message}\n\nCo-authored-by: ${options.coAuthor}`;
  const commitResult = spawnSync('git', ['commit', '-m', commitMessage, '--', ...options.files], { stdio: 'pipe', cwd: options.proofRoot });
  if (commitResult.status !== 0) {
    const stderr = commitResult.stderr?.toString() || 'Commit failed';
    console.error(chalk.red(`Error: Failed to commit. Changes NOT saved to git.`));
    console.error(chalk.dim(stderr));
    process.exit(1);
  }

  // Push with one retry
  const pushResult = runGit(['push'], { cwd: options.proofRoot });
  if (pushResult.exitCode === 0) return;

  // Push failed — pull --rebase and retry
  const pullResult = runGit(['pull', '--rebase', '--autostash'], { cwd: options.proofRoot });
  if (pullResult.exitCode !== 0) {
    const pullStderr = pullResult.stderr;
    if (pullStderr.includes('conflict') || pullStderr.includes('Cannot rebase') || pullStderr.includes('CONFLICT')) {
      // Abort the rebase to clean up
      runGit(['rebase', '--abort'], { cwd: options.proofRoot });
      console.error(chalk.yellow('  Committed locally. Push failed after retry — run `git push`'));
      return;
    }
    // Pull failed (network, auth, or other) — can't retry
    console.error(chalk.yellow('  Committed locally. Push failed after retry — run `git push`'));
    return;
  }

  // Retry push after successful pull
  const retryResult = runGit(['push'], { cwd: options.proofRoot });
  if (retryResult.exitCode !== 0) {
    console.error(chalk.yellow('  Committed locally. Push failed after retry — run `git push`'));
  }
}
