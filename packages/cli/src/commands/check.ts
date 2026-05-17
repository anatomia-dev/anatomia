/**
 * ana setup check - Project health dashboard
 *
 * Usage:
 *   ana setup check                          ✓/○/✗ dashboard (default)
 *   ana setup check project-context.md       Single file detail
 *   ana setup check --json                   JSON output (context files)
 *
 * Exit codes:
 *   0 - All checks pass (no ✗)
 *   1 - One or more ✗ found
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { ZodError } from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { SymbolEntry, SymbolIndex } from '../types/symbol-index.js';
import { CONTEXT_FILES, CORE_SKILLS } from '../constants.js';
import { parseEngineResultPartial } from '../engine/types/engineResult-partial.js';
import { AnaJsonSchema, type AnaJson } from './init/anaJsonSchema.js';
import { findProjectRoot } from '../utils/validators.js';
import { checkScanFreshness } from '../utils/scan-freshness.js';

/**
 * The 6 canonical sections of project-context.md.
 *
 * Single source of truth for the project-context schema. Consumed by:
 *   - FILE_CONFIGS below (single-file validation)
 *   - countPopulatedContextSections (dashboard per-section count)
 *   - validateSetupCompletion (setup complete check)
 *
 * Previously duplicated at FILE_CONFIGS['project-context'].expectedSections
 * and inside validateSetupCompletion. Adding a section required updating
 * both places; a later review caught the drift.
 */
const PROJECT_CONTEXT_SECTIONS = [
  'What This Project Does',
  'Architecture',
  'Key Decisions',
  'Key Files',
  'Active Constraints',
  'Domain Vocabulary',
] as const;

/** Per-file configuration for structural validation (no line counts) */
interface FileConfig {
  expectedSections: readonly string[];
}

/** File configurations indexed by filename (without .md) */
const FILE_CONFIGS: Record<string, FileConfig> = {
  'project-context': {
    expectedSections: PROJECT_CONTEXT_SECTIONS,
  },
  'design-principles': {
    expectedSections: [], // Optional content — any non-template content is valid
  },
};

/** All context files to check (derived from CONTEXT_FILES in constants.ts) */
const ALL_CONTEXT_FILES = CONTEXT_FILES.map(f => `${f}.md`);

/** Placeholder patterns to detect (case-insensitive) */
const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bPLACEHOLDER\b/i,
  /\bTBD\b/i,
  /\bFIXME\b/i,
  /\[INSERT/i,
  /\[ADD/i,
  /\[FILL/i,
  /Not yet captured/i,
];

/** Citation regex patterns — match various formats the writer uses
 *
 * These patterns are intentionally strict to avoid false positives:
 * - First pattern: requires trailing colon (code block follows) OR line numbers
 * - Second pattern: parenthetical format, requires line numbers
 *
 * Casual mentions like "see `.ana/`" or "run `git status`" are NOT citations.
 */
const CITATION_PATTERNS = [
  // "Example from `file` (lines X-Y):" or "From `file`:" (colon required if no line numbers)
  /(?:Example |From |from )`([^`]+)` \(lines? (\d+)(?:-(\d+))?\)/g,
  /(?:Example |From |from )`([^`]+)`:/g,
  // "(from `file`, lines X-Y)" - parenthetical format, line numbers required
  /\(from `([^`]+)`,? lines? (\d+)(?:-(\d+))?\)/g,
];

/** Result types for JSON output */
interface LineCountResult {
  actual: number;
  minimum: number;
  maximum: number;
  pass: boolean;
}

interface HeadersResult {
  actual: number;
  expected: number;
  pass: boolean;
  duplicates: string[];
}

interface PlaceholdersResult {
  count: number;
  markers: string[];
  pass: boolean;
}

interface ScaffoldMarkersResult {
  count: number;
  pass: boolean;
}

interface FailedCitation {
  claim: string;
  file: string;
  reason: string;
}

interface CitationsResult {
  total: number;
  verified: number;
  failed: FailedCitation[];
  pass: boolean;
  verification_level: 'full' | 'file-only';
}

interface FileCheckResult {
  file: string;
  line_count: LineCountResult;
  headers: HeadersResult;
  placeholders: PlaceholdersResult;
  scaffold_markers: ScaffoldMarkersResult;
  citations: CitationsResult;
  overall: boolean;
}

interface AllFilesResult {
  files: FileCheckResult[];
  overall: boolean;
}

/**
 * Check line count for a file (no volumetric validation)
 *
 * Line counts are informational only. Always passes.
 *
 * @param content - File content
 * @returns Line count result (always passes)
 */
function checkLineCount(content: string): LineCountResult {
  const lineCount = content.split('\n').length;
  return {
    actual: lineCount,
    minimum: 0,
    maximum: 99999,
    pass: true,
  };
}

/**
 * Check expected sections are present (structural validation)
 *
 * @param content - File content
 * @param config - File config with expectedSections
 * @returns Header validation result with missing sections as duplicates
 */
function checkHeaders(content: string, config: FileConfig): HeadersResult {
  // Remove fenced code blocks before checking (headers in examples shouldn't count)
  const contentWithoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');
  const headers = contentWithoutCodeBlocks.match(/^## .+$/gm) || [];

  // Check expected sections are present
  const headerTexts = headers.map(h => h.replace(/^## /, '').trim());
  const missing: string[] = [];
  for (const section of config.expectedSections) {
    if (!headerTexts.some(h => h.includes(section))) {
      missing.push(section);
    }
  }

  return {
    actual: headers.length,
    expected: config.expectedSections.length,
    pass: missing.length === 0,
    duplicates: missing, // Repurpose duplicates field for missing sections
  };
}

/**
 * Check for placeholder markers (skip matches inside fenced code blocks and inline code)
 * @param content
 * @returns {PlaceholdersResult} Placeholder validation result
 */
function checkPlaceholders(content: string): PlaceholdersResult {
  // Remove fenced code blocks before checking
  let contentToCheck = content.replace(/```[\s\S]*?```/g, '');
  // Also remove inline code (backtick-wrapped)
  contentToCheck = contentToCheck.replace(/`[^`]+`/g, '');
  const markers: string[] = [];

  for (const pattern of PLACEHOLDER_PATTERNS) {
    const matches = contentToCheck.match(new RegExp(pattern.source, 'gi'));
    if (matches) {
      markers.push(...matches);
    }
  }

  return {
    count: markers.length,
    markers: markers.slice(0, 10), // Limit to first 10
    pass: markers.length === 0,
  };
}

/**
 * Check for scaffold markers (skip matches inside fenced code blocks)
 * @param content
 * @returns {ScaffoldMarkersResult} Scaffold marker validation result
 */
function checkScaffoldMarkers(content: string): ScaffoldMarkersResult {
  // Remove fenced code blocks before checking
  const contentWithoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');
  const matches = contentWithoutCodeBlocks.match(/<!-- SCAFFOLD/g) || [];
  return {
    count: matches.length,
    pass: matches.length === 0,
  };
}

/**
 * Check if a path looks like a real file citation that should be validated
 *
 * Returns true for paths we should validate (full relative paths to files).
 * Returns false for things we should skip:
 * - Directories (end with /)
 * - Commands (contain spaces, start with git)
 * - Bare filenames without directory path (e.g., "test.yml" instead of ".github/workflows/test.yml")
 *   These are often shorthand references and would cause false positives.
 * @param filePath
 * @returns {boolean} True if path should be validated
 */
function isValidFilePath(filePath: string): boolean {
  // Skip directories (ending with /)
  if (filePath.endsWith('/')) return false;
  // Skip git commands and other shell commands
  if (filePath.startsWith('git ')) return false;
  // Skip paths with spaces (likely commands)
  if (filePath.includes(' ')) return false;
  // Only validate paths that have directory separators (full relative paths)
  // Bare filenames like "test.yml" or "package.json" are skipped as they're
  // often shorthand references and would need fuzzy matching to validate
  if (!filePath.includes('/')) return false;
  return true;
}

/**
 * Load symbol index if available
 * @param projectRoot
 * @returns {Promise<SymbolEntry[] | null>} Symbol entries or null if unavailable
 */
async function loadSymbolIndex(projectRoot: string): Promise<SymbolEntry[] | null> {
  const indexPath = path.join(projectRoot, '.ana', 'state', 'symbol-index.json');
  try {
    const content = await fs.readFile(indexPath, 'utf-8');
    const index: SymbolIndex = JSON.parse(content);
    return index.symbols;
  } catch {
    // No index available - fall back to file-only checks
    return null;
  }
}

/**
 * Check if file is a source code file that would have symbols indexed
 * @param filePath
 * @returns {boolean} True if file is an indexed source file
 */
function isIndexedSourceFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const sourceExtensions = ['ts', 'tsx', 'js', 'jsx', 'py', 'go'];
  return sourceExtensions.includes(ext || '');
}

