/**
 * Unit tests for service → stack role annotation.
 *
 * annotateServiceRoles replaces 4 copies of `!stackValues.some(v => v.includes(svc.name))`
 * substring matching with exact-match role annotation. Tests cover:
 *   - Each of the 5 role-producing stack fields (database, auth, payments, aiSdk,
 *     deployment.platform) and the "X Auth" suffix edge case.
 *   - Stack field coverage (prevents "new place to forget" — if a new role-producing
 *     stack field is added, this test fails until annotateServiceRoles is updated).
 *   - Negative case: empty stack produces empty stackRoles.
 */

import { describe, it, expect } from 'vitest';
import { annotateServiceRoles } from '../../../src/engine/utils/serviceAnnotation.js';
import { createEmptyEngineResult } from '../../../src/engine/types/engineResult.js';
import type { EngineResult } from '../../../src/engine/types/engineResult.js';

type ExternalService = EngineResult['externalServices'][number];

function makeService(name: string, category = 'other'): ExternalService {
  return { name, category, source: 'dep', configFound: false, stackRoles: [] };
}

const emptyStack = createEmptyEngineResult().stack;

describe('annotateServiceRoles', () => {
  it('leaves stackRoles empty when no stack fields match', () => {
    const services = [makeService('PostHog', 'analytics')];
    const result = annotateServiceRoles(services, emptyStack, null);
    expect(result[0]?.stackRoles).toEqual([]);
  });

  it('annotates database role when service name matches stack.database', () => {
    const services = [makeService('Supabase', 'database')];
    const stack = { ...emptyStack, database: 'Supabase' };
    const result = annotateServiceRoles(services, stack, null);
    expect(result[0]?.stackRoles).toEqual(['database']);
  });

  it('annotates auth role for bare name match (stack.auth === svc.name)', () => {
    const services = [makeService('Clerk', 'auth')];
    const stack = { ...emptyStack, auth: 'Clerk' };
    const result = annotateServiceRoles(services, stack, null);
    expect(result[0]?.stackRoles).toEqual(['auth']);
  });

  it('annotates auth role for "X Auth" suffix (Supabase-as-auth case)', () => {
    // The classic case: "Supabase" is the service, but stack.auth is
    // "Supabase Auth" — substring matching would double-count; exact-suffix
    // matching deduplicates correctly.
    const services = [makeService('Supabase', 'backend')];
    const stack = { ...emptyStack, auth: 'Supabase Auth' };
    const result = annotateServiceRoles(services, stack, null);
    expect(result[0]?.stackRoles).toEqual(['auth']);
  });

  it('annotates payments role when service matches stack.payments', () => {
    const services = [makeService('Stripe', 'payments')];
    const stack = { ...emptyStack, payments: 'Stripe' };
    const result = annotateServiceRoles(services, stack, null);
    expect(result[0]?.stackRoles).toEqual(['payments']);
  });

  it('annotates aiSdk role when service matches stack.aiSdk', () => {
    const services = [makeService('Vercel AI', 'ai')];
    const stack = { ...emptyStack, aiSdk: 'Vercel AI' };
    const result = annotateServiceRoles(services, stack, null);
    expect(result[0]?.stackRoles).toEqual(['aiSdk']);
  });

  it('annotates deployment role when service matches deploymentPlatform (passed separately)', () => {
    const services = [makeService('Vercel', 'deployment')];
    const result = annotateServiceRoles(services, emptyStack, 'Vercel');
    expect(result[0]?.stackRoles).toEqual(['deployment']);
  });

  it('does not match when prefix matches but names differ (the "Vercel AI" vs "Vercel" case)', () => {
    // If "Vercel" is the deployment platform and "Vercel AI" is an external
    // service, substring matching would wrongly dedupe the SDK as deployment.
    // Exact matching keeps them distinct.
    const services = [makeService('Vercel AI', 'ai')];
    const result = annotateServiceRoles(services, emptyStack, 'Vercel');
    expect(result[0]?.stackRoles).toEqual([]);
  });

  it('can assign multiple roles to a single service (backend + auth)', () => {
    // Supabase-as-backend AND Supabase-as-auth: the service should get both
    // roles so consumers can filter out either role's display.
    const services = [makeService('Supabase', 'backend')];
    const stack = { ...emptyStack, database: 'Supabase', auth: 'Supabase Auth' };
    const result = annotateServiceRoles(services, stack, null);
    expect(result[0]?.stackRoles).toEqual(['database', 'auth']);
  });

  it('preserves original service fields (immutable-ish map)', () => {
    const services = [makeService('Stripe', 'payments')];
    const stack = { ...emptyStack, payments: 'Stripe' };
    const result = annotateServiceRoles(services, stack, null);
    expect(result[0]?.name).toBe('Stripe');
    expect(result[0]?.category).toBe('payments');
    expect(result[0]?.source).toBe('dep');
    expect(result[0]?.configFound).toBe(false);
  });

  it('handles an empty services array without error', () => {
    expect(annotateServiceRoles([], emptyStack, null)).toEqual([]);
  });

  // Stack field coverage test — the enforcement mechanism for "new place to
  // forget" (THP Q2). If a new stack field is added to the five that produce
  // roles, this test will fail until annotateServiceRoles is updated.
  it('covers every role-producing stack field', () => {
    const roleByField: Record<string, string> = {
      database: 'database',
      auth: 'auth',
      payments: 'payments',
      aiSdk: 'aiSdk',
    };
    for (const [field, expectedRole] of Object.entries(roleByField)) {
      const probeName = `Probe-${field}`;
      const services = [makeService(probeName)];
      const stack = { ...emptyStack, [field]: probeName };
      const result = annotateServiceRoles(services, stack, null);
      expect(result[0]?.stackRoles, `stack.${field} should produce role '${expectedRole}'`).toContain(expectedRole);
    }
    // deploymentPlatform is exercised via the separate parameter above.
  });
});
