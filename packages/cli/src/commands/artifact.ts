/**
 * ana artifact save - Commit pipeline artifacts with branch validation
 *
 * Usage:
 *   ana artifact save scope my-feature
 *   ana artifact save spec-2 my-feature
 *   ana artifact save build-report my-feature
 *   ana artifact save verify-report-1 my-feature
 *
 * Exit codes:
 *   0 - Success
 *   1 - Validation error or git operation failed
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import * as yaml from 'yaml';
import { runContractPreCheck } from './verify.js';
import { validatePlanFormat, validateVerifyReportFormat, validateScopeFormat, validateSpecFormat, validateContractFormat, validateVerifyDataFormat, validateBuildDataFormat, validateBuildReportFormat, evaluateCoverageGate } from './artifact-validators.js';
import type { ContractSchema } from '../types/contract.js';
import { findProjectRoot, validateSlug } from '../utils/validators.js';
import { evaluateTestEvidenceGate } from '../utils/capture-marker.js';
import { resolveTestCommandString } from './test.js';
import { AnaJsonSchema } from './init/anaJsonSchema.js';
import { readArtifactBranch, getCurrentBranch, readCoAuthor, runGit } from '../utils/git-operations.js';
import { worktreeExists, getWorktreePath, getMainTreeRoot } from '../utils/worktree.js';
import { captureProvenanceAtSave } from '../utils/forensics.js';
import { captureComplianceAtSave } from '../utils/compliance.js';
import { SECRET_PATTERNS } from '../engine/findings/rules/secrets.js';

// Re-export public validators for backward compatibility
export { validateScopeFormat, validateVerifyDataFormat, validateBuildDataFormat } from './artifact-validators.js';

/**
 * Save metadata entry for .saves.json
 */
interface SaveMetadata {
  saved_at: string;
  hash: string;
  history?: Array<{ saved_at: string; hash: string }>;
}

/**
 * Write save metadata to .saves.json after artifact commit.
 * Idempotent: if the computed hash matches the existing entry, the write is skipped.
 *
 * @param slugDir - Path to the slug directory
 * @param artifactType - The artifact type key (e.g., 'scope', 'spec', 'contract')
 * @param content - The artifact content for hashing
 * @param options - Optional gating configuration
 * @param options.gateOnStageTransition - When provided for archivable types, history push is skipped if opposing stage has not advanced
 * @param options.gateOnStageTransition.slugDir - Path to the slug directory for gate check
 * @param options.gateOnStageTransition.artifactType - Artifact type for gate check
 * @returns true if metadata was written, false if skipped (hash unchanged)
 */
export function writeSaveMetadata(
  slugDir: string,
  artifactType: string,
  content: string,
  options?: { gateOnStageTransition?: { slugDir: string; artifactType: string } },
): boolean {
  const savesPath = path.join(slugDir, '.saves.json');

  // Read existing .saves.json or start fresh
  let saves: Record<string, SaveMetadata> = {};
  if (fs.existsSync(savesPath)) {
    try {
      saves = JSON.parse(fs.readFileSync(savesPath, 'utf-8'));
    } catch {
      // If parse fails, start fresh
      saves = {};
    }
  }

  // Compute SHA256 of content
  const hash = createHash('sha256').update(content).digest('hex');
  const fullHash = `sha256:${hash}`;

  // Idempotent: skip write if hash matches existing entry
  const existing = saves[artifactType];
  if (existing && existing.hash === fullHash) {
    return false;
  }

  // Determine whether history should be preserved for this write.
  // For archivable types (build-report, verify-report variants), gate history on
  // stage transition — same-session corrections update timestamp/hash but skip history.
  const isArchivableType = /^(verify-report|build-report)(-\d+)?$/.test(artifactType);
  const shouldPreserveHistory = (() => {
    if (!existing?.saved_at || !existing?.hash) return false;
    if (!isArchivableType) return true;
    if (options?.gateOnStageTransition) {
      return hasOpposingStageAdvanced(
        options.gateOnStageTransition.slugDir,
        options.gateOnStageTransition.artifactType,
      );
    }
    return true;
  })();

  if (shouldPreserveHistory) {
    const historyEntry = { saved_at: existing!.saved_at, hash: existing!.hash };
    const history = existing!.history ?? [];
    history.push(historyEntry);
    saves[artifactType] = {
      saved_at: new Date().toISOString(),
      hash: fullHash,
      history,
    };
  } else {
    // First write or gated same-session correction — no history entry
    saves[artifactType] = {
      saved_at: new Date().toISOString(),
      hash: fullHash,
    };
  }

  fs.writeFileSync(savesPath, JSON.stringify(saves, null, 2));
  return true;
}

/**
 * Run contract seal check and store results in .saves.json.
 *
 * Blocks (process.exit(1)) on TAMPERED seal.
 * Called by both saveArtifact and saveAllArtifacts when a verify-report is present.
 *
 * @param slug - Work item slug
 * @param slugDir - Path to the slug plan directory
 * @param projectRoot - Project root directory
 * @returns true if pre-check ran, false if no contract found
 */
function runPreCheckAndStore(slug: string, slugDir: string, projectRoot: string): boolean {
  const contractPath = path.join(slugDir, 'contract.yaml');
  if (!fs.existsSync(contractPath)) {
    return false;
  }

  const preCheckResult = runContractPreCheck(slug, projectRoot);

  // TAMPERED blocks save
  if (preCheckResult.seal === 'TAMPERED') {
    console.error(chalk.red('Error: Contract tampered since plan commit. Cannot save verify report.'));
    console.error(chalk.gray('The contract was modified after it was sealed by the planner.'));
    console.error(chalk.gray('This invalidates the verification. Re-plan or restore the contract.'));
    process.exit(1);
  }

  // Store seal-only results in .saves.json
  const savesPath = path.join(slugDir, '.saves.json');
  let saves: Record<string, unknown> = {};
  if (fs.existsSync(savesPath)) {
    try {
      saves = JSON.parse(fs.readFileSync(savesPath, 'utf-8'));
    } catch {
      // Ignore parse errors
    }
  }

  saves['pre-check'] = {
    seal: preCheckResult.seal,
    seal_hash: preCheckResult.sealHash,
    run_at: new Date().toISOString(),
  };

  fs.writeFileSync(savesPath, JSON.stringify(saves, null, 2));
  return true;
}

/**
 * Capture modules_touched via git diff and write to .saves.json.
 *
 * Computes the list of non-.ana files changed since the merge-base with
 * the artifact branch. Called by both saveArtifact and saveAllArtifacts
 * when a build-report is present.
 *
 * @param projectRoot - Project root directory
 * @param slugDir - Path to the slug plan directory
 */
function captureModulesTouched(projectRoot: string, slugDir: string): void {
  try {
    const artBranch = readArtifactBranch(projectRoot);

    // @ana A007
    // Inner try: merge-base failure is expected on first commit or no remote
    let mergeBase: string;
    try {
      const mbResult = runGit(['merge-base', artBranch, 'HEAD'], { cwd: projectRoot });
      if (mbResult.exitCode !== 0) return; // Expected on new repos — silently skip
      mergeBase = mbResult.stdout;
    } catch {
      return; // Expected on new repos — silently skip
    }

    const diffResult = runGit(['diff', mergeBase, '--name-only', '--', '.', ':(exclude).ana'], { cwd: projectRoot });
    const diffOutput = diffResult.stdout;
    const modulesList = diffOutput ? diffOutput.split('\n').filter(Boolean) : [];

    // Per-file added/deleted churn — a sibling --numstat call over the same
    // merge-base. Recorded under a NEW key; modules_touched stays a path array.
    const churnMap = computeModuleChurn(projectRoot, mergeBase);

    const savesPath = path.join(slugDir, '.saves.json');
    let savesData: Record<string, unknown> = {};
    if (fs.existsSync(savesPath)) {
      try { savesData = JSON.parse(fs.readFileSync(savesPath, 'utf-8')); } catch { /* */ }
    }
    savesData['modules_touched'] = modulesList;
    savesData['module_churn'] = churnMap;
    fs.writeFileSync(savesPath, JSON.stringify(savesData, null, 2));
  } catch (err) {
    // @ana A008
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(chalk.yellow(`⚠ Warning: Could not capture modules_touched — saving without it. ${errMsg}`));
  }
}

/** Per-file added/deleted line churn. */
export interface FileChurn {
  /** Lines added (binary files coerce to 0). */
  added: number;
  /** Lines deleted (binary files coerce to 0). */
  deleted: number;
}

/** Map of repo-relative file path → its added/deleted churn. */
export type ModuleChurn = Record<string, FileChurn>;

/**
 * Compute per-file added/deleted churn via `git diff --numstat`.
 *
 * The `(churn)` axis of the dataset row — a sibling of the `--name-only` call in
 * {@link captureModulesTouched}, over the same merge-base, excluding `.ana`.
 * numstat emits `added<TAB>deleted<TAB>path`; binary files report `-`/`-`, which
 * are coerced to `0`/`0`. Returns an empty map on any git failure (never throws).
 *
 * @param projectRoot - Project root directory
 * @param mergeBase - The merge-base commit to diff against
 * @returns A map of file path to its added/deleted churn
 */
