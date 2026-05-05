/**
 * ana scan [path] - Zero-install project scanner
 *
 * Analyzes a project and outputs a terminal report with:
 * - Stack detection (Language, Framework, AI, Database, Auth, Testing, Payments, Workspace)
 * - File counts (source, test, config, total)
 * - Structure map (top directories with purposes)
 *
 * Read-only operation (unless --save). Works without .ana/ directory.
 *
 * Usage:
 *   ana scan           Scan current directory (deep by default)
 *   ana scan <path>    Scan specified path
 *   ana scan --json    Output JSON format
 *   ana scan --quick   Fast scan — skip deep code analysis
 *   ana scan --quiet   Suppress informational stdout
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { EngineResult } from '../engine/types/engineResult.js';
import { computeSkillManifest, CORE_SKILLS } from '../constants.js';
import { selectPrimarySchema } from '../utils/scaffold-generators.js';

/**
 * Display names imported from shared utility
 */
/**
 * Box-drawing characters for terminal output
 */
const BOX = {
  horizontal: '\u2500',
  vertical: '\u2502',
  topLeft: '\u250C',
  topRight: '\u2510',
  bottomLeft: '\u2514',
  bottomRight: '\u2518',
};


/**
 * Collapse service variants in display. "Vercel AI (OpenAI), Vercel AI (Google)"
 * becomes "Vercel AI (2 providers)". Standalone entries are untouched.
 *
 * @param names - Service names to collapse
 * @returns Collapsed names array
 */
function collapseServiceVariants(names: string[]): string[] {
  const groups = new Map<string, string[]>();
  const standalone: string[] = [];

  for (const name of names) {
    const parenIdx = name.indexOf(' (');
    if (parenIdx > 0) {
      const base = name.slice(0, parenIdx);
      const list = groups.get(base) || [];
      list.push(name);
      groups.set(base, list);
    } else {
      standalone.push(name);
    }
  }

  const result: string[] = [...standalone];
  for (const [base, variants] of groups) {
    if (variants.length === 1) {
      result.push(variants[0]!);
    } else {
      result.push(`${base} (${variants.length} providers)`);
    }
  }
  return result;
}

/**
 * Count findings for dynamic CTA (funnel context)
 * @param result - Engine analysis result
 * @returns Number of findings (blind spots + null pattern slots)
 */
function countFindings(result: EngineResult): number {
  // Count actionable findings (critical + warn) plus blind spots
  const actionableFindings = result.findings.filter(
    f => f.severity === 'critical' || f.severity === 'warn'
  ).length;

  return actionableFindings + result.blindSpots.length;
}

/**
 * Format human-readable terminal output from EngineResult
 * @param result - Engine analysis result
 * @param options - Display options
 * @param options.isFunnel - Whether in funnel context (no .ana/)
 * @param options.rootPath - The directory that was scanned (for ancestor-walk fallback message)
 * @returns Formatted terminal output string
 */
