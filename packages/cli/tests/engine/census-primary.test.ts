/**
 * Unit tests for selectPrimary — the 4-policy primary source root selection chain.
 *
 * Tests selectPrimary directly with constructed SourceRoot[] arrays.
 * No filesystem fixtures needed since selectPrimary is a pure function.
 */

import { describe, it, expect } from 'vitest';
import { selectPrimary } from '../../src/engine/census.js';
import type { SourceRoot, FrameworkHintEntry } from '../../src/engine/types/census.js';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a minimal SourceRoot for testing. */
function root(relativePath: string, fileCount: number, packageName: string | null = null): SourceRoot {
  return {
    absolutePath: `/fake/${relativePath}`,
    relativePath,
    packageName,
    fileCount,
    isPrimary: false,
    deps: {},
    devDeps: {},
    hasBin: false,
    hasMain: false,
    hasExports: false,
    scripts: [],
  };
}

/** Build a minimal FrameworkHintEntry. */
function hint(sourceRootPath: string, framework = 'nextjs'): FrameworkHintEntry {
  return {
    framework,
    sourceRootPath,
    path: `${sourceRootPath}/next.config.ts`,
  };
}

// ── Policy 2: Tier matching ──────────────────────────────────────────────

describe('selectPrimary — Policy 2 tier matching', () => {
  // @ana A001
  it('exact name match selects primary', () => {
    const roots = [
      root('packages/other', 500, 'other'),
      root('packages/payload', 300, 'payload'),
    ];
    const result = selectPrimary(roots, [], 'payload');
    expect(result).toBe('packages/payload');
  });

  // @ana A002
  it('scoped exact match selects primary', () => {
    const roots = [
      root('packages/other', 500, '@medusajs/other'),
      root('packages/medusa', 300, '@medusajs/medusa'),
    ];
    const result = selectPrimary(roots, [], 'medusa');
    expect(result).toBe('packages/medusa');
  });

  // @ana A003
  it('scoped identity word core selects primary', () => {
    const roots = [
      root('packages/phrases', 1717, '@logto/phrases'),
      root('packages/core', 800, '@logto/core'),
    ];
    const result = selectPrimary(roots, [], 'logto');
    expect(result).toBe('packages/core');
  });

  // @ana A004
  it('scoped identity word server selects primary', () => {
    const roots = [
      root('packages/client', 500, '@trpc/client'),
      root('packages/server', 300, '@trpc/server'),
    ];
    const result = selectPrimary(roots, [], 'trpc');
    expect(result).toBe('packages/server');
  });

  // @ana A005
  it('scoped self-named match selects primary', () => {
    const roots = [
      root('packages/other', 500, '@strapi/other'),
      root('packages/core/strapi', 300, '@strapi/strapi'),
    ];
    const result = selectPrimary(roots, [], 'strapi');
    expect(result).toBe('packages/core/strapi');
  });

  // @ana A006
  it('tier priority is respected', () => {
    // Tier 1 (exact) should win over tier 3 (identity word)
    const roots = [
      root('packages/core', 500, '@myapp/core'),    // tier 3
      root('packages/exact', 300, 'myapp'),          // tier 1
    ];
    const result = selectPrimary(roots, [], 'myapp');
    expect(result).toBe('packages/exact');
  });

  // @ana A007
  it('file count tiebreaker within tier', () => {
    // Two scoped+exact matches in the same tier — larger file count wins
    const roots = [
      root('packages/small', 100, '@myapp/myapp'),
      root('packages/larger', 300, '@scope/myapp'),
    ];
    const result = selectPrimary(roots, [], 'myapp');
    expect(result).toContain('larger');
  });
});

// ── Policy 2: File-count guard ──────────────────────────────────────────

describe('selectPrimary — file-count guard', () => {
  // @ana A008
  it('absolute file count guard blocks tiny packages', () => {
    // Name matches but only 5 files (< 10 minimum)
    const roots = [
      root('packages/other', 500, 'other'),
      root('packages/core', 5, '@myapp/core'),
    ];
    const result = selectPrimary(roots, [], 'myapp');
    expect(result).not.toBe('packages/core');
    // Falls through to Policy 3 — most files
    expect(result).toBe('packages/other');
  });

  // @ana A009
  it('relative file count guard blocks small packages', () => {
    // Name matches, has 12 files (>= 10), but < 5% of largest (1000 * 0.05 = 50)
    const roots = [
      root('packages/large', 1000, 'large'),
      root('packages/core', 12, '@myapp/core'),
    ];
    const result = selectPrimary(roots, [], 'myapp');
    expect(result).not.toBe('packages/core');
    expect(result).toBe('packages/large');
  });

  it('guard passes when both thresholds met', () => {
    const roots = [
      root('packages/large', 200, 'large'),
      root('packages/core', 50, '@myapp/core'),  // 50 >= 10, 50/200 = 25% >= 5%
    ];
    const result = selectPrimary(roots, [], 'myapp');
    expect(result).toBe('packages/core');
  });
});