export function computeModuleChurn(projectRoot: string, mergeBase: string): ModuleChurn {
  const churn: ModuleChurn = {};
  try {
    const numstat = runGit(['diff', mergeBase, '--numstat', '--', '.', ':(exclude).ana'], { cwd: projectRoot });
    const out = numstat.stdout;
    if (!out) return churn;
    for (const row of out.split('\n')) {
      if (!row.trim()) continue;
      const parts = row.split('\t');
      if (parts.length < 3) continue;
      const addedRaw = parts[0] ?? '';
      const deletedRaw = parts[1] ?? '';
      const filePath = parts.slice(2).join('\t');
      if (!filePath) continue;
      // Binary files report '-' for both counts → coerce to 0.
      const added = addedRaw === '-' ? 0 : Number.parseInt(addedRaw, 10);
      const deleted = deletedRaw === '-' ? 0 : Number.parseInt(deletedRaw, 10);
      churn[filePath] = {
        added: Number.isFinite(added) ? added : 0,
        deleted: Number.isFinite(deleted) ? deleted : 0,
      };
    }
  } catch {
    // Expected on new repos / no merge-base — return what we have.
  }
  return churn;
}

/** Commit hygiene finding — structured warning for the proof chain. */
export interface CommitHygieneFinding {
  check: string;
  file: string;
  severity: string;
  message: string;
}

/** Lockfile-to-manifest mapping. */
const LOCKFILE_MANIFEST_MAP: Array<{ lockfile: string; manifest: string }> = [
  { lockfile: 'pnpm-lock.yaml', manifest: 'package.json' },
  { lockfile: 'package-lock.json', manifest: 'package.json' },
  { lockfile: 'yarn.lock', manifest: 'package.json' },
  { lockfile: 'Gemfile.lock', manifest: 'Gemfile' },
  { lockfile: 'Pipfile.lock', manifest: 'Pipfile' },
  { lockfile: 'poetry.lock', manifest: 'pyproject.toml' },
  { lockfile: 'Cargo.lock', manifest: 'Cargo.toml' },
  { lockfile: 'composer.lock', manifest: 'composer.json' },
  { lockfile: 'go.sum', manifest: 'go.mod' },
];

/** Test file patterns — files matching these are excluded from secret scanning. */
const TEST_FILE_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /\.e2e\./,
  /__tests__\//,
  /\/test\//,
  /\/tests\//,
  /fixture/i,
  /mock/i,
];

/**
 * Run commit hygiene checks against the branch diff.
 *
 * Reads `modules_touched` from `.saves.json` (no additional git operations),
 * scans for lockfile desync, secrets, merge conflict markers, and env files.
 * Writes findings to `.saves.json` under `commit_hygiene` and prints warnings.
 *
 * Follows the `captureModulesTouched()` shape: standalone helper, catches
 * errors internally, warns instead of throwing.
 *
 * @param projectRoot - Project root directory
 * @param slugDir - Path to the slug plan directory
 */
export function runCommitHygieneChecks(projectRoot: string, slugDir: string): void {
  try {
    const savesPath = path.join(slugDir, '.saves.json');
    let savesData: Record<string, unknown> = {};
    if (fs.existsSync(savesPath)) {
      try { savesData = JSON.parse(fs.readFileSync(savesPath, 'utf-8')); } catch { /* */ }
    }

    const modulesTouched = Array.isArray(savesData['modules_touched'])
      ? savesData['modules_touched'] as string[]
      : [];

    const findings: CommitHygieneFinding[] = [];

    // Check 1: Lockfile desync
    for (const { lockfile, manifest } of LOCKFILE_MANIFEST_MAP) {
      const hasLockfile = modulesTouched.some(f => f.endsWith(lockfile));
      if (!hasLockfile) continue;
      const hasManifest = modulesTouched.some(f => f.endsWith(manifest));
      if (!hasManifest) {
        findings.push({
          check: 'lockfile-desync',
          file: modulesTouched.find(f => f.endsWith(lockfile))!,
          severity: 'warn',
          message: `lockfile ${lockfile} changed without ${manifest}`,
        });
      }
    }

    // Check 2: Secret detection
    for (const file of modulesTouched) {
      // Skip test files
      if (TEST_FILE_PATTERNS.some(p => p.test(file))) continue;

      const absPath = path.join(projectRoot, file);
      let content: string;
      try { content = fs.readFileSync(absPath, 'utf-8'); } catch { continue; }

      for (const pattern of SECRET_PATTERNS) {
        pattern.regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.regex.exec(content)) !== null) {
          if (pattern.validate && !pattern.validate(match[0])) continue;
          findings.push({
            check: 'secret-detected',
            file,
            severity: 'warn',
            message: `possible secret in ${file} (${pattern.type})`,
          });
        }
      }
    }

    // Check 3: Merge conflict markers
    for (const file of modulesTouched) {
      const absPath = path.join(projectRoot, file);
      let content: string;
      try { content = fs.readFileSync(absPath, 'utf-8'); } catch { continue; }

      if (/^<{7}\s/m.test(content) || /^={7}$/m.test(content) || /^>{7}\s/m.test(content)) {
        findings.push({
          check: 'conflict-marker',
          file,
          severity: 'warn',
          message: `merge conflict marker in ${file}`,
        });
      }
    }

    // Check 4: Environment files
    for (const file of modulesTouched) {
      const basename = path.basename(file);
      if (/^\.env(\..*)?$/.test(basename)) {
        // Exclude .env.example and .env.test
        if (basename === '.env.example' || basename === '.env.test') continue;
        findings.push({
          check: 'env-file',
          file,
          severity: 'warn',
          message: `environment file ${basename} in branch diff`,
        });
      }
    }

    // Print warnings
    for (const finding of findings) {
      console.error(chalk.yellow(`⚠ Commit hygiene: ${finding.message}`));
    }

    // Write to .saves.json
    savesData['commit_hygiene'] = findings;
    fs.writeFileSync(savesPath, JSON.stringify(savesData, null, 2));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(chalk.yellow(`⚠ Warning: Could not run commit hygiene checks. ${errMsg}`));
  }
}

/**
 * Archive a previously committed version of a file before it is overwritten.
 *
 * Extracts the committed content via `git show HEAD:{path}`, compares it to
 * the current disk content, and writes it to a `_r{N}` archive file if
 * the content differs. Follows the `captureModulesTouched` pattern: standalone
 * helper, catches errors internally, warns instead of throwing.
 *
 * @param projectRoot - Project root directory
 * @param relFilePath - File path relative to project root
 * @param planDir - Absolute path to the slug plan directory
 * @returns Relative path of the archive file (for staging), or null if no archive was created
 */
function archivePreviousVersion(projectRoot: string, relFilePath: string, planDir: string): string | null {
  try {
    // 1. Get committed version from HEAD (use forward slashes for git on Windows)
    const gitPath = relFilePath.split(path.sep).join('/');
    const gitResult = runGit(['show', `HEAD:${gitPath}`], { cwd: projectRoot });
    if (gitResult.exitCode !== 0) return null; // No committed version
    const committedContent = gitResult.stdout;

    // 2. Compare with disk content (if file exists)
    const absPath = path.join(projectRoot, relFilePath);
    if (fs.existsSync(absPath)) {
      const diskContent = fs.readFileSync(absPath, 'utf-8');
      // Normalize CRLF→LF for Windows autocrlf compatibility (git show returns LF)
      if (diskContent.replace(/\r\n/g, '\n') === committedContent) return null; // No change
    }
    // If file doesn't exist on disk but does in git, that's a valid archive case

    // 3. Determine next round number by scanning planDir for existing _r{N} files
    const fileName = path.basename(relFilePath);
    const ext = path.extname(fileName);
    const baseName = fileName.slice(0, -ext.length);

    const roundPattern = new RegExp(`^${escapeRegExp(baseName)}_r(\\d+)${escapeRegExp(ext)}$`);
    let maxRound = 0;
    const dirEntries = fs.readdirSync(planDir);
    for (const entry of dirEntries) {
      const match = entry.match(roundPattern);
      if (match?.[1]) {
        const n = parseInt(match[1], 10);
        if (n > maxRound) maxRound = n;
      }
    }
    const nextRound = maxRound + 1;

    // 4. Write archive file
    const archiveFileName = `${baseName}_r${nextRound}${ext}`;
    const archiveAbsPath = path.join(planDir, archiveFileName);
    fs.writeFileSync(archiveAbsPath, committedContent, 'utf-8');

    // 5. Log
    console.log(chalk.gray(`Archived ${fileName} → ${archiveFileName} (previous round)`));

    // 6. Return relative path for staging
    return path.relative(projectRoot, archiveAbsPath);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(chalk.yellow(`Warning: Could not archive previous ${path.basename(relFilePath)}: ${errMsg}`));
    return null;
  }
}

/**
 * Escape special regex characters in a string.
 *
 * @param s - String to escape
 * @returns Escaped string safe for use in RegExp
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Artifact type information after parsing
 */
interface ArtifactTypeInfo {
  category: 'planning' | 'build-verify';
  fileName: string;
  displayName: string;
  baseType: string;
  artifactType: string;
}

/**
 * Parse artifact type string and extract metadata
 *
 * @param type - Raw type string (e.g., "scope", "spec-2", "build-report", "verify-report-1", "contract")
 * @returns Parsed artifact information
 */