/**
 * Check if file path is in a directory excluded from symbol indexing
 * @param filePath
 * @returns {boolean} True if file is in an excluded directory
 */
function isInExcludedDirectory(filePath: string): boolean {
  const excludedPatterns = [
    /^node_modules\//,
    /\/node_modules\//,
    /^dist\//,
    /\/dist\//,
    /^\.next\//,
    /\/\.next\//,
    /^coverage\//,
    /\/coverage\//,
    /^tests?\//,
    /\/tests?\//,
    /\/__tests__\//,
    /\.test\./,
    /\.spec\./,
  ];
  return excludedPatterns.some((pattern) => pattern.test(filePath));
}

/**
 * Extract symbol name from citation text (conservative)
 *
 * Only extracts when there's a clear, explicit pattern like:
 * - "the `functionName` function from `file`"
 * - "`ClassName` class from `file`"
 *
 * Returns null (skip symbol verification) when uncertain.
 * Conservative approach: missed fabrication < false positive blocking legitimate citations.
 * @param fullMatch
 * @param filePath
 * @returns {string | null} Symbol name or null if uncertain
 */
function extractCitedSymbol(fullMatch: string, filePath: string): string | null {
  // Only attempt symbol extraction for source files
  if (!isIndexedSourceFile(filePath)) {
    return null;
  }

  // Skip files in excluded directories (tests, node_modules, etc.)
  if (isInExcludedDirectory(filePath)) {
    return null;
  }

  // Only match very explicit patterns where a backticked identifier
  // is immediately followed by "function", "method", or "class"
  // Pattern: `symbolName` function/method/class from `file`
  const explicitPattern = /`([A-Za-z_][A-Za-z0-9_]*)`\s+(?:function|method|class)\s+from\s+`/i;
  const match = fullMatch.match(explicitPattern);
  if (match) {
    return match[1] ?? null;
  }

  // Don't try to extract symbols from other patterns - too risky for false positives
  return null;
}

/**
 * Check if a symbol exists in the index for a given file
 * @param symbolIndex
 * @param symbolName
 * @param filePath
 * @param citedStartLine
 * @returns {{ found: boolean; nearLine: boolean }} Symbol existence and line proximity
 */
function findSymbolInFile(
  symbolIndex: SymbolEntry[],
  symbolName: string,
  filePath: string,
  citedStartLine: number | null
): { found: boolean; nearLine: boolean } {
  const fileSymbols = symbolIndex.filter((s) => s.file === filePath);

  // Look for exact name match
  const matches = fileSymbols.filter((s) => s.name === symbolName);

  if (matches.length === 0) {
    return { found: false, nearLine: false };
  }

  // If no line number cited, just check existence
  if (citedStartLine === null) {
    return { found: true, nearLine: true };
  }

  // Check if any match is within ±20 lines of cited line
  const LINE_TOLERANCE = 20;
  const nearLine = matches.some(
    (s) => Math.abs(s.line - citedStartLine) <= LINE_TOLERANCE
  );

  return { found: true, nearLine };
}

/**
 * Check citation validity
 * @param content
 * @param projectRoot
 * @returns {Promise<CitationsResult>} Citation validation result
 */
async function checkCitations(content: string, projectRoot: string): Promise<CitationsResult> {
  const failed: FailedCitation[] = [];
  let total = 0;
  let verified = 0;

  // Load symbol index if available
  const symbolIndex = await loadSymbolIndex(projectRoot);
  const verificationLevel: 'full' | 'file-only' = symbolIndex ? 'full' : 'file-only';

  for (const pattern of CITATION_PATTERNS) {
    const regex = new RegExp(pattern.source, 'g');
    let match;

    while ((match = regex.exec(content)) !== null) {
      const filePath = match[1];
      if (!filePath) continue;

      // Skip non-file citations (commands, directories, etc.)
      if (!isValidFilePath(filePath)) {
        continue;
      }

      total++;
      const startLine = match[2] ? parseInt(match[2], 10) : null;
      const endLine = match[3] ? parseInt(match[3], 10) : null;

      const fullPath = path.join(projectRoot, filePath);

      try {
        const fileContent = await fs.readFile(fullPath, 'utf-8');
        const fileLines = fileContent.split('\n').length;

        if (startLine !== null && endLine !== null) {
          if (endLine > fileLines) {
            failed.push({
              claim: filePath,
              file: filePath,
              reason: `line range out of bounds (file has ${fileLines} lines)`,
            });
            continue;
          }
        }

        // If symbol index available, try to verify symbol name
        if (symbolIndex) {
          // Get more context around the match for symbol extraction
          const matchStart = Math.max(0, match.index - 100);
          const contextBefore = content.substring(matchStart, match.index + match[0].length);
          const citedSymbol = extractCitedSymbol(contextBefore, filePath);

          if (citedSymbol) {
            const { found, nearLine } = findSymbolInFile(
              symbolIndex,
              citedSymbol,
              filePath,
              startLine
            );

            if (!found) {
              failed.push({
                claim: `${citedSymbol} in ${filePath}`,
                file: filePath,
                reason: `symbol '${citedSymbol}' not found in file`,
              });
              continue;
            }

            if (!nearLine && startLine !== null) {
              failed.push({
                claim: `${citedSymbol} in ${filePath}`,
                file: filePath,
                reason: `symbol '${citedSymbol}' not found near line ${startLine}`,
              });
              continue;
            }
          }
        }

        verified++;
      } catch {
        failed.push({
          claim: filePath,
          file: filePath,
          reason: 'file not found',
        });
      }
    }
  }

  // Deduplicate (same file may be cited by multiple patterns)
  const seen = new Set<string>();
  const uniqueFailed: FailedCitation[] = [];
  for (const f of failed) {
    const key = `${f.file}:${f.reason}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFailed.push(f);
    }
  }

  return {
    total,
    verified,
    failed: uniqueFailed,
    pass: uniqueFailed.length === 0,
    verification_level: verificationLevel,
  };
}

