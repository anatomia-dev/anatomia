/**
 * ana agents — Agent dashboard and model management
 *
 * Usage:
 *   ana agents                          List agents with char counts, skills, models
 *   ana agents model                    Show current model for each agent
 *   ana agents model <agent> <model>    Set an agent's model
 *   ana agents model <agent> --default  Clear an agent's model override
 *   ana agents model --all <model>      Set model for all agents
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
  const agentsDir = path.join(root, '.claude/agents');
  const skillsDir = path.join(root, '.claude/skills');

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
      const maxModelLen = Math.max(...models.map(m => m.length), 7);
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
    console.error(`Unknown agent '${agentName}'`);
    console.error(`Available agents: ${available.join(', ')}`);

    // Hint if the agent name looks like a model name
    if (KNOWN_MODEL_NAMES.includes(agentName.toLowerCase())) {
      console.error('');
      console.error(`Did you mean: ana agents model --all ${agentName}`);
    }

    throw new Error(`Unknown agent '${agentName}'`);
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
        const agentsDir = path.join(root, '.claude/agents');
        const skillsDir = path.join(root, '.claude/skills');

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

  agentsCommand.addCommand(modelCommand);
  program.addCommand(agentsCommand);
}
