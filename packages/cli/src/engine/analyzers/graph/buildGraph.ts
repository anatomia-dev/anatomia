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
import type { ParsedAnalysis, ParsedFile } from '../../types/parsed.js';
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
  /**
   * Raw import in-degree per node: the number of DISTINCT in-repo files that
   * import it (deduped on `from`, so a file importing the same target twice
   * counts once). This is the ground-truth "how many files depend on this"
   * signal the reading-order fusion blends with PageRank and uses as the
   * top-decile sanity floor. Keyed by repo-relative POSIX path.
   */
  inDegree: Record<string, number>;
  /**
   * Files that are pure barrel / re-export modules (`export *` / `export type *`
   * with no own declarations) — they inherit centrality without being a real
   * architectural hub, so the fusion down-weights them. Repo-relative, sorted.
   */
  barrelFiles: string[];
  /**
   * Generated / vendored files (`generated/**`, `*.gen.*`, `public/sdk-*`,
   * `*.d.ts`) — high fan-in but not "read these first" material. Down-weighted
   * by the fusion. Repo-relative, sorted.
   */
  generatedFiles: string[];
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
  /**
   * The repo-relative directory of the tsconfig that DECLARED this alias
   * (`''` for the repo root). Used to resolve the SAME alias key (e.g. `@/*`,
   * which most monorepo packages redefine) against the importing file's
   * nearest-enclosing tsconfig first, so `@/x` in `apps/web` doesn't leak to
   * `apps/docs`'s target.
   */
  scopeDir: string;
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
        rules.push({ prefix, glob, targets, scopeDir: tsconfigDir === '.' ? '' : tsconfigDir });
      }
    }
  }

  // Longest prefix first so `@/lib/*` beats `@/*`. Tie-break on prefix for
  // determinism. (Per-file nearest-scope preference is applied at resolve time,
  // not here — this is the global, scope-agnostic ordering.)
  rules.sort((a, b) => (b.prefix.length - a.prefix.length) || (a.prefix < b.prefix ? -1 : 1));
  return rules;
}

/**
 * Framework-default aliases that are injected by the bundler/framework rather
 * than declared in tsconfig `paths`, so they never appear in the census entries
 * yet are the dominant import form in their ecosystems. Resolved against the
 * nearest enclosing source-root convention.
 *
 *  - `$lib` / `$lib/*` → SvelteKit's `src/lib` (auto-injected by SvelteKit).
 *  - `~/*` → a common Nuxt/convention root alias when no tsconfig path declares
 *    it; mapped to the nearest `src/` then the scope dir.
 *
 * These are tried ONLY after real tsconfig rules and only when the specifier
 * actually lands on an in-repo file, so they never fabricate an edge.
 */