function parseArtifactType(type: string): ArtifactTypeInfo | null {
  // Match valid types with optional number suffix
  const match = type.match(/^(scope|plan|spec|contract|build-report|verify-report)(?:-(\d+))?$/);

  if (!match) {
    return null;
  }

  const [, baseType, number] = match;

  // Determine category
  const category = baseType === 'build-report' || baseType === 'verify-report'
    ? 'build-verify'
    : 'planning';

  // Determine file name
  let fileName: string;
  if (baseType === 'scope' || baseType === 'plan') {
    fileName = `${baseType}.md`;
  } else if (baseType === 'spec') {
    fileName = number ? `spec-${number}.md` : 'spec.md';
  } else if (baseType === 'contract') {
    fileName = 'contract.yaml';
  } else if (baseType === 'build-report') {
    fileName = number ? `build_report_${number}.md` : 'build_report.md';
  } else if (baseType === 'verify-report') {
    fileName = number ? `verify_report_${number}.md` : 'verify_report.md';
  } else {
    return null;
  }

  // Determine display name
  let displayName: string;
  if (baseType === 'scope') {
    displayName = 'Scope';
  } else if (baseType === 'plan') {
    displayName = 'Plan';
  } else if (baseType === 'spec') {
    displayName = number ? `Spec ${number}` : 'Spec';
  } else if (baseType === 'contract') {
    displayName = 'Contract';
  } else if (baseType === 'build-report') {
    displayName = number ? `Build report ${number}` : 'Build report';
  } else if (baseType === 'verify-report') {
    displayName = number ? `Verify report ${number}` : 'Verify report';
  } else {
    displayName = type;
  }

  return { category, fileName, displayName, baseType, artifactType: type };
}

function readSaveMetadata(slugDir: string): Record<string, SaveMetadata> {
  const savesPath = path.join(slugDir, '.saves.json');
  if (!fs.existsSync(savesPath)) return {};

  try {
    return JSON.parse(fs.readFileSync(savesPath, 'utf-8')) as Record<string, SaveMetadata>;
  } catch {
    return {};
  }
}

function getPhaseSavedAt(saves: Record<string, SaveMetadata>, key: string, phase: number): string | undefined {
  return (saves[`${key}-${phase}`] ?? (phase === 1 ? saves[key] : undefined))?.saved_at;
}

function buildWasSavedAfterVerify(saves: Record<string, SaveMetadata>, phase: number): boolean {
  const buildSavedAt = getPhaseSavedAt(saves, 'build-report', phase);
  const verifySavedAt = getPhaseSavedAt(saves, 'verify-report', phase);
  return Boolean(buildSavedAt && verifySavedAt && new Date(buildSavedAt) > new Date(verifySavedAt));
}

function readLocalVerifyResult(filePath: string): 'PASS' | 'FAIL' | 'unknown' {
  if (!fs.existsSync(filePath)) return 'unknown';
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/\*\*Result:\*\*\s*(PASS|FAIL)/i);
  if (!match?.[1]) return 'unknown';
  return match[1].toUpperCase() as 'PASS' | 'FAIL';
}

function getNumberedSpecPhases(slugDir: string): number[] {
  if (!fs.existsSync(slugDir)) return [];

  return fs.readdirSync(slugDir)
    .map(entry => entry.match(/^spec-(\d+)\.md$/)?.[1])
    .filter((phase): phase is string => Boolean(phase))
    .map(phase => parseInt(phase, 10))
    .sort((a, b) => a - b);
}

function inferMultiPhaseReportType(type: string, projectRoot: string, slug: string): string | null {
  if (type !== 'build-report' && type !== 'verify-report') return type;

  const slugDir = path.join(projectRoot, '.ana', 'plans', 'active', slug);
  const phases = getNumberedSpecPhases(slugDir);
  if (phases.length === 0) return type;

  const saves = readSaveMetadata(slugDir);

  for (const phase of phases) {
    const buildPath = path.join(slugDir, `build_report_${phase}.md`);
    const verifyPath = path.join(slugDir, `verify_report_${phase}.md`);
    const hasBuild = fs.existsSync(buildPath);
    const hasVerify = fs.existsSync(verifyPath);
    const verifyResult = hasVerify ? readLocalVerifyResult(verifyPath) : 'unknown';

    if (type === 'build-report') {
      if (!hasBuild) return `build-report-${phase}`;
      if (verifyResult === 'FAIL' && !buildWasSavedAfterVerify(saves, phase)) {
        return `build-report-${phase}`;
      }
    } else if (hasBuild) {
      if (!hasVerify) return `verify-report-${phase}`;
      if (verifyResult === 'FAIL' && buildWasSavedAfterVerify(saves, phase)) {
        return `verify-report-${phase}`;
      }
    }
  }

  return null;
}



/**
 * Derive companion YAML filename from a report filename.
 *
 * verify_report.md → verify_data.yaml
 * verify_report_1.md → verify_data_1.yaml
 * build_report.md → build_data.yaml
 * build_report_2.md → build_data_2.yaml
 *
 * @param reportFileName - The report filename (e.g., "verify_report.md")
 * @returns Companion filename, or null if not a report
 */
/**
 * Move a file with cross-filesystem fallback.
 *
 * Uses renameSync when possible. Falls back to copyFileSync + unlinkSync
 * when the source and destination are on different filesystems (EXDEV).
 *
 * @param src - Source file path
 * @param dst - Destination file path
 */
function moveFileCrossFs(src: string, dst: string): void {
  try {
    fs.renameSync(src, dst);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as NodeJS.ErrnoException).code === 'EXDEV') {
      fs.copyFileSync(src, dst);
      fs.unlinkSync(src);
    } else {
      throw err;
    }
  }
}

function deriveCompanionFileName(reportFileName: string): string | null {
  const match = reportFileName.match(/^(verify|build)_report(_\d+)?\.md$/);
  if (!match) return null;
  const prefix = match[1];
  const number = match[2] ?? '';
  return `${prefix}_data${number}.yaml`;
}

/**
 * Derive the companion artifact key for .saves.json from the full artifact type string.
 *
 * Phase-aware: "build-report-1" → "build-data-1", "verify-report" → "verify-data".
 *
 * @param artifactType - Full artifact type string (e.g., "build-report-1", "verify-report")
 * @returns Phase-aware companion key, or null if not a report type
 */
function deriveCompanionKey(artifactType: string): string | null {
  const match = artifactType.match(/^(verify-report|build-report)(-\d+)?$/);
  if (!match) return null;
  const base = match[1] === 'verify-report' ? 'verify-data' : 'build-data';
  const suffix = match[2] ?? '';
  return `${base}${suffix}`;
}

/**
 * Derive the opposing report key for stage-transition gating.
 *
 * Phase-aware: "verify-report-2" → "build-report-2", "build-report" → "verify-report".
 * Also accepts companion keys: "verify-data-2" → derives parent "verify-report-2" → "build-report-2".
 *
 * @param artifactType - Full artifact type string (e.g., "build-report-1", "verify-data-2")
 * @returns Phase-aware opposing report key, or null if not a report/companion type
 */
export function deriveOpposingReportKey(artifactType: string): string | null {
  // Try report key directly
  const reportMatch = artifactType.match(/^(verify-report|build-report)(-\d+)?$/);
  if (reportMatch) {
    const base = reportMatch[1] === 'verify-report' ? 'build-report' : 'verify-report';
    const suffix = reportMatch[2] ?? '';
    return `${base}${suffix}`;
  }

  // Try companion key — derive parent report, then get its opposite
  const companionMatch = artifactType.match(/^(verify-data|build-data)(-\d+)?$/);
  if (companionMatch) {
    const parentBase = companionMatch[1] === 'verify-data' ? 'verify-report' : 'build-report';
    const suffix = companionMatch[2] ?? '';
    const parentKey = `${parentBase}${suffix}`;
    return deriveOpposingReportKey(parentKey);
  }

  return null;
}

/**
 * Check whether the opposing pipeline stage has advanced since the current artifact's
 * last save. A stage advancement means a genuine rejection cycle occurred — the other
 * side responded. Without advancement, a re-save is a same-session correction.
 *
 * @param slugDir - Path to the slug directory containing .saves.json
 * @param artifactType - The artifact type being saved (e.g., "verify-report", "build-data-2")
 * @returns true if the opposing stage has a more recent timestamp, meaning archiving should proceed
 */
export function hasOpposingStageAdvanced(slugDir: string, artifactType: string): boolean {
  const opposingKey = deriveOpposingReportKey(artifactType);
  if (!opposingKey) return false;

  const savesPath = path.join(slugDir, '.saves.json');
  if (!fs.existsSync(savesPath)) return false;

  let saves: Record<string, SaveMetadata>;
  try {
    saves = JSON.parse(fs.readFileSync(savesPath, 'utf-8'));
  } catch {
    return false;
  }

  // Derive the report key for the current artifact (companion → parent report)
  const companionMatch = artifactType.match(/^(verify-data|build-data)(-\d+)?$/);
  const currentReportKey = companionMatch
    ? `${companionMatch[1] === 'verify-data' ? 'verify-report' : 'build-report'}${companionMatch[2] ?? ''}`
    : artifactType;

  const currentEntry = saves[currentReportKey];
  const opposingEntry = saves[opposingKey];

  if (!currentEntry?.saved_at || !opposingEntry?.saved_at) return false;

  const currentTime = new Date(currentEntry.saved_at).getTime();
  const opposingTime = new Date(opposingEntry.saved_at).getTime();

  return opposingTime > currentTime;
}