/**
 * Run all checks on a single file
 * @param filename
 * @param contextPath
 * @param projectRoot
 * @returns {Promise<FileCheckResult>} Complete file validation result
 */
async function checkFile(filename: string, contextPath: string, projectRoot: string): Promise<FileCheckResult> {
  const baseName = filename.replace('.md', '');
  const config = FILE_CONFIGS[baseName];

  if (!config) {
    throw new Error(`Unknown context file: ${filename}`);
  }

  const filePath = path.join(contextPath, filename);
  const content = await fs.readFile(filePath, 'utf-8');

  const lineCount = checkLineCount(content);

  const headers = checkHeaders(content, config);
  const placeholders = checkPlaceholders(content);
  const scaffoldMarkers = checkScaffoldMarkers(content);
  const citations = await checkCitations(content, projectRoot);

  const overall = lineCount.pass && headers.pass && placeholders.pass && scaffoldMarkers.pass && citations.pass;

  return {
    file: filename,
    line_count: lineCount,
    headers,
    placeholders,
    scaffold_markers: scaffoldMarkers,
    citations,
    overall,
  };
}

/**
 * Display human-readable results for a single file
 * @param result
 * @returns {void}
 */
function displayFileResult(result: FileCheckResult): void {
  console.log(chalk.bold(`\n${result.file}`));
  console.log('─'.repeat(40));

  // Line count
  const lineIcon = result.line_count.pass ? chalk.green('✓') : chalk.red('✗');
  const lineStatus = result.line_count.pass ? 'pass' : 'fail';
  console.log(`${lineIcon} Line count: ${result.line_count.actual} (${result.line_count.minimum}-${result.line_count.maximum}) [${lineStatus}]`);

  // Headers
  const headerIcon = result.headers.pass ? chalk.green('✓') : chalk.red('✗');
  const headerStatus = result.headers.pass ? 'pass' : 'fail';
  console.log(`${headerIcon} Headers: ${result.headers.actual} (expected ${result.headers.expected}) [${headerStatus}]`);
  if (result.headers.duplicates && result.headers.duplicates.length > 0) {
    console.log(chalk.gray(`   Duplicates: ${result.headers.duplicates.join(', ')}`));
  }

  // Placeholders
  const placeholderIcon = result.placeholders.pass ? chalk.green('✓') : chalk.red('✗');
  const placeholderStatus = result.placeholders.pass ? 'pass' : 'fail';
  console.log(`${placeholderIcon} Placeholders: ${result.placeholders.count} found [${placeholderStatus}]`);
  if (!result.placeholders.pass && result.placeholders.markers.length > 0) {
    console.log(chalk.gray(`   Found: ${result.placeholders.markers.join(', ')}`));
  }

  // Scaffold markers
  const scaffoldIcon = result.scaffold_markers.pass ? chalk.green('✓') : chalk.red('✗');
  const scaffoldStatus = result.scaffold_markers.pass ? 'pass' : 'fail';
  console.log(`${scaffoldIcon} Scaffold markers: ${result.scaffold_markers.count} found [${scaffoldStatus}]`);

  // Citations
  const citationIcon = result.citations.pass ? chalk.green('✓') : chalk.red('✗');
  const citationStatus = result.citations.pass ? 'pass' : 'fail';
  console.log(`${citationIcon} Citations: ${result.citations.verified}/${result.citations.total} verified [${citationStatus}]`);
  if (!result.citations.pass) {
    for (const f of result.citations.failed) {
      console.log(chalk.gray(`   Failed: ${f.file} — ${f.reason}`));
    }
  }

  // Summary
  const passedChecks = [
    result.line_count.pass,
    result.headers.pass,
    result.placeholders.pass,
    result.scaffold_markers.pass,
    result.citations.pass,
  ].filter(Boolean).length;

  console.log();
  if (result.overall) {
    console.log(chalk.green(`${result.file}: 5/5 checks passed`));
  } else {
    console.log(chalk.red(`${result.file}: ${passedChecks}/5 checks passed`));
  }
}

// ============================================================
// Setup Dashboard — ✓/○/✗ display
// ============================================================

/** Setup progress phase */
export interface PhaseStatus {
  completed: boolean;
  skipped?: boolean;
  timestamp?: string;
}

/** Setup progress file schema */
export interface SetupProgress {
  phases: {
    confirm?: PhaseStatus;
    enrich?: PhaseStatus;
    principles?: PhaseStatus;
  };
}

