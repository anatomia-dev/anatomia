/**
 * Tests for scope Surface field validation in artifact.ts.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { validateScopeFormat } from '../../src/commands/artifact.js';

/**
 * Minimal valid scope content. All required sections and fields present.
 */
function makeScope(surfaceLine?: string): string {
  return `# Scope: Test Feature

## Intent

This is a test scope intent with sufficient content.

## Complexity Assessment
- **Kind:** feature
- **Size:** small
${surfaceLine ? `- ${surfaceLine}\n` : ''}- **Multi-phase:** no

### Structural Analog
See existing-feature for the pattern.

## Approach

This is the approach section with actual content.

## Edge Cases

- Edge case 1
- Edge case 2

## Acceptance Criteria
- AC1: First criterion
- AC2: Second criterion
- AC3: Third criterion
`;
}

describe('validateScopeFormat Surface field', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  async function writeScopeFile(content: string): Promise<string> {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scope-test-'));
    const filePath = path.join(tmpDir, 'scope.md');
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  // @ana A018
  it('validateScopeFormat accepts valid Surface field', async () => {
    // No ana.json → validation skips surface check → still valid
    const filePath = await writeScopeFile(makeScope('**Surface:** cross-surface'));
    const result = validateScopeFormat(filePath);
    expect(result).toBeNull();
  });

  it('accepts scope without Surface field (single-package repos)', async () => {
    const filePath = await writeScopeFile(makeScope());
    const result = validateScopeFormat(filePath);
    expect(result).toBeNull();
  });

  // @ana A019
  it('validateScopeFormat rejects invalid Surface field', async () => {
    // Create an ana.json with surfaces to enable validation
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scope-test-'));

    // Create .ana/ana.json and .git in parent so findProjectRoot works
    const projectDir = path.join(tmpDir, 'project');
    await fs.mkdir(path.join(projectDir, '.git'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.ana'), { recursive: true });
    await fs.writeFile(
      path.join(projectDir, '.ana', 'ana.json'),
      JSON.stringify({
        surfaces: {
          cli: { path: 'packages/cli' },
          web: { path: 'apps/web' },
        },
      }, null, 2),
      'utf-8',
    );

    // Write scope file inside the project
    const filePath = path.join(projectDir, 'scope.md');
    await fs.writeFile(filePath, makeScope('**Surface:** nonexistent-surface'), 'utf-8');

    // Change cwd to project dir so findProjectRoot works
    const originalCwd = process.cwd();
    process.chdir(projectDir);
    try {
      const result = validateScopeFormat(filePath);
      expect(result).not.toBeNull();
      expect(result).toContain('Surface');
    } finally {
      process.chdir(originalCwd);
    }
  });
});
