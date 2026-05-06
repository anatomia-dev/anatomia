/**
 * FastAPI framework detector for Python projects
 *
 * Uses multi-signal confidence scoring to identify FastAPI in Python projects.
 * Combines dependency checks and companion package detection.
 */

import { calculateConfidence } from '../../utils/confidence.js';
import type { FrameworkHintEntry } from '../../types/census.js';

export interface Detection {
  framework: string | null;
  confidence: number;
  indicators: string[];
}

/**
 * Detect FastAPI framework in a Python project.
 *
 * Note: scanForImports (import verification, +0.15 confidence) deferred to
 * analyzer scope. Confidence is dep+companion based (0.80-0.85).
 */
export function detectFastAPI(
  dependencies: string[],
  _hints: FrameworkHintEntry[]
): Detection {
  const indicators: string[] = [];

  const dependencyFound = dependencies.includes('fastapi');
  if (!dependencyFound) {
    return { framework: null, confidence: 0.0, indicators: [] };
  }

  indicators.push('fastapi in dependencies');

  // Companion packages
  const companionPackages = ['uvicorn', 'pydantic'];
  const companionsFound = companionPackages.filter(pkg => dependencies.includes(pkg));
  const hasCompanions = companionsFound.length > 0;

  if (hasCompanions) {
    indicators.push(`companion packages: ${companionsFound.join(', ')}`);
  }

  const confidence = calculateConfidence({
    dependencyFound,
    importsFound: false,  // deferred to analyzer scope
    configFilesFound: false,
    frameworkSpecificPatterns: hasCompanions,
  });

  return { framework: 'fastapi', confidence, indicators };
}
