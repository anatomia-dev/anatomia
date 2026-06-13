/**
 * ana config — Read and write ana.json settings
 *
 * Usage:
 *   ana config                       Show all settings
 *   ana config --json                Show all settings as JSON
 *   ana config get <field>           Get a field value
 *   ana config get <field> --json    Get a field value as JSON
 *   ana config set <field> <value>   Set a field value
 *
 * Dot notation supported for nested access:
 *   ana config get commands.test
 *   ana config set custom.team.name "Engineering"
 *
 * Exit codes:
 *   0 - Success
 *   1 - Error (no project, machine-managed field, traversal error)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findProjectRoot } from '../utils/validators.js';
import { AnaJsonSchema } from './init/anaJsonSchema.js';

/**
 * Machine-managed fields that `config set` rejects.
 * Each maps to the command that manages it.
 */
const MACHINE_MANAGED_FIELDS: Record<string, string> = {
  anaVersion: 'ana init',
  name: 'ana init',
  language: 'ana scan',
  framework: 'ana scan',
  packageManager: 'ana scan',
  setupPhase: 'ana setup',
  lastScanAt: 'ana scan',
};

/**
 * Known top-level fields in the ana.json schema.
 * Used for the unknown-key warning on `config set`.
 *
 * Derived from `AnaJsonSchema.shape` so the set can never drift from the
 * schema: adding an optional field to the schema (e.g. the configurability
 * fields agents/skills/capabilities/platformDefaults) automatically widens
 * the known set, so `config set` stops warning on it without a second edit.
 */
const KNOWN_FIELDS = new Set(Object.keys(AnaJsonSchema.shape));

/**
 * One row of the configurable surface: a field, its one-line purpose, and a
 * copy-pasteable example. Drives `ana config schema` (the discoverability fix)
 * so users can SEE what is configurable, not just what is currently set.
 */
interface SchemaRow {
  /** Dot-path or top-level key. */
  field: string;
  /** One-line description of what the key does. */
  desc: string;
  /** A copy-pasteable `ana config set` / `ana agents` example. */
  example: string;
}

/**
 * The configurable surface, grouped. Hand-curated (not schema-derived) because
 * the value is the human description + example, not just the key name. Kept
 * next to KNOWN_FIELDS so a new configurable key is documented here when added.
 */
const SCHEMA_GROUPS: Array<{ title: string; rows: SchemaRow[] }> = [
  {
    title: 'Workflow',
    rows: [
      { field: 'coAuthor', desc: 'Co-author trailer added to commits', example: 'ana config set coAuthor "Anatomia <bot@x>"' },
      { field: 'artifactBranch', desc: 'Branch for proof/work artifacts', example: 'ana config set artifactBranch ana-artifacts' },
      { field: 'branchPrefix', desc: 'Branch name prefix (string or per-kind map)', example: 'ana config set branchPrefix feature/' },
      { field: 'mergeStrategy', desc: 'PR merge strategy: merge | squash | rebase', example: 'ana config set mergeStrategy squash' },
      { field: 'testEvidenceGate', desc: 'Require test evidence on proofs: on | off', example: 'ana config set testEvidenceGate on' },
      { field: 'processCapture', desc: 'Capture session transcripts: on | off', example: 'ana config set processCapture on' },
    ],
  },
  {
    title: 'Agents — per-agent overrides (projected into Claude + Codex)',
    rows: [
      { field: 'agents.<name>.skills', desc: 'Skills projected onto an agent (array of strings)', example: 'ana agents skills ana-build git-workflow,api-patterns' },
      { field: 'agents.<name>.model', desc: "Per-agent model override (e.g. 'opus')", example: 'ana agents model ana-build opus' },
      { field: 'agents.<name>.enabled', desc: 'Drop a built-in agent (false); the ana core agent is never droppable', example: 'ana config set agents.ana-release.enabled false' },
    ],
  },
  {
    title: 'Skills — custom / always-on skills layered onto the scan manifest',
    rows: [
      { field: 'skills.<name>.always', desc: 'Append this skill to every install regardless of scan (boolean)', example: 'ana config set skills.observability.always true' },
    ],
  },
  {
    title: 'Capabilities — opt-in managed surfaces (absent = no new files)',
    rows: [
      { field: 'capabilities.commands.<name>', desc: 'A slash command: string body, or { run, description, body }', example: 'ana config set capabilities.commands.ship \'{"run":"npm run release","description":"Ship it"}\'' },
      { field: 'capabilities.outputStyle', desc: 'Claude output style written to settings.json (string)', example: 'ana config set capabilities.outputStyle concise' },
      { field: 'capabilities.mcpServers.<name>', desc: 'An MCP server written to .mcp.json (object)', example: 'ana config set capabilities.mcpServers.weather \'{"command":"weather-mcp"}\'' },
    ],
  },
  {
    title: 'Platform defaults — per-platform runtime overrides',
    rows: [
      { field: 'platformDefaults.<platform>', desc: 'Override a platform descriptor (e.g. model, sandbox)', example: 'ana config set platformDefaults.codex.model gpt-5.5' },
    ],
  },
];

