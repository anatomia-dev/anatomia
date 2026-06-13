/**
 * ana agents — Agent dashboard and model management
 *
 * Usage:
 *   ana agents                          List agents with char counts, skills, models
 *   ana agents model                    Show current model for each agent
 *   ana agents model <agent> <model>    Set an agent's model
 *   ana agents model <agent> --default  Clear an agent's model override
 *   ana agents model --all <model>      Set model for all agents
 *   ana agents skills <agent> <list>    Set an agent's projected skills (comma-separated)
 *   ana agents skills <agent> --clear   Clear an agent's projected skills
 *
 * Exit codes:
 *   0 - Success
 *   1 - Error (agents directory not found, unknown agent)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findProjectRoot } from '../utils/validators.js';
import { getAgentsDir, getSkillsDir } from './platform.js';
import type { AgentInfo } from '../utils/agent-config.js';
import {
  parseFrontmatter,
  setFrontmatterField,
  removeFrontmatterField,
  resolveSkillCharCount,
} from '../utils/agent-config.js';

/** Known model names for "did you mean --all" hint */
const KNOWN_MODEL_NAMES = ['sonnet', 'opus', 'haiku', 'opus[1m]', 'sonnet[1m]'];

/**
 * Build enriched AgentInfo list from the agents directory.
 *
 * Reads each .md file, parses frontmatter, computes character counts
 * (template size + resolved skill file sizes). Agents without valid
 * frontmatter are skipped silently.
 *
 * @param agentsDir - Absolute path to .claude/agents
 * @param skillsDir - Absolute path to .claude/skills
 * @returns Sorted array of AgentInfo objects
 */
export function getAgentInfoList(agentsDir: string, skillsDir: string): AgentInfo[] {
  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  const agents: AgentInfo[] = [];

  for (const file of files) {
    const filePath = path.join(agentsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);

    const name = path.basename(file, '.md');
    const templateSize = fs.statSync(filePath).size;
    const skills = fm?.skills ?? [];
    const skillChars = resolveSkillCharCount(skills, skillsDir, fs.statSync.bind(fs));

    agents.push({
      name,
      model: fm?.model ?? null,
      description: fm?.description ?? '',
      skills,
      charCount: templateSize + skillChars,
      skillCount: skills.length,
    });
  }

  agents.sort((a, b) => a.name.localeCompare(b.name));
  return agents;
}

/**
 * Format a number with locale-appropriate thousand separators.
 *
 * @param n - Number to format
 * @returns Formatted string (e.g., "14,883")
 */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * List all agents with character counts, skill counts, and model info.
 *
 * @throws Error when agents directory is missing
 */
export function listAgents(): void {
  const root = findProjectRoot();
  const agentsDir = getAgentsDir(root);
  const skillsDir = getSkillsDir(root);

  if (!fs.existsSync(agentsDir)) {
    throw new Error('No agents directory found. Run `ana init` first.');
  }

  const agents = getAgentInfoList(agentsDir, skillsDir);

  if (agents.length === 0) {
    console.log(chalk.bold('Agents:'));
    console.log(chalk.dim('  (none)'));
    return;
  }

  // Determine if models are uniform or mixed
  const models = agents.map(a => a.model ?? '(default)');
  const uniqueModels = new Set(models);
  const isUniform = uniqueModels.size === 1;

  // Compute column widths
  const maxNameLen = Math.max(...agents.map(a => a.name.length), 4);
  const maxCharsLen = Math.max(...agents.map(a => formatNumber(a.charCount).length + 6), 10); // " chars"
  const maxSkillLen = Math.max(...agents.map(a => {
    const label = a.skillCount === 1 ? '1 skill' : `${a.skillCount} skills`;
    return label.length;
  }), 8);
  const maxModelLen = Math.max(...models.map(m => m.length), 7);

  console.log(chalk.bold('Agents:'));
  console.log('');

  for (const agent of agents) {
    const namePart = chalk.cyan(agent.name.padEnd(maxNameLen));
    const charsPart = `${formatNumber(agent.charCount)} chars`.padEnd(maxCharsLen);
    const skillLabel = agent.skillCount === 1 ? '1 skill' : `${agent.skillCount} skills`;
    const skillPart = skillLabel.padEnd(maxSkillLen);

    if (isUniform) {
      const desc = agent.description ? truncate(agent.description, 60) : '';
      console.log(`  ${namePart}  ${charsPart}  ${skillPart}  ${desc}`);
    } else {
      const modelDisplay = agent.model ?? '(default)';
      const modelPart = modelDisplay.padEnd(maxModelLen);
      const desc = agent.description ? truncate(agent.description, 50) : '';
      console.log(`  ${namePart}  ${charsPart}  ${skillPart}  ${chalk.gray(modelPart)}  ${desc}`);
    }
  }

  console.log('');
  if (isUniform) {
    const sharedModel = models[0] ?? '(default)';
    console.log(`  Model: ${sharedModel}`);
  } else {
    console.log('  Models: mixed (overrides shown inline)');
  }
}

