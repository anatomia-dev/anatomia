/**
 * Shared terminal-render vocabulary for Anatomia CLI cards.
 *
 * A small set of PURE primitives (data in → `string` / `string[]` out) that the
 * proof, scan, and health cards converge on instead of each re-deriving box,
 * section, grid, and glyph logic. Every primitive:
 *
 * - takes an explicit `width` (default {@link DEFAULT_WIDTH}) rather than reading
 *   `process.stdout.columns` (which is `undefined` when piped — pure/pipe-safe by
 *   construction);
 * - emits color via `chalk`, so chalk's own `NO_COLOR`/non-TTY auto-stripping
 *   governs ANSI and NO layout depends on ANSI being present;
 * - computes alignment widths on the PLAIN (uncolored) text and applies color
 *   after padding, via {@link visibleWidth}, so embedded ANSI never shears a
 *   column (the single most likely alignment bug — see scan.ts's explicit
 *   visible-width workaround).
 *
 * This module lives in `utils/` and may use `chalk`; it must never be imported
 * into `src/engine/` (engine stays presentation-free).
 */

import chalk from 'chalk';

/** The default card inner-width convention (matches the legacy 71-wide box). */
export const DEFAULT_WIDTH = 71;

/**
 * Box-drawing characters for terminal output (square corners).
 *
 * Compatible across iTerm, Terminal.app, VS Code terminal, and Windows Terminal.
 * Single-width glyphs only.
 */
export const BOX = {
  horizontal: '─', // ─
  vertical: '│', // │
  topLeft: '┌', // ┌
  topRight: '┐', // ┐
  bottomLeft: '└', // └
  bottomRight: '┘', // ┘
};

/** Square corner glyphs (the default — keeps existing cards byte-identical). */
const SQUARE_CORNERS = { tl: '┌', tr: '┐', bl: '└', br: '┘' };
/** Rounded corner glyphs (opted into by the proof card; the eventual end state). */
const ROUNDED_CORNERS = { tl: '╭', tr: '╮', bl: '╰', br: '╯' };

// Matches a CSI SGR escape (color/style), e.g. `\x1b[31m`. Used to measure the
// VISIBLE width of a possibly-colored string so padding stays accurate.
const ANSI_SGR = /\x1b\[[0-9;]*m/g;

/**
 * Measure the visible (printable) width of a string, ignoring ANSI SGR escapes.
 *
 * The width primitives pad against — `chalk`-colored text inflates `.length`
 * with non-printing escape bytes, so `padEnd`/`padStart` on a colored string
 * mis-aligns. Measuring visible width (and padding with plain spaces) is the fix.
 *
 * @param s - The string to measure (may contain ANSI color escapes)
 * @returns The number of visible character cells the string occupies
 */
export function visibleWidth(s: string): number {
  return s.replace(ANSI_SGR, '').length;
}

/**
 * Pad a (possibly colored) cell to a target visible width on one side.
 *
 * Padding is computed on visible width and applied as plain spaces, so embedded
 * ANSI never throws the alignment off. A cell already wider than `width` is
 * returned unchanged.
 *
 * @param cell - The cell content (may contain ANSI color escapes)
 * @param width - Target visible width
 * @param align - `'right'` pads on the left (right-aligns); `'left'` pads on the right
 * @returns The padded cell
 */
function padVisible(cell: string, width: number, align: 'left' | 'right'): string {
  const pad = Math.max(0, width - visibleWidth(cell));
  return align === 'right' ? ' '.repeat(pad) + cell : cell + ' '.repeat(pad);
}

/**
 * Truncate PLAIN text to a maximum visible width, ending with `…` when cut.
 *
 * Intended for alignment-critical cells that must never exceed their column
 * (model ids, labels). Cells passed here should be uncolored — truncation
 * operates on raw characters.
 *
 * @param text - The plain text to truncate
 * @param max - Maximum visible width
 * @returns The original text, or a truncated form ending in `…`
 */
export function truncateCell(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max === 1) return '…';
  return text.slice(0, max - 1) + '…';
}

/**
 * Compute a dynamic column width from data.
 *
 * Scans items via `accessor`, finds the longest visible value, adds a `gap` for
 * spacing, and clamps to `[minWidth, maxWidth]`. Values exceeding `maxWidth`
 * should be truncated with `…` at display time (see {@link truncateCell}).
 *
 * @param items - Array of items to scan
 * @param accessor - Function to extract the visible string from each item
 * @param minWidth - Minimum column width
 * @param maxWidth - Maximum column width (default 40)
 * @param gap - Number of padding characters after the longest value (default 2)
 * @returns Clamped column width
 */
