/**
 * Manifest resolver — the spine of ultimate configurability.
 *
 * `ana.json` is the single source of truth that today's hardcoded constants
 * are the **default value of**. This module sits between the constants and
 * every consumer so that **"absent = today" is the identity function**:
 *
 *   resolveSkillManifest({}, r)  ≡  computeSkillManifest(r)
 *   resolveAgentRoster({})       ≡  the built-in 6 agents
 *   resolveAgentSkills({}, name) ≡  [] (no projected skills)
 *
 * Each resolver returns today's constant verbatim when its `ana.json` key is
 * absent — provable by the byte-identity regression tests in manifest.test.ts.
 *
 * Inputs are typed `unknown` on purpose: callers pass either a Zod-validated
 * `AnaJson` or the raw `Record<string, unknown>` read straight off disk. We
 * narrow defensively here so a malformed config falls through to the built-in
 * default rather than crashing or clobbering — the same fail-soft posture the
 * engine uses (constants.ts catch-and-default). Never throw from a resolver.
 */

import type { EngineResult } from './engine/types/engineResult.js';
import { computeSkillManifest, CORE_SKILLS, AGENT_FILES } from './constants.js';

/** Per-agent config block as it appears under `ana.json.agents.<name>`. */
interface AgentConfigEntry {
  skills?: string[];
  model?: string;
}

/** Single skill config block under `ana.json.skills.<name>`. */
interface SkillConfigEntry {
  always?: boolean;
}

/**
 * Narrow an unknown value to a plain (non-array) object record.
 *
 * @param value - Candidate value
 * @returns The value as a record, or null if it is not a plain object
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * True when `name` is safe to use verbatim as a single filesystem path
 * segment — letters, digits, `.`, `_`, `-`, and NOT `.`/`..` themselves.
 *
 * Config-supplied agent and skill names become directory/file paths during
 * init (`.ana/skills/<name>/SKILL.md`, `.claude/agents/<name>.md`). A name
 * containing a path separator — or a bare `.`/`..` (both pass the character
 * class, since `.` is allowed) — would escape the intended directory. The
 * same guard protects capability command names (assets.ts / configWarnings),
 * so this is the single source of truth all three name→path sites share, and
 * the agent/skill paths can no longer drift from the command path's rule.
 *
 * @param name - Candidate name from `ana.json` (agents/skills/commands key)
 * @returns Whether the name is a safe, non-traversing path segment
 */
export function isSafeNameSegment(name: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(name) && name !== '.' && name !== '..';
}

/**
 * Built-in agent roster — the six stock agents, base names (no `.md`).
 * Derived from `AGENT_FILES` so the roster can never drift from the files
 * that actually ship. This is the verbatim default `resolveAgentRoster({})`
 * returns when `ana.json.agents` is absent.
 */
export const BUILTIN_AGENT_ROSTER: readonly string[] = AGENT_FILES.map((f) =>
  f.replace(/\.md$/, ''),
);

/**
 * The Think core agent's base name — the always-on orchestrator (`ana`).
 *
 * This agent is load-bearing: it is the default dispatch target (`ana run` with
 * no suffix → `ANA_ROLE=ana`) and every other agent is reached through it. The
 * roster is fixed to the built-in set ({@link resolveAgentRoster}), so this
 * agent is always present; it is the empty-suffix key in {@link resolveAgentMap}.
 */
export const CORE_AGENT = 'ana';

/**
 * Read the `skills` config map off an ana.json, returning null when absent or
 * malformed (so the caller falls through to the computed manifest verbatim).
 *
 * @param anaJson - Parsed ana.json (validated or raw), or anything
 * @returns The skills record, or null when the key is absent/malformed
 */
function readSkillsConfig(anaJson: unknown): Record<string, SkillConfigEntry> | null {
  const root = asRecord(anaJson);
  if (!root) return null;
  return asRecord(root['skills']) as Record<string, SkillConfigEntry> | null;
}

/**
 * Read the `agents` config map off an ana.json, returning null when absent or
 * malformed.
 *
 * @param anaJson - Parsed ana.json (validated or raw), or anything
 * @returns The agents record, or null when the key is absent/malformed
 */
function readAgentsConfig(anaJson: unknown): Record<string, AgentConfigEntry> | null {
  const root = asRecord(anaJson);
  if (!root) return null;
  return asRecord(root['agents']) as Record<string, AgentConfigEntry> | null;
}

/**
 * Resolve the full skill manifest: the computed (scan-derived) manifest plus
 * any always-on skills declared in `ana.json.skills`.
 *
 * Identity contract: when `ana.json.skills` is absent or malformed, the result
 * is byte-identical to `computeSkillManifest(engineResult)`. Config-declared
 * always-on skills are appended after the computed set, deduplicated, with the
 * computed set winning ties (core/conditional skills are never duplicated and
 * never reordered).
 *
 * @param anaJson - Parsed ana.json (validated or raw), or anything
 * @param engineResult - Scan engine result driving the computed manifest
 * @returns Ordered skill names: computed manifest first, then config additions
 */
