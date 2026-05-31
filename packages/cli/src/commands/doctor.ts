/**
 * ana doctor — unified project health diagnostic
 *
 * Orchestrates existing health-checking functions into a single dashboard.
 * Doctor is read-only: no file writes, no git operations.
 *
 * Usage:
 *   ana doctor          Human-readable ✓/○/✗ dashboard
 *   ana doctor --json   Structured JSON output
 *
 * Exit codes:
 *   0 - All pass or yellow-only
 *   1 - At least one ✗ (red) item, or guard failure
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { findProjectRoot } from '../utils/validators.js';
import { isWorktreeDirectory } from '../utils/worktree.js';
import { worktreeExists } from '../utils/worktree.js';
import { checkForUpdates } from '../utils/update-check.js';
import { checkScanFreshness } from '../utils/scan-freshness.js';
import { agentCommand } from './platform.js';
import {
  checkSkill,
  readSetupProgress,
  countPopulatedContextSections,
  discoverSkills,
  PROJECT_CONTEXT_SECTIONS,
} from './check.js';
import { computeHealthReport } from '../utils/proofSummary.js';
import { getCliVersion } from './init/state.js';
import type { HealthReport } from '../types/proof.js';

// ── Maturity thresholds ──────────────────────────────────────────────

/** Minimum proof chain entries to qualify as "established" */
const ESTABLISHED_RUNS_THRESHOLD = 10;

/** Days of inactivity before a work item is "stalled" */
const STALE_WORK_DAYS = 14;

// ── Status types ─────────────────────────────────────────────────────

type DimensionStatus = 'pass' | 'warn' | 'fail';
type Maturity = 'new' | 'setup' | 'established';

interface CliVersionDimension {
  status: DimensionStatus;
  current: string;
  latest: string | null;
  project_version: string | null;
}

interface ScanFreshnessDimension {
  status: DimensionStatus;
  days_since_scan: number | null;
  commits_since_scan: number | null;
  depth: string | null;
}

interface ContextDimension {
  status: DimensionStatus;
  sections_populated: number;
  sections_total: number;
  setup_state: 'complete' | 'in-progress' | 'not-started';
}

interface SkillsDimension {
  status: DimensionStatus;
  enriched: number;
  total: number;
  scaffold_defaults: string[];
}

interface ProofChainDimension {
  status: DimensionStatus;
  runs: number;
  active_findings: number;
  risk_findings: number;
  trend: string;
}

interface SurfacesDimension {
  status: DimensionStatus;
  count: number;
  missing_test: string[];
  drift: boolean;
  drift_scan_count: number | null;
  legacy_fields: string[];
}

interface StaleWorkItem {
  slug: string;
  days_stalled: number;
  stage: string;
}

interface DoctorDimensions {
  cli_version: CliVersionDimension;
  scan_freshness: ScanFreshnessDimension;
  context: ContextDimension;
  skills: SkillsDimension;
  proof_chain: ProofChainDimension;
  surfaces: SurfacesDimension;
}

interface DoctorResults {
  maturity: Maturity;
  dimensions: DoctorDimensions;
  stale_work: StaleWorkItem[];
  overall: 'pass' | 'fail';
}

interface DoctorJson {
  command: string;
  timestamp: string;
  results: DoctorResults;
}

// ── Dimension assessors ──────────────────────────────────────────────

/**
 * Assess CLI version dimension.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns CLI version dimension result
 */
async function assessCliVersion(projectRoot: string): Promise<CliVersionDimension> {
  const updateResult = await checkForUpdates(projectRoot);
  const currentVersion = await getCliVersion();

  if (updateResult.updateAvailable) {
    return {
      status: 'fail',
      current: updateResult.updateAvailable.current,
      latest: updateResult.updateAvailable.latest,
      project_version: updateResult.projectMismatch?.projectVersion ?? null,
    };
  }

  return {
    status: 'pass',
    current: currentVersion,
    latest: null,
    project_version: updateResult.projectMismatch?.projectVersion ?? null,
  };
}

