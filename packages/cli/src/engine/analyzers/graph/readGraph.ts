/**
 * Import-graph reader.
 *
 * The companion to {@link buildImportGraph}/{@link persistCodeGraph}: reads the
 * persisted `.ana/state/code-graph.json` back into a typed {@link CodeGraph}.
 * This is the shared reader the proof-context layers consume — both the day-1
 * import blast-radius layer and the `hidden`/`imports`/`unknown` relation flag.
 *
 * Fail-soft by construction: an absent, unreadable, unparseable, or malformed
 * graph file yields `null` rather than throwing, so a missing import graph
 * degrades a caller to "no graph data" instead of crashing it. The reader is
 * synchronous (matching `getProofContext`'s sync reads of `.ana/`) so it
 * composes into that synchronous path without infecting it with async.
 *
 * Staleness is intentionally NOT checked here: the reader never inspects the
 * `generated` timestamp. Off-graph files become `unknown` downstream; an aged
 * graph is still returned as-is.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CodeGraph } from './buildGraph.js';

/**
 * Read the persisted import graph for a project.
 *
 * Reads `<projectRoot>/.ana/state/code-graph.json`, parses it, and returns the
 * typed {@link CodeGraph} when present and structurally valid. Returns `null`
 * — never throws — when the file is absent, unreadable, not valid JSON, or
 * does not carry the minimal graph shape (array `nodes` and array `edges`).
 *
 * @param projectRoot - Project root directory (where `.ana/` lives).
 * @returns The typed import graph, or `null` when unavailable/malformed.
 */
export function readCodeGraph(projectRoot: string): CodeGraph | null {
  const graphPath = path.join(projectRoot, '.ana', 'state', 'code-graph.json');

  try {
    const content = fs.readFileSync(graphPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (!isCodeGraph(parsed)) return null;
    return parsed;
  } catch {
    // Absent / unreadable / unparseable graph degrades to "no graph data".
    return null;
  }
}

/**
 * Minimal structural guard: a valid graph is an object with array `nodes` and
 * array `edges`. Conservative — it validates the load-bearing arrays the
 * downstream layers index, not every field, so a forward-compatible graph with
 * extra fields still reads. Anything missing those arrays is treated as
 * malformed and rejected.
 *
 * @param value - The parsed JSON value.
 * @returns Whether `value` carries the minimal {@link CodeGraph} shape.
 */
function isCodeGraph(value: unknown): value is CodeGraph {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate['nodes']) && Array.isArray(candidate['edges']);
}
