import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Command } from 'commander';
import { createTestProject } from '../helpers/test-project.js';

/**
 * Tests for `ana config` command — read and write ana.json settings
 */

/** Helper: create a Commander program with config command registered */
async function createProgram(): Promise<Command> {
  const { registerConfigCommand } = await import('../../src/commands/config.js');
  const program = new Command();
  program.exitOverride();
  registerConfigCommand(program);
  return program;
}

/** Helper: run a command through Commander, swallowing exit errors */
async function runCommand(program: Command, args: string[]): Promise<void> {
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch (err: unknown) {
    // Commander exitOverride throws on process.exit — ignore these
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'commander.executeSubCommandError') {
      throw err;
    }
    // Swallow other commander errors (exitCode-based)
  }
}

/** Standard ana.json for testing */
const TEST_CONFIG = {
  anaVersion: '1.0.0',
  name: 'test-project',
  language: 'TypeScript',
  framework: null,
  packageManager: 'pnpm',
  commands: {
    build: 'pnpm run build',
    test: 'pnpm vitest run',
  },
  coAuthor: 'Ana <build@anatomia.dev>',
  artifactBranch: 'main',
  branchPrefix: 'feature/',
  setupPhase: 'complete',
  lastScanAt: '2026-05-04T22:12:48.293Z',
  custom: {},
};