export function columnWidth(
  items: readonly unknown[],
  accessor: (item: unknown) => string,
  minWidth: number,
  maxWidth = 40,
  gap = 2
): number {
  let longest = 0;
  for (const item of items) {
    const len = accessor(item).length;
    if (len > longest) longest = len;
  }
  return Math.min(maxWidth, Math.max(minWidth, longest + gap));
}

/**
 * Format a token count compactly (e.g. `48211` → `48.2k`, `1442301` → `1.4M`).
 *
 * @param n - The token count
 * @returns A short human-readable string
 */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * Map an assertion/verification status to its semantic, colored status glyph.
 *
 * Every colored glyph is single-width and is paired with a word/count by its
 * callers, so meaning survives `NO_COLOR` (the color is redundant, not load-bearing).
 *
 * @param status - Status string (case-insensitive): SATISFIED, UNSATISFIED,
 *   DEVIATED, UNVERIFIED, UNCOVERED, or any other value
 * @returns A colored single-character glyph
 */
export function statusGlyph(status: string): string {
  switch (status.toUpperCase()) {
    case 'SATISFIED':
      return chalk.green('✓'); // ✓
    case 'UNSATISFIED':
      return chalk.red('✗'); // ✗
    case 'DEVIATED':
      return chalk.yellow('⚠'); // ⚠
    case 'UNVERIFIED':
      return chalk.gray('?');
    case 'UNCOVERED':
      return chalk.gray('?');
    default:
      return chalk.gray('·'); // ·
  }
}

/** Options for {@link headerBox}. */
export interface HeaderBoxOptions {
  /** Line-1 content, including any desired leading indent (rendered bold). */
  title: string;
  /** Line-2 left content, including any desired leading indent. */
  subtitleLeft?: string;
  /** Line-2 right-aligned content (e.g. a timestamp). */
  subtitleRight?: string;
  /** Outer box width including borders (default {@link DEFAULT_WIDTH}). */
  width?: number;
  /**
   * Corner style. `'square'` (DEFAULT) uses `┌┐└┘` and keeps the health card
   * byte-identical; `'rounded'` uses `╭╮╰╯`. The end state is rounded everywhere —
   * square is a transition default while other cards migrate, not a permanent
   * divergence.
   */
  corners?: 'square' | 'rounded';
  /** Minimum gap between the subtitle's left and right content (default 2). */
  minGap?: number;
}

/**
 * Render the one ceremonial header box: a bordered title line plus an optional
 * subtitle line carrying left content and right-aligned content.
 *
 * Called with defaults it reproduces the legacy 71-wide box exactly (so health
 * stays byte-identical). The proof card opts into `corners: 'rounded'`.
 *
 * @param opts - Header box options (see {@link HeaderBoxOptions})
 * @returns Four lines (top border, title, subtitle, bottom border) — or three
 *   (top, title, bottom) when `subtitleLeft` is omitted
 */
export function headerBox(opts: HeaderBoxOptions): string[] {
  const width = opts.width ?? DEFAULT_WIDTH;
  const inner = width - 2;
  const minGap = opts.minGap ?? 2;
  const corners = opts.corners === 'rounded' ? ROUNDED_CORNERS : SQUARE_CORNERS;
  const accent = chalk.cyan;
  const h = BOX.horizontal;
  const v = BOX.vertical;

  const lines: string[] = [];
  lines.push(accent(corners.tl + h.repeat(inner) + corners.tr));

  // Title line — bold; padded on visible width so an embedded colored glyph
  // (e.g. a red ✗ verdict) does not shear the right border.
  const titlePad = Math.max(0, inner - visibleWidth(opts.title));
  lines.push(accent(v) + chalk.bold(opts.title + ' '.repeat(titlePad)) + accent(v));

  if (opts.subtitleLeft !== undefined) {
    const left = opts.subtitleLeft;
    const right = opts.subtitleRight ?? '';
    const gap = Math.max(minGap, inner - visibleWidth(left) - visibleWidth(right));
    const composed = left + ' '.repeat(gap) + right;
    const subPad = Math.max(0, inner - visibleWidth(composed));
    lines.push(accent(v) + composed + ' '.repeat(subPad) + accent(v));
  }

  lines.push(accent(corners.bl + h.repeat(inner) + corners.br));
  return lines;
}

