/**
 * ana telemetry — Check and manage anonymous usage telemetry
 *
 * Usage:
 *   ana telemetry              Show telemetry status (default)
 *   ana telemetry status       Show telemetry status
 *   ana telemetry enable       Enable telemetry
 *   ana telemetry disable      Disable telemetry
 *   ana telemetry show         Show sample telemetry event
 *
 * Exit codes:
 *   0 - Success
 *   1 - Error
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { readConfig, writeConfig, getConfigDir } from '../utils/telemetry.js';

/**
 * Register the telemetry command with the CLI.
 *
 * Parent command `telemetry` shows status (default). Subcommands `enable`,
 * `disable`, and `show` provide management and transparency.
 *
 * @param program - Commander program instance
 */
export function registerTelemetryCommand(program: Command): void {
  const telemetryCommand = new Command('telemetry')
    .description('Check and manage anonymous usage telemetry');

  const statusCommand = new Command('status')
    .description('Show telemetry status')
    .action(() => {
      try {
        const config = readConfig();
        const enabled = config?.enabled === true;
        const statusText = enabled ? 'enabled' : 'disabled';
        const configPath = getConfigDir() + '/telemetry.json';

        console.log(`Telemetry: ${statusText}`);
        console.log(`Config:    ${configPath}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exitCode = 1;
      }
    });

  const enableCommand = new Command('enable')
    .description('Enable anonymous telemetry')
    .action(() => {
      try {
        const existing = readConfig();
        writeConfig({
          enabled: true,
          anonymousId: existing?.anonymousId ?? crypto.randomUUID(),
          promptedAt: existing?.promptedAt ?? new Date().toISOString(),
          version: 1,
        });
        console.log('Telemetry enabled.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exitCode = 1;
      }
    });

  const disableCommand = new Command('disable')
    .description('Disable anonymous telemetry')
    .action(() => {
      try {
        const existing = readConfig();
        writeConfig({
          enabled: false,
          anonymousId: existing?.anonymousId ?? crypto.randomUUID(),
          promptedAt: existing?.promptedAt ?? new Date().toISOString(),
          version: 1,
        });
        console.log('Telemetry disabled.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exitCode = 1;
      }
    });

  const showCommand = new Command('show')
    .description('Show sample telemetry event')
    .action(() => {
      try {
        const sampleEvent = {
          event: 'command_run',
          properties: {
            command: 'scan',
            cliVersion: '1.1.1',
            os: os.platform(),
            nodeVersion: process.version,
            isCI: false,
            source: 'cli',
          },
          timestamp: new Date().toISOString(),
          distinct_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        };

        console.log('Sample telemetry event:\n');
        console.log(JSON.stringify(sampleEvent, null, 2));
        console.log('\nFields:');
        console.log('  event        Command or lifecycle event name');
        console.log('  command      CLI command that was run');
        console.log('  cliVersion   Installed CLI version');
        console.log('  os           Operating system (darwin, linux, win32)');
        console.log('  nodeVersion  Node.js version');
        console.log('  isCI         Whether running in a CI environment');
        console.log('  source       Always "cli" — distinguishes from website events');
        console.log('  distinct_id  Random UUID, not tied to any identity');
        console.log('  timestamp    ISO 8601 timestamp');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exitCode = 1;
      }
    });

  telemetryCommand.addCommand(statusCommand, { isDefault: true });
  telemetryCommand.addCommand(enableCommand);
  telemetryCommand.addCommand(disableCommand);
  telemetryCommand.addCommand(showCommand);
  program.addCommand(telemetryCommand);
}
