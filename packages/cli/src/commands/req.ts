/**
 * ana req - Requirement backlog commands (upstream of work items).
 *
 * The user-facing surface for the requirements contract: `list`, `validate`, and
 * `new`. This is the CLI/chalk layer — all state logic lives in `req-state.ts`
 * and all validation in `artifact-validators.ts`. Modeled on `registerPlanCommand`
 * (plan.ts) for the group shape and the red-print/exit call-site convention.
 *
 * Exit codes:
 *   validate — 0 valid, 1 invalid
 *   new      — 0 created, 1 refused (already exists)
 *   list     — 0 always
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findProjectRoot } from '../utils/validators.js';
import { readArtifactBranch, getCurrentBranch } from '../utils/git-operations.js';
import { validateReqFormat } from './artifact-validators.js';
import { buildRequirementList } from './req-state.js';
import type { RequirementListItem } from './req-state.js';

const REQUIREMENTS_DIR = '.ana/requirements';

/**
 * Generate a fresh requirement scaffold. Injects the id and today's date — this
 * file is generated (not copied from a template) so it can stamp per-run values,
 * matching the `scaffold-generators.ts` precedent. The result passes
 * `ana req validate` unmodified.
 *
 * @param reqId - The full requirement id including the `REQ-` prefix
 * @param todayISO - Today's date as `YYYY-MM-DD`
 * @returns The scaffold file content
 */
export function buildRequirementScaffold(reqId: string, todayISO: string): string {
  return `---
req: ${reqId}
title: <one-line title>
priority: unset          # critical | high | medium | low | unset — unset is honest; proposing a priority is Think's job
status: open
created: ${todayISO}
source: hand-written
# appetite: worth a week, no more   # optional worth-ceiling — what it's worth, NOT a cost estimate
---

## Problem
<The disease in one or two sentences. Root cause, not symptom.>

## Evidence
<Why this matters. For tech debt, the code fact IS the evidence — cite file:line; don't restate it in business-speak. For product, "founder reports X" is honest; don't embellish.>

## Done Looks Like
<Observable outcome. Not a solution — a finish line.>

## Leads
<OPTIONAL, UNTRUSTED. Proposed fixes, file:line pointers, known traps. Think may adopt or discard — any claim here is re-verified against the code, never imported on faith.>
`;
}

/**
 * Compute a compact age label (e.g. `3d`) from an ISO created date.
 *
 * @param created - ISO date string
 * @returns A short age label, or `?` when the date is unparseable
 */
function ageLabel(created: string | undefined): string {
  if (!created) return '?';
  const createdMs = new Date(created).getTime();
  if (isNaN(createdMs)) return '?';
  const days = Math.max(0, Math.floor((Date.now() - createdMs) / 86_400_000));
  return `${days}d`;
}

/**
 * Render the human-readable requirement table.
 *
 * @param items - The requirement list
 */
function printRequirementTable(items: RequirementListItem[]): void {
  if (items.length === 0) {
    console.log(chalk.gray('No requirements filed. Create one with `ana req new <id>`.'));
    return;
  }

  const idWidth = Math.max(...items.map(i => i.req.length), 3);

  for (const item of items) {
    const id = item.req.padEnd(idWidth);
    if (item.malformed) {
      console.log(`${id}  ${chalk.yellow(`⚠ malformed — ${item.error ?? 'unreadable'}`)}`);
      continue;
    }
    const priority = (item.priority ?? 'unset').padEnd(8);
    const status = (item.status ?? '').padEnd(9);
    const age = ageLabel(item.created).padEnd(5);
    const title = item.title ?? '';
    let line = `${id}  ${priority} ${status} ${age} ${title}`;
    if (item.stale) {
      line += chalk.yellow(`   ⚠ stale (claimed_by '${item.claimed_by}' not in plans/active)`);
    }
    console.log(line);
  }

  const open = items.filter(i => i.status === 'open').length;
  const claimed = items.filter(i => i.status === 'claimed').length;
  const malformed = items.filter(i => i.malformed).length;
  console.log('');
  console.log(chalk.gray(`${open} open · ${claimed} claimed · ${malformed} malformed`));
}

