/**
 * ana work - Manage pipeline work items
 *
 * Subcommands:
 *   ana work status          Show pipeline state for all active work items
 *   ana work start {slug}    Start a new work item (validates, creates dir, records timestamp)
 *   ana work complete {slug}  Archive completed work after PR merge
 *
 * Exit codes:
 *   0 - Success (always for status - it's informational)
 *   1 - Error (missing ana.json, not a git repo for complete, etc.)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { globSync } from 'glob';
import * as yaml from 'yaml';
import { readArtifactBranch, readBranchPrefix, getCurrentBranch, readCoAuthor, runGit } from '../utils/git-operations.js';
import { generateProofSummary, resolveFindingPaths, generateDashboard, computeChainHealth, wrapJsonResponse, wrapJsonError, detectHealthChange, getProofContext, extractScopeKind, type ProofSummary } from '../utils/proofSummary.js';
import { findProjectRoot, validateSlug } from '../utils/validators.js';
import { isWorktreeDirectory, detectWorktreeSlug, worktreeExists, getWorktreeInfo, createWorktree, removeWorktree, getWorktreePath } from '../utils/worktree.js';
import { checkForUpdates } from '../utils/update-check.js';
import type { ProofChainEntry, ProofChain, ProofChainStats } from '../types/proof.js';

/**
 * Artifact state for a work item
 */
interface ArtifactState {
  scope: ArtifactInfo;
  plan: ArtifactInfo;
  specs: SpecInfo[];
  buildReports: ReportInfo[];
  verifyReports: VerifyReportInfo[];
}

/**
 * Information about an artifact file
 */
interface ArtifactInfo {
  exists: boolean;
  location?: string;
}

/**
 * Information about a spec file
 */
interface SpecInfo {
  file: string;
  exists: boolean;
  location?: string;
}

/**
 * Information about a build/verify report
 */
interface ReportInfo {
  file: string;
  exists: boolean;
  location?: string;
}

/**
 * Information about a verify report with result
 */
interface VerifyReportInfo extends ReportInfo {
  result?: 'PASS' | 'FAIL' | 'unknown';
}

/**
 * Work item with complete state information
 */
interface WorkItem {
  slug: string;
  totalPhases: number;
  artifacts: ArtifactState;
  workBranch: string | null;
  stage: string;
  nextAction: string | string[];
  worktreeInfo?: {
    path: string;
    branch: string;
    commitCount: number;
    commitsBehind: number;
    lastActivityDays: number;
    isStale: boolean;
  } | null;
}

/**
 * Status output structure
 */
interface StatusOutput {
  artifactBranch: string;
  currentBranch: string;
  onArtifactBranch: boolean;
  updateAvailable: { current: string; latest: string } | null;
  projectMismatch: { cliVersion: string; projectVersion: string } | null;
  items: WorkItem[];
}

/**
 * Check if a file exists on a branch
 *
 * @param branch - Branch name (e.g., "main", "origin/main", "feature/slug")
 * @param filePath - Relative file path
 * @returns True if file exists on branch
 */
function fileExistsOnBranch(branch: string, filePath: string): boolean {
  const result = runGit(['show', `${branch}:${filePath}`]);
  return result.exitCode === 0;
}

/**
 * Read file content from a branch
 *
 * @param branch - Branch name
 * @param filePath - Relative file path
 * @returns File content or null if doesn't exist
 */
function readFileOnBranch(branch: string, filePath: string): string | null {
  const result = runGit(['show', `${branch}:${filePath}`]);
  return result.exitCode === 0 ? result.stdout : null;
}

/**
 * Get work branch for a slug using slug-based matching.
 *
 * Matches branches by `b.endsWith('/' + slug) || b === slug` — the slug
 * is the stable identifier. This decouples branch lookup from config,
 * so branches are found even after branchPrefix config changes.
 *
 * @param slug - Work item slug
 * @returns Branch name or null if doesn't exist
 */
