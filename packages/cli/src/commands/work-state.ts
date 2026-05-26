/**
 * Pipeline state computation functions.
 *
 * Leaf module — imports only from utils, never from work or work-proof.
 * State functions for discovering, gathering, and determining pipeline stages.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runGit } from '../utils/git-operations.js';
import { worktreeExists, getWorktreePath } from '../utils/worktree.js';

/**
 * Artifact state for a work item
 */
export interface ArtifactState {
  scope: ArtifactInfo;
  plan: ArtifactInfo;
  specs: SpecInfo[];
  buildReports: ReportInfo[];
  verifyReports: VerifyReportInfo[];
}

/**
 * Information about an artifact file
 */
export interface ArtifactInfo {
  exists: boolean;
  location?: string;
}

/**
 * Information about a spec file
 */
export interface SpecInfo {
  file: string;
  exists: boolean;
  location?: string;
}

/**
 * Information about a build/verify report
 */
export interface ReportInfo {
  file: string;
  exists: boolean;
  location?: string;
}

/**
 * Information about a verify report with result
 */
export interface VerifyReportInfo extends ReportInfo {
  result?: 'PASS' | 'FAIL' | 'unknown';
}

export const CONCURRENCY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check if a file exists on a branch
 *
 * @param branch - Branch name (e.g., "main", "origin/main", "feature/slug")
 * @param filePath - Relative file path
 * @returns True if file exists on branch
 */
export function fileExistsOnBranch(branch: string, filePath: string): boolean {
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
export function readFileOnBranch(branch: string, filePath: string): string | null {
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
export function getWorkBranch(slug: string): string | null {
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
export function countPhases(planContent: string): { total: number; specs: string[] } {
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
export function getVerifyResult(content: string): 'PASS' | 'FAIL' | 'unknown' {
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
export function discoverSlugs(artifactBranch: string, onArtifactBranch: boolean, projectRoot: string): string[] {
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
export function gatherArtifactState(
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
export function isTimestampRecent(savesDir: string, timestampKey: string): boolean {
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
export function determineStage(slug: string, artifacts: ArtifactState, workBranch: string | null, projectRoot?: string): string {
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

