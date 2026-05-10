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
import { findProjectRoot, validateSlug } from '../utils/validators.js';
import { readArtifactBranch, readBranchPrefix, getCurrentBranch, readCoAuthor, runGit } from '../utils/git-operations.js';
import { worktreeExists, getWorktreePath, getMainTreeRoot } from '../utils/worktree.js';
import type { ContractSchema } from '../types/contract.js';

/**
 * Save metadata entry for .saves.json
 */
interface SaveMetadata {
  saved_at: string;
  hash: string;
}

/**
 * Write save metadata to .saves.json after artifact commit.
 * Idempotent: if the computed hash matches the existing entry, the write is skipped.
 *
 * @param slugDir - Path to the slug directory
 * @param artifactType - The artifact type key (e.g., 'scope', 'spec', 'contract')
 * @param content - The artifact content for hashing
 * @returns true if metadata was written, false if skipped (hash unchanged)
 */
function writeSaveMetadata(slugDir: string, artifactType: string, content: string): boolean {
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

  // Write entry for this artifact type
  saves[artifactType] = {
    saved_at: new Date().toISOString(),
    hash: fullHash,
  };

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

    const savesPath = path.join(slugDir, '.saves.json');
    let savesData: Record<string, unknown> = {};
    if (fs.existsSync(savesPath)) {
      try { savesData = JSON.parse(fs.readFileSync(savesPath, 'utf-8')); } catch { /* */ }
    }
    savesData['modules_touched'] = modulesList;
    fs.writeFileSync(savesPath, JSON.stringify(savesData, null, 2));
  } catch (err) {
    // @ana A008
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(chalk.yellow(`⚠ Warning: Could not capture modules_touched — saving without it. ${errMsg}`));
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
      if (diskContent === committedContent) return null; // No change
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

  return { category, fileName, displayName, baseType };
}


/**
 * Validate plan.md format
 *
 * @param filePath - Path to plan.md
 * @returns Error message if invalid, null if valid
 */
function validatePlanFormat(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check for ## Phases heading
  if (!content.includes('## Phases')) {
    return "Missing '## Phases' heading. Plan must contain a '## Phases' section with checkbox items.";
  }

  // Check for at least one checkbox
  const checkboxPattern = /- \[([ x])\]/;
  if (!checkboxPattern.test(content)) {
    return "No checkbox items found. Plan must contain at least one '- [ ]' or '- [x]' checkbox.";
  }

  // Check that checkbox lines contain Spec: reference
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue; // noUncheckedIndexedAccess guard
    if (checkboxPattern.test(line)) {
      // Check this line and next 2 lines for Spec: reference
      const nextLines = lines.slice(i, i + 3).join('\n');
      if (!nextLines.includes('Spec:')) {
        return `Checkbox item "${line.trim()}" is missing a 'Spec:' reference. Each phase must reference its spec file.`;
      }
    }
  }

  return null; // valid
}

/**
 * Validate verify report format
 *
 * @param filePath - Path to verify_report.md
 * @returns Error message if invalid, null if valid
 */
function validateVerifyReportFormat(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Check first 10 lines for Result line
  const firstTenLines = lines.slice(0, 10).join('\n');
  const resultPattern = /\*\*Result:\*\*\s*(PASS|FAIL)/i;

  if (!resultPattern.test(firstTenLines)) {
    return "Missing '**Result:** PASS' or '**Result:** FAIL' in the first 10 lines.\nThe Result line is machine-parsed by the pipeline. It must be present.";
  }

  return null; // valid
}

/**
 * Validate scope format
 *
 * @param filePath - Path to scope.md
 * @returns Error message if invalid, null if valid
 */
