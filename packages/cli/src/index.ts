#!/usr/bin/env node

/**
 * Anatomia CLI - Verified AI development. Ship with proof.
 *
 * Usage:
 *   ana --version       Show version
 *   ana --help          Show help
 *   ana init            Initialize .ana/ context
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { registerInitCommand } from './commands/init/index.js';
import { registerScanCommand } from './commands/scan.js';
import { registerSetupCommand } from './commands/setup.js';
import { registerArtifactCommand } from './commands/artifact.js';
import { registerWorkCommand } from './commands/work.js';
import { registerProofCommand } from './commands/proof.js';
import { registerPrCommand } from './commands/pr.js';
import { registerAgentsCommand } from './commands/agents.js';
import { registerLearnCommand } from './commands/learn.js';
import { registerVerifyCommand } from './commands/verify.js';
import { registerConfigCommand } from './commands/config.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerTelemetryCommand } from './commands/telemetry.js';
import { ensureConsent, track, flush, buildCommandRunProperties, getCommandName, isTelemetryCommand } from './utils/telemetry.js';
import { getCliVersion } from './commands/init/state.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

const program = new Command();

program
  .name('ana')
  .description('Verified AI development. Ship with proof.')
  .version(`ana/${pkg.version}`, '-v, --version', 'Display version number');

program.helpCommand('help [command]', 'Display help for a command');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Commander has no public API for hiding the help command; _hidden is the standard internal mechanism (stable v12-14)
(program as any)._helpCommand._hidden = true;

// Register commands grouped for --help display.
// Commander renders groups in registration order — commandsGroup() sets
// the heading for all commands registered after it until the next call.
program.commandsGroup('GETTING STARTED');
registerScanCommand(program);
registerInitCommand(program);
registerSetupCommand(program);
registerDoctorCommand(program);

program.commandsGroup('PIPELINE');
registerWorkCommand(program);
registerArtifactCommand(program);
registerVerifyCommand(program);
registerPrCommand(program);

program.commandsGroup('CONFIGURATION');
registerConfigCommand(program);
registerTelemetryCommand(program);

program.commandsGroup('INTELLIGENCE');
registerProofCommand(program);
registerLearnCommand(program);
registerAgentsCommand(program);

// Telemetry: preAction hook fires for every command (except --version, --help)
// Commander v14 supports async hooks.
program.hook('preAction', async (_thisCommand, actionCommand) => {
  try {
    // Skip telemetry subcommands to avoid circular self-measurement
    if (isTelemetryCommand(actionCommand)) return;

    // Ensure consent on first interactive run
    await ensureConsent();

    // Track command_run
    const commandName = getCommandName(actionCommand);
    const cliVersion = await getCliVersion();
    const props = buildCommandRunProperties(commandName, cliVersion);
    track('command_run', props);
  } catch {
    // Silent — telemetry never delays or crashes the CLI
  }
});

// Parse arguments with async support
// CRITICAL: Use parseAsync() not parse() for async action handlers
// See: https://github.com/tj/commander.js#async-action-handlers
async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
    flush();
  } catch (error) {
    track('error_occurred', {
      errorMessage: error instanceof Error ? error.message : 'unknown',
    });
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}

main();
