/**
 * Telemetry module — consent management, event recording, flush orchestration.
 *
 * Writes events to disk and flushes them via a detached child process.
 * Same architecture as update-check.ts: silent on error, no CLI latency impact.
 *
 * Every public function catches internally and never throws. A failure in
 * telemetry never crashes or delays the CLI.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';

/** PostHog project API key — public by design (same as website's NEXT_PUBLIC_POSTHOG_KEY). */
const POSTHOG_API_KEY = 'phc_zj7BAuN3GtaS3HDAfeR9XcXYin38j5zHuuYoiLmnoxFf';

/** Config file name within the config directory. */
const CONFIG_FILE = 'telemetry.json';

/** Pending events file name within the config directory. */
const EVENTS_FILE = 'pending-events.ndjson';

/**
 * Shape of the telemetry config stored on disk.
 */
interface TelemetryConfig {
  enabled: boolean;
  anonymousId: string;
  promptedAt: string;
  version: number;
}

/**
 * Shape of a telemetry event written to NDJSON.
 */
interface TelemetryEvent {
  event: string;
  properties: Record<string, unknown>;
  timestamp: string;
  distinct_id: string;
}

/**
 * Resolve the global config directory for Anatomia.
 *
 * Uses $XDG_CONFIG_HOME/anatomia/ if set, else ~/.config/anatomia/ on
 * macOS/Linux, %APPDATA%/anatomia/ on Windows.
 *
 * @returns Absolute path to the config directory
 */
export function getConfigDir(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  if (xdg) {
    return path.join(xdg, 'anatomia');
  }
  if (os.platform() === 'win32') {
    const appData = process.env['APPDATA'];
    if (appData) {
      return path.join(appData, 'anatomia');
    }
  }
  return path.join(os.homedir(), '.config', 'anatomia');
}

/**
 * Read the telemetry config from disk.
 *
 * @returns Config object or null if missing/corrupt
 */
export function readConfig(): TelemetryConfig | null {
  try {
    const configPath = path.join(getConfigDir(), CONFIG_FILE);
    const content = fs.readFileSync(configPath, 'utf-8');
    const data = JSON.parse(content);

    if (
      typeof data.enabled !== 'boolean' ||
      typeof data.anonymousId !== 'string' ||
      typeof data.promptedAt !== 'string' ||
      typeof data.version !== 'number'
    ) {
      return null;
    }

    return data as TelemetryConfig;
  } catch {
    return null;
  }
}

/**
 * Write the telemetry config to disk.
 *
 * Creates the config directory if it doesn't exist.
 *
 * @param config - Config object to persist
 */
export function writeConfig(config: TelemetryConfig): void {
  try {
    const configDir = getConfigDir();
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, CONFIG_FILE),
      JSON.stringify(config, null, 2) + '\n',
      'utf-8',
    );
  } catch {
    // Silent on write failure
  }
}

/**
 * Check if telemetry is enabled.
 *
 * DO_NOT_TRACK=1 overrides everything. Otherwise reads config from disk.
 *
 * @returns true if telemetry is enabled, false otherwise
 */
export function isEnabled(): boolean {
  try {
    if (process.env['DO_NOT_TRACK'] === '1') {
      return false;
    }
    const config = readConfig();
    return config?.enabled === true;
  } catch {
    return false;
  }
}

/**
 * Prompt the user for telemetry consent on first interactive run.
 *
 * Checks if config exists. If not, and stdin/stdout are TTY, prompts with
 * a 3-line message and [y/N] default. Non-TTY silently disables.
 * DO_NOT_TRACK=1 silently disables without prompt or disk write.
 *
 * @returns true if telemetry was enabled, false otherwise
 */
export async function ensureConsent(): Promise<boolean> {
  try {
    // DO_NOT_TRACK — no prompt, no disk write
    if (process.env['DO_NOT_TRACK'] === '1') {
      return false;
    }

    // Already prompted
    const existing = readConfig();
    if (existing) {
      return existing.enabled;
    }

    // Non-TTY — silently disable
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      writeConfig({
        enabled: false,
        anonymousId: crypto.randomUUID(),
        promptedAt: new Date().toISOString(),
        version: 1,
      });
      return false;
    }

    // Interactive prompt
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question(
        'Anatomia collects anonymous usage data to improve the CLI.\n' +
        'What\'s collected: command names, OS, Node version. No code, no file paths.\n\n' +
        'Enable anonymous telemetry? [y/N] ',
        (ans) => {
          rl.close();
          resolve(ans);
        },
      );
    });

    const trimmed = answer.trim().toLowerCase();
    const enabled = trimmed === 'y' || trimmed === 'yes';

    writeConfig({
      enabled,
      anonymousId: crypto.randomUUID(),
      promptedAt: new Date().toISOString(),
      version: 1,
    });

    return enabled;
  } catch {
    return false;
  }
}

