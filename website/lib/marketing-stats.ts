/**
 * lib/marketing-stats.ts
 * ==================================================================
 * Safe accessor layer for marketing-relevant values from extraction data.
 *
 * Wraps docs-data accessors in try/catch with hardcoded fallbacks matching
 * the current site values. Components import from here — never directly
 * from docs-data — for marketing display values.
 * ==================================================================
 */

import { getCommandCount } from '@/lib/docs-data';
import { getBuildMeta } from '@/lib/docs-data';

const COMMAND_COUNT_FALLBACK = 26;
const VERSION_FALLBACK = 'v1.1.0';

/**
 * Returns the total command count from extraction data.
 * Falls back to the previous hardcoded value when data is unavailable.
 * @returns command count number
 */
export function getMarketingCommandCount(): number {
  try {
    return getCommandCount();
  } catch {
    return COMMAND_COUNT_FALLBACK;
  }
}

/**
 * Returns the latest published version from build metadata, prefixed with `v`.
 * Falls back to the previous hardcoded version when data is unavailable.
 * @returns version string (e.g. "v1.0.2")
 */
export function getMarketingVersion(): string {
  try {
    const { version } = getBuildMeta();
    return version ? `v${version}` : VERSION_FALLBACK;
  } catch {
    return VERSION_FALLBACK;
  }
}