function getWorkBranch(slug: string): string | null {
  const result = runGit(['branch', '-a', '--list', `*${slug}`]);
  if (result.exitCode !== 0 || !result.stdout) return null;

  // Parse branches — prefer local over remote
  const branches = result.stdout.split('\n').map(b => b.trim().replace(/^[*+] /, '').replace(/^remotes\//, ''));
  const local = branches.find(b => b.endsWith('/' + slug) || b === slug);
  const remote = branches.find(b => (b.startsWith('origin/') && (b.endsWith('/' + slug) || b === `origin/${slug}`)));

  return local || remote || null;
}

/**
 * Count phases and extract spec filenames from plan.md
 *
 * @param planContent - Content of plan.md
 * @returns Phase count and spec filenames
 */
function countPhases(planContent: string): { total: number; specs: string[] } {
  const lines = planContent.split('\n');
  const specs: string[] = [];
  let inPhases = false;

  for (const line of lines) {
    if (line.trim() === '## Phases') {
      inPhases = true;
      continue;
    }
    if (inPhases && line.startsWith('## ')) {
      break; // next section
    }
    if (inPhases) {
      const specMatch = line.match(/Spec:\s*(spec(?:-\d+)?\.md)/);
      if (specMatch && specMatch[1]) {
        specs.push(specMatch[1]);
      }
    }
  }

  return { total: specs.length, specs };
}

/**
 * Extract verify result from verify report content
 *
 * @param content - Content of verify report
 * @returns PASS, FAIL, or unknown
 */
function getVerifyResult(content: string): 'PASS' | 'FAIL' | 'unknown' {
  const match = content.match(/\*\*Result:\*\*\s*(PASS|FAIL)/i);
  if (!match || !match[1]) return 'unknown';
  return match[1].toUpperCase() as 'PASS' | 'FAIL';
}

/**
 * Discover slug directories on artifact branch
 *
 * @param artifactBranch - Artifact branch name
 * @param onArtifactBranch - Whether currently on artifact branch
 * @param projectRoot - Project root path
 * @returns Array of slug names
 */
function discoverSlugs(artifactBranch: string, onArtifactBranch: boolean, projectRoot: string): string[] {
  const plansPath = '.ana/plans/active';

  if (onArtifactBranch) {
    // Use filesystem
    const fullPath = path.join(projectRoot, plansPath);
    if (!fs.existsSync(fullPath)) {
      return [];
    }
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .filter(entry => entry.name !== '.DS_Store' && entry.name !== '.gitkeep')
      .map(entry => entry.name);
  } else {
    // Use git ls-tree with trailing slash to get directory contents
    const lsResult = runGit(['ls-tree', '--name-only', `origin/${artifactBranch}`, `${plansPath}/`]);
    if (lsResult.exitCode !== 0 || !lsResult.stdout) return [];
    // Output will be like ".ana/plans/active/slug-name", extract just the slug
    return lsResult.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => path.basename(line))
      .filter(name => name !== '.DS_Store' && name !== '.gitkeep');
  }
}

/**
 * Gather artifact state for a slug
 *
 * @param slug - Work item slug
 * @param artifactBranch - Artifact branch name
 * @param onArtifactBranch - Whether currently on artifact branch
 * @param projectRoot - Project root path
 * @returns Complete artifact state
 */
function gatherArtifactState(
  slug: string,
  artifactBranch: string,
  onArtifactBranch: boolean,
  projectRoot: string
): ArtifactState {
  const basePath = `.ana/plans/active/${slug}`;
  const branch = onArtifactBranch ? artifactBranch : `origin/${artifactBranch}`;

  // Check for scope, plan, spec on artifact branch
  const checkFile = (filename: string): ArtifactInfo => {
    const filePath = `${basePath}/${filename}`;
    if (onArtifactBranch) {
      const fullPath = path.join(projectRoot, filePath);
      const exists = fs.existsSync(fullPath);
      const info: ArtifactInfo = { exists };
      if (exists) {
        // Check if file is actually committed, not just on disk
        const lsResult = runGit(['ls-files', '--error-unmatch', filePath], { cwd: projectRoot });
        if (lsResult.exitCode === 0) {
          info.location = artifactBranch;
        } else {
          info.location = 'untracked';
        }
      }
      return info;
    } else {
      const exists = fileExistsOnBranch(branch, filePath);
      const info: ArtifactInfo = { exists };
      if (exists) info.location = artifactBranch;
      return info;
    }
  };

  const scope = checkFile('scope.md');
  const plan = checkFile('plan.md');

  // Read plan.md to get spec filenames
  let specs: SpecInfo[] = [];
  const planContent = onArtifactBranch
    ? (fs.existsSync(path.join(projectRoot, `${basePath}/plan.md`))
        ? fs.readFileSync(path.join(projectRoot, `${basePath}/plan.md`), 'utf-8')
        : null)
    : readFileOnBranch(branch, `${basePath}/plan.md`);

  if (planContent) {
    const { specs: specFiles } = countPhases(planContent);
    specs = specFiles.map(specFile => ({
      file: specFile,
      ...checkFile(specFile),
    }));
  } else {
    // No plan.md, check for default spec.md
    const specInfo = checkFile('spec.md');
    if (specInfo.exists) {
      specs = [{ file: 'spec.md', ...specInfo }];
    }
  }

  // Check for build/verify reports on work branch
  const workBranch = getWorkBranch(slug);
  const buildReports: ReportInfo[] = [];
  const verifyReports: VerifyReportInfo[] = [];

  if (workBranch) {
    for (const spec of specs) {
      // Determine report filenames from spec filename
      let buildReportFile: string;
      let verifyReportFile: string;

      if (spec.file === 'spec.md') {
        buildReportFile = 'build_report.md';
        verifyReportFile = 'verify_report.md';
      } else {
        const match = spec.file.match(/spec-(\d+)\.md/);
        if (match) {
          const num = match[1];
          buildReportFile = `build_report_${num}.md`;
          verifyReportFile = `verify_report_${num}.md`;
        } else {
          continue;
        }
      }

      // Check build report
      const buildReportPath = `${basePath}/${buildReportFile}`;
      const buildExists = fileExistsOnBranch(workBranch, buildReportPath);
      if (buildExists) {
        buildReports.push({
          file: buildReportFile,
          exists: true,
          location: workBranch,
        });
      }

      // Check verify report
      const verifyReportPath = `${basePath}/${verifyReportFile}`;
      const verifyExists = fileExistsOnBranch(workBranch, verifyReportPath);
      if (verifyExists) {
        const verifyContent = readFileOnBranch(workBranch, verifyReportPath);
        const result = verifyContent ? getVerifyResult(verifyContent) : 'unknown';
        verifyReports.push({
          file: verifyReportFile,
          exists: true,
          location: workBranch,
          result,
        });
      }
    }
  }

  return {
    scope,
    plan,
    specs,
    buildReports,
    verifyReports,
  };
}

/**
 * Check if a timestamp key in a `.saves.json` is recent (< 1 hour old).
 * Reads from a filesystem path (not git). Returns false for missing/corrupted files.
 *
 * @param savesDir - Directory containing `.saves.json`
 * @param timestampKey - The key to check
 * @returns Whether the timestamp is recent
 */
function isTimestampRecent(savesDir: string, timestampKey: string): boolean {
  try {
    const savesPath = path.join(savesDir, '.saves.json');
    if (!fs.existsSync(savesPath)) return false;
    const saves = JSON.parse(fs.readFileSync(savesPath, 'utf-8'));
    const timestamp = saves[timestampKey];
    if (typeof timestamp !== 'string') return false;
    const startedAt = new Date(timestamp);
    if (isNaN(startedAt.getTime())) return false;
    return (Date.now() - startedAt.getTime()) < CONCURRENCY_TIMEOUT_MS;
  } catch {
    return false;
  }
}

/**
 * Determine pipeline stage for a work item
 *
 * @param slug - Work item slug
 * @param artifacts - Artifact state
 * @param workBranch - Work branch name or null
 * @param projectRoot - Optional project root for worktree existence check
 * @returns Stage name
 */
function determineStage(slug: string, artifacts: ArtifactState, workBranch: string | null, projectRoot?: string): string {
  const { scope, plan, specs, buildReports, verifyReports } = artifacts;
  const totalPhases = specs.length;

  // Scope only → ready for plan (or plan-in-progress if timestamp is recent)
  if (scope.exists && !plan.exists) {
    if (projectRoot) {
      const planSavesDir = path.join(projectRoot, '.ana', 'plans', 'active', slug);
      if (isTimestampRecent(planSavesDir, 'plan_started_at')) {
        return 'plan-in-progress';
      }
    }
    return 'ready-for-plan';
  }

  // No specs → ready for plan
  if (specs.length === 0) {
    return 'ready-for-plan';
  }

  // Single-spec workflow
  if (totalPhases === 1) {
    if (!workBranch) {
      // Check if a worktree exists — build may be in progress even without a detected branch
      if (projectRoot && worktreeExists(projectRoot, slug)) {
        return 'build-in-progress';
      }
      return 'ready-for-build';
    }

    const hasBuildReport = buildReports.length > 0;
    const hasVerifyReport = verifyReports.length > 0;

    if (!hasBuildReport) {
      return 'build-in-progress';
    }

    if (hasBuildReport && !hasVerifyReport) {
      // Check if verify session is in progress via worktree timestamp
      if (projectRoot && worktreeExists(projectRoot, slug)) {
        const wtSavesDir = path.join(getWorktreePath(projectRoot, slug), '.ana', 'plans', 'active', slug);
        if (isTimestampRecent(wtSavesDir, 'verify_started_at')) {
          return 'verify-in-progress';
        }
      }
      return 'ready-for-verify';
    }

    if (hasVerifyReport) {
      const result = verifyReports[0]?.result;
      if (result === 'PASS') {
        return 'ready-to-merge';
      } else if (result === 'FAIL') {
        // Check if build report was saved AFTER verify report via .saves.json timestamps
        try {
          const savesPath = `.ana/plans/active/${slug}/.saves.json`;
          const savesContent = readFileOnBranch(workBranch, savesPath);
          if (savesContent) {
            const saves = JSON.parse(savesContent) as Record<string, { saved_at?: string }>;
            const buildSavedAt = saves['build-report']?.saved_at;
            const verifySavedAt = saves['verify-report']?.saved_at;
            if (buildSavedAt && verifySavedAt && new Date(buildSavedAt) > new Date(verifySavedAt)) {
              return 'ready-for-re-verify';
            }
          }
        } catch { /* fall through to needs-fixes */ }
        return 'needs-fixes';
      } else {
        return 'verify-status-unknown';
      }
    }
  }

  // Multi-spec workflow
  if (totalPhases > 1) {
    if (!workBranch) {
      if (projectRoot && worktreeExists(projectRoot, slug)) {
        return 'phase-1-build-in-progress';
      }
      return 'phase-1-ready-for-build';
    }

    // Determine which phase we're on
    for (let i = 0; i < totalPhases; i++) {
      const phaseNum = i + 1;
      const spec = specs[i];
      if (!spec) continue;
      const expectedBuildReport = spec.file === 'spec.md' ? 'build_report.md' : `build_report_${phaseNum}.md`;
      const expectedVerifyReport = spec.file === 'spec.md' ? 'verify_report.md' : `verify_report_${phaseNum}.md`;

      const phaseBuildReport = buildReports.find(r => r.file === expectedBuildReport);
      const phaseVerifyReport = verifyReports.find(r => r.file === expectedVerifyReport);

      if (!phaseBuildReport) {
        // This phase not built yet
        if (phaseNum === 1) {
          return 'phase-1-build-in-progress';
        } else {
          return `phase-${phaseNum}-ready-for-build`;
        }
      }

      if (phaseBuildReport && !phaseVerifyReport) {
        // Check verify-in-progress via worktree timestamp
        if (projectRoot && worktreeExists(projectRoot, slug)) {
          const wtSavesDir = path.join(getWorktreePath(projectRoot, slug), '.ana', 'plans', 'active', slug);
          if (isTimestampRecent(wtSavesDir, 'verify_started_at')) {
            return `phase-${phaseNum}-verify-in-progress`;
          }
        }
        return `phase-${phaseNum}-ready-for-verify`;
      }

      if (phaseVerifyReport) {
        const result = phaseVerifyReport.result;
        if (result === 'FAIL') {
          // Check if build report was saved after verify via .saves.json timestamps
          try {
            const savesPath = `.ana/plans/active/${slug}/.saves.json`;
            const savesContent = readFileOnBranch(workBranch, savesPath);
            if (savesContent) {
              const saves = JSON.parse(savesContent) as Record<string, { saved_at?: string }>;
              // Try phase-numbered keys first, fall back to unnumbered for backward compat
              const buildKey = `build-report-${phaseNum}`;
              const verifyKey = `verify-report-${phaseNum}`;
              const buildSavedAt = (saves[buildKey] ?? (phaseNum === 1 ? saves['build-report'] : undefined))?.saved_at;
              const verifySavedAt = (saves[verifyKey] ?? (phaseNum === 1 ? saves['verify-report'] : undefined))?.saved_at;
              if (buildSavedAt && verifySavedAt && new Date(buildSavedAt) > new Date(verifySavedAt)) {
                return `phase-${phaseNum}-ready-for-re-verify`;
              }
            }
          } catch { /* fall through */ }
          return `phase-${phaseNum}-needs-fixes`;
        } else if (result === 'PASS') {
          // This phase passed, continue to next phase
          continue;
        } else {
          return `phase-${phaseNum}-verify-status-unknown`;
        }
      }
    }

    // All phases passed
    return 'ready-to-merge';
  }

  return 'unknown';
}

/**
 * Determine next action command for a stage
 *
 * @param stage - Pipeline stage
 * @param slug - Work item slug
 * @param _branchPrefix - Configured branch prefix (unused, kept for API compat)
 * @param artifactBranch - Artifact branch name for --merge guidance
 * @returns Copy-pasteable command
 */
function getNextAction(stage: string, slug: string, _branchPrefix: string, artifactBranch?: string): string | string[] {
  if (stage === 'plan-in-progress') {
    return `Plan session in progress. Use \`ana work start ${slug} --force\` to override.`;
  }

  if (stage === 'ready-for-plan') {
    return 'claude --agent ana-plan';
  }

  if (stage === 'verify-in-progress') {
    return `Verify session in progress. Use \`ana work start ${slug} --force\` to override.`;
  }

  if (stage === 'ready-for-build') {
    return 'claude --agent ana-build';
  }

  if (stage === 'build-in-progress') {
    return 'claude --agent ana-build';
  }

  if (stage === 'ready-for-verify') {
    return 'claude --agent ana-verify';
  }

  if (stage === 'ready-for-re-verify') {
    return 'claude --agent ana-verify';
  }

  if (stage === 'needs-fixes') {
    return 'claude --agent ana-build';
  }

  if (stage === 'ready-to-merge') {
    return [
      `Review PR, then: ana work complete ${slug}`,
      `Or to merge and complete (from ${artifactBranch ?? 'the artifact branch'}): ana work complete --merge ${slug}`,
    ];
  }

  // Multi-phase stages
  if (stage.includes('verify-in-progress')) {
    return `Verify session in progress. Use \`ana work start ${slug} --force\` to override.`;
  }

  if (stage.includes('ready-for-build')) {
    return 'claude --agent ana-build';
  }

  if (stage.includes('ready-for-re-verify')) {
    return 'claude --agent ana-verify';
  }

  if (stage.includes('ready-for-verify')) {
    return 'claude --agent ana-verify';
  }

  if (stage.includes('build-in-progress')) {
    return 'claude --agent ana-build';
  }

  if (stage.includes('needs-fixes')) {
    return 'claude --agent ana-build';
  }

  return '(unknown stage)';
}

/**
 * Render version notification lines (update available, project mismatch).
 *
 * @param output - Status output with version check results
 */
function printVersionNotifications(output: StatusOutput): void {
  if (output.updateAvailable) {
    console.log(chalk.gray(
      `ℹ anatomia-cli v${output.updateAvailable.latest} available (current: v${output.updateAvailable.current}). Run: npm update -g anatomia-cli`
    ));
  }
  if (output.projectMismatch) {
    console.log(chalk.gray(
      `ℹ Project initialized with v${output.projectMismatch.projectVersion} (current CLI: v${output.projectMismatch.cliVersion}). Run: ana init`
    ));
  }
}

/**
 * Print human-readable status output
 *
 * @param output - Status output structure
 */
function printHumanReadable(output: StatusOutput): void {
  console.log(chalk.bold(`\nPipeline Status (artifact branch: ${output.artifactBranch})\n`));

  if (!output.onArtifactBranch) {
    console.log(chalk.yellow(`ℹ You're on ${output.currentBranch}. Artifact branch is ${output.artifactBranch}.`));
    console.log(chalk.yellow(`  To switch: git checkout ${output.artifactBranch} && git pull\n`));
  }

  if (output.items.length === 0) {
    printVersionNotifications(output);
    console.log(chalk.gray('No active work. Run: claude --agent ana to scope new work.'));
    return;
  }

  for (const item of output.items) {
    console.log(chalk.bold(`  ${item.slug} (${item.totalPhases} phase${item.totalPhases === 1 ? '' : 's'}):`));

    // Show planning artifacts
    const artifactMark = (a: { exists: boolean; location?: string }) =>
      !a.exists ? chalk.red('✗') : a.location === 'untracked' ? chalk.yellow('⚠') : chalk.green('✓');
    const artifactLocation = (a: { exists: boolean; location?: string }) =>
      !a.exists ? 'missing' : a.location === 'untracked' ? 'untracked (run ana artifact save-all)' : (a.location || 'missing');

    console.log(`    scope.md         ${artifactMark(item.artifacts.scope)} ${artifactLocation(item.artifacts.scope)}`);
    console.log(`    plan.md          ${artifactMark(item.artifacts.plan)} ${artifactLocation(item.artifacts.plan)}`);

    // Show specs
    for (const spec of item.artifacts.specs) {
      console.log(`    ${spec.file.padEnd(16)} ${artifactMark(spec)} ${artifactLocation(spec)}`);
    }

    // Show phase status for multi-spec
    if (item.totalPhases > 1) {
      for (let i = 0; i < item.totalPhases; i++) {
        const phaseNum = i + 1;
        const phaseSpec = item.artifacts.specs[i];
        if (!phaseSpec) continue;
        const expectedBuildReport = phaseSpec.file === 'spec.md' ? 'build_report.md' : `build_report_${phaseNum}.md`;
        const expectedVerifyReport = phaseSpec.file === 'spec.md' ? 'verify_report.md' : `verify_report_${phaseNum}.md`;

        const hasBuild = item.artifacts.buildReports.some(r => r.file === expectedBuildReport);
        const verify = item.artifacts.verifyReports.find(r => r.file === expectedVerifyReport);

        const buildStatus = hasBuild ? chalk.green('✓ built') : 'not started';
        const verifyStatus = verify
          ? verify.result === 'PASS'
            ? chalk.green('✓ verified')
            : verify.result === 'FAIL'
            ? chalk.red('✗ failed')
            : 'verify pending'
          : chalk.red('✗ not verified');

        console.log(`    Phase ${phaseNum}: ${buildStatus} ${verifyStatus}`);
      }
    } else {
      // Show build/verify for single-spec
      for (const report of item.artifacts.buildReports) {
        const mark = chalk.green('✓');
        console.log(`    ${report.file.padEnd(16)} ${mark} ${report.location}`);
      }

      for (const report of item.artifacts.verifyReports) {
        const mark = report.result === 'PASS' ? chalk.green('✓') : chalk.red('✗');
        console.log(`    ${report.file.padEnd(16)} ${mark} ${report.location}`);
      }
    }

    // Show worktree info if exists
    if (item.worktreeInfo) {
      const wt = item.worktreeInfo;
      const activityLabel = wt.lastActivityDays === 0 ? 'today' : `${wt.lastActivityDays}d ago`;
      const staleFlag = wt.isStale ? chalk.yellow(' ⚠ stale') : '';
      const behindFlag = wt.commitsBehind > 0 ? chalk.yellow(` ⚠ ${wt.commitsBehind} behind ${output.artifactBranch}`) : '';
      console.log(`    Worktree: ${path.relative(process.cwd(), wt.path) || wt.path} (${wt.commitCount} commit${wt.commitCount !== 1 ? 's' : ''}, last activity ${activityLabel})${staleFlag}${behindFlag}`);
    }

    // Show stage and next action
    console.log(`    ${chalk.bold('Stage:')} ${item.stage}`);
    if (Array.isArray(item.nextAction)) {
      for (const line of item.nextAction) {
        console.log(chalk.cyan(`    → ${line}`));
      }
      console.log('');
    } else {
      console.log(chalk.cyan(`    → ${item.nextAction}\n`));
    }
  }

  printVersionNotifications(output);
  console.log(chalk.gray('Scope new work: claude --agent ana'));
}

/**
 * Get work status across all active work items
 *
 * @param options - Command options
 * @param options.json - Output JSON format instead of human-readable
 * @param options.session - Write a session marker file for think-time capture
 */
export async function getWorkStatus(options: { json?: boolean; session?: boolean }): Promise<void> {
  const projectRoot = findProjectRoot();

  // Write session marker for think-time capture (best-effort, silent on failure)
  if (options.session) {
    const claudePid = getClaudePid();
    if (claudePid !== null) {
      try {
        const stateDir = path.join(projectRoot, '.ana', 'state');
        await fsPromises.mkdir(stateDir, { recursive: true });
        const sessionPath = path.join(stateDir, `session-${claudePid}.json`);
        await fsPromises.writeFile(sessionPath, JSON.stringify({ timestamp: new Date().toISOString() }), 'utf-8');
      } catch {
        // Silent failure — session marker is best-effort
      }
    }
  }

  const artifactBranch = readArtifactBranch(projectRoot);
  const currentBranch = getCurrentBranch();

  if (!currentBranch) {
    console.log(chalk.yellow('Not a git repo. Showing filesystem-only status.\n'));
  }

  const onArtifactBranch = currentBranch === artifactBranch;

  // Best-effort fetch (don't fail if offline)
  if (currentBranch) {
    const fetchResult = runGit(['fetch', 'origin', artifactBranch, '--quiet']);
    if (fetchResult.exitCode === 0) {
      // Warn if local artifact branch is behind remote
      const behindResult = runGit(['rev-list', `${artifactBranch}..origin/${artifactBranch}`, '--count']);
      const behind = behindResult.stdout;
      if (parseInt(behind) > 0) {
        console.log(chalk.yellow(
          `ℹ ${artifactBranch} is ${behind} commit${behind === '1' ? '' : 's'} behind remote.`
        ));
      }
    }
    // Silently continue with local state on fetch failure

    // Prune stale worktree records before discovery
    try {
      runGit(['worktree', 'prune']);
    } catch {
      // Swallow errors silently — prune is best-effort
    }
  }

  // Version awareness checks (best-effort, non-blocking)
  const versionCheck = await checkForUpdates(projectRoot);

  // Discover slugs
  const slugs = discoverSlugs(artifactBranch, onArtifactBranch, projectRoot);

  if (slugs.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({
        artifactBranch,
        currentBranch: currentBranch || 'unknown',
        onArtifactBranch,
        updateAvailable: versionCheck.updateAvailable,
        projectMismatch: versionCheck.projectMismatch,
        items: [],
      }, null, 2));
    } else {
      printVersionNotifications({
        artifactBranch,
        currentBranch: currentBranch || 'unknown',
        onArtifactBranch,
        updateAvailable: versionCheck.updateAvailable,
        projectMismatch: versionCheck.projectMismatch,
        items: [],
      });
      console.log(chalk.gray('\nNo active work. Run: claude --agent ana to scope new work.'));
    }
    return;
  }

  // Gather state for each slug
  const items: WorkItem[] = [];
  for (const slug of slugs) {
    const artifacts = gatherArtifactState(slug, artifactBranch, onArtifactBranch, projectRoot);

    // Skip empty directories (no scope = not real work)
    if (!artifacts.scope.exists) {
      continue;
    }

    const workBranch = getWorkBranch(slug);
    const stage = determineStage(slug, artifacts, workBranch, projectRoot);
    const nextAction = getNextAction(stage, slug, '', artifactBranch);

    // Check for worktree info
    const wtInfo = getWorktreeInfo(projectRoot, slug);

    items.push({
      slug,
      totalPhases: artifacts.specs.length,
      artifacts,
      workBranch,
      stage,
      nextAction,
      worktreeInfo: wtInfo,
    });
  }

  const output: StatusOutput = {
    artifactBranch,
    currentBranch: currentBranch || 'unknown',
    onArtifactBranch,
    updateAvailable: versionCheck.updateAvailable,
    projectMismatch: versionCheck.projectMismatch,
    items,
  };

  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    printHumanReadable(output);
  }
}