// ── Policy 0: Non-product filtering ─────────────────────────────────────

describe('selectPrimary — Policy 0 non-product filtering', () => {
  // @ana A010
  it('non-product paths are excluded from candidates', () => {
    const roots = [
      root('examples/next-app', 1000, '@myapp/example'),
      root('packages/core', 100, '@myapp/core'),
    ];
    const result = selectPrimary(roots, [], 'myapp');
    expect(result).not.toContain('examples/');
    expect(result).toBe('packages/core');
  });

  // @ana A011
  it('Policy 0 falls back to unfiltered when all excluded', () => {
    const roots = [
      root('examples/app-a', 500, 'app-a'),
      root('test/app-b', 300, 'app-b'),
    ];
    const result = selectPrimary(roots, [], 'myapp');
    // Falls back to unfiltered list — returns something (most files)
    expect(result).toBeTruthy();
    expect(result).toBe('examples/app-a');
  });

  // @ana A013
  it('Policy 3 uses filtered candidates', () => {
    // examples/big has most files but is non-product — Policy 3 should skip it
    const roots = [
      root('examples/big', 2000, 'big-example'),
      root('packages/actual', 500, 'actual'),
    ];
    const result = selectPrimary(roots, [], 'unrelated');
    expect(result).not.toContain('examples/');
    expect(result).toBe('packages/actual');
  });
});

// ── Policy 1: apps/ with framework evidence ─────────────────────────────

describe('selectPrimary — Policy 1 unchanged', () => {
  // @ana A012
  it('Policy 1 still takes priority over name match', () => {
    const roots = [
      root('apps/web', 500, '@myapp/web'),
      root('packages/myapp', 300, 'myapp'),  // would match Policy 2
    ];
    const hints = [hint('apps/web')];
    const result = selectPrimary(roots, hints, 'myapp');
    expect(result).toContain('apps/');
    expect(result).toBe('apps/web');
  });
});

// ── Root exclusion ──────────────────────────────────────────────────────

describe('selectPrimary — root exclusion', () => {
  // @ana A014
  it('root package excluded from Policy 2', () => {
    // Root has matching name but fewer files — if Policy 2 matched root, it would
    // return '.'. Instead, root is excluded from Policy 2, falls to Policy 3 (most files).
    const roots = [
      root('.', 50, 'myapp'),
      root('packages/other', 500, 'other'),
    ];
    const result = selectPrimary(roots, [], 'myapp');
    // Root excluded from Policy 2 name-match — Policy 3 picks packages/other (most files)
    expect(result).not.toBe('.');
    expect(result).toBe('packages/other');
  });

  // @ana A015
  it('root package eligible for Policy 3', () => {
    // Root has most files and no name match exists — Policy 3 picks root
    const roots = [
      root('.', 1000, 'monorepo-root'),
      root('packages/small', 50, 'small'),
    ];
    const result = selectPrimary(roots, [], 'unrelated-dir');
    expect(result).toBe('.');
  });
});

// ── Regression fixtures: 8 affected repos ───────────────────────────────

