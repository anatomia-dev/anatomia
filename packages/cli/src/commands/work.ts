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
import { generateProofSummary, resolveFindingPaths, generateDashboard, computeChainHealth, wrapJsonResponse, detectHealthChange, getProofContext, type ProofSummary } from '../utils/proofSummary.js';
import { findProjectRoot, validateSlug } from '../utils/validators.js';
import { isWorktreeDirectory, detectWorktreeSlug, worktreeExists, getWorktreeInfo, createWorktree, removeWorktree, getWorktreePath } from '../utils/worktree.js';
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
  nextAction: string;
  worktreeInfo?: {
    path: string;
    branch: string;
    commitCount: number;
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
 * Get work branch for a slug using the configured prefix
 *
 * @param slug - Work item slug
 * @param branchPrefix - Configured branch prefix (e.g., 'feature/', 'dev/', '')
 * @returns Branch name or null if doesn't exist
 */
function getWorkBranch(slug: string, branchPrefix: string): string | null {
  const result = runGit(['branch', '-a', '--list', `*${slug}*`]);
  if (result.exitCode !== 0 || !result.stdout) return null;

  // Parse branches — prefer local over remote
  const branches = result.stdout.split('\n').map(b => b.trim().replace(/^\* /, '').replace(/^remotes\//, ''));
  const local = branches.find(b => b === `${branchPrefix}${slug}`);
  const remote = branches.find(b => b === `origin/${branchPrefix}${slug}`);

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
 * @param branchPrefix - Configured branch prefix
 * @returns Complete artifact state
 */
function gatherArtifactState(
  slug: string,
  artifactBranch: string,
  onArtifactBranch: boolean,
  projectRoot: string,
  branchPrefix: string
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
  const workBranch = getWorkBranch(slug, branchPrefix);
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

  // Scope only → ready for plan
  if (scope.exists && !plan.exists) {
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
      return 'ready-for-verify';
    }

    if (hasVerifyReport) {
      const result = verifyReports[0]?.result;
      if (result === 'PASS') {
        return 'ready-to-merge';
      } else if (result === 'FAIL') {
        // Check if build report was updated AFTER verify report (fixes applied)
        try {
          const basePath = `.ana/plans/active/${slug}`;
          const buildTime = runGit(
            ['log', '--format=%ct', '-1', workBranch, '--', `${basePath}/build_report.md`]
          ).stdout;
          const verifyTime = runGit(
            ['log', '--format=%ct', '-1', workBranch, '--', `${basePath}/verify_report.md`]
          ).stdout;
          if (buildTime && verifyTime && parseInt(buildTime) > parseInt(verifyTime)) {
            return 'ready-for-re-verify';
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
        // This phase built but not verified
        return `phase-${phaseNum}-ready-for-verify`;
      }

      if (phaseVerifyReport) {
        const result = phaseVerifyReport.result;
        if (result === 'FAIL') {
          // Check if build report was updated after verify (fixes applied)
          try {
            const basePath = `.ana/plans/active/${slug}`;
            const expectedBuild = phaseBuildReport.file;
            const expectedVerify = phaseVerifyReport.file;
            const bTime = runGit(
              ['log', '--format=%ct', '-1', workBranch, '--', `${basePath}/${expectedBuild}`]
            ).stdout;
            const vTime = runGit(
              ['log', '--format=%ct', '-1', workBranch, '--', `${basePath}/${expectedVerify}`]
            ).stdout;
            if (bTime && vTime && parseInt(bTime) > parseInt(vTime)) {
              return `phase-${phaseNum}-ready-for-re-verify`;
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
 * @returns Copy-pasteable command
 */
function getNextAction(stage: string, slug: string, _branchPrefix: string): string {
  if (stage === 'ready-for-plan') {
    return 'claude --agent ana-plan';
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
    return `Review PR, then: ana work complete ${slug}`;
  }

  // Multi-phase stages
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
      console.log(`    Worktree: ${path.relative(process.cwd(), wt.path) || wt.path} (${wt.commitCount} commit${wt.commitCount !== 1 ? 's' : ''}, last activity ${activityLabel})${staleFlag}`);
    }

    // Show stage and next action
    console.log(`    ${chalk.bold('Stage:')} ${item.stage}`);
    console.log(chalk.cyan(`    → ${item.nextAction}\n`));
  }

  console.log(chalk.gray('Scope new work: claude --agent ana'));
}

/**
 * Get work status across all active work items
 *
 * @param options - Command options
 * @param options.json - Output JSON format instead of human-readable
 */
export function getWorkStatus(options: { json?: boolean }): void {
  const projectRoot = findProjectRoot();
  const artifactBranch = readArtifactBranch(projectRoot);
  const branchPrefix = readBranchPrefix(projectRoot);
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

  // Discover slugs
  const slugs = discoverSlugs(artifactBranch, onArtifactBranch, projectRoot);

  if (slugs.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({
        artifactBranch,
        currentBranch: currentBranch || 'unknown',
        onArtifactBranch,
        items: [],
      }, null, 2));
    } else {
      console.log(chalk.gray('\nNo active work. Run: claude --agent ana to scope new work.'));
    }
    return;
  }

  // Gather state for each slug
  const items: WorkItem[] = [];
  for (const slug of slugs) {
    const artifacts = gatherArtifactState(slug, artifactBranch, onArtifactBranch, projectRoot, branchPrefix);

    // Skip empty directories (no scope = not real work)
    if (!artifacts.scope.exists) {
      continue;
    }

    const workBranch = getWorkBranch(slug, branchPrefix);
    const stage = determineStage(slug, artifacts, workBranch, projectRoot);
    const nextAction = getNextAction(stage, slug, branchPrefix);

    // Check for worktree info
    const wtInfo = getWorktreeInfo(projectRoot, slug, branchPrefix);

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
 * Write proof chain files (JSON and markdown)
 *
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

  // Read modules_touched from .saves.json (captured at build-report save time
  // when the feature branch definitely exists and all code is committed).
  let modulesTouched: string[] = [];
  try {
    const slugSaves = path.join(anaDir, 'plans', 'completed', slug, '.saves.json');
    if (fs.existsSync(slugSaves)) {
      const savesContent = JSON.parse(fs.readFileSync(slugSaves, 'utf-8'));
      if (Array.isArray(savesContent['modules_touched'])) {
        modulesTouched = savesContent['modules_touched'];
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
    ...(worktreeMeta ? { worktree: worktreeMeta } : {}),
  };

  // Assign status to new findings (AC5)
  for (const finding of entry.findings) {
    if (finding.category === 'upstream') {
      finding.status = 'lesson';
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
      // Skip already-closed findings
      if (finding.status === 'closed') continue;

      // Upstream findings are institutional memory — not subject to staleness
      if (finding.category === 'upstream') continue;

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
  const { chain_runs: runs, findings: { active: activeCount, closed: closedCount, lesson: lessonsCount, promoted: promotedCount, total: totalFindings } } = health;

  const dashboardMd = generateDashboard(chain.entries, { runs, active: activeCount, lessons: lessonsCount, promoted: promotedCount, closed: closedCount });
  await fsPromises.writeFile(chainMdPath, dashboardMd);

  const stats: ProofChainStats = {
    runs,
    findings: totalFindings,
    active: activeCount,
    lessons: lessonsCount,
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
 * @param options - Optional flags for output format
 * @param options.json - When true, output structured JSON envelope instead of console output
 */
export async function completeWork(slug: string, options?: { json?: boolean }): Promise<void> {
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

  // 1. Read artifactBranch, branchPrefix, and coAuthor from ana.json
  const projectRoot = findProjectRoot();
  const artifactBranch = readArtifactBranch(projectRoot);
  const branchPrefix = readBranchPrefix(projectRoot);

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
    console.error(chalk.red(`Error: You're on \`${currentBranch}\`. Switch to \`${artifactBranch}\` to complete work.`));
    console.error(chalk.gray('The PR should be merged before completing.'));
    console.error(chalk.gray(`Run: git checkout ${artifactBranch} && git pull`));
    process.exit(1);
  }

  // 4. Pull latest to get merged content
  {
    const remotes = runGit(['remote'], { cwd: projectRoot }).stdout;
    if (remotes) {
      let pullResult = runGit(['pull', '--rebase'], { cwd: projectRoot });

      // Handle "untracked working tree files would be overwritten" — caused by
      // Build/Verify agents writing artifacts to main instead of the worktree.
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
            console.log(chalk.yellow(`  ⚠ Removed ${buildVerifyFiles.length} untracked build/verify artifact(s) from main (always agent-written).`));
          }

          // Planning artifacts require content-match before removal
          if (planningFiles.length > 0) {
            let allMatch = true;
            for (const relPath of planningFiles) {
              const localPath = path.join(projectRoot, relPath);
              const localContent = fs.readFileSync(localPath, 'utf-8');
              const remoteResult = runGit(['show', `origin/${artifactBranch}:${relPath}`], { cwd: projectRoot });
              if (remoteResult.exitCode !== 0 || remoteResult.stdout !== localContent) {
                allMatch = false;
                break;
              }
            }

            if (allMatch) {
              for (const relPath of planningFiles) {
                fs.unlinkSync(path.join(projectRoot, relPath));
              }
              console.log(chalk.yellow(`  ⚠ Removed ${planningFiles.length} untracked planning artifact(s) from main (matched merged content).`));
            } else {
              console.error(chalk.red('Error: Pull blocked by untracked files that differ from the merged version:'));
              for (const f of planningFiles) {
                console.error(chalk.gray(`  ${f}`));
              }
              console.error(chalk.gray('These files were written to main but differ from the PR. Inspect and remove manually.'));
              process.exit(1);
            }
          }

          // Retry pull if any files were removed
          if (buildVerifyFiles.length > 0 || planningFiles.length > 0) {
            pullResult = runGit(['pull', '--rebase'], { cwd: projectRoot });
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
          runGit(['add', `.ana/plans/completed/${slug}/`, '.ana/proof_chain.json', '.ana/PROOF_CHAIN.md'], { cwd: projectRoot });
          const commitMessage = `[${slug}] Complete — archived to plans/completed\n\nCo-authored-by: ${coAuthor}`;
          const commitResult = spawnSync('git', ['commit', '-m', commitMessage], { stdio: 'pipe', cwd: projectRoot });
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

  const workBranchName = `${branchPrefix}${slug}`;
  const workBranchExists = getWorkBranch(slug, branchPrefix);
  if (workBranchExists) {
    // Check if remote branch still exists after prune
    const remoteBranchResult = runGit(['branch', '-r', '--list', `origin/${workBranchName}`], { cwd: projectRoot });
    const hasRemote = remoteBranchResult.exitCode === 0 && remoteBranchResult.stdout.length > 0;

    if (hasRemote) {
      // Remote still exists — verify with is-ancestor (regular merge)
      let merged = false;
      const ancestorResult = runGit(['merge-base', '--is-ancestor', workBranchName, 'HEAD'], { cwd: projectRoot });
      if (ancestorResult.exitCode === 0) {
        merged = true;
      } else {
        // is-ancestor failed — might be squash merge. Check via gh CLI.
        const ghResult = spawnSync('gh', ['pr', 'view', workBranchName, '--json', 'state', '-q', '.state'], {
          encoding: 'utf-8', stdio: 'pipe',
        });
        if (ghResult.status === 0 && ghResult.stdout) {
          merged = ghResult.stdout.trim() === 'MERGED';
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
  const savesJsonPath = path.join(activePath, '.saves.json');
  let savesData: Record<string, { saved_at?: string; hash?: string }> = {};
  if (fs.existsSync(savesJsonPath)) {
    try {
      savesData = JSON.parse(fs.readFileSync(savesJsonPath, 'utf-8'));
    } catch { /* treat as empty */ }
  }

  const buildSave = savesData['build-report'];
  const verifySave = savesData['verify-report'];
  const buildMissing = !buildSave || !buildSave.saved_at || !buildSave.hash;
  const verifyMissing = !verifySave || !verifySave.saved_at || !verifySave.hash;

  if (buildMissing && verifyMissing) {
    console.error(chalk.red('Error: Artifacts not saved through the pipeline:'));
    console.error(chalk.red(`  - build-report: run \`ana artifact save build-report ${slug}\``));
    console.error(chalk.red(`  - verify-report: run \`ana artifact save verify-report ${slug}\``));
    process.exit(1);
  } else if (buildMissing) {
    console.error(chalk.red(`Error: build-report was not saved through the pipeline.`));
    console.error(chalk.red(`Run: ana artifact save build-report ${slug}`));
    process.exit(1);
  } else if (verifyMissing) {
    console.error(chalk.red(`Error: verify-report was not saved through the pipeline.`));
    console.error(chalk.red(`Run: ana artifact save verify-report ${slug}`));
    process.exit(1);
  }

  // 8c. Capture worktree metadata BEFORE removal (needed for proof chain)
  const wtPath = getWorktreePath(projectRoot, slug);
  const worktreeUsed = fs.existsSync(wtPath);
  let worktreeCommitCount = 0;
  if (worktreeUsed) {
    const wtInfo = getWorktreeInfo(projectRoot, slug, branchPrefix);
    worktreeCommitCount = wtInfo?.commitCount ?? 0;
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
  };
  const stats = await writeProofChain(slug, proof, projectRoot, worktreeMeta);

  // 10. Stage and commit
  try {
    runGit(['add', `.ana/plans/active/${slug}/`, `.ana/plans/completed/${slug}/`, '.ana/proof_chain.json', '.ana/PROOF_CHAIN.md'], { cwd: projectRoot });
    const commitMessage = `[${slug}] Complete — archived to plans/completed\n\nCo-authored-by: ${coAuthor}`;
    const commitResult = spawnSync('git', ['commit', '-m', commitMessage], { stdio: 'pipe', cwd: projectRoot });
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
  //     create new commits, so the feature branch is never an ancestor of main.
  //     Safe: step 6 already verified the branch was merged.)
  runGit(['branch', '-D', workBranchName], { cwd: projectRoot });
  // Silently continue if branch doesn't exist or was already deleted

  runGit(['push', 'origin', '--delete', workBranchName], { cwd: projectRoot });
  // Silently continue if remote branch doesn't exist or was already deleted

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
 * @returns void — exits with code 1 on validation failures
 */
export async function startWork(slug: string): Promise<void> {
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
  const branchPrefix = readBranchPrefix(projectRoot);

  // 3. Check if we're inside a worktree
  const currentWorktreeSlug = detectWorktreeSlug();

  if (currentWorktreeSlug) {
    // Inside a worktree — check if it's the same slug
    if (currentWorktreeSlug === slug) {
      // Resume: print path
      const wtPath = process.cwd();
      const branchName = `${branchPrefix}${slug}`;
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
          await writeTimestamp(localActivePath, 'verify_started_at', 'ana-verify');
        } else if (specExists || hasContract) {
          // Build phase: spec/contract exists, no build report
          await writeTimestamp(localActivePath, 'build_started_at', 'ana-build');
        }
      } else if (!worktreeExists(projectRoot, slug)) {
        console.log(chalk.yellow('⚠') + ` Worktree not found for \`${slug}\`. Timestamp skipped.`);
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
      const pullResult = runGit(['pull', '--rebase'], { cwd: projectRoot });
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

    // Write work_started_at
    await writeTimestamp(activePath, 'work_started_at', 'ana');

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

    await writeTimestamp(activePath, 'plan_started_at', 'ana-plan');
    console.log(`Resuming \`${slug}\` — Plan phase. Run \`claude --agent ana-plan\`.`);
    return;
  }

  // Phase: spec+contract exists, no build report → Build (create worktree)
  if ((specExists || hasContract) && !buildReportExists) {
    return await startBuildPhase(projectRoot, activePath, slug, branchPrefix, artifactBranch);
  }

  // Phase: build report exists, no verify report → Verify (print worktree)
  if (buildReportExists && !verifyReportExists) {
    // Write timestamp to worktree (not main) to avoid dirty .saves.json blocking git pull
    if (worktreeExists(projectRoot, slug)) {
      const wtPlanDir = path.join(getWorktreePath(projectRoot, slug), '.ana', 'plans', 'active', slug);
      await writeTimestamp(wtPlanDir, 'verify_started_at', 'ana-verify');
    } else {
      console.log(chalk.yellow('⚠') + ` Worktree not found for \`${slug}\`. Timestamp skipped.`);
    }
    return printExistingWorktree(projectRoot, slug, branchPrefix, artifactBranch, 'Verify');
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
      // Write timestamp to worktree (not main) to avoid dirty .saves.json blocking git pull
      // Force overwrite: FAIL→Fix is a new build session, so the old build_started_at is stale
      if (worktreeExists(projectRoot, slug)) {
        const wtPlanDir = path.join(getWorktreePath(projectRoot, slug), '.ana', 'plans', 'active', slug);
        await writeTimestamp(wtPlanDir, 'build_started_at', 'ana-build', true);
      } else {
        console.log(chalk.yellow('⚠') + ` Worktree not found for \`${slug}\`. Timestamp skipped.`);
      }
      return printExistingWorktree(projectRoot, slug, branchPrefix, artifactBranch, 'Fix');
    }

    // PASS — nothing to do
    console.log(`\`${slug}\` has passed verification. Run \`ana work complete ${slug}\` to archive.`);
    return;
  }

  // Fallback — shouldn't reach here
  console.log(`Resuming \`${slug}\`. Check \`ana work status\` for current stage.`);
}

/**
 * Start the Build phase: create or enter the worktree.
 *
 * @param projectRoot - Project root directory
 * @param activePath - Path to the active plan directory
 * @param slug - Work item slug
 * @param branchPrefix - Branch prefix
 * @param artifactBranch - Artifact branch name
 * @returns Promise that resolves when the build phase is started
 */
async function startBuildPhase(
  projectRoot: string,
  activePath: string,
  slug: string,
  branchPrefix: string,
  artifactBranch: string
): Promise<void> {
  // Check if worktree already exists (resume case)
  if (worktreeExists(projectRoot, slug)) {
    // Write timestamp to worktree (not main) to avoid dirty .saves.json blocking git pull
    const wtPlanDir = path.join(getWorktreePath(projectRoot, slug), '.ana', 'plans', 'active', slug);
    await writeTimestamp(wtPlanDir, 'build_started_at', 'ana-build');
    return printExistingWorktree(projectRoot, slug, branchPrefix, artifactBranch, 'Build');
  }

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
    if (result.envFilesLinked.length > 0) {
      console.log(`  Env files: ${result.envFilesLinked.join(', ')} → symlinked`);
    } else {
      console.log('  Env files: none detected');
    }
    console.log(`  Context: ${result.contextFileWritten ? 'worktree-context.md written' : 'not written'}`);

    // Record build_started_at in the worktree (not main) to avoid dirty .saves.json blocking git pull
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
 * @param projectRoot - Project root directory
 * @param slug - Work item slug
 * @param branchPrefix - Branch prefix
 * @param artifactBranch - Artifact branch name
 * @param phase - Current phase label (e.g., 'Build', 'Verify', 'Fix')
 */
function printExistingWorktree(
  projectRoot: string,
  slug: string,
  branchPrefix: string,
  artifactBranch: string,
  phase: string
): void {
  const wtPath = getWorktreePath(projectRoot, slug);
  const branchName = `${branchPrefix}${slug}`;

  if (!fs.existsSync(wtPath)) {
    console.log(`No worktree for \`${slug}\`. ${phase} phase — worktree may need to be recreated.`);
    return;
  }

  let commitCount = 0;
  try {
    const result = runGit(
      ['rev-list', '--count', `${artifactBranch}..${branchName}`],
      { cwd: wtPath }
    );
    if (result.exitCode === 0) commitCount = parseInt(result.stdout) || 0;
  } catch { /* ignore */ }

  console.log(`Worktree exists for \`${slug}\`.`);
  console.log(`  Path: ${path.relative(process.cwd(), wtPath) || wtPath}`);
  console.log(`  Branch: ${branchName}`);
  console.log(`  Commits: ${commitCount} since branch point`);
  console.log(`\ncd ${path.relative(process.cwd(), wtPath) || wtPath}`);
}

/**
 * Write a timestamp to .saves.json.
 *
 * @param activePath - Path to the active plan directory
 * @param key - Timestamp key (e.g., 'work_started_at', 'build_started_at')
 * @param agent - Optional agent identity string (e.g., 'ana-build')
 * @param force - When true, overwrite existing timestamp (used by FAIL→Fix path)
 * @returns Promise that resolves when the timestamp is written
 */
async function writeTimestamp(activePath: string, key: string, agent?: string, force: boolean = false): Promise<void> {
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
  saves[key] = new Date().toISOString();
  if (agent) {
    // Derive agent key: 'build_started_at' → 'build_agent', 'work_started_at' → 'work_agent'
    const agentKey = key.replace('_started_at', '_agent');
    saves[agentKey] = agent;
  }
  await fsPromises.writeFile(savesPath, JSON.stringify(saves, null, 2), 'utf-8');
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
    .action((options: { json?: boolean }) => {
      getWorkStatus(options);
    });

  const startCommand = new Command('start')
    .description('Start a new work item')
    .argument('<slug>', 'Kebab-case slug for the work item')
    .addHelpText('after', '\nEXAMPLES\n  $ ana work start fix-auth-timeout')
    .action(async (slug: string) => {
      await startWork(slug);
    });

  const completeCommand = new Command('complete')
    .description('Archive completed work after PR merge')
    .argument('<slug>', 'Work item slug to complete')
    .option('--json', 'Output JSON format for programmatic consumption')
    .action(async (slug: string, cmdOptions: { json?: boolean }) => {
      await completeWork(slug, cmdOptions);
    });

  workCommand.addCommand(statusCommand);
  workCommand.addCommand(startCommand);
  workCommand.addCommand(completeCommand);

  program.addCommand(workCommand);
}
