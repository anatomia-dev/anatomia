/**
 * Contract matrix for `makeTestCommandNonInteractive`.
 *
 * The function transforms a raw `package.json` test script into a form safe
 * to run in CI / pipeline contexts (no watch mode, no interactive prompts).
 *
 * 15 cases:
 *   1-6   Vitest variants (watch default + subcommand + flag + wrappers)
 *   7-9   Jest variants (default + --watch + --watchAll)
 *   10-11 Mocha variants (--watch + default)
 *   12    pytest passthrough
 *   13    go test (no framework detected)
 *   14    multi-framework Jest + Playwright
 *   15    `pnpm run test -- --run` — protects Anatomia's own CI command
 *
 * The multi-framework case accepts `string[]` and uses `.includes()` for
 * membership so projects with both Jest and Playwright still get the Jest
 * transform without the Playwright membership mis-routing the call.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { makeTestCommandNonInteractive, buildDirectTestCommand, createAnaJson } from '../../../src/commands/init/state.js';
import { createEmptyEngineResult } from '../../../src/engine/types/engineResult.js';

describe('makeTestCommandNonInteractive', () => {
  it.each([
    // [description, input command, frameworks, expected output]
    ['Vitest bare — needs --run',       'vitest',                    ['Vitest'],            'vitest -- --run'],
    ['Vitest run subcommand — already non-interactive',
                                        'vitest run',                ['Vitest'],            'vitest run'],
    ['Vitest --run flag — already non-interactive',
                                        'vitest --run',              ['Vitest'],            'vitest --run'],
    ['Vitest run --coverage — subcommand present, coverage preserved',
                                        'vitest run --coverage',     ['Vitest'],            'vitest run --coverage'],
    ['npx vitest — wrapped, needs run',
                                        'npx vitest',                ['Vitest'],            'npx vitest -- --run'],
    ['npx vitest run — wrapped + subcommand',
                                        'npx vitest run',            ['Vitest'],            'npx vitest run'],
    ['Jest bare — non-interactive by default',
                                        'jest',                      ['Jest'],              'jest'],
    ['Jest --watch — disable via passthrough',
                                        'jest --watch',              ['Jest'],              'jest --watch -- --watchAll=false'],
    ['Jest --watchAll — disable via passthrough',
                                        'jest --watchAll',           ['Jest'],              'jest --watchAll -- --watchAll=false'],
    ['Mocha --watch — disable via passthrough',
                                        'mocha --watch',             ['Mocha'],             'mocha --watch -- --watch=false'],
    ['Mocha bare — non-interactive by default',
                                        'mocha',                     ['Mocha'],             'mocha'],
    ['pytest passthrough',              'pytest',                    ['pytest'],            'pytest'],
    ['go test — no framework detected, passthrough',
                                        'go test',                   [],                    'go test'],
    ['multi-framework Jest + Playwright — no watch flags, no change',
                                        'jest',                      ['Jest', 'Playwright'], 'jest'],
    ['pnpm run test -- --run — protects Anatomia\'s own CI command',
                                        'pnpm run test -- --run',    ['Vitest'],            'pnpm run test -- --run'],
  ])('%s', (_name, input, frameworks, expected) => {
    expect(makeTestCommandNonInteractive(input, frameworks)).toBe(expected);
  });

  it('returns null when testCommand is null', () => {
    expect(makeTestCommandNonInteractive(null, ['Vitest'])).toBeNull();
  });

  it('Jest rawScript --watchAll — wrapper clean, raw script has flag', () => {
    // The real-world case: npm test wrapper, jest --watchAll in package.json scripts
    expect(makeTestCommandNonInteractive('npm test', ['Jest'], 'jest --watchAll'))
      .toBe('npm test -- --watchAll=false');
  });

  it('Jest rawScript --watch — wrapper clean, raw script has flag', () => {
    expect(makeTestCommandNonInteractive('npm test', ['Jest'], 'jest --watch'))
      .toBe('npm test -- --watchAll=false');
  });

  it('Mocha rawScript --watch — wrapper clean, raw script has flag', () => {
    expect(makeTestCommandNonInteractive('pnpm run test', ['Mocha'], 'mocha --watch'))
      .toBe('pnpm run test -- --watch=false');
  });
});

describe('buildDirectTestCommand', () => {
  // @ana A011
  it('returns pnpm vitest run for Vitest', () => {
    expect(buildDirectTestCommand(['Vitest'], 'pnpm')).toBe('pnpm vitest run');
  });

  // @ana A012
  it('returns yarn vitest run for Vitest + yarn', () => {
    expect(buildDirectTestCommand(['Vitest'], 'yarn')).toBe('yarn vitest run');
  });

  it('returns jest --watchAll=false for Jest', () => {
    expect(buildDirectTestCommand(['Jest'], 'pnpm')).toBe('pnpm jest --watchAll=false');
  });

  it('returns mocha --exit for Mocha', () => {
    expect(buildDirectTestCommand(['Mocha'], 'pnpm')).toBe('pnpm mocha --exit');
  });

  // @ana A008
  it('returns npx vitest run for npm', () => {
    expect(buildDirectTestCommand(['Vitest'], 'npm')).toBe('npx vitest run');
  });

  // @ana A009
  it('returns npx jest --watchAll=false for npm', () => {
    expect(buildDirectTestCommand(['Jest'], 'npm')).toBe('npx jest --watchAll=false');
  });

  // @ana A010
  it('returns npx mocha --exit for npm', () => {
    expect(buildDirectTestCommand(['Mocha'], 'npm')).toBe('npx mocha --exit');
  });

  it('returns pytest for pytest (no pm prefix)', () => {
    expect(buildDirectTestCommand(['pytest'], 'pip')).toBe('pytest');
  });

  it('returns null for unknown framework', () => {
    expect(buildDirectTestCommand(['Playwright'], 'pnpm')).toBeNull();
  });

  it('prefers Vitest over Jest when both present', () => {
    expect(buildDirectTestCommand(['Jest', 'Vitest'], 'pnpm')).toBe('pnpm vitest run');
  });

  it('picks Jest when paired with Playwright (E2E tool)', () => {
    expect(buildDirectTestCommand(['Jest', 'Playwright'], 'pnpm')).toBe('pnpm jest --watchAll=false');
  });
});

describe('createAnaJson monorepo test command scoping', () => {
  let tmpDir: string;

  async function readAnaJson(dir: string): Promise<Record<string, unknown>> {
    const content = await fs.readFile(path.join(dir, 'ana.json'), 'utf-8');
    return JSON.parse(content);
  }

  it('keeps test as root non-interactive and writes surface test command for pnpm Vitest monorepo', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      // Create surface package.json with test script
      const pkgDir = path.join(cwdDir, 'apps', 'web');
      await fs.mkdir(pkgDir, { recursive: true });
      await fs.writeFile(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@myapp/web', scripts: { test: 'vitest', build: 'next build' } }, null, 2), 'utf-8');

      const result = createEmptyEngineResult();
      result.commands = { build: null, test: 'pnpm run test', lint: null, dev: null, packageManager: 'pnpm', all: { test: 'turbo run test' } };
      result.stack.testing = ['Vitest'];
      result.monorepo = { isMonorepo: true, tool: 'pnpm', packages: [], primaryPackage: null };
      result.surfaces = [{ name: 'web', path: 'apps/web', packageName: '@myapp/web', language: 'TypeScript', framework: null, testing: ['Vitest'], sourceFiles: 10 }];

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['test']).toBe('pnpm run test -- --run');
      // Surface test command instead of testPackage
      const surfaces = (await readAnaJson(tmpDir))['surfaces'] as Record<string, Record<string, unknown>>;
      const webCmds = surfaces['web']!['commands'] as Record<string, string | null>;
      expect(webCmds['test']).toBe("(cd 'apps/web' && pnpm vitest run)");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('keeps test as root and writes surface test command for yarn Jest monorepo', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      const pkgDir = path.join(cwdDir, 'apps', 'web');
      await fs.mkdir(pkgDir, { recursive: true });
      await fs.writeFile(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@myapp/web', scripts: { test: 'jest' } }, null, 2), 'utf-8');

      const result = createEmptyEngineResult();
      result.commands = { build: null, test: 'yarn run test', lint: null, dev: null, packageManager: 'yarn', all: { test: 'turbo run test' } };
      result.stack.testing = ['Jest'];
      result.monorepo = { isMonorepo: true, tool: 'yarn', packages: [], primaryPackage: null };
      result.surfaces = [{ name: 'web', path: 'apps/web', packageName: '@myapp/web', language: 'TypeScript', framework: null, testing: ['Jest'], sourceFiles: 10 }];

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['test']).toBe('yarn run test');
      const surfaces = (await readAnaJson(tmpDir))['surfaces'] as Record<string, Record<string, unknown>>;
      const webCmds = surfaces['web']!['commands'] as Record<string, string | null>;
      expect(webCmds['test']).toBe("(cd 'apps/web' && yarn jest --watchAll=false)");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('writes surface test command with test script fallback when framework unknown', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      const pkgDir = path.join(cwdDir, 'apps', 'web');
      await fs.mkdir(pkgDir, { recursive: true });
      await fs.writeFile(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@myapp/web', scripts: { test: 'custom-runner' } }, null, 2), 'utf-8');

      const result = createEmptyEngineResult();
      result.commands = { build: null, test: 'pnpm run test', lint: null, dev: null, packageManager: 'pnpm', all: { test: 'custom-runner' } };
      result.stack.testing = ['Playwright'];
      result.monorepo = { isMonorepo: true, tool: 'pnpm', packages: [], primaryPackage: null };
      result.surfaces = [{ name: 'web', path: 'apps/web', packageName: '@myapp/web', language: 'TypeScript', framework: null, testing: ['Playwright'], sourceFiles: 10 }];

      await createAnaJson(tmpDir, result, cwdDir);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['test']).toBe('pnpm run test');
      const surfaces = (await readAnaJson(tmpDir))['surfaces'] as Record<string, Record<string, unknown>>;
      const webCmds = surfaces['web']!['commands'] as Record<string, string | null>;
      // Playwright → no direct command, but test script exists → fallback
      expect(webCmds['test']).toBe("(cd 'apps/web' && pnpm run test)");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('does not generate test command when root has no test script', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    try {
      const result = createEmptyEngineResult();
      result.commands = { build: null, test: null, lint: null, dev: null, packageManager: 'pnpm', all: {} };
      result.stack.testing = ['Vitest'];
      result.monorepo = {
        isMonorepo: true, tool: 'pnpm',
        packages: [{ name: '@myapp/web', path: 'apps/web', language: null, framework: null, testing: [], hasBin: false, scripts: [], sourceFiles: 0 }],
        primaryPackage: { name: '@myapp/web', path: 'apps/web' },
      };

      await createAnaJson(tmpDir, result);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['test']).toBeNull();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  it('does not scope single-repo projects', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    try {
      const result = createEmptyEngineResult();
      result.commands = { build: null, test: 'pnpm run test', lint: null, dev: null, packageManager: 'pnpm', all: { test: 'vitest' } };
      result.stack.testing = ['Vitest'];

      await createAnaJson(tmpDir, result);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['test']).toBe('pnpm run test -- --run');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });
});