// ProofChain, ProofChainStats imported from types/proof.ts

/**
 * Guard against completing work with a FAIL verification result.
 * Prints error messages and exits the process if result is FAIL.
 *
 * @param result - Verification result string
 * @param context - Optional context (e.g., "Phase 2") for the error message
 */
function guardFailResult(result: string, context?: string): void {
  if (result === 'FAIL') {
    const prefix = context ? `${context}: ` : '';
    console.error(chalk.red(`Error: ${prefix}Cannot complete work with a FAIL verification result.`));
    console.error(chalk.gray('The verify report says FAIL. Fix the issues and re-verify before completing.'));
    console.error(chalk.gray('Run: claude --agent ana-build to fix, then claude --agent ana-verify'));
    process.exit(1);
  }
}

/**
 * Write a proof chain entry for a completed work item and regenerate the dashboard.
 *
 * @param slug - Work item slug
 * @param proof - Proof summary data
 * @param projectRoot - Project root directory
 * @param worktreeMeta - Optional worktree metadata to include in the proof chain entry
 * @returns Chain health counts: total runs and cumulative findings
 */
async function writeProofChain(slug: string, proof: ProofSummary, projectRoot: string, worktreeMeta?: ProofChainEntry['worktree']): Promise<ProofChainStats> {
  const anaDir = path.join(projectRoot, '.ana');

  // Ensure .ana directory exists
  await fsPromises.mkdir(anaDir, { recursive: true });

  // 1. Write/append to proof_chain.json
  const chainPath = path.join(anaDir, 'proof_chain.json');
  let chain: ProofChain = { entries: [] };

  if (fs.existsSync(chainPath)) {
    try {
      chain = JSON.parse(fs.readFileSync(chainPath, 'utf-8'));
      if (!Array.isArray(chain.entries)) {
        chain = { entries: [] };
      }
    } catch {
      chain = { entries: [] };
    }
  }

  // Read modules_touched and commit_hygiene from .saves.json (captured at
  // build-report save time when the feature branch definitely exists and
  // all code is committed).
  let modulesTouched: string[] = [];
  let commitHygiene: Array<{ check: string; file: string; severity: string; message: string }> = [];
  try {
    const slugSaves = path.join(anaDir, 'plans', 'completed', slug, '.saves.json');
    if (fs.existsSync(slugSaves)) {
      const savesContent = JSON.parse(fs.readFileSync(slugSaves, 'utf-8'));
      if (Array.isArray(savesContent['modules_touched'])) {
        modulesTouched = savesContent['modules_touched'];
      }
      if (Array.isArray(savesContent['commit_hygiene'])) {
        commitHygiene = savesContent['commit_hygiene'];
      }
    }
  } catch { /* fall back to empty */ }

  // FAIL result guard — block proof chain entry for failed verification
  guardFailResult(proof.result);

  // UNKNOWN result warning (AC12)
  const completedPlanDir = path.join(anaDir, 'plans', 'completed', slug);
  if (proof.result === 'UNKNOWN') {
    const verifyReportPath = path.join(completedPlanDir, 'verify_report.md');
    if (fs.existsSync(verifyReportPath)) {
      console.error(chalk.yellow(`Warning: Entry '${slug}' has result UNKNOWN but a verify report exists. Check verify_report.md for a Result line.`));
    }
  }

  const entry: ProofChainEntry = {
    slug,
    feature: proof.feature,
    result: proof.result,
    author: proof.author,
    contract: proof.contract,
    assertions: proof.assertions.map(a => {
      const base: ProofChainEntry['assertions'][0] = {
        id: a.id,
        says: a.says,
        status: (a.verifyStatus || 'UNVERIFIED') as ProofChainEntry['assertions'][0]['status'],
      };
      if (a.verifyStatus === 'DEVIATED') {
        const deviation = proof.deviations.find(d => d.contract_id === a.id)?.instead;
        if (deviation) base.deviation = deviation;
      }
      return base;
    }),
    acceptance_criteria: proof.acceptance_criteria,
    timing: proof.timing,
    hashes: proof.hashes,
    completed_at: new Date().toISOString(),
    modules_touched: modulesTouched,
    scope_summary: proof.scope_summary,
    kind: proof.kind,
    findings: proof.findings.map((c, i) => ({
      ...c,
      id: `${slug}-C${i + 1}`,
      status: 'active' as const,
    } as ProofChainEntry['findings'][0])),
    rejection_cycles: proof.rejection_cycles,
    previous_failures: proof.previous_failures,
    build_concerns: proof.build_concerns ?? [],
    ...(commitHygiene.length > 0 ? { commit_hygiene: commitHygiene } : {}),
    ...(worktreeMeta ? { worktree: worktreeMeta } : {}),
  };

  // Populate phases from plan.md if available
  try {
    const planPath = path.join(completedPlanDir, 'plan.md');
    if (fs.existsSync(planPath)) {
      const planContent = fs.readFileSync(planPath, 'utf-8');
      const { total } = countPhases(planContent);
      if (total > 1) {
        entry.phases = total;
      }
    }
  } catch { /* plan.md unavailable — omit phases field */ }

  // Assign status to new findings
  for (const finding of entry.findings) {
    if (finding.category === 'upstream') {
      finding.status = 'closed';
      finding.closed_reason = 'upstream';
      finding.closed_at = new Date().toISOString();
      finding.closed_by = 'mechanical';
    } else {
      finding.status = 'active';
    }
  }

  // Resolve finding/build_concern file fields from basenames to full paths.
  // Shared cache avoids redundant globSync calls across all resolution passes.
  const globCache = new Map<string, string[]>();

  // New entry: resolve against its own modules_touched
  resolveFindingPaths(entry.findings, entry.modules_touched, projectRoot, globCache);
  resolveFindingPaths(entry.build_concerns, entry.modules_touched, projectRoot, globCache);

  // Maintenance counters
  let autoClosed = 0;

  // Existing entries: resolve finding paths (idempotent — already-resolved files are skipped)
  for (const existing of chain.entries) {
    resolveFindingPaths(existing.findings || [], existing.modules_touched || [], projectRoot, globCache);
    resolveFindingPaths(existing.build_concerns || [], existing.modules_touched || [], projectRoot, globCache);
  }

  // Staleness checks — run after path resolution and status assignment
  // Process all entries (existing + new)
  const allEntries = [...chain.entries, entry];
  const fileContentCache = new Map<string, string | null>();
  const globResultCache = new Map<string, string[]>();

  const readFileContent = (filePath: string): string | null => {
    if (fileContentCache.has(filePath)) return fileContentCache.get(filePath)!;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      fileContentCache.set(filePath, content);
      return content;
    } catch {
      fileContentCache.set(filePath, null);
      return null;
    }
  };

  for (const chainEntry of allEntries) {
    for (const finding of chainEntry.findings || []) {
      // Backfill migration: convert legacy lesson findings to closed
      if ((finding.status as string) === 'lesson') {
        finding.status = 'closed';
        if (!finding.closed_reason) {
          finding.closed_reason = 'upstream';
          finding.closed_by = 'mechanical';
          finding.closed_at = chainEntry.completed_at || new Date().toISOString();
        }
      }

      // Skip already-closed findings
      if (finding.status === 'closed') continue;

      // Skip findings without file reference
      if (!finding.file) continue;

      const fullPath = path.join(projectRoot, finding.file);

      if (fs.existsSync(fullPath)) {
        // File exists — run anchor-absent check
        if (finding.anchor) {
          const content = readFileContent(fullPath);
          if (content !== null && !content.includes(finding.anchor)) {
            finding.status = 'closed';
            finding.closed_reason = 'code changed, anchor absent';
            finding.closed_at = new Date().toISOString();
            finding.closed_by = 'mechanical';
            autoClosed++;
          }
        }
      } else {
        // File does NOT exist at declared path — glob for the basename
        const basename = path.basename(finding.file);
        let matches = globResultCache.get(basename);
        if (matches === undefined) {
          matches = globSync('**/' + basename, {
            cwd: projectRoot,
            ignore: ['**/node_modules/**', '**/.ana/**'],
          });
          globResultCache.set(basename, matches);
        }

        if (matches.length === 0) {
          // Genuinely deleted — no file with this name exists anywhere
          finding.status = 'closed';
          finding.closed_reason = 'file removed';
          finding.closed_at = new Date().toISOString();
          finding.closed_by = 'mechanical';
          autoClosed++;
        }
        // 1+ matches → file exists elsewhere, conservative — skip
      }
    }
  }

  // Supersession removed — same-file + same-category heuristic can't
  // distinguish same-issue from different-issue without semantic judgment.

  chain.entries.push(entry);
  chain.schema = 1;
  await fsPromises.writeFile(chainPath, JSON.stringify(chain, null, 2));

  // 2. Regenerate PROOF_CHAIN.md as quality dashboard
  const chainMdPath = path.join(anaDir, 'PROOF_CHAIN.md');

  // Compute chain health counts via shared utility
  const health = computeChainHealth(chain);
  const { chain_runs: runs, findings: { active: activeCount, closed: closedCount, promoted: promotedCount, total: totalFindings } } = health;

  const dashboardMd = generateDashboard(chain.entries, { runs, active: activeCount, promoted: promotedCount, closed: closedCount });
  await fsPromises.writeFile(chainMdPath, dashboardMd);

  const stats: ProofChainStats = {
    runs,
    findings: totalFindings,
    active: activeCount,
    promoted: promotedCount,
    closed: closedCount,
    newFindings: entry.findings.length,
  };

  if (autoClosed > 0) {
    stats.maintenance = { auto_closed: autoClosed };
  }

  return stats;
}