const FRAMEWORK_ALIAS_PREFIXES: ReadonlyArray<{ prefix: string; subdirs: string[] }> = [
  { prefix: '$lib/', subdirs: ['src/lib', 'lib'] },
  { prefix: '$lib', subdirs: ['src/lib', 'lib'] },
];

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
  workspacePackages: ReadonlyMap<string, string>,
): string | null {
  // Relative import: anchor to the importing file's directory.
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const fromDir = toPosix(path.posix.dirname(fromFile));
    const joined = toPosix(path.posix.normalize(path.posix.join(fromDir, specifier)));
    // normalize can yield a leading '../' that escapes the repo — no edge.
    if (joined.startsWith('../')) return null;
    return resolveInUniverse(joined, universe);
  }

  const fromDir = toPosix(path.posix.dirname(fromFile));

  // tsconfig path alias. The SAME alias key (e.g. `@/*`) is redefined per
  // package in a monorepo, so prefer rules whose declaring tsconfig dir is an
  // ancestor of the importing file (nearest-enclosing first); only then fall
  // back to other scopes. Within the same scope-distance, longest-prefix wins
  // (rules are pre-sorted by prefix length).
  const matching = aliasRules.filter((rule) =>
    rule.glob ? specifier.startsWith(rule.prefix) : specifier === rule.prefix,
  );
  if (matching.length > 0) {
    // Score: nearest enclosing scope first (longest scopeDir that prefixes
    // fromFile), then the pre-existing prefix-length order (stable sort keeps it).
    const isEnclosing = (scopeDir: string): boolean =>
      scopeDir === '' || fromDir === scopeDir || fromDir.startsWith(`${scopeDir}/`);
    const scoped = matching
      .map((rule) => ({
        rule,
        enclosing: isEnclosing(rule.scopeDir),
        scopeLen: rule.scopeDir.length,
      }))
      .sort((a, b) => {
        if (a.enclosing !== b.enclosing) return a.enclosing ? -1 : 1;
        return b.scopeLen - a.scopeLen; // deeper (more specific) scope first
      });

    for (const { rule } of scoped) {
      const remainder = rule.glob ? specifier.slice(rule.prefix.length) : '';
      for (const target of rule.targets) {
        const candidate = rule.glob
          ? toPosix(path.posix.normalize(path.posix.join(target, remainder)))
          : target;
        const resolved = resolveInUniverse(candidate, universe);
        if (resolved) return resolved;
      }
    }
    // Alias matched but no target landed in-repo: don't treat it as relative,
    // but DO let the framework/workspace fallbacks below have a shot (a `@/`
    // alias may be unconfigured in this scope yet resolvable by convention).
  }

  // Workspace package import (`@scope/pkg`, `pkg`, or a deep `@scope/pkg/sub`):
  // resolve to the package's in-repo directory + sub-path. Lets monorepo
  // cross-package edges (the real architecture) enter the graph.
  const wsHit = resolveWorkspaceImport(specifier, universe, workspacePackages);
  if (wsHit) return wsHit;

  // Framework-default aliases ($lib for SvelteKit, etc.) — only when they land
  // on a real file, anchored at the nearest source-root convention.
  for (const fw of FRAMEWORK_ALIAS_PREFIXES) {
    const matches = fw.prefix.endsWith('/')
      ? specifier.startsWith(fw.prefix)
      : specifier === fw.prefix || specifier.startsWith(`${fw.prefix}/`);
    if (!matches) continue;
    const remainder = specifier === fw.prefix
      ? ''
      : specifier.slice(fw.prefix.endsWith('/') ? fw.prefix.length : fw.prefix.length + 1);
    // Try each candidate source-root base, walking up from the importing dir so
    // a package-local `src/lib` is preferred over the repo root's.
    for (const base of ancestorDirs(fromDir)) {
      for (const subdir of fw.subdirs) {
        const candidate = toPosix(path.posix.normalize(
          path.posix.join(base, subdir, remainder),
        ));
        const resolved = resolveInUniverse(candidate, universe);
        if (resolved) return resolved;
      }
    }
  }

  // Bare/external (npm package, node builtin, unaliased) — not in-repo.
  return null;
}

/**
 * Resolve an import of an in-repo workspace package to a concrete file.
 *
 * Given `@scope/db` or `@scope/db/client` and a map of package name → its
 * repo-relative root dir, rewrite the specifier to `<pkgDir>/<sub>` (defaulting
 * to `src/index` / `index` when the sub-path is empty, the package's entry).
 * Only returns when the result lands on a real in-repo file — cross-package
 * edges that resolve to a published-but-not-sampled file produce no edge.
 */
function resolveWorkspaceImport(
  specifier: string,
  universe: Set<string>,
  workspacePackages: ReadonlyMap<string, string>,
): string | null {
  if (workspacePackages.size === 0) return null;
  if (specifier.startsWith('.')) return null;

  // Longest package-name match (so `@scope/db/sub` matches `@scope/db`, not a
  // hypothetical `@scope`). Names are matched on a path boundary.
  let best: { name: string; dir: string } | null = null;
  for (const [name, dir] of workspacePackages) {
    if (specifier === name || specifier.startsWith(`${name}/`)) {
      if (!best || name.length > best.name.length) best = { name, dir };
    }
  }
  if (!best) return null;

  const sub = specifier === best.name ? '' : specifier.slice(best.name.length + 1);
  // Try the explicit sub-path, then conventional entry points under the pkg dir.
  const candidates = sub
    ? [
        path.posix.join(best.dir, sub),
        path.posix.join(best.dir, 'src', sub),
      ]
    : [
        path.posix.join(best.dir, 'src', 'index'),
        path.posix.join(best.dir, 'index'),
        path.posix.join(best.dir, 'src'),
      ];
  for (const c of candidates) {
    const resolved = resolveInUniverse(toPosix(path.posix.normalize(c)), universe);
    if (resolved) return resolved;
  }
  return null;
}

