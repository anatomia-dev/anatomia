/**
 * ana setup index - Build symbol index for citation verification
 *
 * Creates .ana/state/symbol-index.json with:
 * - Function declarations and names
 * - Class declarations and names
 * - Method definitions
 * - Export names
 *
 * Used by `ana setup check` to verify that cited function/class names actually exist.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { glob } from 'glob';
import type { Tree, Node as TSNode } from 'web-tree-sitter';
import { findProjectRoot } from '../utils/validators.js';
import type { SymbolEntry, SymbolIndex } from '../types/symbol-index.js';

// Imported above for internal use. No re-export from this file — consumers
// (check.ts) now import directly from src/types/ to eliminate cross-command
// type imports.

/** Language type matching analyzer */
type Language = 'python' | 'typescript' | 'tsx' | 'javascript' | 'go';

/**
 * Detect language from file extension
 * @param filePath
 * @returns {Language | null} Detected language or null if unknown
 */
function detectLanguage(filePath: string): Language | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'py':
      return 'python';
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'go':
      return 'go';
    default:
      return null;
  }
}

/**
 * Extract symbols from TypeScript/JavaScript AST
 * @param tree
 * @param filePath
 * @param relativePath
 * @returns {SymbolEntry[]} Array of extracted symbols
 */
function extractTSSymbols(
  tree: Tree,
  filePath: string,
  relativePath: string
): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];
  const seen = new Set<string>();

  function visit(node: TSNode, inExport: boolean = false): void {
    const key = `${node.type}:${node.startPosition.row}:${node.startPosition.column}`;

    // Function declaration: function foo() {}
    if (node.type === 'function_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode && !seen.has(key)) {
        seen.add(key);
        symbols.push({
          name: nameNode.text,
          type: 'function',
          file: relativePath,
          line: node.startPosition.row + 1,
          exported: inExport,
        });
      }
    }

    // Class declaration: class Foo {}
    if (node.type === 'class_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode && !seen.has(key)) {
        seen.add(key);
        symbols.push({
          name: nameNode.text,
          type: 'class',
          file: relativePath,
          line: node.startPosition.row + 1,
          exported: inExport,
        });
      }
    }

    // Method definition: class Foo { bar() {} }
    if (node.type === 'method_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode && !seen.has(key)) {
        seen.add(key);
        symbols.push({
          name: nameNode.text,
          type: 'method',
          file: relativePath,
          line: node.startPosition.row + 1,
          exported: false, // Methods are not directly exported
        });
      }
    }

    // Arrow function in variable: const foo = () => {}
    if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.type === 'variable_declarator') {
          const nameNode = child.childForFieldName('name');
          const valueNode = child.childForFieldName('value');
          if (nameNode && valueNode && valueNode.type === 'arrow_function') {
            const varKey = `arrow:${child.startPosition.row}:${child.startPosition.column}`;
            if (!seen.has(varKey)) {
              seen.add(varKey);
              symbols.push({
                name: nameNode.text,
                type: 'function',
                file: relativePath,
                line: child.startPosition.row + 1,
                exported: inExport,
              });
            }
          }
        }
      }
    }

    // Export statement: export function foo() {} or export class Foo {}
    if (node.type === 'export_statement') {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) {
          visit(child, true);
        }
      }
      return; // Don't recurse again
    }

    // Recurse into children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        visit(child, inExport);
      }
    }
  }

  visit(tree.rootNode);
  return symbols;
}

/**
 * Extract symbols from Python AST
 * @param tree
 * @param filePath
 * @param relativePath
 * @returns {SymbolEntry[]} Array of extracted symbols
 */
function extractPythonSymbols(
  tree: Tree,
  filePath: string,
  relativePath: string
): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];
  const seen = new Set<string>();

  function visit(node: TSNode): void {
    const key = `${node.type}:${node.startPosition.row}:${node.startPosition.column}`;

    // Function definition: def foo():
    if (node.type === 'function_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode && !seen.has(key)) {
        seen.add(key);
        // In Python, functions not starting with _ are considered "exported"
        const isPublic = !nameNode.text.startsWith('_');
        symbols.push({
          name: nameNode.text,
          type: 'function',
          file: relativePath,
          line: node.startPosition.row + 1,
          exported: isPublic,
        });
      }
    }

    // Class definition: class Foo:
    if (node.type === 'class_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode && !seen.has(key)) {
        seen.add(key);
        const isPublic = !nameNode.text.startsWith('_');
        symbols.push({
          name: nameNode.text,
          type: 'class',
          file: relativePath,
          line: node.startPosition.row + 1,
          exported: isPublic,
        });
      }
    }

    // Recurse into children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        visit(child);
      }
    }
  }

  visit(tree.rootNode);
  return symbols;
}

/**
 * Extract symbols from Go AST
 * @param tree
 * @param filePath
 * @param relativePath
 * @returns {SymbolEntry[]} Array of extracted symbols
 */
