import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readNodeDependencies } from '../../../src/engine/parsers/node.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('readNodeDependencies', () => {
  let tempDir: string;

  beforeAll(async () => {
    // Create a temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'node-parser-test-'));
  });

  afterAll(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('reads dependencies from package.json', async () => {
    const packageJson = {
      name: 'test-app',
      dependencies: {
        express: '^4.18.0',
        next: '15.0.0',
      },
      devDependencies: {
        typescript: '^5.7.0',
      },
    };

    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(packageJson)
    );

    const result = await readNodeDependencies(tempDir);

    expect(result).toHaveLength(3);
    expect(result).toContain('express');
    expect(result).toContain('next');
    expect(result).toContain('typescript');
  });

  it('returns empty array when package.json does not exist', async () => {
    const nonExistentDir = path.join(tempDir, 'non-existent');

    const result = await readNodeDependencies(nonExistentDir);

    expect(result).toEqual([]);
  });

  it('handles malformed package.json gracefully', async () => {
    const malformedDir = path.join(tempDir, 'malformed');
    await fs.mkdir(malformedDir, { recursive: true });
    await fs.writeFile(
      path.join(malformedDir, 'package.json'),
      '{ invalid json }'
    );

    const result = await readNodeDependencies(malformedDir);

    expect(result).toEqual([]);
  });

  it('returns empty array when package.json is a directory (EISDIR case)', async () => {
    // Edge case: a directory literally named `package.json` at project root.
    // Observed in some monorepo snapshots and tarball archives. The inner
    // `readFile` utility (src/engine/utils/file.ts) swallows the EISDIR and
    // returns '', then parsePackageJson returns [] for empty input — both
    // upstream of readNodeDependencies' own catch block. Outcome: no crash,
    // no warning, just an empty dep list.
    //
    // Phase 2 finding: because of that upstream swallowing, the outer catch
    // in readNodeDependencies is not reachable from any input we can
    // construct (the file utility and parsePackageJson both have their own
    // try/catch). The `_error` → `error` rename was therefore a
    // correctness-of-dead-code fix — worth doing for future-proofing but
    // not exercisable via an integration test without monkey-patching fs.
    // Noted for a future cleanup pass (delete the dead catch or remove the
    // inner swallow in utils/file.ts so errors surface).
    const eisdirDir = path.join(tempDir, 'eisdir-package');
    await fs.mkdir(eisdirDir, { recursive: true });
    await fs.mkdir(path.join(eisdirDir, 'package.json'), { recursive: true });

    const result = await readNodeDependencies(eisdirDir);
    expect(result).toEqual([]);
  });

  it('handles scoped packages correctly', async () => {
    const scopedDir = path.join(tempDir, 'scoped');
    await fs.mkdir(scopedDir, { recursive: true });

    const packageJson = {
      dependencies: {
        '@nestjs/core': '^10.0.0',
        '@types/node': '^20.0.0',
        express: '^4.18.0',
      },
    };

    await fs.writeFile(
      path.join(scopedDir, 'package.json'),
      JSON.stringify(packageJson)
    );

    const result = await readNodeDependencies(scopedDir);

    expect(result).toContain('@nestjs/core');
    expect(result).toContain('@types/node');
    expect(result).toContain('express');
  });

  it('combines all dependency sections', async () => {
    const allDepsDir = path.join(tempDir, 'all-deps');
    await fs.mkdir(allDepsDir, { recursive: true });

    const packageJson = {
      dependencies: {
        express: '^4.18.0',
      },
      devDependencies: {
        vitest: '^2.0.0',
        typescript: '^5.7.0',
      },
      peerDependencies: {
        react: '>=18.0.0',
      },
    };

    await fs.writeFile(
      path.join(allDepsDir, 'package.json'),
      JSON.stringify(packageJson)
    );

    const result = await readNodeDependencies(allDepsDir);

    expect(result).toHaveLength(4);
    expect(result).toContain('express');
    expect(result).toContain('vitest');
    expect(result).toContain('typescript');
    expect(result).toContain('react');
  });
});
