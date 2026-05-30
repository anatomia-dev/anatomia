/**
 * Platform directory resolution helpers.
 *
 * Centralizes `.claude/agents` and `.claude/skills` path knowledge.
 * Today these return hardcoded CC paths. Scope 2 makes them
 * config-driven for multi-platform support.
 */

import * as path from 'node:path';

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
