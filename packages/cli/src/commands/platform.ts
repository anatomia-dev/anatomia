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
import { agentsDirSegmentsFor } from '../platforms/registry.js';

/**
 * Resolve the agents directory for the given project root.
 *
 * @param cwd - Project root directory
 * @param platform - Platform to resolve for ('claude' or 'codex'). Defaults to 'claude'.
 * @returns Absolute path to the agents directory
 */
export function getAgentsDir(cwd: string, platform?: string): string {
  // Route through the platform registry: the agents-dir shape is now a data
  // field on each descriptor, so a third platform resolves its dir without a
  // new branch here. Unknown / undefined platform falls back to claude's
  // segments — byte-identical to the prior `?? 'claude'` default.
  return path.join(cwd, ...agentsDirSegmentsFor(platform));
}

/**
 * Resolve the skills directory for the given project root.
 *
 * Skills live in `.ana/skills/` — one canonical location shared by all
 * platforms. Both `.claude/skills` and `.agents/skills` are symlinks
 * pointing here.
 *
 * @param cwd - Project root directory
 * @returns Absolute path to the skills directory
 */
export function getSkillsDir(cwd: string): string {
  return path.join(cwd, '.ana', 'skills');
}

/**
 * Relative skills directory path for glob patterns.
 *
 * Used by consumers that need a cwd-relative path (e.g., globSync
 * with a `cwd` option). Returns the canonical `.ana/skills` path.
 *
 * @returns Relative path to the skills directory
 */
export function getSkillsDirRel(): string {
  return '.ana/skills';
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
 * Read platform flags for a specific or active platform from ana.json.
 *
 * When `platform` is provided, reads `platformFlags[platform]` directly.
 * When omitted, reads `platformFlags[platforms[0]]` (the active platform).
 * Returns an empty array on any failure (missing file, parse error,
 * missing field) — consistent with the fail-soft convention.
 *
 * @param cwd - Project root directory
 * @param platform - Specific platform to read flags for (optional)
 * @returns Array of flag strings for the platform
 */
export function getPlatformFlags(cwd: string, platform?: string): string[] {
  try {
    const raw = fs.readFileSync(path.join(cwd, '.ana', 'ana.json'), 'utf-8');
    const parsed = AnaJsonSchema.parse(JSON.parse(raw));
    const p = platform ?? (parsed.platforms?.[0] ?? 'claude');
    return parsed.platformFlags?.[p] ?? [];
  } catch {
    return [];
  }
}
