/**
 * Model price table — re-export surface for `anatrace-core` (developer-confirmed adoption).
 *
 * The price table, its version stamp, and the cost computation now live in the
 * published `anatrace-core` engine — one shared cost source across Anatomia,
 * anatrace, and crack3d. This module is a thin re-export so the rest of the CLI
 * keeps importing from `../data/pricing.js` unchanged.
 *
 * Cost remains a labeled, recomputable ESTIMATE, never an invoice: core's
 * {@link computeCost} is pure (no network, no clock) and stamps the table version
 * it computed against. An unknown model yields `priced: false` (never a guessed
 * `$0.00`). At `0.2.0` the table is byte-identical to Anatomia's former local
 * table (same rows, same version `2026-06-08`), so no displayed cost changes.
 */

export { PRICES, PRICE_TABLE_VERSION, computeCost } from 'anatrace-core';
export type { TokenCounts, PriceEntry, CostResult } from 'anatrace-core';
