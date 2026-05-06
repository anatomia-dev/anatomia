/**
 * Confidence scoring utilities
 *
 * Based on multi-signal approach:
 * - Dependency: 80% (authoritative)
 * - Imports: 15% (verification)
 * - Config: 5% (bonus)
 * - Patterns: 5% (bonus)
 *
 */

export interface ConfidenceSignals {
  dependencyFound: boolean;
  importsFound: boolean;
  configFilesFound: boolean;
  frameworkSpecificPatterns?: boolean;
}

/**
 * Calculate framework detection confidence
 *
 * @param signals - Detection signals
 * @returns Confidence score 0.0-1.0
 *
 * @example
 * const confidence = calculateConfidence({
 *   dependencyFound: true,           // +0.80
 *   importsFound: true,              // +0.15
 *   configFilesFound: false,         // +0.00
 *   frameworkSpecificPatterns: true  // +0.05
 * });
 * // Returns: 1.00
 */
export function calculateConfidence(signals: ConfidenceSignals): number {
  let confidence = 0.0;

  if (signals.dependencyFound) confidence += 0.80;
  if (signals.importsFound) confidence += 0.15;
  if (signals.configFilesFound) confidence += 0.05;
  if (signals.frameworkSpecificPatterns) confidence += 0.05;

  return Math.min(1.0, confidence);
}

