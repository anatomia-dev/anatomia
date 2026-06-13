/**
 * Slice 3 — "Start here" reading-order card in `ana scan` output.
 *
 * Exercises formatHumanReadable's rendering of result.readingOrder:
 *  - a non-null reading order renders a "Start here" section with each file
 *    and its measured reasons,
 *  - a personalized reading order names the scope in the section title,
 *  - a null reading order renders no "Start here" section,
 *  - the card caps the displayed entries and notes the overflow.
 */

import { describe, it, expect } from 'vitest';
import { formatHumanReadable } from '../../src/commands/scan.js';
import { createEmptyEngineResult } from '../../src/engine/types/engineResult.js';
import type { EngineResult } from '../../src/engine/types/engineResult.js';

function makeResult(readingOrder: EngineResult['readingOrder']): EngineResult {
  const result = createEmptyEngineResult();
  result.overview = { project: 'test-project', scannedAt: new Date().toISOString(), depth: 'deep', indexedCommit: null };
  result.stack = { language: 'TypeScript', framework: null, database: null, auth: null, testing: [], payments: null, workspace: null, aiSdk: null, uiSystem: null };
  result.readingOrder = readingOrder;
  return result;
}

describe('Start here reading-order card', () => {
  it('renders the reading list with files and measured reasons', () => {
    const output = formatHumanReadable(
      makeResult({
        budget: 1000,
        personalizedTo: null,
        entries: [
          { file: 'src/commands/work.ts', score: 1.0, reasons: ['68 work items, 4 rework cycles', 'import centrality 1.00'] },
          { file: 'src/utils/proofSummary.ts', score: 0.7, reasons: ['import centrality 0.70'] },
        ],
      }),
      { isFunnel: false, rootPath: '/tmp/test' },
    );

    expect(output).toContain('Start here');
    expect(output).toContain('src/commands/work.ts');
    expect(output).toContain('68 work items, 4 rework cycles');
    expect(output).toContain('src/utils/proofSummary.ts');
  });

  it('names the scope in the title when personalized', () => {
    const output = formatHumanReadable(
      makeResult({
        budget: 1000,
        personalizedTo: 'my-task',
        entries: [{ file: 'src/a.ts', score: 1, reasons: ['in active scope', 'import centrality 1.00'] }],
      }),
      { isFunnel: false, rootPath: '/tmp/test' },
    );
    expect(output).toContain('Start here · scoped to my-task');
    expect(output).toContain('src/a.ts');
  });

  it('renders no Start here section when readingOrder is null', () => {
    const output = formatHumanReadable(makeResult(null), { isFunnel: false, rootPath: '/tmp/test' });
    expect(output).not.toContain('Start here');
  });

  it('caps the displayed entries and notes the overflow', () => {
    const entries = Array.from({ length: 8 }, (_, i) => ({
      file: `src/mod${i}.ts`,
      score: 1 - i / 10,
      reasons: ['import centrality 0.50'],
    }));
    const output = formatHumanReadable(
      makeResult({ budget: 1000, personalizedTo: null, entries }),
      { isFunnel: false, rootPath: '/tmp/test' },
    );
    expect(output).toContain('src/mod4.ts');
    expect(output).not.toContain('src/mod5.ts');
    expect(output).toContain('+3 more');
  });
});
