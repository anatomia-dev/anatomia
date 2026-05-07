import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const execFileAsync = promisify(execFile);

describe('performance benchmarks', () => {
  let tmpProject: string;
  let cliPath: string;

  beforeEach(async () => {
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-perf-'));
    cliPath = path.join(__dirname, '..', '..', 'dist', 'index.js');

    // Create minimal project
    await fs.writeFile(
      path.join(tmpProject, 'package.json'),
      JSON.stringify({ name: 'perf-test' })
    );
  });

  afterEach(async () => {
    await fs.rm(tmpProject, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('ana init completes in <20s', async () => {
    const start = Date.now();

    await execFileAsync('node', [cliPath, 'init'], {
      cwd: tmpProject,
    });

    const duration = Date.now() - start;
    const seconds = duration / 1000;

    expect(seconds).toBeLessThan(20);
  }, 25000); // 25s timeout
});
