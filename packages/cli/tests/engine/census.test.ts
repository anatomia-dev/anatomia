import { describe, it, expect } from 'vitest';
import { buildCensus } from '../../src/engine/census.js';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

// Repo root is two levels above packages/cli
const REPO_ROOT = path.resolve(process.cwd(), '..', '..');

describe('buildCensus', () => {
  it('builds census for Anatomia itself (pnpm monorepo)', async () => {
    const census = await buildCensus(REPO_ROOT);

    expect(census.layout).toBe('monorepo');
    expect(census.monorepoTool).toBe('pnpm');
    expect(census.sourceRoots.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(census.allDeps).length).toBeGreaterThan(0);
    expect(census.allDeps).toHaveProperty('vitest');
    expect(census.configs.ciWorkflows.length).toBeGreaterThanOrEqual(1);
    expect(census.buildDurationMs).toBeGreaterThanOrEqual(0);

    // Invariant: exactly one primary
    const primaries = census.sourceRoots.filter(r => r.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]!.relativePath).toBe(census.primarySourceRoot);
  });

  it('builds census for empty directory (no package.json)', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const tmpDir = mkdtempSync(join(tmpdir(), 'census-test-'));
    try {
      const census = await buildCensus(tmpDir);
      expect(census.layout).toBe('single-repo');
      expect(census.monorepoTool).toBeNull();
      expect(census.sourceRoots).toHaveLength(1);
      expect(census.sourceRoots[0]!.isPrimary).toBe(true);
      expect(Object.keys(census.allDeps)).toHaveLength(0);
    } finally {
      rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A001, A002, A003, A004, A005
  it('handles workspace with 0 resolved packages (Fix A)', async () => {
    const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const tmpDir = mkdtempSync(join(tmpdir(), 'census-fixa-'));
    try {
      // Root package.json with real deps
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
        name: 'umami-like',
        dependencies: { next: '^14.0.0', react: '^18.0.0' },
        devDependencies: { vitest: '^1.0.0', typescript: '^5.0.0' },
      }));
      // pnpm-workspace.yaml pointing at a nonexistent directory
      writeFileSync(join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "nonexistent-dir/*"\n');
      // Create a src dir so countSourceFiles has something to find
      mkdirSync(join(tmpDir, 'src'));
      writeFileSync(join(tmpDir, 'src', 'index.ts'), '');

      const census = await buildCensus(tmpDir);
      expect(census.layout).toBe('single-repo');
      expect(census.monorepoTool).toBeNull();
      expect(census.sourceRoots).toHaveLength(1);
      expect(census.sourceRoots[0]!.isPrimary).toBe(true);
      expect(census.allDeps).toHaveProperty('next');
      expect(census.allDeps).toHaveProperty('vitest');
      const primaries = census.sourceRoots.filter(r => r.isPrimary);
      expect(primaries).toHaveLength(1);
    } finally {
      rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A006, A007, A008, A009, A010
  it('falls back to root package.json when @manypkg throws (Fix B)', async () => {
    const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const tmpDir = mkdtempSync(join(tmpdir(), 'census-fixb-'));
    try {
      // Root package.json with deps
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
        name: 'erxes-like',
        dependencies: { express: '^4.18.0', mongoose: '^7.0.0' },
        devDependencies: { typescript: '^5.0.0', jest: '^29.0.0' },
      }));
      // pnpm-workspace.yaml pointing at a subdir with a nameless package.json
      writeFileSync(join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
      mkdirSync(join(tmpDir, 'packages', 'broken'), { recursive: true });
      // package.json without "name" — causes @manypkg to throw
      writeFileSync(join(tmpDir, 'packages', 'broken', 'package.json'), JSON.stringify({
        version: '1.0.0',
        dependencies: { lodash: '^4.0.0' },
      }));

      const census = await buildCensus(tmpDir);
      expect(census.layout).toBe('single-repo');
      expect(census.allDeps).toHaveProperty('express');
      expect(census.allDeps).toHaveProperty('typescript');
      expect(census.sourceRoots).toHaveLength(1);
      expect(census.sourceRoots[0]!.packageName).toBe('erxes-like');
      expect(census.sourceRoots[0]!.isPrimary).toBe(true);
      const primaries = census.sourceRoots.filter(r => r.isPrimary);
      expect(primaries).toHaveLength(1);
    } finally {
      rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  // @ana A011, A012
  it('empty-deps fallback when @manypkg throws and no root package.json exists (Fix B edge)', async () => {
    const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const tmpDir = mkdtempSync(join(tmpdir(), 'census-fixb-edge-'));
    try {
      // pnpm-workspace.yaml but NO root package.json — @manypkg will throw
      writeFileSync(join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');

      const census = await buildCensus(tmpDir);
      expect(census.layout).toBe('single-repo');
      expect(Object.keys(census.allDeps)).toHaveLength(0);
      expect(census.sourceRoots).toHaveLength(1);
      expect(census.sourceRoots[0]!.isPrimary).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });

  const calComPath = '/tmp/ana-research/cal.com';
  const calComExists = existsSync(path.join(calComPath, 'package.json'));

  it.skipIf(!calComExists)('validates against cal.com (target-customer monorepo)', async () => {
    const census = await buildCensus(calComPath);

    expect(census.layout).toBe('monorepo');
    // cal.com uses yarn workspaces
    expect(census.monorepoTool).toBe('yarn');
    // Should have many source roots (115 packages)
    expect(census.sourceRoots.length).toBeGreaterThan(50);
    // allDeps should be rich
    expect(Object.keys(census.allDeps).length).toBeGreaterThan(100);
    // Should have next in deps
    expect(census.allDeps).toHaveProperty('next');
    // Framework hints should include nextjs
    const nextjsHints = census.configs.frameworkHints.filter(h => h.framework === 'nextjs');
    expect(nextjsHints.length).toBeGreaterThan(0);
    // Primary should be under apps/
    expect(census.primarySourceRoot).toMatch(/^apps\//);
  });

  const dubPath = '/tmp/ana-research/dub';
  const dubExists = existsSync(path.join(dubPath, 'package.json'));

  it.skipIf(!dubExists)('validates against dub (target-customer monorepo)', async () => {
    const census = await buildCensus(dubPath);
    expect(census.layout).toBe('monorepo');
    expect(census.sourceRoots.length).toBeGreaterThan(1);
    expect(Object.keys(census.allDeps).length).toBeGreaterThan(10);
  });
});