function extractGoSymbols(
  tree: Tree,
  filePath: string,
  relativePath: string
): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];
  const seen = new Set<string>();

  function visit(node: TSNode): void {
    const key = `${node.type}:${node.startPosition.row}:${node.startPosition.column}`;

    // Function declaration: func foo() {}
    if (node.type === 'function_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode && !seen.has(key)) {
        seen.add(key);
        // In Go, exported functions start with uppercase
        const isExported = /^[A-Z]/.test(nameNode.text);
        symbols.push({
          name: nameNode.text,
          type: 'function',
          file: relativePath,
          line: node.startPosition.row + 1,
          exported: isExported,
        });
      }
    }

    // Method declaration: func (r *Receiver) foo() {}
    if (node.type === 'method_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode && !seen.has(key)) {
        seen.add(key);
        const isExported = /^[A-Z]/.test(nameNode.text);
        symbols.push({
          name: nameNode.text,
          type: 'method',
          file: relativePath,
          line: node.startPosition.row + 1,
          exported: isExported,
        });
      }
    }

    // Type declaration with type_spec: type Foo struct {}
    if (node.type === 'type_declaration') {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.type === 'type_spec') {
          const nameNode = child.childForFieldName('name');
          if (nameNode && !seen.has(key)) {
            seen.add(key);
            const isExported = /^[A-Z]/.test(nameNode.text);
            symbols.push({
              name: nameNode.text,
              type: 'class', // Treat struct/interface as class
              file: relativePath,
              line: child.startPosition.row + 1,
              exported: isExported,
            });
          }
        }
      }
    }

    // Recurse into children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        visit(child);
      }
    }
  }

  visit(tree.rootNode);
  return symbols;
}

/**
 * Build symbol index for the project
 *
 * @param projectRoot - Project root directory
 * @param outputDir - Directory to write symbol-index.json (defaults to .ana/state)
 * @returns SymbolIndex object
 */
export async function buildSymbolIndex(
  projectRoot: string,
  outputDir?: string
): Promise<SymbolIndex> {
  // Dynamic import to avoid top-level analyzer dependency
  const { ParserManager } = await import('../engine/index.js');

  const parserManager = ParserManager.getInstance();
  await parserManager.initialize();

  // Find all source files
  const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.go'];
  const ignorePatterns = [
    'node_modules/**',
    'dist/**',
    '.next/**',
    'coverage/**',
    '.ana/**',
    '.claude/**',
    '.codex/**',
    '.agents/**',
    '**/*.d.ts',
    '**/*.test.*',
    '**/*.spec.*',
    '**/test/**',
    '**/tests/**',
    '**/__tests__/**',
  ];

  const files: string[] = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: projectRoot,
      ignore: ignorePatterns,
      nodir: true,
      absolute: false,
    });
    files.push(...matches);
  }

  // Deduplicate
  const uniqueFiles = [...new Set(files)];

  const symbols: SymbolEntry[] = [];
  let filesParsed = 0;
  const errors: string[] = [];

  for (const relativePath of uniqueFiles) {
    const absolutePath = path.join(projectRoot, relativePath);
    const language = detectLanguage(relativePath);

    if (!language) {
      continue;
    }

    try {
      const content = await fs.readFile(absolutePath, 'utf-8');
      const parser = parserManager.getParser(language);
      const tree = parser.parse(content);

      if (!tree) {
        errors.push(`Failed to parse: ${relativePath}`);
        continue;
      }

      try {
        let fileSymbols: SymbolEntry[];

        if (language === 'python') {
          fileSymbols = extractPythonSymbols(tree, absolutePath, relativePath);
        } else if (language === 'go') {
          fileSymbols = extractGoSymbols(tree, absolutePath, relativePath);
        } else {
          // TypeScript, JavaScript, TSX
          fileSymbols = extractTSSymbols(tree, absolutePath, relativePath);
        }

        symbols.push(...fileSymbols);
        filesParsed++;
      } finally {
        // CRITICAL: Free WASM memory
        tree.delete();
      }
    } catch (error) {
      // Skip files that fail to parse
      if (error instanceof Error) {
        errors.push(`${relativePath}: ${error.message}`);
      }
    }
  }

  const index: SymbolIndex = {
    generated: new Date().toISOString(),
    files_parsed: filesParsed,
    symbols,
  };

  // Write to output directory
  const targetDir = outputDir || path.join(projectRoot, '.ana', 'state');
  await fs.mkdir(targetDir, { recursive: true });

  const indexPath = path.join(targetDir, 'symbol-index.json');
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');

  return index;
}

/**
 * Create the index command
 * @returns {Command} Commander command instance
 */
export function createIndexCommand(): Command {
  return new Command('index')
    .description('Build symbol index for citation verification')
    .action(async () => {
      const cwd = findProjectRoot();
      const anaPath = path.join(cwd, '.ana');
      const statePath = path.join(anaPath, 'state');

      // Check .ana/ exists
      try {
        await fs.access(anaPath);
      } catch {
        console.error(chalk.red('Error: .ana/ directory not found'));
        console.error(chalk.gray('Run `ana init` first.'));
        process.exit(1);
      }

      const spinner = ora('Building symbol index...').start();

      try {
        const startTime = performance.now();
        const index = await buildSymbolIndex(cwd, statePath);
        const elapsed = Math.round(performance.now() - startTime);

        spinner.succeed(
          `Symbol index built: ${index.symbols.length} symbols from ${index.files_parsed} files (${elapsed}ms)`
        );

        console.log(chalk.gray(`\nWritten to: .ana/state/symbol-index.json`));
      } catch (error) {
        spinner.fail('Failed to build symbol index');
        if (error instanceof Error) {
          console.error(chalk.red(error.message));
        }
        process.exit(1);
      }
    });
}
