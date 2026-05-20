/**
 * Import convention analyzer
 *
 * Classifies imports as absolute, relative, or external.
 */

import type { ImportInfo } from '../../types/parsed.js';
import type { ImportConvention } from '../../types/conventions.js';
import { exists, readFile, joinPath } from '../../utils/file.js';

/**
 * Classify Python import statement
 *
 * @param module - Import module name (from ImportInfo)
 * @param projectName - Project name from pyproject.toml (optional)
 * @returns Classification: absolute (from src./project), relative (from .), external (from fastapi)
 *
 * @example
 * ```typescript
 * classifyPythonImport('.models', null)              // → 'relative' (starts with dot)
 * classifyPythonImport('src.models', null)           // → 'absolute' (starts with src)
 * classifyPythonImport('myproject.utils', 'myproject') // → 'absolute' (matches project name)
 * classifyPythonImport('fastapi', null)              // → 'external' (third-party)
 * ```
 */
export function classifyPythonImport(
  module: string,
  projectName?: string | null
): 'absolute' | 'relative' | 'external' {
  // Relative imports: start with . or ..
  if (module.startsWith('.')) {
    return 'relative';
  }

  // Absolute internal: starts with 'src' or matches project name
  const firstPart = module.split('.')[0];

  if (firstPart === 'src') {
    return 'absolute';
  }

  if (projectName && firstPart === projectName.replace(/-/g, '_')) {
    // Normalize: my-project → my_project (Python module naming)
    return 'absolute';
  }

  // Everything else: stdlib or third-party (external)
  return 'external';
}

/**
 * Classify TypeScript/JavaScript import path
 *
 * @param path - Import path from import statement
 * @param aliases - Path aliases from tsconfig.json (e.g., ['@/*'])
 * @returns Classification
 *
 * @example
 * ```typescript
 * classifyTSImport('../utils/helper', [])        // → 'relative'
 * classifyTSImport('@/models/user', ['@/*'])     // → 'absolute'
 * classifyTSImport('src/utils', [])              // → 'absolute'
 * classifyTSImport('express', [])                // → 'external'
 * classifyTSImport('@nestjs/common', ['@/*'])    // → 'external' (@scope/package)
 * ```
 */
export function classifyTSImport(
  path: string,
  aliases?: string[]
): 'absolute' | 'relative' | 'external' {
  // Relative: starts with ./ or ../
  if (path.startsWith('./') || path.startsWith('../')) {
    return 'relative';
  }

  // Check for scoped packages (@scope/package are external, not internal @/)
  if (path.startsWith('@') && path.includes('/')) {
    const scopePart = path.split('/')[0];
    // @/ or @alias (single char after @) = internal alias
    // @scope (word after @) = npm scoped package = external
    if (scopePart && (scopePart === '@' || scopePart.length === 2)) {
      // Check if matches alias pattern
      if (aliases?.some(alias => path.startsWith(alias.replace('/*', '')))) {
        return 'absolute';
      }
    }
  }

  // Absolute internal: starts with src/
  if (path.startsWith('src/')) {
    return 'absolute';
  }

  // Check configured aliases (if provided)
  if (aliases?.length) {
    const normalizedPath = path + '/';  // Add trailing / for matching
    if (aliases.some(alias => normalizedPath.startsWith(alias.replace('*', '')))) {
      return 'absolute';
    }
  }

  // Everything else: node_modules (external)
  return 'external';
}

/**
 * Classify Go import path
 *
 * @param path - Import path from import statement
 * @param modulePath - Module path from go.mod (e.g., 'github.com/user/project')
 * @returns Classification: internal (project module) or external (stdlib/third-party)
 *
 * @example
 * ```typescript
 * classifyGoImport('github.com/user/project/pkg/models', 'github.com/user/project')     // → 'internal'
 * classifyGoImport('github.com/user/project/v2/pkg', 'github.com/user/project/v2')     // → 'internal'
 * classifyGoImport('fmt', 'github.com/user/project')                                    // → 'external' (stdlib)
 * classifyGoImport('github.com/gin-gonic/gin', 'github.com/user/project')              // → 'external'
 * ```
 */
