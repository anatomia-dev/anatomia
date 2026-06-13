/**
 * Active-scope discovery for reading-order personalization (Slice 3)
 *
 * Finds the single active work item under `.ana/plans/active/<slug>/scope.md`
 * and extracts its "Files affected" list, so the fused reading list can rank
 * the files the current task touches to the top. This is the machine-readable
 * intent signal that Aider/repowise structurally can't see — it comes straight
 * from Ana's own scope artifact.
 *
 * Honesty by construction: returns `null` unless there is exactly one active
 * scope with a parseable "Files affected" line carrying at least one path.
 * Multiple active scopes is ambiguous (which task are we reading for?) so we
 * decline to guess. Pure of CLI deps (engine boundary); fail-soft on every I/O.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** The active scope slug plus the repo-relative files it declares it touches. */
export interface ActiveScope {
  /** The scope slug (the `.ana/plans/active/<slug>` directory name). */
  slug: string;
  /** Repo-relative POSIX paths parsed from the "Files affected" line. */
  files: string[];
}

/**
 * Extract repo-relative file paths from a scope.md "Files affected" bullet.
 *
 * The line is free-form (`- **Files affected:** \`a.ts\`, \`b.ts\` (note)`),
 * so we pull every backtick-wrapped token first (the authoritative form), then
 * fall back to bare path-like tokens (containing a `/` and a file extension)
 * when no backticks are present. Counts (`2 production`), prose, and parenthetical
 * notes are ignored. Paths are normalized to POSIX and de-`packages/cli/`-prefixed
 * is NOT done here — callers relativize against the scanned root.
 *
 * @param content - Full scope.md text.
 * @returns Unique file paths in document order, or `[]` when none found.
 */
export function parseFilesAffected(content: string): string[] {
  const match = content.match(/^[-*]\s*\*\*Files affected:\*\*\s*(.+)$/im);
  if (!match || !match[1]) return [];
  const line = match[1];

  const files: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string): void => {
    const p = raw.trim().split(path.sep).join('/');
    if (p && !seen.has(p)) {
      seen.add(p);
      files.push(p);
    }
  };

  // Backtick-wrapped tokens are the authoritative form — prefer them.
  const backticks = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '');
  if (backticks.length > 0) {
    for (const b of backticks) {
      // A backtick token is a path only if it looks like one (has a separator
      // or a file extension) — skip stray inline code that isn't a file.
      if (b.includes('/') || /\.[a-z0-9]+$/i.test(b)) add(b);
    }
    if (files.length > 0) return files;
  }

  // Fallback: bare path-like tokens (a slash AND an extension) on the line.
  for (const token of line.split(/[\s,()]+/)) {
    if (token.includes('/') && /\.[a-z0-9]+$/i.test(token)) add(token);
  }
  return files;
}

/**
 * Normalize a scope file path to the same repo-relative POSIX identity the
 * import graph uses. Scope files are often written from the repo root
 * (`packages/cli/src/x.ts`) while the graph nodes are relative to the scanned
 * package root (`src/x.ts`); when a `rootSegment` is supplied (the scanned
 * root's path relative to the repo, e.g. `packages/cli`), a leading match is
 * stripped so the two identities line up.
 *
 * @param file - The raw POSIX path parsed from scope.md.
 * @param rootSegment - The scanned root relative to the repo root, or `''`.
 * @returns The path rebased onto the scanned root's node identity.
 */
function rebaseToRoot(file: string, rootSegment: string): string {
  if (!rootSegment) return file;
  const prefix = `${rootSegment}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
}

/**
 * Discover the single active scope under `<projectRoot>/.ana/plans/active` and
 * read its "Files affected" list, rebased onto the scanned root's node identity.
 *
 * Fail-soft: returns `null` when there is no active dir, no active scope, more
 * than one active scope (ambiguous — we won't guess), or the lone scope has no
 * parseable files. Never throws.
 *
 * @param projectRoot - Absolute path to the directory containing `.ana/`.
 * @param rootSegment - The scanned root relative to the repo root (for path
 *   rebasing), or `''` when the scanned root is the repo root.
 * @returns The active scope's slug + files, or `null`.
 */
export async function findActiveScope(
  projectRoot: string,
  rootSegment: string = '',
): Promise<ActiveScope | null> {
  const activeDir = path.join(projectRoot, '.ana', 'plans', 'active');

  let slugDirs: string[];
  try {
    const entries = await fs.readdir(activeDir, { withFileTypes: true });
    slugDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return null; // no active plans dir
  }

  // Exactly one active scope is unambiguous; zero or many → decline.
  if (slugDirs.length !== 1) return null;
  const slug = slugDirs[0]!;

  let content: string;
  try {
    content = await fs.readFile(path.join(activeDir, slug, 'scope.md'), 'utf-8');
  } catch {
    return null; // scope.md missing
  }

  const files = parseFilesAffected(content)
    .map((f) => rebaseToRoot(f, rootSegment))
    .filter((f) => f.length > 0);
  if (files.length === 0) return null;

  return { slug, files };
}
