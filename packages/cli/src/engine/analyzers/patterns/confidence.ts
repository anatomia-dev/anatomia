/**
 * Pattern confidence utilities.
 *
 * Pure post-processing helpers that operate on detected patterns:
 * - filterByConfidence: threshold-based filtering
 * - interpretConfidence: numeric score → user-display level
 * - calculateECE: Expected Calibration Error across a result set
 *
 * No dependencies on parsers, tree-sitter, or file I/O — strictly
 * functions over already-detected PatternConfidence objects.
 */

import type { PatternConfidence } from '../../types/patterns.js';

// ============================================================================
// CONFIDENCE SCORING AND FILTERING
// ============================================================================

/**
 * Filter patterns by confidence threshold
 *
 * Returns only patterns meeting or exceeding threshold.
 * Default threshold: 0.7
 *
 * @param patterns - All detected patterns (from confirmPatternsWithTreeSitter)
 * @param threshold - Minimum confidence (default: 0.7)
 * @returns Filtered patterns (only high-confidence)
 *
 * @example
 * ```typescript
 * const allPatterns = {
 *   validation: { library: 'pydantic', confidence: 0.95, evidence: [...] },  // ≥0.7 ✓
 *   database: { library: 'sqlalchemy', confidence: 0.68, evidence: [...] },  // <0.7 ✗
 *   auth: { library: 'jwt', confidence: 0.80, evidence: [...] },             // ≥0.7 ✓
 * };
 *
 * const filtered = filterByConfidence(allPatterns, 0.7);
 * // Returns: { validation: {...}, auth: {...} }
 * // Excludes: database (confidence 0.68 < 0.7)
 * ```
 */
export function filterByConfidence(
  patterns: Partial<Record<string, PatternConfidence>>,
  threshold: number = 0.7
): Partial<Record<string, PatternConfidence>> {
  const filtered: Partial<Record<string, PatternConfidence>> = {};

  for (const [category, pattern] of Object.entries(patterns)) {
    if (pattern && pattern.confidence >= threshold) {
      filtered[category] = pattern;
    }
  }

  return filtered;
}

/**
 * Interpret confidence score for user display
 *
 * Maps numeric confidence (0.0-1.0) to:
 * - Level: high/moderate/low/uncertain
 * - Message: User-friendly description
 * - Action: What should happen (auto-apply/verify/confirm/flag-manual)
 * - Expected accuracy: Calibrated accuracy target per bucket
 *
 * Buckets:
 * - High (≥0.90): Auto-apply in templates (expected ≥95% accurate)
 * - Moderate (0.70-0.89): Verify before applying (expected ≥85% accurate)
 * - Low (0.50-0.69): User confirmation required (expected ≥70% accurate)
 * - Uncertain (<0.50): Manual review (expected <70% accurate)
 *
 * @param confidence - Confidence score (0.0-1.0)
 * @returns Interpretation with level, message, action, expected accuracy
 *
 * @example
 * ```typescript
 * const interp = interpretConfidence(0.95);
 * console.log(interp.message);  // "Very confident (95%)"
 * console.log(interp.action);   // "auto-apply"
 * ```
 */
export function interpretConfidence(confidence: number): {
  level: 'high' | 'moderate' | 'low' | 'uncertain';
  message: string;
  action: 'auto-apply' | 'verify' | 'confirm' | 'flag-manual';
  expectedAccuracy: string;
} {
  if (confidence >= 0.90) {
    return {
      level: 'high',
      message: `Very confident (${Math.round(confidence * 100)}%)`,
      action: 'auto-apply',
      expectedAccuracy: '≥95%',
    };
  }

  if (confidence >= 0.70) {
    return {
      level: 'moderate',
      message: `Confident (${Math.round(confidence * 100)}%)`,
      action: 'verify',
      expectedAccuracy: '≥85%',
    };
  }

  if (confidence >= 0.50) {
    return {
      level: 'low',
      message: `Uncertain (${Math.round(confidence * 100)}%)`,
      action: 'confirm',
      expectedAccuracy: '≥70%',
    };
  }

  return {
    level: 'uncertain',
    message: `Very uncertain (${Math.round(confidence * 100)}%)`,
    action: 'flag-manual',
    expectedAccuracy: '<70%',
  };
}