/**
 * Record a telemetry event to disk.
 *
 * Appends a single JSON line to the pending-events NDJSON file.
 * No-op if telemetry is disabled or DO_NOT_TRACK is set.
 *
 * @param eventName - Event name (e.g., 'command_run', 'scan_completed')
 * @param properties - Event properties (no PII)
 * @returns true if the event was recorded, false otherwise
 */
export function track(eventName: string, properties: Record<string, unknown> = {}): boolean {
  try {
    if (process.env['DO_NOT_TRACK'] === '1') {
      return false;
    }

    const config = readConfig();
    if (!config || !config.enabled) {
      return false;
    }

    const event: TelemetryEvent = {
      event: eventName,
      properties: {
        ...properties,
        source: 'cli',
      },
      timestamp: new Date().toISOString(),
      distinct_id: config.anonymousId,
    };

    const configDir = getConfigDir();
    fs.mkdirSync(configDir, { recursive: true });
    fs.appendFileSync(
      path.join(configDir, EVENTS_FILE),
      JSON.stringify(event) + '\n',
      'utf-8',
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * Build the command_run event properties.
 *
 * Assembles the standard properties for a command_run event including
 * command name, CLI version, OS, Node version, and CI detection.
 *
 * @param command - Full command name (e.g., 'scan', 'work start')
 * @param cliVersion - CLI version string
 * @returns Properties object for the command_run event
 */
export function buildCommandRunProperties(command: string, cliVersion: string): Record<string, unknown> {
  return {
    command,
    cliVersion,
    os: os.platform(),
    nodeVersion: process.version,
    isCI: process.env['CI'] === 'true',
  };
}

/**
 * Spawn a detached child process to flush pending events to PostHog.
 *
 * Reads pending-events.ndjson, POSTs events to PostHog's /capture batch
 * endpoint, and deletes the file on success. On failure, events remain
 * on disk for the next flush attempt. Caps at 500 most recent events.
 *
 * The main CLI process does not wait for completion.
 */
export function flush(): void {
  try {
    const configDir = getConfigDir();
    const eventsFile = path.join(configDir, EVENTS_FILE);

    // Nothing to flush
    if (!fs.existsSync(eventsFile)) {
      return;
    }

    // Inline CommonJS script — runs outside the ESM bundle
    // Uses JSON.stringify for safe path interpolation (ANA-SEC-001 class)
    const script = `
const https = require('https');
const fs = require('fs');

const eventsFile = ${JSON.stringify(eventsFile)};
const apiKey = ${JSON.stringify(POSTHOG_API_KEY)};

try {
  const content = fs.readFileSync(eventsFile, 'utf-8');
  const lines = content.trim().split('\\n').filter(Boolean);
  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch {}
  }
  if (events.length === 0) { process.exit(0); }

  // Cap at 500 most recent events
  const capped = events.slice(-500);

  const payload = JSON.stringify({
    api_key: apiKey,
    batch: capped,
  });

  const req = https.request('https://us.i.posthog.com/capture/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
    timeout: 5000,
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try { fs.unlinkSync(eventsFile); } catch {}
      }
      process.exit(0);
    });
  });

  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.write(payload);
  req.end();
} catch {
  process.exit(0);
}
`;

    const child = spawn('node', ['-e', script], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });

    child.unref();
  } catch {
    // Silent on any error
  }
}

/**
 * Get the full command name from a Commander action command.
 *
 * Walks the parent chain to build the full command path, excluding the
 * root program name (e.g., 'ana').
 *
 * @param actionCommand - The leaf command from Commander's preAction hook
 * @param actionCommand.name - Function returning the command name
 * @param actionCommand.parent - Parent command or null
 * @returns Full command name (e.g., 'work start', 'artifact save')
 */
export function getCommandName(actionCommand: { name: () => string; parent: { name: () => string; parent: unknown } | null }): string {
  const parts: string[] = [];
  let current: { name: () => string; parent: { name: () => string; parent: unknown } | null } | null = actionCommand;

  while (current) {
    const name = current.name();
    if (current.parent) {
      parts.unshift(name);
    }
    // Skip root program (no parent)
    current = current.parent as typeof current;
  }

  return parts.join(' ');
}

/**
 * Check if a command is a telemetry subcommand.
 *
 * Walks the command's parent chain to see if any ancestor is named 'telemetry'.
 *
 * @param actionCommand - The leaf command from Commander's preAction hook
 * @param actionCommand.name - Function returning the command name
 * @param actionCommand.parent - Parent command or null
 * @returns true if the command is a telemetry subcommand
 */
export function isTelemetryCommand(actionCommand: { name: () => string; parent: { name: () => string; parent: unknown } | null }): boolean {
  let current: { name: () => string; parent: unknown } | null = actionCommand;

  while (current) {
    if (current.name() === 'telemetry') {
      return true;
    }
    current = current.parent as typeof current;
  }

  return false;
}