/**
 * Validate that we're on the correct branch for this artifact type
 *
 * @param typeInfo - Parsed artifact type information
 * @param currentBranch - Current git branch
 * @param artifactBranch - Configured artifact branch from ana.json
 * @param slug - Work item slug
 */
function validateBranch(
  typeInfo: ArtifactTypeInfo,
  currentBranch: string,
  artifactBranch: string,
  slug: string
): void {
  if (typeInfo.category === 'planning') {
    // Planning artifacts must be on artifact branch
    if (currentBranch !== artifactBranch) {
      console.error(chalk.red(`Error: You're on \`${currentBranch}\`. ${typeInfo.displayName} must be saved to \`${artifactBranch}\`.`));
      console.error(chalk.gray(`Run: git checkout ${artifactBranch} && git pull`));
      process.exit(1);
    }
  } else {
    // Build/verify artifacts must NOT be on artifact branch
    if (currentBranch === artifactBranch) {
      const projectRoot = findProjectRoot();
      if (worktreeExists(projectRoot, slug)) {
        const wtRel = path.relative(process.cwd(), getWorktreePath(projectRoot, slug)) || '.';
        const planRel = path.join('.ana', 'plans', 'active', slug, typeInfo.fileName);
        const mainFilePath = path.join(projectRoot, planRel);
        if (fs.existsSync(mainFilePath)) {
          console.error(chalk.red(`Error: ${typeInfo.fileName} is here on the artifact branch but belongs in the worktree.`));
          console.error(chalk.gray(`  cp ${planRel} ${path.join(wtRel, planRel)}`));
          console.error(chalk.gray(`  cd ${wtRel} && ana artifact save ${typeInfo.baseType} ${slug}`));
        } else {
          console.error(chalk.red(`Error: You're on \`${artifactBranch}\`. ${typeInfo.displayName} belongs on the feature branch.`));
          console.error(chalk.gray(`  cd ${wtRel} && ana artifact save ${typeInfo.baseType} ${slug}`));
        }
      } else {
        console.error(chalk.red(`Error: You're on \`${artifactBranch}\`. ${typeInfo.displayName} belongs on a feature branch.`));
        console.error(chalk.gray(`  Switch to the feature branch for \`${slug}\`, then run this command again.`));
      }
      process.exit(1);
    }
  }
}

/**
 * Whether the test-evidence gate is enabled for this project.
 *
 * Enablement = the committed `testEvidenceGate` flag is `"on"` AND a test command
 * resolves (top-level `commands.test` OR any per-surface test command). The
 * carve-out keys on ANY resolvable test command so a surface-only monorepo
 * (no top-level test, but `surfaces.cli.commands.test`) stays enforced.
 *
 * Undefined-safe by construction: a missing or malformed `ana.json` returns
 * `false` and never throws — the same fail-safe posture the retired arming
 * signal held (absent → off, never brick a fresh or pre-flag project).
 *
 * @param projectRoot - Project root directory
 * @returns True only when the gate is on AND a test command resolves
 */
export function isTestEvidenceGateEnabled(projectRoot: string): boolean {
  let anaJson: Record<string, unknown>;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(projectRoot, '.ana', 'ana.json'), 'utf-8')) as unknown;
    anaJson = AnaJsonSchema.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }

  if (anaJson['testEvidenceGate'] !== 'on') return false;

  // Carve-out: enabled only when a test command actually resolves. Check the
  // top-level command first, then every surface — any single hit is enough.
  if (resolveTestCommandString(anaJson, undefined)) return true;
  const surfaces = anaJson['surfaces'] as Record<string, unknown> | undefined;
  for (const surfaceName of Object.keys(surfaces ?? {})) {
    if (resolveTestCommandString(anaJson, surfaceName)) return true;
  }
  return false;
}

/**
 * Run the test-evidence gate on a build report.
 *
 * Nothing is inlined any more — the committed compact marker IS the sealed
 * account. The gate's job has shrunk to a present-check: a well-formed `build`
 * capture marker must exist. Enablement is read from committed config
 * (`isTestEvidenceGateEnabled`): when the `testEvidenceGate` flag is on AND a test command
 * resolves, an absent seal blocks the save (process.exit(1), BEFORE the seal
 * hash). When the gate is off or no test command resolves, an absent seal
 * surfaces as a warning and never blocks. Counts and verdict never block.
 *
 * The block message is built from the ACTUAL gate error (`gate.errors`), so it
 * names the real reason and points the user at both the `ana test` fix and the
 * `testEvidenceGate: "off"` escape hatch.
 *
 * @param filePath - Absolute path to the build report
 * @param projectRoot - Project root (resolves the `testEvidenceGate` config flag)
 */
function applyTestEvidenceGate(filePath: string, projectRoot: string): void {
  const enabled = isTestEvidenceGateEnabled(projectRoot);
  const gate = evaluateTestEvidenceGate(filePath, { enabled });

  if (gate.blocked) {
    console.error(chalk.red('Error: build_report.md has no valid captured test evidence.'));
    console.error(chalk.red('  The test-evidence gate is on for this project, so test evidence is required.'));
    for (const err of gate.errors) {
      console.error(chalk.red(`  ${err}`));
    }
    console.error(chalk.gray('  Fix: run `ana test` (it seals a harmless abstain even when no tests run), then re-save.'));
    console.error(chalk.gray('  To turn the gate off for this project: set "testEvidenceGate": "off" in .ana/ana.json.'));
    process.exit(1);
  }

  for (const warning of gate.warnings) {
    console.warn(chalk.yellow(`Warning: capture evidence — ${warning}`));
  }
}

/**
 * Run the pre-seal scope-coverage gate on a contract being saved.
 *
 * Reads the sibling scope.md, parses the contract YAML, and asks
 * evaluateCoverageGate whether the contract covers every scope acceptance
 * criterion. ALWAYS prints exactly one diagnostic line (so an inactive gate is
 * never invisible — AC13). Prints info/warnings yellow and, when the gate
 * blocks, errors red followed by process.exit(1) BEFORE the seal hash is
 * written. Inert by design today: every existing contract is version 1.0, so
 * the gate no-ops everywhere until Phase 2 teaches Plan to emit version 1.1.
 *
 * Defensive at the boundary: an unreadable scope or contract degrades the gate
 * to a benign inactive result rather than throwing — the gate function itself
 * is already total.
 *
 * @param contractPath - Absolute path to the contract.yaml being saved
 */
function applyCoverageGate(contractPath: string): void {
  let scopeContent = '';
  try {
    const scopePath = path.join(path.dirname(contractPath), 'scope.md');
    if (fs.existsSync(scopePath)) {
      scopeContent = fs.readFileSync(scopePath, 'utf-8');
    }
  } catch {
    scopeContent = '';
  }

  let contract: ContractSchema = {};
  try {
    const parsed = yaml.parse(fs.readFileSync(contractPath, 'utf-8')) as unknown;
    if (parsed && typeof parsed === 'object') {
      contract = parsed as ContractSchema;
    }
  } catch {
    contract = {};
  }

  const gate = evaluateCoverageGate({ scopeContent, contract });

  // Always surface the decision — an inactive gate is never silent (AC13).
  console.log(`Coverage gate: ${gate.diagnostic}`);

  for (const note of gate.info) {
    console.log(chalk.gray(`  ${note}`));
  }
  for (const warning of gate.warnings) {
    console.warn(chalk.yellow(`Warning: ${warning}`));
  }

  if (gate.block) {
    for (const error of gate.errors) {
      console.error(chalk.red(`  ${error}`));
    }
    console.error(chalk.red('The seal was not written. Fix the contract and re-save.'));
    process.exit(1);
  }
}

/**
 * Save an artifact to git with appropriate validation and commit
 *
 * @param type - Artifact type (e.g., "scope", "spec-2", "build-report")
 * @param slug - Work item slug (e.g., "add-status-command")
 */
