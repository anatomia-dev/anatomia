/**
 * Tests for the versioned price table and computeCost (now sourced from anatrace-core).
 *
 * computeCost must be pure and deterministic: known model → exact cost with the
 * table version stamped; unknown model → 0 with the version still stamped (never
 * throws). Exact-value assertions only — never `toBeGreaterThan(0)`.
 *
 * Core's `computeCost` takes a third arg `{ priceTable }`; the re-exported
 * `PRICES` is threaded at every call. The table is byte-identical to the former
 * local table at 0.2.0, so every exact-cost literal below survives the swap
 * (proves adoption changes no displayed cost — AC6).
 */

import { describe, it, expect } from 'vitest';
import {
  computeCost,
  PRICE_TABLE_VERSION,
  PRICES,
  type TokenCounts,
} from '../../src/data/pricing.js';

describe('pricing', () => {
  describe('computeCost', () => {
    it('computes the exact cost for a known model and stamps the version', () => {
      // @ana A027
      const tokens: TokenCounts = {
        input: 1_000_000,
        output: 1_000_000,
        cache_create: 1_000_000,
        cache_read: 1_000_000,
      };
      // opus-4-6: 5 + 25 + 6.25 + 0.5 = 36.75 per 1M of each
      const result = computeCost(tokens, 'claude-opus-4-6', { priceTable: PRICES });
      expect(result.cost_usd).toBe(36.75);
      expect(result.priced).toBe(true);
      expect(result.price_table_version).toBe(PRICE_TABLE_VERSION);
    });

    it('prices the current flagship model (opus-4-8)', () => {
      // @ana A027
      // opus-4-8: 5 + 25 + 6.25 + 0.5 = 36.75 per 1M of each
      const tokens: TokenCounts = {
        input: 1_000_000,
        output: 1_000_000,
        cache_create: 1_000_000,
        cache_read: 1_000_000,
      };
      const result = computeCost(tokens, 'claude-opus-4-8', { priceTable: PRICES });
      expect(result.cost_usd).toBe(36.75);
      expect(result.priced).toBe(true);
    });

    it('computes a fractional cost exactly (rounded to 6 dp)', () => {
      // @ana A027
      const tokens: TokenCounts = { input: 48211, output: 12903, cache_create: 0, cache_read: 0 };
      // 48211/1e6*5 + 12903/1e6*25 = 0.241055 + 0.322575 = 0.56363
      const result = computeCost(tokens, 'claude-opus-4-6', { priceTable: PRICES });
      expect(result.cost_usd).toBe(0.56363);
    });

    // @ana A010
    it('returns 0 for an unknown model without throwing, version still stamped', () => {
      // @ana A028
      const tokens: TokenCounts = { input: 5000, output: 5000, cache_create: 5000, cache_read: 5000 };
      const result = computeCost(tokens, 'no-such-model-9000', { priceTable: PRICES });
      expect(result.cost_usd).toBe(0);
      expect(result.priced).toBe(false);
      expect(result.price_table_version).toBe(PRICE_TABLE_VERSION);
    });

    it('is deterministic — same input yields byte-identical output', () => {
      // @ana A027
      const tokens: TokenCounts = { input: 123, output: 456, cache_create: 789, cache_read: 1011 };
      const a = computeCost(tokens, 'claude-sonnet-4-6', { priceTable: PRICES });
      const b = computeCost(tokens, 'claude-sonnet-4-6', { priceTable: PRICES });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('zero tokens cost exactly 0 for a known model', () => {
      // @ana A028
      const tokens: TokenCounts = { input: 0, output: 0, cache_create: 0, cache_read: 0 };
      expect(computeCost(tokens, 'claude-opus-4-6', { priceTable: PRICES }).cost_usd).toBe(0);
    });
  });

  describe('PRICES table', () => {
    // @ana A011
    it('has a stable version stamp (re-exported from anatrace-core)', () => {
      expect(PRICE_TABLE_VERSION).toBe('2026-06-08');
    });

    it('has unique model ids', () => {
      const ids = PRICES.map((p) => p.model);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