function formatHumanReadable(
  result: EngineResult,
  options: { isFunnel: boolean; rootPath: string }
): string {
  const lines: string[] = [];
  const boxWidth = 71;
  const innerWidth = boxWidth - 2;

  // ── Helper: enrich database display with provider + model count ──
  function enrichDatabase(value: string): string {
    const schema = selectPrimarySchema(result.schemas);
    if (!schema) return value;
    const providerNames: Record<string, string> = {
      postgresql: 'PostgreSQL', mysql: 'MySQL', sqlite: 'SQLite',
      mongodb: 'MongoDB', cockroachdb: 'CockroachDB', sqlserver: 'SQL Server',
    };
    let display = value;
    if (schema?.provider) {
      display = `${value} → ${providerNames[schema.provider] || schema.provider}`;
    }
    if (schema?.modelCount) {
      display += ` (${schema.modelCount} models)`;
    }
    return display;
  }

  // ── 1. Identity Header (3-line box) ──
  const projectName = result.overview.project;
  const shape = result.applicationShape !== 'unknown' ? result.applicationShape : '';

  // Stack summary line — most impressive combination
  const summaryParts: string[] = [];
  if (result.stack.language) summaryParts.push(result.stack.language);
  if (result.stack.framework) summaryParts.push(result.stack.framework);
  if (result.stack.database) summaryParts.push(enrichDatabase(result.stack.database));
  else if (result.stack.testing.length > 0) summaryParts.push(result.stack.testing[0]!);
  if (result.monorepo.isMonorepo) {
    summaryParts.push(`${result.monorepo.packages.length} packages`);
  }
  const summaryLine = summaryParts.length > 0 ? summaryParts.join(' · ') : '';

  // Render box
  const namePad = innerWidth - projectName.length - shape.length - 4;
  const nameWithShape = `  ${projectName}${' '.repeat(Math.max(1, namePad))}${chalk.dim(shape)}`;

  lines.push(chalk.cyan(BOX.topLeft + BOX.horizontal.repeat(innerWidth) + BOX.topRight));
  lines.push(chalk.cyan(BOX.vertical) + chalk.bold(nameWithShape.padEnd(innerWidth)) + chalk.cyan(BOX.vertical));
  if (summaryLine) {
    const summaryPadded = `  ${summaryLine}`;
    lines.push(chalk.cyan(BOX.vertical) + summaryPadded.padEnd(innerWidth) + chalk.cyan(BOX.vertical));
  }
  lines.push(chalk.cyan(BOX.bottomLeft + BOX.horizontal.repeat(innerWidth) + BOX.bottomRight));
  lines.push('');

  // ── 2. Stack Section ──
  lines.push(chalk.bold('  Stack'));
  lines.push(chalk.gray('  ' + BOX.horizontal.repeat(5)));

  const stackItems: Array<[string, string | null]> = [
    ['Language', result.stack.language],
    ['Framework', result.stack.framework],
    ['Database', result.stack.database ? enrichDatabase(result.stack.database) : null],
    ['Auth', result.stack.auth],
    ['AI', result.stack.aiSdk],
    ['Payments', result.stack.payments],
    ['Testing', result.stack.testing.length > 0 ? result.stack.testing.join(', ') : null],
    ['UI', result.stack.uiSystem],
  ];

  let hasStack = false;
  for (const [label, value] of stackItems) {
    if (!value) continue;
    hasStack = true;
    lines.push(`  ${chalk.gray(label.padEnd(12))} ${value}`);
  }

  // Services — compact one-liner inside Stack
  const filteredServices = result.externalServices.filter(svc => svc.stackRoles.length === 0);
  if (filteredServices.length > 0) {
    hasStack = true;
    const collapsed = collapseServiceVariants(filteredServices.map(s => s.name));
    const MAX_SVC = 5;
    const displayed = collapsed.slice(0, MAX_SVC).join(' · ');
    const overflow = collapsed.length > MAX_SVC ? ` ${chalk.dim(`(+${collapsed.length - MAX_SVC} more)`)}` : '';
    lines.push(`  ${chalk.gray('Services'.padEnd(12))} ${displayed}${overflow}`);
  }

  // Deploy + CI — one line
  const deployParts: string[] = [];
  if (result.deployment.platform) deployParts.push(result.deployment.platform);
  if (result.deployment.ci) deployParts.push(result.deployment.ci);
  if (deployParts.length > 0) {
    hasStack = true;
    lines.push(`  ${chalk.gray('Deploy'.padEnd(12))} ${deployParts.join(' · ')}`);
  }

  // Workspace — monorepo info with primary package
  if (result.monorepo.isMonorepo) {
    hasStack = true;
    let wsDisplay = result.stack.workspace || `monorepo (${result.monorepo.packages.length} packages)`;
    if (result.monorepo.primaryPackage?.path) {
      wsDisplay += ` · primary: ${result.monorepo.primaryPackage.path}`;
    }
    lines.push(`  ${chalk.gray('Workspace'.padEnd(12))} ${wsDisplay}`);
  }

  if (!hasStack) {
    // S19/SCAN-045: ancestor walk for subdirectory scan
    const manifestMarkers = ['package.json', 'go.mod', 'Cargo.toml', 'pyproject.toml'];
    const MAX_ANCESTOR_DEPTH = 5;
    let ancestorRoot: string | null = null;
    let walkDir = path.resolve(options.rootPath);
    for (let i = 0; i < MAX_ANCESTOR_DEPTH; i++) {
      const parent = path.dirname(walkDir);
      if (parent === walkDir) break;
      walkDir = parent;
      if (manifestMarkers.some(m => existsSync(path.join(walkDir, m)))) {
        ancestorRoot = walkDir;
        break;
      }
    }
    if (ancestorRoot) {
      lines.push(chalk.gray('  No package manifest in this directory'));
      lines.push(chalk.yellow(`  Run \`ana scan\` from the project root for full detection.`));
      lines.push(chalk.gray(`  (found at ${ancestorRoot})`));
    } else {
      lines.push(chalk.gray('  No code detected'));
    }
  }

  // ── 3. Intelligence Section ──
  const intelLines: string[] = [];

  // Activity: contributors + weekly sparkline
  const activity = result.git.recentActivity;
  if (activity) {
    const parts: string[] = [];
    if (activity.activeContributors) {
      parts.push(`${activity.activeContributors} contributor${activity.activeContributors === 1 ? '' : 's'}`);
    }
    if (activity.weeklyCommits && activity.weeklyCommits.length > 0) {
      parts.push(activity.weeklyCommits.join(chalk.gray('→')) + ' weekly');
    }
    if (parts.length > 0) {
      intelLines.push(`  ${chalk.gray('Activity'.padEnd(12))} ${parts.join(' · ')}`);
    }
  }

  // Hot files: top 3 by churn
  if (activity?.highChurnFiles && activity.highChurnFiles.length > 0) {
    const hotFiles = activity.highChurnFiles.slice(0, 3).map(f => {
      const name = f.path.split('/').pop() || f.path;
      return `${name} (${f.commits})`;
    });
    intelLines.push(`  ${chalk.gray('Hot files'.padEnd(12))} ${hotFiles.join(', ')}`);
  }

  // Documentation inventory
  if (result.documentation.files.length > 0) {
    const docs = result.documentation.files;
    const MAX_DOCS = 3;
    const displayed = docs.slice(0, MAX_DOCS).map(d => d.path.split('/').pop() || d.path);
    const overflow = docs.length > MAX_DOCS ? ` + ${docs.length - MAX_DOCS} more` : '';
    intelLines.push(`  ${chalk.gray('Docs'.padEnd(12))} ${displayed.join(' · ')}${chalk.dim(overflow)}`);
  }

  // Pre-commit hooks
  if (result.git.hooks?.preCommit?.exists) {
    const hookParts: string[] = [];
    if (result.git.hooks.preCommit.runsTypecheck) hookParts.push('typecheck');
    if (result.git.hooks.preCommit.runsLint) hookParts.push('lint');
    if (result.git.hooks.preCommit.runsTests) hookParts.push('test');
    if (hookParts.length > 0) {
      intelLines.push(`  ${chalk.gray('Pre-commit'.padEnd(12))} ${hookParts.join(' + ')}`);
    }
  }

  if (intelLines.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Intelligence'));
    lines.push(chalk.gray('  ' + BOX.horizontal.repeat(12)));
    lines.push(...intelLines);
  }

  // ── 4. Footer ──
  lines.push('');

  // Findings — compact: one-line for clean, warnings always shown
  const criticalOrWarn = result.findings.filter(f => f.severity === 'critical' || f.severity === 'warn');
  if (criticalOrWarn.length > 0) {
    for (const f of criticalOrWarn) {
      const icon = f.severity === 'critical' ? chalk.red('●') : chalk.yellow('⚠');
      const text = f.severity === 'critical' ? chalk.red(f.title) : f.title;
      lines.push(`  ${icon} ${text}`);
    }
  } else if (options.isFunnel) {
    // In funnel mode, acknowledge clean check in one line
    const passChecks: string[] = [];
    if (result.findings.some(f => f.id === 'hardcoded-secret' && f.severity === 'pass')) passChecks.push('no secrets');
    if (result.secrets.gitignoreCoversEnv) passChecks.push('.gitignore covers .env');
    if (passChecks.length > 0) {
      lines.push(`  ${chalk.green('✓')} Clean — ${passChecks.join(', ')}`);
    }
  }

  // Env security warning (always)
  if (result.secrets.envFileExists && !result.secrets.gitignoreCoversEnv) {
    lines.push(chalk.yellow('  ⚠ .env is not in .gitignore — secrets may be committed'));
  }

  // scan.json reference
  if (!options.isFunnel) {
    lines.push(chalk.dim('  Full data: .ana/scan.json'));
  }

  // CTA
  if (options.isFunnel) {
    const findings = countFindings(result);
    if (findings === 0) {
      lines.push(chalk.gray('  Run `ana init` to get started.'));
    } else {
      lines.push(chalk.gray(`  Found ${findings} issues. Run \`ana init\` to scaffold context and agents for your project.`));
    }
  } else {
    const skills = computeSkillManifest(result);
    const conditional = skills.filter((s: string) => !(CORE_SKILLS as readonly string[]).includes(s));
    const stackParts = [result.stack.language, result.stack.framework, result.stack.database].filter(Boolean);

    if (conditional.length > 0) {
      lines.push(chalk.bold('  Run `ana init`') + ` to scaffold ${skills.length} skills (${CORE_SKILLS.length} core + ${conditional.join(', ')})`);
    } else {
      lines.push(chalk.bold('  Run `ana init`') + ` to scaffold ${skills.length} skills for ${stackParts.join(' · ')}`);
    }
  }

  return lines.join('\n');
}