/** Options for {@link sectionRule}. */
export interface SectionRuleOptions {
  /** Total visible width to fill (default {@link DEFAULT_WIDTH}). */
  width?: number;
  /** Optional right-aligned roll-up (e.g. `44/44 ✓`); may be colored. */
  rollup?: string;
}

/**
 * Render an inset horizontal rule that carries a label and an optional
 * right-aligned roll-up: `── Contract ───────────── 44/44 ✓`.
 *
 * Replaces every `bold('  Label')` + `gray('  ─'.repeat(n))` section-header pair.
 * The dash fill is computed on visible widths, so a colored roll-up stays aligned.
 *
 * @param label - The section label (rendered bold)
 * @param opts - Section-rule options (see {@link SectionRuleOptions})
 * @returns A single rule line
 */
export function sectionRule(label: string, opts?: SectionRuleOptions): string {
  const width = opts?.width ?? DEFAULT_WIDTH;
  const rollup = opts?.rollup ?? '';
  const leadPlain = `── ${label} `; // "── Label "
  // A present roll-up reserves its visible width plus one leading space.
  const rollupReserve = rollup ? visibleWidth(rollup) + 1 : 0;
  const dashCount = Math.max(1, width - leadPlain.length - rollupReserve);
  const dashes = '─'.repeat(dashCount);
  const lead = chalk.gray('── ') + chalk.bold(label) + ' ' + chalk.gray(dashes);
  return rollup ? `${lead} ${rollup}` : lead;
}

/** One labelled row for {@link keyValueRows}. */
export interface KeyValueRow {
  /** The (gray) label shown in the aligned left column. */
  label: string;
  /** The value shown after the label column. */
  value: string;
}

/** Options for {@link keyValueRows}. */
export interface KeyValueRowsOptions {
  /** Fixed label-column width; computed from the rows when omitted. */
  labelWidth?: number;
  /** Leading indent in spaces (default 2). */
  indent?: number;
  /** Extra spaces appended to the computed label width when none is given (default 1). */
  gap?: number;
}

/**
 * Render aligned label/value rows: a gray label column padded to a common width
 * followed by the value.
 *
 * @param rows - The label/value rows to render
 * @param opts - Row options (see {@link KeyValueRowsOptions})
 * @returns One string per row
 */
export function keyValueRows(rows: KeyValueRow[], opts?: KeyValueRowsOptions): string[] {
  const indent = ' '.repeat(opts?.indent ?? 2);
  const gap = opts?.gap ?? 1;
  const computed = rows.reduce((m, r) => Math.max(m, r.label.length), 0) + gap;
  const labelWidth = opts?.labelWidth ?? computed;
  return rows.map((r) => `${indent}${chalk.gray(r.label.padEnd(labelWidth))} ${r.value}`);
}

/** One column definition for {@link statGrid}. */
export interface StatGridColumn {
  /** Column alignment — `'right'` for numerics, `'left'` (default) for text. */
  align?: 'left' | 'right';
  /** Minimum column width. */
  minWidth?: number;
  /** Maximum column width; over-long cells are truncated with `…` (plain cells only). */
  maxWidth?: number;
}

/** Footer row for {@link statGrid}, rendered under a separating rule. */
export interface StatGridFooter {
  /** Free-text label from the left edge (may overflow the first column). */
  label: string;
  /** Value right-aligned to the grid's right edge (e.g. a `TOTAL` cost). */
  value?: string;
  /** Trailing text appended after `value` (e.g. a price-table version). */
  trailing?: string;
}

/** Options for {@link statGrid}. */
export interface StatGridOptions {
  /** Per-column definitions (length sets the column count). */
  columns: StatGridColumn[];
  /** Optional header row of column titles. */
  header?: string[];
  /** Data rows; each is an array of cell strings (cells may be colored). */
  rows: string[][];
  /** Optional footer row, separated from the body by a rule. */
  footer?: StatGridFooter;
  /** Leading indent in spaces (default 2). */
  indent?: number;
  /** Spaces between columns (default 2). */
  gap?: number;
}