describe('ana config', () => {
  let tempDir: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /** Write a custom ana.json to the test project */
  async function writeConfig(config: Record<string, unknown>): Promise<void> {
    await createTestProject(tempDir);
    const configPath = path.join(tempDir, '.ana', 'ana.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  }

  /** Read ana.json back from disk */
  async function readConfig(): Promise<Record<string, unknown>> {
    const configPath = path.join(tempDir, '.ana', 'ana.json');
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  }

  /** Collect all console.log output as a single string */
  function getOutput(): string {
    return logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
  }

  /** Collect all console.error output as a single string */
  function getErrorOutput(): string {
    return errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
  }

  // --- Display all ---

  describe('display all', () => {
    // @ana A010
    it('displays all ana.json fields', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config']);

      const output = getOutput();
      expect(output).toContain('anaVersion');
      expect(output).toContain('1.0.0');
      expect(output).toContain('name');
      expect(output).toContain('test-project');
      expect(output).toContain('branchPrefix');
      expect(output).toContain('feature/');
    });

    it('shows nested objects with indentation', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config']);

      const output = getOutput();
      expect(output).toContain('commands:');
      expect(output).toContain('build');
      expect(output).toContain('pnpm run build');
    });

    // @ana A011
    it('outputs valid JSON with --json flag', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', '--json']);

      const output = getOutput();
      const parsed = JSON.parse(output);
      expect(parsed).toBeDefined();
      expect(parsed.anaVersion).toBe('1.0.0');
      expect(parsed.name).toBe('test-project');
    });
  });

  // --- Config get ---

  describe('config get', () => {
    // @ana A012
    it('returns field value for config get', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'get', 'branchPrefix']);

      const output = getOutput();
      expect(output).toContain('feature/');
    });

    // @ana A014
    it('shows undefined for missing keys', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'get', 'nonexistent']);

      const output = getOutput();
      expect(output).toContain('(undefined)');
    });

    // @ana A013
    it('traverses dot notation for nested fields', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'get', 'commands.build']);

      const output = getOutput();
      expect(output).toContain('pnpm run build');
    });

    // @ana A015
    it('traverses custom namespace with dot notation', async () => {
      await writeConfig({
        ...TEST_CONFIG,
        custom: { myKey: 'myValue' },
      });
      const program = await createProgram();
      await runCommand(program, ['config', 'get', 'custom.myKey']);

      const output = getOutput();
      expect(output).toContain('myValue');
    });

    it('deep dot notation into custom namespace', async () => {
      await writeConfig({
        ...TEST_CONFIG,
        custom: { team: { name: 'Engineering', size: 5 } },
      });
      const program = await createProgram();
      await runCommand(program, ['config', 'get', 'custom.team.name']);

      const output = getOutput();
      expect(output).toContain('Engineering');
    });

    it('displays null values as "null"', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'get', 'framework']);

      const output = getOutput();
      expect(output).toBe('null');
    });

    it('displays false values as "false"', async () => {
      await writeConfig({
        ...TEST_CONFIG,
        custom: { enabled: false },
      });
      const program = await createProgram();
      await runCommand(program, ['config', 'get', 'custom.enabled']);

      const output = getOutput();
      expect(output).toBe('false');
    });

    it('errors on dot traversal into non-object', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'get', 'branchPrefix.sub']);

      const errorOutput = getErrorOutput();
      expect(errorOutput).toContain('Cannot traverse');
    });

    // @ana A023
    it('config get outputs valid JSON with --json', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'get', 'branchPrefix', '--json']);

      const output = getOutput();
      const parsed = JSON.parse(output);
      expect(parsed).toBeDefined();
      expect(parsed).toBe('feature/');
    });
  });

  // --- Config set ---

  describe('config set', () => {
    // @ana A016
    it('writes value and preserves existing fields', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'branchPrefix', 'dev/']);

      const config = await readConfig();
      expect(config['branchPrefix']).toBe('dev/');
      // Verify other fields preserved
      expect(config['anaVersion']).toBe('1.0.0');
      expect(config['name']).toBe('test-project');
      expect(config['language']).toBe('TypeScript');
    });

    // @ana A017
    it('rejects machine-managed fields', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'setupPhase', 'complete']);

      const errorOutput = getErrorOutput();
      expect(errorOutput).toContain('managed by');
      expect(errorOutput).toContain('ana setup');

      // Verify file was not modified
      const config = await readConfig();
      expect(config['setupPhase']).toBe('complete');
    });

    // @ana A024
    it('rejects all machine-managed fields', async () => {
      const managedFields = [
        ['anaVersion', 'ana init'],
        ['name', 'ana init'],
        ['language', 'ana scan'],
        ['framework', 'ana scan'],
        ['packageManager', 'ana scan'],
        ['setupPhase', 'ana setup'],
        ['lastScanAt', 'ana scan'],
      ];

      let rejectedCount = 0;

      for (const [field, command] of managedFields) {
        // Reset spies for clean output
        logSpy.mockClear();
        errorSpy.mockClear();
        process.exitCode = 0;

        await writeConfig(TEST_CONFIG);
        const program = await createProgram();
        await runCommand(program, ['config', 'set', field!, 'test-value']);

        const errorOutput = getErrorOutput();
        if (errorOutput.includes('managed by') && errorOutput.includes(command!)) {
          rejectedCount++;
        }
      }

      expect(rejectedCount).toBe(7);
    });

    // @ana A018
    it('parses numeric values correctly', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'custom.port', '8080']);

      const config = await readConfig();
      expect((config['custom'] as Record<string, unknown>)['port']).toBe(8080);
    });

    // @ana A019
    it('parses boolean values correctly', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'custom.enabled', 'true']);

      const config = await readConfig();
      expect((config['custom'] as Record<string, unknown>)['enabled']).toBe(true);
    });

    it('parses null correctly', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'custom.cleared', 'null']);

      const config = await readConfig();
      expect((config['custom'] as Record<string, unknown>)['cleared']).toBeNull();
    });

    it('falls back to string for non-JSON values', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'custom.name', 'my project']);

      const config = await readConfig();
      expect((config['custom'] as Record<string, unknown>)['name']).toBe('my project');
    });

    it('parses JSON object values', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'custom.obj', '{"a":1}']);

      const config = await readConfig();
      expect((config['custom'] as Record<string, unknown>)['obj']).toEqual({ a: 1 });
    });

    // @ana A020
    it('creates intermediate objects for deep paths', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'custom.team.name', 'Engineering']);

      const config = await readConfig();
      const custom = config['custom'] as Record<string, unknown>;
      const team = custom['team'] as Record<string, unknown>;
      expect(team['name']).toBe('Engineering');
    });

    // @ana A021
    it('warns on unknown top-level keys', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'myField', 'value']);

      const errorOutput = getErrorOutput();
      expect(errorOutput).toContain('not a known ana.json field');
      expect(errorOutput).toContain('custom.myField');

      // But still writes the value
      const config = await readConfig();
      expect(config['myField']).toBe('value');
    });

    it('does not warn for custom.* paths', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'custom.myKey', 'value']);

      const errorOutput = getErrorOutput();
      expect(errorOutput).not.toContain('not a known');
    });

    it('does not warn for known fields', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'branchPrefix', 'dev/']);

      const errorOutput = getErrorOutput();
      expect(errorOutput).not.toContain('not a known');
    });

    it('prints confirmation after set', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'branchPrefix', 'dev/']);

      const output = getOutput();
      expect(output).toContain('Set branchPrefix');
      expect(output).toContain('"dev/"');
    });

    it('can replace the custom object entirely', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'custom', '{"team":"eng"}']);

      const config = await readConfig();
      expect(config['custom']).toEqual({ team: 'eng' });
    });

    it('errors on dot traversal into non-object on set', async () => {
      await writeConfig(TEST_CONFIG);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'branchPrefix.sub.key', 'value']);

      const errorOutput = getErrorOutput();
      expect(errorOutput).toContain('Cannot traverse');
    });
  });

  // --- Error cases ---

  describe('error cases', () => {
    // @ana A022
    it('fails with init-first message when no ana.json', async () => {
      // Don't call createTestProject — no .ana/ exists
      await fs.mkdir(path.join(tempDir, '.git'), { recursive: true });
      const program = await createProgram();
      await runCommand(program, ['config']);

      const errorOutput = getErrorOutput();
      expect(errorOutput).toContain('ana init');
    });

    it('config get fails with init-first message when no ana.json', async () => {
      await fs.mkdir(path.join(tempDir, '.git'), { recursive: true });
      const program = await createProgram();
      await runCommand(program, ['config', 'get', 'name']);

      const errorOutput = getErrorOutput();
      expect(errorOutput).toContain('ana init');
    });

    it('config set fails with init-first message when no ana.json', async () => {
      await fs.mkdir(path.join(tempDir, '.git'), { recursive: true });
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'branchPrefix', 'dev/']);

      const errorOutput = getErrorOutput();
      expect(errorOutput).toContain('ana init');
    });
  });

  // --- Surface config ---

  describe('surface config', () => {
    const CONFIG_WITH_SURFACES = {
      ...TEST_CONFIG,
      surfaces: {
        cli: {
          path: 'packages/cli',
          language: 'TypeScript',
          framework: null,
          commands: {
            build: "(cd 'packages/cli' && pnpm run build)",
            test: "(cd 'packages/cli' && pnpm vitest run)",
            lint: "(cd 'packages/cli' && pnpm run lint)",
            dev: null,
          },
        },
        web: {
          path: 'apps/web',
          language: 'TypeScript',
          framework: 'Next.js',
          commands: {
            build: "(cd 'apps/web' && pnpm run build)",
            test: null,
            lint: "(cd 'apps/web' && pnpm run lint)",
            dev: null,
          },
        },
      },
    };

    // @ana A013
    it('config set allows surface commands', async () => {
      await writeConfig(CONFIG_WITH_SURFACES);
      const program = await createProgram();
      process.exitCode = 0;
      await runCommand(program, ['config', 'set', 'surfaces.cli.commands.test', 'my-custom-test']);

      expect(process.exitCode).toBe(0);
      const config = await readConfig();
      const surfaces = config['surfaces'] as Record<string, Record<string, unknown>>;
      const cliCmds = surfaces['cli']!['commands'] as Record<string, string | null>;
      expect(cliCmds['test']).toBe('my-custom-test');
    });

    // @ana A014
    it('config set rejects machine-managed surface fields', async () => {
      await writeConfig(CONFIG_WITH_SURFACES);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'surfaces.cli.path', 'new/path']);

      expect(process.exitCode).toBe(1);
      const errorOutput = getErrorOutput();
      expect(errorOutput).toContain('machine-managed');
    });

    it('config set rejects surfaces.*.language', async () => {
      await writeConfig(CONFIG_WITH_SURFACES);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'surfaces.cli.language', 'JavaScript']);

      expect(process.exitCode).toBe(1);
    });

    it('config set rejects surfaces.*.framework', async () => {
      await writeConfig(CONFIG_WITH_SURFACES);
      const program = await createProgram();
      await runCommand(program, ['config', 'set', 'surfaces.web.framework', 'Remix']);

      expect(process.exitCode).toBe(1);
    });

    // @ana A015
    it('config delete removes surface entry', async () => {
      const configWithOldService = {
        ...CONFIG_WITH_SURFACES,
        surfaces: {
          ...CONFIG_WITH_SURFACES.surfaces,
          'old-service': {
            path: 'packages/old-service',
            language: 'TypeScript',
            framework: null,
            commands: { test: 'old-test' },
          },
        },
      };
      await writeConfig(configWithOldService);
      const program = await createProgram();
      process.exitCode = 0;
      await runCommand(program, ['config', 'delete', 'surfaces.old-service']);

      expect(process.exitCode).toBe(0);
      const config = await readConfig();
      const surfaces = config['surfaces'] as Record<string, unknown>;
      expect(surfaces['old-service']).toBeUndefined();
      // Other surfaces still exist
      expect(surfaces['cli']).toBeDefined();
    });

    // @ana A016
    it('config delete rejects machine-managed surface field', async () => {
      await writeConfig(CONFIG_WITH_SURFACES);
      const program = await createProgram();
      await runCommand(program, ['config', 'delete', 'surfaces.cli.path']);

      expect(process.exitCode).toBe(1);
      const errorOutput = getErrorOutput();
      expect(errorOutput).toContain('machine-managed');
    });

    it('config delete returns error for non-existent field', async () => {
      await writeConfig(CONFIG_WITH_SURFACES);
      const program = await createProgram();
      await runCommand(program, ['config', 'delete', 'surfaces.nonexistent']);

      expect(process.exitCode).toBe(1);
      const errorOutput = getErrorOutput();
      expect(errorOutput).toContain('does not exist');
    });

    // @ana A017
    it('displayAll renders surfaces with three-level nesting', async () => {
      await writeConfig(CONFIG_WITH_SURFACES);
      const program = await createProgram();
      await runCommand(program, ['config', 'show']);

      const output = getOutput();
      expect(output).toContain('surfaces:');
      expect(output).toContain('cli:');
      expect(output).toContain('commands:');
      expect(output).toContain('packages/cli');
    });
  });
});
