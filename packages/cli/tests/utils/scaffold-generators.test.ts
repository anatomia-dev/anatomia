/**
 * Tests for scaffold-generators surface line
 */

import { describe, it, expect } from 'vitest';
import {
  generateProjectContextScaffold,
  generateReadingOrderBlock,
} from '../../src/utils/scaffold-generators.js';
import { createEmptyEngineResult } from '../../src/engine/types/engineResult.js';

describe('generateProjectContextScaffold', () => {
  // @ana A012
  it('includes detected surfaces line for monorepo projects', () => {
    const result = createEmptyEngineResult();
    result.monorepo = {
      isMonorepo: true,
      tool: 'pnpm',
      packages: [
        { name: 'my-cli', path: 'packages/cli', language: 'TypeScript', framework: null, testing: ['Vitest'], hasBin: true, scripts: [], sourceFiles: 50 },
        { name: 'my-web', path: 'website', language: 'TypeScript', framework: 'Next.js', testing: ['Vitest'], hasBin: false, scripts: [], sourceFiles: 30 },
      ],
      primaryPackage: null,
    };
    result.surfaces = [
      { name: 'cli', path: 'packages/cli', packageName: 'my-cli', language: 'TypeScript', framework: null, testing: ['Vitest'], sourceFiles: 50 },
      { name: 'website', path: 'website', packageName: 'my-web', language: 'TypeScript', framework: 'Next.js', testing: ['Vitest'], sourceFiles: 30 },
    ];
    const scaffold = generateProjectContextScaffold(result);
    expect(scaffold).toContain('Detected surfaces');
    expect(scaffold).toContain('cli (packages/cli, TypeScript)');
    expect(scaffold).toContain('website (website, TypeScript, Next.js)');
  });

  // @ana A013
  it('has no surface mention for single-package projects', () => {
    const result = createEmptyEngineResult();
    result.monorepo = { isMonorepo: false, tool: null, packages: [], primaryPackage: null };
    result.surfaces = [];
    const scaffold = generateProjectContextScaffold(result);
    expect(scaffold).not.toContain('Detected surfaces');
  });

  it('injects the Start Here reading-order block when readingOrder is present', () => {
    const result = createEmptyEngineResult();
    result.readingOrder = {
      budget: 1000,
      personalizedTo: null,
      entries: [
        { file: 'src/commands/work.ts', score: 1.0, reasons: ['68 work items, 4 rework cycles', 'import centrality 1.00'] },
        { file: 'src/utils/proofSummary.ts', score: 0.8, reasons: ['import centrality 0.80'] },
      ],
    };
    const scaffold = generateProjectContextScaffold(result);
    expect(scaffold).toContain('## Start Here');
    expect(scaffold).toContain('`src/commands/work.ts`');
    expect(scaffold).toContain('68 work items, 4 rework cycles');
  });

  it('omits the Start Here block when readingOrder is null', () => {
    const result = createEmptyEngineResult();
    expect(result.readingOrder).toBeNull();
    const scaffold = generateProjectContextScaffold(result);
    expect(scaffold).not.toContain('## Start Here');
  });
});

describe('generateReadingOrderBlock', () => {
  it('returns an empty string when readingOrder is null', () => {
    expect(generateReadingOrderBlock(null)).toBe('');
  });

  it('returns an empty string when there are no entries', () => {
    expect(generateReadingOrderBlock({ budget: 1000, personalizedTo: null, entries: [] })).toBe('');
  });

  it('marks the scope slug when personalized', () => {
    const block = generateReadingOrderBlock({
      budget: 1000,
      personalizedTo: 'my-task',
      entries: [{ file: 'src/a.ts', score: 1, reasons: ['import centrality 1.00'] }],
    });
    expect(block).toContain('## Start Here (scoped to `my-task`)');
    expect(block).toContain('`src/a.ts` — import centrality 1.00');
  });

  it('caps the list and notes the overflow', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      file: `src/mod${i}.ts`,
      score: 1 - i / 10,
      reasons: ['import centrality 0.50'],
    }));
    const block = generateReadingOrderBlock({ budget: 1000, personalizedTo: null, entries });
    expect(block).toContain('`src/mod6.ts`');
    expect(block).not.toContain('`src/mod7.ts`');
    expect(block).toContain('+3 more');
  });
});