describe('selectPrimary — regression: affected repos', () => {
  // @ana A016
  it('logto selects packages/core', () => {
    const roots = [
      root('.', 10, '@logto/monorepo'),
      root('packages/phrases', 1717, '@logto/phrases'),
      root('packages/core', 800, '@logto/core'),
      root('packages/console', 600, '@logto/console'),
      root('packages/schemas', 400, '@logto/schemas'),
    ];
    const result = selectPrimary(roots, [], 'logto');
    expect(result).toBe('packages/core');
  });

  // @ana A017
  it('medusa selects packages/medusa', () => {
    const roots = [
      root('.', 5, '@medusajs/root'),
      root('packages/core', 1200, '@medusajs/core'),
      root('packages/medusa', 900, '@medusajs/medusa'),
      root('packages/utils', 200, '@medusajs/utils'),
    ];
    const result = selectPrimary(roots, [], 'medusa');
    expect(result).toBe('packages/medusa');
  });

  // @ana A018
  it('trpc selects packages/server', () => {
    const roots = [
      root('.', 5, '@trpc/root'),
      root('packages/client', 500, '@trpc/client'),
      root('packages/server', 400, '@trpc/server'),
      root('packages/react-query', 300, '@trpc/react-query'),
    ];
    const result = selectPrimary(roots, [], 'trpc');
    expect(result).toBe('packages/server');
  });

  // @ana A019
  it('payload selects packages/payload', () => {
    const roots = [
      root('.', 5, 'payload-monorepo'),
      root('test', 1754, '@payloadcms/test-utils'),
      root('packages/payload', 679, 'payload'),
      root('packages/ui', 400, '@payloadcms/ui'),
    ];
    const result = selectPrimary(roots, [], 'payload');
    expect(result).toBe('packages/payload');
  });

  // @ana A020
  it('strapi selects packages/core/strapi', () => {
    const roots = [
      root('.', 5, 'strapi-root'),
      root('packages/core/admin', 800, '@strapi/admin'),
      root('packages/core/strapi', 600, '@strapi/strapi'),
      root('packages/core/types', 200, '@strapi/types'),
    ];
    const result = selectPrimary(roots, [], 'strapi');
    expect(result).toBe('packages/core/strapi');
  });

  // @ana A021
  it('vercel-ai selects packages/ai', () => {
    const roots = [
      root('.', 5, 'ai-root'),
      root('packages/provider', 400, '@ai-sdk/provider'),
      root('packages/ai', 300, 'ai'),
    ];
    const result = selectPrimary(roots, [], 'ai');
    expect(result).toBe('packages/ai');
  });

  // @ana A022
  it('n8n selects packages/cli', () => {
    const roots = [
      root('.', 5, 'n8n-root'),
      root('packages/editor-ui', 800, 'n8n-editor-ui'),
      root('packages/cli', 600, 'n8n'),
    ];
    const result = selectPrimary(roots, [], 'n8n');
    expect(result).toBe('packages/cli');
  });

  // @ana A023
  it('scalar unchanged by guard', () => {
    // @scalar/core has only 8 files — guard blocks (< 10 minimum)
    const roots = [
      root('.', 5, '@scalar/root'),
      root('packages/workspace-store', 500, '@scalar/workspace-store'),
      root('packages/core', 8, '@scalar/core'),
      root('packages/api-client', 400, '@scalar/api-client'),
    ];
    const result = selectPrimary(roots, [], 'scalar');
    expect(result).toBe('packages/workspace-store');
  });
});

// ── Regression: directus ────────────────────────────────────────────────

describe('selectPrimary — regression: directus', () => {
  // @ana A024
  it('directus wrapper blocked by guard', () => {
    // directus wrapper package: exact name match but only 3 files — guard blocks
    const roots = [
      root('.', 5, '@directus/monorepo'),
      root('api', 600, '@directus/api'),
      root('packages/directus', 3, 'directus'),
      root('packages/types', 200, '@directus/types'),
    ];
    const result = selectPrimary(roots, [], 'directus');
    expect(result).toBe('api');
  });
});

// ── Regression: anatomia self-scan ──────────────────────────────────────

describe('selectPrimary — regression: anatomia self-scan', () => {
  // @ana A025
  it('anatomia self-scan unchanged', () => {
    // "anatomia-cli" does not match "anatomia" — no tier matches
    const roots = [
      root('.', 5, 'anatomia-workspace'),
      root('packages/cli', 500, 'anatomia-cli'),
      root('website', 100, 'anatomia-website'),
    ];
    const result = selectPrimary(roots, [], 'anatomia');
    expect(result).toBe('packages/cli');
  });
});

// ── Export and caller ───────────────────────────────────────────────────

describe('selectPrimary — export and caller', () => {
  // @ana A027
  it('selectPrimary is exported', () => {
    expect(typeof selectPrimary).toBe('function');
  });

  // @ana A026
  it('caller passes path.basename(normalizedRoot)', () => {
    // This is verified by reading census.ts — the call site passes
    // path.basename(normalizedRoot). This test documents the contract
    // exists and the function accepts the parameter.
    const roots = [root('packages/core', 100, '@myapp/core')];
    const result = selectPrimary(roots, [], 'myapp');
    expect(result).toBe('packages/core');
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────

describe('selectPrimary — edge cases', () => {
  it('empty projectDirName skips Policy 2', () => {
    const roots = [
      root('packages/big', 500, 'big'),
      root('packages/small', 100, 'small'),
    ];
    const result = selectPrimary(roots, [], '');
    // No name match — falls to Policy 3
    expect(result).toBe('packages/big');
  });

  it('package with null packageName skipped in name match', () => {
    const roots = [
      root('packages/unnamed', 500, null),
      root('packages/named', 100, 'other'),
    ];
    const result = selectPrimary(roots, [], 'unnamed');
    // null packageName can't match — Policy 3 picks most files
    expect(result).toBe('packages/unnamed');
  });

  it('single candidate that matches name but fails guard', () => {
    const roots = [
      root('packages/tiny', 3, 'myapp'),
    ];
    const result = selectPrimary(roots, [], 'myapp');
    // Guard blocks (3 < 10) — falls to Policy 3
    expect(result).toBe('packages/tiny');
  });

  it('no roots returns fallback', () => {
    const result = selectPrimary([], [], 'myapp');
    expect(result).toBe('.');
  });
});
