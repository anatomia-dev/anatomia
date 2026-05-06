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
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-ts-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

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

  it('detects TypeScript when typescript is in devDependencies', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'ts-app', devDependencies: { typescript: '5.0.0' } })
    );

    const { scanProject } = await import('../../../src/engine/scan-engine.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    expect(result.stack.language).toBe('TypeScript');
  });
});

describe('Prisma provider parsing', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-prisma-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
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
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-pm-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
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
