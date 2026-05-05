/**
 * ana proof [slug] - Display proof chain entry for completed work
 *
 * With no arguments: displays a summary table of all proof history entries.
 * With a slug: displays a detailed terminal card for that specific entry.
 *
 * Reads .ana/proof_chain.json and displays:
 * - Summary table: slug, result, assertion ratio, date (no slug)
 * - Detail card: feature name, result, contract, assertions, timing, deviations (with slug)
 *
 * Read-only operation - creates no files, modifies nothing.
 *
 * Usage:
 *   ana proof               Display summary table of all proofs
 *   ana proof --json        Output full proof chain as JSON
 *   ana proof {slug}        Display proof detail for work item
 *   ana proof {slug} --json Output detail JSON format
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { globSync } from 'glob';
import type { ProofChainEntry, ProofChain } from '../types/proof.js';
import { findProjectRoot, validateSkillName } from '../utils/validators.js';
import { getProofContext, wrapJsonResponse, wrapJsonError, generateDashboard, computeChainHealth, computeHealthReport, computeFirstPassRate, computeStaleness, truncateSummary, findFindingById, MIN_ENTRIES_FOR_TREND } from '../utils/proofSummary.js';
import type { ProofContextResult } from '../utils/proofSummary.js';
import { readArtifactBranch, getCurrentBranch, readCoAuthor, runGit } from '../utils/git-operations.js';

/**
 * Box-drawing characters for terminal output
 * Compatible across iTerm, Terminal.app, VS Code terminal, Windows Terminal
 */
const BOX = {
  horizontal: '\u2500', // ─
  vertical: '\u2502', // │
  topLeft: '\u250C', // ┌
  topRight: '\u2510', // ┐
  bottomLeft: '\u2514', // └
  bottomRight: '\u2518', // ┘
};

/**
 * Factory that creates an exitError closure for proof subcommands.
 *
 * Each subcommand captures its command name, proof chain path, and JSON mode.
 * The returned closure reads the chain, formats the error (JSON or console),
 * prints contextual hints based on the error code, and exits with code 1.
 *
 * Hints map: keys are error codes, values are arrays of hint lines.
 * Context-based hints are handled via a formatHint callback for complex cases
 * (e.g., checking context keys like 'promoted_to' or 'closed_by').
 *
 * @param opts - Factory options
 * @param opts.commandName - Command name for JSON envelope (e.g., "proof close")
 * @param opts.proofChainPath - Absolute path to proof_chain.json
 * @param opts.proofRoot - Project root for reading artifact branch
 * @param opts.useJson - Whether to output JSON format
 * @param opts.hints - Static hints map: error code → array of console lines
 * @param opts.formatHint - Callback for context-dependent hints; returns lines or null to fall through
 * @returns Closure that formats error output and exits with code 1
 */
function createExitError(opts: {
  commandName: string;
  proofChainPath: string;
  proofRoot: string;
  useJson: boolean;
  hints?: Record<string, string[]>;
  formatHint?: (code: string, context: Record<string, unknown>) => string[] | null;
}): (code: string, message: string, context?: Record<string, unknown>) => never {
  return (code: string, message: string, context: Record<string, unknown> = {}): never => {
    let chain: ProofChain | null = null;
    try {
      if (fs.existsSync(opts.proofChainPath)) {
        chain = JSON.parse(fs.readFileSync(opts.proofChainPath, 'utf-8'));
      }
    } catch { /* use null */ }

    if (opts.useJson) {
      console.log(JSON.stringify(wrapJsonError(opts.commandName, code, message, context, chain), null, 2));
    } else {
      console.error(chalk.red(`Error: ${message}`));
      // Try formatHint callback first (for context-dependent hints)
      const dynamicHints = opts.formatHint?.(code, context);
      if (dynamicHints) {
        for (const line of dynamicHints) {
          console.error(line);
        }
      } else if (opts.hints && opts.hints[code]) {
        for (const line of opts.hints[code]) {
          console.error(line);
        }
      }
    }
    process.exit(1);
  };
}

/**
 * Pull latest changes before reading the proof chain.
 *
 * Checks for remotes and pulls with rebase. On conflict, exits with error.
 * On network failure, warns and continues with local data.
 *
 * @param proofRoot - Project root directory
 */