interface ScanOptions {
  json?: boolean;
  save?: boolean;
  quiet?: boolean;
  quick?: boolean;
}

/**
 * Register the `scan` command.
 *
 * @param program - Commander program instance.
 */
export function registerScanCommand(program: Command): void {
  const scanCommand = new Command('scan')
    .description('Detect stack, conventions, and patterns')
    .argument('[path]', 'Directory to scan (default: current directory)', '.')
    .option('--json', 'Output JSON format for programmatic consumption')
    .option('--save', 'Save scan results to .ana/scan.json')
    .option('-q, --quiet', 'Suppress informational stdout')
    .option('--quick', 'Fast scan — skip deep code analysis')
    .addHelpText('after', '\nEXAMPLES\n  $ ana scan .\n  $ ana scan /path/to/project --json')
    .action(async (targetPath: string, options: ScanOptions) => {
    const rootPath = path.resolve(targetPath);

    // Path + --save guard
    if (targetPath !== '.' && options.save) {
      console.error(chalk.red('Error: Cannot combine path argument with --save. Use --json and pipe to a file for subdirectory results.'));
      process.exit(1);
    }

    // Validate directory exists
    try {
      const stats = await fs.stat(rootPath);
      if (!stats.isDirectory()) {
        console.error(chalk.red(`Error: Not a directory: ${rootPath}`));
        process.exit(1);
      }
    } catch {
      console.error(chalk.red(`Error: Path not found: ${rootPath}`));
      process.exit(1);
    }

    // --save creates .ana/ if needed
    if (options.save) {
      const anaDir = path.join(rootPath, '.ana');
      if (!existsSync(anaDir)) {
        await fs.mkdir(anaDir, { recursive: true });
      }
    }

    const spinner = options.json || options.quiet ? null : ora('Scanning project...').start();

    try {
      // Dynamic import to avoid WASM crash at module level
      const { scanProject } = await import('../engine/scan-engine.js');

      const depth = options.quick ? 'surface' as const : 'deep' as const;
      const result = await scanProject(rootPath, { depth });

      if (spinner) spinner.stop();

      // Output (stdout — suppressed by --quiet unless --json)
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (!options.quiet) {
        const isFunnel = !existsSync(path.join(rootPath, '.ana'));
        console.log(formatHumanReadable(result, { isFunnel, rootPath }));
      }

      // Save
      if (options.save) {
        const anaDir = path.join(rootPath, '.ana');
        try {
          await fs.writeFile(path.join(anaDir, 'scan.json'), JSON.stringify(result, null, 2), 'utf-8');
          if (!options.quiet && !options.json) {
            console.log(chalk.gray('Scan saved to .ana/scan.json'));
          }

          // Update lastScanAt in ana.json.
          //
          // S19/NEW-004 (reframed): must use result.overview.scannedAt,
          // not a fresh new Date(). The check.ts dashboard compares
          // ana.json.lastScanAt against scan.json.overview.scannedAt with
          // string equality — if these two timestamps disagree by a few
          // milliseconds (as a fresh Date() always would), every dashboard
          // run after --save reports "stale (scan newer than last setup)"
          // even when the scan JUST happened. Use the same source of
          // truth for both fields.
          const anaJsonPath = path.join(anaDir, 'ana.json');
          if (existsSync(anaJsonPath)) {
            try {
              const anaJson = JSON.parse(readFileSync(anaJsonPath, 'utf-8'));
              anaJson.lastScanAt = result.overview.scannedAt;
              writeFileSync(anaJsonPath, JSON.stringify(anaJson, null, 2) + '\n');
            } catch {
              // ana.json parse/write error — skip silently
            }
          }

          // checkDrift removed (S18/D13)
        } catch (writeError) {
          console.error(chalk.yellow(`Warning: Failed to save scan results. ${writeError instanceof Error ? writeError.message : ''}`));
        }
      }
    } catch (error) {
      if (spinner) spinner.fail('Scan failed');
      if (error instanceof Error) console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

  program.addCommand(scanCommand);
}