/**
 * Complete a work item after PR merge
 *
 * @param slug - Work item slug to complete
 * @param options - Optional flags for output format and merge behavior
 * @param options.json - When true, output structured JSON envelope instead of console output
 * @param options.merge - When true, merge the PR via GitHub CLI before completing
 */
export async function completeWork(slug: string, options?: { json?: boolean; merge?: boolean }): Promise<void> {
  // 0a. Guard: cannot run from inside a worktree
  if (isWorktreeDirectory()) {
    console.error(chalk.red('Error: Run work complete from the main project directory, not from a worktree.'));
    process.exit(1);
  }

  // 0. Validate slug format
  try {
    validateSlug(slug);
  } catch {
    console.error(chalk.red('Error: Invalid slug format. Use kebab-case: fix-auth-timeout, add-export-csv'));
    process.exit(1);
  }

  // 1. Read artifactBranch and coAuthor from ana.json
  const projectRoot = findProjectRoot();
  const artifactBranch = readArtifactBranch(projectRoot);

  // Hoist coAuthor read — shared by recovery path (step 5) and main commit path (step 10)
  const coAuthor = readCoAuthor(projectRoot);

  // 2. Get current branch
  const currentBranch = getCurrentBranch();
  if (!currentBranch) {
    console.error(chalk.red('Error: Not a git repository.'));
    process.exit(1);
  }

  // 3. Verify on artifact branch
  if (currentBranch !== artifactBranch) {
    if (options?.merge) {
      console.error(chalk.red(`Error: You're on \`${currentBranch}\`. Switch to \`${artifactBranch}\` to complete work.`));
      console.error(chalk.gray('`--merge` handles the merge, but must run from the artifact branch.'));
      console.error(chalk.gray(`Run: git checkout ${artifactBranch} && git pull`));
    } else {
      console.error(chalk.red(`Error: You're on \`${currentBranch}\`. Switch to \`${artifactBranch}\` to complete work.`));
      console.error(chalk.gray('The PR should be merged before completing.'));
      console.error(chalk.gray(`Run: git checkout ${artifactBranch} && git pull`));
    }
    process.exit(1);
  }

  // 3b. Merge PR if --merge flag is set
  if (options?.merge) {
    // Look up by slug first; fall back to config reconstruction if branch is already deleted
    const lookedUpBranch = getWorkBranch(slug);
    const workBranchName = lookedUpBranch ?? `${readBranchPrefix(projectRoot, extractScopeKind(path.join(projectRoot, '.ana', 'plans', 'active', slug, 'scope.md')))}${slug}`;

    // Check gh CLI availability
    const ghCheck = spawnSync('gh', ['--version'], { stdio: 'pipe' });
    if (ghCheck.status !== 0) {
      console.error(chalk.red('Error: GitHub CLI (gh) not found.'));
      console.error(chalk.gray('Install from https://cli.github.com/'));
      if (options?.json) {
        console.log(JSON.stringify(wrapJsonError('work complete', 'GH_NOT_FOUND', 'GitHub CLI (gh) not found. Install from https://cli.github.com/', {}, null), null, 2));
      }
      process.exit(1);
    }

    // Get PR state
    const prView = spawnSync('gh', ['pr', 'view', workBranchName, '--json', 'state,baseRefName'], {
      cwd: projectRoot, encoding: 'utf-8', stdio: 'pipe',
    });

    if (prView.status !== 0) {
      // No PR found
      console.error(chalk.red(`Error: No PR found for branch \`${workBranchName}\`.`));
      console.error(chalk.gray(`Create one first: ana pr create ${slug}`));
      if (options?.json) {
        console.log(JSON.stringify(wrapJsonError('work complete', 'NO_PR', `No PR found for branch \`${workBranchName}\`. Create one first: ana pr create ${slug}`, {}, null), null, 2));
      }
      process.exit(1);
    }

    let prData: { state: string; baseRefName: string };
    try {
      prData = JSON.parse(prView.stdout.trim());
    } catch {
      console.error(chalk.red('Error: Failed to parse PR data from GitHub CLI.'));
      console.error(chalk.gray(prView.stdout?.trim() || '(empty response)'));
      if (options?.json) {
        console.log(JSON.stringify(wrapJsonError('work complete', 'PR_PARSE_ERROR', 'Failed to parse PR data from GitHub CLI.', {}, null), null, 2));
      }
      process.exit(1);
    }

    // Already merged — skip merge step
    if (prData.state === 'MERGED') {
      if (!options?.json) {
        console.log('PR already merged. Continuing with completion...');
      }
    } else {
      // Validate base branch matches artifactBranch
      if (prData.baseRefName !== artifactBranch) {
        console.error(chalk.red(`Error: PR base branch is \`${prData.baseRefName}\` but artifact branch is \`${artifactBranch}\`.`));
        console.error(chalk.gray(`The PR must target \`${artifactBranch}\` to complete this work item.`));
        if (options?.json) {
          console.log(JSON.stringify(wrapJsonError('work complete', 'BASE_MISMATCH', `PR base branch is \`${prData.baseRefName}\` but artifact branch is \`${artifactBranch}\`. The PR must target \`${artifactBranch}\`.`, {}, null), null, 2));
        }
        process.exit(1);
      }

      // Attempt merge
      if (!options?.json) {
        console.log('Merging PR...');
      }
      const mergeResult = spawnSync('gh', ['pr', 'merge', workBranchName], {
        cwd: projectRoot, encoding: 'utf-8', stdio: 'pipe',
      });

      if (mergeResult.status !== 0) {
        const mergeOutput = (mergeResult.stderr || '') + (mergeResult.stdout || '');

        // Branch protection / checks blocking
        if (mergeOutput.includes('required status check') || (mergeOutput.includes('check') && mergeOutput.includes('pending')) || mergeOutput.includes('prohibits the merge')) {
          console.error(chalk.red('Error: Merge blocked by branch protection.'));
          console.error('');
          console.error(chalk.gray('Options:'));
          console.error(chalk.gray(`  Wait for checks, then retry:  ana work complete --merge ${slug}`));
          console.error(chalk.gray(`  Enable auto-merge:            gh pr merge --auto ${workBranchName}`));
          console.error(chalk.gray(`  Bypass (admin):               gh pr merge --admin ${workBranchName}`));
          console.error('');
          console.error(chalk.gray(`After merging manually: ana work complete ${slug}`));
          if (options?.json) {
            console.log(JSON.stringify(wrapJsonError('work complete', 'BRANCH_PROTECTION', 'Merge blocked by branch protection. Merge the PR manually, then run ana work complete.', {}, null), null, 2));
          }
          process.exit(1);
        }

        // Branch behind
        if (mergeOutput.includes('behind') || mergeOutput.includes('not up to date')) {
          const worktreePath = `.ana/worktrees/${slug}`;
          console.error(chalk.red('Error: Branch is behind the base branch. Rebase before merging:'));
          console.error('');
          console.error(chalk.gray(`  cd ${worktreePath}`));
          console.error(chalk.gray(`  git fetch origin ${artifactBranch}`));
          console.error(chalk.gray(`  git rebase origin/${artifactBranch}`));
          console.error(chalk.gray('  git push --force-with-lease'));
          console.error('');
          console.error(chalk.yellow('Warning: Force-pushing may dismiss existing PR approvals if the repo has "dismiss stale reviews" enabled.'));
          if (options?.json) {
            console.log(JSON.stringify(wrapJsonError('work complete', 'BRANCH_BEHIND', 'Branch is behind the base branch. Rebase before merging.', {}, null), null, 2));
          }
          process.exit(1);
        }

        // Multiple merge strategies
        if (mergeOutput.includes('merge strategy') || mergeOutput.includes('multiple merge methods')) {
          console.error(chalk.red('Error: Multiple merge strategies are enabled with no default.'));
          console.error(chalk.gray('Merge manually via GitHub or specify a strategy:'));
          console.error(chalk.gray('  gh pr merge --merge    (merge commit)'));
          console.error(chalk.gray('  gh pr merge --squash   (squash)'));
          console.error(chalk.gray('  gh pr merge --rebase   (rebase)'));
          console.error('');
          console.error(chalk.gray(`After merging: ana work complete ${slug}`));
          if (options?.json) {
            console.log(JSON.stringify(wrapJsonError('work complete', 'MULTIPLE_STRATEGIES', 'Multiple merge strategies are enabled with no default. Merge the PR manually or specify a strategy.', {}, null), null, 2));
          }
          process.exit(1);
        }

        // Unknown error — show raw output with guidance
        console.error(chalk.red('Error: Failed to merge PR.'));
        console.error(mergeOutput);
        console.error('');
        console.error(chalk.gray(`Merge the PR manually, then: ana work complete ${slug}`));
        if (options?.json) {
          console.log(JSON.stringify(wrapJsonError('work complete', 'MERGE_FAILED', mergeOutput.trim(), {}, null), null, 2));
        }
        process.exit(1);
      }

      if (!options?.json) {
        console.log('PR merged.');
      }
    }
  }

  // 4. Pull latest to get merged content
  {
    const remotes = runGit(['remote'], { cwd: projectRoot }).stdout;
    if (remotes) {
      let pullResult = runGit(['pull', '--rebase', '--autostash'], { cwd: projectRoot });

      // Handle "untracked working tree files would be overwritten" — caused by
      // Build/Verify agents writing artifacts to the artifact branch instead of the worktree.
      // If the untracked files match what's coming from the merge, remove them and retry.
      if (pullResult.exitCode !== 0 && pullResult.stderr.includes('untracked working tree files would be overwritten')) {
        const untrackedLines = pullResult.stderr.split('\n')
          .filter(line => line.startsWith('\t'))
          .map(line => line.trim());

        // Only auto-clean files inside this slug's plan directory
        const planPrefix = `.ana/plans/active/${slug}/`;
        const slugFiles = untrackedLines.filter(f => f.startsWith(planPrefix));
        const nonSlugFiles = untrackedLines.filter(f => !f.startsWith(planPrefix));

        if (nonSlugFiles.length > 0) {
          // Untracked files outside this slug's directory — don't touch, fail with context
          console.error(chalk.red('Error: Pull blocked by untracked files outside this work item:'));
          for (const f of nonSlugFiles) {
            console.error(chalk.gray(`  ${f}`));
          }
          console.error(chalk.gray('Remove or stash these files, then retry.'));
          process.exit(1);
        }

        if (slugFiles.length > 0) {
          // Partition into build/verify artifacts (unconditional removal) and
          // planning artifacts (content-match required)
          const isBuildVerifyArtifact = (relPath: string): boolean => {
            const basename = path.basename(relPath);
            return basename.startsWith('build_report') ||
              basename.startsWith('build_data') ||
              basename.startsWith('verify_report') ||
              basename.startsWith('verify_data');
          };

          const buildVerifyFiles = slugFiles.filter(f => isBuildVerifyArtifact(f));
          const planningFiles = slugFiles.filter(f => !isBuildVerifyArtifact(f));

          // Remove build/verify artifacts unconditionally — always agent-written
          if (buildVerifyFiles.length > 0) {
            for (const relPath of buildVerifyFiles) {
              try {
                fs.unlinkSync(path.join(projectRoot, relPath));
              } catch {
                // Best-effort
              }
            }
            if (!options?.json) {
              console.log(chalk.yellow(`  ⚠ Removed ${buildVerifyFiles.length} untracked build/verify artifact(s) from the artifact branch (always agent-written).`));
            }
          }

          // Planning artifacts require content-match before removal
          if (planningFiles.length > 0) {
            let allMatch = true;
            for (const relPath of planningFiles) {
              const localPath = path.join(projectRoot, relPath);
              let localContent: string;
              try {
                localContent = fs.readFileSync(localPath, 'utf-8');
              } catch {
                allMatch = false;
                break;
              }
              const remoteResult = runGit(['show', `origin/${artifactBranch}:${relPath}`], { cwd: projectRoot });
              if (remoteResult.exitCode !== 0 || remoteResult.stdout !== localContent) {
                allMatch = false;
                break;
              }
            }

            if (allMatch) {
              for (const relPath of planningFiles) {
                try {
                  fs.unlinkSync(path.join(projectRoot, relPath));
                } catch {
                  // Best-effort — file may already be removed
                }
              }
              if (!options?.json) {
                console.log(chalk.yellow(`  ⚠ Removed ${planningFiles.length} untracked planning artifact(s) from the artifact branch (matched merged content).`));
              }
            } else {
              console.error(chalk.red('Error: Pull blocked by untracked files that differ from the merged version:'));
              for (const f of planningFiles) {
                console.error(chalk.gray(`  ${f}`));
              }
              console.error(chalk.gray('These files were written to the artifact branch but differ from the PR. Inspect and remove manually.'));
              process.exit(1);
            }
          }

          // Retry pull if any files were removed
          if (buildVerifyFiles.length > 0 || planningFiles.length > 0) {
            pullResult = runGit(['pull', '--rebase', '--autostash'], { cwd: projectRoot });
          }
        }
      }

      if (pullResult.exitCode !== 0) {
        const errorMessage = pullResult.stderr;
        const lowerError = errorMessage.toLowerCase();
        if (lowerError.includes('conflict') || errorMessage.includes('Cannot rebase') || errorMessage.includes('could not apply')) {
          console.error(chalk.red('Error: Pull failed due to conflicts. Resolve conflicts and try again.'));
          console.error(chalk.gray(`  git stderr: ${errorMessage.split('\n')[0]}`));
          process.exit(1);
        }
        if (errorMessage) {
          console.error(chalk.yellow(`⚠ Warning: Pull failed. Continuing with local data.`));
          console.error(chalk.gray(`  git stderr: ${errorMessage.split('\n')[0]}`));
        }
      }
    }
  }

  // 5. Verify slug directory exists — with crash recovery
  const activePath = path.join(projectRoot, '.ana', 'plans', 'active', slug);
  const completedPath = path.join(projectRoot, '.ana', 'plans', 'completed', slug);

  if (!fs.existsSync(activePath)) {
    if (fs.existsSync(completedPath)) {
      // Check for uncommitted changes — indicates a failed prior run
      try {
        const porcelainResult = runGit(['status', '--porcelain', '.ana/'], { cwd: projectRoot });
        const porcelain = porcelainResult.stdout;
        if (porcelain) {
          // Recovery: retry the commit
          if (!options?.json) {
            console.log(chalk.yellow('Recovering incomplete completion — retrying commit...'));
          }
          const recoveryPaths = [`.ana/plans/completed/${slug}/`, '.ana/proof_chain.json', '.ana/PROOF_CHAIN.md'];
          runGit(['add', ...recoveryPaths], { cwd: projectRoot });
          const commitMessage = `[${slug}] Complete — archived to plans/completed\n\nCo-authored-by: ${coAuthor}`;
          const commitResult = spawnSync('git', ['commit', '--no-verify', '-m', commitMessage, '--', ...recoveryPaths], { stdio: 'pipe', cwd: projectRoot });
          if (commitResult.status !== 0) throw new Error(commitResult.stderr?.toString() || 'Commit failed');
          const pushResult = runGit(['push'], { cwd: projectRoot });
          if (pushResult.exitCode !== 0) {
            console.error(chalk.yellow('Warning: Push failed. Changes committed locally. Run `git push` manually.'));
          }

          // Print summary from completed path
          const proof = generateProofSummary(completedPath);
          const chainPath = path.join(projectRoot, '.ana', 'proof_chain.json');
          let recoveryChain: { entries: Array<{ findings?: Array<{ status?: string; severity?: string; suggested_action?: string }> }> } = { entries: [] };
          if (fs.existsSync(chainPath)) {
            try {
              recoveryChain = JSON.parse(fs.readFileSync(chainPath, 'utf-8'));
            } catch { /* */ }
          }
          const recoveryHealth = computeChainHealth(recoveryChain);
          const runs = recoveryHealth.chain_runs;
          const findingsCount = recoveryHealth.findings.total;

          if (options?.json) {
            const jsonResults = {
              slug,
              feature: proof.feature,
              result: proof.result,
              contract: {
                total: proof.contract.total,
                satisfied: proof.contract.satisfied,
                unsatisfied: proof.contract.unsatisfied,
                deviated: proof.contract.deviated,
              },
              new_findings: 0,
              rejection_cycles: proof.rejection_cycles ?? 0,
            };
            console.log(JSON.stringify(wrapJsonResponse('work complete', jsonResults, recoveryChain), null, 2));
          } else {
            const statusIcon = proof.result === 'PASS' ? '✓' : '✗';
            console.log(`\n${statusIcon} ${proof.result} — ${proof.feature}`);
            console.log(`  ${proof.contract.satisfied}/${proof.contract.total} satisfied · ${proof.deviations.length} deviation${proof.deviations.length !== 1 ? 's' : ''}`);
            console.log(chalk.gray(`  Chain: ${runs} ${runs !== 1 ? 'runs' : 'run'} · ${findingsCount} finding${findingsCount !== 1 ? 's' : ''}`));
          }
          return;
        }
      } catch (err) {
          // @ana A009, A010
          const errMsg = err instanceof Error ? err.message : String(err);
          if (!errMsg.includes('not a git repository')) {
            console.error(chalk.yellow(`⚠ Warning: Could not check recovery status: ${errMsg}`));
          }
        }

      console.log(chalk.gray(`Work item \`${slug}\` was already completed.`));
      process.exit(0);
    }
    console.error(chalk.red(`Error: No active work found for \`${slug}\`.`));
    process.exit(1);
  }

  // 6. Verify work branch was merged (optional - branch might be deleted)
  //    Prune stale remote refs — squash merge + --delete-branch removes
  //    the remote branch on GitHub but local refs persist until pruned.
  runGit(['fetch', '--prune', 'origin'], { cwd: projectRoot });
  // Silently continue with local state on failure

  const workBranchName = getWorkBranch(slug);
  if (workBranchName) {
    // Check if remote branch still exists after prune
    const remoteBranchResult = runGit(['branch', '-r', '--list', `origin/${workBranchName}`], { cwd: projectRoot });
    const hasRemote = remoteBranchResult.exitCode === 0 && remoteBranchResult.stdout.length > 0;

    if (hasRemote) {
      // Detect merge: gh pr list first (reliable for squash/rebase/force-push), is-ancestor fallback
      let merged = false;
      const ghResult = spawnSync('gh', ['pr', 'list', '--head', workBranchName, '--state', 'merged', '--json', 'state', '-q', '.[0].state'], {
        encoding: 'utf-8', stdio: 'pipe',
      });
      if (ghResult.status === 0 && ghResult.stdout && ghResult.stdout.trim() === 'MERGED') {
        merged = true;
      } else {
        // gh unavailable or no merged PR found — fall back to is-ancestor
        const ancestorResult = runGit(['merge-base', '--is-ancestor', workBranchName, 'HEAD'], { cwd: projectRoot });
        if (ancestorResult.exitCode === 0) {
          merged = true;
        }
      }
      if (!merged) {
        console.error(chalk.red(`Error: \`${workBranchName}\` has not been merged into \`${artifactBranch}\`.`));
        console.error(chalk.gray('Merge the PR first, then run this command again.'));
        process.exit(1);
      }
    }
    // else: remote deleted after prune = PR was merged (squash or regular)
  }

  // 7. Read plan.md to determine phases
  const planPath = path.join(activePath, 'plan.md');
  if (!fs.existsSync(planPath)) {
    console.error(chalk.red(`Error: No plan.md found for \`${slug}\`. Cannot determine phases.`));
    process.exit(1);
  }

  const planContent = fs.readFileSync(planPath, 'utf-8');
  const { specs } = countPhases(planContent);

  if (specs.length === 0) {
    console.error(chalk.red(`Error: No phases found in plan.md for \`${slug}\`.`));
    process.exit(1);
  }

  // 8. Verify ALL verify reports exist with PASS
  for (let i = 0; i < specs.length; i++) {
    const phaseNum = i + 1;
    const specFile = specs[i];
    if (!specFile) continue;

    // Determine verify report filename
    let verifyReportFile: string;
    if (specFile === 'spec.md') {
      verifyReportFile = 'verify_report.md';
    } else {
      const match = specFile.match(/spec-(\d+)\.md/);
      if (match) {
        verifyReportFile = `verify_report_${match[1]}.md`;
      } else {
        console.error(chalk.red(`Error: Unexpected spec filename: ${specFile}`));
        process.exit(1);
      }
    }

    const verifyReportPath = path.join(activePath, verifyReportFile);

    // Check if verify report exists
    if (!fs.existsSync(verifyReportPath)) {
      console.error(chalk.red(`Error: Phase ${phaseNum} has no verify report. Cannot complete.`));
      console.error(chalk.gray('Run `claude --agent ana-verify` to verify first.'));
      process.exit(1);
    }

    // Read and check result
    const verifyContent = fs.readFileSync(verifyReportPath, 'utf-8');
    const result = getVerifyResult(verifyContent);

    guardFailResult(result, `Phase ${phaseNum}`);

    if (result === 'unknown') {
      console.error(chalk.red(`Error: Phase ${phaseNum} verify report has no Result line.`));
      console.error(chalk.gray("Verify report must include '**Result:** PASS' or '**Result:** FAIL'."));
      process.exit(1);
    }
  }

  // 8b. Completeness check — verify both reports were saved through the pipeline
  // Phase-aware: for multi-phase work, check phase-numbered keys with fallback
  // to unnumbered keys for backward compatibility.
  const savesJsonPath = path.join(activePath, '.saves.json');
  let savesData: Record<string, { saved_at?: string; hash?: string }> = {};
  if (fs.existsSync(savesJsonPath)) {
    try {
      savesData = JSON.parse(fs.readFileSync(savesJsonPath, 'utf-8'));
    } catch { /* treat as empty */ }
  }

  // Check each phase for saved build-report and verify-report
  for (let i = 0; i < specs.length; i++) {
    const phaseNum = i + 1;
    const specFile = specs[i];
    if (!specFile) continue;

    // For single-spec (spec.md) use unnumbered keys; for numbered specs use phase-numbered keys with fallback
    const isUnnumbered = specFile === 'spec.md';
    const buildKey = isUnnumbered ? 'build-report' : `build-report-${phaseNum}`;
    const verifyKey = isUnnumbered ? 'verify-report' : `verify-report-${phaseNum}`;

    // Phase-aware lookup with fallback to unnumbered keys for backward compat (phase 1 only)
    const buildSave = savesData[buildKey] ?? (!isUnnumbered && phaseNum === 1 ? savesData['build-report'] : undefined);
    const verifySave = savesData[verifyKey] ?? (!isUnnumbered && phaseNum === 1 ? savesData['verify-report'] : undefined);
    const buildMissing = !buildSave || !buildSave.saved_at || !buildSave.hash;
    const verifyMissing = !verifySave || !verifySave.saved_at || !verifySave.hash;

    const phaseLabel = specs.length > 1 ? ` (phase ${phaseNum})` : '';
    if (buildMissing && verifyMissing) {
      console.error(chalk.red(`Error: Artifacts not saved through the pipeline${phaseLabel}:`));
      console.error(chalk.red(`  - build-report: run \`ana artifact save build-report${isUnnumbered ? '' : `-${phaseNum}`} ${slug}\``));
      console.error(chalk.red(`  - verify-report: run \`ana artifact save verify-report${isUnnumbered ? '' : `-${phaseNum}`} ${slug}\``));
      process.exit(1);
    } else if (buildMissing) {
      console.error(chalk.red(`Error: build-report${phaseLabel} was not saved through the pipeline.`));
      console.error(chalk.red(`Run: ana artifact save build-report${isUnnumbered ? '' : `-${phaseNum}`} ${slug}`));
      process.exit(1);
    } else if (verifyMissing) {
      console.error(chalk.red(`Error: verify-report${phaseLabel} was not saved through the pipeline.`));
      console.error(chalk.red(`Run: ana artifact save verify-report${isUnnumbered ? '' : `-${phaseNum}`} ${slug}`));
      process.exit(1);
    }
  }

  // 8c. Capture worktree metadata BEFORE removal (needed for proof chain)
  const wtPath = getWorktreePath(projectRoot, slug);
  const worktreeUsed = fs.existsSync(wtPath);
  let worktreeCommitCount = 0;
  let baseCommit: string | undefined;
  if (worktreeUsed) {
    const wtInfo = getWorktreeInfo(projectRoot, slug);
    worktreeCommitCount = wtInfo?.commitCount ?? 0;

    // Compute merge-base for proof chain (before worktree removal)
    try {
      const mbResult = runGit(['merge-base', artifactBranch, 'HEAD'], { cwd: wtPath });
      if (mbResult.exitCode === 0 && mbResult.stdout.length >= 40) {
        baseCommit = mbResult.stdout.slice(0, 40);
      }
    } catch {
      // Silently omit on failure
    }
  }

  // Read build_started_at from .saves.json as worktree created_at proxy
  let worktreeCreatedAt: string | null = null;
  try {
    const savesPath = path.join(activePath, '.saves.json');
    if (fs.existsSync(savesPath)) {
      const saves = JSON.parse(fs.readFileSync(savesPath, 'utf-8'));
      worktreeCreatedAt = saves['build_started_at'] ?? null;
    }
  } catch { /* fall back to null */ }

  // 8d. Remove worktree (must run from main tree, before branch delete)
  if (worktreeUsed) {
    await removeWorktree(projectRoot, slug);
  }
  // else: Worktree was already removed manually — AC11 (skip silently)

  // 9. Move the directory
  const completedDir = path.join(projectRoot, '.ana', 'plans', 'completed');
  await fsPromises.mkdir(completedDir, { recursive: true });
  await fsPromises.cp(activePath, completedPath, { recursive: true });
  await fsPromises.rm(activePath, { recursive: true, force: true });

  // 9a. Generate proof summary and write proof chain
  const proof = generateProofSummary(completedPath);
  const worktreeMeta = {
    used: worktreeUsed,
    created_at: worktreeCreatedAt,
    completed_at: new Date().toISOString(),
    commit_count: worktreeCommitCount,
    ...(baseCommit ? { base_commit: baseCommit } : {}),
  };
  const stats = await writeProofChain(slug, proof, projectRoot, worktreeMeta);

  // 10. Stage and commit
  try {
    const completePaths = [`.ana/plans/active/${slug}/`, `.ana/plans/completed/${slug}/`, '.ana/proof_chain.json', '.ana/PROOF_CHAIN.md'];
    runGit(['add', ...completePaths], { cwd: projectRoot });
    const commitMessage = `[${slug}] Complete — archived to plans/completed\n\nCo-authored-by: ${coAuthor}`;
    const commitResult = spawnSync('git', ['commit', '--no-verify', '-m', commitMessage, '--', ...completePaths], { stdio: 'pipe', cwd: projectRoot });
    if (commitResult.status !== 0) throw new Error(commitResult.stderr?.toString() || 'Commit failed');
  } catch {
    console.error(chalk.red(`Error: Failed to commit. Run \`ana work complete ${slug}\` to retry.`));
    process.exit(1);
  }

  // 11. Push
  const pushResult = runGit(['push'], { cwd: projectRoot });
  if (pushResult.exitCode !== 0) {
    console.error(chalk.yellow('Warning: Push failed. Changes committed locally. Run `git push` manually.'));
    // Don't exit - commit succeeded
  }

  // 12. Delete work branch (cleanup — force delete because squash/rebase merges
  //     create new commits, so the feature branch is never an ancestor of the artifact branch.
  //     Safe: step 6 already verified the branch was merged.)
  if (workBranchName) {
    runGit(['branch', '-D', workBranchName], { cwd: projectRoot });
    // Silently continue if branch doesn't exist or was already deleted

    runGit(['push', 'origin', '--delete', workBranchName], { cwd: projectRoot });
    // Silently continue if remote branch doesn't exist or was already deleted
  }

  // 13. Read chain once for both meta and health change detection
  const chainPath = path.join(projectRoot, '.ana', 'proof_chain.json');
  let mainChain: { entries: Array<{ slug?: string; findings?: Array<{ id?: string; status?: string; severity?: string; category?: string; suggested_action?: string; summary?: string; file?: string | null; promoted_to?: string }> }> } = { entries: [] };
  if (fs.existsSync(chainPath)) {
    try {
      mainChain = JSON.parse(fs.readFileSync(chainPath, 'utf-8'));
    } catch { /* use empty */ }
  }

  const healthChange = detectHealthChange(mainChain);

  // 14. Print summary or JSON output
  if (options?.json) {
    const jsonResults = {
      slug,
      feature: proof.feature,
      result: proof.result,
      contract: {
        total: proof.contract.total,
        satisfied: proof.contract.satisfied,
        unsatisfied: proof.contract.unsatisfied,
        deviated: proof.contract.deviated,
      },
      new_findings: stats.newFindings,
      rejection_cycles: proof.rejection_cycles ?? 0,
      quality: {
        changed: healthChange.changed,
        trajectory: healthChange.trajectory,
        triggers: healthChange.triggers,
        suggested_action: healthChange.triggers.includes('new_candidates')
          ? 'run_learn'
          : healthChange.triggers.includes('trend_worsened')
            ? 'run_audit'
            : null,
      },
    };
    let resolvesClaimsCount = 0;
    for (const f of proof.findings) {
      if (f.category === 'upstream' && f.resolves && f.resolves.length > 0) {
        resolvesClaimsCount += f.resolves.length;
      }
    }
    if (resolvesClaimsCount > 0) {
      (jsonResults as Record<string, unknown>)['resolves_claims'] = resolvesClaimsCount;
    }
    console.log(JSON.stringify(wrapJsonResponse('work complete', jsonResults, mainChain), null, 2));
  } else {
    const statusIcon = proof.result === 'PASS' ? '✓' : '✗';
    console.log(`\n${statusIcon} ${proof.result} — ${proof.feature}`);
    console.log(`  ${proof.contract.satisfied}/${proof.contract.total} satisfied · ${proof.deviations.length} deviation${proof.deviations.length !== 1 ? 's' : ''}`);
    const chainLine = stats.newFindings > 0
      ? `  Chain: ${stats.runs} ${stats.runs !== 1 ? 'runs' : 'run'} · ${stats.findings} finding${stats.findings !== 1 ? 's' : ''} (+${stats.newFindings} new)`
      : `  Chain: ${stats.runs} ${stats.runs !== 1 ? 'runs' : 'run'} · ${stats.findings} finding${stats.findings !== 1 ? 's' : ''}`;
    console.log(chalk.gray(chainLine));

    // Fourth line: health change notification
    if (healthChange.changed && healthChange.details.length > 0) {
      let healthLine = `  Health: ${healthChange.details.join(' · ')}`;
      if (healthChange.triggers.includes('new_candidates')) {
        healthLine += ' → claude --agent ana-learn';
      } else if (healthChange.triggers.includes('trend_worsened')) {
        healthLine += ' → ana proof audit';
      }
      console.log(chalk.gray(healthLine));
    }

    // Fifth line: resolution claims summary (only when upstream findings have resolves)
    let resolvesCount = 0;
    for (const f of proof.findings) {
      if (f.category === 'upstream' && f.resolves && f.resolves.length > 0) {
        resolvesCount += f.resolves.length;
      }
    }
    if (resolvesCount > 0) {
      console.log(chalk.gray(`  Verify claims ${resolvesCount} finding${resolvesCount !== 1 ? 's' : ''} resolved — review with \`ana proof stale\``));
    }
  }
}