/** Skill check result */
interface SkillCheckResult {
  name: string;
  symbol: string; // ✓, ○, or ✗
  description: string;
  detectedCount: number;
  rulesCount: number;
}

/** Consistency check result */
interface ConsistencyResult {
  symbol: string;
  label: string;
  detail: string;
}

/**
 * Read setup-progress.json — try .ana/state/ path
 * @param cwd - Project root directory
 * @returns Setup progress or null if not found
 */
export async function readSetupProgress(cwd: string): Promise<SetupProgress | null> {
  const paths = [
    path.join(cwd, '.ana', 'state', 'setup-progress.json'),
  ];
  for (const p of paths) {
    try {
      const content = await fs.readFile(p, 'utf-8');
      return JSON.parse(content);
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Read scan.json — try `.ana/scan.json` first, fall back to `.ana/state/scan.json`.
 *
 * Runs the parsed JSON through `parseEngineResultPartial` to catch
 * schemaVersion drift, missing stack fields, and malformed commands. On Zod
 * validation failure, logs a warning and treats the file as missing —
 * preserves the fail-soft null-return contract the diagnostic command
 * expects (one corrupt scan.json should NOT crash `ana setup check`).
 *
 * @param cwd - Project root directory
 * @returns Parsed scan data or null if not found / unreadable / invalid
 */
async function readScanJson(cwd: string): Promise<Record<string, unknown> | null> {
  const paths = [
    path.join(cwd, '.ana', 'scan.json'),
    path.join(cwd, '.ana', 'state', 'scan.json'),
  ];
  for (const p of paths) {
    let content: string;
    try {
      content = await fs.readFile(p, 'utf-8');
    } catch {
      continue;  // File missing or unreadable — try next path
    }
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      // Malformed JSON — treat as missing and surface the issue
      console.warn(chalk.yellow(`Warning: ${p} is not valid JSON; treating as missing.`));
      continue;
    }
    try {
      parseEngineResultPartial(raw);
    } catch (err) {
      // Validation failed — scan.json parses but violates the partial schema.
      // Surface the exact Zod issue so the user can regenerate via `ana scan --save`.
      if (err instanceof ZodError) {
        const firstIssue = err.issues[0];
        const where = firstIssue?.path.length ? firstIssue.path.join('.') : '(root)';
        const what = firstIssue?.message ?? 'unknown';
        console.warn(
          chalk.yellow(
            `Warning: ${p} failed schema validation at \`${where}\`: ${what}. ` +
            `Run \`ana scan --save\` to regenerate.`
          )
        );
      }
      continue;
    }
    return raw as Record<string, unknown>;
  }
  return null;
}

/**
 * Read ana.json through the canonical schema.
 *
 * Uses AnaJsonSchema (same schema the init re-init merge consumes) so
 * the dashboard, the completion validator, and the init pipeline all
 * see the same validated shape. Per-field `.catch()` handles drift
 * from older installs gracefully — invalid fields get stripped via
 * .catch(), scanStaleDays gets stripped, etc.
 *
 * @param cwd - Project root directory
 * @returns Validated ana.json or null if not found / unreadable
 */
async function readAnaJson(cwd: string): Promise<AnaJson | null> {
  let raw: unknown;
  try {
    const content = await fs.readFile(path.join(cwd, '.ana', 'ana.json'), 'utf-8');
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const parsed = AnaJsonSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Count list entries (lines starting with "- ") between a heading and the next ## heading
 * @param content - File content
 * @param sectionName - Section heading text (without ##)
 * @returns Number of list entries
 */
export function countEntriesInSection(content: string, sectionName: string): number {
  const lines = content.split('\n');
  let inSection = false;
  let count = 0;
  for (const line of lines) {
    if (line.startsWith(`## ${sectionName}`)) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith('## ')) {
      break;
    }
    if (inSection && line.trimStart().startsWith('- ')) {
      count++;
    }
  }
  return count;
}

/**
 * Check if a skill file has all 4 required sections in order
 * @param content - Skill file content
 * @returns Validation result with missing section names
 */
export function checkSkillSections(content: string): { valid: boolean; missing: string[] } {
  const required = ['Detected', 'Rules', 'Gotchas', 'Examples'];
  const found: string[] = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^## (.+)$/);
    if (match && match[1]) {
      const name = match[1].trim();
      if (required.includes(name)) {
        found.push(name);
      }
    }
  }
  const missing = required.filter(s => !found.includes(s));
  // Check order: each found section should appear in the same order as required
  const orderedCorrectly = found.every((s, i) => {
    if (i === 0) return true;
    const prev = found[i - 1];
    return prev !== undefined && required.indexOf(s) > required.indexOf(prev);
  });
  return { valid: missing.length === 0 && orderedCorrectly, missing };
}

/**
 * Discover skill directories dynamically
 * @param cwd - Project root directory
 * @returns Sorted array of skill directory names
 */
async function discoverSkills(cwd: string): Promise<string[]> {
  const skillsDir = path.join(cwd, '.claude', 'skills');
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name).sort();
  } catch {
    return [];
  }
}

/**
 * Check a single skill file
 * @param cwd - Project root directory
 * @param skillName - Skill directory name
 * @returns Skill check result with symbol and description
 */
export async function checkSkill(cwd: string, skillName: string): Promise<SkillCheckResult> {
  const filePath = path.join(cwd, '.claude', 'skills', skillName, 'SKILL.md');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const sections = checkSkillSections(content);
    const detectedCount = countEntriesInSection(content, 'Detected');
    const rulesCount = countEntriesInSection(content, 'Rules');

    if (!sections.valid) {
      return {
        name: skillName,
        symbol: chalk.red('✗'),
        description: `missing sections: ${sections.missing.join(', ')}`,
        detectedCount,
        rulesCount,
      };
    }

    if (skillName === 'troubleshooting') {
      return {
        name: skillName,
        symbol: chalk.yellow('○'),
        description: 'stub (grows over time)',
        detectedCount,
        rulesCount,
      };
    }

    if (detectedCount > 0 || rulesCount > 0) {
      return {
        name: skillName,
        symbol: chalk.green('✓'),
        description: `Detected: ${detectedCount} facts, Rules: ${rulesCount} entries`,
        detectedCount,
        rulesCount,
      };
    }

    return {
      name: skillName,
      symbol: chalk.yellow('○'),
      description: `Detected: 0 facts, Rules: 0 entries`,
      detectedCount,
      rulesCount,
    };
  } catch {
    return {
      name: skillName,
      symbol: chalk.red('✗'),
      description: 'file not found',
      detectedCount: 0,
      rulesCount: 0,
    };
  }
}