export function classifyGoImport(
  path: string,
  modulePath?: string | null
): 'internal' | 'external' {
  if (!modulePath) {
    // Can't determine without module path - default to external
    return 'external';
  }

  // Internal: starts with project module path
  if (path.startsWith(modulePath)) {
    return 'internal';
  }

  // External: stdlib or third-party
  return 'external';
}

/**
 * Analyze import convention from parsed imports
 *
 * Statistical analysis (majority voting, 0.7 threshold).
 *
 * @param imports - Imports from analysis.parsed.files
 * @param projectType - Language for classification function selection
 * @param projectRoot - Project name/root from config (optional)
 * @param aliases - Path aliases from tsconfig (optional)
 * @returns Import convention with style, confidence, distribution
 *
 * @example Absolute majority
 * ```typescript
 * {
 *   style: 'absolute',
 *   confidence: 0.85,
 *   distribution: { absolute: 0.85, relative: 0.15 }
 * }
 * ```
 */
export function analyzeImportConvention(
  imports: ImportInfo[],
  projectType: string,
  projectRoot?: string | null,
  aliases?: string[]
): ImportConvention {
  let absoluteCount = 0;
  let relativeCount = 0;

  for (const imp of imports) {
    let classification: 'absolute' | 'relative' | 'external';

    // Classify based on language
    if (projectType === 'python') {
      classification = classifyPythonImport(imp.module, projectRoot);
    } else if (projectType === 'node') {
      classification = classifyTSImport(imp.module, aliases);
    } else if (projectType === 'go') {
      const goClassification = classifyGoImport(imp.module, projectRoot);
      classification = goClassification === 'internal' ? 'absolute' : 'external';
    } else {
      classification = 'external';  // Unknown language - skip
    }

    // Count internal imports only (external are library imports, not project convention)
    if (classification === 'absolute') {
      absoluteCount++;
    } else if (classification === 'relative') {
      relativeCount++;
    }
    // Ignore external
  }

  const total = absoluteCount + relativeCount;

  if (total === 0) {
    // No internal imports found (library project or all external imports)
    return {
      style: 'mixed',
      confidence: 0,
      distribution: { absolute: 0, relative: 0 },
      aliasPattern: null,
    };
  }

  // Calculate percentages
  const absolutePercent = absoluteCount / total;
  const relativePercent = relativeCount / total;

  // Determine style using 0.7 threshold (matches naming convention)
  let style: 'absolute' | 'relative' | 'mixed';
  let confidence: number;

  if (absolutePercent >= 0.7) {
    style = 'absolute';
    confidence = absolutePercent;
  } else if (relativePercent >= 0.7) {
    style = 'relative';
    confidence = relativePercent;
  } else {
    style = 'mixed';
    confidence = Math.max(absolutePercent, relativePercent);
  }

  return {
    style,
    confidence,
    distribution: {
      absolute: absolutePercent,
      relative: relativePercent,
    },
    aliasPattern: aliases && aliases.length > 0 ? (aliases[0] ?? '').replace('*', '') : null,
  };
}

/**
 * Detect project root/name from config files
 *
 * Tries 3 sources in order:
 * 1. pyproject.toml [project] name or [tool.poetry] name
 * 2. tsconfig.json paths (extracts alias like @/)
 * 3. go.mod module directive
 *
 * @param rootPath - Project root directory
 * @param projectType - Language type
 * @returns Project name/root or null if not found
 *
 * @example
 * ```typescript
 * await detectProjectRoot('/path/to/project', 'python')
 * // Parses pyproject.toml → returns 'myproject'
 * ```
 */
export async function detectProjectRoot(
  rootPath: string,
  projectType: string
): Promise<string | null> {
  if (projectType === 'python') {
    return await parsePyprojectName(rootPath);
  } else if (projectType === 'node') {
    // Aliases are a separate concern — the convention orchestrator calls
    // parseTsconfigAlias directly. This function is for project name/root.
    return null;
  } else if (projectType === 'go') {
    return await parseGoModule(rootPath);
  }

  return null;
}

