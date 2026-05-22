/**
 * Tests for DATABASE_PACKAGES and PAYMENT_PACKAGES vocabulary coverage
 * plus detectFromDeps ordering behavior.
 */
import { describe, it, expect } from 'vitest';
import {
  DATABASE_PACKAGES,
  PAYMENT_PACKAGES,
  detectFromDeps,
} from '../../../src/engine/detectors/dependencies.js';

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