/**
 * Check context file for dashboard display
 * @param cwd - Project root directory
 * @param filename - Context filename (e.g., project-context.md)
 * @returns Symbol and description for dashboard display
 */
export async function checkContextForDashboard(cwd: string, filename: string): Promise<{ symbol: string; description: string }> {
  const filePath = path.join(cwd, '.ana', 'context', filename);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const baseName = filename.replace('.md', '');
    const config = FILE_CONFIGS[baseName];

    if (baseName === 'design-principles') {
      // Uses fileHasRealContent (same helper validateSetupCompletion
      // uses) so the dashboard and the completion validator always
      // agree on this file. Previously this branch had its own inline
      // HTML-comment-strip-and-filter logic that duplicated
      // fileHasRealContent's semantics exactly — a latent drift trap
      // surfaced during a later polish pass.
      if (fileHasRealContent(content)) {
        return { symbol: chalk.green('✓'), description: 'populated' };
      }
      return { symbol: chalk.yellow('○'), description: 'empty (optional — add anytime)' };
    }

    if (baseName === 'project-context' && config) {
      const headers = checkHeaders(content, config);
      if (!headers.pass) {
        return { symbol: chalk.red('✗'), description: `missing sections: ${headers.duplicates.join(', ')}` };
      }
      // Per-section count using hasRealContent (same function validateSetupCompletion
      // uses — guarantees dashboard and validator agree on the same file)
      const populated = countPopulatedContextSections(content, PROJECT_CONTEXT_SECTIONS);
      const total = PROJECT_CONTEXT_SECTIONS.length;
      if (populated === 0) {
        return { symbol: chalk.yellow('○'), description: 'scaffold (setup will enrich)' };
      }
      if (populated < total) {
        return { symbol: chalk.yellow('○'), description: `${populated}/${total} sections populated` };
      }
      return { symbol: chalk.green('✓'), description: `${populated}/${total} sections populated` };
    }

    return { symbol: chalk.yellow('○'), description: 'unknown format' };
  } catch {
    return { symbol: chalk.red('✗'), description: 'file not found' };
  }
}

/**
 * Run cross-reference consistency checks.
 *
 * Ternary result model:
 *   ✓ aligned            — every skill with a populated Detected section
 *                          mentions the corresponding ana.json field
 *   ✗ mismatch           — at least one skill's Detected contradicts ana.json
 *   ○ awaiting setup     — no mismatches, but one or more skills have an
 *                          empty/comment-only Detected section (nothing to
 *                          verify against — the previous code would silently
 *                          report this as ✓ aligned, which was phantom
 *                          verification)
 *
 * Priority when mixed: mismatch > awaiting setup > aligned. Show the
 * worst state.
 *
 * @param cwd - Project root directory
 * @param anaJson - Schema-validated ana.json
 * @param scanJson - Parsed scan.json or null
 * @returns Array of consistency check results
 */
export async function checkConsistency(
  cwd: string,
  anaJson: AnaJson,
  scanJson: Record<string, unknown> | null
): Promise<ConsistencyResult[]> {
  const results: ConsistencyResult[] = [];

  const mismatches: string[] = [];
  const notYetVerified: string[] = [];
  const language = anaJson.language ?? undefined;
  const artifactBranch = anaJson.artifactBranch;
  const commands = anaJson.commands as Record<string, unknown> | undefined;

  // Read skill Detected sections for cross-reference
  const skillsDir = path.join(cwd, '.claude', 'skills');

  const isUnpopulated = (section: string | null): boolean => {
    if (!section) return true;
    const trimmed = section.trim();
    if (trimmed === '') return true;
    // Comment-only section (HTML comments are the scaffold placeholder)
    return /^<!--[\s\S]*-->$/m.test(trimmed) && !trimmed.replace(/<!--[\s\S]*?-->/g, '').trim();
  };

  if (language) {
    try {
      const coding = await fs.readFile(path.join(skillsDir, 'coding-standards', 'SKILL.md'), 'utf-8');
      const detectedSection = extractSection(coding, 'Detected');
      if (isUnpopulated(detectedSection)) {
        notYetVerified.push('coding-standards');
      } else if (!detectedSection!.toLowerCase().includes(language.toLowerCase())) {
        mismatches.push(`language: ana.json says "${language}", coding-standards Detected doesn't mention it`);
      }
    } catch { /* skill not found — skip (no skill to check against) */ }
  }

  if (artifactBranch) {
    try {
      const git = await fs.readFile(path.join(skillsDir, 'git-workflow', 'SKILL.md'), 'utf-8');
      const detectedSection = extractSection(git, 'Detected');
      if (isUnpopulated(detectedSection)) {
        notYetVerified.push('git-workflow');
      } else if (!detectedSection!.toLowerCase().includes(artifactBranch.toLowerCase())) {
        mismatches.push(`branch: ana.json says "${artifactBranch}", git-workflow Detected doesn't mention it`);
      }
    } catch { /* skip */ }
  }

  const testCmdRaw = commands?.['test'];
  const testCmd = typeof testCmdRaw === 'string' ? testCmdRaw : null;
  if (testCmd) {
    try {
      const testing = await fs.readFile(path.join(skillsDir, 'testing-standards', 'SKILL.md'), 'utf-8');
      const detectedSection = extractSection(testing, 'Detected');
      if (isUnpopulated(detectedSection)) {
        notYetVerified.push('testing-standards');
      } else {
        // Prefer detected stack.testing from scan.json over a hardcoded
        // keyword list. Falls back to the test command itself if scan.json
        // is unavailable.
        // stack.testing is `string[]` — a match on ANY detected framework
        // satisfies the cross-ref. We only build a mismatch if NONE of the
        // detected frameworks appear in the Detected section.
        const testingStack = (scanJson?.['stack'] as Record<string, unknown> | undefined)?.['testing'];
        const testingFrameworks: string[] = Array.isArray(testingStack)
          ? (testingStack.filter((v): v is string => typeof v === 'string'))
          : typeof testingStack === 'string' && testingStack.length > 0
            ? [testingStack]
            : [];
        const detectedLower = detectedSection!.toLowerCase();
        if (testingFrameworks.length > 0) {
          const anyFrameworkMentioned = testingFrameworks.some(name =>
            detectedLower.includes(name.toLowerCase())
          );
          if (!anyFrameworkMentioned) {
            mismatches.push(
              `testing: ana.json test command set but testing-standards Detected doesn't mention any of "${testingFrameworks.join(', ')}"`
            );
          }
        } else if (!detectedLower.includes(testCmd.toLowerCase())) {
          // No detected frameworks — fall back to matching the raw test command.
          mismatches.push(
            `testing: ana.json test command set but testing-standards Detected doesn't mention "${testCmd}"`
          );
        }
      }
    } catch { /* skip */ }
  }

  // Render ana.json ↔ skills result: mismatch > awaiting > aligned
  if (mismatches.length > 0) {
    results.push({
      symbol: chalk.red('✗'),
      label: 'ana.json ↔ skills',
      detail: `mismatch — ${mismatches[0]}`,
    });
  } else if (notYetVerified.length > 0) {
    const count = notYetVerified.length;
    const plural = count === 1 ? 'skill' : 'skills';
    results.push({
      symbol: chalk.yellow('○'),
      label: 'ana.json ↔ skills',
      detail: `${count} ${plural} awaiting setup enrichment (${notYetVerified.join(', ')})`,
    });
  } else {
    results.push({
      symbol: chalk.green('✓'),
      label: 'ana.json ↔ skills',
      detail: 'aligned',
    });
  }

  // Check Detected ↔ scan.json freshness
  if (scanJson) {
    const lastScanAt = anaJson.lastScanAt ?? undefined;
    const overview = scanJson['overview'] as Record<string, string> | undefined;
    const scanTimestamp = overview?.['scannedAt'];

    if (lastScanAt && scanTimestamp && lastScanAt !== scanTimestamp) {
      results.push({
        symbol: chalk.red('✗'),
        label: 'Detected ↔ scan.json',
        detail: 'stale (scan newer than last setup)',
      });
    } else {
      results.push({
        symbol: chalk.green('✓'),
        label: 'Detected ↔ scan.json',
        detail: 'current',
      });
    }
  }

  return results;
}

