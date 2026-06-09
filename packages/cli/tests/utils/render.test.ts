/**
 * Unit tests for the shared terminal-render vocabulary (utils/render.ts).
 *
 * One describe per primitive: a plain-text shape assertion, an alignment
 * assertion, and the edge that matters for that primitive. Color is stripped
 * (chalk.level = 0) so assertions run on plain text regardless of runner TTY.
 *
 * Structural analog: tests/commands/scan-finding-details.test.ts (imports a
 * renderer and asserts on its string output).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import {
  headerBox,
  sectionRule,
  keyValueRows,
  statGrid,
  proportionBar,
  statusGlyph,
  formatTokenCount,
  columnWidth,
  truncateCell,
  visibleWidth,
  DEFAULT_WIDTH,
} from '../../src/utils/render.js';

beforeAll(() => {
  chalk.level = 0;
});

describe('render module exports', () => {
  // @ana A001
  it('exports the six primitives as functions', () => {
    for (const fn of [headerBox, sectionRule, keyValueRows, statGrid, proportionBar, statusGlyph]) {
      expect(typeof fn).toBe('function');
    }
  });
});

describe('headerBox', () => {
  // @ana A004
  it('reproduces the 71-column width by default', () => {
    const lines = headerBox({ title: '  ana proof health', subtitleLeft: '  3 runs', subtitleRight: '2026-06-08' });
    expect(DEFAULT_WIDTH).toBe(71);
    for (const line of lines) {
      expect(visibleWidth(line)).toBe(71);
    }
  });

  // @ana A006
  it('renders square corners by default', () => {
    const lines = headerBox({ title: '  x', subtitleLeft: '  y' });
    expect(lines[0]!.startsWith('┌')).toBe(true);
    expect(lines[0]!.endsWith('┐')).toBe(true);
    expect(lines[lines.length - 1]!.startsWith('└')).toBe(true);
    expect(lines[lines.length - 1]!.endsWith('┘')).toBe(true);
  });

  // @ana A005
  it('renders rounded corners when requested', () => {
    const lines = headerBox({ title: '  x', subtitleLeft: '  y', corners: 'rounded' });
    expect(lines[0]!.startsWith('╭')).toBe(true);
    expect(lines[0]!.endsWith('╮')).toBe(true);
    expect(lines[lines.length - 1]!.startsWith('╰')).toBe(true);
    expect(lines[lines.length - 1]!.endsWith('╯')).toBe(true);
  });

  it('right-aligns the subtitle content and keeps width with a colored verdict glyph', () => {
    const lines = headerBox({
      title: `  ${chalk.red('✗')} FAIL · Some feature`,
      subtitleLeft: '  cli · 31 min',
      subtitleRight: '2026-06-05 22:40',
    });
    // Width preserved despite the (stripped) colored glyph.
    for (const line of lines) expect(visibleWidth(line)).toBe(71);
    // Subtitle right content sits at the right edge, just inside the border.
    expect(lines[2]!.replace(/│$/, '').trimEnd().endsWith('2026-06-05 22:40')).toBe(true);
  });

  it('emits three lines when no subtitle is given', () => {
    const lines = headerBox({ title: '  just a title' });
    expect(lines).toHaveLength(3);
  });
});

describe('sectionRule', () => {
  // @ana A002
  it('renders an inset rule carrying its label', () => {
    const rule = sectionRule('Contract');
    expect(rule).toContain('Contract');
    expect(rule.startsWith('── ')).toBe(true);
  });

  // @ana A003
  it('right-aligns the rollup within the width', () => {
    const rule = sectionRule('Contract', { rollup: '44/44 ✓' });
    expect(rule.trimEnd().endsWith('44/44 ✓')).toBe(true);
    // The rule fills toward the width: it is materially longer than label+rollup.
    expect(visibleWidth(rule)).toBeGreaterThan('── Contract  44/44 ✓'.length);
  });

  it('fills to the requested width when no rollup is present', () => {
    const rule = sectionRule('Timing', { width: 60 });
    expect(visibleWidth(rule)).toBe(60);
  });
});

describe('keyValueRows', () => {
  // @ana A007
  it('aligns the value column across rows of differing label width', () => {
    const rows = keyValueRows([
      { label: 'Total', value: '23 min' },
      { label: 'Think', value: '4 min' },
      { label: 'Build', value: '10 min' },
    ]);
    const valueStarts = rows.map((r) => r.indexOf(r.trimStart().split(/\s{2,}/).pop()!));
    // Every value begins at the same column.
    const firstValueCol = rows[0]!.lastIndexOf('23 min');
    expect(rows[1]!.lastIndexOf('4 min')).toBe(firstValueCol);
    expect(rows[2]!.lastIndexOf('10 min')).toBe(firstValueCol);
    expect(valueStarts.length).toBe(3);
  });

  it('honors a fixed label width', () => {
    const rows = keyValueRows([{ label: 'Total', value: 'x' }], { labelWidth: 12 });
    // 2 indent + 12 label col + 1 space => value at index 15.
    expect(rows[0]!.indexOf('x')).toBe(15);
  });
});

describe('statGrid', () => {
  // @ana A008
  it('right-aligns numeric columns so values share a right edge', () => {
    const lines = statGrid({
      columns: [{ align: 'left' }, { align: 'right' }],
      header: ['session', 'in'],
      rows: [
        ['plan', '12.1k'],
        ['build', '4.0k'],
      ],
    });
    // Right edges of the numeric column align across rows.
    const r1 = lines[1]!;
    const r2 = lines[2]!;
    expect(r1.length).toBe(r2.length);
    expect(r1.endsWith('12.1k')).toBe(true);
    expect(r2.endsWith(' 4.0k')).toBe(true);
  });

  // @ana A009
  it('truncates an over-width cell instead of shearing the grid', () => {
    const lines = statGrid({
      columns: [{ align: 'left', maxWidth: 10 }, { align: 'right' }],
      rows: [
        ['claude-opus-4-8[1m]', '99'],
        ['build', '1'],
      ],
    });
    expect(lines[0]).toContain('…');
    // Both rows are the same total width — the long label did not shear column 2.
    expect(lines[0]!.length).toBe(lines[1]!.length);
    expect(lines[0]!.endsWith('99')).toBe(true);
  });

  it('separates a footer row with a rule and right-aligns its value', () => {
    const lines = statGrid({
      columns: [{ align: 'left' }, { align: 'right' }],
      rows: [['plan', '$0.42']],
      footer: { label: 'TOTAL  4 sessions', value: '$4.12', trailing: '(table v3)' },
    });
    const rule = lines[1]!;
    const footer = lines[2]!;
    expect(rule.includes('─')).toBe(true);
    expect(footer).toContain('TOTAL');
    expect(footer).toContain('$4.12');
    expect(footer.trimEnd().endsWith('(table v3)')).toBe(true);
  });
});

describe('proportionBar', () => {
  // @ana A010
  it('degrades to ASCII when the ascii option is set', () => {
    const bar = proportionBar(1, 2, { ascii: true, width: 8 });
    expect(bar).not.toContain('█');
    expect(bar).toBe('####----');
  });

  it('renders block glyphs by default', () => {
    const bar = proportionBar(1, 2, { width: 8 });
    expect(bar).toBe('████░░░░');
  });

  it('handles the 0% and 100% bounds', () => {
    expect(proportionBar(0, 10, { width: 6 })).toBe('░░░░░░');
    expect(proportionBar(10, 10, { width: 6 })).toBe('██████');
    // Zero total never divides by zero — renders empty.
    expect(proportionBar(0, 0, { width: 4 })).toBe('░░░░');
  });
});

describe('statusGlyph', () => {
  // @ana A011
  it('returns the satisfied glyph for SATISFIED', () => {
    expect(statusGlyph('SATISFIED')).toContain('✓');
  });

  it('maps each status to its own glyph', () => {
    expect(statusGlyph('UNSATISFIED')).toContain('✗');
    expect(statusGlyph('DEVIATED')).toContain('⚠');
    expect(statusGlyph('UNVERIFIED')).toContain('?');
    expect(statusGlyph('UNCOVERED')).toContain('?');
    expect(statusGlyph('anything-else')).toContain('·');
  });

  it('is case-insensitive', () => {
    expect(statusGlyph('satisfied')).toContain('✓');
  });
});

describe('lifted helpers', () => {
  it('formatTokenCount abbreviates thousands and millions', () => {
    expect(formatTokenCount(880_000)).toBe('880.0k');
    expect(formatTokenCount(2_100_000)).toBe('2.1M');
    expect(formatTokenCount(412)).toBe('412');
  });

  it('columnWidth clamps to [min, max] with a gap', () => {
    expect(columnWidth(['ab', 'abcd'], (i) => i as string, 8)).toBe(8); // min wins
    expect(columnWidth(['x'.repeat(50)], (i) => i as string, 8, 40)).toBe(40); // max wins
    expect(columnWidth(['hello'], (i) => i as string, 2, 40, 2)).toBe(7); // 5 + gap
  });

  it('truncateCell adds an ellipsis only when over the max', () => {
    expect(truncateCell('short', 10)).toBe('short');
    expect(truncateCell('a-very-long-model-id', 8)).toBe('a-very-…');
  });
});