/**
 * Parse project name from pyproject.toml
 *
 * Checks [project] name (PEP 621) then [tool.poetry] name (Poetry).
 *
 * @param rootPath - Project root
 * @returns Project name (normalized to Python module name) or null
 */
async function parsePyprojectName(rootPath: string): Promise<string | null> {
  const pyprojectPath = joinPath(rootPath, 'pyproject.toml');

  if (!(await exists(pyprojectPath))) {
    return null;
  }

  try {
    const content = await readFile(pyprojectPath);

    // Try PEP 621 format: [project] name = "my-project"
    const pep621Match = content.match(/^\[project\]\s*\n[\s\S]*?name\s*=\s*["']([^"']+)["']/m);
    if (pep621Match && pep621Match[1]) {
      // Normalize: my-project → my_project (Python module naming)
      return pep621Match[1].replace(/-/g, '_');
    }

    // Try Poetry format: [tool.poetry] name = "my-project"
    const poetryMatch = content.match(/^\[tool\.poetry\]\s*\n[\s\S]*?name\s*=\s*["']([^"']+)["']/m);
    if (poetryMatch && poetryMatch[1]) {
      return poetryMatch[1].replace(/-/g, '_');
    }

    return null;  // No name found
  } catch (_error) {
    return null;  // Parse failed - graceful degradation
  }
}

/**
 * Extract all tsconfig path aliases from census tsconfig entries.
 * Falls back to reading tsconfig.json from rootPath if no census entries provided.
 *
 * A tsconfig paths key is considered an alias if it ends with `/*` AND is NOT
 * a scoped npm package (where the `@scope` portion is longer than 2 chars).
 * This catches `@/*`, `@/lib/*`, `~/lib/*`, `#imports/*`, `components/*`
 * while excluding `@nestjs/*`, `@types/*`.
 *
 * @param rootPath - Project root
 * @param tsconfigEntries - Census tsconfig entries (optional)
 * @returns Array of alias prefixes (e.g., ['@/', '@/lib/', '~/']) or empty array
 */
export async function parseTsconfigAlias(
  rootPath: string,
  tsconfigEntries?: import('../../types/census.js').TsconfigEntry[],
): Promise<string[]> {
  // Use census entries if available
  let paths: Record<string, string[]> | null = null;

  if (tsconfigEntries && tsconfigEntries.length > 0) {
    // Use the first tsconfig with paths (typically primary source root)
    const withPaths = tsconfigEntries.find(t => t.paths !== null);
    paths = withPaths?.paths ?? null;
  } else {
    // Fallback: read from filesystem using get-tsconfig (handles JSONC + extends)
    try {
      const { getTsconfig } = await import('get-tsconfig');
      const result = getTsconfig(rootPath);
      paths = (result?.config.compilerOptions?.paths as Record<string, string[]>) ?? null;
    } catch {
      return [];
    }
  }

  if (!paths) return [];

  // Filter for path aliases: ends with /* and is not a scoped npm package
  const aliasKeys = Object.keys(paths);
  const aliases = aliasKeys.filter(key => {
    if (!key.endsWith('/*')) return false;
    // Exclude scoped npm packages: @scope/* where scope.length > 2
    if (key.startsWith('@')) {
      const scope = key.split('/')[0];
      if (scope && scope.length > 2) return false; // @nestjs, @types, etc.
    }
    return true;
  });

  return aliases.map(a => a.replace('/*', '/'));
}

/**
 * Parse module path from go.mod
 *
 * First line: module github.com/user/project
 *
 * @param rootPath - Project root
 * @returns Module path or null
 */
async function parseGoModule(rootPath: string): Promise<string | null> {
  const goModPath = joinPath(rootPath, 'go.mod');

  if (!(await exists(goModPath))) {
    return null;
  }

  try {
    const content = await readFile(goModPath);

    // First line: module <path>
    const match = content.match(/^module\s+([^\s\n]+)/m);
    if (match && match[1]) {
      return match[1];  // Returns with version suffix if present (/v2, /v3)
    }

    return null;
  } catch (_error) {
    return null;
  }
}