/**
 * Assess scan freshness dimension.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Scan freshness dimension result
 */
function assessScanFreshness(projectRoot: string): ScanFreshnessDimension {
  // Read ana.json for lastScanAt
  let lastScanAt: string | null = null;
  let depth: string | null = null;
  try {
    const anaJsonContent = fs.readFileSync(path.join(projectRoot, '.ana', 'ana.json'), 'utf-8');
    const anaJson = JSON.parse(anaJsonContent);
    lastScanAt = anaJson.lastScanAt ?? null;
  } catch {
    // ana.json missing — will show as no scan data
  }

  // Read scan.json for depth
  try {
    const scanContent = fs.readFileSync(path.join(projectRoot, '.ana', 'scan.json'), 'utf-8');
    const scanJson = JSON.parse(scanContent);
    depth = scanJson?.overview?.depth ?? null;
  } catch {
    // scan.json missing — graceful degradation
  }

  const freshness = checkScanFreshness(lastScanAt, projectRoot);

  if (!freshness) {
    // CI or missing data — treat as pass (best-effort)
    return {
      status: lastScanAt ? 'pass' : 'warn',
      days_since_scan: null,
      commits_since_scan: null,
      depth,
    };
  }

  return {
    status: freshness.isStale ? 'fail' : 'pass',
    days_since_scan: freshness.daysSinceScan,
    commits_since_scan: freshness.commitsSinceScan,
    depth,
  };
}

/**
 * Assess context quality dimension.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Context dimension result
 */
async function assessContext(projectRoot: string): Promise<ContextDimension> {
  // Determine setup state from ana.json
  let setupPhase: string | undefined;
  try {
    const anaJsonContent = await fsPromises.readFile(path.join(projectRoot, '.ana', 'ana.json'), 'utf-8');
    const anaJson = JSON.parse(anaJsonContent);
    setupPhase = anaJson.setupPhase;
  } catch {
    // Missing ana.json — treat as not started
  }

  let setupState: 'complete' | 'in-progress' | 'not-started';
  if (setupPhase === 'complete') {
    setupState = 'complete';
  } else if (setupPhase) {
    // Truthy but not 'complete' — in-progress
    setupState = 'in-progress';
  } else {
    // Falsy/absent — check progress file for intermediate state
    const progress = await readSetupProgress(projectRoot);
    if (progress && Object.values(progress.phases).some(p => p?.completed)) {
      setupState = 'in-progress';
    } else {
      setupState = 'not-started';
    }
  }

  // Count populated sections
  let sectionsPopulated = 0;
  const sectionsTotal = PROJECT_CONTEXT_SECTIONS.length;
  try {
    const pcContent = await fsPromises.readFile(
      path.join(projectRoot, '.ana', 'context', 'project-context.md'),
      'utf-8',
    );
    sectionsPopulated = countPopulatedContextSections(pcContent, PROJECT_CONTEXT_SECTIONS);
  } catch {
    // File missing — 0 populated
  }

  let status: DimensionStatus;
  if (sectionsPopulated === sectionsTotal) {
    // Content is fully populated — green regardless of how it got there
    // (setup agent, manual editing, or any other path)
    status = 'pass';
  } else {
    status = 'warn';
  }

  return {
    status,
    sections_populated: sectionsPopulated,
    sections_total: sectionsTotal,
    setup_state: setupState,
  };
}

/**
 * Assess skills enrichment dimension.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Skills dimension result
 */
async function assessSkills(projectRoot: string): Promise<SkillsDimension> {
  const skills = await discoverSkills(projectRoot);
  const total = skills.length;
  const scaffoldDefaults: string[] = [];

  for (const skill of skills) {
    const result = await checkSkill(projectRoot, skill);
    // A skill is scaffold-default if it has 0 detected + 0 rules (yellow ○)
    // or it's the troubleshooting stub
    if (result.detectedCount === 0 && result.rulesCount === 0) {
      scaffoldDefaults.push(skill);
    }
  }

  const enriched = total - scaffoldDefaults.length;

  let status: DimensionStatus;
  if (total === 0) {
    status = 'warn';
  } else if (scaffoldDefaults.length === 0) {
    status = 'pass';
  } else {
    status = 'warn';
  }

  return {
    status,
    enriched,
    total,
    scaffold_defaults: scaffoldDefaults,
  };
}

