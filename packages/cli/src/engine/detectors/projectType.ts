/**
 * Project type detection (Python, Node, Go, Rust, Ruby, PHP)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ProjectType } from '../types/index.js';

export interface ProjectTypeResult {
  type: ProjectType;
  confidence: number;
  indicators: string[]; // Files found (e.g., ["package.json", "pnpm-lock.yaml"])
}

/**
 * Check if a file exists at the given path
 * @param p
 */
async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if pyproject.toml content contains real Python project dependencies.
 * Detects PEP 621 `[project]` with non-empty `dependencies` array,
 * or Poetry `[tool.poetry.dependencies]` with package entries.
 * Does NOT do full TOML parsing — section-header and key-presence regex only.
 */
function hasPythonProjectDeps(content: string): boolean {
  try {
    // PEP 621: [project] section with dependencies = ["pkg", ...]
    const projectMatch = content.match(/^\[project\]\s*$/m);
    if (projectMatch) {
      // Find dependencies array after [project] but before next section
      const projectStart = projectMatch.index! + projectMatch[0].length;
      const nextSection = content.indexOf('\n[', projectStart);
      const projectBlock = nextSection === -1
        ? content.slice(projectStart)
        : content.slice(projectStart, nextSection);
      // Match dependencies = [...] with at least one quoted entry
      const depsMatch = projectBlock.match(/^dependencies\s*=\s*\[([^\]]*)\]/m);
      if (depsMatch && depsMatch[1]?.match(/["'][^"']+["']/)) {
        return true;
      }
    }

    // Poetry: [tool.poetry.dependencies] with package entries
    const poetryMatch = content.match(/^\[tool\.poetry\.dependencies\]\s*$/m);
    if (poetryMatch) {
      const poetryStart = poetryMatch.index! + poetryMatch[0].length;
      const nextSection = content.indexOf('\n[', poetryStart);
      const poetryBlock = nextSection === -1
        ? content.slice(poetryStart)
        : content.slice(poetryStart, nextSection);
      // At least one line with package = "version" or package = {version = "..."}
      // Exclude python itself
      const lines = poetryBlock.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      const pkgLines = lines.filter(l => /^\s*[a-zA-Z]/.test(l) && !/^\s*python\s*=/.test(l));
      if (pkgLines.length > 0) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Detect project type from dependency files
 *
 * Uses a tiered heuristic for package.json repos to disambiguate polyglot projects.
 * Falls through to Python → Go → Rust → Ruby → PHP for non-package.json repos.
 * @param rootPath
 */
export async function detectProjectType(
  rootPath: string
): Promise<ProjectTypeResult> {
  const indicators: string[] = [];

  // Node.js / JavaScript / TypeScript — tiered polyglot heuristic
  if (await exists(path.join(rootPath, 'package.json'))) {
    indicators.push('package.json');

    // Check lockfiles
    if (await exists(path.join(rootPath, 'pnpm-lock.yaml'))) indicators.push('pnpm-lock.yaml');
    if (await exists(path.join(rootPath, 'package-lock.json'))) indicators.push('package-lock.json');
    if (await exists(path.join(rootPath, 'yarn.lock'))) indicators.push('yarn.lock');
    if (await exists(path.join(rootPath, 'bun.lockb'))) indicators.push('bun.lockb');
    if (await exists(path.join(rootPath, 'bun.lock'))) indicators.push('bun.lock');

    const hasLockfile = indicators.length > 1; // More than just package.json

    // Tier 2: Workspaces field → definitively Node (monorepo root)
    try {
      const pkgContent = await fs.readFile(path.join(rootPath, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgContent) as Record<string, unknown>;
      if (pkg['workspaces'] !== undefined) {
        return { type: 'node', confidence: 0.90, indicators };
      }
    } catch {
      // Malformed package.json — continue with heuristic
    }

    // Check for pyproject.toml
    const hasPyproject = await exists(path.join(rootPath, 'pyproject.toml'));

    if (hasLockfile && !hasPyproject) {
      // Tier 1: package.json + lockfile + no pyproject.toml → Node 0.95 (fast path)
      return { type: 'node', confidence: 0.95, indicators };
    }

    if (hasLockfile && hasPyproject) {
      // Tier 3: package.json + lockfile + pyproject.toml with real deps → Python 0.90
      try {
        const pyContent = await fs.readFile(path.join(rootPath, 'pyproject.toml'), 'utf-8');
        if (hasPythonProjectDeps(pyContent)) {
          indicators.push('pyproject.toml');
          return { type: 'python', confidence: 0.90, indicators };
        }
      } catch {
        // Unreadable pyproject.toml — fall through to Node
      }
      // Tooling-only pyproject.toml — still Node
      return { type: 'node', confidence: 0.95, indicators };
    }

    if (!hasLockfile && hasPyproject) {
      // Tier 4: package.json + no lockfile + pyproject.toml → Python 0.85
      try {
        const pyContent = await fs.readFile(path.join(rootPath, 'pyproject.toml'), 'utf-8');
        if (hasPythonProjectDeps(pyContent)) {
          indicators.push('pyproject.toml');
          return { type: 'python', confidence: 0.85, indicators };
        }
      } catch {
        // Unreadable pyproject.toml — fall through to weak Node
      }
      // pyproject.toml without real deps — still Node (weak)
      return { type: 'node', confidence: 0.70, indicators };
    }

    // Tier 5: package.json + no lockfile + no competing manifest → Node 0.70
    return { type: 'node', confidence: 0.70, indicators };
  }

  // Python
  if (await exists(path.join(rootPath, 'pyproject.toml'))) {
    indicators.push('pyproject.toml');
    return { type: 'python', confidence: 0.95, indicators };
  }
  if (await exists(path.join(rootPath, 'requirements.txt'))) {
    indicators.push('requirements.txt');
    return { type: 'python', confidence: 0.90, indicators };
  }
  if (await exists(path.join(rootPath, 'Pipfile'))) {
    indicators.push('Pipfile');
    return { type: 'python', confidence: 0.90, indicators };
  }
  if (await exists(path.join(rootPath, 'setup.py'))) {
    indicators.push('setup.py');
    return { type: 'python', confidence: 0.85, indicators };
  }

  // Go
  if (await exists(path.join(rootPath, 'go.mod'))) {
    indicators.push('go.mod');
    return { type: 'go', confidence: 0.95, indicators };
  }

  // Rust
  if (await exists(path.join(rootPath, 'Cargo.toml'))) {
    indicators.push('Cargo.toml');
    return { type: 'rust', confidence: 0.95, indicators };
  }

  // Ruby
  if (await exists(path.join(rootPath, 'Gemfile'))) {
    indicators.push('Gemfile');
    return { type: 'ruby', confidence: 0.90, indicators };
  }

  // PHP
  if (await exists(path.join(rootPath, 'composer.json'))) {
    indicators.push('composer.json');
    return { type: 'php', confidence: 0.90, indicators };
  }

  return { type: 'unknown', confidence: 0.0, indicators: [] };
}