/**
 * Truncate a string to a maximum length, adding ellipsis if needed.
 *
 * @param s - String to truncate
 * @param maxLen - Maximum length
 * @returns Truncated string
 */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

/**
 * Show current model for each agent.
 *
 * @param agentsDir - Absolute path to .claude/agents
 * @param skillsDir - Absolute path to .claude/skills
 */
function showModels(agentsDir: string, skillsDir: string): void {
  const agents = getAgentInfoList(agentsDir, skillsDir);

  if (agents.length === 0) {
    console.log(chalk.bold('Agent models:'));
    console.log(chalk.dim('  (none)'));
    return;
  }

  const maxNameLen = Math.max(...agents.map(a => a.name.length), 4);

  console.log(chalk.bold('Agent models:'));
  console.log('');

  for (const agent of agents) {
    const namePart = chalk.cyan(agent.name.padEnd(maxNameLen));
    const modelDisplay = agent.model ?? '(default)';
    console.log(`  ${namePart}  ${modelDisplay}`);
  }
}

/**
 * Set model for a single agent.
 *
 * @param agentsDir - Absolute path to .claude/agents
 * @param agentName - Agent filename stem
 * @param model - Model value to set
 */
function setModel(agentsDir: string, agentName: string, model: string): void {
  const filePath = path.join(agentsDir, `${agentName}.md`);

  if (!fs.existsSync(filePath)) {
    const available = getAvailableAgentNames(agentsDir);
    const hint = KNOWN_MODEL_NAMES.includes(agentName.toLowerCase())
      ? `\nDid you mean: ana agents model --all ${agentName}`
      : '';
    throw new Error(`Unknown agent '${agentName}'\nAvailable agents: ${available.join(', ')}${hint}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const result = setFrontmatterField(content, 'model', model);

  if (result === null) {
    console.error(`Warning: ${agentName}.md has no frontmatter block — skipped`);
    return;
  }

  fs.writeFileSync(filePath, result, 'utf-8');
  console.log(`Set ${agentName} model to ${model}`);
}

/**
 * Clear model for a single agent (revert to default).
 *
 * @param agentsDir - Absolute path to .claude/agents
 * @param agentName - Agent filename stem
 */
function clearModel(agentsDir: string, agentName: string): void {
  const filePath = path.join(agentsDir, `${agentName}.md`);

  if (!fs.existsSync(filePath)) {
    const available = getAvailableAgentNames(agentsDir);
    console.error(`Unknown agent '${agentName}'`);
    console.error(`Available agents: ${available.join(', ')}`);
    throw new Error(`Unknown agent '${agentName}'`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const fm = parseFrontmatter(content);

  if (!fm?.model) {
    console.log(`${agentName} already uses default model`);
    return;
  }

  const result = removeFrontmatterField(content, 'model');
  if (result === null) {
    console.error(`Warning: ${agentName}.md has no frontmatter block — skipped`);
    return;
  }

  fs.writeFileSync(filePath, result, 'utf-8');
  console.log(`Cleared ${agentName} model (will use default)`);
}

/**
 * Set model for all agents.
 *
 * Skips files with corrupt/missing frontmatter with a warning.
 *
 * @param agentsDir - Absolute path to .claude/agents
 * @param model - Model value to set
 */
function setModelAll(agentsDir: string, model: string): void {
  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  let updated = 0;

  for (const file of files) {
    const filePath = path.join(agentsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = setFrontmatterField(content, 'model', model);

    if (result === null) {
      const name = path.basename(file, '.md');
      console.error(`Warning: ${name}.md has no frontmatter block — skipped`);
      continue;
    }

    fs.writeFileSync(filePath, result, 'utf-8');
    updated++;
  }

  console.log(`Set model to ${model} for ${updated} agents`);
}

/**
 * Get sorted list of available agent names from the agents directory.
 *
 * @param agentsDir - Absolute path to .claude/agents
 * @returns Sorted array of agent name strings (filename stems)
 */
function getAvailableAgentNames(agentsDir: string): string[] {
  return fs.readdirSync(agentsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.basename(f, '.md'))
    .sort();
}

/**
 * Read ana.json as a raw object from the project root.
 *
 * @param root - Project root directory
 * @returns The parsed ana.json object
 * @throws Error when ana.json is missing or invalid JSON
 */
function readAnaJson(root: string): Record<string, unknown> {
  const configPath = path.join(root, '.ana', 'ana.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('No ana.json found. Run `ana init` first.');
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
}

/**
 * Write ana.json back to the project root (2-space indent, trailing newline).
 *
 * @param root - Project root directory
 * @param config - The config object to serialize
 */
function writeAnaJson(root: string, config: Record<string, unknown>): void {
  const configPath = path.join(root, '.ana', 'ana.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Parse a comma-separated skills list into an ordered, deduplicated array.
 *
 * Whitespace around each entry is trimmed and empty entries dropped, so
 * `"git-workflow, api-patterns"` and `"git-workflow,api-patterns"` both yield
 * `['git-workflow', 'api-patterns']`.
 *
 * @param list - The raw comma-separated argument
 * @returns Ordered, deduplicated skill names
 */
function parseSkillsList(list: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list.split(',')) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * Set a single agent's projected skills in ana.json (`agents.<agent>.skills`).
 *
 * Writes the list into ana.json so it is projected into both the Claude
 * frontmatter and the Codex `.agent.toml` + `## Skills` block on the next init,
 * and — because ana.json survives re-init — re-projected on every subsequent
 * re-init (no revert). Validates the agent against the live agents directory.
 *
 * @param root - Project root directory
 * @param agentsDir - Absolute path to .claude/agents
 * @param agentName - Agent filename stem
 * @param skills - Ordered, deduplicated skill names
 */
function setAgentSkills(root: string, agentsDir: string, agentName: string, skills: string[]): void {
  if (!fs.existsSync(path.join(agentsDir, `${agentName}.md`))) {
    const available = getAvailableAgentNames(agentsDir);
    throw new Error(`Unknown agent '${agentName}'\nAvailable agents: ${available.join(', ')}`);
  }

  const config = readAnaJson(root);
  const agents = (typeof config['agents'] === 'object' && config['agents'] !== null && !Array.isArray(config['agents']))
    ? (config['agents'] as Record<string, unknown>)
    : {};
  const entry = (typeof agents[agentName] === 'object' && agents[agentName] !== null && !Array.isArray(agents[agentName]))
    ? (agents[agentName] as Record<string, unknown>)
    : {};

  entry['skills'] = skills;
  agents[agentName] = entry;
  config['agents'] = agents;
  writeAnaJson(root, config);

  console.log(`Set ${agentName} skills to [${skills.join(', ')}]`);
  console.log(chalk.dim('Run `ana init` to project the change into your agent files.'));
}

/**
 * Clear a single agent's projected skills in ana.json.
 *
 * Removes the `skills` key from `agents.<agent>` (pruning the now-empty agent
 * entry, then the now-empty `agents` map, so absent stays absent). On the next
 * init the agent's `skills` reverts to stock.
 *
 * @param root - Project root directory
 * @param agentsDir - Absolute path to .claude/agents
 * @param agentName - Agent filename stem
 */
function clearAgentSkills(root: string, agentsDir: string, agentName: string): void {
  if (!fs.existsSync(path.join(agentsDir, `${agentName}.md`))) {
    const available = getAvailableAgentNames(agentsDir);
    throw new Error(`Unknown agent '${agentName}'\nAvailable agents: ${available.join(', ')}`);
  }

  const config = readAnaJson(root);
  const agents = (typeof config['agents'] === 'object' && config['agents'] !== null && !Array.isArray(config['agents']))
    ? (config['agents'] as Record<string, unknown>)
    : null;
  const entry = (agents && typeof agents[agentName] === 'object' && agents[agentName] !== null && !Array.isArray(agents[agentName]))
    ? (agents[agentName] as Record<string, unknown>)
    : null;

  if (!entry || entry['skills'] === undefined) {
    console.log(`${agentName} has no projected skills`);
    return;
  }

  delete entry['skills'];
  // Prune now-empty entry, then a now-empty agents map, so absent stays absent.
  if (Object.keys(entry).length === 0) {
    delete agents![agentName];
  }
  if (Object.keys(agents!).length === 0) {
    delete config['agents'];
  }
  writeAnaJson(root, config);

  console.log(`Cleared ${agentName} skills (will use stock on next init)`);
  console.log(chalk.dim('Run `ana init` to project the change into your agent files.'));
}

/**
 * Register agents command with the CLI.
 *
 * Parent command `agents` lists agent dashboard. Subcommand `model`
 * manages per-agent model configuration.
 *
 * @param program - Commander program instance
 */
export function registerAgentsCommand(program: Command): void {
  const agentsCommand = new Command('agents')
    .description('Agent dashboard — list agents, manage models')
    .action(() => {
      try {
        listAgents();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exitCode = 1;
      }
    });

  const modelCommand = new Command('model')
    .description('Show or set agent model overrides')
    .argument('[agent]', 'Agent name (filename stem)')
    .argument('[model]', 'Model to set')
    .option('--default', 'Clear model override (use default)')
    .option('--all', 'Apply to all agents')
    .action((agent: string | undefined, model: string | undefined, options: { default?: boolean; all?: boolean }) => {
      try {
        const root = findProjectRoot();
        const agentsDir = getAgentsDir(root);
        const skillsDir = getSkillsDir(root);

        if (!fs.existsSync(agentsDir)) {
          throw new Error('No agents directory found. Run `ana init` first.');
        }

        // ana agents model --all <model>
        if (options.all) {
          const allModel = agent ?? model;
          if (!allModel) {
            console.error('Usage: ana agents model --all <model>');
            process.exitCode = 1;
            return;
          }
          setModelAll(agentsDir, allModel);
          return;
        }

        // ana agents model (no args) — show all models
        if (!agent) {
          showModels(agentsDir, skillsDir);
          return;
        }

        // ana agents model <agent> --default — clear model
        if (options.default) {
          clearModel(agentsDir, agent);
          return;
        }

        // ana agents model <agent> <model> — set model
        if (model) {
          setModel(agentsDir, agent, model);
          return;
        }

        // ana agents model <agent> — missing model argument
        // Could be a typo: `ana agents model sonnet` (missing agent name)
        const available = getAvailableAgentNames(agentsDir);
        if (!available.includes(agent)) {
          console.error(`Unknown agent '${agent}'`);
          console.error(`Available agents: ${available.join(', ')}`);
          if (KNOWN_MODEL_NAMES.includes(agent.toLowerCase())) {
            console.error('');
            console.error(`Did you mean: ana agents model --all ${agent}`);
          }
          process.exitCode = 1;
          return;
        }

        // Valid agent name but no model — show that agent's model
        showModels(agentsDir, skillsDir);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exitCode = 1;
      }
    });

  const skillsCommand = new Command('skills')
    .description('Set or clear an agent\'s projected skills (written to ana.json)')
    .argument('<agent>', 'Agent name (filename stem)')
    .argument('[list]', 'Comma-separated skill names (e.g. git-workflow,api-patterns)')
    .option('--clear', 'Clear the agent\'s projected skills')
    .action((agent: string, list: string | undefined, options: { clear?: boolean }) => {
      try {
        const root = findProjectRoot();
        const agentsDir = getAgentsDir(root);

        if (!fs.existsSync(agentsDir)) {
          throw new Error('No agents directory found. Run `ana init` first.');
        }

        // ana agents skills <agent> --clear
        if (options.clear) {
          clearAgentSkills(root, agentsDir, agent);
          return;
        }

        // ana agents skills <agent> <list>
        if (list === undefined) {
          console.error('Usage: ana agents skills <agent> <list>  |  ana agents skills <agent> --clear');
          process.exitCode = 1;
          return;
        }

        setAgentSkills(root, agentsDir, agent, parseSkillsList(list));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exitCode = 1;
      }
    });

  agentsCommand.addCommand(modelCommand);
  agentsCommand.addCommand(skillsCommand);
  program.addCommand(agentsCommand);
}
