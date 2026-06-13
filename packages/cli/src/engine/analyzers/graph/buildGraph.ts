/**
 * Import-graph primitive (Slice 2)
 *
 * Turns the per-file imports extracted by tree-sitter into a deterministic
 * file→file directed graph. Only edges that resolve to a file *inside the
 * repository* are kept: relative specifiers (`./x`, `../y`) and tsconfig path
 * aliases (`@/x`) are resolved against the importing file and the project's
 * tsconfig `paths`/`baseUrl`; bare/external specifiers (`react`, `node:fs`,
 * `@nestjs/common`) resolve to nothing and so produce NO edge.
 *
 * This is the structural substrate Slice 3 runs PageRank over. It is a pure,
 * synchronous function of the parsed files plus the tsconfig metadata the
 * census already gathered — it never re-parses and never mutates `SymbolEntry`
 * (node identity reuses the same repo-relative paths the symbol index keys on).
 *
 * Honesty by construction: an unresolved specifier is dropped, never guessed.
 * Determinism: nodes and edges are emitted in sorted order so two runs over the
 * same inputs are byte-identical.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ParsedAnalysis } from '../../types/parsed.js';
import type { TsconfigEntry } from '../../types/census.js';

/** Extensions tried, in priority order, when a specifier omits one. */
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** Index-file basenames tried when a specifier resolves to a directory. */
const INDEX_BASENAMES = RESOLVE_EXTENSIONS.map((ext) => `index${ext}`);

/**
 * JS/ESM output extensions that, by TS convention, are written in source even
 * though the on-disk file is `.ts`/`.tsx` (NodeNext `import './x.js'` → `x.ts`).
 * These are stripped before extension-resolution so the specifier matches its
 * TypeScript source file.
 */
const REWRITABLE_JS_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs'] as const;

/**
 * One directed edge: `from` imports `to`. Both are repo-relative POSIX paths.
 * `names` carries the imported identifiers (from the now-wired `namedImport`
 * query) when known, for downstream attribution; empty for whole-module or
 * default/namespace imports.
 */
export interface ImportEdge {
  from: string;
  to: string;
  names: string[];
}

/**
 * The persisted import graph. `nodes` is every in-repo file that participated
 * (as an importer or an import target); `edges` is the resolved file→file
 * digraph. Both are sorted for byte-stable output.
 */
export interface CodeGraph {
  /** ISO timestamp the graph was built. */
  generated: string;
  /** Repo-relative POSIX paths of every node, sorted. */
  nodes: string[];
  /** Resolved file→file edges, sorted by (from, to). */
  edges: ImportEdge[];
  /** Files whose imports were considered (the parse universe), sorted. */
  filesAnalyzed: number;
  /** Count of import specifiers that did not resolve in-repo (no edge). */
  unresolved: number;
}

/** A tsconfig path alias compiled to a matcher: prefix + target dirs. */
interface AliasRule {
  /** Literal portion before the `*`, e.g. `@/` for `@/*`. */
  prefix: string;
  /** Whether the alias key ended with `*` (a glob) vs an exact key. */
  glob: boolean;
  /**
   * Resolved target prefixes (repo-relative, no `*`), each the substitution
   * for {@link prefix}. Sorted, longest-prefix-first matching is applied by
   * the caller via key length.
   */
  targets: string[];
}

/** Normalize an OS path to POSIX separators for stable repo-relative keys. */
function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/**
 * Build alias rules from the census tsconfig entries.
 *
 * Each `paths` key like `@/*` → `["./src/*"]` becomes a rule whose targets are
 * resolved relative to the tsconfig's own directory and `baseUrl`, expressed
 * as repo-relative POSIX prefixes. Non-alias keys (bare module remaps without
 * a trailing `/*`, or `*` catch-alls) are handled too: an exact key maps the
 * whole specifier. Keys are returned longest-first so the most specific alias
 * wins.
 *
 * @param tsconfigs - Census tsconfig entries (may be empty).
 * @returns Alias rules sorted by descending prefix length (specific first).
 */
