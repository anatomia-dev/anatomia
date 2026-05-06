/**
 * Entry point detection.
 *
 * Framework-aware priority-ordered entry point lookup. First match wins.
 */

import { glob } from 'glob';
import { exists, readFile, joinPath } from '../../utils/file.js';
import type { ProjectType } from '../../types/index.js';
import type { EntryPointResult } from '../../types/structure.js';

const ENTRY_POINT_PATTERNS: Record<string, string[]> = {
  python: [
    'manage.py', // Django (100% - ALWAYS at root)
    'app/main.py', // FastAPI (85% - official pattern)
    'main.py', // Simple projects (60%)
    'app.py', // Flask (70%)
    'src/main.py', // Module-based (30%)
    'src/app.py', // Module-based Flask (20%)
    '__main__.py', // Package entry point (15%)
    'cli.py', // CLI tools (Typer, Click) (10%)
    'wsgi.py', // WSGI server entry (secondary)
    'asgi.py', // ASGI server entry (secondary)
  ],
  node: [
    // Note: package.json "main"/"exports" checked separately (authoritative)
    'src/main.ts', // NestJS (100%)
    'app/layout.tsx', // Next.js App Router (60% of Next.js)
    'pages/_app.tsx', // Next.js Pages Router (40% of Next.js)
    'app.js', // Express (40% - express-generator default)
    'server.js', // Express (30% - emphasizes server role)
    'index.js', // npm default (30%)
    'index.ts', // TypeScript default
    'src/index.ts', // TypeScript with src/
    'src/index.js', // JavaScript with src/
    'src/server.ts', // TypeScript + Express
    'src/app.ts', // TypeScript + Express (app pattern)
  ],
  go: [
    'cmd/*/main.go', // Standard layout (95% - GLOB PATTERN)
    'main.go', // Simple projects (5%)
  ],
  rust: [
    'src/main.rs', // Binary/application
    'src/lib.rs', // Library
  ],
  // Ruby, PHP deferred (not core focus)
  ruby: [],
  php: [],
  mixed: [], // Monorepo - no single entry point
  unknown: [], // Can't detect
};

/**
 * Get entry point from package.json "main" or "exports" field
 *
 * Resolution priority (Node.js spec):
 * 1. "exports" field (modern, takes precedence)
 * 2. "main" field (legacy, fallback)
 * 3. "module" field (ESM-specific, some tools check this)
 *
 * exports field can be:
 * - String: Direct entry point
 * - Object with ".": Main export using dot notation
 * - Object with conditional exports: Extract "default" or "import"
 *
 * @param rootPath - Absolute path to project root
 * @returns Entry point path (relative to rootPath) or null if not found
 *
 * @example
 * ```typescript
 * // package.json: { "main": "./dist/index.js" }
 * await getPackageJsonEntry('/path') // → './dist/index.js'
 *
 * // package.json: { "exports": "./lib/index.js" }
 * await getPackageJsonEntry('/path') // → './lib/index.js'
 *
 * // package.json: { "exports": { ".": "./dist/index.js" } }
 * await getPackageJsonEntry('/path') // → './dist/index.js'
 *
 * // package.json: { "exports": { ".": { "import": "./esm/index.mjs", "default": "./index.js" } } }
 * await getPackageJsonEntry('/path') // → './index.js' (default fallback)
 * ```
 *
 * Sources:
 * - Node.js Modules spec: https://nodejs.org/api/packages.html#exports
 * - Research: Web search on exports field resolution (2026-02-26)
 * - Priority: exports > main > module (when multiple present)
 */
async function getPackageJsonEntry(rootPath: string): Promise<string | null> {
  const pkgPath = joinPath(rootPath, 'package.json');

  // Check package.json exists
  if (!(await exists(pkgPath))) {
    return null;
  }

  try {
    const content = await readFile(pkgPath);
    const pkg = JSON.parse(content);

    // Priority 1: "exports" field (modern Node.js, takes precedence)
    if (pkg.exports) {
      // Case 1: Direct string value
      // { "exports": "./dist/index.js" }
      if (typeof pkg.exports === 'string') {
        return pkg.exports;
      }

      // Case 2: Object with "." key (main export)
      // { "exports": { ".": "./dist/index.js" } }
      if (typeof pkg.exports === 'object' && pkg.exports['.']) {
        const dotExport = pkg.exports['.'];

        // Case 2a: Dot export is string
        if (typeof dotExport === 'string') {
          return dotExport;
        }

        // Case 2b: Dot export is object with conditional exports
        // { ".": { "import": "./esm/index.mjs", "require": "./cjs/index.js", "default": "./index.js" } }
        if (typeof dotExport === 'object') {
          // Try conditions in priority order
          return dotExport.default || dotExport.import || dotExport.require || null;
        }
      }
    }

    // Priority 2: "main" field (legacy, widely supported)
    if (pkg.main) {
      return pkg.main;
    }

    // Priority 3: "module" field (ESM-specific, some bundlers check this)
    if (pkg.module) {
      return pkg.module;
    }

    // No entry point specified
    return null;
  } catch (_error) {
    // Corrupted package.json - graceful degradation
    // Will fallback to convention-based detection
    return null;
  }
}

/**
 * Find entry points (where code execution starts)
 *
 * Uses framework-aware priority lists and package.json "main" field.
 *
 * @param rootPath - Absolute path to project root
 * @param projectType - Project type (python, node, go, rust)
 * @param framework - Framework (can be null)
 * @returns Entry point detection result
 *
 * @example
 * ```typescript
 * const result = await findEntryPoints('/path', 'python', 'django');
 * // → { entryPoints: ['manage.py'], confidence: 1.0, source: 'framework-convention' }
 * ```
 *
 */