/**
 * Extract content of a section (between ## heading and next ## heading)
 * @param content - File content
 * @param sectionName - Section heading text (without ##)
 * @returns Section content or null if not found
 */
function extractSection(content: string, sectionName: string): string | null {
  const lines = content.split('\n');
  let inSection = false;
  const sectionLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith(`## ${sectionName}`)) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith('## ')) {
      break;
    }
    if (inSection) {
      sectionLines.push(line);
    }
  }
  return inSection ? sectionLines.join('\n') : null;
}

// --- Setup Completion Validation ---

export interface SetupValidationResult {
  setupPhase: 'context-complete' | 'complete';
  warnings: string[];
  stats: {
    skillsCalibrated: number;
    contextSections: { populated: number; total: number };
    principlesCaptured: boolean;
  };
}

/**
 * Check if a section has non-template content (strict).
 *
 * Template lines that don't count as real content:
 *  - Blank lines
 *  - Markdown headings (`#`, `##`, ...)
 *  - HTML comments, single-line AND multiline
 *  - Scan-seeded `**Detected*:**` lines in any form — the base
 *    `**Detected:**` marker plus `**Detected commands:**`,
 *    `**Detected services:**`, `**Detected infrastructure:**`, and
 *    any future variant. These are auto-generated from scan data
 *    during `ana init`, not user-written content.
 *  - Italic scaffold placeholder lines referencing the setup agent,
 *    i.e. `*Not yet captured. Run \`claude --agent ana-setup\` to
 *    fill this.*` and `*Scan detected the items above. Run \`claude
 *    --agent ana-setup\` to add: ...*`. Generated by
 *    `utils/scaffold-generators.ts`; not user content.
 *
 * Everything else counts as real content. The function answers the
 * question "has a human or setup agent actually enriched this
 * section?" — not "does this section contain any bytes?"
 *
 * Pre-polish, this function counted the scaffold template lines as
 * real content, so a fresh `ana init` would report every scan-seeded
 * section of project-context.md as "populated" — including sections
 * that contained only a `*Not yet captured*` placeholder. The
 * dashboard displayed "6/6 sections populated" on a completely
 * un-enriched scaffold.
 *
 * @param content - File content
 * @param sectionName - Section heading text (without ##)
 * @returns True if section has real content
 */
function hasRealContent(content: string, sectionName: string): boolean {
  const lines = content.split('\n');
  let inSection = false;
  let inComment = false;
  for (const line of lines) {
    if (line.startsWith(`## ${sectionName}`)) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith('## ')) break;
    if (inSection) {
      const trimmed = line.trim();
      // Track multiline HTML comments
      if (trimmed.startsWith('<!--') && !trimmed.includes('-->')) {
        inComment = true;
        continue;
      }
      if (inComment) {
        if (trimmed.includes('-->')) inComment = false;
        continue;
      }
      if (isScaffoldTemplateLine(trimmed)) continue;
      // Real content found
      return true;
    }
  }
  return false;
}

/**
 * Shared template-line predicate used by both `hasRealContent`
 * (section-scoped) and `fileHasRealContent` (file-scoped). Returns
 * true if the trimmed line is a scaffold template artifact — blank,
 * heading, HTML comment, **Detected*:** marker, or an italic
 * setup-agent placeholder. Returns false for anything that looks
 * like user-written content.
 *
 * Pulled out as a shared helper so the per-section and whole-file
 * detectors can't drift — same template rules on both paths.
 *
 * @param trimmed - A trimmed line (caller should pass `line.trim()`)
 * @returns True if the line is scaffold template, false if user content
 */
function isScaffoldTemplateLine(trimmed: string): boolean {
  if (trimmed === '') return true;
  if (trimmed.startsWith('#')) return true;
  if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) return true;
  // Any **Detected*:** scan-seeded variant (base marker, "commands",
  // "services", "infrastructure", and any future variant).
  if (trimmed.startsWith('**Detected')) return true;
  // Italic scaffold placeholder lines that point at the setup agent.
  // Scaffold-generators.ts writes these as `*Not yet captured. Run
  // \`claude --agent ana-setup\` to fill this.*` and `*Scan detected
  // the items above. Run \`claude --agent ana-setup\` to add: ...*`.
  if (
    trimmed.startsWith('*') &&
    trimmed.endsWith('*') &&
    trimmed.includes('Run `claude --agent ana-setup`')
  ) {
    return true;
  }
  return false;
}

