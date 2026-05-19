/**
 * Contract matrix for monorepo command scoping in `createAnaJson`.
 *
 * After the flip: `build` and `test` are project-wide root commands.
 * `buildPackage` and `testPackage` are additive scoped variants that only
 * appear when their value differs from the root command. Lint stays scoped.
 *
 * 16 cases covering:
 *   A001-A002  Build is root, buildPackage is scoped for monorepo
 *   A003-A004  Fallback to root when primary package lacks scripts
 *   A005       Single-repo: no buildPackage/testPackage
 *   A006       Dev command never scoped
 *   A007-A008  Alternate script key lookup (compile, biome)
 *   A009-A010  Missing/malformed package.json fallback
 *   A011       Package manager prefix (npm)
 *   A012       Test is root non-interactive, testPackage is scoped
 *   A013-A014  buildPackage/testPackage omitted when identical to root
 *   A015-A016  preserveUserState propagation (new keys appear, existing not overwritten)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createAnaJson, preserveUserState } from '../../../src/commands/init/state.js';
import { createEmptyEngineResult } from '../../../src/engine/types/engineResult.js';

describe('createAnaJson monorepo command scoping', () => {
  let tmpDir: string;
  let cwdDir: string;

  async function readAnaJson(dir: string): Promise<Record<string, unknown>> {
    const content = await fs.readFile(path.join(dir, 'ana.json'), 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Create a fake primary package directory with a package.json containing
   * the specified scripts.
   */
  async function setupPrimaryPackage(
    rootDir: string,
    pkgPath: string,
    scripts: Record<string, string>,
  ): Promise<void> {
    const pkgDir = path.join(rootDir, pkgPath);
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'test-pkg', scripts }, null, 2),
      'utf-8',
    );
  }

  function makeMonorepoResult(overrides?: {
    pm?: string;
    pkgPath?: string;
    build?: string | null;
    lint?: string | null;
    dev?: string | null;
    testing?: string[];
  }) {
    const pm = overrides?.pm ?? 'pnpm';
    const pkgPath = overrides?.pkgPath ?? 'packages/cli';
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
      packages: [{ name: '@myapp/cli', path: pkgPath }],
      primaryPackage: { name: '@myapp/cli', path: pkgPath },
    };
    return result;
  }

  // @ana A001
  it('keeps build as project-wide root command in monorepo', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPrimaryPackage(cwdDir, 'packages/cli', { build: 'tsup', lint: 'eslint .' });
      const result = makeMonorepoResult();

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['build']).toBe('pnpm run build');
      expect(cmds['buildPackage']).toBe(`(cd 'packages/cli' && pnpm run build)`);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A023
  it('keeps lint scoped in monorepo (not flipped)', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPrimaryPackage(cwdDir, 'packages/cli', { build: 'tsup', lint: 'eslint .' });
      const result = makeMonorepoResult();

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['lint']).toBe(`(cd 'packages/cli' && pnpm run lint)`);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A008
  it('keeps root build command when primary package has no build script', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPrimaryPackage(cwdDir, 'packages/cli', { lint: 'eslint .' });
      const result = makeMonorepoResult();

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['build']).toBe('pnpm run build');
      // @ana A009
      expect(cmds['buildPackage']).toBeUndefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('keeps root lint command when primary package has no lint script', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPrimaryPackage(cwdDir, 'packages/cli', { build: 'tsup' });
      const result = makeMonorepoResult();

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['lint']).toBe('pnpm run lint');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A005
  it('does not add buildPackage or testPackage for single-repo projects', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      const result = createEmptyEngineResult();
      result.commands = {
        build: 'pnpm run build', test: 'pnpm run test',
        lint: 'pnpm run lint', dev: 'pnpm run dev',
        packageManager: 'pnpm', all: { test: 'vitest' },
      };
      result.stack.testing = ['Vitest'];

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['build']).toBe('pnpm run build');
      expect(cmds['lint']).toBe('pnpm run lint');
      expect(cmds['buildPackage']).toBeUndefined();
      expect(cmds['testPackage']).toBeUndefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('does not scope dev command in monorepo', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPrimaryPackage(cwdDir, 'packages/cli', { build: 'tsup', lint: 'eslint .', dev: 'vite' });
      const result = makeMonorepoResult();

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['dev']).toBe('pnpm run dev');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A002
  it('writes buildPackage using compile key when build key is absent', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPrimaryPackage(cwdDir, 'packages/cli', { compile: 'tsc -b' });
      const result = makeMonorepoResult();

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['build']).toBe('pnpm run build');
      expect(cmds['buildPackage']).toBe(`(cd 'packages/cli' && pnpm run compile)`);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('scopes lint command using biome key when lint key is absent', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPrimaryPackage(cwdDir, 'packages/cli', { biome: 'biome check' });
      const result = makeMonorepoResult();

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['lint']).toBe(`(cd 'packages/cli' && pnpm run biome)`);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('falls back to root commands when primary package.json is missing', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      // Don't create the package.json — directory doesn't even exist
      const result = makeMonorepoResult();

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['build']).toBe('pnpm run build');
      expect(cmds['lint']).toBe('pnpm run lint');
      expect(cmds['buildPackage']).toBeUndefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('falls back to root commands when primary package.json is malformed', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      const pkgDir = path.join(cwdDir, 'packages', 'cli');
      await fs.mkdir(pkgDir, { recursive: true });
      await fs.writeFile(path.join(pkgDir, 'package.json'), '{ not valid json!!!', 'utf-8');
      const result = makeMonorepoResult();

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['build']).toBe('pnpm run build');
      expect(cmds['lint']).toBe('pnpm run lint');
      expect(cmds['buildPackage']).toBeUndefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A001
  it('writes buildPackage with npm prefix for npm monorepo', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPrimaryPackage(cwdDir, 'packages/cli', { build: 'tsc' });
      const result = makeMonorepoResult({ pm: 'npm', build: 'npm run build', lint: 'npm run lint' });

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['build']).toBe('npm run build');
      expect(cmds['buildPackage']).toBe(`(cd 'packages/cli' && npm run build)`);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A003, A004
  it('keeps test as root non-interactive and writes testPackage as scoped', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPrimaryPackage(cwdDir, 'apps/web', { build: 'next build', test: 'vitest' });
      const result = createEmptyEngineResult();
      result.commands = {
        build: null, test: 'pnpm run test', lint: null, dev: null,
        packageManager: 'pnpm', all: { test: 'turbo run test' },
      };
      result.stack.testing = ['Vitest'];
      result.monorepo = {
        isMonorepo: true, tool: 'pnpm',
        packages: [{ name: '@myapp/web', path: 'apps/web' }],
        primaryPackage: { name: '@myapp/web', path: 'apps/web' },
      };

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      // Test stays root non-interactive (no cd prefix)
      expect(cmds['test']).not.toContain('(cd ');
      expect(cmds['test']).toContain('--run');
      // testPackage is scoped to primary package
      expect(cmds['testPackage']).toBe(`(cd 'apps/web' && pnpm vitest run)`);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A006
  it('omits buildPackage when root and scoped values are identical', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      // Set root build to the same value the scoping would produce
      await setupPrimaryPackage(cwdDir, 'packages/cli', { build: 'tsup' });
      const result = makeMonorepoResult({ build: `(cd 'packages/cli' && pnpm run build)` });

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['buildPackage']).toBeUndefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A007
  it('omits testPackage when no test command is detected', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      // When root test is null, testPackageCmd stays null — no testPackage written.
      // The "identical values" comparison also guards against equal strings (same
      // code path as buildPackage, tested in A006).
      await setupPrimaryPackage(cwdDir, 'packages/cli', { build: 'tsup' });
      const result = makeMonorepoResult();
      result.commands.test = null;

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['test']).toBeNull();
      expect(cmds['testPackage']).toBeUndefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A010
  it('propagates new command keys on re-init without overwriting existing', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const existingAnaPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-existing-'));
    try {
      // Simulate existing ana.json with no buildPackage key
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

      // Fresh config with new buildPackage key
      const freshConfig: Record<string, unknown> = {
        anaVersion: '1.1.0',
        lastScanAt: '2026-05-17T00:00:00.000Z',
        commands: {
          build: 'pnpm run build',
          test: 'pnpm run test -- --run',
          lint: `(cd 'packages/cli' && pnpm run lint)`,
          dev: 'pnpm run dev',
          buildPackage: `(cd 'packages/cli' && pnpm run build)`,
          testPackage: `(cd 'packages/cli' && pnpm vitest run)`,
        },
      };

      // Write a placeholder ana.json in tmpDir (preserveUserState will overwrite)
      await fs.writeFile(
        path.join(tmpDir, 'ana.json'),
        JSON.stringify(freshConfig, null, 2),
        'utf-8',
      );

      const merged = await preserveUserState(existingAnaPath, tmpDir, freshConfig);
      expect(merged).not.toBeNull();
      const mergedCmds = (merged!['commands'] ?? {}) as Record<string, unknown>;

      // @ana A011 — existing build NOT overwritten
      expect(mergedCmds['build']).toBe('custom-build-command');
      // New key propagated from fresh detection
      expect(mergedCmds['buildPackage']).toBe(`(cd 'packages/cli' && pnpm run build)`);
      expect(mergedCmds['testPackage']).toBe(`(cd 'packages/cli' && pnpm vitest run)`);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(existingAnaPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A011
  it('does not overwrite existing command keys on re-init', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const existingAnaPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-existing-'));
    try {
      // Existing config already has buildPackage with custom value
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
          buildPackage: 'my-custom-package-build',
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
        commands: {
          build: 'pnpm run build',
          test: 'pnpm run test -- --run',
          lint: `(cd 'packages/cli' && pnpm run lint)`,
          dev: 'pnpm run dev',
          buildPackage: `(cd 'packages/cli' && pnpm run build)`,
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

      // Existing buildPackage NOT overwritten by fresh value
      expect(mergedCmds['buildPackage']).toBe('my-custom-package-build');
      // Existing build NOT overwritten either
      expect(mergedCmds['build']).toBe('custom-build-command');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(existingAnaPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });
});