/**
 * Compute the Levenshtein edit distance between two strings (small inputs).
 *
 * @param a - First string
 * @param b - Second string
 * @returns The minimum single-character edits to turn `a` into `b`
 */
function editDistance(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j]!, dp[j - 1]!);
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

/**
 * Suggest the closest known top-level field for an unknown one, when a typo is
 * plausible (edit distance ≤ a third of the field length, min 2).
 *
 * @param field - The unknown top-level key the user typed
 * @returns The closest known field, or null when nothing is close enough
 */
function suggestField(field: string): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const known of KNOWN_FIELDS) {
    const d = editDistance(field.toLowerCase(), known.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = known;
    }
  }
  const threshold = Math.max(2, Math.floor(field.length / 3));
  return best !== null && bestDist <= threshold ? best : null;
}

/**
 * Read ana.json as raw JSON (not through Zod schema).
 *
 * @param root - Project root directory
 * @returns Parsed JSON object
 * @throws Error if file doesn't exist or is invalid JSON
 */
function readRawConfig(root: string): Record<string, unknown> {
  const configPath = path.join(root, '.ana', 'ana.json');
  const content = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(content) as Record<string, unknown>;
}

/**
 * Write ana.json, preserving formatting.
 *
 * @param root - Project root directory
 * @param config - Config object to write
 */
function writeRawConfig(root: string, config: Record<string, unknown>): void {
  const configPath = path.join(root, '.ana', 'ana.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Traverse into an object using a dot-separated path.
 *
 * @param obj - Object to traverse
 * @param keyPath - Dot-separated key path (e.g., "commands.test")
 * @returns The value at the path, or undefined if not found
 * @throws Error if traversal encounters a non-object value
 */
function getByPath(obj: Record<string, unknown>, keyPath: string): unknown {
  const parts = keyPath.split('.');
  let current: unknown = obj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;

    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current !== 'object' || Array.isArray(current)) {
      const traversed = parts.slice(0, i).join('.');
      throw new Error(
        `Cannot traverse into '${traversed}' — it is ${typeof current}, not an object.`
      );
    }

    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Set a value at a dot-separated path, creating intermediate objects as needed.
 *
 * @param obj - Object to modify (mutated in place)
 * @param keyPath - Dot-separated key path (e.g., "custom.team.name")
 * @param value - Value to set
 * @throws Error if traversal encounters a non-object value
 */
function setByPath(obj: Record<string, unknown>, keyPath: string, value: unknown): void {
  const parts = keyPath.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    const existing = current[part];

    if (existing === undefined || existing === null) {
      // Create intermediate object
      current[part] = {};
      current = current[part] as Record<string, unknown>;
    } else if (typeof existing === 'object' && !Array.isArray(existing)) {
      current = existing as Record<string, unknown>;
    } else {
      const traversed = parts.slice(0, i + 1).join('.');
      throw new Error(
        `Cannot traverse into '${traversed}' — it is ${typeof existing}, not an object.`
      );
    }
  }

  current[parts[parts.length - 1]!] = value;
}

/**
 * Parse a string value using JSON.parse with string fallback.
 *
 * Handles numbers, booleans, null, arrays, objects via JSON.parse.
 * Falls back to treating the input as a string literal if JSON.parse fails.
 *
 * @param raw - Raw string value from CLI argument
 * @returns Parsed value
 */
function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Check if a field path refers to a machine-managed surface field.
 * Machine-managed: surfaces.*.path, surfaces.*.language, surfaces.*.framework.
 * User-owned: surfaces.*.commands.* (and the surface entry as a whole for delete).
 *
 * @param field - Dot-separated field path
 * @returns true if machine-managed
 */
function isSurfaceMachineManaged(field: string): boolean {
  const parts = field.split('.');
  if (parts[0] !== 'surfaces' || parts.length < 3) return false;
  const surfaceField = parts[2];
  return surfaceField === 'path' || surfaceField === 'language' || surfaceField === 'framework';
}

/**
 * Delete a value at a dot-separated path.
 *
 * @param obj - Object to modify (mutated in place)
 * @param keyPath - Dot-separated key path (e.g., "surfaces.old-service")
 * @returns true if the key existed and was deleted, false otherwise
 */
function deleteByPath(obj: Record<string, unknown>, keyPath: string): boolean {
  const parts = keyPath.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    const existing = current[part];
    if (existing === undefined || existing === null || typeof existing !== 'object' || Array.isArray(existing)) {
      return false;
    }
    current = existing as Record<string, unknown>;
  }

  const lastKey = parts[parts.length - 1]!;
  if (lastKey in current) {
    delete current[lastKey];
    return true;
  }
  return false;
}

