/**
 * Tests for DATABASE_PACKAGES and PAYMENT_PACKAGES vocabulary coverage
 * plus detectFromDeps ordering behavior.
 */
import { describe, it, expect } from 'vitest';
import {
  DATABASE_PACKAGES,
  PAYMENT_PACKAGES,
  ORM_PACKAGES,
  detectFromDeps,
  findStackProvenance,
} from '../../../src/engine/detectors/dependencies.js';
import type { SourceRoot, ProjectCensus } from '../../../src/engine/types/census.js';

// ── Part A: DATABASE_PACKAGES membership ─────────────────────────────

describe('DATABASE_PACKAGES new entries', () => {
  // @ana A001
  it('contains kysely → Kysely', () => {
    expect(DATABASE_PACKAGES['kysely']).toBe('Kysely');
  });

  // @ana A002
  it('contains @mikro-orm/core → MikroORM', () => {
    expect(DATABASE_PACKAGES['@mikro-orm/core']).toBe('MikroORM');
  });

  // @ana A003
  it('contains slonik → PostgreSQL', () => {
    expect(DATABASE_PACKAGES['slonik']).toBe('PostgreSQL');
  });

  // @ana A004
  it('contains @silverhand/slonik → PostgreSQL', () => {
    expect(DATABASE_PACKAGES['@silverhand/slonik']).toBe('PostgreSQL');
  });

  // @ana A005
  it('contains @vercel/postgres → Vercel Postgres', () => {
    expect(DATABASE_PACKAGES['@vercel/postgres']).toBe('Vercel Postgres');
  });

  // @ana A006
  it('contains mongodb → MongoDB', () => {
    expect(DATABASE_PACKAGES['mongodb']).toBe('MongoDB');
  });

  // @ana A007
  it('contains postgres → PostgreSQL', () => {
    expect(DATABASE_PACKAGES['postgres']).toBe('PostgreSQL');
  });

  // @ana A008
  it('contains sqlite3 → SQLite', () => {
    expect(DATABASE_PACKAGES['sqlite3']).toBe('SQLite');
  });

  // @ana A009
  it('contains mssql → SQL Server', () => {
    expect(DATABASE_PACKAGES['mssql']).toBe('SQL Server');
  });
});

// ── ORM_PACKAGES ────────────────────────────────────────────────────

// @ana A003
describe('ORM_PACKAGES export', () => {
  // @ana A004
  it('contains all 9 ORM entries from DATABASE_PACKAGES', () => {
    const expected = [
      'prisma', '@prisma/client', 'drizzle-orm',
      'typeorm', 'sequelize', 'mongoose',
      'knex', 'kysely', '@mikro-orm/core',
    ];
    for (const pkg of expected) {
      expect(ORM_PACKAGES.has(pkg)).toBe(true);
    }
    expect(ORM_PACKAGES.size).toBe(9);
  });

  // @ana A005
  it('does not contain raw database drivers', () => {
    expect(ORM_PACKAGES.has('pg')).toBe(false);
    expect(ORM_PACKAGES.has('mysql2')).toBe(false);
    expect(ORM_PACKAGES.has('better-sqlite3')).toBe(false);
    expect(ORM_PACKAGES.has('mongodb')).toBe(false);
    expect(ORM_PACKAGES.has('postgres')).toBe(false);
  });

  // @ana A006
  it('does not contain BaaS packages', () => {
    expect(ORM_PACKAGES.has('@supabase/supabase-js')).toBe(false);
    expect(ORM_PACKAGES.has('firebase')).toBe(false);
    expect(ORM_PACKAGES.has('@planetscale/database')).toBe(false);
    expect(ORM_PACKAGES.has('convex')).toBe(false);
  });

  it('every ORM_PACKAGES entry exists in DATABASE_PACKAGES', () => {
    for (const pkg of ORM_PACKAGES) {
      expect(DATABASE_PACKAGES[pkg]).toBeDefined();
    }
  });
});

// ── Part A: Ordering invariant ───────────────────────────────────────

describe('detectFromDeps ordering', () => {
  // @ana A010
  it('ORM (Prisma) wins over raw driver (postgres) when both present', () => {
    const result = detectFromDeps({ 'prisma': '1', 'postgres': '1' });
    expect(result.database).toBe('Prisma');
  });

  // @ana A011
  it('ORM (Mongoose) wins over raw driver (mongodb) when both present', () => {
    const result = detectFromDeps({ 'mongoose': '1', 'mongodb': '1' });
    expect(result.database).toBe('Mongoose');
  });

  // @ana A012
  it('postgres.js standalone detects PostgreSQL', () => {
    const result = detectFromDeps({ 'postgres': '1' });
    expect(result.database).toBe('PostgreSQL');
  });

  // @ana A013
  it('sqlite3 standalone detects SQLite', () => {
    const result = detectFromDeps({ 'sqlite3': '1' });
    expect(result.database).toBe('SQLite');
  });

  // @ana A014
  it('mssql standalone detects SQL Server', () => {
    const result = detectFromDeps({ 'mssql': '1' });
    expect(result.database).toBe('SQL Server');
  });

  it('mongodb standalone detects MongoDB', () => {
    const result = detectFromDeps({ 'mongodb': '1' });
    expect(result.database).toBe('MongoDB');
  });
});

