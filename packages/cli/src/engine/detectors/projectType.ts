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
 * Detect project type from dependency files
 *
 * Priority order: Node → Python → Go → Rust → Ruby → PHP
 * Returns first match with indicators of supporting files found.
 * @param rootPath
 */
export async function detectProjectType(
  rootPath: string
): Promise<ProjectTypeResult> {
  const indicators: string[] = [];

  // Node.js / JavaScript / TypeScript
  if (await exists(path.join(rootPath, 'package.json'))) {
    indicators.push('package.json');
    if (await exists(path.join(rootPath, 'pnpm-lock.yaml'))) indicators.push('pnpm-lock.yaml');
    if (await exists(path.join(rootPath, 'package-lock.json'))) indicators.push('package-lock.json');
    if (await exists(path.join(rootPath, 'yarn.lock'))) indicators.push('yarn.lock');
    if (await exists(path.join(rootPath, 'bun.lockb'))) indicators.push('bun.lockb');
    return { type: 'node', confidence: 0.95, indicators };
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
