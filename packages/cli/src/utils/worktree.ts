/**
 * Worktree utilities for pipeline isolation.
 *
 * Build and Verify agents operate in git worktrees so the main tree
 * stays on the artifact branch. This module centralizes creation,
 * removal, detection, and context file generation.
 *
 * Key invariants:
 *   - Worktree path: `.ana/worktrees/{slug}/`
 *   - Creation is atomic with rollback on failure
 *   - `.env*` files are symlinked (copy fallback on Windows)
 *   - Submodules are initialized if `.gitmodules` exists
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runGit, readArtifactBranch } from './git-operations.js';

/**
 * Result of a worktree creation operation.
 */
export interface WorktreeCreateResult {
  worktreePath: string;
  branch: string;
  branchIsNew: boolean;
  depsInstalled: boolean;
  envFilesLinked: string[];
  submodulesInitialized: boolean;
  contextFileWritten: boolean;
}

/**
 * Worktree info for status display.
 */
export interface WorktreeInfo {
  path: string;
  branch: string;
  commitCount: number;
  lastActivityDays: number;
  isStale: boolean;
}

/**
 * Check whether the current working directory is inside a git worktree.
 *
 * A worktree's `.git` is a file (containing `gitdir: ...`), not a directory.
 * A normal repo's `.git` is a directory.
 *
 * @param dir - Directory to check (defaults to cwd)
 * @returns true if inside a worktree
 */
