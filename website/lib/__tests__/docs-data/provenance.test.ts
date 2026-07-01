import { describe, it, expect } from 'vitest';
import {
  deriveProvenance,
  provenanceTocItem,
  provenanceMarkdownLines,
  type ProvenancePriceFn,
  type ProvenanceProcessInput,
} from '../../docs-data/provenance';
import type { ProofEntry, ProofProvenance } from '../../docs-data/types';

// Deterministic stub priceFn — asserts cost math without anatrace-core.
// Priced sessions map by input-token count; the "unknown-model" is unpriced.
const priceStub: ProvenancePriceFn = (tokens, model) => {
  if (model === 'unknown-model') {
    return { cost_usd: 0, priced: false, price_table_version: '2026-06-14' };
  }
  const byInput: Record<number, number> = { 1000: 1.5, 100: 2.5 };
  return {
    cost_usd: byInput[tokens.input] ?? 0,
    priced: true,
    price_table_version: '2026-06-14',
  };
};

/** Canonical two-session, same-model fixture from the contract. */
function baseProcess(): ProvenanceProcessInput {
  return {
    module_churn: { 'a.ts': { added: 100, deleted: 0 }, 'b.ts': { added: 38, deleted: 0 } },
    completeness: {
      complete: true,
      expected: { plan: 1, build: 1, verify: 1 },
      present: { plan: 1, build: 1, verify: 1 },
    },
    sessions: [
      {
        role: 'ana',
        model: 'claude-opus-4-8',
        derived: {
          tokens: { input: 1000, output: 2000, cache_create: 3000, cache_read: 4000 },
          turns: 10,
          tool_calls: 5,
          model: 'claude-opus-4-8',
        },
      },
      {
        role: 'build',
        model: 'claude-opus-4-8',
        derived: {
          tokens: { input: 100, output: 200, cache_create: 300, cache_read: 400 },
          turns: 20,
          tool_calls: 8,
          model: 'claude-opus-4-8',
        },
      },
    ],
  };
}

/** Unpriced variant — S2 runs an unknown (unpriced) model. */
function unpricedProcess(): ProvenanceProcessInput {
  const p = baseProcess();
  p.sessions[1].model = 'unknown-model';
  p.sessions[1].derived!.model = 'unknown-model';
  return p;
}

function entryWith(provenance?: ProofProvenance): ProofEntry {
  return { slug: 's', provenance } as unknown as ProofEntry;
}

describe('deriveProvenance', () => {
  // @ana A001
  it('returns one row per pipeline session', () => {
    const p = deriveProvenance(baseProcess(), priceStub);
    expect(p.sessions.length).toBe(2);
  });

  // @ana A002
  it('sums cache_create + cache_read into tokens.cache', () => {
    const p = deriveProvenance(baseProcess(), priceStub);
    expect(p.sessions[0].tokens.cache).toBe(7000);
    expect(p.sessions[1].tokens.cache).toBe(700);
  });

  // @ana A003
  it('totals.costUsd sums the priced session costs', () => {
    const p = deriveProvenance(baseProcess(), priceStub);
    expect(p.totals.costUsd).toBe(4);
  });

  // @ana A004
  it('totals.sessions counts the sessions', () => {
    const p = deriveProvenance(baseProcess(), priceStub);
    expect(p.totals.sessions).toBe(2);
  });

  // @ana A005
  it('churn.added sums added lines across all touched files', () => {
    const p = deriveProvenance(baseProcess(), priceStub);
    expect(p.churn?.added).toBe(138);
    expect(p.churn?.files).toBe(2);
  });

  // @ana A006
  it('passes completeness.complete through', () => {
    const p = deriveProvenance(baseProcess(), priceStub);
    expect(p.completeness?.complete).toBe(true);
  });

  // @ana A010
  it('collapses to a shared model when every session matches', () => {
    const p = deriveProvenance(baseProcess(), priceStub);
    expect(p.model).toBe('claude-opus-4-8');
  });

  // @ana A016
  it('session objects expose no status/verdict field (non-gating)', () => {
    const p = deriveProvenance(baseProcess(), priceStub);
    expect(Object.keys(p.sessions[0])).not.toContain('status');
  });

  // @ana A023
  it('takes per-session cost from the injected priceFn', () => {
    const p = deriveProvenance(baseProcess(), priceStub);
    expect(p.sessions[0].costUsd).toBe(1.5);
  });

  // @ana A024
  it('sets costUsd to null for an unpriced session', () => {
    const p = deriveProvenance(unpricedProcess(), priceStub);
    expect(p.sessions[1].costUsd).toBe(null);
  });

  // @ana A025
  it('totals.unpriced counts the unpriced sessions', () => {
    const p = deriveProvenance(unpricedProcess(), priceStub);
    expect(p.totals.unpriced).toBe(1);
  });

  // @ana A026
  it('sources priceTableVersion from the CostResult', () => {
    const p = deriveProvenance(baseProcess(), priceStub);
    expect(p.priceTableVersion).toBe('2026-06-14');
  });

  it('keeps a counts-unavailable session with null numbers and no model collapse', () => {
    const proc = baseProcess();
    delete proc.sessions[1].derived;
    const p = deriveProvenance(proc, priceStub);
    expect(p.sessions[1].countsAvailable).toBe(false);
    expect(p.sessions[1].costUsd).toBe(null);
    expect(p.sessions[1].turns).toBe(0);
    expect(p.model).toBe(null);
  });

  it('omits churn when no files changed', () => {
    const proc = baseProcess();
    proc.module_churn = {};
    const p = deriveProvenance(proc, priceStub);
    expect(p.churn).toBe(null);
  });

  it('appends the model to each label when models differ', () => {
    const p = deriveProvenance(unpricedProcess(), priceStub);
    expect(p.sessions[0].label).toContain('opus-4-8');
    expect(p.sessions[1].label).toContain('unknown-model');
  });
});

describe('provenanceTocItem', () => {
  // @ana A011
  it('returns null when the proof has no provenance', () => {
    expect(provenanceTocItem(entryWith(undefined))).toBe(null);
  });

  // @ana A014
  it('is present for a provenance-carrying proof', () => {
    const provenance = deriveProvenance(baseProcess(), priceStub);
    expect(provenanceTocItem(entryWith(provenance))?.title).toContain('Provenance');
  });
});

describe('provenanceMarkdownLines', () => {
  // @ana A012
  it('is empty when the proof has no provenance', () => {
    expect(provenanceMarkdownLines(entryWith(undefined)).length).toBe(0);
  });

  // @ana A027
  it('is non-empty when provenance is present', () => {
    const provenance = deriveProvenance(baseProcess(), priceStub);
    expect(provenanceMarkdownLines(entryWith(provenance)).length).toBeGreaterThan(0);
  });
});