function compileAliasRules(tsconfigs: TsconfigEntry[]): AliasRule[] {
  const rules: AliasRule[] = [];

  for (const tsconfig of tsconfigs) {
    if (!tsconfig.paths) continue;
    // The tsconfig path is repo-relative; its directory anchors baseUrl/paths.
    const tsconfigDir = toPosix(path.dirname(tsconfig.path));
    const base = tsconfig.baseUrl ?? '.';

    for (const [key, rawTargets] of Object.entries(tsconfig.paths)) {
      const glob = key.endsWith('/*') || key === '*';
      const prefix = glob ? key.slice(0, key.length - 1) : key; // drop trailing '*'

      const targets: string[] = [];
      for (const rawTarget of rawTargets) {
        const targetGlob = rawTarget.endsWith('/*') || rawTarget === '*';
        const targetPrefix = targetGlob ? rawTarget.slice(0, rawTarget.length - 1) : rawTarget;
        // Resolve target against <tsconfigDir>/<baseUrl>, repo-relative.
        const resolved = toPosix(path.posix.normalize(
          path.posix.join(tsconfigDir === '.' ? '' : tsconfigDir, base, targetPrefix),
        ));
        targets.push(resolved.replace(/^\.\//, ''));
      }
      if (targets.length > 0) {
        rules.push({ prefix, glob, targets });
      }
    }
  }

  // Longest prefix first so `@/lib/*` beats `@/*`. Tie-break on prefix for
  // determinism.
  rules.sort((a, b) => (b.prefix.length - a.prefix.length) || (a.prefix < b.prefix ? -1 : 1));
  return rules;
}

/**
 * Resolve one candidate repo-relative path (no extension assumptions) to a
 * file that exists in the known node universe.
 *
 * Tries the path as-is, then with each known extension, then as a directory
 * index. The universe is the set of parsed files — using it (rather than the
 * filesystem) keeps resolution deterministic and confined to source files the
 * scan actually parsed.
 *
 * @param candidate - Repo-relative POSIX path, possibly extension-less.
 * @param universe - Set of all known repo-relative file paths.
 * @returns The matching in-repo file, or `null` if none matches.
 */
function resolveInUniverse(candidate: string, universe: Set<string>): string | null {
  const normalized = candidate.replace(/^\.\//, '');

  // Exact (specifier already carried a matching extension).
  if (universe.has(normalized)) return normalized;

  // TS NodeNext convention: source writes `import './x.js'` but the file on
  // disk is `x.ts`/`x.tsx`. Strip the JS-output extension and re-resolve so the
  // edge lands on the TypeScript source (e.g. `./census.js` → `census.ts`).
  for (const jsExt of REWRITABLE_JS_EXTENSIONS) {
    if (normalized.endsWith(jsExt)) {
      const stem = normalized.slice(0, normalized.length - jsExt.length);
      for (const ext of RESOLVE_EXTENSIONS) {
        if (universe.has(stem + ext)) return stem + ext;
      }
    }
  }

  // Extension-less: try each known extension.
  for (const ext of RESOLVE_EXTENSIONS) {
    if (universe.has(normalized + ext)) return normalized + ext;
  }

  // Directory import: try index files.
  for (const idx of INDEX_BASENAMES) {
    const withIndex = normalized === '' ? idx : `${normalized}/${idx}`;
    if (universe.has(withIndex)) return withIndex;
  }

  return null;
}

/**
 * Resolve a single import specifier from a given file to an in-repo file.
 *
 * Relative specifiers are resolved against the importer's directory; alias
 * specifiers are rewritten through the tsconfig rules and then resolved.
 * Bare/external specifiers (anything else — `react`, `node:fs`, scoped
 * packages) return `null`, which the caller treats as NO edge.
 *
 * @param fromFile - Repo-relative path of the importing file.
 * @param specifier - The raw module specifier (quotes already stripped).
 * @param universe - Set of all known repo-relative file paths.
 * @param aliasRules - Compiled tsconfig alias rules (specific-first).
 * @returns The resolved repo-relative target, or `null` when out-of-repo.
 */
function resolveSpecifier(
  fromFile: string,
  specifier: string,
  universe: Set<string>,
  aliasRules: AliasRule[],
): string | null {
  // Relative import: anchor to the importing file's directory.
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const fromDir = toPosix(path.posix.dirname(fromFile));
    const joined = toPosix(path.posix.normalize(path.posix.join(fromDir, specifier)));
    // normalize can yield a leading '../' that escapes the repo — no edge.
    if (joined.startsWith('../')) return null;
    return resolveInUniverse(joined, universe);
  }

  // tsconfig path alias: try the most specific matching rule.
  for (const rule of aliasRules) {
    const matches = rule.glob
      ? specifier.startsWith(rule.prefix)
      : specifier === rule.prefix;
    if (!matches) continue;

    const remainder = rule.glob ? specifier.slice(rule.prefix.length) : '';
    for (const target of rule.targets) {
      const candidate = rule.glob
        ? toPosix(path.posix.normalize(path.posix.join(target, remainder)))
        : target;
      const resolved = resolveInUniverse(candidate, universe);
      if (resolved) return resolved;
    }
    // A matching alias whose targets don't land on a real file: no edge,
    // but don't fall through to treating it as relative.
    return null;
  }

  // Bare/external (npm package, node builtin, unaliased) — not in-repo.
  return null;
}

/**
 * Build the deterministic file→file import digraph from parsed files.
 *
 * Fail-soft per file: a file with no resolvable imports simply contributes no
 * edges. Node identity is the repo-relative POSIX path (the same key the
 * symbol index uses) — `SymbolEntry` is never touched.
 *
 * @param parsed - The deep-tier parsed analysis (files carry `imports[]`).
 * @param tsconfigs - Census tsconfig entries for alias resolution (may be []).
 * @param projectRoot - Absolute project root used to relativize file paths so
 *   node identity is repo-relative (the same key the symbol index uses).
 *   Parsed files may carry absolute paths; passing the root makes the graph
 *   portable and aligned. Defaults to `''` (paths used as-is) for callers that
 *   already supply repo-relative paths.
 * @returns A {@link CodeGraph} with sorted nodes and edges.
 */
export function buildImportGraph(
  parsed: ParsedAnalysis,
  tsconfigs: TsconfigEntry[],
  projectRoot: string = '',
): CodeGraph {
  // Relativize once: parsed file paths may be absolute, but node identity is
  // repo-relative POSIX (matching the symbol index). The toRel closure is the
  // single source of truth for that conversion.
  const toRel = (p: string): string => {
    const rel = projectRoot ? path.relative(projectRoot, p) : p;
    return toPosix(rel);
  };

  const universe = new Set(parsed.files.map((f) => toRel(f.file)));
  const aliasRules = compileAliasRules(tsconfigs);

  // Dedupe edges on (from, to); merge names so a file importing the same
  // target twice contributes one edge with the union of identifiers.
  const edgeMap = new Map<string, { from: string; to: string; names: string[] }>();
  const nodeSet = new Set<string>();
  let unresolved = 0;

  for (const file of parsed.files) {
    const fromFile = toRel(file.file);
    for (const imp of file.imports) {
      const to = resolveSpecifier(fromFile, imp.module, universe, aliasRules);
      if (to === null) {
        unresolved += 1;
        continue;
      }
      // Don't record self-edges (a file re-importing through an index alias
      // that points back at itself) — they add no graph structure.
      if (to === fromFile) continue;

      nodeSet.add(fromFile);
      nodeSet.add(to);

      const key = `${fromFile} ${to}`;
      const existing = edgeMap.get(key);
      if (existing) {
        for (const name of imp.names) {
          if (!existing.names.includes(name)) existing.names.push(name);
        }
      } else {
        edgeMap.set(key, { from: fromFile, to, names: [...imp.names] });
      }
    }
  }

  const edges: ImportEdge[] = Array.from(edgeMap.values())
    .map((e) => ({ from: e.from, to: e.to, names: e.names.slice().sort() }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0));

  const nodes = Array.from(nodeSet).sort();

  return {
    generated: new Date().toISOString(),
    nodes,
    edges,
    filesAnalyzed: parsed.files.length,
    unresolved,
  };
}

/**
 * Persist a {@link CodeGraph} to `<stateDir>/code-graph.json`.
 *
 * `stateDir` is the `.ana/state` directory (or its staging equivalent during
 * init's atomic swap) — the same convention `buildSymbolIndex` uses for
 * `symbol-index.json`. Only write contexts (init, the completeWork rescan)
 * call this; `ana scan` never does, so the scan stays read-only.
 *
 * Fail-soft: a write/mkdir error is swallowed so graph persistence never
 * blocks or crashes the caller (the graph is a derived artifact, regenerable
 * on the next deep scan). The output is pretty-printed and deterministic given
 * deterministic input (modulo the `generated` timestamp).
 *
 * @param stateDir - Absolute path to the `.ana/state` directory to write into.
 * @param graph - The graph produced by {@link buildImportGraph}.
 */
export async function persistCodeGraph(stateDir: string, graph: CodeGraph): Promise<void> {
  try {
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, 'code-graph.json'),
      JSON.stringify(graph, null, 2),
      'utf-8',
    );
  } catch {
    // Persisting the graph is best-effort; never block the caller.
  }
}
