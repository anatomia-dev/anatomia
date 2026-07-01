/**
 * Pure provenance-shaping helpers for the web proof page.
 *
 * These mirror the CLI's `formatHumanReadable` Provenance section
 * (packages/cli/src/commands/proof.ts) exactly — same counting, same
 * model-collapse rule, same "n/a for unpriced" honesty — but carry NO import of
 * `anatrace-core` or the price table. Cost is supplied by an injected `priceFn`
 * so the derivation stays pure and unit-testable; the extractor binds the real
 * `computeCost`, tests pass a deterministic stub.
 */

import type {
  ProofEntry,
  ProofProvenance,
  ProofProvenanceSession,
  ProofProvenanceChurn,
  ProofProvenanceCompleteness,
} from './types';

/** Token counts as stored on a session's derived record. */
export interface ProvenanceTokenCounts {
  input: number;
  output: number;
  cache_create: number;
  cache_read: number;
}

/** The subset of `anatrace-core`'s `CostResult` the shaping helper consumes. */
export interface ProvenanceCostResult {
  cost_usd: number;
  priced: boolean;
  price_table_version: string;
}

/** Injected cost function — the extractor binds `computeCost`, tests pass a stub. */
export type ProvenancePriceFn = (
  tokens: ProvenanceTokenCounts,
  model: string,
) => ProvenanceCostResult;

/** The serialized `derived` counts on a session (subset consumed here). */
export interface ProvenanceDerivedInput {
  tokens: ProvenanceTokenCounts;
  turns: number;
  tool_calls: number;
  model: string;
}

/** One serialized session in `entry.process.sessions`. */
export interface ProvenanceSessionInput {
  role: string;
  model: string;
  derived?: ProvenanceDerivedInput;
}

/** The serialized `entry.process` shape (subset consumed by `deriveProvenance`). */
export interface ProvenanceProcessInput {
  module_churn?: Record<string, { added: number; deleted: number }>;
  completeness?: {
    complete: boolean;
    expected: { plan: number; build: number; verify: number };
    present: { plan: number; build: number; verify: number };
  };
  sessions: ProvenanceSessionInput[];
}

/**
 * Shape a serialized `process` attestation into the render-ready provenance view.
 *
 * Mirrors the CLI: model collapses to a single line only when every session has
 * counts AND shares one model; each row's cache figure sums `cache_create +
 * cache_read`; an unpriced model yields `costUsd: null` (never `0`); the totals
 * sum only priced sessions and count the unpriced ones. The price-table version
 * is sourced from the `CostResult` the cost was computed against — never a
 * per-session stored stamp, which can disagree once the shared table moves.
 *
 * @param process - The serialized `entry.process` object
 * @param priceFn - Injected cost function (the extractor binds the real one)
 * @returns The render-ready {@link ProofProvenance}
 */