export function resolveSkillManifest(anaJson: unknown, engineResult: EngineResult): string[] {
  const computed = computeSkillManifest(engineResult);
  const skillsConfig = readSkillsConfig(anaJson);
  if (!skillsConfig) return computed;

  const seen = new Set(computed);
  const additions: string[] = [];
  for (const [name, entry] of Object.entries(skillsConfig)) {
    const cfg = asRecord(entry) as SkillConfigEntry | null;
    // Only `always:true` skills are unconditionally appended. A skill present
    // in the map without `always` is a trigger/custom declaration handled by
    // later slices (Slice 5); appending it here would over-scaffold.
    if (cfg?.always !== true) continue;
    // A config-declared skill name becomes a path segment at scaffold time
    // (.ana/skills/<name>/SKILL.md). Reject traversing names so a hand- or
    // tool-authored ana.json cannot write a stub outside the skills dir
    // (the warning surface flags it — see configWarnings.ts).
    if (!isSafeNameSegment(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    additions.push(name);
  }
  return [...computed, ...additions];
}

/**
 * Resolve the agent roster: the ordered list of agent base names to scaffold.
 *
 * The roster is ALWAYS the built-in {@link BUILTIN_AGENT_ROSTER} (the stock six).
 * `ana.json.agents` does NOT mutate the roster — it only PROJECTS per-agent
 * `skills`/`model` onto these built-ins ({@link resolveAgentSkills}). Adding or
 * disabling agents via config is intentionally NOT supported here: those paths
 * (custom agent templates under `.ana/agent-templates/`, `enabled:false` pruning)
 * are deferred until they can be built with full re-init durability and dispatch
 * consistency. Keeping the roster fixed makes "absent = today" trivially true and
 * removes the dispatch-suffix-collision and lost-template-on-re-init footguns.
 *
 * @returns The built-in agent base names (e.g. ['ana', 'ana-plan', ...])
 */
export function resolveAgentRoster(): string[] {
  return [...BUILTIN_AGENT_ROSTER];
}

/**
 * Resolve the `ana run` agent map: user-facing suffix → full agent name.
 *
 * Derived from the fixed {@link resolveAgentRoster}, so the map is byte-identical
 * to the prior hardcoded literal (`'' → ana`, `build → ana-build`, …). The suffix
 * is the agent's base name with the leading `ana-` stripped; the {@link CORE_AGENT}
 * (`ana`) maps from the empty suffix (the default `ana run` target).
 *
 * @returns A suffix→full-name map (the empty-string key is the Think default)
 */
export function resolveAgentMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const fullName of resolveAgentRoster()) {
    const suffix = fullName === CORE_AGENT ? '' : fullName.replace(/^ana-/, '');
    map[suffix] = fullName;
  }
  return map;
}

/**
 * Resolve the skills to project onto a single agent's frontmatter / config.
 *
 * Identity contract: when `ana.json.agents.<name>.skills` is absent or
 * malformed, the result is `[]` (no projected skills — stock behavior). When
 * present, returns the declared list deduplicated, preserving authoring order.
 *
 * @param anaJson - Parsed ana.json (validated or raw), or anything
 * @param name - Agent base name (e.g. 'ana-build')
 * @returns Deduplicated skill names to project onto the agent, or []
 */
export function resolveAgentSkills(anaJson: unknown, name: string): string[] {
  const agentsConfig = readAgentsConfig(anaJson);
  if (!agentsConfig) return [];
  const entry = asRecord(agentsConfig[name]) as AgentConfigEntry | null;
  if (!entry || !Array.isArray(entry.skills)) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const skill of entry.skills) {
    if (typeof skill !== 'string' || seen.has(skill)) continue;
    seen.add(skill);
    out.push(skill);
  }
  return out;
}

/**
 * Build the body of a minimal stub `SKILL.md` for a config-declared custom
 * skill that ships no bundled template and has no user-authored file yet.
 *
 * The stub mirrors the section structure of the bundled templates so the rest
 * of the init pipeline treats it uniformly: a machine-owned `## Detected`
 * section (refreshed on every init — a no-op for a custom skill with no
 * injector), plus human-owned `## Rules` / `## Gotchas` / `## Examples`
 * sections the user (or the setup agent) fills in. The frontmatter `name`
 * matches the directory so the harness can resolve the skill, and the
 * `description` points the user at `setup` to flesh it out.
 *
 * Pure string builder (no I/O) — lives here so the stub shape sits next to the
 * resolver that decides a custom skill is a manifest member, and so skills.ts
 * stays focused on orchestration.
 *
 * @param name - Skill directory / manifest name (e.g. 'observability')
 * @param setupCommand - Platform-appropriate setup command (e.g. 'ana run setup')
 * @returns Full SKILL.md content for the stub
 */
export function buildCustomSkillStub(name: string, setupCommand: string): string {
  return [
    '---',
    `name: ${name}`,
    `description: "Custom skill scaffolded by Anatomia. Run \`${setupCommand}\` to add project-specific guidance, or edit this file directly."`,
    '---',
    '',
    `# ${name}`,
    '',
    '## Detected',
    '<!-- Populated by scan during init. Do not edit manually. -->',
    '',
    '## Rules',
    `*Not yet configured. Run \`${setupCommand}\` to add conventions, or edit this section directly.*`,
    '',
    '## Gotchas',
    '*Not yet captured. Add as you discover them during development.*',
    '',
    '## Examples',
    '*Not yet captured. Add short snippets showing the RIGHT way.*',
    '',
  ].join('\n');
}

/** Re-export so consumers can read the core list without a second import. */
export { CORE_SKILLS };