/**
 * Render a borderless, aligned stat grid.
 *
 * Column widths are computed from the header and data cells (clamped to each
 * column's `[minWidth, maxWidth]`); cells exceeding `maxWidth` are truncated so
 * one long value never shears the grid. Numeric columns set `align: 'right'`.
 * An optional footer row is separated from the body by a horizontal rule and its
 * `value` is right-aligned to the grid's right edge.
 *
 * @param opts - Grid options (see {@link StatGridOptions})
 * @returns One string per rendered line (header, rows, optional rule + footer)
 */
export function statGrid(opts: StatGridOptions): string[] {
  const indent = ' '.repeat(opts.indent ?? 2);
  const gap = opts.gap ?? 2;
  const ncols = opts.columns.length;

  // Truncate over-width cells up front so width computation sees final content.
  const clip = (cells: string[]): string[] =>
    cells.map((cell, c) => {
      const max = opts.columns[c]?.maxWidth;
      return max != null ? truncateCell(cell, max) : cell;
    });

  const header = opts.header ? clip(opts.header) : undefined;
  const rows = opts.rows.map(clip);

  // Column widths: longest visible cell, clamped to [minWidth, maxWidth].
  const widths: number[] = [];
  for (let c = 0; c < ncols; c++) {
    let w = 0;
    if (header && header[c] != null) w = Math.max(w, visibleWidth(header[c]!));
    for (const row of rows) {
      if (row[c] != null) w = Math.max(w, visibleWidth(row[c]!));
    }
    const col = opts.columns[c]!;
    if (col.minWidth != null) w = Math.max(w, col.minWidth);
    if (col.maxWidth != null) w = Math.min(w, col.maxWidth);
    widths[c] = w;
  }

  const renderRow = (cells: string[]): string => {
    const parts: string[] = [];
    for (let c = 0; c < ncols; c++) {
      const cell = cells[c] ?? '';
      parts.push(padVisible(cell, widths[c]!, opts.columns[c]?.align ?? 'left'));
    }
    return indent + parts.join(' '.repeat(gap)).replace(/\s+$/, '');
  };

  const lines: string[] = [];
  if (header) lines.push(renderRow(header));
  for (const row of rows) lines.push(renderRow(row));

  if (opts.footer) {
    const contentWidth = widths.reduce((a, b) => a + b, 0) + gap * (ncols - 1);
    lines.push(indent + chalk.gray('─'.repeat(Math.max(1, contentWidth))));
    const { label, value = '', trailing } = opts.footer;
    const pad = Math.max(1, contentWidth - visibleWidth(label) - visibleWidth(value));
    let footer = indent + label + ' '.repeat(pad) + value;
    if (trailing) footer += '  ' + trailing;
    lines.push(footer);
  }

  return lines;
}

/** Options for {@link proportionBar}. */
export interface ProportionBarOptions {
  /** Total glyph width of the bar (default 64). */
  width?: number;
  /** Degrade block glyphs (`█`/`░`) to ASCII (`#`/`-`) for low-fidelity fonts. */
  ascii?: boolean;
  /** Color applied to the filled run (default: none). */
  filledColor?: (s: string) => string;
  /** Color applied to the empty run (default: none). */
  emptyColor?: (s: string) => string;
}

/**
 * Render a filled/empty ratio bar, e.g. `████████░░░░`.
 *
 * Must be used on its OWN line — block glyphs render wider in some fonts and
 * would shear an aligned column. The `ascii` option degrades to single-width
 * `#`/`-` for low-fidelity terminals.
 *
 * @param filled - The filled quantity (clamped to `[0, total]`)
 * @param total - The total quantity; a non-positive total renders an empty bar
 * @param opts - Bar options (see {@link ProportionBarOptions})
 * @returns A single bar string
 */
export function proportionBar(
  filled: number,
  total: number,
  opts?: ProportionBarOptions
): string {
  const width = opts?.width ?? 64;
  const ratio = total > 0 ? Math.min(1, Math.max(0, filled / total)) : 0;
  const fillN = Math.round(ratio * width);
  const emptyN = width - fillN;
  const fillCh = opts?.ascii ? '#' : '█'; // █
  const emptyCh = opts?.ascii ? '-' : '░'; // ░
  const fc = opts?.filledColor ?? ((s) => s);
  const ec = opts?.emptyColor ?? ((s) => s);
  return fc(fillCh.repeat(fillN)) + ec(emptyCh.repeat(emptyN));
}