/**
 * Pattern detection result for calibration
 *
 * Used to calculate ECE (Expected Calibration Error).
 */
export interface PatternDetectionResult {
  project: string;        // Project name
  category: string;       // 'validation', 'database', 'auth', 'testing', 'errorHandling'
  detected: string;       // Pattern detected (e.g., 'pydantic', 'zod')
  confidence: number;     // Confidence score assigned
  correct: boolean;       // Ground truth (true if detection correct)
}

/**
 * Calculate Expected Calibration Error
 *
 * Measures calibration quality: how well confidence scores match actual accuracy.
 *
 * Process:
 * 1. Group results by confidence bucket (0.90+, 0.70-0.89, 0.50-0.69, 0-0.49)
 * 2. Calculate average confidence per bucket
 * 3. Calculate actual accuracy per bucket (% correct)
 * 4. Compute gap: |avg_confidence - actual_accuracy|
 * 5. Average gaps across buckets = ECE
 *
 * Interpretation (adjusted for heuristic systems):
 * - ECE <0.05: Excellent calibration (ML-system level, stretch goal)
 * - ECE <0.10: Well-calibrated (TARGET for heuristic systems)
 * - ECE 0.10-0.15: Acceptable (minor miscalibration, usable for MVP)
 * - ECE >0.15: Poor calibration (weights need adjustment)
 *
 * @param results - Array of pattern detection results with ground truth
 * @returns ECE score (0.0-1.0, lower is better)
 *
 * @example
 * ```typescript
 * const results = [
 *   { project: 'p1', category: 'validation', detected: 'pydantic', confidence: 0.95, correct: true },
 *   { project: 'p2', category: 'database', detected: 'sqlalchemy', confidence: 0.90, correct: false },
 *   // ... more results
 * ];
 *
 * const ece = calculateECE(results);
 * console.log('ECE:', ece);  // e.g., 0.042 (well-calibrated)
 *
 * if (ece < 0.05) {
 *   console.log('✓ Well-calibrated - confidence scores trustworthy');
 * } else if (ece < 0.10) {
 *   console.log('⚠ Acceptable - minor miscalibration');
 * } else {
 *   console.log('❌ Poor calibration - adjust signal weights');
 * }
 * ```
 */
export function calculateECE(results: PatternDetectionResult[]): number {
  const buckets = [
    { min: 0.90, max: 1.00, label: 'high' },
    { min: 0.70, max: 0.89, label: 'moderate' },
    { min: 0.50, max: 0.69, label: 'low' },
    { min: 0.00, max: 0.49, label: 'uncertain' },
  ];

  let totalGap = 0;
  let bucketCount = 0;

  for (const bucket of buckets) {
    // Filter results in this bucket
    const bucketResults = results.filter(r =>
      r.confidence >= bucket.min && r.confidence <= bucket.max
    );

    if (bucketResults.length === 0) {
      // No results in bucket - skip
      continue;
    }

    // Calculate average confidence in bucket
    const avgConfidence = bucketResults.reduce((sum, r) =>
      sum + r.confidence, 0
    ) / bucketResults.length;

    // Calculate actual accuracy in bucket
    const correctCount = bucketResults.filter(r => r.correct).length;
    const accuracy = correctCount / bucketResults.length;

    // Compute gap (calibration error for this bucket)
    const gap = Math.abs(avgConfidence - accuracy);

    totalGap += gap;
    bucketCount++;

    // Log bucket stats (helpful for debugging)
    if (process.env['VERBOSE']) {
      console.log(
        `Bucket ${bucket.label} (${bucket.min}-${bucket.max}): ` +
        `confidence=${avgConfidence.toFixed(2)}, ` +
        `accuracy=${accuracy.toFixed(2)}, ` +
        `gap=${gap.toFixed(3)} ` +
        `(${bucketResults.length} results)`
      );
    }
  }

  // Return average gap across all buckets
  return bucketCount > 0 ? totalGap / bucketCount : 0.0;
}