/**
 * Start or resume a work item. Phase-aware universal entry point.
 *
 * New slug (Think): creates directory, records work_started_at.
 * Scope-only (Plan): records plan_started_at, validates artifact branch.
 * Spec+contract (Build): creates worktree, records build_started_at.
 * Build report (Verify): prints worktree path, records verify_started_at.
 * Verify FAIL (Fix): prints worktree path, records build_started_at.
 * From inside worktree (Resume): prints current path.
 *
 * @param slug - Kebab-case slug for the work item
 * @param options - Optional settings
 * @param options.force - When true, override active session concurrency guards
 * @returns void — exits with code 1 on validation failures
 */
export async function startWork(slug: string, options?: { force?: boolean }): Promise<void> {
  const force = options?.force ?? false;
  // 1. Validate slug format
  try {
    validateSlug(slug);
  } catch {
    console.error(chalk.red('Error: Invalid slug format. Use kebab-case: fix-auth-timeout, add-export-csv'));
    process.exit(1);
  }

  // 2. Read project config
  const projectRoot = findProjectRoot();
  const artifactBranch = readArtifactBranch(projectRoot);

  // 3. Check if we're inside a worktree
  const currentWorktreeSlug = detectWorktreeSlug();

  if (currentWorktreeSlug) {
    // Inside a worktree — check if it's the same slug
    if (currentWorktreeSlug === slug) {
      // Resume: print path
      const wtPath = process.cwd();
      // Read branch name from git HEAD — prefix-independent
      const headResult = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
      const branchName = headResult.exitCode === 0 ? headResult.stdout : `(unknown)`;
      let commitCount = 0;
      try {
        const result = runGit(['rev-list', '--count', `${artifactBranch}..HEAD`]);
        if (result.exitCode === 0) commitCount = parseInt(result.stdout) || 0;
      } catch { /* ignore */ }

      // Detect phase from local artifacts and write appropriate timestamp
      const localProjectRoot = findProjectRoot();
      const localActivePath = path.join(localProjectRoot, '.ana', 'plans', 'active', slug);

      if (fs.existsSync(localActivePath)) {
        const hasSpec = fs.existsSync(path.join(localActivePath, 'spec.md'));
        const hasContract = fs.existsSync(path.join(localActivePath, 'contract.yaml'));
        const hasBuildReport = fs.existsSync(path.join(localActivePath, 'build_report.md'));
        const hasVerifyReport = fs.existsSync(path.join(localActivePath, 'verify_report.md'));

        const hasNumberedSpec = globSync(path.join(localActivePath, 'spec-*.md')).length > 0;
        const hasNumberedBuildReport = globSync(path.join(localActivePath, 'build_report_*.md')).length > 0;
        const hasNumberedVerifyReport = globSync(path.join(localActivePath, 'verify_report_*.md')).length > 0;

        const specExists = hasSpec || hasNumberedSpec;
        const buildReportExists = hasBuildReport || hasNumberedBuildReport;
        const verifyReportExists = hasVerifyReport || hasNumberedVerifyReport;

        if (verifyReportExists) {
          // Check if FAIL → Fix phase
          let isFail = false;
          const verifyPath = path.join(localActivePath, 'verify_report.md');
          if (fs.existsSync(verifyPath)) {
            const content = fs.readFileSync(verifyPath, 'utf-8');
            isFail = /\*\*Result:\*\*\s*FAIL/i.test(content);
          }
          if (!isFail) {
            const numberedReports = globSync(path.join(localActivePath, 'verify_report_*.md'));
            for (const report of numberedReports) {
              const content = fs.readFileSync(report, 'utf-8');
              if (/\*\*Result:\*\*\s*FAIL/i.test(content)) {
                isFail = true;
                break;
              }
            }
          }
          if (isFail) {
            await writeTimestamp(localActivePath, 'build_started_at', 'ana-build', true);
          }
        } else if (buildReportExists) {
          // Verify phase: build report exists, no verify report
          await writeTimestamp(localActivePath, 'verify_started_at', 'ana-verify', true);
        } else if (specExists || hasContract) {
          // Build phase: spec/contract exists, no build report
          await writeTimestamp(localActivePath, 'build_started_at', 'ana-build');
        }
      } else if (!worktreeExists(projectRoot, slug)) {
        console.log(chalk.yellow('⚠') + ` Plan artifacts not found for \`${slug}\`. Timestamp skipped.`);
      }

      console.log(`Already in worktree for \`${slug}\`.`);
      console.log(`  Path: ${wtPath}`);
      console.log(`  Branch: ${branchName}`);
      console.log(`  Commits: ${commitCount} since branch point`);
      return;
    } else {
      // Different slug — reject
      console.error(chalk.red(`Error: You're in worktree \`${currentWorktreeSlug}\`. Switch to the main project directory first.`));
      process.exit(1);
    }
  }

  // 4. Check if slug exists in active plans
  const activePath = path.join(projectRoot, '.ana', 'plans', 'active', slug);
  const completedPath = path.join(projectRoot, '.ana', 'plans', 'completed', slug);

  if (!fs.existsSync(activePath)) {
    // New slug — Think phase
    // Must be on artifact branch
    const currentBranch = getCurrentBranch();
    if (!currentBranch) {
      console.error(chalk.red('Error: Not a git repository.'));
      process.exit(1);
    }
    if (currentBranch !== artifactBranch) {
      console.error(chalk.red(`Error: You're on \`${currentBranch}\`. Work items must be started on \`${artifactBranch}\`.`));
      console.error(chalk.gray(`Run: git checkout ${artifactBranch} && git pull`));
      process.exit(1);
    }

    // Check completed
    if (fs.existsSync(completedPath)) {
      console.error(chalk.red(`Error: Slug '${slug}' already exists in completed plans. Choose a different name.`));
      process.exit(1);
    }

    // Pull latest
    const remotes = runGit(['remote'], { cwd: projectRoot }).stdout;
    if (remotes) {
      const pullResult = runGit(['pull', '--rebase', '--autostash'], { cwd: projectRoot });
      if (pullResult.exitCode !== 0) {
        const errorMessage = pullResult.stderr;
        if (errorMessage.includes('conflict') || errorMessage.includes('Cannot rebase')) {
          console.error(chalk.red('Error: Pull failed due to conflicts. Resolve conflicts and try again.'));
          process.exit(1);
        }
      }
    }

    // Create directory
    await fsPromises.mkdir(activePath, { recursive: true });

    // Read and consume session file for think-time capture (delete-then-use)
    let sessionTimestamp: string | undefined;
    const claudePid = getClaudePid();
    if (claudePid !== null) {
      const sessionPath = path.join(projectRoot, '.ana', 'state', `session-${claudePid}.json`);
      try {
        const raw = fs.readFileSync(sessionPath, 'utf-8');
        // Delete immediately — consumed regardless of parse/downstream outcome
        try { fs.unlinkSync(sessionPath); } catch { /* already gone */ }
        const parsed = JSON.parse(raw);
        if (parsed.timestamp && typeof parsed.timestamp === 'string') {
          sessionTimestamp = parsed.timestamp;
        }
      } catch {
        // No session file or read error — fall back to now()
      }
    }

    // Write work_started_at
    await writeTimestamp(activePath, 'work_started_at', 'ana', false, sessionTimestamp);
    commitSaves(projectRoot, slug, `[${slug}] Start work`);

    console.log(`Started work item \`${slug}\`. Write your scope, then run \`ana artifact save scope ${slug}\`.`);
    return;
  }

  // Slug exists — determine phase from artifacts
  const hasScope = fs.existsSync(path.join(activePath, 'scope.md'));
  const hasPlan = fs.existsSync(path.join(activePath, 'plan.md'));
  const hasSpec = fs.existsSync(path.join(activePath, 'spec.md'));
  const hasContract = fs.existsSync(path.join(activePath, 'contract.yaml'));
  const hasBuildReport = fs.existsSync(path.join(activePath, 'build_report.md'));
  const hasVerifyReport = fs.existsSync(path.join(activePath, 'verify_report.md'));

  // Check for numbered specs/reports too
  const hasNumberedSpec = globSync(path.join(activePath, 'spec-*.md')).length > 0;
  const hasNumberedBuildReport = globSync(path.join(activePath, 'build_report_*.md')).length > 0;
  const hasNumberedVerifyReport = globSync(path.join(activePath, 'verify_report_*.md')).length > 0;

  const specExists = hasSpec || hasNumberedSpec;
  const buildReportExists = hasBuildReport || hasNumberedBuildReport;
  const verifyReportExists = hasVerifyReport || hasNumberedVerifyReport;

  // Phase: scope only → Plan
  if (hasScope && !hasPlan && !specExists) {
    // Must be on artifact branch
    const currentBranch = getCurrentBranch();
    if (!currentBranch) {
      console.error(chalk.red('Error: Not a git repository.'));
      process.exit(1);
    }
    if (currentBranch !== artifactBranch) {
      console.error(chalk.red(`Error: You're on \`${currentBranch}\`. Plan phase must run on \`${artifactBranch}\`.`));
      console.error(chalk.gray(`Run: git checkout ${artifactBranch} && git pull`));
      process.exit(1);
    }

    // Concurrency guard: check plan_started_at before writing
    const planGuard = checkConcurrencyGuard(activePath, 'plan_started_at', slug);
    if (planGuard.blocked) {
      if (force) {
        console.log(chalk.yellow(`⚠ Overriding active plan session for \`${slug}\` (started ${planGuard.startedAgo}).`));
      } else {
        console.error(chalk.red(planGuard.message!));
        process.exit(1);
      }
    }

    await writeTimestamp(activePath, 'plan_started_at', 'ana-plan', true);
    commitSaves(projectRoot, slug, `[${slug}] Start plan phase`);
    console.log(`Resuming \`${slug}\` — Plan phase. Run \`claude --agent ana-plan\`.`);
    return;
  }

  // Phase: spec+contract exists, no build report → Build (create worktree)
  if ((specExists || hasContract) && !buildReportExists) {
    return await startBuildPhase(projectRoot, activePath, slug, artifactBranch);
  }

  // Phase: build report exists, no verify report → Verify (print worktree)
  if (buildReportExists && !verifyReportExists) {
    // Concurrency guard: check verify_started_at in worktree before writing
    if (worktreeExists(projectRoot, slug)) {
      const wtPlanDir = path.join(getWorktreePath(projectRoot, slug), '.ana', 'plans', 'active', slug);
      const verifyGuard = checkConcurrencyGuard(wtPlanDir, 'verify_started_at', slug);
      if (verifyGuard.blocked) {
        if (force) {
          console.log(chalk.yellow(`⚠ Overriding active verify session for \`${slug}\` (started ${verifyGuard.startedAgo}).`));
        } else {
          console.error(chalk.red(verifyGuard.message!));
          process.exit(1);
        }
      }
      await writeTimestamp(wtPlanDir, 'verify_started_at', 'ana-verify', true);
    } else {
      console.log(chalk.yellow('⚠') + ` Worktree not found for \`${slug}\`. Timestamp skipped.`);
    }
    return printExistingWorktree(projectRoot, slug, artifactBranch, 'Verify');
  }

  // Phase: verify report exists with FAIL → Fix (print worktree)
  if (verifyReportExists) {
    // Check verify result
    let isFail = false;
    const verifyPath = path.join(activePath, 'verify_report.md');
    if (fs.existsSync(verifyPath)) {
      const content = fs.readFileSync(verifyPath, 'utf-8');
      isFail = /\*\*Result:\*\*\s*FAIL/i.test(content);
    }
    // Also check numbered
    if (!isFail) {
      const numberedReports = globSync(path.join(activePath, 'verify_report_*.md'));
      for (const report of numberedReports) {
        const content = fs.readFileSync(report, 'utf-8');
        if (/\*\*Result:\*\*\s*FAIL/i.test(content)) {
          isFail = true;
          break;
        }
      }
    }

    if (isFail) {
      // Write timestamp to worktree (not the artifact branch) to avoid dirty .saves.json blocking git pull
      // Force overwrite: FAIL→Fix is a new build session, so the old build_started_at is stale
      if (worktreeExists(projectRoot, slug)) {
        const wtPlanDir = path.join(getWorktreePath(projectRoot, slug), '.ana', 'plans', 'active', slug);
        await writeTimestamp(wtPlanDir, 'build_started_at', 'ana-build', true);
      } else {
        console.log(chalk.yellow('⚠') + ` Worktree not found for \`${slug}\`. Timestamp skipped.`);
      }
      return printExistingWorktree(projectRoot, slug, artifactBranch, 'Fix');
    }

    // PASS — nothing to do
    console.log(`\`${slug}\` has passed verification. Run \`ana work complete ${slug}\` to archive.`);
    console.log(`Or to merge and complete in one step (from ${artifactBranch}): ana work complete --merge ${slug}`);
    return;
  }

  // Fallback — shouldn't reach here
  console.log(`Resuming \`${slug}\`. Check \`ana work status\` for current stage.`);
}