export function isWorktreeDirectory(dir?: string): boolean {
  const checkDir = dir ?? process.cwd();
  const gitPath = path.join(checkDir, '.git');
  try {
    const stat = fs.statSync(gitPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Detect which slug's worktree we're inside, if any.
 *
 * Checks if the current path is under `.ana/worktrees/{slug}/`.
 *
 * @param dir - Directory to check (defaults to cwd)
 * @returns The slug name, or null if not in a worktree
 */
export function detectWorktreeSlug(dir?: string): string | null {
  const checkDir = path.resolve(dir ?? process.cwd());
  // Look for `.ana/worktrees/{slug}` in the path
  const marker = `${path.sep}.ana${path.sep}worktrees${path.sep}`;
  const idx = checkDir.indexOf(marker);
  if (idx === -1) return null;

  const afterMarker = checkDir.substring(idx + marker.length);
  const slug = afterMarker.split(path.sep)[0];
  return slug || null;
}

/**
 * Get the worktree path for a slug.
 *
 * @param projectRoot - Project root directory
 * @param slug - Work item slug
 * @returns Absolute path to the worktree
 */
export function getWorktreePath(projectRoot: string, slug: string): string {
  return path.join(projectRoot, '.ana', 'worktrees', slug);
}

/**
 * Check if a worktree exists for a slug.
 *
 * @param projectRoot - Project root directory
 * @param slug - Work item slug
 * @returns true if the worktree directory exists
 */
export function worktreeExists(projectRoot: string, slug: string): boolean {
  const wtPath = getWorktreePath(projectRoot, slug);
  return fs.existsSync(wtPath);
}

/**
 * Create a worktree for a slug. Atomic: rolls back on any failure.
 *
 * Steps:
 *   1. Ensure `.ana/worktrees/` exists
 *   2. Check if the branch already exists
 *   3. `git worktree add` (with `-b` for new branch, without for existing)
 *   4. Install dependencies
 *   5. Symlink `.env*` files
 *   6. Initialize submodules if `.gitmodules` exists
 *   7. Write worktree-context.md
 *
 * On failure at any step: remove worktree dir + branch (if newly created).
 *
 * @param projectRoot - Project root directory
 * @param slug - Work item slug
 * @param branchPrefix - Branch prefix (e.g., 'feature/')
 * @param contextData - Optional data for worktree-context.md
 * @param contextData.contractAssertions - Contract assertions text
 * @param contextData.proofFindings - Proof findings text
 * @param contextData.summary - One-paragraph summary
 * @returns Creation result
 */
export async function createWorktree(
  projectRoot: string,
  slug: string,
  branchPrefix: string,
  contextData?: { contractAssertions?: string; proofFindings?: string; summary?: string }
): Promise<WorktreeCreateResult> {
  const worktreesDir = path.join(projectRoot, '.ana', 'worktrees');
  const wtPath = path.join(worktreesDir, slug);
  const branchName = `${branchPrefix}${slug}`;

  // Check if worktree already exists
  if (fs.existsSync(wtPath)) {
    throw new Error(`Worktree already exists at ${wtPath}`);
  }

  // Ensure worktrees directory exists
  await fsPromises.mkdir(worktreesDir, { recursive: true });

  // Ensure .ana/.gitignore includes worktrees/
  await ensureGitignoreEntry(projectRoot);

  // Check if branch already exists (for rollback decision)
  const branchExistsBefore = branchExists(projectRoot, branchName);

  let branchIsNew = false;

  try {
    // Step 1: Create worktree
    if (branchExistsBefore) {
      // In-flight migration: use existing branch
      const result = runGit(['worktree', 'add', wtPath, branchName], { cwd: projectRoot });
      if (result.exitCode !== 0) {
        throw new Error(`git worktree add failed: ${result.stderr}`);
      }
    } else {
      // New branch: create with -b
      const result = runGit(['worktree', 'add', '-b', branchName, wtPath], { cwd: projectRoot });
      if (result.exitCode !== 0) {
        throw new Error(`git worktree add -b failed: ${result.stderr}`);
      }
      branchIsNew = true;
    }

    // Step 2: Install dependencies
    const depsInstalled = installDependencies(wtPath);

    // Step 3: Symlink .env files
    const envFilesLinked = await linkEnvFiles(projectRoot, wtPath);

    // Step 4: Initialize submodules
    const submodulesInitialized = initSubmodules(projectRoot, wtPath);

    // Step 5: Write worktree-context.md
    const contextFileWritten = await writeWorktreeContext(wtPath, slug, contextData);

    return {
      worktreePath: wtPath,
      branch: branchName,
      branchIsNew,
      depsInstalled,
      envFilesLinked,
      submodulesInitialized,
      contextFileWritten,
    };
  } catch (error) {
    // Rollback: remove worktree directory
    await rollbackWorktree(projectRoot, wtPath, branchName, branchIsNew);
    throw error;
  }
}

/**
 * Remove a worktree for a slug. Safe to call if worktree doesn't exist.
 *
 * @param projectRoot - Project root directory
 * @param slug - Work item slug
 * @returns true if removed, false if didn't exist
 */
export async function removeWorktree(projectRoot: string, slug: string): Promise<boolean> {
  const wtPath = getWorktreePath(projectRoot, slug);

  if (!fs.existsSync(wtPath)) {
    return false;
  }

  // Use git worktree remove first (cleans up git metadata)
  const result = runGit(['worktree', 'remove', wtPath, '--force'], { cwd: projectRoot });
  if (result.exitCode !== 0) {
    // Fallback: force remove directory
    try {
      await fsPromises.rm(wtPath, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  }

  return true;
}

/**
 * Get worktree info for status display.
 *
 * @param projectRoot - Project root directory
 * @param slug - Work item slug
 * @param branchPrefix - Branch prefix
 * @returns WorktreeInfo or null if no worktree exists
 */
export function getWorktreeInfo(
  projectRoot: string,
  slug: string,
  branchPrefix: string
): WorktreeInfo | null {
  const wtPath = getWorktreePath(projectRoot, slug);
  if (!fs.existsSync(wtPath)) return null;

  const branchName = `${branchPrefix}${slug}`;
  const artifactBranch = readArtifactBranch(projectRoot);

  // Count commits since branch point
  let commitCount = 0;
  try {
    const result = runGit(
      ['rev-list', '--count', `${artifactBranch}..${branchName}`],
      { cwd: wtPath }
    );
    if (result.exitCode === 0) {
      commitCount = parseInt(result.stdout) || 0;
    }
  } catch {
    // Ignore — default 0
  }

  // Last activity: most recent commit time
  let lastActivityDays = 0;
  try {
    const result = runGit(
      ['log', '-1', '--format=%ct', branchName],
      { cwd: wtPath }
    );
    if (result.exitCode === 0 && result.stdout) {
      const commitTime = parseInt(result.stdout) * 1000;
      lastActivityDays = Math.floor((Date.now() - commitTime) / (1000 * 60 * 60 * 24));
    }
  } catch {
    // Ignore
  }

  const isStale = commitCount === 0 && lastActivityDays >= 14;

  return {
    path: wtPath,
    branch: branchName,
    commitCount,
    lastActivityDays,
    isStale,
  };
}

// --- Internal helpers ---

/**
 * Check if a git branch exists locally.
 *
 * @param projectRoot - Project root directory
 * @param branchName - Branch name to check
 * @returns true if branch exists
 */
function branchExists(projectRoot: string, branchName: string): boolean {
  const result = runGit(['rev-parse', '--verify', `refs/heads/${branchName}`], { cwd: projectRoot });
  return result.exitCode === 0;
}

/**
 * Install dependencies in the worktree.
 *
 * Detects package manager from lockfiles and runs install.
 *
 * @param wtPath - Worktree path
 * @returns true if installation succeeded
 */
function installDependencies(wtPath: string): boolean {
  // Detect package manager
  let cmd: string;
  let args: string[];

  if (fs.existsSync(path.join(wtPath, 'pnpm-lock.yaml'))) {
    cmd = 'pnpm';
    args = ['install', '--frozen-lockfile'];
  } else if (fs.existsSync(path.join(wtPath, 'yarn.lock'))) {
    cmd = 'yarn';
    args = ['install', '--frozen-lockfile'];
  } else if (fs.existsSync(path.join(wtPath, 'package-lock.json'))) {
    cmd = 'npm';
    args = ['ci'];
  } else {
    // No lockfile — no dependencies to install
    return false;
  }

  const result = spawnSync(cmd, args, {
    cwd: wtPath,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  return result.status === 0;
}

/**
 * Symlink `.env*` files from the main tree into the worktree.
 * Falls back to copy if symlink fails (Windows without developer mode).
 *
 * @param projectRoot - Main project root
 * @param wtPath - Worktree path
 * @returns List of files linked/copied
 */
async function linkEnvFiles(projectRoot: string, wtPath: string): Promise<string[]> {
  const linked: string[] = [];

  try {
    const entries = await fsPromises.readdir(projectRoot);
    const envFiles = entries.filter(e => e.startsWith('.env'));

    for (const envFile of envFiles) {
      const srcPath = path.join(projectRoot, envFile);
      const dstPath = path.join(wtPath, envFile);

      // Only link files, not directories
      const stat = await fsPromises.stat(srcPath);
      if (!stat.isFile()) continue;

      // Don't overwrite existing files in the worktree
      if (fs.existsSync(dstPath)) continue;

      try {
        await fsPromises.symlink(srcPath, dstPath);
        linked.push(envFile);
      } catch {
        // Fallback to copy
        try {
          await fsPromises.copyFile(srcPath, dstPath);
          linked.push(envFile);
        } catch {
          // Skip this file
        }
      }
    }
  } catch {
    // readdir failed — no env files to link
  }

  return linked;
}

/**
 * Initialize submodules in the worktree if `.gitmodules` exists.
 *
 * @param projectRoot - Main project root
 * @param wtPath - Worktree path
 * @returns true if submodules were initialized
 */
function initSubmodules(projectRoot: string, wtPath: string): boolean {
  if (!fs.existsSync(path.join(projectRoot, '.gitmodules'))) {
    return false;
  }

  const result = spawnSync('git', ['submodule', 'update', '--init', '--recursive'], {
    cwd: wtPath,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  return result.status === 0;
}

/**
 * Write worktree-context.md inside the worktree.
 *
 * Contains contract assertions, proof findings for target files,
 * and a one-paragraph summary of what Build is expected to do.
 *
 * @param wtPath - Worktree path
 * @param slug - Work item slug
 * @param data - Context data
 * @param data.contractAssertions - Contract assertions text
 * @param data.proofFindings - Proof findings text
 * @param data.summary - One-paragraph summary
 * @returns true if file was written
 */
async function writeWorktreeContext(
  wtPath: string,
  slug: string,
  data?: { contractAssertions?: string; proofFindings?: string; summary?: string }
): Promise<boolean> {
  const anaDir = path.join(wtPath, '.ana');

  // .ana/ may not exist in the worktree if the project structure differs
  if (!fs.existsSync(anaDir)) {
    try {
      await fsPromises.mkdir(anaDir, { recursive: true });
    } catch {
      return false;
    }
  }

  const contextPath = path.join(anaDir, 'worktree-context.md');

  const sections: string[] = [
    `# Worktree Context: ${slug}`,
    '',
    `**Created:** ${new Date().toISOString()}`,
    '',
  ];

  if (data?.summary) {
    sections.push('## Summary', '', data.summary, '');
  }

  sections.push('## Contract Assertions', '');
  if (data?.contractAssertions) {
    sections.push(data.contractAssertions);
  } else {
    sections.push('_No contract assertions available._');
  }
  sections.push('');

  if (data?.proofFindings) {
    sections.push('## Proof Findings', '', data.proofFindings, '');
  }

  try {
    await fsPromises.writeFile(contextPath, sections.join('\n'), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Roll back a failed worktree creation.
 *
 * @param projectRoot - Project root directory
 * @param wtPath - Worktree path
 * @param branchName - Branch name
 * @param branchIsNew - Whether the branch was newly created (should be deleted)
 */
async function rollbackWorktree(
  projectRoot: string,
  wtPath: string,
  branchName: string,
  branchIsNew: boolean
): Promise<void> {
  // Remove worktree via git first (cleans metadata)
  runGit(['worktree', 'remove', wtPath, '--force'], { cwd: projectRoot });

  // Force-remove directory if git didn't clean it
  try {
    if (fs.existsSync(wtPath)) {
      await fsPromises.rm(wtPath, { recursive: true, force: true });
    }
  } catch {
    // Best effort
  }

  // Delete branch only if we created it
  if (branchIsNew) {
    runGit(['branch', '-D', branchName], { cwd: projectRoot });
  }
}

/**
 * Ensure `.ana/.gitignore` includes `worktrees/`.
 *
 * For projects that haven't re-run init, the gitignore may only have `state/`.
 * This adds `worktrees/` if missing.
 *
 * @param projectRoot - Project root directory
 */
async function ensureGitignoreEntry(projectRoot: string): Promise<void> {
  const gitignorePath = path.join(projectRoot, '.ana', '.gitignore');

  if (!fs.existsSync(gitignorePath)) {
    return; // No .gitignore to update — init will create one
  }

  const content = fs.readFileSync(gitignorePath, 'utf-8');
  if (content.includes('worktrees/')) {
    return; // Already present
  }

  // Append worktrees/ entry
  const newContent = content.trimEnd() + '\nworktrees/\n';
  await fsPromises.writeFile(gitignorePath, newContent, 'utf-8');
}

export { branchExists };
