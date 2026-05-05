/**
 * Flask framework detector
 */

import { calculateConfidence } from '../../utils/confidence.js';
import type { Detection } from './fastapi.js';
import type { FrameworkHintEntry } from '../../types/census.js';

/**
 * Detect Flask framework.
 *
 * Note: scanForImports (import verification) deferred to analyzer scope.
 */
export function detectFlask(
  dependencies: string[],
  hints: FrameworkHintEntry[]
): Detection {
  const dependencyFound = dependencies.includes('flask');
  if (!dependencyFound) {
    return { framework: null, confidence: 0.0, indicators: [] };
  }

  const indicators: string[] = ['flask in dependencies'];

  // Check for app.py via census hints (common Flask convention)
  const hasAppPy = hints.some(h => h.framework === 'flask');
  if (hasAppPy) {
    indicators.push('app.py found');
  }

  const confidence = calculateConfidence({
    dependencyFound: true,
    importsFound: false,  // deferred to analyzer scope
    configFilesFound: hasAppPy,
  });

  return { framework: 'flask', confidence, indicators };
}