// ── Part D: PAYMENT_PACKAGES ─────────────────────────────────────────

describe('PAYMENT_PACKAGES new entries', () => {
  // @ana A021
  it('contains @stripe/react-stripe-js → Stripe', () => {
    expect(PAYMENT_PACKAGES['@stripe/react-stripe-js']).toBe('Stripe');
  });

  // @ana A022
  it('frontend-only Stripe project detects payments', () => {
    const result = detectFromDeps({ '@stripe/react-stripe-js': '1' });
    expect(result.payments).toBe('Stripe');
  });
});

// ── Regression guards ────────────────────────────────────────────────

describe('existing entries unchanged', () => {
  // @ana A023
  it('prisma still maps to Prisma', () => {
    expect(DATABASE_PACKAGES['prisma']).toBe('Prisma');
  });

  // @ana A024
  it('stripe still maps to Stripe', () => {
    expect(PAYMENT_PACKAGES['stripe']).toBe('Stripe');
  });
});

// ── Forward capture in detectFromDeps ───────────────────────────────

describe('detectFromDeps forward capture', () => {
  // @ana A001
  it('captures the triggering database package name', () => {
    const result = detectFromDeps({ 'prisma': '1' });
    expect(result.databasePkg).toBe('prisma');
  });

  // @ana A002
  it('captures the triggering auth package name', () => {
    const result = detectFromDeps({ 'next-auth': '1' });
    expect(result.authPkg).toBe('next-auth');
  });

  // @ana A003
  it('captures the triggering payments package name', () => {
    const result = detectFromDeps({ 'stripe': '1' });
    expect(result.paymentsPkg).toBe('stripe');
  });

  // @ana A004
  it('package name fields are null when no detection occurs', () => {
    const result = detectFromDeps({});
    expect(result.databasePkg).toBeNull();
    expect(result.authPkg).toBeNull();
    expect(result.paymentsPkg).toBeNull();
  });
});

// ── findStackProvenance ─────────────────────────────────────────────

function makeRoot(overrides: Partial<SourceRoot> & { relativePath: string }): SourceRoot {
  return {
    absolutePath: `/tmp/project/${overrides.relativePath}`,
    relativePath: overrides.relativePath,
    packageName: overrides.packageName ?? overrides.relativePath.split('/').pop() ?? null,
    fileCount: overrides.fileCount ?? 100,
    isPrimary: overrides.isPrimary ?? false,
    deps: overrides.deps ?? {},
    devDeps: overrides.devDeps ?? {},
    hasBin: overrides.hasBin ?? false,
    hasMain: overrides.hasMain ?? false,
    hasExports: overrides.hasExports ?? false,
    scripts: overrides.scripts ?? [],
  };
}

function makeCensus(roots: SourceRoot[]): ProjectCensus {
  return {
    rootPath: '/tmp/project',
    projectName: 'test-project',
    layout: roots.length > 1 ? 'monorepo' : 'single-repo',
    monorepoTool: roots.length > 1 ? 'pnpm' : null,
    sourceRoots: roots,
    primarySourceRoot: roots.find(r => r.isPrimary)?.relativePath ?? '.',
    allDeps: {},
    deps: {},
    devDeps: {},
    rootDevDeps: {},
    rootDeps: {},
    primaryDeps: {},
    configs: {
      frameworkHints: [],
      tsconfigs: [],
      schemas: [],
      deployments: [],
      ciWorkflows: [],
    },
    builtAt: '2026-05-22T00:00:00.000Z',
    buildDurationMs: 1,
  };
}

// @ana A005
describe('findStackProvenance single-repo', () => {
  it('single-repo projects always produce empty provenance', () => {
    const root = makeRoot({ relativePath: '.', isPrimary: true, deps: { 'prisma': '1' } });
    const census = makeCensus([root]);
    const depResult = detectFromDeps({ 'prisma': '1' });
    const provenance = findStackProvenance(census, depResult, null);
    expect(Object.keys(provenance).length).toBe(0);
  });
});

// @ana A006
describe('findStackProvenance monorepo primary detection', () => {
  it('detection from the primary package produces empty provenance', () => {
    const primary = makeRoot({ relativePath: 'packages/app', isPrimary: true, deps: { 'prisma': '1' } });
    const other = makeRoot({ relativePath: 'packages/other', deps: {} });
    const census = makeCensus([primary, other]);
    const depResult = detectFromDeps({ 'prisma': '1' });
    const provenance = findStackProvenance(census, depResult, null);
    expect(provenance).toEqual({});
  });
});

// @ana A007
describe('findStackProvenance monorepo non-primary detection', () => {
  it('detection from a non-primary package records the source path', () => {
    const primary = makeRoot({ relativePath: 'packages/app', isPrimary: true, deps: {} });
    const other = makeRoot({ relativePath: 'packages/other', deps: { 'prisma': '1' } });
    const census = makeCensus([primary, other]);
    const depResult = detectFromDeps({ 'prisma': '1' });
    const provenance = findStackProvenance(census, depResult, null);
    expect(provenance.database).toBe('packages/other');
  });
});