export function deriveProvenance(
  process: ProvenanceProcessInput,
  priceFn: ProvenancePriceFn,
): ProofProvenance {
  const rawSessions = process.sessions ?? [];

  // Model collapses only when every session has counts AND shares one model.
  const allSameModel =
    rawSessions.length > 0 &&
    rawSessions.every((s) => s.derived != null) &&
    rawSessions.every((s) => s.derived!.model === rawSessions[0]!.derived!.model);

  const roleSeen: Record<string, number> = {};
  const sessions: ProofProvenanceSession[] = [];
  let totalCost = 0;
  let unpriced = 0;
  let priceTableVersion: string | null = null;

  for (const s of rawSessions) {
    // Stable rework index in dataset order (e.g. `build 2`).
    const n = (roleSeen[s.role] = (roleSeen[s.role] ?? 0) + 1);
    let label = n > 1 ? `${s.role} ${n}` : s.role;
    const rowModel = s.derived?.model ?? s.model;
    if (!allSameModel) {
      label += ` · ${rowModel.replace(/^claude-/, '')}`;
    }

    const d = s.derived;
    if (!d) {
      // Counts-unavailable session: kept in the dataset, no numbers, no cost.
      sessions.push({
        label,
        role: s.role,
        model: rowModel,
        turns: 0,
        toolCalls: 0,
        tokens: { input: 0, output: 0, cache: 0 },
        costUsd: null,
        countsAvailable: false,
      });
      continue;
    }

    const cost = priceFn(d.tokens, d.model);
    if (priceTableVersion === null) priceTableVersion = cost.price_table_version;
    let costUsd: number | null;
    if (cost.priced) {
      costUsd = cost.cost_usd;
      totalCost += cost.cost_usd;
    } else {
      costUsd = null;
      unpriced += 1;
    }

    sessions.push({
      label,
      role: s.role,
      model: d.model,
      turns: d.turns,
      toolCalls: d.tool_calls,
      tokens: {
        input: d.tokens.input,
        output: d.tokens.output,
        cache: d.tokens.cache_create + d.tokens.cache_read,
      },
      costUsd,
      countsAvailable: true,
    });
  }

  // Churn — omitted entirely when no files changed (mirrors the CLI's guard).
  let churn: ProofProvenanceChurn | null = null;
  const churnEntries = Object.values(process.module_churn ?? {});
  if (churnEntries.length > 0) {
    let added = 0;
    let deleted = 0;
    for (const c of churnEntries) {
      added += c.added;
      deleted += c.deleted;
    }
    churn = { files: churnEntries.length, added, deleted };
  }

  // Completeness — display-only passthrough, or null on pre-completeness entries.
  let completeness: ProofProvenanceCompleteness | null = null;
  if (process.completeness) {
    completeness = {
      complete: process.completeness.complete,
      expected: process.completeness.expected,
      present: process.completeness.present,
    };
  }

  return {
    sessions,
    model: allSameModel && rawSessions.length > 0 ? rawSessions[0]!.derived!.model : null,
    totals: { sessions: rawSessions.length, costUsd: totalCost, unpriced },
    priceTableVersion,
    churn,
    completeness,
  };
}

/**
 * The table-of-contents entry for the Provenance section, or `null` when the
 * proof carries no provenance (so pre-1.3.0 proofs get no dead TOC link).
 *
 * @param entry - The proof entry
 * @returns The TOC item, or `null` when provenance is absent
 */
export function provenanceTocItem(
  entry: ProofEntry,
): { title: string; url: string; depth: number } | null {
  if (!entry.provenance) return null;
  return { title: "Provenance", url: "#provenance", depth: 2 };
}

/**
 * The copy-as-markdown lines for the Provenance section — empty when the proof
 * carries no provenance (so old proofs' copyable content stays byte-identical).
 *
 * @param entry - The proof entry
 * @returns The markdown lines (empty array when provenance is absent)
 */
export function provenanceMarkdownLines(entry: ProofEntry): string[] {
  const p = entry.provenance;
  if (!p) return [];

  const lines: string[] = ["", "## Provenance"];
  if (p.model) lines.push(`model: ${p.model}`);
  for (const s of p.sessions) {
    if (!s.countsAvailable) {
      lines.push(`- ${s.label}: counts unavailable`);
      continue;
    }
    const cost = s.costUsd == null ? "n/a" : `$${s.costUsd.toFixed(2)}`;
    lines.push(
      `- ${s.label}: ${s.turns} turns · ${s.toolCalls} tools · ${s.tokens.input} in · ${s.tokens.output} out · ${s.tokens.cache} cache · ${cost}`,
    );
  }
  const totalCost = p.totals.unpriced > 0 && p.totals.costUsd === 0
    ? "n/a"
    : `$${p.totals.costUsd.toFixed(2)}`;
  const unpricedNote = p.totals.unpriced > 0 ? ` · ${p.totals.unpriced} unpriced` : "";
  const versionNote = p.priceTableVersion ? ` (table ${p.priceTableVersion})` : "";
  lines.push(
    `TOTAL: ${p.totals.sessions} session${p.totals.sessions === 1 ? "" : "s"}${unpricedNote} · ${totalCost}${versionNote}`,
  );
  if (p.churn) {
    lines.push(`churn: ${p.churn.files} files · +${p.churn.added}/−${p.churn.deleted}`);
  }
  if (p.completeness) {
    lines.push(`completeness: ${p.completeness.complete ? "complete" : "incomplete"}`);
  }
  return lines;
}
