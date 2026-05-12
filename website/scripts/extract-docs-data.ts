/**
 * Docs data extraction script.
 *
 * Reads 7 data sources from the monorepo, writes 7 JSON files to
 * website/data/docs/, and exits non-zero on any failure so next build
 * never runs against stale or missing data.
 *
 * Usage: npx tsx scripts/extract-docs-data.ts
 * Wired as: "prebuild": "tsx scripts/extract-docs-data.ts" in package.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

import type {
  ProofEntry,
  AgentTemplate,
  SkillTemplate,
  CommandGroup,
  CommandsData,
  CommandOption,
  CommandArgument,
  Command,
  GotchaEntry,
  ContextFile,
  BuildMeta,
} from '../lib/docs-data/types';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const WEBSITE_DIR = path.resolve(__dirname, '..');
const MONOREPO_ROOT = path.resolve(WEBSITE_DIR, '..');
const CLI_PKG = path.join(MONOREPO_ROOT, 'packages', 'cli');
const OUTPUT_DIR = path.join(WEBSITE_DIR, 'data', 'docs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeJSON(filename: string, data: unknown): void {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`  ✓ ${filename}`);
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string | string[] | null>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatter: Record<string, string | string[] | null> = {};
  for (const line of match[1].split('\n')) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (!kvMatch) continue;
    const [, key, rawValue] = kvMatch;
    let value: string | string[] | null = rawValue;

    // Handle YAML array syntax: [item1, item2]
    const arrayMatch = rawValue.match(/^\[(.+)\]$/);
    if (arrayMatch) {
      value = arrayMatch[1].split(',').map(s => s.trim());
    } else {
      // Strip surrounding quotes
      value = rawValue.replace(/^"(.*)"$/, '$1');
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body: match[2] };
}

// ---------------------------------------------------------------------------
// 1. Proof chain extraction
// ---------------------------------------------------------------------------

function categorizeEntry(entry: { modules_touched?: string[]; scope_summary?: string }): string {
  const modules = entry.modules_touched;
  if (modules && modules.length > 0) {
    const prefixMap: [string, string][] = [
      ['src/engine/', 'Engine'],
      ['src/commands/', 'Commands'],
      ['src/utils/', 'Utils'],
      ['src/data/', 'Utils'],
      ['templates/', 'Templates'],
      ['website/', 'Website'],
      ['.ana/', 'Pipeline'],
      ['.claude/', 'Pipeline'],
    ];

    // Find the dominant category
    const categoryCounts: Record<string, number> = {};
    for (const mod of modules) {
      for (const [prefix, category] of prefixMap) {
        if (mod.includes(prefix)) {
          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
          break;
        }
      }
    }

    const categories = Object.entries(categoryCounts);
    if (categories.length > 0) {
      categories.sort((a, b) => b[1] - a[1]);
      return categories[0][0];
    }
  }

  // Keyword fallback on scope_summary
  const summary = (entry.scope_summary || '').toLowerCase();
  if (summary.match(/scan|detect/)) return 'Engine';
  if (summary.match(/command|cli/)) return 'Commands';
  if (summary.match(/proof|verify|pipeline/)) return 'Pipeline';
  if (summary.match(/template/)) return 'Templates';
  if (summary.match(/website|docs/)) return 'Website';

  return 'Infra';
}

function extractProofEntries(): ProofEntry[] {
  const chainPath = path.join(MONOREPO_ROOT, '.ana', 'proof_chain.json');
  const raw = JSON.parse(fs.readFileSync(chainPath, 'utf-8'));
  const entries: unknown[] = raw.entries;

  return entries.map((entry: any) => ({
    slug: entry.slug,
    feature: entry.feature,
    result: entry.result,
    stage: categorizeEntry(entry),
    contract: {
      total: entry.contract?.total ?? 0,
      satisfied: entry.contract?.satisfied ?? 0,
    },
    assertionCount: entry.contract?.total ?? 0,
    findingCount: (entry.findings || []).length,
    completedAt: entry.completed_at || '',
    scopeSummary: entry.scope_summary || null,
    modulesTouched: entry.modules_touched || [],
  }));
}

// ---------------------------------------------------------------------------
// 2. CLI commands extraction
// ---------------------------------------------------------------------------

function extractDetailsFromBlock(block: string): { description: string; arguments: CommandArgument[]; options: CommandOption[] } {
  const descMatch = block.match(/\.description\(\s*['"`]([\s\S]*?)['"`]\s*\)/);
  const description = descMatch ? descMatch[1].replace(/\n\s*/g, ' ') : '';

  const args: CommandArgument[] = [];
  const argRegex = /\.argument\(\s*['"]([<\[][^>\]]+[>\]])['"]\s*,\s*['"]([^'"]*)['"]/g;
  let argMatch;
  while ((argMatch = argRegex.exec(block)) !== null) {
    const raw = argMatch[1];
    const required = raw.startsWith('<');
    const name = raw.replace(/[<>\[\]]/g, '').replace(/\.{3}$/, '');
    args.push({ name, description: argMatch[2], required });
  }

  const options: CommandOption[] = [];
  const optRegex = /\.option\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/g;
  let optMatch;
  while ((optMatch = optRegex.exec(block)) !== null) {
    options.push({ flags: optMatch[1], description: optMatch[2] });
  }

  return { description, arguments: args, options };
}

function buildCommandTree(filePath: string): Command[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileDir = path.dirname(filePath);
  const commands: Map<string, Command> = new Map();
  const varToName: Map<string, string> = new Map();

  // First pass: find all `const X = new Command('name')` declarations
  const declRegex = /const\s+(\w+)\s*=\s*new Command\(['"]([^'"]+)['"]\)/g;
  let declMatch;
  while ((declMatch = declRegex.exec(content)) !== null) {
    varToName.set(declMatch[1], declMatch[2]);
  }

  // Also handle `return new Command('name')` (used in check.ts, symbol-index.ts)
  const returnDeclRegex = /return new Command\(['"]([^'"]+)['"]\)/g;
  let returnMatch;
  while ((returnMatch = returnDeclRegex.exec(content)) !== null) {
    // These are standalone — treat as top-level
    varToName.set(`__return_${returnMatch[1]}`, returnMatch[1]);
  }

  // Second pass: extract each command's chain details
  const lines = content.split('\n');
  for (const [varName, cmdName] of varToName) {
    // Find the line where this command is declared
    let startLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (varName.startsWith('__return_')) {
        if (lines[i].includes(`return new Command('${cmdName}')`) || lines[i].includes(`return new Command("${cmdName}")`)) {
          startLine = i;
          break;
        }
      } else if (lines[i].includes(`const ${varName}`) && lines[i].includes('new Command')) {
        startLine = i;
        break;
      }
    }
    if (startLine === -1) continue;

    // Collect the chain until .action( or next const ... = new Command or semicolon
    let block = '';
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      if (i > startLine && line.match(/\.action\s*\(/)) break;
      if (i > startLine && line.match(/^\s*const\s+\w+\s*=\s*new Command/)) break;
      // Stop at addCommand or standalone method calls on a different variable
      if (i > startLine && line.match(/^\s*\w+Command\.addCommand/)) break;
      if (i > startLine && line.match(/^\s*\w+Command\s*$/) && i + 1 < lines.length && lines[i + 1].match(/^\s*\.command\(/)) break;
      block += line + '\n';
      // If the line ends with semicolon and we have content, stop
      if (i > startLine && line.match(/;\s*$/)) break;
    }

    const details = extractDetailsFromBlock(block);
    commands.set(cmdName, {
      name: cmdName,
      ...details,
      subcommands: [],
    });
  }

  // Third pass: handle `.command('name')` chain pattern (multiline)
  // e.g., verifyCommand\n    .command('pre-check')\n    .description('...')
  // Collapse whitespace to match multiline chains
  const collapsed = content.replace(/\n\s*/g, ' ');
  const chainRegex = /(\w+)\s*\.command\(\s*['"]([^'"]+)['"]\)/g;
  let chainMatch;
  while ((chainMatch = chainRegex.exec(collapsed)) !== null) {
    const parentVar = chainMatch[1];
    const childName = chainMatch[2];
    const parentName = varToName.get(parentVar);
    if (!parentName) continue;

    // Extract the chain from the match point to the next .action(
    const rest = collapsed.substring(chainMatch.index);
    const actionIdx = rest.indexOf('.action(');
    const chainBlock = actionIdx !== -1 ? rest.substring(0, actionIdx) : rest.substring(0, 300);

    const details = extractDetailsFromBlock(chainBlock);
    const childCmd: Command = { name: childName, ...details, subcommands: [] };

    const parent = commands.get(parentName);
    if (parent) {
      if (!parent.subcommands.find(s => s.name === childName)) {
        parent.subcommands.push(childCmd);
      }
    }
  }

  // Fourth pass: wire addCommand relationships for same-file commands
  const addCommandVarRegex = /(\w+)\.addCommand\((\w+)\b/g;
  let addMatch;
  while ((addMatch = addCommandVarRegex.exec(content)) !== null) {
    const parentVar = addMatch[1];
    const childVar = addMatch[2];
    if (parentVar === 'program') continue;

    const parentName = varToName.get(parentVar);
    const childName = varToName.get(childVar);
    if (!parentName || !childName) continue;

    const parent = commands.get(parentName);
    const child = commands.get(childName);
    if (parent && child && !parent.subcommands.find(s => s.name === child.name)) {
      parent.subcommands.push(child);
    }
  }

  // Fifth pass: handle cross-file addCommand with function calls
  // e.g., setupCommand.addCommand(createCheckCommand())
  const addCommandFuncRegex = /(\w+)\.addCommand\(\s*(create\w+)\(\)/g;
  let funcMatch;
  while ((funcMatch = addCommandFuncRegex.exec(content)) !== null) {
    const parentVar = funcMatch[1];
    const funcName = funcMatch[2];
    if (parentVar === 'program') continue;

    const parentName = varToName.get(parentVar);
    if (!parentName) continue;

    // Find the import for this function
    const importRegex = new RegExp(`import\\s*\\{[^}]*\\b${funcName}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"']`);
    const importMatch = content.match(importRegex);
    if (!importMatch) continue;

    // Resolve the import path to a .ts file
    let importPath = importMatch[1];
    if (importPath.endsWith('.js')) {
      importPath = importPath.replace(/\.js$/, '.ts');
    }
    const resolvedPath = path.resolve(fileDir, importPath);

    if (fs.existsSync(resolvedPath)) {
      // Parse the imported file for `return new Command(...)` pattern
      const importedContent = fs.readFileSync(resolvedPath, 'utf-8');
      const returnCmdMatch = importedContent.match(/return new Command\(['"]([^'"]+)['"]\)/);
      if (returnCmdMatch) {
        const childName = returnCmdMatch[1];
        // Extract the chain from the return statement
        const importedLines = importedContent.split('\n');
        const returnLine = importedLines.findIndex(l => l.includes(`return new Command('${childName}')`) || l.includes(`return new Command("${childName}")`));
        if (returnLine !== -1) {
          let block = '';
          for (let i = returnLine; i < importedLines.length; i++) {
            const line = importedLines[i];
            if (i > returnLine && line.match(/\.action\s*\(/)) break;
            block += line + '\n';
            if (i > returnLine && line.match(/;\s*$/)) break;
          }
          const details = extractDetailsFromBlock(block);
          const childCmd: Command = { name: childName, ...details, subcommands: [] };

          const parent = commands.get(parentName);
          if (parent && !parent.subcommands.find(s => s.name === childName)) {
            parent.subcommands.push(childCmd);
          }
        }
      }
    }
  }

  // Return only top-level commands (those added to program, not nested)
  const childNames = new Set<string>();
  for (const cmd of commands.values()) {
    for (const sub of cmd.subcommands) {
      childNames.add(sub.name);
    }
  }

  return Array.from(commands.values()).filter(cmd => !childNames.has(cmd.name));
}

function extractCommands(): CommandsData {
  // Read index.ts to get group structure
  const indexPath = path.join(CLI_PKG, 'src', 'index.ts');
  const indexContent = fs.readFileSync(indexPath, 'utf-8');

  // Extract group names and their command registrations
  const groups: CommandGroup[] = [];
  const groupRegex = /program\.commandsGroup\(['"]([^'"]+)['"]\);/g;
  let groupMatch;
  const groupPositions: { name: string; pos: number }[] = [];

  while ((groupMatch = groupRegex.exec(indexContent)) !== null) {
    groupPositions.push({ name: groupMatch[1], pos: groupMatch.index });
  }

  // Find register calls and their positions
  const registerRegex = /register(\w+)Command\(program\);/g;
  let regMatch;
  const registrations: { funcName: string; pos: number }[] = [];

  while ((regMatch = registerRegex.exec(indexContent)) !== null) {
    registrations.push({ funcName: regMatch[1], pos: regMatch.index });
  }

  // Map function names to file paths
  const funcToFile: Record<string, string> = {
    Scan: 'src/commands/scan.ts',
    Init: 'src/commands/init/index.ts',
    Setup: 'src/commands/setup.ts',
    Work: 'src/commands/work.ts',
    Artifact: 'src/commands/artifact.ts',
    Verify: 'src/commands/verify.ts',
    Pr: 'src/commands/pr.ts',
    Config: 'src/commands/config.ts',
    Proof: 'src/commands/proof.ts',
    Agents: 'src/commands/agents.ts',
  };

  // Assign registrations to groups
  for (let gi = 0; gi < groupPositions.length; gi++) {
    const group = groupPositions[gi];
    const nextGroupPos = gi + 1 < groupPositions.length ? groupPositions[gi + 1].pos : Infinity;

    const groupCommands: Command[] = [];
    for (const reg of registrations) {
      if (reg.pos > group.pos && reg.pos < nextGroupPos) {
        const filePath = funcToFile[reg.funcName];
        if (filePath) {
          const fullPath = path.join(CLI_PKG, filePath);
          const cmds = buildCommandTree(fullPath);
          groupCommands.push(...cmds);
        }
      }
    }

    groups.push({ name: group.name, commands: groupCommands });
  }

  // Count total commands (including subcommands)
  let totalCommands = 0;
  function countCommands(cmds: Command[]): void {
    for (const cmd of cmds) {
      totalCommands++;
      countCommands(cmd.subcommands);
    }
  }
  for (const group of groups) {
    countCommands(group.commands);
  }

  return { groups, totalCommands };
}

// ---------------------------------------------------------------------------
// 3. Agent templates extraction
// ---------------------------------------------------------------------------

const AGENT_READS_WRITES: Record<string, { reads: string[]; writes: string[] }> = {
  ana: { reads: ['codebase', '.ana/context/*', '.ana/scan.json'], writes: ['scope.md'] },
  'ana-plan': { reads: ['scope.md', 'codebase'], writes: ['plan.md', 'spec.md', 'contract.yaml'] },
  'ana-build': { reads: ['spec.md', 'contract.yaml'], writes: ['code', 'tests', 'build_report.md'] },
  'ana-verify': { reads: ['spec.md', 'contract.yaml', 'code', 'tests'], writes: ['verify_report.md'] },
  'ana-learn': { reads: ['proof_chain.json', 'skills', 'codebase'], writes: ['skill rules', 'finding closures'] },
  'ana-setup': { reads: ['scan.json', 'codebase'], writes: ['project-context.md', 'design-principles.md'] },
};

function extractForbidden(body: string): string[] {
  const forbidden: string[] = [];
  const sectionMatch = body.match(/## What You Do NOT Do\s*\n([\s\S]*?)(?=\n---|\n## |$)/);
  if (!sectionMatch) return forbidden;

  const lines = sectionMatch[1].split('\n');
  for (const line of lines) {
    const bulletMatch = line.match(/^-\s+\*\*(.+?)\*\*/);
    if (bulletMatch) {
      // Strip trailing punctuation artifacts
      forbidden.push(bulletMatch[1].replace(/\*+$/, '').trim());
    }
  }

  return forbidden;
}

function extractAgentTemplates(): AgentTemplate[] {
  const agentsDir = path.join(CLI_PKG, 'templates', '.claude', 'agents');
  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).sort();

  return files.map(file => {
    const content = fs.readFileSync(path.join(agentsDir, file), 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);
    const name = (frontmatter.name as string) || file.replace('.md', '');
    const readsWrites = AGENT_READS_WRITES[name] || { reads: [], writes: [] };

    // Parse skills — could be array or null
    let skills: string[] | null = null;
    if (frontmatter.skills) {
      skills = Array.isArray(frontmatter.skills) ? frontmatter.skills : [frontmatter.skills as string];
    }

    return {
      name,
      model: (frontmatter.model as string) || '',
      description: (frontmatter.description as string) || '',
      skills,
      memory: (frontmatter.memory as string) || null,
      initialPrompt: (frontmatter.initialPrompt as string) || null,
      reads: readsWrites.reads,
      writes: readsWrites.writes,
      forbidden: extractForbidden(body),
      bodyMarkdown: body.trim(),
    };
  });
}

// ---------------------------------------------------------------------------
// 4. Skill templates extraction
// ---------------------------------------------------------------------------

function extractSkillTemplates(): SkillTemplate[] {
  const skillsDir = path.join(CLI_PKG, 'templates', '.claude', 'skills');
  const skillDirs = fs.readdirSync(skillsDir).filter(d => {
    const skillFile = path.join(skillsDir, d, 'SKILL.md');
    return fs.existsSync(skillFile);
  }).sort();

  return skillDirs.map(dir => {
    const content = fs.readFileSync(path.join(skillsDir, dir, 'SKILL.md'), 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    // Parse sections: find ## headings and their content
    const sections: { heading: string; content: string }[] = [];
    const sectionRegex = /^## (.+)$/gm;
    let match;
    const sectionPositions: { heading: string; start: number }[] = [];

    while ((match = sectionRegex.exec(body)) !== null) {
      sectionPositions.push({ heading: match[1], start: match.index + match[0].length });
    }

    for (let i = 0; i < sectionPositions.length; i++) {
      const start = sectionPositions[i].start;
      const end = i + 1 < sectionPositions.length
        ? body.lastIndexOf('\n## ', sectionPositions[i + 1].start)
        : body.length;
      const content = body.substring(start, end).trim();
      sections.push({ heading: sectionPositions[i].heading, content });
    }

    return {
      name: (frontmatter.name as string) || dir,
      description: (frontmatter.description as string) || '',
      sections,
    };
  });
}

// ---------------------------------------------------------------------------
// 5. Gotchas extraction
// ---------------------------------------------------------------------------

async function extractGotchas(): Promise<GotchaEntry[]> {
  // Import gotchas.ts directly — it's a pure data file with zero external dependencies.
  // We're running under tsx, so .ts imports work.
  const gotchasModule = await import(path.join(CLI_PKG, 'src', 'data', 'gotchas.ts'));
  return gotchasModule.GOTCHAS;
}

// ---------------------------------------------------------------------------
// 6. Context files extraction
// ---------------------------------------------------------------------------

function extractContextFiles(): ContextFile[] {
  const contextDir = path.join(MONOREPO_ROOT, '.ana', 'context');
  const files = ['project-context.md', 'design-principles.md'];

  return files.map(filename => {
    const content = fs.readFileSync(path.join(contextDir, filename), 'utf-8');
    const name = filename.replace('.md', '');
    return { name, filename, content };
  });
}

// ---------------------------------------------------------------------------
// 7. Build meta extraction
// ---------------------------------------------------------------------------

function extractBuildMeta(): BuildMeta {
  const cliPkg = JSON.parse(fs.readFileSync(path.join(CLI_PKG, 'package.json'), 'utf-8'));
  const version = cliPkg.version;

  let commitSha = process.env.VERCEL_GIT_COMMIT_SHA || '';
  if (!commitSha) {
    try {
      commitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    } catch {
      commitSha = 'unknown';
    }
  }

  return {
    version,
    commitSha,
    buildTimestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Extracting docs data...\n');

  // Clean output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Extract all data sources
  const proofEntries = extractProofEntries();
  writeJSON('proof-entries.json', proofEntries);

  const commands = extractCommands();
  writeJSON('commands.json', commands);

  const agentTemplates = extractAgentTemplates();
  writeJSON('agent-templates.json', agentTemplates);

  const skillTemplates = extractSkillTemplates();
  writeJSON('skill-templates.json', skillTemplates);

  const gotchas = await extractGotchas();
  writeJSON('gotchas.json', gotchas);

  const contextFiles = extractContextFiles();
  writeJSON('context-files.json', contextFiles);

  const buildMeta = extractBuildMeta();
  writeJSON('build-meta.json', buildMeta);

  // Validate completeness
  const errors: string[] = [];
  if (proofEntries.length === 0) errors.push('No proof entries extracted');
  if (commands.groups.length === 0) errors.push('No command groups extracted');
  if (agentTemplates.length !== 6) errors.push(`Expected 6 agent templates, got ${agentTemplates.length}`);
  if (skillTemplates.length !== 8) errors.push(`Expected 8 skill templates, got ${skillTemplates.length}`);
  if (gotchas.length === 0) errors.push('No gotchas extracted');
  if (contextFiles.length !== 2) errors.push(`Expected 2 context files, got ${contextFiles.length}`);
  if (!buildMeta.version) errors.push('Build meta missing version');

  if (errors.length > 0) {
    console.error('\n✗ Validation failed:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(`\n✓ All 7 files extracted successfully`);
  console.log(`  Proof entries: ${proofEntries.length}`);
  console.log(`  Commands: ${commands.totalCommands} (${commands.groups.length} groups)`);
  console.log(`  Agents: ${agentTemplates.length}`);
  console.log(`  Skills: ${skillTemplates.length}`);
  console.log(`  Gotchas: ${gotchas.length}`);
  console.log(`  Context files: ${contextFiles.length}`);
  console.log(`  Version: ${buildMeta.version}`);
}

main().catch(err => {
  console.error('Extraction failed:', err);
  process.exit(1);
});