/**
 * Count how many of the given sections have real (non-template) content.
 *
 * Shared by `checkContextForDashboard` (dashboard display) and
 * `validateSetupCompletion` (completion validator). Previously, the
 * dashboard used a looser `hasNonTemplateContent` variant and the
 * validator used the stricter `hasRealContent` — the two disagreed on
 * multiline HTML comments and gave contradictory verdicts on the same
 * file. Unifying on this single helper + `hasRealContent` guarantees
 * "the dashboard and the validator always give the same answer."
 *
 * @param content - Markdown file content
 * @param sectionNames - Section headings to check (without the `## ` prefix)
 * @returns Number of sections whose content passes `hasRealContent`
 */
function countPopulatedContextSections(
  content: string,
  sectionNames: readonly string[]
): number {
  return sectionNames.filter(s => hasRealContent(content, s)).length;
}

/**
 * Check if a file has any non-template content at all.
 *
 * Strips multiline HTML comments first (easier than tracking multi-
 * line state in a `.some()` loop), then scans each remaining line
 * with the shared `isScaffoldTemplateLine` predicate. Same template
 * rules as `hasRealContent` — blank, heading, HTML comment,
 * **Detected*:** marker, or italic setup-agent placeholder all count
 * as template.
 *
 * Used by the design-principles.md dashboard check (a file with
 * only HTML-comment placeholders should report "empty", a file with
 * real user content should report "populated").
 *
 * @param content - File content
 * @returns True if file has real content beyond template
 */
function fileHasRealContent(content: string): boolean {
  const stripped = content.replace(/<!--[\s\S]*?-->/g, '');
  return stripped.split('\n').some(l => !isScaffoldTemplateLine(l.trim()));
}

/**
 * Validate setup completion state.
 * Used by both `ana setup complete` CLI and referenced by orchestrator Step 17.
 *
 * @param cwd - Project root directory
 * @returns Validation result with setupPhase determination
 */
export async function validateSetupCompletion(cwd: string): Promise<SetupValidationResult> {
  const warnings: string[] = [];
  const contextPath = path.join(cwd, '.ana', 'context');
  const claudePath = path.join(cwd, '.claude');

  // --- 1. CRITICAL: "What This Project Does" has real content ---
  let criticalSectionPopulated = false;
  let architectureExists = false;
  let populatedCount = 0;
  const totalSections = PROJECT_CONTEXT_SECTIONS.length;

  try {
    const pcContent = await fs.readFile(path.join(contextPath, 'project-context.md'), 'utf-8');
    criticalSectionPopulated = hasRealContent(pcContent, 'What This Project Does');
    architectureExists = pcContent.includes('## Architecture');
    populatedCount = countPopulatedContextSections(pcContent, PROJECT_CONTEXT_SECTIONS);
  } catch {
    warnings.push('project-context.md not found');
  }

  if (!criticalSectionPopulated) {
    warnings.push('## What This Project Does has no content (critical)');
  }
  if (!architectureExists) {
    warnings.push('## Architecture heading missing from project-context.md');
  }

  // --- 2. Design principles (optional) ---
  let principlesCaptured = false;
  try {
    const dpContent = await fs.readFile(path.join(contextPath, 'design-principles.md'), 'utf-8');
    principlesCaptured = fileHasRealContent(dpContent);
  } catch {
    // File missing is fine — principles are optional
  }

  // --- 3. Skill format validation ---
  let skillsCalibrated = 0;
  const skills = await discoverSkills(cwd);
  skillsCalibrated = skills.length;

  for (const skill of skills) {
    const filePath = path.join(claudePath, 'skills', skill, 'SKILL.md');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const { valid, missing } = checkSkillSections(content);
      if (!valid) {
        warnings.push(`skill ${skill}: missing sections — ${missing.join(', ')}`);
      }
    } catch {
      warnings.push(`skill ${skill}: SKILL.md not found`);
    }
  }

  // --- 4. Cross-reference (ana.json ↔ skill Detected) ---
  const anaJson = await readAnaJson(cwd);
  if (anaJson) {
    const scanJson = await readScanJson(cwd);
    const crossRefResults = await checkConsistency(cwd, anaJson, scanJson);
    for (const r of crossRefResults) {
      if (r.detail.startsWith('mismatch')) {
        warnings.push(`cross-reference: ${r.detail}`);
      }
    }
  }

  // --- Determine setupPhase ---
  // Phase 2 at least partially done = critical section has content
  // Phase 3 skip = still complete
  const setupPhase: 'context-complete' | 'complete' = criticalSectionPopulated ? 'complete' : 'context-complete';

  return {
    setupPhase,
    warnings,
    stats: {
      skillsCalibrated,
      contextSections: { populated: populatedCount, total: totalSections },
      principlesCaptured,
    },
  };
}

/**
 * Display the full ✓/○/✗ setup dashboard
 * @param cwd - Project root directory
 * @returns True if no errors (no ✗ symbols)
 */