/**
 * Start the Build phase: create or enter the worktree.
 *
 * Uses kind-resolved prefix for branch creation. Reads the scope's kind
 * via extractScopeKind() and passes it to readBranchPrefix() for map-form
 * config resolution.
 *
 * @param projectRoot - Project root directory
 * @param activePath - Path to the active plan directory
 * @param slug - Work item slug
 * @param artifactBranch - Artifact branch name
 * @returns Promise that resolves when the build phase is started
 */
async function startBuildPhase(
  projectRoot: string,
  activePath: string,
  slug: string,
  artifactBranch: string
): Promise<void> {
  // Check if worktree already exists (resume case)
  if (worktreeExists(projectRoot, slug)) {
    // Write timestamp to worktree (not the artifact branch) to avoid dirty .saves.json blocking git pull
    const wtPlanDir = path.join(getWorktreePath(projectRoot, slug), '.ana', 'plans', 'active', slug);
    await writeTimestamp(wtPlanDir, 'build_started_at', 'ana-build');
    return printExistingWorktree(projectRoot, slug, artifactBranch, 'Build');
  }

  // Resolve kind-aware branch prefix for new worktree creation
  const scopeKind = extractScopeKind(path.join(activePath, 'scope.md'));
  const branchPrefix = readBranchPrefix(projectRoot, scopeKind);

  // Build context data from contract
  let contextData: { contractAssertions?: string; proofFindings?: string; summary?: string } | undefined;
  const contractPath = path.join(activePath, 'contract.yaml');
  if (fs.existsSync(contractPath)) {
    const contractContent = fs.readFileSync(contractPath, 'utf-8');
    contextData = { contractAssertions: contractContent };

    // Danger map: parse contract to extract file_changes, query proof context
    try {
      const parsed = yaml.parse(contractContent);
      const fileChanges: Array<{ path: string }> = parsed?.file_changes ?? [];
      const filePaths = fileChanges.map(fc => fc.path).filter(Boolean);

      if (filePaths.length > 0) {
        const contexts = getProofContext(filePaths, projectRoot);

        // Build risk profile: rank files by severity-weighted finding count
        const SEVERITY_WEIGHTS: Record<string, number> = { risk: 3, debt: 2, observation: 1 };
        const rankedFiles: Array<{ filePath: string; score: number; findings: Array<{ severity: string; summary: string }> }> = [];

        for (const ctx of contexts) {
          // Findings only — not build concerns (AC4)
          if (ctx.findings.length === 0) continue;
          let score = 0;
          const findingEntries: Array<{ severity: string; summary: string }> = [];
          for (const f of ctx.findings) {
            const sev = f.severity ?? '';
            const weight = SEVERITY_WEIGHTS[sev] ?? 0;
            score += weight;
            findingEntries.push({ severity: sev || 'unknown', summary: f.summary });
          }
          rankedFiles.push({ filePath: ctx.query, score, findings: findingEntries });
        }

        // Sort descending by score
        rankedFiles.sort((a, b) => b.score - a.score);

        // Format as markdown if any files have findings (AC2: omit entirely when zero)
        if (rankedFiles.length > 0) {
          const lines: string[] = ['## Risk Profile', ''];
          for (const file of rankedFiles) {
            lines.push(`**${file.filePath}** (risk score: ${file.score}) — ${file.findings.length} finding${file.findings.length === 1 ? '' : 's'}`);
            for (const f of file.findings) {
              lines.push(`  - ${f.severity}: ${f.summary}`);
            }
            lines.push('');
          }
          contextData.proofFindings = lines.join('\n').trimEnd();
        }
      }
    } catch {
      // AC3: YAML parse failure — fall back to raw string behavior, no danger map
    }
  }

  // Create worktree
  console.log(`Creating worktree for \`${slug}\`...`);
  try {
    const result = await createWorktree(projectRoot, slug, branchPrefix, contextData);
    const branchLabel = result.branchIsNew ? '(new)' : '(existing)';
    console.log(`  Branch: ${result.branch} ${branchLabel}`);
    console.log(`  Path: ${path.relative(process.cwd(), result.worktreePath) || result.worktreePath}`);
    console.log(`  Dependencies: ${result.depsInstalled ? 'installed' : 'skipped'}`);
    if (result.buildSucceeded === true) {
      console.log('  Build: succeeded');
    } else if (result.buildSucceeded === false) {
      console.log('  Build: failed — run the build command in the worktree manually');
    } else {
      console.log('  Build: skipped (no build command)');
    }
    if (result.envFilesLinked.length > 0) {
      console.log(`  Env files: ${result.envFilesLinked.join(', ')} → symlinked`);
    } else {
      console.log('  Env files: none detected');
    }
    console.log(`  Context: ${result.contextFileWritten ? 'worktree-context.md written' : 'not written'}`);

    // Record build_started_at in the worktree (not the artifact branch) to avoid dirty .saves.json blocking git pull
    const wtPlanDir = path.join(result.worktreePath, '.ana', 'plans', 'active', slug);
    await writeTimestamp(wtPlanDir, 'build_started_at', 'ana-build');

    console.log(`\nWorktree ready. Run:`);
    console.log(`  cd ${path.relative(process.cwd(), result.worktreePath) || result.worktreePath}`);
  } catch (error) {
    console.error(chalk.red(`Error: Failed to create worktree: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}

/**
 * Print info about an existing worktree.
 *
 * Reads the branch name from the worktree's git HEAD instead of
 * reconstructing from config — prefix-independent.
 *
 * @param projectRoot - Project root directory
 * @param slug - Work item slug
 * @param artifactBranch - Artifact branch name
 * @param phase - Current phase label (e.g., 'Build', 'Verify', 'Fix')
 */
function printExistingWorktree(
  projectRoot: string,
  slug: string,
  artifactBranch: string,
  phase: string
): void {
  const wtInfo = getWorktreeInfo(projectRoot, slug);

  if (!wtInfo) {
    console.log(`No worktree for \`${slug}\`. ${phase} phase — worktree may need to be recreated.`);
    return;
  }

  const relativePath = path.relative(process.cwd(), wtInfo.path) || wtInfo.path;

  console.log(`Worktree exists for \`${slug}\`.`);
  console.log(`  Path: ${relativePath}`);
  console.log(`  Branch: ${wtInfo.branch}`);
  console.log(`  Commits: ${wtInfo.commitCount} since branch point`);
  if (wtInfo.commitsBehind > 0) {
    console.log(chalk.yellow(`  ⚠ ${wtInfo.commitsBehind} commits behind ${artifactBranch}. Consider rebasing before building.`));
  }
  console.log(`\ncd ${relativePath}`);
}

/**
 * Resolve the Claude Code process PID from the current process tree.
 *
 * Process tree: claude → shell → node. `process.ppid` gives the shell PID.
 * The Claude PID is the shell's parent: `ps -o ppid= -p ${process.ppid}`.
 *
 * @returns The Claude Code PID, or null if resolution fails
 */
export function getClaudePid(): number | null {
  try {
    const result = spawnSync('ps', ['-o', 'ppid=', '-p', String(process.ppid)], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    if (result.status !== 0) {
      return null;
    }
    const output = (result.stdout ?? '').trim();
    const pid = parseInt(output, 10);
    if (isNaN(pid) || pid <= 0) {
      return null;
    }
    return pid;
  } catch {
    return null;
  }
}

/**
 * Result of a concurrency guard check
 */
export interface ConcurrencyGuardResult {
  blocked: boolean;
  message?: string;
  startedAgo?: string;
}

const CONCURRENCY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check whether a concurrency guard should block entry to a pipeline phase.
 *
 * Reads a specific timestamp key from `.saves.json` at the given filesystem path.
 * If the timestamp is recent (< 1 hour), the guard blocks. Missing or corrupted
 * `.saves.json` files are treated as "no guard" — they do not block.
 *
 * @param savesDir - Directory containing `.saves.json`
 * @param timestampKey - The key to check (e.g., 'verify_started_at', 'plan_started_at')
 * @param slug - Work item slug (for error messages)
 * @param force - When true, skip the guard entirely
 * @returns Guard result indicating whether to block
 */
export function checkConcurrencyGuard(
  savesDir: string,
  timestampKey: string,
  slug: string,
  force: boolean = false,
): ConcurrencyGuardResult {
  if (force) {
    return { blocked: false };
  }

  const savesPath = path.join(savesDir, '.saves.json');
  let saves: Record<string, unknown> = {};
  try {
    if (!fs.existsSync(savesPath)) {
      return { blocked: false };
    }
    saves = JSON.parse(fs.readFileSync(savesPath, 'utf-8'));
  } catch {
    // Corrupted JSON — do not block
    return { blocked: false };
  }

  const timestamp = saves[timestampKey];
  if (typeof timestamp !== 'string') {
    return { blocked: false };
  }

  const startedAt = new Date(timestamp);
  if (isNaN(startedAt.getTime())) {
    return { blocked: false };
  }

  const elapsedMs = Date.now() - startedAt.getTime();
  if (elapsedMs >= CONCURRENCY_TIMEOUT_MS) {
    return { blocked: false };
  }

  // Format relative time
  const minutes = Math.floor(elapsedMs / 60000);
  const startedAgo = minutes < 1 ? 'less than a minute ago' : `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const phaseName = timestampKey.replace('_started_at', '');

  return {
    blocked: true,
    message: `Error: A ${phaseName} session is already in progress for \`${slug}\`.\n  Started: ${startedAgo}\n  Use \`ana work start ${slug} --force\` to override.`,
    startedAgo,
  };
}

/**
 * Write a timestamp to .saves.json.
 *
 * @param activePath - Path to the active plan directory
 * @param key - Timestamp key (e.g., 'work_started_at', 'build_started_at')
 * @param agent - Optional agent identity string (e.g., 'ana-build')
 * @param force - When true, overwrite existing timestamp (used by FAIL→Fix path)
 * @param timestamp - Optional pre-captured timestamp to use instead of now()
 * @returns Promise that resolves when the timestamp is written
 */
async function writeTimestamp(activePath: string, key: string, agent?: string, force: boolean = false, timestamp?: string): Promise<void> {
  const savesPath = path.join(activePath, '.saves.json');
  let saves: Record<string, unknown> = {};
  if (fs.existsSync(savesPath)) {
    try {
      saves = JSON.parse(fs.readFileSync(savesPath, 'utf-8'));
    } catch {
      // Start fresh if corrupted
    }
  }
  // Write-once guard: skip if key already exists unless force is true
  if (!force && saves[key] !== undefined) {
    return;
  }
  saves[key] = timestamp ?? new Date().toISOString();
  if (agent) {
    // Derive agent key: 'build_started_at' → 'build_agent', 'work_started_at' → 'work_agent'
    const agentKey = key.replace('_started_at', '_agent');
    saves[agentKey] = agent;
  }
  await fsPromises.writeFile(savesPath, JSON.stringify(saves, null, 2), 'utf-8');
}

/**
 * Commit .saves.json for a slug on the artifact branch.
 *
 * Stages only the slug's .saves.json, checks for staged changes, and commits
 * with the configured co-author. If nothing was staged (write-once no-op),
 * returns silently without creating an empty commit.
 *
 * @param projectRoot - Project root directory
 * @param slug - Work item slug
 * @param message - Commit message (without co-author trailer)
 */
function commitSaves(projectRoot: string, slug: string, message: string): void {
  const savesRelPath = path.join('.ana', 'plans', 'active', slug, '.saves.json');

  try {
    runGit(['add', savesRelPath], { cwd: projectRoot });
  } catch {
    // Nothing to stage
    return;
  }

  // Check if there are staged changes — status 0 means no differences
  const diffResult = spawnSync('git', ['diff', '--staged', '--quiet', '--', savesRelPath], { cwd: projectRoot });
  if (diffResult.status === 0) {
    return;
  }

  const coAuthor = readCoAuthor(projectRoot);
  const commitMessage = `${message}\n\nCo-authored-by: ${coAuthor}`;
  try {
    const commitResult = spawnSync('git', ['commit', '--no-verify', '-m', commitMessage, '--', savesRelPath], { stdio: 'pipe', cwd: projectRoot });
    if (commitResult.status !== 0) throw new Error(commitResult.stderr?.toString() || 'Commit failed');
  } catch {
    // Silent failure — don't block the user's workflow for a convenience commit
  }
}

/**
 * Register the `work` command (with `status`, `start`, and `complete` sub-commands).
 *
 * @param program - Commander program instance.
 */
export function registerWorkCommand(program: Command): void {
  const workCommand = new Command('work')
    .description('Start, track, and complete development tasks');

  const statusCommand = new Command('status')
    .description('Show pipeline state for all active work items')
    .option('--json', 'Output JSON format for programmatic consumption')
    .option('--session', 'Write a session marker for think-time capture')
    .action(async (options: { json?: boolean; session?: boolean }) => {
      await getWorkStatus(options);
    });

  const startCommand = new Command('start')
    .description('Start a new work item')
    .argument('<slug>', 'Kebab-case slug for the work item')
    .option('--force', 'Override active session concurrency guards')
    .addHelpText('after', '\nEXAMPLES\n  $ ana work start fix-auth-timeout')
    .action(async (slug: string, cmdOptions: { force?: boolean }) => {
      await startWork(slug, cmdOptions.force ? { force: true } : undefined);
    });

  const completeCommand = new Command('complete')
    .description('Archive completed work after PR merge, optionally merging the PR first')
    .argument('<slug>', 'Work item slug to complete')
    .option('--json', 'Output JSON format for programmatic consumption')
    .option('--merge', 'Merge the PR via GitHub CLI before completing')
    .action(async (slug: string, cmdOptions: { json?: boolean; merge?: boolean }) => {
      await completeWork(slug, cmdOptions);
    });

  workCommand.addCommand(statusCommand);
  workCommand.addCommand(startCommand);
  workCommand.addCommand(completeCommand);

  program.addCommand(workCommand);
}