function pullBeforeRead(proofRoot: string): void {
  const remotes = runGit(['remote'], { cwd: proofRoot }).stdout;
  if (remotes) {
    const pullResult = runGit(['pull', '--rebase'], { cwd: proofRoot });
    if (pullResult.exitCode !== 0) {
      const errorMessage = pullResult.stderr;
      if (errorMessage.includes('conflict') || errorMessage.includes('Cannot rebase')) {
        console.error(chalk.red('Error: Pull failed due to conflicts. Resolve conflicts and try again.'));
        process.exit(1);
      }
      console.error(chalk.yellow('⚠ Warning: Pull failed (network error). Continuing with local data.'));
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
function commitAndPushProofChanges(options: {
  proofRoot: string;
  files: string[];
  message: string;
  coAuthor: string;
}): void {
  // Stage and commit
  runGit(['add', ...options.files], { cwd: options.proofRoot });
  const commitMessage = `${options.message}\n\nCo-authored-by: ${options.coAuthor}`;
  const commitResult = spawnSync('git', ['commit', '-m', commitMessage], { stdio: 'pipe', cwd: options.proofRoot });
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
  const pullResult = runGit(['pull', '--rebase'], { cwd: options.proofRoot });
  if (pullResult.exitCode !== 0) {
    const pullStderr = pullResult.stderr;
    if (pullStderr.includes('conflict') || pullStderr.includes('Cannot rebase') || pullStderr.includes('CONFLICT')) {
      // Abort the rebase to clean up
      runGit(['rebase', '--abort'], { cwd: options.proofRoot });
      console.error(chalk.yellow('  Committed locally. Push failed after retry — run `git push`'));
      return;
    }
    // Network failure on pull — can't retry
    console.error(chalk.yellow('  Committed locally. Push failed after retry — run `git push`'));
    return;
  }

  // Retry push after successful pull
  const retryResult = runGit(['push'], { cwd: options.proofRoot });
  if (retryResult.exitCode !== 0) {
    console.error(chalk.yellow('  Committed locally. Push failed after retry — run `git push`'));
  }
}

// @ana A005, A006
/**
 * Severity ordering for display sorting: risk → debt → observation → unclassified
 */
const SEVERITY_ORDER: Record<string, number> = { risk: 0, debt: 1, observation: 2 };

/**
 * Get status icon for assertion status
 *
 * @param status - Assertion status (SATISFIED, UNSATISFIED, DEVIATED, UNCOVERED)
 * @returns Colored icon character
 */
function getStatusIcon(status: string): string {
  switch (status.toUpperCase()) {
    case 'SATISFIED':
      return chalk.green('✓');
    case 'UNSATISFIED':
      return chalk.red('✗');
    case 'DEVIATED':
      return chalk.yellow('⚠');
    case 'UNVERIFIED':
      return chalk.gray('?');
    case 'UNCOVERED':
      return chalk.gray('?');
    default:
      return chalk.gray('·');
  }
}

/**
 * Format human-readable terminal output
 *
 * @param entry - Proof chain entry to display
 * @returns Formatted terminal output string
 */
function formatHumanReadable(entry: ProofChainEntry): string {
  const lines: string[] = [];

  // Parse completed_at for timestamp
  const completedDate = new Date(entry.completed_at);
  const dateStr = completedDate.toISOString().split('T')[0];
  const timeStr = completedDate.toTimeString().slice(0, 5);
  const timestamp = `${dateStr} ${timeStr}`;

  // Box width (fits in 80 columns)
  const boxWidth = 71;
  const innerWidth = boxWidth - 2;

  // Header box
  const titleLine = `  ana proof`;
  const featureLine = `  ${entry.feature}`;
  const padding = innerWidth - featureLine.length - timestamp.length;
  const featureWithTimestamp = `${featureLine}${' '.repeat(Math.max(1, padding))}${timestamp}`;

  lines.push(chalk.cyan(BOX.topLeft + BOX.horizontal.repeat(innerWidth) + BOX.topRight));
  lines.push(chalk.cyan(BOX.vertical) + chalk.bold(titleLine.padEnd(innerWidth)) + chalk.cyan(BOX.vertical));
  lines.push(chalk.cyan(BOX.vertical) + featureWithTimestamp.padEnd(innerWidth) + chalk.cyan(BOX.vertical));
  lines.push(chalk.cyan(BOX.bottomLeft + BOX.horizontal.repeat(innerWidth) + BOX.bottomRight));

  lines.push('');

  // Result
  const resultColor = entry.result === 'PASS' ? chalk.green : chalk.red;
  lines.push(`  Result: ${resultColor(entry.result)}`);

  lines.push('');

  // Contract section
  lines.push(chalk.bold('  Contract'));
  lines.push(chalk.gray('  ' + BOX.horizontal.repeat(8)));
  lines.push(`  ${entry.contract.satisfied}/${entry.contract.total} satisfied · ${entry.contract.unsatisfied} unsatisfied · ${entry.contract.deviated} deviated`);

  lines.push('');

  // Assertions section
  lines.push(chalk.bold('  Assertions'));
  lines.push(chalk.gray('  ' + BOX.horizontal.repeat(10)));

  for (const assertion of entry.assertions) {
    const icon = getStatusIcon(assertion.status);
    lines.push(`  ${icon} ${assertion.says}`);
  }

  lines.push('');

  // Timing section
  lines.push(chalk.bold('  Timing'));
  lines.push(chalk.gray('  ' + BOX.horizontal.repeat(6)));
  lines.push(`  ${'Total'.padEnd(12)} ${entry.timing.total_minutes} min`);

  // Only show phase breakdown if available
  if (entry.timing.think != null) {
    lines.push(`  ${'Think'.padEnd(12)} ${entry.timing.think} min`);
  }
  if (entry.timing.plan != null) {
    lines.push(`  ${'Plan'.padEnd(12)} ${entry.timing.plan} min`);
  }
  if (entry.timing.build != null) {
    lines.push(`  ${'Build'.padEnd(12)} ${entry.timing.build} min`);
  }
  if (entry.timing.verify != null) {
    lines.push(`  ${'Verify'.padEnd(12)} ${entry.timing.verify} min`);
  }

  // Findings section (only if there are findings)
  const findings = entry.findings || [];
  if (findings.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Findings'));
    lines.push(chalk.gray('  ' + BOX.horizontal.repeat(8)));

    const sortedFindings = [...findings].sort((a, b) => {
      const wa = a.severity ? (SEVERITY_ORDER[a.severity] ?? 3) : 3;
      const wb = b.severity ? (SEVERITY_ORDER[b.severity] ?? 3) : 3;
      return wa - wb;
    });

    const MAX_DISPLAY = 5;
    const displayed = sortedFindings.slice(0, MAX_DISPLAY);
    for (const finding of displayed) {
      if (finding.severity && finding.suggested_action) {
        lines.push(`  [${finding.severity} · ${finding.suggested_action}] ${finding.summary}`);
      } else {
        lines.push(`  ${finding.summary}`);
      }
    }

    if (sortedFindings.length > MAX_DISPLAY) {
      lines.push(`  ... and ${sortedFindings.length - MAX_DISPLAY} more`);
    }
  }

  // Build Concerns section (only if there are build concerns)
  const buildConcerns = entry.build_concerns || [];
  if (buildConcerns.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Build Concerns'));
    lines.push(chalk.gray('  ' + BOX.horizontal.repeat(14)));

    const sortedConcerns = [...buildConcerns].sort((a, b) => {
      const wa = a.severity ? (SEVERITY_ORDER[a.severity] ?? 3) : 3;
      const wb = b.severity ? (SEVERITY_ORDER[b.severity] ?? 3) : 3;
      return wa - wb;
    });

    const MAX_DISPLAY = 5;
    const displayedConcerns = sortedConcerns.slice(0, MAX_DISPLAY);
    for (const concern of displayedConcerns) {
      if (concern.severity && concern.suggested_action) {
        lines.push(`  [${concern.severity} · ${concern.suggested_action}] ${concern.summary}`);
      } else {
        lines.push(`  ${concern.summary}`);
      }
    }

    if (sortedConcerns.length > MAX_DISPLAY) {
      lines.push(`  ... and ${sortedConcerns.length - MAX_DISPLAY} more`);
    }
  }

  // Deviations section (only if there are deviations)
  const deviatedAssertions = entry.assertions.filter(a => a.status === 'DEVIATED' && a.deviation);
  if (deviatedAssertions.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Deviations'));
    lines.push(chalk.gray('  ' + BOX.horizontal.repeat(10)));

    for (const assertion of deviatedAssertions) {
      lines.push(`  ${assertion.id}: ${assertion.says}`);
      lines.push(`        → ${assertion.deviation}`);
    }
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Format health display for terminal output.
 *
 * Accepts either a HealthReport object or `0` for the zero-runs case
 * (chain missing or empty). Produces a box-header display matching
 * the proof card pattern from formatHumanReadable.
 *
 * @param reportOrZero - HealthReport or 0 for zero-runs
 * @returns Formatted terminal output string
 */
function formatHealthDisplay(reportOrZero: import('../types/proof.js').HealthReport | 0): string {
  const lines: string[] = [];
  const isZero = reportOrZero === 0;
  const runs = isZero ? 0 : reportOrZero.runs;

  // Date for header
  const dateStr = new Date().toISOString().split('T')[0] ?? '';

  // Box header — same dimensions as formatHumanReadable
  const boxWidth = 71;
  const innerWidth = boxWidth - 2;

  const titleLine = '  ana proof health';
  const runLabel = `${runs} ${runs !== 1 ? 'runs' : 'run'}`;
  const secondLine = `  ${runLabel}`;
  const padding = innerWidth - secondLine.length - dateStr.length;
  const secondWithDate = `${secondLine}${' '.repeat(Math.max(1, padding))}${dateStr}`;

  lines.push(chalk.cyan(BOX.topLeft + BOX.horizontal.repeat(innerWidth) + BOX.topRight));
  lines.push(chalk.cyan(BOX.vertical) + chalk.bold(titleLine.padEnd(innerWidth)) + chalk.cyan(BOX.vertical));
  lines.push(chalk.cyan(BOX.vertical) + secondWithDate.padEnd(innerWidth) + chalk.cyan(BOX.vertical));
  lines.push(chalk.cyan(BOX.bottomLeft + BOX.horizontal.repeat(innerWidth) + BOX.bottomRight));

  // Zero-runs: just show "No data." and return
  if (isZero || runs === 0) {
    lines.push('');
    lines.push('  No data.');
    lines.push('');
    return lines.join('\n');
  }

  const report = reportOrZero;

  // Quality section (renamed from Trajectory)
  lines.push('');
  lines.push(chalk.bold('  Quality'));
  lines.push(chalk.gray('  ' + BOX.horizontal.repeat(10)));

  if (report.trajectory.trend === 'no_classified_data') {
    lines.push('  Trend:      no classified data');
    lines.push('  Risks/run:  no classified data');
  } else {
    const trendDisplay = report.trajectory.trend === 'insufficient_data'
      ? `insufficient data (need ${MIN_ENTRIES_FOR_TREND}+ runs)`
      : report.trajectory.trend;
    lines.push(`  Trend:      ${trendDisplay}`);

    const last5 = report.trajectory.risks_per_run_last5 !== null
      ? String(report.trajectory.risks_per_run_last5)
      : 'no data';
    const all = report.trajectory.risks_per_run_all !== null
      ? String(report.trajectory.risks_per_run_all)
      : 'no data';

    const risksLine = `  Risks/run:  ${last5} (last 5) \u00b7 ${all} (all)`;
    lines.push(risksLine);
  }

  // Verification section — always shown when runs > 0
  if (report.verification) {
    lines.push('');
    lines.push(chalk.bold('  Verification'));
    lines.push(chalk.gray('  ' + BOX.horizontal.repeat(10)));

    lines.push(`  First-pass:  ${report.verification.first_pass_pct}% (${report.verification.first_pass_count} of ${report.verification.total_runs})`);
    lines.push(`  Caught:      ${report.verification.total_caught} issues before shipping`);
  }

  // Pipeline section — omitted when fewer than 3 entries have timing
  if (report.pipeline) {
    lines.push('');
    lines.push(chalk.bold('  Pipeline'));
    lines.push(chalk.gray('  ' + BOX.horizontal.repeat(10)));

    const parts: string[] = [];
    if (report.pipeline.median_scope !== null) parts.push(`scope ${report.pipeline.median_scope}m`);
    if (report.pipeline.median_build !== null) parts.push(`build ${report.pipeline.median_build}m`);
    if (report.pipeline.median_verify !== null) parts.push(`verify ${report.pipeline.median_verify}m`);
    const breakdown = parts.length > 0 ? ` (${parts.join(' \u00b7 ')})` : '';
    lines.push(`  Median:  ${report.pipeline.median_total}m${breakdown}`);
  }

  // Hot Spots section (renamed from Hot Modules) — omit when empty
  if (report.hot_modules.length > 0) {
    // Build basename map for disambiguation
    const basenameCounts = new Map<string, number>();
    for (const mod of report.hot_modules) {
      const base = path.basename(mod.file);
      basenameCounts.set(base, (basenameCounts.get(base) ?? 0) + 1);
    }

    lines.push('');
    lines.push(chalk.bold('  Hot Spots'));
    lines.push(chalk.gray('  ' + BOX.horizontal.repeat(10)));

    for (const mod of report.hot_modules) {
      const base = path.basename(mod.file);
      const displayName = (basenameCounts.get(base) ?? 0) > 1
        ? `${path.basename(path.dirname(mod.file))}/${base}`
        : base;

      const sevParts: string[] = [];
      if (mod.by_severity.risk > 0) sevParts.push(`${mod.by_severity.risk} risk`);
      if (mod.by_severity.debt > 0) sevParts.push(`${mod.by_severity.debt} debt`);
      if (mod.by_severity.observation > 0) sevParts.push(`${mod.by_severity.observation} obs`);
      if (mod.by_severity.unclassified > 0) sevParts.push(`${mod.by_severity.unclassified} unclassified`);

      const nameCol = displayName.padEnd(24);
      const findingsCol = `${mod.finding_count} findings (${sevParts.join(', ')})`;
      lines.push(`  ${nameCol}${findingsCol.padEnd(35)}${mod.entry_count} runs`);
    }
  }

  // Next Actions section — merged Promote + Recurring, capped at 5
  const MAX_NEXT_ACTIONS = 5;
  const nextActions: Array<{ label: string; sortKey: number }> = [];

  // Promote candidates → "Promote:" with severity badge
  const promoteCandidates = report.promotion_candidates.filter(c => c.suggested_action === 'promote');
  for (const c of promoteCandidates) {
    const summary = truncateSummary(c.summary, 100);
    const fileSuffix = c.file ? ` \u2014 ${path.basename(c.file)}` : '';
    nextActions.push({
      label: `  Promote: [${c.severity}] ${summary}${fileSuffix}`,
      sortKey: c.recurrence_count ?? 1,
    });
  }

  // Recurring scope candidates → "Fix:" with entry count
  const recurringCandidates = report.promotion_candidates.filter(
    c => c.suggested_action === 'scope' && (c.recurrence_count ?? 0) >= 2
  );
  for (const c of recurringCandidates) {
    const summary = truncateSummary(c.summary, 100);
    const fileSuffix = c.file ? ` \u2014 ${path.basename(c.file)}` : '';
    nextActions.push({
      label: `  Fix: ${summary}${fileSuffix} (${c.recurrence_count} entries)`,
      sortKey: c.recurrence_count ?? 1,
    });
  }

  // Sort by recurrence count descending, cap at 5
  nextActions.sort((a, b) => b.sortKey - a.sortKey);
  const cappedActions = nextActions.slice(0, MAX_NEXT_ACTIONS);

  if (cappedActions.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Next Actions'));
    lines.push(chalk.gray('  ' + BOX.horizontal.repeat(12)));

    for (const action of cappedActions) {
      lines.push(action.label);
    }
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Format human-readable summary table for list view
 *
 * @param entries - Proof chain entries to display
 * @returns Formatted table string
 */
function formatListTable(entries: ProofChainEntry[]): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold('  Proof History'));
  lines.push('');

  // Header row
  const slugCol = 'Slug'.padEnd(24);
  const resultCol = 'Result'.padEnd(9);
  const assertCol = 'Assertions'.padEnd(13);
  const dateCol = 'Date';
  lines.push(chalk.bold(`  ${slugCol}${resultCol}${assertCol}${dateCol}`));

  // Sort entries: most recent first, undefined completed_at pushed to end
  const sorted = [...entries].sort((a, b) => {
    if (!a.completed_at && !b.completed_at) return 0;
    if (!a.completed_at) return 1;
    if (!b.completed_at) return -1;
    return b.completed_at.localeCompare(a.completed_at);
  });

  for (const entry of sorted) {
    const slug = entry.slug.padEnd(24);
    const resultColor = entry.result === 'PASS' ? chalk.green : chalk.red;
    const resultPadded = entry.result.padEnd(9);
    const result = resultColor(resultPadded);
    const ratio = `${entry.contract.satisfied}/${entry.contract.total}`;
    const assertions = ratio.padEnd(13);
    const date = entry.completed_at ? entry.completed_at.split('T')[0] ?? '' : '';
    lines.push(`  ${slug}${result}${assertions}${date}`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Register the `proof` command.
 *
 * @param program - Commander program instance.
 */
export function registerProofCommand(program: Command): void {
  const proofCommand = new Command('proof')
    .description('View proof chain entries, health, and findings')
    .argument('[slug]', 'Work item slug to display proof for')
    .option('--json', 'Output JSON format for programmatic consumption')
    .action(async (slug: string | undefined, options: { json?: boolean }) => {
    const proofRoot = findProjectRoot();
    const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');

    // List view: no slug provided
    if (!slug) {
      // Read chain if it exists
      let chain: ProofChain = { entries: [] };
      if (fs.existsSync(proofChainPath)) {
        try {
          const content = fs.readFileSync(proofChainPath, 'utf-8');
          chain = JSON.parse(content);
        } catch {
          // If file is corrupt, treat as empty
          chain = { entries: [] };
        }
      }

      const entries = chain.entries ?? [];

      if (options.json) {
        console.log(JSON.stringify(wrapJsonResponse('proof', { entries }, chain), null, 2));
      } else if (entries.length === 0) {
        console.log('No proofs yet.');
      } else {
        console.log(formatListTable(entries));
      }
      return;
    }

    // Detail view: slug provided (existing behavior)

    // Check if proof_chain.json exists
    if (!fs.existsSync(proofChainPath)) {
      console.error(chalk.red('Error: No proof chain found at .ana/proof_chain.json'));
      console.error('');
      console.error('Complete work items with `ana work complete {slug}` to generate proof entries.');
      process.exit(1);
    }

    // Read and parse proof chain
    let chain: ProofChain;
    try {
      const content = fs.readFileSync(proofChainPath, 'utf-8');
      chain = JSON.parse(content);
    } catch (error) {
      console.error(chalk.red('Error: Failed to parse proof_chain.json'));
      if (error instanceof Error) {
        console.error(chalk.gray(error.message));
      }
      process.exit(1);
    }

    // Find entry by slug
    const entry = chain.entries?.find(e => e.slug === slug);
    if (!entry) {
      console.error(chalk.red(`Error: No proof found for slug "${slug}"`));
      console.error('');
      console.error('Run `ana work status` to see completed work items.');
      process.exit(1);
    }

    // Format and output
    if (options.json) {
      console.log(JSON.stringify(wrapJsonResponse(`proof ${slug}`, entry, chain), null, 2));
    } else {
      console.log(formatHumanReadable(entry));
    }
  });

  // Register context subcommand
  // Commander subcommands share parent options when parent has same flag.
  // Parent proof command defines --json, so context reads it from parent.
  const contextCommand = new Command('context')
    .description('Query proof chain for context about specific files')
    .argument('<files...>', 'File paths to query')
    .option('--json', 'Output JSON format')
    .action(async (files: string[], options: { json?: boolean }) => {
      const proofRoot = findProjectRoot();
      const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');

      // Check if proof chain exists
      if (!fs.existsSync(proofChainPath)) {
        console.log('No proof chain found. Complete pipeline cycles to build proof context.');
        return;
      }

      const results = getProofContext(files, proofRoot);

      // Check both own --json and parent's --json
      const parentOpts = proofCommand.opts();
      const useJson = options.json || parentOpts['json'];

      if (useJson) {
        const chainContent = fs.readFileSync(proofChainPath, 'utf-8');
        const chain: ProofChain = JSON.parse(chainContent);
        console.log(JSON.stringify(wrapJsonResponse('proof context', { results }, chain), null, 2));
        return;
      }

      // Human-readable output
      const outputs: string[] = [];
      for (const result of results) {
        outputs.push(formatContextResult(result));
      }

      console.log(outputs.join('\n───\n\n'));
    });

  proofCommand.addCommand(contextCommand);

  // Register close subcommand
  const closeCommand = new Command('close')
    .description('Close active findings with a reason')
    .argument('<ids...>', 'Finding IDs to close (e.g., F003 or F001 F002 F003)')
    .option('--reason <reason>', 'Why these findings no longer apply')
    .option('--dry-run', 'Show what would happen without making changes')
    .option('--json', 'Output JSON format')
    .action(async (ids: string[], options: { reason?: string; dryRun?: boolean; json?: boolean }) => {
      const proofRoot = findProjectRoot();
      const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');
      const parentOpts = proofCommand.opts();
      const useJson = options.json || parentOpts['json'];

      // @ana A009
      const exitError = createExitError({
        commandName: 'proof close',
        proofChainPath,
        proofRoot,
        useJson,
        hints: {
          REASON_REQUIRED: [
            '  Proof closures must explain why the finding no longer applies.',
            '  Usage: ana proof close {id} --reason "explanation"',
          ],
          FINDING_NOT_FOUND: ['  Run `ana proof audit` to see active findings.'],
        },
        formatHint: (code, context) => {
          if (code === 'ALREADY_CLOSED' && context['closed_by']) {
            const lines = [`  Closed by: ${context['closed_by']} on ${context['closed_at'] ?? 'unknown'}`];
            if (context['closed_reason']) {
              lines.push(`  Reason: ${context['closed_reason']}`);
            }
            return lines;
          }
          if (code === 'WRONG_BRANCH') {
            const artifactBranch = readArtifactBranch(proofRoot);
            return [`  Run: git checkout ${artifactBranch}`];
          }
          return null;
        },
      });

      // Validate --reason is provided
      if (!options.reason) {
        exitError('REASON_REQUIRED', '--reason is required.');
        return;
      }

      // Branch check: must be on artifact branch (skip for dry-run — it's read-only)
      if (!options.dryRun) {
        const artifactBranch = readArtifactBranch(proofRoot);
        const currentBranch = getCurrentBranch();
        if (currentBranch !== artifactBranch) {
          exitError('WRONG_BRANCH', `Wrong branch. Switch to \`${artifactBranch}\` to close findings.`);
          return;
        }

        pullBeforeRead(proofRoot);
      }

      // Read chain
      if (!fs.existsSync(proofChainPath)) {
        exitError('NO_PROOF_CHAIN', 'No proof chain found.');
        return;
      }

      let chain: ProofChain;
      try {
        chain = JSON.parse(fs.readFileSync(proofChainPath, 'utf-8'));
      } catch {
        exitError('PARSE_ERROR', 'Failed to parse proof_chain.json.');
        return;
      }

      // Process each ID — collect results
      const closed: Array<{ id: string; category: string; summary: string; file: string | null; severity: string | null; previous_status: string; entry_slug: string; entry_feature: string }> = [];
      const skipped: Array<{ id: string; reason: string }> = [];

      for (const id of ids) {
        const result = findFindingById(chain, id);

        if (!result) {
          skipped.push({ id, reason: 'not found' });
          continue;
        }

        const foundFinding = result.finding as ProofChainEntry['findings'][0];
        const foundEntry = result.entry as ProofChainEntry;

        if (foundFinding.status === 'closed') {
          skipped.push({ id, reason: 'already closed' });
          continue;
        }

        const previousStatus = foundFinding.status ?? 'active';

        if (!options.dryRun) {
          foundFinding.status = 'closed';
          foundFinding.closed_reason = options.reason;
          foundFinding.closed_at = new Date().toISOString();
          foundFinding.closed_by = 'human';
        }

        closed.push({
          id: foundFinding.id,
          category: foundFinding.category,
          summary: foundFinding.summary,
          file: foundFinding.file,
          severity: foundFinding.severity ?? null,
          previous_status: previousStatus,
          entry_slug: foundEntry.slug,
          entry_feature: foundEntry.feature,
        });
      }

      // All IDs failed — exit with error
      if (closed.length === 0) {
        if (ids.length === 1 && skipped.length === 1) {
          const skip = skipped[0]!;
          if (skip.reason === 'not found') {
            exitError('FINDING_NOT_FOUND', `Finding "${skip.id}" not found.`);
          } else {
            const original = findFindingById(chain, skip.id);
            const originalFinding = original?.finding as ProofChainEntry['findings'][0] | undefined;
            exitError('ALREADY_CLOSED', `Finding "${skip.id}" is already closed.`, {
              closed_by: originalFinding?.closed_by ?? 'unknown',
              closed_at: originalFinding?.closed_at ?? 'unknown',
              closed_reason: originalFinding?.closed_reason ?? '',
            });
          }
        } else {
          exitError('ALL_FAILED', `All ${ids.length} finding IDs failed to close.`);
        }
        return;
      }

      // Dry run — report without mutating
      if (options.dryRun) {
        if (useJson) {
          console.log(JSON.stringify(wrapJsonResponse('proof close', {
            reason: options.reason,
            closed: closed.map(c => ({ id: c.id, category: c.category, summary: c.summary, file: c.file, previous_status: c.previous_status })),
            skipped,
            dry_run: true,
          }, chain), null, 2));
        } else {
          console.log('Dry run — no changes will be made.');
          console.log('');
          if (closed.length > 0) {
            console.log(`Would close ${closed.length} finding${closed.length !== 1 ? 's' : ''}:`);
            for (const c of closed) {
              console.log(`  ${c.id} ${chalk.dim(`[${c.category}]`)} ${c.summary} — ${c.file ?? 'no file'} (${c.previous_status} → closed)`);
            }
          }
          if (skipped.length > 0) {
            console.log('');
            console.log(`Would skip ${skipped.length}:`);
            for (const s of skipped) {
              console.log(`  ${s.id} — ${s.reason}`);
            }
          }
        }
        return;
      }

      // Write updated chain
      fs.writeFileSync(proofChainPath, JSON.stringify(chain, null, 2));

      // Regenerate PROOF_CHAIN.md
      const health = computeChainHealth(chain);
      const dashboardMd = generateDashboard(chain.entries, {
        runs: health.chain_runs,
        active: health.findings.active,
        lessons: health.findings.lesson,
        promoted: health.findings.promoted,
        closed: health.findings.closed,
      });
      const chainMdPath = path.join(proofRoot, '.ana', 'PROOF_CHAIN.md');
      fs.writeFileSync(chainMdPath, dashboardMd);

      // Git: stage, commit, push — one commit for the batch
      const coAuthor = readCoAuthor(proofRoot);
      const idList = closed.length <= 3
        ? closed.map(c => c.id).join(', ')
        : `${closed.slice(0, 2).map(c => c.id).join(', ')}, ... (${closed.length} total)`;
      commitAndPushProofChanges({
        proofRoot,
        files: ['.ana/proof_chain.json', '.ana/PROOF_CHAIN.md'],
        message: `[proof] Close ${idList}: ${options.reason}`,
        coAuthor,
      });

      // Output
      if (useJson) {
        if (ids.length === 1 && closed.length === 1 && skipped.length === 0) {
          // Single-ID backward-compatible JSON
          const c = closed[0]!;
          console.log(JSON.stringify(wrapJsonResponse('proof close', {
            finding: {
              id: c.id,
              category: c.category,
              summary: c.summary,
              file: c.file,
              severity: c.severity,
              entry_slug: c.entry_slug,
              entry_feature: c.entry_feature,
            },
            previous_status: c.previous_status,
            new_status: 'closed',
            reason: options.reason,
            closed_by: 'human',
          }, chain), null, 2));
        } else {
          console.log(JSON.stringify(wrapJsonResponse('proof close', {
            reason: options.reason,
            closed: closed.map(c => ({ id: c.id, category: c.category, summary: c.summary, file: c.file, previous_status: c.previous_status })),
            skipped,
            dry_run: false,
          }, chain), null, 2));
        }
      } else if (closed.length === 1 && skipped.length === 0) {
        // Single-ID backward-compatible output
        const c = closed[0]!;
        console.log(`✓ Closed ${c.id}: ${options.reason}`);
        console.log(`  ${chalk.dim(`[${c.category}]`)} ${c.summary} — ${c.file ?? 'no file'}`);
        console.log(`  ${c.previous_status} → closed (by: human)`);
        console.log('');
        console.log(chalk.gray(`Chain: ${health.chain_runs} ${health.chain_runs !== 1 ? 'runs' : 'run'} · ${health.findings.active} active finding${health.findings.active !== 1 ? 's' : ''}`));
      } else {
        // Multi-ID output
        const total = closed.length + skipped.length;
        console.log(`✓ Closed ${closed.length} of ${total} findings: ${options.reason}`);
        for (const c of closed) {
          console.log(`  ${c.id} ${chalk.dim(`[${c.category}]`)} ${c.summary} — ${c.file ?? 'no file'} (${c.previous_status} → closed)`);
        }
        for (const s of skipped) {
          console.log(`  ✗ ${s.id} — ${s.reason} (skipped)`);
        }
        console.log('');
        console.log(chalk.gray(`Chain: ${health.chain_runs} ${health.chain_runs !== 1 ? 'runs' : 'run'} · ${health.findings.active} active finding${health.findings.active !== 1 ? 's' : ''}`));
      }
    });

  proofCommand.addCommand(closeCommand);

  // Register lesson subcommand
  const lessonCommand = new Command('lesson')
    .description('Record findings as institutional lessons')
    .argument('<ids...>', 'Finding IDs to record as lessons (e.g., F003 or F001 F002)')
    .option('--reason <reason>', 'Why this is being recorded as a lesson')
    .option('--dry-run', 'Show what would happen without making changes')
    .option('--json', 'Output JSON format')
    .action(async (ids: string[], options: { reason?: string; dryRun?: boolean; json?: boolean }) => {
      const proofRoot = findProjectRoot();
      const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');
      const parentOpts = proofCommand.opts();
      const useJson = options.json || parentOpts['json'];

      const exitError = createExitError({
        commandName: 'proof lesson',
        proofChainPath,
        proofRoot,
        useJson,
        hints: {
          REASON_REQUIRED: [
            '  Lessons must explain the institutional decision.',
            '  Usage: ana proof lesson {id} --reason "explanation"',
          ],
          FINDING_NOT_FOUND: ['  Run `ana proof audit` to see active findings.'],
        },
        formatHint: (code, context) => {
          if (code === 'ALREADY_CLOSED' && context['closed_by']) {
            const lines = [`  Closed by: ${context['closed_by']} on ${context['closed_at'] ?? 'unknown'}`];
            if (context['closed_reason']) {
              lines.push(`  Reason: ${context['closed_reason']}`);
            }
            return lines;
          }
          if (code === 'ALREADY_PROMOTED' && context['promoted_to']) {
            return [`  Promoted to: ${context['promoted_to']}`];
          }
          if (code === 'WRONG_BRANCH') {
            const artifactBranch = readArtifactBranch(proofRoot);
            return [`  Run: git checkout ${artifactBranch}`];
          }
          return null;
        },
      });

      // Validate --reason is provided
      if (!options.reason) {
        exitError('REASON_REQUIRED', '--reason is required.');
        return;
      }

      // Branch check: must be on artifact branch (skip for dry-run — it's read-only)
      if (!options.dryRun) {
        const artifactBranch = readArtifactBranch(proofRoot);
        const currentBranch = getCurrentBranch();
        if (currentBranch !== artifactBranch) {
          exitError('WRONG_BRANCH', `Wrong branch. Switch to \`${artifactBranch}\` to record lessons.`);
          return;
        }

        pullBeforeRead(proofRoot);
      }

      // Read chain
      if (!fs.existsSync(proofChainPath)) {
        exitError('NO_PROOF_CHAIN', 'No proof chain found.');
        return;
      }

      let chain: ProofChain;
      try {
        chain = JSON.parse(fs.readFileSync(proofChainPath, 'utf-8'));
      } catch {
        exitError('PARSE_ERROR', 'Failed to parse proof_chain.json.');
        return;
      }

      // Process each ID — collect results
      const lessoned: Array<{ id: string; category: string; summary: string; file: string | null; severity: string | null; previous_status: string; entry_slug: string; entry_feature: string }> = [];
      const skipped: Array<{ id: string; reason: string }> = [];

      for (const id of ids) {
        const result = findFindingById(chain, id);

        if (!result) {
          skipped.push({ id, reason: 'not found' });
          continue;
        }

        const foundFinding = result.finding as ProofChainEntry['findings'][0];
        const foundEntry = result.entry as ProofChainEntry;

        if (foundFinding.status === 'closed') {
          skipped.push({ id, reason: 'already closed' });
          continue;
        }

        if (foundFinding.status === 'promoted') {
          skipped.push({ id, reason: 'already promoted' });
          continue;
        }

        if (foundFinding.status === 'lesson') {
          skipped.push({ id, reason: 'already a lesson' });
          continue;
        }

        const previousStatus = foundFinding.status ?? 'active';

        if (!options.dryRun) {
          foundFinding.status = 'lesson';
          foundFinding.closed_reason = options.reason;
          foundFinding.closed_at = new Date().toISOString();
          foundFinding.closed_by = 'human';
        }

        lessoned.push({
          id: foundFinding.id,
          category: foundFinding.category,
          summary: foundFinding.summary,
          file: foundFinding.file,
          severity: foundFinding.severity ?? null,
          previous_status: previousStatus,
          entry_slug: foundEntry.slug,
          entry_feature: foundEntry.feature,
        });
      }

      // All IDs failed — exit with error
      if (lessoned.length === 0) {
        if (ids.length === 1 && skipped.length === 1) {
          const skip = skipped[0]!;
          if (skip.reason === 'not found') {
            exitError('FINDING_NOT_FOUND', `Finding "${skip.id}" not found.`);
          } else if (skip.reason === 'already closed') {
            const original = findFindingById(chain, skip.id);
            const originalFinding = original?.finding as ProofChainEntry['findings'][0] | undefined;
            exitError('ALREADY_CLOSED', `Finding "${skip.id}" is already closed.`, {
              closed_by: originalFinding?.closed_by ?? 'unknown',
              closed_at: originalFinding?.closed_at ?? 'unknown',
              closed_reason: originalFinding?.closed_reason ?? '',
            });
          } else if (skip.reason === 'already promoted') {
            const original = findFindingById(chain, skip.id);
            const originalFinding = original?.finding as ProofChainEntry['findings'][0] | undefined;
            exitError('ALREADY_PROMOTED', `Finding "${skip.id}" is already promoted.`, {
              promoted_to: originalFinding?.promoted_to ?? 'unknown',
            });
          } else {
            exitError('ALREADY_LESSON', `Finding "${skip.id}" is already a lesson.`);
          }
        } else {
          exitError('ALL_FAILED', `All ${ids.length} finding IDs failed to record as lessons.`);
        }
        return;
      }

      // Dry run — report without mutating
      if (options.dryRun) {
        if (useJson) {
          console.log(JSON.stringify(wrapJsonResponse('proof lesson', {
            reason: options.reason,
            lessoned: lessoned.map(l => ({ id: l.id, category: l.category, summary: l.summary, file: l.file, previous_status: l.previous_status })),
            skipped,
            dry_run: true,
          }, chain), null, 2));
        } else {
          console.log('Dry run — no changes will be made.');
          console.log('');
          if (lessoned.length > 0) {
            console.log(`Would record ${lessoned.length} lesson${lessoned.length !== 1 ? 's' : ''}:`);
            for (const l of lessoned) {
              console.log(`  ${l.id} ${chalk.dim(`[${l.severity ?? 'unclassified'} · ${l.category}]`)} ${l.summary} — ${l.file ?? 'no file'}`);
            }
          }
          if (skipped.length > 0) {
            console.log('');
            console.log(`Would skip ${skipped.length}:`);
            for (const s of skipped) {
              console.log(`  ${s.id} — ${s.reason}`);
            }
          }
        }
        return;
      }

      // Write updated chain
      fs.writeFileSync(proofChainPath, JSON.stringify(chain, null, 2));

      // Regenerate PROOF_CHAIN.md
      const health = computeChainHealth(chain);
      const dashboardMd = generateDashboard(chain.entries, {
        runs: health.chain_runs,
        active: health.findings.active,
        lessons: health.findings.lesson,
        promoted: health.findings.promoted,
        closed: health.findings.closed,
      });
      const chainMdPath = path.join(proofRoot, '.ana', 'PROOF_CHAIN.md');
      fs.writeFileSync(chainMdPath, dashboardMd);

      // Git: stage, commit, push
      const coAuthor = readCoAuthor(proofRoot);
      const idList = lessoned.length <= 3
        ? lessoned.map(l => l.id).join(', ')
        : `${lessoned.slice(0, 2).map(l => l.id).join(', ')}, ... (${lessoned.length} total)`;
      commitAndPushProofChanges({
        proofRoot,
        files: ['.ana/proof_chain.json', '.ana/PROOF_CHAIN.md'],
        message: `[proof] Lesson: ${idList}`,
        coAuthor,
      });

      // Output
      if (useJson) {
        if (ids.length === 1 && lessoned.length === 1 && skipped.length === 0) {
          const l = lessoned[0]!;
          console.log(JSON.stringify(wrapJsonResponse('proof lesson', {
            finding: {
              id: l.id,
              category: l.category,
              summary: l.summary,
              file: l.file,
              severity: l.severity,
              entry_slug: l.entry_slug,
              entry_feature: l.entry_feature,
            },
            previous_status: l.previous_status,
            new_status: 'lesson',
            reason: options.reason,
            closed_by: 'human',
          }, chain), null, 2));
        } else {
          console.log(JSON.stringify(wrapJsonResponse('proof lesson', {
            reason: options.reason,
            lessoned: lessoned.map(l => ({ id: l.id, category: l.category, summary: l.summary, file: l.file, previous_status: l.previous_status })),
            skipped,
            dry_run: false,
          }, chain), null, 2));
        }
      } else {
        console.log('');
        console.log('Lessons recorded:');
        for (const l of lessoned) {
          console.log(`  ${l.id} ${chalk.dim(`[${l.severity ?? 'unclassified'} · ${l.category}]`)} ${l.summary} — ${l.file ?? 'no file'}`);
        }
        if (skipped.length > 0) {
          console.log('');
          for (const s of skipped) {
            console.log(`  ✗ ${s.id} — ${s.reason} (skipped)`);
          }
        }
        console.log('');
        console.log(chalk.gray(`Committed: [proof] Lesson: ${lessoned.map(l => l.id).join(', ')}`));
      }
    });

  proofCommand.addCommand(lessonCommand);

  // Register promote subcommand
  const promoteCommand = new Command('promote')
    .description('Promote findings to a skill rule')
    .argument('<ids...>', 'Finding IDs to promote (e.g., F001 or F001 F002)')
    .option('--skill <skill>', 'Skill to promote to (e.g., coding-standards)')
    .option('--text <text>', 'Custom rule text (defaults to first finding\'s summary)')
    .option('--section <section>', 'Target section: rules or gotchas (default: rules)')
    .option('--force', 'Allow promoting a closed finding')
    .option('--json', 'Output JSON format')
    .action(async (ids: string[], options: { skill?: string; text?: string; section?: string; force?: boolean; json?: boolean }) => {
      const proofRoot = findProjectRoot();
      const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');
      const parentOpts = proofCommand.opts();
      const useJson = options.json || parentOpts['json'];

      // Discover available skills for contextual help
      const skillGlobs = globSync('.claude/skills/*/SKILL.md', { cwd: proofRoot });
      const availableSkills = skillGlobs.map(p => path.basename(path.dirname(p)));

      // @ana A010
      const exitError = createExitError({
        commandName: 'proof promote',
        proofChainPath,
        proofRoot,
        useJson,
        hints: {
          SKILL_REQUIRED: [
            `  Available skills: ${availableSkills.join(', ')}`,
            '  Usage: ana proof promote {id} --skill {name}',
          ],
          SKILL_NOT_FOUND: [`  Available skills: ${availableSkills.join(', ')}`],
          FINDING_NOT_FOUND: ['  Run `ana proof audit` to see active findings.'],
        },
        formatHint: (code, context) => {
          if (code === 'ALREADY_PROMOTED' && context['promoted_to']) {
            return [`  Promoted to: ${context['promoted_to']}`];
          }
          if (code === 'ALREADY_CLOSED' && context['closed_by']) {
            const lines = [`  Closed by: ${context['closed_by']} on ${context['closed_at'] ?? 'unknown'}`];
            if (context['closed_reason']) {
              lines.push(`  Reason: ${context['closed_reason']}`);
            }
            lines.push('  Use --force to promote a closed finding.');
            return lines;
          }
          if (code === 'WRONG_BRANCH') {
            const artifactBranch = readArtifactBranch(proofRoot);
            return [`  Run: git checkout ${artifactBranch}`];
          }
          return null;
        },
      });

      // Validate --skill is provided
      if (!options.skill) {
        exitError('SKILL_REQUIRED', '--skill is required. Available skills: ' + availableSkills.join(', '));
        return;
      }

      // Validate --text is not empty when provided
      if (options.text !== undefined && options.text.trim() === '') {
        exitError('TEXT_EMPTY', '--text cannot be empty.');
        return;
      }

      // Validate --section
      const sectionName = options.section ?? 'rules';
      if (sectionName !== 'rules' && sectionName !== 'gotchas') {
        exitError('INVALID_SECTION', `Invalid section "${sectionName}". Valid values: rules, gotchas`);
        return;
      }
      const sectionHeading = sectionName === 'gotchas' ? '## Gotchas' : '## Rules';

      // Validate skill exists
      const skillName = options.skill;
      const skillRelPath = `.claude/skills/${skillName}/SKILL.md`;
      const skillAbsPath = path.join(proofRoot, '.claude', 'skills', skillName, 'SKILL.md');
      if (!fs.existsSync(skillAbsPath)) {
        exitError('SKILL_NOT_FOUND', `Skill "${skillName}" not found.`);
        return;
      }

      // Branch check: must be on artifact branch
      const artifactBranch = readArtifactBranch(proofRoot);
      const currentBranch = getCurrentBranch();
      if (currentBranch !== artifactBranch) {
        exitError('WRONG_BRANCH', `Wrong branch. Switch to \`${artifactBranch}\` to promote findings.`);
        return;
      }

      pullBeforeRead(proofRoot);

      // Read chain
      if (!fs.existsSync(proofChainPath)) {
        exitError('NO_PROOF_CHAIN', 'No proof chain found.');
        return;
      }

      let chain: ProofChain;
      try {
        chain = JSON.parse(fs.readFileSync(proofChainPath, 'utf-8'));
      } catch {
        exitError('PARSE_ERROR', 'Failed to parse proof_chain.json.');
        return;
      }

      // Process each ID — collect results
      const promoted: Array<{ id: string; category: string; summary: string; file: string | null; severity: string | null; previous_status: string }> = [];
      const skipped: Array<{ id: string; reason: string }> = [];

      for (const id of ids) {
        const result = findFindingById(chain, id);

        if (!result) {
          skipped.push({ id, reason: 'not found' });
          continue;
        }

        const foundFinding = result.finding as ProofChainEntry['findings'][0];

        if (foundFinding.status === 'promoted') {
          skipped.push({ id, reason: 'already promoted' });
          continue;
        }

        if (foundFinding.status === 'closed' && !options.force) {
          skipped.push({ id, reason: 'already closed (use --force)' });
          continue;
        }

        const previousStatus = foundFinding.status ?? 'active';

        // Mutate the finding
        foundFinding.status = 'promoted';
        foundFinding.promoted_to = skillRelPath;

        promoted.push({
          id: foundFinding.id,
          category: foundFinding.category,
          summary: foundFinding.summary,
          file: foundFinding.file,
          severity: foundFinding.severity ?? null,
          previous_status: previousStatus,
        });
      }

      // All IDs failed — exit with error
      if (promoted.length === 0) {
        if (ids.length === 1 && skipped.length === 1) {
          const skip = skipped[0]!;
          if (skip.reason === 'not found') {
            exitError('FINDING_NOT_FOUND', `Finding "${skip.id}" not found.`);
          } else if (skip.reason === 'already promoted') {
            const original = findFindingById(chain, skip.id);
            const originalFinding = original?.finding as ProofChainEntry['findings'][0] | undefined;
            exitError('ALREADY_PROMOTED', `Finding "${skip.id}" is already promoted.`, {
              promoted_to: originalFinding?.promoted_to ?? 'unknown',
            });
          } else {
            const original = findFindingById(chain, skip.id);
            const originalFinding = original?.finding as ProofChainEntry['findings'][0] | undefined;
            exitError('ALREADY_CLOSED', `Finding "${skip.id}" is already closed.`, {
              closed_by: originalFinding?.closed_by ?? 'unknown',
              closed_at: originalFinding?.closed_at ?? 'unknown',
              closed_reason: originalFinding?.closed_reason ?? '',
            });
          }
        } else {
          exitError('ALL_FAILED', `All ${ids.length} finding IDs failed to promote.`);
        }
        return;
      }

      // Read skill file and append one rule
      let skillContent = fs.readFileSync(skillAbsPath, 'utf-8');
      const sectionIdx = skillContent.indexOf(sectionHeading);
      if (sectionIdx === -1) {
        exitError('SECTION_NOT_FOUND', `Skill file ${skillRelPath} has no ${sectionHeading} section.`);
        return;
      }

      // Determine rule text — use --text or first promoted finding's summary
      const firstPromoted = promoted[0]!;
      const ruleText = options.text ?? firstPromoted.summary;
      const ruleLine = `- ${ruleText}`;

      // Find section boundaries
      const sectionStart = sectionIdx + sectionHeading.length;
      const nextSectionIdx = skillContent.indexOf('\n## ', sectionStart);
      const sectionEnd = nextSectionIdx === -1 ? skillContent.length : nextSectionIdx;
      const sectionBody = skillContent.slice(sectionStart, sectionEnd);

      // Duplicate detection
      let duplicateWarning: string | null = null;
      const newWords = new Set(ruleText.replace(/[`*]/g, '').toLowerCase().split(/\s+/).filter(Boolean));
      const existingLines = sectionBody.split('\n').filter(l => l.trim().startsWith('-'));
      for (const line of existingLines) {
        const lineText = line.trim().replace(/^-\s*/, '').replace(/[`*]/g, '');
        const existingWords = new Set(lineText.toLowerCase().split(/\s+/).filter(Boolean));
        const intersection = new Set([...newWords].filter(w => existingWords.has(w)));
        const smallerSize = Math.min(newWords.size, existingWords.size);
        if (smallerSize > 0 && intersection.size / smallerSize > 0.5) {
          duplicateWarning = `Similar rule exists: "${lineText}"`;
          break;
        }
      }

      // Check for placeholder line and handle replacement vs append
      const placeholderRegex = /^[ \t]*\*Not yet captured[^*]*\*/m;
      const placeholderMatch = sectionBody.match(placeholderRegex);

      if (placeholderMatch) {
        const placeholderIdx = sectionStart + sectionBody.indexOf(placeholderMatch[0]);
        skillContent = skillContent.slice(0, placeholderIdx) + ruleLine + skillContent.slice(placeholderIdx + placeholderMatch[0].length);
      } else {
        const sectionLines = sectionBody.split('\n');
        let lastNonEmptyIdx = sectionLines.length - 1;
        while (lastNonEmptyIdx >= 0 && sectionLines[lastNonEmptyIdx]!.trim() === '') {
          lastNonEmptyIdx--;
        }

        const beforeSection = skillContent.slice(0, sectionStart);
        const afterSection = skillContent.slice(sectionEnd);
        const contentLines = sectionLines.slice(0, lastNonEmptyIdx + 1);
        contentLines.push(ruleLine);
        const trailingNewlines = sectionLines.slice(lastNonEmptyIdx + 1);
        const newSection = [...contentLines, ...trailingNewlines].join('\n');
        skillContent = beforeSection + newSection + afterSection;
      }

      // Write updated skill file
      fs.writeFileSync(skillAbsPath, skillContent);

      // Write updated chain
      fs.writeFileSync(proofChainPath, JSON.stringify(chain, null, 2));

      // Regenerate PROOF_CHAIN.md
      const health = computeChainHealth(chain);
      const dashboardMd = generateDashboard(chain.entries, {
        runs: health.chain_runs,
        active: health.findings.active,
        lessons: health.findings.lesson,
        promoted: health.findings.promoted,
        closed: health.findings.closed,
      });
      const chainMdPath = path.join(proofRoot, '.ana', 'PROOF_CHAIN.md');
      fs.writeFileSync(chainMdPath, dashboardMd);

      // Git: stage, commit, push — one commit for the batch
      const coAuthor = readCoAuthor(proofRoot);
      const idList = promoted.length <= 3
        ? promoted.map(p => p.id).join(', ')
        : `${promoted.slice(0, 2).map(p => p.id).join(', ')}, ... (${promoted.length} total)`;
      commitAndPushProofChanges({
        proofRoot,
        files: ['.ana/proof_chain.json', '.ana/PROOF_CHAIN.md', skillRelPath],
        message: `[proof] Promote ${idList} to ${skillName}`,
        coAuthor,
      });

      // Output
      if (useJson) {
        if (ids.length === 1 && promoted.length === 1 && skipped.length === 0) {
          // Single-ID backward-compatible JSON
          const p = promoted[0]!;
          const results: Record<string, unknown> = {
            finding: {
              id: p.id,
              category: p.category,
              summary: p.summary,
              file: p.file,
              severity: p.severity,
              suggested_action: null,
            },
            promoted_to: skillRelPath,
            rule_text: ruleLine,
            section: sectionHeading,
          };
          if (duplicateWarning) {
            results['duplicate_warning'] = duplicateWarning;
          }
          console.log(JSON.stringify(wrapJsonResponse('proof promote', results, chain), null, 2));
        } else {
          console.log(JSON.stringify(wrapJsonResponse('proof promote', {
            promoted: promoted.map(p => ({ id: p.id, category: p.category, summary: p.summary, file: p.file, previous_status: p.previous_status })),
            skipped,
            promoted_to: skillRelPath,
            rule_text: ruleLine,
            section: sectionHeading,
            duplicate_warning: duplicateWarning,
          }, chain), null, 2));
        }
      } else if (promoted.length === 1 && skipped.length === 0) {
        // Single-ID backward-compatible output
        const p = promoted[0]!;
        if (duplicateWarning) {
          console.log(chalk.yellow(`⚠ ${duplicateWarning}`));
        }
        console.log(`✓ Promoted ${p.id} to ${skillName}`);
        console.log(`  ${chalk.dim(`[${p.category}]`)} ${truncateSummary(p.summary, 100)} — ${p.file ?? 'no file'}`);
        console.log(`  ${p.previous_status} → promoted`);
        console.log(`  Rule: ${ruleLine}`);
        console.log(`  Section: ${sectionHeading}`);
        console.log(`  File: ${skillRelPath}`);
        console.log('');
        console.log(chalk.gray(`Chain: ${health.chain_runs} ${health.chain_runs !== 1 ? 'runs' : 'run'} · ${health.findings.active} active finding${health.findings.active !== 1 ? 's' : ''}`));
      } else {
        // Multi-ID output
        if (duplicateWarning) {
          console.log(chalk.yellow(`⚠ ${duplicateWarning}`));
        }
        console.log(`✓ Promoted ${promoted.length} findings to ${skillName}`);
        for (const p of promoted) {
          console.log(`  ${p.id} ${chalk.dim(`[${p.category}]`)} ${truncateSummary(p.summary, 100)} — ${p.file ?? 'no file'} (${p.previous_status} → promoted)`);
        }
        for (const s of skipped) {
          console.log(`  ✗ ${s.id} — ${s.reason} (skipped)`);
        }
        console.log(`  Rule: ${ruleLine}`);
        console.log(`  Section: ${sectionHeading}`);
        console.log(`  File: ${skillRelPath}`);
        console.log('');
        console.log(chalk.gray(`Chain: ${health.chain_runs} ${health.chain_runs !== 1 ? 'runs' : 'run'} · ${health.findings.active} active finding${health.findings.active !== 1 ? 's' : ''}`));
      }
    });

  proofCommand.addCommand(promoteCommand);

  // Register strengthen subcommand
  const strengthenCommand = new Command('strengthen')
    .description('Commit a skill file edit and mark findings as promoted')
    .argument('<ids...>', 'Finding IDs to strengthen (e.g., F001 or F001 F002)')
    .option('--skill <skill>', 'Skill whose file was edited (e.g., coding-standards)')
    .option('--reason <reason>', 'Why this skill was strengthened')
    .option('--force', 'Allow strengthening a closed finding')
    .option('--json', 'Output JSON format')
    .action(async (ids: string[], options: { skill?: string; reason?: string; force?: boolean; json?: boolean }) => {
      const proofRoot = findProjectRoot();
      const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');
      const parentOpts = proofCommand.opts();
      const useJson = options.json || parentOpts['json'];

      // @ana A011
      const exitError = createExitError({
        commandName: 'proof strengthen',
        proofChainPath,
        proofRoot,
        useJson,
        hints: {
          SKILL_REQUIRED: ['  Usage: ana proof strengthen <ids...> --skill <name> --reason "..."'],
          REASON_REQUIRED: ['  Usage: ana proof strengthen <ids...> --skill <name> --reason "..."'],
          FINDING_NOT_FOUND: ['  Run `ana proof audit` to see active findings.'],
        },
        formatHint: (code, context) => {
          if (code === 'SKILL_NOT_FOUND') {
            const skillsDir = path.join(proofRoot, '.claude', 'skills');
            if (fs.existsSync(skillsDir)) {
              const available = fs.readdirSync(skillsDir).filter(d => fs.statSync(path.join(skillsDir, d)).isDirectory());
              if (available.length > 0) {
                return [`  Available skills: ${available.join(', ')}`];
              }
            }
            return [];
          }
          if (code === 'NO_UNCOMMITTED_CHANGES') {
            return [
              '  Edit the skill file first, then run this command to commit the changes.',
              `  Usage: ana proof strengthen <ids...> --skill ${options.skill ?? '<name>'} --reason "..."`,
            ];
          }
          if (code === 'ALREADY_PROMOTED' && context['promoted_to']) {
            return [`  Promoted to: ${context['promoted_to']}`];
          }
          if (code === 'ALREADY_CLOSED' && context['closed_by']) {
            const lines = [`  Closed by: ${context['closed_by']} on ${context['closed_at'] ?? 'unknown'}`];
            if (context['closed_reason']) {
              lines.push(`  Reason: ${context['closed_reason']}`);
            }
            lines.push('  Use --force to strengthen a closed finding.');
            return lines;
          }
          if (code === 'WRONG_BRANCH') {
            const artifactBranch = readArtifactBranch(proofRoot);
            return [`  Run: git checkout ${artifactBranch}`];
          }
          return null;
        },
      });

      // Validate --skill is provided
      if (!options.skill) {
        exitError('SKILL_REQUIRED', '--skill is required.');
        return;
      }

      // Validate --reason is provided
      if (!options.reason) {
        exitError('REASON_REQUIRED', '--reason is required.');
        return;
      }

      // Validate skill name format
      try {
        validateSkillName(options.skill);
      } catch {
        exitError('INVALID_SKILL', 'Invalid skill name: contains invalid characters. Use kebab-case: coding-standards, api-patterns');
        return;
      }

      // Validate skill exists
      const skillName = options.skill;
      const skillRelPath = `.claude/skills/${skillName}/SKILL.md`;
      const skillAbsPath = path.join(proofRoot, '.claude', 'skills', skillName, 'SKILL.md');
      if (!fs.existsSync(skillAbsPath)) {
        exitError('SKILL_NOT_FOUND', `Skill "${skillName}" not found.`);
        return;
      }

      // Branch check: must be on artifact branch
      const artifactBranch = readArtifactBranch(proofRoot);
      const currentBranch = getCurrentBranch();
      if (currentBranch !== artifactBranch) {
        exitError('WRONG_BRANCH', `Wrong branch. Switch to \`${artifactBranch}\` to strengthen findings.`);
        return;
      }

      // Verify uncommitted changes exist for the skill file
      // Check both unstaged and staged changes
      let hasUncommittedChanges = false;
      try {
        const unstaged = runGit(['diff', '--name-only', '--', skillRelPath], { cwd: proofRoot }).stdout;
        const staged = runGit(['diff', '--name-only', '--cached', '--', skillRelPath], { cwd: proofRoot }).stdout;
        hasUncommittedChanges = unstaged.length > 0 || staged.length > 0;
      } catch {
        // git diff failed — treat as no changes
      }

      if (!hasUncommittedChanges) {
        exitError('NO_UNCOMMITTED_CHANGES', `No uncommitted changes to ${skillRelPath}`);
        return;
      }

      pullBeforeRead(proofRoot);

      // Read chain
      if (!fs.existsSync(proofChainPath)) {
        exitError('NO_PROOF_CHAIN', 'No proof chain found.');
        return;
      }

      let chain: ProofChain;
      try {
        chain = JSON.parse(fs.readFileSync(proofChainPath, 'utf-8'));
      } catch {
        exitError('PARSE_ERROR', 'Failed to parse proof_chain.json.');
        return;
      }

      // Process each ID — collect results
      const strengthened: Array<{ id: string; category: string; summary: string; file: string | null; severity: string | null; previous_status: string }> = [];
      const skipped: Array<{ id: string; reason: string }> = [];

      for (const id of ids) {
        const result = findFindingById(chain, id);

        if (!result) {
          skipped.push({ id, reason: 'not found' });
          continue;
        }

        const foundFinding = result.finding as ProofChainEntry['findings'][0];

        if (foundFinding.status === 'promoted') {
          skipped.push({ id, reason: 'already promoted' });
          continue;
        }

        if (foundFinding.status === 'closed' && !options.force) {
          skipped.push({ id, reason: 'already closed (use --force)' });
          continue;
        }

        const previousStatus = foundFinding.status ?? 'active';

        // Mutate the finding
        foundFinding.status = 'promoted';
        foundFinding.promoted_to = skillRelPath;

        strengthened.push({
          id: foundFinding.id,
          category: foundFinding.category,
          summary: foundFinding.summary,
          file: foundFinding.file,
          severity: foundFinding.severity ?? null,
          previous_status: previousStatus,
        });
      }

      // All IDs failed — exit with error
      if (strengthened.length === 0) {
        if (ids.length === 1 && skipped.length === 1) {
          const skip = skipped[0]!;
          if (skip.reason === 'not found') {
            exitError('FINDING_NOT_FOUND', `Finding "${skip.id}" not found.`);
          } else if (skip.reason === 'already promoted') {
            const original = findFindingById(chain, skip.id);
            const originalFinding = original?.finding as ProofChainEntry['findings'][0] | undefined;
            exitError('ALREADY_PROMOTED', `Finding "${skip.id}" is already promoted.`, {
              promoted_to: originalFinding?.promoted_to ?? 'unknown',
            });
          } else {
            const original = findFindingById(chain, skip.id);
            const originalFinding = original?.finding as ProofChainEntry['findings'][0] | undefined;
            exitError('ALREADY_CLOSED', `Finding "${skip.id}" is already closed.`, {
              closed_by: originalFinding?.closed_by ?? 'unknown',
              closed_at: originalFinding?.closed_at ?? 'unknown',
              closed_reason: originalFinding?.closed_reason ?? '',
            });
          }
        } else {
          exitError('ALL_FAILED', `All ${ids.length} finding IDs failed to strengthen.`);
        }
        return;
      }

      // Write updated chain
      fs.writeFileSync(proofChainPath, JSON.stringify(chain, null, 2));

      // Regenerate PROOF_CHAIN.MD
      const health = computeChainHealth(chain);
      const dashboardMd = generateDashboard(chain.entries, {
        runs: health.chain_runs,
        active: health.findings.active,
        lessons: health.findings.lesson,
        promoted: health.findings.promoted,
        closed: health.findings.closed,
      });
      const chainMdPath = path.join(proofRoot, '.ana', 'PROOF_CHAIN.md');
      fs.writeFileSync(chainMdPath, dashboardMd);

      // Git: stage skill file + proof chain files, commit, push — one commit for the batch
      const coAuthor = readCoAuthor(proofRoot);
      commitAndPushProofChanges({
        proofRoot,
        files: [skillRelPath, '.ana/proof_chain.json', '.ana/PROOF_CHAIN.md'],
        message: `[learn] Strengthen ${skillName}: ${options.reason}`,
        coAuthor,
      });

      // Output
      if (useJson) {
        console.log(JSON.stringify(wrapJsonResponse('proof strengthen', {
          skill: skillName,
          skill_path: skillRelPath,
          reason: options.reason,
          strengthened: strengthened.map(s => ({ id: s.id, category: s.category, summary: s.summary, file: s.file, previous_status: s.previous_status })),
          skipped,
        }, chain), null, 2));
      } else if (strengthened.length === 1 && skipped.length === 0) {
        const s = strengthened[0]!;
        console.log(`✓ Strengthened 1 finding → ${skillName}`);
        console.log(`  ${s.id} ${chalk.dim(`[${s.category}]`)} ${truncateSummary(s.summary, 100)} — ${s.file ?? 'no file'} (${s.previous_status} → promoted)`);
        console.log(`  Skill: ${skillRelPath}`);
        console.log(`  Reason: ${options.reason}`);
        console.log('');
        console.log(chalk.gray(`Chain: ${health.chain_runs} ${health.chain_runs !== 1 ? 'runs' : 'run'} · ${health.findings.active} active finding${health.findings.active !== 1 ? 's' : ''}`));
      } else {
        console.log(`✓ Strengthened ${strengthened.length} findings → ${skillName}`);
        for (const s of strengthened) {
          console.log(`  ${s.id} ${chalk.dim(`[${s.category}]`)} ${truncateSummary(s.summary, 100)} — ${s.file ?? 'no file'} (${s.previous_status} → promoted)`);
        }
        for (const sk of skipped) {
          console.log(`  ✗ ${sk.id} — ${sk.reason} (skipped)`);
        }
        console.log(`  Skill: ${skillRelPath}`);
        console.log(`  Reason: ${options.reason}`);
        console.log('');
        console.log(chalk.gray(`Chain: ${health.chain_runs} ${health.chain_runs !== 1 ? 'runs' : 'run'} · ${health.findings.active} active finding${health.findings.active !== 1 ? 's' : ''}`));
      }
    });

  proofCommand.addCommand(strengthenCommand);

  // Register audit subcommand
  const auditCommand = new Command('audit')
    .description('List active findings grouped by file')
    .option('--json', 'Output JSON format')
    .option('--full', 'Return all findings without truncation (requires --json)')
    .option('--severity <values>', 'Filter by severity (comma-separated: risk,debt,observation,unclassified)')
    .option('--entry <slug>', 'Filter to findings from a specific pipeline run')
    .action(async (options: { json?: boolean; full?: boolean; severity?: string; entry?: string }) => {
      const proofRoot = findProjectRoot();
      const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');
      const parentOpts = proofCommand.opts();
      const useJson = options.json || parentOpts['json'];

      // --full without --json: print usage hint and return
      if (options.full && !useJson) {
        console.log('The --full flag is designed for agent consumption. Use with --json:');
        console.log('  ana proof audit --json --full');
        return;
      }

      // Read chain (no branch check — audit is read-only)
      if (!fs.existsSync(proofChainPath)) {
        if (useJson) {
          console.log(JSON.stringify(wrapJsonResponse('proof audit', { total_active: 0, by_file: [] }, { entries: [] }), null, 2));
        } else {
          console.log('No proof chain found. Complete pipeline cycles to build proof data.');
        }
        return;
      }

      let chain: ProofChain;
      try {
        chain = JSON.parse(fs.readFileSync(proofChainPath, 'utf-8'));
      } catch {
        console.error(chalk.red('Error: Failed to parse proof_chain.json'));
        process.exit(1);
        return;
      }

      // Collect all active findings with entry context
      const activeFindings: Array<{
        id: string;
        category: string;
        summary: string;
        file: string | null;
        anchor: string | null;
        anchor_present: boolean;
        line?: number;
        age_days: number;
        severity: string;
        suggested_action: string;
        related_assertions?: string[];
        entry_slug: string;
        entry_feature: string;
      }> = [];

      for (const entry of chain.entries) {
        for (const finding of entry.findings || []) {
          if (finding.status && finding.status !== 'active') continue;

          // Compute age from entry's completed_at
          const completedAt = entry.completed_at ? new Date(entry.completed_at) : new Date();
          const ageDays = Math.floor((Date.now() - completedAt.getTime()) / (1000 * 60 * 60 * 24));

          // Check anchor_present by reading the file
          let anchorPresent = false;
          if (finding.file && finding.anchor) {
            try {
              const filePath = path.join(proofRoot, finding.file);
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                // Strip line reference from anchor (e.g., "census.ts:267-274" → "census")
                const anchorText = finding.anchor.replace(/\.\w+:\d+(-\d+)?$/, '').replace(/:\d+(-\d+)?$/, '');
                anchorPresent = content.includes(anchorText);
              }
            } catch { /* file read failed — anchor not present */ }
          }

          const auditFinding: typeof activeFindings[0] = {
            id: finding.id,
            category: finding.category,
            summary: finding.summary,
            file: finding.file,
            anchor: finding.anchor,
            anchor_present: anchorPresent,
            age_days: ageDays,
            severity: finding.severity ?? '—',
            suggested_action: finding.suggested_action ?? '—',
            entry_slug: entry.slug,
            entry_feature: entry.feature,
          };
          if (finding.line !== undefined) auditFinding.line = finding.line;
          if (finding.related_assertions !== undefined) auditFinding.related_assertions = finding.related_assertions;
          activeFindings.push(auditFinding);
        }
      }

      // Apply --severity filter (post-collection, before grouping)
      if (options.severity) {
        const allowedSeverities = new Set(options.severity.split(',').map(s => s.trim()));
        // Map 'unclassified' filter value to the '—' sentinel used in activeFindings
        const matchesSeverity = (sev: string): boolean => {
          if (allowedSeverities.has(sev)) return true;
          if (sev === '—' && allowedSeverities.has('unclassified')) return true;
          return false;
        };
        for (let i = activeFindings.length - 1; i >= 0; i--) {
          if (!matchesSeverity(activeFindings[i]!.severity)) {
            activeFindings.splice(i, 1);
          }
        }
      }

      // Apply --entry filter (post-collection, before grouping)
      if (options.entry) {
        const entrySlug = options.entry;
        for (let i = activeFindings.length - 1; i >= 0; i--) {
          if (activeFindings[i]!.entry_slug !== entrySlug) {
            activeFindings.splice(i, 1);
          }
        }
      }

      // Zero findings
      if (activeFindings.length === 0) {
        if (useJson) {
          console.log(JSON.stringify(wrapJsonResponse('proof audit', {
            total_active: 0,
            by_severity: { risk: 0, debt: 0, observation: 0, unclassified: 0 },
            by_action: { promote: 0, scope: 0, monitor: 0, accept: 0, unclassified: 0 },
            by_file: [],
          }, chain), null, 2));
        } else {
          console.log('Proof chain is clean — no active findings.');
        }
        return;
      }

      // Group by file
      const fileGroups = new Map<string, typeof activeFindings>();
      for (const finding of activeFindings) {
        const key = finding.file ?? 'General';
        const existing = fileGroups.get(key) || [];
        existing.push(finding);
        fileGroups.set(key, existing);
      }

      // Sort files by count descending, cap at 8 (unless --full)
      const MAX_FILES = 8;
      const MAX_PER_FILE = 3;
      const useFull = options.full && useJson;
      const sortedFiles = Array.from(fileGroups.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, useFull ? undefined : MAX_FILES);

      // Sort findings within each file group by severity (risk → debt → observation → unclassified)
      for (const [, findings] of sortedFiles) {
        findings.sort((a, b) => {
          const wa = SEVERITY_ORDER[a.severity] ?? 3;
          const wb = SEVERITY_ORDER[b.severity] ?? 3;
          return wa - wb;
        });
      }

      // Severity and action summary counts (active findings only)
      const severityCounts: Record<string, number> = {};
      const actionCounts: Record<string, number> = {};
      let allUnclassified = true;
      for (const f of activeFindings) {
        const sev = f.severity === '—' ? 'unclassified' : f.severity;
        severityCounts[sev] = (severityCounts[sev] || 0) + 1;
        if (f.severity !== '—') allUnclassified = false;

        const act = f.suggested_action === '—' ? 'unclassified' : f.suggested_action;
        actionCounts[act] = (actionCounts[act] || 0) + 1;
      }

      const bySeverity = {
        risk: severityCounts['risk'] || 0,
        debt: severityCounts['debt'] || 0,
        observation: severityCounts['observation'] || 0,
        unclassified: severityCounts['unclassified'] || 0,
      };
      const byAction = {
        promote: actionCounts['promote'] || 0,
        scope: actionCounts['scope'] || 0,
        monitor: actionCounts['monitor'] || 0,
        accept: actionCounts['accept'] || 0,
        unclassified: actionCounts['unclassified'] || 0,
      };

      // Compute actionable vs monitoring counts
      // Actionable: severity is risk/debt OR action is promote/scope
      // Monitoring: everything else
      let actionableCount = 0;
      let monitoringCount = 0;
      for (const f of activeFindings) {
        const sev = f.severity === '—' ? 'unclassified' : f.severity;
        const act = f.suggested_action === '—' ? 'unclassified' : f.suggested_action;
        if (sev === 'risk' || sev === 'debt' || act === 'promote' || act === 'scope') {
          actionableCount++;
        } else {
          monitoringCount++;
        }
      }

      if (useJson) {
        const byFile = sortedFiles.map(([file, findings]) => ({
          file,
          count: findings.length,
          findings: useFull ? findings : findings.slice(0, MAX_PER_FILE),
          overflow: useFull ? 0 : Math.max(0, findings.length - MAX_PER_FILE),
        }));
        const totalFiles = fileGroups.size;
        const overflowFiles = useFull ? 0 : Math.max(0, totalFiles - MAX_FILES);
        const result = {
          total_active: activeFindings.length,
          actionable_count: actionableCount,
          monitoring_count: monitoringCount,
          by_severity: bySeverity,
          by_action: byAction,
          by_file: byFile,
          overflow_files: overflowFiles,
        };
        console.log(JSON.stringify(wrapJsonResponse('proof audit', result, chain), null, 2));
      } else {
        // Human-readable output
        const totalFiles = fileGroups.size;
        const actionablePart = activeFindings.length > 0 ? ` (${actionableCount} actionable, ${monitoringCount} monitoring)` : '';
        console.log(`\nProof Audit: ${activeFindings.length} active finding${activeFindings.length !== 1 ? 's' : ''}${actionablePart} across ${totalFiles} file${totalFiles !== 1 ? 's' : ''}`);

        if (activeFindings.length > 0 && !allUnclassified) {
          const sevOrder = ['risk', 'debt', 'observation', 'unclassified'];
          const sevParts = sevOrder
            .filter(s => (severityCounts[s] || 0) > 0)
            .map(s => `${severityCounts[s]} ${s}`);
          // Include any unknown severity values not in sevOrder
          for (const [key, count] of Object.entries(severityCounts)) {
            if (!sevOrder.includes(key) && count > 0) {
              sevParts.push(`${count} ${key}`);
            }
          }
          console.log(chalk.dim(`  ${sevParts.join(' · ')}`));

          const actOrder = ['promote', 'scope', 'monitor', 'accept'];
          const actParts: string[] = [];
          for (const act of actOrder) {
            if ((actionCounts[act] || 0) > 0) {
              const label = act === 'accept' ? `${actionCounts[act]} accept (closeable)` : `${actionCounts[act]} ${act}`;
              actParts.push(label);
            }
          }
          // Include any unknown action values not in actOrder (exclude 'unclassified' from display)
          for (const [key, count] of Object.entries(actionCounts)) {
            if (!actOrder.includes(key) && key !== 'unclassified' && count > 0) {
              actParts.push(`${count} ${key}`);
            }
          }
          if (actParts.length > 0) {
            console.log(chalk.dim(`  ${actParts.join(' · ')}`));
          }
        }

        console.log('');

        for (const [file, findings] of sortedFiles) {
          console.log(`  ${file} (${findings.length} finding${findings.length !== 1 ? 's' : ''})`);
          const displayed = findings.slice(0, MAX_PER_FILE);
          for (const f of displayed) {
            console.log(`    ${chalk.dim(`[${f.category}]`)} ${chalk.dim(`[${f.severity} · ${f.suggested_action}]`)} ${f.summary}`);
            const anchorIcon = f.anchor ? (f.anchor_present ? '✓' : '✗') : '—';
            // @ana A004
            console.log(`           age: ${f.age_days}d | anchor: ${anchorIcon} | from: ${f.entry_feature}`);
          }
          if (findings.length > MAX_PER_FILE) {
            console.log(`    ... and ${findings.length - MAX_PER_FILE} more`);
          }
          console.log('');
        }

        // Overflow files
        const overflowFiles = fileGroups.size - sortedFiles.length;
        if (overflowFiles > 0) {
          const overflowFindings = activeFindings.length - sortedFiles.reduce((sum, [, f]) => sum + f.length, 0);
          console.log(`  ... and ${overflowFiles} more file${overflowFiles !== 1 ? 's' : ''} (${overflowFindings} findings)`);
        }
      }
    });

  proofCommand.addCommand(auditCommand);

  // Register health subcommand
  const healthCommand = new Command('health')
    .description('Display proof chain health dashboard')
    .option('--json', 'Output JSON format')
    .action(async (options: { json?: boolean }) => {
      const proofRoot = findProjectRoot();
      const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');
      const parentOpts = proofCommand.opts();
      const useJson = options.json || parentOpts['json'];

      // Read chain (no branch check — health is read-only)
      if (!fs.existsSync(proofChainPath)) {
        if (useJson) {
          console.log(JSON.stringify(wrapJsonResponse('proof health', {
            runs: 0,
            trajectory: { risks_per_run_last5: null, risks_per_run_all: null, trend: 'insufficient_data', unclassified_count: 0 },
            hot_modules: [],
            promotion_candidates: [],
            promotions: [],
            verification: computeFirstPassRate([]),
          }, { entries: [] }), null, 2));
        } else {
          console.log(formatHealthDisplay(0));
        }
        return;
      }

      let chain: ProofChain;
      try {
        chain = JSON.parse(fs.readFileSync(proofChainPath, 'utf-8'));
      } catch {
        console.error(chalk.red('Error: Failed to parse proof_chain.json'));
        process.exit(1);
        return;
      }

      const report = computeHealthReport(chain);

      if (useJson) {
        console.log(JSON.stringify(wrapJsonResponse('proof health', report, chain), null, 2));
        return;
      }

      // Terminal display
      console.log(formatHealthDisplay(report));
    });

  proofCommand.addCommand(healthCommand);

  // Register stale subcommand
  const staleCommand = new Command('stale')
    .description('Show findings with staleness signals from subsequent pipeline runs')
    .option('--after <slug>', 'Filter to findings from a specific pipeline entry')
    .option('--min-confidence <level>', 'Minimum confidence tier (high or medium)')
    .option('--json', 'Output JSON format')
    .action(async (options: { after?: string; minConfidence?: string; json?: boolean }) => {
      const proofRoot = findProjectRoot();
      const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');
      const parentOpts = proofCommand.opts();
      const useJson = options.json || parentOpts['json'];

      // Read chain (no branch check — stale is read-only)
      if (!fs.existsSync(proofChainPath)) {
        if (useJson) {
          console.log(JSON.stringify(wrapJsonResponse('proof stale', {
            total_stale: 0,
            high_confidence: [],
            medium_confidence: [],
            filter: options.after || null,
          }, { entries: [] }), null, 2));
        } else {
          console.log('Stale Findings: 0 findings with staleness signals');
          console.log('');
          console.log('No proof chain found. Complete pipeline cycles to build proof data.');
        }
        return;
      }

      let chain: ProofChain;
      try {
        chain = JSON.parse(fs.readFileSync(proofChainPath, 'utf-8'));
      } catch {
        console.error(chalk.red('Error: Failed to parse proof_chain.json'));
        process.exit(1);
        return;
      }

      const stalenessOpts: { afterSlug?: string; minConfidence?: 'high' | 'medium' } = {};
      if (options.after) stalenessOpts.afterSlug = options.after;
      if (options.minConfidence === 'high') stalenessOpts.minConfidence = 'high';
      const result = computeStaleness(chain, stalenessOpts);

      if (useJson) {
        console.log(JSON.stringify(wrapJsonResponse('proof stale', result, chain), null, 2));
        return;
      }

      // Human-readable output
      if (options.after) {
        console.log(`Stale Findings: ${result.total_stale} finding${result.total_stale !== 1 ? 's' : ''} from ${options.after} with staleness signals`);
      } else {
        console.log(`Stale Findings: ${result.total_stale} finding${result.total_stale !== 1 ? 's' : ''} with staleness signals`);
      }

      if (result.total_stale === 0) {
        console.log('');
        console.log('No active findings have been modified by subsequent pipeline runs.');
        return;
      }

      // High confidence tier
      if (result.high_confidence.length > 0) {
        console.log('');
        console.log('High confidence (3+ subsequent entries modified the file):');
        for (const f of result.high_confidence) {
          console.log(`  ${f.id} [${f.severity}] ${f.summary} — ${f.file}`);
          const slugList = f.subsequent_slugs.length <= 3
            ? f.subsequent_slugs.join(', ')
            : `${f.subsequent_slugs.slice(0, 3).join(', ')}, ... (${f.subsequent_count} entries)`;
          console.log(`    Modified by: ${slugList} (${f.subsequent_count} ${f.subsequent_count !== 1 ? 'entries' : 'entry'})`);
          if (f.completed_at) {
            const date = f.completed_at.split('T')[0] ?? f.completed_at;
            console.log(`    Created in: ${f.entry_slug} (${date})`);
          }
          console.log('');
        }
      }

      // Medium confidence tier
      if (result.medium_confidence.length > 0) {
        console.log('Medium confidence (1-2 subsequent entries modified the file):');
        for (const f of result.medium_confidence) {
          console.log(`  ${f.id} [${f.severity}] ${f.summary} — ${f.file}`);
          const slugList = f.subsequent_slugs.join(', ');
          console.log(`    Modified by: ${slugList} (${f.subsequent_count} ${f.subsequent_count !== 1 ? 'entries' : 'entry'})`);
          if (f.completed_at) {
            const date = f.completed_at.split('T')[0] ?? f.completed_at;
            console.log(`    Created in: ${f.entry_slug} (${date})`);
          }
          console.log('');
        }
      }
    });

  proofCommand.addCommand(staleCommand);

  program.addCommand(proofCommand);
}

/**
 * Format a single proof context result for human-readable terminal output.
 *
 * @param result - Proof context result to format
 * @returns Formatted string
 */
function formatContextResult(result: ProofContextResult): string {
  const hasData = result.findings.length > 0 || result.build_concerns.length > 0;

  if (!hasData) {
    return `No proof context found for ${result.query}`;
  }

  const lines: string[] = [];

  // Header
  lines.push(`Proof context for ${result.query}`);
  if (result.touch_count > 0 && result.last_touched) {
    const lastDate = result.last_touched.split('T')[0] ?? result.last_touched;
    lines.push(`Touched in ${result.touch_count} pipeline cycle${result.touch_count === 1 ? '' : 's'} (last: ${lastDate})`);
  }
  lines.push('');

  // Findings
  if (result.findings.length > 0) {
    lines.push('Findings:');
    for (const finding of result.findings) {
      const anchor = finding.anchor ? ` ${finding.anchor} —` : '';
      const truncatedSummary = truncateSummary(finding.summary, 250);
      lines.push(`  ${chalk.dim(`[${finding.category}]`)}${anchor} ${truncatedSummary}`);
      lines.push(`         ${chalk.gray(`From: ${finding.from}`)}`);
      lines.push('');
    }
  }

  // Build concerns
  if (result.build_concerns.length > 0) {
    lines.push('Build concerns:');
    for (const concern of result.build_concerns) {
      lines.push(`  ${concern.summary}`);
      lines.push(`         ${chalk.gray(`From: ${concern.from}`)}`);
      lines.push('');
    }
  } else if (result.findings.length > 0) {
    lines.push('No build concerns for this file.');
    lines.push('');
  }

  return lines.join('\n');
}
