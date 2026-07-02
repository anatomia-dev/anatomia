/**
 * Requirement state computation.
 *
 * Leaf module modeled on {@link ./work-state.ts}: pure state + git, returns data.
 * No chalk / commander — the command layer (`req.ts`) owns all presentation. Keeps
 * `work.ts` (the proof-chain hot spot) from absorbing requirement logic.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runGit } from '../utils/git-operations.js';
import { discoverSlugs, readFileOnBranch } from './work-state.js';
import { validateReqContent } from './artifact-validators.js';
import {
  parseRequirement,
  serializeRequirement,
  canonicalizeEnumValue,
  PRIORITY_ORDER,
} from '../utils/req-frontmatter.js';

const REQUIREMENTS_DIR = '.ana/requirements';

/**
 * A single row in the requirement list. Malformed rows carry `req`, `malformed`,
 * and `error` only; well-formed rows carry the parsed frontmatter fields.
 */
export interface RequirementListItem {
  /** Requirement id (filename stem). */
  req: string;
  /** True when the file could not be parsed/validated. */
  malformed: boolean;
  /** True when a claimed requirement's `claimed_by` slug is no longer active. */
  stale: boolean;
  /** Priority (well-formed rows only). */
  priority?: string;
  /** Status (well-formed rows only). */
  status?: string;
  /** ISO created date (well-formed rows only). */
  created?: string;
  /** One-line title (well-formed rows only). */
  title?: string;
  /** Claiming work-item slug, when claimed. */
  claimed_by?: string;
  /** Human error message (malformed rows only). */
  error?: string;
}

/**
 * The cheap status probe result — open count and highest priority among open
 * requirements.
 */
export interface RequirementsSummary {
  /** Number of requirements with `status: open`. */
  open: number;
  /** Highest priority among the open requirements, by {@link PRIORITY_ORDER}. */
  highestPriority: string;
}

/**
 * Rank a priority by {@link PRIORITY_ORDER} — lower index is higher priority.
 * Unknown/blank priorities sort after every known value.
 *
 * @param priority - The (already canonicalized) priority string
 * @returns The sort rank (lower = higher priority)
 */
function priorityRank(priority: string): number {
  const idx = (PRIORITY_ORDER as readonly string[]).indexOf(priority);
  return idx === -1 ? PRIORITY_ORDER.length : idx;
}

/**
 * Enumerate requirement files in `.ana/requirements/` (root only, not
 * `archived/`). Dual-mode: filesystem on the artifact branch, `git ls-tree`
 * otherwise. A non-zero git exit yields `[]`.
 *
 * @param projectRoot - Project root path
 * @param artifactBranch - Artifact branch name
 * @param onArtifactBranch - Whether currently on the artifact branch
 * @returns Requirement filenames (e.g. `REQ-foo.md`), root only
 */
export function discoverRequirements(
  projectRoot: string,
  artifactBranch: string,
  onArtifactBranch: boolean,
): string[] {
  if (onArtifactBranch) {
    const fullPath = path.join(projectRoot, REQUIREMENTS_DIR);
    if (!fs.existsSync(fullPath)) return [];
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .filter(name => name.endsWith('.md'));
  } else {
    const lsResult = runGit(['ls-tree', '--name-only', `origin/${artifactBranch}`, `${REQUIREMENTS_DIR}/`]);
    if (lsResult.exitCode !== 0 || !lsResult.stdout) return [];
    return lsResult.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => path.basename(line))
      .filter(name => name.endsWith('.md'));
  }
}

/**
 * Read a root requirement file's content, dual-mode.
 *
 * @param projectRoot - Project root path
 * @param artifactBranch - Artifact branch name
 * @param onArtifactBranch - Whether currently on the artifact branch
 * @param reqFile - Requirement filename (e.g. `REQ-foo.md`)
 * @returns File content, or null when unreadable
 */
