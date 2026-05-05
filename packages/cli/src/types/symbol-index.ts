/**
 * Symbol index types.
 *
 * Extracted from commands/symbol-index.ts so check.ts (and any future
 * consumer) can import the types without a cross-command dependency.
 * These are pure interface definitions — no runtime dependency on
 * tree-sitter or file-system helpers.
 */

/** One symbol entry in the index */
export interface SymbolEntry {
  name: string;
  type: 'function' | 'class' | 'method' | 'variable';
  file: string;
  line: number;
  exported: boolean;
}

/** Full symbol index structure written to .ana/state/symbol-index.json */
export interface SymbolIndex {
  generated: string;
  files_parsed: number;
  symbols: SymbolEntry[];
}
