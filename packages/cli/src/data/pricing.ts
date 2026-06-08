/**
 * Versioned model price table — data, not a fetch.
 *
 * Cost is a labeled, recomputable ESTIMATE, never an invoice. The table is a
 * hardcoded const stamped with {@link PRICE_TABLE_VERSION} so any derived
 * `cost_usd` is reproducible offline and honestly versioned. There is no network
 * call and no clock read here — {@link computeCost} is pure (AC8 determinism).
 *
 * An unknown model never throws: it yields `cost_usd: 0` with the version still
 * stamped, so the gap is visible and recomputable once a price is added.
 */

/** The version stamp for the current price table. Bump when any rate changes. */
export const PRICE_TABLE_VERSION = '2026-06-08';

/** Token counts for a session, as produced by the transcript derive. */
export interface TokenCounts {
  /** Fresh (non-cached) input tokens. */
  input: number;
  /** Generated output tokens. */
  output: number;
  /** Tokens written into the prompt cache. */
  cache_create: number;
  /** Tokens read from the prompt cache. */
  cache_read: number;
}

/**
 * One model's price row, in USD per 1,000,000 tokens of each token type.
 *
 * `cache_create`/`cache_read` are the cache-write and cache-read rates; models
 * without a cache tier (or whose harness does not report one) simply contribute
 * `0` for those counts.
 */
export interface PriceEntry {
  /** Exact model id as it appears in the transcript. */
  model: string;
  /** USD per 1M fresh input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M cache-write tokens. */
  cache_create: number;
  /** USD per 1M cache-read tokens. */
  cache_read: number;
}

/**
 * The price table. Rates are per 1,000,000 tokens, in USD.
 *
 * Hand-curated; treat every figure as an estimate stamped by
 * {@link PRICE_TABLE_VERSION}. Add a row when a new model id appears in the
 * transcript corpus — never compute prices at runtime.
 */
export const PRICES: PriceEntry[] = [
  { model: 'claude-opus-4-8', input: 5, output: 25, cache_create: 6.25, cache_read: 0.5 },
  { model: 'claude-opus-4-7', input: 5, output: 25, cache_create: 6.25, cache_read: 0.5 },
  { model: 'claude-opus-4-6', input: 5, output: 25, cache_create: 6.25, cache_read: 0.5 },
  { model: 'claude-sonnet-4-6', input: 3, output: 15, cache_create: 3.75, cache_read: 0.3 },
  { model: 'claude-haiku-4-5', input: 1, output: 5, cache_create: 1.25, cache_read: 0.1 },
  { model: 'gpt-5.5', input: 1.25, output: 10, cache_create: 0, cache_read: 0.125 },
];

/** The result of a cost computation: the estimate plus the table version used. */
export interface CostResult {
  /** Estimated cost in USD, rounded to 6 decimal places. `0` for unknown models. */
  cost_usd: number;
  /**
   * Whether `model` was found in the price table. When `false`, `cost_usd` is
   * `0` because the model is UNPRICED — not because the session was free.
   * Callers should render unpriced models distinctly (e.g. "n/a"), never "$0.00".
   */
  priced: boolean;
  /** The price-table version this estimate was computed against. */
  price_table_version: string;
}

/**
 * Compute an estimated session cost from token counts and the versioned table.
 *
 * Pure and deterministic — no network, no clock, no randomness (AC8). Same
 * inputs always yield the same output. An unknown model returns `cost_usd: 0`
 * with the version still stamped (never throws), so the missing rate is visible
 * and the estimate can be recomputed once a row is added.
 *
 * @param tokens - Token counts for the session
 * @param model - The model id to price against
 * @returns The estimated cost and the price-table version used
 */
export function computeCost(tokens: TokenCounts, model: string): CostResult {
  const entry = PRICES.find((p) => p.model === model);
  if (!entry) {
    return { cost_usd: 0, priced: false, price_table_version: PRICE_TABLE_VERSION };
  }
  const raw =
    (tokens.input / 1_000_000) * entry.input +
    (tokens.output / 1_000_000) * entry.output +
    (tokens.cache_create / 1_000_000) * entry.cache_create +
    (tokens.cache_read / 1_000_000) * entry.cache_read;
  // Round to 6 dp for a stable, byte-identical estimate across runs.
  const cost_usd = Math.round(raw * 1_000_000) / 1_000_000;
  return { cost_usd, priced: true, price_table_version: PRICE_TABLE_VERSION };
}