function readRequirementContent(
  projectRoot: string,
  artifactBranch: string,
  onArtifactBranch: boolean,
  reqFile: string,
): string | null {
  if (onArtifactBranch) {
    try {
      return fs.readFileSync(path.join(projectRoot, REQUIREMENTS_DIR, reqFile), 'utf-8');
    } catch {
      return null;
    }
  }
  return readFileOnBranch(`origin/${artifactBranch}`, `${REQUIREMENTS_DIR}/${reqFile}`);
}

/**
 * Build the full requirement list. Parses each discovered file; on parse or
 * validation failure marks the row `malformed` (never throws); cross-references
 * `claimed_by` against active work-item slugs to set `stale`. Sorted by priority
 * then created date.
 *
 * @param projectRoot - Project root path
 * @param artifactBranch - Artifact branch name
 * @param onArtifactBranch - Whether currently on the artifact branch
 * @returns The sorted requirement list
 */
export function buildRequirementList(
  projectRoot: string,
  artifactBranch: string,
  onArtifactBranch: boolean,
): RequirementListItem[] {
  const files = discoverRequirements(projectRoot, artifactBranch, onArtifactBranch);
  const activeSlugs = new Set(discoverSlugs(artifactBranch, onArtifactBranch, projectRoot));

  const items: RequirementListItem[] = files.map(file => {
    const req = path.basename(file, '.md');
    const content = readRequirementContent(projectRoot, artifactBranch, onArtifactBranch, file);
    if (content === null) {
      return { req, malformed: true, stale: false, error: 'could not read requirement file' };
    }

    const validationError = validateReqContent(content, req);
    if (validationError) {
      return { req, malformed: true, stale: false, error: validationError };
    }

    const { frontmatter } = parseRequirement(content);
    const status = canonicalizeEnumValue(frontmatter['status']);
    const claimedBy = typeof frontmatter['claimed_by'] === 'string' ? frontmatter['claimed_by'] : undefined;
    // A claimed requirement is stale when its claiming slug is no longer active.
    const stale = status === 'claimed' && !!claimedBy && !activeSlugs.has(claimedBy);

    const item: RequirementListItem = {
      req,
      malformed: false,
      stale,
      priority: canonicalizeEnumValue(frontmatter['priority']),
      status,
      created: typeof frontmatter['created'] === 'string' ? frontmatter['created'] : String(frontmatter['created'] ?? ''),
    };
    if (typeof frontmatter['title'] === 'string') item.title = frontmatter['title'];
    if (claimedBy !== undefined) item.claimed_by = claimedBy;
    return item;
  });

  // Sort by priority (malformed last), then by created date ascending.
  return items.sort((a, b) => {
    if (a.malformed !== b.malformed) return a.malformed ? 1 : -1;
    const rankDiff = priorityRank(a.priority ?? '') - priorityRank(b.priority ?? '');
    if (rankDiff !== 0) return rankDiff;
    return (a.created ?? '').localeCompare(b.created ?? '');
  });
}

/**
 * The status probe — counts open requirements and finds the highest priority
 * among them. Reads ONLY the requirements directory (no config files). Wrapped so
 * ANY error yields `null` — the probe never disrupts `ana work status`.
 *
 * @param projectRoot - Project root path
 * @param artifactBranch - Artifact branch name
 * @param onArtifactBranch - Whether currently on the artifact branch
 * @returns The summary, or null when there are no open requirements or on any error
 */
export function getRequirementsSummary(
  projectRoot: string,
  artifactBranch: string,
  onArtifactBranch: boolean,
): RequirementsSummary | null {
  try {
    const files = discoverRequirements(projectRoot, artifactBranch, onArtifactBranch);
    let open = 0;
    let bestRank = Infinity;
    let highestPriority = 'unset';

    for (const file of files) {
      const content = readRequirementContent(projectRoot, artifactBranch, onArtifactBranch, file);
      if (content === null) continue;
      let frontmatter: Record<string, unknown>;
      try {
        ({ frontmatter } = parseRequirement(content));
      } catch {
        continue; // malformed files never count toward the open probe
      }
      if (canonicalizeEnumValue(frontmatter['status']) !== 'open') continue;
      open += 1;
      const priority = canonicalizeEnumValue(frontmatter['priority']) || 'unset';
      const rank = priorityRank(priority);
      if (rank < bestRank) {
        bestRank = rank;
        highestPriority = priority;
      }
    }

    if (open === 0) return null;
    return { open, highestPriority };
  } catch {
    return null;
  }
}

