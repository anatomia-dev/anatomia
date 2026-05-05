/**
 * Main framework detector (dispatches to language-specific registries).
 *
 * Per-language detector order lives in `detectors/node/framework-registry.ts`
 * and `detectors/python/framework-registry.ts` as arrays of detector references.
 *
 * Detectors receive pre-read dependency lists and census framework hints
 * instead of rootPath. The function is synchronous — no filesystem reads.
 */

import type { ProjectType } from '../types/index.js';
import type { FrameworkHintEntry } from '../types/census.js';

import { NODE_FRAMEWORK_DETECTORS } from './node/framework-registry.js';
import { PYTHON_FRAMEWORK_DETECTORS } from './python/framework-registry.js';
import { detectGoFramework } from './go.js';
import { detectRustFramework } from './rust.js';

export interface FrameworkResult {
  framework: string | null;
  confidence: number;
  indicators: string[];
}

/**
 * Detect framework for a project.
 *
 * Dispatches to the per-language registry (Node/Python) or the single
 * detector function (Go/Rust) based on project type.
 *
 * @param deps - Dependency package names
 * @param projectType - Detected project type
 * @param hints - Census framework hint entries
 */
export function detectFramework(
  deps: string[],
  projectType: ProjectType,
  hints: FrameworkHintEntry[] = []
): FrameworkResult {
  switch (projectType) {
    case 'python':
      return detectPythonFramework(deps, hints);
    case 'node':
      return detectNodeFramework(deps, hints);
    case 'go':
      return detectGoFramework(deps);
    case 'rust':
      return detectRustFramework(deps);
    default:
      return { framework: null, confidence: 0.0, indicators: [] };
  }
}

const NOT_FOUND: FrameworkResult = {
  framework: null,
  confidence: 0.0,
  indicators: [],
};

function detectPythonFramework(deps: string[], hints: FrameworkHintEntry[]): FrameworkResult {
  for (const detect of PYTHON_FRAMEWORK_DETECTORS) {
    const result = detect(deps, hints);
    if (result.framework) return result;
  }
  return NOT_FOUND;
}

function detectNodeFramework(deps: string[], hints: FrameworkHintEntry[]): FrameworkResult {
  for (const detect of NODE_FRAMEWORK_DETECTORS) {
    const result = detect(deps, hints);
    if (result.framework) return result;
  }
  return NOT_FOUND;
}