function validateScopeFormat(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check for at least 3 acceptance criteria
  const acPattern = /^-\s+(AC\d+|##?\s*AC|\*\*AC)/mi;
  const acMatches = content.match(new RegExp(acPattern.source, 'gmi'));
  if (!acMatches || acMatches.length < 3) {
    return "Missing acceptance criteria. Scope must contain at least 3 acceptance criteria (lines starting with '- AC').";
  }

  // Check for Structural Analog section
  if (!content.match(/###?\s+Structural\s+Analog/i)) {
    return "Missing 'Structural Analog' section. Every scope needs a structural analog to guide implementation.";
  }

  // Check for Intent section with content
  if (!content.match(/###?\s+Intent/i)) {
    return "Missing 'Intent' section. Scope must explain the purpose of this work.";
  }

  // Extract content between Intent heading and next section
  const lines = content.split('\n');
  let inIntent = false;
  const intentLines: string[] = [];
  for (const line of lines) {
    if (/^##\s+Intent/i.test(line)) {
      inIntent = true;
      continue;
    }
    if (inIntent) {
      if (/^##/.test(line)) break; // Next section starts
      intentLines.push(line);
    }
  }
  const intentContent = intentLines.join('\n').trim();
  if (!intentContent) {
    return "Empty 'Intent' section. Scope must explain the purpose of this work.";
  }

  // Check for Complexity Assessment section
  if (!content.match(/##\s+Complexity\s+Assessment/i)) {
    return "Missing 'Complexity Assessment' section. Every scope needs a complexity assessment.";
  }

  // Check for Kind field (strict — exact match only)
  const kindMatch = content.match(/\*\*Kind:\*\*\s*(.+)/);
  if (!kindMatch || !kindMatch[1]) {
    return "Missing 'Kind' field in Complexity Assessment. Add: **Kind:** feature / fix / chore";
  }
  const kindRaw = kindMatch[1].trim().toLowerCase();
  if (kindRaw !== 'feature' && kindRaw !== 'fix' && kindRaw !== 'chore') {
    return `Kind must be exactly one of: feature, fix, chore. Got: '${kindMatch[1].trim()}'`;
  }

  // Check for Size field (lenient — first valid token)
  const sizeMatch = content.match(/\*\*Size:\*\*\s*(.+)/);
  if (!sizeMatch || !sizeMatch[1]) {
    return "Missing 'Size' field in Complexity Assessment. Add: **Size:** small / medium / large";
  }
  const sizeValue = sizeMatch[1].trim();
  if (!/^(small|medium|large)\b/i.test(sizeValue)) {
    return `Size must start with one of: small, medium, large. Got: '${sizeValue}'`;
  }

  // Check for Multi-phase field (lenient — first valid token)
  const multiMatch = content.match(/\*\*Multi-phase:\*\*\s*(.+)/);
  if (!multiMatch || !multiMatch[1]) {
    return "Missing 'Multi-phase' field in Complexity Assessment. Add: **Multi-phase:** yes / no";
  }
  const multiValue = multiMatch[1].trim();
  if (!/^(yes|no)\b/i.test(multiValue)) {
    return `Multi-phase must start with one of: yes, no. Got: '${multiValue}'`;
  }

  // Check for Approach section with content
  if (!content.match(/##\s+Approach\s*$/im)) {
    return "Missing 'Approach' section. Scope must describe the strategic direction.";
  }

  const approachLines: string[] = [];
  let inApproach = false;
  for (const line of lines) {
    if (/^##\s+Approach\s*$/i.test(line)) {
      inApproach = true;
      continue;
    }
    if (inApproach) {
      if (/^##/.test(line)) break;
      approachLines.push(line);
    }
  }
  const approachContent = approachLines.join('\n').trim();
  if (!approachContent) {
    return "Empty 'Approach' section. Scope must describe the strategic direction.";
  }

  // Check for Edge Cases section
  if (!content.match(/##\s+Edge\s+Cases/i)) {
    return "Missing 'Edge Cases' section. Scope must identify edge cases and risks.";
  }

  return null; // valid
}

/**
 * Validate spec format
 *
 * @param filePath - Path to spec.md or spec-N.md
 * @returns Error message if invalid, null if valid, or warning string for non-blocking issues
 */
function validateSpecFormat(filePath: string): { error?: string; warning?: string } {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Note: file_changes has moved to contract.yaml in S8 — no longer required in spec

  // Check for Build Brief section
  if (!content.match(/###?\s+Build\s+Brief/i)) {
    return { error: "Missing 'Build Brief' section. Spec must include build guidance for the implementer." };
  }

  // Check for approximate baseline (warning only)
  const baselinePattern = /(Current\s+test|Current\s+tests)/i;
  const hasBaseline = baselinePattern.test(content);
  if (hasBaseline) {
    const approximatePattern = /[~]|approx/i;
    const lines = content.split('\n');
    for (const line of lines) {
      if (baselinePattern.test(line) && approximatePattern.test(line)) {
        return { warning: "Build baseline contains approximations (~). Run the test command to get exact counts." };
      }
    }
  }

  return {}; // valid
}


/**
 * Valid matchers for contract assertions
 */
const VALID_MATCHERS = ['equals', 'exists', 'contains', 'greater', 'truthy', 'not_equals', 'not_contains'];
const VALUE_REQUIRED_MATCHERS = ['equals', 'contains', 'greater', 'not_equals', 'not_contains'];

// ContractAssertion, ContractFileChange, ContractSchema imported from types/contract.ts

/**
 * Validate contract format
 *
 * @param filePath - Path to contract.yaml
 * @returns Array of error messages, empty if valid
 */
function validateContractFormat(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const errors: string[] = [];

  // 1. Parse YAML
  let contract: ContractSchema;
  try {
    contract = yaml.parse(content);
  } catch (e) {
    return [`YAML parse error: ${e instanceof Error ? e.message : 'Invalid YAML'}`];
  }

  if (!contract || typeof contract !== 'object') {
    return ['Contract must be a YAML object'];
  }

  // 2. Header fields
  if (!contract.version) {
    errors.push('Missing "version" field');
  }
  if (!contract.sealed_by) {
    errors.push('Missing "sealed_by" field');
  }
  if (!contract.feature || typeof contract.feature !== 'string' || !contract.feature.trim()) {
    errors.push('Missing or empty "feature" field');
  }

  // 3. Assertions array
  if (!contract.assertions) {
    errors.push('Missing "assertions" array');
  } else if (!Array.isArray(contract.assertions)) {
    errors.push('"assertions" must be an array');
  } else if (contract.assertions.length === 0) {
    errors.push('"assertions" array cannot be empty');
  } else {
    // Track IDs for uniqueness check
    const seenIds = new Set<string>();

    for (let i = 0; i < contract.assertions.length; i++) {
      const assertion = contract.assertions[i];
      if (!assertion) continue; // noUncheckedIndexedAccess guard
      const prefix = assertion.id ? `Assertion ${assertion.id}` : `Assertion ${i + 1}`;

      // Required fields
      if (!assertion.id || typeof assertion.id !== 'string') {
        errors.push(`${prefix}: missing or invalid "id" field`);
      } else {
        if (seenIds.has(assertion.id)) {
          errors.push(`Duplicate assertion ID: ${assertion.id}`);
        }
        seenIds.add(assertion.id);
      }

      if (!assertion.says || typeof assertion.says !== 'string' || !assertion.says.trim()) {
        errors.push(`${prefix}: missing or empty "says" field`);
      }

      if (!assertion.block || typeof assertion.block !== 'string') {
        errors.push(`${prefix}: missing "block" field`);
      }

      if (!assertion.target || typeof assertion.target !== 'string') {
        errors.push(`${prefix}: missing "target" field`);
      }

      // Matcher validation
      if (!assertion.matcher) {
        errors.push(`${prefix}: missing "matcher" field`);
      } else if (!VALID_MATCHERS.includes(assertion.matcher)) {
        errors.push(`${prefix}: unknown matcher "${assertion.matcher}" (valid: ${VALID_MATCHERS.join(', ')})`);
      } else if (VALUE_REQUIRED_MATCHERS.includes(assertion.matcher) && assertion.value === undefined) {
        errors.push(`${prefix}: matcher "${assertion.matcher}" requires "value" field`);
      }
    }
  }

  // 4. File changes
  if (!contract.file_changes) {
    errors.push('Missing "file_changes" array');
  } else if (!Array.isArray(contract.file_changes)) {
    errors.push('"file_changes" must be an array');
  } else if (contract.file_changes.length === 0) {
    errors.push('"file_changes" array cannot be empty');
  } else {
    const validActions = ['create', 'modify', 'delete'];
    for (let i = 0; i < contract.file_changes.length; i++) {
      const change = contract.file_changes[i];
      if (!change) continue; // noUncheckedIndexedAccess guard
      const prefix = `file_changes[${i}]`;

      if (!change.path || typeof change.path !== 'string') {
        errors.push(`${prefix}: missing "path" field`);
      }

      if (!change.action || !validActions.includes(change.action)) {
        errors.push(`${prefix}: invalid "action" (must be: ${validActions.join(', ')})`);
      }
    }
  }

  return errors;
}

/**
 * Companion YAML schema for verify_data.yaml
 */
interface VerifyDataSchema {
  schema?: unknown;
  findings?: unknown;
  [key: string]: unknown;
}

/**
 * Companion YAML schema for build_data.yaml
 */
interface BuildDataSchema {
  schema?: unknown;
  concerns?: unknown;
  [key: string]: unknown;
}

/**
 * Valid finding categories for verify_data.yaml
 */
const VALID_FINDING_CATEGORIES = ['code', 'test', 'upstream'];
const VALID_FINDING_SEVERITIES = ['risk', 'debt', 'observation'];
const VALID_FINDING_ACTIONS = ['promote', 'scope', 'monitor', 'accept'];

/**
 * Validate verify_data.yaml companion format.
 *
 * Follows the validateContractFormat error-accumulation pattern:
 * YAML parse → required field checks → enum validation → error array return.
 * Warnings (file existence, missing file on non-upstream) are emitted via
 * the returned warnings array but do not block the save.
 *
 * @param filePath - Path to verify_data.yaml
 * @param projectRoot - Project root for file existence checks
 * @returns Object with errors (block save) and warnings (emit but proceed)
 */
export function validateVerifyDataFormat(filePath: string, projectRoot?: string): { errors: string[]; warnings: string[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const errors: string[] = [];
  const warnings: string[] = [];

  let data: VerifyDataSchema;
  try {
    data = yaml.parse(content);
  } catch (e) {
    return { errors: [`YAML parse error: ${e instanceof Error ? e.message : 'Invalid YAML'}`], warnings: [] };
  }

  if (!data || typeof data !== 'object') {
    return { errors: ['verify_data.yaml must be a YAML object'], warnings: [] };
  }

  // schema field must equal 1
  if (data.schema === undefined || data.schema === null) {
    errors.push('Missing "schema" field');
  } else if (data.schema !== 1) {
    errors.push(`Invalid "schema" value: ${data.schema} (expected: 1)`);
  }

  // findings must be an array
  if (!data.findings) {
    errors.push('Missing "findings" field');
  } else if (!Array.isArray(data.findings)) {
    errors.push('"findings" must be an array');
  } else {
    for (let i = 0; i < data.findings.length; i++) {
      const finding = data.findings[i] as Record<string, unknown> | undefined;
      if (!finding) continue;
      const prefix = `Finding ${i + 1}`;

      const cat = finding['category'];
      const summary = finding['summary'];
      const sev = finding['severity'];
      const ra = finding['related_assertions'];
      const file = finding['file'];

      // category required, must be one of known values
      if (!cat || typeof cat !== 'string') {
        errors.push(`${prefix}: missing "category" field`);
      } else if (!VALID_FINDING_CATEGORIES.includes(cat)) {
        errors.push(`${prefix}: invalid category "${cat}" (valid: ${VALID_FINDING_CATEGORIES.join(', ')})`);
      }

      // summary required, non-empty string
      if (!summary || typeof summary !== 'string' || !summary.trim()) {
        errors.push(`${prefix}: missing "summary" field`);
      }

      // severity required, must be valid
      if (sev === undefined || sev === null) {
        errors.push(`${prefix}: missing "severity" field`);
      } else if (typeof sev !== 'string' || !VALID_FINDING_SEVERITIES.includes(sev)) {
        errors.push(`${prefix}: invalid severity "${sev}" (valid: ${VALID_FINDING_SEVERITIES.join(', ')})`);
      }

      // suggested_action required, must be valid
      const action = finding['suggested_action'];
      if (action === undefined || action === null) {
        errors.push(`${prefix}: missing "suggested_action" field`);
      } else if (typeof action !== 'string' || !VALID_FINDING_ACTIONS.includes(action)) {
        errors.push(`${prefix}: invalid suggested_action "${action}" (valid: ${VALID_FINDING_ACTIONS.join(', ')})`);
      }

      // related_assertions optional, but if present must be array of strings
      if (ra !== undefined) {
        if (!Array.isArray(ra)) {
          errors.push(`${prefix}: "related_assertions" must be an array`);
        } else {
          for (const item of ra) {
            if (typeof item !== 'string') {
              errors.push(`${prefix}: "related_assertions" elements must be strings`);
              break;
            }
          }
        }
      }

      // file warnings (non-blocking)
      if (file && typeof file === 'string' && projectRoot) {
        if (!fs.existsSync(path.join(projectRoot, file))) {
          warnings.push(`Finding ${i + 1} references "${file}" which does not exist.`);
        }
      } else if (!file && cat !== 'upstream' && typeof cat === 'string') {
        warnings.push(`Finding ${i + 1} (category: ${cat}) has no file reference.`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Validate build_data.yaml companion format.
 *
 * @param filePath - Path to build_data.yaml
 * @returns Object with errors (block save) and warnings (emit but proceed)
 */
export function validateBuildDataFormat(filePath: string): { errors: string[]; warnings: string[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const errors: string[] = [];
  const warnings: string[] = [];

  let data: BuildDataSchema;
  try {
    data = yaml.parse(content);
  } catch (e) {
    return { errors: [`YAML parse error: ${e instanceof Error ? e.message : 'Invalid YAML'}`], warnings: [] };
  }

  if (!data || typeof data !== 'object') {
    return { errors: ['build_data.yaml must be a YAML object'], warnings: [] };
  }

  if (data.schema === undefined || data.schema === null) {
    errors.push('Missing "schema" field');
  } else if (data.schema !== 1) {
    errors.push(`Invalid "schema" value: ${data.schema} (expected: 1)`);
  }

  if (!data.concerns) {
    errors.push('Missing "concerns" field');
  } else if (!Array.isArray(data.concerns)) {
    errors.push('"concerns" must be an array');
  } else {
    for (let i = 0; i < data.concerns.length; i++) {
      const concern = data.concerns[i] as Record<string, unknown> | undefined;
      if (!concern) continue;
      const prefix = `Concern ${i + 1}`;
      const summary = concern['summary'];

      if (!summary || typeof summary !== 'string' || !summary.trim()) {
        errors.push(`${prefix}: missing "summary" field`);
      }

      // severity required, must be valid
      const sev = concern['severity'];
      if (sev === undefined || sev === null) {
        errors.push(`${prefix}: missing "severity" field`);
      } else if (typeof sev !== 'string' || !VALID_FINDING_SEVERITIES.includes(sev)) {
        errors.push(`${prefix}: invalid severity "${sev}" (valid: ${VALID_FINDING_SEVERITIES.join(', ')})`);
      }

      // suggested_action required, must be valid
      const action = concern['suggested_action'];
      if (action === undefined || action === null) {
        errors.push(`${prefix}: missing "suggested_action" field`);
      } else if (typeof action !== 'string' || !VALID_FINDING_ACTIONS.includes(action)) {
        errors.push(`${prefix}: invalid suggested_action "${action}" (valid: ${VALID_FINDING_ACTIONS.join(', ')})`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Validate build report format
 *
 * @param filePath - Path to build_report.md or build_report_N.md
 * @returns Error message if invalid, null if valid
 */
function validateBuildReportFormat(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check for required sections
  const requiredSections = [
    { pattern: /###?\s+Deviation/i, name: 'Deviations' },
    { pattern: /###?\s+Open\s+Issue/i, name: 'Open Issues' },
    { pattern: /###?\s+(Acceptance\s+Criteria|AC\s+Coverage|Criteria\s+Coverage)/i, name: 'AC Coverage' },
    { pattern: /###?\s+PR\s+Summary/i, name: 'PR Summary' }
  ];

  for (const section of requiredSections) {
    if (!section.pattern.test(content)) {
      return `Missing '${section.name}' section. Build report must document all required sections.`;
    }
  }

  return null; // valid
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
 * Derive the companion artifact key for .saves.json from the report baseType.
 *
 * @param baseType - "verify-report" or "build-report"
 * @returns "verify-data" or "build-data", or null
 */
function deriveCompanionKey(baseType: string): string | null {
  if (baseType === 'verify-report') return 'verify-data';
  if (baseType === 'build-report') return 'build-data';
  return null;
}

/**
 * Validate that we're on the correct branch for this artifact type
 *
 * @param typeInfo - Parsed artifact type information
 * @param currentBranch - Current git branch
 * @param artifactBranch - Configured artifact branch from ana.json
 * @param slug - Work item slug
 * @param branchPrefix - Configured branch prefix
 */
function validateBranch(
  typeInfo: ArtifactTypeInfo,
  currentBranch: string,
  artifactBranch: string,
  slug: string,
  branchPrefix: string
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
        console.error(chalk.gray(`  git checkout ${branchPrefix}${slug}`));
      }
      process.exit(1);
    }
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
  const typeInfo = parseArtifactType(type);
  if (!typeInfo) {
    console.error(chalk.red(`Error: Unknown artifact type \`${type}\`.`));
    console.error(chalk.gray('Valid types: scope, plan, spec, spec-N, contract, build-report, build-report-N, verify-report, verify-report-N'));
    process.exit(1);
  }

  // 2. Resolve project root early — needed for readArtifactBranch and throughout
  const projectRoot = findProjectRoot();

  // 3. Read artifactBranch and branchPrefix from ana.json
  const artifactBranch = readArtifactBranch(projectRoot);
  const branchPrefix = readBranchPrefix(projectRoot);

  // 4. Get current branch
  const currentBranch = getCurrentBranch();
  if (!currentBranch) {
    console.error(chalk.red('Error: Not a git repository. `ana artifact save` requires git.'));
    process.exit(1);
  }

  // 5. Validate branch
  validateBranch(typeInfo, currentBranch, artifactBranch, slug, branchPrefix);

  // 6. Resolve file path (relative to projectRoot for git, absolute for fs)
  const relFilePath = path.join('.ana', 'plans', 'active', slug, typeInfo.fileName);
  let filePath = path.join(projectRoot, relFilePath);

  // 6a. Auto-rename fallback for multi-spec: if build_report_1.md doesn't exist
  // but build_report.md does, rename it. Same for verify_report. Build agents
  // commonly write the default filename instead of the phase-numbered one.
  const isNumbered = typeInfo.fileName.match(/_\d+\.md$/);
  if (!fs.existsSync(filePath) && isNumbered) {
    const defaultName = typeInfo.baseType === 'build-report' ? 'build_report.md'
      : typeInfo.baseType === 'verify-report' ? 'verify_report.md' : null;
    if (defaultName) {
      const defaultPath = path.join(projectRoot, '.ana', 'plans', 'active', slug, defaultName);
      if (fs.existsSync(defaultPath)) {
        fs.renameSync(defaultPath, filePath);
        console.log(chalk.gray(`Renamed ${defaultName} → ${typeInfo.fileName}`));
      }
    }
  }

  // 6b-pre. Archive previous version for archivable types (before file-exists check)
  const archiveRelPaths: string[] = [];
  const isArchivable = typeInfo.baseType === 'verify-report' || typeInfo.baseType === 'build-report';
  if (isArchivable) {
    const slugDir = path.join(projectRoot, '.ana', 'plans', 'active', slug);
    const archivePath = archivePreviousVersion(projectRoot, relFilePath, slugDir);
    if (archivePath) archiveRelPaths.push(archivePath);
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

    // Auto pre-check for contract mode
    const slugDir = path.join(projectRoot, '.ana', 'plans', 'active', slug);
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
  }

  // 6b. Companion YAML discovery and validation (verify-report / build-report)
  const companionFileName = deriveCompanionFileName(typeInfo.fileName);
  const companionKey = deriveCompanionKey(typeInfo.baseType);
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

    // Archive companion if it has a committed version
    if (isArchivable && relCompanionPath) {
      const slugDir = path.join(projectRoot, '.ana', 'plans', 'active', slug);
      const companionArchivePath = archivePreviousVersion(projectRoot, relCompanionPath, slugDir);
      if (companionArchivePath) archiveRelPaths.push(companionArchivePath);
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

    // Special case: verify-report also stages plan.md if it exists
    if (type.startsWith('verify-report')) {
      const relPlanPath = path.join('.ana', 'plans', 'active', slug, 'plan.md');
      if (fs.existsSync(path.join(projectRoot, relPlanPath))) {
        runGit(['add', relPlanPath], { cwd: projectRoot });
        stagedPaths.push(relPlanPath);
      }
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
  writeSaveMetadata(slugDir, typeInfo.baseType, artifactContent);

  // Write companion hash alongside report hash
  if (companionPath && companionKey && fs.existsSync(companionPath)) {
    const companionContent = fs.readFileSync(companionPath, 'utf-8');
    writeSaveMetadata(slugDir, companionKey, companionContent);
  }

  // Capture modules_touched at build-report time (when the feature branch
  // definitely exists and all code is committed).
  if (typeInfo.baseType === 'build-report') {
    captureModulesTouched(projectRoot, slugDir);
  }

  const savesPath = path.join(slugDir, '.saves.json');
  if (fs.existsSync(savesPath)) {
    try {
      const savesRelPath = path.relative(projectRoot, savesPath);
      runGit(['add', savesRelPath], { cwd: projectRoot });
      stagedPaths.push(savesRelPath);
    } catch { /* */ }
  }

  // 8a. Check if there are staged changes
  const diffResult = spawnSync('git', ['diff', '--staged', '--quiet', '--', ...stagedPaths], { cwd: projectRoot });
  if (diffResult.status === 0) {
    // status 0 means no differences — nothing to commit
    console.log(chalk.yellow('No changes to save — artifact is already up to date.'));
    process.exit(0);
  }

  // 9. Commit
  const coAuthor = readCoAuthor(projectRoot);

  const prefix = isTracked ? 'Update: ' : '';
  const commitMessage = `[${slug}] ${prefix}${typeInfo.displayName}\n\nCo-authored-by: ${coAuthor}`;
  try {
    const commitResult = spawnSync('git', ['commit', '-m', commitMessage, '--', ...stagedPaths], { stdio: 'pipe', cwd: projectRoot });
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
    }
  }

  // 3a. Companion YAML discovery and validation for report artifacts
  const companions: Array<{ fileName: string; key: string; absPath: string; relPath: string }> = [];
  for (const artifact of artifacts) {
    const companionName = deriveCompanionFileName(artifact.typeInfo.fileName);
    const cKey = deriveCompanionKey(artifact.typeInfo.baseType);
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

  // 3c. Capture modules_touched for build-report
  if (artifacts.some(a => a.typeInfo.baseType === 'build-report')) {
    captureModulesTouched(projectRoot, planDir);
  }

  // 3d. Archive previous versions for archivable artifacts and companions
  const archiveRelPaths: string[] = [];
  for (const artifact of artifacts) {
    if (artifact.typeInfo.baseType === 'verify-report' || artifact.typeInfo.baseType === 'build-report') {
      const relPath = path.relative(projectRoot, artifact.path);
      const ap = archivePreviousVersion(projectRoot, relPath, planDir);
      if (ap) archiveRelPaths.push(ap);
    }
  }
  for (const companion of companions) {
    const ap = archivePreviousVersion(projectRoot, companion.relPath, planDir);
    if (ap) archiveRelPaths.push(ap);
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

    // Special case: if verify-report exists, also stage plan.md
    if (artifacts.some(a => a.typeInfo.baseType === 'verify-report')) {
      const planPath = path.join(planDir, 'plan.md');
      const relPlanPath = path.relative(projectRoot, planPath);
      if (fs.existsSync(planPath) && !artifactPaths.includes(relPlanPath)) {
        runGit(['add', planPath], { cwd: projectRoot });
        stagedPaths.push(relPlanPath);
      }
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
    writeSaveMetadata(planDir, artifact.typeInfo.baseType, content);
  }

  // Write companion hashes alongside report hashes
  for (const companion of companions) {
    const content = fs.readFileSync(companion.absPath, 'utf-8');
    writeSaveMetadata(planDir, companion.key, content);
  }
  const savesPathAll = path.join(planDir, '.saves.json');
  if (fs.existsSync(savesPathAll)) {
    try {
      const savesRelPathAll = path.relative(projectRoot, savesPathAll);
      runGit(['add', savesRelPathAll], { cwd: projectRoot });
      stagedPaths.push(savesRelPathAll);
    } catch { /* */ }
  }

  // 7. Check if there are staged changes
  const diffResult = spawnSync('git', ['diff', '--staged', '--quiet', '--', ...stagedPaths], { cwd: projectRoot });
  if (diffResult.status === 0) {
    console.log(chalk.yellow('No changes to save — artifacts are already up to date.'));
    process.exit(0);
  }

  // 8. Commit
  const typeNames = artifacts.map(a => a.typeInfo.displayName).join(', ');
  const action = allTracked ? 'Update' : 'Save';
  const commitMessage = `[${slug}] ${action}: ${typeNames}\n\nCo-authored-by: ${coAuthor}`;

  try {
    const commitResult = spawnSync('git', ['commit', '-m', commitMessage, '--', ...stagedPaths], { stdio: 'pipe', cwd: projectRoot });
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
