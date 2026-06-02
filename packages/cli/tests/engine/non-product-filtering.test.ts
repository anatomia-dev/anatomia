/**
 * Tests for non-product path filtering across scan engine subsystems.
 *
 * Verifies that EXCLUDED_SEGMENTS-derived filtering is consistently applied
 * in findings rules, hot file detection, schema detection, and deploy discovery.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  EXCLUDED_SEGMENTS,
  NON_PRODUCT_GLOB_IGNORE,
  isNonProductPath,
} from '../../src/engine/detectors/surfaces.js';
import { discoverDeployments } from '../../src/engine/census.js';

// ── A001, A002, A003: Shared definition tests ────────────────────────

describe('NON_PRODUCT_GLOB_IGNORE', () => {
  // @ana A001
  it('exists and derives from EXCLUDED_SEGMENTS', () => {
    expect(NON_PRODUCT_GLOB_IGNORE).toBeDefined();
    expect(Array.isArray(NON_PRODUCT_GLOB_IGNORE)).toBe(true);
    // Every EXCLUDED_SEGMENTS entry should have a corresponding glob
    for (const segment of EXCLUDED_SEGMENTS) {
      expect(NON_PRODUCT_GLOB_IGNORE).toContain(`**/${segment}/**`);
    }
  });

  // @ana A002
  it('contains more than 20 entries (all EXCLUDED_SEGMENTS + build artifacts)', () => {
    expect(NON_PRODUCT_GLOB_IGNORE.length).toBeGreaterThan(20);
  });

  // @ana A003
  it('contains build-artifact globs', () => {
    expect(NON_PRODUCT_GLOB_IGNORE).toContain('**/node_modules/**');
    expect(NON_PRODUCT_GLOB_IGNORE).toContain('**/dist/**');
    expect(NON_PRODUCT_GLOB_IGNORE).toContain('**/build/**');
    expect(NON_PRODUCT_GLOB_IGNORE).toContain('**/.next/**');
    expect(NON_PRODUCT_GLOB_IGNORE).toContain('**/.git/**');
    expect(NON_PRODUCT_GLOB_IGNORE).toContain('**/.turbo/**');
    expect(NON_PRODUCT_GLOB_IGNORE).toContain('**/out/**');
    expect(NON_PRODUCT_GLOB_IGNORE).toContain('**/.cache/**');
  });
});

// ── A004, A005, A006: Findings rule glob coverage ────────────────────

describe('findings rule non-product exclusion', () => {
  // @ana A004
  it('NON_PRODUCT_GLOB_IGNORE excludes template route files', () => {
    expect(NON_PRODUCT_GLOB_IGNORE).toContain('**/templates/**');
    // isNonProductPath confirms the path-level check
    expect(isNonProductPath('templates/next-app/app/api/route.ts')).toBe(true);
  });

  // @ana A005
  it('NON_PRODUCT_GLOB_IGNORE excludes example page files', () => {
    expect(NON_PRODUCT_GLOB_IGNORE).toContain('**/examples/**');
    expect(isNonProductPath('examples/with-tailwind/app/page.tsx')).toBe(true);
  });

  // @ana A006
  it('NON_PRODUCT_GLOB_IGNORE excludes playground files', () => {
    expect(NON_PRODUCT_GLOB_IGNORE).toContain('**/playground/**');
    expect(isNonProductPath('playground/demo/src/secrets.ts')).toBe(true);
  });
});

// ── A007, A008: Hot file filtering ───────────────────────────────────

describe('hot file non-product path filtering', () => {
  // @ana A007
  it('isNonProductPath filters template config files from git output paths', () => {
    // Simulates paths that would appear in git log --name-only output
    const templatePaths = [
      'templates/default/tailwind.config.ts',
      'templates/starter/next.config.js',
      'examples/with-auth/src/config.ts',
    ];
    for (const p of templatePaths) {
      expect(isNonProductPath(p)).toBe(true);
    }
  });

  // @ana A008
  it('isNonProductPath preserves legitimate source file paths', () => {
    const productPaths = [
      'packages/cli/src/engine/scan-engine.ts',
      'src/commands/run.ts',
      'apps/web/src/app/page.tsx',
    ];
    for (const p of productPaths) {
      expect(isNonProductPath(p)).toBe(false);
    }
  });
});

// ── A009, A010, A011: Supabase schema filtering ─────────────────────

describe('Supabase schema non-product path filtering', () => {
  // @ana A009
  it('isNonProductPath filters example migration files', () => {
    expect(isNonProductPath('examples/with-supabase/supabase/migrations/001_init.sql')).toBe(true);
    expect(isNonProductPath('example/supabase/migrations/002_users.sql')).toBe(true);
  });

  // @ana A010
  it('isNonProductPath filters template schema directories', () => {
    expect(isNonProductPath('templates/supabase-starter/supabase/migrations/001.sql')).toBe(true);
  });

  // @ana A011
  it('when all migration paths are non-product, filtering leaves empty array', () => {
    const migrationFiles = [
      'examples/demo/supabase/migrations/001_init.sql',
      'templates/starter/supabase/migrations/002_users.sql',
    ];
    const filtered = migrationFiles.filter(m => !isNonProductPath(m));
    expect(filtered).toHaveLength(0);
    // Empty files array → Supabase reports found: false
  });
});

// ── A012, A013, A014: Deploy discovery filtering ─────────────────────

describe('discoverDeployments non-product path filtering', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-filter-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // @ana A012
  it('skips Dockerfiles in template directories', () => {
    const templateDir = path.join(tmpDir, 'templates', 'docker-app');
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(path.join(templateDir, 'Dockerfile'), 'FROM node:22');
    const roots = [{ absolutePath: templateDir, relativePath: 'templates/docker-app' }];
    const entries = discoverDeployments(tmpDir, roots);
    expect(entries).toHaveLength(0);
  });

  // @ana A013
  it('detects deploy configs in product directories', () => {
    const appDir = path.join(tmpDir, 'apps', 'api');
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'Dockerfile'), 'FROM node:22');
    const roots = [{ absolutePath: appDir, relativePath: 'apps/api' }];
    const entries = discoverDeployments(tmpDir, roots);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.platform).toBe('Docker');
  });

  // @ana A014
  it('skips wrangler configs in example directories', () => {
    const exampleDir = path.join(tmpDir, 'examples', 'worker-app');
    fs.mkdirSync(exampleDir, { recursive: true });
    fs.writeFileSync(path.join(exampleDir, 'wrangler.toml'), 'name = "demo"');
    const roots = [{ absolutePath: exampleDir, relativePath: 'examples/worker-app' }];
    const entries = discoverDeployments(tmpDir, roots);
    expect(entries).toHaveLength(0);
  });

  it('skips deploy configs in fixture directories', () => {
    const fixtureDir = path.join(tmpDir, 'fixtures', 'deploy-test');
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(path.join(fixtureDir, 'Dockerfile'), 'FROM node:22');
    const roots = [{ absolutePath: fixtureDir, relativePath: 'fixtures/deploy-test' }];
    const entries = discoverDeployments(tmpDir, roots);
    expect(entries).toHaveLength(0);
  });

  it('skips deploy configs in sandbox directories', () => {
    const sandboxDir = path.join(tmpDir, 'sandbox', 'infra');
    fs.mkdirSync(sandboxDir, { recursive: true });
    fs.writeFileSync(path.join(sandboxDir, 'Dockerfile'), 'FROM node:22');
    const roots = [{ absolutePath: sandboxDir, relativePath: 'sandbox/infra' }];
    const entries = discoverDeployments(tmpDir, roots);
    expect(entries).toHaveLength(0);
  });

  it('root path (.) is not excluded', () => {
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:22');
    const roots = [{ absolutePath: tmpDir, relativePath: '.' }];
    const entries = discoverDeployments(tmpDir, roots);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.platform).toBe('Docker');
  });
});

// ── Edge cases ───────────────────────────────────────────────────────

describe('non-product path edge cases', () => {
  it('EXCLUDED_SEGMENTS covers all expected directories', () => {
    const expected = [
      'examples', 'example', 'example-apps',
      'templates', 'template',
      'e2e', 'test', 'tests', 'testing',
      'fixtures', 'fixture',
      'playground', 'playgrounds',
      'sandbox', 'demos', 'demo',
      'starters', 'starter',
      'samples', 'sample',
      'boilerplate', 'references', 'reference',
    ];
    for (const seg of expected) {
      expect(EXCLUDED_SEGMENTS.has(seg)).toBe(true);
    }
  });

  it('isNonProductPath is case-insensitive on segments', () => {
    expect(isNonProductPath('Templates/next-app')).toBe(true);
    expect(isNonProductPath('EXAMPLES/demo')).toBe(true);
  });

  it('suffix -e2e paths are excluded', () => {
    expect(isNonProductPath('packages/gauzy-e2e')).toBe(true);
  });

  it('deeply nested non-product paths are excluded', () => {
    expect(isNonProductPath('packages/core/examples/with-auth/src/index.ts')).toBe(true);
  });
});