/**
 * Assess proof chain dimension.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Proof chain dimension result
 */
function assessProofChain(projectRoot: string): ProofChainDimension {
  const proofChainPath = path.join(projectRoot, '.ana', 'proof_chain.json');

  if (!fs.existsSync(proofChainPath)) {
    return {
      status: 'warn',
      runs: 0,
      active_findings: 0,
      risk_findings: 0,
      trend: 'insufficient_data',
    };
  }

  let chain: { entries: Array<{ findings?: Array<{ status?: string; severity?: string }> }> };
  try {
    chain = JSON.parse(fs.readFileSync(proofChainPath, 'utf-8'));
  } catch {
    return {
      status: 'warn',
      runs: 0,
      active_findings: 0,
      risk_findings: 0,
      trend: 'insufficient_data',
    };
  }

  const report: HealthReport = computeHealthReport(chain);

  // Count active findings across all entries
  let activeFindings = 0;
  let riskFindings = 0;
  for (const entry of chain.entries) {
    for (const finding of entry.findings ?? []) {
      if (!finding.status || finding.status === 'active') {
        activeFindings++;
        if (finding.severity === 'risk') {
          riskFindings++;
        }
      }
    }
  }

  return {
    status: report.runs > 0 ? 'pass' : 'warn',
    runs: report.runs,
    active_findings: activeFindings,
    risk_findings: riskFindings,
    trend: report.trajectory.trend,
  };
}

/**
 * Assess surfaces dimension.
 *
 * Checks: surface count and test commands, scan-vs-ana.json drift,
 * and legacy buildPackage/testPackage keys.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Surfaces dimension result
 */
function assessSurfaces(projectRoot: string): SurfacesDimension {
  const anaJsonPath = path.join(projectRoot, '.ana', 'ana.json');
  const scanJsonPath = path.join(projectRoot, '.ana', 'scan.json');

  let anaContent: Record<string, unknown> = {};
  try {
    anaContent = JSON.parse(fs.readFileSync(anaJsonPath, 'utf-8'));
  } catch {
    return { status: 'pass', count: 0, missing_test: [], drift: false, drift_scan_count: null, legacy_fields: [] };
  }

  const surfaces = anaContent['surfaces'] as Record<string, { commands?: { test?: string | null } }> | undefined;
  const surfaceCount = surfaces ? Object.keys(surfaces).length : 0;

  // Check for missing test commands
  const missingTest: string[] = [];
  if (surfaces) {
    for (const [name, config] of Object.entries(surfaces)) {
      if (!config.commands?.test) {
        missingTest.push(name);
      }
    }
  }

  // Check scan-vs-ana.json drift
  let drift = false;
  let driftScanCount: number | null = null;
  try {
    if (fs.existsSync(scanJsonPath)) {
      const scanContent = JSON.parse(fs.readFileSync(scanJsonPath, 'utf-8'));
      const scanSurfaces = scanContent.surfaces as unknown[] | undefined;
      if (scanSurfaces) {
        driftScanCount = scanSurfaces.length;
        drift = scanSurfaces.length !== surfaceCount;
      }
    }
  } catch { /* scan.json missing or malformed */ }

  // Check for legacy fields
  const legacyFields: string[] = [];
  if ('buildPackage' in anaContent) legacyFields.push('buildPackage');
  if ('testPackage' in anaContent) legacyFields.push('testPackage');

  const hasWarnings = missingTest.length > 0 || drift || legacyFields.length > 0;

  return {
    status: surfaceCount === 0 ? 'pass' : (hasWarnings ? 'warn' : 'pass'),
    count: surfaceCount,
    missing_test: missingTest,
    drift,
    drift_scan_count: driftScanCount,
    legacy_fields: legacyFields,
  };
}