/** Ancestor directories of `dir`, nearest-first, down to the repo root (''). */
function ancestorDirs(dir: string): string[] {
  const out: string[] = [];
  let cur = dir;
  while (cur && cur !== '.' && cur !== '/') {
    out.push(cur);
    const parent = toPosix(path.posix.dirname(cur));
    if (parent === cur) break;
    cur = parent === '.' ? '' : parent;
  }
  out.push(''); // repo root
  return out;
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
 * @param workspacePackages - Map of in-repo workspace package name →
 *   repo-relative package dir (e.g. `@calcom/lib` → `packages/lib`). Lets
 *   monorepo cross-package imports (`import … from '@scope/pkg'`) resolve to a
 *   real in-repo file and so enter the graph. Empty when not a monorepo.
 * @returns A {@link CodeGraph} with sorted nodes, edges, raw in-degree, and the
 *   barrel/generated down-weight sets.
 */
export function buildImportGraph(
  parsed: ParsedAnalysis,
  tsconfigs: TsconfigEntry[],
  projectRoot: string = '',
  workspacePackages: ReadonlyMap<string, string> = new Map(),
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
      const to = resolveSpecifier(fromFile, imp.module, universe, aliasRules, workspacePackages);
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

  // Raw in-degree: distinct importers per target (edges are already deduped on
  // (from, to), so a single pass over edges is the exact distinct-importer count).
  const inDegree: Record<string, number> = {};
  for (const node of nodes) inDegree[node] = 0;
  for (const e of edges) inDegree[e.to] = (inDegree[e.to] ?? 0) + 1;

  // Down-weight signals: pure barrel/re-export files and generated/vendored
  // files inherit fan-in without being real "read these first" hubs.
  const parsedByRel = new Map<string, ParsedFile>();
  for (const f of parsed.files) parsedByRel.set(toRel(f.file), f);
  const barrelFiles = nodes
    .filter((n) => {
      const f = parsedByRel.get(n);
      return f ? isBarrelFile(f) : false;
    })
    .sort();
  const generatedFiles = nodes.filter((n) => isGeneratedPath(n)).sort();

  return {
    generated: new Date().toISOString(),
    nodes,
    edges,
    filesAnalyzed: parsed.files.length,
    unresolved,
    inDegree,
    barrelFiles,
    generatedFiles,
  };
}

/**
 * A pure barrel / re-export module: it has exports but declares NO own
 * functions or classes (it only re-exports — `export *`, `export { x } from
 * './y'`). Such files accumulate import fan-in (everything imports through the
 * barrel) without being the real implementation hub, so the reading-order
 * fusion down-weights them. Conservative — when in doubt it is NOT a barrel.
 */
function isBarrelFile(f: ParsedFile): boolean {
  const exportCount = f.exports?.length ?? 0;
  if (exportCount === 0) return false;
  const ownDecls = f.functions.length + f.classes.length;
  if (ownDecls > 0) return false;
  // Require ≥1 import so a pure constant-export module isn't misflagged: a
  // barrel re-exports its neighbours, so it always imports/re-exports from them.
  return f.imports.length > 0;
}

/**
 * Generated / vendored paths that earn high fan-in but are not architectural
 * reading material: `generated/**`, `__generated__/**`, `*.gen.*`,
 * `*.generated.*`, `public/sdk-*`, and ambient `*.d.ts` type shims.
 */
function isGeneratedPath(p: string): boolean {
  return (
    /(^|\/)generated\//.test(p) ||
    /(^|\/)__generated__\//.test(p) ||
    /\.gen\.[a-z]+$/i.test(p) ||
    /\.generated\.[a-z]+$/i.test(p) ||
    /(^|\/)public\/sdk-/.test(p) ||
    /\.d\.ts$/i.test(p)
  );
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