// @ana A008
describe('findStackProvenance devDeps detection', () => {
  it('provenance checks devDeps, not just production deps', () => {
    const primary = makeRoot({ relativePath: 'packages/app', isPrimary: true, deps: {} });
    const other = makeRoot({ relativePath: 'packages/db', devDeps: { 'prisma': '1' } });
    const census = makeCensus([primary, other]);
    const depResult = detectFromDeps({ 'prisma': '1' });
    const provenance = findStackProvenance(census, depResult, null);
    expect(provenance.database).toBeDefined();
    expect(provenance.database).toBe('packages/db');
  });
});

// @ana A009
describe('findStackProvenance aiSdk non-primary', () => {
  it('AI SDK detection from a non-primary package is flagged', () => {
    const primary = makeRoot({ relativePath: 'packages/app', isPrimary: true, deps: {} });
    const aiPkg = makeRoot({ relativePath: 'packages/ai', deps: { 'ai': '1' } });
    const census = makeCensus([primary, aiPkg]);
    const depResult = detectFromDeps({});
    const provenance = findStackProvenance(census, depResult, 'Vercel AI');
    expect(provenance.aiSdk).toBeDefined();
    expect(provenance.aiSdk).toBe('packages/ai');
  });
});

// @ana A010
describe('findStackProvenance null dep fields', () => {
  it('null dep result fields produce no provenance entry', () => {
    const primary = makeRoot({ relativePath: 'packages/app', isPrimary: true, deps: {} });
    const other = makeRoot({ relativePath: 'packages/other', deps: { 'prisma': '1' } });
    const census = makeCensus([primary, other]);
    // depResult with all null pkg fields (no detection)
    const depResult = detectFromDeps({});
    const provenance = findStackProvenance(census, depResult, null);
    expect(Object.keys(provenance).length).toBe(0);
  });
});

// @ana A011
describe('findStackProvenance aiSdk null', () => {
  it('null aiSdk parameter produces no aiSdk provenance', () => {
    const primary = makeRoot({ relativePath: 'packages/app', isPrimary: true, deps: {} });
    const other = makeRoot({ relativePath: 'packages/ai', deps: { 'ai': '1' } });
    const census = makeCensus([primary, other]);
    const depResult = detectFromDeps({});
    const provenance = findStackProvenance(census, depResult, null);
    expect(Object.keys(provenance)).not.toContain('aiSdk');
  });
});

// @ana A012, A013
describe('findStackProvenance field coverage', () => {
  it('provenance checks database, auth, payments, and aiSdk', () => {
    const primary = makeRoot({ relativePath: 'packages/app', isPrimary: true, deps: {} });
    const other = makeRoot({
      relativePath: 'packages/other',
      deps: { 'prisma': '1', 'next-auth': '1', 'stripe': '1', '@anthropic-ai/sdk': '1' },
    });
    const census = makeCensus([primary, other]);
    const depResult = detectFromDeps({ 'prisma': '1', 'next-auth': '1', 'stripe': '1' });
    const provenance = findStackProvenance(census, depResult, 'Anthropic');
    const keys = Object.keys(provenance);
    expect(keys).toContain('database');
    expect(keys).toContain('auth');
    expect(keys).toContain('payments');
    expect(keys).toContain('aiSdk');
  });

  it('provenance does not check testing or framework', () => {
    const primary = makeRoot({ relativePath: 'packages/app', isPrimary: true, deps: {} });
    const other = makeRoot({
      relativePath: 'packages/other',
      deps: { 'prisma': '1', 'vitest': '1' },
    });
    const census = makeCensus([primary, other]);
    const depResult = detectFromDeps({ 'prisma': '1', 'vitest': '1' });
    const provenance = findStackProvenance(census, depResult, null);
    const keys = Object.keys(provenance);
    expect(keys).not.toContain('testing');
    expect(keys).not.toContain('framework');
  });

  it('multiple non-primary roots — first match wins', () => {
    const primary = makeRoot({ relativePath: 'packages/app', isPrimary: true, deps: {} });
    const first = makeRoot({ relativePath: 'packages/first', deps: { 'prisma': '1' } });
    const second = makeRoot({ relativePath: 'packages/second', deps: { 'prisma': '1' } });
    const census = makeCensus([primary, first, second]);
    const depResult = detectFromDeps({ 'prisma': '1' });
    const provenance = findStackProvenance(census, depResult, null);
    expect(provenance.database).toBe('packages/first');
  });

  it('primary root devDeps prevents provenance entry', () => {
    const primary = makeRoot({ relativePath: 'packages/app', isPrimary: true, devDeps: { 'prisma': '1' } });
    const other = makeRoot({ relativePath: 'packages/other', deps: { 'prisma': '1' } });
    const census = makeCensus([primary, other]);
    const depResult = detectFromDeps({ 'prisma': '1' });
    const provenance = findStackProvenance(census, depResult, null);
    expect(provenance).toEqual({});
  });
});
