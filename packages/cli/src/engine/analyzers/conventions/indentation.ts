/**
 * Indentation analyzer
 *
 * Detects spaces vs tabs and width via GCD algorithm.
 */

import type { IndentationConvention } from '../../types/conventions.js';
import { exists, readFile, joinPath } from '../../utils/file.js';

/**
 * Analyze indentation from file contents
 *
 * Only needs 10 files (sufficient for spaces vs tabs detection).
 * Checks config files FIRST (.editorconfig, .prettierrc) for confidence 1.0.
 *
 * @param fileContents - Array of file content strings (10 files)
 * @param rootPath - For config file detection
 * @returns Indentation convention
 *
 * @example 4-space indentation
 * ```typescript
 * {
 *   style: 'spaces',
 *   width: 4,
 *   confidence: 1.0
 * }
 * ```
 */
export async function analyzeIndentation(
  fileContents: string[],
  rootPath: string
): Promise<IndentationConvention> {
  // Check config files first (definitive answer, confidence 1.0)
  const configResult = await checkConfigFiles(rootPath);
  if (configResult) {
    return configResult;
  }

  // Fallback: Analyze files
  let tabLines = 0;
  let spaceLines = 0;
  const indentWidths: number[] = [];

  for (const content of fileContents) {
    const lines = content.split('\n');

    for (const line of lines) {
      // Skip empty lines
      if (line.trim() === '') continue;

      // Check leading whitespace
      const leadingWS = line.match(/^(\s+)/)?.[1];
      if (!leadingWS) continue;  // No indentation

      if (leadingWS.includes('\t')) {
        tabLines++;
      } else {
        spaceLines++;
        indentWidths.push(leadingWS.length);
      }
    }
  }

  const total = tabLines + spaceLines;

  if (total === 0) {
    // No indented lines found - default
    return {
      style: 'spaces',
      width: 4,
      confidence: 0.5,
    };
  }

  // Calculate percentages (0.7 threshold like other conventions)
  const tabPercent = tabLines / total;
  const spacePercent = spaceLines / total;

  let style: 'spaces' | 'tabs' | 'mixed';
  let confidence: number;

  if (tabPercent >= 0.7) {
    style = 'tabs';
    confidence = tabPercent;
  } else if (spacePercent >= 0.7) {
    style = 'spaces';
    confidence = spacePercent;
  } else {
    style = 'mixed';
    confidence = Math.max(tabPercent, spacePercent);
  }

  // Detect width if spaces
  let width: number | undefined;
  if (style === 'spaces' && indentWidths.length > 0) {
    width = detectIndentWidth(indentWidths);
  }

  return { style, width, confidence };
}

/**
 * Detect indent width using GCD algorithm
 *
 * Finds greatest common divisor of all indent widths (2, 4, 6, 8 → GCD 2).
 * Common widths: 2, 4, 8.
 *
 * @param widths - Array of leading space counts
 * @returns Base indent width
 *
 * @example
 * ```typescript
 * detectIndentWidth([2, 4, 6, 8])  // → 2 (GCD)
 * detectIndentWidth([4, 8, 12])    // → 4 (GCD)
 * detectIndentWidth([2, 2, 2])     // → 2
 * ```
 */
function detectIndentWidth(widths: number[]): number {
  if (widths.length === 0) {
    return 4;  // Default if no data
  }

  // GCD algorithm (Euclidean)
  const gcd = (a: number, b: number): number => {
    return b === 0 ? a : gcd(b, a % b);
  };

  // Find GCD of all widths
  const result = widths.reduce((acc, w) => gcd(acc, w), widths[0]!);

  // Return common widths (2, 4, 8) or default to 4
  if (result === 2 || result === 4 || result === 8) {
    return result;
  }

  if (result === 1) {
    return 2;  // 1-space unlikely - probably 2-space with odd indents
  }

  return 4;  // Default width
}

/**
 * Check config files for indentation settings
 *
 * Config files are definitive (confidence 1.0).
 * Checks .editorconfig then .prettierrc.json.
 *
 * @param rootPath - Project root
 * @returns Indentation from config or null if not found
 */
async function checkConfigFiles(
  rootPath: string
): Promise<IndentationConvention | null> {
  // Check .editorconfig
  const editorConfig = await readEditorConfig(rootPath);
  if (editorConfig) {
    return editorConfig;
  }

  // Check .prettierrc.json or .prettierrc
  const prettier = await readPrettierConfig(rootPath);
  if (prettier) {
    return prettier;
  }

  return null;  // No config found
}

/**
 * Parse .editorconfig file
 *
 * INI-style format with [*] section.
 *
 * @param rootPath
 * @example
 * ```ini
 * [*]
 * indent_style = space
 * indent_size = 2
 * ```
 */
async function readEditorConfig(
  rootPath: string
): Promise<IndentationConvention | null> {
  const configPath = joinPath(rootPath, '.editorconfig');

  if (!(await exists(configPath))) {
    return null;
  }

  try {
    const content = await readFile(configPath);

    // Find [*] section (applies to all files)
    const allFilesSection = content.match(/\[\*\]([\s\S]*?)(?=\[|$)/);
    if (!allFilesSection || !allFilesSection[1]) return null;

    const sectionContent = allFilesSection[1];

    // Parse indent_style (space or tab)
    const styleMatch = sectionContent.match(/indent_style\s*=\s*(\w+)/);
    const style = styleMatch?.[1];

    // Parse indent_size (number)
    const sizeMatch = sectionContent.match(/indent_size\s*=\s*(\d+)/);
    const size = sizeMatch?.[1] ? parseInt(sizeMatch[1]) : undefined;

    if (style) {
      return {
        style: style === 'tab' ? 'tabs' : 'spaces',
        width: style === 'space' ? size : undefined,
        confidence: 1.0,  // Config is definitive
      };
    }

    return null;
  } catch (_error) {
    return null;  // Parse error - graceful
  }
}

/**
 * Parse .prettierrc.json or .prettierrc
 *
 * JSON format with useTabs and tabWidth.
 *
 * @param rootPath
 * @example
 * ```json
 * {
 *   "tabWidth": 2,
 *   "useTabs": false
 * }
 * ```
 */
async function readPrettierConfig(
  rootPath: string
): Promise<IndentationConvention | null> {
  // Try .prettierrc.json first
  let configPath = joinPath(rootPath, '.prettierrc.json');

  if (!(await exists(configPath))) {
    // Try .prettierrc
    configPath = joinPath(rootPath, '.prettierrc');
    if (!(await exists(configPath))) {
      return null;
    }
  }

  try {
    const content = await readFile(configPath);
    const config = JSON.parse(content);

    if (config.useTabs !== undefined) {
      return {
        style: config.useTabs ? 'tabs' : 'spaces',
        width: config.useTabs ? undefined : (config.tabWidth || 2),
        confidence: 1.0,  // Config is definitive
      };
    }

    return null;
  } catch (_error) {
    return null;  // JSON parse error - graceful
  }
}
