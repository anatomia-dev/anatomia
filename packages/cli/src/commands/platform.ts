/**
 * Platform directory resolution helpers and agent command generation.
 *
 * Centralizes `.claude/agents` and `.claude/skills` path knowledge,
 * plus the `agentCommand()` helper that produces user-facing
 * invocation strings (`ana run build`, `ana run`, etc.).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { AnaJsonSchema } from './init/anaJsonSchema.js';

/**
 * Resolve the agents directory for the given project root.
 *
 * @param cwd - Project root directory
 * @returns Absolute path to the agents directory
 */
export function getAgentsDir(cwd: string): string {
  return path.join(cwd, '.claude', 'agents');
}

/**
 * Resolve the skills directory for the given project root.
 *
 * @param cwd - Project root directory
 * @returns Absolute path to the skills directory
 */
export function getSkillsDir(cwd: string): string {
  return path.join(cwd, '.claude', 'skills');
}

/**
 * Relative skills directory path for glob patterns.
 *
 * Used by consumers that need a cwd-relative path (e.g., globSync
 * with a `cwd` option). Returns the platform-specific relative path.
 *
 * @returns Relative path to the skills directory
 */
export function getSkillsDirRel(): string {
  return '.claude/skills';
}

/**
 * Generate a user-facing agent invocation string.
 *
 * Maps agent suffixes to `ana run` syntax:
 * - `agentCommand('build')` → `'ana run build'`
 * - `agentCommand('')` → `'ana run'` (Think agent)
 *
 * Returns plain text — callers apply chalk or backtick formatting.
 *
 * @param agentSuffix - Agent suffix (e.g. 'build', 'plan', '')
 * @returns The invocation string
 */
export function agentCommand(agentSuffix: string): string {
  if (agentSuffix === '') {
    return 'ana run';
  }
  return `ana run ${agentSuffix}`;
}

/**
 * Read platform flags for the active platform from ana.json.
 *
 * Reads `platformFlags[activePlatform]` from `.ana/ana.json` at the
 * given project root. Returns an empty array on any failure (missing
 * file, parse error, missing field) — consistent with the fail-soft
 * convention used throughout the CLI.
 *
 * @param cwd - Project root directory
 * @returns Array of flag strings for the active platform
 */
export function getPlatformFlags(cwd: string): string[] {
  try {
    const raw = fs.readFileSync(path.join(cwd, '.ana', 'ana.json'), 'utf-8');
    const parsed = AnaJsonSchema.parse(JSON.parse(raw));
    const platform = parsed.platforms?.[0] ?? 'claude';
    return parsed.platformFlags?.[platform] ?? [];
  } catch {
    return [];
  }
}