export async function findEntryPoints(
  rootPath: string,
  projectType: ProjectType,
  framework: string | null
): Promise<EntryPointResult> {
  // Step 1: Framework-specific shortcuts (check these FIRST for high accuracy)
  const frameworkLower = framework?.toLowerCase() || '';

  // Django: Always manage.py at root (100% convention)
  if (frameworkLower === 'django') {
    const managePy = joinPath(rootPath, 'manage.py');
    if (await exists(managePy)) {
      return {
        entryPoints: ['manage.py'],
        confidence: 1.0,
        source: 'framework-convention',
      };
    }
  }

  // NestJS: Always src/main.ts (100% convention)
  if (frameworkLower === 'nestjs' || frameworkLower === 'nest') {
    const mainTs = joinPath(rootPath, 'src/main.ts');
    if (await exists(mainTs)) {
      return {
        entryPoints: ['src/main.ts'],
        confidence: 1.0,
        source: 'framework-convention',
      };
    }
  }

  // FastAPI: Prefer app/main.py (85% convention)
  if (frameworkLower === 'fastapi') {
    const appMainPy = joinPath(rootPath, 'app/main.py');
    if (await exists(appMainPy)) {
      return {
        entryPoints: ['app/main.py'],
        confidence: 1.0,
        source: 'framework-convention',
      };
    }
    // Fallback to priority list handled below
  }

  // Flask: Prefer app.py (70% convention)
  if (frameworkLower === 'flask') {
    const appPy = joinPath(rootPath, 'app.py');
    if (await exists(appPy)) {
      return {
        entryPoints: ['app.py'],
        confidence: 1.0,
        source: 'framework-convention',
      };
    }
    // Fallback to priority list handled below
  }

  // Next.js: Check App Router (app/layout.tsx) or Pages Router (pages/_app.tsx)
  if (frameworkLower === 'nextjs' || frameworkLower === 'next.js' || frameworkLower === 'next') {
    const appLayout = joinPath(rootPath, 'app/layout.tsx');
    const pagesApp = joinPath(rootPath, 'pages/_app.tsx');

    if (await exists(appLayout)) {
      return {
        entryPoints: ['app/layout.tsx'],
        confidence: 1.0,
        source: 'framework-convention',
      };
    }

    if (await exists(pagesApp)) {
      return {
        entryPoints: ['pages/_app.tsx'],
        confidence: 1.0,
        source: 'framework-convention',
      };
    }
    // Fallback to priority list handled below
  }

  // Step 2: Node package.json parsing (authoritative for ALL Node projects)
  if (projectType === 'node') {
    const pkgEntry = await getPackageJsonEntry(rootPath);
    if (pkgEntry) {
      // Remove leading './' if present for consistency
      const normalizedEntry = pkgEntry.startsWith('./') ? pkgEntry.slice(2) : pkgEntry;

      // Determine source based on which field was found
      const pkgPath = joinPath(rootPath, 'package.json');
      let source: 'package.json-main' | 'package.json-exports' = 'package.json-main';

      try {
        const content = await readFile(pkgPath);
        const pkg = JSON.parse(content);
        if (pkg.exports) {
          source = 'package.json-exports';
        }
      } catch {
        // If we can't read package.json, default to main (getPackageJsonEntry already succeeded)
      }

      return {
        entryPoints: [normalizedEntry],
        confidence: 1.0,
        source,
      };
    }
  }

  // Step 3: Priority list iteration (convention-based detection)
  const patterns = ENTRY_POINT_PATTERNS[projectType] || [];
  const foundEntryPoints: string[] = [];

  for (const pattern of patterns) {
    // Check if pattern is a glob (contains * wildcard)
    if (pattern.includes('*')) {
      // Use glob for patterns like 'cmd/*/main.go'
      try {
        const rawMatches = await glob(pattern, {
          cwd: rootPath,
          absolute: false,
          nodir: true,
        });
        const matches = rawMatches.map(p => p.replace(/\\/g, '/'));

        if (matches.length > 0) {
          // Found one or more matches
          foundEntryPoints.push(...matches);

          // For Go microservices (multiple cmd/*/main.go), return all with high confidence
          if (projectType === 'go' && matches.length >= 1) {
            return {
              entryPoints: matches,
              confidence: matches.length === 1 ? 0.95 : 1.0,
              source: 'convention',
            };
          }
        }
      } catch {
        // Glob pattern failed, continue to next pattern
        continue;
      }
    } else {
      // Simple file path check
      const filePath = joinPath(rootPath, pattern);
      if (await exists(filePath)) {
        foundEntryPoints.push(pattern);

        // First match wins for non-glob patterns
        // Check if more patterns might match (Express ambiguity case)
        const nextMatches: string[] = [];
        for (let i = patterns.indexOf(pattern) + 1; i < patterns.length; i++) {
          const nextPattern = patterns[i];
          if (nextPattern && !nextPattern.includes('*')) {
            const nextPath = joinPath(rootPath, nextPattern);
            if (await exists(nextPath)) {
              nextMatches.push(nextPattern);
            }
          }
        }

        if (nextMatches.length > 0) {
          // Multiple ambiguous files found (e.g., Express app.js + server.js)
          return {
            entryPoints: [pattern, ...nextMatches],
            confidence: 0.75,
            source: 'convention',
          };
        }

        // Single match - high confidence
        return {
          entryPoints: [pattern],
          confidence: 0.95,
          source: 'convention',
        };
      }
    }
  }

  // Step 4: No entry point found (library project or undetected pattern)
  if (foundEntryPoints.length > 0) {
    // Found via glob but didn't return early
    return {
      entryPoints: foundEntryPoints,
      confidence: 0.95,
      source: 'convention',
    };
  }

  // No entry point detected
  return {
    entryPoints: [],
    confidence: 0.0,
    source: 'not-found',
  };
}