/**
 * Run `ana req list`. Never throws on a malformed file — malformed rows render
 * with a warning marker.
 *
 * @param options - Command options
 * @param options.json - Emit the structured JSON array instead of the table
 */
export function runReqList(options: { json?: boolean }): void {
  const projectRoot = findProjectRoot();
  const artifactBranch = readArtifactBranch(projectRoot);
  const currentBranch = getCurrentBranch();
  const onArtifactBranch = currentBranch === artifactBranch;

  const items = buildRequirementList(projectRoot, artifactBranch, onArtifactBranch);

  if (options.json) {
    const json = items.map(item =>
      item.malformed
        ? { req: item.req, malformed: true, error: item.error }
        : {
            req: item.req,
            priority: item.priority,
            status: item.status,
            created: item.created,
            title: item.title,
            malformed: false,
            stale: item.stale,
          },
    );
    console.log(JSON.stringify(json, null, 2));
    return;
  }

  printRequirementTable(items);
}

/**
 * Run `ana req validate <file>`. Prints one red, specific line and exits 1 on the
 * first violation; exits 0 (with a green ✓) when valid.
 *
 * @param file - Path to the requirement file
 */
export function runReqValidate(file: string): void {
  if (!fs.existsSync(file)) {
    console.error(chalk.red(`Error: file not found: ${file}`));
    process.exit(1);
  }

  const error = validateReqFormat(file);
  if (error) {
    console.error(chalk.red('Error: requirement format invalid.'));
    console.error(chalk.red(error));
    process.exit(1);
  }

  console.log(chalk.green(`✓ ${path.basename(file)} is a valid requirement.`));
  process.exit(0);
}

/**
 * Run `ana req new <id>`. Normalizes the id (strips a leading `REQ-`/`req-`),
 * writes `.ana/requirements/REQ-<id>.md` from the scaffold, and refuses to
 * overwrite an existing file.
 *
 * @param id - The requirement id (with or without a `REQ-` prefix)
 */
export function runReqNew(id: string): void {
  const projectRoot = findProjectRoot();
  const normalized = id.replace(/^req-/i, '');
  if (!normalized) {
    console.error(chalk.red('Error: requirement id cannot be empty.'));
    process.exit(1);
  }
  const reqId = `REQ-${normalized}`;

  const dir = path.join(projectRoot, REQUIREMENTS_DIR);
  const filePath = path.join(dir, `${reqId}.md`);

  if (fs.existsSync(filePath)) {
    console.error(chalk.red(`Error: ${reqId} already exists at ${filePath}. Refusing to overwrite.`));
    process.exit(1);
  }

  fs.mkdirSync(dir, { recursive: true });
  const todayISO = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(filePath, buildRequirementScaffold(reqId, todayISO), 'utf-8');

  console.log(chalk.green(`Created ${reqId}`) + ` at ${path.relative(projectRoot, filePath)}`);
  console.log(chalk.gray('Fill in Problem / Evidence / Done Looks Like, then: ana req validate ' + path.relative(projectRoot, filePath)));
}

/**
 * Register the `req` command group (list / validate / new).
 *
 * @param program - Commander program instance
 */
export function registerReqCommand(program: Command): void {
  const reqCommand = new Command('req')
    .description('Manage the requirement backlog (upstream of work items)');

  reqCommand
    .command('list')
    .description('List filed requirements (id · priority · status · age · title)')
    .option('--json', 'Output JSON format for programmatic consumption')
    .action((options: { json?: boolean }) => {
      runReqList(options);
    });

  reqCommand
    .command('validate')
    .description('Validate a requirement file against the requirement format')
    .argument('<file>', 'Path to the requirement .md file')
    .action((file: string) => {
      runReqValidate(file);
    });

  reqCommand
    .command('new')
    .description('Scaffold a new requirement in .ana/requirements/')
    .argument('<id>', 'Requirement id (e.g. proof-viewer — a REQ- prefix is added)')
    .action((id: string) => {
      runReqNew(id);
    });

  program.addCommand(reqCommand);
}
