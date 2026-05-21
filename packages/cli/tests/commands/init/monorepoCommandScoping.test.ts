/**
 * Contract matrix for surface command generation and merge in `createAnaJson`.
 *
 * After the surface-awareness-schema change: `buildPackage` and `testPackage`
 * are retired. Surfaces get per-surface scoped commands (build/test/lint/dev)
 * derived from each surface's package.json scripts. `mergeSurfaces()` handles
 * re-init merging with path-based matching.
 *
 * Coverage:
 *   A001-A004  Surface generation for monorepo with multiple surfaces
 *   A005       Single-package: no surfaces
 *   A006-A007  buildPackage/testPackage absent from freshly generated ana.json
 *   A008-A009  mergeSurfaces preserves user commands, refreshes mechanical fields
 *   A010       mergeSurfaces adds newly detected surfaces
 *   A011       mergeSurfaces keeps removed surfaces
 *   A012       mergeSurfaces matches by path not key name
 *   A026       Surface with no test script → null test command
 *   A027       Blank surface commands sanitized during merge
 *   A024-A025  Init display surfaces
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createAnaJson, preserveUserState, mergeSurfaces, displaySuccessMessage } from '../../../src/commands/init/state.js';
import { createEmptyEngineResult } from '../../../src/engine/types/engineResult.js';

describe('createAnaJson surface command generation', () => {
  async function readAnaJson(dir: string): Promise<Record<string, unknown>> {
    const content = await fs.readFile(path.join(dir, 'ana.json'), 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Create a fake package directory with a package.json containing
   * the specified scripts.
   */
  async function setupPackage(
    rootDir: string,
    pkgPath: string,
    scripts: Record<string, string>,
  ): Promise<void> {
    const pkgDir = path.join(rootDir, pkgPath);
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: `test-${path.basename(pkgPath)}`, scripts }, null, 2),
      'utf-8',
    );
  }

  function makeMonorepoResult(overrides?: {
    pm?: string;
    build?: string | null;
    lint?: string | null;
    dev?: string | null;
    testing?: string[];
    surfaces?: Array<{ name: string; path: string; language?: string | null; framework?: string | null; testing?: string[] }>;
  }) {
    const pm = overrides?.pm ?? 'pnpm';
    const result = createEmptyEngineResult();
    result.commands = {
      build: overrides?.build ?? `${pm} run build`,
      test: `${pm} run test`,
      lint: overrides?.lint ?? `${pm} run lint`,
      dev: overrides?.dev ?? `${pm} run dev`,
      packageManager: pm,
      all: { test: 'turbo run test' },
    };
    result.stack.testing = overrides?.testing ?? ['Vitest'];
    result.monorepo = {
      isMonorepo: true,
      tool: pm,
      packages: [],
      primaryPackage: null,
    };
    result.surfaces = (overrides?.surfaces ?? []).map(s => ({
      name: s.name,
      path: s.path,
      packageName: null,
      language: s.language ?? 'TypeScript',
      framework: s.framework ?? null,
      testing: s.testing ?? ['Vitest'],
      sourceFiles: 10,
    }));
    return result;
  }

  // @ana A001, A002, A003, A004
  it('generates surfaces section for monorepo', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPackage(cwdDir, 'packages/cli', { build: 'tsup', lint: 'eslint .', test: 'vitest' });
      await setupPackage(cwdDir, 'apps/web', { build: 'next build', lint: 'eslint .' });
      const result = makeMonorepoResult({
        surfaces: [
          { name: 'cli', path: 'packages/cli' },
          { name: 'web', path: 'apps/web', framework: 'Next.js', testing: [] },
        ],
      });

      await createAnaJson(tmpDir, result, cwdDir);
      const anaJson = await readAnaJson(tmpDir);
      const surfaces = anaJson['surfaces'] as Record<string, Record<string, unknown>>;

      // A001: surfaces exist
      expect(surfaces).toBeDefined();
      expect(Object.keys(surfaces)).toContain('cli');
      expect(Object.keys(surfaces)).toContain('web');

      // A004: language detected per surface
      expect(surfaces['cli']!['language']).toBe('TypeScript');
      expect(surfaces['web']!['language']).toBe('TypeScript');
      expect(surfaces['web']!['framework']).toBe('Next.js');

      const cliCmds = surfaces['cli']!['commands'] as Record<string, string | null>;
      const webCmds = surfaces['web']!['commands'] as Record<string, string | null>;

      // A002: scoped test command
      expect(cliCmds['test']).toContain("cd '");
      expect(cliCmds['test']).toContain('vitest run');

      // A003: scoped build command
      expect(cliCmds['build']).toContain("cd '");
      expect(cliCmds['build']).toBe("(cd 'packages/cli' && pnpm run build)");

      // A026: surface with no test script gets null
      expect(webCmds['test']).toBeNull();
      expect(webCmds['build']).toBe("(cd 'apps/web' && pnpm run build)");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A005
  it('does not generate surfaces for single-package repo', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      const result = createEmptyEngineResult();
      result.commands = {
        build: 'pnpm run build', test: 'pnpm run test',
        lint: 'pnpm run lint', dev: 'pnpm run dev',
        packageManager: 'pnpm', all: { test: 'vitest' },
      };
      result.stack.testing = ['Vitest'];
      // No surfaces

      await createAnaJson(tmpDir, result, cwdDir);
      const anaJson = await readAnaJson(tmpDir);
      // surfaces should not be present at all (empty object omitted)
      expect(anaJson['surfaces']).toBeUndefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A006, A007
  it('does not generate buildPackage or testPackage', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPackage(cwdDir, 'packages/cli', { build: 'tsup', test: 'vitest' });
      const result = makeMonorepoResult({
        surfaces: [{ name: 'cli', path: 'packages/cli' }],
      });

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, unknown>;
      expect(cmds['buildPackage']).toBeUndefined();
      expect(cmds['testPackage']).toBeUndefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('keeps lint project-wide in monorepo (matches build and test)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPackage(cwdDir, 'packages/cli', { build: 'tsup', lint: 'eslint .' });
      const result = makeMonorepoResult({
        surfaces: [{ name: 'cli', path: 'packages/cli' }],
      });
      result.monorepo.primaryPackage = { name: '@myapp/cli', path: 'packages/cli' };

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['lint']).toBe('pnpm run lint');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('does not scope dev command in monorepo', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPackage(cwdDir, 'packages/cli', { build: 'tsup', dev: 'vite' });
      const result = makeMonorepoResult({
        surfaces: [{ name: 'cli', path: 'packages/cli' }],
      });

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['dev']).toBe('pnpm run dev');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('uses compile key when build key is absent in surface', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPackage(cwdDir, 'packages/cli', { compile: 'tsc -b' });
      const result = makeMonorepoResult({
        surfaces: [{ name: 'cli', path: 'packages/cli' }],
      });

      await createAnaJson(tmpDir, result, cwdDir);
      const surfaces = (await readAnaJson(tmpDir))['surfaces'] as Record<string, Record<string, unknown>>;
      const cliCmds = surfaces['cli']!['commands'] as Record<string, string | null>;
      expect(cliCmds['build']).toBe("(cd 'packages/cli' && pnpm run compile)");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('scopes lint command using biome key when lint key is absent in surface', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPackage(cwdDir, 'packages/cli', { biome: 'biome check' });
      const result = makeMonorepoResult({
        surfaces: [{ name: 'cli', path: 'packages/cli' }],
      });

      await createAnaJson(tmpDir, result, cwdDir);
      const surfaces = (await readAnaJson(tmpDir))['surfaces'] as Record<string, Record<string, unknown>>;
      const cliCmds = surfaces['cli']!['commands'] as Record<string, string | null>;
      expect(cliCmds['lint']).toBe("(cd 'packages/cli' && pnpm run biome)");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('falls back to null commands when surface package.json is missing', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      // Don't create the package.json — directory doesn't even exist
      const result = makeMonorepoResult({
        surfaces: [{ name: 'cli', path: 'packages/cli' }],
      });

      await createAnaJson(tmpDir, result, cwdDir);
      const surfaces = (await readAnaJson(tmpDir))['surfaces'] as Record<string, Record<string, unknown>>;
      const cliCmds = surfaces['cli']!['commands'] as Record<string, string | null>;
      expect(cliCmds['build']).toBeNull();
      expect(cliCmds['test']).toBeNull();
      expect(cliCmds['lint']).toBeNull();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('falls back to null commands when surface package.json is malformed', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      const pkgDir = path.join(cwdDir, 'packages', 'cli');
      await fs.mkdir(pkgDir, { recursive: true });
      await fs.writeFile(path.join(pkgDir, 'package.json'), '{ not valid json!!!', 'utf-8');
      const result = makeMonorepoResult({
        surfaces: [{ name: 'cli', path: 'packages/cli' }],
      });

      await createAnaJson(tmpDir, result, cwdDir);
      const surfaces = (await readAnaJson(tmpDir))['surfaces'] as Record<string, Record<string, unknown>>;
      const cliCmds = surfaces['cli']!['commands'] as Record<string, string | null>;
      expect(cliCmds['build']).toBeNull();
      expect(cliCmds['test']).toBeNull();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('writes surface build with npm prefix for npm monorepo', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPackage(cwdDir, 'packages/cli', { build: 'tsc' });
      const result = makeMonorepoResult({
        pm: 'npm',
        build: 'npm run build',
        lint: 'npm run lint',
        surfaces: [{ name: 'cli', path: 'packages/cli' }],
      });

      await createAnaJson(tmpDir, result, cwdDir);
      const surfaces = (await readAnaJson(tmpDir))['surfaces'] as Record<string, Record<string, unknown>>;
      const cliCmds = surfaces['cli']!['commands'] as Record<string, string | null>;
      expect(cliCmds['build']).toBe("(cd 'packages/cli' && npm run build)");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A026
  it('generates null test command for surface without test script', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPackage(cwdDir, 'apps/web', { build: 'next build' });
      const result = makeMonorepoResult({
        surfaces: [{ name: 'web', path: 'apps/web', framework: 'Next.js', testing: [] }],
      });

      await createAnaJson(tmpDir, result, cwdDir);
      const surfaces = (await readAnaJson(tmpDir))['surfaces'] as Record<string, Record<string, unknown>>;
      const webCmds = surfaces['web']!['commands'] as Record<string, string | null>;
      expect(webCmds['test']).toBeNull();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('generates empty surfaces record for monorepo with zero qualifying surfaces', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      const result = makeMonorepoResult({ surfaces: [] });

      await createAnaJson(tmpDir, result, cwdDir);
      const anaJson = await readAnaJson(tmpDir);
      // No surfaces key when zero qualifying surfaces
      expect(anaJson['surfaces']).toBeUndefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });
});

describe('mergeSurfaces', () => {
  // @ana A008
  it('mergeSurfaces preserves user-tuned commands', () => {
    const existing = {
      cli: {
        path: 'packages/cli',
        language: 'TypeScript',
        framework: null,
        commands: { build: 'custom-build', test: 'custom-user-test-command', lint: 'custom-lint', dev: null },
      },
    };
    const fresh = {
      cli: {
        path: 'packages/cli',
        language: 'TypeScript',
        framework: null,
        commands: { build: "(cd 'packages/cli' && pnpm run build)", test: "(cd 'packages/cli' && pnpm vitest run)", lint: "(cd 'packages/cli' && pnpm run lint)", dev: null },
      },
    };
    const merged = mergeSurfaces(existing, fresh);
    expect(merged['cli']!.commands['test']).toBe('custom-user-test-command');
    expect(merged['cli']!.commands['build']).toBe('custom-build');
  });

  // @ana A009
  it('mergeSurfaces refreshes mechanical fields', () => {
    const existing = {
      cli: {
        path: 'packages/cli',
        language: 'JavaScript',  // old language
        framework: 'Express',    // old framework
        commands: { test: 'custom-test' },
      },
    };
    const fresh = {
      cli: {
        path: 'packages/cli',
        language: 'TypeScript',   // new language
        framework: null,          // framework removed
        commands: { test: "(cd 'packages/cli' && pnpm vitest run)" },
      },
    };
    const merged = mergeSurfaces(existing, fresh);
    expect(merged['cli']!.language).toBe('TypeScript');
    expect(merged['cli']!.framework).toBeNull();
    // Commands preserved
    expect(merged['cli']!.commands['test']).toBe('custom-test');
  });

  // @ana A010
  it('mergeSurfaces adds newly detected surfaces', () => {
    const existing = {
      cli: {
        path: 'packages/cli',
        language: 'TypeScript',
        framework: null,
        commands: { test: 'custom-test' },
      },
    };
    const fresh = {
      cli: {
        path: 'packages/cli',
        language: 'TypeScript',
        framework: null,
        commands: { test: "(cd 'packages/cli' && pnpm vitest run)" },
      },
      'new-surface': {
        path: 'packages/api',
        language: 'TypeScript',
        framework: 'NestJS',
        commands: { test: "(cd 'packages/api' && pnpm vitest run)", build: "(cd 'packages/api' && pnpm run build)" },
      },
    };
    const merged = mergeSurfaces(existing, fresh);
    expect(merged['new-surface']).toBeDefined();
    expect(merged['new-surface']!.path).toBe('packages/api');
    expect(merged['new-surface']!.commands['test']).toBe("(cd 'packages/api' && pnpm vitest run)");
  });

  // @ana A011
  it('mergeSurfaces keeps removed surfaces', () => {
    const existing = {
      cli: {
        path: 'packages/cli',
        language: 'TypeScript',
        framework: null,
        commands: { test: 'custom-test' },
      },
      'old-service': {
        path: 'packages/old-service',
        language: 'TypeScript',
        framework: null,
        commands: { test: 'old-test', build: 'old-build' },
      },
    };
    const fresh = {
      cli: {
        path: 'packages/cli',
        language: 'TypeScript',
        framework: null,
        commands: { test: "(cd 'packages/cli' && pnpm vitest run)" },
      },
    };
    // old-service not in fresh — should be kept
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const merged = mergeSurfaces(existing, fresh);
    expect(merged['old-service']).toBeDefined();
    expect(merged['old-service']!.path).toBe('packages/old-service');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('old-service'));
    warnSpy.mockRestore();
  });

  // @ana A012
  it('mergeSurfaces matches by path not key name', () => {
    const existing = {
      'old-key': {
        path: 'packages/cli',
        language: 'TypeScript',
        framework: null,
        commands: { test: 'custom-test', build: 'custom-build' },
      },
    };
    const fresh = {
      'renamed-key': {
        path: 'packages/cli',
        language: 'TypeScript',
        framework: null,
        commands: { test: "(cd 'packages/cli' && pnpm vitest run)", build: "(cd 'packages/cli' && pnpm run build)" },
      },
    };
    const merged = mergeSurfaces(existing, fresh);
    // Renamed key gets the existing commands because path matches
    expect(merged['renamed-key']!.commands['test']).toBe('custom-test');
    expect(merged['renamed-key']!.commands['build']).toBe('custom-build');
    // Old key should not persist (it was matched to renamed-key)
    expect(merged['old-key']).toBeUndefined();
  });

  // @ana A027
  it('mergeSurfaces sanitizes blank commands', () => {
    const existing = {
      cli: {
        path: 'packages/cli',
        language: 'TypeScript',
        framework: null,
        commands: { build: '', test: 'valid-test', lint: null },
      },
    };
    const fresh = {
      cli: {
        path: 'packages/cli',
        language: 'TypeScript',
        framework: null,
        commands: { build: null, test: "(cd 'packages/cli' && pnpm vitest run)", lint: "(cd 'packages/cli' && pnpm run lint)" },
      },
    };
    const merged = mergeSurfaces(existing, fresh);
    // Blank build sanitized to fresh value (null)
    expect(merged['cli']!.commands['build']).toBeNull();
    // Non-blank test preserved
    expect(merged['cli']!.commands['test']).toBe('valid-test');
  });

  it('propagates new command keys on re-init without overwriting existing', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const existingAnaPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-existing-'));
    try {
      const existingConfig = {
        anaVersion: '1.0.0',
        name: 'test-project',
        language: 'TypeScript',
        framework: null,
        packageManager: 'pnpm',
        commands: {
          build: 'custom-build-command',
          test: 'pnpm vitest run',
          lint: 'pnpm run lint',
          dev: 'pnpm run dev',
        },
        surfaces: {
          cli: {
            path: 'packages/cli',
            language: 'TypeScript',
            framework: null,
            commands: { test: 'custom-surface-test' },
          },
        },
        coAuthor: 'Ana <build@anatomia.dev>',
        artifactBranch: 'main',
        branchPrefix: 'feature/',
        setupPhase: 'complete',
        lastScanAt: '2026-01-01T00:00:00.000Z',
        custom: {},
      };
      await fs.writeFile(
        path.join(existingAnaPath, 'ana.json'),
        JSON.stringify(existingConfig, null, 2),
        'utf-8',
      );

      const freshConfig: Record<string, unknown> = {
        anaVersion: '1.1.0',
        lastScanAt: '2026-05-17T00:00:00.000Z',
        name: 'test-project',
        language: 'TypeScript',
        framework: null,
        packageManager: 'pnpm',
        commands: {
          build: 'pnpm run build',
          test: 'pnpm run test -- --run',
          lint: 'pnpm run lint',
          dev: 'pnpm run dev',
        },
        surfaces: {
          cli: {
            path: 'packages/cli',
            language: 'TypeScript',
            framework: null,
            commands: { test: "(cd 'packages/cli' && pnpm vitest run)", build: "(cd 'packages/cli' && pnpm run build)" },
          },
        },
      };

      await fs.writeFile(
        path.join(tmpDir, 'ana.json'),
        JSON.stringify(freshConfig, null, 2),
        'utf-8',
      );

      const merged = await preserveUserState(existingAnaPath, tmpDir, freshConfig);
      expect(merged).not.toBeNull();
      const mergedCmds = (merged!['commands'] ?? {}) as Record<string, unknown>;
      // Existing build NOT overwritten
      expect(mergedCmds['build']).toBe('custom-build-command');

      // Surface commands preserved
      const mergedSurfaces = (merged!['surfaces'] ?? {}) as Record<string, Record<string, unknown>>;
      const cliCmds = mergedSurfaces['cli']!['commands'] as Record<string, string | null>;
      expect(cliCmds['test']).toBe('custom-surface-test');
      // New command key propagated
      expect(cliCmds['build']).toBe("(cd 'packages/cli' && pnpm run build)");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(existingAnaPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('does not overwrite existing command keys on re-init', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const existingAnaPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-existing-'));
    try {
      const existingConfig = {
        anaVersion: '1.0.0',
        name: 'test-project',
        language: 'TypeScript',
        framework: null,
        packageManager: 'pnpm',
        commands: {
          build: 'custom-build-command',
          test: 'pnpm vitest run',
          lint: 'pnpm run lint',
          dev: 'pnpm run dev',
        },
        coAuthor: 'Ana <build@anatomia.dev>',
        artifactBranch: 'main',
        branchPrefix: 'feature/',
        setupPhase: 'complete',
        lastScanAt: '2026-01-01T00:00:00.000Z',
        custom: {},
      };
      await fs.writeFile(
        path.join(existingAnaPath, 'ana.json'),
        JSON.stringify(existingConfig, null, 2),
        'utf-8',
      );

      const freshConfig: Record<string, unknown> = {
        anaVersion: '1.1.0',
        lastScanAt: '2026-05-17T00:00:00.000Z',
        name: 'test-project',
        language: 'TypeScript',
        framework: null,
        packageManager: 'pnpm',
        commands: {
          build: 'pnpm run build',
          test: 'pnpm run test -- --run',
          lint: 'pnpm run lint',
          dev: 'pnpm run dev',
        },
      };

      await fs.writeFile(
        path.join(tmpDir, 'ana.json'),
        JSON.stringify(freshConfig, null, 2),
        'utf-8',
      );

      const merged = await preserveUserState(existingAnaPath, tmpDir, freshConfig);
      expect(merged).not.toBeNull();
      const mergedCmds = (merged!['commands'] ?? {}) as Record<string, unknown>;
      // Existing build NOT overwritten by fresh value
      expect(mergedCmds['build']).toBe('custom-build-command');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(existingAnaPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });
});

describe('displaySuccessMessage surfaces', () => {
  function makeConfig(surfaceCount: number): Record<string, unknown> {
    const surfaces: Record<string, unknown> = {};
    const names = ['cli', 'web', 'worker', 'api', 'docs'];
    for (let i = 0; i < surfaceCount; i++) {
      const name = names[i] ?? `surface-${i}`;
      surfaces[name] = {
        path: `packages/${name}`,
        language: 'TypeScript',
        framework: null,
        commands: i === 1 ? { build: "(cd 'packages/web' && pnpm run build)" } : { test: `(cd 'packages/${name}' && pnpm vitest run)`, build: `(cd 'packages/${name}' && pnpm run build)` },
      };
    }
    return {
      artifactBranch: 'main',
      commands: { test: 'pnpm run test -- --run', build: 'pnpm run build' },
      surfaces,
    };
  }

  // @ana A024
  it('displaySuccessMessage shows surfaces', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const engineResult = createEmptyEngineResult();
    engineResult.commands = { build: 'pnpm run build', test: 'pnpm run test', lint: null, dev: null, packageManager: 'pnpm', all: {} };
    engineResult.stack.testing = ['Vitest'];

    displaySuccessMessage(engineResult, 'test-project', '1.0', makeConfig(2));

    const allOutput = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(allOutput).toContain('Surfaces:');
    logSpy.mockRestore();
  });

  // @ana A025
  it('displaySuccessMessage truncates at 3 surfaces', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const engineResult = createEmptyEngineResult();
    engineResult.commands = { build: 'pnpm run build', test: 'pnpm run test', lint: null, dev: null, packageManager: 'pnpm', all: {} };
    engineResult.stack.testing = ['Vitest'];

    displaySuccessMessage(engineResult, 'test-project', '1.0', makeConfig(5));

    const allOutput = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(allOutput).toContain('+2 more');
    logSpy.mockRestore();
  });
});