/**
 * Format a config value for display (non-JSON mode).
 *
 * @param value - Value to format
 * @returns Formatted string
 */
function formatValue(value: unknown): string {
  if (value === undefined) return '(undefined)';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * Display all settings from ana.json.
 *
 * @param config - Parsed config object
 * @param json - Whether to output as JSON
 */
function displayAll(config: Record<string, unknown>, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  // Find max key length for alignment
  const keys = Object.keys(config);
  const maxKeyLen = Math.max(...keys.map(k => k.length));

  for (const key of keys) {
    const value = config[key];

    if (key === 'surfaces' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Three-level display for surfaces: surface → scalar fields + commands → command values
      console.log(`${key}:`);
      const surfaceEntries = Object.entries(value as Record<string, unknown>);
      if (surfaceEntries.length === 0) {
        console.log('  (empty)');
      } else {
        for (const [surfaceName, surfaceValue] of surfaceEntries) {
          console.log(`  ${surfaceName}:`);
          if (typeof surfaceValue === 'object' && surfaceValue !== null) {
            const fields = Object.entries(surfaceValue as Record<string, unknown>);
            const scalarFields = fields.filter(([, v]) => typeof v !== 'object' || v === null);
            const objectFields = fields.filter(([, v]) => typeof v === 'object' && v !== null);
            const maxFieldLen = Math.max(...fields.map(([k]) => k.length), 0);
            for (const [fk, fv] of scalarFields) {
              console.log(`    ${fk.padEnd(maxFieldLen)}  ${formatValue(fv)}`);
            }
            for (const [fk, fv] of objectFields) {
              console.log(`    ${fk}:`);
              const subEntries = Object.entries(fv as Record<string, unknown>);
              const maxSubLen = Math.max(...subEntries.map(([k]) => k.length), 0);
              for (const [sk, sv] of subEntries) {
                console.log(`      ${sk.padEnd(maxSubLen)}  ${formatValue(sv)}`);
              }
            }
          }
        }
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // One-level indented display for objects
      console.log(`${key}:`);
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) {
        console.log('  (empty)');
      } else {
        const maxSubKeyLen = Math.max(...entries.map(([k]) => k.length));
        for (const [subKey, subValue] of entries) {
          console.log(`  ${subKey.padEnd(maxSubKeyLen)}  ${formatValue(subValue)}`);
        }
      }
    } else {
      console.log(`${key.padEnd(maxKeyLen)}  ${formatValue(value)}`);
    }
  }
}

/**
 * Display a single field value.
 *
 * @param value - Value to display
 * @param json - Whether to output as JSON
 */
function displayValue(value: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(value));
    return;
  }
  console.log(formatValue(value));
}

/**
 * Print the configurable surface — every configurable key with a one-line
 * description and a copy-pasteable example. This is the discoverability fix:
 * `config show/get` reveal current STATE, but nothing listed what is
 * CONFIGURABLE (the keys, their shapes). `config schema` is that map.
 */