/**
 * Resolve a requirement id to exactly one root requirement file. The id may be
 * given with or without the `.md` suffix.
 *
 * @param projectRoot - Project root path
 * @param reqId - Requirement id (e.g. `REQ-foo`)
 * @returns Absolute path to the requirement file
 * @throws When the requirement is missing or ambiguous (naming both paths)
 */
function resolveRequirementPath(projectRoot: string, reqId: string): string {
  const stem = reqId.endsWith('.md') ? reqId.slice(0, -3) : reqId;
  const rootPath = path.join(projectRoot, REQUIREMENTS_DIR, `${stem}.md`);
  const archivedPath = path.join(projectRoot, REQUIREMENTS_DIR, 'archived', `${stem}.md`);

  const rootExists = fs.existsSync(rootPath);
  const archivedExists = fs.existsSync(archivedPath);

  if (rootExists && archivedExists) {
    throw new Error(
      `Requirement '${stem}' is ambiguous — it exists in both:\n  ${rootPath}\n  ${archivedPath}\nResolve the duplicate before claiming.`,
    );
  }
  if (!rootExists) {
    throw new Error(`Requirement '${stem}' not found at ${rootPath}.`);
  }
  return rootPath;
}

/**
 * Claim a requirement for a work item: rewrite frontmatter to `status: claimed`
 * and `claimed_by: <slug>`. Throws typed errors (missing, ambiguous, not open)
 * the caller surfaces — claiming is explicit user intent, so failure is loud.
 *
 * @param projectRoot - Project root path
 * @param reqId - Requirement id to claim
 * @param slug - The claiming work-item slug
 * @returns The claimed requirement's file path
 * @throws When the requirement is missing, ambiguous, or not `open`
 */
export function claimRequirement(projectRoot: string, reqId: string, slug: string): { path: string } {
  const reqPath = resolveRequirementPath(projectRoot, reqId);
  const content = fs.readFileSync(reqPath, 'utf-8');
  const { frontmatter, body } = parseRequirement(content);

  const status = canonicalizeEnumValue(frontmatter['status']);
  if (status !== 'open') {
    throw new Error(`Requirement '${path.basename(reqPath, '.md')}' is '${status || 'unknown'}', not 'open'. Only open requirements can be claimed.`);
  }

  const updated: Record<string, unknown> = { ...frontmatter, status: 'claimed', claimed_by: slug };
  fs.writeFileSync(reqPath, serializeRequirement(updated, body), 'utf-8');
  return { path: reqPath };
}

/**
 * Archive every root requirement claimed by `slug`: move it to
 * `.ana/requirements/archived/` with `status: archived` and
 * `resolution: completed`. Returns the moved file paths. The caller wraps this
 * best-effort — a failure here must never block completion.
 *
 * @param projectRoot - Project root path
 * @param slug - The completing work-item slug
 * @returns The archived-to file paths (may be empty)
 */
export function archiveRequirementsForSlug(projectRoot: string, slug: string): string[] {
  const rootDir = path.join(projectRoot, REQUIREMENTS_DIR);
  if (!fs.existsSync(rootDir)) return [];

  const archivedDir = path.join(rootDir, 'archived');
  const moved: string[] = [];

  const files = fs.readdirSync(rootDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name);

  for (const file of files) {
    const srcPath = path.join(rootDir, file);
    const content = fs.readFileSync(srcPath, 'utf-8');
    const { frontmatter, body } = parseRequirement(content);
    if (frontmatter['claimed_by'] !== slug) continue;

    const updated: Record<string, unknown> = { ...frontmatter, status: 'archived', resolution: 'completed' };
    fs.mkdirSync(archivedDir, { recursive: true });
    const destPath = path.join(archivedDir, file);
    fs.writeFileSync(destPath, serializeRequirement(updated, body), 'utf-8');
    fs.rmSync(srcPath);
    moved.push(destPath);
  }

  return moved;
}
