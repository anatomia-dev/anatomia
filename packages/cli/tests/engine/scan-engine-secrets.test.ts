import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectSecrets } from '../../src/engine/scan-engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

describe('detectSecrets gitignore coverage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  function initGitRepo(): void {
    execSync('git init', { cwd: tmpDir, stdio: ['pipe', 'pipe', 'pipe'] });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: ['pipe', 'pipe', 'pipe'] });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: ['pipe', 'pipe', 'pipe'] });
  }

  // @ana A002
  it('detects .env in gitignore as covered', async () => {
    initGitRepo();
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.env\n');
    const result = await detectSecrets(tmpDir);
    expect(result.gitignoreCoversEnv).toBe(true);
  });

  // @ana A001
  it('detects .env.local-only gitignore as not covering .env', async () => {
    initGitRepo();
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.env.local\n.env.production\n');
    const result = await detectSecrets(tmpDir);
    expect(result.gitignoreCoversEnv).toBe(false);
  });

  // @ana A003
  it('falls back to false in non-git directory', async () => {
    // No git init — plain temp dir
    const result = await detectSecrets(tmpDir);
    expect(result.gitignoreCoversEnv).toBe(false);
  });

  // @ana A004
  it('respects gitignore negation patterns', async () => {
    initGitRepo();
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.env\n!.env\n');
    const result = await detectSecrets(tmpDir);
    expect(result.gitignoreCoversEnv).toBe(false);
  });
});
