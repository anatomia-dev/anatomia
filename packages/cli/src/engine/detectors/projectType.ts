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
 * Check if Cargo.toml content declares a Cargo workspace.
 * Looks for a standalone `[workspace]` section header — NOT subsections
 * like `[workspace.members]` or `[workspace.package]`.
 * Does NOT do full TOML parsing — section-header regex only.
 */
function hasRustWorkspace(content: string): boolean {
  try {
    return /^\[workspace\]\s*$/m.test(content);
  } catch {
    return false;
  }
}

/**
 * Check if Cargo.toml content has a tauri dependency in [workspace.dependencies].
 * Detects both inline format (`tauri = "2.5.0"`) and sub-table format
 * (`[workspace.dependencies.tauri]`). Section-scoped to avoid matching
 * workspace member paths like "apps/desktop/src-tauri".
 */
function hasTauriWorkspaceDep(content: string): boolean {
  try {
    // Check for sub-table header format: [workspace.dependencies.tauri]
    if (/^\[workspace\.dependencies\.tauri\]\s*$/m.test(content)) {
      return true;
    }

    // Check for inline format within [workspace.dependencies] section
    const sectionMatch = content.match(/^\[workspace\.dependencies\]\s*$/m);
    if (!sectionMatch) return false;

    const sectionStart = sectionMatch.index! + sectionMatch[0].length;
    const nextSection = content.indexOf('\n[', sectionStart);
    const sectionBlock = nextSection === -1
      ? content.slice(sectionStart)
      : content.slice(sectionStart, nextSection);

    return /^\s*tauri\s*=/m.test(sectionBlock);
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
      // Find dependencies array and check for at least one quoted entry.
      // Cannot use [^\]]* to match array content because PEP 508 extras
      // put ] inside quoted strings: "pkg[extra]>=1.0". Instead, find the
      // structural closing bracket by its position at line-start.
      const depsStart = projectBlock.match(/^dependencies\s*=\s*\[/m);
      if (depsStart) {
        const afterOpen = projectBlock.slice(depsStart.index! + depsStart[0].length);
        // Single-line: greedy match to last ] on the line (safe — extras ] are mid-string)
        const singleLine = afterOpen.match(/^([^\n]*)\]/);
        // Multi-line: content up to a ] at the start of a line (structural close)
        const multiLine = afterOpen.match(/^([\s\S]*?)^\s*\]/m);
        const arrayContent = singleLine?.[1] || multiLine?.[1] || '';
        if (arrayContent.match(/["'][^"']+["']/)) {
          return true;
        }
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
    // Exception: Gemfile at root means Ruby with JS tooling workspaces (e.g., Mastodon).
    // Fall through to competing manifest checks instead of early-returning.
    try {
      const pkgContent = await fs.readFile(path.join(rootPath, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgContent) as Record<string, unknown>;
      if (pkg['workspaces'] !== undefined) {
        if (await exists(path.join(rootPath, 'Gemfile'))) {
          // Ruby project with JS workspaces — fall through to competing manifest checks
        } else {
          return { type: 'node', confidence: 0.90, indicators };
        }
      }
    } catch {
      // Malformed package.json — continue with heuristic
    }

    // Check for competing manifests
    const hasPyproject = await exists(path.join(rootPath, 'pyproject.toml'));
    const hasCargo = await exists(path.join(rootPath, 'Cargo.toml'));
    const hasGoMod = await exists(path.join(rootPath, 'go.mod'));
    const hasGemfile = await exists(path.join(rootPath, 'Gemfile'));
    const hasPnpmWorkspace = await exists(path.join(rootPath, 'pnpm-workspace.yaml'));

    if (hasLockfile && !hasPyproject && !hasCargo && !hasGoMod && !hasGemfile) {
      // Tier 1: package.json + lockfile + no competing manifest → Node 0.95 (fast path)
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
        // Unreadable pyproject.toml — fall through
      }
    }

    if (hasLockfile && hasCargo) {
      // Tier 3: package.json + lockfile + Cargo.toml with [workspace] → Rust 0.90
      try {
        const cargoContent = await fs.readFile(path.join(rootPath, 'Cargo.toml'), 'utf-8');
        if (hasRustWorkspace(cargoContent)) {
          // Tauri discriminator: Rust workspace with tauri dep + pnpm-workspace.yaml → Node
          if (hasTauriWorkspaceDep(cargoContent) && hasPnpmWorkspace) {
            indicators.push('pnpm-workspace.yaml');
            return { type: 'node', confidence: 0.85, indicators };
          }
          indicators.push('Cargo.toml');
          return { type: 'rust', confidence: 0.90, indicators };
        }
      } catch {
        // Unreadable Cargo.toml — fall through
      }
    }

    if (hasLockfile && hasGemfile) {
      // Tier 3: package.json + lockfile + Gemfile → Ruby 0.90
      indicators.push('Gemfile');
      return { type: 'ruby', confidence: 0.90, indicators };
    }

    if (hasLockfile && hasGoMod) {
      // Tier 3: package.json + lockfile + go.mod → Go 0.90
      indicators.push('go.mod');
      return { type: 'go', confidence: 0.90, indicators };
    }

    if (hasLockfile) {
      // Lockfile present but no competing manifest matched — Node 0.95
      return { type: 'node', confidence: 0.95, indicators };
    }

    // No lockfile tiers
    if (!hasLockfile && hasPyproject) {
      // Tier 4: package.json + no lockfile + pyproject.toml → Python 0.85
      try {
        const pyContent = await fs.readFile(path.join(rootPath, 'pyproject.toml'), 'utf-8');
        if (hasPythonProjectDeps(pyContent)) {
          indicators.push('pyproject.toml');
          return { type: 'python', confidence: 0.85, indicators };
        }
      } catch {
        // Unreadable pyproject.toml — fall through
      }
    }

    if (!hasLockfile && hasCargo) {
      // Tier 4: package.json + no lockfile + Cargo.toml with [workspace] → Rust 0.85
      try {
        const cargoContent = await fs.readFile(path.join(rootPath, 'Cargo.toml'), 'utf-8');
        if (hasRustWorkspace(cargoContent)) {
          // Tauri discriminator: Rust workspace with tauri dep + pnpm-workspace.yaml → Node
          if (hasTauriWorkspaceDep(cargoContent) && hasPnpmWorkspace) {
            indicators.push('pnpm-workspace.yaml');
            return { type: 'node', confidence: 0.80, indicators };
          }
          indicators.push('Cargo.toml');
          return { type: 'rust', confidence: 0.85, indicators };
        }
      } catch {
        // Unreadable Cargo.toml — fall through
      }
    }

    if (!hasLockfile && hasGemfile) {
      // Tier 4: package.json + no lockfile + Gemfile → Ruby 0.85
      indicators.push('Gemfile');
      return { type: 'ruby', confidence: 0.85, indicators };
    }

    if (!hasLockfile && hasGoMod) {
      // Tier 4: package.json + no lockfile + go.mod → Go 0.85
      indicators.push('go.mod');
      return { type: 'go', confidence: 0.85, indicators };
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
