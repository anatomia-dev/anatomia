import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the data accessor modules before importing stripJsx
vi.mock('@/lib/docs-data/proofs', () => ({
  getProofEntries: vi.fn(),
  getProofStats: vi.fn(),
  getMedianTimings: vi.fn(),
}));

vi.mock('@/lib/docs-data/skills', () => ({
  getSkillCount: vi.fn(),
}));

vi.mock('@/lib/docs-data/gotchas', () => ({
  getGotchaCount: vi.fn(),
}));

import { stripJsx } from '@/lib/docs-data/stripJsx';
import { getProofEntries, getProofStats, getMedianTimings } from '@/lib/docs-data/proofs';
import { getSkillCount } from '@/lib/docs-data/skills';
import { getGotchaCount } from '@/lib/docs-data/gotchas';

const mockGetProofEntries = vi.mocked(getProofEntries);
const mockGetProofStats = vi.mocked(getProofStats);
const mockGetMedianTimings = vi.mocked(getMedianTimings);
const mockGetSkillCount = vi.mocked(getSkillCount);
const mockGetGotchaCount = vi.mocked(getGotchaCount);

beforeEach(() => {
  vi.resetAllMocks();

  mockGetProofEntries.mockReturnValue([
    { slug: 'a', feature: 'A' },
    { slug: 'b', feature: 'B' },
  ] as never);
  mockGetProofStats.mockReturnValue({
    entries: 2,
    assertions: 10,
    findings: 3,
    rejections: 1,
  });
  mockGetMedianTimings.mockReturnValue({
    think: 3,
    plan: 8,
    build: 15,
    verify: 7,
  });
  mockGetSkillCount.mockReturnValue(8);
  mockGetGotchaCount.mockReturnValue(15);
});

// @ana A013
describe('stripJsx removes import/export lines', () => {
  it('removes import and export statements', () => {
    const input = `import { Callout } from '@/components/Callout';
export { something };
# Heading

Some content here.`;
    const result = stripJsx(input);

    expect(result).not.toContain('import');
    expect(result).not.toContain('export');
    expect(result).toContain('# Heading');
    expect(result).toContain('Some content here.');
  });
});

describe('stripJsx removes JSX comments', () => {
  it('removes JSX expression comments', () => {
    const input = 'Before {/* this is a comment */} after.';
    const result = stripJsx(input);

    expect(result).not.toContain('{/*');
    expect(result).toContain('Before');
    expect(result).toContain('after.');
  });
});

describe('stripJsx removes self-closing components', () => {
  it('removes self-closing JSX components', () => {
    const input = 'Before <SomeComponent prop="val" /> after.';
    const result = stripJsx(input);

    expect(result).not.toContain('SomeComponent');
    expect(result).toContain('Before');
    expect(result).toContain('after.');
  });
});

// @ana A014
describe('stripJsx preserves blockComponent children', () => {
  it('removes Callout tags but keeps inner content', () => {
    const input = '<Callout variant="note">inner content</Callout>';
    const result = stripJsx(input);

    expect(result).toContain('inner content');
    expect(result).not.toContain('<Callout');
    expect(result).not.toContain('</Callout>');
  });

  it('handles ForPlatform block components', () => {
    const input = '<ForPlatform name="macos">Mac instructions</ForPlatform>';
    const result = stripJsx(input);

    expect(result).toContain('Mac instructions');
    expect(result).not.toContain('ForPlatform');
  });
});

// @ana A015
describe('stripJsx removes stripFull components', () => {
  it('removes PipelineDiagram entirely including children', () => {
    const input = 'Before\n<PipelineDiagram>child content</PipelineDiagram>\nAfter';
    const result = stripJsx(input);

    expect(result).not.toContain('PipelineDiagram');
    expect(result).not.toContain('child content');
    expect(result).toContain('Before');
    expect(result).toContain('After');
  });

  it('removes self-closing stripFull components', () => {
    const input = 'Before <StatsStrip /> after.';
    const result = stripJsx(input);

    expect(result).not.toContain('StatsStrip');
  });
});

// @ana A016
describe('stripJsx resolves DocsStat values', () => {
  it('replaces DocsStat tags with computed values before stripping', () => {
    const input = 'There are <DocsStat value="proofCount" /> proofs.';
    const result = stripJsx(input);

    // proofCount = entries.length = 2
    expect(result).toContain('2');
    expect(result).not.toContain('DocsStat');
  });
});
