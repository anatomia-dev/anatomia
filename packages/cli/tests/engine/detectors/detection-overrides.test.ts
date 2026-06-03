/**
 * Tests for detection override scenarios: TypeScript language override,
 * Prisma provider parsing, package manager inheritance.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Import the detectors directly
import { detectPackageManager } from '../../../src/engine/detectors/packageManager.js';

describe('TypeScript language detection', () => {
  let tempRoot: string;
  let tempDir: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-ts-test-'));
    tempDir = path.join(tempRoot, 'isolated', 'a', 'b', 'c', 'd', 'project');
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A004
  it('detects TypeScript when tsconfig.json exists alongside package.json', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'ts-app', dependencies: { next: '14.0.0' } })
    );
    await fs.writeFile(
      path.join(tempDir, 'tsconfig.json'),
      '{ "compilerOptions": { "strict": true } }'
    );

    // Use scanProject to test full flow
    const { scanProject } = await import('../../../src/engine/scan-engine.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    expect(result.stack.language).toBe('TypeScript');
  });

  // @ana A006
  it('shows Node.js when no tsconfig.json and no typescript dep', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'js-app', scripts: { start: 'node index.js' } })
    );
    await fs.writeFile(path.join(tempDir, 'index.js'), 'console.log("hi")');

    const { scanProject } = await import('../../../src/engine/scan-engine.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    expect(result.stack.language).toBe('Node.js');
  });

  // @ana A005
  it('detects TypeScript when typescript is in devDependencies', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'ts-app', devDependencies: { typescript: '5.0.0' } })
    );

    const { scanProject } = await import('../../../src/engine/scan-engine.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    expect(result.stack.language).toBe('TypeScript');
  });

  // @ana A001
  it('detects TypeScript when typescript is only in root devDependencies (monorepo)', async () => {
    // Monorepo root: typescript in devDeps, pnpm workspace config
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'monorepo-root', devDependencies: { typescript: '5.0.0' } })
    );
    await fs.writeFile(
      path.join(tempDir, 'pnpm-workspace.yaml'),
      'packages:\n  - "packages/*"'
    );
    // Workspace package without typescript dep
    const pkgDir = path.join(tempDir, 'packages', 'app');
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@mono/app', dependencies: { express: '4.0.0' } })
    );

    const { scanProject } = await import('../../../src/engine/scan-engine.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    expect(result.stack.language).toBe('TypeScript');
  });

  // @ana A002
  it('detects TypeScript when tsconfig.json exists in a subdirectory only', async () => {
    // No root tsconfig, no typescript dep — but server/tsconfig.json exists
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'subdir-ts-app', dependencies: { express: '4.0.0' } })
    );
    await fs.mkdir(path.join(tempDir, 'server'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'server', 'tsconfig.json'),
      '{ "compilerOptions": { "strict": true } }'
    );

    const { scanProject } = await import('../../../src/engine/scan-engine.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    expect(result.stack.language).toBe('TypeScript');
  });

  // @ana A003
  it('does not override language for non-Node projects with subdirectory tsconfig', async () => {
    // No package.json → language detects as null, not Node.js
    // web/tsconfig.json exists but should NOT trigger TypeScript upgrade
    await fs.mkdir(path.join(tempDir, 'web'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'web', 'tsconfig.json'),
      '{ "compilerOptions": { "strict": true } }'
    );

    const { scanProject } = await import('../../../src/engine/scan-engine.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    expect(result.stack.language).not.toBe('TypeScript');
  });

  // @ana A007
  it('detects TypeScript via rootDevDeps without subdirectory tsconfigs', async () => {
    // Monorepo with typescript in root devDeps, no tsconfig anywhere
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'mono-no-tsconfig', devDependencies: { typescript: '5.0.0' } })
    );
    await fs.writeFile(
      path.join(tempDir, 'pnpm-workspace.yaml'),
      'packages:\n  - "packages/*"'
    );
    const pkgDir = path.join(tempDir, 'packages', 'lib');
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@mono/lib', dependencies: { lodash: '4.0.0' } })
    );

    const { scanProject } = await import('../../../src/engine/scan-engine.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    expect(result.stack.language).toBe('TypeScript');
  });

  // @ana A008
  it('detects TypeScript when tsconfig.json exists in multiple subdirectories', async () => {
    // No root tsconfig, no typescript dep — but server/ and web/ both have tsconfig
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'multi-subdir-app', dependencies: { express: '4.0.0' } })
    );
    await fs.mkdir(path.join(tempDir, 'server'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'server', 'tsconfig.json'),
      '{ "compilerOptions": { "strict": true } }'
    );
    await fs.mkdir(path.join(tempDir, 'web'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'web', 'tsconfig.json'),
      '{ "compilerOptions": { "strict": true } }'
    );

    const { scanProject } = await import('../../../src/engine/scan-engine.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    expect(result.stack.language).toBe('TypeScript');
  });
});

describe('Prisma provider parsing', () => {
  let tempRoot: string;
  let tempDir: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-prisma-test-'));
    tempDir = path.join(tempRoot, 'isolated', 'a', 'b', 'c', 'd', 'project');
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('parses postgresql provider from prisma schema', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'db-app', dependencies: { '@prisma/client': '5.0.0' } })
    );
    await fs.mkdir(path.join(tempDir, 'prisma'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'prisma', 'schema.prisma'),
      `datasource db { provider = "postgresql" url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }
model User { id Int @id name String }`
    );

    const { scanProject } = await import('../../../src/engine/scan-engine.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    const prismaSchema = result.schemas['prisma'];
    expect(prismaSchema).toBeDefined();
    expect(prismaSchema!.found).toBe(true);
    expect(prismaSchema!.provider).toBe('postgresql');
    expect(prismaSchema!.modelCount).toBe(1);
  });

  it('returns null provider when schema has no datasource', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'db-app', dependencies: { '@prisma/client': '5.0.0' } })
    );
    await fs.mkdir(path.join(tempDir, 'prisma'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'prisma', 'schema.prisma'),
      `generator client { provider = "prisma-client-js" }
model User { id Int @id name String }`
    );

    const { scanProject } = await import('../../../src/engine/scan-engine.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    const prismaSchema = result.schemas['prisma'];
    expect(prismaSchema!.found).toBe(true);
    expect(prismaSchema!.provider).toBeNull();
  });
});

describe('Package manager inheritance', () => {
  let tempRoot: string;
  let tempDir: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-pm-test-'));
    tempDir = path.join(tempRoot, 'isolated', 'a', 'b', 'c', 'd', 'project');
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('finds pnpm lockfile in parent directory', async () => {
    // Root has pnpm-lock.yaml
    await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9');
    // Sub-package has package.json but no lockfile
    const subDir = path.join(tempDir, 'packages', 'app');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(subDir, 'package.json'), '{ "name": "app" }');

    const pm = await detectPackageManager(subDir);
    expect(pm).toBe('pnpm');
  });

  it('returns null when no lockfile found', async () => {
    // No lockfile anywhere in temp dir. Previously this fell back to 'npm',
    // which was a semantic lie for non-Node projects (Python/Go/Rust).
    // Now null — downstream display code already guards with truthy check.
    const pm = await detectPackageManager(tempDir);
    expect(pm).toBeNull();
  });

  it('finds lockfile in current directory first', async () => {
    await fs.writeFile(path.join(tempDir, 'yarn.lock'), '');
    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('yarn');
  });

  it('respects priority order (pnpm > yarn)', async () => {
    await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), '');
    await fs.writeFile(path.join(tempDir, 'yarn.lock'), '');
    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('pnpm');
  });

  // package.json's `packageManager` field is
  // the corepack-standard way to declare manager intent. A project with
  // that field set but no lockfile yet (fresh install) should respect
  // the declaration rather than defaulting to 'npm'. The alternative
  // would silently lie to bun/yarn/pnpm users whose projects happen to
  // be in a pre-install state.

  it('respects package.json packageManager field for fresh bun project', async () => {
    // Fresh bun project — no bun.lockb yet, but packageManager field declares intent
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', packageManager: 'bun@1.1.0' })
    );
    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('bun');
  });

  it('respects package.json packageManager field for fresh pnpm project', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', packageManager: 'pnpm@8.6.12' })
    );
    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('pnpm');
  });

  it('respects package.json packageManager field for fresh yarn project', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', packageManager: 'yarn@4.0.0' })
    );
    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('yarn');
  });

  it('lockfile wins over package.json packageManager field (lockfile is authoritative)', async () => {
    // If both signals exist, the lockfile proves what actually ran install;
    // the packageManager field is just declared intent.
    await fs.writeFile(path.join(tempDir, 'bun.lockb'), '');
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', packageManager: 'pnpm@8.6.12' })
    );
    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('bun');
  });

  it('defaults to npm when package.json exists without packageManager field', async () => {
    // Plain `npm init` project — Node project, no declared intent, no lockfile yet.
    // Default to 'npm' because that's the bare-install convention.
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test' })
    );
    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('npm');
  });

  it('ignores unrecognized packageManager field values', async () => {
    // Defensive: if package.json declares something we don't recognize
    // (e.g., a typo or an experimental tool), fall through to the 'npm'
    // default rather than trusting arbitrary strings.
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', packageManager: 'bogus@1.0.0' })
    );
    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('npm');
  });

  it('ignores malformed packageManager field (non-string)', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', packageManager: { wrong: 'shape' } })
    );
    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('npm');
  });
});
