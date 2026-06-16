/**
 * ana plan coverage - Plan-time AC coverage preview
 *
 * Usage:
 *   ana plan coverage <slug>
 *
 * The read-only, plan-time mirror of the pre-seal coverage gate. Joins the
 * scope's acceptance criteria to the contract's `ac:` links and
 * `coverage_waivers` (via the same exported `joinCoverage` the gate uses) and
 * prints a per-AC coverage map. The planner runs it while writing the contract.
 *
 * It NEVER gates and NEVER exits non-zero — it is informational, exactly like
 * `ana verify pre-check`. UNCOVERED criteria are shown loudly, but the actual
 * block happens later at `ana artifact save`.
 *
 * Exit codes:
 *   0 - Always
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import { findProjectRoot } from '../utils/validators.js';
import { joinCoverage, isVersionAtLeast, COVERAGE_GATE_MIN_VERSION } from './artifact-validators.js';
import type { ContractSchema } from '../types/contract.js';

/**
 * Render and print the AC coverage map for a slug. Pure I/O — all coverage
 * logic is delegated to {@link joinCoverage}. Always returns (never exits).
 *
 * @param slug - Work item slug (e.g., add-status-command)
 */
export function runPlanCoverage(slug: string): void {
  const root = findProjectRoot();

  // Plan-dir guard — mirror runPreCheck. Informational, so never throws.
  const planDir = path.join(root, '.ana/plans/active', slug);
  if (!fs.existsSync(planDir)) {
    console.error(chalk.red(`Error: No active work found for '${slug}'.`));
    console.error(chalk.gray('Run `ana work status` to see active work items.'));
    process.exit(0);
  }

  const contractPath = path.join(planDir, 'contract.yaml');
  if (!fs.existsSync(contractPath)) {
    console.log(chalk.yellow('No contract found. Run the pipeline with AnaPlan to generate one.'));
    process.exit(0);
  }

  const scopePath = path.join(planDir, 'scope.md');
  const scopeContent = fs.existsSync(scopePath) ? fs.readFileSync(scopePath, 'utf-8') : '';

  let contract: ContractSchema = {};
  try {
    contract = (yaml.parse(fs.readFileSync(contractPath, 'utf-8')) as ContractSchema) ?? {};
  } catch {
    console.log(chalk.yellow('Contract could not be parsed — nothing to preview.'));
    process.exit(0);
  }

  const version = typeof contract.version === 'string' ? contract.version : '1.0';
  const join = joinCoverage(scopeContent, contract);
  const active = isVersionAtLeast(version, COVERAGE_GATE_MIN_VERSION) && !join.ambiguous && join.acs.length > 0;

  // ── Header ──
  const headerState = active
    ? chalk.green(`contract version ${version} — gate active`)
    : chalk.gray(`contract version ${version} — gate inactive, legacy`);
  console.log(`\nCoverage map for \`${slug}\`  (${headerState})\n`);

  // ── Fail-open: AC format not recognized ──
  if (join.ambiguous) {
    console.log(chalk.yellow('  Scope acceptance-criteria format not recognized.'));
    console.log(chalk.gray('  The coverage gate degrades to warn-only for this scope (it never blocks on an unreadable scope).'));
    console.log();
    process.exit(0);
  }

  // ── Build-only scope: no ACs to map ──
  if (join.acs.length === 0) {
    console.log(chalk.gray('  Scope declares no acceptance criteria — the coverage gate does not apply.'));
    console.log();
    process.exit(0);
  }

  // ── Legacy (pre-1.1) contract: gate inactive ──
  if (!isVersionAtLeast(version, COVERAGE_GATE_MIN_VERSION)) {
    const pinned = join.acs.filter(ac => ac.status === 'pinned').length;
    const unlinked = join.acs.length - pinned;
    console.log(chalk.gray('  (no `ac:` links drive the gate — this contract predates coverage linking)'));
    console.log(`  ${join.acs.length} acceptance criteria · ${pinned} pinned · ${unlinked} unlinked`);
    console.log();
    console.log(chalk.gray('  ⓘ Legacy contract: the coverage gate does not apply. Re-plan on the current template to enable it.'));
    console.log();
    process.exit(0);
  }

  // ── Active map: one row per AC ──
  const reasonByAC = new Map<string, string>();
  const waivers = Array.isArray(contract.coverage_waivers) ? contract.coverage_waivers : [];
  for (const w of waivers) {
    if (w && typeof w.ac === 'string' && typeof w.reason === 'string') {
      reasonByAC.set(w.ac.trim().toUpperCase(), w.reason);
    }
  }

  const idWidth = Math.max(...join.acs.map(ac => ac.id.length), 3);
  for (const ac of join.acs) {
    const id = ac.id.padEnd(idWidth);
    if (ac.status === 'pinned') {
      const weakNote = ac.weakOnly ? chalk.gray('  (weak matcher only — exists)') : '';
      console.log(`  ${id}  ${chalk.green('✓ covered')}        ${ac.assertions.join(', ')}${weakNote}`);
    } else if (ac.status === 'judgment') {
      console.log(`  ${id}  ${chalk.cyan('⚖ judgment-only')}  ${chalk.gray(`"${reasonByAC.get(ac.id) ?? ''}"`)}`);
    } else if (ac.status === 'retired') {
      console.log(`  ${id}  ${chalk.gray('⊘ retired')}        ${chalk.gray(`"${reasonByAC.get(ac.id) ?? ''}"`)}`);
    } else {
      console.log(`  ${id}  ${chalk.red('✗ UNCOVERED')}      ${chalk.red('no assertion links it and no coverage_waivers entry')}`);
    }
  }

  // ── Roll-up ──
  const pinned = join.acs.filter(ac => ac.status === 'pinned').length;
  const judgment = join.acs.filter(ac => ac.status === 'judgment').length;
  const retired = join.acs.filter(ac => ac.status === 'retired').length;
  const uncovered = join.acs.filter(ac => ac.status === 'uncovered').length;
  const weakOnly = join.acs.filter(ac => ac.status === 'pinned' && ac.weakOnly).length;

  console.log();
  console.log(
    `  ${join.acs.length} acceptance criteria · ${pinned} pinned · ${judgment} judgment-only · ${retired} retired · ${uncovered} uncovered`
  );
  if (weakOnly > 0) {
    console.log(chalk.gray(`  ${weakOnly} AC covered by weak matcher only (info)`));
  }
  console.log();

  if (uncovered > 0) {
    console.log(chalk.yellow('  ⓘ This is a preview. The seal gate runs at `ana artifact save`. UNCOVERED ACs will block the seal.'));
  } else {
    console.log(chalk.gray('  ⓘ This is a preview. The seal gate runs at `ana artifact save`. Every AC is covered — the seal will pass.'));
  }
  console.log();

  // Informational tool — never blocks.
  process.exit(0);
}

/**
 * Register the `plan` command group (with the `coverage` sub-command).
 *
 * @param program - Commander program instance
 */
export function registerPlanCommand(program: Command): void {
  const planCommand = new Command('plan')
    .description('Plan-time helpers for writing contracts');

  planCommand
    .command('coverage')
    .description('Preview the AC → assertion coverage map (read-only, never gates)')
    .argument('<slug>', 'Work item slug (e.g., add-status-command)')
    .action((slug: string) => {
      runPlanCoverage(slug);
    });

  program.addCommand(planCommand);
}
