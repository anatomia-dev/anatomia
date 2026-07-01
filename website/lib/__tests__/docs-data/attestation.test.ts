import { describe, it, expect } from 'vitest';
import {
  summarizeAttestation,
  summarizeVeto,
  attestationTocItem,
  attestationMarkdownLines,
  type AttestationRecordInput,
  type AttestationVerdictInput,
} from '../../docs-data/attestation';
import type { ProofEntry, ProofAttestation, ProofProvenance } from '../../docs-data/types';

function verdicts(satisfied: number, unverifiable: number, violated = 0): AttestationVerdictInput[] {
  const out: AttestationVerdictInput[] = [];
  for (let i = 0; i < satisfied; i++) {
    out.push({ claim_id: `s${i}`, says: 'ok', status: 'satisfied', reason: 'predicate-matched' });
  }
  for (let i = 0; i < violated; i++) {
    out.push({ claim_id: `v${i}`, says: 'nope', status: 'violated', reason: 'predicate-not-matched' });
  }
  for (let i = 0; i < unverifiable; i++) {
    out.push({ claim_id: `u${i}`, says: 'maybe', status: 'unverifiable', reason: 'codex-blind' });
  }
  return out;
}

/** Canonical single-agent (role=plan) attestation fixture from the contract. */
function baseCompliance(): AttestationRecordInput[] {
  return [
    {
      role: 'plan',
      anatrace_core_version: '0.4.0',
      framework: 'anatomia',
      mandate_hash: 'sha256:aaaa',
      transcript_hash: 'sha256:bbbb',
      coverage: { total: 49, fully_checked: 1, unverifiable: 48 },
      complete: false,
      verdicts: verdicts(1, 48),
    },
  ];
}

/** Variant carrying one genuine violation. */
function violatedCompliance(): AttestationRecordInput[] {
  return [
    {
      role: 'verify',
      anatrace_core_version: '0.4.0',
      framework: 'anatomia',
      mandate_hash: 'sha256:cccc',
      transcript_hash: 'sha256:dddd',
      coverage: { total: 3, fully_checked: 2, unverifiable: 0 },
      complete: true,
      verdicts: verdicts(2, 0, 1),
    },
  ];
}

function entry(overrides: Partial<ProofEntry>): ProofEntry {
  return { slug: 's', ...overrides } as unknown as ProofEntry;
}

describe('summarizeAttestation', () => {
  // @ana A007
  it('counts unverifiable verdicts per agent', () => {
    const a = summarizeAttestation(baseCompliance());
    expect(a.agents[0].unverifiable).toBe(48);
  });

  // @ana A008
  it('exposes coverage.checked', () => {
    const a = summarizeAttestation(baseCompliance());
    expect(a.agents[0].coverage.checked).toBe(1);
  });

  // @ana A009
  it('surfaces the anatrace-core version', () => {
    const a = summarizeAttestation(baseCompliance());
    expect(a.coreVersion).toBe('0.4.0');
  });

  // @ana A017
  it('keeps violated at 0 while unverifiable is nonzero', () => {
    const a = summarizeAttestation(baseCompliance());
    expect(a.agents[0].violated).toBe(0);
  });

  // @ana A018
  it('exposes coverage.total for the ratio', () => {
    const a = summarizeAttestation(baseCompliance());
    expect(a.agents[0].coverage.total).toBe(49);
  });

  // @ana A019
  it('counts a genuine violation', () => {
    const a = summarizeAttestation(violatedCompliance());
    expect(a.agents[0].violated).toBe(1);
  });

  it('caps notable verdicts at 3 and counts satisfied', () => {
    const a = summarizeAttestation(baseCompliance());
    expect(a.agents[0].notable.length).toBe(3);
    expect(a.agents[0].satisfied).toBe(1);
    expect(a.incompleteCount).toBe(1);
  });
});

describe('summarizeVeto', () => {
  // @ana A020
  it('maps applied:false through', () => {
    const v = summarizeVeto({ applied: false, reason: 'verify did not read build_report.md' });
    expect(v?.applied).toBe(false);
  });

  // @ana A021
  it('passes the veto reason through verbatim', () => {
    const v = summarizeVeto({ applied: false, reason: 'verify did not read build_report.md' });
    expect(v?.reason).toContain('build_report.md');
  });

  // @ana A022
  it('maps applied:true through', () => {
    const v = summarizeVeto({ applied: true, reason: 'verify read build_report.md' });
    expect(v?.applied).toBe(true);
  });

  it('returns null when no veto was evaluated', () => {
    expect(summarizeVeto(undefined)).toBe(null);
  });
});

describe('attestationTocItem', () => {
  // @ana A013
  it('returns null when the proof has no attestation', () => {
    expect(attestationTocItem(entry({}))).toBe(null);
  });

  // @ana A015
  it('returns null for a provenance-only proof', () => {
    const provenanceOnly = entry({ provenance: {} as unknown as ProofProvenance });
    expect(attestationTocItem(provenanceOnly)).toBe(null);
  });

  it('is present when attestation exists', () => {
    const attestation = summarizeAttestation(baseCompliance());
    expect(attestationTocItem(entry({ attestation }))?.title).toContain('Session Attestation');
  });
});

describe('attestationMarkdownLines', () => {
  // @ana A028
  it('is empty when attestation is absent', () => {
    expect(attestationMarkdownLines(entry({})).length).toBe(0);
  });

  it('is non-empty when attestation is present', () => {
    const attestation: ProofAttestation = summarizeAttestation(baseCompliance());
    expect(attestationMarkdownLines(entry({ attestation })).length).toBeGreaterThan(0);
  });
});