/**
 * Detect stale work items.
 *
 * Reads `.saves.json` files under `.ana/plans/active/` to find the most recent
 * `saved_at` timestamp per work item. Items stalled >14 days without an active
 * worktree are reported.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Array of stale work items
 */
function detectStaleWork(projectRoot: string): StaleWorkItem[] {
  const activePlansDir = path.join(projectRoot, '.ana', 'plans', 'active');
  const staleItems: StaleWorkItem[] = [];

  let slugDirs: string[];
  try {
    slugDirs = fs.readdirSync(activePlansDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {
    return [];
  }

  const now = Date.now();

  for (const slug of slugDirs) {
    // Skip items with active worktrees
    if (worktreeExists(projectRoot, slug)) {
      continue;
    }

    const savesPath = path.join(activePlansDir, slug, '.saves.json');
    let mostRecentTimestamp: number | null = null;
    let stage = 'unknown';

    try {
      const savesContent = fs.readFileSync(savesPath, 'utf-8');
      const saves = JSON.parse(savesContent);

      if (Array.isArray(saves)) {
        for (const save of saves) {
          if (save.saved_at) {
            const ts = new Date(save.saved_at).getTime();
            if (!isNaN(ts) && (mostRecentTimestamp === null || ts > mostRecentTimestamp)) {
              mostRecentTimestamp = ts;
              stage = save.type ? `ready-for-${inferNextStage(save.type)}` : 'unknown';
            }
          }
        }
      }
    } catch {
      // No saves file — skip this item
      continue;
    }

    if (mostRecentTimestamp !== null) {
      const daysSinceActivity = Math.floor((now - mostRecentTimestamp) / (1000 * 60 * 60 * 24));
      if (daysSinceActivity > STALE_WORK_DAYS) {
        staleItems.push({
          slug,
          days_stalled: daysSinceActivity,
          stage,
        });
      }
    }
  }

  return staleItems;
}

/**
 * Infer the next pipeline stage from the last saved artifact type.
 *
 * @param artifactType - The type of the last saved artifact
 * @returns Inferred next stage name
 */
function inferNextStage(artifactType: string): string {
  switch (artifactType) {
    case 'scope': return 'plan';
    case 'plan': return 'build';
    case 'spec': return 'build';
    case 'contract': return 'build';
    case 'build-report': return 'verify';
    case 'verify-report': return 'merge';
    default: return artifactType;
  }
}

// ── Maturity classification ──────────────────────────────────────────

/**
 * Classify project maturity based on proof chain runs and scan age.
 *
 * @param proofChain - Proof chain dimension result
 * @param context - Context dimension result
 * @returns Maturity classification
 */
function classifyMaturity(
  proofChain: ProofChainDimension,
  context: ContextDimension,
): Maturity {
  if (proofChain.runs >= ESTABLISHED_RUNS_THRESHOLD) {
    return 'established';
  }
  if (context.setup_state === 'complete' || context.sections_populated === context.sections_total || proofChain.runs > 0) {
    return 'setup';
  }
  return 'new';
}

// ── Terminal formatting ──────────────────────────────────────────────

/**
 * Format the terminal dashboard output.
 *
 * @param results - Complete doctor results
 * @returns Formatted terminal output string
 */
function formatTerminalOutput(results: DoctorResults): string {
  const lines: string[] = [];
  const d = results.dimensions;

  // CLI version
  if (d.cli_version.status === 'fail') {
    lines.push(`  ${chalk.red('✗')} CLI v${d.cli_version.current} → v${d.cli_version.latest} available`);
    lines.push(`    Run: npm update -g anatomia-cli`);
  } else {
    lines.push(`  ${chalk.green('✓')} CLI v${d.cli_version.current} (current)`);
  }

  // Scan freshness
  if (d.scan_freshness.status === 'fail') {
    const commitPart = d.scan_freshness.commits_since_scan !== null
      ? `, ${d.scan_freshness.commits_since_scan} commits`
      : '';
    lines.push(`  ${chalk.red('✗')} Scan stale (${d.scan_freshness.days_since_scan}d${commitPart} since scan)`);
    lines.push(`    Run: ana init`);
  } else if (d.scan_freshness.days_since_scan !== null) {
    const agePart = d.scan_freshness.days_since_scan === 0
      ? 'today'
      : `${d.scan_freshness.days_since_scan}d ago`;
    const commitPart = d.scan_freshness.commits_since_scan !== null
      ? `, ${d.scan_freshness.commits_since_scan} commits`
      : '';
    const depthPart = d.scan_freshness.depth ? `, ${d.scan_freshness.depth}` : '';
    lines.push(`  ${chalk.green('✓')} Scan fresh (${agePart}${commitPart}${depthPart})`);
  } else {
    lines.push(`  ${chalk.green('✓')} Scan fresh (today${d.scan_freshness.depth ? `, ${d.scan_freshness.depth}` : ''})`);
  }

  // Context — content quality is what matters, not how it got there
  if (d.context.sections_populated === d.context.sections_total) {
    lines.push(`  ${chalk.green('✓')} Context — ${d.context.sections_populated}/${d.context.sections_total} sections populated`);
  } else if (d.context.setup_state === 'in-progress') {
    lines.push(`  ${chalk.yellow('○')} Context — setup in progress (resume: ${agentCommand('setup')})`);
  } else if (d.context.setup_state === 'complete' && d.context.sections_populated < d.context.sections_total) {
    lines.push(`  ${chalk.yellow('○')} Context — ${d.context.sections_populated}/${d.context.sections_total} sections (setup completed but sections thin)`);
  } else {
    lines.push(`  ${chalk.yellow('○')} Context — scaffold (run: ${agentCommand('setup')})`);
  }

  // Skills
  if (d.skills.status === 'pass') {
    lines.push(`  ${chalk.green('✓')} Skills — ${d.skills.enriched} of ${d.skills.total} enriched`);
  } else if (d.skills.scaffold_defaults.length > 0) {
    lines.push(`  ${chalk.yellow('○')} Skills — ${d.skills.enriched} of ${d.skills.total} enriched (${d.skills.scaffold_defaults.join(', ')} still scaffold)`);
  } else {
    lines.push(`  ${chalk.yellow('○')} Skills — scaffold defaults`);
  }

  // Proof chain
  if (d.proof_chain.runs === 0) {
    lines.push(`  ${chalk.yellow('○')} Proof chain — no pipeline runs yet`);
  } else {
    const findingsPart = d.proof_chain.active_findings > 0
      ? `, ${d.proof_chain.active_findings} active findings`
      : '';
    const riskPart = d.proof_chain.risk_findings > 0
      ? ` (${d.proof_chain.risk_findings} risk)`
      : '';
    const trendPart = d.proof_chain.trend !== 'insufficient_data'
      ? `, ${d.proof_chain.trend}`
      : '';
    lines.push(`  ${chalk.green('✓')} Proof chain — ${d.proof_chain.runs} runs${findingsPart}${riskPart}${trendPart}`);
  }

  // Surfaces
  if (d.surfaces.count > 0) {
    const warnings: string[] = [];
    if (d.surfaces.missing_test.length > 0) {
      warnings.push(`${d.surfaces.missing_test.join(', ')} has no test command`);
    }
    if (d.surfaces.drift) {
      warnings.push(`scan detected ${d.surfaces.drift_scan_count} surfaces, ana.json has ${d.surfaces.count}. Run \`ana init\` to sync`);
    }
    if (warnings.length > 0) {
      lines.push(`  ${chalk.yellow('○')} Surfaces — ${d.surfaces.count} configured (${warnings.join('; ')})`);
    } else {
      lines.push(`  ${chalk.green('✓')} Surfaces — ${d.surfaces.count} configured`);
    }
  }

  // Legacy field warnings
  if (d.surfaces.legacy_fields.length > 0) {
    lines.push(`  ${chalk.yellow('⚠')} Legacy fields: ${d.surfaces.legacy_fields.join(', ')} — remove with \`ana config delete\``);
  }

  // Stale work items
  for (const item of results.stale_work) {
    lines.push('');
    lines.push(`  ${chalk.yellow('⚠')} ${item.slug}: stalled ${item.days_stalled}d at ${item.stage}`);
  }

  return lines.join('\n');
}

/**
 * Generate the footer message based on maturity and status.
 *
 * @param results - Complete doctor results
 * @returns Footer message string
 */
function formatFooter(results: DoctorResults): string {
  const hasRed = results.overall === 'fail';
  const redCount = [
    results.dimensions.cli_version.status,
    results.dimensions.scan_freshness.status,
  ].filter(s => s === 'fail').length;

  if (hasRed) {
    return `\n${redCount} issue${redCount !== 1 ? 's' : ''} found. Fix the ${chalk.red('✗')} items above.`;
  }

  if (results.maturity === 'new') {
    return `\nEverything's set up. Next: ${agentCommand('setup')}`;
  }

  if (results.maturity === 'setup') {
    return `\nReady for your first pipeline run. Next: ${agentCommand('')}`;
  }

  return `\nAll healthy.`;
}

// ── Main orchestrator ────────────────────────────────────────────────

/**
 * Run the doctor diagnostic and return structured results.
 *
 * Exported for testing — the command action handler wraps this with
 * terminal/JSON formatting and exit codes.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Complete doctor results
 */
export async function runDoctor(projectRoot: string): Promise<DoctorResults> {
  const [cliVersion, scanFreshness, context, skills] = await Promise.all([
    assessCliVersion(projectRoot),
    Promise.resolve(assessScanFreshness(projectRoot)),
    assessContext(projectRoot),
    assessSkills(projectRoot),
  ]);

  const proofChain = assessProofChain(projectRoot);
  const surfaces = assessSurfaces(projectRoot);
  const staleWork = detectStaleWork(projectRoot);
  const maturity = classifyMaturity(proofChain, context);

  const hasRed = [
    cliVersion.status,
    scanFreshness.status,
  ].some(s => s === 'fail');

  return {
    maturity,
    dimensions: {
      cli_version: cliVersion,
      scan_freshness: scanFreshness,
      context,
      skills,
      proof_chain: proofChain,
      surfaces,
    },
    stale_work: staleWork,
    overall: hasRed ? 'fail' : 'pass',
  };
}

/**
 * Register the doctor command on the given program.
 *
 * @param program - Commander program instance
 * @returns void
 */
export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check project health and configuration')
    .option('--json', 'Output JSON format')
    .action(async (options: { json?: boolean }) => {
      // Worktree guard
      if (isWorktreeDirectory()) {
        console.error(chalk.red('Run from the main project directory, not from a worktree.'));
        process.exit(1);
      }

      // Find project root — checks for .ana/ directory
      let projectRoot: string;
      try {
        projectRoot = findProjectRoot();
      } catch {
        console.error('No Anatomia installation found. Run: ana init');
        process.exit(1);
        return;
      }

      // Verify .ana/ exists
      if (!fs.existsSync(path.join(projectRoot, '.ana'))) {
        console.error('No Anatomia installation found. Run: ana init');
        process.exit(1);
        return;
      }

      const results = await runDoctor(projectRoot);

      if (options.json) {
        const output: DoctorJson = {
          command: 'doctor',
          timestamp: new Date().toISOString(),
          results,
        };
        console.log(JSON.stringify(output, null, 2));
      } else {
        console.log('');
        console.log(formatTerminalOutput(results));
        console.log(formatFooter(results));
      }

      process.exit(results.overall === 'fail' ? 1 : 0);
    });
}
