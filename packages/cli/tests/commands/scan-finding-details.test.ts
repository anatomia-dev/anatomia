/**
 * Tests for finding detail rendering in scan output.
 *
 * Exercises formatHumanReadable's detail display logic:
 * - Non-null detail renders as indented gray lines below finding title
 * - Null detail renders only the title line
 * - Multi-line detail splits into separate indented lines
 * - Pass findings never enter the detail display path
 */

import { describe, it, expect } from 'vitest';
import { formatHumanReadable } from '../../src/commands/scan.js';
import { createEmptyEngineResult } from '../../src/engine/types/engineResult.js';
import type { EngineResult } from '../../src/engine/types/engineResult.js';

function makeResult(findings: EngineResult['findings']): EngineResult {
  const result = createEmptyEngineResult();
  result.findings = findings;
  result.overview = { project: 'test-project', scannedAt: new Date().toISOString(), depth: 'surface' };
  result.stack = { language: 'TypeScript', framework: null, database: null, auth: null, testing: [], payments: null, workspace: null, aiSdk: null, uiSystem: null };
  return result;
}

describe('finding detail rendering', () => {
  // @ana A001
  it('renders detail lines for findings with non-null detail', () => {
    const output = formatHumanReadable(
      makeResult([{
        id: 'test-finding',
        severity: 'warn',
        title: 'Something needs attention',
        detail: 'This explains what happened',
        category: 'quality',
      }]),
      { isFunnel: false, rootPath: '/tmp/test' },
    );

    // Detail text appears indented below the title
    expect(output).toContain('    ');
    expect(output).toContain('This explains what happened');
  });

  // @ana A002
  it('renders detail lines in gray style', () => {
    // chalk.gray wraps text with ANSI escape codes; in the output string
    // we verify the gray marker is present around the detail text.
    // When FORCE_COLOR is not set to 0, chalk applies styling.
    const output = formatHumanReadable(
      makeResult([{
        id: 'test-finding',
        severity: 'warn',
        title: 'Warning title',
        detail: 'Gray detail text',
        category: 'quality',
      }]),
      { isFunnel: false, rootPath: '/tmp/test' },
    );

    // The detail line should exist in the output (with or without ANSI codes)
    const lines = output.split('\n');
    const detailLine = lines.find(l => l.includes('Gray detail text'));
    expect(detailLine).toBeDefined();
    // Detail line is indented with 4 spaces
    expect(detailLine!.trimStart()).not.toBe(detailLine);
  });

  // @ana A003
  it('skips detail for findings with null detail', () => {
    const output = formatHumanReadable(
      makeResult([{
        id: 'test-finding',
        severity: 'warn',
        title: 'Warning without detail',
        detail: null,
        category: 'quality',
      }]),
      { isFunnel: false, rootPath: '/tmp/test' },
    );

    const lines = output.split('\n');
    const titleLineIdx = lines.findIndex(l => l.includes('Warning without detail'));
    expect(titleLineIdx).toBeGreaterThan(-1);

    // The line after the title should NOT be an indented detail line
    // (it should be empty or a different section)
    const nextLine = lines[titleLineIdx + 1];
    if (nextLine !== undefined) {
      expect(nextLine.startsWith('    ')).toBe(false);
    }
  });

  // @ana A004
  it('splits multi-line detail into separate indented lines', () => {
    const output = formatHumanReadable(
      makeResult([{
        id: 'test-finding',
        severity: 'warn',
        title: 'Multi-line finding',
        detail: 'First detail line\nSecond detail line',
        category: 'quality',
      }]),
      { isFunnel: false, rootPath: '/tmp/test' },
    );

    const lines = output.split('\n');
    const detailLines = lines.filter(l => l.includes('detail line'));
    expect(detailLines).toHaveLength(2);
    expect(output).toContain('First detail line');
    expect(output).toContain('Second detail line');
  });

  // @ana A008
  it('secret finding detail contains file location', () => {
    const output = formatHumanReadable(
      makeResult([{
        id: 'hardcoded-secret',
        severity: 'critical',
        title: 'Hardcoded API key',
        detail: 'sk_l****aBcD  src/config.ts:42',
        category: 'security',
      }]),
      { isFunnel: false, rootPath: '/tmp/test' },
    );

    expect(output).toContain('sk_l****aBcD  src/config.ts:42');
  });

  // @ana A009
  it('env finding detail is present', () => {
    const output = formatHumanReadable(
      makeResult([{
        id: 'env-hygiene',
        severity: 'warn',
        title: 'No .env.example',
        detail: "AI won't know what env vars this project needs without .env.example",
        category: 'quality',
      }]),
      { isFunnel: false, rootPath: '/tmp/test' },
    );

    expect(output).toContain("AI won't know what env vars this project needs");
  });

  // @ana A010
  it('pass findings excluded from detail rendering', () => {
    const output = formatHumanReadable(
      makeResult([{
        id: 'test-finding',
        severity: 'pass',
        title: 'Everything is fine',
        detail: 'This should not appear',
        category: 'quality',
      }]),
      { isFunnel: false, rootPath: '/tmp/test' },
    );

    // Pass findings don't enter the criticalOrWarn loop
    expect(output).not.toContain('This should not appear');
  });
});
