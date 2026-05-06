/**
 * Match pre-populated gotchas against detected stack.
 * Returns a map of skill name → gotcha texts.
 */

import { GOTCHAS } from '../data/gotchas.js';
import type { EngineResult } from '../engine/types/engineResult.js';
import { getPatternLibrary } from '../engine/types/patterns.js';

/**
 * Check if ALL trigger conditions match a scan result.
 *
 * A trigger entry `[key, value]` matches when EITHER:
 *   1. `result.stack[key] === value` (primary stack field match)
 *   2. `result.externalServices` has a service with matching category + name
 *   3. `result.deployment.platform` or `.ci` matches
 *   4. `result.patterns.validation` matches
 *
 * Shared by gotchas, rules library, and common issues library.
 *
 * @param triggers - Key-value trigger conditions (ALL must match)
 * @param result - Scan engine result
 * @returns true if all triggers match
 */
export function matchTriggers(triggers: Record<string, string>, result: EngineResult): boolean {
  return Object.entries(triggers).every(([key, value]) => {
    // Primary stack field match. stack.testing is string[] — handle both.
    const stackValue = (result.stack as Record<string, string | string[] | null>)[key];
    if (stackValue === value) return true;
    if (Array.isArray(stackValue) && stackValue.includes(value)) return true;
    // Service category match
    if (result.externalServices.some(svc => svc.category === key && svc.name === value)) {
      return true;
    }
    // Deployment field match (platform, ci)
    if (key === 'platform' && result.deployment?.platform === value) return true;
    if (key === 'ci' && result.deployment?.ci === value) return true;
    // Patterns field match (validation library)
    if (key === 'validation' && getPatternLibrary(result.patterns?.validation) === value) return true;
    return false;
  });
}

/**
 * Find gotchas that match the detected stack.
 * Thin wrapper around matchTriggers — FROZEN after extraction.
 *
 * @param result - Scan engine result
 * @returns Map of skill name → array of gotcha texts
 */
export function matchGotchas(result: EngineResult): Map<string, string[]> {
  const matched = new Map<string, string[]>();

  for (const gotcha of GOTCHAS) {
    if (matchTriggers(gotcha.triggers, result)) {
      const existing = matched.get(gotcha.skill) || [];
      existing.push(gotcha.text);
      matched.set(gotcha.skill, existing);
    }
  }

  return matched;
}