async function displaySetupDashboard(cwd: string): Promise<boolean> {
  let hasErrors = false;

  // --- Setup Status ---
  // ana.json is the source of truth for setup completion.
  // setup-progress.json is a transient coordination file used only when
  // setup is actively partial. Once setupPhase === 'complete', the progress
  // file is deleted by `ana setup complete` and phase granularity is
  // meaningless post-completion — show a single "setup complete" line.
  console.log(chalk.bold('\nSetup Status'));
  console.log('────────────');

  const anaJsonForStatus = await readAnaJson(cwd);
  const currentPhase = anaJsonForStatus?.setupPhase;

  if (currentPhase === 'complete') {
    console.log(`  ${chalk.green('✓')} Setup complete`);
  } else {
    // Partial / not started — consult progress file for per-phase detail
    const progress = await readSetupProgress(cwd);
    const phases = [
      { key: 'confirm', label: 'Phase 1 (confirm)' },
      { key: 'enrich', label: 'Phase 2 (enrich)' },
      { key: 'principles', label: 'Phase 3 (principles)' },
    ] as const;

    for (const phase of phases) {
      const status = progress?.phases?.[phase.key];
      if (status?.completed && status.timestamp) {
        const d = new Date(status.timestamp);
        const date = isNaN(d.getTime()) ? status.timestamp : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        console.log(`  ${chalk.green('✓')} ${phase.label}: completed ${date}`);
      } else if (status?.skipped) {
        // The setup agent writes `skipped: true` for phases the user
        // deliberately skipped (e.g., design-principles). Render that
        // explicit state rather than showing "not started."
        console.log(`  ${chalk.gray('⊘')} ${phase.label}: skipped`);
      } else {
        console.log(`  ${chalk.yellow('○')} ${phase.label}: not started`);
      }
    }
  }

  // --- File Health ---
  console.log(chalk.bold('\nFile Health'));
  console.log('───────────');

  // Context files
  console.log(chalk.gray('Context:'));
  for (const file of ALL_CONTEXT_FILES) {
    const result = await checkContextForDashboard(cwd, file);
    const name = file.replace('.md', '').padEnd(22);
    console.log(`  ${result.symbol} ${name}${result.description}`);
    if (result.symbol.includes('✗')) hasErrors = true;
  }

  // Skills
  console.log(chalk.gray('Skills:'));
  const skills = await discoverSkills(cwd);
  // Warn about missing core skills — catches accidental deletion
  const missingCore = (CORE_SKILLS as readonly string[]).filter(s => !skills.includes(s));
  for (const name of missingCore) {
    console.log(`  ${chalk.yellow('⚠')} ${name.padEnd(22)} missing (expected core skill)`);
  }
  if (skills.length === 0 && missingCore.length === 0) {
    console.log(chalk.gray('  No skills found in .claude/skills/'));
  } else {
    for (const skill of skills) {
      const result = await checkSkill(cwd, skill);
      const name = result.name.padEnd(22);
      console.log(`  ${result.symbol} ${name}${result.description}`);
      if (result.symbol.includes('✗')) hasErrors = true;
    }
  }

  // --- Consistency ---
  const anaJson = await readAnaJson(cwd);
  if (anaJson) {
    const scanJson = await readScanJson(cwd);
    const consistencyResults = await checkConsistency(cwd, anaJson, scanJson);

    console.log(chalk.bold('\nConsistency'));
    console.log('───────────');
    for (const r of consistencyResults) {
      console.log(`  ${r.symbol} ${r.label}: ${r.detail}`);
      if (r.symbol.includes('✗')) hasErrors = true;
    }
  }

  // --- Freshness ---
  {
    const anaJsonData = await readAnaJson(cwd);
    const lastScanAt = anaJsonData?.lastScanAt as string | undefined;
    const freshness = checkScanFreshness(lastScanAt, cwd);

    console.log(chalk.bold('\nFreshness'));
    console.log('─────────');
    if (freshness?.isStale) {
      const commitPart = freshness.commitsSinceScan !== null
        ? ` (${freshness.commitsSinceScan} commits since scan)`
        : '';
      console.log(`  ⚠ Scan age: ${freshness.daysSinceScan} days old${commitPart}`);
    } else {
      console.log(`  ✓ Scan age: current`);
    }
  }

  console.log();
  return !hasErrors;
}

/**
 * Create the check command
 * @returns {Command} Commander command instance
 */
export function createCheckCommand(): Command {
  return new Command('check')
    .description('Validate context files for quality gates')
    .argument('[filename]', 'Specific file to check (e.g., project-context.md)')
    .option('--json', 'Output results as JSON')
    .action(async (filename: string | undefined, options: { json?: boolean }) => {
      const cwd = findProjectRoot();
      const contextPath = path.join(cwd, '.ana', 'context');

      // Dashboard mode: no filename, no --json → ✓/○/✗ display
      if (!filename && !options.json) {
        try {
          const pass = await displaySetupDashboard(cwd);
          process.exit(pass ? 0 : 1);
        } catch (error) {
          console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
        return;
      }

      // Check if .ana/context/ exists (needed for single-file and --json modes)
      try {
        await fs.access(contextPath);
      } catch {
        if (options.json) {
          console.log(JSON.stringify({ error: '.ana/context/ directory not found. Run `ana init` first.' }));
        } else {
          console.error(chalk.red('Error: .ana/context/ directory not found'));
          console.error(chalk.gray('Run `ana init` first to create .ana/ structure.'));
        }
        process.exit(1);
      }

      try {
        if (filename) {
          // Single file mode
          let normalizedFilename = filename.endsWith('.md') ? filename : `${filename}.md`;
          normalizedFilename = normalizedFilename.replace(/^\.ana\/context\//, '');

          // Check file exists
          const filePath = path.join(contextPath, normalizedFilename);
          try {
            await fs.access(filePath);
          } catch {
            if (options.json) {
              console.log(JSON.stringify({ error: `File not found: ${normalizedFilename}` }));
            } else {
              console.error(chalk.red(`Error: File not found: ${normalizedFilename}`));
            }
            process.exit(1);
          }

          const result = await checkFile(normalizedFilename, contextPath, cwd);

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            displayFileResult(result);
          }

          process.exit(result.overall ? 0 : 1);
        } else {
          // All files mode
          const results: FileCheckResult[] = [];

          for (const file of ALL_CONTEXT_FILES) {
            const filePath = path.join(contextPath, file);
            try {
              await fs.access(filePath);
              const result = await checkFile(file, contextPath, cwd);
              results.push(result);
            } catch {
              // File doesn't exist - create a failed result
              const baseName = file.replace('.md', '');
              const config = FILE_CONFIGS[baseName];
              results.push({
                file,
                line_count: { actual: 0, minimum: 0, maximum: 99999, pass: true },
                headers: { actual: 0, expected: config?.expectedSections?.length ?? 0, pass: false, duplicates: [] },
                placeholders: { count: 0, markers: [], pass: true },
                scaffold_markers: { count: 0, pass: true },
                citations: { total: 0, verified: 0, failed: [], pass: true, verification_level: 'file-only' },
                overall: false,
              });
            }
          }

          const overallPass = results.every((r) => r.overall);
          const output: AllFilesResult = { files: results, overall: overallPass };

          if (options.json) {
            console.log(JSON.stringify(output, null, 2));
          } else {
            for (const result of results) {
              displayFileResult(result);
            }

            const passedCount = results.filter((r) => r.overall).length;
            console.log();
            if (overallPass) {
              console.log(chalk.green(`\n${passedCount} of ${results.length} files passed`));
            } else {
              console.log(chalk.red(`\n${passedCount} of ${results.length} files passed`));
            }
          }

          process.exit(overallPass ? 0 : 1);
        }
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
        } else {
          console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
        process.exit(1);
      }
    });
}
