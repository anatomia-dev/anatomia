/**
 * Slice 3 — active-scope discovery for reading-order personalization.
 *
 * Covers parseFilesAffected() against the real scope.md "Files affected"
 * formats observed in the repo, and findActiveScope() over temp .ana/plans
 * fixtures: exactly one active scope with parseable files → returns it; zero,
 * many, or unparseable → null (no guessing).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseFilesAffected,
  findActiveScope,
} from '../../../src/engine/analyzers/reading-order/scope.js';

describe('parseFilesAffected', () => {
  it('extracts backtick-wrapped paths', () => {
    const files = parseFilesAffected(
      '- **Files affected:** `packages/cli/src/commands/proof.ts`, `packages/cli/src/commands/work.ts`',
    );
    expect(files).toEqual([
      'packages/cli/src/commands/proof.ts',
      'packages/cli/src/commands/work.ts',
    ]);
  });

  it('extracts backtick paths and ignores prose / counts', () => {
    const files = parseFilesAffected(
      '- **Files affected:** 2 production (`proof.ts`, `work.ts`), 2 test (`proof.test.ts`)',
    );
    expect(files).toEqual(['proof.ts', 'work.ts', 'proof.test.ts']);
  });

  it('falls back to bare path-like tokens when no backticks', () => {
    const files = parseFilesAffected('- **Files affected:** src/a.ts, src/b/c.tsx and some prose');
    expect(files).toEqual(['src/a.ts', 'src/b/c.tsx']);
  });

  it('returns [] when there is no Files affected line', () => {
    expect(parseFilesAffected('## Intent\nSome text\n')).toEqual([]);
  });

  it('returns [] for an empty Files affected value', () => {
    expect(parseFilesAffected('- **Files affected:**   \n')).toEqual([]);
  });
});

describe('findActiveScope', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'reading-scope-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  async function writeScope(slug: string, body: string): Promise<void> {
    const dir = path.join(tmp, '.ana', 'plans', 'active', slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'scope.md'), body, 'utf-8');
  }

  it('returns the single active scope and its files', async () => {
    await writeScope('feat-x', '# Scope\n- **Files affected:** `src/a.ts`, `src/b.ts`\n');
    const scope = await findActiveScope(tmp);
    expect(scope).toEqual({ slug: 'feat-x', files: ['src/a.ts', 'src/b.ts'] });
  });

  it('rebases repo-root paths onto the scanned root segment', async () => {
    await writeScope('feat-y', '# Scope\n- **Files affected:** `packages/cli/src/a.ts`\n');
    const scope = await findActiveScope(tmp, 'packages/cli');
    expect(scope).toEqual({ slug: 'feat-y', files: ['src/a.ts'] });
  });

  it('returns null when there is no active plans dir', async () => {
    expect(await findActiveScope(tmp)).toBeNull();
  });

  it('returns null when more than one scope is active (ambiguous)', async () => {
    await writeScope('feat-a', '# Scope\n- **Files affected:** `src/a.ts`\n');
    await writeScope('feat-b', '# Scope\n- **Files affected:** `src/b.ts`\n');
    expect(await findActiveScope(tmp)).toBeNull();
  });

  it('returns null when the lone scope has no parseable files', async () => {
    await writeScope('feat-c', '# Scope\n- **Files affected:** TBD\n');
    expect(await findActiveScope(tmp)).toBeNull();
  });
});