export function saveArtifact(type: string, slug: string): void {
  // 0. Validate slug format
  try {
    validateSlug(slug);
  } catch {
    console.error(chalk.red('Error: Invalid slug format. Use kebab-case: fix-auth-timeout, add-export-csv'));
    process.exit(1);
  }

  // 1. Parse type
  let typeInfo = parseArtifactType(type);
  if (!typeInfo) {
    console.error(chalk.red(`Error: Unknown artifact type \`${type}\`.`));
    console.error(chalk.gray('Valid types: scope, plan, spec, spec-N, contract, build-report, build-report-N, verify-report, verify-report-N'));
    process.exit(1);
  }

  // 2. Resolve project root early — needed for readArtifactBranch and throughout
  const projectRoot = findProjectRoot();

  const correctedType = inferMultiPhaseReportType(type, projectRoot, slug);
  if (!correctedType) {
    console.error(chalk.red(`Error: Cannot infer a target phase for ${type} on multi-phase work item \`${slug}\`.`));
    console.error(chalk.gray(`Run \`ana work status\` or use an explicit numbered type like \`ana artifact save ${type}-2 ${slug}\`.`));
    process.exit(1);
  }
  if (correctedType !== type) {
    const correctedTypeInfo = parseArtifactType(correctedType);
    if (correctedTypeInfo) {
      console.warn(chalk.yellow(`⚠ ${type} is unnumbered for a multi-phase work item; saving as ${correctedType}.`));
      typeInfo = correctedTypeInfo;
    }
  }

  // 3. Read artifactBranch from ana.json
  const artifactBranch = readArtifactBranch(projectRoot);

  // 4. Get current branch
  const currentBranch = getCurrentBranch();
  if (!currentBranch) {
    console.error(chalk.red('Error: Not a git repository. `ana artifact save` requires git.'));
    process.exit(1);
  }

  // 5. Validate branch
  validateBranch(typeInfo, currentBranch, artifactBranch, slug);

  // 6. Resolve file path (relative to projectRoot for git, absolute for fs)
  const relFilePath = path.join('.ana', 'plans', 'active', slug, typeInfo.fileName);
  let filePath = path.join(projectRoot, relFilePath);

  // 6a. Auto-rename fallback for multi-spec: if build_report_1.md doesn't exist
  // but build_report.md does, rename it. Same for verify_report. Build agents
  // commonly write the default filename instead of the phase-numbered one.
  // Also handles fix cycles: when BOTH numbered and unnumbered exist, the
  // unnumbered file (from the fix build) overwrites the numbered file.
  const isNumbered = typeInfo.fileName.match(/_\d+\.md$/);
  if (isNumbered) {
    const defaultName = typeInfo.baseType === 'build-report' ? 'build_report.md'
      : typeInfo.baseType === 'verify-report' ? 'verify_report.md' : null;
    if (defaultName) {
      const slugDir = path.join(projectRoot, '.ana', 'plans', 'active', slug);
      const defaultPath = path.join(slugDir, defaultName);
      if (fs.existsSync(defaultPath)) {
        // Rename unnumbered → numbered (overwrites if numbered exists)
        fs.renameSync(defaultPath, filePath);
        console.log(chalk.gray(`Renamed ${defaultName} → ${typeInfo.fileName}`));

        // Rename companion alongside report
        const defaultCompanion = deriveCompanionFileName(defaultName);
        const numberedCompanion = deriveCompanionFileName(typeInfo.fileName);
        if (defaultCompanion && numberedCompanion) {
          const defaultCompPath = path.join(slugDir, defaultCompanion);
          const numberedCompPath = path.join(slugDir, numberedCompanion);
          if (fs.existsSync(defaultCompPath)) {
            fs.renameSync(defaultCompPath, numberedCompPath);
            console.log(chalk.gray(`Renamed ${defaultCompanion} → ${numberedCompanion}`));
          }
        }
      }
    }
  }

  // 6b-pre. Archive previous version for archivable types (before file-exists check)
  const archiveRelPaths: string[] = [];
  const isArchivable = typeInfo.baseType === 'verify-report' || typeInfo.baseType === 'build-report';
  if (isArchivable) {
    const slugDir = path.join(projectRoot, '.ana', 'plans', 'active', slug);
    if (hasOpposingStageAdvanced(slugDir, typeInfo.artifactType)) {
      const archivePath = archivePreviousVersion(projectRoot, relFilePath, slugDir);
      if (archivePath) archiveRelPaths.push(archivePath);
    }
  }

  // 6b. Verify file exists — auto-move from main tree if needed (Layer 1)
  if (!fs.existsSync(filePath)) {
    if (typeInfo.category !== 'planning') {
      const mainRoot = getMainTreeRoot(projectRoot);
      if (mainRoot !== projectRoot) {
        const mainPath = path.join(mainRoot, relFilePath);
        if (fs.existsSync(mainPath)) {
          // Only move untracked files — tracked files on main indicate something wrong
          const isMainTracked = spawnSync('git', ['ls-files', '--error-unmatch', relFilePath], {
            cwd: mainRoot,
            stdio: 'pipe'
          }).status === 0;
          if (isMainTracked) {
            console.error(chalk.red(`Error: ${typeInfo.fileName} is tracked on the main tree — cannot auto-move.`));
            process.exit(1);
          }

          // Move report from main tree to worktree
          moveFileCrossFs(mainPath, filePath);
          console.log(chalk.gray(`  ℹ Moved ${typeInfo.fileName} from main tree to worktree`));

          // Move companion alongside report (must happen before companion discovery at line 1029)
          const compFileName = deriveCompanionFileName(typeInfo.fileName);
          if (compFileName) {
            const mainCompPath = path.join(mainRoot, '.ana', 'plans', 'active', slug, compFileName);
            const wtCompPath = path.join(projectRoot, '.ana', 'plans', 'active', slug, compFileName);
            if (fs.existsSync(mainCompPath) && !fs.existsSync(wtCompPath)) {
              moveFileCrossFs(mainCompPath, wtCompPath);
              console.log(chalk.gray(`  ℹ Moved ${compFileName} from main tree to worktree`));
            }
          }
        }
      }
    }

    // After auto-move attempt, re-check existence
    if (!fs.existsSync(filePath)) {
      console.error(chalk.red(`Error: No ${typeInfo.displayName.toLowerCase()} found at \`${relFilePath}\`.`));
      console.error(chalk.gray('Write the file first, then run this command.'));
      process.exit(1);
    }
  }

  // 6c. Validate format for all artifact types
  if (typeInfo.baseType === 'plan') {
    const error = validatePlanFormat(filePath);
    if (error) {
      console.error(chalk.red(`Error: plan.md format invalid.\n${error}`));
      console.error(chalk.gray("Run 'ana work status' to see the expected format."));
      process.exit(1);
    }
  }

  if (typeInfo.baseType === 'verify-report') {
    const error = validateVerifyReportFormat(filePath);
    if (error) {
      console.error(chalk.red(`Error: verify_report.md format invalid.\n${error}`));
      process.exit(1);
    }

    // Verify keeps its OWN sealed account: the compact capture marker pasted
    // into verify_report.md IS that account — nothing to inline. NEVER gated:
    // Verify's independence is preserved; a verify save is never blocked by the
    // capture gate even when the project is armed.
    const slugDir = path.join(projectRoot, '.ana', 'plans', 'active', slug);

    // Auto pre-check for contract mode
    runPreCheckAndStore(slug, slugDir, projectRoot);
  }

  if (typeInfo.baseType === 'scope') {
    const error = validateScopeFormat(filePath);
    if (error) {
      console.error(chalk.red(`Error: scope.md format invalid.\n${error}`));
      process.exit(1);
    }
  }

  if (typeInfo.baseType === 'spec') {
    const result = validateSpecFormat(filePath);
    if (result.error) {
      console.error(chalk.red(`Error: spec.md format invalid.\n${result.error}`));
      process.exit(1);
    }
    if (result.warning) {
      console.warn(chalk.yellow(`Warning: ${result.warning}`));
    }
  }

  if (typeInfo.baseType === 'build-report') {
    const error = validateBuildReportFormat(filePath);
    if (error) {
      console.error(chalk.red(`Error: build_report.md format invalid.\n${error}`));
      process.exit(1);
    }
    // Run the capture gate BEFORE the seal hash (writeSaveMetadata) and staging.
    // Nothing is inlined — the gate is a present-check that blocks only when the
    // gate is enabled in config AND no well-formed build seal is present;
    // otherwise warn-only.
    applyTestEvidenceGate(filePath, projectRoot);
  }

  if (typeInfo.baseType === 'contract') {
    const errors = validateContractFormat(filePath);
    if (errors.length > 0) {
      console.error(chalk.red('Contract validation failed:'));
      for (const error of errors) {
        console.error(chalk.red(`  - ${error}`));
      }
      process.exit(1);
    }
    // Pre-seal scope-coverage gate — runs BEFORE the seal hash (writeSaveMetadata).
    // No-op on legacy version 1.0 contracts; blocks a version 1.1 contract that
    // silently drops a scope acceptance criterion.
    applyCoverageGate(filePath);
  }

  // 6b. Companion YAML discovery and validation (verify-report / build-report)
  const companionFileName = deriveCompanionFileName(typeInfo.fileName);
  const companionKey = deriveCompanionKey(typeInfo.artifactType);
  let companionPath: string | null = null;
  let relCompanionPath: string | null = null;

  if (companionFileName && companionKey) {
    const slugDir = path.join(projectRoot, '.ana', 'plans', 'active', slug);
    companionPath = path.join(slugDir, companionFileName);
    relCompanionPath = path.join('.ana', 'plans', 'active', slug, companionFileName);

    if (!fs.existsSync(companionPath)) {
      console.error(chalk.red(`Error: ${companionFileName} not found alongside ${typeInfo.fileName}.`));
      console.error('');
      console.error(`Foundation 2 requires a structured data companion for ${typeInfo.baseType === 'verify-report' ? 'verify' : 'build'} reports.`);
      console.error(`Create ${companionFileName} in .ana/plans/active/${slug}/ with this schema:`);
      console.error('');
      if (typeInfo.baseType === 'verify-report') {
        console.error('  schema: 1');
        console.error('  findings:');
        console.error('    - category: code');
        console.error('      summary: "Description of the finding"');
        console.error('      file: "packages/cli/src/path/to/file.ts"');
      } else {
        console.error('  schema: 1');
        console.error('  concerns:');
        console.error('    - summary: "Description of the concern"');
      }
      console.error('');
      console.error(chalk.gray('See packages/cli/templates/.claude/agents/ana-verify.md for the full schema.'));
      process.exit(1);
    }

    // Validate companion
    const result = typeInfo.baseType === 'verify-report'
      ? validateVerifyDataFormat(companionPath, projectRoot)
      : validateBuildDataFormat(companionPath);
    if (result.errors.length > 0) {
      console.error(chalk.red(`Error: ${companionFileName} validation failed:`));
      for (const error of result.errors) {
        console.error(chalk.red(`  - ${error}`));
      }
      process.exit(1);
    }

    // Emit warnings (non-blocking)
    for (const warning of result.warnings) {
      console.warn(chalk.yellow(`Warning: ${companionFileName} ${warning}`));
    }

    const findingCount = typeInfo.baseType === 'verify-report'
      ? (yaml.parse(fs.readFileSync(companionPath, 'utf-8')).findings?.length ?? 0)
      : (yaml.parse(fs.readFileSync(companionPath, 'utf-8')).concerns?.length ?? 0);
    const warningInfo = result.warnings.length > 0 ? `, ${result.warnings.length} warnings` : '';
    console.log(chalk.green(`✓ ${companionFileName} validated (${findingCount} ${typeInfo.baseType === 'verify-report' ? 'findings' : 'concerns'}${warningInfo})`));

    // Archive companion if it has a committed version and opposing stage advanced
    if (isArchivable && relCompanionPath && companionKey) {
      const slugDir = path.join(projectRoot, '.ana', 'plans', 'active', slug);
      if (hasOpposingStageAdvanced(slugDir, companionKey)) {
        const companionArchivePath = archivePreviousVersion(projectRoot, relCompanionPath, slugDir);
        if (companionArchivePath) archiveRelPaths.push(companionArchivePath);
      }
    }
  }

  // 7b. Check if file is tracked (before staging, for create vs update message)
  const isTracked = spawnSync('git', ['ls-files', '--error-unmatch', relFilePath], {
    cwd: projectRoot,
    stdio: 'pipe'
  }).status === 0;

  // 7. Pull before commit (artifact branch only)
  if (typeInfo.category === 'planning') {
    try {
      // Check if remote exists first
      const remotes = runGit(['remote'], { cwd: projectRoot }).stdout;
      if (remotes) {
        runGit(['pull', '--rebase'], { cwd: projectRoot });
      }
      // If no remotes, skip pull (e.g., in tests or new repos)
    } catch (error) {
      // Only error if it's an actual conflict, not a "no remote" error
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('conflict') || errorMessage.includes('Cannot rebase')) {
        console.error(chalk.red('Error: Pull failed due to conflicts. Resolve conflicts and try again.'));
        process.exit(1);
      }
      // Otherwise, continue (e.g., no upstream branch configured yet)
    }
  }

  // 8. Stage the artifact file(s)
  const stagedPaths: string[] = [];
  try {
    runGit(['add', relFilePath], { cwd: projectRoot });
    stagedPaths.push(relFilePath);

    // Stage companion YAML alongside report
    if (relCompanionPath && companionPath && fs.existsSync(companionPath)) {
      runGit(['add', relCompanionPath], { cwd: projectRoot });
      stagedPaths.push(relCompanionPath);
    }

    // Stage archive files alongside new artifacts
    for (const archivePath of archiveRelPaths) {
      runGit(['add', archivePath], { cwd: projectRoot });
      stagedPaths.push(archivePath);
    }
  } catch (error) {
    console.error(chalk.red(`Error: Failed to stage files. ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }

  // 8b. Write .saves.json metadata and capture modules_touched BEFORE the
  // no-changes check. With idempotent writeSaveMetadata, unchanged artifacts
  // produce no .saves.json diff, so the check still works correctly.
  const slugDir = path.join(projectRoot, '.ana', 'plans', 'active', slug);
  const artifactContent = fs.readFileSync(filePath, 'utf-8');
  const stageGate = isArchivable
    ? { gateOnStageTransition: { slugDir, artifactType: typeInfo.artifactType } }
    : undefined;
  writeSaveMetadata(slugDir, typeInfo.artifactType, artifactContent, stageGate);

  // Write companion hash alongside report hash
  if (companionPath && companionKey && fs.existsSync(companionPath)) {
    const companionContent = fs.readFileSync(companionPath, 'utf-8');
    const companionGate = isArchivable
      ? { gateOnStageTransition: { slugDir, artifactType: companionKey } }
      : undefined;
    writeSaveMetadata(slugDir, companionKey, companionContent, companionGate);
  }

  // Capture modules_touched at build-report time (when the feature branch
  // definitely exists and all code is committed).
  if (typeInfo.baseType === 'build-report') {
    captureModulesTouched(projectRoot, slugDir);
    runCommitHygieneChecks(projectRoot, slugDir);
  }

  const savesPath = path.join(slugDir, '.saves.json');
  if (fs.existsSync(savesPath)) {
    try {
      const savesRelPath = path.relative(projectRoot, savesPath);
      runGit(['add', savesRelPath], { cwd: projectRoot });
      stagedPaths.push(savesRelPath);
    } catch { /* */ }
  }

  // 8a0. Capture this session's provenance + behavioral compliance (capture v2).
  // Both total/never-throws — each returns the committed file path or null. Staged
  // into a SEPARATE list so the no-changes guard (which checks artifact paths only)
  // never absorbs them — the transcript always grows between saves, so including
  // them would make every re-save commit. They ride the SAME commit only when
  // artifacts actually changed. Compliance MUST run before provenance: provenance
  // consumes (deletes) the pending pointer, and Codex has no env fallback once
  // it's gone.
  const provenancePaths: string[] = [];
  const compliancePath = captureComplianceAtSave(projectRoot, slug, process.env);
  if (compliancePath) {
    try {
      const compRelPath = path.relative(projectRoot, compliancePath);
      runGit(['add', compRelPath], { cwd: projectRoot });
      provenancePaths.push(compRelPath);
    } catch { /* capture is non-blocking — a staging failure never fails the save */ }
  }
  const provenancePath = captureProvenanceAtSave(projectRoot, slug, process.env);
  if (provenancePath) {
    try {
      const provRelPath = path.relative(projectRoot, provenancePath);
      runGit(['add', provRelPath], { cwd: projectRoot });
      provenancePaths.push(provRelPath);
    } catch { /* capture is non-blocking — a staging failure never fails the save */ }
  }

  // 8a. Check if there are staged changes (ARTIFACT paths only — never provenance/compliance).
  const diffResult = spawnSync('git', ['diff', '--staged', '--quiet', '--', ...stagedPaths], { cwd: projectRoot });
  if (diffResult.status === 0) {
    // status 0 means no differences — nothing to commit. Un-stage any provenance/
    // compliance we added so a no-work re-validation leaves nothing staged-but-uncommitted.
    if (provenancePaths.length > 0) {
      try { runGit(['reset', '--', ...provenancePaths], { cwd: projectRoot }); } catch { /* */ }
    }
    console.log(chalk.yellow('No changes to save — artifact is already up to date.'));
    process.exit(0);
  }

  // 9. Commit — artifact + provenance + compliance ride the same commit (each only when present).
  const coAuthor = readCoAuthor(projectRoot);

  const prefix = isTracked ? 'Update: ' : '';
  const commitMessage = `[${slug}] ${prefix}${typeInfo.displayName}\n\nCo-authored-by: ${coAuthor}`;
  try {
    const commitResult = spawnSync('git', ['commit', '--no-verify', '-m', commitMessage, '--', ...stagedPaths, ...provenancePaths], { stdio: 'pipe', cwd: projectRoot });
    if (commitResult.status !== 0) throw new Error(commitResult.stderr?.toString() || 'Commit failed');
  } catch (error) {
    console.error(chalk.red(`Error: Commit failed. ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }

  // 10. Push (artifact branch only)
  if (typeInfo.category === 'planning') {
    const pushResult = runGit(['push'], { cwd: projectRoot });
    if (pushResult.exitCode !== 0) {
      console.error(chalk.yellow('Warning: Push failed. Artifact committed locally. Run `git push` manually.'));
      // Don't exit - commit succeeded
    }
  }

  // Push build-verify artifacts to feature branch
  if (typeInfo.category === 'build-verify') {
    const pushResult = runGit(['push'], { cwd: projectRoot });
    if (pushResult.exitCode !== 0) {
      console.error(chalk.yellow(
        'Warning: Push failed. Artifact committed locally. Run `git push` manually.'
      ));
    }
  }

  // 10b. Post-save sweep — remove stale copies from main tree (Layer 2)
  if (typeInfo.category !== 'planning') {
    const mainRoot = getMainTreeRoot(projectRoot);
    if (mainRoot !== projectRoot) {
      const filesToSweep = [relFilePath];
      if (relCompanionPath) filesToSweep.push(relCompanionPath);

      for (const rel of filesToSweep) {
        const mainPath = path.join(mainRoot, rel);
        if (fs.existsSync(mainPath)) {
          // Only remove untracked files
          const isMainTracked = spawnSync('git', ['ls-files', '--error-unmatch', rel], {
            cwd: mainRoot,
            stdio: 'pipe'
          }).status === 0;
          if (!isMainTracked) {
            try {
              fs.unlinkSync(mainPath);
              console.log(chalk.yellow(`  ⚠ Removed stale ${path.basename(rel)} from main tree`));
            } catch {
              // Best-effort — cleanup failure never fails the save
            }
          }
        }
      }
    }
  }

  // 11. Print success
  if (typeInfo.category === 'planning') {
    console.log(chalk.green(`✓ Saved ${typeInfo.displayName} for \`${slug}\` to \`${artifactBranch}\`.`));

    // 11a. Warn about unsaved siblings in the same plan directory
    const planDir = path.join(projectRoot, '.ana', 'plans', 'active', slug);
    if (fs.existsSync(planDir)) {
      const PLANNING_ARTIFACTS = ['scope.md', 'plan.md', 'spec.md', 'contract.yaml'];
      const unsaved: string[] = [];
      for (const name of PLANNING_ARTIFACTS) {
        const filePath = path.join(planDir, name);
        if (fs.existsSync(filePath) && name !== path.basename(typeInfo.fileName)) {
          const lsResult = runGit(['ls-files', '--error-unmatch', path.relative(projectRoot, filePath)], { cwd: projectRoot });
          if (lsResult.exitCode !== 0) {
            unsaved.push(name);
          }
        }
      }
      // Also check for numbered specs (spec-1.md, spec-2.md, etc.)
      try {
        const entries = fs.readdirSync(planDir);
        for (const entry of entries) {
          if (entry.match(/^spec-\d+\.md$/) && entry !== path.basename(typeInfo.fileName)) {
            const filePath = path.join(planDir, entry);
            const lsResult = runGit(['ls-files', '--error-unmatch', path.relative(projectRoot, filePath)], { cwd: projectRoot });
            if (lsResult.exitCode !== 0) {
              unsaved.push(entry);
            }
          }
        }
      } catch { /* readdir failed */ }

      if (unsaved.length > 0) {
        console.log(chalk.yellow(`⚠ ${unsaved.length} unsaved artifact${unsaved.length > 1 ? 's' : ''} in plan directory: ${unsaved.join(', ')}`));
        console.log(chalk.yellow(`  Run \`ana artifact save-all ${slug}\` to save everything.`));
      }
    }
  } else {
    console.log(chalk.green(`✓ Saved ${typeInfo.displayName} for \`${slug}\` on \`${currentBranch}\`.`));
  }
}

/**
 * Save all artifacts in a plan directory atomically
 *
 * @param slug - Work item slug
 */
export function saveAllArtifacts(slug: string): void {
  // 0. Validate slug format
  try {
    validateSlug(slug);
  } catch {
    console.error(chalk.red('Error: Invalid slug format. Use kebab-case: fix-auth-timeout, add-export-csv'));
    process.exit(1);
  }

  const projectRoot = findProjectRoot();
  const planDir = path.join(projectRoot, '.ana/plans/active', slug);

  // 1. Verify plan directory exists
  if (!fs.existsSync(planDir)) {
    console.error(chalk.red(`Error: No active work found for '${slug}'.`));
    console.error(chalk.gray('Run `ana work status` to see active work items.'));
    process.exit(1);
  }

  // 2. Scan for artifacts
  let artifacts: Array<{ file: string; type: string; typeInfo: ArtifactTypeInfo; path: string }> = [];
  const entries = fs.readdirSync(planDir);

  for (const entry of entries) {
    // Match recognized artifact patterns
    let type: string | null = null;

    if (entry === 'plan.md') {
      type = 'plan';
    } else if (entry === 'spec.md') {
      type = 'spec';
    } else if (entry.match(/^spec-\d+\.md$/)) {
      const num = entry.match(/^spec-(\d+)\.md$/)?.[1];
      type = `spec-${num}`;
    } else if (entry === 'contract.yaml') {
      type = 'contract';
    } else if (entry === 'build_report.md') {
      type = 'build-report';
    } else if (entry.match(/^build_report_\d+\.md$/)) {
      const num = entry.match(/^build_report_(\d+)\.md$/)?.[1];
      type = `build-report-${num}`;
    } else if (entry === 'verify_report.md') {
      type = 'verify-report';
    } else if (entry.match(/^verify_report_\d+\.md$/)) {
      const num = entry.match(/^verify_report_(\d+)\.md$/)?.[1];
      type = `verify-report-${num}`;
    }

    if (type) {
      const typeInfo = parseArtifactType(type);
      if (typeInfo) {
        artifacts.push({
          file: entry,
          type,
          typeInfo,
          path: path.join(planDir, entry)
        });
      }
    }
  }

  if (artifacts.length === 0) {
    console.error(chalk.red('Error: No artifacts found in plan directory.'));
    process.exit(1);
  }

  // 3. Validate all artifacts
  for (const artifact of artifacts) {
    if (artifact.typeInfo.baseType === 'plan') {
      const error = validatePlanFormat(artifact.path);
      if (error) {
        console.error(chalk.red(`Error: ${artifact.file} format invalid.\n${error}`));
        console.error(chalk.gray('Fix the validation error and try again.'));
        process.exit(1);
      }
    }

    if (artifact.typeInfo.baseType === 'verify-report') {
      const error = validateVerifyReportFormat(artifact.path);
      if (error) {
        console.error(chalk.red(`Error: ${artifact.file} format invalid.\n${error}`));
        process.exit(1);
      }
      // Verify's own sealed account is the compact marker pasted into the
      // report — nothing to inline, never gated.
    }

    if (artifact.typeInfo.baseType === 'scope') {
      const error = validateScopeFormat(artifact.path);
      if (error) {
        console.error(chalk.red(`Error: ${artifact.file} format invalid.\n${error}`));
        process.exit(1);
      }
    }

    if (artifact.typeInfo.baseType === 'spec') {
      const result = validateSpecFormat(artifact.path);
      if (result.error) {
        console.error(chalk.red(`Error: ${artifact.file} format invalid.\n${result.error}`));
        process.exit(1);
      }
      if (result.warning) {
        console.warn(chalk.yellow(`Warning: ${result.warning}`));
      }
    }

    if (artifact.typeInfo.baseType === 'build-report') {
      const error = validateBuildReportFormat(artifact.path);
      if (error) {
        console.error(chalk.red(`Error: ${artifact.file} format invalid.\n${error}`));
        process.exit(1);
      }
      // Run the present-check capture gate BEFORE the seal hash and staging.
      // Blocks only when the gate is enabled in config AND no well-formed build
      // seal is present. Wiring BOTH save sites is required — saveArtifact and
      // saveAllArtifacts are independent build-report paths.
      applyTestEvidenceGate(artifact.path, projectRoot);
    }

    if (artifact.typeInfo.baseType === 'contract') {
      const errors = validateContractFormat(artifact.path);
      if (errors.length > 0) {
        console.error(chalk.red('Contract validation failed:'));
        for (const error of errors) {
          console.error(chalk.red(`  - ${error}`));
        }
        process.exit(1);
      }
      // Pre-seal scope-coverage gate — mirror of the single-save wiring.
      // Both save paths must run it; no-op on legacy version 1.0 contracts.
      applyCoverageGate(artifact.path);
    }
  }

  // 3a. Companion YAML discovery and validation for report artifacts
  const companions: Array<{ fileName: string; key: string; absPath: string; relPath: string }> = [];
  for (const artifact of artifacts) {
    const companionName = deriveCompanionFileName(artifact.typeInfo.fileName);
    const cKey = deriveCompanionKey(artifact.typeInfo.artifactType);
    if (!companionName || !cKey) continue;

    const cAbsPath = path.join(planDir, companionName);
    const cRelPath = path.relative(projectRoot, cAbsPath);

    if (!fs.existsSync(cAbsPath)) {
      console.error(chalk.red(`Error: ${companionName} not found alongside ${artifact.file}.`));
      console.error(`Foundation 2 requires a structured data companion for ${artifact.typeInfo.baseType === 'verify-report' ? 'verify' : 'build'} reports.`);
      console.error(`Create ${companionName} in .ana/plans/active/${slug}/`);
      process.exit(1);
    }

    const result = artifact.typeInfo.baseType === 'verify-report'
      ? validateVerifyDataFormat(cAbsPath, projectRoot)
      : validateBuildDataFormat(cAbsPath);
    if (result.errors.length > 0) {
      console.error(chalk.red(`Error: ${companionName} validation failed:`));
      for (const error of result.errors) {
        console.error(chalk.red(`  - ${error}`));
      }
      process.exit(1);
    }
    for (const warning of result.warnings) {
      console.warn(chalk.yellow(`Warning: ${companionName} ${warning}`));
    }

    companions.push({ fileName: companionName, key: cKey, absPath: cAbsPath, relPath: cRelPath });
  }

  // 3b. Pre-check for verify-report (contract integrity) — blocks on TAMPERED
  if (artifacts.some(a => a.typeInfo.baseType === 'verify-report')) {
    runPreCheckAndStore(slug, planDir, projectRoot);
  }

  // 3c. Capture modules_touched and run hygiene checks for build-report
  if (artifacts.some(a => a.typeInfo.baseType === 'build-report')) {
    captureModulesTouched(projectRoot, planDir);
    runCommitHygieneChecks(projectRoot, planDir);
  }

  // 3d. Archive previous versions for archivable artifacts and companions (gated on stage transition)
  const archiveRelPaths: string[] = [];
  for (const artifact of artifacts) {
    if (artifact.typeInfo.baseType === 'verify-report' || artifact.typeInfo.baseType === 'build-report') {
      if (hasOpposingStageAdvanced(planDir, artifact.typeInfo.artifactType)) {
        const relPath = path.relative(projectRoot, artifact.path);
        const ap = archivePreviousVersion(projectRoot, relPath, planDir);
        if (ap) archiveRelPaths.push(ap);
      }
    }
  }
  for (const companion of companions) {
    if (hasOpposingStageAdvanced(planDir, companion.key)) {
      const ap = archivePreviousVersion(projectRoot, companion.relPath, planDir);
      if (ap) archiveRelPaths.push(ap);
    }
  }

  // 4. Validate branch — planning artifacts must be on artifact branch
  const artifactBranch = readArtifactBranch(projectRoot);
  const currentBranch = getCurrentBranch();

  // When on a non-artifact branch (e.g., in a worktree), filter to
  // build-verify category only. Planning artifacts from the branch point
  // are inherited but shouldn't trigger the branch check.
  if (currentBranch && currentBranch !== artifactBranch) {
    const buildVerifyOnly = artifacts.filter(a => a.typeInfo.category === 'build-verify');
    if (buildVerifyOnly.length === 0 && artifacts.length > 0) {
      console.error(chalk.red(`Error: Planning artifacts must be saved on \`${artifactBranch}\`. You're on \`${currentBranch}\`.`));
      console.error(chalk.gray(`Run: git checkout ${artifactBranch} && git pull`));
      process.exit(1);
    }
    // Replace artifacts list with only build-verify items
    if (buildVerifyOnly.length < artifacts.length) {
      artifacts = buildVerifyOnly;
    }
  }

  // 5. Read coAuthor
  const coAuthor = readCoAuthor(projectRoot);

  // 5. Check if any artifacts are new (for create vs update message)
  const artifactPaths = artifacts.map(a => path.relative(projectRoot, a.path));
  const trackedStatus = artifactPaths.map(p => {
    return spawnSync('git', ['ls-files', '--error-unmatch', p], {
      cwd: projectRoot,
      stdio: 'pipe'
    }).status === 0;
  });
  const allTracked = trackedStatus.every(t => t);

  // 6. Stage all artifacts
  const stagedPaths: string[] = [];
  try {
    for (const artifactPath of artifactPaths) {
      runGit(['add', artifactPath], { cwd: projectRoot });
      stagedPaths.push(artifactPath);
    }

    // Stage companion YAMLs alongside their reports
    for (const companion of companions) {
      runGit(['add', companion.relPath], { cwd: projectRoot });
      stagedPaths.push(companion.relPath);
    }

    // Stage archive files alongside new artifacts
    for (const archivePath of archiveRelPaths) {
      runGit(['add', archivePath], { cwd: projectRoot });
      stagedPaths.push(archivePath);
    }

    // Clean up orphaned artifacts — files tracked in git but no longer on disk
    // (e.g., Plan restructured from spec-1.md + spec-2.md to spec.md)
    const artifactPattern = /^(scope|plan|spec(-\d+)?|contract|build_report(_\d+)?|verify_report(_\d+)?)\.(md|yaml)$/;
    const trackedFiles = runGit(['ls-files'], { cwd: planDir }).stdout.split('\n').filter(Boolean);
    const diskFiles = new Set(entries);
    for (const tracked of trackedFiles) {
      if (artifactPattern.test(tracked) && !diskFiles.has(tracked)) {
        const orphanRelPath = path.relative(projectRoot, path.join(planDir, tracked));
        runGit(['rm', orphanRelPath], { cwd: projectRoot });
        stagedPaths.push(orphanRelPath);
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error: Failed to stage files. ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }

  // 7b. Write .saves.json and stage it alongside artifacts (before no-changes check).
  // With idempotent writeSaveMetadata, unchanged artifacts produce no .saves.json diff.
  for (const artifact of artifacts) {
    const content = fs.readFileSync(artifact.path, 'utf-8');
    const isArtifactArchivable = artifact.typeInfo.baseType === 'verify-report' || artifact.typeInfo.baseType === 'build-report';
    const gate = isArtifactArchivable
      ? { gateOnStageTransition: { slugDir: planDir, artifactType: artifact.typeInfo.artifactType } }
      : undefined;
    writeSaveMetadata(planDir, artifact.typeInfo.artifactType, content, gate);
  }

  // Write companion hashes alongside report hashes
  for (const companion of companions) {
    const content = fs.readFileSync(companion.absPath, 'utf-8');
    const companionGate = { gateOnStageTransition: { slugDir: planDir, artifactType: companion.key } };
    writeSaveMetadata(planDir, companion.key, content, companionGate);
  }
  const savesPathAll = path.join(planDir, '.saves.json');
  if (fs.existsSync(savesPathAll)) {
    try {
      const savesRelPathAll = path.relative(projectRoot, savesPathAll);
      runGit(['add', savesRelPathAll], { cwd: projectRoot });
      stagedPaths.push(savesRelPathAll);
    } catch { /* */ }
  }

  // 6a. Capture this session's provenance + behavioral compliance (capture v2).
  // Same contract as the single-save site: both total/never-throws, staged into a
  // SEPARATE list kept out of the no-changes guard, folded into the commit only
  // when artifacts changed. Compliance runs BEFORE provenance (provenance consumes
  // the pending pointer; Codex has no env fallback once it's gone).
  const provenancePaths: string[] = [];
  const compliancePath = captureComplianceAtSave(projectRoot, slug, process.env);
  if (compliancePath) {
    try {
      const compRelPath = path.relative(projectRoot, compliancePath);
      runGit(['add', compRelPath], { cwd: projectRoot });
      provenancePaths.push(compRelPath);
    } catch { /* capture is non-blocking — a staging failure never fails the save */ }
  }
  const provenancePath = captureProvenanceAtSave(projectRoot, slug, process.env);
  if (provenancePath) {
    try {
      const provRelPath = path.relative(projectRoot, provenancePath);
      runGit(['add', provRelPath], { cwd: projectRoot });
      provenancePaths.push(provRelPath);
    } catch { /* capture is non-blocking — a staging failure never fails the save */ }
  }

  // 7. Check if there are staged changes (ARTIFACT paths only — never provenance/compliance).
  const diffResult = spawnSync('git', ['diff', '--staged', '--quiet', '--', ...stagedPaths], { cwd: projectRoot });
  if (diffResult.status === 0) {
    if (provenancePaths.length > 0) {
      try { runGit(['reset', '--', ...provenancePaths], { cwd: projectRoot }); } catch { /* */ }
    }
    console.log(chalk.yellow('No changes to save — artifacts are already up to date.'));
    process.exit(0);
  }

  // 8. Commit — artifacts + provenance + compliance ride the same commit (each only when present).
  const typeNames = artifacts.map(a => a.typeInfo.displayName).join(', ');
  const action = allTracked ? 'Update' : 'Save';
  const commitMessage = `[${slug}] ${action}: ${typeNames}\n\nCo-authored-by: ${coAuthor}`;

  try {
    const commitResult = spawnSync('git', ['commit', '--no-verify', '-m', commitMessage, '--', ...stagedPaths, ...provenancePaths], { stdio: 'pipe', cwd: projectRoot });
    if (commitResult.status !== 0) throw new Error(commitResult.stderr?.toString() || 'Commit failed');
  } catch (error) {
    console.error(chalk.red(`Error: Commit failed. ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }

  // 9. Push (planning artifacts only)
  if (currentBranch === artifactBranch) {
    const pushResult = runGit(['push'], { cwd: projectRoot });
    if (pushResult.exitCode !== 0) {
      console.error(chalk.yellow('Warning: Push failed. Artifacts committed locally. Run `git push` manually.'));
      // Don't exit - commit succeeded
    }
  }

  // Also push if we saved build-verify artifacts on a feature branch
  if (currentBranch !== artifactBranch && artifacts.some(a => a.typeInfo.category === 'build-verify')) {
    const pushResult = runGit(['push'], { cwd: projectRoot });
    if (pushResult.exitCode !== 0) {
      console.error(chalk.yellow(
        'Warning: Push failed. Artifacts committed locally. Run `git push` manually.'
      ));
    }
  }

  // 10. Success message
  console.log(chalk.green(`✓ Saved ${artifacts.length} artifact${artifacts.length > 1 ? 's' : ''} for \`${slug}\``));
  console.log(chalk.gray(`  ${typeNames}`));
}

/**
 * Register the `artifact` command (with `save` and `save-all` sub-commands).
 *
 * @param program - Commander program instance.
 */
export function registerArtifactCommand(program: Command): void {
  const artifactCommand = new Command('artifact')
    .description('Save pipeline outputs with hash verification');

  const saveCommand = new Command('save')
    .description('Commit a pipeline artifact to the correct branch')
    .argument('<type>', 'Artifact type: scope, plan, spec, spec-N, contract, build-report, build-report-N, verify-report, verify-report-N')
    .argument('<slug>', 'Work item slug (e.g., add-status-command)')
    .addHelpText('after', '\nEXAMPLES\n  $ ana artifact save scope my-feature\n  $ ana artifact save-all my-feature')
    .action((type: string, slug: string) => {
      saveArtifact(type, slug);
    });

  const saveAllCommand = new Command('save-all')
    .description('Commit all artifacts in a plan directory atomically')
    .argument('<slug>', 'Work item slug (e.g., add-status-command)')
    .action((slug: string) => {
      saveAllArtifacts(slug);
    });

  artifactCommand.addCommand(saveCommand);
  artifactCommand.addCommand(saveAllCommand);

  program.addCommand(artifactCommand);
}
