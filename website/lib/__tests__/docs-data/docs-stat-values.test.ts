import { describe, it, expect } from 'vitest';
import { buildDocsStatValues, resolveDocsStatTags } from '@/lib/docs-data/docsStatValues';

import type { DocsStatInput } from '@/lib/docs-data/docsStatValues';

const sampleInput: DocsStatInput = {
  proofCount: 42,
  rejections: 3,
  findings: 18,
  skillCount: 8,
  gotchaCount: 15,
  medianThink: 4,
  medianPlan: 10,
  medianBuild: 22,
  medianVerify: 7,
};

// @ana A010
describe('buildDocsStatValues returns all 9 keys', () => {
  it('produces all nine expected keys as strings', () => {
    const values = buildDocsStatValues(sampleInput);

    expect(Object.keys(values)).toHaveLength(9);
    expect(values.proofCount).toBe('42');
    expect(values.rejections).toBe('3');
    expect(values.findings).toBe('18');
    expect(values.skillCount).toBe('8');
    expect(values.gotchaCount).toBe('15');
    expect(values.medianThink).toBe('4');
    expect(values.medianPlan).toBe('10');
    expect(values.medianBuild).toBe('22');
    expect(values.medianVerify).toBe('7');
  });
});

// @ana A011
describe('resolveDocsStatTags replaces known keys', () => {
  it('replaces DocsStat tags with computed values', () => {
    const values = buildDocsStatValues(sampleInput);
    const input = 'We have <DocsStat value="proofCount" /> proofs and <DocsStat value="findings" /> findings.';
    const result = resolveDocsStatTags(input, values);

    expect(result).toBe('We have 42 proofs and 18 findings.');
  });
});

// @ana A012
describe('resolveDocsStatTags leaves unknown keys', () => {
  it('leaves unrecognized keys as-is', () => {
    const values = buildDocsStatValues(sampleInput);
    const input = 'Count: <DocsStat value="unknownKey" />';
    const result = resolveDocsStatTags(input, values);

    expect(result).toContain('<DocsStat');
    expect(result).toBe('Count: <DocsStat value="unknownKey" />');
  });
});

describe('resolveDocsStatTags edge cases', () => {
  it('handles text with no DocsStat tags', () => {
    const values = buildDocsStatValues(sampleInput);
    const input = 'Plain text with no tags.';
    const result = resolveDocsStatTags(input, values);

    expect(result).toBe('Plain text with no tags.');
  });

  it('handles multiple DocsStat tags in one string', () => {
    const values = buildDocsStatValues(sampleInput);
    const input = '<DocsStat value="proofCount" /> proofs, <DocsStat value="skillCount" /> skills, <DocsStat value="gotchaCount" /> gotchas.';
    const result = resolveDocsStatTags(input, values);

    expect(result).toBe('42 proofs, 8 skills, 15 gotchas.');
  });
});
