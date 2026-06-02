/**
 * Vue framework detector
 *
 * Detects Vue 3 (and Vue 2) projects. Guards against Nuxt, which
 * includes Vue — Nuxt is detected by its own detector at higher priority.
 */

import type { Detection } from '../python/fastapi.js';
import type { FrameworkHintEntry } from '../../types/census.js';

/**
 * Detect Vue framework (excludes Nuxt).
 *
 * @param dependencies - Flat list of all dependency names
 * @param hints - Census framework hints for the source root
 * @returns Detection result with framework, confidence, and indicators
 */
export function detectVue(
  dependencies: string[],
  hints: FrameworkHintEntry[]
): Detection {
  const hasVue = dependencies.includes('vue');
  const hasNuxt = dependencies.includes('nuxt');

  if (!hasVue || hasNuxt) {
    return { framework: null, confidence: 0.0, indicators: [] };
  }

  const indicators: string[] = ['vue in dependencies'];
  let confidence = 0.75;

  // Check for Vue CLI config (vue.config.ts/js) via census hints
  const hasVueConfig = hints.some(h => h.framework === 'vue');
  if (hasVueConfig) {
    confidence = 0.90;
    indicators.push('vue.config.* found (Vue CLI)');
  }

  // Check for Vite as build tool (common in Vue 3 projects)
  const hasVite = dependencies.includes('vite');
  if (hasVite) {
    indicators.push('Vite (Vue build tool)');
    confidence = Math.max(confidence, 0.85);
  }

  return {
    framework: 'vue',
    confidence,
    indicators,
  };
}