function displaySchema(): void {
  console.log(chalk.bold('Configurable surface (ana.json):'));
  console.log(chalk.dim('  Absent keys = built-in defaults. Set with `ana config set <field> <value>`.'));
  for (const group of SCHEMA_GROUPS) {
    console.log('');
    console.log(chalk.bold(`  ${group.title}`));
    for (const row of group.rows) {
      console.log(`    ${chalk.cyan(row.field)}`);
      console.log(`      ${row.desc}`);
      console.log(chalk.gray(`      e.g. ${row.example}`));
    }
  }
  console.log('');
  console.log(chalk.dim('  capabilities.commands.<name> body accepts a string OR { run?, description?, body? }.'));
}

/**
 * Find the project root, converting the thrown error to a user-friendly message.
 *
 * @returns Project root path
 * @throws Error with "Run `ana init` first" message
 */
function resolveRoot(): string {
  try {
    return findProjectRoot();
  } catch {
    throw new Error('No ana.json found. Run `ana init` first.');
  }
}

/**
 * Register the config command with the CLI.
 *
 * Parent command `config` displays all settings. Subcommands `get` and `set`
 * provide field-level access.
 *
 * @param program - Commander program instance
 */
export function registerConfigCommand(program: Command): void {
  const configCommand = new Command('config')
    .description('Read and write ana.json settings')
    .addHelpText(
      'after',
      [
        '',
        'Subcommands:',
        '  ana config                 show all current settings',
        '  ana config get <field>     read one field (dot notation)',
        '  ana config set <field> <v> write one field (JSON-parsed, string fallback)',
        '  ana config delete <field>  remove a field',
        '  ana config schema          list the configurable surface + examples',
        '',
        'Configurable beyond the basics (run `ana config schema` for the full map):',
        '  agents.<name>.skills / .model / .enabled   per-agent, projected into',
        '                                             Claude AND Codex in lockstep',
        '  skills.<name>.always                       always-on custom skills',
        '  capabilities.commands.<name>               slash command (.claude/commands/)',
        '                                             body: string OR { run, description, body }',
        '  capabilities.outputStyle                   Claude output style (settings.json)',
        '  capabilities.mcpServers.<name>             MCP server (.mcp.json)',
        '  platformDefaults.<platform>                per-platform runtime overrides',
        '',
        'Absent configurability keys = built-in defaults (deleting a key restores stock).',
      ].join('\n'),
    );

  const schemaCommand = new Command('schema')
    .description('List the configurable surface — every key, its shape, and an example')
    .action(() => {
      displaySchema();
    });

  // "show" subcommand handles bare `config` and `config --json`
  // Implemented as default action via Commander's default command
  const showCommand = new Command('show')
    .description('Show all settings')
    .option('--json', 'Output as JSON')
    .action((options: { json?: boolean }) => {
      try {
        const root = resolveRoot();
        const config = readRawConfig(root);
        displayAll(config, options.json === true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exitCode = 1;
      }
    });

  const getCommand = new Command('get')
    .description('Get a config field value')
    .argument('<field>', 'Field name (dot notation supported)')
    .option('--json', 'Output as JSON')
    .action((field: string, options: { json?: boolean }) => {
      try {
        const root = resolveRoot();
        const config = readRawConfig(root);
        const value = getByPath(config, field);
        displayValue(value, options.json === true);
        // Unknown/unset field → suggest the closest known key + point at schema.
        if (value === undefined && !options.json) {
          const topLevelKey = field.split('.')[0]!;
          if (!KNOWN_FIELDS.has(topLevelKey) && topLevelKey !== 'custom') {
            const suggestion = suggestField(topLevelKey);
            if (suggestion) {
              console.error(chalk.gray(`  '${topLevelKey}' is not a known field. Did you mean '${suggestion}'?`));
            } else {
              console.error(chalk.gray(`  '${topLevelKey}' is not a known field. Run \`ana config schema\` to list configurable keys.`));
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exitCode = 1;
      }
    });

  const setCommand = new Command('set')
    .description('Set a config field value')
    .argument('<field>', 'Field name (dot notation supported)')
    .argument('<value>', 'Value to set (JSON-parsed, string fallback)')
    .action((field: string, rawValue: string) => {
      try {
        const root = resolveRoot();

        // Check machine-managed blocklist
        const topLevelKey = field.split('.')[0]!;
        const managedBy = MACHINE_MANAGED_FIELDS[topLevelKey];
        if (managedBy && topLevelKey === field) {
          console.error(
            chalk.red(`'${field}' is managed by '${managedBy}'. Use that command instead.`)
          );
          process.exitCode = 1;
          return;
        }
        // Also block dot-paths into machine-managed fields (e.g., "setupPhase.sub")
        if (managedBy) {
          console.error(
            chalk.red(`'${topLevelKey}' is managed by '${managedBy}'. Use that command instead.`)
          );
          process.exitCode = 1;
          return;
        }

        // Surface machine-managed guard: surfaces.*.path, surfaces.*.language,
        // surfaces.*.framework are refreshed by `ana init`. Only commands are user-owned.
        if (isSurfaceMachineManaged(field)) {
          console.error(
            chalk.red(`'${field}' is machine-managed (refreshed by 'ana init'). Use that command instead.`)
          );
          process.exitCode = 1;
          return;
        }

        // Unknown key warning — with a closest-field suggestion when plausible.
        if (!KNOWN_FIELDS.has(topLevelKey) && !field.startsWith('custom.') && topLevelKey !== 'custom') {
          const suggestion = suggestField(topLevelKey);
          const hint = suggestion
            ? ` Did you mean '${suggestion}'?`
            : ` Run \`ana config schema\` to list configurable keys.`;
          console.error(
            `Warning: '${topLevelKey}' is not a known ana.json field.${hint} Use 'custom.${topLevelKey}' to avoid future collisions.`
          );
        }

        const config = readRawConfig(root);
        const value = parseValue(rawValue);

        if (field === 'mergeStrategy' && !['merge', 'squash', 'rebase'].includes(String(value))) {
          console.error(chalk.red('Invalid mergeStrategy. Expected one of: merge, squash, rebase.'));
          process.exitCode = 1;
          return;
        }

        // Reject empty strings for command fields — never a valid command
        const COMMAND_FIELDS = ['commands.test', 'commands.build', 'commands.lint', 'commands.dev'];
        const isSurfaceCommand = /^surfaces\.[^.]+\.commands\.[^.]+$/.test(field);
        if ((COMMAND_FIELDS.includes(field) || isSurfaceCommand) && value === '') {
          console.error(chalk.red('Empty string is not a valid command. Provide a command or omit the field.'));
          console.error(chalk.gray(`  To unset: ana config set ${field} null`));
          process.exitCode = 1;
          return;
        }

        setByPath(config, field, value);
        writeRawConfig(root, config);

        console.log(`Set ${field} = ${JSON.stringify(value)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exitCode = 1;
      }
    });

  const deleteCommand = new Command('delete')
    .description('Delete a config field')
    .argument('<field>', 'Field name (dot notation supported)')
    .action((field: string) => {
      try {
        const root = resolveRoot();

        // Check machine-managed blocklist
        const topLevelKey = field.split('.')[0]!;
        const managedBy = MACHINE_MANAGED_FIELDS[topLevelKey];
        if (managedBy) {
          console.error(
            chalk.red(`'${topLevelKey}' is managed by '${managedBy}'. Use that command instead.`)
          );
          process.exitCode = 1;
          return;
        }

        // Surface machine-managed guard
        if (isSurfaceMachineManaged(field)) {
          console.error(
            chalk.red(`'${field}' is machine-managed (refreshed by 'ana init'). Use that command instead.`)
          );
          process.exitCode = 1;
          return;
        }

        const config = readRawConfig(root);
        const deleted = deleteByPath(config, field);
        if (!deleted) {
          console.error(chalk.red(`'${field}' does not exist.`));
          process.exitCode = 1;
          return;
        }

        writeRawConfig(root, config);
        console.log(`Deleted ${field}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exitCode = 1;
      }
    });

  configCommand.addCommand(showCommand, { isDefault: true });
  configCommand.addCommand(getCommand);
  configCommand.addCommand(setCommand);
  configCommand.addCommand(deleteCommand);
  configCommand.addCommand(schemaCommand);
  program.addCommand(configCommand);
}
